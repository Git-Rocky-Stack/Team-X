import { useMutation } from '@tanstack/react-query';
import type { CompaniesCreateRequest, CompaniesCreateResponse } from '@team-x/shared-types';

import { ipc } from '@/lib/ipc.js';

/**
 * Wraps the `companies.create` IPC in a React Query mutation. The
 * global `useCompanyEventSync` hook (mounted in `WorkspaceSwitcher`)
 * listens for the `company.created` bus event emitted by the main-
 * side handler and invalidates the `['companies']` query key, so the
 * switcher list refreshes automatically on success — no `onSuccess`
 * invalidation needed here (that would double-invalidate).
 *
 * Phase 5.6 M-D step (b) — wired to the atomic M-C step b IPC surface
 * per `docs/plans/2026-04-19-team-x-phase-5.6-m-d-ui-backfill.md` §3
 * step (b). Collapsed into the step (a) hardening atomic after the
 * 2026-04-19 ground-zero audit P1 remediation — see
 * `docs/qa/2026-04-19-m-d-step-a-ground-zero-audit.md` and Rocky's
 * iron-rule directive against disabled "Soon" placeholders.
 */
export function useCreateCompany() {
  return useMutation<CompaniesCreateResponse, Error, CompaniesCreateRequest>({
    mutationFn: (req) => ipc.companies.create(req),
  });
}
