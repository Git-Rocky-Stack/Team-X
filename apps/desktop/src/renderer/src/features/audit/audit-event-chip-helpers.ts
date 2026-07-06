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

/**
 * Console display-chip tone recipes (Phase 7a — sweep). The chips render
 * inside the audit list's RecessedWell — a display surface, dark in both
 * shifts — so tones read the shift-stable `--led-*` family (never the
 * Day-flipping `--tag-*` chassis tokens). Semantics:
 *   GO      completion / creation / success
 *   HOLD    review / pending / attention
 *   NOGO    failure / violation / removal / destructive
 *   SCOPE   informational lifecycle
 *   NEUTRAL expiry / dismissal / unknown
 * `command.executed` + `employee.updated` keep their existing brand tint
 * (command authority — already console vocabulary).
 */
const CHIP_GO = 'border-[var(--led-go-edge)] bg-[var(--go-soft)] text-[var(--led-go)]';
const CHIP_HOLD = 'border-[var(--led-hold-edge)] bg-[var(--hold-soft)] text-[var(--led-hold)]';
const CHIP_NOGO = 'border-[var(--led-nogo-edge)] bg-[var(--warn-soft)] text-[var(--led-nogo)]';
const CHIP_SCOPE = 'border-[var(--led-scope-edge)] bg-[var(--scope-soft)] text-[var(--led-scope)]';
const CHIP_NEUTRAL = 'border-[var(--display-border)] bg-transparent text-[var(--display-fg)]';

/** Event type → semantic console chip class. */
export const EVENT_TYPE_COLORS: Record<string, string> = {
  // Phase 1–4 events (pre-M30)
  'employee.hired': CHIP_GO,
  'employee.updated': 'bg-brand/15 text-brand',
  'employee.fired': CHIP_NOGO,
  'employee.promoted': CHIP_HOLD,
  'ticket.created': CHIP_SCOPE,
  'ticket.assigned': CHIP_HOLD,
  'ticket.participantAdded': CHIP_SCOPE,
  'ticket.participantRemoved': CHIP_NOGO,
  'ticket.closed': CHIP_GO,
  'meeting.started': CHIP_HOLD,
  'meeting.ended': CHIP_HOLD,
  'mcp.added': CHIP_SCOPE,
  'mcp.removed': CHIP_SCOPE,
  'mcp.toggled': CHIP_SCOPE,
  'extension.installed': CHIP_GO,
  'extension.removed': CHIP_NOGO,
  'skill.assignmentUpdated': CHIP_SCOPE,
  'authority.grant.created': CHIP_GO,
  'authority.grant.deleted': CHIP_NOGO,
  'authority.request.reviewed': CHIP_HOLD,
  'authority.violation': CHIP_NOGO,
  'approval.reviewed': CHIP_HOLD,
  'chat.sent': CHIP_SCOPE,
  'backup.created': CHIP_GO,
  'backup.restored': CHIP_GO,
  'vault.uploaded': CHIP_GO,
  'vault.deleted': CHIP_NOGO,
  'work.started': CHIP_SCOPE,
  'work.completed': CHIP_GO,
  'work.failed': CHIP_NOGO,
  'token.delta': CHIP_NEUTRAL,

  // M30 (NLU + palette)
  'command.executed': 'bg-brand/15 text-brand',

  // M32 T6 (write-side planner — frozen)
  'plan.proposed': CHIP_SCOPE,
  'plan.approved': CHIP_GO,
  'task.delegated': CHIP_SCOPE,
  'task.escalated': CHIP_NOGO,
  'review.requested': CHIP_HOLD,
  'review.completed': CHIP_HOLD,

  // M28/M29 (RAG) — aspirational per CLAUDE.md bus-event table; chip
  // lands defensively so audit rows surface correctly the moment the
  // events start firing from the indexer.
  'rag.index.indexed': CHIP_SCOPE,
  'rag.index.reindexed': CHIP_SCOPE,
  'rag.index.removed': CHIP_NEUTRAL,

  // M31 (agentic loop)
  'agent.step': CHIP_SCOPE,
  'agentic.completed': CHIP_GO,
  'agentic.failed': CHIP_NOGO,

  // M33 (copilot service)
  'copilot.analyzed': CHIP_SCOPE,
  'copilot.insight': CHIP_HOLD,
  'copilot.dismissed': CHIP_NEUTRAL,
  'copilot.expired': CHIP_NEUTRAL,
  'company.linkStarted': CHIP_SCOPE,
  'company.linked': CHIP_GO,
  'company.linkFailed': CHIP_NOGO,
  'company.unlinked': CHIP_NEUTRAL,
  'company.reconnected': CHIP_SCOPE,
  'company.packageExported': CHIP_SCOPE,
  'company.packageImported': CHIP_SCOPE,
  'company.templateInstalled': CHIP_SCOPE,
  'runtime.session.started': CHIP_SCOPE,
  'runtime.heartbeat': CHIP_SCOPE,
  'runtime.checkout.claimed': CHIP_GO,
  'runtime.checkout.conflict': CHIP_NOGO,
  'runtime.execution.started': CHIP_SCOPE,
  'runtime.execution.output': CHIP_SCOPE,
  'runtime.execution.failed': CHIP_NOGO,
  'runtime.artifact.created': CHIP_GO,
  'runtime.session.stale': CHIP_HOLD,
  'runtime.session.recovered': CHIP_GO,
};

