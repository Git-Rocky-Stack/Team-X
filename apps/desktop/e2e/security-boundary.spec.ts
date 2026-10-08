/**
 * Renderer trust boundary, proven against the built app (audit 2026-10-07 P0-3).
 *
 * The unit tests in src/main/security/renderer-boundary.test.ts and
 * src/renderer-csp.test.ts pin the policy. This spec shows the policy holds in
 * a real Electron process loading the built renderer (the same out/ tree
 * electron-builder packs):
 *
 *   - the page carries the strict production CSP, and inline script is blocked;
 *   - the app window cannot navigate away or open new windows;
 *   - a page that is not the app gets the real preload, and still every IPC
 *     invoke it makes is refused by the main-process sender guard;
 *   - the app's own frame still reaches IPC normally.
 *
 * Page globals are read through a narrow `globalThis` cast, as in
 * local-gguf-loading.spec.ts, because the e2e tsconfig has no DOM lib.
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

import { getCiLaunchArgs } from './_launch-helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN_ENTRY = resolve(__dirname, '../out/main/index.js');
const PRELOAD = resolve(__dirname, '../out/preload/index.cjs');

/** The slice of the renderer's globals this spec touches. */
interface PageGlobal {
  document: {
    querySelector(selector: string): { getAttribute(name: string): string | null } | null;
    createElement(tag: 'script'): { textContent: string };
    body: { appendChild(node: unknown): void };
  };
  location: { href: string };
  open(url: string): unknown;
  teamx: { companies: { list(): Promise<unknown[]> } };
  __inlineRan?: boolean;
}

test.describe.configure({ mode: 'serial' });

test.describe('Renderer trust boundary', () => {
  let app: ElectronApplication;
  let page: Page;
  let userDataDir: string;

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'teamx-e2e-'));
    app = await electron.launch({
      args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`, ...getCiLaunchArgs()],
      env: { ...process.env, NODE_ENV: 'test' },
    });
    app.process().stderr?.on('data', (buf: Buffer) => {
      process.stderr.write(`[main!] ${buf.toString()}`);
    });
    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    // Same readiness anchor as smoke.spec.ts: the shell has painted.
    await expect(page.locator('[data-testid="app-brand-name"]')).toBeVisible();
  });

  test.afterEach(async () => {
    await Promise.race([app?.close(), new Promise((r) => setTimeout(r, 5_000))]);
    rmSync(userDataDir, { recursive: true, force: true });
  });

  test('ships the strict CSP and blocks inline script', async () => {
    const csp = await page.evaluate(
      () =>
        (globalThis as unknown as PageGlobal).document
          .querySelector('meta[http-equiv="Content-Security-Policy"]')
          ?.getAttribute('content') ?? '',
    );
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('localhost');

    // An injected inline <script> must not run. (eval cannot be probed from
    // here: DevTools-protocol evaluation is exempt from CSP by design.)
    await page.evaluate(() => {
      const g = globalThis as unknown as PageGlobal;
      const el = g.document.createElement('script');
      el.textContent = 'globalThis.__inlineRan = true;';
      g.document.body.appendChild(el);
    });
    // A blocked script never runs; give an allowed one the same chance to.
    await expect
      .poll(() => page.evaluate(() => (globalThis as unknown as PageGlobal).__inlineRan === true), {
        timeout: 1_000,
      })
      .toBe(false);
  });

  test('cannot navigate away or open a new window', async () => {
    const startUrl = page.url();
    expect(startUrl.startsWith('file:')).toBe(true);

    // Plain http on purpose: the policy refuses it outright, so the test never
    // hands a link to the host's browser.
    const opened = await page.evaluate(
      () => (globalThis as unknown as PageGlobal).open('http://example.invalid/') === null,
    );
    expect(opened).toBe(true);

    await page.evaluate(() => {
      (globalThis as unknown as PageGlobal).location.href = 'http://example.invalid/';
    });
    // Read the outcome from the main process: Playwright saw the navigation
    // start and would wait forever for a finish the guard cancelled. Had it
    // gone through, the URL would change and the shell would be gone.
    const state = () =>
      app.evaluate(async ({ BrowserWindow }) => {
        const wc = BrowserWindow.getAllWindows()[0]?.webContents;
        return {
          url: wc?.getURL(),
          shell: await wc?.executeJavaScript(
            'document.querySelector(\'[data-testid="app-brand-name"]\') !== null',
          ),
          windows: BrowserWindow.getAllWindows().length,
        };
      });
    await expect
      .poll(state, { timeout: 2_000 })
      .toEqual({ url: startUrl, shell: true, windows: 1 });
  });

  test('refuses IPC from a page that is not the app, even with the real preload', async () => {
    // The app's own frame reaches IPC.
    const own = await page.evaluate(async () =>
      Array.isArray(await (globalThis as unknown as PageGlobal).teamx.companies.list()),
    );
    expect(own).toBe(true);

    // A foreign page, given the same preload, is refused by the main process.
    const refused = await app.evaluate(async ({ BrowserWindow }, preload) => {
      const foreign = new BrowserWindow({
        show: false,
        webPreferences: { preload, contextIsolation: true, sandbox: true },
      });
      await foreign.loadURL('data:text/html,<title>not the app</title>');
      try {
        return await foreign.webContents.executeJavaScript(
          'window.teamx.companies.list().then(() => "allowed", (e) => String(e && e.message))',
        );
      } finally {
        foreign.destroy();
      }
    }, PRELOAD);
    expect(refused).toMatch(/untrusted sender/);
  });
});
