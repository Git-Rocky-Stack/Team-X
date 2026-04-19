import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompanyRow } from '../db/repos/companies.js';
import type { EmployeeRow } from '../db/repos/employees.js';
import type { OrgEdgeRow } from '../db/repos/orgchart.js';

import type {
  IpcCompaniesRepo,
  IpcEmployeesRepo,
  IpcEventBus,
  IpcOrgEdgesRepo,
} from './handlers.js';
import { createIpcHandlers } from './handlers.js';

const HUMAN_USER_ID = 'rocky';

/**
 * Tests for the `employees.setManager` IPC handler — Phase 5.6 M-C step d
 * (restores Cluster B M9 reporting-line edit per audit row 2.20).
 *
 * Coverage targets the contract enumerated on the
 * `IpcHandlers.employeesSetManager` interface comment + the
 * architectural-invariant-#11 bus emit:
 *
 *   - happy path (upsert): non-null managerId calls
 *     `orgEdgesRepo.setManager` with companyId resolved from the
 *     employee row; emits `employee.managerSet` with previous + new
 *     manager ids.
 *   - happy path (detach): null managerId calls
 *     `orgEdgesRepo.removeByReport` and emits with `managerId: null`.
 *   - input validation: missing/non-string employeeId; managerId not
 *     string-or-null; null body.
 *   - employee not found: 404 throw.
 *   - manager not found: 404 throw on the upsert path.
 *   - system-employee guards on BOTH sides (report + manager).
 *   - cross-company guard: report and manager must share companyId.
 *   - self-edge guard: managerId === employeeId is rejected.
 *   - cycle guard: pre-flight `wouldCycle` rejection surfaces a
 *     friendlier message than the repo's raw throw.
 *   - bus.emit throw is logged + swallowed; bus dep unwired warns in dev.
 */

// ---------------------------------------------------------------------------
// Hand-rolled fakes
// ---------------------------------------------------------------------------

class FakeEmployeesRepo implements IpcEmployeesRepo {
  rows: EmployeeRow[] = [];

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
    throw new Error('FakeEmployeesRepo.create: unused by setManager tests');
  }
  delete(): void {
    throw new Error('FakeEmployeesRepo.delete: unused by setManager tests');
  }
  promote(): void {
    throw new Error('FakeEmployeesRepo.promote: unused by setManager tests');
  }
}

class FakeOrgEdgesRepo implements IpcOrgEdgesRepo {
  rows: OrgEdgeRow[] = [];
  setManagerCalls: Array<{ companyId: string; managerId: string; reportId: string }> = [];
  removeByReportCalls: string[] = [];
  /**
   * BUG-003 + BUG-004 hardening: the handler no longer pre-checks
   * wouldCycle (TOCTOU window eliminated by repo-level transaction).
   * The cycle-guard test now drives the fake's setManager to throw
   * with the canonical `[org-edges] setManager: would create cycle`
   * prefix the handler's catch-and-rewrap depends on.
   */
  shouldThrowCycleOnSetManager = false;

  put(row: OrgEdgeRow): void {
    this.rows.push(row);
  }

  listByCompany(companyId: string): OrgEdgeRow[] {
    return this.rows.filter((r) => r.companyId === companyId);
  }

  getByReport(reportId: string): OrgEdgeRow | null {
    return this.rows.find((r) => r.reportId === reportId) ?? null;
  }

  setManager(input: {
    companyId: string;
    managerId: string;
    reportId: string;
  }): { edgeId: string; previousManagerId: string | null } {
    this.setManagerCalls.push(input);
    if (this.shouldThrowCycleOnSetManager) {
      throw new Error(
        `[org-edges] setManager: would create cycle — ${input.managerId} already reports (directly or transitively) to ${input.reportId}`,
      );
    }
    const existing = this.rows.find((r) => r.reportId === input.reportId);
    const previousManagerId = existing?.managerId ?? null;
    if (existing) {
      (existing as { managerId: string }).managerId = input.managerId;
      return { edgeId: existing.id, previousManagerId };
    }
    const id = `edge-${this.rows.length + 1}`;
    this.rows.push({
      id,
      companyId: input.companyId,
      managerId: input.managerId,
      reportId: input.reportId,
      createdAt: 1_700_000_000_000,
    } as OrgEdgeRow);
    return { edgeId: id, previousManagerId };
  }

