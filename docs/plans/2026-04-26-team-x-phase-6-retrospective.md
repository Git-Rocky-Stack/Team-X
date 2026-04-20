# Phase 6: Capabilities & Evidence Retrospective

**Date:** 2026-04-20
**Phase:** Phase 6 - Capabilities & Evidence
**Milestones covered:** M36/M37-R (capability role-fit reconciliation) -> M38 (Insight Feedback Loop) -> M39 (Telemetry Per-Kind Filter) -> M40 (Insight Export) -> M41 (demo + hardening, in progress)
**Branch-point:** Phase 5.6 `v1.1.1` remediation release.
**Baseline:** 1683 full-suite tests at Phase 5.6 ship; 13 E2E specs / 18 Playwright cases; strict claims 95 verified / 0 allowlisted / 0 UNALLOWED.
**Current verified gate:** 17 E2E specs / 22 Playwright cases after M41 T1; strict claims unchanged at 95 / 0 / 0; lint exits 0 with 21 known warnings.
**Authored during:** M41 T2 - Phase 6 exit-gate retrospective.
**Design authority:** [`2026-04-20-team-x-phase-6-capabilities-evidence.md`](./2026-04-20-team-x-phase-6-capabilities-evidence.md).
**Sibling plan docs:** [`2026-04-21-team-x-phase-6-m36-capabilities-taxonomy.md`](./2026-04-21-team-x-phase-6-m36-capabilities-taxonomy.md), [`2026-04-22-team-x-phase-6-m37-role-fit-v2.md`](./2026-04-22-team-x-phase-6-m37-role-fit-v2.md), [`2026-04-23-team-x-phase-6-m38-insight-feedback-loop.md`](./2026-04-23-team-x-phase-6-m38-insight-feedback-loop.md), [`2026-04-24-team-x-phase-6-m39-telemetry-per-kind-filter.md`](./2026-04-24-team-x-phase-6-m39-telemetry-per-kind-filter.md), [`2026-04-25-team-x-phase-6-m40-insight-export.md`](./2026-04-25-team-x-phase-6-m40-insight-export.md), [`2026-04-26-team-x-phase-6-m41-demo-hardening.md`](./2026-04-26-team-x-phase-6-m41-demo-hardening.md).

> This retrospective follows the locked six-section structure from the Phase 5 retrospective so phase exits remain directly comparable.

---

## 1. What we shipped

| Milestone | Status | Shipped line | Evidence |
|-----------|--------|--------------|----------|
| M36/M37-R | Shipped / reconciled | Capability taxonomy, role-schema capability parsing/backfill, official 57-role capability coverage, role-loader capability lookup, and capability Jaccard role-fit were reconciled from already-landed branch history rather than reimplemented. | Commit `26d07df`; focused verification 120/120 across shared-types, role-schema, role-loader, and scorer suites. |
| M38 | Shipped | Copilot dismissals became feedback: three same-category dismissals surface an explicit downrank suggestion, applying it persists category weights, and `copilot.weights.changed` emits per invariant #11. | Final focused gate: shared-types 1 file / 3 tests; desktop 6 files / 73 tests; plus `copilot-feedback.spec.ts`. |
| M39 | Shipped | Telemetry gained All / Work / Agentic / Copilot filters across company, daily usage, employee, and cost views without a new migration. | Final focused gate: shared-types 1 file / 2 tests; desktop 5 files / 27 tests; `telemetry-kind-filter.spec.ts`. |
| M40 | Shipped | Active Copilot insights export locally as JSON or CSV with company/all scope, category/severity filters, row counts, truncated flag, and saved-filename status copy. | Final focused gate: shared-types 1 file / 2 tests; desktop 4 files / 19 tests; `copilot-insight-export.spec.ts`. |
| M41 | In progress | Demo/hardening opened with a no-new-feature plan and shipped the Phase 6 integration E2E, including the agentic telemetry producer fix needed for M39's Agentic filter to observe real rows. | `phase-6-integration.spec.ts`; focused `agentic-loop-service.test.ts` 1 file / 25 tests; build, typecheck, lint, strict claims, and focused E2E green. |

Phase 6 is intentionally smaller than Phase 5. The work is calibration and evidence, not a new product layer: one capability substrate, one feedback loop, one telemetry filter, one export surface, and one exit-gate stitch spec.

---

## 2. What went well

### 2.1 Reconciliation before expansion

M37-R prevented duplicate work. Instead of pretending M36/M37 had not happened after the Phase 5.6 pause, we inventoried the branch history, verified the real files, and marked the capability substrate as shipped with evidence. That kept M38 focused on new work.

