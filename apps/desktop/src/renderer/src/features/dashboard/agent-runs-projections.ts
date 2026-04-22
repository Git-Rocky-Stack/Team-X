import type {
  AgentStepKind,
  AgentStepPayload,
  AgenticCompletedPayload,
  AgenticFailedPayload,
  CommandExecutedPayload,
  DashboardEvent,
  TelemetryRecentRunRow,
} from '@team-x/shared-types';

export type DashboardAgentRunPhase = AgentStepKind | 'running' | 'completed' | 'failed';
export type DashboardAgentRunStatus = 'running' | 'completed' | 'failed';

export interface DashboardAgentRun {
  runId: string;
  threadId: string;
  label: string;
  latestPhase: DashboardAgentRunPhase;
  status: DashboardAgentRunStatus;
  stepCount: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  durationMs: number | null;
  failureReason: string | null;
  provider: string | null;
  model: string | null;
  startedAt: number;
  updatedAt: number;
}

const MAX_RUNS = 6;

function fallbackLabel(runId: string): string {
  return `Run ${runId.slice(0, 8)}`;
}

function normalizeLabel(text: string | undefined, runId: string): string {
  const normalized = text?.trim();
  return normalized && normalized.length > 0 ? normalized : fallbackLabel(runId);
}

function sortRuns(runs: readonly DashboardAgentRun[]): DashboardAgentRun[] {
  return [...runs].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_RUNS);
}

function mapPersistedStatus(
  status: TelemetryRecentRunRow['status'],
): Pick<DashboardAgentRun, 'latestPhase' | 'status' | 'failureReason'> {
  switch (status) {
    case 'success':
      return {
        latestPhase: 'completed',
        status: 'completed',
        failureReason: null,
      };
    case 'error':
      return {
        latestPhase: 'failed',
        status: 'failed',
        failureReason: null,
      };
    case 'cancelled':
      return {
        latestPhase: 'failed',
        status: 'failed',
        failureReason: 'cancelled',
      };
    default:
      return {
        latestPhase: 'running',
        status: 'running',
        failureReason: null,
      };
  }
}

export function projectTelemetryRecentRuns(rows: readonly TelemetryRecentRunRow[]): DashboardAgentRun[] {
  return sortRuns(
    rows
      .filter((row) => typeof row.threadId === 'string' && row.threadId.length > 0)
      .map((row) => {
        const status = mapPersistedStatus(row.status);
        return {
          runId: row.runId,
          threadId: row.threadId!,
          label: normalizeLabel(row.threadSubject ?? row.employeeName, row.runId),
          latestPhase: status.latestPhase,
          status: status.status,
          stepCount: 0,
          tokensIn: row.promptTokens,
          tokensOut: row.completionTokens,
          costUsd: Number.parseFloat(row.costUsd) || 0,
          durationMs:
            row.endedAt !== null ? Math.max(0, row.endedAt - row.startedAt) : null,
          failureReason: row.error ?? status.failureReason,
          provider: row.provider,
          model: row.model,
          startedAt: row.startedAt,
          updatedAt: row.endedAt ?? row.startedAt,
        } satisfies DashboardAgentRun;
      }),
  );
}

export function mergeDashboardAgentRuns(
  base: readonly DashboardAgentRun[],
  overlay: readonly DashboardAgentRun[],
): DashboardAgentRun[] {
  const merged = new Map<string, DashboardAgentRun>();
  for (const run of base) {
    merged.set(run.runId, run);
  }
  for (const run of overlay) {
    merged.set(run.runId, run);
  }
  return sortRuns([...merged.values()]);
}

function upsertRun(
  runs: readonly DashboardAgentRun[],
  runId: string,
  build: (existing: DashboardAgentRun | undefined) => DashboardAgentRun,
): DashboardAgentRun[] {
  const existing = runs.find((run) => run.runId === runId);
  const next = build(existing);
  const rest = runs.filter((run) => run.runId !== runId);
  return sortRuns([next, ...rest]);
}

