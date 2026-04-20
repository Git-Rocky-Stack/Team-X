# Phase 6 M41 Demo + Hardening + v1.2.0 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Date:** 2026-04-20
**Milestone:** M41 — Demo + Hardening + v1.2.0 (Phase 6 exit gate)
**Depends on:** M36/M37 capability substrate reconciliation, M38 Insight Feedback Loop, M39 Telemetry Per-Kind Filter, M40 Insight Export
**Goal:** Prove Phase 6 works as one integrated surface, document what shipped, and prepare the additive v1.2.0 release.
**Architecture:** M41 adds no new product primitives. It composes existing Phase 6 seams into a cross-milestone E2E, reconciles docs and release markers, and runs the final verification gate before tagging.
**Tech Stack:** Electron, React 19, TypeScript, Vitest, Playwright, Biome, pnpm workspaces, electron-builder.

---

## 1. Overview

Phase 6 matured the Phase 5 Intelligence Layer without expanding the product boundary:

- **M36/M37:** capability-backed role fit is reconciled as already shipped.
- **M38:** Copilot dismissal feedback can suggest category downranking.
- **M39:** Telemetry can filter Work / Agentic / Copilot runs.
- **M40:** Copilot insights export locally as JSON or CSV.

M41 is the Phase 6 exit gate. It should behave like M35: prove the stack in one scenario, write the retrospective, reconcile public docs, promote the changelog, bump version markers, run the gate, and tag the release.

**In one sentence:** prove M36-M40 together, write down what changed, and ship v1.2.0 without adding new features.

---

## 2. Non-goals

- **No new product features.** M41 is hardening, documentation, release prep, and verification.
- **No new IPC channels.** M40 closed the last Phase 6 IPC addition (`copilot.export`).
- **No new bus events.** M38 added `copilot.weights.changed`; M41 only verifies it.
- **No new migrations.** Phase 6 remains zero-migration after M33's existing `runs.kind` column.
- **No new providers or MCP transports.** Existing test seams cover the release gate.
- **No silent metric inflation.** Test/spec counts in README, CLAUDE, CHANGELOG, and Loki must match verified command output.
- **No release tag before gates.** `v1.2.0` lands only after the final M41 gate is green.

---

## 3. Task Breakdown

| # | Task | Files touched | Tests |
|---|------|---------------|-------|
| T0 | M41 implementation plan doc | this file | docs-only |
| T1 | Cross-milestone Phase 6 integration E2E | `apps/desktop/e2e/phase-6-integration.spec.ts` | +1 E2E |
| T2 | Phase 6 retrospective | `docs/plans/2026-04-26-team-x-phase-6-retrospective.md` | docs-only |
| T3 | Demo walkthrough and scenario update | `docs/demo/phase-6-walkthrough.md`, `docs/demo/scenarios/06-phase-6-capabilities-evidence.md` | docs-only |
| T4 | README + user-guide reconciliation sweep | `README.md`, `docs/user-guide/README.md`, targeted `docs/user-guide/*.md` | docs-only |
| T5 | CHANGELOG promotion | `CHANGELOG.md` | docs-only |
| T6 | Version bump + Phase badge freeze | root/package workspace `package.json` files, `apps/desktop/src/renderer/src/components/app/top-bar.tsx`, marker tests | +2 unit target |
| T7 | Phase 6 COMPLETE marker | `CLAUDE.md`, Phase 6 design doc, source-string marker test | +3 unit target |
| T8 | Regression hardening + selector audit | existing E2E specs and source-string audit tests if gaps surface | +0-2 unit |
| T9 | Final verification gate + installer smoke | no planned code changes; evidence lands in docs/Loki | command gate |
| T10 | Release ledger + tag | Loki, CHANGELOG refs if needed | ledger-only |

**Cadence:** one atomic commit per task plus Loki ledger updates. Commit messages should use `test(m41):`, `docs(m41):`, `chore(m41):`, or `feat(m41):` only if a production marker/badge change is required.

---

## 4. Architectural Decisions

### 4.1 Cross-Milestone E2E Scenario

Create `apps/desktop/e2e/phase-6-integration.spec.ts`. The scenario should be one serial Playwright test against `NODE_ENV=test` and a fresh `--user-data-dir`, matching the existing Electron E2E harness.

Required flow:

1. Resolve seeded company and employees.
2. Verify at least one non-system role exposes capabilities through an existing role/capability lookup surface. If no renderer IPC exists, assert the user-facing outcome instead: planner role-fit behavior must still complete through existing write-side flows.
3. Run a planner/delegation action that exercises capability role-fit without changing the M32 four-weight formula.
4. Generate Copilot insights and dismiss three same-category insights to surface the M38 feedback suggestion.
5. Apply the suggestion and verify `copilot.weights.changed` appears in the append-only events list.
6. Open Telemetry and verify the M39 kind filter separates Copilot and Work/Agentic runs.
7. Open the Copilot sidebar and run a M40 JSON or CSV export; assert saved-filename status copy.
8. Assert no destructive or write-side gate bypass occurred.

