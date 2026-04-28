import type {
  AutonomyBenchmarkMode,
  AutonomyBenchmarkScenarioId,
  RuntimeProfileKind,
  TicketCheckoutStatus,
} from '@team-x/shared-types';

import { createArtifactsRepo } from '../db/repos/artifacts.js';
import { createCompaniesRepo } from '../db/repos/companies.js';
import { createEmployeesRepo } from '../db/repos/employees.js';
import { createEventsRepo } from '../db/repos/events.js';
import { createToolCallsRepo } from '../db/repos/mcp-servers.js';
import { createRunsRepo } from '../db/repos/runs.js';
import { createRuntimeProfilesRepo } from '../db/repos/runtime-profiles.js';
import { createRuntimeSessionsRepo } from '../db/repos/runtime-sessions.js';
import { createTicketCheckoutsRepo } from '../db/repos/ticket-checkouts.js';
import { createTicketsRepo } from '../db/repos/tickets.js';
import { makeTestDb } from '../db/test-helpers.js';
import { createEventBus } from '../orchestrator/event-bus.js';
import { createArtifactService } from './artifact-service.js';
import type { AutonomyBenchmarkScenarioContext } from './autonomy-benchmark-service.js';
import { createRuntimeAuditNormalizer } from './runtime-audit-normalizer-service.js';
import { createRuntimeOperationsService } from './runtime-operations-service.js';
import { createRuntimeSessionService } from './runtime-session-service.js';

const BENCHMARK_BASE_TIME_MS = Date.UTC(2026, 3, 28, 12, 0, 0);
const STALE_SESSION_MS = 2 * 60 * 1000;

const RUNTIME_MODEL_BY_KIND: Record<
  RuntimeProfileKind,
  { provider: string; model: string; endpointUrl: string | null }
> = {
  'teamx-internal': {
    provider: 'team-x',
    model: 'internal-control-plane',
    endpointUrl: null,
  },
  bash: {
    provider: 'team-x-bash',
    model: 'bash-control-plane',
    endpointUrl: null,
  },
  http: {
    provider: 'team-x-http',
    model: 'http-control-plane',
    endpointUrl: 'https://benchmark.local/runtime',
  },
  codex: {
    provider: 'codex',
    model: 'codex-control-plane',
    endpointUrl: null,
  },
  'claude-code': {
    provider: 'claude-code',
    model: 'claude-code-control-plane',
    endpointUrl: null,
  },
  cursor: {
    provider: 'cursor',
    model: 'cursor-control-plane',
    endpointUrl: null,
  },
};

