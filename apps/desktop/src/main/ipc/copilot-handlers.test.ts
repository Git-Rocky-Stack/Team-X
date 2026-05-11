import { COPILOT_CATEGORY_WEIGHTS_DEFAULT } from '@team-x/shared-types';
import type { AuditEvent, CopilotCategory, DashboardEvent } from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';

import {
  aggregateCategoryWeightsFromDismissals,
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
// H14 audit (2026-05-07): "Copilot category-weight feedback loop is
// aspirational. Comments mark it Phase 6 / M38; dismissals are recorded but
// never aggregated. README claims it's live."
//
// Three pillars to the fix:
//   (1) `aggregateCategoryWeightsFromDismissals` — pure sweep-all-categories
//       aggregator that turns dismissal counts into a complete updated
//       weights map. Closes the missing aggregation step.
//   (2) `autoApplyDismissalFeedback` toggle on the dismiss handler — when
//       ON, the handler persists the new weights via `setCopilotWeights`,
//       emits `copilot.weights.changed` with the system-copilot actor, and
//       returns `feedbackApplied` instead of `feedbackSuggestion`. The loop
//       closes itself.
//   (3) Backward-compat — toggle defaults OFF; advisory UX preserved.
// ---------------------------------------------------------------------------
describe('copilot-handlers — H14 audit (2026-05-07): feedback loop closure', () => {
  // -------------------------------------------------------------------------
  // Pure helper: aggregateCategoryWeightsFromDismissals
  // -------------------------------------------------------------------------
  describe('aggregateCategoryWeightsFromDismissals', () => {
    it('lowers a single category that crosses the 3-dismissal threshold', () => {
      const result = aggregateCategoryWeightsFromDismissals({
        currentWeights: { ...COPILOT_CATEGORY_WEIGHTS_DEFAULT },
        dismissalCountsByCategory: { operational: 4 },
      });

      expect(result.weights.operational).toBe(0.5);
      expect(result.weights.cost).toBe(1);
      expect(result.weights.org).toBe(1);
      expect(result.changedCategories).toEqual([
        {
          category: 'operational',
          previousWeight: 1,
          newWeight: 0.5,
          dismissalsInWindow: 4,
          reason: 'You dismissed 4 operational insights in the last 7 days.',
        },
      ]);
    });

    it('does not lower categories below the 3-dismissal threshold', () => {
      const result = aggregateCategoryWeightsFromDismissals({
        currentWeights: { ...COPILOT_CATEGORY_WEIGHTS_DEFAULT },
        dismissalCountsByCategory: { operational: 2, cost: 1 },
      });

      expect(result.weights.operational).toBe(1);
      expect(result.weights.cost).toBe(1);
      expect(result.changedCategories).toEqual([]);
    });

    it('lowers multiple categories in a single sweep when several cross concurrently', () => {
      const result = aggregateCategoryWeightsFromDismissals({
        currentWeights: { ...COPILOT_CATEGORY_WEIGHTS_DEFAULT },
        dismissalCountsByCategory: { operational: 3, cost: 5, workflow: 2 },
      });

      expect(result.weights.operational).toBe(0.5);
      expect(result.weights.cost).toBe(0.5);
      expect(result.weights.workflow).toBe(1); // below threshold
      expect(result.changedCategories.map((c) => c.category).sort()).toEqual(['cost', 'operational']);
    });

    it('floors at 0 when current weight is already 0.5 and threshold is crossed again', () => {
      // Mirrors the `buildCopilotFeedbackSuggestion` floor: ≤ 0.5 → 0.
      const result = aggregateCategoryWeightsFromDismissals({
        currentWeights: { ...COPILOT_CATEGORY_WEIGHTS_DEFAULT, operational: 0.5 },
        dismissalCountsByCategory: { operational: 3 },
      });

      expect(result.weights.operational).toBe(0);
      expect(result.changedCategories[0]).toEqual({
        category: 'operational',
        previousWeight: 0.5,
        newWeight: 0,
        dismissalsInWindow: 3,
        reason: 'You dismissed 3 operational insights in the last 7 days.',
      });
    });

    it('is a no-op when a category is already at 0', () => {
      // `buildCopilotFeedbackSuggestion` returns null when suggested ===
      // current. The aggregator must propagate that — no spurious zero-delta
      // changes in the audit trail.
      const result = aggregateCategoryWeightsFromDismissals({
        currentWeights: { ...COPILOT_CATEGORY_WEIGHTS_DEFAULT, operational: 0 },
        dismissalCountsByCategory: { operational: 5 },
      });

      expect(result.weights.operational).toBe(0);
      expect(result.changedCategories).toEqual([]);
    });

    it('does not mutate the input weights map', () => {
      const input = { ...COPILOT_CATEGORY_WEIGHTS_DEFAULT };
      const snapshot = { ...input };
      aggregateCategoryWeightsFromDismissals({
        currentWeights: input,
        dismissalCountsByCategory: { operational: 3 },
      });
      expect(input).toEqual(snapshot);
    });
  });

  // -------------------------------------------------------------------------
  // Auto-apply path (toggle ON)
  // -------------------------------------------------------------------------
  describe('dismiss handler — auto-apply path', () => {
    it('persists new weights, emits copilot.weights.changed, and returns feedbackApplied when threshold crossed and toggle is ON', async () => {
      const setCopilotWeights = vi.fn(() => ({
        weights: { ...COPILOT_CATEGORY_WEIGHTS_DEFAULT, operational: 0.5 },
      }));
      const deps = makeDeps({
        now: () => 1_000_000_000,
        copilotInsightsRepo: {
          listActive: vi.fn(() => []),
          getById: vi.fn(() =>
            row({ id: 'i1', companyId: 'c1', category: 'operational' }),
          ),
          dismiss: vi.fn(),
        },
        auditRepo: {
          list: vi.fn(() => [
            dismissedEvent('operational', 999_999_000),
            dismissedEvent('operational', 999_998_000),
          ]),
        },
        settingsRepo: {
          getCopilotWeights: vi.fn(() => ({ weights: { ...COPILOT_CATEGORY_WEIGHTS_DEFAULT } })),
          setCopilotWeights,
        },
        autoApplyDismissalFeedback: () => true,
      });
      const handlers = buildCopilotHandlers(deps);

      const result = await handlers.dismiss({ id: 'i1' });

      // Weights were persisted with the lowered value for the dismissed
      // category. The full weights map is passed (not a partial) so the
      // settings repo's full-replace contract sees a consistent shape.
      expect(setCopilotWeights).toHaveBeenCalledTimes(1);
      const persistedArgs = setCopilotWeights.mock.calls[0]?.[0];
      expect(persistedArgs).toBeDefined();
      expect(persistedArgs?.companyId).toBe('c1');
      expect(persistedArgs?.weights.operational).toBe(0.5);

      // The terminal result is `feedbackApplied`, NOT `feedbackSuggestion` —
      // the loop closed itself.
      expect(result.feedbackSuggestion).toBeUndefined();
      expect(result.feedbackApplied).toEqual({
        category: 'operational',
        dismissalsInWindow: 3,
        windowDays: 7,
        previousWeight: 1,
        newWeight: 0.5,
        reason: 'You dismissed 3 operational insights in the last 7 days.',
      });

      // Two bus events fire: copilot.dismissed (always) AND
      // copilot.weights.changed (auto-apply only).
      const emit = vi.mocked(deps.bus.emit);
      const events = emit.mock.calls.map((c) => c[0]);
      const dismissed = events.find((e) => e.type === 'copilot.dismissed');
      expect(dismissed?.actorKind).toBe('user');
      expect(dismissed?.actorId).toBe('rocky');
      const weightsChanged = events.find((e) => e.type === 'copilot.weights.changed');
      expect(weightsChanged).toBeDefined();
      expect(weightsChanged?.actorKind).toBe('employee');
      expect(weightsChanged?.actorId).toBe('system-copilot');
      const payload = weightsChanged?.payload as {
        weights: Record<string, number>;
        changedKeys: string[];
        changedAt: number;
      };
      expect(payload.changedKeys).toEqual(['operational']);
      expect(payload.weights.operational).toBe(0.5);
      expect(payload.changedAt).toBe(1_000_000_000);
    });

    it('aggregates concurrent multi-category threshold crosses into a single weights write', async () => {
      const setCopilotWeights = vi.fn(() => ({
        weights: { ...COPILOT_CATEGORY_WEIGHTS_DEFAULT, operational: 0.5, cost: 0.5 },
      }));
      const deps = makeDeps({
        now: () => 1_000_000_000,
        copilotInsightsRepo: {
          listActive: vi.fn(() => []),
          getById: vi.fn(() =>
            row({ id: 'i1', companyId: 'c1', category: 'operational' }),
          ),
          dismiss: vi.fn(),
        },
        auditRepo: {
          // The audit repo's `list` call is shape-agnostic — both the
          // direct-category count AND the per-other-category sweep call
          // through this same fn. Returning an oversized list with both
          // operational AND cost dismissals exercises the multi-category
          // aggregation pillar.
          list: vi.fn(() => [
            dismissedEvent('operational', 999_999_000),
            dismissedEvent('operational', 999_998_000),
            dismissedEvent('cost', 999_997_000),
            dismissedEvent('cost', 999_996_000),
            dismissedEvent('cost', 999_995_000),
          ]),
        },
        settingsRepo: {
          getCopilotWeights: vi.fn(() => ({ weights: { ...COPILOT_CATEGORY_WEIGHTS_DEFAULT } })),
          setCopilotWeights,
        },
        autoApplyDismissalFeedback: () => true,
      });
      const handlers = buildCopilotHandlers(deps);

      const result = await handlers.dismiss({ id: 'i1' });

      expect(setCopilotWeights).toHaveBeenCalledTimes(1);
      const persistedArgs = setCopilotWeights.mock.calls[0]?.[0];
      expect(persistedArgs?.weights.operational).toBe(0.5);
      expect(persistedArgs?.weights.cost).toBe(0.5);

      const emit = vi.mocked(deps.bus.emit);
      const weightsChanged = emit.mock.calls
        .map((c) => c[0])
        .find((e) => e.type === 'copilot.weights.changed');
      const payload = weightsChanged?.payload as { changedKeys: string[] };
      expect(payload.changedKeys.sort()).toEqual(['cost', 'operational']);

      // The primary feedbackApplied row is the dismissed category, even
      // when multiple crossed in the same write.
      expect(result.feedbackApplied?.category).toBe('operational');
    });

    it('falls back to advisory suggestion when setCopilotWeights dep is missing (graceful degradation)', async () => {
      // Composition-root wiring gap. The handler must NOT crash; it
      // surfaces the gap via console + returns the advisory path.
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const deps = makeDeps({
        now: () => 1_000_000_000,
        copilotInsightsRepo: {
          listActive: vi.fn(() => []),
          getById: vi.fn(() =>
            row({ id: 'i1', companyId: 'c1', category: 'operational' }),
          ),
          dismiss: vi.fn(),
        },
        auditRepo: {
          list: vi.fn(() => [
            dismissedEvent('operational', 999_999_000),
            dismissedEvent('operational', 999_998_000),
          ]),
        },
        settingsRepo: {
          getCopilotWeights: vi.fn(() => ({ weights: { ...COPILOT_CATEGORY_WEIGHTS_DEFAULT } })),
          // setCopilotWeights intentionally undefined
        },
        autoApplyDismissalFeedback: () => true,
      });
      const handlers = buildCopilotHandlers(deps);

      const result = await handlers.dismiss({ id: 'i1' });

      expect(result.feedbackApplied).toBeUndefined();
      expect(result.feedbackSuggestion?.category).toBe('operational');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/setCopilotWeights is missing/),
      );

      consoleWarnSpy.mockRestore();
    });

    it('falls back to advisory suggestion when setCopilotWeights throws', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const setCopilotWeights = vi.fn(() => {
        throw new Error('disk full');
      });
      const deps = makeDeps({
        now: () => 1_000_000_000,
        copilotInsightsRepo: {
          listActive: vi.fn(() => []),
          getById: vi.fn(() =>
            row({ id: 'i1', companyId: 'c1', category: 'operational' }),
          ),
          dismiss: vi.fn(),
        },
        auditRepo: {
          list: vi.fn(() => [
            dismissedEvent('operational', 999_999_000),
            dismissedEvent('operational', 999_998_000),
          ]),
        },
        settingsRepo: {
          getCopilotWeights: vi.fn(() => ({ weights: { ...COPILOT_CATEGORY_WEIGHTS_DEFAULT } })),
          setCopilotWeights,
        },
        autoApplyDismissalFeedback: () => true,
      });
      const handlers = buildCopilotHandlers(deps);

      const result = await handlers.dismiss({ id: 'i1' });

      expect(setCopilotWeights).toHaveBeenCalledTimes(1);
      expect(result.feedbackApplied).toBeUndefined();
      expect(result.feedbackSuggestion?.category).toBe('operational');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/auto-apply persistence failed/),
        expect.any(Error),
      );
      // copilot.weights.changed must NOT have been emitted on the failure path
      const emit = vi.mocked(deps.bus.emit);
      const weightsChanged = emit.mock.calls
        .map((c) => c[0])
        .find((e) => e.type === 'copilot.weights.changed');
      expect(weightsChanged).toBeUndefined();

      consoleWarnSpy.mockRestore();
    });

    it('does not auto-apply when below the 3-dismissal threshold even with toggle ON', async () => {
      const setCopilotWeights = vi.fn();
      const deps = makeDeps({
        now: () => 1_000_000_000,
        copilotInsightsRepo: {
          listActive: vi.fn(() => []),
          getById: vi.fn(() =>
            row({ id: 'i1', companyId: 'c1', category: 'operational' }),
          ),
          dismiss: vi.fn(),
        },
        auditRepo: {
          list: vi.fn(() => [dismissedEvent('operational', 999_999_000)]),
        },
        settingsRepo: {
          getCopilotWeights: vi.fn(() => ({ weights: { ...COPILOT_CATEGORY_WEIGHTS_DEFAULT } })),
          setCopilotWeights,
        },
        autoApplyDismissalFeedback: () => true,
      });
      const handlers = buildCopilotHandlers(deps);

      const result = await handlers.dismiss({ id: 'i1' });

      // No suggestion → no apply → no setter call → no extra bus emit.
      expect(setCopilotWeights).not.toHaveBeenCalled();
      expect(result.feedbackApplied).toBeUndefined();
      expect(result.feedbackSuggestion).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Advisory path back-compat (toggle OFF — the default)
  // -------------------------------------------------------------------------
  describe('dismiss handler — advisory path (regression pin)', () => {
    it('returns feedbackSuggestion when toggle is OFF, even with setCopilotWeights wired', async () => {
      const setCopilotWeights = vi.fn();
      const deps = makeDeps({
        now: () => 1_000_000_000,
        copilotInsightsRepo: {
          listActive: vi.fn(() => []),
          getById: vi.fn(() =>
            row({ id: 'i1', companyId: 'c1', category: 'operational' }),
          ),
          dismiss: vi.fn(),
        },
        auditRepo: {
          list: vi.fn(() => [
            dismissedEvent('operational', 999_999_000),
            dismissedEvent('operational', 999_998_000),
          ]),
        },
        settingsRepo: {
          getCopilotWeights: vi.fn(() => ({ weights: { ...COPILOT_CATEGORY_WEIGHTS_DEFAULT } })),
          setCopilotWeights, // wired but should not be called
        },
        autoApplyDismissalFeedback: () => false,
      });
      const handlers = buildCopilotHandlers(deps);

      const result = await handlers.dismiss({ id: 'i1' });

      expect(setCopilotWeights).not.toHaveBeenCalled();
      expect(result.feedbackApplied).toBeUndefined();
      expect(result.feedbackSuggestion?.category).toBe('operational');
      expect(result.feedbackSuggestion?.suggestedWeight).toBe(0.5);
    });

    it('returns feedbackSuggestion when toggle dep is omitted entirely (default OFF)', async () => {
      const setCopilotWeights = vi.fn();
      const deps = makeDeps({
        now: () => 1_000_000_000,
        copilotInsightsRepo: {
          listActive: vi.fn(() => []),
          getById: vi.fn(() =>
            row({ id: 'i1', companyId: 'c1', category: 'operational' }),
          ),
          dismiss: vi.fn(),
        },
        auditRepo: {
          list: vi.fn(() => [
            dismissedEvent('operational', 999_999_000),
            dismissedEvent('operational', 999_998_000),
          ]),
        },
        settingsRepo: {
          getCopilotWeights: vi.fn(() => ({ weights: { ...COPILOT_CATEGORY_WEIGHTS_DEFAULT } })),
          setCopilotWeights,
        },
        // autoApplyDismissalFeedback intentionally omitted — pre-H14 default
      });
      const handlers = buildCopilotHandlers(deps);

      const result = await handlers.dismiss({ id: 'i1' });

      expect(setCopilotWeights).not.toHaveBeenCalled();
      expect(result.feedbackApplied).toBeUndefined();
      expect(result.feedbackSuggestion).toBeDefined();
    });
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
