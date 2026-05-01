import {
  AUTONOMY_BENCHMARK_SCENARIO_IDS,
  type AutonomyBenchmarkEvidence,
  type AutonomyBenchmarkMetrics,
  type AutonomyBenchmarkMode,
  type AutonomyBenchmarkReport,
  type AutonomyBenchmarkScenarioId,
  type AutonomyBenchmarkScenarioResult,
  type AutonomyBenchmarkSummary,
  type RuntimeAuditEventType,
  type RuntimeAuditUsageDelta,
  type RuntimeProfileKind,
  type RuntimeSession,
  type RuntimeSessionStatus,
  type TicketCheckoutStatus,
} from '@team-x/shared-types';
import { nanoid } from 'nanoid';


import type { TicketCheckoutRow, TicketCheckoutsRepo } from '../db/repos/ticket-checkouts.js';

import type {
  RuntimeAuditContext,
  RuntimeAuditNormalizer,
} from './runtime-audit-normalizer-service.js';
import type { RuntimeOperationsService } from './runtime-operations-service.js';
import type { RuntimeSessionService } from './runtime-session-service.js';

type RunStatus = 'success' | 'error' | 'cancelled';
type TicketPatch = { status?: string; title?: string; description?: string };

export const AUTONOMY_BENCHMARK_DEFAULT_RUNTIME_KINDS = [
  'teamx-internal',
  'bash',
  'http',
  'codex',
  'claude-code',
] as const satisfies readonly RuntimeProfileKind[];

const BENCHMARK_MODE = 'control-plane-simulated' satisfies AutonomyBenchmarkMode;
const DEFAULT_CHECKOUT_LEASE_MS = 5 * 60 * 1000;

const SCENARIO_LABELS: Record<AutonomyBenchmarkScenarioId, string> = {
  'single-ticket-claim-completion': 'Single ticket claim and completion',
  'race-for-one-ticket': 'Two agents racing for one ticket',
  'stale-worker-recovery': 'Stale worker recovery',
  'budget-hard-stop-before-execution': 'Budget hard-stop before execution',
  'budget-hard-stop-mid-run': 'Budget hard-stop mid-run',
  'missing-secret-failure': 'Missing secret failure',
  'blocked-ticket-delegation': 'Blocked-ticket delegation',
  'artifact-review-approval': 'Artifact review approval',
  'import-template-run-first-routine': 'Import template and run first routine',
  'reboot-resume-existing-checkpoint': 'Reboot/resume with existing checkpoint',
};

export interface AutonomyBenchmarkScenarioContext {
  runtimeKind: RuntimeProfileKind;
  mode: AutonomyBenchmarkMode;
  companyId: string;
  primaryEmployeeId: string;
  secondaryEmployeeId: string;
  ticketId: string;
  runtimeProfileId: string | null;
  workspacePath: string | null;
  endpointUrl: string | null;
  now(): number;
  advance(ms: number): number;
  note(message: string): void;
  startRun(input?: { employeeId?: string; provider?: string; model?: string }): string;
  finishRun(
    runId: string,
    input: {
      status: RunStatus;
      promptTokens: number;
      completionTokens: number;
      latencyMs: number;
      costUsd: string;
      error?: string | null;
    },
  ): void;
  createTicket(input: {
    title: string;
    description?: string;
    assigneeId?: string | null;
    status?: string;
  }): string;
  updateTicket(ticketId: string, patch: TicketPatch): void;
  closeTicket(ticketId: string): void;
  runtimeSessionService: Pick<
    RuntimeSessionService,
    'start' | 'heartbeat' | 'end' | 'recover' | 'list'
  >;
  runtimeOperationsService: Pick<RuntimeOperationsService, 'snapshot'>;
  ticketCheckoutsRepo: Pick<
    TicketCheckoutsRepo,
    'claim' | 'heartbeat' | 'release' | 'listByTicket'
  >;
  runtimeAuditNormalizer: RuntimeAuditNormalizer;
  collectEvidence(): AutonomyBenchmarkEvidence;
  close?(): void | Promise<void>;
}

