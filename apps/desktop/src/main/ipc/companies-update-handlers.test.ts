import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompanyRow, UpdateCompanyInput } from '../db/repos/companies.js';

import type { IpcCompaniesRepo, IpcEventBus } from './handlers.js';
import { createIpcHandlers } from './handlers.js';

/**
 * Tests for the `companies.update` IPC handler — Phase 5.6 M-C step e
 * (restores Cluster A multi-company CRUD per audit row 10.13).
 *
 * Mirrors the focused per-namespace test convention established by
 * `companies-handlers.test.ts` (step b) + `employees-promote-handlers.test.ts`
 * (step d) — minimal hand-rolled mocks satisfying the narrow IPC dep
 * surfaces, no drizzle / sql.js / electron required.
 *
 * Coverage targets the contract enumerated on the
 * `IpcHandlers.companiesUpdate` interface comment:
 *
 *   - happy path: single-field patch; multi-field patch; empty patch is a
 *     no-op at the repo layer but still emits `company.updated` with an
 *     empty `patchedKeys` array.
 *   - input validation: missing/non-string/empty-trimmed name; over-long
 *     name; non-string/invalid slug regex; non-object settings (null,
 *     array, primitive); non-string icon (accepts null); non-string
 *     theme.
 *   - archived-company refusal: `assertCompanyActive` rejects archived
 *     rows BEFORE any repo write. Unknown company id also rejected.
 *   - duplicate slug: repo UNIQUE throw rethrown as a friendlier
 *     `slug "X" is already in use` message; non-UNIQUE errors pass
 *     through verbatim.
 *   - architectural invariant #11 — IPC channels that mutate state must
 *     emit a bus event so renderer caches invalidate. Asserted on every
 *     happy-path test; `patchedKeys` reflects exactly the keys supplied.
 *   - bus.emit throw is logged + swallowed (durable write already
 *     succeeded); bus dep unwired warns in dev.
 */

// ---------------------------------------------------------------------------
// Hand-rolled fakes
// ---------------------------------------------------------------------------

