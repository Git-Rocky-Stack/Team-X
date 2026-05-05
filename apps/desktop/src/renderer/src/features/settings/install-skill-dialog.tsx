import { FolderOpen, Globe2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { useInstallGithubSkill, useInstallLocalSkill } from '@/hooks/use-extensions.js';
import { requireString } from '@/lib/required.js';
import { cn } from '@/lib/utils.js';

interface InstallSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
}

type SkillInstallSource = 'local' | 'url';

const LAST_LOCAL_SKILL_PATH_KEY = 'teamx.lastLocalSkillPath';

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

function formatInstallError(message: string | null): string | null {
  if (!message) return null;
  if (message.includes('local skill folder not found')) {
    return 'The selected local folder does not exist.';
  }
  if (message.includes('local skill path must be a directory')) {
    return 'The selected local path must point to a folder.';
  }
  if (
    message.includes('missing teamx-skill.json') ||
    message.includes('missing team-x-skill.json')
  ) {
    return 'That folder or repo is missing `teamx-skill.json` or `team-x-skill.json`.';
  }
  if (message.includes('missing referenced file')) {
    return 'The skill manifest references a prompt or instruction file that is missing.';
  }
  if (message.includes('GitHub repository not found')) {
    return 'The GitHub repository could not be found or is not publicly reachable.';
  }
  if (message.includes('GitHub skill file not found')) {
    return 'The GitHub source does not contain the referenced skill manifest or prompt files.';
  }
  if (message.includes('public skill URL must use https')) {
    return 'Public skill URLs must use HTTPS.';
  }
  if (message.includes('public skill URL is missing')) {
    return 'That public URL does not expose `teamx-skill.json` or `team-x-skill.json`.';
  }
  if (message.includes('public skill file not found')) {
    return 'The public skill manifest references a prompt or instruction file that could not be downloaded.';
  }
  return message;
}

function readLastLocalSkillPath(): string {
  try {
    return window.localStorage.getItem(LAST_LOCAL_SKILL_PATH_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberLastLocalSkillPath(value: string): void {
  try {
    window.localStorage.setItem(LAST_LOCAL_SKILL_PATH_KEY, value);
  } catch {
    // Local storage is an ergonomic cache only.
  }
}

export function InstallSkillDialog({ open, onOpenChange, companyId }: InstallSkillDialogProps) {
  const installLocal = useInstallLocalSkill(companyId);
  const installUrl = useInstallGithubSkill(companyId);
  const [source, setSource] = useState<SkillInstallSource>('local');
  const [folderPath, setFolderPath] = useState(() => readLastLocalSkillPath());
  const [sourceUrl, setSourceUrl] = useState('');
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  function resetForm() {
    setSource('local');
    setFolderPath(readLastLocalSkillPath());
    setSourceUrl('');
    setDirectoryError(null);
    installLocal.reset();
    installUrl.reset();
  }

  function closeDialog() {
    resetForm();
    onOpenChange(false);
  }

  function canSubmit(): boolean {
    if (!companyId) return false;
    if (source === 'local') return folderPath.trim().length > 0;
    return sourceUrl.trim().length > 0;
  }

  async function handleBrowseFolder() {
    setDirectoryError(null);
    try {
      const result = await window.teamx.system.selectDirectory();
      if (result.canceled || !result.folderPath) return;
      setFolderPath(result.folderPath);
      rememberLastLocalSkillPath(result.folderPath);
    } catch (err) {
      setDirectoryError(err instanceof Error ? err.message : 'Could not open the folder picker.');
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit()) return;
    const requiredCompanyId = requireString(companyId, 'companyId');
    try {
      if (source === 'local') {
        await installLocal.mutateAsync({
          companyId: requiredCompanyId,
          folderPath: folderPath.trim(),
        });
        rememberLastLocalSkillPath(folderPath.trim());
      } else {
        await installUrl.mutateAsync({
          companyId: requiredCompanyId,
          sourceUrl: sourceUrl.trim(),
        });
      }
      closeDialog();
    } catch {
      // Mutation state drives the inline error copy.
    }
  }

  const activeMutationError = source === 'local' ? installLocal.error : installUrl.error;
  const activeError = formatInstallError(
    activeMutationError instanceof Error ? activeMutationError.message : null,
  );
  const isPending = installLocal.isPending || installUrl.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) resetForm();
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Install Skill</DialogTitle>
          <DialogDescription>
            Load a Team-X skill from an editable local folder path or a public HTTPS URL. Skill
            sources must include `teamx-skill.json` or `team-x-skill.json`.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2" role="tablist" aria-label="Skill source">
            <button
              type="button"
              role="tab"
              aria-selected={source === 'local'}
              className={cn(
                selectClass,
                'h-auto min-h-14 items-start gap-2 text-left',
                source === 'local' && 'border-brand/60 bg-brand/10 text-foreground',
              )}
              onClick={() => setSource('local')}
              data-skill-source-local=""
            >
              <FolderOpen className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium">Local Folder</span>
                <span className="block text-[11px] text-muted-foreground">
                  Browse or type any folder path.
                </span>
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={source === 'url'}
              className={cn(
                selectClass,
                'h-auto min-h-14 items-start gap-2 text-left',
                source === 'url' && 'border-brand/60 bg-brand/10 text-foreground',
              )}
              onClick={() => setSource('url')}
              data-skill-source-url=""
            >
              <Globe2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium">Public URL</span>
                <span className="block text-[11px] text-muted-foreground">
                  GitHub, raw GitHub, or direct manifest URL.
                </span>
              </span>
            </button>
          </div>

          {source === 'local' ? (
            <div className="space-y-1.5">
              <label
                htmlFor="skill-folder-path"
                className="text-xs font-medium text-muted-foreground"
              >
                Folder Path
              </label>
              <div className="flex gap-2">
                <Input
                  id="skill-folder-path"
                  value={folderPath}
                  onChange={(event) => {
                    setFolderPath(event.target.value);
                    setDirectoryError(null);
                  }}
                  placeholder="C:\\path\\to\\team-x-skill"
                  className="font-mono text-sm"
                  data-skill-folder-path=""
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleBrowseFolder()}
                  disabled={isPending}
                  data-skill-folder-browse=""
                >
                  <FolderOpen className="h-4 w-4" aria-hidden="true" />
                  Browse
                </Button>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Team-X snapshots the manifest and referenced prompt files into workspace app data,
                then applies the current autonomy policy automatically. The field is editable; the
                last successful folder is remembered as your local default.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label
                htmlFor="skill-source-url"
                className="text-xs font-medium text-muted-foreground"
              >
                Public URL
              </label>
              <Input
                id="skill-source-url"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://github.com/acme/team-x-skills/tree/main/ops-briefing"
                className="font-mono text-sm"
                data-skill-source-url-input=""
              />
              <p className="text-[11px] leading-snug text-muted-foreground">
                Supports GitHub repo, tree, blob, raw GitHub, and direct HTTPS manifest URLs. Folder
                URLs are checked for `teamx-skill.json` and `team-x-skill.json`.
              </p>
            </div>
          )}

          {directoryError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {directoryError}
            </div>
          )}

          {activeError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {activeError}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={closeDialog} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit() || isPending}>
              {source === 'local' ? 'Install Local Skill' : 'Install from URL'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
