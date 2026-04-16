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
  DEFAULT_CONCURRENCY_CAPS,
  PLANNER_APPROVAL_LEVELS,
  PLANNER_APPROVAL_LEVEL_DEFAULT,
  PLANNER_SETTINGS_CLAMPS,
  type PlannerApprovalLevel,
  type SettingsGetAgenticResponse,
  type SettingsGetPlannerResponse,
  type SettingsSetAgenticRequest,
  type SettingsSetPlannerRequest,
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
  };
}

export type SettingsRepo = ReturnType<typeof createSettingsRepo>;
