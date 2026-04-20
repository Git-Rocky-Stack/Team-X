/**
 * Phase 5.6 M-D step (e) org-chart read-side E2E.
 *
 * Covers the first live renderer consumer of the M-C `orgchart.get`
 * IPC surface: enable Org tab, fetch the flat projection, render the
 * tree, and expose the keyboard-reachable step-(f) action affordance.
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

const MAIN_ENTRY = resolve(__dirname, '../out/main/index.js');

test.describe.configure({ mode: 'serial' });

test.describe('Team-X Phase 5.6 M-D org chart read-side', () => {
  let app: ElectronApplication;
  let window: Page;
  let userDataDir: string;

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'teamx-org-chart-e2e-'));
    app = await electron.launch({
      args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
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
    await expect(window.locator('[data-testid="app-brand-name"]')).toBeVisible();
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
      const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 5000));
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

  test('renders the seeded org chart and keyboard action affordance', async () => {
    const log = (msg: string) => console.log(`[e2e:org-chart] ${msg}`);

    await window.getByRole('button', { name: 'Org', exact: true }).click();
    await expect(window.locator('[data-org-chart-view]')).toBeVisible();
    await expect(window.getByText('Org chart', { exact: true })).toBeVisible();
    await expect(window.locator('[data-org-chart-tree]')).toBeVisible();
    log('Org tab rendered the org chart tree');

    const ceoNode = window.locator('[data-org-chart-node]').filter({ hasText: 'Iris Kovač' });
    const sweNode = window.locator('[data-org-chart-node]').filter({ hasText: 'Mateo Reyes' });
    await expect(ceoNode).toBeVisible();
    await expect(ceoNode).toContainText('Chief Executive Officer');
    await expect(ceoNode).toContainText('officer');
    await expect(sweNode).toBeVisible();
    await expect(sweNode).toContainText('Senior Fullstack Engineer');
    log('seeded CEO and SWE are visible in the org tree');

    await ceoNode.locator('button').first().press('Enter');
    await expect(ceoNode).toContainText('Actions ship in step (f)');
    log('keyboard action affordance is reachable');
  });
});
