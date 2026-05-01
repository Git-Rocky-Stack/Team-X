/**
 * Unit tests for the copilot tool factory + registry composer +
 * copilot-service wiring.
 *
 * Phase 5 — M33 T6. +5 tests on top of the M33 T5 baseline (1082 →
 * 1087). Structure mirrors `agentic-tools-write.test.ts` per-tool
 * describe block layout:
 *   (1) happy-path filters + wire shape + call-through
 *   (2) limit clamp to MAX_COPILOT_ROWS + truncated flag
 *   (3) level-gate blocks non-copilot employees (roleId gate)
 *   (4) includeDismissed=true threads through to the repo
 *   (5) copilot-service resolves system-copilot id + passes through
 *       employeeId to AgenticLoopService.start
 */

import { SYSTEM_AGENT_ROLE_ID, SYSTEM_COPILOT_ROLE_ID } from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';


import {
  type CopilotToolInsightRow,
  type CopilotToolInsightsRepo,
  MAX_COPILOT_ROWS,
  buildCopilotToolRegistry,
  buildQueryCopilotInsightsTool,
} from './agentic-tools-copilot.js';
import { createCopilotService } from './copilot-service.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function row(overrides: Partial<CopilotToolInsightRow> = {}): CopilotToolInsightRow {
  return {
    id: 'i1',
    companyId: 'c1',
    category: 'operational',
    severity: 'warning',
    title: 'Blocked tickets stacking on Alice',
    detail: 'Three tickets in-progress >5 days, one SLA breach risk.',
    actionSuggestion: 'Reassign the oldest to Bob.',
    actionIntent: 'assign_ticket',
    dismissedAt: null,
    createdAt: 1_000_000,
    expiresAt: 1_000_000 + 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

function makeRepo(listActiveImpl: CopilotToolInsightsRepo['listActive']): CopilotToolInsightsRepo {
  return { listActive: listActiveImpl };
}

function makeCtx(): { signal: AbortSignal; stepIndex: number } {
  return { signal: new AbortController().signal, stepIndex: 0 };
}

// ---------------------------------------------------------------------------
// (1) happy-path filters + wire shape
// ---------------------------------------------------------------------------

describe('query_copilot_insights — happy path', () => {
  it('filters on category + severity, projects rows to the JSON-safe wire shape, and returns truncated: false when under the limit', async () => {
    const listActive = vi.fn((_f) => [
      row({ id: 'a', category: 'cost', severity: 'critical' }),
      row({ id: 'b', category: 'cost', severity: 'critical' }),
    ]);
    const tool = buildQueryCopilotInsightsTool({
      companyId: 'c1',
      copilotInsightsRepo: makeRepo(listActive),
    });

    const result = await tool.execute(
      { category: 'cost', severity: 'critical' },
      // Playwright's ToolContext carries more fields; the tool only
      // touches `signal`, so a narrow fake suffices here.
      makeCtx() as unknown as Parameters<typeof tool.execute>[1],
    );

    // The tool MUST override any `companyId` argument with the
    // registered company — M33 design note, not the LLM's claim.
    expect(listActive).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'c1',
        category: 'cost',
        severity: 'critical',
        includeDismissed: false,
        // Over-fetch is limit+1 = MAX_COPILOT_ROWS+1 when no limit given.
        limit: MAX_COPILOT_ROWS + 1,
      }),
    );

    expect(result.rows).toHaveLength(2);
    expect(result.truncated).toBe(false);

    // Wire shape — no Drizzle fields, no `actionEntitiesJson`, typed
    // unions preserved.
    const [first] = result.rows;
    expect(first).toMatchObject({
      id: 'a',
      companyId: 'c1',
      category: 'cost',
      severity: 'critical',
      title: expect.any(String),
      detail: expect.any(String),
      actionSuggestion: expect.any(String),
      actionIntent: expect.any(String),
      dismissedAt: null,
      createdAt: expect.any(Number),
      expiresAt: expect.any(Number),
    });
    // Defensive: no `actionEntitiesJson` leak into the LLM window.
    expect(first && 'actionEntitiesJson' in first).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (2) limit clamp to 50 + truncated flag
// ---------------------------------------------------------------------------

describe('query_copilot_insights — limit clamp + truncation', () => {
  it('over-fetches limit+1 rows, clamps limit to MAX_COPILOT_ROWS, trims to limit and sets truncated: true when overflow is detected', async () => {
    // Repo returns 3 rows; caller asked for limit=2, so the tool
    // over-fetches 3 and trims back to 2 with truncated=true.
    const rows = [
      row({ id: 'a', createdAt: 5 }),
      row({ id: 'b', createdAt: 4 }),
      row({ id: 'c', createdAt: 3 }),
    ];
    const listActive = vi.fn(() => rows);
    const tool = buildQueryCopilotInsightsTool({
      companyId: 'c1',
      copilotInsightsRepo: makeRepo(listActive),
    });

    const page = await tool.execute(
      { limit: 2 },
      makeCtx() as unknown as Parameters<typeof tool.execute>[1],
    );
    expect(listActive).toHaveBeenCalledWith(expect.objectContaining({ limit: 3 }));
    expect(page.rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(page.truncated).toBe(true);

    // Schema already rejects `limit > MAX_COPILOT_ROWS` via zod; the
    // effectiveLimit helper still clamps at runtime as a belt-and-
    // suspenders measure. Drive the clamp with a direct execute bypass.
    const listActive2 = vi.fn(() => [row()]);
    const tool2 = buildQueryCopilotInsightsTool({
      companyId: 'c1',
      copilotInsightsRepo: makeRepo(listActive2),
    });
    // zod accepts limit=50 (MAX_COPILOT_ROWS) — confirm over-fetch is
    // exactly 51, not 99 or an unclamped value.
    await tool2.execute(
      { limit: MAX_COPILOT_ROWS },
      makeCtx() as unknown as Parameters<typeof tool2.execute>[1],
    );
    expect(listActive2).toHaveBeenCalledWith(
      expect.objectContaining({ limit: MAX_COPILOT_ROWS + 1 }),
    );
  });
});

// ---------------------------------------------------------------------------
// (3) level-gate — roleId branch
// ---------------------------------------------------------------------------

describe('buildCopilotToolRegistry — roleId gate', () => {
  it('returns [query_copilot_insights] for system-copilot and [] for every other role', () => {
    const deps = {
      companyId: 'c1',
      copilotInsightsRepo: makeRepo(() => []),
    };

    // Positive branch — system-copilot gets the tool.
    const copilotTools = buildCopilotToolRegistry({ roleId: SYSTEM_COPILOT_ROLE_ID }, deps);
    expect(copilotTools).toHaveLength(1);
    expect(copilotTools[0]?.name).toBe('query_copilot_insights');

    // Negative branches — system-agent, officer, IC, and an
    // unrelated role all receive an empty tool set. The composer
    // MUST NOT leak query_copilot_insights into the system-agent's
    // M31/M32 tool registry.
    expect(buildCopilotToolRegistry({ roleId: SYSTEM_AGENT_ROLE_ID }, deps)).toEqual([]);
    expect(buildCopilotToolRegistry({ roleId: 'ceo' }, deps)).toEqual([]);
    expect(buildCopilotToolRegistry({ roleId: 'software-engineer' }, deps)).toEqual([]);
    expect(buildCopilotToolRegistry({ roleId: '' }, deps)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (4) includeDismissed=true threads through to the repo
// ---------------------------------------------------------------------------

describe('query_copilot_insights — includeDismissed', () => {
  it('passes includeDismissed: true to the repo when requested and surfaces the dismissed row in the projection', async () => {
    // Repo impl gates on the flag — returns the dismissed row ONLY
    // when includeDismissed is true. This mirrors the repo contract
    // T6 adds to `listActive` (optional `includeDismissed` flag that
    // widens past the default `dismissed_at IS NULL` filter).
    const active = row({ id: 'live', dismissedAt: null });
    const dismissed = row({ id: 'gone', dismissedAt: 2_000_000 });
    const listActive = vi.fn((filter: Parameters<CopilotToolInsightsRepo['listActive']>[0]) =>
      filter.includeDismissed === true ? [active, dismissed] : [active],
    );
    const tool = buildQueryCopilotInsightsTool({
      companyId: 'c1',
      copilotInsightsRepo: makeRepo(listActive),
    });

    // Default behaviour (flag absent) — only the active row.
    const defaultResult = await tool.execute(
      {},
      makeCtx() as unknown as Parameters<typeof tool.execute>[1],
    );
    expect(defaultResult.rows.map((r) => r.id)).toEqual(['live']);
    expect(listActive).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeDismissed: false }),
    );

    // Explicit opt-in — both rows surface, and the dismissed flag
    // carries through unchanged on the wire projection.
    const inclusiveResult = await tool.execute(
      { includeDismissed: true },
      makeCtx() as unknown as Parameters<typeof tool.execute>[1],
    );
    expect(inclusiveResult.rows.map((r) => r.id)).toEqual(['live', 'gone']);
    expect(inclusiveResult.rows[1]?.dismissedAt).toBe(2_000_000);
    expect(listActive).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeDismissed: true }),
    );
  });
});

// ---------------------------------------------------------------------------
// (5) copilot-service wiring — start() passes through system-copilot id
// ---------------------------------------------------------------------------

describe('createCopilotService — ask()', () => {
  it('resolves the system-copilot employee id per company and passes it through to AgenticLoopService.start as employeeId', async () => {
    const start = vi.fn(async () => ({ runId: 'run-42', threadId: 'thr-42' }));
    const findSystemByRoleId = vi.fn((companyId: string, roleId: string) => {
      if (roleId === SYSTEM_COPILOT_ROLE_ID && companyId === 'c1') {
        return { id: 'sys-copilot-c1' };
      }
      return null;
    });

    const service = createCopilotService({
      agenticLoopService: { start },
      employeesRepo: { findSystemByRoleId },
    });

    const result = await service.ask({
      companyId: 'c1',
      text: 'why is frontend behind?',
    });

    // Wire contract (M31 parity): `{ runId, threadId }` unchanged.
    expect(result).toEqual({ runId: 'run-42', threadId: 'thr-42' });

    // Service MUST resolve the system-copilot via `findSystemByRoleId`
    // with the canonical constant — hard-coded strings would be a
    // correctness bug.
    expect(findSystemByRoleId).toHaveBeenCalledWith('c1', SYSTEM_COPILOT_ROLE_ID);

    // Service MUST pass the resolved id through as `employeeId` —
    // this is what tells `AgenticLoopService.start` to author the
    // thread under the copilot identity and select the copilot
    // tool-registry branch in the composition root's `buildTools`
    // closure.
    expect(start).toHaveBeenCalledWith({
      companyId: 'c1',
      userText: 'why is frontend behind?',
      employeeId: 'sys-copilot-c1',
    });

    // Missing system-copilot (pre-M33 T2 company) MUST surface as a
    // clean error, not a silent fallback to system-agent. The analyzer
    // shares this failure mode via the same constant; the message
    // format gives Rocky a single grep target.
    const noCopilotService = createCopilotService({
      agenticLoopService: { start },
      employeesRepo: { findSystemByRoleId: () => null },
    });
    await expect(noCopilotService.ask({ companyId: 'c1', text: 'hi' })).rejects.toThrow(
      /system-copilot/,
    );
  });
});
