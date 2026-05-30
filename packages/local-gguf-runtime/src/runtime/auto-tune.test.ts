// packages/local-gguf-runtime/src/runtime/auto-tune.test.ts
import { describe, expect, it } from 'vitest';
import { autoTune } from './auto-tune';

describe('autoTune', () => {
  it('caps n_ctx at min(model max, 4096)', () => {
    const a = autoTune({
      ggufContextMax: 131072,
      ggufArch: 'llama',
      ggufParamsB: 8.0,
      ggufQuant: 'Q4_K_M',
      ggufSizeBytes: 4_900_000_000,
      availableVramMb: 24_576,
      physicalCores: 16,
    });
    expect(a.nCtx).toBe(4096);
  });

  it('uses model context_max if it is smaller than 4096', () => {
    const a = autoTune({
      ggufContextMax: 2048,
      ggufArch: 'bert',
      ggufParamsB: 0.3,
      ggufQuant: 'Q4_K_M',
      ggufSizeBytes: 200_000_000,
      availableVramMb: 24_576,
      physicalCores: 16,
    });
    expect(a.nCtx).toBe(2048);
  });

  it('returns 4096 default when context_max is unknown', () => {
    const a = autoTune({
      ggufContextMax: null,
      ggufArch: 'unknown',
      ggufParamsB: 7.0,
      ggufQuant: 'Q4_K_M',
      ggufSizeBytes: 4_000_000_000,
      availableVramMb: 8_192,
      physicalCores: 8,
    });
    expect(a.nCtx).toBe(4096);
  });

  it('offloads all layers when VRAM comfortably exceeds model size × 1.2', () => {
    const a = autoTune({
      ggufContextMax: 4096,
      ggufArch: 'llama',
      ggufParamsB: 7.0,
      ggufQuant: 'Q4_K_M',
      ggufSizeBytes: 4_000_000_000,
      availableVramMb: 24_576,
      physicalCores: 16,
    });
    expect(a.nGpuLayers).toBe(999); // 999 is llama.cpp's "all layers" sentinel
  });

  it('offloads zero layers (CPU only) when VRAM is below model size', () => {
    const a = autoTune({
      ggufContextMax: 4096,
      ggufArch: 'llama',
      ggufParamsB: 70.0,
      ggufQuant: 'Q4_K_M',
      ggufSizeBytes: 40_000_000_000,
      availableVramMb: 8_192,
      physicalCores: 16,
    });
    expect(a.nGpuLayers).toBe(0);
  });

  it('partial offload when VRAM fits some but not all layers', () => {
    // ~13 GB model, 8 GB VRAM. With 0.85 safety, usable is ~6.96 GB.
    // Roughly half the layers fit.
    const a = autoTune({
      ggufContextMax: 4096,
      ggufArch: 'llama',
      ggufParamsB: 13.0,
      ggufQuant: 'Q4_K_M',
      ggufSizeBytes: 7_500_000_000,
      availableVramMb: 8_192,
      physicalCores: 8,
    });
    expect(a.nGpuLayers).toBeGreaterThan(0);
    expect(a.nGpuLayers).toBeLessThan(999);
  });

  it('threads = max(1, physicalCores - 2)', () => {
    expect(
      autoTune({
        ggufContextMax: 4096,
        ggufArch: 'l',
        ggufParamsB: 7,
        ggufQuant: 'Q4',
        ggufSizeBytes: 4_000_000_000,
        availableVramMb: 0,
        physicalCores: 1,
      }).nThreads,
    ).toBe(1);
    expect(
      autoTune({
        ggufContextMax: 4096,
        ggufArch: 'l',
        ggufParamsB: 7,
        ggufQuant: 'Q4',
        ggufSizeBytes: 4_000_000_000,
        availableVramMb: 0,
        physicalCores: 2,
      }).nThreads,
    ).toBe(1);
    expect(
      autoTune({
        ggufContextMax: 4096,
        ggufArch: 'l',
        ggufParamsB: 7,
        ggufQuant: 'Q4',
        ggufSizeBytes: 4_000_000_000,
        availableVramMb: 0,
        physicalCores: 8,
      }).nThreads,
    ).toBe(6);
    expect(
      autoTune({
        ggufContextMax: 4096,
        ggufArch: 'l',
        ggufParamsB: 7,
        ggufQuant: 'Q4',
        ggufSizeBytes: 4_000_000_000,
        availableVramMb: 0,
        physicalCores: 32,
      }).nThreads,
    ).toBe(30);
  });

  it('sampling defaults are stable', () => {
    const a = autoTune({
      ggufContextMax: 4096,
      ggufArch: 'l',
      ggufParamsB: 7,
      ggufQuant: 'Q4',
      ggufSizeBytes: 4_000_000_000,
      availableVramMb: 0,
      physicalCores: 8,
    });
    expect(a.temperature).toBe(0.7);
    expect(a.topP).toBe(0.95);
    expect(a.topK).toBe(40);
    expect(a.repeatPenalty).toBe(1.1);
    expect(a.nBatch).toBe(512);
  });

  it('clamps threads to a floor of 1 when physicalCores is 0', () => {
    const a = autoTune({
      ggufContextMax: 4096,
      ggufArch: 'llama',
      ggufParamsB: 7,
      ggufQuant: 'Q4_K_M',
      ggufSizeBytes: 4_000_000_000,
      availableVramMb: 0,
      physicalCores: 0,
    });
    expect(a.nThreads).toBe(1);
  });

  it('floors n_ctx at 512 even when the model reports a smaller context', () => {
    // Some embedding models report a tiny context window; the tuner floors
    // at 512 deliberately. This documents that intentional behavior.
    const a = autoTune({
      ggufContextMax: 256,
      ggufArch: 'bert',
      ggufParamsB: 0.1,
      ggufQuant: 'Q4_K_M',
      ggufSizeBytes: 80_000_000,
      availableVramMb: 0,
      physicalCores: 8,
    });
    expect(a.nCtx).toBe(512);
  });

  it('uses the 32-layer fallback for an unknown arch in the partial-offload band', () => {
    // Unknown arch -> ARCH_LAYER_COUNTS fallback (32). VRAM sits between the
    // 0.5x and 1.2x thresholds, so a partial offload is computed.
    const a = autoTune({
      ggufContextMax: 4096,
      ggufArch: 'totally-unknown-arch',
      ggufParamsB: 13.0,
      ggufQuant: 'Q4_K_M',
      ggufSizeBytes: 7_500_000_000,
      availableVramMb: 8_192,
      physicalCores: 8,
    });
    expect(a.nGpuLayers).toBeGreaterThan(0);
    expect(a.nGpuLayers).toBeLessThan(999);
  });
});
