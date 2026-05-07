/**
 * CopilotSection — copilot-service settings (M33).
 *
 * Backs the three `copilot_*` settings keys introduced in M33: `copilot_enabled`
 * (bool), `copilot_interval_minutes` (1–60), and `copilot_categories` (subset of
 * `COPILOT_CATEGORIES`). Every save synchronously restarts the per-company
 * `CopilotAnalyzerService` timer so the new interval / enabled / categories
 * take effect without an app restart.
 *
 * Phase 5 — M33 T7.
 */

import {
  COPILOT_CATEGORIES,
  COPILOT_CATEGORY_WEIGHTS_DEFAULT,
  COPILOT_CATEGORY_WEIGHT_CLAMP,
  COPILOT_SETTINGS_CLAMPS,
  type CopilotCategory,
  type CopilotCategoryWeights,
  type SettingsGetCopilotResponse,
} from '@team-x/shared-types';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { formatCopilotWeightLabel } from '../copilot/copilot-helpers.js';

import { Input } from '@/components/ui/input.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import {
  useCopilotSettings,
  useCopilotWeights,
  useSetCopilot,
  useSetCopilotWeights,
} from '@/hooks/use-settings.js';
import { useAppStore } from '@/store/app-store.js';

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampWeight(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return COPILOT_CATEGORY_WEIGHT_CLAMP.default;
  const clamped = Math.max(
    COPILOT_CATEGORY_WEIGHT_CLAMP.min,
    Math.min(COPILOT_CATEGORY_WEIGHT_CLAMP.max, value),
  );
  return Math.round(clamped * 10) / 10;
}

function copyWeights(weights: CopilotCategoryWeights): CopilotCategoryWeights {
  return { ...weights };
}

/** Human-readable labels for category chips. */
const CATEGORY_LABELS: Record<CopilotCategory, string> = {
  operational: 'Operational',
  cost: 'Cost',
  org: 'Org Health',
  workflow: 'Workflow',
  anomaly: 'Anomaly',
};

