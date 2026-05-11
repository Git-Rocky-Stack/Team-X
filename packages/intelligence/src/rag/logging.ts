/**
 * Structured Logging for RAG Operations
 *
 * Provides structured, JSON-formatted logging for all RAG operations.
 * Enables observability, debugging, and metrics collection.
 *
 * Phase 5 — M29 (Priority 2 enhancement).
 */

export interface RetrievalLogEntry {
  /** Log entry version */
  version: string;

  /** Timestamp (epoch ms) */
  timestamp: number;

  /** Log level */
  level: 'debug' | 'info' | 'warn' | 'error';

  /** Event type */
  event:
    | 'retrieval_started'
    | 'retrieval_completed'
    | 'retrieval_failed'
    | 'cache_hit'
    | 'cache_miss'
    | 'embedding_started'
    | 'embedding_completed'
    | 'embedding_failed'
    | 'indexing_started'
    | 'indexing_completed'
    | 'indexing_failed'
    | 'reranking_started'
    | 'reranking_completed'
    | 'reranking_failed';

  /** Company ID */
  companyId: string;

  /** Query hash (for tracking) */
  queryHash?: string;

  /** Query text (truncated) */
  queryText?: string;

  /** Event-specific data */
  data: {
    /** Number of results retrieved */
    resultCount?: number;

    /** Top-K requested for retrieval */
    topK?: number;

    /** Similarity threshold used for retrieval */
    threshold?: number;

    /** Similarity scores of results */
    scores?: number[];

    /** Source types retrieved */
    sourceTypes?: string[];

    /** Retrieval latency in ms */
    latencyMs?: number;

    /** Cache key (for cache events) */
    cacheKey?: string;

    /** Error message (for failures) */
    error?: string;

    /** Embedding model used */
    model?: string;

    /** Number of embeddings created */
    embeddingCount?: number;

    /** Source type being indexed */
    sourceType?: string;

    /** Source ID being indexed */
    sourceId?: string;

    /** Chunk count */
    chunkCount?: number;

    /** Reranking stats */
    rerankStats?: {
      inputCount: number;
      outputCount: number;
      avgOriginalScore: number;
      avgRerankedScore: number;
    };
  };

  /** System metadata */
  metadata: {
    /** Session ID for grouping related logs */
    sessionId?: string;

    /** User ID if applicable */
    userId?: string;

    /** Thread ID if applicable */
    threadId?: string;

    /** Run ID for agentic loops */
    runId?: string;
  };
}

export interface EmbeddingLogEntry {
  version: string;
  timestamp: number;
  level: 'info' | 'error';
  event: 'embedding_started' | 'embedding_completed' | 'embedding_failed';
  companyId: string;
  data: {
    textsCount: number;
    totalTokens?: number;
    model?: string;
    latencyMs?: number;
    error?: string;
    dimension?: number;
  };
  metadata: {
    sessionId?: string;
    sourceIds?: string[];
  };
}

export interface IndexingLogEntry {
  version: string;
  timestamp: number;
  level: 'info' | 'error';
  event: 'indexing_started' | 'indexing_completed' | 'indexing_failed';
  companyId: string;
  data: {
    sourceId: string;
    sourceType: string;
    contentLength: number;
    chunkCount?: number;
    latencyMs?: number;
    error?: string;
  };
  metadata: {
    sessionId?: string;
  };
}

/**
 * Logger options.
 */
export interface LoggerOptions {
  /** Minimum log level */
  minLevel?: 'debug' | 'info' | 'warn' | 'error';

  /** Log to console (default: true) */
  console?: boolean;

  /** Log to file (optional) */
  file?: {
    path: string;
    maxSize?: number; // Max file size in bytes
    maxFiles?: number; // Number of backup files
  };

  /** Enable structured output */
  structured?: boolean;
}

/**
 * Simple structured logger.
 */
export class StructuredLogger {
  private minLevel: RetrievalLogEntry['level'];
  private useConsole: boolean;
  private structured: boolean;

  constructor(options: LoggerOptions = {}) {
    this.minLevel = options.minLevel ?? 'info';
    this.useConsole = options.console !== false;
    this.structured = options.structured !== false;
  }

  /**
   * Log a retrieval operation.
   */
  logRetrieval(entry: Omit<RetrievalLogEntry, 'version' | 'timestamp' | 'level'>): void {
    const level: RetrievalLogEntry['level'] = entry.event.includes('failed') ? 'error' : 'info';
    if (this.shouldLog(level)) {
      const fullEntry: RetrievalLogEntry = {
        ...entry,
        version: '1.0.0',
        timestamp: Date.now(),
        level,
      };
      this.write(fullEntry);
    }
  }

