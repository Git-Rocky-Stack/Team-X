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

/** Orchestrator slot count per strategy (auto resolves to one of these). */
export const STRATEGY_SLOTS: Record<Exclude<RuntimeStrategy, 'auto'>, number> = {
  lean: 2,
  hybrid: 4,
  'always-on': 8,
};
