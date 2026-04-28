import type {
  ApprovalItem,
  ArtifactRecord,
  AssembledContextBlock,
  AssembledThreadContext,
  CompanySettings,
  ContextBlockPriority,
  ContextTurn,
  RoutineRun,
  RunCheckpoint,
  ThreadDigest,
} from '@team-x/shared-types';
import type {
  RetrievalConfig,
  RetrievalEvidencePack,
  RetrievalRecentMessage,
} from './retrieval-orchestrator.js';
import { formatEvidenceLine } from './retrieval-orchestrator.js';

import type { CompanyRow } from '../db/repos/companies.js';
import type { GoalRow } from '../db/repos/goals.js';
import type { MessageRow } from '../db/repos/messages.js';
import type { ProjectRow } from '../db/repos/projects.js';
import type { ThreadRow } from '../db/repos/threads.js';
import type { TicketRow } from '../db/repos/tickets.js';

export const DEFAULT_CONTEXT_RECENT_TURN_LIMIT = 12;

const PROVIDER_EMPTY_ASSISTANT_TEXT =
  "I couldn't complete that reply. Provider returned no assistant text.";

const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  topK: 4,
  threshold: 0.3,
  maxTokens: 600,
  maxQueries: 3,
  maxPerSourceType: 2,
};

function defaultCountTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function parseCompanySettings(raw: string): CompanySettings | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as CompanySettings;
    }
  } catch {
    // Fall through.
  }
  return null;
}

function parseStringArray(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(raw ?? '[]');
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      );
    }
  } catch {
    // Fall through.
  }
  return [];
}

function authorKindToRole(row: MessageRow): ContextTurn['role'] {
  if (row.authorKind === 'employee') return 'assistant';
  if (row.authorKind === 'system') return 'system';
  return 'user';
}

function shouldIncludeTurn(row: MessageRow): boolean {
  const trimmed = row.content.trim();
  if (trimmed.length === 0) return false;
  if (row.authorKind !== 'user' && trimmed === PROVIDER_EMPTY_ASSISTANT_TEXT) {
    return false;
  }
  return true;
}

function formatCompanyBlock(company: CompanyRow): string {
  const settings = parseCompanySettings(company.settingsJson);
  const lines = [`Name: ${company.name}`, `Status: ${company.status}`];
  if (settings?.mission) lines.push(`Mission: ${String(settings.mission)}`);
  return lines.join('\n');
}

function formatTicketBlock(ticket: TicketRow): string {
  const lines = [
    `Title: ${ticket.title}`,
    `Status: ${ticket.status}`,
    `Priority: ${ticket.priority}`,
  ];
  if (ticket.assigneeId) lines.push(`Assignee: ${ticket.assigneeId}`);
  const labels = parseStringArray(ticket.labelsJson);
  if (labels.length > 0) lines.push(`Labels: ${labels.join(', ')}`);
  if (ticket.description.trim().length > 0) {
    lines.push('Description:');
    lines.push(ticket.description.trim());
  }
  return lines.join('\n');
}

