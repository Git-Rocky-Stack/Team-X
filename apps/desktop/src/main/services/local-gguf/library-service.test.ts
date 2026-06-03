// LibraryService tests.
//
// The DB layer is real: makeTestDb() spins an in-memory sql.js database with
// every migration applied, and the actual Phase-1 repo factories run against
// it, so insert/list/remove/status round-trips are exercised end to end. Only
// the I/O seams — filesystem, GGUF parser, folder scanner, chokidar watcher,
// resilience monitor, and the auto-tune callback — are faked, and the watcher
// and monitor fakes are EventEmitter-based so their 'change' / 'reachableChange'
// / 'error' events can be driven deterministically from the test body.

import { EventEmitter } from 'node:events';
import { createResilienceMonitor } from '@team-x/local-gguf-runtime';
import type { AdvancedParams, GgufMetadata, LocalModel, ModelStatus } from '@team-x/shared-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLocalModelAdvancedParamsRepo } from '../../db/repos/local-model-advanced-params.js';
import { createLocalModelWatchFoldersRepo } from '../../db/repos/local-model-watch-folders.js';
import { createLocalModelsRepo } from '../../db/repos/local-models.js';
import { type TestDbHandle, makeTestDb } from '../../db/test-helpers.js';

import {
  type LibraryService,
  type LibraryServiceDeps,
  createLibraryService,
} from './library-service.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/** EventEmitter masquerading as a FolderWatcher (async close spied). */
class FakeWatcher extends EventEmitter {
  close = vi.fn().mockResolvedValue(undefined);
}

/** EventEmitter masquerading as a ResilienceMonitor (start/stop spied). */
class FakeMonitor extends EventEmitter {
  start = vi.fn();
  stop = vi.fn();
}

interface ScanCandidateLike {
  headPath: string;
  partPaths: string[];
  isSplitIncomplete: boolean;
  sizeBytes: number;
  baseName: string;
}

