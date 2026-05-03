import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompanyRow, UpdateCompanyInput } from '../db/repos/companies.js';

import type {
  IpcCompaniesRepo,
  IpcCopilotAnalyzerService,
  IpcCopilotEventWindow,
  IpcEventBus,
} from './handlers.js';
import { createIpcHandlers } from './handlers.js';

/**
 * Tests for the `companies.delete` IPC handler — Phase 5.6 M-C step e
 * (restores Cluster A multi-company CRUD per audit row 10.15;
 * destructive sibling of `companies.archive`).
 *
 * Mirrors the focused per-namespace test convention established by
 * `companies-handlers.test.ts` (step b) + `companies-update-handlers.test.ts`
 * — minimal hand-rolled mocks satisfying the narrow IPC dep surfaces.
 *
 * Coverage targets the contract enumerated on the
 * `IpcHandlers.companiesDelete` interface comment:
 *
 *   - happy path: repo.delete is called with the companyId; snapshot
 *     read captures name + slug BEFORE the delete so the bus event
 *     payload has a valid identifier even though the row is gone;
 *     `company.deleted` fires with actorId = HUMAN_USER_ID (invariant #11).
 *   - quiesce order: analyzer.stop is called BEFORE eventWindow.clear
 *     BEFORE repo.delete (mirrors `companies.archive`). Racing analyzer
 *     ticks cannot observe rows about to disappear.
 *   - archived companies ARE deletable (delete is permanent remove;
 *     archive is soft-delete; deleting an archived company is valid).
 *   - input validation: missing/empty companyId; missing company id.
 *   - dep tolerance: missing analyzer/window deps warn in dev but don't
 *     fail the IPC; missing bus warns + swallows emit.
 *   - error propagation: repo.delete throws pass through verbatim
 *     (schema drift surfaces raw sqlite text for diagnosis).
 */

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeCompaniesRepo implements IpcCompaniesRepo {
  rows: CompanyRow[] = [];
  deleteCalls: string[] = [];
  nextDeleteError: Error | null = null;

  list(): CompanyRow[] {
    return this.rows;
  }
  create(input: {
    name: string;
    slug: string;
    settings?: Record<string, unknown>;
    icon?: string;
    theme?: string;
  }): string {
    const id = `company-${this.rows.length + 1}`;
    this.rows.push({
      id,
      name: input.name,
      slug: input.slug,
      createdAt: Date.now(),
      settingsJson: JSON.stringify(input.settings ?? {}),
      icon: input.icon ?? null,
      theme: input.theme ?? 'dark',
      status: 'running',
    } as CompanyRow);
    return id;
  }
  getById(id: string): CompanyRow | null {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  archive(id: string): void {
    const row = this.rows.find((r) => r.id === id);
    if (row) row.status = 'archived';
  }
  update(_id: string, _patch: UpdateCompanyInput): void {
    throw new Error('unused by companies.delete tests');
  }
  delete(id: string): void {
    this.deleteCalls.push(id);
    if (this.nextDeleteError) {
      const e = this.nextDeleteError;
      this.nextDeleteError = null;
      throw e;
    }
    this.rows = this.rows.filter((r) => r.id !== id);
  }
}

function makeAnalyzerMock(): IpcCopilotAnalyzerService & {
  startCalls: string[];
  stopCalls: string[];
  restartCalls: string[];
} {
  const startCalls: string[] = [];
  const stopCalls: string[] = [];
  const restartCalls: string[] = [];
  return {
    start: (companyId: string) => {
      startCalls.push(companyId);
    },
    stop: (companyId: string) => {
      stopCalls.push(companyId);
    },
    restart: (companyId: string) => {
      restartCalls.push(companyId);
    },
    startCalls,
    stopCalls,
    restartCalls,
  };
}

function makeWindowMock(): IpcCopilotEventWindow & { clearCalls: string[] } {
  const clearCalls: string[] = [];
  return {
    clear: (companyId: string) => {
      clearCalls.push(companyId);
    },
    clearCalls,
  };
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

function buildTestHandlers(opts?: {
  companiesRepo?: FakeCompaniesRepo;
  analyzer?: ReturnType<typeof makeAnalyzerMock>;
  window?: ReturnType<typeof makeWindowMock>;
  bus?: ReturnType<typeof makeBusMock>;
  omitAnalyzer?: boolean;
  omitWindow?: boolean;
  omitBus?: boolean;
}) {
  const noop = {} as Record<string, unknown>;
  const companiesRepo = opts?.companiesRepo ?? new FakeCompaniesRepo();
  const analyzer = opts?.analyzer ?? makeAnalyzerMock();
  const window = opts?.window ?? makeWindowMock();
  const bus = opts?.bus ?? makeBusMock();
  const handlers = createIpcHandlers({
    companiesRepo,
    employeesRepo: noop as never,
    threadsRepo: noop as never,
    messagesRepo: noop as never,
    ticketsRepo: noop as never,
    ticketAttachmentsRepo: noop as never,
    goalsRepo: noop as never,
    projectsRepo: noop as never,
    meetingsRepo: noop as never,
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
    copilotAnalyzerService: opts?.omitAnalyzer ? undefined : analyzer,
    copilotEventWindow: opts?.omitWindow ? undefined : window,
    bus: opts?.omitBus ? undefined : bus.bus,
    getHardwareProfile: () => ({ cpuCores: 4, ramGb: 16, gpuName: null, gpuVramGb: null }),
  });
  return { handlers, companiesRepo, analyzer, window, bus };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('companies.delete handler — Phase 5.6 M-C step e', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('happy path', () => {
    it('deletes the company and emits company.deleted with captured name + slug', async () => {
      const { handlers, companiesRepo, bus } = buildTestHandlers();
      const companyId = companiesRepo.create({ name: 'Doomed', slug: 'doomed' });
      await handlers.companiesDelete({ companyId });
      expect(companiesRepo.deleteCalls).toEqual([companyId]);
      expect(companiesRepo.getById(companyId)).toBeNull();
      expect(bus.emitted).toHaveLength(1);
      expect(bus.emitted[0]).toMatchObject({
        type: 'company.deleted',
        companyId,
        actorId: 'rocky',
        actorKind: 'user',
      });
      const payload = bus.emitted[0]?.payload as {
        companyId: string;
        slug: string;
        name: string;
        deletedAt: number;
      };
      expect(payload.companyId).toBe(companyId);
      expect(payload.slug).toBe('doomed');
      expect(payload.name).toBe('Doomed');
      expect(payload.deletedAt).toBeGreaterThan(0);
    });

    it('allows deleting an ARCHIVED company (delete is permanent remove)', async () => {
      const { handlers, companiesRepo, bus } = buildTestHandlers();
      const companyId = companiesRepo.create({ name: 'Shelved', slug: 'shelved' });
      companiesRepo.archive(companyId);
      await handlers.companiesDelete({ companyId });
      expect(companiesRepo.getById(companyId)).toBeNull();
      expect(bus.emitted).toHaveLength(1);
      expect(bus.emitted[0]?.type).toBe('company.deleted');
    });
  });

  describe('quiesce order', () => {
    it('calls analyzer.stop BEFORE eventWindow.clear BEFORE repo.delete', async () => {
      const order: string[] = [];
      const analyzer = {
        start: (_: string) => {},
        stop: (_: string) => {
          order.push('analyzer.stop');
        },
        restart: (_: string) => {},
        startCalls: [] as string[],
        stopCalls: [] as string[],
        restartCalls: [] as string[],
      };
      const window = {
        clear: (_: string) => {
          order.push('window.clear');
        },
        clearCalls: [] as string[],
      };
      const companiesRepo = new FakeCompaniesRepo();
      const origDelete = companiesRepo.delete.bind(companiesRepo);
      companiesRepo.delete = (id: string) => {
        order.push('repo.delete');
        origDelete(id);
      };
      const { handlers } = buildTestHandlers({ companiesRepo, analyzer, window });
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      await handlers.companiesDelete({ companyId });
      expect(order).toEqual(['analyzer.stop', 'window.clear', 'repo.delete']);
    });

    it('passes the companyId to analyzer.stop and window.clear', async () => {
      const { handlers, companiesRepo, analyzer, window } = buildTestHandlers();
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      await handlers.companiesDelete({ companyId });
      expect(analyzer.stopCalls).toEqual([companyId]);
      expect(window.clearCalls).toEqual([companyId]);
    });
  });

  describe('input validation', () => {
    it('throws when request body is null', async () => {
      const { handlers } = buildTestHandlers();
      await expect(
        handlers.companiesDelete(null as unknown as { companyId: string }),
      ).rejects.toThrow('request body is required');
    });

    it('throws when companyId is missing', async () => {
      const { handlers } = buildTestHandlers();
      await expect(
        handlers.companiesDelete({} as unknown as { companyId: string }),
      ).rejects.toThrow('companyId is required');
    });

    it('throws when companyId is empty', async () => {
      const { handlers } = buildTestHandlers();
      await expect(handlers.companiesDelete({ companyId: '' })).rejects.toThrow(
        'companyId is required',
      );
    });

    it('throws when company does not exist', async () => {
      const { handlers } = buildTestHandlers();
      await expect(handlers.companiesDelete({ companyId: 'ghost' })).rejects.toThrow(
        'company not found: ghost',
      );
    });

    it('does NOT call repo.delete or emit when validation fails', async () => {
      const { handlers, companiesRepo, bus } = buildTestHandlers();
      await handlers.companiesDelete({ companyId: '' }).catch(() => undefined);
      expect(companiesRepo.deleteCalls).toHaveLength(0);
      expect(bus.emitted).toHaveLength(0);
    });

    it('does NOT quiesce the copilot pipeline when validation fails', async () => {
      const { handlers, analyzer, window } = buildTestHandlers();
      await handlers.companiesDelete({ companyId: '' }).catch(() => undefined);
      expect(analyzer.stopCalls).toHaveLength(0);
      expect(window.clearCalls).toHaveLength(0);
    });
  });

  describe('dep tolerance', () => {
    it('succeeds when analyzer dep is unwired (warns in dev)', async () => {
      const { handlers, companiesRepo } = buildTestHandlers({ omitAnalyzer: true });
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      await expect(handlers.companiesDelete({ companyId })).resolves.toBeUndefined();
      expect(companiesRepo.getById(companyId)).toBeNull();
    });

    it('succeeds when eventWindow dep is unwired (warns in dev)', async () => {
      const { handlers, companiesRepo } = buildTestHandlers({ omitWindow: true });
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      await expect(handlers.companiesDelete({ companyId })).resolves.toBeUndefined();
      expect(companiesRepo.getById(companyId)).toBeNull();
    });

    it('succeeds when bus dep is unwired (warns in dev)', async () => {
      const { handlers, companiesRepo } = buildTestHandlers({ omitBus: true });
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      await expect(handlers.companiesDelete({ companyId })).resolves.toBeUndefined();
      expect(companiesRepo.getById(companyId)).toBeNull();
    });
  });

  describe('error propagation', () => {
    it('rethrows repo.delete errors verbatim (row still captured for diagnosis)', async () => {
      const { handlers, companiesRepo, bus } = buildTestHandlers();
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      companiesRepo.nextDeleteError = new Error('FOREIGN KEY constraint failed');
      await expect(handlers.companiesDelete({ companyId })).rejects.toThrow(
        'FOREIGN KEY constraint failed',
      );
      // No bus emit — the durable write failed.
      expect(bus.emitted).toHaveLength(0);
    });

    it('returns success when bus.emit throws (durable write already landed)', async () => {
      const bus = makeBusMock();
      bus.setNextEmitThrow(new Error('subscribers crashed'));
      const { handlers, companiesRepo } = buildTestHandlers({ bus });
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      await expect(handlers.companiesDelete({ companyId })).resolves.toBeUndefined();
      expect(companiesRepo.getById(companyId)).toBeNull();
    });
  });

  describe('invariant #11 — every mutation emits a bus event', () => {
    it('emits exactly one company.deleted per successful delete', async () => {
      const { handlers, companiesRepo, bus } = buildTestHandlers();
      const a = companiesRepo.create({ name: 'A', slug: 'a' });
      const b = companiesRepo.create({ name: 'B', slug: 'b' });
      await handlers.companiesDelete({ companyId: a });
      await handlers.companiesDelete({ companyId: b });
      expect(bus.emitted).toHaveLength(2);
      expect(bus.emitted[0]?.type).toBe('company.deleted');
      expect(bus.emitted[1]?.type).toBe('company.deleted');
      expect(bus.emitted[0]?.companyId).toBe(a);
      expect(bus.emitted[1]?.companyId).toBe(b);
    });
  });

  it('console spies were active for the full suite', () => {
    expect(consoleErrorSpy).toBeDefined();
    expect(consoleWarnSpy).toBeDefined();
  });
});
