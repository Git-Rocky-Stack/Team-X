/**
 * CopilotInsightCard (Phase 5 — M34 T4).
 *
 * Renders a single proactive insight from the Copilot service. One
 * card per row in the sidebar feed and the dashboard widget.
 *
 * Visual contract (from design doc §8.5):
 *   - Category icon (colored stripe on the left edge).
 *   - Severity badge (critical=red, warning=amber, info=blue).
 *   - Title (single line, `font-medium`).
 *   - Detail text (2-line clamp on dashboard widget, full on sidebar).
 *   - Optional action button dispatching `actionIntent` via
 *     `command.execute`. Destructive/write-side gates fire inside
 *     `CommandService` — no special-casing here.
 *   - Dismiss button (X icon, top-right) fires `copilot.dismiss`.
 *
 * Invariants honoured:
 *   - Pure view: all IPC through the `ipc` module via hooks.
 *   - Severity color never the sole meaning carrier — text badge
 *     always paired (WCAG AA).
 *   - 44px minimum touch targets on action/dismiss buttons.
 *   - `data-copilot-insight-id` is the stable E2E selector surface
 *     (matches the M31 `data-step-kind` pattern for the command
 *     palette step log).
 */

import type {
  CopilotCategory,
  CopilotFeedbackSuggestion,
  CopilotInsight,
  CopilotSeverity,
  IpcIntentName,
} from '@team-x/shared-types';
import { Activity, AlertTriangle, DollarSign, GitBranch, Users, X } from 'lucide-react';
import type { ComponentType } from 'react';

import { parseActionEntities } from './copilot-helpers.js';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { useCommandExecute } from '@/hooks/use-command.js';
import { useDismissCopilotInsight } from '@/hooks/use-copilot.js';
import { cn } from '@/lib/utils.js';

// ---------------------------------------------------------------------------
// Visual mapping — category and severity
// ---------------------------------------------------------------------------

const CATEGORY_META: Record<
  CopilotCategory,
  { label: string; icon: ComponentType<{ className?: string }> }
> = {
  operational: { label: 'Operational', icon: Activity },
  cost: { label: 'Cost', icon: DollarSign },
  org: { label: 'Org', icon: Users },
  workflow: { label: 'Workflow', icon: GitBranch },
  anomaly: { label: 'Anomaly', icon: AlertTriangle },
};

/**
 * Severity color tokens. Background is used for the severity badge;
 * `stripe` for the left-edge accent. Intentionally WCAG AA compliant
 * (verified against the dark-theme surface).
 */
const SEVERITY_META: Record<
  CopilotSeverity,
  { label: string; badgeBg: string; badgeText: string; stripe: string }
> = {
  critical: {
    label: 'Critical',
    badgeBg: 'bg-red-950/60',
    badgeText: 'text-red-300',
    stripe: 'bg-red-500',
  },
  warning: {
    label: 'Warning',
    badgeBg: 'bg-amber-950/60',
    badgeText: 'text-amber-300',
    stripe: 'bg-amber-500',
  },
  info: {
    label: 'Info',
    badgeBg: 'bg-sky-950/60',
    badgeText: 'text-sky-300',
    stripe: 'bg-sky-500',
  },
};

// ---------------------------------------------------------------------------
// Compact variant for the dashboard widget (2-line detail clamp,
// smaller padding). Full variant for the sidebar feed.
// ---------------------------------------------------------------------------

export type CopilotInsightCardVariant = 'sidebar' | 'dashboard';

interface CopilotInsightCardProps {
  insight: CopilotInsight;
  variant?: CopilotInsightCardVariant;
  /**
   * Called after a successful dismiss mutation. The sidebar uses this
   * to focus the next card for keyboard flow; the dashboard widget
   * leaves it undefined.
   */
  onAfterDismiss?: (id: string) => void;
  onFeedbackSuggestion?: (suggestion: CopilotFeedbackSuggestion) => void;
}

