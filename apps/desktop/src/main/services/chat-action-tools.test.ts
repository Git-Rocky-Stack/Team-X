import { describe, expect, it, vi } from 'vitest';

import type { RoleSpec } from '@team-x/shared-types';

import { buildChatActionTools } from './chat-action-tools.js';

function makeRoleSpec(overrides: Partial<RoleSpec['frontmatter']> & { sourcePath?: string } = {}): RoleSpec {
  const id = overrides.id ?? 'chief-marketing-officer';
  const name = overrides.name ?? 'Chief Marketing Officer';
  const level = overrides.level ?? 'officer';
  return {
    frontmatter: {
      id,
      name,
      level,
      reports_to: [],
      manages: [],
      preferred_model_tier: 'high',
      preferred_providers: [],
      fallback_providers: [],
      preferred_context_window: 200000,
      tools_allowed: [],
      tools_denied: [],
      decision_authority: 'final',
      escalates_to: [],
      kpis: [],
      cadences: [],
      output_format: 'exec_brief',
      capabilities: [],
      temperature: 0.4,
      license: 'MIT',
      author: 'Strategia-X',
      version: '1.0.0',
      ...overrides,
    },
    body: '# Role',
    sourcePath:
      overrides.sourcePath ??
      'C:/repo/role-packs/strategia-official/roles/officer/cmo.md',
    sha256: `sha-${id}`,
  };
}

describe('buildChatActionTools', () => {
  it('exposes hire_employee to officers and resolves alias-based role queries', async () => {
    const create = vi.fn(() => 'emp-cmo');
    const emit = vi.fn();
    const tools = buildChatActionTools({
      companyId: 'co-1',
      actorId: 'emp-ceo',
      actorLevel: 'officer',
      employeesRepo: {
        create,
        listVisibleByCompany: () => [],
      },
      roleLookup: {
        listRoles: () => [makeRoleSpec()],
      },
      bus: { emit },
      now: () => 123,
    });

    expect(tools.map((tool) => tool.name)).toContain('hire_employee');
    const hireTool = tools.find((tool) => tool.name === 'hire_employee');
    expect(hireTool).toBeDefined();

    const result = await hireTool?.execute?.({ roleQuery: 'CMO' });
    expect(result).toEqual({
      success: true,
      employeeId: 'emp-cmo',
      name: expect.stringMatching(/^New Hire /),
      title: 'Chief Marketing Officer',
      roleId: 'chief-marketing-officer',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'co-1',
        roleId: 'chief-marketing-officer',
        title: 'Chief Marketing Officer',
      }),
    );
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'employee.hired',
        actorId: 'emp-ceo',
        actorKind: 'employee',
      }),
    );
  });

  it('refuses to hire a duplicate staffed role', async () => {
    const hireTool = buildChatActionTools({
      companyId: 'co-1',
      actorId: 'emp-ceo',
      actorLevel: 'officer',
      employeesRepo: {
        create: vi.fn(() => 'should-not-run'),
        listVisibleByCompany: () => [
          {
            id: 'emp-existing-cmo',
            companyId: 'co-1',
            rolePackId: 'strategia-official',
            roleId: 'chief-marketing-officer',
            roleMdSha: 'sha-chief-marketing-officer',
            level: 'officer',
            name: 'Jordan Vale',
            title: 'Chief Marketing Officer',
            status: 'idle',
            modelPref: null,
            providerPref: null,
            toolsAllowedJson: '[]',
            toolsDeniedJson: '[]',
            avatar: null,
            isSystem: false,
            createdAt: 1,
          },
        ],
      },
      roleLookup: {
        listRoles: () => [makeRoleSpec()],
      },
      bus: { emit: vi.fn() },
    }).find((tool) => tool.name === 'hire_employee');

    const result = await hireTool?.execute?.({ roleQuery: 'Chief Marketing Officer' });
    expect(result).toEqual({
      success: false,
      error: 'Chief Marketing Officer is already staffed by Jordan Vale.',
      employeeId: 'emp-existing-cmo',
    });
  });

  it('does not expose hire_employee to ICs', () => {
    const tools = buildChatActionTools({
      companyId: 'co-1',
      actorId: 'emp-ic',
      actorLevel: 'ic',
      employeesRepo: {
        create: vi.fn(() => 'emp'),
        listVisibleByCompany: () => [],
      },
      roleLookup: {
        listRoles: () => [makeRoleSpec()],
      },
      bus: { emit: vi.fn() },
    });

    expect(tools).toEqual([]);
  });
});
