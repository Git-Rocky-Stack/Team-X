# Team-X — Phase 6 Design: Capabilities & Evidence

> **Status:** Plan authored 2026-04-20 (T0). Milestones not yet started.
> **Version target:** v1.1.0 → v1.2.0 (additive; zero breaking changes).
> **Predecessor:** [Phase 5 — Intelligence Layer](./2026-04-13-team-x-phase-5-intelligence-layer.md) (complete, v1.1.0, 2026-04-20).
> **Retrospective:** [2026-04-19-team-x-phase-5-retrospective.md](./2026-04-19-team-x-phase-5-retrospective.md) §6 (Phase 6 seeds).

---

## 1. Overview

Phase 5 shipped the Intelligence Layer — RAG, NLU, agentic loop, task planner, copilot service, copilot UI, demo + hardening. Eight milestones. +557 unit tests. +7 E2E specs. The capability is in place; the *calibration* is not.

**Phase 6 matures Phase 5.** Three compounding gaps surfaced in production-shape testing at M35 T1 and in the retrospective §6 seeds:

1. **Role-fit is a keyword heuristic.** M32's `scoreEmployee` weights (`0.4 role-fit + 0.3 inverse-load + 0.2 availability + 0.1 past-performance`) are locked and validated by 25 unit tests — but role-fit itself is a keyword match over title + level. When `decompose_project` recommends a subtask assignee, the scoring is structurally sound but evidentially thin. M32 flagged capabilities frontmatter as deferred four separate times.

2. **Runtime telemetry doesn't surface system work.** Migration 0012 added `runs.kind` so copilot ticks (`'copilot'`), agentic runs (`'agentic'`), and orchestrator work (`'work'`) land as distinct rows — but the Telemetry tab has no per-kind filter. Operators see the aggregate only. The column is dangling.

3. **Insight dismissals are terminal events, not signal.** M33's copilot analyzer has no feedback loop. If Rocky dismisses every `cost` insight for a week, the analyzer keeps proposing them. Dismissal patterns should downrank categories the same way role-fit weights rank assignees.

