/**
 * Source-string audit for Phase 5.6 M-D step (c):
 * `CompanySettings` panel + `HireDialog` manager-select.
 *
 * Renderer tests in this workspace run under the Node environment
 * and use source-string audits for component contracts. Playwright
 * owns end-to-end interaction coverage; this file pins the renderer
 * wiring and public IPC shape so refactors fail cheaply before E2E.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDirname, '../../../../../../..');

const COMPANY_SETTINGS_PATH = join(currentDirname, 'company-settings.tsx');
const WORKSPACE_SWITCHER_PATH = join(currentDirname, 'workspace-switcher.tsx');
const USE_COMPANIES_PATH = join(currentDirname, '..', '..', 'hooks', 'use-companies.ts');
const HIRE_DIALOG_PATH = join(currentDirname, '..', 'hire', 'hire-dialog.tsx');
const SHARED_ENTITIES_PATH = join(repoRoot, 'packages', 'shared-types', 'src', 'entities.ts');
const MAIN_HANDLERS_PATH = join(repoRoot, 'apps', 'desktop', 'src', 'main', 'ipc', 'handlers.ts');

const companySettingsSrc = readFileSync(COMPANY_SETTINGS_PATH, 'utf8');
const switcherSrc = readFileSync(WORKSPACE_SWITCHER_PATH, 'utf8');
const useCompaniesSrc = readFileSync(USE_COMPANIES_PATH, 'utf8');
const hireDialogSrc = readFileSync(HIRE_DIALOG_PATH, 'utf8');
const entitiesSrc = readFileSync(SHARED_ENTITIES_PATH, 'utf8');
const handlersSrc = readFileSync(MAIN_HANDLERS_PATH, 'utf8');

describe('CompanySettings (features/workspace/company-settings.tsx)', () => {
  it('exports a controlled sheet component wired to the existing Sheet primitive', () => {
    expect(companySettingsSrc).toContain('export function CompanySettings(');
    expect(companySettingsSrc).toContain('open: boolean');
    expect(companySettingsSrc).toContain('onOpenChange: (open: boolean) => void');
    expect(companySettingsSrc).toContain('company: Company | null');
    expect(companySettingsSrc).toContain("from '@/components/ui/sheet.js'");
    expect(companySettingsSrc).toMatch(
      /<Sheet\s+open=\{open\}\s+onOpenChange=\{handleOpenChange\}/,
    );
    expect(companySettingsSrc).toContain('data-company-settings-panel=""');
  });

  it('edits general company fields through ipc.companies.update', () => {
    expect(companySettingsSrc).toContain('ipc.companies.update');
    expect(companySettingsSrc).toContain('data-company-settings-field="name"');
    expect(companySettingsSrc).toContain('data-company-settings-field="slug"');
    expect(companySettingsSrc).toContain('data-company-settings-field="icon"');
    expect(companySettingsSrc).toContain('data-company-settings-theme={choice}');
    expect(companySettingsSrc).toContain('data-company-settings-save=""');
    expect(companySettingsSrc).toMatch(/companyId:\s*company\.id/);
  });

  it('hydrates the companies cache so switcher rename feedback is immediate', () => {
    expect(companySettingsSrc).toContain('useQueryClient');
    expect(companySettingsSrc).toMatch(/setQueryData<Company\[\]>\(\['companies'\]/);
    expect(companySettingsSrc).toMatch(/invalidateQueries\(\{ queryKey:\s*\['companies'\]\s*\}\)/);
  });

  it('gates archive and delete with distinct danger-zone controls', () => {
    expect(companySettingsSrc).toContain('ipc.companies.archive');
    expect(companySettingsSrc).toContain('ipc.companies.delete');
    expect(companySettingsSrc).toContain('data-company-settings-archive=""');
    expect(companySettingsSrc).toContain('data-company-settings-delete-confirm=""');
    expect(companySettingsSrc).toContain('data-company-settings-delete=""');
    expect(companySettingsSrc).toMatch(/<details[\s>]/);
    expect(companySettingsSrc).toMatch(/deleteConfirm\s*===\s*company\.name/);
  });
});

describe('WorkspaceSwitcher step-(c) integration', () => {
  it('opens CompanySettings from a live dropdown CTA', () => {
    expect(switcherSrc).toContain('import { CompanySettings }');
    expect(switcherSrc).toContain('const [settingsOpen, setSettingsOpen] = useState(false)');
    expect(switcherSrc).toContain('data-workspace-switcher-action="company-settings"');
    expect(switcherSrc).toMatch(/Company settings…/);
    expect(switcherSrc).toMatch(/onSelect=\{\(\)\s*=>\s*setSettingsOpen\(true\)\}/);
    expect(switcherSrc).toMatch(
      /<CompanySettings\s+open=\{settingsOpen\}\s+onOpenChange=\{setSettingsOpen\}\s+company=\{activeCompany\}\s*\/>/,
    );
  });

  it('filters archived companies out of the switcher-backed query by default', () => {
    expect(useCompaniesSrc).toMatch(/select:\s*\(companies\)\s*=>/);
    expect(useCompaniesSrc).toContain("company.status !== 'archived'");
  });
});

describe('Company wire shape step-(c) widening', () => {
  it('adds status/icon/theme to the public Company projection', () => {
    expect(entitiesSrc).toMatch(/export interface Company[\s\S]*?status:\s*CompanyStatus/);
    expect(entitiesSrc).toMatch(/export interface Company[\s\S]*?icon:\s*string\s*\|\s*null/);
    expect(entitiesSrc).toMatch(/export interface Company[\s\S]*?theme:\s*string/);
    expect(handlersSrc).toMatch(/status:\s*row\.status\s+as\s+CompanyStatus/);
    expect(handlersSrc).toMatch(/icon:\s*row\.icon/);
    expect(handlersSrc).toMatch(/theme:\s*row\.theme/);
  });
});

describe('HireDialog manager-select', () => {
  it('uses the employees hook and event sync for the reports-to picker', () => {
    expect(hireDialogSrc).toContain('import { useEmployeeEventSync, useEmployees }');
    expect(hireDialogSrc).toMatch(/useEmployeeEventSync\(companyId\)/);
    expect(hireDialogSrc).toMatch(/useEmployees\(companyId\)/);
  });

  it('renders a Reports to select backed by same-company employees', () => {
    expect(hireDialogSrc).toContain('const [managerId, setManagerId] = useState');
    expect(hireDialogSrc).toContain('data-hire-manager-select=""');
    expect(hireDialogSrc).toMatch(/Reports to \(optional\)/);
    expect(hireDialogSrc).toMatch(/employees\.map\(\(employee\)/);
  });

  it('sets the manager edge after employees.create resolves', () => {
    expect(hireDialogSrc).toContain('mutateAsync');
    expect(hireDialogSrc).toContain('ipc.employees.setManager');
    expect(hireDialogSrc).toMatch(/employeeId:\s*result\.employeeId/);
    expect(hireDialogSrc).toMatch(/managerId:\s*managerId/);
    expect(hireDialogSrc).toMatch(
      /invalidateQueries\(\{ queryKey:\s*\['orgchart',\s*companyId\]\s*\}\)/,
    );
  });
});
