# Local GGUF Phases 2 & 3 Audit

Date: 2026-06-02
Scope: active Local & Networked GGUF Support track:

- Phase 2: Runtime + Pool
- Phase 3: Library + Scanning

This audit reviewed the active implementation under:

- `packages/local-gguf-runtime`
- `apps/desktop/src/main/services/local-gguf`
- `apps/desktop/src/main/ipc/local-gguf-*-handlers.ts`
- `apps/desktop/e2e/local-gguf-*.spec.ts`
- binary fetch/build wiring in `scripts/`, `apps/desktop/package.json`, `apps/desktop/electron-builder.yml`, and GitHub workflows

The older root-level MCP/permissions completion docs were not the primary audit target.

## Executive Summary

The Phase 2 and Phase 3 implementation is substantially present: runtime services, pool orchestration, GPU probe/ranking, binary fetch manifest, GGUF parser, scanner, watcher, resilience monitor, library service, IPC handlers, and E2E coverage all exist.

However, there are release-blocking issues:

1. Real `llama-server` readiness detection still matches the pre-amendment log string, so real model loads can time out and be killed even after the server is ready.
2. The local package cannot currently typecheck or run its full test suite in this checkout because `chokidar` and `memfs` are not linked into `packages/local-gguf-runtime/node_modules`.
3. Release CI still omits `packages/local-gguf-runtime` from the workspace composite build step.

There are also specification drift issues around Maxwell/CUDA backend ranking and Win ARM64 Vulkan support.

## Findings

### High: Real llama-server readiness detection likely fails on b9371

Evidence:

- `packages/local-gguf-runtime/src/runtime/server-lifecycle.ts:37`
- `packages/local-gguf-runtime/src/runtime/server-lifecycle.test.ts:39`
- Phase 2 spike amendment in `docs/superpowers/plans/2026-05-27-local-gguf-support/phase-02-runtime-pool.md`
- Hardware spike in `docs/spikes/2026-05-27-S4-llama-server-lifecycle.md`

Current implementation:

```ts
const READY_LINE_REGEX = /HTTP server listening/i;
```

The Phase 2 hardware amendment says b9371 emits readiness lines such as:

- `srv  llama_server: model loaded`
- `server is listening on http://...`

It explicitly warns not to hard-code the old `HTTP server listening` string. The current tests only exercise the obsolete string, so this regression is not caught.

Impact:

Real `spawnServer()` can wait until `readyTimeoutMs`, kill a healthy server, and reject with `server-spawn-failed`. That breaks Phase 2's core promise: load a GGUF, expose a chat endpoint, and unload cleanly.

Recommended fix:

- Replace `READY_LINE_REGEX` with the b9371-compatible union from the S4 amendment.
- Add tests for at least:
  - `model loaded`
  - `server is listening on`
  - old `HTTP server listening` as compatibility fallback if desired
- Add negative coverage for early exit before readiness.

Suggested shape:

```ts
const READY_LINE_REGEX =
  /\bmodel loaded\b|server is listening on|HTTP server listening/i;
```

### High: Local GGUF package verification is not reproducible in this checkout

Evidence:

- `packages/local-gguf-runtime/package.json` declares `chokidar` and `memfs`.
- `pnpm-lock.yaml` contains both packages.
- `packages/local-gguf-runtime/node_modules` lacks symlinks for both.
- `corepack pnpm@9.15.9 -F @team-x/local-gguf-runtime test` failed.
- `corepack pnpm@9.15.9 -F @team-x/local-gguf-runtime typecheck` failed.

Observed failures:

```text
Error: Failed to load url chokidar ... packages/local-gguf-runtime/src/library/folder-watcher.ts
Error: Failed to load url memfs ... packages/local-gguf-runtime/src/library/scanner.test.ts
src/library/folder-watcher.ts(15,22): error TS2307: Cannot find module 'chokidar'
```

Impact:

Phase 3 tests cannot collect, and desktop local-GGUF service tests that import the package barrel also fail to collect. This blocks Stage 1 quality gate validation from this checkout.

