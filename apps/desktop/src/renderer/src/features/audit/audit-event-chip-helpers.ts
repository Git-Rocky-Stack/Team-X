/**
 * Pure-helper surface for the audit-event-chip (Phase 5 — M35 T3).
 *
 * Split out of `audit-event-chip.tsx` so unit tests can exercise the
 * colour map / label map / aria-label helper / payload-aware row
 * summary formatter without pulling in the `Badge` component's
 * transitive `@/`-aliased imports (vitest does not resolve the
 * bundler alias; the existing convention — see
 * `step-card-narrow.ts` + `step-card.tsx` — is to keep pure helpers
 * and the React component in separate files).
 *
 * Zero React, zero DOM, zero Badge, zero `@/` aliases. One
 * cross-feature import of `intentLabel` from the command intent
 * labels module via a relative path so `command.executed` row
 * summaries render the same label as the palette.
 *
 * Invariants (also pinned by `audit-event-chip.test.tsx`):
 *   - `buildRowSummary` returns `null` for non-summarizable types.
 *   - All summaries are clamped to `ROW_SUMMARY_MAX_CHARS` (140).
 *   - Semantic colour is always paired with a visible text label
 *     (WCAG 1.4.1 Use of Color).
 *   - `aria-label` always carries the literal event-type name.
 */

import { intentLabel } from '../command/intent-labels.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Hard cap on the row-summary string (acceptance bullet #2 invariant).
 * 140 matches Twitter's legacy cap, comfortably fits one flex line on a
 * 13" 1280px laptop viewport, and stays short enough to be readable in
 * the collapsed audit row without truncation mid-phrase.
 */
export const ROW_SUMMARY_MAX_CHARS = 140;

/** Event type → semantic Tailwind color class. */
export const EVENT_TYPE_COLORS: Record<string, string> = {
  // Phase 1–4 events (pre-M30)
  'employee.hired': 'bg-green-600/20 text-green-400',
  'employee.fired': 'bg-red-600/20 text-red-400',
  'employee.promoted': 'bg-blue-600/20 text-blue-400',
  'ticket.created': 'bg-cyan-600/20 text-cyan-400',
  'ticket.assigned': 'bg-yellow-600/20 text-yellow-400',
  'ticket.closed': 'bg-emerald-600/20 text-emerald-400',
  'meeting.started': 'bg-purple-600/20 text-purple-400',
  'meeting.ended': 'bg-purple-600/20 text-purple-400',
  'mcp.added': 'bg-orange-600/20 text-orange-400',
  'mcp.removed': 'bg-orange-600/20 text-orange-400',
  'mcp.toggled': 'bg-orange-600/20 text-orange-400',
  'extension.installed': 'bg-emerald-600/20 text-emerald-400',
  'skill.assignmentUpdated': 'bg-sky-600/20 text-sky-400',
  'authority.grant.created': 'bg-emerald-600/20 text-emerald-400',
  'authority.grant.deleted': 'bg-rose-600/20 text-rose-400',
  'authority.request.reviewed': 'bg-amber-600/20 text-amber-400',
  'authority.violation': 'bg-rose-600/20 text-rose-400',
  'approval.reviewed': 'bg-amber-600/20 text-amber-400',
  'chat.sent': 'bg-slate-600/20 text-slate-400',
  'backup.created': 'bg-indigo-600/20 text-indigo-400',
  'backup.restored': 'bg-indigo-600/20 text-indigo-400',
  'vault.uploaded': 'bg-teal-600/20 text-teal-400',
  'vault.deleted': 'bg-teal-600/20 text-teal-400',
  'work.started': 'bg-sky-600/20 text-sky-400',
  'work.completed': 'bg-sky-600/20 text-sky-400',
  'work.failed': 'bg-red-600/20 text-red-400',
  'token.delta': 'bg-gray-600/20 text-gray-400',

  // M30 (NLU + palette)
  'command.executed': 'bg-brand/15 text-brand',

  // M32 T6 (write-side planner — frozen)
  'plan.proposed': 'bg-violet-600/20 text-violet-400',
  'plan.approved': 'bg-violet-600/20 text-violet-400',
  'task.delegated': 'bg-sky-600/20 text-sky-400',
  'task.escalated': 'bg-rose-600/20 text-rose-400',
  'review.requested': 'bg-amber-600/20 text-amber-400',
  'review.completed': 'bg-amber-600/20 text-amber-400',

  // M28/M29 (RAG) — aspirational per CLAUDE.md bus-event table; chip
  // lands defensively so audit rows surface correctly the moment the
  // events start firing from the indexer.
  'rag.index.indexed': 'bg-blue-600/20 text-blue-400',
  'rag.index.reindexed': 'bg-blue-600/20 text-blue-400',
  'rag.index.removed': 'bg-gray-600/20 text-gray-400',

  // M31 (agentic loop)
  'agent.step': 'bg-sky-600/20 text-sky-400',
  'agentic.completed': 'bg-emerald-600/20 text-emerald-400',
  'agentic.failed': 'bg-rose-600/20 text-rose-400',

  // M33 (copilot service)
  'copilot.analyzed': 'bg-blue-600/20 text-blue-400',
  'copilot.insight': 'bg-amber-600/20 text-amber-400',
  'copilot.dismissed': 'bg-gray-600/20 text-gray-400',
  'copilot.expired': 'bg-gray-600/20 text-gray-400',
};

