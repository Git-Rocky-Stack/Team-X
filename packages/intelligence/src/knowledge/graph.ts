/**
 * Cross-Thread Knowledge Graph
 *
 * Maintains a knowledge graph of facts extracted from conversations,
 * enabling cross-thread knowledge sharing and relationship inference.
 *
 * Phase 5 — M30 (Phase 3 enhancement).
 */

import type { FactType } from '../memory/long-term.js';
import type { ExtractedFact } from '../memory/long-term.js';

/**
 * Knowledge graph node representing an entity or concept.
 */
export interface KnowledgeNode {
  /** Unique node ID */
  id: string;

  /** Company this node belongs to */
  companyId: string;

  /** Node type */
  type: NodeType;

  /** Node label/name */
  label: string;

  /** Associated facts */
  factIds: string[];

  /** Node embeddings for semantic similarity */
  embedding?: Float32Array;

  /** Creation timestamp */
  createdAt: number;

  /** Last update timestamp */
  updatedAt: number;

  /** Access frequency for relevance */
  accessCount: number;

  /** Node metadata */
  metadata?: {
    sourceType?: string;
    sourceId?: string;
    confidence?: number;
    [key: string]: unknown;
  };
}

/**
 * Types of nodes in the knowledge graph.
 */
export type NodeType =
  | 'entity' // People, organizations
  | 'concept' // Ideas, topics, themes
  | 'event' // Time-bound occurrences
  | 'status' // State information
  | 'relationship' // Connections between entities
  | 'decision' // Made decisions
  | 'preference' // User/system preferences
  | 'metric'; // Quantitative measures

/**
 * Knowledge graph edge representing a relationship.
 */
export interface KnowledgeEdge {
  /** Unique edge ID */
  id: string;

  /** Company this edge belongs to */
  companyId: string;

  /** Source node ID */
  fromNodeId: string;

  /** Target node ID */
  toNodeId: string;

  /** Relationship type */
  relation: RelationType;

  /** Edge weight (confidence/strength 0-1) */
  weight: number;

  /** When this relationship was observed */
  observedAt: number;

  /** Supporting facts */
  factIds: string[];

  /** Edge metadata */
  metadata?: {
    sourceType?: string;
    sourceId?: string;
    context?: string;
    [key: string]: unknown;
  };
}

/**
 * Types of relationships between nodes.
 */
export type RelationType =
  | 'related_to' // General association
  | 'works_on' // Employee → project/task
  | 'assigned_to' // Task → assignee
  | 'depends_on' // Task → dependency
  | 'blocks' // Task → blocked by
  | 'part_of' // Sub-goal → goal
  | 'leads_to' // Cause → effect
  | 'requires' // Prerequisite
  | 'conflicts_with' // Conflict relationship
  | 'similar_to' // Semantic similarity
  | 'mentions' // Reference
  | 'owns' // Ownership
  | 'reports_to' // Hierarchy
  | 'collaborates_with' // Collaboration
  | 'located_at' // Location
  | 'scheduled_for' // Time
  | 'has_status' // Entity → status
  | 'has_metric' // Entity → metric
  | 'decided' // Decision maker
  | 'prefers'; // Preference holder

/**
 * Knowledge graph query result.
 */
export interface GraphQueryResult {
  /** Matching nodes */
  nodes: KnowledgeNode[];

  /** Matching edges */
  edges: KnowledgeEdge[];

  /** Query metadata */
  metadata: {
    executionTimeMs: number;
    nodesVisited: number;
    edgesTraversed: number;
  };
}

/**
 * Graph path for relationship traversal.
 */
export interface GraphPath {
  /** Path of node IDs */
  nodeIds: string[];

  /** Edges between nodes */
  edges: KnowledgeEdge[];

  /** Path weight/cost */
  weight: number;

  /** Path length (hops) */
  length: number;
}

/**
 * Knowledge graph statistics.
 */
