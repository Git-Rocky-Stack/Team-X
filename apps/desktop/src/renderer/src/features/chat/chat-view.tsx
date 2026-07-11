import type { Employee } from '@team-x/shared-types';
import { Bot, MessageSquare, Sparkles, Users2 } from 'lucide-react';

import { ThreadList, isAgentThread, isCopilotThread } from './thread-list.js';

import { Faceplate, MetricTile, SubviewState, Tag } from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
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
      <div className="flex flex-col gap-6 p-4 lg:p-6" data-chat-view="">
        <Faceplate kicker="Communication Command" serial="CONVERSATIONS" bodyClassName="space-y-4">
          <h1 className="text-h1 text-foreground">Conversations</h1>
          <p className="text-body text-silver-mute">
            Open a workspace to inspect live employee chats, agent transcripts, and copilot sessions
            from one communication surface.
          </p>
        </Faceplate>
        <Faceplate kicker="Conversation Roster" bodyClassName="space-y-3">
          <p className="text-caption text-silver-mute">
            A workspace is required before the thread system can load.
          </p>
          <div data-chat-view-state="no-company">
            <SubviewState
              lampLabel="STBY"
              lampTone="off"
              title="No workspace selected"
              description="Choose or create a workspace to review direct messages, agent conversations, and copilot transcripts."
            />
          </div>
        </Faceplate>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6" data-chat-view="">
        <Faceplate kicker="Communication Command" serial="CONVERSATIONS" bodyClassName="space-y-4">
          <h1 className="text-h1 text-foreground">Conversations</h1>
          <p className="text-body text-silver-mute">
            Syncing the latest thread history and thread ownership for this workspace.
          </p>
          <Tag mono>Live thread sync</Tag>
        </Faceplate>
        <Faceplate kicker="Conversation Roster" bodyClassName="space-y-3">
          <p className="text-caption text-silver-mute">
            Thread history is loading for the active workspace.
          </p>
          <div data-chat-view-state="loading">
            <SubviewState
              lampLabel="STBY"
              lampTone="hold"
              title="Loading conversations"
              description="The communication roster is pulling the latest direct messages, agent threads, and copilot transcripts."
            />
          </div>
        </Faceplate>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6" data-chat-view="">
        <Faceplate kicker="Communication Command" serial="CONVERSATIONS" bodyClassName="space-y-4">
          <h1 className="text-h1 text-foreground">Conversations</h1>
          <p className="text-body text-silver-mute">
            The communication shell is ready, but the thread query failed for this workspace.
          </p>
        </Faceplate>
        <Faceplate kicker="Conversation Roster" bodyClassName="space-y-3">
          <p className="text-caption text-silver-mute">
            Retry the thread query to restore the communication queue.
          </p>
          <div data-chat-view-state="error">
            <SubviewState
              lampLabel="NO-GO"
              lampTone="nogo"
              title="Conversations could not load"
              description="Retry the thread query to restore employee chats, agent transcripts, and copilot sessions."
              action={
                <Button
                  type="button"
                  variant="outline"
                  data-chat-view-retry=""
                  onClick={() => refetch()}
                >
                  Retry
                </Button>
              }
            />
          </div>
        </Faceplate>
      </div>
    );
  }

  const copilotCount = threads.filter((thread) => isCopilotThread(thread)).length;
  const agentCount = threads.filter((thread) => isAgentThread(thread)).length;
  const directCount = threads.filter(
    (thread) => !isCopilotThread(thread) && !isAgentThread(thread),
  ).length;

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6" data-chat-view="">
      <Faceplate kicker="Communication Command" serial="CONVERSATIONS" bodyClassName="space-y-4">
        <h1 className="text-h1 text-foreground">Conversations</h1>
        <p className="text-body text-silver-mute">
          Track operator direct messages, autonomous agent exchanges, and copilot sessions from one
          shared communication roster.
        </p>
        <Tag mono>Drawer-backed threads</Tag>
        <div className="flex flex-wrap items-center gap-2">
          <Tag>
            {threads.length === 1 ? '1 visible thread' : `${threads.length} visible threads`}
          </Tag>
          <Tag mono>{employees.length} employees</Tag>
          <Tag mono>
            {activeThreadId ? 'Drawer locked on active thread' : 'Select any row to open drawer'}
          </Tag>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label="All threads"
            value={`${threads.length}`}
            hint="Every conversation currently visible in the active workspace."
            icon={MessageSquare}
          />
          <MetricTile
            label="Direct chats"
            value={`${directCount}`}
            hint="User-facing conversations with employees and mixed-participant threads."
            icon={Users2}
          />
          <MetricTile
            label="Agent threads"
            value={`${agentCount}`}
            hint="Read-only employee-to-employee conversations and autonomous loops."
            icon={Bot}
          />
          <MetricTile
            label="Copilot runs"
            value={`${copilotCount}`}
            hint="System-copilot transcripts routed through the existing drawer flow."
            icon={Sparkles}
          />
        </div>
      </Faceplate>

      <Faceplate kicker="Conversation Roster" bodyClassName="space-y-3">
        <p className="text-caption text-silver-mute">
          Select a thread to open it in the existing chat drawer without leaving the communication
          surface.
        </p>
        <Tag mono>Thread index</Tag>
        {threads.length === 0 ? (
          <div data-chat-view-state="empty">
            <SubviewState
              lampLabel="STBY"
              lampTone="off"
              title="No conversations yet"
              description="Open a direct message, agent run, or copilot request to seed the communication roster."
            />
          </div>
        ) : (
          <div className="overflow-hidden" data-chat-view-roster="">
            <ThreadList
              threads={threads}
              employees={employees}
              activeThreadId={activeThreadId}
              onSelectThread={handleSelectThread}
            />
          </div>
        )}
      </Faceplate>
    </div>
  );
}
