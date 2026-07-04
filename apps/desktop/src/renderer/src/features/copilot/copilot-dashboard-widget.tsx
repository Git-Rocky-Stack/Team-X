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

import { Sparkles } from 'lucide-react';
import { useMemo } from 'react';

import { pickDashboardTopN, sortBySeverity } from './copilot-helpers.js';
import { CopilotInsightCard } from './copilot-insight-card.js';

import { SubviewState, Tag } from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
import { useCopilotInsights } from '@/hooks/use-copilot.js';
import { useAppStore } from '@/store/app-store.js';

export function CopilotDashboardWidget() {
  const companyId = useAppStore((s) => s.companyId);
  const setOpen = useAppStore((s) => s.setCopilotSidebarOpen);

  const { data, isLoading, isError, refetch } = useCopilotInsights(companyId);

  const sorted = useMemo(() => (data?.insights ? sortBySeverity(data.insights) : []), [data]);

  const { topN: topThree, hasMore, total } = pickDashboardTopN(sorted);

  // Surface-neutral root: the only render site (mission-control-dashboard
  // secondary rail) hosts this inside its own Faceplate → RecessedWell and
  // neutralizes borders/padding via [&_[data-copilot-widget]] selectors — a
  // recipe root here would nest depth layers the host can't fully clear.
  return (
    <section aria-label="Copilot insights" data-copilot-widget="" className="p-4">
      <header className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand" aria-hidden="true" />
        <h2 className="text-h4 text-foreground">Copilot insights</h2>
        <Tag mono className="ml-auto" data-copilot-widget-count={total}>
          {total} active
        </Tag>
      </header>

      {isLoading && <SubviewState lampLabel="STBY" lampTone="hold" title="Loading insights" />}

      {isError && (
        <SubviewState
          lampLabel="NO-GO"
          lampTone="nogo"
          title="Could not load insights."
          action={
            <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {!isLoading && !isError && total === 0 && (
        <div className="py-2" data-copilot-widget-empty="">
          <SubviewState
            lampLabel="STBY"
            lampTone="off"
            title="No active insights — the copilot is monitoring in the background."
          />
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
            className="nav-tile mt-3 w-full border-dashed border-[var(--hairline)] px-3 py-1.5 text-center text-button-sm"
            data-copilot-widget-view-all=""
          >
            {hasMore ? `View all (${total})` : 'Open sidebar'}
          </button>
        </>
      )}
    </section>
  );
}
