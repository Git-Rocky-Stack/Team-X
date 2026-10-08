/**
 * Provider factory — turns a (`providerId` + `model`) pair, or a whole
 * `EmployeeRow`, into a concrete `ProviderStreamFn` that the
 * orchestrator can drive.
 *
 * This is the seam where the desktop main process binds three previously
 * independent layers together for the first time:
 *
 *   - the in-memory provider router (`@team-x/provider-router`),
 *   - the on-disk providers registry (`providers` table via
 *     `ProvidersService`),
 *   - the OS keychain (`SecretsStore`).
 *
 * Layered for testability:
 *
 *   1. `createProviderFactory({ providersService, secretsStore, companiesRepo })`
 *      is a PURE factory. The factory accepts injected services rather
 *      than reaching for module-level singletons, so the unit suite can
 *      hand-roll fakes that never touch the DB or the keychain. The
 *      `secretsStore` and `companiesRepo` parameters are typed against
 *      narrow interfaces for the same reason — tests don't need to satisfy
 *      either full runtime service surface.
 *
 *   2. `getProviderFactory()` is a thin runtime wrapper that
 *      constructs the process-wide instance against
 *      `getProvidersService()` + `new SecretsStore()`. Lazy so the
 *      test suite never accidentally pulls keytar into the bundle.
 *      Symmetric with `getProvidersService()` — same pattern, same
 *      reset hook for tests that need a fresh process-wide instance.
 *
 * Phase 1 selection rules:
 *
 *   `resolveForEmployee(employee)` walks an ordered candidate list:
 *
 *     1. `employee.providerPref` (if set)
 *     2. `DEFAULT_ANTHROPIC_ID` ('anthropic')
 *     3. `DEFAULT_OLLAMA_LOCAL_ID` ('ollama-local')
 *
 *   The first candidate that exists in the `providers` table AND passes
 *   `isConfigured()` wins. `isConfigured` returns `true` for any local
 *   provider unconditionally and for cloud providers only when an API
 *   key is present in the keychain — so a fresh install with no keys
 *   silently lands on Ollama, which is exactly the demo path.
 *
 *   Model selection: `employee.modelPref` if set, else the per-kind
 *   Phase 1 default (`DEFAULT_MODEL_BY_KIND`). Phase 2 lifts this into
 *   the model_registry table populated from a versioned manifest; the
 *   constant lives next to its consumer for now to keep the seam
 *   visible.
 *
 * Phase 1 explicitly does NOT consult `role.md` frontmatter
 * (`preferred_providers`, `preferred_model_tier`). That lookup belongs
 * inside the `resolveSystemPrompt` path where role.md is already
 * parsed, and keeping this factory free of disk I/O means the test
 * surface is minimal and the failure modes don't pull in the role-pack
 * loader.
 *
 * Architectural invariant: this file is the ONLY place in the desktop
 * main process that constructs adapters from the provider router. All
 * runtime call sites (the orchestrator, the IPC handler that previews
 * a provider, future "test connection" UI) consume `getProviderFactory`
 * — never `makeAnthropicStream` / `makeOllamaStream` directly.
 */

import {
  type EmbedAdapter,
  type ProviderStreamFn,
  type StreamMessage,
  makeAnthropicStream,
  makeFireworksStream,
  makeGoogleStream,
  makeGroqStream,
  makeOllamaEmbedAdapter,
  makeOllamaStream,
  makeOpenAICompatStream,
  makeOpenAIEmbedAdapter,
  makeOpenAIStream,
  makeOpenRouterStream,
  makeTogetherStream,
} from '@team-x/provider-router';
import {
  PRIVACY_TIER_PROVIDER_LABEL,
  PRIVACY_TIER_RANK,
  type PrivacyTier,
  type ProviderConfig,
  type ProviderKind,
  exceedsPrivacyTier as exceedsTier,
} from '@team-x/shared-types';

import { getDb } from '../db/client.js';
import { createCompaniesRepo } from '../db/repos/companies.js';
import type { EmployeeRow } from '../db/repos/employees.js';
import { createSettingsRepo } from '../db/repos/settings.js';

import {
  DEFAULT_ANTHROPIC_ID,
  DEFAULT_OLLAMA_LOCAL_ID,
  type ProvidersService,
  getProvidersService,
} from './providers.js';
import { SecretsStore } from './secrets.js';

