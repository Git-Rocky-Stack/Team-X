/**
 * StepCard — render a single agentic-loop step in the command
 * palette's step-log mode (Phase 5 — M31 T6).
 *
 * Each step payload the `AgenticLoopService` emits onto the dashboard
 * event bus becomes one card. The card renders differently per
 * `kind`:
 *
 *   - `plan`        prose — the model's reasoning narration before a
 *                   tool call.
 *   - `tool_call`   collapsible JSON — tool name + args. Collapsed by
 *                   default so the step list stays scannable; args can
 *                   be verbose (e.g. the full text of a SQL query).
 *   - `tool_result` collapsible JSON — tool name + result. Collapsed
 *                   by default; the user opens it only when they want
 *                   to see the raw envelope the loop saw.
 *   - `answer`      prose — the model's final grounded answer. Styled
 *                   with a brand-tinted border so it visually
 *                   terminates the log.
 *   - `error`       red-bordered panel with reason + message. The
 *                   loop writes this when a tool blew up or the loop
 *                   hit a budget cap with no partial answer.
 *
 * Global UI standards (six states per CLAUDE.md):
 *
 *   - hover:    card lifts 1px + shadow deepens.
 *   - focus:    visible 2px brand ring (keyboard nav through the
 *               step list uses ArrowUp/Down — see `command-palette`).
 *   - loading:  when `isLoading` is true (only the placeholder "next
 *               step" card; real steps never render loading).
 *   - error:    red border on `kind: 'error'` cards and a red dot
 *               in the header to break scan.
 *   - empty:    handled by the palette's empty-state placeholder,
 *               not here — this component always renders one step.
 *   - disabled: `isDimmed` prop fades to 60% opacity after the run
 *               reaches a terminal state so the transcript reads as
 *               a frozen log, not an active process.
 *
 * Accessibility: the collapsible disclosure uses native `<details>`
 * so screen readers announce the expanded/collapsed state without
 * any ARIA gymnastics. The card itself has `tabIndex={0}` so keyboard
 * users can move focus into it and then Tab into the disclosure.
 *
 * Not a view-only primitive: consumers pass the raw `AgentStepPayload`
 * and the card extracts the kind-specific shape via a safe narrow.
 * Keeping the cast local to this component means the palette never
 * has to reason about `data: unknown`.
 */

import { AlertTriangle, Brain, Check, GitBranch, Wrench } from 'lucide-react';

import type { AgentStepPayload } from '@team-x/shared-types';

import { cn } from '@/lib/utils.js';

// ---------------------------------------------------------------------------
// Narrow helpers
// ---------------------------------------------------------------------------

interface PlanData {
  text: string;
}

