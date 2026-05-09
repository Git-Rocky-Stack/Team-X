import type { LoopCompleteRequest } from '@team-x/intelligence';
import { describe, expect, it } from 'vitest';

import {
  ECHO_AGENT_SENTINEL,
  TEST_AGENT_MODEL,
  TEST_AGENT_PROVIDER,
  createTestAgenticCompleteFn,
} from './test-agentic-provider.js';

function buildReq(userText: string, extraSystem = 'SYS'): LoopCompleteRequest {
  return {
    system: extraSystem,
    messages: [{ role: 'user', content: userText }],
    tools: [],
    signal: new AbortController().signal,
  };
}

describe('createTestAgenticCompleteFn', () => {
  it('returns the full scripted sequence for a canned prompt', async () => {
    const complete = createTestAgenticCompleteFn();
    const a = await complete(buildReq('why is the frontend team behind?'));
    const b = await complete(buildReq('why is the frontend team behind?'));
    const c = await complete(buildReq('why is the frontend team behind?'));
    // Step 1: tool-call to query_employees, no final answer yet.
    expect(a.toolCalls.map((t) => t.toolName)).toContain('query_employees');
    expect(a.text).toContain('first list the frontend team');
    // Step 2: tool-call to query_tickets.
    expect(b.toolCalls.map((t) => t.toolName)).toContain('query_tickets');
    // Step 3: final-answer (no tool-calls).
    expect(c.toolCalls).toHaveLength(0);
    expect(c.text).toMatch(/3 open tickets/);
  });

  it('clamps to the final script entry after exhaustion', async () => {
    const complete = createTestAgenticCompleteFn();
    for (let i = 0; i < 3; i += 1) {
      await complete(buildReq('why is the frontend team behind?'));
    }
    const extra = await complete(buildReq('why is the frontend team behind?'));
    expect(extra.toolCalls).toHaveLength(0);
    expect(extra.text).toMatch(/3 open tickets/);
  });

  it('falls back to a single final-answer when no script matches', async () => {
    const complete = createTestAgenticCompleteFn();
    const r = await complete(buildReq('what the model has never seen before'));
    expect(r.toolCalls).toHaveLength(0);
    expect(r.text).toMatch(/canned response/);
  });

  it('honors a structured sentinel override on the first user message', async () => {
    const complete = createTestAgenticCompleteFn();
    const payload = JSON.stringify([
      { text: '', toolCalls: [{ toolName: 'query_employees', args: {} }] },
      { text: 'sentinel-done' },
    ]);
    const req = buildReq(`hello ${ECHO_AGENT_SENTINEL}${payload}`);
    const r1 = await complete(req);
    const r2 = await complete(req);
    expect(r1.toolCalls.map((t) => t.toolName)).toContain('query_employees');
    expect(r2.toolCalls).toHaveLength(0);
    expect(r2.text).toBe('sentinel-done');
  });

  it('honors a legacy-string sentinel override (back-compat with pre-C2 specs)', async () => {
    const complete = createTestAgenticCompleteFn();
    const payload = JSON.stringify([
      '{"action":"query_employees","args":{}}',
      '{"action":"final_answer","answer":"legacy-done"}',
    ]);
    const req = buildReq(`hello ${ECHO_AGENT_SENTINEL}${payload}`);
    const r1 = await complete(req);
    const r2 = await complete(req);
    expect(r1.toolCalls.map((t) => t.toolName)).toContain('query_employees');
    expect(r2.toolCalls).toHaveLength(0);
    expect(r2.text).toBe('legacy-done');
  });

  it('rejects pre-aborted requests without consuming script state', async () => {
    const complete = createTestAgenticCompleteFn();
    const ac = new AbortController();
    ac.abort();
    await expect(
      complete({
        system: 'x',
        messages: [{ role: 'user', content: 'why is the frontend team behind?' }],
        tools: [],
        signal: ac.signal,
      }),
    ).rejects.toThrow();

    // Subsequent call with a fresh signal still gets script index 0.
    const r = await complete(buildReq('why is the frontend team behind?'));
    expect(r.toolCalls.map((t) => t.toolName)).toContain('query_employees');
  });

  it('records the test provider and model identity on every completion', async () => {
    const complete = createTestAgenticCompleteFn();
    const r = await complete(buildReq('who is on the team?'));
    expect(r.provider).toBe(TEST_AGENT_PROVIDER);
    expect(r.model).toBe(TEST_AGENT_MODEL);
    expect(r.costUsd).toBe(0);
    expect(r.usage.promptTokens).toBeGreaterThan(0);
    expect(r.usage.completionTokens).toBeGreaterThan(0);
  });

  it('options.fixtures override canned table entries', async () => {
    const complete = createTestAgenticCompleteFn({
      fixtures: {
        'why is the frontend team behind?': [{ text: 'overridden' }],
      },
    });
    const r = await complete(buildReq('why is the frontend team behind?'));
    expect(r.text).toBe('overridden');
    expect(r.toolCalls).toHaveLength(0);
  });

  it('rejects a malformed sentinel JSON array and falls through to fallback', async () => {
    const complete = createTestAgenticCompleteFn();
    const r = await complete(buildReq(`${ECHO_AGENT_SENTINEL}{not-an-array}`));
    expect(r.toolCalls).toHaveLength(0);
    expect(r.text).toMatch(/canned response/);
  });
});
