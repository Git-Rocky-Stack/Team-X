/**
 * RAG Evaluator
 *
 * Main evaluation harness that runs queries against a RAG system
 * and computes metrics using the golden dataset.
 */

import type {
  AggregatedMetrics,
  EvalDataset,
  EvalQuery,
  EvaluationConfig,
  EvaluationResult,
  QueryMetrics,
  RetrievalResult,
} from './types.js';
import { aggregateMetrics, calculateQueryMetrics, compareEvaluations, formatMetrics } from './metrics.js';

/**
 * Function signature for retrieving documents.
 * This should be the actual RAG retrieval function being evaluated.
 */
export type RetrieveFunction = (
  query: string,
  options: {
    topK: number;
    threshold: number;
    companyId?: string;
  }
) => Promise<RetrievalResult>;

/**
 * Evaluator options.
 */
export interface EvaluatorOptions {
  /** Retrieve function to evaluate */
  retrieve: RetrieveFunction;

  /** Default K values for metrics */
  kValues?: number[];

  /** Default topK for retrieval */
  defaultTopK?: number;

  /** Default threshold for retrieval */
  defaultThreshold?: number;
}

/**
 * Create a RAG evaluator.
 */
export function createRagEvaluator(opts: EvaluatorOptions) {
  const {
    retrieve,
    kValues = [1, 3, 5, 10],
    defaultTopK = 10,
    defaultThreshold = 0.0, // 0.0 = include all results
  } = opts;

  return {
    /**
     * Evaluate retrieval on a single query.
     */
    async evaluateQuery(query: EvalQuery): Promise<QueryMetrics> {
      const start = performance.now();

      const result = await retrieve(query.query, {
        topK: defaultTopK,
        threshold: defaultThreshold,
        companyId: query.companyId,
      });

      const latencyMs = performance.now() - start;
      result.latencyMs = latencyMs;

      return calculateQueryMetrics(query, result, kValues);
    },

    /**
     * Evaluate retrieval on an entire dataset.
     */
    async evaluateDataset(
      dataset: EvalDataset,
      config: Partial<EvaluationConfig> = {}
    ): Promise<EvaluationResult> {
      const runId = `eval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const startedAt = Date.now();

      // Merge config with defaults
      const fullConfig: EvaluationConfig = {
        dataset,
        kValues,
        measureLatency: true,
        ...config,
      };

      // Filter queries if needed
      let queries = dataset.queries;
      if (fullConfig.intentFilter?.length) {
        queries = queries.filter((q) => fullConfig.intentFilter!.includes(q.intent));
      }
      if (fullConfig.tagFilter?.length) {
        queries = queries.filter((q) =>
          q.tags?.some((t) => fullConfig.tagFilter!.includes(t))
        );
      }
      if (fullConfig.difficultyFilter?.length) {
        queries = queries.filter((q) =>
          q.difficulty ? fullConfig.difficultyFilter!.includes(q.difficulty) : false
        );
      }

      // Apply max query limit
      if (fullConfig.maxQueries && fullConfig.maxQueries > 0) {
        queries = queries.slice(0, fullConfig.maxQueries);
      }

      // Run evaluation (serial or parallel)
      const queryMetrics: QueryMetrics[] = [];

      if (fullConfig.parallel && fullConfig.concurrency && fullConfig.concurrency > 1) {
        // Parallel execution with concurrency limit
        const chunks: EvalQuery[][] = [];
        for (let i = 0; i < queries.length; i += fullConfig.concurrency) {
          chunks.push(queries.slice(i, i + fullConfig.concurrency));
        }

        for (const chunk of chunks) {
          const results = await Promise.all(
            chunk.map((query) =>
              this.evaluateQuery(query).catch((err) => {
                console.error(`[eval] Query ${query.id} failed:`, err);
                return {
                  queryId: query.id,
                  precision: new Map(),
                  recall: new Map(),
                  averagePrecision: 0,
                  mrr: 0,
                  ndcg: new Map(),
                  firstRelevantRank: -1,
                  hasRelevantResult: false,
                  latencyMs: 0,
                };
              })
            )
          );
          queryMetrics.push(...results);
        }
      } else {
        // Serial execution
        for (const query of queries) {
          try {
            const metrics = await this.evaluateQuery(query);
            queryMetrics.push(metrics);
          } catch (err) {
            console.error(`[eval] Query ${query.id} failed:`, err);
            // Add a failed metrics entry
            queryMetrics.push({
              queryId: query.id,
              precision: new Map(),
              recall: new Map(),
              averagePrecision: 0,
              mrr: 0,
              ndcg: new Map(),
              firstRelevantRank: -1,
              hasRelevantResult: false,
              latencyMs: 0,
            });
          }
        }
      }

      // Compute aggregated metrics
      const aggregated = aggregateMetrics(queryMetrics, queries, kValues);

      const completedAt = Date.now();

      return {
        runId,
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
        config: fullConfig,
        queryMetrics,
        aggregated,
        systemInfo: {
          nodeVersion: process.version,
          platform: process.platform,
        },
      };
    },

    /**
     * Compare two evaluation runs.
     */
    compare(
      baseline: EvaluationResult,
      comparison: EvaluationResult
    ): ReturnType<typeof compareEvaluations> {
      return compareEvaluations(
        baseline.queryMetrics,
        comparison.queryMetrics,
        baseline.config.dataset.queries
      );
    },

    /**
     * Format evaluation results as a string.
     */
    format(result: EvaluationResult): string {
      const lines: string[] = [];

      lines.push('=== RAG Evaluation Results ===');
      lines.push(`Run ID: ${result.runId}`);
      lines.push(`Duration: ${(result.durationMs / 1000).toFixed(2)}s`);
      lines.push(`Queries Evaluated: ${result.queryMetrics.length}`);
      lines.push('');

      lines.push(formatMetrics(result.aggregated));

      // Worst performing queries
      const worstQueries = [...result.queryMetrics]
        .sort((a, b) => a.mrr - b.mrr)
        .slice(0, 5);

      if (worstQueries.length > 0) {
        lines.push('');
        lines.push('Worst Performing Queries (by MRR):');
        for (const metrics of worstQueries) {
          const query = result.config.dataset.queries.find(
            (q) => q.id === metrics.queryId
          );
          lines.push(
            `  ${metrics.queryId}: MRR=${metrics.mrr.toFixed(3)}, AP=${metrics.averagePrecision.toFixed(3)}`
          );
          if (query) {
            lines.push(`    Query: "${query.query}"`);
            lines.push(`    Intent: ${query.intent}, Difficulty: ${query.difficulty ?? 'N/A'}`);
          }
        }
      }

      // Best performing queries
      const bestQueries = [...result.queryMetrics]
        .sort((a, b) => b.mrr - a.mrr)
        .slice(0, 5);

      if (bestQueries.length > 0) {
        lines.push('');
        lines.push('Best Performing Queries (by MRR):');
        for (const metrics of bestQueries) {
          const query = result.config.dataset.queries.find(
            (q) => q.id === metrics.queryId
          );
          lines.push(
            `  ${metrics.queryId}: MRR=${metrics.mrr.toFixed(3)}, AP=${metrics.averagePrecision.toFixed(3)}`
          );
          if (query) {
            lines.push(`    Query: "${query.query}"`);
          }
        }
      }

      return lines.join('\n');
    },

    /**
     * Export evaluation results to JSON.
     */
    export(result: EvaluationResult): string {
      return JSON.stringify(
        {
          formatVersion: '1.0.0',
          exportedAt: Date.now(),
          results: result,
        },
        null,
        2
      );
    },

    /**
     * Get target metrics for evaluation.
     * These are the minimum acceptable values for production.
     */
    getTargets(): Record<string, number> {
      return {
        precisionAt5: 0.8,
        recallAt10: 0.7,
        meanAveragePrecision: 0.75,
        meanReciprocalRank: 0.85,
        hitRate: 0.95,
        latencyP95: 100, // milliseconds
      };
    },

    /**
     * Check if evaluation meets targets.
     */
    meetsTargets(result: EvaluationResult): {
      passed: boolean;
      failures: Array<{ metric: string; expected: number; actual: number }>;
    } {
      const targets = this.getTargets();
      const failures: Array<{ metric: string; expected: number; actual: number }> = [];

      const { aggregated } = result;

      if ((aggregated.meanPrecision.get(5) ?? 0) < targets.precisionAt5) {
        failures.push({
          metric: 'Precision@5',
          expected: targets.precisionAt5,
          actual: aggregated.meanPrecision.get(5) ?? 0,
        });
      }

      if ((aggregated.meanRecall.get(10) ?? 0) < targets.recallAt10) {
        failures.push({
          metric: 'Recall@10',
          expected: targets.recallAt10,
          actual: aggregated.meanRecall.get(10) ?? 0,
        });
      }

      if (aggregated.meanAveragePrecision < targets.meanAveragePrecision) {
        failures.push({
          metric: 'MAP',
          expected: targets.meanAveragePrecision,
          actual: aggregated.meanAveragePrecision,
        });
      }

      if (aggregated.meanReciprocalRank < targets.meanReciprocalRank) {
        failures.push({
          metric: 'MRR',
          expected: targets.meanReciprocalRank,
          actual: aggregated.meanReciprocalRank,
        });
      }

      if (aggregated.hitRate < targets.hitRate) {
        failures.push({
          metric: 'Hit Rate',
          expected: targets.hitRate,
          actual: aggregated.hitRate,
        });
      }

      if (aggregated.latency.p95 > targets.latencyP95) {
        failures.push({
          metric: 'P95 Latency',
          expected: targets.latencyP95,
          actual: aggregated.latency.p95,
        });
      }

      return {
        passed: failures.length === 0,
        failures,
      };
    },
  };
}

export type RagEvaluator = ReturnType<typeof createRagEvaluator>;