### 2.2 TDD stayed useful for source-contract work

Many Phase 6 tasks were small contract changes: shared type literals, hook request objects, renderer prop wiring, and sidebar status copy. Source-contract tests caught missing exports and missing data attributes before runtime E2E did. This was a good fit for M39 and M40, where broad UI flows would have been slower and less diagnostic.

### 2.3 Existing canned seams covered the phase

M41 T1 reused the existing Electron test-mode seams. No new classifier, provider, tool, or copilot canned seam was needed. That is strong evidence that the Phase 5 quartet still scales into Phase 6 hardening.

### 2.4 Invariant #11 kept its value

`settings.setCopilotWeights` emits `copilot.weights.changed` after the durable settings write. The feedback loop therefore participates in the same append-only event/audit/cache invalidation discipline as prior IPC mutations. M41 T1 verifies the event from the user-facing flow.

### 2.5 Local-only export boundary held

M40 copied the useful shape of audit export without loosening the privacy model. Export writes to `tmpdir()/team-x-exports`, returns a local path and row count, and emits no bus event because it is read-only. The user guide explicitly avoids cloud sync, sharing, telemetry digest, and save-dialog claims.

### 2.6 Phase 5.6 safeguards changed behavior

The Phase 5.6 drift repair work paid off immediately. M41 T1 uncovered that `AgenticLoopService` still wrote agentic runs as default `work` rows. The fix landed with a red focused test, then the integration E2E turned green. That is exactly the gate behavior the safeguards were meant to force.

---

## 3. What cost us time

### 3.1 Historical metric drift

Phase 6 started from a full-suite count that includes Phase 5.6 and earlier capability work, then most M38-M41 tasks used focused gates. The right metric is therefore "focused gates run and E2E surface growth", not a newly asserted full-suite total. M41 docs need to keep that distinction until T9 runs the full verification gate.

### 3.2 `runs.kind` was only half-finished

Migration 0012 had the column and M39 had the filter, but the agentic loop producer still omitted `kind: 'agentic'`. Earlier docs even called M31 agentic rows "candidates for future backfill". M41 T1 converted that latent gap into a small hardening fix with focused unit coverage.

### 3.3 Build and Playwright ordering matters

M40 T6 initially failed because build and E2E were launched in parallel, causing Playwright to run against stale `out/` artifacts. The rule is now explicit: build first, then run focused Electron E2E.

### 3.4 Source-contract tests can drift from runtime reality

Source tests are fast, but they do not prove the Electron bundle can exercise the path. M41 T1 earned its keep by proving M38, M39, and M40 together in one fresh app boot, and by surfacing the `agentic` producer gap that isolated M39 tests did not catch.

### 3.5 Release-marker work is still deferred inside M41

At retrospective time, M41 has not yet promoted the CHANGELOG, bumped package versions, frozen the Phase 6 badge, or written the COMPLETE marker. That is intentional per the M41 plan, but it means this retrospective must describe M41 as in progress and not claim `v1.2.0` shipped yet.

---

## 4. What we deferred

| Deferral | Why it stays out of Phase 6 | Phase 7 sketch |
|----------|-----------------------------|----------------|
| Autonomous Copilot action | Phase 6 keeps Copilot advisory. Silent action would require a separate approval, dry-run, rollback, and audit model. | Approval-tiered action policies with explicit per-action permission levels. |
| Cross-company Copilot rollup | M40 export supports all-company export, but the UI still reasons from the active company/sidebar context. | Portfolio-level insight rollups and triage filters once multi-company usage is real. |
| Telemetry digest | Zero phone-home remains non-negotiable; real usage analysis should be local and user-triggered. | Local digest service that reads `runs` and proposes settings/clamp changes. |
| Agent-to-agent negotiation | Existing planner delegates work; it does not negotiate deadlines or scope between employees. | Bounded negotiation protocol with step budgets and escalation events. |
| Weighted capability scoring | M37 uses interpretable Jaccard overlap. Weighted capability importance needs evidence before increasing complexity. | Capability weights per task type if role-fit false positives show up in demos. |
| Native save dialog for export | M40 status-copy export is enough for v1.2.0; a native dialog adds platform and packaging concerns. | Optional save-location chooser after release hardening. |

---

## 5. Metrics

### 5.1 Focused verification growth

These are focused gates, not a unique full-suite test count. The next authoritative full-suite count lands in M41 T9.

