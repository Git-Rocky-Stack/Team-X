import type {
  ThreadDigest,
  ThreadDigestFreshnessState,
  ThreadDigestPinnedFact,
} from '@team-x/shared-types';

import type { MessageRow } from '../db/repos/messages.js';
import type { ThreadDigestRow, ThreadDigestsRepo } from '../db/repos/thread-digests.js';

export const DEFAULT_DIGEST_REFRESH_MESSAGE_THRESHOLD = 12;

export interface UpsertThreadDigestInput {
  companyId: string;
  threadId: string;
  summary: string;
  pinnedFacts?: ThreadDigestPinnedFact[];
  lastSummarizedMessageId?: string | null;
  estimatedTokens?: number;
  freshness?: ThreadDigestFreshnessState;
}

export interface InspectThreadDigestInput {
  companyId: string;
  threadId: string;
  refreshThreshold?: number;
}

export interface ThreadDigestInspection {
  digest: ThreadDigest | null;
  latestMessageId: string | null;
  unsummarizedMessageCount: number;
  freshness: ThreadDigestFreshnessState;
  needsRefresh: boolean;
}

export interface ThreadDigestServiceDeps {
  threadDigestsRepo: ThreadDigestsRepo;
  messagesRepo: {
    listByThread(threadId: string): MessageRow[];
  };
}

function parsePinnedFactsJson(raw: string): ThreadDigestPinnedFact[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item) => item && typeof item === 'object')
        .map((item, index) => {
          const record = item as Record<string, unknown>;
          const fact =
            typeof record.fact === 'string' && record.fact.trim().length > 0
              ? record.fact.trim()
              : null;
          if (!fact) {
            return null;
          }
          return {
            id:
              typeof record.id === 'string' && record.id.trim().length > 0
                ? record.id.trim()
                : `fact-${index + 1}`,
            fact,
            sourceMessageId:
              typeof record.sourceMessageId === 'string' && record.sourceMessageId.length > 0
                ? record.sourceMessageId
                : null,
          };
        })
        .filter((item): item is ThreadDigestPinnedFact => item !== null);
    }
  } catch {
    // Fall through.
  }
  return [];
}

function rowToThreadDigest(row: ThreadDigestRow): ThreadDigest {
  return {
    id: row.id,
    companyId: row.companyId,
    threadId: row.threadId,
    summary: row.summary,
    pinnedFacts: parsePinnedFactsJson(row.pinnedFactsJson),
    lastSummarizedMessageId: row.lastSummarizedMessageId,
    estimatedTokens: row.estimatedTokens,
    freshness: row.freshness as ThreadDigestFreshnessState,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function resolveInspection(
  digest: ThreadDigest | null,
  messages: MessageRow[],
  refreshThreshold: number,
): ThreadDigestInspection {
  const latestMessageId = messages.at(-1)?.id ?? null;
  if (!digest) {
    return {
      digest: null,
      latestMessageId,
      unsummarizedMessageCount: messages.length,
      freshness: 'stale',
      needsRefresh: messages.length > 0,
    };
  }

  if (!digest.lastSummarizedMessageId) {
    const freshness = messages.length >= refreshThreshold ? 'stale' : 'fresh';
    return {
      digest: {
        ...digest,
        freshness,
      },
      latestMessageId,
      unsummarizedMessageCount: messages.length,
      freshness,
      needsRefresh: messages.length >= refreshThreshold,
    };
  }

  const boundaryIndex = messages.findIndex(
    (message) => message.id === digest.lastSummarizedMessageId,
  );
  if (boundaryIndex === -1) {
    return {
      digest: {
        ...digest,
        freshness: 'degraded',
      },
      latestMessageId,
      unsummarizedMessageCount: messages.length,
      freshness: 'degraded',
      needsRefresh: messages.length > 0,
    };
  }

  const unsummarizedMessageCount = Math.max(0, messages.length - boundaryIndex - 1);
  const freshness =
    digest.freshness === 'degraded'
      ? 'degraded'
      : unsummarizedMessageCount >= refreshThreshold
        ? 'stale'
        : 'fresh';

  return {
    digest: {
      ...digest,
      freshness,
    },
    latestMessageId,
    unsummarizedMessageCount,
    freshness,
    needsRefresh: unsummarizedMessageCount >= refreshThreshold || freshness === 'degraded',
  };
}

export function createThreadDigestService(deps: ThreadDigestServiceDeps) {
  const { threadDigestsRepo, messagesRepo } = deps;

  function getLatest(input: { companyId: string; threadId: string }): ThreadDigest | null {
    const row = threadDigestsRepo.getByCompanyThread(input.companyId, input.threadId);
    return row ? rowToThreadDigest(row) : null;
  }

  function inspectThread(input: InspectThreadDigestInput): ThreadDigestInspection {
    const messages = messagesRepo.listByThread(input.threadId);
    const digest = getLatest(input);
    return resolveInspection(
      digest,
      messages,
      input.refreshThreshold ?? DEFAULT_DIGEST_REFRESH_MESSAGE_THRESHOLD,
    );
  }

  return {
    getLatest,
    inspectThread,

    shouldRefresh(input: InspectThreadDigestInput): boolean {
      return inspectThread(input).needsRefresh;
    },

    upsertDigest(input: UpsertThreadDigestInput): ThreadDigest {
      const inspection = inspectThread({
        companyId: input.companyId,
        threadId: input.threadId,
      });
      const pinnedFacts = (input.pinnedFacts ?? []).filter((fact) => fact.fact.trim().length > 0);
      const lastSummarizedMessageId =
        input.lastSummarizedMessageId === undefined
          ? inspection.latestMessageId
          : input.lastSummarizedMessageId;
      const freshness =
        input.freshness ??
        (lastSummarizedMessageId &&
        inspection.latestMessageId &&
        lastSummarizedMessageId !== inspection.latestMessageId
          ? 'stale'
          : 'fresh');
      const row = threadDigestsRepo.upsert({
        companyId: input.companyId,
        threadId: input.threadId,
        summary: input.summary.trim(),
        pinnedFactsJson: JSON.stringify(pinnedFacts),
        lastSummarizedMessageId,
        estimatedTokens: input.estimatedTokens ?? 0,
        freshness,
      });
      return rowToThreadDigest(row);
    },
  };
}

export type ThreadDigestService = ReturnType<typeof createThreadDigestService>;
