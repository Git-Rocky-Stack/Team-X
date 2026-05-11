import { describe, expect, it, vi } from 'vitest';

import {
  type ClassifyCompleteFn,
  DESTRUCTIVE_INTENTS,
  DESTRUCTIVE_INTENT_NAMES,
  DESTRUCTIVE_MIN_CONFIDENCE,
  INTENT_NAMES,
  type IntentName,
  type IntentResult,
  MIN_CONFIDENCE,
  type NluContext,
  createIntentClassifier,
  getMinConfidenceFor,
} from './intent-classifier.js';

/**
 * Unit tests for the M30 T1 intent classifier.
 *
 * These tests NEVER hit a real LLM. A canned `ClassifyCompleteFn` is
 * injected for every case so the classifier's JSON parsing, retry,
 * fallback, and confidence-gate logic can be exercised deterministically.
 */

const CTX: NluContext = { companyId: 'company_test' };

function fixedResponder(response: string): ClassifyCompleteFn {
  return vi.fn(async () => response);
}

function sequenceResponder(...responses: string[]): ClassifyCompleteFn {
  let idx = 0;
  return vi.fn(async () => {
    const r = responses[idx] ?? responses[responses.length - 1] ?? '';
    idx++;
    return r;
  });
}

function jsonBody(
  partial: Partial<Omit<IntentResult, 'rawText'>> & { intent: IntentName },
): string {
  return JSON.stringify({
    intent: partial.intent,
    entities: partial.entities ?? {},
    confidence: partial.confidence ?? 0.95,
    missingSlots: partial.missingSlots ?? [],
  });
}

