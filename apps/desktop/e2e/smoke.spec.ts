/**
 * Phase 1 end-to-end smoke test.
 *
 * Launches a real Electron instance against the compiled
 * `out/main/index.js`, with `NODE_ENV=test` so
 * `main/index.ts` swaps the provider factory for
 * `createTestModeResolveProvider` — a canned-reply stream that
 * needs no Ollama, no Anthropic key, and no network. The full
 * chat round-trip is driven through the renderer exactly the way
 * Rocky would:
 *
 *   1. Boot → assert the app shell (Strategia-X brand + Phase 1 tag)
 *   2. Assert both seeded employees render (CEO + Senior SWE)
 *   3. Click the CEO card → chat drawer opens
 *   4. Type a message + Ctrl+Enter → send
 *   5. Assert the user bubble appears
 *   6. Assert the canned test-mode reply streams in and persists
 *
 * If this test passes, it means every layer of Phase 1 is wired
 * correctly end-to-end: Electron boot, SQLite migrate + seed,
 * role-pack loader, orchestrator, event bus, IPC fan-out,
 * renderer React Query cache, Zustand live state, and the
 * streaming UI primitives — all without a single mock, fake, or
 * test double outside the provider seam.
 *
 * Isolation: each test gets a fresh `--user-data-dir=<tmp>` so the
 * Electron `userData` path (which `db/paths.ts` uses to locate the
 * SQLite file) never collides with Rocky's real dev DB or with
 * another test run. The temp dir is cleaned up in `afterEach`.
 *
 * Locator strategy: employee cards use attribute-selector locators
 * (`button[aria-label^="..."]`) rather than `getByRole('button',
 * { name: regex })`. Playwright's regex name matching requires the
 * regex to match the entire accessible name (anchored) and fails
 * silently — a timeout with no useful diagnostic — when the regex
 * matches only a prefix. The attribute-starts-with selector is
 * explicit, fast, and survives status-label changes in the
 * aria-label suffix without needing regex updates.
 */

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Absolute path to the built main-process entry. electron-vite writes
 * to `apps/desktop/out/main/index.js`. `e2e/smoke.spec.ts` sits one
 * level below `apps/desktop/`, so the climb is `../out/main/index.js`.
 */
const MAIN_ENTRY = resolve(__dirname, '../out/main/index.js');

/**
 * The canned reply the test-mode provider streams. Must match the
 * `TEST_MODE_REPLY` constant in `provider-factory.ts` — kept in sync
 * by convention (one production code path, one test assertion).
 */
const TEST_MODE_REPLY = 'Our top priority this week is shipping the Phase 1 demo.';

// Tests run strictly serial — only one Electron instance per host.
test.describe.configure({ mode: 'serial' });