  /**
   * Log an embedding operation.
   */
  logEmbedding(entry: Omit<EmbeddingLogEntry, 'version' | 'timestamp' | 'level'>): void {
    const level: EmbeddingLogEntry['level'] = entry.event.includes('failed') ? 'error' : 'info';
    if (this.shouldLog(level)) {
      const fullEntry: EmbeddingLogEntry = {
        ...entry,
        version: '1.0.0',
        timestamp: Date.now(),
        level,
      };
      this.write(fullEntry);
    }
  }

  /**
   * Log an indexing operation.
   */
  logIndexing(entry: Omit<IndexingLogEntry, 'version' | 'timestamp' | 'level'>): void {
    const level: IndexingLogEntry['level'] = entry.event.includes('failed') ? 'error' : 'info';
    if (this.shouldLog(level)) {
      const fullEntry: IndexingLogEntry = {
        ...entry,
        version: '1.0.0',
        timestamp: Date.now(),
        level,
      };
      this.write(fullEntry);
    }
  }

  /**
   * Check if a log level should be logged.
   */
  private shouldLog(level: RetrievalLogEntry['level']): boolean {
    const levels = ['debug', 'info', 'warn', 'error'] as const;
    const levelIndex = levels.indexOf(level);
    const minIndex = levels.indexOf(this.minLevel);
    return levelIndex >= minIndex;
  }

  /**
   * Write log entry to configured outputs.
   */
  private write(entry: RetrievalLogEntry | EmbeddingLogEntry | IndexingLogEntry): void {
    if (this.useConsole) {
      if (this.structured) {
        console.log(JSON.stringify(entry));
      } else {
        console.log(`[${entry.level.toUpperCase()}] ${entry.event}:`, entry.data);
      }
    }

    // TODO: Add file logging support
  }
}

/**
 * Create a hash for query tracking.
 */