  removeByReport(reportId: string): { previousManagerId: string | null } {
    this.removeByReportCalls.push(reportId);
    const existing = this.rows.find((r) => r.reportId === reportId);
    const previousManagerId = existing?.managerId ?? null;
    this.rows = this.rows.filter((r) => r.reportId !== reportId);
    return { previousManagerId };
  }

  wouldCycle(_companyId: string, _managerId: string, _reportId: string): boolean {
    // No longer called by the handler (M-C step d hardening); kept on
    // the interface for diagnostic / dev-tooling use. Tests that
    // assert handler-side cycle rejection now drive
    // `shouldThrowCycleOnSetManager` instead.
    return false;
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
    throw new Error('FakeCompaniesRepo.create: unused by setManager tests');
  }

  getById(id: string): CompanyRow | null {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  archive(id: string): void {
    const row = this.rows.find((r) => r.id === id);
    if (row) (row as { status: string }).status = 'archived';
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

/**
 * Default fixture employees both sit at IC level. Cycle / scope tests
 * that don't care about level inversion can use this default. Tests
 * exercising the BUG-001 level-inversion guard pass explicit
 * higher-tier `level` values via the overrides param.
 *
 * The handler enforces `rank(manager) < rank(report)` strictly. Since
 * both default-fixture employees are 'IC' (rank 5), assigning one to
 * manage the other would TRIGGER the inversion guard. To keep existing
 * happy-path tests working, the manager defaults to a more senior
 * level when seeded under id 'mgr' or 'mgr-old' / 'mgr-new'.
 */
function makeEmployeeRow(overrides: Partial<EmployeeRow> & { id: string }): EmployeeRow {
  // Heuristic: seed 'mgr*' ids at officer level so happy-path tests
  // pass the inversion guard. Tests that need explicit level shape
  // pass `level` via overrides.
  const defaultLevel = /^mgr/i.test(overrides.id) ? 'officer' : 'ic';
  return {
    id: overrides.id,
    companyId: COMPANY_ID,
    rolePackId: 'strategia-official',
    roleId: 'senior-fullstack-engineer',
    roleMdSha: 'a'.repeat(64),
    level: defaultLevel,
    name: 'Employee',
    title: 'Senior Fullstack Engineer',
    status: 'idle',
    modelPref: null,
    providerPref: null,
    toolsAllowedJson: '[]',
    toolsDeniedJson: '[]',
    avatar: null,
    isSystem: false,
    createdAt: 1_700_000_000_000,
    ...overrides,
  } as EmployeeRow;
}

// biome-ignore lint/suspicious/noExplicitAny: test fake for unused deps
const noop: any = null;

interface Fixture {
  companies: FakeCompaniesRepo;
  employees: FakeEmployeesRepo;
  orgEdges: FakeOrgEdgesRepo;
  bus: ReturnType<typeof makeBusMock>;
  handlers: ReturnType<typeof createIpcHandlers>;
}

function buildFixture(opts?: { omitBus?: boolean; companyStatus?: string }): Fixture {
  const companies = new FakeCompaniesRepo();
  companies.put(makeCompanyRow({ id: COMPANY_ID, status: opts?.companyStatus ?? 'running' }));
  // Tests that exercise cross-company guards seed a second company in
  // running state via fx.companies.put().
  const employees = new FakeEmployeesRepo();
  const orgEdges = new FakeOrgEdgesRepo();
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
    orgEdgesRepo: orgEdges,
    runsRepo: noop as never,
    eventsRepo: noop as never,
    orchestrator: noop as never,
    meetingService: noop as never,
    roleLookup: noop as never,
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
  return { companies, employees, orgEdges, bus, handlers };
}

// ---------------------------------------------------------------------------
// Happy path — upsert + detach
// ---------------------------------------------------------------------------

describe('IPC: employees.setManager — happy path (upsert)', () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = buildFixture();
  });

  it('inserts a new edge when no prior manager edge exists', async () => {
    fx.employees.put(makeEmployeeRow({ id: 'mgr' }));
    fx.employees.put(makeEmployeeRow({ id: 'rpt' }));

    await fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: 'mgr' });

    expect(fx.orgEdges.setManagerCalls).toEqual([
      { companyId: COMPANY_ID, managerId: 'mgr', reportId: 'rpt' },
    ]);
    expect(fx.orgEdges.removeByReportCalls).toEqual([]);
    expect(fx.bus.emitted).toHaveLength(1);
    expect(fx.bus.emitted[0]?.type).toBe('employee.managerSet');
    expect(fx.bus.emitted[0]?.companyId).toBe(COMPANY_ID);
    // BUG-005 hardening: actorId is the canonical HUMAN_USER_ID constant.
    expect(fx.bus.emitted[0]?.actorId).toBe(HUMAN_USER_ID);
    expect(fx.bus.emitted[0]?.payload).toMatchObject({
      employeeId: 'rpt',
      companyId: COMPANY_ID,
      managerId: 'mgr',
      previousManagerId: null,
    });
  });

  it('upserts when an existing edge is reassigned', async () => {
    fx.employees.put(makeEmployeeRow({ id: 'mgr-old' }));
    fx.employees.put(makeEmployeeRow({ id: 'mgr-new' }));
    fx.employees.put(makeEmployeeRow({ id: 'rpt' }));
    fx.orgEdges.put({
      id: 'e1',
      companyId: COMPANY_ID,
      managerId: 'mgr-old',
      reportId: 'rpt',
      createdAt: 1_700_000_000_000,
    } as OrgEdgeRow);

    await fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: 'mgr-new' });

    expect(fx.orgEdges.setManagerCalls[0]?.managerId).toBe('mgr-new');
    expect(fx.bus.emitted[0]?.payload).toMatchObject({
      employeeId: 'rpt',
      managerId: 'mgr-new',
      previousManagerId: 'mgr-old',
    });
  });
});

