/**
 * Slot filler — the last stop in the NLU pipeline before the
 * `CommandService` dispatcher runs (T4).
 *
 * Given:
 *   - An `IntentResult` from the T1 classifier (`intent`, `entities`, raw).
 *   - A `ResolvedEntities` map from the T2 entity resolver (one
 *     `ResolvedEntity<T>` per entity key the classifier emitted).
 *
 * Produce a single `FillResult` that tells the caller exactly what to
 * do next:
 *   - `ready`                 — every required slot resolved uniquely
 *     and the intent is non-destructive; caller may execute.
 *   - `needs_clarification`   — a required slot is missing entirely,
 *     resolved to `not_found`, or resolved to 2+ `ambiguous`
 *     candidates. Caller shows a picker / re-prompt to Rocky.
 *   - `needs_confirmation`    — every required slot resolved uniquely
 *     BUT the intent is destructive (`fire_employee`, `close_ticket`,
 *     `end_meeting`, `promote_employee`); caller shows a summary +
 *     Confirm / Cancel buttons.
 *
 * Architectural invariants honored:
 *   - Package stays DB-agnostic. The slot filler is a pure function of
 *     its two inputs — no I/O, no async.
 *   - No Electron imports. No orchestrator imports. No DB imports.
 *   - The filler does NOT second-guess the classifier: if the
 *     classifier returned `complex_request`, we route to conversational
 *     fallback with `ready` regardless of what entities are (or are
 *     not) present. That's the T4 CommandService's signal to dispatch
 *     to the agentic loop (M31) rather than a command IPC.
 *
 * Plan-ambiguity decisions (documented inline so reviewers don't have
 * to re-derive them):
 *   1. The plan's required-slots table uses canonical names
 *      (`roleId`, `employeeId`, `ticketId`, `newLevel`). The T1
 *      classifier emits query-style keys (`roleQuery`, `employeeQuery`,
 *      `ticketQuery`, `newRoleQuery`). The resolver stores
 *      `ResolvedEntity` under the classifier's key. Rather than inventing
 *      a parallel keying scheme, `SLOT_KEY_ALIASES` maps each canonical
 *      slot to the classifier key we actually look up in `resolved`.
 *      The T4 CommandService will refine this seam when it needs to
 *      call IPC handlers that expect the canonical id names.
 *   2. `call_meeting` and `end_meeting` — the T1 classifier's
 *      `INTENT_SPECS` define different required slots than the T3 plan
 *      table. Plan table wins for T3: `call_meeting` requires `agenda`;
 *      `end_meeting` requires `meetingId`. The classifier may still emit
 *      its own set of entities — we consume whatever is present under
 *      the aliased key and fall back to `needs_clarification` otherwise.
 *   3. The duck-typed `stringify` candidate labeler pulls `name ?? title
 *      ?? id` in that order so an `Employee` prints as its display name,
 *      a `Ticket` as its title, and a `RoleSpec` (via `frontmatter.name`
 *      which is not directly on the value) falls back to `id`. Callers
 *      that want richer labels can pre-shape the candidates.
 *   4. `create_ticket` / `create_project` / `create_goal` / `search_vault`
 *      take text-valued required slots (`title`, `name`, `query`). No
 *      resolver is needed — we pull the string straight out of
 *      `intent.entities` and treat the slot as satisfied when the text
 *      is non-empty.
 *
 * Phase 5 — M30 — T3.
 */

import type { ResolvedEntity } from './entity-resolver.js';
import { DESTRUCTIVE_INTENTS, type IntentName, type IntentResult } from './intent-classifier.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The resolver's output, keyed by whatever entity name the classifier +
 * resolver agreed on (typically `employeeQuery`, `ticketQuery`,
 * `roleQuery`, etc.). `unknown` is the safe default — callers that want
 * a tighter type per key can narrow via generics at their call site.
 */
export type ResolvedEntities = Record<string, ResolvedEntity<unknown>>;

