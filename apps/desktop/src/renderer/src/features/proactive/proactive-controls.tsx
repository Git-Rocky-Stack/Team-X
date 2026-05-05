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

import { Button } from '@/components/ui/button.js';
import { Card } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
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
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Proactive Mode</h3>
        </div>
        <Skeleton className="h-24 w-full" />
      </Card>
    );
  }

  // Error state
  if (settingsError || !settings) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Proactive Mode</h3>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          Failed to load proactive settings.
        </div>
      </Card>
    );
  }

  const isEnabled = enabledOptimistic;

  return (
    <Card className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Proactive Mode</h3>
        </div>
        <Switch
          checked={isEnabled}
          onCheckedChange={handleToggleEnabled}
          aria-label="Toggle proactive mode"
        />
      </div>

      {/* Status description */}
      <p className="text-xs text-muted-foreground mb-4">
        {isEnabled
          ? 'Agents will actively recognize opportunities and act without explicit commands.'
          : 'Proactive mode is disabled. Agents will only respond to direct commands.'}
      </p>

      {/* Autonomy mode badge */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-muted-foreground">Autonomy:</span>
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium capitalize">
          {settings.autonomyMode}
        </span>
      </div>

      {/* Work status */}
      {isEnabled && (
        <div className="space-y-3">
          {stateLoading || !state ? (
            <Skeleton className="h-16 w-full" />
          ) : stateError ? (
            <div className="flex items-center gap-2 rounded border border-red-400/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-400">
              <AlertTriangle className="h-3 w-3" />
              Failed to load work status
            </div>
          ) : (
            <div className="rounded-lg bg-muted/50 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Active Work</span>
                <span className="font-semibold">{state.activeWork}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Queued Work</span>
                <span className="font-semibold">{state.queuedWork}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Last Scan</span>
                <span className="font-semibold">{formatTimestamp(state.lastScanAt)}</span>
              </div>
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
        <div className="rounded-lg bg-muted/50 p-3 text-center text-xs text-muted-foreground">
          Enable proactive mode to allow agents to work autonomously
        </div>
      )}
    </Card>
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
