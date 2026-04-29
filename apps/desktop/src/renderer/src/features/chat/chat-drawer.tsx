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
import { ThreadMemoryCard } from '@/features/memory/thread-memory-card.js';
import {
  MissionIconButton,
  MissionInsetSurface,
  MissionPill,
  MissionSheetHeader,
} from '@/features/mission/mission-shell.js';
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
    selectedId ? (s.pendingDirectChats[selectedId] ?? null) : null,
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

  // Direct-message drawers must stay pinned to the user↔employee DM.
  // `live.lastThreadId` can point at ticket or employee↔employee work,
  // so using it here routes Rocky's direct message into the wrong thread.
  const effectiveThreadId = activeThreadId;

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
  }, [
    displayStatus,
    effectiveThreadId,
    qc,
    selectedId,
    setDirectChatAwaitingReply,
    setDirectChatStopping,
  ]);

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
        className="mission-shell flex w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden border-l border-white/10 bg-background/95 p-0 sm:w-[720px] sm:max-w-[calc(100vw-2rem)] xl:w-[820px] 2xl:w-[900px]"
      >
        <div className="mission-grid pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative flex h-full flex-col">
          {threadListView ? (
            <>
              <MissionSheetHeader
                eyebrow="Communication index"
                icon={List}
                title={<SheetTitle className="text-base font-semibold">Threads</SheetTitle>}
                badge={
                  <MissionPill className="text-[10px]" mono>
                    {threads.length} threads
                  </MissionPill>
                }
                description="Open direct messages, agent transcripts, and copilot sessions from one communication roster."
              />
              <ThreadList
                threads={threads}
                employees={employees}
                activeThreadId={effectiveThreadId}
                onSelectThread={handleSelectThread}
              />
            </>
          ) : viewingCopilotThread && effectiveThreadId ? (
            <>
              <MissionSheetHeader
                eyebrow="Copilot transcript"
                icon={Sparkles}
                title={
                  <SheetTitle className="flex items-center gap-2 text-base font-semibold">
                    <span className="truncate">
                      {activeThread?.subject ?? 'Copilot conversation'}
                    </span>
                    <SystemAgentBadge size="sm" />
                  </SheetTitle>
                }
                description={
                  copilotRunning
                    ? `Thinking — ${copilotSteps.length} step${copilotSteps.length === 1 ? '' : 's'} live in the transcript.`
                    : copilotResult?.kind === 'completed'
                      ? `Completed in ${copilotResult.payload.totalSteps} step${copilotResult.payload.totalSteps === 1 ? '' : 's'}.`
                      : copilotResult?.kind === 'failed'
                        ? `Failed — ${copilotResult.payload.reason}`
                        : 'Ready for transcript review.'
                }
                leadingAction={
                  <MissionIconButton
                    onClick={() => setThreadListView(true)}
                    aria-label="Back to threads"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </MissionIconButton>
                }
              />

              <div className="border-b border-white/10 px-5 py-3">
                <ThreadMemoryCard
                  companyId={companyId}
                  threadId={effectiveThreadId}
                  title="Copilot memory"
                  description="Inspect the latest digest and checkpoint trail behind this copilot run before jumping into the full memory surface."
                  compact
                />
              </div>

              <MessageList
                messages={messages}
                streamingText=""
                isStreaming={false}
                employeeName="Copilot"
                isAgentThread
                employees={employees}
              />

              <div className="border-t border-white/10 bg-black/20 px-4 py-3">
                <MissionInsetSurface className="flex items-center gap-2 px-3 py-3">
                  {copilotRunning ? (
                    <>
                      <Loader2
                        className="h-4 w-4 shrink-0 animate-spin text-brand"
                        aria-hidden="true"
                      />
                      <span className="text-xs text-muted-foreground">
                        Copilot is reasoning. The persisted transcript refreshes as each step lands.
                      </span>
                    </>
                  ) : copilotResult?.kind === 'failed' ? (
                    <>
                      <Sparkles className="h-4 w-4 shrink-0 text-red-300" aria-hidden="true" />
                      <span className="text-xs text-red-300">{copilotResult.payload.message}</span>
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="text-xs text-muted-foreground">
                        Copilot transcript is read only in the drawer.
                      </span>
                    </>
                  )}
                </MissionInsetSurface>
              </div>
            </>
          ) : viewingAgentThread && effectiveThreadId ? (
            <>
              <MissionSheetHeader
                eyebrow="Autonomous exchange"
                icon={Bot}
                iconClassName="border-amber-500/20 bg-amber-500/10 text-amber-300"
                title={
                  <SheetTitle className="text-base font-semibold">{agentThreadNames}</SheetTitle>
                }
                description="Observe the employee-to-employee thread without interrupting the active exchange."
                leadingAction={
                  <MissionIconButton
                    onClick={() => setThreadListView(true)}
                    aria-label="Back to threads"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </MissionIconButton>
                }
              />

              <div className="border-b border-white/10 px-5 py-3">
                <ThreadMemoryCard
                  companyId={companyId}
                  threadId={effectiveThreadId}
                  title="Autonomous memory"
                  description="Inspect the condensed handoff for this employee-to-employee exchange without leaving the transcript blind."
                  compact
                />
              </div>

              <MessageList
                messages={messages}
                streamingText={agentStreamText}
                isStreaming={agentIsStreaming}
                employeeName={agentStreamName}
                isAgentThread
                employees={employees}
              />

              <div className="border-t border-white/10 bg-black/20 px-4 py-3">
                <MissionInsetSurface className="flex items-center gap-2 px-3 py-3">
                  <Eye className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Observing agent conversation. This transcript is read only.
                  </span>
                </MissionInsetSurface>
              </div>
            </>
          ) : employee ? (
            <>
              <MissionSheetHeader
                eyebrow="Direct line"
                title={
                  <SheetTitle className="flex items-center gap-2 text-base font-semibold">
                    {employee.name}
                    <span
                      className={cn(
                        'h-2.5 w-2.5 shrink-0 rounded-full',
                        statusColor(displayStatus),
                      )}
                    />
                  </SheetTitle>
                }
                description={<span className="truncate">{employee.title}</span>}
                leadingAction={
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-white/10 bg-black/20 text-xs font-semibold text-foreground/80">
                    {initials(employee.name)}
                  </div>
                }
                trailingAction={
                  <MissionIconButton
                    onClick={() => setThreadListView(true)}
                    aria-label="View all threads"
                  >
                    <List className="h-4 w-4" />
                  </MissionIconButton>
                }
                badge={
                  <div className="flex flex-wrap gap-2">
                    <MissionPill className="px-2.5 py-1 text-[10px]" mono>
                      {displayStatus}
                    </MissionPill>
                    {queuedCount > 0 ? (
                      <MissionPill className="px-2.5 py-1 text-[10px]" mono>
                        {queuedCount} queued
                      </MissionPill>
                    ) : null}
                  </div>
                }
              />

              <div className="border-b border-white/10 px-5 py-3">
                <ThreadMemoryCard
                  companyId={companyId}
                  threadId={effectiveThreadId}
                  title="Conversation memory"
                  description="Inspect the latest digest and resumable checkpoint trail for this direct thread."
                  compact
                />
              </div>

              <MessageList
                messages={messages}
                streamingText={live?.currentStream ?? ''}
                isStreaming={isThinking}
                employeeName={employee.name}
              />

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
        </div>
      </SheetContent>
    </Sheet>
  );
}
