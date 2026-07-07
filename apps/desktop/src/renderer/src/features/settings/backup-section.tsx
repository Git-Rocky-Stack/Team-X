import { Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Faceplate, SubviewState, Tag } from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
import {
  useBackupList,
  useCreateBackup,
  useDeleteBackup,
  useRestoreBackup,
} from '@/hooks/use-backup.js';

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
  const deleteBackup = useDeleteBackup();
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <Faceplate kicker="Ops" serial="BACKUP" bodyClassName="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-h2 text-foreground">Backup &amp; Restore</h2>
        <Button
          size="sm"
          className="h-7 gap-1.5 text-button-sm"
          onClick={() => createBackup.mutate(undefined)}
          disabled={createBackup.isPending}
        >
          {createBackup.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          {createBackup.isPending ? 'Backing up...' : 'Create Backup'}
        </Button>
      </div>

      {createBackup.isSuccess && (
        <div className="rounded-inset border border-[var(--led-go-edge)] bg-[var(--go-soft)] px-3 py-2 text-body text-[var(--led-go)]">
          Backup created successfully
        </div>
      )}

      {createBackup.isError && (
        <div className="rounded-inset border border-[var(--led-nogo-edge)] bg-[var(--warn-soft)] px-3 py-2 text-body text-[var(--led-nogo)]">
          Backup failed: {String(createBackup.error)}
        </div>
      )}

      <p className="text-body-sm text-muted-foreground">
        Backups include the full database and all vault files. Restore replaces all current data.
      </p>

      {isLoading ? (
        <SubviewState
          lampLabel="SYNC"
          lampTone="hold"
          title="Loading backups…"
          className="min-h-0 p-6"
        />
      ) : backups.length === 0 ? (
        <SubviewState
          lampLabel="STBY"
          lampTone="off"
          title="No backups yet"
          className="min-h-0 p-6"
        />
      ) : (
        <div className="space-y-2">
          {backups.slice(0, 10).map((backup) => (
            <div
              key={backup.filename}
              className="flex items-center justify-between rounded-inset border border-[var(--hairline)] px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-body-strong truncate">{backup.filename}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-caption text-muted-foreground">
                    {formatDate(backup.createdAt)}
                  </span>
                  {backup.manifest && (
                    <>
                      <span className="text-caption text-muted-foreground">&middot;</span>
                      <span className="text-caption text-muted-foreground">
                        {formatBytes(backup.sizeBytes)}
                      </span>
                      <Tag className="px-1.5 py-0 text-[10px]">
                        {backup.manifest.companyCount} co
                      </Tag>
                      <Tag className="px-1.5 py-0 text-[10px]">
                        {backup.manifest.fileCount} files
                      </Tag>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 ml-2">
                {confirmRestore === backup.path ? (
                  <>
                    <span className="text-caption text-[var(--led-nogo)] mr-1">
                      Overwrite all data?
                    </span>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-6 px-2 text-caption"
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
                      className="h-6 px-2 text-caption"
                      onClick={() => setConfirmRestore(null)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : confirmDelete === backup.path ? (
                  <>
                    <span className="text-caption text-[var(--led-nogo)] mr-1">
                      Delete this backup?
                    </span>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-6 px-2 text-caption"
                      onClick={() => {
                        deleteBackup.mutate(backup.path);
                        setConfirmDelete(null);
                      }}
                      disabled={deleteBackup.isPending}
                    >
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-caption"
                      onClick={() => setConfirmDelete(null)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-caption"
                      onClick={() => {
                        setConfirmDelete(null);
                        setConfirmRestore(backup.path);
                      }}
                      disabled={restoreBackup.isPending || deleteBackup.isPending}
                    >
                      Restore
                    </Button>
                    <button
                      type="button"
                      className="cap cap-warn flex h-6 items-center justify-center rounded-md p-1.5"
                      onClick={() => {
                        setConfirmRestore(null);
                        setConfirmDelete(backup.path);
                      }}
                      disabled={restoreBackup.isPending || deleteBackup.isPending}
                      aria-label={`Delete backup ${backup.filename}`}
                      data-backup-delete={backup.filename}
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {restoreBackup.isSuccess && (
        <div className="rounded-inset border border-[var(--led-go-edge)] bg-[var(--go-soft)] px-3 py-2 text-body text-[var(--led-go)]">
          Restore complete. Restart the app to apply changes.
        </div>
      )}

      {restoreBackup.isError && (
        <div className="rounded-inset border border-[var(--led-nogo-edge)] bg-[var(--warn-soft)] px-3 py-2 text-body text-[var(--led-nogo)]">
          Restore failed: {String(restoreBackup.error)}
        </div>
      )}

      {deleteBackup.isSuccess && (
        <div className="rounded-inset border border-[var(--led-go-edge)] bg-[var(--go-soft)] px-3 py-2 text-body text-[var(--led-go)]">
          Backup deleted.
        </div>
      )}

      {deleteBackup.isError && (
        <div className="rounded-inset border border-[var(--led-nogo-edge)] bg-[var(--warn-soft)] px-3 py-2 text-body text-[var(--led-nogo)]">
          Delete failed: {String(deleteBackup.error)}
        </div>
      )}
    </Faceplate>
  );
}
