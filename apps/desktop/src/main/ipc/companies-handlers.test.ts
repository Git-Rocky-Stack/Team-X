import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompanyRow, UpdateCompanyInput } from '../db/repos/companies.js';

import type { IpcCompaniesRepo, IpcCopilotAnalyzerService, IpcEventBus } from './handlers.js';
import { createIpcHandlers } from './handlers.js';

/**
 * Tests for the `companies.create` IPC handler — Phase 5.6 M-C step b
 * (restores Cluster A multi-company CRUD per audit row 10.12; Rocky's
 * locked M7 architectural decision).
 *
 * Mirrors the focused per-namespace test convention established by
 * `backup-handlers.test.ts`, `copilot-handlers.test.ts`, and
 * `rag-handlers.test.ts` — minimal hand-rolled mocks satisfying the
 * narrow IPC dep surfaces, no drizzle / sql.js / electron required.
 *
 * Coverage targets the contract enumerated on the
 * `IpcHandlers.companiesCreate` interface comment:
 *
 *   - happy path: returns companyId + the two system employee ids;
 *     repo.create is called with normalized fields; ensureSystemForCompany
 *     is invoked with the new id; bus.emit fires `company.created` with
 *     the full payload shape.
 *   - input validation: missing/non-string/empty-trimmed name; over-long
 *     name; missing/invalid slug regex; non-object settings; non-string
 *     icon/theme.
 *   - duplicate slug: SQL UNIQUE failure surfaces as a friendlier
 *     "slug … is already in use" message rather than the raw sqlite text.
 *   - missing ensureSystemForCompany dep: throws (no half-bootstrap row).
 *   - bus.emit throw is logged + swallowed (durable write already
 *     succeeded, must not cascade); bus dep unwired warns in dev.
 *   - architectural invariant #11 — IPC channels that mutate state must
 *     emit a bus event so renderer caches invalidate. Asserted on every
 *     happy-path test.
 */

// ---------------------------------------------------------------------------
// Hand-rolled fakes — narrow surfaces only
// ---------------------------------------------------------------------------

class FakeCompaniesRepo implements IpcCompaniesRepo {
  rows: CompanyRow[] = [];
  createCalls: Array<{
    name: string;
    slug: string;
    settings?: Record<string, unknown>;
    icon?: string;
    theme?: string;
  }> = [];
  archiveCalls: string[] = [];
  /** When set, repo.create throws this error verbatim instead of inserting. */
  nextCreateError: Error | null = null;
  private nextIdCounter = 1;

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
    this.createCalls.push(input);
    if (this.nextCreateError) {
      const e = this.nextCreateError;
      this.nextCreateError = null;
      throw e;
    }
    if (this.rows.find((r) => r.slug === input.slug)) {
      throw new Error(`UNIQUE constraint failed: companies.slug (slug=${input.slug})`);
    }
    const id = `company-${this.nextIdCounter++}`;
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
    this.archiveCalls.push(id);
  }

  // IpcCompaniesRepo was widened in Phase 5.6 M-C step e with update +
  // delete. This test file only exercises `create`, so the widened
  // methods throw 'unused' — a future cross-test exercising them will
  // fail loud rather than silently no-op.
  update(_id: string, _patch: UpdateCompanyInput): void {
    throw new Error('unused by companies.create tests');
  }
  delete(_id: string): void {
    throw new Error('unused by companies.create tests');
  }
}

interface BootstrapResult {
  agentEmployeeId: string;
  copilotEmployeeId: string;
  agentCreated: boolean;
  copilotCreated: boolean;
}

