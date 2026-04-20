/**
 * CopilotAnalyzerService — unit tests. Phase 5 — M33 T4.
 *
 * 12 tests split across six concerns per the T4 brief:
 *   - buildAnalysisPrompt determinism (2)
 *   - Zod schema happy-path + malformed retry (3)
 *   - pause-aware dispatch (2)
 *   - dedup integration (2)
 *   - expiry cycle (2)
 *   - AbortController cancel (1)
 *
 * The 2 event-triggered debounce tests live in copilot-event-trigger.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ActorKind,
  CopilotAnalyzedPayload,
  CopilotCategory,
  CopilotCategoryWeights,
  CopilotExpiredPayload,
  CopilotInsightPayload,
  CopilotSeverity,
  DashboardEvent,
  EventType,
} from '@team-x/shared-types';
import { COPILOT_CATEGORY_WEIGHTS_DEFAULT } from '@team-x/shared-types';

import type { CopilotInsightRow } from '../db/repos/copilot-insights.js';

import * as analyzerModule from './copilot-analyzer-service.js';
import {
  type CopilotAnalyzerCompaniesRepo,
  type CopilotAnalyzerCompleteFn,
  type CopilotAnalyzerEmployeesRepo,
  type CopilotAnalyzerEventBus,
  type CopilotAnalyzerEventWindow,
  type CopilotAnalyzerInsightsRepo,
  type CopilotAnalyzerOrchestratorLike,
  type CopilotAnalyzerResolvedComplete,
  type CopilotAnalyzerRunsRepo,
  type CopilotAnalyzerServiceDeps,
  type CopilotAnalyzerSettings,
  type InsightDraft,
  buildAnalysisPrompt,
  createCopilotAnalyzerService,
  parseDrafts,
  summarizeEventWindow,
} from './copilot-analyzer-service.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

interface BusEmission {
  type: EventType;
  companyId: string;
  actorId: string;
  actorKind: ActorKind;
  payload: unknown;
}

function makeFakeBus(): { bus: CopilotAnalyzerEventBus; emissions: BusEmission[] } {
  const emissions: BusEmission[] = [];
  const bus: CopilotAnalyzerEventBus = {
    emit: <T>(input: {
      type: EventType;
      companyId: string;
      actorId: string;
      actorKind: ActorKind;
      payload: T;
    }) => {
      emissions.push({ ...input });
      return {
        id: `e-${emissions.length}`,
        type: input.type,
        companyId: input.companyId,
        actorId: input.actorId,
        actorKind: input.actorKind,
        payload: input.payload,
        createdAt: 1_000,
      };
    },
  };
  return { bus, emissions };
}

function makeFakeEmployeesRepo(): CopilotAnalyzerEmployeesRepo {
  return {
    findSystemByRoleId: (_companyId, roleId) =>
      roleId === 'system-copilot' ? { id: 'sys-copilot-1' } : null,
  };
}

interface FakeRunsRepo extends CopilotAnalyzerRunsRepo {
  readonly starts: Array<Parameters<CopilotAnalyzerRunsRepo['start']>[0]>;
  readonly finishes: Array<{
    id: string;
    input: Parameters<CopilotAnalyzerRunsRepo['finish']>[1];
  }>;
}

function makeFakeRunsRepo(): FakeRunsRepo {
  const starts: FakeRunsRepo['starts'] = [];
  const finishes: FakeRunsRepo['finishes'] = [];
  return {
    starts,
    finishes,
    start(input) {
      starts.push(input);
      return `run-${starts.length}`;
    },
    finish(id, input) {
      finishes.push({ id, input });
    },
  };
}

interface FakeInsightsRepo extends CopilotAnalyzerInsightsRepo {
  readonly upserts: Array<Parameters<CopilotAnalyzerInsightsRepo['upsertWithDedup']>[0]>;
  readonly listStaleCalls: number[];
  readonly expireStaleCalls: number[];
  stale: CopilotInsightRow[];
  active: CopilotInsightRow[];
  mergeIds: Set<string>;
}

function makeFakeInsightsRepo(): FakeInsightsRepo {
  const upserts: FakeInsightsRepo['upserts'] = [];
  const listStaleCalls: number[] = [];
  const expireStaleCalls: number[] = [];
  const repo: FakeInsightsRepo = {
    upserts,
    listStaleCalls,
    expireStaleCalls,
    stale: [],
    active: [],
    mergeIds: new Set(),
    listActive: () => repo.active.slice(),
    upsertWithDedup: (draft) => {
      upserts.push(draft);
      const merged = repo.mergeIds.has(draft.title);
      return { id: `insight-${upserts.length}`, merged };
    },
    expireStale: (now) => {
      expireStaleCalls.push(now);
      const count = repo.stale.length;
      repo.stale = [];
      return count;
    },
    listStale: (now) => {
      listStaleCalls.push(now);
      return repo.stale.slice();
    },
  };
  return repo;
}

function makeFakeWindow(events: DashboardEvent[] = []): CopilotAnalyzerEventWindow {
  return { snapshot: () => events.slice() };
}

function makeFakeCompaniesRepo(): CopilotAnalyzerCompaniesRepo {
  return { list: () => [{ id: 'co-1', name: 'Acme' }] };
}

function makeFakeOrchestrator(paused = false): {
  orchestrator: CopilotAnalyzerOrchestratorLike;
  setPaused: (v: boolean) => void;
} {
  let isPaused = paused;
  return {
    orchestrator: { isCompanyPaused: () => isPaused },
    setPaused: (v) => {
      isPaused = v;
    },
  };
}

function insightRow(overrides: Partial<CopilotInsightRow> = {}): CopilotInsightRow {
  return {
    id: overrides.id ?? `row-${Math.random().toString(36).slice(2, 8)}`,
    companyId: overrides.companyId ?? 'co-1',
    category: overrides.category ?? 'operational',
    severity: overrides.severity ?? 'info',
    title: overrides.title ?? 'Default title',
    detail: overrides.detail ?? 'Default detail',
    actionSuggestion: overrides.actionSuggestion ?? null,
    actionIntent: overrides.actionIntent ?? null,
    actionEntitiesJson: overrides.actionEntitiesJson ?? null,
    dismissedAt: overrides.dismissedAt ?? null,
    createdAt: overrides.createdAt ?? 1_000,
    expiresAt: overrides.expiresAt ?? 2_000,
  };
}

function validDraftsJson(count = 1): string {
  const items = Array.from({ length: count }, (_, i) => ({
    category: 'operational',
    severity: 'info',
    title: `Draft title ${i}`,
    body: `Draft body ${i} with evidence numbers like ${i * 7}.`,
    expiresInHours: 12,
  }));
  return JSON.stringify(items);
}

function draftsJson(
  items: Array<{
    category: CopilotCategory;
    severity: CopilotSeverity;
    title: string;
    body?: string;
  }>,
): string {
  return JSON.stringify(
    items.map((item) => ({
      ...item,
      body: item.body ?? `${item.title} body with enough evidence to pass validation.`,
      expiresInHours: 12,
    })),
  );
}

function draft(
  category: CopilotCategory,
  severity: CopilotSeverity,
  title = `${category}-${severity}`,
): InsightDraft {
  return {
    category,
    severity,
    title,
    body: `${title} body with enough evidence to pass validation.`,
    expiresInHours: 12,
  };
}

function makeWeights(overrides: Partial<CopilotCategoryWeights> = {}): CopilotCategoryWeights {
  return {
    ...COPILOT_CATEGORY_WEIGHTS_DEFAULT,
    ...overrides,
  };
}

function weightInsightDrafts(
  drafts: readonly InsightDraft[],
  weights: CopilotCategoryWeights,
): InsightDraft[] {
  return (
    analyzerModule as unknown as {
      weightInsightDrafts: (
        drafts: readonly InsightDraft[],
        weights: CopilotCategoryWeights,
      ) => InsightDraft[];
    }
  ).weightInsightDrafts(drafts, weights);
}

function scriptedComplete(scripts: string[]): {
  fn: CopilotAnalyzerCompleteFn;
  calls: Array<{ system: string; user: string }>;
} {
  const calls: Array<{ system: string; user: string }> = [];
  const fn: CopilotAnalyzerCompleteFn = async (req) => {
    calls.push({ system: req.system, user: req.user });
    if (req.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const text = scripts[calls.length - 1] ?? scripts[scripts.length - 1] ?? '[]';
    return {
      text,
      promptTokens: 100,
      completionTokens: 50,
      costUsd: 0.001,
      provider: 'test-mode',
      model: 'test-copilot',
    };
  };
  return { fn, calls };
}

function resolvedFromScripts(scripts: string[]): {
  resolved: (args: {
    companyId: string;
    systemCopilotId: string;
  }) => Promise<CopilotAnalyzerResolvedComplete>;
  calls: Array<{ system: string; user: string }>;
} {
  const { fn, calls } = scriptedComplete(scripts);
  const resolved = async (): Promise<CopilotAnalyzerResolvedComplete> => ({
    complete: fn,
    provider: 'test-mode',
    model: 'test-copilot',
  });
  return { resolved, calls };
}

function baseDeps(overrides: Partial<CopilotAnalyzerServiceDeps> = {}): {
  deps: CopilotAnalyzerServiceDeps;
  bus: ReturnType<typeof makeFakeBus>;
  runsRepo: FakeRunsRepo;
  insightsRepo: FakeInsightsRepo;
} {
  const bus = makeFakeBus();
  const runsRepo = makeFakeRunsRepo();
  const insightsRepo = makeFakeInsightsRepo();
  const orch = makeFakeOrchestrator(false);
  const { resolved } = resolvedFromScripts([validDraftsJson(1)]);
  const deps: CopilotAnalyzerServiceDeps = {
    companiesRepo: makeFakeCompaniesRepo(),
    employeesRepo: makeFakeEmployeesRepo(),
    runsRepo,
    copilotInsightsRepo: insightsRepo,
    copilotEventWindow: makeFakeWindow([]),
    bus: bus.bus,
    orchestrator: orch.orchestrator,
    resolveComplete: resolved,
    now: () => 10_000,
    newId: (() => {
      let i = 0;
      return () => `tick-${++i}`;
    })(),
    pauseGatePollMs: 1,
    setInterval: (() => 0) as unknown as typeof setInterval,
    clearInterval: (() => {}) as unknown as typeof clearInterval,
    logger: { warn: () => {}, error: () => {} },
    ...overrides,
  };
  return { deps, bus, runsRepo, insightsRepo };
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('copilot-analyzer-service — weightInsightDrafts', () => {
  it('drops drafts in categories weighted to zero', () => {
    const result = weightInsightDrafts(
      [draft('cost', 'critical'), draft('operational', 'warning')],
      makeWeights({ cost: 0 }),
    );

    expect(result.map((x) => x.category)).toEqual(['operational']);
  });

  it('sorts critical above warning before equal weights', () => {
    const result = weightInsightDrafts(
      [draft('operational', 'warning'), draft('cost', 'critical')],
      makeWeights(),
    );

    expect(result.map((x) => x.severity)).toEqual(['critical', 'warning']);
  });

  it('lets a category multiplier push warning above an unboosted critical', () => {
    const result = weightInsightDrafts(
      [draft('operational', 'critical'), draft('cost', 'warning')],
      makeWeights({ cost: 2 }),
    );

    expect(result.map((x) => x.category)).toEqual(['cost', 'operational']);
  });

  it('caps weighted drafts at five per tick', () => {
    const result = weightInsightDrafts(
      [
        draft('operational', 'info', 'd1'),
        draft('cost', 'info', 'd2'),
        draft('org', 'info', 'd3'),
        draft('workflow', 'info', 'd4'),
        draft('anomaly', 'info', 'd5'),
        draft('operational', 'info', 'd6'),
      ],
      makeWeights(),
    );

    expect(result.map((x) => x.title)).toEqual(['d1', 'd2', 'd3', 'd4', 'd5']);
  });
});

describe('copilot-analyzer-service — buildAnalysisPrompt determinism', () => {
  it('produces identical prompts for identical inputs', () => {
    const events: DashboardEvent[] = [
      {
        id: 'e1',
        type: 'meeting.ended',
        companyId: 'co-1',
        actorId: 'emp-1',
        actorKind: 'employee',
        payload: {},
        createdAt: 500,
      },
      {
        id: 'e2',
        type: 'work.completed',
        companyId: 'co-1',
        actorId: 'emp-2',
        actorKind: 'employee',
        payload: {},
        createdAt: 600,
      },
    ];
    const active: CopilotInsightRow[] = [insightRow({ title: 'Known issue' })];
    const args = {
      events,
      activeInsights: active,
      companyContext: { name: 'Acme' },
      categories: ['operational', 'cost'] as const,
    };
    const a = buildAnalysisPrompt(args);
    const b = buildAnalysisPrompt(args);
    expect(a.system).toBe(b.system);
    expect(a.user).toBe(b.user);
    expect(a.user).toContain('[meeting.ended]');
    expect(a.user).toContain('Known issue');
    expect(a.system).toContain('operational, cost');
  });

  it('truncates when events exceed the char cap', () => {
    const manyEvents: DashboardEvent[] = Array.from({ length: 500 }, (_, i) => ({
      id: `e-${i}`,
      type: 'work.completed' as EventType,
      companyId: 'co-1',
      actorId: `actor-${i}-with-a-fairly-long-padded-identifier-for-bulk-fill`,
      actorKind: 'employee' as ActorKind,
      payload: {},
      createdAt: i,
    }));
    const summary = summarizeEventWindow(manyEvents);
    expect(summary.length).toBeLessThanOrEqual(2001); // cap + newline allowance
    expect(summary.endsWith('… (truncated)')).toBe(true);
  });
});

describe('copilot-analyzer-service — Zod schema + nudge retry', () => {
  it('parses a happy-path array of valid drafts', () => {
    const drafts = parseDrafts(validDraftsJson(2));
    expect(drafts).not.toBeNull();
    expect(drafts).toHaveLength(2);
    expect(drafts?.[0]?.category).toBe('operational');
  });

  it('retries on first-attempt malformed output (nudge) and succeeds', async () => {
    const { resolved, calls } = resolvedFromScripts([
      'I am sorry, here is my analysis:',
      validDraftsJson(1),
    ]);
    const { deps, bus } = baseDeps({ resolveComplete: resolved });
    const svc = createCopilotAnalyzerService(deps);
    const result = await svc.tick('co-1');
    expect(calls).toHaveLength(2);
    const firstUser = calls[0]?.user ?? '';
    const retryUser = calls[1]?.user ?? '';
    expect(firstUser).not.toContain('previous response was NOT valid JSON');
    expect(retryUser).toContain('previous response was NOT valid JSON');
    expect(result.insightsProposed).toBe(1);
    expect(result.insightsGenerated).toBe(1);
    expect(bus.emissions.some((e) => e.type === 'copilot.insight')).toBe(true);
  });

  it('skips the cycle with reason="malformed_output" after two failures', async () => {
    const { resolved, calls } = resolvedFromScripts(['garbage response one', 'still not JSON']);
    const { deps, bus } = baseDeps({ resolveComplete: resolved });
    const svc = createCopilotAnalyzerService(deps);
    const result = await svc.tick('co-1');
    expect(calls).toHaveLength(2);
    expect(result.reason).toBe('malformed_output');
    expect(result.insightsProposed).toBe(0);
    expect(result.insightsGenerated).toBe(0);
    const analyzed = bus.emissions.find((e) => e.type === 'copilot.analyzed');
    expect(analyzed).toBeDefined();
    expect((analyzed?.payload as CopilotAnalyzedPayload).reason).toBe('malformed_output');
  });
});

describe('copilot-analyzer-service — pause-aware dispatch', () => {
  it('short-circuits when company is paused before tick', async () => {
    const orch = makeFakeOrchestrator(true);
    const { resolved, calls } = resolvedFromScripts([validDraftsJson(1)]);
    const { deps, bus } = baseDeps({
      orchestrator: orch.orchestrator,
      resolveComplete: resolved,
    });
    const svc = createCopilotAnalyzerService(deps);
    const result = await svc.tick('co-1');
    expect(calls).toHaveLength(0);
    expect(result.reason).toBe('company_paused');
    const analyzed = bus.emissions.find((e) => e.type === 'copilot.analyzed');
    expect((analyzed?.payload as CopilotAnalyzedPayload).reason).toBe('company_paused');
  });

  it('awaits pause release before calling provider', async () => {
    vi.useFakeTimers();
    try {
      const orch = makeFakeOrchestrator(false);
      orch.setPaused(false);
      // Establish the analyzer with pause initially false so the pre-tick
      // gate passes, then flip to paused so the inner `waitUntilUnpaused`
      // poll loop runs before completing the tick.
      let ticksSinceStart = 0;
      const { resolved, calls } = resolvedFromScripts([validDraftsJson(1)]);
      const { deps, bus } = baseDeps({
        orchestrator: {
          isCompanyPaused: () => {
            // First pre-tick check: not paused (proceed). Next call (in
            // waitUntilUnpaused): paused once, then unpaused forever.
            const v = ticksSinceStart === 1;
            ticksSinceStart++;
            return v;
          },
        },
        resolveComplete: resolved,
        pauseGatePollMs: 5,
      });
      const svc = createCopilotAnalyzerService(deps);
      const tickPromise = svc.tick('co-1');
      await vi.advanceTimersByTimeAsync(20);
      const result = await tickPromise;
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(result.reason).toBe('manual');
      const analyzed = bus.emissions.find((e) => e.type === 'copilot.analyzed');
      expect((analyzed?.payload as CopilotAnalyzedPayload).reason).toBe('manual');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('copilot-analyzer-service — dedup integration', () => {
  it('emits copilot.insight only for newly-inserted drafts', async () => {
    const { resolved } = resolvedFromScripts([validDraftsJson(2)]);
    const { deps, bus, insightsRepo } = baseDeps({ resolveComplete: resolved });
    const svc = createCopilotAnalyzerService(deps);
    const result = await svc.tick('co-1');
    expect(result.insightsProposed).toBe(2);
    expect(result.insightsGenerated).toBe(2);
    expect(result.insightsMerged).toBe(0);
    const insightEmissions = bus.emissions.filter((e) => e.type === 'copilot.insight');
    expect(insightEmissions).toHaveLength(2);
    expect(insightsRepo.upserts).toHaveLength(2);
    const first = insightEmissions[0]?.payload as CopilotInsightPayload;
    expect(first.category).toBe('operational');
    expect(first.title).toBe('Draft title 0');
  });

  it('increments mergedCount and does not emit copilot.insight for merges', async () => {
    const { resolved } = resolvedFromScripts([validDraftsJson(2)]);
    const { deps, bus, insightsRepo } = baseDeps({ resolveComplete: resolved });
    // Pre-register both draft titles as "already present" so dedup
    // merges both. Same fake contract — upsertWithDedup returns merged:true
    // for titles in mergeIds.
    insightsRepo.mergeIds.add('Draft title 0');
    insightsRepo.mergeIds.add('Draft title 1');
    const svc = createCopilotAnalyzerService(deps);
    const result = await svc.tick('co-1');
    expect(result.insightsProposed).toBe(2);
    expect(result.insightsGenerated).toBe(0);
    expect(result.insightsMerged).toBe(2);
    const insightEmissions = bus.emissions.filter((e) => e.type === 'copilot.insight');
    expect(insightEmissions).toHaveLength(0);
  });

  it('keeps proposed count pre-weight but skips zero-weight categories before persistence', async () => {
    const { resolved } = resolvedFromScripts([
      draftsJson([
        { category: 'cost', severity: 'critical', title: 'Cost spike' },
        { category: 'operational', severity: 'warning', title: 'Ops drift' },
      ]),
    ]);
    const { deps, insightsRepo } = baseDeps({
      resolveComplete: resolved,
      getSettings: () =>
        ({
          enabled: true,
          intervalMinutes: 5,
          categories: ['operational', 'cost', 'org', 'workflow', 'anomaly'],
          categoryWeights: makeWeights({ cost: 0 }),
        }) as CopilotAnalyzerSettings,
    });
    const svc = createCopilotAnalyzerService(deps);

    const result = await svc.tick('co-1');

    expect(result.insightsProposed).toBe(2);
    expect(result.insightsGenerated).toBe(1);
    expect(insightsRepo.upserts.map((x) => x.category)).toEqual(['operational']);
  });
});

describe('copilot-analyzer-service — expiry cycle', () => {
  it('calls expireStale with current now at top of tick', async () => {
    const { resolved } = resolvedFromScripts([validDraftsJson(0)]);
    const { deps, insightsRepo } = baseDeps({ resolveComplete: resolved, now: () => 55_555 });
    const svc = createCopilotAnalyzerService(deps);
    await svc.tick('co-1');
    expect(insightsRepo.listStaleCalls).toEqual([55_555]);
    expect(insightsRepo.expireStaleCalls).toEqual([55_555]);
  });

  it('emits copilot.expired per stale row before the delete sweep', async () => {
    const { resolved } = resolvedFromScripts([validDraftsJson(0)]);
    const { deps, bus, insightsRepo } = baseDeps({ resolveComplete: resolved });
    insightsRepo.stale = [
      insightRow({ id: 'stale-1', title: 'Old A' }),
      insightRow({ id: 'stale-2', title: 'Old B', category: 'workflow' }),
    ];
    const svc = createCopilotAnalyzerService(deps);
    const result = await svc.tick('co-1');
    expect(result.insightsExpired).toBe(2);
    const expired = bus.emissions.filter((e) => e.type === 'copilot.expired');
    expect(expired).toHaveLength(2);
    expect((expired[0]?.payload as CopilotExpiredPayload).insightId).toBe('stale-1');
    expect((expired[0]?.payload as CopilotExpiredPayload).title).toBe('Old A');
    expect((expired[1]?.payload as CopilotExpiredPayload).category).toBe('workflow');
    // Per-row events must fire BEFORE the analyzed terminal event.
    const firstExpiredIdx = bus.emissions.findIndex((e) => e.type === 'copilot.expired');
    const analyzedIdx = bus.emissions.findIndex((e) => e.type === 'copilot.analyzed');
    expect(firstExpiredIdx).toBeLessThan(analyzedIdx);
  });
});

describe('copilot-analyzer-service — AbortController', () => {
  it('aborts in-flight tick on stop(companyId) and coerces status to cancelled', async () => {
    // Completion fn that awaits abort — mirrors a slow provider call.
    const calls: Array<{ system: string; user: string }> = [];
    const completeFn: CopilotAnalyzerCompleteFn = (req) => {
      calls.push({ system: req.system, user: req.user });
      return new Promise((_resolve, reject) => {
        if (req.signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        req.signal.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
      });
    };
    const { deps, runsRepo, bus } = baseDeps({
      resolveComplete: async () => ({
        complete: completeFn,
        provider: 'test-mode',
        model: 'test-copilot',
      }),
    });
    const svc = createCopilotAnalyzerService(deps);
    const tickPromise = svc.tick('co-1');
    // Yield once so the completion IIFE attaches its abort listener.
    await new Promise((r) => setTimeout(r, 0));
    svc.stop('co-1');
    const result = await tickPromise;
    expect(result.status).toBe('cancelled');
    expect(calls).toHaveLength(1);
    // runs.finish must have been called with status='cancelled'
    const finish = runsRepo.finishes.at(-1);
    expect(finish?.input.status).toBe('cancelled');
    // Terminal copilot.analyzed still emitted
    const analyzed = bus.emissions.find((e) => e.type === 'copilot.analyzed');
    expect(analyzed).toBeDefined();
  });
});

describe('copilot-analyzer-service — restart picks up new settings', () => {
  it('uses the latest intervalMinutes on the subsequent scheduled timer', () => {
    // Capture every setInterval invocation so we can assert the scheduled
    // cadence changed after restart without running any actual ticks.
    const scheduled: number[] = [];
    let currentInterval = 5;
    const { deps } = baseDeps({
      getSettings: () => ({
        enabled: true,
        intervalMinutes: currentInterval,
        categories: ['operational', 'cost', 'org', 'workflow', 'anomaly'],
        categoryWeights: makeWeights(),
      }),
      setInterval: ((_fn: () => void, ms: number) => {
        scheduled.push(ms);
        // Must return a truthy handle — the production `stop()` gates
        // `clearInterval(timer)` + `schedules.delete(companyId)` on
        // `if (timer)`, so returning 0 would leave the schedule map
        // stale and the subsequent `start()` would short-circuit on
        // the `schedules.has()` guard.
        return { ref: scheduled.length } as unknown as ReturnType<typeof setInterval>;
      }) as unknown as typeof setInterval,
      clearInterval: (() => {}) as unknown as typeof clearInterval,
    });
    const svc = createCopilotAnalyzerService(deps);

    svc.start('co-1');
    expect(scheduled).toEqual([5 * 60 * 1000]);

    // Simulate a settings mutation changing the interval to 17 minutes.
    currentInterval = 17;
    svc.restart('co-1');

    // Restart should have stopped the old timer and scheduled a new one
    // using the updated interval — this is the exact behaviour the IPC
    // handler relies on so a setCopilot mutation takes effect without
    // an app restart.
    expect(scheduled).toEqual([5 * 60 * 1000, 17 * 60 * 1000]);
  });

  it('M35 T1 — rescheduling preserves the measurement-held default when unchanged', () => {
    // Regression guard for the M35 T1 measurement-held
    // `copilot_interval_minutes = 5` default: a restart with the SAME
    // interval must still produce a fresh timer at 5 × 60 × 1000 ms.
    // This pins the invariant that `analyzer.restart(companyId)` is a
    // true reschedule (stop + start), not a no-op — which is what the
    // `settings.setCopilot` IPC handler depends on after the
    // measurement pass confirmed 5-min cadence provides 4.5× headroom
    // over the 66 s warm tick observed on llama3.1:8b. See
    // `apps/desktop/src/main/db/seed.ts` M35 T1 header for the full
    // measurement block.
    const scheduled: number[] = [];
    const cleared: Array<{ ref: number }> = [];
    const { deps } = baseDeps({
      getSettings: () => ({
        enabled: true,
        intervalMinutes: 5,
        categories: ['operational', 'cost', 'org', 'workflow', 'anomaly'],
        categoryWeights: makeWeights(),
      }),
      setInterval: ((_fn: () => void, ms: number) => {
        scheduled.push(ms);
        return { ref: scheduled.length } as unknown as ReturnType<typeof setInterval>;
      }) as unknown as typeof setInterval,
      clearInterval: ((handle: { ref: number }) => {
        cleared.push(handle);
      }) as unknown as typeof clearInterval,
    });
    const svc = createCopilotAnalyzerService(deps);

    svc.start('co-1');
    svc.restart('co-1');

    // Both schedule calls use the M35-T1-held default (5 min).
    expect(scheduled).toEqual([5 * 60 * 1000, 5 * 60 * 1000]);
    // The old timer was cleared before the new one was scheduled —
    // proving restart is a real reschedule (not a no-op).
    expect(cleared).toHaveLength(1);
    expect(cleared[0]?.ref).toBe(1);
  });
});

afterEach(() => {
  vi.useRealTimers();
});
beforeEach(() => {
  // per-test setup hook reserved for future fixtures
});
