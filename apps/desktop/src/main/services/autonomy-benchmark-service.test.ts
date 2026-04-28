import { describe, expect, it } from 'vitest';

import { AUTONOMY_BENCHMARK_SCENARIO_IDS } from '@team-x/shared-types';

import { createInMemoryAutonomyBenchmarkScenarioContext } from './autonomy-benchmark-memory-context.js';
import {
  AUTONOMY_BENCHMARK_DEFAULT_RUNTIME_KINDS,
  createAutonomyBenchmarkService,
} from './autonomy-benchmark-service.js';

function createService() {
  return createAutonomyBenchmarkService({
    createScenarioContext: createInMemoryAutonomyBenchmarkScenarioContext,
    now: () => Date.UTC(2026, 3, 28, 12, 0, 0),
  });
}

describe('autonomy benchmark service', () => {
  it('runs every benchmark scenario for one runtime with auditable evidence', async () => {
    const report = await createService().run({ runtimeKinds: ['bash'] });

    expect(report.mode).toBe('control-plane-simulated');
    expect(report.summary.scenarioCount).toBe(AUTONOMY_BENCHMARK_SCENARIO_IDS.length);
    expect(report.summary.failedCount).toBe(0);
    expect(report.summary.passedCount).toBe(AUTONOMY_BENCHMARK_SCENARIO_IDS.length);
    expect(report.summary.successRate).toBe(1);
    expect(report.summary.totalTokenCount).toBeGreaterThan(0);
    expect(report.summary.totalCostUsd).toBe('0.006800');

    const singleTicket = report.results.find(
      (result) => result.scenarioId === 'single-ticket-claim-completion',
    );
    expect(singleTicket?.evidence.eventTypes).toEqual(
      expect.arrayContaining([
        'runtime.session.started',
        'runtime.checkout.claimed',
        'runtime.execution.started',
        'runtime.execution.output',
        'runtime.artifact.created',
      ]),
    );
    expect(singleTicket?.evidence.artifactCount).toBe(1);
    expect(singleTicket?.evidence.toolCallCount).toBeGreaterThanOrEqual(5);

    const race = report.results.find((result) => result.scenarioId === 'race-for-one-ticket');
    expect(race?.evidence.eventTypes).toContain('runtime.checkout.conflict');
    expect(race?.metrics.duplicateWorkRate).toBe(0);

    const stale = report.results.find((result) => result.scenarioId === 'stale-worker-recovery');
    expect(stale?.evidence.eventTypes).toEqual(
      expect.arrayContaining(['runtime.session.stale', 'runtime.session.recovered']),
    );
    expect(stale?.evidence.checkoutStatuses).toContain('expired');
    expect(stale?.metrics.staleRecoveryMs).toBe(250);
  });

  it('runs the runtime matrix for a selected scenario', async () => {
    const report = await createService().run({
      scenarioIds: ['race-for-one-ticket'],
    });

    expect(report.runtimeKinds).toEqual([...AUTONOMY_BENCHMARK_DEFAULT_RUNTIME_KINDS]);
    expect(report.results).toHaveLength(AUTONOMY_BENCHMARK_DEFAULT_RUNTIME_KINDS.length);
    expect(report.summary.failedCount).toBe(0);
    expect(report.results.map((result) => result.runtimeKind)).toEqual(
      AUTONOMY_BENCHMARK_DEFAULT_RUNTIME_KINDS,
    );
  });
});
