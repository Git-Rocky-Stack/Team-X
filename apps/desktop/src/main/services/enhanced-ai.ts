/**
 * Enhanced AI Service
 *
 * Desktop integration layer over the `@team-x/intelligence` stack:
 * - Semantic chunking, query expansion
 * - Long-term memory, knowledge graph
 * - Multi-turn planning, streaming responses, distributed tracing
 *
 * Phase 5 — M32 (Desktop Integration).
 */

import {
  type KnowledgeGraphRepo,
  type LongTermMemoryRepo,
  type PlanExecutor,
  type RagRepo,
  type RagService,
  accumulateStream,
  createAiService,
  createPlanExecutor,
  chunkText as semanticChunkText,
} from '@team-x/intelligence';
import type { EmbeddingSourceType } from '@team-x/shared-types';

/**
 * Multi-turn execution plan returned by `createPlan` / surfaced in
 * `enhancedQuery` when planning is on. The shape is intentionally narrow so
 * consumers (renderer Plan-panel, eval scripts) can rely on the three
 * top-level fields; `steps` carries the intelligence package's `PlanStep`
 * objects verbatim.
 */
export interface ExecutionPlan {
  id: string;
  query: string;
  steps: unknown[];
}

/**
 * Runtime feature flags for the Enhanced AI subsystem.
 *
 * These mirror `SettingsGetEnhancedAiConfigResponse` one-for-one. Before
 * this existed, `settings.getEnhancedAiConfig` / `setEnhancedAiConfig` were
 * the ONLY readers of those settings rows — every Switch in
 * Settings → Enhanced AI persisted a value that nothing consumed.
 */
export interface EnhancedAiFeatureFlags {
  /** Expand queries before retrieval to improve recall. */
  queryExpansionEnabled?: boolean;
  /** Split on content boundaries instead of a fixed character window. */
  semanticChunkingEnabled?: boolean;
  /** Extract and persist facts from conversations. */
  longTermMemoryEnabled?: boolean;
  /** Build and query the cross-thread entity graph. */
  knowledgeGraphEnabled?: boolean;
  /** Decompose complex queries into a multi-step plan. */
  planningEnabled?: boolean;
  /** Minimum query length (chars) before planning engages. */
  planningThreshold?: number;
  /** Emit incremental text chunks rather than one final answer. */
  streamingEnabled?: boolean;
  /** Record spans for retrieval / generation. */
  tracingEnabled?: boolean;
  /** Fraction of traces sampled (0.0–1.0). */
  tracingSampleRate?: number;
}

/**
 * Enhanced AI service options.
 */
export interface EnhancedAiServiceOptions {
  /** Existing RAG service */
  ragService: RagService | null;

  /** Embedding function */
  embedText: (texts: string[]) => Promise<number[][]>;

  /** Embedding dimension */
  dimension: number;

  /** RAG repository */
  ragRepo: RagRepo;

  /** LLM completion function */
  llmComplete?: (prompt: string) => Promise<string>;

  /**
   * Persistent storage for long-term memory and the knowledge graph. Omitted,
   * both fall back to in-memory stores that forget everything at exit.
   */
  memoryRepo?: LongTermMemoryRepo;
  knowledgeRepo?: KnowledgeGraphRepo;

  /**
   * Feature flags from Settings → Enhanced AI.
   *
   * Pass a function to have the per-call gates (memory, knowledge graph,
   * streaming, chunking, planning) re-read on every invocation, so toggling
   * a switch takes effect immediately. The two flags consumed when the
   * underlying pipeline is constructed — query expansion and tracing — are
   * read once, at construction.
   */
  features?: EnhancedAiFeatureFlags | (() => EnhancedAiFeatureFlags);
}

/**
 * Enhanced AI service interface.
 */
export interface EnhancedAiService {
  /**
   * Query with RAG + expansion + knowledge.
   */
  enhancedQuery(
    query: string,
    options: {
      companyId: string;
      topK?: number;
      threshold?: number;
      includeRelated?: boolean;
      usePlanning?: boolean;
    },
  ): Promise<{
    answer: string;
    context: Array<{ sourceId: string; content: string; similarity: number }>;
    related?: Array<{ entity: string; relation: string }>;
    plan?: ExecutionPlan;
  }>;

  /**
   * Grounding for a question — retrieved passages, remembered facts and
   * knowledge-graph entities — without generating an answer. Facts follow the
   * Long-Term Memory switch and entities the Knowledge Graph switch, so a
   * caller that composes its own reply (the Copilot) honours both.
   */
  retrieveContext(
    query: string,
    options: { companyId: string; topK?: number; threshold?: number },
  ): Promise<EnhancedAiContext>;

  /**
   * Index with semantic chunking.
   */
  indexWithSemanticChunking(input: {
    companyId: string;
    sourceType: EmbeddingSourceType;
    sourceId: string;
    content: string;
  }): Promise<number>;

