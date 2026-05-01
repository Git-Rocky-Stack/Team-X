/**
 * Providers service — CRUD + first-boot seeding + credential-aware
 * `isConfigured` check for the Team-X LLM-provider registry.
 *
 * Two layers, mirroring the canonical pattern established in
 * `db/client.ts` (createDb / initDb / getDb) and `db/seed.ts`
 * (seedIfEmpty / seed):
 *
 * 1. `createProvidersService(db, secrets)` — PURE factory, generic over the
 *    Drizzle driver's `TRunResult` so the same implementation works with
 *    both `BetterSQLite3Database<Schema>` at runtime and `SQLJsDatabase<Schema>`
 *    under Vitest. The secrets store is injected so the dependency is
 *    explicit and tests can observe the `isConfigured` credential lookup
 *    without reaching into module-level state.
 *
 * 2. `getProvidersService()` + `seedDefaultProviders()` — thin runtime
 *    wrappers that construct a process-wide instance against the real
 *    `getDb()` + `new SecretsStore()`, and expose the one-call seeding
 *    entry point that `main/index.ts` invokes on boot.
 *
 * The `providers` table is defined in `db/schema.ts`; this service owns the
 * semantics — what rows get seeded, how they map to the shared-types
 * `ProviderConfig` shape, and what "configured" actually means (enabled
 * AND either local OR has-key-in-keychain).
 */

import { randomUUID } from 'node:crypto';

import type { PrivacyTier, ProviderConfig, ProviderKind } from '@team-x/shared-types';
import { eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import { type Schema, getDb } from '../db/client.js';
import { providers } from '../db/schema.js';

import { SecretsStore } from './secrets.js';

/**
 * Canonical id of the default Ollama row seeded on first boot. Exported as
 * a constant so tests, the provider router (Task 32), and the renderer IPC
 * layer (Task 37+) can all reference the same string without duplication.
 */
export const DEFAULT_OLLAMA_LOCAL_ID = 'ollama-local';

/**
 * Canonical id of the default Anthropic row seeded on first boot.
 */
export const DEFAULT_ANTHROPIC_ID = 'anthropic';

type ProviderRow = typeof providers.$inferSelect;
type ProvidersDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

/**
 * Public surface of the providers service. Declared as an explicit interface
 * (rather than relying on `ReturnType<typeof createProvidersService>`) so
 * downstream consumers — IPC handlers, the provider router, test fixtures —
 * can pass the service around without re-stating the generic `TRunResult`.
 *
 * Three of the four methods are synchronous because Drizzle's
 * better-sqlite3 and sql-js drivers both run queries synchronously.
 * `isConfigured` is the only async method: it has to await
 * `SecretsStore.getApiKey`, which wraps keytar's async native binding.
 */
export interface ProvidersService {
  /**
   * Insert the two default provider rows (`ollama-local`, `anthropic`) if
   * the `providers` table is empty. Idempotent — a second call on an
   * already-seeded database is a no-op. Existing rows are never modified.
   */
  seedIfEmpty(): void;

  /**
   * Return every provider row, mapped to the shared-types `ProviderConfig`
   * shape. Phase 1 is small enough that pagination is unnecessary.
   */
  list(): ProviderConfig[];

  /**
   * Return the provider with a matching id, or `null` if none exists.
   */
  get(id: string): ProviderConfig | null;

  /**
   * Return `true` iff the provider is usable right now:
   *
   * - it exists in the `providers` table, AND
   * - its `enabled` flag is `true`, AND
   * - it is either a local provider (no credential required) or has an
   *   API key stored in the OS keychain under its `id`.
   *
   * This is the check the provider router (Task 32) will use to decide
   * whether to surface a provider in the "ready" set, and what the
   * Settings tab will use to drive the "configured" badge.
   */
  isConfigured(id: string): Promise<boolean>;

  /** Insert a new provider row. Returns the created config. */
  add(provider: {
    name: string;
    kind: ProviderKind;
    privacyTier: PrivacyTier;
    configJson?: string;
    enabled?: boolean;
  }): ProviderConfig;

  /** Partial update of mutable fields. */
  update(id: string, fields: { name?: string; enabled?: boolean; configJson?: string }): void;

  /** Delete a provider row and its keychain entry. */
  remove(id: string): Promise<void>;
}

/**
 * Parse a `config_json` column value defensively. A corrupted or hand-edited
 * row must not crash `list()` or `get()` — we prefer to surface the row with
 * an empty config over throwing from the provider service.
 */
function parseConfigJson(configJson: string): { baseUrl?: string; defaultModel?: string } {
  try {
    const parsed = JSON.parse(configJson) as { baseUrl?: string; defaultModel?: string };
    if (parsed && typeof parsed === 'object') return parsed;
    return {};
  } catch {
    return {};
  }
}

function rowToProviderConfig(row: ProviderRow): ProviderConfig {
  const config = parseConfigJson(row.configJson);
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as ProviderKind,
    privacyTier: row.privacyTier as PrivacyTier,
    baseUrl: config.baseUrl,
    defaultModel: config.defaultModel,
    enabled: row.enabled,
  };
}

