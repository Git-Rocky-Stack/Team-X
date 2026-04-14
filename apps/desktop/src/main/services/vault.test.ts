/**
 * Vault service — event-bus emit behaviour (M30 T0).
 *
 * Covers the invariant: every successful `store` / `remove` MUST emit
 * the matching `vault.file_created` / `vault.file_deleted` event AFTER
 * the DB mutation, so the renderer's `useVaultEventSync` subscriber
 * can safely assume the referenced row exists (or is gone) at the
 * moment of fan-out. See `docs/plans/2026-04-13-vault-backup-regression-findings.md`
 * for the root-cause analysis this test set was introduced to prevent
 * from regressing.
 *
 * We deliberately use fake repo + fake bus — the real SQLite path is
 * already covered by `db/repos/vault.test.ts` and
 * `ipc/vault-handlers.test.ts`. These tests only assert emit order,
 * emit absence on failure, and payload shape.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { DashboardEvent } from '@team-x/shared-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CreateFileVaultInput,
  FileVaultRow,
  UpdateFileVaultInput,
} from '../db/repos/vault.js';
import type { EmitInput, EventBus, EventListener } from '../orchestrator/event-bus.js';

import { type VaultServiceDeps, createVaultService } from './vault.js';

// -------------------------------------------------------------------------
// Fakes
// -------------------------------------------------------------------------

interface FakeBus extends EventBus {
  emitted: DashboardEvent[];
}

function makeFakeBus(options: { throwOnEmit?: boolean } = {}): FakeBus {
  const emitted: DashboardEvent[] = [];
  const listeners: EventListener[] = [];
  return {
    emitted,
    emit<T = unknown>(input: EmitInput<T>): DashboardEvent<T> {
      if (options.throwOnEmit) throw new Error('bus unavailable');
      const event: DashboardEvent<T> = {
        id: `evt_${emitted.length + 1}`,
        type: input.type,
        companyId: input.companyId,
        actorId: input.actorId,
        actorKind: input.actorKind,
        payload: input.payload,
        createdAt: Date.now(),
      };
      emitted.push(event as DashboardEvent);
      for (const fn of listeners) fn(event as DashboardEvent);
      return event;
    },
    subscribe(listener: EventListener) {
      listeners.push(listener);
      return () => {
        const i = listeners.indexOf(listener);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    replaySince() {
      return [];
    },
  };
}

function makeFakeRepo(options: { throwOnCreate?: boolean; throwOnDelete?: boolean } = {}) {
  const rows = new Map<string, FileVaultRow>();
  let idCounter = 0;
  return {
    rows,
    create(input: CreateFileVaultInput): string {
      if (options.throwOnCreate) throw new Error('db insert failed');
      idCounter += 1;
      const id = `file_${idCounter}`;
      const now = Date.now();
      rows.set(id, {
        id,
        companyId: input.companyId,
        filename: input.filename,
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        vaultPath: input.vaultPath,
        extractedText: input.extractedText ?? null,
        tagsJson: input.tagsJson ?? '[]',
        uploadedBy: input.uploadedBy,
        createdAt: now,
        updatedAt: now,
      });
      return id;
    },
    getById(id: string): FileVaultRow | null {
      return rows.get(id) ?? null;
    },
    listByCompany(): FileVaultRow[] {
      return [];
    },
    update(_id: string, _input: UpdateFileVaultInput): void {},
    delete(id: string): void {
      if (options.throwOnDelete) throw new Error('db delete failed');
      rows.delete(id);
    },
    search() {
      return [];
    },
    count(): number {
      return rows.size;
    },
    totalSize(): number {
      return 0;
    },
  };
}

// -------------------------------------------------------------------------
// Test fixtures
// -------------------------------------------------------------------------

let tmpRoot: string;
let sourceFile: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'vault-svc-test-'));
  sourceFile = join(tmpRoot, 'source.md');
  await writeFile(sourceFile, '# hello\n\nworld', 'utf-8');
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

function makeService(overrides: Partial<VaultServiceDeps> = {}) {
  const bus = overrides.bus ?? makeFakeBus();
  const vaultRepo = overrides.vaultRepo ?? makeFakeRepo();
  const companiesBasePath = overrides.companiesBasePath ?? join(tmpRoot, 'companies');
  const getCompanySlug = overrides.getCompanySlug ?? (() => 'acme');
  return {
    bus: bus as FakeBus,
    vaultRepo,
    service: createVaultService({ bus, vaultRepo, companiesBasePath, getCompanySlug }),
  };
}

// -------------------------------------------------------------------------
// Specs
// -------------------------------------------------------------------------

describe('vault service — bus emit on store()', () => {
  it('emits `vault.file_created` exactly once after a successful upload', async () => {
    const { bus, service } = makeService();

    const id = await service.store('co_1', sourceFile, 'rocky', ['docs']);

    const created = bus.emitted.filter((e) => e.type === 'vault.file_created');
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      type: 'vault.file_created',
      companyId: 'co_1',
      actorId: 'rocky',
      actorKind: 'user',
    });
    expect((created[0].payload as { fileId: string }).fileId).toBe(id);
    expect((created[0].payload as { originalName: string }).originalName).toBe('source.md');
  });

  it('emits payload with sha256, mimeType, and sizeBytes populated', async () => {
    const { bus, service } = makeService();

    await service.store('co_1', sourceFile, 'rocky');

    const created = bus.emitted.find((e) => e.type === 'vault.file_created');
    const payload = created?.payload as {
      sha256: string;
      mimeType: string;
      sizeBytes: number;
    };
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.mimeType).toBe('text/markdown');
    expect(payload.sizeBytes).toBeGreaterThan(0);
  });

  it('does not emit if the DB insert throws', async () => {
    const repo = makeFakeRepo({ throwOnCreate: true });
    const { bus, service } = makeService({ vaultRepo: repo });

    await expect(service.store('co_1', sourceFile, 'rocky')).rejects.toThrow();

    expect(bus.emitted).toHaveLength(0);
  });

  it('does not throw if the bus emit itself throws (upload still succeeds)', async () => {
    const bus = makeFakeBus({ throwOnEmit: true });
    const { service } = makeService({ bus });
    // Silence the expected console.error noise.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(service.store('co_1', sourceFile, 'rocky')).resolves.toBeTruthy();

    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('is a no-op when the bus dep is omitted (optional wiring)', async () => {
    const vaultRepo = makeFakeRepo();
    const service = createVaultService({
      vaultRepo,
      companiesBasePath: join(tmpRoot, 'companies'),
      getCompanySlug: () => 'acme',
      // No bus.
    });

    await expect(service.store('co_1', sourceFile, 'rocky')).resolves.toBeTruthy();
    // Nothing to assert on — just verify it does not throw.
  });
});

describe('vault service — bus emit on remove()', () => {
  it('emits `vault.file_deleted` exactly once after a successful delete', async () => {
    const { bus, service } = makeService();
    const id = await service.store('co_1', sourceFile, 'rocky');
    // Reset bus to isolate the delete emission.
    bus.emitted.length = 0;

    await service.remove(id);

    const deleted = bus.emitted.filter((e) => e.type === 'vault.file_deleted');
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toMatchObject({
      type: 'vault.file_deleted',
      companyId: 'co_1',
      actorKind: 'user',
    });
    expect((deleted[0].payload as { fileId: string }).fileId).toBe(id);
  });

  it("uses the row's original uploadedBy as the actorId", async () => {
    const { bus, service } = makeService();
    const id = await service.store('co_1', sourceFile, 'alice');
    bus.emitted.length = 0;

    await service.remove(id);

    const deleted = bus.emitted.find((e) => e.type === 'vault.file_deleted');
    expect(deleted?.actorId).toBe('alice');
  });

  it('does not emit if the DB delete throws', async () => {
    const repo = makeFakeRepo({ throwOnDelete: true });
    const { bus, service } = makeService({ vaultRepo: repo });
    const id = await service.store('co_1', sourceFile, 'rocky');
    bus.emitted.length = 0;

    await expect(service.remove(id)).rejects.toThrow();

    expect(bus.emitted.filter((e) => e.type === 'vault.file_deleted')).toHaveLength(0);
  });
});
