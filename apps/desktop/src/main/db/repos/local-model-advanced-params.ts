/**
 * Local model advanced-params repository — per-model Advanced-panel
 * overrides (v3.3.0 local GGUF support, spec § 7).
 *
 * The PK is `model_id`, so a model has at most one row. NULL in any tuning
 * column means "fall back to auto-tune." `clear()` deletes the row entirely
 * (the "Reset to Auto" affordance). Boolean columns map directly because the
 * schema declares them with `integer({ mode: 'boolean' })`.
 */

import { eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type { AdvancedParams } from '@team-x/shared-types';

import type { Schema } from '../client.js';
import { localModelAdvancedParams } from '../schema.js';

export interface UpsertAdvancedParamsInput {
  nCtx: number | null;
  nGpuLayers: number | null;
  nBatch: number | null;
  nThreads: number | null;
  temperature: number | null;
  topP: number | null;
  topK: number | null;
  repeatPenalty: number | null;
  mmap: boolean | null;
  mlock: boolean | null;
  flashAttention: boolean | null;
}

type AdvancedParamsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createLocalModelAdvancedParamsRepo<TRunResult>(db: AdvancedParamsDb<TRunResult>) {
  function getByModelId(modelId: string): AdvancedParams | null {
    const row = db
      .select()
      .from(localModelAdvancedParams)
      .where(eq(localModelAdvancedParams.modelId, modelId))
      .get();
    return row ?? null;
  }

  return {
    /**
     * Insert or update (by model_id PK) the tuning overrides for a model.
     * Always overwrites the full tuple — callers pass the complete desired
     * state, not a partial patch.
     */
    upsert(modelId: string, params: UpsertAdvancedParamsInput): AdvancedParams {
      const updatedAt = Date.now();
      const values = {
        modelId,
        nCtx: params.nCtx,
        nGpuLayers: params.nGpuLayers,
        nBatch: params.nBatch,
        nThreads: params.nThreads,
        temperature: params.temperature,
        topP: params.topP,
        topK: params.topK,
        repeatPenalty: params.repeatPenalty,
        mmap: params.mmap,
        mlock: params.mlock,
        flashAttention: params.flashAttention,
        updatedAt,
      };
      db.insert(localModelAdvancedParams)
        .values(values)
        .onConflictDoUpdate({
          target: localModelAdvancedParams.modelId,
          set: {
            nCtx: values.nCtx,
            nGpuLayers: values.nGpuLayers,
            nBatch: values.nBatch,
            nThreads: values.nThreads,
            temperature: values.temperature,
            topP: values.topP,
            topK: values.topK,
            repeatPenalty: values.repeatPenalty,
            mmap: values.mmap,
            mlock: values.mlock,
            flashAttention: values.flashAttention,
            updatedAt: values.updatedAt,
          },
        })
        .run();
      const row = getByModelId(modelId);
      if (!row) throw new Error(`local_model_advanced_params row ${modelId} not found after upsert`);
      return row;
    },

    /** Return the override row for a model, or null if none (= use auto-tune). */
    getByModelId,

    /** Delete the override row — used for "Reset to Auto." No-op if absent. */
    clear(modelId: string): void {
      db.delete(localModelAdvancedParams)
        .where(eq(localModelAdvancedParams.modelId, modelId))
        .run();
    },
  };
}

export type LocalModelAdvancedParamsRepo = ReturnType<typeof createLocalModelAdvancedParamsRepo>;
