import type { ModelTier } from './roles.js';

export type PrivacyTier = 'local' | 'open-source-cloud' | 'proprietary-cloud';

export type ProviderKind =
  | 'ollama'
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'openrouter'
  | 'groq'
  | 'together'
  | 'fireworks'
  | 'custom-openai';

export interface ProviderConfig {
  id: string;
  name: string;
  kind: ProviderKind;
  privacyTier: PrivacyTier;
  baseUrl?: string;
  /** Optional provider-level default model used when no employee override is set. */
  defaultModel?: string;
  enabled: boolean;
}

export interface ModelDescriptor {
  id: string;
  providerId: string;
  tier: ModelTier;
  contextWindow: number;
  supportsTools: boolean;
  costPer1kIn?: number;
  costPer1kOut?: number;
}

// ---------------------------------------------------------------------------
// Runtime modes + privacy (Phase 3 — M19)
// ---------------------------------------------------------------------------

export type RuntimeStrategy = 'auto' | 'hybrid' | 'always-on' | 'lean';

export interface HardwareProfile {
  cpuCores: number;
  totalRamGb: number;
  gpuDetected: boolean;
  gpuName: string | null;
  gpuVramGb: number | null;
  platform: string;
}

/** Numeric rank for privacy tiers — lower = more private. */
export const PRIVACY_TIER_RANK: Record<PrivacyTier, number> = {
  local: 0,
  'open-source-cloud': 1,
  'proprietary-cloud': 2,
};

/** Provider-side tier names, as the Privacy panel and refusal messages phrase them. */
export const PRIVACY_TIER_PROVIDER_LABEL: Record<PrivacyTier, string> = {
  local: 'Local',
  'open-source-cloud': 'Open-Source Cloud',
  'proprietary-cloud': 'Proprietary Cloud',
};

/**
 * True when a provider at `providerTier` sits above Settings → Privacy's
 * `maxTier`. The one copy of the rule: the provider factory enforces it and
 * the Privacy panel reports it, so the two cannot disagree. Fails closed in
 * both directions — an unrecognised provider tier ranks least private, and an
 * unrecognised max tier (a corrupted settings row) ranks as Local Only.
 */
export function exceedsPrivacyTier(providerTier: string, maxTier: string): boolean {
  const providerRank = Object.hasOwn(PRIVACY_TIER_RANK, providerTier)
    ? PRIVACY_TIER_RANK[providerTier as PrivacyTier]
    : Number.POSITIVE_INFINITY;
  const maxRank = Object.hasOwn(PRIVACY_TIER_RANK, maxTier)
    ? PRIVACY_TIER_RANK[maxTier as PrivacyTier]
    : PRIVACY_TIER_RANK.local;
  return providerRank > maxRank;
}

/** Default per-provider concurrency caps from design doc. */
export const DEFAULT_CONCURRENCY_CAPS: Record<ProviderKind, number> = {
  ollama: 1,
  anthropic: 4,
  openai: 6,
  google: 4,
  openrouter: 8,
  groq: 10,
  together: 6,
  fireworks: 6,
  'custom-openai': 4,
};

/** User-configurable runtime concurrency bounds for scheduler settings. */
export const CONCURRENCY_SETTINGS_CLAMPS = {
  orchestratorSlots: { min: 1, max: 32, default: 6 },
  providerCap: { min: 1, max: 32 },
} as const;

/** Orchestrator slot count per strategy (auto resolves to one of these). */
export const STRATEGY_SLOTS: Record<Exclude<RuntimeStrategy, 'auto'>, number> = {
  lean: 2,
  hybrid: 4,
  'always-on': 8,
};
