/**
 * RuntimeSection — strategy selector + hardware profile display.
 *
 * Phase 3 — M19.
 */

import type { RuntimeStrategy } from '@team-x/shared-types';
import { Activity, Cpu, HardDrive, Loader2, Monitor, Zap } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton.js';
import { useRuntimeSettings, useSetRuntime } from '@/hooks/use-settings.js';

interface StrategyOption {
  value: RuntimeStrategy;
  label: string;
  description: string;
}

const STRATEGIES: StrategyOption[] = [
  { value: 'auto', label: 'Auto', description: 'Profile hardware and pick the best strategy' },
  { value: 'hybrid', label: 'Hybrid', description: 'Mix local + cloud providers (4 slots)' },
  { value: 'always-on', label: 'Always-On', description: 'Max cloud throughput (8 slots)' },
  { value: 'lean', label: 'Lean', description: 'Conservative, minimal resource usage (2 slots)' },
];

export function RuntimeSection() {
  const { data, isLoading } = useRuntimeSettings();
  const setRuntime = useSetRuntime();

  if (isLoading || !data) {
    return (
      <section className="space-y-3">
        <h2 className="text-h2 text-foreground">Runtime Strategy</h2>
        <Skeleton className="h-32 rounded-lg" />
      </section>
    );
  }

  const { strategy, hardwareProfile: hw, effectiveSlots, reason } = data;

  return (
    <section className="space-y-3">
      <h2 className="text-h2 text-foreground">Runtime Strategy</h2>

      {/* Strategy selector */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {STRATEGIES.map((opt) => {
          const isActive = strategy === opt.value;
          return (
            <button
              type="button"
              key={opt.value}
              onClick={() => setRuntime.mutate({ strategy: opt.value })}
              disabled={setRuntime.isPending}
              className={`
                flex flex-col items-start rounded-lg border p-3 text-left transition-colors
                ${
                  isActive
                    ? 'brand-selected'
                    : 'border-border bg-surface-50 text-muted-foreground hover:border-foreground/20 hover:text-foreground'
                }
              `}
            >
              <span className="text-body-strong">{opt.label}</span>
              <span className="text-caption mt-0.5 opacity-70">{opt.description}</span>
            </button>
          );
        })}
      </div>

      {/* Effective state */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-50 px-4 py-3">
        <Activity className="h-4 w-4 text-brand shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-body-strong text-foreground">
            {effectiveSlots} orchestrator slot{effectiveSlots !== 1 ? 's' : ''} active
          </p>
          <p className="text-caption text-muted-foreground mt-0.5 truncate">{reason}</p>
        </div>
        {setRuntime.isPending && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Hardware profile */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface-50 px-3 py-2">
          <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
          <div>
            <p className="text-caption text-muted-foreground">CPU</p>
            <p className="text-body-strong">{hw.cpuCores} cores</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface-50 px-3 py-2">
          <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
          <div>
            <p className="text-caption text-muted-foreground">RAM</p>
            <p className="text-body-strong">{hw.totalRamGb} GB</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface-50 px-3 py-2">
          <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
          <div>
            <p className="text-caption text-muted-foreground">GPU</p>
            <p className="text-body-strong truncate">
              {hw.gpuDetected ? (hw.gpuName ?? 'Detected') : 'None'}
            </p>
          </div>
        </div>
        {hw.gpuDetected && hw.gpuVramGb && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface-50 px-3 py-2">
            <Zap className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-caption text-muted-foreground">VRAM</p>
              <p className="text-body-strong">{hw.gpuVramGb} GB</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
