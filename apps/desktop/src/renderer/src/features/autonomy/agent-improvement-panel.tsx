import type { AgentImprovementRecommendation, Ticket, TicketPriority } from '@team-x/shared-types';
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ExternalLink,
  History,
  Play,
  RefreshCw,
  TicketCheck,
} from 'lucide-react';

import {
  MissionControlRow,
  MissionIconButton,
  MissionInsetSurface,
  MissionMetricTile,
  MissionPill,
  MissionStateBlock,
} from '../mission/mission-shell.js';

import { useAgentImprovement, useRunAgentImprovement } from '@/hooks/use-agent-improvement.js';
import { useAppStore } from '@/store/app-store.js';

function formatTimestamp(value: number): string {
  return new Date(value).toLocaleString();
}

function priorityTone(priority: TicketPriority): 'default' | 'warning' | 'danger' {
  if (priority === 'critical') return 'danger';
  if (priority === 'high') return 'warning';
  return 'default';
}

function TicketRow({ ticket, onOpen }: { ticket: Ticket; onOpen: (ticketId: string) => void }) {
  const labels = (() => {
    try {
      const parsed = JSON.parse(ticket.labelsJson);
      return Array.isArray(parsed) ? parsed.filter((label) => typeof label === 'string') : [];
    } catch {
      return [];
    }
  })();

  return (
    <MissionInsetSurface className="space-y-3 p-4" data-agent-improvement-ticket={ticket.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <TicketCheck className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">{ticket.title}</span>
            <MissionPill tone={priorityTone(ticket.priority)}>{ticket.priority}</MissionPill>
            <MissionPill>{ticket.status}</MissionPill>
          </div>
          <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
            {ticket.description}
          </p>
        </div>
        <MissionIconButton
          title="Open ticket"
          onClick={() => onOpen(ticket.id)}
          aria-label={`Open ${ticket.title}`}
        >
          <ExternalLink className="h-4 w-4" />
        </MissionIconButton>
      </div>
      <div className="flex flex-wrap gap-2">
        {labels.slice(0, 5).map((label) => (
          <MissionPill key={label} mono>
            {label}
          </MissionPill>
        ))}
      </div>
    </MissionInsetSurface>
  );
}

function RecommendationRow({
  recommendation,
}: {
  recommendation: AgentImprovementRecommendation;
}) {
  return (
    <MissionInsetSurface
      className="space-y-3 p-4"
      data-agent-improvement-recommendation={recommendation.id}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">{recommendation.title}</span>
            <MissionPill tone={priorityTone(recommendation.priority)}>
              {recommendation.priority}
            </MissionPill>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {recommendation.sourceCount} source
            {recommendation.sourceCount === 1 ? '' : 's'} inspected.
          </p>
        </div>
        {recommendation.createdTicketId ? (
          <MissionPill tone="accent">ticket opened</MissionPill>
        ) : recommendation.existingTicketId ? (
          <MissionPill>already queued</MissionPill>
        ) : (
          <MissionPill>ready</MissionPill>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {recommendation.sourceRefs.slice(0, 4).map((ref) => (
          <MissionPill key={ref} mono>
            {ref}
          </MissionPill>
        ))}
      </div>
    </MissionInsetSurface>
  );
}

export function AgentImprovementPanel({ companyId }: { companyId: string }) {
  const improvementQuery = useAgentImprovement(companyId);
  const runLoop = useRunAgentImprovement(companyId);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const setActiveTicketId = useAppStore((state) => state.setActiveTicketId);
  const snapshot = improvementQuery.data;
  const latestRun = runLoop.data;

  const openTicket = (ticketId: string) => {
    setActiveTicketId(ticketId);
    setActiveView('tickets');
  };

  if (improvementQuery.isLoading) {
    return (
      <MissionStateBlock
        title="Loading agent improvement loop"
        description="Team-X is reading the current self-improvement queue and recent loop runs."
        icon={BrainCircuit}
      />
    );
  }

  if (improvementQuery.isError || !snapshot) {
    return (
      <MissionStateBlock
        title="Agent improvement loop could not load"
        description="The self-improvement surface is wired, but the current queue could not be read from the main process."
        icon={AlertTriangle}
        tone="danger"
      />
    );
  }

  const lastRun = snapshot.recentRuns[0] ?? null;

  return (
    <div className="space-y-4" data-agent-improvement-panel="">
      <MissionControlRow className="justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm font-semibold text-foreground">Agent Improvement Loop</div>
            <MissionPill tone={snapshot.openTicketCount > 0 ? 'warning' : 'accent'}>
              {snapshot.openTicketCount > 0 ? 'active' : 'clear'}
            </MissionPill>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Last checked {formatTimestamp(snapshot.generatedAt)}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MissionIconButton
            title="Refresh"
            onClick={() => {
              void improvementQuery.refetch();
            }}
            disabled={improvementQuery.isFetching || runLoop.isPending}
          >
            <RefreshCw className="h-4 w-4" />
          </MissionIconButton>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-[16px] border border-brand/25 bg-black px-4 text-xs font-semibold text-brand transition hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
            onClick={() => runLoop.mutate()}
            disabled={runLoop.isPending}
          >
            <Play className="h-4 w-4" />
            {runLoop.isPending ? 'Running...' : 'Run Improvement Loop'}
          </button>
        </div>
      </MissionControlRow>

      <div className="grid gap-3 md:grid-cols-3">
        <MissionMetricTile
          label="Open Tickets"
          value={String(snapshot.openTicketCount)}
          hint="Queued improvements"
          icon={TicketCheck}
        />
        <MissionMetricTile
          label="Recent Runs"
          value={String(snapshot.recentRuns.length)}
          hint="Loop history"
          icon={History}
        />
        <MissionMetricTile
          label="Last Created"
          value={String(lastRun?.createdTicketCount ?? 0)}
          hint={lastRun ? formatTimestamp(lastRun.ranAt) : 'No runs yet'}
          icon={CheckCircle2}
        />
      </div>

      {runLoop.isError ? (
        <MissionInsetSurface className="p-4" tone="danger">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-200">
            <AlertTriangle className="h-4 w-4" />
            Improvement loop failed
          </div>
        </MissionInsetSurface>
      ) : null}

      {latestRun ? (
        <MissionInsetSurface className="space-y-3 p-4" data-agent-improvement-run-result="">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-foreground">Latest loop run</div>
            <MissionPill mono>{formatTimestamp(latestRun.ranAt)}</MissionPill>
          </div>
          <div className="grid gap-2 text-xs leading-5 text-muted-foreground md:grid-cols-3">
            <span>{latestRun.inspectedEventCount} events inspected</span>
            <span>{latestRun.inspectedTicketCount} tickets inspected</span>
            <span>{latestRun.createdTicketIds.length} tickets opened</span>
          </div>
          {latestRun.recommendations.length === 0 ? (
            <div className="rounded-md border border-white/10 bg-black/10 px-3 py-2 text-xs leading-5 text-muted-foreground">
              No new improvement signals.
            </div>
          ) : (
            <div className="grid gap-3">
              {latestRun.recommendations.map((recommendation) => (
                <RecommendationRow key={recommendation.id} recommendation={recommendation} />
              ))}
            </div>
          )}
        </MissionInsetSurface>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
        <MissionInsetSurface className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-foreground">Self-improvement tickets</div>
            <MissionPill>{snapshot.openTicketCount}</MissionPill>
          </div>
          {snapshot.openTickets.length === 0 ? (
            <div className="rounded-md border border-white/10 bg-black/10 px-3 py-3 text-xs leading-5 text-muted-foreground">
              No open self-improvement tickets.
            </div>
          ) : (
            <div className="grid gap-3">
              {snapshot.openTickets.map((ticket) => (
                <TicketRow key={ticket.id} ticket={ticket} onOpen={openTicket} />
              ))}
            </div>
          )}
        </MissionInsetSurface>

        <MissionInsetSurface className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-foreground">Loop history</div>
            <MissionPill>{snapshot.recentRuns.length}</MissionPill>
          </div>
          {snapshot.recentRuns.length === 0 ? (
            <div className="rounded-md border border-white/10 bg-black/10 px-3 py-3 text-xs leading-5 text-muted-foreground">
              No loop runs recorded.
            </div>
          ) : (
            <div className="space-y-2">
              {snapshot.recentRuns.map((run) => (
                <div
                  key={run.eventId}
                  className="rounded-md border border-white/10 bg-black/10 px-3 py-3"
                  data-agent-improvement-run={run.eventId}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground">
                      {formatTimestamp(run.ranAt)}
                    </span>
                    <MissionPill tone={run.createdTicketCount > 0 ? 'accent' : 'default'}>
                      {run.createdTicketCount} opened
                    </MissionPill>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {run.recommendationCount} recommendations from {run.inspectedEventCount} events
                    and {run.inspectedTicketCount} tickets.
                  </p>
                </div>
              ))}
            </div>
          )}
        </MissionInsetSurface>
      </div>
    </div>
  );
}
