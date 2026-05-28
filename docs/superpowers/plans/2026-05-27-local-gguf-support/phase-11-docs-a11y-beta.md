# Phase 11 — Documentation, Accessibility, Polish & Beta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
>
> **Cross-phase rules:** See master plan § "Cross-phase rules" (CR-1 through CR-10).
>
> **Codex Stage 3 review:** REQUIRED. Final pre-release pass — Codex independent review is mandatory.

**Goal:** The final phase before shipping. Comprehensive user-guide section for Local Models. Full accessibility audit with axe-core in E2E. Verify every empty/loading/error state end-to-end. Performance budget verification. Smoke matrix manual sweep. Beta tag cut (`v3.3.0-beta.1`). 14-day field-test gate. Stable `v3.3.0` tag cut.

**Architecture:** No new code surface — this phase is documentation, polish, and the release-pipeline interaction. Existing pre-ship `ship-engineer` agent (master plan § CR-7 Stage 5) drives the actual tag cuts.

**Spec coverage:** Implements spec § 18 (testing strategy completion — manual smoke matrix), § 19 (every acceptance criterion verified one final time), § 17.x release process.

**Estimated PR size:** 1 doc-heavy PR (~3,000 LOC of markdown) + 1 small a11y-fixes PR (10s–100s LOC) + 1 release-prep PR (CHANGELOG version bump + tag).

---

## Files this phase touches

### New files

```
docs/user-guide/local-models/
├── README.md                                       (landing — overview + quick start)
├── getting-started.md                              (15-minute walkthrough)
├── library-management.md                           (file picker, folder watch, UNC/SMB)
├── hugging-face-browser.md                         (in-app HF browse + download)
├── advanced-tuning.md                              (n_ctx, n_gpu_layers, sampling, mmap/mlock)
├── lan-endpoints.md                                (LM Studio / Ollama / llama-server / KoboldCPP)
├── benchmarks.md                                   (interpreting tok/s and TTFT)
├── chat-templates.md                               (when to override; supported families)
├── tool-calling.md                                 (what tool-capable means; gating behavior)
├── embeddings-for-rag.md                           (switching to local embeddings + re-index)
├── troubleshooting.md                              (every LocalGgufError + remediation)
├── faq.md                                          (top 25 questions, GEO-friendly)
└── platform-notes.md                               (Windows / macOS / Linux specifics)

docs/qa/
└── local-gguf-smoke-matrix.md                      (manual test matrix per OS × GPU vendor)

apps/desktop/e2e/
└── local-gguf-accessibility.spec.ts                (axe-core full-page sweep)
```

### Modified files

```
README.md                                            (Features list — add Local GGUF)
CHANGELOG.md                                         (move [Unreleased] entries under [3.3.0])
docs/llms.txt                                        (add Local Models section)
docs/long-llms.txt                                   (full Local Models long-form section)
apps/desktop/package.json                            (version bump 3.2.1 → 3.3.0-beta.1)
package.json                                         (same)
packages/*/package.json                              (all 5 workspace packages bump)
apps/desktop/src/renderer/src/app/top-bar.test.tsx   (freeze-pin update for new version)
docs/user-guide/comprehensive-user-guide.md          (cross-link to Local Models section)
docs/user-guide/faq.md                               (add Local-Models FAQ entries)
docs/user-guide/glossary.md                          (add GGUF, llama.cpp, VRAM, quantization)
```

---

## Tasks

### Task 1: Branch + sync

```bash
git checkout main && git pull --ff-only
git checkout -b feat/v3.3.0-phase-11-docs-a11y-beta
```

---

### Task 2: User-guide section — Local Models

**Files:** all in `docs/user-guide/local-models/`

Each doc is a self-contained markdown file matching Team-X's existing user-guide style (executive tone, concrete examples, no fluff). Treat this like Rocky's blog-diligence rules — every claim sourced, every screenshot annotated, every step numbered.

- [ ] **Step 1: Read existing user-guide structure for style.**

```bash
cat docs/user-guide/comprehensive-user-guide.md | head -100
ls docs/user-guide/scenarios/
```

- [ ] **Step 2: Author `README.md` (landing page).**

