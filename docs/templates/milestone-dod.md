# Milestone `<ID>` — Definition of Done

> **S1 of the Phase 5.6 M-E process safeguards suite.** Use this template
> verbatim as the per-milestone exit checklist. Every checkbox is a HARD
> gate — no item may be silently skipped. If you must defer an item, log
> it in the audit doc with a disposition + owner milestone before merging.
>
> Plan ref: [`docs/plans/2026-04-17-team-x-phase-5.6-remediation.md`](../plans/2026-04-17-team-x-phase-5.6-remediation.md) §7 S1.
> First applies to: Phase 5.6 M-C onward + every future phase.

---

## 0. Identity

- **Milestone ID:** `<phase>-<milestone>` (e.g. `5.6-M-C`, `6-M37`)
- **Plan doc:** `docs/plans/<YYYY-MM-DD>-<slug>.md`
- **Predecessor:** `<previous milestone ID + commit + ledger commit>`
- **Estimate vs actual:** `<X days estimate / Y days actual / variance %>`

## 1. Plan + Acceptance

- [ ] Plan doc exists at `docs/plans/<YYYY-MM-DD>-<slug>.md` and was committed BEFORE implementation began (T0-style).
- [ ] Every task in the milestone has concrete, testable acceptance criteria (not vague language like "works correctly").
- [ ] Acceptance criteria reference pinned test files by path, not just behavioural descriptions.
- [ ] Estimate (`estimateDays` + `bufferDays`) recorded at sprint entry and re-recorded at sprint exit for variance tracking.

## 2. Code

- [ ] Every IPC channel claimed in CLAUDE.md has a registered handler under `apps/desktop/src/main/ipc/` AND a typed entry in `packages/shared-types/src/ipc.ts`.
- [ ] Every bus event claimed in CLAUDE.md is a member of the `EventType` union in `packages/shared-types/src/events.ts` AND emitted by at least one production code path.
- [ ] Every Drizzle migration cited in CLAUDE.md exists under `apps/desktop/src/main/db/migrations/` and the journal + snapshot files are committed alongside.
- [ ] All architectural invariants (CLAUDE.md §Architectural invariants, currently #1–#11) preserved. If any invariant is bent, the design doc was amended in a separate commit BEFORE the milestone shipped.

## 3. Tests

- [ ] `pnpm test` passes; baseline test count delta recorded in CLAUDE.md status block + Loki ledger.
- [ ] `pnpm typecheck` clean across all 6 workspaces (run at repo ROOT, never workspace-scoped — see CLAUDE.md Troubleshooting).
- [ ] `pnpm lint` produces 0 errors. Warnings preserved at baseline (or counted down explicitly).
- [ ] Native ABI rebuild dance executed before the verification gate (Node ABI for vitest → Electron ABI for Playwright). See CLAUDE.md Troubleshooting.
- [ ] If the milestone introduces user-facing functionality: a Playwright E2E spec under `apps/desktop/e2e/` covers the user-facing claim end-to-end (NOT just a unit test).
- [ ] E2E uses stable `[data-*]` attribute selectors (M35 T9 contract — `data-step-kind`, `data-copilot-insight-id`, etc.).
- [ ] E2E does not use `waitForTimeout(N > 100ms)` as a synchronisation primitive (M35 T9 regression guard at `apps/desktop/src/e2e-regression-guards.test.ts`).

## 4. CLAUDE.md status block (three-bucket format)

The status block reflects SHIPPED state in three explicit buckets:

- **Shipped:** what is on disk + verified by an automated gate. Each bullet cites the artifact (file:line OR test path OR commit SHA).
- **Deferred:** what was planned but not done in this milestone, with a target milestone for landing.
- **Deprecated:** what was planned but will not be done, with a one-sentence reason.

> "Aspirational" is not a valid bucket. Every claim is shipped, deferred, or deprecated — pick one.

- [ ] Status block uses the three-bucket format verbatim.
- [ ] No claim sits in CLAUDE.md without a row in `docs/audits/<latest>-conformance-audit.md`.
- [ ] M-E S2 conformance gate (`pnpm audit:claims`) green on the milestone's atomic commit.

## 5. Documentation

- [ ] CHANGELOG.md updated under `[Unreleased]` (Keep a Changelog format).
- [ ] Audit doc gains the milestone's claimable rows (one row per IPC channel / bus event / migration / settings key).
- [ ] If the milestone introduces a user-facing surface: `docs/user-guide/<feature>.md` exists and is linked from `docs/user-guide/README.md`.

## 6. Loki ledger

- [ ] Atomic commits: one `feat`/`fix`/`docs`/`test` per task + one paired `chore(loki)` ledger commit per task. (M34 broke this — restored M35 T1.)
- [ ] `verifiedBy` field populated on the milestone-completion ledger entry per **S4 of the M-E safeguards suite** — naming the concrete evidence artifact (test file path, spec path, migration file path, or CI run URL) that proves the milestone shipped.
- [ ] `tasksShipped` counter incremented in `.loki/queue/pending.json`.
- [ ] Head-of-queue advanced to the next task in `.loki/queue/current-task.json`.
- [ ] `.loki/state/orchestrator.json` history entry added with commits + tests delta + verification-gate snapshot.

## 7. Retrospective (milestone exit)

- [ ] Milestone-exit retrospective drafted (six-section structure per Phase 5 retrospective template at `docs/plans/2026-04-19-team-x-phase-5-retrospective.md`).
- [ ] One-paragraph status posted to `.loki/CONTINUITY.md` Phase-N COMPLETE header.

## 8. No corners cut

- [ ] No silent deferrals. If something was cut, it is in the Deferred bucket of the status block AND has an audit row.
- [ ] No placeholders, stub content, TODO shortcuts, or skipped visual details (per CLAUDE.md §Zero Tolerance).
- [ ] No tests deleted or skipped to make the gate pass. If a flaky test was disabled, a regression guard pins the disablement reason.

---

## Sign-off

- **Implementer:** `<your name or model>`
- **Date:** `<YYYY-MM-DD>`
- **Atomic commit SHA:** `<sha>`
- **Ledger commit SHA:** `<sha>`
- **`verifiedBy`:** `<concrete evidence artifact paths>`

---

> Cross-references: M-A audit at `docs/audits/2026-04-17-conformance-audit.md`. M-B triage in the same doc, §20. M-E safeguards specs at plan §7. CONTRIBUTING.md §Process Safeguards.
