import { useQueryClient } from '@tanstack/react-query';
import type { Company, Employee } from '@team-x/shared-types';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Gauge,
  HardDrive,
  LayoutPanelTop,
  MessageCircle,
  Radar,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Ticket,
  TicketCheck,
  TimerReset,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

import { formatAgentRunPhase } from './agent-runs-projections.js';
import { formatTimeAgo, sortByNewestFirst, truncateText } from './commands-view-helpers.js';
import { visiblePrimaryPanelCount } from './dashboard-layout.js';
import {
  type DashboardQueueRow,
  projectDashboardQueueRows,
  summarizeDashboardQueues,
} from './dashboard-queue-projections.js';
import {
  type DashboardRuntimeOperationsSummary,
  summarizeRuntimeOperationsForDashboard,
} from './runtime-operations-projections.js';
import { useDashboardAgentRuns } from './use-dashboard-agent-runs.js';
import { useDashboardLayoutPreferences } from './use-dashboard-layout-preferences.js';

import {
  Faceplate,
  LampTile,
  type LampTone,
  LcdWell,
  RecessedWell,
  VuMeter,
} from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
import { intentLabel } from '@/features/command/intent-labels.js';
import { CopilotDashboardWidget } from '@/features/copilot/copilot-dashboard-widget.js';
import { useApprovals } from '@/hooks/use-approvals.js';
import { useBudgetOverview } from '@/hooks/use-budgets.js';
import { useCommandHistory } from '@/hooks/use-command.js';
import { useOperators } from '@/hooks/use-operators.js';
import { useRoutines } from '@/hooks/use-routines.js';
import { useRuntimeOperations } from '@/hooks/use-runtime-operations.js';
import { useCompanyStats, useDailyUsage } from '@/hooks/use-telemetry.js';
import { useTicketEventSync, useTickets } from '@/hooks/use-tickets.js';
import { ipc } from '@/lib/ipc.js';
import { cn } from '@/lib/utils.js';
import { useAppStore } from '@/store/app-store.js';

const DAY_MS = 86_400_000;
const DASHBOARD_TOUCH_BUTTON_CLASS = 'min-h-11';
const DASHBOARD_GLASS_BUTTON_CLASS = DASHBOARD_TOUCH_BUTTON_CLASS;
const DASHBOARD_GHOST_BUTTON_CLASS = DASHBOARD_TOUCH_BUTTON_CLASS;
const DASHBOARD_PILL_TOGGLE_CLASS = DASHBOARD_TOUCH_BUTTON_CLASS;
const DASHBOARD_PILL_GHOST_CLASS = DASHBOARD_TOUCH_BUTTON_CLASS;
const DASHBOARD_INTERACTIVE_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background';

