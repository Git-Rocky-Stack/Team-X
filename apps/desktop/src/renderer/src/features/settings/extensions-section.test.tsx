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

  it('does not mount the removed marketplace or simplified permission components', () => {
    expect(extensionsSectionSrc).not.toContain('SkillsMarketplace');
    expect(extensionsSectionSrc).not.toContain('McpMarketplace');
    expect(extensionsSectionSrc).not.toContain('SimplifiedPermissions');
    expect(extensionsSectionSrc).not.toContain('InstallCustomSkillDialog');
    expect(extensionsSectionSrc).not.toContain('InstallCustomMcpDialog');
    expect(extensionsSectionSrc).not.toContain('InstallSkillDialog');
    expect(extensionsSectionSrc).not.toContain('ImportMcpDialog');
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
