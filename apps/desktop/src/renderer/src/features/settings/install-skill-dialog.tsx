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

interface InstallSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
}

type SkillInstallSource = 'local' | 'github';

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

export function InstallSkillDialog({ open, onOpenChange, companyId }: InstallSkillDialogProps) {
  const installLocal = useInstallLocalSkill(companyId);
  const installGithub = useInstallGithubSkill(companyId);
  const [source, setSource] = useState<SkillInstallSource>('local');
  const [folderPath, setFolderPath] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');

  function resetForm() {
    setSource('local');
    setFolderPath('');
    setSourceUrl('');
    installLocal.reset();
    installGithub.reset();
  }

  function canSubmit(): boolean {
    if (!companyId) return false;
    if (source === 'local') return folderPath.trim().length > 0;
    return sourceUrl.trim().length > 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit()) return;
    try {
      if (source === 'local') {
        await installLocal.mutateAsync({
          companyId: companyId!,
          folderPath: folderPath.trim(),
        });
      } else {
        await installGithub.mutateAsync({
          companyId: companyId!,
          sourceUrl: sourceUrl.trim(),
        });
      }
      resetForm();
      onOpenChange(false);
    } catch {
      // Mutation state drives the inline error copy.
    }
  }

  const activeMutationError = source === 'local' ? installLocal.error : installGithub.error;
  const activeError = activeMutationError instanceof Error ? activeMutationError.message : null;
  const isPending = installLocal.isPending || installGithub.isPending;

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
            Load a Team-X skill from a local folder or a public GitHub source. Skill folders must
            include `teamx-skill.json` or `team-x-skill.json`.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="skill-install-source" className="text-xs font-medium text-muted-foreground">
              Source
            </label>
            <select
              id="skill-install-source"
              value={source}
              onChange={(event) => setSource(event.target.value as SkillInstallSource)}
              className={selectClass}
            >
              <option value="local">Local Folder</option>
              <option value="github">GitHub URL</option>
            </select>
          </div>

          {source === 'local' ? (
            <div className="space-y-1.5">
              <label htmlFor="skill-folder-path" className="text-xs font-medium text-muted-foreground">
                Folder Path
              </label>
              <Input
                id="skill-folder-path"
                value={folderPath}
                onChange={(event) => setFolderPath(event.target.value)}
                placeholder="C:\\Users\\User\\skills\\ops-briefing"
                className="font-mono text-sm"
              />
              <p className="text-[11px] leading-snug text-muted-foreground">
                Team-X snapshots the manifest and referenced prompt files into workspace app data,
                then applies the current autonomy policy automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label htmlFor="skill-source-url" className="text-xs font-medium text-muted-foreground">
                GitHub URL
              </label>
              <Input
                id="skill-source-url"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://github.com/acme/team-x-skills/tree/main/ops-briefing"
                className="font-mono text-sm"
              />
              <p className="text-[11px] leading-snug text-muted-foreground">
                Supports repo, tree, blob, and raw GitHub URLs. Team-X resolves the default branch
                when a ref is not specified.
              </p>
            </div>
          )}

          {activeError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {activeError}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit() || isPending}>
              {source === 'local' ? 'Install Local Skill' : 'Install GitHub Skill'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
