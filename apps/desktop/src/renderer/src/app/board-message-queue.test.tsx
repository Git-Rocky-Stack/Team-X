/**
 * Board Message Queue source guards.
 *
 * The queue is intentionally mounted in the persistent top toolbar so
 * operator-directed messages and attention tickets do not require menu
 * drilling. These tests keep the behavior source-level and cheap to run,
 * matching the renderer test convention used by `top-bar.test.tsx`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentFilename = fileURLToPath(import.meta.url);
const currentDirname = dirname(currentFilename);
const BOARD_QUEUE_PATH = join(currentDirname, 'board-message-queue.tsx');
const TOP_BAR_PATH = join(currentDirname, 'top-bar.tsx');
// Sweep Phase 2 review: the count-bearing rules + subscription were extracted
// to a shared module + hook so the annunciator QUE lamp can never disagree
// with the panel. The contract below now spans those files.
const UNREAD_LOGIC_PATH = join(currentDirname, 'board-queue-unread.ts');
const SYNC_HOOK_PATH = join(currentDirname, '..', 'hooks', 'use-board-queue-events.ts');

describe('BoardMessageQueue', () => {
  it('ships a persistent flashing toolbar indicator for unread board messages', () => {
    const src = readFileSync(BOARD_QUEUE_PATH, 'utf8');

    expect(src).toContain("from './board-queue-unread.js'");
    expect(src).toContain('data-board-message-queue-button');
    expect(src).toContain('data-board-queue-led');
    expect(src).toContain('animate-pulse');
    expect(src).toContain('Board Message Queue');
    expect(src).toContain('Mark checked');
  });

  it('derives unread state from the shared board-queue module (single source of truth)', () => {
    const shared = readFileSync(UNREAD_LOGIC_PATH, 'utf8');

    expect(shared).toContain("export const QUEUE_STORAGE_PREFIX = 'teamx.boardQueue.v1'");
    expect(shared).toContain('export function isItemUnread(');
    expect(shared).toContain('export function makeBoardUnreadItems(');
  });

  it('subscribes to message, ticket, review, and proactive work events via the shared sync hook', () => {
    const board = readFileSync(BOARD_QUEUE_PATH, 'utf8');
    const hook = readFileSync(SYNC_HOOK_PATH, 'utf8');
    const shared = readFileSync(UNREAD_LOGIC_PATH, 'utf8');

    expect(board).toContain('useBoardQueueEventSync(companyId)');
    expect(hook).toContain('ipc.events.onDashboard');
    expect(shared).toContain("'message.persisted'");
    expect(shared).toContain("'work.completed'");
    expect(shared).toContain("'ticket.created'");
    expect(shared).toContain("'ticket.updated'");
    expect(shared).toContain("'ticket.commentAdded'");
    expect(shared).toContain("'review.requested'");
    expect(shared).toContain("'proactive.work_queued'");
  });

  it('opens queued messages in Chat and attention tickets in Tickets', () => {
    const src = readFileSync(BOARD_QUEUE_PATH, 'utf8');

    expect(src).toContain('markItemChecked(item)');
    expect(src).toContain("setActiveView('chat')");
    expect(src).toContain('openThread({');
    expect(src).toContain("setActiveView('tickets')");
    expect(src).toContain('setActiveTicketId(item.ticket.id)');
  });

  it('detects operator-addressed thread and ticket attention sources', () => {
    const shared = readFileSync(UNREAD_LOGIC_PATH, 'utf8');

    expect(shared).toContain('export function threadHasBoardAudience(thread: Thread): boolean');
    expect(shared).toContain('const hasUser = thread.members.some');
    expect(shared).toContain('export function ticketNeedsBoardAttention(ticket: Ticket): boolean');
    expect(shared).toContain("'@rocky'");
    expect(shared).toContain("'operator'");
    expect(shared).toContain("'approval'");
  });
});

describe('TopBar BoardMessageQueue mount', () => {
  it('renders the board queue immediately to the left of the Strategia-X logo', () => {
    const src = readFileSync(TOP_BAR_PATH, 'utf8');

    expect(src).toContain("import { BoardMessageQueue } from './board-message-queue.js';");
    expect(src).toMatch(/<BoardMessageQueue\s*\/>[\s\S]*<img[\s\S]*src=\{brandLogo\}/);
  });
});
