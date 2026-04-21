import { basename } from 'node:path';
import { nanoid } from 'nanoid';

import type { ToolSpec } from '@team-x/provider-router';
import type { RoleSpec } from '@team-x/shared-types';

import type { CreateEmployeeInput, EmployeeRow } from '../db/repos/employees.js';

const HIRE_LEVELS = new Set(['officer', 'senior-management', 'management', 'system']);

export interface ChatActionEmployeesRepo {
  create(input: CreateEmployeeInput): string;
  listVisibleByCompany(companyId: string): EmployeeRow[];
}

export interface ChatActionRoleLookup {
  listRoles(): RoleSpec[];
}

export interface ChatActionBus {
  emit<T>(input: {
    type: string;
    companyId: string;
    actorId: string;
    actorKind: string;
    payload: T;
  }): unknown;
}

export interface BuildChatActionToolsArgs {
  readonly companyId: string;
  readonly actorId: string;
  readonly actorLevel: string;
  readonly employeesRepo: ChatActionEmployeesRepo;
  readonly roleLookup: ChatActionRoleLookup;
  readonly bus: ChatActionBus;
  readonly now?: () => number;
}

interface ResolveRoleResult {
  kind: 'unique' | 'ambiguous' | 'not_found';
  spec?: RoleSpec;
  candidates?: RoleSpec[];
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function roleAlias(spec: RoleSpec): string {
  return basename(spec.sourcePath, '.md').toLowerCase();
}

function roleInitials(spec: RoleSpec): string {
  return spec.frontmatter.name
    .split(/\s+/)
    .map((token) => token[0] ?? '')
    .join('')
    .toLowerCase();
}

function resolveRoleSpec(roleLookup: ChatActionRoleLookup, roleQuery: string): ResolveRoleResult {
  const roles = roleLookup.listRoles();
  const needle = normalize(roleQuery);
  if (!needle) return { kind: 'not_found' };

  const exactMatches = roles.filter((spec) => {
    const fm = spec.frontmatter;
    return (
      normalize(fm.id) === needle ||
      normalize(fm.name) === needle ||
      normalize(fm.level) === needle ||
      roleAlias(spec) === needle ||
      roleInitials(spec) === needle
    );
  });
  if (exactMatches.length === 1) {
    const spec = exactMatches[0];
    if (!spec) return { kind: 'not_found' };
    return { kind: 'unique', spec };
  }
  if (exactMatches.length > 1) {
    return { kind: 'ambiguous', candidates: exactMatches.slice(0, 5) };
  }

  const fuzzyMatches = roles.filter((spec) => {
    const fm = spec.frontmatter;
    const haystacks = [
      normalize(fm.id),
      normalize(fm.name),
      normalize(fm.level),
      roleAlias(spec),
      roleInitials(spec),
    ];
    return haystacks.some((haystack) => haystack.includes(needle) || needle.includes(haystack));
  });
  if (fuzzyMatches.length === 1) {
    const spec = fuzzyMatches[0];
    if (!spec) return { kind: 'not_found' };
    return { kind: 'unique', spec };
  }
  if (fuzzyMatches.length > 1) {
    return { kind: 'ambiguous', candidates: fuzzyMatches.slice(0, 5) };
  }

  return { kind: 'not_found' };
}

function defaultHireName(): string {
  return `New Hire ${nanoid(6)}`;
}

function buildHireEmployeeTool(args: BuildChatActionToolsArgs): ToolSpec | null {
  if (!HIRE_LEVELS.has(args.actorLevel)) {
    return null;
  }

  return {
    name: 'hire_employee',
    description:
      'Hire a new employee or agent into the company. Use this when you have decided to onboard a role. ' +
      'Pass a role title or alias such as "Chief Marketing Officer" or "CMO".',
    inputSchema: {
      type: 'object',
      properties: {
        roleQuery: {
          type: 'string',
          description: 'Role title, role id, or alias to hire. Example: "Chief Marketing Officer" or "CMO".',
        },
        name: {
          type: 'string',
          description: 'Optional display name. Omit this to use a temporary placeholder name.',
        },
      },
      required: ['roleQuery'],
    },
    execute: async (rawArgs: unknown): Promise<unknown> => {
      const input = rawArgs as { roleQuery?: unknown; name?: unknown };
      const roleQuery = typeof input.roleQuery === 'string' ? input.roleQuery.trim() : '';
      if (roleQuery.length === 0) {
        return { success: false, error: 'roleQuery is required.' };
      }

      const resolved = resolveRoleSpec(args.roleLookup, roleQuery);
      if (resolved.kind === 'ambiguous') {
        return {
          success: false,
          error: `Multiple roles matched "${roleQuery}". Use a more specific title or id.`,
          candidates: (resolved.candidates ?? []).map((candidate) => ({
            roleId: candidate.frontmatter.id,
            title: candidate.frontmatter.name,
          })),
        };
      }
      if (resolved.kind === 'not_found' || !resolved.spec) {
        return { success: false, error: `No hireable role matched "${roleQuery}".` };
      }

      const existing = args
        .employeesRepo
        .listVisibleByCompany(args.companyId)
        .find((employee) => employee.roleId === resolved.spec?.frontmatter.id);
      if (existing) {
        return {
          success: false,
          error: `${resolved.spec.frontmatter.name} is already staffed by ${existing.name}.`,
          employeeId: existing.id,
        };
      }

      const name = typeof input.name === 'string' && input.name.trim().length > 0
        ? input.name.trim()
        : defaultHireName();

      const employeeId = args.employeesRepo.create({
        companyId: args.companyId,
        rolePackId: 'strategia-official',
        roleId: resolved.spec.frontmatter.id,
        roleMdSha: resolved.spec.sha256,
        level: resolved.spec.frontmatter.level,
        name,
        title: resolved.spec.frontmatter.name,
        toolsAllowed: resolved.spec.frontmatter.tools_allowed ?? [],
        toolsDenied: resolved.spec.frontmatter.tools_denied ?? [],
      });

      try {
        args.bus.emit({
          type: 'employee.hired',
          companyId: args.companyId,
          actorId: args.actorId,
          actorKind: 'employee',
          payload: {
            employeeId,
            companyId: args.companyId,
            roleId: resolved.spec.frontmatter.id,
            level: resolved.spec.frontmatter.level,
            name,
            title: resolved.spec.frontmatter.name,
            hiredAt: (args.now ?? Date.now)(),
          },
        });
      } catch {
        // Non-fatal: the durable row already exists.
      }

      return {
        success: true,
        employeeId,
        name,
        title: resolved.spec.frontmatter.name,
        roleId: resolved.spec.frontmatter.id,
      };
    },
  };
}

export function buildChatActionTools(args: BuildChatActionToolsArgs): ToolSpec[] {
  const tools: ToolSpec[] = [];
  const hireTool = buildHireEmployeeTool(args);
  if (hireTool) {
    tools.push(hireTool);
  }
  return tools;
}