Phase 6 closes all three with evidence-grade primitives (capabilities taxonomy, per-kind telemetry, dismissal-pattern feedback), rounds out the milestone set with insight export (retro seed #7), and lands v1.2.0 as a non-breaking maturation release.

### Goals

- **Capabilities-driven role-fit.** Replace M32's keyword heuristic with capability-overlap scoring. Preserve the 4-weight locked signature (`0.4 + 0.3 + 0.2 + 0.1`) — only the `computeRoleFit` implementation changes.
- **Full 55-role + 2-system capabilities backfill.** Every role.md in `role-packs/strategia-official/roles/` gets a `capabilities: [...]` frontmatter field drawn from a locked taxonomy.
- **Telemetry per-kind filter.** `TelemetryView` exposes work / agentic / copilot as filter chips; all four existing subviews (Company, Employees, Cost, + new Daily Usage per-kind breakdown) respect the filter.
- **Insight feedback loop.** Dismissal patterns reshape the analyzer's next-tick category mix via a per-category weight vector stored in `settings`. Hard-deny intent (category weight = 0) gracefully suppresses the category without removing it from the taxonomy.
- **Insight export.** JSON + CSV export per company or global. Mirrors the M24 audit-export surface (same dialog pattern, same file-system contract).
- **Phase exit gate.** Demo + hardening milestone matching M20 / M27 / M35 shape — cross-milestone integration E2E, retrospective, README sweep, CHANGELOG promotion to `[1.2.0]`, version bump, Phase 6 COMPLETE marker.

### Non-goals

- **No autonomous action.** Copilot remains advisory. Proactive action (retro seed #3) stays Phase 7+ material — requires its own safety / rollback / dry-run primitives.
- **No cross-company aggregation.** Cross-company copilot rollups (retro seed #2) stay single-company scope. Multi-company UX surface is its own project.
- **No telemetry digest.** Post-release telemetry digest (retro seed #1) requires real-world usage data which Team-X doesn't generate by design (zero phone-home). Digest is user-triggered export only; analysis happens off-device.
- **No agent-to-agent negotiation.** Retro seed #4. Out of scope.
- **No new providers, no new MCP transports.** Phase 5 landed 7+ providers + stdio/SSE MCP. Phase 6 is calibration, not surface expansion.

---

## 2. What ships

| Surface | Deliverable | Builds on |
|---------|-------------|-----------|
| **`role-schema` parser** | `capabilities: string[]` frontmatter field + validation + locked taxonomy | M8 role-loader, M32 T2 heuristic |
| **55 F10 roles + 2 system** | Every `role.md` under `role-packs/strategia-official/roles/` gains a `capabilities` block | Phase 2 role library |
| **Capability taxonomy** | Locked enum of ~40 capabilities across 6 categories (engineering / product / design / operations / strategy / support) with validation | New — lives in `@team-x/shared-types` |
| **`computeRoleFit` v2** | Capability-overlap scoring replaces keyword heuristic. Preserves the 4-weight (`0.4 + 0.3 + 0.2 + 0.1`) locked signature | M32 `agentic-tools-write.ts` |
| **Role-fit regression guards** | New unit tests pinning v1 → v2 migration: identical outputs for keyword-matched golden cases; capabilities-driven outputs for the capability-only golden cases | M32 T2 25 unit tests |
| **`TelemetryView` per-kind filter** | Chip row above existing subviews: `All / Work / Agentic / Copilot`. All subviews respect the filter | M17 Telemetry, M33 migration 0012 |
| **`runs.kind` backfill query** | Read-path aggregates per-kind from the existing column; no migration (0012 already landed) | M33 migration 0012 |
| **Insight feedback loop** | `settings.copilot_category_weights` (6-key weight vector, default 1.0 each, clamp 0.0–2.0). Dismissal pattern detector: 3 dismissals of same category within 7 days → auto-propose downrank (UI-surfaced suggestion, never auto-applied) | M33 analyzer |
| **Insight export** | `copilot.export` IPC (format: `'json' \| 'csv'`, scope: `'company' \| 'all'`), Export button in `CopilotSidebar` header, mirrors `audit.export` UX | M24 audit export, M34 sidebar |
| **Demo + hardening** | Cross-milestone integration E2E for Phase 6 surfaces. Phase 6 retrospective. README sweep. CHANGELOG `[1.1.0]` → `[1.2.0]` promotion. Version bump. Phase 6 COMPLETE marker | M35 T0–T10 template |

### Target metrics

- **Unit tests:** 1169 → ~1320 (+150 estimate). Capabilities backfill + role-fit v2 alone warrant ~60 tests.
- **E2E specs:** 11 → 12 (+1 cross-milestone integration spec; the `capabilities-flow.spec.ts` scenario).
- **Migrations:** 13 → 13 (no new migrations — `runs.kind` column already in place, capability data lives in frontmatter + settings).
- **IPC channels:** ~80+ → ~85+ (1 new: `copilot.export`; `settings.getCopilotWeights` / `setCopilotWeights` as peers to existing copilot settings).
- **Bus events:** 31 → 32 (+1: `copilot.weights.changed` per invariant #11).
- **Settings keys:** adds `copilot_category_weights` JSON-encoded weight vector.
- **Architectural invariants:** 11 → 11 (no new invariants; Phase 6 is calibration within existing boundaries).

---

## 3. Invariants preserved

Every Phase 5 invariant carries forward unchanged:

1. Renderer pure-view (capabilities live in role.md + settings; UI calls through IPC).
2. Orchestrator is the only scheduler (no new work-dispatch paths).
3. MCP host singleton (no changes).
4. SQLite + filesystem vault (capabilities are role.md frontmatter, not a new table).
5. Provider router is the only LLM-touching layer (unchanged).
6. Events table is append-only (new `copilot.weights.changed` event follows the pattern).
7. **Zero phone-home** (insight export writes locally; the word "export" does not loosen this — file-system writes are local, user-triggered, and zero network).
8. Secrets in OS keychain (no new secret surface).
9. Role-pack user edits as overrides (capabilities backfill lives in the `strategia-official` pack; user overrides stay user overrides).
10. Runtime strategy adaptive (no new strategy branches).
11. **IPC mutations emit a bus event** — `settings.setCopilotWeights` emits `copilot.weights.changed` with the new weights payload; `copilot.export` is read-only and emits no bus event.

Phase 6 specifically does NOT introduce:

- New privacy tiers, new runtime strategies, new concurrency caps.
- New test-mode seams (the existing quartet — classifier + agentic-provider + agentic-tools + copilot-provider — covers every agentic surface; Phase 6 reuses them).
- New pseudo-employees (system-agent + system-copilot remain the only two `is_system = 1` rows).
- New role levels (Officer → IC stays 6-level, 25-IC / 5-Officer).

---

## 4. Success criteria

Phase 6 is complete when all five criteria are met simultaneously.

1. **Capabilities backfill complete.** All 55 F10 roles + 2 system roles carry a non-empty `capabilities: [...]` field drawn from the locked taxonomy. `role-schema` parser validates; zero silent drops. A role with zero capabilities is a schema error, not a warning.

2. **Role-fit v2 is capabilities-driven.** `computeRoleFit(employee, subtask)` returns the Jaccard overlap between subtask-required-capabilities and employee capabilities, clamped [0.0, 1.0]. The 4-weight signature is unchanged (`0.4 role-fit + 0.3 inverse-load + 0.2 availability + 0.1 past-performance`). Regression guards pin the v1 → v2 transition for golden cases.

3. **Telemetry per-kind filter operational.** `TelemetryView` renders chips `All / Work / Agentic / Copilot`, every subview re-queries on filter change, and the existing aggregate view is preserved as the default `All` case (zero regression for operators who don't change the filter).

4. **Insight feedback loop closed.** `settings.copilot_category_weights` is a 6-key weight vector persisted through `settings.setCopilotWeights` IPC. The analyzer multiplies draft scores by the weight vector before dedup. Dismissal pattern detector surfaces a UI suggestion after 3 same-category dismissals within 7 days — never auto-applies. `copilot.weights.changed` fires on the bus per invariant #11.

5. **Phase exit gate green.** Cross-milestone integration E2E green. Phase 6 retrospective authored per locked six-section structure. README + user-guide reconciled. CHANGELOG `[1.1.0]` → `[1.2.0]` promoted. Version bumped 1.1.0 → 1.2.0 across 7 `package.json` files. Phase 6 COMPLETE marker source-string-audit test pinned (extending the 4-deep lineage — M35 T3 / T8 / T9 / T10 → M41 T10). v1.2.0 git tag on the final ledger commit.

---

## 5. Milestone breakdown (placeholder count)

**Estimated milestones: 6 (M36 → M41).** Final scope materializes at each milestone's own T0 plan doc (Phase 5 pattern — milestones get their own plan doc before T1 opens).

| # | Milestone | One-line scope | Dep |
|---|-----------|----------------|-----|
| **M36** | Capabilities Taxonomy + Parser | Locked capability enum in `shared-types`; `role-schema` parser gains `capabilities` field + validation; 55 F10 + 2 system roles backfilled | none |
| **M37** | Role-Fit v2 | `computeRoleFit` capabilities-driven; 4-weight signature preserved; v1 → v2 regression guards; updated `agentic-tools-write.ts` + M32 T2 test suite | M36 |
| **M38** | Insight Feedback Loop | `copilot_category_weights` setting; analyzer weight-multiplier integration; dismissal pattern detector + UI suggestion surface; `copilot.weights.changed` bus event | M33 (existing) |
| **M39** | Telemetry Per-Kind Filter | `TelemetryView` chip row; per-kind aggregate queries; runs.kind backfill cleanup (zero-migration, read-path only) | M33 migration 0012 (existing) |
| **M40** | Insight Export | `copilot.export` IPC (JSON + CSV); Export button in sidebar header; mirrors M24 audit-export UX | M34 sidebar |
| **M41** | Demo + Hardening + v1.2.0 | Cross-milestone integration E2E, retrospective, README sweep, CHANGELOG promotion, v1.2.0 bump, Phase 6 COMPLETE marker | all above |

**Authoring rule (carried from Phase 5):** Each milestone opens with its own T0 plan doc at `docs/plans/2026-0X-XX-team-x-phase-6-m<NN>-<theme>.md` mirroring the Phase 5 milestone plan shape (structure, non-goals, architectural decisions per plan doc §4.5 spec). No per-milestone T1+ breakdown materializes in this Phase 6 T0 plan doc.

**Milestone cadence:** atomic + ledger commit pair per task (restored at M35 T1, preserved through M35 T10 — carries forward into Phase 6 unchanged). No squashed multi-task commits (M34 deviation → not repeated).

---

## 6. Acceptance criteria

Phase 6 ships when every criterion below is verified green in a single contiguous session (the M35 exit-gate template):

1. **Node ABI** rebuild — `cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npm run install`.
2. **Vitest** — ~1320 unit tests pass in ≤50s. Zero skipped; zero flaky. Phase 6 source-string-audit markers pinned (capabilities taxonomy literal + Phase 6 COMPLETE literal + v1.2.0 badge literal).
3. **Typecheck** — clean across all 6 packages via `pnpm typecheck` (repo root — NOT the workspace-scoped variant per the Task 18 lesson preserved in CLAUDE.md).
4. **Lint** — 0 errors, ≤24 warnings (Phase 5 baseline preserved). `noNonNullAssertion` hot paths in `entity-resolver.ts` / `retriever.ts` / `chunker.ts` continue to be the only warnings.
5. **Electron ABI** rebuild — `pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar`.
6. **Playwright** — 12 specs / 13 cases pass in ≤35s. New `capabilities-flow.spec.ts` stitches M36 → M41 surfaces (capabilities parse → role-fit v2 score → planner decompose + delegate + amber gate → telemetry filter → dismissal → weight change → export).
7. **Production build** — `pnpm -F @team-x/desktop build` succeeds; `out/main/index.js` + renderer bundle land clean.
8. **Cross-platform installer** — `pnpm dist:win` (and macOS / Linux on CI matrix per `release.yml`) emits v1.2.0 installer under `release/1.2.0/`. Smoke-launch the Windows installer: verify Phase 6 badge, palette, sidebar, system seats (both still present), telemetry filter chips, export button — zero console errors.
9. **Version bump** — 1.1.0 → 1.2.0 across 7 `package.json` files + `top-bar.test.tsx` pinning literal `Phase 6` badge string (inherits the M35 T8 badge-freeze pattern).
10. **Git tag** — `v1.2.0` lands on the final Phase 6 COMPLETE ledger commit.

---

## 7. Decisions log (scaffold)

> Phase 5's decisions log ended at **D14**. Phase 6 extends it. Each decision below is a forward-looking placeholder; the concrete call lands at the milestone that confronts the decision.

- **D15 (M36):** Capability taxonomy is locked at ~40 capabilities across 6 categories (engineering / product / design / operations / strategy / support). Roles cannot author arbitrary strings — capability values must match the shared-types enum. Rationale: downstream consumers (role-fit scoring, future autonomous-action recommendations) depend on a stable vocabulary.

- **D16 (M36):** Capabilities live in role.md frontmatter, NOT a new database table. Rationale: role.md is the source of truth for role-pack distribution; a parallel DB table duplicates state and breaks the role-pack override contract (invariant #9). Consumers query via `roleLoader.getCapabilities(roleId)`.

- **D17 (M37):** Jaccard overlap is the capability-scoring function (`|A ∩ B| / |A ∪ B|`). Rationale: symmetric, bounded [0, 1], interpretable, and computationally trivial. Cosine / weighted variants deferred to a future milestone that has evidence of Jaccard falling short.

- **D18 (M37):** The 4-weight signature (`0.4 role-fit + 0.3 inverse-load + 0.2 availability + 0.1 past-performance`) is LOCKED from M32. Phase 6 changes ONLY the `computeRoleFit` implementation. Weights do not move without explicit retrospective-driven evidence. Rationale: M32 T2 25 unit tests validate the signature; disturbing the weights invalidates the testing surface without a corresponding evidence gain.

- **D19 (M38):** Dismissal pattern detector is advisory, never mutating. Three same-category dismissals in 7 days surfaces a UI suggestion; the suggestion requires explicit user confirmation to apply. Rationale: silent weight mutation breaks user trust; the dismissal might be correct for that specific insight without implying category-level disinterest.

- **D20 (M38):** `copilot_category_weights` is clamped [0.0, 2.0] per key. Rationale: 0.0 is hard-deny (analyzer skips the category); 1.0 is neutral; 2.0 is 2× upweight. Above 2.0 is noise; below 0.0 is nonsense.

- **D21 (M39):** Telemetry per-kind filter is read-path only. The existing `runs.kind` column (migration 0012, M33) is sufficient. No new migrations. Rationale: invariant #6 (events append-only) + zero-migration policy when read-path aggregation covers the need.

- **D22 (M40):** Insight export writes to the local filesystem via the same dialog pattern as M24 audit export. No network path. Rationale: invariant #7 (zero phone-home) is not negotiable; the word "export" does not loosen this.

- **D23 (M41):** Phase 6 retrospective follows the locked six-section structure from M35 T4 (`docs/plans/2026-04-19-team-x-phase-5-retrospective.md`). Rationale: future phase retros stay directly comparable; the lineage is now 2-deep and compounds into 3-deep at Phase 7.

---

## 8. References

- [Phase 5 design doc](./2026-04-13-team-x-phase-5-intelligence-layer.md) — §9 Milestone Breakdown, §10 IPC channel summary, §11 Settings keys, §13 Decisions Log D1–D14, §14 Follow-ups, §16 Deferred.
- [Phase 5 retrospective](./2026-04-19-team-x-phase-5-retrospective.md) — §6 Phase 6 seeds (7 candidates, prioritized; Phase 6 picks seeds #5, #7, and companions).
- [Phase 5 M32 plan doc](./2026-04-15-team-x-phase-5-m32-task-planner.md) — §7.4 locked scoring weights; carries forward verbatim.
- [Phase 5 M33 plan doc](./2026-04-16-team-x-phase-5-m33-copilot-service.md) — copilot analyzer pipeline; Phase 6 M38 extends the tick path with the weight multiplier.
- [Phase 5 M35 plan doc](./2026-04-19-team-x-phase-5-m35-demo-hardening.md) — T0–T10 shape for Phase 6 M41.
- `CLAUDE.md` — architectural invariants (§ "Architectural invariants" 1–11); IPC channel table; bus events table; troubleshooting.

---

## 9. Open questions (not blocking T0)

- **Q1 (M36):** Should capabilities be case-sensitive? The M32 keyword heuristic was case-insensitive. Recommend case-sensitive enum values with lowercase-snake_case convention (`backend_engineering`, not `Backend-Engineering` or `backend_eng`) for strict equality and better IDE autocomplete. Final call at M36 T0.

- **Q2 (M37):** What's the graceful-degradation path when a subtask has zero required-capabilities declared? Two options: (a) fall back to v1 keyword heuristic for the scoring pass, (b) treat zero-capabilities as "any capabilities satisfy" (overlap = 1.0 for every candidate). Option (b) is simpler but collapses role-fit signal for generic subtasks. Final call at M37 T0.

- **Q3 (M38):** Should the dismissal-pattern detector window be user-configurable (1–30 days) or locked at 7 days? Retrospective evidence favors locked defaults unless users hit the clamp (M35 T1 learning). Default locked at 7 days; add a setting if M41 evidence surfaces otherwise.

- **Q4 (M40):** Does insight export respect the current sidebar category/severity filter, or always export the full active-insights set? Recommend "export mirrors sidebar filter state" for predictability — the surface Rocky sees is the surface Rocky exports. Final call at M40 T0.

---

**End of Phase 6 T0 plan doc.** Next session opens M36 T0 (capabilities taxonomy + parser plan doc).