| Area | Focused evidence |
|------|------------------|
| M36/M37-R | 120 focused tests passed across shared-types, role-schema, role-loader, and scorer suites. |
| M38 | Final focused gate covered shared-types 1 file / 3 tests and desktop 6 files / 73 tests; earlier task gates covered settings repo, IPC, analyzer, copilot IPC, and renderer feedback. |
| M39 | Final focused gate covered shared-types 1 file / 2 tests and desktop 5 files / 27 tests. |
| M40 | Final focused gate covered shared-types 1 file / 2 tests and desktop 4 files / 19 tests. |
| M41 T1 | Focused unit gate covered `agentic-loop-service.test.ts` 1 file / 25 tests plus one focused Playwright integration spec. |

### 5.2 E2E growth

| Point | E2E specs | Playwright cases | Delta |
|-------|-----------|------------------|-------|
| Phase 5.6 ship | 13 | 18 | baseline |
| After M38 | 14 | 19 | +`copilot-feedback.spec.ts` |
| After M39 | 15 | 20 | +`telemetry-kind-filter.spec.ts` |
| After M40 | 16 | 21 | +`copilot-insight-export.spec.ts` |
| After M41 T1 | 17 | 22 | +`phase-6-integration.spec.ts` |

### 5.3 Surface delta

| Surface | Phase 5.6 baseline | Phase 6 current | Delta |
|---------|--------------------|-----------------|-------|
| IPC channels | 80+ | 80+ plus `settings.getCopilotWeights`, `settings.setCopilotWeights`, `copilot.export` | +3 |
| Existing IPC contracts widened | Telemetry aggregates accepted no kind filter | `telemetry.companyStats`, `dailyUsage`, `employeeStats`, and `costBreakdown` accept optional kind | +4 widened, 0 new channels |
| Bus events | 31 Phase 5-era event variants plus Phase 5.6 additions | Adds `copilot.weights.changed` | +1 |
| Migrations | 0013 present from Phase 5.6 | unchanged | +0 |
| Settings keys | Existing copilot settings | Adds `copilot_category_weights` JSON vector | +1 |
| E2E selector surface | Existing Phase 5 selectors | Adds Phase 6 use of `data-copilot-feedback-*`, `data-telemetry-kind-filter`, `data-copilot-export-*`, `data-telemetry-stat` | Additive |
| Claim audit inventory | 95 verified / 0 allowlisted / 0 UNALLOWED | unchanged | 0 drift |

### 5.4 Release/documentation delta so far

| Artifact | Status |
|----------|--------|
| Phase 6 design doc | Authored and updated through M41 planning. |
| M38/M39/M40 plan docs | Authored and closed with Loki evidence. |
| User guide | M40 added local insight export instructions. |
| README | Updated through M40 to 16 specs / 21 cases; M41 T4 will reconcile to 17 / 22 or later. |
| CHANGELOG | Not yet promoted to `[1.2.0]`; scheduled for M41 T5. |
| Version bump | Not yet done; scheduled for M41 T6. |
| Phase 6 COMPLETE marker | Not yet done; scheduled for M41 T7/T10. |

---

## 6. Phase 7 seeds

These are hypotheses, not commitments.

### 6.1 Approval-tiered Copilot actions

If repeated feedback shows users trust certain categories, add explicit approval tiers so low-risk Copilot suggestions can become prepared actions. Start with dry-run and audit-only mode; do not jump directly to autonomous mutation.

### 6.2 Local telemetry digest

Use the local `runs` table to summarize latency, token use, cost, and failure patterns. The digest should propose settings changes, not apply them. It must remain zero phone-home.

### 6.3 Portfolio insight rollup

If multi-company usage becomes real, add a portfolio rollup that groups active insights by severity and company. This builds on M40 all-company export but should be a read-side UI, not a hidden background process.

### 6.4 Weighted capability evidence

Jaccard role-fit is clear and explainable. Add weighted capability scoring only if the demo or user evidence shows repeated false positives/false negatives in assignment recommendations.

### 6.5 Negotiation protocol with budgets

Agent-to-agent negotiation can be useful only with strict step budgets, terminal events, and escalation. Treat it like the M31 agentic loop: bounded, observable, and cancelable from the start.

### 6.6 Export location and retention controls

M40 writes local files to a deterministic export directory. A future UX pass can add a native save dialog and retention cleanup, but only after packaging smoke verifies the cross-platform file flow.

---

## Closing note

Phase 6 did what it was supposed to do: it matured the Phase 5 Intelligence Layer without widening the product boundary. The main lesson is that read-path filters need producer verification, not just query tests. M41 T1 caught that with `runs.kind='agentic'`, and the fix is small because the architecture already had the right column, IPC shape, and telemetry UI waiting for it.
