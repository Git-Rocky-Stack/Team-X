// packages/local-gguf-runtime/src/gpu-probe/probe.integration.test.ts
//
// Runs the REAL probeGpu() against the host OS. Asserts shape only — does not
// assert any specific hardware being available. Missing tools return
// available=false gracefully (3 s timeout in defaultRunCommand).
import { describe, expect, it } from 'vitest';
import { probeGpu } from './probe';

describe('probeGpu (integration)', () => {
  it('returns a GpuInventory shape regardless of hardware', async () => {
    const inv = await probeGpu();
    expect(typeof inv.detectedAt).toBe('number');
    expect(inv.cpu.cores).toBeGreaterThanOrEqual(1);
    expect(inv.cpu.ramMb).toBeGreaterThan(0);
    expect(Array.isArray(inv.cuda.devices)).toBe(true);
    expect(Array.isArray(inv.rocm.devices)).toBe(true);
    expect(Array.isArray(inv.vulkan.devices)).toBe(true);
    expect(Array.isArray(inv.metal.devices)).toBe(true);
  }, 15000);

  it('completes within 5 s total (perf assertion)', async () => {
    const start = performance.now();
    await probeGpu();
    // Phase 2 perf budget: the five probes run in parallel with a 3 s per-probe
    // timeout, so the orchestrator finishes well under 5 s even when every
    // backend tool is missing (each fast-fails or times out concurrently).
    expect(performance.now() - start).toBeLessThan(5000);
  }, 15000);
});
