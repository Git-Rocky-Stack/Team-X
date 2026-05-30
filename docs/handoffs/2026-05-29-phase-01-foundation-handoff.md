# Phase 1 foundation handoff — 2026-05-29

> **Audience:** the next Claude Code session continuing Team-X v3.3.0 Local GGUF Support, on Rocky's GPU workstation.
> **Predecessor session:** the session that built all of Phase 1 (Foundation) and opened it for review. This doc tells you exactly where to pick up.
> **Repo:** `Git-Rocky-Stack/Team-X` · `main` at `e52e373` · **two PRs open: `#11` (Phase 1) and `#12` (CI ESLint gate).**

---

## 1 · TL;DR — one paragraph

**Phase 1 (Foundation) of the v3.3.0 Local GGUF plan is code-complete and open as PR `#11`.** It is pure scaffolding — no user-visible behavior — and lands every contract, table, repo, settings accessor, and IPC channel that Phases 2–11 fill in. The full local quality gate is green (typecheck, Biome, 2,323-test suite, coverage, claims audit) and **Stage 2 internal code review returned APPROVE-WITH-NITS with 35/35 channel integrity PASS** (nits already fixed). A small independent side-PR `#12` adds a **blocking ESLint step to CI** (CI previously ran only Biome) and fixes the 3 pre-existing ESLint errors it surfaced. **Your job:** run Stage 3 (Codex — mandatory for IPC + migration), get Rocky's Stage 4 sign-off, merge `#12` then `#11`, then start **Phase 2 (Runtime + Pool)**. Do NOT start Phase 2 before `#11` merges.

---

## 2 · Where things sit — concrete state

### Open PRs

