/**
 * UpdaterSection — Check for Updates UI in Settings.
 *
 * Design invariant #7: zero phone-home. Updates are checked ONLY
 * when the user clicks the button. Never auto-check.
 */

import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw, Rocket } from 'lucide-react';

import { Faceplate } from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
import { useCheckForUpdate, useInstallUpdate } from '@/hooks/use-updater.js';

export function UpdaterSection() {
  const checkUpdate = useCheckForUpdate();
  const installUpdate = useInstallUpdate();

  const result = checkUpdate.data;
  const isAvailable = result?.status === 'available';
  const isNotAvailable = result?.status === 'not-available';
  const isError = result?.status === 'error' || checkUpdate.isError;
  const isDownloading = installUpdate.isPending;

  return (
    <Faceplate kicker="Ops" serial="UPDATES" bodyClassName="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-[var(--armed)]" />
          <h2 className="text-h2 text-foreground">Updates</h2>
        </div>
        <Button
          size="sm"
          className="h-7 gap-1.5 text-button-sm"
          onClick={() => checkUpdate.mutate()}
          disabled={checkUpdate.isPending || isDownloading}
        >
          {checkUpdate.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {checkUpdate.isPending ? 'Checking...' : 'Check for Updates'}
        </Button>
      </div>

      <p className="text-caption text-silver-mute">
        Updates are checked only when you click the button above. Team-X never phones home.
      </p>

      {/* Update available */}
      {isAvailable && !isDownloading && !installUpdate.isSuccess && (
        <div className="rounded-inset border border-[var(--armed-edge)] bg-[var(--armed-soft)] px-3 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-[var(--armed)]" />
              <div>
                <p className="text-body-strong">Version {result.version} is available</p>
                {result.releaseDate && (
                  <p className="text-caption text-muted-foreground mt-0.5">
                    Released{' '}
                    {new Date(result.releaseDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                )}
              </div>
            </div>
            <Button
              size="sm"
              className="h-7 gap-1.5 text-button-sm"
              onClick={() => installUpdate.mutate()}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Rocket className="h-3 w-3" />
              )}
              {isDownloading ? 'Installing...' : 'Install & Restart'}
            </Button>
          </div>
          {result.releaseNotes && (
            <div className="mt-2 max-h-24 overflow-y-auto rounded-inset bg-[var(--void)] px-2 py-1.5 text-caption text-[var(--display-fg)]">
              {result.releaseNotes}
            </div>
          )}
        </div>
      )}

      {/* Downloading / installing */}
      {isDownloading && (
        <div className="flex items-center gap-2 rounded-inset border border-[var(--led-scope-edge)] bg-[var(--scope-soft)] px-3 py-2 text-body text-[var(--led-scope)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Downloading and installing update...
        </div>
      )}

      {/* Install initiated (app will restart) */}
      {installUpdate.isSuccess && installUpdate.data?.initiated && (
        <div className="flex items-center gap-2 rounded-inset border border-[var(--led-go-edge)] bg-[var(--go-soft)] px-3 py-2 text-body text-[var(--led-go)]">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Update installed. Restarting...
        </div>
      )}

      {/* Install failed */}
      {(installUpdate.isError || (installUpdate.isSuccess && !installUpdate.data?.initiated)) && (
        <div className="flex items-center gap-2 rounded-inset border border-[var(--led-nogo-edge)] bg-[var(--warn-soft)] px-3 py-2 text-body text-[var(--led-nogo)]">
          <AlertTriangle className="h-3.5 w-3.5" />
          Install failed: {installUpdate.data?.error ?? String(installUpdate.error)}
        </div>
      )}

      {/* No update available */}
      {isNotAvailable && (
        <div className="flex items-center gap-2 rounded-inset border border-[var(--led-go-edge)] bg-[var(--go-soft)] px-3 py-2 text-body text-[var(--led-go)]">
          <CheckCircle2 className="h-3.5 w-3.5" />
          You are running the latest version.
        </div>
      )}

      {/* Check error */}
      {isError && !isAvailable && (
        <div className="flex items-center gap-2 rounded-inset border border-[var(--led-nogo-edge)] bg-[var(--warn-soft)] px-3 py-2 text-body text-[var(--led-nogo)]">
          <AlertTriangle className="h-3.5 w-3.5" />
          Check failed: {result?.error ?? String(checkUpdate.error)}
        </div>
      )}
    </Faceplate>
  );
}
