/**
 * Enhanced AI memory repositories — SQL implementations of the two storage
 * interfaces `@team-x/intelligence` defines for long-term memory
 * (`LongTermMemoryRepo`) and the knowledge graph (`KnowledgeGraphRepo`).
 *
 * The package ships in-memory implementations and the desktop app used to
 * pass only those, so every fact, summary and graph node was lost when the
 * app exited — "long-term" memory that lasted one session. These persist to
 * the four tables added in migration 0037.
 *
 * The package owns the object shapes, which carry nested arrays (fact ids,
 * entities, topics) and an optional Float32Array embedding. Each row stores
 * the object verbatim in `data_json`; only the columns the queries filter on
 * are promoted. Behaviour mirrors the in-memory repos exactly — the shared
 * contract spec in `enhanced-ai-memory.test.ts` runs against both.
 */

import type {
  ConversationSummary,
  ExtractedFact,
  GraphQueryResult,
  KnowledgeEdge,
  KnowledgeGraphRepo,
  KnowledgeNode,
  LongTermMemoryRepo,
} from '@team-x/intelligence';
import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type { Schema } from '../client.js';
import { knowledgeEdges, knowledgeNodes, memoryFacts, memorySummaries } from '../schema.js';

type MemoryDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

// ---------------------------------------------------------------------------
// Long-term memory
// ---------------------------------------------------------------------------

export function createEnhancedAiMemoryRepo<TRunResult>(
  db: MemoryDb<TRunResult>,
  now: () => number = Date.now,
): LongTermMemoryRepo {
  const toFact = (row: { dataJson: string }): ExtractedFact =>
    JSON.parse(row.dataJson) as ExtractedFact;
  const toSummary = (row: { dataJson: string }): ConversationSummary =>
    JSON.parse(row.dataJson) as ConversationSummary;

  function deleteFact(id: string): boolean {
    const existing = db
      .select({ id: memoryFacts.id })
      .from(memoryFacts)
      .where(eq(memoryFacts.id, id))
      .get();
    if (!existing) return false;
    db.delete(memoryFacts).where(eq(memoryFacts.id, id)).run();
    return true;
  }

  function deleteSummary(id: string): boolean {
    const existing = db
      .select({ id: memorySummaries.id })
      .from(memorySummaries)
      .where(eq(memorySummaries.id, id))
      .get();
    if (!existing) return false;
    db.delete(memorySummaries).where(eq(memorySummaries.id, id)).run();
    return true;
  }

  return {
    upsertFact(fact) {
      const values = {
        companyId: fact.companyId,
        sourceId: fact.sourceId,
        type: fact.type,
        expiresAt: fact.expiresAt ?? null,
        dataJson: JSON.stringify(fact),
        updatedAt: now(),
      };
      db.insert(memoryFacts)
        .values({ id: fact.id, ...values })
        .onConflictDoUpdate({ target: memoryFacts.id, set: values })
        .run();
    },

    getFact(id) {
      const row = db.select().from(memoryFacts).where(eq(memoryFacts.id, id)).get();
      return row ? toFact(row) : null;
    },

    listFactsByCompany(companyId) {
      return db
        .select()
        .from(memoryFacts)
        .where(eq(memoryFacts.companyId, companyId))
        .all()
        .map(toFact);
    },

    listFactsBySource(sourceId) {
      return db
        .select()
        .from(memoryFacts)
        .where(eq(memoryFacts.sourceId, sourceId))
        .all()
        .map(toFact);
    },

    listFactsByType(companyId, type) {
      return db
        .select()
        .from(memoryFacts)
        .where(and(eq(memoryFacts.companyId, companyId), eq(memoryFacts.type, type)))
        .all()
        .map(toFact);
    },

    deleteFact,

    deleteExpiredFacts(at) {
      const expired = db
        .select({ id: memoryFacts.id })
        .from(memoryFacts)
        .where(and(isNotNull(memoryFacts.expiresAt), lt(memoryFacts.expiresAt, at)))
        .all();
      if (expired.length === 0) return 0;
      db.delete(memoryFacts)
        .where(
          inArray(
            memoryFacts.id,
            expired.map((r) => r.id),
          ),
        )
        .run();
      return expired.length;
    },

    upsertSummary(summary) {
      const values = {
        companyId: summary.companyId,
        sourceId: summary.sourceId,
        dataJson: JSON.stringify(summary),
        updatedAt: now(),
      };
      db.insert(memorySummaries)
        .values({ id: summary.id, ...values })
        .onConflictDoUpdate({ target: memorySummaries.id, set: values })
        .run();
    },

    getSummary(id) {
      const row = db.select().from(memorySummaries).where(eq(memorySummaries.id, id)).get();
      return row ? toSummary(row) : null;
    },

    listSummariesByCompany(companyId) {
      return db
        .select()
        .from(memorySummaries)
        .where(eq(memorySummaries.companyId, companyId))
        .all()
        .map(toSummary);
    },

    listSummariesBySource(sourceId) {
      return db
        .select()
        .from(memorySummaries)
        .where(eq(memorySummaries.sourceId, sourceId))
        .all()
        .map(toSummary);
    },

    deleteSummary,

    deleteBySource(sourceId) {
      const facts = db
        .select({ id: memoryFacts.id })
        .from(memoryFacts)
        .where(eq(memoryFacts.sourceId, sourceId))
        .all();
      const summaries = db
        .select({ id: memorySummaries.id })
        .from(memorySummaries)
        .where(eq(memorySummaries.sourceId, sourceId))
        .all();
      db.delete(memoryFacts).where(eq(memoryFacts.sourceId, sourceId)).run();
      db.delete(memorySummaries).where(eq(memorySummaries.sourceId, sourceId)).run();
      return facts.length + summaries.length;
    },
  };
}

