/**
 * Runtime strategy picker — auto-selects between Hybrid, Always-On,
 * and Lean based on hardware profile and available providers.
 *
 * Phase 3 — M19.
 */

import {
  type HardwareProfile,
  type ProviderConfig,
  type RuntimeStrategy,
  STRATEGY_SLOTS,
} from '@team-x/shared-types';

export interface StrategyInput {
  /** Hardware capabilities detected at startup. */
  profile: HardwareProfile;
  /** All registered providers (enabled or not). */
  providers: ProviderConfig[];
  /** User's manual override, or null for auto. */
  override: RuntimeStrategy | null;
}

export interface StrategyResult {
  /** The selected strategy. */
  strategy: Exclude<RuntimeStrategy, 'auto'>;
  /** Orchestrator slot count for this strategy. */
  slots: number;
  /** Human-readable explanation of why this strategy was chosen. */
  reason: string;
}

/** Minimum GPU VRAM (GB) to consider local LLM inference viable. */
const MIN_GPU_VRAM_GB = 4;

/**
 * Pick the best runtime strategy based on hardware and providers.
 * If the user has set a manual override (anything other than 'auto'),
 * that wins unconditionally.
 */
export function pickStrategy(input: StrategyInput): StrategyResult {
  const { profile, providers, override } = input;

  // Manual override always wins
  if (override && override !== 'auto') {
    return {
      strategy: override,
      slots: STRATEGY_SLOTS[override],
      reason: 'Manual override',
    };
  }

  const enabledProviders = providers.filter((p) => p.enabled);
  const hasCloud = enabledProviders.some((p) => p.privacyTier !== 'local');
  const hasLocal = enabledProviders.some((p) => p.privacyTier === 'local');
  const hasViableGpu = profile.gpuDetected && (profile.gpuVramGb ?? 0) >= MIN_GPU_VRAM_GB;

  // Hybrid: GPU + local provider + at least one cloud provider
  if (hasViableGpu && hasLocal && hasCloud) {
    return {
      strategy: 'hybrid',
      slots: STRATEGY_SLOTS.hybrid,
      reason: `GPU detected (${profile.gpuName ?? 'unknown'}, ${profile.gpuVramGb ?? '?'}GB VRAM) with local + cloud providers`,
    };
  }

  // Always-On: cloud-only (no viable local inference)
  if (hasCloud && (!hasLocal || !hasViableGpu)) {
    return {
      strategy: 'always-on',
      slots: STRATEGY_SLOTS['always-on'],
      reason: 'Cloud providers available, no viable local inference',
    };
  }

  // Hybrid: GPU + local, no cloud
  if (hasLocal && hasViableGpu) {
    return {
      strategy: 'hybrid',
      slots: STRATEGY_SLOTS.hybrid,
      reason: `GPU detected (${profile.gpuName ?? 'unknown'}) with local provider only`,
    };
  }

  // Lean: conservative fallback
  return {
    strategy: 'lean',
    slots: STRATEGY_SLOTS.lean,
    reason: 'Conservative default — limited hardware or providers',
  };
}
