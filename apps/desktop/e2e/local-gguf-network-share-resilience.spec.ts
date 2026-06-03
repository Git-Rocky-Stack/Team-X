// E2E resilience probe for the v3.3.0 Local & Networked GGUF library surface
// (Phase 3). Exercises the network-share disconnect/reconnect cycle — renames
// the watched folder out from under chokidar, waits for the watcher storm to
// settle, renames it back, then proves the main process survived and the IPC
// bridge is still responsive.
//
// Design notes:
//
//   * The assertion is deliberately shallow: "app did not crash + IPC
//     responds". We do NOT assert that the resilience monitor's status flips
//     within the wait window; its production poll interval is 30 s and is not
//     injectable from the renderer. No interval-injection machinery is added
//     here — that is out of scope for this spec.
//   * The assertion here is deliberately shallow: "app did not crash + IPC
//     responds". This spec is the END-TO-END crash-survival smoke through the
//     real Electron main process, real chokidar, and the real IPC bridge.
//     Deterministic assertion that a watch folder actually flips
//     unreachable↔reachable now lives in the LibraryService integration test
//     ("drives a real disconnect→reconnect through the LIVE monitor" in
//     services/local-gguf/library-service.test.ts), which wires the real
//     resilience monitor via the injectable `monitorBaseIntervalMs` seam and
//     fake timers — no 30 s wait, no flaky timing. The production poll interval
//     is still 30 s here (the renderer has no folder-status read channel), so
//     this spec keeps the crash-survival scope rather than asserting the flip.
//
//   * The minimal GGUF fixture written into the temp dir is a hand-crafted
//     valid GGUF v3 header. Layout (all little-endian):
//       offset  0  4 bytes  magic "GGUF"
//       offset  4  4 bytes  u32le version = 3
//       offset  8  8 bytes  u64le tensorCount = 0
//       offset 16  8 bytes  u64le kvCount = 0
//       (+ 64 bytes zero padding to give the parser comfortable headroom)
//     Total: 88 bytes.  The parser requires >= 24 bytes, validates magic,
//     checks version in {2,3}, reads tensorCount (skipped) then kvCount (0),
//     iterates 0 KV pairs, and returns arch='unknown' with all-null fields.
//     No watcher error is expected on a valid (even empty) GGUF.
//
//   * Forward-slash path passed to addFolder mirrors how the sibling spec
//     passes paths through the bridge (the LibraryService normalises on
//     both platforms).
//
//   * Teardown: both `dir` and `dir + '-offline'` are removed with
//     `recursive: true, force: true` so a mid-test failure does not leave
//     temp artefacts behind.
//
// The e2e tsconfig (tsconfig.e2e.json) does not include the renderer's
// window.d.ts augmentation, so `window.teamx` is not typed inside
// page.evaluate. We read it through a narrow `globalThis` cast describing
// only the slice these tests exercise — identical to the sibling spec pattern.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  type ElectronApplication,
  type Page,
  _electron as electron,
  expect,
  test,
} from '@playwright/test';

import { getCiLaunchArgs } from './_launch-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MAIN_ENTRY = resolve(__dirname, '../out/main/index.js');

// ---------------------------------------------------------------------------
// Minimal GGUF v3 fixture bytes
// magic(4) + version u32le(4) + tensorCount u64le(8) + kvCount u64le(8) + pad(64)
// ---------------------------------------------------------------------------
function makeMinimalGguf(): Buffer {
  const buf = Buffer.alloc(88, 0);
  buf.write('GGUF', 0, 'ascii'); // magic
  buf.writeUInt32LE(3, 4); // version = 3
  buf.writeBigUInt64LE(0n, 8); // tensorCount = 0
  buf.writeBigUInt64LE(0n, 16); // kvCount = 0
  // remaining 64 bytes stay zero (pad)
  return buf;
}