export interface CreateAutonomyBenchmarkServiceInput {
  createScenarioContext(input: {
    runtimeKind: RuntimeProfileKind;
    scenarioId: AutonomyBenchmarkScenarioId;
    mode: AutonomyBenchmarkMode;
  }): AutonomyBenchmarkScenarioContext | Promise<AutonomyBenchmarkScenarioContext>;
  now?: () => number;
}

export interface RunAutonomyBenchmarkInput {
  runtimeKinds?: RuntimeProfileKind[];
  scenarioIds?: AutonomyBenchmarkScenarioId[];
}

type ScenarioRunner = (
  context: AutonomyBenchmarkScenarioContext,
) => Promise<AutonomyBenchmarkMetrics> | AutonomyBenchmarkMetrics;

function formatUsd(amount: number): string {
  return amount.toFixed(6);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return String(error);
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function metrics(overrides: Partial<AutonomyBenchmarkMetrics> = {}): AutonomyBenchmarkMetrics {
  return {
    successRate: 1,
    duplicateWorkRate: 0,
    staleRecoveryMs: null,
    costUsd: '0.000000',
    tokenCount: 0,
    latencyMs: 0,
    operatorInterventions: 0,
    artifactCompleteness: 1,
    ...overrides,
  };
}

function transportForRuntime(kind: RuntimeProfileKind): RuntimeAuditContext['transport'] {
  if (kind === 'teamx-internal') return null;
  if (kind === 'http') return 'http';
  return 'command';
}

function auditContext(
  context: AutonomyBenchmarkScenarioContext,
  input: {
    session?: RuntimeSession | null;
    employeeId?: string;
    runId?: string | null;
    ticketId?: string | null;
    checkoutId?: string | null;
  },
): RuntimeAuditContext {
  return {
    companyId: context.companyId,
    employeeId: input.employeeId ?? input.session?.employeeId ?? context.primaryEmployeeId,
    runtimeProfileId: context.runtimeProfileId,
    adapterKind: context.runtimeKind,
    transport: transportForRuntime(context.runtimeKind),
    sessionId: input.session?.id ?? null,
    runId: input.runId ?? input.session?.currentRunId ?? null,
    threadId: null,
    ticketId: input.ticketId ?? input.session?.currentTicketId ?? null,
    checkoutId: input.checkoutId ?? null,
    workspacePath: context.workspacePath,
    endpointUrl: context.endpointUrl,
    leaseExpiresAt: input.session?.leaseExpiresAt ?? null,
  };
}

function emitRuntimeEvent(
  context: AutonomyBenchmarkScenarioContext,
  input: Parameters<RuntimeAuditNormalizer['emit']>[0],
): void {
  context.runtimeAuditNormalizer.emit(input);
}

function startBenchmarkSession(
  context: AutonomyBenchmarkScenarioContext,
  input: { employeeId: string; runId: string | null; ticketId: string | null },
): RuntimeSession {
  const session = context.runtimeSessionService.start({
    companyId: context.companyId,
    employeeId: input.employeeId,
    runtimeProfileId: context.runtimeProfileId,
    adapterKind: context.runtimeKind,
    currentRunId: input.runId,
    currentTicketId: input.ticketId,
    workspacePath: context.workspacePath,
    endpointUrl: context.endpointUrl,
    leaseExpiresAt: input.ticketId ? context.now() + DEFAULT_CHECKOUT_LEASE_MS : null,
    capabilities: {
      benchmarkMode: context.mode,
      benchmarkRuntimeKind: context.runtimeKind,
      heartbeatContract: 'team-x-runtime-heartbeat-v1',
    },
    now: context.now(),
  });
  emitRuntimeEvent(context, {
    ...auditContext(context, { session, runId: input.runId, ticketId: input.ticketId }),
    type: 'runtime.session.started',
    status: 'starting',
    message: 'Benchmark runtime session started.',
  });
  return session;
}

function heartbeat(
  context: AutonomyBenchmarkScenarioContext,
  session: RuntimeSession,
  input: {
    runId: string | null;
    ticketId: string | null;
    checkoutId: string | null;
    message: string;
    usage?: RuntimeAuditUsageDelta | null;
    status?: RuntimeSessionStatus;
  },
): void {
  context.runtimeSessionService.heartbeat({
    sessionId: session.id,
    status: input.status ?? 'working',
    currentRunId: input.runId,
    currentTicketId: input.ticketId,
    message: input.message,
    costDeltaJson: JSON.stringify(input.usage ?? {}),
    leaseExpiresAt: input.ticketId ? context.now() + DEFAULT_CHECKOUT_LEASE_MS : null,
    now: context.now(),
  });
  emitRuntimeEvent(context, {
    ...auditContext(context, {
      session,
      runId: input.runId,
      ticketId: input.ticketId,
      checkoutId: input.checkoutId,
    }),
    type: 'runtime.heartbeat',
    status: input.status ?? 'working',
    message: input.message,
    usage: input.usage ?? null,
  });
}

function emitExecutionEvent(
  context: AutonomyBenchmarkScenarioContext,
  input: {
    type: RuntimeAuditEventType;
    session: RuntimeSession | null;
    employeeId?: string;
    runId: string | null;
    ticketId: string | null;
    checkoutId?: string | null;
    status: RuntimeSessionStatus;
    message: string;
    usage?: RuntimeAuditUsageDelta | null;
  },
): void {
  emitRuntimeEvent(context, {
    ...auditContext(context, {
      session: input.session,
      employeeId: input.employeeId,
      runId: input.runId,
      ticketId: input.ticketId,
      checkoutId: input.checkoutId ?? null,
    }),
    type: input.type,
    status: input.status,
    message: input.message,
    usage: input.usage ?? null,
  });
}

function claimTicket(
  context: AutonomyBenchmarkScenarioContext,
  input: { session: RuntimeSession; employeeId: string; runId: string; ticketId: string },
): TicketCheckoutRow {
  const claim = context.ticketCheckoutsRepo.claim({
    companyId: context.companyId,
    ticketId: input.ticketId,
    employeeId: input.employeeId,
    runtimeSessionId: input.session.id,
    runId: input.runId,
    expiresAt: context.now() + DEFAULT_CHECKOUT_LEASE_MS,
    now: context.now(),
  });

  if (claim.outcome === 'conflict') {
    emitRuntimeEvent(context, {
      ...auditContext(context, {
        session: input.session,
        employeeId: input.employeeId,
        runId: input.runId,
        ticketId: input.ticketId,
      }),
      type: 'runtime.checkout.conflict',
      status: 'blocked',
      message: `Ticket ${input.ticketId} is already checked out.`,
      conflictingCheckoutId: claim.conflictingCheckout.id,
      conflictingEmployeeId: claim.conflictingCheckout.employeeId,
    });
    throw new Error(`benchmark checkout conflict for ${input.ticketId}`);
  }

  emitRuntimeEvent(context, {
    ...auditContext(context, {
      session: input.session,
      employeeId: input.employeeId,
      runId: input.runId,
      ticketId: input.ticketId,
      checkoutId: claim.checkout.id,
    }),
    type: 'runtime.checkout.claimed',
    status: 'working',
    message: `Benchmark checkout ${claim.outcome}.`,
  });
  return claim.checkout;
}

function recordRuntimeArtifact(
  context: AutonomyBenchmarkScenarioContext,
  input: {
    session: RuntimeSession;
    runId: string;
    ticketId: string;
    outputText: string;
    usage: RuntimeAuditUsageDelta;
  },
): boolean {
  emitExecutionEvent(context, {
    type: 'runtime.execution.output',
    session: input.session,
    runId: input.runId,
    ticketId: input.ticketId,
    status: 'working',
    message: 'Benchmark runtime produced output.',
    usage: input.usage,
  });
  const artifact = context.runtimeAuditNormalizer.recordArtifact({
    ...auditContext(context, {
      session: input.session,
      runId: input.runId,
      ticketId: input.ticketId,
    }),
    outputText: input.outputText,
    usage: input.usage,
    createdAt: context.now(),
  });
  return artifact !== null;
}

function finishRun(
  context: AutonomyBenchmarkScenarioContext,
  runId: string,
  input: {
    status: RunStatus;
    promptTokens?: number;
    completionTokens?: number;
    latencyMs: number;
    costUsd?: string;
    error?: string | null;
  },
): void {
  context.finishRun(runId, {
    status: input.status,
    promptTokens: input.promptTokens ?? 0,
    completionTokens: input.completionTokens ?? 0,
    latencyMs: input.latencyMs,
    costUsd: input.costUsd ?? '0.000000',
    error: input.error ?? null,
  });
}

function completeSession(
  context: AutonomyBenchmarkScenarioContext,
  input: {
    session: RuntimeSession;
    checkoutId?: string | null;
    checkoutStatus?: Exclude<TicketCheckoutStatus, 'active'>;
    releaseReason?: string;
    now?: number;
  },
): void {
  const completedAt = input.now ?? context.now();
  if (input.checkoutId) {
    context.ticketCheckoutsRepo.release({
      checkoutId: input.checkoutId,
      status: input.checkoutStatus ?? 'completed',
      releaseReason: input.releaseReason ?? 'benchmark scenario completed',
      now: completedAt,
    });
  }
  context.runtimeSessionService.end(input.session.id, { status: 'ended', now: completedAt });
}

const SCENARIOS: Record<AutonomyBenchmarkScenarioId, ScenarioRunner> = {
  'single-ticket-claim-completion': (context) => {
    const runId = context.startRun();
    const session = startBenchmarkSession(context, {
      employeeId: context.primaryEmployeeId,
      runId,
      ticketId: context.ticketId,
    });
    const checkout = claimTicket(context, {
      session,
      employeeId: context.primaryEmployeeId,
      runId,
      ticketId: context.ticketId,
    });
    emitExecutionEvent(context, {
      type: 'runtime.execution.started',
      session,
      runId,
      ticketId: context.ticketId,
      checkoutId: checkout.id,
      status: 'working',
      message: 'Benchmark execution started.',
    });
    context.advance(120);
    heartbeat(context, session, {
      runId,
      ticketId: context.ticketId,
      checkoutId: checkout.id,
      message: 'Benchmark runtime heartbeat after checkout.',
      usage: { promptTokens: 80, completionTokens: 0 },
    });
    context.advance(530);
    const artifactRecorded = recordRuntimeArtifact(context, {
      session,
      runId,
      ticketId: context.ticketId,
      outputText: 'Completed the benchmark ticket with an auditable runtime artifact.',
      usage: { promptTokens: 80, completionTokens: 64 },
    });
    context.closeTicket(context.ticketId);
    completeSession(context, { session, checkoutId: checkout.id });
    finishRun(context, runId, {
      status: 'success',
      promptTokens: 80,
      completionTokens: 64,
      latencyMs: 650,
      costUsd: '0.001200',
    });
    return metrics({
      latencyMs: 650,
      costUsd: '0.001200',
      tokenCount: 144,
      artifactCompleteness: artifactRecorded ? 1 : 0,
    });
  },

  'race-for-one-ticket': (context) => {
    const firstRunId = context.startRun({ employeeId: context.primaryEmployeeId });
    const secondRunId = context.startRun({ employeeId: context.secondaryEmployeeId });
    const firstSession = startBenchmarkSession(context, {
      employeeId: context.primaryEmployeeId,
      runId: firstRunId,
      ticketId: context.ticketId,
    });
    const secondSession = startBenchmarkSession(context, {
      employeeId: context.secondaryEmployeeId,
      runId: secondRunId,
      ticketId: context.ticketId,
    });
    const firstCheckout = claimTicket(context, {
      session: firstSession,
      employeeId: context.primaryEmployeeId,
      runId: firstRunId,
      ticketId: context.ticketId,
    });
    const secondClaim = context.ticketCheckoutsRepo.claim({
      companyId: context.companyId,
      ticketId: context.ticketId,
      employeeId: context.secondaryEmployeeId,
      runtimeSessionId: secondSession.id,
      runId: secondRunId,
      expiresAt: context.now() + DEFAULT_CHECKOUT_LEASE_MS,
      now: context.now(),
    });
    assertCondition(secondClaim.outcome === 'conflict', 'second runtime did not get a conflict');
    emitRuntimeEvent(context, {
      ...auditContext(context, {
        session: secondSession,
        employeeId: context.secondaryEmployeeId,
        runId: secondRunId,
        ticketId: context.ticketId,
      }),
      type: 'runtime.checkout.conflict',
      status: 'blocked',
      message: 'Benchmark race conflict prevented duplicate work.',
      conflictingCheckoutId: secondClaim.conflictingCheckout.id,
      conflictingEmployeeId: secondClaim.conflictingCheckout.employeeId,
    });
    context.runtimeSessionService.end(secondSession.id, {
      status: 'blocked',
      failureReason: 'Benchmark race conflict prevented duplicate work.',
      now: context.now(),
    });
    context.advance(180);
    completeSession(context, {
      session: firstSession,
      checkoutId: firstCheckout.id,
      checkoutStatus: 'released',
      releaseReason: 'race benchmark control checkout released',
    });
    finishRun(context, firstRunId, { status: 'cancelled', latencyMs: 180 });
    finishRun(context, secondRunId, {
      status: 'error',
      latencyMs: 180,
      error: 'checkout conflict',
    });
    return metrics({ latencyMs: 180 });
  },

  'stale-worker-recovery': (context) => {
    const runId = context.startRun();
    const session = startBenchmarkSession(context, {
      employeeId: context.primaryEmployeeId,
      runId,
      ticketId: context.ticketId,
    });
    const checkout = claimTicket(context, {
      session,
      employeeId: context.primaryEmployeeId,
      runId,
      ticketId: context.ticketId,
    });
    context.ticketCheckoutsRepo.heartbeat(checkout.id, {
      now: context.now(),
      expiresAt: context.now() + 1_000,
    });
    context.advance(180_000);
    context.runtimeOperationsService.snapshot(context.companyId);
    const recoveredAt = context.advance(250);
    const recovered = context.runtimeSessionService.recover(session.id, {
      status: 'idle',
      now: recoveredAt,
    });
    assertCondition(recovered?.status === 'idle', 'stale session did not recover to idle');
    completeSession(context, { session, now: context.now() });
    finishRun(context, runId, { status: 'cancelled', latencyMs: 180_250 });
    context.note('Stale session was reaped, surfaced, and recovered without deleting history.');
    return metrics({ latencyMs: 180_250, staleRecoveryMs: 250 });
  },

  'budget-hard-stop-before-execution': (context) => {
    const runId = context.startRun();
    const message = '[runtime-budget] Budget cap reached before runtime execution.';
    emitExecutionEvent(context, {
      type: 'runtime.execution.failed',
      session: null,
      runId,
      ticketId: context.ticketId,
      status: 'blocked',
      message,
    });
    finishRun(context, runId, { status: 'error', latencyMs: 0, error: message });
    context.note('Deterministic budget gate blocked runtime launch before checkout.');
    return metrics({ operatorInterventions: 1 });
  },

  'budget-hard-stop-mid-run': (context) => {
    const runId = context.startRun();
    const session = startBenchmarkSession(context, {
      employeeId: context.primaryEmployeeId,
      runId,
      ticketId: context.ticketId,
    });
    const checkout = claimTicket(context, {
      session,
      employeeId: context.primaryEmployeeId,
      runId,
      ticketId: context.ticketId,
    });
    emitExecutionEvent(context, {
      type: 'runtime.execution.started',
      session,
      runId,
      ticketId: context.ticketId,
      checkoutId: checkout.id,
      status: 'working',
      message: 'Benchmark execution started before mid-run budget stop.',
    });
    context.advance(400);
    heartbeat(context, session, {
      runId,
      ticketId: context.ticketId,
      checkoutId: checkout.id,
      message: 'Benchmark heartbeat before mid-run budget stop.',
      usage: { promptTokens: 120, completionTokens: 12 },
    });
    context.advance(90);
    const message = '[runtime-budget] Runtime heartbeat blocked by budget policy.';
    emitExecutionEvent(context, {
      type: 'runtime.execution.failed',
      session,
      runId,
      ticketId: context.ticketId,
      checkoutId: checkout.id,
      status: 'blocked',
      message,
    });
    context.ticketCheckoutsRepo.release({
      checkoutId: checkout.id,
      status: 'blocked',
      releaseReason: message,
      now: context.now(),
    });
    context.runtimeSessionService.end(session.id, {
      status: 'blocked',
      failureReason: message,
      now: context.now(),
    });
    finishRun(context, runId, {
      status: 'error',
      promptTokens: 120,
      completionTokens: 12,
      latencyMs: 490,
      costUsd: '0.000400',
      error: message,
    });
    return metrics({
      latencyMs: 490,
      costUsd: '0.000400',
      tokenCount: 132,
      operatorInterventions: 1,
    });
  },

  'missing-secret-failure': (context) => {
    const runId = context.startRun();
    const message = 'Runtime profile is missing required secret ref: provider.apiKey.';
    emitExecutionEvent(context, {
      type: 'runtime.execution.failed',
      session: null,
      runId,
      ticketId: context.ticketId,
      status: 'blocked',
      message,
    });
    finishRun(context, runId, { status: 'error', latencyMs: 35, error: message });
    return metrics({ latencyMs: 35, operatorInterventions: 1 });
  },

  'blocked-ticket-delegation': (context) => {
    const dependencyTicketId = context.createTicket({
      title: 'Resolve benchmark dependency',
      description: 'Delegated dependency needed before the parent ticket can close.',
      assigneeId: context.secondaryEmployeeId,
      status: 'in-progress',
    });
    context.updateTicket(context.ticketId, {
      status: 'blocked',
      description: 'Parent ticket is blocked on delegated dependency.',
    });
    const runId = context.startRun({ employeeId: context.secondaryEmployeeId });
    const session = startBenchmarkSession(context, {
      employeeId: context.secondaryEmployeeId,
      runId,
      ticketId: dependencyTicketId,
    });
    const checkout = claimTicket(context, {
      session,
      employeeId: context.secondaryEmployeeId,
      runId,
      ticketId: dependencyTicketId,
    });
    context.advance(620);
    const artifactRecorded = recordRuntimeArtifact(context, {
      session,
      runId,
      ticketId: dependencyTicketId,
      outputText: 'Resolved the delegated dependency and attached evidence for the parent ticket.',
      usage: { promptTokens: 90, completionTokens: 70 },
    });
    context.closeTicket(dependencyTicketId);
    context.updateTicket(context.ticketId, { status: 'in-progress' });
    completeSession(context, { session, checkoutId: checkout.id });
    finishRun(context, runId, {
      status: 'success',
      promptTokens: 90,
      completionTokens: 70,
      latencyMs: 620,
      costUsd: '0.001000',
    });
    context.note('Parent ticket was blocked, delegated, and unblocked after dependency evidence.');
    return metrics({
      latencyMs: 620,
      costUsd: '0.001000',
      tokenCount: 160,
      artifactCompleteness: artifactRecorded ? 1 : 0,
    });
  },

  'artifact-review-approval': (context) => {
    const runId = context.startRun();
    const session = startBenchmarkSession(context, {
      employeeId: context.primaryEmployeeId,
      runId,
      ticketId: context.ticketId,
    });
    const checkout = claimTicket(context, {
      session,
      employeeId: context.primaryEmployeeId,
      runId,
      ticketId: context.ticketId,
    });
    context.advance(710);
    const artifactRecorded = recordRuntimeArtifact(context, {
      session,
      runId,
      ticketId: context.ticketId,
      outputText: 'Deliverable ready for operator review and approval.',
      usage: { promptTokens: 100, completionTokens: 88 },
    });
    assertCondition(artifactRecorded, 'artifact review benchmark did not record an artifact');
    context.note('Artifact evidence was produced before ticket closure approval.');
    context.closeTicket(context.ticketId);
    completeSession(context, { session, checkoutId: checkout.id });
    finishRun(context, runId, {
      status: 'success',
      promptTokens: 100,
      completionTokens: 88,
      latencyMs: 710,
      costUsd: '0.001500',
    });
    return metrics({
      latencyMs: 710,
      costUsd: '0.001500',
      tokenCount: 188,
      operatorInterventions: 1,
    });
  },

  'import-template-run-first-routine': (context) => {
    const importedTicketId = context.createTicket({
      title: 'Imported routine kickoff',
      description: 'First ticket created from a deterministic benchmark template import.',
      assigneeId: context.primaryEmployeeId,
      status: 'in-progress',
    });
    const runId = context.startRun();
    const session = startBenchmarkSession(context, {
      employeeId: context.primaryEmployeeId,
      runId,
      ticketId: importedTicketId,
    });
    const checkout = claimTicket(context, {
      session,
      employeeId: context.primaryEmployeeId,
      runId,
      ticketId: importedTicketId,
    });
    context.advance(840);
    const artifactRecorded = recordRuntimeArtifact(context, {
      session,
      runId,
      ticketId: importedTicketId,
      outputText: 'First imported routine run completed with a portable artifact.',
      usage: { promptTokens: 140, completionTokens: 92 },
    });
    context.closeTicket(importedTicketId);
    completeSession(context, { session, checkoutId: checkout.id });
    finishRun(context, runId, {
      status: 'success',
      promptTokens: 140,
      completionTokens: 92,
      latencyMs: 840,
      costUsd: '0.001800',
    });
    context.note('Template import was represented as a non-destructive ticket/routine kickoff.');
    return metrics({
      latencyMs: 840,
      costUsd: '0.001800',
      tokenCount: 232,
      artifactCompleteness: artifactRecorded ? 1 : 0,
    });
  },

  'reboot-resume-existing-checkpoint': (context) => {
    const runId = context.startRun();
    const session = startBenchmarkSession(context, {
      employeeId: context.primaryEmployeeId,
      runId,
      ticketId: context.ticketId,
    });
    const checkout = claimTicket(context, {
      session,
      employeeId: context.primaryEmployeeId,
      runId,
      ticketId: context.ticketId,
    });
    heartbeat(context, session, {
      runId,
      ticketId: context.ticketId,
      checkoutId: checkout.id,
      message: 'Checkpoint persisted before benchmark reboot.',
      usage: { promptTokens: 60, completionTokens: 10 },
    });
    context.advance(180_000);
    context.runtimeOperationsService.snapshot(context.companyId);
    const recoveredAt = context.advance(500);
    const recovered = context.runtimeSessionService.recover(session.id, {
      status: 'working',
      now: recoveredAt,
    });
    assertCondition(recovered?.status === 'working', 'reboot resume did not recover work state');
    const artifactRecorded = recordRuntimeArtifact(context, {
      session,
      runId,
      ticketId: context.ticketId,
      outputText: 'Recovered checkpoint and resumed the existing work item.',
      usage: { promptTokens: 75, completionTokens: 35 },
    });
    completeSession(context, { session });
    finishRun(context, runId, {
      status: 'success',
      promptTokens: 75,
      completionTokens: 35,
      latencyMs: 180_500,
      costUsd: '0.000900',
    });
    context.note('Existing session/checkpoint recovered after simulated process restart.');
    return metrics({
      latencyMs: 180_500,
      staleRecoveryMs: 500,
      costUsd: '0.000900',
      tokenCount: 110,
      artifactCompleteness: artifactRecorded ? 1 : 0,
    });
  },
};

function failedMetrics(): AutonomyBenchmarkMetrics {
  return metrics({
    successRate: 0,
    duplicateWorkRate: 1,
    artifactCompleteness: 0,
  });
}

function summarize(results: AutonomyBenchmarkScenarioResult[]): AutonomyBenchmarkSummary {
  const scenarioCount = results.length;
  const passedCount = results.filter((result) => result.status === 'passed').length;
  const failedCount = scenarioCount - passedCount;
  const staleRecoveryValues = results
    .map((result) => result.metrics.staleRecoveryMs)
    .filter((value): value is number => typeof value === 'number');
  const totalCost = results.reduce((total, result) => total + Number(result.metrics.costUsd), 0);
  const totalTokenCount = results.reduce((total, result) => total + result.metrics.tokenCount, 0);
  const operatorInterventions = results.reduce(
    (total, result) => total + result.metrics.operatorInterventions,
    0,
  );
  const mean = (values: number[]) =>
    values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : 0;

  return {
    scenarioCount,
    passedCount,
    failedCount,
    successRate: scenarioCount > 0 ? passedCount / scenarioCount : 0,
    duplicateWorkRate: mean(results.map((result) => result.metrics.duplicateWorkRate)),
    meanLatencyMs: Math.round(mean(results.map((result) => result.metrics.latencyMs))),
    meanStaleRecoveryMs:
      staleRecoveryValues.length > 0 ? Math.round(mean(staleRecoveryValues)) : null,
    totalCostUsd: formatUsd(totalCost),
    totalTokenCount,
    operatorInterventions,
    artifactCompleteness: mean(results.map((result) => result.metrics.artifactCompleteness)),
  };
}

export function createAutonomyBenchmarkService({
  createScenarioContext,
  now = Date.now,
}: CreateAutonomyBenchmarkServiceInput) {
  return {
    async run(input: RunAutonomyBenchmarkInput = {}): Promise<AutonomyBenchmarkReport> {
      const runtimeKinds =
        input.runtimeKinds && input.runtimeKinds.length > 0
          ? input.runtimeKinds
          : [...AUTONOMY_BENCHMARK_DEFAULT_RUNTIME_KINDS];
      const scenarioIds =
        input.scenarioIds && input.scenarioIds.length > 0
          ? input.scenarioIds
          : [...AUTONOMY_BENCHMARK_SCENARIO_IDS];

      const results: AutonomyBenchmarkScenarioResult[] = [];
      for (const runtimeKind of runtimeKinds) {
        for (const scenarioId of scenarioIds) {
          let context: AutonomyBenchmarkScenarioContext | null = null;
          let startedAt = now();
          try {
            context = await createScenarioContext({
              runtimeKind,
              scenarioId,
              mode: BENCHMARK_MODE,
            });
            startedAt = context.now();
            const runner = SCENARIOS[scenarioId];
            assertCondition(runner, `No benchmark scenario runner registered for ${scenarioId}`);
            const scenarioMetrics = await runner(context);
            const endedAt = context.now();
            results.push({
              scenarioId,
              label: SCENARIO_LABELS[scenarioId],
              runtimeKind,
              mode: BENCHMARK_MODE,
              status: 'passed',
              startedAt,
              endedAt,
              metrics: scenarioMetrics,
              evidence: context.collectEvidence(),
              error: null,
            });
          } catch (error) {
            const endedAt = context?.now() ?? now();
            results.push({
              scenarioId,
              label: SCENARIO_LABELS[scenarioId],
              runtimeKind,
              mode: BENCHMARK_MODE,
              status: 'failed',
              startedAt,
              endedAt,
              metrics: failedMetrics(),
              evidence: context?.collectEvidence() ?? {
                eventTypes: [],
                sessionStatuses: [],
                checkoutStatuses: [],
                artifactCount: 0,
                toolCallCount: 0,
                notes: [],
              },
              error: toErrorMessage(error),
            });
          } finally {
            await context?.close?.();
          }
        }
      }

      return {
        id: `autonomy-benchmark-${nanoid()}`,
        generatedAt: now(),
        mode: BENCHMARK_MODE,
        runtimeKinds,
        scenarioIds,
        results,
        summary: summarize(results),
      };
    },
  };
}

export type AutonomyBenchmarkService = ReturnType<typeof createAutonomyBenchmarkService>;
