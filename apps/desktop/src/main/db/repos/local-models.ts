/**
 * Local models repository — factory-pattern CRUD for the `local_models`
 * table (v3.3.0 local GGUF support, spec § 7).
 *
 * Typed over the generic `BaseSQLiteDatabase<'sync', TRunResult, Schema>`
 * so the same factory accepts the `BetterSQLite3Database` returned by
 * `getDb()` at runtime and the `SQLJsDatabase` returned by `makeTestDb()`
 * under Vitest — the workspace convention (see companies.ts / test-helpers.ts).
 *
 * The boolean flags map cleanly because the schema declares them with
 * `integer({ mode: 'boolean' })`, so `$inferSelect` already yields booleans;
 * mapRow only narrows the text discriminant columns to their string-literal
 * unions. The source-shape CHECK constraint is enforced at the SQL layer —
 * callers (the library service, Phase 3) supply file/folder rows with a
 * source_path and no endpoint, and remote-endpoint rows the other way around.
 */

import { desc, eq, sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { LocalModel, ModelStatus, SourceType } from '@team-x/shared-types';

import type { Schema } from '../client.js';
import { localModels } from '../schema.js';

export interface InsertLocalModelInput {
  displayName: string;
  sourceType: SourceType;
  sourcePath: string | null;
  endpointId: string | null;
  ggufArch: string | null;
  ggufParamsB: number | null;
  ggufQuant: string | null;
  ggufContextMax: number | null;
  ggufSizeBytes: number | null;
  ggufSha256: string | null;
  ggufChatTemplate: string | null;
  isEmbeddingModel: boolean;
  isToolCapable: boolean;
  hfRepoId: string | null;
  hfFilename: string | null;
  license: string | null;
  chatTemplateOverride: string | null;
  systemPromptOverride: string | null;
}

type LocalModelsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

function mapRow(row: typeof localModels.$inferSelect): LocalModel {
  return {
    ...row,
    sourceType: row.sourceType as SourceType,
    status: row.status as ModelStatus,
  };
}

export function createLocalModelsRepo<TRunResult>(db: LocalModelsDb<TRunResult>) {
  function getById(id: string): LocalModel | null {
    const row = db.select().from(localModels).where(eq(localModels.id, id)).get();
    return row ? mapRow(row) : null;
  }

  /** Re-read a row after a write; throws if it vanished (it never should). */
  function readBack(id: string): LocalModel {
    const row = getById(id);
    if (!row) throw new Error(`local_models row ${id} not found after write`);
    return row;
  }

  return {
    /** Insert a new model (status starts 'cold') and return the stored row. */
    insert(input: InsertLocalModelInput): LocalModel {
      const id = nanoid();
      const now = Date.now();
      db.insert(localModels)
        .values({
          id,
          displayName: input.displayName,
          sourceType: input.sourceType,
          sourcePath: input.sourcePath,
          endpointId: input.endpointId,
          ggufArch: input.ggufArch,
          ggufParamsB: input.ggufParamsB,
          ggufQuant: input.ggufQuant,
          ggufContextMax: input.ggufContextMax,
          ggufSizeBytes: input.ggufSizeBytes,
          ggufSha256: input.ggufSha256,
          ggufChatTemplate: input.ggufChatTemplate,
          isEmbeddingModel: input.isEmbeddingModel,
          isToolCapable: input.isToolCapable,
          hfRepoId: input.hfRepoId,
          hfFilename: input.hfFilename,
          license: input.license,
          chatTemplateOverride: input.chatTemplateOverride,
          systemPromptOverride: input.systemPromptOverride,
          status: 'cold',
          statusDetail: null,
          lastUsedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return readBack(id);
    },

    /** Return the model with a matching id, or null if none exists. */
    getById,

    /**
     * Every model, most-recently-used first. NULL last_used_at rows sort
     * after used rows, then created_at DESC breaks ties.
     */
    list(): LocalModel[] {
      return db
        .select()
        .from(localModels)
        .orderBy(
          sql`${localModels.lastUsedAt} is null`,
          desc(localModels.lastUsedAt),
          desc(localModels.createdAt),
        )
        .all()
        .map(mapRow);
    },

    /** Models of a single source type, same ordering as `list()`. */
    listBySourceType(sourceType: SourceType): LocalModel[] {
      return db
        .select()
        .from(localModels)
        .where(eq(localModels.sourceType, sourceType))
        .orderBy(
          sql`${localModels.lastUsedAt} is null`,
          desc(localModels.lastUsedAt),
          desc(localModels.createdAt),
        )
        .all()
        .map(mapRow);
    },

    /** Set the lifecycle status + optional detail; bumps updated_at. */
    updateStatus(id: string, status: ModelStatus, detail: string | null): LocalModel {
      db.update(localModels)
        .set({ status, statusDetail: detail, updatedAt: Date.now() })
        .where(eq(localModels.id, id))
        .run();
      return readBack(id);
    },

    /** Persist (or clear, with null) the per-model system-prompt override. */
    setSystemPrompt(id: string, prompt: string | null): LocalModel {
      db.update(localModels)
        .set({ systemPromptOverride: prompt, updatedAt: Date.now() })
        .where(eq(localModels.id, id))
        .run();
      return readBack(id);
    },

    /** Persist (or clear, with null) the per-model chat-template override. */
    setChatTemplateOverride(id: string, template: string | null): LocalModel {
      db.update(localModels)
        .set({ chatTemplateOverride: template, updatedAt: Date.now() })
        .where(eq(localModels.id, id))
        .run();
      return readBack(id);
    },

    /** Stamp last_used_at = now (called when a model is loaded / chatted with). */
    touchLastUsed(id: string): LocalModel {
      const now = Date.now();
      db.update(localModels)
        .set({ lastUsedAt: now, updatedAt: now })
        .where(eq(localModels.id, id))
        .run();
      return readBack(id);
    },

    /**
     * Hard-delete a model. Cascades to local_model_advanced_params and
     * local_model_benchmarks via their ON DELETE CASCADE FKs. No-op on
     * unknown id.
     */
    remove(id: string): void {
      db.delete(localModels).where(eq(localModels.id, id)).run();
    },
  };
}

export type LocalModelsRepo = ReturnType<typeof createLocalModelsRepo>;
