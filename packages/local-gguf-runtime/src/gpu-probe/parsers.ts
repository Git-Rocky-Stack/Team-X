// Pure GPU-probe output parsers, with no process-spawning or filesystem
// dependencies.
//
// `src/index.ts` re-exports `probe.ts`, which imports `node:child_process`
// and transitively drags the whole runtime barrel (chokidar, the llama-server
// lifecycle, the metadata parser) along with it. The Electron-main hardware
// profiler only needs to turn already-captured command output into a device
// list, so it imports this entry instead and pays none of that cost.
//
// Each parser is unit-tested alongside its own module (metal.test.ts,
// nvidia.test.ts, rocm.test.ts, vulkan.test.ts).

export { parseSystemProfiler, type SystemProfilerParseResult } from './metal.js';
export { parseNvidiaSmiCsv, type NvidiaCsvParseResult } from './nvidia.js';
export { parseRocminfo, type RocmParseResult } from './rocm.js';
export { parseVulkaninfo, type VulkaninfoParseResult } from './vulkan.js';
export { probeCpu, type CpuProbeResult } from './cpu.js';
