import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');

// Raw Tailwind palette colors the recompose must replace with console tones.
// (Carbon tokens — brand / surface / muted / silver / led-* / armed — are retained.)
const RAW_PALETTE =
  /-(?:red|orange|amber|yellow|green|emerald|teal|sky|blue|indigo|violet|fuchsia|zinc|slate|stone|gray|neutral)-\d{2,3}\b/;

function expectNoLegacy(src: string, file: string) {
  expect(src, `${file}: mission-shell import`).not.toContain('mission-shell');
  expect(src, `${file}: Mission* primitive`).not.toMatch(/\bMission[A-Z]\w+/);
  expect(src, `${file}: mission-select`).not.toContain('mission-select');
  expect(src, `${file}: mission-chrome-panel`).not.toContain('mission-chrome-panel');
  expect(src, `${file}: bg-black`).not.toMatch(/\bbg-black\b/);
  expect(src, `${file}: border-white/N`).not.toMatch(/border-white\/\d/);
  expect(src, `${file}: font-mono`).not.toContain('font-mono');
  expect(src, `${file}: rounded-[Npx]`).not.toMatch(/rounded-\[\d+px\]/);
  expect(src, `${file}: rounded-full`).not.toMatch(/\brounded-full\b/);
  expect(src, `${file}: raw palette color`).not.toMatch(RAW_PALETTE);
}

describe('boards & planning cluster sweep (Phase 5a)', () => {
  describe('ticket-card', () => {
    it('console hardware + lamp priority + selector preserved, no legacy', () => {
      const src = read('tickets/ticket-card.tsx');
      expect(src).toContain("from '@/components/console");
      expect(src).toContain('<RecessedWell');
      expect(src).toContain('<LampTile');
      expect(src).toContain('<Tag');
      expect(src).toContain('data-ticket-card={ticket.id}');
      expectNoLegacy(src, 'ticket-card.tsx');
    });
  });

  describe('kanban-board', () => {
    it('console lanes + lamp status + selectors preserved, no legacy', () => {
      const src = read('tickets/kanban-board.tsx');
      expect(src).toContain("from '@/components/console");
      expect(src).toContain('<RecessedWell');
      expect(src).toContain('<LampTile');
      expect(src).toContain('data-tickets-board=""');
      expect(src).toContain('data-tickets-column={column.status}');
      expect(src).toContain('aria-label="Create ticket"');
      expectNoLegacy(src, 'kanban-board.tsx');
    });
  });

  describe('create-ticket-dialog', () => {
    it('well-input fields + dialog selectors preserved, no legacy', () => {
      const src = read('tickets/create-ticket-dialog.tsx');
      expect(src).toContain('well-input');
      expect(src).toContain('aria-hidden={!open}');
      expect(src).toContain('role="presentation"');
      for (const id of [
        'ticket-title',
        'ticket-desc',
        'ticket-priority',
        'ticket-assignee',
        'ticket-due-date',
      ]) {
        expect(src, `missing id ${id}`).toContain(id);
      }
      expectNoLegacy(src, 'create-ticket-dialog.tsx');
    });
  });

  describe('ticket-detail', () => {
    it('console hardware + lamps + selectors preserved, no legacy', () => {
      const src = read('tickets/ticket-detail.tsx');
      expect(src).toContain("from '@/components/console");
      expect(src).toContain('<LampTile');
      expect(src).toContain('<Tag');
      expect(src).toContain('<SubviewState');
      expect(src).toContain('data-ticket-detail=""');
      expect(src).toContain('data-ticket-detail-state="loading"');
      expect(src).toContain('data-ticket-participants=""');
      for (const a of [
        'Close detail',
        'Add ticket participant',
        'Add selected employee to ticket',
        'Remove attachment',
      ]) {
        expect(src, `missing aria ${a}`).toContain(a);
      }
      expect(src).toContain('from ticket'); // the `Remove ${name} from ticket` template
      expectNoLegacy(src, 'ticket-detail.tsx');
    });
  });

  describe('tickets-view', () => {
    it('console hardware replaces all Mission*, selectors preserved, no legacy', () => {
      const src = read('tickets/tickets-view.tsx');
      expect(src).toContain("from '@/components/console");
      expect(src).toContain('<MetricTile');
      expect(src).toContain('<SubviewState');
      expect(src).toMatch(/<Faceplate|<StripeHeader/);
      expect(src).toContain('data-tickets-view=""');
      expect(src).toContain('data-tickets-board-shell=""');
      for (const s of ['no-company', 'loading', 'error', 'empty', 'detail-idle']) {
        expect(src, `missing state ${s}`).toContain(`data-tickets-view-state="${s}"`);
      }
      expectNoLegacy(src, 'tickets-view.tsx');
    });
  });

  describe('project-card', () => {
    it('console card + lamp priority + Tag, no legacy', () => {
      const src = read('projects/project-card.tsx');
      expect(src).toContain("from '@/components/console");
      expect(src).toContain('<RecessedWell');
      expect(src).toContain('<LampTile');
      expect(src).toContain('<Tag');
      expectNoLegacy(src, 'project-card.tsx');
    });
  });

  describe('projects-kanban', () => {
    it('console lanes + lamp status + selector preserved, no legacy', () => {
      const src = read('projects/projects-kanban.tsx');
      expect(src).toContain("from '@/components/console");
      expect(src).toContain('<RecessedWell');
      expect(src).toContain('<LampTile');
      expect(src).toContain('aria-label="Create project"');
      expectNoLegacy(src, 'projects-kanban.tsx');
    });
  });

  describe('projects-subtabs', () => {
    it('nav-tile recipe + aria-current added, no legacy', () => {
      const src = read('projects/projects-subtabs.tsx');
      expect(src).toContain('nav-tile');
      expect(src).toContain('aria-current');
      expectNoLegacy(src, 'projects-subtabs.tsx');
    });
  });

  describe('projects-view', () => {
    it('SubviewState for loading/error, no legacy', () => {
      const src = read('projects/projects-view.tsx');
      expect(src).toContain("from '@/components/console");
      expect(src).toContain('<SubviewState');
      expectNoLegacy(src, 'projects-view.tsx');
    });
  });

  describe('project-detail', () => {
    it('VU progress + lamps + well-input + selectors preserved, no legacy', () => {
      const src = read('projects/project-detail.tsx');
      expect(src).toContain("from '@/components/console");
      expect(src).toContain('<VuMeter');
      expect(src).toContain('<LampTile');
      expect(src).toContain('well-input');
      for (const a of ['Close detail panel', 'Delete project']) {
        expect(src, `missing aria ${a}`).toContain(a);
      }
      for (const id of [
        'project-edit-title',
        'project-edit-description',
        'project-edit-status',
        'project-edit-priority',
        'project-edit-lead',
        'project-edit-goal',
        'project-edit-target-date',
      ]) {
        expect(src, `missing id ${id}`).toContain(id);
      }
      expectNoLegacy(src, 'project-detail.tsx');
    });
  });
});