/**
 * Per-kind default model used when an employee has no `modelPref` and
 * the caller of `create()` did not pass an explicit `model`. Hardcoded
 * for Phase 1; Phase 2 lifts this into a model_registry table populated
 * from a versioned manifest that ships with role packs.
 *
 * The Anthropic default is the haiku tier rather than opus on purpose:
 * Phase 1's demo path is "type a question, watch tokens stream", and
 * haiku is the cheapest, fastest, lowest-friction option for that loop.
 * Roles that need real reasoning depth set `preferred_model_tier: high`
 * in their role.md frontmatter — the orchestrator will start honoring
 * that in Phase 2 when the model registry lands.
 */
const DEFAULT_MODEL_BY_KIND: Partial<Record<ProviderKind, string>> = {
  anthropic: 'claude-haiku-4-5',
  ollama: 'llama3.1:8b',
  openai: 'gpt-4o-mini',
  google: 'gemini-2.0-flash',
  groq: 'llama-3.1-8b-instant',
  openrouter: 'meta-llama/llama-3.1-8b-instruct',
  together: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  fireworks: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
  // custom-openai has no default — the caller must always specify a model
  // because the target endpoint's model catalog is unknown.
};

// -----------------------------------------------------------------------------
// Privacy-tier enforcement
// -----------------------------------------------------------------------------

/** Max-tier names — mirror the Settings → Privacy option labels verbatim. */
const MAX_TIER_LABEL: Record<PrivacyTier, string> = {
  local: 'Local Only',
  'open-source-cloud': 'Open-Source Cloud',
  'proprietary-cloud': 'All Providers',
};

/** What the user can switch to instead, per max tier. */
const ALLOWED_ALTERNATIVE: Record<PrivacyTier, string> = {
  local: 'a local provider (Ollama)',
  'open-source-cloud': 'a local or open-source cloud provider',
  'proprietary-cloud': 'a provider with a recognised privacy tier',
};

function isPrivacyTier(value: string): value is PrivacyTier {
  return Object.hasOwn(PRIVACY_TIER_RANK, value);
}

/**
 * Thrown when Settings → Privacy's max tier forbids the provider a run (or an
 * embedding call) resolved to. The message is user-facing — it reaches the
 * dashboard verbatim through the orchestrator's `work.failed` path — so it
 * names the provider, both tiers, and the two ways out. The structured fields
 * let callers branch without parsing the message.
 */
export class PrivacyTierViolationError extends Error {
  readonly providerId: string;
  readonly providerName: string;
  readonly providerTier: string;
  readonly maxTier: string;

  constructor(args: {
    /** The refused provider — or, for an external runtime profile, its stand-in. */
    provider: Pick<ProviderConfig, 'id' | 'name' | 'privacyTier'>;
    model: string;
    maxTier: string;
    /** Where the user fixes it — the employee (runs) or Settings → Retrieval (embeddings). */
    remedyScope: 'none' | 'employee' | 'retrieval';
    purpose: 'run' | 'embedding' | 'runtime';
    /** Why the provider ranks where it does, when that is not self-evident. */
    reason?: string;
  }) {
    const { provider, model, maxTier } = args;
    const providerTierName = isPrivacyTier(provider.privacyTier)
      ? PRIVACY_TIER_PROVIDER_LABEL[provider.privacyTier]
      : 'Unclassified';
    const maxLabel = isPrivacyTier(maxTier) ? MAX_TIER_LABEL[maxTier] : MAX_TIER_LABEL.local;
    const alternative = isPrivacyTier(maxTier)
      ? ALLOWED_ALTERNATIVE[maxTier]
      : ALLOWED_ALTERNATIVE.local;
    const scope =
      args.remedyScope === 'employee'
        ? ' for this employee'
        : args.remedyScope === 'retrieval'
          ? ' in Settings → Retrieval'
          : '';
    const subject =
      args.purpose === 'embedding'
        ? 'Embedding provider'
        : args.purpose === 'runtime'
          ? 'Runtime profile'
          : 'Provider';
    const reason = args.reason ? ` ${args.reason}` : '';
    super(
      `${subject} "${provider.name} (${model})" is ${providerTierName}-tier, but Settings → Privacy allows ${maxLabel}.${reason} Choose ${alternative}${scope} or raise the privacy tier.`,
    );
    this.name = 'PrivacyTierViolationError';
    this.providerId = provider.id;
    this.providerName = provider.name;
    this.providerTier = provider.privacyTier;
    this.maxTier = maxTier;
  }
}

/** `true` when `provider` sits above `maxTier` — the shared, fail-closed rule. */
export function exceedsPrivacyTier(
  provider: Pick<ProviderConfig, 'privacyTier'>,
  maxTier: string,
): boolean {
  return exceedsTier(provider.privacyTier, maxTier);
}

