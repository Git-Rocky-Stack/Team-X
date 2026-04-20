# Team-X — Phase 6 M36 Plan: Capabilities Taxonomy + Parser

> **Status:** Reconciled 2026-04-20 by M37-R. This document remains the M36 design authority, but the implementation is no longer future work: taxonomy, parser validation, official 57-role backfill, pack `1.1.0`, and signature update landed in commit `26d07df`.
> **Milestone:** M36 — Capabilities Taxonomy + Parser (first Phase 6 milestone).
> **Depends on:** Phase 5 COMPLETE (v1.1.0, 2026-04-20) + Phase 6 T0 plan doc (commit a429abf).
> **Phase doc:** [2026-04-20-team-x-phase-6-capabilities-evidence.md](./2026-04-20-team-x-phase-6-capabilities-evidence.md) §5 (M36 row), §7 (D15 + D16), §9 (Q1).
> **Version target:** v1.1.0 → v1.1.0 (M36 is internal — no semver bump; that lands at M41).
> **Scope one-liner:** Lock the capability taxonomy, extend `role-schema` to parse + validate a `capabilities: string[]` frontmatter field, and backfill all 57 roles (55 F10 + 2 system) under `role-packs/strategia-official/roles/`.

---

## 0. M37-R Reconciliation Addendum

M37-R verified that the M36 substrate already exists on disk and is covered by focused tests:

- `packages/shared-types/src/capabilities.ts` exports the locked 41-capability taxonomy, 6-category map, runtime list, and `isCapability` guard.
- `packages/role-schema/src/parse.ts` parses `capabilities`, rejects unknown / empty / non-string capability arrays, supports required-capability enforcement, and dedupes duplicates with warnings.
- `role-packs/strategia-official/roles/` contains 57 role files (55 F10 + 2 system), all backfilled with non-empty official capabilities.
- `role-packs/strategia-official/pack.json` is at `1.1.0`; `pack.sig` is present and verified by the existing signature tests.
- Focused M37-R verification: shared-types taxonomy tests `20/20`, role-schema parser/backfill/signature tests `50/50`, and desktop role-loader / scorer tests `50/50`.

The original sections below are preserved as historical M36 intent. Future Phase 6 work should treat M36 as reconciled/shipped, not as a pending T1/T2 implementation queue.

---

## 1. Overview

Phase 5 M32 shipped the write-side task planner with a locked 4-weight scoring signature (`0.4 role-fit + 0.3 inverse-load + 0.2 availability + 0.1 past-performance`). The signature is validated by 25 unit tests and has carried cleanly through every agentic-tools-write regression since. **The weakness is not the signature — it is `computeRoleFit`.**

Today, `computeRoleFit` is a keyword heuristic over `employee.title + employee.level`. A subtask with the word *"frontend"* scores a `Senior Fullstack Engineer` high; a subtask with the word *"strategy"* scores a `Chief Executive Officer` high. The mapping is coincidental, not structural. M32 acknowledged this four separate times in source comments as deferred work.

M36 closes the structural gap **upstream of** `computeRoleFit`. It does not touch scoring — that is M37's job. M36 delivers the vocabulary + the substrate:

1. **A locked capability taxonomy.** `~40` capability identifiers in a shared-types enum. Roles cannot author arbitrary strings; capability values must match the enum. Categories are fixed at six: `engineering` / `product` / `design` / `operations` / `strategy` / `support`.
2. **Role.md frontmatter carries capabilities.** Every role.md under `role-packs/strategia-official/roles/` gains a `capabilities: [...]` array drawn from the taxonomy. Zero capabilities is a schema error, not a warning.
3. **Role-schema parser validates at load time.** Unknown capabilities reject the role-pack; duplicate capabilities are de-duped with a warning; zero capabilities fail hard.
4. **Full backfill — 57 roles.** All 55 F10 role templates + the 2 `is_system = 1` roles (`system-agent.md` + `system-copilot.md`) carry capabilities. The system-agent gets `query`-flavored capabilities (research, reporting); system-copilot gets `analysis`-flavored capabilities (pattern detection, advisory).

M36 is the **substrate milestone**. M37 (role-fit v2) consumes the substrate. M38 (insight feedback loop), M39 (telemetry per-kind filter), and M40 (insight export) are independent of M36 and can parallelize if work streams split; M41 depends on all of them.

---

## 2. Non-goals

