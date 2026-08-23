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

  /** Company ID for operations */
  companyId?: string;

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
    options?: {
      companyId?: string;
      topK?: number;
      threshold?: number;
      useExpansion?: boolean;
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
      companyId?: string;
    },
  ): Promise<number>;

  /**
   * Query knowledge graph.
   */
  queryKnowledge(
    query: string,
    options?: {
      companyId?: string;
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
    options?: { companyId?: string; topK?: number; threshold?: number },
  ): AsyncGenerator<{
    type: string;
    content: string;
    isFinal: boolean;
  }>;

  /**
   * Get service statistics.
   */
  getStats(): {
    rag: { enabled: boolean };
    memory: { factsCount: number };
    knowledge: { nodesCount: number };
  };
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

/** Company scope used when a caller does not supply one. */
const DEFAULT_COMPANY = 'default';

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
      enableExpansion: constructionFlags.queryExpansionEnabled,
    },
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
    initPromise ??= ai.initialize();
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
    async enhancedQuery(query, queryOptions = {}) {
      await ready();
      const flags = features();
      const companyId = queryOptions.companyId ?? DEFAULT_COMPANY;

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

    async indexWithSemanticChunking(input) {
      await ready();

      // Semantic chunking splits on real content boundaries (headings,
      // paragraphs, code fences) rather than a blind character window —
      // which is the entire point of the toggle.
      const chunks = features().semanticChunkingEnabled
        ? await semanticChunkText(input.content)
        : chunkText(input.content);

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
      if (!features().longTermMemoryEnabled || !llmComplete) return 0;
      await ready();

      const facts = await ai.extractFacts(
        factOptions.companyId ?? DEFAULT_COMPANY,
        factOptions.sourceId,
        conversation,
      );
      return facts.length;
    },

    queryKnowledge(query, knowledgeOptions = {}) {
      if (!features().knowledgeGraphEnabled || !initialized) {
        return { nodes: [], edges: [] };
      }

      const graph = ai.queryKnowledge(knowledgeOptions.companyId ?? DEFAULT_COMPANY, query, {
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

    async *streamQuery(query, streamOptions = {}) {
      await ready();
      const flags = features();

      const { stream, result } = ai.queryStream(streamOptions.companyId ?? DEFAULT_COMPANY, query, {
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

    getStats() {
      if (!initialized) {
        return {
          rag: { enabled: options.ragRepo !== undefined },
          memory: { factsCount: 0 },
          knowledge: { nodesCount: 0 },
        };
      }

      const stats = ai.getStats(DEFAULT_COMPANY);
      return {
        rag: { enabled: true },
        memory: { factsCount: stats.memory.totalFacts },
        knowledge: { nodesCount: stats.knowledge.totalNodes },
      };
    },
  };
}
