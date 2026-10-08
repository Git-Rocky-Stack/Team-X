/**
 * Enhanced AI memory repos — one contract, two implementations.
 *
 * Every case runs against the package's in-memory repo AND the SQL repo, so
 * the persistent store is held to exactly the behaviour the intelligence
 * services were written against. A further block proves the point of the SQL
 * repo: what one service instance writes, the next one (the next app launch)
 * reads back, and a deleted company takes its memory with it.
 */

import {
  type ConversationSummary,
  type ExtractedFact,
  type KnowledgeEdge,
  type KnowledgeGraphRepo,
  type KnowledgeNode,
  type LongTermMemoryRepo,
  createInMemoryGraphRepo,
  createInMemoryMemoryRepo,
  createKnowledgeGraphService,
} from '@team-x/intelligence';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { createCompaniesRepo } from './companies.js';
import { createEnhancedAiKnowledgeRepo, createEnhancedAiMemoryRepo } from './enhanced-ai-memory.js';

interface Fixture {
  memory: LongTermMemoryRepo;
  graph: KnowledgeGraphRepo;
  companyId: string;
  otherCompanyId: string;
  close: () => void;
}

const IMPLEMENTATIONS: Array<[string, () => Promise<Fixture>]> = [
  [
    'in-memory',
    async () => ({
      memory: createInMemoryMemoryRepo(),
      graph: createInMemoryGraphRepo(),
      companyId: 'co-a',
      otherCompanyId: 'co-b',
      close: () => undefined,
    }),
  ],
  [
    'sql',
    async () => {
      const ctx = await makeTestDb();
      const companies = createCompaniesRepo(ctx.db);
      return {
        memory: createEnhancedAiMemoryRepo(ctx.db),
        graph: createEnhancedAiKnowledgeRepo(ctx.db),
        companyId: companies.create({ name: 'A', slug: 'a' }),
        otherCompanyId: companies.create({ name: 'B', slug: 'b' }),
        close: () => ctx.close(),
      };
    },
  ],
];

function fact(companyId: string, overrides: Partial<ExtractedFact> = {}): ExtractedFact {
  return {
    id: 'f1',
    companyId,
    sourceId: 's1',
    fact: 'Dana owns the billing migration',
    type: 'relationship',
    confidence: 0.9,
    entities: ['Dana', 'billing migration'],
    observedAt: 1,
    extractedAt: 1,
    accessCount: 0,
    lastAccessedAt: 1,
    ...overrides,
  };
}

function summary(companyId: string, overrides: Partial<ConversationSummary> = {}) {
  return {
    id: 'sum1',
    companyId,
    sourceId: 's1',
    title: 'Sync',
    summary: 'Discussed the billing migration.',
    topics: ['billing'],
    entities: ['Dana'],
    conversationStart: 1,
    conversationEnd: 2,
    messageCount: 4,
    createdAt: 3,
    ...overrides,
  } as ConversationSummary;
}

function node(companyId: string, id: string, label: string, sourceId = 's1'): KnowledgeNode {
  return {
    id,
    companyId,
    type: 'entity',
    label,
    factIds: ['f1'],
    createdAt: 1,
    updatedAt: 1,
    accessCount: 0,
    metadata: { sourceId },
  };
}

function edge(
  companyId: string,
  id: string,
  from: string,
  to: string,
  sourceId = 's1',
): KnowledgeEdge {
  return {
    id,
    companyId,
    fromNodeId: from,
    toNodeId: to,
    relation: 'related_to',
    weight: 0.5,
    observedAt: 1,
    factIds: ['f1'],
    metadata: { sourceId },
  } as KnowledgeEdge;
}

