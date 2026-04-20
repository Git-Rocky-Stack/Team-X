/**
 * Phase 5.6 M-D org-chart E2E.
 *
 * Covers the first live renderer consumer of the M-C `orgchart.get`
 * IPC surface: enable Org tab, fetch the flat projection, render the
 * tree, and exercise the step-(f) write-side interactions.
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

  async function relaunchApp(): Promise<void> {
    await app.close();
    app = await electron.launch({
      args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.locator('[data-testid="app-brand-name"]')).toBeVisible();
  }

  test('renders the seeded org chart and keyboard action affordance', async () => {
    const log = (msg: string) => console.log(`[e2e:org-chart] ${msg}`);
    const seeded = await window.evaluate(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      const companies = await teamx.companies.list();
      const companyId = companies.find((c: { name: string }) => c.name === 'Strategia-X').id;
      const employees = await teamx.employees.list(companyId);
      const ceo = employees.find(
        (employee: { roleId: string }) => employee.roleId === 'chief-executive-officer',
      );
      const swe = employees.find(
        (employee: { roleId: string }) => employee.roleId === 'senior-fullstack-engineer',
      );
      return { ceoId: ceo.id, sweId: swe.id };
    });

    await window.getByRole('button', { name: 'Org', exact: true }).click();
    await expect(window.locator('[data-org-chart-view]')).toBeVisible();
    await expect(window.getByText('Org chart', { exact: true })).toBeVisible();
    await expect(window.locator('[data-org-chart-tree]')).toBeVisible();
    log('Org tab rendered the org chart tree');

    const ceoNode = window.locator(`[data-org-chart-drag-handle="${seeded.ceoId}"]`);
    const sweNode = window.locator(`[data-org-chart-drag-handle="${seeded.sweId}"]`);
    await expect(ceoNode).toBeVisible();
    await expect(ceoNode).toContainText('Chief Executive Officer');
    await expect(ceoNode).toContainText('officer');
    await expect(sweNode).toBeVisible();
    await expect(sweNode).toContainText('Senior Fullstack Engineer');
    log('seeded CEO and SWE are visible in the org tree');

    await ceoNode.locator('button').first().press('Enter');
    await expect(ceoNode.locator('[data-org-chart-promote]')).toBeVisible();
    await expect(ceoNode.locator('[data-org-chart-fire]')).toBeVisible();
    log('keyboard action affordance is reachable');
  });

  test('reassigns, rejects invalid drops, promotes, fires, and surfaces audit events', async () => {
    const log = (msg: string) => console.log(`[e2e:org-chart-interactions] ${msg}`);
    const suffix = Date.now().toString(36);
    const managerName = `Interaction Manager ${suffix}`;
    const reportName = `Interaction Report ${suffix}`;

    const seeded = await window.evaluate(
      async ({ managerName, reportName }) => {
        // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
        const teamx = (window as any).teamx;
        const companies = await teamx.companies.list();
        const companyId = companies.find((c: { name: string }) => c.name === 'Strategia-X').id;
        const employees = await teamx.employees.list(companyId);
        const ceo = employees.find(
          (employee: { roleId: string }) => employee.roleId === 'chief-executive-officer',
        );
        const manager = await teamx.employees.create({
          companyId,
          roleId: 'engineering-manager',
          name: managerName,
        });
        const report = await teamx.employees.create({
          companyId,
          roleId: 'senior-fullstack-engineer',
          name: reportName,
        });
        await teamx.employees.setManager({ employeeId: manager.employeeId, managerId: ceo.id });
        await teamx.employees.setManager({ employeeId: report.employeeId, managerId: ceo.id });
        return {
          companyId,
          ceoId: ceo.id,
          managerId: manager.employeeId,
          reportId: report.employeeId,
        };
      },
      { managerName, reportName },
    );

    await window.getByRole('button', { name: 'Org', exact: true }).click();
    await expect(window.locator('[data-org-chart-tree]')).toBeVisible();
    const managerNode = window.locator(`[data-org-chart-drag-handle="${seeded.managerId}"]`);
    const reportNode = window.locator(`[data-org-chart-drag-handle="${seeded.reportId}"]`);
    await expect(managerNode).toBeVisible();
    await expect(reportNode).toBeVisible();

    await reportNode.dragTo(managerNode);
    await expect
      .poll(() =>
        window.evaluate(async ({ companyId, managerId, reportId }) => {
          // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
          const org = await (window as any).teamx.orgchart.get(companyId);
          return org.edges.some(
            (edge: { managerId: string; reportId: string }) =>
              edge.managerId === managerId && edge.reportId === reportId,
          );
        }, seeded),
      )
      .toBe(true);
    log('drag reassigned the report to the manager');

    await relaunchApp();
    await expect
      .poll(() =>
        window.evaluate(async ({ companyId, managerId, reportId }) => {
          // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
          const org = await (window as any).teamx.orgchart.get(companyId);
          return org.edges.some(
            (edge: { managerId: string; reportId: string }) =>
              edge.managerId === managerId && edge.reportId === reportId,
          );
        }, seeded),
      )
      .toBe(true);
    log('dragged reporting edge persisted across app restart');

    await window.getByRole('button', { name: 'Org', exact: true }).click();
    const managerNodeAfterRestart = window.locator(
      `[data-org-chart-drag-handle="${seeded.managerId}"]`,
    );
    const reportNodeAfterRestart = window.locator(
      `[data-org-chart-drag-handle="${seeded.reportId}"]`,
    );
    await managerNodeAfterRestart.dragTo(reportNodeAfterRestart);
    await expect(window.locator('[data-org-chart-toast]')).toContainText(
      'Could not update reporting line',
    );
    log('invalid cycle-forming drop was rejected with user feedback');

    await reportNodeAfterRestart.locator('[data-org-chart-promote]').click();
    await window.locator('[data-promote-role-select]').selectOption('staff-engineer');
    await window.getByRole('button', { name: 'Confirm promote' }).click();
    await expect(reportNodeAfterRestart).toContainText('Staff Engineer');
    log('promote updated the row title');

    await reportNodeAfterRestart.locator('button').first().press('Enter');
    await reportNodeAfterRestart.locator('[data-org-chart-fire]').click();
    await window.locator('[data-fire-confirm-name]').fill(reportName);
    await window.getByRole('button', { name: 'Confirm fire' }).click();
    await expect(window.locator(`[data-org-chart-drag-handle="${seeded.reportId}"]`)).toHaveCount(
      0,
    );
    log('fire removed the employee row');

    await window.getByRole('button', { name: 'Audit', exact: true }).click();
    await expect(window.getByText('Audit Log', { exact: true })).toBeVisible();
    await expect(window.locator('[data-event-type="employee.managerSet"]').first()).toBeVisible();
    await expect(window.locator('[data-event-type="employee.promoted"]').first()).toBeVisible();
    await expect(window.locator('[data-event-type="employee.fired"]').first()).toBeVisible();
    log('audit tab surfaced org interaction events');
  });
});
