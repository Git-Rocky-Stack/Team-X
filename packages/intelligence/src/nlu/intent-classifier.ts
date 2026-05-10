/**
 * Intent classifier — LLM-backed, structured-output, 15-intent surface.
 *
 * Takes a raw user command string (typed into the Cmd+K palette) and
 * returns a normalized `IntentResult` that downstream T2 (entity resolver)
 * and T3 (slot filler) can consume. The classifier never touches the DB
 * and never routes directly to an IPC handler — it is a pure text → JSON
 * transform with a single dependency: a `ClassifyCompleteFn` that wraps
 * the user's configured LLM provider.
 *
 * Architectural invariants honored:
 *   - Provider router is the only LLM surface. The factory accepts a
 *     `ClassifyCompleteFn` (injected) so unit tests can pass a canned
 *     completion and the main-process composition root can wire in a
 *     real adapter via `provider-router`.
 *   - No side effects at module load. All state lives inside the
 *     closure created by `createIntentClassifier()`.
 *   - Strict JSON: parse with Zod; on parse failure retry ONCE with a
 *     nudge prompt; on second failure fall back to `complex_request`
 *     with `confidence: 0`.
 *   - Confidence gate: if the classifier returns < 0.5, re-label the
 *     result as `complex_request` so ambiguous inputs fall through
 *     to the agentic loop (M31).
 *
 * Phase 5 — M30 — T1.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Intent names (locked — 15)
// ---------------------------------------------------------------------------

export const INTENT_NAMES = [
  'hire_employee',
  'fire_employee',
  'assign_ticket',
  'create_ticket',
  'close_ticket',
  'promote_employee',
  'create_project',
  'create_goal',
  'call_meeting',
  'end_meeting',
  'check_status',
  'show_view',
  'search_vault',
  'complex_request',
  'reopen_ticket',
] as const;

export type IntentName = (typeof INTENT_NAMES)[number];

const INTENT_NAME_SET: ReadonlySet<string> = new Set(INTENT_NAMES);

/** Minimum classifier-reported confidence for a non-complex, non-destructive intent. */
export const MIN_CONFIDENCE = 0.5;

/**
 * Elevated minimum confidence for destructive (high-blast-radius / state-mutating) intents.
 *
 * Why 0.8 (not the standard 0.5): the classifier is a small-/mid-LLM judgment and
 * tokens like "fire", "close", "end", "promote" co-occur with both literal user
 * commands ("Fire James") and incidental phrasings ("Fire this bug" referring to
 * triaging an issue, "close this loop", "end this thread"). At the standard 0.5
 * bar, an incidental phrasing can pass the gate at e.g. 0.55 confidence and
 * route directly into a destructive command — the audit's exact concern. At 0.8,
 * the classifier must actively be confident before an irreversible-or-disruptive
 * action runs; everything below falls through to `complex_request`, where the
 * agentic loop can ask the user a clarifying question instead of executing a
 * guess. This is paired with the existing destructive-confirmation gates in
 * `slot-filler.ts` (`needs_confirmation`) and `command-service.ts`
 * (`req.confirmed !== true`) to form a layered defense.
 *
 * Why audit 2026-05-07 H7 — `intent-classifier.ts:57, 313-324` (formerly
 * `apps/desktop/src/main/services/intent-classifier.ts` per the audit's path;
 * the file lives in this package).
 */
export const DESTRUCTIVE_MIN_CONFIDENCE = 0.8;

/**
 * Destructive intents — runtime-iterable const tuple form (H6 pattern).
 *
 * The tuple is the source of truth for both `DestructiveIntentName` (compile-time
 * union) and `DESTRUCTIVE_INTENTS` (runtime Set). The four members are the
 * established system-wide destructive set, previously duplicated in
 * `slot-filler.ts` (needs_confirmation routing) and
 * `command-service.ts` (confirmed:true gate); both now import from here.
 *
 * Membership criteria (matches the existing system taxonomy — NOT expanded by H7):
 *   - `fire_employee`     — irreversible employee archive (the audit's named example).
 *   - `close_ticket`      — high-blast-radius state change; reversible only via a
 *                            second `reopen_ticket` round-trip and resets ticket
 *                            metadata along the way.
 *   - `end_meeting`       — terminates a live meeting; not undoable in-session.
 *   - `promote_employee`  — changes a person's role + level; user-visible and
 *                            socially disruptive even if technically reversible.
 *
 * Adding a member is a one-symbol change here.
 *
 * Audit 2026-05-07 H7.
 */
