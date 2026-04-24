import { useQuery } from '@tanstack/react-query';

import { autonomyClient } from '@/features/autonomy/autonomy-client.js';
import { requireString } from '@/lib/required.js';

export function useThreadDigest(companyId: string | null, threadId: string | null) {
  return useQuery({
    queryKey: ['memory', 'digest', companyId, threadId],
    queryFn: () =>
      autonomyClient.memory.getThreadDigest({
        companyId: requireString(companyId, 'companyId'),
        threadId: requireString(threadId, 'threadId'),
      }),
    enabled: companyId !== null && companyId.length > 0 && threadId !== null && threadId.length > 0,
  });
}

export function useRunCheckpoints(companyId: string | null, threadId: string | null, limit = 5) {
  return useQuery({
    queryKey: ['memory', 'checkpoints', companyId, threadId, limit],
    queryFn: () =>
      autonomyClient.memory.listRunCheckpoints({
        companyId: requireString(companyId, 'companyId'),
        threadId: requireString(threadId, 'threadId'),
        limit,
      }),
    enabled: companyId !== null && companyId.length > 0 && threadId !== null && threadId.length > 0,
  });
}

export function usePackedThreadContext(
  companyId: string | null,
  threadId: string | null,
  options: {
    targetTokenBudget?: number;
    recentTurnLimit?: number;
  } = {},
) {
  const { targetTokenBudget, recentTurnLimit } = options;
  return useQuery({
    queryKey: [
      'memory',
      'packed-context',
      companyId,
      threadId,
      targetTokenBudget ?? null,
      recentTurnLimit ?? null,
    ],
    queryFn: () =>
      autonomyClient.memory.packThreadContext({
        companyId: requireString(companyId, 'companyId'),
        threadId: requireString(threadId, 'threadId'),
        ...(targetTokenBudget ? { targetTokenBudget } : {}),
        ...(recentTurnLimit ? { recentTurnLimit } : {}),
      }),
    enabled: companyId !== null && companyId.length > 0 && threadId !== null && threadId.length > 0,
  });
}
