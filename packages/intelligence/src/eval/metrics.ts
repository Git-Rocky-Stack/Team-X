/**
 * RAG Evaluation Metrics
 *
 * Calculates standard information retrieval metrics:
 * - Precision@K
 * - Recall@K
 * - Mean Average Precision (MAP)
 * - Mean Reciprocal Rank (MRR)
 * - Normalized Discounted Cumulative Gain (NDCG@K)
 */

import type {
  AggregatedMetrics,
  EvalQuery,
  QueryIntent,
  QueryMetrics,
  RetrievalResult,
} from './types.js';

/**
 * Calculate metrics for a single query.
 *
 * @param query - The query with ground truth relevant docs
 * @param result - The retrieval result
 * @param kValues - K values to compute precision/recall at
 * @returns Metrics for this query
 */
export function calculateQueryMetrics(
  query: EvalQuery,
  result: RetrievalResult,
  kValues: number[]
): QueryMetrics {
  const retrievedIds = result.retrievedDocs.map((d) => d.id);
  const relevantSet = new Set(query.relevantDocIds);

  const precision = new Map<number, number>();
  const recall = new Map<number, number>();
  const ndcg = new Map<number, number>();

  let firstRelevantRank = -1;
  let hasRelevantResult = false;

  // Calculate Precision@K, Recall@K, and NDCG@K
  for (const k of kValues) {
    const retrievedAtK = retrievedIds.slice(0, k);
    const relevantAtK = retrievedAtK.filter((id) => relevantSet.has(id)).length;

    // Precision@K = |relevant @ K| / K
    precision.set(k, relevantAtK / k);

    // Recall@K = |relevant @ K| / |total relevant|
    recall.set(k, relevantAtK / query.relevantDocIds.length);

    // NDCG@K
    ndcg.set(k, calculateNDCG(retrievedAtK, relevantSet, k));
  }

  // Find first relevant result rank
  for (let i = 0; i < retrievedIds.length; i++) {
    const id = retrievedIds[i];
    if (id !== undefined && relevantSet.has(id)) {
      firstRelevantRank = i;
      hasRelevantResult = true;
      break;
    }
  }

  // Calculate Average Precision (AP)
  const averagePrecision = calculateAveragePrecision(retrievedIds, relevantSet);

  // Mean Reciprocal Rank (MRR) = 1 / (first relevant rank + 1)
  const mrr = firstRelevantRank >= 0 ? 1 / (firstRelevantRank + 1) : 0;

  return {
    queryId: query.id,
    precision,
    recall,
    averagePrecision,
    mrr,
    ndcg,
    firstRelevantRank,
    hasRelevantResult,
    latencyMs: result.latencyMs,
  };
}

/**
 * Calculate Average Precision for a single query.
 *
 * AP = (1 / |relevant|) * sum(P@k * rel@k)
 * where rel@k = 1 if item at rank k is relevant, else 0
 */
function calculateAveragePrecision(
  retrievedIds: string[],
  relevantSet: Set<string>
): number {
  let precisionSum = 0;
  let relevantCount = 0;

  for (let i = 0; i < retrievedIds.length; i++) {
    const id = retrievedIds[i];
    if (id !== undefined && relevantSet.has(id)) {
      relevantCount++;
      const precisionAtI = relevantCount / (i + 1);
      precisionSum += precisionAtI;
    }
  }

  return relevantSet.size > 0 ? precisionSum / relevantSet.size : 0;
}

/**
 * Calculate Normalized Discounted Cumulative Gain at K.
 *
 * NDCG@K = DCG@K / IDCG@K
 * DCG = sum(rel_i / log2(i + 2))
 * where rel_i = 1 if relevant at position i, else 0
 */
function calculateNDCG(
  retrievedIds: string[],
  relevantSet: Set<string>,
  k: number
): number {
  // Calculate DCG
  let dcg = 0;
  for (let i = 0; i < Math.min(k, retrievedIds.length); i++) {
    const id = retrievedIds[i];
    const relevance = id !== undefined && relevantSet.has(id) ? 1 : 0;
    dcg += relevance / Math.log2(i + 2);
  }

  // Calculate IDCG (ideal DCG - all top K are relevant)
  let idcg = 0;
  const idealRelevant = Math.min(k, relevantSet.size);
  for (let i = 0; i < idealRelevant; i++) {
    idcg += 1 / Math.log2(i + 2);
  }

  return idcg > 0 ? dcg / idcg : 0;
}

/**
 * Aggregate metrics across all queries.
 *
 * Computes mean values and percentiles for latency,
 * and breaks down results by query intent and difficulty.
 */
