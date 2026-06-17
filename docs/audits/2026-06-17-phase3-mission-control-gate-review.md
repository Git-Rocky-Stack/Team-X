# Team-X Phase 3 Mission Control Gate Review

Date: 2026-06-17
Branch: `feat/v3.4.0-sweep-phase-03-mission-control`
Baseline: `main` at `c00478562a28f672362d6ecfda0b414a02ba3137`
Reviewed HEAD: `a9dc1a6620f01d5e300a8f536a4d74845c56e156`

## Gate Decision

**Conditional NO-GO for continuing into the next phase until the P1 shutdown and live-state scoping issues are fixed.**

The implementation is much healthier than the previous Phase 2 gate state: the full Electron E2E suite now passes, including the previously blocked RAG flow, and the renderer sweep did not break the existing Playwright selector contract. The remaining blockers are not visual taste issues. They are runtime correctness and release-gate reliability issues that should be resolved before compounding work in Phase 4.

## Scope Reviewed

The current branch is 9 commits ahead of `origin/feat/v3.4.0-sweep-phase-03-mission-control` and 24 commits beyond `main`.

Primary changed files:

- `apps/desktop/src/renderer/src/features/dashboard/mission-control-dashboard.tsx`
- `apps/desktop/src/renderer/src/features/dashboard/cards-view.tsx`
- `apps/desktop/src/renderer/src/features/dashboard/commands-view.tsx`
- `apps/desktop/src/renderer/src/features/dashboard/dashboard-subtabs.tsx`
- `apps/desktop/src/renderer/src/features/dashboard/dashboard-subview-state.tsx`
- `apps/desktop/src/renderer/src/features/dashboard/employee-card.tsx`
- `apps/desktop/src/renderer/src/features/dashboard/floor-view.tsx`
- `apps/desktop/src/renderer/src/features/dashboard/stream-view.tsx`
- `apps/desktop/src/renderer/src/features/dashboard/timeline-view.tsx`
- `apps/desktop/src/renderer/src/components/console/lamp-tile.tsx`
- `apps/desktop/src/renderer/src/styles/globals.css`
- `apps/desktop/src/renderer/tailwind.config.ts`
- `CHANGELOG.md`
- `DESIGN.md`
- `docs/superpowers/plans/2026-06-16-sweep-phase-03-mission-control.md`
- `docs/audits/2026-06-17-phase3-mission-control-design-review.md`

Diff size against `main`: 18 files changed, 2,629 insertions, 940 deletions.

## Verification Matrix

| Check | Result | Notes |
| --- | --- | --- |
| `git diff --check main...HEAD` | PASS | No whitespace errors. |
| `pnpm typecheck` | PASS | All workspace typechecks passed, including desktop main/preload/renderer/e2e configs. |
| `pnpm lint` | PASS | Biome checked 820 files with no fixes needed. |
| `pnpm lint:eslint` | INCONCLUSIVE / BLOCKED | Timed out twice: once at ~124s and once at ~304s. No result was returned. |
| Targeted ESLint on changed dashboard TS/TSX slice | PASS with one irrelevant CSS ignore warning | `eslint` passed the dashboard and `lamp-tile.tsx` targets; the CSS warning was `File ignored because no matching configuration was supplied`. |
| `pnpm test` | PASS | Vitest exited 0. Expected fixture warnings appeared, but no failing tests. |
| `pnpm -F @team-x/desktop test:e2e` | PASS | Production Electron build succeeded; Playwright reported `26 passed (1.6m)`. |
| `pnpm audit:claims:strict` | PASS | `0 verified, 0 allowlisted, 0 UNALLOWED out of 0`. |

## Findings

### P1: Heartbeat service is not stopped during app shutdown and can query after the DB closes

Locations:

- `apps/desktop/src/main/index.ts:930-939`
- `apps/desktop/src/main/index.ts:3123-3306`
- `apps/desktop/src/main/orchestrator/heartbeat-service.ts:328-358`

Evidence:

- `createHeartbeatService(...)` is assigned to a local `const heartbeatServiceInstance` inside boot (`index.ts:931`) and immediately started (`index.ts:939`).
- The graceful shutdown path stops RAG indexer, copilot services, routines, command service, local GGUF pool, orchestrator, and MCP host, but it has no module-level heartbeat handle to stop.
- `heartbeat-service.ts:336-346` creates a repeating `setInterval` that calls `agentWakeupRequestsRepo.listCompaniesWithDueWork()`.
- `heartbeat-service.ts:349-358` also schedules an initial `setTimeout` that calls the same repo.
- During the passing E2E run, multiple app exits emitted `UnhandledPromiseRejectionWarning: TypeError: The database connection is not open` from `listCompaniesWithDueWork` after shutdown.

