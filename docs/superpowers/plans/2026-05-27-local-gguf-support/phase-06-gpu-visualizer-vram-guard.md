# Phase 6 — GPU Visualizer + VRAM Guard + Advanced Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
>
> **Cross-phase rules:** See master plan § "Cross-phase rules" (CR-1 through CR-10).
>
> **Codex Stage 3 review:** NOT MANDATORY (pure renderer + math; no new subprocess/HTTP/path).

**Goal:** Land the Advanced panel (per-model overrides), GPU offload visualizer (live VRAM projection as `n_gpu_layers` slider moves), and VRAM headroom guard (block bad loads pre-flight). Plugs into the slot reserved by Phase 5's `ModelCard`.

**Architecture:** The `vram-estimator.ts` module (in `@team-x/local-gguf-runtime/src/metadata/`) provides a pure function that takes model metadata + a candidate `n_gpu_layers` and returns predicted VRAM in MB. The renderer's `GpuOffloadVisualizer` calls into this through a new IPC channel `localGguf.runtime.estimateVram` (read-only, no side effects). The `VramGuard` is wrapped around `pool.load` — pre-flight check before the spawn.

**Spec coverage:** Implements spec § 10.3 (Advanced panel), § 10.4 (GPU offload visualizer), § 4.1.7 (VRAM/RAM headroom guard).

**Estimated PR size:** ~1,500 LOC production + ~2,000 LOC tests. Single PR.

---

## Files this phase touches

### New files

```
packages/local-gguf-runtime/src/metadata/
├── vram-estimator.ts                              (pure function — TDD)
└── vram-estimator.test.ts

apps/desktop/src/main/services/local-gguf/
├── vram-guard.ts                                  (wraps PoolService.load with pre-flight)
└── vram-guard.test.ts

apps/desktop/src/renderer/src/features/local-gguf/
├── advanced-panel.tsx
├── advanced-panel.test.tsx
├── gpu-offload-visualizer.tsx
├── gpu-offload-visualizer.test.tsx
├── use-vram-projection.ts                         (renderer-side hook)
└── use-vram-projection.test.ts
```

### Modified files

```
packages/shared-types/src/local-gguf.ts            (add VramProjection IPC contract)
apps/desktop/src/main/ipc/local-gguf-runtime-handlers.ts (add estimateVram channel)
apps/desktop/src/main/services/local-gguf/pool-service.ts (call VramGuard before spawn)
apps/desktop/src/renderer/src/features/local-gguf/model-card.tsx (mount AdvancedPanel modal + GpuOffloadVisualizer in the reserved slot)
apps/desktop/src/preload/local-gguf-api.ts          (expose estimateVram)
CHANGELOG.md
```

---

## Tasks

### Task 1: Branch + sync

```bash
git checkout main && git pull --ff-only
git checkout -b feat/v3.3.0-phase-06-vram-guard
```

---

### Task 2: VRAM estimator (TDD)

**Files:**
- Create: `packages/local-gguf-runtime/src/metadata/vram-estimator.ts`
- Create: `packages/local-gguf-runtime/src/metadata/vram-estimator.test.ts`

