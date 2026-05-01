import type { DashboardEvent, Employee } from '@team-x/shared-types';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Play,
  Send,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useCallback, useRef } from 'react';

import { Button } from '@/components/ui/button.js';
import { flattenEvents, useTimelineEvents } from '@/hooks/use-events.js';

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

function eventIcon(type: string) {
  switch (type) {
    case 'work.started':
      return <Play className="h-3.5 w-3.5 text-blue-400" />;
    case 'work.completed':
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />;
    case 'work.failed':
      return <XCircle className="h-3.5 w-3.5 text-red-400" />;
    case 'work.queued':
      return <Loader2 className="h-3.5 w-3.5 text-muted-foreground" />;
    case 'message.persisted':
    case 'message.agent_to_agent':
      return <MessageSquare className="h-3.5 w-3.5 text-purple-400" />;
    case 'tool.called':
    case 'tool.result':
      return <Wrench className="h-3.5 w-3.5 text-amber-400" />;
    case 'employee.status_changed':
      return <Send className="h-3.5 w-3.5 text-cyan-400" />;
    default:
      return <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />;
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
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <AlertCircle className="h-8 w-8 text-red-500" />
        <p className="text-sm font-medium text-muted-foreground">Failed to load timeline</p>
      </div>
    );
  }

  if (filteredEvents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-medium text-muted-foreground">No activity yet</p>
        <p className="mt-1 text-sm text-muted-foreground/70">
          Events will appear here as your team works.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {[...groups.entries()].map(([dateLabel, dateEvents]) => (
        <div key={dateLabel}>
          <div className="sticky top-0 z-10 mb-3 bg-black">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {dateLabel}
            </span>
          </div>
          <div className="relative ml-4 border-l border-border pl-6">
            {dateEvents.map((event) => (
              <div key={event.id} className="group relative mb-4 last:mb-0">
                <div className="absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full border border-border bg-black">
                  {eventIcon(event.type)}
                </div>
                <div className="flex items-start gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-black">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">
                      {eventDescription(event, employeeMap)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatTime(event.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
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
