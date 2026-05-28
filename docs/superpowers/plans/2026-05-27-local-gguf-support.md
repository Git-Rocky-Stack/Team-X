# Local & Networked GGUF Support — Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement each phase task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This is the master plan.** It contains: (a) cross-phase rules and shared definitions that every phase plan depends on, (b) Phase 0 spike tasks in full detail, and (c) the index to per-phase plan files for Phases 1–11. Each phase file is a self-contained PR plan executable in one subagent session.

**Goal:** Ship local & networked GGUF support in Team-X v3.3.0 — a bundled multi-backend llama.cpp runtime, full GGUF library UX (file/folder/UNC/SMB + LAN endpoints), Hugging Face Hub browser, GPU offload visualization, VRAM headroom guard, chat-template auto-detect + tool-calling gating, local embedding models for RAG, and per-model benchmarking — under a non-negotiable TDD + 5-stage review-wall + per-phase quality-gate discipline.

**Architecture:** New `@team-x/local-gguf-runtime` package owns library scanning, llama.cpp-server lifecycle, LRU pool, GPU probe, HF client, benchmark runner, and GGUF metadata parsing. Two new adapters in `@team-x/provider-router` (`local-gguf` chat + `local-gguf-embed` embeddings) wrap llama.cpp-server's OpenAI-compatible HTTP. Renderer adds a new top-level Settings page (`Settings → Local Models`) with Library / Hugging Face / Runtime / Endpoints / Folders / Defaults tabs. Five new SQLite tables under Drizzle migration `0014_local_gguf`. Llama.cpp binaries vendored at install time under `apps/desktop/resources/llama-server/<platform>/<backend>/`.

**Tech Stack:** TypeScript (strict), Node 22.22.2, pnpm 9.15.9, Electron 31.7.7, better-sqlite3 + Drizzle ORM, React 19 + Tailwind + shadcn/ui, vitest 2.x, Playwright 1.x, Biome 1.9 (root lint), ESLint 9 (renderer lint), msw 2.x (HTTP mocking), memfs 4.x (filesystem mocking). External: `ggerganov/llama.cpp` (binary releases), Hugging Face Hub public API.

**Source spec:** `docs/superpowers/specs/2026-05-27-local-gguf-support-design.md` (commit `ca24e59`). Every phase must satisfy spec acceptance criteria § 19.

---

## Table of contents

