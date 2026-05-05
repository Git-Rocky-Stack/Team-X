import type { VaultFile } from '@team-x/shared-types';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileArchive,
  FileCode2,
  FileImage,
  FileText,
  HardDrive,
  Loader2,
  Search,
  Shield,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { useCallback, useState } from 'react';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import {
  useVaultDelete,
  useVaultEventSync,
  useVaultFiles,
  useVaultSearch,
  useVaultStats,
  useVaultUpload,
  useVaultVerify,
} from '@/hooks/use-vault.js';
import { ipc } from '@/lib/ipc.js';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = sizes[i] ?? 'TB';
  return `${(bytes / k ** i).toFixed(1)} ${size}`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return FileImage;
  if (mimeType.startsWith('text/') || mimeType === 'application/json') return FileCode2;
  if (mimeType === 'application/pdf') return FileText;
  return FileArchive;
}

function getMimeLabel(mimeType: string): string {
  const ext = mimeType.split('/')[1] ?? mimeType;
  return ext.toUpperCase();
}

interface VaultViewProps {
  companyId: string | null;
}

export function VaultView({ companyId }: VaultViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<VaultFile | null>(null);

  const { data: files = [], isLoading } = useVaultFiles(companyId);
  const { data: searchResults } = useVaultSearch(companyId, searchQuery);
  const { data: stats } = useVaultStats(companyId);
  const uploadMutation = useVaultUpload();
  const deleteMutation = useVaultDelete();
  const verifyMutation = useVaultVerify();

  // Subscribe to main-process vault events so out-of-band mutations
  // (E2E direct-IPC calls, agent tools, backup restores) invalidate
  // the React Query cache. Mount-and-forget — hook handles cleanup.
  useVaultEventSync(companyId);

  const displayFiles =
    searchQuery.trim().length > 0 && searchResults
      ? files.filter((f) => searchResults.some((sr) => sr.id === f.id))
      : files;

  const handleUpload = useCallback(async () => {
    if (!companyId) return;
    try {
      // Use Electron's dialog.showOpenDialog via IPC
      const result = await (
        window as unknown as {
          electronAPI?: {
            showOpenDialog?: () => Promise<{ canceled: boolean; filePaths: string[] }>;
          };
        }
      ).electronAPI?.showOpenDialog?.();
      if (result?.canceled || !result?.filePaths?.length) return;
      for (const filePath of result.filePaths) {
        await uploadMutation.mutateAsync({ companyId, sourcePath: filePath });
      }
    } catch {
      // Fallback: prompt for path (when dialog not available)
      console.warn('[vault] File dialog not available via electronAPI');
    }
  }, [companyId, uploadMutation]);

  const handleDelete = useCallback(
    async (fileId: string) => {
      await deleteMutation.mutateAsync(fileId);
      if (selectedFile?.id === fileId) setSelectedFile(null);
    },
    [deleteMutation, selectedFile],
  );

  const handleVerify = useCallback(
    async (fileId: string) => {
      const result = await verifyMutation.mutateAsync(fileId);
      return result;
    },
    [verifyMutation],
  );

  const handleDownload = useCallback(async (fileId: string) => {
    try {
      const { absolutePath } = await ipc.vault.download(fileId);
      // Open the file's containing folder via Electron shell
      console.log('[vault] File path:', absolutePath);
    } catch (err) {
      console.error('[vault] Download failed:', err);
    }
  }, []);

  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-medium text-muted-foreground">No company selected</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <HardDrive className="h-5 w-5 text-brand" />
          <div>
            <h2 className="text-sm font-semibold">File Vault</h2>
            {stats && (
              <p className="text-xs text-muted-foreground">
                {stats.fileCount} file{stats.fileCount !== 1 ? 's' : ''} &middot;{' '}
                {formatBytes(stats.totalBytes)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-56 pl-8 text-xs"
            />
          </div>
          <Button size="sm" className="h-8 gap-1.5" onClick={handleUpload}>
            <Upload className="h-3.5 w-3.5" />
            Upload
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* File list */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : displayFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <FileArchive className="mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">
                {searchQuery ? 'No matching files' : 'No files in vault'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                {searchQuery ? 'Try a different search term.' : 'Upload files to get started.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {displayFiles.map((file) => {
                const Icon = getFileIcon(file.mimeType);
                const isSelected = selectedFile?.id === file.id;
                return (
                  <button
                    type="button"
                    key={file.id}
                    onClick={() => setSelectedFile(file)}
                    className={`flex w-full items-center gap-3 px-6 py-3 text-left transition-colors ${
                      isSelected
                        ? 'bg-brand/5 border-l-2 border-brand'
                        : 'hover:bg-surface-100 border-l-2 border-transparent'
                    }`}
                  >
                    <Icon className="h-8 w-8 shrink-0 text-muted-foreground/70" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.originalName}</p>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatBytes(file.sizeBytes)}</span>
                        <span>&middot;</span>
                        <span>{getMimeLabel(file.mimeType)}</span>
                        <span>&middot;</span>
                        <span>{formatDate(file.createdAt)}</span>
                      </div>
                    </div>
                    {file.tags.length > 0 && (
                      <div className="flex shrink-0 gap-1">
                        {file.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedFile && (
          <div className="w-80 shrink-0 border-l border-border overflow-y-auto scrollbar-thin">
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{selectedFile.originalName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {getMimeLabel(selectedFile.mimeType)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="ml-2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 space-y-4">
                <DetailRow label="Size" value={formatBytes(selectedFile.sizeBytes)} />
                <DetailRow label="Type" value={selectedFile.mimeType} />
                <DetailRow label="Uploaded" value={formatDate(selectedFile.createdAt)} />
                <DetailRow label="Modified" value={formatDate(selectedFile.updatedAt)} />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">SHA256</p>
                  <p className="break-all font-mono text-[10px] text-muted-foreground/80 bg-surface-50 rounded p-2">
                    {selectedFile.sha256}
                  </p>
                </div>
                {selectedFile.tags.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedFile.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-col gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-full justify-start gap-2"
                  onClick={() => handleDownload(selectedFile.id)}
                >
                  <Download className="h-3.5 w-3.5" />
                  Open Location
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-full justify-start gap-2"
                  onClick={() => handleVerify(selectedFile.id)}
                  disabled={verifyMutation.isPending}
                >
                  <Shield className="h-3.5 w-3.5" />
                  {verifyMutation.isPending ? 'Verifying...' : 'Verify Integrity'}
                </Button>
                {verifyMutation.data && (
                  <div
                    className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs ${
                      verifyMutation.data.ok
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-red-500/10 text-red-400'
                    }`}
                  >
                    {verifyMutation.data.ok ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Integrity verified
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-3.5 w-3.5" /> Hash mismatch
                      </>
                    )}
                  </div>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8 w-full justify-start gap-2"
                  onClick={() => handleDelete(selectedFile.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete File'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm">{value}</p>
    </div>
  );
}
