/**
 * Phase 5.6 M-D pre-flight E2E.
 *
 * Exercises the step (a+b) multi-company surface that previously only
 * had source-string unit guards: boot, open the WorkspaceSwitcher,
 * create a second workspace through the live dialog, verify the new
 * workspace becomes active, then switch back to the seeded Strategia-X
 * workspace from the menu. Phase 5.6 M-D step (c) extends the spec
 * over the CompanySettings panel and HireDialog manager-select.
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

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

async function createWorkspace(window: Page, name: string): Promise<void> {
  const switcher = window.locator('[data-workspace-switcher-trigger]');
  await switcher.click();
  await window.locator('[data-workspace-switcher-action="create-company"]').click();
  const dialog = window.locator('[data-create-company-dialog]');
  await expect(dialog).toBeVisible();
  await window.locator('[data-create-company-field="name"]').fill(name);
  await window.locator('[data-create-company-field="slug"]').fill(slugify(name));
  await window.locator('[data-create-company-submit]').click();
  await expect(dialog).toBeHidden();
  await expect(switcher).toContainText(name);
}

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
    const workspaceSlug = slugify(workspaceName);

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

  test('updates, archives, and deletes workspaces through CompanySettings', async () => {
    const log = (msg: string) => console.log(`[e2e:company-settings] ${msg}`);
    const suffix = Date.now().toString(36);
    const workspaceName = `Settings Workspace ${suffix}`;
    const renamedWorkspace = `Renamed Workspace ${suffix}`;
    const deleteWorkspace = `Delete Workspace ${suffix}`;
    const switcher = window.locator('[data-workspace-switcher-trigger]');

    await createWorkspace(window, workspaceName);
    log('created settings target workspace');

    await switcher.click();
    await window.locator('[data-workspace-switcher-action="company-settings"]').click();
    const panel = window.locator('[data-company-settings-panel]');
    await expect(panel).toBeVisible();
    await window.locator('[data-company-settings-field="name"]').fill(renamedWorkspace);
    await window.locator('[data-company-settings-field="slug"]').fill(slugify(renamedWorkspace));
    await window.locator('[data-company-settings-save]').click();
    await expect
      .poll(async () => {
        // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
        const companies = await window.evaluate(async () => (window as any).teamx.companies.list());
        return companies.some((c: { name: string }) => c.name === renamedWorkspace);
      })
      .toBe(true);
    await window.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(switcher).toContainText(renamedWorkspace);
    log('rename persisted and switcher reflected the new name');

    await switcher.click();
    await window.locator('[data-workspace-switcher-action="company-settings"]').click();
    await window.locator('[data-company-settings-archive]').click();
    await expect(panel).toBeHidden();
    await expect(switcher).toContainText('Strategia-X');
    await switcher.click();
    await expect(
      window.locator('[data-workspace-switcher-item]').filter({ hasText: renamedWorkspace }),
    ).toHaveCount(0);
    await window.keyboard.press('Escape');
    const archivedStatus = await window.evaluate(async (name) => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const companies = await (window as any).teamx.companies.list();
      return companies.find((c: { name: string }) => c.name === name)?.status ?? null;
    }, renamedWorkspace);
    expect(archivedStatus).toBe('archived');
    log('archive hid the workspace from the switcher and marked it archived');

    await createWorkspace(window, deleteWorkspace);
    await switcher.click();
    await window.locator('[data-workspace-switcher-action="company-settings"]').click();
    await window.getByText('Permanently delete this workspace').click();
    await window.locator('[data-company-settings-delete-confirm]').fill(deleteWorkspace);
    await window.locator('[data-company-settings-delete]').click();
    await expect(panel).toBeHidden();
    await expect(switcher).toContainText('Strategia-X');
    const stillExists = await window.evaluate(async (name) => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const companies = await (window as any).teamx.companies.list();
      return companies.some((c: { name: string }) => c.name === name);
    }, deleteWorkspace);
    expect(stillExists).toBe(false);
    log('delete removed the workspace end-to-end');
  });

  test('hires with an optional manager and writes the org edge', async () => {
    const log = (msg: string) => console.log(`[e2e:hire-manager] ${msg}`);
    const hireName = `Managed Hire ${Date.now().toString(36)}`;
    const seeded = await window.evaluate(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
      const teamx = (window as any).teamx;
      const companies = await teamx.companies.list();
      const companyId = companies.find((c: { name: string }) => c.name === 'Strategia-X').id;
      const employees = await teamx.employees.list(companyId);
      const ceo = employees.find(
        (employee: { roleId: string }) => employee.roleId === 'chief-executive-officer',
      );
      return { companyId, ceoId: ceo.id };
    });

    await window.getByRole('button', { name: /Hire/i }).first().click();
    await window.getByRole('button', { name: /Senior Fullstack Engineer/ }).click();
    await window.locator('#hire-name').fill(hireName);
    await window.locator('[data-hire-manager-select]').selectOption(seeded.ceoId);
    await window.getByRole('button', { name: 'Confirm Hire' }).click();
    await expect(window.getByRole('dialog', { name: /Hire Employee/ })).toBeHidden({
      timeout: 15_000,
    });

    await expect
      .poll(async () =>
        window.evaluate(
          async ({ companyId, ceoId, hireName }) => {
            // biome-ignore lint/suspicious/noExplicitAny: Electron renderer window.teamx IPC bridge
            const teamx = (window as any).teamx;
            const org = await teamx.orgchart.get(companyId);
            const hire = org.employees.find(
              (employee: { name: string }) => employee.name === hireName,
            );
            if (!hire) return false;
            return org.edges.some(
              (edge: { managerId: string; reportId: string }) =>
                edge.managerId === ceoId && edge.reportId === hire.id,
            );
          },
          { companyId: seeded.companyId, ceoId: seeded.ceoId, hireName },
        ),
      )
      .toBe(true);
    log('manager select wrote the reporting edge');
  });
});
