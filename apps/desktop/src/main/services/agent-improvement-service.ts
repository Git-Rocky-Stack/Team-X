import type {
  ActorKind,
  AgentImprovementRecommendation,
  AgentImprovementRunResult,
  AgentImprovementRunSummary,
  AgentImprovementSignalKind,
  AgentImprovementSnapshot,
  AuthorKind,
  EventType,
  ListAgentImprovementRequest,
  RunAgentImprovementRequest,
  Ticket,
  TicketPriority,
  TicketStatus,
} from '@team-x/shared-types';

export const AGENT_IMPROVEMENT_LABEL = 'agent-improvement';
export const AGENT_SELF_IMPROVEMENT_LABEL = 'self-improvement';

const AGENT_IMPROVEMENT_AUTO_LABEL = 'agent-improvement:auto-created';
const DEFAULT_EVENT_LIMIT = 200;
const DEFAULT_HISTORY_LIMIT = 10;
const MAX_EVENT_LIMIT = 500;
const STALE_IN_PROGRESS_MS = 48 * 60 * 60 * 1000;

const SIGNAL_LABELS: Record<AgentImprovementSignalKind, string> = {
  work_failures: 'agent-improvement:work-failures',
  runtime_failures: 'agent-improvement:runtime-failures',
  blocked_tickets: 'agent-improvement:blocked-tickets',
  stale_in_progress: 'agent-improvement:stale-in-progress',
};

interface EventRowLike {
  id: string;
  companyId: string;
  actorId: string;
  actorKind: string;
  eventType: string;
  payloadJson: string;
  createdAt: number;
}

interface TicketRowLike {
  id: string;
  companyId: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  reporterId: string;
  reporterKind: string;
  labelsJson: string;
  dependenciesJson: string;
  slaHours: number | null;
  dueAt: number | null;
  threadId: string | null;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
}

interface CreateTicketInputLike {
  companyId: string;
  title: string;
  description?: string;
  priority?: string;
  status?: string;
  assigneeId?: string | null;
  reporterId: string;
  reporterKind?: string;
  labelsJson?: string;
  dependenciesJson?: string;
  slaHours?: number | null;
  dueAt?: number | null;
  threadId?: string | null;
  closedAt?: number | null;
}

export interface AgentImprovementServiceDeps {
  ticketsRepo: {
    listByCompany(companyId: string): TicketRowLike[];
    create(input: CreateTicketInputLike): string;
  };
  eventsRepo: {
    listByCompany(companyId: string, cursor: number | undefined, limit: number): EventRowLike[];
  };
  bus?: {
    emit<T = unknown>(input: {
      type: EventType;
      companyId: string;
      actorId: string;
      actorKind: ActorKind;
      payload: T;
    }): void;
  };
  now?: () => number;
  reporterId?: string;
}

export interface AgentImprovementService {
  list(input: ListAgentImprovementRequest): AgentImprovementSnapshot;
  run(input: RunAgentImprovementRequest): AgentImprovementRunResult;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function clampLimit(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), 1), MAX_EVENT_LIMIT);
}

function parseLabels(labelsJson: string): string[] {
  try {
    const parsed = JSON.parse(labelsJson);
    if (!Array.isArray(parsed)) return [];
    return unique(
      parsed
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    );
  } catch {
    return [];
  }
}

function hasLabel(ticket: TicketRowLike, label: string): boolean {
  return parseLabels(ticket.labelsJson).includes(label);
}

