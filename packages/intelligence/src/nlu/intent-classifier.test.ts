import { describe, expect, it, vi } from 'vitest';

import {
  type ClassifyCompleteFn,
  INTENT_NAMES,
  type IntentName,
  type IntentResult,
  MIN_CONFIDENCE,
  type NluContext,
  createIntentClassifier,
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