function formatTimestamp(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function formatProjectBlock(project: ProjectRow, relationship?: string): string {
  const lines = [
    `Title: ${project.title}`,
    `Status: ${project.status}`,
    `Priority: ${project.priority}`,
  ];
  if (relationship) lines.push(`Relationship: ${relationship}`);
  if (project.leadId) lines.push(`Lead: ${project.leadId}`);
  const targetDate = formatTimestamp(project.targetDate);
  if (targetDate) lines.push(`Target date: ${targetDate}`);
  if (project.description.trim().length > 0) {
    lines.push('Description:');
    lines.push(project.description.trim());
  }
  return lines.join('\n');
}

function formatGoalBlock(goal: GoalRow): string {
  const lines = [
    `Title: ${goal.title}`,
    `Status: ${goal.status}`,
    `Progress: ${goal.progressPct}%`,
  ];
  const targetDate = formatTimestamp(goal.targetDate);
  if (targetDate) lines.push(`Target date: ${targetDate}`);
  if (goal.description.trim().length > 0) {
    lines.push('Description:');
    lines.push(goal.description.trim());
  }
  return lines.join('\n');
}

function formatApprovalBlock(item: ApprovalItem): string {
  const lines = [
    `Summary: ${item.summary}`,
    `Kind: ${item.kind}`,
    `Status: ${item.status}`,
    `Subject: ${item.subjectRefKind} ${item.subjectRefId}`,
  ];
  if (item.latestDecision?.rationale) {
    lines.push(`Latest rationale: ${item.latestDecision.rationale}`);
  }
  return lines.join('\n');
}

function formatRoutineRunBlock(run: RoutineRun): string {
  const lines = [`Routine: ${run.routineId}`, `Status: ${run.status}`, `Reason: ${run.reason}`];
  if (run.ticketId) lines.push(`Ticket: ${run.ticketId}`);
  if (run.message?.trim()) lines.push(`Message: ${run.message.trim()}`);
  if (run.errorMessage?.trim()) lines.push(`Error: ${run.errorMessage.trim()}`);
  return lines.join('\n');
}

function formatArtifactBlock(artifact: ArtifactRecord): string {
  const lines = [
    `Title: ${artifact.title}`,
    `Kind: ${artifact.kind}`,
    `Outcome: ${artifact.outcomeKind}`,
    `Status: ${artifact.status}`,
  ];
  if (artifact.summary?.trim()) lines.push(`Summary: ${artifact.summary.trim()}`);
  if (artifact.uri) lines.push(`URI: ${artifact.uri}`);
  return lines.join('\n');
}

function formatDigestBlock(digest: ThreadDigest): string {
  const lines = [digest.summary.trim()];
  if (digest.pinnedFacts.length > 0) {
    lines.push('');
    lines.push('Pinned facts:');
    for (const fact of digest.pinnedFacts) {
      lines.push(`- ${fact.fact}`);
    }
  }
  return lines.join('\n');
}

function formatCheckpointBlock(checkpoint: RunCheckpoint): string {
  const lines = [checkpoint.progressSummary];
  if (checkpoint.objective?.trim()) lines.unshift(`Objective: ${checkpoint.objective.trim()}`);
  if (checkpoint.blockers.length > 0) {
    lines.push('');
    lines.push('Blockers:');
    for (const blocker of checkpoint.blockers) {
      lines.push(`- ${blocker.kind}: ${blocker.summary}`);
    }
  }
  if (checkpoint.nextAction?.trim()) {
    lines.push('');
    lines.push(`Next action: ${checkpoint.nextAction.trim()}`);
  }
  return lines.join('\n');
}

function toTurn(row: MessageRow, countTokens: (text: string) => number): ContextTurn {
  return {
    messageId: row.id,
    role: authorKindToRole(row),
    authorId: row.authorId,
    authorKind: row.authorKind as ContextTurn['authorKind'],
    content: row.content,
    createdAt: row.createdAt,
    estimatedTokens: countTokens(row.content),
  };
}

function pushBlock(
  blocks: AssembledContextBlock[],
  countTokens: (text: string) => number,
  input: Omit<AssembledContextBlock, 'estimatedTokens'>,
): void {
  const body = input.body.trim();
  if (body.length === 0) return;
  blocks.push({
    ...input,
    body,
    estimatedTokens: countTokens(body) + countTokens(input.title),
  });
}

function checkpointPriority(checkpoint: RunCheckpoint): ContextBlockPriority {
  if (
    checkpoint.checkpointKind === 'approval-blocked' ||
    checkpoint.checkpointKind === 'budget-blocked'
  ) {
    return 'critical';
  }
  return 'high';
}

function dedupeRowsById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const next: T[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    next.push(row);
  }
  return next;
}

const PROJECT_QUERY_TERMS = [
  'project',
  'projects',
  'goal',
  'goals',
  'mrr',
  'revenue',
  'north star',
  'target',
  'targets',
];

const PROJECT_QUERY_STOP_WORDS = new Set([
  'about',
  'area',
  'current',
  'from',
  'into',
  'regarding',
  'review',
  'show',
  'tell',
  'the',
  'this',
  'with',
]);

function shouldIncludeProjectAreaSnapshot(recentUserText: string): boolean {
  const normalized = recentUserText.toLowerCase();
  return PROJECT_QUERY_TERMS.some((term) => normalized.includes(term));
}

