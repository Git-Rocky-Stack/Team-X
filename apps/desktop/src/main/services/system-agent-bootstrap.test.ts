/**
 * Tests for `ensureSystemAgent` (M31 T0) and `ensureSystemCopilot` (M33 T2).
 *
 * Both bootstraps are idempotent by contract — callers must be able to
 * invoke them on every boot, on every `companies.create`, without side
 * effects beyond the first insert. These tests exercise: the
 * create-on-first-call path, the SELECT-and-reuse-on-second-call path,
 * the two guard rails that prevent corrupt seeds (missing spec, wrong
 * level), and the M33 invariant that both system roles coexist after
 * bootstrap without contaminating the human-facing employee list.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createCompaniesRepo } from '../db/repos/companies.js';
import { createEmployeesRepo } from '../db/repos/employees.js';
import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';

import {
  type BootstrapRoleLookup,
  SYSTEM_AGENT_DISPLAY_NAME,
  SYSTEM_AGENT_ROLE_ID,
  SYSTEM_AGENT_ROLE_PACK_ID,
  SYSTEM_COPILOT_DISPLAY_NAME,
  SYSTEM_COPILOT_ROLE_ID,
  SYSTEM_COPILOT_ROLE_PACK_ID,
  ensureSystemAgent,
  ensureSystemCopilot,
} from './system-agent-bootstrap.js';

/**
 * Minimal RoleLoader double — returns a canned `system-agent` spec unless
 * the test explicitly swaps it. Mirrors the `RoleLoader.getSpec(roleId)`
 * shape that `ensureSystemAgent` needs, nothing more.
 */
function makeLookup(
  override?: Partial<ReturnType<BootstrapRoleLookup['getSpec']> & object>,
): BootstrapRoleLookup {
  const base = {
    frontmatter: {
      id: SYSTEM_AGENT_ROLE_ID,
      name: 'Team-X Copilot',
      level: 'system',
      tools_allowed: ['query_employees', 'query_tickets'],
      tools_denied: ['shell', 'filesystem_write'],
    },
    sha256: 'deadbeef'.repeat(8),
  };
  return {
    getSpec(roleId: string) {
      if (roleId !== SYSTEM_AGENT_ROLE_ID) return null;
      if (override === null) return null;
      return {
        ...base,
        ...(override ?? {}),
        frontmatter: { ...base.frontmatter, ...(override?.frontmatter ?? {}) },
      };
    },
  };
}

/**
 * RoleLoader double that returns BOTH system specs — the production
 * shape the composition root wires up. Used by the M33 tests that
 * exercise the two-ensure coexistence invariant + the filter sweep.
 */
function makePairLookup(): BootstrapRoleLookup {
  const agentSpec = {
    frontmatter: {
      id: SYSTEM_AGENT_ROLE_ID,
      name: 'Team-X Copilot',
      level: 'system',
      tools_allowed: ['query_employees', 'query_tickets'],
      tools_denied: ['shell', 'filesystem_write'],
    },
    sha256: 'deadbeef'.repeat(8),
  };
  const copilotSpec = {
    frontmatter: {
      id: SYSTEM_COPILOT_ROLE_ID,
      name: 'Team-X Copilot (analyzer)',
      level: 'system',
      tools_allowed: [
        'query_employees',
        'query_tickets',
        'query_projects',
        'query_meetings',
        'query_vault',
        'query_events',
        'query_copilot_insights',
      ],
      tools_denied: [
        'shell',
        'filesystem_write',
        'filesystem_read',
        'network',
        'send_message_to_colleague',
        'list_colleagues',
        'decompose_project',
        'delegate_subtask',
        'review_deliverable',
      ],
    },
    sha256: 'feedface'.repeat(8),
  };
  return {
    getSpec(roleId: string) {
      if (roleId === SYSTEM_AGENT_ROLE_ID) return agentSpec;
      if (roleId === SYSTEM_COPILOT_ROLE_ID) return copilotSpec;
      return null;
    },
  };
}

