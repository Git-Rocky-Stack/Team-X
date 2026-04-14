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

/** Minimum classifier-reported confidence for a non-complex intent. */
export const MIN_CONFIDENCE = 0.5;

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
  if (parsed.intent !== 'complex_request' && parsed.confidence < MIN_CONFIDENCE) {
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
