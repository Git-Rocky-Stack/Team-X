/**
 * RAG Evaluation Types
 *
 * Types for evaluating retrieval-augmented generation systems.
 * Includes golden dataset structure, metrics, and evaluation results.
 */

/**
 * Intent classification for queries.
 * Different intents may require different evaluation strategies.
 */
export type QueryIntent =
  | 'factual' // Direct fact lookup: "What's the status of ticket X?"
  | 'semantic' // Semantic search: "Show me blocked projects"
  | 'recent' // Temporal: "What happened yesterday?"
  | 'complex' // Multi-step: "Which goals are at risk due to staffing?"
  | 'lookup'; // Exact match: "Find the project called Q3 Launch";

/**
 * A single query in the golden evaluation dataset.
 */
export interface EvalQuery {
  /** Unique identifier for this query */
  id: string;

  /** The user's query text */
  query: string;

  /** Query intent for routing/stratification */
  intent: QueryIntent;

  /** Company ID context (optional, for multi-tenant systems) */
  companyId?: string;

  /**
   * Ground truth: document IDs that are relevant to this query.
   * Used for computing precision, recall, and ranking metrics.
   */
  relevantDocIds: string[];

  /**
   * Expected answer summary (optional, for generation evaluation).
   * Used for faithfulness and answer relevance scoring.
   */
  expectedAnswer?: string;

  /**
   * Required tools (optional, for agentic system evaluation).
   * List of tool names that should be called to answer this query.
   */
  requiredTools?: string[];

  /**
   * Difficulty rating for this query (1-5).
   * Used to stratify evaluation results by complexity.
   */
  difficulty?: 1 | 2 | 3 | 4 | 5;

  /**
   * Tags for categorizing queries.
   * Examples: 'ticket-lookup', 'project-status', 'employee-search'
   */
  tags?: string[];

  /**
   * Metadata for query context.
   * Can include thread ID, conversation history, etc.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Result from a single retrieval operation.
 */
export interface RetrievalResult {
  /** Query that was executed */
  queryId: string;

  /** Retrieved documents in ranked order */
  retrievedDocs: Array<{
    /** Document ID */
    id: string;

    /** Similarity score (0-1) */
    score: number;

    /** Document content (optional, for analysis) */
    content?: string;

    /** Chunk index if applicable */
    chunkIndex?: number;
  }>;

  /** Latency in milliseconds */
  latencyMs: number;

  /** Total tokens used for embedding */
  tokensUsed?: number;

  /** Timestamp of retrieval */
  timestamp: number;

  /** Any errors that occurred */
  error?: string;
}

/**
 * Generation result from the LLM.
 */
export interface GenerationResult {
  /** Query that was answered */
  queryId: string;

  /** Generated answer */
  answer: string;

  /** Context documents provided to the LLM */
  contextDocs: string[];

  /** Latency in milliseconds */
  latencyMs: number;

  /** Total tokens used (prompt + completion) */
  tokensUsed?: number;

  /** Timestamp of generation */
  timestamp: number;

  /** Any errors that occurred */
  error?: string;
}

/**
 * Evaluation metrics for a single query.
 */
export interface QueryMetrics {
  /** Query identifier */
  queryId: string;

  /** Precision at various K values */
  precision: Map<number, number>;

  /** Recall at various K values */
  recall: Map<number, number>;

  /** Average Precision (AP) */
  averagePrecision: number;

  /** Mean Reciprocal Rank (MRR) */
  mrr: number;

  /** Normalized Discounted Cumulative Gain at K */
  ndcg: Map<number, number>;

  /** First relevant result rank (0-based, -1 if none) */
  firstRelevantRank: number;

  /** Whether at least one relevant doc was retrieved */
  hasRelevantResult: boolean;

  /** Retrieval latency in milliseconds */
  latencyMs: number;
}

/**
 * Aggregated metrics across all queries.
 */
export interface AggregatedMetrics {
  /** Mean Precision at K */
  meanPrecision: Map<number, number>;

  /** Mean Recall at K */
  meanRecall: Map<number, number>;

  /** Mean Average Precision (MAP) */
  meanAveragePrecision: number;

  /** Mean Reciprocal Rank */
  meanReciprocalRank: number;

  /** Mean NDCG at K */
  meanNdcg: Map<number, number>;

  /** Retrieval latency percentiles */
  latency: {
    p50: number;
    p95: number;
    p99: number;
    mean: number;
  };

  /** Percentage of queries with at least one relevant result */
  hitRate: number;

  /** Total queries evaluated */
  totalQueries: number;

  /** Breakdown by query intent */
  byIntent: Map<
    QueryIntent,
    {
      count: number;
      map: number;
      mrr: number;
    }
  >;

  /** Breakdown by difficulty */
  byDifficulty: Map<
    number,
    {
      count: number;
      map: number;
      mrr: number;
    }
  >;
}

/**
 * Complete evaluation results.
 */
export interface EvaluationResult {
  /** Evaluation run identifier */
  runId: string;

  /** Timestamp when evaluation started */
  startedAt: number;

  /** Timestamp when evaluation completed */
  completedAt: number;

  /** Total duration in milliseconds */
  durationMs: number;

  /** Configuration used for evaluation */
  config: EvaluationConfig;

  /** Per-query metrics */
  queryMetrics: QueryMetrics[];

  /** Aggregated metrics */
  aggregated: AggregatedMetrics;

  /** System information */
  systemInfo: {
    nodeVersion: string;
    platform: string;
    cpuModel?: string;
    totalMemory?: number;
  };
}

/**
 * Configuration for an evaluation run.
 */
export interface EvaluationConfig {
  /** Dataset to evaluate against */
  dataset: EvalDataset;

  /** K values for precision/recall calculation */
  kValues: number[];

  /** Whether to include query latency in metrics */
  measureLatency: boolean;

  /** Maximum queries to run (0 = all) */
  maxQueries?: number;

  /** Filter by query intent */
  intentFilter?: QueryIntent[];

  /** Filter by tags */
  tagFilter?: string[];

  /** Filter by difficulty */
  difficultyFilter?: number[];

  /** Whether to run queries in parallel */
  parallel?: boolean;

  /** Concurrency for parallel execution */
  concurrency?: number;
}

/**
 * Golden evaluation dataset.
 */
export interface EvalDataset {
  /** Dataset name/version */
  name: string;

  /** Dataset version */
  version: string;

  /** Queries in the dataset */
  queries: EvalQuery[];

  /** Dataset metadata */
  metadata: {
    createdAt: number;
    author?: string;
    description?: string;
    lastUpdated: number;
  };
}

/**
 * Comparison between two evaluation runs.
 */
export interface EvaluationComparison {
  /** Run 1 (baseline) */
  run1: EvaluationResult;

  /** Run 2 (comparison) */
  run2: EvaluationResult;

  /** Metric deltas */
  deltas: {
    map: number;
    mrr: number;
    precisionAt5: number;
    recallAt10: number;
    ndcgAt10: number;
    latencyP95: number;
  };

  /** Statistical significance (p-value) */
  significance?: {
    map: number;
    mrr: number;
  };

  /** Per-query improvements/regressions */
  perQuery: Array<{
    queryId: string;
    deltaMrr: number;
    deltaMap: number;
  }>;
}

/**
 * Export format for evaluation results.
 */
export interface EvaluationExport {
  /** Export format version */
  formatVersion: string;

  /** Exported at timestamp */
  exportedAt: number;

  /** Evaluation results */
  results: EvaluationResult;

  /** Optional: comparison with baseline */
  comparison?: EvaluationComparison;
}
