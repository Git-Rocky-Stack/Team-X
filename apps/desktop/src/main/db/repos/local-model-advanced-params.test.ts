import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { createLocalModelAdvancedParamsRepo } from './local-model-advanced-params.js';
import { createLocalModelsRepo } from './local-models.js';

function fileModel(name: string) {
  return {
    displayName: name,
    sourceType: 'file' as const,
    sourcePath: `/m/${name}.gguf`,
    endpointId: null,
    ggufArch: null,
    ggufParamsB: null,
    ggufQuant: null,
    ggufContextMax: null,
    ggufSizeBytes: null,
    ggufSha256: null,
    ggufChatTemplate: null,
    isEmbeddingModel: false,
    isToolCapable: false,
    hfRepoId: null,
    hfFilename: null,
    license: null,
    chatTemplateOverride: null,
    systemPromptOverride: null,
  };
}

const ALL_NULL = {
  nCtx: null,
  nGpuLayers: null,
  nBatch: null,
  nThreads: null,
  temperature: null,
  topP: null,
  topK: null,
  repeatPenalty: null,
  mmap: null,
  mlock: null,
  flashAttention: null,
};

describe('localModelAdvancedParamsRepo', () => {
  let ctx: TestDbHandle;
  let repo: ReturnType<typeof createLocalModelAdvancedParamsRepo>;
  let modelId: string;

  beforeEach(async () => {
    ctx = await makeTestDb();
    repo = createLocalModelAdvancedParamsRepo(ctx.db);
    // Seed a model so the FK target is valid.
    modelId = createLocalModelsRepo(ctx.db).insert(fileModel('M')).id;
  });

  afterEach(() => {
    ctx.close();
  });

  it('upsert inserts when no row exists', () => {
    const result = repo.upsert(modelId, {
      nCtx: 8192,
      nGpuLayers: 35,
      nBatch: 512,
      nThreads: 8,
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      repeatPenalty: 1.1,
      mmap: true,
      mlock: false,
      flashAttention: true,
    });
    expect(result.modelId).toBe(modelId);
    expect(result.nCtx).toBe(8192);
    expect(result.temperature).toBe(0.7);
    expect(result.mmap).toBe(true);
    expect(result.mlock).toBe(false);
    expect(result.flashAttention).toBe(true);
  });

  it('upsert updates an existing row in place (PK is model_id)', () => {
    repo.upsert(modelId, { ...ALL_NULL, nCtx: 4096, nGpuLayers: 0 });
    const updated = repo.upsert(modelId, { ...ALL_NULL, nCtx: 8192, nGpuLayers: 35 });
    expect(updated.nCtx).toBe(8192);
    expect(updated.nGpuLayers).toBe(35);

    const count = ctx.raw.exec(
      'SELECT COUNT(*) FROM local_model_advanced_params WHERE model_id = ?',
      [modelId],
    )[0]?.values[0]?.[0];
    expect(count).toBe(1);
  });

  it('getByModelId returns null for an unknown model', () => {
    expect(repo.getByModelId('does-not-exist')).toBeNull();
  });

  it('getByModelId returns the row when present', () => {
    repo.upsert(modelId, { ...ALL_NULL, nCtx: 4096 });
    expect(repo.getByModelId(modelId)?.nCtx).toBe(4096);
  });

  it('clear removes the row (caller uses this for Reset-to-Auto)', () => {
    repo.upsert(modelId, { ...ALL_NULL, nCtx: 4096, nGpuLayers: 35 });
    repo.clear(modelId);
    expect(repo.getByModelId(modelId)).toBeNull();
  });

  it('clear is a no-op for an unknown model', () => {
    expect(() => repo.clear('does-not-exist')).not.toThrow();
  });

  it('cascade-deletes when the parent model row is removed', () => {
    repo.upsert(modelId, { ...ALL_NULL, nCtx: 4096 });
    ctx.raw.run('DELETE FROM local_models WHERE id = ?', [modelId]);
    expect(repo.getByModelId(modelId)).toBeNull();
  });

  it('rejects an mmap value outside {0, 1, NULL}', () => {
    expect(() =>
      ctx.raw.run(
        'INSERT INTO local_model_advanced_params (model_id, mmap, updated_at) VALUES (?, 2, ?)',
        [modelId, Date.now()],
      ),
    ).toThrow();
  });

  it('upsert throws a greppable error if the row vanishes between write and read-back', () => {
    // The only way getByModelId can come back empty immediately after a
    // successful upsert is a DB-layer fault. The defensive guard turns that
    // silent corruption into a loud error instead of returning a bad row.
    // We drive it with a db whose write succeeds but whose read-back is empty.
    const noopRun = { run: () => undefined };
    const fakeDb = {
      insert: () => ({ values: () => ({ onConflictDoUpdate: () => noopRun }) }),
      select: () => ({ from: () => ({ where: () => ({ get: () => undefined }) }) }),
    } as unknown as Parameters<typeof createLocalModelAdvancedParamsRepo>[0];
    const guardedRepo = createLocalModelAdvancedParamsRepo(fakeDb);
    expect(() => guardedRepo.upsert('ghost', ALL_NULL)).toThrow(/not found after upsert/i);
  });
});
