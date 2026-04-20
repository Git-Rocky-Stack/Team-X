# Phase 5.6 — Reconciliation & Remediation Plan

**Status:** Approved — executing (Rocky sign-off 2026-04-17 across D1–D8 + M-E reorder + PMP/Agile additions; see §13)
**Author:** Drafted by Claude (paired session, 2026-04-17), executing under Rocky's direction
**Predecessor:** Phase 5.5 hotfix shipped at commit `8d5a0db` (role-pack reconciliation + Ed25519 directory signing) — pushed to origin 2026-04-17 per D1
**Discovered:** Pre-M36-T2 audit surfaced systemic drift between CLAUDE.md status blocks and actual shipped functionality
**Scope philosophy:** Zero deferrals. No corners cut. Speed and task count are not constraints. **M-E (Process Safeguards) ships BEFORE backfill (M-C / M-D)** so the restoration itself validates the safeguards — see §13.
**Supersedes M36 T2+:** Phase 6 M36 T2+ is explicitly paused until Phase 5.6 M-G ships. Recorded in `.loki/queue/pending.json` per D8.

---

## 1. Executive Summary

The Phase 5.5 hotfix corrected the **symptoms** (20 stranded role files, missing pack.sig, unbumped pack.json). The **root cause** is a process failure that allowed CLAUDE.md status blocks to drift from on-disk reality across multiple milestones (M7 ~30% shipped, M9 ~10%, M11 partially) without detection from 2026-04-12 through Phase 5 completion.

**This proposal is a Definition-of-Done failure repair operation, not a "fix some missing files" sprint.** It restructures Team-X engineering process to make the same drift impossible going forward, while restoring the stranded functionality with full F10 fidelity.

The proposal covers:
1. **Independent conformance audit** of every claim in CLAUDE.md against on-disk evidence
2. **Triage framework** — restore vs deprecate vs replace, decided per-claim with criteria
3. **Phase 5.6 implementation plan** — 7 sub-milestones (A–G), each with Definition of Done
4. **Process safeguards** — CI gates, pre-commit hooks, milestone DoD template, branch policy
5. **Schedule, risk register, communications**
6. **Engineering principles** that govern execution

This is a marathon, not a sprint. Estimated 20–30 elapsed days at Rocky's pace, with explicit buffer per milestone. Phase 6 M36 T2+ remains paused until Phase 5.6 ships.

---

## 2. Background — What Happened

### Timeline

| Date | Event |
|---|---|
| 2026-04-11 | Phase 2 plan doc landed on main |
| 2026-04-11 | M7 (multi-company workspace + CRUD) implemented on `worktree-phase-2-the-org` branch |
| 2026-04-12 | M8 (role pack system + 20 roles + role browser) implemented on the same branch |
| 2026-04-12 | Role harmonization commit `80a52d9` on the same branch |
| 2026-04-12 | M9 (org chart + hire/fire/promote) implemented on the same branch |
| 2026-04-12 | **`83edb22` lands on main** — adds 33 more roles, commit message says *"Combined with 22 roles on the phase-2-the-org branch, this completes the full F10 org coverage"* — author assumed merge happened. It hadn't. |
| 2026-04-13 → 2026-04-20 | Phase 5 (M28 → M35) executed on main, building on a partial Phase 2 foundation. Test suites bypass the missing IPC by calling repo methods directly. UI tabs for missing features marked `disabled: true` in `top-bar.tsx` |
| 2026-04-17 | **Pre-M36-T2 manual audit by Rocky surfaced the role-count discrepancy** |
| 2026-04-17 | Phase 5.5 hotfix shipped at commit `8d5a0db` — role files cherry-picked, pack signed, load-time verification wired |
| 2026-04-17 | Investigation extended → discovered M7+M9 UI is genuinely missing on main, never replaced by Phase 5 |
| 2026-04-17 | This proposal authored |

### Confirmed gaps (pre-audit estimate — full audit will refine)

| Milestone | CLAUDE.md claim | Reality on main |
|---|---|---|
| M7 | "Company CRUD + WorkspaceSwitcher + CreateCompanyDialog + CompanySettings" | Only `companies.list` + `companies.archive` IPC. Zero workspace UI. **~30% complete.** |
| M9 | "`org_edges` table + `employees.fire/promote/setManager` + `orgchart.get` IPC + tree UI + drag-rearrange + Reports-to in hire" | Only `employees.fire` IPC. No org_edges table. No promote/setManager IPC. No tree UI (Org tab `disabled: true`). **~10% complete.** |
| M11 | "ChatList UI with amber bot icons, read-only agent thread viewing" | Chat tab `disabled: true` in top-bar. Chat works via drawer accessed elsewhere. **Partial.** |

### What's preserved as evidence

- Branch `worktree-phase-2-the-org` (4 unmerged commits, +8203 / −236 across 69 files) — **do not delete until Phase 5.6 M-G ships**
- This proposal
- Phase 5.5 hotfix commit `8d5a0db` — local, awaiting push decision

---

## 3. Root Cause Analysis (5-Whys)

**Why did 20 role files end up stranded on a never-merged branch?**
→ Because the M8 implementer assumed the branch had been merged when writing M8 commit message.

**Why did the implementer assume merge had happened?**
→ Because there was no automated check that compared the branch's contents to main before declaring M8 complete.

**Why was there no automated check?**
→ Because the milestone "Definition of Done" was implicit (acceptance criteria were per-task, not per-milestone integration).

