import { describe, expect, it, vi } from 'vitest';

import type { DashboardEvent } from '@team-x/shared-types';

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
    isTestMode: () => true,
    now: () => 5_000_000,
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
      payload: { insightId: string; dismissedAt: number };
    };
    expect(emitted.type).toBe('copilot.dismissed');
    expect(emitted.companyId).toBe('c1');
    expect(emitted.actorKind).toBe('user');
    expect(emitted.payload).toEqual({ insightId: 'i1', dismissedAt: 5_000_000 });

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

  it('throws when the stub is in effect (T5 default) or when text is missing', async () => {
    // Stub: no agenticLoopStart wired — T5 default state.
    const handlers1 = buildCopilotHandlers(makeDeps());
    await expect(handlers1.ask({ companyId: 'c1', text: 'hello' })).rejects.toThrow(
      /not implemented/i,
    );

    // Validation: empty text on a wired handler still fails before dispatch.
    const handlers2 = buildCopilotHandlers(
      makeDeps({ agenticLoopStart: vi.fn(async () => ({ runId: 'r', threadId: 't' })) }),
    );
    await expect(handlers2.ask({ companyId: 'c1', text: '  ' })).rejects.toThrow(/text/);
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
const _typeSmoke: DashboardEvent<{ insightId: string; dismissedAt: number }> = {
  id: 'evt',
  type: 'copilot.dismissed',
  companyId: 'c1',
  actorId: 'rocky',
  actorKind: 'user',
  payload: { insightId: 'i1', dismissedAt: 1 },
  createdAt: 1,
};
void _typeSmoke;