The E2E should stay deterministic through existing canned seams. If the scenario needs a new test seam, stop and narrow the scenario instead.

### 4.2 Retrospective Structure

The Phase 6 retrospective must reuse the locked six-section structure from M35:

1. What we shipped
2. What went well
3. What cost us time
4. What we deferred
5. Metrics
6. Phase 7 seeds

Do not invent a new retrospective format. The value is comparability across phases.

### 4.3 Version Target

Phase 6 is additive on top of v1.1.1. The target release is **v1.2.0**.

Version bump scope must include every workspace package that currently carries `1.1.1`, plus any lockfile updates produced by the package manager. The T6 task should verify the exact file list before editing.

### 4.4 Phase Badge

The app badge should move to **Phase 6** only in the release-marker task, not during earlier M41 work. Add or update a source-string test so the badge and docs do not drift.

---

## 5. Task Details

### Task 0: Plan Doc

**Files:**

- Create: `docs/plans/2026-04-26-team-x-phase-6-m41-demo-hardening.md`
- Modify: `.loki/queue/current-task.json`
- Modify: `.loki/queue/pending.json`
- Modify: `.loki/state/orchestrator.json`

**Verification:**

```bash
pnpm audit:claims -- --strict
pnpm lint
git diff --check
```

**Commit:**

```bash
git add docs/plans/2026-04-26-team-x-phase-6-m41-demo-hardening.md .loki/queue/current-task.json .loki/queue/pending.json .loki/state/orchestrator.json
git commit -m "docs(m41): author demo hardening plan"
git push
```

### Task 1: Phase 6 Integration E2E

**Files:**

- Create: `apps/desktop/e2e/phase-6-integration.spec.ts`

**Steps:**

1. Write the failing Playwright spec first.
2. Run:

   ```bash
   pnpm -F @team-x/desktop build
   pnpm -F @team-x/desktop exec playwright test e2e/phase-6-integration.spec.ts
   ```

3. Stabilize selectors only if the spec exposes a missing stable selector.
4. Run:

   ```bash
   pnpm typecheck
   pnpm lint
   pnpm audit:claims -- --strict
   ```

**Commit:**

```bash
git add apps/desktop/e2e/phase-6-integration.spec.ts .loki/queue/current-task.json .loki/queue/pending.json .loki/state/orchestrator.json
git commit -m "test(m41): cover phase 6 integration flow"
git push
```

### Task 2: Phase 6 Retrospective

**Files:**

- Create: `docs/plans/2026-04-26-team-x-phase-6-retrospective.md`

**Steps:**

1. Use the six-section M35 retrospective structure.
2. Include one concise shipped line for M36/M37-R, M38, M39, M40, and M41.
3. Include metrics: focused test growth, E2E spec/case growth, IPC/channel deltas, bus event deltas, migration delta, docs/release deltas.
4. Include Phase 7 seeds as hypotheses, not commitments.

**Verification:**

```bash
pnpm audit:claims -- --strict
pnpm lint
git diff --check
```

**Commit:**

```bash
git add docs/plans/2026-04-26-team-x-phase-6-retrospective.md .loki/queue/current-task.json .loki/queue/pending.json .loki/state/orchestrator.json
git commit -m "docs(m41): write phase 6 retrospective"
git push
```

### Task 3: Demo Walkthrough

**Files:**

- Create: `docs/demo/phase-6-walkthrough.md`
- Create: `docs/demo/scenarios/06-phase-6-capabilities-evidence.md`
- Modify: `docs/user-guide/demo-walkthrough.md` only if it should link to the Phase 6 walkthrough.

**Acceptance:**

- Demo shows capability role-fit, feedback suggestion, telemetry kind filter, and local insight export.
- Demo does not claim autonomous action, cloud sync, or telemetry digest.
- Scenario includes stable data attributes where narration depends on UI.

**Verification:**

```bash
pnpm audit:claims -- --strict
pnpm lint
git diff --check
```

### Task 4: README + User Guide Sweep

**Files:**

- Modify: `README.md`
- Modify: `docs/user-guide/README.md`
- Modify targeted user-guide files if counters or feature lists are stale.

**Acceptance:**

- README test/spec counts match verified M41 output.
- Phase 6 surfaces are described as shipped only after the corresponding evidence exists.
- User-guide navigation links Phase 6 docs where appropriate.

**Verification:**

```bash
pnpm audit:claims -- --strict
pnpm lint
git diff --check
```

### Task 5: CHANGELOG Promotion

**Files:**

- Modify: `CHANGELOG.md`

**Acceptance:**

