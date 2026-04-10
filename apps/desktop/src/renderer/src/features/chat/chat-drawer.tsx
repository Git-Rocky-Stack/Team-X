import type { Employee } from '@team-x/shared-types';
import { AUTO_THREAD_ID } from '@team-x/shared-types';

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet.js';
import { useChatMessages, useSendMessage } from '@/hooks/use-chat.js';
import { cn } from '@/lib/utils.js';
import { useAppStore } from '@/store/app-store.js';

import { Composer } from './composer.js';
import { MessageList } from './message-list.js';

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
  const employeeLive = useAppStore((s) => s.employeeLive);

  const employee = employees.find((e) => e.id === selectedId) ?? null;
  const live = selectedId ? employeeLive[selectedId] : undefined;
  const displayStatus = live?.status ?? employee?.status ?? 'idle';
  const isThinking = displayStatus === 'thinking';

  // Resolve the thread id: prefer the active (already-resolved) thread,
  // fall back to the employee's last known thread from live state, else null.
  const effectiveThreadId = activeThreadId ?? live?.lastThreadId ?? null;

  const { data: messages = [] } = useChatMessages(effectiveThreadId);
  const sendMutation = useSendMessage();

  function handleSend(content: string) {
    if (!selectedId) return;
    sendMutation.mutate({
      threadId: effectiveThreadId ?? AUTO_THREAD_ID,
      employeeId: selectedId,
      content,
    });
  }

  if (!employee) return null;

  return (
    <Sheet open={chatOpen} onOpenChange={setChatOpen}>
      <SheetContent
        side="right"
        className="flex w-[480px] max-w-full flex-col gap-0 p-0 sm:max-w-[480px]"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-200 text-xs font-semibold text-foreground/80">
            {initials(employee.name)}
          </div>
          <div className="min-w-0 flex-1">
            <SheetTitle className="flex items-center gap-2 text-sm font-semibold">
              {employee.name}
              <span className={cn('h-2 w-2 shrink-0 rounded-full', statusColor(displayStatus))} />
            </SheetTitle>
            <p className="truncate text-xs text-muted-foreground">{employee.title}</p>
          </div>
        </div>

        {/* Messages */}
        <MessageList
          messages={messages}
          streamingText={live?.currentStream ?? ''}
          isStreaming={isThinking}
          employeeName={employee.name}
        />

        {/* Composer */}
        <Composer onSend={handleSend} disabled={isThinking || sendMutation.isPending} />
      </SheetContent>
    </Sheet>
  );
}
