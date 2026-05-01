import { useQueryClient } from '@tanstack/react-query';
import type { DashboardEvent, Employee, Thread, Ticket } from '@team-x/shared-types';
import {
  BellRing,
  CheckCheck,
  Inbox,
  MessageSquareText,
  RefreshCw,
  TicketCheck,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { useThreadList } from '@/hooks/use-chat.js';
import { useEmployees } from '@/hooks/use-employees.js';
import { useTickets } from '@/hooks/use-tickets.js';
import { ipc } from '@/lib/ipc.js';
import { cn } from '@/lib/utils.js';
import { useAppStore } from '@/store/app-store.js';

const QUEUE_STORAGE_PREFIX = 'teamx.boardQueue.v1';
const MAX_VISIBLE_ITEMS = 12;
const BOARD_QUEUE_EVENT_TYPES = [
  'message.persisted',
  'message.agent_to_agent',
  'work.completed',
  'work.failed',
  'ticket.created',
  'ticket.updated',
  'ticket.assigned',
  'ticket.reopened',
  'ticket.commentAdded',
  'task.delegated',
  'task.escalated',
  'review.requested',
  'proactive.work_queued',
] as const;

const ATTENTION_LABELS = new Set([
  '@rocky',
  'rocky',
  'operator',
  'owner',
  'board',
  'review',
  'needs-review',
  'attention',
  'blocked',
  'approval',
  'human',
  'escalated',
]);

interface BoardQueueReadState {
  checkedAllBefore: number;
  threads: Record<string, number>;
  tickets: Record<string, number>;
}

type BoardQueueItem =
  | {
      kind: 'message';
      id: string;
      title: string;
      description: string;
      timestamp: number;
      thread: Thread;
      employeeId: string | null;
    }
  | {
      kind: 'ticket';
      id: string;
      title: string;
      description: string;
      timestamp: number;
      ticket: Ticket;
    };

function emptyQueueState(): BoardQueueReadState {
  return { checkedAllBefore: 0, threads: {}, tickets: {} };
}

function queueStorageKey(companyId: string): string {
  return `${QUEUE_STORAGE_PREFIX}.${companyId}`;
}

function readQueueState(companyId: string | null): BoardQueueReadState {
  if (!companyId || typeof window === 'undefined') return emptyQueueState();

  try {
    const raw = window.localStorage.getItem(queueStorageKey(companyId));
    if (!raw) return emptyQueueState();
    const parsed = JSON.parse(raw) as Partial<BoardQueueReadState>;
    return {
      checkedAllBefore: typeof parsed.checkedAllBefore === 'number' ? parsed.checkedAllBefore : 0,
      threads:
        parsed.threads && typeof parsed.threads === 'object' && !Array.isArray(parsed.threads)
          ? parsed.threads
          : {},
      tickets:
        parsed.tickets && typeof parsed.tickets === 'object' && !Array.isArray(parsed.tickets)
          ? parsed.tickets
          : {},
    };
  } catch {
    return emptyQueueState();
  }
}

function writeQueueState(companyId: string | null, state: BoardQueueReadState): void {
  if (!companyId || typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(queueStorageKey(companyId), JSON.stringify(state));
  } catch {
    // Read state is convenience-only. A storage failure should never block the cockpit.
  }
}

function isBoardQueueEvent(type: DashboardEvent['type']): boolean {
  return (BOARD_QUEUE_EVENT_TYPES as readonly string[]).includes(type);
}

function parseLabels(labelsJson: string): string[] {
  try {
    const parsed = JSON.parse(labelsJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((label): label is string => typeof label === 'string');
  } catch {
    return [];
  }
}

function ticketNeedsBoardAttention(ticket: Ticket): boolean {
  if (ticket.status === 'done') return false;
  if (ticket.status === 'blocked' || ticket.priority === 'critical') return true;
  if (ticket.reporterKind !== 'user') return true;

  return parseLabels(ticket.labelsJson).some((label) =>
    ATTENTION_LABELS.has(label.trim().toLowerCase()),
  );
}

function threadHasBoardAudience(thread: Thread): boolean {
  const hasUser = thread.members.some((member) => member.memberKind === 'user');
  const hasEmployee = thread.members.some((member) => member.memberKind === 'employee');
  return hasUser && hasEmployee && thread.lastMessageAt !== null;
}

function employeeNameMap(employees: Employee[]): Map<string, string> {
  return new Map(employees.map((employee) => [employee.id, employee.name]));
}

function threadEmployeeId(thread: Thread): string | null {
  return thread.members.find((member) => member.memberKind === 'employee')?.memberId ?? null;
}

function threadTitle(thread: Thread, employeeNames: Map<string, string>): string {
  if (thread.subject && thread.subject.trim().length > 0) return thread.subject;

  const names = thread.members
    .filter((member) => member.memberKind === 'employee')
    .map((member) => employeeNames.get(member.memberId) ?? member.memberId.slice(0, 8));

  if (names.length === 0) return 'Board message';
  if (names.length === 1) return `Message from ${names[0]}`;
  return `Message from ${names.slice(0, 2).join(' and ')}${names.length > 2 ? ' +' : ''}`;
}

function ticketDescription(ticket: Ticket): string {
  const labels = parseLabels(ticket.labelsJson);
  const labelText = labels.length > 0 ? ` . ${labels.slice(0, 2).join(', ')}` : '';
  return `${ticket.status.replace('-', ' ')} . ${ticket.priority}${labelText}`;
}

function isItemUnread(item: BoardQueueItem, state: BoardQueueReadState): boolean {
  const byKind = item.kind === 'message' ? state.threads[item.id] : state.tickets[item.id];
  const checkedAt = Math.max(state.checkedAllBefore, byKind ?? 0);
  return item.timestamp > checkedAt;
}

function itemRelativeTime(timestamp: number): string {
  const deltaMs = Math.max(0, Date.now() - timestamp);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (deltaMs < minute) return 'just now';
  if (deltaMs < hour) return `${Math.floor(deltaMs / minute)}m ago`;
  if (deltaMs < day) return `${Math.floor(deltaMs / hour)}h ago`;

  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function makeBoardItems(
  threads: Thread[],
  tickets: Ticket[],
  employees: Employee[],
): BoardQueueItem[] {
  const names = employeeNameMap(employees);

  const messageItems: BoardQueueItem[] = threads.filter(threadHasBoardAudience).map((thread) => ({
    kind: 'message',
    id: thread.id,
    title: threadTitle(thread, names),
    description:
      thread.kind === 'ticket' ? 'Ticket discussion updated' : 'Employee thread waiting in Chat',
    timestamp: thread.lastMessageAt ?? thread.createdAt,
    thread,
    employeeId: threadEmployeeId(thread),
  }));

  const ticketItems: BoardQueueItem[] = tickets.filter(ticketNeedsBoardAttention).map((ticket) => ({
    kind: 'ticket',
    id: ticket.id,
    title: ticket.title,
    description: ticketDescription(ticket),
    timestamp: ticket.updatedAt,
    ticket,
  }));

  return [...messageItems, ...ticketItems]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_VISIBLE_ITEMS);
}

export function BoardMessageQueue() {
  const companyId = useAppStore((state) => state.companyId);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const openThread = useAppStore((state) => state.openThread);
  const setActiveTicketId = useAppStore((state) => state.setActiveTicketId);
  const { data: threads = [], refetch: refetchThreads } = useThreadList(companyId);
  const { data: tickets = [], refetch: refetchTickets } = useTickets(companyId);
  const { data: employees = [] } = useEmployees(companyId);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [readState, setReadState] = useState<BoardQueueReadState>(() => readQueueState(companyId));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setReadState(readQueueState(companyId));
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;

    const unsubscribe = ipc.events.onDashboard((event: DashboardEvent) => {
      if (event.companyId !== companyId || !isBoardQueueEvent(event.type)) return;
      queryClient.invalidateQueries({ queryKey: ['threads', companyId] });
      queryClient.invalidateQueries({ queryKey: ['tickets', companyId] });
      queryClient.invalidateQueries({ queryKey: ['ticket-detail'] });
    });

    return unsubscribe;
  }, [companyId, queryClient]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const items = useMemo(
    () => makeBoardItems(threads, tickets, employees),
    [threads, tickets, employees],
  );
  const unreadCount = items.filter((item) => isItemUnread(item, readState)).length;
  const hasUnread = unreadCount > 0;

  function commitReadState(next: BoardQueueReadState): void {
    setReadState(next);
    writeQueueState(companyId, next);
  }

  function markItemChecked(item: BoardQueueItem): void {
    const next: BoardQueueReadState = {
      ...readState,
      threads: { ...readState.threads },
      tickets: { ...readState.tickets },
    };

    if (item.kind === 'message') {
      next.threads[item.id] = Math.max(next.threads[item.id] ?? 0, item.timestamp);
    } else {
      next.tickets[item.id] = Math.max(next.tickets[item.id] ?? 0, item.timestamp);
    }

    commitReadState(next);
  }

  function markAllChecked(): void {
    const next: BoardQueueReadState = {
      checkedAllBefore: Date.now(),
      threads: { ...readState.threads },
      tickets: { ...readState.tickets },
    };

    for (const item of items) {
      if (item.kind === 'message') next.threads[item.id] = item.timestamp;
      else next.tickets[item.id] = item.timestamp;
    }

    commitReadState(next);
  }

  function handleRefresh(): void {
    void refetchThreads();
    void refetchTickets();
  }

  function handleOpenItem(item: BoardQueueItem): void {
    markItemChecked(item);
    setOpen(false);

    if (item.kind === 'message') {
      setActiveView('chat');
      openThread({
        threadId: item.thread.id,
        isAgentThread: false,
        isCopilotThread: item.thread.isSystemAgent === true,
        employeeId: item.employeeId,
      });
      return;
    }

    setActiveView('tickets');
    setActiveTicketId(item.ticket.id);
  }

  return (
    <div ref={rootRef} className="relative" data-board-message-queue="">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={
          hasUnread ? `Open Board Message Queue, ${unreadCount} unread` : 'Open Board Message Queue'
        }
        aria-expanded={open}
        data-board-message-queue-button=""
        className={cn(
          'group flex h-11 shrink-0 items-center gap-2 rounded-[18px] border bg-black px-3 text-xs font-semibold transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
          hasUnread
            ? 'border-brand/45 text-red-50 shadow-[0_0_28px_-18px_hsl(var(--brand))]'
            : 'border-white/10 text-muted-foreground hover:border-brand/25 hover:text-foreground',
        )}
      >
        <span className="relative flex h-5 w-5 items-center justify-center">
          <span
            data-board-queue-led=""
            className={cn(
              'absolute h-2.5 w-2.5 rounded-full transition-all',
              hasUnread
                ? 'animate-pulse bg-brand shadow-[0_0_12px_hsl(var(--brand))]'
                : 'bg-white/20',
            )}
          />
          <BellRing
            className={cn('h-4 w-4 transition-colors', hasUnread ? 'text-brand' : 'text-white/60')}
          />
        </span>
        <span className="hidden 2xl:inline">Board Queue</span>
        <span className="2xl:hidden">Queue</span>
        <Badge
          variant="outline"
          className={cn(
            'min-w-7 justify-center border px-2 py-0 text-[10px] tabular-nums',
            hasUnread
              ? 'border-brand/55 bg-brand/15 text-red-50'
              : 'border-white/10 bg-black text-muted-foreground',
          )}
          aria-live="polite"
        >
          {unreadCount}
        </Badge>
      </button>

      {open ? (
        <div
          className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-[22px] border border-white/10 bg-black shadow-2xl shadow-black/70"
          data-board-message-queue-panel=""
        >
          <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Inbox className="h-4 w-4 text-brand" />
                <h3 className="text-sm font-semibold text-foreground">Board Message Queue</h3>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Messages and tickets that need your attention.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close Board Message Queue"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
            <Badge
              variant="outline"
              className={cn(
                'border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em]',
                hasUnread
                  ? 'border-brand/45 bg-brand/10 text-red-50'
                  : 'border-white/10 bg-black text-muted-foreground',
              )}
            >
              {unreadCount} unread
            </Badge>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="h-8 border-white/10 bg-black px-2.5 text-xs text-muted-foreground hover:border-white/20 hover:bg-black hover:text-foreground"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={markAllChecked}
                className="h-8 border-brand/25 bg-black px-2.5 text-xs text-red-50 hover:border-brand/45 hover:bg-black"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark checked
              </Button>
            </div>
          </div>

          <div className="max-h-[34rem] overflow-y-auto p-2 scrollbar-thin">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
                <Inbox className="h-8 w-8 text-white/25" />
                <p className="mt-3 text-sm font-semibold text-foreground">
                  No board messages waiting.
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  New employee messages, escalated tickets, and review requests will show here.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {items.map((item) => {
                  const unread = isItemUnread(item, readState);
                  const Icon = item.kind === 'message' ? MessageSquareText : TicketCheck;
                  return (
                    <button
                      key={`${item.kind}:${item.id}`}
                      type="button"
                      onClick={() => handleOpenItem(item)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-[16px] border p-3 text-left transition-all',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                        unread
                          ? 'border-brand/35 bg-brand/10 shadow-[inset_2px_0_0_hsl(var(--brand))]'
                          : 'border-white/10 bg-black hover:border-white/20',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border',
                          unread
                            ? 'border-brand/35 bg-brand/15 text-brand'
                            : 'border-white/10 bg-black text-muted-foreground',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {item.title}
                          </span>
                          {unread ? (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-brand shadow-[0_0_10px_hsl(var(--brand))]" />
                          ) : null}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          {item.description}
                        </span>
                      </span>
                      <span className="shrink-0 pt-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        {itemRelativeTime(item.timestamp)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