/**
 * Resolved provider binding returned to the orchestrator. The shape
 * intentionally matches `ResolveProvider`'s return type from
 * `orchestrator/index.ts` so the desktop wiring code can pass
 * `factory.resolveForEmployee` directly to `buildOrchestrator`'s
 * `resolveProvider` slot without an adapter layer.
 */
export interface ResolvedProvider {
  /** Stable id from the providers table — used in telemetry / runs row. */
  providerName: string;
  /** Provider kind from the registry — e.g. ollama, anthropic, openai. */
  providerKind?: ProviderKind;
  /** Model id passed to the underlying SDK. */
  model: string;
  /** Bound stream function the orchestrator drives via `streamAgent`. */
  stream: ProviderStreamFn;
}

/**
 * Narrow secrets-reading surface the factory needs from the
 * `SecretsStore`. Declared as its own interface so tests can pass a
 * plain object with a single `getApiKey` method without satisfying the
 * full keychain class. The production `SecretsStore` structurally
 * satisfies it via TypeScript's structural typing.
 */
export interface SecretsReader {
  getApiKey(providerId: string): Promise<string | null>;
}

export interface ProviderFactoryCompaniesRepo {
  getById(id: string): { settingsJson: string | null } | null;
}

export interface ProviderFactoryDeps {
  providersService: ProvidersService;
  secretsStore: SecretsReader;
  companiesRepo: ProviderFactoryCompaniesRepo;
  /**
   * Settings → Privacy's max tier, read on EVERY resolution so a change
   * applies to the next run without rebuilding the factory. When present,
   * `create` and `resolveForEmployee` refuse a provider above it with a
   * `PrivacyTierViolationError`. Absent = no enforcement (unit suites and
   * ad-hoc factories keep their pre-enforcement behaviour).
   */
  getMaxPrivacyTier?: () => PrivacyTier;
}

export interface ProviderFactory {
  /**
   * Construct a `ResolvedProvider` for an explicit (`providerId`,
   * `model`) pair. Used by IPC paths that need to test a specific
   * provider — the future Settings tab's "Test connection" button is
   * the canonical caller. Throws if:
   *
   *   - the provider id does not exist in the registry,
   *   - the provider is disabled,
   *   - the provider is unconfigured (cloud + no key in keychain),
   *   - the provider kind has no Phase 1 adapter,
   *   - the provider's privacy tier exceeds `getMaxPrivacyTier()`
   *     (`PrivacyTierViolationError`).
   */
  create(args: { providerId: string; model?: string }): Promise<ResolvedProvider>;

  /**
   * Resolve the best provider + model for the given employee. Honors
   * `employee.providerPref` first, then falls back through the Phase 1
   * default order. Implements the `ResolveProvider` contract from
   * `orchestrator/index.ts` so it can be passed straight to
   * `buildOrchestrator`. The privacy tier is checked against the RESOLVED
   * provider — a disallowed pick is refused, never silently re-routed, so
   * the user learns why their employee did not run.
   */
  resolveForEmployee(employee: EmployeeRow): Promise<ResolvedProvider>;
}

