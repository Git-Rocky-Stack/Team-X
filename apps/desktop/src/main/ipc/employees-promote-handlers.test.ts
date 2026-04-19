import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RoleSpec } from '@team-x/shared-types';

import type { CompanyRow, UpdateCompanyInput } from '../db/repos/companies.js';
import type { EmployeeRow, PromoteEmployeeInput } from '../db/repos/employees.js';

import type { IpcCompaniesRepo, IpcEmployeesRepo, IpcEventBus, IpcRoleLookup } from './handlers.js';
import { createIpcHandlers } from './handlers.js';

const HUMAN_USER_ID = 'rocky';

/**
 * Tests for the `employees.promote` IPC handler — Phase 5.6 M-C step d
 * (restores Cluster B M9 hire/fire/promote per audit row 2.19).
 *
 * Mirrors the focused per-namespace test convention established by
 * `companies-handlers.test.ts` (step b) and `orgchart-handlers.test.ts`
 * (step c). Hand-rolled fakes satisfying the narrow IPC dep surfaces;
 * `noop as never` for every dep this handler does not touch.
 *
 * Coverage targets the contract enumerated on the
 * `IpcHandlers.employeesPromote` interface comment + the
 * architectural-invariant-#11 bus emit:
 *
 *   - happy path: returns full pre/post snapshot; repo.promote called
 *     with the new role spec's resolved fields; bus emit fires
 *     `employee.promoted` with the locked payload shape.
 *   - input validation: missing / non-string / empty employeeId or
 *     newRoleId; non-object body.
 *   - employee not found: 404 throw.
 *   - system-employee guard: refuses to promote an `is_system: true` row.
 *   - role-not-found / system-role guards: refuses unknown roleId or
 *     `level: 'system'` target role.
 *   - bus.emit throw is logged + swallowed (durable write already
 *     succeeded, must not cascade); bus dep unwired warns in dev.
 */

// ---------------------------------------------------------------------------
// Hand-rolled fakes
// ---------------------------------------------------------------------------

class FakeEmployeesRepo implements IpcEmployeesRepo {
  rows: EmployeeRow[] = [];
  promoteCalls: PromoteEmployeeInput[] = [];

  put(row: EmployeeRow): void {
    this.rows.push(row);
  }

  listByCompany(companyId: string): EmployeeRow[] {
    return this.rows.filter((r) => r.companyId === companyId);
  }
  listVisibleByCompany(companyId: string): EmployeeRow[] {
    return this.rows.filter((r) => r.companyId === companyId && !r.isSystem);
  }
  getById(id: string): EmployeeRow | null {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  findSystemByRoleId(): EmployeeRow | null {
    return null;
  }
  create(): string {
    throw new Error('FakeEmployeesRepo.create: unused by promote tests');
  }
  delete(): void {
    throw new Error('FakeEmployeesRepo.delete: unused by promote tests');
  }
  promote(input: PromoteEmployeeInput): void {
    this.promoteCalls.push(input);
    const row = this.rows.find((r) => r.id === input.employeeId);
    if (!row) return;
    (row as { roleId: string }).roleId = input.roleId;
    (row as { level: string }).level = input.level;
    (row as { title: string }).title = input.title;
    (row as { roleMdSha: string }).roleMdSha = input.roleMdSha;
    (row as { toolsAllowedJson: string }).toolsAllowedJson = JSON.stringify(input.toolsAllowed);
    (row as { toolsDeniedJson: string }).toolsDeniedJson = JSON.stringify(input.toolsDenied);
  }
}

class FakeCompaniesRepo implements IpcCompaniesRepo {
  rows: CompanyRow[] = [];

  put(row: CompanyRow): void {
    this.rows.push(row);
  }

  list(): CompanyRow[] {
    return this.rows;
  }

  create(): string {
    throw new Error('FakeCompaniesRepo.create: unused by promote tests');
  }