export const DESTRUCTIVE_INTENT_NAMES = [
  'fire_employee',
  'close_ticket',
  'end_meeting',
  'promote_employee',
] as const satisfies readonly IntentName[];

export type DestructiveIntentName = (typeof DESTRUCTIVE_INTENT_NAMES)[number];

/**
 * Set form of `DESTRUCTIVE_INTENT_NAMES` for O(1) `has()` lookups in the
 * confidence gate and in the downstream confirmation routers.
 *
 * Audit 2026-05-07 H7.
 */
export const DESTRUCTIVE_INTENTS: ReadonlySet<IntentName> = new Set<IntentName>(
  DESTRUCTIVE_INTENT_NAMES,
);

/**
 * Returns the minimum classifier confidence required for the given intent
 * to be returned as-is (rather than re-labeled `complex_request`).
 *
 * Why exposed: tests pin the per-intent threshold without reaching into the
 * `finalize()` closure, and downstream consumers (M32+ governance, telemetry
 * dashboards) get the same answer the gate uses.
 *
 * Audit 2026-05-07 H7.
 */
export function getMinConfidenceFor(intent: IntentName): number {
  return DESTRUCTIVE_INTENTS.has(intent) ? DESTRUCTIVE_MIN_CONFIDENCE : MIN_CONFIDENCE;
}

// ---------------------------------------------------------------------------
// Per-intent slot schema — what the slot-filler (T3) eventually enforces.
// Kept here so the system-prompt examples stay in lock-step with the
// canonical required-slot set.
// ---------------------------------------------------------------------------

interface IntentSpec {
  readonly description: string;
  readonly required: readonly string[];
  readonly optional: readonly string[];
  readonly examples: readonly string[];
}

