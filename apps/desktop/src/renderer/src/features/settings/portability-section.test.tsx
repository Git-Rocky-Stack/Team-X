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
    expect(portabilityHooksSrc).toContain(
      'export function useCompanyTemplatePreview(packagePath: string | null)',
    );
    expect(portabilityHooksSrc).toContain("queryKey: ['company-template-preview', packagePath]");
    expect(portabilityHooksSrc).toContain(
      'ipc.companies.previewImportPackage({ packagePath: packagePath! })',
    );
    expect(portabilityHooksSrc).toContain(
      'export function useExportCompanyTemplate(companyId: string | null)',
    );
    expect(portabilityHooksSrc).toContain("mode: 'template'");
    expect(portabilityHooksSrc).toContain('export function useInstallCompanyTemplate()');
    expect(portabilityHooksSrc).toContain('ipc.companies.installTemplate({ packagePath })');
    expect(portabilityHooksSrc).toContain('export function useImportCompanyPackage()');
    expect(portabilityHooksSrc).toContain('mutationFn: ipc.companies.importPackage');
  });

  it('renders a visible template library, template export action, and local package install flow', () => {
    expect(portabilitySectionSrc).toContain('data-settings-portability=""');
    expect(portabilitySectionSrc).toContain('Portability & Templates');
    expect(portabilitySectionSrc).toContain('Save active workspace as template');
    expect(portabilitySectionSrc).toContain('Save Template');
    expect(portabilitySectionSrc).toContain('Install local template package');
    expect(portabilitySectionSrc).toContain('Install');
    expect(portabilitySectionSrc).toContain('Local template library');
    expect(portabilitySectionSrc).toContain('workspace switcher');
    expect(portabilitySectionSrc).toContain('useCompanyTemplates()');
    expect(portabilitySectionSrc).toContain('useExportCompanyTemplate(companyId)');
    expect(portabilitySectionSrc).toContain('useInstallCompanyTemplate()');
  });
});
