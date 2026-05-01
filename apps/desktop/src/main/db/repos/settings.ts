/**
 * Settings repository — key-value store for global app configuration.
 *
 * The `settings` table uses a text primary key (`key`) with a JSON-
 * encoded `value_json` column. This repo provides typed get/set helpers
 * that parse/stringify transparently.
 *
 * Phase 3 — M19.
 */

import { eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import {
  AGENTIC_SETTINGS_CLAMPS,
  COPILOT_CATEGORIES,
  COPILOT_CATEGORY_WEIGHTS_DEFAULT,
  COPILOT_CATEGORY_WEIGHT_CLAMP,
  COPILOT_ENABLED_DEFAULT,
  COPILOT_SETTINGS_CLAMPS,
  type CopilotCategory,
  DEFAULT_CONCURRENCY_CAPS,
  EXTENSIONS_AUTONOMY_MODES,
  MEMORY_SETTINGS_CLAMPS,
  MEMORY_TARGET_TOKEN_BUDGET_OPTIONS,
  PLANNER_APPROVAL_LEVELS,
  PLANNER_APPROVAL_LEVEL_DEFAULT,
  PLANNER_SETTINGS_CLAMPS,
  type PlannerApprovalLevel,
  type SettingsGetAgenticResponse,
  type SettingsGetCopilotResponse,
  type SettingsGetCopilotWeightsResponse,
  type SettingsGetExtensionsResponse,
  type SettingsGetMemoryResponse,
  type SettingsGetPlannerResponse,
  type SettingsGetProactiveResponse,
  type SettingsSetAgenticRequest,
  type SettingsSetCopilotRequest,
  type SettingsSetCopilotWeightsRequest,
  type SettingsSetCopilotWeightsResponse,
  type SettingsSetExtensionsRequest,
  type SettingsSetMemoryRequest,
  type SettingsSetPlannerRequest,
  type SettingsSetProactiveRequest,
} from '@team-x/shared-types';

import type { Schema } from '../client.js';
import { settings } from '../schema.js';

export type SettingRow = typeof settings.$inferSelect;

type SettingsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

/** Default settings seeded on first boot. */
const SETTING_DEFAULTS: Array<{ key: string; value: unknown }> = [
  { key: 'runtime_strategy', value: 'auto' },
  { key: 'max_privacy_tier', value: 'proprietary-cloud' },
  { key: 'concurrency_caps', value: DEFAULT_CONCURRENCY_CAPS },
  { key: 'orchestrator_slots', value: 6 },
  { key: 'rag_enabled', value: true },
  { key: 'rag_max_tokens', value: 2000 },
  { key: 'rag_threshold', value: 0.7 },
  { key: 'rag_top_k', value: 5 },
  { key: 'embedding_provider', value: 'auto' },
  { key: 'embedding_model', value: 'auto' },
  { key: 'embedding_dimension', value: 1536 },
  // Agentic loop budgets (Phase 5 — M31). Clamps live in AGENTIC_SETTINGS_CLAMPS.
  { key: 'agentic_max_steps', value: AGENTIC_SETTINGS_CLAMPS.maxSteps.default },
  { key: 'agentic_max_tokens', value: AGENTIC_SETTINGS_CLAMPS.maxTokens.default },
  { key: 'agentic_timeout_ms', value: AGENTIC_SETTINGS_CLAMPS.timeoutMs.default },
  // Task planner guardrails (Phase 5 — M32). Clamps live in PLANNER_SETTINGS_CLAMPS.
  { key: 'planner_max_tickets', value: PLANNER_SETTINGS_CLAMPS.maxTickets.default },
  { key: 'planner_max_depth', value: PLANNER_SETTINGS_CLAMPS.maxDepth.default },
  { key: 'planner_approval_level', value: PLANNER_APPROVAL_LEVEL_DEFAULT },
  {
    key: 'planner_escalation_threshold',
    value: PLANNER_SETTINGS_CLAMPS.escalationThreshold.default,
  },
  { key: 'extensions_autonomy_mode', value: 'balanced' },
  { key: 'memory_default_target_token_budget', value: MEMORY_TARGET_TOKEN_BUDGET_OPTIONS[1] },
  { key: 'memory_recent_turn_limit', value: MEMORY_SETTINGS_CLAMPS.recentTurnLimit.default },
  {
    key: 'memory_checkpoint_history_limit',
    value: MEMORY_SETTINGS_CLAMPS.checkpointHistoryLimit.default,
  },
  // Copilot service (Phase 5 — M33). Clamps live in COPILOT_SETTINGS_CLAMPS; categories
  // default to the full COPILOT_CATEGORIES set — a conservative default that never
  // leaves the user with a silently-disabled analyzer through a bad save.
  { key: 'copilot_enabled', value: COPILOT_ENABLED_DEFAULT },
  {
    key: 'copilot_interval_minutes',
    value: COPILOT_SETTINGS_CLAMPS.intervalMinutes.default,
  },
  { key: 'copilot_categories', value: COPILOT_CATEGORIES },
  { key: 'copilot_category_weights', value: COPILOT_CATEGORY_WEIGHTS_DEFAULT },
  // Proactive execution (Phase 6 — Proactive Execution System). Defaults to off;
  // autonomy mode controls how aggressively agents act without explicit commands.
  { key: 'proactive_enabled', value: false },
  { key: 'proactive_autonomy_mode', value: 'balanced' },
];

/**
 * Clamp an incoming integer to `[min, max]`. `Math.round` coerces
 * fractional inputs (the UI passes a number from `<input type="number">`)
 * to the nearest integer before bounding. Non-finite values are rejected
 * upstream in the handler; this function assumes a finite number.
 */
function clampInt(value: number, min: number, max: number): number {
  const rounded = Math.round(value);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

function clampFloat(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const rounded = Math.round(value * 10) / 10;
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function createSettingsRepo<TRunResult>(db: SettingsDb<TRunResult>) {
  return {
    /** Get the raw JSON string for a key, or null if not found. */
    getRaw(key: string): string | null {
      const row = db.select().from(settings).where(eq(settings.key, key)).get();
      return row?.valueJson ?? null;
    },

    /** Get a parsed value for a key with a typed fallback. */
    get<T>(key: string, fallback: T): T {
      const raw = this.getRaw(key);
      if (raw === null) return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    },

    /** Set a key to a JSON-serializable value. Upserts. */
    set(key: string, value: unknown): void {
      const now = Date.now();
      const json = JSON.stringify(value);
      const existing = db.select().from(settings).where(eq(settings.key, key)).get();
      if (existing) {
        db.update(settings)
          .set({ valueJson: json, updatedAt: now })
          .where(eq(settings.key, key))
          .run();
      } else {
        db.insert(settings)
          .values({ key, valueJson: json, scope: 'global', scopeId: null, updatedAt: now })
          .run();
      }
    },

    /** Return all setting rows. */
    getAll(): SettingRow[] {
      return db.select().from(settings).all();
    },

    /**
     * Insert default settings where missing. Returns the number of
     * rows seeded (0 if all defaults already exist).
     */
    seedDefaults(): number {
      let seeded = 0;
      for (const d of SETTING_DEFAULTS) {
        const existing = db.select().from(settings).where(eq(settings.key, d.key)).get();
        if (!existing) {
          this.set(d.key, d.value);
          seeded++;
        }
      }
      return seeded;
    },

    /**
     * Read the three agentic-loop budget keys as a single typed
     * snapshot. Missing keys fall back to the shared clamp defaults
     * so the agentic service always observes a sensible budget even
     * on first boot before `seedDefaults()` has run.
     *
     * Phase 5 — M31.
     */
    getAgentic(): SettingsGetAgenticResponse {
      return {
        maxSteps: this.get<number>('agentic_max_steps', AGENTIC_SETTINGS_CLAMPS.maxSteps.default),
        maxTokens: this.get<number>(
          'agentic_max_tokens',
          AGENTIC_SETTINGS_CLAMPS.maxTokens.default,
        ),
        timeoutMs: this.get<number>(
          'agentic_timeout_ms',
          AGENTIC_SETTINGS_CLAMPS.timeoutMs.default,
        ),
      };
    },

    /**
     * Patch one or more agentic-loop budget keys. Each field is
     * independently clamped into `[min, max]` from
     * `AGENTIC_SETTINGS_CLAMPS`; fractional inputs are rounded before
     * clamping. Missing keys retain their current persisted value.
     *
     * Non-finite inputs (NaN, Infinity, -Infinity) throw — the UI
     * should never send these, and letting them through would
     * corrupt the JSON-encoded value column.
     *
     * Phase 5 — M31.
     */
    setAgentic(req: SettingsSetAgenticRequest): void {
      if (req.maxSteps !== undefined) {
        if (!Number.isFinite(req.maxSteps)) {
          throw new Error('[settings] setAgentic: maxSteps must be a finite number');
        }
        const c = AGENTIC_SETTINGS_CLAMPS.maxSteps;
        this.set('agentic_max_steps', clampInt(req.maxSteps, c.min, c.max));
      }
      if (req.maxTokens !== undefined) {
        if (!Number.isFinite(req.maxTokens)) {
          throw new Error('[settings] setAgentic: maxTokens must be a finite number');
        }
        const c = AGENTIC_SETTINGS_CLAMPS.maxTokens;
        this.set('agentic_max_tokens', clampInt(req.maxTokens, c.min, c.max));
      }
      if (req.timeoutMs !== undefined) {
        if (!Number.isFinite(req.timeoutMs)) {
          throw new Error('[settings] setAgentic: timeoutMs must be a finite number');
        }
        const c = AGENTIC_SETTINGS_CLAMPS.timeoutMs;
        this.set('agentic_timeout_ms', clampInt(req.timeoutMs, c.min, c.max));
      }
    },

    /**
     * Read the four task-planner guardrail keys as a single typed
     * snapshot. Missing keys fall back to the shared clamp / enum
     * defaults so the write-side tools always observe sensible
     * guardrails even on first boot.
     *
     * Phase 5 — M32.
     */
    getPlanner(): SettingsGetPlannerResponse {
      const rawLevel = this.get<string>('planner_approval_level', PLANNER_APPROVAL_LEVEL_DEFAULT);
      const approvalLevel = (PLANNER_APPROVAL_LEVELS as readonly string[]).includes(rawLevel)
        ? (rawLevel as PlannerApprovalLevel)
        : PLANNER_APPROVAL_LEVEL_DEFAULT;
      return {
        maxTickets: this.get<number>(
          'planner_max_tickets',
          PLANNER_SETTINGS_CLAMPS.maxTickets.default,
        ),
        maxDepth: this.get<number>('planner_max_depth', PLANNER_SETTINGS_CLAMPS.maxDepth.default),
        approvalLevel,
        escalationThreshold: this.get<number>(
          'planner_escalation_threshold',
          PLANNER_SETTINGS_CLAMPS.escalationThreshold.default,
        ),
      };
    },

    /**
     * Patch one or more task-planner guardrail keys. Numeric fields
     * are independently clamped; `approvalLevel` is validated against
     * `PLANNER_APPROVAL_LEVELS`. Missing keys retain their current
     * persisted value.
     *
     * Phase 5 — M32.
     */
    setPlanner(req: SettingsSetPlannerRequest): void {
      if (req.maxTickets !== undefined) {
        if (!Number.isFinite(req.maxTickets)) {
          throw new Error('[settings] setPlanner: maxTickets must be a finite number');
        }
        const c = PLANNER_SETTINGS_CLAMPS.maxTickets;
        this.set('planner_max_tickets', clampInt(req.maxTickets, c.min, c.max));
      }
      if (req.maxDepth !== undefined) {
        if (!Number.isFinite(req.maxDepth)) {
          throw new Error('[settings] setPlanner: maxDepth must be a finite number');
        }
        const c = PLANNER_SETTINGS_CLAMPS.maxDepth;
        this.set('planner_max_depth', clampInt(req.maxDepth, c.min, c.max));
      }
      if (req.approvalLevel !== undefined) {
        if (!(PLANNER_APPROVAL_LEVELS as readonly string[]).includes(req.approvalLevel)) {
          throw new Error(
            `[settings] setPlanner: approvalLevel must be one of ${PLANNER_APPROVAL_LEVELS.join(', ')}`,
          );
        }
        this.set('planner_approval_level', req.approvalLevel);
      }
      if (req.escalationThreshold !== undefined) {
        if (!Number.isFinite(req.escalationThreshold)) {
          throw new Error('[settings] setPlanner: escalationThreshold must be a finite number');
        }
        const c = PLANNER_SETTINGS_CLAMPS.escalationThreshold;
        this.set('planner_escalation_threshold', clampInt(req.escalationThreshold, c.min, c.max));
      }
    },

    /**
     * Read the global Extensions & Authority autonomy policy.
     * Invalid persisted values fall back to `balanced`.
     */
    getExtensions(): SettingsGetExtensionsResponse {
      const rawMode = this.get<string>('extensions_autonomy_mode', 'balanced');
      const autonomyMode = (EXTENSIONS_AUTONOMY_MODES as readonly string[]).includes(rawMode)
        ? (rawMode as SettingsGetExtensionsResponse['autonomyMode'])
        : 'balanced';
      return { autonomyMode };
    },

    /**
     * Persist the global Extensions & Authority autonomy policy.
     */
    setExtensions(req: SettingsSetExtensionsRequest): void {
      if (!(EXTENSIONS_AUTONOMY_MODES as readonly string[]).includes(req.autonomyMode)) {
        throw new Error(
          `[settings] setExtensions: autonomyMode must be one of ${EXTENSIONS_AUTONOMY_MODES.join(', ')}`,
        );
      }
      this.set('extensions_autonomy_mode', req.autonomyMode);
    },

    /**
     * Read the long-run memory defaults as a single typed snapshot.
     * Invalid persisted values fall back to the shared defaults.
     */
    getMemory(): SettingsGetMemoryResponse {
      const rawBudget = this.get<number>(
        'memory_default_target_token_budget',
        MEMORY_TARGET_TOKEN_BUDGET_OPTIONS[1],
      );
      const defaultTargetTokenBudget = MEMORY_TARGET_TOKEN_BUDGET_OPTIONS.includes(
        rawBudget as (typeof MEMORY_TARGET_TOKEN_BUDGET_OPTIONS)[number],
      )
        ? (rawBudget as SettingsGetMemoryResponse['defaultTargetTokenBudget'])
        : MEMORY_TARGET_TOKEN_BUDGET_OPTIONS[1];
      return {
        defaultTargetTokenBudget,
        recentTurnLimit: this.get<number>(
          'memory_recent_turn_limit',
          MEMORY_SETTINGS_CLAMPS.recentTurnLimit.default,
        ),
        checkpointHistoryLimit: this.get<number>(
          'memory_checkpoint_history_limit',
          MEMORY_SETTINGS_CLAMPS.checkpointHistoryLimit.default,
        ),
      };
    },

    /**
     * Patch one or more long-run memory defaults. Budget must be one of the
     * supported presets; numeric fields are rounded and clamped.
     */
    setMemory(req: SettingsSetMemoryRequest): void {
      if (req.defaultTargetTokenBudget !== undefined) {
        if (!MEMORY_TARGET_TOKEN_BUDGET_OPTIONS.includes(req.defaultTargetTokenBudget)) {
          throw new Error(
            `[settings] setMemory: defaultTargetTokenBudget must be one of ${MEMORY_TARGET_TOKEN_BUDGET_OPTIONS.join(', ')}`,
          );
        }
        this.set('memory_default_target_token_budget', req.defaultTargetTokenBudget);
      }
      if (req.recentTurnLimit !== undefined) {
        if (!Number.isFinite(req.recentTurnLimit)) {
          throw new Error('[settings] setMemory: recentTurnLimit must be a finite number');
        }
        const c = MEMORY_SETTINGS_CLAMPS.recentTurnLimit;
        this.set('memory_recent_turn_limit', clampInt(req.recentTurnLimit, c.min, c.max));
      }
      if (req.checkpointHistoryLimit !== undefined) {
        if (!Number.isFinite(req.checkpointHistoryLimit)) {
          throw new Error('[settings] setMemory: checkpointHistoryLimit must be a finite number');
        }
        const c = MEMORY_SETTINGS_CLAMPS.checkpointHistoryLimit;
        this.set(
          'memory_checkpoint_history_limit',
          clampInt(req.checkpointHistoryLimit, c.min, c.max),
        );
      }
    },

    /**
     * Read the three copilot-service settings keys as a single typed
     * snapshot. Missing keys fall back to the shared clamp defaults so
     * the analyzer always observes sensible settings even on first
     * boot before `seedDefaults()` has run.
     *
     * Clamp-at-read guarantees: a pre-existing out-of-range value in
     * the DB (from a manual edit, a failed migration, or a prior-version
     * save) is clamped on the read path so the analyzer never observes
     * a value outside `[1, 60]`. Empty categories fall back to the full
     * set at read time for the same reason.
     *
     * Phase 5 — M33.
     */
    getCopilot(): SettingsGetCopilotResponse {
      const enabled = this.get<boolean>('copilot_enabled', COPILOT_ENABLED_DEFAULT);
      const rawInterval = this.get<number>(
        'copilot_interval_minutes',
        COPILOT_SETTINGS_CLAMPS.intervalMinutes.default,
      );
      const ic = COPILOT_SETTINGS_CLAMPS.intervalMinutes;
      const intervalMinutes = Number.isFinite(rawInterval)
        ? clampInt(rawInterval, ic.min, ic.max)
        : ic.default;
      const rawCategories = this.get<unknown>('copilot_categories', COPILOT_CATEGORIES);
      const filtered = Array.isArray(rawCategories)
        ? (rawCategories.filter((x): x is CopilotCategory =>
            (COPILOT_CATEGORIES as readonly string[]).includes(x as string),
          ) as CopilotCategory[])
        : [];
      const categories =
        filtered.length === 0 ? (COPILOT_CATEGORIES.slice() as CopilotCategory[]) : filtered;
      return { enabled, intervalMinutes, categories };
    },

    /**
     * Read copilot feedback category weights as a five-key snapshot.
     * Missing or malformed persisted data falls back per category so a
     * partial bad write cannot disable the full analyzer weighting pass.
     *
     * Phase 6 — M38.
     */
    getCopilotWeights(): SettingsGetCopilotWeightsResponse {
      const raw = this.get<unknown>('copilot_category_weights', COPILOT_CATEGORY_WEIGHTS_DEFAULT);
      const weights = { ...COPILOT_CATEGORY_WEIGHTS_DEFAULT };
      if (isPlainRecord(raw)) {
        for (const category of COPILOT_CATEGORIES) {
          const value = raw[category];
          if (typeof value === 'number' && Number.isFinite(value)) {
            weights[category] = clampFloat(
              value,
              COPILOT_CATEGORY_WEIGHT_CLAMP.min,
              COPILOT_CATEGORY_WEIGHT_CLAMP.max,
            );
          }
        }
      }
      return { weights };
    },

    /**
     * Patch one or more copilot feedback category weights. Missing keys
     * retain their current value, unknown runtime keys are ignored, and
     * accepted values are rounded to one decimal before clamping to the
     * M38 `[0, 2]` envelope.
     *
     * Note: `req.companyId` is reserved for future company-scoped
     * settings; the current settings table stores these weights globally.
     *
     * Phase 6 — M38.
     */
    setCopilotWeights(req: SettingsSetCopilotWeightsRequest): SettingsSetCopilotWeightsResponse {
      const weights = { ...this.getCopilotWeights().weights };
      const patch = isPlainRecord(req.weights) ? req.weights : {};
      for (const category of COPILOT_CATEGORIES) {
        const value = patch[category];
        if (typeof value === 'number') {
          weights[category] = clampFloat(
            value,
            COPILOT_CATEGORY_WEIGHT_CLAMP.min,
            COPILOT_CATEGORY_WEIGHT_CLAMP.max,
          );
        }
      }
      this.set('copilot_category_weights', weights);
      return { weights };
    },

    /**
     * Patch one or more copilot-service settings. `enabled` is coerced
     * to boolean. `intervalMinutes` is clamped into `[min, max]` from
     * `COPILOT_SETTINGS_CLAMPS`; fractional inputs are rounded; non-
     * finite numbers are rejected. `categories` is filtered against
     * `COPILOT_CATEGORIES` with an empty-array guard — an empty set
     * (after filtering) falls back to the full `COPILOT_CATEGORIES`
     * set rather than persisting a silently-disabled analyzer.
     *
     * Note: `req.companyId` is consumed by the IPC handler for the
     * `CopilotAnalyzerService.restart(companyId)` side effect and is
     * intentionally ignored here — copilot settings are global.
     *
     * Phase 5 — M33.
     */
    setCopilot(req: SettingsSetCopilotRequest): void {
      if (req.enabled !== undefined) {
        this.set('copilot_enabled', Boolean(req.enabled));
      }
      if (req.intervalMinutes !== undefined) {
        if (!Number.isFinite(req.intervalMinutes)) {
          throw new Error('[settings] setCopilot: intervalMinutes must be a finite number');
        }
        const c = COPILOT_SETTINGS_CLAMPS.intervalMinutes;
        this.set('copilot_interval_minutes', clampInt(req.intervalMinutes, c.min, c.max));
      }
      if (req.categories !== undefined) {
        const filtered = req.categories.filter((x): x is CopilotCategory =>
          (COPILOT_CATEGORIES as readonly string[]).includes(x as string),
        );
        const safe: CopilotCategory[] =
          filtered.length === 0 ? (COPILOT_CATEGORIES.slice() as CopilotCategory[]) : filtered;
        this.set('copilot_categories', safe);
      }
    },

    /**
     * Read the proactive execution settings as a single typed snapshot.
     * Missing keys fall back to safe defaults (disabled, balanced autonomy).
     *
     * Phase 6 — Proactive Execution System.
     */
    getProactive(): SettingsGetProactiveResponse {
      const enabled = this.get<boolean>('proactive_enabled', false);
      const rawMode = this.get<string>('proactive_autonomy_mode', 'balanced');
      const autonomyMode = (EXTENSIONS_AUTONOMY_MODES as readonly string[]).includes(rawMode)
        ? (rawMode as SettingsGetProactiveResponse['autonomyMode'])
        : 'balanced';
      return { enabled, autonomyMode };
    },

    /**
     * Patch one or more proactive execution settings. `enabled` is coerced to
     * boolean; `autonomyMode` is validated against `EXTENSIONS_AUTONOMY_MODES`.
     * Missing keys retain their current persisted value.
     *
     * Phase 6 — Proactive Execution System.
     */
    setProactive(req: SettingsSetProactiveRequest): void {
      if (req.enabled !== undefined) {
        this.set('proactive_enabled', Boolean(req.enabled));
      }
      if (req.autonomyMode !== undefined) {
        if (!(EXTENSIONS_AUTONOMY_MODES as readonly string[]).includes(req.autonomyMode)) {
          throw new Error(
            `[settings] setProactive: autonomyMode must be one of ${EXTENSIONS_AUTONOMY_MODES.join(', ')}`,
          );
        }
        this.set('proactive_autonomy_mode', req.autonomyMode);
      }
    },
  };
}

export type SettingsRepo = ReturnType<typeof createSettingsRepo>;
