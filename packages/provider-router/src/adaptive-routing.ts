import type {
  AutonomyBenchmarkReport,
  ModelTier,
  PrivacyTier,
  ProviderConfig,
  ProviderKind,
  RuntimeProfileHealthStatus,
  RuntimeProfileKind,
} from '@team-x/shared-types';

export const ADAPTIVE_ROUTE_WORK_KINDS = [
  'triage',
  'planning',
  'review',
  'repository',
  'hosted-bot',
] as const;
export type AdaptiveRouteWorkKind = (typeof ADAPTIVE_ROUTE_WORK_KINDS)[number];

export const ADAPTIVE_ROUTE_RISK_LEVELS = ['low', 'medium', 'high'] as const;
export type AdaptiveRouteRiskLevel = (typeof ADAPTIVE_ROUTE_RISK_LEVELS)[number];

export const ADAPTIVE_ROUTE_DATA_SENSITIVITY = ['public', 'internal', 'private'] as const;
export type AdaptiveRouteDataSensitivity = (typeof ADAPTIVE_ROUTE_DATA_SENSITIVITY)[number];

export type AdaptiveRouteKind = 'provider' | 'runtime' | 'blocked';

export interface AdaptiveRouteRequest {
  workKind: AdaptiveRouteWorkKind;
  risk: AdaptiveRouteRiskLevel;
  dataSensitivity: AdaptiveRouteDataSensitivity;
  roleModelTier?: ModelTier | null;
  preferredProviders?: string[];
  preferredRuntimeKinds?: RuntimeProfileKind[];
  maxPrivacyTier?: PrivacyTier;
  requireRuntime?: boolean;
}

export interface AdaptiveRuntimeCandidate {
  id: string;
  name?: string;
  kind: RuntimeProfileKind;
  enabled: boolean;
  lastHealthStatus?: RuntimeProfileHealthStatus;
}

export interface AdaptiveRuntimeBenchmarkScore {
  resultCount: number;
  successRate: number;
  duplicateWorkRate: number;
  artifactCompleteness: number;
  meanLatencyMs: number;
  totalCostUsd: string;
}

export interface AdaptiveRuntimeScore {
  runtimeProfileId: string;
  runtimeKind: RuntimeProfileKind;
  score: number;
  rank: number;
  benchmark: AdaptiveRuntimeBenchmarkScore | null;
}

export interface AdaptiveRouteEvidence {
  usedBenchmark: boolean;
  localOnly: boolean;
  desiredRuntimeKinds: RuntimeProfileKind[];
  providerCandidates: string[];
  runtimeScores: AdaptiveRuntimeScore[];
}

export interface AdaptiveRouteDecision {
  routeKind: AdaptiveRouteKind;
  providerId: string | null;
  providerKind: ProviderKind | null;
  runtimeProfileId: string | null;
  runtimeKind: RuntimeProfileKind | null;
  modelTier: ModelTier;
  maxPrivacyTier: PrivacyTier;
  reasons: string[];
  evidence: AdaptiveRouteEvidence;
}

export interface AdaptiveRouteInput {
  request: AdaptiveRouteRequest;
  providers: ProviderConfig[];
  runtimeProfiles?: AdaptiveRuntimeCandidate[];
  benchmarkReport?: AutonomyBenchmarkReport | null;
}

const PRIVACY_TIER_RANK: Record<PrivacyTier, number> = {
  local: 0,
  'open-source-cloud': 1,
  'proprietary-cloud': 2,
};

const MODEL_TIER_RANK: Record<ModelTier, number> = {
  low: 0,
  mid: 1,
  high: 2,
};

const PROVIDER_KIND_ORDER: Record<AdaptiveRouteWorkKind, ProviderKind[]> = {
  triage: [
    'ollama',
    'groq',
    'openrouter',
    'anthropic',
    'openai',
    'google',
    'together',
    'fireworks',
    'custom-openai',
  ],
  planning: [
    'anthropic',
    'openai',
    'google',
    'openrouter',
    'groq',
    'together',
    'fireworks',
    'ollama',
    'custom-openai',
  ],
  review: [
    'anthropic',
    'openai',
    'google',
    'openrouter',
    'groq',
    'together',
    'fireworks',
    'ollama',
    'custom-openai',
  ],
  repository: [
    'anthropic',
    'openai',
    'openrouter',
    'google',
    'groq',
    'ollama',
    'together',
    'fireworks',
    'custom-openai',
  ],
  'hosted-bot': [
    'openrouter',
    'openai',
    'anthropic',
    'google',
    'groq',
    'together',
    'fireworks',
    'ollama',
    'custom-openai',
  ],
};

