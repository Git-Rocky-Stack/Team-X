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
  LampTile,
  type LampTone,
  MetricTile,
  RecessedWell,
  SubviewState,
  Tag,
} from '@/components/console/index.js';
import { useAgentImprovement, useRunAgentImprovement } from '@/hooks/use-agent-improvement.js';
import { useAppStore } from '@/store/app-store.js';

function formatTimestamp(value: number): string {
  return new Date(value).toLocaleString();
}

function priorityTone(priority: TicketPriority): LampTone {
  if (priority === 'critical') return 'nogo';
  if (priority === 'high') return 'hold';
  return 'off';
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
    <RecessedWell className="space-y-3 p-4" data-agent-improvement-ticket={ticket.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <TicketCheck className="h-4 w-4 text-silver-mute" />
            <span className="text-body-strong text-foreground">{ticket.title}</span>
            <LampTile
              label={ticket.priority}
              tone={priorityTone(ticket.priority)}
              small
              interactive={false}
            />
            <Tag>{ticket.status}</Tag>
          </div>
          <p className="line-clamp-2 text-caption text-silver-mute">{ticket.description}</p>
        </div>
        <button
          type="button"
          title="Open ticket"
          aria-label={`Open ${ticket.title}`}
          onClick={() => onOpen(ticket.id)}
          className="cap flex h-10 w-10 items-center justify-center"
        >
          <ExternalLink className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {labels.slice(0, 5).map((label) => (
          <Tag key={label} mono>
            {label}
          </Tag>
        ))}
      </div>
    </RecessedWell>
  );
}

