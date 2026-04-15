/**
 * AgenticSection — agentic-loop budget caps (max steps, max tokens, timeout ms).
 *
 * Backs the three `agentic_*` settings keys introduced in M31. Read by
 * `AgenticLoopService` at run-start so every new complex_request observes
 * the user's current preference without a restart.
 *
 * NOTE: Team-X has no jsdom/@testing-library infrastructure in the
 * renderer. The component is covered end-to-end by the M31 T8
 * `agentic-loop.spec.ts` Playwright spec (canned test-mode provider).
 *
 * Phase 5 — M31 T7.
 */

import { useEffect, useState } from 'react';

import {
  AGENTIC_SETTINGS_CLAMPS,
  type SettingsGetAgenticResponse,
  type SettingsSetAgenticRequest,
} from '@team-x/shared-types';
import { AlertTriangle, Loader2, Workflow } from 'lucide-react';

import { Input } from '@/components/ui/input.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAgenticSettings, useSetAgentic } from '@/hooks/use-settings.js';

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function AgenticSection() {
  const { data, isLoading, isError } = useAgenticSettings();
  const setAgentic = useSetAgentic();

  // Local draft so users can type freely; commits fire onBlur with
  // clamping. Mirrors the rag-section pattern so the two pieces of
  // the Settings panel behave identically from the user's POV.
  const [draft, setDraft] = useState<SettingsGetAgenticResponse | null>(null);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  if (isLoading || !draft) {
    return (
      <section className="space-y-3" aria-busy="true">
        <div className="flex items-center gap-2">
          <Workflow className="h-3.5 w-3.5 text-muted-foreground" />
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Agentic Loop
          </h4>
        </div>
        <Skeleton className="h-36 rounded-lg" />
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Workflow className="h-3.5 w-3.5 text-muted-foreground" />
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Agentic Loop
          </h4>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          Failed to load agentic loop settings.
        </div>
      </section>
    );
  }

  function commit<K extends keyof SettingsGetAgenticResponse>(
    key: K,
    value: SettingsGetAgenticResponse[K],
  ) {
    if (!draft) return;
    if (draft[key] === value) return;
    setDraft({ ...draft, [key]: value });
    setAgentic.mutate({ [key]: value } as SettingsSetAgenticRequest);
  }

  const { maxSteps, maxTokens, timeoutMs } = AGENTIC_SETTINGS_CLAMPS;
  // Surface timeout bounds in seconds in the helper text — the
  // underlying key is stored in ms so the agentic loop can pass it
  // straight to `setTimeout` without converting.
  const timeoutMinSec = Math.round(timeoutMs.min / 1000);
  const timeoutMaxSec = Math.round(timeoutMs.max / 1000);

  return (
    <section className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Workflow className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Agentic Loop
        </h4>
        {setAgentic.isPending && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-label="Saving" />
        )}
      </div>

      {/* Description */}
      <p className="text-[11px] text-muted-foreground leading-snug">
        Budget caps for the ReAct agentic loop triggered by complex requests from the command
        palette. Tighter caps mean faster termination; wider caps allow deeper reasoning at the cost
        of tokens and wall-clock time.
      </p>

      {/* Knobs */}
      <div className="rounded-lg border border-border bg-surface-50 p-4 space-y-4">
        {/* Max steps */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <label
              htmlFor="agentic-max-steps"
              className="text-[11px] font-medium text-muted-foreground"
            >
              Max Steps
            </label>
            <span className="text-[11px] font-mono text-foreground tabular-nums">
              {draft.maxSteps}
            </span>
          </div>
          <Input
            id="agentic-max-steps"
            type="number"
            inputMode="numeric"
            min={maxSteps.min}
            max={maxSteps.max}
            step={1}
            value={draft.maxSteps}
            onChange={(e) =>
              setDraft({ ...draft, maxSteps: Number.parseInt(e.target.value, 10) || 0 })
            }
            onBlur={() => {
              const next = clamp(draft.maxSteps, maxSteps.min, maxSteps.max);
              if (next !== draft.maxSteps) setDraft({ ...draft, maxSteps: next });
              commit('maxSteps', next);
            }}
            disabled={setAgentic.isPending}
            className="h-8 text-xs font-mono"
          />
          <p className="text-[10px] text-muted-foreground/70">
            Maximum ReAct steps before the loop terminates with{' '}
            <span className="font-mono">budget_exhausted</span> ({maxSteps.min}–{maxSteps.max},
            default {maxSteps.default}).
          </p>
        </div>

        {/* Max tokens */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <label
              htmlFor="agentic-max-tokens"
              className="text-[11px] font-medium text-muted-foreground"
            >
              Max Tokens
            </label>
            <span className="text-[11px] font-mono text-foreground tabular-nums">
              {draft.maxTokens.toLocaleString()}
            </span>
          </div>
          <Input
            id="agentic-max-tokens"
            type="number"
            inputMode="numeric"
            min={maxTokens.min}
            max={maxTokens.max}
            step={100}
            value={draft.maxTokens}
            onChange={(e) =>
              setDraft({ ...draft, maxTokens: Number.parseInt(e.target.value, 10) || 0 })
            }
            onBlur={() => {
              const next = clamp(draft.maxTokens, maxTokens.min, maxTokens.max);
              if (next !== draft.maxTokens) setDraft({ ...draft, maxTokens: next });
              commit('maxTokens', next);
            }}
            disabled={setAgentic.isPending}
            className="h-8 text-xs font-mono"
          />
          <p className="text-[10px] text-muted-foreground/70">
            Token budget across all steps ({maxTokens.min.toLocaleString()}–
            {maxTokens.max.toLocaleString()}, default {maxTokens.default.toLocaleString()}).
          </p>
        </div>

        {/* Timeout ms */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <label
              htmlFor="agentic-timeout-ms"
              className="text-[11px] font-medium text-muted-foreground"
            >
              Timeout
            </label>
            <span className="text-[11px] font-mono text-foreground tabular-nums">
              {Math.round(draft.timeoutMs / 1000).toLocaleString()}s
            </span>
          </div>
          <Input
            id="agentic-timeout-ms"
            type="number"
            inputMode="numeric"
            min={timeoutMs.min}
            max={timeoutMs.max}
            step={1000}
            value={draft.timeoutMs}
            onChange={(e) =>
              setDraft({ ...draft, timeoutMs: Number.parseInt(e.target.value, 10) || 0 })
            }
            onBlur={() => {
              const next = clamp(draft.timeoutMs, timeoutMs.min, timeoutMs.max);
              if (next !== draft.timeoutMs) setDraft({ ...draft, timeoutMs: next });
              commit('timeoutMs', next);
            }}
            disabled={setAgentic.isPending}
            className="h-8 text-xs font-mono"
          />
          <p className="text-[10px] text-muted-foreground/70">
            Wall-clock timeout in milliseconds ({timeoutMs.min.toLocaleString()}–
            {timeoutMs.max.toLocaleString()}, default {timeoutMs.default.toLocaleString()} —
            approximately {timeoutMinSec}s to {timeoutMaxSec}s).
          </p>
        </div>
      </div>

      {/* Save error banner */}
      {setAgentic.isError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 truncate">Failed to save: {String(setAgentic.error)}</span>
        </div>
      )}
    </section>
  );
}
