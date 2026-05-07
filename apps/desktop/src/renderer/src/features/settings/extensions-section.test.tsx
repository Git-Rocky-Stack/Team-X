import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const SETTINGS_VIEW_PATH = join(currentDirname, 'settings-view.tsx');
const EXTENSIONS_SECTION_PATH = join(currentDirname, 'extensions-section.tsx');
const SETTINGS_HOOKS_PATH = join(currentDirname, '..', '..', 'hooks', 'use-settings.ts');
const EXTENSIONS_HOOKS_PATH = join(currentDirname, '..', '..', 'hooks', 'use-extensions.ts');
const PERMISSION_PRESETS_PATH = join(currentDirname, '..', '..', 'data', 'permission-presets.ts');
const BUILT_IN_MCP_TEMPLATES_PATH = join(
  currentDirname,
  '..',
  '..',
  'data',
  'built-in-mcp-templates.ts',
);
const RENDERER_ENVIRONMENT_PATH = join(
  currentDirname,
  '..',
  '..',
  'lib',
  'renderer-environment.ts',
);

const settingsViewSrc = readFileSync(SETTINGS_VIEW_PATH, 'utf8');
const extensionsSectionSrc = readFileSync(EXTENSIONS_SECTION_PATH, 'utf8');
const settingsHooksSrc = readFileSync(SETTINGS_HOOKS_PATH, 'utf8');
const extensionsHooksSrc = readFileSync(EXTENSIONS_HOOKS_PATH, 'utf8');
const permissionPresetsSrc = readFileSync(PERMISSION_PRESETS_PATH, 'utf8');
const builtInMcpTemplatesSrc = readFileSync(BUILT_IN_MCP_TEMPLATES_PATH, 'utf8');
const rendererEnvironmentSrc = readFileSync(RENDERER_ENVIRONMENT_PATH, 'utf8');

describe('Extensions & Authority settings shell', () => {
  it('mounts the section inside SettingsView', () => {
    expect(settingsViewSrc).toContain(
      "import { ExtensionsSection } from './extensions-section.js';",
    );
    expect(settingsViewSrc).toContain('<ExtensionsSection />');
  });

  it('keeps typed hooks for the stable authority surface', () => {
    expect(settingsHooksSrc).toContain('SettingsSetExtensionsRequest');
    expect(settingsHooksSrc).toContain("queryKey: ['settings', 'extensions']");
    expect(settingsHooksSrc).toContain('ipc.settings.getExtensions()');
    expect(settingsHooksSrc).toContain('ipc.settings.setExtensions(req)');
    expect(extensionsHooksSrc).toContain(
      'export function useInstalledExtensions(companyId: string | null)',
    );
    expect(extensionsHooksSrc).toContain('export function useAuthorityRequests(');
    expect(extensionsHooksSrc).toContain(
      'export function useAuthorityGrants(companyId: string | null, employeeId?: string | null)',
    );
    expect(extensionsHooksSrc).toContain(
      'export function useReviewAuthorityRequest(companyId: string | null)',
    );
    expect(extensionsHooksSrc).toContain(
      'export function useDeleteAuthorityGrant(companyId: string | null)',
    );
    expect(extensionsHooksSrc).toContain("queryKey: ['mcp', companyId]");
  });

  it('renders only the conservative stable control surface in Settings', () => {
    expect(extensionsSectionSrc).toContain('data-extensions-authority-stable=""');
    expect(extensionsSectionSrc).toContain('Autonomy Policy');
    expect(extensionsSectionSrc).toContain('Authority Snapshot');
    expect(extensionsSectionSrc).toContain('Pending Authority Reviews');
    expect(extensionsSectionSrc).toContain('Active Authority Grants');
    expect(extensionsSectionSrc).toContain("useAuthorityRequests(companyId, 'pending')");
    expect(extensionsSectionSrc).toContain('useReviewAuthorityRequest(companyId)');
    expect(extensionsSectionSrc).toContain('useDeleteAuthorityGrant(companyId)');
    expect(extensionsSectionSrc).toContain('Approve');
    expect(extensionsSectionSrc).toContain('Deny');
    expect(extensionsSectionSrc).toContain('Remove');
  });

  it('keeps active authority permission badges visibly color-coded on AMOLED settings', () => {
    expect(extensionsSectionSrc).toContain('function permissionBadgeClass(');
    expect(extensionsSectionSrc).toContain('border-brand-500/65 bg-brand-900/75 text-red-50');
    expect(extensionsSectionSrc).toContain('border-red-500/55 bg-red-950/70 text-red-100');
    expect(extensionsSectionSrc).toContain('border-amber-500/55 bg-amber-950/70 text-amber-100');
    expect(extensionsSectionSrc).toContain(
      '<Badge variant="outline" className={permissionBadgeClass(grant.permission)}>',
    );
  });

  it('does not mount the removed marketplace or simplified permission components', () => {
    expect(extensionsSectionSrc).not.toContain('SkillsMarketplace');
    expect(extensionsSectionSrc).not.toContain('McpMarketplace');
    expect(extensionsSectionSrc).not.toContain('SimplifiedPermissions');
    expect(extensionsSectionSrc).not.toContain('InstallCustomSkillDialog');
    expect(extensionsSectionSrc).not.toContain('InstallCustomMcpDialog');
  });

  it('hosts the Add Skill and Add MCP install entry points on the Authority Snapshot card', () => {
    // Phase 6 follow-up — Authority Snapshot is the canonical location for
    // direct Skill / MCP installs from Settings (CLI extensions deferred
    // pending the agentic system design pass). The card surfaces two
    // buttons that open the existing install dialogs; the dialogs
    // themselves are unchanged from their previous use sites.
    expect(extensionsSectionSrc).toContain(
      "import { InstallSkillDialog } from './install-skill-dialog.js';",
    );
    expect(extensionsSectionSrc).toContain(
      "import { ImportMcpDialog } from './import-mcp-dialog.js';",
    );
    expect(extensionsSectionSrc).toContain('data-extension-add-skill=""');
    expect(extensionsSectionSrc).toContain('data-extension-add-mcp=""');
    expect(extensionsSectionSrc).toContain('<InstallSkillDialog');
    expect(extensionsSectionSrc).toContain('<ImportMcpDialog');
    expect(extensionsSectionSrc).toContain('Add Skill');
    expect(extensionsSectionSrc).toContain('Add MCP');
  });

  it('keeps Settings extension helpers safe for the packaged renderer sandbox', () => {
    for (const src of [permissionPresetsSrc, builtInMcpTemplatesSrc]) {
      expect(src).not.toContain('process.env');
      expect(src).not.toContain('process.platform');
      expect(src).not.toContain('process.cwd');
    }
    expect(permissionPresetsSrc).toContain('@/lib/renderer-environment.js');
    expect(builtInMcpTemplatesSrc).toContain('@/lib/renderer-environment.js');
    expect(rendererEnvironmentSrc).toContain('getRendererPlatform');
    expect(rendererEnvironmentSrc).toContain('globalThis.navigator');
  });
});
