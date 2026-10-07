/**
 * BenchmarkService — Electron-main orchestrator for local model throughput
 * measurement (v3.3.0 Local & Networked GGUF Support, spec § 7 / § 13).
 *
 * Backs the two `localGguf.benchmark.*` channels, which shipped in Phase 1 as
 * not-implemented stubs. A run loads the model through the LRU pool, drives one
 * fixed completion against the resulting llama-server, and records what it
 * measured.
 *
 * House style mirrors the sibling local-gguf services: a pure factory returning
 * an object of methods, with every I/O dependency injectable.
 *
 * ## Every number is measured, or it is not written
 *
 * A benchmark row outlives the run that produced it and becomes the baseline
 * every later comparison is made against. A fabricated figure there does not
 * announce itself — it quietly makes "this quant is 12% faster" wrong forever.
 * So:
 *
 *   • Throughput comes from llama-server's own `timings` block. That block is
 *     the only place the prompt token count and the prefill duration are
 *     reported separately, so prompt-eval throughput cannot be derived
 *     client-side at all. A server that reports no timings fails the run
 *     rather than getting a zero written on its behalf.
 *   • Time-to-first-token is wall-clock, measured from just before the request
 *     to the first streamed token. `timings.prompt_ms` is close but excludes
 *     queueing and transport, which the user experiences.
 *   • `nCtxUsed` prefers what the server reports at `/props`, because
 *     llama-server clamps the requested context to what the model and VRAM
 *     allow. The requested value is the fallback, and the requested value is
 *     the pool's *applied* tuning — never the raw advanced-params row, whose
 *     nulls mean "auto" rather than a number.
 *   • `vramPeakMb` is null when there is no sampler or every sample is
 *     unknown. Null reads as "not measured"; zero would claim a measurement.
 */

import type {
  BenchmarkResult,
  GpuBackend,
  LocalGgufRuntimeSettings,
  LocalModel,
} from '@team-x/shared-types';

import type { InsertBenchmarkInput } from '../../db/repos/local-model-benchmarks.js';

import type { AppliedTuning } from './pool-service.js';

/**
 * The standard benchmark prompt.
 *
 * Fixed on purpose: throughput is only comparable across runs if the prefill
 * is identical. It is long enough (~90 tokens for most tokenizers) that
 * prompt-eval throughput is a real measurement rather than rounding noise, and
 * it asks for open-ended prose so generation does not stop early.
 */
export const DEFAULT_BENCHMARK_PROMPT =
  'You are a systems engineer writing release notes. Summarise, in careful and ' +
  'complete prose, how a local inference server allocates GPU memory across ' +
  'model weights, the key-value cache, and activation buffers, and explain how ' +
  'each of those scales with context length, batch size, and quantization ' +
  'format. Cover the trade-offs an operator faces when the model does not fit ' +
  'entirely in VRAM, and describe what changes when layers are offloaded to ' +
  'system RAM. Begin your answer now.';

/** Tokens to generate per run. Enough for a stable rate, short enough to be quick. */
const DEFAULT_N_PREDICT = 128;

/** Default gap between VRAM samples, so sampling never dominates the run. */
const DEFAULT_VRAM_SAMPLE_INTERVAL_MS = 250;

/** Budget for one benchmark run, including model load. */
const DEFAULT_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// Narrowed structural dependency slices
// ---------------------------------------------------------------------------

/** The slice of {@link PoolService} a benchmark consumes. */
export interface BenchmarkPool {
  load(modelId: string): Promise<{ modelId: string; baseUrl: string; pid: number }>;
  lastTuningFor(modelId: string): AppliedTuning | null;
}

/** The slice of the local-models repo a benchmark consumes. */
export interface BenchmarkModelsRepo {
  getById(id: string): LocalModel | null;
}

/** The slice of the benchmarks repo a benchmark consumes. */
export interface BenchmarkRepo {
  insert(input: InsertBenchmarkInput): BenchmarkResult;
  listByModel(modelId: string): BenchmarkResult[];
}

