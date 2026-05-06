import {
  MEMORY_SETTINGS_CLAMPS,
  MEMORY_TARGET_TOKEN_BUDGET_OPTIONS,
  type SettingsGetMemoryResponse,
  type SettingsSetMemoryRequest,
} from '@team-x/shared-types';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useMemorySettings, useSetMemorySettings } from '../../hooks/use-settings.js';

import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { cn } from '@/lib/utils.js';

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function MemorySection() {
  const { data, isLoading, isError } = useMemorySettings();
  const setMemory = useSetMemorySettings();
  const [draft, setDraft] = useState<SettingsGetMemoryResponse | null>(null);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  if (isLoading || !draft) {
    return (
      <section className="space-y-3" aria-busy="true">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Long-Run Memory
        </h4>
        <Skeleton className="h-40 rounded-lg" />
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Long-Run Memory
        </h4>
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          Failed to load long-run memory settings.
        </div>
      </section>
    );
  }

  function commit<K extends keyof SettingsGetMemoryResponse>(
    key: K,
    value: SettingsGetMemoryResponse[K],
  ) {
    if (!draft) return;
    if (draft[key] === value) return;
    const next = { ...draft, [key]: value };
    setDraft(next);
    setMemory.mutate({ [key]: value } as SettingsSetMemoryRequest);
  }

  return (
    <section className="space-y-3" data-settings-memory="">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Long-Run Memory
        </h4>
        {setMemory.isPending && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-label="Saving" />
        )}
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        These defaults shape how Team-X condenses long threads into digests, how much recent
        conversation it prioritizes, and how deep the checkpoint trail stays visible in the operator
        memory surface.
      </p>

      <div className="space-y-4 rounded-lg border border-border bg-surface-50 p-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[11px] font-medium text-muted-foreground">
              Default pack budget
            </span>
            <span className="text-[11px] font-mono tabular-nums text-foreground">
              {draft.defaultTargetTokenBudget.toLocaleString()}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {MEMORY_TARGET_TOKEN_BUDGET_OPTIONS.map((budget) => (
              <Button
                key={budget}
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  'text-xs',
                  draft.defaultTargetTokenBudget === budget
                    ? 'brand-selected'
                    : 'border-white/10 bg-black/10 hover:bg-black/20',
                )}
                disabled={setMemory.isPending}
                onClick={() => commit('defaultTargetTokenBudget', budget)}
              >
                {budget.toLocaleString()}
              </Button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground/70">
            Autonomy &gt; Memory starts from this token envelope before any per-session override.
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <label
              htmlFor="memory-recent-turn-limit"
              className="text-[11px] font-medium text-muted-foreground"
            >
              Recent turn window
            </label>
            <span className="text-[11px] font-mono tabular-nums text-foreground">
              {draft.recentTurnLimit}
            </span>
          </div>
          <Input
            id="memory-recent-turn-limit"
            type="number"
            inputMode="numeric"
            min={MEMORY_SETTINGS_CLAMPS.recentTurnLimit.min}
            max={MEMORY_SETTINGS_CLAMPS.recentTurnLimit.max}
            step={1}
            value={draft.recentTurnLimit}
            onChange={(event) =>
              setDraft({
                ...draft,
                recentTurnLimit: Number.parseInt(event.target.value, 10) || 0,
              })
            }
            onBlur={() => {
              const next = clamp(
                draft.recentTurnLimit,
                MEMORY_SETTINGS_CLAMPS.recentTurnLimit.min,
                MEMORY_SETTINGS_CLAMPS.recentTurnLimit.max,
              );
              if (next !== draft.recentTurnLimit) {
                setDraft({ ...draft, recentTurnLimit: next });
              }
              commit('recentTurnLimit', next);
            }}
            disabled={setMemory.isPending}
            className="h-8 text-xs font-mono"
          />
          <p className="text-[10px] text-muted-foreground/70">
            Fresh turns prioritized before lower-signal context is compressed (
            {MEMORY_SETTINGS_CLAMPS.recentTurnLimit.min}-
            {MEMORY_SETTINGS_CLAMPS.recentTurnLimit.max}).
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <label
              htmlFor="memory-checkpoint-history-limit"
              className="text-[11px] font-medium text-muted-foreground"
            >
              Checkpoint history depth
            </label>
            <span className="text-[11px] font-mono tabular-nums text-foreground">
              {draft.checkpointHistoryLimit}
            </span>
          </div>
          <Input
            id="memory-checkpoint-history-limit"
            type="number"
            inputMode="numeric"
            min={MEMORY_SETTINGS_CLAMPS.checkpointHistoryLimit.min}
            max={MEMORY_SETTINGS_CLAMPS.checkpointHistoryLimit.max}
            step={1}
            value={draft.checkpointHistoryLimit}
            onChange={(event) =>
              setDraft({
                ...draft,
                checkpointHistoryLimit: Number.parseInt(event.target.value, 10) || 0,
              })
            }
            onBlur={() => {
              const next = clamp(
                draft.checkpointHistoryLimit,
                MEMORY_SETTINGS_CLAMPS.checkpointHistoryLimit.min,
                MEMORY_SETTINGS_CLAMPS.checkpointHistoryLimit.max,
              );
              if (next !== draft.checkpointHistoryLimit) {
                setDraft({ ...draft, checkpointHistoryLimit: next });
              }
              commit('checkpointHistoryLimit', next);
            }}
            disabled={setMemory.isPending}
            className="h-8 text-xs font-mono"
          />
          <p className="text-[10px] text-muted-foreground/70">
            How many resumable checkpoints stay visible in the detailed memory view (
            {MEMORY_SETTINGS_CLAMPS.checkpointHistoryLimit.min}-
            {MEMORY_SETTINGS_CLAMPS.checkpointHistoryLimit.max}).
          </p>
        </div>
      </div>

      {setMemory.isError && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <span className="min-w-0 truncate">Failed to save: {String(setMemory.error)}</span>
        </div>
      )}
    </section>
  );
}