```markdown
# Local Models

Run your own GGUF models on your own hardware — fully local, fully private, fully customizable. Team-X supports llama.cpp-format models from a local file, a network share, or a LAN-hosted inference server.

## Why local models

- **Privacy**: every token stays on your machine. No phone-home, no telemetry, no API logs in someone else's cloud.
- **Cost**: zero per-token cost.
- **Choice**: the open-source model ecosystem moves faster than any app vendor can keep up. Drop in whatever's hot this week.
- **Customization**: pick the exact quantization, context window, GPU offload, and chat template that fits your hardware.

## Quick start (90 seconds)

If you already have a `.gguf` file on your machine:

1. **Settings → Local Models → Library**.
2. Click **Add file**, pick your `.gguf`.
3. Wait ~2 seconds for the metadata read.
4. Click **Make Active** on the card.
5. Open a chat — your local model is now the active provider.

If you don't have one yet:

1. **Settings → Local Models → Hugging Face**.
2. Search "llama 3.1 8b instruct".
3. Click the result, then **Download** on the Q4_K_M file (≈ 4.9 GB).
4. Once downloaded, the model auto-appears in your library — see step 4 above.

## Where to next

- [Getting started](getting-started.md) — 15-minute walkthrough with screenshots
- [Library management](library-management.md) — files, folders, UNC/SMB shares
- [Advanced tuning](advanced-tuning.md) — when to change n_ctx, n_gpu_layers, mmap, mlock
- [Troubleshooting](troubleshooting.md) — every error and what to do about it
```

- [ ] **Step 3: Author each of the 12 sub-docs with the same level of care.** Each ~200–600 lines. Screenshots are placeholder file references (e.g., `images/library-view.png`) — actual screenshot capture happens during Task 9.

- [ ] **Step 4: Cross-link from `docs/user-guide/comprehensive-user-guide.md` and add glossary entries (`GGUF`, `llama.cpp`, `VRAM`, `quantization`, `Q4_K_M`, `tok/s`, `TTFT`).**

- [ ] **Step 5: Commit each doc separately.**

```
docs(user-guide): Local Models — README + landing
docs(user-guide): Local Models — getting-started walkthrough
docs(user-guide): Local Models — library-management (files / folders / UNC / SMB)
docs(user-guide): Local Models — hugging-face-browser
docs(user-guide): Local Models — advanced-tuning
docs(user-guide): Local Models — lan-endpoints (LM Studio / Ollama / llama-server / KoboldCPP)
docs(user-guide): Local Models — benchmarks
docs(user-guide): Local Models — chat-templates
docs(user-guide): Local Models — tool-calling
docs(user-guide): Local Models — embeddings-for-rag
docs(user-guide): Local Models — troubleshooting with every LocalGgufError variant + remediation
docs(user-guide): Local Models — faq (25 questions)
docs(user-guide): Local Models — platform-notes
docs(user-guide): cross-link + glossary entries for GGUF / llama.cpp / VRAM / quantization
```

---

### Task 3: Update `docs/llms.txt` and `docs/long-llms.txt`

**Files:**
- Modify: `docs/llms.txt`
- Modify: `docs/long-llms.txt`

Add a Local Models section to both. `llms.txt` gets a 3-line entry; `long-llms.txt` gets a 50–80 line richer summary with key concepts (privacy, hybrid runtime, library, intake modes, HF browser, embedding routing).

- [ ] **Step 1: Read existing structure.**

- [ ] **Step 2: Append.**

```
docs(llms.txt + long-llms.txt): add Local Models section
```

---

### Task 4: Update README.md "Features" list

**Files:**
- Modify: `README.md`

Insert a new bullet under "AI Runtime" matching the existing style:

```markdown
- **Local & networked GGUF support** — bundled multi-backend llama.cpp
  runtime (CUDA + ROCm + Vulkan + Metal + CPU); drop any `.gguf` file
  in (or point at a folder / UNC / SMB share) and chat with it on
  your own GPU; in-app Hugging Face browser + downloader; LRU pool
  for multiple loaded models with VRAM-aware eviction; live GPU offload
  visualizer with VRAM headroom guard; per-model chat-template and
  system-prompt overrides; tool-calling capability auto-detection;
  local GGUF embedding models for RAG; per-model benchmark runner.
```

- [ ] **Step 1: Modify README.**

- [ ] **Step 2: Commit.**

```
docs(readme): feature bullet for Local & networked GGUF support
```

---

### Task 5: Accessibility audit + axe-core E2E spec

**Files:**
- Create: `apps/desktop/e2e/local-gguf-accessibility.spec.ts`

