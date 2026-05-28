# Phase 10 — Benchmark Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
>
> **Cross-phase rules:** See master plan § "Cross-phase rules" (CR-1 through CR-10).
>
> **Codex Stage 3 review:** NOT MANDATORY (internal computation; no new subprocess/HTTP/path).

**Goal:** Ship the per-model benchmark runner: a canned 200-token prompt × 3 runs producing `prompt-eval tok/s`, `gen tok/s`, `TTFT`, `VRAM peak`, persisted per model. Library card displays the most recent result. The Phase 1 stub for `local-model-benchmarks` repo (table exists, repo stub-only) is filled in. `localGguf.benchmark.*` IPC stubs replaced.

**Architecture:** `BenchmarkService` (main process) takes a `modelId`, acquires the model from the pool (auto-loading if needed), sends a fixed canned prompt three times via the chat adapter, measures wall-clock + token counts + observed VRAM (`getAvailableVramMb()` delta if backend supports it), persists results.

**Spec coverage:** Implements spec § 4.1.13 (per-model benchmark runner), § 10.5 (benchmark panel UI), § 19 acceptance criterion #5 (concurrency pool eviction visible — verified via benchmark E2E).

**Estimated PR size:** ~1,200 LOC production + ~1,500 LOC tests. Single PR.

---

## Files this phase touches

### New files

```
packages/local-gguf-runtime/src/benchmark/
├── runner.ts                                       (orchestrates 3-run benchmark)
├── runner.test.ts
├── prompt.ts                                       (canned prompt + expected token count)
└── prompt.test.ts

apps/desktop/src/main/db/repos/
├── local-model-benchmarks.ts                       (CRUD — table from Phase 1 migration)
└── local-model-benchmarks.test.ts

apps/desktop/src/main/services/local-gguf/
├── benchmark-service.ts
└── benchmark-service.test.ts

apps/desktop/src/renderer/src/features/local-gguf/
├── benchmark-panel.tsx                             (modal triggered by ModelCard Benchmark button)
└── benchmark-panel.test.tsx
```

### Modified files

```
apps/desktop/src/main/ipc/local-gguf-benchmark-handlers.ts (replace stubs)
apps/desktop/src/main/ipc/local-gguf-benchmark-handlers.test.ts
apps/desktop/src/main/index.ts                      (wire BenchmarkService)
apps/desktop/src/main/db/client.ts                  (register the new repo)
apps/desktop/src/renderer/src/features/local-gguf/model-card.tsx (wire Benchmark button → BenchmarkPanel)
CHANGELOG.md
```

---

## Tasks

### Task 1: Branch + sync

```bash
git checkout main && git pull --ff-only
git checkout -b feat/v3.3.0-phase-10-benchmark
```

---

### Task 2: Canned prompt (deterministic, version-stable)

**Files:**
- Create: `packages/local-gguf-runtime/src/benchmark/prompt.ts` + test

A fixed prompt and target token count. Same across all benchmarks so results are comparable.

- [ ] **Step 1: Define.**

```ts
// packages/local-gguf-runtime/src/benchmark/prompt.ts
//
// Canned benchmark prompt — kept stable across Team-X versions so
// benchmarks recorded today are comparable to those next year.
// Version-bump only if the prompt is found to bias one arch.

export const BENCHMARK_PROMPT_VERSION = 1;

export const BENCHMARK_PROMPT = `Summarize this fictional product brief in one paragraph (3-5 sentences):

The Orion-7 is a compact desktop espresso machine designed for home use. It features a single boiler, 58mm portafilter, and PID temperature control. Its key innovation is a magnetic group-head insert that lets users swap between pressurized and non-pressurized baskets without tools. The target market is enthusiasts who want commercial-grade pressure profiling at a residential price point, around $1,200 USD. Marketing emphasizes the magnetic insert as the differentiator versus the Breville Bambino Plus and Rancilio Silvia.`;

export const BENCHMARK_TARGET_GEN_TOKENS = 200;
```

- [ ] **Step 2: Test (assertions on stability — length, version, ASCII-only).**

- [ ] **Step 3: Commit.**

```
feat(local-gguf): canned benchmark prompt (v1) — stable across versions
```

---

### Task 3: Benchmark runner (TDD with mocked adapter)

**Files:**
- Create: `packages/local-gguf-runtime/src/benchmark/runner.ts` + test

Runs the prompt 3 times against a mocked chat adapter. Measures TTFT (time-to-first-token), prompt-eval rate (tokens-in / time-to-first-token), gen rate (tokens-out / total-gen-time), and reports the median across 3 runs.

