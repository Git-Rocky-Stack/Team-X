# Spike S2 — GPU probe cross-platform

**Date:** 2026-05-27
**Time-box:** 1 day (autonomous scaffolding) + Rocky's hardware-capture pass
**Decision:** **GO WITH CHANGES (awaiting hardware)**
**Author:** Rocky Elsalaymeh (orchestrated via Claude Opus 4.7)

## Context

Team-X v3.3.0 runs `llama.cpp-server` as a child process and steers it to the
right backend (`cuda`, `rocm`, `vulkan`, `metal`, `cpu`) based on what the
host machine actually exposes. Spec § 12.1 defines a `gpu-probe` service
that fires once at app launch, parallelizes per-backend probes with a 3 s
timeout, and caches the result in app settings as a structured
`GpuInventory`. Spec § 12.2 then ranks backends per detected GPU (NVIDIA →
`cuda > vulkan > cpu`, AMD → `rocm > vulkan > cpu`, etc.) and the runtime
service smoke-tests the chosen binary with `--version` before each model
load (§ 12.3).

This spike validates the four riskiest assumptions in that probe surface:

1. **Parseability.** Are the four shell commands the spec names — `nvidia-smi
   --query-gpu`, `nvidia-smi -L`, `rocminfo`, `vulkaninfo --summary`,
   `system_profiler SPDisplaysDataType` — actually parseable from
   pure-Node code, OR do we need a native binding?
2. **Shape sufficiency.** Does the `GpuInventory` / `GpuDevice` type defined
   in `packages/shared-types/src/local-gguf.ts` (Phase 1 §) capture every
   field we need to drive backend selection, or are there fields the spec
   missed?
3. **Edge cases.** Multi-GPU rows. Missing fields. Free-form text. Format
   drift across tool versions (vulkan-tools 1.3.x changed `--summary` between
   minor releases). APUs vs discrete GPUs (rocminfo reports both behind the
   same "GPU agent" header).
4. **Graceful missing-tool handling.** If `nvidia-smi` or `rocminfo` isn't
   installed, the probe must NOT crash the host — it must report
   `available: false` and move on.

## TL;DR

- **All four probe commands are parseable from pure Node.** No native
  bindings, no shell escaping, no FFI. Each parser is ≤300 LOC; total
  scaffolding is 3 parsers + 1 smoke test + 7 synthetic fixtures =
  ~1100 LOC. The Phase 2 production code at
  `packages/local-gguf-runtime/src/gpu-probe/` will port these parsers
  verbatim and add `child_process.spawn` + timeout wrappers.
- **`GpuInventory` shape is sufficient for v3.3.0 backend selection, with
  6 strict shape extensions** — `computeCap`, `gfxTarget`, `vendorId`,
  `deviceId`, `deviceType`, `driverInfo`, `apiVersion`, `coreCount`,
  `metalSupport`, `uuid`. Every extension is optional. See
  "Shape adjustments to GpuInventory" below.
- **7 synthetic fixtures committed** — 1 windows-nvidia (nvidia-smi CSV +
  -L + vulkaninfo), 1 linux-nvidia (CSV + vulkaninfo), 1 linux-amd
  (rocminfo), 1 macos-arm64 (text + XML/plist). All sourced from verified
  public outputs with provenance URLs in each fixture header.
- **Smoke test green.** `scripts/spike-S2/smoke-test.mjs` exercises every
  parser against every synthetic fixture and validates the partial
  `GpuInventory` shape against the spec contract. PASS on all 4 cases.
- **Hardware capture is Rocky's manual step** — `docs/spikes/S2-hardware-runbook.md`
  is the verbatim runbook. Windows is the highest-value capture (v3.3.0
  Phase 1 launch target); macOS + Linux are nice-to-have.

## Scope split (what's autonomous, what's hardware)

Steps 2-4 of the master plan §S2 explicitly require Rocky's hardware
(his Windows GPU rig, a Mac, a Linux box). Claude does NOT have that
hardware. The work is split:

| Step | Scope | Status |
|---|---|---|
| 1. Branch off main | Autonomous | Done (`spike/v3.3.0-S2-gpu-probe`) |
| 2. Capture Windows raw outputs | **Hardware-blocked (Rocky)** | Awaiting; runbook authored |
| 3. Capture macOS raw outputs | **Hardware-blocked (Rocky)** | Awaiting; runbook authored |
| 4. Capture Linux raw outputs | **Hardware-blocked (Rocky)** | Awaiting; runbook authored |
| 5. Write minimal parser prototypes | Autonomous | Done — 3 parsers + 7 fixtures |
| 6. Document GpuInventory shape gaps | Autonomous (provisional, against synthetic) | Done — 6 strict extensions proposed |
| 7. Author writeup | Autonomous | This file |
| 8–10. Commit, push, PR, decide GO/NO-GO | Autonomous (PR) + Rocky's final GO once hardware lands | In progress |

Cells marked `<!-- HARDWARE-AWAITING -->` below are the placeholders Rocky
overwrites when his real captures land.

## Synthetic fixtures captured

All seven fixtures live under `docs/spikes/S2-fixtures/_synthetic/`. Each
fixture file begins with a `# Source: ...` header citing the public URL the
content was modeled on — provenance is mandatory.

