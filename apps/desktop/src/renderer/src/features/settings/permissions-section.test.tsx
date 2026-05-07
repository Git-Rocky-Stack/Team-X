/**
 * Source inspection tests for PermissionsSection component.
 *
 * Tests the preset-based permissions UX with three levels:
 * - safe: read-only access to documents, vault search
 * - standard: full filesystem access in allowed folders, shell commands
 * - advanced: all capabilities, custom paths, full control
 *
 * Phase 6 — Proactive Execution System — Slice 5
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const PERMISSIONS_SECTION_PATH = join(currentDirname, 'permissions-section.tsx');
const SETTINGS_VIEW_PATH = join(currentDirname, 'settings-view.tsx');

const permissionsSectionSrc = readFileSync(PERMISSIONS_SECTION_PATH, 'utf8');
const settingsViewSrc = readFileSync(SETTINGS_VIEW_PATH, 'utf8');

describe('PermissionsSection component', () => {
  describe('settings-view integration', () => {
    it('mounts the section inside SettingsView', () => {
      expect(settingsViewSrc).toContain(
        "import { PermissionsSection } from './permissions-section.js';",
      );
      expect(settingsViewSrc).toContain('<PermissionsSection />');
    });
  });

  describe('preset definitions', () => {
    it('defines three presets: safe, standard, and advanced', () => {
      expect(permissionsSectionSrc).toContain('safe:');
      expect(permissionsSectionSrc).toContain('standard:');
      expect(permissionsSectionSrc).toContain('advanced:');
    });

    it('safe preset includes read-only capabilities', () => {
      // Safe mode should have filesystem.read and vault.search
      expect(permissionsSectionSrc).toContain("'filesystem.read', 'vault.search'");
    });

    it('standard preset includes write and shell capabilities', () => {
      // Standard should add filesystem.write and shell
      expect(permissionsSectionSrc).toContain("'filesystem.read', 'filesystem.write', 'shell'");
    });

    it('advanced preset grants all capabilities', () => {
      // Advanced uses wildcard for all capabilities
      expect(permissionsSectionSrc).toContain("capabilities: ['*']");
    });

    it('each preset has a label and description', () => {
      expect(permissionsSectionSrc).toContain('label:');
      expect(permissionsSectionSrc).toContain('description:');
    });

    it('defines default paths for safe and standard presets', () => {
      expect(permissionsSectionSrc).toContain('defaultPaths:');
      expect(permissionsSectionSrc).toContain('{{documents}}');
      expect(permissionsSectionSrc).toContain('{{desktop}}');
      expect(permissionsSectionSrc).toContain('{{downloads}}');
    });

    it('advanced preset has empty default paths (user-defined only)', () => {
      // Advanced should have empty array for defaultPaths
      expect(permissionsSectionSrc).toMatch(/advanced:.*defaultPaths:\s*\[\]/s);
    });
  });

  describe('preset card rendering', () => {
    it('renders preset cards with proper data-testid attributes', () => {
      expect(permissionsSectionSrc).toContain('data-testid={`preset-card-${key}`}');
    });

    it('displays preset label with capitalize styling', () => {
      expect(permissionsSectionSrc).toContain('capitalize');
    });

    it('shows Active badge for selected preset', () => {
      expect(permissionsSectionSrc).toContain('Active');
    });

    it('shows allowed paths for presets with defaultPaths', () => {
      expect(permissionsSectionSrc).toContain('Allowed Paths:');
    });

    it('shows custom message for advanced preset (no default paths)', () => {
      expect(permissionsSectionSrc).toContain('User-defined paths only');
    });
  });

  describe('preset selection behavior', () => {
    it('uses radio inputs for preset selection', () => {
      expect(permissionsSectionSrc).toContain('type="radio"');
      expect(permissionsSectionSrc).toContain('name="preset"');
    });

    it('highlights selected preset with the brand-selected primitive', () => {
      // The active-state visual is owned by the `.brand-selected` reusable
      // primitive defined in `apps/desktop/src/renderer/src/styles/globals.css`
      // (the canonical "select one of N" chooser style per CLAUDE.md). Pin the
      // class name here so accidental drift back to the old `border-primary
      // bg-primary/5` literal — or any other ad-hoc selection styling — fails
      // CI before reaching review.
      expect(permissionsSectionSrc).toContain("'brand-selected'");
    });

    it('calls applyPreset when preset is selected', () => {
      expect(permissionsSectionSrc).toContain('onChange={() => void applyPreset(key)}');
    });

    it('disables preset selection when isApplying is true', () => {
      expect(permissionsSectionSrc).toContain('disabled={isApplying');
    });

    it('disables preset selection when no companyId', () => {
      expect(permissionsSectionSrc).toContain('disabled={isApplying || !companyId}');
    });
  });

  describe('advanced toggle', () => {
    it('renders a Switch component for advanced matrix toggle', () => {
      expect(permissionsSectionSrc).toContain('<Switch');
      expect(permissionsSectionSrc).toContain('showAdvanced');
    });

    it('shows advanced authority matrix when showAdvanced is true', () => {
      expect(permissionsSectionSrc).toContain('{showAdvanced &&');
      expect(permissionsSectionSrc).toContain('Advanced Authority Matrix');
    });

    it('hides advanced matrix by default (showAdvanced state = false)', () => {
      expect(permissionsSectionSrc).toContain(
        'const [showAdvanced, setShowAdvanced] = useState(false)',
      );
    });
  });

  describe('authority matrix display', () => {
    it('shows empty state when no custom grants exist', () => {
      expect(permissionsSectionSrc).toContain('No custom authority grants configured');
    });

    it('renders grant list items with resource info', () => {
      expect(permissionsSectionSrc).toContain('{formatPath(grant.resourceId)}');
      expect(permissionsSectionSrc).toContain('{grant.resourceKind}');
      // Permission flows through `formatPermission` so the badge renders
      // 'Allow' / 'Deny' / 'Prompt' rather than the raw lowercase enum.
      expect(permissionsSectionSrc).toContain('{formatPermission(grant.permission)}');
    });

    it('provides Remove button for each grant', () => {
      expect(permissionsSectionSrc).toContain('deleteGrant.mutate(grant.id)');
      expect(permissionsSectionSrc).toContain('Remove');
    });
  });

  describe('preset application logic', () => {
    it('defines applyPreset function', () => {
      expect(permissionsSectionSrc).toContain('async function applyPreset(');
    });

    it('removes existing employee grants before applying new preset', () => {
      expect(permissionsSectionSrc).toContain('for (const grant of employeeGrants)');
      expect(permissionsSectionSrc).toContain('deleteGrant.mutateAsync(grant.id)');
    });

    it('creates capability grants for preset capabilities', () => {
      expect(permissionsSectionSrc).toContain('for (const capability of config.capabilities)');
      expect(permissionsSectionSrc).toContain("resourceKind: 'capability'");
      expect(permissionsSectionSrc).toContain("permission: 'allow'");
    });

    it('creates path grants for preset defaultPaths', () => {
      expect(permissionsSectionSrc).toContain('for (const path of config.defaultPaths)');
      expect(permissionsSectionSrc).toContain("resourceKind: 'path'");
    });

    it('updates selectedPreset state after successful application', () => {
      expect(permissionsSectionSrc).toContain('setSelectedPreset(preset)');
    });

    it('handles errors during preset application', () => {
      expect(permissionsSectionSrc).toContain('} catch (err)');
      expect(permissionsSectionSrc).toContain('console.error');
    });

    it('shows error message when createGrant fails', () => {
      expect(permissionsSectionSrc).toContain('createGrant.isError');
      expect(permissionsSectionSrc).toContain('Failed to apply permission preset');
    });
  });

  describe('guard clauses', () => {
    it('shows message when no company selected', () => {
      expect(permissionsSectionSrc).toContain('Select a workspace to manage permissions');
    });

    it('shows loading state while fetching authority grants', () => {
      expect(permissionsSectionSrc).toContain('authorityQuery.isLoading');
    });

    it('shows error state when authority grants fail to load', () => {
      expect(permissionsSectionSrc).toContain('authorityQuery.isError');
      expect(permissionsSectionSrc).toContain('Failed to load permissions configuration');
    });
  });

  describe('hook usage', () => {
    it('uses useAppStore for companyId', () => {
      expect(permissionsSectionSrc).toContain('useAppStore((state) => state.companyId)');
    });

    it('uses useAuthorityGrants to fetch grants', () => {
      expect(permissionsSectionSrc).toContain('useAuthorityGrants(companyId)');
    });

    it('uses useCreateAuthorityGrant for creating grants', () => {
      expect(permissionsSectionSrc).toContain('useCreateAuthorityGrant()');
    });

    it('uses useDeleteAuthorityGrant for removing grants', () => {
      expect(permissionsSectionSrc).toContain('useDeleteAuthorityGrant(companyId)');
    });
  });

  describe('imports and exports', () => {
    it('exports PermissionsSection component', () => {
      expect(permissionsSectionSrc).toContain('export function PermissionsSection()');
    });

    it('uses hook-returned authority grant records without a renderer-local shared type import', () => {
      expect(permissionsSectionSrc).toContain('const authorityGrants = authorityQuery.data ?? []');
      expect(permissionsSectionSrc).not.toContain("from '@team-x/shared-types'");
    });

    it('imports required UI components', () => {
      expect(permissionsSectionSrc).toContain('@/components/ui/badge.js');
      expect(permissionsSectionSrc).toContain('@/components/ui/button.js');
      expect(permissionsSectionSrc).toContain('@/components/ui/card.js');
      expect(permissionsSectionSrc).toContain('@/components/ui/switch.js');
    });

    it('imports required hooks', () => {
      expect(permissionsSectionSrc).toContain('@/hooks/use-extensions.js');
      expect(permissionsSectionSrc).toContain('@/store/app-store.js');
    });
  });

  describe('filtering employee grants', () => {
    it('filters authorityGrants to employee scope for preset management', () => {
      expect(permissionsSectionSrc).toContain("filter((g) => g.scopeKind === 'employee')");
    });

    it('uses filtered employeeGrants for removal loop', () => {
      expect(permissionsSectionSrc).toContain('const employeeGrants = authorityGrants.filter(');
    });
  });
});