describe('INTENT_NAMES export surface', () => {
  it('exports all 15 canonical intent names', () => {
    expect(INTENT_NAMES.length).toBe(15);
    const expected = [
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
    for (const name of expected) {
      expect(INTENT_NAMES).toContain(name);
    }
  });

  it('contains no duplicate intent names', () => {
    const unique = new Set<string>(INTENT_NAMES);
    expect(unique.size).toBe(INTENT_NAMES.length);
  });
});

describe('createIntentClassifier — JSON parsing & success', () => {
  it('returns the intent for a well-formed JSON response', async () => {
    const complete = fixedResponder(
      jsonBody({
        intent: 'hire_employee',
        entities: { roleQuery: 'senior backend engineer' },
        confidence: 0.92,
      }),
    );
    const classifier = createIntentClassifier({ complete });
    const result = await classifier.classify('Hire a senior backend engineer', CTX);
    expect(result.intent).toBe('hire_employee');
    expect(result.entities.roleQuery).toBe('senior backend engineer');
    expect(result.confidence).toBeCloseTo(0.92);
    expect(result.missingSlots).toEqual([]);
    expect(result.rawText).toBe('Hire a senior backend engineer');
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('propagates entities verbatim to the result', async () => {
    const complete = fixedResponder(
      jsonBody({
        intent: 'assign_ticket',
        entities: { ticketQuery: 'auth bug', assigneeQuery: 'Sarah' },
        confidence: 0.88,
      }),
    );
    const classifier = createIntentClassifier({ complete });
    const result = await classifier.classify('Assign the auth bug to Sarah', CTX);
    expect(result.entities).toEqual({ ticketQuery: 'auth bug', assigneeQuery: 'Sarah' });
  });

  it('always echoes rawText (never null)', async () => {
    const complete = fixedResponder(jsonBody({ intent: 'end_meeting', confidence: 0.99 }));
    const classifier = createIntentClassifier({ complete });
    const result = await classifier.classify('Wrap this up', CTX);
    expect(result.rawText).toBe('Wrap this up');
    expect(result.rawText).not.toBeNull();
  });

  it('extracts JSON even when wrapped in prose and code fences', async () => {
    const complete = fixedResponder(
      `Sure! Here is the JSON:\n\`\`\`json\n${jsonBody({
        intent: 'search_vault',
        entities: { query: 'API spec' },
        confidence: 0.9,
      })}\n\`\`\`\nHope that helps!`,
    );
    const classifier = createIntentClassifier({ complete });
    const result = await classifier.classify('Find the API spec', CTX);
    expect(result.intent).toBe('search_vault');
    expect(result.entities.query).toBe('API spec');
  });
});

describe('createIntentClassifier — JSON retry', () => {
  it('retries once with a nudge prompt when first output is invalid JSON', async () => {
    const complete = sequenceResponder(
      'This is not JSON at all, sorry!',
      jsonBody({
        intent: 'fire_employee',
        entities: { employeeQuery: 'James' },
        confidence: 0.8,
      }),
    );
    const classifier = createIntentClassifier({ complete });
    const result = await classifier.classify('Fire James', CTX);
    expect(result.intent).toBe('fire_employee');
    expect(result.entities.employeeQuery).toBe('James');
    expect(complete).toHaveBeenCalledTimes(2);

    const secondCall = (complete as ReturnType<typeof vi.fn>).mock.calls[1]?.[0] as {
      user: string;
    };
    expect(secondCall.user).toContain('Your previous output was not valid JSON');
    expect(secondCall.user).toContain('Return ONLY a single JSON object');
  });

  it('falls back to complex_request with confidence 0 when retry also fails', async () => {
    const complete = sequenceResponder('garbage one', 'garbage two');
    const classifier = createIntentClassifier({ complete });
    const result = await classifier.classify('something weird', CTX);
    expect(result.intent).toBe('complex_request');
    expect(result.confidence).toBe(0);
    expect(result.entities).toEqual({});
    expect(result.missingSlots).toEqual([]);
    expect(result.rawText).toBe('something weird');
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('retries when the intent field is missing from the JSON', async () => {
    const complete = sequenceResponder(
      JSON.stringify({ entities: {}, confidence: 0.9, missingSlots: [] }),
      jsonBody({ intent: 'check_status', entities: { target: 'Sarah' }, confidence: 0.85 }),
    );
    const classifier = createIntentClassifier({ complete });
    const result = await classifier.classify('What is Sarah working on?', CTX);
    expect(result.intent).toBe('check_status');
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('retries when the intent field is an unknown name', async () => {
    const complete = sequenceResponder(
      JSON.stringify({ intent: 'dance_jig', entities: {}, confidence: 0.9, missingSlots: [] }),
      jsonBody({ intent: 'show_view', entities: { view: 'tickets' }, confidence: 0.95 }),
    );
    const classifier = createIntentClassifier({ complete });
    const result = await classifier.classify('Go to tickets', CTX);
    expect(result.intent).toBe('show_view');
    expect(complete).toHaveBeenCalledTimes(2);
  });
});

describe('createIntentClassifier — confidence threshold', () => {
  it('re-labels a low-confidence (0.3) result as complex_request with confidence 0', async () => {
    const complete = fixedResponder(
      jsonBody({
        intent: 'create_ticket',
        entities: { title: 'maybe a thing' },
        confidence: 0.3,
      }),
    );
    const classifier = createIntentClassifier({ complete });
    const result = await classifier.classify('maybe open a ticket?', CTX);
    expect(result.intent).toBe('complex_request');
    expect(result.confidence).toBe(0);
    // Entities are preserved so the agentic loop has context.
    expect(result.entities).toEqual({ title: 'maybe a thing' });
    expect(result.rawText).toBe('maybe open a ticket?');
  });

  it('keeps an above-threshold (0.51) result as-is', async () => {
    const complete = fixedResponder(
      jsonBody({
        intent: 'create_ticket',
        entities: { title: 'Login is broken' },
        confidence: 0.51,
      }),
    );
    const classifier = createIntentClassifier({ complete });
    const result = await classifier.classify('Login is broken', CTX);
    expect(result.intent).toBe('create_ticket');
    expect(result.confidence).toBeCloseTo(0.51);
    expect(result.entities.title).toBe('Login is broken');
  });

  it('MIN_CONFIDENCE export matches the documented 0.5 threshold', () => {
    expect(MIN_CONFIDENCE).toBe(0.5);
  });

  it('preserves a genuine complex_request even below threshold (no re-label loop)', async () => {
    const complete = fixedResponder(jsonBody({ intent: 'complex_request', confidence: 0.2 }));
    const classifier = createIntentClassifier({ complete });
    const result = await classifier.classify('why is morale low?', CTX);
    expect(result.intent).toBe('complex_request');
    // Low-confidence complex_request keeps its reported confidence — only
    // structured intents with low confidence are clamped to 0.
    expect(result.confidence).toBeCloseTo(0.2);
  });
});

describe('createIntentClassifier — context plumbing', () => {
  it('forwards currentView into the user prompt', async () => {
    const complete = vi.fn(async () => jsonBody({ intent: 'end_meeting', confidence: 0.98 }));
    const classifier = createIntentClassifier({ complete });
    await classifier.classify('end it', {
      companyId: 'c1',
      currentView: 'meetings',
    });
    const args = complete.mock.calls[0]?.[0];
    if (!args) throw new Error('complete was not called');
    expect(args.user).toContain('Current view: meetings');
  });

  it('forwards recentIntents into the user prompt', async () => {
    const complete = vi.fn(async () => jsonBody({ intent: 'end_meeting', confidence: 0.97 }));
    const classifier = createIntentClassifier({ complete });
    await classifier.classify('end it', {
      companyId: 'c1',
      recentIntents: ['call_meeting', 'check_status'],
    });
    const args = complete.mock.calls[0]?.[0];
    if (!args) throw new Error('complete was not called');
    expect(args.user).toContain('Recent intents: call_meeting, check_status');
  });

  it('includes all 15 intents in the system prompt', async () => {
    const complete = vi.fn(async () =>
      jsonBody({ intent: 'show_view', entities: { view: 'tickets' }, confidence: 0.99 }),
    );
    const classifier = createIntentClassifier({ complete });
    await classifier.classify('go to tickets', CTX);
    const args = complete.mock.calls[0]?.[0];
    if (!args) throw new Error('complete was not called');
    for (const name of INTENT_NAMES) {
      expect(args.system).toContain(name);
    }
  });
});

describe('createIntentClassifier — edge cases', () => {
  it('short-circuits on empty input without calling the LLM', async () => {
    const complete = vi.fn(async () => jsonBody({ intent: 'check_status', confidence: 0.9 }));
    const classifier = createIntentClassifier({ complete });
    const result = await classifier.classify('   ', CTX);
    expect(result.intent).toBe('complex_request');
    expect(result.confidence).toBe(0);
    expect(result.rawText).toBe('   ');
    expect(complete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// H7 — destructive-intent confidence threshold (audit 2026-05-07)
//
// Audit complaint: "Confidence threshold 0.5 applies to destructive intents.
// 'Fire this bug' can pass to fire_employee at 0.55 confidence. Should be
// 0.8+ for irreversibles." — `intent-classifier.ts:57, 313-324`.
//
// Design (see DESTRUCTIVE_MIN_CONFIDENCE doc-comment): destructive intents
// (the established four — fire_employee, close_ticket, end_meeting,
// promote_employee) clear an elevated 0.8 bar. Everything else stays on the
// 0.5 baseline. Anything below the per-intent bar falls through to
// `complex_request`, where the agentic loop can ask a clarifying question
// instead of executing a low-certainty guess.
// ---------------------------------------------------------------------------

describe('intent-classifier — H7 audit (2026-05-07): destructive-intent threshold export surface', () => {
  it('exports DESTRUCTIVE_MIN_CONFIDENCE = 0.8', () => {
    expect(DESTRUCTIVE_MIN_CONFIDENCE).toBe(0.8);
  });

  it('preserves MIN_CONFIDENCE = 0.5 baseline for non-destructive intents', () => {
    expect(MIN_CONFIDENCE).toBe(0.5);
  });

  it('DESTRUCTIVE_INTENT_NAMES is the established four-member set', () => {
    expect(DESTRUCTIVE_INTENT_NAMES).toEqual([
      'fire_employee',
      'close_ticket',
      'end_meeting',
      'promote_employee',
    ]);
  });

  it('DESTRUCTIVE_INTENTS Set has exactly the same four members', () => {
    expect(DESTRUCTIVE_INTENTS.size).toBe(4);
    for (const name of DESTRUCTIVE_INTENT_NAMES) {
      expect(DESTRUCTIVE_INTENTS.has(name)).toBe(true);
    }
  });

  it('every DESTRUCTIVE_INTENTS member is a valid INTENT_NAME (no orphans)', () => {
    for (const intent of DESTRUCTIVE_INTENTS) {
      expect(INTENT_NAMES).toContain(intent);
    }
  });

  it('non-destructive baseline intents are NOT in DESTRUCTIVE_INTENTS', () => {
    const nonDestructive: IntentName[] = [
      'hire_employee',
      'create_ticket',
      'assign_ticket',
      'reopen_ticket',
      'create_project',
      'create_goal',
      'call_meeting',
      'check_status',
      'show_view',
      'search_vault',
      'complex_request',
    ];
    for (const intent of nonDestructive) {
      expect(DESTRUCTIVE_INTENTS.has(intent)).toBe(false);
    }
  });

  it('getMinConfidenceFor returns DESTRUCTIVE_MIN_CONFIDENCE for every destructive intent', () => {
    for (const intent of DESTRUCTIVE_INTENT_NAMES) {
      expect(getMinConfidenceFor(intent)).toBe(DESTRUCTIVE_MIN_CONFIDENCE);
    }
  });

  it('getMinConfidenceFor returns MIN_CONFIDENCE for non-destructive intents', () => {
    expect(getMinConfidenceFor('hire_employee')).toBe(MIN_CONFIDENCE);
    expect(getMinConfidenceFor('create_ticket')).toBe(MIN_CONFIDENCE);
    expect(getMinConfidenceFor('assign_ticket')).toBe(MIN_CONFIDENCE);
    expect(getMinConfidenceFor('check_status')).toBe(MIN_CONFIDENCE);
    expect(getMinConfidenceFor('reopen_ticket')).toBe(MIN_CONFIDENCE);
    expect(getMinConfidenceFor('complex_request')).toBe(MIN_CONFIDENCE);
  });
});

describe('intent-classifier — H7 audit (2026-05-07): audit-quoted regression', () => {
  it('"Fire this bug" classified as fire_employee at 0.55 confidence is re-labeled to complex_request', async () => {
    // This is the audit's literal example. With the standard 0.5 bar this
    // would have passed straight to fire_employee execution; with the
    // elevated 0.8 bar for destructive intents it falls through to the
    // agentic loop where the model can ask a clarifying question.
    const complete = fixedResponder(
      jsonBody({
        intent: 'fire_employee',
        entities: { employeeQuery: 'this bug' },
        confidence: 0.55,
      }),
    );
    const classifier = createIntentClassifier({ complete });
    const result = await classifier.classify('Fire this bug', CTX);
    expect(result.intent).toBe('complex_request');
    expect(result.confidence).toBe(0);
    // Entities preserved so the agentic loop has context to ask about.
    expect(result.entities).toEqual({ employeeQuery: 'this bug' });
    expect(result.rawText).toBe('Fire this bug');
  });
});

describe('intent-classifier — H7 audit (2026-05-07): destructive threshold boundary', () => {
  it('rejects fire_employee at 0.79 confidence (just below the 0.8 bar)', async () => {
    const complete = fixedResponder(
      jsonBody({
        intent: 'fire_employee',
        entities: { employeeQuery: 'James' },
        confidence: 0.79,
      }),
    );
    const classifier = createIntentClassifier({ complete });
    const result = await classifier.classify('fire James maybe', CTX);
    expect(result.intent).toBe('complex_request');
    expect(result.confidence).toBe(0);
    expect(result.entities).toEqual({ employeeQuery: 'James' });
  });

  it('accepts fire_employee at exactly 0.80 confidence (at the bar — `<` gate, not `<=`)', async () => {
    const complete = fixedResponder(
      jsonBody({
        intent: 'fire_employee',
        entities: { employeeQuery: 'James' },
        confidence: 0.8,
      }),
    );
    const classifier = createIntentClassifier({ complete });
    const result = await classifier.classify('fire James', CTX);
    expect(result.intent).toBe('fire_employee');
    expect(result.confidence).toBeCloseTo(0.8);
    expect(result.entities.employeeQuery).toBe('James');
  });

  it('accepts fire_employee at 0.95 confidence (well above the bar)', async () => {
    const complete = fixedResponder(
      jsonBody({
        intent: 'fire_employee',
        entities: { employeeQuery: 'James' },
        confidence: 0.95,
      }),
    );
    const classifier = createIntentClassifier({ complete });
    const result = await classifier.classify('Fire James effective immediately', CTX);
    expect(result.intent).toBe('fire_employee');
    expect(result.confidence).toBeCloseTo(0.95);
  });
});

describe('intent-classifier — H7 audit (2026-05-07): non-destructive baseline preserved', () => {
  it('accepts create_ticket at 0.55 (still on the standard 0.5 bar — no regression)', async () => {
    const complete = fixedResponder(
      jsonBody({
        intent: 'create_ticket',
        entities: { title: 'Login broken' },
        confidence: 0.55,
      }),
    );
    const classifier = createIntentClassifier({ complete });
    const result = await classifier.classify('open a ticket: Login broken', CTX);
    expect(result.intent).toBe('create_ticket');
    expect(result.confidence).toBeCloseTo(0.55);
  });

  it('accepts hire_employee at 0.55 (additive intent — standard bar)', async () => {
    const complete = fixedResponder(
      jsonBody({
        intent: 'hire_employee',
        entities: { roleQuery: 'designer' },
        confidence: 0.55,
      }),
    );
    const classifier = createIntentClassifier({ complete });
    const result = await classifier.classify('hire a designer', CTX);
    expect(result.intent).toBe('hire_employee');
  });

  it('accepts assign_ticket at 0.55 (reversible — standard bar)', async () => {
    const complete = fixedResponder(
      jsonBody({
        intent: 'assign_ticket',
        entities: { ticketQuery: 'auth bug', assigneeQuery: 'Sarah' },
        confidence: 0.55,
      }),
    );
    const classifier = createIntentClassifier({ complete });
    const result = await classifier.classify('assign the auth bug to Sarah', CTX);
    expect(result.intent).toBe('assign_ticket');
  });

  it('accepts reopen_ticket at 0.55 (additive — standard bar; not in destructive set)', async () => {
    const complete = fixedResponder(
      jsonBody({
        intent: 'reopen_ticket',
        entities: { ticketQuery: '#42' },
        confidence: 0.55,
      }),
    );
    const classifier = createIntentClassifier({ complete });
    const result = await classifier.classify('reopen ticket #42', CTX);
    expect(result.intent).toBe('reopen_ticket');
  });
});

describe('intent-classifier — H7 audit (2026-05-07): parametric destructive matrix', () => {
  it.each(DESTRUCTIVE_INTENT_NAMES)(
    'rejects %s at confidence 0.55 (below the destructive bar — fall through to complex_request)',
    async (intent) => {
      const complete = fixedResponder(jsonBody({ intent, confidence: 0.55 }));
      const classifier = createIntentClassifier({ complete });
      const result = await classifier.classify('do the thing', CTX);
      expect(result.intent).toBe('complex_request');
      expect(result.confidence).toBe(0);
    },
  );

  it.each(DESTRUCTIVE_INTENT_NAMES)(
    'rejects %s at confidence 0.79 (just below the destructive bar)',
    async (intent) => {
      const complete = fixedResponder(jsonBody({ intent, confidence: 0.79 }));
      const classifier = createIntentClassifier({ complete });
      const result = await classifier.classify('do the thing', CTX);
      expect(result.intent).toBe('complex_request');
      expect(result.confidence).toBe(0);
    },
  );

  it.each(DESTRUCTIVE_INTENT_NAMES)(
    'accepts %s at confidence 0.85 (above the destructive bar)',
    async (intent) => {
      const complete = fixedResponder(jsonBody({ intent, confidence: 0.85 }));
      const classifier = createIntentClassifier({ complete });
      const result = await classifier.classify('do the thing', CTX);
      expect(result.intent).toBe(intent);
      expect(result.confidence).toBeCloseTo(0.85);
    },
  );
});

describe('intent-classifier — H7 audit (2026-05-07): low-confidence complex_request still bypasses the gate', () => {
  it('preserves complex_request at confidence 0.6 even though 0.6 is below the standard MIN_CONFIDENCE for non-destructive intents', async () => {
    // Sanity check on the existing carve-out: a genuinely-classified
    // complex_request is never re-labeled, regardless of confidence.
    // The H7 destructive gate must not regress this path — `complex_request`
    // is not in DESTRUCTIVE_INTENTS and the `parsed.intent !== 'complex_request'`
    // short-circuit in finalize() preserves the historical behavior.
    const complete = fixedResponder(jsonBody({ intent: 'complex_request', confidence: 0.6 }));
    const classifier = createIntentClassifier({ complete });
    const result = await classifier.classify('why are mornings hard', CTX);
    expect(result.intent).toBe('complex_request');
    expect(result.confidence).toBeCloseTo(0.6);
  });
});
