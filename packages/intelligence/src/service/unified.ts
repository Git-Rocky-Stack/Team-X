/**
 * Unified AI Service
 *
 * Main service layer integrating all AI/RAG modules:
 * - RAG (retrieval, caching, reranking)
 * - Long-term memory (facts, summaries)
 * - Knowledge graph (entities, relationships)
 * - Multi-turn planning
 * - Streaming responses
 * - Distributed tracing
 *
 * This is the primary interface for the desktop app.
 *
 * Phase 5 — M31 (Integration).
 */

import {
  type AggregatedMetrics,
  type EvalDataset,
  type EvalQuery,
  createRagEvaluator,
} from '../eval/index.js';
import { type QueryCache, createQueryCache } from '../rag/cache.js';
import type { EmbedTextFn } from '../rag/embeddings.js';
import {
  type EntityContext,
  type QueryExpansionService,
  createQueryExpansionService,
} from '../rag/query-expansion.js';
// RAG
import {
  type IndexSourceInput,
  type RagRepo,
  type RagService,
  type RetrievalHit,
  createRagService,
} from '../rag/service.js';

import {
  type GraphQueryResult,
  type KnowledgeGraphService,
  createInMemoryGraphRepo,
  createKnowledgeGraphService,
} from '../knowledge/index.js';
// Memory & Knowledge
import {
  type ConversationSummary,
  type ExtractedFact,
  type LongTermMemoryService,
  createInMemoryMemoryRepo,
  createLongTermMemoryService,
} from '../memory/index.js';

// Planning
import { type ExecutionPlan, type PlanExecutor, createPlanExecutor } from '../loop/planning.js';

// Streaming
import { type StreamChunk, accumulateStream } from '../streaming/index.js';

// Observability
import { type Span, type Tracer, createAgentTracer } from '../observability/index.js';

/**
 * AI service configuration.
 */
export interface AiServiceConfig {
  /** Embedding configuration — caller wires their provider via embedText. */
  embedding: {
    embedText: EmbedTextFn;
    dimension: number;
  };

  /** RAG configuration */
  rag?: {
    /**
     * Storage repo for embeddings. Required to enable RAG retrieval/indexing.
     * If omitted, RAG-dependent methods (index, query, queryStream, evaluate)
     * will throw at call time.
     */
    repo?: RagRepo;
    topK?: number;
    threshold?: number;
    cacheTtl?: number;
    enableRerank?: boolean;
    enableExpansion?: boolean;
  };

  /** Memory configuration */
  memory?: {
    summarizationTrigger?: {
      minMessages?: number;
      maxMessages?: number;
      minTimeSpan?: number;
    };
    factExtraction?: {
      minConfidence?: number;
    };
  };

  /** Knowledge graph configuration */
  knowledge?: {
    enableInference?: boolean;
  };

  /** Planning configuration */
  planning?: {
    enablePlanning?: boolean;
    planningThreshold?: number;
  };

  /** Observability configuration */
  observability?: {
    enableTracing?: boolean;
    traceSampleRate?: number;
  };

  /** LLM for summarization/fact extraction */
  llm?: {
    model: string;
    provider: string;
    complete: (prompt: string) => Promise<string>;
  };
}

/**
 * Query result with context.
 */
export interface QueryResult {
  /** Answer text */
  answer: string;

  /** Relevant retrieved chunks */
  context: RetrievalHit[];

  /** Facts used in answer */
  facts: ExtractedFact[];

  /** Related entities from knowledge graph */
  related: Array<{ entity: string; relation: string }>;

  /** Execution plan (if planning was used) */
  plan?: ExecutionPlan;

  /** Trace ID for observability */
  traceId?: string;

  /** Generation timestamp */
  timestamp: number;

  /** Generation latency (ms) */
  latencyMs: number;
}

/**
 * Streaming query result.
 */
export interface StreamingQueryResult {
  /** Stream of answer chunks */
  stream: AsyncGenerator<StreamChunk>;

  /** Final result (available after stream completes) */
  result: Promise<QueryResult>;
}

/**
 * Service statistics.
 */
