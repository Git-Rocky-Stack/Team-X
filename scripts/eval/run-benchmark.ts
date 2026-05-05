/**
 * Run Baseline RAG Evaluation
 *
 * Executes the golden dataset evaluation and generates a performance report.
 * This script should be run after:
 * 1. Database migration (sqlite-vec)
 * 2. Updating golden dataset with real IDs
 * 3. Indexing sufficient content
 *
 * Usage:
 *   npx tsx scripts/eval/run-benchmark.ts
 *
 * Options:
 *   --output     Output file for JSON report (default: stdout)
 *   --format     Report format: json | text | html (default: text)
 *   --top-k      Top-K for retrieval (default: 10)
 *   --threshold  Similarity threshold (default: 0.7)
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

import {
  type AggregatedMetrics,
  type EvalQuery,
  createRagEvaluator,
} from '@team-x/intelligence/eval';
import { type RagService, createRagService } from '@team-x/intelligence/rag';
import { createEmbeddingGenerator } from '@team-x/intelligence/rag';
import { createQueryCache } from '@team-x/intelligence/rag';

interface Options {
  outputFile?: string;
  format: 'json' | 'text' | 'html';
  topK: number;
  threshold: number;
  embeddingModel: string;
  embeddingApiKey?: string;
}

/**
 * Get database path from environment or default.
 */
function getDatabasePath(): string {
  return process.env.TEAM_X_DB_PATH || join(process.cwd(), 'team-x.db');
}

/**
 * Create RAG service from database configuration.
 */
function createRagServiceFromDb(dbPath: string, options: Options): RagService {
  const db = new Database(dbPath);

  // Create embedding generator
  const embedder = createEmbeddingGenerator({
    model: options.embeddingModel,
    apiKey: options.embeddingApiKey || process.env.OPENAI_API_KEY,
  });

  // Create query cache
  const cache = createQueryCache({
    maxSize: 1000,
    defaultTtl: 300000, // 5 minutes
  });

  // Create repo interface
  const repo = {
    upsert(input) {
      const stmt = db.prepare(`
        INSERT INTO embeddings (id, company_id, source_type, source_id, chunk_index, content_text, embedding, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_id, chunk_index) DO UPDATE SET
          content_text = excluded.content_text,
          embedding = excluded.embedding
      `);
      stmt.run(
        input.id,
        input.companyId,
        input.sourceType,
        input.sourceId,
        input.chunkIndex,
        input.contentText,
        input.embedding,
        input.createdAt,
      );
      return input.id;
    },

    deleteBySource(sourceId) {
      const stmt = db.prepare('DELETE FROM embeddings WHERE source_id = ?');
      const result = stmt.run(sourceId);
      return result.changes;
    },

    listByCompany(companyId) {
      const stmt = db.prepare(`
        SELECT id, source_type, source_id, chunk_index, content_text, embedding, created_at
        FROM embeddings
        WHERE company_id = ?
      `);
      return stmt.all(companyId) as any[];
    },

    similaritySearch: async (input) => {
      // Try sqlite-vec if available
      try {
        const vecStmt = db.prepare(`
          SELECT e.id, e.source_id, e.source_type, e.chunk_index, e.content_text, v.distance
          FROM embeddings e INNER JOIN embeddings_vec v ON e.rowid = v.rowid
          WHERE e.company_id = ? AND v.distance <= ?
          ${input.excludeSourceIds?.length ? `AND e.source_id NOT IN (${input.excludeSourceIds.map(() => '?').join(',')})` : ''}
          ORDER BY v.distance ASC
          LIMIT ?
        `);

        const params: any[] = [input.companyId, 1 - input.threshold];
        if (input.excludeSourceIds) {
          params.push(...input.excludeSourceIds);
        }
        params.push(input.topK);

        const results = vecStmt.all(...params) as any[];

        // Convert distance to similarity (sqlite-vec returns cosine distance)
        return results.map((r) => ({
          id: r.id,
          sourceId: r.source_id,
          sourceType: r.source_type,
          chunkIndex: r.chunk_index,
          contentText: r.content_text,
          similarity: 1 - r.distance,
        }));
      } catch {
        // Fall back to nil if sqlite-vec not available
        return [];
      }
    },
  };

  // Create RAG service
  return createRagService({
    embedText: embedder.embedText,
    dimension: embedder.dimension,
    repo,
    cache,
    cacheTtl: 300000,
  });
}

/**
 * Run evaluation on golden dataset.
 */
async function runEvaluation(
  dataset: EvalQuery[],
  ragService: RagService,
  options: Options,
): Promise<AggregatedMetrics> {
  // Get a company ID from the dataset
  const firstQuery = dataset[0];
  const companyId = firstQuery?.companyId || 'default';

  const evaluator = createRagEvaluator({
    retrieve: async (query) => {
      const hits = await ragService.retrieve({
        companyId,
        query,
        topK: options.topK,
        threshold: options.threshold,
      });
      return {
        results: hits.map((h) => ({
          id: h.sourceId,
          score: h.similarity,
          content: h.contentText,
        })),
      };
    },
  });

  console.log(`\n🔍 Evaluating ${dataset.length} queries...`);
  console.log('━'.repeat(60));

  const results = await evaluator.evaluateDataset(dataset);

  return results;
}

