import {
  MEMORY_SETTINGS_CLAMPS,
  MEMORY_TARGET_TOKEN_BUDGET_OPTIONS,
  type SettingsGetMemoryResponse,
  type SettingsSetMemoryRequest,
} from '@team-x/shared-types';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useMemorySettings, useSetMemorySettings } from '../../hooks/use-settings.js';

import { Faceplate, RecessedWell, SubviewState } from '@/components/console/index.js';
import { Input } from '@/components/ui/input.js';
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
      <Faceplate kicker="Memory" serial="LONG-RUN" bodyClassName="space-y-3">
        <h2 className="text-h2 text-foreground">Long-Run Memory</h2>
        <SubviewState
          lampLabel="SYNC"
          lampTone="hold"
          title="Loading long-run memory…"
          className="min-h-0 p-6"
        />
      </Faceplate>
    );
  }

  if (isError || !data) {
    return (
      <Faceplate kicker="Memory" serial="LONG-RUN" bodyClassName="space-y-3">
        <h2 className="text-h2 text-foreground">Long-Run Memory</h2>
        <SubviewState
          lampLabel="NO-GO"
          lampTone="nogo"
          title="Failed to load long-run memory settings."
          className="min-h-0 p-6"
        />
      </Faceplate>
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
    <section data-settings-memory="">
      <Faceplate kicker="Memory" serial="LONG-RUN" bodyClassName="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-h2 text-foreground">Long-Run Memory</h2>
          {setMemory.isPending && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-label="Saving" />
          )}
        </div>

        <p className="text-body-sm text-muted-foreground">
          These defaults shape how Team-X condenses long threads into digests, how much recent
          conversation it prioritizes, and how deep the checkpoint trail stays visible in the
          operator memory surface.
        </p>

        {/* Default pack budget — headline envelope readout + armed chooser */}
        <div className="space-y-2">
          <span className="text-label text-muted-foreground">Default pack budget</span>
          <RecessedWell className="flex items-baseline justify-between gap-3 rounded-inset px-3 py-2">
            <span className="text-numeric tabular-nums text-[var(--display-fg)]">
              {draft.defaultTargetTokenBudget.toLocaleString()}
            </span>
            <span className="text-eyebrow-sm text-[var(--display-fg-mute)]">tokens</span>
          </RecessedWell>
          <div className="flex flex-wrap gap-2">
            {MEMORY_TARGET_TOKEN_BUDGET_OPTIONS.map((budget) => {
              const isActive = draft.defaultTargetTokenBudget === budget;
              return (
                <button
                  key={budget}
                  type="button"
                  disabled={setMemory.isPending}
                  onClick={() => commit('defaultTargetTokenBudget', budget)}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-button-sm tabular-nums transition-colors',
                    isActive
                      ? 'border-[var(--armed-edge)] bg-[var(--armed-soft)] text-foreground'
                      : 'border-[var(--hairline)] bg-transparent text-muted-foreground hover:border-[var(--hairline-strong)]',
                  )}
                >
                  {budget.toLocaleString()}
                </button>
              );
            })}
          </div>
          <p className="text-caption text-muted-foreground/70">
            Autonomy &gt; Memory starts from this token envelope before any per-session override.
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="memory-recent-turn-limit" className="text-label text-muted-foreground">
              Recent turn window
            </label>
            <span className="text-code-sm tabular-nums text-foreground">
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
            className="h-8 text-code-sm"
          />
          <p className="text-caption text-muted-foreground/70">
            Fresh turns prioritized before lower-signal context is compressed (
            {MEMORY_SETTINGS_CLAMPS.recentTurnLimit.min}-
            {MEMORY_SETTINGS_CLAMPS.recentTurnLimit.max}).
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <label
              htmlFor="memory-checkpoint-history-limit"
              className="text-label text-muted-foreground"
            >
              Checkpoint history depth
            </label>
            <span className="text-code-sm tabular-nums text-foreground">
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
            className="h-8 text-code-sm"
          />
          <p className="text-caption text-muted-foreground/70">
            How many resumable checkpoints stay visible in the detailed memory view (
            {MEMORY_SETTINGS_CLAMPS.checkpointHistoryLimit.min}-
            {MEMORY_SETTINGS_CLAMPS.checkpointHistoryLimit.max}).
          </p>
        </div>

        {setMemory.isError && (
          <div className="rounded-inset border border-[var(--led-nogo-edge)] bg-[var(--warn-soft)] px-3 py-2 text-body text-[var(--led-nogo)]">
            <span className="min-w-0 truncate">Failed to save: {String(setMemory.error)}</span>
          </div>
        )}
      </Faceplate>
    </section>
  );
}