export function createProviderFactory(deps: ProviderFactoryDeps): ProviderFactory {
  const { providersService, secretsStore, companiesRepo, getMaxPrivacyTier } = deps;

  /**
   * Refuse `provider` when it sits above Settings → Privacy's max tier.
   * Runs after selection and BEFORE `buildStream`, so a refused provider
   * never has its API key read or an SDK client constructed.
   */
  function assertPrivacyTierAllows(
    provider: ProviderConfig,
    model: string,
    remedyScope: 'none' | 'employee',
  ): void {
    if (getMaxPrivacyTier === undefined) return;
    const maxTier = getMaxPrivacyTier();
    if (exceedsPrivacyTier(provider, maxTier)) {
      throw new PrivacyTierViolationError({
        provider,
        model,
        maxTier,
        remedyScope,
        purpose: 'run',
      });
    }
  }

  /**
   * Resolve a `ProviderConfig` row to a bound `ProviderStreamFn`.
   * Centralizes the kind→adapter dispatch + the apiKey lookup so both
   * `create` and `resolveForEmployee` go through one code path.
   *
   * The cloud branch performs the keychain read INSIDE the build step
   * rather than upstream, so the apiKey never escapes this function and
   * never lands in the wider `ResolvedProvider` shape that gets logged
   * by upstream telemetry.
   */
  async function buildStream(provider: ProviderConfig, model: string): Promise<ProviderStreamFn> {
    switch (provider.kind) {
      case 'anthropic': {
        const apiKey = await secretsStore.getApiKey(provider.id);
        if (apiKey === null || apiKey.length === 0) {
          throw new Error(
            `[provider-factory] Anthropic provider "${provider.id}" has no API key in the keychain`,
          );
        }
        const opts: { apiKey: string; model: string; baseURL?: string } = { apiKey, model };
        if (provider.baseUrl !== undefined) opts.baseURL = provider.baseUrl;
        return makeAnthropicStream(opts);
      }
      case 'ollama': {
        const opts: { model: string; baseURL?: string } = { model };
        if (provider.baseUrl !== undefined) opts.baseURL = provider.baseUrl;
        return makeOllamaStream(opts);
      }
      case 'openai': {
        const apiKey = await secretsStore.getApiKey(provider.id);
        if (apiKey === null || apiKey.length === 0) {
          throw new Error(
            `[provider-factory] OpenAI provider "${provider.id}" has no API key in the keychain`,
          );
        }
        const opts: { apiKey: string; model: string; baseURL?: string } = { apiKey, model };
        if (provider.baseUrl !== undefined) opts.baseURL = provider.baseUrl;
        return makeOpenAIStream(opts);
      }
      case 'google': {
        const apiKey = await secretsStore.getApiKey(provider.id);
        if (apiKey === null || apiKey.length === 0) {
          throw new Error(
            `[provider-factory] Google provider "${provider.id}" has no API key in the keychain`,
          );
        }
        const opts: { apiKey: string; model: string; baseURL?: string } = { apiKey, model };
        if (provider.baseUrl !== undefined) opts.baseURL = provider.baseUrl;
        return makeGoogleStream(opts);
      }
      case 'groq': {
        const apiKey = await secretsStore.getApiKey(provider.id);
        if (apiKey === null || apiKey.length === 0) {
          throw new Error(
            `[provider-factory] Groq provider "${provider.id}" has no API key in the keychain`,
          );
        }
        const opts: { apiKey: string; model: string; baseURL?: string } = { apiKey, model };
        if (provider.baseUrl !== undefined) opts.baseURL = provider.baseUrl;
        return makeGroqStream(opts);
      }
      case 'openrouter': {
        const apiKey = await secretsStore.getApiKey(provider.id);
        if (apiKey === null || apiKey.length === 0) {
          throw new Error(
            `[provider-factory] OpenRouter provider "${provider.id}" has no API key in the keychain`,
          );
        }
        return makeOpenRouterStream({ apiKey, model });
      }
      case 'together': {
        const apiKey = await secretsStore.getApiKey(provider.id);
        if (apiKey === null || apiKey.length === 0) {
          throw new Error(
            `[provider-factory] Together provider "${provider.id}" has no API key in the keychain`,
          );
        }
        const opts: { apiKey: string; model: string; baseURL?: string } = { apiKey, model };
        if (provider.baseUrl !== undefined) opts.baseURL = provider.baseUrl;
        return makeTogetherStream(opts);
      }
      case 'fireworks': {
        const apiKey = await secretsStore.getApiKey(provider.id);
        if (apiKey === null || apiKey.length === 0) {
          throw new Error(
            `[provider-factory] Fireworks provider "${provider.id}" has no API key in the keychain`,
          );
        }
        const opts: { apiKey: string; model: string; baseURL?: string } = { apiKey, model };
        if (provider.baseUrl !== undefined) opts.baseURL = provider.baseUrl;
        return makeFireworksStream(opts);
      }
      case 'custom-openai': {
        const apiKey = await secretsStore.getApiKey(provider.id);
        if (apiKey === null || apiKey.length === 0) {
          throw new Error(
            `[provider-factory] OpenAI-compatible provider "${provider.id}" has no API key in the keychain`,
          );
        }
        if (provider.baseUrl === undefined || provider.baseUrl.trim() === '') {
          throw new Error(
            `[provider-factory] OpenAI-compatible provider "${provider.id}" requires a baseUrl`,
          );
        }
        return makeOpenAICompatStream({ apiKey, model, baseURL: provider.baseUrl });
      }
      default:
        throw new Error(`[provider-factory] provider kind "${provider.kind}" is not supported`);
    }
  }

  /**
   * Walk the Phase 1 candidate list and return the first provider that
   * exists AND passes `isConfigured()`. Dedupes the list so the same
   * id never gets checked twice when the employee's preferred id
   * happens to coincide with one of the defaults.
   *
   * Resolution order:
   *   1. employee.providerPref (explicit employee override)
   *   2. company.settings.defaultProviderId (company default)
   *   3. DEFAULT_ANTHROPIC_ID (hardcoded Anthropic fallback)
   *   4. DEFAULT_OLLAMA_LOCAL_ID (hardcoded Ollama fallback)
   */
  async function pickConfigured(
    preferredId: string | null | undefined,
    companyId?: string,
  ): Promise<ProviderConfig> {
    const candidates: string[] = [];
    if (typeof preferredId === 'string' && preferredId.length > 0) {
      candidates.push(preferredId);
    }
    // Check company default provider if companyId is provided
    if (typeof companyId === 'string') {
      const company = companiesRepo.getById(companyId);
      if (company) {
        try {
          const settings = JSON.parse(company.settingsJson || '{}');
          if (
            typeof settings.defaultProviderId === 'string' &&
            settings.defaultProviderId.length > 0
          ) {
            candidates.push(settings.defaultProviderId);
          }
        } catch {
          // Invalid settings JSON, skip company default
        }
      }
    }
    // Explicit choices (employee, company default) are returned even when the
    // privacy tier forbids them, so the caller refuses them by name rather
    // than silently swapping them. The built-in defaults are nobody's choice:
    // one the tier forbids is skipped so an allowed one can serve.
    const explicitCount = candidates.length;
    candidates.push(DEFAULT_ANTHROPIC_ID, DEFAULT_OLLAMA_LOCAL_ID);
    const maxTier = getMaxPrivacyTier?.();
    let skippedForTier: ProviderConfig | null = null;

    const seen = new Set<string>();
    for (const [i, candidateId] of candidates.entries()) {
      if (seen.has(candidateId)) continue;
      seen.add(candidateId);

      const candidate = providersService.get(candidateId);
      if (!candidate) continue;
      if (!candidate.enabled) continue;
      if (!(await providersService.isConfigured(candidateId))) continue;
      if (i >= explicitCount && maxTier !== undefined && exceedsPrivacyTier(candidate, maxTier)) {
        skippedForTier ??= candidate;
        continue;
      }
      return candidate;
    }
    // Nothing allowed is configured: name the default the tier refused,
    // which says more than "no configured provider".
    if (skippedForTier) return skippedForTier;

    throw new Error(
      `[provider-factory] no configured provider found (checked: ${[...seen].join(', ')})`,
    );
  }

  /**
   * Pick a model id for the resolved provider. Prefers
   * `employee.modelPref` when set; otherwise falls back to the
   * per-kind Phase 1 default. The throw covers the (currently
   * unreachable) case where a future provider kind is added to the
   * registry without an entry in `DEFAULT_MODEL_BY_KIND` — better to
   * fail loudly here than to call `streamText` with an empty model id.
   */
  function defaultModelFor(provider: ProviderConfig, override?: string | null): string {
    if (typeof override === 'string' && override.length > 0) return override;
    if (typeof provider.defaultModel === 'string' && provider.defaultModel.length > 0) {
      return provider.defaultModel;
    }
    const fallback = DEFAULT_MODEL_BY_KIND[provider.kind];
    if (fallback === undefined) {
      throw new Error(`[provider-factory] no default model for provider kind "${provider.kind}"`);
    }
    return fallback;
  }

  async function create(args: { providerId: string; model?: string }): Promise<ResolvedProvider> {
    const provider = providersService.get(args.providerId);
    if (!provider) {
      throw new Error(`[provider-factory] provider not found: ${args.providerId}`);
    }
    if (!provider.enabled) {
      throw new Error(`[provider-factory] provider "${args.providerId}" is disabled`);
    }
    if (!(await providersService.isConfigured(args.providerId))) {
      throw new Error(
        `[provider-factory] provider "${args.providerId}" is not configured (no API key in keychain)`,
      );
    }
    const model = defaultModelFor(provider, args.model);
    assertPrivacyTierAllows(provider, model, 'none');
    const stream = await buildStream(provider, model);
    return { providerName: provider.id, providerKind: provider.kind, model, stream };
  }

  async function resolveForEmployee(employee: EmployeeRow): Promise<ResolvedProvider> {
    const provider = await pickConfigured(employee.providerPref, employee.companyId);
    const model = defaultModelFor(provider, employee.modelPref);
    assertPrivacyTierAllows(provider, model, 'employee');
    const stream = await buildStream(provider, model);
    return { providerName: provider.id, providerKind: provider.kind, model, stream };
  }

  return { create, resolveForEmployee };
}

