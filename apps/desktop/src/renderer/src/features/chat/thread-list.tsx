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

import { SystemAgentBadge } from './system-agent-badge.js';

import { MissionPill } from '@/features/mission/mission-shell.js';
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
        : 'bg-white/10 text-foreground';

  const Icon = kind === 'copilot' ? Sparkles : kind === 'agent' ? Bot : MessageSquare;

  return (
    <button
      key={thread.id}
      type="button"
      onClick={() => onSelect(thread.id)}
      className={cn(
        'mission-chrome-panel flex w-full items-start gap-3 rounded-[20px] border border-white/10 px-4 py-4 text-left transition-all hover:border-white/15 hover:bg-black/20',
        active && 'border-brand/30 bg-brand/10',
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border border-white/10',
          iconBg,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {threadDisplayName(thread, employees)}
          </span>
          <MissionPill className="shrink-0 px-2 py-1 text-[10px]" mono>
            {formatTimestamp(thread.lastMessageAt)}
          </MissionPill>
        </div>
        {kind === 'copilot' && <SystemAgentBadge size="sm" className="mt-2" />}
        {kind === 'agent' && (
          <MissionPill tone="warning" className="mt-2 px-2 py-1 text-[10px]">
            <Bot className="h-2.5 w-2.5" />
            Agent conversation
          </MissionPill>
        )}
        {kind === 'regular' && (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
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
      <h4 className="flex-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {title}
      </h4>
      <MissionPill className="px-2 py-1 text-[10px] tabular-nums" mono>
        {count}
      </MissionPill>
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
        <p className="max-w-sm text-center text-sm leading-6 text-muted-foreground">
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
