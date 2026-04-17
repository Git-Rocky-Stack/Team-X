# Phase 5 — Intelligence Layer Retrospective

**Date:** 2026-04-19
**Phase:** Phase 5 — Intelligence Layer
**Milestones covered:** M28 (RAG foundation) → M29 (RAG into agent turns) → M30 (NLU + command palette) → M31 (agentic loop — read-side) → M32 (task planner — write-side) → M33 (copilot service) → M34 (copilot UI) → M35 (demo + hardening — in progress)
**Branch-point:** Phase 4 `v1.0.0` (commit preceding M28 scaffold).
**Baseline (Phase 4 exit):** 612 unit tests / 4 E2E spec files / 10 architectural invariants.
**Current (M35 T3 shipped):** 1162 unit tests / 11 E2E spec files / 12 Playwright cases / 11 architectural invariants / v1.0.0 (v1.1.0 bump pending M35 T8).
**Authored during:** M35 T4 — Phase 5 exit-gate documentation.
**Design authority:** [`docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md`](2026-04-13-team-x-phase-5-intelligence-layer.md) (the Phase 5 design doc, §9 milestone breakdown + §13 decisions log).
**Sibling plan docs:** [`2026-04-14-team-x-phase-5-m31-agentic-loop.md`](2026-04-14-team-x-phase-5-m31-agentic-loop.md), [`2026-04-15-team-x-phase-5-m32-task-planner.md`](2026-04-15-team-x-phase-5-m32-task-planner.md), [`2026-04-16-team-x-phase-5-m33-copilot-service.md`](2026-04-16-team-x-phase-5-m33-copilot-service.md), [`2026-04-18-team-x-phase-5-m34-copilot-ui.md`](2026-04-18-team-x-phase-5-m34-copilot-ui.md), [`2026-04-19-team-x-phase-5-m35-demo-hardening.md`](2026-04-19-team-x-phase-5-m35-demo-hardening.md).

> This retrospective follows the **locked six-section structure** mandated by M35 plan doc §4.5 so future phase retros stay directly comparable.

---

## 1. What we shipped

| # | Milestone | Completed | Commit range / representative SHA | Unit tests | E2E | Headline architectural seam |
|---|-----------|-----------|-----------------------------------|------------|-----|------------------------------|
| M28 | RAG foundation | 2026-04-13 | M28 scaffold (migration `0008_embeddings`) | +29 | — | `@team-x/intelligence` package + sqlite-vec + `embedText` provider-router adapter + token-aware chunker + retriever with cosine-threshold gating |
| M29 | RAG into agent turns | 2026-04-13 | M29 (rag-indexer + `resolveSystemPrompt`) | +27 | — | On-write event-bus indexing (`work.completed` + `meeting.ended`), SHA256 dedup, sliding attribution block, RAG settings subsection |
| M30 | NLU engine + command palette | 2026-04-14 | `f4ac227` (T0) → `cbf8f5b` (T9) | +146 | +2 | LLM-backed intent classifier with strict JSON output, FTS5 + fuzzy entity resolver, `Cmd+K` overlay, 14 structured intents + `complex_request` fallback, **invariant #11** born from the vault-backup regression (IPC mutations must emit bus events) |
| M31 | Agentic loop — read-side | 2026-04-15 | `4f30efa` (T0) → `183562d` (T9) | +139 | +1 | `system-agent` pseudo-employee + migration 0010 `is_system`, pure ReAct scheduler in `packages/intelligence/loop/`, 6 read-only repo-wrapping tools returning `{rows, truncated}`, pause-aware `providerRouter.complete` wrapper, `AbortController` stop, three-clamped agentic-loop budget settings |
| M32 | Task planner — write-side | 2026-04-16 | `f515ea7` (T0) → `75040ed` (T10) | +75 | +1 | Level-gated write-side tool set (`decompose_project` / `delegate_subtask` / `review_deliverable`), deterministic workload scoring (locked §7.4 weights), amber **Gate 2.5** write-side confirmation (distinct from M30 red destructive gate), four clamped `planner_*` settings, F1 + F2 follow-ups closed (`command.getRunSnapshot` backfill + `useThreadList` bus invalidator) |
| M33 | Copilot service | 2026-04-17 | `c5cdeee` (T0) → `2fc998e` (T10) + `039020b` (F3 + F4) | +66 | +1 | `system-copilot` second `is_system=1` pseudo-employee, periodic analyzer (5-min default, clamped 1–60), 30s-debounced event trigger, rolling event window, migration 0011 `copilot_insights` with category-scoped + Jaccard bigram dedup, `copilot.*` IPC surface, F3 + F4 closed post-milestone (`companies.archive` + post-restore system-employee bootstrap) |
| M34 | Copilot UI | 2026-04-18 | `f1180cf` (T1) + `893f8fd` (T2–T10 squash) + `af643ec` (T11) | +31 | +1 | Renderer-only consumption of M33 IPC — zero new channels / bus events / providers. Right-side Radix sheet + dashboard widget + `Cmd+Shift+K` global shortcut + Sparkles toolbar toggle. Top-bar badge Phase 4 → Phase 5 across 5 specs |
| **M35** | **Demo + hardening (in progress)** | T0 → T3 shipped, T4 (this doc) in flight | `da4ce1f` (T0) / `b68d09b` (T1) / `1108247` (T2) + `54830fa` (T2 docblock fix) / `51393f8` (T3) | +32 so far | +1 (`phase-5-integration.spec.ts`) | Evidence-based clamp audit (all 10 defaults HELD on llama3.1:8b), cross-milestone Playwright spec stitching M28 → M34 in 3.7s, audit-view chip coverage for 10 new Phase 5 event types, `audit-event-chip-helpers.ts` pure-helper split pattern |

