# Phase 5 — M35 Demo + Hardening Implementation Plan

**Date:** 2026-04-19
**Milestone:** M35 — Demo + Hardening (Phase 5 exit gate)
**Depends on:** M28, M29, M30, M31, M32, M33, M34 (the full Phase 5 surface)
**Estimated tests:** ~15 unit + 1 cross-milestone E2E spec
**Scope:** Integration hardening + performance defaults + Phase 5 retrospective + v1.1.0 release marker. Zero new IPC channels. Zero new bus events. Zero new providers. Zero new migrations.

---

## 1. Goal

Close Phase 5 (Intelligence Layer) with launch-grade polish. Six Phase 5 milestones shipped (M28 RAG foundation → M29 RAG-in-turns → M30 NLU + palette → M31 agentic read-loop → M32 write-side planner → M33 copilot service → M34 copilot UI) but nothing yet validates the **whole stack end-to-end in one scenario**, and the defaults that were chosen during milestone isolation (embedding batch size, analyzer cadence, agentic/planner budgets) have never been measured against realistic load. M35 delivers the cross-milestone smoke, tightens the defaults with evidence, consolidates the documentation surface, and ships v1.1.0 — the first public release that includes the Intelligence Layer.

**In one sentence:** *prove Phase 5 hangs together, measure what's slow, document what shipped, and tag v1.1.0.*

---

## 2. Non-goals

- **No new IPC channels.** The M28–M34 surface is complete. If an E2E or demo scenario needs a channel that does not exist, it is a scope violation — file a Phase 6 ticket instead.
- **No new bus event types.** All Phase 5 events are already enumerated in `packages/shared-types/src/events.ts`. Observability polish (T5) audits that every existing event reaches the Audit view; it does not add new ones.
- **No new LLM / provider work.** Provider router, agentic loop, copilot analyzer, and planner all stabilized in their own milestones. Tuning lives in settings clamps, not new wire code.
- **No new migrations.** Schemas locked at migration 0012 (M33 runs.kind). Any schema drift signals a hidden cross-milestone bug → file it, do not silently migrate.
- **No new user-facing features.** M35 is a *hardening* milestone. New feature candidates (insight export, multi-company aggregation, drag-to-reorder) surface into a Phase 6 backlog, not into M35.
- **No deployment automation changes.** The M25 electron-builder + GitHub Actions release workflow is already in place. M35 bumps the version, lands the tag, and invokes the existing pipeline — it does not edit the pipeline.

---

## 3. Task breakdown

| # | Task | Files touched | Tests |
|---|------|---------------|-------|
| T0 | M35 implementation plan doc | this file | — |
| T1 | Performance defaults pass + clamp audit | `apps/desktop/src/main/services/copilot-analyzer-service.ts`, `packages/intelligence/src/rag/indexer.ts`, `apps/desktop/src/main/db/seed.ts`, settings seed defaults | 4 |
| T2 | Cross-milestone E2E — RAG → NLU → agentic → planner → copilot | `apps/desktop/e2e/phase-5-integration.spec.ts` (NEW) | 1 E2E |
| T3 | Observability polish — Audit view coverage audit + missing chips | `apps/desktop/src/renderer/src/features/audit/audit-view.tsx`, `audit-event-chip.tsx` | 3 |
| T4 | Phase 5 retrospective doc | `docs/plans/2026-04-19-team-x-phase-5-retrospective.md` (NEW) | — |
| T5 | Demo script + scripted walkthrough | `docs/demo/phase-5-walkthrough.md` (NEW), `docs/demo/scenarios/` (NEW dir with 5 scenario stubs) | — |
| T6 | README + user-guide reconciliation sweep | `README.md`, `docs/user-guide/README.md` (NEW index), all `docs/user-guide/*.md` cross-linked | — |
| T7 | CHANGELOG promotion `[Unreleased]` → `[1.1.0]` | `CHANGELOG.md` | — |
| T8 | Version bump 1.0.0 → 1.1.0 across all 6 packages + Phase 5 badge freeze | 6 `package.json` files, `apps/desktop/src/renderer/src/components/app/top-bar.tsx` | 2 |
| T9 | Regression hardening — flaky-test audit + stable selector sweep | seeks no new files; annotates existing E2E specs with reliability notes, tightens any locator still using text-match where a data-attribute exists | 2 |
| T10 | Docs + verification + Phase 5 COMPLETE milestone marker | `CLAUDE.md` (Phase 5 status → COMPLETE), design doc §9 (M35 row ✅), CONTINUITY.md Phase 5 wrap-up, `docs/user-guide/demo-walkthrough.md` NEW | 3 |

