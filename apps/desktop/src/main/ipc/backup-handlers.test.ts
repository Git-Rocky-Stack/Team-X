import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BackupManifest } from '@team-x/shared-types';

import type { IpcBackupService } from './handlers.js';
import { createIpcHandlers } from './handlers.js';

const mockManifest: BackupManifest = {
  version: '1',
  createdAt: '2026-04-13T03:00:00Z',
  appVersion: '0.0.1',
  companyCount: 1,
  fileCount: 5,
  totalSizeBytes: 10240,
  dbSizeBytes: 4096,
};

function makeMockBackupService(): IpcBackupService {
  return {
    create: vi.fn().mockResolvedValue({
      backupPath: '/tmp/backups/backup-2026-04-13',
      manifest: mockManifest,
    }),
    restore: vi.fn().mockResolvedValue(mockManifest),
    list: vi.fn().mockResolvedValue([
      {
        filename: 'backup-2026-04-13',
        path: '/tmp/backups/backup-2026-04-13',
        createdAt: '2026-04-13T03:00:00Z',
        sizeBytes: 10240,
        manifest: mockManifest,
      },
    ]),
  };
}

function buildTestHandlers(backupService: IpcBackupService) {
  const noop = {} as Record<string, unknown>;
  return createIpcHandlers({
    companiesRepo: noop as never,
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
    backupService,
    getHardwareProfile: () => ({ cpuCores: 4, ramGb: 16, gpuName: null, gpuVramGb: null }),
  });
}

describe('backup IPC handlers', () => {
  let backupService: IpcBackupService;
  let handlers: ReturnType<typeof createIpcHandlers>;

  beforeEach(() => {
    backupService = makeMockBackupService();
    handlers = buildTestHandlers(backupService);
  });

  describe('backupCreate', () => {
    it('creates a backup and returns path + manifest', async () => {
      const result = await handlers.backupCreate({});
      expect(result.backupPath).toBe('/tmp/backups/backup-2026-04-13');
      expect(result.manifest.companyCount).toBe(1);
      expect(backupService.create).toHaveBeenCalledWith(undefined);
    });

    it('passes destination when provided', async () => {
      await handlers.backupCreate({ destination: '/mnt/ext' });
      expect(backupService.create).toHaveBeenCalledWith('/mnt/ext');
    });
  });

  describe('backupRestore', () => {
    it('restores from a backup path and returns manifest', async () => {
      const result = await handlers.backupRestore({ backupPath: '/tmp/backups/backup-2026-04-13' });
      expect(result.manifest.version).toBe('1');
      expect(backupService.restore).toHaveBeenCalledWith('/tmp/backups/backup-2026-04-13');
    });

    it('throws on empty backupPath', async () => {
      await expect(handlers.backupRestore({ backupPath: '' })).rejects.toThrow(
        'backupPath is required',
      );
    });
  });

  describe('backupList', () => {
    it('returns list of backups', async () => {
      const result = await handlers.backupList();
      expect(result).toHaveLength(1);
      expect(result[0]?.filename).toBe('backup-2026-04-13');
    });
  });
});