describe('IPC: employees.setManager — happy path (detach)', () => {
  it('clears the edge when managerId is null and emits with managerId: null', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'mgr-old' }));
    fx.employees.put(makeEmployeeRow({ id: 'rpt' }));
    fx.orgEdges.put({
      id: 'e1',
      companyId: COMPANY_ID,
      managerId: 'mgr-old',
      reportId: 'rpt',
      createdAt: 1_700_000_000_000,
    } as OrgEdgeRow);

    await fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: null });

    expect(fx.orgEdges.removeByReportCalls).toEqual(['rpt']);
    expect(fx.orgEdges.setManagerCalls).toEqual([]);
    expect(fx.bus.emitted).toHaveLength(1);
    expect(fx.bus.emitted[0]?.payload).toMatchObject({
      employeeId: 'rpt',
      managerId: null,
      previousManagerId: 'mgr-old',
    });
  });

  it('detach is a no-op against an already-root employee but still emits', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'rpt' }));
    await fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: null });
    expect(fx.orgEdges.removeByReportCalls).toEqual(['rpt']);
    expect(fx.bus.emitted).toHaveLength(1);
    expect(fx.bus.emitted[0]?.payload).toMatchObject({
      employeeId: 'rpt',
      managerId: null,
      previousManagerId: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe('IPC: employees.setManager — input validation', () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = buildFixture();
  });

  it('rejects when the request body is null', async () => {
    await expect(
      fx.handlers.employeesSetManager(
        null as unknown as {
          employeeId: string;
          managerId: string | null;
        },
      ),
    ).rejects.toThrow(/request body is required/);
  });

  it('rejects when employeeId is empty', async () => {
    await expect(
      fx.handlers.employeesSetManager({ employeeId: '', managerId: null }),
    ).rejects.toThrow(/employeeId/);
  });

  it('rejects when employeeId is non-string', async () => {
    await expect(
      fx.handlers.employeesSetManager({
        employeeId: 42 as unknown as string,
        managerId: null,
      }),
    ).rejects.toThrow(/employeeId/);
  });

  it('rejects when managerId is undefined (must be string-or-null)', async () => {
    await expect(
      fx.handlers.employeesSetManager({ employeeId: 'rpt' } as unknown as {
        employeeId: string;
        managerId: string | null;
      }),
    ).rejects.toThrow(/managerId/);
  });

  it('rejects when managerId is a non-string non-null value', async () => {
    await expect(
      fx.handlers.employeesSetManager({
        employeeId: 'rpt',
        managerId: 42 as unknown as string,
      }),
    ).rejects.toThrow(/managerId/);
  });

  it('rejects when managerId is an empty string (use null to detach instead)', async () => {
    await expect(
      fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: '' }),
    ).rejects.toThrow(/managerId/);
  });
});

// ---------------------------------------------------------------------------
// Defensive guards
// ---------------------------------------------------------------------------