test.describe('Team-X Phase 1 smoke', () => {
  let app: ElectronApplication;
  let window: Page;
  let userDataDir: string;

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'teamx-e2e-'));
    app = await electron.launch({
      args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
      // Inherit the parent env so Electron can find node_modules, but
      // force NODE_ENV=test so provider-factory.isTestMode() → true
      // and main/index.ts selects the canned-reply resolver. Any dev
      // .env ANTHROPIC_API_KEY is irrelevant in test mode because
      // `bootstrapEnvKeys` short-circuits on the test branch anyway.
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });

    // Forward main-process stdout/stderr and renderer console into
    // the Playwright reporter. Permanent instrumentation: when a test
    // fails in CI the only useful diagnostic is "what did the app log
    // right before the hang" — this pipe makes that visible without
    // needing to download the trace zip.
    app.process().stdout?.on('data', (buf: Buffer) => {
      process.stdout.write(`[main] ${buf.toString()}`);
    });
    app.process().stderr?.on('data', (buf: Buffer) => {
      process.stderr.write(`[main!] ${buf.toString()}`);
    });

    window = await app.firstWindow();

    window.on('console', (msg) => {
      // Skip noisy framework warnings that don't affect the test.
      const text = msg.text();
      if (text.includes('Electron Security Warning')) return;
      if (text.includes('aria-describedby={undefined}')) return;
      console.log(`[renderer ${msg.type()}] ${text}`);
    });
    window.on('pageerror', (err) => {
      console.error('[renderer pageerror]', err.message);
    });

    // Wait for React hydration — the top-bar brand text is the first
    // thing the shell paints, so we gate every subsequent assertion
    // on it being present.
    await window.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async () => {
    // Try graceful close, but never wait more than 5s — the will-quit
    // chain in main/index.ts is supposed to complete in well under a
    // second, and if it ever hangs (e.g. orchestrator drain wedged on
    // an in-flight job) we want a clear test failure with the trace
    // already captured, not a 90s worker-teardown timeout that hides
    // every assertion log under "afterEach exceeded budget".
    if (app) {
      let closedCleanly = false;
      const closePromise = app
        .close()
        .then(() => {
          closedCleanly = true;
        })
        .catch(() => {
          /* app may already be closed on test failure — swallow */
        });
      const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 5000));
      await Promise.race([closePromise, timeoutPromise]);
      // Hard kill only when close did NOT complete in time. After a
      // clean close, `app.process()` itself becomes invalid (Playwright
      // disposes the underlying ChildProcess wrapper and accessing it
      // throws "Cannot read properties of undefined (reading
      // '_object')"). The `closedCleanly` guard keeps that path off
      // the happy path entirely.
      if (!closedCleanly) {
        try {
          const proc = app.process();
          if (proc && proc.exitCode === null && !proc.killed) {
            proc.kill('SIGKILL');
          }
        } catch {
          /* process already disposed — nothing to kill */
        }
      }
    }
    rmSync(userDataDir, { recursive: true, force: true });
  });

  test('boots, renders seeded employees, and streams a canned reply', async () => {
    const log = (msg: string) => console.log(`[e2e] ${msg}`);
    log('test body entered');

    // --- 1. App shell renders --------------------------------------------
    await expect(window.getByText('Strategia-X', { exact: true })).toBeVisible();
    log('Strategia-X visible ✓');
    await expect(window.getByText('Phase 1', { exact: true })).toBeVisible();
    log('Phase 1 badge visible ✓');

    // --- 2. Both seeded employees render in the dashboard cards view -----
    // Using attribute-starts-with selectors rather than `getByRole`
    // regex (see file header for rationale). The aria-label format is
    // `{name}, {title} — {status}. Click to open chat.` — pinning on
    // the `{name}, {title}` prefix is stable across idle/thinking/etc.
    const ceoCard = window.locator('button[aria-label^="Iris Kovač, Chief Executive Officer"]');
    const sweCard = window.locator('button[aria-label^="Mateo Reyes, Senior Fullstack Engineer"]');
    await expect(ceoCard).toBeVisible();
    log('CEO card visible ✓');
    await expect(sweCard).toBeVisible();
    log('SWE card visible ✓');

    // --- 3. Click the CEO card → chat drawer opens -----------------------
    await ceoCard.click();
    log('CEO card clicked');

    // The composer textarea is the cleanest "drawer is open" signal —
    // it only exists while the drawer is mounted. Use a substring
    // placeholder match so the check works whether the composer is in
    // the idle ("Message... (Ctrl+Enter to send)") or disabled
    // ("Waiting for reply...") state; we only need "it exists".
    const composer = window.locator('textarea[placeholder*="Message"]');
    await expect(composer).toBeVisible();
    log('composer visible ✓');

    // --- 4. Type + send a message ---------------------------------------
    const userMessage = 'What is our top priority this week?';
    await composer.fill(userMessage);
    log('message filled');
    await composer.press('Control+Enter');
    log('Ctrl+Enter pressed');

    // --- 5. User bubble appears in the thread ---------------------------
    await expect(window.getByText(userMessage, { exact: true })).toBeVisible();
    log('user bubble visible ✓');

    // --- 6. Canned test-mode reply streams in and persists --------------
    // The reply flows through: orchestrator.runAgent → streamAgent →
    // token.delta events → event bus → webContents.send →
    // renderer Zustand employeeLive[id].currentStream → StreamingBubble.
    // After `work.completed`, the chat query invalidates and the
    // assistant bubble replaces the streaming bubble with the final
    // persisted content. Either state satisfies the assertion.
    await expect(window.getByText(TEST_MODE_REPLY, { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    log('canned reply visible ✓');
  });
});
