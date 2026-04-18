import { beforeEach, describe, expect, it } from 'vitest';

import type { EmployeeRow } from '../db/repos/employees.js';
import type { OrgEdgeRow } from '../db/repos/orgchart.js';

import type { IpcEmployeesRepo, IpcOrgEdgesRepo } from './handlers.js';
import { createIpcHandlers } from './handlers.js';

/**
 * Tests for the `orgchart.get` IPC handler — Phase 5.6 M-C step c
 * (restores Cluster B M9 org chart per audit row 2.21).
 *
 * Mirrors the focused per-namespace pattern companies-handlers.test.ts
 * established in step b: hand-rolled fakes satisfying the narrow IPC
 * dep surfaces, `noop as never` for every unused dep, no drizzle /
 * sql.js / electron required.
 *
 * Coverage targets the contract enumerated on the
 * `IpcHandlers.orgchartGet` interface comment:
 *
 *   - happy path: returns employees + edges + rootIds with multi-
 *     level tree, edges match input, rootIds is the set of employees
 *     with no edge pointing at them.
 *   - empty company: both arrays empty, rootIds empty.
 *   - single employee: no edges, single root.
 *   - rootIds computation: multiple roots when several employees are
 *     unwired; empty rootIds when every employee has a manager.
 *   - defensive filter: edges referencing employees outside
 *     `listVisibleByCompany` (e.g. system pseudo-employees, deleted
 *     rows) are dropped at handler time. The repo's `wouldCycle`
 *     guards the write path; this read-side filter defends against
 *     drifted state a direct-DB write could leave behind.
 *   - input validation: missing / empty-string / non-string companyId
 *     all throw with a `companyId` message.
 */

// ---------------------------------------------------------------------------
// Hand-rolled fakes — narrow surfaces only
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

  findSystemByRoleId(companyId: string, roleId: string): EmployeeRow | null {
    return (
      this.rows.find((r) => r.companyId === companyId && r.roleId === roleId && r.isSystem) ?? null
    );
  }

  create(): string {
    throw new Error('FakeEmployeesRepo.create: unused by orgchart.get tests');
  }

  delete(id: string): void {
    this.rows = this.rows.filter((r) => r.id !== id);
  }
}

class FakeOrgEdgesRepo implements IpcOrgEdgesRepo {
  rows: OrgEdgeRow[] = [];

  put(row: OrgEdgeRow): void {
    this.rows.push(row);
  }

  listByCompany(companyId: string): OrgEdgeRow[] {
    return this.rows.filter((r) => r.companyId === companyId);
  }
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

function makeEdgeRow(
  overrides: Partial<OrgEdgeRow> & { id: string; managerId: string; reportId: string },
): OrgEdgeRow {
  return {
    id: overrides.id,
    companyId: COMPANY_ID,
    managerId: overrides.managerId,
    reportId: overrides.reportId,
    createdAt: 1_700_000_001_000,
    ...overrides,
  } as OrgEdgeRow;
}

// biome-ignore lint/suspicious/noExplicitAny: test fake for unused deps
const noop: any = null;

interface Fixture {
  employees: FakeEmployeesRepo;
  orgEdges: FakeOrgEdgesRepo;
  handlers: ReturnType<typeof createIpcHandlers>;
}

function buildFixture(): Fixture {
  const employees = new FakeEmployeesRepo();
  const orgEdges = new FakeOrgEdgesRepo();
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
    getHardwareProfile: () => ({}) as never,
  });
  return { employees, orgEdges, handlers };
}

// ---------------------------------------------------------------------------
// Happy-path + shape assertions
// ---------------------------------------------------------------------------

