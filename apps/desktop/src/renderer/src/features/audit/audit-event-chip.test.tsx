/**
 * Unit tests for the audit-event-chip pure helpers (Phase 5 — M35 T3).
 *
 * Three representative Phase 5 event types are pinned per acceptance
 * bullet #3: `rag.index.indexed` (M28/M29 aspirational RAG indexer),
 * `agent.step` (M31 agentic loop), and `copilot.analyzed` (M33
 * copilot service). Together these cover the three shape categories:
 *
 *   - Identity-with-chunk-count (rag.index.*)
 *   - Step-kind-with-run-id-slice (agent.step / agent kin)
 *   - Reason-with-counts-and-durationMs (copilot.analyzed / analyzer kin)
 *
 * Per the step-card-narrow.test.ts convention, these tests exercise
 * the pure-helper surface only. No DOM, no jsdom, no React rendering.
 * The `.tsx` extension matches the M35 plan doc §3 T3 row scope — the
 * helpers and component share the same module; tests import the
 * helpers alone.
 *
 * Regression guard (acceptance bullet #4): tests for the M32 T6 frozen
 * planner row-summary surface (`plan.proposed`) land alongside the
 * Phase 5 additions — if a future edit collapses the switch branches
 * or drops the `truncated` flag handling, this test fails first.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_COLOR,
  EVENT_TYPE_COLORS,
  EVENT_TYPE_LABELS,
  ROW_SUMMARY_MAX_CHARS,
  SUMMARIZABLE_TYPES,
  buildRowSummary,
  formatEventType,
  getEventTypeAriaLabel,
  getEventTypeColor,
  getEventTypeLabel,
} from './audit-event-chip-helpers.js';

// ---------------------------------------------------------------------------
// rag.index.indexed (M28/M29 aspirational — chip lands defensively)
// ---------------------------------------------------------------------------

describe('audit-event-chip: rag.index.indexed', () => {
  it('maps to the blue info color class', () => {
    expect(getEventTypeColor('rag.index.indexed')).toBe('bg-blue-600/20 text-blue-400');
    expect(EVENT_TYPE_COLORS['rag.index.indexed']).toBe('bg-blue-600/20 text-blue-400');
  });

  it('exposes a hand-tuned display label ("RAG Indexed")', () => {
    expect(getEventTypeLabel('rag.index.indexed')).toBe('RAG Indexed');
    expect(EVENT_TYPE_LABELS['rag.index.indexed']).toBe('RAG Indexed');
    expect(formatEventType('rag.index.indexed')).toBe('RAG Indexed');
  });

  it('builds a precise aria-label carrying the literal event-type name', () => {
    expect(getEventTypeAriaLabel('rag.index.indexed')).toBe('Event type: rag.index.indexed');
  });

  it('opts into payload-aware row summaries', () => {
    expect(SUMMARIZABLE_TYPES.has('rag.index.indexed')).toBe(true);
  });

  it('summarizes a well-formed payload with sourceKind, id slice, chunk count', () => {
    const payloadJson = JSON.stringify({
      sourceKind: 'message',
      sourceId: 'msg-abcdef012345',
      chunkCount: 7,
    });
    const summary = buildRowSummary('rag.index.indexed', payloadJson);
    expect(summary).toBe('message · msg-abcd · 7 chunks');
    expect((summary ?? '').length).toBeLessThanOrEqual(ROW_SUMMARY_MAX_CHARS);
  });

  it('pluralizes chunkCount=1 correctly', () => {
    const payloadJson = JSON.stringify({
      sourceKind: 'vault_file',
      sourceId: 'file-xyz',
      chunkCount: 1,
    });
    expect(buildRowSummary('rag.index.indexed', payloadJson)).toBe(
      'vault_file · file-xyz · 1 chunk',
    );
  });

  it('returns null for unparseable payload', () => {
    expect(buildRowSummary('rag.index.indexed', 'not-json')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// agent.step (M31 agentic loop)
// ---------------------------------------------------------------------------

describe('audit-event-chip: agent.step', () => {
  it('maps to the sky step-progress color class', () => {
    expect(getEventTypeColor('agent.step')).toBe('bg-sky-600/20 text-sky-400');
  });

  it('exposes a hand-tuned display label ("Agent Step")', () => {
    expect(getEventTypeLabel('agent.step')).toBe('Agent Step');
  });

  it('builds a precise aria-label carrying the literal event-type name', () => {
    expect(getEventTypeAriaLabel('agent.step')).toBe('Event type: agent.step');
  });

  it('opts into payload-aware row summaries', () => {
    expect(SUMMARIZABLE_TYPES.has('agent.step')).toBe(true);
  });

  it('summarizes a tool_call step with kind + stepIndex + runId slice', () => {
    const payloadJson = JSON.stringify({
      runId: 'run-deadbeef1234',
      threadId: 'thr-sys-agent-1',
      stepIndex: 2,
      kind: 'tool_call',
      data: {
        toolCallId: 'tc-1',
        toolName: 'query_employees',
        args: { companyId: 'cmp-1' },
      },
      tokensIn: 128,
      tokensOut: 32,
      costUsd: 0,
      provider: 'test',
      model: 'test-model',
    });
    const summary = buildRowSummary('agent.step', payloadJson);
    expect(summary).toBe('tool_call · step 2 · run-dead');
    expect((summary ?? '').length).toBeLessThanOrEqual(ROW_SUMMARY_MAX_CHARS);
  });

  it('summarizes a final answer step', () => {
    const payloadJson = JSON.stringify({
      runId: 'run-01234567',
      threadId: 'thr-1',
      stepIndex: 3,
      kind: 'answer',
      data: { text: 'final' },
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      provider: 'test',
      model: 'test-model',
    });
    expect(buildRowSummary('agent.step', payloadJson)).toBe('answer · step 3 · run-0123');
  });

  it('returns null for a missing payload', () => {
    expect(buildRowSummary('agent.step', '{}')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// copilot.analyzed (M33 copilot service)
// ---------------------------------------------------------------------------

describe('audit-event-chip: copilot.analyzed', () => {
  it('maps to the blue analyzer color class', () => {
    expect(getEventTypeColor('copilot.analyzed')).toBe('bg-blue-600/20 text-blue-400');
  });

  it('exposes a hand-tuned display label ("Copilot Analyzed")', () => {
    expect(getEventTypeLabel('copilot.analyzed')).toBe('Copilot Analyzed');
  });

  it('builds a precise aria-label carrying the literal event-type name', () => {
    expect(getEventTypeAriaLabel('copilot.analyzed')).toBe('Event type: copilot.analyzed');
  });

  it('opts into payload-aware row summaries', () => {
    expect(SUMMARIZABLE_TYPES.has('copilot.analyzed')).toBe(true);
  });

  it('summarizes a scheduled tick with insightsGenerated + merged + durationMs', () => {
    const payloadJson = JSON.stringify({
      runId: 'run-copilot-1',
      reason: 'scheduled',
      insightsProposed: 4,
      insightsGenerated: 2,
      insightsMerged: 1,
      insightsExpired: 0,
      tokensIn: 800,
      tokensOut: 200,
      costUsd: 0,
      durationMs: 1234,
    });
    const summary = buildRowSummary('copilot.analyzed', payloadJson);
    expect(summary).toBe('scheduled · 2 new · 1 merged · 1234ms');
    expect((summary ?? '').length).toBeLessThanOrEqual(ROW_SUMMARY_MAX_CHARS);
  });

  it('omits zero-count fields for a no-op tick', () => {
    const payloadJson = JSON.stringify({
      runId: 'run-copilot-2',
      reason: 'manual',
      insightsProposed: 0,
      insightsGenerated: 0,
      insightsMerged: 0,
      insightsExpired: 0,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      durationMs: 42,
    });
    expect(buildRowSummary('copilot.analyzed', payloadJson)).toBe('manual · 42ms');
  });

  it('surfaces the malformed_output terminal reason on a skipped tick', () => {
    const payloadJson = JSON.stringify({
      runId: 'run-copilot-3',
      reason: 'malformed_output',
      insightsProposed: 0,
      insightsGenerated: 0,
      insightsMerged: 0,
      insightsExpired: 0,
      tokensIn: 500,
      tokensOut: 0,
      costUsd: 0,
      durationMs: 789,
    });
    expect(buildRowSummary('copilot.analyzed', payloadJson)).toBe('malformed_output · 789ms');
  });
});

// ---------------------------------------------------------------------------
// Extensions & Authority hardening events
// ---------------------------------------------------------------------------

describe('audit-event-chip: extension.installed + authority.violation', () => {
  it('maps the new extension install and authority violation events to stable labels and colors', () => {
    expect(getEventTypeColor('extension.installed')).toBe('bg-emerald-600/20 text-emerald-400');
    expect(getEventTypeLabel('extension.installed')).toBe('Extension Installed');
    expect(getEventTypeColor('authority.violation')).toBe('bg-rose-600/20 text-rose-400');
    expect(getEventTypeLabel('authority.violation')).toBe('Authority Violation');
  });

  it('summarizes extension installs with source metadata and authority violations with the denied resource', () => {
    expect(
      buildRowSummary(
        'extension.installed',
        JSON.stringify({
          extensionId: 'ext-abcdef12',
          sourceKind: 'github',
          sourceRef: 'https://github.com/acme/team-x-skills/tree/main/ops-briefing',
        }),
      ),
    ).toBe('github · https://github.com/acme/team-x-skills/tree/ma... · ext-abcd');

    expect(
      buildRowSummary(
        'authority.violation',
        JSON.stringify({
          resourceKind: 'capability',
          resourceId: 'read_file',
          reason: 'explicit-deny',
        }),
      ),
    ).toBe('capability · read_file · explicit-deny');
  });
});

describe('audit-event-chip: portability events', () => {
  it('maps workspace export, import, and template install events to stable labels and colors', () => {
    expect(getEventTypeColor('company.packageExported')).toBe('bg-indigo-600/20 text-indigo-400');
    expect(getEventTypeLabel('company.packageExported')).toBe('Workspace Export');
    expect(getEventTypeColor('company.packageImported')).toBe('bg-sky-600/20 text-sky-400');
    expect(getEventTypeLabel('company.packageImported')).toBe('Workspace Import');
    expect(getEventTypeColor('company.templateInstalled')).toBe(
      'bg-violet-600/20 text-violet-400',
    );
    expect(getEventTypeLabel('company.templateInstalled')).toBe('Template Installed');
  });

  it('summarizes portability events with mode, sharing posture, and package identity', () => {
    expect(
      buildRowSummary(
        'company.packageExported',
        JSON.stringify({
          mode: 'workspace-export',
          sharingMode: 'invited',
          packageId: 'pkg-abcdef12',
        }),
      ),
    ).toBe('workspace-export · invited · pkg-abcd');

    expect(
      buildRowSummary(
        'company.packageImported',
        JSON.stringify({
          mode: 'workspace-export',
          sharingMode: 'cloud',
          packageId: 'pkg-fedcba98',
        }),
      ),
    ).toBe('workspace-export · cloud · pkg-fedc');

    expect(
      buildRowSummary(
        'company.templateInstalled',
        JSON.stringify({
          templateName: 'Alpha Ops Template',
          sharingMode: 'local',
          packageId: 'pkg-template-1',
        }),
      ),
    ).toBe('Alpha Ops Template · local · pkg-temp');
  });
});

describe('audit-event-chip: shared cloud link events', () => {
  it('maps link lifecycle events to stable labels and colors', () => {
    expect(getEventTypeColor('company.linkStarted')).toBe('bg-blue-600/20 text-blue-400');
    expect(getEventTypeLabel('company.linkStarted')).toBe('Link Started');
    expect(getEventTypeColor('company.linked')).toBe('bg-emerald-600/20 text-emerald-400');
    expect(getEventTypeLabel('company.linked')).toBe('Workspace Linked');
    expect(getEventTypeColor('company.linkFailed')).toBe('bg-rose-600/20 text-rose-400');
    expect(getEventTypeLabel('company.linkFailed')).toBe('Link Failed');
    expect(getEventTypeColor('company.unlinked')).toBe('bg-zinc-600/20 text-zinc-400');
    expect(getEventTypeLabel('company.unlinked')).toBe('Workspace Unlinked');
    expect(getEventTypeColor('company.reconnected')).toBe('bg-sky-600/20 text-sky-400');
    expect(getEventTypeLabel('company.reconnected')).toBe('Workspace Reconnected');
  });

  it('summarizes link lifecycle payloads with reserved ids and failure context', () => {
    expect(
      buildRowSummary(
        'company.linkStarted',
        JSON.stringify({
          cloudWorkspaceId: 'workspace_company-1',
          cloudTenantId: 'tenant_company-1',
        }),
      ),
    ).toBe('workspace_co · tenant_compa');

    expect(
      buildRowSummary(
        'company.linked',
        JSON.stringify({
          cloudWorkspaceId: 'workspace_company-1',
          cloudTenantId: 'tenant_company-1',
          linkedDeviceId: 'device_abcdef',
        }),
      ),
    ).toBe('workspace_co · tenant_compa · device_abc');

    expect(
      buildRowSummary(
        'company.linkFailed',
        JSON.stringify({
          action: 'reconnect',
          error: 'cursor replay drift',
        }),
      ),
    ).toBe('reconnect · cursor replay drift');

    expect(
      buildRowSummary(
        'company.unlinked',
        JSON.stringify({
          previousCloudWorkspaceId: 'workspace_company-1',
        }),
      ),
    ).toBe('workspace_co');

    expect(
      buildRowSummary(
        'company.reconnected',
        JSON.stringify({
          cloudWorkspaceId: 'workspace_company-1',
          cloudTenantId: 'tenant_company-1',
          linkedDeviceId: 'device_abcdef',
        }),
      ),
    ).toBe('workspace_co · tenant_compa · device_abc');
  });
});

// ---------------------------------------------------------------------------
// Regression guard — M32 T6 planner chips must still render
// ---------------------------------------------------------------------------

describe('audit-event-chip: M32 T6 regression guard', () => {
  it('preserves the violet color class + display label for plan.proposed', () => {
    expect(getEventTypeColor('plan.proposed')).toBe('bg-violet-600/20 text-violet-400');
    expect(getEventTypeLabel('plan.proposed')).toBe('Plan Proposed');
  });

  it('preserves the plan.proposed row summary — subtaskCount + truncated + projectId', () => {
    const payloadJson = JSON.stringify({
      planId: 'plan-1',
      projectId: 'proj-abcdefgh',
      subtaskCount: 5,
      truncated: true,
      subtasks: [],
    });
    expect(buildRowSummary('plan.proposed', payloadJson)).toBe('5 subtasks · truncated · proj-abc');
  });

  it('preserves the task.delegated row summary — assignee + fallback + attempts', () => {
    const payloadJson = JSON.stringify({
      ticketId: 'tk-1',
      planId: 'plan-1',
      assigneeId: 'emp-42',
      assigneeName: 'Rocky',
      parentProjectId: null,
      fallbackUsed: true,
      attemptCount: 2,
    });
    expect(buildRowSummary('task.delegated', payloadJson)).toBe('to Rocky · fallback · 2 attempts');
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting defaults
// ---------------------------------------------------------------------------

describe('audit-event-chip: defaults', () => {
  it('falls back to DEFAULT_COLOR for unknown event types', () => {
    expect(getEventTypeColor('not.a.real.event')).toBe(DEFAULT_COLOR);
  });

  it('title-cases unknown event types for display', () => {
    expect(getEventTypeLabel('frobnicate.widget')).toBe('Frobnicate Widget');
  });

  it('returns null from buildRowSummary for unknown (non-summarizable) event types', () => {
    expect(buildRowSummary('not.a.real.event', '{}')).toBeNull();
  });

  it('enforces the ROW_SUMMARY_MAX_CHARS cap', () => {
    // copilot.insight with a 500-char title should still clamp to ≤140.
    const longTitle = 'x'.repeat(500);
    const payloadJson = JSON.stringify({
      insightId: 'ins-1',
      runId: 'run-1',
      category: 'operational',
      severity: 'critical',
      title: longTitle,
      expiresAt: 0,
    });
    const summary = buildRowSummary('copilot.insight', payloadJson);
    expect(summary).not.toBeNull();
    expect((summary ?? '').length).toBeLessThanOrEqual(ROW_SUMMARY_MAX_CHARS);
  });
});
