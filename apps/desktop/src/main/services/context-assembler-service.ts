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
import type { RetrievalConfig, RetrievalEvidencePack, RetrievalRecentMessage } from './retrieval-orchestrator.js';
import { formatEvidenceLine } from './retrieval-orchestrator.js';

import type { CompanyRow } from '../db/repos/companies.js';
import type { GoalRow } from '../db/repos/goals.js';
import type { MessageRow } from '../db/repos/messages.js';
import type { ProjectRow } from '../db/repos/projects.js';
import type { TicketRow } from '../db/repos/tickets.js';
import type { ThreadRow } from '../db/repos/threads.js';

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
      return parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
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

function formatProjectBlock(project: ProjectRow): string {
  const lines = [
    `Title: ${project.title}`,
    `Status: ${project.status}`,
    `Priority: ${project.priority}`,
  ];
  if (project.leadId) lines.push(`Lead: ${project.leadId}`);
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
  const lines = [
    `Routine: ${run.routineId}`,
    `Status: ${run.status}`,
    `Reason: ${run.reason}`,
  ];
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
    async assembleThreadContext(input: AssembleThreadContextInput): Promise<AssembledThreadContext> {
      const company = companiesRepo.getById(input.companyId);
      if (!company) {
        throw new Error(`[context-assembler] company not found: ${input.companyId}`);
      }
      const thread = threadsRepo.getById(input.threadId);
      if (!thread || thread.companyId !== input.companyId) {
        throw new Error(`[context-assembler] thread ${input.threadId} does not belong to company ${input.companyId}`);
      }

      const allTurns = messagesRepo.listByThread(input.threadId).filter(shouldIncludeTurn);
      const recentTurns = allTurns
        .slice(-(input.recentTurnLimit ?? DEFAULT_CONTEXT_RECENT_TURN_LIMIT))
        .map((row) => toTurn(row, countTokens));

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

      const ticket = thread.ticketId ? ticketsRepo.getById(thread.ticketId) : ticketsRepo.getByThreadId(thread.id);
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

      const relatedProjects = ticket
        ? projectsRepo
            .listByCompany(input.companyId)
            .filter((project) => projectsRepo.listTickets(project.id).includes(ticket.id))
            .slice(0, 2)
        : [];

      for (const project of relatedProjects) {
        pushBlock(blocks, countTokens, {
          id: `project:${project.id}`,
          kind: 'project',
          priority: 'high',
          title: `Project ${project.title}`,
          body: formatProjectBlock(project),
          sourceRefId: project.id,
          sourceLabel: project.status,
          metadata: {
            goalId: project.goalId,
            leadId: project.leadId,
          },
        });
      }

      const relatedGoals = dedupeRowsById(
        relatedProjects
          .map((project) => (project.goalId ? goalsRepo.getById(project.goalId) : null))
          .filter((goal): goal is GoalRow => goal !== null),
      ).slice(0, 2);

      for (const goal of relatedGoals) {
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

      const pendingApprovals = approvalInboxService?.listItems({
        companyId: input.companyId,
        status: 'pending',
      }) ?? [];
      const relevantApprovalIds = new Set(checkpoint?.unresolvedApprovalRefs ?? []);
      const relevantApprovals = pendingApprovals
        .filter((item) => {
          if (relevantApprovalIds.has(item.id)) return true;
          if (ticket && item.subjectRefId === ticket.id) return true;
          if (relatedProjects.some((project) => project.id === item.subjectRefId)) return true;
          if (relatedGoals.some((goal) => goal.id === item.subjectRefId)) return true;
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

      const recentRoutineRuns = routineService?.listRuns({
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

      const recentArtifacts = artifactService?.list({
        companyId: input.companyId,
        limit: 20,
      }) ?? [];
      const relevantArtifactIds = new Set(checkpoint?.activeArtifactRefs ?? []);
      const relevantArtifacts = recentArtifacts
        .filter((artifact) => {
          if (ticket && artifact.ticketId === ticket.id) return true;
          if (approvalsToInclude.some((approval) => artifact.approvalItemId === approval.id)) return true;
          if (relevantArtifactIds.has(artifact.id)) return true;
          return false;
        })
        .slice(0, 3);
      const artifactsToInclude = relevantArtifacts.length > 0 ? relevantArtifacts : recentArtifacts.slice(0, 1);

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
          .filter((turn) => turn.role === 'user' && turn.messageId)
          .slice(-2)
          .map((turn) => ({
            id: turn.messageId!,
            content: turn.content,
            sourceId: turn.messageId!,
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
