import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DashboardEvent, SendChatRequest } from '@team-x/shared-types';
import { useEffect } from 'react';

import { ipc } from '@/lib/ipc.js';
import { useAppStore } from '@/store/app-store.js';

interface StopChatRequest {
  threadId: string;
}

interface StopChatResponse {
  stopped: boolean;
}

export function useChatMessages(threadId: string | null) {
  return useQuery({
    queryKey: ['chat', threadId],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled` — queryFn only runs when threadId is non-null
    queryFn: () => ipc.chat.list(threadId!),
    enabled: threadId !== null && threadId.length > 0,
    refetchInterval: false,
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  const setActiveThreadId = useAppStore((s) => s.setActiveThreadId);

  return useMutation({
    mutationFn: (req: SendChatRequest) => ipc.chat.send(req),
    onSuccess: (data) => {
      // Cache the resolved thread id so subsequent sends in the same
      // drawer session go to the same thread (no more 'auto').
      setActiveThreadId(data.threadId);
      // Refetch the message list so the user's message appears in the
      // chat immediately (before the assistant reply streams in).
      qc.invalidateQueries({ queryKey: ['chat', data.threadId] });
    },
  });
}

export function useStopChat() {
  return useMutation<StopChatResponse, Error, StopChatRequest>({
    mutationFn: async (req) => {
      const chatApi = ipc.chat as typeof ipc.chat & {
        stop?: (input: StopChatRequest) => Promise<StopChatResponse>;
      };
      if (typeof chatApi.stop !== 'function') {
        return { stopped: false };
      }
      return chatApi.stop(req);
    },
  });
}

/**
 * Fetch all threads for the given company. Used by the thread list
 * sidebar in the chat drawer to show all conversations (user↔employee
 * DMs, employee↔employee agent threads, etc.).
 *
 * M32 T0 / F2 — subscribe to the dashboard event bus and invalidate
 * the `['threads', companyId]` query when an agentic-loop run
 * completes. Without this, a thread list opened before the run
 * finishes shows stale "No threads yet" copy (or a missing Copilot
 * row) until the next manual refetch. Architectural invariant #11
 * spells the rule out: IPC mutations must emit a bus event and
 * renderer caches subscribe to the bus for invalidation. The
 * system-agent thread is created by the main process (not the
 * renderer), so nothing else invalidates this cache.
 */
export function useThreadList(companyId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!companyId) return;
    const unsubscribe = ipc.events.onDashboard((event: DashboardEvent) => {
      if (event.type === 'agentic.completed' || event.type === 'agentic.failed') {
        qc.invalidateQueries({ queryKey: ['threads', companyId] });
      }
    });
    return unsubscribe;
  }, [companyId, qc]);

  return useQuery({
    queryKey: ['threads', companyId],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled` — queryFn only runs when companyId is non-null
    queryFn: () => ipc.chat.listThreads(companyId!),
    enabled: companyId !== null && companyId.length > 0,
    refetchInterval: false,
  });
}