Use `@axe-core/playwright` to run a no-violations audit on every Local Models tab + the AdvancedPanel modal + the BenchmarkPanel modal + the ReindexConfirmationDialog.

- [ ] **Step 1: Install axe-core/playwright (if not already).**

```bash
pnpm -F @team-x/desktop add -D @axe-core/playwright
```

- [ ] **Step 2: Write the spec.**

```ts
// apps/desktop/e2e/local-gguf-accessibility.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { launchAppForTest } from './helpers/launch';

const TABS = ['library', 'huggingface', 'runtime', 'endpoints', 'folders', 'defaults'] as const;

for (const tab of TABS) {
  test(`Local Models → ${tab} tab has no WCAG AA violations`, async () => {
    const { app, page } = await launchAppForTest();
    try {
      await page.evaluate((t) => window.teamXApi.localGguf.ui?.setTab?.(t), tab); // requires a small test hook; alternative is to navigate via UI
      await page.waitForTimeout(500);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations).toEqual([]);
    } finally {
      await app.close();
    }
  });
}

test('AdvancedPanel modal has no WCAG AA violations', async () => {
  const { app, page } = await launchAppForTest();
  try {
    // Open library, click Advanced on the first card if any; otherwise inject one for the test
    await page.evaluate(() => window.teamXApi.localGguf.library.addFile('/tmp/fake.gguf').catch(() => undefined));
    await page.waitForSelector('button:has-text("Advanced")');
    await page.click('button:has-text("Advanced")');
    await page.waitForSelector('[role=dialog]');
    const results = await new AxeBuilder({ page }).include('[role=dialog]').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  } finally {
    await app.close();
  }
});

// Repeat for BenchmarkPanel and ReindexConfirmationDialog
```

- [ ] **Step 3: Manual keyboard walkthrough.**

Run the app in dev mode; verify with Tab/Shift+Tab/Enter/Esc/Arrow keys:
- Library grid is fully keyboard-navigable.
- AdvancedPanel: every form field has a label; Esc closes; focus returns to the triggering button.
- ReindexConfirmationDialog: focus trapped while open, Esc cancels.
- BenchmarkPanel: same.
- HF browser: search input, result list, filter chips, download buttons all reachable + activatable via keyboard.

Document any failures, fix them inline (small commits per issue), re-run.

- [ ] **Step 4: Commit (one commit per a11y fix, plus the spec).**

```
test(e2e): local-gguf-accessibility — axe-core no-violations across every surface
fix(local-gguf-ui): focus trap on ReindexConfirmationDialog
fix(local-gguf-ui): aria-label on n_gpu_layers slider (was generic "range")
... etc per finding ...
```

---

### Task 6: Performance budget verification

Re-run the perf assertions defined in each prior phase end-to-end:

| Surface | Target | Where it's tested |
|---|---|---|
| GGUF metadata parse on 1 MiB head | < 50 ms | Phase 3 parser.test.ts |
| Library scan of 100 GGUFs (memfs) | < 200 ms | Phase 3 scanner.test.ts |
| Auto-tune computation | < 5 ms | Phase 2 auto-tune.test.ts |
| Port allocator success | ≥ 95% within 10 attempts | Phase 2 port-allocator.test.ts |
| GPU probe total | < 5 s | Phase 2 probe.integration.test.ts |
| Server spawn → ready (TinyLlama Q4_K_M on CUDA) | < 30 s | Phase 2 server-lifecycle.integration.test.ts |
| HF search round-trip (msw) | < 800 ms p50 | Phase 7 api.test.ts |
| Adapter overhead before first token | < 5 ms | Phase 4 local-gguf.test.ts |
| VRAM estimator | < 1 ms | Phase 6 vram-estimator.test.ts |
| LibraryView initial render | < 100 ms | Phase 5 library-view.test.tsx |
| Filter / sort re-render | < 16 ms | Phase 5 library-view.test.tsx |

- [ ] **Step 1: Re-run the full test suite with timing.**

```bash
pnpm test 2>&1 | tee perf-snapshot.txt
```

- [ ] **Step 2: Verify each target is met.** Any regression → fix and re-run.

- [ ] **Step 3: Capture the snapshot in the PR description for Stage 4 sign-off.**

---

### Task 7: Manual smoke matrix

**Files:**
- Create: `docs/qa/local-gguf-smoke-matrix.md`

Per-platform manual checks pinned in the matrix doc. Rocky's machines cover Windows NVIDIA + Mac arm64 reliably; the rest is contributor-driven during beta.

