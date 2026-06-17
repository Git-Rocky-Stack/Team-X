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
});
