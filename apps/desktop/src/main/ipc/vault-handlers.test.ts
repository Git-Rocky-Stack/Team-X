import type { VaultFile, VaultSearchResult } from '@team-x/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IpcVaultService } from './handlers.js';

/**
 * Unit tests for the vault IPC handler logic. Uses a stubbed vault
 * service to verify input validation and delegation without touching
 * the filesystem or SQLite.
 */

function makeMockVaultService(): IpcVaultService {
  const mockFile: VaultFile = {
    id: 'file-1',
    companyId: 'co-1',
    filename: 'abc_readme.md',
    originalName: 'README.md',
    mimeType: 'text/markdown',
    sizeBytes: 1024,
    sha256: 'e3b0c44298fc1c149afbf4c8996fb924',
    tags: ['docs'],
    uploadedBy: 'rocky',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return {
    store: vi.fn().mockResolvedValue('file-1'),
    retrieve: vi.fn().mockResolvedValue({
      file: mockFile,
      absolutePath: '/tmp/vault/abc_readme.md',
    }),
    verify: vi.fn().mockResolvedValue({ ok: true, expected: 'aaa', actual: 'aaa' }),
    remove: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockReturnValue([
      {
        id: 'file-1',
        originalName: 'README.md',
        mimeType: 'text/markdown',
        sizeBytes: 1024,
        rank: -1,
      },
    ] satisfies VaultSearchResult[]),
    list: vi.fn().mockReturnValue([mockFile]),
    get: vi.fn().mockReturnValue(mockFile),
    stats: vi.fn().mockReturnValue({ fileCount: 1, totalBytes: 1024 }),
  };
}

// Import the handler factory — we build handlers with a minimal deps
// object that only fills the vault-related slots. The non-vault handlers
// are never invoked in these tests so we can safely use `as any` stubs.
import { createIpcHandlers } from './handlers.js';

function buildTestHandlers(vaultService: IpcVaultService) {
  const noop = {} as Record<string, unknown>;
  return createIpcHandlers({
    companiesRepo: noop as never,
    employeesRepo: noop as never,
    threadsRepo: noop as never,
    messagesRepo: noop as never,
    ticketsRepo: noop as never,
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
    vaultService,
    getHardwareProfile: () => ({ cpuCores: 4, ramGb: 16, gpuName: null, gpuVramGb: null }),
  });
}

describe('vault IPC handlers', () => {
  let vaultService: IpcVaultService;
  let handlers: ReturnType<typeof createIpcHandlers>;

  beforeEach(() => {
    vaultService = makeMockVaultService();
    handlers = buildTestHandlers(vaultService);
  });

  // -------------------------------------------------------------------------
  // vault.upload
  // -------------------------------------------------------------------------

  describe('vaultUpload', () => {
    it('delegates to vaultService.store and returns fileId', async () => {
      const result = await handlers.vaultUpload({
        companyId: 'co-1',
        sourcePath: '/tmp/readme.md',
        tags: ['docs'],
      });
      expect(result).toEqual({ fileId: 'file-1' });
      expect(vaultService.store).toHaveBeenCalledWith('co-1', '/tmp/readme.md', 'rocky', ['docs']);
    });

    it('throws on empty companyId', async () => {
      await expect(handlers.vaultUpload({ companyId: '', sourcePath: '/tmp/f' })).rejects.toThrow(
        'companyId is required',
      );
    });

    it('throws on empty sourcePath', async () => {
      await expect(handlers.vaultUpload({ companyId: 'co-1', sourcePath: '' })).rejects.toThrow(
        'sourcePath is required',
      );
    });
  });

  // -------------------------------------------------------------------------
  // vault.download
  // -------------------------------------------------------------------------

  describe('vaultDownload', () => {
    it('returns file metadata and absolute path', async () => {
      const result = await handlers.vaultDownload({ fileId: 'file-1' });
      expect(result.file.originalName).toBe('README.md');
      expect(result.absolutePath).toBe('/tmp/vault/abc_readme.md');
      expect(vaultService.retrieve).toHaveBeenCalledWith('file-1');
    });

    it('throws on empty fileId', async () => {
      await expect(handlers.vaultDownload({ fileId: '' })).rejects.toThrow('fileId is required');
    });
  });

  // -------------------------------------------------------------------------
  // vault.list
  // -------------------------------------------------------------------------

  describe('vaultList', () => {
    it('returns all files for the company', async () => {
      const result = await handlers.vaultList({ companyId: 'co-1' });
      expect(result).toHaveLength(1);
      expect(result[0]?.originalName).toBe('README.md');
      expect(vaultService.list).toHaveBeenCalledWith('co-1');
    });

    it('throws on empty companyId', async () => {
      await expect(handlers.vaultList({ companyId: '' })).rejects.toThrow('companyId is required');
    });
  });

  // -------------------------------------------------------------------------
  // vault.search
  // -------------------------------------------------------------------------

  describe('vaultSearch', () => {
    it('delegates to vaultService.search', async () => {
      const result = await handlers.vaultSearch({ companyId: 'co-1', query: 'README' });
      expect(result).toHaveLength(1);
      expect(vaultService.search).toHaveBeenCalledWith('co-1', 'README');
    });

    it('throws on empty query', async () => {
      await expect(handlers.vaultSearch({ companyId: 'co-1', query: '   ' })).rejects.toThrow(
        'query is required',
      );
    });

    it('throws on empty companyId', async () => {
      await expect(handlers.vaultSearch({ companyId: '', query: 'test' })).rejects.toThrow(
        'companyId is required',
      );
    });
  });

  // -------------------------------------------------------------------------
  // vault.delete
  // -------------------------------------------------------------------------

  describe('vaultDelete', () => {
    it('delegates to vaultService.remove', async () => {
      await handlers.vaultDelete({ fileId: 'file-1' });
      expect(vaultService.remove).toHaveBeenCalledWith('file-1');
    });

    it('throws on empty fileId', async () => {
      await expect(handlers.vaultDelete({ fileId: '' })).rejects.toThrow('fileId is required');
    });
  });

  // -------------------------------------------------------------------------
  // vault.verify
  // -------------------------------------------------------------------------

  describe('vaultVerify', () => {
    it('returns integrity check result', async () => {
      const result = await handlers.vaultVerify({ fileId: 'file-1' });
      expect(result.ok).toBe(true);
      expect(vaultService.verify).toHaveBeenCalledWith('file-1');
    });

    it('throws on empty fileId', async () => {
      await expect(handlers.vaultVerify({ fileId: '' })).rejects.toThrow('fileId is required');
    });
  });

  // -------------------------------------------------------------------------
  // vault.stats
  // -------------------------------------------------------------------------

  describe('vaultStats', () => {
    it('returns vault statistics', async () => {
      const result = await handlers.vaultStats({ companyId: 'co-1' });
      expect(result).toEqual({ fileCount: 1, totalBytes: 1024 });
      expect(vaultService.stats).toHaveBeenCalledWith('co-1');
    });

    it('throws on empty companyId', async () => {
      await expect(handlers.vaultStats({ companyId: '' })).rejects.toThrow('companyId is required');
    });
  });
});
