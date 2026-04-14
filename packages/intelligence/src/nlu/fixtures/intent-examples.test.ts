import { describe, expect, it } from 'vitest';

import {
  type ClassifyCompleteFn,
  INTENT_NAMES,
  type IntentName,
  createIntentClassifier,
} from '../intent-classifier.js';
import { INTENT_EXAMPLES, type LabeledExample } from './intent-examples.js';

/**
 * M30 T1 fixture spec — 60 labeled text → intent examples (4 per intent).
 *
 * Run against a deterministic canned mock that returns the expected
 * intent keyed by exact text match. Acts as a regression guardrail:
 * when the intent name set or spec changes, any example whose label
 * drifts out of the accepted set fails the ≥90% accuracy gate.
 *
 * Not an LLM quality gate — that is exercised by the command-palette
 * E2E against a real configured provider in M30 T8.
 */

/** Deterministic mock provider keyed by exact text match. */
function makeFixtureResponder(examples: readonly LabeledExample[]): ClassifyCompleteFn {
  const table = new Map<string, IntentName>();
  for (const ex of examples) {
    table.set(ex.text, ex.intent);
  }
  return async (args) => {
    // The user prompt starts with `User command: "<text>"`; pull the text
    // out so the mock stays decoupled from the exact prompt template.
    const match = args.user.match(/^User command: ("(?:[^"\\]|\\.)*")/);
    const fallback = JSON.stringify({
      intent: 'complex_request' satisfies IntentName,
      entities: {},
      confidence: 0.95,
      missingSlots: [],
    });
    if (!match || !match[1]) return fallback;
    let text: string;
    try {
      text = JSON.parse(match[1]) as string;
    } catch {
      return fallback;
    }
    const intent = table.get(text) ?? 'complex_request';
    return JSON.stringify({
      intent,
      entities: {},
      confidence: 0.95,
      missingSlots: [],
    });
  };
}

describe('intent fixture — schema shape', () => {
  it('contains exactly 60 labeled examples', () => {
    expect(INTENT_EXAMPLES.length).toBe(60);
  });

  it('covers all 15 intents with at least 4 examples each', () => {
    const counts: Record<string, number> = {};
    for (const ex of INTENT_EXAMPLES) {
      counts[ex.intent] = (counts[ex.intent] ?? 0) + 1;
    }
    for (const name of INTENT_NAMES) {
      expect(counts[name], `intent ${name} needs >=4 examples`).toBeGreaterThanOrEqual(4);
    }
  });

  it('has no duplicate example texts', () => {
    const seen = new Set<string>();
    for (const ex of INTENT_EXAMPLES) {
      expect(seen.has(ex.text), `duplicate fixture text: ${ex.text}`).toBe(false);
      seen.add(ex.text);
    }
  });

  it('uses only valid intent names', () => {
    const valid = new Set<string>(INTENT_NAMES);
    for (const ex of INTENT_EXAMPLES) {
      expect(valid.has(ex.intent), `invalid intent ${ex.intent} for "${ex.text}"`).toBe(true);
    }
  });
});

describe('intent fixture — classifier accuracy gate (>=90%)', () => {
  it('classifies >=54/60 examples correctly against the canned mock', async () => {
    const complete = makeFixtureResponder(INTENT_EXAMPLES);
    const classifier = createIntentClassifier({ complete });

    let correct = 0;
    const failures: { text: string; expected: IntentName; got: IntentName }[] = [];
    for (const ex of INTENT_EXAMPLES) {
      const result = await classifier.classify(ex.text, { companyId: 'c_fixture' });
      if (result.intent === ex.intent) {
        correct++;
      } else {
        failures.push({ text: ex.text, expected: ex.intent, got: result.intent });
      }
    }
    const accuracy = correct / INTENT_EXAMPLES.length;
    if (accuracy < 0.9) {
      console.error('Fixture classifier failures:', failures);
    }
    expect(accuracy).toBeGreaterThanOrEqual(0.9);
    expect(correct).toBeGreaterThanOrEqual(54);
  });

  it('hits 100% accuracy on the deterministic mock (sanity check)', async () => {
    const complete = makeFixtureResponder(INTENT_EXAMPLES);
    const classifier = createIntentClassifier({ complete });
    let correct = 0;
    for (const ex of INTENT_EXAMPLES) {
      const result = await classifier.classify(ex.text, { companyId: 'c_fixture' });
      if (result.intent === ex.intent) correct++;
    }
    expect(correct).toBe(INTENT_EXAMPLES.length);
  });
});