export function formatAgentRunPhase(phase: DashboardAgentRunPhase): string {
  switch (phase) {
    case 'running':
      return 'Running';
    case 'tool_call':
      return 'Tool call';
    case 'tool_result':
      return 'Tool result';
    case 'ticket_created':
      return 'Ticket created';
    case 'delegation_made':
      return 'Delegation';
    case 'review_pending':
      return 'Review';
    case 'completed':
      return 'Answer';
    case 'failed':
      return 'Failed';
    default:
      return phase.charAt(0).toUpperCase() + phase.slice(1);
  }
}

export function reduceDashboardAgentRuns(
  runs: readonly DashboardAgentRun[],
  event: DashboardEvent,
): DashboardAgentRun[] {
  switch (event.type) {
    case 'command.executed': {
      const payload = event.payload as CommandExecutedPayload;
      if (!payload.runId || !payload.threadId) return [...runs];
      return upsertRun(runs, payload.runId, (existing) => ({
        runId: payload.runId!,
        threadId: payload.threadId!,
        label: normalizeLabel(payload.rawText, payload.runId!),
        latestPhase: existing?.latestPhase ?? 'running',
        status: existing?.status ?? 'running',
        stepCount: existing?.stepCount ?? 0,
        tokensIn: existing?.tokensIn ?? 0,
        tokensOut: existing?.tokensOut ?? 0,
        costUsd: existing?.costUsd ?? 0,
        durationMs: existing?.durationMs ?? null,
        failureReason: existing?.failureReason ?? null,
        provider: existing?.provider ?? null,
        model: existing?.model ?? null,
        startedAt: existing?.startedAt ?? event.createdAt,
        updatedAt: event.createdAt,
      }));
    }

    case 'agent.step': {
      const payload = event.payload as AgentStepPayload;
      return upsertRun(runs, payload.runId, (existing) => ({
        runId: payload.runId,
        threadId: payload.threadId,
        label: existing?.label ?? fallbackLabel(payload.runId),
        latestPhase: payload.kind,
        status: 'running',
        stepCount: Math.max(existing?.stepCount ?? 0, payload.stepIndex + 1),
        tokensIn: payload.tokensIn,
        tokensOut: payload.tokensOut,
        costUsd: payload.costUsd,
        durationMs: existing?.durationMs ?? null,
        failureReason: null,
        provider: payload.provider,
        model: payload.model,
        startedAt: existing?.startedAt ?? event.createdAt,
        updatedAt: event.createdAt,
      }));
    }

    case 'agentic.completed': {
      const payload = event.payload as AgenticCompletedPayload;
      return upsertRun(runs, payload.runId, (existing) => ({
        runId: payload.runId,
        threadId: payload.threadId,
        label: existing?.label ?? fallbackLabel(payload.runId),
        latestPhase: 'completed',
        status: 'completed',
        stepCount: payload.totalSteps,
        tokensIn: payload.tokensIn,
        tokensOut: payload.tokensOut,
        costUsd: payload.costUsd,
        durationMs: payload.durationMs,
        failureReason: null,
        provider: existing?.provider ?? null,
        model: existing?.model ?? null,
        startedAt: existing?.startedAt ?? event.createdAt,
        updatedAt: event.createdAt,
      }));
    }

    case 'agentic.failed': {
      const payload = event.payload as AgenticFailedPayload;
      return upsertRun(runs, payload.runId, (existing) => ({
        runId: payload.runId,
        threadId: payload.threadId,
        label: existing?.label ?? fallbackLabel(payload.runId),
        latestPhase: 'failed',
        status: 'failed',
        stepCount: payload.totalSteps,
        tokensIn: payload.tokensIn,
        tokensOut: payload.tokensOut,
        costUsd: payload.costUsd,
        durationMs: payload.durationMs,
        failureReason: payload.reason || payload.message,
        provider: existing?.provider ?? null,
        model: existing?.model ?? null,
        startedAt: existing?.startedAt ?? event.createdAt,
        updatedAt: event.createdAt,
      }));
    }

    default:
      return [...runs];
  }
}
