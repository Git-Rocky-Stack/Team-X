/**
 * ProactiveControls — per-company proactive switch, autonomy mode, and work
 * status for the dashboard.
 *
 * Two scopes meet here and must not be confused:
 * - The company switch is PER-COMPANY (`proactive.setEnabled`, persisted in
 *   that company's settings). It reflects this company's own state
 *   (`proactive.getState().enabled`).
 * - The master switch and the autonomy mode are workspace-wide
 *   (`settings.proactive_enabled` / `settings.proactive_autonomy_mode`).
 *   The master switch lives in Settings → Extensions; when it is off this
 *   panel points there instead of offering a switch that cannot take effect.
 *   The autonomy mode is set here, where it is displayed.
 *
 * Listens for proactive.* events from the event bus to update state in real-time.
 *
 * Phase 6 — Proactive Execution System — Slice 4.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DashboardEvent, ExtensionsAutonomyMode } from '@team-x/shared-types';
import { AlertTriangle, Bot, Loader2, Zap } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

import { Faceplate, MetricTile, SubviewState, Tag } from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
import { Switch } from '@/components/ui/switch.js';
import { chooserCapBase, chooserCapFocus } from '@/features/workspace/chooser-cap.js';
import { ipc } from '@/lib/ipc.js';
import { cn } from '@/lib/utils.js';
import { useAppStore } from '@/store/app-store.js';

/** Least → most autonomous, the order an operator reads the dial. */
const PROACTIVE_AUTONOMY_MODES: readonly ExtensionsAutonomyMode[] = [
  'conservative',
  'balanced',
  'autonomous',
];

/**
 * What each mode changes, taken from the trigger service — not aspiration.
 * `decomposeGoal` refuses (and emits `proactive.blocked`, reason
 * `autonomy_mode`) only under `conservative`; `scanForWork` has no mode gate;
 * `autonomous` currently adds nothing beyond `balanced` and is only recorded
 * on proactive audit payloads.
 */
const PROACTIVE_AUTONOMY_COPY: Record<ExtensionsAutonomyMode, string> = {
  conservative:
    'Goal decomposition is blocked and logged as a proactive block. Work scans still assign open tickets.',
  balanced: 'Goal decomposition and work scans both run.',
  autonomous:
    'Same gates as Balanced today: goal decomposition and work scans both run. Recorded on audit events.',
};

export interface ProactiveControlsProps {
  companyId: string;
}