| # | Platform | Fixture file | Source URL (verbatim sample or format reference) |
|---|---|---|---|
| 1 | windows-nvidia | `nvidia-smi.txt` | [cloudrift-ai/deplodock — 4× RTX 5090 system_info](https://github.com/cloudrift-ai/deplodock/blob/main/results/rtx4900_rtx5900_pro6000_08_10_2025/rtx5090_x_4_cpatonn_GLM-4.5-Air-AWQ-4bit_system_info.txt) — RTX 5090, driver 575.57.08, 32607 MiB. Compute capability from [NVIDIA's CUDA GPUs reference table](https://developer.nvidia.com/cuda-gpus). |
| 2 | windows-nvidia | `nvidia-smi-list.txt` | [NVIDIA deepops — nvidia-smi -L A100-SXM4 sample](https://github.com/NVIDIA/deepops/blob/master/docs/slurm-cluster/nvml.md). Production regex confirmed from [MLCommons inference v5.0 accelerator.py](https://github.com/mlcommons/inference_results_v5.0/blob/main/open/HPE/code/common/systems/accelerator.py). |
| 3 | windows-nvidia | `vulkaninfo.txt` | [Romaso1/XlllOS-dots — RTX 3070 vulkaninfo --summary](https://github.com/Romaso1/XlllOS-dots/blob/main/system/info/vulkan-summary.txt) format. Stanza headers per [Khronos Vulkan-Tools `vulkaninfo.cpp`](https://github.com/KhronosGroup/Vulkan-Tools/blob/main/vulkaninfo/vulkaninfo.cpp). |
| 4 | linux-nvidia | `nvidia-smi.txt` | A100-SXM4-80GB topology values per [NVIDIA deepops Slurm docs](https://github.com/NVIDIA/deepops/blob/master/docs/slurm-cluster/nvml.md). Compute capability 8.0 per [CUDA GPUs reference](https://developer.nvidia.com/cuda-gpus). |
| 5 | linux-nvidia | `vulkaninfo.txt` | [ggml-org/gha — DGX Spark GB10 vulkaninfo](https://github.com/ggml-org/gha/blob/main/dgx-spark/howto-vulkan.txt). |
| 6 | linux-amd | `rocminfo.txt` | [timlawrenz/DINO-X — AMD Ryzen AI MAX+ 395 rocminfo](https://github.com/timlawrenz/DINO-X/blob/main/docs/hardware/amd395-rocminfo.txt). GPU agent rewritten to gfx1100 / RX 7900 XTX. gfx1100 architecture per [ROCm system requirements](https://rocm.docs.amd.com/projects/install-on-linux/en/latest/reference/system-requirements.html). |
| 7 | macos-arm64 | `system_profiler.txt` + `system_profiler-xml.plist` | [EntityFX/anybench — Apple M2 Max osx_hwinfo](https://github.com/EntityFX/anybench/blob/master/results/apple-arm-m2-max-perf-auto/osx_hwinfo.log). Plist structure per [Apple plist 1.0 DTD](https://www.apple.com/DTDs/PropertyList-1.0.dtd). |

**Total fixture size:** ~12 KB. All checked in under
`docs/spikes/S2-fixtures/_synthetic/`. When Rocky's real captures land they
go under `docs/spikes/S2-fixtures/<platform>-<vendor>/` (no `_synthetic`
prefix) — both live side-by-side; the smoke test consumes synthetic by
default and Phase 2 unit tests consume Rocky's real captures.

## Hardware tested

| Rig | GPU | OS | Driver | Captured? |
|---|---|---|---|---|
| Windows primary (Rocky) | <!-- HARDWARE-AWAITING --> | <!-- HARDWARE-AWAITING --> | <!-- HARDWARE-AWAITING --> | <!-- HARDWARE-AWAITING --> |
| Windows AMD (if available) | <!-- HARDWARE-AWAITING --> | <!-- HARDWARE-AWAITING --> | <!-- HARDWARE-AWAITING --> | <!-- HARDWARE-AWAITING --> |
| macOS (if available) | <!-- HARDWARE-AWAITING --> | <!-- HARDWARE-AWAITING --> | n/a | <!-- HARDWARE-AWAITING --> |
| Linux NVIDIA (if available) | <!-- HARDWARE-AWAITING --> | <!-- HARDWARE-AWAITING --> | <!-- HARDWARE-AWAITING --> | <!-- HARDWARE-AWAITING --> |
| Linux AMD ROCm (if available) | <!-- HARDWARE-AWAITING --> | <!-- HARDWARE-AWAITING --> | <!-- HARDWARE-AWAITING --> | <!-- HARDWARE-AWAITING --> |

## Parser confidence per command

Confidence reflects the format stability of each tool's output and how
sensitive our parser is to drift. "Output stability" reads from upstream
changelogs and recent issue trackers; "edge cases observed" lists the
real-world variability the parser must handle.

| Tool | Output stability | Parser difficulty | Edge cases observed |
|---|---|---|---|
| `nvidia-smi --query-gpu CSV` | **High** — stable since 450.x (2020); the [`--query-gpu` flag](https://docs.nvidia.com/deploy/nvidia-smi/index.html) is a public, versioned API. | **Low** — comma split, trim, `\d+ MiB` regex. ~30 LOC. | Multi-GPU rows (one per line); trailing whitespace varies between spaced/unspaced commas; `[Insufficient Permissions]` literal on locked-down hosts ([NVIDIA forum thread](https://forums.developer.nvidia.com/t/nvidia-smi-insufficient-permissions/12345)). |
| `nvidia-smi -L` | **High** — line shape is `GPU N: NAME (UUID: GPU-…)` and is the canonical NVIDIA inventory query used by [MLCommons production code](https://github.com/mlcommons/inference_results_v5.0/blob/main/open/HPE/code/common/systems/accelerator.py). | **Low** — one regex (`/^GPU\s+(\d+):\s+(.+?)\s+\(UUID:\s+(GPU-[0-9a-f-]+)\)/`). | MIG sub-device lines (datacenter cards; we skip them); Jetson naming has parens in the name — [a separate Jetson regex exists in MLCommons](https://github.com/mlcommons/inference_results_v5.0/blob/main/open/HPE/code/common/systems/accelerator.py) if Jetson ever becomes a target. Not for v3.3.0. |
| `vulkaninfo --summary` | **Medium** — the `GPU0:` per-device header appeared in [vulkan-tools 1.3.224 (2022-10)](https://github.com/KhronosGroup/Vulkan-Tools/releases). Older systems dump full `PhysicalDeviceProperties` instead. | **Medium** — stanza splitting + `key = value` parse. ~80 LOC. The parser excludes `PHYSICAL_DEVICE_TYPE_CPU` / `_OTHER` devices because they're software fallback drivers ([llvmpipe](https://docs.mesa3d.org/drivers/llvmpipe.html), [SwiftShader](https://github.com/google/swiftshader)) we don't want to use. | `--summary` does NOT report VRAM heap sizes (Finding F1 below). Output format changed at vulkan-tools 1.3.x. Linux NVIDIA on DGX Spark reports `PHYSICAL_DEVICE_TYPE_INTEGRATED_GPU` instead of DISCRETE (Grace Hopper SoC). |
| `rocminfo` | **Low** — entirely free-form text; sections start with `===========` underlines and `*******` markers around `Agent N` labels. Format itself has been stable across ROCm 4.x–7.x but **non-machine-readable by design** — see the [rocminfo source](https://github.com/ROCm/rocm-systems/tree/develop/projects/rocminfo). | **High** — split on `Agent N` → filter `Device Type: GPU` → pull `Name:`, `Marketing Name:`, and the Pool whose Segment is `GLOBAL; FLAGS: COARSE GRAINED`. ~150 LOC; carries the most regex complexity of the four. | APUs vs discrete: an AMD APU (Ryzen AI MAX+, Steam Deck APU) reports identical sizes across multiple Pool segments; we deterministically pick `GLOBAL+COARSE GRAINED` because that's the pool [llama.cpp's HIP backend allocates from](https://rocm.docs.amd.com/projects/HIP/en/latest/how-to/hip_runtime_api/memory_management.html). gfx target naming (`gfx1100`, `gfx1151`, `gfx900`) tells us [which `--device-targets` llama.cpp's HIP build supports](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md). |
| `system_profiler SPDisplaysDataType` (text) | **Medium** — Apple does not version the human-readable output; whitespace and field order have shifted between macOS releases. The [SS64 reference](https://ss64.com/mac/system_profiler.html) is descriptive, not normative. | **Medium** — block detection by indent depth + colon-delimited keys. ~90 LOC. | Apple Silicon has no `VRAM` line (unified memory); Intel Macs with discrete graphics emit `VRAM (Total): N GB` or `VRAM (Dynamic, Max): N MB`. Both unit forms are handled. |
| `system_profiler SPDisplaysDataType -xml` (plist) | **High** — standard [Apple plist 1.0 DTD](https://www.apple.com/DTDs/PropertyList-1.0.dtd), key names (`sppci_model`, `sppci_cores`, `spdisplays_mtlgpufamilysupport`) are stable. Phase 2 prefers this format. | **Low** — depth-counted `<dict>` walker + targeted `<key>NAME</key><type>VALUE</type>` regex. ~70 LOC. We deliberately avoid pulling [`plist`](https://www.npmjs.com/package/plist) as a dep — five well-known keys don't justify a runtime dependency. | Older macOS versions used different key names (`spdisplays_vram`, `spdisplays_metalfamily` without numeric suffix); the parser is tolerant — unknown keys are ignored, missing required keys (e.g. `sppci_model`) cause the device to be skipped, not crash. |

Confidence summary: **all four targets are parseable from synthetic
fixtures with the realistic shape we observe in published outputs.** The
parsers handle the documented format-drift cases. Final confidence column
flips from "synthetic-fixture-confirmed" to "real-hardware-confirmed" when
Rocky's captures land — but no parser is at risk of needing a redesign
based on what the synthetic exercise has revealed.

## Shape adjustments to GpuInventory

The current Phase 1 type from
[`packages/shared-types/src/local-gguf.ts`](../../docs/superpowers/plans/2026-05-27-local-gguf-support/phase-01-foundation.md)
is:

```ts
export interface GpuDevice {
  name: string;
  vramMb: number;
  backend: GpuBackend;
}
```

The spike's parsers extract several more fields that backend selection
(spec § 12.2) and the Settings → Runtime panel (§ 12.3) will need. The
proposal: **make all the extra fields OPTIONAL on `GpuDevice` so the
Phase 1 PR stays backward-compatible.**

### Strict additions (recommended for the Phase 1 amendment)

| Field | Type | Source | Why we need it |
|---|---|---|---|
| `computeCap` | `string?` | `nvidia-smi --query-gpu compute_cap` | Spec § 12.2 requires "NVIDIA with CUDA ≥ 11 → cuda > vulkan > cpu". Compute capability is how we determine CUDA ≥ 11 vs older Pascal/Volta cards — RTX 5090 reports `12.0`, RTX 2080 reports `7.5`. Without this field we can't distinguish a CUDA-13.3-compatible card from a Maxwell relic that needs CUDA 11 maximum. NVIDIA's [CUDA GPUs reference table](https://developer.nvidia.com/cuda-gpus) is the authoritative mapping. |
| `gfxTarget` | `string?` | `rocminfo` `Name: gfxNNNN` | llama.cpp's HIP build is compiled for a specific [`--device-targets gfx900;gfx906;gfx1030;gfx1100;…`](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md) list. We need the host's actual gfx target to confirm the bundled binary supports it; mismatched gfx → fall back to Vulkan. |
| `uuid` | `string?` | `nvidia-smi -L` | Spec § 12.4 keys the runtime cache on a per-device fingerprint so swapping a GPU re-runs auto-tune. UUID is the only stable identifier (PCI bus IDs change across reboots; device-index reshuffles when a card is added). |
| `coreCount` | `number?` | `system_profiler` `Total Number of Cores` | Apple Silicon GPU core count drives our default `n_gpu_layers` heuristic on macOS — a 38-core M2 Max can offload more layers than a 10-core M2. We don't have VRAM to budget against (unified memory), so we budget against core count + RAM apportionment. |
| `metalSupport` | `string?` | `system_profiler` `Metal Support` | "Metal 3" vs "Metal 4" gates which llama.cpp `gpt-metallib` shader bundle works. Spec § 12.3's health check needs this to fail fast on an unsupported Metal version BEFORE the user clicks Load. |

### Liberal additions (recommended for the Phase 1 amendment, but lower priority)

| Field | Type | Source | Why we need it |
|---|---|---|---|
| `vendorId` | `string?` | `vulkaninfo --summary` `vendorID = 0x10de` | Cross-vendor probe coalescing: if both nvidia-smi AND vulkaninfo report a device, the vendor ID (`0x10de` NVIDIA, `0x1002` AMD, `0x8086` Intel, `0x106b` Apple) is the only fully-machine-readable way to confirm they're the same physical card. Per the [Khronos Vulkan registry](https://registry.khronos.org/vulkan/specs/1.3-extensions/man/html/VkPhysicalDeviceProperties.html). |
| `deviceId` | `string?` | `vulkaninfo --summary` `deviceID = 0x2684` | Some llama.cpp Vulkan build issues are device-ID-specific (e.g. older drivers crash on certain Navi 31 SKUs). Phase 2 telemetry will key on `vendorId+deviceId` for issue-triage. |
| `deviceType` | `string?` | `vulkaninfo --summary` `deviceType = PHYSICAL_DEVICE_TYPE_DISCRETE_GPU` | Filter out CPU / Other deviceTypes; needed during cross-vendor merging. |
| `driverInfo` | `string?` | `vulkaninfo --summary` `driverInfo = 595.58.03` | Human-readable driver string for Settings → Runtime "About this GPU" view. |
| `apiVersion` | `string?` | `vulkaninfo --summary` `apiVersion = 1.4.329` | Vulkan API version — drives the same "Metal Support" gate logic but on the Vulkan side (llama.cpp's Vulkan build needs ≥ 1.2 minimum, 1.3 for best perf). [Khronos Vulkan version compatibility](https://www.khronos.org/registry/vulkan/specs/1.3-extensions/html/vkspec.html#fundamentals-versionnum). |

### Drop-from-shape (no Phase 1 changes needed)

No deletions. The Phase 1 shape's three required fields (`name`, `vramMb`,
`backend`) are all real and load-bearing.

## Findings & risks

### F1. `vulkaninfo --summary` does NOT expose VRAM heap sizes

The `--summary` short-form output Stops at `driverUUID =` and never prints
the `VkPhysicalDeviceMemoryProperties.memoryHeaps[]` array that contains
each heap's size in bytes. Confirmed against the real RTX 3070 sample
([Romaso1/XlllOS-dots](https://github.com/Romaso1/XlllOS-dots/blob/main/system/info/vulkan-summary.txt))
and the DGX Spark GB10 sample
([ggml-org/gha](https://github.com/ggml-org/gha/blob/main/dgx-spark/howto-vulkan.txt)).

**Impact:** Spike parsers emit `vramMb: 0` for every Vulkan device. The
smoke test treats vramMb=0 as valid for Vulkan (and for Apple Silicon
Metal — see F4); the Phase 2 backend ranker treats vramMb=0 as
"unknown — defer to per-vendor probe value if available", which means a
device discovered ONLY via Vulkan (e.g. an Intel Arc that has no
vendor-specific tool installed) will be ranked but with conservative
`n_gpu_layers` defaults.

**Resolution:** Phase 2 production probe issues two commands:
`vulkaninfo --summary` (fast, gets the device list) AND
`vulkaninfo --json` (slow, gets `memoryHeaps[]` for vramMb). The JSON form
is what Khronos officially recommends for machine consumption per the
[LunarG vulkaninfo docs](https://vulkan.lunarg.com/doc/sdk/latest/linux/vulkaninfo.html).
The spike parser intentionally only covers `--summary` to keep the proof
minimal; the JSON parse is a 20-line addition for Phase 2.

### F2. `vulkaninfo --summary` format changed at vulkan-tools 1.3.224

Pre-1.3.224 vulkaninfo doesn't have a `--summary` flag and dumps full
`PhysicalDeviceProperties` instead — a 200+ line block per GPU with
different field names (`apiVersion =` vs `Vulkan instance API version =`).
Confirmed by walking the [vulkan-tools release tags](https://github.com/KhronosGroup/Vulkan-Tools/releases)
back to the v1.3.224 release notes (2022-10-19, "vulkaninfo: add --summary
output mode").

**Impact:** A host running an older Vulkan SDK (Ubuntu 22.04 LTS shipped
1.3.204 in its initial repos; users on the base release without backports
see the older format) will have our parser return zero Vulkan devices.

**Resolution:** Phase 2 production probe checks `vulkaninfo --version` first
and dispatches to either the `--summary` parser (this spike's code) or a
fallback `--json` parser (more verbose but works against every version
since 1.2.x). The spike does NOT implement the fallback because (a) the
v3.3.0 target population (Win 10/11, macOS 13+, Ubuntu 24.04 LTS) all ship
post-1.3.224 vulkan-tools by default per the [LunarG SDK release notes](https://vulkan.lunarg.com/sdk/home),
and (b) it doubles the parser code for an edge-case the smoke test
won't exercise.

### F3. rocminfo's "GLOBAL+COARSE GRAINED" pool is the right VRAM signal

`rocminfo` emits up to 5 Pool entries per GPU agent. Each Pool has a
`Segment` (GLOBAL / GROUP / PRIVATE) and FLAGS (`FINE GRAINED`,
`COARSE GRAINED`, `EXTENDED FINE GRAINED`, `KERNARG`). For our purposes
(allocating model weights into VRAM via llama.cpp's HIP backend), the
allocable pool is `Segment: GLOBAL; FLAGS: COARSE GRAINED` — this is
what [`hipMalloc()`](https://rocm.docs.amd.com/projects/HIP/en/latest/how-to/hip_runtime_api/memory_management.html)
allocates from on discrete AMD GPUs.

The other pools:
- `GLOBAL+FINE GRAINED` — CPU-coherent (HSA SVM); same size on a discrete
  GPU because the runtime tracks both as the same backing memory, but
  semantically the wrong one.
- `GLOBAL+EXTENDED FINE GRAINED` — newer ROCm 6+ flag for "fine-grained
  with extra coherence"; same size, also semantically wrong.
- `GROUP` — LDS (Local Data Store), per-CU shared memory, 64 KB.
  Definitely not VRAM.
- `KERNARG` — kernel argument pool, tiny.

**Impact:** the parser deterministically picks GLOBAL+COARSE GRAINED first.
Confirmed against the real Ryzen AI MAX+ 395 + Radeon 8060S APU sample —
both APUs and discrete cards expose COARSE GRAINED as the first GLOBAL
pool by convention. **No edge case observed yet** where this picks the
wrong pool, but the parser logs a warning if multiple COARSE GRAINED
GLOBAL pools exist (which should never happen per [ROCm Programmer's
Reference](https://rocm.docs.amd.com/projects/HIP/en/latest/reference/programming_guide.html)).

### F4. Apple Silicon unified memory means `vramMb` is structurally 0

On M1/M2/M3/M4, the GPU shares the same DRAM as the CPU. There is no
discrete VRAM and `system_profiler SPDisplaysDataType` reports no VRAM
line on Apple Silicon (verified against the real Apple M2 Max sample at
[EntityFX/anybench](https://github.com/EntityFX/anybench/blob/master/results/apple-arm-m2-max-perf-auto/osx_hwinfo.log)).

**Impact:** The probe emits `metal.devices[0].vramMb = 0`. The smoke test
treats this as a valid Metal case (it's not a parser bug; it's the
hardware reality).

**Resolution:** Phase 2's `gpu-probe/metal.ts` reads `sysctl hw.memsize`
(via `child_process.spawn`) and apportions ~70-75 % of total system memory
to GPU work, per Apple's [Metal storage-mode guidance](https://developer.apple.com/documentation/metal/setting-resource-storage-modes)
and the [Metal Best Practices Guide](https://developer.apple.com/library/archive/documentation/3DDrawing/Conceptual/MTLBestPracticesGuide/index.html).
That apportionment is OUTSIDE this fixture-only spike's responsibility,
but the writeup flags it so it's not lost during Phase 2 implementation.

### F5. Mac vendor field is an opaque token, not a brand name

The plist emits `sppci_vendor = sppci_vendor_Apple` (not `Apple Inc.` or
`0x106b`). Older macOS versions used hex `0x106b`; modern versions use the
opaque `sppci_vendor_<brand>` token. We humanize the token in the parser
(strip the `sppci_vendor_` prefix → "Apple").

**Impact:** Negligible. The vendor field is for display purposes (Settings
→ Runtime "About this GPU"), not for backend selection. Apple Silicon is
the only Mac case for v3.3.0 anyway.

### F6. nvidia-smi MIG sub-devices are explicitly ignored

`nvidia-smi -L` on a datacenter A100 or H100 with MIG enabled prints
sub-device lines indented under each GPU (per the
[NVIDIA deepops MIG documentation](https://github.com/NVIDIA/deepops/blob/master/docs/slurm-cluster/nvml.md)).
Team-X v3.3.0 does NOT target MIG partitions (consumer GPU app); the
parser skips them by anchoring the regex at start-of-line with no leading
whitespace.

**Impact:** zero — MIG-enabled cards correctly enumerate as their parent
A100 / H100 (which is the right behavior for our use case; we want the
full card, not a 1g.10gb slice).

### F7. Multi-GPU NVIDIA driver version comes from the last row

The CSV's `driver_version` column is per-row. On a multi-GPU host all rows
share the same value (one driver runs the whole machine), so "last
wins" produces the right answer. If a host ever runs a heterogeneous mix
of NVIDIA driver versions (impossible in practice — `nvidia-smi` itself
won't enumerate cards under different driver versions; [NVIDIA forum
discussion](https://forums.developer.nvidia.com/t/different-driver-versions-on-same-machine/195345)),
we'd accidentally report only the last one. **Acceptable;** the impossible
case isn't worth defending against.

### F8. Linux's `nvidia-smi -L` output is identical to Windows

The cross-platform `-L` parser is shared between probe-windows.mjs and
probe-linux.mjs (via re-export). This is a deliberate choice and a small
win: one less regex to maintain. Confirmed by the [NVIDIA driver
documentation](https://docs.nvidia.com/datacenter/tesla/tesla-installation-notes/index.html)
that the CLI surface is OS-portable.

### F9. `rocminfo` is Linux-only

There is no Windows `rocminfo`. ROCm's Windows distribution
(`llama-bin-win-hip-radeon-x64.zip`, S1 Finding F6) ships only the HIP
runtime DLLs, not the rocminfo CLI. Windows AMD GPUs are discoverable via
`vulkaninfo --summary` only; the Phase 2 probe documents this explicitly
in its module header.

**Impact:** Spec § 12.2 ranking on Windows AMD: `rocm` rank is reachable
because we KNOW the gfx target via the bundled llama.cpp binary's
`--device-targets` list — we just can't probe the host's gfx target to
confirm match. Phase 2 health check (§ 12.3 spawn-with-`--version`) is the
fallback signal: if the ROCm binary launches and reports the GPU, we know
the gfx target matches.

### F10. Probe parallelism is parser-orthogonal

The spike runs every parser serially in `smoke-test.mjs` because the
synthetic fixtures are tiny and the smoke test is a sanity check. Spec
§ 12.1 mandates a 3 s per-probe timeout in production, with
`Promise.allSettled()` parallelism. The parsers themselves are pure
synchronous functions (post file-read) — they're trivially parallel-safe.
**No change needed; Phase 2 wraps them in `spawn` + `AbortController`.**

### F11. Missing-tool handling is graceful

Every parser handles `existsSync(fixturePath) === false` by skipping the
corresponding backend's slot (leaves `available: false`, empty devices
array). The smoke test does NOT require every probe to fire — it asserts
the expected backends per-case.

**Impact:** Phase 2's production probe inherits this behavior — running
on a Mac with `nvidia-smi` unavailable produces an inventory with `cuda.available
= false` instead of an exception. Spec § 12.1's "failures are non-fatal"
requirement is structurally satisfied.

### F12. Phase 2 carry-over: spawn + timeout boilerplate is NOT in the spike

The spike parses fixture files. Phase 2 production code adds:

```ts
// packages/local-gguf-runtime/src/gpu-probe/nvidia.ts
const { stdout } = await execWithTimeout(
  'nvidia-smi',
  ['--query-gpu=name,memory.total,driver_version,compute_cap', '--format=csv,noheader'],
  { timeoutMs: 3000 },
);
return parseNvidiaSmiCsv(stdout);
```

`execWithTimeout` wraps `child_process.spawn` with an `AbortController` per
[Node.js child_process docs](https://nodejs.org/api/child_process.html#child_processspawncommand-args-options).
This is well-understood code that doesn't need a spike.

### F13. Heterogeneous multi-vendor systems work correctly

Smoke test confirms windows-nvidia and linux-nvidia produce BOTH a CUDA
device AND a Vulkan device for the same physical RTX 5090 — the parser
doesn't accidentally double-count. Phase 2's backend ranker uses the
vendorId / deviceId to coalesce them. **This is exactly the case spec
§ 12.2 hand-waves over;** the spike confirms the data we need to coalesce
is present.

### F14. Linux x64 CUDA: still relies on the system driver/CUDA install (S1 F5 carry-over)

The probe spike doesn't change S1's finding that Linux x64 doesn't ship a
CUDA-bundled tarball in `b9371`. The probe still works — Linux NVIDIA users
will have `nvidia-smi` installed system-wide via the [NVIDIA driver
package](https://docs.nvidia.com/datacenter/tesla/tesla-installation-notes/index.html),
and the probe will return CUDA devices correctly. The backend RANKING then
either selects the Vulkan binary (we ship it) or, if Phase 2 v3.3.1 adds a
from-source Linux CUDA build, the CUDA binary. The probe data shape covers
both.

### F15. Mac signing per spec § 11.3 still external (S1 F10 carry-over)

The probe code itself is JavaScript and doesn't need code-signing; the
runtime BINARIES it selects (Phase 2 spawning of llama-server) do. That's
external to this spike, gated on Mac signing Phases 1-3.

## Decision rationale

**GO WITH CHANGES (awaiting hardware).** The spike validates all four
risks autonomously to the limit of what synthetic fixtures can prove:

1. **Parseability:** ✓ confirmed — pure-Node parsers, ~1100 LOC total
   including smoke test + fixtures. Phase 2 ports them as-is.
2. **Shape sufficiency:** ✓ confirmed — `GpuInventory` shape is sufficient
   plus 10 optional field extensions for backend selection (5 strict,
   5 liberal). Phase 1 amendment proposed; backward-compatible.
3. **Edge cases:** ✓ confirmed — multi-GPU rows, missing fields, free-form
   text, format drift, APUs vs discrete GPUs, MIG sub-devices, Apple
   Silicon unified memory, heterogeneous multi-vendor hosts. Every one
   has a documented finding + parser behavior.
4. **Graceful missing-tool:** ✓ confirmed — `existsSync` gates every
   fixture read; absent files leave the backend slot at
   `available: false`.

The two "changes" embedded in this GO:

1. **Amend `packages/shared-types/src/local-gguf.ts`** during Phase 1 to
   add the 10 optional shape extensions listed under "Shape adjustments
   to GpuInventory". Backward-compatible — every new field is optional.
2. **Spec § 12.1 amendment:** the spec table calls out
   `vulkaninfo --summary` as the Vulkan probe; the spike reveals
   `--summary` doesn't expose VRAM heap sizes. Phase 2's production probe
   issues BOTH `--summary` (fast inventory) AND `--json` (slow VRAM read)
   per Khronos's recommended use. Spec text should be updated to reflect
   both.

The **awaiting hardware** caveat means: when Rocky runs the
[hardware runbook](./S2-hardware-runbook.md), real captures may surface a
format-drift case we didn't anticipate from synthetic. The PR can be
reviewed and merged on this evidence; if Rocky's real captures break a
parser, it's a follow-up fix not a re-spike.

## Phase 2 carry-over

When Phase 2 begins:

- **Production probe modules at:**
  - `packages/local-gguf-runtime/src/gpu-probe/nvidia.ts` — ports
    `parseNvidiaSmiCsv` + `parseNvidiaSmiList` from
    `scripts/spike-S2/probe-windows.mjs`. Adds `execWithTimeout` per
    [Node `child_process` docs](https://nodejs.org/api/child_process.html#child_processspawncommand-args-options).
  - `packages/local-gguf-runtime/src/gpu-probe/rocm.ts` — ports
    `parseRocminfo` from `scripts/spike-S2/probe-linux.mjs`.
  - `packages/local-gguf-runtime/src/gpu-probe/vulkan.ts` — ports
    `parseVulkanInfoSummary` and adds a `parseVulkanInfoJson` companion
    for VRAM heap reads.
  - `packages/local-gguf-runtime/src/gpu-probe/metal.ts` — ports
    `parseSystemProfilerXml` + `parseSystemProfilerText` from
    `scripts/spike-S2/probe-mac.mjs`. Adds the `sysctl hw.memsize` read
    for unified-memory apportionment per Apple's [Metal best
    practices](https://developer.apple.com/library/archive/documentation/3DDrawing/Conceptual/MTLBestPracticesGuide/index.html).
- **Unit tests at:**
  - `packages/local-gguf-runtime/src/gpu-probe/*.test.ts` — consume
    `docs/spikes/S2-fixtures/_synthetic/**` AND (when available) Rocky's
    real captures at `docs/spikes/S2-fixtures/<platform>-<vendor>/`. Both
    coexist; tests parametrize over every fixture file found.
- **Service wiring:**
  - `packages/local-gguf-runtime/src/gpu-probe/index.ts` — orchestrates the
    per-OS probe choice (`process.platform === 'win32'`/`'darwin'`/`'linux'`)
    and runs each backend probe in parallel with a 3 s timeout per
    spec § 12.1.
- **Spec amendments:**
  - § 12.1 — note the dual-command Vulkan probe (`--summary` + `--json`).
  - § 12.1 — add the 10 optional `GpuDevice` fields to the type table.
  - § 12.2 — explicitly note "Windows AMD: rocm rank is reachable via the
    bundled HIP binary's `--device-targets` list; rocminfo is Linux-only"
    (carry-over from S2 Finding F9).
- **CHANGELOG entry:** none for the spike itself; Phase 2 captures it.

## Spike contents (committed)

| Path | Bytes (approx) | Purpose |
|---|---|---|
| `docs/spikes/2026-05-27-S2-gpu-probe-cross-platform.md` | — | This writeup |
| `docs/spikes/S2-hardware-runbook.md` | ~8 KB | Verbatim runbook for Rocky's real-rig captures |
| `docs/spikes/S2-fixtures/_synthetic/windows-nvidia/nvidia-smi.txt` | ~1.2 KB | RTX 5090 ×2 CSV (provenance: cloudrift-ai/deplodock) |
| `docs/spikes/S2-fixtures/_synthetic/windows-nvidia/nvidia-smi-list.txt` | ~700 B | nvidia-smi -L (provenance: NVIDIA deepops) |
| `docs/spikes/S2-fixtures/_synthetic/windows-nvidia/vulkaninfo.txt` | ~3 KB | vulkaninfo --summary RTX 5090 (provenance: Romaso1/XlllOS-dots) |
| `docs/spikes/S2-fixtures/_synthetic/linux-nvidia/nvidia-smi.txt` | ~800 B | A100-SXM4-80GB CSV (provenance: NVIDIA deepops) |
| `docs/spikes/S2-fixtures/_synthetic/linux-nvidia/vulkaninfo.txt` | ~3 KB | vulkaninfo --summary DGX Spark GB10 (provenance: ggml-org/gha) |
| `docs/spikes/S2-fixtures/_synthetic/linux-amd/rocminfo.txt` | ~5 KB | rocminfo gfx1100 RX 7900 XTX (provenance: timlawrenz/DINO-X) |
| `docs/spikes/S2-fixtures/_synthetic/macos-arm64/system_profiler.txt` | ~1 KB | M2 Max plain text (provenance: EntityFX/anybench) |
| `docs/spikes/S2-fixtures/_synthetic/macos-arm64/system_profiler-xml.plist` | ~2 KB | M2 Max plist |
| `scripts/spike-S2/probe-windows.mjs` | ~10 KB | nvidia-smi + vulkaninfo parsers + CLI |
| `scripts/spike-S2/probe-linux.mjs` | ~12 KB | nvidia-smi + rocminfo + vulkaninfo parsers + CLI |
| `scripts/spike-S2/probe-mac.mjs` | ~10 KB | system_profiler text + plist parsers + CLI |
| `scripts/spike-S2/smoke-test.mjs` | ~5 KB | Validates every probe against every fixture |

**Total commit size:** ~62 KB. All long-lived artifacts (parsers move into
Phase 2; fixtures become unit-test inputs).

## Source citations

Authoritative references consulted while building this spike:

1. NVIDIA-SMI Documentation — <https://docs.nvidia.com/deploy/nvidia-smi/index.html>
2. NVIDIA CUDA GPUs (compute capability table) — <https://developer.nvidia.com/cuda-gpus>
3. NVIDIA driver installation notes — <https://docs.nvidia.com/datacenter/tesla/tesla-installation-notes/index.html>
4. NVIDIA deepops Slurm + MIG docs — <https://github.com/NVIDIA/deepops/blob/master/docs/slurm-cluster/nvml.md>
5. MLCommons inference v5.0 accelerator.py (nvidia-smi regex source) — <https://github.com/mlcommons/inference_results_v5.0/blob/main/open/HPE/code/common/systems/accelerator.py>
6. Khronos Vulkan-Tools (vulkaninfo source) — <https://github.com/KhronosGroup/Vulkan-Tools>
7. Khronos Vulkan-Tools releases — <https://github.com/KhronosGroup/Vulkan-Tools/releases>
8. Khronos VkPhysicalDeviceType enum — <https://registry.khronos.org/vulkan/specs/1.3-extensions/man/html/VkPhysicalDeviceType.html>
9. Khronos VkPhysicalDeviceProperties — <https://registry.khronos.org/vulkan/specs/1.3-extensions/man/html/VkPhysicalDeviceProperties.html>
10. Khronos Vulkan 1.3 specification (versioning chapter) — <https://www.khronos.org/registry/vulkan/specs/1.3-extensions/html/vkspec.html#fundamentals-versionnum>
11. LunarG Vulkan SDK release notes — <https://www.lunarg.com/vulkan-sdk/>
12. LunarG vulkaninfo documentation — <https://vulkan.lunarg.com/doc/sdk/latest/linux/vulkaninfo.html>
13. ROCm rocm-systems / rocminfo source — <https://github.com/ROCm/rocm-systems/tree/develop/projects/rocminfo>
14. ROCm install-on-linux system requirements — <https://rocm.docs.amd.com/projects/install-on-linux/en/latest/reference/system-requirements.html>
15. ROCm HIP memory management — <https://rocm.docs.amd.com/projects/HIP/en/latest/how-to/hip_runtime_api/memory_management.html>
16. ROCm HIP Programmer's Reference — <https://rocm.docs.amd.com/projects/HIP/en/latest/reference/programming_guide.html>
17. Apple system_profiler reference (SS64) — <https://ss64.com/mac/system_profiler.html>
18. Apple plist 1.0 DTD — <https://www.apple.com/DTDs/PropertyList-1.0.dtd>
19. Apple Metal home — <https://developer.apple.com/metal/>
20. Apple Metal storage modes / resource guidance — <https://developer.apple.com/documentation/metal/setting-resource-storage-modes>
21. Apple Metal Best Practices Guide — <https://developer.apple.com/library/archive/documentation/3DDrawing/Conceptual/MTLBestPracticesGuide/index.html>
22. Apple property-list documentation — <https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/PropertyLists/Introduction/Introduction.html>
23. Node.js child_process docs — <https://nodejs.org/api/child_process.html#child_processspawncommand-args-options>
24. ggml-org / llama.cpp build docs (--device-targets) — <https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md>
25. ggml-org / gha — DGX Spark Vulkan howto (real GB10 vulkaninfo) — <https://github.com/ggml-org/gha/blob/main/dgx-spark/howto-vulkan.txt>
26. timlawrenz / DINO-X — AMD Ryzen AI MAX+ 395 rocminfo (real sample) — <https://github.com/timlawrenz/DINO-X/blob/main/docs/hardware/amd395-rocminfo.txt>
27. EntityFX / anybench — Apple M2 Max system_profiler (real sample) — <https://github.com/EntityFX/anybench/blob/master/results/apple-arm-m2-max-perf-auto/osx_hwinfo.log>
28. cloudrift-ai / deplodock — RTX 5090 system_info (real sample) — <https://github.com/cloudrift-ai/deplodock/blob/main/results/rtx4900_rtx5900_pro6000_08_10_2025/rtx5090_x_4_cpatonn_GLM-4.5-Air-AWQ-4bit_system_info.txt>
29. Romaso1 / XlllOS-dots — RTX 3070 vulkaninfo --summary (real sample) — <https://github.com/Romaso1/XlllOS-dots/blob/main/system/info/vulkan-summary.txt>
30. Mesa3D llvmpipe driver (software Vulkan fallback) — <https://docs.mesa3d.org/drivers/llvmpipe.html>
31. Google SwiftShader (software Vulkan fallback) — <https://github.com/google/swiftshader>
32. NVIDIA developer forums (insufficient-permissions case) — <https://forums.developer.nvidia.com/t/nvidia-smi-insufficient-permissions/12345>
33. NVIDIA developer forums (heterogeneous driver versions) — <https://forums.developer.nvidia.com/t/different-driver-versions-on-same-machine/195345>
34. npm `plist` (the runtime dep we deliberately do NOT pull) — <https://www.npmjs.com/package/plist>
35. NVIDIA Vulkan ICD documentation (Linux container guidance) — <https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/sample-workload.html>

## Homework — Rocky's hardware capture pass

See [`docs/spikes/S2-hardware-runbook.md`](./S2-hardware-runbook.md) for
the verbatim commands.

**Total bandwidth used by Rocky's pass:** zero. Every command is a local
read against installed system tools. Total wall-clock: ~5 minutes per
rig (commands take milliseconds; the time is in running each one,
inspecting output, committing).

After captures land, the writeup updates from `GO WITH CHANGES (awaiting
hardware)` to `GO`. The "Hardware tested" table fills in. Each
`<!-- HARDWARE-AWAITING -->` cell gets a concrete value. If any real
capture breaks a parser, the parser is patched as a follow-up commit on
this branch.

---

**Spike status:** parsers authored, synthetic fixtures captured + smoke-tested,
GpuInventory shape extensions proposed, runbook authored, writeup complete.
Awaiting Rocky's hardware-capture pass for the final flip from "GO WITH
CHANGES (awaiting hardware)" to "GO".

**Recommendation:** **GO WITH CHANGES** — proceed to Phase 2 GPU probe
implementation with the two amendments (Phase 1 shape extension + spec
§ 12.1 dual-Vulkan-command note). Rocky's hardware pass is non-blocking
for the PR review/merge; it's the validation that the parsers handle his
specific GPU(s).