describe('IPC: employees.setManager — defensive guards', () => {
  it('throws when the report employee does not exist', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'mgr' }));
    await expect(
      fx.handlers.employeesSetManager({ employeeId: 'ghost', managerId: 'mgr' }),
    ).rejects.toThrow(/employee not found: ghost/);
    expect(fx.orgEdges.setManagerCalls).toEqual([]);
    expect(fx.bus.emitted).toEqual([]);
  });

  it('throws when the report is a framework-internal employee', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'sys', isSystem: true }));
    fx.employees.put(makeEmployeeRow({ id: 'mgr' }));
    await expect(
      fx.handlers.employeesSetManager({ employeeId: 'sys', managerId: 'mgr' }),
    ).rejects.toThrow(/framework-internal/);
    expect(fx.bus.emitted).toEqual([]);
  });

  it('throws self-edge attempts (managerId === employeeId)', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'rpt' }));
    await expect(
      fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: 'rpt' }),
    ).rejects.toThrow(/self-edges/);
    expect(fx.orgEdges.setManagerCalls).toEqual([]);
  });

  it('throws when the manager does not exist (upsert path)', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'rpt' }));
    await expect(
      fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: 'ghost-mgr' }),
    ).rejects.toThrow(/manager not found: ghost-mgr/);
  });

  it('throws when the manager is a framework-internal employee', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'rpt' }));
    fx.employees.put(makeEmployeeRow({ id: 'sys-mgr', isSystem: true }));
    await expect(
      fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: 'sys-mgr' }),
    ).rejects.toThrow(/framework-internal/);
    expect(fx.orgEdges.setManagerCalls).toEqual([]);
  });

  it('throws when manager and report belong to different companies', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'rpt', companyId: 'co-1' }));
    fx.employees.put(makeEmployeeRow({ id: 'mgr', companyId: 'co-2' }));
    await expect(
      fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: 'mgr' }),
    ).rejects.toThrow(/share a company/);
    expect(fx.orgEdges.setManagerCalls).toEqual([]);
  });

  it('rewraps the repo cycle throw with a friendlier renderer-facing message', async () => {
    // BUG-003 + BUG-004 hardening: the handler no longer pre-checks
    // wouldCycle; the repo's setManager throws with a `[org-edges]
    // setManager: would create cycle` prefix and the handler catches +
    // rewraps to surface the friendlier `would create reporting cycle`
    // message. The fake's `shouldThrowCycleOnSetManager` flag drives
    // the throw path.
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'rpt' }));
    fx.employees.put(makeEmployeeRow({ id: 'mgr' }));
    fx.orgEdges.shouldThrowCycleOnSetManager = true;
    await expect(
      fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: 'mgr' }),
    ).rejects.toThrow(/would create reporting cycle/);
    // setManager IS invoked (the repo is what throws now); previously
    // the handler-side pre-check short-circuited before the repo call.
    // No bus event because the throw cascades out of the handler.
    expect(fx.orgEdges.setManagerCalls).toHaveLength(1);
    expect(fx.bus.emitted).toEqual([]);
  });

  it('preserves non-cycle repo errors without rewrap (defense in depth)', async () => {
    // If the repo throws something other than the cycle prefix the
    // handler does NOT mask the error — caller sees the raw repo
    // failure. Pin the contract.
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'rpt' }));
    fx.employees.put(makeEmployeeRow({ id: 'mgr' }));
    const originalSetManager = fx.orgEdges.setManager.bind(fx.orgEdges);
    fx.orgEdges.setManager = () => {
      // Drive a non-cycle error path.
      throw new Error('SQLITE_BUSY: database is locked');
    };
    await expect(
      fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: 'mgr' }),
    ).rejects.toThrow(/SQLITE_BUSY/);
    fx.orgEdges.setManager = originalSetManager;
    expect(fx.bus.emitted).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Architectural invariant #11 — bus tolerance
// ---------------------------------------------------------------------------

describe('IPC: employees.setManager — bus emit tolerance (invariant #11)', () => {
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
    fx.employees.put(makeEmployeeRow({ id: 'rpt' }));
    fx.employees.put(makeEmployeeRow({ id: 'mgr' }));
    fx.bus.setNextEmitThrow(new Error('bus on fire'));
    await expect(
      fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: 'mgr' }),
    ).resolves.toBeUndefined();
    expect(fx.orgEdges.setManagerCalls).toHaveLength(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('warns in dev (and does not throw) when the bus dep is unwired', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const fx = buildFixture({ omitBus: true });
      fx.employees.put(makeEmployeeRow({ id: 'rpt' }));
      fx.employees.put(makeEmployeeRow({ id: 'mgr' }));
      await expect(
        fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: 'mgr' }),
      ).resolves.toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

// ---------------------------------------------------------------------------
// BUG-001 hardening — level-inversion guard
// ---------------------------------------------------------------------------

