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
 * After C2 (audit 2026-05-07), the loop is native tool-use: the model
 * emits structured `toolCalls` rather than JSON-in-text. This file
 * accordingly returns `LoopProviderCompletion` values whose `text` is
 * the model's plan / answer prose and whose `toolCalls` array carries
 * structured tool invocations.
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
 * count — the surplus call always returns a final-answer turn.
 *
 * Three-tier lookup, in order:
 *   1. Sentinel override — `__ECHO_AGENT__:<json-array>` embedded in
 *      the first user message. The JSON array is a list of scripted
 *      `ScriptEntry` records returned in order. Strings are still
 *      accepted for backwards-compat with E2E specs and translated via
 *      `parseLegacyScriptString` to the structured shape.
 *   2. Canned-table exact match — inputs whose lowercase-trimmed form
 *      is a key in `CANNED_TABLE`.
 *   3. Fallback — single-step final-answer stating no script is
 *      available. Keeps the contract never-throw.
 *
 * Phase 5 — M31 — T3. Native tool-use migration: C2 (audit 2026-05-07).
 */

import type {
  LoopCompleteFn,
  LoopCompleteRequest,
  LoopMessage,
  LoopProviderCompletion,
  LoopProviderToolCall,
} from '@team-x/intelligence';

/** Sentinel prefix for steering the script from a test or spec. */
export const ECHO_AGENT_SENTINEL = '__ECHO_AGENT__:';

/** Provider identity recorded on every canned completion. */
export const TEST_AGENT_PROVIDER = 'test-mode';
export const TEST_AGENT_MODEL = 'test-mode-agent';

// ---------------------------------------------------------------------------
// Script entry shape — what scripts produce per iteration.
//
// Either a structured `{ text, toolCalls }` (preferred) or a legacy
// `'{"action":"...","args":{...}}'` string that the parser translates
// at lookup time. Strings keep older specs and the canned table compact.
// ---------------------------------------------------------------------------

export interface ScriptToolCall {
  toolCallId?: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface ScriptCompletion {
  text: string;
  toolCalls?: readonly ScriptToolCall[];
}

export type ScriptEntry = string | ScriptCompletion;

// ---------------------------------------------------------------------------
// Canned fixtures — exact-match on lowercase-trimmed first user message.
// ---------------------------------------------------------------------------

const CANNED_TABLE: Readonly<Record<string, readonly ScriptEntry[]>> = Object.freeze({
  'why is the frontend team behind?': Object.freeze([
    {
      text: 'Planning: first list the frontend team, then pull their open tickets.',
      toolCalls: [{ toolName: 'query_employees', args: { searchName: 'frontend' } }],
    },
    {
      text: 'Planning: now inspect open tickets.',
      toolCalls: [{ toolName: 'query_tickets', args: { status: 'open' } }],
    },
    {
      text: 'The frontend team has 3 open tickets and 1 blocked migration. Reassigning the blocked item would unblock two downstream tickets.',
    },
  ]),
  'who is on the team?': Object.freeze([
    { text: '', toolCalls: [{ toolName: 'query_employees', args: {} }] },
    { text: 'The team consists of the CEO and a Senior Fullstack Engineer.' },
  ]),
  // Phase 5 — M31 T8. E2E agentic-loop spec fixture. Classifier maps
  // this phrase to `complex_request`, the palette routes it to the
  // loop, and this script produces plan → tool_call → answer so the
  // spec can assert on ≥3 steps and an answer card.
  'what is my team doing right now': Object.freeze([
    {
      text: 'Planning: list the current team to surface who is active before reporting on workload.',
      toolCalls: [{ toolName: 'query_employees', args: {} }],
    },
    {
      text: 'Team currently has 2 employees active: Iris Kovač (CEO) and Mateo Reyes (Senior Fullstack Engineer). No open tickets in the queue right now.',
    },
  ]),
  // Phase 5 — M32 T8. E2E task-planner spec fixture.
  'decompose the frontend redesign into tickets': Object.freeze([
    {
      text: 'Planning: decompose the redesign into actionable tickets, then delegate each one.',
      toolCalls: [{ toolName: 'decompose_project', args: { brief: 'Frontend redesign' } }],
    },
    {
      text: 'Planning: now delegate the proposed subtask to its scored assignee.',
      toolCalls: [
        {
          toolName: 'delegate_subtask',
          args: { planId: 'plan-test-1', subtaskTitle: 'Test subtask', assigneeId: 'emp-test-swe' },
        },
      ],
    },
    {
      text: 'Decomposed the frontend redesign into 1 subtask and delegated ticket tkt-test-1 to Mateo Reyes.',
    },
  ]),
});

/** Terminal step returned when no canned or sentinel script matches. */
const FALLBACK_SCRIPT: readonly ScriptEntry[] = Object.freeze([
  { text: 'I do not have a canned response for this prompt in test mode.' },
]);

export interface TestAgenticCompleteOptions {
  /**
   * Additional or override fixtures keyed on lowercase-trimmed first
   * user message. Merged over `CANNED_TABLE`, so specs can inject
   * scripts without a code change.
   */
  readonly fixtures?: Readonly<Record<string, readonly ScriptEntry[]>>;
}

function extractFirstUserMessage(messages: readonly LoopMessage[]): string {
  for (const m of messages) {
    if (m.role === 'user' && typeof m.content === 'string') return m.content;
  }
  return '';
}

function safeParseSentinel(text: string): readonly ScriptEntry[] | null {
  const idx = text.indexOf(ECHO_AGENT_SENTINEL);
  if (idx < 0) return null;
  const payload = text.slice(idx + ECHO_AGENT_SENTINEL.length).trim();
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!Array.isArray(parsed)) return null;
    const entries: ScriptEntry[] = [];
    for (const v of parsed) {
      if (typeof v === 'string') entries.push(v);
      else if (
        typeof v === 'object' &&
        v !== null &&
        typeof (v as { text?: unknown }).text === 'string'
      ) {
        entries.push(v as ScriptCompletion);
      } else {
        return null;
      }
    }
    return entries;
  } catch {
    return null;
  }
}

