/**
 * LibraryService — Electron-main orchestrator for the local GGUF library
 * (v3.3.0 Local & Networked GGUF Support, Phase 3 spec § 14). It is the single
 * facade the `localGguf.library.*` IPC handlers (Task 8) delegate to, so every
 * handler stays a one-line pass-through.
 *
 * It ties the Phase-3 runtime modules — the GGUF metadata parser, the folder
 * scanner, the chokidar folder watcher, and the network-share resilience
 * monitor — to the Phase-1 DB repos (`local_models`, `local_model_watch_folders`,
 * `local_model_advanced_params`), and owns the live watcher/monitor lifecycle for
 * every registered folder.
 *
 * House style mirrors `pool-service.ts`: a pure factory returning an object of
 * methods (no class / `new` / `this`). Every I/O dependency — the repos (narrowed
 * to the structural slice consumed), the filesystem, the parser, the scanner, the
 * watcher + monitor constructors, and the auto-tune callback — is injectable with
 * a real default, so unit tests drive it with fakes (no real disk, no chokidar,
 * no GPU probing).
 *
 * Path convention: the scanner emits forward-slash POSIX paths even on Windows
 * (its file header explains why). We persist and reconcile those verbatim and
 * never re-nativize them.
 *
 * Judgment calls (documented for review):
 *   • addFile parse failure — the parser's `ParserError` propagates so the IPC
 *     layer surfaces a typed `gguf-corrupt` / `gguf-parse-failed`; nothing is
 *     persisted on failure.
 *   • addFolder dedupe — a folder whose path already exists is rejected (throws)
 *     rather than silently inserting a duplicate row + second watcher.
 *   • removeFolder cascade — the folder's `folder-entry` models are removed too,
 *     so the library never shows orphaned rows for a folder the user dropped.
 *   • resetAdvanced — clears the override row, then returns freshly auto-tuned
 *     params from the injected `computeAutoParams` (spec: "reset to auto", never
 *     return the just-deleted row). `computeAutoParams` is required via deps.
 *   • split-incomplete candidates — still inserted, but flagged with status
 *     `'missing'` + a detail noting the incomplete shard set, so the UI can warn
 *     rather than silently offering an unloadable model.
 */

import {
  type ScanFolderResult,
  createFolderWatcher as defaultCreateFolderWatcher,
  createResilienceMonitor as defaultCreateResilienceMonitor,
  parseGgufMetadata as defaultParseGgufMetadata,
  scanFolderForGgufs as defaultScanFolderForGgufs,
} from '@team-x/local-gguf-runtime';
import type {
  AdvancedParams,
  LocalModel,
  ModelStatus,
  SourceType,
  WatchFolder,
} from '@team-x/shared-types';

import type { InsertLocalModelInput } from '../../db/repos/local-models.js';

// ---------------------------------------------------------------------------
// Narrowed structural repo slices (mirrors pool-service.ts).
// ---------------------------------------------------------------------------

/** The slice of the local-models repo the library service consumes. */
export interface LibraryModelsRepo {
  insert(input: InsertLocalModelInput): LocalModel;
  getById(id: string): LocalModel | null;
  list(): LocalModel[];
  listBySourceType(sourceType: SourceType): LocalModel[];
  updateStatus(id: string, status: ModelStatus, detail: string | null): LocalModel;
  setSystemPrompt(id: string, prompt: string | null): LocalModel;
  setChatTemplateOverride(id: string, template: string | null): LocalModel;
  remove(id: string): void;
}

/** The slice of the watch-folders repo the library service consumes. */
export interface LibraryWatchFoldersRepo {
  insert(input: { path: string; recursive?: boolean }): WatchFolder;
  getById(id: string): WatchFolder | null;
  list(): WatchFolder[];
  updateStatus(
    id: string,
    status: WatchFolder['status'],
    lastScanError: string | null,
  ): WatchFolder;
  remove(id: string): void;
}

/** The slice of the advanced-params repo the library service consumes. */
export interface LibraryAdvancedParamsRepo {
  upsert(modelId: string, params: Partial<AdvancedParams>): AdvancedParams;
  getByModelId(modelId: string): AdvancedParams | null;
  clear(modelId: string): void;
}

// ---------------------------------------------------------------------------
// Injected I/O surfaces.
// ---------------------------------------------------------------------------

/** Narrow async filesystem surface — production wires `node:fs/promises`. */
export interface LibraryFs {
  readFile(path: string, opts?: { length?: number }): Promise<Buffer>;
  stat(path: string): Promise<{ size: number }>;
  access(path: string): Promise<void>;
  readdir(
    path: string,
    opts?: { withFileTypes: true },
  ): Promise<Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>>;
}

