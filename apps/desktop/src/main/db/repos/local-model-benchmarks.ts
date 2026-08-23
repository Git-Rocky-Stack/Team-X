/**
 * Local model benchmarks repository — per-model throughput history for
 * v3.3.0 local GGUF support (spec § 7).
 *
 * Backs the `localGguf.benchmark.run` (insert) and
 * `localGguf.benchmark.history` (listByModel) channels. Rows are immutable
 * once written: a benchmark is a measurement of one run at one point in
 * time, so there is no update path — a re-run is a new row, which is what
 * makes the history meaningful. Deleting a model cascades its runs away
 * (ON DELETE CASCADE).
 *
 * `vramPeakMb` is nullable on purpose. A CPU backend has no VRAM, and a
 * Linux box probed via `lspci` reports a device with no memory figure at
 * all. Null means "not measured"; zero would claim a measurement of zero.
 */

import type { BenchmarkResult, GpuBackend } from '@team-x/shared-types';
import { desc, eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { localModelBenchmarks } from '../schema.js';

/**
 * One completed benchmark run, minus the fields the repo owns (`id`, `ranAt`).
 */
export interface InsertBenchmarkInput {
  modelId: string;
  promptEvalTokS: number;
  genTokS: number;
  ttftMs: number;
  /** Peak VRAM during the run, or null when the backend cannot report it. */
  vramPeakMb: number | null;
  backend: GpuBackend;
  nCtxUsed: number;
  nGpuLayersUsed: number;
  /** Defaults to now; injectable so callers can stamp the true run start. */
  ranAt?: number;
}

type BenchmarksDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

function mapRow(row: typeof localModelBenchmarks.$inferSelect): BenchmarkResult {
  return { ...row, backend: row.backend as GpuBackend };
}

export function createLocalModelBenchmarksRepo<TRunResult>(db: BenchmarksDb<TRunResult>) {
  function getById(id: string): BenchmarkResult | null {
    const row = db.select().from(localModelBenchmarks).where(eq(localModelBenchmarks.id, id)).get();
    return row ? mapRow(row) : null;
  }

  return {
    /** Record one completed run and return the stored row. */
    insert(input: InsertBenchmarkInput): BenchmarkResult {
      const id = nanoid();
      db.insert(localModelBenchmarks)
        .values({
          id,
          modelId: input.modelId,
          promptEvalTokS: input.promptEvalTokS,
          genTokS: input.genTokS,
          ttftMs: input.ttftMs,
          vramPeakMb: input.vramPeakMb,
          backend: input.backend,
          nCtxUsed: input.nCtxUsed,
          nGpuLayersUsed: input.nGpuLayersUsed,
          ranAt: input.ranAt ?? Date.now(),
        })
        .run();
      const row = getById(id);
      if (!row) throw new Error(`local_model_benchmarks row ${id} not found after write`);
      return row;
    },

    /** Return the benchmark with a matching id, or null if none exists. */
    getById,

    /** Every run for one model, newest first. Empty when never benchmarked. */
    listByModel(modelId: string): BenchmarkResult[] {
      return db
        .select()
        .from(localModelBenchmarks)
        .where(eq(localModelBenchmarks.modelId, modelId))
        .orderBy(desc(localModelBenchmarks.ranAt))
        .all()
        .map(mapRow);
    },
  };
}

export type LocalModelBenchmarksRepo = ReturnType<typeof createLocalModelBenchmarksRepo>;