export const INTENT_SPECS: Record<IntentName, IntentSpec> = {
  hire_employee: {
    description: 'Hire a new employee from the role catalog.',
    required: ['roleQuery'],
    optional: ['managerQuery', 'level'],
    examples: [
      '"Hire a senior frontend engineer" → roleQuery="senior frontend engineer"',
      '"Bring on a CMO reporting to the CEO" → roleQuery="CMO", managerQuery="CEO"',
    ],
  },
  fire_employee: {
    description: 'Remove (archive) an existing employee.',
    required: ['employeeQuery'],
    optional: [],
    examples: ['"Fire James" → employeeQuery="James"', '"Let Sarah go" → employeeQuery="Sarah"'],
  },
  assign_ticket: {
    description: 'Assign an existing ticket to an employee.',
    required: ['ticketQuery', 'assigneeQuery'],
    optional: [],
    examples: [
      '"Assign the auth bug to Sarah" → ticketQuery="auth bug", assigneeQuery="Sarah"',
      '"Give ticket #42 to James" → ticketQuery="#42", assigneeQuery="James"',
    ],
  },
  create_ticket: {
    description: 'File a new ticket.',
    required: ['title'],
    optional: ['assigneeQuery', 'priority', 'description'],
    examples: [
      '"Open a ticket for the 500 errors on checkout" → title="500 errors on checkout"',
      '"File a P0 bug: login page blank" → title="login page blank", priority="p0"',
    ],
  },
  close_ticket: {
    description: 'Close (resolve) an open ticket.',
    required: ['ticketQuery'],
    optional: [],
    examples: [
      '"Close the login bug" → ticketQuery="login bug"',
      '"Mark ticket #17 as done" → ticketQuery="#17"',
    ],
  },
  promote_employee: {
    description: "Change an employee's role or level.",
    required: ['employeeQuery', 'newRoleQuery'],
    optional: [],
    examples: [
      '"Promote Sarah to staff engineer" → employeeQuery="Sarah", newRoleQuery="staff engineer"',
      '"Move James up to senior manager" → employeeQuery="James", newRoleQuery="senior manager"',
    ],
  },
  create_project: {
    description: 'Spin up a new project under a goal.',
    required: ['name'],
    optional: ['goalQuery', 'leadQuery', 'description'],
    examples: [
      '"Start a new project called Atlas Migration" → name="Atlas Migration"',
      '"Create project \'Mobile Rewrite\' led by Sarah" → name="Mobile Rewrite", leadQuery="Sarah"',
    ],
  },
  create_goal: {
    description: 'Create a new company goal.',
    required: ['title'],
    optional: ['description', 'deadline'],
    examples: [
      '"Add a goal: ship v2 by Q3" → title="ship v2 by Q3"',
      '"Create goal double ARR this year" → title="double ARR this year"',
    ],
  },
  call_meeting: {
    description: 'Call a meeting with a set of attendees.',
    required: ['attendeesQuery'],
    optional: ['agenda'],
    examples: [
      '"All-hands with the design team about the rebrand" → attendeesQuery="design team", agenda="the rebrand"',
      '"Call a meeting with Sarah and James" → attendeesQuery="Sarah and James"',
    ],
  },
  end_meeting: {
    description: 'End the currently active meeting.',
    required: [],
    optional: [],
    examples: ['"End the meeting" → (no entities)', '"Wrap this up" → (no entities)'],
  },
  check_status: {
    description: 'Read-only status check on an entity.',
    required: ['target'],
    optional: [],
    examples: [
      '"What is Sarah working on?" → target="Sarah"',
      '"Status of ticket #42" → target="#42"',
    ],
  },
  show_view: {
    description: 'Switch the main view to a specific tab.',
    required: ['view'],
    optional: [],
    examples: ['"Go to tickets" → view="tickets"', '"Open the org chart" → view="employees"'],
  },
  search_vault: {
    description: 'Search the file vault for a document.',
    required: ['query'],
    optional: [],
    examples: [
      '"Find the API spec" → query="API spec"',
      '"Search the vault for onboarding docs" → query="onboarding docs"',
    ],
  },
  complex_request: {
    description:
      'Anything not cleanly matching the 14 structured intents. Routed to the agentic loop (M31).',
    required: [],
    optional: [],
    examples: [
      '"Why is the frontend team behind schedule?" → complex',
      '"Summarize what the team did this week and draft a status update" → complex',
    ],
  },
  reopen_ticket: {
    description: 'Reopen a previously closed ticket.',
    required: ['ticketQuery'],
    optional: [],
    examples: [
      '"Reopen the login bug" → ticketQuery="login bug"',
      '"Ticket #17 isn\'t actually fixed, reopen it" → ticketQuery="#17"',
    ],
  },
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface IntentResult {
  intent: IntentName;
  entities: Record<string, string>;
  confidence: number;
  missingSlots: string[];
  rawText: string;
}

export interface NluContext {
  companyId: string;
  currentView?: string;
  recentIntents?: IntentName[];
}

export interface IntentClassifier {
  classify(text: string, context: NluContext): Promise<IntentResult>;
}

// ---------------------------------------------------------------------------
// Provider seam — a completion function that returns a single string.
// Mirrors `createEmbedText`'s factory+adapter pattern: the classifier
// does not care how the provider was wired, only that it can submit a
// system + user prompt and receive text back. Main process wraps a
// `ProviderStreamFn` into this shape; unit tests pass a canned fn.
// ---------------------------------------------------------------------------

export interface ClassifyPromptArgs {
  system: string;
  user: string;
}

export type ClassifyCompleteFn = (args: ClassifyPromptArgs) => Promise<string>;

// ---------------------------------------------------------------------------
// Zod schema — validates the LLM JSON output
// ---------------------------------------------------------------------------

const intentNameSchema = z.enum(INTENT_NAMES);

const llmResponseSchema = z.object({
  intent: intentNameSchema,
  entities: z.record(z.string()).default({}),
  confidence: z.number().min(0).max(1),
  missingSlots: z.array(z.string()).default([]),
});

type LlmResponse = z.infer<typeof llmResponseSchema>;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface IntentClassifierOptions {
  /** Injected completion function. Tests pass a canned fn; prod passes a provider-router wrapper. */
  complete: ClassifyCompleteFn;
}

export function createIntentClassifier(opts: IntentClassifierOptions): IntentClassifier {
  const systemPrompt = buildSystemPrompt();

  return {
    async classify(text: string, context: NluContext): Promise<IntentResult> {
      const rawText = text;
      const trimmed = text.trim();
      if (!trimmed) {
        return {
          intent: 'complex_request',
          entities: {},
          confidence: 0,
          missingSlots: [],
          rawText,
        };
      }

      const userPrompt = buildUserPrompt(trimmed, context);

      // First attempt
      const firstRaw = await opts.complete({ system: systemPrompt, user: userPrompt });
      const firstParsed = tryParseJson(firstRaw);
      if (firstParsed !== null) {
        return finalize(firstParsed, rawText);
      }

      // Retry with nudge prompt
      const nudgedUser = buildNudgePrompt(userPrompt, firstRaw);
      const retryRaw = await opts.complete({ system: systemPrompt, user: nudgedUser });
      const retryParsed = tryParseJson(retryRaw);
      if (retryParsed !== null) {
        return finalize(retryParsed, rawText);
      }

      // Both failed — fall back to complex_request
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

function finalize(parsed: LlmResponse, rawText: string): IntentResult {
  // Confidence gate: low confidence is re-labeled as complex_request so the
  // palette can route it to the agentic loop rather than execute a guess.
  //
  // Destructive intents (DESTRUCTIVE_INTENTS) clear an elevated bar
  // (DESTRUCTIVE_MIN_CONFIDENCE = 0.8) instead of the standard MIN_CONFIDENCE
  // (0.5). Why: a classifier judgment of e.g. 0.55 on `fire_employee` for
  // "Fire this bug" is exactly the kind of incidental phrasing that should
  // fall through to `complex_request` so the agentic loop can ask a
  // clarifying question, not execute an archive against the wrong record.
  // Audit 2026-05-07 H7 — see `DESTRUCTIVE_MIN_CONFIDENCE` doc-comment for
  // the full rationale.
  const minConfidence = getMinConfidenceFor(parsed.intent);
  if (parsed.intent !== 'complex_request' && parsed.confidence < minConfidence) {
    return {
      intent: 'complex_request',
      entities: parsed.entities,
      confidence: 0,
      missingSlots: parsed.missingSlots,
      rawText,
    };
  }
  return {
    intent: parsed.intent,
    entities: parsed.entities,
    confidence: parsed.confidence,
    missingSlots: parsed.missingSlots,
    rawText,
  };
}

function tryParseJson(raw: string): LlmResponse | null {
  const extracted = extractJsonObject(raw);
  if (extracted === null) return null;
  try {
    const obj: unknown = JSON.parse(extracted);
    const result = llmResponseSchema.safeParse(obj);
    if (!result.success) return null;
    // Belt-and-suspenders: zod's enum already rejects unknown intent names,
    // but this keeps INTENT_NAME_SET as the single source of truth if the
    // schema ever drifts.
    if (!INTENT_NAME_SET.has(result.data.intent)) return null;
    return result.data;
  } catch {
    return null;
  }
}

/**
 * Extract the first balanced JSON object from a raw string.
 *
 * Small local models often wrap their JSON in prose ("Sure! Here's the JSON:
 * { ... }") or triple-fenced code blocks. We walk the string counting
 * braces, skipping contents of string literals, and return the first
 * top-level balanced `{...}` substring.
 */
function extractJsonObject(raw: string): string | null {
  const s = raw;
  const firstBrace = s.indexOf('{');
  if (firstBrace === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = firstBrace; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return s.slice(firstBrace, i + 1);
      }
    }
  }
  return null;
}

function buildSystemPrompt(): string {
  const intentBlocks = INTENT_NAMES.map((name) => {
    const spec = INTENT_SPECS[name];
    const req = spec.required.length > 0 ? spec.required.join(', ') : '(none)';
    const opt = spec.optional.length > 0 ? spec.optional.join(', ') : '(none)';
    const exs = spec.examples.map((e) => `    - ${e}`).join('\n');
    return `- ${name}: ${spec.description}\n  Required entities: ${req}\n  Optional entities: ${opt}\n  Examples:\n${exs}`;
  }).join('\n');

  return [
    'You are an intent classifier for a desktop app that runs an AI-agent company.',
    'Given a single user command, output a JSON object with four fields:',
    '  - intent: one of the 15 names below (snake_case, exact match)',
    '  - entities: a flat object of string → string with resolved slot values',
    '  - confidence: a number 0..1 reflecting your confidence',
    '  - missingSlots: array of required entity keys not present in the input',
    '',
    'Output ONLY the JSON object. No prose, no code fences, no commentary.',
    'If the request does not match any of the 14 structured intents cleanly, return `complex_request` with confidence reflecting your certainty.',
    '',
    'The 15 intents:',
    intentBlocks,
  ].join('\n');
}

function buildUserPrompt(text: string, context: NluContext): string {
  const parts = [`User command: ${JSON.stringify(text)}`, `Company ID: ${context.companyId}`];
  if (context.currentView) {
    parts.push(`Current view: ${context.currentView}`);
  }
  if (context.recentIntents && context.recentIntents.length > 0) {
    parts.push(`Recent intents: ${context.recentIntents.join(', ')}`);
  }
  parts.push(
    '',
    'Return the JSON object now. If no required entities are mentioned, still return a JSON object and list them in missingSlots.',
  );
  return parts.join('\n');
}

function buildNudgePrompt(originalUser: string, badOutput: string): string {
  return [
    originalUser,
    '',
    'Your previous output was not valid JSON matching the required schema:',
    badOutput.slice(0, 500),
    '',
    'Return ONLY a single JSON object with fields { intent, entities, confidence, missingSlots }. No prose, no code fences.',
  ].join('\n');
}
