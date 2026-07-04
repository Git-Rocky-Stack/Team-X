import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const ticketsViewSrc = readFileSync(join(currentDirname, 'tickets-view.tsx'), 'utf8');
const boardSrc = readFileSync(join(currentDirname, 'kanban-board.tsx'), 'utf8');
const detailSrc = readFileSync(join(currentDirname, 'ticket-detail.tsx'), 'utf8');

describe('Tickets view composition + behavior carry-forward', () => {
  it('wraps the page in console primitives (Command Console sweep, Phase 5a)', () => {
    expect(ticketsViewSrc).toContain('data-tickets-view=""');
    expect(ticketsViewSrc).toContain('<Faceplate');
    expect(ticketsViewSrc).toContain('<MetricTile');
    expect(ticketsViewSrc).toContain('<SubviewState');
    // Legacy mission-shell composition is fully retired here.
    expect(ticketsViewSrc).not.toContain('mission-shell');
    expect(ticketsViewSrc).not.toMatch(/\bMission[A-Z]\w+/);
  });

  it('pins the localized loading, error, empty, and no-company states', () => {
    for (const selector of [
      'data-tickets-view-state="no-company"',
      'data-tickets-view-state="loading"',
      'data-tickets-view-state="error"',
      'data-tickets-view-state="empty"',
      'data-tickets-view-state="detail-idle"',
    ]) {
      expect(ticketsViewSrc).toContain(selector);
    }
  });

  it('keeps the board and detail behavior but with mission styling hooks', () => {
    expect(ticketsViewSrc).toContain('<KanbanBoard');
    expect(ticketsViewSrc).toContain('<TicketDetailPanel');
    expect(boardSrc).toContain('data-tickets-board=""');
    expect(boardSrc).toContain('data-tickets-column={column.status}');
    expect(detailSrc).toContain('data-ticket-detail=""');
    expect(detailSrc).toContain('data-ticket-detail-state="loading"');
    expect(detailSrc).toContain(
      "import { ThreadMemoryCard } from '@/features/memory/thread-memory-card.js';",
    );
    expect(detailSrc).toContain('<ThreadMemoryCard');
    expect(detailSrc).toContain('detail.threadId');
    expect(detailSrc).toContain('title="Ticket memory"');
    expect(detailSrc).toContain('data-ticket-participants=""');
    expect(detailSrc).toContain('useAddTicketParticipant');
    expect(detailSrc).toContain('useRemoveTicketParticipant');
    expect(detailSrc).toContain('onClose?: () => void;');
    expect(detailSrc).toContain('const closeDetail = onClose ?? (() => setActiveTicketId(null));');
    expect(detailSrc).toContain('onClick={closeDetail}');
  });
});