function queryTerms(text: string): string[] {
  return Array.from(new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? [])).filter(
    (term) => term.length > 2 && !PROJECT_QUERY_STOP_WORDS.has(term),
  );
}

function scoreAgainstTerms(text: string, terms: readonly string[]): number {
  const normalized = text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (normalized.includes(term)) score += 1;
  }
  return score;
}

function isOpenProject(project: ProjectRow): boolean {
  return !['archived', 'completed'].includes(project.status.toLowerCase());
}

function rankProjectForContext(project: ProjectRow, goal: GoalRow | null, terms: readonly string[]) {
  const searchable = [
    project.title,
    project.description,
    project.status,
    project.priority,
    goal?.title ?? '',
    goal?.description ?? '',
    goal?.status ?? '',
  ].join('\n');
  return scoreAgainstTerms(searchable, terms);
}

function sortProjectsForContext(a: ProjectRow, b: ProjectRow): number {
  const aOpen = isOpenProject(a) ? 1 : 0;
  const bOpen = isOpenProject(b) ? 1 : 0;
  return bOpen - aOpen || b.updatedAt - a.updatedAt || b.createdAt - a.createdAt;
}

function blockPriorityRank(priority: ContextBlockPriority): number {
  switch (priority) {
    case 'critical':
      return 0;
    case 'high':
      return 1;
    case 'medium':
      return 2;
    case 'low':
      return 3;
  }
}

const BLOCK_KIND_ORDER: Record<AssembledContextBlock['kind'], number> = {
  ticket: 0,
  digest: 1,
  checkpoint: 2,
  project: 3,
  goal: 4,
  approval: 5,
  company: 6,
  routine: 7,
  artifact: 8,
  retrieval: 9,
};

export interface AssembleThreadContextInput {
  companyId: string;
  threadId: string;
  employeeId?: string | null;
  recentTurnLimit?: number;
}

export interface ContextAssemblerServiceDeps {
  companiesRepo: {
    getById(id: string): CompanyRow | null;
  };
  threadsRepo: {
    getById(id: string): ThreadRow | null;
  };
  messagesRepo: {
    listByThread(threadId: string): MessageRow[];
  };
  ticketsRepo: {
    getById(id: string): TicketRow | null;
    getByThreadId(threadId: string): TicketRow | null;
  };
  projectsRepo: {
    listByCompany(companyId: string): ProjectRow[];
    listTickets(projectId: string): string[];
  };
  goalsRepo: {
    getById(id: string): GoalRow | null;
    listByCompany?(companyId: string): GoalRow[];
  };
  threadDigestService: {
    getLatest(input: { companyId: string; threadId: string }): ThreadDigest | null;
  };
  runCheckpointService: {
    getLatest(input: { companyId: string; threadId: string }): RunCheckpoint | null;
  };
  approvalInboxService?: {
    listItems(input: { companyId: string; status?: ApprovalItem['status'] }): ApprovalItem[];
  };
  routineService?: {
    listRuns(input: { companyId: string; limit?: number }): RoutineRun[];
  };
  artifactService?: {
    list(input: { companyId: string; limit?: number }): ArtifactRecord[];
  };
  retrieveEvidence?: (input: {
    companyId: string;
    recentMessages: RetrievalRecentMessage[];
    excludeSourceIds: string[];
    config: RetrievalConfig;
    countTokens: (text: string) => number;
  }) => Promise<RetrievalEvidencePack>;
  getRetrievalConfig?: () => RetrievalConfig;
  countTokens?: (text: string) => number;
  now?: () => number;
}

