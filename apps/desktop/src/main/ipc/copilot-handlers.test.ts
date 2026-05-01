
import { COPILOT_CATEGORY_WEIGHTS_DEFAULT } from '@team-x/shared-types';
import type { AuditEvent, CopilotCategory, DashboardEvent } from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';

import {
  type CopilotHandlersDeps,
  type CopilotInsightHandlerRow,
  buildCopilotHandlers,
} from './copilot-handlers.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function row(overrides: Partial<CopilotInsightHandlerRow> = {}): CopilotInsightHandlerRow {
  return {
    id: 'i1',
    companyId: 'c1',
    category: 'operational',
    severity: 'warning',
    title: 'Blocked tickets stacking on Alice',
    detail: 'Three tickets in-progress >5 days, one SLA breach risk.',
    actionSuggestion: 'Reassign the oldest to Bob.',
    actionIntent: 'assign_ticket',
    actionEntitiesJson: '{"ticketId":"t42","assigneeId":"bob"}',
    dismissedAt: null,
    createdAt: 1_000_000,
    expiresAt: 1_000_000 + 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<CopilotHandlersDeps> = {}): CopilotHandlersDeps {
  return {
    copilotInsightsRepo: {
      listActive: vi.fn(() => []),
      getById: vi.fn(() => null),
      dismiss: vi.fn(() => undefined),
    },
    copilotAnalyzerService: {
      tick: vi.fn(async () => ({
        runId: 'run-1',
        insightsProposed: 0,
        insightsGenerated: 0,
        insightsMerged: 0,
        insightsExpired: 0,
      })),
    },
    bus: {
      emit: vi.fn((input) => ({
        id: 'evt-1',
        type: input.type,
        companyId: input.companyId,
        actorId: input.actorId,
        actorKind: input.actorKind,
        payload: input.payload,
        createdAt: 100,
      })) as unknown as CopilotHandlersDeps['bus']['emit'],
    },
    auditRepo: {
      list: vi.fn(() => []),
    },
    settingsRepo: {
      getCopilotWeights: vi.fn(() => ({ weights: COPILOT_CATEGORY_WEIGHTS_DEFAULT })),
    },
    isTestMode: () => true,
    now: () => 5_000_000,
    ...overrides,
  };
}

