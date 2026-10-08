/**
 * Boot phase 5f — provider routing and the orchestrator's initial
 * concurrency.
 *
 * `resolveProvider` is THE model-resolution path: chat, the agentic loop,
 * Copilot analysis, meeting minutes, Enhanced AI, the palette and delegation
 * all resolve an employee's model through it (one execution policy, audit
 * P1-8). It is fixed once this phase returns, so later phases take it as a
 * plain value.
 */

import type { RuntimeStrategy } from '@team-x/shared-types';
import { CONCURRENCY_SETTINGS_CLAMPS, DEFAULT_CONCURRENCY_CAPS } from '@team-x/shared-types';

import type { ResolveProvider } from '../orchestrator/index.js';
import { detectHardware } from '../services/profiler.js';
import {
  type ProviderFactory,
  createProviderFactory,
  createTestModeResolveProvider,
} from '../services/provider-factory.js';
import { createRuntimeProfileProviderService } from '../services/runtime-profile-provider-service.js';
import { pickStrategy } from '../services/runtime-strategy.js';

import type { GovernanceServices } from './governance-services.js';
import type { PlatformServices } from './platform-services.js';
import type { Repositories } from './repositories.js';

export interface ProviderRoutingDeps
  extends Pick<Repositories, 'companiesRepo' | 'settingsRepo' | 'getMaxPrivacyTier'>,
    Pick<PlatformServices, 'testMode' | 'secretsStore'>,
    Pick<
      GovernanceServices,
      'providersService' | 'runtimeProfilesService' | 'externalRuntimeAdapters'
    > {}

export interface ProviderRouting {
  resolveProvider: ResolveProvider;
  /** Null in test mode (see below). */
  providerFactory: ProviderFactory | null;
  initialSlots: number;
  initialProviderCaps: Record<string, number>;
}

export function bootProviderRouting(deps: ProviderRoutingDeps): ProviderRouting {
  const {
    companiesRepo,
    settingsRepo,
    getMaxPrivacyTier,
    testMode,
    secretsStore,
    providersService,
    runtimeProfilesService,
    externalRuntimeAdapters,
  } = deps;

  let resolveProvider: ResolveProvider;
  // Hoisted so Enhanced AI can honour an explicit provider / model choice
  // (Settings → Enhanced AI); null in test mode, where every call is canned.
  let providerFactory: ProviderFactory | null = null;

  if (testMode) {
    resolveProvider = createTestModeResolveProvider();
    console.log('[main] test-mode provider active — canned responses, no LLM calls');
  } else {
    providerFactory = createProviderFactory({
      providersService,
      secretsStore,
      companiesRepo,
      getMaxPrivacyTier,
    });
    const runtimeProfileProviderService = createRuntimeProfileProviderService({
      runtimeProfilesService,
      providerFactory,
      externalRuntimeAdapters,
      getMaxPrivacyTier,
    });
    resolveProvider = (employee) => runtimeProfileProviderService.resolveForEmployee(employee);
  }

  const runtimeStrategy = settingsRepo.get<RuntimeStrategy>('runtime_strategy', 'auto');
  const bootProfile = detectHardware();
  const bootStrategy = pickStrategy({
    profile: bootProfile,
    providers: providersService.list(),
    override: runtimeStrategy,
  });
  const initialSlots = clampConcurrencySlots(
    settingsRepo.get<number>('orchestrator_slots', bootStrategy.slots),
  );
  const initialProviderCaps = normalizeConcurrencyCaps(
    settingsRepo.get<Record<string, number>>('concurrency_caps', DEFAULT_CONCURRENCY_CAPS),
  );

  return { resolveProvider, providerFactory, initialSlots, initialProviderCaps };
}

function clampConcurrencySlots(value: number): number {
  const { min, max, default: fallback } = CONCURRENCY_SETTINGS_CLAMPS.orchestratorSlots;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeConcurrencyCaps(
  caps: Record<string, number> | undefined,
): Record<string, number> {
  const { min, max } = CONCURRENCY_SETTINGS_CLAMPS.providerCap;
  const normalized: Record<string, number> = {};
  for (const [kind, value] of Object.entries(caps ?? {})) {
    if (!Number.isFinite(value)) continue;
    normalized[kind] = Math.max(min, Math.min(max, Math.round(value)));
  }
  return normalized;
}
