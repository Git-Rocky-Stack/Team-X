import type { RoleSpec } from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';

import { buildChatActionTools } from './chat-action-tools.js';

function makeRoleSpec(
  overrides: Partial<RoleSpec['frontmatter']> & { sourcePath?: string } = {},
): RoleSpec {
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
      overrides.sourcePath ?? 'C:/repo/role-packs/strategia-official/roles/officer/cmo.md',
    sha256: `sha-${id}`,
  };
}

describe('buildChatActionTools', () => {
  it('exposes hire_employee to officers and resolves alias-based role queries', async () => {
    const employees: Array<{
      id: string;
      companyId: string;
      rolePackId: string;
      roleId: string;
      roleMdSha: string;
      level: string;
      name: string;
      title: string;
      status: string;
      modelPref: null;
      providerPref: null;
      toolsAllowedJson: string;
      toolsDeniedJson: string;
      avatar: null;
      isSystem: boolean;
      createdAt: number;
    }> = [];
    const create = vi.fn(
      (input: {
        companyId: string;
        rolePackId: string;
        roleId: string;
        roleMdSha: string;
        level: string;
        name: string;
        title: string;
      }) => {
        employees.push({
          id: 'emp-cmo',
          companyId: input.companyId,
          rolePackId: input.rolePackId,
          roleId: input.roleId,
          roleMdSha: input.roleMdSha,
          level: input.level,
          name: input.name,
          title: input.title,
          status: 'idle',
          modelPref: null,
          providerPref: null,
          toolsAllowedJson: '[]',
          toolsDeniedJson: '[]',
          avatar: null,
          isSystem: false,
          createdAt: 123,
        });
        return 'emp-cmo';
      },
    );
    const emit = vi.fn();
    const tools = buildChatActionTools({
      companyId: 'co-1',
      actorId: 'emp-ceo',
      actorLevel: 'officer',
      employeesRepo: {
        create,
        listVisibleByCompany: () => employees,
      },
      roleLookup: {
        listRoles: () => [makeRoleSpec()],
      },
      bus: { emit },
      now: () => 123,
    });

    expect(tools.map((tool) => tool.name)).toContain('check_role_staffing');
    expect(tools.map((tool) => tool.name)).toContain('hire_employee');
    const hireTool = tools.find((tool) => tool.name === 'hire_employee');
    expect(hireTool).toBeDefined();

    const result = await hireTool?.execute?.({ roleQuery: 'CMO' });
    expect(result).toMatchObject({
      success: true,
      state: 'completed',
      employeeId: 'emp-cmo',
      name: expect.stringMatching(/^New Hire /),
      title: 'Chief Marketing Officer',
      roleId: 'chief-marketing-officer',
      nextAction: expect.stringContaining('Onboard this hire'),
      onboarding: expect.objectContaining({
        employeeId: 'emp-cmo',
        roleId: 'chief-marketing-officer',
        title: 'Chief Marketing Officer',
        instruction: expect.stringContaining('Do not defer to a future report'),
      }),
      message:
        'Chief Marketing Officer hired and verified in the company roster. Onboard them against the active ticket or project now; do not defer to a future report unless the user supplied that deadline.',
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
      state: 'blocked',
      error: 'Chief Marketing Officer is already staffed by Jordan Vale.',
      employeeId: 'emp-existing-cmo',
    });
  });

  it('exposes check_role_staffing and reports staffed roles with employee details', async () => {
    const staffingTool = buildChatActionTools({
      companyId: 'co-1',
      actorId: 'emp-ceo',
      actorLevel: 'officer',
      employeesRepo: {
        create: vi.fn(() => 'unused'),
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
    }).find((tool) => tool.name === 'check_role_staffing');

    const result = await staffingTool?.execute?.({ roleQuery: 'CMO' });
    expect(result).toEqual({
      success: true,
      state: 'completed',
      staffed: true,
      roleId: 'chief-marketing-officer',
      title: 'Chief Marketing Officer',
      employee: {
        employeeId: 'emp-existing-cmo',
        name: 'Jordan Vale',
        title: 'Chief Marketing Officer',
        level: 'officer',
      },
      message: 'Chief Marketing Officer is currently staffed by Jordan Vale.',
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

    expect(tools.map((tool) => tool.name)).toEqual(['check_role_staffing']);
  });
});
