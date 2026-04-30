import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const SETTINGS_VIEW_PATH = join(currentDirname, 'settings-view.tsx');
const EXTENSIONS_SECTION_PATH = join(currentDirname, 'extensions-section.tsx');
const GRANT_AUTHORITY_DIALOG_PATH = join(currentDirname, 'grant-authority-dialog.tsx');
const IMPORT_MCP_DIALOG_PATH = join(currentDirname, 'import-mcp-dialog.tsx');
const INSTALL_SKILL_DIALOG_PATH = join(currentDirname, 'install-skill-dialog.tsx');
const SETTINGS_HOOKS_PATH = join(currentDirname, '..', '..', 'hooks', 'use-settings.ts');
const EXTENSIONS_HOOKS_PATH = join(currentDirname, '..', '..', 'hooks', 'use-extensions.ts');

const settingsViewSrc = readFileSync(SETTINGS_VIEW_PATH, 'utf8');
const extensionsSectionSrc = readFileSync(EXTENSIONS_SECTION_PATH, 'utf8');
const grantAuthorityDialogSrc = readFileSync(GRANT_AUTHORITY_DIALOG_PATH, 'utf8');
const importMcpDialogSrc = readFileSync(IMPORT_MCP_DIALOG_PATH, 'utf8');
const installSkillDialogSrc = readFileSync(INSTALL_SKILL_DIALOG_PATH, 'utf8');
const settingsHooksSrc = readFileSync(SETTINGS_HOOKS_PATH, 'utf8');
const extensionsHooksSrc = readFileSync(EXTENSIONS_HOOKS_PATH, 'utf8');