interface ToolCallData {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

interface ToolResultData {
  toolCallId: string;
  toolName: string;
  result: unknown;
}

interface AnswerData {
  text: string;
}

interface ErrorData {
  reason: string;
  message: string;
}

function narrowPlan(data: unknown): PlanData {
  const d = data as Partial<PlanData> | undefined;
  return { text: typeof d?.text === 'string' ? d.text : '' };
}

function narrowToolCall(data: unknown): ToolCallData {
  const d = data as Partial<ToolCallData> | undefined;
  return {
    toolCallId: typeof d?.toolCallId === 'string' ? d.toolCallId : '',
    toolName: typeof d?.toolName === 'string' ? d.toolName : 'unknown',
    args: (d?.args as Record<string, unknown>) ?? {},
  };
}

function narrowToolResult(data: unknown): ToolResultData {
  const d = data as Partial<ToolResultData> | undefined;
  return {
    toolCallId: typeof d?.toolCallId === 'string' ? d.toolCallId : '',
    toolName: typeof d?.toolName === 'string' ? d.toolName : 'unknown',
    result: d?.result,
  };
}

function narrowAnswer(data: unknown): AnswerData {
  const d = data as Partial<AnswerData> | undefined;
  return { text: typeof d?.text === 'string' ? d.text : '' };
}

function narrowError(data: unknown): ErrorData {
  const d = data as Partial<ErrorData> | undefined;
  return {
    reason: typeof d?.reason === 'string' ? d.reason : 'unknown',
    message: typeof d?.message === 'string' ? d.message : '',
  };
}

/**
 * Stable JSON pretty-print with 2-space indent. If the value is not
 * JSON-serializable (shouldn't happen — the loop enforces JSON-safe
 * projections in `agentic-tools.ts`), fall back to `String(...)` so
 * the card still renders something rather than crashing.
 */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export interface StepCardProps {
  step: AgentStepPayload;
  /**
   * Fade the card to 60% opacity. The palette sets this after the
   * terminal event arrives so the transcript reads as a frozen log.
   */
  isDimmed?: boolean;
  /**
   * Start the tool_call / tool_result disclosure open. Only relevant
   * for those two kinds; ignored for plan / answer / error.
   */
  defaultOpen?: boolean;
  /** Optional extra classes for consumer-site spacing (list gap etc). */
  className?: string;
}

export function StepCard({
  step,
  isDimmed = false,
  defaultOpen = false,
  className,
}: StepCardProps) {
  const base = cn(
    // Layout
    'group relative rounded-md border border-border bg-surface-50 p-3 transition-all',
    // Hover lift (six states: hover)
    'hover:-translate-y-px hover:border-brand/40 hover:bg-surface-100 hover:shadow-md',
    // Focus ring (six states: focus)
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-0',
    // Disabled / dimmed (six states: disabled)
    isDimmed && 'opacity-60',
    className,
  );

  // Kind-specific render
  switch (step.kind) {
    case 'plan': {
      const d = narrowPlan(step.data);
      return (
        <article
          tabIndex={-1}
          aria-label={`Step ${step.stepIndex + 1}: planning`}
          className={base}
          data-step-kind="plan"
        >
          <StepHeader
            icon={<Brain className="h-3.5 w-3.5" aria-hidden="true" />}
            label="Planning"
            index={step.stepIndex}
          />
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {d.text}
          </p>
        </article>
      );
    }

    case 'tool_call': {
      const d = narrowToolCall(step.data);
      return (
        <article
          tabIndex={-1}
          aria-label={`Step ${step.stepIndex + 1}: calling tool ${d.toolName}`}
          className={base}
          data-step-kind="tool_call"
        >
          <StepHeader
            icon={<Wrench className="h-3.5 w-3.5" aria-hidden="true" />}
            label="Tool call"
            index={step.stepIndex}
            detail={<code className="font-mono text-xs text-brand">{d.toolName}</code>}
          />
          <details className="mt-1.5" open={defaultOpen}>
            <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-0">
              Arguments
            </summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded bg-surface-200 p-2 font-mono text-[11px] leading-relaxed text-foreground">
              {safeStringify(d.args)}
            </pre>
          </details>
        </article>
      );
    }

    case 'tool_result': {
      const d = narrowToolResult(step.data);
      return (
        <article
          tabIndex={-1}
          aria-label={`Step ${step.stepIndex + 1}: result from ${d.toolName}`}
          className={base}
          data-step-kind="tool_result"
        >
          <StepHeader
            icon={<Check className="h-3.5 w-3.5" aria-hidden="true" />}
            label="Tool result"
            index={step.stepIndex}
            detail={<code className="font-mono text-xs text-brand">{d.toolName}</code>}
          />
          <details className="mt-1.5" open={defaultOpen}>
            <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-0">
              Observation
            </summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded bg-surface-200 p-2 font-mono text-[11px] leading-relaxed text-foreground">
              {safeStringify(d.result)}
            </pre>
          </details>
        </article>
      );
    }

    case 'answer': {
      const d = narrowAnswer(step.data);
      return (
        <article
          tabIndex={-1}
          aria-label={`Step ${step.stepIndex + 1}: answer`}
          className={cn(base, 'border-brand/40 bg-brand/5')}
          data-step-kind="answer"
        >
          <StepHeader
            icon={<Check className="h-3.5 w-3.5 text-brand" aria-hidden="true" />}
            label="Answer"
            index={step.stepIndex}
            labelClassName="text-brand"
          />
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {d.text}
          </p>
        </article>
      );
    }

    case 'error': {
      const d = narrowError(step.data);
      return (
        <article
          tabIndex={-1}
          aria-label={`Step ${step.stepIndex + 1}: error`}
          className={cn(base, 'border-red-500/60 bg-red-500/5 hover:border-red-500')}
          data-step-kind="error"
        >
          <StepHeader
            icon={<AlertTriangle className="h-3.5 w-3.5 text-red-400" aria-hidden="true" />}
            label="Error"
            index={step.stepIndex}
            labelClassName="text-red-400"
            detail={<code className="font-mono text-xs text-red-400">{d.reason}</code>}
          />
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {d.message}
          </p>
        </article>
      );
    }

    case 'ticket_created': {
      return (
        <article
          tabIndex={-1}
          aria-label={`Step ${step.stepIndex + 1}: ticket created`}
          className={cn(base, 'border-emerald-500/60 bg-emerald-500/5 hover:border-emerald-500')}
          data-step-kind="ticket_created"
        >
          <StepHeader
            icon={<Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />}
            label="Ticket Created"
            index={step.stepIndex}
            labelClassName="text-emerald-400"
          />
        </article>
      );
    }

    case 'delegation_made': {
      return (
        <article
          tabIndex={-1}
          aria-label={`Step ${step.stepIndex + 1}: delegation made`}
          className={cn(base, 'border-sky-500/60 bg-sky-500/5 hover:border-sky-500')}
          data-step-kind="delegation_made"
        >
          <StepHeader
            icon={<GitBranch className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />}
            label="Delegation"
            index={step.stepIndex}
            labelClassName="text-sky-400"
          />
        </article>
      );
    }

    case 'review_pending': {
      return (
        <article
          tabIndex={-1}
          aria-label={`Step ${step.stepIndex + 1}: review pending`}
          className={cn(base, 'border-amber-500/60 bg-amber-500/5 hover:border-amber-500')}
          data-step-kind="review_pending"
        >
          <StepHeader
            icon={<Brain className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />}
            label="Review Pending"
            index={step.stepIndex}
            labelClassName="text-amber-400"
          />
        </article>
      );
    }

    default: {
      const _exhaust: never = step.kind;
      void _exhaust;
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Header subcomponent
// ---------------------------------------------------------------------------

interface StepHeaderProps {
  icon: React.ReactNode;
  label: string;
  index: number;
  detail?: React.ReactNode;
  labelClassName?: string;
}

function StepHeader({ icon, label, index, detail, labelClassName }: StepHeaderProps) {
  return (
    <header className="flex items-center gap-2 text-xs">
      <span
        aria-hidden="true"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-200 text-muted-foreground"
      >
        {icon}
      </span>
      <span
        className={cn(
          'font-medium uppercase tracking-wide',
          labelClassName ?? 'text-muted-foreground',
        )}
      >
        {label}
      </span>
      {detail ? <span className="truncate">{detail}</span> : null}
      <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
        #{String(index + 1).padStart(2, '0')}
      </span>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton — rendered only when the palette is waiting for
// the first step after an execute. After step[0] arrives the palette
// switches to real StepCards. Kept inline here so consumers import a
// single module for the entire step-log surface.
// ---------------------------------------------------------------------------

export function StepCardSkeleton({ className }: { className?: string }) {
  return (
    <output
      aria-live="polite"
      aria-label="Thinking"
      className={cn('block rounded-md border border-border bg-surface-50 p-3', className)}
    >
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 animate-pulse rounded-full bg-surface-200" />
        <div className="h-3 w-24 animate-pulse rounded bg-surface-200" />
      </div>
      <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-surface-200" />
      <div className="mt-1.5 h-3 w-3/5 animate-pulse rounded bg-surface-200" />
    </output>
  );
}
