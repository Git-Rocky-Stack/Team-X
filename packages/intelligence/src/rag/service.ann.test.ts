/**
 * RagService ↔ ANN index wiring.
 *
 * `ann-index.test.ts` proves the index ranks correctly in isolation. These
 * tests prove `service.retrieve` actually routes through it — an index nothing
 * calls is just a file that compiles.
 *
 * The load-bearing test is "actually consults the index": with `nProbe: 1`
 * over a deliberately separated corpus, the ANN answer is *different* from the
 * exact answer. A wiring that silently fell back to brute force would return
 * the exact answer and look fine, so equality-only assertions cannot tell the
 * two apart. Difference is the observable that can.
 */

import { describe, expect, it } from 'vitest';

import {
  type RagEmbeddingRow,
  type RagRepo,
  type RagUpsertInput,
  createRagService,
} from './service.js';

const DIM = 8;

function toBuffer(vec: number[]): Buffer {
  return Buffer.from(new Float32Array(vec).buffer);
}

/** Unit vector pointing along `axis`, nudged so members of a group differ. */
function axisVector(axis: number, jitter: number): number[] {
  const v = new Array<number>(DIM).fill(0);
  v[axis] = 1;
  v[(axis + 1) % DIM] = jitter;
  return v;
}

function makeRow(id: string, companyId: string, sourceId: string, vec: number[]): RagEmbeddingRow {
  return {
    id,
    companyId,
    sourceType: 'ticket',
    sourceId,
    chunkIndex: 0,
    contentText: `text-${id}`,
    embedding: toBuffer(vec),
    createdAt: 1,
  };
}

/** In-memory repo; `listByCompany` returns insertion order, as SQLite would. */
function fakeRepo(initial: RagEmbeddingRow[] = []): RagRepo & { rows: RagEmbeddingRow[] } {
  const rows = [...initial];
  return {
    rows,
    upsert(input: RagUpsertInput): string {
      const existing = rows.findIndex(
        (r) => r.sourceId === input.sourceId && r.chunkIndex === input.chunkIndex,
      );
      if (existing >= 0) rows[existing] = input as RagEmbeddingRow;
      else rows.push(input as RagEmbeddingRow);
      return input.id;
    },
    deleteBySource(sourceId: string): number {
      let removed = 0;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i]?.sourceId === sourceId) {
          rows.splice(i, 1);
          removed++;
        }
      }
      return removed;
    },
    listByCompany(companyId: string): RagEmbeddingRow[] {
      return rows.filter((r) => r.companyId === companyId);
    },
  };
}

/** 240 rows spread over 8 well-separated axes. */
function separatedCorpus(companyId: string): RagEmbeddingRow[] {
  return Array.from({ length: 240 }, (_, i) =>
    makeRow(`e${i}`, companyId, `src-${i % 8}`, axisVector(i % DIM, (i % 30) / 100)),
  );
}

const queryFor = (vec: number[]) => async () => [vec];