- [ ] **Step 1: TDD test.**

```ts
// runner.test.ts
import { describe, expect, it, vi } from 'vitest';
import { runBenchmark, type BenchmarkRunInput } from './runner';

describe('runBenchmark', () => {
  it('measures TTFT + prompt-eval tok/s + gen tok/s across 3 runs', async () => {
    let runIndex = 0;
    const adapter = {
      async *streamChat(opts) {
        runIndex++;
        // First chunk after 100ms (TTFT)
        await new Promise((r) => setTimeout(r, 100));
        yield { kind: 'token', text: 'a' };
        // Then 199 more tokens at 50ms each = 50ms / token = 20 tok/s
        for (let i = 0; i < 199; i++) {
          await new Promise((r) => setTimeout(r, 5));
          yield { kind: 'token', text: 'a' };
        }
        yield { kind: 'done', usage: { prompt_tokens: 100, completion_tokens: 200 } };
      },
    };

    const result = await runBenchmark({
      adapter: adapter as never,
      modelId: 'm1',
      runs: 3,
      backend: 'cuda',
      nCtxUsed: 4096,
      nGpuLayersUsed: 35,
      vramSampler: async () => 9000,
    } as BenchmarkRunInput);

    expect(result.ttftMs).toBeGreaterThan(50);
    expect(result.ttftMs).toBeLessThan(200);
    expect(result.genTokS).toBeGreaterThan(0);
    expect(result.promptEvalTokS).toBeGreaterThan(0);
    expect(result.backend).toBe('cuda');
    expect(result.nCtxUsed).toBe(4096);
  });

  it('takes the median across runs (resilient to outliers)', async () => {
    const adapter = {
      async *streamChat() {
        await new Promise((r) => setTimeout(r, 50));
        yield { kind: 'token', text: 'a' };
        yield { kind: 'done', usage: { prompt_tokens: 10, completion_tokens: 1 } };
      },
    };
    const result = await runBenchmark({
      adapter: adapter as never, modelId: 'm', runs: 3, backend: 'cpu',
      nCtxUsed: 2048, nGpuLayersUsed: 0, vramSampler: async () => 0,
    } as BenchmarkRunInput);
    expect(result.ttftMs).toBeGreaterThan(0);
  });

  it('vramSampler captures peak across all runs', async () => {
    let sampleIdx = 0;
    const samples = [4000, 8000, 5000]; // peak should be 8000
    const adapter = {
      async *streamChat() {
        sampleIdx++;
        yield { kind: 'token', text: 'a' };
        yield { kind: 'done', usage: { prompt_tokens: 1, completion_tokens: 1 } };
      },
    };
    const result = await runBenchmark({
      adapter: adapter as never, modelId: 'm', runs: 3, backend: 'cuda',
      nCtxUsed: 2048, nGpuLayersUsed: 35,
      vramSampler: async () => samples[Math.min(sampleIdx, samples.length - 1)],
    } as BenchmarkRunInput);
    expect(result.vramPeakMb).toBe(8000);
  });
});
```

- [ ] **Step 2: Implement.**

