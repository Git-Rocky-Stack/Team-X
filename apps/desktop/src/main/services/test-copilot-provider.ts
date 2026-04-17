/**
 * Test-mode canned completion function for the copilot analyzer — a
 * deterministic `CopilotAnalyzerCompleteFn` for Playwright E2E runs
 * and `CopilotAnalyzerService` unit tests.
 *
 * Fourth member of the agentic-surface test-seam quartet, carrying the
 * same three-tier shape the rest of Phase 5 ships:
 *
 *   - `test-classifier.ts`       (M30 T8) — canned NLU classifier.
 *   - `test-agentic-provider.ts` (M31 T3) — canned ReAct provider.
 *   - `test-agentic-tools.ts`    (M32 T3) — canned write-side tools.
 *   - `test-copilot-provider.ts` (M33 T8) — canned copilot complete.
 *
 * Every member shares a three-tier lookup:
 *
 *   1. Sentinel — `__ECHO_COPILOT__:<json>` embedded in the user prompt.
 *      The JSON payload is round-tripped through `JSON.parse` +
 *      `JSON.stringify` (normalized encoding + whitespace) and returned
 *      as the completion text verbatim. Fastest path for deterministic
 *      specs that inline their expected drafts into the prompt.
 *   2. Canned table — the user prompt is normalized (lowercase + trim
 *      + whitespace-collapse) and searched for a fixture key as a
 *      substring. First registered key wins. `CANNED_COPILOT_TABLE`
 *      is a frozen constant; per-spec fixtures register into a
 *      runtime-mutable registry via `addCopilotFixture`.
 *   3. Fallback — `FIXTURE_COPILOT_EMPTY` returns `text: '[]'`. The
 *      analyzer's `parseDrafts` tolerates an empty array without
 *      producing any insight rows, so drifted prompts never hang or
 *      corrupt E2E state.
 *
 * Actor routing is already resolved upstream: the composition root
 * only wires this seam into `CopilotAnalyzerService.resolveComplete`,
 * so non-copilot actors (system-agent) continue to hit
 * `test-agentic-provider.ts`. There is no cross-seam leakage.
 *
 * Phase 5 — M33 — T8.
 */

import type {
  CopilotAnalyzerCompleteFn,
  CopilotAnalyzerCompleteRequest,
  CopilotAnalyzerCompleteResult,
} from './copilot-analyzer-service.js';

/** Sentinel prefix the user prompt may carry to steer the script. */
export const TEST_COPILOT_SENTINEL = '__ECHO_COPILOT__:';

/** Provider + model identity recorded on every canned completion. */
export const TEST_COPILOT_PROVIDER = 'test-mode';
export const TEST_COPILOT_MODEL = 'test-copilot';

/**
 * Never-throw empty-drafts fallback. Mirrors the T4 inline placeholder
 * field-for-field so swapping the placeholder for
 * `createTestCopilotComplete()` keeps pre-T9 E2E behavior byte-identical
 * until specs register fixtures.
 */
export const FIXTURE_COPILOT_EMPTY: Readonly<CopilotAnalyzerCompleteResult> = Object.freeze({
  text: '[]',
  promptTokens: 0,
  completionTokens: 0,
  costUsd: 0,
  provider: TEST_COPILOT_PROVIDER,
  model: TEST_COPILOT_MODEL,
});

/**
 * Frozen canned-table fixtures. Immutable so the production bundle
 * never mutates module state at load time — the runtime-mutable
 * `runtimeFixtures` Map is the write path for per-spec registrations
 * via `addCopilotFixture`.
 *
 * Baked-in entries land here in lockstep with the specs that consume
 * them. Following the same pattern `test-agentic-provider.ts` uses
 * for M31/M32 E2E fixtures — keeping the fixture at source (rather
 * than registering via `app.evaluate`) keeps the spec body small and
 * sidesteps main-process bundle-resolution issues with electron-vite's
 * `inlineDynamicImports` collapsing the entire main tree into a single
 * file.
 */
export const CANNED_COPILOT_TABLE: Readonly<Record<string, string>> = Object.freeze({
  // Phase 5 — M33 T9. E2E copilot-service spec fixture. The analyzer
  // prompt always contains `Company: <name>` verbatim via
  // `buildAnalysisPrompt`, so the normalized substring `strategia-x`
  // (the Phase-1 seed company) is a stable tier-2 hit. The response
  // parses via `parseDrafts` into a single `InsightDraft` that the
  // analyzer persists through `CopilotInsightsRepo.insert`. Exactly
  // one draft keeps the spec's assertion surface small.
  // `actionIntent` + `actionSuggestion` are `z.string().optional()` —
  // JSON `null` fails validation (null is not a string), so we omit
  // them entirely and let zod treat them as `undefined`. The analyzer
  // repo's `CopilotInsightInput` builder already handles the missing
  // fields by projecting them as nullable columns.
  'strategia-x': JSON.stringify([
    {
      category: 'operational',
      severity: 'warning',
      title: 'E2E canned copilot insight',
      body: 'Deterministic insight seeded by the M33 T9 E2E spec to exercise the copilot analyzer → insights → dismiss round-trip end-to-end without a live LLM.',
      expiresInHours: 24,
      actionSuggestion: 'Dismiss this insight to verify the audit trail.',
    },
  ]),
});