export function ProactiveControls({ companyId }: ProactiveControlsProps) {
  const qc = useQueryClient();
  const openSettingsSection = useAppStore((state) => state.openSettingsSection);
  const autonomyGroupName = useId();

  // Workspace-wide settings: master enabled flag + autonomy mode.
  const {
    data: settings,
    isLoading: settingsLoading,
    isError: settingsError,
  } = useQuery({
    queryKey: ['settings', 'proactive'],
    queryFn: () => ipc.settings.getProactive(),
  });

  // Per-company state: this company's effective enabled flag + work counts.
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

  const setAutonomyMode = useMutation({
    mutationFn: (autonomyMode: ExtensionsAutonomyMode) =>
      ipc.settings.setProactive({ autonomyMode }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'proactive'] }),
  });

  // Local optimistic mirror of THIS company's switch for immediate feedback.
  const [enabledOptimistic, setEnabledOptimistic] = useState<boolean | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  // Sync the optimistic mirror with this company's observed state.
  useEffect(() => {
    if (state) {
      setEnabledOptimistic(state.enabled);
    }
  }, [state]);

  // Listen for proactive events to keep state in sync
  useEffect(() => {
    const unsubscribe = ipc.events.onDashboard((event: DashboardEvent) => {
      // Another company's activity never moves this company's panel.
      if (event.companyId !== companyId) return;
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
  }, [companyId, refetchState]);

  // Toggle proactive mode for THIS company only.
  const handleToggleEnabled = async (checked: boolean) => {
    const previous = enabledOptimistic;
    setEnabledOptimistic(checked);
    setIsToggling(true);
    try {
      await ipc.proactive.setEnabled({ companyId, enabled: checked });
      await qc.invalidateQueries({ queryKey: ['proactive', 'state', companyId] });
    } catch (err) {
      // Revert on error
      setEnabledOptimistic(previous);
      console.error('[proactive] Failed to toggle enabled:', err);
    } finally {
      setIsToggling(false);
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
  if (settingsLoading) {
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

  const masterEnabled = settings.enabled;
  const isEnabled = masterEnabled && enabledOptimistic === true;
  // While a save is in flight the dial shows the requested mode; a failed
  // save falls back to the persisted mode and says so below.
  const selectedMode: ExtensionsAutonomyMode =
    setAutonomyMode.isPending && setAutonomyMode.variables
      ? setAutonomyMode.variables
      : settings.autonomyMode;

  return (
    <Faceplate kicker="Autonomy" serial="PROACTIVE" bodyClassName="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-h3 text-foreground">Proactive Mode</h3>
        </div>
        {masterEnabled && (
          <Switch
            checked={isEnabled}
            onCheckedChange={(checked) => void handleToggleEnabled(checked)}
            disabled={enabledOptimistic === null || isToggling}
            aria-label="Toggle proactive mode"
          />
        )}
      </div>

      {/* Status description */}
      {masterEnabled && (
        <p className="text-caption text-muted-foreground">
          {isEnabled
            ? 'Agents in this workspace recognize opportunities and act without explicit commands.'
            : 'Proactive mode is off for this workspace. Agents only respond to direct commands.'}
        </p>
      )}

      {/* Autonomy mode dial — workspace-wide */}
      <fieldset className="space-y-2 border-0 p-0" data-proactive-autonomy="">
        <legend className="flex w-full items-center justify-between gap-2">
          <span className="text-label text-silver-mute">Proactive autonomy</span>
          <span className="flex items-center gap-2">
            {setAutonomyMode.isPending && (
              <Loader2
                className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                aria-label="Saving"
              />
            )}
            <Tag>All workspaces</Tag>
          </span>
        </legend>
        <div className="grid grid-cols-3 gap-1.5">
          {PROACTIVE_AUTONOMY_MODES.map((mode) => {
            const selected = selectedMode === mode;
            return (
              <label
                key={mode}
                className={cn(
                  chooserCapBase,
                  chooserCapFocus,
                  'px-2 py-1.5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
                  selected && 'cap-select',
                )}
              >
                <input
                  type="radio"
                  name={autonomyGroupName}
                  value={mode}
                  checked={selected}
                  disabled={setAutonomyMode.isPending}
                  onChange={() => {
                    if (mode !== settings.autonomyMode) setAutonomyMode.mutate(mode);
                  }}
                  className="sr-only"
                />
                <span>{mode}</span>
              </label>
            );
          })}
        </div>
        <p className="text-caption text-muted-foreground" data-proactive-autonomy-consequence="">
          {PROACTIVE_AUTONOMY_COPY[selectedMode]}
        </p>
        {setAutonomyMode.isError && (
          <div className="rounded-inset border border-[var(--led-nogo-edge)] bg-[var(--warn-soft)] px-2 py-1.5 text-caption text-[var(--led-nogo)]">
            Failed to save autonomy mode.
          </div>
        )}
      </fieldset>

      {/* Master switch off — the company switch cannot take effect */}
      {!masterEnabled && (
        <SubviewState
          lampLabel="STBY"
          lampTone="off"
          title="Proactive master switch is off"
          description="Turn it on in Settings → Extensions, then opt this workspace in here."
          className="min-h-0 p-6"
          action={
            <Button variant="outline" size="sm" onClick={() => openSettingsSection('extensions')}>
              Open Settings
            </Button>
          }
        />
      )}

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

      {/* This workspace opted out */}
      {masterEnabled && !isEnabled && (
        <SubviewState
          lampLabel="STBY"
          lampTone="off"
          title={
            stateError
              ? 'Failed to load proactive state for this workspace'
              : 'Enable proactive mode to allow agents in this workspace to work autonomously'
          }
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