function RecommendationRow({
  recommendation,
}: {
  recommendation: AgentImprovementRecommendation;
}) {
  return (
    <RecessedWell
      className="space-y-3 p-4"
      data-agent-improvement-recommendation={recommendation.id}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-silver-mute" />
            <span className="text-body-strong text-foreground">{recommendation.title}</span>
            <LampTile
              label={recommendation.priority}
              tone={priorityTone(recommendation.priority)}
              small
              interactive={false}
            />
          </div>
          <p className="text-caption text-silver-mute">
            {recommendation.sourceCount} source
            {recommendation.sourceCount === 1 ? '' : 's'} inspected.
          </p>
        </div>
        {recommendation.createdTicketId ? (
          <LampTile label="ticket opened" tone="go" small interactive={false} />
        ) : recommendation.existingTicketId ? (
          <Tag>already queued</Tag>
        ) : (
          <Tag>ready</Tag>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {recommendation.sourceRefs.slice(0, 4).map((ref) => (
          <Tag key={ref} mono>
            {ref}
          </Tag>
        ))}
      </div>
    </RecessedWell>
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
      <SubviewState
        lampLabel="STBY"
        lampTone="off"
        title="Loading agent improvement loop"
        description="Team-X is reading the current self-improvement queue and recent loop runs."
      />
    );
  }

  if (improvementQuery.isError || !snapshot) {
    return (
      <SubviewState
        lampLabel="NO-GO"
        lampTone="nogo"
        title="Agent improvement loop could not load"
        description="The self-improvement surface is wired, but the current queue could not be read from the main process."
      />
    );
  }

  const lastRun = snapshot.recentRuns[0] ?? null;

  return (
    <div className="space-y-4" data-agent-improvement-panel="">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-silver-mute" />
            <h2 className="text-h2 text-foreground">Agent Improvement Loop</h2>
            <LampTile
              label={snapshot.openTicketCount > 0 ? 'active' : 'clear'}
              tone={snapshot.openTicketCount > 0 ? 'hold' : 'go'}
              small
              interactive={false}
            />
          </div>
          <p className="text-caption text-silver-mute">
            Last checked {formatTimestamp(snapshot.generatedAt)}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            title="Refresh"
            onClick={() => {
              void improvementQuery.refetch();
            }}
            disabled={improvementQuery.isFetching || runLoop.isPending}
            className="cap flex h-10 w-10 items-center justify-center disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="cap cap-select inline-flex h-10 items-center gap-2 px-4 text-button-sm disabled:opacity-50"
            onClick={() => runLoop.mutate()}
            disabled={runLoop.isPending}
          >
            <Play className="h-4 w-4" />
            {runLoop.isPending ? 'Running...' : 'Run Improvement Loop'}
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <MetricTile
          label="Open Tickets"
          value={String(snapshot.openTicketCount)}
          hint="Queued improvements"
          icon={TicketCheck}
        />
        <MetricTile
          label="Recent Runs"
          value={String(snapshot.recentRuns.length)}
          hint="Loop history"
          icon={History}
        />
        <MetricTile
          label="Last Created"
          value={String(lastRun?.createdTicketCount ?? 0)}
          hint={lastRun ? formatTimestamp(lastRun.ranAt) : 'No runs yet'}
          icon={CheckCircle2}
        />
      </div>

      {runLoop.isError ? (
        <RecessedWell className="p-4">
          <div className="flex items-center gap-2 text-body-strong text-led-nogo">
            <AlertTriangle className="h-4 w-4" />
            Improvement loop failed
          </div>
        </RecessedWell>
      ) : null}

      {latestRun ? (
        <RecessedWell className="space-y-3 p-4" data-agent-improvement-run-result="">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-body-strong text-foreground">Latest loop run</div>
            <Tag mono>{formatTimestamp(latestRun.ranAt)}</Tag>
          </div>
          <div className="grid gap-2 text-caption text-silver-mute md:grid-cols-3">
            <span>{latestRun.inspectedEventCount} events inspected</span>
            <span>{latestRun.inspectedTicketCount} tickets inspected</span>
            <span>{latestRun.createdTicketIds.length} tickets opened</span>
          </div>
          {latestRun.recommendations.length === 0 ? (
            <RecessedWell className="px-3 py-2 text-caption text-silver-mute">
              No new improvement signals.
            </RecessedWell>
          ) : (
            <div className="grid gap-3">
              {latestRun.recommendations.map((recommendation) => (
                <RecommendationRow key={recommendation.id} recommendation={recommendation} />
              ))}
            </div>
          )}
        </RecessedWell>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
        <RecessedWell className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-h3 text-foreground">Self-improvement tickets</h3>
            <Tag>{snapshot.openTicketCount}</Tag>
          </div>
          {snapshot.openTickets.length === 0 ? (
            <RecessedWell className="px-3 py-3 text-caption text-silver-mute">
              No open self-improvement tickets.
            </RecessedWell>
          ) : (
            <div className="grid gap-3">
              {snapshot.openTickets.map((ticket) => (
                <TicketRow key={ticket.id} ticket={ticket} onOpen={openTicket} />
              ))}
            </div>
          )}
        </RecessedWell>

        <RecessedWell className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-h3 text-foreground">Loop history</h3>
            <Tag>{snapshot.recentRuns.length}</Tag>
          </div>
          {snapshot.recentRuns.length === 0 ? (
            <RecessedWell className="px-3 py-3 text-caption text-silver-mute">
              No loop runs recorded.
            </RecessedWell>
          ) : (
            <div className="space-y-2">
              {snapshot.recentRuns.map((run) => (
                <RecessedWell
                  key={run.eventId}
                  className="px-3 py-3"
                  data-agent-improvement-run={run.eventId}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-caption font-semibold text-foreground">
                      {formatTimestamp(run.ranAt)}
                    </span>
                    {run.createdTicketCount > 0 ? (
                      <LampTile
                        label={`${run.createdTicketCount} opened`}
                        tone="go"
                        small
                        interactive={false}
                      />
                    ) : (
                      <Tag>{run.createdTicketCount} opened</Tag>
                    )}
                  </div>
                  <p className="mt-2 text-caption text-silver-mute">
                    {run.recommendationCount} recommendations from {run.inspectedEventCount} events
                    and {run.inspectedTicketCount} tickets.
                  </p>
                </RecessedWell>
              ))}
            </div>
          )}
        </RecessedWell>
      </div>
    </div>
  );
}
