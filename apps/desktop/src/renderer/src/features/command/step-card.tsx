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

import type { AgentStepPayload } from '@team-x/shared-types';
import {
  AlertTriangle,
  Brain,
  Check,
  ClipboardCheck,
  GitBranch,
  Ticket,
  Wrench,
} from 'lucide-react';

import {
  narrowDelegationMade,
  narrowReviewPending,
  narrowTicketCreated,
} from './step-card-narrow.js';

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

// Write-side narrow helpers — extracted to step-card-narrow.ts for
// testability without renderer deps (Phase 5 — M32 T6).

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
    // Layout — cards sit INSIDE the display-dark transcript well, so
    // carbon literals are correct here (part of the display, not the shift surface).
    'group relative rounded-control border border-[var(--hairline)] bg-[var(--carbon-850)] p-3 transition-all',
    // Hover lift (six states: hover)
    'hover:-translate-y-px hover:border-[var(--armed-edge)] hover:bg-[var(--carbon-800)] hover:shadow-md',
    // Focus ring (six states: focus)
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0',
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
          <p className="mt-1.5 whitespace-pre-wrap text-body text-foreground">{d.text}</p>
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
            detail={<code className="text-code-sm text-primary">{d.toolName}</code>}
          />
          <details className="mt-1.5" open={defaultOpen}>
            <summary className="cursor-pointer select-none text-caption text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0">
              Arguments
            </summary>
            <pre className="well mt-1 max-h-48 overflow-auto rounded-card p-2 text-code-sm leading-relaxed text-[var(--display-fg)]">
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
            detail={<code className="text-code-sm text-primary">{d.toolName}</code>}
          />
          <details className="mt-1.5" open={defaultOpen}>
            <summary className="cursor-pointer select-none text-caption text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0">
              Observation
            </summary>
            <pre className="well mt-1 max-h-48 overflow-auto rounded-card p-2 text-code-sm leading-relaxed text-[var(--display-fg)]">
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
          className={cn(base, 'border-[var(--armed-edge)] bg-[var(--armed-soft)]')}
          data-step-kind="answer"
        >
          <StepHeader
            icon={<Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />}
            label="Answer"
            index={step.stepIndex}
            labelClassName="text-primary"
          />
          <p className="mt-1.5 whitespace-pre-wrap text-body text-foreground">{d.text}</p>
        </article>
      );
    }

    case 'error': {
      const d = narrowError(step.data);
      return (
        <article
          tabIndex={-1}
          aria-label={`Step ${step.stepIndex + 1}: error`}
          className={cn(
            base,
            'border-[var(--led-warn-edge)] bg-[var(--warn-soft)] hover:border-[var(--led-warn)]',
          )}
          data-step-kind="error"
        >
          <StepHeader
            icon={<AlertTriangle className="h-3.5 w-3.5 text-led-warn" aria-hidden="true" />}
            label="Error"
            index={step.stepIndex}
            labelClassName="text-led-warn"
            detail={<code className="text-code-sm text-led-warn">{d.reason}</code>}
          />
          <p className="mt-1.5 whitespace-pre-wrap text-body text-foreground">{d.message}</p>
        </article>
      );
    }

    case 'ticket_created': {
      const d = narrowTicketCreated(step.data);
      return (
        <article
          tabIndex={-1}
          aria-label={`Step ${step.stepIndex + 1}: ticket created — ${d.title || 'untitled'}`}
          className={cn(base, 'border-[var(--led-go-edge)] bg-led-go/5 hover:border-led-go')}
          data-step-kind="ticket_created"
        >
          <StepHeader
            icon={<Ticket className="h-3.5 w-3.5 text-led-go" aria-hidden="true" />}
            label="Ticket Created"
            index={step.stepIndex}
            labelClassName="text-led-go"
            detail={
              d.ticketId ? (
                <code className="text-code-sm text-led-go/80">{d.ticketId.slice(0, 8)}</code>
              ) : undefined
            }
          />
          {d.title && <p className="mt-1.5 text-body text-foreground">{d.title}</p>}
          {d.assigneeId && (
            <p className="mt-1 text-caption text-muted-foreground">
              Assigned to <span className="text-led-go">{d.assigneeId.slice(0, 8)}</span>
              {d.planId ? (
                <span className="ml-2 text-muted-foreground">Plan {d.planId.slice(0, 8)}</span>
              ) : null}
            </p>
          )}
        </article>
      );
    }

    case 'delegation_made': {
      const d = narrowDelegationMade(step.data);
      return (
        <article
          tabIndex={-1}
          aria-label={`Step ${step.stepIndex + 1}: delegated to ${d.assigneeName || 'unknown'}`}
          className={cn(
            base,
            'border-[var(--led-scope-edge)] bg-led-scope/5 hover:border-led-scope',
          )}
          data-step-kind="delegation_made"
        >
          <StepHeader
            icon={<GitBranch className="h-3.5 w-3.5 text-led-scope" aria-hidden="true" />}
            label="Delegation"
            index={step.stepIndex}
            labelClassName="text-led-scope"
            detail={
              d.ticketId ? (
                <code className="text-code-sm text-led-scope/80">{d.ticketId.slice(0, 8)}</code>
              ) : undefined
            }
          />
          <p className="mt-1.5 text-body text-foreground">
            {d.assigneeName ? (
              <>
                Delegated to <span className="font-medium text-led-scope">{d.assigneeName}</span>
              </>
            ) : (
              'Subtask delegated'
            )}
          </p>
          {d.planId && (
            <p className="mt-1 text-caption text-muted-foreground">
              Plan <span className="text-muted-foreground">{d.planId.slice(0, 8)}</span>
            </p>
          )}
        </article>
      );
    }

    case 'review_pending': {
      const d = narrowReviewPending(step.data);
      const outcomeColor =
        d.outcome === 'approve'
          ? 'text-led-go'
          : d.outcome === 'reject'
            ? 'text-led-warn'
            : 'text-led-hold';
      return (
        <article
          tabIndex={-1}
          aria-label={`Step ${step.stepIndex + 1}: review ${d.outcome || 'pending'}`}
          className={cn(base, 'border-[var(--led-hold-edge)] bg-led-hold/5 hover:border-led-hold')}
          data-step-kind="review_pending"
        >
          <StepHeader
            icon={<ClipboardCheck className="h-3.5 w-3.5 text-led-hold" aria-hidden="true" />}
            label="Review"
            index={step.stepIndex}
            labelClassName="text-led-hold"
            detail={
              d.outcome ? (
                <span className={`text-caption font-medium ${outcomeColor}`}>{d.outcome}</span>
              ) : undefined
            }
          />
          <p className="mt-1.5 text-body text-foreground">
            {d.ticketId ? (
              <>
                Ticket{' '}
                <code className="text-code-sm text-led-hold/80">{d.ticketId.slice(0, 8)}</code>{' '}
                under review
              </>
            ) : (
              'Deliverable under review'
            )}
          </p>
          {(d.reviewerId || d.planId) && (
            <p className="mt-1 text-caption text-muted-foreground">
              {d.reviewerId && (
                <span>
                  Reviewer <span className="text-muted-foreground">{d.reviewerId.slice(0, 8)}</span>
                </span>
              )}
              {d.reviewerId && d.planId && <span className="mx-1">·</span>}
              {d.planId && (
                <span>
                  Plan <span className="text-muted-foreground">{d.planId.slice(0, 8)}</span>
                </span>
              )}
            </p>
          )}
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
    <header className="flex items-center gap-2 text-caption">
      <span
        aria-hidden="true"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--carbon-800)] text-muted-foreground"
      >
        {icon}
      </span>
      <span className={cn('text-eyebrow', labelClassName ?? 'text-muted-foreground')}>{label}</span>
      {detail ? <span className="truncate">{detail}</span> : null}
      <span className="ml-auto shrink-0 text-eyebrow-sm tabular-nums text-muted-foreground">
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
      className={cn(
        'block rounded-control border border-[var(--hairline)] bg-[var(--carbon-850)] p-3',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 animate-pulse rounded-full bg-[var(--carbon-800)]" />
        <div className="h-3 w-24 animate-pulse rounded bg-[var(--carbon-800)]" />
      </div>
      <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-[var(--carbon-800)]" />
      <div className="mt-1.5 h-3 w-3/5 animate-pulse rounded bg-[var(--carbon-800)]" />
    </output>
  );
}
