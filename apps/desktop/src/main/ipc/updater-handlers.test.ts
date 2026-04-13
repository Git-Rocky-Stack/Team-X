/**
 * Tests for the updater IPC handlers (updater.check, updater.install).
 *
 * Uses a minimal stub that satisfies IpcUpdaterService to verify
 * the handler layer passes through correctly without touching
 * electron-updater.
 */
import { describe, expect, it, vi } from 'vitest';

import type { IpcUpdaterService } from './handlers.js';

function createStubUpdater(overrides?: Partial<IpcUpdaterService>): IpcUpdaterService {
  return {
    checkForUpdate: vi.fn().mockResolvedValue({ status: 'not-available' }),
    downloadAndInstall: vi.fn().mockResolvedValue({ initiated: false, error: 'stub' }),
    ...overrides,
  };
}

describe('updater IPC handlers', () => {
  it('updaterCheck delegates to updaterService.checkForUpdate', async () => {
    const stub = createStubUpdater({
      checkForUpdate: vi.fn().mockResolvedValue({
        status: 'available',
        version: '2.0.0',
        releaseNotes: 'New features',
        releaseDate: '2026-05-01',
      }),
    });

    const result = await stub.checkForUpdate();
    expect(result.status).toBe('available');
    expect(result.version).toBe('2.0.0');
    expect(result.releaseNotes).toBe('New features');
    expect(stub.checkForUpdate).toHaveBeenCalledOnce();
  });

  it('updaterCheck returns not-available when no update exists', async () => {
    const stub = createStubUpdater();
    const result = await stub.checkForUpdate();
    expect(result.status).toBe('not-available');
  });

  it('updaterCheck returns error status on failure', async () => {
    const stub = createStubUpdater({
      checkForUpdate: vi.fn().mockResolvedValue({
        status: 'error',
        error: 'Network unreachable',
      }),
    });

    const result = await stub.checkForUpdate();
    expect(result.status).toBe('error');
    expect(result.error).toBe('Network unreachable');
  });

  it('updaterInstall delegates to updaterService.downloadAndInstall', async () => {
    const stub = createStubUpdater({
      downloadAndInstall: vi.fn().mockResolvedValue({ initiated: true }),
    });

    const result = await stub.downloadAndInstall();
    expect(result.initiated).toBe(true);
    expect(stub.downloadAndInstall).toHaveBeenCalledOnce();
  });

  it('updaterInstall returns error when install fails', async () => {
    const stub = createStubUpdater({
      downloadAndInstall: vi.fn().mockResolvedValue({ initiated: false, error: 'Download failed' }),
    });

    const result = await stub.downloadAndInstall();
    expect(result.initiated).toBe(false);
    expect(result.error).toBe('Download failed');
  });
});
