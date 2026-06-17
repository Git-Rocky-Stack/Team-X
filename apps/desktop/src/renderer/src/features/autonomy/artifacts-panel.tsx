import type { ArtifactRecord, ArtifactSourceKind } from '@team-x/shared-types';
import { CheckSquare2, FolderKanban, Ticket, UploadCloud, Workflow } from 'lucide-react';
import { useMemo, useState } from 'react';

import { MetricTile, RecessedWell, SubviewState, Tag } from '@/components/console/index.js';
import { useArtifactEventSync, useArtifacts } from '@/hooks/use-artifacts.js';
import { cn } from '@/lib/utils.js';
import { useAppStore } from '@/store/app-store.js';

type ArtifactFilter = 'all' | ArtifactSourceKind;

const FILTERS: Array<{
  value: ArtifactFilter;
  label: string;
}> = [
  { value: 'all', label: 'All' },
  { value: 'routine-run', label: 'Routines' },
  { value: 'approval-decision', label: 'Approvals' },
  { value: 'vault-file', label: 'Vault' },
];

function formatTimestamp(value: number): string {
  return new Date(value).toLocaleString();
}

function sourceLabel(sourceKind: ArtifactSourceKind): string {
  if (sourceKind === 'routine-run') return 'Routine run';
  if (sourceKind === 'approval-decision') return 'Approval decision';
  return 'Vault upload';
}

function kindLabel(artifact: ArtifactRecord): string {
  if (artifact.kind === 'ticket-output') return 'Ticket output';
  if (artifact.kind === 'approval-record') return 'Approval record';
  return 'Vault file';
}

