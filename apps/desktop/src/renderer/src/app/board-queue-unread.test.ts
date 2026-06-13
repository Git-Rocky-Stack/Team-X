/**
 * Shared board-queue unread logic — pure-function tests.
 *
 * These rules feed BOTH the BoardMessageQueue panel and the annunciator QUE
 * lamp, so a regression here desyncs the lamp from the panel. Node env: every
 * function under test is pure (no window / localStorage).
 */
import type { DashboardEvent, Thread, Ticket } from '@team-x/shared-types';
import { describe, expect, it } from 'vitest';

import {
  type BoardQueueReadState,
  MAX_VISIBLE_ITEMS,
  isBoardQueueEvent,
  isItemUnread,
  makeBoardUnreadItems,
  parseLabels,
  threadHasBoardAudience,
  ticketNeedsBoardAttention,
} from './board-queue-unread';

const boardThread = (over: Partial<Thread> = {}): Thread =>
  ({
    id: 't1',
    createdAt: 100,
    lastMessageAt: 200,
    members: [
      { memberKind: 'user', memberId: 'u1' },
      { memberKind: 'employee', memberId: 'e1' },
    ],
    ...over,
  }) as unknown as Thread;

const attentionTicket = (over: Partial<Ticket> = {}): Ticket =>
  ({
    id: 'k1',
    status: 'blocked',
    priority: 'high',
    reporterKind: 'user',
    labelsJson: '[]',
    updatedAt: 300,
    ...over,
  }) as unknown as Ticket;

describe('isBoardQueueEvent', () => {
  it('matches board-relevant events and rejects unrelated ones', () => {
    expect(isBoardQueueEvent('message.persisted' as DashboardEvent['type'])).toBe(true);
    expect(isBoardQueueEvent('proactive.work_queued' as DashboardEvent['type'])).toBe(true);
    expect(isBoardQueueEvent('goal.progressChanged' as DashboardEvent['type'])).toBe(false);
  });
});

describe('parseLabels', () => {
  it('returns the string array for valid JSON, [] otherwise', () => {
    expect(parseLabels('["approval","blocked"]')).toEqual(['approval', 'blocked']);
    expect(parseLabels('not json')).toEqual([]);
    expect(parseLabels('{"x":1}')).toEqual([]);
    expect(parseLabels('[1, "ok", null]')).toEqual(['ok']);
  });
});

describe('ticketNeedsBoardAttention', () => {
  it('ignores done tickets even when otherwise urgent', () => {
    expect(
      ticketNeedsBoardAttention(attentionTicket({ status: 'done', priority: 'critical' })),
    ).toBe(false);
  });
  it('flags blocked, critical, and non-user-reported tickets', () => {
    expect(ticketNeedsBoardAttention(attentionTicket({ status: 'blocked' }))).toBe(true);
    expect(
      ticketNeedsBoardAttention(attentionTicket({ status: 'open', priority: 'critical' })),
    ).toBe(true);
    expect(
      ticketNeedsBoardAttention(
        attentionTicket({ status: 'open', priority: 'high', reporterKind: 'system' }),
      ),
    ).toBe(true);
  });
  it('flags a plain user ticket only when it carries an attention label', () => {
    const plain = attentionTicket({ status: 'open', priority: 'high', reporterKind: 'user' });
    expect(ticketNeedsBoardAttention({ ...plain, labelsJson: '[]' })).toBe(false);
    expect(ticketNeedsBoardAttention({ ...plain, labelsJson: '["Approval"]' })).toBe(true);
  });
});

describe('threadHasBoardAudience', () => {
  it('requires a user member, an employee member, and a last message', () => {
    expect(threadHasBoardAudience(boardThread())).toBe(true);
    expect(
      threadHasBoardAudience(boardThread({ members: [{ memberKind: 'user', memberId: 'u1' }] })),
    ).toBe(false);
    expect(threadHasBoardAudience(boardThread({ lastMessageAt: null }))).toBe(false);
  });
});

describe('isItemUnread', () => {
  const item = { kind: 'message', id: 't1', timestamp: 200 } as const;
  it('is unread when the timestamp beats every checkpoint', () => {
    expect(isItemUnread(item, { checkedAllBefore: 0, threads: {}, tickets: {} })).toBe(true);
  });
  it('respects the global checkedAllBefore checkpoint', () => {
    expect(isItemUnread(item, { checkedAllBefore: 250, threads: {}, tickets: {} })).toBe(false);
  });
  it('respects a per-item checkpoint and takes the later of the two', () => {
    const state: BoardQueueReadState = { checkedAllBefore: 0, threads: { t1: 250 }, tickets: {} };
    expect(isItemUnread(item, state)).toBe(false);
    expect(isItemUnread(item, { ...state, threads: { t1: 150 } })).toBe(true);
  });
});

describe('makeBoardUnreadItems', () => {
  it('sorts newest-first and caps at MAX_VISIBLE_ITEMS', () => {
    const tickets = Array.from({ length: MAX_VISIBLE_ITEMS + 2 }, (_unused, i) =>
      attentionTicket({ id: `k${i}`, updatedAt: i + 1 }),
    );
    const items = makeBoardUnreadItems([], tickets);
    expect(items).toHaveLength(MAX_VISIBLE_ITEMS);
    expect(items[0]?.timestamp).toBe(MAX_VISIBLE_ITEMS + 2);
    expect(items[0]?.timestamp).toBeGreaterThan(items[1]?.timestamp ?? 0);
  });
  it('drops threads without board audience and non-attention tickets', () => {
    const items = makeBoardUnreadItems(
      [boardThread({ id: 'keep' }), boardThread({ id: 'drop', lastMessageAt: null })],
      [attentionTicket({ id: 'kt', status: 'blocked' })],
    );
    expect(items.map((i) => i.id).sort()).toEqual(['keep', 'kt']);
  });
});
