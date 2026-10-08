/**
 * IPC handlers — Telemetry and settings: privacy, memory, Copilot, RAG,
 * Enhanced AI, agentic loop, planner, proactive.
 * Split from handlers.ts by bounded context (audit 2026-10-07 P1-7).
 */

import {
  CONCURRENCY_SETTINGS_CLAMPS,
  COPILOT_CATEGORIES,
  DEFAULT_CONCURRENCY_CAPS,
  PRIVACY_TIER_RANK,
  STRATEGY_SLOTS,
  exceedsPrivacyTier,
} from '@team-x/shared-types';
import type {
  CopilotWeightsChangedPayload,
  ProviderConfig,
  SettingsGetAgenticResponse,
  SettingsGetCopilotResponse,
  SettingsGetCopilotWeightsRequest,
  SettingsGetCopilotWeightsResponse,
  SettingsGetEnhancedAiConfigResponse,
  SettingsGetMemoryResponse,
  SettingsGetPlannerResponse,
  SettingsGetPrivacyResponse,
  SettingsGetProactiveResponse,
  SettingsSetAgenticRequest,
  SettingsSetCopilotRequest,
  SettingsSetCopilotWeightsRequest,
  SettingsSetCopilotWeightsResponse,
  SettingsSetEnhancedAiConfigRequest,
  SettingsSetMemoryRequest,
  SettingsSetPlannerRequest,
  SettingsSetProactiveRequest,
} from '@team-x/shared-types';

import { pickStrategy } from '../../services/runtime-strategy.js';

import type { HandlerContext } from './context.js';
import type { IpcHandlers } from './contract.js';
import { HUMAN_USER_ID } from './deps.js';
import {
  assertTelemetryRecentRunsLimit,
  assertTelemetryRunKind,
  clampConcurrencySlots,
  normalizeConcurrencyCaps,
} from './mappers.js';

export type SettingsHandlers = Pick<
  IpcHandlers,
  | 'telemetryCompanyStats'
  | 'telemetryDailyUsage'
  | 'telemetryEmployeeStats'
  | 'telemetryRecentRuns'
  | 'telemetryCostBreakdown'
  | 'settingsGetRuntime'
  | 'settingsSetRuntime'
  | 'settingsGetPrivacy'
  | 'settingsSetPrivacy'
  | 'settingsGetConcurrency'
  | 'settingsSetConcurrency'
  | 'settingsGetExtensions'
  | 'settingsSetExtensions'
  | 'settingsGetMemory'
  | 'settingsSetMemory'
  | 'settingsGetRagConfig'
  | 'settingsSetRagConfig'
  | 'settingsGetEnhancedAiConfig'
  | 'settingsSetEnhancedAiConfig'
  | 'settingsGetAgentic'
  | 'settingsSetAgentic'
  | 'settingsGetPlanner'
  | 'settingsSetPlanner'
  | 'settingsGetCopilot'
  | 'settingsGetCopilotWeights'
  | 'settingsSetCopilot'
  | 'settingsSetCopilotWeights'
  | 'settingsGetProactive'
  | 'settingsSetProactive'
>;