```ts
// packages/local-gguf-runtime/src/benchmark/runner.ts
import type { GpuBackend, BenchmarkResult } from '@team-x/shared-types';
import { BENCHMARK_PROMPT, BENCHMARK_TARGET_GEN_TOKENS } from './prompt';

export interface BenchmarkRunInput {
  adapter: {
    streamChat: (opts: { model: string; messages: Array<{ role: 'user'; content: string }>; max_tokens?: number }) => AsyncGenerator<{ kind: 'token'; text: string } | { kind: 'done'; usage?: { prompt_tokens: number; completion_tokens: number } } | { kind: string }>;
  };
  modelId: string;
  runs?: number;
  backend: GpuBackend;
  nCtxUsed: number;
  nGpuLayersUsed: number;
  vramSampler: () => Promise<number>;
}

export async function runBenchmark(input: BenchmarkRunInput): Promise<Omit<BenchmarkResult, 'id' | 'ranAt'>> {
  const runs = input.runs ?? 3;
  const samples: Array<{ ttftMs: number; genTokS: number; promptEvalTokS: number }> = [];
  let vramPeak = 0;

  for (let r = 0; r < runs; r++) {
    const t0 = Date.now();
    let firstTokenAt: number | null = null;
    let lastTokenAt = t0;
    let tokenCount = 0;
    let promptTokens = 0;
    let completionTokens = 0;

    const iter = input.adapter.streamChat({
      model: input.modelId,
      messages: [{ role: 'user', content: BENCHMARK_PROMPT }],
      max_tokens: BENCHMARK_TARGET_GEN_TOKENS,
    });

    for await (const chunk of iter) {
      if (chunk.kind === 'token') {
        if (firstTokenAt === null) firstTokenAt = Date.now();
        lastTokenAt = Date.now();
        tokenCount++;
      } else if (chunk.kind === 'done') {
        const usage = (chunk as { usage?: { prompt_tokens: number; completion_tokens: number } }).usage;
        if (usage) {
          promptTokens = usage.prompt_tokens;
          completionTokens = usage.completion_tokens;
        }
      }
    }

    const ttftMs = (firstTokenAt ?? Date.now()) - t0;
    const genDurationS = (lastTokenAt - (firstTokenAt ?? lastTokenAt)) / 1000;
    const genTokS = genDurationS > 0 ? (completionTokens || tokenCount) / genDurationS : 0;
    const promptEvalTokS = ttftMs > 0 && promptTokens > 0
      ? (promptTokens / (ttftMs / 1000))
      : 0;

    samples.push({ ttftMs, genTokS, promptEvalTokS });

    const vram = await input.vramSampler();
    if (vram > vramPeak) vramPeak = vram;
  }

  // Take median
  const sortedTtft = samples.map((s) => s.ttftMs).sort((a, b) => a - b);
  const sortedGen = samples.map((s) => s.genTokS).sort((a, b) => a - b);
  const sortedEval = samples.map((s) => s.promptEvalTokS).sort((a, b) => a - b);
  const m = Math.floor(samples.length / 2);

  return {
    modelId: input.modelId,
    promptEvalTokS: sortedEval[m],
    genTokS: sortedGen[m],
    ttftMs: sortedTtft[m],
    vramPeakMb: vramPeak || null,
    backend: input.backend,
    nCtxUsed: input.nCtxUsed,
    nGpuLayersUsed: input.nGpuLayersUsed,
  };
}
```

- [ ] **Step 3: Commit.**

```
feat(local-gguf): benchmark runner — 3-run median TTFT/promptEval/genTokS + VRAM peak
```

---

### Task 4: `local-model-benchmarks` repo (TDD)

**Files:**
- Create: `apps/desktop/src/main/db/repos/local-model-benchmarks.ts` + test
- Modify: `apps/desktop/src/main/db/client.ts` (register)

Standard repo: insert, listByModelId, latestForModel, deleteAll.

- [ ] **Step 1: TDD test mirrors the Phase 1 repo tests (memory DB, migrations applied).**

- [ ] **Step 2: Implement.** Same shape as Phase 1 repos.

- [ ] **Step 3: Register in `client.ts`.**

- [ ] **Step 4: Commit.**

```
feat(db): local-model-benchmarks repo with insert/list/latest/deleteAll
```

---

### Task 5: BenchmarkService (TDD)

**Files:**
- Create: `apps/desktop/src/main/services/local-gguf/benchmark-service.ts` + test

Orchestrates: load model into pool (if not loaded) → call runner → persist result → return.

```ts
// benchmark-service.ts (skeleton)
export interface BenchmarkServiceDeps {
  pool: { acquire: (id: string) => Promise<{ baseUrl: string; pid: number }> };
  adapter: { streamChat: never }; // injected at boot
  benchmarksRepo: { insert: (input: Omit<BenchmarkResult, 'id' | 'ranAt'>) => BenchmarkResult; listByModelId: (id: string) => BenchmarkResult[] };
  modelsRepo: { getById: (id: string) => LocalModel | null };
  advancedParamsRepo: { getByModelId: (id: string) => AdvancedParams | null };
  vramSampler: (modelId: string) => Promise<number>;
  runtimeSettings: { get: () => { activeBackend: GpuBackend } };
}

export function createBenchmarkService(deps: BenchmarkServiceDeps) {
  return {
    async run(modelId: string): Promise<BenchmarkResult> {
      const model = deps.modelsRepo.getById(modelId);
      if (!model) throw new Error(`model ${modelId} not found`);
      await deps.pool.acquire(modelId); // ensure loaded
      const params = deps.advancedParamsRepo.getByModelId(modelId);
      const result = await runBenchmark({
        adapter: deps.adapter,
        modelId,
        backend: deps.runtimeSettings.get().activeBackend,
        nCtxUsed: params?.nCtx ?? 4096,
        nGpuLayersUsed: params?.nGpuLayers ?? 999,
        vramSampler: () => deps.vramSampler(modelId),
      } as never);
      return deps.benchmarksRepo.insert(result);
    },
    history(modelId: string) {
      return deps.benchmarksRepo.listByModelId(modelId);
    },
  };
}
```

