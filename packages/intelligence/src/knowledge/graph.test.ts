/**
 * Knowledge graph specs — the module's first direct coverage.
 *
 * Pins the behaviour a persistent repo depends on: re-ingesting a fact, or
 * mentioning an entity again in a later process, must reuse the nodes and
 * edges already stored instead of growing duplicates. The label cache that
 * used to be the only lookup starts empty in every process.
 */

import { describe, expect, it, vi } from 'vitest';

import type { ExtractedFact } from '../memory/long-term.js';
import { createInMemoryGraphRepo, createKnowledgeGraphService } from './graph.js';

function fact(overrides: Partial<ExtractedFact> = {}): ExtractedFact {
  return {
    id: 'fact-1',
    companyId: 'co-1',
    sourceId: 'thread-1',
    fact: 'Dana owns the billing migration',
    type: 'relationship',
    confidence: 0.8,
    entities: ['Dana', 'billing migration'],
    observedAt: 1,
    extractedAt: 1,
    accessCount: 0,
    lastAccessedAt: 1,
    ...overrides,
  };
}

describe('createKnowledgeGraphService — ingestion', () => {
  it('reuses stored nodes and edges when a fresh service ingests the same entities', () => {
    const repo = createInMemoryGraphRepo();
    createKnowledgeGraphService({ repo }).ingestFacts([fact()]);

    // A second service over the same repo stands in for the next app launch.
    createKnowledgeGraphService({ repo }).ingestFacts([
      fact({ id: 'fact-2', confidence: 0.95, observedAt: 2 }),
    ]);

    const labels = repo.getNodesByCompany('co-1').map((n) => n.label);
    expect(labels.sort()).toEqual(['Dana', 'Dana owns the billing migration', 'billing migration']);
    const edges = repo.getEdgesByCompany('co-1');
    expect(edges).toHaveLength(2);
    for (const edge of edges) {
      expect(edge.factIds).toEqual(['fact-1', 'fact-2']);
      expect(edge.weight).toBe(0.95);
    }
  });

  it('treats an entity label case-insensitively', () => {
    const repo = createInMemoryGraphRepo();
    const graph = createKnowledgeGraphService({ repo });

    graph.ingestFacts([fact()]);
    graph.ingestFacts([
      fact({ id: 'fact-2', fact: 'dana reviewed the budget', entities: ['dana', 'budget'] }),
    ]);

    expect(
      repo.getNodesByCompany('co-1').filter((n) => n.label.toLowerCase() === 'dana'),
    ).toHaveLength(1);
  });
});

describe('createKnowledgeGraphService — query', () => {
  it('finds the entities a natural-language question mentions', () => {
    const repo = createInMemoryGraphRepo();
    const graph = createKnowledgeGraphService({ repo });
    graph.ingestFacts([fact()]);

    const result = graph.query({ companyId: 'co-1', query: 'What is Dana working on this week?' });

    expect(result.nodes.map((n) => n.label)).toEqual(
      expect.arrayContaining(['Dana', 'billing migration']),
    );
  });

  it('returns nothing for a question that mentions no stored entity', () => {
    const repo = createInMemoryGraphRepo();
    const graph = createKnowledgeGraphService({ repo });
    graph.ingestFacts([fact()]);

    expect(graph.query({ companyId: 'co-1', query: 'How is the weather?' }).nodes).toEqual([]);
  });
});

describe('createInMemoryGraphRepo — findNodesByLabel', () => {
  it('matches text literally, so regex metacharacters cannot throw', () => {
    const repo = createInMemoryGraphRepo();
    createKnowledgeGraphService({ repo }).ingestFacts([
      fact({ fact: 'The C++ build is flaky', entities: ['C++ build'] }),
    ]);

    expect(() => repo.findNodesByLabel('co-1', 'C++ (')).not.toThrow();
    expect(repo.findNodesByLabel('co-1', 'c++ build').map((n) => n.label)).toContain('C++ build');
  });
});

describe('knowledge graph — label lookups do not rescan per entity', () => {
  // Each label miss scanned the whole company (`getNodesByCompany`), so
  // ingesting N new entities cost N+1 full reads — growing with the graph,
  // on every Copilot exchange once memory persists in SQL.
  it('reads the company once per process however many new entities arrive', () => {
    const repo = createInMemoryGraphRepo();
    createKnowledgeGraphService({ repo }).ingestFacts([fact()]);
    const scan = vi.spyOn(repo, 'getNodesByCompany');
    const graph = createKnowledgeGraphService({ repo });

    graph.ingestFacts(
      Array.from({ length: 10 }, (_, i) =>
        fact({ id: `f-${i}`, fact: `Fact number ${i}`, entities: [`entity ${i}`, 'Dana'] }),
      ),
    );

    expect(scan.mock.calls.length).toBeLessThanOrEqual(1);
    // …and still reuses the node stored by the earlier process.
    expect(repo.getNodesByCompany('co-1').filter((n) => n.label === 'Dana')).toHaveLength(1);
  });
});