class FakeCompaniesRepo implements IpcCompaniesRepo {
  rows: CompanyRow[] = [];
  updateCalls: Array<{ id: string; patch: UpdateCompanyInput }> = [];
  nextUpdateError: Error | null = null;

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
  update(id: string, patch: UpdateCompanyInput): void {
    this.updateCalls.push({ id, patch });
    if (this.nextUpdateError) {
      const e = this.nextUpdateError;
      this.nextUpdateError = null;
      throw e;
    }
    const row = this.rows.find((r) => r.id === id);
    if (!row) return;
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.slug !== undefined) row.slug = patch.slug;
    if (patch.settings !== undefined) row.settingsJson = JSON.stringify(patch.settings);
    if (patch.icon !== undefined) row.icon = patch.icon;
    if (patch.theme !== undefined) row.theme = patch.theme;
  }
  delete(_id: string): void {
    throw new Error('unused by companies.update tests');
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

function buildTestHandlers(opts?: {
  companiesRepo?: FakeCompaniesRepo;
  bus?: ReturnType<typeof makeBusMock>;
  omitBus?: boolean;
}) {
  const noop = {} as Record<string, unknown>;
  const companiesRepo = opts?.companiesRepo ?? new FakeCompaniesRepo();
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
    bus: opts?.omitBus ? undefined : bus.bus,
    getHardwareProfile: () => ({ cpuCores: 4, ramGb: 16, gpuName: null, gpuVramGb: null }),
  });
  return { handlers, companiesRepo, bus };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('companies.update handler — Phase 5.6 M-C step e', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('happy path', () => {
    it('updates a single field (name only) and emits company.updated', async () => {
      const { handlers, companiesRepo, bus } = buildTestHandlers();
      const companyId = companiesRepo.create({ name: 'Old', slug: 'old' });
      await handlers.companiesUpdate({ companyId, name: 'New' });
      expect(companiesRepo.getById(companyId)?.name).toBe('New');
      expect(companiesRepo.updateCalls).toHaveLength(1);
      expect(companiesRepo.updateCalls[0]?.patch).toEqual({ name: 'New' });
      expect(bus.emitted).toHaveLength(1);
      expect(bus.emitted[0]).toMatchObject({
        type: 'company.updated',
        companyId,
        actorId: 'rocky',
        actorKind: 'user',
      });
      const payload = bus.emitted[0]?.payload as {
        companyId: string;
        patchedKeys: string[];
        updatedAt: number;
      };
      expect(payload.patchedKeys).toEqual(['name']);
      expect(payload.updatedAt).toBeGreaterThan(0);
    });

    it('updates multiple fields at once (patchedKeys reflects order)', async () => {
      const { handlers, companiesRepo, bus } = buildTestHandlers();
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      await handlers.companiesUpdate({
        companyId,
        name: 'Acme',
        slug: 'acme',
        settings: { mission: 'ship' },
        icon: '🏢',
        theme: 'light',
      });
      const payload = bus.emitted[0]?.payload as { patchedKeys: string[] };
      expect(payload.patchedKeys).toEqual(['name', 'slug', 'settings', 'icon', 'theme']);
      expect(companiesRepo.getById(companyId)?.name).toBe('Acme');
      expect(companiesRepo.getById(companyId)?.slug).toBe('acme');
    });

    it('trims name at the IPC boundary before writing', async () => {
      const { handlers, companiesRepo } = buildTestHandlers();
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      await handlers.companiesUpdate({ companyId, name: '  Spaced  ' });
      expect(companiesRepo.getById(companyId)?.name).toBe('Spaced');
    });

    it('accepts null to clear the icon', async () => {
      const { handlers, companiesRepo } = buildTestHandlers();
      const companyId = companiesRepo.create({ name: 'A', slug: 'a', icon: '🏢' });
      await handlers.companiesUpdate({ companyId, icon: null });
      expect(companiesRepo.getById(companyId)?.icon).toBeNull();
      expect(companiesRepo.updateCalls[0]?.patch.icon).toBeNull();
    });

    it('empty patch is allowed (still emits with empty patchedKeys)', async () => {
      const { handlers, companiesRepo, bus } = buildTestHandlers();
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      await handlers.companiesUpdate({ companyId });
      // Repo.update IS called but with empty patch — the repo layer
      // short-circuits without issuing SQL. The handler still emits.
      expect(companiesRepo.updateCalls).toHaveLength(1);
      expect(companiesRepo.updateCalls[0]?.patch).toEqual({});
      const payload = bus.emitted[0]?.payload as { patchedKeys: string[] };
      expect(payload.patchedKeys).toEqual([]);
    });
  });

  describe('input validation', () => {
    it('throws when request body is null', async () => {
      const { handlers } = buildTestHandlers();
      await expect(
        handlers.companiesUpdate(null as unknown as { companyId: string }),
      ).rejects.toThrow('request body is required');
    });

    it('throws when companyId is missing', async () => {
      const { handlers } = buildTestHandlers();
      await expect(
        handlers.companiesUpdate({} as unknown as { companyId: string }),
      ).rejects.toThrow('companyId is required');
    });

    it('throws when companyId is empty', async () => {
      const { handlers } = buildTestHandlers();
      await expect(handlers.companiesUpdate({ companyId: '' })).rejects.toThrow(
        'companyId is required',
      );
    });

    it('throws when name is a non-string', async () => {
      const { handlers, companiesRepo } = buildTestHandlers();
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      await expect(
        handlers.companiesUpdate({ companyId, name: 42 as unknown as string }),
      ).rejects.toThrow('name must be a string');
    });

    it('throws when name is empty after trim', async () => {
      const { handlers, companiesRepo } = buildTestHandlers();
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      await expect(handlers.companiesUpdate({ companyId, name: '   ' })).rejects.toThrow(
        'name must be non-empty after trim',
      );
    });

    it('throws when name exceeds 120 chars', async () => {
      const { handlers, companiesRepo } = buildTestHandlers();
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      await expect(handlers.companiesUpdate({ companyId, name: 'a'.repeat(121) })).rejects.toThrow(
        'name exceeds 120 chars',
      );
    });

    it('throws when slug contains uppercase', async () => {
      const { handlers, companiesRepo } = buildTestHandlers();
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      await expect(handlers.companiesUpdate({ companyId, slug: 'BadSlug' })).rejects.toThrow(
        'must match',
      );
    });

    it('throws when slug starts with a hyphen', async () => {
      const { handlers, companiesRepo } = buildTestHandlers();
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      await expect(handlers.companiesUpdate({ companyId, slug: '-bad' })).rejects.toThrow(
        'must match',
      );
    });

    it('throws when settings is null', async () => {
      const { handlers, companiesRepo } = buildTestHandlers();
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      await expect(
        handlers.companiesUpdate({
          companyId,
          settings: null as unknown as Record<string, unknown>,
        }),
      ).rejects.toThrow('settings must be a plain object');
    });

    it('throws when settings is an array', async () => {
      const { handlers, companiesRepo } = buildTestHandlers();
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      await expect(
        handlers.companiesUpdate({
          companyId,
          settings: ['nope'] as unknown as Record<string, unknown>,
        }),
      ).rejects.toThrow('settings must be a plain object');
    });

    it('throws when icon is not a string (but not null)', async () => {
      const { handlers, companiesRepo } = buildTestHandlers();
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      await expect(
        handlers.companiesUpdate({ companyId, icon: 42 as unknown as string }),
      ).rejects.toThrow('icon must be a string or null');
    });

    it('throws when theme is not a string', async () => {
      const { handlers, companiesRepo } = buildTestHandlers();
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      await expect(
        handlers.companiesUpdate({ companyId, theme: { dark: true } as unknown as string }),
      ).rejects.toThrow('theme must be a string');
    });

    it('does NOT call repo.update when validation fails', async () => {
      const { handlers, companiesRepo } = buildTestHandlers();
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      await handlers.companiesUpdate({ companyId, name: '' }).catch(() => undefined);
      expect(companiesRepo.updateCalls).toHaveLength(0);
    });

    it('does NOT emit when validation fails', async () => {
      const { handlers, companiesRepo, bus } = buildTestHandlers();
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      await handlers.companiesUpdate({ companyId, slug: 'BadSlug' }).catch(() => undefined);
      expect(bus.emitted).toHaveLength(0);
    });
  });

  describe('assertCompanyActive guard', () => {
    it('throws when company does not exist', async () => {
      const { handlers } = buildTestHandlers();
      await expect(handlers.companiesUpdate({ companyId: 'ghost', name: 'X' })).rejects.toThrow(
        'company not found: ghost',
      );
    });

    it('throws when company is archived', async () => {
      const { handlers, companiesRepo } = buildTestHandlers();
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      companiesRepo.archive(companyId);
      await expect(handlers.companiesUpdate({ companyId, name: 'Renamed' })).rejects.toThrow(
        'is archived; reactivate before mutating',
      );
    });

    it('does NOT call repo.update when company is archived', async () => {
      const { handlers, companiesRepo } = buildTestHandlers();
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      companiesRepo.archive(companyId);
      await handlers.companiesUpdate({ companyId, name: 'X' }).catch(() => undefined);
      expect(companiesRepo.updateCalls).toHaveLength(0);
    });
  });

  describe('duplicate slug rewrap', () => {
    it('rethrows SQL UNIQUE failure as a friendlier message', async () => {
      const { handlers, companiesRepo } = buildTestHandlers();
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      companiesRepo.nextUpdateError = new Error(
        'UNIQUE constraint failed: companies.slug (slug=taken)',
      );
      await expect(handlers.companiesUpdate({ companyId, slug: 'taken' })).rejects.toThrow(
        'slug "taken" is already in use',
      );
    });

    it('rethrows non-UNIQUE repo errors verbatim', async () => {
      const { handlers, companiesRepo } = buildTestHandlers();
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      companiesRepo.nextUpdateError = new Error('disk full');
      await expect(handlers.companiesUpdate({ companyId, name: 'X' })).rejects.toThrow('disk full');
    });
  });

  describe('bus tolerance', () => {
    it('returns success when bus.emit throws (durable write already landed)', async () => {
      const bus = makeBusMock();
      bus.setNextEmitThrow(new Error('subscribers crashed'));
      const { handlers, companiesRepo } = buildTestHandlers({ bus });
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      await expect(handlers.companiesUpdate({ companyId, name: 'X' })).resolves.toBeUndefined();
      expect(companiesRepo.getById(companyId)?.name).toBe('X');
    });

    it('succeeds without bus dep (warns in dev)', async () => {
      const { handlers, companiesRepo } = buildTestHandlers({ omitBus: true });
      const companyId = companiesRepo.create({ name: 'A', slug: 'a' });
      await handlers.companiesUpdate({ companyId, name: 'X' });
      expect(companiesRepo.getById(companyId)?.name).toBe('X');
    });
  });

  it('console spies were active for the full suite', () => {
    expect(consoleErrorSpy).toBeDefined();
    expect(consoleWarnSpy).toBeDefined();
  });
});
