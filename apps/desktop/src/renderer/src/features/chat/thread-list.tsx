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
import { Bot, MessageSquare, Sparkles, TicketCheck } from 'lucide-react';

import { SystemAgentBadge } from './system-agent-badge.js';

import { Tag } from '@/components/console/index.js';
import { cn } from '@/lib/utils.js';

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

type ThreadKind = 'copilot' | 'agent' | 'ticket' | 'regular';

function classify(thread: Thread): ThreadKind {
  if (isCopilotThread(thread)) return 'copilot';
  if (thread.kind === 'ticket') return 'ticket';
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
      ? 'bg-[var(--armed-soft)] text-[var(--armed-lit)]'
      : kind === 'ticket'
        ? 'bg-[var(--armed-soft)] text-[var(--armed-lit)]'
        : kind === 'agent'
          ? 'text-led-hold'
          : 'text-silver-mute';

  const Icon =
    kind === 'copilot'
      ? Sparkles
      : kind === 'ticket'
        ? TicketCheck
        : kind === 'agent'
          ? Bot
          : MessageSquare;

  return (
    <button
      key={thread.id}
      type="button"
      onClick={() => onSelect(thread.id)}
      className={cn(
        'flex w-full items-start gap-3 rounded-card border border-[var(--hairline)] px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--hairline-strong)]',
        active && 'border-[var(--armed-edge)] bg-[var(--armed-soft)]',
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-card border border-[var(--hairline)]',
          iconBg,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-body-strong text-foreground">
            {threadDisplayName(thread, employees)}
          </span>
          <Tag mono className="shrink-0">
            {formatTimestamp(thread.lastMessageAt)}
          </Tag>
        </div>
        {kind === 'copilot' && <SystemAgentBadge size="sm" className="mt-2" />}
        {kind === 'agent' && (
          <Tag className="mt-2 gap-1">
            <Bot className="h-2.5 w-2.5" />
            Agent conversation
          </Tag>
        )}
        {kind === 'ticket' && (
          <Tag className="mt-2 gap-1">
            <TicketCheck className="h-2.5 w-2.5" />
            Ticket thread
          </Tag>
        )}
        {kind === 'regular' && (
          <p className="mt-2 text-caption text-silver-mute">
            Direct thread ready to open in the communication drawer.
          </p>
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
    <div className="flex items-center gap-2 px-1 pb-1">
      <h4 className="flex-1 text-eyebrow-sm text-silver-mute">{title}</h4>
      <Tag mono className="tabular-nums">
        {count}
      </Tag>
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
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <p className="max-w-sm text-center text-body text-muted-foreground">
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
    <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
      {copilot.length > 0 && (
        <section aria-label="Copilot Conversations" className="mb-4 space-y-3 last:mb-0">
          <SectionHeader title="Copilot Conversations" count={copilot.length} />
          <div className="space-y-2">
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
          </div>
        </section>
      )}

      {agent.length > 0 && (
        <section aria-label="Agent Conversations" className="mb-4 space-y-3 last:mb-0">
          <SectionHeader title="Agent Conversations" count={agent.length} />
          <div className="space-y-2">
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
          </div>
        </section>
      )}

      {regular.length > 0 && (
        <section aria-label="Conversations" className="space-y-3">
          <SectionHeader title="Conversations" count={regular.length} />
          <div className="space-y-2">
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
          </div>
        </section>
      )}
    </div>
  );
}