  /**
   * Extract and store facts.
   */
  extractAndStoreFacts(
    conversation: string,
    options: {
      sourceId: string;
      companyId: string;
    },
  ): Promise<number>;

  /**
   * Query knowledge graph.
   */
  queryKnowledge(
    query: string,
    options: {
      companyId: string;
      maxDepth?: number;
      maxResults?: number;
    },
  ): {
    nodes: Array<{ id: string; label: string; type: string }>;
    edges: Array<{ from: string; to: string; relation: string }>;
  };

  /**
   * Create execution plan for complex query.
   */
  createPlan(query: string): Promise<ExecutionPlan>;

  /**
   * Stream response chunks.
   */
  streamQuery(
    query: string,
    options: { companyId: string; topK?: number; threshold?: number },
  ): AsyncGenerator<{
    type: string;
    content: string;
    isFinal: boolean;
  }>;

  /**
   * Get service statistics, scoped to one company when `companyId` is given.
   */
  getStats(companyId?: string): {
    rag: { enabled: boolean };
    memory: { factsCount: number };
    knowledge: { nodesCount: number };
  };
}

/** What `retrieveContext` returns: grounding only, no generated answer. */
export interface EnhancedAiContext {
  passages: Array<{ sourceType: string; sourceId: string; content: string; similarity: number }>;
  facts: Array<{ fact: string; type: string; confidence: number }>;
  related: Array<{ entity: string; relation: string }>;
}

/**
 * Fixed-window chunker with overlap — the synchronous fallback used when
 * semantic chunking is disabled.
 *
 * The cursor advances by a fixed `stride` (window minus overlap) rather than
 * being derived from the previous window's end. Deriving it from `end` is
 * what made the original implementation non-terminating: once a window was
 * clamped to `content.length`, `end - overlap` parked the cursor at a fixed
 * point short of the end and the same tail chunk was re-emitted forever,
 * exhausting the heap. A fixed positive stride makes termination structural.
 *
 * `overlap` is clamped to at most half the window so a caller-supplied
 * degenerate value (>= the window size) can neither stall the cursor nor
 * explode the chunk count.
 */
export function chunkText(content: string, maxSize = 512, overlap = 64): string[] {
  if (content.length === 0) return [];

  const windowSize = Math.max(1, Math.floor(maxSize));
  const overlapSize = Math.min(Math.max(0, Math.floor(overlap)), Math.floor(windowSize / 2));
  const stride = windowSize - overlapSize;

  const chunks: string[] = [];
  for (let start = 0; start < content.length; start += stride) {
    const end = Math.min(start + windowSize, content.length);
    chunks.push(content.slice(start, end));
    // The terminal window always reaches the end; stopping here prevents a
    // trailing chunk that is wholly contained in its predecessor.
    if (end === content.length) break;
  }

  return chunks;
}

/**
 * Every operation is company-scoped and takes the id explicitly. There used to
 * be a `'default'` fallback, which no company row ever had: reads against it
 * came back empty and, once memory persisted, writes against it would fail
 * the company foreign key.
 */
function requireCompany(companyId: string | undefined, operation: string): string {
  if (typeof companyId !== 'string' || companyId.length === 0) {
    throw new Error(`[enhanced-ai] ${operation}: companyId is required`);
  }
  return companyId;
}

/**
 * Create the Enhanced AI service.
 *
 * Composes the real `@team-x/intelligence` stack — RAG retrieval, query
 * expansion, semantic chunking, long-term memory, the knowledge graph,
 * multi-turn planning and tracing — behind the narrow surface the IPC layer
 * consumes.
 *
 * This replaces a simulation shim that accepted a fully-wired `llmComplete`,
 * `embedText`, `ragRepo` and `dimension` and discarded all four:
 * `enhancedQuery` answered with the string "Found N relevant context
 * items.", `streamQuery` echoed the caller's own question back word by word
 * on a 20ms timer, `extractAndStoreFacts` returned 0, `queryKnowledge`
 * returned an empty graph, `createPlan` returned `{ id: 'placeholder' }` and
 * `getStats` returned hardcoded zeros. Every flag in Settings → Enhanced AI
 * is read here, so those switches now change behaviour instead of only
 * writing a settings row nothing consumed.
 */
