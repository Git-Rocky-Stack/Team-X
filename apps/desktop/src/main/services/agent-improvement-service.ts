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
// H12 audit (2026-05-07): every auto-created improvement ticket carries a
// deterministic cause hash label so future runs can recognize the same
// evidence set even after the ticket has been closed. The hash is the
// dedup key for the audit's "can cycle on identical signals" complaint.
export const AGENT_IMPROVEMENT_CAUSE_LABEL_PREFIX = 'agent-improvement:cause:';
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
    // H12 audit (2026-05-07): backfill from the run event. Older events
    // emitted before H12 simply report 0 dedup, which is the truthful
    // pre-fix state — no rewrite of historical telemetry.
    dedupedCauseCount: numberFromPayload(payload, 'dedupedCauseCount', 0),
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

function signalLabels(signalKind: AgentImprovementSignalKind, causeHash: string): string[] {
  return unique([
    AGENT_IMPROVEMENT_LABEL,
    AGENT_SELF_IMPROVEMENT_LABEL,
    AGENT_IMPROVEMENT_AUTO_LABEL,
    signalLabel(signalKind),
    `${AGENT_IMPROVEMENT_CAUSE_LABEL_PREFIX}${causeHash}`,
  ]);
}

// H12 audit (2026-05-07): deterministic 8-char hex hash over the sorted
// sourceRefs of a candidate signal. Stable across runs, order-independent,
// collision-tolerant for the small per-company evidence sets we emit
// (typically 4-50 refs). djb2-XOR is fast, dependency-free, and the 32-bit
// output is plenty for an in-process dedup key (the audit failure mode is
// "exact same evidence set re-fires", not "two different sets collide").
function hashSourceRefs(refs: readonly string[]): string {
  const sorted = [...refs].sort();
  const joined = sorted.join('\x1f');
  let hash = 5381;
  for (let i = 0; i < joined.length; i += 1) {
    hash = ((hash << 5) + hash) ^ joined.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// H12 audit (2026-05-07): collect every cause hash already attached to ANY
// improvement ticket (open + closed). The closed-ticket case is the entire
// reason this dedup exists — the audit's complaint is that closing a stale
// improvement ticket lets the next run re-open it on the same evidence.
function collectSeenCauseHashes(tickets: readonly TicketRowLike[]): Set<string> {
  const seen = new Set<string>();
  for (const ticket of tickets) {
    if (!hasLabel(ticket, AGENT_IMPROVEMENT_LABEL)) continue;
    for (const label of parseLabels(ticket.labelsJson)) {
      if (label.startsWith(AGENT_IMPROVEMENT_CAUSE_LABEL_PREFIX)) {
        seen.add(label.slice(AGENT_IMPROVEMENT_CAUSE_LABEL_PREFIX.length));
      }
    }
  }
  return seen;
}

// H12 audit (2026-05-07): build the set of ticket / thread ids that belong
// to improvement work itself, so events caused by improvement work can be
// excluded from candidate-signal generation. This breaks the audit's
// "recursion-via-database" — a failing improvement ticket no longer spawns
// another improvement ticket about its own failure.
interface ImprovementScope {
  ticketIds: ReadonlySet<string>;
  threadIds: ReadonlySet<string>;
}

function collectImprovementScope(tickets: readonly TicketRowLike[]): ImprovementScope {
  const ticketIds = new Set<string>();
  const threadIds = new Set<string>();
  for (const ticket of tickets) {
    if (!hasLabel(ticket, AGENT_IMPROVEMENT_LABEL)) continue;
    ticketIds.add(ticket.id);
    if (ticket.threadId) threadIds.add(ticket.threadId);
  }
  return { ticketIds, threadIds };
}

function isSelfCausedEvent(event: EventRowLike, scope: ImprovementScope): boolean {
  if (scope.ticketIds.size === 0 && scope.threadIds.size === 0) return false;
  const payload = parsePayload(event);
  const ticketId = typeof payload.ticketId === 'string' ? payload.ticketId : null;
  if (ticketId && scope.ticketIds.has(ticketId)) return true;
  const threadId = typeof payload.threadId === 'string' ? payload.threadId : null;
  if (threadId && scope.threadIds.has(threadId)) return true;
  return false;
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
  causeHash: string;
  existingTicketId: string | null;
  createdTicketId: string | null;
}): AgentImprovementRecommendation {
  const labels = signalLabels(args.signalKind, args.causeHash);
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
  improvementScope: ImprovementScope;
}): Array<{
  signalKind: AgentImprovementSignalKind;
  sourceCount: number;
  sourceRefs: string[];
}> {
  const operationalTickets = args.tickets.filter(
    (ticket) => !hasLabel(ticket, AGENT_IMPROVEMENT_LABEL),
  );
  // H12 audit (2026-05-07): exclude failure events caused by improvement
  // work itself. Without this filter, a failing improvement ticket spawns
  // another improvement ticket about its own failure — recursion-via-DB.
  const operationalEvents = args.events.filter(
    (event) => !isSelfCausedEvent(event, args.improvementScope),
  );
  const workFailures = operationalEvents.filter((event) => event.eventType === 'work.failed');
  const runtimeFailures = operationalEvents.filter(
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
        // H12 audit (2026-05-07): surface the dedup metric so the dashboard
        // can show "N signals were suppressed by causation-chain dedup" —
        // gives the operator visibility into how often the loop would have
        // cycled on identical evidence without the fix.
        dedupedCauseCount: result.dedupedCauseHashes.length,
        dedupedCauseHashes: result.dedupedCauseHashes,
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
      // H12 audit (2026-05-07): the two pillars of the fix —
      //   1. `improvementScope` lets buildCandidateSignals exclude failure
      //      events whose ticketId/threadId originated on improvement work,
      //      breaking the recursion-via-DB chain.
      //   2. `seenCauseHashes` is the persistent dedup register keyed by
      //      a deterministic hash of sorted sourceRefs. Hits skip both the
      //      recommendation AND the ticket write so an identical signal
      //      cannot cycle on the same evidence after a prior ticket closed.
      const improvementScope = collectImprovementScope(tickets);
      const seenCauseHashes = collectSeenCauseHashes(tickets);
      const candidateSignals = buildCandidateSignals({
        events,
        tickets,
        now: ranAt,
        improvementScope,
      });
      const createdTicketIds: string[] = [];
      const skippedExistingTicketIds: string[] = [];
      const dedupedCauseHashes: string[] = [];
      const recommendations: AgentImprovementRecommendation[] = [];

      for (const signal of candidateSignals) {
        const causeHash = hashSourceRefs(signal.sourceRefs);

        const existing = findExistingSignalTicket(tickets, signal.signalKind);
        if (existing) {
          skippedExistingTicketIds.push(existing.id);
          recommendations.push(
            buildRecommendation({
              ...signal,
              causeHash,
              existingTicketId: existing.id,
              createdTicketId: null,
            }),
          );
          continue;
        }

        // H12 audit (2026-05-07): identical evidence was already turned into
        // an improvement ticket in a prior run. The prior ticket may now be
        // closed, but we refuse to re-open the same signal — that's the
        // exact cycle the audit flagged. The run still surfaces the dedup
        // count so operators can see it happened.
        if (seenCauseHashes.has(causeHash)) {
          dedupedCauseHashes.push(causeHash);
          continue;
        }

        if (input.dryRun) {
          recommendations.push(
            buildRecommendation({
              ...signal,
              causeHash,
              existingTicketId: null,
              createdTicketId: null,
            }),
          );
          continue;
        }

        const recommendation = buildRecommendation({
          ...signal,
          causeHash,
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
        // Mark this hash as seen for the rest of this run so a duplicate
        // signal within the same run also dedups (defense-in-depth — the
        // candidate list shouldn't produce duplicates today, but if a future
        // signal kind is added that overlaps, we'd rather dedup than write).
        seenCauseHashes.add(causeHash);
        recommendations.push({ ...recommendation, createdTicketId: ticketId });
      }

      const result: AgentImprovementRunResult = {
        companyId: input.companyId,
        ranAt,
        inspectedEventCount: events.length,
        inspectedTicketCount: tickets.length,
        recommendations,
        createdTicketIds,
        skippedExistingTicketIds: unique(skippedExistingTicketIds),
        dedupedCauseHashes: unique(dedupedCauseHashes),
      };

      emitRunEvent(deps, reporterId, result);
      return result;
    },
  };
}