/**
 * Translate a legacy `'{"action":"...","answer":"..."}'` script string
 * (pre-C2) into a structured `ScriptCompletion`. Keeps E2E specs and
 * older fixtures working without forcing every spec author to rewrite.
 */
function parseLegacyScriptString(entry: string): ScriptCompletion {
  const trimmed = entry.trim();
  const lastClose = trimmed.lastIndexOf('}');
  let jsonStart = -1;
  if (lastClose >= 0) {
    let depth = 0;
    for (let i = lastClose; i >= 0; i--) {
      const ch = trimmed[i];
      if (ch === '}') depth++;
      else if (ch === '{') {
        depth--;
        if (depth === 0) {
          jsonStart = i;
          break;
        }
      }
    }
  }
  if (jsonStart < 0) {
    return { text: trimmed };
  }
  const preface = trimmed.slice(0, jsonStart).trim();
  const candidate = trimmed.slice(jsonStart);
  let parsed: { action?: string; answer?: string; args?: Record<string, unknown> };
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return { text: trimmed };
  }
  if (parsed.action === 'final_answer') {
    return { text: parsed.answer ?? '' };
  }
  if (typeof parsed.action === 'string') {
    return {
      text: preface,
      toolCalls: [
        {
          toolName: parsed.action,
          args: (parsed.args ?? {}) as Record<string, unknown>,
        },
      ],
    };
  }
  return { text: trimmed };
}

function resolveScriptEntry(entry: ScriptEntry): ScriptCompletion {
  return typeof entry === 'string' ? parseLegacyScriptString(entry) : entry;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 1;
  const parts = trimmed.split(/\s+/);
  return Math.max(1, parts.length);
}

function describeMessage(msg: LoopMessage): string {
  if (typeof msg.content === 'string') return msg.content;
  // Structured assistant or tool messages — flatten to a coarse summary
  // for the prompt-token estimator.
  return msg.content
    .map((p) => {
      if (p.type === 'text') return p.text;
      if (p.type === 'tool-call') return `${p.toolName}(${JSON.stringify(p.args)})`;
      return p.result;
    })
    .join(' ');
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
  const merged: Record<string, readonly ScriptEntry[]> = {
    ...CANNED_TABLE,
    ...(options.fixtures ?? {}),
  };
  // Call count keyed on the resolved script key — not the raw user text
  // — so sentinel-driven runs and canned-table runs maintain independent
  // counters within the same factory instance.
  const callCount = new Map<string, number>();
  let toolCallSeq = 0;

  return async function complete(req: LoopCompleteRequest): Promise<LoopProviderCompletion> {
    if (req.signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const first = extractFirstUserMessage(req.messages);
    const sentinel = safeParseSentinel(first);
    const script = sentinel ?? merged[first.trim().toLowerCase()] ?? FALLBACK_SCRIPT;
    const key = sentinel ? `__sentinel__:${first}` : first.trim().toLowerCase();
    const idx = callCount.get(key) ?? 0;
    const rawEntry = script[Math.min(idx, script.length - 1)] ?? FALLBACK_SCRIPT[0];
    const entry: ScriptCompletion = rawEntry
      ? resolveScriptEntry(rawEntry)
      : { text: '' };
    callCount.set(key, idx + 1);

    const toolCalls: LoopProviderToolCall[] = (entry.toolCalls ?? []).map((tc) => {
      toolCallSeq += 1;
      return {
        toolCallId: tc.toolCallId ?? `tc_test_${toolCallSeq}`,
        toolName: tc.toolName,
        args: tc.args,
      };
    });

    const promptText = req.system + req.messages.map(describeMessage).join('\n');
    return {
      text: entry.text,
      toolCalls,
      usage: {
        promptTokens: countWords(promptText),
        completionTokens: countWords(entry.text || JSON.stringify(toolCalls)),
      },
      provider: TEST_AGENT_PROVIDER,
      model: TEST_AGENT_MODEL,
      costUsd: 0,
    };
  };
}
