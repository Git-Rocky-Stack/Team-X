// packages/local-gguf-runtime/src/runtime/auto-tune.ts
//
// Auto-tune llama-server flags from GGUF metadata + detected hardware.
// All values are deterministic for a given input — no I/O.

export interface AutoTuneInput {
  ggufContextMax: number | null;
  ggufArch: string;
  ggufParamsB: number;
  ggufQuant: string;
  ggufSizeBytes: number;
  availableVramMb: number;
  physicalCores: number;
}

export interface AutoTuneOutput {
  nCtx: number;
  nGpuLayers: number;
  nBatch: number;
  nThreads: number;
  temperature: number;
  topP: number;
  topK: number;
  repeatPenalty: number;
}

const DEFAULT_NCTX = 4096;
const DEFAULT_NBATCH = 512;
const VRAM_SAFETY = 0.85;
const ALL_LAYERS_SENTINEL = 999;

// Rough per-arch layer-count table used to estimate partial offload.
// Numbers from real GGUF metadata across Llama 3.x, Mistral, Qwen 2.x, etc.
const ARCH_LAYER_COUNTS: Record<string, number> = {
  llama: 32,
  llama2: 32,
  llama3: 32,
  mistral: 32,
  qwen2: 32,
  qwen2_moe: 28,
  gemma2: 42,
  phi3: 32,
  deepseek2: 30,
  // Embedding archs have many fewer layers
  bert: 12,
  'nomic-bert': 12,
  'xlm-roberta': 12,
};

// Per-billion-parameter VRAM cost (Q4_K_M typical). Multiplied by params count.
const VRAM_MB_PER_BILLION = 600; // rough; tuned to be conservative

export function autoTune(input: AutoTuneInput): AutoTuneOutput {
  const nCtx = clamp(input.ggufContextMax ?? DEFAULT_NCTX, 512, DEFAULT_NCTX);

  const modelVramEstimateMb = input.ggufParamsB * VRAM_MB_PER_BILLION;
  const usableVramMb = Math.floor(input.availableVramMb * VRAM_SAFETY);

  let nGpuLayers: number;
  if (input.availableVramMb === 0) {
    nGpuLayers = 0;
  } else if (usableVramMb >= modelVramEstimateMb * 1.2) {
    nGpuLayers = ALL_LAYERS_SENTINEL;
  } else if (usableVramMb < modelVramEstimateMb * 0.5) {
    nGpuLayers = 0;
  } else {
    const totalLayers = ARCH_LAYER_COUNTS[input.ggufArch] ?? 32;
    const ratio = usableVramMb / (modelVramEstimateMb * 1.0);
    nGpuLayers = Math.max(1, Math.floor(totalLayers * ratio));
  }

  const nThreads = Math.max(1, input.physicalCores - 2);

  return {
    nCtx,
    nGpuLayers,
    nBatch: DEFAULT_NBATCH,
    nThreads,
    temperature: 0.7,
    topP: 0.95,
    topK: 40,
    repeatPenalty: 1.1,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