/**
 * Factory for the providers service. Generic over the Drizzle driver's
 * `TRunResult` so the same function accepts both better-sqlite3 at runtime
 * and sql.js under tests — matching the repo factory shape established in
 * Task 21 (`createCompaniesRepo`, `createEmployeesRepo`, etc.).
 *
 * The `SecretsStore` dependency is injected rather than instantiated
 * internally so tests can pass a pre-configured instance and production
 * code can share a single secrets instance across all main-process services.
 */
export function createProvidersService<TRunResult>(
  db: ProvidersDb<TRunResult>,
  secrets: SecretsStore,
): ProvidersService {
  function getRaw(id: string): ProviderRow | null {
    const row = db.select().from(providers).where(eq(providers.id, id)).get();
    return row ?? null;
  }

  return {
    seedIfEmpty(): void {
      const existing = db.select().from(providers).all();
      if (existing.length === 0) {
        db.insert(providers)
          .values([
            {
              id: DEFAULT_OLLAMA_LOCAL_ID,
              name: 'Ollama (Local)',
              kind: 'ollama',
              configJson: JSON.stringify({ baseUrl: 'http://localhost:11434/api' }),
              privacyTier: 'local',
              enabled: true,
            },
            {
              id: DEFAULT_ANTHROPIC_ID,
              name: 'Anthropic',
              kind: 'anthropic',
              configJson: '{}',
              privacyTier: 'proprietary-cloud',
              enabled: true,
            },
            {
              id: 'openai',
              name: 'OpenAI',
              kind: 'openai',
              configJson: '{}',
              privacyTier: 'proprietary-cloud',
              enabled: false,
            },
            {
              id: 'google',
              name: 'Google Gemini',
              kind: 'google',
              configJson: '{}',
              privacyTier: 'proprietary-cloud',
              enabled: false,
            },
            {
              id: 'groq',
              name: 'Groq',
              kind: 'groq',
              configJson: '{}',
              privacyTier: 'open-source-cloud',
              enabled: false,
            },
            {
              id: 'openrouter',
              name: 'OpenRouter',
              kind: 'openrouter',
              configJson: '{}',
              privacyTier: 'proprietary-cloud',
              enabled: false,
            },
            {
              id: 'together',
              name: 'Together AI',
              kind: 'together',
              configJson: '{}',
              privacyTier: 'open-source-cloud',
              enabled: false,
            },
            {
              id: 'fireworks',
              name: 'Fireworks AI',
              kind: 'fireworks',
              configJson: '{}',
              privacyTier: 'open-source-cloud',
              enabled: false,
            },
          ])
          .run();
      } else {
        // Auto-fix: correct Ollama baseURL for all patterns
        // The ollama-ai-provider SDK expects baseURL to include /api and appends /chat or /embed
        // Correct: http://localhost:11434/api → http://localhost:11434/api/chat
        // Wrong: http://localhost:11434 → http://localhost:11434/chat (404 from Ollama)
        const ollamaRow = existing.find((r) => r.id === DEFAULT_OLLAMA_LOCAL_ID);
        if (ollamaRow) {
          const config = parseConfigJson(ollamaRow.configJson);
          let fixedBaseUrl: string | undefined;

          if (!config.baseUrl) {
            // Empty baseUrl - set default
            fixedBaseUrl = 'http://localhost:11434/api';
          } else if (
            config.baseUrl === 'http://localhost:11434' ||
            config.baseUrl === 'http://127.0.0.1:11434'
          ) {
            // Missing /api suffix - add it
            fixedBaseUrl = `${config.baseUrl}/api`;
          } else if (
            config.baseUrl.match(/^https?:\/\/[\w.-]+:\d+$/) &&
            !config.baseUrl.includes('/api')
          ) {
            // Any host:port pattern without /api (e.g., http://192.168.1.100:11434)
            fixedBaseUrl = `${config.baseUrl}/api`;
          } else if (config.baseUrl.endsWith('/')) {
            // Remove trailing slash before /api if present (e.g., http://localhost:11434/api/)
            fixedBaseUrl = config.baseUrl.slice(0, -1);
          }

          if (fixedBaseUrl) {
            db.update(providers)
              .set({
                configJson: JSON.stringify({
                  ...(config.defaultModel ? { defaultModel: config.defaultModel } : {}),
                  baseUrl: fixedBaseUrl,
                }),
              })
              .where(eq(providers.id, DEFAULT_OLLAMA_LOCAL_ID))
              .run();
          }
        }
      }
    },

    list(): ProviderConfig[] {
      return db.select().from(providers).all().map(rowToProviderConfig);
    },

    get(id: string): ProviderConfig | null {
      const row = getRaw(id);
      return row ? rowToProviderConfig(row) : null;
    },

    async isConfigured(id: string): Promise<boolean> {
      const row = getRaw(id);
      if (!row) return false;
      if (!row.enabled) return false;
      if ((row.privacyTier as PrivacyTier) === 'local') return true;
      const key = await secrets.getApiKey(id);
      return key !== null && key.length > 0;
    },

    add(provider): ProviderConfig {
      const id = randomUUID();
      db.insert(providers)
        .values({
          id,
          name: provider.name,
          kind: provider.kind,
          privacyTier: provider.privacyTier,
          configJson: provider.configJson ?? '{}',
          enabled: provider.enabled ?? false,
        })
        .run();
      const inserted = getRaw(id);
      if (!inserted) throw new Error(`[providers] failed to read back inserted provider: ${id}`);
      return rowToProviderConfig(inserted);
    },

    update(id, fields): void {
      const row = getRaw(id);
      if (!row) throw new Error(`[providers] provider not found: ${id}`);

      const values: Record<string, unknown> = {};
      if (fields.name !== undefined) values.name = fields.name;
      if (fields.enabled !== undefined) values.enabled = fields.enabled;
      if (fields.configJson !== undefined) values.configJson = fields.configJson;

      if (Object.keys(values).length > 0) {
        db.update(providers).set(values).where(eq(providers.id, id)).run();
      }
    },

    async remove(id): Promise<void> {
      db.delete(providers).where(eq(providers.id, id)).run();
      try {
        await secrets.deleteApiKey(id);
      } catch (error) {
        console.warn(
          `[providers] removed provider row but failed to delete keychain entry for ${id}:`,
          error,
        );
      }
    },
  };
}