describe('IPC: orgchart.get — happy path', () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = buildFixture();
  });

  it('returns employees, edges, and rootIds for a populated org', async () => {
    // Tree: CEO → { COO, VP Eng }, VP Eng → Eng Lead, Eng Lead → IC.
    fx.employees.put(makeEmployeeRow({ id: 'ceo', level: 'Officer', name: 'CEO' }));
    fx.employees.put(makeEmployeeRow({ id: 'coo', level: 'Officer', name: 'COO' }));
    fx.employees.put(makeEmployeeRow({ id: 'vpe', level: 'Senior Management', name: 'VP Eng' }));
    fx.employees.put(makeEmployeeRow({ id: 'lead', level: 'Lead', name: 'Eng Lead' }));
    fx.employees.put(makeEmployeeRow({ id: 'ic', level: 'IC', name: 'Eng IC' }));
    fx.orgEdges.put(makeEdgeRow({ id: 'e1', managerId: 'ceo', reportId: 'coo' }));
    fx.orgEdges.put(makeEdgeRow({ id: 'e2', managerId: 'ceo', reportId: 'vpe' }));
    fx.orgEdges.put(makeEdgeRow({ id: 'e3', managerId: 'vpe', reportId: 'lead' }));
    fx.orgEdges.put(makeEdgeRow({ id: 'e4', managerId: 'lead', reportId: 'ic' }));

    const result = await fx.handlers.orgchartGet({ companyId: COMPANY_ID });

    expect(result.employees).toHaveLength(5);
    expect(result.edges).toHaveLength(4);
    expect(result.rootIds).toEqual(['ceo']);
  });

  it('projects edges to the public OrgchartEdge wire shape (no companyId)', async () => {
    fx.employees.put(makeEmployeeRow({ id: 'ceo' }));
    fx.employees.put(makeEmployeeRow({ id: 'coo' }));
    fx.orgEdges.put(
      makeEdgeRow({ id: 'e1', managerId: 'ceo', reportId: 'coo', createdAt: 1_700_000_042_000 }),
    );

    const { edges } = await fx.handlers.orgchartGet({ companyId: COMPANY_ID });
    expect(edges).toHaveLength(1);
    const edge = edges[0];
    expect(edge).toEqual({
      id: 'e1',
      managerId: 'ceo',
      reportId: 'coo',
      createdAt: 1_700_000_042_000,
    });
    // companyId must NOT appear — implicit in the scoped request.
    expect(edge).not.toHaveProperty('companyId');
  });

  it('maps employee rows through the public Employee shape (strips internal columns)', async () => {
    fx.employees.put(
      makeEmployeeRow({
        id: 'iris',
        toolsAllowedJson: '["browse"]',
        toolsDeniedJson: '["shell"]',
      }),
    );
    const { employees } = await fx.handlers.orgchartGet({ companyId: COMPANY_ID });
    expect(employees[0]).not.toHaveProperty('toolsAllowedJson');
    expect(employees[0]).not.toHaveProperty('toolsDeniedJson');
    expect(employees[0]).not.toHaveProperty('rolePackId');
  });
});