export interface GraphStats {
  /** Total nodes */
  totalNodes: number;

  /** Total edges */
  totalEdges: number;

  /** Nodes by type */
  nodesByType: Map<NodeType, number>;

  /** Edges by relation */
  edgesByRelation: Map<RelationType, number>;

  /** Connected components */
  connectedComponents: number;

  /** Average node degree */
  avgNodeDegree: number;
}

/**
 * Knowledge graph repository interface.
 */
export interface KnowledgeGraphRepo {
  // Nodes
  upsertNode(node: KnowledgeNode): void;
  getNode(id: string): KnowledgeNode | null;
  getNodesByCompany(companyId: string): KnowledgeNode[];
  getNodesByType(companyId: string, type: NodeType): KnowledgeNode[];
  deleteNode(id: string): boolean;

  // Edges
  upsertEdge(edge: KnowledgeEdge): void;
  getEdge(id: string): KnowledgeEdge | null;
  getEdgesByCompany(companyId: string): KnowledgeEdge[];
  getEdgesFromNode(nodeId: string): KnowledgeEdge[];
  getEdgesToNode(nodeId: string): KnowledgeEdge[];
  getEdgesBetweenNodes(fromId: string, toId: string): KnowledgeEdge[];
  deleteEdge(id: string): boolean;

  // Queries
  findNodesByLabel(companyId: string, labelPattern: string): KnowledgeNode[];
  findRelatedNodes(nodeId: string, maxDepth: number): GraphQueryResult;

  // Cleanup
  deleteBySource(sourceId: string): number;
}

/**
 * Create in-memory knowledge graph repository.
 */
