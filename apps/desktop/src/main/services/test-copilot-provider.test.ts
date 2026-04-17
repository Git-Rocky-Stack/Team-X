import { beforeEach, describe, expect, it } from 'vitest';

import type { CopilotAnalyzerCompleteRequest } from './copilot-analyzer-service.js';
import {
  FIXTURE_COPILOT_EMPTY,
  TEST_COPILOT_MODEL,
  TEST_COPILOT_PROVIDER,
  TEST_COPILOT_SENTINEL,
  addCopilotFixture,
  clearCopilotFixtures,
  createTestCopilotComplete,
} from './test-copilot-provider.js';

function buildReq(user: string, system = 'SYS'): CopilotAnalyzerCompleteRequest {
  return { system, user, signal: new AbortController().signal };
}

describe('createTestCopilotComplete', () => {
  beforeEach(() => clearCopilotFixtures());

  it('echoes a sentinel payload verbatim', async () => {
    const complete = createTestCopilotComplete();
    const payload = JSON.stringify([
      {
        category: 'workload',
        severity: 'warn',
        title: 'Frontend overloaded',
        body: 'Three blocked tickets piled up this week.',
      },
    ]);
    const r = await complete(buildReq(`please analyze ${TEST_COPILOT_SENTINEL}${payload}`));
    // Round-trip through JSON so whitespace / encoding is normalized,
    // but the structural payload is byte-equivalent.
    expect(JSON.parse(r.text)).toEqual(JSON.parse(payload));
  });

  it('hits a canned-table fixture by normalized prompt substring', async () => {
    addCopilotFixture(
      'Frontend Team  IS behind',
      '[{"category":"workload","severity":"warn","title":"fe-lag","body":"behind"}]',
    );
    const complete = createTestCopilotComplete();
    const r = await complete(buildReq('Please analyze why the frontend team is  BEHIND today.'));
    expect(r.text).toContain('fe-lag');
    expect(r.text).toContain('workload');
  });

  it('returns FIXTURE_COPILOT_EMPTY when no tier matches', async () => {
    const complete = createTestCopilotComplete();
    const r = await complete(buildReq('a prompt the seam has never seen before'));
    expect(r).toEqual(FIXTURE_COPILOT_EMPTY);
    expect(r.text).toBe('[]');
  });

  it('rejects an empty or whitespace-only user prompt with an Error', async () => {
    const complete = createTestCopilotComplete();
    await expect(complete(buildReq(''))).rejects.toThrow(/empty user prompt/);
    await expect(complete(buildReq('   \t\n '))).rejects.toThrow(/empty user prompt/);
  });

  it('records test-mode provider + model on every tier', async () => {
    addCopilotFixture('table-hit-key', '[]');
    const complete = createTestCopilotComplete();
    const sentinel = await complete(buildReq(`${TEST_COPILOT_SENTINEL}[]`));
    const table = await complete(buildReq('prompt containing table-hit-key inside it'));
    const fallback = await complete(buildReq('totally unmatched drift'));
    for (const r of [sentinel, table, fallback]) {
      expect(r.provider).toBe(TEST_COPILOT_PROVIDER);
      expect(r.model).toBe(TEST_COPILOT_MODEL);
      expect(r.costUsd).toBe(0);
    }
  });
});
