/**
 * BenchmarkService specs — the two `localGguf.benchmark.*` channels.
 *
 * Both were Phase 1 not-implemented stubs.
 *
 * The governing rule for this service is that a benchmark row is a
 * *measurement*. Every number it persists has to come from either the clock or
 * the server's own `timings` block. Where a figure genuinely cannot be
 * obtained — peak VRAM on a CPU backend, throughput from a server that reports
 * no timings — the service records null or refuses to write the row. It never
 * substitutes a plausible-looking constant, because a fabricated benchmark is
 * worse than no benchmark: it silently poisons every comparison made against
 * it afterwards.
 */

import type { AdvancedParams, GpuBackend, LocalModel } from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';

import type { InsertBenchmarkInput } from '../../db/repos/local-model-benchmarks.js';

import {
  BenchmarkServiceError,
  DEFAULT_BENCHMARK_PROMPT,
  createBenchmarkService,
} from './benchmark-service.js';

/**
 * `RequestInit` / `ResponseInit` are type-only DOM lib identifiers, not runtime
 * globals, so eslint's `no-undef` flags them by name even though TypeScript
 * resolves them fine. Deriving the same types from `fetch` and `Response`
 * avoids the bare identifiers without loosening the repo's lint config.
 */
type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeModel(overrides: Partial<LocalModel> = {}): LocalModel {
  return {
    id: 'model-1',
    displayName: 'Test 7B',
    sourceType: 'file',
    sourcePath: 'D:/models/test-7b.Q4_K_M.gguf',
    endpointId: null,
    ggufArch: 'llama',
    ggufParamsB: 7,
    ggufQuant: 'Q4_K_M',
    ggufContextMax: 8192,
    ggufSizeBytes: 4_500_000_000,
    ggufSha256: null,
    ggufChatTemplate: null,
    isEmbeddingModel: false,
    isToolCapable: false,
    hfRepoId: null,
    hfFilename: null,
    license: null,
    chatTemplateOverride: null,
    systemPromptOverride: null,
    status: 'cold',
    statusDetail: null,
    lastUsedAt: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const TIMINGS = {
  prompt_n: 96,
  prompt_ms: 118.4,
  prompt_per_second: 810.8,
  predicted_n: 64,
  predicted_ms: 1_358.2,
  predicted_per_second: 47.12,
};

/** llama-server's `/completion` stream: `data: {json}` records, blank-line separated. */
function sseStream(records: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= records.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(records[i])}\n\n`));
      i += 1;
    },
  });
}

/**
 * `timings: null` models a server build that streams no timings block.
 * Note it must be an explicit null — passing `undefined` would trigger the
 * default parameter and quietly restore TIMINGS, making the refusal test
 * assert nothing.
 */
function completionRecords(tokens = 3, timings: unknown = TIMINGS): unknown[] {
  const records: unknown[] = [];
  for (let i = 0; i < tokens; i++) records.push({ content: ` tok${i}`, stop: false });
  records.push(
    timings === null ? { content: '', stop: true } : { content: '', stop: true, timings },
  );
  return records;
}

/** Monotonic clock: every read advances by `stepMs`, so latencies are exact. */
function makeClock(stepMs = 10) {
  let t = 0;
  return () => {
    const current = t;
    t += stepMs;
    return current;
  };
}

interface BuildOpts {
  model?: LocalModel | null;
  records?: unknown[];
  propsBody?: unknown;
  propsStatus?: number;
  completionStatus?: number;
  backend?: GpuBackend;
  tuning?: { nCtx: number; nGpuLayers: number } | null;
  vramSamples?: Array<number | null>;
  loadError?: Error;
  now?: () => number;
}

function build(opts: BuildOpts = {}) {
  const model = opts.model === undefined ? makeModel() : opts.model;
  const rows: InsertBenchmarkInput[] = [];

  const benchmarks = {
    insert: vi.fn((input: InsertBenchmarkInput) => {
      rows.push(input);
      return { id: `bench-${rows.length}`, ranAt: input.ranAt ?? 0, ...input };
    }),
    listByModel: vi.fn(() => []),
  };

  const pool = {
    load: opts.loadError
      ? vi.fn().mockRejectedValue(opts.loadError)
      : vi.fn().mockResolvedValue({
          modelId: 'model-1',
          baseUrl: 'http://127.0.0.1:50007',
          pid: 4242,
        }),
    lastTuningFor: vi.fn(() =>
      opts.tuning === undefined ? { nCtx: 4096, nGpuLayers: 33 } : opts.tuning,
    ),
  };

  const runtime = {
    getSettings: vi.fn().mockResolvedValue({ activeBackend: opts.backend ?? 'cuda' }),
  };

  const calls: Array<{ url: string; init?: FetchInit }> = [];
  const fetchFn = vi.fn(async (input: unknown, init?: FetchInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/props')) {
      return new Response(
        JSON.stringify(opts.propsBody ?? { default_generation_settings: { n_ctx: 4096 } }),
        {
          status: opts.propsStatus ?? 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    }
    if (opts.completionStatus && opts.completionStatus !== 200) {
      return new Response('boom', { status: opts.completionStatus });
    }
    return new Response(sseStream(opts.records ?? completionRecords()), { status: 200 });
  });

  let sampleIndex = 0;
  const samples = opts.vramSamples;
  const sampleVramMb = samples
    ? vi.fn(async () => samples[Math.min(sampleIndex++, samples.length - 1)] ?? null)
    : undefined;

  const service = createBenchmarkService({
    pool,
    models: { getById: vi.fn(() => model) },
    benchmarks,
    runtime,
    fetchFn: fetchFn as unknown as typeof fetch,
    now: opts.now ?? makeClock(),
    sampleVramMb,
    vramSampleIntervalMs: 0,
  });

  return { service, benchmarks, pool, runtime, calls, rows, fetchFn, sampleVramMb };
}

// ===========================================================================

describe('BenchmarkService — run', () => {
  it('loads the model through the pool before measuring it', async () => {
    const { service, pool } = build();
    await service.run('model-1');
    expect(pool.load).toHaveBeenCalledWith('model-1');
  });

  it('drives a completion against the loaded server with the standard prompt', async () => {
    const { service, calls } = build();
    await service.run('model-1');

    const completion = calls.find((c) => c.url.endsWith('/completion'));
    expect(completion?.url).toBe('http://127.0.0.1:50007/completion');
    const body = JSON.parse(String(completion?.init?.body));
    expect(body.prompt).toBe(DEFAULT_BENCHMARK_PROMPT);
    expect(body.stream).toBe(true);
    // A cached prefill would make prompt-eval throughput meaningless.
    expect(body.cache_prompt).toBe(false);
  });

  it('records throughput from the server’s own timings block', async () => {
    const { service, rows } = build();
    const result = await service.run('model-1');

    expect(rows[0]?.promptEvalTokS).toBeCloseTo(810.8, 5);
    expect(rows[0]?.genTokS).toBeCloseTo(47.12, 5);
    expect(result.promptEvalTokS).toBeCloseTo(810.8, 5);
  });

  it('measures time-to-first-token from the clock, not from the timings block', async () => {
    // Reads: start, then one per streamed record. With a 10 ms step the first
    // token lands on the second read.
    const { service, rows } = build({ now: makeClock(10) });
    await service.run('model-1');
    expect(rows[0]?.ttftMs).toBe(10);
  });

  it('keeps the baseline VRAM sample out of time-to-first-token', async () => {
    // In production the sampler spawns nvidia-smi (100–500 ms). Taking the
    // baseline sample inside the timed window charged that spawn to TTFT.
    let t = 0;
    const SAMPLER_MS = 400;
    const REQUEST_MS = 50;
    const service = createBenchmarkService({
      pool: {
        load: async () => ({ modelId: 'model-1', baseUrl: 'http://127.0.0.1:1', pid: 1 }),
        lastTuningFor: () => ({ nCtx: 4096, nGpuLayers: 33 }),
      },
      models: { getById: () => makeModel() },
      benchmarks: {
        insert: (i) => ({ id: 'b', ...i, ranAt: i.ranAt ?? 0 }),
        listByModel: () => [],
      },
      runtime: { getSettings: async () => ({ activeBackend: 'cuda' as GpuBackend }) },
      fetchFn: (async (input: unknown) => {
        if (String(input).endsWith('/props')) return new Response('{}', { status: 200 });
        t += REQUEST_MS;
        return new Response(sseStream(completionRecords()), { status: 200 });
      }) as unknown as typeof fetch,
      now: () => t,
      sampleVramMb: async () => {
        t += SAMPLER_MS;
        return 4_000;
      },
      vramSampleIntervalMs: 0,
    });

    const result = await service.run('model-1');

    expect(result.ttftMs).toBe(REQUEST_MS);
    // The baseline sample still counts toward the peak.
    expect(result.vramPeakMb).toBe(4_000);
  });

  it('persists the active backend alongside the numbers', async () => {
    const { service, rows } = build({ backend: 'vulkan' });
    await service.run('model-1');
    expect(rows[0]?.backend).toBe('vulkan');
  });

  it('records the context and GPU layers the server was actually started with', async () => {
    const { service, rows } = build({
      tuning: { nCtx: 2048, nGpuLayers: 12 },
      propsBody: { default_generation_settings: { n_ctx: 2048 } },
    });
    await service.run('model-1');
    expect(rows[0]).toMatchObject({ nCtxUsed: 2048, nGpuLayersUsed: 12 });
  });

  it('prefers the context the server reports over the value requested', async () => {
    // llama-server clamps n_ctx to what the model and VRAM allow. The clamped
    // figure is what the run actually used.
    const { service, rows } = build({
      tuning: { nCtx: 8192, nGpuLayers: 33 },
      propsBody: { default_generation_settings: { n_ctx: 4096 } },
    });
    await service.run('model-1');
    expect(rows[0]?.nCtxUsed).toBe(4096);
  });

  it('falls back to the requested context when /props is unavailable', async () => {
    const { service, rows } = build({ propsStatus: 404, tuning: { nCtx: 8192, nGpuLayers: 33 } });
    await service.run('model-1');
    expect(rows[0]?.nCtxUsed).toBe(8192);
  });

  it('returns the stored row so the caller sees the persisted id', async () => {
    const { service } = build();
    const result = await service.run('model-1');
    expect(result.id).toBe('bench-1');
    expect(result.modelId).toBe('model-1');
  });
});

describe('BenchmarkService — VRAM sampling', () => {
  it('records the peak of the samples taken during the run', async () => {
    const { service, rows } = build({ vramSamples: [3_000, 5_312, 4_100] });
    await service.run('model-1');
    expect(rows[0]?.vramPeakMb).toBe(5_312);
  });

  it('records null when no sampler is available rather than claiming zero', async () => {
    const { service, rows } = build();
    await service.run('model-1');
    expect(rows[0]?.vramPeakMb).toBeNull();
  });

  it('records null when every sample comes back unknown', async () => {
    // An lspci-only Linux probe knows the device but not its memory.
    const { service, rows } = build({ vramSamples: [null, null] });
    await service.run('model-1');
    expect(rows[0]?.vramPeakMb).toBeNull();
  });

  it('does not fail the benchmark when the sampler throws', async () => {
    const { service, rows } = build();
    const throwing = createBenchmarkService({
      pool: {
        load: async () => ({ modelId: 'model-1', baseUrl: 'http://127.0.0.1:1', pid: 1 }),
        lastTuningFor: () => ({ nCtx: 4096, nGpuLayers: 33 }),
      },
      models: { getById: () => makeModel() },
      benchmarks: {
        insert: (i) => ({ id: 'b', ...i, ranAt: i.ranAt ?? 0 }),
        listByModel: () => [],
      },
      runtime: { getSettings: async () => ({ activeBackend: 'cuda' as GpuBackend }) },
      fetchFn: (async (input: unknown) =>
        String(input).endsWith('/props')
          ? new Response('{}', { status: 200 })
          : new Response(sseStream(completionRecords()), {
              status: 200,
            })) as unknown as typeof fetch,
      now: makeClock(),
      sampleVramMb: async () => {
        throw new Error('nvidia-smi not found');
      },
      vramSampleIntervalMs: 0,
    });

    await expect(throwing.run('model-1')).resolves.toMatchObject({ vramPeakMb: null });
    void rows;
    void service;
  });
});

describe('BenchmarkService — refusals', () => {
  it('refuses a model that is not in the library', async () => {
    const { service } = build({ model: null });
    await expect(service.run('ghost')).rejects.toBeInstanceOf(BenchmarkServiceError);
  });

  it('refuses a remote endpoint model, which has no local server to measure', async () => {
    const { service, benchmarks } = build({
      model: makeModel({ sourceType: 'remote-endpoint', sourcePath: null, endpointId: 'ep-1' }),
    });
    await expect(service.run('model-1')).rejects.toThrow(/remote/i);
    expect(benchmarks.insert).not.toHaveBeenCalled();
  });

  it('refuses to record a row when the server reports no timings', async () => {
    // Prompt-eval throughput cannot be derived client-side: we never see the
    // prompt token count or the prefill duration separately. Writing a zero
    // would poison every later comparison, so the run fails instead.
    const { service, benchmarks } = build({ records: completionRecords(3, null) });

    await expect(service.run('model-1')).rejects.toThrow(/timings/i);
    expect(benchmarks.insert).not.toHaveBeenCalled();
  });

  it('propagates a pool load failure instead of writing an empty result', async () => {
    const { service, benchmarks } = build({ loadError: new Error('oom-predicted') });
    await expect(service.run('model-1')).rejects.toThrow(/oom-predicted/);
    expect(benchmarks.insert).not.toHaveBeenCalled();
  });

  it('reports an HTTP failure from the completion endpoint', async () => {
    const { service, benchmarks } = build({ completionStatus: 500 });
    await expect(service.run('model-1')).rejects.toThrow(/500/);
    expect(benchmarks.insert).not.toHaveBeenCalled();
  });
});

describe('BenchmarkService — history', () => {
  it('returns the stored runs for a model', async () => {
    const { service, benchmarks } = build();
    benchmarks.listByModel.mockReturnValue([{ id: 'b1' }, { id: 'b2' }] as unknown as ReturnType<
      typeof benchmarks.listByModel
    >);

    await expect(service.history('model-1')).resolves.toEqual([{ id: 'b1' }, { id: 'b2' }]);
    expect(benchmarks.listByModel).toHaveBeenCalledWith('model-1');
  });

  it('returns an empty list for a model that has never been benchmarked', async () => {
    const { service } = build();
    await expect(service.history('model-1')).resolves.toEqual([]);
  });

  it('does not require the model to still exist to read its history', async () => {
    // History is read after a model is removed too — the rows cascade away in
    // the DB, but the read itself must not throw on a missing library row.
    const { service } = build({ model: null });
    await expect(service.history('deleted')).resolves.toEqual([]);
  });
});

describe('BenchmarkService — advanced params do not leak into the record', () => {
  it('uses the pool’s applied tuning, not the raw override row', async () => {
    // A null in the override row means "auto"; reading it directly would
    // record null where the server used a real auto-tuned number.
    const advanced: AdvancedParams = {
      modelId: 'model-1',
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
      updatedAt: 0,
    };
    void advanced;

    const { service, rows } = build({ tuning: { nCtx: 4096, nGpuLayers: 33 } });
    await service.run('model-1');

    expect(rows[0]?.nCtxUsed).toBe(4096);
    expect(rows[0]?.nGpuLayersUsed).toBe(33);
  });

  it('refuses to guess when the pool has no applied tuning to report', async () => {
    const { service } = build({ tuning: null, propsStatus: 404 });
    await expect(service.run('model-1')).rejects.toThrow(/tuning/i);
  });
});