// -----------------------------------------------------------------------------
// Runtime singleton — same lazy + reset pattern as providers service.
// -----------------------------------------------------------------------------

let _factory: ProviderFactory | null = null;

/**
 * Return the process-wide provider factory, constructing it lazily
 * against `getProvidersService()` + a fresh `SecretsStore` on first
 * call. The runtime instance is what `main/index.ts` (T36) wires into
 * `buildOrchestrator`'s `resolveProvider` slot.
 */
export function getProviderFactory(): ProviderFactory {
  if (_factory === null) {
    const settingsRepo = createSettingsRepo(getDb());
    _factory = createProviderFactory({
      providersService: getProvidersService(),
      secretsStore: new SecretsStore(),
      companiesRepo: createCompaniesRepo(getDb()),
      // The default construction must enforce Settings → Privacy: a caller
      // reaching for the singleton would otherwise bypass the tier entirely.
      getMaxPrivacyTier: () =>
        settingsRepo.get<PrivacyTier>('max_privacy_tier', 'proprietary-cloud'),
    });
  }
  return _factory;
}

/**
 * Reset the module-level singleton. **Test-only** — exported so
 * integration tests that construct multiple factories against
 * different DBs in the same process can clean up between cases.
 * Production code must never call this.
 */
export function __resetProviderFactoryForTests(): void {
  _factory = null;
}

