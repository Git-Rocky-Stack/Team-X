/**
 * Settings shapes: general settings, agentic loop, task planner, Copilot,
 * proactive, RAG and Enhanced AI configuration.
 * Split from ipc.ts by bounded context (audit 2026-10-07 P1-7).
 */
import type { ExtensionsAutonomyMode } from '../entities.js';
import type { CopilotCategory, CopilotCategoryWeights } from '../events.js';
import type { PrivacyTier, ProviderKind } from '../providers.js';

// ---------------------------------------------------------------------------
// Settings management shapes (Phase 3 — M19)
// ---------------------------------------------------------------------------

export interface SettingsGetRuntimeResponse {
  strategy: import('../providers.js').RuntimeStrategy;
  hardwareProfile: import('../providers.js').HardwareProfile;
  effectiveSlots: number;
  reason: string;
}

export interface SettingsSetRuntimeRequest {
  strategy: import('../providers.js').RuntimeStrategy;
}

export interface SettingsGetPrivacyResponse {
  maxTier: PrivacyTier;
  availableProviders: Array<{
    id: string;
    name: string;
    kind: ProviderKind;
    privacyTier: PrivacyTier;
    allowed: boolean;
  }>;
  /**
   * Configured + enabled providers above `maxTier` — the ones the provider
   * factory would refuse at run time. Empty when the tier blocks nothing.
   */
  blockedProviders: Array<{
    id: string;
    name: string;
    kind: ProviderKind;
    privacyTier: PrivacyTier;
  }>;
  /**
   * The RAG embedding provider's id when it is among `blockedProviders` (RAG
   * on): retrieval then runs without semantic search and indexing pauses.
   * Null when retrieval is unaffected.
   */
  retrievalEmbeddingProviderId: string | null;
}

export interface SettingsSetPrivacyRequest {
  maxTier: PrivacyTier;
}

export interface SettingsGetConcurrencyResponse {
  orchestratorSlots: number;
  providerCaps: Record<string, number>;
}

export interface SettingsSetConcurrencyRequest {
  orchestratorSlots?: number;
  providerCaps?: Record<string, number>;
}

export interface SettingsGetExtensionsResponse {
  autonomyMode: ExtensionsAutonomyMode;
}

export interface SettingsSetExtensionsRequest {
  autonomyMode: ExtensionsAutonomyMode;
}

export const MEMORY_TARGET_TOKEN_BUDGET_OPTIONS = [2048, 4096, 8192] as const;

export interface SettingsGetMemoryResponse {
  defaultTargetTokenBudget: (typeof MEMORY_TARGET_TOKEN_BUDGET_OPTIONS)[number];
  recentTurnLimit: number;
  checkpointHistoryLimit: number;
}

export interface SettingsSetMemoryRequest {
  defaultTargetTokenBudget?: (typeof MEMORY_TARGET_TOKEN_BUDGET_OPTIONS)[number];
  recentTurnLimit?: number;
  checkpointHistoryLimit?: number;
}

export const MEMORY_SETTINGS_CLAMPS = {
  recentTurnLimit: { min: 2, max: 50, default: 12 },
  checkpointHistoryLimit: { min: 1, max: 20, default: 6 },
} as const;

// ---------------------------------------------------------------------------
// Agentic loop settings (Phase 5 — M31)
// ---------------------------------------------------------------------------

/**
 * Hard budget caps for an in-flight agentic-loop run (ReAct core).
 *
 * Read at run-start by `AgenticLoopService` so every new run observes
 * the user's current preference; the values are also surfaced by the
 * Settings → Runtime → Agentic Loop subsection so the user can dial
 * the knobs without restarting the app.
 *
 * Clamps (enforced in both the handler and the Settings UI) are
 * deliberately generous for default reasoning workloads but tight
 * enough that a runaway loop cannot exhaust a local model's context
 * window or a cloud provider's rate bucket.
 */
export interface SettingsGetAgenticResponse {
  /** Maximum ReAct steps before the loop terminates with `budget_exhausted`. 1–32. */
  maxSteps: number;
  /** Token budget across all steps before the loop terminates. 512–64000. */
  maxTokens: number;
  /** Wall-clock timeout in milliseconds before the loop is aborted. 10000–600000. */
  timeoutMs: number;
}

/**
 * Partial update for the agentic loop configuration. Every field is
 * optional; the handler patches only the supplied keys, leaving the
 * rest at their current persisted values. Out-of-range integers are
 * clamped to the nearest bound before persisting; non-finite numbers
 * are rejected with an error.
 */
