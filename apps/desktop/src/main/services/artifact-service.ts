import type { ArtifactRecord } from '@team-x/shared-types';

import type { ArtifactRow, ArtifactsRepo } from '../db/repos/artifacts.js';

export interface ListArtifactsInput {
  companyId: string;
  limit?: number;
}

export interface RecordRoutineTicketArtifactInput {
  companyId: string;
  routineId: string;
  runId: string;
  ticketId: string;
  title: string;
  summary?: string | null;
  assigneeId?: string | null;
  createdAt: number;
}

export interface RecordApprovalOutcomeArtifactInput {
  companyId: string;
  approvalItemId: string;
  approvalDecisionId: string;
  decision: 'approved' | 'denied' | 'dismissed';
  subjectRefKind: string;
  subjectRefId: string;
  summary: string;
  rationale?: string | null;
  approvedByOperatorId?: string | null;
  createdAt: number;
}

export interface RecordVaultFileArtifactInput {
  companyId: string;
  fileId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  uploadedBy: string;
  createdAt: number;
}

function parsePreviewJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through.
  }
  return null;
}

function rowToArtifact(row: ArtifactRow): ArtifactRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    kind: row.kind as ArtifactRecord['kind'],
    outcomeKind: row.outcomeKind as ArtifactRecord['outcomeKind'],
    status: row.status as ArtifactRecord['status'],
    title: row.title,
    summary: row.summary,
    sourceKind: row.sourceKind as ArtifactRecord['sourceKind'],
    sourceRefId: row.sourceRefId,
    ticketId: row.ticketId,
    fileId: row.fileId,
    approvalItemId: row.approvalItemId,
    approvalDecisionId: row.approvalDecisionId,
    uri: row.uri,
    preview: parsePreviewJson(row.previewJson),
    createdByEmployeeId: row.createdByEmployeeId,
    createdByRoutineId: row.createdByRoutineId,
    approvedByOperatorId: row.approvedByOperatorId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createArtifactService({ artifactsRepo }: { artifactsRepo: ArtifactsRepo }) {
  return {
    list(input: ListArtifactsInput): ArtifactRecord[] {
      return artifactsRepo.listByCompany(input).map(rowToArtifact);
    },

    recordRoutineTicketArtifact(input: RecordRoutineTicketArtifactInput): ArtifactRecord {
      const artifactId = artifactsRepo.create({
        companyId: input.companyId,
        kind: 'ticket-output',
        outcomeKind: 'artifact-created',
        title: input.title,
        summary: input.summary ?? `Routine run created ticket ${input.ticketId}.`,
        sourceKind: 'routine-run',
        sourceRefId: input.runId,
        ticketId: input.ticketId,
        uri: `ticket:${input.ticketId}`,
        previewJson: JSON.stringify({
          ticketId: input.ticketId,
          routineId: input.routineId,
          runId: input.runId,
          assigneeId: input.assigneeId ?? null,
        }),
        createdByEmployeeId: input.assigneeId ?? null,
        createdByRoutineId: input.routineId,
        createdAt: input.createdAt,
      });
      const artifact = artifactsRepo.getById(artifactId);
      if (!artifact) {
        throw new Error(`[artifact-service] failed to read created artifact ${artifactId}`);
      }
      return rowToArtifact(artifact);
    },

    recordApprovalOutcomeArtifact(input: RecordApprovalOutcomeArtifactInput): ArtifactRecord {
      const artifactId = artifactsRepo.create({
        companyId: input.companyId,
        kind: 'approval-record',
        outcomeKind: 'approval-complete',
        title: input.summary,
        summary: input.rationale?.trim().length
          ? input.rationale.trim()
          : `Approval ${input.decision}.`,
        sourceKind: 'approval-decision',
        sourceRefId: input.approvalDecisionId,
        approvalItemId: input.approvalItemId,
        approvalDecisionId: input.approvalDecisionId,
        uri: `approval:${input.approvalItemId}`,
        previewJson: JSON.stringify({
          decision: input.decision,
          subjectRefKind: input.subjectRefKind,
          subjectRefId: input.subjectRefId,
          rationale: input.rationale ?? null,
        }),
        approvedByOperatorId: input.approvedByOperatorId ?? null,
        createdAt: input.createdAt,
      });
      const artifact = artifactsRepo.getById(artifactId);
      if (!artifact) {
        throw new Error(`[artifact-service] failed to read created artifact ${artifactId}`);
      }
      return rowToArtifact(artifact);
    },

    recordVaultFileArtifact(input: RecordVaultFileArtifactInput): ArtifactRecord {
      const artifactId = artifactsRepo.create({
        companyId: input.companyId,
        kind: 'vault-file',
        outcomeKind: 'artifact-created',
        title: input.originalName,
        summary: `${input.mimeType} • ${input.sizeBytes} bytes`,
        sourceKind: 'vault-file',
        sourceRefId: input.fileId,
        fileId: input.fileId,
        uri: `vault:${input.fileId}`,
        previewJson: JSON.stringify({
          originalName: input.originalName,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          sha256: input.sha256,
        }),
        createdByEmployeeId: null,
        createdAt: input.createdAt,
      });
      const artifact = artifactsRepo.getById(artifactId);
      if (!artifact) {
        throw new Error(`[artifact-service] failed to read created artifact ${artifactId}`);
      }
      return rowToArtifact(artifact);
    },
  };
}

export type ArtifactService = ReturnType<typeof createArtifactService>;