// -----------------------------------------------------------------------------
// Test-mode provider — canned responses, no network, no keytar.
// -----------------------------------------------------------------------------

/**
 * Canned response the test-mode provider streams when
 * `NODE_ENV === 'test'`. Short, deterministic, recognizable in
 * Playwright assertions and console output. The content is written
 * to sound like a plausible CEO reply so visual QA against the
 * dashboard doesn't look obviously fake.
 */
const TEST_MODE_REPLY = 'Our top priority this week is shipping the Phase 1 demo.';
const TEST_MODE_PROVIDER_NAME = 'test-mode';
const TEST_MODE_MODEL = 'test-canned-v1';

/**
 * Sentinels the test-mode provider recognises inside user messages.
 * Neutral, namespaced strings that no real user would type — so
 * Playwright specs can steer the canned reply without touching the
 * default canned-reply path that smoke / ticket-flow / meeting-flow /
 * vault-backup depend on.
 *
 * - `__ECHO_SYSTEM__`        → the reply is the verbatim system prompt
 *                              (used by `rag-flow.spec.ts` to assert
 *                              on `<message id="...">` trust-fenced RAG
 *                              attributions emitted by formatEvidenceLine).
 * - `__ECHO_TEXT__:<payload>` → the reply is `<payload>` (everything
 *                              after the colon through end-of-line).
 *                              Used to seed the embeddings index with a
 *                              distinctive marker the next turn can
 *                              retrieve.
 */
const TEST_MODE_ECHO_SYSTEM = '__ECHO_SYSTEM__';
const TEST_MODE_ECHO_TEXT = '__ECHO_TEXT__:';

/**
 * Build a `ProviderStreamFn` that yields a canned reply in a handful
 * of delta chunks + a synthetic usage record, with zero latency and
 * zero network calls. Used by `main/index.ts` when
 * `process.env.NODE_ENV === 'test'` so the Playwright E2E smoke test
 * (T49) can boot a real Electron instance, render the dashboard, send
 * a chat message, and verify the streaming + persistence pipeline
 * end-to-end — all without a running LLM server.
 *
 * The chunking mimics real provider behaviour (multiple small deltas
 * rather than one big blob) so the dashboard's token-stream preview
 * and the event bus's `token.delta` fan-out get a realistic exercise.
 *
 * Sentinel steering (M29 T9): when the most recent user message
 * contains `__ECHO_SYSTEM__` the reply is the system prompt verbatim;
 * when it contains `__ECHO_TEXT__:<payload>` the reply is `<payload>`.
 * Both branches fall through to the default canned reply when the
 * sentinel is absent, so every existing spec is unaffected.
 */
function testModeStream(): ProviderStreamFn {
  return async function* testMode(args: Parameters<ProviderStreamFn>[0]) {
    const reply = pickTestModeReply(args.system, args.messages);
    const words = reply.split(' ');
    for (let i = 0; i < words.length; i++) {
      yield { delta: (i > 0 ? ' ' : '') + words[i] };
    }
    yield {
      done: true,
      usage: {
        promptTokens: 42,
        completionTokens: words.length,
      },
    };
  };
}

