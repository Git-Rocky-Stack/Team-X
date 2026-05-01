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

import { Badge, badgeVariants } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
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
const DASHBOARD_GLASS_BUTTON_CLASS = `${DASHBOARD_TOUCH_BUTTON_CLASS} border-white/10 bg-black/10 hover:bg-black/20`;
const DASHBOARD_GHOST_BUTTON_CLASS = `${DASHBOARD_TOUCH_BUTTON_CLASS} border border-white/10 bg-black/10 hover:bg-black/20`;
const DASHBOARD_PILL_TOGGLE_CLASS = `${DASHBOARD_TOUCH_BUTTON_CLASS} rounded-full px-4`;
const DASHBOARD_PILL_GHOST_CLASS = `${DASHBOARD_TOUCH_BUTTON_CLASS} rounded-full border border-white/10 bg-black/10 hover:bg-black/20`;
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
      return 'Live';
    case 'blocked':
      return 'Blocked';
    case 'error':
      return 'Error';
    default:
      return 'Idle';
  }
}

function liveStatusClassName(status: DashboardQueueRow['liveStatus']): string {
  switch (status) {
    case 'thinking':
      return 'border-brand/30 bg-brand/10 text-brand';
    case 'blocked':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    case 'error':
      return 'border-red-500/30 bg-red-500/10 text-red-300';
    default:
      return 'border-border/80 bg-background/50 text-muted-foreground';
  }
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
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Activity;
  onClick?: () => void;
}) {
  const className = cn(
    'group flex flex-col gap-3 rounded-2xl border border-white/10 bg-black p-4 text-left transition-all',
    onClick && `${DASHBOARD_INTERACTIVE_FOCUS_CLASS} hover:border-brand/30 hover:bg-black`,
  );

  const content = (
    <>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
        <Icon className="h-4 w-4 text-brand" />
        {label}
      </div>
      <div className="flex items-end justify-between gap-3">
        <span className="text-2xl font-semibold tracking-normal text-foreground">{value}</span>
        {onClick && (
          <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        )}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </>
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
    <Card
      className="mission-panel flex min-h-[24rem] flex-col rounded-[24px] border-white/10 bg-transparent shadow-none"
      data-dashboard-primary-panel={dataPanel}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg font-semibold text-foreground">{title}</CardTitle>
            {countLabel && (
              <Badge
                variant="outline"
                className="border-border/80 bg-background/40 text-[10px] font-mono"
              >
                {countLabel}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {actions}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">{children}</CardContent>
    </Card>
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
        <div key={key} className={cn(heightClassName, 'animate-pulse rounded-2xl bg-black/10')} />
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
    <div
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border p-8 text-center',
        tone === 'danger'
          ? 'border-red-500/25 bg-red-500/10 text-red-200'
          : 'border-dashed border-white/10 bg-black/10 text-muted-foreground',
      )}
      data-dashboard-panel-state={dataState}
    >
      <Icon className={cn('h-8 w-8', tone === 'danger' ? 'text-red-300' : 'text-brand')} />
      <div className="space-y-1">
        <p
          className={cn(
            'text-sm font-medium',
            tone === 'danger' ? 'text-red-100' : 'text-foreground',
          )}
        >
          {title}
        </p>
        <p
          className={cn(
            'max-w-md text-sm',
            tone === 'danger' ? 'text-red-200/85' : 'text-muted-foreground',
          )}
        >
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

function runtimeStateClassName(tone: DashboardRuntimeOperationsSummary['stateTone']): string {
  switch (tone) {
    case 'accent':
      return 'border-brand/30 bg-brand/10 text-brand';
    case 'warning':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
    case 'danger':
      return 'border-red-500/30 bg-red-500/10 text-red-200';
    default:
      return 'border-white/10 bg-black/10 text-foreground/80';
  }
}

function formatRuntimeHeartbeat(value: number | null): string {
  return value === null ? 'No heartbeat yet' : formatTimeAgo(new Date(value).toISOString());
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
    <div
      className={cn(
        'rounded-2xl border bg-black p-4',
        tone === 'warning' && 'border-amber-500/25 bg-amber-950/40',
        tone === 'danger' && 'border-red-500/25 bg-red-950/40',
        tone === 'accent' && 'border-brand/25 bg-brand/40',
        tone === 'default' && 'border-white/10',
      )}
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
        <Icon
          className={cn(
            'h-4 w-4',
            tone === 'warning' && 'text-amber-300',
            tone === 'danger' && 'text-red-300',
            tone === 'accent' && 'text-brand',
            tone === 'default' && 'text-brand',
          )}
        />
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-normal text-foreground">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>
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
    <Card
      className="mission-panel rounded-[24px] border-white/10 bg-transparent shadow-none"
      data-dashboard-runtime-operations=""
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
            <HardDrive className="h-4 w-4 text-brand" />
            External Runtime Operations
            <Badge
              variant="outline"
              className={cn('font-mono text-[10px]', runtimeStateClassName(summary.stateTone))}
              data-dashboard-runtime-state={summary.stateLabel}
            >
              {summary.stateLabel}
            </Badge>
            {summary.budgetBlockedCount > 0 && (
              <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-500/10 font-mono text-[10px] text-amber-200"
                data-dashboard-runtime-budget-blocks=""
              >
                {summary.budgetBlockedCount} budget hard-stops
              </Badge>
            )}
          </div>
          <CardTitle className="text-lg text-foreground">Heartbeat and checkout pulse</CardTitle>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            External agents, active leases, heartbeat freshness, managed workspaces, and budget stop
            posture.
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
      </CardHeader>
      <CardContent className="space-y-4">
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
              <div
                className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-5 text-sm leading-6 text-muted-foreground"
                data-dashboard-runtime-empty=""
              >
                No external runtime session is active for this workspace.
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-3" data-dashboard-runtime-session-list="">
                {summary.recentSessions.map((session) => (
                  <div
                    key={session.id}
                    className="rounded-2xl border border-white/10 bg-black/10 p-4"
                    data-dashboard-runtime-session={session.id}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-brand/30 bg-brand/10 text-[10px] text-brand"
                      >
                        {session.adapterKind}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] font-mono',
                          session.status === 'working' && 'border-brand/30 bg-brand/10 text-brand',
                          (session.status === 'blocked' || session.status === 'stale') &&
                            'border-amber-500/30 bg-amber-500/10 text-amber-200',
                          (session.status === 'failed' || session.status === 'offline') &&
                            'border-red-500/30 bg-red-500/10 text-red-200',
                          !['working', 'blocked', 'stale', 'failed', 'offline'].includes(
                            session.status,
                          ) && 'border-white/10 bg-black/10 text-foreground/80',
                        )}
                      >
                        {session.status}
                      </Badge>
                      {session.workspaceManaged && (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-200"
                        >
                          isolated
                        </Badge>
                      )}
                    </div>
                    <p className="mt-3 break-all text-sm font-semibold text-foreground">
                      {session.currentTicketId ?? session.currentRunId ?? session.employeeId}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Last heartbeat {formatRuntimeHeartbeat(session.lastHeartbeatAt)}
                    </p>
                    {session.failureReason && (
                      <p className="mt-2 text-xs leading-5 text-amber-200">
                        {truncateText(session.failureReason, 120)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
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
      className="mission-shell relative min-h-full overflow-hidden"
      data-dashboard-mission-control=""
    >
      <div className="mission-grid pointer-events-none absolute inset-0 opacity-35" />
      <div className="relative flex flex-col gap-6 p-4 sm:p-6 xl:p-8">
        <div className="mission-hero rounded-[28px] border border-white/10 p-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            {heroSkeletonKeys.map((key) => (
              <div key={key} className="h-28 animate-pulse rounded-2xl bg-black" />
            ))}
          </div>
        </div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.95fr)]">
          <div className="h-[26rem] animate-pulse rounded-[24px] border border-white/10 bg-black/10" />
          <div className="h-[26rem] animate-pulse rounded-[24px] border border-white/10 bg-black/10" />
        </div>
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
      className="mission-shell relative min-h-full overflow-hidden"
      data-dashboard-mission-control=""
    >
      <div className="mission-grid pointer-events-none absolute inset-0 opacity-35" />
      <div className="relative flex flex-col gap-6 p-4 sm:p-6 xl:p-8">
        <header className="mission-hero overflow-hidden rounded-[28px] border border-white/10 p-6 lg:p-7">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-3xl space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
                  <LayoutPanelTop className="h-4 w-4 text-brand" />
                  Mission Control
                  {company?.slug && (
                    <Badge
                      variant="outline"
                      className="border-white/10 bg-black/10 font-mono text-[10px] text-foreground/80"
                    >
                      {company.slug}
                    </Badge>
                  )}
                  {company?.status && (
                    <Badge
                      variant="outline"
                      className="border-brand/25 bg-brand/10 font-mono text-[10px] text-brand"
                    >
                      {company.status}
                    </Badge>
                  )}
                </div>
                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-normal text-foreground sm:text-[2.35rem]">
                    {company?.name ?? 'Select a workspace to open the control surface'}
                  </h1>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
                    {company?.settings?.mission ??
                      'Track live execution, queue pressure, and operational telemetry from one surface without leaving the dashboard.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 xl:min-w-[21rem]">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant={layout.agentRuns ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handlePanelToggle('agentRuns')}
                    className={cn(
                      DASHBOARD_PILL_TOGGLE_CLASS,
                      !layout.agentRuns && 'border-white/10 bg-black/10 hover:bg-black/20',
                    )}
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
                    variant={layout.employeeQueues ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handlePanelToggle('employeeQueues')}
                    className={cn(
                      DASHBOARD_PILL_TOGGLE_CLASS,
                      !layout.employeeQueues && 'border-white/10 bg-black/10 hover:bg-black/20',
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

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge
                    variant="outline"
                    className="border-white/10 bg-black/10 text-foreground/80"
                  >
                    {visiblePrimaryPanelCount(layout)} / 2 live panels
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-white/10 bg-black/10 text-foreground/80"
                  >
                    {commandRows.length} recent commands
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-white/10 bg-black/10 text-foreground/80"
                  >
                    {tickets.length} tracked tickets
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-white/10 bg-black/10 text-foreground/80"
                    data-dashboard-autonomy-badge="routines"
                  >
                    {enabledRoutineCount} active routines
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      'border-white/10 bg-black/10 text-foreground/80',
                      runtimeOperationsSummary.attentionCount > 0 &&
                        'border-amber-500/30 bg-amber-500/10 text-amber-200',
                    )}
                    data-dashboard-runtime-badge=""
                  >
                    {runtimeOperationsReady
                      ? `${runtimeOperationsSummary.sessionCount} runtime sessions`
                      : 'runtime sessions'}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      'border-white/10 bg-black/10 text-foreground/80',
                      pendingApprovalCount > 0 &&
                        'border-amber-500/30 bg-amber-500/10 text-amber-200',
                    )}
                    data-dashboard-autonomy-badge="approvals"
                  >
                    {pendingApprovalCount} pending approvals
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-white/10 bg-black/10 text-foreground/80"
                  >
                    {operatorPosture} posture
                  </Badge>
                  {dashboardLayout.isSaving && (
                    <output
                      className={cn(
                        badgeVariants({ variant: 'outline' }),
                        'border-brand/25 bg-brand/10 text-brand',
                      )}
                      aria-live="polite"
                    >
                      Saving layout
                    </output>
                  )}
                </div>
                {dashboardLayout.error && (
                  <p className="text-xs text-red-200" data-dashboard-layout-error="" role="alert">
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
          </div>
        </header>

        {isError ? (
          <Card className="mission-panel rounded-[24px] border-white/10 bg-transparent shadow-none">
            <CardContent className="flex min-h-[18rem] flex-col items-center justify-center gap-4 text-center">
              <AlertTriangle className="h-10 w-10 text-red-300" />
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground">
                  Dashboard data could not load
                </h2>
                <p className="text-sm text-muted-foreground">
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
            </CardContent>
          </Card>
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
                        <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-100">
                          <div className="space-y-1">
                            <p className="font-medium">Run history refresh failed</p>
                            <p className="text-amber-100/80">
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
                        </div>
                      )}
                      {agentRuns.map((run) => (
                        <button
                          type="button"
                          key={run.runId}
                          onClick={() => handleOpenRunThread(run.threadId)}
                          aria-label={`Open Copilot thread for ${run.label}`}
                          className={cn(
                            'group rounded-2xl border border-white/10 bg-black/10 p-4 text-left transition-all hover:border-brand/30 hover:bg-black/20',
                            DASHBOARD_INTERACTIVE_FOCUS_CLASS,
                          )}
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-foreground">
                                  {truncateText(run.label, 72)}
                                </p>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-[10px] font-mono',
                                    run.status === 'completed' &&
                                      'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
                                    run.status === 'failed' &&
                                      'border-red-500/30 bg-red-500/10 text-red-300',
                                    run.status === 'running' &&
                                      'border-brand/30 bg-brand/10 text-brand',
                                  )}
                                >
                                  {run.status}
                                </Badge>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
                                <p className="text-xs text-red-300">
                                  {truncateText(run.failureReason, 120)}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-start gap-2 text-xs text-muted-foreground md:items-end">
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
                            className="rounded-2xl border border-white/10 bg-black/10 p-4"
                            data-dashboard-queue-row={row.employeeId}
                          >
                            <div className="flex flex-col gap-3">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-semibold text-foreground">
                                      {row.name}
                                    </p>
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        'text-[10px] font-mono',
                                        liveStatusClassName(row.liveStatus),
                                      )}
                                    >
                                      {liveStatusLabel(row.liveStatus)}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground">{row.title}</p>
                                  {row.liveActivity && (
                                    <p className="text-xs text-foreground/75">
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
                                <div className="h-2 overflow-hidden rounded-full bg-background/60">
                                  {totalTickets > 0 && (
                                    <div className="flex h-full">
                                      {row.counts.open > 0 && (
                                        <div
                                          className="h-full bg-slate-400/70"
                                          style={{
                                            width: `${(row.counts.open / totalTickets) * 100}%`,
                                          }}
                                        />
                                      )}
                                      {row.counts.inProgress > 0 && (
                                        <div
                                          className="h-full bg-brand/70"
                                          style={{
                                            width: `${(row.counts.inProgress / totalTickets) * 100}%`,
                                          }}
                                        />
                                      )}
                                      {row.counts.blocked > 0 && (
                                        <div
                                          className="h-full bg-amber-400/80"
                                          style={{
                                            width: `${(row.counts.blocked / totalTickets) * 100}%`,
                                          }}
                                        />
                                      )}
                                      {row.counts.done > 0 && (
                                        <div
                                          className="h-full bg-emerald-400/80"
                                          style={{
                                            width: `${(row.counts.done / totalTickets) * 100}%`,
                                          }}
                                        />
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
                                  <span>Open {row.counts.open}</span>
                                  <span>In progress {row.counts.inProgress}</span>
                                  <span>Blocked {row.counts.blocked}</span>
                                  <span>Done {row.counts.done}</span>
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
                  <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/10 bg-black/10 p-8 text-center">
                    <LayoutPanelTop className="h-8 w-8 text-brand" />
                    <p className="max-w-lg text-sm text-muted-foreground">
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
                  </div>
                </PrimaryPanel>
              )}
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)_minmax(320px,0.9fr)]">
              <div className="h-full">
                <Card className="mission-panel h-full rounded-[24px] border-white/10 bg-transparent shadow-none">
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
                      <Sparkles className="h-4 w-4 text-brand" />
                      Copilot Insights
                    </div>
                    <CardTitle className="text-lg text-foreground">Secondary rail</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      className="rounded-2xl border border-white/10 bg-black/10 p-4"
                      data-dashboard-secondary-panel="copilot"
                    >
                      <p className="mb-3 text-xs text-muted-foreground">
                        Keep live findings visible without letting them outrank the work boards.
                      </p>
                      <div className="[&_[data-copilot-widget]]:border-0 [&_[data-copilot-widget]]:bg-transparent [&_[data-copilot-widget]]:p-0 [&_[data-copilot-widget-count]]:border-white/10 [&_[data-copilot-widget-count]]:bg-black/10 [&_[data-copilot-widget-view-all]]:border-white/10 [&_[data-copilot-widget-view-all]]:bg-black/10 [&_[data-copilot-widget-view-all]]:hover:bg-black/20">
                        <CopilotDashboardWidget />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card
                className="mission-panel rounded-[24px] border-white/10 bg-transparent shadow-none"
                data-dashboard-recent-commands=""
              >
                <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
                      <Radar className="h-4 w-4 text-brand" />
                      Recent Commands
                    </div>
                    <CardTitle className="text-lg text-foreground">Command stream</CardTitle>
                  </div>
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
                </CardHeader>
                <CardContent className="space-y-3">
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
                          'group flex w-full items-start justify-between gap-4 rounded-2xl border border-white/10 bg-black/10 p-4 text-left transition-all hover:border-brand/30 hover:bg-black/20',
                          DASHBOARD_INTERACTIVE_FOCUS_CLASS,
                        )}
                      >
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className="border-brand/30 bg-brand/10 text-[10px] text-brand"
                            >
                              {intentLabel(entry.intent)}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatTimeAgo(entry.executedAt)}
                            </span>
                          </div>
                          <p className="text-sm text-foreground">{truncateText(entry.text, 96)}</p>
                        </div>
                        <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </button>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card
                className="mission-panel rounded-[24px] border-white/10 bg-transparent shadow-none"
                data-dashboard-telemetry-snapshot=""
              >
                <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
                      <Gauge className="h-4 w-4 text-brand" />
                      Telemetry Snapshot
                    </div>
                    <CardTitle className="text-lg text-foreground">Execution pulse</CardTitle>
                  </div>
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
                </CardHeader>
                <CardContent className="space-y-4">
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
                        <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                          <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                            Total runs
                          </p>
                          <p className="mt-2 text-2xl font-semibold tracking-normal text-foreground">
                            {formatCompactNumber(telemetryStatsQuery.data?.totalRuns)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                          <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                            Total tokens
                          </p>
                          <p className="mt-2 text-2xl font-semibold tracking-normal text-foreground">
                            {formatCompactNumber(telemetryStatsQuery.data?.totalTokens)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                          <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                            Avg latency
                          </p>
                          <p className="mt-2 text-2xl font-semibold tracking-normal text-foreground">
                            {formatCompactNumber(telemetryStatsQuery.data?.avgLatencyMs)}ms
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                          <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                            Total cost
                          </p>
                          <p className="mt-2 text-2xl font-semibold tracking-normal text-foreground">
                            {formatUsd(telemetryStatsQuery.data?.totalCostUsd)}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/10 p-4 text-sm text-muted-foreground">
                        Current window: {formatCompactNumber(todayUsage?.totalRuns ?? 0)} runs,{' '}
                        {formatCompactNumber(todayUsage?.totalTokens ?? 0)} tokens,{' '}
                        {formatUsd(todayUsage?.costUsd)} cost.
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          handleOpenAutonomy(pendingApprovalCount > 0 ? 'approvals' : 'budgets')
                        }
                        aria-label="Open autonomy snapshot detail"
                        className={cn(
                          'w-full rounded-2xl border border-white/10 bg-black/10 p-4 text-left transition hover:border-brand/30 hover:bg-black/20',
                          DASHBOARD_INTERACTIVE_FOCUS_CLASS,
                        )}
                        data-dashboard-autonomy-snapshot=""
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                            Autonomy snapshot
                          </p>
                          <Badge
                            variant="outline"
                            className={cn(
                              'border-white/10 bg-black/10 text-[10px] text-foreground/80',
                              pendingApprovalCount > 0 &&
                                'border-amber-500/30 bg-amber-500/10 text-amber-200',
                            )}
                          >
                            {pendingApprovalCount} pending
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm text-foreground">
                          {budgetOverview
                            ? `${budgetOverview.activePolicyCount} active policies, ${budgetOverview.warningCount} warnings, ${budgetOverview.exceededCount} exceeded.`
                            : 'Open autonomy to review runtime, routine, and budget posture.'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {enabledRoutineCount} active routines shaping the queue. Operator posture
                          is {operatorPosture}.
                        </p>
                      </button>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
