/**
 * RagIndexer — subscribes to the event bus and indexes new content
 * into the embeddings table on write. One subscriber, one dispatch
 * table, one shared service call.
 *
 * Invariant #6 (events append-only): never mutates the events table.
 * Invariant #7 (zero phone-home): never makes network calls beyond
 * the configured embedding provider.
 *
 * Phase 5 — M29.
 */

import type { RagService } from '@team-x/intelligence';
import type { DashboardEvent, EmbeddingSourceType } from '@team-x/shared-types';

import {
  type RagGoalSource,
  type RagProjectSource,
  type RagTicketSource,
  type RagVaultFileSource,
  formatGoalEmbeddingContent,
  formatProjectEmbeddingContent,
  formatTicketEmbeddingContent,
  formatVaultFileEmbeddingContent,
} from './rag-source-content.js';

export interface RagIndexerBus {
  subscribe(listener: (event: DashboardEvent) => void): () => void;
}

export interface RagIndexerDeps {
  bus: RagIndexerBus;
  service: Pick<RagService, 'indexSource' | 'retrieve' | 'deleteBySource'>;
  getMessage(id: string): { id: string; content: string; threadId: string } | null;
  getCompanyIdForThread(threadId: string): string | null;
  getMeetingMinutes?: (id: string) => { id: string; minutesText: string } | null;
  getTicket?: (id: string) => RagTicketSource | null;
  getGoal?: (id: string) => RagGoalSource | null;
  getProject?: (id: string) => RagProjectSource | null;
  getVaultFile?: (id: string) => RagVaultFileSource | null;
  isEnabled: () => boolean;
  logger?: {
    info?: (msg: string, ...args: unknown[]) => void;
    error: (msg: string, err: unknown) => void;
  };
}

export interface RagIndexer {
  start(): void;
  stop(): void;
}

export function createRagIndexer(deps: RagIndexerDeps): RagIndexer {
  let unsubscribe: (() => void) | null = null;
  const logger = deps.logger ?? { error: (m, e) => console.error('[rag-indexer]', m, e) };

  const handle = (event: DashboardEvent): void => {
    if (!deps.isEnabled()) return;

    void (async () => {
      try {
        const job = toIndexJob(event, deps);
        if (!job) return;
        if (job.kind === 'delete') {
          deps.service.deleteBySource(job.sourceId);
          return;
        }
        await deps.service.indexSource(job);
      } catch (err) {
        logger.error('indexSource failed', err);
      }
    })();
  };

  return {
    start(): void {
      if (unsubscribe) return;
      unsubscribe = deps.bus.subscribe(handle);
    },
    stop(): void {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },
  };
}

interface IndexJob {
  kind: 'upsert';
  companyId: string;
  sourceType: EmbeddingSourceType;
  sourceId: string;
  content: string;
}

interface DeleteJob {
  kind: 'delete';
  sourceId: string;
}

type RagJob = IndexJob | DeleteJob;

function toIndexJob(event: DashboardEvent, deps: RagIndexerDeps): RagJob | null {
  if (event.type === 'work.completed') {
    const payload = event.payload as { messageId?: string; threadId?: string } | null;
    if (!payload?.messageId || !payload.threadId) return null;
    const msg = deps.getMessage(payload.messageId);
    if (!msg || !msg.content.trim()) return null;
    const companyId = event.companyId ?? deps.getCompanyIdForThread(payload.threadId);
    if (!companyId) return null;
    return {
      kind: 'upsert',
      companyId,
      sourceType: 'message',
      sourceId: msg.id,
      content: msg.content,
    };
  }

  if (event.type === 'meeting.ended' && deps.getMeetingMinutes) {
    const payload = event.payload as { meetingId?: string } | null;
    if (!payload?.meetingId) return null;
    const minutes = deps.getMeetingMinutes(payload.meetingId);
    if (!minutes || !minutes.minutesText.trim()) return null;
    return {
      kind: 'upsert',
      companyId: event.companyId,
      sourceType: 'meeting_minutes',
      sourceId: minutes.id,
      content: minutes.minutesText,
    };
  }

  if (
    (event.type === 'ticket.created' ||
      event.type === 'ticket.updated' ||
      event.type === 'ticket.assigned' ||
      event.type === 'ticket.closed' ||
      event.type === 'ticket.reopened') &&
    deps.getTicket
  ) {
    const payload = event.payload as { ticketId?: string } | null;
    if (!payload?.ticketId) return null;
    const ticket = deps.getTicket(payload.ticketId);
    if (!ticket) return null;
    const content = formatTicketEmbeddingContent(ticket);
    if (!content.trim()) return null;
    return {
      kind: 'upsert',
      companyId: event.companyId,
      sourceType: 'ticket',
      sourceId: ticket.id,
      content,
    };
  }

  if ((event.type === 'goal.created' || event.type === 'goal.updated') && deps.getGoal) {
    const payload = event.payload as { goalId?: string } | null;
    if (!payload?.goalId) return null;
    const goal = deps.getGoal(payload.goalId);
    if (!goal) return null;
    const content = formatGoalEmbeddingContent(goal);
    if (!content.trim()) return null;
    return {
      kind: 'upsert',
      companyId: event.companyId,
      sourceType: 'goal',
      sourceId: goal.id,
      content,
    };
  }

  if (event.type === 'goal.deleted') {
    const payload = event.payload as { goalId?: string } | null;
    return payload?.goalId ? { kind: 'delete', sourceId: payload.goalId } : null;
  }

  if ((event.type === 'project.created' || event.type === 'project.updated') && deps.getProject) {
    const payload = event.payload as { projectId?: string } | null;
    if (!payload?.projectId) return null;
    const project = deps.getProject(payload.projectId);
    if (!project) return null;
    const content = formatProjectEmbeddingContent(project);
    if (!content.trim()) return null;
    return {
      kind: 'upsert',
      companyId: event.companyId,
      sourceType: 'project',
      sourceId: project.id,
      content,
    };
  }

  if (event.type === 'project.deleted') {
    const payload = event.payload as { projectId?: string } | null;
    return payload?.projectId ? { kind: 'delete', sourceId: payload.projectId } : null;
  }

  if (event.type === 'vault.file_created' && deps.getVaultFile) {
    const payload = event.payload as { fileId?: string } | null;
    if (!payload?.fileId) return null;
    const file = deps.getVaultFile(payload.fileId);
    if (!file) return null;
    const content = formatVaultFileEmbeddingContent(file);
    if (!content.trim()) return null;
    return {
      kind: 'upsert',
      companyId: event.companyId,
      sourceType: 'vault_file',
      sourceId: file.id,
      content,
    };
  }

  if (event.type === 'vault.file_deleted') {
    const payload = event.payload as { fileId?: string } | null;
    return payload?.fileId ? { kind: 'delete', sourceId: payload.fileId } : null;
  }

  return null;
}
