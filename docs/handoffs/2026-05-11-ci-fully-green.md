# CI Fully Green — Session Handoff

**Date:** 2026-05-11
**Owner:** Rocky Elsalaymeh
**Predecessor:** `docs/handoffs/2026-05-11-cross-platform-ci-unblock.md` (§7.1 was the recommended next-session task; this handoff closes it)
**Session HEAD at handoff:** `b3f17dc` — *fix(ci): install libsecret-1-0 in E2E job + fix trace upload path (§7.1 root cause)*

---

## 1. Why this handoff exists

The predecessor handoff ended with three pieces of recommended next-session work:

- **§7.1** — `E2E smoke (Electron)` failing on Linux CI with `firstWindow` timeout (GPU/X11 init). Lint/Typecheck/Test on all 3 platforms was green; only the Linux Electron job was red.
- **§7.2** — Mac code-signing Phases 1–3 (Apple Developer enrollment → cert request → secret population). External to the repo; awaits Rocky.
- **§7.3** — P2 audit backlog items deferred from the H-tier campaign.

This session executed **§7.1 end-to-end**: from "rerun the local smoke as a parity check" through "diagnose CI red across 4 rounds of attempts" to **all 4 CI jobs green for the first time in the cross-platform campaign's history**. Two adjacent infrastructure hygiene fixes (pnpm pin via `packageManager` field, ipcRenderer listener-cap bump) also landed.

§7.2 and §7.3 are untouched.

---

## 2. Executive summary