- [Cross-phase rules (read first)](#cross-phase-rules-read-first)
- [Global file structure](#global-file-structure)
- [Shared TypeScript definitions (locked in Phase 1)](#shared-typescript-definitions-locked-in-phase-1)
- [Phase 0 — Spikes (in this file)](#phase-0--spikes)
  - [Spike S1 — llama.cpp binary fetch + version pin](#spike-s1--llamacpp-binary-fetch--version-pin)
  - [Spike S2 — GPU probe cross-platform](#spike-s2--gpu-probe-cross-platform)
  - [Spike S3 — GGUF metadata parser](#spike-s3--gguf-metadata-parser)
  - [Spike S4 — llama-server lifecycle](#spike-s4--llama-server-lifecycle)
  - [Spike S5 — Hugging Face API client](#spike-s5--hugging-face-api-client)
- [Phases 1–11 — Index to per-phase plans](#phases-111--index-to-per-phase-plans)

---

## Cross-phase rules (read first)

These rules apply to every phase. Each per-phase plan re-states them as a header reminder but the canonical definitions live here.

### CR-1 — Branch naming

Every phase ships on its own branch. Naming convention:

```
feat/v3.3.0-phase-NN-<slug>
```

Examples: `feat/v3.3.0-phase-01-foundation`, `feat/v3.3.0-phase-07-hf-browser`. Spike branches:

```
spike/v3.3.0-S<N>-<slug>
```

Examples: `spike/v3.3.0-S1-llama-binary-fetch`, `spike/v3.3.0-S3-gguf-parser`.

### CR-2 — Commit message style

Match the existing Team-X commit style (verified via `git log --oneline -20`). Format:

```
<type>(<scope>): <subject>
```

Where `<type>` ∈ `{feat, fix, refactor, test, docs, chore, perf, build}`, `<scope>` is short (e.g. `local-gguf`, `provider-router`, `intelligence`, `db`, `ui`, `e2e`), `<subject>` is imperative ("add", "wire", "fix"), starts lowercase, no trailing period. Body explains WHY when non-obvious. **NEVER use placeholder subjects like `re`, `wip`, `update`, `fix stuff`** — Rocky's memory `feedback_commit_messages` explicitly prohibits this.

Co-author trailer on every commit (Claude pair-programming convention):

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### CR-3 — TDD discipline (red → green → refactor)

Every task that produces production code follows this exact loop:

1. Write the failing test first.
2. Run the test. Confirm it fails for the right reason (NOT a syntax error or missing import — actually because the production code under test is missing or wrong).
3. Write the minimum production code to make the test pass.
4. Run the test. Confirm it passes.
5. Refactor if needed. Re-run. Confirm still green.
6. Commit (test + production code together).

Tasks in per-phase plans use this exact step structure. Skipping the "run and confirm fail" step is a red-flag deviation — re-do that task.

### CR-4 — Surface-specific test strategy

Use the right test type for the surface. The spec § 16.1 maps surfaces to strategies; per-phase plans cite the relevant row.

| Surface | Strategy |
|---|---|
| Pure-function logic (parsers, math, state machines) | TDD unit (vitest) — fixtures only, no I/O |
| Filesystem I/O | TDD unit with `memfs` + 1 integration test with real FS |
| HTTP clients | TDD unit with `msw` + 1 nightly integration (env-gated) |
| Subprocess lifecycle | Integration test spawning real CPU-built llama-server binary |
| GPU probe | Integration test running per-OS in CI |
| IPC handlers | TDD unit (service is mocked at boundary) |
| Renderer components | RTL unit + Playwright visual snapshot |
| End-to-end user flows | Playwright E2E against stub backend (no real GPU needed) |

### CR-5 — Coverage targets

- ≥ **90% line + branch** on every new module in `@team-x/local-gguf-runtime`.
- ≥ **90% line + branch** on new adapters in `@team-x/provider-router`.
- Renderer code held to the existing 80% repo bar.
- Coverage report attached to every phase PR via `pnpm test:coverage` JSON output.

### CR-6 — Per-phase quality-gate checklist (blocking)

Every phase PR must check all of these before requesting review. Per-phase plans repeat this list at the end.

- [ ] `pnpm typecheck` — zero errors; zero new `any` introduced.
- [ ] `pnpm lint` (Biome) clean + renderer ESLint clean.
- [ ] `pnpm test` — 100% pass; ≥ 90% line+branch on new code (where applicable per CR-5).
- [ ] `pnpm test:coverage` JSON report attached to PR.
- [ ] `pnpm -F @team-x/desktop test:e2e` — 100% pass; ≥ 1 new E2E spec for any phase touching renderer.
- [ ] `pnpm audit:claims:strict` clean.
- [ ] `pnpm autonomy:doctor` clean.
- [ ] WCAG 2.1 AA verified for any UI delivered (axe-core E2E spec + manual keyboard walkthrough).
- [ ] Performance assertion: phase-specific perf-target met and asserted in a test.
- [ ] Security scan: any new `spawn` / `exec` argument-injection-reviewed; any new path read traversal-reviewed; any new HTTP call SSRF-reviewed.
- [ ] `CHANGELOG.md` `[Unreleased]` entry added.
- [ ] User-guide docs updated if user-visible surface delivered.
- [ ] `docs/llms.txt` + `docs/long-llms.txt` updated if user-guide content changed.
- [ ] No new IPC channel without a `shared-types` contract + unit test.
- [ ] No new SQL migration without a forward-only test + rollback note in header.

### CR-7 — Five-stage code review wall (blocking)

Every phase PR must pass these stages in order before merge. Per-phase plans cite which stages apply.

| Stage | Gate | Mechanism |
|---|---|---|
| 1 | Automated CI | `ci.yml` green — lint + typecheck + tests × 3 OSes + E2E smoke. |
| 2 | Internal review (sub-agent) | Invoke `superpowers:requesting-code-review`. `feature-dev:code-reviewer` agent reviews entire diff. |
| 3 | Codex independent review | Invoke `dev-tools:codex-review`. **MANDATORY for phases touching: subprocess spawn, file paths, HTTP/network, keytar, IPC bridge.** Maps below. Any HIGH finding blocks merge. |
| 4 | Rocky sign-off | Read-through of phase summary + UI screenshots/recordings + benchmark numbers. |
| 5 | Pre-ship gate | `ship-engineer` agent — only at release-tag time (beta + stable cuts). |

**Codex (Stage 3) phase mapping:**

| Phase | Codex mandatory? | Reason |
|---|---|---|
| 0 (spikes) | Optional | Writeup is the artifact, not the code |
| 1 (Foundation) | Yes | IPC contracts + migration |
| 2 (Runtime + Pool) | Yes | Subprocess spawn |
| 3 (Library + Scanning) | Yes | File path handling, UNC/SMB |
| 4 (Provider integration) | Yes | Security-sensitive boundary |
| 5 (Library UI) | No | Pure renderer (unless XSS surface introduced) |
| 6 (GPU visualizer + VRAM guard) | No | Pure renderer + math |
| 7 (HF Browser) | Yes | HTTP, downloads, SHA |
| 8 (Chat-template + tool gating) | Yes | Provider-router behavior change |
| 9 (Local embeddings) | No | Internal RAG integration |
| 10 (Benchmark runner) | No | Internal computation |
| 11 (Docs + a11y + beta) | Yes | Final pre-release pass |

### CR-8 — Verification before completion

Before marking ANY task `[x]` in a per-phase plan, invoke the `superpowers:verification-before-completion` skill discipline:

1. Did you actually run the test command and see green output? (Not "should pass" — actually green.)
2. Did you actually run typecheck and see zero errors? (Not "should be clean" — actually zero.)
3. Did you actually inspect the diff before staging?
4. Did the commit actually land? (`git log -1` confirms.)

Evidence-before-assertion. Always.

### CR-9 — Frequent commits

Every step that says "Commit" is a real, atomic commit. Multiple commits per task is normal. The skill template explicitly favors frequent small commits over batched giant ones. PRs are squashed at merge if reviewers prefer a single landed commit per phase.

### CR-10 — Spec-anchored task IDs

Every task references the spec section it implements (e.g. *"Implements spec § 7 table `local_models`"* or *"Implements spec § 12.1 GPU probe"*). This is how Stage 2/3 reviewers verify spec coverage.

---

## Global file structure

This is the canonical map of every file the v1 GGUF feature creates or modifies. Per-phase plans cite which subset they touch. **No file appears outside this list — if a phase needs something not here, the master plan is updated first.**

### New files

```
packages/local-gguf-runtime/                          ← Phase 1
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── biome.json (extends root)
├── src/
│   ├── index.ts                                     ← public exports
│   ├── errors.ts                                    ← LocalGgufError union
│   ├── metadata/
│   │   ├── index.ts
│   │   ├── parser.ts                                ← Phase 3 (uses S3 findings)
│   │   ├── parser.test.ts
│   │   ├── embedding-arches.ts                      ← Phase 9
│   │   ├── embedding-arches.test.ts
│   │   ├── tool-capable-list.ts                     ← Phase 8 (curated list)
│   │   ├── tool-capable-list.test.ts
│   │   ├── vram-estimator.ts                        ← Phase 6
│   │   ├── vram-estimator.test.ts
│   │   ├── chat-template-detect.ts                  ← Phase 8
│   │   └── chat-template-detect.test.ts
│   ├── library/
│   │   ├── index.ts
│   │   ├── scanner.ts                               ← Phase 3
│   │   ├── scanner.test.ts
│   │   ├── folder-watcher.ts                        ← Phase 3
│   │   ├── folder-watcher.test.ts
│   │   ├── split-gguf.ts                            ← Phase 3 (multi-part files)
│   │   ├── split-gguf.test.ts
│   │   ├── resilience.ts                            ← Phase 3 (network-share polling)
│   │   └── resilience.test.ts
│   ├── runtime/
│   │   ├── index.ts
│   │   ├── server-lifecycle.ts                      ← Phase 2 (uses S4)
│   │   ├── server-lifecycle.test.ts
│   │   ├── server-lifecycle.integration.test.ts
│   │   ├── port-allocator.ts                        ← Phase 2
│   │   ├── port-allocator.test.ts
│   │   ├── auto-tune.ts                             ← Phase 2
│   │   ├── auto-tune.test.ts
│   │   ├── binary-resolver.ts                       ← Phase 2
│   │   └── binary-resolver.test.ts
│   ├── pool/
│   │   ├── index.ts
│   │   ├── lru-pool.ts                              ← Phase 2
│   │   ├── lru-pool.test.ts
│   │   ├── auto-swap.ts                             ← Phase 2
│   │   └── auto-swap.test.ts
│   ├── gpu-probe/
│   │   ├── index.ts
│   │   ├── nvidia.ts                                ← Phase 2 (uses S2)
│   │   ├── nvidia.test.ts
│   │   ├── rocm.ts
│   │   ├── rocm.test.ts
│   │   ├── vulkan.ts
│   │   ├── vulkan.test.ts
│   │   ├── metal.ts
│   │   ├── metal.test.ts
│   │   ├── cpu.ts
│   │   ├── cpu.test.ts
│   │   ├── ranking.ts
│   │   ├── ranking.test.ts
│   │   ├── probe.ts                                 ← orchestrates all probes
│   │   ├── probe.test.ts
│   │   └── probe.integration.test.ts
│   ├── hf-client/
│   │   ├── index.ts
│   │   ├── api.ts                                   ← Phase 7 (uses S5)
│   │   ├── api.test.ts
│   │   ├── api.integration.test.ts
│   │   ├── search.ts
│   │   ├── search.test.ts
│   │   ├── download.ts
│   │   ├── download.test.ts
│   │   └── rate-limit.ts
│   └── benchmark/
│       ├── index.ts
│       ├── runner.ts                                ← Phase 10
│       └── runner.test.ts
└── README.md
```

```
packages/provider-router/src/adapters/
├── local-gguf.ts                                    ← Phase 4 (chat adapter)
├── local-gguf.test.ts
├── local-gguf-embed.ts                              ← Phase 4 (embeddings)
├── local-gguf-embed.test.ts
└── local-gguf-url-resolver.ts                       ← Phase 4 (pool / endpoint lookup)
    local-gguf-url-resolver.test.ts
```

```
packages/shared-types/src/
├── local-gguf.ts                                    ← Phase 1 (IPC contracts, entities, GpuInventory, etc.)
└── local-gguf.test.ts                               ← type-level + runtime guard tests
```

```
apps/desktop/src/main/
├── db/migrations/0014_local_gguf.sql                ← Phase 1
├── db/migrations/meta/0014_snapshot.json            ← generated by drizzle-kit
├── db/repos/
│   ├── local-models.ts                              ← Phase 1
│   ├── local-models.test.ts
│   ├── local-model-advanced-params.ts               ← Phase 1
│   ├── local-model-advanced-params.test.ts
│   ├── local-model-benchmarks.ts                    ← Phase 10
│   ├── local-model-benchmarks.test.ts
│   ├── local-model-endpoints.ts                     ← Phase 1
│   ├── local-model-endpoints.test.ts
│   ├── local-model-watch-folders.ts                 ← Phase 1
│   └── local-model-watch-folders.test.ts
├── services/local-gguf/
│   ├── library-service.ts                           ← Phase 3
│   ├── library-service.test.ts
│   ├── runtime-service.ts                           ← Phase 2
│   ├── runtime-service.test.ts
│   ├── pool-service.ts                              ← Phase 2
│   ├── pool-service.test.ts
│   ├── hf-service.ts                                ← Phase 7
│   ├── hf-service.test.ts
│   ├── benchmark-service.ts                         ← Phase 10
│   ├── benchmark-service.test.ts
│   ├── endpoint-service.ts                          ← Phase 5
│   └── endpoint-service.test.ts
├── ipc/
│   ├── local-gguf-library-handlers.ts               ← Phase 1 (stubs) → Phase 3 (filled)
│   ├── local-gguf-library-handlers.test.ts
│   ├── local-gguf-runtime-handlers.ts               ← Phase 1 → Phase 2
│   ├── local-gguf-runtime-handlers.test.ts
│   ├── local-gguf-hf-handlers.ts                    ← Phase 7
│   ├── local-gguf-hf-handlers.test.ts
│   ├── local-gguf-benchmark-handlers.ts             ← Phase 10
│   ├── local-gguf-benchmark-handlers.test.ts
│   ├── local-gguf-endpoint-handlers.ts              ← Phase 5
│   └── local-gguf-endpoint-handlers.test.ts
└── services/runtime-settings/local-gguf-settings.ts ← Phase 1 (typed accessor)
    services/runtime-settings/local-gguf-settings.test.ts
```

```
apps/desktop/src/preload/                            ← extend existing TeamXApi
└── local-gguf-api.ts                                ← Phase 1 (preload bridge)
```

```
apps/desktop/src/renderer/src/
├── features/local-gguf/                             ← Phases 5–10
│   ├── settings-local-models-page.tsx               ← Phase 5
│   ├── library-view.tsx                             ← Phase 5
│   ├── library-view.test.tsx
│   ├── model-card.tsx                               ← Phase 5
│   ├── model-card.test.tsx
│   ├── library-filter-chips.tsx                     ← Phase 5
│   ├── library-filter-chips.test.tsx
│   ├── folders-tab.tsx                              ← Phase 5
│   ├── folders-tab.test.tsx
│   ├── endpoints-tab.tsx                            ← Phase 5
│   ├── endpoints-tab.test.tsx
│   ├── runtime-tab.tsx                              ← Phase 5
│   ├── runtime-tab.test.tsx
│   ├── advanced-panel.tsx                           ← Phase 6
│   ├── advanced-panel.test.tsx
│   ├── gpu-offload-visualizer.tsx                   ← Phase 6
│   ├── gpu-offload-visualizer.test.tsx
│   ├── hf-browser.tsx                               ← Phase 7
│   ├── hf-browser.test.tsx
│   ├── hf-download-strip.tsx                        ← Phase 7
│   ├── hf-download-strip.test.tsx
│   ├── benchmark-panel.tsx                          ← Phase 10
│   ├── benchmark-panel.test.tsx
│   ├── defaults-tab.tsx                             ← Phase 9 (embedding model selection)
│   └── defaults-tab.test.tsx
└── hooks/
    ├── use-local-models.ts                          ← Phase 5
    ├── use-local-models.test.ts
    ├── use-local-model-pool.ts                      ← Phase 5
    ├── use-local-model-pool.test.ts
    ├── use-hf-search.ts                             ← Phase 7
    ├── use-hf-search.test.ts
    ├── use-hf-downloads.ts                          ← Phase 7
    └── use-hf-downloads.test.ts
```

```
apps/desktop/resources/llama-server/                 ← Phase 2 (vendored at install)
├── win32-x64/{cuda,rocm,vulkan,cpu}/server.exe + deps
├── win32-arm64/{vulkan,cpu}/server.exe + deps
├── linux-x64/{cuda,rocm,vulkan,cpu}/server + deps
├── darwin-arm64/metal/server
└── darwin-x64/metal/server
```

```
scripts/
├── fetch-llama-binaries.mjs                         ← Phase 0 S1 spike → Phase 2 (production)
└── llama-binaries-manifest.json                     ← SHA manifest, committed
```

```
e2e/
├── local-gguf-library.spec.ts                       ← Phase 5
├── local-gguf-hf-browser.spec.ts                    ← Phase 7
├── local-gguf-loading.spec.ts                       ← Phase 2
├── local-gguf-rag-embedding-switch.spec.ts          ← Phase 9
├── local-gguf-network-share-resilience.spec.ts     ← Phase 3
└── local-gguf-accessibility.spec.ts                 ← Phase 11
```

```
docs/
├── spikes/
│   ├── 2026-05-27-S1-llama-binary-fetch.md          ← Phase 0
│   ├── 2026-05-27-S2-gpu-probe-cross-platform.md    ← Phase 0
│   ├── 2026-05-27-S3-gguf-metadata-parser.md        ← Phase 0
│   ├── 2026-05-27-S4-llama-server-lifecycle.md     ← Phase 0
│   └── 2026-05-27-S5-hf-api-client.md               ← Phase 0
├── user-guide/local-models/
│   ├── README.md                                    ← Phase 11
│   ├── getting-started.md
│   ├── library-management.md
│   ├── hugging-face-browser.md
│   ├── advanced-tuning.md
│   ├── lan-endpoints.md
│   ├── benchmarks.md
│   ├── troubleshooting.md
│   └── faq.md
└── qa/local-gguf-smoke-matrix.md                    ← Phase 11
```

### Modified files

```
package.json                                         ← Phase 0/1 (add llamaCppRelease pin)
apps/desktop/package.json                            ← Phase 2 (prepack hook, electron-builder file allowlist)
apps/desktop/electron-builder.yml                    ← Phase 2 (resources allowlist + asarUnpack for binaries)
apps/desktop/drizzle.config.ts                       ← Phase 1 (no functional change, verify config)
apps/desktop/src/main/db/client.ts                   ← Phase 1 (register new repos)
apps/desktop/src/main/db/migrate.ts                  ← Phase 1 (no change typically, verify migration runs)
apps/desktop/src/preload/index.ts                    ← Phase 1 (expose local-gguf API surface)
apps/desktop/src/renderer/src/types/window.d.ts      ← Phase 1 (extend TeamXApi types)
packages/provider-router/src/registry.ts             ← Phase 4 (register local-gguf + local-gguf-embed)
packages/provider-router/src/index.ts                ← Phase 4 (export new adapters)
packages/provider-router/src/adaptive-routing.ts     ← Phase 4 (handle local-gguf in Lean/Auto/Always-On)
packages/intelligence/src/rag/embeddings.ts          ← Phase 9 (route to local-gguf-embed when configured)
CHANGELOG.md                                         ← every phase
docs/llms.txt                                        ← Phase 11
docs/long-llms.txt                                   ← Phase 11
```

---

## Shared TypeScript definitions (locked in Phase 1)

These types are defined in `packages/shared-types/src/local-gguf.ts` during Phase 1 and consumed unchanged by every subsequent phase. **If a later phase needs a shape change, the master plan is updated first AND every existing consumer is migrated in the same commit.**

```typescript
// packages/shared-types/src/local-gguf.ts

export type GpuBackend = 'cuda' | 'rocm' | 'vulkan' | 'metal' | 'cpu';

export type SourceType = 'file' | 'folder-entry' | 'remote-endpoint';

export type ModelStatus =
  | 'cold'
  | 'loading'
  | 'loaded'
  | 'error'
  | 'unreachable'
  | 'missing';

export type EndpointStatus =
  | 'unknown'
  | 'reachable'
  | 'unreachable'
  | 'auth-failed';

export type WatchFolderStatus = 'unknown' | 'reachable' | 'unreachable';

export interface GpuDevice {
  name: string;
  vramMb: number;
  backend: GpuBackend;
}

export interface GpuInventory {
  detectedAt: number;
  cuda: {
    available: boolean;
    devices: GpuDevice[];
    driverVersion?: string;
    cudaVersion?: string;
  };
  rocm: {
    available: boolean;
    devices: GpuDevice[];
    rocmVersion?: string;
  };
  vulkan: { available: boolean; devices: GpuDevice[] };
  metal: { available: boolean; devices: GpuDevice[] };
  cpu: { cores: number; ramMb: number };
}

export interface GgufMetadata {
  arch: string;
  paramsBillions: number | null;
  quant: string | null;
  contextMax: number | null;
  chatTemplate: string | null;
  isEmbeddingModel: boolean;
  isToolCapable: boolean;
  fileSizeBytes: number;
  sha256: string | null;
}

export interface LocalModel {
  id: string;
  displayName: string;
  sourceType: SourceType;
  sourcePath: string | null;
  endpointId: string | null;
  ggufArch: string | null;
  ggufParamsB: number | null;
  ggufQuant: string | null;
  ggufContextMax: number | null;
  ggufSizeBytes: number | null;
  ggufSha256: string | null;
  ggufChatTemplate: string | null;
  isEmbeddingModel: boolean;
  isToolCapable: boolean;
  hfRepoId: string | null;
  hfFilename: string | null;
  license: string | null;
  chatTemplateOverride: string | null;
  systemPromptOverride: string | null;
  status: ModelStatus;
  statusDetail: string | null;
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface AdvancedParams {
  modelId: string;
  nCtx: number | null;
  nGpuLayers: number | null;
  nBatch: number | null;
  nThreads: number | null;
  temperature: number | null;
  topP: number | null;
  topK: number | null;
  repeatPenalty: number | null;
  mmap: boolean | null;
  mlock: boolean | null;
  flashAttention: boolean | null;
  updatedAt: number;
}

export interface BenchmarkResult {
  id: string;
  modelId: string;
  promptEvalTokS: number;
  genTokS: number;
  ttftMs: number;
  vramPeakMb: number | null;
  backend: GpuBackend;
  nCtxUsed: number;
  nGpuLayersUsed: number;
  ranAt: number;
}

export interface RemoteEndpoint {
  id: string;
  name: string;
  baseUrl: string;
  authHeaderKeyRef: string | null;
  privacyTier: 'Local';
  status: EndpointStatus;
  lastCheckedAt: number | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface WatchFolder {
  id: string;
  path: string;
  recursive: boolean;
  status: WatchFolderStatus;
  lastScanAt: number | null;
  lastScanError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface LocalGgufRuntimeSettings {
  activeBackend: GpuBackend;
  activeBackendIsAutoDetected: boolean;
  autoFallbackReason: string | null;
  maxConcurrentLocalModels: number; // pool size, default 1
  defaultLibraryFolder: string | null;
  embeddingModelId: string | null;
  hfTokenKeyRef: string | null; // optional, stored in keytar
  llamaBinariesVersion: string; // e.g. "b4321"
}

export type LocalGgufError =
  | { kind: 'binary-not-found'; backend: GpuBackend; path: string }
  | { kind: 'binary-unsupported'; backend: GpuBackend; osVersion: string }
  | { kind: 'gpu-probe-failed'; reason: string }
  | { kind: 'oom-predicted'; requiredMb: number; availableMb: number }
  | { kind: 'oom-runtime'; lastStderr: string }
  | { kind: 'gguf-parse-failed'; path: string; reason: string }
  | { kind: 'gguf-corrupt'; path: string; sha256Mismatch?: boolean }
  | { kind: 'server-spawn-failed'; exitCode: number | null; stderr: string }
  | { kind: 'server-crashed'; pid: number; exitCode: number | null; stderr: string }
  | { kind: 'port-exhausted' }
  | { kind: 'source-unreachable'; path: string }
  | { kind: 'hf-download-failed'; repo: string; file: string; httpStatus: number; body: string }
  | { kind: 'hf-rate-limited'; retryAfterS: number }
  | { kind: 'endpoint-unreachable'; url: string; httpStatus?: number }
  | { kind: 'endpoint-auth-failed'; url: string }
  | { kind: 'pool-full'; current: number; max: number }
  | { kind: 'context-too-large'; requested: number; max: number };

// Discriminator helper
export function isLocalGgufError(value: unknown): value is LocalGgufError {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { kind?: unknown };
  return typeof v.kind === 'string';
}
```

### IPC channel namespace (locked in Phase 1)

All channels under the `localGguf.` namespace. Each channel is request/response with typed contracts.

```typescript
// IPC channel contracts (skeleton — full Request/Response types in shared-types/src/local-gguf.ts)

// Library
'localGguf.library.list'             // → LocalModel[]
'localGguf.library.get'              // (id) → LocalModel | null
'localGguf.library.addFile'          // (path) → LocalModel
'localGguf.library.addFolder'        // (path, recursive) → WatchFolder
'localGguf.library.removeModel'      // (id) → void
'localGguf.library.removeFolder'     // (id) → void
'localGguf.library.scanFolder'       // (id) → { addedCount, removedCount }
'localGguf.library.setSystemPrompt'  // (id, prompt|null) → LocalModel
'localGguf.library.setChatTemplate'  // (id, template|null) → LocalModel
'localGguf.library.setAdvancedParams'// (id, params: Partial<AdvancedParams>) → AdvancedParams
'localGguf.library.resetAdvanced'    // (id) → AdvancedParams (auto-tuned)

// Runtime
'localGguf.runtime.gpuInventory'     // → GpuInventory
'localGguf.runtime.reprobeGpu'       // → GpuInventory
'localGguf.runtime.settings'         // → LocalGgufRuntimeSettings
'localGguf.runtime.setSettings'      // (Partial<LocalGgufRuntimeSettings>) → LocalGgufRuntimeSettings
'localGguf.runtime.binariesVersion'  // → string

// Pool
'localGguf.pool.status'              // → { loaded: LoadedModel[], maxConcurrent: number }
'localGguf.pool.load'                // (id) → LoadedModel
'localGguf.pool.unload'              // (id) → void
'localGguf.pool.setMaxConcurrent'    // (n) → void

// Endpoints
'localGguf.endpoint.list'            // → RemoteEndpoint[]
'localGguf.endpoint.add'             // (config) → RemoteEndpoint
'localGguf.endpoint.remove'          // (id) → void
'localGguf.endpoint.test'            // (id) → { reachable: boolean; latencyMs?: number; error?: LocalGgufError }
'localGguf.endpoint.update'          // (id, partial) → RemoteEndpoint

// HF
'localGguf.hf.search'                // (query, filters) → HfSearchResult[]
'localGguf.hf.modelCard'             // (repoId) → HfModelCard
'localGguf.hf.startDownload'         // (repoId, filename, targetFolder) → DownloadHandle
'localGguf.hf.pauseDownload'         // (handleId) → void
'localGguf.hf.resumeDownload'        // (handleId) → void
'localGguf.hf.cancelDownload'        // (handleId) → void
'localGguf.hf.activeDownloads'       // → DownloadProgress[]

// Benchmark
'localGguf.benchmark.run'            // (modelId) → BenchmarkResult
'localGguf.benchmark.history'        // (modelId) → BenchmarkResult[]
```

### Settings store namespace

Runtime settings live under the existing app settings store under the `localGguf` namespace. Existing precedent: see how `runtime-strategy.ts` reads/writes its config. Each key in `LocalGgufRuntimeSettings` maps to one store entry under `localGguf.<camelKey>`.

---

## Phase 0 — Spikes

**Time-box: ≤ 1 day per spike. Outcome: a writeup + go/no-go decision. NOT production code.**

Spikes run in **parallel** (different branches, no inter-dependencies). Each ends with a PR containing only the writeup (plus throwaway investigation scripts under `scripts/spike-S<N>/` if useful for the writeup). The writeup is the artifact; if the spike concludes "no-go," downstream phases get revised in the spec before they begin.

### Spike S1 — llama.cpp binary fetch + version pin

**Goal:** Prove we can deterministically download, verify, and bundle llama.cpp `server` binaries for every required OS × backend combo. Pin a specific `ggerganov/llama.cpp` release tag. Establish the SHA manifest format. Confirm installer-size estimates against reality.

**Files:**
- Create: `docs/spikes/2026-05-27-S1-llama-binary-fetch.md` (writeup)
- Create (throwaway): `scripts/spike-S1/fetch-test.mjs`
- Create (throwaway): `scripts/spike-S1/measure-sizes.mjs`

**Tasks:**

- [ ] **Step 1: Branch off `main`.**

```bash
git checkout main
git pull --ff-only
git checkout -b spike/v3.3.0-S1-llama-binary-fetch
```

- [ ] **Step 2: Identify the target llama.cpp release tag.**

Visit https://github.com/ggerganov/llama.cpp/releases. Pick the most recent stable tag (format `b<NNNN>`). Record:
- Release tag (e.g. `b4321`)
- Release date
- Linked changelog highlights
- Available asset names per OS × backend

Write to writeup under `## Chosen release`.

- [ ] **Step 3: Inventory required assets.**

From the release page, identify the exact asset filenames you need:

| Combo | Asset filename pattern |
|---|---|
| Windows x64 CUDA | `llama-<tag>-bin-win-cuda-cu<ver>-x64.zip` |
| Windows x64 ROCm | `llama-<tag>-bin-win-hip-x64.zip` (if shipped) |
| Windows x64 Vulkan | `llama-<tag>-bin-win-vulkan-x64.zip` |
| Windows x64 CPU | `llama-<tag>-bin-win-x64.zip` |
| Windows arm64 Vulkan | `llama-<tag>-bin-win-vulkan-arm64.zip` (if shipped) |
| Windows arm64 CPU | `llama-<tag>-bin-win-arm64.zip` |
| Linux x64 CUDA | `llama-<tag>-bin-ubuntu-cuda-cu<ver>-x64.zip` |
| Linux x64 ROCm | `llama-<tag>-bin-ubuntu-hip-x64.zip` (if shipped) |
| Linux x64 Vulkan | `llama-<tag>-bin-ubuntu-vulkan-x64.zip` |
| Linux x64 CPU | `llama-<tag>-bin-ubuntu-x64.zip` |
| macOS arm64 Metal | `llama-<tag>-bin-macos-arm64.zip` |
| macOS x64 Metal | `llama-<tag>-bin-macos-x64.zip` |

If any combo's asset doesn't exist in the chosen release, **DO NOT** invent a fallback — document it as a gap for the writeup's "Findings & risks" section. ROCm Windows is the highest-risk gap.

- [ ] **Step 4: Implement throwaway fetch script.**

Create `scripts/spike-S1/fetch-test.mjs`:

```javascript
// scripts/spike-S1/fetch-test.mjs
// Spike S1 — verify download + SHA verification for one combo end-to-end.
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const TAG = process.env.LLAMA_TAG ?? 'b4321'; // override at runtime
const ASSET = process.argv[2];
if (!ASSET) {
  console.error('Usage: node fetch-test.mjs <asset-filename>');
  process.exit(2);
}
const URL = `https://github.com/ggerganov/llama.cpp/releases/download/${TAG}/${ASSET}`;
const OUT_DIR = join(process.cwd(), '.spike-s1-cache', TAG);
const OUT_PATH = join(OUT_DIR, ASSET);

await mkdir(OUT_DIR, { recursive: true });

const t0 = Date.now();
const res = await fetch(URL);
if (!res.ok) {
  console.error(`HTTP ${res.status} for ${URL}`);
  process.exit(1);
}
await pipeline(res.body, createWriteStream(OUT_PATH));
const dlMs = Date.now() - t0;

const size = (await stat(OUT_PATH)).size;
const sha = createHash('sha256').update(await readFile(OUT_PATH)).digest('hex');

console.log(JSON.stringify({ asset: ASSET, sizeBytes: size, sha256: sha, downloadMs: dlMs }, null, 2));
```

- [ ] **Step 5: Run the fetch for every combo identified in Step 3.**

```bash
mkdir -p .spike-s1-cache
for asset in <list-of-asset-filenames-from-step-3>; do
  node scripts/spike-S1/fetch-test.mjs "$asset" >> spike-s1-results.json
done
```

Record results in the writeup. Note any 404s as gaps.

- [ ] **Step 6: Extract and measure unpacked size per combo.**

```javascript
// scripts/spike-S1/measure-sizes.mjs
import { execSync } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

async function dirSize(path) {
  let total = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const p = join(path, entry.name);
    if (entry.isDirectory()) total += await dirSize(p);
    else total += (await stat(p)).size;
  }
  return total;
}

const archives = process.argv.slice(2);
for (const archive of archives) {
  const extractDir = `.spike-s1-extracted/${archive.replace(/\.zip$/, '')}`;
  execSync(`mkdir -p "${extractDir}" && unzip -q -o "${archive}" -d "${extractDir}"`, { stdio: 'inherit' });
  const sizeBytes = await dirSize(extractDir);
  console.log(JSON.stringify({ archive, extractedSizeBytes: sizeBytes, extractedSizeMb: (sizeBytes / (1024*1024)).toFixed(1) }));
}
```

Run on every downloaded archive. Sum per-OS to validate the installer-size delta estimate from spec § 11.2.

- [ ] **Step 7: Author the writeup.**

`docs/spikes/2026-05-27-S1-llama-binary-fetch.md` structure:

```markdown
# Spike S1 — llama.cpp binary fetch + version pin

**Date:** 2026-05-27
**Time-box:** 1 day
**Decision:** GO | NO-GO | GO WITH CHANGES

## Chosen release
- Tag: `b<release-number>` (replace with the actual ggerganov/llama.cpp tag, e.g. `b4321`)
- Date: `<release-date>` (ISO date)
- Highlights:

## Asset inventory
| Combo | Asset filename | Available? | SHA256 | Size (MB) |
|---|---|---|---|---|
| Win x64 CUDA | … | ✓ / ✗ | … | … |
| Win x64 ROCm | … | ✓ / ✗ | … | … |
…

## Installer-size impact (extracted, unpacked)
| OS | Sum of bundled MB | Spec estimate | Delta from estimate |
|---|---|---|---|
| Win x64 | … | 400 | … |
…

## Manifest format proposed
\`\`\`json
{
  "llamaCppRelease": "b<release-number>",
  "binaries": {
    "win32-x64-cuda": { "asset": "…", "sha256": "…", "sizeBytes": … },
    …
  }
}
\`\`\`

## Findings & risks
- (e.g.) ROCm Windows asset not shipped; Windows AMD users will use Vulkan
- (e.g.) Download size of Linux CUDA is 480 MB; investigate whether trimming non-server binaries is acceptable
- (other discoveries)

## Decision rationale
…

## Phase-2 carry-over
- Production fetch script will live at `scripts/fetch-llama-binaries.mjs`
- Manifest at `scripts/llama-binaries-manifest.json` (committed)
- `llamaCppRelease` field added to root `package.json`
```

- [ ] **Step 8: Commit the writeup.**

```bash
git add docs/spikes/2026-05-27-S1-llama-binary-fetch.md scripts/spike-S1/
git commit -m "$(cat <<'EOF'
docs(spike): S1 — llama.cpp binary fetch + version pin investigation

Investigated bundling llama.cpp release binaries for all OS × backend
combos. Tag `b<release-number>` chosen. Asset availability and SHA256 inventory
captured; installer-size estimates from spec § 11.2 validated against
real extracted sizes. Identified ROCm Windows gap (Windows AMD users
will use Vulkan fallback). Decision: GO with manifest format below.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Push and open a PR.**

```bash
git push -u origin spike/v3.3.0-S1-llama-binary-fetch
gh pr create --title "spike(S1): llama.cpp binary fetch + version pin" --body "$(cat <<'EOF'
## Summary
Phase 0 spike S1 writeup for v3.3.0 local GGUF support. Validates binary fetch + SHA verification + size estimates against real `ggerganov/llama.cpp` releases.

## Outcome
See `docs/spikes/2026-05-27-S1-llama-binary-fetch.md` for full findings and the GO/NO-GO decision.

## Test plan
- [x] Throwaway fetch script downloaded and SHA-verified every combo identified
- [x] Extracted sizes measured and compared against spec § 11.2 estimates
- [x] Manifest format proposed
EOF
)"
```

- [ ] **Step 10: Review writeup → record go/no-go in PR.**

If GO: PR can be merged (the writeup lands on `main`). The throwaway scripts under `scripts/spike-S1/` are deleted in the same PR — only the writeup persists. If NO-GO: spec § 11 is revised; this PR closes without merging.

---

### Spike S2 — GPU probe cross-platform

**Goal:** Verify cross-platform GPU detection. Validate `nvidia-smi`, `rocminfo`, `vulkaninfo --summary`, and `system_profiler SPDisplaysDataType` output parsing on real hardware. Lock the `GpuInventory` shape against actual command outputs (catch any fields we missed in the spec).

**Files:**
- Create: `docs/spikes/2026-05-27-S2-gpu-probe-cross-platform.md`
- Create (throwaway): `scripts/spike-S2/probe-windows.mjs`
- Create (throwaway): `scripts/spike-S2/probe-linux.mjs`
- Create (throwaway): `scripts/spike-S2/probe-mac.mjs`
- Create (fixtures, kept): `docs/spikes/S2-fixtures/` — raw command outputs from each platform

**Tasks:**

- [ ] **Step 1: Branch off `main`.**

```bash
git checkout main && git pull --ff-only && git checkout -b spike/v3.3.0-S2-gpu-probe
```

- [ ] **Step 2: Capture raw command outputs on Rocky's Windows GPU rig.**

Run these commands directly in PowerShell, save outputs verbatim under `docs/spikes/S2-fixtures/windows-<gpu-vendor>/`:

```powershell
nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap --format=csv,noheader > docs/spikes/S2-fixtures/windows-nvidia/nvidia-smi.txt
nvidia-smi -L > docs/spikes/S2-fixtures/windows-nvidia/nvidia-smi-list.txt
vulkaninfo --summary > docs/spikes/S2-fixtures/windows-nvidia/vulkaninfo.txt
# If rocminfo is installed on a separate AMD rig:
rocminfo > docs/spikes/S2-fixtures/windows-amd/rocminfo.txt 2>&1
```

If any tool is missing, document that — the probe must handle missing-tool case gracefully.

- [ ] **Step 3: Capture raw command outputs on a Mac.**

```bash
system_profiler SPDisplaysDataType > docs/spikes/S2-fixtures/macos-arm64/system_profiler.txt
system_profiler SPHardwareDataType > docs/spikes/S2-fixtures/macos-arm64/system_profiler-hardware.txt
```

- [ ] **Step 4: Capture Linux outputs (via Docker or a WSL2 instance if no native Linux GPU rig).**

```bash
nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap --format=csv,noheader > docs/spikes/S2-fixtures/linux-nvidia/nvidia-smi.txt
vulkaninfo --summary > docs/spikes/S2-fixtures/linux-nvidia/vulkaninfo.txt
# AMD/ROCm if available:
rocminfo > docs/spikes/S2-fixtures/linux-amd/rocminfo.txt 2>&1
```

Note: if Linux ROCm hardware isn't accessible, fixtures from public sources (annotated as such) are acceptable for the spike. Production tests will use the real output captured here.

- [ ] **Step 5: Write minimal parser prototypes per platform.**

Three throwaway scripts at `scripts/spike-S2/probe-{windows,linux,mac}.mjs`. Each reads the fixture files (NOT live commands) and parses into the `GpuInventory` shape. Goal is to confirm the spec's shape is sufficient — NOT to write production code.

Example for Windows-NVIDIA (`scripts/spike-S2/probe-windows.mjs`):

```javascript
import { readFile } from 'node:fs/promises';

function parseNvidiaSmiCsv(raw) {
  return raw.trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const [name, memTotal, driver, computeCap] = line.split(',').map(s => s.trim());
    const memMb = Number(memTotal.replace(/\s*MiB\s*$/, ''));
    return { name, vramMb: memMb, backend: 'cuda', driver, computeCap };
  });
}

const raw = await readFile('docs/spikes/S2-fixtures/windows-nvidia/nvidia-smi.txt', 'utf8');
const devices = parseNvidiaSmiCsv(raw);
console.log(JSON.stringify({ platform: 'win32', cuda: { devices } }, null, 2));
```

- [ ] **Step 6: Document any GpuInventory shape gaps.**

If real outputs reveal fields we missed in `shared-types/src/local-gguf.ts` (e.g. compute capability matters for backend selection — see step 5), document them in the writeup's "Shape adjustments" section. Phase 1 will incorporate them.

- [ ] **Step 7: Author the writeup.**

`docs/spikes/2026-05-27-S2-gpu-probe-cross-platform.md`:

```markdown
# Spike S2 — GPU probe cross-platform

**Date:** 2026-05-27
**Time-box:** 1 day
**Decision:** GO | NO-GO | GO WITH CHANGES

## Hardware tested
- Windows: <GPU model, driver version>
- macOS: <Mac model, OS version, GPU>
- Linux: <if applicable>

## Fixtures captured
- `docs/spikes/S2-fixtures/windows-nvidia/` — nvidia-smi + vulkaninfo
- `docs/spikes/S2-fixtures/macos-arm64/` — system_profiler
- `docs/spikes/S2-fixtures/linux-nvidia/` — (annotated source)

## Parser confidence per command
| Tool | Output stability | Parser difficulty | Edge cases observed |
|---|---|---|---|
| nvidia-smi --query-gpu CSV | High (stable since v450+) | Low | Multi-GPU rows separate; arch missing for some older cards |
| vulkaninfo --summary | Medium | Medium | Output format changed in vulkan-tools 1.3.x |
| rocminfo | Low (free-form text) | High | Need regex for `Marketing Name` and `Size` fields |
| system_profiler SPDisplaysDataType | High | Low | Plist available with `-xml`; prefer XML for parsing |

## Shape adjustments to GpuInventory
- (e.g.) Add `cudaComputeCap` to `GpuDevice` so backend ranking can distinguish CUDA 11 vs CUDA 12
- (other discoveries)

## Findings & risks
…

## Phase-2 carry-over
- Probe modules will live at `packages/local-gguf-runtime/src/gpu-probe/<vendor>.ts`
- Fixtures captured here become test fixtures for the parser unit tests
```

- [ ] **Step 8–10: Commit, push, PR, decide go/no-go.** (Same flow as S1 steps 8–10.)

---

### Spike S3 — GGUF metadata parser

**Goal:** Validate that we can parse arch, params, quant, context_max, chat_template, embedding-flag, and tool-capability hints from 12+ real GGUF files. Lock the parser library choice (custom Node parser vs `gguf-parser-js` vs porting `gguf-py` logic). Identify failure modes for corrupt / unknown-arch files.

**Files:**
- Create: `docs/spikes/2026-05-27-S3-gguf-metadata-parser.md`
- Create (throwaway): `scripts/spike-S3/parse-gguf.mjs`
- Create (fixtures, kept): `docs/spikes/S3-fixtures/` — header bytes from each model (NOT full models)

**Tasks:**

- [ ] **Step 1: Branch off `main`.**

```bash
git checkout main && git pull --ff-only && git checkout -b spike/v3.3.0-S3-gguf-parser
```

- [ ] **Step 2: Identify 12 GGUFs to test.**

Pick diverse models (don't download yet — just record URLs + expected metadata):

| # | Repo | File | Arch | Expected quant | Expected ctx |
|---|---|---|---|---|---|
| 1 | bartowski/Meta-Llama-3.1-8B-Instruct-GGUF | Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf | llama | Q4_K_M | 131072 |
| 2 | bartowski/Mistral-7B-Instruct-v0.3-GGUF | Mistral-7B-Instruct-v0.3-Q4_K_M.gguf | mistral | Q4_K_M | 32768 |
| 3 | bartowski/Qwen2.5-7B-Instruct-GGUF | Qwen2.5-7B-Instruct-Q4_K_M.gguf | qwen2 | Q4_K_M | 32768 |
| 4 | bartowski/gemma-2-9b-it-GGUF | gemma-2-9b-it-Q4_K_M.gguf | gemma2 | Q4_K_M | 8192 |
| 5 | bartowski/Phi-3.5-mini-instruct-GGUF | Phi-3.5-mini-instruct-Q4_K_M.gguf | phi3 | Q4_K_M | 131072 |
| 6 | bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF | DeepSeek-Coder-V2-Lite-Instruct-Q4_K_M.gguf | deepseek2 | Q4_K_M | 163840 |
| 7 | bartowski/Hermes-3-Llama-3.1-8B-GGUF | Hermes-3-Llama-3.1-8B-Q4_K_M.gguf | llama (tool-capable) | Q4_K_M | 131072 |
| 8 | nomic-ai/nomic-embed-text-v1.5-GGUF | nomic-embed-text-v1.5.Q4_K_M.gguf | nomic-bert (embedding) | Q4_K_M | 8192 |
| 9 | CompendiumLabs/bge-large-en-v1.5-gguf | bge-large-en-v1.5-q4_k_m.gguf | bert (embedding) | Q4_K_M | 512 |
| 10 | bartowski/Llama-3.2-3B-Instruct-GGUF | Llama-3.2-3B-Instruct-F16.gguf | llama (F16, unquantized) | F16 | 131072 |
| 11 | (multi-part split example, find one) | …-00001-of-00003.gguf | llama | Q4_K_M | varies |
| 12 | A known-corrupt or truncated GGUF (truncate one of the above to 1 KB) | — | — | — |

Record in writeup.

- [ ] **Step 3: Download only the first 1 MiB of each GGUF.**

GGUF metadata lives at the start of the file. HTTP Range requests let us avoid full downloads.

```bash
mkdir -p .spike-s3-cache
# example for one file:
curl -L -H "Range: bytes=0-1048575" \
  -o .spike-s3-cache/llama-3.1-8b-Q4_K_M.head.gguf \
  "https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf"
```

- [ ] **Step 4: Evaluate parser library options.**

Check existence and quality of:
- `gguf-parser-js` on npm (if exists)
- `@huggingface/gguf` on npm (if exists)
- `node-llama-cpp`'s metadata API (we won't bundle it but can borrow the parser)
- Rolling our own parser per the [GGUF binary format spec](https://github.com/ggerganov/ggml/blob/master/docs/gguf.md)

Document findings: which library, version, license, last-published date, GitHub-stars-as-of-today, and test-coverage signal. Pick one (or "roll our own" if libraries are inadequate).

- [ ] **Step 5: Write throwaway parser prototype.**

`scripts/spike-S3/parse-gguf.mjs` reads the head-of-file fixture and extracts metadata. If using a library: just call it. If rolling our own: implement the minimal subset that reads the GGUF header + the key-value metadata table.

```javascript
// scripts/spike-S3/parse-gguf.mjs — illustrative; actual content depends on Step 4 choice
import { readFile } from 'node:fs/promises';

// GGUF header: 4 bytes magic ("GGUF") + 4 bytes version + 8 bytes tensor count + 8 bytes kv count
const MAGIC = Buffer.from('GGUF', 'utf8');

const buf = await readFile(process.argv[2]);
if (!buf.subarray(0, 4).equals(MAGIC)) throw new Error('Not a GGUF file');
const version = buf.readUInt32LE(4);
const tensorCount = Number(buf.readBigUInt64LE(8));
const kvCount = Number(buf.readBigUInt64LE(16));

console.log(JSON.stringify({ version, tensorCount, kvCount }));
// (continue parsing the kv table — type tags + string keys + typed values)
```

- [ ] **Step 6: Run parser against all 12 fixtures, record results.**

For each model:
- Did the parser succeed?
- Did it extract: `arch`, `paramsBillions` (computed from layer count × hidden size or read from metadata), `quant`, `contextMax`, `chatTemplate`, `tool_capable` heuristic?
- Were any fields unexpectedly missing?
- For the corrupt file: did it fail safely with a `gguf-parse-failed` or `gguf-corrupt` error (not crash)?

Tabulate in writeup.

- [ ] **Step 7: Author writeup.**

`docs/spikes/2026-05-27-S3-gguf-metadata-parser.md`:

```markdown
# Spike S3 — GGUF metadata parser

**Date:** 2026-05-27
**Decision:** GO | NO-GO | GO WITH CHANGES

## Library decision
- Choice: `<library-name | "roll-our-own">`
- Rationale: …
- License: …
- Maintenance signal: …

## Parser results across 12 fixtures
| # | Model | Parse OK? | Arch | Params (B) | Quant | Ctx | chat_template? | Tool-capable? |
|---|---|---|---|---|---|---|---|---|
| 1 | Llama 3.1 8B Q4_K_M | ✓ | llama | 8.0 | Q4_K_M | 131072 | ✓ | ✗ |
…

## Failure modes
- Corrupt file → returns `{ kind: 'gguf-corrupt', path, sha256Mismatch: false }` (no crash)
- Truncated head → returns `{ kind: 'gguf-parse-failed', path, reason: 'EOF before kv table' }`
- Unknown arch → still parses but `arch` is the literal string from metadata (e.g. `falcon3`); UI just shows it

## Tool-capability detection strategy
- Source: curated list at `packages/local-gguf-runtime/src/metadata/tool-capable-list.ts`
- Heuristic: `arch === 'llama'` + display_name contains `hermes|functionary|nous-tool` → mark capable
- Decision rationale: GGUF metadata doesn't have a `tool_capable` field; relying on chat_template content for some models is fragile

## Phase-3 + Phase-8 carry-over
- Parser lives at `packages/local-gguf-runtime/src/metadata/parser.ts`
- Fixtures here become parser unit-test inputs
```

- [ ] **Step 8–10: Commit, push, PR, decide.** (Same flow as S1.)

---

### Spike S4 — llama-server lifecycle

**Goal:** Prove we can spawn `llama.cpp/server`, hit `/v1/chat/completions` and `/v1/embeddings`, kill cleanly, verify port release. Across at least CPU + Vulkan backends (Rocky's machines). Lock the subprocess wrapper API + port allocator strategy.

**Files:**
- Create: `docs/spikes/2026-05-27-S4-llama-server-lifecycle.md`
- Create (throwaway): `scripts/spike-S4/lifecycle-test.mjs`

**Tasks:**

- [ ] **Step 1: Branch off `main`.**

```bash
git checkout main && git pull --ff-only && git checkout -b spike/v3.3.0-S4-server-lifecycle
```

- [ ] **Step 2: Download a small GGUF for testing.**

Use TinyLlama or similar (≤ 1 GB) — keep the spike fast. Example: `bartowski/TinyLlama-1.1B-Chat-v1.0-GGUF` Q4_K_M (~700 MB).

```bash
mkdir -p .spike-s4-cache
curl -L -o .spike-s4-cache/tinyllama.gguf "https://huggingface.co/bartowski/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/TinyLlama-1.1B-Chat-v1.0-Q4_K_M.gguf"
```

- [ ] **Step 3: Acquire the CPU build of llama.cpp-server for this machine.**

Use the asset from S1's findings (CPU build). Extract to `.spike-s4-bin/`.

- [ ] **Step 4: Write throwaway lifecycle test.**

```javascript
// scripts/spike-S4/lifecycle-test.mjs
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { createServer } from 'node:net';

const BINARY = process.argv[2]; // path to server.exe / server
const MODEL = process.argv[3];

// 1. Pick a free port
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}
const port = await getFreePort();
console.log('Allocated port', port);

// 2. Spawn
const proc = spawn(BINARY, ['-m', MODEL, '--port', String(port), '--host', '127.0.0.1', '-c', '2048'], { stdio: ['ignore', 'pipe', 'pipe'] });
let serverReady = false;
const stdoutBuf = [];
const stderrBuf = [];
proc.stdout.on('data', (d) => { stdoutBuf.push(d.toString()); if (d.toString().includes('HTTP server listening')) serverReady = true; });
proc.stderr.on('data', (d) => { stderrBuf.push(d.toString()); });
proc.on('exit', (code, sig) => console.log('Server exited', { code, sig }));

// 3. Wait up to 60s for ready
for (let i = 0; i < 60; i++) {
  if (serverReady) break;
  await sleep(1000);
}
if (!serverReady) {
  console.error('Server did not become ready in 60s');
  console.error('STDERR:', stderrBuf.join(''));
  proc.kill('SIGKILL');
  process.exit(1);
}

// 4. Hit /v1/chat/completions
const t0 = Date.now();
const chatRes = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ messages: [{ role: 'user', content: 'Say "hello".' }], stream: false, max_tokens: 16 }),
});
const chatJson = await chatRes.json();
console.log(JSON.stringify({ chatLatencyMs: Date.now() - t0, response: chatJson }, null, 2));

// 5. Kill and verify port release
proc.kill('SIGTERM');
await sleep(2000);
// try to bind same port
try {
  const srv = createServer();
  await new Promise((resolve, reject) => {
    srv.listen(port, '127.0.0.1', () => { srv.close(resolve); });
    srv.on('error', reject);
  });
  console.log('Port released cleanly');
} catch (e) {
  console.error('Port still bound after SIGTERM:', e.message);
}
```

Run on at least Windows CPU. Run on Mac arm64 Metal too if a Mac is accessible during the spike.

- [ ] **Step 5: Test failure modes.**

Run the same script with:
- A bogus model path → expect `server-spawn-failed` style exit
- Port already in use → expect server retry-fail
- Sending a request with `n_ctx` exceeding model max → expect HTTP 400 with structured error

Document each.

- [ ] **Step 6: Author writeup.**

`docs/spikes/2026-05-27-S4-llama-server-lifecycle.md`:

```markdown
# Spike S4 — llama-server lifecycle

**Date:** 2026-05-27
**Decision:** GO | NO-GO | GO WITH CHANGES

## Lifecycle observations
| Step | Win CPU | Mac Metal | Notes |
|---|---|---|---|
| Spawn → ready (TinyLlama Q4_K_M) | `<measured-s>` | `<measured-s>` | log line "HTTP server listening" reliable |
| Single chat call (16 tokens) | `<measured-ms>` | `<measured-ms>` | |
| SIGTERM → exit | `<observed>` | `<observed>` | |
| Port released within 2s? | `<yes-or-no>` | `<yes-or-no>` | |

## Subprocess wrapper API (proposed)
\`\`\`typescript
interface ServerHandle {
  port: number;
  pid: number;
  baseUrl: string;
  waitReady(timeoutMs: number): Promise<void>;
  stop(signal?: 'SIGTERM' | 'SIGKILL'): Promise<void>;
  onCrash(cb: (info: { exitCode: number | null; stderr: string }) => void): void;
}
function spawnServer(opts: {
  binaryPath: string;
  modelPath: string;
  nCtx: number;
  nGpuLayers: number;
  nBatch: number;
  nThreads: number;
}): Promise<ServerHandle>;
\`\`\`

## Port allocator strategy
- Range: 49152–65535 (IANA ephemeral range)
- Strategy: bind-with-port-0 (let OS pick), close, return assigned port
- Race risk: port becomes used between close and reuse (acceptable; spawn fails, retry)

## Failure modes observed
- Bogus model path: server exits in <1s with stderr "main.cpp: failed to load model"
- Port collision: server logs "bind: address already in use", exits 1
- n_ctx > model max: HTTP 400 `{"error":{"message":"context size exceeds model max","type":"…"}}` — clean

## Phase-2 carry-over
- Subprocess wrapper at `packages/local-gguf-runtime/src/runtime/server-lifecycle.ts`
- Port allocator at `packages/local-gguf-runtime/src/runtime/port-allocator.ts`
- Integration tests use `apps/desktop/resources/llama-server/<platform>/cpu/` binary
```

- [ ] **Step 7–9: Commit, push, PR, decide.** (Same flow as S1.)

---

### Spike S5 — Hugging Face API client

**Goal:** Validate the HF Hub API surface needed for v1 — search, model card fetch, file download with resume, rate-limit handling. Confirm whether anonymous access is sufficient or whether the spec needs to surface "optional HF token" prominently.

**Files:**
- Create: `docs/spikes/2026-05-27-S5-hf-api-client.md`
- Create (throwaway): `scripts/spike-S5/hf-probe.mjs`

**Tasks:**

- [ ] **Step 1: Branch off `main`.**

```bash
git checkout main && git pull --ff-only && git checkout -b spike/v3.3.0-S5-hf-api
```

- [ ] **Step 2: Verify the HF API endpoints.**

Read https://huggingface.co/docs/hub/api carefully. Record:
- Search: `GET https://huggingface.co/api/models?search=<q>&filter=gguf&sort=downloads&direction=-1&limit=20`
- Model card: `GET https://huggingface.co/api/models/{repoId}` (returns JSON including `siblings` = file list)
- File download: `GET https://huggingface.co/{repoId}/resolve/main/{filename}` (supports Range)
- Rate limits: anonymous = 1000/hr/IP; authenticated = 5000/hr/user

- [ ] **Step 3: Probe each endpoint without auth.**

```javascript
// scripts/spike-S5/hf-probe.mjs
const tests = {
  search: async () => {
    const url = 'https://huggingface.co/api/models?search=llama&filter=gguf&sort=downloads&direction=-1&limit=5';
    const t0 = Date.now();
    const res = await fetch(url);
    const json = await res.json();
    return {
      url, status: res.status, latencyMs: Date.now() - t0,
      rateLimitRemaining: res.headers.get('x-ratelimit-remaining'),
      rateLimitReset: res.headers.get('x-ratelimit-reset'),
      resultsCount: Array.isArray(json) ? json.length : 0,
      sampleResult: Array.isArray(json) ? json[0] : json,
    };
  },
  modelCard: async () => {
    const url = 'https://huggingface.co/api/models/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF';
    const t0 = Date.now();
    const res = await fetch(url);
    const json = await res.json();
    return {
      url, status: res.status, latencyMs: Date.now() - t0,
      filesCount: json.siblings?.length ?? 0,
      sampleFile: json.siblings?.find((s) => s.rfilename.endsWith('.gguf')),
    };
  },
  fileHead: async () => {
    // HEAD request for size, then range-byte download verification
    const url = 'https://huggingface.co/bartowski/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/TinyLlama-1.1B-Chat-v1.0-Q4_K_M.gguf';
    const head = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return {
      url, status: head.status,
      contentLength: head.headers.get('content-length'),
      acceptsRanges: head.headers.get('accept-ranges'),
      etag: head.headers.get('etag'),
    };
  },
  rangeDownload: async () => {
    const url = 'https://huggingface.co/bartowski/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/TinyLlama-1.1B-Chat-v1.0-Q4_K_M.gguf';
    const res = await fetch(url, { headers: { Range: 'bytes=0-1023' } });
    return {
      url, status: res.status,
      bytesReturned: (await res.arrayBuffer()).byteLength,
      contentRange: res.headers.get('content-range'),
    };
  },
};

for (const [name, fn] of Object.entries(tests)) {
  try {
    const result = await fn();
    console.log(JSON.stringify({ test: name, ok: true, ...result }, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ test: name, ok: false, error: e.message }, null, 2));
  }
}
```

- [ ] **Step 4: Stress-test rate limiting.**

Hit `search` 50 times in a tight loop with no auth. Confirm:
- Where does HF surface 429?
- What's in the `Retry-After` header?
- Does the rate counter reset on the hour, or sliding window?

Record findings.

- [ ] **Step 5: Test with an HF token (Rocky's optional).**

If Rocky provides an HF token for the spike, repeat search × 50 with `Authorization: Bearer <token>` and observe rate-limit headers.

- [ ] **Step 6: Validate resume semantics.**

Download bytes 0–999, then bytes 1000–1999, concatenate, SHA the result, compare against full-file SHA. Confirm Range-based resume is bit-perfect.

- [ ] **Step 7: Author writeup.**

`docs/spikes/2026-05-27-S5-hf-api-client.md`:

```markdown
# Spike S5 — Hugging Face API client

**Date:** 2026-05-27
**Decision:** GO | NO-GO | GO WITH CHANGES

## Endpoints validated
| Endpoint | Latency p50 | Latency p95 | Notes |
|---|---|---|---|
| GET /api/models?search=… | `<measured-ms>` | `<measured-ms>` | Returns array of model metadata |
| GET /api/models/{repoId} | `<measured-ms>` | `<measured-ms>` | Includes siblings = full file list |
| HEAD /{repoId}/resolve/main/{file} | `<measured-ms>` | `<measured-ms>` | content-length present, accept-ranges: bytes |
| Range GET | `<measured-ms>` | `<measured-ms>` | content-range correct, bit-perfect resume |

## Rate limit behavior
- Anonymous: limit `<n>`/hr per IP, reset `<reset-policy>`, 429 with Retry-After: `<n>`
- Authenticated: limit `<n>`/hr per user

## Auth posture for v1
- Anonymous works for the search/browse path in normal use
- Power-users with > 100 downloads/hr need a token
- Settings → Defaults exposes "HF token (optional)" — stored in keytar

## Client API (proposed)
\`\`\`typescript
interface HfClient {
  search(query: string, filters: HfFilters): Promise<HfSearchResult[]>;
  modelCard(repoId: string): Promise<HfModelCard>;
  startDownload(opts: { repoId: string; filename: string; targetPath: string; onProgress: (p: DownloadProgress) => void }): Promise<DownloadHandle>;
  pauseDownload(handleId: string): Promise<void>;
  resumeDownload(handleId: string): Promise<void>;
  cancelDownload(handleId: string): Promise<void>;
}
\`\`\`

## Rate-limit + retry strategy
- 429 response: parse Retry-After, surface `hf-rate-limited` typed error to UI, queue retry
- Network errors: exponential backoff (1s, 2s, 4s, 8s; max 3 retries)
- Resume on interrupt: persist `bytesReceived` to handle, use Range on resume

## Phase-7 carry-over
- HF client at `packages/local-gguf-runtime/src/hf-client/`
- Mocked via msw in unit tests; nightly integration test against real HF (env-gated)
```

- [ ] **Step 8–10: Commit, push, PR, decide.** (Same flow as S1.)

---

### Phase 0 exit criteria

Before any Phase 1+ work begins, ALL of these are true:

- [ ] All 5 spike PRs merged (or NO-GO outcomes have triggered spec revisions).
- [ ] All 5 spike writeups exist on `main`.
- [ ] If any spike was NO-GO, `docs/superpowers/specs/2026-05-27-local-gguf-support-design.md` has been updated to reflect the revised approach AND this master plan has been updated to match.
- [ ] Spike fixtures (S2 GPU outputs, S3 GGUF headers) are committed under `docs/spikes/S2-fixtures/` and `docs/spikes/S3-fixtures/` for reuse as test fixtures in later phases.

---

## Phases 1–11 — Index to per-phase plans

Each phase plan is a self-contained PR plan. Read the per-phase file before starting work in that phase. The per-phase plan re-states the cross-phase rules in a header reminder; the canonical version lives here.

| Phase | Plan file | One-line scope | Codex Stage 3 required? |
|---|---|---|---|
| 1 | [`phase-01-foundation.md`](./2026-05-27-local-gguf-support/phase-01-foundation.md) | Package scaffold + shared-types + migration `0014_local_gguf` + IPC stubs + preload bridge + repos | Yes |
| 2 | [`phase-02-runtime-pool.md`](./2026-05-27-local-gguf-support/phase-02-runtime-pool.md) | llama-server lifecycle + LRU pool + GPU probe + backend ranking + binary resolver + auto-tune | Yes |
| 3 | [`phase-03-library-scanning.md`](./2026-05-27-local-gguf-support/phase-03-library-scanning.md) | GGUF metadata parser + library CRUD + folder scan + watch + multi-part split + network resilience | Yes |
| 4 | [`phase-04-provider-integration.md`](./2026-05-27-local-gguf-support/phase-04-provider-integration.md) | `local-gguf` + `local-gguf-embed` adapters + registry entries + adaptive-routing extension | Yes |
| 5 | [`phase-05-library-ui.md`](./2026-05-27-local-gguf-support/phase-05-library-ui.md) | Settings → Local Models page + Library/Folders/Endpoints/Runtime tabs + status badges | No |
| 6 | [`phase-06-gpu-visualizer-vram-guard.md`](./2026-05-27-local-gguf-support/phase-06-gpu-visualizer-vram-guard.md) | Advanced panel + GPU offload visualizer + VRAM headroom guard | No |
| 7 | [`phase-07-hf-browser.md`](./2026-05-27-local-gguf-support/phase-07-hf-browser.md) | HF search UI + model card preview + download manager (progress/pause/resume/cancel) + SHA verify | Yes |
| 8 | [`phase-08-chat-template-tool-gating.md`](./2026-05-27-local-gguf-support/phase-08-chat-template-tool-gating.md) | Chat-template auto-detect + per-model override + system-prompt override + MCP tool-gating | Yes |
| 9 | [`phase-09-local-embeddings-rag.md`](./2026-05-27-local-gguf-support/phase-09-local-embeddings-rag.md) | `local-gguf-embed` wired into RAG + embedding-arch detection + re-index confirmation flow | No |
| 10 | [`phase-10-benchmark-runner.md`](./2026-05-27-local-gguf-support/phase-10-benchmark-runner.md) | Canned-prompt benchmark + result persistence + library-card display | No |
| 11 | [`phase-11-docs-a11y-beta.md`](./2026-05-27-local-gguf-support/phase-11-docs-a11y-beta.md) | User-guide section + axe-core E2E + perf budget verification + `v3.3.0-beta.1` cut + 14-day field test | Yes |

---

## Execution handoff (after Phase 0)

When all 5 spike PRs are merged and the Phase 0 exit criteria are met, proceed with Phase 1 by invoking `superpowers:subagent-driven-development` (or `superpowers:executing-plans`) on `phase-01-foundation.md`.

Each phase ends with a Stage 1–4 review wall (Stage 5 only at release-tag cuts). After Stage 4 passes, the phase PR merges to `main`; CHANGELOG `[Unreleased]` accumulates entries. After Phase 11 closes, the beta tag `v3.3.0-beta.1` cuts via the existing `release.yml` workflow with the `ship-engineer` pre-ship gate.

After 14 days of field testing with zero P0/P1 reports, the stable `v3.3.0` tag cuts using the same workflow.