**Total:** ~15 unit tests + 1 cross-milestone E2E spec. Matches the ~15-test estimate in Phase 5 design §9.

**Cadence:** Atomic commit per task (`feat(m35):` / `test(m35):` / `chore(m35):` / `docs(m35):`) + ledger commit (`chore(loki): M35 T<N> — commit ledger (<sha>)`) for orchestrator state updates. This is the same cadence proven across M30/M31/M32/M33/M34 — do not deviate.

---

## 4. Architectural decisions

### 4.1 What "cross-milestone E2E" means

`phase-5-integration.spec.ts` is **one** spec that exercises the full Phase 5 stack in a single Playwright session. The canned test-mode provider (`test-agentic-provider.ts`), canned classifier (`test-classifier.ts`), canned agentic tools (`test-agentic-tools.ts`), and canned copilot provider (`test-copilot-provider.ts`) all participate — the point is integration *between* the stubs, not a re-test of their individual contracts (those are covered by each milestone's own E2E). The scenario:

1. Upload a document to the vault (exercises M28 chunker + embedder on-write).
2. Press `Cmd+K` → natural-language query that NLU classifies as `complex_request` (M30).
3. Agentic loop kicks off with the system-agent (M31) → uses RAG retrieval (M29) during planning → issues a `query_tickets` tool call → drafts an answer.
4. Second `Cmd+K` prompt: `"decompose X into tickets"` → write-side gate fires (M32 T5 amber card) → Confirm → `decompose_project` + `delegate_subtask` land tickets.
5. `copilot.configure` manual tick (M33) → insight about the new tickets surfaces.
6. `Cmd+Shift+K` → sidebar opens → insight card visible → dismiss → sidebar re-queries empty → ask input sends free-form question → chat drawer opens on system-copilot thread with terminal answer step (M34).

Runtime budget: **≤15s**. If it exceeds 15s, the canned seams are doing real work somewhere they shouldn't — diagnose, don't widen the budget.

### 4.2 Performance defaults — evidence-based, not vibe-based

Settings seeded today:

| Key | Current default | Clamp range | Reason to revisit |
|-----|-----------------|-------------|-------------------|
| `rag_chunk_size` | 512 tokens | 128–2048 | Embedding cost per doc |
| `rag_chunk_overlap` | 64 tokens | 0–512 | Retrieval recall |
| `rag_similarity_threshold` | 0.7 | 0.5–0.95 | Retrieval precision |
| `agentic_max_steps` | 8 | 1–32 | Local model step budget |
| `agentic_max_tokens` | 8000 | 1000–64000 | Local model token budget |
| `agentic_timeout_ms` | 120000 | 10000–600000 | Wall-clock bound |
| `planner_max_tickets` | 10 | 1–50 | Decomposition cap |
| `planner_max_depth` | 2 | 1–4 | Recursion bound |
| `planner_escalation_threshold` | 3 | 1–10 | Retry tolerance |
| `copilot_interval_minutes` | 5 | 1–60 | Analyzer cadence |

T1 runs a **measurement pass** (not an optimization pass): seed the Strategia-X demo company with realistic content (50 tickets, 10 projects, 2 goals, 5 vault files), run one full analyzer tick against local Ollama + `llama3.1:8b`, record wall-clock for each. Defaults move only if a measurement justifies it; unit tests verify the (possibly updated) clamps. **No silent tuning** — every change lands with a one-line comment in `seed.ts` citing the measurement.

### 4.3 Observability — every event must reach Audit view

Phase 5 added **15 new event types** across M28–M34 (`rag.index.*`, `command.executed`, `agent.step`, `agentic.completed`, `agentic.failed`, `plan.proposed`, `plan.approved`, `task.delegated`, `task.escalated`, `review.requested`, `review.completed`, `copilot.analyzed`, `copilot.insight`, `copilot.dismissed`, `copilot.expired`). AuditView chips ship for **6** of these (M32 T6 added the planner chips). T3 audits the remaining **9** and adds chips + payload-aware row summaries for any that surface in production traffic. Three unit tests cover the chip rendering for the new events (same pattern as M32 T6's chip tests).

### 4.4 Phase 5 badge — keep it at "Phase 5" through release

M34 bumped the top-bar badge `Phase 4` → `Phase 5`. M35 does **not** bump it to "Phase 6" or "Post-Phase 5" — Phase 5 is the shipping surface at v1.1.0. The badge next changes when Phase 6 work begins. T8 includes a one-line unit test that pins the badge string so an accidental bump is caught at CI time.

### 4.5 Retrospective doc — locked structure

`docs/plans/2026-04-19-team-x-phase-5-retrospective.md` follows a locked six-section structure so future phase retros are comparable:

1. **What we shipped** (bullet list of M28–M34 deliverables, one line each)
2. **What went well** (architectural patterns that carried across milestones — canned test seam quartet, `{rows, truncated}` envelope, `data-step-kind` stable selector, pause-aware providerRouter wrapper, AbortController stop, is_system + filter-sweep, atomic + ledger commit cadence, ABI rebuild dance)
3. **What cost us time** (the Vitest/Playwright ABI dance, the M28 `better-sqlite3` → `sqlite-vec` extension load path, the M30 FTS5 regression in vault-backup.spec.ts, the M31 T1 malformed tool-call parser nudge-retry, the M32 T0/T1 F1/F2 follow-ups, the M33 F3/F4 deferrals)
4. **What we deferred** (insight export, multi-company aggregation, drag-to-reorder, `capabilities` frontmatter, post-launch feedback loop)
5. **Metrics** (test count growth, E2E count growth, LOC delta, architectural invariant count, follow-up count)
6. **Phase 6 seeds** (hypotheses — not commitments — for cross-company rollups, proactive copilot, agent-to-agent negotiation, real customer demo)

### 4.6 v1.1.0 semver rationale

Phase 4 shipped v1.0.0 with no Intelligence Layer. Phase 5 adds RAG + NLU + agentic loop + write-side planner + copilot — all **additive**, no breaking API changes to the IPC surface. The IPC channels added in M28–M34 are new namespaces (`command.*`, `copilot.*`) and the `settings.*` namespace gained keys but did not rename or remove any. Renderer additions (`CommandPalette`, `CopilotSidebar`, `CopilotDashboardWidget`) are new mounts alongside the existing shell. **Minor bump is correct.** If any breaking change surfaces during T1 measurement (unlikely — but e.g., if a setting key has to be renamed), that moves the ship to v2.0.0 and the release notes call it out; this plan optimistically targets v1.1.0.

---

## 5. Accessibility

M35 adds no new UI primitives. The accessibility audit from M34 (Radix `Sheet` focus trap, `role="list"` / `role="listitem"` feed, severity-never-alone-conveys-meaning, 44px touch targets) carries forward unchanged. T3's audit chip additions must match the existing chip a11y contract: semantic color paired with text label, chip focus ring visible, `aria-label` with the event type name.

---

## 6. Test strategy

### 6.1 Unit (Vitest)

- **T1 (4 tests):** settings seed defaults match the measurement-justified values; clamp ranges unchanged; the M33 `copilot_interval_minutes` restart-on-change behavior still fires; any revised default for `rag_chunk_size` / `agentic_max_steps` passes both the lower and upper clamp.
- **T3 (3 tests):** audit chip renders for each of three representative new event types (`rag.index.indexed`, `agent.step`, `copilot.analyzed`); payload summary truncates at 200 chars; color token matches the event family.
- **T8 (2 tests):** `package.json` version asserts `1.1.0` on desktop app + root; top-bar badge renders the literal string `Phase 5` and not `Phase 6`.
- **T9 (2 tests):** every `*.spec.ts` in `e2e/` asserts at least one `data-*` attribute locator in its primary assertion (regex scan unit test); no E2E spec uses `page.waitForTimeout(>100)` as a synchronization primitive (regression guard — polling with `expect().toPass()` or `waitFor` is the pattern).

### 6.2 E2E (Playwright against canned test-mode provider + canned classifier + canned agentic provider + canned agentic tools + canned copilot provider)

`e2e/phase-5-integration.spec.ts` (T2) is the single new spec. Scenario detailed in §4.1. Runtime budget ≤15s. Uses the four-member canned-seam quartet already in place.

Full E2E sweep at T10 verification: **10 specs → 11 specs**, Playwright cases **11 → 12**. All green.

---

## 7. Verification sequence (M34 T11 discipline)

1. **Node ABI rebuild** for vitest:
   ```
   cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npm run install
   ```
2. **`pnpm test`** — target **1130 → ~1145** unit tests. All green.
3. **`pnpm typecheck`** at repo root. Clean across all 6 packages.
4. **`pnpm lint`** — 0 errors (the M30 T2 pre-existing error is resolved as part of T9 if it is still dormant; otherwise baseline preserved), ≤24 warnings.
5. **Electron ABI rebuild** for Playwright:
   ```
   pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar
   ```
6. **`pnpm -F @team-x/desktop test:e2e`** — **11 specs / 12 cases** green. Runtime <35s total.
7. **`pnpm -F @team-x/desktop build`** — production bundle succeeds (confirms `inlineDynamicImports` fix from M13 still holds).
8. **`pnpm dist:win`** (Rocky's primary OS target) — packaged NSIS installer produced under `release/1.1.0/`. Smoke-launch the installed app, verify:
   - Top-bar badge reads `Phase 5`.
   - Command palette opens on `Cmd+K`.
   - Copilot sidebar opens on `Cmd+Shift+K`.
   - First-boot seeds Strategia-X with CEO + SWE + system-agent + system-copilot.
   - No console errors on boot.
9. Only after **every step above passes**: commit the T10 milestone marker, push, and tag `v1.1.0`.

---

## 8. Out-of-scope follow-ups

These land in Phase 6 or later — they are explicitly **not** part of M35:

- **Insight export (markdown / PDF / JSON)** — nice-to-have for post-launch sharing; needs an export contract design.
- **Multi-company copilot aggregation** — cross-company dashboard roll-up surfaces in Phase 6's cross-company UI milestone.
- **Customizable insight categories per company** — settings-level feature; the current `copilot_categories` array is a global filter.
- **Drag-to-reorder insights** — user-customizable priority; out of scope because the current sort (`severity > createdAt`) is deterministic and predictable.
- **`capabilities` frontmatter for role.md** — would replace the title-keyword heuristic in `computeRoleFit`; locked by the M32 decomposition work but deferred because it touches role-pack schema versioning.
- **Proactive copilot → autonomous action** — today the copilot only surfaces insights and answers questions; Phase 6 could let it file tickets, open PRs, or draft policy changes with confirmation gates.
- **Post-launch feedback loop** — user-submitted insight feedback (👍/👎) that feeds back into analyzer prompt tuning. Needs design discussion on the privacy-first posture (invariant #7).

---

## 9. Handoff notes for next session

- **Head-of-queue after T10:** Phase 6 — scope TBD. Phase 5 exits as the Intelligence Layer; Phase 6 candidates include cross-company UI, proactive copilot, or agent-to-agent negotiation. No design doc exists yet — the first Phase 6 session authors `docs/plans/2026-0X-XX-team-x-phase-6-<theme>.md`.
- **Carry-forward architectural seams** (unchanged from M34 handoff): three-tier canned test seam quartet, `{rows, truncated}` envelope, `data-*` stable E2E selector surface, pause-aware `providerRouter.complete` wrapper, `AbortController` stop, `is_system` + filter-sweep with `isSystemRoleId` predicate, atomic + ledger commit cadence, ABI rebuild dance, IPC-mutation-emits-bus-event (invariant #11).
- **Post-release watch items:**
  - First real Ollama user-report of an agentic loop timing out on `llama3.1:8b` → revisit `agentic_max_steps` default.
  - First real user-report of copilot analyzer being too chatty → revisit `copilot_interval_minutes` default.
  - First real user-report of RAG retrieval missing obvious hits → revisit `rag_similarity_threshold`.
  All three land in a Phase 6 T0 *"post-release telemetry digest"* that reads the (private, local) runs table for aggregate timing + token usage and proposes evidence-based clamp changes.

---

*Design authority: `docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md` §9 (M35 row) + §8 (demo scripts) + §16 (deferred follow-ups).*
*Previous milestone: `docs/plans/2026-04-18-team-x-phase-5-m34-copilot-ui.md` (M34 Copilot UI, 16 tests / 1 E2E, completed 2026-04-18).*
