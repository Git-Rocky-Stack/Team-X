/**
 * Test-mode canned completion function — a deterministic
 * `LoopCompleteFn` for Playwright E2E runs and `AgenticLoopService`
 * unit tests.
 *
 * The production `LoopCompleteFn` wraps `streamAgent` from
 * `@team-x/provider-router`, which requires a configured LLM provider
 * and a working network stack. Under `NODE_ENV === 'test'` the
 * composition root swaps in this canned implementation so the
 * palette's `complex_request` round-trip — parse → resolve → slot-fill
 * → execute → loop → persist — stays deterministic without any LLM or
 * network dependency.
 *
 * Mirrors the shape of `test-classifier.ts` (M30 T8):
 *
 *   - Three-tier lookup per invocation.
 *   - Factory returns a pure closure; no global state.
 *   - Sentinel convention keeps tests able to steer the script on a
 *     per-prompt basis without code changes.
 *
 * Call-count tracking is keyed on the first user message so the loop's
 * repeated calls step through a scripted sequence. A surplus call (past
 * the script length) clamps to the last entry, which keeps the loop
 * from hanging if the fixture is shorter than the actual iteration
 * count — the surplus call always returns a `final_answer`.
 *
 * Three-tier lookup, in order:
 *   1. Sentinel override — `__ECHO_AGENT__:<json-array>` embedded in
 *      the first user message. The JSON array is a list of raw
 *      assistant response strings returned in order.
 *   2. Canned-table exact match — inputs whose lowercase-trimmed form
 *      is a key in `CANNED_TABLE`.
 *   3. Fallback — single-step `final_answer` stating no script is
 *      available. Keeps the contract never-throw.
 *
 * Phase 5 — M31 — T3.
 */

import type {
  LoopCompleteFn,
  LoopCompleteRequest,
  LoopMessage,
  LoopProviderCompletion,
} from '@team-x/intelligence';

/** Sentinel prefix for steering the script from a test or spec. */
export const ECHO_AGENT_SENTINEL = '__ECHO_AGENT__:';

/** Provider identity recorded on every canned completion. */
export const TEST_AGENT_PROVIDER = 'test-mode';
export const TEST_AGENT_MODEL = 'test-mode-agent';

// ---------------------------------------------------------------------------
// Canned fixtures — exact-match on lowercase-trimmed first user message.
// ---------------------------------------------------------------------------

const CANNED_TABLE: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'why is the frontend team behind?': Object.freeze([
    'Planning: first list the frontend team, then pull their open tickets.\n{"action":"query_employees","args":{"searchName":"frontend"}}',
    'Planning: now inspect open tickets.\n{"action":"query_tickets","args":{"status":"open"}}',
    '{"action":"final_answer","answer":"The frontend team has 3 open tickets and 1 blocked migration. Reassigning the blocked item would unblock two downstream tickets."}',
  ]),
  'who is on the team?': Object.freeze([
    '{"action":"query_employees","args":{}}',
    '{"action":"final_answer","answer":"The team consists of the CEO and a Senior Fullstack Engineer."}',
  ]),
  // Phase 5 — M31 T8. E2E agentic-loop spec fixture. Classifier maps
  // this phrase to `complex_request`, the palette routes it to the
  // loop, and this script produces plan → tool_call → answer so the
  // spec can assert on ≥3 steps and an answer card.
  'what is my team doing right now': Object.freeze([
    'Planning: list the current team to surface who is active before reporting on workload.\n{"action":"query_employees","args":{}}',
    '{"action":"final_answer","answer":"Team currently has 2 employees active: Iris Kovač (CEO) and Mateo Reyes (Senior Fullstack Engineer). No open tickets in the queue right now."}',
  ]),
});

/** Terminal step returned when no canned or sentinel script matches. */
const FALLBACK_SCRIPT: readonly string[] = Object.freeze([
  '{"action":"final_answer","answer":"I do not have a canned response for this prompt in test mode."}',
]);

export interface TestAgenticCompleteOptions {
  /**
   * Additional or override fixtures keyed on lowercase-trimmed first
   * user message. Merged over `CANNED_TABLE`, so specs can inject
   * scripts without a code change.
   */
  readonly fixtures?: Readonly<Record<string, readonly string[]>>;
}

function extractFirstUserMessage(messages: readonly LoopMessage[]): string {
  for (const m of messages) {
    if (m.role === 'user') return m.content;
  }
  return '';
}

function safeParseSentinel(text: string): readonly string[] | null {
  const idx = text.indexOf(ECHO_AGENT_SENTINEL);
  if (idx < 0) return null;
  const payload = text.slice(idx + ECHO_AGENT_SENTINEL.length).trim();
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!Array.isArray(parsed)) return null;
    const strings: string[] = [];
    for (const v of parsed) {
      if (typeof v !== 'string') return null;
      strings.push(v);
    }
    return strings;
  } catch {
    return null;
  }
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 1;
  const parts = trimmed.split(/\s+/);
  return Math.max(1, parts.length);
}

/**
 * Build a deterministic canned complete function for test mode.
 *
 * Shape-compatible with `LoopCompleteFn`, so the composition root swaps
 * it in wherever the production stream-agent wrapper would have been
 * used. Does not touch network, filesystem, DB, or any provider.
 */
export function createTestAgenticCompleteFn(
  options: TestAgenticCompleteOptions = {},
): LoopCompleteFn {
  const merged: Record<string, readonly string[]> = {
    ...CANNED_TABLE,
    ...(options.fixtures ?? {}),
  };
  // Call count keyed on the resolved script key — not the raw user text
  // — so sentinel-driven runs and canned-table runs maintain independent
  // counters within the same factory instance.
  const callCount = new Map<string, number>();

  return async function complete(req: LoopCompleteRequest): Promise<LoopProviderCompletion> {
    if (req.signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const first = extractFirstUserMessage(req.messages);
    const sentinel = safeParseSentinel(first);
    const script = sentinel ?? merged[first.trim().toLowerCase()] ?? FALLBACK_SCRIPT;
    const key = sentinel ? `__sentinel__:${first}` : first.trim().toLowerCase();
    const idx = callCount.get(key) ?? 0;
    const text = script[Math.min(idx, script.length - 1)] ?? FALLBACK_SCRIPT[0] ?? '';
    callCount.set(key, idx + 1);

    const promptText = req.system + req.messages.map((m) => m.content).join('\n');
    return {
      text,
      usage: {
        promptTokens: countWords(promptText),
        completionTokens: countWords(text),
      },
      provider: TEST_AGENT_PROVIDER,
      model: TEST_AGENT_MODEL,
      costUsd: 0,
    };
  };
}