**Why was milestone DoD implicit?**
→ Because CLAUDE.md status blocks were treated as planning aspirations rather than evidence-backed status. The norm became "write the line as planned scope; assume the implementer matched it."

**Why was there no truth-vs-claim verification?**
→ Because there was no recurring conformance audit, no CI gate that mapped CLAUDE.md claims to evidence, and no pre-commit hook that refused CLAUDE.md edits without proof.

**Conclusion: Process failure, not implementer failure.** The next session, the next milestone, the next phase will repeat this drift unless the process changes. **Phase 5.6 must include process safeguards as a first-class deliverable** (M-E below), not as an afterthought.

---

## 4. Conformance Audit Methodology — Phase 5.6 M-A

The audit is the foundation. Every subsequent decision draws on its findings. Without it, scope is guesswork.

### Method

Build a structured evidence matrix. One row per discrete claim in CLAUDE.md status blocks (Phases 1 through 5).

### Schema (one row per claim)

| Field | Source | Example |
|---|---|---|
| `claim` | Verbatim text from CLAUDE.md | "M9 — `orgchart.get` IPC channel" |
| `phase` | Inferred from section | "Phase 2" |
| `milestone` | Inferred | "M9" |
| `evidence_type` | Categorized | `ipc_channel` / `ui_component` / `migration` / `test` / `hook` / `bus_event` / `settings_key` / `behavior` |
| `expected_location` | Predicted file path | `apps/desktop/src/main/ipc/register.ts` |
| `evidence_found` | Actual on-disk artifact (file:line) or "missing" | `missing` |
| `status` | One of: `✅ shipped`, `⚠️ partial`, `❌ missing`, `🔍 unverifiable` | `❌ missing` |
| `severity` | `P0` (blocks core feature), `P1` (blocks promised feature), `P2` (nice-to-have), `P3` (cosmetic) | `P1` |
| `notes` | Anything relevant — partial-impl details, replacement candidates | "Org tab in top-bar marked `disabled: true`" |
| `disposition` | After triage: `restore` / `deprecate` / `replace` | TBD until M-B |

### Coverage requirements

- **Every status block bullet** in `CLAUDE.md` lines 27–80 gets at least one row
- **Every IPC channel** in the IPC Channels table (CLAUDE.md ~line 740) gets a row
- **Every bus event** in the Phase 5 bus events table gets a row
- **Every settings key** mentioned anywhere in CLAUDE.md gets a row
- **Test counts** ("1169 unit tests + 11 E2E specs") are verified by running the suites and counting

### Deliverable

`docs/audits/2026-04-XX-conformance-audit.md` — a markdown table, ~200–400 rows, one section per phase. Public artifact, committed to the repo.

### Verification gate

Audit is "complete" only when:
- Every row has non-empty `evidence_found` and `status`
- Every `❌ missing` and `⚠️ partial` has a severity assigned
- A summary table at the top counts shipped / partial / missing / unverifiable per phase
- A second pair of eyes (Codex CLI subagent or repeat-pass by you) cross-checks 20% of rows for accuracy

### Time-box

5 working days. If the audit runs longer, it means the gap is bigger than estimated — accept the scope expansion rather than rush.

---

## 5. Triage Framework — Phase 5.6 M-B

For each `❌ missing` and `⚠️ partial` row, the disposition is one of three:

### Restore
The functionality is core to the product vision and CLAUDE.md correctly named it. Action: backfill in M-C / M-D.

**Decision criteria** — restore if any of:
- The README, user-guide, or demo walkthrough references the feature
- The feature is named in the M28 T0 plan doc as a prerequisite
- A Phase 5 test suite would benefit from it (e.g., multi-company tests bypass the missing UI today)
- The feature is part of the locked Phase plan (1.0 source-of-truth design doc)

### Deprecate
The functionality was claimed but is no longer wanted, OR was aspirational and never made the cut. Action: rewrite the CLAUDE.md status block to reflect "shipped" + "removed from scope" with an honest reason. No code change.

**Decision criteria** — deprecate if any of:
- Phase 5 added a superior mechanism (e.g., NLU command palette may obviate some UI)
- Rocky's product vision evolved and the feature no longer fits
- The implementation cost vastly exceeds the user value

### Replace
The functionality is wanted but the originally-claimed implementation is stale. A different mechanism delivers the same user-facing capability. Action: document the swap, update CLAUDE.md, plan the replacement in a future milestone.

**Decision criteria**: case-by-case, requires Rocky judgment.

### Triage deliverable

Same audit document, with `disposition` column filled in. Each row's disposition has a one-sentence justification. Restore items become input to M-C and M-D scope.

---

## 6. Phase 5.6 Sub-Milestone Plan

Phase 5.6 is broken into seven sub-milestones (A–G), each independently shippable with its own DoD and atomic commit cadence (matching Phase 5 M28+ established practice).

### Phase 5.6 M-A — Conformance Audit

**Output:** `docs/audits/2026-04-XX-conformance-audit.md` (200–400 rows)
**Scope:** Verify every CLAUDE.md status-block claim against on-disk evidence; categorize gaps
**DoD:**
- Every claim has a row with evidence_found + status
- Severity assigned to all non-shipped items
- Summary table at document top
- Independent cross-check on 20% of rows
- Audit doc committed
**Estimated:** 5 working days
**Buffer:** +2 days

### Phase 5.6 M-B — Triage

**Output:** Audit doc updated with `disposition` column for every gap row
**Scope:** Apply restore/deprecate/replace decision per row using §5 criteria
**DoD:**
- Every gap row has disposition + one-sentence justification
- Roll-up table: count of restore / deprecate / replace per phase
- "Restore" rows feed scope of M-C and M-D
- Triage doc committed
**Estimated:** 1 working day
**Buffer:** +0.5 day