describe('IPC: orgchart.get — rootIds computation', () => {
  it('treats a single unwired employee as a root', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'solo' }));
    const result = await fx.handlers.orgchartGet({ companyId: COMPANY_ID });
    expect(result.rootIds).toEqual(['solo']);
    expect(result.edges).toEqual([]);
  });

  it('returns an empty array for an empty company', async () => {
    const fx = buildFixture();
    const result = await fx.handlers.orgchartGet({ companyId: COMPANY_ID });
    expect(result.employees).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.rootIds).toEqual([]);
  });

  it('surfaces multiple roots when several employees are unwired', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'a' }));
    fx.employees.put(makeEmployeeRow({ id: 'b' }));
    fx.employees.put(makeEmployeeRow({ id: 'c' }));
    fx.orgEdges.put(makeEdgeRow({ id: 'e1', managerId: 'a', reportId: 'b' }));
    // c has no incoming edge → root alongside a.
    const result = await fx.handlers.orgchartGet({ companyId: COMPANY_ID });
    expect(result.rootIds.sort()).toEqual(['a', 'c']);
  });

  it('returns empty rootIds when every employee has a manager (pathological but legal)', async () => {
    // Two-employee cycle created by a direct-DB write — repo's wouldCycle
    // guards the write path; the read-side surface still reports the
    // data as-is so the renderer can surface the anomaly.
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'a' }));
    fx.employees.put(makeEmployeeRow({ id: 'b' }));
    fx.orgEdges.put(makeEdgeRow({ id: 'e1', managerId: 'a', reportId: 'b' }));
    fx.orgEdges.put(makeEdgeRow({ id: 'e2', managerId: 'b', reportId: 'a' }));
    const result = await fx.handlers.orgchartGet({ companyId: COMPANY_ID });
    expect(result.rootIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// System-employee + defensive-filter behavior
// ---------------------------------------------------------------------------

describe('IPC: orgchart.get — system + defensive filter', () => {
  it('filters system employees out of the employees array', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'ceo' }));
    fx.employees.put(
      makeEmployeeRow({ id: 'system-agent-id', roleId: 'system-agent', isSystem: true }),
    );
    fx.employees.put(
      makeEmployeeRow({ id: 'system-copilot-id', roleId: 'system-copilot', isSystem: true }),
    );
    const result = await fx.handlers.orgchartGet({ companyId: COMPANY_ID });
    expect(result.employees).toHaveLength(1);
    expect(result.employees[0]?.id).toBe('ceo');
  });

  it('drops edges that reference system employees as manager or report', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'ceo' }));
    fx.employees.put(makeEmployeeRow({ id: 'sys', isSystem: true }));
    // Edge ceo → sys: sys is filtered out of visible employees,
    // so the edge is defensively dropped at handler time.
    fx.orgEdges.put(makeEdgeRow({ id: 'e-sys', managerId: 'ceo', reportId: 'sys' }));
    const result = await fx.handlers.orgchartGet({ companyId: COMPANY_ID });
    expect(result.edges).toEqual([]);
  });

  it('drops edges that reference employees outside the company or non-visible set', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'ceo' }));
    // ghost-id is NOT in the employees repo — defensive filter MUST drop.
    fx.orgEdges.put(makeEdgeRow({ id: 'e-ghost', managerId: 'ceo', reportId: 'ghost-id' }));
    fx.orgEdges.put(makeEdgeRow({ id: 'e-ghost-mgr', managerId: 'ghost-id', reportId: 'ceo' }));
    const result = await fx.handlers.orgchartGet({ companyId: COMPANY_ID });
    expect(result.edges).toEqual([]);
    // ceo still counts as a root (the bad edges are gone).
    expect(result.rootIds).toEqual(['ceo']);
  });

  it('leaves unrelated visible-to-visible edges intact when other edges are dropped', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'ceo' }));
    fx.employees.put(makeEmployeeRow({ id: 'coo' }));
    fx.employees.put(makeEmployeeRow({ id: 'sys', isSystem: true }));
    fx.orgEdges.put(makeEdgeRow({ id: 'e1', managerId: 'ceo', reportId: 'coo' }));
    fx.orgEdges.put(makeEdgeRow({ id: 'e-bad', managerId: 'ceo', reportId: 'sys' }));
    const result = await fx.handlers.orgchartGet({ companyId: COMPANY_ID });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]?.id).toBe('e1');
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe('IPC: orgchart.get — input validation', () => {
  it('rejects when companyId is missing', async () => {
    const fx = buildFixture();
    await expect(fx.handlers.orgchartGet({} as unknown as { companyId: string })).rejects.toThrow(
      /companyId/,
    );
  });

  it('rejects when companyId is an empty string', async () => {
    const fx = buildFixture();
    await expect(fx.handlers.orgchartGet({ companyId: '' })).rejects.toThrow(/companyId/);
  });

  it('rejects when companyId is a non-string value', async () => {
    const fx = buildFixture();
    await expect(fx.handlers.orgchartGet({ companyId: 123 as unknown as string })).rejects.toThrow(
      /companyId/,
    );
  });
});

// ---------------------------------------------------------------------------
// Scoping — edges from other companies must not leak
// ---------------------------------------------------------------------------

describe('IPC: orgchart.get — scoping', () => {
  it('only returns edges whose companyId matches the request', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'ceo' }));
    fx.employees.put(makeEmployeeRow({ id: 'coo' }));
    fx.orgEdges.put(makeEdgeRow({ id: 'e1', managerId: 'ceo', reportId: 'coo' }));
    // Other-company edge — listByCompany filters these out at the
    // repo level. Adding it here verifies the repo call threads
    // companyId through correctly.
    fx.orgEdges.put(
      makeEdgeRow({
        id: 'e-other',
        companyId: 'co-2',
        managerId: 'other-mgr',
        reportId: 'other-rpt',
      }),
    );
    const result = await fx.handlers.orgchartGet({ companyId: COMPANY_ID });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]?.id).toBe('e1');
  });
});