function ArtifactCard({
  artifact,
  previewOpen,
  onTogglePreview,
  onOpen,
}: {
  artifact: ArtifactRecord;
  previewOpen: boolean;
  onTogglePreview: () => void;
  onOpen: () => void;
}) {
  const previewEntries = Object.entries(artifact.preview ?? {}).slice(0, 6);
  const canOpen = artifact.ticketId !== null || artifact.fileId !== null;

  return (
    <RecessedWell className="space-y-4 p-4" data-artifact-card={artifact.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body-strong text-foreground">{artifact.title}</span>
            <Tag>{kindLabel(artifact)}</Tag>
            <Tag>{artifact.outcomeKind}</Tag>
            <Tag>{sourceLabel(artifact.sourceKind)}</Tag>
          </div>
          <p className="text-caption text-muted-foreground">
            {artifact.summary?.trim().length
              ? artifact.summary
              : 'Explicit outcome recorded for operator review.'}
          </p>
        </div>
        <div className="text-right text-eyebrow text-muted-foreground">
          {formatTimestamp(artifact.createdAt)}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
        {artifact.ticketId ? <Tag mono>{artifact.ticketId}</Tag> : null}
        {artifact.fileId ? <Tag mono>{artifact.fileId}</Tag> : null}
        {artifact.approvalItemId ? <Tag mono>{artifact.approvalItemId}</Tag> : null}
        {artifact.uri ? <Tag mono>{artifact.uri}</Tag> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="cap px-3 py-2 text-button-sm" onClick={onTogglePreview}>
          {previewOpen ? 'Hide preview' : 'Preview'}
        </button>
        {canOpen ? (
          <button type="button" className="cap px-3 py-2 text-button-sm" onClick={onOpen}>
            {artifact.ticketId ? 'Open ticket' : 'Open files'}
          </button>
        ) : null}
      </div>

      {previewOpen ? (
        <RecessedWell className="grid gap-2 p-3 text-caption text-muted-foreground">
          {previewEntries.length > 0 ? (
            previewEntries.map(([key, value]) => (
              <div key={key} className="flex items-start justify-between gap-3">
                <span className="text-eyebrow text-foreground/80">{key}</span>
                <span className="text-right">
                  {typeof value === 'string' ||
                  typeof value === 'number' ||
                  typeof value === 'boolean'
                    ? String(value)
                    : JSON.stringify(value)}
                </span>
              </div>
            ))
          ) : (
            <span>No preview details were stored for this artifact.</span>
          )}
        </RecessedWell>
      ) : null}
    </RecessedWell>
  );
}

export function ArtifactsPanel({ companyId }: { companyId: string }) {
  const [activeFilter, setActiveFilter] = useState<ArtifactFilter>('all');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const artifactsQuery = useArtifacts(companyId, 100);
  useArtifactEventSync(companyId, 100);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const setActiveTicketId = useAppStore((state) => state.setActiveTicketId);

  const artifacts = artifactsQuery.data ?? [];
  const filtered = useMemo(
    () =>
      activeFilter === 'all'
        ? artifacts
        : artifacts.filter((artifact) => artifact.sourceKind === activeFilter),
    [activeFilter, artifacts],
  );

  const stats = useMemo(
    () => ({
      total: artifacts.length,
      routine: artifacts.filter((artifact) => artifact.sourceKind === 'routine-run').length,
      approval: artifacts.filter((artifact) => artifact.sourceKind === 'approval-decision').length,
      vault: artifacts.filter((artifact) => artifact.sourceKind === 'vault-file').length,
    }),
    [artifacts],
  );

  function openArtifact(artifact: ArtifactRecord) {
    if (artifact.ticketId) {
      setActiveView('tickets');
      setActiveTicketId(artifact.ticketId);
      return;
    }
    if (artifact.fileId) {
      setActiveView('files');
    }
  }

  if (artifactsQuery.isLoading) {
    return (
      <SubviewState
        lampLabel="STBY"
        lampTone="off"
        title="Loading artifacts and outcomes"
        description="Team-X is resolving explicit outputs and review results for the current workspace."
      />
    );
  }

  if (artifactsQuery.isError) {
    return (
      <SubviewState
        lampLabel="NO-GO"
        lampTone="nogo"
        title="Artifacts could not load"
        description="Retry the artifact query to restore routine outputs, approval outcomes, and vault uploads."
      />
    );
  }

  if (artifacts.length === 0) {
    return (
      <SubviewState
        lampLabel="STBY"
        lampTone="off"
        title="Artifacts are waiting on real work"
        description="Routine-created tickets, approval completions, and vault uploads will start accumulating here as explicit outcomes."
      />
    );
  }

  return (
    <div className="space-y-4" data-artifacts-panel="">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Recorded"
          value={String(stats.total)}
          hint="Explicit outcomes captured"
          icon={FolderKanban}
        />
        <MetricTile
          label="Routine outputs"
          value={String(stats.routine)}
          hint="Work materialized from cadence"
          icon={Workflow}
        />
        <MetricTile
          label="Approval results"
          value={String(stats.approval)}
          hint="Reviewed governance outcomes"
          icon={CheckSquare2}
        />
        <MetricTile
          label="Vault uploads"
          value={String(stats.vault)}
          hint="File artifacts with provenance"
          icon={UploadCloud}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((filter) => (
          <button
            type="button"
            key={filter.value}
            onClick={() => setActiveFilter(filter.value)}
            className={cn(
              'cap px-3 py-1.5 text-button-sm',
              activeFilter === filter.value && 'cap-select',
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <SubviewState
            lampLabel="STBY"
            lampTone="off"
            title="No artifacts match this filter"
            description="Switch the source filter to inspect a different outcome stream."
          />
        ) : (
          filtered.map((artifact) => (
            <ArtifactCard
              key={artifact.id}
              artifact={artifact}
              previewOpen={previewId === artifact.id}
              onTogglePreview={() =>
                setPreviewId((current) => (current === artifact.id ? null : artifact.id))
              }
              onOpen={() => openArtifact(artifact)}
            />
          ))
        )}
      </div>

      <RecessedWell className="grid gap-3 p-4 text-body text-muted-foreground md:grid-cols-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-foreground">
            <Workflow className="h-4 w-4" />
            Routine provenance
          </div>
          <p>
            Routine outputs bind a ticket outcome back to the exact routine run that produced it.
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-foreground">
            <CheckSquare2 className="h-4 w-4" />
            Governance outcomes
          </div>
          <p>
            Approval decisions now leave a durable artifact trail instead of disappearing into
            status changes.
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-foreground">
            <Ticket className="h-4 w-4" />
            Operator handoff
          </div>
          <p>
            Use preview for provenance and jump into Tickets or Files when the outcome needs a
            deeper follow-up.
          </p>
        </div>
      </RecessedWell>
    </div>
  );
}
