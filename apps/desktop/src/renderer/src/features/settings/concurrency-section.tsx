/**
 * ConcurrencySection — live-editable orchestrator slots + per-provider caps.
 *
 * Phase 3 — M19, widened in runtime-limits follow-up.
 */

import {
  CONCURRENCY_SETTINGS_CLAMPS,
  type SettingsGetConcurrencyResponse,
} from '@team-x/shared-types';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Faceplate, SubviewState } from '@/components/console/index.js';
import { Input } from '@/components/ui/input.js';
import { useProviders } from '@/hooks/use-providers.js';
import { useConcurrencySettings, useSetConcurrency } from '@/hooks/use-settings.js';

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function ConcurrencySection() {
  const { data, isLoading, isError } = useConcurrencySettings();
  const { data: providers } = useProviders();
  const setConcurrency = useSetConcurrency();
  const [draft, setDraft] = useState<SettingsGetConcurrencyResponse | null>(null);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  if (isLoading) {
    return (
      <Faceplate kicker="Runtime" serial="CONCURRENCY" bodyClassName="space-y-3">
        <h2 className="text-h2 text-foreground">Concurrency</h2>
        <SubviewState
          lampLabel="SYNC"
          lampTone="hold"
          title="Loading concurrency…"
          className="min-h-0 p-6"
        />
      </Faceplate>
    );
  }

  if (isError || !data || !draft) {
    return (
      <Faceplate kicker="Runtime" serial="CONCURRENCY" bodyClassName="space-y-3">
        <h2 className="text-h2 text-foreground">Concurrency</h2>
        <SubviewState
          lampLabel="NO-GO"
          lampTone="nogo"
          title="Failed to load concurrency settings."
          className="min-h-0 p-6"
        />
      </Faceplate>
    );
  }

  const current = draft;

  const providerKindCounts = new Map<string, number>();
  for (const provider of providers ?? []) {
    providerKindCounts.set(provider.kind, (providerKindCounts.get(provider.kind) ?? 0) + 1);
  }

  const visibleKinds = Array.from(providerKindCounts.keys()).sort((a, b) => a.localeCompare(b));

  const slotClamp = CONCURRENCY_SETTINGS_CLAMPS.orchestratorSlots;
  const capClamp = CONCURRENCY_SETTINGS_CLAMPS.providerCap;

  function commitSlots(nextValue: number) {
    const next = clamp(nextValue, slotClamp.min, slotClamp.max, slotClamp.default);
    if (next !== current.orchestratorSlots) {
      setDraft({ ...current, orchestratorSlots: next });
      setConcurrency.mutate({ orchestratorSlots: next });
      return;
    }
    if (current.orchestratorSlots !== nextValue) {
      setDraft({ ...current, orchestratorSlots: next });
    }
  }

  function commitProviderCap(kind: string, nextValue: number) {
    const fallback = current.providerCaps[kind] ?? capClamp.min;
    const next = clamp(nextValue, capClamp.min, capClamp.max, fallback);
    if (current.providerCaps[kind] !== next) {
      setDraft({
        ...current,
        providerCaps: {
          ...current.providerCaps,
          [kind]: next,
        },
      });
      setConcurrency.mutate({ providerCaps: { [kind]: next } });
      return;
    }
    if (current.providerCaps[kind] !== nextValue) {
      setDraft({
        ...current,
        providerCaps: {
          ...current.providerCaps,
          [kind]: next,
        },
      });
    }
  }

  return (
    <Faceplate kicker="Runtime" serial="CONCURRENCY" bodyClassName="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-h2 text-foreground">Concurrency</h2>
        {setConcurrency.isPending && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-label="Saving" />
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="orchestrator-slots" className="text-label text-muted-foreground">
            Orchestrator Slots
          </label>
          <span className="text-code-sm text-foreground tabular-nums">
            {draft.orchestratorSlots}
          </span>
        </div>
        <Input
          id="orchestrator-slots"
          type="number"
          inputMode="numeric"
          min={slotClamp.min}
          max={slotClamp.max}
          step={1}
          value={current.orchestratorSlots}
          onChange={(e) =>
            setDraft({
              ...current,
              orchestratorSlots: Number.parseInt(e.target.value, 10) || 0,
            })
          }
          onBlur={() => commitSlots(current.orchestratorSlots)}
          disabled={setConcurrency.isPending}
          className="h-8 text-code-sm"
        />
        <p className="text-caption text-muted-foreground/70">
          Maximum concurrent agent work items across all providers ({slotClamp.min}–{slotClamp.max},
          default {slotClamp.default}).
        </p>
      </div>

      <div className="space-y-2">
        <div>
          <p className="text-body-strong text-foreground">Per-Provider Kind Caps</p>
          <p className="text-caption text-muted-foreground mt-0.5">
            Maximum concurrent requests per provider kind for configured provider kinds.
          </p>
        </div>

        {visibleKinds.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--hairline)] px-3 py-3 text-caption text-muted-foreground">
            No provider kinds configured yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {visibleKinds.map((kind) => {
              const providerCount = providerKindCounts.get(kind) ?? 0;
              const capValue = current.providerCaps[kind] ?? capClamp.min;
              return (
                <div key={kind} className="rounded-inset border border-[var(--hairline)] px-3 py-2">
                  <div className="mb-1.5 flex items-center justify-between gap-4">
                    <label
                      htmlFor={`provider-cap-${kind}`}
                      className="text-code-sm text-muted-foreground"
                    >
                      {kind}
                      {providerCount > 1 ? ` ×${providerCount}` : ''}
                    </label>
                    <span className="text-code-sm text-foreground tabular-nums">{capValue}</span>
                  </div>
                  <Input
                    id={`provider-cap-${kind}`}
                    type="number"
                    inputMode="numeric"
                    min={capClamp.min}
                    max={capClamp.max}
                    step={1}
                    value={capValue}
                    onChange={(e) =>
                      setDraft({
                        ...current,
                        providerCaps: {
                          ...current.providerCaps,
                          [kind]: Number.parseInt(e.target.value, 10) || 0,
                        },
                      })
                    }
                    onBlur={() => commitProviderCap(kind, capValue)}
                    disabled={setConcurrency.isPending}
                    className="h-8 text-code-sm"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Faceplate>
  );
}
