import { useQueryClient } from '@tanstack/react-query';
import type { DashboardEvent, Thread, Ticket } from '@team-x/shared-types';
import { useEffect, useMemo, useState } from 'react';

import type { AnnunciatorInputs } from './annunciator-signals.js';

import { summarizeRuntimeOperationsForDashboard } from '@/features/dashboard/runtime-operations-projections.js';
import { useApprovals } from '@/hooks/use-approvals.js';
import { useBudgetOverview } from '@/hooks/use-budgets.js';
import { useThreadList } from '@/hooks/use-chat.js';
import { useMeetings } from '@/hooks/use-meetings.js';
import { useRuntimeOperations } from '@/hooks/use-runtime-operations.js';
import { useTickets } from '@/hooks/use-tickets.js';
import { ipc } from '@/lib/ipc.js';
import { useAppStore } from '@/store/app-store.js';

/**
 * Live hook seam for the AnnunciatorRail. Composes the SAME signals their
 * owning surfaces read — board-queue unread (BoardMessageQueue), runtime
 * posture (useRuntimeOperations), budget overview (useBudgetOverview),
 * pending approvals (useApprovals), and active meetings (useMeetings) — into
 * the pure `AnnunciatorInputs` that `deriveAnnunciatorTiles` consumes.
 *
 * Loading / no-company states resolve to CALM defaults (0 counts, runtime
 * `default`, budget not configured) so the rail renders truthfully while
 * data is in flight — a lamp never blinks on missing data, only on a real
 * signal.
 *
 * This file is the module the mount test mocks; it owns ALL the React-Query /
 * store coupling so `annunciator-rail-mount.tsx` stays a pure wiring shell.
 */

// ── Board-queue unread derivation ───────────────────────────────────────────
// Faithful replica of BoardMessageQueue's private unread logic. The board
// queue owns the canonical implementation (board-message-queue.tsx); this
// mirrors the minimal slice the annunciator needs WITHOUT refactoring that
// component. Keep the two in sync if the queue's rules change.

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

interface BoardQueueUnreadItem {
  kind: 'message' | 'ticket';
  id: string;
  timestamp: number;
}

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

function makeBoardUnreadItems(threads: Thread[], tickets: Ticket[]): BoardQueueUnreadItem[] {
  const messageItems: BoardQueueUnreadItem[] = threads
    .filter(threadHasBoardAudience)
    .map((thread) => ({
      kind: 'message',
      id: thread.id,
      timestamp: thread.lastMessageAt ?? thread.createdAt,
    }));

  const ticketItems: BoardQueueUnreadItem[] = tickets
    .filter(ticketNeedsBoardAttention)
    .map((ticket) => ({
      kind: 'ticket',
      id: ticket.id,
      timestamp: ticket.updatedAt,
    }));

  return [...messageItems, ...ticketItems]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_VISIBLE_ITEMS);
}

function isItemUnread(item: BoardQueueUnreadItem, state: BoardQueueReadState): boolean {
  const byKind = item.kind === 'message' ? state.threads[item.id] : state.tickets[item.id];
  const checkedAt = Math.max(state.checkedAllBefore, byKind ?? 0);
  return item.timestamp > checkedAt;
}

function useBoardQueueUnread(companyId: string | null): number {
  const { data: threads = [] } = useThreadList(companyId);
  const { data: tickets = [] } = useTickets(companyId);
  // Employees feed BoardMessageQueue's display titles only — the unread
  // COUNT never depends on them, so they're intentionally not read here.
  const queryClient = useQueryClient();
  const [readState, setReadState] = useState<BoardQueueReadState>(() => readQueueState(companyId));

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

  // The board-queue read marker also lives in localStorage and is mutated by
  // BoardMessageQueue. Re-read it on a 'storage' event so the lamp settles
  // when the user marks items checked in the open panel.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    function onStorage(event: StorageEvent) {
      if (event.key === null || event.key.startsWith(QUEUE_STORAGE_PREFIX)) {
        setReadState(readQueueState(companyId));
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [companyId]);

  return useMemo(() => {
    const items = makeBoardUnreadItems(threads, tickets);
    return items.filter((item) => isItemUnread(item, readState)).length;
  }, [threads, tickets, readState]);
}