export interface SettingsSetAgenticRequest {
  maxSteps?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/** Clamp bounds + defaults for the three agentic keys. Shared by repo, handler, and UI. */
export const AGENTIC_SETTINGS_CLAMPS = {
  maxSteps: { min: 1, max: 32, default: 8 },
  maxTokens: { min: 512, max: 64000, default: 8000 },
  timeoutMs: { min: 10000, max: 600000, default: 120000 },
} as const;

// ---------------------------------------------------------------------------
// Task planner settings (Phase 5 — M32)
// ---------------------------------------------------------------------------

/** Valid employee levels for planner approval gating. Matches role-pack frontmatter convention (hyphenated). */
export type PlannerApprovalLevel =
  | 'officer'
  | 'senior-management'
  | 'management'
  | 'supervisor'
  | 'lead';

/** Snapshot of the four task-planner budget/guardrail keys. */
export interface SettingsGetPlannerResponse {
  /** Maximum number of subtasks per `decompose_project` call. 1–50. */
  maxTickets: number;
  /** Maximum nesting depth for subtask trees. 1–4. */
  maxDepth: number;
  /** Minimum employee level permitted to decompose projects. */
  approvalLevel: PlannerApprovalLevel;
  /** Consecutive delegation/review failures before escalation. 1–10. */
  escalationThreshold: number;
}

/**
 * Partial patch for task-planner settings. Missing keys retain their
 * current persisted value. Numeric fields are clamped; `approvalLevel`
 * is validated against the enum.
 */
export interface SettingsSetPlannerRequest {
  maxTickets?: number;
  maxDepth?: number;
  approvalLevel?: PlannerApprovalLevel;
  escalationThreshold?: number;
}

/** Clamp bounds + defaults for the four planner keys. Shared by repo, handler, and UI. */
export const PLANNER_SETTINGS_CLAMPS = {
  maxTickets: { min: 1, max: 200, default: 10 },
  maxDepth: { min: 1, max: 32, default: 2 },
  escalationThreshold: { min: 1, max: 10, default: 3 },
} as const;

/** Valid approval levels for the `planner_approval_level` setting. */
export const PLANNER_APPROVAL_LEVELS: readonly PlannerApprovalLevel[] = [
  'officer',
  'senior-management',
  'management',
  'supervisor',
  'lead',
] as const;

/** Default approval level when no setting is persisted. */
export const PLANNER_APPROVAL_LEVEL_DEFAULT: PlannerApprovalLevel = 'management';

// ---------------------------------------------------------------------------
// Copilot service settings (Phase 5 — M33)
// ---------------------------------------------------------------------------

/**
 * Authoritative runtime list of the five copilot insight categories.
 * Kept in sync with the `CopilotCategory` union in `./events.ts` and the
 * SQL CHECK constraint in migration 0011. Renderer uses this to render
 * the categories checkbox grid in `CopilotSection`; repo uses it to
 * validate `copilot_categories` settings writes.
 */
export const COPILOT_CATEGORIES: readonly CopilotCategory[] = [
  'operational',
  'cost',
  'org',
  'workflow',
  'anomaly',
] as const;

export const COPILOT_CATEGORY_WEIGHT_CLAMP = {
  min: 0,
  max: 2,
  default: 1,
} as const;

export const COPILOT_CATEGORY_WEIGHTS_DEFAULT: CopilotCategoryWeights = {
  operational: 1,
  cost: 1,
  org: 1,
  workflow: 1,
  anomaly: 1,
};

/** Snapshot of the three copilot-service settings keys. */
export interface SettingsGetCopilotResponse {
  /** Whether the analyzer runs at all. `false` short-circuits every scheduled + event-triggered tick. */
  enabled: boolean;
  /** Scheduled-tick interval in minutes. 1–60. */
  intervalMinutes: number;
  /** Allowed subset of `COPILOT_CATEGORIES`. Empty fallback → full set (conservative default). */
  categories: CopilotCategory[];
}

/**
 * Partial patch for copilot-service settings. Missing keys retain their
 * current persisted value. `intervalMinutes` is clamped; `categories`
 * is filtered against `COPILOT_CATEGORIES` with empty-array guard
 * (empty → full set).
 *
 * `companyId` is required so the handler can synchronously call
 * `CopilotAnalyzerService.restart(companyId)` after the write and the
 * per-company scheduler picks up the new interval / enabled / categories
 * without an app restart.
 */
export interface SettingsSetCopilotRequest {
  /** Target company whose analyzer timer should be restarted after the write. */
  companyId: string;
  enabled?: boolean;
  intervalMinutes?: number;
  categories?: CopilotCategory[];
}

export interface SettingsGetCopilotWeightsRequest {
  /** Target company for future company-scoped settings; v1 stores the weights globally. */
  companyId: string;
}

export interface SettingsGetCopilotWeightsResponse {
  weights: CopilotCategoryWeights;
}

export interface SettingsSetCopilotWeightsRequest {
  /** Target company for future company-scoped settings; v1 stores the weights globally. */
  companyId: string;
  weights: Partial<CopilotCategoryWeights>;
}

export interface SettingsSetCopilotWeightsResponse {
  weights: CopilotCategoryWeights;
}

// ---------------------------------------------------------------------------
// Proactive settings types (Phase 6 — Proactive Execution System)
// ---------------------------------------------------------------------------

export interface SettingsGetProactiveResponse {
  enabled: boolean;
  autonomyMode: ExtensionsAutonomyMode;
}

export interface SettingsSetProactiveRequest {
  enabled?: boolean;
  autonomyMode?: ExtensionsAutonomyMode;
}

/** Clamp bounds + defaults for the `intervalMinutes` key. Shared by repo, handler, and UI. */
export const COPILOT_SETTINGS_CLAMPS = {
  intervalMinutes: { min: 1, max: 60, default: 5 },
} as const;

/** Default value for the `enabled` key when no setting is persisted. */
export const COPILOT_ENABLED_DEFAULT = true;

// ---------------------------------------------------------------------------
// RAG configuration settings (Phase 5 — M29)
// ---------------------------------------------------------------------------

/**
 * Full RAG configuration snapshot, pulled from the seven `rag_*` and
 * `embedding_*` keys in the settings repo. Surfaced as a single IPC
 * payload so the Settings panel gets one atomic read / write per
 * user interaction.
 */
export interface SettingsGetRagConfigResponse {
  /** Master switch. When false, RAG injection is skipped entirely. */
  ragEnabled: boolean;
  /** Number of nearest neighbours to retrieve per query. 1–20. */
  ragTopK: number;
  /** Cosine similarity threshold (0.0–1.0). Chunks below this are dropped. */
  ragThreshold: number;
  /** Token budget for the injected context window (100–4000). */
  ragMaxTokens: number;
  /** Provider id used for embedding calls. 'auto' lets the resolver pick. */
  embeddingProvider: string;
  /** Model name within the embedding provider. 'auto' lets the resolver pick. */
  embeddingModel: string;
  /** Vector dimension, must match the provider/model's output size. */
  embeddingDimension: number;
}

/**
 * Partial update for the RAG configuration. Every field is optional;
 * the handler patches only the supplied keys, leaving the rest at
 * their current values.
 */
export interface SettingsSetRagConfigRequest {
  ragEnabled?: boolean;
  ragTopK?: number;
  ragThreshold?: number;
  ragMaxTokens?: number;
  embeddingProvider?: string;
  embeddingModel?: string;
  embeddingDimension?: number;
}

// ---------------------------------------------------------------------------
// Enhanced AI configuration settings (Phase 5 — M32)
// ---------------------------------------------------------------------------

/**
 * Full Enhanced AI configuration snapshot, pulled from the `ai_*`
 * keys in the settings repo. Includes LLM provider config and feature
 * toggles for Phase 2 & 3 capabilities.
 */
export interface SettingsGetEnhancedAiConfigResponse {
  /** LLM provider id for completion calls. 'auto' lets the resolver pick. */
  llmProvider: string;
  /** Model name within the LLM provider. 'auto' lets the resolver pick. */
  llmModel: string;

  /** Enable query expansion for better retrieval recall. */
  queryExpansionEnabled: boolean;
  /** Enable semantic chunking instead of fixed-size chunking. */
  semanticChunkingEnabled: boolean;
  /** Enable long-term memory (fact extraction and storage). */
  longTermMemoryEnabled: boolean;
  /** Enable knowledge graph for cross-thread entity relationships. */
  knowledgeGraphEnabled: boolean;
  /** Enable distributed tracing for observability. */
  tracingEnabled: boolean;
  /** Sample rate for tracing (0.0–1.0). */
  tracingSampleRate: number;
}

/**
 * Partial update for the Enhanced AI configuration. Every field is optional;
 * the handler patches only the supplied keys, leaving the rest at their
 * current values.
 */
export interface SettingsSetEnhancedAiConfigRequest {
  llmProvider?: string;
  llmModel?: string;
  queryExpansionEnabled?: boolean;
  semanticChunkingEnabled?: boolean;
  longTermMemoryEnabled?: boolean;
  knowledgeGraphEnabled?: boolean;
  tracingEnabled?: boolean;
  tracingSampleRate?: number;
}