/** Hand-tuned display labels where the auto-title-cased fallback reads
 * awkwardly ("Rag Index Indexed" → "RAG Indexed"). Keep this list tight. */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  'mcp.added': 'MCP Added',
  'mcp.removed': 'MCP Removed',
  'mcp.toggled': 'MCP Toggled',
  'extension.installed': 'Extension Installed',
  'skill.assignmentUpdated': 'Skill Assignment',
  'authority.grant.created': 'Authority Grant Added',
  'authority.grant.deleted': 'Authority Grant Removed',
  'authority.request.reviewed': 'Authority Review',
  'authority.violation': 'Authority Violation',
  'approval.reviewed': 'Approval Review',
  'command.executed': 'Command',
  'plan.proposed': 'Plan Proposed',
  'plan.approved': 'Plan Approved',
  'task.delegated': 'Task Delegated',
  'task.escalated': 'Task Escalated',
  'review.requested': 'Review Requested',
  'review.completed': 'Review Completed',
  'rag.index.indexed': 'RAG Indexed',
  'rag.index.reindexed': 'RAG Reindexed',
  'rag.index.removed': 'RAG Removed',
  'agent.step': 'Agent Step',
  'agentic.completed': 'Agentic Done',
  'agentic.failed': 'Agentic Failed',
  'copilot.analyzed': 'Copilot Analyzed',
  'copilot.insight': 'Copilot Insight',
  'copilot.dismissed': 'Copilot Dismissed',
  'copilot.expired': 'Copilot Expired',
};

/** Fallback color class when an event type is not in the map. */
export const DEFAULT_COLOR = 'bg-zinc-600/20 text-zinc-400';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Returns the color class for a given event type, or `DEFAULT_COLOR`. */
export function getEventTypeColor(eventType: string): string {
  return EVENT_TYPE_COLORS[eventType] ?? DEFAULT_COLOR;
}

