import { describe, expect, it } from 'vitest';

import type {
  AutonomyBenchmarkReport,
  AutonomyBenchmarkScenarioId,
  AutonomyBenchmarkScenarioResult,
  ProviderConfig,
  RuntimeProfileKind,
} from '@team-x/shared-types';

import { type AdaptiveRuntimeCandidate, routeAdaptiveWork } from './adaptive-routing.js';

function provider(overrides: Partial<ProviderConfig> & { id: string }): ProviderConfig {
  return {
    name: overrides.id,
    kind: 'anthropic',
    privacyTier: 'proprietary-cloud',
    enabled: true,
    ...overrides,
  };
}

function runtime(
  overrides: Partial<AdaptiveRuntimeCandidate> & { id: string; kind: RuntimeProfileKind },
): AdaptiveRuntimeCandidate {
  return {
    enabled: true,
    lastHealthStatus: 'healthy',
    ...overrides,
  };
}

function benchmarkResult(
  runtimeKind: RuntimeProfileKind,
  status: AutonomyBenchmarkScenarioResult['status'],
  overrides: Partial<AutonomyBenchmarkScenarioResult['metrics']> = {},
): AutonomyBenchmarkScenarioResult {
  return {
    scenarioId: 'single-ticket-claim-completion' satisfies AutonomyBenchmarkScenarioId,
    label: 'Single ticket claim and completion',
    runtimeKind,
    mode: 'control-plane-simulated',
    status,
    startedAt: 1,
    endedAt: 2,
    metrics: {
      successRate: status === 'passed' ? 1 : 0,
      duplicateWorkRate: status === 'passed' ? 0 : 1,
      staleRecoveryMs: null,
      costUsd: '0.001000',
      tokenCount: 100,
      latencyMs: 600,
      operatorInterventions: 0,
      artifactCompleteness: status === 'passed' ? 1 : 0,
      ...overrides,
    },
    evidence: {
      eventTypes: [],
      sessionStatuses: [],
      checkoutStatuses: [],
      artifactCount: status === 'passed' ? 1 : 0,
      toolCallCount: 0,
      notes: [],
    },
    error: status === 'passed' ? null : 'benchmark failure',
  };
}

function benchmarkReport(results: AutonomyBenchmarkScenarioResult[]): AutonomyBenchmarkReport {
  return {
    id: 'report-test',
    generatedAt: 1,
    mode: 'control-plane-simulated',
    runtimeKinds: [...new Set(results.map((result) => result.runtimeKind))],
    scenarioIds: ['single-ticket-claim-completion'],
    results,
    summary: {
      scenarioCount: results.length,
      passedCount: results.filter((result) => result.status === 'passed').length,
      failedCount: results.filter((result) => result.status === 'failed').length,
      successRate:
        results.length > 0
          ? results.filter((result) => result.status === 'passed').length / results.length
          : 0,
      duplicateWorkRate: 0,
      meanLatencyMs: 600,
      meanStaleRecoveryMs: null,
      totalCostUsd: '0.001000',
      totalTokenCount: 100,
      operatorInterventions: 0,
      artifactCompleteness: 1,
    },
  };
}

describe('routeAdaptiveWork', () => {
  const providers = [
    provider({
      id: 'ollama-local',
      kind: 'ollama',
      privacyTier: 'local',
    }),
    provider({
      id: 'anthropic',
      kind: 'anthropic',
      privacyTier: 'proprietary-cloud',
    }),
    provider({
      id: 'groq',
      kind: 'groq',
      privacyTier: 'open-source-cloud',
    }),
  ];

  it('forces private company data onto local providers even when cloud is preferred', () => {
    const decision = routeAdaptiveWork({
      providers,
      request: {
        workKind: 'triage',
        risk: 'low',
        dataSensitivity: 'private',
        preferredProviders: ['anthropic'],
      },
    });

    expect(decision.routeKind).toBe('provider');
    expect(decision.providerId).toBe('ollama-local');
    expect(decision.maxPrivacyTier).toBe('local');
    expect(decision.modelTier).toBe('low');
    expect(decision.evidence.localOnly).toBe(true);
  });

  it('routes high-risk planning and review work to the strongest allowed cloud lane', () => {
    const decision = routeAdaptiveWork({
      providers,
      request: {
        workKind: 'planning',
        risk: 'high',
        dataSensitivity: 'internal',
      },
    });

    expect(decision.routeKind).toBe('provider');
    expect(decision.providerId).toBe('anthropic');
    expect(decision.providerKind).toBe('anthropic');
    expect(decision.modelTier).toBe('high');
  });

  it('uses benchmark evidence to choose among repository runtime profiles', () => {
    const decision = routeAdaptiveWork({
      providers,
      runtimeProfiles: [
        runtime({ id: 'runtime-codex', kind: 'codex' }),
        runtime({ id: 'runtime-claude', kind: 'claude-code' }),
      ],
      benchmarkReport: benchmarkReport([
        benchmarkResult('codex', 'failed'),
        benchmarkResult('claude-code', 'passed', {
          costUsd: '0.000500',
          latencyMs: 300,
        }),
      ]),
      request: {
        workKind: 'repository',
        risk: 'medium',
        dataSensitivity: 'internal',
      },
    });

    expect(decision.routeKind).toBe('runtime');
    expect(decision.runtimeKind).toBe('claude-code');
    expect(decision.runtimeProfileId).toBe('runtime-claude');
    expect(decision.evidence.usedBenchmark).toBe(true);
    expect(decision.evidence.runtimeScores[0]?.runtimeKind).toBe('claude-code');
  });

  it('routes hosted bot work to HTTP runtime profiles', () => {
    const decision = routeAdaptiveWork({
      providers,
      runtimeProfiles: [runtime({ id: 'runtime-http', kind: 'http' })],
      request: {
        workKind: 'hosted-bot',
        risk: 'medium',
        dataSensitivity: 'public',
        requireRuntime: true,
      },
    });

    expect(decision.routeKind).toBe('runtime');
    expect(decision.runtimeKind).toBe('http');
  });

  it('blocks private hosted-bot routing instead of leaking to an HTTP runtime', () => {
    const decision = routeAdaptiveWork({
      providers,
      runtimeProfiles: [runtime({ id: 'runtime-http', kind: 'http' })],
      request: {
        workKind: 'hosted-bot',
        risk: 'high',
        dataSensitivity: 'private',
        requireRuntime: true,
      },
    });

    expect(decision.routeKind).toBe('blocked');
    expect(decision.runtimeKind).toBeNull();
    expect(decision.evidence.desiredRuntimeKinds).toEqual(['bash', 'teamx-internal']);
  });

  it('blocks private work when no local runtime or local provider is available', () => {
    const decision = routeAdaptiveWork({
      providers: [providers[1] as ProviderConfig],
      request: {
        workKind: 'triage',
        risk: 'low',
        dataSensitivity: 'private',
      },
    });

    expect(decision.routeKind).toBe('blocked');
    expect(decision.providerId).toBeNull();
    expect(decision.reasons.join(' ')).toMatch(/No enabled local/);
  });

  it('falls back to provider policy for repository work when no runtime is required', () => {
    const decision = routeAdaptiveWork({
      providers,
      runtimeProfiles: [],
      request: {
        workKind: 'repository',
        risk: 'medium',
        dataSensitivity: 'internal',
      },
    });

    expect(decision.routeKind).toBe('provider');
    expect(decision.providerId).toBe('anthropic');
    expect(decision.reasons.join(' ')).toMatch(/falling back to provider policy/);
  });
});
