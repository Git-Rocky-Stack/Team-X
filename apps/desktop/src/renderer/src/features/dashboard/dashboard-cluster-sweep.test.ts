import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(join(here, file), 'utf8');

const subtabsSrc = read('dashboard-subtabs.tsx');
const streamSrc = read('stream-view.tsx');
const cardsSrc = read('cards-view.tsx');
const employeeCardSrc = read('employee-card.tsx');
const timelineSrc = read('timeline-view.tsx');
const floorSrc = read('floor-view.tsx');
const commandsSrc = read('commands-view.tsx');

describe('dashboard cluster aesthetic sweep (Phase 3)', () => {
  it('reads every swept sub-view source', () => {
    for (const src of [
      subtabsSrc,
      streamSrc,
      cardsSrc,
      employeeCardSrc,
      timelineSrc,
      floorSrc,
      commandsSrc,
    ]) {
      expect(typeof src).toBe('string');
      expect(src.length).toBeGreaterThan(0);
    }
  });

  it('subtabs use the nav-tile rail and keep label accessible names', () => {
    expect(subtabsSrc).toContain(
      "{ label: 'Mission Control', icon: LayoutGrid, subview: 'cards' }",
    );
    expect(subtabsSrc).toContain('nav-tile');
    expect(subtabsSrc).toContain('nav-tile-active');
    expect(subtabsSrc).not.toMatch(/\bbg-black\b/);
    expect(subtabsSrc).not.toContain('border-white/10');
    expect(subtabsSrc).not.toContain('rounded-full');
    expect(subtabsSrc).not.toContain('border-brand/30');
  });

  it('stream view uses console panes, a display well, and the concurrency VU meter', () => {
    expect(streamSrc).toContain('<VuMeter');
    expect(streamSrc).toContain('label="Live stream concurrency"');
    expect(streamSrc).toContain('thinkingCount / employees.length');
    expect(streamSrc).toContain('<LampTile');
    expect(streamSrc).not.toMatch(/\bbg-black\b/);
    expect(streamSrc).not.toContain('bg-zinc-500');
    expect(streamSrc).not.toContain('text-code-sm leading-relaxed text-foreground/80');
  });

  it('cards view + employee card use console hardware and keep the a11y label', () => {
    expect(cardsSrc).not.toMatch(/\bbg-black\b/);
    expect(cardsSrc).not.toContain('text-red-500');
    expect(cardsSrc).toContain('<RecessedWell');
    expect(employeeCardSrc).toContain('${employee.title} — ${statusLabel(displayStatus)}');
    expect(employeeCardSrc).toContain(". Click to ${isSelected ? 'close' : 'open'} chat.");
    expect(employeeCardSrc).toContain('title={statusLabel(displayStatus)}');
    expect(employeeCardSrc).toContain("'cap-select'");
    expect(employeeCardSrc).toContain('<LampTile');
    expect(employeeCardSrc).not.toMatch(/\bbg-black\b/);
    expect(employeeCardSrc).not.toContain('font-mono');
    expect(employeeCardSrc).not.toContain('text-[11px]');
  });

  it('timeline view uses stripe bands + lamp event tones', () => {
    expect(timelineSrc).not.toMatch(/\bbg-black\b/);
    expect(timelineSrc).not.toMatch(/text-(?:blue|green|red|purple|amber|cyan)-\d/);
    expect(timelineSrc).toContain('<StripeHeader');
  });
});