/** Hand-tuned display labels where the auto-title-cased fallback reads
 * awkwardly ("Rag Index Indexed" → "RAG Indexed"). Keep this list tight. */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  'employee.updated': 'Employee Updated',
  'mcp.added': 'MCP Added',
  'mcp.removed': 'MCP Removed',
  'mcp.toggled': 'MCP Toggled',
  'extension.installed': 'Extension Installed',
  'extension.removed': 'Extension Removed',
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
  'ticket.participantAdded': 'Participant Added',
  'ticket.participantRemoved': 'Participant Removed',
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
  'company.linkStarted': 'Link Started',
  'company.linked': 'Workspace Linked',
  'company.linkFailed': 'Link Failed',
  'company.unlinked': 'Workspace Unlinked',
  'company.reconnected': 'Workspace Reconnected',
  'company.packageExported': 'Workspace Export',
  'company.packageImported': 'Workspace Import',
  'company.templateInstalled': 'Template Installed',
  'runtime.session.started': 'Runtime Started',
  'runtime.heartbeat': 'Runtime Heartbeat',
  'runtime.checkout.claimed': 'Runtime Checkout',
  'runtime.checkout.conflict': 'Runtime Conflict',
  'runtime.execution.started': 'Runtime Execution',
  'runtime.execution.output': 'Runtime Output',
  'runtime.execution.failed': 'Runtime Failed',
  'runtime.artifact.created': 'Runtime Artifact',
  'runtime.session.stale': 'Runtime Stale',
  'runtime.session.recovered': 'Runtime Recovered',
};