  getById(id: string): CompanyRow | null {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  archive(id: string): void {
    const row = this.rows.find((r) => r.id === id);
    if (row) (row as { status: string }).status = 'archived';
  }

  // IpcCompaniesRepo was widened in Phase 5.6 M-C step e with update +
  // delete. This suite does not exercise those code paths; stubs throw
  // loud so a future cross-test accidentally reaching them fails fast.
  update(_id: string, _patch: UpdateCompanyInput): void {
    throw new Error('FakeCompaniesRepo.update: unused by promote tests');
  }
  delete(_id: string): void {
    throw new Error('FakeCompaniesRepo.delete: unused by promote tests');
  }
}

class FakeRoleLookup implements IpcRoleLookup {
  private specs = new Map<string, RoleSpec>();
  put(spec: RoleSpec): void {
    this.specs.set(spec.frontmatter.id, spec);
  }
  getSpec(roleId: string): RoleSpec | null {
    return this.specs.get(roleId) ?? null;
  }
}

interface BusEmitArgs {
  type: string;
  companyId: string;
  actorId: string;
  actorKind: string;
  payload: unknown;
}

function makeBusMock() {
  const emitted: BusEmitArgs[] = [];
  let nextEmitThrow: Error | null = null;
  const bus: IpcEventBus = {
    emit: (input) => {
      emitted.push({
        type: input.type,
        companyId: input.companyId,
        actorId: input.actorId,
        actorKind: input.actorKind,
        payload: input.payload,
      });
      if (nextEmitThrow) {
        const e = nextEmitThrow;
        nextEmitThrow = null;
        throw e;
      }
    },
  };
  return {
    bus,
    emitted,
    setNextEmitThrow(e: Error): void {
      nextEmitThrow = e;
    },
  };
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const COMPANY_ID = 'co-1';

function makeCompanyRow(overrides: Partial<CompanyRow> & { id: string }): CompanyRow {
  return {
    id: overrides.id,
    name: 'Strategia-X',
    slug: 'strategia-x',
    createdAt: 1_700_000_000_000,
    settingsJson: '{}',
    icon: null,
    theme: 'dark',
    status: 'running',
    ...overrides,
  } as CompanyRow;
}

function makeEmployeeRow(overrides: Partial<EmployeeRow> & { id: string }): EmployeeRow {
  return {
    id: overrides.id,
    companyId: COMPANY_ID,
    rolePackId: 'strategia-official',
    roleId: 'senior-fullstack-engineer',
    roleMdSha: 'a'.repeat(64),
    level: 'IC',
    name: 'Iris Kovač',
    title: 'Senior Fullstack Engineer',
    status: 'idle',
    modelPref: null,
    providerPref: null,
    toolsAllowedJson: '["browse"]',
    toolsDeniedJson: '["shell"]',
    avatar: null,
    isSystem: false,
    createdAt: 1_700_000_000_000,
    ...overrides,
  } as EmployeeRow;
}

function makeRoleSpec(overrides: Partial<RoleSpec['frontmatter']> = {}): RoleSpec {
  return {
    frontmatter: {
      id: 'engineering-manager',
      name: 'Engineering Manager',
      level: 'management',
      reports_to: ['vp-engineering'],
      manages: ['lead-engineer'],
      preferred_model_tier: 'frontier',
      preferred_providers: ['anthropic'],
      fallback_providers: ['openai'],
      tools_allowed: ['browse', 'context7'],
      tools_denied: ['shell', 'exec'],
      decision_authority: { autonomous: [], escalate: [] },
      escalates_to: [],
      kpis: [],
      output_format: 'markdown',
      temperature: 0.5,
      license: 'MIT',
      author: 'Rocky Stack',
      version: '1.0.0',
      ...overrides,
    },
    body: '# Identity\nYou are an engineering manager.',
    sourcePath: '/roles/management/engineering-manager.md',
    sha256: 'b'.repeat(64),
  } as RoleSpec;
}

// biome-ignore lint/suspicious/noExplicitAny: test fake for unused deps
const noop: any = null;

interface Fixture {
  companies: FakeCompaniesRepo;
  employees: FakeEmployeesRepo;
  roleLookup: FakeRoleLookup;
  bus: ReturnType<typeof makeBusMock>;
  handlers: ReturnType<typeof createIpcHandlers>;
}

function buildFixture(opts?: { omitBus?: boolean; companyStatus?: string }): Fixture {
  const companies = new FakeCompaniesRepo();
  // Seed the canonical company in the running state by default. Tests
  // exercising the archived-company guard (BUG-002) override
  // companyStatus to 'archived'.
  companies.put(makeCompanyRow({ id: COMPANY_ID, status: opts?.companyStatus ?? 'running' }));
  const employees = new FakeEmployeesRepo();
  const roleLookup = new FakeRoleLookup();
  const bus = makeBusMock();
  const handlers = createIpcHandlers({
    companiesRepo: companies,
    employeesRepo: employees,
    threadsRepo: noop as never,
    messagesRepo: noop as never,
    ticketsRepo: noop as never,
    ticketAttachmentsRepo: noop as never,
    goalsRepo: noop as never,
    projectsRepo: noop as never,
    meetingsRepo: noop as never,
    orgEdgesRepo: noop as never,
    runsRepo: noop as never,
    eventsRepo: noop as never,
    orchestrator: noop as never,
    meetingService: noop as never,
    roleLookup,
    mcpHost: noop as never,
    mcpServersRepo: noop as never,
    providersService: noop as never,
    secretsStore: noop as never,
    settingsRepo: noop as never,
    vaultService: noop as never,
    backupService: noop as never,
    auditRepo: noop as never,
    updaterService: noop as never,
    bus: opts?.omitBus ? undefined : bus.bus,
    getHardwareProfile: () => ({}) as never,
  });
  return { companies, employees, roleLookup, bus, handlers };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('IPC: employees.promote — happy path', () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = buildFixture();
  });

  it('atomically swaps role, emits bus event, and returns full pre/post snapshot', async () => {
    fx.employees.put(
      makeEmployeeRow({
        id: 'emp-iris',
        roleId: 'senior-fullstack-engineer',
        level: 'IC',
        title: 'Senior Fullstack Engineer',
      }),
    );
    fx.roleLookup.put(makeRoleSpec());

    const result = await fx.handlers.employeesPromote({
      employeeId: 'emp-iris',
      newRoleId: 'engineering-manager',
    });

    expect(result).toEqual({
      employeeId: 'emp-iris',
      previousRoleId: 'senior-fullstack-engineer',
      newRoleId: 'engineering-manager',
      previousLevel: 'IC',
      newLevel: 'management',
      previousTitle: 'Senior Fullstack Engineer',
      newTitle: 'Engineering Manager',
    });

    expect(fx.employees.promoteCalls).toHaveLength(1);
    expect(fx.employees.promoteCalls[0]).toEqual({
      employeeId: 'emp-iris',
      roleId: 'engineering-manager',
      level: 'management',
      title: 'Engineering Manager',
      roleMdSha: 'b'.repeat(64),
      toolsAllowed: ['browse', 'context7'],
      toolsDenied: ['shell', 'exec'],
    });

    expect(fx.bus.emitted).toHaveLength(1);
    expect(fx.bus.emitted[0]?.type).toBe('employee.promoted');
    expect(fx.bus.emitted[0]?.companyId).toBe(COMPANY_ID);
    expect(fx.bus.emitted[0]?.actorKind).toBe('user');
    // BUG-005 hardening — actorId is HUMAN_USER_ID, not the literal 'user'.
    expect(fx.bus.emitted[0]?.actorId).toBe(HUMAN_USER_ID);
    expect(fx.bus.emitted[0]?.payload).toMatchObject({
      employeeId: 'emp-iris',
      previousRoleId: 'senior-fullstack-engineer',
      newRoleId: 'engineering-manager',
      previousLevel: 'IC',
      newLevel: 'management',
      previousTitle: 'Senior Fullstack Engineer',
      newTitle: 'Engineering Manager',
    });
  });

  it('persists the row update in the fake repo (mutation observable via getById)', async () => {
    fx.employees.put(makeEmployeeRow({ id: 'emp-iris' }));
    fx.roleLookup.put(makeRoleSpec());
    await fx.handlers.employeesPromote({
      employeeId: 'emp-iris',
      newRoleId: 'engineering-manager',
    });
    const row = fx.employees.getById('emp-iris');
    expect(row?.roleId).toBe('engineering-manager');
    expect(row?.level).toBe('management');
    expect(row?.title).toBe('Engineering Manager');
  });

  it('handles roles whose tools_allowed/denied frontmatter is undefined (defaults to [])', async () => {
    fx.employees.put(makeEmployeeRow({ id: 'emp-iris' }));
    fx.roleLookup.put(
      makeRoleSpec({
        // biome-ignore lint/suspicious/noExplicitAny: testing optional-array fallback
        tools_allowed: undefined as any,
        // biome-ignore lint/suspicious/noExplicitAny: testing optional-array fallback
        tools_denied: undefined as any,
      }),
    );
    await fx.handlers.employeesPromote({
      employeeId: 'emp-iris',
      newRoleId: 'engineering-manager',
    });
    expect(fx.employees.promoteCalls[0]?.toolsAllowed).toEqual([]);
    expect(fx.employees.promoteCalls[0]?.toolsDenied).toEqual([]);
  });

  it('emits with the employee.companyId (not a hard-coded one)', async () => {
    // BUG-002 hardening: must seed co-other in companies too — the
    // assertCompanyActive guard now refuses missing companies.
    fx.companies.put(makeCompanyRow({ id: 'co-other', status: 'running' }));
    fx.employees.put(makeEmployeeRow({ id: 'emp-iris', companyId: 'co-other' }));
    fx.roleLookup.put(makeRoleSpec());
    await fx.handlers.employeesPromote({
      employeeId: 'emp-iris',
      newRoleId: 'engineering-manager',
    });
    expect(fx.bus.emitted[0]?.companyId).toBe('co-other');
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe('IPC: employees.promote — input validation', () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = buildFixture();
  });

  it('rejects when the request body is null', async () => {
    await expect(
      fx.handlers.employeesPromote(null as unknown as { employeeId: string; newRoleId: string }),
    ).rejects.toThrow(/request body is required/);
  });

  it('rejects when employeeId is missing', async () => {
    await expect(
      fx.handlers.employeesPromote({ newRoleId: 'r' } as unknown as {
        employeeId: string;
        newRoleId: string;
      }),
    ).rejects.toThrow(/employeeId/);
  });

  it('rejects when employeeId is an empty string', async () => {
    await expect(fx.handlers.employeesPromote({ employeeId: '', newRoleId: 'r' })).rejects.toThrow(
      /employeeId/,
    );
  });

  it('rejects when employeeId is non-string', async () => {
    await expect(
      fx.handlers.employeesPromote({
        employeeId: 42 as unknown as string,
        newRoleId: 'r',
      }),
    ).rejects.toThrow(/employeeId/);
  });

  it('rejects when newRoleId is missing', async () => {
    await expect(
      fx.handlers.employeesPromote({ employeeId: 'x' } as unknown as {
        employeeId: string;
        newRoleId: string;
      }),
    ).rejects.toThrow(/newRoleId/);
  });

  it('rejects when newRoleId is an empty string', async () => {
    await expect(fx.handlers.employeesPromote({ employeeId: 'x', newRoleId: '' })).rejects.toThrow(
      /newRoleId/,
    );
  });
});

// ---------------------------------------------------------------------------
// Defensive guards (employee + role lookups)
// ---------------------------------------------------------------------------

describe('IPC: employees.promote — defensive guards', () => {
  it('throws when the employee id does not resolve to a row', async () => {
    const fx = buildFixture();
    fx.roleLookup.put(makeRoleSpec());
    await expect(
      fx.handlers.employeesPromote({ employeeId: 'ghost', newRoleId: 'engineering-manager' }),
    ).rejects.toThrow(/employee not found: ghost/);
    expect(fx.employees.promoteCalls).toEqual([]);
    expect(fx.bus.emitted).toEqual([]);
  });

  it('refuses to promote a framework-internal (is_system: true) employee', async () => {
    const fx = buildFixture();
    fx.employees.put(
      makeEmployeeRow({
        id: 'sys-agent',
        roleId: 'system-agent',
        isSystem: true,
        level: 'system',
        title: 'Team-X System Agent',
      }),
    );
    fx.roleLookup.put(makeRoleSpec());
    await expect(
      fx.handlers.employeesPromote({ employeeId: 'sys-agent', newRoleId: 'engineering-manager' }),
    ).rejects.toThrow(/framework-internal/);
    expect(fx.employees.promoteCalls).toEqual([]);
    expect(fx.bus.emitted).toEqual([]);
  });

  it('throws when the new roleId does not resolve in the role-loader', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'emp-iris' }));
    await expect(
      fx.handlers.employeesPromote({ employeeId: 'emp-iris', newRoleId: 'unknown-role' }),
    ).rejects.toThrow(/role not found: unknown-role/);
    expect(fx.employees.promoteCalls).toEqual([]);
    expect(fx.bus.emitted).toEqual([]);
  });

  it('refuses to promote into a framework-internal role (level: system)', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'emp-iris' }));
    fx.roleLookup.put(
      makeRoleSpec({
        id: 'system-agent',
        name: 'Team-X System Agent',
        level: 'system',
      }),
    );
    await expect(
      fx.handlers.employeesPromote({ employeeId: 'emp-iris', newRoleId: 'system-agent' }),
    ).rejects.toThrow(/framework-internal/);
    expect(fx.employees.promoteCalls).toEqual([]);
    expect(fx.bus.emitted).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Architectural invariant #11 — bus tolerance
