/**
 * enhancedAi.* handlers — argument pass-through.
 *
 * `query` and `queryKnowledge` used to drop the caller's `companyId` (and
 * `query` its `usePlanning`), so every call ran against a company that does
 * not exist and came back with no context.
 */

import { describe, expect, it, vi } from 'vitest';

import type { EnhancedAiService } from '../services/enhanced-ai.js';

import { buildEnhancedAiHandlers } from './enhanced-ai-handlers.js';

function fakeService() {
  return {
    enhancedQuery: vi.fn(async () => ({ answer: 'a', context: [] })),
    queryKnowledge: vi.fn(() => ({ nodes: [], edges: [] })),
  } as unknown as EnhancedAiService & {
    enhancedQuery: ReturnType<typeof vi.fn>;
    queryKnowledge: ReturnType<typeof vi.fn>;
  };
}

describe('buildEnhancedAiHandlers', () => {
  it('passes companyId and usePlanning through to enhancedQuery', async () => {
    const service = fakeService();
    const handlers = buildEnhancedAiHandlers({ enhancedAiService: service });

    await handlers.query({ query: 'q', companyId: 'co-1', topK: 3, usePlanning: true });

    expect(service.enhancedQuery).toHaveBeenCalledWith('q', {
      companyId: 'co-1',
      topK: 3,
      threshold: undefined,
      includeRelated: undefined,
      usePlanning: true,
    });
  });

  it('passes companyId through to queryKnowledge', () => {
    const service = fakeService();
    const handlers = buildEnhancedAiHandlers({ enhancedAiService: service });

    handlers.queryKnowledge({ query: 'Dana', companyId: 'co-1' });

    expect(service.queryKnowledge).toHaveBeenCalledWith('Dana', {
      companyId: 'co-1',
      maxDepth: undefined,
      maxResults: undefined,
    });
  });
});