/**
 * Flatten a `StreamMessage.content` value to its plain-text representation
 * for sentinel-substring inspection. C2 (audit 2026-05-07) native-tool-use
 * messages may carry `StreamContentPart[]` (tool-call / tool-result blocks
 * interleaved with text); test-mode sentinels are only ever typed into chat
 * by a human and therefore only ever live on `text` parts. Tool blocks are
 * dropped so they cannot accidentally trigger a sentinel match.
 */
function extractTextContent(content: StreamMessage['content'] | undefined): string {
  if (content === undefined) return '';
  if (typeof content === 'string') return content;
  return content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

/**
 * Inspect the final user message and decide what the test-mode
 * provider should stream back. Pure function so the sentinel-dispatch
 * rules are unit-testable in isolation.
 */
function pickTestModeReply(system: string, messages: ReadonlyArray<StreamMessage>): string {
  // Walk from the end so a follow-up user message wins over an older one.
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== 'user') continue;
    const content = extractTextContent(m.content);
    if (content.includes(TEST_MODE_ECHO_SYSTEM)) {
      // Prefix the system prompt with a stable marker so the spec can
      // distinguish it from the default canned reply without coupling
      // to specific system-prompt wording.
      return `[SYSTEM_ECHO]\n${system}`;
    }
    const echoIdx = content.indexOf(TEST_MODE_ECHO_TEXT);
    if (echoIdx >= 0) {
      const after = content.slice(echoIdx + TEST_MODE_ECHO_TEXT.length);
      // Take the payload up to the next newline (if any) so a multi-
      // paragraph user message still yields a clean reply string.
      const nl = after.indexOf('\n');
      const payload = (nl >= 0 ? after.slice(0, nl) : after).trim();
      if (payload.length > 0) return payload;
    }
    // Only the most recent user message gates sentinel dispatch —
    // break after the first user message we hit.
    break;
  }
  return TEST_MODE_REPLY;
}

/**
 * Return `true` if the process is running in test mode. Centralised
 * so `main/index.ts` and the Playwright boot harness share one check.
 */
export function isTestMode(): boolean {
  return process.env.NODE_ENV === 'test';
}

/**
 * Build a `ResolveProvider` function that always returns the canned
 * test-mode stream regardless of the employee's preferences. Matches
 * the `ResolveProvider` signature from `orchestrator/index.ts` so
 * `main/index.ts` can swap it in with a single ternary.
 */
export function createTestModeResolveProvider(): (
  employee: EmployeeRow,
) => Promise<ResolvedProvider> {
  const stream = testModeStream();
  return async (_employee: EmployeeRow): Promise<ResolvedProvider> => ({
    providerName: TEST_MODE_PROVIDER_NAME,
    model: TEST_MODE_MODEL,
    stream,
  });
}

// -----------------------------------------------------------------------------
// Embedding adapters (Phase 5 — M29 T6)
// -----------------------------------------------------------------------------

/**
 * Narrow reader surface for embedding construction — symmetric with
 * `SecretsReader` above. The production `SecretsStore` structurally
 * satisfies it; tests can pass a plain object with a single method.
 */
export interface EmbedSecretsReader {
  getApiKey(providerId: string): Promise<string | null>;
}

/**
 * Narrow registry surface the embed-adapter builder needs. Kept
 * deliberately tiny so the RAG composition root can pass any object
 * with a `.get(id)` method — the production `ProvidersService` qualifies
 * via structural typing.
 */
export interface EmbedProvidersReader {
  get(id: string): ProviderConfig | null;
}

/**
 * Resolve a provider registry name (e.g. `"ollama-local"`,
 * `"openai"`) to a bound `EmbedAdapter` that the RAG service can drive.
 *
 * Returns `null` when the named provider is missing, disabled, of a
 * non-embedding-capable kind, or when a cloud provider's API key is
 * absent from the keychain. All of these cases mean "RAG cannot run in
 * this configuration" — the caller surfaces that as a no-op and lets
 * the app fall through to its pre-M29 behaviour (invariant #7: zero
 * regression when RAG is off).
 *
 * Only `ollama`, `openai`, and `custom-openai` kinds support embeddings
 * via the Phase 5 adapter surface. Cloud providers require a key; local
 * Ollama does not.
 *
 * Privacy tier: embedding sends the indexed / queried text to the provider,
 * so the same Settings → Privacy rule as `ProviderFactory` applies. When
 * `getMaxPrivacyTier` is passed, the returned adapter re-reads it on EVERY
 * `embed()` call and rejects with `PrivacyTierViolationError` before any
 * text reaches a provider above the tier. Checked per call rather than at
 * build time because the RAG composition root builds the adapter once at
 * boot and keeps it — a build-time check would neither honour a later tier
 * change nor surface a refusal (it would only switch RAG off silently).
 */