| PR | Branch | Head | Commits | What | Status |
|---|---|---|---|---|---|
| [`#11`](https://github.com/Git-Rocky-Stack/Team-X/pull/11) | `feat/v3.3.0-phase-01-foundation` | `1ec6770` | 18 | Phase 1 Foundation | gate green locally; Stage 2 ✅ APPROVE-WITH-NITS; CI running; **Stage 3 + 4 pending** |
| [`#12`](https://github.com/Git-Rocky-Stack/Team-X/pull/12) | `chore/ci-eslint-gate` | `b6b5e51` | 1 | CI ESLint gate + 3 pre-existing fixes | CI green (macOS+ubuntu; Windows finishing); ready to merge |

Both branched off `main` (`e52e373`). They do **not** conflict (`#12` touches `ci.yml` + 3 unrelated files; `#11` touches none of those).

### What Phase 1 (PR #11) actually contains

| Area | Files | Notes |
|---|---|---|
| Package scaffold | `packages/local-gguf-runtime/` | `errors.ts` (re-export barrel) + `index.ts`. No logic yet — later phases extend. |
| Contracts | `packages/shared-types/src/local-gguf.ts` (+ `index.ts`, `ipc.ts`) | All entity types, `LocalGgufError` (17 variants), `LocalGgufApi` bridge interface, HF result shapes. `TeamXApi` gains `localGguf`. |
| Migration | `apps/desktop/src/main/db/migrations/0036_local_gguf.sql` + `meta/_journal.json` (idx 36) | **`0036`, not the plan's `0014`** — repo was already at `0035`. 5 tables, CHECKs, 6 indexes, FK cascades. Hand-authored (see §5.1). |
| Schema | `apps/desktop/src/main/db/schema.ts` | 5 Drizzle tables appended (endpoints-first for FK order). |
| Repos | `apps/desktop/src/main/db/repos/local-model{s,-advanced-params,-endpoints,-watch-folders}.ts` (+ tests) | Factory pattern, `nanoid()`, `$inferSelect`→entity mapRow. |
| Settings | `apps/desktop/src/main/services/runtime-settings/local-gguf-settings.ts` (+ test) | `localGguf.*` accessor over the app store, no new table. |
| IPC stubs | `apps/desktop/src/main/ipc/local-gguf-{library,runtime,hf,benchmark,endpoint}-handlers.ts` + `local-gguf-not-implemented.ts` (+ tests) | 5 modules, **35 channels**, every handler throws `notImplemented(...)`. |
| Preload | `apps/desktop/src/preload/api.ts` (+ `api.test.ts`) | `localGguf` namespace built inline in `buildTeamXApi` over central `CHANNELS`. `window.d.ts` unchanged (flows through `TeamXApi`). |
| Boot | `apps/desktop/src/main/index.ts` | 5 `registerLocalGguf*Handlers(ipcMain)` wired after copilot handlers. |
| Release | `CHANGELOG.md`, root `package.json` | `[Unreleased]` entry + `llamaCppRelease: "b9371"` (S1 tag). |

### Plan files

- **Master plan:** `docs/superpowers/plans/2026-05-27-local-gguf-support.md`.
- **Per-phase plans:** `docs/superpowers/plans/2026-05-27-local-gguf-support/phase-01..11-*.md`.
- **Next up:** `phase-02-runtime-pool.md`.

> ⚠️ **The phase-01 plan doc is written against the OLD design** in two ways the actual implementation correctly diverged from (match the code, not the plan): it says migration `0014` (real: `0036`), and it says the preload exposes `window.teamXApi.localGguf` via a standalone `local-gguf-api.ts` (real: `window.teamx.localGguf`, built inline in `api.ts`'s `buildTeamXApi` — the repo's actual convention). The PR body documents both divergences.

---

## 3 · First commands in the new session

```bash
cd E:/strategiax/Team-X
git fetch origin
git status                       # expect clean
gh pr list                       # expect #11 and #12 open   (gh = full path, see §5.4)
gh pr checks 11                  # confirm CI verdict
gh pr checks 12
```

Then read this whole handoff before acting.

---

## 4 · Your work — the review wall + merge

Phase 1 must clear the 4-stage review wall (master plan § CR-7). Stages 1–2 are done:

- [x] **Stage 1 — CI green.** Runs on push. (CI = Biome lint + typecheck + full test, ×3 OS, plus claims audit + an E2E smoke job on Linux.)
- [x] **Stage 2 — internal code review.** APPROVE-WITH-NITS, 35/35 channel integrity. Report posted as a PR #11 comment; nits fixed in `1ec6770`.
- [ ] **Stage 3 — Codex review (MANDATORY for this phase — IPC contracts + SQL migration).** Run the `dev-tools:codex-review` skill (Rocky triggers it; you cannot invoke it autonomously). Resolve any HIGH findings, attach the report as a PR comment.
- [ ] **Stage 4 — Rocky sign-off**, then merge.

### Merge order
Merge **`#12` first** (independent, already green) so the ESLint gate is active before `#11` lands — then `#11`'s post-merge `main` CI also enforces ESLint. Then merge `#11`:

```bash
gh pr merge 12 --merge --delete-branch
gh pr merge 11 --merge --delete-branch     # after Stage 3 + 4 clear
```

> If `#11` is merged before `#12`, nothing breaks — `#11`'s own CI doesn't include the ESLint step (that step only exists on `#12`'s branch until merged). It's purely about when the gate starts protecting `main`.

---

## 5 · Gotchas + workstation learnings (carried forward — these cost the predecessor real time)

### 5.1 drizzle-kit generate is NOT the migration workflow
Migrations past `0002` are **hand-authored** `.sql` files plus a **manual entry in `meta/_journal.json`**. `drizzle-kit generate` diffs against a stale baseline (no meta snapshots are maintained) and emits a broken full-schema migration. When you add a table in Phase 2+: edit `schema.ts`, hand-write `NNNN_name.sql` with `--> statement-breakpoint` separators, add the journal entry. Tests apply migrations via `makeTestDb()` (sql.js) in journal order.

### 5.2 Desktop typecheck needs lib `dist` built first
Desktop's tsconfig project-references the lib packages, which need their `dist/*.d.ts` on disk:
```bash
corepack pnpm@9.15.9 exec tsc --build packages/shared-types packages/role-schema packages/telemetry-core packages/provider-router packages/intelligence packages/local-gguf-runtime
```
CI does this explicitly (`ci.yml` "Build workspace packages (composite refs)"). **Note:** that CI build list does NOT yet include `local-gguf-runtime` — it doesn't need to (nothing project-references it yet, and `pnpm -r typecheck` covers it), but add it to the list if Phase 2 makes desktop reference it.

### 5.3 Root scripts that shell out to bare `pnpm` fail
`pnpm` is not on PATH here. `pnpm typecheck` (→ `pnpm -r typecheck`) and `pnpm lint:eslint` (→ `pnpm -F @team-x/desktop lint`) fail on the nested bare `pnpm`. Invoke the recursive/filter form directly: `corepack pnpm@9.15.9 -r typecheck`, `corepack pnpm@9.15.9 -F @team-x/desktop exec eslint .`. (Inside CI, `pnpm` IS on PATH, so the scripts work there.)

### 5.4 `gh` is not on PATH
Full path: `C:\Program Files\GitHub CLI\gh.exe`. Run it through the **PowerShell** tool: `& "C:\Program Files\GitHub CLI\gh.exe" pr view 11`. Authed as `Git-Rocky-Stack` with `repo` + `workflow` scopes.

### 5.5 The Bash tool does NOT understand PowerShell here-strings
`@'...'@` is PowerShell syntax; pasting it into a `git commit -m` via the Bash tool mangles the message (you get a literal `@` line + arg-splitting errors). For multi-line commit messages: `Write` the message to a temp file (e.g. `.git/COMMIT_EDITMSG_TMP`) and `git commit -F <file>`, then delete it.

### 5.6 `autonomy:doctor` is environment-blocked here
It inspects the live app SQLite at `%APPDATA%\Team-X\team-x\team-x.sqlite`, which doesn't exist until Team-X is launched once on this box. It returns `{status:"blocked"}` — **not** a code defect. Don't treat it as a gate failure on a fresh checkout.

### 5.7 Things NOT to do
- **Do not start Phase 2 before PR #11 merges.** Firm plan exit criterion.
- **Do not force-push `main`** (CLAUDE.md).
- **Do not "fix" the `local_model_watch_folders.status` vocabulary** (`reachable`/`unreachable`) in Phase 1 — the contract is locked and internally consistent. The Phase 3 scan service can revisit (Stage-2 deferred note).
- **Do not chase the 125 ESLint *warnings*** (mostly `no-non-null-assertion` in renderer hooks) — the new CI gate blocks on errors only; warnings are a separate optional cleanup.

---

## 6 · After PR #11 merges — Phase 2 (Runtime + Pool) unlocks

Per `docs/superpowers/plans/2026-05-27-local-gguf-support/phase-02-runtime-pool.md`. Phase 2 is the first phase with real behavior. High level:

- **GPU probe** — the real implementation behind `localGguf.runtime.gpuInventory` / `reprobeGpu`, built on the S2 spike's cross-platform parsers + fixtures (`scripts/spike-S2/`, `docs/spikes/S2-fixtures/`). The `GpuDevice` shape already carries the 10 S2 hardware-confirmed optional fields.
- **Backend selection** — rank CUDA/ROCm/Vulkan/Metal/CPU. **Maxwell caveat (this rig):** sm_52 — the prebuilt CUDA *13.3* build does NOT run; CUDA *12.4* works via PTX JIT (~23s cold); Vulkan is the better Maxwell default. See [[rocky-gpu-workstation]] + S2/S4 writeups.
- **llama-server lifecycle** — spawn/ready-detect/shutdown/port-release, built on the S4 spike harness (`scripts/spike-S4/`). Spec § 12 includes the `preflightBind` port-race fix from the S4 amendments.
- **LRU pool** — the real implementation behind `localGguf.pool.*` (load/unload/status/setMaxConcurrent), default max-concurrent 1.
- Phase 2 fills in the `local-gguf-runtime-handlers.ts` stubs and grows the `registerLocalGgufRuntimeHandlers` signature with a `deps` argument (the single boot call-site in `main/index.ts` updates).

Use the established workflow: one implementer subagent per task, two-stage review (spec-compliance → code-quality) before each task closes, then the full review wall on the phase PR.

---

## 7 · Verification before declaring "Phase 1 closed"

After `#11` merges:
```bash
git checkout main && git pull --ff-only
corepack pnpm@9.15.9 -r typecheck                              # green
corepack pnpm@9.15.9 exec biome check .                        # clean
corepack pnpm@9.15.9 -F @team-x/desktop exec eslint . --quiet  # 0 errors (gate active after #12)
corepack pnpm@9.15.9 -r test                                   # all green
```
Then update the project-status memory (Phase 1 → merged; Phase 2 started) and begin Phase 2.

---

## 8 · Open questions for Rocky (ask if relevant)

- **Stage 3 Codex** — trigger it on PR #11 when ready; it's mandatory for this phase (IPC + migration). The predecessor couldn't invoke it autonomously.
- **Merge timing** — confirm you want `#12` merged before `#11` (recommended) and that the ESLint warnings cleanup is deferred.

---

**Done.** Phase 1 is built, reviewed (Stage 2), and waiting on Codex + your sign-off. The build session signs off cleanly here.

*— Claude Opus 4.8 (1M context), 2026-05-29*