export function createSettingsHandlers(ctx: HandlerContext): SettingsHandlers {
  const {
    runsRepo,
    orchestrator,
    providersService,
    settingsRepo,
    copilotAnalyzerService,
    bus,
    getHardwareProfile,
  } = ctx;
  return {
    // -----------------------------------------------------------------------
    // Telemetry handlers (Phase 3 — M17)
    // -----------------------------------------------------------------------

    async telemetryCompanyStats(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] telemetry.companyStats: companyId is required');
      }
      const kind = assertTelemetryRunKind(req.kind, 'telemetry.companyStats');
      return runsRepo.companyStats(req.companyId, kind);
    },

    async telemetryDailyUsage(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] telemetry.dailyUsage: companyId is required');
      }
      if (typeof req.fromMs !== 'number' || typeof req.toMs !== 'number') {
        throw new Error('[ipc] telemetry.dailyUsage: fromMs and toMs are required');
      }
      const kind = assertTelemetryRunKind(req.kind, 'telemetry.dailyUsage');
      return runsRepo.dailyUsage(req.companyId, req.fromMs, req.toMs, kind);
    },

    async telemetryEmployeeStats(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] telemetry.employeeStats: companyId is required');
      }
      const kind = assertTelemetryRunKind(req.kind, 'telemetry.employeeStats');
      return runsRepo.employeeStats(req.companyId, kind);
    },

    async telemetryRecentRuns(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] telemetry.recentRuns: companyId is required');
      }
      const kind = assertTelemetryRunKind(req.kind, 'telemetry.recentRuns');
      const limit = assertTelemetryRecentRunsLimit(req.limit);
      return runsRepo.recentRuns(req.companyId, limit, kind);
    },

    async telemetryCostBreakdown(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] telemetry.costBreakdown: companyId is required');
      }
      const kind = assertTelemetryRunKind(req.kind, 'telemetry.costBreakdown');
      return runsRepo.costBreakdown(req.companyId, req.fromMs, req.toMs, kind);
    },

    // -----------------------------------------------------------------------
    // Settings handlers (Phase 3 — M19)
    // -----------------------------------------------------------------------

    async settingsGetRuntime() {
      const profile = getHardwareProfile();
      const override = settingsRepo.get<import('@team-x/shared-types').RuntimeStrategy>(
        'runtime_strategy',
        'auto',
      );
      const providers = providersService.list();
      const result = pickStrategy({ profile, providers, override });
      const effectiveSlots = clampConcurrencySlots(
        settingsRepo.get<number>('orchestrator_slots', result.slots),
      );
      return {
        strategy: override === 'auto' ? override : result.strategy,
        hardwareProfile: profile,
        effectiveSlots,
        reason: result.reason,
      };
    },

    async settingsSetRuntime(req) {
      settingsRepo.set('runtime_strategy', req.strategy);
      const profile = getHardwareProfile();
      const providers = providersService.list();
      const nextSlots =
        req.strategy === 'auto'
          ? pickStrategy({ profile, providers, override: req.strategy }).slots
          : STRATEGY_SLOTS[req.strategy];
      const clampedSlots = clampConcurrencySlots(nextSlots);
      settingsRepo.set('orchestrator_slots', clampedSlots);
      orchestrator.updateConcurrency({ slots: clampedSlots });
    },

    async settingsGetPrivacy() {
      const maxTier = settingsRepo.get<import('@team-x/shared-types').PrivacyTier>(
        'max_privacy_tier',
        'proprietary-cloud',
      );
      const providers = providersService.list();
      // The rule the provider factory enforces at run time (fail-closed both
      // ways), from the one shared copy so the panel cannot disagree with it.
      const isAllowed = (p: ProviderConfig) => !exceedsPrivacyTier(p.privacyTier, maxTier);
      const availableProviders = providers.map((p) => ({
        id: p.id,
        name: p.name,
        kind: p.kind,
        privacyTier: p.privacyTier,
        allowed: isAllowed(p),
      }));
      // The run-time consequence: providers the factory could actually pick
      // (enabled + configured) that the tier refuses. Unconfigured or
      // disabled rows above the tier are omitted — they cannot run anyway.
      const blockedProviders: SettingsGetPrivacyResponse['blockedProviders'] = [];
      for (const p of providers) {
        if (!p.enabled || isAllowed(p)) continue;
        if (!(await providersService.isConfigured(p.id))) continue;
        blockedProviders.push({ id: p.id, name: p.name, kind: p.kind, privacyTier: p.privacyTier });
      }
      // Retrieval degrades rather than fails when its embedding provider is
      // refused (no semantic search, indexing paused) — say which, if any.
      const embeddingProvider = settingsRepo.get<boolean>('rag_enabled', false)
        ? settingsRepo.get<string>('embedding_provider', 'ollama-local')
        : null;
      const retrievalEmbeddingProviderId =
        embeddingProvider !== null && blockedProviders.some((p) => p.id === embeddingProvider)
          ? embeddingProvider
          : null;
      return { maxTier, availableProviders, blockedProviders, retrievalEmbeddingProviderId };
    },

    async settingsSetPrivacy(req) {
      // The IPC boundary is untyped — refuse an unknown tier rather than
      // persist a value the enforcement path would have to guess about.
      if (!Object.hasOwn(PRIVACY_TIER_RANK, req.maxTier)) {
        throw new Error(`[ipc] settings.setPrivacy: unknown privacy tier "${String(req.maxTier)}"`);
      }
      settingsRepo.set('max_privacy_tier', req.maxTier);
    },

    async settingsGetConcurrency() {
      const orchestratorSlots = clampConcurrencySlots(
        settingsRepo.get<number>(
          'orchestrator_slots',
          CONCURRENCY_SETTINGS_CLAMPS.orchestratorSlots.default,
        ),
      );
      const providerCaps = normalizeConcurrencyCaps(
        settingsRepo.get<Record<string, number>>('concurrency_caps', DEFAULT_CONCURRENCY_CAPS),
      );
      return { orchestratorSlots, providerCaps };
    },

    async settingsSetConcurrency(req) {
      let nextSlots: number | undefined;
      if (req.orchestratorSlots !== undefined) {
        nextSlots = clampConcurrencySlots(req.orchestratorSlots);
        settingsRepo.set('orchestrator_slots', nextSlots);
      }
      let nextCaps: Record<string, number> | undefined;
      if (req.providerCaps !== undefined) {
        const current = normalizeConcurrencyCaps(
          settingsRepo.get<Record<string, number>>('concurrency_caps', DEFAULT_CONCURRENCY_CAPS),
        );
        nextCaps = {
          ...current,
          ...normalizeConcurrencyCaps(req.providerCaps),
        };
        settingsRepo.set('concurrency_caps', nextCaps);
      }
      orchestrator.updateConcurrency({
        ...(nextSlots !== undefined ? { slots: nextSlots } : {}),
        ...(nextCaps !== undefined ? { providerCaps: nextCaps } : {}),
      });
    },

    async settingsGetExtensions() {
      return settingsRepo.getExtensions?.() ?? { autonomyMode: 'balanced' };
    },

    async settingsSetExtensions(req) {
      if (settingsRepo.setExtensions) {
        settingsRepo.setExtensions(req);
      } else {
        settingsRepo.set('extensions_autonomy_mode', req.autonomyMode);
      }
    },

    async settingsGetMemory(): Promise<SettingsGetMemoryResponse> {
      return (
        settingsRepo.getMemory?.() ?? {
          defaultTargetTokenBudget: 4096,
          recentTurnLimit: 12,
          checkpointHistoryLimit: 6,
        }
      );
    },

    async settingsSetMemory(req: SettingsSetMemoryRequest): Promise<void> {
      if (settingsRepo.setMemory) {
        settingsRepo.setMemory(req);
        return;
      }
      if (req.defaultTargetTokenBudget !== undefined) {
        settingsRepo.set('memory_default_target_token_budget', req.defaultTargetTokenBudget);
      }
      if (req.recentTurnLimit !== undefined) {
        settingsRepo.set('memory_recent_turn_limit', req.recentTurnLimit);
      }
      if (req.checkpointHistoryLimit !== undefined) {
        settingsRepo.set('memory_checkpoint_history_limit', req.checkpointHistoryLimit);
      }
    },

    // -----------------------------------------------------------------------
    // RAG configuration handlers (Phase 5 — M29)
    // -----------------------------------------------------------------------

    async settingsGetRagConfig() {
      return {
        ragEnabled: settingsRepo.get<boolean>('rag_enabled', false),
        ragTopK: settingsRepo.get<number>('rag_top_k', 5),
        ragThreshold: settingsRepo.get<number>('rag_threshold', 0.7),
        ragMaxTokens: settingsRepo.get<number>('rag_max_tokens', 2000),
        embeddingProvider: settingsRepo.get<string>('embedding_provider', 'auto'),
        embeddingModel: settingsRepo.get<string>('embedding_model', 'auto'),
        embeddingDimension: settingsRepo.get<number>('embedding_dimension', 1536),
      };
    },

    async settingsSetRagConfig(req) {
      // Validate + patch only the supplied keys. Each branch short-
      // circuits on the "undefined" case so partial payloads (e.g.
      // the user toggling just the master switch) never clobber the
      // unrelated knobs.
      if (req.ragEnabled !== undefined) {
        if (typeof req.ragEnabled !== 'boolean') {
          throw new Error('[ipc] settings.setRagConfig: ragEnabled must be boolean');
        }
        settingsRepo.set('rag_enabled', req.ragEnabled);
      }
      if (req.ragTopK !== undefined) {
        if (!Number.isFinite(req.ragTopK) || req.ragTopK < 1 || req.ragTopK > 20) {
          throw new Error('[ipc] settings.setRagConfig: ragTopK must be 1..20');
        }
        settingsRepo.set('rag_top_k', Math.round(req.ragTopK));
      }
      if (req.ragThreshold !== undefined) {
        if (!Number.isFinite(req.ragThreshold) || req.ragThreshold < 0 || req.ragThreshold > 1) {
          throw new Error('[ipc] settings.setRagConfig: ragThreshold must be 0..1');
        }
        settingsRepo.set('rag_threshold', req.ragThreshold);
      }
      if (req.ragMaxTokens !== undefined) {
        if (
          !Number.isFinite(req.ragMaxTokens) ||
          req.ragMaxTokens < 100 ||
          req.ragMaxTokens > 4000
        ) {
          throw new Error('[ipc] settings.setRagConfig: ragMaxTokens must be 100..4000');
        }
        settingsRepo.set('rag_max_tokens', Math.round(req.ragMaxTokens));
      }
      if (req.embeddingProvider !== undefined) {
        if (typeof req.embeddingProvider !== 'string' || req.embeddingProvider.length === 0) {
          throw new Error('[ipc] settings.setRagConfig: embeddingProvider must be non-empty');
        }
        settingsRepo.set('embedding_provider', req.embeddingProvider);
      }
      if (req.embeddingModel !== undefined) {
        if (typeof req.embeddingModel !== 'string' || req.embeddingModel.length === 0) {
          throw new Error('[ipc] settings.setRagConfig: embeddingModel must be non-empty');
        }
        settingsRepo.set('embedding_model', req.embeddingModel);
      }
      if (req.embeddingDimension !== undefined) {
        if (
          !Number.isFinite(req.embeddingDimension) ||
          req.embeddingDimension < 64 ||
          req.embeddingDimension > 8192
        ) {
          throw new Error('[ipc] settings.setRagConfig: embeddingDimension must be 64..8192');
        }
        settingsRepo.set('embedding_dimension', Math.round(req.embeddingDimension));
      }
    },

    // -----------------------------------------------------------------------
    // Enhanced AI configuration handlers (Phase 5 — M32)
    // -----------------------------------------------------------------------

    async settingsGetEnhancedAiConfig(): Promise<SettingsGetEnhancedAiConfigResponse> {
      return {
        llmProvider: settingsRepo.get<string>('llm_provider', 'auto'),
        llmModel: settingsRepo.get<string>('llm_model', 'auto'),
        queryExpansionEnabled: settingsRepo.get<boolean>('query_expansion_enabled', true),
        semanticChunkingEnabled: settingsRepo.get<boolean>('semantic_chunking_enabled', true),
        longTermMemoryEnabled: settingsRepo.get<boolean>('long_term_memory_enabled', true),
        knowledgeGraphEnabled: settingsRepo.get<boolean>('knowledge_graph_enabled', true),
        tracingEnabled: settingsRepo.get<boolean>('tracing_enabled', false),
        tracingSampleRate: settingsRepo.get<number>('tracing_sample_rate', 0.1),
      };
    },

    async settingsSetEnhancedAiConfig(req: SettingsSetEnhancedAiConfigRequest): Promise<void> {
      if (req.llmProvider !== undefined) {
        if (typeof req.llmProvider !== 'string' || req.llmProvider.length === 0) {
          throw new Error('[ipc] settings.setEnhancedAiConfig: llmProvider must be non-empty');
        }
        settingsRepo.set('llm_provider', req.llmProvider);
      }
      if (req.llmModel !== undefined) {
        if (typeof req.llmModel !== 'string' || req.llmModel.length === 0) {
          throw new Error('[ipc] settings.setEnhancedAiConfig: llmModel must be non-empty');
        }
        settingsRepo.set('llm_model', req.llmModel);
      }
      if (req.queryExpansionEnabled !== undefined) {
        if (typeof req.queryExpansionEnabled !== 'boolean') {
          throw new Error(
            '[ipc] settings.setEnhancedAiConfig: queryExpansionEnabled must be boolean',
          );
        }
        settingsRepo.set('query_expansion_enabled', req.queryExpansionEnabled);
      }
      if (req.semanticChunkingEnabled !== undefined) {
        if (typeof req.semanticChunkingEnabled !== 'boolean') {
          throw new Error(
            '[ipc] settings.setEnhancedAiConfig: semanticChunkingEnabled must be boolean',
          );
        }
        settingsRepo.set('semantic_chunking_enabled', req.semanticChunkingEnabled);
      }
      if (req.longTermMemoryEnabled !== undefined) {
        if (typeof req.longTermMemoryEnabled !== 'boolean') {
          throw new Error(
            '[ipc] settings.setEnhancedAiConfig: longTermMemoryEnabled must be boolean',
          );
        }
        settingsRepo.set('long_term_memory_enabled', req.longTermMemoryEnabled);
      }
      if (req.knowledgeGraphEnabled !== undefined) {
        if (typeof req.knowledgeGraphEnabled !== 'boolean') {
          throw new Error(
            '[ipc] settings.setEnhancedAiConfig: knowledgeGraphEnabled must be boolean',
          );
        }
        settingsRepo.set('knowledge_graph_enabled', req.knowledgeGraphEnabled);
      }
      if (req.tracingEnabled !== undefined) {
        if (typeof req.tracingEnabled !== 'boolean') {
          throw new Error('[ipc] settings.setEnhancedAiConfig: tracingEnabled must be boolean');
        }
        settingsRepo.set('tracing_enabled', req.tracingEnabled);
      }
      if (req.tracingSampleRate !== undefined) {
        if (
          !Number.isFinite(req.tracingSampleRate) ||
          req.tracingSampleRate < 0 ||
          req.tracingSampleRate > 1
        ) {
          throw new Error('[ipc] settings.setEnhancedAiConfig: tracingSampleRate must be 0..1');
        }
        settingsRepo.set('tracing_sample_rate', req.tracingSampleRate);
      }
    },

    // -----------------------------------------------------------------------
    // Agentic loop handlers (Phase 5 — M31)
    // -----------------------------------------------------------------------

    async settingsGetAgentic(): Promise<SettingsGetAgenticResponse> {
      return settingsRepo.getAgentic();
    },

    async settingsSetAgentic(req: SettingsSetAgenticRequest): Promise<void> {
      // Repo handles clamping + finite-number validation; the handler
      // is a thin pass-through so that call-sites can share the same
      // invariants regardless of entry point (IPC, test, future CLI).
      settingsRepo.setAgentic(req);
    },

    // -----------------------------------------------------------------------
    // Task planner handlers (Phase 5 — M32)
    // -----------------------------------------------------------------------

    async settingsGetPlanner(): Promise<SettingsGetPlannerResponse> {
      return settingsRepo.getPlanner();
    },

    async settingsSetPlanner(req: SettingsSetPlannerRequest): Promise<void> {
      settingsRepo.setPlanner(req);
    },

    // -----------------------------------------------------------------------
    // Copilot service handlers (Phase 5 — M33 T7)
    // -----------------------------------------------------------------------

    async settingsGetCopilot(): Promise<SettingsGetCopilotResponse> {
      return settingsRepo.getCopilot();
    },

    async settingsGetCopilotWeights(
      req: SettingsGetCopilotWeightsRequest,
    ): Promise<SettingsGetCopilotWeightsResponse> {
      if (typeof req.companyId !== 'string' || req.companyId.trim().length === 0) {
        throw new Error('[ipc] settings.getCopilotWeights: companyId is required');
      }
      return settingsRepo.getCopilotWeights();
    },

    async settingsSetCopilot(req: SettingsSetCopilotRequest): Promise<void> {
      if (typeof req.companyId !== 'string' || req.companyId.trim().length === 0) {
        throw new Error('[ipc] settings.setCopilot: companyId is required');
      }
      // Repo handles intervalMinutes clamping + categories filtering +
      // empty-array fallback. After persisting, synchronously restart
      // the per-company analyzer timer so the new interval / enabled /
      // categories take effect on the next tick — no app restart needed.
      settingsRepo.setCopilot(req);
      if (copilotAnalyzerService) {
        copilotAnalyzerService.restart(req.companyId);
      }
    },

    async settingsSetCopilotWeights(
      req: SettingsSetCopilotWeightsRequest,
    ): Promise<SettingsSetCopilotWeightsResponse> {
      if (typeof req.companyId !== 'string' || req.companyId.trim().length === 0) {
        throw new Error('[ipc] settings.setCopilotWeights: companyId is required');
      }
      const before = settingsRepo.getCopilotWeights().weights;
      const result = settingsRepo.setCopilotWeights(req);
      const changedKeys = COPILOT_CATEGORIES.filter(
        (category) => before[category] !== result.weights[category],
      );
      if (bus) {
        try {
          bus.emit<CopilotWeightsChangedPayload>({
            type: 'copilot.weights.changed',
            companyId: req.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              weights: result.weights,
              changedKeys,
              changedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error('[ipc] settings.setCopilotWeights: bus emit failed (weights saved):', err);
        }
      } else {
        console.warn(
          '[ipc] settings.setCopilotWeights: bus dep unwired — renderer caches will NOT invalidate',
        );
      }
      return result;
    },

    // -----------------------------------------------------------------------
    // Proactive settings handlers (Phase 6 — Proactive Execution System)
    // -----------------------------------------------------------------------

    /** `settings.getProactive` — proactive mode enabled and autonomy mode. */
    async settingsGetProactive(): Promise<SettingsGetProactiveResponse> {
      return settingsRepo.getProactive();
    },

    /** `settings.setProactive` — patch proactive settings with validation. */
    async settingsSetProactive(req: SettingsSetProactiveRequest): Promise<void> {
      // Repo handles enabled coercion + autonomyMode validation.
      // After persisting, the proactiveTriggerService reads from settingsRepo
      // on next check, so changes take effect without app restart.
      settingsRepo.setProactive(req);
    },
  };
}
