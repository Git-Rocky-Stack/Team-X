# Spike S2 — Hardware capture runbook

**For:** Rocky Elsalaymeh
**Branch:** `spike/v3.3.0-S2-gpu-probe`
**Status:** awaiting hardware captures

This runbook is the manual step Claude couldn't do on its own. The autonomous
work — synthetic fixtures, parsers, smoke test, writeup skeleton, runbook —
has already shipped on this branch. **Your job is to run the commands below
on each rig you have available and drop the raw output into
`docs/spikes/S2-fixtures/<platform>-<vendor>/`.** The parsers already work
against synthetic fixtures; running them against your real captures is the
last validation step before the writeup flips from `<!-- HARDWARE-AWAITING -->`
to `Decision: GO`.

You do not need every rig. **Windows is the highest-value capture** (your
primary dev box; matches the v3.3.0 Phase 1 launch target). Mac and Linux
are nice-to-have for cross-platform validation but are not blocking
Phase 1 — synthetic fixtures cover them in the meantime.

---

## Pre-flight (run once, any platform)

```bash
git checkout spike/v3.3.0-S2-gpu-probe
git pull --ff-only
```

Verify the smoke test is green BEFORE you start adding real captures — that
way if anything goes red afterwards, you know it's your real-rig output
that broke the parser, not pre-existing parser drift:

```bash
node scripts/spike-S2/smoke-test.mjs
```

Expected: all 4 cases PASS. If anything is RED, stop and ping Claude.

---

## Windows (your primary GPU rig)

Open **PowerShell 7** in the repo root. Run the block below verbatim — do not
edit. The four commands write four fixture files under
`docs/spikes/S2-fixtures/windows-nvidia/`.

```powershell
# 1. Make the target dir.
New-Item -ItemType Directory -Force -Path docs/spikes/S2-fixtures/windows-nvidia | Out-Null

# 2. nvidia-smi CSV (the canonical NVIDIA inventory probe).
nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap --format=csv,noheader `
  | Out-File -Encoding utf8 docs/spikes/S2-fixtures/windows-nvidia/nvidia-smi.txt

# 3. nvidia-smi -L (cross-check + UUID extraction).
nvidia-smi -L | Out-File -Encoding utf8 docs/spikes/S2-fixtures/windows-nvidia/nvidia-smi-list.txt

# 4. vulkaninfo --summary (cross-vendor fallback probe). May exit non-zero if
#    Vulkan-tools isn't installed — that's fine, parser handles missing files.
vulkaninfo --summary 2>$null `
  | Out-File -Encoding utf8 docs/spikes/S2-fixtures/windows-nvidia/vulkaninfo.txt
```

### What if a tool isn't installed?