export function createInMemoryGraphRepo(): KnowledgeGraphRepo {
  const nodes = new Map<string, KnowledgeNode>();
  const edges = new Map<string, KnowledgeEdge>();
  const fromNodeIndex = new Map<string, Set<string>>(); // fromId -> edgeIds
  const toNodeIndex = new Map<string, Set<string>>(); // toId -> edgeIds
  const companyNodesIndex = new Map<string, Set<string>>();
  const companyEdgesIndex = new Map<string, Set<string>>();

  return {
    upsertNode(node) {
      nodes.set(node.id, node);

      if (!companyNodesIndex.has(node.companyId)) {
        companyNodesIndex.set(node.companyId, new Set());
      }
      companyNodesIndex.get(node.companyId)?.add(node.id);
    },

    getNode(id) {
      return nodes.get(id) ?? null;
    },

    getNodesByCompany(companyId) {
      const ids = companyNodesIndex.get(companyId) ?? new Set();
      return Array.from(ids)
        .map((id) => nodes.get(id))
        .filter((n): n is KnowledgeNode => n !== undefined);
    },

    getNodesByType(companyId, type) {
      return this.getNodesByCompany(companyId).filter((n) => n.type === type);
    },

    deleteNode(id) {
      const node = nodes.get(id);
      if (!node) return false;

      nodes.delete(id);
      companyNodesIndex.get(node.companyId)?.delete(id);

      // Delete associated edges
      const fromEdges = fromNodeIndex.get(id) ?? new Set();
      const toEdges = toNodeIndex.get(id) ?? new Set();

      for (const edgeId of fromEdges) edges.delete(edgeId);
      for (const edgeId of toEdges) edges.delete(edgeId);

      fromNodeIndex.delete(id);
      toNodeIndex.delete(id);

      return true;
    },

    upsertEdge(edge) {
      edges.set(edge.id, edge);

      if (!companyEdgesIndex.has(edge.companyId)) {
        companyEdgesIndex.set(edge.companyId, new Set());
      }
      companyEdgesIndex.get(edge.companyId)?.add(edge.id);

      if (!fromNodeIndex.has(edge.fromNodeId)) {
        fromNodeIndex.set(edge.fromNodeId, new Set());
      }
      fromNodeIndex.get(edge.fromNodeId)?.add(edge.id);

      if (!toNodeIndex.has(edge.toNodeId)) {
        toNodeIndex.set(edge.toNodeId, new Set());
      }
      toNodeIndex.get(edge.toNodeId)?.add(edge.id);
    },

    getEdge(id) {
      return edges.get(id) ?? null;
    },

    getEdgesByCompany(companyId) {
      const ids = companyEdgesIndex.get(companyId) ?? new Set();
      return Array.from(ids)
        .map((id) => edges.get(id))
        .filter((e): e is KnowledgeEdge => e !== undefined);
    },

    getEdgesFromNode(nodeId) {
      const edgeIds = fromNodeIndex.get(nodeId) ?? new Set();
      return Array.from(edgeIds)
        .map((id) => edges.get(id))
        .filter((e): e is KnowledgeEdge => e !== undefined);
    },

    getEdgesToNode(nodeId) {
      const edgeIds = toNodeIndex.get(nodeId) ?? new Set();
      return Array.from(edgeIds)
        .map((id) => edges.get(id))
        .filter((e): e is KnowledgeEdge => e !== undefined);
    },

    getEdgesBetweenNodes(fromId, toId) {
      const fromEdges = fromNodeIndex.get(fromId) ?? new Set();
      return Array.from(fromEdges)
        .map((id) => edges.get(id))
        .filter((e): e is KnowledgeEdge => e !== undefined && e.toNodeId === toId);
    },

    findNodesByLabel(companyId, labelPattern) {
      const regex = new RegExp(labelPattern, 'i');
      return this.getNodesByCompany(companyId).filter((n) => regex.test(n.label));
    },

    findRelatedNodes(nodeId, maxDepth) {
      const visited = new Set<string>([nodeId]);
      const resultNodes: KnowledgeNode[] = [];
      const resultEdges: KnowledgeEdge[] = [];
      let nodesVisited = 0;
      let edgesTraversed = 0;

      const startNode = nodes.get(nodeId);
      if (startNode) resultNodes.push(startNode);

      const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId, depth: 0 }];

      while (queue.length > 0) {
        const { nodeId: currentId, depth } = queue.shift()!;

        if (depth >= maxDepth) continue;

        const outEdges = this.getEdgesFromNode(currentId);
        for (const edge of outEdges) {
          edgesTraversed++;
          resultEdges.push(edge);

          if (!visited.has(edge.toNodeId)) {
            visited.add(edge.toNodeId);
            const targetNode = nodes.get(edge.toNodeId);
            if (targetNode) {
              resultNodes.push(targetNode);
              nodesVisited++;
              queue.push({ nodeId: edge.toNodeId, depth: depth + 1 });
            }
          }
        }

        const inEdges = this.getEdgesToNode(currentId);
        for (const edge of inEdges) {
          if (!visited.has(edge.fromNodeId)) {
            visited.add(edge.fromNodeId);
            const sourceNode = nodes.get(edge.fromNodeId);
            if (sourceNode) {
              resultNodes.push(sourceNode);
              nodesVisited++;
              queue.push({ nodeId: edge.fromNodeId, depth: depth + 1 });
            }
          }
        }
      }

      return {
        nodes: resultNodes,
        edges: resultEdges,
        metadata: {
          executionTimeMs: 0,
          nodesVisited,
          edgesTraversed,
        },
      };
    },

    deleteEdge(id) {
      const edge = edges.get(id);
      if (!edge) return false;

      edges.delete(id);
      companyEdgesIndex.get(edge.companyId)?.delete(id);
      fromNodeIndex.get(edge.fromNodeId)?.delete(id);
      toNodeIndex.get(edge.toNodeId)?.delete(id);

      return true;
    },

    deleteBySource(sourceId) {
      let count = 0;

      // Delete nodes with this source
      for (const [id, node] of nodes) {
        if (node.metadata?.sourceId === sourceId) {
          this.deleteNode(id);
          count++;
        }
      }

      // Delete edges with this source
      for (const [id, edge] of edges) {
        if (edge.metadata?.sourceId === sourceId) {
          this.deleteEdge(id);
          count++;
        }
      }

      return count;
    },
  };
}

