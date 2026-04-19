/**
 * Source-string audit for the 4 event-sync hooks added 2026-04-18 to
 * close the Invariant #11 P1 finding documented in
 * `docs/qa/2026-04-18-ground-zero-audit.md` §3.1.
 *
 * Hooks under audit:
 *   - `useTicketEventSync` (tickets / task.delegated / task.escalated)
 *   - `useMeetingEventSync` (meeting.started/turn/interjection/ended)
 *   - `useProjectEventSync` (plan.proposed/approved / task.delegated)
 *   - `useGoalEventSync` (goal.progressChanged)
 *
 * Per the existing renderer-test convention (see `top-bar.test.tsx` +
 * `audit-event-chip.test.tsx`), this file runs under `environment:
 * 'node'` and uses pure source-string audits rather than jsdom / React
 * rendering. The goal is not to exercise React's effect lifecycle —
 * that's covered by E2E specs — but to pin the CONTRACT of each hook
 * so a future refactor that accidentally drops a subscription or
 * invalidation target fails first, cheapest, and with a clear error.
 *
 * Regression guard invariant: every mutation hook subscribing to a
 * cross-process event MUST follow the same three-step pattern —
 * (1) guard on companyId match, (2) filter on event.type, (3)
 * invalidateQueries on the feature's query key. A new hook that
 * violates this pattern will be caught here.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const HOOKS_DIR = currentDirname;
const FEATURES_DIR = join(currentDirname, '..', 'features');

function readHook(name: string): string {
  return readFileSync(join(HOOKS_DIR, `${name}.ts`), 'utf8');
}
function readView(feature: string, view: string): string {
  return readFileSync(join(FEATURES_DIR, feature, `${view}.tsx`), 'utf8');
}

// ---------------------------------------------------------------------------
// useTicketEventSync
// ---------------------------------------------------------------------------

describe('useTicketEventSync (use-tickets.ts)', () => {
  const src = readHook('use-tickets');

  it('is exported with the canonical signature', () => {
    expect(src).toContain('export function useTicketEventSync(companyId: string | null): void');
  });

  it('subscribes via ipc.events.onDashboard', () => {
    expect(src).toContain('ipc.events.onDashboard');
  });

  it('guards on companyId scope mismatch', () => {
    expect(src).toMatch(/if\s*\(\s*event\.companyId\s*!==\s*companyId\s*\)\s*return/);
  });

  it('subscribes to task.delegated (M32 planner writes a ticket)', () => {
    expect(src).toContain("'task.delegated'");
  });

  it('subscribes to task.escalated (M32 planner bumps a subtask)', () => {
    expect(src).toContain("'task.escalated'");
  });

  it('documents the main-side ticket.closed gap as FOLLOWUP-P1', () => {
    expect(src).toContain('FOLLOWUP-P1');
  });

  it('invalidates the tickets list query', () => {
    expect(src).toMatch(/queryKey:\s*\['tickets',\s*companyId\]/);
  });

  it('invalidates the ticket-detail query', () => {
    expect(src).toMatch(/queryKey:\s*\['ticket-detail'\]/);
  });

  it('returns the unsubscribe function from the effect', () => {
    // The effect must `return unsubscribe;` so React's cleanup
    // removes the listener on unmount.
    expect(src).toMatch(/return\s+unsubscribe;/);
  });
});

describe('TicketsView mounts useTicketEventSync', () => {
  const src = readView('tickets', 'tickets-view');

  it('imports the sync hook', () => {
    expect(src).toContain('useTicketEventSync');
  });

  it('invokes the sync hook with companyId', () => {
    expect(src).toMatch(/useTicketEventSync\s*\(\s*companyId\s*\)/);
  });
});

// ---------------------------------------------------------------------------
// useMeetingEventSync
// ---------------------------------------------------------------------------

describe('useMeetingEventSync (use-meetings.ts)', () => {
  const src = readHook('use-meetings');

  it('is exported with the canonical signature', () => {
    expect(src).toContain('export function useMeetingEventSync(companyId: string | null): void');
  });

  it('subscribes via ipc.events.onDashboard', () => {
    expect(src).toContain('ipc.events.onDashboard');
  });

  it('guards on companyId scope mismatch', () => {
    expect(src).toMatch(/if\s*\(\s*event\.companyId\s*!==\s*companyId\s*\)\s*return/);
  });

  it('subscribes to meeting.started', () => {
    expect(src).toContain("'meeting.started'");
  });

  it('subscribes to meeting.turn', () => {
    expect(src).toContain("'meeting.turn'");
  });

  it('subscribes to meeting.interjection', () => {
    expect(src).toContain("'meeting.interjection'");
  });

  it('subscribes to meeting.ended', () => {
    expect(src).toContain("'meeting.ended'");
  });

  it('invalidates the meetings list query', () => {
    expect(src).toMatch(/queryKey:\s*\['meetings',\s*companyId\]/);
  });

  it('invalidates the meeting-detail query', () => {
    expect(src).toMatch(/queryKey:\s*\['meeting-detail'\]/);
  });

  it('returns the unsubscribe function from the effect', () => {
    expect(src).toMatch(/return\s+unsubscribe;/);
  });
});

describe('MeetingsView mounts useMeetingEventSync', () => {
  const src = readView('meetings', 'meetings-view');

  it('imports the sync hook', () => {
    expect(src).toContain('useMeetingEventSync');
  });

  it('invokes the sync hook with companyId', () => {
    expect(src).toMatch(/useMeetingEventSync\s*\(\s*companyId\s*\)/);
  });
});

// ---------------------------------------------------------------------------
// useProjectEventSync
// ---------------------------------------------------------------------------

describe('useProjectEventSync (use-projects.ts)', () => {
  const src = readHook('use-projects');

  it('is exported with the canonical signature', () => {
    expect(src).toContain('export function useProjectEventSync(companyId: string | null): void');
  });

  it('subscribes via ipc.events.onDashboard', () => {
    expect(src).toContain('ipc.events.onDashboard');
  });

  it('guards on companyId scope mismatch', () => {
    expect(src).toMatch(/if\s*\(\s*event\.companyId\s*!==\s*companyId\s*\)\s*return/);
  });

  it('subscribes to plan.proposed (M32 decompose_project)', () => {
    expect(src).toContain("'plan.proposed'");
  });

  it('subscribes to plan.approved', () => {
    expect(src).toContain("'plan.approved'");
  });

  it('subscribes to task.delegated (links tickets into projects)', () => {
    expect(src).toContain("'task.delegated'");
  });

  it('invalidates the projects list query', () => {
    expect(src).toMatch(/queryKey:\s*\['projects',\s*companyId\]/);
  });

  it('invalidates the project-detail query', () => {
    expect(src).toMatch(/queryKey:\s*\['project-detail'\]/);
  });

  it('documents the main-side invariant #11 gap as FOLLOWUP-P1', () => {
    // Ensures the JSDoc explicitly notes that projects.create/update/delete
    // do not currently emit bus events — a separate follow-up finding.
    expect(src).toContain('FOLLOWUP-P1');
  });

  it('returns the unsubscribe function from the effect', () => {
    expect(src).toMatch(/return\s+unsubscribe;/);
  });
});

describe('ProjectsView mounts useProjectEventSync', () => {
  const src = readView('projects', 'projects-view');

  it('imports the sync hook', () => {
    expect(src).toContain('useProjectEventSync');
  });

  it('invokes the sync hook with companyId', () => {
    expect(src).toMatch(/useProjectEventSync\s*\(\s*companyId\s*\)/);
  });
});

// ---------------------------------------------------------------------------
// useGoalEventSync
// ---------------------------------------------------------------------------

describe('useGoalEventSync (use-goals.ts)', () => {
  const src = readHook('use-goals');

  it('is exported with the canonical signature', () => {
    expect(src).toContain('export function useGoalEventSync(companyId: string | null): void');
  });

  it('subscribes via ipc.events.onDashboard', () => {
    expect(src).toContain('ipc.events.onDashboard');
  });

  it('guards on companyId scope mismatch', () => {
    expect(src).toMatch(/if\s*\(\s*event\.companyId\s*!==\s*companyId\s*\)\s*return/);
  });

  it('subscribes to plan.approved (rolls up to linked goal progress)', () => {
    expect(src).toContain("'plan.approved'");
  });

  it('subscribes to task.delegated (indirectly affects goal aggregate)', () => {
    expect(src).toContain("'task.delegated'");
  });

  it('invalidates the goals list query', () => {
    expect(src).toMatch(/queryKey:\s*\['goals',\s*companyId\]/);
  });

  it('invalidates the goal-detail query', () => {
    expect(src).toMatch(/queryKey:\s*\['goal-detail'\]/);
  });

  it('documents the main-side invariant #11 gap as FOLLOWUP-P1', () => {
    expect(src).toContain('FOLLOWUP-P1');
  });

  it('returns the unsubscribe function from the effect', () => {
    expect(src).toMatch(/return\s+unsubscribe;/);
  });
});

describe('GoalsView mounts useGoalEventSync', () => {
  const src = readView('projects', 'goals-view');

  it('imports the sync hook', () => {
    expect(src).toContain('useGoalEventSync');
  });

  it('invokes the sync hook with companyId', () => {
    expect(src).toMatch(/useGoalEventSync\s*\(\s*companyId\s*\)/);
  });
});

// ---------------------------------------------------------------------------
// Cross-hook invariants
// ---------------------------------------------------------------------------

describe('Invariant #11 cross-hook contract', () => {
  it('each sync hook follows the mount-once effect pattern', () => {
    const hooks = ['use-tickets', 'use-meetings', 'use-projects', 'use-goals'];
    for (const name of hooks) {
      const src = readHook(name);
      // The effect must carry the [companyId, qc] dependency array
      // (matches the useVaultEventSync template).
      expect(src, `${name}: effect must depend on [companyId, qc]`).toMatch(
        /\}\s*,\s*\[companyId,\s*qc\]\s*\)/,
      );
    }
  });

  it('each sync hook references the ground-zero audit document', () => {
    const hooks = ['use-tickets', 'use-meetings', 'use-projects', 'use-goals'];
    for (const name of hooks) {
      const src = readHook(name);
      expect(src, `${name}: JSDoc must cite 2026-04-18-ground-zero-audit.md §3.1`).toContain(
        '2026-04-18-ground-zero-audit.md',
      );
    }
  });
});