export interface ServiceStats {
  /** RAG statistics */
  rag: {
    totalRetrievals: number;
    cacheHitRate: number;
    avgLatencyMs: number;
  };

  /** Memory statistics */
  memory: {
    totalFacts: number;
    totalSummaries: number;
    avgFreshness: number;
  };

  /** Knowledge graph statistics */
  knowledge: {
    totalNodes: number;
    totalEdges: number;
    connectedComponents: number;
  };

  /** Planning statistics */
  planning: {
    plansCreated: number;
    plansExecuted: number;
    avgStepsPerPlan: number;
  };

  /** Observability statistics */
  observability: {
    activeTraces: number;
    totalSpans: number;
  };
}

/**
 * Main AI service interface.
 */
export interface AiService {
  /**
   * Initialize the service.
   */
  initialize(): Promise<void>;

  /**
   * Query the AI with streaming response.
   */
  queryStream(
    companyId: string,
    query: string,
    options?: {
      topK?: number;
      threshold?: number;
      usePlan?: boolean;
      includeRelated?: boolean;
    },
  ): StreamingQueryResult;

  /**
   * Query the AI (non-streaming).
   */
  query(
    companyId: string,
    query: string,
    options?: {
      topK?: number;
      threshold?: number;
      usePlan?: boolean;
      includeRelated?: boolean;
    },
  ): Promise<QueryResult>;

  /**
   * Index content for retrieval.
   */
  index(input: IndexSourceInput): Promise<number>;

  /**
   * Extract facts from text.
   */
  extractFacts(companyId: string, sourceId: string, text: string): Promise<ExtractedFact[]>;

  /**
   * Retrieve relevant facts.
   */
  retrieveFacts(
    companyId: string,
    query: string,
    options?: {
      maxResults?: number;
      types?: string[];
    },
  ): ExtractedFact[];

  /**
   * Create conversation summary.
   */
  summarize(
    companyId: string,
    sourceId: string,
    conversation: string,
    context?: {
      title?: string;
      messageCount?: number;
      conversationStart?: number;
      conversationEnd?: number;
    },
  ): Promise<ConversationSummary>;

  /**
   * Query knowledge graph.
   */
  queryKnowledge(
    companyId: string,
    query: string,
    options?: { maxResults?: number; maxDepth?: number },
  ): GraphQueryResult;

  /**
   * Find path between entities.
   */
  findEntityPath(
    companyId: string,
    fromEntity: string,
    toEntity: string,
    maxHops?: number,
  ): { path: string[]; edges: unknown[] } | null;

  /**
   * Run evaluation on golden dataset.
   */
  evaluate(dataset: EvalQuery[]): Promise<AggregatedMetrics>;

  /**
   * Get service statistics.
   */
  getStats(companyId?: string): ServiceStats;

  /**
   * Shutdown the service.
   */
  shutdown(): Promise<void>;

  /**
   * Get underlying RAG service (for advanced usage).
   */
  getRagService(): RagService | null;

  /**
   * Get tracer (for observability).
   */
  getTracer(): Tracer | null;
}

/**
 * Create unified AI service.
 */