/**
 * Format metrics as text report.
 */
function formatTextReport(metrics: AggregatedMetrics): string {
  const lines: string[] = [];

  lines.push('╔════════════════════════════════════════════════════════════╗');
  lines.push('║          RAG Baseline Evaluation Report                 ║');
  lines.push('╚════════════════════════════════════════════════════════════╝');
  lines.push('');

  // Overall metrics
  lines.push('📊 OVERALL METRICS');
  lines.push('━'.repeat(60));
  lines.push(`Total Queries:      ${metrics.totalQueries}`);
  lines.push(`Hit Rate:           ${(metrics.hitRate * 100).toFixed(1)}%`);
  lines.push(`Mean Avg Precision: ${metrics.meanAveragePrecision.toFixed(4)}`);
  lines.push(`Mean Reciprocal Rank: ${metrics.meanReciprocalRank.toFixed(4)}`);
  lines.push('');

  // Precision@K
  lines.push('📯 PRECISION @ K');
  lines.push('━'.repeat(60));
  for (const [k, value] of metrics.meanPrecision) {
    const bar = '█'.repeat(Math.round(value * 20));
    lines.push(`P@${k}:  ${(value * 100).toFixed(1)}%  ${bar}`);
  }
  lines.push('');

  // Recall@K
  lines.push('🔄 RECALL @ K');
  lines.push('━'.repeat(60));
  for (const [k, value] of metrics.meanRecall) {
    const bar = '█'.repeat(Math.round(value * 20));
    lines.push(`R@${k}:  ${(value * 100).toFixed(1)}%  ${bar}`);
  }
  lines.push('');

  // NDCG@K
  lines.push('📈 NDCG @ K');
  lines.push('━'.repeat(60));
  for (const [k, value] of metrics.meanNdcg) {
    const bar = '█'.repeat(Math.round(value * 20));
    lines.push(`NDCG@${k}: ${value.toFixed(3)}  ${bar}`);
  }
  lines.push('');

  // Latency
  lines.push('⏱️  LATENCY');
  lines.push('━'.repeat(60));
  lines.push(`P50:  ${metrics.latency.p50.toFixed(1)}ms`);
  lines.push(`P95:  ${metrics.latency.p95.toFixed(1)}ms`);
  lines.push(`P99:  ${metrics.latency.p99.toFixed(1)}ms`);
  lines.push('');

  // Target checking
  lines.push('🎯 TARGET CHECKING');
  lines.push('━'.repeat(60));

  const targets = {
    'Precision@5': { value: metrics.meanPrecision.get(5) ?? 0, target: 0.8 },
    'Recall@10': { value: metrics.meanRecall.get(10) ?? 0, target: 0.7 },
    MRR: { value: metrics.meanReciprocalRank, target: 0.85 },
    'P95 Latency': { value: metrics.latency.p95, target: 100, inverse: true },
  };

  let allPass = true;
  for (const [name, { value, target, inverse }] of Object.entries(targets)) {
    const pass = inverse ? value <= target : value >= target;
    allPass = allPass && pass;
    const status = pass ? '✅' : '❌';
    lines.push(
      `${status} ${name}: ${value.toFixed(inverse ? 1 : 4)} / ${target}${inverse ? 'ms' : ''}`,
    );
  }
  lines.push('');

  if (allPass) {
    lines.push('🎉 All targets met!');
  } else {
    lines.push('⚠️  Some targets not met. Review results above.');
  }

  return lines.join('\n');
}

/**
 * Format metrics as HTML report.
 */
