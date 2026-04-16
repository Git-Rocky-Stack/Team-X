# Loki Continuity — Phase 5, **M33 in progress** (Copilot Service — T0–T4 shipped); M32 (Task Planner) complete

## M33 T4 SHIPPED — 2026-04-16 (CopilotAnalyzerService — periodic scheduler + LLM + dedup + expiry)

**Task:** M33 T4 — headline task. CopilotAnalyzerService (periodic + event-triggered scheduler) + CopilotEventTrigger (30s-debounced) + migration 0012 adding `runs.kind` + 3 EventType additions + `listStale` sibling on CopilotInsightsRepo + optional `kind` on StartRunInput. Structure mirrors M31 AgenticLoopService — pause-aware providerRouter wrapper, AbortController-driven stop with canceled-status coercion, runs-table row per tick with `kind='copilot'`, terminal bus-event discipline (exactly one `copilot.analyzed` per tick).
**Commit:** `e672973` — `feat(m33): M33 T4 — copilot analyzer service + pause-aware scheduler`.
**Plan reference:** [M33 plan T4 §](../docs/plans/2026-04-16-team-x-phase-5-m33-copilot-service.md).

### Metrics delta

| Metric | Pre-T4 | Post-T4 | Delta |
|---|---:|---:|---:|
| Unit tests | 1060 | **1074** | **+14** (exact match to plan target) |
| E2E specs | 8 | 8 | 0 (T9 ships the spec) |
| Lint errors | 0 | 0 | 0 |
| Lint warnings | 24 | 24 | 0 (pre-existing intelligence/nlu warnings; under M33 ≤34 budget) |
| Typecheck across 6 packages | clean | clean | — |
| Files touched | — | 11 (+2144 / −1) | — |

### What shipped (one feat commit, eleven files)

1. **`apps/desktop/src/main/db/migrations/0012_runs_kind.sql` (NEW).** `ALTER TABLE runs ADD COLUMN kind text NOT NULL DEFAULT 'work'` — no CHECK (TS union enforces), default backfills all existing rows to 'work'. Pre-M33 had no `kind` column; migration ADDS rather than extends an enum. Journal entry idx 12.
2. **`apps/desktop/src/main/db/schema.ts` — `runs.kind` field + `RunKind` union** (`'work' | 'agentic' | 'copilot'`) exported for writers.
3. **`apps/desktop/src/main/db/repos/runs.ts` — `StartRunInput.kind` optional** (defaults 'work'); `start()` passes through.
4. **`apps/desktop/src/main/db/repos/copilot-insights.ts` — NEW `listStale(now)` non-mutating sibling** to `expireStale`. Analyzer snapshots rows for per-row `copilot.expired` emission BEFORE physical delete. Preserves T1's count-return contract.
5. **`packages/shared-types/src/events.ts` — +3 EventType** (`copilot.insight`, `copilot.analyzed`, `copilot.expired`) + `CopilotInsightPayload` + `CopilotAnalyzedPayload` + `CopilotExpiredPayload` + `CopilotCategory` + `CopilotSeverity` + `CopilotAnalyzedReason` unions.
6. **`apps/desktop/src/main/services/copilot-analyzer-service.ts` (NEW, ~580 LOC).** The headline file.
   - Factory → `{ start, stop, stopAll, tick, getLastAnalysisAt, restart }`.
   - Pure exports for unit tests: `buildAnalysisPrompt`, `summarizeEventWindow`, `summarizeActiveInsights`, `extractJsonArray`, `parseDrafts`.
   - Zod `InsightDraftSchema` with strict enums + title ≤200 / body ≤2000 / `expiresInHours` clamped [1,168].
   - **Pause-aware wrapper `waitUntilUnpaused`** polls `orchestrator.isCompanyPaused` every `pauseGatePollMs` (default 250ms); AbortController honored.
   - **Tick lifecycle:** settings gate → system-copilot resolution → pre-tick pause check → expiry sweep (listStale → per-row copilot.expired → expireStale) → prompt build → resolveComplete → runs.start({kind:'copilot'}) → AbortController per tick → provider call → Zod parse → one-shot nudge retry → dedup pass (emit copilot.insight only on insert) → runs.finish → terminal copilot.analyzed.
   - **`stopAll()`** for will-quit teardown (companiesRepo not in shutdown closure scope).
7. **`apps/desktop/src/main/services/copilot-analyzer-service.test.ts` (NEW, 12 tests).** Determinism (2), Zod+nudge (3), pause (2), dedup (2), expiry (2), abort (1).
8. **`apps/desktop/src/main/services/copilot-event-trigger.ts` (NEW, ~140 LOC).** 30s-debounced per-company dispatcher. `reasonForEvent` pure helper. Timer resets on new signal (debounce not throttle). `ticket.closed` + `goal.progressChanged` future-ready.
9. **`apps/desktop/src/main/services/copilot-event-trigger.test.ts` (NEW, 2 tests).** Single-signal debounce; coalesce with latest-reason + payload predicate filter on `agentic.failed`.
10. **`apps/desktop/src/main/index.ts` — composition root wiring (+180 LOC).** New imports, module-scope handles, `copilotInsightsRepo` instantiation, analyzer+trigger after agenticLoopServiceInstance, will-quit early-null-state branch + shutdown (`trigger.stop()` + `analyzer.stopAll()`).

### Design calls (documented for M34 + retro)

- **Migration 0012 ADDS `kind` column, not extends an enum.** No pre-M33 `kind` column; no SQLite CHECK-swap precedent. Default 'work' backfills; M31 agentic rows remain 'work' today (candidates for future backfill when Telemetry grows per-kind filter).
- **`listStale` is a non-mutating sibling.** Preserves T1's tested `expireStale` count-return; only T4 needs per-row attribution.
- **CopilotEventTrigger is a SEPARATE file.** Keeps T3's window pure-accumulator. Dependency direction acyclic.
- **`ticket.closed` + `goal.progressChanged` future-ready.** Zero-cost until upstream producers land.
- **`stopAll()` over per-company shutdown iteration.** `companiesRepo` isn't in the will-quit closure scope; service owns its internal state.

### Verification gates (green)

- `pnpm typecheck` — clean across all 6 workspace packages.
- `pnpm lint` — 0 errors, 24 warnings (baseline ≤34).
- `pnpm test` — 1074/1074 pass in 17.09s. 92 test files.

### Follow-ups for downstream tasks

- **T5** — 4 `copilot.*` IPC channels + preload bridge + CopilotInsight wire type (distinct from CopilotInsightRow). +8 unit tests.
- **T6** — `copilot.ask` via AgenticLoopService.start with employeeId=system-copilot; new `query_copilot_insights` read-side tool.
- **T7** — 3 clamped settings keys + CopilotSection UI + analyzer.restart on setCopilot.
- **T8** — Three-tier canned copilot provider seam.
- **T9** — `copilot-service.spec.ts` E2E round-trip. +1 spec.
- **T10** — Verification gates + milestone marker + docs. ABI rebuild dance.
- **M31 backfill (deferred, M34+):** retrofit M31 AgenticLoopService to write `kind='agentic'` when Telemetry grows per-kind filter.

---

## M33 T3 SHIPPED — 2026-04-16 (rolling event window + bus subscription)

**Task:** M33 T3 — in-memory per-company rolling buffer feeding T4's CopilotAnalyzerService. Bounded deque (100 events), FIFO eviction, warm-start hydration from the append-only events log. Subscribes to the same event bus M29's RAG indexer consumes. Ships the read-side accumulator that the T4 analyzer's prompt builder will iterate.
**Commit:** `c6b40ae` — `feat(m33): M33 T3 — rolling event window + bus subscription`.
**Plan reference:** [M33 plan T3 §](../docs/plans/2026-04-16-team-x-phase-5-m33-copilot-service.md).

### Metrics delta

| Metric | Pre-T3 | Post-T3 | Delta |
|---|---:|---:|---:|
| Unit tests | 1052 | **1060** | **+8** (exact match to plan target) |
| E2E specs | 8 | 8 | 0 (T9 ships the spec) |
| Lint errors | 0 | 0 | 0 |
| Lint warnings | 24 | 24 | 0 (pre-existing in intelligence/nlu; well under M33 ≤34 budget) |
| Typecheck across 6 packages | clean | clean | — |
| Files touched | — | 3 (+403 / −0) | — |

### What shipped (one feat commit, three files)

1. **`apps/desktop/src/main/services/copilot-event-window.ts` (NEW, 169 lines).** Pure subscriber-plus-accumulator; no I/O of its own beyond the bus handle + eventsRepo hydration query.
   - `createCopilotEventWindow(deps: { bus, eventsRepo })` factory returning `{ start, stop, snapshot, clear }` — mirrors the rag-indexer M29 factory shape for consistency.
   - `MAX_EVENTS_PER_COMPANY = 100` as a **private module constant** with an inline comment: "NOT a user-facing setting in M33 — if Rocky wants this tunable, it becomes a new settings key in M34+." Locked to prevent premature surface expansion.
   - `EXCLUDED_EVENT_TYPES = new Set<EventType>(['token.delta'])` — applied at both push AND hydration boundaries. Streaming token deltas fire per character (~50–500 events per chat turn); admitting them would pin the 100-event window to streaming noise and evict every meaningful signal the analyzer cares about. Deliberate filter, documented in §2 design notes.
   - `push(event)` — internal handler subscribed to `bus.subscribe(push)` on `start()`. Gets the per-company deque from a `Map<string, DashboardEvent[]>`, `.push(event)` then `.shift()` on overflow (FIFO eviction).
   - `snapshot(companyId): DashboardEvent[]` — returns a **defensive copy** via spread (`[...deque]`). Rationale in §3 design notes: T4's analyzer will iterate the snapshot for 100–500ms while building prompts; returning the internal array by reference would expose a classic use-after-mutate race with live push+shift. Copy cost is trivial (≤100 events × ~hundreds of bytes).
   - **Warm-start hydration on first snapshot per company** — if the company is not in the `hydrated: Set<string>` flag set, call `eventsRepo.listByCompany(companyId, undefined, MAX_EVENTS_PER_COMPANY)` and reverse the newest-first result into a chronological-order prefix. Merge with any live events pushed between `start()` and the first `snapshot()` (live events go AFTER history — chronologically newer). Re-bound on overflow. Set the hydrated flag so subsequent snapshots never re-query.
   - `clear(companyId): void` — removes the deque AND the hydrated flag so the next snapshot re-hydrates. **NOT currently wired to companies.archive** — that IPC does not exist in the codebase today (companies repo has create/getById/getBySlug/list/setStatus only). Wiring deferred to the milestone that adds `companies.archive`; flagged as a T3 follow-up in the Loki ledger.
   - `parseRow(EventRow): DashboardEvent` helper — **duplicated** from the module-private `parseRow` in `main/orchestrator/event-bus.ts`. Documented as duplication-with-intent; extracting to a shared module for one helper would widen the events surface unnecessarily. Flagged for extraction (`db/repos/events.ts` as `parseEventRow`) if a third consumer appears.
   - `__TEST_INTERNALS__ = { MAX_EVENTS_PER_COMPANY, EXCLUDED_EVENT_TYPES } as const` — re-exports for test access without widening the public API. Marked "NEVER depend on this from production code" in JSDoc.

2. **`apps/desktop/src/main/services/copilot-event-window.test.ts` (NEW, 195 lines, 8 tests).** Full coverage of the T3 acceptance surface.
   - **Bounds (3 tests):** MAX-1 admitted without eviction (`toHaveLength(MAX - 1)`); exact MAX at boundary (`toHaveLength(MAX)`); MAX+5 overflow drops ids 0-4 and preserves chronological suffix — asserts `snap[0].id === 'e-5'` and `snap[snap.length-1].id === 'e-${MAX+4}'`.
   - **Per-company isolation (2 tests):** pushes to `co-A` do not appear in `co-B` snapshot; `clear('co-A')` leaves `co-B` window intact (`co-A` returns `[]`, `co-B` still `['b-1']`).
   - **Warm-start hydration (2 tests):** first snapshot hydrates from `eventsRepo.listByCompany` in chronological order (newest-first → reversed to oldest-first), asserts `listByCompany` called with `(companyId, undefined, MAX)`; second snapshot returns a defensive copy AND does NOT re-hydrate — combined test that mutates `s1.length = 0` + `s1.push(bogus)` and asserts `s2 === ['h-1']` with `listByCompany` still at call count 1.
   - **Archive clear (1 test):** `clear(companyId)` empties the window AND re-hydrates on next snapshot; asserts post-clear snapshot returns `['h-1']` with `listByCompany` call count now 2.
   - Test helpers: `FakeBus` class (implements `CopilotEventWindowBus`, in-memory `Set<Listener>`), `makeEventsRepo(rows)` factory with a `vi.fn()`-spied `listByCompany`, `makeEvent` + `makeEventRow` fixtures with sensible defaults.

3. **`apps/desktop/src/main/index.ts` composition root (+39 lines).**
   - Imports `createCopilotEventWindow` and `type CopilotEventWindow` from the new service module.
   - `copilotEventWindowInstance: CopilotEventWindow | null = null` module handle declared alongside `ragIndexerInstance` for shutdown-time ordering consistency.
   - Instantiation immediately after `ragIndexer.start()` with the same `bus` + `eventsRepo` dependencies — both are pure bus subscribers and ordering relative to each other is irrelevant.
   - `will-quit` null-state short-circuit extended to include `copilotEventWindowInstance === null`.
   - `will-quit` shutdown chain: stop the window AFTER the rag indexer but BEFORE the orchestrator drain. Same rationale as the rag indexer — stopping subscribers before the orchestrator drain means any final drain-phase events simply have no listener, preventing in-flight work from landing mid-teardown.

### Architectural seams added by T3 (active for T4+)

- **Bus-subscriber-plus-accumulator pattern template.** The `createCopilotEventWindow` factory shape is a copy-from template for any future bounded per-company accumulator (metrics aggregator, alerting window, cache warming). Factory takes `{ bus, eventsRepo }`, returns `{ start, stop, snapshot, clear }`, with warm-start + defensive-copy built in.
- **Private-const-over-setting discipline.** Starting a tunable as a locked private constant keeps the initial surface minimal. T4 can reach for the same discipline for its 30s event-trigger debounce window — a magic number in a single module beats a settings round-trip every cycle.
- **Parse-row duplication-with-intent documented.** Rather than prematurely widening `events.ts` for one helper, T3 duplicates `parseRow` and leaves a commented-in extraction signal. Future contributors have a clear breadcrumb for when to promote the helper.
- **Deferred-wiring follow-up pattern.** `clear(companyId)` shipped as a public method + tested, wiring left for a later milestone. Clean separation of "method exists + tested" from "production call site exists" — lets T3 land without scope creep into companies.archive.

### Verification gates passed

- `pnpm exec biome check` on the 3 touched files — 0 errors, 0 warnings (post `--write` organize-imports autofix).
- `pnpm -r typecheck` — clean across all 6 workspace packages.
- `pnpm test` on the new test file — **8/8 pass in 9ms** (533ms total with transform+setup overhead).
- `pnpm test` full suite — **1060/1060 pass** in 14.50s. +8 from T2 baseline, exact match to plan target.
- `pnpm lint` full — 0 errors / 24 warnings (unchanged from T2; well under M33 ≤34 budget).
- Atomic commit `c6b40ae` per M30/M31/M32/M33 ledger pattern.

### Invariants preserved

- **#1 (renderer is a pure view):** T3 touches only main-process code. Zero renderer edits.
- **#2 (orchestrator is the only scheduler):** the event window is NOT a scheduler — it's a write-heavy accumulator that stores events for on-demand snapshot consumption. T4's analyzer will be the scheduler (setInterval + event-triggered), and it will observe `orchestrator.isCompanyPaused()` per M31 precedent.
- **#4 (storage is SQLite + filesystem vault):** the in-memory buffer is ephemeral by design. Warm-start hydrates from the authoritative append-only events table on reboot — no persistence layer of its own.
- **#6 (events table is append-only):** the window READS from the events table (via `listByCompany`) and NEVER writes to it. All write paths remain through the bus `emit()` → repo `append()` chain.
- **#7 (zero phone-home):** no new network calls.
- **#11 (IPC mutations emit bus events):** T3 adds no new IPC and does not mutate any state that would need a bus event. The window is a consumer only.