export interface LibraryServiceDeps {
  models: LibraryModelsRepo;
  watchFolders: LibraryWatchFoldersRepo;
  advancedParams: LibraryAdvancedParamsRepo;
  fs: LibraryFs;
  /** GGUF metadata parser; defaults to the package {@link defaultParseGgufMetadata}. */
  parseMetadata?: typeof defaultParseGgufMetadata;
  /** Folder scanner; defaults to the package {@link defaultScanFolderForGgufs}. */
  scan?: typeof defaultScanFolderForGgufs;
  /** Folder-watcher constructor; defaults to {@link defaultCreateFolderWatcher}. */
  createWatcher?: typeof defaultCreateFolderWatcher;
  /** Resilience-monitor constructor; defaults to {@link defaultCreateResilienceMonitor}. */
  createMonitor?: typeof defaultCreateResilienceMonitor;
  /**
   * Base poll interval (ms) for each folder's resilience monitor. Left unset in
   * production, where the monitor's own 30 s default applies. Injectable so tests
   * (and, later, a user-facing setting) can drive reachability transitions
   * deterministically without a 30 s wait — see the network-share resilience
   * integration test.
   */
  monitorBaseIntervalMs?: number;
  /**
   * Exponential-backoff ceiling (ms) for the resilience monitor. Left unset in
   * production (monitor default 5 min). Injectable alongside
   * {@link monitorBaseIntervalMs}.
   */
  monitorMaxIntervalMs?: number;
  /**
   * Compute auto-tuned advanced params for a model (GPU probe + metadata).
   * Required: `resetAdvanced` returns its result. Kept injectable so the service
   * stays decoupled from GPU probing (index.ts wires the real impl in a later task).
   */
  computeAutoParams: (model: LocalModel) => Promise<AdvancedParams>;
  logger?: { warn(...args: unknown[]): void; error(...args: unknown[]): void };
}

// ---------------------------------------------------------------------------
// Public facade type (mirrors `LocalGgufApi.library`, plus `dispose`).
// ---------------------------------------------------------------------------

