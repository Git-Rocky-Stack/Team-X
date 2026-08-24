/**
 * Approximate nearest-neighbour index over stored embeddings (IVF).
 *
 * The exact retrieval path in `service.ts` scores every stored chunk on every
 * query — O(N·D). At 10k chunks and 768 dimensions that is ~7.7M multiply-adds
 * per query, and it grows linearly with the corpus.
 *
 * This index groups vectors into clusters with k-means. A query scores the
 * `clusters` centroids, then scans only the vectors inside the `nProbe`
 * closest ones, bringing the cost to roughly O(k·D + (N/k)·nProbe·D).
 *
 * Why IVF and not HNSW: HNSW gives better recall per unit of work, but it is a
 * multi-layer graph with heuristic neighbour selection — several hundred lines
 * whose failure mode is silently degraded recall. IVF is a k-means partition
 * plus a scan, small enough to read in one sitting, and it has a property that
 * makes it safe to reason about: probing every cluster *is* brute force,
 * exactly, so the index is a relaxation of the exact path rather than a
 * different ranking. `ann-index.test.ts` pins that equivalence and measures
 * recall at a realistic `nProbe` against brute-force ground truth.
 *
 * No native dependency, so it runs and is tested under plain Vitest — the
 * constraint that ruled out reinstating sqlite-vec.
 *
 * Everything here works on unit-length copies of the input vectors, which
 * makes cosine similarity a plain dot product. Callers keep their originals;
 * nothing in this module mutates its input.
 */

/** One indexed vector. `id` is opaque — the caller maps it back to a row. */
export interface AnnEntry {
  id: string;
  vector: readonly number[];
}

export interface AnnIndexOptions {
  /**
   * Number of k-means partitions. Defaults to √N, the standard IVF starting
   * point: it balances centroid-scoring cost against cluster size.
   */
  clusters?: number;
  /** k-means refinement passes. Defaults to 10; gains flatten well before it. */
  iterations?: number;
  /**
   * Seed for the k-means initialisation.
   *
   * Not a convenience. Seeding from `Math.random` would make cluster layout —
   * and therefore recall — vary run to run, which makes any recall assertion
   * flaky and makes a recall regression impossible to attribute.
   */
  seed?: number;
}

export interface AnnIndex {
  /** Number of indexed vectors. */
  readonly size: number;
  /** Actual partition count, which is ≤ the requested `clusters`. */
  readonly clusterCount: number;
  /** Vector dimensionality, or 0 for an empty index. */
  readonly dimension: number;
  readonly centroids: readonly (readonly number[])[];
  /** Per cluster, the offsets into `ids` / `vectors` it owns. */
  readonly members: readonly (readonly number[])[];
  readonly ids: readonly string[];
  /** Unit-length copies of the input vectors, flattened row-major. */
  readonly vectors: Float64Array;
}

export interface AnnQueryOptions {
  topK: number;
  threshold: number;
  /** Clusters to scan. Defaults to √clusterCount (min 1). */
  nProbe?: number;
  /**
   * Keep only ids this returns true for. Applied during the scan rather than
   * to the finished list, so `topK` still means "topK results" when the
   * caller is excluding something — filtering after the slice would silently
   * return short whenever an excluded id ranked highly.
   */
  filter?: (id: string) => boolean;
}

export interface AnnHit {
  id: string;
  similarity: number;
}

/** mulberry32 — tiny, fast, and reproducible across platforms. */
function seededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Write a unit-length copy of `vector` into `out` at `offset`.
 *
 * A zero-magnitude vector is left as zeros rather than divided through. That
 * keeps its dot product with everything at exactly 0, which is what
 * `cosineSimilarity` reports for a zero vector — dividing would produce NaN,
 * and NaN sorts unpredictably and would corrupt the whole ranking.
 */
function writeNormalized(vector: readonly number[], out: Float64Array, offset: number): void {
  let sumSquares = 0;
  for (const value of vector) sumSquares += value * value;
  const magnitude = Math.sqrt(sumSquares);
  if (magnitude === 0) return;
  for (let i = 0; i < vector.length; i++) out[offset + i] = (vector[i] as number) / magnitude;
}

/** Dot product of a stored row against a unit-length query. */
function dotRow(vectors: Float64Array, row: number, query: Float64Array, dim: number): number {
  const base = row * dim;
  let sum = 0;
  for (let i = 0; i < dim; i++) sum += (vectors[base + i] as number) * (query[i] as number);
  return sum;
}

