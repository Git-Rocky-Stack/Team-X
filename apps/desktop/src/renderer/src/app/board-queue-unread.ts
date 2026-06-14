import type { DashboardEvent, Thread, Ticket } from '@team-x/shared-types';

import { notifyBoardQueueReadStateChanged } from './board-queue-read-state-events.js';

/**
 * Shared board-queue unread logic — the single source of truth for "what
 * counts as a board-attention item, and is it unread."
 *
 * Both surfaces that show the count derive it from these functions:
 *   - the BoardMessageQueue panel (`board-message-queue.tsx`)
 *   - the annunciator QUE lamp (`annunciator-rail-data.ts`)
 *
 * Keeping the rules here means the lamp can never silently disagree with the
 * panel. Display-only concerns (titles, descriptions, relative time, the
 * employee-name map) stay in `board-message-queue.tsx`; only the
 * count-bearing rules and the read-state persistence live here.
 */

export const QUEUE_STORAGE_PREFIX = 'teamx.boardQueue.v1';
export const MAX_VISIBLE_ITEMS = 12;

export const BOARD_QUEUE_EVENT_TYPES = [
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

export const ATTENTION_LABELS = new Set([
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

export interface BoardQueueReadState {
  checkedAllBefore: number;
  threads: Record<string, number>;
  tickets: Record<string, number>;
}

/** Minimal count-bearing shape — the rich `BoardQueueItem` (with titles and
 * descriptions) in `board-message-queue.tsx` is structurally assignable. */
export interface BoardQueueUnreadItem {
  kind: 'message' | 'ticket';
  id: string;
  timestamp: number;
}

export function emptyQueueState(): BoardQueueReadState {
  return { checkedAllBefore: 0, threads: {}, tickets: {} };
}

export function queueStorageKey(companyId: string): string {
  return `${QUEUE_STORAGE_PREFIX}.${companyId}`;
}

export function readQueueState(companyId: string | null): BoardQueueReadState {
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

export function writeQueueState(companyId: string | null, state: BoardQueueReadState): void {
  if (!companyId || typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(queueStorageKey(companyId), JSON.stringify(state));
    // Same-document `storage` events never fire (HTML spec), so broadcast the
    // change explicitly for same-window subscribers like the annunciator rail.
    notifyBoardQueueReadStateChanged(companyId);
  } catch {
    // Read state is convenience-only. A storage failure should never block the cockpit.
  }
}

export function isBoardQueueEvent(type: DashboardEvent['type']): boolean {
  return (BOARD_QUEUE_EVENT_TYPES as readonly string[]).includes(type);
}

export function parseLabels(labelsJson: string): string[] {
  try {
    const parsed = JSON.parse(labelsJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((label): label is string => typeof label === 'string');
  } catch {
    return [];
  }
}

export function ticketNeedsBoardAttention(ticket: Ticket): boolean {
  if (ticket.status === 'done') return false;
  if (ticket.status === 'blocked' || ticket.priority === 'critical') return true;
  if (ticket.reporterKind !== 'user') return true;

  return parseLabels(ticket.labelsJson).some((label) =>
    ATTENTION_LABELS.has(label.trim().toLowerCase()),
  );
}

export function threadHasBoardAudience(thread: Thread): boolean {
  const hasUser = thread.members.some((member) => member.memberKind === 'user');
  const hasEmployee = thread.members.some((member) => member.memberKind === 'employee');
  return hasUser && hasEmployee && thread.lastMessageAt !== null;
}

export function isItemUnread(item: BoardQueueUnreadItem, state: BoardQueueReadState): boolean {
  const byKind = item.kind === 'message' ? state.threads[item.id] : state.tickets[item.id];
  const checkedAt = Math.max(state.checkedAllBefore, byKind ?? 0);
  return item.timestamp > checkedAt;
}

export function makeBoardUnreadItems(threads: Thread[], tickets: Ticket[]): BoardQueueUnreadItem[] {
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