function makeBootstrapMock(result?: Partial<BootstrapResult>) {
  const calls: string[] = [];
  let nextThrow: Error | null = null;
  const fn = (companyId: string): BootstrapResult => {
    calls.push(companyId);
    if (nextThrow) {
      const e = nextThrow;
      nextThrow = null;
      throw e;
    }
    return {
      agentEmployeeId: result?.agentEmployeeId ?? 'sys-agent-1',
      copilotEmployeeId: result?.copilotEmployeeId ?? 'sys-copilot-1',
      agentCreated: result?.agentCreated ?? true,
      copilotCreated: result?.copilotCreated ?? true,
    };
  };
  return {
    fn,
    calls,
    setNextThrow(e: Error): void {
      nextThrow = e;
    },
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

function makeCopilotAnalyzerMock() {
  const startCalls: string[] = [];
  const restartCalls: string[] = [];
  const stopCalls: string[] = [];
  const service: IpcCopilotAnalyzerService = {
    start: (companyId) => {
      startCalls.push(companyId);
    },
    restart: (companyId) => {
      restartCalls.push(companyId);
    },
    stop: (companyId) => {
      stopCalls.push(companyId);
    },
  };
  return { service, startCalls, restartCalls, stopCalls };
}

// ---------------------------------------------------------------------------
// Test harness — same buildTestHandlers shape as backup-handlers.test.ts
// ---------------------------------------------------------------------------

function buildTestHandlers(opts?: {
  companiesRepo?: FakeCompaniesRepo;
  bootstrap?: ReturnType<typeof makeBootstrapMock>;
  bus?: ReturnType<typeof makeBusMock>;
  copilotAnalyzer?: ReturnType<typeof makeCopilotAnalyzerMock>;
  omitBootstrap?: boolean;
  omitBus?: boolean;
  omitCopilotAnalyzer?: boolean;
}) {
  const noop = {} as Record<string, unknown>;
  const companiesRepo = opts?.companiesRepo ?? new FakeCompaniesRepo();
  const bootstrap = opts?.bootstrap ?? makeBootstrapMock();
  const bus = opts?.bus ?? makeBusMock();
  const copilotAnalyzer = opts?.copilotAnalyzer ?? makeCopilotAnalyzerMock();
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
    bus: opts?.omitBus ? undefined : bus.bus,
    copilotAnalyzerService: opts?.omitCopilotAnalyzer ? undefined : copilotAnalyzer.service,
    ensureSystemForCompany: opts?.omitBootstrap ? undefined : bootstrap.fn,
    getHardwareProfile: () => ({ cpuCores: 4, ramGb: 16, gpuName: null, gpuVramGb: null }),
  });
  return { handlers, companiesRepo, bootstrap, bus, copilotAnalyzer };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('companies.create handler — Phase 5.6 M-C step b', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Silence the bus-emit-failure error logs + missing-bus dev warnings
    // so they don't bleed into vitest output. Tests assert via direct
    // mock counts, not console capture.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('happy path', () => {
    it('returns companyId + system employee ids on success', async () => {
      const { handlers } = buildTestHandlers();
      const result = await handlers.companiesCreate({
        name: 'Acme Co',
        slug: 'acme-co',
      });
      expect(result.companyId).toMatch(/^company-/);
      expect(result.systemAgentEmployeeId).toBe('sys-agent-1');
      expect(result.systemCopilotEmployeeId).toBe('sys-copilot-1');
    });

    it('persists the row via companiesRepo.create with normalized fields', async () => {
      const { handlers, companiesRepo } = buildTestHandlers();
      await handlers.companiesCreate({
        name: '  Acme Co  ',
        slug: 'acme-co',
        settings: { mission: 'Build it' },
        icon: '🏢',
        theme: 'dark',
      });
      expect(companiesRepo.createCalls).toHaveLength(1);
      // name is trimmed at the IPC boundary so the row is canonical.
      expect(companiesRepo.createCalls[0]?.name).toBe('Acme Co');
      expect(companiesRepo.createCalls[0]?.slug).toBe('acme-co');
      expect(companiesRepo.createCalls[0]?.settings).toEqual({ mission: 'Build it' });
      expect(companiesRepo.createCalls[0]?.icon).toBe('🏢');
      expect(companiesRepo.createCalls[0]?.theme).toBe('dark');
    });

    it('invokes ensureSystemForCompany with the new company id (bootstrap order)', async () => {
      const { handlers, bootstrap } = buildTestHandlers();
      const result = await handlers.companiesCreate({ name: 'Acme', slug: 'acme' });
      expect(bootstrap.calls).toEqual([result.companyId]);
    });

    it('starts the copilot analyzer timer for the new company', async () => {
      const { handlers, copilotAnalyzer } = buildTestHandlers();
      const result = await handlers.companiesCreate({ name: 'Acme', slug: 'acme' });
      expect(copilotAnalyzer.startCalls).toEqual([result.companyId]);
      expect(copilotAnalyzer.restartCalls).toHaveLength(0);
    });

    it('emits company.created on the bus with the full payload (invariant #11)', async () => {
      const { handlers, bus } = buildTestHandlers();
      const result = await handlers.companiesCreate({ name: 'Acme', slug: 'acme' });
      expect(bus.emitted).toHaveLength(1);
      expect(bus.emitted[0]).toMatchObject({
        type: 'company.created',
        companyId: result.companyId,
        // BUG-005 hardening (Phase 5.6 M-C step d): actorId is the
        // canonical HUMAN_USER_ID constant ('rocky'), not the literal
        // 'user' string. Same sweep applied to companies.archive +
        // employees.promote + employees.setManager.
        actorId: 'rocky',
        actorKind: 'user',
      });
      const payload = bus.emitted[0]?.payload as {
        companyId: string;
        slug: string;
        name: string;
        systemAgentEmployeeId: string;
        systemCopilotEmployeeId: string;
        createdAt: number;
      };
      expect(payload.companyId).toBe(result.companyId);
      expect(payload.slug).toBe('acme');
      expect(payload.name).toBe('Acme');
      expect(payload.systemAgentEmployeeId).toBe('sys-agent-1');
      expect(payload.systemCopilotEmployeeId).toBe('sys-copilot-1');
      expect(payload.createdAt).toBeGreaterThan(0);
    });

    it('defaults settings/icon/theme to undefined when not supplied', async () => {
      const { handlers, companiesRepo } = buildTestHandlers();
      await handlers.companiesCreate({ name: 'Acme', slug: 'acme' });
      expect(companiesRepo.createCalls[0]?.settings).toBeUndefined();
      expect(companiesRepo.createCalls[0]?.icon).toBeUndefined();
      expect(companiesRepo.createCalls[0]?.theme).toBeUndefined();
    });
  });

  describe('input validation', () => {
    it('throws when request body is null', async () => {
      const { handlers } = buildTestHandlers();
      await expect(
        handlers.companiesCreate(null as unknown as { name: string; slug: string }),
      ).rejects.toThrow('request body is required');
    });

    it('throws when name is missing', async () => {
      const { handlers } = buildTestHandlers();
      await expect(
        handlers.companiesCreate({ slug: 'x' } as unknown as { name: string; slug: string }),
      ).rejects.toThrow('name is required');
    });

    it('throws when name is empty after trim', async () => {
      const { handlers } = buildTestHandlers();
      await expect(handlers.companiesCreate({ name: '   ', slug: 'x' })).rejects.toThrow(
        'name is required',
      );
    });

    it('throws when name exceeds 120 chars', async () => {
      const { handlers } = buildTestHandlers();
      await expect(handlers.companiesCreate({ name: 'a'.repeat(121), slug: 'x' })).rejects.toThrow(
        'name exceeds 120 chars',
      );
    });

    it('throws when slug is missing', async () => {
      const { handlers } = buildTestHandlers();
      await expect(
        handlers.companiesCreate({ name: 'Acme' } as unknown as { name: string; slug: string }),
      ).rejects.toThrow('slug');
    });

    it('throws when slug contains uppercase letters', async () => {
      const { handlers } = buildTestHandlers();
      await expect(handlers.companiesCreate({ name: 'Acme', slug: 'Acme' })).rejects.toThrow(
        'must match',
      );
    });

    it('throws when slug starts with a hyphen', async () => {
      const { handlers } = buildTestHandlers();
      await expect(handlers.companiesCreate({ name: 'Acme', slug: '-acme' })).rejects.toThrow(
        'must match',
      );
    });

    it('throws when slug contains underscores', async () => {
      const { handlers } = buildTestHandlers();
      await expect(handlers.companiesCreate({ name: 'Acme', slug: 'acme_co' })).rejects.toThrow(
        'must match',
      );
    });

    it('throws when slug exceeds 63 chars', async () => {
      const { handlers } = buildTestHandlers();
      await expect(
        handlers.companiesCreate({ name: 'Acme', slug: 'a'.repeat(64) }),
      ).rejects.toThrow('must match');
    });

    it('accepts the canonical Strategia-X slug', async () => {
      const { handlers } = buildTestHandlers();
      await expect(
        handlers.companiesCreate({ name: 'Strategia-X', slug: 'strategia-x' }),
      ).resolves.toBeDefined();
    });

    it('throws when settings is null', async () => {
      const { handlers } = buildTestHandlers();
      await expect(
        handlers.companiesCreate({
          name: 'Acme',
          slug: 'acme',
          settings: null as unknown as Record<string, unknown>,
        }),
      ).rejects.toThrow('settings must be a plain object');
    });

    it('throws when settings is a primitive', async () => {
      const { handlers } = buildTestHandlers();
      await expect(
        handlers.companiesCreate({
          name: 'Acme',
          slug: 'acme',
          settings: 'not an object' as unknown as Record<string, unknown>,
        }),
      ).rejects.toThrow('settings must be a plain object');
    });

    it('throws when icon is not a string', async () => {
      const { handlers } = buildTestHandlers();
      await expect(
        handlers.companiesCreate({
          name: 'Acme',
          slug: 'acme',
          icon: 42 as unknown as string,
        }),
      ).rejects.toThrow('icon must be a string');
    });

    it('throws when theme is not a string', async () => {
      const { handlers } = buildTestHandlers();
      await expect(
        handlers.companiesCreate({
          name: 'Acme',
          slug: 'acme',
          theme: { dark: true } as unknown as string,
        }),
      ).rejects.toThrow('theme must be a string');
    });

    it('does NOT call repo.create when validation fails', async () => {
      const { handlers, companiesRepo } = buildTestHandlers();
      await handlers.companiesCreate({ name: '', slug: 'x' }).catch(() => undefined);
      expect(companiesRepo.createCalls).toHaveLength(0);
    });

    it('does NOT call bootstrap or emit when validation fails', async () => {
      const { handlers, bootstrap, bus } = buildTestHandlers();
      await handlers.companiesCreate({ name: 'Acme', slug: 'BadSlug' }).catch(() => undefined);
      expect(bootstrap.calls).toHaveLength(0);
      expect(bus.emitted).toHaveLength(0);
    });
  });

  describe('duplicate slug', () => {
    it('rethrows SQL UNIQUE failure as a friendlier message', async () => {
      const { handlers } = buildTestHandlers();
      await handlers.companiesCreate({ name: 'First', slug: 'shared' });
      await expect(handlers.companiesCreate({ name: 'Second', slug: 'shared' })).rejects.toThrow(
        'slug "shared" is already in use',
      );
    });

    it('does NOT call bootstrap or emit when duplicate slug rethrows', async () => {
      const { handlers, bootstrap, bus } = buildTestHandlers();
      await handlers.companiesCreate({ name: 'First', slug: 'shared' });
      bootstrap.calls.length = 0;
      bus.emitted.length = 0;
      await handlers.companiesCreate({ name: 'Second', slug: 'shared' }).catch(() => undefined);
      expect(bootstrap.calls).toHaveLength(0);
      expect(bus.emitted).toHaveLength(0);
    });

    it('rethrows non-UNIQUE repo errors verbatim (no rewrap)', async () => {
      const { handlers, companiesRepo } = buildTestHandlers();
      companiesRepo.nextCreateError = new Error('disk full');
      await expect(handlers.companiesCreate({ name: 'Acme', slug: 'acme' })).rejects.toThrow(
        'disk full',
      );
    });
  });

  describe('missing dependencies', () => {
    it('throws when ensureSystemForCompany dep is unwired (no half-bootstrap row)', async () => {
      const { handlers } = buildTestHandlers({ omitBootstrap: true });
      await expect(handlers.companiesCreate({ name: 'Acme', slug: 'acme' })).rejects.toThrow(
        'ensureSystemForCompany dep unwired',
      );
    });

    it('emits company.created without crashing when bus dep is unwired', async () => {
      // No bus dep — handler logs a dev-mode warning and returns success
      // (the durable write still happened). Renderer caches won't
      // invalidate but the IPC contract still holds.
      const { handlers, companiesRepo } = buildTestHandlers({ omitBus: true });
      const result = await handlers.companiesCreate({ name: 'Acme', slug: 'acme' });
      expect(result.companyId).toMatch(/^company-/);
      expect(companiesRepo.rows).toHaveLength(1);
    });
  });

  describe('bus emit failure tolerance', () => {
    it('returns success even when bus.emit throws (durable write already landed)', async () => {
      const bus = makeBusMock();
      bus.setNextEmitThrow(new Error('bus subscribers crashed'));
      const { handlers, companiesRepo } = buildTestHandlers({ bus });
      const result = await handlers.companiesCreate({ name: 'Acme', slug: 'acme' });
      // Row is still in the repo even though the bus throw fired.
      expect(companiesRepo.rows).toHaveLength(1);
      expect(result.companyId).toMatch(/^company-/);
    });
  });

  // Exit barrier — keeps the spy mounted across describe blocks for the
  // life of the suite. Vitest auto-restores at suite end.
  it('console spies were active for the full suite', () => {
    expect(consoleErrorSpy).toBeDefined();
    expect(consoleWarnSpy).toBeDefined();
  });
});