- Promote relevant `[Unreleased]` Phase 6 entries to `[1.2.0] - 2026-04-20`.
- Preserve Keep a Changelog headings.
- Compare links should use the repository remote and include `v1.1.1...v1.2.0`.

**Verification:**

```bash
pnpm audit:claims -- --strict
pnpm lint
git diff --check
```

### Task 6: Version Bump + Phase Badge Freeze

**Files:**

- Modify root and workspace `package.json` files currently at `1.1.1`.
- Modify lockfile if the package manager updates it.
- Modify: `apps/desktop/src/renderer/src/components/app/top-bar.tsx`
- Add or update a source-string test for the Phase 6 badge/version marker.

**Steps:**

1. Write the failing marker test first.
2. Bump versions from `1.1.1` to `1.2.0`.
3. Update top-bar badge to `Phase 6`.
4. Run focused marker test, `pnpm typecheck`, `pnpm lint`, and strict claims.

### Task 7: Phase 6 COMPLETE Marker

**Files:**

- Modify: `CLAUDE.md`
- Modify: `docs/plans/2026-04-20-team-x-phase-6-capabilities-evidence.md`
- Add or update a source-string-audit test.

**Acceptance:**

- CLAUDE status block records Phase 6 M36-M41 as complete with evidence.
- Phase 6 design doc records M41 complete.
- Source-string test pins `Phase 6 COMPLETE`, `v1.2.0`, and the current E2E count.

### Task 8: Regression Hardening

**Files:**

- Prefer existing tests/specs. Create a new source-string audit only if a concrete drift risk exists.

**Acceptance:**

- No E2E spec uses arbitrary sleeps for synchronization.
- New Phase 6 selectors are present and documented in tests.
- Run the focused Phase 6 E2E specs.

### Task 9: Final Verification Gate

Run in order:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm audit:claims -- --strict
pnpm -F @team-x/desktop build
pnpm -F @team-x/desktop exec playwright test
pnpm dist:win
```

If `pnpm dist:win` is blocked by local signing or environment setup, document the exact blocker and run the strongest available build/package substitute. Do not tag until the release gate decision is explicit.

**T9 result — 2026-04-20:** Gate passed. The first unit run exposed two stale local-state issues, both resolved before the final pass:

- Node ABI was rebuilt for Vitest after `better-sqlite3` had been compiled for Electron.
- `apps/desktop/src/main/db/repos/settings.test.ts` now accounts for the M38 `copilot_category_weights` default.
- Electron ABI was rebuilt before Playwright.
- Five older E2E specs now assert the current `Phase 6` badge instead of stale `Phase 5` text.

Final evidence:

- `pnpm test` — 138 files / 1754 tests.
- `pnpm typecheck` — clean across 6 workspace packages.
- `pnpm lint` — 0 errors / 21 known warnings.
- `pnpm audit:claims -- --strict` — 95 verified / 0 allowlisted / 0 UNALLOWED out of 95.
- `pnpm -F @team-x/desktop build` — clean.
- `pnpm -F @team-x/desktop exec playwright test` — 17 specs / 22 cases.
- `pnpm dist:win` — succeeded; emitted `release/1.2.0/Team-X-1.2.0-Setup.exe`, `release/1.2.0/Team-X-1.2.0-Setup-x64.exe`, and `release/1.2.0/Team-X-1.2.0-Setup-arm64.exe`.

No `v1.2.0` tag was created in T9. The release tag remains gated to Task 10.

### Task 10: Release Ledger + Tag

**Files:**

- Modify: `.loki/queue/current-task.json`
- Modify: `.loki/queue/pending.json`
- Modify: `.loki/state/orchestrator.json`
- Modify: `docs/plans/2026-04-26-team-x-phase-6-m41-demo-hardening.md`

**Acceptance:**

- M41 and Phase 6 are closed in Loki.
- Final verification evidence is recorded.
- `v1.2.0` tag lands on the final ledger commit only after gates pass.

---

## 6. Final Gate Targets

- **Unit tests:** current verified baseline plus M41 marker tests; exact count is recorded at T9.
- **E2E:** at least 17 specs / 22 cases after `phase-6-integration.spec.ts`; exact count is recorded at T9.
- **Typecheck:** clean across 6 workspace packages.
- **Lint:** 0 errors / 21 known warnings unless T8 reduces warnings.
- **Strict claims:** 95 verified / 0 allowlisted / 0 UNALLOWED or higher if claim inventory grows.
- **Build:** `pnpm -F @team-x/desktop build` clean.
- **Release:** v1.2.0 package metadata and tag.

---

## 7. Follow-Up Boundary

M41 should not open Phase 7. The retrospective may seed Phase 7 candidates, but implementation stops after the v1.2.0 release ledger.

---

## 8. Handoff

Start with Task 1 after this plan lands. Keep the existing TDD and atomic commit cadence. Do not combine documentation, version bump, and release tagging in one commit; that is how status drift returns.
