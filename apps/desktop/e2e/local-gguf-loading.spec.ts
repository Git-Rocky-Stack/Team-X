// E2E smoke for the v3.3.0 Local & Networked GGUF runtime + pool surface
// (Phase 2). Drives the REAL Electron app over the `window.teamx.localGguf.*`
// preload bridge and asserts the boot-time runtime/pool state.
//
// These three checks are deliberately hardware-agnostic so they pass both on a
// GPU rig (where boot probes CUDA/Vulkan) and on headless CI (CPU-only): none
// of them loads a model, so no llama-server binary needs to be present on disk
// — `runtimeService.init()` only probes + ranks + persists the binaries version;
// binary resolution + the §12.3 health-check happen later, at model-load time.
//
// The e2e tsconfig (tsconfig.e2e.json) does not include the renderer's
// window.d.ts augmentation, so `window.teamx` is not typed inside page.evaluate.
// We read it through a narrow `globalThis` cast (lib-agnostic — no DOM lib
// dependency) describing only the slice these tests exercise.

import { mkdtempSync, rmSync } from 'node:fs';
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

/** The five backends the runtime may settle on, per spec §12.2. */
const BACKENDS = ['cuda', 'rocm', 'vulkan', 'metal', 'cpu'] as const;

/** Narrow view of the preload bridge slice these tests call. */
interface LocalGgufBridge {
  runtime: {
    gpuInventory(): Promise<{ detectedAt: number; cpu: { cores: number; ramMb: number } }>;
    settings(): Promise<{ activeBackend: string; maxConcurrentLocalModels: number }>;
  };
  pool: {
    status(): Promise<{ loaded: unknown[]; maxConcurrent: number }>;
  };
}
interface TeamxGlobal {
  teamx: { localGguf: LocalGgufBridge };
}

test.describe.configure({ mode: 'serial' });

test.describe('Team-X localGguf runtime + pool (Phase 2)', () => {
  let app: ElectronApplication;
  let window: Page;
  let userDataDir: string;

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'teamx-localgguf-e2e-'));
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
    rmSync(userDataDir, { recursive: true, force: true });
  });

  test('pool is empty on a fresh boot with a sane concurrency cap', async () => {
    const status = await window.evaluate(() =>
      (globalThis as unknown as TeamxGlobal).teamx.localGguf.pool.status(),
    );
    expect(status.loaded).toEqual([]);
    expect(status.maxConcurrent).toBeGreaterThanOrEqual(1);
  });

  test('runtime settings reflect fresh-install defaults', async () => {
    const settings = await window.evaluate(() =>
      (globalThis as unknown as TeamxGlobal).teamx.localGguf.runtime.settings(),
    );
    // Default maxConcurrentLocalModels is 1 and boot does not change it.
    expect(settings.maxConcurrentLocalModels).toBe(1);
    // The active backend is whatever the boot probe ranked first — CUDA/Vulkan
    // on a GPU rig, CPU on headless CI — but always one of the known five.
    expect(BACKENDS).toContain(settings.activeBackend);
  });

  test('gpu inventory has the expected shape', async () => {
    const inv = await window.evaluate(() =>
      (globalThis as unknown as TeamxGlobal).teamx.localGguf.runtime.gpuInventory(),
    );
    expect(typeof inv.detectedAt).toBe('number');
    expect(inv.detectedAt).toBeGreaterThan(0);
    expect(inv.cpu.cores).toBeGreaterThanOrEqual(1);
    expect(inv.cpu.ramMb).toBeGreaterThan(0);
  });
});
