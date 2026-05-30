// packages/local-gguf-runtime/src/gpu-probe/cpu.ts
import { cpus, totalmem } from 'node:os';

export interface CpuProbeResult {
  cores: number;
  ramMb: number;
}

export function probeCpu(): CpuProbeResult {
  return {
    cores: cpus().length,
    ramMb: Math.floor(totalmem() / (1024 * 1024)),
  };
}