function parsePayload(row: EventRowLike): Record<string, unknown> {
  try {
    const parsed = JSON.parse(row.payloadJson);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeStatus(value: string): TicketStatus {
  if (value === 'in-progress' || value === 'blocked' || value === 'done') return value;
  return 'open';
}

function normalizePriority(value: string): TicketPriority {
  if (value === 'low' || value === 'high' || value === 'critical') return value;
  return 'medium';
}

function normalizeAuthorKind(value: string): AuthorKind {
  if (value === 'employee' || value === 'system') return value;
  return 'user';
}

function rowToTicket(row: TicketRowLike): Ticket {
  return {
    id: row.id,
    companyId: row.companyId,
    title: row.title,
    description: row.description,
    status: normalizeStatus(row.status),
    priority: normalizePriority(row.priority),
    assigneeId: row.assigneeId,
    reporterId: row.reporterId,
    reporterKind: normalizeAuthorKind(row.reporterKind),
    labelsJson: row.labelsJson,
    dependenciesJson: row.dependenciesJson,
    slaHours: row.slaHours,
    dueAt: row.dueAt,
    threadId: row.threadId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    closedAt: row.closedAt,
  };
}

function createdTicketIdsFromPayload(payload: Record<string, unknown>): string[] {
  const value = payload.createdTicketIds;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function numberFromPayload(
  payload: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function rowToRunSummary(row: EventRowLike): AgentImprovementRunSummary {
  const payload = parsePayload(row);
  const createdTicketIds = createdTicketIdsFromPayload(payload);
  return {
    eventId: row.id,
    ranAt: row.createdAt,
    recommendationCount: numberFromPayload(payload, 'recommendationCount', 0),
    createdTicketCount: numberFromPayload(payload, 'createdTicketCount', createdTicketIds.length),
    createdTicketIds,
    inspectedEventCount: numberFromPayload(payload, 'inspectedEventCount', 0),
    inspectedTicketCount: numberFromPayload(payload, 'inspectedTicketCount', 0),
  };
}

function eventRef(row: EventRowLike): string {
  const payload = parsePayload(row);
  const parts = [row.id, row.eventType];
  const employeeId = typeof payload.employeeId === 'string' ? payload.employeeId : null;
  const threadId = typeof payload.threadId === 'string' ? payload.threadId : null;
  if (employeeId) parts.push(`employee=${employeeId}`);
  if (threadId) parts.push(`thread=${threadId}`);
  return parts.join(' | ');
}

function ticketRef(row: TicketRowLike): string {
  const status = normalizeStatus(row.status);
  return `${row.id} | ${status} | ${row.title}`;
}

function signalLabel(signalKind: AgentImprovementSignalKind): string {
  switch (signalKind) {
    case 'work_failures':
      return SIGNAL_LABELS.work_failures;
    case 'runtime_failures':
      return SIGNAL_LABELS.runtime_failures;
    case 'blocked_tickets':
      return SIGNAL_LABELS.blocked_tickets;
    case 'stale_in_progress':
      return SIGNAL_LABELS.stale_in_progress;
  }
  const _exhaustive: never = signalKind;
  return _exhaustive;
}

function signalLabels(signalKind: AgentImprovementSignalKind): string[] {
  return unique([
    AGENT_IMPROVEMENT_LABEL,
    AGENT_SELF_IMPROVEMENT_LABEL,
    AGENT_IMPROVEMENT_AUTO_LABEL,
    signalLabel(signalKind),
  ]);
}

function priorityFor(signalKind: AgentImprovementSignalKind, sourceCount: number): TicketPriority {
  if (signalKind === 'work_failures') return sourceCount >= 5 ? 'critical' : 'high';
  if (signalKind === 'runtime_failures') return 'high';
  if (signalKind === 'blocked_tickets') return sourceCount >= 3 ? 'high' : 'medium';
  return 'medium';
}

function signalTitle(signalKind: AgentImprovementSignalKind): string {
  switch (signalKind) {
    case 'work_failures':
      return 'Reduce recent agent work failures';
    case 'runtime_failures':
      return 'Stabilize recent runtime execution failures';
    case 'blocked_tickets':
      return 'Resolve blocked-ticket patterns';
    case 'stale_in_progress':
      return 'Review stale in-progress tickets';
  }
  const _exhaustive: never = signalKind;
  return _exhaustive;
}

function signalDescription(
  signalKind: AgentImprovementSignalKind,
  sourceCount: number,
  sourceRefs: string[],
): string {
  const label = signalLabel(signalKind);
  const evidence = sourceRefs
    .slice(0, 8)
    .map((ref) => `- ${ref}`)
    .join('\n');
  return [
    'Opened by the Agent Self-Improvement Loop.',
    '',
    `Signal: ${signalTitle(signalKind)}`,
    `Signal label: ${label}`,
    `Observed sources: ${sourceCount}`,
    '',
    'Evidence:',
    evidence.length > 0 ? evidence : '- No source refs captured.',
    '',
    'Expected outcome:',
    'Identify the underlying process, context, runtime, or collaboration failure and land a durable correction before closing this ticket.',
  ].join('\n');
}

function buildRecommendation(args: {
  signalKind: AgentImprovementSignalKind;
  sourceCount: number;
  sourceRefs: string[];
  existingTicketId: string | null;
  createdTicketId: string | null;
}): AgentImprovementRecommendation {
  const labels = signalLabels(args.signalKind);
  return {
    id: args.signalKind,
    signalKind: args.signalKind,
    title: signalTitle(args.signalKind),
    description: signalDescription(args.signalKind, args.sourceCount, args.sourceRefs),
    priority: priorityFor(args.signalKind, args.sourceCount),
    sourceCount: args.sourceCount,
    labels,
    sourceRefs: args.sourceRefs,
    existingTicketId: args.existingTicketId,
    createdTicketId: args.createdTicketId,
  };
}

function isOpenImprovementTicket(ticket: TicketRowLike): boolean {
  return normalizeStatus(ticket.status) !== 'done' && hasLabel(ticket, AGENT_IMPROVEMENT_LABEL);
}

function findExistingSignalTicket(
  tickets: TicketRowLike[],
  signalKind: AgentImprovementSignalKind,
): TicketRowLike | null {
  return (
    tickets.find(
      (ticket) => isOpenImprovementTicket(ticket) && hasLabel(ticket, signalLabel(signalKind)),
    ) ?? null
  );
}

function buildCandidateSignals(args: {
  events: EventRowLike[];
  tickets: TicketRowLike[];
  now: number;
}): Array<{
  signalKind: AgentImprovementSignalKind;
  sourceCount: number;
  sourceRefs: string[];
}> {
  const operationalTickets = args.tickets.filter(
    (ticket) => !hasLabel(ticket, AGENT_IMPROVEMENT_LABEL),
  );
  const workFailures = args.events.filter((event) => event.eventType === 'work.failed');
  const runtimeFailures = args.events.filter(
    (event) =>
      event.eventType === 'runtime.execution.failed' || event.eventType === 'runtime.session.stale',
  );
  const blockedTickets = operationalTickets.filter(
    (ticket) => normalizeStatus(ticket.status) === 'blocked',
  );
  const staleInProgress = operationalTickets.filter(
    (ticket) =>
      normalizeStatus(ticket.status) === 'in-progress' &&
      ticket.updatedAt <= args.now - STALE_IN_PROGRESS_MS,
  );

  const signals: Array<{
    signalKind: AgentImprovementSignalKind;
    sourceCount: number;
    sourceRefs: string[];
  }> = [];

  if (workFailures.length >= 2) {
    signals.push({
      signalKind: 'work_failures',
      sourceCount: workFailures.length,
      sourceRefs: workFailures.map(eventRef),
    });
  }
  if (runtimeFailures.length > 0) {
    signals.push({
      signalKind: 'runtime_failures',
      sourceCount: runtimeFailures.length,
      sourceRefs: runtimeFailures.map(eventRef),
    });
  }
  if (blockedTickets.length > 0) {
    signals.push({
      signalKind: 'blocked_tickets',
      sourceCount: blockedTickets.length,
      sourceRefs: blockedTickets.map(ticketRef),
    });
  }
  if (staleInProgress.length > 0) {
    signals.push({
      signalKind: 'stale_in_progress',
      sourceCount: staleInProgress.length,
      sourceRefs: staleInProgress.map(ticketRef),
    });
  }

  return signals;
}

function emitRunEvent(
  deps: AgentImprovementServiceDeps,
  reporterId: string,
  result: AgentImprovementRunResult,
): void {
  if (!deps.bus) return;
  try {
    deps.bus.emit({
      type: 'agent.improvementRun',
      companyId: result.companyId,
      actorId: reporterId,
      actorKind: 'system',
      payload: {
        recommendationCount: result.recommendations.length,
        createdTicketCount: result.createdTicketIds.length,
        createdTicketIds: result.createdTicketIds,
        skippedExistingTicketIds: result.skippedExistingTicketIds,
        inspectedEventCount: result.inspectedEventCount,
        inspectedTicketCount: result.inspectedTicketCount,
      },
    });
  } catch (err) {
    console.warn('[agent-improvement] failed to emit run event after durable ticket writes', err);
  }
}

export function createAgentImprovementService(
  deps: AgentImprovementServiceDeps,
): AgentImprovementService {
  const now = deps.now ?? Date.now;
  const reporterId = deps.reporterId ?? 'system-agent';

  return {
    list(input) {
      const limit = clampLimit(input.limit, DEFAULT_HISTORY_LIMIT);
      const eventReadLimit = clampLimit(limit * 10, DEFAULT_EVENT_LIMIT);
      const tickets = deps.ticketsRepo.listByCompany(input.companyId);
      const openTickets = tickets
        .filter(isOpenImprovementTicket)
        .map(rowToTicket)
        .sort((a, b) => b.createdAt - a.createdAt);
      const recentRuns = deps.eventsRepo
        .listByCompany(input.companyId, undefined, eventReadLimit)
        .filter((event) => event.eventType === 'agent.improvementRun')
        .map(rowToRunSummary)
        .slice(0, limit);

      return {
        companyId: input.companyId,
        generatedAt: now(),
        openTicketCount: openTickets.length,
        openTickets,
        recentRuns,
      };
    },

    run(input) {
      const eventLimit = clampLimit(input.eventLimit, DEFAULT_EVENT_LIMIT);
      const ranAt = now();
      const events = deps.eventsRepo.listByCompany(input.companyId, undefined, eventLimit);
      const tickets = deps.ticketsRepo.listByCompany(input.companyId);
      const candidateSignals = buildCandidateSignals({ events, tickets, now: ranAt });
      const createdTicketIds: string[] = [];
      const skippedExistingTicketIds: string[] = [];

      const recommendations = candidateSignals.map((signal) => {
        const existing = findExistingSignalTicket(tickets, signal.signalKind);
        if (existing) {
          skippedExistingTicketIds.push(existing.id);
          return buildRecommendation({
            ...signal,
            existingTicketId: existing.id,
            createdTicketId: null,
          });
        }

        if (input.dryRun) {
          return buildRecommendation({
            ...signal,
            existingTicketId: null,
            createdTicketId: null,
          });
        }

        const recommendation = buildRecommendation({
          ...signal,
          existingTicketId: null,
          createdTicketId: null,
        });
        const ticketId = deps.ticketsRepo.create({
          companyId: input.companyId,
          title: recommendation.title,
          description: recommendation.description,
          priority: recommendation.priority,
          status: 'open',
          assigneeId: null,
          reporterId,
          reporterKind: 'system',
          labelsJson: JSON.stringify(recommendation.labels),
          dependenciesJson: '[]',
        });
        createdTicketIds.push(ticketId);
        return { ...recommendation, createdTicketId: ticketId };
      });

      const result: AgentImprovementRunResult = {
        companyId: input.companyId,
        ranAt,
        inspectedEventCount: events.length,
        inspectedTicketCount: tickets.length,
        recommendations,
        createdTicketIds,
        skippedExistingTicketIds: unique(skippedExistingTicketIds),
      };

      emitRunEvent(deps, reporterId, result);
      return result;
    },
  };
}