// ---------------------------------------------------------------------------
// Knowledge graph
// ---------------------------------------------------------------------------

/** JSON has no Float32Array; carry the embedding as a plain array and back. */
type StoredNode = Omit<KnowledgeNode, 'embedding'> & { embedding?: number[] };

function sourceIdOf(entity: { metadata?: Record<string, unknown> }): string | null {
  const value = entity.metadata?.sourceId;
  return typeof value === 'string' ? value : null;
}

export function createEnhancedAiKnowledgeRepo<TRunResult>(
  db: MemoryDb<TRunResult>,
  now: () => number = Date.now,
): KnowledgeGraphRepo {
  function toNode(row: { dataJson: string }): KnowledgeNode {
    const stored = JSON.parse(row.dataJson) as StoredNode;
    const { embedding, ...rest } = stored;
    return embedding ? { ...rest, embedding: Float32Array.from(embedding) } : rest;
  }
  const toEdge = (row: { dataJson: string }): KnowledgeEdge =>
    JSON.parse(row.dataJson) as KnowledgeEdge;

  function getNode(id: string): KnowledgeNode | null {
    const row = db.select().from(knowledgeNodes).where(eq(knowledgeNodes.id, id)).get();
    return row ? toNode(row) : null;
  }

  function getNodesByCompany(companyId: string): KnowledgeNode[] {
    return db
      .select()
      .from(knowledgeNodes)
      .where(eq(knowledgeNodes.companyId, companyId))
      .all()
      .map(toNode);
  }

  function getEdgesFromNode(nodeId: string): KnowledgeEdge[] {
    return db
      .select()
      .from(knowledgeEdges)
      .where(eq(knowledgeEdges.fromNodeId, nodeId))
      .all()
      .map(toEdge);
  }

  function getEdgesToNode(nodeId: string): KnowledgeEdge[] {
    return db
      .select()
      .from(knowledgeEdges)
      .where(eq(knowledgeEdges.toNodeId, nodeId))
      .all()
      .map(toEdge);
  }

  function deleteNode(id: string): boolean {
    if (!getNode(id)) return false;
    // Edges on either side go with it (ON DELETE CASCADE).
    db.delete(knowledgeNodes).where(eq(knowledgeNodes.id, id)).run();
    return true;
  }

  function deleteEdge(id: string): boolean {
    const existing = db
      .select({ id: knowledgeEdges.id })
      .from(knowledgeEdges)
      .where(eq(knowledgeEdges.id, id))
      .get();
    if (!existing) return false;
    db.delete(knowledgeEdges).where(eq(knowledgeEdges.id, id)).run();
    return true;
  }

  return {
    upsertNode(node) {
      const { embedding, ...rest } = node;
      const stored: StoredNode = embedding ? { ...rest, embedding: Array.from(embedding) } : rest;
      const values = {
        companyId: node.companyId,
        type: node.type,
        label: node.label,
        sourceId: sourceIdOf(node),
        dataJson: JSON.stringify(stored),
        updatedAt: now(),
      };
      db.insert(knowledgeNodes)
        .values({ id: node.id, ...values })
        .onConflictDoUpdate({ target: knowledgeNodes.id, set: values })
        .run();
    },

    getNode,
    getNodesByCompany,

    getNodesByType(companyId, type) {
      return db
        .select()
        .from(knowledgeNodes)
        .where(and(eq(knowledgeNodes.companyId, companyId), eq(knowledgeNodes.type, type)))
        .all()
        .map(toNode);
    },

    deleteNode,

    upsertEdge(edge) {
      const values = {
        companyId: edge.companyId,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        sourceId: sourceIdOf(edge),
        dataJson: JSON.stringify(edge),
        updatedAt: now(),
      };
      db.insert(knowledgeEdges)
        .values({ id: edge.id, ...values })
        .onConflictDoUpdate({ target: knowledgeEdges.id, set: values })
        .run();
    },

    getEdge(id) {
      const row = db.select().from(knowledgeEdges).where(eq(knowledgeEdges.id, id)).get();
      return row ? toEdge(row) : null;
    },

    getEdgesByCompany(companyId) {
      return db
        .select()
        .from(knowledgeEdges)
        .where(eq(knowledgeEdges.companyId, companyId))
        .all()
        .map(toEdge);
    },

    getEdgesFromNode,
    getEdgesToNode,

    getEdgesBetweenNodes(fromId, toId) {
      return db
        .select()
        .from(knowledgeEdges)
        .where(and(eq(knowledgeEdges.fromNodeId, fromId), eq(knowledgeEdges.toNodeId, toId)))
        .all()
        .map(toEdge);
    },

    deleteEdge,

    findNodesByLabel(companyId, text) {
      // Filtered in JS rather than SQL `lower()`, which folds ASCII only —
      // the in-memory repo folds with toLowerCase and the two must agree.
      const needle = text.toLowerCase();
      return getNodesByCompany(companyId).filter((n) => n.label.toLowerCase().includes(needle));
    },

    findRelatedNodes(nodeId, maxDepth): GraphQueryResult {
      // Same breadth-first walk as the in-memory repo: outgoing edges are
      // collected, incoming edges only extend the frontier.
      const visited = new Set<string>([nodeId]);
      const resultNodes: KnowledgeNode[] = [];
      const resultEdges: KnowledgeEdge[] = [];
      let nodesVisited = 0;
      let edgesTraversed = 0;

      const startNode = getNode(nodeId);
      if (startNode) resultNodes.push(startNode);

      const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId, depth: 0 }];
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        if (next.depth >= maxDepth) continue;

        for (const edge of getEdgesFromNode(next.nodeId)) {
          edgesTraversed++;
          resultEdges.push(edge);
          if (!visited.has(edge.toNodeId)) {
            visited.add(edge.toNodeId);
            const target = getNode(edge.toNodeId);
            if (target) {
              resultNodes.push(target);
              nodesVisited++;
              queue.push({ nodeId: edge.toNodeId, depth: next.depth + 1 });
            }
          }
        }

        for (const edge of getEdgesToNode(next.nodeId)) {
          if (!visited.has(edge.fromNodeId)) {
            visited.add(edge.fromNodeId);
            const source = getNode(edge.fromNodeId);
            if (source) {
              resultNodes.push(source);
              nodesVisited++;
              queue.push({ nodeId: edge.fromNodeId, depth: next.depth + 1 });
            }
          }
        }
      }

      return {
        nodes: resultNodes,
        edges: resultEdges,
        metadata: { executionTimeMs: 0, nodesVisited, edgesTraversed },
      };
    },

    deleteBySource(sourceId) {
      // Nodes first: their edges cascade away and are not counted, which is
      // what the in-memory repo reports for the same graph.
      const nodes = db
        .select({ id: knowledgeNodes.id })
        .from(knowledgeNodes)
        .where(eq(knowledgeNodes.sourceId, sourceId))
        .all();
      db.delete(knowledgeNodes).where(eq(knowledgeNodes.sourceId, sourceId)).run();
      const edges = db
        .select({ id: knowledgeEdges.id })
        .from(knowledgeEdges)
        .where(eq(knowledgeEdges.sourceId, sourceId))
        .all();
      db.delete(knowledgeEdges).where(eq(knowledgeEdges.sourceId, sourceId)).run();
      return nodes.length + edges.length;
    },
  };
}