describe('ensureSystemAgent', () => {
  let ctx: TestDbHandle;
  let companyId: string;
  let otherCompanyId: string;

  beforeEach(async () => {
    ctx = await makeTestDb();
    const companies = createCompaniesRepo(ctx.db);
    companyId = companies.create({ name: 'Strategia-X', slug: 'strategia-x' });
    otherCompanyId = companies.create({ name: 'Other Corp', slug: 'other-corp' });
  });

  afterEach(() => {
    ctx.close();
  });

  it('creates a single is_system row on the first call (created=true)', () => {
    const result = ensureSystemAgent({ db: ctx.db, companyId, roleLookup: makeLookup() });
    expect(result.created).toBe(true);
    expect(result.employeeId).toBeTypeOf('string');

    const employees = createEmployeesRepo(ctx.db);
    const row = employees.getById(result.employeeId);
    expect(row).not.toBeNull();
    expect(row?.isSystem).toBe(true);
    expect(row?.level).toBe('system');
    expect(row?.roleId).toBe(SYSTEM_AGENT_ROLE_ID);
    expect(row?.rolePackId).toBe(SYSTEM_AGENT_ROLE_PACK_ID);
    expect(row?.name).toBe(SYSTEM_AGENT_DISPLAY_NAME);
  });

  it('returns the existing row on subsequent calls (created=false, same id)', () => {
    const first = ensureSystemAgent({ db: ctx.db, companyId, roleLookup: makeLookup() });
    const second = ensureSystemAgent({ db: ctx.db, companyId, roleLookup: makeLookup() });
    const third = ensureSystemAgent({ db: ctx.db, companyId, roleLookup: makeLookup() });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(third.created).toBe(false);
    expect(second.employeeId).toBe(first.employeeId);
    expect(third.employeeId).toBe(first.employeeId);

    // No duplicate rows — company has exactly one system-agent.
    const employees = createEmployeesRepo(ctx.db);
    const rows = employees.listByCompany(companyId).filter((e) => e.isSystem);
    expect(rows).toHaveLength(1);
  });

  it('seeds independent rows per company (one system-agent per company)', () => {
    const lookup = makeLookup();
    const a = ensureSystemAgent({ db: ctx.db, companyId, roleLookup: lookup });
    const b = ensureSystemAgent({ db: ctx.db, companyId: otherCompanyId, roleLookup: lookup });

    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
    expect(a.employeeId).not.toBe(b.employeeId);

    const employees = createEmployeesRepo(ctx.db);
    expect(employees.findSystemByRoleId(companyId, SYSTEM_AGENT_ROLE_ID)?.id).toBe(a.employeeId);
    expect(employees.findSystemByRoleId(otherCompanyId, SYSTEM_AGENT_ROLE_ID)?.id).toBe(
      b.employeeId,
    );
  });

  it('throws a helpful error when the role-loader has no system-agent spec', () => {
    const emptyLookup: BootstrapRoleLookup = { getSpec: () => null };
    expect(() => ensureSystemAgent({ db: ctx.db, companyId, roleLookup: emptyLookup })).toThrow(
      /no spec for id "system-agent"/i,
    );
  });

  it('refuses to seed a non-system role as the system-agent', () => {
    const wrongLevel: BootstrapRoleLookup = {
      getSpec: () => ({
        frontmatter: {
          id: SYSTEM_AGENT_ROLE_ID,
          name: 'Impersonator',
          level: 'officer',
          tools_allowed: [],
          tools_denied: [],
        },
        sha256: 'cafebabe'.repeat(8),
      }),
    };
    expect(() => ensureSystemAgent({ db: ctx.db, companyId, roleLookup: wrongLevel })).toThrow(
      /level "officer", expected "system"/i,
    );
  });

  it('propagates tools_allowed and tools_denied from the role spec', () => {
    const result = ensureSystemAgent({ db: ctx.db, companyId, roleLookup: makeLookup() });
    const employees = createEmployeesRepo(ctx.db);
    const row = employees.getById(result.employeeId);
    const allowed = JSON.parse(row?.toolsAllowedJson ?? '[]') as string[];
    const denied = JSON.parse(row?.toolsDeniedJson ?? '[]') as string[];
    expect(allowed).toEqual(['query_employees', 'query_tickets']);
    expect(denied).toEqual(['shell', 'filesystem_write']);
  });
});

