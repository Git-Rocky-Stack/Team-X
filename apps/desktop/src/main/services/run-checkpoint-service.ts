import type {
  RunCheckpoint,
  RunCheckpointBlocker,
  RunCheckpointKind,
  RunCheckpointResumeOrigin,
} from '@team-x/shared-types';

import type { RunCheckpointRow, RunCheckpointsRepo } from '../db/repos/run-checkpoints.js';

export const AUTOMATIC_RUN_CHECKPOINT_KINDS: RunCheckpointKind[] = [
  'completion',
  'stopped',
  'timeout',
  'approval-blocked',
  'budget-blocked',
  'routine-completed',
];

export interface CreateRunCheckpointInput {
  companyId: string;
  threadId: string;
  runId?: string | null;
  employeeId?: string | null;
  checkpointKind: RunCheckpointKind;
  objective?: string | null;
  progressSummary: string;
  blockers?: RunCheckpointBlocker[];
  nextAction?: string | null;
  activeArtifactRefs?: string[];
  unresolvedApprovalRefs?: string[];
  resumeOrigin?: RunCheckpointResumeOrigin | null;
  createdAt?: number;
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
    }
  } catch {
    // Fall through.
  }
  return [];
}

function parseBlockersJson(raw: string): RunCheckpointBlocker[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
          const record = item as Record<string, unknown>;
          return {
            kind:
              typeof record.kind === 'string' && record.kind.length > 0
                ? (record.kind as RunCheckpointBlocker['kind'])
                : 'other',
            refId:
              typeof record.refId === 'string' && record.refId.length > 0 ? record.refId : null,
            summary:
              typeof record.summary === 'string' && record.summary.trim().length > 0
                ? record.summary.trim()
                : 'Blocked',
          };
        });
    }
  } catch {
    // Fall through.
  }
  return [];
}

function parseResumeOriginJson(raw: string | null): RunCheckpointResumeOrigin | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    const checkpointId =
      typeof record.checkpointId === 'string' && record.checkpointId.trim().length > 0
        ? record.checkpointId.trim()
        : null;
    const checkpointKind =
      typeof record.checkpointKind === 'string' &&
      ['stopped', 'timeout', 'approval-blocked', 'budget-blocked'].includes(record.checkpointKind)
        ? (record.checkpointKind as RunCheckpointResumeOrigin['checkpointKind'])
        : null;
    if (!checkpointId || !checkpointKind) return null;
    return {
      checkpointId,
      checkpointKind,
      createdAt: typeof record.createdAt === 'number' ? record.createdAt : null,
    };
  } catch {
    return null;
  }
}

function rowToCheckpoint(row: RunCheckpointRow): RunCheckpoint {
  return {
    id: row.id,
    companyId: row.companyId,
    threadId: row.threadId,
    runId: row.runId,
    employeeId: row.employeeId,
    checkpointKind: row.checkpointKind as RunCheckpointKind,
    objective: row.objective,
    progressSummary: row.progressSummary,
    blockers: parseBlockersJson(row.blockersJson),
    nextAction: row.nextAction,
    activeArtifactRefs: parseJsonArray(row.activeArtifactRefsJson),
    unresolvedApprovalRefs: parseJsonArray(row.unresolvedApprovalRefsJson),
    resumeOrigin: parseResumeOriginJson(row.resumeOriginJson),
    createdAt: row.createdAt,
  };
}

export function createRunCheckpointService({
  runCheckpointsRepo,
}: {
  runCheckpointsRepo: RunCheckpointsRepo;
}) {
  return {
    isAutomaticCheckpointKind(kind: RunCheckpointKind): boolean {
      return AUTOMATIC_RUN_CHECKPOINT_KINDS.includes(kind);
    },

    getLatest(input: { companyId: string; threadId: string }): RunCheckpoint | null {
      const row = runCheckpointsRepo.getLatestByCompanyThread(input.companyId, input.threadId);
      return row ? rowToCheckpoint(row) : null;
    },

    listByThread(input: { companyId: string; threadId: string; limit?: number }): RunCheckpoint[] {
      return runCheckpointsRepo
        .listByCompanyThread(input.companyId, input.threadId, input.limit ?? 10)
        .map(rowToCheckpoint);
    },

    createCheckpoint(input: CreateRunCheckpointInput): RunCheckpoint {
      const progressSummary = input.progressSummary.trim();
      if (progressSummary.length === 0) {
        throw new Error('[run-checkpoint-service] progressSummary is required');
      }
      const checkpointId = runCheckpointsRepo.create({
        companyId: input.companyId,
        threadId: input.threadId,
        runId: input.runId ?? null,
        employeeId: input.employeeId ?? null,
        checkpointKind: input.checkpointKind,
        objective: input.objective?.trim() || null,
        progressSummary,
        blockersJson: JSON.stringify(input.blockers ?? []),
        nextAction: input.nextAction?.trim() || null,
        activeArtifactRefsJson: JSON.stringify(input.activeArtifactRefs ?? []),
        unresolvedApprovalRefsJson: JSON.stringify(input.unresolvedApprovalRefs ?? []),
        resumeOriginJson: input.resumeOrigin ? JSON.stringify(input.resumeOrigin) : null,
        createdAt: input.createdAt,
      });
      const checkpointRow = runCheckpointsRepo.getById(checkpointId);
      const checkpoint = checkpointRow ? rowToCheckpoint(checkpointRow) : null;
      if (!checkpoint) {
        throw new Error('[run-checkpoint-service] checkpoint insert did not round-trip');
      }
      return checkpoint;
    },
  };
}

export type RunCheckpointService = ReturnType<typeof createRunCheckpointService>;
