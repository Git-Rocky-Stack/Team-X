import { BrainCircuit, Clock3, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button.js';
import { useRunCheckpoints, useThreadDigest } from '@/hooks/use-memory.js';
import { cn } from '@/lib/utils.js';
import { useAppStore } from '@/store/app-store.js';

import { MissionInsetSurface, MissionPill } from '../mission/mission-shell.js';
import {
  checkpointLabel,
  checkpointTone,
  formatMemoryTimestamp,
  freshnessTone,
  resumeOriginHint,
  resumeOriginLabel,
} from './memory-formatters.js';

interface ThreadMemoryCardProps {
  companyId: string | null;
  threadId: string | null;
  title?: string;
  description?: string;
  compact?: boolean;
  className?: string;
}

export function ThreadMemoryCard({
  companyId,
  threadId,
  title = 'Thread memory',
  description = 'Inspect the latest digest and resumable checkpoint trail for this thread.',
  compact = false,
  className,
}: ThreadMemoryCardProps) {
  const digestQuery = useThreadDigest(companyId, threadId);
  const checkpointsQuery = useRunCheckpoints(companyId, threadId, compact ? 3 : 4);
  const openAutonomyMemory = useAppStore((state) => state.openAutonomyMemory);

  if (!companyId || !threadId) {
    return null;
  }

  const digest = digestQuery.data ?? null;
  const checkpoints = checkpointsQuery.data ?? [];
  const latestCheckpoint = checkpoints[0] ?? null;
  const latestResumeLabel = resumeOriginLabel(latestCheckpoint?.resumeOrigin ?? null);
  const latestResumeHint = resumeOriginHint(latestCheckpoint?.resumeOrigin ?? null);
  const previewSummary =
    digest?.summary ??
    latestCheckpoint?.progressSummary ??
    'No condensed memory is available for this thread yet.';

  return (
    <MissionInsetSurface
      className={cn('space-y-3 p-4', compact ? 'rounded-[18px] p-3' : null, className)}
      data-thread-memory-card=""
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{title}</span>
            <MissionPill tone={freshnessTone(digest?.freshness)}>
              {digest?.freshness ?? 'no digest'}
            </MissionPill>
            {latestCheckpoint ? (
              <MissionPill tone={checkpointTone(latestCheckpoint.checkpointKind)}>
                {checkpointLabel(latestCheckpoint.checkpointKind)}
              </MissionPill>
            ) : null}
            {latestResumeLabel ? <MissionPill>{latestResumeLabel}</MissionPill> : null}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-white/10 bg-black/10 hover:bg-black/20"
          onClick={() => openAutonomyMemory(threadId)}
          data-thread-memory-open=""
        >
          Inspect memory
        </Button>
      </div>

      {digestQuery.isLoading || checkpointsQuery.isLoading ? (
        <div className="rounded-[18px] border border-white/8 bg-black/20 px-4 py-3 text-xs text-muted-foreground">
          Loading condensed memory for this thread...
        </div>
      ) : digestQuery.isError || checkpointsQuery.isError ? (
        <div className="rounded-[18px] border border-red-500/20 bg-red-500/8 px-4 py-3 text-xs text-red-200">
          Team-X could not read the latest digest or checkpoint trail for this thread.
        </div>
      ) : (
        <>
          <div className="rounded-[18px] border border-white/8 bg-black/20 px-4 py-3 text-sm leading-6 text-foreground/90">
            {previewSummary}
          </div>

          {latestResumeHint ? (
            <div className="rounded-[16px] border border-white/8 bg-black/15 px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {latestResumeHint}
            </div>
          ) : null}

          <div className="grid gap-2 md:grid-cols-3">
            <div className="rounded-[16px] border border-white/8 bg-black/15 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <BrainCircuit className="h-3.5 w-3.5 text-brand" />
                Digest
              </div>
              <div className="mt-2 text-sm font-medium text-foreground">
                {digest ? `${digest.estimatedTokens} est. tokens` : 'Pending'}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {formatMemoryTimestamp(digest?.updatedAt ?? null)}
              </div>
            </div>

            <div className="rounded-[16px] border border-white/8 bg-black/15 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-brand" />
                Checkpoints
              </div>
              <div className="mt-2 text-sm font-medium text-foreground">{checkpoints.length}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {latestCheckpoint
                  ? formatMemoryTimestamp(latestCheckpoint.createdAt)
                  : 'No resumable state yet'}
              </div>
            </div>

            <div className="rounded-[16px] border border-white/8 bg-black/15 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5 text-brand" />
                Next action
              </div>
              <div className="mt-2 text-sm font-medium text-foreground">
                {latestCheckpoint?.nextAction ?? 'Open full memory view'}
              </div>
            </div>
          </div>

          {digest?.pinnedFacts.length ? (
            <div className="flex flex-wrap items-center gap-2" data-thread-memory-facts="">
              {digest.pinnedFacts.slice(0, compact ? 2 : 3).map((fact) => (
                <MissionPill key={fact.id}>{fact.fact}</MissionPill>
              ))}
            </div>
          ) : null}
        </>
      )}
    </MissionInsetSurface>
  );
}