export function createContextAssemblerService(deps: ContextAssemblerServiceDeps) {
  const {
    companiesRepo,
    threadsRepo,
    messagesRepo,
    ticketsRepo,
    projectsRepo,
    goalsRepo,
    threadDigestService,
    runCheckpointService,
    approvalInboxService,
    routineService,
    artifactService,
    retrieveEvidence,
    getRetrievalConfig,
    countTokens = defaultCountTokens,
    now = Date.now,
  } = deps;

  return {
    async assembleThreadContext(
      input: AssembleThreadContextInput,
    ): Promise<AssembledThreadContext> {
      const company = companiesRepo.getById(input.companyId);
      if (!company) {
        throw new Error(`[context-assembler] company not found: ${input.companyId}`);
      }
      const thread = threadsRepo.getById(input.threadId);
      if (!thread || thread.companyId !== input.companyId) {
        throw new Error(
          `[context-assembler] thread ${input.threadId} does not belong to company ${input.companyId}`,
        );
      }

      const allTurns = messagesRepo.listByThread(input.threadId).filter(shouldIncludeTurn);
      const recentTurns = allTurns
        .slice(-(input.recentTurnLimit ?? DEFAULT_CONTEXT_RECENT_TURN_LIMIT))
        .map((row) => toTurn(row, countTokens));
      const recentUserText = recentTurns
        .filter((turn) => turn.role === 'user')
        .map((turn) => turn.content)
        .join('\n');
      const includeProjectAreaSnapshot = shouldIncludeProjectAreaSnapshot(recentUserText);
      const recentProjectQueryTerms = queryTerms(recentUserText);

      const blocks: AssembledContextBlock[] = [];
      const digest = threadDigestService.getLatest({
        companyId: input.companyId,
        threadId: input.threadId,
      });
      if (digest) {
        pushBlock(blocks, countTokens, {
          id: `digest:${digest.id}`,
          kind: 'digest',
          priority: 'high',
          title: 'Thread Digest',
          body: formatDigestBlock(digest),
          sourceRefId: digest.id,
          sourceLabel: digest.threadId,
          metadata: {
            freshness: digest.freshness,
            lastSummarizedMessageId: digest.lastSummarizedMessageId,
          },
        });
      }

      const checkpoint = runCheckpointService.getLatest({
        companyId: input.companyId,
        threadId: input.threadId,
      });
      if (checkpoint) {
        pushBlock(blocks, countTokens, {
          id: `checkpoint:${checkpoint.id}`,
          kind: 'checkpoint',
          priority: checkpointPriority(checkpoint),
          title: 'Latest Checkpoint',
          body: formatCheckpointBlock(checkpoint),
          sourceRefId: checkpoint.id,
          sourceLabel: checkpoint.checkpointKind,
          metadata: {
            checkpointKind: checkpoint.checkpointKind,
            runId: checkpoint.runId,
            employeeId: checkpoint.employeeId,
            createdAt: checkpoint.createdAt,
          },
        });
      }

      pushBlock(blocks, countTokens, {
        id: `company:${company.id}`,
        kind: 'company',
        priority: 'medium',
        title: 'Workspace State',
        body: formatCompanyBlock(company),
        sourceRefId: company.id,
        sourceLabel: company.slug,
        metadata: {
          theme: company.theme,
          status: company.status,
        },
      });

      const ticket = thread.ticketId
        ? ticketsRepo.getById(thread.ticketId)
        : ticketsRepo.getByThreadId(thread.id);
      if (ticket) {
        pushBlock(blocks, countTokens, {
          id: `ticket:${ticket.id}`,
          kind: 'ticket',
          priority: 'critical',
          title: `Ticket ${ticket.id}`,
          body: formatTicketBlock(ticket),
          sourceRefId: ticket.id,
          sourceLabel: ticket.status,
          metadata: {
            priority: ticket.priority,
            assigneeId: ticket.assigneeId,
          },
        });
      }

      const companyProjects = projectsRepo.listByCompany(input.companyId);
      const goalsById = new Map<string, GoalRow | null>();
      const getGoal = (goalId: string | null): GoalRow | null => {
        if (!goalId) return null;
        if (!goalsById.has(goalId)) {
          goalsById.set(goalId, goalsRepo.getById(goalId));
        }
        return goalsById.get(goalId) ?? null;
      };

      const ticketProjectIds = new Set<string>();
      const relatedProjects = ticket
        ? companyProjects
            .filter((project) => {
              const isRelated = projectsRepo.listTickets(project.id).includes(ticket.id);
              if (isRelated) ticketProjectIds.add(project.id);
              return isRelated;
            })
            .slice(0, 2)
        : [];

      const assignedProjects = input.employeeId
        ? companyProjects
            .filter((project) => project.leadId === input.employeeId && isOpenProject(project))
            .sort(sortProjectsForContext)
            .slice(0, 3)
        : [];

      const queryMatchedProjects = includeProjectAreaSnapshot
        ? companyProjects
            .map((project) => ({
              project,
              score: rankProjectForContext(project, getGoal(project.goalId), recentProjectQueryTerms),
            }))
            .filter(({ score, project }) => score > 0 || isOpenProject(project))
            .sort(
              (a, b) =>
                b.score - a.score || sortProjectsForContext(a.project, b.project),
            )
            .map(({ project }) => project)
            .slice(0, 4)
        : [];

      const selectedProjects = dedupeRowsById([
        ...relatedProjects,
        ...assignedProjects,
        ...queryMatchedProjects,
      ]).slice(0, 5);

      for (const project of selectedProjects) {
        const relationshipParts: string[] = [];
        if (ticketProjectIds.has(project.id) && ticket) {
          relationshipParts.push(`linked to current ticket ${ticket.id}`);
        }
        if (input.employeeId && project.leadId === input.employeeId) {
          relationshipParts.push('assigned to current employee as project lead');
        }
        if (includeProjectAreaSnapshot && relationshipParts.length === 0) {
          relationshipParts.push('included from the current Projects area request');
        }
        pushBlock(blocks, countTokens, {
          id: `project:${project.id}`,
          kind: 'project',
          priority: 'high',
          title: `Project ${project.title}`,
          body: formatProjectBlock(project, relationshipParts.join('; ')),
          sourceRefId: project.id,
          sourceLabel: project.status,
          metadata: {
            goalId: project.goalId,
            leadId: project.leadId,
          },
        });
      }

      const relatedGoals = dedupeRowsById(
        selectedProjects
          .map((project) => getGoal(project.goalId))
          .filter((goal): goal is GoalRow => goal !== null),
      );

      const queryMatchedGoals =
        includeProjectAreaSnapshot && goalsRepo.listByCompany
          ? goalsRepo
              .listByCompany(input.companyId)
              .map((goal) => ({
                goal,
                score: scoreAgainstTerms(
                  [goal.title, goal.description, goal.status].join('\n'),
                  recentProjectQueryTerms,
                ),
              }))
              .filter(({ score, goal }) => score > 0 || goal.status === 'active')
              .sort(
                (a, b) =>
                  b.score - a.score || b.goal.updatedAt - a.goal.updatedAt || b.goal.createdAt - a.goal.createdAt,
              )
              .map(({ goal }) => goal)
              .slice(0, 3)
          : [];

      const selectedGoals = dedupeRowsById([...relatedGoals, ...queryMatchedGoals]).slice(0, 4);

      for (const goal of selectedGoals) {
        pushBlock(blocks, countTokens, {
          id: `goal:${goal.id}`,
          kind: 'goal',
          priority: 'medium',
          title: `Goal ${goal.title}`,
          body: formatGoalBlock(goal),
          sourceRefId: goal.id,
          sourceLabel: goal.status,
          metadata: {
            progressPct: goal.progressPct,
          },
        });
      }

      const pendingApprovals =
        approvalInboxService?.listItems({
          companyId: input.companyId,
          status: 'pending',
        }) ?? [];
      const relevantApprovalIds = new Set(checkpoint?.unresolvedApprovalRefs ?? []);
      const relevantApprovals = pendingApprovals
        .filter((item) => {
          if (relevantApprovalIds.has(item.id)) return true;
          if (ticket && item.subjectRefId === ticket.id) return true;
          if (selectedProjects.some((project) => project.id === item.subjectRefId)) return true;
          if (selectedGoals.some((goal) => goal.id === item.subjectRefId)) return true;
          return false;
        })
        .slice(0, 3);
      const approvalsToInclude =
        relevantApprovals.length > 0 ? relevantApprovals : pendingApprovals.slice(0, 1);

      for (const approval of approvalsToInclude) {
        pushBlock(blocks, countTokens, {
          id: `approval:${approval.id}`,
          kind: 'approval',
          priority: 'high',
          title: `Approval ${approval.kind}`,
          body: formatApprovalBlock(approval),
          sourceRefId: approval.id,
          sourceLabel: approval.status,
          metadata: {
            subjectRefKind: approval.subjectRefKind,
            subjectRefId: approval.subjectRefId,
          },
        });
      }

      const recentRoutineRuns =
        routineService?.listRuns({
          companyId: input.companyId,
          limit: 10,
        }) ?? [];
      const relevantRoutineRuns = recentRoutineRuns
        .filter((run) => (ticket ? run.ticketId === ticket.id : false))
        .slice(0, 2);
      for (const run of relevantRoutineRuns) {
        pushBlock(blocks, countTokens, {
          id: `routine:${run.id}`,
          kind: 'routine',
          priority: 'medium',
          title: `Routine Run ${run.routineId}`,
          body: formatRoutineRunBlock(run),
          sourceRefId: run.id,
          sourceLabel: run.status,
          metadata: {
            routineId: run.routineId,
            ticketId: run.ticketId,
          },
        });
      }

      const recentArtifacts =
        artifactService?.list({
          companyId: input.companyId,
          limit: 20,
        }) ?? [];
      const relevantArtifactIds = new Set(checkpoint?.activeArtifactRefs ?? []);
      const relevantArtifacts = recentArtifacts
        .filter((artifact) => {
          if (ticket && artifact.ticketId === ticket.id) return true;
          if (approvalsToInclude.some((approval) => artifact.approvalItemId === approval.id))
            return true;
          if (relevantArtifactIds.has(artifact.id)) return true;
          return false;
        })
        .slice(0, 3);
      const artifactsToInclude =
        relevantArtifacts.length > 0 ? relevantArtifacts : recentArtifacts.slice(0, 1);

      for (const artifact of artifactsToInclude) {
        pushBlock(blocks, countTokens, {
          id: `artifact:${artifact.id}`,
          kind: 'artifact',
          priority: 'low',
          title: `Artifact ${artifact.title}`,
          body: formatArtifactBlock(artifact),
          sourceRefId: artifact.id,
          sourceLabel: artifact.kind,
          metadata: {
            outcomeKind: artifact.outcomeKind,
            status: artifact.status,
          },
        });
      }

      const retrievalQueries: string[] = [];
      if (retrieveEvidence) {
        const recentUserMessages: RetrievalRecentMessage[] = recentTurns
          .filter(
            (turn): turn is (typeof recentTurns)[number] & { messageId: string } =>
              turn.role === 'user' && typeof turn.messageId === 'string',
          )
          .slice(-2)
          .map((turn) => ({
            id: turn.messageId,
            content: turn.content,
            sourceId: turn.messageId,
          }));
        if (recentUserMessages.length > 0) {
          const evidence = await retrieveEvidence({
            companyId: input.companyId,
            recentMessages: recentUserMessages,
            excludeSourceIds: recentUserMessages.map((message) => message.sourceId),
            config: getRetrievalConfig?.() ?? DEFAULT_RETRIEVAL_CONFIG,
            countTokens,
          });
          retrievalQueries.push(...evidence.queries);
          for (const entry of evidence.entries) {
            pushBlock(blocks, countTokens, {
              id: `retrieval:${entry.sourceType}:${entry.sourceId}:${entry.chunkIndex}`,
              kind: 'retrieval',
              priority: 'low',
              title: `Retrieved ${entry.sourceType} ${entry.sourceId}`,
              body: formatEvidenceLine(entry),
              sourceRefId: entry.sourceId,
              sourceLabel: entry.sourceType,
              metadata: {
                chunkIndex: entry.chunkIndex,
                score: entry.score,
                reasons: entry.reasons,
              },
            });
          }
        }
      }

      blocks.sort(
        (a, b) =>
          blockPriorityRank(a.priority) - blockPriorityRank(b.priority) ||
          BLOCK_KIND_ORDER[a.kind] - BLOCK_KIND_ORDER[b.kind] ||
          a.title.localeCompare(b.title),
      );

      return {
        companyId: input.companyId,
        threadId: input.threadId,
        generatedAt: now(),
        recentTurns,
        blocks,
        retrievalQueries,
      };
    },
  };
}

export type ContextAssemblerService = ReturnType<typeof createContextAssemblerService>;