```markdown
# Local GGUF Smoke Matrix

Run before every `v3.3.0-*` tag cut. Tick the cell when verified by a real human on real hardware.

| Surface | Win NVIDIA | Win AMD | Win Intel iGPU | Linux NVIDIA | Linux AMD/ROCm | Mac arm64 | Mac x64 |
|---|---|---|---|---|---|---|---|
| App boots, GPU probe completes | | | | | | | |
| Backend auto-detected matches expectation | | | | | | | |
| Add local .gguf, see card within 3 s | | | | | | | |
| Make Active loads model within 30 s (7B Q4) | | | | | | | |
| Chat round-trip produces valid response | | | | | | | |
| Add UNC/SMB folder, files auto-populate | | | | | | | |
| NAS disconnect → flips to Unreachable, reconnect recovers | | | | | | | |
| HF search returns results | | | | | | | |
| HF download with resume works | | | | | | | |
| Backend manual override persists | | | | | | | |
| VRAM guard blocks an obvious OOM (try loading a model > VRAM) | | | | | | | |
| Pool eviction visible when loading a 2nd model with pool size = 1 | | | | | | | |
| Embedding model swap re-indexes RAG | | | | | | | |
| Tool-capable model receives MCP tools; non-capable doesn't (audit log inspection) | | | | | | | |
| Benchmark produces non-zero metrics | | | | | | | |
| Settings → Local Models all 6 tabs accessible via keyboard | | | | | | | |
| All error states render with discriminated branches (induce via path corruption etc.) | | | | | | | |

## Hardware roster

- **Rocky's box (Windows NVIDIA):** RTX 4090, 24 GB VRAM, Windows 11
- **Rocky's Mac (Mac arm64):** M3 Max, 64 GB unified memory, macOS Sequoia
- **Contributor needed:** Win AMD, Win Intel iGPU, Linux NVIDIA, Linux AMD/ROCm, Mac x64
```

- [ ] **Step 1: Author the matrix.**

- [ ] **Step 2: Add a note to `CONTRIBUTING.md` inviting field-testers for the missing rows during the beta period.**

- [ ] **Step 3: Commit.**

```
docs(qa): local-gguf-smoke-matrix — per-platform manual checks, contributor invite
```

---

### Task 8: Verify every spec acceptance criterion

Walk the 13 acceptance criteria from spec § 19 one final time. Each criterion has a paired test (unit, integration, or E2E) — verify it's green.

| # | Criterion | Test reference |
|---|---|---|
| 1 | Drop GGUF → card in 3 s → chat in 30 s | smoke matrix + Phase 2 integration test |
| 2 | UNC/SMB folder auto-populates within 5 s | Phase 3 network resilience E2E |
| 3 | LAN endpoint reachable | Phase 5 endpoints E2E |
| 4 | HF search → download → in library → chat | Phase 7 HF browser E2E |
| 5 | Pool LRU eviction visible | Phase 2 + smoke matrix |
| 6 | VRAM guard blocks OOM | Phase 6 vram-guard.test.ts + smoke matrix |
| 7 | Embedding swap → re-index | Phase 9 E2E |
| 8 | Tool-capable models get tools; others don't | Phase 8 + audit log inspection |
| 9 | NAS disconnect graceful | Phase 3 network resilience E2E |
| 10 | Every LocalGgufError has UI snapshot | Phase 5 error-state.test.tsx |
| 11 | All IPC channels typed + unit-tested | Phases 1, 2, 3, 4, 7, 10 handler tests |
| 12 | Installer size ≤ 500 MB per OS delta | Phase 2 + CHANGELOG documentation |
| 13 | Beta tag → 14 days zero P0/P1 → stable | Task 11 below |

- [ ] **Step 1: Author a verification checklist as a doc.**

```
docs(spec): acceptance-criteria-verification.md — 13-row mapping with test refs
```

- [ ] **Step 2: Run each test individually; record PASS/FAIL.**

- [ ] **Step 3: Commit + attach to PR.**

---

### Task 9: Screenshot capture for user docs

The placeholder `images/` references in user-guide docs need real screenshots.

- [ ] **Step 1: Run `pnpm -F @team-x/desktop dev`.**

- [ ] **Step 2: Capture screenshots for each user-guide doc** at the points referenced. Save to `docs/user-guide/local-models/images/`.

