import type { RagService } from '@team-x/intelligence';

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

export interface RagRebuildDeps {
  companyId: string;
  service: Pick<RagService, 'indexSource'>;
  threadsRepo: {
    listByCompany(companyId: string): Array<{ id: string }>;
  };
  messagesRepo: {
    listByThread(threadId: string): Array<{ id: string; content: string }>;
  };
  meetingsRepo: {
    listByCompany(companyId: string): Array<{ id: string; minutesMd: string | null }>;
  };
  ticketsRepo: {
    listByCompany(companyId: string): RagTicketSource[];
  };
  goalsRepo: {
    listByCompany(companyId: string): RagGoalSource[];
  };
  projectsRepo: {
    listByCompany(companyId: string): RagProjectSource[];
  };
  vaultRepo: {
    listByCompany(companyId: string): RagVaultFileSource[];
  };
  logger?: {
    error(msg: string, err: unknown): void;
    warn?(msg: string): void;
  };
}

export interface RagRebuildResult {
  scheduled: number;
  failed: number;
}

export async function rebuildCompanyRagSources(deps: RagRebuildDeps): Promise<RagRebuildResult> {
  let scheduled = 0;
  let failed = 0;

  async function tryIndex(
    sourceType: Parameters<RagService['indexSource']>[0]['sourceType'],
    sourceId: string,
    content: string,
  ): Promise<void> {
    if (!content.trim()) return;
    try {
      await deps.service.indexSource({
        companyId: deps.companyId,
        sourceType,
        sourceId,
        content,
      });
      scheduled++;
    } catch (err) {
      failed++;
      deps.logger?.error?.(`[rag] rebuild: indexSource failed for ${sourceType} ${sourceId}:`, err);
    }
  }

  for (const thread of deps.threadsRepo.listByCompany(deps.companyId)) {
    for (const message of deps.messagesRepo.listByThread(thread.id)) {
      await tryIndex('message', message.id, message.content);
    }
  }

  for (const meeting of deps.meetingsRepo.listByCompany(deps.companyId)) {
    await tryIndex('meeting_minutes', meeting.id, meeting.minutesMd ?? '');
  }

  for (const ticket of deps.ticketsRepo.listByCompany(deps.companyId)) {
    await tryIndex('ticket', ticket.id, formatTicketEmbeddingContent(ticket));
  }

  for (const goal of deps.goalsRepo.listByCompany(deps.companyId)) {
    await tryIndex('goal', goal.id, formatGoalEmbeddingContent(goal));
  }

  for (const project of deps.projectsRepo.listByCompany(deps.companyId)) {
    await tryIndex('project', project.id, formatProjectEmbeddingContent(project));
  }

  for (const file of deps.vaultRepo.listByCompany(deps.companyId)) {
    await tryIndex('vault_file', file.id, formatVaultFileEmbeddingContent(file));
  }

  if (failed > 0) {
    deps.logger?.warn?.(
      `[rag] rebuild for company ${deps.companyId}: ${scheduled} succeeded, ${failed} failed`,
    );
  }

  return { scheduled, failed };
}