Assessment:

This appears to be a stale local install/link state rather than an intent gap in `package.json`, because the manifest and lockfile already include both dependencies.

Recommended fix:

- Run `corepack pnpm@9.15.9 install` from the repo root and verify `packages/local-gguf-runtime/node_modules/chokidar` and `packages/local-gguf-runtime/node_modules/memfs` are linked.
- Re-run:

```bash
corepack pnpm@9.15.9 -F @team-x/local-gguf-runtime typecheck
corepack pnpm@9.15.9 -F @team-x/local-gguf-runtime test
corepack pnpm@9.15.9 -F @team-x/desktop test -- local-gguf-runtime-handlers local-gguf-library-handlers local-gguf/runtime-service local-gguf/pool-service local-gguf/library-service
```

### Medium: Release workflow omits local-gguf-runtime from composite package build

Evidence:

- `.github/workflows/ci.yml:67` includes `packages/local-gguf-runtime`.
- `.github/workflows/release.yml:83` omits it.
- Phase 2 handoff explicitly warned to keep this list updated once desktop imports the package.

Current release step:

```yaml
pnpm exec tsc --build packages/shared-types packages/role-schema packages/provider-router packages/telemetry-core packages/intelligence
```

Impact:

Fresh release runners may fail when desktop typecheck expects referenced project output for `@team-x/local-gguf-runtime`, or may drift from CI behavior. This is especially risky because release.yml comments say it mirrors ci.yml.

Recommended fix:

Update `.github/workflows/release.yml` to include:

```yaml
packages/local-gguf-runtime
```

### Medium: Backend ranking defers a Maxwell/compute-capability rule that the phase amendment made load-bearing

Evidence:

- `packages/local-gguf-runtime/src/gpu-probe/ranking.ts:16`
- `docs/spikes/2026-05-27-S2-gpu-probe-cross-platform.md`
- `docs/spikes/2026-05-27-S4-llama-server-lifecycle.md`

Current implementation:

```ts
// NOTE: compute-capability ranking (e.g. Maxwell gating) is explicitly
// deferred — do NOT add special-casing here.
```

The spike amendments say Maxwell-class NVIDIA cards should not blindly prefer the pinned CUDA 13.3 build. On Rocky's dual GTX TITAN X rig, CUDA 13.3 is not expected to work, while Vulkan is the better default.

Impact:

The runtime will rank CUDA first for any CUDA-available NVIDIA inventory, then rely on `resolveActiveBinary()` health-check fallback. That may still eventually fall back, but it does so after a failing CUDA smoke check and persists a fallback reason. It also contradicts the Phase 2 amendment that ranking should read compute capability, not just vendor.

Recommended fix:

- Teach `rankBackends()` to inspect CUDA device `computeCap`.
- For Maxwell/PTX-JIT-only classes, soft-demote CUDA below Vulkan when Vulkan is available.
- Add deterministic fixture tests for:
  - modern NVIDIA: `cuda > vulkan > cpu`
  - Maxwell NVIDIA + Vulkan: `vulkan > cuda > cpu` or `vulkan > cpu`, depending on final product decision
  - NVIDIA with no Vulkan fallback: current CUDA path remains attempted if compatible

### Low: Win ARM64 Vulkan is tested as supported even though b9371 has no binary

Evidence:

- `packages/local-gguf-runtime/src/runtime/binary-resolver.ts:21`
- `packages/local-gguf-runtime/src/runtime/binary-resolver.test.ts:85`
- `scripts/llama-binaries-manifest.json:99`

The manifest records `win32-arm64-vulkan` as a known gap in b9371, but the resolver support matrix includes `win32-arm64: ['vulkan', 'cpu']`, and tests assert that Win ARM64 Vulkan resolves successfully if a file exists.

Impact:

This creates contract ambiguity. The manifest says Win ARM64 is CPU-only for b9371, while the resolver says Vulkan is a supported platform/backend pair. Runtime fallback will likely handle absence, but tests encode a capability that the shipped binary set does not provide.

