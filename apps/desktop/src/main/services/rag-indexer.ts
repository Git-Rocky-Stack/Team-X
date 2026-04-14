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

export interface RagIndexerBus {
  subscribe(listener: (event: DashboardEvent) => void): () => void;
}

export interface RagIndexerDeps {
  bus: RagIndexerBus;
  service: Pick<RagService, 'indexSource' | 'retrieve' | 'deleteBySource'>;
  getMessage(id: string): { id: string; content: string; threadId: string } | null;
  getCompanyIdForThread(threadId: string): string | null;
  getMeetingMinutes?: (id: string) => { id: string; minutesText: string } | null;
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
  companyId: string;
  sourceType: EmbeddingSourceType;
  sourceId: string;
  content: string;
}

function toIndexJob(event: DashboardEvent, deps: RagIndexerDeps): IndexJob | null {
  if (event.type === 'work.completed') {
    const payload = event.payload as { messageId?: string; threadId?: string } | null;
    if (!payload?.messageId || !payload.threadId) return null;
    const msg = deps.getMessage(payload.messageId);
    if (!msg || !msg.content.trim()) return null;
    const companyId = event.companyId ?? deps.getCompanyIdForThread(payload.threadId);
    if (!companyId) return null;
    return { companyId, sourceType: 'message', sourceId: msg.id, content: msg.content };
  }

  if (event.type === 'meeting.ended' && deps.getMeetingMinutes) {
    const payload = event.payload as { meetingId?: string } | null;
    if (!payload?.meetingId) return null;
    const minutes = deps.getMeetingMinutes(payload.meetingId);
    if (!minutes || !minutes.minutesText.trim()) return null;
    return {
      companyId: event.companyId,
      sourceType: 'meeting_minutes',
      sourceId: minutes.id,
      content: minutes.minutesText,
    };
  }

  return null;
}
