/**
 * ConcurrencySection — orchestrator slots display + per-provider caps.
 *
 * Phase 3 — M19.
 */

import { Loader2, Sliders } from 'lucide-react';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useConcurrencySettings, useSetConcurrency } from '@/hooks/use-settings.js';

const SLOT_OPTIONS = [2, 4, 6, 8, 10];

export function ConcurrencySection() {
  const { data, isLoading } = useConcurrencySettings();
  const setConcurrency = useSetConcurrency();

  if (isLoading || !data) {
    return (
      <section className="space-y-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Concurrency
        </h4>
        <Skeleton className="h-24 rounded-lg" />
      </section>
    );
  }

  const { orchestratorSlots, providerCaps } = data;

  function handleSlotChange(slots: number) {
    setConcurrency.mutate({ orchestratorSlots: slots });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Sliders className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Concurrency
        </h4>
        {setConcurrency.isPending && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Orchestrator slots */}
      <div className="rounded-lg border border-border bg-surface-50 px-4 py-3">
        <p className="text-xs font-medium text-foreground">Orchestrator Slots</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Maximum concurrent agent work items across all providers.
        </p>
        <div className="flex items-center gap-1.5 mt-2">
          {SLOT_OPTIONS.map((n) => (
            <Button
              key={`slot-${n}`}
              variant="outline"
              size="sm"
              onClick={() => handleSlotChange(n)}
              disabled={setConcurrency.isPending}
              className={`h-7 w-9 text-xs ${
                orchestratorSlots === n ? 'bg-brand/10 text-brand border-brand/30' : ''
              }`}
            >
              {n}
            </Button>
          ))}
        </div>
      </div>

      {/* Per-provider caps */}
      <div className="rounded-lg border border-border bg-surface-50 px-4 py-3">
        <p className="text-xs font-medium text-foreground">Per-Provider Caps</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Maximum concurrent requests per provider (from design doc defaults).
        </p>
        <div className="mt-2 grid grid-cols-2 lg:grid-cols-3 gap-2">
          {Object.entries(providerCaps)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([kind, cap]) => (
              <div
                key={kind}
                className="flex items-center justify-between rounded-md border border-border px-3 py-1.5"
              >
                <span className="text-[11px] font-mono text-muted-foreground">{kind}</span>
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 font-mono text-foreground"
                >
                  {cap}
                </Badge>
              </div>
            ))}
        </div>
      </div>
    </section>
  );
}
