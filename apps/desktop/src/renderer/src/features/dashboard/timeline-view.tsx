import type { DashboardEvent, Employee } from '@team-x/shared-types';
import { Loader2 } from 'lucide-react';
import { useCallback, useRef } from 'react';

import { LampTile, type LampTone, StripeHeader } from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import { flattenEvents, useTimelineEvents } from '@/hooks/use-events.js';

import { SubviewState } from './dashboard-subview-state.js';

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Event type → stencil word-lamp + tone (DESIGN.md: status is a word, not an icon). */
function eventLamp(type: string): { label: string; tone: LampTone } {
  switch (type) {
    case 'work.started':
      return { label: 'EXEC', tone: 'exec' };
    case 'work.completed':
      return { label: 'GO', tone: 'go' };
    case 'work.failed':
      return { label: 'NO-GO', tone: 'nogo' };
    case 'work.queued':
      return { label: 'QUE', tone: 'off' };
    case 'message.persisted':
    case 'message.agent_to_agent':
      return { label: 'MSG', tone: 'exec' };
    case 'tool.called':
    case 'tool.result':
      return { label: 'TOOL', tone: 'hold' };
    case 'employee.status_changed':
      return { label: 'STAT', tone: 'exec' };
    default:
      return { label: 'EVT', tone: 'off' };
  }
}

/** Timeline rail bead — an LED node colored to the event tone (the word-lamp carries status). */
function nodeDotClass(tone: LampTone): string {
  switch (tone) {
    case 'go':
      return 'bg-led-go';
    case 'hold':
      return 'bg-led-hold';
    case 'nogo':
      return 'bg-led-nogo';
    case 'exec':
      return 'bg-led-scope';
    default:
      return 'bg-graphite';
  }
}

function eventDescription(event: DashboardEvent, employeeMap: Map<string, Employee>): string {
  const actor = employeeMap.get(event.actorId);
  const actorName = actor?.name ?? event.actorId;
  const payload = event.payload as Record<string, unknown>;

  switch (event.type) {
    case 'work.started':
      return `${actorName} started working (${(payload.provider as string) ?? 'unknown'} / ${(payload.model as string) ?? 'unknown'})`;
    case 'work.completed': {
      const tokens =
        ((payload.promptTokens as number) ?? 0) + ((payload.completionTokens as number) ?? 0);
      const latency = payload.latencyMs as number | undefined;
      return `${actorName} completed work (${tokens} tokens${latency ? `, ${(latency / 1000).toFixed(1)}s` : ''})`;
    }
    case 'work.failed':
      return `${actorName} work failed`;
    case 'work.queued':
      return `${actorName} queued for processing`;
    case 'message.persisted':
      return `${actorName} message persisted`;
    case 'message.agent_to_agent': {
      const to = employeeMap.get(payload.toEmployeeId as string);
      return `${actorName} sent message to ${to?.name ?? 'colleague'}`;
    }
    case 'tool.called':
      return `${actorName} called tool: ${(payload.toolName as string) ?? 'unknown'}`;
    case 'tool.result': {
      const success = payload.success as boolean;
      return `${actorName} tool ${(payload.toolName as string) ?? 'unknown'} ${success ? 'succeeded' : 'failed'}`;
    }
    case 'employee.status_changed':
      return `${actorName} status changed`;
    default:
      return `${actorName}: ${event.type}`;
  }
}

interface TimelineViewProps {
  companyId: string | null;
  employees: Employee[];
}

export function TimelineView({ companyId, employees }: TimelineViewProps) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } =
    useTimelineEvents(companyId);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (!node) return;
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      });
      observerRef.current.observe(node);
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  );

  const events = flattenEvents(data?.pages);
  const employeeMap = new Map(employees.map((e) => [e.id, e]));

  // Filter out token.delta events — too noisy for the timeline.
  const filteredEvents = events.filter((e) => e.type !== 'token.delta');

  // Group by date
  const groups = new Map<string, DashboardEvent[]>();
  for (const event of filteredEvents) {
    const dateKey = formatDate(event.createdAt);
    const group = groups.get(dateKey);
    if (group) {
      group.push(event);
    } else {
      groups.set(dateKey, [event]);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full flex-col p-6">
        <SubviewState lampLabel="NO-GO" lampTone="nogo" title="Failed to load timeline" />
      </div>
    );
  }

  if (filteredEvents.length === 0) {
    return (
      <div className="flex h-full flex-col p-6">
        <SubviewState
          lampLabel="STBY"
          lampTone="off"
          title="No activity yet"
          description="Events will appear here as your team works."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {[...groups.entries()].map(([dateLabel, dateEvents]) => (
        <div key={dateLabel}>
          <StripeHeader kicker={dateLabel} className="sticky top-0 z-10 mb-3" />
          <div className="relative ml-4 border-l border-[hsl(var(--hairline))] pl-6">
            {dateEvents.map((event) => {
              const lamp = eventLamp(event.type);
              return (
                <div key={event.id} className="group relative mb-4 last:mb-0">
                  <div className="absolute -left-[30px] flex h-5 w-5 items-center justify-center">
                    <span className={cn('h-2.5 w-2.5 rounded-pill', nodeDotClass(lamp.tone))} />
                  </div>
                  <div className="flex items-start gap-3 rounded-control px-3 py-2 transition-colors hover:bg-carbon-900">
                    <LampTile
                      label={lamp.label}
                      tone={lamp.tone}
                      small
                      interactive={false}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-body text-foreground">
                        {eventDescription(event, employeeMap)}
                      </p>
                      <p className="mt-0.5 text-caption text-muted-foreground">
                        {formatTime(event.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {hasNextPage && (
        <div ref={loadMoreRef} className="flex justify-center py-4">
          {isFetchingNextPage ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <Button variant="ghost" size="sm" onClick={() => fetchNextPage()}>
              Load more
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