- [ ] **Step 3: Optimize PNGs** (`pnpm dlx imagemin docs/user-guide/local-models/images/*.png --out-dir=docs/user-guide/local-models/images`).

- [ ] **Step 4: Commit.**

```
docs(user-guide): screenshots for Local Models section (optimized PNGs)
```

---

### Task 10: Version bump + CHANGELOG finalize

**Files:**
- Modify: `package.json` + `apps/desktop/package.json` + each of the 5 workspace packages' `package.json`
- Modify: `apps/desktop/src/renderer/src/app/top-bar.test.tsx` (freeze-pin constants)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump every workspace `version` from `3.2.1` to `3.3.0-beta.1`.**

- [ ] **Step 2: Update the freeze-pin test constants** so it asserts the new version across all packages.

- [ ] **Step 3: Move every `[Unreleased]` CHANGELOG entry under a new `[3.3.0]` section header dated 2026-XX-XX. Confirm full coverage:**

```markdown
## [3.3.0] — 2026-XX-XX

### Added

#### Local & Networked GGUF Support (v3.3.0 headline feature)

- Bundled multi-backend llama.cpp runtime (CUDA + ROCm + Vulkan + Metal + CPU; auto-detected with manual override). Installer growth +250–500 MB per OS.
- Library: file picker (incl. multi-part split GGUFs), folder scan + auto-watch (local + UNC/SMB), remote LAN endpoints (LM Studio / Ollama / llama-server / KoboldCPP).
- LRU concurrency pool with VRAM-aware eviction, default 1 active model, user-configurable cap.
- GPU offload visualizer with live VRAM projection + pre-flight VRAM headroom guard (blocks OOM-bound loads).
- Per-model Advanced panel: n_ctx, n_gpu_layers, n_batch, n_threads, temperature, top_p, top_k, repeat_penalty, mmap, mlock, flash_attention. Reset-to-Auto.
- Chat-template auto-detect (Llama 3 / ChatML / Mistral-Instruct / Hermes / Gemma) + per-model override.
- Per-model system-prompt override.
- Tool-capability detection (10 model families) + MCP tool-injection gating with observable `tools_stripped` event.
- Hugging Face Hub in-app browser, search + filters, model card preview, resumable downloads with SHA verification, progress strip with pause/resume/cancel. Optional HF token (keytar) raises rate limits.
- Local embedding models for RAG via local-gguf-embed adapter. Settings → Defaults → embedding model picker. Switching triggers amber re-index confirmation; existing rag-rebuild service handles the work.
- Per-model benchmark runner (3-run median; prompt-eval / gen tok/s / TTFT / VRAM peak). Persisted history.
- Network-share resilience: 30 s base poll, exponential backoff to 5 min ceiling, graceful Unreachable state, auto-recovery.
- Full Settings → Local Models page (Library / Hugging Face / Runtime / Endpoints / Folders / Defaults). Keyboard shortcuts Cmd/Ctrl+Shift+L (Library) and Cmd/Ctrl+Shift+H (HF). WCAG 2.1 AA across every surface.

### Changed

- `@team-x/provider-router` gains two new adapters (`local-gguf` chat, `local-gguf-embed` embeddings). Adaptive routing prefers `local-gguf` in Lean / Always-On strategies when the pool is non-empty.
- `@team-x/intelligence` RAG embeddings now route through a new EmbeddingRouter that branches between local-gguf-embed and the existing path based on settings.

### Migrations

- `0014_local_gguf` — 5 new tables (`local_models`, `local_model_advanced_params`, `local_model_benchmarks`, `local_model_endpoints`, `local_model_watch_folders`) with full CHECK constraints + indexes + cascade FKs.

### Documentation

- New `docs/user-guide/local-models/` section (13 docs).
- `docs/qa/local-gguf-smoke-matrix.md` — manual smoke matrix per OS × GPU.
- `docs/spikes/2026-05-27-S{1..5}-*.md` — Phase 0 spike writeups.
- `docs/llms.txt` + `docs/long-llms.txt` updated.
- README features list updated.

### Internal

- 5 Phase 0 spikes de-risked the binary fetch pipeline, GPU probe, GGUF parser, llama-server lifecycle, and HF API client before any production code landed.
- All work TDD + 5-stage review wall (CI / sub-agent / Codex / Rocky / ship-engineer). Codex Stage 3 mandatory on Phases 1–4, 7, 8, 11 (security-sensitive boundaries). Coverage ≥ 90% line+branch on every new module in `@team-x/local-gguf-runtime` and new adapters in `@team-x/provider-router`.
```

