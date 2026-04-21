/**
 * Chat drawer — right-side sheet that houses three views:
 *
 *   1. **Employee DM** (existing) — opened by clicking an employee card.
 *      Shows the user↔employee conversation with a composer.
 *
 *   2. **Thread list** (M11) — toggled via the list icon in the header
 *      or the "Threads" button in the sidenav. Shows all threads for
 *      the company, sorted by recency.
 *
 *   3. **Agent thread** (M11) — opened by clicking an employee↔employee
 *      thread in the list. Read-only: the composer is replaced with an
 *      "observing" banner. Messages show sender names and AI badges.
 *
 * The view mode is driven by Zustand state:
 *   - `threadListView` → thread list
 *   - `viewingAgentThread && activeThreadId` → agent thread (read-only)
 *   - `selectedEmployeeId && !threadListView` → employee DM
 */

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import type { Employee } from '@team-x/shared-types';
import { AUTO_THREAD_ID } from '@team-x/shared-types';

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet.js';
import { useAgentStepStream } from '@/hooks/use-agent-step-stream.js';
import { useChatMessages, useSendMessage, useStopChat, useThreadList } from '@/hooks/use-chat.js';
import { ipc } from '@/lib/ipc.js';
import { cn } from '@/lib/utils.js';
import { useAppStore } from '@/store/app-store.js';

import { ArrowLeft, Bot, Eye, List, Loader2, Sparkles } from 'lucide-react';

import { Composer } from './composer.js';
import { MessageList } from './message-list.js';
import { SystemAgentBadge } from './system-agent-badge.js';
import {
  ThreadList,
  isAgentThread as checkAgentThread,
  isCopilotThread as checkCopilotThread,
} from './thread-list.js';

function statusColor(status: string): string {
  switch (status) {
    case 'thinking':
      return 'bg-brand animate-pulse-slow';
    case 'blocked':
      return 'bg-amber-500';
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-zinc-500';
  }
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
}

interface ChatDrawerProps {
  employees: Employee[];
}

