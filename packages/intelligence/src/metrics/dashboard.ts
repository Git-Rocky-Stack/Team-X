/**
 * RAG Metrics Dashboard
 *
 * Comprehensive metrics collection, aggregation, and reporting for RAG performance.
 * Provides dashboard-ready data structures and trend analysis.
 *
 * Phase 5 — M29 (Priority 2 enhancement).
 */

import type {
  AggregatedMetrics,
  EvalQuery,
  QueryMetrics,
  RetrievalResult,
} from '../eval/types.js';

import {
  calculateQueryMetrics,
  formatAggregatedMetrics,
} from '../eval/metrics.js';

import type {
  RetrievalLogEntry,
  EmbeddingLogEntry,
  CacheStats,
} from '../rag/logging.js';

/**
 * Dashboard metrics snapshot.
 */
export interface DashboardMetrics {
  /** When this snapshot was taken */
  timestamp: number;

  /** Evaluation metrics */
  evaluation: EvaluationSnapshot;

  /** Retrieval performance */
  retrieval: RetrievalSnapshot;

  /** Cache performance */
  cache: CacheSnapshot;

  /** System health */
  health: HealthSnapshot;

  /** Trends over time */
  trends: TrendSnapshot;
}

/**
 * Evaluation metrics snapshot.
 */
export interface EvaluationSnapshot {
  /** Precision@K values */
  precision: Map<number, number>;

  /** Recall@K values */
  recall: Map<number, number>;

  /** Mean Average Precision */
  map: number;

  /** Mean Reciprocal Rank */
  mrr: number;

  /** NDCG@K values */
  ndcg: Map<number, number>;

  /** Hit rate (queries with relevant results) */
  hitRate: number;

  /** Total queries evaluated */
  totalQueries: number;

  /** Queries passing targets */
  passingQueries: number;

  /** Target achievement percentage */
  targetPassRate: number;
}

/**
 * Retrieval performance snapshot.
 */
export interface RetrievalSnapshot {
  /** Total retrievals */
  totalRetrievals: number;

  /** Successful retrievals */
  successfulRetrievals: number;

  /** Failed retrievals */
  failedRetrievals: number;

  /** Success rate */
  successRate: number;

  /** Latency percentiles (ms) */
  latency: {
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
    mean: number;
  };

  /** Average results per retrieval */
  avgResults: number;

  /** Result distribution */
  resultDistribution: Map<number, number>; // resultCount -> frequency
}

/**
 * Cache performance snapshot.
 */
export interface CacheSnapshot extends CacheStats {
  /** Estimated cost savings (reduced API calls) */
  estimatedCostSavings: {
    callsSaved: number;
    percentReduction: number;
  };

  /** Average cache entry lifetime (ms) */
  avgEntryLifetime: number;
}

/**
 * System health snapshot.
 */
export interface HealthSnapshot {
  /** Overall health score (0-1) */
  healthScore: number;

  /** Individual health indicators */
  indicators: {
    /** Embedding service health */
    embeddings: HealthIndicator;

    /** Database health */
    database: HealthIndicator;

    /** Cache health */
    cache: HealthIndicator;

    /** Reranker health */
    reranker: HealthIndicator;
  };

  /** Active issues */
  issues: HealthIssue[];
}

/**
 * Health indicator status.
 */
export interface HealthIndicator {
  /** Status level */
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

  /** Score (0-1) */
  score: number;

  /** Last check timestamp */
  lastCheck: number;

  /** Response time (ms) or null if unavailable */
  responseTime: number | null;

  /** Error rate (0-1) */
  errorRate: number;
}

/**
 * Health issue/warning.
 */
export interface HealthIssue {
  /** Issue severity */
  severity: 'info' | 'warning' | 'error' | 'critical';

  /** Issue category */
  category: string;

  /** Issue message */
  message: string;

  /** When issue was first detected */
  detectedAt: number;

  /** Related metric value */
  value?: number;

  /** Threshold that was violated */
  threshold?: number;
}

