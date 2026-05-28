# Phase 0 hardware-capture handoff — 2026-05-28

> **Audience:** the next Claude Code session, running on Rocky's new multi-GPU workstation.
> **Predecessor session:** the laptop session that closed at 2026-05-28T09:50Z with all subagent-driveable Phase 0 work landed. This doc tells you exactly where to pick up.
> **Repo:** `Git-Rocky-Stack/Team-X` · branch `main` at `357f0ee` · two spike PRs open (`#8`, `#9`).

---

## 1 · TL;DR — one paragraph

Five Phase 0 spikes (S1-S5) of the Team-X v3.3.0 Local GGUF Support plan are code-complete. **S1, S3, S5 are merged** to `main`. **S2 (GPU probe) and S4 (llama-server lifecycle) are open as PRs `#8` and `#9` with the `awaiting-hardware` label.** Their autonomous scaffolding (probe parsers, lifecycle harness, synthetic fixtures, writeups, runbooks) is shipped; the only blocker is **live hardware capture on Rocky's new multi-GPU rig** — the exact thing the previous session couldn't do from a laptop. Your job: run the two hardware runbooks, push the captured fixtures + measurements to PRs `#8` and `#9`, update the `<!-- HARDWARE-AWAITING -->` cells in both writeups with real numbers, render a GO / GO-WITH-CHANGES / NO-GO verdict on each, and merge. After both merge, Phase 0 exits and **Phase 1 (Foundation) unblocks**.

---

## 2 · Where things sit — concrete state

### Merged to `main`

| Spike | PR | Merge SHA | Decision recorded |
|---|---|---|---|
| S1 — llama.cpp binary fetch | `#5` | `31b98cd` | GO WITH CHANGES (tag `b9371`; ship 10/12 combos; surprise win on Windows ROCm) |
| S3 — GGUF metadata parser | `#6` | `4bfd195` | GO WITH CHANGES (library = `@huggingface/gguf` 0.4.2; collapse `gguf-parse-failed` → `gguf-corrupt`) |
| S5 — Hugging Face API client | `#7` | `357f0ee` | GO WITH CHANGES (anonymous-sufficient; typed 401/403 errors; canonical TinyLlama URL fix) |

### Open PRs (your work)

