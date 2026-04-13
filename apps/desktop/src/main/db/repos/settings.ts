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

import { DEFAULT_CONCURRENCY_CAPS } from '@team-x/shared-types';

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
];

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
  };
}

export type SettingsRepo = ReturnType<typeof createSettingsRepo>;
