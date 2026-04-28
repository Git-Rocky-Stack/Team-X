import type {
  RuntimeOperationsSnapshot,
  RuntimeProfileKind,
  RuntimeSession,
} from '@team-x/shared-types';

export interface DashboardRuntimeAdapterCount {
  kind: RuntimeProfileKind;
  count: number;
}

export interface DashboardRuntimeSessionRow {
  id: string;
  employeeId: string;
  adapterKind: RuntimeProfileKind;
  status: RuntimeSession['status'];
  currentRunId: string | null;
  currentTicketId: string | null;
  lastHeartbeatAt: number | null;
  workspaceManaged: boolean;
  failureReason: string | null;
}

export interface DashboardRuntimeOperationsSummary {
  sessionCount: number;
  workingSessionCount: number;
  blockedSessionCount: number;
  staleSessionCount: number;
  failedSessionCount: number;
  missingHeartbeatCount: number;
  managedWorkspaceCount: number;
  activeCheckoutCount: number;
  budgetBlockedCount: number;
  checkoutBlockedCount: number;
  attentionCount: number;
  latestHeartbeatAt: number | null;
  stateLabel: 'Quiet' | 'Standing by' | 'Executing' | 'Action needed';
  stateTone: 'default' | 'accent' | 'warning' | 'danger';
  adapterCounts: DashboardRuntimeAdapterCount[];
  recentSessions: DashboardRuntimeSessionRow[];
}

const MAX_RECENT_SESSIONS = 3;

function hasManagedWorkspace(session: RuntimeSession): boolean {
  return session.capabilities.managedWorkspace === true || Boolean(session.workspacePath);
}

function failureText(session: RuntimeSession): string {
  return session.failureReason?.toLowerCase() ?? '';
}

function isBudgetBlocked(session: RuntimeSession): boolean {
  const reason = failureText(session);
  return reason.includes('budget') || reason.includes('hard-stop');
}

function isCheckoutBlocked(session: RuntimeSession): boolean {
  const reason = failureText(session);
  return reason.includes('checkout') || reason.includes('lease') || reason.includes('conflict');
}

function compareSessionsByFreshness(a: RuntimeSession, b: RuntimeSession): number {
  const aFreshness = a.lastHeartbeatAt ?? a.updatedAt;
  const bFreshness = b.lastHeartbeatAt ?? b.updatedAt;
  return bFreshness - aFreshness;
}

function projectRecentSession(session: RuntimeSession): DashboardRuntimeSessionRow {
  return {
    id: session.id,
    employeeId: session.employeeId,
    adapterKind: session.adapterKind,
    status: session.status,
    currentRunId: session.currentRunId,
    currentTicketId: session.currentTicketId,
    lastHeartbeatAt: session.lastHeartbeatAt,
    workspaceManaged: hasManagedWorkspace(session),
    failureReason: session.failureReason,
  };
}

function emptySummary(): DashboardRuntimeOperationsSummary {
  return {
    sessionCount: 0,
    workingSessionCount: 0,
    blockedSessionCount: 0,
    staleSessionCount: 0,
    failedSessionCount: 0,
    missingHeartbeatCount: 0,
    managedWorkspaceCount: 0,
    activeCheckoutCount: 0,
    budgetBlockedCount: 0,
    checkoutBlockedCount: 0,
    attentionCount: 0,
    latestHeartbeatAt: null,
    stateLabel: 'Quiet',
    stateTone: 'default',
    adapterCounts: [],
    recentSessions: [],
  };
}

function resolveStateLabel(summary: DashboardRuntimeOperationsSummary) {
  if (summary.attentionCount > 0) {
    return {
      stateLabel: 'Action needed',
      stateTone: summary.failedSessionCount > 0 ? 'danger' : 'warning',
    } as const;
  }
  if (summary.workingSessionCount > 0) {
    return { stateLabel: 'Executing', stateTone: 'accent' } as const;
  }
  if (summary.sessionCount > 0) {
    return { stateLabel: 'Standing by', stateTone: 'default' } as const;
  }
  return { stateLabel: 'Quiet', stateTone: 'default' } as const;
}

export function summarizeRuntimeOperationsForDashboard(
  snapshot: RuntimeOperationsSnapshot | null | undefined,
): DashboardRuntimeOperationsSummary {
  if (!snapshot) return emptySummary();

  const summary = emptySummary();
  const adapterCounts = new Map<RuntimeProfileKind, number>();
  summary.sessionCount = snapshot.sessions.length;
  summary.activeCheckoutCount = snapshot.activeCheckouts.length;

  for (const session of snapshot.sessions) {
    adapterCounts.set(session.adapterKind, (adapterCounts.get(session.adapterKind) ?? 0) + 1);
    if (session.status === 'working') summary.workingSessionCount += 1;
    if (session.status === 'blocked') summary.blockedSessionCount += 1;
    if (session.status === 'stale') summary.staleSessionCount += 1;
    if (session.status === 'failed' || session.status === 'offline')
      summary.failedSessionCount += 1;
    if (session.lastHeartbeatAt === null) summary.missingHeartbeatCount += 1;
    if (hasManagedWorkspace(session)) summary.managedWorkspaceCount += 1;
    if (isBudgetBlocked(session)) summary.budgetBlockedCount += 1;
    if (isCheckoutBlocked(session)) summary.checkoutBlockedCount += 1;
    if (
      session.lastHeartbeatAt !== null &&
      (summary.latestHeartbeatAt === null || session.lastHeartbeatAt > summary.latestHeartbeatAt)
    ) {
      summary.latestHeartbeatAt = session.lastHeartbeatAt;
    }
  }

  summary.attentionCount =
    summary.blockedSessionCount +
    summary.staleSessionCount +
    summary.failedSessionCount +
    summary.missingHeartbeatCount;
  summary.adapterCounts = [...adapterCounts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
  summary.recentSessions = [...snapshot.sessions]
    .sort(compareSessionsByFreshness)
    .slice(0, MAX_RECENT_SESSIONS)
    .map(projectRecentSession);

  return {
    ...summary,
    ...resolveStateLabel(summary),
  };
}