Recommended fix:

Choose one contract and align tests:

- Preferred for b9371: remove `vulkan` from `win32-arm64` support and assert `binary-unsupported`.
- Alternative: keep `vulkan` as a future-capable backend, but add an explicit test that the b9371 manifest gap causes `binary-not-found` at runtime and falls back to CPU.

### Low: Phase 3 E2E resilience spec does not assert status transitions

Evidence:

- `apps/desktop/e2e/local-gguf-network-share-resilience.spec.ts:9`

The spec intentionally asserts app survival and IPC responsiveness, not that a watch folder flips to `unreachable` and then back to `reachable`.

Impact:

This is still valuable crash-resilience coverage, but it does not fully verify the Phase 3 requirement that network-share status flips on disconnect/reconnect. Unit tests likely cover the monitor behavior, but the end-to-end workflow has a gap.

Recommended fix:

- Add a test-mode injectable shorter resilience poll interval, or a test-only IPC hook, so E2E can deterministically assert folder status transitions without waiting 30 seconds.
- Keep the existing crash-survival spec as a separate resilience smoke.

## Positive Coverage Observed

The implementation includes several good decisions worth preserving:

- `LibraryService` uses a bounded 1 MiB head read through a custom filesystem adapter in `apps/desktop/src/main/index.ts`, avoiding full multi-GB file reads.
- `LibraryService` handles watcher and monitor `error` events, avoiding process crashes from unhandled EventEmitter errors.
- `LruPool` serializes capacity-sensitive loads with `loadGate`, avoiding concurrent over-capacity model loads.
- `PoolService` passes spawn arguments as an array and refuses model paths that start with `-`, reducing shell and flag-smuggling risk.
- Binary fetch uses `execFile` rather than shell interpolation for extraction commands.
- `RuntimeService.resolveActiveBinary()` performs a backend health check before model load and persists fallback choices.
- `scanner.ts` has explicit Windows/UNC path normalization logic rather than relying on platform-sensitive `path.join`.

## Verification Commands Run

### Runtime Package Tests

Command:

```bash
corepack pnpm@9.15.9 -F @team-x/local-gguf-runtime test
```

Result:

- 19 test files passed.
- 1 integration test file skipped.
- 2 suites failed at collection:
  - `src/library/folder-watcher.test.ts`
  - `src/library/scanner.test.ts`

Failure reason:

- `chokidar` unresolved
- `memfs` unresolved

### Runtime Package Typecheck

Command:

```bash
corepack pnpm@9.15.9 -F @team-x/local-gguf-runtime typecheck
```

Result:

- Failed with `TS2307: Cannot find module 'chokidar'`.

### Focused Desktop Local-GGUF Tests

Command:

```bash
corepack pnpm@9.15.9 -F @team-x/desktop test -- local-gguf-runtime-handlers local-gguf-library-handlers local-gguf/runtime-service local-gguf/pool-service local-gguf/library-service
```

Result:

- IPC handler tests passed:
  - `local-gguf-runtime-handlers.test.ts`
  - `local-gguf-library-handlers.test.ts`
- Service tests failed at collection because importing `@team-x/local-gguf-runtime` reaches `folder-watcher.ts`, which imports unresolved `chokidar`.

## Recommended Fix Order

1. Repair local dependency install and rerun focused package + desktop tests.
2. Fix `server-lifecycle.ts` readiness detection and add b9371 readiness tests.
3. Add `packages/local-gguf-runtime` to `.github/workflows/release.yml` composite build step.
4. Align Win ARM64 Vulkan resolver contract with the b9371 manifest gap.
5. Implement compute-cap-aware ranking for Maxwell-class NVIDIA hardware.
6. Add deterministic E2E or integration coverage for watch-folder status transitions.

## Overall Assessment

Phase 2 and Phase 3 are close structurally, but they are not production-ready until the readiness detector, verification reproducibility, and release workflow gap are fixed. The most important behavioral risk is `spawnServer()` readiness detection: it is a small code change with large blast radius because it gates every local GGUF model load.
