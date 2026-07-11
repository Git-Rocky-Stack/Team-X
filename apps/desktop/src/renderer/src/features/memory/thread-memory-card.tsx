import { BrainCircuit, Clock3, ShieldCheck } from 'lucide-react';

import {
  checkpointLabel,
  checkpointTone,
  formatMemoryTimestamp,
  freshnessTone,
  resumeOriginHint,
  resumeOriginLabel,
} from './memory-formatters.js';

import {
  LampTile,
  type LampTone,
  MetricTile,
  RecessedWell,
  Tag,
} from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
import { useRunCheckpoints, useThreadDigest } from '@/hooks/use-memory.js';
import { cn } from '@/lib/utils.js';
import { useAppStore } from '@/store/app-store.js';

// memory-formatters returns legacy pill-era tone strings; bridge to LampTone.
const LAMP_TONE: Record<'default' | 'accent' | 'warning' | 'danger', LampTone> = {
  default: 'off',
  accent: 'go',
  warning: 'hold',
  danger: 'nogo',
};

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

  if (compact) {
    return (
      <RecessedWell className={cn('space-y-2 p-3', className)} data-thread-memory-card="">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body-strong text-[var(--display-fg)]">{title}</span>
              <LampTile
                small
                interactive={false}
                label={digest?.freshness ?? 'no digest'}
                tone={LAMP_TONE[freshnessTone(digest?.freshness)]}
              />
              {latestCheckpoint ? (
                <LampTile
                  small
                  interactive={false}
                  label={checkpointLabel(latestCheckpoint.checkpointKind)}
                  tone={LAMP_TONE[checkpointTone(latestCheckpoint.checkpointKind)]}
                />
              ) : null}
            </div>
            <p className="line-clamp-2 text-caption text-silver-mute">
              {digestQuery.isLoading || checkpointsQuery.isLoading
                ? 'Loading condensed memory for this thread...'
                : digestQuery.isError || checkpointsQuery.isError
                  ? 'Team-X could not read the latest digest or checkpoint trail for this thread.'
                  : previewSummary}
            </p>
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 shrink-0 px-3 text-button-sm"
            onClick={() => openAutonomyMemory(threadId)}
            data-thread-memory-open=""
          >
            Inspect
          </Button>
        </div>

        {!digestQuery.isLoading && !checkpointsQuery.isLoading ? (
          <div className="flex flex-wrap items-center gap-2">
            <Tag mono>{digest ? `${digest.estimatedTokens} tokens` : 'digest pending'}</Tag>
            <Tag mono>{checkpoints.length} checkpoints</Tag>
            <Tag>{latestCheckpoint?.nextAction ?? 'Open full memory view'}</Tag>
          </div>
        ) : null}
      </RecessedWell>
    );
  }

  return (
    <RecessedWell className={cn('space-y-3 p-4', className)} data-thread-memory-card="">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body-strong text-[var(--display-fg)]">{title}</span>
            <LampTile
              small
              interactive={false}
              label={digest?.freshness ?? 'no digest'}
              tone={LAMP_TONE[freshnessTone(digest?.freshness)]}
            />
            {latestCheckpoint ? (
              <LampTile
                small
                interactive={false}
                label={checkpointLabel(latestCheckpoint.checkpointKind)}
                tone={LAMP_TONE[checkpointTone(latestCheckpoint.checkpointKind)]}
              />
            ) : null}
            {latestResumeLabel ? <Tag>{latestResumeLabel}</Tag> : null}
          </div>
          <p className="text-caption text-silver-mute">{description}</p>
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => openAutonomyMemory(threadId)}
          data-thread-memory-open=""
        >
          Inspect memory
        </Button>
      </div>

      {digestQuery.isLoading || checkpointsQuery.isLoading ? (
        <RecessedWell className="px-4 py-3 text-caption text-[var(--display-fg-mute)]">
          Loading condensed memory for this thread...
        </RecessedWell>
      ) : digestQuery.isError || checkpointsQuery.isError ? (
        <RecessedWell className="border-[var(--led-nogo-edge)] px-4 py-3 text-caption text-led-nogo">
          Team-X could not read the latest digest or checkpoint trail for this thread.
        </RecessedWell>
      ) : (
        <>
          <RecessedWell className="px-4 py-3 text-body text-[var(--display-fg)]">
            {previewSummary}
          </RecessedWell>

          {latestResumeHint ? (
            <RecessedWell className="px-4 py-2.5 text-eyebrow text-[var(--display-fg-mute)]">
              {latestResumeHint}
            </RecessedWell>
          ) : null}

          <div className="grid gap-2 md:grid-cols-3">
            <MetricTile
              icon={BrainCircuit}
              label="Digest"
              value={digest ? `${digest.estimatedTokens} est. tokens` : 'Pending'}
              hint={formatMemoryTimestamp(digest?.updatedAt ?? null)}
            />
            <MetricTile
              icon={ShieldCheck}
              label="Checkpoints"
              value={String(checkpoints.length)}
              hint={
                latestCheckpoint
                  ? formatMemoryTimestamp(latestCheckpoint.createdAt)
                  : 'No resumable state yet'
              }
            />
            <MetricTile
              icon={Clock3}
              label="Next action"
              value={latestCheckpoint?.nextAction ?? 'Open full memory view'}
            />
          </div>

          {digest?.pinnedFacts.length ? (
            <div className="flex flex-wrap items-center gap-2" data-thread-memory-facts="">
              {digest.pinnedFacts.slice(0, compact ? 2 : 3).map((fact) => (
                <Tag key={fact.id}>{fact.fact}</Tag>
              ))}
            </div>
          ) : null}
        </>
      )}
    </RecessedWell>
  );
}