/**
 * Trend data over time.
 */
export interface TrendSnapshot {
  /** Evaluation metrics trend */
  evaluation: TimeSeriesData[];

  /** Latency trend */
  latency: TimeSeriesData[];

  /** Cache hit rate trend */
  cacheHitRate: TimeSeriesData[];

  /** Retrieval volume trend */
  volume: TimeSeriesData[];
}

/**
 * Time series data point.
 */
export interface TimeSeriesData {
  /** Metric name */
  metric: string;

  /** Data points */
  points: Array<{
    timestamp: number;
    value: number;
  }>;

  /** Aggregate stats over the period */
  stats: {
    min: number;
    max: number;
    mean: number;
    trend: 'up' | 'down' | 'stable';
  };
}

/**
 * Metrics targets for evaluation.
 */
export interface MetricsTargets {
  /** Minimum Precision@5 */
  minPrecision5: number;

  /** Minimum Recall@10 */
  minRecall10: number;

  /** Minimum MRR */
  minMrr: number;

  /** Maximum P95 latency (ms) */
  maxP95Latency: number;

  /** Minimum cache hit rate */
  minCacheHitRate: number;

  /** Maximum error rate */
  maxErrorRate: number;
}

/**
 * Default metrics targets.
 */
export const DEFAULT_TARGETS: MetricsTargets = {
  minPrecision5: 0.8,
  minRecall10: 0.7,
  minMrr: 0.85,
  maxP95Latency: 100,
  minCacheHitRate: 0.3,
  maxErrorRate: 0.05,
};

/**
 * Dashboard data store.
 */
export interface DashboardStore {
  /** Save a metrics snapshot */
  saveSnapshot(snapshot: DashboardMetrics): void;

  /** Get recent snapshots */
  getRecentSnapshots(count: number): DashboardMetrics[];

  /** Get snapshots in time range */
  getSnapshotsInRange(start: number, end: number): DashboardMetrics[];

  /** Get oldest snapshot timestamp */
  getOldestTimestamp(): number | null;

  /** Get newest snapshot timestamp */
  getNewestTimestamp(): number | null;

  /** Clear old snapshots */
  clearOlderThan(timestamp: number): number;
}

/**
 * Metrics dashboard service.
 */
export interface MetricsDashboard {
  /**
   * Generate a current metrics snapshot.
   */
  generateSnapshot(): Promise<DashboardMetrics>;

  /**
   * Record evaluation results.
   */
  recordEvaluation(results: AggregatedMetrics): void;

  /**
   * Record retrieval log entry.
   */
  recordRetrieval(entry: RetrievalLogEntry): void;

  /**
   * Record embedding log entry.
   */
  recordEmbedding(entry: EmbeddingLogEntry): void;

  /**
   * Update cache stats.
   */
  updateCacheStats(stats: CacheStats): void;

  /**
   * Update health indicators.
   */
  updateHealth(indicators: Partial<HealthSnapshot['indicators']>): void;

  /**
   * Get metrics formatted for dashboard display.
   */
  getDashboardData(): Promise<DashboardMetrics>;

  /**
   * Get trends over a time period.
   */
  getTrends(period: 'hour' | 'day' | 'week' | 'month'): TrendSnapshot;

  /**
   * Export metrics as JSON.
   */
  exportMetrics(): string;

  /**
   * Check if targets are being met.
   */
  checkTargets(targets?: MetricsTargets): {
    passing: boolean;
    failures: Array<{ metric: string; value: number; target: number }>;
  };
}

/**
 * Create in-memory dashboard store.
 */
