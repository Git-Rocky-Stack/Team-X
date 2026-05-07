/**
 * PlannerSection — task-planner guardrail settings.
 *
 * Backs the four `planner_*` settings keys introduced in M32. Read by
 * the write-side agentic tools (`decompose_project`, `delegate_subtask`,
 * `review_deliverable`) at call time so every new plan respects the
 * user's current preference without a restart.
 *
 * Phase 5 — M32 T7.
 */

import {
  PLANNER_APPROVAL_LEVELS,
  PLANNER_SETTINGS_CLAMPS,
  type PlannerApprovalLevel,
  type SettingsGetPlannerResponse,
  type SettingsSetPlannerRequest,
} from '@team-x/shared-types';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Input } from '@/components/ui/input.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { usePlannerSettings, useSetPlanner } from '@/hooks/use-settings.js';

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/** Human-readable labels for approval levels. */
const LEVEL_LABELS: Record<PlannerApprovalLevel, string> = {
  officer: 'Officer (C-suite)',
  'senior-management': 'Senior Management',
  management: 'Management',
  supervisor: 'Supervisor',
  lead: 'Lead',
};

export function PlannerSection() {
  const { data, isLoading, isError } = usePlannerSettings();
  const setPlanner = useSetPlanner();

  const [draft, setDraft] = useState<SettingsGetPlannerResponse | null>(null);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  if (isLoading || !draft) {
    return (
      <section className="space-y-3" aria-busy="true">
        <h2 className="text-h2 text-foreground">Task Planner</h2>
        <Skeleton className="h-48 rounded-lg" />
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section className="space-y-3">
        <h2 className="text-h2 text-foreground">Task Planner</h2>
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-body text-red-400">
          Failed to load task planner settings.
        </div>
      </section>
    );
  }

  function commitNumeric<K extends 'maxTickets' | 'maxDepth' | 'escalationThreshold'>(
    key: K,
    value: number,
  ) {
    if (!draft) return;
    if (draft[key] === value) return;
    setDraft({ ...draft, [key]: value });
    setPlanner.mutate({ [key]: value } as SettingsSetPlannerRequest);
  }

  function commitLevel(level: PlannerApprovalLevel) {
    if (!draft) return;
    if (draft.approvalLevel === level) return;
    setDraft({ ...draft, approvalLevel: level });
    setPlanner.mutate({ approvalLevel: level });
  }

  const { maxTickets, maxDepth, escalationThreshold } = PLANNER_SETTINGS_CLAMPS;

  return (
    <section className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h2 className="text-h2 text-foreground">Task Planner</h2>
        {setPlanner.isPending && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-label="Saving" />
        )}
      </div>

      {/* Description */}
      <p className="text-body-sm text-muted-foreground mt-1">
        Guardrails for the write-side agentic tools that decompose projects into tickets, delegate
        subtasks, and review deliverables. Tighter caps reduce blast radius; wider caps allow larger
        plans.
      </p>

      {/* Knobs */}
      <div className="rounded-lg border border-border bg-surface-50 p-4 space-y-4">
        {/* Max tickets */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="planner-max-tickets" className="text-label text-muted-foreground">
              Max Tickets per Plan
            </label>
            <span className="text-code-sm text-foreground tabular-nums">{draft.maxTickets}</span>
          </div>
          <Input
            id="planner-max-tickets"
            type="number"
            inputMode="numeric"
            min={maxTickets.min}
            max={maxTickets.max}
            step={1}
            value={draft.maxTickets}
            onChange={(e) =>
              setDraft({ ...draft, maxTickets: Number.parseInt(e.target.value, 10) || 0 })
            }
            onBlur={() => {
              const next = clamp(draft.maxTickets, maxTickets.min, maxTickets.max);
              if (next !== draft.maxTickets) setDraft({ ...draft, maxTickets: next });
              commitNumeric('maxTickets', next);
            }}
            disabled={setPlanner.isPending}
            className="h-8 text-code-sm"
          />
          <p className="text-caption text-muted-foreground/70">
            Maximum subtasks emitted per <span className="font-mono">decompose_project</span> call (
            {maxTickets.min}–{maxTickets.max}, default {maxTickets.default}).
          </p>
        </div>

        {/* Max depth */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="planner-max-depth" className="text-label text-muted-foreground">
              Max Nesting Depth
            </label>
            <span className="text-code-sm text-foreground tabular-nums">{draft.maxDepth}</span>
          </div>
          <Input
            id="planner-max-depth"
            type="number"
            inputMode="numeric"
            min={maxDepth.min}
            max={maxDepth.max}
            step={1}
            value={draft.maxDepth}
            onChange={(e) =>
              setDraft({ ...draft, maxDepth: Number.parseInt(e.target.value, 10) || 0 })
            }
            onBlur={() => {
              const next = clamp(draft.maxDepth, maxDepth.min, maxDepth.max);
              if (next !== draft.maxDepth) setDraft({ ...draft, maxDepth: next });
              commitNumeric('maxDepth', next);
            }}
            disabled={setPlanner.isPending}
            className="h-8 text-code-sm"
          />
          <p className="text-caption text-muted-foreground/70">
            Maximum subtask tree depth ({maxDepth.min}–{maxDepth.max}, default {maxDepth.default}).
            Deeper plans produce finer-grained tickets.
          </p>
        </div>

        {/* Approval level */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="planner-approval-level" className="text-label text-muted-foreground">
              Approval Level
            </label>
            <span className="text-code-sm text-foreground">
              {LEVEL_LABELS[draft.approvalLevel]}
            </span>
          </div>
          <select
            id="planner-approval-level"
            value={draft.approvalLevel}
            onChange={(e) => commitLevel(e.target.value as PlannerApprovalLevel)}
            disabled={setPlanner.isPending}
            className="h-8 w-full rounded-md border border-border bg-background px-3 text-code-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {PLANNER_APPROVAL_LEVELS.map((level) => (
              <option key={level} value={level}>
                {LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
          <p className="text-caption text-muted-foreground/70">
            Minimum employee level allowed to run{' '}
            <span className="font-mono">decompose_project</span>. Employees below this level cannot
            create plans.
          </p>
        </div>

        {/* Escalation threshold */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <label
              htmlFor="planner-escalation-threshold"
              className="text-label text-muted-foreground"
            >
              Escalation Threshold
            </label>
            <span className="text-code-sm text-foreground tabular-nums">
              {draft.escalationThreshold}
            </span>
          </div>
          <Input
            id="planner-escalation-threshold"
            type="number"
            inputMode="numeric"
            min={escalationThreshold.min}
            max={escalationThreshold.max}
            step={1}
            value={draft.escalationThreshold}
            onChange={(e) =>
              setDraft({
                ...draft,
                escalationThreshold: Number.parseInt(e.target.value, 10) || 0,
              })
            }
            onBlur={() => {
              const next = clamp(
                draft.escalationThreshold,
                escalationThreshold.min,
                escalationThreshold.max,
              );
              if (next !== draft.escalationThreshold)
                setDraft({ ...draft, escalationThreshold: next });
              commitNumeric('escalationThreshold', next);
            }}
            disabled={setPlanner.isPending}
            className="h-8 text-code-sm"
          />
          <p className="text-caption text-muted-foreground/70">
            Consecutive delegation/review failures before{' '}
            <span className="font-mono">task.escalated</span> fires ({escalationThreshold.min}–
            {escalationThreshold.max}, default {escalationThreshold.default}).
          </p>
        </div>
      </div>

      {/* Save error banner */}
      {setPlanner.isError && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-body text-red-400">
          <span className="min-w-0 truncate">Failed to save: {String(setPlanner.error)}</span>
        </div>
      )}
    </section>
  );
}
