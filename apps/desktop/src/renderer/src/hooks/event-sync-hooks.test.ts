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

  // Phase 5.6 M-C step f — FOLLOWUP-P1 resolution: main-side emits wired.
  // Each of the 6 ticket lifecycle events now fires from its IPC handler
  // and must appear in the hook's filter list for cache invalidation.
  it('subscribes to ticket.created (M-C step f — tickets.create emit)', () => {
    expect(src).toContain("'ticket.created'");
  });

  it('subscribes to ticket.updated (M-C step f — tickets.update emit)', () => {
    expect(src).toContain("'ticket.updated'");
  });

  it('subscribes to ticket.assigned (M-C step f — tickets.assign emit)', () => {
    expect(src).toContain("'ticket.assigned'");
  });

  it('subscribes to ticket.closed (M-C step f — tickets.close emit)', () => {
    expect(src).toContain("'ticket.closed'");
  });

  it('subscribes to ticket.reopened (M-C step f — tickets.reopen emit)', () => {
    expect(src).toContain("'ticket.reopened'");
  });

  it('subscribes to ticket.commentAdded (M-C step f — tickets.addComment emit)', () => {
    expect(src).toContain("'ticket.commentAdded'");
  });

  // Phase 5.6 M-C FOLLOWUP-P1-extended — attachment lifecycle closure
  // (BUG-011 from docs/qa/2026-04-18-autonomous-run-report.md §4.3).
  // The two new subscriptions must appear on the filter list AND the
  // attachment-specific invalidation key must target per-ticket caches
  // so the detail panel refreshes without double-fetching the parent
  // ticket list.
  it('subscribes to ticket.attachmentAdded (FOLLOWUP-P1-extended — tickets.attachFile emit)', () => {
    expect(src).toContain("'ticket.attachmentAdded'");
  });

  it('subscribes to ticket.attachmentRemoved (FOLLOWUP-P1-extended — tickets.detachFile emit)', () => {
    expect(src).toContain("'ticket.attachmentRemoved'");
  });

  it('invalidates the ticket-attachments query keyed per-ticket on attachment events', () => {
    expect(src).toMatch(/queryKey:\s*\['ticket-attachments',\s*payload\.ticketId\]/);
  });

  it('documents the FOLLOWUP-P1-extended attachment closure', () => {
    expect(src).toMatch(/FOLLOWUP-P1-extended/);
    expect(src).toContain('2026-04-18-autonomous-run-report.md');
  });

  it('documents the FOLLOWUP-P1 main-side gap as closed by M-C step f', () => {
    // JSDoc must mention FOLLOWUP-P1 (historical pointer) AND the
    // step-f closure — future readers should see the resolution, not
    // the open-gap framing the pre-closure hook shipped with.
    expect(src).toContain('FOLLOWUP-P1');
    expect(src).toMatch(/Phase 5\.6 M-C step f/);
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

  // Phase 5.6 M-C step f — 5 project lifecycle events wired on main side.
  it('subscribes to project.created (M-C step f — projects.create emit)', () => {
    expect(src).toContain("'project.created'");
  });

  it('subscribes to project.updated (M-C step f — projects.update emit)', () => {
    expect(src).toContain("'project.updated'");
  });

  it('subscribes to project.deleted (M-C step f — projects.delete emit)', () => {
    expect(src).toContain("'project.deleted'");
  });

  it('subscribes to project.ticketLinked (M-C step f — projects.linkTicket emit)', () => {
    expect(src).toContain("'project.ticketLinked'");
  });

  it('subscribes to project.ticketUnlinked (M-C step f — projects.unlinkTicket emit)', () => {
    expect(src).toContain("'project.ticketUnlinked'");
  });

  it('invalidates the projects list query', () => {
    expect(src).toMatch(/queryKey:\s*\['projects',\s*companyId\]/);
  });

  it('invalidates the project-detail query', () => {
    expect(src).toMatch(/queryKey:\s*\['project-detail'\]/);
  });

  it('documents the FOLLOWUP-P1 main-side gap as closed by M-C step f', () => {
    expect(src).toContain('FOLLOWUP-P1');
    expect(src).toMatch(/Phase 5\.6 M-C step f/);
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

  // Phase 5.6 M-C step f — 3 goal lifecycle events wired on main side.
  it('subscribes to goal.created (M-C step f — goals.create emit)', () => {
    expect(src).toContain("'goal.created'");
  });

  it('subscribes to goal.updated (M-C step f — goals.update emit carries progress)', () => {
    expect(src).toContain("'goal.updated'");
  });

  it('subscribes to goal.deleted (M-C step f — goals.delete emit)', () => {
    expect(src).toContain("'goal.deleted'");
  });

  it('invalidates the goals list query', () => {
    expect(src).toMatch(/queryKey:\s*\['goals',\s*companyId\]/);
  });

  it('invalidates the goal-detail query', () => {
    expect(src).toMatch(/queryKey:\s*\['goal-detail'\]/);
  });

  it('documents the FOLLOWUP-P1 main-side gap as closed by M-C step f', () => {
    expect(src).toContain('FOLLOWUP-P1');
    expect(src).toMatch(/Phase 5\.6 M-C step f/);
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

// ---------------------------------------------------------------------------
// useEmployeeEventSync — Phase 5.6 M-C FOLLOWUP-P1-extended
//
// New hook introduced by BUG-009 + BUG-010 closure. use-employees.ts
// previously carried only the `useEmployees` query; this audit pins
// the shape of the sync hook added alongside the main-side
// `employee.hired` / `employee.fired` emits.
//
// The hook ships ready-to-mount; M-D lands the mount points in
// HireDialog / FireDialog / OrgChartView. The audit runs today so a
// future refactor that accidentally drops a subscription fails first,
// cheapest, with a clear error — same discipline as the step-f hooks.
// ---------------------------------------------------------------------------

describe('useEmployeeEventSync (use-employees.ts — FOLLOWUP-P1-extended)', () => {
  const src = readHook('use-employees');

  it('is exported with the canonical signature', () => {
    expect(src).toContain('export function useEmployeeEventSync(companyId: string | null): void');
  });

  it('subscribes via ipc.events.onDashboard', () => {
    expect(src).toContain('ipc.events.onDashboard');
  });

  it('guards on companyId scope mismatch', () => {
    expect(src).toMatch(/if\s*\(\s*event\.companyId\s*!==\s*companyId\s*\)\s*return/);
  });

  it('subscribes to employee.hired (FOLLOWUP-P1-extended — employees.create emit)', () => {
    expect(src).toContain("'employee.hired'");
  });

  it('subscribes to employee.fired (FOLLOWUP-P1-extended — employees.fire emit)', () => {
    expect(src).toContain("'employee.fired'");
  });

  it('subscribes to employee.promoted (M-C step d — employees.promote emit)', () => {
    expect(src).toContain("'employee.promoted'");
  });

  it('subscribes to employee.managerSet (M-C step d — employees.setManager emit)', () => {
    expect(src).toContain("'employee.managerSet'");
  });

  it('invalidates the employees list query keyed per-company', () => {
    expect(src).toMatch(/queryKey:\s*\['employees',\s*companyId\]/);
  });

  it('invalidates the orgchart query keyed per-company', () => {
    expect(src).toMatch(/queryKey:\s*\['orgchart',\s*companyId\]/);
  });

  it('returns the unsubscribe function from the effect', () => {
    expect(src).toMatch(/return\s+unsubscribe;/);
  });

  it('documents the FOLLOWUP-P1-extended closure with cite-through to the autonomous run report', () => {
    expect(src).toMatch(/FOLLOWUP-P1-extended/);
    expect(src).toContain('2026-04-18-autonomous-run-report.md');
    // Lineage pointer to the step-f ground-zero audit — preserves the
    // cross-hook contract assertion below and the architectural history.
    expect(src).toContain('2026-04-18-ground-zero-audit.md');
  });
});

// ---------------------------------------------------------------------------
// useCompanyEventSync — Phase 5.6 M-D step (a)
//
// Global-scope sync hook — no `companyId` argument. The switcher lives
// ABOVE the active-company selection in the top-bar and must
// invalidate its list on every company-lifecycle event regardless of
// which company is currently active. This architectural divergence
// from the per-company hooks is intentional and documented in
// `use-companies.ts` JSDoc + the `docs/plans/2026-04-19-team-x-phase-
// 5.6-m-d-ui-backfill.md` plan.
//
// The cross-hook contract iterator below (§Invariant #11 cross-hook
// contract) EXCLUDES `use-companies` because its effect dependency
// shape is `[qc]` rather than `[companyId, qc]` and it does not
// carry a `companyId`-scope guard. The dedicated describe block
// below pins its alternate contract.
// ---------------------------------------------------------------------------

describe('useCompanyEventSync (use-companies.ts — M-D step a)', () => {
  const src = readHook('use-companies');

  it('is exported with the canonical global-scope signature', () => {
    expect(src).toContain('export function useCompanyEventSync(): void');
  });

  it('subscribes via ipc.events.onDashboard', () => {
    expect(src).toContain('ipc.events.onDashboard');
  });

  it('does NOT guard on companyId scope (global-scope hook)', () => {
    // The per-company hooks carry `event.companyId !== companyId` —
    // this hook MUST NOT. Catches a refactor that accidentally
    // copy-pastes the per-company guard and silently drops
    // company.created events for brand-new companies whose id never
    // matches the currently-active companyId.
    expect(src).not.toMatch(/if\s*\(\s*event\.companyId\s*!==\s*companyId\s*\)/);
  });

  it('subscribes to company.created (M-C step b — companies.create emit)', () => {
    expect(src).toContain("'company.created'");
  });

  it('subscribes to company.updated (M-C step e — companies.update emit)', () => {
    expect(src).toContain("'company.updated'");
  });

  it('subscribes to company.archived (pre-M-C — companies.archive emit)', () => {
    expect(src).toContain("'company.archived'");
  });

  it('subscribes to company.deleted (M-C step e — companies.delete emit)', () => {
    expect(src).toContain("'company.deleted'");
  });

  it('invalidates the global companies list query', () => {
    // Global query key — NOT keyed on companyId. The switcher lives
    // above the active-company scope.
    expect(src).toMatch(/queryKey:\s*\['companies'\]/);
  });

  it('depends only on [qc] in the effect dep array (global-scope)', () => {
    // Per-company hooks use `[companyId, qc]`; this hook omits the
    // companyId arg entirely, so the dep array is `[qc]` alone.
    expect(src).toMatch(/\}\s*,\s*\[qc\]\s*\)/);
    // Negative: the per-company template must NOT appear — catches a
    // refactor that accidentally adds a companyId parameter.
    expect(src).not.toMatch(/\}\s*,\s*\[companyId,\s*qc\]\s*\)/);
  });

  it('returns the unsubscribe function from the effect', () => {
    expect(src).toMatch(/return\s+unsubscribe;/);
  });

  it('documents the M-D step-(a) closure with cite-through to the plan', () => {
    expect(src).toMatch(/M-D step \(a\)/);
    expect(src).toContain('2026-04-19-team-x-phase-5.6-m-d-ui-backfill.md');
    // Lineage pointer to the invariant-#11 closure chain.
    expect(src).toContain('2026-04-18-ground-zero-audit.md');
  });
});

describe('TopBar mounts the WorkspaceSwitcher (which mounts useCompanyEventSync)', () => {
  // The switcher owns the mount per the M-D step-(a) plan. A refactor
  // that unmounts the switcher or drops the useCompanyEventSync call
  // would leave the switcher stale on cross-process writes; this
  // audit catches that first, cheapest.
  const topBar = readFileSync(join(currentDirname, '..', 'app', 'top-bar.tsx'), 'utf8');
  const switcher = readFileSync(join(FEATURES_DIR, 'workspace', 'workspace-switcher.tsx'), 'utf8');

  it('top-bar imports the WorkspaceSwitcher', () => {
    expect(topBar).toContain('WorkspaceSwitcher');
    expect(topBar).toMatch(/from\s+['"]@\/features\/workspace\/workspace-switcher[^'"]*['"]/);
  });

  it('top-bar renders the WorkspaceSwitcher exactly once', () => {
    const matches = topBar.match(/<WorkspaceSwitcher\s*\/>/g);
    expect(matches).toBeTruthy();
    expect(matches?.length).toBe(1);
  });

  it('switcher invokes useCompanyEventSync exactly once', () => {
    const matches = switcher.match(/useCompanyEventSync\s*\(\s*\)/g);
    expect(matches).toBeTruthy();
    expect(matches?.length).toBe(1);
  });
});

describe('Invariant #11 cross-hook contract', () => {
  it('each sync hook follows the mount-once effect pattern', () => {
    const hooks = [
      'use-tickets',
      'use-meetings',
      'use-projects',
      'use-goals',
      // Phase 5.6 M-C FOLLOWUP-P1-extended — new hook added 2026-04-18.
      'use-employees',
      // NOTE: use-companies intentionally excluded — it is a global-
      // scope hook with `[qc]` dep array, not `[companyId, qc]`. Its
      // alternate contract is pinned in the dedicated describe block
      // above.
    ];
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
    const hooks = [
      'use-tickets',
      'use-meetings',
      'use-projects',
      'use-goals',
      // FOLLOWUP-P1-extended hook carries the lineage pointer through.
      'use-employees',
      // M-D step (a) global-scope hook carries the lineage pointer
      // through to preserve the architectural-history audit trail.
      'use-companies',
    ];
    for (const name of hooks) {
      const src = readHook(name);
      expect(src, `${name}: JSDoc must cite 2026-04-18-ground-zero-audit.md §3.1`).toContain(
        '2026-04-18-ground-zero-audit.md',
      );
    }
  });
});