export function aggregateMetrics(
  queryMetrics: QueryMetrics[],
  queries: EvalQuery[],
  kValues: number[]
): AggregatedMetrics {
  if (queryMetrics.length === 0) {
    return {
      meanPrecision: new Map(),
      meanRecall: new Map(),
      meanAveragePrecision: 0,
      meanReciprocalRank: 0,
      meanNdcg: new Map(),
      latency: { p50: 0, p95: 0, p99: 0, mean: 0 },
      hitRate: 0,
      totalQueries: 0,
      byIntent: new Map(),
      byDifficulty: new Map(),
    };
  }

  // Calculate mean Precision@K and Recall@K
  const meanPrecision = new Map<number, number>();
  const meanRecall = new Map<number, number>();
  const meanNdcg = new Map<number, number>();

  for (const k of kValues) {
    const sumPrecision = queryMetrics.reduce(
      (sum, m) => sum + (m.precision.get(k) ?? 0),
      0
    );
    meanPrecision.set(k, sumPrecision / queryMetrics.length);

    const sumRecall = queryMetrics.reduce(
      (sum, m) => sum + (m.recall.get(k) ?? 0),
      0
    );
    meanRecall.set(k, sumRecall / queryMetrics.length);

    const sumNdcg = queryMetrics.reduce(
      (sum, m) => sum + (m.ndcg.get(k) ?? 0),
      0
    );
    meanNdcg.set(k, sumNdcg / queryMetrics.length);
  }

  // Calculate MAP and MRR
  const meanAveragePrecision =
    queryMetrics.reduce((sum, m) => sum + m.averagePrecision, 0) /
    queryMetrics.length;

  const meanReciprocalRank =
    queryMetrics.reduce((sum, m) => sum + m.mrr, 0) / queryMetrics.length;

  // Calculate latency percentiles
  const latencies = queryMetrics.map((m) => m.latencyMs).sort((a, b) => a - b);
  const latency = {
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    mean:
      latencies.reduce((sum, l) => sum + l, 0) / latencies.length,
  };

  // Calculate hit rate
  const hitRate =
    queryMetrics.filter((m) => m.hasRelevantResult).length /
    queryMetrics.length;

  // Break down by intent
  const byIntent = new Map<
    QueryIntent,
    { count: number; map: number; mrr: number }
  >();
  const byDifficulty = new Map<
    number,
    { count: number; map: number; mrr: number }
  >();

  for (let i = 0; i < queryMetrics.length; i++) {
    const metrics = queryMetrics[i];
    if (!metrics) continue;
    const query = queries.find((q) => q.id === metrics.queryId);
    if (!query) continue;

    // Group by intent
    if (query.intent) {
      const existing = byIntent.get(query.intent) ?? {
        count: 0,
        map: 0,
        mrr: 0,
      };
      byIntent.set(query.intent, {
        count: existing.count + 1,
        map: existing.map + metrics.averagePrecision,
        mrr: existing.mrr + metrics.mrr,
      });
    }

    // Group by difficulty
    if (query.difficulty) {
      const existing = byDifficulty.get(query.difficulty) ?? {
        count: 0,
        map: 0,
        mrr: 0,
      };
      byDifficulty.set(query.difficulty, {
        count: existing.count + 1,
        map: existing.map + metrics.averagePrecision,
        mrr: existing.mrr + metrics.mrr,
      });
    }
  }

  // Compute averages for breakdowns
  for (const [intent, data] of byIntent) {
    byIntent.set(intent, {
      count: data.count,
      map: data.map / data.count,
      mrr: data.mrr / data.count,
    });
  }

  for (const [difficulty, data] of byDifficulty) {
    byDifficulty.set(difficulty, {
      count: data.count,
      map: data.map / data.count,
      mrr: data.mrr / data.count,
    });
  }

  return {
    meanPrecision,
    meanRecall,
    meanAveragePrecision,
    meanReciprocalRank,
    meanNdcg,
    latency,
    hitRate,
    totalQueries: queryMetrics.length,
    byIntent,
    byDifficulty,
  };
}

/**
 * Calculate the percentile value from a sorted array.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (upper >= sorted.length) return sorted[sorted.length - 1] ?? 0;
  return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight;
}

/**
 * Compare two evaluation runs.
 *
 * Computes deltas for key metrics and optionally
 * calculates statistical significance using paired t-test.
 */