export function createInMemoryDashboardStore(): DashboardStore {
  const snapshots: DashboardMetrics[] = [];

  return {
    saveSnapshot(snapshot) {
      snapshots.push(snapshot);
      // Keep last 1000 snapshots
      if (snapshots.length > 1000) {
        snapshots.shift();
      }
    },

    getRecentSnapshots(count) {
      return snapshots.slice(-count);
    },

    getSnapshotsInRange(start, end) {
      return snapshots.filter((s) => s.timestamp >= start && s.timestamp <= end);
    },

    getOldestTimestamp() {
      if (snapshots.length === 0) return null;
      return snapshots[0].timestamp;
    },

    getNewestTimestamp() {
      if (snapshots.length === 0) return null;
      return snapshots[snapshots.length - 1].timestamp;
    },

    clearOlderThan(timestamp) {
      const before = snapshots.length;
      const idx = snapshots.findIndex((s) => s.timestamp >= timestamp);
      if (idx > 0) {
        snapshots.splice(0, idx);
      }
      return before - snapshots.length;
    },
  };
}

/**
 * Calculate trend direction from time series.
 */
function calculateTrend(points: Array<{ timestamp: number; value: number }>): 'up' | 'down' | 'stable' {
  if (points.length < 2) return 'stable';

  const recent = points.slice(-Math.min(10, points.length));
  const first = recent[0].value;
  const last = recent[recent.length - 1].value;
  const change = ((last - first) / first) * 100;

  if (Math.abs(change) < 5) return 'stable';
  return change > 0 ? 'up' : 'down';
}

/**
 * Calculate stats from values.
 */