function formatHtmlReport(metrics: AggregatedMetrics): string {
  const pValues = Array.from(metrics.meanPrecision.entries()).map(([k, v]) => ({ k, v }));
  const rValues = Array.from(metrics.meanRecall.entries()).map(([k, v]) => ({ k, v }));

  return `
<!DOCTYPE html>
<html>
<head>
  <title>RAG Baseline Evaluation</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; }
    h1 { color: #FFAA2024; }
    .metric { margin: 20px 0; }
    .metric-label { font-weight: bold; }
    .bar-container { background: #f0f0f0; height: 20px; border-radius: 4px; margin: 5px 0; overflow: hidden; }
    .bar { background: #FFAA2024; height: 100%; transition: width 0.3s; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
    .card { background: #f9f9f9; padding: 20px; border-radius: 8px; }
    .pass { color: #22c55e; }
    .fail { color: #ef4444; }
  </style>
</head>
<body>
  <h1>📊 RAG Baseline Evaluation Report</h1>

  <div class="grid">
    <div class="card">
      <div class="metric-label">Total Queries</div>
      <div style="font-size: 24px;">${metrics.totalQueries}</div>
    </div>
    <div class="card">
      <div class="metric-label">Hit Rate</div>
      <div style="font-size: 24px;">${(metrics.hitRate * 100).toFixed(1)}%</div>
    </div>
    <div class="card">
      <div class="metric-label">Mean Avg Precision</div>
      <div style="font-size: 24px;">${metrics.meanAveragePrecision.toFixed(4)}</div>
    </div>
    <div class="card">
      <div class="metric-label">Mean Reciprocal Rank</div>
      <div style="font-size: 24px;">${metrics.meanReciprocalRank.toFixed(4)}</div>
    </div>
  </div>

  <h2>📯 Precision @ K</h2>
  ${pValues
    .map(
      ({ k, v }) => `
    <div class="metric">
      <div class="metric-label">P@${k}: ${(v * 100).toFixed(1)}%</div>
      <div class="bar-container"><div class="bar" style="width: ${v * 100}%"></div></div>
    </div>
  `,
    )
    .join('')}

  <h2>🔄 Recall @ K</h2>
  ${rValues
    .map(
      ({ k, v }) => `
    <div class="metric">
      <div class="metric-label">R@${k}: ${(v * 100).toFixed(1)}%</div>
      <div class="bar-container"><div class="bar" style="width: ${v * 100}%"></div></div>
    </div>
  `,
    )
    .join('')}

  <h2>⏱️ Latency</h2>
  <div class="grid">
    <div class="card">P50: ${metrics.latency.p50.toFixed(1)}ms</div>
    <div class="card">P95: ${metrics.latency.p95.toFixed(1)}ms</div>
    <div class="card">P99: ${metrics.latency.p99.toFixed(1)}ms</div>
  </div>

  <h2>🎯 Target Checking</h2>
  <div class="card">
    <div class="${(metrics.meanPrecision.get(5) ?? 0 >= 0.8) ? 'pass' : 'fail'}">
      ${(metrics.meanPrecision.get(5) ?? 0 >= 0.8) ? '✅' : '❌'} Precision@5: ${((metrics.meanPrecision.get(5) ?? 0) * 100).toFixed(1)}% / 80%
    </div>
    <div class="${(metrics.meanRecall.get(10) ?? 0 >= 0.7) ? 'pass' : 'fail'}">
      ${(metrics.meanRecall.get(10) ?? 0 >= 0.7) ? '✅' : '❌'} Recall@10: ${((metrics.meanRecall.get(10) ?? 0) * 100).toFixed(1)}% / 70%
    </div>
    <div class="${metrics.meanReciprocalRank >= 0.85 ? 'pass' : 'fail'}">
      ${metrics.meanReciprocalRank >= 0.85 ? '✅' : '❌'} MRR: ${metrics.meanReciprocalRank.toFixed(4)} / 0.85
    </div>
    <div class="${metrics.latency.p95 <= 100 ? 'pass' : 'fail'}">
      ${metrics.latency.p95 <= 100 ? '✅' : '❌'} P95 Latency: ${metrics.latency.p95.toFixed(1)}ms / 100ms
    </div>
  </div>

  <p style="color: #666; margin-top: 40px; font-size: 12px;">
    Generated ${new Date().toISOString()}
  </p>
</body>
</html>
  `.trim();
}

/**
 * Main execution.
 */
async function main() {
  const args = process.argv.slice(2);

  const options: Options = {
    format: (args.find((a) => a.startsWith('--format='))?.split('=')[1] || 'text') as any,
    outputFile: args.find((a) => a.startsWith('--output='))?.split('=')[1],
    topK: Number.parseInt(args.find((a) => a.startsWith('--top-k='))?.split('=')[1] || '10', 10),
    threshold: Number.parseFloat(
      args.find((a) => a.startsWith('--threshold='))?.split('=')[1] || '0.7',
    ),
    embeddingModel:
      args.find((a) => a.startsWith('--model='))?.split('=')[1] || 'text-embedding-3-small',
    embeddingApiKey: args.find((a) => a.startsWith('--api-key='))?.split('=')[1],
  };

  console.log('🚀 Running RAG Baseline Evaluation');
  console.log('━'.repeat(60));
  console.log(`Database: ${getDatabasePath()}`);
  console.log(`Top-K: ${options.topK}`);
  console.log(`Threshold: ${options.threshold}`);
  console.log(`Format: ${options.format}`);
  console.log('━'.repeat(60));

  // Load golden dataset
  console.log('\n📂 Loading golden dataset...');
  const { GOLDEN_DATASET } = await import('@team-x/intelligence/eval');
  console.log(`✅ Loaded ${GOLDEN_DATASET.length} queries`);

  // Create RAG service
  console.log('\n🔧 Creating RAG service...');
  const ragService = createRagServiceFromDb(getDatabasePath(), options);
  console.log('✅ RAG service ready');

  // Run evaluation
  const metrics = await runEvaluation(GOLDEN_DATASET, ragService, options);

  // Format output
  console.log('\n📊 Results:');
  console.log('━'.repeat(60));

  let output: string;

  switch (options.format) {
    case 'json':
      output = JSON.stringify(metrics, null, 2);
      break;
    case 'html':
      output = formatHtmlReport(metrics);
      break;
    default:
      output = formatTextReport(metrics);
  }

  console.log(output);

  // Write to file if specified
  if (options.outputFile) {
    writeFileSync(options.outputFile, output, 'utf-8');
    console.log(`\n✅ Report saved to ${options.outputFile}`);
  }
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