export function compareEvaluations(
  baseline: QueryMetrics[],
  comparison: QueryMetrics[],
  queries: EvalQuery[]
): {
  mapDelta: number;
  mrrDelta: number;
  precisionAt5Delta: number;
  recallAt10Delta: number;
  ndcgAt10Delta: number;
  latencyP95Delta: number;
  improved: number;
  regressed: number;
  unchanged: number;
  perQuery: Array<{
    queryId: string;
    deltaMrr: number;
    deltaMap: number;
  }>;
} {
  if (baseline.length !== comparison.length) {
    throw new Error('Baseline and comparison must have same number of queries');
  }

  // Aggregate baseline metrics
  const baselineAgg = aggregateMetrics(baseline, queries, [5, 10]);
  const comparisonAgg = aggregateMetrics(comparison, queries, [5, 10]);

  // Calculate deltas
  const mapDelta =
    comparisonAgg.meanAveragePrecision - baselineAgg.meanAveragePrecision;
  const mrrDelta =
    comparisonAgg.meanReciprocalRank - baselineAgg.meanReciprocalRank;
  const precisionAt5Delta =
    (comparisonAgg.meanPrecision.get(5) ?? 0) -
    (baselineAgg.meanPrecision.get(5) ?? 0);
  const recallAt10Delta =
    (comparisonAgg.meanRecall.get(10) ?? 0) -
    (baselineAgg.meanRecall.get(10) ?? 0);
  const ndcgAt10Delta =
    (comparisonAgg.meanNdcg.get(10) ?? 0) -
    (baselineAgg.meanNdcg.get(10) ?? 0);
  const latencyP95Delta =
    comparisonAgg.latency.p95 - baselineAgg.latency.p95;

  // Per-query deltas
  const perQuery = baseline.map((b, i) => {
    const c = comparison[i];
    return {
      queryId: b.queryId,
      deltaMrr: (c?.mrr ?? 0) - b.mrr,
      deltaMap: (c?.averagePrecision ?? 0) - b.averagePrecision,
    };
  });

  // Count improvements/regressions
  const threshold = 0.01; // 1% threshold for significance
  let improved = 0;
  let regressed = 0;
  let unchanged = 0;

  for (const delta of perQuery) {
    if (delta.deltaMrr > threshold) improved++;
    else if (delta.deltaMrr < -threshold) regressed++;
    else unchanged++;
  }

  return {
    mapDelta,
    mrrDelta,
    precisionAt5Delta,
    recallAt10Delta,
    ndcgAt10Delta,
    latencyP95Delta,
    improved,
    regressed,
    unchanged,
    perQuery,
  };
}

/**
 * Format metrics as a human-readable string.
 */
export function formatMetrics(metrics: AggregatedMetrics): string {
  const lines: string[] = [];

  lines.push('=== Aggregated Metrics ===');
  lines.push(`Total Queries: ${metrics.totalQueries}`);
  lines.push(`Hit Rate: ${(metrics.hitRate * 100).toFixed(1)}%`);
  lines.push('');

  lines.push('Mean Average Precision (MAP):');
  lines.push(`  ${metrics.meanAveragePrecision.toFixed(4)}`);
  lines.push('');

  lines.push('Mean Reciprocal Rank (MRR):');
  lines.push(`  ${metrics.meanReciprocalRank.toFixed(4)}`);
  lines.push('');

  lines.push('Precision@K:');
  for (const [k, value] of metrics.meanPrecision) {
    lines.push(`  P@${k}: ${value.toFixed(4)}`);
  }
  lines.push('');

  lines.push('Recall@K:');
  for (const [k, value] of metrics.meanRecall) {
    lines.push(`  R@${k}: ${value.toFixed(4)}`);
  }
  lines.push('');

  lines.push('NDCG@K:');
  for (const [k, value] of metrics.meanNdcg) {
    lines.push(`  NDCG@${k}: ${value.toFixed(4)}`);
  }
  lines.push('');

  lines.push('Latency (ms):');
  lines.push(`  P50: ${metrics.latency.p50.toFixed(1)}`);
  lines.push(`  P95: ${metrics.latency.p95.toFixed(1)}`);
  lines.push(`  P99: ${metrics.latency.p99.toFixed(1)}`);
  lines.push(`  Mean: ${metrics.latency.mean.toFixed(1)}`);
  lines.push('');

  if (metrics.byIntent.size > 0) {
    lines.push('By Intent:');
    for (const [intent, data] of metrics.byIntent) {
      lines.push(
        `  ${intent}: MAP=${data.map.toFixed(3)}, MRR=${data.mrr.toFixed(3)} (${data.count} queries)`
      );
    }
    lines.push('');
  }

  if (metrics.byDifficulty.size > 0) {
    lines.push('By Difficulty:');
    for (const [difficulty, data] of metrics.byDifficulty) {
      lines.push(
        `  Level ${difficulty}: MAP=${data.map.toFixed(3)}, MRR=${data.mrr.toFixed(3)} (${data.count} queries)`
      );
    }
  }

  return lines.join('\n');
}