// ---------------------------------------------------------------------------
// Narrow bridge view for these tests
// ---------------------------------------------------------------------------
interface WatchFolder {
  id: string;
  path: string;
  recursive: boolean;
}
interface ScanResult {
  addedCount: number;
  removedCount: number;
}
interface GpuInventory {
  detectedAt: number;
  cpu: { cores: number; ramMb: number };
}
interface LibraryBridge {
  addFolder(path: string, recursive: boolean): Promise<WatchFolder>;
  scanFolder(id: string): Promise<ScanResult>;
  list(): Promise<unknown[]>;
}
interface RuntimeBridge {
  gpuInventory(): Promise<GpuInventory>;
}
interface TeamxGlobal {
  teamx: {
    localGguf: {
      library: LibraryBridge;
      runtime: RuntimeBridge;
    };
  };
}

// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' });

test.describe('Team-X localGguf network-share disconnect/reconnect resilience (Phase 3)', () => {
  let app: ElectronApplication;
  let window: Page;
  let userDataDir: string;
  // These are set inside the test so the finally block can clean them up.
  let watchDir = '';
  let watchDirOffline = '';

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'teamx-netshare-e2e-'));
    app = await electron.launch({
      args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`, ...getCiLaunchArgs()],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });

    app.process().stdout?.on('data', (buf: Buffer) => {
      process.stdout.write(`[main] ${buf.toString()}`);
    });
    app.process().stderr?.on('data', (buf: Buffer) => {
      process.stderr.write(`[main!] ${buf.toString()}`);
    });

    window = await app.firstWindow();

    window.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('Electron Security Warning')) return;
      if (text.includes('aria-describedby={undefined}')) return;
      console.log(`[renderer ${msg.type()}] ${text}`);
    });
    window.on('pageerror', (err) => {
      console.error('[renderer pageerror]', err.message);
    });

    await window.waitForLoadState('domcontentloaded');
    await expect(window.locator('[data-testid="app-brand-name"]')).toBeVisible({
      timeout: 20_000,
    });
  });

  test.afterEach(async () => {
    if (app) {
      let closedCleanly = false;
      const closePromise = app
        .close()
        .then(() => {
          closedCleanly = true;
        })
        .catch(() => {
          /* app may already be closed */
        });
      const timeoutPromise = new Promise<void>((r) => setTimeout(r, 5000));
      await Promise.race([closePromise, timeoutPromise]);
      if (!closedCleanly) {
        try {
          const proc = app.process();
          if (proc && proc.exitCode === null && !proc.killed) {
            proc.kill('SIGKILL');
          }
        } catch {
          /* process already disposed */
        }
      }
    }
    // Clean up both the watch dir and the offline-renamed copy; swallow errors
    // so a mid-test rename failure does not cause afterEach to throw.
    for (const d of [watchDir, watchDirOffline]) {
      if (d) {
        try {
          rmSync(d, { recursive: true, force: true });
        } catch {
          /* best-effort */
        }
      }
    }
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  });

  test('app survives watched-folder rename storm and IPC remains responsive', async () => {
    // -----------------------------------------------------------------------
    // 1. Create a temp dir with a minimal valid GGUF inside so the initial
    //    scan parses it cleanly (arch='unknown', empty metadata — no throw).
    // -----------------------------------------------------------------------
    watchDir = mkdtempSync(join(tmpdir(), 'teamx-watchfolder-'));
    watchDirOffline = `${watchDir}-offline`;
    const ggufPath = join(watchDir, 'fixture.gguf');
    writeFileSync(ggufPath, makeMinimalGguf());

    // Forward-slash path — mirrors how the app's file-picker delivers paths
    // to the bridge; the LibraryService normalises on both platforms.
    const forwardSlashDir = watchDir.replace(/\\/g, '/');

    // -----------------------------------------------------------------------
    // 2. Register the folder and verify the IPC round-trip succeeds.
    // -----------------------------------------------------------------------
    const folder = await window.evaluate(
      ([dir]: [string]) =>
        (globalThis as unknown as TeamxGlobal).teamx.localGguf.library.addFolder(dir, true),
      [forwardSlashDir] as [string],
    );

    expect(typeof folder.id).toBe('string');
    expect(folder.id.length).toBeGreaterThan(0);
    expect(typeof folder.path).toBe('string');

    // -----------------------------------------------------------------------
    // 3. addFolder runs an initial scan internally, so the fixture is already
    //    discovered + inserted by the time addFolder resolves. Verify the full
    //    add -> scan -> parse -> insert pipeline worked by listing the library.
    // -----------------------------------------------------------------------
    const listAfterAdd = await window.evaluate(() =>
      (globalThis as unknown as TeamxGlobal).teamx.localGguf.library.list(),
    );
    expect(listAfterAdd.length).toBeGreaterThanOrEqual(1);

    // An explicit re-scan is idempotent — the fixture is already present, so
    // addedCount is 0. Assert it simply resolves with numeric counts (exercises
    // the scanFolder IPC channel without re-asserting discovery).
    const scanResult = await window.evaluate(
      ([id]: [string]) =>
        (globalThis as unknown as TeamxGlobal).teamx.localGguf.library.scanFolder(id),
      [folder.id] as [string],
    );

    expect(typeof scanResult.addedCount).toBe('number');
    expect(typeof scanResult.removedCount).toBe('number');

    // -----------------------------------------------------------------------
    // 4. Simulate disconnect: rename the watched dir so chokidar fires
    //    'unlink'/'unlinkDir'/'error' events for all watched paths. Then
    //    DETERMINISTICALLY exercise the disconnect path via an explicit scan —
    //    the folder is now missing, so the service must handle
    //    `source-unreachable` without crashing. We tolerate either outcome of
    //    the scan (resolve or reject); the guarantee under test is "the main
    //    process survives", proven by the liveness probe immediately after.
    //    (No fixed `waitForTimeout` — the IPC round-trips ARE the wait and
    //    they fail fast if the main process died.)
    // -----------------------------------------------------------------------
    await rename(watchDir, watchDirOffline);
    await window.evaluate(
      ([id]: [string]) =>
        (globalThis as unknown as TeamxGlobal).teamx.localGguf.library.scanFolder(id).then(
          () => null,
          () => null,
        ),
      [folder.id] as [string],
    );

    // Liveness probe after disconnect: a dead main process makes evaluate reject.
    const invAfterDisconnect = await window.evaluate(() =>
      (globalThis as unknown as TeamxGlobal).teamx.localGguf.runtime.gpuInventory(),
    );
    expect(invAfterDisconnect.detectedAt).toBeGreaterThan(0);

    // -----------------------------------------------------------------------
    // 5. Reconnect: rename the dir back, then exercise the reconnect path via
    //    another explicit scan (the folder is reachable again).
    // -----------------------------------------------------------------------
    await rename(watchDirOffline, watchDir);
    await window.evaluate(
      ([id]: [string]) =>
        (globalThis as unknown as TeamxGlobal).teamx.localGguf.library.scanFolder(id).then(
          () => null,
          () => null,
        ),
      [folder.id] as [string],
    );

    // -----------------------------------------------------------------------
    // 6. Core assertion: the main process survived the full disconnect/reconnect
    //    rename storm and the IPC bridge is still responsive across BOTH the
    //    runtime and library namespaces. A dead main process would make
    //    page.evaluate throw or time out. App still alive — that is the
    //    assertion. No crash.
    // -----------------------------------------------------------------------
    const inv = await window.evaluate(() =>
      (globalThis as unknown as TeamxGlobal).teamx.localGguf.runtime.gpuInventory(),
    );

    expect(typeof inv.detectedAt).toBe('number');
    expect(inv.detectedAt).toBeGreaterThan(0);
    expect(inv.cpu.cores).toBeGreaterThanOrEqual(1);
    expect(inv.cpu.ramMb).toBeGreaterThan(0);

    // Secondary round-trip: library.list() confirms the library service is
    // also alive (not just the runtime namespace).
    const libraryList = await window.evaluate(() =>
      (globalThis as unknown as TeamxGlobal).teamx.localGguf.library.list(),
    );

    expect(Array.isArray(libraryList)).toBe(true);
  });
});
