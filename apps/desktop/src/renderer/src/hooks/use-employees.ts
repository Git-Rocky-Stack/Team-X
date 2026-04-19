import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { ipc } from '@/lib/ipc.js';

export function useEmployees(companyId: string | null) {
  return useQuery({
    queryKey: ['employees', companyId],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled` — queryFn only runs when companyId is non-null
    queryFn: () => ipc.employees.list(companyId!),
    enabled: companyId !== null && companyId.length > 0,
  });
}

/**
 * Subscribe to the main-process dashboard bus and invalidate the
 * React Query employees cache when an event that mutates the org for
 * the current company lands.
 *
 * Subscribed events:
 * - `employee.hired` — direct lifecycle emit from `employees.create`
 * - `employee.fired` — direct lifecycle emit from `employees.fire`
 * - `employee.promoted` — direct lifecycle emit from `employees.promote` (M-C step d)
 * - `employee.managerSet` — direct lifecycle emit from `employees.setManager` (M-C step d)
 *
 * Why this exists: React Query's `onSuccess` invalidation only fires
 * for mutations triggered from this renderer. When the command palette
 * (M30), a Playwright E2E spec, or an agent-initiated hire writes
 * through IPC, the employee-list cache stays stale until the next
 * manual refetch. Per architectural invariant #11, the renderer must
 * listen to the append-only bus for invalidation when mutation origin
 * is not local.
 *
 * Mount once inside any view that consumes `useEmployees` or that
 * renders the org chart (HireDialog, FireDialog, OrgChartView — all
 * landing in M-D). The hook scopes its filter to the active
 * `companyId` so multi-company setups don't cross-invalidate.
 *
 * Phase 5.6 M-C FOLLOWUP-P1-extended (2026-04-18) closed the
 * `employee.hired` / `employee.fired` FOLLOWUP-P1 main-side gaps
 * (BUG-009 + BUG-010 from `docs/qa/2026-04-18-autonomous-run-report.md`
 * §4), extending the step-f closure originally surfaced by
 * `docs/qa/2026-04-18-ground-zero-audit.md` §3.1. The hook ships
 * ready-to-mount; M-D lands the mount points.
 *
 * Invalidates:
 * - `['employees', companyId]` — the employee-list query key
 * - `['orgchart', companyId]` — the org-chart query key (M-D consumer)
 */
export function useEmployeeEventSync(companyId: string | null): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!companyId) return;
    const unsubscribe = ipc.events.onDashboard((event) => {
      if (event.companyId !== companyId) return;
      if (
        event.type !== 'employee.hired' &&
        event.type !== 'employee.fired' &&
        event.type !== 'employee.promoted' &&
        event.type !== 'employee.managerSet'
      ) {
        return;
      }
      qc.invalidateQueries({ queryKey: ['employees', companyId] });
      qc.invalidateQueries({ queryKey: ['orgchart', companyId] });
    });
    return unsubscribe;
  }, [companyId, qc]);
}