export async function buildEmbedAdapter(args: {
  provider: string;
  model: string;
  dimension: number;
  providersService: EmbedProvidersReader;
  secretsStore: EmbedSecretsReader;
  getMaxPrivacyTier?: () => PrivacyTier;
}): Promise<EmbedAdapter | null> {
  const config = args.providersService.get(args.provider);
  if (!config || !config.enabled) return null;

  const adapter = await buildRawEmbedAdapter(config, args);
  const getMaxPrivacyTier = args.getMaxPrivacyTier;
  if (adapter === null || getMaxPrivacyTier === undefined) return adapter;

  return {
    model: adapter.model,
    dimension: adapter.dimension,
    embed: async (texts: string[]): Promise<number[][]> => {
      const maxTier = getMaxPrivacyTier();
      if (exceedsPrivacyTier(config, maxTier)) {
        throw new PrivacyTierViolationError({
          provider: config,
          model: args.model,
          maxTier,
          remedyScope: 'retrieval',
          purpose: 'embedding',
        });
      }
      return adapter.embed(texts);
    },
  };
}

/** Kind→embed-adapter dispatch for `buildEmbedAdapter` (no tier guard). */
async function buildRawEmbedAdapter(
  config: ProviderConfig,
  args: { model: string; dimension: number; secretsStore: EmbedSecretsReader },
): Promise<EmbedAdapter | null> {
  if (config.kind === 'ollama') {
    const opts: { baseURL?: string; model: string; dimension: number } = {
      model: args.model,
      dimension: args.dimension,
    };
    if (config.baseUrl !== undefined) opts.baseURL = config.baseUrl;
    return makeOllamaEmbedAdapter(opts);
  }

  if (config.kind === 'openai' || config.kind === 'custom-openai') {
    const apiKey = await args.secretsStore.getApiKey(config.id);
    if (apiKey === null || apiKey.length === 0) return null;
    const opts: { apiKey: string; model: string; dimension: number; baseURL?: string } = {
      apiKey,
      model: args.model,
      dimension: args.dimension,
    };
    if (config.baseUrl !== undefined) opts.baseURL = config.baseUrl;
    return makeOpenAIEmbedAdapter(opts);
  }

  return null;
}

/**
 * Deterministic fake embed adapter for Playwright E2E — only used
 * when `NODE_ENV === 'test'` AND `TEAM_X_RAG_TEST === '1'`. Generates
 * stable, reproducible vectors from string hashes so the
 * `rag-flow.spec.ts` spec can assert on retrieval without any real
 * embedding provider, any network call, or any keychain lookup.
 *
 * Why this lives here (and not in the spec):
 *
 *   - Invariant #4 (provider-router is the only place that touches
 *     LLM APIs): the embed-adapter interface is the same surface the
 *     real adapters satisfy. The factory is the single seam where
 *     adapters get constructed, so the test adapter belongs alongside
 *     its production siblings.
 *   - Invariant #7 (zero phone-home): the fake adapter makes no
 *     network calls — its output is a pure function of its input. A
 *     Playwright spec can enable RAG end-to-end with zero risk of
 *     leaking out of the test harness.
 *
 * The hash-to-vector mapping uses a rolling 31-multiplier hash (same
 * family as Java's `String.hashCode`) to pick a coordinate per
 * character, then L2-normalises so cosine similarity behaves like a
 * true similarity metric in [-1, 1]. Two strings that share substrings
 * produce partially-overlapping vectors, which is all the spec needs
 * to assert "a message containing the marker is retrieved when the
 * query references the same marker".
 *
 * Phase 5 — M29 T9.
 */
export function makeFakeEmbedAdapter(dimension: number): EmbedAdapter {
  return {
    model: 'test-fake-embed',
    dimension,
    embed: async (texts: string[]): Promise<number[][]> => {
      return texts.map((t) => {
        const vec = new Array<number>(dimension).fill(0);
        let h = 0;
        for (let i = 0; i < t.length; i++) {
          h = (h * 31 + t.charCodeAt(i)) >>> 0;
          const idx = h % dimension;
          vec[idx] = (vec[idx] ?? 0) + 1;
        }
        // L2-normalize so cosine similarity is a true metric.
        let norm = 0;
        for (const v of vec) norm += v * v;
        norm = Math.sqrt(norm) || 1;
        return vec.map((v) => v / norm);
      });
    },
  };
}