### Gotchas captured this session

- **`companies.archive` IPC doesn't exist yet.** The M33 plan doc's T3 acceptance said "wired to companies.archive (extend the existing archive handler)". A pre-edit grep swept for the archive path and found NOTHING — companies repo has create/getById/getBySlug/list/setStatus only; `archived_at` appears in one test fixture and no production code. Path forward: ship `clear()` as a tested public method, defer production wiring to the milestone that adds the archive IPC. Documented in the source file §5 design notes AND in the T3 follow-up ledger entry so the next contributor sees it immediately.
- **`events.repo.listByCompany` JSDoc diverges from implementation on `token.delta` filtering.** The JSDoc says "Excludes token.delta events since they are high-frequency streaming noise". The SQL WHERE clauses only filter by companyId + cursor — no eventType filter. Stale comment; not a T3 concern to fix (it's a pre-existing issue in the events repo). CopilotEventWindow applies its own `EXCLUDED_EVENT_TYPES` filter at the window boundary, which is where the analyzer cares about it anyway. Leave the stale JSDoc untouched; if it were removed, the intent signal would vanish.
- **Newest-first vs oldest-first confusion on warm-start merge.** `listByCompany` returns `DESC createdAt` (newest first); the deque needs oldest-first so analyzer prompt builders read chronologically. Warm-start reverses history with a `for (let i = historical.length - 1; i >= 0; i--)` and appends `live` events AFTER (they are chronologically newer). Confirmed by the "first snapshot hydrates in chronological order" test expecting `['h-1', 'h-2', 'h-3']` where `h-1.createdAt === 100`, `h-2 === 200`, `h-3 === 300`.
- **`TokenDelta` vs `EventType` set membership.** `EXCLUDED_EVENT_TYPES` is `ReadonlySet<EventType>` built from a tuple — NOT a string array. TypeScript narrowing requires the Set generic + explicit construction so `EXCLUDED_EVENT_TYPES.has(event.type)` doesn't widen. Minor type correctness, matters for future exhaustive-switch consumers.
- **Defensive-copy test combined with re-hydration test saves one test slot.** Rather than writing separate "snapshot returns defensive copy" and "second snapshot does not re-hydrate" tests, combined them: mutate `s1`, then assert `s2` is untouched AND `listByCompany` call count stays at 1. Both invariants verified in one test without padding the count. Kept total at +8 (exact plan target).
- **Biome organize-imports is mandatory.** First biome check failed with 3 organize-imports errors across the 3 files (both new files + index.ts). `biome check --write` resolved all three automatically. Future lint-flagged PRs should run `--write` first before manual investigation — the tool fixes 90% of style surface automatically.

### Patterns reinforced

- **Pre-edit grep sweep catches missing assumptions.** The T3 plan assumed `companies.archive` existed; the sweep proved it didn't, which became the single most important discovery of the session. 5 minutes of grep saved a scope-creep commit. Always grep before wiring.
- **Factory pattern with deps injection.** `createCopilotEventWindow(deps)` mirrors M29's `createRagIndexer(deps)` and M31's `createAgenticLoopService(deps)`. Composition root wires the real dependencies; tests wire fakes. Zero module-level singletons means test isolation is trivial.
- **Type-exported deps interfaces for mockability.** `CopilotEventWindowBus` + `CopilotEventWindowEventsRepo` are exported interfaces that test helpers implement. No need to reach for `vitest.mock` on the full bus or events-repo module — the interfaces are narrow enough to hand-roll a fake.
- **Atomic per-task commit + Loki ledger commit.** T3 shipped as commit `c6b40ae`; this ledger commit mirrors M30/M31/M32 cadence.

### Follow-ups queued (post-T3)

- **T3 FOLLOW-UP:** Wire `CopilotEventWindow.clear(companyId)` into `companies.archive` once that IPC is added. Current state: public method exists + tested, production path never calls it. Zero memory leak risk today (companies cannot be archived). Closes once archive IPC lands.
- **No code debt carried into T4.** The warm-start + defensive-copy + exclusion filter are all orthogonal to T4's analyzer logic; T4 consumes `snapshot(companyId)` and the window handles the rest.

### Next Session Startup Checklist (M33 T4 — headline task, full session)

1. `git log --oneline -n 10` — confirm head is at `chore(loki): M33 T3 — commit ledger (c6b40ae)`.
2. Read `.loki/queue/current-task.json` — it's been rewritten for **M33-T4** (CopilotAnalyzerService — biggest task of M33). Goal, acceptance (15 items), filesTouched (8), testsDelta (+14 unit), extensive notes.
3. Read `.loki/queue/pending.json` — `tasksShipped: 4`; T4 is head-of-queue (headline task).
4. Read `.loki/state/orchestrator.json` — `current.unitTests: 1060`, `asOfTask: T3`, `asOfTaskCommit: c6b40ae`.
5. **Read Phase 5 design doc §8.4 (analyzer prompt contract), §8.5 (window consumer), §8.6 (bus event catalog), §8.7 (dedup + expiry semantics) IN FULL before the first edit.** T4 is the most specification-driven task of M33.
6. Read `apps/desktop/src/main/services/agentic-loop-service.ts` in full — T4's pause-aware wrapper, AbortController cancel, canceled-status coercion, and runs-table integration all copy this shape.
7. Pre-edit grep sweep:
   - `grep -rn "runs.kind\|'agentic'" apps/desktop/src/main/db/migrations` — identify the M31 migration that added 'agentic' to runs.kind; copy its shape for migration 0012.
   - `grep -rn "isCompanyPaused\|POLL_INTERVAL_MS" apps/desktop/src/main/services` — find the M31 pause-gate constants to reuse.
   - `grep -rn "switch.*event.type\|event\\.type ===" apps/desktop/src` — exhaustive-switch sites that may need new copilot.* arms.
8. Migration 0012: `pnpm -F @team-x/desktop exec drizzle-kit generate --name copilot_runs_kind`. REVIEW the generated SQL before commit — SQLite CHECK-constraint enum extension requires a temp-table swap.
9. ABI rebuild dance BEFORE first vitest run: `cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npx node-gyp rebuild --release` + same for keytar. Migration 0012 changes schema; may need dev DB nuke at `%APPDATA%/Team-X/team-x/team-x.sqlite` if the CHECK swap can't apply to an existing DB.
10. Consider a subagent pass for `buildAnalysisPrompt` scaffolding (Explore agent reads §8.4 + M29 retriever + M31 AgenticLoopService, returns a deterministic prompt template).
11. Implement analyzer + event-trigger in separate files (do NOT extend T3's window with debouncer — keep T3 pure).
12. 14 unit tests per acceptance breakdown.
13. Atomic commit: `feat(m33): M33 T4 — copilot analyzer service + pause-aware scheduler`.
14. Ledger commit: `chore(loki): M33 T4 — commit ledger (<sha>)`.

---

## M33 T2 SHIPPED — 2026-04-16 (system-copilot pseudo-employee + role card)

**Task:** M33 T2 — second `is_system=1` pseudo-employee row per company alongside M31's `system-agent`. Hidden from every human-facing employee surface by inheriting the same `is_system=1` + `level='system'` gating the agent uses. Ships the identity layer that T4's CopilotAnalyzerService will own (`actor: system-copilot`) and that T6's `copilot.ask` will route against (`employeeId: system-copilot`).
**Commit:** `4ce9d3e` — `feat(m33): M33 T2 — system-copilot pseudo-employee + role card`.
**Plan reference:** [M33 plan T2 §](../docs/plans/2026-04-16-team-x-phase-5-m33-copilot-service.md).

### Metrics delta

| Metric | Pre-T2 | Post-T2 | Delta |
|---|---:|---:|---:|
| Unit tests | 1048 | **1052** | **+4** (exact match to plan target) |
| E2E specs | 8 | 8 | 0 (T9 ships the spec) |
| Lint errors | 0 | 0 | 0 |
| Lint warnings | 24 | 24 | 0 (pre-existing in intelligence/nlu; well under M33 ≤34 budget) |
| Typecheck across 6 packages | clean | clean | — |
| Files touched | — | 6 (+563 / −62) | — |

### What shipped (one feat commit, six files)

1. **`role-packs/strategia-official/roles/system/system-copilot.md` (NEW, 117 lines).** F10 role card per the CLAUDE.md role-pack standard.
   - Frontmatter: `id: system-copilot`, `name: Team-X Copilot (analyzer)`, `level: system`, `reports_to: []`, `manages: []`, `preferred_model_tier: mid`, `preferred_providers: [ollama, anthropic]`, `fallback_providers: [openai, groq]`.
   - `tools_allowed`: M31 read-only set (`query_employees`, `query_tickets`, `query_projects`, `query_meetings`, `query_vault`, `query_events`) + `query_copilot_insights` (T6 ships the tool; T2 just declares the role's allowance).
   - `tools_denied`: hard lock against write-side mutations — `decompose_project`, `delegate_subtask`, `review_deliverable` (M32's write-side toolkit), `send_message_to_colleague` (built-in from M11), plus `shell` / `filesystem` / `network` (never allowed for any read-only role, declared explicitly as belt-and-suspenders).
   - Body emphasizes proactive monitoring (vs reactive Q&A which is system-agent's lane) and the JSON-at-analysis-time / prose-at-ask-time separation: the analyzer emits structured `InsightDraftSchema` (T4), the copilot.ask path emits grounded prose (T6).

2. **`packages/shared-types/src/roles.ts` (NEW, 54 lines).** The single source of truth for system-role identity checks.
   - Exports `SYSTEM_AGENT_ROLE_ID` and `SYSTEM_COPILOT_ROLE_ID` as typed string literals.
   - Exports `SYSTEM_ROLE_IDS` as an `as const` tuple so future iterators don't miss a role.
   - Exports `isSystemRoleId(roleId: string): boolean` predicate that point-check call sites use instead of magic-string equality. Future-proofing for a hypothetical third system role (e.g. M34+ system-notifier) — one import, zero grep sweep.
   - Rationale: the `is_system` column is the authoritative runtime filter (it's what `listVisibleByCompany` + `agentic-tools-write` scorer query), but UI call sites that need to DISTINGUISH between system roles (M34 sidebar will label "Copilot" vs "Agent" differently) need the role_id to branch. The predicate + constants keep those branches type-safe.

3. **`apps/desktop/src/main/services/system-agent-bootstrap.ts` (+185 / -62).** Extended with `ensureSystemCopilot` + refactored around a shared internal.
   - New exports: `SYSTEM_COPILOT_ROLE_ID`, `SYSTEM_COPILOT_ROLE_PACK_ID`, `SYSTEM_COPILOT_DISPLAY_NAME` constants.
   - New public `ensureSystemCopilot(db, companyId, deps)` — idempotent SELECT-then-INSERT into `employees` with `is_system = 1` + `role_id = SYSTEM_COPILOT_ROLE_ID`. Mirrors `ensureSystemAgent` shape exactly; callers just swap the role constant.
   - Internal refactor: both `ensureSystemAgent` and `ensureSystemCopilot` now delegate to a shared `ensureSystemEmployee()` helper that owns the idempotency guard, the missing-spec guard, the wrong-level guard, and the INSERT-with-returning. Prevents drift between the two ensure functions as we add invariants.
   - Legacy type aliases kept: `EnsureSystemAgentArgs = EnsureSystemEmployeeArgs` and `EnsureSystemAgentResult = EnsureSystemEmployeeResult`. M31 callers of `ensureSystemAgent(args: EnsureSystemAgentArgs)` keep compiling without touching the call sites.

4. **`apps/desktop/src/main/db/seed.ts` (+46 / -0).** Seeds `system-copilot` inline immediately after `system-agent` in `seedIfEmpty`.
   - Same hardcoded-path pattern as `system-agent` — no role-loader dependency during seed (role-loader bootstraps later and filtering `level !== 'system'` means the loader would never surface these rows anyway).
   - `SeedResult` type gains `systemCopilotId: EmployeeId`.
   - Boot log now reports both ids: `[seed] bootstrapped Strategia-X company with CEO + SWE + system-agent (${systemAgentId}) + system-copilot (${systemCopilotId})`.

5. **`apps/desktop/src/main/services/system-agent-bootstrap.test.ts` (+198 / -0).** +4 new unit tests plus a shared fixture.
   - `ensureSystemCopilot fresh-create` — asserts first call inserts the row with expected role_id + is_system=1.
   - `ensureSystemCopilot idempotent re-run` — asserts second call returns the same EmployeeId without inserting a duplicate row.
   - `both system roles coexist` — asserts `ensureSystemAgent` + `ensureSystemCopilot` on the same company yields two distinct `is_system=1` rows with different role_ids.
   - `listVisibleByCompany hides both` — asserts the repo-level visibility filter excludes both system rows from the human-facing employee list.
   - `makePairLookup()` fixture — new shared test helper that returns `RoleSpec` entries for BOTH system roles; used by the fresh-create and coexist tests to keep the assertion shape uniform.

6. **`apps/desktop/src/main/db/seed.test.ts` (+25 / -14).** Two assertions updated to reflect the new post-seed invariant.
   - Total row count: 3 → 4 (CEO + SWE + system-agent + system-copilot).
   - Visible row count: 2 → 2 (unchanged; both system rows are hidden by `listVisibleByCompany`).

### Filter-sweep verification (the surprise that saved a file)

The T2 plan doc acceptance list called for edits to `employees.list`, `orgchart.get`, hire-dialog picker, delegation picker, and meeting attendees — one filter added per surface. But a pre-edit sweep proved the work was **already done** by M31 + M32 gates:

- **`packages/role-schema/src/role-loader.ts` line 267** — `listRoles()` filters `level !== 'system'`. system-copilot has `level: system` in its role card frontmatter, so the loader auto-hides it from the hire dialog's role catalog. Zero change.
- **`apps/desktop/src/main/db/repos/employees.ts` — `listVisibleByCompany`** — filters `is_system = false` (the authoritative runtime gate). system-copilot sets `is_system = 1`, so it's auto-hidden from every surface that calls `listVisibleByCompany` (employees.list IPC, orgchart.get, hire dialog's hired-employees check, delegation picker). Zero change.
- **`apps/desktop/src/main/services/agentic-tools-write.ts` line 761 + `computeRoleFit` + `scoreEmployee`** — M32 already filters `!e.isSystem` in the delegation picker AND returns 0 role-fit/score for `isSystem` candidates. system-copilot auto-scored 0. Zero change.

Net: **three would-be edits proved unnecessary, zero risk of regression, no corresponding tests needed.** The `isSystemRoleId` predicate in `packages/shared-types` is therefore future-proofing (M34 UI distinguishers) rather than a regression plug — documented as such in the T2 commit body.

### Architectural seams added by T2 (active for T3+)

- **Two-system-role pattern locked in.** Every future code path that iterates "system employees" can use `SYSTEM_ROLE_IDS` as the tuple + `isSystemRoleId()` as the predicate. No more magic-string `role_id === 'system-agent'` checks anywhere in the codebase.
- **Shared `ensureSystemEmployee()` internal.** Adding a third system role (if ever needed) is now one export + one constant + one call, not a full copy-paste of the idempotency/guard logic.
- **Legacy type aliases as a migration lever.** The `EnsureSystemAgent{Args,Result}` aliases demonstrate the pattern for renaming typed APIs without breaking downstream code — a template worth reaching for in M34+ when the agentic-loop contract inevitably needs to widen for multi-actor streams.

### Verification gates passed

- `pnpm exec biome check` on the 6 touched files — 0 errors, 0 warnings.
- `pnpm -r typecheck` — clean across all 6 workspace packages.
- `pnpm test` on the relevant vitest scopes — **1052/1052 pass**, +4 from T1 baseline, exact match to plan target.
- E2E not run this task (T3–T8 don't touch E2E; T9 runs the full E2E pass).
- Atomic commit `4ce9d3e` per M30/M31/M32/M33 ledger pattern.

### Invariants preserved

- **#1 (renderer is a pure view):** T2 touches only main-process code + packages/shared-types. Zero renderer edits.
- **#7 (zero phone-home):** no new network calls; system-copilot's role card declares `tools_allowed` for analysis but the actual LLM calls ship in T4.
- **#8 (secrets in OS keychain):** no API key handling in T2.
- **#9 (role-pack user edits are overrides):** system-copilot.md is a first-party pack role; user-override mechanism (M8+) still applies unchanged.
- **#11 (IPC mutations emit bus events):** T2 adds no new IPC; seed path already emits bus events via the existing `employees.created` → `events` table chain. Unchanged.

### Gotchas captured this session

- **Role-loader `level !== 'system'` filter is the quiet hero.** Any role card with `level: system` in its frontmatter is auto-hidden from the role catalog. Future system roles should ALWAYS set `level: system` as the first line of defense — the is_system column gates the DB-facing list, and the level gate covers the UI-side role picker.
- **Legacy type aliases beat rename cascades.** Keeping `EnsureSystemAgentArgs` + `EnsureSystemAgentResult` as type aliases to the new generic names let T2 refactor the bootstrap module without touching any M31 call site. This pattern will pay off again in M34 when the agentic-loop contract needs to widen.
- **Pre-edit sweeps prevent dead-code edits.** The filter-sweep step in the T2 plan would have generated 3 unnecessary edits to `employees.ts` / `orgchart.ts` / `hire-dialog.tsx` if taken at face value. A 5-minute grep confirmed the gates already existed and saved ~45 minutes of churn + the risk of accidentally breaking the existing gates. Always grep before edit on "add a filter" tasks.
- **`SYSTEM_ROLE_IDS as const` tuple vs string union.** Declaring the tuple `as const` makes it narrowable in TypeScript (`(typeof SYSTEM_ROLE_IDS)[number]` yields `'system-agent' | 'system-copilot'`) without a manual union maintenance. Iterator call sites get exhaustive-check support for free.
- **Seed test row-count assertions are a canary for unintended seed regressions.** The 3 → 4 update broke two `seed.test.ts` expectations — a deliberate canary that catches any accidental re-seed (e.g. a duplicate `ensureSystemCopilot` call in the bootstrap path). Keep these assertions strict, not loose (`toHaveLength(4)`, not `toHaveLength.atLeast(4)`).

### Patterns reinforced

- **Pre-flight reconnaissance via `ctx_batch_execute`.** Single batched call (10 commands + 5 queries) replaced what would have been 15+ individual Read/Grep/Bash calls for state + pending + CONTINUITY + git-log + git-show reconnaissance. Keeps context lean for the long implementation tail.
- **Atomic per-task commit + Loki ledger commit.** T2 shipped as commit `4ce9d3e`; this ledger commit is `chore(loki): M33 T2 — commit ledger (4ce9d3e)`. Mirrors M30 / M31 / M32 cadence. No co-mingling of work + ledger in a single commit.
- **Shared internal over copy-paste.** `ensureSystemEmployee` as the shared helper beats duplicated logic in `ensureSystemAgent` + `ensureSystemCopilot`. This is the same refactor shape that `buildWriteSideTools` used in M32 T2 — one internal factory, many public entry points.

### Next Session Startup Checklist (M33 T3+)

1. `git log --oneline -n 10` — confirm head is at `chore(loki): M33 T2 — commit ledger (4ce9d3e)`.
2. Read `.loki/queue/current-task.json` — it's been rewritten for **M33-T3** (rolling event window + bus subscription). Goal, acceptance (12 items), filesTouched, testsDelta (+8 unit), notes are all T3-specific.
3. Read `.loki/queue/pending.json` — `tasksShipped: 3`; T3 is head-of-queue, T4 is the biggest remaining task.
4. Read `.loki/state/orchestrator.json` — `current.unitTests: 1052`, `asOfTask: T2`, `asOfTaskCommit: 4ce9d3e`.
5. Skim `docs/plans/2026-04-16-team-x-phase-5-m33-copilot-service.md` §T3 before the first edit — confirm the file placement (`apps/desktop/` vs `packages/intelligence/`) and the `MAX_EVENTS_PER_COMPANY = 100` constant value.
6. Pre-edit grep sweep (mirror T2 discipline):
   - `grep -rn "eventsRepo.listRecent\|listRecent" apps/desktop/src/main/db/repos/events.ts` — verify the method exists; add it if missing with signature `listRecent(companyId: string, limit: number): Event[]` ordered by `created_at DESC`.
   - `grep -rn "companies.archive\|archiveCompany" apps/desktop/src/main/ipc apps/desktop/src/main/db` — identify the canonical archive path so `clear(companyId)` wires in at the right layer (IPC handler vs repo method).
   - `grep -rn "bus.subscribe\|busSubscribe" apps/desktop/src/main/services` — find the subscribe entry point (mirror whatever M29 rag-indexer / M31 agentic-tools use).
7. ABI rebuild dance BEFORE first vitest run: `cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npx node-gyp rebuild --release` + same for keytar. Skip Electron rebuild (no E2E in T3).
8. Implement T3 per acceptance list. 8 unit tests (3 bounds / 2 isolation / 2 warm-start / 1 archive-clear).
9. Atomic commit: `feat(m33): M33 T3 — rolling event window + bus subscription`.
10. Ledger commit: `chore(loki): M33 T3 — commit ledger (<sha>)`.

---

## M33 T1 SHIPPED — 2026-04-16 (migration 0011 + CopilotInsightsRepo)

**Task:** M33 T1 — schema + repo layer for Copilot insights. First code change in M33 — flips Phase 5 design doc §9 M33 row from 📋 Planned → 🚧 In progress (same commit).
**Commit:** `0a77d87` — `feat(m33): M33 T1 — copilot_insights table + repo`.
**Plan reference:** [M33 plan T1 §](../docs/plans/2026-04-16-team-x-phase-5-m33-copilot-service.md).

### Metrics delta

| Metric | Pre-T1 | Post-T1 | Delta |
|---|---:|---:|---:|
| Unit tests | 1033 | **1048** | **+15** (exact match to plan target) |
| E2E specs | 8 | 8 | 0 (T9 ships the spec) |
| Lint errors | 0 | 0 | 0 |
| Lint warnings | 24 | 24 | 0 (well under M33 ≤34 budget) |
| Typecheck across 6 packages | clean | clean | — |
| Files touched | — | 6 (+824 / −1) | — |

### What shipped (one feat commit, six files)

**`apps/desktop/src/main/db/migrations/0011_copilot_insights.sql`** (NEW) — Table per Phase 5 §8.4 with CHECK constraints on `category` (`operational | cost | org | workflow | anomaly`) and `severity` (`critical | warning | info`), FK `company_id REFERENCES companies(id) ON DELETE CASCADE` (matches the archive-sweep semantics from M7), composite index `idx_insights_company_active(company_id, dismissed_at, expires_at)` for the `listActive` hot path. Migration style matches 0009/0008: backticks, 2-space indent, `--> statement-breakpoint` between table + index.

**`apps/desktop/src/main/db/migrations/meta/_journal.json`** (M) — Added `idx: 11`, `tag: "0011_copilot_insights"`, `when: 1776921600000` (one day after 0010). Drizzle migrate at runtime reads journal + .sql; snapshots are dev-time-only and not required (existing `meta/` only has 0000–0002 snapshots).

**`apps/desktop/src/main/db/schema.ts`** (M) — `copilotInsights` Drizzle table appended after `commandHistory` with the new "Phase 5 — M33: Copilot Insights" section header. CHECK constraints stay at the SQL DDL layer (Drizzle does not model CHECK). Inline doc comment captures the dedup contract + lifecycle + invariant #6 commentary (insights are NOT events — append-only events table stays untouched).

**`apps/desktop/src/main/db/repos/copilot-insights.ts`** (NEW) — `CopilotInsightsRepo` factory mirroring tickets/projects shape (`BaseSQLiteDatabase<'sync', TRunResult, Schema>` cross-driver typing). Six methods:
- `create(input)` — insert + return `nanoid()` id; `expiresAt` defaults to `now + DEFAULT_INSIGHT_TTL_MS` (24h).
- `getById(id)` — `null` on miss.
- `listActive(filter)` — composite WHERE: `companyId = ? AND dismissed_at IS NULL AND expires_at > now AND ...`. Optional category / severity / limit. Newest first via in-memory sort (preserves cross-driver compatibility).
- `dismiss(id, now?)` — `UPDATE ... SET dismissed_at = ? WHERE id = ? AND dismissed_at IS NULL` — idempotent on re-dismissal (preserves first dismissal time).
- `expireStale(now): number` — deletes rows where `expires_at < now`, returns deleted count. SELECT-then-DELETE pattern so Drizzle's cross-driver run() doesn't need `.changes` extraction.
- `upsertWithDedup(draft, ctx): { id, merged }` — walks active-same-category candidates and merges via the locked predicate.

**Dedup contract — locked order, cheap rejections first:**
1. **Category-scoped** — `existing.category !== draft.category` → reject. Different categories never merge.
2. **Numeric-drift guard** — extracted digit runs MUST match. Prevents `"Alice has 3 blocked tickets"` and `"Alice has 4 blocked tickets"` from silently merging and masking the count change. Asserted via `extractDigitRuns` exported helper.
3. **Jaccard bigram > 0.8** — over normalized titles (`lowercase + collapsed whitespace + trim`, punctuation preserved). Range `[0, 1]`, symmetric, fast (O(min(|A|, |B|))). `JACCARD_MERGE_THRESHOLD = 0.8` constant exported for future tuning.

**On merge:** `severity / detail / actionSuggestion / actionIntent / actionEntitiesJson / expiresAt` are refreshed from the draft; `created_at` is preserved so the user keeps seeing the original surfacing time, not the latest re-confirmation.

Exports: `COPILOT_CATEGORIES` + `COPILOT_SEVERITIES` (frozen arrays, kept in sync with the SQL CHECK constraint), `DEFAULT_INSIGHT_TTL_MS = 24h`, `JACCARD_MERGE_THRESHOLD = 0.8`, plus the `bigrams` / `jaccardBigrams` / `extractDigitRuns` / `normalizeTitle` / `shouldMerge` helpers (exported for direct unit testing — production callers should use the repo methods).

**`apps/desktop/src/main/db/repos/copilot-insights-repo.test.ts`** (NEW) — 15 unit tests using `makeTestDb` (sql.js + in-memory + every migration applied):

- **CRUD (4)**: create returns non-empty id + every field round-trips (incl. action_intent + action_entities_json), getById hit, getById miss returns `null`, dismiss stamps `dismissed_at` + idempotent re-dismissal preserves first stamp.
- **Dedup Jaccard threshold (6)**: exact-match merges into existing row, same-title-different-detail merges and updates mutable fields (severity / detail / actionSuggestion), different-title-same-category creates new row (low Jaccard), **numeric-drift guard MUST-NOT-MERGE** (asserts `jaccardBigrams(t1, t2) > 0.8` first to prove the guard fires independently of similarity), case-insensitivity merge (UPPERCASE matches lowercase), special-character / emoji / unicode safety (no crashes; helpers symmetric).
- **expireStale (2)**: deletes past-expiry rows + returns count + future rows preserved, idempotent (second sweep returns 0).
- **listActive filter composition (3)**: no filter excludes both dismissed and expired and sorts newest first (4 rows planted, 2 returned in expected order), category filter narrows to single category (3 planted across 2 categories), severity + limit compose with AND (4 planted across 2 severities, returns 2 critical newest-first capped).

**`docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md`** (M) — §9 M33 row flipped `📋 Planned` → `🚧 In progress — 2 of 11 tasks shipped (2026-04-16)`. Row body extended with the dedup contract summary so the status table reflects the as-built shape.

### Verification gates passed

- `pnpm test` — 89 files / **1048 tests pass** in 18.59s (+15 net from 1033 baseline; exact match to T1 target).
- `pnpm exec biome check` on the 3 touched .ts files — 0 errors, 0 warnings (no biome auto-fix needed).
- `pnpm -r typecheck` — clean across all 6 workspace packages on first run.
- `pnpm lint` workspace-wide — 0 errors, 24 warnings (steady at M32 baseline; well under M33 ≤34 budget).
- ABI rebuild dance re-verified: bindings were stale at ABI 125 (post-E2E from M32 T10 verification), `cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npx node-gyp rebuild --release` (and same for keytar) produced ABI 137 builds, vitest immediately green.

### Architectural invariants preserved

- **#1 Renderer pure view** — repo lives in main only, no IPC yet (T5 surfaces).
- **#4 SQLite + filesystem vault** — no blob storage; insights are metadata only.
- **#6 Append-only events table** — `copilot_insights` is intentionally mutable by design (lifecycle: create → dismiss / expireStale → physical delete on next sweep). `events` table untouched.
- **#7 Zero phone-home** — no network surface added.

### Gotchas captured this session

1. **Repo path divergence between plan doc and existing convention.** The M33 plan doc and current-task.json point at `apps/desktop/src/main/repos/copilot-insights.ts`, but every existing repo lives under `apps/desktop/src/main/db/repos/`. Followed the existing convention (`apps/desktop/src/main/db/repos/copilot-insights.ts`) since changing it would create a one-off outlier. Plan doc T1 paragraph reference is approximate; the canonical source is the colocated test file at the same path.
2. **`pnpm rebuild <pkg>` is a no-op for native modules in pnpm's content-addressed store** — re-confirmed at T1. Must invoke `node-gyp rebuild --release` directly inside the hashed module dir (`node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>`). Carries forward from M32 T10 docs into M33+.
3. **`vec-init.test.ts` console-spew is benign.** The sqlite-vec extension is best-effort (`vec0` module load fails when the extension binary isn't present). The catch path runs and the 2 tests pass — the stack-trace lines that appear in `pnpm test` output are from `console.error` inside the catch, not from a test failure. Documented behavior since M28; surfaces every test run; do not chase.
4. **Dedup test for blocked-ticket-count drift cleanly absorbs both "below-threshold" and "MUST-NOT-MERGE for count drift" requirements** by asserting `jaccardBigrams(t1, t2) > 0.8` first, then the merge result is `false`. One test serves both criteria — keeps the count at 15 exactly per plan target.
5. **`shouldMerge` exports are referenced via `void`** at the bottom of the test file to keep them imported (so a future test that targets the helpers directly doesn't need a re-import) without triggering biome's `noUnusedImports`. Pattern is non-essential — could also be deleted; left in to flag the helpers' availability.

### Patterns reinforced

- **Single-source-of-truth dedup predicate.** `shouldMerge(existing, draft)` is a pure function with three locked steps; the repo's `upsertWithDedup` walks candidates and short-circuits on the first hit. Future dedup tweaks (different threshold, different guard) edit only `shouldMerge` — repo body untouched.
- **Cross-driver test harness via sql.js** — same `makeTestDb()` helper used by every repo test in the workspace. Migration 0011 applied cleanly under sql.js on first run, validating that the new SQL is dialect-agnostic.
- **Atomic feat commit + ledger commit pair.** Per M30/M31/M32 cadence — work commit `feat(m33): M33 T<N> — <summary>` immediately followed by `chore(loki): M33 T<N> — commit ledger (<sha>)` updating orchestrator.json + pending.json + current-task.json + CONTINUITY.md.

### Next Session Startup Checklist (M33 T2+)

1. Read this CONTINUITY header — most recent session at the top.
2. Read `.loki/state/orchestrator.json` → `inFlightMilestone.M33.commits.T1 = '0a77d87'`; `tasksCompleted: 2`; current 1048 / target 1058.
3. Read `.loki/queue/pending.json` → T0 + T1 marked `completed`. T2 head-of-queue.
4. Read `.loki/queue/current-task.json` → M33 T2 acceptance + files-touched + scope.
5. **T2 = system-copilot pseudo-employee + role card**:
   - New role-packs/strategia-official/roles/system/system-copilot.md
   - ensureSystemCopilot(companyId) bootstrap (mirrors ensureSystemAgent shape)
   - Extract isSystemRoleId predicate to packages/shared-types (M31 Handoff Notes flagged this for M33 T2)
   - Filter sweep across employees.list, orgchart.get, hire dialog, delegation pickers, meeting attendees
   - +4 unit tests
6. Commit cadence: `feat(m33): M33 T2 — system-copilot pseudo-employee + role card`, then `chore(loki): M33 T2 — commit ledger (<sha>)`.

---

## M33 T0 SHIPPED — 2026-04-16 (plan doc)

**Task:** M33 T0 — author plan doc for Copilot Service milestone.
**Commit:** `c5cdeee` — `feat(m33): M33 T0 — plan doc`.
**Plan doc:** [`docs/plans/2026-04-16-team-x-phase-5-m33-copilot-service.md`](../docs/plans/2026-04-16-team-x-phase-5-m33-copilot-service.md) — 292 lines, 11 tasks (T0–T10), 11 invariants preserved, ABI rebuild dance documented in T10, commit cadence locked (`feat|test|chore(m33): M33 T<N> — <summary>` + `chore(loki): M33 T<N> — commit ledger (<sha>)`).

### What shipped in T0

- **Structural template mirrored from M32.** Required sections present and verified: Overview → Invariants preserved (11) → Success criteria → Task breakdown (T0–T10, 11 tasks) → Summary of deliverables → Risks + open questions → Handoff notes.
- **T1–T10 scope materialized.** Each task has per-task scope, files touched, unit/E2E test deltas, and commit-message template. Totals: T1 +15 unit, T2 +4, T3 +8, T4 +14, T5 +8, T6 +5, T7 +7, T8 +5, T9 +1 E2E, T10 0 (gate-only).
- **Target deltas locked.** Unit baseline 1033 → ~1058 (+~25 net, per design §9 estimate). E2E 8 specs → 9 specs (+1 `copilot-service.spec.ts`). Lint 0 errors / ≤34 warnings (24 baseline + 10 budget). Typecheck clean.
- **Architectural seams carried forward** documented in Handoff notes: three-tier canned test seam, `{rows, truncated}` envelope, `data-step-kind` stable E2E selector, pause-aware `providerRouter.complete` wrapper, `AbortController` stop with canceled-status coercion, atomic + ledger commits, bus-event + audit-row invariant (#11), `is_system` + filter-sweep pattern with new `isSystemRoleId` predicate (M33 T2 extracts this).
- **M34 prereq flagged.** `copilot.ask` (T6) must return `{ runId, threadId }` matching M31 `command.execute complex_request` shape so M34 sidebar attaches step-stream with no second wire format.
- **Phase 5 design doc §9 NOT bumped yet.** M33 row still reads 📋 Planned — flips to 🚧 In progress at T1 when the first code change lands. T10 flips it to ✅ Complete.
- **Ledger updates this commit:** `.loki/state/orchestrator.json` populated with `inFlightMilestone.M33` block (startedAt 2026-04-16T08:15Z, T0 commit c5cdeee, baseline + targets). `.loki/queue/pending.json` materializes T1–T10 as pending tasks with per-task scope + commit templates. This CONTINUITY entry.

### Next task: M33 T1 — Migration 0011 + `CopilotInsightsRepo`

**Scope:** New `apps/desktop/src/main/db/migrations/0011_copilot_insights.sql` (table + `idx_insights_company_active` composite index, FK `company_id CASCADE`). `CopilotInsightsRepo` in `apps/desktop/src/main/repos/copilot-insights.ts` — CRUD + `upsertWithDedup` (Jaccard bigram > 0.8, category-scoped guard against blocked-ticket-count drift merge). Drizzle schema additions. +15 unit tests.

**Side effect:** Flips Phase 5 design doc §9 M33 row 📋 Planned → 🚧 In progress (same commit).

**Commit:** `feat(m33): M33 T1 — copilot_insights table + repo`.
**Ledger follow-up:** `chore(loki): M33 T1 — commit ledger (<sha>)`.

---

## M32 COMPLETE — 2026-04-16 (T10 verification + milestone marker)

**Milestone:** Task Planner (Phase 5 — Intelligence Layer). **Complete. All 11 tasks shipped.**
**Phase 5 status:** M28 / M29 / M30 / M31 / M32 complete. M33 / M34 / M35 remaining.
**Verification gates (T10):** All green.

### Metrics delta (T10 — pure verification + marker, no code delta)

| Metric | Pre-T10 | Post-T10 | Delta |
|---|---:|---:|---:|
| Unit tests | 1033 | 1033 | 0 |
| E2E spec files | 8 | 8 | 0 |
| E2E Playwright cases green | 9 | 9 | 0 (task-planner.spec.ts has 2 cases) |
| Lint errors | 0 | 0 | 0 |
| Lint warnings | 24 | 24 | 0 |
| Typecheck across 6 packages | clean | clean | — |
| Total E2E duration | 26.4s | 29.1s | +2.7s (Playwright warm-up variance) |

### What shipped in T10

- **ABI rebuild dance verified.** Node ABI rebuild for vitest via `cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npx node-gyp rebuild --release` (and same for keytar). Then Electron ABI rebuild for Playwright via `pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar`. Confirmed pattern: `pnpm rebuild <pkg>` is a no-op under pnpm's content-addressed store — must invoke node-gyp directly in the module dir. Documented in orchestrator.json notes + pending.json notes for M33+.
- **Full test suite** — `pnpm test`: 88 files / 1033 tests pass in 20.57s.
- **Biome** — `pnpm lint`: 0 errors, 24 warnings (exactly at target ≤24). 330 files checked in 577ms.
- **Typecheck** — `pnpm -r typecheck`: clean across all 6 workspace packages.
- **E2E** — `pnpm -F @team-x/desktop test:e2e`: 9 passed in 29.1s (8 spec files; task-planner.spec.ts has 2 tests).
- **orchestrator.json rewritten.** M32 folded from `inFlightMilestone` into `history.M32` block with full commit list (T0=f515ea7 / T1=62a0504 / T2=cdf7315 / T3=8bf1e9e / T4=dd17eff / T5=46401c1 / T6=219d8ef / T7=6ed012d / T8=2a4fc63 / T9=dd2adc3 / T10=pending-final-commit), unit-test delta +75 (958→1033), E2E delta +1 (7→8), lint delta 0. `currentMilestone=M33`, `milestoneName=Copilot Service`, `tasksCompleted=0`, `totalTasks=null` (plan doc not yet written). `nextMilestone=M34` (Copilot UI). Baseline post-M32: 1033 unit / 8 E2E / 0 errors / 24 warnings / typecheck clean. `phaseComplete=false` — M33 / M34 / M35 still ahead.
- **pending.json reset** for M33. Only T0 (write plan doc) listed until the M33 plan doc materializes the full T1–TN breakdown — same pattern as M32's pre-T2 state.
- **current-task.json rewritten** for M33 T0: author `docs/plans/2026-04-16-team-x-phase-5-m33-copilot-service.md` using M32 plan doc as structural template.
- **Phase 5 design doc §9** — M32 row flipped `🚧 In progress — 9 of 11 tasks shipped (2026-04-15)` → `✅ Complete (2026-04-16)`. Shipped-so-far summary updated to "Project totals as of M32 complete (2026-04-16): 1033 unit tests / 8 E2E specs (9 Playwright cases — one spec has 2 tests)".
- **Atomic commit pending:** `chore(m32): M32 T10 — verification + milestone marker`. Ledger commit next: `chore(loki): M32 T10 — commit ledger (<sha>)`.

### M32 follow-ups (post-completion)

**None.** No paper-cuts surfaced during T8 E2E round-trip or T10 verification. The M31 follow-up class — race conditions between bus emit and React Query subscription attach — is closed by F1's `getRunSnapshot` backfill pattern, which is now the canonical way to reconcile a fast loop with a slow renderer subscription. Future write-side tool surfaces (M33 Copilot Service) should follow the same backfill-on-mount pattern.

### Gotchas captured (T10)

1. **pnpm rebuild <pkg> is a no-op for native modules under pnpm's content-addressed store.** When ABI needs to change (Electron ↔ Node), you must invoke node-gyp directly in the hashed module dir: `cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npx node-gyp rebuild --release`. The first failure signature is `NODE_MODULE_VERSION 125 vs 137` mismatch from better-sqlite3's bindings loader. Same pattern for keytar. Document this in the M33+ plan docs' verification section.
2. **Playwright case count ≠ spec file count.** `ls apps/desktop/e2e/*.spec.ts | wc -l = 8`, but `pnpm test:e2e` reports `9 passed` — one spec has 2 test cases. orchestrator.json + pending.json use `e2eSpecs: 8` (file count, authoritative) and `e2eGreenCount: 9` (Playwright case count, for parity with terminal output). Don't conflate the two.
3. **Biome warning count is exactly at the target ceiling.** Rocky's CLAUDE.md says ≤24 warnings; we're at 24. Future milestones must plan warning-budget accordingly — the orchestrator.json baseline caps `lintWarningsMax: 76` for the planning-phase ceiling, but the operational target for steady-state is ≤24.

### Patterns reinforced

- **ABI rebuild dance** is now canonical for every `*-T10` verification run. Runbook: (1) node-gyp rebuild for better-sqlite3 + keytar → (2) `pnpm test` → (3) `pnpm lint` + `pnpm -r typecheck` → (4) `electron-rebuild -f -w better-sqlite3,keytar` → (5) `pnpm -F @team-x/desktop test:e2e`. Steps 2 and 4 cannot be swapped — vitest and Playwright need different ABIs.
- **Milestone-marker file set is stable:** `.loki/state/orchestrator.json` (fold + advance currentMilestone), `.loki/queue/pending.json` (reset for next milestone), `.loki/queue/current-task.json` (rewrite for next-milestone T0), Phase 5 design doc §9 (flip status row + update totals), CONTINUITY.md (prepend checkpoint). Same five files every T10.

### Next Session Startup Checklist (M33 T0+)

1. Read this CONTINUITY header — M32 COMPLETE, M33 T0 is "write plan doc".
2. Read `.loki/state/orchestrator.json` → history.M32 has full commit list; history.M31 T10 still `pending-final-commit` (pre-existing, not blocking).
3. Read `.loki/queue/current-task.json` → M33 T0 goal + acceptance criteria.
4. **T0 = write `docs/plans/2026-04-16-team-x-phase-5-m33-copilot-service.md`** using M32 plan doc as template. Required sections: Overview, What ships, Invariants preserved, Success criteria, Task breakdown (T1–TN), Acceptance criteria (incl. ABI rebuild dance). Scope per Phase 5 design §9: new system-copilot pseudo-employee (second `is_system=1` row), periodic analyzer with LLM + RAG, proactive nudges in Copilot Conversations thread, `copilot.*` IPC + bus events, orchestrator integration for scheduled/event-triggered runs. Invariants #1 / #2 / #6 / #7 / #11 must be preserved.
5. After plan doc: materialize T1–TN into pending.json and flip Phase 5 design doc §9 M33 status 📋 Planned → 🚧 In progress.

---

## M32 T8 SHIPPED — 2026-04-15

**Milestone:** Task Planner (Phase 5 — Intelligence Layer). In progress (9 of 11 tasks shipped).
**Scope:** New E2E spec `apps/desktop/e2e/task-planner.spec.ts` exercising the full write-side round-trip through the M31 agentic harness plus M32 T5's confirmation gate and T3's level-gated tool registry. Pure test-harness extension — no production code changes. Canned classifier + canned provider gain one entry each; write-side tool calls resolve via the existing default fixtures (FIXTURE_DECOMPOSED_PLAN + FIXTURE_DELEGATION).
**Commit:** T8 = `2a4fc63`.

### Metrics delta

| Metric | Pre-T8 | Post-T8 | Delta |
|---|---:|---:|---:|
| Unit tests | 1033 | 1033 | 0 (pure E2E) |
| E2E specs | 8 | 9 | **+1** (task-planner.spec.ts, 2.6s) |
| Total E2E duration | 23.8s | 26.4s | +2.6s (new spec) |
| Files touched | — | 3 (+321 / −0) | — |
| Lint errors | 0 | 0 | 0 |
| Lint warnings | 24 | 24 | 0 |
| Typecheck across 6 packages | clean | clean | — |

### What shipped

**`apps/desktop/src/main/services/test-classifier.ts`** (M, +9 LOC) — CANNED_TABLE gains the lowercase-trimmed entry `'decompose the frontend redesign into tickets'` → `{ intent: 'complex_request', entities: {}, confidence: 0.91 }`. Phrase deliberately contains `decompose` + `tickets` which the WRITE_SIDE_KEYWORDS regex in command-service.ts matches, so the T5 write-side gate fires before the agentic loop dispatches. Comment above the entry calls out the cross-seam coupling for future maintainers.

**`apps/desktop/src/main/services/test-agentic-provider.ts`** (M, +17 LOC) — CANNED_TABLE gains the scripted provider sequence for the same phrase: plan(`{"action":"decompose_project","args":{"brief":"Frontend redesign"}}`) → plan(`{"action":"delegate_subtask","args":{"planId":"plan-test-1","subtaskTitle":"Test subtask","assigneeId":"emp-test-swe"}}`) → `{"action":"final_answer","answer":"Decomposed the frontend redesign into 1 subtask and delegated ticket tkt-test-1 to Mateo Reyes."}`. Default FIXTURE_DECOMPOSED_PLAN (1 subtask, plan-test-1, assignee emp-test-swe, `FIXTURE_DELEGATION` ticket tkt-test-1/Mateo Reyes) in test-agentic-tools.ts resolves both tool calls without any new canned tool entries — the test-seam surface area stays minimal.

**`apps/desktop/e2e/task-planner.spec.ts`** (NEW, +295 LOC) — Mirrors agentic-loop.spec.ts structure (serial mode, fresh `--user-data-dir=<tmp>` per test, main-process stdout/stderr piping, identical `beforeEach`/`afterEach`). Flow-under-test per numbered step in the file header comment. Key assertions:

1. Palette opens via Ctrl+K; Radix dialog visible.
2. Typed phrase → intent chip `Route to Agent` (complex_request label).
3. Enter → palette stays open; amber card titled **"Confirm write-side agentic run"** renders. Guard: asserts `"Confirm destructive action"` is NOT present (regression catcher for write-side being mis-routed through the red destructive gate).
4. Click `Confirm` → palette swaps to step-log mode; canned loop emits plan + tool_call(decompose_project) + tool_result + tool_call(delegate_subtask) + tool_result + answer.
5. `data-step-kind="answer"` card contains `/Decomposed the frontend redesign/i`.
6. Palette step count ≥ 1 (observed = 7 — **proves M32 T0's F1 backfill is working end-to-end**; under fast canned provider the palette captures all steps via getRunSnapshot, not just the terminal answer).
7. `Open Thread` closes palette + opens chat drawer on the persisted copilot thread; "Copilot transcript — read only" banner visible.
8. Canned answer text also appears in persisted copilot transcript (refetched from DB on drawer mount).
9. `Escape` closes drawer; Dashboard → Commands subview shows the audit row (`Route to Agent` chip from `command.executed` emission).

### Verification gates

- `pnpm exec biome check` on the 3 touched files — 0 errors, 0 warnings.
- `pnpm -r typecheck` — clean across all 6 workspace packages.
- `pnpm test` — 88 files / 1033 tests pass in 14.5s (no unit-test delta — pure E2E task).
- `pnpm -F @team-x/desktop test:e2e` — **9 passed in 26.4s**, including new `task-planner.spec.ts` at 2.6s.
- Atomic commit `2a4fc63` per M31/M32 ledger pattern.

### Gotchas captured

- **ABI rebuild dance is mandatory between unit tests and E2E — documented, not a new finding.** Unit tests rebuild better-sqlite3 against Node's ABI (137 on Node 24), which crashes the Electron launch (Electron needs ABI 125). Dev workflow for T8-style verification: run unit tests first, then `pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar` before E2E. CONTINUITY from M31 T10 called this out; T8 re-confirmed.
- **Stale Electron processes from a crashed E2E hold locks on native module binaries.** If electron-rebuild fails with `EPERM: operation not permitted, unlink '...keytar.node'`, kill dangling `electron.exe` processes first (`taskkill //F //IM electron.exe`) then retry. A crashed test run leaves worker processes orphaned on Windows specifically.
- **F1 backfill is live for the canned-seam palette observation path.** Pre-M32 T0 the palette showed only the terminal answer card (bus subscription attached after provider completion). Post-T0 (`f515ea7`) the backfill via `command.getRunSnapshot` + `(runId, stepIndex)` dedup surfaces all intermediate plan / tool_call / tool_result cards. task-planner.spec.ts's observed step count of 7 — vs the "≥ 1" floor it asserts — confirms this is working. Going forward any new E2E spec under a canned seam can tighten step-count assertions if desired.
- **Default canned-tool fixtures are already a complete write-side fixture set.** M32 T3's `FIXTURE_DECOMPOSED_PLAN` and `FIXTURE_DELEGATION` in test-agentic-tools.ts are structured so a provider script that calls `decompose_project` followed by `delegate_subtask` gets a coherent result chain out of the box. Future write-side specs can adopt the same pattern — scripting the provider with the two tool calls and letting the defaults resolve them — without a canned-tools-table extension. The `CANNED_DECOMPOSE_TABLE` / `CANNED_DELEGATE_TABLE` / `CANNED_REVIEW_TABLE` maps stay reserved for specs that need per-prompt fixture overrides.

### Patterns reinforced

- **Three-tier canned seam remains the only E2E pattern for agentic surfaces.** T8 added entries to two seams (classifier + provider) and consumed the third (tools) via its default fixtures. The lockstep invariant from M31 T8 holds — any new agentic surface ships its E2E harness extension inside the feat commit that introduces the production behavior, not as a separate follow-up.
- **Write-side E2E does not require new production code.** T5 (gate) + T3 (tool registry injection) + default fixtures are sufficient. Future write-side behavior changes (e.g., M33 Copilot's `skipConfirmation: true` path) can assert against this spec as a regression guard.
- **Regression-guard assertions catch future mis-routing.** The `"Confirm destructive action"` `not.toBeVisible()` check would immediately surface a bug where `complex_request` with write-side keywords accidentally routed through the destructive gate. Analogous negative assertions are cheap to add and high-leverage.

### Next Session Startup Checklist (M32 T9+)

1. Read this CONTINUITY — T0–T8 shipped, T9–T10 remaining.
2. Read `.loki/state/orchestrator.json` → `inFlightMilestone.M32.commits.T8 = '2a4fc63'`; `tasksCompleted: 9`; baseline unit 958 / current 1033; E2E baseline 8 / current 9.
3. Read `.loki/queue/pending.json` → T0–T8 `status: shipped`.
4. **T9 = Docs.** Update CLAUDE.md's M32 block with T8 shipped + full Task Planner scope summary. Add the CHANGELOG `[Unreleased]` entry for M32. Update README's Intelligence Layer section (tests-badge 1033 → 1033, E2E-spec-count 8 → 9). NEW file `docs/user-guide/task-planner.md` — F10 style: Overview → Mechanics → Tools (decompose/delegate/review) → Settings → Control (confirmation gate) → Privacy → Example → Troubleshooting. Resequence Phase 5 design-doc §10/§11/§13 if needed to mark M32 shipped.
5. **T10 = Verification + milestone marker.** Full ABI rebuild dance, `pnpm test` + `pnpm -r typecheck` + `pnpm -F @team-x/desktop test:e2e` green, then move M32 from `inFlightMilestone` into `history` in orchestrator.json, clear pending.json, rewrite this CONTINUITY top with an `M32-COMPLETE` header. Commit cadence per T7/T8: `feat(m32): M32 T<N> — <summary>` + `chore(loki): M32 T<N> — commit ledger (<sha>)`.

---

## M32 T7 SHIPPED — 2026-04-15

**Milestone:** Task Planner (Phase 5 — Intelligence Layer). In progress (8 of 11 tasks shipped).
**Scope:** Four clamped planner settings keys wired end-to-end: shared-types (PLANNER_SETTINGS_CLAMPS + types + IPC contract + TeamXApi), settings repo (getPlanner/setPlanner + seed defaults), IPC handlers + register, preload bridge, React Query hooks, new PlannerSection component in Settings -> Runtime, composition root wiring replacing static PLANNER_DEFAULTS with live settings-repo-backed accessor.
**Commit:** T7 = `6ed012d`.

### Metrics delta

| Metric | Pre-T7 | Post-T7 | Delta |
|---|---:|---:|---:|
| Unit tests | 1022 | 1033 | +11 |
| E2E specs | 8 | 8 | 0 |
| Files touched | — | 11 (+676 / -2) | — |

### What shipped

**`packages/shared-types/src/ipc.ts`** (M) — `PlannerApprovalLevel` type (5 hyphenated levels matching role-pack frontmatter), `SettingsGetPlannerResponse` + `SettingsSetPlannerRequest` interfaces, `PLANNER_SETTINGS_CLAMPS` (maxTickets 1-50 default 10, maxDepth 1-4 default 2, escalationThreshold 1-10 default 3), `PLANNER_APPROVAL_LEVELS` array, `PLANNER_APPROVAL_LEVEL_DEFAULT = 'management'`. IpcContract gains `settings.getPlanner` + `settings.setPlanner`. TeamXApi gains `getPlanner()` + `setPlanner()`.

**`apps/desktop/src/main/db/repos/settings.ts`** (M) — `getPlanner()` reads 4 keys with fallback defaults, validates `approvalLevel` against enum (invalid → default). `setPlanner()` clamps numeric fields, validates approvalLevel enum, rejects non-finite numbers. `SETTING_DEFAULTS` extended with 4 planner keys.

**`apps/desktop/src/main/ipc/handlers.ts`** (M) — `IpcSettingsRepo` widened with `getPlanner()`/`setPlanner()`. `IpcHandlers` gains `settingsGetPlanner`/`settingsSetPlanner`. Factory impl as thin pass-through to repo.

**`apps/desktop/src/main/ipc/register.ts`** (M) — `REQUEST_CHANNELS` gains `settings.getPlanner`/`settings.setPlanner`. Two `ipcMain.handle` registrations.

**`apps/desktop/src/preload/api.ts`** (M) — Channel constants + bridge methods + type imports for planner.

**`apps/desktop/src/renderer/src/hooks/use-settings.ts`** (M) — `usePlannerSettings()` + `useSetPlanner()` React Query hooks.

**`apps/desktop/src/renderer/src/features/settings/planner-section.tsx`** (NEW) — PlannerSection component: GitBranch icon header, 3 number inputs (maxTickets, maxDepth, escalationThreshold) with onBlur clamping, 1 select (approvalLevel) with human-readable labels, loading/error/saving states, save-on-change via mutation.

**`apps/desktop/src/renderer/src/features/settings/settings-view.tsx`** (M) — Imports + renders PlannerSection after AgenticSection.

**`apps/desktop/src/main/index.ts`** (M) — Composition root wires `settingsRepo.getPlanner()` into `writeSideDeps.getPlanner`, mapping the 4 user-facing settings + 2 internal constants (`loadDenominator=5`, `pastPerformanceCeilingMs=172800000`). Replaces the static `defaultPlanner()` fallback.

**`apps/desktop/src/main/db/repos/settings.test.ts`** (M) — seedDefaults count updated 14→18 and 13→17 for 4 new planner keys.

**`apps/desktop/src/main/db/repos/settings-planner.test.ts`** (NEW) — 11 unit tests: getPlanner defaults/persisted/invalid-fallback, setPlanner clamp maxTickets/maxDepth/escalationThreshold, approvalLevel enum validation, non-finite rejection, fractional rounding, seedDefaults seed+no-overwrite.

### Gotchas captured

- **`PlannerApprovalLevel` must use hyphenated `'senior-management'` not underscored `'senior_management'`.** The `EmployeeLevel` type in `agentic-tools-write.ts` uses hyphenated form matching role-pack frontmatter convention. Initial implementation used underscores, causing a type incompatibility at the composition root mapping. Fix: align shared-types with the existing convention.
- **`PlannerSettings` has 6 fields but only 4 are user-facing.** `loadDenominator` and `pastPerformanceCeilingMs` are internal scoring constants, not user-facing settings. The composition root maps the 4 settings-repo fields + hardcodes the 2 internal constants.
- **Existing `settings.test.ts` hardcodes `seedDefaults` count.** Adding 4 new seed defaults breaks the existing test. The count must be updated in lockstep.

### Next Session Startup Checklist (M32 T8+)

1. Read this CONTINUITY — T0–T7 shipped, T8–T10 remaining.
2. **T8 = E2E spec** `task-planner.spec.ts` — full round-trip through write-side tools with canned seam.
3. **T9 = Docs** — CLAUDE.md, CHANGELOG, README, `docs/user-guide/task-planner.md`.
4. **T10 = Verification + milestone marker** — ABI rebuild dance, full test suite, phase badge.

---

## M32 T6 SHIPPED — 2026-04-15 (prior session)

## M32 T6 SHIPPED — 2026-04-15

**Milestone:** Task Planner (Phase 5 — Intelligence Layer). In progress (7 of 11 tasks shipped).
**Scope:** Full step-card write-side variants (ticket_created, delegation_made, review_pending) with data narrowing, detail text, deep-links, color polish. Narrow helpers extracted to `step-card-narrow.ts` for testability without renderer deps. AuditView extended with 6 new planner event types (colors, labels, payload-aware row summaries).
**Commit:** T6 = `219d8ef`.

### Metrics delta

| Metric | Pre-T6 | Post-T6 | Delta |
|---|---:|---:|---:|
| Unit tests | 1011 | 1022 | +11 |
| E2E specs | 8 | 8 | 0 |
| Files touched | — | 4 (+392 / −29) | — |

### What shipped

**`apps/desktop/src/renderer/src/features/command/step-card-narrow.ts`** (NEW) — Pure narrow helpers for 3 write-side step kinds. Extracted from step-card.tsx so unit tests run in node-env Vitest without jsdom or Vite alias resolution. Exports `narrowTicketCreated`, `narrowDelegationMade`, `narrowReviewPending` — each takes `unknown`, returns typed object with safe defaults.

**`apps/desktop/src/renderer/src/features/command/step-card.tsx`** (M) — Three T4-minimal case branches upgraded to full rendering. `ticket_created`: Ticket icon (lucide), title text, assignee + plan ID refs, emerald border. `delegation_made`: GitBranch icon, assignee name display, plan ref, sky border. `review_pending`: ClipboardCheck icon, outcome-based color (approve=emerald, reject=red, pending=amber), ticket + reviewer + plan refs, amber border. All three maintain `data-step-kind` stable E2E selectors. Imported narrow helpers from step-card-narrow.ts.

**`apps/desktop/src/renderer/src/features/audit/audit-view.tsx`** (M) — `EVENT_TYPE_COLORS` gains 6 entries: plan.proposed/approved (violet), task.delegated (sky), task.escalated (rose), review.requested/completed (amber). `EVENT_TYPE_LABELS` gains 6 hand-tuned labels. `buildRowSummary` extended with `SUMMARIZABLE_TYPES` set and payload-aware compact summaries for all 6 planner events (subtask count + truncation for plan.proposed, tickets count for plan.approved, assignee name + fallback + attempts for task.delegated, truncated reason for task.escalated, ticket ID for review.requested, outcome + escalation flag for review.completed).

**`step-card-narrow.test.ts`** (NEW) — 11 unit tests: narrowTicketCreated (well-formed, undefined, partial, non-string coercion), narrowDelegationMade (well-formed, undefined, partial), narrowReviewPending (well-formed, absent planId→null, undefined, non-string coercion).

### Gotchas captured

- **Renderer-aliased imports block Vitest node-env resolution.** `step-card.tsx` imports `@/lib/utils.js` (a Vite alias) — any test file importing from it transitively fails with `Failed to load url @/lib/utils.js`. Fix: extract the pure functions to a standalone `.ts` module with zero renderer deps. Pattern applies to any future renderer-adjacent utility that needs unit testing.

### Next Session Startup Checklist (M32 T7+)

1. Read this CONTINUITY — T0–T6 shipped, T7–T10 remaining.
2. **T7 = Planner settings** — 4 new clamped keys (`planner_max_tickets`, `planner_max_depth`, `planner_approval_level`, `planner_escalation_threshold`) in Settings → Runtime. New `settings.getPlanner` / `settings.setPlanner` IPC pair. T2's `PLANNER_DEFAULTS` static accessor swapped for the live settings repo via `deps.getPlanner`. +8 unit tests.
3. **T8 = E2E spec** `task-planner.spec.ts` — full round-trip through write-side tools with canned seam.
4. **T9 = Docs** — CLAUDE.md, CHANGELOG, README, `docs/user-guide/task-planner.md`.
5. **T10 = Verification + milestone marker** — ABI rebuild dance, full test suite, phase badge.

---

## M32 T5 SHIPPED — 2026-04-15

**Milestone:** Task Planner (Phase 5 — Intelligence Layer). In progress (6 of 11 tasks shipped).
**Scope:** Write-side confirmation gate for `complex_request` intents with keyword heuristic. Gate 2.5 in `execute()` — fires before agentic loop dispatch when rawText matches write-side verbs and `confirmed !== true` and `skipConfirmation !== true`. Palette renders amber card (write-side) vs red card (destructive). Existing M30 gates unchanged.
**Commit:** T5 = `46401c1`.

### Metrics delta

| Metric | Pre-T5 | Post-T5 | Delta |
|---|---:|---:|---:|
| Unit tests | 1003 | 1011 | +8 |
| E2E specs | 8 | 8 | 0 |
| Files touched | — | 4 (+236 / −51) | — |

### Next Session Startup Checklist (M32 T6+)

1. Read this CONTINUITY — T0–T5 shipped, T6–T10 remaining.
2. **T6 = Full step-card variants + AuditView chips.** T4-minimal step-card branches get full rendering with data narrowing, detail text, deep-links, and color polish. AuditView event-type filter chips grow by +6. +8 unit tests.
3. **T7 = Planner settings** — 4 new clamped keys in Settings → Runtime.
4. **T8 = E2E spec** `task-planner.spec.ts` — full round-trip through write-side tools.
5. **T9 = Docs** — CLAUDE.md, CHANGELOG, README, `docs/user-guide/task-planner.md`.
6. **T10 = Verification + milestone marker** — ABI rebuild dance, full test suite, phase badge.

---

## M32 T4 SHIPPED — 2026-04-15

**Milestone:** Task Planner (Phase 5 — Intelligence Layer). In progress (5 of 11 tasks shipped).
**Scope shipped this session:** Promoted WriteSideEventType literals into canonical EventType union (+6 members), extended AgentStepKind (+3 write-side step kinds), shipped 6 JSON-safe payload types, swapped `satisfies WriteSideEventType` → `satisfies EventType` in agentic-tools-write.ts (6 sites), added 3 minimal step-card case branches (ticket_created/delegation_made/review_pending) with `data-step-kind` stable E2E selectors. T2 string-literal immunity confirmed (25/25 untouched).
**Commit:** T4 = `dd17eff`.
**Session window:** 2026-04-15T18:30:00Z → 2026-04-15T18:50:00Z.

### Metrics delta

| Metric | Pre-T4 | Post-T4 | Delta |
|---|---:|---:|---:|
| Unit tests | 1000 | 1003 | +3 |
| E2E specs | 8 | 8 | 0 |
| Lint errors | 0 | 0 | 0 |
| Lint warnings (workspace) | 24 | 24 | 0 |
| Typecheck across 6 packages | clean | clean | — |
| Files touched | — | 4 (+266 / −13) | — |

### What shipped

**`packages/shared-types/src/events.ts`** — EventType union gains 6 members (`plan.proposed`, `plan.approved`, `task.delegated`, `task.escalated`, `review.requested`, `review.completed`). AgentStepKind gains 3 members (`ticket_created`, `delegation_made`, `review_pending`). 6 new payload interfaces: PlanProposedPayload (subtask tree with assignee+complexity), PlanApprovedPayload (M33 forward — approval with ticket ids), TaskDelegatedPayload (receipt with fallback+attempts), TaskEscalatedPayload (reason+original assignee), ReviewRequestedPayload, ReviewCompletedPayload (outcome+escalation flag). AgentStepPayload data doc extended with 3 new kind shapes. AgenticRunSnapshot.steps picks up the extended AgentStepKind automatically — no wire-shape change.

**`apps/desktop/src/main/services/agentic-tools-write.ts`** — `import type { EventType } from '@team-x/shared-types'` added. All 6 `satisfies WriteSideEventType` replaced with `satisfies EventType`. Local WriteSideEventType kept as documentation type. WriteSideEventBus interface stays `type: string` for width compatibility.

**`apps/desktop/src/renderer/src/features/command/step-card.tsx`** — 3 new case branches before exhaustiveness guard: ticket_created (emerald border, Check icon), delegation_made (sky border, GitBranch icon), review_pending (amber border, Brain icon). Minimal rendering — T6 adds full detail + data narrowing. `data-step-kind` attributes present as stable E2E selectors. GitBranch added to lucide imports.

**`packages/shared-types/src/events-m32.test.ts`** (NEW) — 3 type-level assertion tests: (1) EventType union includes all 6 planner events via `expectTypeOf` + runtime array length check; (2) AgentStepKind includes 3 write-side kinds via `expectTypeOf` + AgentStepPayload construction with `kind: 'ticket_created'`; (3) all 6 payload interfaces constructed with correct discriminator shapes + field assertions.

### Gotchas captured

- **Exhaustiveness guard in step-card.tsx breaks on AgentStepKind extension.** The `const _exhaust: never = step.kind` catches new kinds at compile time. T4 MUST add case branches for every new kind — even minimal ones — to keep typecheck green. T6 fleshes out the full design; T4 just needs the exhaustiveness guard to pass and `data-step-kind` selectors to exist.
- **`PlanApprovedPayload` is forward-looking (M33).** No tool currently emits `plan.approved` — it's reserved for the Copilot service's plan-approval flow. Included per the T4 plan-doc spec to avoid a shared-types churn commit in M33.
- **Biome auto-format on the test file** — object literal formatting was tightened by biome check --write. Run biome before commit to avoid a two-commit dance.

### Next Session Startup Checklist (M32 T5+)

1. Read this CONTINUITY file — most recent session at the top.
2. Read `.loki/state/orchestrator.json` → `inFlightMilestone.M32.commits` shows T0–T4 shipped; `tasksCompleted: 5`; baseline 958 / current 1003.
3. Read `.loki/queue/pending.json` → `tasks` array shows T0–T4 with `status: shipped`.
4. **T5 = Confirmation gates** in the command palette for write-side agentic runs. `command.execute` extends its `confirmed?: boolean` field to detect write-side intents (heuristic: verbs like "decompose", "delegate", "create tickets", "review"). If detected AND `confirmed !== true`, returns `{ needsConfirmation: true, gateKind: 'write-side' }` before dispatching the loop. Palette renders confirmation card. Accept → re-call with `confirmed: true`. Reject → clean close. Existing M30 gates (fire/close/end-meeting/promote) unchanged. `skipConfirmation: true` opt-out for M33 Copilot. +8 unit tests.
5. **T6 = Full step-card variants + AuditView chips.** The T4-minimal step-card branches get full rendering with data narrowing, detail text, and color polish. AuditView event-type filter chips must include the 6 new EventType members.
6. Commit cadence: `feat(m32): M32 T<N> — <summary>`, then `chore(loki): M32 T<N> — commit ledger (<sha>)`.

---

## M32 T3 SHIPPED — 2026-04-15

**Milestone:** Task Planner (Phase 5 — Intelligence Layer). In progress (4 of 11 tasks shipped).
**Scope shipped this session:** Level-based tool-registry injection on `AgenticLoopService` + schema-identical test seam for the three write-side tools. The agentic loop is now level-gated end-to-end from composition root → service → LLM tool registry. M31 wire contract and default semantics preserved — callers that omit `employeeId` still resolve to system-agent.
**Commit:** T3 = `8bf1e9e`.
**Session window:** 2026-04-15T18:00:00Z → 2026-04-15T18:20:00Z (code commit at 18:11 Pacific; ledger commit follows this session).

### Metrics delta

| Metric | Pre-T3 | Post-T3 | Delta |
|---|---:|---:|---:|
| Unit tests | 989 | 1000 | +11 |
| E2E specs | 8 | 8 | 0 |
| Lint errors | 0 | 0 | 0 |
| Lint warnings (workspace) | 24 | 24 | 0 |
| Typecheck across 6 packages | clean | clean | — |
| Files touched | — | 5 (+744 / −24) | — |

### What shipped (one feat commit, five files)

**Service layer — `apps/desktop/src/main/services/agentic-loop-service.ts` (+107 LOC):**

- New types `AgenticLoopEmployeeContext` + `AgenticLoopEmployeeLookup` — the actor identity the loop threads through every touchpoint.
- `AgenticLoopEmployeesRepo` widened with optional `getById(employeeId): AgenticLoopEmployeeLookup | null` — keeps M31 surface untouched while enabling explicit actor resolution.
- `buildTools` deps signature now carries `employee: AgenticLoopEmployeeContext` so level-based composition happens at the service boundary, not inside the scheduler.
- `StartArgs` gains optional `employeeId?: string`. `start()` resolves the actor via either the explicit `getById` path or a default fallback to the system-agent. Cross-company isolation is validated before dispatch (a fetched employee with a mismatched `companyId` is rejected). `actorEmployee` threads through members / runs row / message authors / bus-event `authorId`.
- Critical wire-stability detail: the `RunState.systemAgentId` field name is preserved even when the actor is NOT the system agent. This keeps M31's wire contract stable — renderers keyed on `systemAgentId` don't need patching. Internally the field holds `actorEmployee.id` regardless.

**Test seam — NEW `apps/desktop/src/main/services/test-agentic-tools.ts` (+298 LOC):**

- `ECHO_WRITE_SENTINEL` literal + per-tool canned tables — the `__ECHO_WRITE__:[…]` JSON sentinel short-circuits to a deterministic envelope, the canned per-prompt table handles test fixtures, the fallback produces a deterministic default. Three-tier resolution mirrors `test-classifier.ts` (M30 T8) and `test-agentic-provider.ts` (M31 T3) posture.
- Schema-identical `decompose_project` / `delegate_subtask` / `review_deliverable` factories — the zod schemas match production `agentic-tools-write.ts` byte-for-byte so the LLM sees the same tool surface under `NODE_ENV=test`.
- `createTestToolsForEmployee(employee, companyId, deps)` — level-gated composer that mirrors `buildWriteSideTools` exactly. Supervisor/Lead get `[delegate_subtask, review_deliverable]`; Management/system get all three; Officer/Senior-Mgmt get `[decompose_project]`; IC gets `[]`. Lockstep invariant: if production gates change, this must change in the same commit.
- `createTestWriteSideTools(employee, deps)` — standalone factory for unit-test consumption (no composition required).

**Composition root — `apps/desktop/src/main/index.ts` (+131 LOC):**

- `buildTools` closure receives `employee` and branches on `testMode`. Production: `[...readSideTools, ...buildWriteSideTools(employee, writeSideDeps)]`. Test: `createTestToolsForEmployee(...)`.
- Production `writeSideDeps` carries:
    - **Workload provider** — conservative open-ticket count from `ticketsRepo.countOpenByAssignee(employeeId)` for `load`. `inMeeting` and `avgCompletionDays` are stubbed (returns `false` and `0` respectively) and explicitly annotated as M33-pending. This is deliberate — M32 ships the Task Planner with a conservative workload shape; M33 wires the observability layer.
    - **Write-side orchestrator enqueue** — a no-op today. M33 wires the real path when the Copilot service starts issuing directives autonomously. Preserving the hook surface avoids a future breaking change.
    - **`WriteSideCompleteFn`** — wraps `streamAgent` to resolve the ACTOR's provider per call (not the system agent's). A CTO running through `decompose_project` uses the CTO's provider pref, not the copilot's.
- `employeesRepo` facade gains `getById(id)` → maps `EmployeeRow → AgenticLoopEmployeeLookup` with `isSystem: row.is_system ?? false` null-safe fallback (Drizzle nullable column semantics).

**Service tests — `agentic-loop-service.test.ts` (+115 LOC, +4 tests):**

- **M32 T3 default-actor capture** — omitting `employeeId` captures the system-agent row onto `RunState` (name + id) and preserves M31's wire contract.
- **M32 T3 explicit employeeId resolution** — passing an `employeeId` resolves via `getById()`, authors outgoing messages as that employee, and tags bus events with `authorId: employee.id`.
- **M32 T3 unknown id throws side-effect-free** — an unresolvable `employeeId` throws before any side effect (no members, no runs row, no bus events).
- **M32 T3 cross-company guard** — an employee from company A passed to a run for company B is rejected.

**Test-seam tests — NEW `test-agentic-tools.test.ts` (+117 LOC, +7 tests):**

- System-agent gets all three write-side tools.
- IC gets none (read-only loop).
- Officer + Senior-Mgmt get `decompose_project` only.
- Management + system get all three.
- Supervisor + Lead get `delegate_subtask` + `review_deliverable`.
- `createTestWriteSideTools` standalone factory produces `[]` for IC.
- `createTestWriteSideTools` is schema-identical to production `buildWriteSideTools` (zod schema shape identity check).

### Verification gates passed (per commit message)

- `pnpm -r typecheck` clean across all 6 workspaces.
- `biome check` clean on the 5 touched files (auto-fixed import order in `main/index.ts` and `test-agentic-tools.test.ts` during the work; biome recommit clean).
- `vitest`: `agentic-loop-service.test.ts` (25), `test-agentic-tools.test.ts` (7), `agentic-tools-write.test.ts` (25), `agentic-tools.test.ts` (40) all green.

### Gotchas captured this session

- **`systemAgentId` field name stability is non-negotiable.** The renderer-side hooks and E2E selectors introduced in M31 T5/T6 key on this name. Widening the semantic to "actor id (defaults to system-agent)" without renaming is the right call — renaming would cascade a patch across the palette, the Copilot thread surface, and the `agentic-loop.spec.ts` spec.
- **Cross-company isolation check belongs in `start()`, not `buildTools`.** Putting it in `buildTools` leaks per-call cost and only catches the first tool call, not the run dispatch. The guard fires before any membership/run row/bus event is created — side-effect-free rejection is the contract.
- **Workload provider's `inMeeting` / `avgCompletionDays` stubs are deliberate.** The deterministic scorer accepts them; M33 wires the live observability layer. Don't chase them before M33 — the stubs keep the write-side loop shippable at M32 with conservative-by-design workload estimates.
- **Biome auto-fix import-order behavior** — `main/index.ts` and `test-agentic-tools.test.ts` triggered the import sorter. Running `biome check --write` before the work commit is the correct posture; catching it after commit would require a noisy follow-up.

### Patterns reinforced

- **Three-tier canned seam pattern is now the canonical shape for every agentic surface.** `test-classifier.ts` (M30) + `test-agentic-provider.ts` (M31) + `test-agentic-tools.ts` (M32) form the locked triad. Every new agentic surface ships with a matching `__ECHO_*__` sentinel + canned table + fallback. Any breaking change to the sentinel format ripples across all three.
- **Lockstep invariant: production gate and test gate change in the same commit.** Both `buildWriteSideTools` (agentic-tools-write.ts, production) and `createTestWriteSideTools` (test-agentic-tools.ts, test) branch on the same `EmployeeLevel` set. Splitting the change across commits creates a window where the test seam drifts from prod — reject any such PR in review.
- **Wire-stability field names trump semantic precision** when renaming would cascade across the renderer. `systemAgentId` now means "actor id, defaulting to system-agent" — the widening is reflected in documentation, not in code.

### Next Session Startup Checklist (M32 T4+)

1. Read this CONTINUITY file — most recent session at the top.
2. Read `.loki/state/orchestrator.json` → `inFlightMilestone.M32.commits` shows T0+T1+T2+T3 shipped; `tasksCompleted: 4`; baseline 958 / current 1000.
3. Read `.loki/queue/pending.json` → `tasks` array shows T0+T1+T2+T3 with `status: shipped`. T4–T10 spec lives in the M32 plan doc.
4. **T4 is the shared-types promotion.** Promote the `WriteSideEventType` literals from `agentic-tools-write.ts` into the canonical `EventType` union in `packages/shared-types/src/events.ts`. Add `AgentStepKind` variants `'ticket_created' | 'delegation_made' | 'review_pending'` plus matching `AgentStepPayload` narrow-types. Replace `'plan.proposed' satisfies WriteSideEventType` annotations in tool bodies with `satisfies EventType` for canonical narrowing.
5. **T4 must ALSO rebuild shared-types dist.** The composite-TS-project gotcha is resolved via `packages/shared-types/package.json::scripts.typecheck = tsc --build` (commit 83e0868) — `pnpm -r typecheck` now emits dist/\*.d.ts automatically, no manual `tsc --build --force` dance required. But if you add new exported types, confirm the dist reflects them via a clean `rm -rf packages/shared-types/dist && pnpm -r typecheck`.
6. **T4 string-literal immunity check.** T2's `agentic-tools-write.test.ts` uses string-literal discriminators (`type: 'plan.proposed'` etc.) by construction, so adding new EventType variants should NOT regress T2. If it does, the T4 commit has renamed the discriminator field — that's a breaking change and the commit is wrong.
7. **T5 = confirmation gate** for destructive writes (`decompose_project` creating tickets, `delegate_subtask` creating delegations). Mirrors the M30 T4 gate for `fire` / `close` / `end-meeting` / `promote` — a `confirmed: true` flag on the palette-level intent that must be set before the tool actually fires.
8. **T6 = step-card variants** for the three new `AgentStepKind`s. Update `apps/desktop/src/renderer/palette/step-card.tsx` in lockstep with the shared-types promotion. `data-step-kind="ticket_created" | "delegation_made" | "review_pending"` as stable E2E selectors.
9. Commit cadence: `<type>(m32): M32 T<N> — <summary>` for the work commit, immediately followed by `chore(loki): M32 T<N> — commit ledger (<sha>)` updating orchestrator.json + pending.json + CONTINUITY.md.
10. After T10, move M32 from `inFlightMilestone` into `history`, set `currentMilestone: 'M33'`, rewrite CONTINUITY top with M32-COMPLETE header + commit table.

### Open items carried into T4+

- F1 and F2 follow-ups are closed (T0 + T1 of M32).
- `agentic-loop.spec.ts` does not yet exercise the write-side surface. Recommend extending it (or adding a `task-planner.spec.ts`) during T8 so both the `ticket_created` / `delegation_made` / `review_pending` step kinds and the confirmation gate have E2E coverage.
- No open bugs. No failing tests. No signal files in `.loki/signals/`.

---

## M32 T2 SHIPPED — 2026-04-15

**Milestone:** Task Planner (Phase 5 — Intelligence Layer). In progress.
**Scope shipped this session:** Write-side agentic tools — `decompose_project`, `delegate_subtask`, `review_deliverable` — plus the deterministic workload scorer locked to Phase 5 §7.4 weights. New file `apps/desktop/src/main/services/agentic-tools-write.ts` (~1,150 LOC) and companion test file `agentic-tools-write.test.ts` (25 tests, all green). No changes to read-side or existing services — T3 is the integration step.
**Commit:** T2 = `cdf7315`.
**Session duration:** 2026-04-15T15:55:00Z → 2026-04-15T16:10:00Z.

### Metrics delta

| Metric | Pre-T2 | Post-T2 | Delta |
|---|---:|---:|---:|
| Unit tests | 964 | 989 | +25 |
| E2E specs | 8 | 8 | 0 |
| Lint errors (new files) | 0 | 0 | 0 |
| Lint warnings (workspace) | 24 | 24 | 0 |
| Typecheck across all packages | clean | clean | — |

### What shipped (one file, one test file, one commit)

- **`agentic-tools-write.ts`** — three Tool factories matching M31 T2's read-side API shape:
  - `buildDecomposeProjectTool(deps)` — gates on `planner_max_depth` + `planner_approval_level`, calls `deps.providerComplete` once for the LLM-side subtask generation, scores every visible employee against every parsed subtask via `scoreEmployee`, returns `DecomposedPlan = { planId, projectId, goalId, subtasks: PlanSubtask[], truncated }`. Emits `plan.proposed`. Truncates to `planner_max_tickets` and surfaces the `truncated` marker so the loop can re-plan with a tighter cap.
  - `buildDelegateSubtaskTool(deps)` — validates the assignee chain (primary → fallbacks), skips over-load-cap candidates, accepts the first available, calls `ticketsRepo.create` + `ticketsRepo.assign`, links to project via `projectsRepo.linkTicket` when `parentProjectId` is supplied, emits `task.delegated`. On exhausted chain, increments `EscalationTracker.recordFailure(planId)` and emits `task.escalated` once `planner_escalation_threshold` is crossed. Returns `DelegationResult = { ticketId, assigneeId, assigneeName, status, fallbackUsed, attemptCount }`.
  - `buildReviewDeliverableTool(deps)` — guards on `ticket.status === 'done'`, emits `review.requested` up front (so renderer can render a pending card before the LLM call), runs one `deps.providerComplete` for a plain-language summary, emits `review.completed`. On `action: 'reject'` with `planId`, increments tracker and emits `task.escalated` on threshold. Returns `ReviewResult = { ticketId, outcome, summary, escalated }`.
- **Deterministic `scoreEmployee(employee, subtask, ctx)`** — pure, exported, locked to weights `0.4·role_fit + 0.3·(1-load_ratio) + 0.2·availability + 0.1·past_performance`. Past-performance defaults to 0.5 when `avgCompletionMs === null` (new hires not penalized). System / archived / fired employees score `0`.
- **`computeRoleFit`** — keyword heuristic over employee `title` + `level` (Risk #2 option (b) per the M32 plan). Engineer titles match `implement` subtasks above level baseline; non-matching titles fall to `LEVEL_BASELINE_FIT` (officer/sm/management = 0.55, supervisor/lead = 0.5, ic = 0.45, system = 0). Capabilities-frontmatter enrichment is the deferred M33/M34 follow-up.
- **`buildWriteSideTools(employee, deps)`** — level-gated composer. ICs return `[]`. Officer/Senior-Mgmt → decompose only. Supervisor/Lead → delegate + review. Management/system → all three.
- **`PLANNER_DEFAULTS`** — module constants matching design §11 defaults: `maxTickets=10`, `maxDepth=2`, `approvalLevel='management'`, `escalationThreshold=3`, `loadDenominator=5`, `pastPerformanceCeilingMs=48h`. T7 will swap the static accessor for the settings repo via `deps.getPlanner`.
- **`WriteSideEventBus` interface** — `type: string` (wider than `EventType`), so the existing `AgenticLoopEventBus` drops in unchanged for T3 wiring before T4 promotes the six new event-type literals into the canonical union.
- **`EscalationTracker`** + `createInMemoryEscalationTracker()` — per-plan failure counter. T3 will pin one tracker per `runId`.
- **25 unit tests** — score determinism (10 round-trip cases), weights sum 1.0, system/archived/fired score 0, availability/load/past-perf monotonicity, role-fit heuristic correctness, decompose clamps + approval-level gate, JSON-safe envelope round-trip via `JSON.stringify/parse`, delegate happy path + fallback chain + escalation threshold + project linkage, review unfinished-ticket reject + happy path + reject+threshold escalation, composer level-gating across all six levels, bus-emit-throws non-fatal.

### Verification gates passed

- `pnpm -r typecheck` — clean across all six packages on first run after fixing one strict-noUncheckedIndexedAccess error in `isApprovedLevel` (replaced `?? rank.management` with explicit `?? MGMT_RANK` literal).
- `pnpm exec biome check apps/desktop/src/main/services/agentic-tools-write*.ts` — 0 errors after one auto-fix pass (quote style + multi-line concat → template literal).
- `pnpm test` repo-wide — 989 / 989 pass (+25 from M32 baseline of 964). Single pre-existing sqlite-vec test failure in `vec-init.test.ts` is unrelated and predates M32.
- Tests targeted at the new file pass in 21ms with no flakes across 3 separate runs.

### Gotchas captured this session

- **`tsc --strict noUncheckedIndexedAccess` chains** — `Record<string, number>` indexed access returns `number | undefined`. The `?? fallback` only narrows if the fallback itself is non-undefined; pulling another `rank.x` from the same record stays possibly-undefined. Fix: bind a literal-typed const (`const MGMT_RANK = 3`) and use that as the nullish fallback. Pattern applies anywhere we use `Record<K, V>` rank/lookup tables.
- **Biome `noUselessStringConcat` is unsafe-fix only** — multi-line `'foo' + 'bar' + 'baz'` chains for long strings are flagged but the rewrite to a single template literal must be done by hand or with `--write --unsafe`. We did the rewrite by hand for the one decompose system-prompt to keep the auto-fix surface explicit.
- **Width-compatible bus seam pattern** — when a downstream task (T4) will widen / promote a string-literal union into the canonical type, the in-progress task can declare its own `interface SomethingBus { emit<T>(input: { type: string; ... }) }`. The existing strongly-typed bus passes structurally because `string` is wider than the constrained union. Avoids touching `shared-types` out of order.
- **Test-file `vi.fn` import is needed** — Biome auto-fix will remove it if `vi` is not used. Keep it explicit in the import for orchestrator stub even if mock-call assertions aren't currently asserted on; future tests will lean on it.

### Patterns reinforced

- **Repo + test mirror M31 T2 discipline** — same hand-rolled fake repos, same `{rows, truncated}` envelope vocabulary (extended with `{created, escalated}` for write-side artifacts), same `checkAborted(ctx)` first-line guard in every `execute`, same `Object.freeze` on returned arrays for runtime immutability.
- **JSON-safe envelopes are testable** — every result type round-trips through `JSON.stringify(parse(x))` cleanly. The test asserts this directly for `decompose_project` to lock in the no-Date / no-Buffer / no-Drizzle-row contract.
- **One LLM call per tool body, never per loop iteration** — `decompose_project` and `review_deliverable` each invoke `providerComplete` exactly once. The outer ReAct scheduler holds its own provider slot. Risk #1 in the M32 plan (nested provider dispatch under one loop run) stays at 2x slot cost as documented; revisit if cap pressure surfaces.
- **Defense in depth for level gating** — `buildWriteSideTools` filters at registry construction AND `decompose_project`'s body re-checks `isApprovedLevel(actor.level, planner)`. Mirrors the read-side `isSystem` belt-and-suspenders pattern.

### Next Session Startup Checklist (M32 T3+)

1. Read this CONTINUITY file — most recent session at the top.
2. Read `.loki/state/orchestrator.json` → `inFlightMilestone.M32` for T0+T1+T2 shipped state + `tasksCompleted: 3`, `baseline.unitTests: 964`, current at 989.
3. Read `.loki/queue/pending.json` → `tasks` array shows T0 + T1 + T2 with `status: shipped`. T3 spec lives in the M32 plan doc §"T3: Extend AgenticLoopService — tool registry injection by level".
4. **T3 is the integration step.** New `buildToolsForEmployee(employee, companyId): Tool[]` on `AgenticLoopService` that returns `[...readSideTools(companyId), ...buildWriteSideTools(employee, deps)]`. Add an optional `employeeId` field to `AgenticLoopService.start()` request — default resolves to system-agent (M31 semantics preserved). Composition root in `main/index.ts` swaps to `createTestAgenticTools` + write-side test seam under `NODE_ENV=test`.
5. **T3 also extends `test-agentic-tools.ts`** with a three-tier seam mirror (`__ECHO_WRITE__:[...]` sentinel → canned per-prompt table → fallback) for the three new tools. Deterministic envelopes per tool name. Mirrors M31 T8's `test-agentic-tools.ts` posture — production + dev use `createAgenticTools`, only `NODE_ENV=test` swaps in.
6. **T4 promotes the `WriteSideEventType` literals** into the canonical `EventType` union in `packages/shared-types/src/events.ts`, plus `AgentStepKind` gets `'ticket_created' | 'delegation_made' | 'review_pending'` and `AgentStepPayload` variants. The `WriteSideEventBus` interface in `agentic-tools-write.ts` already has `type: string` — no breaking change required, but the `'plan.proposed' satisfies WriteSideEventType` annotations in the tool bodies should be replaced with `satisfies EventType` for the canonical narrowing.
7. T2 unit tests are immune to T4's shared-types changes by construction (string-literal `type: 'plan.proposed'` etc.). Adding new event-payload narrow types in T4 should NOT regress T2 tests; if it does, the discriminator field name has changed and the T4 commit is wrong.
8. Commit cadence per CLAUDE.md + M32 plan: `<type>(m32): M32 T<N> — <summary>` for the work commit, `chore(loki): M32 T<N> — commit ledger (<sha>)` immediately after, updating orchestrator.json + pending.json + CONTINUITY.md.
9. After T10, move M32 from `inFlightMilestone` into `history`, set `currentMilestone: 'M33'`, rewrite CONTINUITY top with M32-COMPLETE header + commit table.

---

## M32 T0 + T1 SHIPPED — 2026-04-15

**Milestone:** Task Planner (Phase 5 — Intelligence Layer). In progress.
**Scope shipped this session:** M31 follow-ups F1 + F2 (see M31 `followUps` in orchestrator history).
**Commits:** T0 = `f515ea7` (F1 backfill), T1 = `62a0504` (F2 invalidator).
**Session duration:** 2026-04-15T15:18:00Z → 2026-04-15T15:27:00Z.

### Metrics delta

| Metric | Pre-T0 | Post-T1 | Delta |
|--------|--------|---------|-------|
| Unit tests | 958 | **964** | **+6** (4 agentic-loop-service + 2 command-handlers) |
| E2E specs | 8 | **8** | 0 (no new specs — renderer-only fixes) |
| Lint errors | 0 | **0** | 0 |
| Lint warnings | 24 | **24** | 0 |
| Typecheck | clean | **clean** | 0 |

### T0 — F1 useAgentStepStream backfill on mount (`f515ea7`)

**Root cause closed:** Under fast providers (canned seam, small local models) the agentic loop completes in sub-millisecond time and every `agent.step` / `agentic.completed` event fires before the React bus subscription attaches — the palette step-log would show only the terminal answer card (or nothing at all). Documented as F1 in [design doc §14](../docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md#14-follow-ups-post-m31).

**Fix shape (10 files, 417 insertions):**

| Layer | File | Change |
|-------|------|--------|
| shared-types | `packages/shared-types/src/events.ts` | New `AgenticRunSnapshot` wire type — `{ runId, threadId, steps: AgentStepPayload[], terminal: {kind:'completed',payload}\|{kind:'failed',payload}\|null }`. Terminal discriminated-union mirrors the hook's `AgentStreamResult` byte-for-byte. |
| shared-types | `packages/shared-types/src/ipc.ts` | New `command.getRunSnapshot` IPC channel + `TeamXApi.command.getRunSnapshot(runId)` surface. Imports `AgenticRunSnapshot`. |
| main/services | `agentic-loop-service.ts` | New `getRunSnapshot(runId)` method on the service interface + implementation. Pure projection of `state.steps` via existing `projectStepBody()` into JSON-safe `AgentStepPayload[]` + terminal synthesis that matches `finishRun()`'s emit shape exactly. Returns `null` for unknown / evicted runs. |
| main/services | `agentic-loop-service.test.ts` | +4 tests: null for unknown, projection+completed terminal, in-flight terminal=null, failed projection with reason parity. |
| main/ipc | `command-handlers.ts` | Thin `command.getRunSnapshot` adapter — imports `AgenticRunSnapshot`, adds channel to `CommandHandlers` record, registers handler factory. |
| main/ipc | `command-handlers.test.ts` | +2 tests: forwards runId + echoes projection, returns null untouched for unknown runId. `makeAgenticMock` extended with `getRunSnapshot` + 5→6 expected channel keys. |
| main | `index.ts` | `ipcMain.handle('command.getRunSnapshot', ...)` registration next to `command.stop`. |
| preload | `api.ts` | `commandGetRunSnapshot` channel constant + `command.getRunSnapshot(runId)` bridge method + `AgenticRunSnapshot` import. Biome auto-formatted on save. |
| renderer | `hooks/use-agent-step-stream.ts` | Hook signature extended — `useAgentStepStream(threadId, runId?)`. On mount, if runId provided: one-shot `ipc.command.getRunSnapshot(runId)` call BEFORE listener attach. `seen: Set<string>` keyed by `(runId, stepIndex)` absorbs any step that races the backfill. `result` latches to whichever of snapshot terminal / live terminal arrives first. Silent catch on IPC failure — falls through to live-only, matching pre-F1 behavior. |
| renderer | `features/command/command-palette.tsx` | `StepLogView` passes `runId` to the hook (already available as a prop; comes back from `command.execute`'s `{ runId, threadId }` response). |

**Wire-shape invariant:** The snapshot's `AgentStepPayload[]` is byte-for-byte identical to what `agent.step` emits on the bus. Any wire drift breaks the `(runId, stepIndex)` dedup. If a future write-side step kind (`ticket_created`, `delegation_made`, `review_pending`) is added, extend `AgentStepKind` in `events.ts` AND the switch in `projectStepBody` AND the hook's merge logic in lockstep.

### T1 — F2 useThreadList bus invalidator (`62a0504`)

**Root cause closed:** `useThreadList` had no dashboard event subscription — a thread list opened before an agentic run completes showed stale "No threads yet" copy until manual refetch, so users missed the live Copilot thread. Documented as F2 in design doc §14.

**Fix shape (1 file, 25 insertions):**

- `apps/desktop/src/renderer/src/hooks/use-chat.ts` — `useThreadList(companyId)` gains a `useEffect` that subscribes to `ipc.events.onDashboard`, invalidates `['threads', companyId]` on `agentic.completed` / `agentic.failed`, and cleans up on unmount. Satisfies architectural invariant #11 (IPC mutations must emit a bus event; renderer caches subscribe for invalidation).

No new tests — the invalidator is declarative plumbing with no branching. The workspace's Vitest config is node env (no jsdom wiring), so renderer-hook tests would require new infrastructure. Future M32 write-side E2E specs will exercise this path naturally when the Copilot thread list renders during a live agentic run.

### Gotchas captured this session

1. ~~**Composite TS project references read shared-types `dist/*.d.ts`, not `src/`.**~~ **RESOLVED same session (plan-doc follow-up).** Root cause was `packages/shared-types/package.json::scripts.typecheck = "tsc --noEmit"` — this passed without emitting `dist/`, so downstream composite-reference consumers kept reading stale declarations. Fix: change `typecheck` to `tsc --build` (always emits + incremental, so no perf hit on clean runs) and add `build: tsc --build --force` + `clean: tsc --build --clean`. Verified: `rm -rf packages/shared-types/dist && pnpm -r typecheck` is green end-to-end across all six packages. The manual `cd packages/shared-types && npx tsc --build --force` dance is no longer required. M32 plan doc T4 + T10 updated in lockstep.
2. **ABI rebuild dance required before unit tests.** Initial `pnpm -F @team-x/desktop test` run after switching from E2E surfaced `NODE_MODULE_VERSION` mismatch on better-sqlite3 for `vec-init.test.ts` and `embeddings.test.ts`. Node ABI rebuild via `cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npx node-gyp rebuild --release` fixed both. Carries forward from M31's T10 guidance.

### Patterns reinforced

- **Pre-flight reconnaissance via `ctx_batch_execute`.** Single batched call with 8 commands + 6 queries replaced what would have been 14+ individual Bash/Read calls for pre-edit reconnaissance. Keeps context lean for the long implementation tail.
- **Atomic per-task commits with descriptive commit bodies.** T0 and T1 shipped as two separate commits, each with the what/why/test-count captured in the body. Mirrors the M30/M31 ledger pattern. The ledger commit follow-up is the next task below.

### Next Session Startup Checklist (M32 T2+)

1. Read this CONTINUITY file — most recent session at the top.
2. Read `.loki/state/orchestrator.json` → `inFlightMilestone.M32` for the T0+T1 shipped state + `currentMilestone: 'M32'`, `tasksCompleted: 2`, `baseline.unitTests: 964`.
3. Read `.loki/queue/pending.json` → `tasks` array has T0 + T1 marked `shipped`; `totalTasks` is `null` until the M32 plan doc is written and T2+ get filed.
4. **Write the M32 plan doc** at `docs/plans/2026-04-15-team-x-phase-5-m32-task-planner.md`. Structural template: M31 plan doc. Required sections: Overview, What ships, Invariants preserved, Success criteria, Task breakdown (T2–TN), Acceptance criteria (reiterate three-tier test seam + ABI rebuild dance + atomic-commit discipline + **new: shared-types dist rebuild step after type changes**).
5. T2+ headline — write-side tool set (`decompose_project`, `delegate_subtask`, `review_deliverable`):
   - Production impl in `apps/desktop/src/main/services/agentic-tools-write.ts` (new file) or extend `agentic-tools.ts` with a separate exports block.
   - Extend `test-agentic-tools.ts` with write-side cases.
   - New bus event types: `plan.created`, `plan.updated`, `task.delegated`, `task.reviewed`, `review.approved`, `review.rejected`. Add to `EventType` union in `events.ts` + any specific payload types needed.
   - Extend `AgentStepKind` with new write-side kinds: `ticket_created`, `delegation_made`, `review_pending` — and update the hook's merge logic + the palette's `step-card.tsx` variants in lockstep.
   - Audit-log visibility — AuditView event-type filter chips must include the new events.
   - Confirmation gates for destructive writes (ticket creation, delegation).
6. Guardrails remain tool-level, not prompt-level (design decision D6). Workload scoring stays deterministic (D7).
7. Commit atomically per task; follow-up with `chore(loki): M32 T<N> — commit ledger (<sha>)` commits.

## M31 COMPLETE — 2026-04-15

**Milestone:** Agentic Loop (read-side).
**Phase:** 5 — Intelligence Layer.
**Duration:** 2026-04-14 → 2026-04-15 (T0 opened 2026-04-14T02:15:00Z, T10 final verification passed 2026-04-15T21:20:00Z).
**Plan doc:** [`docs/plans/2026-04-14-team-x-phase-5-m31-agentic-loop.md`](../docs/plans/2026-04-14-team-x-phase-5-m31-agentic-loop.md).
**Design reference:** [`docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md`](../docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md) §4 + §7 + §14 (new follow-ups).

### Metrics delta

| Metric | Baseline (post-M30) | Target | Final | Delta |
|--------|---------------------|--------|-------|-------|
| Unit tests | 819 | ~905 | **958** | **+139** (exceeded target by +53) |
| E2E specs | 7 | 8 | **8** (8/8 green) | **+1** |
| Lint errors | 0 | 0 | **0** | 0 |
| Lint warnings | 66 | ≤76 | **24** | **-42** (improved) |
| Typecheck | clean | clean | **clean** | 0 |

### Tasks shipped (11/11)

| Task | Commit | Deliverable | Tests |
|------|--------|-------------|-------|
| T0 | `4f30efa` | System-agent seed + `is_system` column (migration 0010) + partial index + `system-agent.md` role card under `role-packs/strategia-official/roles/system/` + `ensureSystemAgent(companyId)` bootstrap | +89 employees.test + 151 bootstrap.test + 72 ipc/handlers tests |
| T1 | `67e0136` | `@team-x/intelligence/src/loop/` — pure ReAct scheduler, tool registry, prompt builder, loop factory. Zero Electron/DB/fs coupling. Forward-scan brace-balanced JSON parser with one-shot nudge recovery. Hard step/token/wall-clock budgets | +33 unit (19 loop + 8 tool-registry + 6 prompt) |
| T2 | `7b5c4f9` | `agentic-tools.ts` — 6 read-only tools wrapping employees/tickets/projects/meetings/vault/events repos with `{rows, truncated}` envelopes (50-row cap, 200-char summary) + defensive `isSystem` filter on employees | +40 unit |
| T3 | `791e6f6` | `AgenticLoopService` — `start/stop/getRun/waitForRun`, pause-aware `providerRouter.complete` wrapper (polls `orchestrator.isCompanyPaused`), `AbortController` with canceled-status coercion, `agent.step`/`agentic.completed`/`agentic.failed` bus events + shared-types payloads, `runs` row with kind `'agentic'`. `test-agentic-provider.ts` three-tier canned seam (sentinel/table/fallback) | +25 unit (17 service + 8 provider) |
| T4 | `179569a` | CommandService → AgenticLoopService wiring. `CommandHandlers.agenticLoopStart(req): { runId, threadId }` mirrors `employeesFire`/`employeesPromote` shape; replaces T4 M30 stub at `command-service.ts:770-775` with real dispatch. `ExecuteResult` gains `runId`/`threadId`. Composition root `main/index.ts` wires test-mode swap | +5 unit |
| T5 | `0cd9e76` | System-agent thread UX — Copilot Conversations section in chat sidenav (Sparkles icon, read-only compose), persisted step transcript rendered inline in chat drawer with step-card variants, `useAgentStepStream` hook + `system-agent-badge.tsx` | +6 unit |
| T6 | `29ed9d2` | Palette step-log mode — 6 UI states, `data-step-kind` stable E2E selectors, provider+token footer per step, Cancel button, `command.stop` IPC channel + handler + preload bridge | +0 unit (E2E coverage in T8) |
| T7 | `51defad` | Settings — 3 clamped keys (`agentic_max_steps=8`, `agentic_max_tokens=8000`, `agentic_timeout_ms=120000`) with `settings.getAgentic`/`settings.setAgentic` IPC channels + Agentic Loop subsection in Settings → Runtime | +8 unit |
| T8 | `31227d1` | E2E spec `agentic-loop.spec.ts` — full round-trip via classifier/provider/tools seams. Canned classifier → complex_request → plan → query_employees tool call → tool result → grounded answer → persisted thread → audit row | +1 E2E (8/8 green) |
| T9 | `183562d` | Docs — CLAUDE.md status + Phase 5 block + IPC + bus events + troubleshooting; CHANGELOG [Unreleased] M31 entry; README tests-badge + Intelligence section + architecture refresh; `docs/user-guide/agentic-loop.md` (NEW, 247 LOC); `docs/user-guide/README.md` TOC; Phase 5 design doc §9 resequence + §10 + §11 + §13 + new §14 Follow-ups | 0 (docs-only) |
| T10 | (this ledger commit) | Verification — typecheck/lint/test/e2e all green; ABI rebuild dance documented; orchestrator.json M31→M32; pending.json cleared; CONTINUITY.md rewritten | 0 (state-only) |

### Scope preserved

- **Read-side only.** Six tools, zero writes. Write-side (`decompose_project` / `delegate_subtask` / `review_deliverable`) deferred to M32 per design decision D8 (locked 2026-04-14).
- **All 11 invariants honored.** Renderer pure view; orchestrator-only scheduler (pause-aware wrapper is additive, not a bypass); MCP host singleton untouched (agentic tools are main-process closures, NOT MCP — D10); provider router is the only LLM touch-point; SQLite + filesystem vault unchanged; events append-only (three new types); zero phone-home; keytar for secrets; role-pack overrides preserved for `system-agent.md`; adaptive runtime strategy; IPC mutations emit bus events (invariant #11 — `agent.step` fires on every step).

### Follow-ups queued (post-M31, pre-M32)

Both land in design doc [§14 Follow-ups](../docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md#14-follow-ups-post-m31). Recommend landing at M32 T0/T1 — both are renderer-only and small:

| # | Follow-up | Size |
|---|-----------|------|
| F1 | `useAgentStepStream` backfill on mount — under fast providers the loop completes before React Query attaches the bus subscription. Fix: `getSteps(runId)` query on mount before attaching the listener | ~20 LOC + 2–3 unit tests |
| F2 | `useThreadList` has no `agent.*` bus invalidator — stale "No threads yet" copy if the list was opened pre-run-complete | ~2 LOC + 1 unit test |

### Patterns to carry forward into M32

- **Three-tier canned test seam is the E2E pattern for every agentic surface.** Classifier + provider + tools each ship a `__ECHO_*__:<json>` sentinel + canned per-key table + fallback. Any M32 write-side tool (`decompose_project`, `delegate_subtask`, `review_deliverable`) MUST ship a matching `test-agentic-write-tools.ts` seam in lockstep — new production tools are not shippable without a test-mode swap in the composition root.
- **`{rows, truncated}` envelope is locked for all agentic tools.** 50-row cap. 200-char payload summary. The LLM tightens filters on truncation. Write-side tools may need a different envelope shape for confirmation artifacts (e.g., `{created: [...], failed: [...]}`) — but the read-side pattern is not negotiable.
- **`data-step-kind` stable selector pattern.** All step-card variants set `data-step-kind="plan" | "tool_call" | "tool_result" | "answer" | "error"`. Extend (don't replace) for M32 write-side step kinds — e.g., `data-step-kind="ticket_created"` or `"delegation_made"`.
- **Pause-aware `providerRouter.complete` wrapper.** Poll `orchestrator.isCompanyPaused(companyId)` on every provider call (default 250ms, test 2ms). M32 must reuse the same wrapper — write-side loops running through a meeting must pause, not fight for slots.
- **`AbortController`-driven stop with canceled-status coercion.** Terminal status is coerced to `'canceled'` regardless of which layer the abort propagated through. Reuse this posture — users will cancel write-side runs more often than read-side.
- **Per-task Loki ledger commits.** Pattern: `<type>(m<N>): M<N> T<N> — <summary>` for the work commit, immediately followed by `chore(loki): M<N> T<N> — commit ledger (<sha>)` updating orchestrator.json + pending.json + CONTINUITY.md. Preserve this for every M32 task.
- **ABI rebuild dance is mandatory before T10 verification.** Node ABI: `cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npx node-gyp rebuild --release` (pnpm rebuild silently no-ops when prebuilt dir is missing for the current Node version — v24 / ABI 137 has no upstream prebuild). Electron ABI: `pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar`. Document both in the M32 plan doc's T10 acceptance criteria. **The comma-separated `-w` form is the only syntactically valid invocation** — repeated `-w` flags crash `@electron/rebuild@3.7.2` with `argv.w.split is not a function`.
- **Subagent E2E handoff.** T8 M31 required ONE subagent pass (vs three for M30 T8) because the canned-script surface was additive and the subagent had the M30 `test-classifier.ts` pattern to mirror. Budget ~1 subagent pass for E2E-test work going forward. Coordinator runs git-diff verification + biome spot-check + atomic commit.
- **F10 user-guide style is Overview → Mechanics → Tools → Settings → Control → Privacy → Example → Troubleshooting.** `command-palette.md` (7.6KB, 9 sections) and `agentic-loop.md` (14KB, 11 sections — larger because more moving parts) follow the same shape. Match it for `task-planner.md` in M32 and `copilot.md` in M33.
- **Partial-truth docs are a cut corner.** M26 README claimed 612 tests / 3 E2E / 8 migrations — M31 T9 refreshed to 958 / 8 / 10 plus a whole new Intelligence Layer feature block. When a scoped docs task touches a file, audit surrounding staleness — bundle the fix if it's in-scope, call out in CONTINUITY if it isn't. Same rule applies to `docs/site/index.html` (landing page) which was not touched by T9 and is still Phase-4-stale — flag for M33/M34 design doc work.

### Architectural seams added by M31 (active for M32)

- `@team-x/intelligence/src/loop/` — pure ReAct scheduler subtree. M32 will inject write-side tools into the same `Tool[]` registry. The loop itself does NOT need modification.
- `apps/desktop/src/main/services/agentic-loop-service.ts` — main-process front-door. M32 adds a `buildWriteSideTools` branch or extends `buildTools` to include both read-side and write-side per-company. The `start / stop / getRun / waitForRun` surface remains.
- `apps/desktop/src/main/services/test-agentic-provider.ts` + `test-agentic-tools.ts` — NODE_ENV=test seams. M32 adds new canned entries for write-side prompts.
- `apps/desktop/src/main/services/command-service.ts` — `complex_request` dispatch lives here. M32 does NOT change this line — write-side runs also route through `complex_request` with natural-language prompts.
- Settings keys — M32 adds planner-specific keys (`planner_max_tickets`, `planner_max_depth`, etc. — already in design doc §11). Extend the Agentic Loop subsection, don't create a new one.
- Bus event types — M32 adds `plan.*` / `task.*` / `review.*` (design §4). Append-only contract preserved.

### Environment

- Windows 11 Pro 26200, Node v24.14.1 (ABI 137), Electron 125 (ABI varies), pnpm 9.15.4.
- Dev DB: `%APPDATA%\Team-X\team-x\team-x.sqlite` (migrations 0001–0010 present, system-agent seeded per-company).
- ABI state: current rebuild target is **Electron** (post-E2E). For unit tests, run the Node ABI rebuild command documented in "Patterns to carry forward" above.
- Keychain: OS keychain (`keytar`). No API keys committed.
- Ollama: optional. Tests use `NODE_ENV=test` canned seams — no local LLM required for verification.

## Next Session Startup Checklist (begin M32)

1. Read this CONTINUITY file for M31 rollup context.
2. Read `.loki/state/orchestrator.json` → `currentMilestone: 'M32'`, `previousMilestone: 'M31'`, `baseline.unitTests: 958`, `baseline.e2eSpecs: 8`. `inflight` is empty.
3. Read `.loki/queue/pending.json` → `milestone: 'M32'`, `tasks: []` (empty). `notes` array has the M32 scope sketch + follow-up landing guidance.
4. Write the M32 plan doc at `docs/plans/2026-04-15-team-x-phase-5-m32-task-planner.md` (or similar). Structural template: M31 plan doc. Required sections: Overview, What ships, Invariants preserved, Success criteria, Task breakdown (T0–TN), Acceptance criteria (reiterate the three-tier test seam + ABI rebuild dance + atomic-commit discipline).
5. Early tasks — **F1 and F2 belong at M32 T0 or T1.** Both are small renderer-only fixes that need to land before the write-side loop starts creating tickets, otherwise users will miss live confirmation cards (the root cause in both F1 and F2 is sub-subscription-latency bus events).
6. The write-side tool set (decompose_project / delegate_subtask / review_deliverable) is the headline feature. Each tool needs:
   - Production implementation in `apps/desktop/src/main/services/agentic-tools-write.ts` (or extend `agentic-tools.ts` with a separate exports block).
   - Test seam in `test-agentic-tools.ts` (extend with write-side cases).
   - New bus event types: `plan.created`, `plan.updated`, `task.delegated`, `task.reviewed`, `review.approved`, `review.rejected`.
   - Audit-log visibility (AuditView's event-type filter chips must include the new events).
   - UI surface: palette step-card variants for write-side step kinds (`ticket_created`, `delegation_made`, `review_pending`) with confirmation gates for destructive writes.
7. Guardrails are enforced at the tool level, not the prompt level (design decision D6). Workload scoring is deterministic, not LLM (D7). Keep both invariants when implementing M32.
8. Commit atomically. Same per-task ledger pattern as M30/M31.

## M30 prior patterns (still active, carried from M30 → M31 → M32)

- **Classifier/intent schema** is stable. M32 does not add new intents — all write-side work routes through `complex_request`.
- **Destructive-action gate** applies to write-side tools. `review_deliverable { action: 'reject' }` and `delegate_subtask { overwrite: true }` need `confirmed: true` in the palette before the IPC fires.
- **Command history + audit log** are append-only. Every M32 write-side command execution writes a `command.executed` event AND the appropriate `plan.*` / `task.*` / `review.*` event.
- **`Cmd+K`** remains the only surface. Sidebar / dashboard widgets (M34) will fire `command.execute` too, not a separate write-side IPC.
