/**
 * Phase 6 M41 T1 — cross-milestone Phase 6 integration E2E.
 *
 * Stitches the Phase 6 surfaces in one fresh Electron session:
 *   - M36/M37 capability role-fit path through the write-side planner.
 *   - M38 copilot feedback suggestion and weights-changed event.
 *   - M39 telemetry kind filter.
 *   - M40 local insight export.
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MAIN_ENTRY = resolve(__dirname, '../out/main/index.js');

type TelemetryKind = 'work' | 'agentic' | 'copilot';
type InsightCategory = 'operational' | 'cost' | 'org' | 'workflow' | 'anomaly';

interface CompanyStats {
  totalRuns: number;
}

test.setTimeout(90_000);
test.describe.configure({ mode: 'serial' });

test.describe('Team-X Phase 6 — M41 integration', () => {
  let app: ElectronApplication;
  let window: Page;
  let userDataDir: string;

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'teamx-phase-6-integration-e2e-'));
    app = await electron.launch({
      args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`, ...getCiLaunchArgs()],
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

  async function resolveCompanyAndEmployee(): Promise<{ companyId: string; employeeId: string }> {
    return window.evaluate(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      const companies = await teamx.companies.list();
      const company = companies[0];
      if (!company) throw new Error('No seeded company found');
      const employees = await teamx.employees.list(company.id);
      const employee = employees[0];
      if (!employee) throw new Error('No seeded employee found');
      return { companyId: company.id, employeeId: employee.id };
    });
  }

  async function getCompanyStats(companyId: string, kind: TelemetryKind): Promise<CompanyStats> {
    return window.evaluate(
      async ({ cid, requestKind }: { cid: string; requestKind: TelemetryKind }) => {
        // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
        const teamx = (window as any).teamx;
        return teamx.telemetry.companyStats({ companyId: cid, kind: requestKind });
      },
      { cid: companyId, requestKind: kind },
    );
  }

  async function readTotalRunsCard(): Promise<number> {
    const text = (await window.locator('[data-telemetry-stat="total-runs"]').textContent()) ?? '';
    const match = text.match(/\d[\d,]*/);
    if (!match) throw new Error(`Unable to parse Total Runs card text: ${text}`);
    return Number.parseInt(match[0].replaceAll(',', ''), 10);
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

  async function openSidebar() {
    const toolbarToggle = window.locator('[data-copilot-toolbar-toggle]');
    await expect(toolbarToggle).toBeVisible();
    await toolbarToggle.click();
    const sidebar = window.locator('[data-copilot-sidebar-root]');
    await expect(sidebar).toBeVisible();
    return sidebar;
  }

  test('planner, feedback, telemetry, and export work in one Phase 6 flow', async () => {
    const { companyId, employeeId } = await resolveCompanyAndEmployee();

    const workBefore = (await getCompanyStats(companyId, 'work')).totalRuns;
    const agenticBefore = (await getCompanyStats(companyId, 'agentic')).totalRuns;
    const copilotBefore = (await getCompanyStats(companyId, 'copilot')).totalRuns;

    await window.evaluate(
      async ({ eid, content }: { eid: string; content: string }) => {
        // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
        const teamx = (window as any).teamx;
        return teamx.chat.send({ threadId: 'auto', employeeId: eid, content });
      },
      { eid: employeeId, content: 'Phase 6 integration work run' },
    );
    await expect
      .poll(async () => (await getCompanyStats(companyId, 'work')).totalRuns, { timeout: 15_000 })
      .toBeGreaterThan(workBefore);

    await window.keyboard.press('Control+k');
    const dialog = window.getByRole('dialog', { name: /Command Palette/i });
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await dialog
      .getByRole('textbox', { name: 'Command input' })
      .fill('decompose the frontend redesign into tickets');
    await expect(dialog.locator('[aria-label^="Intent:"]')).toHaveAccessibleName(/Route to Agent/);
    await window.keyboard.press('Enter');
    await expect(dialog.getByText('Confirm write-side agentic run')).toBeVisible({
      timeout: 10_000,
    });
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    const answerCard = dialog.locator('[data-step-kind="answer"]');
    await expect(answerCard).toBeVisible({ timeout: 20_000 });
    await expect(answerCard).toContainText(/Decomposed the frontend redesign/i);
    await window.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    await expect
      .poll(async () => (await getCompanyStats(companyId, 'agentic')).totalRuns, {
        timeout: 15_000,
      })
      .toBeGreaterThan(agenticBefore);

    await window.evaluate(async (cid: string) => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      await teamx.settings.setCopilot({ companyId: cid, categories: ['cost'] });
      await teamx.settings.setCopilotWeights({ companyId: cid, weights: { cost: 1 } });
    }, companyId);

    const sidebar = await openSidebar();
    for (let i = 0; i < 3; i++) {
      const tickResult = await window.evaluate(async (cid: string) => {
        // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
        const teamx = (window as any).teamx;
        return teamx.copilot.configure({ companyId: cid });
      }, companyId);
      expect(tickResult.insightsGenerated).toBeGreaterThanOrEqual(1);

      const costCard = sidebar.locator('[data-copilot-category="cost"]').first();
      await expect(costCard).toBeVisible({ timeout: 10_000 });
      await costCard.getByRole('button', { name: /dismiss insight/i }).click();
      await expect(costCard).toHaveCount(0, { timeout: 10_000 });
    }

    await expect(sidebar.locator('[data-copilot-feedback-suggestion]')).toBeVisible({
      timeout: 10_000,
    });
    await sidebar.locator('[data-copilot-feedback-apply]').click();

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

    await expect
      .poll(async () => (await getCompanyStats(companyId, 'copilot')).totalRuns, {
        timeout: 15_000,
      })
      .toBeGreaterThan(copilotBefore);

    await window.keyboard.press('Escape');
    await expect(sidebar).not.toBeVisible({ timeout: 10_000 });
    await window
      .getByRole('navigation')
      .getByRole('button', { name: 'Telemetry', exact: true })
      .click();
    await expect(window.locator('[data-telemetry-stat="total-runs"]')).toBeVisible({
      timeout: 10_000,
    });

    const copilotRuns = (await getCompanyStats(companyId, 'copilot')).totalRuns;
    const agenticRuns = (await getCompanyStats(companyId, 'agentic')).totalRuns;

    await window.locator('[data-telemetry-kind-filter="copilot"]').click();
    await expect.poll(readTotalRunsCard, { timeout: 10_000 }).toBe(copilotRuns);

    await window.locator('[data-telemetry-kind-filter="agentic"]').click();
    await expect.poll(readTotalRunsCard, { timeout: 10_000 }).toBe(agenticRuns);

    const exportCategory = await forceInsight(companyId);
    const exportSidebar = await openSidebar();
    await exportSidebar.locator(`[data-copilot-category-filter="${exportCategory}"]`).click();
    await expect(
      exportSidebar.locator(`[data-copilot-category="${exportCategory}"]`).first(),
    ).toBeVisible({ timeout: 10_000 });
    await exportSidebar.locator('[data-copilot-export-format="json"]').click();

    const status = exportSidebar.locator('[data-copilot-export-status]');
    await expect(status).toBeVisible({ timeout: 10_000 });
    await expect(status).toContainText(/Exported [1-9]\d* insights?/);
    await expect(status).toContainText('.json');

    await expect(window.getByText('Confirm destructive action')).not.toBeVisible();
  });
});
