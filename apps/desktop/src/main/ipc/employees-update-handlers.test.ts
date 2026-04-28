import { describe, expect, it } from 'vitest';

import type { CompanyRow, UpdateCompanyInput } from '../db/repos/companies.js';
import type { CreateEmployeeInput, EmployeeRow, PromoteEmployeeInput, UpdateEmployeeProfileInput } from '../db/repos/employees.js';

import type { IpcCompaniesRepo, IpcEmployeesRepo, IpcEventBus } from './handlers.js';
import { createIpcHandlers } from './handlers.js';

const COMPANY_ID = 'co-1';

class FakeEmployeesRepo implements IpcEmployeesRepo {
  rows: EmployeeRow[] = [];
  updateProfileCalls: UpdateEmployeeProfileInput[] = [];

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

  create(_input: CreateEmployeeInput): string {
    throw new Error('FakeEmployeesRepo.create: unused by update tests');
  }

  delete(_id: string): void {
    throw new Error('FakeEmployeesRepo.delete: unused by update tests');
  }

  promote(_input: PromoteEmployeeInput): void {
    throw new Error('FakeEmployeesRepo.promote: unused by update tests');
  }

  updateProfile(input: UpdateEmployeeProfileInput): void {
    this.updateProfileCalls.push(input);
    const row = this.rows.find((r) => r.id === input.employeeId);
    if (!row) return;
    if (input.name !== undefined) (row as { name: string }).name = input.name;
    if (input.title !== undefined) (row as { title: string }).title = input.title;
    if (input.modelPref !== undefined) (row as { modelPref: string | null }).modelPref = input.modelPref;
    if (input.providerPref !== undefined) {
      (row as { providerPref: string | null }).providerPref = input.providerPref;
    }
    if (input.avatar !== undefined) (row as { avatar: string | null }).avatar = input.avatar;
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
    throw new Error('FakeCompaniesRepo.create: unused by update tests');
  }

  getById(id: string): CompanyRow | null {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  archive(id: string): void {
    const row = this.rows.find((r) => r.id === id);
    if (row) (row as { status: string }).status = 'archived';
  }

  update(_id: string, _patch: UpdateCompanyInput): void {
    throw new Error('FakeCompaniesRepo.update: unused by update tests');
  }

  delete(_id: string): void {
    throw new Error('FakeCompaniesRepo.delete: unused by update tests');
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
  const bus: IpcEventBus = {
    emit: (input) => {
      emitted.push({
        type: input.type,
        companyId: input.companyId,
        actorId: input.actorId,
        actorKind: input.actorKind,
        payload: input.payload,
      });
    },
  };
  return { bus, emitted };
}

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
    roleId: 'cto',
    roleMdSha: 'a'.repeat(64),
    level: 'officer',
    name: 'New Hire X3mMOc',
    title: 'CTO',
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

function buildFixture(opts?: { companyStatus?: string; omitBus?: boolean }) {
  const companies = new FakeCompaniesRepo();
  companies.put(makeCompanyRow({ id: COMPANY_ID, status: opts?.companyStatus ?? 'running' }));
  const employees = new FakeEmployeesRepo();
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
  return { companies, employees, bus, handlers };
}

describe('IPC: employees.update', () => {
  it('updates editable profile fields, returns the refreshed row, and emits employee.updated', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'cto-1', modelPref: 'claude-haiku-4-5' }));

    const result = await fx.handlers.employeesUpdate({
      employeeId: 'cto-1',
      name: 'Maya Chen',
      title: 'Chief Technology Officer',
      providerPref: 'openai',
      modelPref: null,
      avatar: 'https://example.com/maya.png',
    });

    expect(result.employee).toMatchObject({
      id: 'cto-1',
      name: 'Maya Chen',
      title: 'Chief Technology Officer',
      roleId: 'cto',
      providerPref: 'openai',
      avatar: 'https://example.com/maya.png',
    });
    expect('modelPref' in result.employee).toBe(false);
    expect(fx.employees.updateProfileCalls).toEqual([
      {
        employeeId: 'cto-1',
        name: 'Maya Chen',
        title: 'Chief Technology Officer',
        providerPref: 'openai',
        modelPref: null,
        avatar: 'https://example.com/maya.png',
      },
    ]);
    expect(fx.bus.emitted).toEqual([
      {
        type: 'employee.updated',
        companyId: COMPANY_ID,
        actorId: 'rocky',
        actorKind: 'user',
        payload: expect.objectContaining({
          employeeId: 'cto-1',
          patchedKeys: ['name', 'title', 'modelPref', 'providerPref', 'avatar'],
          name: 'Maya Chen',
          title: 'Chief Technology Officer',
        }),
      },
    ]);
  });

  it('rejects blank names before writing', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'cto-1' }));

    await expect(fx.handlers.employeesUpdate({ employeeId: 'cto-1', name: '   ' })).rejects.toThrow(
      /name is required/,
    );
    expect(fx.employees.updateProfileCalls).toEqual([]);
    expect(fx.bus.emitted).toEqual([]);
  });

  it('refuses to edit framework-internal employees', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'sys-1', isSystem: true, level: 'system' }));

    await expect(fx.handlers.employeesUpdate({ employeeId: 'sys-1', name: 'System' })).rejects.toThrow(
      /framework-internal/,
    );
    expect(fx.employees.updateProfileCalls).toEqual([]);
  });

  it('rejects edits against archived companies', async () => {
    const fx = buildFixture({ companyStatus: 'archived' });
    fx.employees.put(makeEmployeeRow({ id: 'cto-1' }));

    await expect(fx.handlers.employeesUpdate({ employeeId: 'cto-1', name: 'Maya Chen' })).rejects.toThrow(
      /is archived; reactivate before mutating org/,
    );
    expect(fx.employees.updateProfileCalls).toEqual([]);
  });
});
