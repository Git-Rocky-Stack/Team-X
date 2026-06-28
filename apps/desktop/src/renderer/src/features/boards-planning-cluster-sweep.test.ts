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
});