export interface LibraryService {
  list(): Promise<LocalModel[]>;
  get(id: string): Promise<LocalModel | null>;
  listBySourceType(sourceType: SourceType): Promise<LocalModel[]>;
  addFile(path: string): Promise<LocalModel>;
  addFolder(path: string, recursive: boolean): Promise<WatchFolder>;
  removeFolder(id: string): Promise<void>;
  scanFolder(id: string): Promise<{ addedCount: number; removedCount: number }>;
  removeModel(id: string): Promise<void>;
  setSystemPrompt(id: string, prompt: string | null): Promise<LocalModel>;
  setChatTemplate(id: string, template: string | null): Promise<LocalModel>;
  setAdvancedParams(id: string, params: Partial<AdvancedParams>): Promise<AdvancedParams>;
  resetAdvanced(id: string): Promise<AdvancedParams>;
  /**
   * Re-hydrate persisted watch folders on boot: start a live watcher + monitor
   * for every folder already in the DB and run an initial reconcile of each so
   * changes made while the app was closed are picked up. Idempotent — folders
   * that already have a live lifecycle are skipped. The watcher/monitor pair is
   * created synchronously up front, so a fire-and-forget caller gets immediate
   * coverage; the per-folder reconciles run in the background and never block.
   */
  start(): Promise<void>;
  /** Tear down every watcher + monitor (app shutdown). Idempotent. */
  dispose(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum bytes read from a model's head to parse metadata. The GGUF header +
 * KV block lives at the front of the file; reading 1 MiB avoids loading a
 * multi-GB model into memory while comfortably covering the metadata block.
 */
const HEAD_READ_BYTES = 1024 * 1024;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/** Live watcher + monitor pair for one registered folder. */
interface FolderLifecycle {
  watcher: ReturnType<typeof defaultCreateFolderWatcher>;
  monitor: ReturnType<typeof defaultCreateResilienceMonitor>;
}

/** Final path segment of a forward-slash or backslash path. */
function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx === -1 ? normalized : normalized.slice(idx + 1);
}

export function createLibraryService(deps: LibraryServiceDeps): LibraryService {
  const parseMetadata = deps.parseMetadata ?? defaultParseGgufMetadata;
  const scan = deps.scan ?? defaultScanFolderForGgufs;
  const createWatcher = deps.createWatcher ?? defaultCreateFolderWatcher;
  const createMonitor = deps.createMonitor ?? defaultCreateResilienceMonitor;
  const logger = deps.logger ?? {
    warn: (...args: unknown[]) => console.warn('[library-service]', ...args),
    error: (...args: unknown[]) => console.error('[library-service]', ...args),
  };

  /** Live lifecycle per folder id. */
  const lifecycles = new Map<string, FolderLifecycle>();
  /** Folder ids with a watcher-driven reconcile in flight - guards overlapping watcher events. */
  const reconciling = new Set<string>();
  /**
   * Folder ids that received a watcher 'change' while a reconcile was already
   * in flight. The in-flight reconcile's finally block will re-trigger exactly
   * one more run so the event is never silently dropped.
   */
  const pendingReconcile = new Set<string>();

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Parse the GGUF head of `path` and build the metadata-derived columns of an
   * insert row. Reads at most {@link HEAD_READ_BYTES}; overwrites the parser's
   * head-length `fileSizeBytes` with the REAL on-disk size from `fs.stat` (the
   * parser only sees the head). Shared by `addFile` and folder reconcile.
   */
  async function buildInsertInput(
    path: string,
    sourceType: SourceType,
  ): Promise<InsertLocalModelInput> {
    const head = await deps.fs.readFile(path, { length: HEAD_READ_BYTES });
    const meta = parseMetadata(head, path);
    const { size } = await deps.fs.stat(path);

    return {
      displayName: basename(path),
      sourceType,
      sourcePath: path,
      endpointId: null,
      ggufArch: meta.arch,
      ggufParamsB: meta.paramsBillions,
      ggufQuant: meta.quant,
      ggufContextMax: meta.contextMax,
      ggufSizeBytes: size, // real stat size, NOT meta.fileSizeBytes (head length)
      ggufSha256: meta.sha256,
      ggufChatTemplate: meta.chatTemplate,
      isEmbeddingModel: meta.isEmbeddingModel,
      isToolCapable: meta.isToolCapable,
      hfRepoId: null,
      hfFilename: null,
      license: null,
      chatTemplateOverride: null,
      systemPromptOverride: null,
    };
  }

  /**
   * Raw reconcile body: scan the folder, diff against DB, insert/remove. No
   * re-entrancy guard - callers are responsible for serialisation if needed.
   * Throws only for an unknown folder id. Used by both the guarded internal
   * watcher-driven path and the public (always-runs) `scanFolder`.
   */
  async function runReconcile(
    folderId: string,
  ): Promise<{ addedCount: number; removedCount: number }> {
    const folder = deps.watchFolders.getById(folderId);
    if (!folder) {
      throw new Error(`[library-service] watch folder not found: ${folderId}`);
    }

    const result: ScanFolderResult = await scan(folder.path, {
      recursive: folder.recursive,
      fs: deps.fs,
    });

    if (result.error) {
      deps.watchFolders.updateStatus(folderId, 'unreachable', JSON.stringify(result.error));
      return { addedCount: 0, removedCount: 0 };
    }

    // Existing folder-entry models that belong to THIS folder, keyed by head path.
    const existingByPath = new Map<string, LocalModel>();
    for (const model of deps.models.listBySourceType('folder-entry')) {
      if (model.sourcePath && isUnderFolder(model.sourcePath, folder.path)) {
        existingByPath.set(model.sourcePath, model);
      }
    }

    const seen = new Set<string>();
    let addedCount = 0;
    for (const cand of result.candidates) {
      seen.add(cand.headPath);
      if (existingByPath.has(cand.headPath)) continue;
      await insertCandidate(cand);
      addedCount++;
    }

    let removedCount = 0;
    for (const [path, model] of existingByPath) {
      if (!seen.has(path)) {
        deps.models.remove(model.id);
        removedCount++;
      }
    }

    deps.watchFolders.updateStatus(folderId, 'reachable', null);
    return { addedCount, removedCount };
  }

  /**
   * Watcher-event-driven reconcile wrapper. Guards against concurrent watcher
   * bursts: if a reconcile is already in flight for this folder, records a
   * pending re-queue so the event is never silently dropped - the in-flight
   * run's finally block triggers exactly one more reconcile after it finishes.
   *
   * NOTE: this guard applies ONLY to the internal watcher-driven path. The
   * public `scanFolder` method calls `runReconcile` directly and always
   * executes a full scan regardless of in-flight state.
   */
  async function reconcileFolder(
    folderId: string,
  ): Promise<{ addedCount: number; removedCount: number }> {
    if (reconciling.has(folderId)) {
      pendingReconcile.add(folderId);
      return { addedCount: 0, removedCount: 0 };
    }
    reconciling.add(folderId);
    try {
      return await runReconcile(folderId);
    } finally {
      reconciling.delete(folderId);
      // If a watcher event arrived while this scan was running, re-trigger one
      // more reconcile - but only if the folder is still live (not removed/disposed).
      if (pendingReconcile.has(folderId)) {
        pendingReconcile.delete(folderId);
        if (lifecycles.has(folderId)) {
          queueMicrotask(() => {
            void reconcileFolder(folderId).catch((e) => {
              logger.error('requeued reconcile failed', folderId, e);
            });
          });
        }
      }
    }
  }

  /** Insert one scan candidate as a `folder-entry` model, flagging incomplete splits. */
  async function insertCandidate(cand: ScanFolderResult['candidates'][number]): Promise<void> {
    const input = await buildInsertInput(cand.headPath, 'folder-entry');
    // The scanner already summed every part's size; prefer it over the head stat
    // for split sets so the row reflects the whole model on disk.
    if (cand.sizeBytes > 0) {
      input.ggufSizeBytes = cand.sizeBytes;
    }
    const model = deps.models.insert(input);
    if (cand.isSplitIncomplete) {
      deps.models.updateStatus(
        model.id,
        'missing',
        `Split GGUF is incomplete: ${cand.baseName} is missing one or more shards.`,
      );
    }
  }

  /**
   * Whether `modelPath` lives directly under (or within) `folderPath`. Both are
   * normalized to forward slashes; the scanner stores POSIX paths, so a prefix
   * match on a slash boundary is sufficient and avoids cross-folder bleed.
   */
  function isUnderFolder(modelPath: string, folderPath: string): boolean {
    const m = modelPath.replace(/\\/g, '/');
    const f = folderPath.replace(/\\/g, '/').replace(/\/+$/, '');
    return m === f || m.startsWith(`${f}/`);
  }

  /** Create + wire the watcher and monitor for a folder, register the lifecycle. */
  function startLifecycle(folder: WatchFolder): void {
    const watcher = createWatcher(folder.path, { recursive: folder.recursive });
    const monitor = createMonitor([folder.path], {
      checkAccess: (p: string) => deps.fs.access(p),
      // Injectable poll cadence — undefined in production, so the monitor falls
      // back to its 30 s / 5 min defaults. Tests inject a short interval to drive
      // disconnect/reconnect transitions deterministically.
      baseIntervalMs: deps.monitorBaseIntervalMs,
      maxIntervalMs: deps.monitorMaxIntervalMs,
    });

    // MANDATORY: an unhandled EventEmitter 'error' emit crashes the process.
    // Swallow watcher + monitor errors (log only) so a transient FS/probe fault
    // never takes down the app.
    watcher.on('error', (err: unknown) => {
      logger.error('watcher error', folder.path, err);
    });
    monitor.on('error', (err: unknown) => {
      logger.error('monitor error', folder.path, err);
    });

    // A debounced batch of .gguf adds/unlinks → re-reconcile the folder.
    watcher.on('change', () => {
      void reconcileFolder(folder.id).catch((err) => {
        logger.error('reconcile after watcher change failed', folder.path, err);
      });
    });

    // NAS online/offline transitions → flip the folder's reachability status.
    monitor.on('reachableChange', (evt: { path: string; reachable: boolean }) => {
      try {
        deps.watchFolders.updateStatus(
          folder.id,
          evt.reachable ? 'reachable' : 'unreachable',
          null,
        );
      } catch (err) {
        logger.error('reachableChange status update failed', folder.path, err);
      }
    });

    monitor.start();
    lifecycles.set(folder.id, { watcher, monitor });
  }

  /** Stop + close a folder's watcher and monitor, dropping it from the map. */
  async function stopLifecycle(folderId: string): Promise<void> {
    const lifecycle = lifecycles.get(folderId);
    if (!lifecycle) return;
    lifecycles.delete(folderId);
    try {
      lifecycle.monitor.stop();
    } catch (err) {
      logger.error('monitor stop failed', folderId, err);
    }
    try {
      await lifecycle.watcher.close();
    } catch (err) {
      logger.error('watcher close failed', folderId, err);
    }
  }

  // -------------------------------------------------------------------------
  // Public methods (mirror LocalGgufApi.library)
  // -------------------------------------------------------------------------

  return {
    async list(): Promise<LocalModel[]> {
      return deps.models.list();
    },

    async get(id: string): Promise<LocalModel | null> {
      return deps.models.getById(id);
    },

    async listBySourceType(sourceType: SourceType): Promise<LocalModel[]> {
      return deps.models.listBySourceType(sourceType);
    },

    async addFile(path: string): Promise<LocalModel> {
      // A parser failure (ParserError → gguf-corrupt / gguf-parse-failed)
      // propagates intentionally so the IPC layer surfaces the typed error;
      // nothing is persisted in that case.
      const input = await buildInsertInput(path, 'file');
      return deps.models.insert(input);
    },

    async addFolder(path: string, recursive: boolean): Promise<WatchFolder> {
      // Dedupe by path — reject rather than create a duplicate row + watcher.
      const existing = deps.watchFolders.list().find((f) => f.path === path);
      if (existing) {
        throw new Error(`[library-service] folder already watched: ${path}`);
      }

      const folder = deps.watchFolders.insert({ path, recursive });
      startLifecycle(folder);
      // Initial scan so the folder is populated deterministically before return.
      await reconcileFolder(folder.id);
      return folder;
    },

    async removeFolder(id: string): Promise<void> {
      const folder = deps.watchFolders.getById(id);
      if (!folder) {
        throw new Error(`[library-service] watch folder not found: ${id}`);
      }
      await stopLifecycle(id);

      // Cascade: drop this folder's tracked models so the library shows no
      // orphans for a folder the user removed.
      for (const model of deps.models.listBySourceType('folder-entry')) {
        if (model.sourcePath && isUnderFolder(model.sourcePath, folder.path)) {
          deps.models.remove(model.id);
        }
      }

      deps.watchFolders.remove(id);
    },

    async scanFolder(id: string): Promise<{ addedCount: number; removedCount: number }> {
      // Public / explicit user action: always executes a real scan by calling
      // runReconcile directly, bypassing the watcher-event re-entrancy guard in
      // reconcileFolder. This ensures a manual scanFolder never returns a bogus
      // {0,0} no-op even if an internal watcher-driven reconcile happens to be
      // in flight at the same time.
      return runReconcile(id);
    },

    async removeModel(id: string): Promise<void> {
      deps.models.remove(id);
    },

    async setSystemPrompt(id: string, prompt: string | null): Promise<LocalModel> {
      return deps.models.setSystemPrompt(id, prompt);
    },

    async setChatTemplate(id: string, template: string | null): Promise<LocalModel> {
      return deps.models.setChatTemplateOverride(id, template);
    },

    async setAdvancedParams(id: string, params: Partial<AdvancedParams>): Promise<AdvancedParams> {
      return deps.advancedParams.upsert(id, params);
    },

    async resetAdvanced(id: string): Promise<AdvancedParams> {
      const model = deps.models.getById(id);
      if (!model) {
        throw new Error(`[library-service] model not found: ${id}`);
      }
      // "Reset to auto": clear the override row, then recompute + return the
      // auto-tuned defaults (never the just-deleted row).
      deps.advancedParams.clear(id);
      return deps.computeAutoParams(model);
    },

    async start(): Promise<void> {
      // Re-hydration. A fresh process has a DB row for every folder the user
      // registered in a prior session, but no live watcher/monitor yet — those
      // are created by `addFolder`, which only runs for NEW folders. Walk the
      // persisted rows and bring each one's lifecycle back online.
      //
      // Lifecycle creation is synchronous and done up front, BEFORE the first
      // await below, so watcher coverage is live the instant `start()` is called
      // even when the caller does not await it. (index.ts fires this
      // fire-and-forget so a slow or unreachable NAS folder never blocks window
      // creation.)
      const toReconcile: string[] = [];
      for (const folder of deps.watchFolders.list()) {
        // Skip any folder that already has a live lifecycle — guards a double
        // `start()` and a folder registered via `addFolder` before `start()` ran.
        if (lifecycles.has(folder.id)) continue;
        startLifecycle(folder);
        toReconcile.push(folder.id);
      }

      // Initial reconcile per folder so files added/removed while the app was
      // closed are reflected. Per-folder failures are isolated (logged, never
      // rethrown) so one unreachable folder cannot abort hydration of the rest;
      // `allSettled` lets a caller that DOES await know hydration finished.
      await Promise.allSettled(
        toReconcile.map((id) =>
          reconcileFolder(id).catch((err) => {
            logger.error('boot reconcile failed', id, err);
          }),
        ),
      );
    },

    async dispose(): Promise<void> {
      const ids = [...lifecycles.keys()];
      await Promise.all(ids.map((id) => stopLifecycle(id)));
    },
  };
}
