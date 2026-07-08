/**
 * ProactiveControls — proactive mode toggle and work status display.
 *
 * Displays the current state of proactive execution:
 * - Master enable/disable toggle
 * - Active/queued work counts
 * - Last scan timestamp
 * - Buttons to trigger goal decomposition and work scanning
 *
 * Listens for proactive.* events from the event bus to update state in real-time.
 *
 * Phase 6 — Proactive Execution System — Slice 4.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DashboardEvent } from '@team-x/shared-types';
import { AlertTriangle, Bot, Loader2, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Faceplate, MetricTile, SubviewState, Tag } from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
import { Switch } from '@/components/ui/switch.js';
import { ipc } from '@/lib/ipc.js';

export interface ProactiveControlsProps {
  companyId: string;
}

export function ProactiveControls({ companyId }: ProactiveControlsProps) {
  const qc = useQueryClient();

  // Settings query for proactive enabled state and autonomy mode
  const {
    data: settings,
    isLoading: settingsLoading,
    isError: settingsError,
  } = useQuery({
    queryKey: ['settings', 'proactive'],
    queryFn: () => ipc.settings.getProactive(),
  });

  // State query for active/queued work counts
  const {
    data: state,
    isLoading: stateLoading,
    isError: stateError,
    refetch: refetchState,
  } = useQuery({
    queryKey: ['proactive', 'state', companyId],
    queryFn: () => ipc.proactive.getState({ companyId }),
    refetchInterval: 5000, // Poll every 5 seconds
  });

  // Local optimistic state for immediate UI feedback
  const [enabledOptimistic, setEnabledOptimistic] = useState<boolean | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Sync optimistic state with actual settings
  useEffect(() => {
    if (settings) {
      setEnabledOptimistic(settings.enabled);
    }
  }, [settings]);

  // Listen for proactive events to keep state in sync
  useEffect(() => {
    const unsubscribe = ipc.events.onDashboard((event: DashboardEvent) => {
      // Filter for proactive events
      if (
        event.type === 'proactive.work_started' ||
        event.type === 'proactive.work_completed' ||
        event.type === 'proactive.budget_blocked' ||
        event.type === 'proactive.blocked'
      ) {
        // Refetch state on any proactive event
        refetchState();
      }
      if (event.type === 'proactive.enabled_changed') {
        setEnabledOptimistic((event.payload as { enabled: boolean }).enabled);
      }
    });
    return unsubscribe;
  }, [refetchState]);

  // Toggle proactive mode
  const handleToggleEnabled = async (checked: boolean) => {
    setEnabledOptimistic(checked);
    try {
      await ipc.proactive.setEnabled({ companyId, enabled: checked });
      qc.invalidateQueries({ queryKey: ['settings', 'proactive'] });
    } catch (err) {
      // Revert on error
      setEnabledOptimistic(!checked);
      console.error('[proactive] Failed to toggle enabled:', err);
    }
  };

  // Trigger immediate work scan
  const handleScanNow = async () => {
    setIsScanning(true);
    try {
      const result = await ipc.proactive.scanForWork({ companyId });
      qc.invalidateQueries({ queryKey: ['proactive', 'state', companyId] });
      console.log(`[proactive] Scanned and queued ${result.queuedCount} work items`);
    } catch (err) {
      console.error('[proactive] Failed to scan for work:', err);
    } finally {
      setIsScanning(false);
    }
  };

  // Format timestamp for display
  const formatTimestamp = (ts: number | null): string => {
    if (!ts) return 'Never';
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  // Loading state
  if (settingsLoading || enabledOptimistic === null) {
    return (
      <Faceplate kicker="Autonomy" serial="PROACTIVE" bodyClassName="space-y-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-h3 text-foreground">Proactive Mode</h3>
        </div>
        <SubviewState
          lampLabel="SYNC"
          lampTone="hold"
          title="Loading proactive settings…"
          className="min-h-0 p-6"
        />
      </Faceplate>
    );
  }

  // Error state
  if (settingsError || !settings) {
    return (
      <Faceplate kicker="Autonomy" serial="PROACTIVE" bodyClassName="space-y-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-h3 text-foreground">Proactive Mode</h3>
        </div>
        <SubviewState
          lampLabel="NO-GO"
          lampTone="nogo"
          title="Failed to load proactive settings."
          className="min-h-0 p-6"
        />
      </Faceplate>
    );
  }

  const isEnabled = enabledOptimistic;

  return (
    <Faceplate kicker="Autonomy" serial="PROACTIVE" bodyClassName="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-h3 text-foreground">Proactive Mode</h3>
        </div>
        <Switch
          checked={isEnabled}
          onCheckedChange={handleToggleEnabled}
          aria-label="Toggle proactive mode"
        />
      </div>

      {/* Status description */}
      <p className="text-caption text-muted-foreground">
        {isEnabled
          ? 'Agents will actively recognize opportunities and act without explicit commands.'
          : 'Proactive mode is disabled. Agents will only respond to direct commands.'}
      </p>

      {/* Autonomy mode chip */}
      <div className="flex items-center gap-2">
        <span className="text-caption text-muted-foreground">Autonomy:</span>
        <Tag className="capitalize">{settings.autonomyMode}</Tag>
      </div>

      {/* Work status */}
      {isEnabled && (
        <div className="space-y-3">
          {stateLoading || !state ? (
            <SubviewState
              lampLabel="SYNC"
              lampTone="hold"
              title="Loading work status…"
              className="min-h-0 p-4"
            />
          ) : stateError ? (
            <div className="flex items-center gap-2 rounded-inset border border-[var(--led-nogo-edge)] bg-[var(--warn-soft)] px-2 py-1.5 text-caption text-[var(--led-nogo)]">
              <AlertTriangle className="h-3 w-3" />
              Failed to load work status
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <MetricTile label="Active Work" value={String(state.activeWork)} />
              <MetricTile label="Queued Work" value={String(state.queuedWork)} />
              <MetricTile
                label="Last Scan"
                value={formatTimestamp(state.lastScanAt)}
                className="col-span-2"
              />
            </div>
          )}

          {/* Scan Now button */}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleScanNow}
            disabled={isScanning}
          >
            {isScanning ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-3.5 w-3.5" />
                Scan for Work Now
              </>
            )}
          </Button>
        </div>
      )}

      {/* Disabled state message */}
      {!isEnabled && (
        <SubviewState
          lampLabel="STBY"
          lampTone="off"
          title="Enable proactive mode to allow agents to work autonomously"
          className="min-h-0 p-6"
        />
      )}
    </Faceplate>
  );
}

/**
 * Hook to decompose a goal proactively.
 * Returns a mutation that can be called from a "Decompose Goal" button.
 */
export function useDecomposeGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, goalId }: { companyId: string; goalId: string }) =>
      ipc.proactive.decomposeGoal({ companyId, goalId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proactive', 'state'] });
    },
  });
}

/**
 * Hook to scan for work proactively.
 * Returns a mutation that can be called from a "Scan for Work" button.
 */
export function useScanForWork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId }: { companyId: string }) => ipc.proactive.scanForWork({ companyId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proactive', 'state'] });
    },
  });
}