- **No changes to `computeRoleFit`.** M36 adds the taxonomy + parser + backfill. The scoring function is untouched until M37. Running M36 against live `decompose_project` / `delegate_subtask` produces **identical output to Phase 5** because the scoring function still reads `title + level`, not capabilities.
- **No new DB tables.** Per decision D16 (Phase 6 T0 §7): capabilities live in role.md frontmatter. A parallel database table duplicates state and breaks the role-pack override contract (invariant #9). Consumers read capabilities via `roleLoader.getCapabilities(roleId)`.
- **No new IPC channels.** The role-schema parser surface is internal to the main process; renderer does not consume capabilities directly during M36. (M37 will add a read-only IPC for role-fit previews, not M36.)
- **No new bus events.** No runtime state changes in M36 — taxonomy authoring and role-pack backfills are build-time contracts, not runtime events.
- **No user-authored capability strings.** The taxonomy is a **closed enum** — community role packs (Phase 4+) will be bound by the same enum. Authoring outside the enum is a role-pack-signature validation failure. This is a deliberate constraint: downstream consumers (M37 role-fit scoring, future autonomous-action recommendations in Phase 7+) depend on a stable vocabulary.
- **No changes to the locked 4-weight scoring signature.** Preserved verbatim from M32 (`0.4 + 0.3 + 0.2 + 0.1`) per decision D18. M36 does not modify weights, does not add a fifth weight, does not introduce a capability-confidence dimension.
- **No cross-company capabilities differences.** Every company loading `strategia-official` gets the same 57 roles with the same capabilities. Per-company override (via the role-pack override contract — invariant #9) is a user-facing tweak, not an M36 deliverable.
- **No capability hierarchies.** A role either has `backend_engineering` or it does not. No `backend_engineering.python` sub-capability, no `backend_engineering:senior` qualifier. Flat strings, strict equality. Expansion to hierarchies is explicitly Phase 7+ material if and only if evidence surfaces that flat is insufficient.

---

## 3. What ships

| Surface | Deliverable | Builds on |
|---------|-------------|-----------|
| `@team-x/shared-types` | `Capability` string-literal union + `CAPABILITY_LIST` runtime array + `CapabilityCategory` union + `CAPABILITY_CATEGORY_MAP` (category → capability[] mapping) + `isCapability(s)` type guard | sibling to existing `CopilotCategory` / `PRIVACY_TIER_RANK` constants |
| `@team-x/role-schema` parser | `capabilities: string[]` frontmatter field; strict enum validation against `CAPABILITY_LIST`; zero-capability hard-error; duplicate-capability warning + dedup; unknown-capability hard-error | M8 role-loader frontmatter parser |
| 55 F10 role.md files | Every file under `role-packs/strategia-official/roles/{officer,senior-management,management,supervisor,lead,ic}/` gains a `capabilities: [...]` block in frontmatter | Phase 2 role library |
| 2 system role.md files | `role-packs/strategia-official/roles/system/system-agent.md` + `system-copilot.md` gain `capabilities: [...]` blocks (research + analysis flavored, respectively) | M31 `system-agent.md` + M33 `system-copilot.md` |
| Role-pack signature re-sign | Ed25519 re-sign of the `strategia-official` pack after backfill lands (invariant #9 preservation) | M27 `pack-signature.ts` |
| Parser unit tests | Valid-capability parse; unknown-capability error; zero-capability error; duplicate dedup + warning; frontmatter without `capabilities` field still loads (backward compat for non-Strategia packs) | M8 role-loader existing test suite |
| Backfill audit test | Unit test walks every `.md` file under `role-packs/strategia-official/roles/` and asserts (a) non-empty capabilities; (b) every capability is in `CAPABILITY_LIST`; (c) each of the 6 categories is represented somewhere in the pack | new — source-string-audit test lineage from M35 T3/T8/T9/T10 |

### Target metrics

- **Unit tests:** 1169 → ~1220 (+50 estimate). Taxonomy shape validators (~10), parser validation cases (~15), backfill audit sweep (~5), plus per-role-category sanity tests (~20).
- **E2E specs:** 11 → 11 (no change — M36 is a parser + data milestone; no renderer surface).
- **Migrations:** 13 → 13 (zero new per D16).
- **IPC channels:** 80+ → 80+ (zero new per non-goals).
- **Bus events:** 31 → 31 (zero new per non-goals).
- **Settings keys:** 0 additions (taxonomy is not user-configurable).
- **Files touched (estimate):** `packages/shared-types/src/capabilities.ts` NEW; `packages/role-schema/src/parser.ts` MODIFIED; `packages/role-schema/src/schema.ts` MODIFIED; 57 role.md files MODIFIED; 3 new test files under `packages/role-schema/` + 1 new audit test under `apps/desktop/src/`.

---

## 4. Invariants preserved

Phase 5's 11 architectural invariants are untouched. Two deserve explicit callouts because they shape M36:

- **Invariant #9 (role-pack user edits as overrides).** The capability backfill lives in the `strategia-official` pack. If a user overrides a role (today: a user-space copy under their own pack directory), the override's `capabilities: [...]` block wins. Upstream pack updates never clobber user customizations. The backfill is additive to the Strategia pack, not destructive to user overrides.
- **Invariant #6 (events table is append-only).** No new event types. Taxonomy and backfill are build-time contracts; runtime remains event-driven through existing channels.

Phase 6 T0 invariants §3 carries forward verbatim. M36 does not introduce new privacy tiers, new runtime strategies, new concurrency caps, new test-mode seams, new pseudo-employees, or new role levels.

---

## 5. Architectural decisions

### 5.1 Locked taxonomy — 41 capabilities across 6 categories

The `~40` target from Phase 6 T0 D15 concretizes to **41** at M36 T0. Rounded slightly over the target because the sixth category (`support`) needed six entries to cover customer success, technical writing, technical support, content marketing, sales, and developer relations without collapsing distinct role functions.

**`engineering` (10):** `backend_engineering`, `frontend_engineering`, `mobile_engineering`, `data_engineering`, `ml_engineering`, `devops`, `site_reliability`, `security_engineering`, `qa_engineering`, `api_design`.

**`product` (7):** `product_management`, `product_strategy`, `roadmap_planning`, `requirements_analysis`, `user_research`, `feature_prioritization`, `product_analytics`.

**`design` (5):** `ux_design`, `ui_design`, `visual_design`, `interaction_design`, `design_systems`.

**`operations` (7):** `project_management`, `people_management`, `process_improvement`, `financial_operations`, `legal_compliance`, `hr_operations`, `vendor_management`.

**`strategy` (6):** `executive_leadership`, `business_strategy`, `market_analysis`, `partnerships`, `fundraising`, `corporate_development`.

**`support` (6):** `customer_success`, `technical_writing`, `technical_support`, `content_marketing`, `sales`, `developer_relations`.

The enum is **locked at M36 T0** — additions in later milestones require a retrospective-driven amendment (mirrors M32's locked 4-weight signature). Implementation (M36 T1+) lands the literal strings in `packages/shared-types/src/capabilities.ts`.

### 5.2 Case sensitivity — lowercase-snake_case (Q1 resolved)

Phase 6 T0 §9 Q1 asked whether capabilities should be case-sensitive. **Decision: case-sensitive, lowercase-snake_case convention** (e.g., `backend_engineering`, not `Backend-Engineering` or `backend_eng`).

Rationale:
- **Strict equality at parse time.** No runtime string normalization, no locale-sensitive comparison, no accidental duplicates through case drift.
- **IDE autocomplete friendliness.** String-literal unions in TypeScript give devs typed autocomplete on the exact strings; mixed-case hurts this.
- **Grep-friendly.** Every reference to `backend_engineering` in the codebase is literally `backend_engineering` — no variants to search for.
- **Consistency with existing shared-types conventions.** `CopilotCategory` is `'operational' | 'cost' | 'org' | 'workflow' | 'anomaly'` — all lowercase. Capabilities follow the same house style with snake_case for readability on multi-word identifiers.

### 5.3 Capabilities live in frontmatter, not a DB table (D16 reaffirmed)

Phase 6 T0 D16 — capabilities live in role.md frontmatter, not a new database table — carries into M36 without modification. Frontmatter is:

- **The source of truth for role-pack distribution.** Shipping role-packs to users is a file-system operation; a parallel DB table would require sync logic on pack install/update/uninstall.
- **The natural host for override contracts.** Invariant #9 (user edits as overrides) works at the frontmatter level. A DB table would fragment override state across frontmatter + row.
- **Queried via `roleLoader.getCapabilities(roleId)`.** Consumers never touch files directly; the loader caches the parsed tree per-company with the existing role-pack cache keying.

### 5.4 Validation — zero capabilities is a hard error

Load-time validation in the `role-schema` parser:

1. **Missing `capabilities` field** → if the pack is the `strategia-official` pack (signature-verified), HARD ERROR. If the pack is user-space or community (future), WARNING — back-compat for non-Strategia packs authored before M36.
2. **Empty `capabilities: []`** → HARD ERROR regardless of pack source. Authoring "a role with no capabilities" is semantically meaningless for the downstream role-fit surface.
3. **Unknown capability string** → HARD ERROR (role-pack parse fails, role is not loaded). The enum is closed.
4. **Duplicate capability** → dedup + WARNING. Silent dedup would mask copy-paste drift; hard error is user-hostile for a recoverable author mistake.
5. **Non-string array element** → HARD ERROR (TypeScript contract violation).

Hard errors bubble up through the existing `roleLoader.reload()` surface and land as structured logs in the main-process console. The Strategia-X seed — which runs on first boot (migration 0000-0012 chain + `seedIfEmpty()`) — fails loudly if the pack is broken, not silently.

### 5.5 Backfill strategy — role-by-role, category-first

Implementation order in M36's (future) T1+ work:

1. **Officer roles (5):** assign `executive_leadership` + category-appropriate secondaries (CEO gets `business_strategy` + `fundraising`; CTO gets `executive_leadership` + one engineering capability spanning architecture; CFO gets `financial_operations`; CMO gets `content_marketing` + `partnerships`; CPO gets `product_strategy`).
2. **Senior Management (7):** VP-level roles get primary-function capability plus one adjacent (VP Engineering → `backend_engineering` + `people_management`; VP Product → `product_management` + `roadmap_planning`; etc.).
3. **Management (8):** individual-function managers get 2–3 capabilities aligned to their function.
4. **Supervisor (5), Lead (5):** 2–3 capabilities, narrower scope.
5. **IC (25):** 1–2 capabilities — deep, not wide. A Senior Fullstack Engineer carries `backend_engineering` + `frontend_engineering`; a Staff ML Engineer carries `ml_engineering` alone.
6. **System roles (2):** `system-agent` carries `requirements_analysis` + `product_analytics` (it is a research + reporting role). `system-copilot` carries `product_analytics` + `process_improvement` (it is a pattern-detection + advisory role). System roles are **not** user-facing in the hire dialog (is_system filter-sweep from M31 still applies); capabilities on system roles feed the copilot service's future ability to self-score against work-types (M38 consideration — not an M36 deliverable).

Implementation authors one role at a time, commits atomically per role (or per level cluster if no surprises), and re-signs the pack once at the end (or at each cluster boundary if signature regeneration is cheap enough to amortize — measured at M36 T1).

### 5.6 Categorization rubric — what earns a capability

A role earns a capability if the role's Strategia role.md body explicitly describes owning or leading that capability's function. Categorization is **not inferred from title alone** — the role body is the canonical source. Worked examples:

- A `Senior Product Designer` with "leads UI design, contributes to UX research, owns visual design system" in the Responsibilities section earns `{ui_design, ux_design, visual_design, design_systems}` — four capabilities. If the same role says "specializes in UI design," it earns `{ui_design}` only.
- A `Chief Revenue Officer` with "owns sales strategy, drives partnerships, oversees customer success" earns `{sales, partnerships, customer_success, executive_leadership}` — four.
- A `Staff Backend Engineer` with "deep Python expertise, owns API contracts, partners with infra" earns `{backend_engineering, api_design}` — two.

The rubric is **subtractive, not additive** — if the role body does not describe the function, the capability is not assigned. This prevents the title-keyword drift that M32's current heuristic suffers from.

### 5.7 Role-pack versioning — minor bump

The `strategia-official` pack is currently at version `1.0.0` (Phase 2 baseline). M36 is an **additive** schema extension — the `capabilities` field is new, but existing parsers that don't know about it are not broken by its presence (role.md is YAML-frontmatter; unknown keys are silently ignored by legacy parsers).

Version bump: `1.0.0` → `1.1.0`. Not `2.0.0`. Rationale:
- Older Team-X versions (pre-M36) loading a post-M36 pack still work — they ignore the new field.
- Post-M36 Team-X loading a pre-M36 pack fails with HARD ERROR on the `capabilities` missing check (§5.4 rule 1).
- The second case is the reason for the bump — it is a compatibility-relevant change, not a breaking API change. Minor bump is the semver-correct call.

The pack version lives in `role-packs/strategia-official/pack.json` (file exists as of M8). Re-signing at pack-version bump time is handled by the existing M27 `pack-signature.ts` surface.

### 5.8 Source-string-audit test for M36 exit

Extending the M35 T3 / T8 / T9 / T10 lineage: M36 ships a new source-string-audit unit test — `capabilities-taxonomy-marker.test.ts` — pinning (a) the literal category names (`engineering` / `product` / `design` / `operations` / `strategy` / `support`), (b) the exact count (41), (c) three representative capability literals (one per the first three categories). If a future task silently renames a category or changes the capability count, this test fires at CI time.

Lineage is now 5-deep (M35 T3/T8/T9/T10 → M36). At M41 T10 it compounds to 6-deep with the Phase 6 COMPLETE marker.

---

## 6. Success criteria

M36 is complete when all six conditions are met simultaneously:

1. **Taxonomy authored.** `packages/shared-types/src/capabilities.ts` exports `Capability` (string-literal union of 41), `CAPABILITY_LIST` (runtime array of 41), `CapabilityCategory` (6-literal union), `CAPABILITY_CATEGORY_MAP` (6-key record → Capability[]), `isCapability(s)` type guard. All 41 strings match §5.1 verbatim.
2. **Parser validates.** `role-schema` parser rejects unknown capabilities, rejects zero capabilities on Strategia pack, warns on duplicates, dedupes silently after warning. Unit tests cover every path.
3. **57 roles backfilled.** Every role.md under `role-packs/strategia-official/roles/` has a non-empty `capabilities: [...]` frontmatter field. Backfill audit sweep passes — every capability in every role is in `CAPABILITY_LIST`; every category has at least one role carrying a capability from it.
4. **Pack re-signed.** `role-packs/strategia-official/pack.json` version bumped `1.0.0` → `1.1.0`; Ed25519 signature re-generated via the M27 signing surface.
5. **Tests green.** Unit test count ~1220 (+50 from 1169). Typecheck clean across 6 packages. 0 lint errors / ≤24 warnings. E2E unchanged at 12 cases / 11 specs (M36 adds no renderer surface).
6. **No runtime regression.** Live `decompose_project` / `delegate_subtask` against the seeded Strategia-X company produces **byte-identical output** to the Phase 5 baseline. `computeRoleFit` still reads `title + level`; capabilities are dormant until M37 consumes them. This is the proof that M36 is additive-only.

---

## 7. References

- [Phase 6 design doc](./2026-04-20-team-x-phase-6-capabilities-evidence.md) — §5 (M36 row), §7 (D15 + D16), §9 (Q1).
- [Phase 5 M32 plan doc](./2026-04-15-team-x-phase-5-m32-task-planner.md) — §7.4 locked 4-weight signature (M36 does not touch).
- [Phase 5 retrospective](./2026-04-19-team-x-phase-5-retrospective.md) — §6.5 (seed #5, capabilities frontmatter — M32 deferred 4×).
- [Phase 5 design doc](./2026-04-13-team-x-phase-5-intelligence-layer.md) — §13 Decisions Log D1–D14.
- [M34 copilot UI plan doc](./2026-04-18-team-x-phase-5-m34-copilot-ui.md) — pure-helpers `.ts` + component `.tsx` split pattern (carries forward for any M36 renderer extensions that land later).
- [M35 Demo + Hardening plan doc](./2026-04-19-team-x-phase-5-m35-demo-hardening.md) — T0–T10 shape; source-string-audit test lineage inherited here.
- `CLAUDE.md` — architectural invariants 1–11; "Working with role packs" section (executive voice, frontmatter fields, template variables, semver rules).
- `role-packs/strategia-official/roles/system/system-agent.md` + `system-copilot.md` — two `is_system = 1` roles; M36 backfills both.

---

## 8. Handoff — reconciled state

M36 T1+ no longer opens from this document. The expected follow-up implementation was completed by the earlier Phase 6 capability/role-fit commit `26d07df` and reconciled by M37-R.

Delivered surfaces:
- Shared-types capability taxonomy + marker tests.
- Role-schema parser validation + official-pack backfill audit.
- Official 57-role capabilities backfill + pack version/signature update.
- Loader/scorer consumption surface used by M37 role-fit v2.

Atomic + ledger commit cadence restored at M35 T1 and held through Phase 5 exit is carried forward verbatim: one atomic `feat(m36):` / `test(m36):` / `docs(m36):` commit per task + one `chore(loki): M36 T<N> — commit ledger (<sha>)` follow-up. No squashed multi-task commits.

---

*End of M36 plan doc. M36 is reconciled as shipped; M38 is the next new Phase 6 implementation milestone after M37-R closes.*
