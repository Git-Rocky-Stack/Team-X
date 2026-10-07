import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const SETTINGS_VIEW_PATH = join(currentDirname, 'settings-view.tsx');
const EXTENSIONS_SECTION_PATH = join(currentDirname, 'extensions-section.tsx');
const SETTINGS_HOOKS_PATH = join(currentDirname, '..', '..', 'hooks', 'use-settings.ts');
const EXTENSIONS_HOOKS_PATH = join(currentDirname, '..', '..', 'hooks', 'use-extensions.ts');

const settingsViewSrc = readFileSync(SETTINGS_VIEW_PATH, 'utf8');
const extensionsSectionSrc = readFileSync(EXTENSIONS_SECTION_PATH, 'utf8');
const settingsHooksSrc = readFileSync(SETTINGS_HOOKS_PATH, 'utf8');
const extensionsHooksSrc = readFileSync(EXTENSIONS_HOOKS_PATH, 'utf8');

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

  it('color-codes active authority permissions with distinct console status lamps', () => {
    // Permission is a tri-state STATUS, so it rides the console annunciator
    // LampTile (a Badge/Tag is neutral — status must be a lamp). Three distinct
    // lamps preserve the original's at-a-glance coding: allow = GO (green),
    // deny = NO-GO (red), prompt = HOLD (the original amber, which a red `warn`
    // would have erased). The hand-rolled permissionBadgeClass is retired.
    expect(extensionsSectionSrc).toContain(
      'const PERMISSION_TONE: Record<AuthorityPermission, LampTone>',
    );
    expect(extensionsSectionSrc).toContain("allow: 'go',");
    expect(extensionsSectionSrc).toContain("deny: 'nogo',");
    expect(extensionsSectionSrc).toContain("prompt: 'hold',");
    expect(extensionsSectionSrc).toContain('tone={PERMISSION_TONE[grant.permission]}');
    expect(extensionsSectionSrc).not.toContain('permissionBadgeClass');
    expect(extensionsSectionSrc).not.toContain('bg-brand-900');
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

  it('keeps the retired marketplace helper modules deleted', () => {
    // The sandbox-safety sweep that used to live here guarded
    // `data/permission-presets.ts`, `data/built-in-mcp-templates.ts` and
    // `lib/renderer-environment.ts`. All three were reachable only from the
    // unmounted marketplace / simplified-permission components asserted
    // above, so they were deleted with them. Pin their absence rather than
    // re-testing files that no longer ship.
    const rendererRoot = join(currentDirname, '..', '..');
    for (const relative of [
      join('data', 'permission-presets.ts'),
      join('data', 'built-in-mcp-templates.ts'),
      join('data', 'built-in-skills.ts'),
      join('lib', 'renderer-environment.ts'),
    ]) {
      expect(existsSync(join(rendererRoot, relative))).toBe(false);
    }
  });
});