export type FillResult =
  | { kind: 'ready'; intent: IntentName; entities: Record<string, string> }
  | { kind: 'needs_clarification'; missing: string; prompt: string; options?: string[] }
  | {
      kind: 'needs_confirmation';
      intent: IntentName;
      entities: Record<string, string>;
      summary: string;
    };

export interface SlotFiller {
  fill(intent: IntentResult, resolved: ResolvedEntities): FillResult;
}

export interface SlotFillerOptions {
  /** Optional override of the default candidate stringifier. */
  stringifyCandidate?: (value: unknown) => string;
}

// ---------------------------------------------------------------------------
// Per-intent required-slots table (canonical — matches the M30 plan doc).
// ---------------------------------------------------------------------------

/**
 * Required slot KEYS per intent, in canonical-id form. This is the
 * contract the downstream CommandService dispatcher relies on.
 */
export const REQUIRED_SLOTS: Record<IntentName, readonly string[]> = {
  hire_employee: ['roleId'],
  fire_employee: ['employeeId'],
  promote_employee: ['employeeId', 'newLevel'],
  assign_ticket: ['ticketId', 'employeeId'],
  create_ticket: ['title'],
  close_ticket: ['ticketId'],
  reopen_ticket: ['ticketId'],
  create_project: ['name'],
  create_goal: ['title'],
  call_meeting: ['agenda'],
  end_meeting: ['meetingId'],
  check_status: [],
  show_view: ['view'],
  search_vault: ['query'],
  complex_request: [],
};

/**
 * Map canonical required-slot keys → the actual key the T1 classifier
 * emits and the T2 resolver stores under in `ResolvedEntities`.
 *
 * This is the seam the T4 CommandService will refine when it normalizes
 * resolved payloads into IPC request shapes.
 */
export const SLOT_KEY_ALIASES: Record<string, string> = {
  roleId: 'roleQuery',
  employeeId: 'employeeQuery',
  ticketId: 'ticketQuery',
  meetingId: 'meetingQuery',
  newLevel: 'newRoleQuery',
  // Text-valued slots live under their canonical name in `intent.entities`;
  // included here explicitly so the lookup code never has to special-case.
  title: 'title',
  name: 'name',
  agenda: 'agenda',
  view: 'view',
  query: 'query',
};

/**
 * Per-slot human-readable prompt text. Used when the slot is entirely
 * missing (no entity from the classifier, no resolver outcome). The
 * `not_found` case uses a slightly different wording that includes the
 * offending text.
 */
const MISSING_SLOT_PROMPTS: Record<string, string> = {
  roleId: 'Which role should I hire?',
  employeeId: 'Which employee?',
  ticketId: 'Which ticket?',
  meetingId: 'Which meeting?',
  newLevel: 'What level should they be promoted to?',
  title: 'What should the title be?',
  name: 'What should it be called?',
  agenda: 'What is the meeting about?',
  view: 'Which view?',
  query: 'What should I search for?',
};