/** The slice of {@link RuntimeService} a benchmark consumes. */
export interface BenchmarkRuntime {
  getSettings(): Promise<Pick<LocalGgufRuntimeSettings, 'activeBackend'>>;
}

export interface BenchmarkServiceDeps {
  pool: BenchmarkPool;
  models: BenchmarkModelsRepo;
  benchmarks: BenchmarkRepo;
  runtime: BenchmarkRuntime;
  /** HTTP client; defaults to global `fetch`. */
  fetchFn?: typeof fetch;
  /** Clock for TTFT and sample throttling; defaults to `Date.now`. */
  now?: () => number;
  /**
   * Reads current GPU memory use in MB, or null when the active backend
   * cannot report it (CPU, or a Linux box probed only via lspci).
   */
  sampleVramMb?: () => Promise<number | null>;
  /** Minimum gap between VRAM samples; defaults to {@link DEFAULT_VRAM_SAMPLE_INTERVAL_MS}. */
  vramSampleIntervalMs?: number;
  prompt?: string;
  nPredict?: number;
  timeoutMs?: number;
}

export interface BenchmarkService {
  run(modelId: string): Promise<BenchmarkResult>;
  history(modelId: string): Promise<BenchmarkResult[]>;
}

/** Raised for every refusal, so the IPC layer can distinguish it from a crash. */
export class BenchmarkServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BenchmarkServiceError';
  }
}

/** llama-server's per-request `timings` block. */
interface LlamaTimings {
  prompt_per_second?: number;
  predicted_per_second?: number;
}

/**
 * Incrementally parse llama-server's `data: {json}` stream.
 *
 * Chunk boundaries fall wherever the socket decides, so a record can arrive
 * split across two reads. The parser keeps a buffer and only emits complete
 * records.
 */
export function createSseParser(): (text: string) => Record<string, unknown>[] {
  let buffer = '';
  return (text: string) => {
    buffer += text;
    const records: Record<string, unknown>[] = [];
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of frame.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload.length === 0 || payload === '[DONE]') continue;
        try {
          records.push(JSON.parse(payload) as Record<string, unknown>);
        } catch {
          // A malformed frame is the server's problem, not a reason to abort a
          // run that may still produce a valid terminal record.
        }
      }
      boundary = buffer.indexOf('\n\n');
    }
    return records;
  };
}

// ---------------------------------------------------------------------------

