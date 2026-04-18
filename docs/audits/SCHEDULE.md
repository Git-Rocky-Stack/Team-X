# Conformance audit schedule

> **S6 of the Phase 5.6 M-E process safeguards suite.** Quarterly
> re-audit cadence. Drift was allowed to accumulate for 10+ milestones
> before the M-A conformance audit caught it; quarterly cycles cap the
> next remediation at ≤3 months of accumulated drift, not 10+
> milestones'.
>
> Plan ref: [`docs/plans/2026-04-17-team-x-phase-5.6-remediation.md`](../plans/2026-04-17-team-x-phase-5.6-remediation.md) §7 S6.
> Cadence rule: every 3 months OR every 5 milestones, whichever first.

---

## Audit log

| Audit date | Trigger | Audit doc | Drift surfaced | Remediation |
|---|---|---|---|---|
| **2026-04-17** | Pre-M36-T2 spot-check by Rocky | [`2026-04-17-conformance-audit.md`](2026-04-17-conformance-audit.md) | 414 rows: 350 shipped / 19 partial / 16 missing / 8 unverifiable; 15 P0 / 8 P1 / 10 P2 / 16 P3; two stranded clusters (A multi-company M7, B M9 org chart) | Phase 5.6 M-A → M-G (estimated 6–8 weeks; v1.1.0 → v1.1.1) |

---

## Next scheduled re-audit

> **Date:** `2026-07-17` (3 months after M-A ship).
> **Trigger:** quarterly cadence — runs whether or not the 5-milestone counter has tripped.
> **Owner:** Rocky Elsalaymeh (delegated to Loki/Claude on the day, supervised review).
> **Output:** delta diff against the previous audit (NOT a full new audit) — fast.

If the audit surfaces ≥1 P0 row OR ≥3 P1 rows, open a Phase 5.6-style
remediation playbook (M-A audit → M-B triage → M-C/M-D restore → M-F docs
→ M-G ship). Smaller drift surfaces fold into the next regular phase.

---

## Cadence rule

> **Every 3 months OR every 5 milestones, whichever first.**

The 5-milestone counter is the safety net for fast-shipping seasons.
Phase 5 shipped 8 milestones in ~2 weeks of focused work; under
3-month-only cadence, a similar burst could ship 10+ milestones before
the next audit. The 5-milestone trip wire ensures the audit cycle keeps
pace with delivery velocity.

### Counter state

- **Last audit milestone:** Phase 5.6 M-A (2026-04-17)
- **Milestones shipped since last audit:** 0 (Phase 5.6 in flight)
- **Next 5-milestone trip:** Phase 5.6 M-G + first 4 Phase 6 milestones, OR 2026-07-17, whichever first

---

## Audit doc template

A re-audit doc lives under `docs/audits/<YYYY-MM-DD>-conformance-audit.md` and follows the M-A schema:

- Per-row schema: `claim` / `phase` / `milestone` / `evidence_type` / `expected_location` / `evidence_found` / `status` / `severity` / `notes` / `disposition`
- Status values: `shipped ✅` / `partial ⚠️` / `missing ❌` / `unverifiable 🔍`
- Severity: `P0` / `P1` / `P2` / `P3`
- Summary tables: §1.1 status distribution, §1.2 severity rollup, §1.3 top-line drift headlines
- Cross-check addendum: 20 % of rows independently re-verified

---

## Self-running cron (future)

Once Team-X is deployed in CI with a scheduling primitive (Phase 6+),
this audit may move from manual cadence to a scheduled GitHub Actions
workflow that opens an issue against the repo every 3 months naming the
audit owner. Until then: manual reminder via this file's `Next
scheduled re-audit` block.

---

> Cross-references: M-A audit at [`2026-04-17-conformance-audit.md`](2026-04-17-conformance-audit.md). M-E plan at [`../plans/2026-04-17-team-x-phase-5.6-remediation.md`](../plans/2026-04-17-team-x-phase-5.6-remediation.md). CONTRIBUTING.md §Quarterly Re-Audit.
