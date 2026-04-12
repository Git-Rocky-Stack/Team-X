/**
 * Thread list panel — renders inside the chat drawer when the user
 * toggles to the "Threads" view. Shows all threads for the active
 * company: user↔employee DMs, employee↔employee agent conversations,
 * and (eventually) group/meeting/ticket threads.
 *
 * Agent-to-agent threads get a distinctive amber bot icon and badge
 * so the user can immediately identify them. Threads are sorted by
 * `lastMessageAt` descending (most recent first), matching the order
 * returned by `chat.listThreads`.
 */

import type { Employee, Thread } from '@team-x/shared-types';

import { Bot, MessageSquare } from 'lucide-react';

import { cn } from '@/lib/utils.js';

/** True when every member in the thread is an employee (no human user). */
export function isAgentThread(thread: Thread): boolean {
  return thread.members.length > 0 && thread.members.every((m) => m.memberKind === 'employee');
}

function threadDisplayName(thread: Thread, employees: Employee[]): string {
  if (thread.subject) return thread.subject;
  return thread.members
    .map((m) => employees.find((e) => e.id === m.memberId)?.name ?? m.memberId.slice(0, 8))
    .join(' & ');
}

function formatTimestamp(ts: number | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

interface ThreadListProps {
  threads: Thread[];
  employees: Employee[];
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
}

export function ThreadList({
  threads,
  employees,
  activeThreadId,
  onSelectThread,
}: ThreadListProps) {
  if (threads.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <p className="text-center text-xs text-muted-foreground">
          No threads yet. Start a conversation with an employee.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      {threads.map((thread) => {
        const agent = isAgentThread(thread);
        const active = thread.id === activeThreadId;
        return (
          <button
            key={thread.id}
            type="button"
            onClick={() => onSelectThread(thread.id)}
            className={cn(
              'flex w-full items-start gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors hover:bg-surface-100',
              active && 'bg-surface-100',
            )}
          >
            {/* Kind icon */}
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                agent ? 'bg-amber-500/15 text-amber-500' : 'bg-brand/15 text-brand',
              )}
            >
              {agent ? <Bot className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {threadDisplayName(thread, employees)}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {formatTimestamp(thread.lastMessageAt)}
                </span>
              </div>
              {agent && (
                <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
                  <Bot className="h-2.5 w-2.5" />
                  Agent conversation
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