function dismissedEvent(
  category: CopilotCategory,
  createdAt: number,
  overrides: Partial<AuditEvent> = {},
): AuditEvent {
  return {
    id: `evt-${category}-${createdAt}`,
    companyId: 'c1',
    actorId: 'rocky',
    actorKind: 'user',
    eventType: 'copilot.dismissed',
    payloadJson: JSON.stringify({
      insightId: `insight-${category}-${createdAt}`,
      dismissedAt: createdAt,
      category,
      title: `${category} title`,
    }),
    createdAt,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// copilot.insights
// ---------------------------------------------------------------------------

describe('copilot.insights', () => {
  it('projects rows to the wire shape, paginates by cursor, and clamps the limit to 100', async () => {
    // Over-returns 5 rows; handler over-fetches limit+1 = 3 on the
    // first page and detects end-of-data via the overflow.
    const rows = [
      row({ id: 'a', createdAt: 5000 }),
      row({ id: 'b', createdAt: 4000 }),
      row({ id: 'c', createdAt: 3000 }),
      row({ id: 'd', createdAt: 2000 }),
      row({ id: 'e', createdAt: 1000 }),
    ];
    const listActive = vi.fn(() => rows);
    const deps = makeDeps({
      copilotInsightsRepo: {
        listActive,
        getById: vi.fn(() => null),
        dismiss: vi.fn(),
      },
    });
    const handlers = buildCopilotHandlers(deps);

    // Page 1: newest-first, nextCursor set because rows remain.
    const page1 = await handlers.insights({ companyId: 'c1', limit: 2 });
    expect(page1.insights.map((i) => i.id)).toEqual(['a', 'b']);
    expect(page1.insights[0]?.category).toBe('operational');
    expect(page1.insights[0]?.severity).toBe('warning');
    expect(page1.nextCursor).toBe(4000);

    // Cursor trims to rows with createdAt < cursor.
    const page2 = await handlers.insights({ companyId: 'c1', limit: 2, cursor: 4000 });
    expect(page2.insights.map((i) => i.id)).toEqual(['c', 'd']);

    // Clamp: requested limit 999 => effective 100, over-fetches 101.
    await handlers.insights({ companyId: 'c1', limit: 999 });
    expect(listActive).toHaveBeenLastCalledWith(
      expect.objectContaining({ companyId: 'c1', limit: 101 }),
    );
  });

  it('throws when companyId is missing', async () => {
    const handlers = buildCopilotHandlers(makeDeps());
    await expect(
      handlers.insights({ companyId: '' } as unknown as { companyId: string }),
    ).rejects.toThrow(/companyId/);
  });
});

// ---------------------------------------------------------------------------
// copilot.dismiss
// ---------------------------------------------------------------------------

describe('copilot.dismiss', () => {
  it('dismisses the row, emits copilot.dismissed on the bus, and is idempotent on re-dismiss', async () => {
    let stored: CopilotInsightHandlerRow | null = row({ id: 'i1' });
    const dismissFn = vi.fn((id: string, when?: number) => {
      if (stored && stored.id === id) stored = { ...stored, dismissedAt: when ?? Date.now() };
    });
    const deps = makeDeps({
      copilotInsightsRepo: {
        listActive: vi.fn(() => []),
        getById: vi.fn((id: string) => (stored && stored.id === id ? stored : null)),
        dismiss: dismissFn,
      },
    });
    const handlers = buildCopilotHandlers(deps);

    // First call — fires the bus event + writes the row.
    const result = await handlers.dismiss({ id: 'i1' });
    expect(result).toEqual({ id: 'i1', dismissedAt: 5_000_000 });
    expect(dismissFn).toHaveBeenCalledWith('i1', 5_000_000);

    const emit = deps.bus.emit as unknown as ReturnType<typeof vi.fn>;
    expect(emit).toHaveBeenCalledTimes(1);
    const emitted = emit.mock.calls[0]?.[0] as {
      type: string;
      companyId: string;
      actorId: string;
      actorKind: string;
      payload: { insightId: string; dismissedAt: number; category: string; title: string };
    };
    expect(emitted.type).toBe('copilot.dismissed');
    expect(emitted.companyId).toBe('c1');
    expect(emitted.actorKind).toBe('user');
    expect(emitted.payload).toEqual({
      insightId: 'i1',
      dismissedAt: 5_000_000,
      category: 'operational',
      title: 'Blocked tickets stacking on Alice',
    });

    // Second call on the now-dismissed row — no repo mutation, no bus emit,
    // returns the prior timestamp (idempotent).
    const result2 = await handlers.dismiss({ id: 'i1' });
    expect(result2).toEqual({ id: 'i1', dismissedAt: 5_000_000 });
    expect(dismissFn).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('throws when the insight id is unknown', async () => {
    const handlers = buildCopilotHandlers(makeDeps());
    await expect(handlers.dismiss({ id: 'nope' })).rejects.toThrow(/not found/);
  });

  it('returns no suggestion for the second same-category dismissal in seven days', async () => {
    const deps = makeDeps({
      now: () => 1_000_000_000,
      copilotInsightsRepo: {
        listActive: vi.fn(() => []),
        getById: vi.fn(() => row({ id: 'i1', category: 'operational' })),
        dismiss: vi.fn(),
      },
      auditRepo: {
        list: vi.fn(() => [dismissedEvent('operational', 999_999_000)]),
      },
    });
    const handlers = buildCopilotHandlers(deps);

    const result = await handlers.dismiss({ id: 'i1' });

    expect(result.feedbackSuggestion).toBeUndefined();
  });

  it('returns a suggestion on the third same-category dismissal in seven days', async () => {
    const deps = makeDeps({
      now: () => 1_000_000_000,
      copilotInsightsRepo: {
        listActive: vi.fn(() => []),
        getById: vi.fn(() => row({ id: 'i1', category: 'operational' })),
        dismiss: vi.fn(),
      },
      auditRepo: {
        list: vi.fn(() => [
          dismissedEvent('operational', 999_999_000),
          dismissedEvent('operational', 999_998_000),
        ]),
      },
    });
    const handlers = buildCopilotHandlers(deps);

    const result = await handlers.dismiss({ id: 'i1' });

    expect(result.feedbackSuggestion).toEqual({
      category: 'operational',
      dismissalsInWindow: 3,
      windowDays: 7,
      currentWeight: 1,
      suggestedWeight: 0.5,
      reason: 'You dismissed 3 operational insights in the last 7 days.',
    });
  });

  it('does not trigger on mixed categories', async () => {
    const deps = makeDeps({
      now: () => 1_000_000_000,
      copilotInsightsRepo: {
        listActive: vi.fn(() => []),
        getById: vi.fn(() => row({ id: 'i1', category: 'operational' })),
        dismiss: vi.fn(),
      },
      auditRepo: {
        list: vi.fn(() => [
          dismissedEvent('cost', 999_999_000),
          dismissedEvent('org', 999_998_000),
        ]),
      },
    });
    const handlers = buildCopilotHandlers(deps);

    const result = await handlers.dismiss({ id: 'i1' });

    expect(result.feedbackSuggestion).toBeUndefined();
  });

  it('does not count dismissals older than seven days', async () => {
    const deps = makeDeps({
      now: () => 1_000_000_000,
      copilotInsightsRepo: {
        listActive: vi.fn(() => []),
        getById: vi.fn(() => row({ id: 'i1', category: 'operational' })),
        dismiss: vi.fn(),
      },
      auditRepo: {
        list: vi.fn(() => [
          dismissedEvent('operational', 1_000_000_000 - 8 * 24 * 60 * 60 * 1000),
          dismissedEvent('operational', 999_998_000),
        ]),
      },
    });
    const handlers = buildCopilotHandlers(deps);

    const result = await handlers.dismiss({ id: 'i1' });

    expect(result.feedbackSuggestion).toBeUndefined();
  });

  it('suggests 0.0 when current category weight is already 0.5', async () => {
    const deps = makeDeps({
      now: () => 1_000_000_000,
      copilotInsightsRepo: {
        listActive: vi.fn(() => []),
        getById: vi.fn(() => row({ id: 'i1', category: 'operational' })),
        dismiss: vi.fn(),
      },
      auditRepo: {
        list: vi.fn(() => [
          dismissedEvent('operational', 999_999_000),
          dismissedEvent('operational', 999_998_000),
        ]),
      },
      settingsRepo: {
        getCopilotWeights: vi.fn(() => ({
          weights: { ...COPILOT_CATEGORY_WEIGHTS_DEFAULT, operational: 0.5 },
        })),
      },
    });
    const handlers = buildCopilotHandlers(deps);

    const result = await handlers.dismiss({ id: 'i1' });

    expect(result.feedbackSuggestion?.currentWeight).toBe(0.5);
    expect(result.feedbackSuggestion?.suggestedWeight).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// copilot.ask — T5 stub
// ---------------------------------------------------------------------------

describe('copilot.ask', () => {
  it('delegates to agenticLoopStart when the dep is wired', async () => {
    const agenticLoopStart = vi.fn(async () => ({
      runId: 'run-42',
      threadId: 'thr-42',
    }));
    const deps = makeDeps({ agenticLoopStart });
    const handlers = buildCopilotHandlers(deps);
    const result = await handlers.ask({ companyId: 'c1', text: 'why is frontend behind?' });
    expect(result).toEqual({ runId: 'run-42', threadId: 'thr-42' });
    expect(agenticLoopStart).toHaveBeenCalledWith({
      companyId: 'c1',
      text: 'why is frontend behind?',
    });
  });

  it('rejects empty companyId and empty / whitespace-only text before dispatching to the wired closure', async () => {
    // M33 T6: the composition root ALWAYS wires `agenticLoopStart` via
    // the copilot-service, so the T5 "stub in effect" branch is no
    // longer reachable from the IPC surface. The factory still defends
    // against a missing dep for safety (throws 'not implemented'), but
    // the runtime contract the handlers enforce — and the one worth
    // asserting on — is input validation BEFORE dispatch.
    const agenticLoopStart = vi.fn(async () => ({ runId: 'r', threadId: 't' }));
    const handlers = buildCopilotHandlers(makeDeps({ agenticLoopStart }));

    // Empty text fails before dispatch.
    await expect(handlers.ask({ companyId: 'c1', text: '  ' })).rejects.toThrow(/text/);
    // Empty companyId fails before dispatch.
    await expect(
      handlers.ask({ companyId: '', text: 'hello' } as unknown as {
        companyId: string;
        text: string;
      }),
    ).rejects.toThrow(/companyId/);

    // Neither invocation reaches the wired closure.
    expect(agenticLoopStart).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// copilot.configure
// ---------------------------------------------------------------------------

describe('copilot.configure', () => {
  it('forces a manual tick and echoes the counts in test mode', async () => {
    const tick = vi.fn(async () => ({
      runId: 'run-m',
      insightsProposed: 4,
      insightsGenerated: 3,
      insightsMerged: 1,
      insightsExpired: 2,
    }));
    const deps = makeDeps({
      isTestMode: () => true,
      copilotAnalyzerService: { tick },
    });
    const handlers = buildCopilotHandlers(deps);

    const result = await handlers.configure({ companyId: 'c1' });
    expect(tick).toHaveBeenCalledWith('c1', { reason: 'manual' });
    expect(result).toEqual({
      runId: 'run-m',
      insightsProposed: 4,
      insightsGenerated: 3,
      insightsMerged: 1,
      insightsExpired: 2,
    });
  });

  it('throws outside test mode without invoking the analyzer', async () => {
    const tick = vi.fn();
    const deps = makeDeps({
      isTestMode: () => false,
      copilotAnalyzerService: {
        tick: tick as unknown as CopilotHandlersDeps['copilotAnalyzerService']['tick'],
      },
    });
    const handlers = buildCopilotHandlers(deps);
    await expect(handlers.configure({ companyId: 'c1' })).rejects.toThrow(
      /test-only|settings\.setCopilot/,
    );
    expect(tick).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Type-smoke: DashboardEvent payload projection compiles without casts
// ---------------------------------------------------------------------------

// Compile-time only. Ensures the DashboardEvent import is referenced so
// tsc won't drop it, and documents the wire-contract stability.
const _typeSmoke: DashboardEvent<{
  insightId: string;
  dismissedAt: number;
  category: string;
  title: string;
}> = {
  id: 'evt',
  type: 'copilot.dismissed',
  companyId: 'c1',
  actorId: 'rocky',
  actorKind: 'user',
  payload: { insightId: 'i1', dismissedAt: 1, category: 'operational', title: 'Insight' },
  createdAt: 1,
};
void _typeSmoke;