export function ChatDrawer({ employees }: ChatDrawerProps) {
  const selectedId = useAppStore((s) => s.selectedEmployeeId);
  const chatOpen = useAppStore((s) => s.chatOpen);
  const setChatOpen = useAppStore((s) => s.setChatOpen);
  const activeThreadId = useAppStore((s) => s.activeThreadId);
  const setActiveThreadId = useAppStore((s) => s.setActiveThreadId);
  const employeeLive = useAppStore((s) => s.employeeLive);
  const threadListView = useAppStore((s) => s.threadListView);
  const viewingAgentThread = useAppStore((s) => s.viewingAgentThread);
  const viewingCopilotThread = useAppStore((s) => s.viewingCopilotThread);
  const openThread = useAppStore((s) => s.openThread);
  const setThreadListView = useAppStore((s) => s.setThreadListView);
  const companyId = useAppStore((s) => s.companyId);
  const lastAgentMessageAt = useAppStore((s) => s.lastAgentMessageAt);
  const pendingDirectChat = useAppStore((s) =>
    selectedId ? s.pendingDirectChats[selectedId] ?? null : null,
  );
  const enqueueQueuedDirectChatMessage = useAppStore((s) => s.enqueueQueuedDirectChatMessage);
  const dequeueQueuedDirectChatMessage = useAppStore((s) => s.dequeueQueuedDirectChatMessage);
  const setDirectChatStopping = useAppStore((s) => s.setDirectChatStopping);
  const setDirectChatAwaitingReply = useAppStore((s) => s.setDirectChatAwaitingReply);

  const employee = employees.find((e) => e.id === selectedId) ?? null;
  const live = selectedId ? employeeLive[selectedId] : undefined;
  const displayStatus = live?.status ?? employee?.status ?? 'idle';
  const isThinking = displayStatus === 'thinking';
  const queuedCount = pendingDirectChat?.queuedMessages.length ?? 0;
  const isStopping = pendingDirectChat?.isStopping ?? false;
  const awaitingReply = pendingDirectChat?.awaitingReply ?? false;

  // Resolve the thread id: prefer the active (already-resolved) thread,
  // fall back to the employee's last known thread from live state, else null.
  const effectiveThreadId = activeThreadId ?? live?.lastThreadId ?? null;

  const { data: messages = [] } = useChatMessages(effectiveThreadId);
  const { data: threads = [] } = useThreadList(companyId);
  const sendMutation = useSendMessage();
  const stopMutation = useStopChat();
  const qc = useQueryClient();
  const isDirectMessageBusy = isThinking || sendMutation.isPending || awaitingReply || isStopping;
  const shouldQueueSend = isDirectMessageBusy || queuedCount > 0;
  const canStopCurrentReply = effectiveThreadId !== null && isDirectMessageBusy;

  // Copilot thread: subscribe to the agentic-loop step stream. The hook
  // is a no-op when threadId is null OR the active thread is not a
  // Copilot thread. Phase 5 — M31 T5.
  const copilotThreadId = viewingCopilotThread ? effectiveThreadId : null;
  const { steps: copilotSteps, result: copilotResult } = useAgentStepStream(copilotThreadId);
  const copilotRunning =
    copilotThreadId !== null && copilotResult === null && copilotSteps.length > 0;

  // Find the active thread in the threads list for agent-thread header info.
  const activeThread = threads.find((t) => t.id === effectiveThreadId);
  const agentThreadNames =
    viewingAgentThread && activeThread
      ? activeThread.members
          .map((m) => employees.find((e) => e.id === m.memberId)?.name ?? 'Agent')
          .join(' & ')
      : '';

  // For agent threads: find the currently streaming participant (if any).
  const agentStreamingMember =
    viewingAgentThread && activeThread
      ? activeThread.members.find((m) => {
          const ls = employeeLive[m.memberId];
          return ls?.status === 'thinking' && ls?.lastThreadId === effectiveThreadId;
        })
      : undefined;
  const agentStreamText = agentStreamingMember
    ? (employeeLive[agentStreamingMember.memberId]?.currentStream ?? '')
    : '';
  const agentIsStreaming = agentStreamingMember !== undefined;
  const agentStreamName = agentStreamingMember
    ? (employees.find((e) => e.id === agentStreamingMember.memberId)?.name ?? 'Agent')
    : '';

  // ── Effects ────────────────────────────────────────────────────

  // Invalidate thread list when an agent-to-agent message event fires.
  useEffect(() => {
    if (lastAgentMessageAt > 0) {
      void qc.invalidateQueries({ queryKey: ['threads'] });
    }
  }, [lastAgentMessageAt, qc]);

  // Resolve user↔employee DM thread on drawer open (existing behavior).
  // Only fires for the employee DM view — not for thread list or agent threads.
  useEffect(() => {
    if (!chatOpen || !selectedId || effectiveThreadId !== null) return;
    if (threadListView || viewingAgentThread || viewingCopilotThread) return;
    let cancelled = false;
    ipc.chat
      .resolveThread({ employeeId: selectedId })
      .then((res) => {
        if (!cancelled) setActiveThreadId(res.threadId);
      })
      .catch((err: unknown) => {
        console.error('[chat-drawer] resolveThread failed:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [
    chatOpen,
    selectedId,
    effectiveThreadId,
    setActiveThreadId,
    threadListView,
    viewingAgentThread,
    viewingCopilotThread,
  ]);

  // Copilot thread: refetch persisted messages when the live step count
  // advances so the transcript stays in sync with `agent.step` events
  // feeding `messagesRepo.append` in AgenticLoopService. Runs exactly
  // once per new step.
  const prevCopilotStepsRef = useRef(0);
  useEffect(() => {
    if (!viewingCopilotThread || !effectiveThreadId) {
      prevCopilotStepsRef.current = 0;
      return;
    }
    if (copilotSteps.length > prevCopilotStepsRef.current) {
      prevCopilotStepsRef.current = copilotSteps.length;
      void qc.invalidateQueries({ queryKey: ['chat', effectiveThreadId] });
    }
  }, [copilotSteps.length, viewingCopilotThread, effectiveThreadId, qc]);

  // Copilot thread: when a run terminates (completed or failed) refetch
  // both the thread and message lists so the final answer + run summary
  // land in the view promptly.
  useEffect(() => {
    if (!viewingCopilotThread || !effectiveThreadId) return;
    if (copilotResult === null) return;
    void qc.invalidateQueries({ queryKey: ['chat', effectiveThreadId] });
    void qc.invalidateQueries({ queryKey: ['threads'] });
  }, [copilotResult, viewingCopilotThread, effectiveThreadId, qc]);

  // Invalidate messages when an employee transitions thinking → idle
  // (employee DM view).
  const prevStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = displayStatus;
    if (prev === 'thinking' && displayStatus === 'idle' && effectiveThreadId) {
      void qc.invalidateQueries({ queryKey: ['chat', effectiveThreadId] });
      if (selectedId) {
        setDirectChatStopping(selectedId, false);
        setDirectChatAwaitingReply(selectedId, false);
      }
    }
  }, [displayStatus, effectiveThreadId, qc, selectedId, setDirectChatAwaitingReply, setDirectChatStopping]);

  useEffect(() => {
    if (!selectedId || !isThinking || !awaitingReply) return;
    setDirectChatAwaitingReply(selectedId, false);
  }, [selectedId, isThinking, awaitingReply, setDirectChatAwaitingReply]);

  // Invalidate messages when agent-thread streaming stops.
  const prevAgentStreamRef = useRef(false);
  useEffect(() => {
    if (!viewingAgentThread || !effectiveThreadId) return;
    const prev = prevAgentStreamRef.current;
    prevAgentStreamRef.current = agentIsStreaming;
    if (prev && !agentIsStreaming) {
      void qc.invalidateQueries({ queryKey: ['chat', effectiveThreadId] });
      void qc.invalidateQueries({ queryKey: ['threads'] });
    }
  }, [agentIsStreaming, viewingAgentThread, effectiveThreadId, qc]);

  useEffect(() => {
    if (!selectedId || viewingAgentThread || viewingCopilotThread) return;
    if (queuedCount === 0) return;
    if (isThinking || sendMutation.isPending || awaitingReply || isStopping) return;
    const nextMessage = dequeueQueuedDirectChatMessage(selectedId);
    if (!nextMessage) return;
    setDirectChatAwaitingReply(selectedId, true);
    sendMutation.mutate(
      {
        threadId: effectiveThreadId ?? AUTO_THREAD_ID,
        employeeId: selectedId,
        content: nextMessage,
      },
      {
        onError: () => {
          setDirectChatAwaitingReply(selectedId, false);
        },
      },
    );
  }, [
    selectedId,
    viewingAgentThread,
    viewingCopilotThread,
    queuedCount,
    isThinking,
    sendMutation,
    awaitingReply,
    isStopping,
    dequeueQueuedDirectChatMessage,
    setDirectChatAwaitingReply,
    effectiveThreadId,
  ]);

  // ── Handlers ───────────────────────────────────────────────────

  function dispatchDirectMessage(content: string) {
    if (!selectedId) return;
    setDirectChatAwaitingReply(selectedId, true);
    sendMutation.mutate(
      {
        threadId: effectiveThreadId ?? AUTO_THREAD_ID,
        employeeId: selectedId,
        content,
      },
      {
        onError: () => {
          setDirectChatAwaitingReply(selectedId, false);
        },
      },
    );
  }

  function handleSend(content: string) {
    dispatchDirectMessage(content);
  }

  function handleQueue(content: string) {
    if (!selectedId) return;
    enqueueQueuedDirectChatMessage(selectedId, content);
  }

  async function handleStop() {
    if (!selectedId || !effectiveThreadId || stopMutation.isPending) return;
    const result = await stopMutation.mutateAsync({ threadId: effectiveThreadId });
    if (result.stopped) {
      if (isThinking) {
        setDirectChatStopping(selectedId, true);
      } else {
        setDirectChatStopping(selectedId, false);
        setDirectChatAwaitingReply(selectedId, false);
      }
    }
  }

  function handleSelectThread(threadId: string) {
    const thread = threads.find((t) => t.id === threadId);
    if (!thread) return;
    const isCopilot = checkCopilotThread(thread);
    if (isCopilot) {
      openThread({
        threadId,
        isAgentThread: false,
        isCopilotThread: true,
        employeeId: null,
      });
      return;
    }
    const isAgent = checkAgentThread(thread);
    if (isAgent) {
      openThread({ threadId, isAgentThread: true, employeeId: null });
    } else {
      const empMember = thread.members.find((m) => m.memberKind === 'employee');
      openThread({ threadId, isAgentThread: false, employeeId: empMember?.memberId ?? null });
    }
  }

  // ── Render gate ────────────────────────────────────────────────

  const showDrawer =
    chatOpen &&
    (employee !== null ||
      threadListView ||
      (viewingAgentThread && effectiveThreadId !== null) ||
      (viewingCopilotThread && effectiveThreadId !== null));

  if (!showDrawer) return null;

  return (
    <Sheet open={chatOpen} onOpenChange={setChatOpen}>
      <SheetContent
        side="right"
        className="flex w-[480px] max-w-full flex-col gap-0 p-0 sm:max-w-[480px]"
      >
        {threadListView ? (
          /* ── Thread list view ─────────────────────────────── */
          <>
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <SheetTitle className="flex-1 text-sm font-semibold">Threads</SheetTitle>
            </div>
            <ThreadList
              threads={threads}
              employees={employees}
              activeThreadId={effectiveThreadId}
              onSelectThread={handleSelectThread}
            />
          </>
        ) : viewingCopilotThread && effectiveThreadId ? (
          /* ── Copilot thread view (read-only, M31 T5) ─────── */
          <>
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <button
                type="button"
                onClick={() => setThreadListView(true)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-100 hover:text-foreground"
                aria-label="Back to threads"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="flex items-center gap-2 text-sm font-semibold">
                  <span className="truncate">
                    {activeThread?.subject ?? 'Copilot conversation'}
                  </span>
                  <SystemAgentBadge size="sm" />
                </SheetTitle>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {copilotRunning
                    ? `Thinking — ${copilotSteps.length} step${copilotSteps.length === 1 ? '' : 's'}`
                    : copilotResult?.kind === 'completed'
                      ? `Completed in ${copilotResult.payload.totalSteps} step${copilotResult.payload.totalSteps === 1 ? '' : 's'}`
                      : copilotResult?.kind === 'failed'
                        ? `Failed — ${copilotResult.payload.reason}`
                        : 'Ready'}
                </p>
              </div>
            </div>

            {/* Messages — the agentic loop persists every step as a
                message on this thread, so MessageList renders the full
                step transcript (plan → tool_call → tool_result → answer)
                without any extra client-side state. The live step stream
                drives cache invalidation above so new steps land as soon
                as they're emitted. */}
            <MessageList
              messages={messages}
              streamingText=""
              isStreaming={false}
              employeeName="Copilot"
              isAgentThread
              employees={employees}
            />

            {/* Running indicator + read-only banner */}
            <div className="flex items-center gap-2 border-t border-border px-4 py-3">
              {copilotRunning ? (
                <>
                  <Loader2
                    className="h-4 w-4 shrink-0 animate-spin text-brand"
                    aria-hidden="true"
                  />
                  <span className="text-xs text-muted-foreground">
                    Copilot is reasoning — transcript updates live
                  </span>
                </>
              ) : copilotResult?.kind === 'failed' ? (
                <span className="text-xs text-red-400">{copilotResult.payload.message}</span>
              ) : (
                <>
                  <Eye className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="text-xs text-muted-foreground">
                    Copilot transcript — read only
                  </span>
                </>
              )}
            </div>
          </>
        ) : viewingAgentThread && effectiveThreadId ? (
          /* ── Agent thread view (read-only) ────────────────── */
          <>
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <button
                type="button"
                onClick={() => setThreadListView(true)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-100 hover:text-foreground"
                aria-label="Back to threads"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-sm font-semibold">{agentThreadNames}</SheetTitle>
                <div className="mt-0.5 flex items-center gap-1">
                  <Bot className="h-3 w-3 text-amber-500" />
                  <span className="text-[11px] text-amber-500">Agent conversation</span>
                </div>
              </div>
            </div>

            {/* Messages */}
            <MessageList
              messages={messages}
              streamingText={agentStreamText}
              isStreaming={agentIsStreaming}
              employeeName={agentStreamName}
              isAgentThread
              employees={employees}
            />

            {/* Read-only banner */}
            <div className="flex items-center gap-2 border-t border-border px-4 py-3">
              <Eye className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Observing agent conversation — read only
              </span>
            </div>
          </>
        ) : employee ? (
          /* ── Employee DM view (existing) ──────────────────── */
          <>
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-200 text-xs font-semibold text-foreground/80">
                {initials(employee.name)}
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="flex items-center gap-2 text-sm font-semibold">
                  {employee.name}
                  <span
                    className={cn('h-2 w-2 shrink-0 rounded-full', statusColor(displayStatus))}
                  />
                </SheetTitle>
                <p className="truncate text-xs text-muted-foreground">{employee.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setThreadListView(true)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-100 hover:text-foreground"
                aria-label="View all threads"
              >
                <List className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <MessageList
              messages={messages}
              streamingText={live?.currentStream ?? ''}
              isStreaming={isThinking}
              employeeName={employee.name}
            />

            {/* Composer */}
            <Composer
              onSend={handleSend}
              onQueue={handleQueue}
              onStop={handleStop}
              queuedCount={queuedCount}
              isBusy={isDirectMessageBusy}
              queueMode={shouldQueueSend}
              stopPending={canStopCurrentReply && stopMutation.isPending}
            />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