Impact:

The app can continue running heartbeat work against closed resources during quit. In tests this is noisy but survivable; in packaged/runtime flows it increases teardown instability, can mask real shutdown errors, and weakens confidence in long-running autonomous execution.

Recommendation:

Promote the heartbeat service to a module-level shutdown-managed instance. Stop it before DB-dependent services close. Also track the initial startup timeout and clear it in `stop()`, or add a stopped flag checked before both the interval body and the initial timeout body.

Acceptance criteria:

- Shutdown calls `heartbeatServiceInstance.stop()` exactly once before database teardown.
- `stop()` clears both the interval and the initial timeout.
- A focused unit test proves `stop()` prevents post-stop repo calls.
- The full E2E suite no longer emits post-shutdown `database connection is not open` rejections.

### P1: Dashboard live-state counts are not scoped to the active workspace roster

Locations:

- `apps/desktop/src/renderer/src/store/app-store.ts:279`
- `apps/desktop/src/renderer/src/store/app-store.ts:380-436`
- `apps/desktop/src/renderer/src/features/dashboard/stream-view.tsx:66-113`
- `apps/desktop/src/renderer/src/features/dashboard/floor-view.tsx:127-181`
- Related changed consumers: `cards-view.tsx:35-84`, `mission-control-dashboard.tsx:656-668`

Evidence:

- `employeeLive` is a global `Record<string, EmployeeLiveState>` keyed only by employee id.
- `setCompanyId` changes `companyId` and clears `autonomyMemoryThreadId`, but does not clear or partition `employeeLive`.
- `StreamView` calculates `thinkingCount` from `Object.values(employeeLive)` rather than the `employees` prop for the active company.
- `FloorView` does the same and derives `idleCount = employees.length - thinkingCount`, which can become negative if live state from another workspace remains active.
- The views then present active counts and VU meters as if those signals belong to the currently selected workspace.

Impact:

Team-X is explicitly multi-workspace. A live run in workspace A can pollute Mission Control's Stream/Floor counts after switching to workspace B. This creates false operational telemetry in the flagship dashboard and can mislead the operator about which company is actively executing.

Recommendation:

Scope live-state aggregation to the active roster. The minimal safe fix is to derive counts from `employees.filter((employee) => employeeLive[employee.id]?.status === 'thinking')`. The better long-term fix is to include `companyId` in live state or clear live state on workspace switch, then add regression coverage for switching workspaces while a prior workspace employee is still marked thinking.

Acceptance criteria:

- Stream/Floor active counts never include employees outside the current `employees` prop.
- `idleCount` cannot go negative.
- VU meter values remain in the expected 0-1 domain before component clamping.
- A test covers workspace switching with stale `employeeLive` entries from another company.

### P2: Full ESLint gate is not currently verifiable

Locations:

- `package.json:15`
- `apps/desktop/package.json:17`
- `docs/superpowers/plans/2026-06-16-sweep-phase-03-mission-control.md:1123`
- `CHANGELOG.md:41-42`

Evidence:

- Phase 3's definition of done requires `pnpm lint:eslint`.
- The changelog claims ESLint verification.
- Current live gate attempts timed out twice: first around 124 seconds, then around 304 seconds.
- A targeted ESLint run over the changed dashboard TS/TSX files did return and passed, so this is not evidence of an obvious dashboard lint failure. It is evidence that the full required gate is not reliable on this machine/session.

Impact:

The branch cannot honestly claim the full Phase 3 gate is reproducible until `pnpm lint:eslint` returns deterministically. This matters for handoff and CI parity even if the changed slice appears clean.

Recommendation:

Investigate the full ESLint traversal separately. Likely next steps: run `eslint . --debug` or shard by `src/main`, `src/preload`, `src/renderer`, and `e2e` to isolate the hang, then either fix the problematic rule/file or split the script into deterministic subcommands.

Acceptance criteria:

- `pnpm lint:eslint` exits 0 locally within an agreed timeout, or the script is split into equivalent deterministic sub-gates.
- The changelog's ESLint claim remains true only after a fresh successful run.

### P2: Dashboard subtab active state is visual-only for assistive technology

Location:

- `apps/desktop/src/renderer/src/features/dashboard/dashboard-subtabs.tsx:31-41`

Evidence:

- Active state is communicated by `nav-tile-active` class only.
- The buttons do not expose `aria-current`, `aria-pressed`, or a tablist/tab selected-state pattern.

Impact:

Sighted users can see the active dashboard subview, but assistive technology users do not get an explicit active-state announcement. This is a regression risk because Phase 3 specifically touches navigation chrome and the phase gate calls out accessibility selector preservation.

Recommendation:

Add `aria-current={isActive ? 'page' : undefined}` or convert the rail to a proper `tablist`/`tab` pattern with `aria-selected`. Given these are command buttons changing app subviews, `aria-current="page"` is likely the smallest compatible fix.

Acceptance criteria:

- The active dashboard subview has a semantic active-state attribute.
- A source guard or renderer test asserts the active-state attribute.

### P2: E2E passes but still exposes shutdown and accessibility warning debt

Locations:

- Shutdown warning source: `apps/desktop/src/main/orchestrator/heartbeat-service.ts:336-358`
- Runtime dialog warnings surfaced from built renderer bundle during E2E.

Evidence:

The full E2E suite passed, but logs included:

- Electron dev CSP warnings for insecure content security policy. These are expected in dev/test if absent from packaged builds, but should not be ignored for release review.
- `Warning: Missing Description or aria-describedby={undefined} for {DialogContent}` from Radix Dialog.
- `providers.listModels` fetch failures when local providers are unavailable.
- Post-shutdown `database connection is not open` unhandled promise rejections from the heartbeat loop.

Impact:

Only the heartbeat warning is a P1 blocker for this phase because it maps to a concrete un-stopped service. The dialog warnings are broader accessibility debt that should be triaged before a release hardening phase. Provider model-list fetch failures should render graceful UI copy and should not bubble as scary main-process handler errors in normal unconfigured local-provider states.

Recommendation:

Track the dialog and provider warning cleanup as P2 hardening. Do not let these warnings become accepted baseline noise; they reduce signal during future E2E audits.

### P3: Phase 3 tests rely heavily on source-string guards

Locations:

- `apps/desktop/src/renderer/src/features/dashboard/mission-control-dashboard.test.tsx`
- `apps/desktop/src/renderer/src/features/dashboard/dashboard-cluster-sweep.test.ts`

Evidence:

The new Phase 3 tests primarily read source files and assert strings/class-token absence. This is useful for aesthetic guardrails, but it does not prove runtime interaction behavior such as workspace switching, panel toggling persistence, active subtab semantics, keyboard focus order, or stale live-state isolation.

Impact:

The visual sweep is protected against class drift, but behavior regressions can slip through if they preserve the expected strings.

Recommendation:

Add focused runtime tests for:

- Dashboard layout toggle + reset with optimistic save and rollback.
- Active subtab semantic state.
- Workspace switch with stale live state from another company.
- Stream/Floor active-count derivation from current roster only.

## Positive Findings

- The previous Phase 2 E2E blocker is resolved in this live tree: full Playwright E2E passed 26/26, including the RAG flow spec that previously hung on the second `Control+Enter`.
- TypeScript project references are healthy in this branch; `pnpm typecheck` passed across shared packages, local GGUF runtime, desktop main/preload/renderer, and E2E configs.
- Biome formatting/lint is clean across 820 files.
- The Phase 3 dashboard work preserves the existing E2E selector surface strongly enough for the full Electron suite to pass unmodified.
- The new console vocabulary is more internally consistent after the design-review refinements: terminal faults use steady `NO-GO`, warning blink remains reserved for unacknowledged alerts, and the dashboard no longer mixes the old `mission-shell`/`mission-panel` primitives into the flagship surface.

## Next-Phase Conditions

Before Phase 4 development starts:

1. Fix heartbeat shutdown ownership and prove no post-shutdown DB queries occur.
2. Scope dashboard live-state counts to the active workspace roster and cover stale cross-workspace state.
3. Make `pnpm lint:eslint` reproducible or split it into deterministic sub-gates.
4. Add semantic active-state to dashboard subtabs.
5. Keep the full current validation set green: `git diff --check main...HEAD`, `pnpm typecheck`, `pnpm lint`, `pnpm lint:eslint`, `pnpm test`, `pnpm -F @team-x/desktop test:e2e`, and `pnpm audit:claims:strict`.

## Gate Summary

This branch is close, and it is materially stronger than the prior gate because the full Electron suite is green. It is not yet clean enough to enter the next phase without risk. The two P1 items are exactly the kind of issues that get harder to isolate once more dashboard/runtime work lands on top.

