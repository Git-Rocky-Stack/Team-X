import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EmployeeRow } from '../db/repos/employees.js';
import type { OrgEdgeRow } from '../db/repos/orgchart.js';

import type { IpcEmployeesRepo, IpcEventBus, IpcOrgEdgesRepo } from './handlers.js';
import { createIpcHandlers } from './handlers.js';

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
  /** Tunable for the cycle-guard test. */
  cycleVerdict: ((companyId: string, managerId: string, reportId: string) => boolean) | null = null;

  put(row: OrgEdgeRow): void {
    this.rows.push(row);
  }

  listByCompany(companyId: string): OrgEdgeRow[] {
    return this.rows.filter((r) => r.companyId === companyId);
  }

  getByReport(reportId: string): OrgEdgeRow | null {
    return this.rows.find((r) => r.reportId === reportId) ?? null;
  }

  setManager(input: { companyId: string; managerId: string; reportId: string }): string {
    this.setManagerCalls.push(input);
    const existing = this.rows.find((r) => r.reportId === input.reportId);
    if (existing) {
      (existing as { managerId: string }).managerId = input.managerId;
      return existing.id;
    }
    const id = `edge-${this.rows.length + 1}`;
    this.rows.push({
      id,
      companyId: input.companyId,
      managerId: input.managerId,
      reportId: input.reportId,
      createdAt: 1_700_000_000_000,
    } as OrgEdgeRow);
    return id;
  }

  removeByReport(reportId: string): void {
    this.removeByReportCalls.push(reportId);
    this.rows = this.rows.filter((r) => r.reportId !== reportId);
  }

  wouldCycle(companyId: string, managerId: string, reportId: string): boolean {
    if (this.cycleVerdict) return this.cycleVerdict(companyId, managerId, reportId);
    return false;
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

function makeEmployeeRow(overrides: Partial<EmployeeRow> & { id: string }): EmployeeRow {
  return {
    id: overrides.id,
    companyId: COMPANY_ID,
    rolePackId: 'strategia-official',
    roleId: 'senior-fullstack-engineer',
    roleMdSha: 'a'.repeat(64),
    level: 'IC',
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
  employees: FakeEmployeesRepo;
  orgEdges: FakeOrgEdgesRepo;
  bus: ReturnType<typeof makeBusMock>;
  handlers: ReturnType<typeof createIpcHandlers>;
}

function buildFixture(opts?: { omitBus?: boolean }): Fixture {
  const employees = new FakeEmployeesRepo();
  const orgEdges = new FakeOrgEdgesRepo();
  const bus = makeBusMock();
  const handlers = createIpcHandlers({
    companiesRepo: noop as never,
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
  return { employees, orgEdges, bus, handlers };
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

  it('rejects with friendlier message when wouldCycle returns true', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'rpt' }));
    fx.employees.put(makeEmployeeRow({ id: 'mgr' }));
    fx.orgEdges.cycleVerdict = () => true;
    await expect(
      fx.handlers.employeesSetManager({ employeeId: 'rpt', managerId: 'mgr' }),
    ).rejects.toThrow(/reporting cycle/);
    expect(fx.orgEdges.setManagerCalls).toEqual([]);
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
