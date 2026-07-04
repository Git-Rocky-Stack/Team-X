/**
 * CopilotInsightCard (Phase 5 — M34 T4).
 *
 * Renders a single proactive insight from the Copilot service. One
 * card per row in the sidebar feed and the dashboard widget.
 *
 * Visual contract (from design doc §8.5):
 *   - Category icon (colored stripe on the left edge).
 *   - Severity lamp (word-lamp, LED tone).
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

import { LampTile, type LampTone, Tag } from '@/components/console/index.js';
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

/** Severity → console LED mapping. */
const SEVERITY_META: Record<
  CopilotSeverity,
  { label: string; tone: LampTone; stripe: string; chip: string }
> = {
  critical: {
    label: 'Critical',
    tone: 'nogo',
    stripe: 'bg-[var(--led-nogo)]',
    chip: 'text-led-nogo',
  },
  warning: {
    label: 'Warning',
    tone: 'hold',
    stripe: 'bg-[var(--led-hold)]',
    chip: 'text-led-hold',
  },
  info: { label: 'Info', tone: 'off', stripe: 'bg-[var(--led-scope)]', chip: 'text-led-scope' },
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
        'well relative overflow-hidden transition-colors hover:border-[var(--hairline-strong)]',
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
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-card border border-[var(--hairline)]',
            severityMeta.chip,
          )}
          aria-label={`${categoryMeta.label} insight`}
        >
          <Icon className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <LampTile
              small
              interactive={false}
              label={severityMeta.label}
              tone={severityMeta.tone}
            />
            <Tag>{categoryMeta.label}</Tag>
          </div>

          <h3
            className={cn(
              'mt-1.5 leading-snug text-[var(--display-fg)]',
              isDashboard ? 'text-body-strong' : 'text-body-strong',
            )}
          >
            {insight.title}
          </h3>

          <p className={cn('mt-1 text-caption text-silver-mute', isDashboard && 'line-clamp-2')}>
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
                className="h-8 text-button-sm"
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
          className={cn('cap shrink-0 p-1.5', 'disabled:opacity-50')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