| Tool | If missing | What to do |
|---|---|---|
| `nvidia-smi` | NVIDIA driver not installed | **Stop and reinstall** — every NVIDIA GPU driver ships nvidia-smi. If you don't have one, you don't have an NVIDIA card on this box. Skip the Windows capture entirely. |
| `vulkaninfo` | Vulkan SDK / vulkan-tools not installed | Install [Vulkan SDK](https://www.lunarg.com/vulkan-sdk/) and re-run. If you'd rather not, leave the file empty (`echo > .../vulkaninfo.txt`) — the parser treats absent fixtures as "Vulkan backend not detectable on this rig" and the smoke test will still pass against synthetic for that backend. |

### If you have an AMD GPU on a separate Windows rig

Add a `windows-amd/` directory and run the same `vulkaninfo --summary`
capture into it. On Windows, AMD's ROCm/HIP exposure is via the
`llama-bin-win-hip-radeon-x64.zip` distribution (see S1 writeup F6); the
**system** does not ship a Windows `rocminfo` equivalent. Vulkan is the only
discoverable AMD probe on Windows. That's expected and intentional.

```powershell
New-Item -ItemType Directory -Force -Path docs/spikes/S2-fixtures/windows-amd | Out-Null
vulkaninfo --summary 2>$null `
  | Out-File -Encoding utf8 docs/spikes/S2-fixtures/windows-amd/vulkaninfo.txt
```

---

## macOS (if you have a Mac available)

Open **Terminal** (zsh) in the repo root.

```bash
# 1. Make the target dir.
mkdir -p docs/spikes/S2-fixtures/macos-arm64

# 2. Plain-text — human-readable, brittle to whitespace reformats.
system_profiler SPDisplaysDataType \
  > docs/spikes/S2-fixtures/macos-arm64/system_profiler.txt

# 3. XML/plist — typed, robust. The Phase 2 production probe prefers this
#    format; the parser already supports both.
system_profiler -xml SPDisplaysDataType \
  > docs/spikes/S2-fixtures/macos-arm64/system_profiler-xml.plist

# 4. Bonus: hardware data type — needed by Phase 2 to apportion unified
#    memory between CPU and GPU work. Not consumed by this spike, but cheap
#    to capture here.
system_profiler SPHardwareDataType \
  > docs/spikes/S2-fixtures/macos-arm64/system_profiler-hardware.txt
```

### Intel Mac with discrete graphics?

Run the exact same commands. The fixture filename stays the same
(`system_profiler.txt`) but the content will include a `VRAM (Total): N GB`
line that the parser reads (see `parseVramValue` in `probe-mac.mjs`).
Apple Silicon does not emit that line because of unified memory.

---

## Linux (NVIDIA / AMD ROCm)

Open **bash** in the repo root.

### Linux NVIDIA

```bash
mkdir -p docs/spikes/S2-fixtures/linux-nvidia

nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap --format=csv,noheader \
  > docs/spikes/S2-fixtures/linux-nvidia/nvidia-smi.txt

nvidia-smi -L \
  > docs/spikes/S2-fixtures/linux-nvidia/nvidia-smi-list.txt

vulkaninfo --summary 2>/dev/null \
  > docs/spikes/S2-fixtures/linux-nvidia/vulkaninfo.txt
```

### Linux AMD ROCm

```bash
mkdir -p docs/spikes/S2-fixtures/linux-amd

# rocminfo is part of the rocm-utils package (Ubuntu/Debian) or rocminfo
# package (Arch). If apt/dnf/pacman doesn't have it, install ROCm per:
#   https://rocm.docs.amd.com/projects/install-on-linux/en/latest/
rocminfo > docs/spikes/S2-fixtures/linux-amd/rocminfo.txt 2>&1

vulkaninfo --summary 2>/dev/null \
  > docs/spikes/S2-fixtures/linux-amd/vulkaninfo.txt
```

### No native Linux GPU rig?

Two acceptable substitutes:
1. **WSL2 with NVIDIA driver pass-through** — same commands, same fixture
   paths. Drop the captures under `linux-nvidia/` (they're real Linux output;
   `windows-nvidia/` is for native Windows nvidia-smi.exe).
2. **Skip Linux for v3.3.0.** Synthetic fixtures already cover the parser
   shape. Real Linux captures arrive whenever a Linux rig is available; not
   a Phase 1 blocker.

---

## Validation

After each capture, re-run the smoke test:

```bash
node scripts/spike-S2/smoke-test.mjs
```

What you should see:

- **Each case PASS, with realistic device counts.** Your Windows machine
  with 1× RTX 4090 should produce `windows-nvidia  PASS  cuda=1 vulkan=1`.
- **vramMb non-zero for CUDA / ROCm** (cuda value from `memory.total` MiB;
  rocm value from the GLOBAL+COARSE GRAINED pool size). vramMb=0 for Vulkan
  and Metal is expected — see writeup Findings F1 / F4.

If a case goes RED:

1. Read the `└─` failure line under the case.
2. Open the fixture you just captured and compare against the synthetic
   counterpart in `_synthetic/`. The most common breakage is a
   **format-version drift** (e.g. vulkaninfo `--summary` changed since
   1.3.224; older tools dump full deviceProperties — see writeup F2). If
   you see a "no GPU stanzas found" failure on Vulkan, your vulkan-tools is
   < 1.3.224 — install the newer SDK and re-capture.
3. Open `scripts/spike-S2/probe-<platform>.mjs` and run the parser
   directly against the offending fixture file (each script has a CLI
   mode):
   ```bash
   node scripts/spike-S2/probe-windows.mjs docs/spikes/S2-fixtures/windows-nvidia
   ```
   The full JSON dump will show you which field came back empty or
   malformed.
4. Patch the parser (or amend the writeup with a new Findings entry if the
   format drift is a real-world signal we need to record), then re-run
   the smoke test.

---

## When you're done

Stage and commit the real fixtures:

```bash
git add docs/spikes/S2-fixtures/windows-nvidia
git add docs/spikes/S2-fixtures/macos-arm64    # if applicable
git add docs/spikes/S2-fixtures/linux-nvidia   # if applicable
git add docs/spikes/S2-fixtures/linux-amd      # if applicable

git commit -m "$(cat <<'EOF'
docs(spike-S2): Rocky's real hardware captures — <platforms>

Replaces the synthetic fixtures with verbatim captures from real rigs.
Smoke test passes against all captured platforms. Writeup
HARDWARE-AWAITING placeholders resolved.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

Then open `docs/spikes/2026-05-27-S2-gpu-probe-cross-platform.md` and:

- Fill in the "Hardware tested" section with your actual GPU model + driver.
- Replace each `<!-- HARDWARE-AWAITING -->` cell with the real measurement.
- Flip the Decision banner from `GO WITH CHANGES (awaiting hardware)` to
  `GO`.

That's the spike done.