const REPOSITORY_RUNTIME_ORDER: RuntimeProfileKind[] = ['codex', 'claude-code', 'cursor', 'bash'];
const HOSTED_BOT_RUNTIME_ORDER: RuntimeProfileKind[] = ['http'];
const LOCAL_ONLY_RUNTIME_ORDER: RuntimeProfileKind[] = ['bash', 'teamx-internal'];

function privacyRank(tier: PrivacyTier): number {
  return PRIVACY_TIER_RANK[tier] ?? PRIVACY_TIER_RANK['proprietary-cloud'];
}

function uniqueRuntimeKinds(values: readonly RuntimeProfileKind[]): RuntimeProfileKind[] {
  const seen = new Set<RuntimeProfileKind>();
  const result: RuntimeProfileKind[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function defaultModelTier(request: AdaptiveRouteRequest): ModelTier {
  const inferred: ModelTier =
    request.workKind === 'triage' && request.risk === 'low'
      ? 'low'
      : request.workKind === 'planning' || request.workKind === 'review' || request.risk === 'high'
        ? 'high'
        : 'mid';
  const roleTier = request.roleModelTier ?? null;
  if (roleTier === null) return inferred;
  return MODEL_TIER_RANK[roleTier] > MODEL_TIER_RANK[inferred] ? roleTier : inferred;
}

function desiredRuntimeKinds(
  request: AdaptiveRouteRequest,
  localOnly: boolean,
): RuntimeProfileKind[] {
  const preferred = request.preferredRuntimeKinds ?? [];
  if (localOnly) {
    return uniqueRuntimeKinds([...preferred, ...LOCAL_ONLY_RUNTIME_ORDER]);
  }
  if (request.workKind === 'repository') {
    return uniqueRuntimeKinds([...preferred, ...REPOSITORY_RUNTIME_ORDER]);
  }
  if (request.workKind === 'hosted-bot') {
    return uniqueRuntimeKinds([...preferred, ...HOSTED_BOT_RUNTIME_ORDER]);
  }
  return uniqueRuntimeKinds(preferred);
}

function preferredIndex(values: readonly string[] | undefined, id: string, kind: string): number {
  if (!values || values.length === 0) return Number.POSITIVE_INFINITY;
  const idIndex = values.indexOf(id);
  if (idIndex >= 0) return idIndex;
  const kindIndex = values.indexOf(kind);
  return kindIndex >= 0 ? kindIndex : Number.POSITIVE_INFINITY;
}

function mean(values: number[]): number {
  return values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function benchmarkScoreForRuntime(
  report: AutonomyBenchmarkReport | null | undefined,
  runtimeKind: RuntimeProfileKind,
): AdaptiveRuntimeBenchmarkScore | null {
  const results = report?.results.filter((result) => result.runtimeKind === runtimeKind) ?? [];
  if (results.length === 0) return null;
  const passed = results.filter((result) => result.status === 'passed').length;
  const totalCost = results.reduce((total, result) => total + Number(result.metrics.costUsd), 0);
  return {
    resultCount: results.length,
    successRate: passed / results.length,
    duplicateWorkRate: mean(results.map((result) => result.metrics.duplicateWorkRate)),
    artifactCompleteness: mean(results.map((result) => result.metrics.artifactCompleteness)),
    meanLatencyMs: Math.round(mean(results.map((result) => result.metrics.latencyMs))),
    totalCostUsd: totalCost.toFixed(6),
  };
}

function runtimeScoreFromBenchmark(benchmark: AdaptiveRuntimeBenchmarkScore | null): number {
  if (!benchmark) return 0;
  const costPenalty = Math.min(20, Number(benchmark.totalCostUsd) * 1000);
  const latencyPenalty = Math.min(15, benchmark.meanLatencyMs / 60_000);
  return (
    benchmark.successRate * 100 +
    benchmark.artifactCompleteness * 20 -
    benchmark.duplicateWorkRate * 30 -
    costPenalty -
    latencyPenalty
  );
}

function healthScore(status: RuntimeProfileHealthStatus | undefined): number {
  switch (status) {
    case 'healthy':
      return 8;
    case 'warning':
      return -8;
    case 'error':
      return Number.NEGATIVE_INFINITY;
    case 'unknown':
    case undefined:
      return 0;
  }
}

function scoreRuntimeCandidates(input: {
  runtimeProfiles: readonly AdaptiveRuntimeCandidate[];
  desiredKinds: readonly RuntimeProfileKind[];
  benchmarkReport: AutonomyBenchmarkReport | null | undefined;
}): AdaptiveRuntimeScore[] {
  const desiredIndex = new Map(input.desiredKinds.map((kind, index) => [kind, index] as const));
  const scored = input.runtimeProfiles
    .filter((profile) => profile.enabled)
    .filter((profile) => desiredIndex.has(profile.kind))
    .map((profile) => {
      const health = healthScore(profile.lastHealthStatus);
      if (health === Number.NEGATIVE_INFINITY) return null;
      const orderIndex = desiredIndex.get(profile.kind) ?? input.desiredKinds.length;
      const benchmark = benchmarkScoreForRuntime(input.benchmarkReport, profile.kind);
      const benchmarkScore = runtimeScoreFromBenchmark(benchmark);
      const orderBoost = Math.max(0, input.desiredKinds.length - orderIndex);
      return {
        runtimeProfileId: profile.id,
        runtimeKind: profile.kind,
        score: benchmarkScore + orderBoost + health,
        rank: 0,
        benchmark,
      } satisfies AdaptiveRuntimeScore;
    })
    .filter((score): score is AdaptiveRuntimeScore => score !== null)
    .sort((a, b) => b.score - a.score || a.runtimeProfileId.localeCompare(b.runtimeProfileId));

  return scored.map((score, index) => ({
    ...score,
    rank: index + 1,
  }));
}

function providerPrivacyScore(
  request: AdaptiveRouteRequest,
  provider: ProviderConfig,
  localOnly: boolean,
): number {
  if (localOnly) return provider.privacyTier === 'local' ? 30 : 0;
  if (request.workKind === 'triage' && request.risk === 'low') {
    return provider.privacyTier === 'local'
      ? 30
      : provider.privacyTier === 'open-source-cloud'
        ? 12
        : 0;
  }
  if (
    request.workKind === 'planning' ||
    request.workKind === 'review' ||
    request.workKind === 'repository' ||
    request.risk === 'high'
  ) {
    return provider.privacyTier === 'proprietary-cloud'
      ? 20
      : provider.privacyTier === 'open-source-cloud'
        ? 10
        : 0;
  }
  return provider.privacyTier === 'local' ? 8 : 0;
}

function pickProvider(input: {
  request: AdaptiveRouteRequest;
  providers: readonly ProviderConfig[];
  maxPrivacyTier: PrivacyTier;
  localOnly: boolean;
}): { provider: ProviderConfig | null; candidates: string[] } {
  const maxRank = privacyRank(input.maxPrivacyTier);
  const kindOrder = PROVIDER_KIND_ORDER[input.request.workKind];
  const candidates = input.providers
    .filter((provider) => provider.enabled)
    .filter((provider) => privacyRank(provider.privacyTier) <= maxRank)
    .map((provider) => {
      const kindIndex = kindOrder.indexOf(provider.kind);
      const preferred = preferredIndex(
        input.request.preferredProviders,
        provider.id,
        provider.kind,
      );
      const preferenceScore = Number.isFinite(preferred) ? 60 - preferred : 0;
      const kindScore = kindIndex >= 0 ? kindOrder.length - kindIndex : 0;
      return {
        provider,
        score:
          preferenceScore +
          providerPrivacyScore(input.request, provider, input.localOnly) +
          kindScore,
      };
    })
    .sort((a, b) => b.score - a.score || a.provider.id.localeCompare(b.provider.id));

  return {
    provider: candidates[0]?.provider ?? null,
    candidates: candidates.map((candidate) => candidate.provider.id),
  };
}

function blockedDecision(args: {
  request: AdaptiveRouteRequest;
  maxPrivacyTier: PrivacyTier;
  modelTier: ModelTier;
  reasons: string[];
  evidence: AdaptiveRouteEvidence;
}): AdaptiveRouteDecision {
  return {
    routeKind: 'blocked',
    providerId: null,
    providerKind: null,
    runtimeProfileId: null,
    runtimeKind: null,
    modelTier: args.modelTier,
    maxPrivacyTier: args.maxPrivacyTier,
    reasons: args.reasons,
    evidence: args.evidence,
  };
}

export function routeAdaptiveWork(input: AdaptiveRouteInput): AdaptiveRouteDecision {
  const request = input.request;
  const localOnly = request.dataSensitivity === 'private';
  const maxPrivacyTier = localOnly ? 'local' : (request.maxPrivacyTier ?? 'proprietary-cloud');
  const modelTier = defaultModelTier(request);
  const desiredKinds = desiredRuntimeKinds(request, localOnly);
  const runtimeScores = scoreRuntimeCandidates({
    runtimeProfiles: input.runtimeProfiles ?? [],
    desiredKinds,
    benchmarkReport: input.benchmarkReport,
  });
  const providerPick = pickProvider({
    request,
    providers: input.providers,
    maxPrivacyTier,
    localOnly,
  });
  const evidence: AdaptiveRouteEvidence = {
    usedBenchmark: runtimeScores.some((score) => score.benchmark !== null),
    localOnly,
    desiredRuntimeKinds: desiredKinds,
    providerCandidates: providerPick.candidates,
    runtimeScores,
  };
  const reasons: string[] = [];

  if (localOnly) {
    reasons.push('Private company data forces local-only routing.');
  }
  if (request.workKind === 'triage' && request.risk === 'low') {
    reasons.push('Low-risk triage prefers cheap local execution before cloud providers.');
  }
  if (request.workKind === 'planning' || request.workKind === 'review') {
    reasons.push('Planning and review work escalates to the strongest allowed model tier.');
  }
  if (request.workKind === 'repository') {
    reasons.push('Repository work prefers execution-backed coding runtimes.');
  }
  if (request.workKind === 'hosted-bot') {
    reasons.push('Hosted bot work prefers HTTP runtime profiles.');
  }

  const bestRuntime = runtimeScores[0] ?? null;
  if (bestRuntime) {
    reasons.push(
      bestRuntime.benchmark
        ? `Selected runtime ${bestRuntime.runtimeKind} using ${bestRuntime.benchmark.resultCount} benchmark result(s).`
        : `Selected runtime ${bestRuntime.runtimeKind} from policy order and health state.`,
    );
    return {
      routeKind: 'runtime',
      providerId: null,
      providerKind: null,
      runtimeProfileId: bestRuntime.runtimeProfileId,
      runtimeKind: bestRuntime.runtimeKind,
      modelTier,
      maxPrivacyTier,
      reasons,
      evidence,
    };
  }

  if (desiredKinds.length > 0 && request.requireRuntime) {
    return blockedDecision({
      request,
      maxPrivacyTier,
      modelTier,
      reasons: [
        ...reasons,
        `No enabled runtime profile matched required runtime kind(s): ${desiredKinds.join(', ')}.`,
      ],
      evidence,
    });
  }

  if (desiredKinds.length > 0) {
    reasons.push(
      `No enabled runtime profile matched ${desiredKinds.join(', ')}; falling back to provider policy.`,
    );
  }

  if (providerPick.provider) {
    reasons.push(
      `Selected provider ${providerPick.provider.id} within ${maxPrivacyTier} privacy policy.`,
    );
    return {
      routeKind: 'provider',
      providerId: providerPick.provider.id,
      providerKind: providerPick.provider.kind,
      runtimeProfileId: null,
      runtimeKind: null,
      modelTier,
      maxPrivacyTier,
      reasons,
      evidence,
    };
  }

  return blockedDecision({
    request,
    maxPrivacyTier,
    modelTier,
    reasons: [
      ...reasons,
      localOnly
        ? 'No enabled local runtime profile or local provider is available for private data.'
        : `No enabled provider is available within ${maxPrivacyTier} privacy policy.`,
    ],
    evidence,
  });
}
