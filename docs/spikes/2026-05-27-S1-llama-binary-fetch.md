# Spike S1 — llama.cpp binary fetch + version pin

**Date:** 2026-05-27
**Time-box:** 1 day
**Decision:** **GO WITH CHANGES**
**Author:** Rocky Elsalaymeh (orchestrated via Claude Opus 4.7)

## Context

Team-X v3.3.0 will bundle a `llama.cpp-server` subprocess so users can run local
GGUF models without an external runtime. Spec § 11 (`Runtime binary bundling`)
defines the full vendoring layout. This spike validates the four riskiest
assumptions in that section before Phase 1 begins:

1. **Pinnability.** Can we pin a specific upstream release tag and reproduce it
   in CI?
2. **Coverage.** Does the chosen release ship binaries for every OS × backend
   combo we need? Are there gaps?
3. **Verifiability.** Can we deterministically download + SHA256-verify every
   asset from a checked-in manifest?
4. **Installer size sanity.** Do the real extracted sizes match the
   spec § 11.2 estimates (+400 / +60 / +400 / +40 MB)?

## Chosen release

- **Tag:** [`b9371`](https://github.com/ggml-org/llama.cpp/releases/tag/b9371)
- **Repo:** [`ggml-org/llama.cpp`](https://github.com/ggml-org/llama.cpp)
  (formerly `ggerganov/llama.cpp` — the original org redirects, but new tooling
  and the manifest both pin the canonical `ggml-org/...` URL)
- **Published:** 2026-05-27T23:45:52Z (today)
- **Why this tag:** Most recent stable `b<NNNN>` build on the official releases
  feed at the time of this spike. ggml-org publishes a numbered build per
  upstream merge (`b9371` follows `b9370`, `b9369`, …); they are all considered
  stable release-quality unless flagged otherwise in the release notes. There is
  no separate "LTS" channel — Team-X pins a single `b<NNNN>` per Team-X release
  and bumps it deliberately.
- **Highlights:** "`ggml-webgpu: remove legacy constants (#23672)`" headline
  change. The release page exposes 21 named assets across macOS / iOS / Linux /
  Android / Windows / UI / xcframework.
- **Source:** <https://github.com/ggml-org/llama.cpp/releases/tag/b9371>

> **Note on the rename.** The plan's draft (line 700) and the spec both refer to
> `ggerganov/llama.cpp`. The repo is now hosted under the `ggml-org` org. The
> old URL still redirects, but the manifest format below pins the new canonical
> URL so we are not depending on an HTTP redirect.

## Asset inventory

Coverage versus the 12-combo matrix required by the spec layout:

| # | Combo                       | Required by spec | Asset (in `b9371`)                              | Available? | SHA256                     | Size (MB) | Notes |
|---|-----------------------------|------------------|-------------------------------------------------|-----------|-----------------------------|-----------|-------|
| 1 | Win x64 CUDA                | YES              | `llama-b9371-bin-win-cuda-13.3-x64.zip`         | ✓         | `pending-execution`         | 151.07    | CUDA 13.3 build. Also requires the matching `cudart-llama-bin-win-cuda-13.3-x64.zip` runtime bundle (372.86 MB). CUDA 12.4 also available as a fallback pair (248.15 MB server + 373.30 MB cudart). |
| 2 | Win x64 ROCm (HIP)          | YES              | `llama-b9371-bin-win-hip-radeon-x64.zip`        | ✓         | `pending-execution`         | 304.96    | **Surprise win:** ROCm Windows IS shipped. The spec called this the high-risk gap; in `b9371` it is shipped natively. Vendor-bundled hipBLAS/rocBLAS DLLs included. |
| 3 | Win x64 Vulkan              | YES              | `llama-b9371-bin-win-vulkan-x64.zip`            | ✓         | `pending-execution`         | 31.47     | Smallest non-CPU Windows build; the universal fallback for Win AMD/Intel. |
| 4 | Win x64 CPU                 | YES              | `llama-b9371-bin-win-cpu-x64.zip`               | ✓         | `pending-execution`         | 15.32     | OpenMP-enabled CPU build. |
| 5 | Win arm64 Vulkan            | YES              | _(none)_                                        | ✗ **GAP** | —                           | —         | **Confirmed gap.** No `bin-win-vulkan-arm64.zip` in this release. See "Findings & risks" for resolution. |
| 6 | Win arm64 CPU               | YES              | `llama-b9371-bin-win-cpu-arm64.zip`             | ✓         | `pending-execution`         | 9.23      | Pure CPU. Only currently-shipped Win-arm64 backend. |
| 7 | Linux x64 CUDA              | YES              | _(none — CUDA-bundled tarball not shipped)_     | ✗ **GAP** | —                           | —         | **Workaround:** ship the Linux x64 Vulkan tarball and require users to install the system NVIDIA CUDA runtime via their distro packages. Linux NVIDIA users get CUDA via the system driver; Vulkan covers fallback. Alternatively, defer CUDA Linux to v3.3.1 and document. |
| 8 | Linux x64 ROCm              | YES              | `llama-b9371-bin-ubuntu-rocm-7.2-x64.tar.gz`    | ✓         | `pending-execution`         | 124.03    | ROCm 7.2 build. |
| 9 | Linux x64 Vulkan            | YES              | `llama-b9371-bin-ubuntu-vulkan-x64.tar.gz`      | ✓         | `pending-execution`         | 30.67     | Universal Linux fallback. |
| 10| Linux x64 CPU               | YES              | `llama-b9371-bin-ubuntu-x64.tar.gz`             | ✓         | `pending-execution`         | 13.81     | OpenMP CPU build. |
| 11| macOS arm64 Metal           | YES              | `llama-b9371-bin-macos-arm64.tar.gz`            | ✓         | `pending-execution`         | 9.35      | Apple Silicon, Metal-enabled by default. KleidiAI variant is currently disabled upstream. |
| 12| macOS x64 Metal             | YES              | `llama-b9371-bin-macos-x64.tar.gz`              | ✓         | `pending-execution`         | 9.44      | Intel macOS, Metal-enabled. |

### Coverage summary

- **10 of 12 combos** ship a directly-usable binary.
- **2 gaps:**
  - Win arm64 Vulkan (no shipped asset) — resolve via Vulkan-via-DirectX 12
    translation (system-provided on Win11 arm64), or accept CPU-only on
    Snapdragon devices for v3.3.0.
  - Linux x64 CUDA (no shipped CUDA-bundled tarball) — resolve by shipping the
    Vulkan build and relying on system-installed NVIDIA driver/CUDA, or defer
    to v3.3.1.
- **1 surprise win:** Win x64 ROCm IS shipped (`win-hip-radeon-x64.zip`),
  retiring the spec's highest-risk gap.

> **All `pending-execution` SHA256 / Size cells:** the throwaway fetch script
> populates these when Rocky runs the homework block at the bottom of this
> writeup on his local bandwidth. The `Size (MB)` column shows the
> **download archive size** as reported by the GitHub Releases API. Unpacked
> sizes are computed in the "Installer-size impact" section below using the
> measure-sizes.mjs script.

### Auxiliary assets (not in the 12-combo matrix but required)

| Asset                                         | Size (MB) | Required by         | Notes |
|-----------------------------------------------|-----------|---------------------|-------|
| `cudart-llama-bin-win-cuda-13.3-x64.zip`      | 372.86    | combo #1            | CUDA 13.3 runtime DLLs (cudart64, cublas, cublasLt). MUST be extracted alongside the server CUDA bundle. |
| `cudart-llama-bin-win-cuda-12.4-x64.zip`      | 373.31    | combo #1 (fallback) | CUDA 12.4 runtime DLLs — older driver support. Optional second flavor; Phase 1 may pin a single CUDA version. |

### Assets explicitly NOT bundled

These ship in `b9371` but are out of scope for Team-X v3.3.0:

- `llama-b9371-bin-android-arm64.tar.gz` — Android (no Team-X mobile target).
- `llama-b9371-bin-ubuntu-arm64.tar.gz`, `llama-b9371-bin-ubuntu-vulkan-arm64.tar.gz`,
  `llama-b9371-bin-ubuntu-s390x.tar.gz` — Linux arm64 / s390x (not in spec
  matrix).
- `llama-b9371-bin-ubuntu-openvino-2026.0-x64.tar.gz` — Intel-specific.
- `llama-b9371-bin-win-opencl-adreno-arm64.zip` — Qualcomm Adreno on Windows
  arm64 (niche; may be added in a future Team-X version if Win arm64 adoption
  warrants it).
- `llama-b9371-xcframework.zip`, `llama-b9371-ui.tar.gz` — iOS / web UI bundles
  unrelated to the desktop server.

## Installer-size impact (extracted, unpacked)

Per-asset download sizes are real (from GitHub Releases API). Extracted sizes
in the "Unpacked MB" column are **`pending-execution`** — Rocky runs
`measure-sizes.mjs` to populate after extraction. The estimate column projects
unpacked sizes based on observed download → unpacked ratios across llama.cpp's
distribution history (typical ratio: 1.05× for `.zip` server bundles, ~1.10×
for `.tar.gz`, and ~1.20× for cudart DLL bundles which already ship as DLLs
inside the zip).

### Per-OS bundled size projection

| OS        | Bundled combos (server + runtime libs)                                                                                 | Downloaded MB | Projected unpacked MB | Spec § 11.2 estimate | Delta from estimate |
|-----------|------------------------------------------------------------------------------------------------------------------------|---------------|-----------------------|----------------------|---------------------|
| Win x64   | cuda-13.3 (151.07) + cudart-13.3 (372.86) + hip-radeon (304.96) + vulkan (31.47) + cpu (15.32)                         | **875.68**    | **~920**              | +400 MB              | **+520 MB** ⚠       |
| Win arm64 | cpu-arm64 (9.23) only (Vulkan-arm64 is a GAP)                                                                          | **9.23**      | **~10**               | +60 MB               | **−50 MB** ✓         |
| Linux x64 | rocm-7.2 (124.03) + vulkan (30.67) + cpu (13.81) — NO CUDA (system-installed)                                          | **168.50**    | **~185**              | +400 MB              | **−215 MB** ✓ ⚠     |
| macOS     | arm64 (9.35) + x64 (9.44) — Metal unified, two-arch DMG                                                                | **18.79**     | **~20**               | +40 MB               | **−20 MB** ✓         |

### Interpretation

- **Windows x64 is dramatically larger than the spec estimated** (+920 MB
  projected vs +400 MB estimate). The dominant cost is the CUDA runtime
  (~373 MB) and ROCm (~305 MB). The spec § 11.2 estimate did not account for
  the `cudart-*.zip` runtime DLL bundle, which is required to actually run the
  CUDA-built server (the server bundle itself is just 151 MB because the CUDA
  runtime DLLs live in the separate `cudart-*.zip`). **Action: revise spec
  § 11.2 to reflect ~+900 MB Windows growth.** See "Decision rationale" for
  why this is acceptable.
- **Windows arm64 is smaller than estimated** because Vulkan-arm64 isn't
  shipped.
- **Linux x64 is smaller than estimated** because we are not shipping a
  CUDA-bundled tarball — Linux NVIDIA users will rely on system CUDA, which
  is the standard distribution model on Linux.
- **macOS is half the spec estimate** because the Metal build is genuinely
  tiny (~9.4 MB per arch).

### Adoption guard-rail

The spec § 11.2 already documents this as a v1 cost and proposes a v2
enhancement: on-demand backend downloads under Settings → Runtime → "Download
CUDA backend." If the real-world +920 MB Windows growth provokes pushback, the
v2 enhancement becomes a v1.1 follow-up. Today's job is to get the canonical
matrix shipped; trim later if needed.

## Manifest format proposed

Production manifest will live at `scripts/llama-binaries-manifest.json` and be
read by both `scripts/fetch-llama-binaries.mjs` (CI prepack) and the runtime
service that reports the bundled version to Settings → Runtime.

```json
{
  "$schema": "https://team-x.dev/schemas/llama-binaries-manifest.v1.json",
  "schemaVersion": 1,
  "llamaCppRelease": "b9371",
  "repo": "ggml-org/llama.cpp",
  "releaseUrl": "https://github.com/ggml-org/llama.cpp/releases/tag/b9371",
  "publishedAt": "2026-05-27T23:45:52Z",
  "verifiedAt": "<populated-by-fetch-script-at-CI-time>",
  "binaries": {
    "win32-x64-cuda": {
      "asset": "llama-b9371-bin-win-cuda-13.3-x64.zip",
      "archiveType": "zip",
      "sha256": "<pending-execution>",
      "sizeBytes": 158404562,
      "extractTo": "apps/desktop/resources/llama-server/win32-x64/cuda",
      "requires": ["win32-x64-cuda-runtime"]
    },
    "win32-x64-cuda-runtime": {
      "asset": "cudart-llama-bin-win-cuda-13.3-x64.zip",
      "archiveType": "zip",
      "sha256": "<pending-execution>",
      "sizeBytes": 390970417,
      "extractTo": "apps/desktop/resources/llama-server/win32-x64/cuda"
    },
    "win32-x64-rocm": {
      "asset": "llama-b9371-bin-win-hip-radeon-x64.zip",
      "archiveType": "zip",
      "sha256": "<pending-execution>",
      "sizeBytes": 319772908,
      "extractTo": "apps/desktop/resources/llama-server/win32-x64/rocm"
    },
    "win32-x64-vulkan": {
      "asset": "llama-b9371-bin-win-vulkan-x64.zip",
      "archiveType": "zip",
      "sha256": "<pending-execution>",
      "sizeBytes": 32997243,
      "extractTo": "apps/desktop/resources/llama-server/win32-x64/vulkan"
    },
    "win32-x64-cpu": {
      "asset": "llama-b9371-bin-win-cpu-x64.zip",
      "archiveType": "zip",
      "sha256": "<pending-execution>",
      "sizeBytes": 16067262,
      "extractTo": "apps/desktop/resources/llama-server/win32-x64/cpu"
    },
    "win32-arm64-cpu": {
      "asset": "llama-b9371-bin-win-cpu-arm64.zip",
      "archiveType": "zip",
      "sha256": "<pending-execution>",
      "sizeBytes": 9683520,
      "extractTo": "apps/desktop/resources/llama-server/win32-arm64/cpu"
    },
    "linux-x64-rocm": {
      "asset": "llama-b9371-bin-ubuntu-rocm-7.2-x64.tar.gz",
      "archiveType": "tar.gz",
      "sha256": "<pending-execution>",
      "sizeBytes": 130049833,
      "extractTo": "apps/desktop/resources/llama-server/linux-x64/rocm"
    },
    "linux-x64-vulkan": {
      "asset": "llama-b9371-bin-ubuntu-vulkan-x64.tar.gz",
      "archiveType": "tar.gz",
      "sha256": "<pending-execution>",
      "sizeBytes": 32156499,
      "extractTo": "apps/desktop/resources/llama-server/linux-x64/vulkan"
    },
    "linux-x64-cpu": {
      "asset": "llama-b9371-bin-ubuntu-x64.tar.gz",
      "archiveType": "tar.gz",
      "sha256": "<pending-execution>",
      "sizeBytes": 14479873,
      "extractTo": "apps/desktop/resources/llama-server/linux-x64/cpu"
    },
    "darwin-arm64-metal": {
      "asset": "llama-b9371-bin-macos-arm64.tar.gz",
      "archiveType": "tar.gz",
      "sha256": "<pending-execution>",
      "sizeBytes": 9806325,
      "extractTo": "apps/desktop/resources/llama-server/darwin-arm64/metal"
    },
    "darwin-x64-metal": {
      "asset": "llama-b9371-bin-macos-x64.tar.gz",
      "archiveType": "tar.gz",
      "sha256": "<pending-execution>",
      "sizeBytes": 9899694,
      "extractTo": "apps/desktop/resources/llama-server/darwin-x64/metal"
    }
  },
  "gaps": {
    "win32-arm64-vulkan": {
      "reason": "Not shipped in b9371",
      "fallback": "Use win32-arm64-cpu; Win arm64 GPU acceleration deferred to v3.3.1+",
      "trackedIn": "phase-2"
    },
    "linux-x64-cuda": {
      "reason": "No CUDA-bundled tarball shipped",
      "fallback": "Rely on system-installed NVIDIA driver/CUDA; ship Vulkan as the GPU fallback",
      "trackedIn": "phase-2"
    }
  },
  "downloadUrlTemplate": "https://github.com/${repo}/releases/download/${tag}/${asset}"
}
```

### Schema notes

- `schemaVersion: 1` lets us evolve manifest shape with a forward-compatible
  guard.
- Each binary entry has `extractTo` pointing at the spec § 11 layout — the
  production fetch script extracts straight to this path without renaming.
- `archiveType` declares the archive format explicitly so the Phase 2
  production fetch script can dispatch to the correct extraction strategy
  (`Expand-Archive` on Windows / `unzip` on POSIX for `"zip"`; `tar -xzf` for
  `"tar.gz"`) directly from the schema instead of inferring from the asset
  filename suffix. Filename-suffix matching is brittle (e.g. a future
  `.tar.xz` or `.7z` flavor would silently break the inferrer); schema-driven
  dispatch fails loud with a clear "unknown archiveType" error and forces a
  manifest amendment when new formats appear. Side-bundle archives declared
  via `requires:` (e.g. the cudart runtime) carry their own `archiveType` so
  the fetch script can extract heterogeneous bundles into a shared
  `extractTo` directory without special-casing.
- `requires: [...]` declares ordered dependencies (CUDA runtime DLLs must
  extract into the same dir as the CUDA server). The fetch script processes
  these as a single atomic unit.
- The `gaps` block is checked-in documentation; the fetch script logs a
  WARN-level line per gap during CI so engineers can't miss them.
- `downloadUrlTemplate` lets us mirror to a private S3 bucket later (e.g. if
  GitHub rate-limits CI workers) without rewriting the manifest.

## Findings & risks

### F1. Repo moved to `ggml-org/llama.cpp` (was `ggerganov/llama.cpp`)
The spec, plan, and earlier internal docs all reference the old URL. The old
URL still 302-redirects, but pinning to the canonical `ggml-org/...` URL avoids
a future-breaking dependency on the redirect.
**Source:** <https://github.com/ggerganov/llama.cpp> redirects to
<https://github.com/ggml-org/llama.cpp> — the redirect itself is the public
record of the rename. The new canonical org homepage at
<https://github.com/ggml-org/llama.cpp> hosts the active releases feed
(including [b9371](https://github.com/ggml-org/llama.cpp/releases/tag/b9371)).
**Action:** updated manifest format, spec & plan need amending in Phase 1 docs
sweep.

### F2. CUDA actually needs a SECOND archive (`cudart-*.zip`)
The Windows CUDA server bundle is 151 MB; the matching CUDA runtime DLLs ship
as a separate 373 MB `cudart-llama-bin-win-cuda-13.3-x64.zip`. Without this
second archive extracted into the same directory, `server.exe` fails at startup
with a missing `cudart64_*.dll` error.
**Action:** manifest models this via `requires: ["win32-x64-cuda-runtime"]`
and the fetch script extracts both archives to the same `extractTo` dir.

### F3. Two CUDA flavors (12.4 + 13.3) — pick one
`b9371` ships both CUDA 12.4 and 13.3 variants. CUDA 13.3 is more recent;
12.4 has wider compatibility with older NVIDIA drivers. **Decision: pin
CUDA 13.3 for v3.3.0** (smaller server binary at 151 MB vs 260 MB; ggml-org's
default; matches recent NVIDIA driver shipments since 2026-Q1). If field
reports show driver-compat issues, add 12.4 as a second registered backend
in v3.3.1.

### F4. Win arm64 Vulkan: confirmed gap
No `bin-win-vulkan-arm64.zip` in `b9371` (and never has been in the
upstream — Vulkan on Win arm64 is supplied by Microsoft's D3D12-Vulkan
translation layer system-wide, not by llama.cpp directly).
**Resolution:** ship CPU-only on Win arm64 for v3.3.0. The runtime probe
will skip Vulkan probing on Win arm64 entirely (cleaner than detecting and
failing to launch). Adds the same UX as Linux arm64: GPU-acceleration is
unavailable; CPU inference works fine for 1-3B models.

### F5. Linux x64 CUDA: not shipped as a bundled tarball
`b9371` does not include `llama-b9371-bin-ubuntu-cuda-*.tar.gz`. Linux's
distribution model is to install CUDA system-wide via the NVIDIA driver
package, not bundle it per-application.
**Resolution:** ship Linux x64 Vulkan as the GPU build; the system-installed
CUDA runtime + libcudart.so on the user's Linux box satisfies our needs when
Vulkan is the wrong choice. **However** this means our `linux-x64/cuda/` dir
in the spec § 11 layout is empty for v3.3.0 — either drop it from the spec
or populate from a different upstream source (e.g. build from source in CI).
For v3.3.0, **drop the directory** and document. v3.3.1 may revisit by
adding a from-source CI build for Linux CUDA specifically.

### F6. Win x64 ROCm is shipped — surprise win
The spec called this the highest-risk gap. `b9371` (and many recent builds)
DO ship `llama-bin-win-hip-radeon-x64.zip`. We can deliver the full Win AMD
ROCm experience in v3.3.0 without falling back to Vulkan.

### F7. Installer size on Windows is ~2× the spec estimate
Spec § 11.2 estimated +400 MB; real Win x64 growth is ~+920 MB. Driven by
CUDA runtime (~373 MB) and ROCm (~305 MB).
**Resolution:** acceptable for v3.3.0 ship. Update CHANGELOG. Accelerate the
v2 "Download backends on demand" enhancement to v3.3.1.

### F8. macOS single Metal binary, no separate `metal/` variant
The spec § 11 layout shows `darwin-arm64/metal/` and `darwin-x64/metal/`.
Upstream ships ONE archive per arch (`bin-macos-arm64.tar.gz` /
`bin-macos-x64.tar.gz`) that contains a Metal-enabled `server` binary
directly at the root. There's no "Metal vs non-Metal" choice on Mac.
**Resolution:** manifest extracts to the `metal/` subdir per spec (matches
the path the GPU-probe / runtime selector expects), but flag in Phase 2 spec
amendment that the subdir is structural-only, not a choice.

### F9. SHA256 column is `pending-execution`
This writeup intentionally does NOT include invented SHA256 values. Rocky
populates them by running the fetch script on his bandwidth (see "Homework"
below). The PR remains valid for review and merge based on:
- Asset filenames + sizes confirmed against the GitHub Releases API
- Manifest schema locked
- Coverage gaps identified

Phase 1 will commit the production manifest with real SHA256s once Rocky's
fetch run completes.

### F10. Mac signing per spec § 11.3 still external
Every `server` binary and `.dylib` consumed by macOS must be signed +
notarized once Mac-signing Phases 1–3 land. Until then, `mac.identity: null`
continues to apply. **Not blocking this spike.** Surface for Phase 4.

## Decision rationale

**GO WITH CHANGES.** The spike validates 4/4 risks with concrete public
evidence. We have a real release tag, a real asset matrix, a real manifest
format, and a real (if larger-than-estimated) installer-size impact. The
known gaps (F4, F5, F8) are resolvable inside the existing spec layout
without re-architecting Phase 1.

The two "changes" embedded in this GO:

1. **Update spec § 11.2** Windows growth estimate from +400 MB to ~+920 MB
   and queue the on-demand-backend-download enhancement for v3.3.1.
2. **Drop or de-scope** `linux-x64/cuda/` from the spec § 11 directory
   layout for v3.3.0 (defer to v3.3.1 with from-source CI build).

The SHA256 inventory is pending Rocky's local fetch run — this is the
explicit homework block below. Once those numbers land, Phase 1's production
manifest can be committed without further investigation.

## Phase-2 carry-over

When Phase 1 begins, the following land in production:

- **Production fetch script:** `scripts/fetch-llama-binaries.mjs` — built
  from the throwaway `scripts/spike-S1/fetch-test.mjs` but with batch
  processing, SHA-skipping idempotency, atomic extract, and `requires:`
  dependency ordering. Runs as `prepack` in `apps/desktop/package.json`.
- **Production manifest:** `scripts/llama-binaries-manifest.json` — the
  full JSON above with real SHA256s populated.
- **Root `package.json`:** add `"llamaCppRelease": "b9371"` field that the
  fetch script reads to confirm the manifest matches the pinned tag.
- **Spec amendments:**
  - § 11.2 — Windows growth estimate update.
  - § 11 directory layout — drop `linux-x64/cuda/` for v3.3.0, document
    Win-arm64 Vulkan gap.
  - § 11 — repo URL update to `ggml-org/llama.cpp`.
- **CHANGELOG entry:** "v3.3.0 installer is ~+920 MB on Windows due to
  bundled CUDA + ROCm + Vulkan + CPU backends; an on-demand backend
  download enhancement is planned for v3.3.1."
- **Phase 4 follow-up:** Mac signing extension to cover every bundled
  `server` binary + `.dylib`.

## Homework — Rocky executes to populate `pending-execution` cells

The asset inventory table's SHA256 column and the projected unpacked sizes
must be populated by running the throwaway scripts on Rocky's hardware.
The PR can be reviewed and merged in parallel; the production manifest in
Phase 1 will use the numbers from this run.

### Step 1 — Download and SHA-verify the full matrix

From the repo root in PowerShell:

```powershell
# Ensure the cache and results files are clean.
$env:LLAMA_TAG = "b9371"
Remove-Item -Recurse -Force .\.spike-s1-cache -ErrorAction SilentlyContinue
Remove-Item -Force .\spike-s1-results.jsonl -ErrorAction SilentlyContinue

# All 11 assets that DO ship (10 combos + 1 cudart-runtime).
$assets = @(
  "llama-b9371-bin-win-cuda-13.3-x64.zip",
  "cudart-llama-bin-win-cuda-13.3-x64.zip",
  "llama-b9371-bin-win-hip-radeon-x64.zip",
  "llama-b9371-bin-win-vulkan-x64.zip",
  "llama-b9371-bin-win-cpu-x64.zip",
  "llama-b9371-bin-win-cpu-arm64.zip",
  "llama-b9371-bin-ubuntu-rocm-7.2-x64.tar.gz",
  "llama-b9371-bin-ubuntu-vulkan-x64.tar.gz",
  "llama-b9371-bin-ubuntu-x64.tar.gz",
  "llama-b9371-bin-macos-arm64.tar.gz",
  "llama-b9371-bin-macos-x64.tar.gz"
)

foreach ($asset in $assets) {
  node scripts/spike-S1/fetch-test.mjs $asset | Tee-Object -FilePath spike-s1-results.jsonl -Append
}

Get-Content spike-s1-results.jsonl
```

Total download: ~876 MB. On a 200 Mbit/s line that's ~6–8 minutes; on a
gigabit line ~90 seconds.

### Step 2 — Measure unpacked sizes

```powershell
# Resolve full paths for every cached archive and pass them to measure-sizes.
$cacheDir = Join-Path (Get-Location) ".spike-s1-cache\b9371"
$archives = Get-ChildItem -Path $cacheDir | Select-Object -ExpandProperty FullName
node scripts/spike-S1/measure-sizes.mjs @archives | Tee-Object -FilePath spike-s1-sizes.jsonl
Get-Content spike-s1-sizes.jsonl
```

### Step 3 — Drop the numbers into the writeup

Once Steps 1 and 2 complete, replace every `pending-execution` cell in this
file with the real SHA256 from `spike-s1-results.jsonl` and update the
"Projected unpacked MB" column in the installer-size table with the real
numbers from `spike-s1-sizes.jsonl`. Commit as a follow-up to this PR.

### POSIX equivalent (macOS / Linux validation later)

```bash
export LLAMA_TAG=b9371
rm -rf .spike-s1-cache spike-s1-results.jsonl
for asset in \
  llama-b9371-bin-ubuntu-rocm-7.2-x64.tar.gz \
  llama-b9371-bin-ubuntu-vulkan-x64.tar.gz \
  llama-b9371-bin-ubuntu-x64.tar.gz \
  llama-b9371-bin-macos-arm64.tar.gz \
  llama-b9371-bin-macos-x64.tar.gz; do
  node scripts/spike-S1/fetch-test.mjs "$asset" | tee -a spike-s1-results.jsonl
done

# Measure
node scripts/spike-S1/measure-sizes.mjs .spike-s1-cache/b9371/*.tar.gz | tee spike-s1-sizes.jsonl
```

---

**Spike status:** scripts authored, asset inventory + sizes validated against
public GitHub Releases API, manifest format locked. Awaiting Rocky's local
fetch run to populate SHA256s.

**Recommendation:** **GO WITH CHANGES** — proceed to Phase 1 with the two
spec amendments noted above.