describe('RagService ANN wiring', () => {
  it('matches the exact path when every cluster is probed', async () => {
    const rows = separatedCorpus('c1');
    const query = axisVector(0, 0.05);

    const exact = await createRagService({
      embedText: queryFor(query),
      dimension: DIM,
      repo: fakeRepo(rows),
      ann: { enabled: false },
    }).retrieve({ companyId: 'c1', query: 'q', topK: 5, threshold: 0 });

    const approx = await createRagService({
      embedText: queryFor(query),
      dimension: DIM,
      repo: fakeRepo(rows),
      ann: { enabled: true, minVectors: 10, clusters: 8, nProbe: 8, seed: 1 },
    }).retrieve({ companyId: 'c1', query: 'q', topK: 5, threshold: 0 });

    expect(approx.map((h) => h.contentText)).toEqual(exact.map((h) => h.contentText));
  });

  it('actually consults the index rather than silently falling back', async () => {
    // nProbe: 1 scans one partition of a 240-vector corpus. k-means does not
    // split it evenly — the largest partition here holds 60 — so asking for
    // 100 guarantees the pruned scan cannot fill the request while the exact
    // scan can. A wiring that quietly fell through to brute force would
    // return all 100 and look correct, which is what this distinguishes.
    const rows = separatedCorpus('c1');
    const query = axisVector(0, 0.05);
    const ask = { companyId: 'c1', query: 'q', topK: 100, threshold: -1 };

    const exact = await createRagService({
      embedText: queryFor(query),
      dimension: DIM,
      repo: fakeRepo(rows),
      ann: { enabled: false },
    }).retrieve(ask);

    const approx = await createRagService({
      embedText: queryFor(query),
      dimension: DIM,
      repo: fakeRepo(rows),
      ann: { enabled: true, minVectors: 10, clusters: 8, nProbe: 1, seed: 1 },
    }).retrieve(ask);

    expect(exact).toHaveLength(100);
    expect(approx.length).toBeLessThan(exact.length);

    // Pruning may miss a true neighbour; it must never invent one. Every
    // approximate hit has to exist in the exact ranking with the same score.
    const exactByText = new Map(exact.map((h) => [h.contentText, h.similarity]));
    for (const hit of approx) {
      expect(exactByText.has(hit.contentText)).toBe(true);
      expect(hit.similarity).toBeCloseTo(exactByText.get(hit.contentText) as number, 5);
    }
  });

  it('stays on the exact path until the corpus passes the floor', async () => {
    // Below the floor the index is not worth its build cost, and behaviour
    // must be byte-identical to today's brute force — including with an
    // nProbe that would otherwise prune hard.
    const rows = separatedCorpus('c1');
    const query = axisVector(0, 0.05);

    const exact = await createRagService({
      embedText: queryFor(query),
      dimension: DIM,
      repo: fakeRepo(rows),
      ann: { enabled: false },
    }).retrieve({ companyId: 'c1', query: 'q', topK: 40, threshold: -1 });

    const belowFloor = await createRagService({
      embedText: queryFor(query),
      dimension: DIM,
      repo: fakeRepo(rows),
      ann: { enabled: true, minVectors: 10_000, clusters: 8, nProbe: 1, seed: 1 },
    }).retrieve({ companyId: 'c1', query: 'q', topK: 40, threshold: -1 });

    expect(belowFloor.map((h) => h.contentText)).toEqual(exact.map((h) => h.contentText));
  });

  it('honours excludeSourceIds without returning short', async () => {
    // The filter runs inside the scan, so excluding a source must not eat
    // slots out of topK.
    const rows = separatedCorpus('c1');
    const query = axisVector(0, 0.05);

    const hits = await createRagService({
      embedText: queryFor(query),
      dimension: DIM,
      repo: fakeRepo(rows),
      ann: { enabled: true, minVectors: 10, clusters: 8, nProbe: 8, seed: 1 },
    }).retrieve({
      companyId: 'c1',
      query: 'q',
      topK: 5,
      threshold: -1,
      excludeSourceIds: ['src-0'],
    });

    expect(hits).toHaveLength(5);
    expect(hits.every((h) => h.sourceId !== 'src-0')).toBe(true);
  });

  it('sees content added after the index was built', async () => {
    // The index is cached per company. Without invalidation on write, the
    // second retrieve would answer from a stale partition and never surface
    // the new chunk — a silent staleness bug, not a crash.
    const repo = fakeRepo(separatedCorpus('c1'));
    const target = axisVector(3, 0.11);
    const service = createRagService({
      embedText: async () => [target],
      dimension: DIM,
      repo,
      ann: { enabled: true, minVectors: 10, clusters: 8, nProbe: 8, seed: 1 },
    });

    await service.retrieve({ companyId: 'c1', query: 'q', topK: 5, threshold: 0 });
    await service.indexSource({
      companyId: 'c1',
      sourceType: 'ticket',
      sourceId: 'brand-new',
      content: 'the newly indexed chunk',
    });

    const after = await service.retrieve({ companyId: 'c1', query: 'q', topK: 5, threshold: 0 });
    expect(after.some((h) => h.sourceId === 'brand-new')).toBe(true);
  });

  it('rebuilds when a re-index changes vectors without changing the row count', async () => {
    // The sharp case for explicit invalidation. `indexSource` deletes a
    // source and re-adds it, so re-indexing a one-chunk source leaves the
    // corpus exactly the same size — the cheap `rowCount` staleness guard
    // sees nothing, and only the explicit `annIndexes.delete` forces a
    // rebuild. Without it the stale layout still holds the deleted row's old
    // id, which no longer resolves, and the re-indexed content is
    // unreachable: wrong answers, no error.
    const rows = separatedCorpus('c1');
    rows.push(makeRow('mut-old', 'c1', 'mut', axisVector(1, 0.02)));
    const repo = fakeRepo(rows);

    const target = axisVector(5, 0.42);
    let embedding = axisVector(1, 0.02);
    const service = createRagService({
      embedText: async () => [embedding],
      dimension: DIM,
      repo,
      idGen: () => 'mut-new',
      ann: { enabled: true, minVectors: 10, clusters: 8, nProbe: 2, seed: 1 },
    });

    // Build the index while `mut` still points along axis 1.
    await service.retrieve({ companyId: 'c1', query: 'q', topK: 5, threshold: 0 });
    const countBefore = repo.rows.length;

    // Re-index `mut` so it points along axis 5 instead. One chunk out, one in.
    embedding = target;
    await service.indexSource({
      companyId: 'c1',
      sourceType: 'ticket',
      sourceId: 'mut',
      content: 'one chunk of replacement content',
    });
    expect(repo.rows.length).toBe(countBefore);

    const after = await service.retrieve({
      companyId: 'c1',
      query: 'q',
      topK: 5,
      threshold: 0.9,
    });
    expect(after.some((h) => h.sourceId === 'mut')).toBe(true);
  });

  it('stops returning content that was deleted after the index was built', async () => {
    const repo = fakeRepo(separatedCorpus('c1'));
    const query = axisVector(0, 0.0);
    const service = createRagService({
      embedText: queryFor(query),
      dimension: DIM,
      repo,
      ann: { enabled: true, minVectors: 10, clusters: 8, nProbe: 8, seed: 1 },
    });

    const before = await service.retrieve({
      companyId: 'c1',
      query: 'q',
      topK: 40,
      threshold: -1,
    });
    expect(before.some((h) => h.sourceId === 'src-0')).toBe(true);

    service.deleteBySource('src-0');

    const after = await service.retrieve({ companyId: 'c1', query: 'q', topK: 40, threshold: -1 });
    expect(after.some((h) => h.sourceId === 'src-0')).toBe(false);
  });
});
