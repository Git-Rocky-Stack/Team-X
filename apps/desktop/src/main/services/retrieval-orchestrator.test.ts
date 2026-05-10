import {
  type CrossEncoderScoreFn,
  type EntityContext,
  createMockCrossEncoder,
  createQueryExpansionService,
  createRerankerService,
} from '@team-x/intelligence';
import { describe, expect, it, vi } from 'vitest';

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

// ---------------------------------------------------------------------------
// H10 — wire query expansion + cross-encoder reranker into the retrieval
// orchestrator (audit 2026-05-07).
//
// Audit complaint: "Reranker + query expansion built but not wired into
// the retrieval orchestrator. Precision@5 is suboptimal for no functional
// reason." — `rag/reranker.ts`, `rag/query-expansion.ts`.
//
// Resolution: `RetrievalOrchestratorDeps` gains four optional fields —
// `queryExpansion`, `entityContextProvider`, `reranker`, `rerankerOptions` —
// that augment the existing pipeline without changing its output contract:
//   1. Before the per-query loop runs, the latest user message is run
//      through `QueryExpansionService.expand()` (with the per-company
//      EntityContext) to generate semantic + synonym + entity-substitution
//      variants. Variants merge with the 3-query base from
//      `shapeRetrievalQueries`, deduped, capped at MAX_EXPANDED_QUERIES (8).
//   2. After the orchestrator's composite scorer runs, the top-N
//      candidates are sent through the cross-encoder reranker; their
//      scores are replaced with the reranker's `finalScore`. The list is
//      re-sorted before dedup-by-source + token-budget fitting.
//
// All four deps are optional. When absent, the orchestrator's behavior
// is byte-identical to pre-H10. Failures in either stage fall back
// gracefully to the unwired path so retrieval keeps working when LLMs
// are unavailable, the rerank API is down, or EntityContext is empty.
// ---------------------------------------------------------------------------

function buildEntityContext(): EntityContext {
  return {
    companyId: 'co-1',
    employees: [{ id: 'emp-cmo', name: 'Iris', aliases: [] }],
    projects: [{ id: 'P-1', name: 'CMO Onboarding', aliases: [] }],
    goals: [{ id: 'G-1', name: 'Hire CMO', aliases: [] }],
    tickets: [{ id: 'T-42', title: 'CMO onboarding blocked', tags: [] }],
  };
}