| Item | State |
|---|---|
| Commits shipped this session | **7 atomic commits** on `main` (`2dd70de` → `b3f17dc`) |
| CI jobs status on HEAD | ✅ **All 4 green** (`ubuntu-latest`, `macos-latest`, `windows-latest` check legs + `E2E smoke (Electron)`) |
| First fully-green CI run | [run 25686216344](https://github.com/Git-Rocky-Stack/Team-X/actions/runs/25686216344) on `b3f17dc` |
| §7.1 — Linux E2E firstWindow timeout | ✅ **CLOSED** (after 4 rounds, 2 stacked root causes) |
| pnpm version pin | `packageManager: "pnpm@9.15.9"` + workflows read from it (single source of truth) |
| ipcRenderer EventEmitter cap | Bumped from default 10 → 50 (legitimate fan-out across 17 cache-invalidation hooks) |
| Workspace test count | 22 e2e specs / 100% pass on Windows local + Linux CI |
| Native module rebuild on CI | ✅ Verified: `apps/desktop postinstall: ✔ Rebuild Complete` for better-sqlite3 + keytar against Electron 31 ABI |
| Repo HEAD at handoff | `b3f17dc` |

**Bottom line:** the launch-readiness goal of the cross-platform campaign — *every push validated on every supported OS, including a real Electron smoke run* — is now operational. `main` is protected end-to-end. The next push to `main` that breaks Linux Electron will fail CI within 20 minutes instead of silently degrading.

---

## 3. The session ledger — 7 commits by intent

Full chronological commit list with intent, mechanism, and outcome. Read top-to-bottom for the story.

| # | SHA | Subject | Intent |
|---|---|---|---|
| 1 | `2dd70de` | chore(infra): pin pnpm@9.15.9 via packageManager field | Added `"packageManager": "pnpm@9.15.9"` to root `package.json` as single source of truth. Dropped explicit `version: 10` from `pnpm/action-setup@v4` in `ci.yml × 2 jobs`, `conformance.yml`, `release.yml` — they now read pnpm version from `packageManager`. Closes the corepack trap where fresh Claude/CI runners would auto-pick pnpm 11 and silently skip Electron's postinstall (because pnpm 11 errors out non-TTY on Node version auto-purge and treats `ERR_PNPM_IGNORED_BUILDS` as fatal). |
| 2 | `4b4b3d8` | fix(preload): raise ipcRenderer max-listeners cap for legitimate dashboard event fan-out | Added `ipcRenderer.setMaxListeners(50)` in `apps/desktop/src/preload/index.ts` before `buildTeamXApi(ipcRenderer)`. Closes a `MaxListenersExceededWarning: 11 events.dashboard listeners added` that surfaced during the smoke E2E. Verified not a leak — 17+ React hooks (`useTicketEventSync`, `useMeetingEventSync`, …) each legitimately subscribe per Invariant #11 (`event-sync-hooks.test.ts:610-632` enforces this many-subscribers pattern as correct architecture). All subscribers correctly return `unsubscribe` from `useEffect`; preload's `events.onDashboard` holds a stable wrapper ref so `removeListener` actually detaches. 50 gives ~3× headroom for future event-sync hooks. |
| 3 | `85509b7` | docs(handoff): cross-platform CI unblock session log (2026-05-11) | Persisted the predecessor handoff (was untracked at session start) into git. No behavior change. |
| 4 | `5cfa1a8` | fix(main): headless CI Linux launch hardening (closes §7.1) | **Round 1 of §7.1 — failed silently.** Added 4 Chromium switches via `app.commandLine.appendSwitch('disable-gpu'|'no-sandbox'|'disable-software-rasterizer'|'disable-dev-shm-usage')` in `main/index.ts`, gated on `CI === 'true' && process.platform === 'linux'`, before `app.whenReady()`. Local Windows smoke verified gate did NOT fire (correct). On CI Linux: switches registered too late — Chromium parses argv during process bootstrap before main JS loads, so the GPU process was already committed to spawning by the time `appendSwitch` ran. GPU error and sandbox warning persisted unchanged in run 25684659195. **This approach was reverted in commit `a4fa14e`.** |
| 5 | `a4fa14e` | fix(e2e): pass headless Linux CI Electron switches via Chromium argv (closes §7.1) | **Round 2 of §7.1 — correct mechanism, failed at lint.** Reverted `5cfa1a8` from `main/index.ts`. Added `apps/desktop/e2e/_launch-helpers.ts` exporting `getCiLaunchArgs()` — returns the 4 switches on `linux + CI`, `[]` elsewhere. Updated all 17 e2e spec files (18 launch sites — `org-chart.spec.ts` has 2) to spread `...getCiLaunchArgs()` into `electron.launch({ args })`. Helper at `_*.ts` so Playwright's `**/*.spec.ts` discovery skips it. Failed at the **Lint** step on all 3 OS legs of CI run 25684659195 — biome rejected (a) CRLF line endings written by my PowerShell bulk-edit and (b) the 4-element array which was short enough biome wanted inline. |
| 6 | `6699335` | chore(lint): biome auto-fix on e2e fix (CRLF→LF + inline short array) | **Round 3 of §7.1 — Chromium argv approach validated, second root cause exposed.** `pnpm lint:fix` auto-corrected all 18 files (17 specs + helper) in one pass: CRLF→LF on the specs (git had already normalized them on commit, so this was working-tree-only) + inline-format the helper array. CI run 25684815425: **Lint + Typecheck + Test green on all 3 platforms** ✅, GPU error **gone** ✅ (the launch-args approach worked), but **E2E still red** with total Electron silence — no `[main]` logs, no `[renderer]` logs, just `firstWindow` timeout. Different symptom, different root cause. |
| 7 | `b3f17dc` | fix(ci): install libsecret-1-0 in E2E job + fix trace upload path (§7.1 root cause) | **Round 4 of §7.1 — actual fix.** Added `libsecret-1-0` to the E2E job's apt install list in `ci.yml`. The `check` job already installed it (per its `Install keytar Linux runtime` step) but the `E2E` job didn't — and the main process imports keytar during boot. When keytar's dlopen of `libsecret-1.so.0` failed, Electron's main process hung/died early in bootstrap, BEFORE the spec's stderr forwarding attached → zero log evidence, 30s timeout. Bonus hygiene: renamed Playwright upload step from `playwright-report` (a path the config never writes to) → `test-results` (where actual trace zips land) so future failures upload diagnostics. CI run 25686216344: **all 4 jobs green**. |

---

## 4. The §7.1 root-cause analysis — why this took 4 rounds

The headline finding: **§7.1 was two independent failures stacked**. Each round's fix uncovered the next layer's failure, and the layers had nearly identical symptoms (30s `firstWindow` timeout) — only the *absence* of certain log lines distinguished them.

### 4.1 Layer 1 — GPU process crash under xvfb

**Symptom (rounds 1 & 2):**
```
[main!] [<pid>:<ts>:ERROR:viz_main_impl.cc(166)] Exiting GPU process due to errors during initialization
[main!] [<pid>:<ts>:WARNING:sandbox_linux.cc(430)] InitializeSandbox() called with multiple threads in process gpu-process
[main!] [<pid>:<ts>:WARNING:gpu_memory_buffer_support_x11.cc(49)] dri3 extension not supported.
```

**Cause:** xvfb on GitHub Actions ubuntu-latest provides a virtual X server but no real GL driver. Electron 31's GPU process spawns at process bootstrap, attempts dri3 acceleration, and exits when it can't get a real graphics device. The renderer process then hangs waiting for the GPU channel, `firstWindow` never paints.

**Fix (final form in `a4fa14e`):** pass 4 Chromium switches via `electron.launch({ args })`:
- `--no-sandbox` (chrome-sandbox requires setuid root; CI runners can't grant)
- `--disable-gpu` (skip GPU process entirely on xvfb)
- `--disable-software-rasterizer` (don't fall back to SwiftShader either — SW raster still negotiates a GPU channel)
- `--disable-dev-shm-usage` (/dev/shm on CI is too small for Chromium's shmem IPC)

**Why `app.commandLine.appendSwitch` in `main/index.ts` didn't work (round 1):** Chromium parses its argv during process bootstrap, well before the main JavaScript script loads. The GPU-process spawn decision is made at that bootstrap phase. By the time `appendSwitch` runs in user JS, Chromium has already committed to spawning. `appendSwitch` is the right API for many switches but not for the early-bootstrap ones like `disable-gpu` and `no-sandbox`. **The proof that this was the timing issue:** the diagnostic `console.log('[main] headless CI Linux launch flags applied')` line added to the round-1 commit never appeared in CI output. The branch was being entered (verified by symmetry with local Windows behavior) but Electron's bootstrap had already proceeded too far.

### 4.2 Layer 2 — keytar's libsecret dlopen failing silently

**Symptom (round 3):** After layer 1 was fixed, GPU error was gone, sandbox warning was gone, but the run looked identical from a green-vs-red perspective: 30s `firstWindow` timeout on all 17 specs.

**Distinguishing data was what was *missing***:
- Layer 1: GPU stderr line + dri3 warning + sandbox warning
- Layer 2: **complete silence** — no `[main]` stdout, no `[main!]` stderr except `Waiting for the debugger to disconnect` at process kill

A native-module import failure during bootstrap matches that signature exactly: Electron starts, JS runtime loads, the very first `require('keytar')` triggers a dlopen on `libsecret-1.so.0`, which fails or hangs before any user code emits a log. The spec's stderr forwarder is attached *after* `electron.launch` returns, which happens after the binary starts — if the failure is fast enough, the forwarder catches nothing.

**Cause:** The `check` job's workflow had:
```yaml
- name: Install keytar Linux runtime (libsecret)
  if: matrix.os == 'ubuntu-latest'
  run: sudo apt-get update && sudo apt-get install -y libsecret-1-0
```
The `E2E` job's `Install Electron runtime libraries` step installed xvfb + 14 X11/GTK libs but **not libsecret-1-0**. The check job is fine because it runs unit tests via `pnpm test` which loads keytar through `provider-factory.test.ts` — handled by the dedicated install step. The E2E job loads keytar through the actual main-process boot path, which has no such guard.

**Fix:** add `libsecret-1-0` to the E2E job's apt install list, alongside the existing 14 libs. One-line change.

### 4.3 The diagnostic that would have saved a round

When round 3 failed with total silence, the natural debugging move was to download the Playwright trace artifact to see what the renderer reported at timeout. That download failed: `no valid artifacts found`. The workflow had:

```yaml
- name: Upload Playwright report on failure
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: playwright-report
    path: apps/desktop/playwright-report
```

But `playwright.config.ts` has:
- `reporter: isCI ? [['list'], ['github']] : [['list'], ['html', ...]]` — **HTML reporter intentionally disabled in CI**
- `outputDir: \`${__dirname}/test-results\`` — trace zips written to `test-results/`, not `playwright-report/`

Result: every failed CI run since the cross-platform campaign began had been emitting `! No files were found with the provided path: apps/desktop/playwright-report. No artifacts will be uploaded.` and we never had traces to look at. Fixed in `b3f17dc` by pointing the step at `apps/desktop/test-results` and renaming to `playwright-traces`. **This is the single highest-leverage fix to apply early in any future debug session** — without traces, you're guessing at root causes from absence-of-evidence patterns.

---

## 5. Patterns / lessons / drift guards added this session

### 5.1 pnpm version is now a single source of truth

Pre-session state: no `packageManager` field in root `package.json`. Corepack would auto-select the latest pnpm (was hitting pnpm 11.0.9). CI workflows hard-pinned `pnpm/action-setup@v4 with version: 10`. Drift was structural — local dev could go up to pnpm 11+ while CI sat on 10.

Post-session state: `packageManager: "pnpm@9.15.9"` in root `package.json`; all 4 workflow blocks (`ci.yml × 2`, `conformance.yml`, `release.yml`) drop the `version:` input and let `pnpm/action-setup@v4` read from `packageManager`. Single source of truth.

**Why 9.15.9, not 10.x or 11.x:** pnpm 11.0.9 introduced two regressions for our workspace: (a) errors non-TTY on the Node version auto-purge prompt when Node changes underneath `.nvmrc`, (b) treats `ERR_PNPM_IGNORED_BUILDS` as a fatal error that propagates through `pnpm run`, even though the `pnpm.onlyBuiltDependencies: ["electron", "keytar"]` setting in root `package.json` should declare which builds are allowed. pnpm 11 then silently skips `electron@31.7.7`'s postinstall, which means the Electron binary never downloads — `electron.launch()` errors with `Electron failed to install correctly`. pnpm 9.15.9 is the handoff predecessor's known-good baseline; it reads the `lockfileVersion: '9.0'` lockfile natively and runs all postinstalls.

**Drift guard:** the `engines.pnpm: ">=9.0.0"` in root `package.json` is now a floor; the `packageManager` field is the exact pin. Future bumps update one field and all workflows + corepack follow automatically.

### 5.2 `app.commandLine.appendSwitch` is not the right API for early-bootstrap Chromium switches

Documented in `apps/desktop/e2e/_launch-helpers.ts` JSDoc: `--no-sandbox`, `--disable-gpu`, `--disable-software-rasterizer`, and `--disable-dev-shm-usage` must be passed via `electron.launch({ args })` (or, in a production launch, the CLI argv of the Electron binary), not via `appendSwitch` from main process JS. Chromium's argv parser executes during process bootstrap before the main script loads; switches added by JS arrive after key initialization decisions are already made.

**Heuristic:** if a Chromium switch affects sub-process spawning (GPU, utility, renderer) or sandbox enforcement, it has to be on the argv. If it affects later behavior (zoom, accessibility, autofill), `appendSwitch` is fine.

### 5.3 Linux CI Electron has TWO standard pre-requisites, not one

The handoff predecessor's §5.13 covered cross-platform path detection. This session adds: **Linux CI Electron jobs need both an X11 stack (xvfb + GTK libs) AND keytar's libsecret runtime**. The X11 stack lets the binary boot; libsecret lets keytar load. Either missing → main process hangs or crashes silently.

Workflow contract: every Electron-launching CI job on `ubuntu-latest` must install **all** of: `xvfb libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2t64 libgtk-3-0 libsecret-1-0`. The list as a comment block in `ci.yml` documents this for future maintainers.

### 5.4 The MaxListenersExceededWarning is an architecturally-validated false positive

Documented in detail in `4b4b3d8`'s commit message and the JSDoc of `apps/desktop/src/preload/index.ts`. 17+ React hooks subscribe to `ipc.events.onDashboard` independently per Invariant #11 (`event-sync-hooks.test.ts` enforces this many-subscribers pattern as the *correct* architecture — every feature owns its own dedicated effect with `[companyId, qc]` dep array). All subscribers correctly clean up on unmount, and the preload helper holds a stable wrapper ref for `removeListener`. Node's default 10-listener EventEmitter cap was just too low for the deliberate fan-out. Bumped to 50.

**Heuristic for future warnings:** if `MaxListenersExceededWarning` fires on an IPC channel, audit whether subscribers are leaking (return-unsubscribe-from-useEffect missing) before bumping the cap. If they're all clean, the bump is legitimate. Don't reach for `removeAllListeners()` — that breaks the architecture.

### 5.5 PowerShell `Set-Content -Encoding UTF8` defaults to CRLF

Bulk-edits via PowerShell against TypeScript files in this repo will emit CRLF line endings, which biome rejects. Either:
- Pipe through `-NoNewline` and explicit `[System.IO.File]::WriteAllText` with `[System.Text.UTF8Encoding]::new($false)` (UTF8 no BOM) and explicit LF separators
- OR just run `pnpm lint:fix` after the bulk edit — biome's `format` rule normalizes line endings in a single pass

Round 2's PowerShell bulk-edit hit this; round 3 fixed it. Lesson recorded so a future bulk-edit run doesn't repeat the cycle.

### 5.6 Playwright trace upload — point at outputDir, not at HTML report dir

If your `playwright.config.ts` runs `reporter: [['list'], ['github']]` in CI (HTML reporter disabled), there is no `playwright-report/` directory. Trace zips land in `outputDir` (`test-results/` by convention). Upload step path must match.

```yaml
- name: Upload Playwright traces on failure
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: playwright-traces
    path: apps/desktop/test-results
    retention-days: 7
    if-no-files-found: ignore
```

`if-no-files-found: ignore` keeps the step non-fatal on success runs (where the dir may not exist at all).

---

## 6. State at handoff

### 6.1 CI matrix — all 4 jobs green on `b3f17dc`

```
✓ Lint · Typecheck · Test (ubuntu-latest)
✓ Lint · Typecheck · Test (macos-latest)
✓ Lint · Typecheck · Test (windows-latest)
✓ E2E smoke (Electron)
```

[Run 25686216344](https://github.com/Git-Rocky-Stack/Team-X/actions/runs/25686216344) — first fully-green cross-platform run in the campaign's history.

### 6.2 Local dev — unchanged

The `getCiLaunchArgs()` helper is gated on `process.platform === 'linux' && process.env.CI === 'true'`. Local dev on any OS gets `[]` → spec args identical to pre-session state. Verified: `pnpm -F @team-x/desktop test:e2e` passes 22 specs in ~1.3-1.5 min on Windows under Node 22.22.2 / pnpm 9.15.9 / Electron 31.

### 6.3 Production builds — unchanged

`CI` env var is never set on a user's installed app. All gated changes (`getCiLaunchArgs`, the pnpm pin) are no-ops in production. The sandbox stays on for installed Electron apps; the listener-cap bump is preload-only and has no production impact other than allowing more legitimate subscribers.

### 6.4 Repo HEAD

```
b3f17dc fix(ci): install libsecret-1-0 in E2E job + fix trace upload path (§7.1 root cause)
6699335 chore(lint): biome auto-fix on e2e fix (CRLF→LF + inline short array)
a4fa14e fix(e2e): pass headless Linux CI Electron switches via Chromium argv (closes §7.1)
5cfa1a8 fix(main): headless CI Linux launch hardening (closes §7.1)  [INEFFECTIVE — superseded by a4fa14e]
85509b7 docs(handoff): cross-platform CI unblock session log (2026-05-11)
4b4b3d8 fix(preload): raise ipcRenderer max-listeners cap for legitimate dashboard event fan-out
2dd70de chore(infra): pin pnpm@9.15.9 via packageManager field
9f2fdf8 fix(portability): cross-platform host-path detection for compatibility flag  [predecessor session's HEAD]
```

Working tree is clean. No untracked artifacts. No locally-staged anything.

---

## 7. Recommended next-session work — ordered

### 7.1 Tag v3.2.0 release (NEW — now unblocked)

The cross-platform CI matrix has been the blocker on cutting v3.2.0 ever since `5fbff98` introduced it. Now that all 4 jobs are green, `release.yml` will fire cleanly on the next `v*` tag push. The release workflow already builds installers for Windows + macOS + Linux, generates SHA256 checksums, and uploads to a GitHub Release draft.

Recommended steps:
1. Bump `apps/desktop/package.json` `version` from `3.1.0` → `3.2.0` (and root `package.json` if it tracks the same — confirm before bumping)
2. Add a `CHANGELOG.md` entry under `## 3.2.0 — 2026-05-11` listing user-facing changes since 3.1.0
3. `git tag v3.2.0 && git push origin v3.2.0`
4. Watch `release.yml` build the 3 installers; verify SHA256 checksums in the draft release; publish manually after review

**Gating:** Mac code-signing Phases 1–3 are still incomplete (§7.2 below), so the macOS installer will ship UNSIGNED for v3.2.0. The `release.yml` skip-on-empty-secrets logic from predecessor handoff's §7.2 means this is graceful — Mac users see an "unidentified developer" warning but the .dmg works.

### 7.2 Mac code-signing Phases 1–3 (still untouched)

From predecessor handoff §7.2. Phase 4 (workflow env-var injection) is pre-wired in `07cdea2`. Phases 1–3 are all external to the repo:
1. **Phase 1:** Rocky's Apple Developer Program enrollment ($99/yr, ~24h provisioning)
2. **Phase 2:** Generate Developer ID Application cert via Xcode Keychain Access
3. **Phase 3:** Add `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` to repo Settings → Secrets

Once all three land, the next `release.yml` run on a tag will produce a signed + notarized .dmg automatically. See `docs/handoffs/2026-05-10-mac-codesigning-plan.md` for full setup walkthrough.

### 7.3 Investigate the `claim-evidence-audit` workflow's pnpm setup

Pre-session, `conformance.yml` also had `version: 10`. `2dd70de` updated all 4 workflow blocks, including this one. **But** the workflow runs separately from `ci.yml` and may have a different cadence. Verify the claim-evidence-audit workflow has run successfully under pnpm 9.15.9 since the pin landed.

Quick check: `gh run list --workflow=claim-evidence-audit --limit 3 --json conclusion,headSha`. If green, ignore. If red, investigate the failure log.

### 7.4 P2 audit backlog (inherited, untouched)

From predecessor handoff §7.3 (which inherited from `2026-05-09-h-tier-audit-campaign-handoff.md`). The P2 backlog covers:
- Renderer-side memory hygiene audit (the `MaxListenersExceededWarning` investigation in §4.4 above touched this lightly but didn't do a full pass)
- Cross-spoke shared dep version drift (waiting for the cross-platform CI matrix to be reliable enough to gate spoke-site updates)
- Several deferred typecheck warnings not blocking builds

No urgency. Rocky should re-evaluate priority relative to v3.2.0 release work and Mac signing.

### 7.5 Consider tightening Playwright retry policy

The E2E run on round 3 (CI run 25684815425) took 18m25s with 17 specs each timing out 30s × 2 attempts (with retry) = ~17 minutes pure wait time. With `retries: isCI ? 1 : 0`, a CI failure today doubles wait time. Now that we have working CI green-state, consider whether retries are still worth the wait — flaky-test mitigation vs. faster failure feedback.

**Recommendation:** keep retries=1 for now (the cost of a flaky-failure rerun is high if removed) but add a comment in `playwright.config.ts` noting the tradeoff. Revisit if v3.2.0+ E2E flake rate is above 1%.

---

## 8. Reference — files touched this session

| File | Why touched |
|---|---|
| `package.json` (root) | `packageManager` field added — `2dd70de` |
| `.github/workflows/ci.yml` | Dropped `version: 10`, added `libsecret-1-0`, fixed Playwright trace upload path — `2dd70de`, `b3f17dc` |
| `.github/workflows/conformance.yml` | Dropped `version: 10` — `2dd70de` |
| `.github/workflows/release.yml` | Dropped `version: 10` — `2dd70de` |
| `apps/desktop/src/preload/index.ts` | `ipcRenderer.setMaxListeners(50)` + JSDoc explaining architectural rationale — `4b4b3d8` |
| `apps/desktop/src/main/index.ts` | `appendSwitch` block added then reverted — `5cfa1a8`/`a4fa14e` (net zero change) |
| `apps/desktop/e2e/_launch-helpers.ts` | NEW file. `getCiLaunchArgs()` returns 4 switches on Linux CI. Underscore prefix excludes from Playwright spec discovery — `a4fa14e` |
| `apps/desktop/e2e/*.spec.ts` (17 files, 18 launch sites) | Import + spread `...getCiLaunchArgs()` into `electron.launch({ args })` — `a4fa14e` + `6699335` (lint fixup) |
| `docs/handoffs/2026-05-11-cross-platform-ci-unblock.md` | Persisted predecessor session log (was untracked) — `85509b7` |
| `docs/handoffs/2026-05-11-ci-fully-green.md` | THIS handoff — to be persisted in the next commit |

---

## 9. Reference — CI runs in chronological order

| Run ID | Commit | Trigger | Outcome | Duration | Notes |
|---|---|---|---|---|---|
| 25662058330 | `9f2fdf8` | pre-session HEAD | ❌ E2E only red | 22m | §7.1 baseline; check legs green, E2E `firstWindow` timeout under `viz_main_impl.cc(166)` error |
| 25682482142 | `85509b7` | mid-session (cancelled) | superseded | — | Concurrency-cancelled by `5cfa1a8` push |
| 25682895859 | `5cfa1a8` | round 1 §7.1 attempt | ❌ E2E only red, same symptoms | 22m | `appendSwitch` ran too late; identical GPU error to baseline |
| 25684659195 | `a4fa14e` | round 2 §7.1 attempt | ❌ Lint red on all 3 platforms | 1m (early fail) | CRLF + array width — biome rejected |
| 25684815425 | `6699335` | round 3 §7.1 attempt | ❌ E2E red but check legs green; GPU error gone | 22m | Total Electron silence; native module hang signature |
| 25686216344 | `b3f17dc` | round 4 §7.1 attempt | ✅ **All 4 jobs green** | 20m | Final fix: libsecret-1-0 |

---

## 10. Outstanding minor TODOs (non-blocking)

- **Node.js 20 deprecation warning** — `actions/checkout@v4`, `actions/setup-node@v4`, `pnpm/action-setup@v4` all run on Node.js 20 internally; GitHub will force Node 24 by 2026-06-02. CI annotation surfaces this on every run. Low priority — actions vendors will publish v5 releases before the deadline; just bump action versions when those land.
- **`windows-2025` → `windows-2025-vs2026` redirect** — annotation on Windows runners. No action needed; GitHub handles transparently before 2026-05-12.
- **The reverted `5cfa1a8` is still in git history** — that's correct (it's a real attempt with a real rationale documented in the commit message and the JSDoc that round 2 replaced). The commit message of `a4fa14e` explicitly cites why `5cfa1a8` didn't work and points future readers at the timing-of-Chromium-argv-parsing explanation. No rebase needed; the history reflects the actual debug sequence.

---

**End of handoff.** The cross-platform CI matrix is fully operational. v3.2.0 release is unblocked. Recommended next session: tag v3.2.0 OR investigate Apple Developer enrollment for signed Mac builds — Rocky's call which to prioritize.
