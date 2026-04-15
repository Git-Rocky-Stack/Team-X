/**
 * Test-mode canned classifier — deterministic `IntentClassifier` for
 * Playwright E2E runs.
 *
 * The real `createIntentClassifier` round-trips through a provider-
 * router completion fn, which requires a configured LLM provider and a
 * working network stack. Under `NODE_ENV === 'test'` the composition
 * root swaps in this canned implementation so the palette's full round
 * trip — parse -> resolve -> slot-fill -> execute -> history — stays
 * deterministic without any LLM or network dependency.
 *
 * Three-tier lookup, in order:
 *   1. Sentinel override — `__ECHO_INTENT__:<json>` in the user text.
 *      The JSON after the colon is returned verbatim (merged with the
 *      raw text). Mirrors the `__ECHO_TEXT__` / `__ECHO_SYSTEM__`
 *      pattern already used by the test-mode provider for targeted
 *      steering from a spec.
 *   2. Exact-match canned table — inputs whose lowercase-trimmed form
 *      is a key in `CANNED_TABLE`. Used for the static cases the
 *      palette spec depends on ("hire a senior frontend engineer").
 *   3. Prefix-match fire pattern — any input starting with `fire <x>`
 *      is synthesised into a `fire_employee` intent with
 *      `employeeQuery=<x>`. This keeps the spec from needing to know
 *      the hired employee's exact name ahead of time.
 *   4. Fallback — `complex_request` with `confidence: 0`. Mirrors
 *      the classifier's real fallback for unparseable input so
 *      palette error states are exercisable in tests too.
 *
 * Production + dev use `createIntentClassifier`. This module is ONLY
 * loaded when `isTestMode()` returns true — the composition root
 * decides which factory to call, no conditional logic leaks into the
 * CommandService interface.
 *
 * Phase 5 — M30 T8.
 */

import type { IntentClassifier, IntentName, IntentResult, NluContext } from '@team-x/intelligence';

// ---------------------------------------------------------------------------
// Sentinel
// ---------------------------------------------------------------------------

/**
 * Spec-facing override sentinel. A user message containing
 * `__ECHO_INTENT__:{"intent":"hire_employee",...}` makes the classifier
 * return the supplied shape verbatim, merged with `rawText`. Lets
 * individual specs inject one-off intents without extending the
 * canned table.
 *
 * Parse shape (matches the real classifier's JSON contract):
 *   { intent: IntentName;
 *     entities?: Record<string,string>;
 *     confidence?: number;
 *     missingSlots?: string[]; }
 *
 * Malformed JSON falls through to the fallback. No throw.
 */
const ECHO_INTENT_SENTINEL = '__ECHO_INTENT__:';

// ---------------------------------------------------------------------------
// Canned table
// ---------------------------------------------------------------------------

interface CannedEntry {
  intent: IntentName;
  entities: Record<string, string>;
  confidence: number;
  missingSlots?: string[];
}

/**
 * Static lookup for exact input-text matches (case-insensitive,
 * whitespace-trimmed). Keys should mirror the exact strings the
 * palette spec types into the input — any new cases the spec needs
 * go here rather than in the spec itself so the canned universe
 * stays co-located and reviewable.
 */