export function buildAnnIndex(
  entries: readonly AnnEntry[],
  options: AnnIndexOptions = {},
): AnnIndex {
  const size = entries.length;
  const dimension = size === 0 ? 0 : (entries[0]?.vector.length ?? 0);

  if (size === 0 || dimension === 0) {
    return {
      size: 0,
      clusterCount: 0,
      dimension: 0,
      centroids: [],
      members: [],
      ids: [],
      vectors: new Float64Array(0),
    };
  }

  const ids = entries.map((e) => e.id);
  const vectors = new Float64Array(size * dimension);
  for (let i = 0; i < size; i++) {
    writeNormalized(entries[i]?.vector ?? [], vectors, i * dimension);
  }

  // Never more clusters than vectors: k-means cannot fill them, and empty
  // partitions only add centroid-scoring cost for no pruning benefit.
  const requested = options.clusters ?? Math.max(1, Math.round(Math.sqrt(size)));
  const k = Math.max(1, Math.min(requested, size));
  const iterations = options.iterations ?? 10;
  const rand = seededRandom(options.seed ?? 0x9e3779b9);

  // Initialise centroids on distinct vectors. Duplicated seeds collapse into
  // the same partition and waste a cluster, so draw without replacement.
  const chosen = new Set<number>();
  while (chosen.size < k) chosen.add(Math.floor(rand() * size));
  let centroids = [...chosen].map((row) =>
    Array.from(vectors.slice(row * dimension, row * dimension + dimension)),
  );

  const assignment = new Array<number>(size).fill(0);

  for (let pass = 0; pass < iterations; pass++) {
    let moved = false;
    for (let row = 0; row < size; row++) {
      let best = 0;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (let c = 0; c < centroids.length; c++) {
        let sum = 0;
        const centroid = centroids[c] as number[];
        const base = row * dimension;
        for (let i = 0; i < dimension; i++) {
          sum += (vectors[base + i] as number) * (centroid[i] as number);
        }
        if (sum > bestScore) {
          bestScore = sum;
          best = c;
        }
      }
      if (assignment[row] !== best) moved = true;
      assignment[row] = best;
    }

    // Recompute each centroid as the mean of its members, renormalised so the
    // next pass can keep comparing with a dot product.
    const sums = centroids.map(() => new Float64Array(dimension));
    const counts = new Array<number>(centroids.length).fill(0);
    for (let row = 0; row < size; row++) {
      const c = assignment[row] as number;
      const target = sums[c] as Float64Array;
      const base = row * dimension;
      for (let i = 0; i < dimension; i++) {
        target[i] = (target[i] as number) + (vectors[base + i] as number);
      }
      counts[c] = (counts[c] as number) + 1;
    }

    centroids = centroids.map((previous, c) => {
      // An emptied cluster keeps its previous centroid rather than being
      // reseeded: reseeding mid-run can oscillate and never converge, and an
      // empty cluster costs one dot product at query time and nothing else.
      if ((counts[c] as number) === 0) return previous;
      const mean = Array.from(sums[c] as Float64Array);
      let sumSquares = 0;
      for (const value of mean) sumSquares += value * value;
      const magnitude = Math.sqrt(sumSquares);
      if (magnitude === 0) return previous;
      return mean.map((value) => value / magnitude);
    });

    if (!moved && pass > 0) break;
  }

  const members: number[][] = centroids.map(() => []);
  for (let row = 0; row < size; row++) {
    (members[assignment[row] as number] as number[]).push(row);
  }

  return {
    size,
    clusterCount: centroids.length,
    dimension,
    centroids,
    members,
    ids,
    vectors,
  };
}

export function queryAnnIndex(
  index: AnnIndex,
  query: readonly number[],
  options: AnnQueryOptions,
): AnnHit[] {
  if (index.size === 0 || index.dimension === 0) return [];

  const dim = index.dimension;
  const normalizedQuery = new Float64Array(dim);
  writeNormalized(query, normalizedQuery, 0);

  const nProbe = Math.max(
    1,
    Math.min(
      options.nProbe ?? Math.max(1, Math.round(Math.sqrt(index.clusterCount))),
      index.clusterCount,
    ),
  );

  // Rank centroids, then scan only the closest `nProbe` partitions.
  const centroidScores = index.centroids.map((centroid, c) => {
    let sum = 0;
    for (let i = 0; i < dim; i++) sum += (centroid[i] as number) * (normalizedQuery[i] as number);
    return { cluster: c, score: sum };
  });
  centroidScores.sort((a, b) => b.score - a.score);

  const hits: AnnHit[] = [];
  for (let p = 0; p < nProbe; p++) {
    const cluster = centroidScores[p]?.cluster;
    if (cluster === undefined) break;
    for (const row of index.members[cluster] ?? []) {
      const id = index.ids[row] as string;
      if (options.filter && !options.filter(id)) continue;
      const similarity = dotRow(index.vectors, row, normalizedQuery, dim);
      if (similarity < options.threshold) continue;
      hits.push({ id, similarity });
    }
  }

  hits.sort((a, b) => b.similarity - a.similarity);
  return hits.slice(0, options.topK);
}
