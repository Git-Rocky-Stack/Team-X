import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { SendChatRequest } from '@team-x/shared-types';

import { ipc } from '@/lib/ipc.js';
import { useAppStore } from '@/store/app-store.js';

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
