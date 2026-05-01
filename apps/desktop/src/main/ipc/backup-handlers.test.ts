import type { BackupManifest } from '@team-x/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';


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
    // M33 F4 — the mock returns a deterministic pre-M33 shape (one
    // copilot was created) so the handler test can assert the counts
    // land on the response. Per-test `.mockReturnValueOnce(...)` is
    // free to override for coverage of the other branches.
    ensurePostRestoreSystemEmployees: vi.fn().mockReturnValue({
      companiesScanned: 1,
      agentsCreated: 0,
      copilotsCreated: 1,
      perCompany: [{ companyId: 'c-1', agentCreated: false, copilotCreated: true }],
      skipped: [],
    }),
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

    it('omits post-restore counts when bootstrap dep is unwired (legacy composition)', async () => {
      const result = await handlers.backupRestore({ backupPath: '/tmp/backups/b' });
      // buildTestHandlers does NOT pass ensurePostRestoreBootstrap, so
      // the response should be manifest-only and the post-restore
      // counts are `undefined`. Forward-compatible renderer tolerance
      // is the point of the optional field on BackupRestoreResponse.
      expect(result.manifest.version).toBe('1');
      expect(result.postRestoreSystemEmployees).toBeUndefined();
    });
  });

  describe('backupList', () => {
    it('returns list of backups', async () => {
      const result = await handlers.backupList();
      expect(result).toHaveLength(1);
      expect(result[0]?.filename).toBe('backup-2026-04-13');
    });
  });

  describe('backupRestore + post-restore bootstrap (M33 F4)', () => {
    it('threads post-restore counts into the response when wired', async () => {
      const bootstrapCalls: number[] = [];
      const handlersWithBootstrap = createIpcHandlers({
        companiesRepo: {} as never,
        employeesRepo: {} as never,
        threadsRepo: {} as never,
        messagesRepo: {} as never,
        ticketsRepo: {} as never,
        ticketAttachmentsRepo: {} as never,
        goalsRepo: {} as never,
        projectsRepo: {} as never,
        meetingsRepo: {} as never,
        runsRepo: {} as never,
        eventsRepo: {} as never,
        orchestrator: {} as never,
        meetingService: {} as never,
        roleLookup: {} as never,
        mcpHost: {} as never,
        mcpServersRepo: {} as never,
        providersService: {} as never,
        secretsStore: {} as never,
        settingsRepo: {} as never,
        vaultService: {} as never,
        backupService,
        auditRepo: {} as never,
        updaterService: {} as never,
        ensurePostRestoreBootstrap: () => {
          bootstrapCalls.push(Date.now());
          return {
            companiesScanned: 2,
            agentsCreated: 2,
            copilotsCreated: 2,
            skipped: [],
          };
        },
        getHardwareProfile: () => ({ cpuCores: 4, ramGb: 16, gpuName: null, gpuVramGb: null }),
      });

      const result = await handlersWithBootstrap.backupRestore({
        backupPath: '/tmp/backups/pre-m31',
      });
      // Bootstrap was invoked exactly once AFTER the restore.
      expect(bootstrapCalls).toHaveLength(1);
      expect(result.postRestoreSystemEmployees).toEqual({
        companiesScanned: 2,
        agentsCreated: 2,
        copilotsCreated: 2,
        skipped: [],
      });
    });

    it('swallows a bootstrap throw and returns manifest-only (restore must not fail)', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const handlersWithBootstrap = createIpcHandlers({
        companiesRepo: {} as never,
        employeesRepo: {} as never,
        threadsRepo: {} as never,
        messagesRepo: {} as never,
        ticketsRepo: {} as never,
        ticketAttachmentsRepo: {} as never,
        goalsRepo: {} as never,
        projectsRepo: {} as never,
        meetingsRepo: {} as never,
        runsRepo: {} as never,
        eventsRepo: {} as never,
        orchestrator: {} as never,
        meetingService: {} as never,
        roleLookup: {} as never,
        mcpHost: {} as never,
        mcpServersRepo: {} as never,
        providersService: {} as never,
        secretsStore: {} as never,
        settingsRepo: {} as never,
        vaultService: {} as never,
        backupService,
        auditRepo: {} as never,
        updaterService: {} as never,
        ensurePostRestoreBootstrap: () => {
          throw new Error('catastrophic bootstrap failure');
        },
        getHardwareProfile: () => ({ cpuCores: 4, ramGb: 16, gpuName: null, gpuVramGb: null }),
      });

      const result = await handlersWithBootstrap.backupRestore({
        backupPath: '/tmp/backups/broken',
      });
      expect(result.manifest.version).toBe('1');
      expect(result.postRestoreSystemEmployees).toBeUndefined();
      expect(errSpy).toHaveBeenCalledTimes(1);
    });
  });
});
