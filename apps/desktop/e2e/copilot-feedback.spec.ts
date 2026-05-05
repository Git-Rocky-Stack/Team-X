/**
 * Phase 6 M38 T7 — copilot feedback-loop E2E.
 *
 * Covers the full advisory downrank path:
 *   1. Restrict the analyzer to cost insights.
 *   2. Force three analyzer ticks through the canned copilot provider.
 *   3. Dismiss three same-category cards through the sidebar UI.
 *   4. Apply the advisory feedback suggestion.
 *   5. Verify copilot.weights.changed lands on the append-only events table.
 *   6. Reopen Settings and confirm the cost weight displays the suggested value.
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

test.setTimeout(45_000);
test.describe.configure({ mode: 'serial' });

test.describe('Team-X Phase 6 — M38 copilot feedback loop', () => {
  let app: ElectronApplication;
  let window: Page;
  let userDataDir: string;

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'teamx-copilot-feedback-e2e-'));
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

  test('three cost dismissals suggest and apply a lower cost weight', async () => {
    const log = (msg: string) => console.log(`[e2e:copilot-feedback] ${msg}`);

    const companyId = await window.evaluate(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      const companies = await teamx.companies.list();
      return companies[0]?.id ?? '';
    });
    expect(companyId).toBeTruthy();
    log(`resolved companyId = ${companyId}`);

    await window.evaluate(async (cid: string) => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      await teamx.settings.setCopilot({ companyId: cid, categories: ['cost'] });
      await teamx.settings.setCopilotWeights({ companyId: cid, weights: { cost: 1 } });
    }, companyId);
    log('restricted copilot categories to cost and reset cost weight to 1.0x');

    const toolbarToggle = window.locator('[data-copilot-toolbar-toggle]');
    await expect(toolbarToggle).toBeVisible();
    await toolbarToggle.click();
    const sidebar = window.locator('[data-copilot-sidebar-root]');
    await expect(sidebar).toBeVisible();

    for (let i = 1; i <= 3; i++) {
      const tickResult = await window.evaluate(async (cid: string) => {
        // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
        const teamx = (window as any).teamx;
        return teamx.copilot.configure({ companyId: cid });
      }, companyId);
      expect(tickResult.insightsGenerated).toBeGreaterThanOrEqual(1);
      log(`tick ${i} generated ${tickResult.insightsGenerated} cost insight(s)`);

      const costCard = sidebar.locator('[data-copilot-category="cost"]').first();
      await expect(costCard).toBeVisible({ timeout: 10_000 });
      await costCard.getByRole('button', { name: /dismiss insight/i }).click();
      await expect(costCard).toHaveCount(0, { timeout: 10_000 });
      log(`dismissed cost insight ${i}`);
    }

    const suggestion = sidebar.locator('[data-copilot-feedback-suggestion]');
    await expect(suggestion).toBeVisible({ timeout: 10_000 });
    await sidebar.locator('[data-copilot-feedback-apply]').click();
    log('applied feedback suggestion');

    await expect
      .poll(
        async () => {
          return window.evaluate(async (cid: string) => {
            // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
            const teamx = (window as any).teamx;
            const events = await teamx.events.list({ companyId: cid, limit: 200 });
            return events.events.some((event: { type: string; payload?: unknown }) => {
              if (event.type !== 'copilot.weights.changed') return false;
              const payload = event.payload as { changedKeys?: string[] } | undefined;
              return payload?.changedKeys?.includes('cost') === true;
            });
          }, companyId);
        },
        { timeout: 10_000 },
      )
      .toBe(true);

    await window.keyboard.press('Escape');
    await expect(sidebar).not.toBeVisible({ timeout: 10_000 });

    await window.getByRole('button', { name: 'Settings', exact: true }).click();
    const costWeightRow = window.locator('[data-copilot-weight-category="cost"]');
    await expect(costWeightRow).toContainText('0.5x', { timeout: 10_000 });
  });
});
