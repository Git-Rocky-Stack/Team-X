/**
 * Phase 6 M40 T6 — copilot insight export E2E.
 *
 * Covers the local sidebar export path end to end:
 *   1. Boot Electron in test mode with a fresh user data dir.
 *   2. Resolve the seeded company id.
 *   3. Force a copilot analyzer tick so at least one active insight exists.
 *   4. Open the sidebar, select the insight's category filter, and export JSON.
 *   5. Switch export scope to all companies and export CSV.
 *   6. Verify success status copy and that the sidebar remains open.
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

type InsightCategory = 'operational' | 'cost' | 'org' | 'workflow' | 'anomaly';

test.setTimeout(60_000);
test.describe.configure({ mode: 'serial' });

test.describe('Team-X Phase 6 — M40 copilot insight export', () => {
  let app: ElectronApplication;
  let window: Page;
  let userDataDir: string;

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'teamx-copilot-export-e2e-'));
    app = await electron.launch({
      args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ELECTRON_ENABLE_LOGGING: '1',
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

  async function resolveCompanyId(): Promise<string> {
    return window.evaluate(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      const companies = await teamx.companies.list();
      return companies[0]?.id ?? '';
    });
  }

  async function forceInsight(companyId: string): Promise<InsightCategory> {
    return window.evaluate(async (cid: string) => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      await teamx.settings.setCopilot({
        companyId: cid,
        categories: ['operational', 'cost', 'org', 'workflow', 'anomaly'],
      });
      const tick = await teamx.copilot.configure({ companyId: cid });
      if (tick.insightsGenerated < 1) {
        throw new Error(`Expected at least one generated insight, got ${tick.insightsGenerated}`);
      }
      const listed = await teamx.copilot.insights({ companyId: cid, limit: 20 });
      const category = listed.insights[0]?.category;
      if (!category) throw new Error('Expected at least one active copilot insight');
      return category;
    }, companyId);
  }

  async function expectExportStatus(extension: 'json' | 'csv'): Promise<void> {
    const status = window.locator('[data-copilot-export-status]');
    await expect(status).toBeVisible({ timeout: 10_000 });
    await expect(status).toContainText(/Exported [1-9]\d* insights?/);
    await expect(status).toContainText(`.${extension}`);
  }

  test('exports filtered company insights as JSON and all-scope insights as CSV', async () => {
    const companyId = await resolveCompanyId();
    expect(companyId).toBeTruthy();

    const category = await forceInsight(companyId);

    await window.locator('[data-copilot-toolbar-toggle]').click();
    const sidebar = window.locator('[data-copilot-sidebar-root]');
    await expect(sidebar).toBeVisible();

    await sidebar.locator(`[data-copilot-category-filter="${category}"]`).click();
    await expect(sidebar.locator(`[data-copilot-category="${category}"]`).first()).toBeVisible({
      timeout: 10_000,
    });

    await sidebar.locator('[data-copilot-export-format="json"]').click();
    await expectExportStatus('json');

    await sidebar.locator('[data-copilot-export-scope="all"]').click();
    await sidebar.locator('[data-copilot-export-format="csv"]').click();
    await expectExportStatus('csv');

    await expect(sidebar).toBeVisible();
  });
});