/** Title-cased display label, with hand-tuned overrides in `EVENT_TYPE_LABELS`. */
export function formatEventType(type: string): string {
  const override = EVENT_TYPE_LABELS[type];
  if (override) return override;
  return type
    .split('.')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

/** Alias for `formatEventType` — makes display-label intent explicit at call sites. */
export function getEventTypeLabel(type: string): string {
  return formatEventType(type);
}

/**
 * Screen-reader announcement. Includes the literal event-type name so
 * the audit trail reads precisely at the wire level ("Event type:
 * copilot.analyzed") rather than the softened display label
 * ("Copilot Analyzed"). The title-cased label remains visible to
 * sighted users — both audiences served simultaneously.
 */
export function getEventTypeAriaLabel(type: string): string {
  return `Event type: ${type}`;
}

function tryParsePayload(json: string): Record<string, unknown> | null {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Event types that opt into a payload-aware row summary in the collapsed row. */
export const SUMMARIZABLE_TYPES: ReadonlySet<string> = new Set([
  'mcp.added',
  'mcp.removed',
  'mcp.toggled',
  'extension.installed',
  'skill.assignmentUpdated',
  'authority.grant.created',
  'authority.grant.deleted',
  'authority.request.reviewed',
  'authority.violation',
  'approval.reviewed',
  'command.executed',
  'plan.proposed',
  'plan.approved',
  'task.delegated',
  'task.escalated',
  'review.requested',
  'review.completed',
  'rag.index.indexed',
  'rag.index.reindexed',
  'rag.index.removed',
  'agent.step',
  'agentic.completed',
  'agentic.failed',
  'copilot.analyzed',
  'copilot.insight',
  'copilot.dismissed',
  'copilot.expired',
]);

function clampSummary(s: string): string {
  if (s.length <= ROW_SUMMARY_MAX_CHARS) return s;
  return `${s.slice(0, ROW_SUMMARY_MAX_CHARS - 1)}…`;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

/**
 * Returns the payload-aware summary for an audit row, or `null` when
 * the event type is not summarizable or the payload cannot be parsed.
 * Hard-capped at `ROW_SUMMARY_MAX_CHARS` characters.
 */
export function buildRowSummary(eventType: string, payloadJson: string): string | null {
  if (!SUMMARIZABLE_TYPES.has(eventType)) return null;
  const payload = tryParsePayload(payloadJson);
  if (!payload) return null;

  const parts: string[] = [];

  switch (eventType) {
    case 'mcp.added':
    case 'mcp.removed': {
      if (typeof payload.name === 'string') parts.push(payload.name);
      if (typeof payload.transport === 'string') parts.push(payload.transport);
      if (typeof payload.sourceKind === 'string') parts.push(payload.sourceKind);
      break;
    }
    case 'mcp.toggled': {
      if (typeof payload.name === 'string') parts.push(payload.name);
      if (payload.enabled === true) parts.push('enabled');
      if (payload.enabled === false) parts.push('disabled');
      if (typeof payload.transport === 'string') parts.push(payload.transport);
      break;
    }
    case 'extension.installed': {
      if (typeof payload.sourceKind === 'string') parts.push(payload.sourceKind);
      if (typeof payload.sourceRef === 'string' && payload.sourceRef.length > 0) {
        const truncated =
          payload.sourceRef.length > 48 ? `${payload.sourceRef.slice(0, 45)}...` : payload.sourceRef;
        parts.push(truncated);
      }
      if (typeof payload.extensionId === 'string') parts.push(payload.extensionId.slice(0, 8));
      break;
    }
    case 'skill.assignmentUpdated': {
      if (typeof payload.employeeId === 'string' && payload.employeeId.length > 0) {
        parts.push(payload.employeeId.slice(0, 8));
      } else {
        parts.push('workspace');
      }
      parts.push(payload.enabled === true ? 'enabled' : 'disabled');
      if (typeof payload.extensionId === 'string') parts.push(payload.extensionId.slice(0, 8));
      break;
    }
    case 'authority.grant.created':
    case 'authority.grant.deleted': {
      if (typeof payload.permission === 'string') parts.push(payload.permission);
      if (typeof payload.resourceKind === 'string') parts.push(payload.resourceKind);
      if (typeof payload.resourceId === 'string') {
        const truncated =
          payload.resourceId.length > 48 ? `${payload.resourceId.slice(0, 45)}...` : payload.resourceId;
        parts.push(truncated);
      }
      break;
    }
    case 'authority.request.reviewed': {
      if (typeof payload.decision === 'string') parts.push(payload.decision);
      if (typeof payload.resourceKind === 'string') parts.push(payload.resourceKind);
      if (typeof payload.resourceId === 'string') {
        const truncated =
          payload.resourceId.length > 48 ? `${payload.resourceId.slice(0, 45)}...` : payload.resourceId;
        parts.push(truncated);
      }
      break;
    }
    case 'authority.violation': {
      if (typeof payload.resourceKind === 'string') parts.push(payload.resourceKind);
      if (typeof payload.resourceId === 'string') parts.push(payload.resourceId);
      if (typeof payload.reason === 'string') parts.push(payload.reason);
      break;
    }
    case 'approval.reviewed': {
      if (typeof payload.approvalKind === 'string') parts.push(payload.approvalKind);
      if (typeof payload.decision === 'string') parts.push(payload.decision);
      if (typeof payload.subjectRefId === 'string') {
        const truncated =
          payload.subjectRefId.length > 48 ? `${payload.subjectRefId.slice(0, 45)}...` : payload.subjectRefId;
        parts.push(truncated);
      }
      break;
    }

    case 'command.executed': {
      const intent = typeof payload.intent === 'string' ? payload.intent : '';
      const rawText = typeof payload.rawText === 'string' ? payload.rawText : '';
      const outcome = payload.outcome === 'error' ? 'error' : 'ok';
      const durationMs =
        typeof payload.durationMs === 'number' && Number.isFinite(payload.durationMs)
          ? Math.round(payload.durationMs)
          : null;
      if (intent) parts.push(intentLabel(intent));
      if (rawText) {
        const truncated = rawText.length > 80 ? `${rawText.slice(0, 77)}...` : rawText;
        parts.push(`"${truncated}"`);
      }
      if (durationMs !== null) parts.push(`${durationMs}ms`);
      if (outcome === 'error') parts.push('failed');
      break;
    }

    // M32 T6 planner events (frozen — do not reorder or alter fields)
    case 'plan.proposed': {
      const count = typeof payload.subtaskCount === 'number' ? payload.subtaskCount : 0;
      parts.push(`${count} ${pluralize(count, 'subtask')}`);
      if (payload.truncated === true) parts.push('truncated');
      if (typeof payload.projectId === 'string') parts.push(payload.projectId.slice(0, 8));
      break;
    }
    case 'plan.approved': {
      const tickets = Array.isArray(payload.ticketIds) ? payload.ticketIds.length : 0;
      parts.push(`${tickets} ${pluralize(tickets, 'ticket')} approved`);
      break;
    }
    case 'task.delegated': {
      if (typeof payload.assigneeName === 'string') parts.push(`to ${payload.assigneeName}`);
      if (payload.fallbackUsed === true) parts.push('fallback');
      if (typeof payload.attemptCount === 'number' && payload.attemptCount > 1) {
        parts.push(`${payload.attemptCount} attempts`);
      }
      break;
    }
    case 'task.escalated': {
      if (typeof payload.reason === 'string') {
        const truncated =
          payload.reason.length > 60 ? `${payload.reason.slice(0, 57)}...` : payload.reason;
        parts.push(truncated);
      }
      break;
    }
    case 'review.requested': {
      if (typeof payload.ticketId === 'string') parts.push(payload.ticketId.slice(0, 8));
      break;
    }
    case 'review.completed': {
      if (typeof payload.outcome === 'string') parts.push(payload.outcome);
      if (payload.escalated === true) parts.push('escalated');
      break;
    }

    // M28/M29 RAG — pragmatic shape `{ sourceKind, sourceId, chunkCount }`
    case 'rag.index.indexed':
    case 'rag.index.reindexed': {
      if (typeof payload.sourceKind === 'string') parts.push(payload.sourceKind);
      if (typeof payload.sourceId === 'string') parts.push(payload.sourceId.slice(0, 8));
      if (typeof payload.chunkCount === 'number') {
        parts.push(`${payload.chunkCount} ${pluralize(payload.chunkCount, 'chunk')}`);
      }
      if (eventType === 'rag.index.reindexed') parts.push('reindex');
      break;
    }
    case 'rag.index.removed': {
      if (typeof payload.sourceKind === 'string') parts.push(payload.sourceKind);
      if (typeof payload.sourceId === 'string') parts.push(payload.sourceId.slice(0, 8));
      parts.push('removed');
      break;
    }

    // M31 agentic loop
    case 'agent.step': {
      if (typeof payload.kind === 'string') parts.push(payload.kind);
      if (typeof payload.stepIndex === 'number') parts.push(`step ${payload.stepIndex}`);
      if (typeof payload.runId === 'string') parts.push(payload.runId.slice(0, 8));
      break;
    }
    case 'agentic.completed': {
      if (typeof payload.totalSteps === 'number') {
        parts.push(`${payload.totalSteps} ${pluralize(payload.totalSteps, 'step')}`);
      }
      const tokensIn = typeof payload.tokensIn === 'number' ? payload.tokensIn : 0;
      const tokensOut = typeof payload.tokensOut === 'number' ? payload.tokensOut : 0;
      const total = tokensIn + tokensOut;
      if (total > 0) parts.push(`${total} tok`);
      if (typeof payload.durationMs === 'number' && Number.isFinite(payload.durationMs)) {
        parts.push(`${Math.round(payload.durationMs)}ms`);
      }
      break;
    }
    case 'agentic.failed': {
      if (typeof payload.reason === 'string') parts.push(payload.reason);
      if (typeof payload.message === 'string' && payload.message.length > 0) {
        const truncated =
          payload.message.length > 60 ? `${payload.message.slice(0, 57)}...` : payload.message;
        parts.push(truncated);
      } else if (typeof payload.runId === 'string') {
        parts.push(payload.runId.slice(0, 8));
      }
      break;
    }

    // M33 copilot service
    case 'copilot.analyzed': {
      if (typeof payload.reason === 'string') parts.push(payload.reason);
      if (typeof payload.insightsGenerated === 'number' && payload.insightsGenerated > 0) {
        parts.push(`${payload.insightsGenerated} new`);
      }
      if (typeof payload.insightsMerged === 'number' && payload.insightsMerged > 0) {
        parts.push(`${payload.insightsMerged} merged`);
      }
      if (typeof payload.insightsExpired === 'number' && payload.insightsExpired > 0) {
        parts.push(`${payload.insightsExpired} expired`);
      }
      if (typeof payload.durationMs === 'number' && Number.isFinite(payload.durationMs)) {
        parts.push(`${Math.round(payload.durationMs)}ms`);
      }
      break;
    }
    case 'copilot.insight': {
      if (typeof payload.category === 'string') parts.push(payload.category);
      if (typeof payload.severity === 'string') parts.push(payload.severity);
      if (typeof payload.title === 'string' && payload.title.length > 0) {
        const truncated =
          payload.title.length > 60 ? `${payload.title.slice(0, 57)}...` : payload.title;
        parts.push(`"${truncated}"`);
      }
      break;
    }
    case 'copilot.dismissed': {
      if (typeof payload.insightId === 'string') parts.push(payload.insightId.slice(0, 8));
      break;
    }
    case 'copilot.expired': {
      if (typeof payload.category === 'string') parts.push(payload.category);
      if (typeof payload.title === 'string' && payload.title.length > 0) {
        const truncated =
          payload.title.length > 60 ? `${payload.title.slice(0, 57)}...` : payload.title;
        parts.push(`"${truncated}"`);
      }
      break;
    }
  }

  if (parts.length === 0) return null;
  return clampSummary(parts.join(' · '));
}