- [ ] **Step 1: TDD.**

- [ ] **Step 2: Implement.**

- [ ] **Step 3: Commit.**

```
feat(local-gguf): BenchmarkService — load → run → persist orchestration
```

---

### Task 6: Replace `localGguf.benchmark.*` IPC stubs

**Files:**
- Modify: `apps/desktop/src/main/ipc/local-gguf-benchmark-handlers.ts` + test

Delegate to BenchmarkService.

```
feat(ipc): replace local-gguf benchmark stubs with BenchmarkService delegations
```

---

### Task 7: `BenchmarkPanel` component (TDD)

**Files:**
- Create: `apps/desktop/src/renderer/src/features/local-gguf/benchmark-panel.tsx` + test

Modal triggered by the `Benchmark` button on `ModelCard`. Three states:
- Idle (Start button)
- Running (progress text: "Loading model…" → "Running prompt eval (1/3)…" → "Generating tokens (1/3)…" → repeat for 2/3 and 3/3)
- Complete (four-metric summary + Save-to-history acknowledgement after 3s)

- [ ] **Step 1: TDD.**

```tsx
// benchmark-panel.tsx
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { BenchmarkResult, LocalModel } from '@team-x/shared-types';

export interface BenchmarkPanelProps {
  model: LocalModel;
  open: boolean;
  onClose: () => void;
}

export function BenchmarkPanel({ model, open, onClose }: BenchmarkPanelProps) {
  const [status, setStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [result, setResult] = useState<BenchmarkResult | null>(null);

  const run = useMutation({
    mutationFn: () => window.teamXApi.localGguf.benchmark.run(model.id),
    onSuccess: (r) => { setResult(r); setStatus('done'); },
  });

  if (!open) return null;
  return (
    <div role="dialog" aria-labelledby="bm-title" aria-modal className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="rounded-lg border border-border bg-card p-6 max-w-md w-full flex flex-col gap-4">
        <h2 id="bm-title" className="text-base font-medium">Benchmark — {model.displayName}</h2>
        {status === 'idle' && (
          <button onClick={() => { setStatus('running'); run.mutate(); }} className="text-sm px-4 py-2 rounded bg-brand text-brand-foreground self-start">
            Start benchmark
          </button>
        )}
        {status === 'running' && (
          <div className="text-sm text-muted-foreground">Running… (3 runs, ~30 s total on CUDA-class hardware)</div>
        )}
        {status === 'done' && result && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Prompt eval</dt>
              <dd className="font-mono">{result.promptEvalTokS.toFixed(1)} tok/s</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Generation</dt>
              <dd className="font-mono">{result.genTokS.toFixed(1)} tok/s</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">TTFT</dt>
              <dd className="font-mono">{result.ttftMs} ms</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">VRAM peak</dt>
              <dd className="font-mono">{result.vramPeakMb ? `${(result.vramPeakMb / 1024).toFixed(1)} GB` : '—'}</dd>
            </div>
          </dl>
        )}
        <button onClick={onClose} className="text-xs text-muted-foreground underline self-end">Close</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `ModelCard` Benchmark button.**

- [ ] **Step 3: Update `ModelCard` to display latest benchmark in the metadata row (replace the "Last benchmark: 42 tok/s · TTFT 380 ms" placeholder).**

- [ ] **Step 4: Commit.**

```
feat(local-gguf-ui): BenchmarkPanel modal — idle/running/done states + Card display of latest result
```

---

### Task 8: CHANGELOG + quality gate + PR

```markdown
### Added
- **Local & Networked GGUF Support (Phase 10 — Benchmark runner)**:
  per-model 3-run benchmark with canned 200-token prompt produces
  `prompt-eval tok/s`, `gen tok/s`, `TTFT`, `VRAM peak`. Results
  persisted to local_model_benchmarks. Library card shows the most-
  recent result; Benchmark button opens a modal with idle/running/done
  state visualization.
```

Quality gate + Stage 1/2/4 review (Stage 3 NOT mandatory).

---

## Phase 10 — Spec coverage map

| Spec section | Implemented by |
|---|---|
| § 4.1.13 per-model benchmark runner | Tasks 2, 3, 5 |
| § 10.5 Benchmark panel | Task 7 |
| § 7 local_model_benchmarks table CRUD | Task 4 |
