import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { useBackupList, useCreateBackup, useRestoreBackup } from '@/hooks/use-backup.js';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = sizes[i] ?? 'TB';
  return `${(bytes / k ** i).toFixed(1)} ${size}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function BackupSection() {
  const { data: backups = [], isLoading } = useBackupList();
  const createBackup = useCreateBackup();
  const restoreBackup = useRestoreBackup();
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-border bg-surface-50 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Backup & Restore</h3>
        <Button
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => createBackup.mutate(undefined)}
          disabled={createBackup.isPending}
        >
          {createBackup.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          {createBackup.isPending ? 'Backing up...' : 'Create Backup'}
        </Button>
      </div>

      {createBackup.isSuccess && (
        <div className="mb-3 rounded bg-green-500/10 px-3 py-2 text-xs text-green-400">
          Backup created successfully
        </div>
      )}

      {createBackup.isError && (
        <div className="mb-3 rounded bg-red-500/10 px-3 py-2 text-xs text-red-400">
          Backup failed: {String(createBackup.error)}
        </div>
      )}

      <p className="text-xs text-muted-foreground mb-3">
        Backups include the full database and all vault files. Restore replaces all current data.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : backups.length === 0 ? (
        <div className="rounded border border-border/50 bg-surface-100 px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground/60">No backups yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {backups.slice(0, 10).map((backup) => (
            <div
              key={backup.filename}
              className="flex items-center justify-between rounded border border-border/50 bg-surface-100 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{backup.filename}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">
                    {formatDate(backup.createdAt)}
                  </span>
                  {backup.manifest && (
                    <>
                      <span className="text-[10px] text-muted-foreground">&middot;</span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatBytes(backup.sizeBytes)}
                      </span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0">
                        {backup.manifest.companyCount} co
                      </Badge>
                      <Badge variant="outline" className="text-[9px] px-1 py-0">
                        {backup.manifest.fileCount} files
                      </Badge>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 ml-2">
                {confirmRestore === backup.path ? (
                  <>
                    <span className="text-[10px] text-red-400 mr-1">Overwrite all data?</span>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => {
                        restoreBackup.mutate(backup.path);
                        setConfirmRestore(null);
                      }}
                      disabled={restoreBackup.isPending}
                    >
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => setConfirmRestore(null)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setConfirmRestore(backup.path)}
                    disabled={restoreBackup.isPending}
                  >
                    Restore
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {restoreBackup.isSuccess && (
        <div className="mt-3 rounded bg-green-500/10 px-3 py-2 text-xs text-green-400">
          Restore complete. Restart the app to apply changes.
        </div>
      )}

      {restoreBackup.isError && (
        <div className="mt-3 rounded bg-red-500/10 px-3 py-2 text-xs text-red-400">
          Restore failed: {String(restoreBackup.error)}
        </div>
      )}
    </div>
  );
}