/** Fallback color class when an event type is not in the map. */
export const DEFAULT_COLOR = CHIP_NEUTRAL;

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
  'extension.removed',
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
  'company.linkStarted',
  'company.linked',
  'company.linkFailed',
  'company.unlinked',
  'company.reconnected',
  'company.packageExported',
  'company.packageImported',
  'company.templateInstalled',
  'runtime.session.started',
  'runtime.heartbeat',
  'runtime.checkout.claimed',
  'runtime.checkout.conflict',
  'runtime.execution.started',
  'runtime.execution.output',
  'runtime.execution.failed',
  'runtime.artifact.created',
  'runtime.session.stale',
  'runtime.session.recovered',
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
    case 'extension.installed':
    case 'extension.removed': {
      if (typeof payload.name === 'string') parts.push(payload.name);
      if (typeof payload.sourceKind === 'string') parts.push(payload.sourceKind);
      if (typeof payload.sourceRef === 'string' && payload.sourceRef.length > 0) {
        const truncated =
          payload.sourceRef.length > 48
            ? `${payload.sourceRef.slice(0, 45)}...`
            : payload.sourceRef;
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
          payload.resourceId.length > 48
            ? `${payload.resourceId.slice(0, 45)}...`
            : payload.resourceId;
        parts.push(truncated);
      }
      break;
    }
    case 'authority.request.reviewed': {
      if (typeof payload.decision === 'string') parts.push(payload.decision);
      if (typeof payload.resourceKind === 'string') parts.push(payload.resourceKind);
      if (typeof payload.resourceId === 'string') {
        const truncated =
          payload.resourceId.length > 48
            ? `${payload.resourceId.slice(0, 45)}...`
            : payload.resourceId;
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
          payload.subjectRefId.length > 48
            ? `${payload.subjectRefId.slice(0, 45)}...`
            : payload.subjectRefId;
        parts.push(truncated);
      }
      break;
    }
    case 'company.linkStarted': {
      if (typeof payload.cloudWorkspaceId === 'string')
        parts.push(payload.cloudWorkspaceId.slice(0, 12));
      if (typeof payload.cloudTenantId === 'string') parts.push(payload.cloudTenantId.slice(0, 12));
      break;
    }
    case 'company.linked':
    case 'company.reconnected': {
      if (typeof payload.cloudWorkspaceId === 'string')
        parts.push(payload.cloudWorkspaceId.slice(0, 12));
      if (typeof payload.cloudTenantId === 'string') parts.push(payload.cloudTenantId.slice(0, 12));
      if (typeof payload.linkedDeviceId === 'string')
        parts.push(payload.linkedDeviceId.slice(0, 10));
      break;
    }
    case 'company.linkFailed': {
      if (typeof payload.action === 'string') parts.push(payload.action);
      if (typeof payload.error === 'string' && payload.error.length > 0) {
        const truncated =
          payload.error.length > 60 ? `${payload.error.slice(0, 57)}...` : payload.error;
        parts.push(truncated);
      }
      break;
    }
    case 'company.unlinked': {
      if (
        typeof payload.previousCloudWorkspaceId === 'string' &&
        payload.previousCloudWorkspaceId.length > 0
      ) {
        parts.push(payload.previousCloudWorkspaceId.slice(0, 12));
      } else {
        parts.push('local-only');
      }
      break;
    }
    case 'company.packageExported': {
      if (typeof payload.mode === 'string') parts.push(payload.mode);
      if (typeof payload.sharingMode === 'string') parts.push(payload.sharingMode);
      if (typeof payload.packageId === 'string') parts.push(payload.packageId.slice(0, 8));
      break;
    }
    case 'company.packageImported': {
      if (typeof payload.mode === 'string') parts.push(payload.mode);
      if (typeof payload.sharingMode === 'string') parts.push(payload.sharingMode);
      if (typeof payload.packageId === 'string') parts.push(payload.packageId.slice(0, 8));
      break;
    }
    case 'company.templateInstalled': {
      if (typeof payload.templateName === 'string') parts.push(payload.templateName);
      if (typeof payload.sharingMode === 'string') parts.push(payload.sharingMode);
      if (typeof payload.packageId === 'string') parts.push(payload.packageId.slice(0, 8));
      break;
    }
    case 'runtime.session.started':
    case 'runtime.execution.started':
    case 'runtime.session.recovered': {
      if (typeof payload.adapterKind === 'string') parts.push(payload.adapterKind);
      if (typeof payload.sessionId === 'string') parts.push(payload.sessionId.slice(0, 8));
      if (typeof payload.runId === 'string') parts.push(payload.runId.slice(0, 8));
      break;
    }
    case 'runtime.heartbeat':
    case 'runtime.execution.output':
    case 'runtime.artifact.created': {
      if (typeof payload.adapterKind === 'string') parts.push(payload.adapterKind);
      if (typeof payload.status === 'string') parts.push(payload.status);
      if (typeof payload.message === 'string' && payload.message.length > 0) {
        const truncated =
          payload.message.length > 60 ? `${payload.message.slice(0, 57)}...` : payload.message;
        parts.push(truncated);
      }
      if (typeof payload.artifactId === 'string' && payload.artifactId.length > 0) {
        parts.push(payload.artifactId.slice(0, 8));
      }
      break;
    }
    case 'runtime.checkout.claimed': {
      if (typeof payload.ticketId === 'string') parts.push(payload.ticketId.slice(0, 8));
      if (typeof payload.checkoutId === 'string') parts.push(payload.checkoutId.slice(0, 8));
      if (typeof payload.adapterKind === 'string') parts.push(payload.adapterKind);
      break;
    }
    case 'runtime.checkout.conflict': {
      if (typeof payload.ticketId === 'string') parts.push(payload.ticketId.slice(0, 8));
      if (typeof payload.conflictingEmployeeId === 'string') {
        parts.push(`owned by ${payload.conflictingEmployeeId.slice(0, 8)}`);
      }
      if (typeof payload.message === 'string' && payload.message.length > 0) {
        const truncated =
          payload.message.length > 60 ? `${payload.message.slice(0, 57)}...` : payload.message;
        parts.push(truncated);
      }
      break;
    }
    case 'runtime.execution.failed':
    case 'runtime.session.stale': {
      if (typeof payload.adapterKind === 'string') parts.push(payload.adapterKind);
      if (typeof payload.status === 'string') parts.push(payload.status);
      if (typeof payload.message === 'string' && payload.message.length > 0) {
        const truncated =
          payload.message.length > 60 ? `${payload.message.slice(0, 57)}...` : payload.message;
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
