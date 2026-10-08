# Team-X Comprehensive Engineering Audit

**Audit date:** 2026-10-07 (America/Los_Angeles)  
**Current `main`:** `bfbdd78fc5a95a1c07b845221546f1e57a424ee7`  
**Open remediation PR:** [#39 — fix: close the gaps the codebase truth audit left behind](https://github.com/Git-Rocky-Stack/Team-X/pull/39), head `8f2adb5cc6b88d4dcbf52e5685c7fcf1e14b7355`  
**Most recent merged GitHub PR:** [#38](https://github.com/Git-Rocky-Stack/Team-X/pull/38), merged 2026-07-26  
**Method:** read-only architecture, implementation, Git/PR, CI, security, dependency, test, coverage, build, packaging, reachability, and module review. The only repository change made by this audit is this report.

## Executive verdict

**Current-main quality score: 46/100.**  
**Current-main release recommendation: NO-GO.**  
**PR #39 recommendation: REQUEST CHANGES before merge; then re-review and run release gates.**

Team-X has a strong functional core, unusually broad unit/integration coverage by test count, clear domain intent, and thoughtful safeguards around vault paths, MCP environments, authority, budgets, provider secrets, role-pack signatures, runtime lifecycles, and database migrations. The local baseline built successfully, typechecked cleanly, passed 4,092 unit/integration tests, and passed all 26 Electron E2E scenarios.

Those strengths do not outweigh the release blockers:

1. `main` is red in GitHub Actions on all three OSes because its frozen lockfile does not match package manifests; E2E was skipped.
2. The dependency graph reports 86 production-path vulnerability instances (1 critical, 33 high) and 201 across the full desktop/build supply chain (6 critical, 90 high). Electron is pinned to the unsupported/outdated 31.x line while the installed ecosystem reports a patched 39.x floor for a high advisory.
3. The packaged renderer retains a development CSP with `unsafe-eval`, `unsafe-inline`, and localhost connections. The file says an `afterPack` hook replaces it, but no such hook exists. No navigation/window-open or IPC sender-origin guard was found.
4. All 22 Windows executables/installers examined are `NotSigned`; macOS signing is explicitly disabled with `identity: null`.
5. The latest large integration landed on `main` through direct branch merges, without a GitHub PR review, and the repository has no branch protection or ruleset.
6. The claim-evidence gate on `main` passes while checking zero claims. PR #39 corrects this to 226 claims, but that fix is not on `main`.
7. Multiple application-correctness and tenant/privacy defects remain on `main`; PR #39 fixes many of them, but it is a 175-file, 37-commit change with no human approval and one explicitly acknowledged runtime-profile gap.

### Finding totals

| Priority | Count | Meaning |
| --- | ---: | --- |
| P0 | 4 | Release/security/governance blockers |
| P1 | 8 | High-impact correctness, privacy, test-truth, and maintainability risks |
| P2 | 7 | Important quality, performance, accessibility, and completeness debt |
| P3 | 3 | Cleanup and process improvements |

## Scope and repository profile

The TypeScript surface under `apps/` and `packages/` contains 815 `.ts`/`.tsx` files and 211,158 lines: 468 production files / 128,977 lines and 347 test files / 82,181 lines.

| Module | Files | Lines | Test files | Audit posture |
| --- | ---: | ---: | ---: | --- |
| `apps/desktop` | 643 | 173,407 | 278 | Feature-rich and well tested by count; main process and IPC are excessively centralized; release/security blockers remain |
| `packages/intelligence` | 59 | 16,830 | 16 | Highest correctness risk on `main`; PR #39 materially repairs retrieval, persistence, tracing, scoping, and fake entry points |
| `packages/local-gguf-runtime` | 45 | 6,087 | 22 | Strong parsing/pool/GPU tests; real llama-server integration remains skipped |
| `packages/provider-router` | 31 | 4,327 | 14 | Good adapter tests; dependency generation is stale and embed adapters have negligible direct coverage |
| `packages/role-schema` | 9 | 1,199 | 5 | Strong validation and signed-pack verification |
| `packages/shared-types` | 25 | 8,957 | 11 | Valuable contract hub, but `ipc.ts` and `entities.ts` are oversized change amplifiers |
| `packages/telemetry-core` | 3 | 351 | 1 | Small, cohesive, and well tested |

## P0 findings

### P0-1 — `main` is not reproducibly installable in CI

**Evidence**

- GitHub Actions runs `37590544025` and `37590544034` failed at `bfbdd78`.
- Ubuntu, Windows, and macOS all stopped at `pnpm install --frozen-lockfile` with `ERR_PNPM_OUTDATED_LOCKFILE`.
- The lock still contains removed `@radix-ui/react-collapsible`, `@radix-ui/react-tabs`, and `sqlite-vec` manifest entries.
- E2E was skipped because the check job failed first.
- Local commands pass only because `node_modules` already exists; that does not prove a clean install.

**Impact:** clean clones, contributor onboarding, CI, and release builds are broken at the exact `main` revision.

**PR #39 status:** fixed by `87974ff`; its five current checks are green.

**Required action:** land the lockfile repair as an isolated emergency change if PR #39 is not immediately ready. Add `pnpm install --frozen-lockfile` to the local pre-merge/release verification checklist.

### P0-2 — Critical and high dependency exposure

`pnpm audit --prod` reports **86** vulnerability instances: 1 critical, 33 high, 44 moderate, and 8 low. The full dependency/build graph reports **201**: 6 critical, 90 high, 88 moderate, and 17 low.

Material examples:

- `@modelcontextprotocol/sdk@1.29.0`: high-severity OAuth credential issuer-confusion advisory; patched at 1.31.0+.
- `electron@31.7.7`: high advisory with a reported patched floor of 39.8.9+.
- `drizzle-orm@0.33.0`: high advisory; patched at 0.45.2+.
- `app-builder-lib` / `electron-builder`: high packaging-path advisory.
- Critical paths include `proxy-addr`, `tar`, `tinypool`, and `vitest`.

Electron and packaging tools are listed as dev dependencies but are production supply-chain material for a desktop binary. Excluding them from release risk would be incorrect.

**Required action:** create a dedicated, tested upgrade train. Patch the MCP SDK first, then Electron/electron-builder and production runtime paths; upgrade Vitest/tinypool and packaging transitive dependencies before allowing secrets or signing credentials into CI. Re-run full audit, native rebuilds, E2E, packaging, and smoke tests after each compatibility cohort.

### P0-3 — Packaged Electron renderer keeps the development CSP and lacks boundary guards

**Evidence**

- `apps/desktop/src/renderer/index.html:6-15` allows `script-src 'unsafe-inline' 'unsafe-eval'` and localhost HTTP/WebSocket connections.
- Its comment promises a strict production CSP via an electron-builder `afterPack` hook, but no `afterPack` hook exists anywhere in `apps/`, `scripts/`, or package configuration.
- `apps/desktop/src/main/index.ts:566-609` correctly enables `contextIsolation`, disables `nodeIntegration`, enables sandboxing and `webSecurity`, but registers no `will-navigate`, `setWindowOpenHandler`, `will-attach-webview`, or permission-request guard.
- No centralized `event.sender` / `senderFrame` origin validation was found for the large IPC surface.
- The preload exposes broad state-changing APIs for files, backups, extensions, MCP, providers, local downloads, and runtime operations.

**Impact:** an XSS, unsafe navigation, or compromised renderer has a materially larger path to privileged preload/IPC operations than necessary. The existing sandbox controls are good defense-in-depth but do not close this boundary.

**Required action:** generate a production-only CSP without `unsafe-eval`; remove `unsafe-inline` where practical using hashes/nonces; deny navigation and new windows by default; allowlist external links through validated `shell.openExternal`; reject untrusted IPC senders centrally; add executable security tests against the packaged `index.html` and BrowserWindow policy.

### P0-4 — Release artifacts are unsigned and current packaging is not proven

**Evidence**

- All 22 `.exe`/installer artifacts under `release/` return `NotSigned` from `Get-AuthenticodeSignature`.
- Those artifacts are old 2.0.x outputs, not current 3.4.0 evidence.
- `apps/desktop/electron-builder.yml:103-115` explicitly sets macOS `identity: null`, disabling signing even when release secrets are present.
- The release workflow provides Apple signing variables but has no Windows certificate/signing configuration or signature-verification gate.
- The release workflow smoke-launches Linux AppImage only; it does not install/launch Windows NSIS or macOS DMG artifacts.

**Impact:** users receive untrusted binaries, macOS notarization cannot succeed as configured, Windows reputation is impaired, and current installers have no operator-verifiable evidence.

**Required action:** configure Windows Authenticode and Apple Developer ID/notarization, remove `identity: null`, fail releases when signatures are absent, verify signatures for executable/installer/uninstaller, and add clean-host install/launch/uninstall tests for Windows and macOS. Do not tag a release until current-version artifacts pass.

## P1 findings

### P1-1 — Current `main` contains cross-company, privacy, and governance defects

The following were independently visible in `main` and are addressed in open PR #39:

- Enhanced AI model completion resolves against the first live company rather than the requesting company (`apps/desktop/src/main/index.ts:1678-1727`), risking wrong-company provider, budget, and memory context.
- Privacy-tier enforcement is not consistently applied in provider construction/runtime selection.
- Command-palette and Enhanced AI model calls are not uniformly budget-governed or recorded as runs.
- Two concurrent meeting-end operations can duplicate minutes/action-item work.
- Proactive settings and several renderer controls are not fully wired to their intended per-company behavior.

**Required action:** do not release `main`. Retain PR #39's failing-first tests, but independently review the composition-root changes and tenant/budget invariants before merge.

### P1-2 — RAG on `main` can recurse, drop content, or exceed provider limits

**Evidence**

- `packages/intelligence/src/rag/chunker-v2.ts:693` recursively calls `semanticChunk(segment.content, options)` while retaining markdown content type, creating an unbounded recursion path for prose segments inside markdown.
- `maxChunkTokens` is configured but not enforced as a hard ceiling on `main`; a no-boundary document can become one arbitrarily large chunk.
- Short code/data windows can be dropped under the minimum threshold.
- The fixed chunker can emit a single oversized sentence/data run.

PR #39 contains targeted fixes and regression tests, including the later stage-2 hard-ceiling correction. These are substantive improvements, not optional refactors.

**Required action:** merge only after fuzz/property tests cover empty input, huge unbroken text, minified JSON, code fences, zero overlap, maximum overlap, Unicode, and size invariants for both chunkers.

### P1-3 — Local endpoint and Hugging Face download trust checks are incomplete on `main`

`endpoint-service.ts` classifies `.local` and bare hostnames as local without resolving all addresses. A public/DNS-rebound answer can therefore cross the Local privacy boundary. `hf-service.ts` lacks the PR's `.gguf`-only service check and same-destination transfer exclusion.

PR #39 adds DNS resolution with timeout/all-address validation, file-type enforcement, and transfer serialization. Review must specifically verify DNS rebinding behavior between validation and connection, redirects, IPv4-mapped IPv6, proxy environment variables, UNC/case-insensitive destination collisions, size limits, and disk-exhaustion behavior.

### P1-4 — Claim-evidence CI is a false green on `main`

`pnpm audit:claims:strict` reports `0 verified ... out of 0` and exits successfully. The parser only reads structured tables in `CLAUDE.md`, while current endpoint claims live in `API_ENDPOINTS.md`. The workflow also runs the non-strict command.

PR #39 changes the source set and fails closed when zero claims are parsed; its CI reports 226 verified. This should be retained and supplemented with a minimum-claim-count regression assertion so a future format drift cannot silently zero the input again.

### P1-5 — PR/branch governance permits unreviewed high-risk integration

- GitHub reports `main` as unprotected and the repository has no rulesets.
- PR #38 had five green checks but zero recorded reviews.
- The October `main` baseline was assembled by direct branch merge commits; its 165-file integration reached `main` with failing CI.
- PR #39 has 175 changed files, 12,364 additions, 3,246 deletions, 37 commits, five green checks, zero reviews, and no review decision.

**Required action:** protect `main`; require pull requests, one independent approval (two for security/release changes), current strict checks, conversation resolution, linear/up-to-date history, signed release tags, and CODEOWNERS for main/preload/IPC/security/build workflows. Disable direct pushes except a documented break-glass path.

### P1-6 — Test quantity overstates test truth

Strength: current `main` passed 4,092 tests in 327 files, with one skipped integration test, and all 26 Electron E2E tests passed.

Gaps:

- Coverage reports 63.36% lines, 76.89% functions, and 84.42% branches, but the coverage configuration does not exclude `*.test.*` / `*.spec.*`; test source appears as 100%-covered input and inflates all totals.
- No coverage thresholds exist, so coverage regressions cannot fail CI.
- Examples of weak production coverage from the generated report: intelligence tracing ~1.5%, streaming responses ~5.9%, prompt versioning ~24%, RAG logging ~29%, provider embed adapters ~4%, scripts ~9%.
- The real llama-server lifecycle integration test is skipped.
- E2E uses canned providers/fake embeddings and does not prove real Ollama/cloud providers, OAuth MCP, update delivery, signing, installer behavior, or GPU backends.
- CI retries E2E once but does not enable `failOnFlakyTests`, allowing retry-only passes to stay green.

**Required action:** fix coverage inclusion, establish risk-weighted thresholds, publish coverage artifacts, fail flaky tests, add nightly/quarantined real-integration lanes, and preserve a deterministic fast PR lane.

### P1-7 — Core architecture is concentrated in change-amplifying mega-modules

Largest production files include:

- `apps/desktop/src/main/ipc/handlers.ts` — 7,446 lines
- `apps/desktop/src/main/index.ts` — 3,459 lines
- `packages/shared-types/src/ipc.ts` — 3,425 lines
- `apps/desktop/src/main/services/company-portability-service.ts` — 1,863 lines
- `apps/desktop/src/main/orchestrator/index.ts` — 1,860 lines
- `apps/desktop/src/main/db/schema.ts` — 1,806 lines
- `mission-control-dashboard.tsx` — 1,700 lines
- `packages/shared-types/src/entities.ts` — 1,520 lines
- `apps/desktop/src/main/ipc/register.ts` — 1,352 lines
- `apps/desktop/src/preload/api.ts` — 1,316 lines

This weakens single responsibility, makes ownership and reviews harder, increases merge collisions, and encourages contract drift across shared types/preload/register/handlers.

**Required action:** split by bounded context and generate or declaratively derive IPC contract/preload/registration parity. Keep the composition root as orchestration, not implementation. Add complexity/file-size budgets with explicit justified exceptions.

### P1-8 — PR #39 retains an acknowledged runtime-profile gap

The PR states that the agentic loop resolves providers directly from the provider factory: privacy tier applies, but a runtime profile bound to the system agent does not. That creates inconsistent execution semantics between normal runs and agentic-loop runs.

**Required action:** resolve the same effective runtime profile through one shared execution-policy service for chat, agentic loop, Copilot, Enhanced AI, palette classification, proactive work, and embeddings. Pin the equivalence with composition tests before sign-off.

## P2 findings

### P2-1 — Accessibility tests emit real dialog violations without failing

`model-detail.tsx` places `DialogTitle` and `DialogDescription` only in the loaded-row branch (`:195-209`). Loading and error branches mount `DialogContent` without either. Repeated tests emit Radix warnings for missing title and description but still pass.

Move an always-present accessible title/description directly under `DialogContent`, with state-specific text. Add a test that fails on console accessibility warnings and run axe against all dialog states.

### P2-2 — Bundles are very large and have no enforced budget

The successful production build emitted approximately 2.55 MB for main-process JavaScript and 3.46 MB for the renderer entry JavaScript, plus a 984 KB font and 134 KB CSS. The renderer is a single large entry without a reported bundle budget.

Add route/panel-level lazy loading, inspect dependency duplication, subset the Iosevka font, and enforce compressed/uncompressed budgets in CI. Measure cold start and memory on representative low-end Windows hardware.

### P2-3 — Incomplete or intentionally placeholder product surfaces remain reachable

Examples on PR #39/current architecture include local placeholder cloud IDs in `cloud.linkWorkspace`, placeholder operator invites/shared-cloud identity, and a lexical mock cross-encoder used as the production reranker. These are documented more honestly after PR #39, but they are still not complete hosted collaboration or learned reranking.

Keep these surfaces clearly labeled preview/local-only, prevent misleading success states, and track each behind an explicit feature maturity flag and acceptance criteria.

### P2-4 — Intelligence package public surface over-exported incomplete subsystems

On `main`, the package exports evaluation, streaming, prompt versioning, memory, metrics, knowledge, observability, and planning from its root. Some have extremely low coverage or fake entry points. PR #39 correctly removes fake CLI/eval paths, but the remaining root export still makes experimental APIs look stable.

Define stable/experimental subpath exports, add API-extractor or type-snapshot checks, and version public contracts deliberately.

### P2-5 — CI does not enforce dependency/security, coverage, bundle, or signature policy

Existing CI strongly covers lint/typecheck/test and Electron E2E. It does not block on dependency severity, coverage, bundle size, packaged CSP, SBOM/provenance, code signature, or installer smoke outside Linux.

Add separate explicit gates with documented exceptions and expiry dates; do not overload one opaque `validate` command.

### P2-6 — Documentation and code claims drift too easily

Examples include the nonexistent CSP `afterPack` hook, Local GGUF API wording that still calls the renderer a future release even though model UI exists, and the zero-input claim audit. PR #39 updates many docs but also has three `git diff --check` trailing-whitespace findings.

Convert machine-verifiable claims into generated docs or tests. Run link checking, `git diff --check`, and claim minimum-count checks in CI.

### P2-7 — Logging/test diagnostics are noisy enough to hide regressions

The passing unit run emits expected stack traces and warnings for MCP connection failures, VRAM sampling, missing test dependencies, audit-bus fallback, backup bootstrap fallback, provider keychain cleanup, and dialog accessibility. Expected errors should be captured/asserted rather than written to the shared test console.

Adopt fail-on-unexpected-console for renderer tests and injected structured log sinks for service tests. Preserve explicit assertions for graceful-degradation paths.

## P3 findings

### P3-1 — ESLint local ergonomics are poor

Biome completed in ~2 seconds, while a targeted `eslint src e2e scripts --no-cache` took several minutes before passing without output. The broad package script was interrupted after the same long silent interval; CI at PR #39 is green. This is a local performance/diagnostic problem rather than a lint defect. Profile `import/no-cycle` and import resolution, print timing data, and split main/renderer/test lint jobs.

### P3-2 — Dependency modernization is a program, not a single update

`pnpm outdated -r` shows major gaps across Electron 31→44, Vite 5→8, Vitest 2→5, TypeScript 5.5→7, AI SDK 3→7, Drizzle 0.33→0.45, Zod 3→4, and provider adapters. Avoid a single big-bang upgrade; use compatibility cohorts with locked regression evidence.

### P3-3 — Generated/cache/release residue complicates local audits

The checkout contains old release trees, cache/spike directories, generated coverage, and runtime resources. They are mostly ignored, but they increase scan cost and make artifact provenance ambiguous. Add a non-destructive diagnostic cleanup command and clearly separate immutable release evidence from local build output.

## Recent PR review

### PR #38 — design port

PR #38 changed four files in one commit and passed five checks. No human review was recorded. The visual change itself is reasonably bounded, but the absence of required review is a governance weakness. The later direct October merge named `design/amp-2026-07-18-port` should not be confused with evidence that all subsequent integration was reviewed through PR #38.

### Direct October integration to `main`

The current merge changed 165 files with 17,448 additions and 5,895 deletions. It added substantial Local GGUF, RAG, Enhanced AI, IPC, models UI, private-operator, and paperclip behavior while removing unreachable UI and sqlite-vec/queue paths. It included valuable tests, but it landed with a stale lockfile and failing CI. At this scale it needed staged, independently reviewed changes and a green merge queue.

### PR #39 — truth-audit remediation

**Strengths**

- Five current checks pass: lint/typecheck/test on Ubuntu, Windows, and macOS; claim-evidence; Electron E2E.
- CI reports 4,463 passed tests, one skipped, and 26/26 E2E.
- Repairs the frozen lockfile and converts claim auditing from 0 to 226 verified claims.
- Adds failing-first tests for tenant scoping, privacy enforcement, meeting idempotency, RAG size/recursion, knowledge graph behavior, UI choosers, endpoint/download security, and composition wiring.
- Removes fake CLI/evaluation entry points and several controls/options that did nothing.
- Adds persistent Enhanced AI memory/knowledge migration `0037`.

**Blocking review comments**

1. Dependency advisories remain unaddressed; the MCP SDK credential advisory and Electron/runtime/build advisories are release blockers.
2. Packaged CSP/navigation/IPC-origin hardening remains unaddressed.
3. Signing and cross-platform installer validation remain unaddressed.
4. The system-agent runtime-profile inconsistency is explicitly left open.
5. The PR is too large for one approval surface. Produce a reviewer map by domain and require independent sign-off for DB/migrations, privacy/provider policy, Local GGUF networking/downloads, intelligence/RAG, Electron security, and UI/accessibility.
6. Correct three `git diff --check` trailing-space findings in version headers.
7. Add clean-install evidence from the PR head and archive the exact command outputs in the PR/check summary.

**Recommendation:** keep PR #39 open. It is materially better than `main` and should be the forward baseline, but green functional CI alone is not enough for merge or release.

## Verification ledger

| Check | Current-main result | Interpretation |
| --- | --- | --- |
| Git worktree | Clean before report; `main` matched `origin/main` | Exact baseline established |
| `pnpm lint` | Pass; 875 files | Formatting/Biome rules clean |
| Targeted ESLint (`src e2e scripts`) | Pass; several-minute runtime | Rule result clean; local feedback loop is too slow |
| `pnpm typecheck` | Pass across 7 workspace projects | Static types clean |
| `pnpm test` | Pass; 327 files, 4,092 passed, 1 skipped | Strong deterministic local suite |
| `pnpm test:coverage` | Pass; 63.36% lines / 76.89% functions / 84.42% branches | Inflated by included test files; no thresholds |
| `pnpm build` | Pass | Main/preload/renderer compile; oversized output and stale Browserslist warning |
| Playwright Electron E2E | Pass; 26/26 in 2.1 minutes | Broad canned-provider flow coverage |
| Strict claim audit | Passes 0/0 | False green on `main`; PR #39 repairs |
| `pnpm audit --prod` | Fail; 86 vulnerability instances | Release blocker |
| Full `pnpm audit` | Fail; 201 vulnerability instances | Desktop/build supply-chain blocker |
| GitHub Actions at `bfbdd78` | Fail on all OSes; E2E skipped | Frozen lock mismatch |
| PR #39 GitHub Actions | Five checks pass | Strong forward baseline, not reviewed/approved |
| `git diff --check` for PR #39 | Three trailing-space findings | Minor cleanup required |
| Windows Authenticode | 22/22 inspected files `NotSigned` | Release blocker |
| Secret-pattern scan | No credible committed secret found; test fixture strings only | Positive, not a substitute for dedicated secret scanning |

## Positive engineering observations

- Electron uses context isolation, disabled Node integration, sandboxing, and `webSecurity`.
- Secrets are held through OS keychain integration and test coverage checks that environment keys are not leaked into `process.env`.
- MCP child processes use scrubbed environments and pinned per-server working directories.
- Vault and backup services include traversal/symlink boundary tests.
- Database migrations are sequential through `0036` on `main`; PR #39 adds `0037` with repository tests.
- Role packs are signed and verified in strict mode; the complete 57-role catalog has coverage.
- Budget governance records cancelled/error costs and enforces thresholds.
- IPC/preload channel parity and teardown behavior have dedicated tests.
- Local GGUF parsing, GPU probes, folder resilience, pools, port allocation, and service layers have unusually good unit coverage.
- E2E covers chat, tickets, meetings, org changes, workspaces, vault/backup, RAG, command planning, telemetry, Copilot, and Local GGUF control surfaces.
- The code generally uses parameterized Drizzle/SQLite access, Zod in several trust-boundary services, bounded filesystem searches, and explicit graceful-degradation behavior.

## Prioritized remediation plan

### Phase 0 — restore a trustworthy baseline (1–2 days)

1. Land the lockfile and fail-closed claim-audit fixes, independently if necessary.
2. Protect `main`, require current checks and review, and prohibit direct merge/push bypass.
3. Rebase PR #39 on the protected baseline; fix `diff --check`; assign domain reviewers.

### Phase 1 — security and release blockers (5–10 days)

1. Patch MCP SDK and all critical/high production/runtime/build advisories with regression cohorts.
2. Upgrade Electron to a supported/patched line and validate native ABI rebuilds.
3. Ship strict production CSP, navigation/window/permission guards, and IPC sender validation.
4. Configure Windows/macOS signing/notarization and signature verification.
5. Build, install, launch, update, uninstall, and verify current artifacts on clean Windows/macOS/Linux hosts.

### Phase 2 — merge correctness (3–6 days)

1. Complete independent review of PR #39 by bounded context.
2. Close the system-agent runtime-profile gap.
3. Add RAG property/fuzz size tests and endpoint DNS-rebinding/redirect tests.
4. Validate migration `0037` upgrade/rollback/backup behavior on representative real user databases.

### Phase 3 — test truth and maintainability (8–15 days)

1. Correct coverage inputs and establish ratcheting thresholds by critical module.
2. Fail on flaky E2E and unexpected console/a11y warnings.
3. Add real-provider/native-runtime scheduled integration suites.
4. Decompose composition root, IPC handlers/contracts, shared entities, portability, orchestrator, and major renderer panels.
5. Add bundle/startup/memory budgets and accessibility automation.

**Estimated remediation effort:** approximately 17–33 focused engineering days, excluding external certificate enrollment and major provider/AI-SDK migration unknowns.

## Release exit criteria

A GO decision requires all of the following on the exact release commit:

- Protected, reviewed merge with every required check green.
- Clean frozen install from an empty workspace on Windows, macOS, and Linux.
- Zero unapproved critical/high advisories across shipped runtime and desktop build chain.
- Strict packaged CSP and Electron navigation/IPC boundary tests passing.
- Corrected production-only coverage report meeting ratcheted thresholds.
- Unit/integration tests green with no unexplained stderr or skipped critical integration.
- E2E green with `failOnFlakyTests`; real provider/native smoke evidence recorded.
- Current installers built, installed, launched, updated, and uninstalled on clean hosts.
- Windows executable/installer/uninstaller Authenticode signatures valid.
- macOS app/DMG signed, hardened, notarized, and Gatekeeper-accepted.
- Consolidated checksums, SBOM/provenance, migration backup/restore evidence, and operator sign-off archived.

Until these criteria are met, Team-X should be treated as a strong development build with substantial recent remediation—not a release-ready desktop product.
