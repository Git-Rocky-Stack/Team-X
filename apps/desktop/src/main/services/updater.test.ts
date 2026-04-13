import { describe, expect, it } from 'vitest';
import { createUpdaterService } from './updater.js';

describe('createUpdaterService', () => {
  describe('dev mode (noop)', () => {
    const updater = createUpdaterService({ isDev: true, isTestMode: false });

    it('checkForUpdate returns not-available in dev mode', async () => {
      const result = await updater.checkForUpdate();
      expect(result.status).toBe('not-available');
    });

    it('downloadAndInstall returns error in dev mode', async () => {
      const result = await updater.downloadAndInstall();
      expect(result.initiated).toBe(false);
      expect(result.error).toContain('development mode');
    });
  });

  describe('test mode (noop)', () => {
    const updater = createUpdaterService({ isDev: false, isTestMode: true });

    it('checkForUpdate returns not-available in test mode', async () => {
      const result = await updater.checkForUpdate();
      expect(result.status).toBe('not-available');
    });

    it('downloadAndInstall returns error in test mode', async () => {
      const result = await updater.downloadAndInstall();
      expect(result.initiated).toBe(false);
      expect(result.error).toContain('development mode');
    });
  });

  describe('UpdaterService interface', () => {
    it('exposes checkForUpdate and downloadAndInstall methods', () => {
      const updater = createUpdaterService({ isDev: true, isTestMode: false });
      expect(typeof updater.checkForUpdate).toBe('function');
      expect(typeof updater.downloadAndInstall).toBe('function');
    });

    it('checkForUpdate returns a valid UpdateCheckResult shape', async () => {
      const updater = createUpdaterService({ isDev: true, isTestMode: false });
      const result = await updater.checkForUpdate();
      expect(result).toHaveProperty('status');
      expect(['available', 'not-available', 'error']).toContain(result.status);
    });

    it('downloadAndInstall returns a valid UpdateInstallResult shape', async () => {
      const updater = createUpdaterService({ isDev: true, isTestMode: false });
      const result = await updater.downloadAndInstall();
      expect(result).toHaveProperty('initiated');
      expect(typeof result.initiated).toBe('boolean');
    });
  });
});
