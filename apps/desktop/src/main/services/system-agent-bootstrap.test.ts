/**
 * Tests for `ensureSystemAgent` (M31 T0).
 *
 * The bootstrap is idempotent by contract — callers must be able to invoke
 * it on every boot, on every `companies.create`, without side effects
 * beyond the first insert. These tests exercise: the create-on-first-call
 * path, the SELECT-and-reuse-on-second-call path, and the two guard
 * rails that prevent corrupt seeds (missing spec, wrong level).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';
import { createCompaniesRepo } from '../db/repos/companies.js';
import { createEmployeesRepo } from '../db/repos/employees.js';
import {
  SYSTEM_AGENT_DISPLAY_NAME,
  SYSTEM_AGENT_ROLE_ID,
  SYSTEM_AGENT_ROLE_PACK_ID,
  type BootstrapRoleLookup,
  ensureSystemAgent,
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
    expect(employees.findSystemByRoleId(otherCompanyId, SYSTEM_AGENT_ROLE_ID)?.id).toBe(b.employeeId);
  });

  it('throws a helpful error when the role-loader has no system-agent spec', () => {
    const emptyLookup: BootstrapRoleLookup = { getSpec: () => null };
    expect(() =>
      ensureSystemAgent({ db: ctx.db, companyId, roleLookup: emptyLookup }),
    ).toThrow(/no spec for id "system-agent"/i);
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
    expect(() =>
      ensureSystemAgent({ db: ctx.db, companyId, roleLookup: wrongLevel }),
    ).toThrow(/level "officer", expected "system"/i);
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