const CANNED_TABLE: Readonly<Record<string, CannedEntry>> = {
  // Plan-text input ("Senior Frontend Engineer") retained as a key for
  // symmetry with the plan's example, but the resolver-facing role
  // name is rewritten to a role that actually exists in the bundled
  // strategia-official pack — otherwise the entity resolver would
  // return `not_found` and the spec would never reach the ready state.
  'hire a senior frontend engineer': {
    intent: 'hire_employee',
    entities: { roleQuery: 'Growth Marketer' },
    confidence: 0.92,
  },
  'hire a growth marketer': {
    intent: 'hire_employee',
    entities: { roleQuery: 'Growth Marketer' },
    confidence: 0.92,
  },
  'hire a senior fullstack engineer': {
    intent: 'hire_employee',
    entities: { roleQuery: 'Senior Fullstack Engineer' },
    confidence: 0.92,
  },
  'hire a ceo': {
    intent: 'hire_employee',
    entities: { roleQuery: 'CEO' },
    confidence: 0.92,
  },
  // Phase 5 — M31 T8. Routes the palette's `complex_request` branch
  // for the agentic-loop E2E spec. The phrase must also exist as a key
  // in `test-agentic-provider.ts`'s `CANNED_TABLE` so the provider
  // scripts a deterministic plan → tool_call → answer sequence.
  'what is my team doing right now': {
    intent: 'complex_request',
    entities: {},
    confidence: 0.88,
  },
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build a deterministic canned classifier for test mode.
 *
 * Shape-compatible with `IntentClassifier`, so the composition root
 * swaps it in wherever `createIntentClassifier(...)` would have been
 * used. Does not touch the network, filesystem, DB, or any provider.
 */
export function createTestClassifier(): IntentClassifier {
  return {
    async classify(text: string, _context: NluContext): Promise<IntentResult> {
      const rawText = text;
      const trimmed = text.trim();

      // 1. Sentinel override — specs can inject any shape.
      const sentinelIdx = trimmed.indexOf(ECHO_INTENT_SENTINEL);
      if (sentinelIdx === 0) {
        const payload = trimmed.slice(ECHO_INTENT_SENTINEL.length);
        const parsed = safeParseSentinel(payload);
        if (parsed !== null) {
          return {
            intent: parsed.intent,
            entities: parsed.entities ?? {},
            confidence: parsed.confidence ?? 0.95,
            missingSlots: parsed.missingSlots ?? [],
            rawText,
          };
        }
      }

      // 2. Exact canned-table match.
      const key = trimmed.toLowerCase();
      const canned = CANNED_TABLE[key];
      if (canned) {
        return {
          intent: canned.intent,
          entities: { ...canned.entities },
          confidence: canned.confidence,
          missingSlots: canned.missingSlots ?? [],
          rawText,
        };
      }

      // 3. `fire <name>` prefix pattern.
      // Match any input beginning with "fire " (case-insensitive) and
      // pass the remainder as `employeeQuery` for the resolver to
      // fuzzy-match against the live employees list. The spec hires
      // an employee first, captures the name, then types `fire <name>`
      // — so the classifier cannot know the name ahead of time.
      const fireMatch = /^fire\s+(.+)$/i.exec(trimmed);
      if (fireMatch) {
        const employeeQuery = fireMatch[1]?.trim() ?? '';
        if (employeeQuery.length > 0) {
          return {
            intent: 'fire_employee',
            entities: { employeeQuery },
            confidence: 0.9,
            missingSlots: [],
            rawText,
          };
        }
      }

      // 4. Fallback — unknown input is complex_request.
      return {
        intent: 'complex_request',
        entities: {},
        confidence: 0,
        missingSlots: [],
        rawText,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface SentinelShape {
  intent: IntentName;
  entities?: Record<string, string>;
  confidence?: number;
  missingSlots?: string[];
}

/**
 * Parse the JSON payload behind `__ECHO_INTENT__:` defensively.
 * Returns null on any structural defect so the classifier falls
 * through to the canned table / fallback branches.
 */
function safeParseSentinel(raw: string): SentinelShape | null {
  try {
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== 'object') return null;
    const record = obj as Record<string, unknown>;
    if (typeof record.intent !== 'string') return null;
    const entities =
      record.entities !== undefined && record.entities !== null
        ? (record.entities as Record<string, string>)
        : undefined;
    const confidence = typeof record.confidence === 'number' ? record.confidence : undefined;
    const missingSlots = Array.isArray(record.missingSlots)
      ? (record.missingSlots as string[])
      : undefined;
    return {
      intent: record.intent as IntentName,
      entities,
      confidence,
      missingSlots,
    };
  } catch {
    return null;
  }
}