interface MissionControlDashboardProps {
  companyId: string | null;
  company: Company | null;
  employees: Employee[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '--';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${value}`;
}

function formatUsd(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '--';
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (!Number.isFinite(parsed)) return '--';
  if (parsed === 0) return '$0.00';
  if (parsed < 0.01) return `$${parsed.toFixed(4)}`;
  return `$${parsed.toFixed(2)}`;
}

function formatQueryErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  const detail = String(error);
  return detail.length > 0 ? detail : fallback;
}

function liveStatusLabel(status: DashboardQueueRow['liveStatus']): string {
  switch (status) {
    case 'thinking':
      return 'EXEC';
    case 'blocked':
      return 'HOLD';
    case 'error':
      return 'NO-GO';
    default:
      return 'STBY';
  }
}

function lampToneForLiveStatus(status: DashboardQueueRow['liveStatus']): LampTone {
  switch (status) {
    case 'thinking':
      return 'exec';
    case 'blocked':
      return 'hold';
    case 'error':
      return 'nogo';
    default:
      return 'off';
  }
}

/** Agent-run status → canonical lamp word + tone (failed = steady NO-GO). */
function agentRunLampLabel(status: string): string {
  if (status === 'completed') return 'GO';
  if (status === 'failed') return 'NO-GO';
  return 'EXEC';
}

function agentRunLampTone(status: string): LampTone {
  if (status === 'completed') return 'go';
  if (status === 'failed') return 'nogo';
  return 'exec';
}

function panelGridClass(agentRuns: boolean, employeeQueues: boolean): string {
  if (agentRuns && employeeQueues) {
    return 'xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.95fr)]';
  }
  return 'xl:grid-cols-1';
}

function HeroMetric({
  label,
  value,
  hint,
  icon: Icon,
  onClick,
  tone = 'go',
  meter,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Activity;
  onClick?: () => void;
  tone?: 'go' | 'amber' | 'red';
  meter?: ReactNode;
}) {
  const content = (
    <>
      <div className="flex items-center gap-2 text-eyebrow text-silver-mute">
        <Icon className="h-4 w-4 text-armed" />
        {label}
      </div>
      <LcdWell tone={tone} className="flex items-end justify-between gap-3 px-3 py-2">
        <span className="text-numeric">{value}</span>
        {onClick && (
          <ArrowRight className="h-4 w-4 text-[var(--display-fg)] transition-transform group-hover:translate-x-0.5" />
        )}
      </LcdWell>
      {meter}
      <p className="text-caption text-silver-mute">{hint}</p>
    </>
  );

  const className = cn(
    'cap group flex flex-col gap-3 p-4 text-left',
    onClick && DASHBOARD_INTERACTIVE_FOCUS_CLASS,
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

function PrimaryPanel({
  title,
  description,
  countLabel,
  actions,
  children,
  dataPanel,
}: {
  title: string;
  description: string;
  countLabel?: string;
  actions?: ReactNode;
  children: ReactNode;
  dataPanel: string;
}) {
  return (
    <div className="flex flex-col" data-dashboard-primary-panel={dataPanel}>
      <Faceplate
        kicker={title}
        serial={countLabel}
        stripeSlot={actions}
        bodyClassName="flex min-h-[24rem] flex-col gap-4"
      >
        <p className="text-body text-silver-mute">{description}</p>
        <div className="flex flex-1 flex-col">{children}</div>
      </Faceplate>
    </div>
  );
}

function PanelSkeletonRows({
  rows = 3,
  heightClassName = 'h-28',
  className,
}: {
  rows?: number;
  heightClassName?: string;
  className?: string;
}) {
  const skeletonKeys = Array.from(
    { length: rows },
    (_value, index) => `panel-skeleton-${index + 1}`,
  );
  return (
    <div className={cn('grid gap-3', className)} data-dashboard-panel-state="loading">
      {skeletonKeys.map((key) => (
        <RecessedWell key={key} className={cn(heightClassName, 'animate-pulse')} />
      ))}
    </div>
  );
}

function PanelMessageState({
  icon: Icon,
  title,
  description,
  action,
  tone = 'default',
  dataState,
}: {
  icon: typeof Activity;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: 'default' | 'danger';
  dataState: string;
}) {
  return (
    <RecessedWell
      className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
      data-dashboard-panel-state={dataState}
    >
      <LampTile
        label={tone === 'danger' ? 'NO-GO' : 'STBY'}
        tone={tone === 'danger' ? 'nogo' : 'off'}
        small
        interactive={false}
      />
      <Icon className="h-8 w-8 text-silver-mute" />
      <div className="space-y-1">
        <p className="text-body-strong text-[var(--display-fg)]">{title}</p>
        <p className="max-w-md text-body text-silver-mute">{description}</p>
      </div>
      {action}
    </RecessedWell>
  );
}

function lampToneForRuntimeState(tone: DashboardRuntimeOperationsSummary['stateTone']): LampTone {
  switch (tone) {
    case 'accent':
      return 'exec';
    case 'warning':
      return 'hold';
    case 'danger':
      return 'nogo';
    default:
      return 'off';
  }
}

function lampToneForRuntimeStatus(status: string): LampTone {
  if (status === 'working') return 'exec';
  if (status === 'blocked' || status === 'stale') return 'hold';
  if (status === 'failed' || status === 'offline') return 'nogo';
  return 'off';
}

function formatRuntimeHeartbeat(value: number | null): string {
  return value === null ? 'No heartbeat yet' : formatTimeAgo(new Date(value).toISOString());
}

function lcdToneForRuntimeMetric(
  tone: DashboardRuntimeOperationsSummary['stateTone'],
): 'go' | 'amber' | 'red' {
  switch (tone) {
    case 'warning':
      return 'amber';
    case 'danger':
      return 'red';
    default:
      return 'go';
  }
}

function RuntimeMetricCell({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Activity;
  tone?: DashboardRuntimeOperationsSummary['stateTone'];
}) {
  return (
    <div className="cap flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2 text-eyebrow text-silver-mute">
        <Icon className="h-4 w-4 text-armed" />
        {label}
      </div>
      <LcdWell tone={lcdToneForRuntimeMetric(tone)} className="px-3 py-2">
        <span className="text-numeric">{value}</span>
      </LcdWell>
      <p className="text-caption text-silver-mute">{hint}</p>
    </div>
  );
}

function RuntimeOperationsBand({
  hasWorkspace,
  summary,
  isLoading,
  isError,
  isFetching,
  error,
  onRetry,
  onOpenRuntimes,
}: {
  hasWorkspace: boolean;
  summary: DashboardRuntimeOperationsSummary;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  error: unknown;
  onRetry: () => void;
  onOpenRuntimes: () => void;
}) {
  const adapterSummary =
    summary.adapterCounts.length > 0
      ? summary.adapterCounts.map((entry) => `${entry.kind} ${entry.count}`).join(' / ')
      : 'No adapters active';
  const attentionHint =
    summary.attentionCount > 0
      ? `${summary.blockedSessionCount} blocked, ${summary.staleSessionCount} stale, ${summary.failedSessionCount} failed, ${summary.missingHeartbeatCount} missing heartbeat.`
      : 'No blocked, stale, offline, or heartbeat-missing sessions.';

  return (
    <div data-dashboard-runtime-operations="">
      <Faceplate
        kicker="EXTERNAL RUNTIME OPS"
        serial="HEARTBEAT · CHECKOUT"
        stripeSlot={
          <div className="flex items-center gap-2">
            <LampTile
              label={summary.stateLabel}
              tone={lampToneForRuntimeState(summary.stateTone)}
              small
              interactive={false}
            />
            {summary.budgetBlockedCount > 0 && (
              <span data-dashboard-runtime-budget-blocks="">
                <LampTile label="BUDG" tone="hold" small interactive={false} />
              </span>
            )}
          </div>
        }
        bodyClassName="space-y-4"
      >
        <div data-dashboard-runtime-state={summary.stateLabel} className="sr-only">
          {summary.stateLabel}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-placard text-[var(--display-fg)]">Heartbeat and checkout pulse</p>
            <p className="max-w-3xl text-body text-silver-mute">
              External agents, active leases, heartbeat freshness, managed workspaces, and budget
              stop posture.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRetry}
              disabled={!hasWorkspace || isFetching}
              className={DASHBOARD_GHOST_BUTTON_CLASS}
              aria-label="Refresh runtime operations snapshot"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenRuntimes}
              disabled={!hasWorkspace}
              className={DASHBOARD_GLASS_BUTTON_CLASS}
              aria-label="Open Autonomy runtimes"
            >
              <Bot className="h-4 w-4" />
              Runtimes
            </Button>
          </div>
        </div>
        {!hasWorkspace ? (
          <PanelMessageState
            icon={HardDrive}
            title="Select a workspace"
            description="Pick a workspace to load external runtime sessions, heartbeat state, and ticket checkout leases."
            dataState="runtime-operations-unselected"
          />
        ) : isLoading ? (
          <PanelSkeletonRows rows={2} heightClassName="h-28" className="lg:grid-cols-2" />
        ) : isError ? (
          <PanelMessageState
            icon={ShieldAlert}
            title="Runtime operations could not load"
            description={formatQueryErrorMessage(
              error,
              'The runtime operations snapshot is temporarily unavailable for this workspace.',
            )}
            tone="danger"
            dataState="runtime-operations-error"
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRetry}
                className={DASHBOARD_GLASS_BUTTON_CLASS}
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <RuntimeMetricCell
                label="Sessions"
                value={String(summary.sessionCount)}
                hint={`${summary.workingSessionCount} working, ${summary.managedWorkspaceCount} isolated workspaces.`}
                icon={Activity}
                tone={summary.workingSessionCount > 0 ? 'accent' : 'default'}
              />
              <RuntimeMetricCell
                label="Attention"
                value={String(summary.attentionCount)}
                hint={attentionHint}
                icon={ShieldAlert}
                tone={summary.attentionCount > 0 ? summary.stateTone : 'default'}
              />
              <RuntimeMetricCell
                label="Checkouts"
                value={String(summary.activeCheckoutCount)}
                hint={`${summary.checkoutBlockedCount} checkout conflicts or lease blockers surfaced.`}
                icon={TicketCheck}
                tone={summary.activeCheckoutCount > 0 ? 'accent' : 'default'}
              />
              <RuntimeMetricCell
                label="Heartbeat"
                value={formatRuntimeHeartbeat(summary.latestHeartbeatAt)}
                hint={adapterSummary}
                icon={HardDrive}
              />
            </div>

            {summary.recentSessions.length === 0 ? (
              <RecessedWell
                className="p-5 text-body text-silver-mute"
                data-dashboard-runtime-empty=""
              >
                No external runtime session is active for this workspace.
              </RecessedWell>
            ) : (
              <div className="grid gap-3 lg:grid-cols-3" data-dashboard-runtime-session-list="">
                {summary.recentSessions.map((session) => (
                  <div
                    key={session.id}
                    className="cap p-4"
                    data-dashboard-runtime-session={session.id}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <LampTile label={session.adapterKind} tone="exec" small interactive={false} />
                      <LampTile
                        label={session.status}
                        tone={lampToneForRuntimeStatus(session.status)}
                        small
                        interactive={false}
                      />
                      {session.workspaceManaged && (
                        <LampTile label="ISO" tone="go" small interactive={false} />
                      )}
                    </div>
                    <p className="mt-3 break-all text-body-strong text-foreground">
                      {session.currentTicketId ?? session.currentRunId ?? session.employeeId}
                    </p>
                    <p className="mt-1 text-caption text-silver-mute">
                      Last heartbeat {formatRuntimeHeartbeat(session.lastHeartbeatAt)}
                    </p>
                    {session.failureReason && (
                      <p className="mt-2 text-caption text-led-hold">
                        {truncateText(session.failureReason, 120)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Faceplate>
    </div>
  );
}

function MissionControlSkeleton() {
  const heroSkeletonKeys = [
    'hero-skeleton-1',
    'hero-skeleton-2',
    'hero-skeleton-3',
    'hero-skeleton-4',
    'hero-skeleton-5',
    'hero-skeleton-6',
  ];
  return (
    <section
      className="relative flex min-h-full flex-col gap-[var(--sp-4)] overflow-hidden p-4 sm:p-6 xl:p-8"
      data-dashboard-mission-control=""
    >
      <Faceplate kicker="MISSION CONTROL" serial="BOOT">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {heroSkeletonKeys.map((key) => (
            <RecessedWell key={key} className="h-28 animate-pulse" />
          ))}
        </div>
      </Faceplate>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.95fr)]">
        <RecessedWell className="h-[26rem] animate-pulse" />
        <RecessedWell className="h-[26rem] animate-pulse" />
      </div>
    </section>
  );
}

export function MissionControlDashboard({
  companyId,
  company,
  employees,
  isLoading,
  isError,
  onRetry,
}: MissionControlDashboardProps) {
  const employeeLive = useAppStore((state) => state.employeeLive);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const setAutonomySubview = useAppStore((state) => state.setAutonomySubview);
  const setDashboardSubview = useAppStore((state) => state.setDashboardSubview);
  const setSelectedEmployee = useAppStore((state) => state.setSelectedEmployee);
  const openThread = useAppStore((state) => state.openThread);

  const queryClient = useQueryClient();
  const [telemetryRange] = useState(() => {
    const toMs = Date.now();
    return { fromMs: toMs - 6 * DAY_MS, toMs };
  });

  useTicketEventSync(companyId);

  useEffect(() => {
    if (!companyId) return;

    // Dashboard sub-panels rely on command history + telemetry query caches,
    // but those mutations can originate outside this surface.
    const unsubscribe = ipc.events.onDashboard((event) => {
      if (event.companyId !== companyId) return;

      if (event.type === 'command.executed') {
        queryClient.invalidateQueries({ queryKey: ['command-history', companyId] });
      }

      if (
        event.type === 'command.executed' ||
        event.type === 'agentic.completed' ||
        event.type === 'agentic.failed' ||
        event.type === 'work.completed' ||
        event.type === 'work.failed'
      ) {
        queryClient.invalidateQueries({ queryKey: ['telemetry'] });
      }
    });

    return unsubscribe;
  }, [companyId, queryClient]);

  const ticketsQuery = useTickets(companyId);
  const commandHistoryQuery = useCommandHistory(companyId, 5);
  const telemetryStatsQuery = useCompanyStats(companyId ? { companyId } : null);
  const telemetryDailyQuery = useDailyUsage(
    companyId
      ? {
          companyId,
          fromMs: telemetryRange.fromMs,
          toMs: telemetryRange.toMs,
        }
      : null,
  );
  const agentRunsQuery = useDashboardAgentRuns(companyId);
  const operatorsQuery = useOperators(companyId);
  const routinesQuery = useRoutines(companyId);
  const approvalsQuery = useApprovals(companyId, undefined, 'pending');
  const budgetOverviewQuery = useBudgetOverview(companyId);
  const runtimeOperationsQuery = useRuntimeOperations(companyId);
  const agentRuns = agentRunsQuery.runs;
  const dashboardLayout = useDashboardLayoutPreferences(company);

  if (isLoading) {
    return <MissionControlSkeleton />;
  }

  const hasWorkspace = companyId !== null && companyId.length > 0;
  const layout = dashboardLayout.layout;
  const tickets = ticketsQuery.data ?? [];
  const queueRows = projectDashboardQueueRows(employees, tickets, employeeLive);
  const queueSummary = summarizeDashboardQueues(queueRows);
  const commandRows = sortByNewestFirst(commandHistoryQuery.data ?? []).slice(0, 5);
  const todayUsage =
    telemetryDailyQuery.data && telemetryDailyQuery.data.length > 0
      ? telemetryDailyQuery.data[telemetryDailyQuery.data.length - 1]
      : null;

  const activeRunCount = agentRuns.filter((run) => run.status === 'running').length;
  const blockedEmployeeCount = queueRows.filter(
    (row) => row.liveStatus === 'blocked' || row.liveStatus === 'error' || row.counts.blocked > 0,
  ).length;
  const operatorEntries = operatorsQuery.data ?? [];
  const operatorPosture = operatorEntries.some((entry) => entry.operator.authMode === 'cloud')
    ? 'shared-cloud'
    : operatorEntries.some((entry) => entry.operator.authMode === 'invited')
      ? 'shared-local'
      : 'local-only';
  const enabledRoutineCount = (routinesQuery.data ?? []).filter(
    (routine) => routine.enabled,
  ).length;
  const pendingApprovalCount = approvalsQuery.data?.length ?? 0;
  const budgetOverview = budgetOverviewQuery.data;
  const runtimeOperationsSummary = summarizeRuntimeOperationsForDashboard(
    runtimeOperationsQuery.data,
  );
  const queueDataReady = hasWorkspace && !ticketsQuery.isLoading && !ticketsQuery.isError;
  const runtimeOperationsReady =
    hasWorkspace && !runtimeOperationsQuery.isLoading && !runtimeOperationsQuery.isError;
  const telemetryReady =
    hasWorkspace &&
    !telemetryStatsQuery.isLoading &&
    !telemetryDailyQuery.isLoading &&
    !telemetryStatsQuery.isError &&
    !telemetryDailyQuery.isError;

  function handlePanelToggle(panel: 'agentRuns' | 'employeeQueues') {
    dashboardLayout.setPanelVisible(panel, !layout[panel]);
  }

  function handleResetLayout() {
    dashboardLayout.resetPanels();
  }

  function handleOpenRunThread(threadId: string) {
    openThread({
      threadId,
      isAgentThread: false,
      isCopilotThread: true,
      employeeId: null,
    });
  }

  function handleRetryQueueBoard() {
    void ticketsQuery.refetch();
  }

  function handleRetryCommandHistory() {
    void commandHistoryQuery.refetch();
  }

  function handleRetryTelemetrySnapshot() {
    void telemetryStatsQuery.refetch();
    void telemetryDailyQuery.refetch();
  }

  function handleRetryRuntimeOperations() {
    void runtimeOperationsQuery.refetch();
  }

  function handleOpenAutonomy(
    subview: 'access' | 'approvals' | 'budgets' | 'routines' | 'runtimes',
  ) {
    setAutonomySubview(subview);
    setActiveView('autonomy');
  }

  return (
    <section
      className="relative flex min-h-full flex-col gap-6 overflow-hidden p-4 sm:p-6 xl:p-8"
      data-dashboard-mission-control=""
    >
      <div className="flex min-h-full flex-col gap-6">
        <Faceplate
          kicker="MISSION CONTROL"
          serial={company?.slug ?? undefined}
          stripeSlot={
            company?.status ? (
              <LampTile label={company.status} tone="exec" small interactive={false} />
            ) : undefined
          }
          bodyClassName="flex flex-col gap-6"
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-eyebrow text-silver-mute">
                <LayoutPanelTop className="h-4 w-4 text-armed" />
                Mission Control
              </div>
              <div className="space-y-2">
                <h1 className="text-display font-display text-foreground">
                  {company?.name ?? 'Select a workspace to open the control surface'}
                </h1>
                <p className="max-w-2xl text-body text-muted-foreground">
                  {company?.settings?.mission ??
                    'Track live execution, queue pressure, and operational telemetry from one surface without leaving the dashboard.'}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 xl:min-w-[21rem]">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePanelToggle('agentRuns')}
                  className={cn(DASHBOARD_PILL_TOGGLE_CLASS, layout.agentRuns && 'cap cap-select')}
                  data-dashboard-hero-toggle="agent-runs"
                  aria-pressed={layout.agentRuns}
                  aria-label={`${layout.agentRuns ? 'Hide' : 'Show'} Agent Runs panel`}
                  disabled={!companyId}
                >
                  <Bot className="h-4 w-4" />
                  Agent Runs
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePanelToggle('employeeQueues')}
                  className={cn(
                    DASHBOARD_PILL_TOGGLE_CLASS,
                    layout.employeeQueues && 'cap cap-select',
                  )}
                  data-dashboard-hero-toggle="employee-queues"
                  aria-pressed={layout.employeeQueues}
                  aria-label={`${layout.employeeQueues ? 'Hide' : 'Show'} Employee Queues panel`}
                  disabled={!companyId}
                >
                  <Ticket className="h-4 w-4" />
                  Employee Queues
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResetLayout}
                  disabled={!companyId || !dashboardLayout.layoutDirty}
                  className={DASHBOARD_PILL_GHOST_CLASS}
                  data-dashboard-reset-layout=""
                  aria-label="Reset dashboard layout to the default hybrid view"
                >
                  <TimerReset className="h-4 w-4" />
                  Reset layout
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <RecessedWell className="flex items-center gap-2 px-3 py-1.5">
                  <span className="font-data text-label tabular-nums text-[var(--display-fg)]">
                    {visiblePrimaryPanelCount(layout)} / 2
                  </span>
                  <span className="text-eyebrow-sm text-silver-mute">live panels</span>
                </RecessedWell>
                <RecessedWell className="flex items-center gap-2 px-3 py-1.5">
                  <span className="font-data text-label tabular-nums text-[var(--display-fg)]">
                    {commandRows.length}
                  </span>
                  <span className="text-eyebrow-sm text-silver-mute">recent commands</span>
                </RecessedWell>
                <RecessedWell className="flex items-center gap-2 px-3 py-1.5">
                  <span className="font-data text-label tabular-nums text-[var(--display-fg)]">
                    {tickets.length}
                  </span>
                  <span className="text-eyebrow-sm text-silver-mute">tracked tickets</span>
                </RecessedWell>
                <RecessedWell
                  className="flex items-center gap-2 px-3 py-1.5"
                  data-dashboard-autonomy-badge="routines"
                >
                  <span className="font-data text-label tabular-nums text-[var(--display-fg)]">
                    {enabledRoutineCount}
                  </span>
                  <span className="text-eyebrow-sm text-silver-mute">active routines</span>
                </RecessedWell>
                <RecessedWell
                  className="flex items-center gap-2 px-3 py-1.5"
                  data-dashboard-runtime-badge=""
                >
                  <span className="font-data text-label tabular-nums text-[var(--display-fg)]">
                    {runtimeOperationsReady ? runtimeOperationsSummary.sessionCount : '--'}
                  </span>
                  <span className="text-eyebrow-sm text-silver-mute">runtime sessions</span>
                  {runtimeOperationsSummary.attentionCount > 0 && (
                    <LampTile label="ATTN" tone="hold" small interactive={false} />
                  )}
                </RecessedWell>
                <RecessedWell
                  className="flex items-center gap-2 px-3 py-1.5"
                  data-dashboard-autonomy-badge="approvals"
                >
                  <span className="font-data text-label tabular-nums text-[var(--display-fg)]">
                    {pendingApprovalCount}
                  </span>
                  <span className="text-eyebrow-sm text-silver-mute">pending approvals</span>
                  {pendingApprovalCount > 0 && (
                    <LampTile label="ATTN" tone="hold" small interactive={false} />
                  )}
                </RecessedWell>
                <RecessedWell className="flex items-center gap-2 px-3 py-1.5">
                  <span className="text-eyebrow-sm text-silver-mute">
                    {operatorPosture} posture
                  </span>
                </RecessedWell>
                {dashboardLayout.isSaving && (
                  <output
                    className="flex items-center gap-2 rounded-control border border-[var(--armed-edge)] bg-[var(--armed-soft)] px-3 py-1.5 text-eyebrow-sm text-armed"
                    aria-live="polite"
                  >
                    Saving layout
                  </output>
                )}
              </div>
              {dashboardLayout.error && (
                <p
                  className="text-caption text-led-nogo"
                  data-dashboard-layout-error=""
                  role="alert"
                >
                  {dashboardLayout.error}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveView('tickets')}
                  className={DASHBOARD_GLASS_BUTTON_CLASS}
                >
                  <Ticket className="h-4 w-4" />
                  Open tickets
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDashboardSubview('commands')}
                  className={DASHBOARD_GLASS_BUTTON_CLASS}
                >
                  <Radar className="h-4 w-4" />
                  Command log
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveView('telemetry')}
                  className={DASHBOARD_GLASS_BUTTON_CLASS}
                >
                  <Gauge className="h-4 w-4" />
                  Telemetry
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleOpenAutonomy(pendingApprovalCount > 0 ? 'approvals' : 'access')
                  }
                  className={DASHBOARD_GLASS_BUTTON_CLASS}
                >
                  <Sparkles className="h-4 w-4" />
                  Autonomy
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenAutonomy('runtimes')}
                  className={DASHBOARD_GLASS_BUTTON_CLASS}
                >
                  <HardDrive className="h-4 w-4" />
                  Runtimes
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <HeroMetric
              label="Live runs"
              value={
                !hasWorkspace || agentRunsQuery.isLoading || agentRunsQuery.isError
                  ? '--'
                  : `${activeRunCount}`
              }
              hint={
                !hasWorkspace
                  ? 'Select a workspace to load persisted runs and live execution state.'
                  : activeRunCount > 0
                    ? 'Agentic loops currently progressing with live step updates.'
                    : agentRunsQuery.isLoading
                      ? 'Loading recent agentic loops from the persisted run log.'
                      : agentRunsQuery.isError
                        ? 'Run history is temporarily unavailable for this workspace.'
                        : 'No agentic loops are currently active.'
              }
              icon={Bot}
              onClick={() => setDashboardSubview('commands')}
            />
            <HeroMetric
              label="External runtimes"
              value={runtimeOperationsReady ? `${runtimeOperationsSummary.sessionCount}` : '--'}
              hint={
                !hasWorkspace
                  ? 'Select a workspace to load runtime sessions and checkouts.'
                  : runtimeOperationsQuery.isLoading
                    ? 'Loading live runtime heartbeat and checkout state.'
                    : runtimeOperationsQuery.isError
                      ? 'Runtime operations are temporarily unavailable.'
                      : runtimeOperationsSummary.attentionCount > 0
                        ? `${runtimeOperationsSummary.attentionCount} runtime items need review.`
                        : runtimeOperationsSummary.sessionCount > 0
                          ? `${runtimeOperationsSummary.workingSessionCount} working with ${runtimeOperationsSummary.activeCheckoutCount} active checkout leases.`
                          : 'No external runtime sessions are active.'
              }
              icon={HardDrive}
              onClick={() => handleOpenAutonomy('runtimes')}
            />
            <HeroMetric
              label="Workforce active"
              meter={
                <VuMeter
                  value={employees.length > 0 ? queueSummary.activeEmployees / employees.length : 0}
                  label="Workforce utilization"
                />
              }
              value={!hasWorkspace ? '--' : `${queueSummary.activeEmployees}/${employees.length}`}
              hint={
                !hasWorkspace
                  ? 'Select a workspace to load employee activity.'
                  : employees.length > 0
                    ? 'Employees streaming or actively processing work right now.'
                    : 'No employees hired in this workspace yet.'
              }
              icon={Activity}
              onClick={() =>
                setSelectedEmployee(
                  queueRows.find((row) => row.liveStatus === 'thinking')?.employeeId ?? null,
                )
              }
            />
            <HeroMetric
              label="Queue pressure"
              tone={queueSummary.totalPressure > 0 ? 'amber' : 'go'}
              value={queueDataReady ? `${queueSummary.totalPressure}` : '--'}
              hint={
                !hasWorkspace
                  ? 'Select a workspace to load ticket backlog.'
                  : ticketsQuery.isLoading
                    ? 'Loading durable backlog and live queue overlays.'
                    : ticketsQuery.isError
                      ? 'Ticket backlog is temporarily unavailable for this workspace.'
                      : queueSummary.totalPressure > 0
                        ? `${queueSummary.employeesWithWork} employees carrying open or blocked work.`
                        : 'No durable queue pressure detected.'
              }
              icon={Ticket}
              onClick={() => setActiveView('tickets')}
            />
            <HeroMetric
              label="Blocked work"
              tone={queueSummary.blocked > 0 ? 'amber' : 'go'}
              value={queueDataReady ? `${queueSummary.blocked}` : '--'}
              hint={
                !hasWorkspace
                  ? 'Select a workspace to load blocked backlog state.'
                  : ticketsQuery.isLoading
                    ? 'Loading blocked tickets and live employee state.'
                    : ticketsQuery.isError
                      ? 'Blocked backlog is temporarily unavailable for this workspace.'
                      : blockedEmployeeCount > 0
                        ? `${blockedEmployeeCount} employees show blocked or error state.`
                        : 'No blocked tickets or blocked employees right now.'
              }
              icon={AlertTriangle}
              onClick={() => setActiveView('tickets')}
            />
            <HeroMetric
              label="Today cost"
              tone="amber"
              value={telemetryReady ? formatUsd(todayUsage?.costUsd) : '--'}
              hint={
                !hasWorkspace
                  ? 'Select a workspace to load telemetry.'
                  : telemetryStatsQuery.isLoading || telemetryDailyQuery.isLoading
                    ? 'Loading telemetry for the current window.'
                    : telemetryStatsQuery.isError || telemetryDailyQuery.isError
                      ? 'Telemetry is temporarily unavailable for this workspace.'
                      : todayUsage
                        ? `${formatCompactNumber(todayUsage.totalTokens)} tokens recorded in the current telemetry window.`
                        : 'Telemetry is waiting for completed runs.'
              }
              icon={Gauge}
              onClick={() => setActiveView('telemetry')}
            />
          </div>
        </Faceplate>

        {isError ? (
          <Faceplate
            kicker="DASHBOARD FAULT"
            bodyClassName="flex min-h-[18rem] flex-col items-center justify-center gap-4 text-center"
          >
            <LampTile label="NO-GO" tone="nogo" small interactive={false} />
            <AlertTriangle className="h-10 w-10 text-silver-mute" />
            <div className="space-y-1">
              <h2 className="text-h3 text-[var(--display-fg)]">Dashboard data could not load</h2>
              <p className="text-body text-silver-mute">
                The mission-control shell is ready, but the employee roster query failed.
              </p>
            </div>
            {onRetry && (
              <Button
                type="button"
                variant="outline"
                onClick={onRetry}
                className={DASHBOARD_GLASS_BUTTON_CLASS}
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            )}
          </Faceplate>
        ) : (
          <>
            <RuntimeOperationsBand
              hasWorkspace={hasWorkspace}
              summary={runtimeOperationsSummary}
              isLoading={runtimeOperationsQuery.isLoading}
              isError={runtimeOperationsQuery.isError}
              isFetching={runtimeOperationsQuery.isFetching}
              error={runtimeOperationsQuery.error}
              onRetry={handleRetryRuntimeOperations}
              onOpenRuntimes={() => handleOpenAutonomy('runtimes')}
            />

            <div
              className={cn('grid gap-6', panelGridClass(layout.agentRuns, layout.employeeQueues))}
            >
              {layout.agentRuns && (
                <PrimaryPanel
                  title="Agent Runs"
                  description="Persisted recent agentic loops with live step updates layered on top."
                  countLabel={
                    hasWorkspace && agentRuns.length > 0 ? `${agentRuns.length} recent` : undefined
                  }
                  dataPanel="agent-runs"
                  actions={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDashboardSubview('commands')}
                      className={DASHBOARD_GHOST_BUTTON_CLASS}
                      aria-label="Open dashboard command context for agent runs"
                    >
                      <Radar className="h-4 w-4" />
                      Command context
                    </Button>
                  }
                >
                  {!hasWorkspace ? (
                    <PanelMessageState
                      icon={Bot}
                      title="Select a workspace"
                      description="Pick a workspace to load persisted run history and live agent state."
                      dataState="agent-runs-unselected"
                    />
                  ) : agentRunsQuery.isLoading ? (
                    <PanelSkeletonRows rows={3} heightClassName="h-28" />
                  ) : agentRunsQuery.isError ? (
                    <PanelMessageState
                      icon={AlertTriangle}
                      title="Run history could not load"
                      description={
                        agentRunsQuery.errorMessage ??
                        'Persisted agent runs could not load for this workspace.'
                      }
                      tone="danger"
                      dataState="agent-runs-error"
                      action={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            void agentRunsQuery.retry();
                          }}
                          className={DASHBOARD_GLASS_BUTTON_CLASS}
                        >
                          <RefreshCw className="h-4 w-4" />
                          Retry
                        </Button>
                      }
                    />
                  ) : agentRuns.length === 0 ? (
                    <PanelMessageState
                      icon={Bot}
                      title="No agentic runs recorded yet"
                      description="This panel hydrates from the durable run log, then switches to live step updates as soon as a command starts an agentic loop."
                      dataState="agent-runs-empty"
                    />
                  ) : (
                    <div className="grid gap-3" data-dashboard-panel-state="agent-runs-ready">
                      {agentRunsQuery.hasHistoryWarning && (
                        <RecessedWell className="flex flex-col gap-3 p-4 text-body text-led-hold">
                          <div className="space-y-1">
                            <p className="font-medium">Run history refresh failed</p>
                            <p className="text-silver-mute">
                              {agentRunsQuery.errorMessage ??
                                'Live dashboard events are still rendering, but the persisted run log did not refresh.'}
                            </p>
                          </div>
                          <div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                void agentRunsQuery.retry();
                              }}
                              className={DASHBOARD_GLASS_BUTTON_CLASS}
                            >
                              <RefreshCw className="h-4 w-4" />
                              Retry history
                            </Button>
                          </div>
                        </RecessedWell>
                      )}
                      {agentRuns.map((run) => (
                        <button
                          type="button"
                          key={run.runId}
                          onClick={() => handleOpenRunThread(run.threadId)}
                          aria-label={`Open Copilot thread for ${run.label}`}
                          className={cn(
                            'cap group p-4 text-left',
                            DASHBOARD_INTERACTIVE_FOCUS_CLASS,
                          )}
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-body-strong text-foreground">
                                  {truncateText(run.label, 72)}
                                </p>
                                <LampTile
                                  label={agentRunLampLabel(run.status)}
                                  tone={agentRunLampTone(run.status)}
                                  small
                                  interactive={false}
                                />
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
                                <span>{formatAgentRunPhase(run.latestPhase)}</span>
                                {run.stepCount > 0 && (
                                  <>
                                    <span>·</span>
                                    <span>{run.stepCount} steps</span>
                                  </>
                                )}
                                <span>·</span>
                                <span>
                                  {formatCompactNumber(run.tokensIn + run.tokensOut)} tokens
                                </span>
                                <span>·</span>
                                <span>{formatUsd(run.costUsd)}</span>
                              </div>
                              {run.failureReason && (
                                <p className="text-caption text-led-nogo">
                                  {truncateText(run.failureReason, 120)}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-start gap-2 text-caption text-muted-foreground md:items-end">
                              <span>
                                {run.durationMs
                                  ? `${Math.max(1, Math.round(run.durationMs / 1000))}s total`
                                  : 'In flight'}
                              </span>
                              <span>
                                {run.provider && run.model
                                  ? `${run.provider} · ${run.model}`
                                  : 'Persisted run log'}
                              </span>
                              <span className="flex items-center gap-1 text-foreground/80">
                                Open thread
                                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </PrimaryPanel>
              )}

              {layout.employeeQueues && (
                <PrimaryPanel
                  title="Employee Queues"
                  description="Durable backlog counts layered with live employee activity."
                  countLabel={
                    hasWorkspace && employees.length > 0
                      ? `${employees.length} employees`
                      : undefined
                  }
                  dataPanel="employee-queues"
                  actions={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveView('tickets')}
                      className={DASHBOARD_GHOST_BUTTON_CLASS}
                      aria-label="Open tickets for employee queue detail"
                    >
                      <Ticket className="h-4 w-4" />
                      Open tickets
                    </Button>
                  }
                >
                  {!hasWorkspace ? (
                    <PanelMessageState
                      icon={Ticket}
                      title="Select a workspace"
                      description="Pick a workspace to load durable backlog counts and live employee activity."
                      dataState="employee-queues-unselected"
                    />
                  ) : ticketsQuery.isLoading ? (
                    <PanelSkeletonRows
                      rows={Math.max(2, Math.min(employees.length || 2, 4))}
                      heightClassName="h-36"
                    />
                  ) : ticketsQuery.isError ? (
                    <PanelMessageState
                      icon={AlertTriangle}
                      title="Queue backlog could not load"
                      description={formatQueryErrorMessage(
                        ticketsQuery.error,
                        'Ticket backlog is temporarily unavailable for this workspace.',
                      )}
                      tone="danger"
                      dataState="employee-queues-error"
                      action={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleRetryQueueBoard}
                          className={DASHBOARD_GLASS_BUTTON_CLASS}
                        >
                          <RefreshCw className="h-4 w-4" />
                          Retry
                        </Button>
                      }
                    />
                  ) : employees.length === 0 ? (
                    <PanelMessageState
                      icon={Ticket}
                      title="No queue load yet"
                      description="Hire employees or create tickets to bring the queue board online. The layout and visibility controls are already active."
                      dataState="employee-queues-empty"
                    />
                  ) : (
                    <div className="grid gap-3" data-dashboard-panel-state="employee-queues-ready">
                      {queueRows.map((row) => {
                        const totalTickets =
                          row.counts.open +
                          row.counts.inProgress +
                          row.counts.blocked +
                          row.counts.done;
                        return (
                          <div
                            key={row.employeeId}
                            className="cap p-4"
                            data-dashboard-queue-row={row.employeeId}
                          >
                            <div className="flex flex-col gap-3">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-body-strong text-foreground">{row.name}</p>
                                    <LampTile
                                      label={liveStatusLabel(row.liveStatus)}
                                      tone={lampToneForLiveStatus(row.liveStatus)}
                                      small
                                      interactive={false}
                                    />
                                  </div>
                                  <p className="text-caption text-muted-foreground">{row.title}</p>
                                  {row.liveActivity && (
                                    <p className="text-caption text-foreground/75">
                                      {truncateText(row.liveActivity, 120)}
                                    </p>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setSelectedEmployee(row.employeeId)}
                                    className={DASHBOARD_GLASS_BUTTON_CLASS}
                                    aria-label={`Open chat with ${row.name}`}
                                  >
                                    <MessageCircle className="h-4 w-4" />
                                    Chat
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setActiveView('tickets')}
                                    className={DASHBOARD_GHOST_BUTTON_CLASS}
                                    aria-label={`Open tickets for ${row.name}`}
                                  >
                                    <Ticket className="h-4 w-4" />
                                    Tickets
                                  </Button>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <div className="h-2 overflow-hidden rounded-pill bg-carbon-950">
                                  {totalTickets > 0 && (
                                    <div className="flex h-full">
                                      {row.counts.open > 0 && (
                                        <div
                                          className="h-full bg-graphite"
                                          style={{
                                            width: `${(row.counts.open / totalTickets) * 100}%`,
                                          }}
                                        />
                                      )}
                                      {row.counts.inProgress > 0 && (
                                        <div
                                          className="h-full bg-led-scope"
                                          style={{
                                            width: `${(row.counts.inProgress / totalTickets) * 100}%`,
                                          }}
                                        />
                                      )}
                                      {row.counts.blocked > 0 && (
                                        <div
                                          className="h-full bg-led-hold"
                                          style={{
                                            width: `${(row.counts.blocked / totalTickets) * 100}%`,
                                          }}
                                        />
                                      )}
                                      {row.counts.done > 0 && (
                                        <div
                                          className="h-full bg-led-go"
                                          style={{
                                            width: `${(row.counts.done / totalTickets) * 100}%`,
                                          }}
                                        />
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-eyebrow text-muted-foreground">
                                  <span>
                                    Open{' '}
                                    <span className="font-data tabular-nums text-silver">
                                      {row.counts.open}
                                    </span>
                                  </span>
                                  <span>
                                    In progress{' '}
                                    <span className="font-data tabular-nums text-silver">
                                      {row.counts.inProgress}
                                    </span>
                                  </span>
                                  <span>
                                    Blocked{' '}
                                    <span className="font-data tabular-nums text-silver">
                                      {row.counts.blocked}
                                    </span>
                                  </span>
                                  <span>
                                    Done{' '}
                                    <span className="font-data tabular-nums text-silver">
                                      {row.counts.done}
                                    </span>
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </PrimaryPanel>
              )}

              {!layout.agentRuns && !layout.employeeQueues && (
                <PrimaryPanel
                  title="Primary Panels Hidden"
                  description="Both live boards are collapsed. Reset the layout to restore the default hybrid dashboard."
                  dataPanel="all-hidden"
                >
                  <RecessedWell className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
                    <LayoutPanelTop className="h-8 w-8 text-armed" />
                    <p className="max-w-lg text-body text-muted-foreground">
                      The mission-control shell is still active below, but the live board row is
                      hidden for this workspace.
                    </p>
                    <Button
                      type="button"
                      onClick={handleResetLayout}
                      className={DASHBOARD_TOUCH_BUTTON_CLASS}
                    >
                      <TimerReset className="h-4 w-4" />
                      Restore default hybrid layout
                    </Button>
                  </RecessedWell>
                </PrimaryPanel>
              )}
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)_minmax(320px,0.9fr)]">
              <Faceplate kicker="COPILOT INSIGHTS" serial="SECONDARY RAIL" className="h-full">
                <RecessedWell className="p-4" data-dashboard-secondary-panel="copilot">
                  <p className="mb-3 text-caption text-silver-mute">
                    Keep live findings visible without letting them outrank the work boards.
                  </p>
                  <div className="[&_[data-copilot-widget-count]]:border-[var(--hairline)] [&_[data-copilot-widget-count]]:bg-carbon-900 [&_[data-copilot-widget-view-all]]:border-[var(--hairline)] [&_[data-copilot-widget-view-all]]:bg-carbon-900 [&_[data-copilot-widget-view-all]]:hover:bg-carbon-850 [&_[data-copilot-widget]]:border-0 [&_[data-copilot-widget]]:bg-transparent [&_[data-copilot-widget]]:p-0">
                    <CopilotDashboardWidget />
                  </div>
                </RecessedWell>
              </Faceplate>

              <div data-dashboard-recent-commands="">
                <Faceplate
                  kicker="RECENT COMMANDS"
                  serial="COMMAND STREAM"
                  stripeSlot={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDashboardSubview('commands')}
                      className={DASHBOARD_GHOST_BUTTON_CLASS}
                      aria-label="Open full dashboard command log"
                    >
                      <Radar className="h-4 w-4" />
                      Full log
                    </Button>
                  }
                  bodyClassName="space-y-3"
                >
                  {!hasWorkspace ? (
                    <PanelMessageState
                      icon={Radar}
                      title="Select a workspace"
                      description="Pick a workspace to load recent command history."
                      dataState="recent-commands-unselected"
                    />
                  ) : commandHistoryQuery.isLoading ? (
                    <PanelSkeletonRows rows={4} heightClassName="h-16" />
                  ) : commandHistoryQuery.isError ? (
                    <PanelMessageState
                      icon={AlertTriangle}
                      title="Command history could not load"
                      description={formatQueryErrorMessage(
                        commandHistoryQuery.error,
                        'Recent commands are temporarily unavailable for this workspace.',
                      )}
                      tone="danger"
                      dataState="recent-commands-error"
                      action={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleRetryCommandHistory}
                          className={DASHBOARD_GLASS_BUTTON_CLASS}
                        >
                          <RefreshCw className="h-4 w-4" />
                          Retry
                        </Button>
                      }
                    />
                  ) : commandRows.length === 0 ? (
                    <PanelMessageState
                      icon={Radar}
                      title="No commands yet"
                      description="Use Cmd/Ctrl+K to start issuing live operations."
                      dataState="recent-commands-empty"
                    />
                  ) : (
                    commandRows.map((entry) => (
                      <button
                        type="button"
                        key={entry.id}
                        onClick={() => setDashboardSubview('commands')}
                        aria-label={`Open command log entry ${intentLabel(entry.intent)}`}
                        className={cn(
                          'cap group flex w-full items-start justify-between gap-4 p-4 text-left',
                          DASHBOARD_INTERACTIVE_FOCUS_CLASS,
                        )}
                      >
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <LampTile
                              label={intentLabel(entry.intent)}
                              tone="exec"
                              small
                              interactive={false}
                            />
                            <span className="text-caption text-muted-foreground">
                              {formatTimeAgo(entry.executedAt)}
                            </span>
                          </div>
                          <p className="text-body text-foreground">
                            {truncateText(entry.text, 96)}
                          </p>
                        </div>
                        <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </button>
                    ))
                  )}
                </Faceplate>
              </div>

              <div data-dashboard-telemetry-snapshot="">
                <Faceplate
                  kicker="TELEMETRY SNAPSHOT"
                  serial="EXECUTION PULSE"
                  stripeSlot={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveView('telemetry')}
                      className={DASHBOARD_GHOST_BUTTON_CLASS}
                      aria-label="Open full telemetry dashboard"
                    >
                      <Gauge className="h-4 w-4" />
                      Open telemetry
                    </Button>
                  }
                  bodyClassName="space-y-4"
                >
                  {!hasWorkspace ? (
                    <PanelMessageState
                      icon={Gauge}
                      title="Select a workspace"
                      description="Pick a workspace to load telemetry for the current execution window."
                      dataState="telemetry-snapshot-unselected"
                    />
                  ) : telemetryStatsQuery.isLoading || telemetryDailyQuery.isLoading ? (
                    <PanelSkeletonRows rows={4} heightClassName="h-24" className="sm:grid-cols-2" />
                  ) : telemetryStatsQuery.isError || telemetryDailyQuery.isError ? (
                    <PanelMessageState
                      icon={AlertTriangle}
                      title="Telemetry could not load"
                      description={formatQueryErrorMessage(
                        telemetryStatsQuery.error ?? telemetryDailyQuery.error,
                        'Telemetry is temporarily unavailable for this workspace.',
                      )}
                      tone="danger"
                      dataState="telemetry-snapshot-error"
                      action={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleRetryTelemetrySnapshot}
                          className={DASHBOARD_GLASS_BUTTON_CLASS}
                        >
                          <RefreshCw className="h-4 w-4" />
                          Retry
                        </Button>
                      }
                    />
                  ) : (telemetryStatsQuery.data?.totalRuns ?? 0) === 0 ? (
                    <PanelMessageState
                      icon={Gauge}
                      title="No completed runs yet"
                      description="As soon as work completes, this panel will surface run volume, cost, and latency."
                      dataState="telemetry-snapshot-empty"
                    />
                  ) : (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="cap p-4">
                          <p className="text-eyebrow text-silver-mute">Total runs</p>
                          <LcdWell className="mt-2 px-3 py-2">
                            <span className="text-numeric">
                              {formatCompactNumber(telemetryStatsQuery.data?.totalRuns)}
                            </span>
                          </LcdWell>
                        </div>
                        <div className="cap p-4">
                          <p className="text-eyebrow text-silver-mute">Total tokens</p>
                          <LcdWell className="mt-2 px-3 py-2">
                            <span className="text-numeric">
                              {formatCompactNumber(telemetryStatsQuery.data?.totalTokens)}
                            </span>
                          </LcdWell>
                        </div>
                        <div className="cap p-4">
                          <p className="text-eyebrow text-silver-mute">Avg latency</p>
                          <LcdWell className="mt-2 px-3 py-2">
                            <span className="text-numeric">
                              {formatCompactNumber(telemetryStatsQuery.data?.avgLatencyMs)}ms
                            </span>
                          </LcdWell>
                        </div>
                        <div className="cap p-4">
                          <p className="text-eyebrow text-silver-mute">Total cost</p>
                          <LcdWell className="mt-2 px-3 py-2">
                            <span className="text-numeric">
                              {formatUsd(telemetryStatsQuery.data?.totalCostUsd)}
                            </span>
                          </LcdWell>
                        </div>
                      </div>

                      <RecessedWell className="p-4 text-body text-silver-mute">
                        Current window: {formatCompactNumber(todayUsage?.totalRuns ?? 0)} runs,{' '}
                        {formatCompactNumber(todayUsage?.totalTokens ?? 0)} tokens,{' '}
                        {formatUsd(todayUsage?.costUsd)} cost.
                      </RecessedWell>

                      <button
                        type="button"
                        onClick={() =>
                          handleOpenAutonomy(pendingApprovalCount > 0 ? 'approvals' : 'budgets')
                        }
                        aria-label="Open autonomy snapshot detail"
                        className={cn(
                          'cap w-full p-4 text-left',
                          DASHBOARD_INTERACTIVE_FOCUS_CLASS,
                        )}
                        data-dashboard-autonomy-snapshot=""
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-eyebrow text-silver-mute">Autonomy snapshot</p>
                          <div className="flex items-center gap-2">
                            <span className="font-data text-label tabular-nums text-foreground">
                              {pendingApprovalCount}
                            </span>
                            <LampTile
                              label="PEND"
                              tone={pendingApprovalCount > 0 ? 'hold' : 'off'}
                              small
                              interactive={false}
                            />
                          </div>
                        </div>
                        <p className="mt-2 text-body text-foreground">
                          {budgetOverview
                            ? `${budgetOverview.activePolicyCount} active policies, ${budgetOverview.warningCount} warnings, ${budgetOverview.exceededCount} exceeded.`
                            : 'Open autonomy to review runtime, routine, and budget posture.'}
                        </p>
                        <p className="mt-1 text-caption text-muted-foreground">
                          {enabledRoutineCount} active routines shaping the queue. Operator posture
                          is {operatorPosture}.
                        </p>
                      </button>
                    </>
                  )}
                </Faceplate>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