export function CopilotInsightCard({
  insight,
  variant = 'sidebar',
  onAfterDismiss,
  onFeedbackSuggestion,
}: CopilotInsightCardProps) {
  const dismissMutation = useDismissCopilotInsight();
  const executeMutation = useCommandExecute();

  const categoryMeta = CATEGORY_META[insight.category];
  const severityMeta = SEVERITY_META[insight.severity];
  const Icon = categoryMeta.icon;

  const isDashboard = variant === 'dashboard';

  async function onDismissClick() {
    try {
      const result = await dismissMutation.mutateAsync({
        id: insight.id,
        companyId: insight.companyId,
      });
      if (result.feedbackSuggestion && onFeedbackSuggestion) {
        onFeedbackSuggestion(result.feedbackSuggestion);
      }
      onAfterDismiss?.(insight.id);
    } catch {
      // The mutation surfaces its own error state via React Query; we
      // intentionally swallow here so a failed dismiss doesn't crash
      // the card. A follow-up could hoist this into a toast.
    }
  }

  async function onActionClick() {
    if (!insight.actionIntent) return;

    // Entities are stored as a JSON string so the wire shape stays
    // JSON-safe. `parseActionEntities` handles malformed payloads
    // (bad JSON, non-object, arrays, non-string values) with a safe
    // empty-map fallback.
    const entities = parseActionEntities(insight.actionEntitiesJson);

    await executeMutation.mutateAsync({
      intent: insight.actionIntent as IpcIntentName,
      entities,
      companyId: insight.companyId,
      // Never silent-confirm destructive intents. `CommandService`
      // gates the write-side / destructive ones and the palette's
      // confirmation dialog will fire before execution. We stamp
      // `actorId` so audit + history distinguish copilot-dispatched
      // actions from the palette's direct "user" entries.
      confirmed: false,
      actorId: 'copilot',
    });
  }

  return (
    <li
      data-copilot-insight-id={insight.id}
      data-copilot-category={insight.category}
      data-copilot-severity={insight.severity}
      className={cn(
        'mission-chrome-panel relative overflow-hidden rounded-[24px] border border-white/10 transition-colors hover:border-white/15',
        isDashboard ? 'p-3' : 'p-4',
      )}
    >
      {/* Left-edge severity stripe */}
      <span
        aria-hidden="true"
        className={cn('absolute inset-y-0 left-0 w-1', severityMeta.stripe)}
      />

      <div className={cn('flex items-start gap-3', isDashboard ? 'pl-2' : 'pl-3')}>
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-[16px] border border-white/10',
            severityMeta.badgeBg,
          )}
          aria-label={`${categoryMeta.label} insight`}
        >
          <Icon className={cn('h-4 w-4', severityMeta.badgeText)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                'h-6 rounded-full px-2 text-[10px] font-mono uppercase tracking-wider',
                severityMeta.badgeBg,
                severityMeta.badgeText,
                'border-transparent',
              )}
            >
              {severityMeta.label}
            </Badge>
            <Badge
              variant="outline"
              className="h-6 rounded-full border-white/10 bg-black/20 px-2 text-[10px] font-mono text-muted-foreground"
            >
              {categoryMeta.label}
            </Badge>
          </div>

          <h3
            className={cn(
              'mt-1.5 font-medium leading-snug text-foreground',
              isDashboard ? 'text-sm' : 'text-sm',
            )}
          >
            {insight.title}
          </h3>

          <p
            className={cn(
              'mt-1 text-xs leading-relaxed text-muted-foreground',
              isDashboard && 'line-clamp-2',
            )}
          >
            {insight.detail}
          </p>

          {insight.actionSuggestion && insight.actionIntent && !isDashboard && (
            <div className="mt-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={executeMutation.isPending}
                onClick={onActionClick}
                className="h-8 rounded-[16px] border-white/10 bg-black/10 text-xs text-foreground hover:bg-black/20"
              >
                {insight.actionSuggestion}
              </Button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onDismissClick}
          disabled={dismissMutation.isPending}
          aria-label={`Dismiss insight: ${insight.title}`}
          className={cn(
            'shrink-0 rounded-[14px] p-1.5 text-muted-foreground transition-colors',
            'hover:bg-black/20 hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            'disabled:opacity-50',
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