export function createEnhancedAiService(options: EnhancedAiServiceOptions): EnhancedAiService {
  const readFlags = (): EnhancedAiFeatureFlags =>
    typeof options.features === 'function' ? options.features() : (options.features ?? {});

  /** Resolve the current flags, applying defaults for anything unset. */
  function features(): Required<EnhancedAiFeatureFlags> {
    const f = readFlags();
    return {
      queryExpansionEnabled: f.queryExpansionEnabled ?? true,
      semanticChunkingEnabled: f.semanticChunkingEnabled ?? true,
      longTermMemoryEnabled: f.longTermMemoryEnabled ?? true,
      knowledgeGraphEnabled: f.knowledgeGraphEnabled ?? true,
      planningEnabled: f.planningEnabled ?? false,
      planningThreshold: f.planningThreshold ?? 0,
      streamingEnabled: f.streamingEnabled ?? true,
      tracingEnabled: f.tracingEnabled ?? false,
      tracingSampleRate: f.tracingSampleRate ?? 0.1,
    };
  }

  // Snapshot for the flags the pipeline bakes in at construction.
  const constructionFlags = features();

  const llmComplete = options.llmComplete;

  const ai = createAiService({
    embedding: { embedText: options.embedText, dimension: options.dimension },
    rag: {
      repo: options.ragRepo,
      // Retrieve through the indexer's own service when one is supplied. This
      // option used to be accepted and ignored, so Enhanced AI ran a second
      // RagService whose query cache the indexer's writes never invalidated.
      ...(options.ragService ? { service: options.ragService } : {}),
      enableExpansion: constructionFlags.queryExpansionEnabled,
    },
    ...(options.memoryRepo ? { memory: { repo: options.memoryRepo } } : {}),
    ...(options.knowledgeRepo ? { knowledge: { repo: options.knowledgeRepo } } : {}),
    planning: {
      enablePlanning: constructionFlags.planningEnabled,
      planningThreshold: constructionFlags.planningThreshold,
    },
    observability: {
      enableTracing: constructionFlags.tracingEnabled,
      traceSampleRate: constructionFlags.tracingSampleRate,
    },
    // The model backs answer generation, fact extraction and summarisation.
    // Memory / graph are additionally gated per-flag at the call sites below,
    // because the package builds both whenever an LLM is present.
    ...(llmComplete
      ? { llm: { model: 'enhanced-ai', provider: 'resolved', complete: llmComplete } }
      : {}),
  });

  /**
   * `createAiService` requires an async `initialize()` before use, but the
   * IPC surface is constructed synchronously at boot. Initialize once,
   * lazily, and share the promise so concurrent callers cannot race two
   * initializations.
   */
  let initPromise: Promise<void> | null = null;
  function ready(): Promise<void> {
    // A rejected initialization is not cached: the next call retries rather
    // than replaying the same failure for the life of the process.
    initPromise ??= ai.initialize().catch((err: unknown) => {
      initPromise = null;
      throw err;
    });
    return initPromise;
  }

  // `queryKnowledge` and `getStats` are synchronous on this interface, so
  // they can only report once initialization has actually landed.
  let initialized = false;
  void ready().then(
    () => {
      initialized = true;
    },
    (err: unknown) => {
      console.error('[enhanced-ai] initialization failed:', err);
    },
  );

  /**
   * Standalone planner for `createPlan`. The unified service applies planning
   * inside a query; `createPlan` is a direct entry point the renderer's plan
   * panel calls on its own, so it needs its own executor.
   */
  let planner: PlanExecutor | null = null;
  function getPlanner(): PlanExecutor | null {
    if (!llmComplete || !features().planningEnabled) return null;
    planner ??= createPlanExecutor({
      llm: async (prompt: string) => llmComplete(prompt),
      trackingOptions: { autoRevise: true, maxRevisions: 3, enableParallel: false },
    });
    return planner;
  }

  return {
    async enhancedQuery(query, queryOptions) {
      const companyId = requireCompany(queryOptions?.companyId, 'enhancedQuery');
      await ready();
      const flags = features();

      const result = await ai.query(companyId, query, {
        topK: queryOptions.topK ?? 10,
        threshold: queryOptions.threshold ?? 0.7,
        usePlan:
          (queryOptions.usePlanning ?? flags.planningEnabled) &&
          query.length >= flags.planningThreshold,
        includeRelated: queryOptions.includeRelated ?? flags.knowledgeGraphEnabled,
      });

      return {
        answer: result.answer,
        context: result.context.map((hit) => ({
          sourceId: hit.sourceId,
          content: hit.contentText,
          similarity: hit.similarity,
        })),
        related: result.related,
        ...(result.plan
          ? { plan: { id: result.plan.id, query: result.plan.query, steps: result.plan.steps } }
          : {}),
      };
    },

    async retrieveContext(query, retrieveOptions) {
      const companyId = requireCompany(retrieveOptions?.companyId, 'retrieveContext');
      await ready();
      const flags = features();

      const result = await ai.retrieve(companyId, query, {
        topK: retrieveOptions.topK ?? 8,
        threshold: retrieveOptions.threshold ?? 0.3,
        includeFacts: flags.longTermMemoryEnabled,
        includeRelated: flags.knowledgeGraphEnabled,
      });

      return {
        passages: result.context.map((hit) => ({
          sourceType: hit.sourceType,
          sourceId: hit.sourceId,
          content: hit.contentText,
          similarity: hit.similarity,
        })),
        facts: result.facts.map((f) => ({ fact: f.fact, type: f.type, confidence: f.confidence })),
        related: result.related,
      };
    },

    async indexWithSemanticChunking(input) {
      requireCompany(input.companyId, 'indexWithSemanticChunking');
      await ready();

      // Semantic chunking splits on real content boundaries (headings,
      // paragraphs, code fences) rather than a blind character window —
      // which is the entire point of the toggle.
      const chunks = features().semanticChunkingEnabled
        ? await semanticChunkText(input.content)
        : chunkText(input.content);

      // Chunks are stored as `<sourceId>#<i>` (see below), so a re-index that
      // produces fewer chunks — or switches between one and several — must
      // first clear every row the previous indexing wrote. Deleting only the
      // ids about to be rewritten left `X#3`, `X#4` serving deleted text.
      const previous = new Set(
        options.ragRepo
          .listByCompany(input.companyId)
          .map((row) => row.sourceId)
          .filter((id) => id === input.sourceId || id.startsWith(`${input.sourceId}#`)),
      );
      for (const id of previous) options.ragRepo.deleteBySource(id);
      if (previous.size > 0) ai.getRagService()?.invalidateCache?.(input.companyId);

      let indexed = 0;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (chunk === undefined || chunk.trim().length === 0) continue;
        indexed += await ai.index({
          companyId: input.companyId,
          sourceType: input.sourceType,
          // Each chunk needs a distinct source id, otherwise the repo upsert
          // collapses them onto one row and only the last chunk survives.
          sourceId: chunks.length > 1 ? `${input.sourceId}#${i}` : input.sourceId,
          content: chunk,
        });
      }
      return indexed;
    },

    async extractAndStoreFacts(conversation, factOptions) {
      const companyId = requireCompany(factOptions?.companyId, 'extractAndStoreFacts');
      if (!features().longTermMemoryEnabled || !llmComplete) return 0;
      await ready();

      const facts = await ai.extractFacts(companyId, factOptions.sourceId, conversation);
      return facts.length;
    },

    queryKnowledge(query, knowledgeOptions) {
      const companyId = requireCompany(knowledgeOptions?.companyId, 'queryKnowledge');
      if (!features().knowledgeGraphEnabled || !initialized) {
        return { nodes: [], edges: [] };
      }

      const graph = ai.queryKnowledge(companyId, query, {
        maxDepth: knowledgeOptions.maxDepth ?? 2,
        maxResults: knowledgeOptions.maxResults ?? 20,
      });

      return {
        nodes: graph.nodes.map((n) => ({ id: n.id, label: n.label, type: n.type })),
        edges: graph.edges.map((e) => ({
          from: e.fromNodeId,
          to: e.toNodeId,
          relation: e.relation,
        })),
      };
    },

    async createPlan(query) {
      await ready();
      const executor = getPlanner();
      if (!executor) {
        throw new Error(
          'Enhanced AI planning is disabled — enable Multi-Turn Planning in Settings → Enhanced AI and configure an LLM provider.',
        );
      }

      const plan = await executor.createPlan(query, { availableTools: ['search', 'retrieve'] });
      return { id: plan.id, query: plan.query, steps: plan.steps };
    },

    async *streamQuery(query, streamOptions) {
      const companyId = requireCompany(streamOptions?.companyId, 'streamQuery');
      await ready();
      const flags = features();

      const { stream, result } = ai.queryStream(companyId, query, {
        topK: streamOptions.topK ?? 10,
        threshold: streamOptions.threshold ?? 0.7,
        includeRelated: flags.knowledgeGraphEnabled,
      });

      if (!flags.streamingEnabled) {
        // Streaming off: run to completion and hand the caller the whole
        // answer in one frame rather than a token drip.
        await accumulateStream(stream);
        const finished = await result;
        yield { type: 'text', content: finished.answer, isFinal: false };
        yield { type: 'control', content: '', isFinal: true };
        return;
      }

      for await (const chunk of stream) {
        // Retrieved context rides the same stream as metadata frames; the
        // IPC contract carries only answer text plus a terminal control frame.
        if (chunk.type === 'text') {
          yield { type: 'text', content: chunk.content, isFinal: false };
        }
      }
      yield { type: 'control', content: '', isFinal: true };
    },

    getStats(companyId) {
      if (!initialized) {
        return {
          rag: { enabled: options.ragRepo !== undefined },
          memory: { factsCount: 0 },
          knowledge: { nodesCount: 0 },
        };
      }

      const stats = ai.getStats(companyId);
      return {
        rag: { enabled: true },
        memory: { factsCount: stats.memory.totalFacts },
        knowledge: { nodesCount: stats.knowledge.totalNodes },
      };
    },
  };
}