// ---------------------------------------------------------------------------

describe('IPC: employees.promote — bus emit tolerance (invariant #11)', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('logs + swallows a bus.emit throw without failing the IPC (durable write succeeded)', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'emp-iris' }));
    fx.roleLookup.put(makeRoleSpec());
    fx.bus.setNextEmitThrow(new Error('bus on fire'));
    await expect(
      fx.handlers.employeesPromote({ employeeId: 'emp-iris', newRoleId: 'engineering-manager' }),
    ).resolves.toMatchObject({ employeeId: 'emp-iris', newRoleId: 'engineering-manager' });
    expect(fx.employees.promoteCalls).toHaveLength(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('warns in dev (and does not throw) when the bus dep is unwired', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const fx = buildFixture({ omitBus: true });
      fx.employees.put(makeEmployeeRow({ id: 'emp-iris' }));
      fx.roleLookup.put(makeRoleSpec());
      await expect(
        fx.handlers.employeesPromote({
          employeeId: 'emp-iris',
          newRoleId: 'engineering-manager',
        }),
      ).resolves.toMatchObject({ employeeId: 'emp-iris' });
      expect(consoleWarnSpy).toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

// ---------------------------------------------------------------------------
// BUG-002 hardening — archived-company guard
// ---------------------------------------------------------------------------

describe('IPC: employees.promote — archived-company guard (BUG-002)', () => {
  it('rejects promote against an archived company with a clear error', async () => {
    const fx = buildFixture({ companyStatus: 'archived' });
    fx.employees.put(makeEmployeeRow({ id: 'emp-iris' }));
    fx.roleLookup.put(makeRoleSpec());
    await expect(
      fx.handlers.employeesPromote({ employeeId: 'emp-iris', newRoleId: 'engineering-manager' }),
    ).rejects.toThrow(/is archived; reactivate before mutating org/);
    // No promote call, no bus event, no row mutation.
    expect(fx.employees.promoteCalls).toEqual([]);
    expect(fx.bus.emitted).toEqual([]);
  });

  it('rejects promote when the employee references a missing company', async () => {
    const fx = buildFixture();
    // Hire an employee under a company id that is NOT seeded into companies.
    fx.employees.put(makeEmployeeRow({ id: 'emp-iris', companyId: 'co-ghost' }));
    fx.roleLookup.put(makeRoleSpec());
    await expect(
      fx.handlers.employeesPromote({ employeeId: 'emp-iris', newRoleId: 'engineering-manager' }),
    ).rejects.toThrow(/company not found: co-ghost/);
    expect(fx.employees.promoteCalls).toEqual([]);
    expect(fx.bus.emitted).toEqual([]);
  });

  it('still permits promote when the company is paused (only archived blocks)', async () => {
    const fx = buildFixture({ companyStatus: 'paused' });
    fx.employees.put(makeEmployeeRow({ id: 'emp-iris' }));
    fx.roleLookup.put(makeRoleSpec());
    await expect(
      fx.handlers.employeesPromote({ employeeId: 'emp-iris', newRoleId: 'engineering-manager' }),
    ).resolves.toMatchObject({ employeeId: 'emp-iris' });
  });
});

// ---------------------------------------------------------------------------
// TC-IPC-PROMOTE-FIRE-RACE — coverage gap for the documented no-op path
// ---------------------------------------------------------------------------

describe('IPC: employees.promote — concurrent fire race (TC-IPC-PROMOTE-FIRE-RACE)', () => {
  it('handler completes if employee is deleted between getById and repo.promote (no-op write + bus emit fires with snapshot)', async () => {
    // Documented behavior: the repo's `promote` is a no-op for unknown
    // ids; the handler captures the pre-promote snapshot from getById
    // and emits the bus event with that snapshot. The IPC succeeds
    // (caller sees the response shape they expected), the durable
    // write is a no-op, and the renderer reconciles via React Query
    // refetch. This test pins that behavior so a future "fail loud
    // on missing row" refactor cannot ship silently.
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'emp-iris' }));
    fx.roleLookup.put(makeRoleSpec());

    // Patch the fake to delete the row AFTER getById is invoked but
    // BEFORE promote runs — simulating a concurrent employees.fire IPC.
    const originalGetById = fx.employees.getById.bind(fx.employees);
    fx.employees.getById = (id: string) => {
      const row = originalGetById(id);
      // Schedule the delete on next microtask so it lands before the
      // handler's call to employeesRepo.promote.
      if (row) {
        queueMicrotask(() => {
          fx.employees.rows = fx.employees.rows.filter((r) => r.id !== id);
        });
      }
      return row;
    };

    const result = await fx.handlers.employeesPromote({
      employeeId: 'emp-iris',
      newRoleId: 'engineering-manager',
    });
    expect(result.employeeId).toBe('emp-iris');
    // Bus event emitted with the pre-promote snapshot.
    expect(fx.bus.emitted).toHaveLength(1);
    expect(fx.bus.emitted[0]?.type).toBe('employee.promoted');
  });
});
