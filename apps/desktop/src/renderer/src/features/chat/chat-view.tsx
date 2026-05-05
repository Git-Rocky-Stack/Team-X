import type { Employee } from '@team-x/shared-types';
import { AlertCircle, Bot, Loader2, MessageSquare, Sparkles, Users2 } from 'lucide-react';

import { ThreadList, isAgentThread, isCopilotThread } from './thread-list.js';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import {
  MissionControlRow,
  MissionHero,
  MissionInsetSurface,
  MissionMetricTile,
  MissionPageShell,
  MissionPill,
  MissionSectionCard,
  MissionStateBlock,
} from '@/features/mission/mission-shell.js';
import { useThreadList } from '@/hooks/use-chat.js';
import { useAppStore } from '@/store/app-store.js';

interface ChatViewProps {
  companyId: string | null;
  employees: Employee[];
}

export function ChatView({ companyId, employees }: ChatViewProps) {
  const activeThreadId = useAppStore((s) => s.activeThreadId);
  const openThread = useAppStore((s) => s.openThread);
  const { data: threads = [], isLoading, isError, refetch } = useThreadList(companyId);

  function handleSelectThread(threadId: string) {
    const thread = threads.find((candidate) => candidate.id === threadId);
    if (!thread) return;

    if (isCopilotThread(thread)) {
      openThread({
        threadId,
        isAgentThread: false,
        isCopilotThread: true,
        employeeId: null,
      });
      return;
    }

    if (isAgentThread(thread)) {
      openThread({ threadId, isAgentThread: true, employeeId: null });
      return;
    }

    const employeeMember = thread.members.find((member) => member.memberKind === 'employee');
    openThread({
      threadId,
      isAgentThread: false,
      employeeId: employeeMember?.memberId ?? null,
    });
  }

  if (companyId === null) {
    return (
      <MissionPageShell data-chat-view="">
        <MissionHero
          eyebrow="Communication command"
          title="Conversations"
          description="Open a workspace to inspect live employee chats, agent transcripts, and copilot sessions from one communication surface."
          icon={MessageSquare}
        />
        <MissionSectionCard
          title="Conversation roster"
          description="A workspace is required before the thread system can load."
        >
          <MissionStateBlock
            title="No workspace selected"
            description="Choose or create a workspace to review direct messages, agent conversations, and copilot transcripts."
            icon={MessageSquare}
            data-chat-view-state="no-company"
          />
        </MissionSectionCard>
      </MissionPageShell>
    );
  }

  if (isLoading) {
    return (
      <MissionPageShell data-chat-view="">
        <MissionHero
          eyebrow="Communication command"
          title="Conversations"
          description="Syncing the latest thread history and thread ownership for this workspace."
          icon={MessageSquare}
          badge={
            <Badge
              variant="outline"
              className="border-white/10 bg-black/20 text-[10px] font-mono text-muted-foreground"
            >
              Live thread sync
            </Badge>
          }
        />
        <MissionSectionCard
          title="Conversation roster"
          description="Thread history is loading for the active workspace."
        >
          <MissionStateBlock
            title="Loading conversations"
            description="The communication roster is pulling the latest direct messages, agent threads, and copilot transcripts."
            icon={Loader2}
            data-chat-view-state="loading"
          />
        </MissionSectionCard>
      </MissionPageShell>
    );
  }

  if (isError) {
    return (
      <MissionPageShell data-chat-view="">
        <MissionHero
          eyebrow="Communication command"
          title="Conversations"
          description="The communication shell is ready, but the thread query failed for this workspace."
          icon={MessageSquare}
        />
        <MissionSectionCard
          title="Conversation roster"
          description="Retry the thread query to restore the communication queue."
          actions={
            <Button
              type="button"
              variant="outline"
              className="border-white/10 bg-black/10 text-foreground hover:bg-black/20"
              data-chat-view-retry=""
              onClick={() => refetch()}
            >
              Retry
            </Button>
          }
        >
          <MissionStateBlock
            title="Conversations could not load"
            description="Retry the thread query to restore employee chats, agent transcripts, and copilot sessions."
            icon={AlertCircle}
            tone="danger"
            data-chat-view-state="error"
          />
        </MissionSectionCard>
      </MissionPageShell>
    );
  }

  const copilotCount = threads.filter((thread) => isCopilotThread(thread)).length;
  const agentCount = threads.filter((thread) => isAgentThread(thread)).length;
  const directCount = threads.filter(
    (thread) => !isCopilotThread(thread) && !isAgentThread(thread),
  ).length;

  return (
    <MissionPageShell data-chat-view="">
      <MissionHero
        eyebrow="Communication command"
        title="Conversations"
        description="Track operator direct messages, autonomous agent exchanges, and copilot sessions from one shared communication roster."
        icon={MessageSquare}
        badge={
          <Badge
            variant="outline"
            className="border-white/10 bg-black/20 text-[10px] font-mono text-muted-foreground"
          >
            Drawer-backed threads
          </Badge>
        }
        meta={
          <MissionControlRow density="compact" className="gap-2 px-3 py-2">
            <MissionPill uppercase>{threads.length} visible threads</MissionPill>
            <MissionPill mono>{employees.length} employees</MissionPill>
            <MissionPill mono>
              {activeThreadId ? 'Drawer locked on active thread' : 'Select any row to open drawer'}
            </MissionPill>
          </MissionControlRow>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MissionMetricTile
            label="All threads"
            value={`${threads.length}`}
            hint="Every conversation currently visible in the active workspace."
            icon={MessageSquare}
          />
          <MissionMetricTile
            label="Direct chats"
            value={`${directCount}`}
            hint="User-facing conversations with employees and mixed-participant threads."
            icon={Users2}
          />
          <MissionMetricTile
            label="Agent threads"
            value={`${agentCount}`}
            hint="Read-only employee-to-employee conversations and autonomous loops."
            icon={Bot}
          />
          <MissionMetricTile
            label="Copilot runs"
            value={`${copilotCount}`}
            hint="System-copilot transcripts routed through the existing drawer flow."
            icon={Sparkles}
          />
        </div>
      </MissionHero>

      <MissionSectionCard
        title="Conversation roster"
        description="Select a thread to open it in the existing chat drawer without leaving the communication surface."
        badge={
          <Badge
            variant="outline"
            className="border-white/10 bg-black/20 text-[10px] font-mono text-muted-foreground"
          >
            Thread index
          </Badge>
        }
      >
        {threads.length === 0 ? (
          <MissionStateBlock
            title="No conversations yet"
            description="Open a direct message, agent run, or copilot request to seed the communication roster."
            icon={MessageSquare}
            data-chat-view-state="empty"
          />
        ) : (
          <MissionInsetSurface className="overflow-hidden p-0">
            <ThreadList
              threads={threads}
              employees={employees}
              activeThreadId={activeThreadId}
              onSelectThread={handleSelectThread}
            />
          </MissionInsetSurface>
        )}
      </MissionSectionCard>
    </MissionPageShell>
  );
}
