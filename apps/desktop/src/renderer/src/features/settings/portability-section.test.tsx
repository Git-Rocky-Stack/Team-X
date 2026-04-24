import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const SETTINGS_VIEW_PATH = join(currentDirname, 'settings-view.tsx');
const PORTABILITY_SECTION_PATH = join(currentDirname, 'portability-section.tsx');
const PORTABILITY_HOOKS_PATH = join(
  currentDirname,
  '..',
  '..',
  'hooks',
  'use-company-portability.ts',
);

const settingsViewSrc = readFileSync(SETTINGS_VIEW_PATH, 'utf8');
const portabilitySectionSrc = readFileSync(PORTABILITY_SECTION_PATH, 'utf8');
const portabilityHooksSrc = readFileSync(PORTABILITY_HOOKS_PATH, 'utf8');

describe('Portability settings shell', () => {
  it('mounts the portability section inside SettingsView with a focusable anchor', () => {
    expect(settingsViewSrc).toContain(
      "import { PortabilitySection } from './portability-section.js';",
    );
    expect(settingsViewSrc).toContain('<PortabilitySection />');
    expect(settingsViewSrc).toContain('data-settings-section="portability"');
  });

  it('adds typed hooks for company template listing, preview, export, install, and import', () => {
    expect(portabilityHooksSrc).toContain('export function useCompanyTemplates()');
    expect(portabilityHooksSrc).toContain("queryKey: ['company-templates']");
    expect(portabilityHooksSrc).toContain('ipc.companies.listTemplates()');
    expect(portabilityHooksSrc).toContain('export function useCompanyPackagePreview(packagePath: string | null)');
    expect(portabilityHooksSrc).toContain(
      'export function useCompanyTemplatePreview(packagePath: string | null)',
    );
    expect(portabilityHooksSrc).toContain("queryKey: ['company-template-preview', packagePath]");
    expect(portabilityHooksSrc).toContain('ipc.companies.previewImportPackage({');
    expect(portabilityHooksSrc).toContain("packagePath: requireString(packagePath, 'packagePath')");
    expect(portabilityHooksSrc).toContain(
      'export function useExportCompanyPackage(',
    );
    expect(portabilityHooksSrc).toContain(
      'export function useExportCompanyTemplate(companyId: string | null)',
    );
    expect(portabilityHooksSrc).toContain(
      "export function useExportWorkspacePackage(companyId: string | null)",
    );
    expect(portabilityHooksSrc).toContain("useExportCompanyPackage(companyId, 'template')");
    expect(portabilityHooksSrc).toContain(
      "useExportCompanyPackage(companyId, 'workspace-export')",
    );
    expect(portabilityHooksSrc).toContain("companyId: requireString(companyId, 'companyId')");
    expect(portabilityHooksSrc).toContain(
      'export function useInstallCompanyTemplate(companyId: string | null = null)',
    );
    expect(portabilityHooksSrc).toContain('ipc.companies.installTemplate({');
    expect(portabilityHooksSrc).toContain('...(companyId ? { companyId } : {}),');
    expect(portabilityHooksSrc).toContain('export function useImportCompanyPackage()');
    expect(portabilityHooksSrc).toContain('mutationFn: ipc.companies.importPackage');
    expect(portabilityHooksSrc).toContain("qc.invalidateQueries({ queryKey: ['companies'] })");
  });

  it('renders sharing posture, export flows, manifest preview, import/install states, and the template library', () => {
    expect(portabilitySectionSrc).toContain('data-settings-portability=""');
    expect(portabilitySectionSrc).toContain('Portability & Templates');
    expect(portabilitySectionSrc).toContain('Sharing posture');
    expect(portabilitySectionSrc).toContain('Choose the workspace’s intended sharing mode');
    expect(portabilitySectionSrc).toContain("useSharingReadiness(companyId)");
    expect(portabilitySectionSrc).toContain('ipc.companies.update');
    expect(portabilitySectionSrc).toContain('Export active workspace package');
    expect(portabilitySectionSrc).toContain('Export Package');
    expect(portabilitySectionSrc).toContain('Save active workspace as template');
    expect(portabilitySectionSrc).toContain('Save Template');
    expect(portabilitySectionSrc).toContain('Preview import or template package');
    expect(portabilitySectionSrc).toContain('Manifest Preview');
    expect(portabilitySectionSrc).toContain('Warnings');
    expect(portabilitySectionSrc).toContain('Missing Secrets');
    expect(portabilitySectionSrc).toContain('Import as new workspace');
    expect(portabilitySectionSrc).toContain('Import Workspace');
    expect(portabilitySectionSrc).toContain('Install into local library');
    expect(portabilitySectionSrc).toContain('Install Template');
    expect(portabilitySectionSrc).toContain('data-portability-manifest-preview=""');
    expect(portabilitySectionSrc).toContain('useCompanyPackagePreview(');
    expect(portabilitySectionSrc).toContain('useExportWorkspacePackage(companyId)');
    expect(portabilitySectionSrc).toContain('useImportCompanyPackage()');
    expect(portabilitySectionSrc).toContain('setCompanyId(result.companyId);');
    expect(portabilitySectionSrc).toContain('Local template library');
    expect(portabilitySectionSrc).toContain('workspace switcher');
    expect(portabilitySectionSrc).toContain('useCompanyTemplates()');
    expect(portabilitySectionSrc).toContain('useExportCompanyTemplate(companyId)');
    expect(portabilitySectionSrc).toContain('useInstallCompanyTemplate(companyId)');
  });
});