| Spike | PR | Head SHA | Status | Where the work lives |
|---|---|---|---|---|
| **S2 — GPU probe** | [`#8`](https://github.com/Git-Rocky-Stack/Team-X/pull/8) | `8a82585` | code-complete, CI all-green, `awaiting-hardware` | branch `spike/v3.3.0-S2-gpu-probe` |
| **S4 — llama-server lifecycle** | [`#9`](https://github.com/Git-Rocky-Stack/Team-X/pull/9) | `a5cb552` | code-complete, CI just kicked off when handoff was written, `awaiting-hardware` | branch `spike/v3.3.0-S4-server-lifecycle` |

Both PRs branched off `357f0ee` and DO NOT conflict with each other except for a trivial alphabetical `.gitignore` ordering — see §6.4.

### Plan files

- **Master plan:** `docs/superpowers/plans/2026-05-27-local-gguf-support.md` (1522 lines, committed at `cb54912`).
- **Per-phase plans (11 files):** `docs/superpowers/plans/2026-05-27-local-gguf-support/phase-01-foundation.md` ... `phase-11-docs-a11y-beta.md`.
- **The S2 spec:** master plan lines `906-1024`.
- **The S4 spec:** master plan lines `1160-1326`.

### Tasks

The previous session ran TaskCreate/TaskUpdate for tasks `#1`-`#30`. After this handoff, the only PENDING tasks are:

- `#6` Phase 1 — Foundation (blocked on Phase 0 exit)
- `#7` Phases 2-11 placeholder tracking

The TaskList state will likely be carried into the new session by the harness. If it isn't, the canonical reference for what's done is the merged PR history + this handoff. **Do not re-run S2 or S4 scaffolding; just do the hardware capture.**

---

## 3 · First commands in the new session

```bash
# 1. Confirm location + clean tree
cd /path/to/Team-X     # the GPU workstation's checkout
git status
git fetch origin
git checkout main && git pull --ff-only

# 2. Verify both PR branches exist locally
git fetch origin spike/v3.3.0-S2-gpu-probe spike/v3.3.0-S4-server-lifecycle
git branch --list 'spike/v3.3.0-S*'

# 3. gh CLI sanity check
gh auth status
gh pr list --label awaiting-hardware
# expected: PRs #8 (S2) and #9 (S4) both visible
```

### Toolchain prerequisites

| Tool | Version | Why |
|---|---|---|
| Node | ≥ 22.13 (recommend 24.x) | repo `engines.node` constraint; both probe + lifecycle scripts use ESM + `node:test`-style imports |
| pnpm | 9.15.9 (project baseline) | `corepack enable && corepack prepare pnpm@9.15.9 --activate` |
| Git | any modern | branches use `--force-with-lease` discipline |
| gh CLI | latest, authed | for `gh pr view`, `gh pr edit`, label management |
| Disk free | ≥ 1.5 GB | S4 downloads a 638.8 MiB GGUF + ~50 MiB CPU llama-server binary |
| Vendor tools | per-platform | `nvidia-smi`, `vulkaninfo`, `rocminfo`, `system_profiler` — see §4 |

> **Windows-only PATH gotcha** (carried from prior session): if `node --version` reports `v20.x` instead of `v22+`, an old `nodejs-lts` install is shadowing the system one. Override:
> ```powershell
> $env:Path = "C:\Program Files\nodejs;" + ($env:Path -split ';' | Where-Object { $_ -notmatch 'nodejs-lts' } | Join-String -Separator ';')
> ```
> If `pnpm` still resolves wrong Node, invoke biome directly:
> ```powershell
> & "C:\Program Files\nodejs\node.exe" node_modules/@biomejs/biome/bin/biome check .
> ```

---

## 4 · S2 hardware capture — exact flow

### 4.1 Switch to the S2 branch

```bash
git checkout spike/v3.3.0-S2-gpu-probe
git pull --ff-only       # in case Rocky pushed anything since handoff
```

### 4.2 Run the runbook

The canonical runbook is `docs/spikes/S2-hardware-runbook.md`. **Read it first** — it has per-platform PowerShell + Bash blocks with the exact commands. The summary:

| Platform | Tools to run | Target fixture dir |
|---|---|---|
| **Windows + NVIDIA** | `nvidia-smi --query-gpu=...`, `nvidia-smi -L`, `vulkaninfo --summary` | `docs/spikes/S2-fixtures/windows-nvidia/` |
| **Windows + AMD** (if you have one) | `vulkaninfo --summary` (Windows AMD uses Vulkan, not ROCm) | `docs/spikes/S2-fixtures/windows-amd/` |
| **Linux + NVIDIA** | `nvidia-smi`, `vulkaninfo --summary` | `docs/spikes/S2-fixtures/linux-nvidia/` |
| **Linux + AMD** | `rocminfo`, `vulkaninfo --summary` | `docs/spikes/S2-fixtures/linux-amd/` |
| **macOS arm64** | `system_profiler SPDisplaysDataType` + `system_profiler SPDisplaysDataType -xml` | `docs/spikes/S2-fixtures/macos-arm64/` |

> **Important:** the synthetic fixtures live under `docs/spikes/S2-fixtures/_synthetic/`. Do NOT overwrite those. Real captures go into the non-`_synthetic` siblings.

### 4.3 Validate the captures

After the runbook outputs land:

```bash
# Re-run smoke test against the captured fixtures. The smoke test takes a
# fixture-dir argument; the runbook walks you through pointing it at each
# real platform dir.
node scripts/spike-S2/smoke-test.mjs
# expected: 4/4 cases pass (synthetic), real-capture validation steps follow
# the same per-platform invocation pattern that the runbook documents.
```

If the smoke test fails on real captures, the parser likely needs adjustment — record it in the writeup's "Shape adjustments to GpuInventory" section. **Don't paper over parse failures** — Rocky's directive: maximum effort, no half-measures.

### 4.4 Update the writeup

Open `docs/spikes/2026-05-27-S2-gpu-probe-cross-platform.md` and:

1. Search for `<!-- HARDWARE-AWAITING -->` markers (there are exactly 7) — replace each with real measurements / observations.
2. **§ Hardware tested** — fill in actual GPU model + driver + OS for each rig you ran.
3. **§ Parser confidence per command** — adjust the "edge cases observed" column with anything you found on real captures.
4. **§ Shape adjustments to GpuInventory** — if the 10 proposed shape extensions held up, keep them; if any were unnecessary or any new ones surfaced, edit the list.
5. **§ Decision rationale** — update the top-of-doc decision banner: **GO**, **GO WITH CHANGES**, or **NO-GO**.

### 4.5 Push to PR #8

```bash
git add docs/spikes/S2-fixtures/ docs/spikes/2026-05-27-S2-gpu-probe-cross-platform.md
git commit -m "spike(S2): land hardware captures from <rig description>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin spike/v3.3.0-S2-gpu-probe
```

CI re-runs automatically. If it passes and the verdict is GO or GO-WITH-CHANGES, merge:

```bash
gh pr merge 8 --merge --delete-branch
```

---

## 5 · S4 hardware capture — exact flow

### 5.1 Switch to the S4 branch

```bash
git checkout main && git pull --ff-only        # ensure S2 (if merged) is on main
git checkout spike/v3.3.0-S4-server-lifecycle
git pull --ff-only

# If S2 PR #8 has already merged to main between sessions, this branch's
# .gitignore needs a one-line rebase to insert `.spike-s2-cache/` in alpha
# order. See §6.4 for the trivial resolution.
git rebase origin/main         # only if S2 has merged
```

### 5.2 Run the runbook

The canonical runbook is `docs/spikes/S4-hardware-runbook.md`. Summary:

**Step 1 — Download the model.** The runbook commits to this exact URL (HEAD-verified by the predecessor session):

```
https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
```

638.8 MiB · ETag/SHA256 = `015c9bb0376d9c3c9dab434ecb3bd57961dce1921a5b1bf134c6f1b824c25c8d`.

Save to `.spike-s4-cache/tinyllama.gguf` (the directory is gitignored).

**Step 2 — Acquire the CPU `llama-server` binary.** Per S1's pin: tag `b9371`, the CPU build for your platform. The S1 writeup at `docs/spikes/2026-05-27-S1-llama-binary-fetch.md` § "Asset shape" lists the exact release-asset URL. Extract to `.spike-s4-bin/`.

**Step 3 — Run the lifecycle harness.** The runbook's PowerShell + Bash blocks give you:

```bash
node scripts/spike-S4/lifecycle-test.mjs \
  --binary ./.spike-s4-bin/llama-server \
  --model ./.spike-s4-cache/tinyllama.gguf \
  --phase all \
  --report ./.spike-s4-cache/report.json
```

Phases:
- `happy` — port allocation → spawn → ready-detect → `/v1/chat/completions` → `/v1/embeddings` → SIGTERM → port-release verify.
- `F1` bogus model path.
- `F2` port collision.
- `F3` `n_ctx` overflow.

`--phase all` runs the whole sequence. Repeat once per backend the multi-GPU rig supports (CPU is baseline; CUDA and/or ROCm if applicable — pass `--n-gpu-layers 99` to push everything onto GPU). **Don't skip any phase** — the writeup table needs measurements for all four.

### 5.3 Capture the JSON report

`./.spike-s4-cache/report.json` is the structured output. It's gitignored by design; copy the values into the writeup, don't commit the raw file.

### 5.4 Update the writeup

`docs/spikes/2026-05-27-S4-llama-server-lifecycle.md`:

1. Search for `<!-- HARDWARE-AWAITING -->` markers (27 of them) — replace with real numbers.
2. **§ Lifecycle observations** — populate the spawn / ready / chat / embeddings / shutdown / port-release rows for each backend you tested.
3. **§ Failure modes observed** — confirm each of F1/F2/F3 behaved as predicted; record any divergence.
4. **§ Decision rationale** — update the top-of-doc banner: **GO**, **GO WITH CHANGES**, or **NO-GO**.

### 5.5 Push to PR #9

```bash
git add docs/spikes/2026-05-27-S4-llama-server-lifecycle.md
git commit -m "spike(S4): land hardware captures from <rig description>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin spike/v3.3.0-S4-server-lifecycle
gh pr merge 9 --merge --delete-branch
```

---

## 6 · Notes, gotchas, decisions

### 6.1 Verdict semantics

- **GO** — spike's claims hold up on real hardware with zero spec changes needed. Rare; spec is usually a touch off.
- **GO WITH CHANGES** (most likely) — spike holds up but the shape/typings/error union needs minor edits. Edit them inline in the writeup and queue them as spec amendments (§6.3).
- **NO-GO** — spike's core assumption broke. Stop. Phase 0 doesn't exit. Open a fresh planning session — the spec itself needs revision.

### 6.2 Multi-GPU rig — what to capture

Rocky just spun up the rig yesterday; the exact composition isn't documented yet. Capture EVERY backend it exposes:

- If it has NVIDIA + AMD: run S2 against `nvidia-smi` AND `rocminfo` (Linux) or `nvidia-smi` AND Vulkan-AMD (Windows). Run S4 with `--n-gpu-layers 99` once per backend (need to know which binary build to use — S1's CUDA build for NVIDIA path; S1's ROCm or HIP build for AMD path).
- Document the rig spec in the S2 writeup's "Hardware tested" section verbatim — model, driver versions, OS build.
- The S4 writeup's lifecycle-observations table has columns for "Win CPU" and "Mac Metal" only. **Add columns** for whatever real backends you tested (e.g. `Win CUDA`, `Linux ROCm`). Don't shoehorn into the existing two.

### 6.3 Spec amendments queued — apply in a follow-up PR

These four amendments emerged from the predecessor session's spikes and are NOT in the master plan or per-phase files yet. After S2 + S4 merge, open a single small PR to land them:

| # | Source | Change | Target file(s) |
|---|---|---|---|
| 1 | S5 | Replace fictional `bartowski/TinyLlama-1.1B-Chat-v1.0-GGUF` with `TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF` (HEAD-200 verified, SHA256 `015c9bb0…`). | `docs/superpowers/plans/2026-05-27-local-gguf-support.md` lines 1178 and 1385 |
| 2 | S5 | Add typed 401/403 error variants to the `HfClient` interface. | `phase-07-hf-browser.md` |
| 3 | S4 | Add `preflightBind` step to the port-allocator design (spec § 12) — close the port-reuse race window. | `phase-02-runtime-pool.md` (port-allocator design) |
| 4 | S4 | Grow the typed-error union in spec § 14.1 with the F1/F2/F3 failure modes. | `phase-02-runtime-pool.md` + `phase-04-provider-integration.md` |

This amendments PR is small (≤200 lines), no implementation, just plan/spec editing. The predecessor session intentionally left it for batching with whatever Rocky's hardware captures reveal — if the captures add a 5th amendment, fold it into the same PR.

### 6.4 `.gitignore` cross-branch ordering

The `.gitignore` spike-caches block currently has these in order across branches:

- `main` after S5: `s1, s3, s5`
- `spike/v3.3.0-S2-gpu-probe`: `s1, s2, s3, s5`
- `spike/v3.3.0-S4-server-lifecycle`: `s1, s3, s4, s4-bin, s5` (missing `s2`)

When you merge in either order:

- **S2 → S4**: after S2 merges, rebase S4 onto main. Trivial 1-line `.gitignore` conflict: insert `.spike-s2-cache/` between `s1` and `s3`. Final order: `s1, s2, s3, s4, s4-bin, s5`. This is the predecessor session's S5↔S3 pattern repeating — the resolution algorithm is "keep the alphabetical superset".
- **S4 → S2**: opposite order; same trivial resolution.

Use `git rebase origin/main` then resolve the `.gitignore` block by accepting both adds. Do NOT use `git rebase -i` (interactive editors aren't supported by the tool harness).

### 6.5 Things NOT to do

- **Do not re-run the S2 or S4 scaffolding subagents.** The code is shipped and reviewed. Your job is hardware capture, not re-implementation.
- **Do not delete the `_synthetic/` fixture set.** Even after real captures land, the synthetic fixtures stay as parser regression cases that work without hardware.
- **Do not force-push to `main`.** Standard rules from CLAUDE.md.
- **Do not change the `bartowski/Llama-3.2-1B-Instruct-GGUF` fallback** — it's the documented backup if TheBloke's TinyLlama becomes unavailable. The runbook explains.
- **Do not start Phase 1** before both PRs merge. The plan's exit criteria are firm: "all 5 spikes merged or NO-GO triggering spec revisions."

---

## 7 · After both PRs merge — Phase 1 unlocks

The exit gate for Phase 0 (per master plan lines 1485-1494):

- [ ] S1 merged → ✅ done
- [ ] S2 merged with GO or GO-WITH-CHANGES → **your work**
- [ ] S3 merged → ✅ done
- [ ] S4 merged with GO or GO-WITH-CHANGES → **your work**
- [ ] S5 merged → ✅ done

Once both check, **Phase 1 (Foundation) unblocks**. Per `docs/superpowers/plans/2026-05-27-local-gguf-support/phase-01-foundation.md`, Phase 1's scope is:

- Create the `packages/local-gguf-runtime/` package skeleton.
- Drizzle migration `0014_local_gguf` (5 tables).
- Shared types in `packages/shared-types/src/local-gguf.ts`.
- IPC stubs.
- Repository pattern wrappers for the 5 new tables.

Phase 1 is fully subagent-driveable — no more hardware blockers between here and beta. Use the same subagent-driven-development pattern that landed S1/S3/S5: one implementer subagent per task, two-stage review (spec-compliance → code-quality) before each task closes.

**Important spec-amendment dependency:** Phase 1 § 12.1 (`GpuInventory` shape) will need the 10 shape extensions you confirm in S2. Land the spec amendments PR (§6.3) FIRST, then start Phase 1 — otherwise Phase 1 implements an out-of-date shape and the next reviewer flags it.

---

## 8 · Open questions for Rocky (ask if relevant)

- **Multi-GPU rig spec** — what GPUs, what OS, what drivers? The S2 writeup needs this verbatim. Ask when you start.
- **Mac access** — does the GPU workstation also have a Mac arm64 nearby? S2's macOS leg + S4's Metal leg both want it. If not, mark those rows `n/a — no Mac in this session` and the next session covers them.
- **Linux access** — the GPU workstation is presumably Windows or Linux. Cover the host OS thoroughly; defer the OTHER OS to a follow-up if not accessible.

---

## 9 · Verification before declaring "Phase 0 closed"

After both PRs merge:

```bash
# 1. main has both spikes
git checkout main && git pull --ff-only
ls docs/spikes/ | sort
# expected: S1, S2, S3, S4, S5 writeups; S2-fixtures/ + S3-fixtures/ dirs; both
# runbooks; scripts/spike-S1, S2, S3, S4, S5 all present.

# 2. The S2 smoke test still passes on real captures
node scripts/spike-S2/smoke-test.mjs
# (or whatever invocation the runbook §validation documents)

# 3. The S4 harness still has --help working
node scripts/spike-S4/lifecycle-test.mjs --help

# 4. Spec amendments PR is open (or merged) — see §6.3.

# 5. Phase 1 tasks queued.
```

If all five check out, Phase 0 is officially closed. Update the project status memory and start Phase 1.

---

## 10 · Memory + project-status updates the new session should make

The auto-memory file at `~/.claude/projects/.../memory/project_team_x_current_status.md` will need a new entry when Phase 0 closes. Suggested:

> **2026-05-XX:** Phase 0 of v3.3.0 Local GGUF Support fully exited. All 5 spikes merged. Spec amendments landed in PR `#NN`. Phase 1 (Foundation) started. Subagent-driven-development pattern is the established workflow.

That replaces the current "v3.2.1 shipped as latest" line as the active focus. The release-engineering history is still relevant context for Phase 11 (beta docs) much later.

---

**Done.** Welcome to the hardware session. The laptop session signs off cleanly here.

*— Claude Opus 4.7 (1M context), 2026-05-28*