describe('IPC: employees.setManager — level-inversion guard (BUG-001)', () => {
  it('rejects when manager and report are at the same level', async () => {
    const fx = buildFixture();
    // Two ICs — same rank → reject.
    fx.employees.put(makeEmployeeRow({ id: 'rpt', level: 'ic' }));
    fx.employees.put(makeEmployeeRow({ id: 'peer', level: 'ic' }));
    await expect(
      fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: 'peer' }),
    ).rejects.toThrow(/level inversion — manager \(ic\) must be at a strictly more senior level/);
    expect(fx.orgEdges.setManagerCalls).toEqual([]);
    expect(fx.bus.emitted).toEqual([]);
  });

  it('rejects when manager is at a more JUNIOR level than the report (true inversion)', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'officer', level: 'officer' }));
    fx.employees.put(makeEmployeeRow({ id: 'ic-mgr', level: 'ic' }));
    await expect(
      fx.handlers.employeesSetManager({ employeeId: 'officer', managerId: 'ic-mgr' }),
    ).rejects.toThrow(/level inversion/);
    expect(fx.orgEdges.setManagerCalls).toEqual([]);
  });

  it('accepts when manager is strictly more senior than the report', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'rpt', level: 'ic' }));
    fx.employees.put(makeEmployeeRow({ id: 'lead', level: 'lead' }));
    await expect(
      fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: 'lead' }),
    ).resolves.toBeUndefined();
    expect(fx.orgEdges.setManagerCalls).toHaveLength(1);
  });

  it('accepts officer-managed-by-officer is rejected (same rank)', async () => {
    // Two officers at same rank — strict rule rejects same-level too.
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'ceo', level: 'officer' }));
    fx.employees.put(makeEmployeeRow({ id: 'cfo', level: 'officer' }));
    await expect(
      fx.handlers.employeesSetManager({ employeeId: 'ceo', managerId: 'cfo' }),
    ).rejects.toThrow(/level inversion/);
  });

  it('normalizes case-and-whitespace differences (Senior Management = senior-management)', async () => {
    // Verify the getLevelRank normalizer handles role-pack shapes that
    // ship with capitalized level frontmatter.
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'rpt', level: 'IC' }));
    fx.employees.put(makeEmployeeRow({ id: 'sm', level: 'Senior Management' }));
    await expect(
      fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: 'sm' }),
    ).resolves.toBeUndefined();
    expect(fx.orgEdges.setManagerCalls).toHaveLength(1);
  });

  it('FAILS OPEN with dev-mode warning when either level is unknown', async () => {
    // Unknown level → guard skipped; the write proceeds. The dev-mode
    // console.warn is the operational signal that a role-pack
    // introduced a new tier the rank table doesn't recognize.
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const fx = buildFixture();
      fx.employees.put(makeEmployeeRow({ id: 'rpt', level: 'mystery-tier' }));
      fx.employees.put(makeEmployeeRow({ id: 'mgr', level: 'officer' }));
      await expect(
        fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: 'mgr' }),
      ).resolves.toBeUndefined();
      expect(fx.orgEdges.setManagerCalls).toHaveLength(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('level rank unknown'));
    } finally {
      consoleWarnSpy.mockRestore();
      process.env.NODE_ENV = prev;
    }
  });

  it('does NOT apply level-inversion guard on the detach path (managerId: null)', async () => {
    // Detach has no manager to compare to. Even if the report's level
    // would otherwise fail the guard, detach succeeds.
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'rpt', level: 'mystery-tier' }));
    await expect(
      fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: null }),
    ).resolves.toBeUndefined();
    expect(fx.orgEdges.removeByReportCalls).toEqual(['rpt']);
  });
});

// ---------------------------------------------------------------------------
// BUG-002 hardening — archived-company guard
// ---------------------------------------------------------------------------

