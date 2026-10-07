import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(join(here, file), 'utf8');

const subtabsSrc = read('dashboard-subtabs.tsx');
const streamSrc = read('stream-view.tsx');
const timelineSrc = read('timeline-view.tsx');
const floorSrc = read('floor-view.tsx');
const commandsSrc = read('commands-view.tsx');

describe('dashboard cluster aesthetic sweep (Phase 3)', () => {
  it('reads every swept sub-view source', () => {
    for (const src of [subtabsSrc, streamSrc, timelineSrc, floorSrc, commandsSrc]) {
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
    // Active subview must be announced to assistive tech, not signalled by
    // class alone (gate review P2).
    expect(subtabsSrc).toContain("aria-current={isActive ? 'page' : undefined}");
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

  it('keeps the retired CardsView deleted', () => {
    // The Mission Control subview is rendered by `MissionControlDashboard`;
    // `CardsView` was retired in its favour (see app/sidenav.tsx) but the file
    // lingered unmounted. Pin its absence so the sweep cannot silently start
    // grading dead code again.
    expect(existsSync(join(here, 'cards-view.tsx'))).toBe(false);
  });

  it('keeps the orphaned EmployeeCard deleted', () => {
    // `EmployeeCard` was swept in Phase 3 and then left with zero importers
    // when `CardsView` retired — graded dead code ever since. Deleted
    // 2026-08-23; pinned absent for the same reason `cards-view.tsx` is.
    //
    // It co-owned the employee aria-label contract that smoke / rag-flow /
    // ticket-flow pin as `button[aria-label^="{name}, {title}"]`. That
    // contract did not die with it: `app/sidenav.tsx` is now its sole
    // carrier, and `app/shell-foundation.test.tsx` pins the format there.
    expect(existsSync(join(here, 'employee-card.tsx'))).toBe(false);
  });

  it('timeline view uses stripe bands + lamp event tones', () => {
    expect(timelineSrc).not.toMatch(/\bbg-black\b/);
    expect(timelineSrc).not.toMatch(/text-(?:blue|green|red|purple|amber|cyan)-\d/);
    expect(timelineSrc).toContain('<StripeHeader');
  });

  it('floor view uses Faceplate, stripe level bands, LED status + LCD counts, no replace hack', () => {
    expect(floorSrc).toContain('<Faceplate');
    expect(floorSrc).toContain('<StripeHeader');
    expect(floorSrc).toContain('<LcdWell');
    expect(floorSrc).not.toMatch(/\bbg-black\b/);
    expect(floorSrc).not.toMatch(/(?:border|bg)-(?:amber|purple|blue|cyan|green|zinc|red)-\d/);
    expect(floorSrc).not.toContain(".replace('bg-', 'bg-')");
    expect(floorSrc).not.toContain('text-[9px]');
    expect(floorSrc).not.toContain('text-[10px]');
  });

  it('commands view swept while preserving every E2E selector and button rows', () => {
    expect(commandsSrc).toContain('data-testid="commands-view"');
    expect(commandsSrc).toContain('data-testid="commands-list"');
    expect(commandsSrc).toContain('data-testid="commands-loading"');
    expect(commandsSrc).toContain('aria-busy="true"');
    expect(commandsSrc).toContain('data-testid="commands-empty-state"');
    expect(commandsSrc).toContain('data-testid="commands-error-state"');
    expect(commandsSrc).toContain('<CommandRow key={entry.id} entry={entry} />');
    expect(commandsSrc).toContain('type="button"');
    expect(commandsSrc).toContain('{truncated}');
    expect(commandsSrc).toContain('{label}');
    expect(commandsSrc).toContain('<Faceplate');
    expect(commandsSrc).toContain('<LampTile');
    expect(commandsSrc).not.toMatch(/\bbg-black\b/);
    expect(commandsSrc).not.toMatch(/(?:text|border)-(?:emerald|red)-\d/);
  });

  it('scopes stream + floor live-state counts to the active roster (no global aggregation)', () => {
    // Counts must derive from the employees prop via the shared helper, never
    // from the global employeeLive map — otherwise cross-workspace live state
    // leaks into the active dashboard (idle count negative, concurrency VU > 1).
    expect(streamSrc).toContain('countThinking(employees, employeeLive)');
    expect(streamSrc).not.toContain('Object.values(employeeLive)');
    expect(floorSrc).toContain('countThinking(employees, employeeLive)');
    expect(floorSrc).toContain('countIdle(employees, employeeLive)');
    expect(floorSrc).not.toContain('Object.values(employeeLive)');
  });
});
