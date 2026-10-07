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
  type KnowledgeGraphRepo,
  type KnowledgeGraphService,
  createInMemoryGraphRepo,
  createKnowledgeGraphService,
} from '../knowledge/index.js';
// Memory & Knowledge
import {
  type ConversationSummary,
  type ExtractedFact,
  type FactType,
  type LongTermMemoryRepo,
  type LongTermMemoryService,
  createInMemoryMemoryRepo,
  createLongTermMemoryService,
} from '../memory/index.js';

import { parseModelJson } from './model-json.js';

// Planning
import { type ExecutionPlan, type PlanExecutor, createPlanExecutor } from '../loop/planning.js';

// Streaming
import { type StreamChunk, accumulateStream } from '../streaming/index.js';

// Observability
import {
  type Span,
  type SpanKind,
  type Tracer,
  createAgentTracer,
} from '../observability/index.js';

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
    /**
     * An existing RAG service to retrieve and index through, instead of
     * building a second one over `repo`. A second instance carries its own
     * query cache that writes through the first never invalidate, so content
     * indexed elsewhere stays invisible for the cache TTL.
     */
    service?: RagService;
    topK?: number;
    threshold?: number;
    cacheTtl?: number;
    enableRerank?: boolean;
    enableExpansion?: boolean;
  };

  /** Memory configuration */
  memory?: {
    /**
     * Storage for extracted facts and summaries. Defaults to an in-memory
     * store, which forgets everything when the process exits — pass a
     * persistent repo for memory that is actually long-term.
     */
    repo?: LongTermMemoryRepo;
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
    /** Storage for graph nodes and edges. Defaults to an in-memory store. */
    repo?: KnowledgeGraphRepo;
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
 * Grounding for a question, without an answer. See `AiService.retrieve`.
 */
export interface RetrieveResult {
  /** Retrieved passages, best first. */
  context: RetrievalHit[];
  /** Remembered facts that bear on the question, most relevant first. */
  facts: ExtractedFact[];
  /** Knowledge-graph entities the question mentions, and their neighbours. */
  related: Array<{ entity: string; relation: string }>;
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
   * Assemble the grounding for a question — retrieved passages (after query
   * expansion, when enabled), relevant remembered facts and knowledge-graph
   * entities — without generating an answer.
   *
   * For callers that already own a model, such as an agent loop that should
   * compose its own reply: `query` would spend a second model call on an
   * answer the caller discards.
   */
  retrieve(
    companyId: string,
    query: string,
    options?: {
      topK?: number;
      threshold?: number;
      /** Include remembered facts. Default true; empty when memory is off. */
      includeFacts?: boolean;
      maxFacts?: number;
      /** Include knowledge-graph entities. Default true; empty when the graph is off. */
      includeRelated?: boolean;
      maxRelated?: number;
    },
  ): Promise<RetrieveResult>;

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

const FACT_TYPES: ReadonlySet<FactType> = new Set<FactType>([
  'preference',
  'status',
  'decision',
  'relationship',
  'event',
  'metric',
  'procedure',
  'custom',
]);

/**
 * Turn a model's fact-extraction reply into stored facts.
 *
 * The reply is untrusted shape: anything that is not an object with a
 * non-empty `fact` string and a finite `confidence` is dropped rather than
 * stored as a malformed row. An unknown `type` is kept as `custom`, and only
 * string entities survive. Fields are copied explicitly so a reply cannot
 * inject keys such as `id` or `companyId`.
 */
function toExtractedFacts(
  parsed: unknown,
  ctx: { companyId: string; sourceId: string },
): ExtractedFact[] {
  if (!Array.isArray(parsed)) return [];
  const now = Date.now();
  const facts: ExtractedFact[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const raw = item as Record<string, unknown>;
    if (typeof raw.fact !== 'string' || raw.fact.trim().length === 0) continue;
    if (typeof raw.confidence !== 'number' || !Number.isFinite(raw.confidence)) continue;
    const type =
      typeof raw.type === 'string' && FACT_TYPES.has(raw.type as FactType)
        ? (raw.type as FactType)
        : 'custom';
    const entities = Array.isArray(raw.entities)
      ? raw.entities.filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
      : [];
    facts.push({
      id: `fact_${now}_${Math.random().toString(36).slice(2)}`,
      companyId: ctx.companyId,
      sourceId: ctx.sourceId,
      fact: raw.fact.trim(),
      type,
      confidence: Math.min(1, Math.max(0, raw.confidence)),
      entities,
      observedAt: now,
      extractedAt: now,
      accessCount: 0,
      lastAccessedAt: now,
    });
  }
  return facts;
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
    rag: { totalRetrievals: 0, completedQueries: 0, totalLatencyMs: 0 },
    memory: { factsExtracted: 0, summariesCreated: 0 },
    knowledge: { queriesRun: 0 },
    planning: { plansCreated: 0, plansExecuted: 0, totalSteps: 0 },
    observability: { spansCreated: 0, activeRootSpans: 0 },
  };

  // Held here as well as inside the memory service so `getStats` can count
  // what is actually stored rather than what this process happened to extract.
  const memoryRepo = config.memory?.repo ?? createInMemoryMemoryRepo();

  /**
   * Span helpers that also feed `getStats().observability`. Root (`server`)
   * spans are the requests in flight, which is what "active traces" counts.
   */
  function startSpan(name: string, kind: SpanKind): Span | undefined {
    if (!tracer) return undefined;
    stats.observability.spansCreated += 1;
    if (kind === 'server') stats.observability.activeRootSpans += 1;
    return tracer.startSpan(name, { kind });
  }
  function endSpan(span: Span | undefined, kind: SpanKind): void {
    if (!span) return;
    if (kind === 'server') stats.observability.activeRootSpans -= 1;
    tracer?.endSpan(span);
  }

  // Initialize
  async function initialize(): Promise<void> {
    if (initialized) return;

    // Initialize cache
    cache = createQueryCache({
      ttl: config.rag?.cacheTtl ?? 300000,
      maxEntries: 1000,
    });

    // Use the caller's RAG service when given; otherwise build one if a repo is provided
    if (config.rag?.service) {
      ragService = config.rag.service;
    } else if (config.rag?.repo) {
      ragService = createRagService({
        embedText: config.embedding.embedText,
        dimension: config.embedding.dimension,
        repo: config.rag.repo,
        cache,
        cacheTtl: config.rag.cacheTtl,
      });
    }

    // Initialize query expansion if enabled.
    //
    // Why capture `config.llm?.complete` into a local: the closure passed to
    // createQueryExpansionService must return Promise<string>, not
    // Promise<string | undefined>. TS can't track the outer optional-chain's
    // narrowing across the closure boundary, so we capture the resolved
    // function once and let the closure reference the narrowed local. Same
    // pattern as the memory + planner blocks below. Audit 2026-05-07
    // pre-existing typecheck debt (handoff §6e) — H7-adjacent cleanup.
    if (config.rag?.enableExpansion) {
      const completeFn = config.llm?.complete;
      queryExpansion = createQueryExpansionService({
        llm: completeFn ? async (p) => completeFn(p) : undefined,
        hydeEnabled: !!config.llm,
      });
    }

    // Initialize memory if LLM provided
    if (config.llm) {
      const llm = config.llm;
      memory = createLongTermMemoryService({
        repo: memoryRepo,
        summarizeFn: async (conv, _ctx) => {
          const response = await llm.complete(`
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
          return parseModelJson(response) as {
            summary: string;
            topics: string[];
            entities: string[];
          };
        },
        extractFactsFn: async (text, ctx) => {
          const response = await llm.complete(`
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
          return toExtractedFacts(parseModelJson(response), ctx);
        },
        summarizationTrigger: config.memory?.summarizationTrigger,
      });

      knowledge = createKnowledgeGraphService({
        repo: config.knowledge?.repo ?? createInMemoryGraphRepo(),
      });
    }

    // Initialize planner
    if (config.llm && config.planning?.enablePlanning) {
      const llm = config.llm;
      planner = createPlanExecutor({
        llm: async (prompt) => llm.complete(prompt),
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

  /**
   * Generate the answer for a query from its retrieved context.
   *
   * Grounding rules are stated to the model explicitly: answer from the
   * supplied context, and say so when the context does not cover the
   * question. That is what keeps a retrieval-backed answer honest — the
   * alternative (letting the model fill gaps silently) is how a RAG system
   * starts inventing citations.
   *
   * With no LLM configured there is nothing that can write prose. The
   * service returns a plainly-labelled digest rather than dressing a
   * string-concatenation up as a generated answer.
   */
  async function generateAnswer(query: string, hits: RetrievalHit[]): Promise<string> {
    const llm = config.llm;
    if (!llm) {
      const digest =
        hits.length > 0
          ? hits.map((h, i) => `[${i + 1}] ${h.contentText}`).join('\n')
          : '(no matching context found)';
      return `No language model is configured, so this is the retrieved context rather than a generated answer:\n${digest}`;
    }

    const context =
      hits.length > 0
        ? hits
            .map((h, i) => `[${i + 1}] (source: ${h.sourceType}/${h.sourceId})\n${h.contentText}`)
            .join('\n\n')
        : '(no matching context was retrieved)';

    return llm.complete(
      [
        'Answer the question using only the context below.',
        'If the context does not contain the answer, say so plainly instead of guessing.',
        'Cite the bracketed context numbers you relied on.',
        '',
        'Context:',
        context,
        '',
        `Question: ${query}`,
      ].join('\n'),
    );
  }

  /**
   * Retrieve passages for a question, expanding the query first when
   * expansion is enabled. Shared by `queryStream` and `retrieve` so the two
   * cannot drift on how grounding is gathered.
   */
  async function retrieveHits(
    rag: RagService,
    companyId: string,
    query: string,
    topK: number,
    threshold: number,
  ): Promise<RetrievalHit[]> {
    let expandedQuery = query;
    if (queryExpansion) {
      const entityContext: EntityContext = { companyId };
      const expanded = await queryExpansion.expand(query, entityContext);
      const firstExpansion = expanded.expansions[0];
      if (firstExpansion) {
        expandedQuery = firstExpansion;
      }
    }

    const hits = await rag.retrieve({ companyId, query: expandedQuery, topK, threshold });
    stats.rag.totalRetrievals += 1;
    return hits;
  }

  /** Knowledge-graph entities a question mentions, plus their neighbours. */
  function relatedEntities(
    companyId: string,
    query: string,
    maxResults: number,
  ): Array<{ entity: string; relation: string }> {
    if (!knowledge) return [];
    const graphResult = knowledge.query({ companyId, query, maxResults, maxDepth: 2 });
    stats.knowledge.queriesRun += 1;
    return graphResult.nodes.slice(0, maxResults).map((n) => ({
      entity: n.label,
      relation: 'related',
    }));
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

      // The result promise is settled by the generator itself rather than by
      // a second `for await` over the same stream. Iterating one async
      // generator from two consumers hands each of them a disjoint subset of
      // the chunks, which silently truncated every answer to roughly half its
      // characters (audit F13).
      let settleResult: (value: QueryResult) => void = () => undefined;
      let failResult: (reason: unknown) => void = () => undefined;
      const result = new Promise<QueryResult>((resolve, reject) => {
        settleResult = resolve;
        failResult = reject;
      });
      // A caller that consumes the stream directly and ignores `result` must
      // not trip an unhandled-rejection warning when generation fails; real
      // awaiters still observe the rejection.
      result.catch(() => undefined);

      async function* generateStream(): AsyncGenerator<StreamChunk> {
        if (!initialized) {
          throw new Error('Service not initialized. Call initialize() first.');
        }
        if (!ragService) {
          throw new Error('RAG not configured. Provide rag.repo to enable retrieval.');
        }

        // Start trace span
        const span = startSpan('ai.query', 'server');

        try {
          // Planning step
          if (usePlan && planner) {
            const planSpan = startSpan('query.plan', 'internal');
            plan = await planner.createPlan(query, {
              availableTools: ['search', 'retrieve'],
            });
            endSpan(planSpan, 'internal');
            stats.planning.plansCreated += 1;
            stats.planning.totalSteps += plan.steps.length;

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
          const retrievalSpan = startSpan('query.retrieval', 'client');

          const hits = await retrieveHits(ragService, companyId, query, topK, threshold);

          endSpan(retrievalSpan, 'client');

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

          // ---- Answer generation ---------------------------------------
          //
          // This previously built the "answer" by splicing the first 50
          // characters off the top three hits into a fixed sentence, while
          // `config.llm.complete` sat wired and unused. A configured
          // provider must actually generate the answer; with no provider the
          // service says so plainly instead of dressing a digest up as one.
          const generateSpan = startSpan('query.generate', 'client');
          let answer: string;
          try {
            answer = await generateAnswer(query, hits);
          } finally {
            endSpan(generateSpan, 'client');
          }

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
          }

          // Related entities from knowledge graph
          const related = includeRelated ? relatedEntities(companyId, query, 5) : [];

          // Settle BEFORE the terminal yield. Consumers (including
          // `accumulateStream`) legitimately `break` as soon as they see
          // `isFinal`, which suspends this generator at that yield forever —
          // anything after it would never run and `result` would hang.
          stats.rag.completedQueries += 1;
          stats.rag.totalLatencyMs += Date.now() - startTime;
          settleResult({
            answer,
            context: hits,
            facts: [],
            related,
            plan,
            timestamp: startTime,
            latencyMs: Date.now() - startTime,
          });

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
        } catch (err) {
          failResult(err);
          throw err;
        } finally {
          endSpan(span, 'server');
        }
      }

      return { stream: generateStream(), result };
    },

    async query(companyId, query, options = {}) {
      // Lexical, not receiver-based: `this.queryStream` breaks the moment a
      // caller destructures `query` off the service or passes it as a callback.
      const { stream, result } = service.queryStream(companyId, query, options);

      // Drain the stream exactly once — the generator settles `result` on
      // its own as it finishes.
      await accumulateStream(stream);

      return result;
    },

    async retrieve(companyId, query, options = {}) {
      if (!initialized) {
        throw new Error('Service not initialized. Call initialize() first.');
      }
      if (!ragService) {
        throw new Error('RAG not configured. Provide rag.repo to enable retrieval.');
      }

      const span = startSpan('ai.retrieve', 'server');
      try {
        const context = await retrieveHits(
          ragService,
          companyId,
          query,
          options.topK ?? config.rag?.topK ?? 10,
          options.threshold ?? config.rag?.threshold ?? 0.7,
        );
        const facts =
          options.includeFacts !== false && memory
            ? memory
                .retrieveRankedFacts(companyId, query)
                .slice(0, options.maxFacts ?? 10)
                .map((r) => r.fact)
            : [];
        const related =
          options.includeRelated !== false
            ? relatedEntities(companyId, query, options.maxRelated ?? 10)
            : [];
        return { context, facts, related };
      } finally {
        endSpan(span, 'server');
      }
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

    getStats(companyId) {
      // Every figure is measured. Company-scoped stores (memory, the graph)
      // need a company: a process-wide call legitimately has nothing to count
      // there, and reports zero rather than a placeholder.
      const graphStats =
        knowledge && companyId !== undefined ? knowledge.getStats(companyId) : null;
      const liveFacts =
        memory && companyId !== undefined ? memory.retrieveRankedFacts(companyId) : [];

      return {
        rag: {
          totalRetrievals: stats.rag.totalRetrievals,
          // From whichever service actually answers queries (an injected one
          // may carry no cache at all, which is a hit rate of zero).
          cacheHitRate: ragService?.getCacheStats?.()?.hitRate ?? 0,
          avgLatencyMs:
            stats.rag.completedQueries > 0
              ? stats.rag.totalLatencyMs / stats.rag.completedQueries
              : 0,
        },
        memory: {
          totalFacts: liveFacts.length,
          totalSummaries:
            memory && companyId !== undefined
              ? memoryRepo.listSummariesByCompany(companyId).length
              : 0,
          avgFreshness:
            liveFacts.length > 0
              ? liveFacts.reduce((sum, f) => sum + f.score.finalScore, 0) / liveFacts.length
              : 0,
        },
        knowledge: {
          totalNodes: graphStats?.totalNodes ?? 0,
          totalEdges: graphStats?.totalEdges ?? 0,
          connectedComponents: graphStats?.connectedComponents ?? 0,
        },
        planning: {
          plansCreated: stats.planning.plansCreated,
          // Plans are created here to shape retrieval, never executed by this
          // service, so the honest count is the one it keeps: zero.
          plansExecuted: stats.planning.plansExecuted,
          avgStepsPerPlan:
            stats.planning.plansCreated > 0
              ? stats.planning.totalSteps / stats.planning.plansCreated
              : 0,
        },
        observability: {
          activeTraces: stats.observability.activeRootSpans,
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
