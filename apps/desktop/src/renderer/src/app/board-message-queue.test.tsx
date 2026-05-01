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

describe('BoardMessageQueue', () => {
  it('ships a persistent flashing toolbar indicator for unread board messages', () => {
    const src = readFileSync(BOARD_QUEUE_PATH, 'utf8');

    expect(src).toContain("const QUEUE_STORAGE_PREFIX = 'teamx.boardQueue.v1'");
    expect(src).toContain('data-board-message-queue-button');
    expect(src).toContain('data-board-queue-led');
    expect(src).toContain('animate-pulse');
    expect(src).toContain('Board Message Queue');
    expect(src).toContain('Mark checked');
  });

  it('subscribes to message, ticket, review, and proactive work events', () => {
    const src = readFileSync(BOARD_QUEUE_PATH, 'utf8');

    expect(src).toContain('ipc.events.onDashboard');
    expect(src).toContain("'message.persisted'");
    expect(src).toContain("'work.completed'");
    expect(src).toContain("'ticket.created'");
    expect(src).toContain("'ticket.updated'");
    expect(src).toContain("'ticket.commentAdded'");
    expect(src).toContain("'review.requested'");
    expect(src).toContain("'proactive.work_queued'");
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
    const src = readFileSync(BOARD_QUEUE_PATH, 'utf8');

    expect(src).toContain('function threadHasBoardAudience(thread: Thread): boolean');
    expect(src).toContain('const hasUser = thread.members.some');
    expect(src).toContain('function ticketNeedsBoardAttention(ticket: Ticket): boolean');
    expect(src).toContain("'@rocky'");
    expect(src).toContain("'operator'");
    expect(src).toContain("'approval'");
  });
});

describe('TopBar BoardMessageQueue mount', () => {
  it('renders the board queue immediately to the left of the Strategia-X logo', () => {
    const src = readFileSync(TOP_BAR_PATH, 'utf8');

    expect(src).toContain("import { BoardMessageQueue } from './board-message-queue.js';");
    expect(src).toMatch(/<BoardMessageQueue\s*\/>[\s\S]*<img[\s\S]*src=\{brandLogo\}/);
  });
});