/**
 * Knowledge graph service.
 */
export interface KnowledgeGraphService {
  /**
   * Add facts to the knowledge graph, extracting nodes and edges.
   */
  ingestFacts(facts: ExtractedFact[]): void;

  /**
   * Query the graph for related knowledge.
   */
  query(context: {
    companyId: string;
    query: string;
    maxResults?: number;
    maxDepth?: number;
  }): GraphQueryResult;

  /**
   * Find shortest path between two entities.
   */
  findPath(fromNodeId: string, toNodeId: string, maxHops?: number): GraphPath | null;

  /**
   * Get graph statistics.
   */
  getStats(companyId: string): GraphStats;

  /**
   * Suggest related entities based on context.
   */
  suggestRelated(
    nodeId: string,
    options?: { maxResults?: number; relationTypes?: RelationType[] },
  ): KnowledgeNode[];

  /**
   * Infer relationships (transitive closure).
   */
  inferRelationships(
    companyId: string,
    options?: { maxDepth?: number; minConfidence?: number },
  ): KnowledgeEdge[];

  /**
   * Clean up data from a source.
   */
  deleteBySource(sourceId: string): number;

  /**
   * Export graph as JSON.
   */
  export(companyId: string): string;
}

/**
 * Create knowledge graph service.
 */