// -----------------------------------------------------------------------------
// Runtime wrappers — thin, electron-bound entry points for main/index.ts.
// The singleton is lazy so tests never accidentally construct the real DB.
// -----------------------------------------------------------------------------

let _service: ProvidersService | null = null;

/**
 * Return the process-wide providers service, constructing it against
 * `getDb()` + a fresh `SecretsStore` on first call. Throws if `initDb`
 * has not been called yet (inherited from `getDb`'s own guard).
 *
 * This is the entry point IPC handlers and the provider router should
 * call — never `createProvidersService` directly from runtime code,
 * because that would require every caller to re-wire the DB + secrets
 * dependencies.
 */
export function getProvidersService(): ProvidersService {
  if (_service === null) {
    _service = createProvidersService(getDb(), new SecretsStore());
  }
  return _service;
}

/**
 * Convenience one-liner for `main/index.ts` to call inside `app.whenReady()`
 * right after `seed()`. Seeds the two default provider rows on first boot
 * and logs a one-line summary so the dev console tells the full "what just
 * happened on startup" story. Silent on subsequent boots.
 */
export function seedDefaultProviders(): void {
  const service = getProvidersService();
  const wasEmpty = service.list().length === 0;
  service.seedIfEmpty();
  if (wasEmpty) {
    console.log(
      `[providers] seeded defaults: ${DEFAULT_OLLAMA_LOCAL_ID} + ${DEFAULT_ANTHROPIC_ID}`,
    );
  }
}

/**
 * Reset the module-level singleton. **Test-only** — exported for integration
 * tests that need to construct multiple providers services against different
 * databases in the same process. Production code must never call this.
 */
export function __resetProvidersServiceForTests(): void {
  _service = null;
}