/**
 * Runtime-mutable fixture registry. `addCopilotFixture` writes here;
 * `createTestCopilotComplete` reads this alongside the frozen table
 * and the closure-local options on every invocation so late
 * registrations are visible to already-constructed closures.
 */
const runtimeFixtures = new Map<string, string>();

/**
 * Register a canned copilot completion for the duration of a test.
 *
 * The `key` is normalized (lowercase + trim + whitespace-collapse)
 * before storage, so callers may pass human-readable fragments.
 * Substring matching is applied at lookup time — any normalized user
 * prompt that *contains* the normalized key will hit this fixture.
 *
 * The `response` is returned as the completion `text` field. The
 * analyzer parses it with `parseDrafts`, so it must be a JSON array
 * matching `InsightDraftsSchema` (or `[]` for an explicit no-op).
 */
export function addCopilotFixture(key: string, response: string): void {
  runtimeFixtures.set(normalizePrompt(key), response);
}

/** Erase every runtime fixture. Call from `afterEach` to isolate specs. */
export function clearCopilotFixtures(): void {
  runtimeFixtures.clear();
}

export interface TestCopilotCompleteOptions {
  /**
   * Additional or override fixtures keyed on user prompts. Merged
   * over `CANNED_COPILOT_TABLE` + `runtimeFixtures`, so callers can
   * inject closure-local scripts without touching module state.
   */
  readonly fixtures?: Readonly<Record<string, string>>;
}

/**
 * Normalize a user prompt for canned-table substring matching.
 * Matches `test-classifier.ts` (M30 T8) shape so fixture keys stay
 * portable across both seams.
 */
function normalizePrompt(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function safeParseSentinel(text: string): string | null {
  const idx = text.indexOf(TEST_COPILOT_SENTINEL);
  if (idx < 0) return null;
  const payload = text.slice(idx + TEST_COPILOT_SENTINEL.length).trim();
  if (!payload) return null;
  try {
    const parsed: unknown = JSON.parse(payload);
    return JSON.stringify(parsed);
  } catch {
    return null;
  }
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 1;
  return Math.max(1, trimmed.split(/\s+/).length);
}

/**
 * Build a deterministic canned complete function for the copilot
 * analyzer. Shape-compatible with `CopilotAnalyzerCompleteFn` so the
 * composition root swaps it in under `NODE_ENV === 'test'` with zero
 * wire-contract changes.
 */
export function createTestCopilotComplete(
  options: TestCopilotCompleteOptions = {},
): CopilotAnalyzerCompleteFn {
  // Pre-normalize closure-local fixture keys so substring match stays
  // O(n) over keys × O(k) over user prompt without re-normalizing on
  // every call.
  const inlineFixtures: Record<string, string> = {};
  for (const [k, v] of Object.entries(options.fixtures ?? {})) {
    inlineFixtures[normalizePrompt(k)] = v;
  }

  return async function complete(
    req: CopilotAnalyzerCompleteRequest,
  ): Promise<CopilotAnalyzerCompleteResult> {
    if (req.signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const { user, system } = req;
    // Defensive — zero-length user prompt means the analyzer pipeline
    // is malformed upstream. Mirror the production path (which throws
    // via the provider router) so specs can assert the error shape
    // instead of silently receiving empty drafts.
    if (typeof user !== 'string' || user.trim().length === 0) {
      throw new Error('[test-copilot-provider] empty user prompt');
    }

    // Tier 1 — sentinel.
    const sentinel = safeParseSentinel(user);
    if (sentinel !== null) {
      return {
        text: sentinel,
        promptTokens: countWords(system + user),
        completionTokens: countWords(sentinel),
        costUsd: 0,
        provider: TEST_COPILOT_PROVIDER,
        model: TEST_COPILOT_MODEL,
      };
    }

    // Tier 2 — canned table + runtime fixtures + closure fixtures.
    // Iterate in priority order: closure > runtime > frozen constant.
    // First normalized-substring hit wins.
    const normalized = normalizePrompt(user);
    const matchSources: ReadonlyArray<ReadonlyArray<readonly [string, string]>> = [
      Object.entries(inlineFixtures),
      Array.from(runtimeFixtures.entries()),
      Object.entries(CANNED_COPILOT_TABLE).map(
        ([k, v]) => [normalizePrompt(k), v] as readonly [string, string],
      ),
    ];
    for (const source of matchSources) {
      for (const [key, text] of source) {
        if (key.length > 0 && normalized.includes(key)) {
          return {
            text,
            promptTokens: countWords(system + user),
            completionTokens: countWords(text),
            costUsd: 0,
            provider: TEST_COPILOT_PROVIDER,
            model: TEST_COPILOT_MODEL,
          };
        }
      }
    }

    // Tier 3 — never-throw fallback.
    return FIXTURE_COPILOT_EMPTY;
  };
}