function calculateStats(values: number[]): { min: number; max: number; mean: number } {
  if (values.length === 0) return { min: 0, max: 0, mean: 0 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { min, max, mean };
}

/**
 * Create metrics dashboard service.
 */
export function createMetricsDashboard(options: {
  store: DashboardStore;
  targets?: MetricsTargets;
  now?: () => number;
}): MetricsDashboard {
  const now = options.now ?? Date.now;
  const targets = options.targets ?? DEFAULT_TARGETS;

  // In-memory state for current metrics
  let currentEvaluation: AggregatedMetrics | null = null;
  const retrievalLogs: RetrievalLogEntry[] = [];
  const embeddingLogs: EmbeddingLogEntry[] = [];
  let currentCacheStats: CacheStats | null = null;
  const healthIndicators: HealthSnapshot['indicators'] = {
    embeddings: { status: 'unknown', score: 0, lastCheck: 0, responseTime: null, errorRate: 0 },
    database: { status: 'unknown', score: 0, lastCheck: 0, responseTime: null, errorRate: 0 },
    cache: { status: 'unknown', score: 0, lastCheck: 0, responseTime: null, errorRate: 0 },
    reranker: { status: 'unknown', score: 0, lastCheck: 0, responseTime: null, errorRate: 0 },
  };

  return {
    recordEvaluation(results) {
      currentEvaluation = results;
    },

    recordRetrieval(entry) {
      retrievalLogs.push(entry);
      // Keep last 1000 logs
      if (retrievalLogs.length > 1000) {
        retrievalLogs.shift();
      }
    },

    recordEmbedding(entry) {
      embeddingLogs.push(entry);
      if (embeddingLogs.length > 1000) {
        embeddingLogs.shift();
      }
    },

    updateCacheStats(stats) {
      currentCacheStats = stats;
    },

    updateHealth(indicators) {
      Object.assign(healthIndicators, indicators);
    },

    async generateSnapshot(): Promise<DashboardMetrics> {
      const timestamp = now();

      // Calculate retrieval metrics
      const successful = retrievalLogs.filter((l) => l.status === 'completed').length;
      const failed = retrievalLogs.filter((l) => l.status === 'failed').length;
      const total = retrievalLogs.length;

      const latencies = retrievalLogs
        .filter((l) => l.status === 'completed')
        .map((l) => l.latencyMs)
        .sort((a, b) => a - b);

      const latencySnapshot = latencies.length > 0
        ? {
            p50: latencies[Math.floor(latencies.length * 0.5)] ?? 0,
            p75: latencies[Math.floor(latencies.length * 0.75)] ?? 0,
            p90: latencies[Math.floor(latencies.length * 0.9)] ?? 0,
            p95: latencies[Math.floor(latencies.length * 0.95)] ?? 0,
            p99: latencies[Math.floor(latencies.length * 0.99)] ?? 0,
            min: latencies[0] ?? 0,
            max: latencies[latencies.length - 1] ?? 0,
            mean: latencies.reduce((a, b) => a + b, 0) / latencies.length,
          }
        : {
            p50: 0,
            p75: 0,
            p90: 0,
            p95: 0,
            p99: 0,
            min: 0,
            max: 0,
            mean: 0,
          };

      const resultCounts = new Map<number, number>();
      for (const log of retrievalLogs) {
        const count = log.resultCount ?? 0;
        resultCounts.set(count, (resultCounts.get(count) ?? 0) + 1);
      }

      // Evaluation snapshot
      const evalSnapshot: EvaluationSnapshot = currentEvaluation
        ? {
            precision: currentEvaluation.meanPrecision,
            recall: currentEvaluation.meanRecall,
            map: currentEvaluation.meanAveragePrecision,
            mrr: currentEvaluation.meanReciprocalRank,
            ndcg: currentEvaluation.meanNdcg,
            hitRate: currentEvaluation.hitRate,
            totalQueries: currentEvaluation.totalQueries,
            passingQueries: 0, // Calculated below
            targetPassRate: 0, // Calculated below
          }
        : {
            precision: new Map(),
            recall: new Map(),
            map: 0,
            mrr: 0,
            ndcg: new Map(),
            hitRate: 0,
            totalQueries: 0,
            passingQueries: 0,
            targetPassRate: 0,
          };

      // Calculate passing queries
      if (currentEvaluation) {
        const passing =
          (evalSnapshot.precision.get(5) ?? 0) >= targets.minPrecision5 &&
          (evalSnapshot.recall.get(10) ?? 0) >= targets.minRecall10 &&
          evalSnapshot.mrr >= targets.minMrr;
        evalSnapshot.passingQueries = passing ? currentEvaluation.totalQueries : 0;
        evalSnapshot.targetPassRate = passing ? 1 : 0;
      }

      // Cache snapshot
      const cacheSnapshot: CacheSnapshot = currentCacheStats ?? {
        entries: 0,
        totalLookups: 0,
        hits: 0,
        misses: 0,
        hitRate: 0,
        evictions: 0,
        invalidations: 0,
        estimatedSizeBytes: 0,
        estimatedCostSavings: { callsSaved: 0, percentReduction: 0 },
        avgEntryLifetime: 0,
      };

      if (currentCacheStats && currentCacheStats.totalLookups > 0) {
        cacheSnapshot.estimatedCostSavings = {
          callsSaved: currentCacheStats.hits,
          percentReduction: currentCacheStats.hitRate,
        };
      }

      // Health issues
      const issues: HealthIssue[] = [];

      if (latencySnapshot.p95 > targets.maxP95Latency) {
        issues.push({
          severity: 'warning',
          category: 'latency',
          message: `P95 latency exceeds target`,
          detectedAt: timestamp,
          value: latencySnapshot.p95,
          threshold: targets.maxP95Latency,
        });
      }

      if (currentCacheStats && currentCacheStats.hitRate < targets.minCacheHitRate && currentCacheStats.totalLookups > 100) {
        issues.push({
          severity: 'info',
          category: 'cache',
          message: `Cache hit rate below target`,
          detectedAt: timestamp,
          value: currentCacheStats.hitRate,
          threshold: targets.minCacheHitRate,
        });
      }

      const errorRate = total > 0 ? failed / total : 0;
      if (errorRate > targets.maxErrorRate) {
        issues.push({
          severity: 'error',
          category: 'retrieval',
          message: `Error rate exceeds target`,
          detectedAt: timestamp,
          value: errorRate,
          threshold: targets.maxErrorRate,
        });
      }

      // Calculate overall health score
      const healthScoreValues = [
        latencySnapshot.p95 > 0 && targets.maxP95Latency > 0
          ? 1 - Math.min(1, latencySnapshot.p95 / targets.maxP95Latency)
          : 1,
        currentCacheStats?.hitRate ?? 0,
        1 - errorRate,
        evalSnapshot.map,
      ];

      const healthScore =
        healthScoreValues.reduce((a, b) => a + b, 0) / healthScoreValues.length;

      const healthSnapshot: HealthSnapshot = {
        healthScore,
        indicators: { ...healthIndicators },
        issues,
      };

      // Calculate trends from historical data
      const recentSnapshots = options.store.getRecentSnapshots(50);

      const evalTrend: TimeSeriesData[] = [];
      const latencyTrend: TimeSeriesData[] = [];
      const cacheTrend: TimeSeriesData[] = [];
      const volumeTrend: TimeSeriesData[] = [];

      for (const snapshot of recentSnapshots) {
        // MAP trend
        evalTrend.push({
          metric: 'map',
          points: [{ timestamp: snapshot.timestamp, value: snapshot.evaluation.map }],
          stats: { min: 0, max: 1, mean: snapshot.evaluation.map, trend: 'stable' },
        });

        // P95 latency trend
        latencyTrend.push({
          metric: 'p95_latency',
          points: [{ timestamp: snapshot.timestamp, value: snapshot.retrieval.latency.p95 }],
          stats: {
            min: 0,
            max: snapshot.retrieval.latency.p95,
            mean: snapshot.retrieval.latency.p95,
            trend: 'stable',
          },
        });

        // Cache hit rate trend
        cacheTrend.push({
          metric: 'cache_hit_rate',
          points: [{ timestamp: snapshot.timestamp, value: snapshot.cache.hitRate }],
          stats: { min: 0, max: 1, mean: snapshot.cache.hitRate, trend: 'stable' },
        });

        // Volume trend
        volumeTrend.push({
          metric: 'retrieval_volume',
          points: [{ timestamp: snapshot.timestamp, value: snapshot.retrieval.totalRetrievals }],
          stats: {
            min: 0,
            max: snapshot.retrieval.totalRetrievals,
            mean: snapshot.retrieval.totalRetrievals,
            trend: 'stable',
          },
        });
      }

      // Calculate trend directions
      const mapPoints = recentSnapshots.map((s) => ({ timestamp: s.timestamp, value: s.evaluation.map }));
      const p95Points = recentSnapshots.map((s) => ({ timestamp: s.timestamp, value: s.retrieval.latency.p95 }));
      const cachePoints = recentSnapshots.map((s) => ({ timestamp: s.timestamp, value: s.cache.hitRate }));
      const volumePoints = recentSnapshots.map((s) => ({ timestamp: s.timestamp, value: s.retrieval.totalRetrievals }));

      const trendSnapshot: TrendSnapshot = {
        evaluation: [{ metric: 'map', points: mapPoints, stats: calculateStats(mapPoints.map((p) => p.value)) }],
        latency: [{ metric: 'p95_latency', points: p95Points, stats: calculateStats(p95Points.map((p) => p.value)) }],
        cacheHitRate: [{ metric: 'cache_hit_rate', points: cachePoints, stats: calculateStats(cachePoints.map((p) => p.value)) }],
        volume: [{ metric: 'retrieval_volume', points: volumePoints, stats: calculateStats(volumePoints.map((p) => p.value)) }],
      };

      const dashboardMetrics: DashboardMetrics = {
        timestamp,
        evaluation: evalSnapshot,
        retrieval: {
          totalRetrievals: total,
          successfulRetrievals: successful,
          failedRetrievals: failed,
          successRate: total > 0 ? successful / total : 1,
          latency: latencySnapshot,
          avgResults: total > 0 ? retrievalLogs.reduce((sum, l) => sum + (l.resultCount ?? 0), 0) / total : 0,
          resultDistribution: resultCounts,
        },
        cache: cacheSnapshot,
        health: healthSnapshot,
        trends: trendSnapshot,
      };

      // Save snapshot
      options.store.saveSnapshot(dashboardMetrics);

      return dashboardMetrics;
    },

    async getDashboardData(): Promise<DashboardMetrics> {
      const snapshots = options.store.getRecentSnapshots(1);
      if (snapshots.length > 0) {
        return snapshots[0];
      }
      return this.generateSnapshot();
    },

    getTrends(period: 'hour' | 'day' | 'week' | 'month'): TrendSnapshot {
      const now_ = now();
      const periodMs =
        period === 'hour' ? 60 * 60 * 1000 :
        period === 'day' ? 24 * 60 * 60 * 1000 :
        period === 'week' ? 7 * 24 * 60 * 60 * 1000 :
        30 * 24 * 60 * 60 * 1000;

      const start = now_ - periodMs;
      const snapshots = options.store.getSnapshotsInRange(start, now_);

      const mapPoints = snapshots.map((s) => ({ timestamp: s.timestamp, value: s.evaluation.map }));
      const p95Points = snapshots.map((s) => ({ timestamp: s.timestamp, value: s.retrieval.latency.p95 }));
      const cachePoints = snapshots.map((s) => ({ timestamp: s.timestamp, value: s.cache.hitRate }));
      const volumePoints = snapshots.map((s) => ({ timestamp: s.timestamp, value: s.retrieval.totalRetrievals }));

      return {
        evaluation: [{ metric: 'map', points: mapPoints, stats: calculateStats(mapPoints.map((p) => p.value)) }],
        latency: [{ metric: 'p95_latency', points: p95Points, stats: calculateStats(p95Points.map((p) => p.value)) }],
        cacheHitRate: [{ metric: 'cache_hit_rate', points: cachePoints, stats: calculateStats(cachePoints.map((p) => p.value)) }],
        volume: [{ metric: 'retrieval_volume', points: volumePoints, stats: calculateStats(volumePoints.map((p) => p.value)) }],
      };
    },

    exportMetrics(): string {
      const snapshots = options.store.getRecentSnapshots(100);
      return JSON.stringify(snapshots, null, 2);
    },

    checkTargets(customTargets) {
      const t = customTargets ?? targets;
      const failures: Array<{ metric: string; value: number; target: number }> = [];

      if (currentEvaluation) {
        const p5 = currentEvaluation.meanPrecision.get(5) ?? 0;
        if (p5 < t.minPrecision5) {
          failures.push({ metric: 'Precision@5', value: p5, target: t.minPrecision5 });
        }

        const r10 = currentEvaluation.meanRecall.get(10) ?? 0;
        if (r10 < t.minRecall10) {
          failures.push({ metric: 'Recall@10', value: r10, target: t.minRecall10 });
        }

        if (currentEvaluation.meanReciprocalRank < t.minMrr) {
          failures.push({
            metric: 'MRR',
            value: currentEvaluation.meanReciprocalRank,
            target: t.minMrr,
          });
        }
      }

      const latencies = retrievalLogs
        .filter((l) => l.status === 'completed')
        .map((l) => l.latencyMs)
        .sort((a, b) => a - b);
      if (latencies.length > 0) {
        const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
        if (p95 > t.maxP95Latency) {
          failures.push({ metric: 'P95 Latency', value: p95, target: t.maxP95Latency });
        }
      }

      if (currentCacheStats && currentCacheStats.totalLookups > 100) {
        if (currentCacheStats.hitRate < t.minCacheHitRate) {
          failures.push({
            metric: 'Cache Hit Rate',
            value: currentCacheStats.hitRate,
            target: t.minCacheHitRate,
          });
        }
      }

      const total = retrievalLogs.length;
      const failed = retrievalLogs.filter((l) => l.status === 'failed').length;
      const errorRate = total > 0 ? failed / total : 0;
      if (errorRate > t.maxErrorRate) {
        failures.push({ metric: 'Error Rate', value: errorRate, target: t.maxErrorRate });
      }

      return {
        passing: failures.length === 0,
        failures,
      };
    },
  };
}
