/**
 * Thread list panel — renders inside the chat drawer when the user
 * toggles to the "Threads" view. Shows all threads for the active
 * company, split into three sections rendered top-down:
 *
 *   1. **Copilot Conversations** (M31) — system-agent threads where
 *      the user has run a `complex_request` through the agentic loop.
 *      Marked by the `isSystemAgent` flag from `chat.listThreads` and
 *      rendered with the brand-red Sparkles Copilot badge.
 *   2. **Agent conversations** — employee-to-employee threads with no
 *      human user. Amber Bot icon + "Agent conversation" pill (existing).
 *   3. **Threads** — everything else: user↔employee DMs, group chats,
 *      meeting and ticket threads.
 *
 * Sorting within each section follows the server-side ordering from
 * `chat.listThreads` (lastMessageAt desc).
 */

import type { Employee, Thread } from '@team-x/shared-types';

import { Bot, MessageSquare, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils.js';

import { SystemAgentBadge } from './system-agent-badge.js';

/** True when every member in the thread is an employee (no human user). */
export function isAgentThread(thread: Thread): boolean {
  return thread.members.length > 0 && thread.members.every((m) => m.memberKind === 'employee');
}

/**
 * True when the thread is a user↔system-pseudo-employee agentic-loop
 * thread. Prefers the server-computed `isSystemAgent` flag when
 * present; returns false for threads returned from legacy endpoints
 * that pre-date M31.
 */
export function isCopilotThread(thread: Thread): boolean {
  return thread.isSystemAgent === true;
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

type ThreadKind = 'copilot' | 'agent' | 'regular';

function classify(thread: Thread): ThreadKind {
  if (isCopilotThread(thread)) return 'copilot';
  if (isAgentThread(thread)) return 'agent';
  return 'regular';
}

interface ThreadRowProps {
  thread: Thread;
  employees: Employee[];
  active: boolean;
  kind: ThreadKind;
  onSelect: (threadId: string) => void;
}

function ThreadRow({ thread, employees, active, kind, onSelect }: ThreadRowProps) {
  const iconBg =
    kind === 'copilot'
      ? 'bg-brand/15 text-brand'
      : kind === 'agent'
        ? 'bg-amber-500/15 text-amber-500'
        : 'bg-brand/15 text-brand';

  const Icon = kind === 'copilot' ? Sparkles : kind === 'agent' ? Bot : MessageSquare;

  return (
    <button
      key={thread.id}
      type="button"
      onClick={() => onSelect(thread.id)}
      className={cn(
        'flex w-full items-start gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors hover:bg-surface-100',
        active && 'bg-surface-100',
      )}
    >
      {/* Kind icon */}
      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', iconBg)}>
        <Icon className="h-4 w-4" />
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
        {kind === 'copilot' && <SystemAgentBadge size="sm" className="mt-0.5" />}
        {kind === 'agent' && (
          <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
            <Bot className="h-2.5 w-2.5" />
            Agent conversation
          </span>
        )}
      </div>
    </button>
  );
}

interface SectionHeaderProps {
  title: string;
  count: number;
}

function SectionHeader({ title, count }: SectionHeaderProps) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface-50/95 px-4 py-2 backdrop-blur-sm">
      <h4 className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <span className="rounded-full bg-surface-100 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
        {count}
      </span>
    </div>
  );
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

  const copilot: Thread[] = [];
  const agent: Thread[] = [];
  const regular: Thread[] = [];
  for (const t of threads) {
    const kind = classify(t);
    if (kind === 'copilot') copilot.push(t);
    else if (kind === 'agent') agent.push(t);
    else regular.push(t);
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      {copilot.length > 0 && (
        <section aria-label="Copilot Conversations">
          <SectionHeader title="Copilot Conversations" count={copilot.length} />
          {copilot.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              employees={employees}
              active={thread.id === activeThreadId}
              kind="copilot"
              onSelect={onSelectThread}
            />
          ))}
        </section>
      )}

      {agent.length > 0 && (
        <section aria-label="Agent Conversations">
          <SectionHeader title="Agent Conversations" count={agent.length} />
          {agent.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              employees={employees}
              active={thread.id === activeThreadId}
              kind="agent"
              onSelect={onSelectThread}
            />
          ))}
        </section>
      )}

      {regular.length > 0 && (
        <section aria-label="Conversations">
          <SectionHeader title="Conversations" count={regular.length} />
          {regular.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              employees={employees}
              active={thread.id === activeThreadId}
              kind="regular"
              onSelect={onSelectThread}
            />
          ))}
        </section>
      )}
    </div>
  );
}