export function createBenchmarkService(deps: BenchmarkServiceDeps): BenchmarkService {
  const fetchFn = deps.fetchFn ?? globalThis.fetch;
  const now = deps.now ?? Date.now;
  const prompt = deps.prompt ?? DEFAULT_BENCHMARK_PROMPT;
  const nPredict = deps.nPredict ?? DEFAULT_N_PREDICT;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sampleIntervalMs = deps.vramSampleIntervalMs ?? DEFAULT_VRAM_SAMPLE_INTERVAL_MS;

  /**
   * Ask the server what context it actually settled on.
   *
   * Best effort: an older build without `/props`, or a transient failure,
   * simply means the caller uses the requested figure instead.
   */
  async function reportedContext(baseUrl: string): Promise<number | null> {
    try {
      const response = await fetchFn(`${baseUrl}/props`, { method: 'GET' });
      if (!response.ok) return null;
      const props = (await response.json()) as {
        default_generation_settings?: { n_ctx?: unknown };
      };
      const nCtx = props.default_generation_settings?.n_ctx;
      return typeof nCtx === 'number' && nCtx > 0 ? nCtx : null;
    } catch {
      return null;
    }
  }

  async function run(modelId: string): Promise<BenchmarkResult> {
    const model = deps.models.getById(modelId);
    if (!model) {
      throw new BenchmarkServiceError(`Model ${modelId} is not in the library.`);
    }
    if (model.sourceType === 'remote-endpoint') {
      throw new BenchmarkServiceError(
        `Model ${modelId} is served by a remote endpoint. Benchmarks measure a local llama-server this app started — backend, context and VRAM are not ours to report for someone else’s machine.`,
      );
    }

    const ranAt = now();
    const loaded = await deps.pool.load(modelId);

    const tuning = deps.pool.lastTuningFor(modelId);
    const serverContext = await reportedContext(loaded.baseUrl);
    if (serverContext === null && tuning === null) {
      throw new BenchmarkServiceError(
        `Cannot determine the context used for ${modelId}: the server reported no /props and the pool has no applied tuning recorded.`,
      );
    }
    if (tuning === null) {
      throw new BenchmarkServiceError(
        `Cannot determine the GPU layers used for ${modelId}: the pool has no applied tuning recorded for it.`,
      );
    }

    // --- VRAM sampling ----------------------------------------------------
    // Sampled inline as tokens stream rather than on a timer: it covers the
    // whole generation, needs no interval bookkeeping, and stays deterministic.
    let vramPeakMb: number | null = null;
    let lastSampleAt = Number.NEGATIVE_INFINITY;
    const sampleVram = async (at: number): Promise<void> => {
      if (!deps.sampleVramMb) return;
      if (at - lastSampleAt < sampleIntervalMs) return;
      lastSampleAt = at;
      try {
        const mb = await deps.sampleVramMb();
        if (mb !== null && (vramPeakMb === null || mb > vramPeakMb)) vramPeakMb = mb;
      } catch (err) {
        // Sampling is instrumentation. Losing it costs one nullable column;
        // failing the run would cost the whole measurement.
        console.warn('[benchmark-service] VRAM sampling failed', err);
      }
    };

    // --- drive the completion --------------------------------------------
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = now();
    let ttftMs: number | null = null;
    let timings: LlamaTimings | null = null;

    try {
      await sampleVram(startedAt);

      const response = await fetchFn(`${loaded.baseUrl}/completion`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt,
          n_predict: nPredict,
          stream: true,
          // A cached prefill would make prompt-eval throughput meaningless —
          // the second run of any model would look impossibly fast.
          cache_prompt: false,
          temperature: 0,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new BenchmarkServiceError(
          `Benchmark completion failed for ${modelId}: HTTP ${response.status}.`,
        );
      }

      const parse = createSseParser();
      const decoder = new TextDecoder();
      const reader = response.body?.getReader();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const at = now();
          for (const record of parse(decoder.decode(value, { stream: true }))) {
            if (
              ttftMs === null &&
              typeof record.content === 'string' &&
              record.content.length > 0
            ) {
              ttftMs = at - startedAt;
            }
            if (record.timings && typeof record.timings === 'object') {
              timings = record.timings as LlamaTimings;
            }
          }
          await sampleVram(at);
        }
      }
    } finally {
      clearTimeout(timer);
    }

    const promptEvalTokS = timings?.prompt_per_second;
    const genTokS = timings?.predicted_per_second;
    if (typeof promptEvalTokS !== 'number' || typeof genTokS !== 'number') {
      throw new BenchmarkServiceError(
        `llama-server returned no timings for ${modelId}, so throughput cannot be measured. Refusing to record a benchmark rather than store an invented figure.`,
      );
    }

    const settings = await deps.runtime.getSettings();

    return deps.benchmarks.insert({
      modelId,
      promptEvalTokS,
      genTokS,
      // No token ever arrived (an empty generation) — the wall time to the end
      // of the stream is then the closest honest figure for first output.
      ttftMs: Math.round(ttftMs ?? now() - startedAt),
      vramPeakMb,
      backend: settings.activeBackend as GpuBackend,
      nCtxUsed: serverContext ?? tuning.nCtx,
      nGpuLayersUsed: tuning.nGpuLayers,
      ranAt,
    });
  }

  async function history(modelId: string): Promise<BenchmarkResult[]> {
    // Deliberately does not check the library: history is read for models the
    // user is in the middle of removing, and a missing row is not an error.
    return deps.benchmarks.listByModel(modelId);
  }

  return { run, history };
}