export function hashQuery(query: string): string {
  // Simple hash for tracking (not cryptographic)
  let hash = 0;
  const str = query.toLowerCase().trim();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Create a session ID for grouping related logs.
 */
export function createSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Logging context for a RAG service instance.
 */
export interface RAGLoggingContext {
  /** Session ID for this service instance */
  sessionId: string;

  /** Logger instance */
  logger: StructuredLogger;

  /** Start time of the service */
  startTime: number;

  /** Statistics */
  stats: {
    totalRetrievals: number;
    totalEmbeddings: number;
    totalIndexing: number;
    totalErrors: number;
    cacheHits: number;
    cacheMisses: number;
    totalLatencyMs: number;
  };
}

/**
 * Create a logging context for a RAG service.
 */
export function createRAGLoggingContext(options: LoggerOptions = {}): RAGLoggingContext {
  return {
    sessionId: createSessionId(),
    logger: new StructuredLogger(options),
    startTime: Date.now(),
    stats: {
      totalRetrievals: 0,
      totalEmbeddings: 0,
      totalIndexing: 0,
      totalErrors: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalLatencyMs: 0,
    },
  };
}

/**
 * Get statistics summary from a logging context.
 */
export function getLoggingSummary(context: RAGLoggingContext): {
  uptimeMs: number;
  avgRetrievalLatencyMs: number;
  avgEmbeddingLatencyMs: number;
  cacheHitRate: number;
  errorRate: number;
  operationsPerSecond: number;
} {
  const uptimeMs = Date.now() - context.startTime;
  const avgRetrievalLatencyMs =
    context.stats.totalRetrievals > 0
      ? context.stats.totalLatencyMs / context.stats.totalRetrievals
      : 0;
  const avgEmbeddingLatencyMs = 0; // Would need separate tracking
  const cacheLookups = context.stats.cacheHits + context.stats.cacheMisses;
  const cacheHitRate = cacheLookups > 0 ? context.stats.cacheHits / cacheLookups : 0;
  const totalOps =
    context.stats.totalRetrievals + context.stats.totalEmbeddings + context.stats.totalIndexing;
  const errorRate = totalOps > 0 ? context.stats.totalErrors / totalOps : 0;
  const operationsPerSecond = uptimeMs > 0 ? (totalOps / uptimeMs) * 1000 : 0;

  return {
    uptimeMs,
    avgRetrievalLatencyMs,
    avgEmbeddingLatencyMs,
    cacheHitRate,
    errorRate,
    operationsPerSecond,
  };
}

/**
 * RAG service with integrated logging.
 *
 * Wraps a RAG service and adds structured logging to all operations.
 */
export interface LoggedRagServiceOptions {
  /** Logger options */
  logger?: LoggerOptions;

  /** Optional user/session metadata */
  metadata?: {
    userId?: string;
    threadId?: string;
    runId?: string;
  };
}

/**
 * Wrap a RAG service with logging.
 *
 * The wrapper monkey-patches `retrieve` and `indexSource` on the
 * input service object — this is intentional so any consumer holding
 * a reference to the original service still benefits from logging.
 * The biome-ignore comments below mark the unavoidable casts at the
 * monkey-patch boundary; the public API surface (the `T` return)
 * remains fully typed.
 */
type RagServiceShape = {
  retrieve: (...args: unknown[]) => Promise<Array<{ similarity: number; sourceType: string }>>;
  indexSource: (...args: unknown[]) => Promise<number>;
};

export function createLoggedRagService<T extends RagServiceShape>(
  service: T,
  options: LoggedRagServiceOptions = {},
): T {
  const context = createRAGLoggingContext(options.logger);

  // Wrap retrieve method
  const originalRetrieve = service.retrieve.bind(service);
  // biome-ignore lint/suspicious/noExplicitAny: monkey-patch reassigns the typed method to a logging wrapper; the surrounding generic T preserves the public surface
  (service as any).retrieve = async (...args: unknown[]) => {
    const [input] = args as [{ companyId: string; query: string; topK: number; threshold: number }];

    const queryHash = hashQuery(input.query);
    const startTime = performance.now();

    // Log retrieval start
    context.logger.logRetrieval({
      event: 'retrieval_started',
      companyId: input.companyId,
      queryHash,
      queryText: input.query.slice(0, 200),
      data: {
        topK: input.topK,
        threshold: input.threshold,
      },
      metadata: {
        sessionId: context.sessionId,
        ...options.metadata,
      },
    });

    try {
      // Perform retrieval
      const results = await originalRetrieve(...args);

      const latencyMs = performance.now() - startTime;

      // Update stats
      context.stats.totalRetrievals++;
      context.stats.totalLatencyMs += latencyMs;

      // Log retrieval completion. Result row shape comes from the
      // `RagServiceShape` constraint above (similarity + sourceType).
      context.logger.logRetrieval({
        event: 'retrieval_completed',
        companyId: input.companyId,
        queryHash,
        queryText: input.query.slice(0, 200),
        data: {
          resultCount: results.length,
          scores: results.map((r) => r.similarity),
          sourceTypes: results.map((r) => r.sourceType),
          latencyMs,
        },
        metadata: {
          sessionId: context.sessionId,
          ...options.metadata,
        },
      });

      return results;
    } catch (error) {
      const latencyMs = performance.now() - startTime;

      context.stats.totalErrors++;

      context.logger.logRetrieval({
        event: 'retrieval_failed',
        companyId: input.companyId,
        queryHash,
        queryText: input.query.slice(0, 200),
        data: {
          latencyMs,
          error: error instanceof Error ? error.message : String(error),
        },
        metadata: {
          sessionId: context.sessionId,
          ...options.metadata,
        },
      });

      throw error;
    }
  };

  // Wrap indexSource method
  const originalIndexSource = service.indexSource.bind(service);
  // biome-ignore lint/suspicious/noExplicitAny: monkey-patch reassigns the typed method to a logging wrapper; the surrounding generic T preserves the public surface
  (service as any).indexSource = async (...args: unknown[]) => {
    const [input] = args as [
      { companyId: string; sourceType: string; sourceId: string; content: string },
    ];

    const startTime = performance.now();

    context.logger.logIndexing({
      event: 'indexing_started',
      companyId: input.companyId,
      data: {
        sourceId: input.sourceId,
        sourceType: input.sourceType,
        contentLength: input.content.length,
      },
      metadata: {
        sessionId: context.sessionId,
        ...options.metadata,
      },
    });

    try {
      const result = await originalIndexSource(...args);
      const latencyMs = performance.now() - startTime;

      context.stats.totalIndexing++;

      context.logger.logIndexing({
        event: 'indexing_completed',
        companyId: input.companyId,
        data: {
          sourceId: input.sourceId,
          sourceType: input.sourceType,
          contentLength: input.content.length,
          chunkCount: result,
          latencyMs,
        },
        metadata: {
          sessionId: context.sessionId,
          ...options.metadata,
        },
      });

      return result;
    } catch (error) {
      const latencyMs = performance.now() - startTime;

      context.stats.totalErrors++;

      context.logger.logIndexing({
        event: 'indexing_failed',
        companyId: input.companyId,
        data: {
          sourceId: input.sourceId,
          sourceType: input.sourceType,
          contentLength: input.content.length,
          latencyMs,
          error: error instanceof Error ? error.message : String(error),
        },
        metadata: {
          sessionId: context.sessionId,
          ...options.metadata,
        },
      });

      throw error;
    }
  };

  // Add stats method
  // biome-ignore lint/suspicious/noExplicitAny: attaches a new diagnostic method onto the service object; the public T surface intentionally hides this internal helper from consumers
  (service as any).getLoggingStats = () => getLoggingSummary(context);

  return service;
}
