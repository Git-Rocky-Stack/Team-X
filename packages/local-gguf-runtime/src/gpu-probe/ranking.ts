// packages/local-gguf-runtime/src/gpu-probe/ranking.ts
//
// Pure function: no I/O, no settings persistence, no side-effects.
// Returns an ordered GpuBackend preference list for a given GpuInventory,
// per spec §12.2 (2026-05-27-local-gguf-support-design.md lines 516-524).
//
// Precedence (availability-gated):
//   cuda > rocm > metal > vulkan > cpu
//
//   cuda   available → ['cuda',  'vulkan', 'cpu']
//   rocm   available → ['rocm',  'vulkan', 'cpu']
//   metal  available → ['metal', 'cpu']            (darwin only in practice)
//   vulkan available → ['vulkan', 'cpu']
//   none              → ['cpu']
//
// Maxwell-class soft-demote (Codex CR-7 F4 / S4 spike F13): the bundled CUDA
// build (b9371 ships CUDA 13.3) dropped Maxwell, so on Maxwell-class NVIDIA
// cards (compute capability 5.x — e.g. the dual GTX TITAN X / sm_52 validated
// on real hardware) the CUDA binary cannot initialize at all. When such a card
// is the best CUDA device AND Vulkan is available, we rank Vulkan ahead of CUDA
// and keep CUDA only as a last-resort fallback (so a Maxwell box WITHOUT Vulkan
// still attempts CUDA). Cards whose computeCap is unknown or >= the bundled
// build's floor keep the normal cuda-first order; any residual mis-rank is
// still caught by the runtime's resolveActiveBinary() health-check fallback.

import type { GpuBackend, GpuInventory } from '@team-x/shared-types';

// Lowest CUDA compute capability the bundled b9371 CUDA 13.3 build supports.
// Maxwell (5.x) and older were dropped by CUDA 13; Pascal (6.0) is the first
// generation we still rank CUDA-first for. Deliberately conservative: we only
// demote what S4 F13 proved fails on real hardware (sm_52), and the runtime
// health-check fallback covers any higher-but-unsupported capability.
const MIN_BUNDLED_CUDA_COMPUTE_CAP = 6.0;

function bundledCudaSupportsBestDevice(cuda: GpuInventory['cuda']): boolean {
  // Use the BEST (highest) known compute capability: a box with a Maxwell card
  // plus a modern card can still run the CUDA build on the modern one. Devices
  // with no computeCap contribute no evidence — if we have no usable data at
  // all, default to "supported" so we never demote on missing telemetry.
  const knownCaps = cuda.devices
    .map((d) => (d.computeCap ? Number.parseFloat(d.computeCap) : Number.NaN))
    .filter((c) => !Number.isNaN(c));
  if (knownCaps.length === 0) return true;
  return Math.max(...knownCaps) >= MIN_BUNDLED_CUDA_COMPUTE_CAP;
}

export function rankBackends(inventory: GpuInventory): GpuBackend[] {
  if (inventory.cuda.available) {
    if (inventory.vulkan.available && !bundledCudaSupportsBestDevice(inventory.cuda)) {
      return ['vulkan', 'cuda', 'cpu'];
    }
    return ['cuda', 'vulkan', 'cpu'];
  }
  if (inventory.rocm.available) {
    return ['rocm', 'vulkan', 'cpu'];
  }
  if (inventory.metal.available) {
    return ['metal', 'cpu'];
  }
  if (inventory.vulkan.available) {
    return ['vulkan', 'cpu'];
  }
  return ['cpu'];
}