describe('IPC: employees.setManager — archived-company guard (BUG-002)', () => {
  it('rejects setManager against an archived company (upsert path)', async () => {
    const fx = buildFixture({ companyStatus: 'archived' });
    fx.employees.put(makeEmployeeRow({ id: 'rpt' }));
    fx.employees.put(makeEmployeeRow({ id: 'mgr' }));
    await expect(
      fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: 'mgr' }),
    ).rejects.toThrow(/is archived; reactivate before mutating org/);
    expect(fx.orgEdges.setManagerCalls).toEqual([]);
    expect(fx.bus.emitted).toEqual([]);
  });

  it('rejects setManager against an archived company (detach path)', async () => {
    const fx = buildFixture({ companyStatus: 'archived' });
    fx.employees.put(makeEmployeeRow({ id: 'rpt' }));
    await expect(
      fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: null }),
    ).rejects.toThrow(/is archived/);
    expect(fx.orgEdges.removeByReportCalls).toEqual([]);
  });

  it('rejects setManager when company is missing entirely', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'rpt', companyId: 'co-ghost' }));
    fx.employees.put(makeEmployeeRow({ id: 'mgr', companyId: 'co-ghost' }));
    await expect(
      fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: 'mgr' }),
    ).rejects.toThrow(/company not found: co-ghost/);
  });
});

// ---------------------------------------------------------------------------
// BUG-003 + BUG-004 hardening — atomic transaction holds (no TOCTOU)
// ---------------------------------------------------------------------------

describe('IPC: employees.setManager — atomic repo contract (BUG-003 + BUG-004)', () => {
  it('previousManagerId in the bus payload comes from the repo (snapshot inside transaction)', async () => {
    // The handler trusts the repo's returned previousManagerId — it
    // does NOT take a separate getByReport snapshot at the handler
    // level (that was the BUG-004 race window). The fake's setManager
    // returns the snapshot; the handler forwards it to the bus.
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'mgr-old' }));
    fx.employees.put(makeEmployeeRow({ id: 'mgr-new' }));
    fx.employees.put(makeEmployeeRow({ id: 'rpt' }));
    fx.orgEdges.put({
      id: 'e1',
      companyId: COMPANY_ID,
      managerId: 'mgr-old',
      reportId: 'rpt',
      createdAt: 1_700_000_000_000,
    } as OrgEdgeRow);

    await fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: 'mgr-new' });
    expect(fx.bus.emitted[0]?.payload).toMatchObject({
      previousManagerId: 'mgr-old',
      managerId: 'mgr-new',
    });
  });

  it('previousManagerId is null on the detach path when the report was already a root', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'rpt' }));
    await fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: null });
    expect(fx.bus.emitted[0]?.payload).toMatchObject({
      previousManagerId: null,
      managerId: null,
    });
  });

  it('handler does NOT call orgEdgesRepo.wouldCycle directly (TOCTOU eliminated by repo)', async () => {
    // Pin the design contract: handler relies on the repo's transaction
    // for cycle safety. wouldCycle is exposed for diagnostic use only.
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'rpt' }));
    fx.employees.put(makeEmployeeRow({ id: 'mgr' }));
    const wouldCycleSpy = vi.spyOn(fx.orgEdges, 'wouldCycle');
    await fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: 'mgr' });
    expect(wouldCycleSpy).not.toHaveBeenCalled();
    wouldCycleSpy.mockRestore();
  });

  it('handler does NOT call orgEdgesRepo.getByReport directly (snapshot comes from atomic repo return)', async () => {
    // BUG-004 — the prior implementation called getByReport at the
    // handler level to capture previousManagerId, which raced with
    // concurrent edits. The hardening pass moved the snapshot into
    // the repo's transaction. Pin that the handler no longer reads
    // separately.
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'rpt' }));
    fx.employees.put(makeEmployeeRow({ id: 'mgr' }));
    const getByReportSpy = vi.spyOn(fx.orgEdges, 'getByReport');
    await fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: 'mgr' });
    expect(getByReportSpy).not.toHaveBeenCalled();
    getByReportSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// BUG-007 — invariant #11 cache-staleness contract pin
// ---------------------------------------------------------------------------

describe('IPC: employees.setManager — invariant #11 contract pin (BUG-007)', () => {
  it('explicitly contracts: bus emit failure does NOT cascade into IPC throw', async () => {
    // Pin the documented design tradeoff: when bus emit fails, the
    // IPC returns success because the durable write already landed.
    // Renderer caches stay stale until React Query refetches via
    // staleTime / refetchOnFocus / explicit invalidation. This test
    // is the audit trail that the design call was deliberate, so a
    // future "throw on bus failure" refactor breaks this test loud.
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'rpt' }));
    fx.employees.put(makeEmployeeRow({ id: 'mgr' }));
    fx.bus.setNextEmitThrow(new Error('bus crashed'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(
        fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: 'mgr' }),
      ).resolves.toBeUndefined();
      // Durable write happened (setManager called) BEFORE the failed
      // emit. This is the order the contract requires.
      expect(fx.orgEdges.setManagerCalls).toHaveLength(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
