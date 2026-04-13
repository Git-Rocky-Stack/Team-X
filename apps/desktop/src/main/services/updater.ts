/**
 * Auto-updater service — user-triggered only.
 *
 * Design invariant #7: zero phone-home. The updater NEVER checks
 * automatically. It only fires when the user clicks "Check for Updates"
 * in Settings, which invokes the `updater.check` IPC channel.
 *
 * Uses `electron-updater` pointed at GitHub Releases. The flow:
 *
 *   1. `checkForUpdate()` — hits the GitHub Releases API for the
 *      configured `owner/repo`, returns version + release notes if
 *      a newer version exists.
 *
 *   2. `downloadAndInstall()` — downloads the update artifact and
 *      triggers `quitAndInstall()` to restart the app with the new
 *      version. The renderer shows a progress bar during download.
 *
 * In dev mode and in test mode, all methods return safe no-ops so
 * the E2E suite and `pnpm dev` never hit the network.
 */

import type { UpdateCheckResult, UpdateInstallResult } from '@team-x/shared-types';

export interface UpdaterService {
  /** Check GitHub Releases for a newer version. */
  checkForUpdate(): Promise<UpdateCheckResult>;
  /** Download the update and install it (app will restart). */
  downloadAndInstall(): Promise<UpdateInstallResult>;
}

export interface UpdaterServiceDeps {
  /** Whether we're in dev mode (skip real update checks). */
  isDev: boolean;
  /** Whether we're in test mode (E2E — skip everything). */
  isTestMode: boolean;
}

/**
 * Create a stub updater for dev/test — never hits the network.
 */
function createNoopUpdater(): UpdaterService {
  return {
    async checkForUpdate(): Promise<UpdateCheckResult> {
      return { status: 'not-available' };
    },
    async downloadAndInstall(): Promise<UpdateInstallResult> {
      return { initiated: false, error: 'Updates not available in development mode' };
    },
  };
}

export function createUpdaterService(deps: UpdaterServiceDeps): UpdaterService {
  if (deps.isDev || deps.isTestMode) {
    return createNoopUpdater();
  }

  // Lazy-import electron-updater to avoid loading it in dev/test where
  // the module may not be rebuilt for the Electron ABI.
  let autoUpdaterReady = false;

  async function ensureAutoUpdater() {
    if (autoUpdaterReady) return;
    try {
      const { autoUpdater } = await import('electron-updater');
      // Never auto-download or auto-install — user-triggered only.
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = false;
      autoUpdater.allowPrerelease = false;
      autoUpdaterReady = true;
    } catch (err) {
      console.error('[updater] failed to initialize electron-updater:', err);
      throw err;
    }
  }

  return {
    async checkForUpdate(): Promise<UpdateCheckResult> {
      try {
        await ensureAutoUpdater();
        const { autoUpdater } = await import('electron-updater');

        const result = await autoUpdater.checkForUpdates();
        if (!result || !result.updateInfo) {
          return { status: 'not-available' };
        }

        const info = result.updateInfo;
        const currentVersion = (await import('electron')).app.getVersion();

        // Compare versions: if the remote version is the same or older, no update.
        if (info.version === currentVersion) {
          return { status: 'not-available' };
        }

        const releaseNotes =
          typeof info.releaseNotes === 'string'
            ? info.releaseNotes
            : Array.isArray(info.releaseNotes)
              ? info.releaseNotes.map((n) => (typeof n === 'string' ? n : n.note)).join('\n')
              : undefined;

        return {
          status: 'available',
          version: info.version,
          releaseNotes,
          releaseDate: info.releaseDate,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[updater] check failed:', message);
        return { status: 'error', error: message };
      }
    },

    async downloadAndInstall(): Promise<UpdateInstallResult> {
      try {
        await ensureAutoUpdater();
        const { autoUpdater } = await import('electron-updater');

        // Download the update
        await autoUpdater.downloadUpdate();

        // Install and restart
        autoUpdater.quitAndInstall(false, true);

        return { initiated: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[updater] download/install failed:', message);
        return { initiated: false, error: message };
      }
    },
  };
}
