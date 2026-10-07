/**
 * Unit tests for the production command-palette classifier seam.
 *
 * Regression context (audit P1): the composition root used to hand
 * `createIntentClassifier` a `complete()` closure that ignored its
 * prompts and always returned a canned `complex_request` JSON with
 * `confidence: 0`. No model was ever called, so none of the 14
 * structured intents (hire / fire / assign / …) could resolve outside
 * test mode — every palette command fell through to the agentic loop.
 *
 * These tests pin the wired behaviour:
 *   - the company's system-agent provider is resolved and its streamed
 *     reply is what the classifier parses;
 *   - the classifier's system + user prompts reach the provider;
 *   - when no provider can be resolved (no system agent, resolver or
 *     stream throws) the completer degrades to the canned
 *     `complex_request` reply and logs once, so the palette keeps working.
 */

import type { ProviderStreamEvent, ProviderStreamFn } from '@team-x/provider-router';
import { describe, expect, it, vi } from 'vitest';

import {
  CLASSIFIER_FALLBACK_REPLY,
  createClassifierCompleteFor,
  createPaletteIntentClassifier,
} from './palette-classifier.js';

interface FakeEmployee {
  id: string;
  companyId: string;
}

/** Provider stream that yields `reply` in two deltas and records its args. */
function cannedStream(reply: string): {
  stream: ProviderStreamFn;
  calls: Array<Parameters<ProviderStreamFn>[0]>;
} {
  const calls: Array<Parameters<ProviderStreamFn>[0]> = [];
  const stream: ProviderStreamFn = async function* (args): AsyncGenerator<ProviderStreamEvent> {
    calls.push(args);
    const mid = Math.floor(reply.length / 2);
    yield { delta: reply.slice(0, mid) };
    yield { delta: reply.slice(mid) };
    yield { done: true, usage: { promptTokens: 1, completionTokens: 1 } };
  };
  return { stream, calls };
}

function makeDeps(overrides: {
  stream?: ProviderStreamFn;
  findSystemAgent?: (companyId: string) => FakeEmployee | null;
  resolveProvider?: (employee: FakeEmployee) => Promise<{ stream: ProviderStreamFn }>;
}) {
  const warn = vi.fn();
  const resolveProvider = vi.fn(
    overrides.resolveProvider ??
      (async () => ({ stream: overrides.stream ?? cannedStream('{}').stream })),
  );
  const findSystemAgent = vi.fn(
    overrides.findSystemAgent ??
      ((companyId: string): FakeEmployee | null => ({ id: `sys-${companyId}`, companyId })),
  );
  return { deps: { findSystemAgent, resolveProvider, logger: { warn } }, warn, resolveProvider };
}

describe('createClassifierCompleteFor', () => {
  it("returns the model's accumulated reply for the company's system agent", async () => {
    const reply = JSON.stringify({ intent: 'fire_employee', entities: {}, confidence: 0.9 });
    const { stream } = cannedStream(reply);
    const { deps, resolveProvider } = makeDeps({ stream });

    const complete = createClassifierCompleteFor(deps)('co-1');
    const out = await complete({ system: 'SYS', user: 'USER' });

    expect(out).toBe(reply);
    expect(resolveProvider).toHaveBeenCalledWith({ id: 'sys-co-1', companyId: 'co-1' });
  });

  it('passes the classifier system prompt and user prompt to the provider', async () => {
    const { stream, calls } = cannedStream('{}');
    const { deps } = makeDeps({ stream });

    await createClassifierCompleteFor(deps)('co-1')({
      system: 'You classify intents.',
      user: 'Fire James',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.system).toBe('You classify intents.');
    expect(calls[0]?.messages).toEqual([{ role: 'user', content: 'Fire James' }]);
  });

  it('falls back to the canned complex_request reply when the company has no system agent', async () => {
    const { deps, warn, resolveProvider } = makeDeps({ findSystemAgent: () => null });

    const out = await createClassifierCompleteFor(deps)('co-1')({ system: 's', user: 'u' });

    expect(out).toBe(CLASSIFIER_FALLBACK_REPLY);
    expect(JSON.parse(out)).toEqual({
      intent: 'complex_request',
      entities: {},
      confidence: 0,
      missingSlots: [],
    });
    expect(resolveProvider).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('falls back when provider resolution throws, logging only once across calls', async () => {
    const { deps, warn } = makeDeps({
      resolveProvider: async () => {
        throw new Error('no API key');
      },
    });
    const completeFor = createClassifierCompleteFor(deps);

    expect(await completeFor('co-1')({ system: 's', user: 'u' })).toBe(CLASSIFIER_FALLBACK_REPLY);
    expect(await completeFor('co-2')({ system: 's', user: 'u' })).toBe(CLASSIFIER_FALLBACK_REPLY);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('falls back when the provider stream errors mid-reply', async () => {
    const broken: ProviderStreamFn = async function* () {
      yield { delta: '{"intent":' };
      throw new Error('socket hang up');
    };
    const { deps, warn } = makeDeps({ stream: broken });

    const out = await createClassifierCompleteFor(deps)('co-1')({ system: 's', user: 'u' });

    expect(out).toBe(CLASSIFIER_FALLBACK_REPLY);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('createPaletteIntentClassifier', () => {
  it("resolves a structured intent from the model reply for the palette's company", async () => {
    const reply = JSON.stringify({
      intent: 'assign_ticket',
      entities: { ticketQuery: 'auth bug', assigneeQuery: 'Sarah' },
      confidence: 0.92,
      missingSlots: [],
    });
    const { stream } = cannedStream(reply);
    const { deps } = makeDeps({ stream });
    const findSystemAgent = deps.findSystemAgent;

    const classifier = createPaletteIntentClassifier({
      completeFor: createClassifierCompleteFor(deps),
    });
    const result = await classifier.classify('Assign the auth bug to Sarah', {
      companyId: 'co-7',
    });

    expect(result.intent).toBe('assign_ticket');
    expect(result.entities).toEqual({ ticketQuery: 'auth bug', assigneeQuery: 'Sarah' });
    expect(findSystemAgent).toHaveBeenCalledWith('co-7');
  });

  it('degrades to complex_request when no provider is available', async () => {
    const { deps } = makeDeps({ findSystemAgent: () => null });
    const classifier = createPaletteIntentClassifier({
      completeFor: createClassifierCompleteFor(deps),
    });

    const result = await classifier.classify('Fire James', { companyId: 'co-1' });

    expect(result.intent).toBe('complex_request');
    expect(result.confidence).toBe(0);
  });
});