Per-arch / per-layer coefficients give a usable estimate; ±15% accuracy is acceptable for guard purposes (the actual safety margin in `autoTune` is 15%, so we're consistent).

- [ ] **Step 1: TDD test.**

```ts
// vram-estimator.test.ts
import { describe, expect, it } from 'vitest';
import { estimateVramMb, getTotalLayersForArch } from './vram-estimator';

describe('estimateVramMb', () => {
  it('Llama 7B Q4_K_M fully offloaded ≈ 5,500 MB ± 1,000', () => {
    const v = estimateVramMb({ arch: 'llama', paramsBillions: 7.0, quant: 'Q4_K_M', sizeBytes: 4_000_000_000, nGpuLayers: 999, nCtx: 4096 });
    expect(v).toBeGreaterThan(4500);
    expect(v).toBeLessThan(6500);
  });

  it('Llama 7B Q4_K_M with 0 GPU layers ≈ 0 MB VRAM', () => {
    const v = estimateVramMb({ arch: 'llama', paramsBillions: 7.0, quant: 'Q4_K_M', sizeBytes: 4_000_000_000, nGpuLayers: 0, nCtx: 4096 });
    expect(v).toBeLessThan(500);
  });

  it('Llama 70B Q4_K_M fully offloaded ≈ 42,000 MB ± 5,000', () => {
    const v = estimateVramMb({ arch: 'llama', paramsBillions: 70.0, quant: 'Q4_K_M', sizeBytes: 40_000_000_000, nGpuLayers: 999, nCtx: 4096 });
    expect(v).toBeGreaterThan(37_000);
    expect(v).toBeLessThan(48_000);
  });

  it('partial offload scales linearly with nGpuLayers', () => {
    const full = estimateVramMb({ arch: 'llama', paramsBillions: 7.0, quant: 'Q4_K_M', sizeBytes: 4_000_000_000, nGpuLayers: 32, nCtx: 4096 });
    const half = estimateVramMb({ arch: 'llama', paramsBillions: 7.0, quant: 'Q4_K_M', sizeBytes: 4_000_000_000, nGpuLayers: 16, nCtx: 4096 });
    expect(half).toBeGreaterThan(full * 0.4);
    expect(half).toBeLessThan(full * 0.6);
  });

  it('larger context grows the KV cache contribution', () => {
    const short = estimateVramMb({ arch: 'llama', paramsBillions: 7.0, quant: 'Q4_K_M', sizeBytes: 4_000_000_000, nGpuLayers: 999, nCtx: 2048 });
    const long = estimateVramMb({ arch: 'llama', paramsBillions: 7.0, quant: 'Q4_K_M', sizeBytes: 4_000_000_000, nGpuLayers: 999, nCtx: 32768 });
    expect(long).toBeGreaterThan(short + 500);
  });

  it('Q4_K_M < Q5_K_M < Q8_0 < F16 for same model', () => {
    const args = { arch: 'llama', paramsBillions: 7.0, sizeBytes: 4_000_000_000, nGpuLayers: 999, nCtx: 4096 };
    const q4 = estimateVramMb({ ...args, quant: 'Q4_K_M' });
    const q5 = estimateVramMb({ ...args, quant: 'Q5_K_M', sizeBytes: 5_000_000_000 });
    const q8 = estimateVramMb({ ...args, quant: 'Q8_0', sizeBytes: 7_500_000_000 });
    const f16 = estimateVramMb({ ...args, quant: 'F16', sizeBytes: 14_000_000_000 });
    expect(q4).toBeLessThan(q5);
    expect(q5).toBeLessThan(q8);
    expect(q8).toBeLessThan(f16);
  });

  it('getTotalLayersForArch returns known counts', () => {
    expect(getTotalLayersForArch('llama')).toBe(32);
    expect(getTotalLayersForArch('gemma2')).toBe(42);
    expect(getTotalLayersForArch('unknown')).toBe(32); // sane default
  });
});
```

- [ ] **Step 2: Run; expect fail.**

- [ ] **Step 3: Implement.**

```ts
// packages/local-gguf-runtime/src/metadata/vram-estimator.ts
//
// Pure function estimating VRAM use for a GGUF + load configuration.
// Three additive components:
//   1. Layer weights on GPU (proportional to model size × gpu_layers_ratio)
//   2. KV cache (proportional to n_ctx × layers_on_gpu)
//   3. Activation buffers (fixed-ish overhead, ~500 MB for typical sizes)
//
// Accuracy target: ±15% — sufficient for guard purposes.

const ALL_LAYERS_SENTINEL = 999;
const ACTIVATION_OVERHEAD_MB = 500;

const ARCH_LAYER_COUNTS: Record<string, number> = {
  llama: 32, llama2: 32, llama3: 32,
  mistral: 32,
  qwen2: 32, qwen2_moe: 28,
  gemma2: 42,
  phi3: 32,
  deepseek2: 30,
  bert: 12, 'nomic-bert': 12, 'xlm-roberta': 12,
};

export function getTotalLayersForArch(arch: string): number {
  return ARCH_LAYER_COUNTS[arch.toLowerCase()] ?? 32;
}

// KV cache size = 2 (K+V) × layers × n_ctx × hidden_size × bytes_per_element.
// Without hidden_size from metadata we approximate: 16 KiB per layer per ctx token
// for typical 7B-70B models.
const KV_CACHE_BYTES_PER_LAYER_PER_TOKEN = 16 * 1024;

export interface VramEstimatorInput {
  arch: string;
  paramsBillions: number;
  quant: string;
  sizeBytes: number;
  nGpuLayers: number;
  nCtx: number;
}

export function estimateVramMb(input: VramEstimatorInput): number {
  const totalLayers = getTotalLayersForArch(input.arch);
  const layersOnGpu = input.nGpuLayers === ALL_LAYERS_SENTINEL
    ? totalLayers
    : Math.min(input.nGpuLayers, totalLayers);

  if (layersOnGpu === 0) return 0;

  // Component 1: weight VRAM
  const ratio = layersOnGpu / totalLayers;
  const weightVramMb = (input.sizeBytes / (1024 * 1024)) * ratio;

  // Component 2: KV cache for the on-GPU layers
  const kvBytes = 2 * layersOnGpu * input.nCtx * KV_CACHE_BYTES_PER_LAYER_PER_TOKEN;
  const kvMb = kvBytes / (1024 * 1024);

  // Component 3: activation overhead
  return Math.round(weightVramMb + kvMb + ACTIVATION_OVERHEAD_MB);
}
```

- [ ] **Step 4: Run + commit.**

```
feat(local-gguf): VRAM estimator — pure function, weights + KV cache + activation
```

---

### Task 3: Extend shared-types with VRAM projection IPC contract

**Files:**
- Modify: `packages/shared-types/src/local-gguf.ts`

Append:

```ts
export interface VramProjection {
  predictedVramMb: number;
  availableVramMb: number;
  fits: boolean;
  marginMb: number;
}

export interface EstimateVramInput {
  modelId: string;
  nGpuLayers: number;
  nCtx: number;
}
```

Re-export. Update unit tests in `local-gguf.test.ts` to add a shape assertion.

```
feat(shared-types): add VramProjection + EstimateVramInput contracts
```

---

### Task 4: New IPC channel `localGguf.runtime.estimateVram`

**Files:**
- Modify: `apps/desktop/src/main/ipc/local-gguf-runtime-handlers.ts`
- Modify: `apps/desktop/src/preload/local-gguf-api.ts`
- Modify: `apps/desktop/src/main/ipc/local-gguf-runtime-handlers.test.ts`

- [ ] **Step 1: Add the handler. Pull model metadata, call `estimateVramMb`, return `VramProjection` with current available VRAM from the active backend's GPU.**

- [ ] **Step 2: Extend preload bridge.**

- [ ] **Step 3: Test.**

- [ ] **Step 4: Commit.**

```
feat(ipc): localGguf.runtime.estimateVram channel
```

---

### Task 5: VramGuard service (TDD)

**Files:**
- Create: `apps/desktop/src/main/services/local-gguf/vram-guard.ts`
- Create: `apps/desktop/src/main/services/local-gguf/vram-guard.test.ts`

Wraps the pool-service's `load` with a pre-flight VRAM check. Throws `LocalGgufError(oom-predicted)` if the predicted VRAM + 1 GB safety exceeds available.

- [ ] **Step 1: TDD test.**

```ts
// vram-guard.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createVramGuard } from './vram-guard';

describe('createVramGuard', () => {
  it('allows load when predicted fits with margin', async () => {
    const guard = createVramGuard({
      estimateVram: async () => 5000,
      getAvailableVramMb: async () => 24576,
      safetyMb: 1024,
    });
    await expect(guard.checkOrThrow({ modelId: 'm1', nGpuLayers: 999, nCtx: 4096 })).resolves.toBeUndefined();
  });

  it('throws oom-predicted when no margin', async () => {
    const guard = createVramGuard({
      estimateVram: async () => 24000,
      getAvailableVramMb: async () => 24576,
      safetyMb: 1024,
    });
    await expect(guard.checkOrThrow({ modelId: 'm1', nGpuLayers: 999, nCtx: 4096 })).rejects.toMatchObject({
      error: { kind: 'oom-predicted', requiredMb: 24000, availableMb: 24576 },
    });
  });

  it('throws oom-predicted when predicted exceeds available', async () => {
    const guard = createVramGuard({
      estimateVram: async () => 40000,
      getAvailableVramMb: async () => 24576,
      safetyMb: 1024,
    });
    await expect(guard.checkOrThrow({ modelId: 'm1', nGpuLayers: 999, nCtx: 4096 })).rejects.toMatchObject({
      error: { kind: 'oom-predicted' },
    });
  });

  it('allows load when n_gpu_layers=0 even on a system with no GPU', async () => {
    const guard = createVramGuard({
      estimateVram: async () => 0,
      getAvailableVramMb: async () => 0,
      safetyMb: 1024,
    });
    await expect(guard.checkOrThrow({ modelId: 'm1', nGpuLayers: 0, nCtx: 4096 })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement.**

```ts
// apps/desktop/src/main/services/local-gguf/vram-guard.ts
import type { LocalGgufError } from '@team-x/shared-types';

export class VramGuardError extends Error {
  constructor(public readonly error: LocalGgufError) {
    super(`VramGuardError: ${JSON.stringify(error)}`);
    this.name = 'VramGuardError';
  }
}

export interface VramGuardDeps {
  estimateVram: (modelId: string, nGpuLayers: number, nCtx: number) => Promise<number>;
  getAvailableVramMb: () => Promise<number>;
  safetyMb?: number;
}

export interface CheckOptions {
  modelId: string;
  nGpuLayers: number;
  nCtx: number;
}

export function createVramGuard(deps: VramGuardDeps) {
  const safetyMb = deps.safetyMb ?? 1024;
  return {
    async checkOrThrow(opts: CheckOptions): Promise<void> {
      const required = await deps.estimateVram(opts.modelId, opts.nGpuLayers, opts.nCtx);
      if (required === 0) return; // CPU-only load
      const available = await deps.getAvailableVramMb();
      if (required + safetyMb > available) {
        throw new VramGuardError({ kind: 'oom-predicted', requiredMb: required, availableMb: available });
      }
    },
  };
}
```

- [ ] **Step 3: Wire into `pool-service.ts`** — `acquireOrLoad(modelId)` calls `vramGuard.checkOrThrow(...)` before `spawnServer(...)`.

- [ ] **Step 4: Commit.**

```
feat(local-gguf): VramGuard — pre-flight oom-predicted check before pool spawn
```

---

### Task 6: `use-vram-projection` hook (TDD)

**Files:**
- Create: `apps/desktop/src/renderer/src/features/local-gguf/use-vram-projection.ts` + test

Throttled hook (200 ms) that calls `localGguf.runtime.estimateVram` as the slider moves. Returns `VramProjection`.

- [ ] **Step 1: TDD test (mocked IPC).**

- [ ] **Step 2: Implement using `useQuery` with `staleTime: 200`.**

- [ ] **Step 3: Commit.**

```
feat(local-gguf-ui): useVramProjection — throttled estimateVram hook
```

---

### Task 7: `GpuOffloadVisualizer` component (TDD)

**Files:**
- Create: `apps/desktop/src/renderer/src/features/local-gguf/gpu-offload-visualizer.tsx` + test

Renders the stacked bar (GPU layers brand red / CPU layers muted) + slider (`.brand-range`) + live VRAM projection text. Slider drives `useVramProjection`. When projection > available, slider track turns red and a warning fires.

- [ ] **Step 1: TDD test.** Visual structure, slider interaction, warning state when over-VRAM, disabled Apply button when over-VRAM.

- [ ] **Step 2: Implement.**

```tsx
// apps/desktop/src/renderer/src/features/local-gguf/gpu-offload-visualizer.tsx
import { useState } from 'react';
import type { LocalModel } from '@team-x/shared-types';
import { useVramProjection } from './use-vram-projection';
import { cn } from '@/lib/utils';

export interface GpuOffloadVisualizerProps {
  model: LocalModel;
  initialNGpuLayers: number;
  initialNCtx: number;
  totalLayers: number;
  onChange: (nGpuLayers: number) => void;
}

export function GpuOffloadVisualizer({ model, initialNGpuLayers, initialNCtx, totalLayers, onChange }: GpuOffloadVisualizerProps) {
  const [layers, setLayers] = useState(initialNGpuLayers);
  const { data: projection } = useVramProjection({
    modelId: model.id,
    nGpuLayers: layers,
    nCtx: initialNCtx,
  });

  const overVram = projection ? projection.predictedVramMb > projection.availableVramMb : false;
  const noMargin = projection ? !projection.fits : false;

  return (
    <div className="flex flex-col gap-2">
      {/* Stacked bar */}
      <div className="h-6 rounded overflow-hidden border border-border flex">
        <div
          aria-label={`${layers} of ${totalLayers} layers on GPU`}
          className={cn('bg-brand transition-all', overVram && 'bg-red-500')}
          style={{ width: `${Math.min(100, (layers / totalLayers) * 100)}%` }}
        />
        <div className="bg-muted flex-1" />
      </div>

      {/* Slider */}
      <input
        type="range"
        min={0}
        max={totalLayers}
        step={1}
        value={layers}
        onChange={(e) => { const n = parseInt(e.target.value, 10); setLayers(n); onChange(n); }}
        className="brand-range"
        aria-label={`GPU layers (${layers} of ${totalLayers})`}
      />

      {/* Projection text */}
      <div className={cn('text-xs', overVram && 'text-red-400', !overVram && noMargin && 'text-amber-400')}>
        {projection ? (
          <>
            {projection.predictedVramMb.toLocaleString()} / {projection.availableVramMb.toLocaleString()} MB VRAM
            {overVram && ' — exceeds available, load will fail'}
            {!overVram && noMargin && ' — margin tight, may OOM at inference'}
          </>
        ) : (
          'Calculating…'
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit.**

```
feat(local-gguf-ui): GpuOffloadVisualizer — stacked bar + slider + live VRAM projection
```

---

### Task 8: `AdvancedPanel` component (TDD)

**Files:**
- Create: `apps/desktop/src/renderer/src/features/local-gguf/advanced-panel.tsx` + test

Modal triggered by `Advanced` button on the card. Layout:
- Top: auto-tune summary (current values being used)
- Middle: form fields for `n_ctx`, `n_gpu_layers`, `n_batch`, `n_threads`, `temperature`, `top_p`, `top_k`, `repeat_penalty`, checkboxes for `mmap`, `mlock`, `flash_attention`
- Bottom: `GpuOffloadVisualizer` (Task 7)
- Footer: `Reset to Auto` + `Apply` + `Cancel`

`Apply` is disabled when the visualizer reports VRAM-exceeded.

- [ ] **Step 1: TDD.** Cover: form fields persist on Apply, Reset-to-Auto clears overrides (calls `localGguf.library.resetAdvanced`), Apply is disabled when VRAM exceeds, Cancel reverts.

- [ ] **Step 2: Implement.**

- [ ] **Step 3: Wire into `ModelCard`** — the `onAdvanced` callback opens the modal.

- [ ] **Step 4: Commit.**

```
feat(local-gguf-ui): AdvancedPanel — per-model overrides + GPU visualizer + Reset-to-Auto + Apply gating on VRAM
```

---

### Task 9: CHANGELOG + quality gate + PR

```markdown
### Added
- **Local & Networked GGUF Support (Phase 6 — GPU visualizer + VRAM guard
  + Advanced panel)**: per-model Advanced panel with all 11 llama-server
  knobs (n_ctx, n_gpu_layers, n_batch, n_threads, temperature, top_p,
  top_k, repeat_penalty, mmap, mlock, flash_attention) + Reset-to-Auto.
  Real-time GPU offload visualizer (stacked bar + slider + live VRAM
  projection) feeds back as the slider moves. VramGuard service
  pre-flights every pool load — predicted VRAM use + 1 GB safety
  margin must fit, otherwise the load fails with typed `oom-predicted`
  error before the subprocess spawns. New IPC channel
  `localGguf.runtime.estimateVram`. New pure function `estimateVramMb`
  in @team-x/local-gguf-runtime/metadata (weights + KV cache +
  activation, ±15% accuracy).
```

Quality gate: typecheck, lint, test, ≥ 90% coverage on new code, E2E (extend Phase 5's library spec with an Advanced panel walkthrough), `pnpm audit:claims:strict`, perf assertions (estimateVramMb < 1 ms; slider drag re-projection < 50 ms incl. IPC round-trip).

Codex Stage 3 NOT mandatory.

---

## Phase 6 — Spec coverage map

| Spec section | Implemented by |
|---|---|
| § 10.3 Advanced panel | Task 8 |
| § 10.4 GPU offload visualizer | Task 7 |
| § 4.1.7 VRAM headroom guard | Tasks 2, 5 |
| § 15 LocalGgufError `oom-predicted` | Task 5 |
| § 19 acceptance criterion #6 (VRAM guard blocks OOM-bound load) | Task 5 |