export function createAiService(config: AiServiceConfig): AiService {
  let initialized = false;

  // Core components
  let cache: QueryCache | null = null;
  let ragService: RagService | null = null;
  let queryExpansion: QueryExpansionService | null = null;
  let memory: LongTermMemoryService | null = null;
  let knowledge: KnowledgeGraphService | null = null;
  let planner: PlanExecutor | null = null;
  let tracer: Tracer | null = null;

  // Statistics
  const stats = {
    rag: { totalRetrievals: 0, cacheHits: 0, cacheLookups: 0 },
    memory: { factsExtracted: 0, summariesCreated: 0 },
    knowledge: { queriesRun: 0 },
    planning: { plansCreated: 0, plansExecuted: 0 },
    observability: { spansCreated: 0 },
  };

  // Initialize
  async function initialize(): Promise<void> {
    if (initialized) return;

    // Initialize cache
    cache = createQueryCache({
      ttl: config.rag?.cacheTtl ?? 300000,
      maxEntries: 1000,
    });

    // Initialize RAG service if a repo is provided
    if (config.rag?.repo) {
      ragService = createRagService({
        embedText: config.embedding.embedText,
        dimension: config.embedding.dimension,
        repo: config.rag.repo,
        cache,
        cacheTtl: config.rag.cacheTtl,
      });
    }

    // Initialize query expansion if enabled
    if (config.rag?.enableExpansion) {
      queryExpansion = createQueryExpansionService({
        llm: config.llm?.complete ? async (p) => config.llm?.complete(p) : undefined,
        hydeEnabled: !!config.llm,
      });
    }

    // Initialize memory if LLM provided
    if (config.llm) {
      memory = createLongTermMemoryService({
        repo: createInMemoryMemoryRepo(),
        summarizeFn: async (conv, _ctx) => {
          const response = await config.llm?.complete(`
Summarize this conversation in 2-3 sentences.
Focus on key decisions, facts, and action items.

Conversation:
${conv}

Respond with JSON:
{
  "summary": "string",
  "topics": ["array of topics"],
  "entities": ["array of entities"]
}
          `);
          return JSON.parse(response);
        },
        extractFactsFn: async (text, ctx) => {
          const response = await config.llm?.complete(`
Extract key facts from this text.
Focus on: status updates, decisions, relationships, preferences.

Text:
${text}

Respond with JSON array:
[
  {
    "fact": "string",
    "type": "status|decision|relationship|preference",
    "confidence": 0.0-1.0,
    "entities": ["related entities"]
  }
]
          `);
          const parsed = JSON.parse(response);
          return parsed.map((f: ExtractedFact) => ({
            ...f,
            id: `fact_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            companyId: ctx.companyId,
            sourceId: ctx.sourceId,
            observedAt: Date.now(),
            extractedAt: Date.now(),
            accessCount: 0,
            lastAccessedAt: Date.now(),
          }));
        },
        summarizationTrigger: config.memory?.summarizationTrigger,
      });

      knowledge = createKnowledgeGraphService({
        repo: createInMemoryGraphRepo(),
      });
    }

    // Initialize planner
    if (config.llm && config.planning?.enablePlanning) {
      planner = createPlanExecutor({
        llm: async (prompt) => config.llm?.complete(prompt),
        trackingOptions: {
          autoRevise: true,
          maxRevisions: 3,
          enableParallel: false,
        },
      });
    }

    // Initialize tracer
    if (config.observability?.enableTracing) {
      tracer = createAgentTracer({
        name: 'team-x-ai-service',
        version: '1.0.0',
      });
    }

    initialized = true;
  }

  // Create the service object
  const service: AiService = {
    async initialize() {
      await initialize();
    },

    queryStream(companyId, query, options = {}) {
      const topK = options.topK ?? config.rag?.topK ?? 10;
      const threshold = options.threshold ?? config.rag?.threshold ?? 0.7;
      const usePlan = options.usePlan ?? config.planning?.enablePlanning ?? false;
      const includeRelated = options.includeRelated ?? true;

      const startTime = Date.now();
      let plan: ExecutionPlan | undefined;

      // Async generator for streaming
      async function* generateStream(): AsyncGenerator<StreamChunk> {
        if (!initialized) {
          throw new Error('Service not initialized. Call initialize() first.');
        }
        if (!ragService) {
          throw new Error('RAG not configured. Provide rag.repo to enable retrieval.');
        }

        // Start trace span
        let span: Span | undefined;
        if (tracer) {
          span = tracer.startSpan('ai.query', { kind: 'server' });
        }

        try {
          // Planning step
          if (usePlan && planner) {
            const planSpan = tracer?.startSpan('query.plan', { kind: 'internal' });
            plan = await planner.createPlan(query, {
              availableTools: ['search', 'retrieve'],
            });
            if (planSpan) tracer?.endSpan(planSpan);

            // Emit plan as metadata
            yield {
              id: `chunk_${Date.now()}`,
              type: 'metadata',
              content: '',
              isFinal: false,
              index: 0,
              timestamp: Date.now(),
              metadata: { plan: planner.planToDescription(plan) },
            };
          }

          // Retrieval step
          const retrievalSpan = tracer?.startSpan('query.retrieval', { kind: 'client' });

          // Query expansion
          let expandedQuery = query;
          if (queryExpansion) {
            const entityContext: EntityContext = {
              companyId,
            };
            const expanded = await queryExpansion.expand(query, entityContext);
            const firstExpansion = expanded.expansions[0];
            if (firstExpansion) {
              expandedQuery = firstExpansion;
            }
          }

          // RAG retrieval
          const hits = await ragService.retrieve({
            companyId,
            query: expandedQuery,
            topK,
            threshold,
          });

          if (retrievalSpan) tracer?.endSpan(retrievalSpan);

          // Emit context chunks
          for (const hit of hits) {
            yield {
              id: `chunk_${Date.now()}`,
              type: 'metadata',
              content: hit.contentText,
              isFinal: false,
              index: 0,
              timestamp: Date.now(),
              metadata: {
                sourceType: hit.sourceType,
                sourceId: hit.sourceId,
                similarity: hit.similarity,
              },
            };
          }

          // Generate answer (streaming)
          const answer = `Based on the retrieved context, here's what I found: ${hits
            .slice(0, 3)
            .map((h) => h.contentText.slice(0, 50))
            .join('; ')}`;

          // Stream answer character by character
          const chunkSize = 10;
          for (let i = 0; i < answer.length; i += chunkSize) {
            yield {
              id: `chunk_${Date.now()}_${i}`,
              type: 'text',
              content: answer.slice(i, i + chunkSize),
              isFinal: false,
              index: Math.floor(i / chunkSize),
              timestamp: Date.now(),
            };
            await new Promise((resolve) => setTimeout(resolve, 10));
          }

          // Related entities from knowledge graph
          let related: Array<{ entity: string; relation: string }> = [];
          if (includeRelated && knowledge) {
            const graphResult = knowledge.query({
              companyId,
              query,
              maxResults: 5,
              maxDepth: 2,
            });
            related = graphResult.nodes.slice(0, 5).map((n) => ({
              entity: n.label,
              relation: 'related',
            }));
          }

          // Final chunk
          yield {
            id: `chunk_${Date.now()}_final`,
            type: 'control',
            content: '',
            isFinal: true,
            index: -1,
            timestamp: Date.now(),
            metadata: {
              latencyMs: Date.now() - startTime,
              relatedEntities: related,
              contextCount: hits.length,
            },
          };
        } finally {
          if (span) tracer?.endSpan(span);
        }
      }

      // Return stream and result promise
      const stream = generateStream();
      const resultPromise = (async () => {
        const chunks: StreamChunk[] = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const finalChunk = chunks.find((c) => c.isFinal);
        const metadata = finalChunk?.metadata as
          | { relatedEntities?: Array<{ entity: string; relation: string }>; contextCount?: number }
          | undefined;

        return {
          answer: chunks
            .filter((c) => c.type === 'text')
            .map((c) => c.content)
            .join(''),
          context: [],
          facts: [],
          related: metadata?.relatedEntities ?? [],
          plan,
          timestamp: startTime,
          latencyMs: Date.now() - startTime,
        };
      })();

      return { stream, result: resultPromise };
    },

    async query(companyId, query, options = {}) {
      const { stream, result } = this.queryStream(companyId, query, options);

      // Accumulate stream
      await accumulateStream(stream);

      return result;
    },

    async index(input) {
      if (!initialized) {
        throw new Error('Service not initialized. Call initialize() first.');
      }
      if (!ragService) {
        throw new Error('RAG not configured. Provide rag.repo to enable indexing.');
      }

      return ragService.indexSource(input);
    },

    async extractFacts(companyId, sourceId, text) {
      if (!memory) {
        throw new Error('Memory not enabled. Provide LLM config.');
      }

      const facts = await memory.extractFacts(text, {
        companyId,
        sourceId,
      });

      // Store in memory
      memory.storeFacts(facts);

      // Ingest into knowledge graph
      if (knowledge) {
        knowledge.ingestFacts(facts);
      }

      stats.memory.factsExtracted += facts.length;
      return facts;
    },

    retrieveFacts(companyId, query, options = {}) {
      if (!memory) {
        return [];
      }

      const maxResults = options.maxResults ?? 20;
      const ranked = memory.retrieveRankedFacts(companyId, query);

      return ranked.slice(0, maxResults).map((r) => r.fact);
    },

    async summarize(companyId, sourceId, conversation, context = {}) {
      if (!memory) {
        throw new Error('Memory not enabled. Provide LLM config.');
      }

      const summary = await memory.summarizeConversation(conversation, {
        companyId,
        sourceId,
        title: context.title,
        conversationStart: context.conversationStart ?? Date.now(),
        conversationEnd: context.conversationEnd ?? Date.now(),
        messageCount: context.messageCount ?? 1,
      });

      stats.memory.summariesCreated++;
      return summary;
    },

    queryKnowledge(companyId, query, options = {}) {
      if (!knowledge) {
        throw new Error('Knowledge graph not enabled.');
      }

      stats.knowledge.queriesRun++;
      return knowledge.query({
        companyId,
        query,
        maxResults: options.maxResults,
        maxDepth: options.maxDepth,
      });
    },

    findEntityPath(companyId, fromEntity, toEntity, maxHops = 5) {
      if (!knowledge) {
        throw new Error('Knowledge graph not enabled.');
      }

      // Find node IDs for entities
      const nodes = knowledge.query({
        companyId,
        query: fromEntity,
        maxResults: 1,
      });

      const targetNodes = knowledge.query({
        companyId,
        query: toEntity,
        maxResults: 1,
      });

      const fromNode = nodes.nodes[0];
      const toNode = targetNodes.nodes[0];
      if (!fromNode || !toNode) {
        return null;
      }

      const path = knowledge.findPath(fromNode.id, toNode.id, maxHops);

      if (!path) {
        return null;
      }

      return {
        path: path.nodeIds,
        edges: path.edges.map((e) => ({
          from: e.fromNodeId,
          to: e.toNodeId,
          relation: e.relation,
          weight: e.weight,
        })),
      };
    },

    async evaluate(dataset) {
      if (!ragService) {
        throw new Error('RAG not configured. Provide rag.repo to enable evaluation.');
      }
      const rag = ragService;

      const evaluator = createRagEvaluator({
        retrieve: async (query, options) => {
          const startedAt = Date.now();
          const hits = await rag.retrieve({
            companyId: options.companyId ?? 'eval',
            query,
            topK: options.topK,
            threshold: options.threshold,
          });
          const latencyMs = Date.now() - startedAt;
          return {
            queryId: query,
            retrievedDocs: hits.map((h, idx) => ({
              id: h.sourceId,
              score: h.similarity,
              content: h.contentText,
              chunkIndex: idx,
            })),
            latencyMs,
            timestamp: Date.now(),
          };
        },
      });

      const evalDataset: EvalDataset = {
        name: 'inline-dataset',
        version: '1.0.0',
        queries: dataset,
        metadata: {
          createdAt: Date.now(),
          lastUpdated: Date.now(),
        },
      };

      const result = await evaluator.evaluateDataset(evalDataset);
      return result.aggregated;
    },

    getStats(_companyId) {
      return {
        rag: {
          totalRetrievals: stats.rag.totalRetrievals,
          cacheHitRate:
            stats.rag.cacheLookups > 0 ? stats.rag.cacheHits / stats.rag.cacheLookups : 0,
          avgLatencyMs: 0, // Would be tracked in real implementation
        },
        memory: {
          totalFacts: stats.memory.factsExtracted,
          totalSummaries: stats.memory.summariesCreated,
          avgFreshness: 0.8, // Placeholder
        },
        knowledge: {
          totalNodes: 0,
          totalEdges: 0,
          connectedComponents: 0,
        },
        planning: {
          plansCreated: stats.planning.plansCreated,
          plansExecuted: stats.planning.plansExecuted,
          avgStepsPerPlan: 0,
        },
        observability: {
          activeTraces: 0,
          totalSpans: stats.observability.spansCreated,
        },
      };
    },

    async shutdown() {
      // Cleanup resources
      if (cache) {
        // Cache cleanup if needed
      }
      initialized = false;
    },

    getRagService() {
      return ragService;
    },

    getTracer() {
      return tracer;
    },
  };

  return service;
}
