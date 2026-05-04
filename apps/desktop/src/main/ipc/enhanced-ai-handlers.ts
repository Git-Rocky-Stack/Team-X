/**
 * enhancedAi.* IPC handlers — surface Phase 2 & 3 AI features to the
 * renderer process.
 *
 * Phase 5 — M32 (Desktop Integration).
 *
 * These handlers expose semantic chunking, query expansion, long-term
 * memory, knowledge graph, multi-turn planning, and streaming responses
 * to the UI layer. Follows the same factory pattern as rag-handlers.ts
 * for consistency and testability.
 */

import type { EnhancedAiService } from '../services/enhanced-ai.js';

export interface EnhancedAiHandlersDeps {
  /**
   * The enhanced AI service instance created in main/index.ts.
   * Null until the user configures an LLM provider.
   */
  enhancedAiService: EnhancedAiService | null;
}

export interface EnhancedAiHandlers {
  /**
   * `enhancedAi.stats` — return system statistics.
   */
  stats(): {
    rag: { enabled: boolean };
    memory: { factsCount: number };
    knowledge: { nodesCount: number };
  };

  /**
   * `enhancedAi.query` — perform an enhanced RAG query with expansion,
   * knowledge graph, and optional planning.
   */
  query(input: {
    query: string;
    companyId?: string;
    topK?: number;
    threshold?: number;
    useExpansion?: boolean;
    includeRelated?: boolean;
    usePlanning?: boolean;
  }): Promise<{
    answer: string;
    context: Array<{ sourceId: string; content: string; similarity: number }>;
    related?: Array<{ entity: string; relation: string }>;
    plan?: any;
  }>;

  /**
   * `enhancedAi.indexWithSemanticChunking` — index content using
   * semantic chunking instead of basic chunking.
   */
  indexWithSemanticChunking(input: {
    companyId: string;
    sourceType: string;
    sourceId: string;
    content: string;
  }): Promise<number>;

  /**
   * `enhancedAi.extractAndStoreFacts` — extract facts from a conversation
   * and store them in long-term memory + knowledge graph.
   */
  extractAndStoreFacts(input: {
    conversation: string;
    sourceId: string;
    companyId?: string;
  }): Promise<number>;

  /**
   * `enhancedAi.queryKnowledge` — query the knowledge graph for related
   * entities and relationships.
   */
  queryKnowledge(input: {
    query: string;
    companyId?: string;
    maxDepth?: number;
    maxResults?: number;
  }): {
    nodes: Array<{ id: string; label: string; type: string }>;
    edges: Array<{ from: string; to: string; relation: string }>;
  };

  /**
   * `enhancedAi.createPlan` — create an execution plan for a complex query.
   */
  createPlan(input: {
    query: string;
  }): Promise<any>;

  /**
   * `enhancedAi.getStats` — get service statistics.
   */
  getStats(): {
    rag: { enabled: boolean };
    memory: { factsCount: number };
    knowledge: { nodesCount: number };
  };
}

export function buildEnhancedAiHandlers(deps: EnhancedAiHandlersDeps): EnhancedAiHandlers {
  const service = deps.enhancedAiService;

  return {
    stats() {
      if (!service) {
        return {
          rag: { enabled: false },
          memory: { factsCount: 0 },
          knowledge: { nodesCount: 0 },
        };
      }
      return service.getStats();
    },

    async query(input) {
      if (!service) {
        throw new Error('Enhanced AI service not available — configure LLM provider first');
      }
      return service.enhancedQuery(input.query, {
        topK: input.topK,
        threshold: input.threshold,
        useExpansion: input.useExpansion,
        includeRelated: input.includeRelated,
      });
    },

    async indexWithSemanticChunking(input) {
      if (!service) {
        throw new Error('Enhanced AI service not available — configure LLM provider first');
      }
      return service.indexWithSemanticChunking({
        companyId: input.companyId,
        sourceType: input.sourceType as any,
        sourceId: input.sourceId,
        content: input.content,
      });
    },

    async extractAndStoreFacts(input) {
      if (!service) {
        throw new Error('Enhanced AI service not available — configure LLM provider first');
      }
      return service.extractAndStoreFacts(input.conversation, {
        sourceId: input.sourceId,
        companyId: input.companyId,
      });
    },

    queryKnowledge(input) {
      if (!service) {
        return { nodes: [], edges: [] };
      }
      return service.queryKnowledge(input.query, {
        maxDepth: input.maxDepth,
        maxResults: input.maxResults,
      });
    },

    async createPlan(input) {
      if (!service) {
        throw new Error('Enhanced AI service not available — configure LLM provider first');
      }
      return service.createPlan(input.query);
    },

    getStats() {
      if (!service) {
        return {
          rag: { enabled: false },
          memory: { factsCount: 0 },
          knowledge: { nodesCount: 0 },
        };
      }
      return service.getStats();
    },
  };
}
