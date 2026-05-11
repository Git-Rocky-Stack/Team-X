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

import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import type { DashboardEvent } from '@team-x/shared-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CreateFileVaultInput,
  FileVaultRow,
  UpdateFileVaultInput,
} from '../db/repos/vault.js';
import type { EmitInput, EventBus, EventListener } from '../orchestrator/event-bus.js';

import {
  VaultPathTraversalError,
  type VaultServiceDeps,
  assertInsideVault,
  assertInsideVaultReal,
  createVaultService,
} from './vault.js';

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

  it('preserves employee actor kind for agent-created uploads', async () => {
    const { bus, service } = makeService();

    await service.store('co_1', sourceFile, 'employee-iris', ['agent-created'], 'employee');

    const created = bus.emitted.find((e) => e.type === 'vault.file_created');
    expect(created).toMatchObject({
      actorId: 'employee-iris',
      actorKind: 'employee',
    });
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

// ---------------------------------------------------------------------
// H16 audit (2026-05-07): vault path-traversal defense.
//
// `sanitizeFilename` only defangs separator chars inside a single
// filename. It is NOT a containment guard. The audit named three
// classes of escape it cannot stop:
//   (1) symlink injection at <vaultDir>/<sha-prefix>
//   (2) untrusted getCompanySlug output composing `..` into the path
//   (3) URI-encoded traversal in originalName that a prior layer decodes
//
// `assertInsideVault` (lexical) closes (2) and (3); `assertInsideVaultReal`
// (symlink-aware via fs.realpath) closes (1) and TOCTOU between mkdir
// and copyFile.
// ---------------------------------------------------------------------
describe('H16 audit (2026-05-07): vault path-traversal defense', () => {
  // -- Pure helper coverage ---------------------------------------------
  describe('assertInsideVault (lexical)', () => {
    it('returns the resolved path when candidate is a strict descendant of vaultDir', () => {
      const resolved = assertInsideVault('/var/lib/vault', '/var/lib/vault/ab/file.txt');
      // The lexical check resolves both sides; on POSIX the input was
      // already absolute, so resolution is a no-op. On Windows, paths
      // get a drive prefix — assert containment instead of exact match.
      expect(resolved).toMatch(/vault[\\/]ab[\\/]file\.txt$/);
    });

    it('accepts vaultDir itself as inside (boundary case)', () => {
      const resolved = assertInsideVault('/var/lib/vault', '/var/lib/vault');
      expect(resolved).toMatch(/vault$/);
    });

    it('rejects a sibling whose path is a prefix of vaultDir (no trailing-sep confusion)', () => {
      // /var/lib/vault-shadow starts with /var/lib/vault — without the
      // mandatory trailing sep in the comparison, a naive startsWith
      // would let this slip through. This is the most common
      // path-containment bug in the wild.
      expect(() => assertInsideVault('/var/lib/vault', '/var/lib/vault-shadow/secret.txt')).toThrow(
        VaultPathTraversalError,
      );
    });

    it('rejects an escape via `..` segments (audit class 2)', () => {
      expect(() => assertInsideVault('/var/lib/vault', '/var/lib/vault/../etc/passwd')).toThrow(
        VaultPathTraversalError,
      );
    });

    it('rejects an absolute path that is not under vaultDir', () => {
      expect(() => assertInsideVault('/var/lib/vault', '/etc/passwd')).toThrow(
        VaultPathTraversalError,
      );
    });

    it('error message is generic — does not leak the attempted path', () => {
      try {
        assertInsideVault('/var/lib/vault', '/etc/passwd');
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(VaultPathTraversalError);
        expect((err as Error).message).not.toContain('/etc/passwd');
        expect((err as Error).message).not.toContain('passwd');
      }
    });

    it('exposes a stable error code for callers that branch on traversal', () => {
      try {
        assertInsideVault('/var/lib/vault', '/etc/passwd');
        throw new Error('expected throw');
      } catch (err) {
        expect((err as VaultPathTraversalError).code).toBe('VAULT_PATH_TRAVERSAL');
      }
    });
  });

  describe('assertInsideVaultReal (symlink-aware)', () => {
    let realRoot: string;

    beforeEach(async () => {
      realRoot = await mkdtemp(join(tmpdir(), 'vault-real-test-'));
    });

    afterEach(async () => {
      await rm(realRoot, { recursive: true, force: true });
    });

    it('returns the realpath of a legit nested file under the vault', async () => {
      const vaultDir = join(realRoot, 'vault');
      const target = join(vaultDir, 'ab', 'file.txt');
      await mkdir(join(vaultDir, 'ab'), { recursive: true });
      await writeFile(target, 'ok', 'utf-8');

      const resolved = await assertInsideVaultReal(vaultDir, target);
      expect(resolved).toMatch(/ab[\\/]file\.txt$/);
    });

    it('rejects a leaf that is a symlink to outside the vault (audit class 1)', async () => {
      const vaultDir = join(realRoot, 'vault');
      const outside = join(realRoot, 'outside.txt');
      await mkdir(vaultDir, { recursive: true });
      await writeFile(outside, 'secret', 'utf-8');

      const symlinkInVault = join(vaultDir, 'evil.txt');
      try {
        await symlink(outside, symlinkInVault);
      } catch (err) {
        // Symlink creation requires elevated permissions on Windows
        // unless Developer Mode is enabled. Skip rather than fail.
        if ((err as NodeJS.ErrnoException).code === 'EPERM') return;
        throw err;
      }

      await expect(assertInsideVaultReal(vaultDir, symlinkInVault)).rejects.toThrow(
        VaultPathTraversalError,
      );
    });

    it('rejects a leaf inside a symlinked directory (the canonical mkdir-followed-symlink case)', async () => {
      const vaultDir = join(realRoot, 'vault');
      const outsideDir = join(realRoot, 'outside-dir');
      await mkdir(outsideDir, { recursive: true });
      await mkdir(vaultDir, { recursive: true });

      // Plant a symlink at <vaultDir>/ab pointing to outsideDir.
      const symlinkDir = join(vaultDir, 'ab');
      try {
        await symlink(outsideDir, symlinkDir, 'dir');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EPERM') return;
        throw err;
      }

      // The leaf path lexically looks fine — it's under vaultDir — but
      // its realpath resolves outside.
      const leaf = join(vaultDir, 'ab', 'planted.txt');
      await writeFile(leaf, 'planted', 'utf-8');

      await expect(assertInsideVaultReal(vaultDir, leaf)).rejects.toThrow(VaultPathTraversalError);
    });

    it('falls back to lexical when candidate path does not yet exist (pre-mkdir)', async () => {
      // First-ever write: target dir is not on disk yet. The function
      // must NOT throw — symlink injection is structurally impossible
      // at a path that doesn't exist. The lexical guard is sufficient.
      const vaultDir = join(realRoot, 'vault');
      await mkdir(vaultDir, { recursive: true });
      const candidate = join(vaultDir, 'ab', 'file.txt');

      const resolved = await assertInsideVaultReal(vaultDir, candidate);
      expect(resolved).toMatch(/ab[\\/]file\.txt$/);
    });

    it('falls back to lexical when vaultDir does not yet exist (first write to new company)', async () => {
      const vaultDir = join(realRoot, 'never-mkdir-vault');
      const candidate = join(vaultDir, 'ab', 'file.txt');

      const resolved = await assertInsideVaultReal(vaultDir, candidate);
      expect(resolved).toMatch(/ab[\\/]file\.txt$/);
    });

    it('still rejects lexically-escaping candidates even when paths do not exist', async () => {
      const vaultDir = join(realRoot, 'vault');
      // Neither side exists on disk; the lexical layer must still fire.
      const escape = join(realRoot, 'outside', 'evil.txt');

      await expect(assertInsideVaultReal(vaultDir, escape)).rejects.toThrow(
        VaultPathTraversalError,
      );
    });
  });

  // -- Service-level integration ----------------------------------------
  describe('vault service — refuses to write/read outside the vault', () => {
    let realRoot: string;
    let sourceFile: string;

    beforeEach(async () => {
      realRoot = await mkdtemp(join(tmpdir(), 'vault-svc-h16-'));
      sourceFile = join(realRoot, 'src.md');
      await writeFile(sourceFile, '# hello', 'utf-8');
    });

    afterEach(async () => {
      await rm(realRoot, { recursive: true, force: true });
    });

    it('rejects store() when getCompanySlug returns a `..` escape (audit class 2)', async () => {
      const vaultRepo = makeFakeRepo();
      const service = createVaultService({
        vaultRepo,
        companiesBasePath: join(realRoot, 'companies'),
        // Malicious slug — composes a path that escapes companiesBasePath.
        getCompanySlug: () => '../../outside-co',
      });

      await expect(service.store('co_1', sourceFile, 'rocky')).rejects.toThrow(
        VaultPathTraversalError,
      );
      // No row should have been created — refusal happens BEFORE the DB
      // insert.
      expect(vaultRepo.rows.size).toBe(0);
    });

    it('rejects store() when <vaultDir>/<sha-prefix> is a symlink to outside (audit class 1)', async () => {
      // Pre-stage the vault directory and plant a symlink at the
      // sha-prefix that store() will compute. We sneak-peek the sha of
      // the source file to know which prefix to attack.
      const vaultRepo = makeFakeRepo();
      const companiesBasePath = join(realRoot, 'companies');
      const slug = 'acme';
      const vaultDir = join(companiesBasePath, slug, 'vault');
      await mkdir(vaultDir, { recursive: true });

      // Compute the sha of the source file the same way `store` will.
      // The source is "# hello"; we need the first two hex chars to
      // know which subdir to plant the symlink at.
      const { createHash } = await import('node:crypto');
      const { readFile } = await import('node:fs/promises');
      const sha = createHash('sha256')
        .update(await readFile(sourceFile))
        .digest('hex');
      const shaPrefix = sha.slice(0, 2);

      const outsideDir = join(realRoot, 'escape-target');
      await mkdir(outsideDir, { recursive: true });

      try {
        await symlink(outsideDir, join(vaultDir, shaPrefix), 'dir');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EPERM') return;
        throw err;
      }

      const service = createVaultService({
        vaultRepo,
        companiesBasePath,
        getCompanySlug: () => slug,
      });

      await expect(service.store('co_1', sourceFile, 'rocky')).rejects.toThrow(
        VaultPathTraversalError,
      );

      // Critically: the file MUST NOT have been written into the
      // symlink's target (escape-target) — that's the whole point of
      // the post-mkdir realpath check.
      const escaped = await stat(outsideDir).catch(() => null);
      if (escaped) {
        const { readdir } = await import('node:fs/promises');
        const entries = await readdir(outsideDir);
        expect(entries).toEqual([]);
      }
      expect(vaultRepo.rows.size).toBe(0);
    });

    it('refuses retrieve() when row.vaultPath escapes the vault (DB corruption / restored-backup attack)', async () => {
      const vaultRepo = makeFakeRepo();
      const companiesBasePath = join(realRoot, 'companies');
      const slug = 'acme';

      // Inject a malicious row directly so we can test retrieve's guard
      // without going through store.
      vaultRepo.rows.set('file_evil', {
        id: 'file_evil',
        companyId: 'co_1',
        filename: 'fake.txt',
        originalName: 'fake.txt',
        mimeType: 'text/plain',
        sizeBytes: 0,
        sha256: 'x'.repeat(64),
        vaultPath: '../../../etc/passwd', // <- escape via stored relative path
        extractedText: null,
        tagsJson: '[]',
        uploadedBy: 'attacker',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const service = createVaultService({
        vaultRepo,
        companiesBasePath,
        getCompanySlug: () => slug,
      });

      await expect(service.retrieve('file_evil')).rejects.toThrow(VaultPathTraversalError);
    });

    it('refuses remove() when row.vaultPath escapes the vault (no unlink outside vault)', async () => {
      const vaultRepo = makeFakeRepo();
      const companiesBasePath = join(realRoot, 'companies');
      const outsideFile = join(realRoot, 'do-not-delete.txt');
      await writeFile(outsideFile, 'precious', 'utf-8');

      vaultRepo.rows.set('file_evil', {
        id: 'file_evil',
        companyId: 'co_1',
        filename: 'evil.txt',
        originalName: 'evil.txt',
        mimeType: 'text/plain',
        sizeBytes: 8,
        sha256: 'x'.repeat(64),
        vaultPath: join('..', '..', '..', '..', 'do-not-delete.txt'),
        extractedText: null,
        tagsJson: '[]',
        uploadedBy: 'attacker',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const service = createVaultService({
        vaultRepo,
        companiesBasePath,
        getCompanySlug: () => 'acme',
      });

      await expect(service.remove('file_evil')).rejects.toThrow(VaultPathTraversalError);
      // The outside file must still exist — the guard refused before unlink.
      const after = await stat(outsideFile);
      expect(after.size).toBe(8);
      // And the DB row must NOT have been deleted, because the guard
      // throws BEFORE vaultRepo.delete() runs.
      expect(vaultRepo.rows.has('file_evil')).toBe(true);
    });

    it('refuses verify() when row.vaultPath escapes — no hash-oracle leak', async () => {
      const vaultRepo = makeFakeRepo();
      const outsideFile = join(realRoot, 'secret.bin');
      await writeFile(outsideFile, 'super-secret-bytes', 'utf-8');

      vaultRepo.rows.set('file_evil', {
        id: 'file_evil',
        companyId: 'co_1',
        filename: 'evil.bin',
        originalName: 'evil.bin',
        mimeType: 'application/octet-stream',
        sizeBytes: 18,
        sha256: 'x'.repeat(64),
        vaultPath: join('..', '..', '..', '..', 'secret.bin'),
        extractedText: null,
        tagsJson: '[]',
        uploadedBy: 'attacker',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const service = createVaultService({
        vaultRepo,
        companiesBasePath: join(realRoot, 'companies'),
        getCompanySlug: () => 'acme',
      });

      // The attacker's goal: get the service to return the sha256 of
      // /path/to/secret.bin. The guard must refuse BEFORE computeSha256
      // ever opens the file — no hash returned, no oracle leak.
      await expect(service.verify('file_evil')).rejects.toThrow(VaultPathTraversalError);
    });

    it('still works end-to-end for the legitimate happy path (regression pin)', async () => {
      // Pure regression-pin: no clever paths, no symlinks. The H16
      // guards MUST NOT break the common case.
      const vaultRepo = makeFakeRepo();
      const service = createVaultService({
        vaultRepo,
        companiesBasePath: join(realRoot, 'companies'),
        getCompanySlug: () => 'acme',
      });

      const id = await service.store('co_1', sourceFile, 'rocky', ['docs']);
      expect(id).toMatch(/^file_/);

      const { file, absolutePath } = await service.retrieve(id);
      expect(file.id).toBe(id);
      expect(absolutePath).toContain(`acme${sep}vault`);

      const v = await service.verify(id);
      expect(v.ok).toBe(true);

      await service.remove(id);
      expect(vaultRepo.rows.has(id)).toBe(false);
    });
  });
});
