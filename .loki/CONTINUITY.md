# Loki Continuity — Phase 5, M31 COMPLETE (all 11 tasks shipped); M32 prep pending

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