// `DESTRUCTIVE_INTENTS` is the canonical destructive set imported from
// `./intent-classifier.js` — see its doc-comment for membership criteria.
// It drives both this file's `needs_confirmation` routing AND the H7 elevated
// confidence threshold in `intent-classifier.ts:finalize()`. De-duplicated as
// part of audit 2026-05-07 H7 so the two gates share one source of truth.

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSlotFiller(opts: SlotFillerOptions = {}): SlotFiller {
  const stringify = opts.stringifyCandidate ?? defaultStringify;

  return {
    fill(intent, resolved) {
      return fillImpl(intent, resolved, stringify);
    },
  };
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

function fillImpl(
  intent: IntentResult,
  resolved: ResolvedEntities,
  stringify: (value: unknown) => string,
): FillResult {
  // `complex_request` is the conversational-fallback escape hatch. The T4
  // CommandService routes it to the agentic loop (M31) rather than a
  // command-dispatch table, so the slot filler does not enforce slots.
  if (intent.intent === 'complex_request') {
    return {
      kind: 'ready',
      intent: intent.intent,
      entities: { ...intent.entities },
    };
  }

  const required = REQUIRED_SLOTS[intent.intent] ?? [];

  // Walk required slots and collect: clarification asks (first miss wins),
  // and the flattened string entity map we'll return on the happy path.
  const flattened: Record<string, string> = {};

  for (const canonicalKey of required) {
    const lookupKey = SLOT_KEY_ALIASES[canonicalKey] ?? canonicalKey;
    const classifierValue = intent.entities[lookupKey];
    const resolvedEntry = resolved[lookupKey];

    // Text-valued slots: title / name / agenda / view / query — just pull
    // the string out of `intent.entities`. No resolver involvement.
    if (isTextSlot(canonicalKey)) {
      const text = typeof classifierValue === 'string' ? classifierValue.trim() : '';
      if (text.length === 0) {
        return missingSlot(canonicalKey);
      }
      flattened[canonicalKey] = text;
      continue;
    }

    // Structured slots: must have a resolver outcome. If the resolver
    // entry is missing altogether AND the classifier didn't mention the
    // slot, it's a clean "never asked" miss.
    if (resolvedEntry === undefined) {
      if (classifierValue === undefined || classifierValue.trim() === '') {
        return missingSlot(canonicalKey);
      }
      // The classifier mentioned something but the caller didn't run a
      // resolver. Treat as not_found with the classifier's raw text.
      return notFoundSlot(canonicalKey, classifierValue);
    }

    if (resolvedEntry.kind === 'not_found') {
      return notFoundSlot(canonicalKey, classifierValue);
    }

    if (resolvedEntry.kind === 'ambiguous') {
      const options = resolvedEntry.candidates.slice(0, 5).map((c) => stringify(c));
      return {
        kind: 'needs_clarification',
        missing: canonicalKey,
        prompt: ambiguousPrompt(canonicalKey, classifierValue),
        options,
      };
    }

    // Unique. Extract the id we'll hand to the dispatcher.
    flattened[canonicalKey] = extractEntityId(canonicalKey, resolvedEntry.value);
  }

  // All required slots satisfied. Destructive intents need explicit confirm.
  if (DESTRUCTIVE_INTENTS.has(intent.intent)) {
    return {
      kind: 'needs_confirmation',
      intent: intent.intent,
      entities: flattened,
      summary: buildSummary(intent.intent, flattened, resolved),
    };
  }

  return {
    kind: 'ready',
    intent: intent.intent,
    entities: flattened,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isTextSlot(canonicalKey: string): boolean {
  return (
    canonicalKey === 'title' ||
    canonicalKey === 'name' ||
    canonicalKey === 'agenda' ||
    canonicalKey === 'view' ||
    canonicalKey === 'query'
  );
}

function missingSlot(canonicalKey: string): FillResult {
  return {
    kind: 'needs_clarification',
    missing: canonicalKey,
    prompt: MISSING_SLOT_PROMPTS[canonicalKey] ?? `What ${canonicalKey}?`,
  };
}

function notFoundSlot(canonicalKey: string, classifierValue: string | undefined): FillResult {
  const raw = (classifierValue ?? '').trim();
  if (raw.length === 0) {
    return missingSlot(canonicalKey);
  }
  return {
    kind: 'needs_clarification',
    missing: canonicalKey,
    prompt: `I couldn't find anyone matching '${raw}'. Who did you mean?`,
  };
}

function ambiguousPrompt(canonicalKey: string, classifierValue: string | undefined): string {
  const raw = (classifierValue ?? '').trim();
  if (raw.length === 0) {
    return MISSING_SLOT_PROMPTS[canonicalKey] ?? 'Which one?';
  }
  return `Multiple matches for '${raw}'. Which one?`;
}

/**
 * Pull the id we'll hand back to the dispatcher from a resolved entity
 * value. Duck-typed: works on `Employee`, `Ticket`, `VaultFile`,
 * `RoleSpec`, and any shape that exposes `id` or (for `RoleSpec`)
 * `frontmatter.id`.
 */
export function extractEntityId(_canonicalKey: string, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;

  if (isRecord(value)) {
    // RoleSpec-shaped values carry their id on `frontmatter.id`. We check
    // this branch for ANY key (not just `roleId`) because `newLevel` also
    // receives a RoleSpec from the resolver — the slot name changes but
    // the payload shape doesn't. `canonicalKey` is kept on the signature
    // for future resolver kinds that may need per-key extraction rules.
    const fm = value.frontmatter;
    if (isRecord(fm) && typeof fm.id === 'string') return fm.id;

    if (typeof value.id === 'string') return value.id;
    // Fallbacks for future resolver kinds that key by something else.
    if (typeof value.name === 'string') return value.name;
    if (typeof value.title === 'string') return value.title;
  }

  return String(value);
}

/**
 * Default candidate stringifier used when the palette shows ambiguous
 * options. Prefers the richest human-readable label available
 * (`name → title → id`), falling through to `String(value)` for odd
 * shapes. Matches the plan spec: `(x) => x.name ?? x.title ?? x.id`.
 */
export function defaultStringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;

  if (isRecord(value)) {
    // RoleSpec — the displayable name lives on `frontmatter.name`.
    const fm = value.frontmatter;
    if (isRecord(fm) && typeof fm.name === 'string') return fm.name;

    if (typeof value.name === 'string') return value.name;
    if (typeof value.originalName === 'string') return value.originalName;
    if (typeof value.title === 'string') return value.title;
    if (typeof value.id === 'string') return value.id;
  }

  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// ---------------------------------------------------------------------------
// Summary builders for destructive-action confirmations
// ---------------------------------------------------------------------------

function resolvedFor(
  resolved: ResolvedEntities,
  canonicalKey: string,
): ResolvedEntity<unknown> | undefined {
  const aliasKey = SLOT_KEY_ALIASES[canonicalKey] ?? canonicalKey;
  return resolved[aliasKey];
}

function buildSummary(
  intent: IntentName,
  flattened: Record<string, string>,
  resolved: ResolvedEntities,
): string {
  switch (intent) {
    case 'fire_employee': {
      const emp = uniqueValue(resolvedFor(resolved, 'employeeId'));
      const name = readString(emp, 'name') ?? flattened.employeeId ?? 'this employee';
      const title = readString(emp, 'title');
      return title ? `Fire ${name} (${title})?` : `Fire ${name}?`;
    }
    case 'close_ticket': {
      const tk = uniqueValue(resolvedFor(resolved, 'ticketId'));
      const id = readString(tk, 'id') ?? flattened.ticketId ?? '';
      const title = readString(tk, 'title');
      if (id && title) return `Close ticket #${id} '${title}'?`;
      if (title) return `Close ticket '${title}'?`;
      if (id) return `Close ticket #${id}?`;
      return 'Close this ticket?';
    }
    case 'end_meeting': {
      const mt = uniqueValue(resolvedFor(resolved, 'meetingId'));
      const title = readString(mt, 'title') ?? readString(mt, 'name');
      if (title) return `End meeting '${title}'?`;
      const id = readString(mt, 'id') ?? flattened.meetingId ?? '';
      return id ? `End meeting ${id}?` : 'End this meeting?';
    }
    case 'promote_employee': {
      const emp = uniqueValue(resolvedFor(resolved, 'employeeId'));
      const name = readString(emp, 'name') ?? flattened.employeeId ?? 'this employee';
      const level = flattened.newLevel ?? '(unspecified)';
      return `Promote ${name} to level ${level}?`;
    }
    default:
      // Should not reach here — DESTRUCTIVE_INTENTS is exhaustive — but
      // keep the fallback to satisfy the exhaustiveness checker.
      return `Confirm ${intent}?`;
  }
}

function uniqueValue(entry: ResolvedEntity<unknown> | undefined): unknown {
  if (entry === undefined) return undefined;
  return entry.kind === 'unique' ? entry.value : undefined;
}

function readString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const v = value[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
