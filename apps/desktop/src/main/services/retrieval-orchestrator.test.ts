import { describe, expect, it } from 'vitest';

import {
  type RetrievalOrchestratorDeps,
  createRetrievalOrchestrator,
  formatEvidenceLine,
  shapeRetrievalQueries,
} from './retrieval-orchestrator.js';

function makeDeps(overrides: Partial<RetrievalOrchestratorDeps> = {}): RetrievalOrchestratorDeps {
  return {
    vectorRetrieve: async () => [],
    listTickets: () => [],
    listGoals: () => [],
    listProjects: () => [],
    searchVault: () => [],
    getVaultFile: () => null,
    now: () => Date.UTC(2026, 3, 21, 12, 0, 0),
    ...overrides,
  };
}

describe('shapeRetrievalQueries', () => {
  it('builds direct, combined, and condensed queries from recent messages', () => {
    const queries = shapeRetrievalQueries([
      {
        id: 'u1',
        content: 'Need context on Q3 launch blockers.',
        sourceId: 'u1',
      },
      {
        id: 'u2',
        content: 'Why is the CMO onboarding stuck right now?',
        sourceId: 'u2',
      },
    ]);

    expect(queries[0]).toBe('Why is the CMO onboarding stuck right now?');
    expect(queries[1]).toContain('Need context on Q3 launch blockers.');
    expect(queries[1]).toContain('Why is the CMO onboarding stuck right now?');
    expect(queries[2]).toBe('cmo onboarding stuck right now');
  });
});

describe('createRetrievalOrchestrator', () => {
  it('reranks authoritative structured sources above conversational fragments', async () => {
    const orchestrator = createRetrievalOrchestrator(
      makeDeps({
        vectorRetrieve: async () => [
          {
            sourceType: 'message',
            sourceId: 'msg-1',
            chunkIndex: 0,
            contentText: 'Conversation noted that onboarding feels stuck.',
            similarity: 0.96,
          },
        ],
        listTickets: () => [
          {
            id: 'T-42',
            title: 'CMO onboarding blocked',
            description: 'Offer letter approval is missing, blocking onboarding.',
            status: 'blocked',
            priority: 'high',
            assigneeId: 'emp-coo',
            labelsJson: '["onboarding","cmo"]',
            dueAt: null,
            slaHours: 24,
            updatedAt: Date.UTC(2026, 3, 21, 10, 0, 0),
          },
        ],
      }),
    );

    const result = await orchestrator.retrieveEvidence({
      companyId: 'co-1',
      recentMessages: [
        {
          id: 'u1',
          content: 'Why is T-42 onboarding stuck for the CMO?',
          sourceId: 'u1',
        },
      ],
      excludeSourceIds: ['u1'],
      config: { topK: 3, threshold: 0.3, maxTokens: 200 },
      countTokens: (text) => text.split(/\s+/).filter(Boolean).length,
    });

    expect(result.entries[0]?.sourceType).toBe('ticket');
    expect(result.entries[0]?.sourceId).toBe('T-42');
    expect(result.entries.some((entry) => entry.sourceType === 'message')).toBe(true);
  });

  it('deduplicates by source and respects per-source-type caps', async () => {
    const orchestrator = createRetrievalOrchestrator(
      makeDeps({
        vectorRetrieve: async () => [
          {
            sourceType: 'ticket',
            sourceId: 'T-1',
            chunkIndex: 0,
            contentText: 'Ticket chunk one',
            similarity: 0.8,
          },
          {
            sourceType: 'ticket',
            sourceId: 'T-1',
            chunkIndex: 1,
            contentText: 'Ticket chunk two',
            similarity: 0.79,
          },
          {
            sourceType: 'goal',
            sourceId: 'G-1',
            chunkIndex: 0,
            contentText: 'Goal chunk',
            similarity: 0.74,
          },
        ],
        listTickets: () => [
          {
            id: 'T-1',
            title: 'Launch blocker',
            description: 'Waiting on final legal sign-off.',
            status: 'blocked',
            priority: 'high',
            assigneeId: null,
            labelsJson: '[]',
            dueAt: null,
            slaHours: null,
            updatedAt: Date.UTC(2026, 3, 21, 8, 0, 0),
          },
        ],
        listGoals: () => [
          {
            id: 'G-1',
            title: 'Ship launch program',
            description: 'Coordinate all teams for the release.',
            status: 'active',
            targetDate: null,
            updatedAt: Date.UTC(2026, 3, 20, 8, 0, 0),
          },
        ],
        listProjects: () => [
          {
            id: 'P-1',
            title: 'Launch operations',
            description: 'Drive the launch checklist.',
            status: 'active',
            priority: 'high',
            goalId: 'G-1',
            leadId: 'emp-ops',
            updatedAt: Date.UTC(2026, 3, 19, 8, 0, 0),
          },
        ],
      }),
    );

    const result = await orchestrator.retrieveEvidence({
      companyId: 'co-1',
      recentMessages: [
        {
          id: 'u1',
          content: 'Give me the T-1 blocker, G-1 goal, and P-1 project status.',
          sourceId: 'u1',
        },
      ],
      excludeSourceIds: ['u1'],
      config: { topK: 5, threshold: 0.3, maxTokens: 200, maxPerSourceType: 1 },
      countTokens: (text) => text.split(/\s+/).filter(Boolean).length,
    });

    expect(result.entries.filter((entry) => entry.sourceType === 'ticket')).toHaveLength(1);
    expect(result.entries.filter((entry) => entry.sourceType === 'goal')).toHaveLength(1);
    expect(result.entries.filter((entry) => entry.sourceType === 'project')).toHaveLength(1);
  });

  it('fits oversized evidence into the token budget', async () => {
    const orchestrator = createRetrievalOrchestrator(
      makeDeps({
        vectorRetrieve: async () => [
          {
            sourceType: 'ticket',
            sourceId: 'T-999',
            chunkIndex: 0,
            contentText: `Ticket ${'word '.repeat(160)}`.trim(),
            similarity: 0.9,
          },
        ],
      }),
    );

    const result = await orchestrator.retrieveEvidence({
      companyId: 'co-1',
      recentMessages: [{ id: 'u1', content: 'What is T-999?', sourceId: 'u1' }],
      excludeSourceIds: ['u1'],
      config: { topK: 2, threshold: 0.3, maxTokens: 20 },
      countTokens: (text) => text.split(/\s+/).filter(Boolean).length,
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.contentText.endsWith('...')).toBe(true);
    expect(
      result.entries.every(
        (entry) => formatEvidenceLine(entry).split(/\s+/).filter(Boolean).length <= 20,
      ),
    ).toBe(true);
  });
});
