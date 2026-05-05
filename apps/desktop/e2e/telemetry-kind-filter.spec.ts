/**
 * Phase 6 M39 T7 — telemetry kind filter E2E.
 *
 * Exercises the read-path filter end to end:
 *   1. Generate a work run through chat.send.
 *   2. Generate a copilot run through copilot.configure.
 *   3. Open Telemetry and verify All / Copilot / Work totals.
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

type TelemetryKind = 'work' | 'copilot';

interface CompanyStats {
  totalRuns: number;
}

test.setTimeout(60_000);
test.describe.configure({ mode: 'serial' });

test.describe('Team-X Phase 6 — M39 telemetry kind filter', () => {
  let app: ElectronApplication;
  let window: Page;
  let userDataDir: string;

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'teamx-telemetry-kind-e2e-'));
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

  async function getCompanyStats(companyId: string, kind?: TelemetryKind): Promise<CompanyStats> {
    return window.evaluate(
      async ({ cid, requestKind }: { cid: string; requestKind?: TelemetryKind }) => {
        // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
        const teamx = (window as any).teamx;
        return teamx.telemetry.companyStats(
          requestKind ? { companyId: cid, kind: requestKind } : { companyId: cid },
        );
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

  test('filters company telemetry totals by work and copilot run kind', async () => {
    const { companyId, employeeId } = await resolveCompanyAndEmployee();

    const workBefore = (await getCompanyStats(companyId, 'work')).totalRuns;
    const copilotBefore = (await getCompanyStats(companyId, 'copilot')).totalRuns;

    await window.evaluate(
      async ({ eid, content }: { eid: string; content: string }) => {
        // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
        const teamx = (window as any).teamx;
        return teamx.chat.send({ threadId: 'auto', employeeId: eid, content });
      },
      { eid: employeeId, content: 'Telemetry filter E2E work run' },
    );

    await expect
      .poll(async () => (await getCompanyStats(companyId, 'work')).totalRuns, { timeout: 15_000 })
      .toBeGreaterThan(workBefore);
    const workRuns = (await getCompanyStats(companyId, 'work')).totalRuns;

    await window.evaluate(async (cid: string) => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      await teamx.settings.setCopilot({ companyId: cid, categories: ['cost'] });
      await teamx.settings.setCopilotWeights({ companyId: cid, weights: { cost: 1 } });
      return teamx.copilot.configure({ companyId: cid });
    }, companyId);

    await expect
      .poll(async () => (await getCompanyStats(companyId, 'copilot')).totalRuns, {
        timeout: 15_000,
      })
      .toBeGreaterThan(copilotBefore);
    const copilotRuns = (await getCompanyStats(companyId, 'copilot')).totalRuns;

    await window
      .getByRole('navigation')
      .getByRole('button', { name: 'Telemetry', exact: true })
      .click();
    const totalRunsCard = window.locator('[data-telemetry-stat="total-runs"]');
    await expect(totalRunsCard).toBeVisible({ timeout: 10_000 });

    await expect
      .poll(readTotalRunsCard, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(workRuns + copilotRuns);

    await window.locator('[data-telemetry-kind-filter="copilot"]').click();
    await expect.poll(readTotalRunsCard, { timeout: 10_000 }).toBe(copilotRuns);

    await window.locator('[data-telemetry-kind-filter="work"]').click();
    await expect.poll(readTotalRunsCard, { timeout: 10_000 }).toBe(workRuns);
  });
});
