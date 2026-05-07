/**
 * SystemAgentBadge — compact "Copilot" pill used to mark threads and
 * messages that belong to the M31 system pseudo-employee. Applied in
 * two places:
 *
 *   - `ThreadList`: next to the thread name inside the "Copilot
 *     Conversations" section header and row, so the user can tell at
 *     a glance which threads are agentic-loop runs versus ordinary
 *     employee DMs.
 *   - `ChatDrawer`: inside the detail header when the active thread's
 *     `isSystemAgent` flag is true, replacing the employee avatar block
 *     and signalling the read-only step-transcript layout.
 *
 * Visual grammar mirrors `agent-conversation` amber pill in
 * `ThreadList` but uses the brand-red accent + Sparkles icon so system
 * threads stay distinct from employee-to-employee agent threads.
 *
 * Phase 5 — M31 T5.
 */

import { Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils.js';

interface SystemAgentBadgeProps {
  /** Optional size variant — `sm` is used inline in lists, `md` in the drawer header. */
  size?: 'sm' | 'md';
  /** Optional extra classes for consumer-site spacing. */
  className?: string;
}

export function SystemAgentBadge({ size = 'sm', className }: SystemAgentBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-brand/15 font-medium text-brand',
        size === 'sm' ? 'px-1.5 py-0.5 text-eyebrow-sm' : 'px-2 py-1 text-caption',
        className,
      )}
      aria-label="Copilot conversation"
    >
      <Sparkles className={cn(size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3')} aria-hidden="true" />
      Copilot
    </span>
  );
}