export function CopilotSection() {
  const companyId = useAppStore((s) => s.companyId);
  const { data, isLoading, isError } = useCopilotSettings();
  const weightsQuery = useCopilotWeights(companyId);
  const setCopilot = useSetCopilot();
  const setCopilotWeights = useSetCopilotWeights();

  const [draft, setDraft] = useState<SettingsGetCopilotResponse | null>(null);
  const [weightDraft, setWeightDraft] = useState<CopilotCategoryWeights | null>(null);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  useEffect(() => {
    if (weightsQuery.data) setWeightDraft(copyWeights(weightsQuery.data.weights));
  }, [weightsQuery.data]);

  if (isLoading || !draft) {
    return (
      <section className="space-y-3" aria-busy="true">
        <h2 className="text-h2 text-foreground">Copilot</h2>
        <Skeleton className="h-56 rounded-lg" />
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section className="space-y-3">
        <h2 className="text-h2 text-foreground">Copilot</h2>
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-body text-red-400">
          Failed to load copilot settings.
        </div>
      </section>
    );
  }

  function commitEnabled(nextEnabled: boolean) {
    if (!draft || !companyId) return;
    if (draft.enabled === nextEnabled) return;
    setDraft({ ...draft, enabled: nextEnabled });
    setCopilot.mutate({ companyId, enabled: nextEnabled });
  }

  function commitIntervalMinutes(value: number) {
    if (!draft || !companyId) return;
    if (draft.intervalMinutes === value) return;
    setDraft({ ...draft, intervalMinutes: value });
    setCopilot.mutate({ companyId, intervalMinutes: value });
  }

  function toggleCategory(cat: CopilotCategory) {
    if (!draft || !companyId) return;
    const has = draft.categories.includes(cat);
    const next = has ? draft.categories.filter((c) => c !== cat) : [...draft.categories, cat];
    // Empty selection falls back server-side to the full set; echo that
    // into the optimistic draft so the UI doesn't flash empty state
    // between the mutation and the query invalidation.
    const optimistic = next.length === 0 ? (COPILOT_CATEGORIES.slice() as CopilotCategory[]) : next;
    setDraft({ ...draft, categories: optimistic });
    setCopilot.mutate({ companyId, categories: next });
  }

  function commitWeight(cat: CopilotCategory, value: number) {
    if (!weightDraft || !companyId) return;
    const next = clampWeight(value);
    setWeightDraft({ ...weightDraft, [cat]: next });
    setCopilotWeights.mutate({ companyId, weights: { [cat]: next } });
  }

  const { intervalMinutes } = COPILOT_SETTINGS_CLAMPS;
  const weights = weightDraft ?? COPILOT_CATEGORY_WEIGHTS_DEFAULT;

  return (
    <section className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h2 className="text-h2 text-foreground">Copilot</h2>
        {(setCopilot.isPending || setCopilotWeights.isPending) && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-label="Saving" />
        )}
      </div>

      {/* Description */}
      <p className="text-body-sm text-muted-foreground mt-1">
        The copilot analyzer watches company activity and proposes actionable insights on a
        schedule. Turn it off, change its cadence, or narrow the categories it reports on.
      </p>

      {/* Knobs */}
      <div className="rounded-lg border border-border bg-surface-50 p-4 space-y-4">
        {/* Enabled toggle */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <label htmlFor="copilot-enabled" className="text-label text-muted-foreground">
              Analyzer Enabled
            </label>
            <p className="text-caption text-muted-foreground/70">
              When off, every scheduled and event-triggered tick short-circuits.
            </p>
          </div>
          <button
            id="copilot-enabled"
            type="button"
            role="switch"
            aria-checked={draft.enabled}
            onClick={() => commitEnabled(!draft.enabled)}
            disabled={setCopilot.isPending || !companyId}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
              draft.enabled
                ? 'border-[#FFAA2024]/70 bg-[#FFAA2024]/80'
                : 'border-border bg-surface-200'
            } focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-background transition-transform ${
                draft.enabled ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* Interval minutes */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="copilot-interval-minutes" className="text-label text-muted-foreground">
              Scheduled Interval (minutes)
            </label>
            <span className="text-code-sm text-foreground tabular-nums">
              {draft.intervalMinutes}
            </span>
          </div>
          <Input
            id="copilot-interval-minutes"
            type="number"
            inputMode="numeric"
            min={intervalMinutes.min}
            max={intervalMinutes.max}
            step={1}
            value={draft.intervalMinutes}
            onChange={(e) =>
              setDraft({
                ...draft,
                intervalMinutes: Number.parseInt(e.target.value, 10) || 0,
              })
            }
            onBlur={() => {
              const next = clamp(draft.intervalMinutes, intervalMinutes.min, intervalMinutes.max);
              if (next !== draft.intervalMinutes) setDraft({ ...draft, intervalMinutes: next });
              commitIntervalMinutes(next);
            }}
            disabled={setCopilot.isPending || !companyId}
            className="h-8 text-code-sm"
          />
          <p className="text-caption text-muted-foreground/70">
            How often the analyzer tick fires ({intervalMinutes.min}–{intervalMinutes.max}, default{' '}
            {intervalMinutes.default}). Saves restart the per-company timer immediately.
          </p>
        </div>

        {/* Categories */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-label text-muted-foreground">Allowed Categories</span>
            <span className="text-code-sm text-foreground/70 tabular-nums">
              {draft.categories.length}/{COPILOT_CATEGORIES.length}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {COPILOT_CATEGORIES.map((cat) => {
              const checked = draft.categories.includes(cat);
              return (
                <label
                  key={cat}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-caption transition-colors ${
                    checked
                      ? 'border-[#FFAA2024]/50 bg-[#FFAA2024]/10 text-foreground'
                      : 'border-border bg-surface-50 text-muted-foreground hover:text-foreground'
                  } ${setCopilot.isPending || !companyId ? 'opacity-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCategory(cat)}
                    disabled={setCopilot.isPending || !companyId}
                    className="h-3 w-3 rounded border-border accent-brand"
                  />
                  <span>{CATEGORY_LABELS[cat]}</span>
                </label>
              );
            })}
          </div>
          <p className="text-caption text-muted-foreground/70">
            The analyzer only proposes insights in categories you enable. Clearing every category
            falls back to the full set.
          </p>
        </div>

        {/* Category weighting */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-label text-muted-foreground">Category weighting</span>
            {weightsQuery.isFetching && (
              <span className="text-caption font-mono text-muted-foreground/70">Loading</span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2">
            {COPILOT_CATEGORIES.map((cat) => {
              const value = weights[cat];
              return (
                <div
                  key={cat}
                  className="grid min-h-10 grid-cols-[minmax(6rem,1fr)_4.5rem_5rem] items-center gap-2"
                  data-copilot-weight-category={cat}
                >
                  <label
                    htmlFor={`copilot-weight-${cat}`}
                    className="min-w-0 text-label text-muted-foreground"
                  >
                    {CATEGORY_LABELS[cat]}
                  </label>
                  <span className="text-right text-code-sm text-foreground tabular-nums">
                    {formatCopilotWeightLabel(value)}
                  </span>
                  <Input
                    id={`copilot-weight-${cat}`}
                    type="number"
                    inputMode="decimal"
                    min={COPILOT_CATEGORY_WEIGHT_CLAMP.min}
                    max={COPILOT_CATEGORY_WEIGHT_CLAMP.max}
                    step={0.1}
                    value={value}
                    onChange={(e) =>
                      setWeightDraft({
                        ...weights,
                        [cat]: Number.parseFloat(e.target.value) || 0,
                      })
                    }
                    onBlur={() => commitWeight(cat, value)}
                    disabled={
                      setCopilotWeights.isPending ||
                      weightsQuery.isLoading ||
                      !companyId ||
                      !weightDraft
                    }
                    className="h-8 text-code-sm"
                  />
                </div>
              );
            })}
          </div>
          <p className="text-caption text-muted-foreground/70">
            Lower noisy categories toward 0.0x or boost useful ones up to 2.0x.
          </p>
        </div>
      </div>

      {/* Save error banner */}
      {setCopilot.isError && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-body text-red-400">
          <span className="min-w-0 truncate">Failed to save: {String(setCopilot.error)}</span>
        </div>
      )}

      {setCopilotWeights.isError && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-body text-red-400">
          <span className="min-w-0 truncate">
            Failed to save category weights: {String(setCopilotWeights.error)}
          </span>
        </div>
      )}
    </section>
  );
}
