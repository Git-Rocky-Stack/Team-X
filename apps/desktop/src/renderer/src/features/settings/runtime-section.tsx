/**
 * RuntimeSection — strategy selector + hardware profile display.
 *
 * Phase 3 — M19.
 */

import type { RuntimeStrategy } from '@team-x/shared-types';
import { Activity, Cpu, HardDrive, Loader2, Monitor, Zap } from 'lucide-react';

import { Faceplate, MetricTile, SubviewState } from '@/components/console/index.js';
import { useRuntimeSettings, useSetRuntime } from '@/hooks/use-settings.js';
import { cn } from '@/lib/utils.js';

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
      <Faceplate kicker="Runtime" serial="STRATEGY" bodyClassName="space-y-3">
        <h2 className="text-h2 text-foreground">Runtime Strategy</h2>
        <SubviewState
          lampLabel="SYNC"
          lampTone="hold"
          title="Loading runtime strategy…"
          className="min-h-0 p-6"
        />
      </Faceplate>
    );
  }

  const { strategy, hardwareProfile: hw, effectiveSlots, reason } = data;

  return (
    <Faceplate kicker="Runtime" serial="STRATEGY" bodyClassName="space-y-3">
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
              className={cn(
                'flex flex-col items-start rounded-lg border p-3 text-left transition-colors',
                isActive
                  ? 'border-[var(--armed-edge)] bg-[var(--armed-soft)] text-foreground'
                  : 'border-[var(--hairline)] bg-transparent text-muted-foreground hover:border-[var(--hairline-strong)] hover:text-foreground',
              )}
            >
              <span className="text-body-strong">{opt.label}</span>
              <span className="text-caption mt-0.5 opacity-70">{opt.description}</span>
            </button>
          );
        })}
      </div>

      {/* Effective state */}
      <div className="flex items-center gap-3 rounded-inset border border-[var(--hairline)] px-4 py-3">
        <Activity className="h-4 w-4 text-[var(--armed)] shrink-0" />
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
        <MetricTile label="CPU" value={`${hw.cpuCores} cores`} icon={Cpu} />
        <MetricTile label="RAM" value={`${hw.totalRamGb} GB`} icon={HardDrive} />
        <MetricTile
          label="GPU"
          value={hw.gpuDetected ? (hw.gpuName ?? 'Detected') : 'None'}
          icon={Monitor}
        />
        {hw.gpuDetected && hw.gpuVramGb && (
          <MetricTile label="VRAM" value={`${hw.gpuVramGb} GB`} icon={Zap} />
        )}
      </div>
    </Faceplate>
  );
}