describe.each(IMPLEMENTATIONS)('enhanced AI memory contract — %s', (_name, make) => {
  let fx: Fixture;

  beforeEach(async () => {
    fx = await make();
  });

  afterEach(() => {
    fx.close();
  });

  describe('facts', () => {
    it('round-trips a fact and updates it in place on upsert', () => {
      fx.memory.upsertFact(fact(fx.companyId));
      fx.memory.upsertFact(fact(fx.companyId, { confidence: 0.4 }));

      expect(fx.memory.getFact('f1')).toEqual(fact(fx.companyId, { confidence: 0.4 }));
      expect(fx.memory.listFactsByCompany(fx.companyId)).toHaveLength(1);
      expect(fx.memory.getFact('missing')).toBeNull();
    });

    it('lists by company, source and type without crossing companies', () => {
      fx.memory.upsertFact(fact(fx.companyId));
      fx.memory.upsertFact(fact(fx.companyId, { id: 'f2', sourceId: 's2', type: 'status' }));
      fx.memory.upsertFact(fact(fx.otherCompanyId, { id: 'f3' }));

      expect(
        fx.memory
          .listFactsByCompany(fx.companyId)
          .map((f) => f.id)
          .sort(),
      ).toEqual(['f1', 'f2']);
      expect(fx.memory.listFactsBySource('s2').map((f) => f.id)).toEqual(['f2']);
      expect(fx.memory.listFactsByType(fx.companyId, 'status').map((f) => f.id)).toEqual(['f2']);
    });

    it('deletes one fact, reporting whether it existed', () => {
      fx.memory.upsertFact(fact(fx.companyId));

      expect(fx.memory.deleteFact('f1')).toBe(true);
      expect(fx.memory.deleteFact('f1')).toBe(false);
      expect(fx.memory.getFact('f1')).toBeNull();
    });

    it('deletes only facts whose expiry has passed', () => {
      fx.memory.upsertFact(fact(fx.companyId, { id: 'old', expiresAt: 100 }));
      fx.memory.upsertFact(fact(fx.companyId, { id: 'later', expiresAt: 300 }));
      fx.memory.upsertFact(fact(fx.companyId, { id: 'forever' }));

      expect(fx.memory.deleteExpiredFacts(200)).toBe(1);
      expect(
        fx.memory
          .listFactsByCompany(fx.companyId)
          .map((f) => f.id)
          .sort(),
      ).toEqual(['forever', 'later']);
    });
  });

  describe('summaries', () => {
    it('round-trips, lists and deletes summaries', () => {
      fx.memory.upsertSummary(summary(fx.companyId));
      fx.memory.upsertSummary(summary(fx.companyId, { id: 'sum2', sourceId: 's2' }));

      expect(fx.memory.getSummary('sum1')).toEqual(summary(fx.companyId));
      expect(fx.memory.listSummariesByCompany(fx.companyId)).toHaveLength(2);
      expect(fx.memory.listSummariesBySource('s2').map((s) => s.id)).toEqual(['sum2']);
      expect(fx.memory.deleteSummary('sum1')).toBe(true);
      expect(fx.memory.deleteSummary('sum1')).toBe(false);
    });

    it('deletes every fact and summary of a source, counting them', () => {
      fx.memory.upsertFact(fact(fx.companyId));
      fx.memory.upsertFact(fact(fx.companyId, { id: 'f2', sourceId: 'other' }));
      fx.memory.upsertSummary(summary(fx.companyId));

      expect(fx.memory.deleteBySource('s1')).toBe(2);
      expect(fx.memory.listFactsByCompany(fx.companyId).map((f) => f.id)).toEqual(['f2']);
      expect(fx.memory.listSummariesByCompany(fx.companyId)).toEqual([]);
    });
  });

  describe('graph', () => {
    beforeEach(() => {
      fx.graph.upsertNode(node(fx.companyId, 'n-dana', 'Dana'));
      fx.graph.upsertNode(node(fx.companyId, 'n-bill', 'Billing migration'));
      fx.graph.upsertNode(node(fx.companyId, 'n-fin', 'Finance', 'other'));
      fx.graph.upsertEdge(edge(fx.companyId, 'e1', 'n-dana', 'n-bill'));
      fx.graph.upsertEdge(edge(fx.companyId, 'e2', 'n-bill', 'n-fin', 'other'));
    });

    it('round-trips nodes, including an embedding', () => {
      const withEmbedding = {
        ...node(fx.companyId, 'n-emb', 'Embedded'),
        embedding: new Float32Array([0.5, -1]),
      };
      fx.graph.upsertNode(withEmbedding);

      expect(fx.graph.getNode('n-emb')).toEqual(withEmbedding);
      expect(fx.graph.getNode('n-emb')?.embedding).toBeInstanceOf(Float32Array);
      expect(fx.graph.getNodesByType(fx.companyId, 'entity')).toHaveLength(4);
    });

    it('answers edge lookups from either end and between two nodes', () => {
      expect(fx.graph.getEdge('e1')).toEqual(edge(fx.companyId, 'e1', 'n-dana', 'n-bill'));
      expect(fx.graph.getEdgesFromNode('n-bill').map((e) => e.id)).toEqual(['e2']);
      expect(fx.graph.getEdgesToNode('n-bill').map((e) => e.id)).toEqual(['e1']);
      expect(fx.graph.getEdgesBetweenNodes('n-dana', 'n-bill').map((e) => e.id)).toEqual(['e1']);
      expect(fx.graph.getEdgesByCompany(fx.companyId)).toHaveLength(2);
    });

    it('finds nodes by literal, case-insensitive label text', () => {
      expect(fx.graph.findNodesByLabel(fx.companyId, 'BILLING').map((n) => n.id)).toEqual([
        'n-bill',
      ]);
      expect(fx.graph.findNodesByLabel(fx.companyId, '(')).toEqual([]);
    });

    it('walks related nodes breadth-first to the requested depth', () => {
      const one = fx.graph.findRelatedNodes('n-dana', 1);
      expect(one.nodes.map((n) => n.id)).toEqual(['n-dana', 'n-bill']);

      const two = fx.graph.findRelatedNodes('n-dana', 2);
      expect(two.nodes.map((n) => n.id)).toEqual(['n-dana', 'n-bill', 'n-fin']);
      expect(two.edges.map((e) => e.id)).toEqual(['e1', 'e2']);
    });

    it('drops a node together with the edges on either side of it', () => {
      expect(fx.graph.deleteNode('n-bill')).toBe(true);
      expect(fx.graph.deleteNode('n-bill')).toBe(false);
      expect(fx.graph.getEdgesFromNode('n-dana')).toEqual([]);
      expect(fx.graph.getEdgesToNode('n-fin')).toEqual([]);
    });

    it('deletes one edge, reporting whether it existed', () => {
      expect(fx.graph.deleteEdge('e1')).toBe(true);
      expect(fx.graph.deleteEdge('e1')).toBe(false);
    });

    it('deletes by source, counting nodes and the edges left after them', () => {
      // n-fin goes, and e2 cascades with it — so no edge is left to count.
      expect(fx.graph.deleteBySource('other')).toBe(1);
      expect(fx.graph.getNode('n-fin')).toBeNull();
      expect(fx.graph.getEdge('e2')).toBeNull();
      expect(fx.graph.getEdge('e1')).not.toBeNull();
    });
  });
});