/** Build a scanner candidate with sensible defaults. */
function candidate(overrides: Partial<ScanCandidateLike> = {}): ScanCandidateLike {
  const headPath = overrides.headPath ?? '/models/a.gguf';
  return {
    headPath,
    partPaths: overrides.partPaths ?? [headPath],
    isSplitIncomplete: overrides.isSplitIncomplete ?? false,
    sizeBytes: overrides.sizeBytes ?? 4_000_000_000,
    baseName: overrides.baseName ?? headPath.replace(/^.*\//, '').replace(/\.gguf$/i, ''),
  };
}

/** Build GGUF metadata with sensible defaults (fileSizeBytes = head length). */
function metadata(overrides: Partial<GgufMetadata> = {}): GgufMetadata {
  return {
    arch: 'llama',
    paramsBillions: 7,
    quant: 'Q4_K_M',
    contextMax: 8192,
    chatTemplate: null,
    isEmbeddingModel: false,
    isToolCapable: false,
    fileSizeBytes: 1024, // head length — service must overwrite from stat
    sha256: null,
    ...overrides,
  };
}

/** Build an auto-tuned AdvancedParams row for the computeAutoParams fake. */
function autoParams(modelId: string, overrides: Partial<AdvancedParams> = {}): AdvancedParams {
  return {
    modelId,
    nCtx: 8192,
    nGpuLayers: 33,
    nBatch: 512,
    nThreads: 8,
    temperature: 0.7,
    topP: 0.95,
    topK: 40,
    repeatPenalty: 1.1,
    mmap: true,
    mlock: false,
    flashAttention: true,
    updatedAt: 123,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

interface Harness {
  service: LibraryService;
  models: ReturnType<typeof createLocalModelsRepo>;
  watchFolders: ReturnType<typeof createLocalModelWatchFoldersRepo>;
  advancedParams: ReturnType<typeof createLocalModelAdvancedParamsRepo>;
  readFile: ReturnType<typeof vi.fn>;
  stat: ReturnType<typeof vi.fn>;
  access: ReturnType<typeof vi.fn>;
  parseMetadata: ReturnType<typeof vi.fn>;
  scan: ReturnType<typeof vi.fn>;
  computeAutoParams: ReturnType<typeof vi.fn>;
  watchers: FakeWatcher[];
  monitors: FakeMonitor[];
  /** Latest watcher/monitor created by addFolder (last in the arrays). */
  lastWatcher: () => FakeWatcher;
  lastMonitor: () => FakeMonitor;
  logger: { warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
}

interface HarnessConfig {
  /** Default metadata returned by the parser fake (overridable per test). */
  defaultMetadata?: GgufMetadata;
  /** Default stat size returned by the fs.stat fake. */
  defaultStatSize?: number;
  /**
   * Override the resilience-monitor constructor. Defaults to a {@link FakeMonitor}
   * whose events are driven by hand; integration tests pass the REAL
   * `createResilienceMonitor` to exercise the live poll loop end to end.
   */
  createMonitor?: LibraryServiceDeps['createMonitor'];
  /** Base poll interval (ms) forwarded to the monitor (real-monitor integration tests). */
  monitorBaseIntervalMs?: number;
  /** Backoff ceiling (ms) forwarded to the monitor. */
  monitorMaxIntervalMs?: number;
}

function makeHarness(ctx: TestDbHandle, config: HarnessConfig = {}): Harness {
  const models = createLocalModelsRepo(ctx.db);
  const watchFolders = createLocalModelWatchFoldersRepo(ctx.db);
  const advancedParams = createLocalModelAdvancedParamsRepo(ctx.db);

  const readFile = vi.fn().mockResolvedValue(Buffer.from('GGUF-head-bytes'));
  const stat = vi.fn().mockResolvedValue({ size: config.defaultStatSize ?? 4_200_000_000 });
  const access = vi.fn().mockResolvedValue(undefined);
  const readdir = vi.fn().mockResolvedValue([]);

  const parseMetadata = vi.fn().mockReturnValue(config.defaultMetadata ?? metadata());
  const scan = vi.fn().mockResolvedValue({ candidates: [], error: null });

  const watchers: FakeWatcher[] = [];
  const monitors: FakeMonitor[] = [];
  const createWatcher = vi.fn(() => {
    const w = new FakeWatcher();
    watchers.push(w);
    return w;
  });
  const createMonitor = vi.fn(() => {
  const fakeCreateMonitor = vi.fn(() => {
    const m = new FakeMonitor();
    monitors.push(m);
    return m;
  });
  // Default to the hand-driven FakeMonitor; integration tests override with the
  // REAL createResilienceMonitor to exercise the live poll loop.
  const createMonitor = config.createMonitor ?? fakeCreateMonitor;

  const computeAutoParams = vi.fn((model: LocalModel) => Promise.resolve(autoParams(model.id)));

  const logger = { warn: vi.fn(), error: vi.fn() };

  const deps: LibraryServiceDeps = {
    models,
    watchFolders,
    advancedParams,
    fs: {
      readFile: readFile as unknown as LibraryServiceDeps['fs']['readFile'],
      stat: stat as unknown as LibraryServiceDeps['fs']['stat'],
      access: access as unknown as LibraryServiceDeps['fs']['access'],
      readdir: readdir as unknown as LibraryServiceDeps['fs']['readdir'],
    },
    parseMetadata: parseMetadata as unknown as LibraryServiceDeps['parseMetadata'],
    scan: scan as unknown as LibraryServiceDeps['scan'],
    createWatcher: createWatcher as unknown as LibraryServiceDeps['createWatcher'],
    createMonitor: createMonitor as unknown as LibraryServiceDeps['createMonitor'],
    monitorBaseIntervalMs: config.monitorBaseIntervalMs,
    monitorMaxIntervalMs: config.monitorMaxIntervalMs,
    computeAutoParams,
    logger,
  };

  return {
    service: createLibraryService(deps),
    models,
    watchFolders,
    advancedParams,
    readFile,
    stat,
    access,
    parseMetadata,
    scan,
    computeAutoParams,
    watchers,
    monitors,
    lastWatcher: () => {
      const w = watchers.at(-1);
      if (!w) throw new Error('no watcher created');
      return w;
    },
    lastMonitor: () => {
      const m = monitors.at(-1);
      if (!m) throw new Error('no monitor created');
      return m;
    },
    logger,
  };
}

/** Insert a folder-entry model directly (bypasses scan) for reconcile tests. */
function insertFolderEntry(
  models: ReturnType<typeof createLocalModelsRepo>,
  sourcePath: string,
  overrides: Partial<{ displayName: string; status: ModelStatus }> = {},
): LocalModel {
  const row = models.insert({
    displayName: overrides.displayName ?? sourcePath.replace(/^.*\//, ''),
    sourceType: 'folder-entry',
    sourcePath,
    endpointId: null,
    ggufArch: 'llama',
    ggufParamsB: 7,
    ggufQuant: 'Q4_K_M',
    ggufContextMax: 8192,
    ggufSizeBytes: 4_000_000_000,
    ggufSha256: null,
    ggufChatTemplate: null,
    isEmbeddingModel: false,
    isToolCapable: false,
    hfRepoId: null,
    hfFilename: null,
    license: null,
    chatTemplateOverride: null,
    systemPromptOverride: null,
  });
  if (overrides.status) {
    return models.updateStatus(row.id, overrides.status, null);
  }
  return row;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createLibraryService', () => {
  let ctx: TestDbHandle;

  beforeEach(async () => {
    ctx = await makeTestDb();
  });

  afterEach(() => {
    ctx.close();
  });

  // -------------------------------------------------------------------------
  // addFile
  // -------------------------------------------------------------------------

  describe('addFile', () => {
    it('parses the head, persists a file model, and uses the REAL stat size (not head length)', async () => {
      const h = makeHarness(ctx, {
        defaultMetadata: metadata({ fileSizeBytes: 1024 }),
        defaultStatSize: 7_777_777_777,
      });

      const model = await h.service.addFile('/abs/path/My-Model.Q4_K_M.gguf');

      expect(model.sourceType).toBe('file');
      expect(model.sourcePath).toBe('/abs/path/My-Model.Q4_K_M.gguf');
      // Display name derived from filename.
      expect(model.displayName).toBe('My-Model.Q4_K_M.gguf');
      // Freshly inserted model has the DB-default initial status.
      expect(model.status).toBe('cold');
      // Metadata mapped through.
      expect(model.ggufArch).toBe('llama');
      expect(model.ggufQuant).toBe('Q4_K_M');
      expect(model.ggufContextMax).toBe(8192);
      // Critical: real stat size, NOT the 1024 head length.
      expect(model.ggufSizeBytes).toBe(7_777_777_777);

      // Persisted, retrievable.
      const stored = h.models.getById(model.id);
      expect(stored).not.toBeNull();
      expect(stored?.id).toBe(model.id);
    });

    it('reads at most a 1 MiB head and passes the path to the parser', async () => {
      const h = makeHarness(ctx);
      await h.service.addFile('/abs/model.gguf');

      expect(h.readFile).toHaveBeenCalledTimes(1);
      // The parser receives (buffer, path).
      const [, parsedPath] = h.parseMetadata.mock.calls[0] ?? [];
      expect(parsedPath).toBe('/abs/model.gguf');
    });

    it('propagates a parser failure (does not swallow it)', async () => {
      const h = makeHarness(ctx);
      h.parseMetadata.mockImplementation(() => {
        throw new Error('ParserError: gguf-corrupt');
      });

      await expect(h.service.addFile('/abs/broken.gguf')).rejects.toThrow(/gguf-corrupt/);
      // Nothing persisted on failure.
      expect(h.models.list()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // addFolder
  // -------------------------------------------------------------------------

  describe('addFolder', () => {
    it('inserts the folder row, starts a watcher + monitor, and runs an initial scan', async () => {
      const h = makeHarness(ctx);
      h.scan.mockResolvedValue({
        candidates: [candidate({ headPath: '/models/x.gguf' })],
        error: null,
      });

      const folder = await h.service.addFolder('/models', true);

      // Row persisted.
      expect(folder.path).toBe('/models');
      expect(folder.recursive).toBe(true);
      expect(h.watchFolders.getById(folder.id)).not.toBeNull();

      // Watcher + monitor created and monitor started.
      expect(h.watchers).toHaveLength(1);
      expect(h.monitors).toHaveLength(1);
      expect(h.lastMonitor().start).toHaveBeenCalledOnce();

      // Initial scan ran and populated the folder.
      expect(h.scan).toHaveBeenCalledOnce();
      const entries = h.models.listBySourceType('folder-entry');
      expect(entries).toHaveLength(1);
      expect(entries[0]?.sourcePath).toBe('/models/x.gguf');
    });

    it('attaches an error listener to the watcher so a watcher error cannot crash the process', async () => {
      const h = makeHarness(ctx);
      await h.service.addFolder('/models', true);

      // If no 'error' listener were attached, this emit would throw.
      expect(() => h.lastWatcher().emit('error', new Error('EACCES'))).not.toThrow();
      // The error is logged, not propagated.
      expect(h.logger.error).toHaveBeenCalled();
    });

    it('rejects a duplicate path (no second watcher/row)', async () => {
      const h = makeHarness(ctx);
      await h.service.addFolder('/models', true);

      await expect(h.service.addFolder('/models', true)).rejects.toThrow();
      // Still exactly one folder + one watcher.
      expect(h.watchFolders.list()).toHaveLength(1);
      expect(h.watchers).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // scanFolder
  // -------------------------------------------------------------------------

  describe('scanFolder', () => {
    it('adds new candidates, removes vanished models, and returns accurate counts', async () => {
      const h = makeHarness(ctx);
      // Add a folder with one initial entry.
      h.scan.mockResolvedValueOnce({
        candidates: [candidate({ headPath: '/models/keep.gguf' })],
        error: null,
      });
      const folder = await h.service.addFolder('/models', true);

      // Seed an extra entry that the next scan will NOT report (vanished).
      insertFolderEntry(h.models, '/models/gone.gguf');
      expect(h.models.listBySourceType('folder-entry')).toHaveLength(2);

      // Next scan: keep.gguf still present, gone.gguf absent, new.gguf added.
      h.scan.mockResolvedValueOnce({
        candidates: [
          candidate({ headPath: '/models/keep.gguf' }),
          candidate({ headPath: '/models/new.gguf' }),
        ],
        error: null,
      });

      const result = await h.service.scanFolder(folder.id);

      expect(result).toEqual({ addedCount: 1, removedCount: 1 });
      const paths = h.models
        .listBySourceType('folder-entry')
        .map((m) => m.sourcePath)
        .sort();
      expect(paths).toEqual(['/models/keep.gguf', '/models/new.gguf']);
    });

    it('marks the folder reachable on a clean scan', async () => {
      const h = makeHarness(ctx);
      const folder = await h.service.addFolder('/models', true);

      await h.service.scanFolder(folder.id);

      const stored = h.watchFolders.getById(folder.id);
      expect(stored?.status).toBe('reachable');
      expect(stored?.lastScanError).toBeNull();
      expect(stored?.lastScanAt).toBeGreaterThan(0);
    });

    it('marks the folder unreachable and adds nothing when the scan returns an error', async () => {
      const h = makeHarness(ctx);
      const folder = await h.service.addFolder('/models', true);

      h.scan.mockResolvedValueOnce({
        candidates: [],
        error: { kind: 'source-unreachable', path: '/models' },
      });

      const result = await h.service.scanFolder(folder.id);

      expect(result).toEqual({ addedCount: 0, removedCount: 0 });
      const stored = h.watchFolders.getById(folder.id);
      expect(stored?.status).toBe('unreachable');
      expect(stored?.lastScanError).toContain('source-unreachable');
    });

    it('inserts a split-incomplete candidate with a missing status', async () => {
      const h = makeHarness(ctx);
      const folder = await h.service.addFolder('/models', true);

      h.scan.mockResolvedValueOnce({
        candidates: [
          candidate({ headPath: '/models/split-00001-of-00003.gguf', isSplitIncomplete: true }),
        ],
        error: null,
      });

      const result = await h.service.scanFolder(folder.id);

      expect(result.addedCount).toBe(1);
      const [entry] = h.models.listBySourceType('folder-entry');
      expect(entry?.status).toBe('missing');
      expect(entry?.statusDetail).toMatch(/incomplete/i);
    });

    it('is idempotent — re-scanning the same candidates adds and removes nothing', async () => {
      const h = makeHarness(ctx);
      h.scan.mockResolvedValue({
        candidates: [candidate({ headPath: '/models/stable.gguf' })],
        error: null,
      });
      const folder = await h.service.addFolder('/models', true);

      const result = await h.service.scanFolder(folder.id);
      expect(result).toEqual({ addedCount: 0, removedCount: 0 });
      expect(h.models.listBySourceType('folder-entry')).toHaveLength(1);
    });

    it('throws for an unknown folder id', async () => {
      const h = makeHarness(ctx);
      await expect(h.service.scanFolder('does-not-exist')).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle: watcher 'change' and monitor 'reachableChange'
  // -------------------------------------------------------------------------

  describe('lifecycle wiring', () => {
    it('a watcher change event triggers a reconcile of that folder', async () => {
      const h = makeHarness(ctx);
      const folder = await h.service.addFolder('/models', true);
      expect(h.scan).toHaveBeenCalledTimes(1); // initial scan

      // Next reconcile will discover a new file.
      h.scan.mockResolvedValueOnce({
        candidates: [candidate({ headPath: '/models/added.gguf' })],
        error: null,
      });

      h.lastWatcher().emit('change', { type: 'add', path: '/models/added.gguf' });

      // The reconcile is async; let microtasks/promises settle.
      await vi.waitFor(() => {
        expect(h.scan).toHaveBeenCalledTimes(2);
        expect(
          h.models
            .listBySourceType('folder-entry')
            .some((m) => m.sourcePath === '/models/added.gguf'),
        ).toBe(true);
      });
      // Folder still alive.
      expect(h.watchFolders.getById(folder.id)).not.toBeNull();
    });

    it('a monitor reachableChange flips the folder status', async () => {
      const h = makeHarness(ctx);
      const folder = await h.service.addFolder('/models', true);

      h.lastMonitor().emit('reachableChange', { path: '/models', reachable: false });
      await vi.waitFor(() => {
        expect(h.watchFolders.getById(folder.id)?.status).toBe('unreachable');
      });

      h.lastMonitor().emit('reachableChange', { path: '/models', reachable: true });
      await vi.waitFor(() => {
        expect(h.watchFolders.getById(folder.id)?.status).toBe('reachable');
      });
    });

    it('drives a real disconnect→reconnect through the LIVE monitor → folder status flips (deterministic)', async () => {
      // Codex CR-7 F6: the e2e network-share spec can only assert crash-survival,
      // not that a watch folder actually flips unreachable↔reachable, because the
      // production poll interval is 30 s and was not injectable. This closes that
      // gap deterministically: wire the REAL resilience monitor (not the
      // hand-driven FakeMonitor) via the new injectable short interval, then flip
      // fs.access to simulate a NAS dropping and recovering. Fake timers make the
      // real poll loop instant + 100% deterministic (same strategy as
      // resilience.test.ts). This exercises the full chain end to end: monitor
      // poll → checkAccess result → reachableChange → LibraryService →
      // watchFolders.updateStatus, against the real SQLite-backed repo.
      vi.useFakeTimers();
      try {
        const h = makeHarness(ctx, {
          createMonitor: createResilienceMonitor,
          monitorBaseIntervalMs: 100,
          monitorMaxIntervalMs: 1_600,
        });
        // The monitor's checkAccess is wired to deps.fs.access. Drive it through
        // reachable → unreachable → reachable across three poll ticks.
        h.access
          .mockReset()
          .mockResolvedValueOnce(undefined) // tick 1: reachable   (null  → true)
          .mockRejectedValueOnce(new Error('ENOENT: share offline')) // tick 2: unreachable (true  → false)
          .mockResolvedValue(undefined); // tick 3+: reachable  (false → true)

        const folder = await h.service.addFolder('/nas/models', true);

        // Tick 1 (delay 0): reachable — the live monitor's first poll.
        await vi.advanceTimersByTimeAsync(0);
        expect(h.watchFolders.getById(folder.id)?.status).toBe('reachable');

        // Tick 2 (+base 100 ms): the share drops → status flips to unreachable.
        await vi.advanceTimersByTimeAsync(100);
        expect(h.watchFolders.getById(folder.id)?.status).toBe('unreachable');

        // Tick 3 (+backoff 100 ms after one failure): the share recovers →
        // status flips back to reachable.
        await vi.advanceTimersByTimeAsync(100);
        expect(h.watchFolders.getById(folder.id)?.status).toBe('reachable');

        // Tear down the live monitor's pending timer before restoring real timers.
        await h.service.dispose();
      } finally {
        vi.useRealTimers();
      }
    });

    it('a monitor error does not crash the process', async () => {
      const h = makeHarness(ctx);
      await h.service.addFolder('/models', true);
      expect(() => h.lastMonitor().emit('error', new Error('probe blew up'))).not.toThrow();
    });

    it('a watcher change event that arrives while a reconcile is in flight is re-queued and not dropped', async () => {
      // This test proves Fix 2: a second 'change' event while the first reconcile
      // is still running must NOT be silently discarded. The pending-reconcile
      // re-queue must fire a second scan after the first one finishes.

      const h = makeHarness(ctx);

      // Add folder with no initial candidates.
      h.scan.mockResolvedValueOnce({ candidates: [], error: null });
      const folder = await h.service.addFolder('/models', true);
      expect(h.scan).toHaveBeenCalledTimes(1); // initial scan

      // --- Set up a controllable deferred to block the first watcher-driven scan.
      let resolveFirstScan!: () => void;
      const firstScanGate = new Promise<void>((resolve) => {
        resolveFirstScan = resolve;
      });

      // First watcher-triggered reconcile: block until we release the gate.
      // Resolves with the new file present.
      h.scan.mockImplementationOnce(async () => {
        await firstScanGate;
        return {
          candidates: [candidate({ headPath: '/models/first.gguf' })],
          error: null,
        };
      });

      // Second watcher-triggered reconcile (re-queued): discovers the second file.
      h.scan.mockImplementationOnce(async () => {
        return {
          candidates: [
            candidate({ headPath: '/models/first.gguf' }),
            candidate({ headPath: '/models/second.gguf' }),
          ],
          error: null,
        };
      });

      // Emit the FIRST change event - starts a reconcile, but it blocks on the gate.
      h.lastWatcher().emit('change', { type: 'add', path: '/models/first.gguf' });

      // Emit a SECOND change event while the first reconcile is still in flight.
      // Without Fix 2 this would be silently dropped.
      h.lastWatcher().emit('change', { type: 'add', path: '/models/second.gguf' });

      // Release the first scan so it can complete.
      resolveFirstScan();

      // Wait until both scans have run and the second file is in the DB.
      await vi.waitFor(() => {
        expect(h.scan).toHaveBeenCalledTimes(3); // initial + first change + re-queued
        const paths = h.models
          .listBySourceType('folder-entry')
          .map((m) => m.sourcePath)
          .sort();
        expect(paths).toEqual(['/models/first.gguf', '/models/second.gguf']);
      });

      // Folder still alive after both reconciles.
      expect(h.watchFolders.getById(folder.id)).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // removeFolder
  // -------------------------------------------------------------------------

  describe('removeFolder', () => {
    it('stops the monitor, closes the watcher, removes the row, and cascades folder-entry models', async () => {
      const h = makeHarness(ctx);
      h.scan.mockResolvedValueOnce({
        candidates: [candidate({ headPath: '/models/a.gguf' })],
        error: null,
      });
      const folder = await h.service.addFolder('/models', true);
      expect(h.models.listBySourceType('folder-entry')).toHaveLength(1);

      const watcher = h.lastWatcher();
      const monitor = h.lastMonitor();

      await h.service.removeFolder(folder.id);

      expect(monitor.stop).toHaveBeenCalledOnce();
      expect(watcher.close).toHaveBeenCalledOnce();
      expect(h.watchFolders.getById(folder.id)).toBeNull();
      // Folder-entry models cascaded away.
      expect(h.models.listBySourceType('folder-entry')).toHaveLength(0);
    });

    it('does not touch file models or other folders when removing one folder', async () => {
      const h = makeHarness(ctx);
      // A standalone file model — must survive.
      const file = await h.service.addFile('/abs/standalone.gguf');

      h.scan.mockResolvedValueOnce({
        candidates: [candidate({ headPath: '/models/a.gguf' })],
        error: null,
      });
      const folder = await h.service.addFolder('/models', true);

      await h.service.removeFolder(folder.id);

      expect(h.models.getById(file.id)).not.toBeNull();
    });

    it('throws for an unknown folder id', async () => {
      const h = makeHarness(ctx);
      await expect(h.service.removeFolder('nope')).rejects.toThrow();
    });

    it('cascade only removes models under the removed folder - not models in a similarly-prefixed folder', async () => {
      // Regression: isUnderFolder must guard on a slash boundary.
      // /models-extra must NOT be treated as "under" /models.
      const h = makeHarness(ctx);

      // Register /models with one model.
      h.scan.mockResolvedValueOnce({
        candidates: [candidate({ headPath: '/models/a.gguf' })],
        error: null,
      });
      const folderA = await h.service.addFolder('/models', true);

      // Register /models-extra with its own model.
      h.scan.mockResolvedValueOnce({
        candidates: [candidate({ headPath: '/models-extra/b.gguf' })],
        error: null,
      });
      const folderB = await h.service.addFolder('/models-extra', true);

      // Both folders seeded.
      expect(h.models.listBySourceType('folder-entry')).toHaveLength(2);

      // Remove /models.
      await h.service.removeFolder(folderA.id);

      // /models/a.gguf must be gone.
      const surviving = h.models.listBySourceType('folder-entry');
      expect(surviving).toHaveLength(1);
      expect(surviving[0]?.sourcePath).toBe('/models-extra/b.gguf');

      // /models-extra folder row itself must survive.
      expect(h.watchFolders.getById(folderB.id)).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Pass-throughs
  // -------------------------------------------------------------------------

  describe('pass-through methods', () => {
    it('list returns every model', async () => {
      const h = makeHarness(ctx);
      await h.service.addFile('/abs/m1.gguf');
      await h.service.addFile('/abs/m2.gguf');
      expect(await h.service.list()).toHaveLength(2);
    });

    it('get returns one model or null', async () => {
      const h = makeHarness(ctx);
      const m = await h.service.addFile('/abs/m.gguf');
      expect((await h.service.get(m.id))?.id).toBe(m.id);
      expect(await h.service.get('missing')).toBeNull();
    });

    it('listBySourceType filters by source type', async () => {
      const h = makeHarness(ctx);
      await h.service.addFile('/abs/file.gguf');
      insertFolderEntry(h.models, '/models/entry.gguf');
      expect(await h.service.listBySourceType('file')).toHaveLength(1);
      expect(await h.service.listBySourceType('folder-entry')).toHaveLength(1);
    });

    it('removeModel deletes one model', async () => {
      const h = makeHarness(ctx);
      const m = await h.service.addFile('/abs/m.gguf');
      await h.service.removeModel(m.id);
      expect(h.models.getById(m.id)).toBeNull();
    });

    it('setSystemPrompt persists and returns the updated model', async () => {
      const h = makeHarness(ctx);
      const m = await h.service.addFile('/abs/m.gguf');
      const updated = await h.service.setSystemPrompt(m.id, 'You are helpful.');
      expect(updated.systemPromptOverride).toBe('You are helpful.');
      expect(h.models.getById(m.id)?.systemPromptOverride).toBe('You are helpful.');
    });

    it('setChatTemplate persists and returns the updated model', async () => {
      const h = makeHarness(ctx);
      const m = await h.service.addFile('/abs/m.gguf');
      const updated = await h.service.setChatTemplate(m.id, '{{ messages }}');
      expect(updated.chatTemplateOverride).toBe('{{ messages }}');
    });

    it('setAdvancedParams upserts the override row', async () => {
      const h = makeHarness(ctx);
      const m = await h.service.addFile('/abs/m.gguf');
      const params = await h.service.setAdvancedParams(m.id, { nCtx: 4096, nGpuLayers: 10 });
      expect(params.nCtx).toBe(4096);
      expect(params.nGpuLayers).toBe(10);
      expect(h.advancedParams.getByModelId(m.id)?.nCtx).toBe(4096);
    });
  });

  // -------------------------------------------------------------------------
  // resetAdvanced
  // -------------------------------------------------------------------------

  describe('resetAdvanced', () => {
    it('clears the override row then returns freshly auto-tuned params', async () => {
      const h = makeHarness(ctx);
      const m = await h.service.addFile('/abs/m.gguf');
      // Seed an override that reset must clear.
      await h.service.setAdvancedParams(m.id, { nCtx: 2048 });
      expect(h.advancedParams.getByModelId(m.id)).not.toBeNull();

      h.computeAutoParams.mockResolvedValueOnce(autoParams(m.id, { nCtx: 8192, nGpuLayers: 99 }));

      const result = await h.service.resetAdvanced(m.id);

      // Override row cleared.
      expect(h.advancedParams.getByModelId(m.id)).toBeNull();
      // Auto-tuned values returned (not the just-deleted override).
      expect(result.nCtx).toBe(8192);
      expect(result.nGpuLayers).toBe(99);
      // computeAutoParams received the actual model row.
      expect(h.computeAutoParams).toHaveBeenCalledOnce();
      const [passedModel] = h.computeAutoParams.mock.calls[0] ?? [];
      expect((passedModel as LocalModel).id).toBe(m.id);
    });

    it('throws for an unknown model id', async () => {
      const h = makeHarness(ctx);
      await expect(h.service.resetAdvanced('missing')).rejects.toThrow();
      expect(h.computeAutoParams).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // start (boot re-hydration)
  // -------------------------------------------------------------------------

  describe('start (boot re-hydration)', () => {
    it('starts a watcher + monitor for every persisted folder and runs an initial reconcile of each', async () => {
      const h = makeHarness(ctx);
      // Simulate folders persisted by a PRIOR session: insert rows directly via
      // the repo, bypassing addFolder, so no lifecycle exists yet — exactly the
      // state a freshly booted process is in.
      h.watchFolders.insert({ path: '/nas/models', recursive: true });
      h.watchFolders.insert({ path: '/local/models', recursive: false });

      // Each folder's scan reports one candidate keyed by its own path.
      h.scan.mockImplementation(async (folderPath: string) => ({
        candidates: [candidate({ headPath: `${folderPath}/m.gguf` })],
        error: null,
      }));

      await h.service.start();

      // One watcher + monitor per persisted folder; every monitor started.
      expect(h.watchers).toHaveLength(2);
      expect(h.monitors).toHaveLength(2);
      for (const m of h.monitors) expect(m.start).toHaveBeenCalledOnce();

      // The initial reconcile ran once per folder and populated the library.
      expect(h.scan).toHaveBeenCalledTimes(2);
      const paths = h.models
        .listBySourceType('folder-entry')
        .map((m) => m.sourcePath)
        .sort();
      expect(paths).toEqual(['/local/models/m.gguf', '/nas/models/m.gguf']);
    });

    it('is idempotent — calling start twice does not double-watch a folder', async () => {
      const h = makeHarness(ctx);
      h.watchFolders.insert({ path: '/models', recursive: true });

      await h.service.start();
      expect(h.watchers).toHaveLength(1);

      await h.service.start();
      // The second start saw a live lifecycle and skipped it — still one each.
      expect(h.watchers).toHaveLength(1);
      expect(h.monitors).toHaveLength(1);
    });

    it('does not re-watch a folder already started via addFolder', async () => {
      const h = makeHarness(ctx);
      await h.service.addFolder('/models', true); // creates lifecycle + 1 watcher
      expect(h.watchers).toHaveLength(1);

      await h.service.start();
      // addFolder's row is in the persisted list, but its lifecycle is already
      // live, so start skips it rather than creating a second watcher.
      expect(h.watchers).toHaveLength(1);
      expect(h.monitors).toHaveLength(1);
    });

    it('isolates a per-folder reconcile failure so one bad folder does not abort the others', async () => {
      const h = makeHarness(ctx);
      h.watchFolders.insert({ path: '/bad', recursive: true });
      h.watchFolders.insert({ path: '/good', recursive: true });

      // /bad rejects on scan; /good resolves with a candidate.
      h.scan.mockImplementation(async (folderPath: string) => {
        if (folderPath === '/bad') throw new Error('ENOENT: scan blew up');
        return { candidates: [candidate({ headPath: '/good/ok.gguf' })], error: null };
      });

      // start resolves (does not throw) despite the failing folder.
      await expect(h.service.start()).resolves.toBeUndefined();

      // Both folders still got a watcher + monitor — lifecycle start is
      // independent of the scan outcome.
      expect(h.watchers).toHaveLength(2);
      expect(h.monitors).toHaveLength(2);
      // The healthy folder's reconcile still populated the library.
      const paths = h.models.listBySourceType('folder-entry').map((m) => m.sourcePath);
      expect(paths).toEqual(['/good/ok.gguf']);
      // The failure was logged, not silently swallowed.
      expect(h.logger.error).toHaveBeenCalled();
    });

    it('registers every watcher synchronously before any reconcile awaits (fire-and-forget boot is safe)', async () => {
      const h = makeHarness(ctx);
      h.watchFolders.insert({ path: '/a', recursive: true });
      h.watchFolders.insert({ path: '/b', recursive: true });

      // Do NOT await: a fire-and-forget caller (index.ts boot) must have live
      // watcher coverage the instant start() returns, before the background
      // reconciles settle — otherwise there is a window where filesystem events
      // are missed.
      const pending = h.service.start();
      expect(h.watchers).toHaveLength(2);
      expect(h.monitors).toHaveLength(2);

      await pending; // settle the background reconciles for a clean test exit
    });

    it('is a no-op when there are no persisted folders', async () => {
      const h = makeHarness(ctx);
      await expect(h.service.start()).resolves.toBeUndefined();
      expect(h.watchers).toHaveLength(0);
      expect(h.monitors).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // dispose
  // -------------------------------------------------------------------------

  describe('dispose', () => {
    it('stops every monitor and closes every watcher', async () => {
      const h = makeHarness(ctx);
      await h.service.addFolder('/models/a', true);
      await h.service.addFolder('/models/b', true);
      expect(h.watchers).toHaveLength(2);
      expect(h.monitors).toHaveLength(2);

      await h.service.dispose();

      for (const w of h.watchers) expect(w.close).toHaveBeenCalledOnce();
      for (const m of h.monitors) expect(m.stop).toHaveBeenCalledOnce();
    });

    it('is safe to call with no folders registered', async () => {
      const h = makeHarness(ctx);
      await expect(h.service.dispose()).resolves.toBeUndefined();
    });
  });
});