- [ ] **Step 4: Commit.**

```
chore(release): bump to v3.3.0-beta.1 + finalize CHANGELOG
```

---

### Task 11: Beta tag cut + 14-day field test

- [ ] **Step 1: Run the full test suite one last time.**

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm -F @team-x/desktop test:e2e
pnpm audit:claims:strict
pnpm autonomy:doctor
```

All green required.

- [ ] **Step 2: Invoke `ship-engineer` pre-ship gate** per master plan § CR-7 Stage 5. Resolve any blocking findings.

- [ ] **Step 3: Push the branch + open the PR + complete Stages 2/3/4 review wall.**

- [ ] **Step 4: After merge to main, cut the beta tag.**

```bash
git checkout main
git pull --ff-only
git tag -a v3.3.0-beta.1 -m "v3.3.0-beta.1 — Local & Networked GGUF Support beta"
git push origin v3.3.0-beta.1
```

`release.yml` builds the cross-OS installer set incl. the new llama.cpp binaries via `scripts/fetch-llama-binaries.mjs --all`. Verify the resulting draft release has the canonical 14-asset shape PLUS the binaries vendored inside (size will reflect the +250–500 MB delta).

- [ ] **Step 5: Publish the beta to GitHub Releases.**

- [ ] **Step 6: Open a tracking issue** "v3.3.0 beta field-test — closes 2026-XX-XX (14 days from publish)" — enumerate the smoke matrix gaps, ask contributors to file P0/P1 reports.

- [ ] **Step 7: 14-day clock starts.**

  - During the period: triage every report. P0 (broken core feature) and P1 (broken edge feature) block the stable cut. P2/P3 land in `v3.3.1+` patch releases.
  - Day 7: mid-period checkpoint blog post on `strategia-x.com/blog` per Rocky's blog-diligence rule (separate session, separate brainstorm, full sourcing).
  - Day 14: if zero P0/P1 outstanding → proceed to stable cut. If any P0/P1: cut `v3.3.0-beta.2` with the fixes and re-run the 14-day clock.

- [ ] **Step 8: Stable cut after 14 clean days.**

```bash
git checkout main
git pull --ff-only
# Bump version 3.3.0-beta.1 → 3.3.0 in all 7 package.json + freeze-pin
git commit -am "chore(release): bump v3.3.0-beta.1 → v3.3.0 stable"
git push
git tag -a v3.3.0 -m "v3.3.0 — Local & Networked GGUF Support"
git push origin v3.3.0
```

`release.yml` runs again, produces the stable installer set, publishes to GitHub Releases. electron-updater notification UI in existing v3.2.x installs will offer the upgrade (zero phone-home — user-triggered only).

- [ ] **Step 9: Announcement blog post** on `strategia-x.com/blog` per Rocky's blog-diligence rule. Mirror to any spoke sites per the parent-blog-mirroring rule.

---

## Phase 11 — Spec coverage map

| Spec section | Implemented by |
|---|---|
| § 17.11 docs + a11y + beta phase | Tasks 2, 5, 11 |
| § 18 testing strategy — manual smoke matrix | Task 7 |
| § 19 every acceptance criterion verified | Task 8 |
| § 19 acceptance criterion #13 (14-day field test) | Task 11 |
| Spec § 11 installer size growth documented | CHANGELOG (Task 10) |
| llms.txt + long-llms.txt updates | Task 3 |

---

## Closing — what shipping v3.3.0 means

This is the largest single feature in Team-X's history. The MIT-public posture demanded zero corner-cutting; the quality framework (TDD + 5-stage review + per-phase quality gate + 14-day field test) is what made shipping the 11 phases feasible without the wheels falling off. Every error has a designed UI state. Every IPC channel is typed end-to-end. Every spike was time-boxed and concluded with a go/no-go. Every phase merged through the same five stages: CI, sub-agent review, Codex independent review (where mandated), Rocky sign-off, ship-engineer pre-ship gate.

After v3.3.0 stable, the v2 enhancement spec opens. Per-role model pinning. Arena. Speculative decoding. BYO-binary. Multi-GPU. The CLI (Feature B from the brainstorm) opens as its own independent spec + plan + implementation cycle, with the GGUF IPC contracts shipped here already CLI-ready.
