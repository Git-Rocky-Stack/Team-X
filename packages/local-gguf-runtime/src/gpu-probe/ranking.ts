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
// NOTE: compute-capability ranking (e.g. Maxwell gating) is explicitly
// deferred — do NOT add special-casing here.

import type { GpuBackend, GpuInventory } from '@team-x/shared-types';

export function rankBackends(inventory: GpuInventory): GpuBackend[] {
  if (inventory.cuda.available) {
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
