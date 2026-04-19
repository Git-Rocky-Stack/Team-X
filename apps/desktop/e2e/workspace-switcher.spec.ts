/**
 * Phase 5.6 M-D pre-flight E2E.
 *
 * Exercises the step (a+b) multi-company surface that previously only
 * had source-string unit guards: boot, open the WorkspaceSwitcher,
 * create a second workspace through the live dialog, verify the new
 * workspace becomes active, then switch back to the seeded Strategia-X
 * workspace from the menu.
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

test.describe('Team-X Phase 5.6 M-D workspace switcher', () => {
  let app: ElectronApplication;
  let window: Page;
  let userDataDir: string;

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'teamx-workspace-e2e-'));
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

  test('creates a workspace and keeps the seeded workspace reachable', async () => {
    const log = (msg: string) => console.log(`[e2e:workspace] ${msg}`);
    const workspaceName = `E2E Workspace ${Date.now().toString(36)}`;
    const workspaceSlug = workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const switcher = window.locator('[data-workspace-switcher-trigger]');
    await expect(switcher).toBeVisible();
    await expect(switcher).toHaveAccessibleName(/Workspace switcher .*Strategia-X/);
    log('workspace switcher mounted with Strategia-X active');

    await switcher.click();
    await expect(window.locator('[data-workspace-switcher-content]')).toBeVisible();
    await expect(
      window.locator('[data-workspace-switcher-item]').filter({ hasText: 'Strategia-X' }),
    ).toBeVisible();
    await window.locator('[data-workspace-switcher-action="create-company"]').click();
    log('Create workspace dialog opened from switcher');

    const dialog = window.locator('[data-create-company-dialog]');
    await expect(dialog).toBeVisible();
    await window.locator('[data-create-company-field="name"]').fill(workspaceName);
    await window.locator('[data-create-company-field="slug"]').fill(workspaceSlug);
    await window.locator('[data-create-company-theme="light"]').click();
    await window.locator('[data-create-company-submit]').click();
    log(`submitted workspace create form for ${workspaceName}`);

    await expect(dialog).toBeHidden();
    await expect(switcher).toHaveAccessibleName(
      new RegExp(`Workspace switcher .*${workspaceName}`),
    );
    await expect(switcher).toContainText(workspaceName);
    log('new workspace became active in the switcher');

    const companies = await window.evaluate(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      return teamx.companies.list();
    });
    expect(companies.map((c: { name: string }) => c.name)).toEqual(
      expect.arrayContaining(['Strategia-X', workspaceName]),
    );
    log('companies.list contains both seeded and newly-created workspaces');

    await switcher.click();
    const strategiaItem = window
      .locator('[data-workspace-switcher-item]')
      .filter({ hasText: 'Strategia-X' });
    await expect(strategiaItem).toBeVisible();
    await strategiaItem.click();
    await expect(switcher).toHaveAccessibleName(/Workspace switcher .*Strategia-X/);
    await expect(switcher).toContainText('Strategia-X');
    log('seeded Strategia-X workspace remains reachable via the switcher');
  });
});