// ── Budget posture ──────────────────────────────────────────────────────────
// The annunciator only needs threshold posture, not dollar figures. The
// overview's server-computed alert counts are authoritative: `exceededCount`
// means a policy crossed 100% (warn+alert), `warningCount` means ≥ warning
// threshold (hold). `usedPct` is mapped to the band the signals layer keys on.

function budgetPeriodKey(period: string, periodStartAt: number): string {
  return `${period}:${periodStartAt}`;
}

// ── Approvals posture ────────────────────────────────────────────────────────
// Mirror ApprovalsPanel: fetch all approvals for the company and count the
// `pending` ones client-side. Newest pending (by createdAt) fingerprints the
// alert so a NEW approval re-blinks after an earlier ack.

function newestPendingApprovalId(
  approvals: { id: string; status: string; createdAt: number }[],
): string | null {
  let newest: { id: string; createdAt: number } | null = null;
  for (const item of approvals) {
    if (item.status !== 'pending') continue;
    if (newest === null || item.createdAt > newest.createdAt) {
      newest = { id: item.id, createdAt: item.createdAt };
    }
  }
  return newest?.id ?? null;
}

export interface AnnunciatorData {
  inputs: AnnunciatorInputs;
  setActiveView: ReturnType<typeof useAppStore.getState>['setActiveView'];
  ackAnnunciator: ReturnType<typeof useAppStore.getState>['ackAnnunciator'];
}

/**
 * Composes the live renderer signals into `AnnunciatorInputs` plus the two
 * store handlers the rail mount needs. Every branch resolves to a calm
 * default while data is loading or no company is selected.
 */
export function useAnnunciatorData(): AnnunciatorData {
  const companyId = useAppStore((state) => state.companyId);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const ackAnnunciator = useAppStore((state) => state.ackAnnunciator);
  const acked = useAppStore((state) => state.ackedAnnunciators);

  const queueUnread = useBoardQueueUnread(companyId);

  const { data: runtimeSnapshot } = useRuntimeOperations(companyId);
  const runtimeSummary = useMemo(
    () => summarizeRuntimeOperationsForDashboard(runtimeSnapshot),
    [runtimeSnapshot],
  );

  const { data: budgetOverview } = useBudgetOverview(companyId);
  const { data: approvals = [] } = useApprovals(companyId);
  const { data: meetings = [] } = useMeetings(companyId);

  const inputs = useMemo<AnnunciatorInputs>(() => {
    const configured = (budgetOverview?.activePolicyCount ?? 0) > 0;
    // Worst-case band from the overview's authoritative alert counts.
    const usedPct =
      (budgetOverview?.exceededCount ?? 0) > 0
        ? 100
        : (budgetOverview?.warningCount ?? 0) > 0
          ? 80
          : 0;
    const periodKey = budgetOverview
      ? budgetPeriodKey(budgetOverview.period, budgetOverview.periodStartAt)
      : '';

    const pendingApprovals = approvals.filter((item) => item.status === 'pending');

    return {
      queueUnread,
      runtime: {
        stateTone: runtimeSummary.stateTone,
        sessionCount: runtimeSummary.sessionCount,
      },
      budget: { configured, usedPct, periodKey },
      approvalsPending: pendingApprovals.length,
      approvalsNewestId: newestPendingApprovalId(approvals),
      meetingsActive: meetings.filter((meeting) => meeting.status === 'active').length,
      acked,
    };
  }, [queueUnread, runtimeSummary, budgetOverview, approvals, meetings, acked]);

  return { inputs, setActiveView, ackAnnunciator };
}
