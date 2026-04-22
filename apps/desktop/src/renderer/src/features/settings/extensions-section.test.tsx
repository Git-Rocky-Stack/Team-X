import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const SETTINGS_VIEW_PATH = join(currentDirname, 'settings-view.tsx');
const EXTENSIONS_SECTION_PATH = join(currentDirname, 'extensions-section.tsx');
const IMPORT_MCP_DIALOG_PATH = join(currentDirname, 'import-mcp-dialog.tsx');
const SETTINGS_HOOKS_PATH = join(currentDirname, '..', '..', 'hooks', 'use-settings.ts');
const EXTENSIONS_HOOKS_PATH = join(currentDirname, '..', '..', 'hooks', 'use-extensions.ts');

const settingsViewSrc = readFileSync(SETTINGS_VIEW_PATH, 'utf8');
const extensionsSectionSrc = readFileSync(EXTENSIONS_SECTION_PATH, 'utf8');
const importMcpDialogSrc = readFileSync(IMPORT_MCP_DIALOG_PATH, 'utf8');
const settingsHooksSrc = readFileSync(SETTINGS_HOOKS_PATH, 'utf8');
const extensionsHooksSrc = readFileSync(EXTENSIONS_HOOKS_PATH, 'utf8');

describe('Extensions & Authority settings shell', () => {
  it('mounts the new section inside SettingsView', () => {
    expect(settingsViewSrc).toContain("import { ExtensionsSection } from './extensions-section.js';");
    expect(settingsViewSrc).toContain('<ExtensionsSection />');
  });

  it('adds typed settings hooks for extensions autonomy', () => {
    expect(settingsHooksSrc).toContain('SettingsSetExtensionsRequest');
    expect(settingsHooksSrc).toContain("queryKey: ['settings', 'extensions']");
    expect(settingsHooksSrc).toContain('ipc.settings.getExtensions()');
    expect(settingsHooksSrc).toContain('ipc.settings.setExtensions(req)');
  });

  it('adds company-scoped hooks for extensions, authority, and MCP server read models', () => {
    expect(extensionsHooksSrc).toContain('export function useInstalledExtensions(companyId: string | null)');
    expect(extensionsHooksSrc).toContain("queryKey: ['extensions', companyId]");
    expect(extensionsHooksSrc).toContain('ipc.extensions.list(companyId!)');
    expect(extensionsHooksSrc).toContain('export function useAuthorityGrants(companyId: string | null, employeeId?: string | null)');
    expect(extensionsHooksSrc).toContain("queryKey: ['authority', companyId, employeeId ?? null]");
    expect(extensionsHooksSrc).toContain("queryKey: ['mcp', companyId]");
    expect(extensionsHooksSrc).toContain('export function useCreateAuthorityGrant()');
    expect(extensionsHooksSrc).toContain('ipc.authority.create');
    expect(extensionsHooksSrc).toContain('export function useDeleteAuthorityGrant(companyId: string | null)');
    expect(extensionsHooksSrc).toContain('ipc.authority.delete(grantId)');
    expect(extensionsHooksSrc).toContain('export function useEffectiveAuthority(companyId: string | null, employeeId: string | null)');
    expect(extensionsHooksSrc).toContain('ipc.authority.getEffective({ companyId: companyId!, employeeId: employeeId! })');
    expect(extensionsHooksSrc).toContain('export function useAddMcpServer(companyId: string | null)');
    expect(extensionsHooksSrc).toContain('ipc.mcp.addServer');
    expect(extensionsHooksSrc).toContain('export function useToggleMcpServer(companyId: string | null)');
    expect(extensionsHooksSrc).toContain('ipc.mcp.toggle(serverId, enabled)');
    expect(extensionsHooksSrc).toContain('export function useRemoveMcpServer(companyId: string | null)');
    expect(extensionsHooksSrc).toContain('ipc.mcp.removeServer(serverId)');
    expect(extensionsHooksSrc).toContain('export function useTestMcpConnection()');
    expect(extensionsHooksSrc).toContain('ipc.mcp.testConnection');
  });

  it('renders the four control-plane cards with visible next actions', () => {
    expect(extensionsSectionSrc).toContain('Autonomy Policy');
    expect(extensionsSectionSrc).toContain('Installed Skills');
    expect(extensionsSectionSrc).toContain('MCP Servers');
    expect(extensionsSectionSrc).toContain('Authority Matrix');
    expect(extensionsSectionSrc).toContain('Install Skill');
    expect(extensionsSectionSrc).toContain('Import MCP');
    expect(extensionsSectionSrc).toContain('Grant Path');
    expect(extensionsSectionSrc).toContain('EXTENSIONS_AUTONOMY_MODES.map');
    expect(extensionsSectionSrc).toContain('Effective preview');
    expect(extensionsSectionSrc).toContain('Authority preview employee');
    expect(extensionsSectionSrc).toContain('Remove');
    expect(extensionsSectionSrc).toContain('Disable');
    expect(extensionsSectionSrc).toContain('useToggleMcpServer(companyId)');
    expect(extensionsSectionSrc).toContain('<ImportMcpDialog');
  });

  it('adds a manual MCP import dialog with transport-specific config fields', () => {
    expect(importMcpDialogSrc).toContain('Import MCP');
    expect(importMcpDialogSrc).toContain('Test Connection');
    expect(importMcpDialogSrc).toContain('Register a workspace-scoped MCP server over stdio or SSE.');
    expect(importMcpDialogSrc).toContain('Environment JSON');
    expect(importMcpDialogSrc).toContain('SSE URL');
  });
});