function safeSlug(value: string): string {
  return value
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export async function createInMemoryAutonomyBenchmarkScenarioContext(input: {
  runtimeKind: RuntimeProfileKind;
  scenarioId: AutonomyBenchmarkScenarioId;
  mode: AutonomyBenchmarkMode;
  now?: number;
}): Promise<AutonomyBenchmarkScenarioContext> {
  const testDb = await makeTestDb();
  const companiesRepo = createCompaniesRepo(testDb.db);
  const employeesRepo = createEmployeesRepo(testDb.db);
  const runtimeProfilesRepo = createRuntimeProfilesRepo(testDb.db);
  const ticketsRepo = createTicketsRepo(testDb.db);
  const runsRepo = createRunsRepo(testDb.db);
  const eventsRepo = createEventsRepo(testDb.db);
  const toolCallsRepo = createToolCallsRepo(testDb.db);
  const runtimeSessionsRepo = createRuntimeSessionsRepo(testDb.db);
  const ticketCheckoutsRepo = createTicketCheckoutsRepo(testDb.db);
  const artifactsRepo = createArtifactsRepo(testDb.db);
  const bus = createEventBus({ repo: eventsRepo });
  const artifactService = createArtifactService({ artifactsRepo });
  const runtimeAuditNormalizer = createRuntimeAuditNormalizer({
    bus,
    toolCallsRepo,
    artifactService,
  });
  const runtimeSessionService = createRuntimeSessionService({
    runtimeSessionsRepo,
    runtimeAuditNormalizer,
  });
  const runtimeOperationsService = createRuntimeOperationsService({
    runtimeSessionService,
    ticketCheckoutsRepo,
    staleSessionMs: STALE_SESSION_MS,
    now: () => clock,
  });

  const notes: string[] = [];
  const ticketIds: string[] = [];
  const runIds: string[] = [];
  let clock = input.now ?? BENCHMARK_BASE_TIME_MS;
  const runtimeModel = RUNTIME_MODEL_BY_KIND[input.runtimeKind];
  const slug = safeSlug(`${input.scenarioId}-${input.runtimeKind}`);

  const companyId = companiesRepo.create({
    name: `Benchmark ${input.scenarioId}`,
    slug: `benchmark-${slug}`,
    settings: {
      mission: 'Measure accountable autonomous runtime control-plane behavior.',
      benchmarkMode: input.mode,
    },
  });
  const primaryEmployeeId = employeesRepo.create({
    companyId,
    rolePackId: 'benchmark',
    roleId: 'benchmark-primary-runtime',
    roleMdSha: 'benchmark',
    level: 'ic',
    name: 'Benchmark Primary',
    title: 'Autonomy Benchmark Runtime',
  });
  const secondaryEmployeeId = employeesRepo.create({
    companyId,
    rolePackId: 'benchmark',
    roleId: 'benchmark-secondary-runtime',
    roleMdSha: 'benchmark',
    level: 'ic',
    name: 'Benchmark Secondary',
    title: 'Autonomy Benchmark Competitor',
  });
  const runtimeProfileId = runtimeProfilesRepo.create({
    companyId,
    name: `${input.runtimeKind} Benchmark Profile`,
    slug: `${safeSlug(input.runtimeKind)}-benchmark`,
    kind: input.runtimeKind,
    enabled: true,
    configJson: JSON.stringify({
      benchmarkMode: input.mode,
      simulatedExecution: true,
      endpointUrl: runtimeModel.endpointUrl,
    }),
    lastHealthStatus: 'healthy',
    lastHealthMessage: 'Deterministic benchmark profile.',
    lastValidatedAt: clock,
  });
  runtimeProfilesRepo.upsertBinding({ companyId, employeeId: primaryEmployeeId, runtimeProfileId });
  runtimeProfilesRepo.upsertBinding({
    companyId,
    employeeId: secondaryEmployeeId,
    runtimeProfileId,
  });

  function createTicket(inputTicket: {
    title: string;
    description?: string;
    assigneeId?: string | null;
    status?: string;
  }): string {
    const ticketId = ticketsRepo.create({
      companyId,
      title: inputTicket.title,
      description: inputTicket.description ?? '',
      assigneeId: inputTicket.assigneeId ?? primaryEmployeeId,
      status: inputTicket.status ?? 'in-progress',
      reporterId: 'benchmark',
      reporterKind: 'system',
      labelsJson: JSON.stringify(['autonomy-benchmark']),
    });
    ticketIds.push(ticketId);
    return ticketId;
  }

  const ticketId = createTicket({
    title: `Benchmark: ${input.scenarioId}`,
    description: 'Deterministic autonomy benchmark control ticket.',
    assigneeId: primaryEmployeeId,
  });

  return {
    runtimeKind: input.runtimeKind,
    mode: input.mode,
    companyId,
    primaryEmployeeId,
    secondaryEmployeeId,
    ticketId,
    runtimeProfileId,
    workspacePath: `benchmark://${companyId}/${input.runtimeKind}`,
    endpointUrl: runtimeModel.endpointUrl,
    now: () => clock,
    advance(ms: number) {
      clock += ms;
      return clock;
    },
    note(message: string) {
      notes.push(message);
    },
    startRun(runInput = {}) {
      const runId = runsRepo.start({
        employeeId: runInput.employeeId ?? primaryEmployeeId,
        provider: runInput.provider ?? runtimeModel.provider,
        model: runInput.model ?? runtimeModel.model,
        kind: 'agentic',
      });
      runIds.push(runId);
      return runId;
    },
    finishRun(runId, runInput) {
      runsRepo.finish(runId, {
        status: runInput.status,
        promptTokens: runInput.promptTokens,
        completionTokens: runInput.completionTokens,
        latencyMs: runInput.latencyMs,
        costUsd: runInput.costUsd,
        error: runInput.error ?? undefined,
      });
    },
    createTicket,
    updateTicket(updateTicketId, patch) {
      ticketsRepo.update(updateTicketId, patch);
    },
    closeTicket(closeTicketId) {
      ticketsRepo.close(closeTicketId);
    },
    runtimeSessionService,
    runtimeOperationsService,
    ticketCheckoutsRepo,
    runtimeAuditNormalizer,
    collectEvidence() {
      const events = bus.replaySince(0);
      const sessions = runtimeSessionService.list(companyId);
      const checkoutStatuses = ticketIds.flatMap((trackedTicketId) =>
        ticketCheckoutsRepo
          .listByTicket(trackedTicketId)
          .map((checkout) => checkout.status as TicketCheckoutStatus),
      );
      const toolCallCount = runIds.reduce(
        (total, runId) => total + toolCallsRepo.listByRun(runId).length,
        0,
      );
      return {
        eventTypes: [...new Set(events.map((event) => event.type))],
        sessionStatuses: [...new Set(sessions.map((session) => session.status))],
        checkoutStatuses: [...new Set(checkoutStatuses)],
        artifactCount: artifactsRepo.listByCompany({ companyId }).length,
        toolCallCount,
        notes: [...notes],
      };
    },
    close() {
      testDb.close();
    },
  };
}