describe('Extensions & Authority settings shell', () => {
  it('mounts the new section inside SettingsView', () => {
    expect(settingsViewSrc).toContain(
      "import { ExtensionsSection } from './extensions-section.js';",
    );
    expect(settingsViewSrc).toContain('<ExtensionsSection />');
  });

  it('adds typed settings hooks for extensions autonomy', () => {
    expect(settingsHooksSrc).toContain('SettingsSetExtensionsRequest');
    expect(settingsHooksSrc).toContain("queryKey: ['settings', 'extensions']");
    expect(settingsHooksSrc).toContain('ipc.settings.getExtensions()');
    expect(settingsHooksSrc).toContain('ipc.settings.setExtensions(req)');
  });

  it('adds company-scoped hooks for extensions, authority, and MCP server read models', () => {
    expect(extensionsHooksSrc).toContain(
      'export function useInstalledExtensions(companyId: string | null)',
    );
    expect(extensionsHooksSrc).toContain("queryKey: ['extensions', companyId]");
    expect(extensionsHooksSrc).toContain(
      "ipc.extensions.list(requireString(companyId, 'companyId'))",
    );
    expect(extensionsHooksSrc).toContain(
      'export function useSkillAssignments(companyId: string | null)',
    );
    expect(extensionsHooksSrc).toContain("queryKey: ['skill-assignments', companyId]");
    expect(extensionsHooksSrc).toContain(
      "ipc.extensions.listSkillAssignments(requireString(companyId, 'companyId'))",
    );
    expect(extensionsHooksSrc).toContain(
      'export function useInstallLocalSkill(companyId: string | null)',
    );
    expect(extensionsHooksSrc).toContain('ipc.extensions.installLocalSkill');
    expect(extensionsHooksSrc).toContain(
      'export function useInstallGithubSkill(companyId: string | null)',
    );
    expect(extensionsHooksSrc).toContain('ipc.extensions.installGithubSkill');
    expect(extensionsHooksSrc).toContain(
      'export function useRemoveSkill(companyId: string | null)',
    );
    expect(extensionsHooksSrc).toContain('ipc.extensions.removeSkill({');
    expect(extensionsHooksSrc).toContain(
      'export function useUpsertSkillAssignment(companyId: string | null)',
    );
    expect(extensionsHooksSrc).toContain('ipc.extensions.upsertSkillAssignment');
    expect(extensionsHooksSrc).toContain(
      'export function useDeleteSkillAssignment(companyId: string | null)',
    );
    expect(extensionsHooksSrc).toContain('ipc.extensions.deleteSkillAssignment(assignmentId)');
    expect(extensionsHooksSrc).toContain(
      'export function useAuthorityGrants(companyId: string | null, employeeId?: string | null)',
    );
    expect(extensionsHooksSrc).toContain("queryKey: ['authority', companyId, employeeId ?? null]");
    expect(extensionsHooksSrc).toContain('export function useAuthorityRequests(');
    expect(extensionsHooksSrc).toContain("queryKey: ['authority-requests', companyId, status]");
    expect(extensionsHooksSrc).toContain("queryKey: ['mcp', companyId]");
    expect(extensionsHooksSrc).toContain(
      'export function useMcpTemplates(companyId: string | null)',
    );
    expect(extensionsHooksSrc).toContain("queryKey: ['mcp-templates', companyId]");
    expect(extensionsHooksSrc).toContain('export function useCreateAuthorityGrant()');
    expect(extensionsHooksSrc).toContain('ipc.authority.create');
    expect(extensionsHooksSrc).toContain(
      'export function useDeleteAuthorityGrant(companyId: string | null)',
    );
    expect(extensionsHooksSrc).toContain('ipc.authority.delete(grantId)');
    expect(extensionsHooksSrc).toContain(
      'export function useReviewAuthorityRequest(companyId: string | null)',
    );
    expect(extensionsHooksSrc).toContain('ipc.approvals.review');
    expect(extensionsHooksSrc).toContain(
      'export function useEffectiveAuthority(companyId: string | null, employeeId: string | null)',
    );
    expect(extensionsHooksSrc).toContain('ipc.authority.getEffective({');
    expect(extensionsHooksSrc).toContain("companyId: requireString(companyId, 'companyId')");
    expect(extensionsHooksSrc).toContain("employeeId: requireString(employeeId, 'employeeId')");
    expect(extensionsHooksSrc).toContain(
      'export function useAddMcpServer(companyId: string | null)',
    );
    expect(extensionsHooksSrc).toContain('ipc.mcp.addServer');
    expect(extensionsHooksSrc).toContain(
      'export function useInstallMcpTemplate(companyId: string | null)',
    );
    expect(extensionsHooksSrc).toContain('ipc.mcp.installTemplate');
    expect(extensionsHooksSrc).toContain(
      'export function useToggleMcpServer(companyId: string | null)',
    );
    expect(extensionsHooksSrc).toContain('ipc.mcp.toggle(serverId, enabled)');
    expect(extensionsHooksSrc).toContain(
      'export function useRemoveMcpServer(companyId: string | null)',
    );
    expect(extensionsHooksSrc).toContain('ipc.mcp.removeServer(serverId)');
    expect(extensionsHooksSrc).toContain('export function useTestMcpConnection()');
    expect(extensionsHooksSrc).toContain('ipc.mcp.testConnection');
  });

  it('renders the four control-plane cards with visible next actions', () => {
    expect(extensionsSectionSrc).toContain('Autonomy Policy');
    expect(extensionsSectionSrc).toContain('SkillsMarketplace');
    expect(extensionsSectionSrc).toContain('McpMarketplace');
    expect(extensionsSectionSrc).toContain('SimplifiedPermissions');
    expect(extensionsSectionSrc).toContain('Advanced Authority Matrix');
    expect(extensionsSectionSrc).toContain('Install Skill');
    expect(extensionsSectionSrc).toContain('Manage Skills');
    expect(extensionsSectionSrc).toContain('data-manage-skills=""');
    expect(extensionsSectionSrc).toContain('data-skills-management-panel=""');
    expect(extensionsSectionSrc).toContain('onInstallMcp={async (templateId) =>');
    expect(extensionsSectionSrc).toContain('installMcpTemplate.mutateAsync');
    expect(extensionsSectionSrc).toContain('Add Grant');
    expect(extensionsSectionSrc).toContain('data-authority-add-grant=""');
    expect(extensionsSectionSrc).toContain('Direct authority editor');
    expect(extensionsSectionSrc).toContain('data-authority-user-editor=""');
    expect(extensionsSectionSrc).toContain('Workspace capability');
    expect(extensionsSectionSrc).toContain('Workspace path');
    expect(extensionsSectionSrc).toContain('Grant capability');
    expect(extensionsSectionSrc).toContain('Grant path');
    expect(extensionsSectionSrc).toContain('data-authority-employee-capability=""');
    expect(extensionsSectionSrc).toContain('data-authority-employee-path=""');
    expect(extensionsSectionSrc).toContain('Pending reviews');
    expect(extensionsSectionSrc).toContain('Workspace assignment');
    expect(extensionsSectionSrc).toContain('Employee overrides');
    expect(extensionsSectionSrc).toContain('data-skill-remove=""');
    expect(extensionsSectionSrc).toContain('Remove Skill');
    expect(extensionsSectionSrc).toContain('installedMcpServers');
    expect(extensionsSectionSrc).toContain('data-mcp-remove=""');
    expect(extensionsSectionSrc).toContain('Remove MCP');
    expect(extensionsSectionSrc).toContain('EXTENSIONS_AUTONOMY_MODES.map');
    expect(extensionsSectionSrc).toContain('Effective preview');
    expect(extensionsSectionSrc).toContain('Authority preview employee');
    expect(extensionsSectionSrc).toContain('Path grants are Windows-safe');
    expect(extensionsSectionSrc).toContain('case-insensitive, and');
    expect(extensionsSectionSrc).toContain('directory-prefix matched.');
    expect(extensionsSectionSrc).toContain("useAuthorityRequests(companyId, 'pending')");
    expect(extensionsSectionSrc).toContain('useReviewAuthorityRequest(companyId)');
    expect(extensionsSectionSrc).toContain('Approve');
    expect(extensionsSectionSrc).toContain('Deny');
    expect(extensionsSectionSrc).toContain('Remove');
    expect(extensionsSectionSrc).toContain('Disable');
    expect(extensionsSectionSrc).toContain('useSkillAssignments(companyId)');
    expect(extensionsSectionSrc).toContain('useUpsertSkillAssignment(companyId)');
    expect(extensionsSectionSrc).toContain('useDeleteSkillAssignment(companyId)');
    expect(extensionsSectionSrc).toContain('<InstallSkillDialog');
    expect(extensionsSectionSrc).toContain('<InstallCustomSkillDialog');
    expect(extensionsSectionSrc).toContain('useToggleMcpServer(companyId)');
    expect(extensionsSectionSrc).toContain('useAddMcpServer(companyId)');
    expect(extensionsSectionSrc).toContain('useInstallMcpTemplate(companyId)');
    expect(extensionsSectionSrc).toContain('useTestMcpConnection()');
    expect(extensionsSectionSrc).toContain('<ImportMcpDialog');
    expect(extensionsSectionSrc).toContain('<InstallCustomMcpDialog');
  });

  it('adds a direct authority grant dialog for capability and path resources', () => {
    expect(extensionsSectionSrc).toContain('initialScopeKind={grantDialogDefaults.scopeKind}');
    expect(extensionsSectionSrc).toContain(
      'initialResourceKind={grantDialogDefaults.resourceKind}',
    );
    expect(extensionsSectionSrc).toContain("resourceKind: 'capability'");
    expect(extensionsSectionSrc).toContain("resourceKind: 'path'");
    expect(extensionsSectionSrc).toContain('openGrantDialog({');
    expect(grantAuthorityDialogSrc).toContain('Grant Authority');
    expect(grantAuthorityDialogSrc).toContain('Resource Type');
    expect(grantAuthorityDialogSrc).toContain('Capability');
    expect(grantAuthorityDialogSrc).toContain('Custom Capability');
    expect(grantAuthorityDialogSrc).toContain('COMMON_CAPABILITIES');
    expect(grantAuthorityDialogSrc).toContain('data-authority-grant-submit=""');
    expect(grantAuthorityDialogSrc).toContain('resourceKind,');
  });

  it('adds a skill install dialog for editable local folders and public URLs', () => {
    expect(installSkillDialogSrc).toContain('Install Skill');
    expect(installSkillDialogSrc).toContain('Local Folder');
    expect(installSkillDialogSrc).toContain('Public URL');
    expect(installSkillDialogSrc).toContain('teamx-skill.json');
    expect(installSkillDialogSrc).toContain('data-skill-folder-path=""');
    expect(installSkillDialogSrc).toContain('data-skill-folder-browse=""');
    expect(installSkillDialogSrc).toContain('window.teamx.system.selectDirectory()');
    expect(installSkillDialogSrc).toContain('LAST_LOCAL_SKILL_PATH_KEY');
    expect(installSkillDialogSrc).toContain('Install Local Skill');
    expect(installSkillDialogSrc).toContain('Install from URL');
    expect(installSkillDialogSrc).toContain('useInstallLocalSkill(companyId)');
    expect(installSkillDialogSrc).toContain('useInstallGithubSkill(companyId)');
  });

  it('adds template and manual MCP import flows with transport-specific config fields', () => {
    expect(importMcpDialogSrc).toContain('Import MCP');
    expect(importMcpDialogSrc).toContain('Built-in Template');
    expect(importMcpDialogSrc).toContain('Install Template');
    expect(importMcpDialogSrc).toContain('Test Connection');
    expect(importMcpDialogSrc).toContain(
      'Install a built-in MCP template or register a workspace-scoped stdio/SSE server.',
    );
    expect(importMcpDialogSrc).toContain('Environment JSON');
    expect(importMcpDialogSrc).toContain('SSE URL');
  });
});
