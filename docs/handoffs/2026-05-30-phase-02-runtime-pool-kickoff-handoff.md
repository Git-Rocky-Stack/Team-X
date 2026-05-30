# Phase 2 (Runtime + Pool) kickoff handoff — 2026-05-30

> **Audience:** the next Claude Code session continuing Team-X v3.3.0 Local GGUF Support, on Rocky's **GPU workstation**.
> **Predecessor session:** the laptop session that closed the Phase 1 audit/merge chain, pruned the spike branches, created the Phase 2 branch, and confirmed the binary-distribution decision. This doc tells you exactly where to pick up.
> **Why the workstation:** Phase 2 is the first phase with *real hardware behavior* — it probes physical GPUs (CUDA/ROCm/Vulkan/Metal) and spawns the `llama-server` subprocess. The pure-logic tasks run anywhere, but end-to-end validation needs the workstation's actual GPU. That is why Rocky is resuming here, not on the laptop.
> **Repo (workstation):** `Git-Rocky-Stack/Team-X` at `E:/strategiax/Team-X` · `main` at `7f676bf`.

---

## 1 · TL;DR — resume in 60 seconds

**Phase 1 (Foundation) is MERGED to `main` (PR #11, merge commit `f32839f`).** The Codex Stage-3 audit gate that blocked Phase 2 is now lifted. The Phase 2 branch **`feat/v3.3.0-phase-02-runtime-pool`** is created and pushed (it currently sits at `main`'s tip `7f676bf` — Task 1 was branch creation only; no code commits yet besides this handoff). Binary distribution is **decided: Option C (runtime-fetch)**, llama.cpp pinned to tag **`b9371`**.

**Your job:** build Phase 2 (Runtime + Pool) per `docs/superpowers/plans/2026-05-27-local-gguf-support/phase-02-runtime-pool.md` — 17 tasks, single PR, ~2,500–3,500 LOC prod + ~3,000 LOC tests. Start with the three **unblocked pure-logic TDD modules** (Task 5 BinaryResolver, Task 6 PortAllocator, Task 7 AutoTune — exact test+prod code is in the plan), then GPU probes (Task 8, S2 fixtures), then the binary fetcher (Tasks 2–4, Option C), then the heavy subprocess/pool work (Tasks 10–11), then wiring + E2E + PR.

**First action on the workstation:** §3 (env bring-up). **Then read this whole doc before writing code.**

---

## 2 · Where things sit — concrete state

### Branches & PRs

| Item | Value | Notes |
|---|---|---|
| `main` tip | `7f676bf` | Merge of PR #14 (plan migration-number doc fix), on top of `9b6524c` (`.jez/` gitignore) on top of `f32839f` (**PR #11 — Phase 1 merge**). |
| Phase 2 branch | `feat/v3.3.0-phase-02-runtime-pool` | **Pushed to origin.** Sits at `7f676bf` + this handoff commit. `git fetch && git checkout feat/v3.3.0-phase-02-runtime-pool`. |
| **PR #13** | `docs/phase-01-foundation-handoff` → OPEN | The Phase 1 foundation handoff doc, still open as a standalone docs PR. **Decision for Rocky:** merge it (it documents the now-merged Phase 1) or close it. Not a blocker for Phase 2. |
| PR #11 | MERGED (`f32839f`) | Phase 1 Foundation. Stage 2 ✅, Stage 3 Codex ✅ (report archived in gitignored `.jez/reviews/`), Stage 4 ✅ Rocky. |
| PR #12 | MERGED | CI ESLint gate — now active on `main`. |
| PR #14 | MERGED (`7f676bf`) | Plan doc migration-number correction (`0014`→`0036`). |

### What's already on disk (Phase 1 deliverables, all merged)

- `packages/local-gguf-runtime/` — scaffold only: `src/errors.ts` (re-export barrel) + `src/index.ts` (re-exports `./errors.js`). **Phase 2 extends `src/index.ts`** to export the `runtime/`, `pool/`, and `gpu-probe/` surfaces.
- `packages/shared-types/src/local-gguf.ts` — all contracts: entity types, `LocalGgufError` (17 variants), `LocalGgufApi` bridge, `GpuDevice` (carries the 10 S2 hardware-confirmed optional fields), HF result shapes.
- `apps/desktop/src/main/db/migrations/0036_local_gguf.sql` + journal idx 36 — 5 tables. **Phase 2 adds NO migration** (backend choice persists in the settings store, not a table).
- `apps/desktop/src/main/ipc/local-gguf-runtime-handlers.ts` — IPC stubs that throw `notImplemented(...)`. **Phase 2 replaces these** (Task 13) and grows `registerLocalGgufRuntimeHandlers` with a `deps` argument.
- `root package.json` already pins `llamaCppRelease: "b9371"`.

### Spike inputs available (all committed)

- `docs/spikes/2026-05-27-S1-llama-binary-fetch.md` — binary fetch findings, tag `b9371`, full asset table (see §4).
- `docs/spikes/2026-05-27-S2-gpu-probe-cross-platform.md` + `docs/spikes/S2-hardware-runbook.md` — GPU probe parsers.
- `docs/spikes/S2-fixtures/` — parser test fixtures: real `windows-nvidia/` (nvidia-smi, nvidia-smi-list, vulkaninfo) + `_synthetic/` (linux-nvidia, linux-amd rocminfo, macos-arm64 system_profiler + plist, windows-nvidia).
- `docs/spikes/2026-05-27-S4-llama-server-lifecycle.md` + `docs/spikes/S4-hardware-runbook.md` — subprocess lifecycle harness + the `preflightBind` port-race fix.
- `docs/spikes/2026-05-27-S3-...` (metadata, Phase 3) and `S5-...` (HF client, Phase 7) — not needed this phase.

---

## 3 · First commands on the GPU workstation (env bring-up)

```bash
cd E:/strategiax/Team-X
git fetch origin
git checkout feat/v3.3.0-phase-02-runtime-pool      # pushed; includes this handoff
git pull --ff-only

# Confirm Phase 1 landed on the branch's base
git log --oneline -5 main | grep -i "phase 1\|phase-01\|foundation"   # expect f32839f
ls apps/desktop/src/main/db/migrations/ | grep 0036                   # expect 0036_local_gguf.sql

# Relink the workspace (postinstall runs electron-rebuild for better-sqlite3 + keytar)
corepack pnpm@9.15.9 install

# Verify the runtime package test harness is live (this is where all Phase 2 unit tests land)
corepack pnpm@9.15.9 -F @team-x/local-gguf-runtime test     # vitest run — should pass (currently only errors barrel)
```

> **Node version:** the workspace requires Node ≥ 22.13.0 (root `engines`). Run `node --version` first. On the **laptop** the default shell node was too old and needed an fnm path prepend (`$env:APPDATA\fnm\node-versions\v22.22.2\installation`); on the **workstation** the Phase 1 predecessor ran everything through `corepack pnpm@9.15.9` without an fnm dance, so the default node there is fine. If you hit an `EBADENGINE`/engine error, prepend the workstation's node-22 path the same way.

> **`pnpm` is not on bare PATH on this box** (Phase 1 §5.3). Always invoke via `corepack pnpm@9.15.9 ...`. Root scripts that shell out to bare `pnpm` (e.g. `pnpm typecheck` → `pnpm -r typecheck`) fail on the nested call; use the recursive/filter form directly: `corepack pnpm@9.15.9 -r typecheck`, `corepack pnpm@9.15.9 -F @team-x/desktop exec eslint .`.

> **`gh` is not on PATH:** full path `C:\Program Files\GitHub CLI\gh.exe`, run through the PowerShell tool. Authed as `Git-Rocky-Stack`.

---

## 4 · Locked decisions (do not re-litigate)

### 4.1 Binary distribution = **Option C (runtime-fetch)** — confirmed by Rocky
- `scripts/fetch-llama-binaries.mjs` fetches binaries at **install time** (postinstall, dev experience) and **CI time** (before electron-builder), verified against a committed **SHA manifest** (`scripts/llama-binaries-manifest.json`). Binaries are **gitignored**, never committed. Repo stays small; builds stay deterministic.
- **Status:** decision made (Task 2 Step 1). The mechanical steps are NOT yet done: the `.gitignore` append for `apps/desktop/resources/llama-server/` (Task 2 Step 2–3) and the fetch script + manifest (Tasks 3–4) remain.

### 4.2 llama.cpp pin = tag **`b9371`** (from Spike S1)
Full asset matrix (S1 §"Chosen release", source: <https://github.com/ggml-org/llama.cpp/releases/tag/b9371>). **SHA256 values are `pending-execution` in S1** — they must be filled into the manifest at fetch time (the fetch script computes + records them, or Rocky runs S1's hashing pass on the workstation first):

| Combo | Asset in `b9371` | Size (MB) | Notes |
|---|---|---|---|
| win32-x64 CUDA | `llama-b9371-bin-win-cuda-13.3-x64.zip` | 151 | **+ paired `cudart-llama-bin-win-cuda-13.3-x64.zip` (≈373 MB) required at runtime.** CUDA 12.4 pair also exists as fallback. |
| win32-x64 ROCm | `llama-b9371-bin-win-hip-radeon-x64.zip` | 305 | Surprise win — ROCm-on-Windows IS shipped (vendored hipBLAS/rocBLAS DLLs). |
| win32-x64 Vulkan | `llama-b9371-bin-win-vulkan-x64.zip` | 31 | Universal Win AMD/Intel fallback. |
| win32-x64 CPU | `llama-b9371-bin-win-cpu-x64.zip` | 15 | OpenMP. |
| win32-arm64 Vulkan | **_(none)_** | — | ⚠️ **CONFIRMED GAP** — see 4.3. |
| win32-arm64 CPU | `llama-b9371-bin-win-cpu-arm64.zip` | 9 | Only shipped Win-arm64 backend. |
| linux-x64 CUDA | _(per S1 table)_ | — | |
| linux-x64 ROCm | `llama-b9371-bin-ubuntu-rocm-7.2-x64.tar.gz` | 124 | ROCm 7.2. |
| linux-x64 Vulkan | `llama-b9371-bin-ubuntu-vulkan-x64.tar.gz` | 31 | |
| linux-x64 CPU | `llama-b9371-bin-ubuntu-x64.tar.gz` | 14 | |
| darwin-arm64 Metal | `llama-b9371-bin-macos-arm64.tar.gz` | 9 | Metal default. |
| darwin-x64 Metal | `llama-b9371-bin-macos-x64.tar.gz` | 9 | Metal default. |

### 4.3 ⚠️ Two findings to reconcile in Tasks 3–5 (don't let these bite you)
1. **win32-arm64 Vulkan is a confirmed GAP in `b9371`** (no asset). The BinaryResolver plan (Task 5) declares the SUPPORTED matrix `win32-arm64=[vulkan,cpu]`. That conflicts with reality — there is no vulkan binary to resolve to on win-arm64. **Resolve it:** either drop `vulkan` from the win32-arm64 SUPPORTED row (CPU-only on Win-arm64 for `b9371`), or keep the capability but have BinaryResolver throw the `binary-not-found` `LocalGgufError` kind when the manifest has no win32-arm64-vulkan entry. Pick one and make the Task 5 tests assert it explicitly. The manifest (Task 3) must NOT invent a win32-arm64-vulkan entry — S1 logs it as a known gap.
2. **Windows CUDA needs the paired `cudart` bundle.** `llama-server.exe` for CUDA won't run without the matching `cudart-...zip` extracted alongside. The fetch script (Task 3) must download + extract **both** the server zip and the cudart zip for the `win32-x64-cuda` (and `linux-x64-cuda` if applicable) combos. Treat the cudart bundle as part of that combo's payload, not a separate manifest key (or add it as a sibling field) — your call, but the binary must be runnable after fetch.

---

## 5 · Phase 2 task map (17 tasks — plan: `phase-02-runtime-pool.md`)

Line numbers below point into `docs/superpowers/plans/2026-05-27-local-gguf-support/phase-02-runtime-pool.md`. The plan ships **exact test + production code** for the TDD tasks — copy it, run red→green, don't re-derive.

| # | Task | Plan §line | Status / dependency |
|---|---|---|---|
| 1 | Branch off `main`, verify Phase 1 merged | L94 | ✅ **DONE** (branch created + pushed; `f32839f` + `0036` verified). |
| 2 | Binary distribution decision + gitignore | L128 | Decision ✅ (Option C). Gitignore append + commit (Step 2–3) **TODO**. |
| 3 | Production binary-fetch script + manifest | L174 | TODO. Fill SHAs (4.2), handle cudart pairing + arm64-vulkan gap (4.3). |
| 4 | Hook fetcher into package.json + electron-builder | L421 | TODO. postinstall + prepack hooks; `asarUnpack` the resources tree. |
| 5 | **BinaryResolver** (TDD) | L516 | **UNBLOCKED — start here.** Pure logic, 7 tests. Reconcile arm64-vulkan (4.3). |
| 6 | **PortAllocator** (TDD) | L724 | **UNBLOCKED.** Pure logic, 4 tests. Ephemeral 49152–65535, verify bindable. |
| 7 | **AutoTune** (TDD) | L869 | **UNBLOCKED.** Pure math, 8 tests. nCtx/nGpuLayers/nThreads/sampling. |
| 8 | Per-backend GPU probes ×5 (TDD each) | L1118 | Unblocked w/ S2 fixtures (nvidia/rocm/vulkan/metal/cpu). Dep-inject `runCommand`. |
| 9 | GPU probe ranking + orchestrator | L1400 | After Task 8. Parallel probes, 3 s timeout each, rank → persist. |
| 10 | **ServerLifecycle** (TDD + integration) | L1511 | Heavy. Spawn/ready-detect/stop/onCrash. Uses S4 harness + `preflightBind`. |
| 11 | **LruPool + AutoSwap** (TDD) | L1895 | Heavy. Bounded concurrency (default max 1), LRU evict, auto-swap. |
| 12 | Wire RuntimeService + PoolService in main | L2057 | After 9–11. Adds `deps` to handler registration; single boot call-site. |
| 13 | Replace IPC stubs with real impl | L2079 | After 12. Fills `local-gguf-runtime-handlers.ts`. |
| 14 | E2E spec `local-gguf-loading.spec.ts` | L2113 | Against stub backend. |
| 15 | CHANGELOG + version pin update | L2183 | |
| 16 | Quality gate (full checklist, CR-6 + CR-7) | L2216 | typecheck/biome/eslint/test/coverage/claims. |
| 17 | Open PR | L2231 | Single PR for the whole phase. |

---

## 6 · Recommended execution order & workflow

**Order:** 5 → 6 → 7 (pure-logic, build momentum + green test base) → 8 → 9 (GPU probes, validate against real hardware on this rig) → 2 → 3 → 4 (binary fetch, now that BinaryResolver's contract is settled) → 10 → 11 (subprocess + pool, the risk-heavy core) → 12 → 13 (wiring) → 14 (E2E) → 15 → 16 → 17 (PR).

> Tasks 5/6/7 are independent of the binary-distribution work and of each other — safe to knock out first for a green base. Task 5's SUPPORTED-matrix decision (4.3) should be made before Task 3's manifest so they agree.

**Per-task workflow (established in Phase 1, carry it forward):**
1. One implementer subagent per task (or implement inline for the small pure-logic ones).
2. **Two-stage per-task review before the task closes:** (a) spec-compliance check against the plan, (b) code-quality check. Fix before moving on.
3. Commit each task atomically with a descriptive subject + co-author trailer (§8).
4. After all tasks: run the **full review wall** on the phase PR (§7).

**TDD discipline (rigid):** for Tasks 5–11, write the test file first, run it, confirm RED, then write the implementation, confirm GREEN. The plan's test code is authoritative — match it.

---

## 7 · The review wall (master plan § CR-7) — applies to the Phase 2 PR

| Stage | What | Who triggers | Phase 2 status |
|---|---|---|---|
| 1 | CI green (Biome + ESLint gate + typecheck + full test ×3 OS + claims audit + Linux E2E smoke) | push | on PR |
| 2 | Internal code review (`feature-dev:code-reviewer`) | you | on PR |
| 3 | **Codex review (`dev-tools:codex-review`) — MANDATORY this phase** | **Rocky** (you cannot invoke it autonomously) | on PR — **any HIGH finding blocks merge** |
| 4 | Rocky sign-off | Rocky | after 1–3 |
| 5 | `ship-engineer` | — | **RELEASE-TAG ONLY** — NOT per-phase. After Stage 4, the phase PR merges to `main`. Do not run ship-engineer on the phase PR. |

> **Why Stage 3 is mandatory here:** Phase 2 introduces the **subprocess-spawn surface** (`llama-server` via `ServerLifecycle`) plus port binding and HTTP. That is exactly the trust-boundary class CR-7 requires Codex to audit. Budget for it — trigger Codex as soon as the PR is up and CI is green.

---

## 8 · Gotchas carried forward (these cost real time in Phase 1)

**Still fully in force:**
- **8.1 — Migrations are hand-authored** (Phase 1 §5.1). `drizzle-kit generate` diffs a stale baseline and emits garbage. Phase 2 adds no migration, but Phase 3+ will: edit `schema.ts`, hand-write `NNNN_name.sql` with `--> statement-breakpoint` separators, add the `meta/_journal.json` entry. Tests apply via `makeTestDb()` (sql.js) in journal order.
- **8.2 — Desktop typecheck needs lib `dist` built first** (Phase 1 §5.2). Desktop project-references the lib packages; they need `dist/*.d.ts` on disk:
  ```bash
  corepack pnpm@9.15.9 exec tsc --build packages/shared-types packages/role-schema packages/telemetry-core packages/provider-router packages/intelligence packages/local-gguf-runtime
  ```
  ⚠️ **Phase 2 action:** Tasks 12–13 make `apps/desktop` import from `@team-x/local-gguf-runtime` for the first time. When that happens you **must** add `local-gguf-runtime` to the CI composite-refs build step in `.github/workflows/ci.yml` ("Build workspace packages (composite refs)") — it is NOT in that list yet. Otherwise desktop typecheck fails in CI even though it passes locally.
- **8.3 — The Bash tool mangles PowerShell here-strings** (Phase 1 §5.5). Never use `@'...'@` or `$(cat <<'EOF'...)` for `git commit -m` through the Bash tool — you get a literal `@`/`EOF` line as the commit subject (which also violates Rocky's no-placeholder-subject rule). For multi-line messages: `Write` the message to a temp file and `git commit -F <file>`, then delete it. (Heredoc works in the dedicated Bash tool only when the whole command is one heredoc; the temp-file route is the reliable path.)
- **8.4 — `corepack pnpm@9.15.9`, not bare `pnpm`** (§5.3, repeated in §3). Do **not** upgrade pnpm to 11.x despite the corepack nag — the baseline is pinned at 9.15.9.
- **8.5 — `autonomy:doctor` is environment-blocked** here until Team-X has been launched once (it reads the live app SQLite). `{status:"blocked"}` is not a code defect.

**Do NOT do:**
- Do not force-push `main` (CLAUDE.md).
- Do not "fix" the `local_model_watch_folders.status` vocab (`reachable`/`unreachable`) — contract is locked; Phase 3 may revisit.
- Do not chase the ~125 ESLint *warnings* (mostly `no-non-null-assertion` in renderer hooks) — the CI gate blocks on errors only.
- Do not run `ship-engineer` on the phase PR (Stage 5 is release-tag only).

---

## 9 · Commit / PR conventions (CLAUDE.md, non-negotiable)

- **Co-author trailer on every commit:**
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **No placeholder/single-char commit subjects** — every subject describes what changed.
- Never commit secrets/credentials. `.jez/` (Codex/review artifacts) is gitignored — keep it that way.
- Binaries under `apps/desktop/resources/llama-server/` stay gitignored (Option C).
- Commit each task atomically; the phase ships as a **single PR**.

---

## 10 · Hardware-specific notes for THIS rig (the workstation)

The GPU workstation is **Maxwell sm_52** (per Phase 1 §6 + the S2/S4 writeups + the `rocky-gpu-workstation` notes). This directly shapes Phase 2 hardware validation:

- **CUDA:** the prebuilt **CUDA 13.3** `b9371` build does **NOT run** on sm_52 — expect it to fail at load. **CUDA 12.4 works via PTX JIT** (~23 s cold start). When validating CUDA on this box, fetch/test the **12.4** pair, not 13.3. A CUDA-13.3 failure here is **expected hardware reality, not a code bug** — the ranking logic (Task 9) and BinaryResolver (Task 5) should still be tested against fixtures, not gated on this rig's CUDA succeeding.
- **Vulkan is the better Maxwell default.** Backend ranking validation on this rig should show Vulkan as the sane choice over CUDA. Keep that in mind when sanity-checking Task 9's real-hardware output (the unit tests use fixtures and are deterministic regardless).
- The S2 `windows-nvidia/` fixtures were captured on this rig — they're the ground truth for the nvidia parser tests.
- Consult `docs/spikes/S2-hardware-runbook.md` and `docs/spikes/S4-hardware-runbook.md` before running any live probe or live `llama-server` spawn — they document the exact commands and expected output for this hardware.

---

## 11 · Open items / flags for Rocky

1. **PR #13** (`docs/phase-01-foundation-handoff`) is still OPEN. It documents the now-merged Phase 1. Decide: merge it into `main` (keeps `main`'s `docs/handoffs/` current) or close it. This Phase 2 kickoff handoff supersedes it as the *active* pointer, but PR #13's content is the canonical Phase-1 record.
2. **Project-status memory** updated this session: Phase 1 → merged; Phase 2 → started (branch created, handoff written, work resuming on workstation).
3. **Stage 3 Codex** must be triggered by Rocky when the Phase 2 PR is up — it is mandatory (subprocess surface) and the predecessor cannot invoke it autonomously.

---

## 12 · Reference index

- **This handoff:** `docs/handoffs/2026-05-30-phase-02-runtime-pool-kickoff-handoff.md`
- **Predecessor:** `docs/handoffs/2026-05-29-phase-01-foundation-handoff.md` (PR #13, content also `git show origin/docs/phase-01-foundation-handoff:...`)
- **Master plan:** `docs/superpowers/plans/2026-05-27-local-gguf-support.md` (CR-1..CR-10 cross-phase rules canonical here)
- **Phase 2 plan:** `docs/superpowers/plans/2026-05-27-local-gguf-support/phase-02-runtime-pool.md`
- **Spikes:** `docs/spikes/2026-05-27-S1..S5-*.md` + `docs/spikes/S2-hardware-runbook.md` + `docs/spikes/S4-hardware-runbook.md`
- **S2 fixtures:** `docs/spikes/S2-fixtures/{windows-nvidia,_synthetic/*}`
- **Runtime package:** `packages/local-gguf-runtime/` (extend `src/index.ts` with `runtime/`, `pool/`, `gpu-probe/`)

---

**Done.** Phase 1 is merged, the Codex gate is lifted, the Phase 2 branch is live, and the binary strategy is locked to Option C / `b9371`. Pick up at §3, then start Task 5. The laptop session signs off cleanly here.

*— Claude Opus 4.8 (1M context), 2026-05-30*