export function createKnowledgeGraphService(options: {
  repo: KnowledgeGraphRepo;
  idGen?: () => string;
  now?: () => number;
}): KnowledgeGraphService {
  const repo = options.repo;
  const now = options.now ?? Date.now;
  const idGen =
    options.idGen ?? (() => `node_${Math.random().toString(36).slice(2, 10)}${now().toString(36)}`);
  const edgeIdGen = () => `edge_${Math.random().toString(36).slice(2, 10)}${now().toString(36)}`;

  // Node label cache for entity resolution
  const labelToNodeId = new Map<string, string>(); // companyId:label -> nodeId

  return {
    ingestFacts(facts) {
      for (const fact of facts) {
        // Extract or create node from fact
        let nodeId = labelToNodeId.get(`${fact.companyId}:${fact.fact}`);

        if (!nodeId) {
          nodeId = idGen();
          labelToNodeId.set(`${fact.companyId}:${fact.fact}`, nodeId);

          const node: KnowledgeNode = {
            id: nodeId,
            companyId: fact.companyId,
            type: factTypeToNodeType(fact.type),
            label: fact.fact,
            factIds: [fact.id],
            createdAt: now(),
            updatedAt: now(),
            accessCount: 0,
            metadata: {
              sourceId: fact.sourceId,
              confidence: fact.confidence,
            },
          };

          options.repo.upsertNode(node);
        } else {
          // Update existing node
          const existing = options.repo.getNode(nodeId);
          if (existing) {
            existing.factIds.push(fact.id);
            existing.updatedAt = now();
            existing.accessCount++;
            options.repo.upsertNode(existing);
          }
        }

        // Extract entities from fact and create relationship edges
        if (fact.entities && fact.entities.length > 0) {
          for (const entity of fact.entities) {
            let entityNodeId = labelToNodeId.get(`${fact.companyId}:${entity}`);

            if (!entityNodeId) {
              entityNodeId = idGen();
              labelToNodeId.set(`${fact.companyId}:${entity}`, entityNodeId);

              const entityNode: KnowledgeNode = {
                id: entityNodeId,
                companyId: fact.companyId,
                type: 'entity',
                label: entity,
                factIds: [fact.id],
                createdAt: now(),
                updatedAt: now(),
                accessCount: 0,
                metadata: {
                  sourceId: fact.sourceId,
                },
              };

              options.repo.upsertNode(entityNode);
            }

            // Create relationship edge
            const relation = inferRelationFromFactType(fact.type);
            const edgeId = edgeIdGen();

            const edge: KnowledgeEdge = {
              id: edgeId,
              companyId: fact.companyId,
              fromNodeId: nodeId,
              toNodeId: entityNodeId,
              relation,
              weight: fact.confidence,
              observedAt: fact.observedAt,
              factIds: [fact.id],
              metadata: {
                sourceId: fact.sourceId,
                context: fact.fact,
              },
            };

            options.repo.upsertEdge(edge);
          }
        }
      }
    },

    query(context) {
      const maxDepth = context.maxDepth ?? 2;
      const maxResults = context.maxResults ?? 20;

      // Find nodes matching the query
      const matchingNodes = options.repo.findNodesByLabel(context.companyId, context.query);

      if (matchingNodes.length === 0) {
        return {
          nodes: [],
          edges: [],
          metadata: { executionTimeMs: 0, nodesVisited: 0, edgesTraversed: 0 },
        };
      }

      // Get related nodes for each match
      const allNodes = new Map<string, KnowledgeNode>();
      const allEdges = new Map<string, KnowledgeEdge>();

      for (const node of matchingNodes) {
        allNodes.set(node.id, node);

        const related = options.repo.findRelatedNodes(node.id, maxDepth);
        for (const n of related.nodes) allNodes.set(n.id, n);
        for (const e of related.edges) allEdges.set(e.id, e);
      }

      // Limit results
      const nodesArray = Array.from(allNodes.values()).slice(0, maxResults);
      const edgesArray = Array.from(allEdges.values()).slice(0, maxResults * 2);

      return {
        nodes: nodesArray,
        edges: edgesArray,
        metadata: {
          executionTimeMs: 0,
          nodesVisited: allNodes.size,
          edgesTraversed: allEdges.size,
        },
      };
    },

    findPath(fromNodeId, toNodeId, maxHops = 5) {
      // BFS for shortest path
      const queue: Array<{ nodeId: string; path: GraphPath }> = [
        { nodeId: fromNodeId, path: { nodeIds: [fromNodeId], edges: [], weight: 0, length: 0 } },
      ];
      const visited = new Set<string>([fromNodeId]);

      while (queue.length > 0) {
        const { nodeId, path } = queue.shift()!;

        if (nodeId === toNodeId) {
          return path;
        }

        if (path.length >= maxHops) continue;

        const outEdges = repo.getEdgesFromNode(nodeId);
        for (const edge of outEdges) {
          if (!visited.has(edge.toNodeId)) {
            visited.add(edge.toNodeId);
            queue.push({
              nodeId: edge.toNodeId,
              path: {
                nodeIds: [...path.nodeIds, edge.toNodeId],
                edges: [...path.edges, edge],
                weight: path.weight + edge.weight,
                length: path.length + 1,
              },
            });
          }
        }
      }

      return null;
    },

    getStats(companyId) {
      const nodes = options.repo.getNodesByCompany(companyId);
      const edges = options.repo.getEdgesByCompany(companyId);

      const nodesByType = new Map<NodeType, number>();
      for (const node of nodes) {
        nodesByType.set(node.type, (nodesByType.get(node.type) ?? 0) + 1);
      }

      const edgesByRelation = new Map<RelationType, number>();
      for (const edge of edges) {
        edgesByRelation.set(edge.relation, (edgesByRelation.get(edge.relation) ?? 0) + 1);
      }

      // Calculate average node degree
      const nodeDegrees = new Map<string, number>();
      for (const edge of edges) {
        nodeDegrees.set(edge.fromNodeId, (nodeDegrees.get(edge.fromNodeId) ?? 0) + 1);
        nodeDegrees.set(edge.toNodeId, (nodeDegrees.get(edge.toNodeId) ?? 0) + 1);
      }
      const avgDegree =
        nodeDegrees.size > 0
          ? Array.from(nodeDegrees.values()).reduce((a, b) => a + b, 0) / nodeDegrees.size
          : 0;

      // Count connected components (simplified)
      const visited = new Set<string>();
      let components = 0;
      for (const node of nodes) {
        if (!visited.has(node.id)) {
          components++;
          const componentNodes = options.repo.findRelatedNodes(node.id, 10);
          for (const n of componentNodes.nodes) visited.add(n.id);
        }
      }

      return {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        nodesByType,
        edgesByRelation,
        connectedComponents: components,
        avgNodeDegree: avgDegree,
      };
    },

    suggestRelated(nodeId, opts = {}) {
      const maxResults = opts.maxResults ?? 10;
      const relationTypes = opts.relationTypes;

      const edges = repo.getEdgesFromNode(nodeId);
      let relatedIds = edges.map((e) => e.toNodeId);

      // Filter by relation types if specified
      if (relationTypes && relationTypes.length > 0) {
        const filtered = edges.filter((e) => relationTypes.includes(e.relation));
        relatedIds = filtered.map((e) => e.toNodeId);
      }

      // Get nodes and sort by edge weight
      const relatedNodes = relatedIds
        .map((id) => repo.getNode(id))
        .filter((n): n is KnowledgeNode => n !== undefined)
        .sort((a, b) => b.accessCount - a.accessCount)
        .slice(0, maxResults);

      return relatedNodes;
    },

    inferRelationships(companyId, opts = {}) {
      const maxDepth = opts.maxDepth ?? 2;
      const minConfidence = opts.minConfidence ?? 0.5;

      const inferred: KnowledgeEdge[] = [];
      const nodes = repo.getNodesByCompany(companyId);

      // Transitive inference: if A -> B and B -> C, then A -> C
      for (const node of nodes) {
        const related = repo.findRelatedNodes(node.id, maxDepth);

        for (const edge of related.edges) {
          // Only infer if confidence threshold met
          if (edge.weight >= minConfidence) {
            // Check if edge already exists
            const existing = repo.getEdgesBetweenNodes(node.id, edge.toNodeId);

            if (existing.length === 0) {
              // Create inferred edge
              inferred.push({
                id: edgeIdGen(),
                companyId,
                fromNodeId: node.id,
                toNodeId: edge.toNodeId,
                relation: 'related_to',
                weight: edge.weight * 0.8, // Decay for inferred relationships
                observedAt: now(),
                factIds: [...edge.factIds],
                metadata: {
                  inferred: true,
                  confidence: edge.weight * 0.8,
                },
              } as KnowledgeEdge);
            }
          }
        }
      }

      return inferred;
    },

    deleteBySource(sourceId) {
      return options.repo.deleteBySource(sourceId);
    },

    export(companyId) {
      const nodes = options.repo.getNodesByCompany(companyId);
      const edges = options.repo.getEdgesByCompany(companyId);

      return JSON.stringify(
        {
          nodes,
          edges,
          exportedAt: now(),
          stats: this.getStats(companyId),
        },
        null,
        2,
      );
    },
  };
}

/**
 * Map fact type to node type.
 */
function factTypeToNodeType(factType: FactType): NodeType {
  const mapping: Record<FactType, NodeType> = {
    preference: 'preference',
    status: 'status',
    decision: 'decision',
    relationship: 'relationship',
    event: 'event',
    metric: 'metric',
    procedure: 'concept',
    custom: 'concept',
  };
  return mapping[factType] ?? 'concept';
}

/**
 * Infer relationship type from fact type.
 */
function inferRelationFromFactType(factType: FactType): RelationType {
  const mapping: Record<FactType, RelationType> = {
    preference: 'prefers',
    status: 'has_status',
    decision: 'decided',
    relationship: 'related_to',
    event: 'mentions',
    metric: 'has_metric',
    procedure: 'requires',
    custom: 'related_to',
  };
  return mapping[factType] ?? 'related_to';
}
