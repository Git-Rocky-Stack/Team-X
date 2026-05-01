/**
 * React Query hooks for the Copilot IPC surface (Phase 5 — M34).
 *
 * Exposes five hooks that wrap `window.teamx.copilot.*` via the shared
 * `ipc` module:
 *
 *   - `useCopilotInsights(companyId, filters?)` — useQuery over
 *     `copilot.insights`. Subscribes to `copilot.insight`,
 *     `copilot.dismissed`, `copilot.expired` on the dashboard event bus
 *     and invalidates the cache per invariant #11 (IPC mutations that
 *     mutate state emit a bus event — the renderer uses the bus for
 *     cache invalidation rather than relying on mutation.onSuccess).
 *   - `useDismissCopilotInsight()` — useMutation over `copilot.dismiss`.
 *     Optimistically projects `dismissedAt` into the cache so the card
 *     disappears before the bus event arrives; the event then
 *     reconciles with server truth.
 *   - `useAskCopilot()` — useMutation over `copilot.ask`. Returns
 *     `{ runId, threadId }` matching the M31 `complex_request` wire
 *     shape so the caller can hand the tuple to the chat drawer's
 *     existing step-transcript layout with zero divergence.
 *   - `useCopilotExport()` — useMutation over `copilot.export`.
 *     Read-only local file export; intentionally no local query
 *     invalidation because the main process emits no bus event.
 *   - `useCopilotConfigure()` — useMutation over `copilot.configure`
 *     (test-only manual-tick; production code paths use
 *     `settings.setCopilot` from M33 T7). Intentionally exposed here
 *     because the Playwright E2E uses it to force a synchronous tick.
 *
 * Invalidation keys follow the naming convention set by use-command.ts
 * and use-vault.ts: `['copilot-insights', companyId]` + optional
 * filters folded into the key so filtered variants invalidate in
 * lockstep.
 *
 * All hooks route through the preload bridge via `@/lib/ipc`. The
 * renderer never reaches for `window.teamx` directly — test doubles
 * swap the module, not the global.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CopilotAskArgs,
  CopilotAskResult,
  CopilotConfigureArgs,
  CopilotConfigureResult,
  CopilotDismissArgs,
  CopilotDismissResult,
  CopilotExportRequest,
  CopilotExportResponse,
  CopilotInsight,
  CopilotInsightListArgs,
  CopilotInsightListResult,
  DashboardEvent,
} from '@team-x/shared-types';
import { useEffect } from 'react';


import { ipc } from '@/lib/ipc.js';

const INSIGHTS_KEY = 'copilot-insights';

/**
 * List active (non-dismissed, non-expired) insights for a company, with
 * optional category/severity filters. The query key folds filters in
 * so mutations invalidate only the filtered variants they touched.
 *
 * Also attaches a single `events.onDashboard` listener that invalidates
 * the base key whenever any of the three copilot bus events fire for
 * this company. The listener detaches on unmount.
 */
export function useCopilotInsights(
  companyId: string | null,
  filters?: {
    category?: CopilotInsight['category'];
    severity?: CopilotInsight['severity'];
    limit?: number;
  },
) {
  const queryClient = useQueryClient();

  // Bus-driven cache invalidation per invariant #11. The main process
  // emits `copilot.insight` when the analyzer persists a new row,
  // `copilot.dismissed` when the user dismisses, and `copilot.expired`
  // during the per-cycle expiry sweep. All three invalidate the
  // insights list so React Query refetches server truth.
  useEffect(() => {
    if (!companyId) return;

    const unsubscribe = ipc.events.onDashboard((event: DashboardEvent) => {
      if (event.companyId !== companyId) return;
      if (
        event.type === 'copilot.insight' ||
        event.type === 'copilot.dismissed' ||
        event.type === 'copilot.expired'
      ) {
        queryClient.invalidateQueries({ queryKey: [INSIGHTS_KEY, companyId] });
      }
    });

    return unsubscribe;
  }, [companyId, queryClient]);

  return useQuery<CopilotInsightListResult>({
    queryKey: [
      INSIGHTS_KEY,
      companyId,
      filters?.category ?? null,
      filters?.severity ?? null,
      filters?.limit ?? null,
    ],
    queryFn: () => {
      if (!companyId) {
        return Promise.resolve({ insights: [], nextCursor: null });
      }
      const args: CopilotInsightListArgs = {
        companyId,
        ...(filters?.category ? { category: filters.category } : {}),
        ...(filters?.severity ? { severity: filters.severity } : {}),
        ...(filters?.limit ? { limit: filters.limit } : {}),
      };
      return ipc.copilot.insights(args);
    },
    enabled: !!companyId,
    // Keep data snappy but let the bus be the authoritative invalidator.
    staleTime: 30_000,
  });
}

/**
 * Dismiss an insight. Optimistically marks `dismissedAt` in the cache
 * so the card disappears immediately; the bus event from the main
 * process then reconciles with server truth (in case the optimistic
 * projection drifted from the authoritative row).
 */
export function useDismissCopilotInsight() {
  const queryClient = useQueryClient();
  return useMutation<CopilotDismissResult, Error, CopilotDismissArgs & { companyId: string }>({
    mutationFn: ({ companyId: _companyId, ...args }) => ipc.copilot.dismiss(args),
    onMutate: async ({ companyId, id }) => {
      // Cancel in-flight refetches so the optimistic update isn't
      // overwritten mid-flight. React Query best practice.
      await queryClient.cancelQueries({ queryKey: [INSIGHTS_KEY, companyId] });

      const now = Date.now();
      queryClient.setQueriesData<CopilotInsightListResult>(
        { queryKey: [INSIGHTS_KEY, companyId] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            insights: old.insights.filter((ins) => ins.id !== id),
          };
        },
      );

      return { now };
    },
    onSettled: (_result, _error, { companyId }) => {
      queryClient.invalidateQueries({ queryKey: [INSIGHTS_KEY, companyId] });
    },
  });
}

/**
 * Ask the copilot a free-form question. Routes through the main-process
 * `CopilotService` → `AgenticLoopService` with the `system-copilot`
 * actor. Returns `{ runId, threadId }` — the caller is expected to
 * open the chat drawer on that thread (the drawer auto-renders the
 * read-only M31 step-transcript when `isCopilotThread: true`).
 */
export function useAskCopilot() {
  return useMutation<CopilotAskResult, Error, CopilotAskArgs>({
    mutationFn: (args) => ipc.copilot.ask(args),
  });
}

/**
 * Export active copilot insights to a local JSON/CSV file. This is a
 * read-only IPC; no local cache invalidation is needed.
 */
export function useCopilotExport() {
  return useMutation<CopilotExportResponse, Error, CopilotExportRequest>({
    mutationFn: (req) => ipc.copilot.export(req),
  });
}

/**
 * Test-only manual-tick. Fires the analyzer once and resolves when
 * the tick completes with `{ insightsGenerated }`. Production paths
 * use `settings.setCopilot` (M33 T7) to update cadence — this is
 * gated on `isTestMode()` in the main-process handler and returns
 * a clear error in production.
 */
export function useCopilotConfigure() {
  const queryClient = useQueryClient();
  return useMutation<CopilotConfigureResult, Error, CopilotConfigureArgs>({
    mutationFn: (args) => ipc.copilot.configure(args),
    onSuccess: (_result, args) => {
      queryClient.invalidateQueries({ queryKey: [INSIGHTS_KEY, args.companyId] });
    },
  });
}