describe('ensureSystemCopilot (M33 T2)', () => {
  let ctx: TestDbHandle;
  let companyId: string;

  beforeEach(async () => {
    ctx = await makeTestDb();
    const companies = createCompaniesRepo(ctx.db);
    companyId = companies.create({ name: 'Strategia-X', slug: 'strategia-x' });
  });

  afterEach(() => {
    ctx.close();
  });

  it('creates a single is_system row with role_id=system-copilot on fresh bootstrap', () => {
    const result = ensureSystemCopilot({ db: ctx.db, companyId, roleLookup: makePairLookup() });

    expect(result.created).toBe(true);
    expect(result.employeeId).toBeTypeOf('string');

    const employees = createEmployeesRepo(ctx.db);
    const row = employees.getById(result.employeeId);
    expect(row).not.toBeNull();
    expect(row?.isSystem).toBe(true);
    expect(row?.level).toBe('system');
    expect(row?.roleId).toBe(SYSTEM_COPILOT_ROLE_ID);
    expect(row?.rolePackId).toBe(SYSTEM_COPILOT_ROLE_PACK_ID);
    expect(row?.name).toBe(SYSTEM_COPILOT_DISPLAY_NAME);
    // Tools propagated from the spec — 7 allowed (read-only + query_copilot_insights),
    // 9 denied (write-side + IO surfaces). Verifies the copilot is sandboxed
    // distinctly from the agent, not just an alias.
    const allowed = JSON.parse(row?.toolsAllowedJson ?? '[]') as string[];
    const denied = JSON.parse(row?.toolsDeniedJson ?? '[]') as string[];
    expect(allowed).toContain('query_copilot_insights');
    expect(denied).toContain('decompose_project');
    expect(denied).toContain('delegate_subtask');
    expect(denied).toContain('review_deliverable');
  });

  it('is idempotent on subsequent calls (created=false, same employeeId)', () => {
    const lookup = makePairLookup();
    const first = ensureSystemCopilot({ db: ctx.db, companyId, roleLookup: lookup });
    const second = ensureSystemCopilot({ db: ctx.db, companyId, roleLookup: lookup });
    const third = ensureSystemCopilot({ db: ctx.db, companyId, roleLookup: lookup });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(third.created).toBe(false);
    expect(second.employeeId).toBe(first.employeeId);
    expect(third.employeeId).toBe(first.employeeId);

    // No duplicate rows — company has exactly one system-copilot.
    const employees = createEmployeesRepo(ctx.db);
    const copilotRows = employees
      .listByCompany(companyId)
      .filter((e) => e.isSystem && e.roleId === SYSTEM_COPILOT_ROLE_ID);
    expect(copilotRows).toHaveLength(1);
  });

  it('both system pseudo-employees coexist after bootstrap — distinct role ids, distinct names, same is_system flag', () => {
    const lookup = makePairLookup();
    const agentResult = ensureSystemAgent({ db: ctx.db, companyId, roleLookup: lookup });
    const copilotResult = ensureSystemCopilot({ db: ctx.db, companyId, roleLookup: lookup });

    expect(agentResult.created).toBe(true);
    expect(copilotResult.created).toBe(true);
    expect(agentResult.employeeId).not.toBe(copilotResult.employeeId);

    const employees = createEmployeesRepo(ctx.db);
    const systemRows = employees.listByCompany(companyId).filter((e) => e.isSystem);
    expect(systemRows).toHaveLength(2);

    const byRoleId = new Map(systemRows.map((r) => [r.roleId, r]));
    const agentRow = byRoleId.get(SYSTEM_AGENT_ROLE_ID);
    const copilotRow = byRoleId.get(SYSTEM_COPILOT_ROLE_ID);
    expect(agentRow).toBeDefined();
    expect(copilotRow).toBeDefined();
    expect(agentRow?.name).toBe(SYSTEM_AGENT_DISPLAY_NAME);
    expect(copilotRow?.name).toBe(SYSTEM_COPILOT_DISPLAY_NAME);
    expect(agentRow?.level).toBe('system');
    expect(copilotRow?.level).toBe('system');
    // Both roles resolve through the same `findSystemByRoleId` lookup
    // that backs idempotency for both ensure functions.
    expect(employees.findSystemByRoleId(companyId, SYSTEM_AGENT_ROLE_ID)?.id).toBe(
      agentResult.employeeId,
    );
    expect(employees.findSystemByRoleId(companyId, SYSTEM_COPILOT_ROLE_ID)?.id).toBe(
      copilotResult.employeeId,
    );
  });

  it('filter sweep — listVisibleByCompany hides BOTH system pseudo-employees', () => {
    const lookup = makePairLookup();
    ensureSystemAgent({ db: ctx.db, companyId, roleLookup: lookup });
    ensureSystemCopilot({ db: ctx.db, companyId, roleLookup: lookup });

    const employees = createEmployeesRepo(ctx.db);

    // Seed one human-facing employee so we can distinguish "visible is empty"
    // from "all rows are visible". The row has no `isSystem` flag so it
    // defaults to false (migration 0010 default).
    const humanId = employees.create({
      companyId,
      rolePackId: SYSTEM_AGENT_ROLE_PACK_ID,
      roleId: 'officer/ceo',
      roleMdSha: 'babecafe'.repeat(8),
      level: 'officer',
      name: 'Iris Kovač',
      title: 'Chief Executive Officer',
    });

    const allRows = employees.listByCompany(companyId);
    const visibleRows = employees.listVisibleByCompany(companyId);

    // `listByCompany` returns all three (two system + one human).
    expect(allRows).toHaveLength(3);
    // `listVisibleByCompany` returns only the human — both system roles filtered.
    expect(visibleRows).toHaveLength(1);
    expect(visibleRows[0]?.id).toBe(humanId);
    expect(visibleRows.every((r) => !r.isSystem)).toBe(true);
    // Neither system role id leaks through the visible surface.
    const visibleRoleIds = new Set(visibleRows.map((r) => r.roleId));
    expect(visibleRoleIds.has(SYSTEM_AGENT_ROLE_ID)).toBe(false);
    expect(visibleRoleIds.has(SYSTEM_COPILOT_ROLE_ID)).toBe(false);
  });
});
