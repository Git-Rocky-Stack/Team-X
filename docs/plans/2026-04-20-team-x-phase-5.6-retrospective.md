# Phase 5.6 - Reconciliation & Remediation Retrospective

**Date:** 2026-04-20
**Phase:** Phase 5.6 - Reconciliation & Remediation
**Milestones covered:** M-A conformance audit -> M-B triage -> M-E process safeguards -> M-C backend backfill -> M-D UI backfill -> M-F documentation truth-up -> M-G branch hygiene and ship.
**Release marker:** v1.1.1
**Baseline at entry:** Phase 5 exit v1.1.0 plus paused Phase 6 M36 T0/T1 work.
**Exit gate:** 1683 unit tests, 13 Playwright specs / 18 cases, strict claim gate 95 verified / 0 allowlisted / 0 UNALLOWED.

> This retrospective follows the locked six-section structure established by the Phase 5 retrospective so release retrospectives stay directly comparable.

---

## 1. What we shipped

| Milestone | Result | Evidence |
|---|---|---|
| M-A | Audited CLAUDE.md claims against on-disk evidence across Phases 1-5. | `docs/audits/2026-04-17-conformance-audit.md`, 414 rows. |
| M-B | Dispositioned every gap row. | 41 gap rows: 27 restore / 14 deprecate / 0 replace. |
| M-E | Added process safeguards before restoration work continued. | DoD template, claim-evidence audit, pre-commit guard, branch policy, Loki `verifiedBy`, quarterly cadence. |
| M-C | Restored backend surface for multi-company CRUD and org chart. | `companies.create/update/delete`, `org_edges`, `orgchart.get`, `employees.promote`, `employees.setManager`, invariant #11 events. |
| M-D | Restored renderer surface and E2E coverage. | Workspace switcher, create/settings dialogs, chat tab, org tree, drag reassignment, promote/fire, manager select. |
| M-F | Reconciled documentation to shipped reality. | CLAUDE.md buckets, README/user-guide/QA counters, empty claim allowlist, strict claim gate. |
| M-G | Shipped release hygiene. | v1.1.1 version bump, CHANGELOG promotion, retrospective, branch deletion, tag/push plan. |

The remediation restored the surfaces that were promised in Phase 2 but stranded outside mainline: company CRUD + workspace UI, org hierarchy + management actions, and the top-bar Chat entry point. It also converted the drift itself into a governed workflow: claims now require evidence, milestones have explicit DoD, and Loki ledgers carry verification blocks.

This release line also includes the earlier Phase 6 capabilities/role-fit branch work from the same session history: official role capabilities, parser validation, and capability-aware role-fit scoring. That work is not a Phase 5.6 remediation deliverable, but it is present in the release history and must be reconciled in the next Phase 6 task rather than rediscovered later.

---

## 2. What went well

The claim-evidence gate paid off immediately. M-C and M-D could remove allowlist rows as restoration landed, and M-F could run strict mode with 95 verified claims and zero exceptions.

The M-E reorder was the right call. Shipping safeguards before backend/UI backfill meant the restored features ran under the process that was designed to prevent the original drift.

The M-D E2E expansion caught real lifecycle behavior rather than only component rendering. Workspace create/update/archive/delete, company audit events, org reassignment, invalid-cycle rejection, promote/fire, and manager selection now have user-flow coverage.

The audit doc became a usable backlog. Every restore/deprecate decision had an owner milestone and an exit-evidence column, which kept M-C/M-D/M-F bounded even as the work got large.

The 57-role correction held. The project now consistently describes 55 user-hireable roles plus 2 hidden system roles, and docs no longer imply a literal shared `role.md` filename.

---

## 3. What cost us time

The native-module ABI split remains expensive. Unit tests and Electron E2E require different `better-sqlite3` rebuild paths, and the safest gate still runs both.

Documentation drift was wider than the original symptom. The role count was the first visible error, but the audit also found stale IPC names, stale bus-event wording, historical test-count ambiguity, and previously stranded UI claims.

M-D step size grew because UI restoration had to prove lifecycle edges, not just mount screens. That added E2E assertions for audit events, invalid manager cycles, archive/delete flows, and bus-driven refresh.

The branch history contains intentional Phase 6 work ahead of the Phase 5.6 release marker. That is manageable, but it means the next task needs to reconcile Loki and Phase 6 docs with code already present on the branch before adding more capability work.

---

## 4. What we deferred

No Phase 5.6 restore row is deferred. The audit backlog's restore rows are all closed by M-C/M-D/M-E evidence or the final M-G release gate.

The following remain future work outside Phase 5.6:

| Deferral | Reason |
|---|---|
| Phase 6 capability/role-fit reconciliation | Earlier Phase 6 code is already present; the next task should verify, document, and ledger it cleanly before more Phase 6 work. |
| Capability explainability UI | M37 scoring can improve assignment quality without a renderer surface; explanation UX can follow once the scorer is stable. |
| Copilot insight export | Still a Phase 6 candidate; M-G did not add new export IPC. |
| Cross-company copilot rollups | Requires product validation after multi-company usage exists. |
| Autonomous copilot actions | Still intentionally out of scope until approval tiers are designed. |
| Agent-to-agent negotiation | Research-heavy and not needed for remediation. |

---

## 5. Metrics

| Metric | Phase 5 exit | Phase 5.6 exit |
|---|---:|---:|
| Unit tests | 1169 | 1683 |
| E2E specs | 11 | 13 |
| Playwright cases | 12 | 18 |
| Claim-evidence gate | Not present | 95 verified / 0 allowlisted / 0 UNALLOWED |
| Gap rows | Unknown | 41 dispositioned, 0 unresolved restore rows |
| P0 restore clusters | 2 stranded | 2 restored |

Release artifacts:

- `CHANGELOG.md` promoted to v1.1.1.
- Seven workspace `package.json` files bumped to `1.1.1`.
- `worktree-phase-2-the-org` is deletion-approved after the M-G cross-check.
- v1.1.1 tag lands on the M-G ledger commit.

---

## 6. Phase 6 seeds

The next Phase 6 move should be a reconciliation/verification task, not new feature expansion. The branch already contains capability frontmatter, parser validation, and role-fit scoring, so the next task should:

1. Verify the capability parser, role-pack backfill, pack signature, and role-fit scorer against the current v1.1.1 baseline.
2. Update Phase 6 Loki state so it no longer says M36 T2 is merely pending if the code surface is already present.
3. Decide whether the next implementation task is M37 hardening, M38 insight feedback loop, or a small audit task that pins the already-landed role-fit behavior with source-string guards.

The broader Phase 6 seeds from the Phase 5 retrospective still stand: insight export, cross-company rollups, proactive actions with approval tiers, agent-to-agent negotiation, and telemetry filtering. They should start only after the capability/role-fit ledger is reconciled.

---

## Closing note

Phase 5.6 was a process repair, not a feature sprint. It restored missing product surface, but the more important result is that Team-X now has an evidence loop: claims map to files, tests, audit rows, and Loki verification instead of relying on status prose. The next phase should preserve that discipline, especially because capability-based role fit is already in the branch history and needs the same evidence-backed handoff.
