import { describe, expect, it, vi } from 'vitest';
import {
  type ComposeDeps,
  type RecentMessage,
  composeSystemPromptWithRag,
} from './system-prompt.js';

function makeDeps(overrides: Partial<ComposeDeps> = {}): ComposeDeps {
  return {
    renderRoleSystemPrompt: vi.fn(async () => 'You are a CEO.'),
    isRagEnabled: () => true,
    getRagConfig: () => ({ topK: 3, threshold: 0.3, maxTokens: 400 }),
    getRecentUserMessages: (): RecentMessage[] => [
      { id: 'u1', content: 'What is our Q3 plan?', sourceId: 'u1' },
    ],
    retrieve: vi.fn(async () => [
      {
        sourceType: 'ticket',
        sourceId: 'T-42',
        chunkIndex: 0,
        contentText: 'Q3 launch',
        similarity: 0.8,
      },
    ]),
    countTokens: (s: string) => s.split(/\s+/).length,
    ...overrides,
  };
}

describe('composeSystemPromptWithRag', () => {
  it('returns plain role prompt when RAG disabled', async () => {
    const deps = makeDeps({ isRagEnabled: () => false });
    const prompt = await composeSystemPromptWithRag(deps, {
      employeeId: 'e1',
      companyId: 'c1',
      threadId: 't1',
    });
    expect(prompt).toBe('You are a CEO.');
    expect(deps.retrieve).not.toHaveBeenCalled();
  });

  it('returns plain role prompt when no recent user messages', async () => {
    const deps = makeDeps({ getRecentUserMessages: () => [] });
    const prompt = await composeSystemPromptWithRag(deps, {
      employeeId: 'e1',
      companyId: 'c1',
      threadId: 't1',
    });
    expect(prompt).toBe('You are a CEO.');
    expect(deps.retrieve).not.toHaveBeenCalled();
  });

  it('appends a Relevant Context block when retrieval yields hits', async () => {
    const deps = makeDeps();
    const prompt = await composeSystemPromptWithRag(deps, {
      employeeId: 'e1',
      companyId: 'c1',
      threadId: 't1',
    });
    expect(prompt).toContain('You are a CEO.');
    expect(prompt).toContain('## Relevant Context');
    expect(prompt).toContain('[Source: ticket T-42]');
    expect(prompt).toContain('Q3 launch');
  });

  it('enforces maxTokens by truncating the context block', async () => {
    const long = 'word '.repeat(500);
    const deps = makeDeps({
      retrieve: vi.fn(async () => [
        {
          sourceType: 'ticket',
          sourceId: 'T-1',
          chunkIndex: 0,
          contentText: long,
          similarity: 0.9,
        },
        {
          sourceType: 'ticket',
          sourceId: 'T-2',
          chunkIndex: 0,
          contentText: long,
          similarity: 0.85,
        },
      ]),
      getRagConfig: () => ({ topK: 3, threshold: 0.3, maxTokens: 50 }),
    });
    const prompt = await composeSystemPromptWithRag(deps, {
      employeeId: 'e1',
      companyId: 'c1',
      threadId: 't1',
    });
    const sourceCount = (prompt.match(/\[Source:/g) ?? []).length;
    expect(sourceCount).toBeLessThanOrEqual(1);
  });

  it('dedups hits whose sourceId appears in excluded list', async () => {
    const retrieve = vi.fn(async () => [
      { sourceType: 'message', sourceId: 'm1', chunkIndex: 0, contentText: 'X', similarity: 0.9 },
    ]);
    const deps = makeDeps({
      retrieve,
      getRecentUserMessages: () => [{ id: 'm1', content: 'already in thread', sourceId: 'm1' }],
    });
    const prompt = await composeSystemPromptWithRag(deps, {
      employeeId: 'e1',
      companyId: 'c1',
      threadId: 't1',
    });
    expect(prompt).not.toContain('[Source: message m1]');
    expect(retrieve).toHaveBeenCalledWith(
      expect.objectContaining({ excludeSourceIds: expect.arrayContaining(['m1']) }),
    );
  });
});