describe('enhanced AI memory — persistence', () => {
  let ctx: TestDbHandle;
  let companyId: string;

  beforeEach(async () => {
    ctx = await makeTestDb();
    companyId = createCompaniesRepo(ctx.db).create({ name: 'A', slug: 'a' });
  });

  afterEach(() => {
    ctx.close();
  });

  it('serves facts and the graph written by one instance to the next', () => {
    createEnhancedAiMemoryRepo(ctx.db).upsertFact(fact(companyId));
    createKnowledgeGraphService({ repo: createEnhancedAiKnowledgeRepo(ctx.db) }).ingestFacts([
      fact(companyId),
    ]);

    // Fresh repos and a fresh service: what the next launch constructs.
    const memory = createEnhancedAiMemoryRepo(ctx.db);
    const graph = createKnowledgeGraphService({ repo: createEnhancedAiKnowledgeRepo(ctx.db) });

    expect(memory.listFactsByCompany(companyId).map((f) => f.fact)).toEqual([
      'Dana owns the billing migration',
    ]);
    expect(
      graph.query({ companyId, query: 'What does Dana own?' }).nodes.map((n) => n.label),
    ).toEqual(expect.arrayContaining(['Dana', 'billing migration']));
  });

  it('removes a company’s memory when the company is deleted', () => {
    const memory = createEnhancedAiMemoryRepo(ctx.db);
    const graph = createEnhancedAiKnowledgeRepo(ctx.db);
    memory.upsertFact(fact(companyId));
    memory.upsertSummary(summary(companyId));
    createKnowledgeGraphService({ repo: graph }).ingestFacts([fact(companyId)]);

    createCompaniesRepo(ctx.db).delete(companyId);

    expect(memory.listFactsByCompany(companyId)).toEqual([]);
    expect(memory.listSummariesByCompany(companyId)).toEqual([]);
    expect(graph.getNodesByCompany(companyId)).toEqual([]);
    expect(graph.getEdgesByCompany(companyId)).toEqual([]);
  });
});
