import { describe, expect, it, vi } from 'vitest';
import {
  type ComposeDeps,
  type RecentMessage,
  composeSystemPromptWithRag,
} from './system-prompt.js';
import type { RetrievalEvidencePack } from './retrieval-orchestrator.js';

function makeDeps(overrides: Partial<ComposeDeps> = {}): ComposeDeps {
  return {
    renderRoleSystemPrompt: vi.fn(async () => 'You are a CEO.'),
    isRagEnabled: () => true,
    getRecentUserMessages: (): RecentMessage[] => [
      { id: 'u1', content: 'What is our Q3 plan?', sourceId: 'u1' },
    ],
    retrieveEvidence: vi.fn(async (): Promise<RetrievalEvidencePack> => ({
      queries: ['What is our Q3 plan?'],
      entries: [
        {
          sourceType: 'ticket',
          sourceId: 'T-42',
          chunkIndex: 0,
          contentText: 'Q3 launch',
          score: 0.8,
          reasons: ['semantic'],
        },
      ],
    })),
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
    expect(deps.retrieveEvidence).not.toHaveBeenCalled();
  });

  it('returns plain role prompt when no recent user messages', async () => {
    const deps = makeDeps({ getRecentUserMessages: () => [] });
    const prompt = await composeSystemPromptWithRag(deps, {
      employeeId: 'e1',
      companyId: 'c1',
      threadId: 't1',
    });
    expect(prompt).toBe('You are a CEO.');
    expect(deps.retrieveEvidence).not.toHaveBeenCalled();
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

  it('returns plain role prompt when evidence retrieval yields no entries', async () => {
    const deps = makeDeps({
      retrieveEvidence: vi.fn(async (): Promise<RetrievalEvidencePack> => ({
        queries: ['What is our Q3 plan?'],
        entries: [],
      })),
    });
    const prompt = await composeSystemPromptWithRag(deps, {
      employeeId: 'e1',
      companyId: 'c1',
      threadId: 't1',
    });
    expect(prompt).toBe('You are a CEO.');
  });

  it('passes recent messages through to evidence retrieval', async () => {
    const retrieveEvidence = vi.fn(async (): Promise<RetrievalEvidencePack> => ({
      queries: ['already in thread'],
      entries: [],
    }));
    const deps = makeDeps({
      retrieveEvidence,
      getRecentUserMessages: () => [{ id: 'm1', content: 'already in thread', sourceId: 'm1' }],
    });
    await composeSystemPromptWithRag(deps, {
      employeeId: 'e1',
      companyId: 'c1',
      threadId: 't1',
    });
    expect(retrieveEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        recentMessages: [{ id: 'm1', content: 'already in thread', sourceId: 'm1' }],
        excludeSourceIds: ['m1'],
      }),
    );
  });
});