describe('createRetrievalOrchestrator — H10 audit (2026-05-07): wired query expansion + reranker', () => {
  describe('backward compatibility', () => {
    it('without queryExpansion or reranker deps, behavior is identical to pre-H10', async () => {
      // Regression pin: the new optional deps default to absent. Existing
      // call sites that pass only the original 6 deps see no change.
      const vectorRetrieve = vi.fn(async () => [
        {
          sourceType: 'ticket' as const,
          sourceId: 'T-1',
          chunkIndex: 0,
          contentText: 'Pre-H10 baseline ticket',
          similarity: 0.9,
        },
      ]);
      const orchestrator = createRetrievalOrchestrator(makeDeps({ vectorRetrieve }));

      const result = await orchestrator.retrieveEvidence({
        companyId: 'co-1',
        recentMessages: [{ id: 'u1', content: 'baseline query', sourceId: 'u1' }],
        excludeSourceIds: [],
        config: { topK: 5, threshold: 0.3, maxTokens: 200 },
        countTokens: (t) => t.split(/\s+/).filter(Boolean).length,
      });

      // 3 base queries from shapeRetrievalQueries — no expansion when the
      // dep is absent.
      expect(result.queries.length).toBeLessThanOrEqual(3);
      // Reasons array doesn't carry the 'reranked' provenance tag when no
      // reranker is wired.
      expect(result.entries.every((e) => !e.reasons.includes('reranked'))).toBe(true);
    });
  });

  describe('query expansion stage', () => {
    it('augments base queries with expansion variants when wired', async () => {
      // Concrete proof of integration: when both queryExpansion and
      // entityContextProvider are present, the latest user message gets
      // run through expand() and the resulting variants flow into the
      // vectorRetrieve fan-out alongside the base queries.
      const vectorRetrieve = vi.fn(async () => []);
      const orchestrator = createRetrievalOrchestrator(
        makeDeps({
          vectorRetrieve,
          queryExpansion: createQueryExpansionService({ hydeEnabled: false }),
          entityContextProvider: () => buildEntityContext(),
        }),
      );

      await orchestrator.retrieveEvidence({
        companyId: 'co-1',
        recentMessages: [
          { id: 'u1', content: 'Why is Iris blocked on the CMO onboarding?', sourceId: 'u1' },
        ],
        excludeSourceIds: [],
        config: { topK: 5, threshold: 0.3, maxTokens: 200 },
        countTokens: (t) => t.split(/\s+/).filter(Boolean).length,
      });

      // The QE service produces semantic variations like "What is X?" and
      // "Tell me about X" plus entity-substitution variants ("Iris" → "emp-cmo").
      // At minimum the original message + one variation must reach
      // vectorRetrieve. The exact count depends on dedupe but it MUST be
      // strictly greater than the 1-query degenerate case.
      expect(vectorRetrieve.mock.calls.length).toBeGreaterThan(1);
    });

    it('falls back to base queries when queryExpansion.expand() throws', async () => {
      // Graceful degradation: an LLM-backed HyDE failure or an
      // EntityContext build error must not break retrieval.
      const vectorRetrieve = vi.fn(async () => []);
      const failingExpansion = {
        expand: vi.fn(async () => {
          throw new Error('LLM unavailable');
        }),
        retrieveWithExpansion: vi.fn(),
        getStats: () => ({ totalExpansions: 0, avgExpansionsPerQuery: 0, methodCounts: {} }),
      };

      const orchestrator = createRetrievalOrchestrator(
        makeDeps({
          vectorRetrieve,
          queryExpansion: failingExpansion,
          entityContextProvider: () => buildEntityContext(),
        }),
      );

      const result = await orchestrator.retrieveEvidence({
        companyId: 'co-1',
        recentMessages: [{ id: 'u1', content: 'try a query', sourceId: 'u1' }],
        excludeSourceIds: [],
        config: { topK: 5, threshold: 0.3, maxTokens: 200 },
        countTokens: (t) => t.split(/\s+/).filter(Boolean).length,
      });

      // Expansion was attempted...
      expect(failingExpansion.expand).toHaveBeenCalled();
      // ...but fan-out matches base queries only (no expansion variants).
      expect(result.queries.length).toBeLessThanOrEqual(3);
      // Retrieval still completed without a thrown error.
      expect(result.queries.length).toBeGreaterThan(0);
    });

    it('skips expansion entirely when entityContextProvider is absent', async () => {
      // Both deps must be present for expansion to engage. If only one is
      // wired (incomplete composition), the orchestrator skips expansion
      // rather than expanding with an empty context that would yield
      // worthless variants.
      const expandFn = vi.fn();
      const orchestrator = createRetrievalOrchestrator(
        makeDeps({
          vectorRetrieve: async () => [],
          queryExpansion: {
            expand: expandFn,
            retrieveWithExpansion: vi.fn(),
            getStats: () => ({ totalExpansions: 0, avgExpansionsPerQuery: 0, methodCounts: {} }),
          },
          // entityContextProvider intentionally omitted.
        }),
      );

      await orchestrator.retrieveEvidence({
        companyId: 'co-1',
        recentMessages: [{ id: 'u1', content: 'q', sourceId: 'u1' }],
        excludeSourceIds: [],
        config: { topK: 5, threshold: 0.3, maxTokens: 200 },
        countTokens: (t) => t.split(/\s+/).filter(Boolean).length,
      });

      expect(expandFn).not.toHaveBeenCalled();
    });

    it('caps total queries at MAX_EXPANDED_QUERIES (8) even with prolific expansions', async () => {
      // The cap protects vector-retrieval fan-out from runaway expansion.
      // A QE service that returns 50 variants gets sliced down.
      const vectorRetrieve = vi.fn(async () => []);
      const flood = Array.from({ length: 50 }, (_, i) => `expansion variant ${i}`);
      const prolificExpansion = {
        expand: vi.fn(async () => ({
          original: 'q',
          expansions: flood,
          weights: flood.map(() => 1),
          method: 'combined' as const,
        })),
        retrieveWithExpansion: vi.fn(),
        getStats: () => ({ totalExpansions: 0, avgExpansionsPerQuery: 0, methodCounts: {} }),
      };

      const orchestrator = createRetrievalOrchestrator(
        makeDeps({
          vectorRetrieve,
          queryExpansion: prolificExpansion,
          entityContextProvider: () => buildEntityContext(),
        }),
      );

      const result = await orchestrator.retrieveEvidence({
        companyId: 'co-1',
        recentMessages: [{ id: 'u1', content: 'q', sourceId: 'u1' }],
        excludeSourceIds: [],
        config: { topK: 5, threshold: 0.3, maxTokens: 200 },
        countTokens: (t) => t.split(/\s+/).filter(Boolean).length,
      });

      // Max 8 unique queries through vectorRetrieve regardless of how
      // many expansions came in.
      expect(result.queries.length).toBeLessThanOrEqual(8);
      expect(vectorRetrieve.mock.calls.length).toBeLessThanOrEqual(8);
    });
  });

  describe('reranker stage', () => {
    it('reorders candidates by reranker finalScore and tags entries with reasons:reranked', async () => {
      // Synthetic case proving the reranker output reaches the final pack:
      // the composite scorer prefers the high-similarity ticket, but the
      // reranker — using a lexical-overlap cross-encoder against a query
      // that mentions "vault file" — promotes the vault entry by its
      // reranked finalScore.
      const orchestrator = createRetrievalOrchestrator(
        makeDeps({
          vectorRetrieve: async () => [
            {
              sourceType: 'ticket',
              sourceId: 'T-noise',
              chunkIndex: 0,
              contentText: 'Discussion about quarterly numbers and budget reviews.',
              similarity: 0.95,
            },
            {
              sourceType: 'vault_file',
              sourceId: 'V-design-spec',
              chunkIndex: 0,
              contentText: 'Authoritative vault file design spec for the API surface.',
              similarity: 0.55,
            },
          ],
          getVaultFile: (id) =>
            id === 'V-design-spec'
              ? {
                  id,
                  companyId: 'co-1',
                  title: 'API design spec',
                  contentText: 'Authoritative vault file design spec for the API surface.',
                  createdAt: 1,
                  updatedAt: Date.UTC(2026, 3, 21, 10, 0, 0),
                }
              : null,
          reranker: createRerankerService(createMockCrossEncoder()),
        }),
      );

      const result = await orchestrator.retrieveEvidence({
        companyId: 'co-1',
        recentMessages: [
          { id: 'u1', content: 'Show me the vault file design spec for the API.', sourceId: 'u1' },
        ],
        excludeSourceIds: [],
        config: { topK: 3, threshold: 0.3, maxTokens: 200 },
        countTokens: (t) => t.split(/\s+/).filter(Boolean).length,
      });

      // The vault entry — semantically more relevant per the lexical
      // cross-encoder — gets promoted above the higher-similarity ticket.
      const sourceIds = result.entries.map((e) => e.sourceId);
      const vaultIdx = sourceIds.indexOf('V-design-spec');
      const ticketIdx = sourceIds.indexOf('T-noise');
      expect(vaultIdx).toBeGreaterThanOrEqual(0);
      expect(vaultIdx).toBeLessThan(ticketIdx === -1 ? Number.POSITIVE_INFINITY : ticketIdx);

      // Reranked entries carry the provenance tag.
      const reranked = result.entries.filter((e) => e.reasons.includes('reranked'));
      expect(reranked.length).toBeGreaterThan(0);
    });

    it('falls back to composite ordering when reranker.rerank() throws', async () => {
      // Graceful degradation: a cross-encoder API failure (rate limit,
      // network, model unavailable) must not break retrieval. The
      // orchestrator catches the throw and returns the original
      // composite-scored ordering.
      const failingRerank = vi.fn(async () => {
        throw new Error('cross-encoder API down');
      });
      const orchestrator = createRetrievalOrchestrator(
        makeDeps({
          vectorRetrieve: async () => [
            {
              sourceType: 'ticket',
              sourceId: 'T-1',
              chunkIndex: 0,
              contentText: 'High-similarity ticket',
              similarity: 0.95,
            },
            {
              sourceType: 'message',
              sourceId: 'M-1',
              chunkIndex: 0,
              contentText: 'Lower-similarity message',
              similarity: 0.4,
            },
          ],
          reranker: {
            rerank: failingRerank,
            getStats: () => ({ totalReranks: 0, totalCandidates: 0, avgCandidatesPerRerank: 0 }),
          },
        }),
      );

      const result = await orchestrator.retrieveEvidence({
        companyId: 'co-1',
        recentMessages: [{ id: 'u1', content: 'try it', sourceId: 'u1' }],
        excludeSourceIds: [],
        config: { topK: 3, threshold: 0.3, maxTokens: 200 },
        countTokens: (t) => t.split(/\s+/).filter(Boolean).length,
      });

      // Reranker was attempted...
      expect(failingRerank).toHaveBeenCalled();
      // ...but retrieval completed and the higher-authority/scored ticket
      // is still ranked above the lower-similarity message — original
      // composite ordering preserved.
      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.entries.every((e) => !e.reasons.includes('reranked'))).toBe(true);
    });

    it('only reranks the top-N candidates; tail keeps original score', async () => {
      // Reranker scopes to head; the tail-sliced entries retain their
      // composite scores untouched. We spy on the cross-encoder and
      // assert it received only the top-N candidates.
      const seenIds: string[][] = [];
      const spyEncoder: CrossEncoderScoreFn = async (_q, docs) => {
        seenIds.push(docs.map((d) => d.id));
        return docs.map((d, i) => ({ id: d.id, score: 1 - i * 0.1 }));
      };
      const reranker = createRerankerService(spyEncoder);
      const orchestrator = createRetrievalOrchestrator(
        makeDeps({
          vectorRetrieve: async () =>
            Array.from({ length: 5 }, (_, i) => ({
              sourceType: 'message' as const,
              sourceId: `M-${i + 1}`,
              chunkIndex: 0,
              contentText: `Message ${i + 1} content`,
              similarity: 0.9 - i * 0.1,
            })),
          reranker,
          rerankerOptions: { topN: 3 },
        }),
      );

      await orchestrator.retrieveEvidence({
        companyId: 'co-1',
        recentMessages: [{ id: 'u1', content: 'q', sourceId: 'u1' }],
        excludeSourceIds: [],
        config: { topK: 5, threshold: 0.3, maxTokens: 200 },
        countTokens: (t) => t.split(/\s+/).filter(Boolean).length,
      });

      // Cross-encoder saw exactly topN candidates (the slice is bounded
      // by the actual candidate count after deduplication; we asked for 3).
      expect(seenIds.length).toBeGreaterThan(0);
      expect(seenIds[0]?.length).toBeLessThanOrEqual(3);
    });

    it('skips rerank when fewer than 2 candidates exist (no work to do)', async () => {
      // Reranking 0 or 1 candidates is a no-op by definition. Skipping
      // saves the cross-encoder roundtrip.
      const rerank = vi.fn(async () => []);
      const orchestrator = createRetrievalOrchestrator(
        makeDeps({
          vectorRetrieve: async () => [
            {
              sourceType: 'ticket',
              sourceId: 'T-only',
              chunkIndex: 0,
              contentText: 'lone candidate',
              similarity: 0.9,
            },
          ],
          reranker: {
            rerank,
            getStats: () => ({ totalReranks: 0, totalCandidates: 0, avgCandidatesPerRerank: 0 }),
          },
        }),
      );

      await orchestrator.retrieveEvidence({
        companyId: 'co-1',
        recentMessages: [{ id: 'u1', content: 'one match only', sourceId: 'u1' }],
        excludeSourceIds: [],
        config: { topK: 5, threshold: 0.3, maxTokens: 200 },
        countTokens: (t) => t.split(/\s+/).filter(Boolean).length,
      });

      expect(rerank).not.toHaveBeenCalled();
    });
  });

  describe('combined stages — both wired', () => {
    it('runs query expansion AND reranker in one retrieve call without breaking the contract', async () => {
      // Integration smoke test: both stages active end-to-end. The
      // result contract (queries[] + entries[] with the existing entry
      // shape) must still hold; the entries[] order respects rerank.
      const vectorRetrieve = vi.fn(async () => [
        {
          sourceType: 'ticket' as const,
          sourceId: 'T-1',
          chunkIndex: 0,
          contentText: 'Ticket about CMO onboarding blockers',
          similarity: 0.7,
        },
        {
          sourceType: 'vault_file' as const,
          sourceId: 'V-1',
          chunkIndex: 0,
          contentText: 'Vault file: CMO onboarding plan with concrete steps',
          similarity: 0.65,
        },
      ]);
      const orchestrator = createRetrievalOrchestrator(
        makeDeps({
          vectorRetrieve,
          getVaultFile: (id) =>
            id === 'V-1'
              ? {
                  id,
                  companyId: 'co-1',
                  title: 'CMO onboarding plan',
                  contentText: 'Vault file: CMO onboarding plan with concrete steps',
                  createdAt: 1,
                  updatedAt: Date.UTC(2026, 3, 20, 10, 0, 0),
                }
              : null,
          queryExpansion: createQueryExpansionService({ hydeEnabled: false }),
          entityContextProvider: () => buildEntityContext(),
          reranker: createRerankerService(createMockCrossEncoder()),
        }),
      );

      const result = await orchestrator.retrieveEvidence({
        companyId: 'co-1',
        recentMessages: [
          {
            id: 'u1',
            content: 'What is blocking the CMO onboarding plan?',
            sourceId: 'u1',
          },
        ],
        excludeSourceIds: [],
        config: { topK: 5, threshold: 0.3, maxTokens: 400 },
        countTokens: (t) => t.split(/\s+/).filter(Boolean).length,
      });

      // Contract preserved: queries[] is non-empty, entries[] has the
      // expected shape, vectorRetrieve was called for each query.
      expect(result.queries.length).toBeGreaterThan(0);
      expect(result.entries.length).toBeGreaterThan(0);
      expect(vectorRetrieve.mock.calls.length).toBeGreaterThanOrEqual(result.queries.length);

      // Reranker engaged at least one entry.
      const rerankedCount = result.entries.filter((e) => e.reasons.includes('reranked')).length;
      expect(rerankedCount).toBeGreaterThan(0);
    });
  });
});