**Phase 5 totals (through M35 T3):** +550 unit tests / +7 E2E spec files / +8 Playwright cases / +15 new `EventType` variants (16 → 31) / +17 new IPC channels / +1 architectural invariant (#11).

Every milestone from M30 forward shipped with one atomic implementation commit per task plus a matching `chore(loki)` ledger commit (except M34, which squashed T2–T10 into a single `feat(m34)` commit — M35 restored the per-task cadence).

---

## 2. What went well

Seven architectural patterns compounded across milestones. Each is a candidate to carry forward explicitly into Phase 6.

### 2.1 Canned test-seam QUARTET

Four parallel three-tier canned seams built in lockstep with the production surface:

1. `test-classifier.ts` (M30 T8) — canned NLU classifier.
2. `test-agentic-provider.ts` (M31 T8) — canned provider for the agentic loop, with `__ECHO_AGENT__:[…]` sentinel tier.
3. `test-agentic-tools.ts` (M32 T3) — canned write-side tools with `ECHO_WRITE_SENTINEL` tier.
4. `test-copilot-provider.ts` (M33 T8) — canned provider for the analyzer, with `__ECHO_COPILOT__:<json>` sentinel tier.

The quartet let every Phase 5 E2E spec run in under 4 seconds against the full production code paths without booting Ollama. `phase-5-integration.spec.ts` (M35 T2) stitches M28 → M34 in 3.7s while reusing existing canned-seam entries — **zero new entries required** for the integration spec. That is the single best sign the seam scales.

**Carry-forward rule:** any new agentic surface MUST ship a matching canned-seam swap. M35 T2 proved this — every stitch point had a seam entry already.

### 2.2 `{rows, truncated}` envelope on tool output

Every read-side tool (M31) and write-side tool (M32) returns `{ rows: […], truncated: boolean }` capped at 50 rows per call. The envelope makes the truncation signal visible to the LLM (drives tighter follow-up queries) and to the audit trail (makes token-budget exhaustion diagnostic). Cost: two words of JSON per call. Benefit: grounded answers stay grounded; the loop never quietly drops data.

### 2.3 `data-*` stable E2E selector surface

Phase 5 added five new data-attribute selector surfaces: `data-step-kind` (M31), `data-copilot-insight-id` / `data-copilot-sidebar-root` / `data-copilot-toolbar-toggle` / `data-copilot-widget-list` (M34), and `data-event-type` (M35 T3). Every new spec wrote against data attributes first, text second. Zero flaky-selector regressions across 11 spec files.

### 2.4 Pause-aware `providerRouter.complete` wrapper

`AgenticLoopService` (M31) wraps `providerRouter.complete` in a poll over `orchestrator.isCompanyPaused(companyId)`. When the user calls a meeting, the agentic loop quiesces at the next provider call without dropping in-flight state. `CopilotAnalyzerService` (M33) reused the same wrapper unchanged. Meetings and the intelligence layer coexist without explicit coordination — the orchestrator is still the only scheduler (invariant #2).

### 2.5 `AbortController` stop plumbing

`command.stop` IPC threads an `AbortController` through the loop. `system-agent` + `system-copilot` runs are both cancelable from the palette. Terminal step is emitted as `canceled`. No zombie runs; no provider calls after a stop request.

### 2.6 `is_system` column + filter-sweep + `isSystemRoleId` predicate

Migration 0010 added `is_system BOOLEAN` with a partial index. Both `system-agent` (M31) and `system-copilot` (M33) use it. Every `employees.list` / `orgchart.get` / hire picker filters on `is_system=0` via a single predicate. Adding `system-copilot` as the second `is_system=1` row in M33 required **zero new filter code** — the sweep was already in place. That is the shape of a genuinely reusable seam.

### 2.7 Atomic + ledger commit cadence

Per-task commit shape: one `feat/test/perf/docs(m35): M35 T<N> — <title>` atomic commit followed by one `chore(loki): M35 T<N> — commit ledger (<sha>)` ledger commit. M30 → M33 held this perfectly. M34 deviated (T2–T10 squashed into one commit). M35 restored it. The value of the cadence becomes visible only when something needs a revert — the ledger commit lets you locate the task boundary without re-reading the implementation diff.

### 2.8 ABI rebuild dance — documented, repeatable

`better-sqlite3` compiles to two ABIs: system Node (for Vitest) and Electron (for Playwright). The verification recipe locked in every milestone plan doc:

```
Node ABI rebuild → pnpm test → Electron ABI rebuild → Playwright test:e2e
```

The recipe is cited in CLAUDE.md troubleshooting and in every M31/M32/M33 plan doc. It costs two ~30s rebuilds per verification gate. Without it, 23+ vitest tests fail silently on ABI mismatch.

### 2.9 Pure-helpers `.ts` + component `.tsx` split pattern

Started by `step-card-narrow.ts` + `step-card.tsx` in M32 T6 for testable narrow renderers. Re-applied in M35 T3 when the audit chip unit tests surfaced a `@/`-alias cascade through Badge. Extracting the pure helpers into a `.ts` file (no React, no Badge, no `@/` imports) let vitest resolve cleanly without a config change. This pattern will pay off every time a renderer module grows a unit-test surface.

### 2.10 IPC-mutation-emits-bus-event (invariant #11)

Born from the vault-backup regression (documented in `docs/plans/2026-04-13-vault-backup-regression-findings.md`). Every IPC mutation emits a bus event so renderer caches subscribed to the bus invalidate correctly — IPC alone is not enough because E2E specs and programmatic callers bypass React Query. Enforced across M30 `command.executed`, M31 `agent.step` + `agentic.completed` + `agentic.failed`, M32 `plan.*` + `task.*` + `review.*`, M33 `copilot.analyzed` + `copilot.insight` + `copilot.dismissed` + `copilot.expired`, and the F3 `company.archived`. Zero cache-staleness regressions after the invariant landed.

---

## 3. What cost us time

Seven recurring costs. Every one is a candidate to automate, document, or design out in Phase 6.

### 3.1 Vitest / Playwright ABI mismatch dance

Cost: ~60s per alternation between unit and E2E suites; several sessions where a silent ABI mismatch produced cryptic `NODE_MODULE_VERSION` failures before the recipe was documented. `pnpm rebuild better-sqlite3` silently no-ops because pnpm's content-addressed store reuses the hashed Electron-ABI artifact. Fix was to invoke node-gyp directly inside the pnpm cache (documented in CLAUDE.md troubleshooting and in every milestone plan doc `Verification` section). **This is the single most time-expensive dev-experience tax of Phase 5.**

### 3.2 sqlite-vec extension load path in tests (M28)

The extension path differs between dev (`node_modules/sqlite-vec/`) and packaged builds. Discovered during M28 unit-test authoring; resolved with a test-mode adapter. Documented in the M28 scaffold.

### 3.3 FTS5 regression in `vault-backup.spec.ts` (M30 T0)

The post-M30 vault-backup spec surfaced a broken React Query cache-invalidation path. Root-cause analysis (`docs/plans/2026-04-13-vault-backup-regression-findings.md`) produced architectural invariant #11 (IPC mutations must emit bus events). Cost: ~1 full session to analyse and fix, plus invariant #11 being retroactively applied to every prior IPC mutation. Worth every minute — the invariant caught four subsequent regressions during M32 + M33 development before they shipped.

### 3.4 Malformed tool-call parser nudge-retry (M31 T1)

Small local models (7–8B) frequently emit malformed tool-call JSON. The original parser returned `error` and burned a step budget. Fix: one-shot nudge-retry per malformed step with a forward-scan brace-balanced parser. Ships in `packages/intelligence/src/loop/parser.ts`. Cost: half a session, but without it `llama3.1:8b` would exhaust the 8-step budget on every multi-step query.

### 3.5 F1 / F2 / F3 / F4 follow-ups

Four cross-milestone follow-ups surfaced but shipped one milestone late:

| Follow-up | Surfaced | Closed | Commit |
|-----------|----------|--------|--------|
| F1 — `useAgentStepStream` backfill on mount | M31 | M32 T0 | `f515ea7` |
| F2 — `useThreadList` bus invalidator for `agentic.*` events | M31 | M32 T1 | `62a0504` |
| F3 — `CopilotEventWindow.clear` wired to `companies.archive` | M33 | Post-M33 | `039020b` |
| F4 — Post-restore `system-agent` + `system-copilot` bootstrap | M33 | Post-M33 | `039020b` |

**Pattern:** each follow-up was a renderer-cache or lifecycle edge case that didn't block the milestone's E2E spec but would have bitten real users. Better pre-ship analysis of backup/restore and company-archive paths would have caught F3 + F4 during M33 rather than after.

### 3.6 Vitest `@/` alias cascade through Badge (M35 T3)

Audit-chip unit tests crashed on transitive `@/lib/utils` imports inside Badge. Fix was architectural (pure-helpers split), not config. Cost: ~20 minutes of exploration before landing on the `step-card-narrow` precedent as the solution. Now documented in the M35 T3 surprise note for reuse.

### 3.7 Docblock accuracy drift (M35 T2 → T3)

The M35 T2 integration-spec docblock claimed the RagIndexer subscribed to vault bus events. `rag-indexer.ts:78,88` shows it subscribes only to `work.completed` + `meeting.ended`; vault files are retrieved through FTS5 at agent-turn time. Docblock was corrected in commit `54830fa` before T3 landed. Lesson: grep production code before writing spec docblocks, not just spec bodies.

### 3.8 Plan-vs-shipped test count drift (M35 T3)

Plan estimated +3 unit tests; M35 T3 shipped +28. Richer coverage per the no-cutting-corners mandate — not a cost, but a forecasting miss. The ~1145 Phase 5 exit target needs revision to ~1162 + remaining M35 T8/T9/T10 deltas (~5–10).

---

## 4. What we deferred

All deferrals are Phase 6 candidates. None block Phase 5 release.

| Deferral | Surface | Rationale | Phase 6 sketch |
|----------|---------|-----------|----------------|
| **Insight export** (CSV/JSON) | Copilot sidebar + dashboard widget | Feature-complete without it for v1.1.0; export adds a file-picker flow + format selector | Add `copilot.export` IPC that reuses the audit-view CSV/JSON export pipeline |
| **Multi-company insight aggregation** | Copilot sidebar | Per-company insights are the MVP; a "you have 3 critical insights across 5 companies" rollup adds a new query surface | New `copilot.rollup` IPC; dashboard widget variant with company-switcher |
| **Drag-to-reorder** | Kanban / org chart / Copilot insights | Not requested pre-release; Radix primitives support it but UX needs design | Shared drag-hook pattern with `data-draggable` selector surface |
| **`capabilities` frontmatter on role.md** | `scoreEmployee` in `agentic-tools-write.ts` | M32 T2 shipped title-keyword heuristic for role-fit; capabilities would make scoring more granular for small orgs where title fuzzy-match dominates | Extend role-schema parser; migrate 55-role library; revise `computeRoleFit` |
| **Post-launch telemetry digest** | `runs` table + real Ollama users | Need real user data to justify clamp changes — evidence-based tuning, not vibe-based | Phase 6 T0 reads local `runs` table, proposes evidence-based `agentic_max_steps` / `copilot_interval_minutes` / `rag_similarity_threshold` changes |
| **Proactive copilot → autonomous action** | Copilot UI action button | Current design requires user to click an action to dispatch. Autonomous action needs a second-order approval surface | New `copilot.autonomousActions` setting + per-action permission tier |
| **Agent-to-agent negotiation** | Cross-employee messaging | M11 sends messages; it does not negotiate (workload trading, deadline slipping, scope disputes) | Inter-agent protocol over existing `send_message_to_colleague` tool |
| **Cross-company copilot aggregation** | Copilot sidebar + top bar | Strategia-X is the only seeded company today; multi-company aggregation only matters when the user has ≥2 real companies | Tracked jointly with multi-company aggregation above |
| **Real customer demo** | Demo script (M35 T5) | Scripted walkthrough shipped; live customer recording deferred to post-v1.1.0 marketing cycle | Coordinated with Strategia-X marketing, not a code deliverable |

---

## 5. Metrics

### 5.1 Test growth

| Phase | Unit | Delta | E2E specs | E2E Playwright cases |
|-------|------|-------|-----------|----------------------|
| Phase 4 exit | 612 | baseline | 4 | 4 |
| M28 | 641 | +29 | 4 | 4 |
| M29 | 668 | +27 | 4 | 4 |
| M30 | 819 | +146 (+3 E2E fix + new palette) | 6 | 7 |
| M31 | 958 | +139 | 7 | 8 |
| M32 | 1033 | +75 | 8 | 9 |
| M33 | 1099 | +66 | 9 | 10 |
| M34 | 1130 | +31 | 10 | 11 |
| M35 T1 | 1134 | +4 | 10 | 11 |
| M35 T3 | **1162** | **+28** | **11** | **12** |
| **Phase 5 totals** | **+550 (+83%)** | — | **+7** | **+8** |

Unit tests nearly doubled from the Phase 4 baseline. E2E tripled. One E2E spec per milestone except M35 which shipped the integration stitch spec.

### 5.2 LOC delta

From the Phase 5 branch-point commit to HEAD at M35 T3:

```
207 files changed, 43,919 insertions(+), 489 deletions(-)
```

That is mostly new code (intelligence package, system-agent / system-copilot role cards, four canned seams, 27 new renderer features across copilot + palette + step-card, 11 new IPC handlers, four new settings sections, chip helpers, tests). Deletions stayed small — additive milestone, not a rewrite.

### 5.3 Architectural surface delta

| Surface | Phase 4 exit | Phase 5 exit (M35 T3) | Delta |
|---------|--------------|-----------------------|-------|
| IPC channel namespaces | 13 | 15 (+command, +copilot) | +2 namespaces |
| IPC channels | ~60 | ~77 | +17 |
| `EventType` union variants | ~16 | 31 | +15 |
| `AgentStepKind` union variants | 0 | 8 | +8 |
| Architectural invariants | 10 | 11 (#11 IPC mutations emit bus events) | +1 |
| Settings keys | ~25 | ~35 (+10 Phase 5 clamps) | +10 |
| Migrations | 0007 | 0012 | +5 |
| Pseudo-employees (`is_system=1`) | 0 | 2 (system-agent + system-copilot) | +2 |
| Role packs | 1 (strategia-official) | 1 (same) | 0 |
| `tsconfig` project refs | 5 | 6 (+ packages/intelligence) | +1 |

### 5.4 Follow-up count

Four documented follow-ups (F1–F4), all closed before Phase 5 release. Each had its own commit SHA and verification. No dangling Phase 5 follow-ups carry into Phase 6.

### 5.5 Commit cadence adherence

M30 → M33: atomic-per-task + ledger cadence held for 44 tasks (4 milestones × 11 tasks). M34 deviated (T2–T10 squash). M35 restored. Overall adherence: 44 / 55 tasks = **80%** strict atomic cadence, 100% of milestones closed with a ledger commit within the same session.

---

## 6. Phase 6 seeds

These are **hypotheses, not commitments**. The first Phase 6 session selects one and authors a design doc. Each is scoped so it could be a Phase 6 headline on its own.

### 6.1 Post-release telemetry digest (evidence-based clamp tuning)

**User value:** Clamp defaults (`agentic_max_steps=8`, `copilot_interval_minutes=5`, `rag_similarity_threshold=0.5`, etc.) were set on M35 T1 llama3.1:8b evidence from a single machine. Real users have different hardware, models, and workflows. A digest that reads the local `runs` table, aggregates real timing + token usage, and proposes evidence-based clamp changes would be the honest next iteration — and it preserves the zero-phone-home invariant because the digest runs locally.
**Architectural cost:** One new service (`TelemetryDigestService`) + one new settings section (proposed-clamp diff + user acceptance). No new IPC namespace if it reuses `telemetry.*`.
**Risk:** Low. Purely local; no new trust boundary.

### 6.2 Cross-company insight aggregation + company switcher in copilot sidebar

**User value:** When a real user has ≥2 companies, `copilot.insights` becomes N queries. A rollup (`copilot.rollup`) plus a company-switcher chip in the sidebar lets the user triage critical insights across the portfolio.
**Architectural cost:** New rollup query; sidebar gets a company-facet filter. Does NOT require multi-company DB (we already have it from M7). Mostly renderer work.
**Risk:** Low-medium. Depends on real multi-company users materializing.

### 6.3 Proactive copilot → autonomous action (with approval tiers)

**User value:** Today the copilot surfaces insights; the user clicks an action to dispatch. Autonomous action would let pre-approved categories (e.g., "auto-assign P0 tickets to the on-call rotation") fire without a click.
**Architectural cost:** High. New approval-tier settings surface (per-insight-category + per-action-verb). Requires careful UX — the F10 bar says explicit approval trumps convenience. A new `copilot.autonomousActions` setting with a conservative allowlist is the minimum viable scope.
**Risk:** Medium. Autonomy is easy to do wrong; invariant #11 + audit log mitigate but don't eliminate.

### 6.4 Agent-to-agent negotiation protocol

**User value:** M11 lets employees send messages. It does not let them negotiate — scope disputes, deadline slipping, workload trading, review rejection back-pressure. A richer protocol over `send_message_to_colleague` would let the org self-balance.
**Architectural cost:** High. New message types (`negotiation.proposal` / `negotiation.counter` / `negotiation.accept` / `negotiation.escalate`). Bus events. Audit chips. Potentially a new settings surface for negotiation-latency budgets.
**Risk:** High. LLM-driven negotiation can burn tokens indefinitely without guardrails. Must ship with a deterministic negotiation-step budget analogous to `agentic_max_steps`.

### 6.5 `capabilities` frontmatter on role.md + scored-fit upgrade

**User value:** M32 `scoreEmployee` role-fit is a keyword heuristic over title + level. Small orgs get dominated by title fuzzy-match. Capabilities frontmatter (enumerated per role, versioned per semver) would make scoring granular and transparent.
**Architectural cost:** Medium. Role-schema parser extension. 55-role library sweep. `computeRoleFit` rewrite.
**Risk:** Medium. Role.md quality bar is the crown jewel — expanding the frontmatter surface means auditing all 55 cards for correctness.

### 6.6 Real customer demo (coordinated with Strategia-X marketing)

**User value:** Scripted walkthrough ships in M35 T5. A recorded live demo with a real customer workflow converts far better than a scripted walkthrough. Coordinated with marketing; not a code deliverable.
**Architectural cost:** Zero.
**Risk:** Zero.
**Scripted foundation:** [`docs/demo/phase-5-walkthrough.md`](../demo/phase-5-walkthrough.md) + 5 scenario stubs under [`docs/demo/scenarios/`](../demo/scenarios/) — the Phase 5 demo video would follow this script frame-for-frame.

### 6.7 Insight export (CSV / JSON)

**User value:** Copilot sidebar lacks export. AuditView has it (CSV + JSON). Parity restoration.
**Architectural cost:** Tiny. New `copilot.export` IPC that wraps the existing audit-export helpers.
**Risk:** Low. Pure additive.

---

## Closing note

Phase 5 doubled the test suite, tripled the E2E surface, and added two pseudo-employees, one new package, 15 new bus events, 17 new IPC channels, one new architectural invariant, and zero new providers / MCP servers / phone-home endpoints. The canned-seam quartet + `{rows, truncated}` envelope + `data-*` selector surface are the three patterns most worth carrying into Phase 6 explicitly — they compounded across every milestone from M30 forward and paid for themselves many times over on M35 T2 when the integration spec stitched M28 → M34 in 3.7 seconds without a single new seam entry.

The Phase 6 design doc should open by picking one of the §6 seeds (or a new theme Rocky surfaces), naming an authoring date, and committing to the same atomic-per-task + ledger cadence that M30–M33 + M35 proved scales.