### Phase 5.6 M-C — Backend Backfill

**Output:** Repo + IPC + migration code for every "restore" row tagged backend
**Scope (provisional, refined by audit):**
- `org_edges` migration `0013` + `org-edges.ts` repo + cycle detection + tests
- `employees.promote` + `employees.setManager` repo methods + tests
- `companies.create` + `companies.update` + `companies.delete` IPC + handlers + preload bridge + shared-types contract
- `orgchart.get` IPC + handler + preload bridge + shared-types contract
- `employees.promote` + `setManager` IPC + handlers + preload bridge + shared-types contract
- Any other backend gaps surfaced by audit
**DoD:**
- Every new IPC channel has a unit test
- Every new repo method has a unit test
- Migration applied cleanly against a fresh DB and an existing dev DB
- `pnpm typecheck` clean
- `pnpm test` baseline moves up by N tests (where N = added test count, recorded in CLAUDE.md)
- No regression in Phase 5 test suites
**Estimated:** 5–7 working days
**Buffer:** +3 days

### Phase 5.6 M-D — UI Backfill

**Output:** UI components + hooks for every "restore" row tagged renderer
**Scope (provisional):**
- `dropdown-menu.tsx` Radix primitive (add `@radix-ui/react-dropdown-menu` dep)
- `features/workspace/workspace-switcher.tsx`
- `features/workspace/create-company-dialog.tsx`
- `features/workspace/company-settings.tsx`
- `features/orgchart/org-chart-view.tsx`
- `features/orgchart/org-chart-tree.tsx`
- `features/orgchart/org-chart-node.tsx`
- 6 hooks: `use-companies`, `use-org-chart`, `use-fire-employee`, `use-promote-employee`, `use-set-manager`, `use-roles`
- `App.tsx` + `top-bar.tsx`: enable Org tab, mount components, add chat tab handling
- `hire-dialog.tsx`: add manager selection (Reports-to)
**Implementation approach:**
- **Do not cherry-pick the branch wholesale** — Phase 5 has drifted contracts (companies.ts, employees.ts, ipc.ts, App.tsx). Branch is a *reference*, not a source.
- Reapply onto today's main, surface by surface, with explicit verification per surface
**DoD:**
- Every new component has all 5 F10 states (loading/error/empty/disabled/hover)
- Every new component is keyboard-navigable + screen-reader-friendly (WCAG 2.1 AA)
- Every new hook is invalidated by appropriate bus events (per architectural invariant #11)
- Org tab renders the org-chart tree
- Workspace switcher creates / switches / archives a second company end-to-end (proven by manual smoke + E2E)
**Estimated:** 5–7 working days
**Buffer:** +3 days

### Phase 5.6 M-E — Process Safeguards (PARALLEL with M-D)

**This is the highest-leverage milestone. Without it, drift recurs.**

**Output:** Three safeguards in production:
1. **Milestone Definition of Done template** — `docs/process/milestone-dod-template.md`
2. **Pre-commit hook** — refuses CLAUDE.md edits unless the diff includes a corresponding test or audit-doc update
3. **CI conformance check** — `pnpm audit:claims` job that runs in CI, parses CLAUDE.md status blocks, looks up evidence per claim, fails the build on `❌ missing` or unverifiable rows

**Detailed safeguards:**

#### E.1 — Milestone DoD template
A locked checklist applied to every milestone, T0 onward:
- Plan doc exists at `docs/plans/<date>-<milestone>.md` (M28 T0 precedent)
- Acceptance criteria per task are concrete and testable
- E2E spec covers the user-facing claim (not just unit tests)
- CLAUDE.md status block reflects shipped state, not aspirational scope
- Three buckets: shipped / deferred / deprecated — explicit, not assumed-green
- Retrospective at milestone exit (per Phase 5 M35 T4 precedent)
- Audit doc updated if the milestone introduces new claimable surface

#### E.2 — Pre-commit hook
Git hook (Husky or similar) that:
- Detects CLAUDE.md modifications in the staged diff
- Refuses commit unless the diff also includes:
  - A new/modified test file pinning the new claim, OR
  - An update to the audit doc with the new claim's row
- Bypassable with `--no-verify` only, with a warning in the commit message footer

#### E.3 — CI conformance check
GitHub Actions job `claim-evidence-audit`:
- Parses CLAUDE.md status blocks for claims following a pinned format (regex)
- For each claim, looks up the expected evidence type
- Verifies the artifact exists (file present, IPC registered, test passes)
- Fails PR on any unverifiable claim
- Runtime budget: <30s

**DoD:**
- Three safeguards committed and active
- A deliberate test commit triggers each safeguard correctly (positive control)
- Documented in CONTRIBUTING.md
**Estimated:** 2–3 working days (parallel-safe with M-D)
**Buffer:** +1 day

### Phase 5.6 M-F — Documentation Truth-Up

> **2026-04-19 — SHIPPED.** M-F rewrote `CLAUDE.md` into shipped / deferred / deprecated buckets, removed the Cluster A "aspirational" drift framing, reconciled Phase 2 M7/M9 against the M-C/M-D restored surface, aligned the MCP IPC table with canonical on-disk names, emptied `scripts/check-claim-evidence.allowlist.json`, and updated baseline QA counters to the M-D exit gate.

**Output:** Every documentation surface reflects shipped reality
**Scope:**
- `CLAUDE.md` status blocks rewritten to match actual shipped state, three-bucket format (shipped / deferred / deprecated)
- `README.md` claim audit
- `docs/user-guide/*` reconciled with actual UI
- `docs/demo/*` walkthroughs verified against actual app
- `docs/plans/*` archived plan docs annotated with "shipped state" addendum if they diverge
- Phase 5 retrospective amended with the drift discovery + lessons learned
- New retrospective: `docs/plans/2026-04-XX-team-x-phase-5.6-retrospective.md` (six-section structure per Phase 5 M35 T4 lock)
**DoD:**
- No claim in CLAUDE.md's structured IPC / bus-event tables lacks on-disk evidence: `pnpm audit:claims -- --strict` → 95 verified / 0 allowlisted / 0 UNALLOWED
- Audit doc §20.6 cross-checked against updated CLAUDE.md (zero remaining M-F allowlist rows)
- README badges and QA baseline counters updated to 1683 unit tests and 13 Playwright specs / 18 cases
**Estimated:** 2 working days
**Buffer:** +1 day

### Phase 5.6 M-G — Branch Hygiene + Ship

**Output:** Stranded branch deleted; Phase 5.6 shipped to main; pack re-signed if needed
**Scope:**
- Verify M-C and M-D landed every "restore" row (cross-check audit doc)
- Verify CI conformance check is green on main
- Run `pnpm sign:pack` if any official role file changed during Phase 5.6 (likely no — Phase 5.6 is UI/IPC, not role content)
- Delete `worktree-phase-2-the-org` local + `origin/worktree-phase-2-the-org` remote (last step, only after evidence of full restoration)
- `git tag` Phase 5.6 ship marker
- Push main with all Phase 5.6 commits
**DoD:**
- All 7 sub-milestones complete per their DoD
- Branch deleted from local + origin
- Phase 5.6 retrospective committed
- CHANGELOG entry promoted from `[Unreleased]` to `[1.1.x]`
- Workspace `package.json` versions bumped if appropriate
- `pack.sig` regenerated if pack contents changed; pack version bumped if applicable
- Push to origin
**Estimated:** 1 working day
**Buffer:** +0.5 day

---

## 7. Process Safeguards — Detailed Specifications

(Separated from M-E above for the implementer's reference.)

### S1 — Milestone DoD Template

```markdown
# Milestone <ID> — Definition of Done

- [ ] Plan doc exists at `docs/plans/<date>-<milestone>.md`
- [ ] Every task has concrete, testable acceptance criteria
- [ ] Acceptance criteria reference pinned test files, not just descriptions
- [ ] E2E spec exists if the milestone introduces user-facing functionality
- [ ] E2E covers the user-facing claim end-to-end (not a unit test)
- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` passes; baseline test count delta recorded in CLAUDE.md
- [ ] `pnpm lint` produces 0 errors (warnings preserved at baseline)
- [ ] CLAUDE.md status block reflects SHIPPED state in three buckets:
      - **Shipped:** what is on disk and verified
      - **Deferred:** what was planned but not done, with target milestone
      - **Deprecated:** what was planned and will not be done, with reason
- [ ] Audit doc updated with new claimable rows
- [ ] Retrospective at milestone exit (six-section structure)
- [ ] Atomic commits: feat/fix + ledger pair per task
- [ ] No corners cut, no silent deferrals
```

### S2 — Pre-commit Hook (Husky)

```bash
#!/usr/bin/env bash
# .husky/pre-commit
set -e

if git diff --cached --name-only | grep -q "^CLAUDE.md$"; then
  STAGED_TESTS=$(git diff --cached --name-only | grep -E '\.test\.tsx?$|/audits/.*\.md$' || true)
  if [ -z "$STAGED_TESTS" ]; then
    echo "ERROR: CLAUDE.md modified without a corresponding test or audit update."
    echo "       Either add a test pinning the new claim, or update the audit doc."
    echo "       Override (with reason): git commit --no-verify"
    exit 1
  fi
fi
```

### S3 — CI Conformance Check (GitHub Actions)

```yaml
# .github/workflows/conformance.yml
name: claim-evidence-audit
on: [pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit:claims
```

The `audit:claims` script (new):
- Parses CLAUDE.md status blocks
- For each pinned claim format (e.g., `M<N> ('<feature>')` or IPC channel rows in the table), verifies on-disk evidence
- Exits non-zero if any unverifiable claim detected
- Runtime budget: <30s on a cold runner

### S4 — Branch Policy

```markdown
# CONTRIBUTING.md addition

## Long-Lived Branches

- `worktree-*` prefix is reserved for short-lived scratch branches
- Any branch with un-merged commits older than 14 days triggers a CI warning
- Merge plan or deletion required before the branch's 30-day mark
- A nightly job posts a summary of stale branches to a tracking issue
```

### S5 — Loki Ledger Evidence Field

Extend `pending.json` and `current-task.json` schema with a `verifiedBy` field per task:

```json
{
  "taskId": "M36-T1",
  "status": "shipped",
  "verifiedBy": [
    "packages/shared-types/src/capabilities.test.ts",
    "pnpm -F @team-x/shared-types test (24 tests green)"
  ]
}
```

Every shipped task must have non-empty `verifiedBy`. Source-string-audit pattern from M35 T9 generalizes here.

### S6 — Quarterly Conformance Re-Audit

Recurring calendar reminder (or CI cron job) every 3 months OR every 5 milestones, whichever first. Re-run the M-A audit. Identifies drift before it becomes systemic. Output is a delta diff against the previous audit, not a full new audit — fast.

---

## 8. Schedule + Risk Register + Communications

### Schedule (Gantt-style) — APPROVED SCHEDULE 2026-04-17 (M-E REORDERED BEFORE M-C/M-D)

> **APPROVED ORDER (supersedes ASCII below):** Week 1 M-A → Week 2 M-B + M-E (safeguards first) → Week 3 M-C → Week 4 M-D → Week 5 M-F + M-G. See §13.2 for the reorder rationale and the week-by-week breakdown. The ASCII Gantt below is the **original proposal schedule** preserved for honest-framing integrity — the approved schedule lives in §13.2.

```
Week 1                Week 2                Week 3                Week 4
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ M-A Audit (5d)  │   │                 │   │                 │   │                 │
│       ┌─────────┤   │ M-B Triage (1d) │   │                 │   │                 │
│       │ buffer  │   │       ┌─────────┤   │                 │   │                 │
│                 │   │       │ buffer  │   │                 │   │                 │
│                 │   │ M-C Backend (5d)│ → │ M-C buffer (3d) │   │                 │
│                 │   │                 │   │ M-D UI (5d)     │ → │ M-D buffer (3d) │
│                 │   │                 │   │ M-E Safeguards  ║═══║ (parallel M-D)  │
│                 │   │                 │   │                 │   │ M-F Docs (2d)   │
│                 │   │                 │   │                 │   │ M-G Ship (1d)   │
└─────────────────┘   └─────────────────┘   └─────────────────┘   └─────────────────┘
```

**Total elapsed time (with buffer):** 28–35 working days. With Rocky's day-job context, calendar-elapsed estimate: **6–8 weeks**.

### Risk Register

| ID | Risk | Probability | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | Audit reveals more gaps than M7/M9 (e.g., Phase 3 milestones partial) | High | Medium | Time-box audit to 5 days; if wider, accept scope expansion and add M-C2 / M-D2 sub-milestones | Rocky |
| R2 | Branch reapply hits unrenamed conflicts on first attempt | Medium | High | Treat branch as reference, not source. Per-surface re-implementation. Failing typecheck = stop and consult. | Rocky + Claude |
| R3 | Phase 6 work (M36 T2+) is blocked waiting for Phase 5.6 | Certain | Low | Park M36 T2+; Loki pending.json explicitly notes the pause. Phase 6 resumes after M-G ships. | Rocky |
| R4 | Reapplied UI doesn't compile against today's IPC contracts | High | Medium | Approach as fresh impl. Reference branch for shape, not for syntax. Allocate buffer time generously in M-D. | Rocky + Claude |
| R5 | Process safeguards add CI runtime + dev friction | Low | Low | Time-box `audit:claims` to <30s. Pre-commit hook is bypassable with `--no-verify`. Iterate on friction reports. | Rocky |
| R6 | Solo bandwidth / burnout — long remediation on top of day job | Medium | High | Explicit buffer per milestone. Pause-friendly between milestones. This is a marathon. No deadline pressure. | Rocky |
| R7 | New gaps discovered mid-implementation (M-C reveals more missing IPC) | Medium | Medium | Add to audit doc; decide restore/defer at the time; defer is OK if logged in audit | Rocky |
| R8 | Test count baseline confusion (Phase 5 claimed 1169 tests; audit may find different number) | Low | Low | Audit verifies; CLAUDE.md updates to actual count; safeguard prevents future drift | Rocky |
| R9 | Pack signature breaks during Phase 5.6 if an official role file is touched | Low | Low | Phase 5.6 doesn't touch role content; if it does, run `pnpm sign:pack` per dev workflow | Rocky |
| R10 | Stranded branch deleted prematurely → reference lost | Low | High | M-G deletion gated on M-C, M-D, M-E completion + audit cross-check showing zero `restore` rows remain | Rocky |

### Communications

**Internal (you / future-you / contributors):**
- Push commit `8d5a0db` immediately so role-pack hotfix is on record before Phase 5.6 starts
- Add a "Phase 5.6 In Progress" banner to the top of CLAUDE.md after M-A starts
- `.loki/queue/pending.json` note: "Phase 6 M36 T2+ paused pending Phase 5.6 completion"
- Each Phase 5.6 sub-milestone gets a ledger commit + state refresh per established cadence
- Each milestone exit posts a one-paragraph status to a `docs/status/` log

**External (open-source contributors, public repo):**
- README untouched until M-F (no public claims drift, since README isn't yet aspirational)
- A public retrospective ships with M-G as `docs/plans/2026-04-XX-team-x-phase-5.6-retrospective.md`
- Honest framing: "We discovered systemic CLAUDE.md/reality drift, audited everything, fixed the gaps, shipped the safeguards. Here's what we learned." This is a credibility-building event when handled openly, not a credibility-eroding one.

---

## 9. Engineering Principles (Meta — Govern Execution)

These principles override convenience throughout Phase 5.6:

1. **Evidence over claims.** Don't trust documentation; verify with the artifact. Every audit row has a file:line reference or `missing`. No vibes.
2. **One source of truth.** CLAUDE.md status blocks must be the truth, not the plan. Plan docs are aspirational; status blocks are factual.
3. **Tests assert user-facing behavior.** Unit tests are necessary but insufficient. The bar is an E2E that exercises the actual UI / IPC / behavior end-to-end.
4. **Atomic commits.** Each task = one feature commit + one ledger commit. Reversible independently. Per Phase 5 M28+ established cadence.
5. **Plan before code.** Every milestone gets a T0 plan doc per Phase 5 M28 T0 precedent. No exceptions.
6. **Definition of Done is a checklist, not a vibe.** Concrete, verifiable criteria per milestone (S1 above).
7. **Defer nothing silently.** Every deferred item lives in an explicit register with a target milestone. "I'll get to it later" is forbidden.
8. **Process improvement is part of the work.** Each retrospective produces at least one safeguard. M-E is the codification of this principle for Phase 5.6.
9. **Trust but verify branches.** A branch with un-merged commits is a debt, not a feature. Merge or delete; never let it linger silently.
10. **Honest framing wins.** "Shipped 30% of the planned scope, here's why" is better than "Shipped" with hidden gaps.

---

## 10. Deliverables Checklist (the artifacts Rocky should expect)

- [ ] `docs/audits/2026-04-XX-conformance-audit.md` (M-A output, ~200–400 rows)
- [ ] Updated audit doc with `disposition` column (M-B output)
- [ ] Backend code: migrations, repos, IPC channels (M-C output)
- [ ] UI code: components, hooks, App.tsx + top-bar updates (M-D output)
- [ ] `docs/process/milestone-dod-template.md` (M-E.1)
- [ ] `.husky/pre-commit` hook (M-E.2)
- [ ] `.github/workflows/conformance.yml` + `pnpm audit:claims` script (M-E.3)
- [ ] `CONTRIBUTING.md` branch policy section (M-E.4)
- [ ] Loki schema extension with `verifiedBy` field (M-E.5)
- [ ] Calendar reminder / CI cron for quarterly re-audit (M-E.6)
- [ ] Updated CLAUDE.md status blocks — three-bucket format (M-F output)
- [ ] Updated README, user-guide, demo walkthroughs (M-F output)
- [ ] Phase 5.6 retrospective doc (M-G output)
- [ ] CHANGELOG entry promoted (M-G output)
- [ ] Branch deletion (M-G last step)
- [ ] Push to origin (M-G last step)

---

## 11. Decision Points Needing Sign-Off

> **APPROVED 2026-04-17.** Rocky signed off on all eight decisions as "all yes" in the Phase 5.6 kickoff session. The recommendations below stand as-shipped. See §13 for the full approval record, the M-E reorder adopted from the post-proposal review, and the PMP/Agile additions layered on top.

Rocky must explicitly approve these before execution begins. Each is reversible if challenged later, but all need a yes/no now to lock the plan.

### D1 — Push commit `8d5a0db` immediately?
**Recommendation: Yes.** Hotfix is clean, tested, atomic. Holding it through Phase 5.6 (6–8 weeks) means local divergence and risk of machine failure. Push first, then start M-A.

### D2 — Phase 5.6 numbering convention?
**Recommendation: Phase 5.6.** Preserves Phase 5 = v1.1.0 boundary. M36 (Phase 6 T0) shipped at v1.1.0 and represents a new phase. Phase 5.6 backfills Phase 5 (and earlier) gaps. Version bump on M-G ship: 1.1.0 → 1.1.1 (patch — no new features, just restoration of claimed features) OR 1.1.0 → 1.2.0 (minor — restores significant UI surface). I lean **1.1.1 patch** since the functionality was promised, not new.

### D3 — Audit scope — phases 1–5 or just phase 2?
**Recommendation: All of phases 1–5.** Cheap to audit; expensive to discover later. The 5-day budget assumes full scope.

### D4 — Triage authority?
**Recommendation: Rocky decides every disposition; Claude recommends.** Triage is product-vision territory.

### D5 — Process safeguards — full set or subset?
**Recommendation: Full set.** Each safeguard pays for itself within one milestone. CI conformance check is the highest-leverage; pre-commit hook is the second-highest. Don't subset.

### D6 — Branch deletion timing?
**Recommendation: After M-G ships, not before.** Branch is the only reference for harmonized M7/M9 source. Reference is cheap to keep, expensive to lose.

### D7 — Public framing?
**Recommendation: Honest retrospective at M-G ship.** Open-source credibility is built on transparency about failures, not on appearing perfect.

### D8 — Pause Phase 6 / M36 T2+ explicitly?
**Recommendation: Yes, explicit pause notation in `.loki/queue/pending.json`.** No ambiguity for future-you.

---

## 12. Closing — The Honest Framing

This drift was not a personal failure. It was a process gap. Solo dev + ambitious phase plan + implicit DoD + no automated truth-vs-claim verification = drift accumulates silently.

The drift was caught by Rocky's own audit before it shipped to a public release. That is the system working as intended — diligent founder catches what the process missed. Phase 5.5 hotfix proved the team can correct symptoms cleanly. Phase 5.6 corrects the underlying process so the same drift cannot recur.

Six to eight weeks of remediation feels long against the backdrop of fast-moving Phase 5 ship cadence. But this is the right investment. A product called *"Run an AI company. Not a prompt."* whose own process has silent integrity gaps cannot credibly claim to manage other companies' integrity. **Phase 5.6 is the credibility floor of Team-X 1.x.**

Execute when ready. The proposal is yours to modify, scope, or override at any decision point.

---

## 13. Approval Record + Changes from Proposal

**Sign-off date:** 2026-04-17
**Signatory:** Rocky Elsalaymeh
**Session:** Phase 5.6 kickoff (paired session with Claude)
**Context:** This section records the decisions + changes Rocky approved. §1–§12 above are preserved verbatim as authored on 2026-04-17 for honest-framing integrity; §13 + §14 capture what changed at approval.

### 13.1 — D1–D8 Sign-Off Record

All eight decisions signed off as "all yes" by Rocky during the kickoff session. Each recommendation in §11 stands as-executed:

| # | Decision | Approved | Action |
|---|---|---|---|
| D1 | Push `8d5a0db` (Phase 5.5 hotfix) immediately | ✅ Yes | Executed same session: `git push origin main` → origin/main advanced to `8d5a0db` (kickoff session, 2026-04-17). Also pushed M36 T0/T1 + paired ledgers that were behind it. |
| D2 | Phase 5.6 numbering + 1.1.1 patch version on ship | ✅ Yes | Locked. M-G bumps workspace `1.1.0` → `1.1.1` across all 7 `package.json` files. Restoration, not new features. |
| D3 | Audit scope: all phases 1–5, not just Phase 2 | ✅ Yes | Locked. M-A methodology per §4 covers every CLAUDE.md status-block claim across Phases 1–5. |
| D4 | Triage authority: Rocky decides, Claude recommends | ✅ Yes | Locked. Per-row `disposition` decisions in M-B require explicit Rocky approval. Claude presents the recommendation with one-sentence justification. |
| D5 | Full safeguard set (S1–S6, not subset) | ✅ Yes | Locked. M-E ships all six: DoD template (S1), pre-commit hook (S2), CI conformance check (S3), branch policy (S4), Loki `verifiedBy` field (S5), quarterly re-audit cadence (S6). |
| D6 | Branch deletion timing: M-G only, not sooner | ✅ Yes | Locked. `worktree-phase-2-the-org` preserved through M-G; deletion gated on audit doc showing zero `restore` rows remaining. |
| D7 | Honest public retrospective at M-G ship | ✅ Yes | Locked. M-G deliverable: `docs/plans/2026-04-XX-team-x-phase-5.6-retrospective.md` following the locked six-section structure established at Phase 5 M35 T4. |
| D8 | Explicit M36 T2+ pause in `.loki/queue/pending.json` | ✅ Yes | Executed same session: `pending.json` updated with Phase 5.6 redirect + M36 T2+ pause notation. Future-you will not silently resume M36 T2. |

### 13.2 — M-E REORDER (Architectural Change from Proposal)

**Original proposal (§8):** M-E ran parallel with M-D in Week 3.

**Approved reorder:** M-E ships BEFORE M-C and M-D.

**Approved week-by-week schedule:**

| Week | Sub-milestone | Est. | Buffer |
|---|---|---|---|
| 1 | M-A — Conformance Audit | 5d | +2d |
| 2 | M-B — Triage | 1d | +0.5d |
| 2 | M-E — Process Safeguards (safeguards ship BEFORE backfill) | 2–3d | +1d |
| 3 | M-C — Backend Backfill (under new DoD + CI gate) | 5d | +3d |
| 4 | M-D — UI Backfill (under new DoD + CI gate) | 5d | +3d |
| 5 | M-F — Documentation Truth-Up | 2d | +1d |
| 5 | M-G — Branch Hygiene + Ship | 1d | +0.5d |

**Total elapsed (with buffer):** 28–35 working days. Calendar-elapsed: **6–8 weeks** at Rocky's pace.

**Reorder rationale:** If M-E shipped after or parallel-to M-C/M-D, the restoration commits would be ungoverned — we'd be backfilling the exact claims that drifted, under the old process that allowed the drift in the first place. By shipping safeguards first:

1. The CI conformance check (`pnpm audit:claims`) is live before any restore commit
2. The pre-commit hook refuses CLAUDE.md edits without paired test/audit evidence from the first backfill commit onward
3. The milestone DoD template governs M-C and M-D from task #1
4. Loki's new `verifiedBy` field captures proof-of-ship for every restored IPC channel / hook / component
5. The M-C and M-D sprints become the **first proof** that the safeguards work — if any restore attempt fails a safeguard, that is valuable signal about the safeguard, not just the restore

**M-E is therefore the load-bearing milestone of Phase 5.6.** M-C and M-D are the proof; M-E is the load bearing.

### 13.3 — PMP / Agile / Scrum Additions (New Content)

The original proposal was sub-milestone-organized but informal on sprint mechanics. The approved plan adds four formal sprint-engineering primitives. Full specification in §14.

1. **Product backlog** — M-B triage output becomes an ordered, explicit backlog (restore=must-have / replace=should-have / deprecate=won't-have)
2. **Sprint velocity as Loki exit-KPI** — tests delta + commit cadence adherence tracked per sub-milestone exit
3. **Change control mini-gate** — mid-flight gap discoveries (R7 on the risk register) go through a triage mini-gate before scope expands, not silent growth
4. **Definition of Ready** — sprint entry gate complement to DoD; a sub-milestone doesn't start until audit rows are categorized, `filesTouched` estimated, `testsDeltaEstimate` recorded

### 13.4 — Execution Artifacts Produced in the Kickoff Session

The kickoff session (2026-04-17) produced the following artifacts alongside this approval record:

- `git push origin main` → 4 previously-unpushed commits on origin (D1 executed)
- Rename: `2026-04-17-team-x-phase-5.6-remediation-proposal.md` → `2026-04-17-team-x-phase-5.6-remediation.md` (this file)
- Phase 5.6 In Progress banner added to top of `Team-X/CLAUDE.md` (§8 Communications item)
- `.loki/queue/pending.json` updated: head-of-queue → Phase 5.6 M-A; M36 T2+ pause notation added (D8 executed)
- `.loki/queue/current-task.json` updated: M-A T0 kickoff task authored (audit methodology + acceptance + 5d+2d timing)
- `.loki/state/orchestrator.json` updated: `currentPhase` → Phase 5.6 REMEDIATION
- Atomic `docs(phase-5.6):` kickoff commit + paired `chore(loki):` ledger commit (cadence preserved from Phase 5)

Head-of-queue after kickoff: **Phase 5.6 M-A — Conformance Audit.**

---

## 14. Sprint Execution Framework (PMP / Agile / Scrum)

Formalizes the sprint engineering primitives added in §13.3. Each primitive has a rule, a rationale, and an artifact. Together these five primitives make Phase 5.6 a fully-instrumented sprint sequence — trackable, accountable, and resistant to the exact drift that made Phase 5.6 necessary.

### 14.1 — Product Backlog (from M-B Triage)

**Rule:** The M-B triage output (audit doc with `disposition` column filled in) is the Phase 5.6 backlog. It is explicit, ordered, and immutable except via the change-control mini-gate (§14.3).

**Priority tiers (MoSCoW):**

- **Must-have:** every row with `disposition: restore`
- **Should-have:** every row with `disposition: replace`
- **Won't-have (this phase):** every row with `disposition: deprecate` — documentation-only action, no code work

**Sequencing within Must-have:** backend rows (M-C scope) before UI rows (M-D scope) when a UI row depends on a backend row — dependency arrows captured in the audit doc.

**Artifact:** `docs/audits/2026-04-XX-conformance-audit.md` with `disposition` column (same doc as M-A/M-B output).

### 14.2 — Sprint Velocity as Loki Exit-KPI

**Rule:** Every sub-milestone (A–G) closes with a `verifiedBy` block in its Loki ledger entry capturing:

- **Test delta** — `unitTests <before> → <after>` (net-new tests pinning restored claims)
- **E2E delta** — `e2eSpecs <before> → <after>` (per-restore E2E coverage, per invariant #11 "tests assert user-facing behavior")
- **Commit cadence adherence** — `atomic: <count>, ledger: <count>, ratio: <atomic:ledger>` (target 1:1)
- **Duration** — `estimate: <d>d, actual: <d>d, variance: <+/-d>d` (calibrates future estimates)

**Rationale:** Velocity is not speed — it is evidence-backed throughput. M-E's `verifiedBy` Loki field (§7 S5) is the enforcement vehicle.

**Artifact:** `.loki/queue/pending.json` `tasks[i].verification` block per sub-milestone, plus rollup at Phase 5.6 M-G ship.

### 14.3 — Change Control Mini-Gate (for mid-flight scope changes)

**Rule:** When M-C or M-D implementation surfaces a gap not in the M-B triage output (R7 on the risk register), work STOPS on the current task and the new gap goes through a mini-gate:

1. **Document the gap** — add a new row to the audit doc with `evidence_found`, `status`, `severity`
2. **Triage the gap** — apply §5 decision criteria to assign `disposition` (restore / deprecate / replace)
3. **Rocky approval** — new restore rows require Rocky's explicit approval before the task resumes with expanded scope
4. **Record the decision** — the mini-gate entry becomes a row in the audit doc with a timestamp + approval reference

**Rationale:** Prevents silent scope creep. "I found another gap, I'll just fix it while I'm here" is the exact failure mode that produced the M7/M9/M11 drift. Every expansion is visible.

**Artifact:** Audit doc gains a "Mid-flight additions" section. Each row timestamped + approval-referenced.

### 14.4 — Definition of Ready (DoR) — complement to DoD

**Rule:** A sub-milestone sprint (M-A through M-G) does NOT start until its DoR checklist is green:

- [ ] Sub-milestone's audit rows categorized (M-B complete for M-C / M-D specifically)
- [ ] `filesTouched` estimated per task (matches Loki `current-task.json` shape)
- [ ] `testsDeltaEstimate` recorded per task (calibration vs actual at milestone exit)
- [ ] DoR acceptance criteria enumerated per task with concrete, testable language (no "improve X")
- [ ] Verification gate recipe enumerated (which tests, in which order, with which rebuilds)
- [ ] Predecessor sub-milestone's Loki exit-KPI block closed (evidence chain unbroken)
- [ ] Plan doc updated if scope shifted since approval (the plan is living — the audit is immutable within a sprint)

**Rationale:** DoD prevents shipping garbage; DoR prevents starting on sand. Loki's `current-task.json` already encodes most of these fields — DoR formalizes them as a gate, not a convention.

**Artifact:** `.loki/queue/current-task.json` DoR checklist block added per sub-milestone kickoff task.

### 14.5 — Sprint Cadence Summary

| Primitive | Artifact | When |
|---|---|---|
| DoR (sprint entry gate) | `current-task.json` DoR block | Before each sub-milestone T0 task starts |
| DoD (sprint exit gate) | M-E.1 milestone DoD template | Each sub-milestone exit |
| Backlog (scope source) | Audit doc `disposition` column | M-B output; read-only input to M-C/M-D |
| Velocity (exit-KPI) | `verifiedBy` Loki block | Each sub-milestone exit |
| Change control (mid-flight) | Audit doc "Mid-flight additions" section | Any time a new gap surfaces in M-C/M-D |
| Retrospective (phase exit) | `docs/plans/2026-04-XX-team-x-phase-5.6-retrospective.md` | M-G ship |

---

**End of approved plan — 2026-04-17.**

*Original proposal text preserved verbatim in §1–§12. Approval record in §13. Sprint execution framework in §14. Future edits to this plan fall under the change-control mini-gate in §14.3.*
