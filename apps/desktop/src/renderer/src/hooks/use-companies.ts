import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { ipc } from '@/lib/ipc.js';

/**
 * Lists every company known to the app. The switcher and the
 * CompanySettings panel are the only two consumers today; both want
 * the same list, so this hook is a global-scope query rather than
 * company-scoped.
 *
 * Contract notes:
 * - `ipc.companies.list()` returns every row regardless of status
 *   (see `apps/desktop/src/main/db/repos/companies.ts:list()`). The
 *   `Company` wire shape does NOT carry `status` today; an archive-
 *   status field widening lands in Phase 5.6 M-D step (c) alongside
 *   the `CompanySettings` sheet that surfaces archived companies
 *   separately. Until then, callers must render every row — the
 *   switcher is harmless in the single-company dev default, and
 *   archived companies are invisible from the switcher in any
 *   workspace that has ever archived one (documented TODO for step c).
 * - `queryKey: ['companies']` — intentionally global (not keyed on a
 *   companyId) because the switcher lives in the top-bar above the
 *   active-company scope and must survive companyId flips.
 */
export function useCompanies() {
  return useQuery({
    queryKey: ['companies'],
    queryFn: () => ipc.companies.list(),
  });
}

/**
 * Subscribe to the main-process dashboard bus and invalidate the
 * React Query `['companies']` cache when a company-lifecycle event
 * lands. Architectural invariant #11 — cross-process mutations (the
 * M-D write-side flows in `CreateCompanyDialog` + `CompanySettings`,
 * an E2E spec, the command palette, or an agent-initiated write)
 * leave the switcher stale without this subscription.
 *
 * Subscribed events (all emitted by M-C steps b / e + the pre-existing
 * archive path):
 * - `company.created` — fires after `companies.create` writes AND the
 *   system-agent + system-copilot bootstrap completes (M-C step b).
 * - `company.updated` — fires after `companies.update` commits (M-C step e).
 * - `company.archived` — fires after `companies.archive` flips `status`
 *   to `'archived'` + quiesces the copilot pipeline (pre-dates M-D).
 * - `company.deleted` — fires after the transactional 15-table hard
 *   delete commits (M-C step e).
 *
 * Why this hook is global-scope (no `companyId` argument): the
 * switcher lives ABOVE the active-company selection — a `company.
 * created` event for a brand-new company will never match the
 * currently-active `companyId`, so the standard per-company guard
 * used by `useEmployeeEventSync` / `useTicketEventSync` / etc.
 * would filter out the very events the switcher depends on.
 *
 * The hook is documented separately from the cross-hook contract in
 * `event-sync-hooks.test.ts` (§Invariant #11 cross-hook contract) —
 * its effect-dependency shape (`[qc]` rather than `[companyId, qc]`)
 * is intentionally different and the contract test iterator excludes
 * this hook.
 *
 * Mount once inside the top-bar (or any persistent app-shell surface)
 * — NOT inside a per-view component whose unmount would drop the
 * subscription. Per the step-(a) mount plan, `WorkspaceSwitcher` owns
 * the mount.
 *
 * Lineage: first shipped in Phase 5.6 M-D step (a) per
 * `docs/plans/2026-04-19-team-x-phase-5.6-m-d-ui-backfill.md` §3
 * step (a). Extends the Invariant #11 closure chain documented in
 * `docs/qa/2026-04-18-ground-zero-audit.md` §3.1 (M-C step f) +
 * `docs/qa/2026-04-18-autonomous-run-report.md` §4 (M-C
 * FOLLOWUP-P1-extended).
 */
export function useCompanyEventSync(): void {
  const qc = useQueryClient();
  useEffect(() => {
    const unsubscribe = ipc.events.onDashboard((event) => {
      if (
        event.type !== 'company.created' &&
        event.type !== 'company.updated' &&
        event.type !== 'company.archived' &&
        event.type !== 'company.deleted'
      ) {
        return;
      }
      qc.invalidateQueries({ queryKey: ['companies'] });
    });
    return unsubscribe;
  }, [qc]);
}
