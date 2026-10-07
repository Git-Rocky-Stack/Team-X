import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { createLocalModelBenchmarksRepo } from './local-model-benchmarks.js';

const NANOID = /^[A-Za-z0-9_-]{21}$/;

/** Insert a local_models row so the benchmark FK has something to point at. */
function seedModel(ctx: TestDbHandle, id: string): void {
  const now = Date.now();
  ctx.raw.run(
    `INSERT INTO local_models (id, display_name, source_type, source_path, created_at, updated_at)
     VALUES (?, ?, 'file', ?, ?, ?)`,
    [id, `Model ${id}`, `C:/models/${id}.gguf`, now, now],
  );
}

const SAMPLE = {
  promptEvalTokS: 812.4,
  genTokS: 47.1,
  ttftMs: 214,
  vramPeakMb: 5312,
  backend: 'cuda' as const,
  nCtxUsed: 8192,
  nGpuLayersUsed: 33,
};

describe('localModelBenchmarksRepo', () => {
  let ctx: TestDbHandle;
  let repo: ReturnType<typeof createLocalModelBenchmarksRepo>;

  beforeEach(async () => {
    ctx = await makeTestDb();
    repo = createLocalModelBenchmarksRepo(ctx.db);
    seedModel(ctx, 'm1');
  });

  afterEach(() => {
    ctx.close();
  });

  it('insert + getById round-trips every measured field', () => {
    const created = repo.insert({ modelId: 'm1', ...SAMPLE });

    expect(created.id).toMatch(NANOID);
    expect(created.modelId).toBe('m1');
    expect(created.promptEvalTokS).toBeCloseTo(812.4, 5);
    expect(created.genTokS).toBeCloseTo(47.1, 5);
    expect(created.ttftMs).toBe(214);
    expect(created.vramPeakMb).toBe(5312);
    expect(created.backend).toBe('cuda');
    expect(created.nCtxUsed).toBe(8192);
    expect(created.nGpuLayersUsed).toBe(33);
    expect(created.ranAt).toBeGreaterThan(0);

    expect(repo.getById(created.id)).toEqual(created);
  });

  it('getById returns null for an unknown id', () => {
    expect(repo.getById('nope')).toBeNull();
  });

  it('stores a null vramPeakMb rather than coercing unknown VRAM to zero', () => {
    // A CPU backend, or an lspci-only Linux probe, genuinely cannot report
    // peak VRAM. Zero would read as "measured 0 MB"; null reads as unknown.
    const created = repo.insert({ modelId: 'm1', ...SAMPLE, vramPeakMb: null, backend: 'cpu' });
    expect(created.vramPeakMb).toBeNull();
    expect(repo.getById(created.id)?.vramPeakMb).toBeNull();
  });

  it('listByModel returns that model’s runs newest-first', () => {
    const a = repo.insert({ modelId: 'm1', ...SAMPLE });
    const b = repo.insert({ modelId: 'm1', ...SAMPLE });
    const c = repo.insert({ modelId: 'm1', ...SAMPLE });
    // Force distinct ran_at so the DESC ordering is deterministic.
    ctx.raw.run('UPDATE local_model_benchmarks SET ran_at = ? WHERE id = ?', [1000, a.id]);
    ctx.raw.run('UPDATE local_model_benchmarks SET ran_at = ? WHERE id = ?', [2000, b.id]);
    ctx.raw.run('UPDATE local_model_benchmarks SET ran_at = ? WHERE id = ?', [3000, c.id]);

    expect(repo.listByModel('m1').map((r) => r.id)).toEqual([c.id, b.id, a.id]);
  });

  it('listByModel scopes to the requested model', () => {
    seedModel(ctx, 'm2');
    repo.insert({ modelId: 'm1', ...SAMPLE });
    const other = repo.insert({ modelId: 'm2', ...SAMPLE });

    expect(repo.listByModel('m2').map((r) => r.id)).toEqual([other.id]);
  });

  it('listByModel returns an empty array for a model that has never been benchmarked', () => {
    expect(repo.listByModel('m1')).toEqual([]);
  });

  it('rejects a benchmark for a model that does not exist (FK)', () => {
    expect(() => repo.insert({ modelId: 'ghost', ...SAMPLE })).toThrow();
  });

  it('deleting a model cascades away its benchmark history', () => {
    const created = repo.insert({ modelId: 'm1', ...SAMPLE });
    ctx.raw.run('DELETE FROM local_models WHERE id = ?', ['m1']);
    expect(repo.getById(created.id)).toBeNull();
  });
});
