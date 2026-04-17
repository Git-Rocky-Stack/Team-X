/**
 * CopilotDashboardWidget (Phase 5 — M34 T6).
 *
 * Compact preview of the top 3 active copilot insights rendered on the
 * Dashboard view. Clicking "View all" opens the full sidebar via the
 * shared `copilotSidebarOpen` Zustand slice.
 *
 * Visual contract:
 *   - Fixed 3-card cap (sorted by severity then newest-first, same
 *     comparator the sidebar uses — factored into `sortBySeverity`).
 *   - Each card is the `dashboard` variant: smaller padding, 2-line
 *     detail clamp.
 *   - When there are more than 3 active insights, the footer shows
 *     "View all (N)" with the true count.
 *   - Empty / loading / error states are first-class.
 */

import { Loader2, Sparkles } from 'lucide-react';
import { useMemo } from 'react';

import { Badge } from '@/components/ui/badge.js';
import { useCopilotInsights } from '@/hooks/use-copilot.js';
import { useAppStore } from '@/store/app-store.js';

import { pickDashboardTopN, sortBySeverity } from './copilot-helpers.js';
import { CopilotInsightCard } from './copilot-insight-card.js';

export function CopilotDashboardWidget() {
  const companyId = useAppStore((s) => s.companyId);
  const setOpen = useAppStore((s) => s.setCopilotSidebarOpen);

  const { data, isLoading, isError, refetch } = useCopilotInsights(companyId);

  const sorted = useMemo(() => (data?.insights ? sortBySeverity(data.insights) : []), [data]);

  const { topN: topThree, hasMore, total } = pickDashboardTopN(sorted);

  return (
    <section
      aria-label="Copilot insights"
      data-copilot-widget=""
      className="rounded-lg border border-border bg-surface-50 p-4"
    >
      <header className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-foreground">Copilot insights</h2>
        <Badge
          variant="outline"
          className="ml-auto font-mono text-[10px] px-1.5"
          data-copilot-widget-count={total}
        >
          {total} active
        </Badge>
      </header>

      {isLoading && (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading insights" />
        </div>
      )}

      {isError && (
        <div className="py-4 text-center">
          <p className="text-xs text-muted-foreground">Could not load insights.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 rounded-md border border-border px-2.5 py-1 text-[10px] font-medium text-foreground hover:bg-surface-100"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && total === 0 && (
        <div className="py-6 text-center" data-copilot-widget-empty="">
          <p className="text-xs text-muted-foreground">
            No active insights — the copilot is monitoring in the background.
          </p>
        </div>
      )}

      {!isLoading && !isError && total > 0 && (
        <>
          <ul className="flex flex-col gap-2" data-copilot-widget-list="">
            {topThree.map((insight) => (
              <CopilotInsightCard key={insight.id} insight={insight} variant="dashboard" />
            ))}
          </ul>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-3 w-full rounded-md border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
            data-copilot-widget-view-all=""
          >
            {hasMore ? `View all (${total})` : 'Open sidebar'}
          </button>
        </>
      )}
    </section>
  );
}
