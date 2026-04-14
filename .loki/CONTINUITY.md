# Loki Continuity — Phase 5, M30 COMPLETE

## Current State

- **Phase 4 (Ship-readiness) SHIPPED.** v1.0.0 tagged. All 27 milestones complete.
- **Phase 5 (Intelligence Layer) in flight.** Design doc at `docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md`.
- **M28 (Intelligence Package + RAG Foundation) COMPLETE** — 2026-04-13.
- **M29 (RAG integration into agent turns) COMPLETE** — 2026-04-13.
- **M30 (NLU Engine + Command Palette) COMPLETE** — 2026-04-14. All 11 tasks shipped (T0–T10).
- **M31 (Agentic Loop) NEXT** — plan doc not yet written.
- **Baseline at M30 close:** 819 unit tests (+146 from 673 M29 baseline) + 7 E2E specs (+2: command-palette, vault-backup green). Typecheck clean across all 6 packages. Biome lint: 0 errors, 66 warnings.

## M30 shipped commits

| Task | Commit | Deliverable | Tests |
|------|--------|-------------|-------|
| T0 | `f4ac227` | Vault event-bus wiring — emit on create/delete, renderer invalidates via bus subscription. Unblocks `vault-backup.spec.ts` | +8 |
| T1 | `84b5bc7` | Intent classifier — 15 intents, LLM-backed JSON output via `provider-router`, Zod validation, retry-once-on-parse-fail, 0.5 confidence threshold → `complex_request` fallback. 60-example fixture at 100% accuracy | +24 (18 unit + 6 fixture) |
| T2 | `6d99aa4` | Entity resolver — fuzzy Levenshtein on employees/roles, FTS5 on tickets/vault files, `{unique \| ambiguous \| not_found}` tri-state | +35 |
| T3 | `73968c8` | Slot filler — required-slots table per intent, `SLOT_KEY_ALIASES` seam, destructive-action confirmation gate, `{ready \| needs_clarification \| needs_confirmation}` output | +33 |
| T4 | `8285834` | CommandService — `parse/execute/history/suggest/stop`, 20-case dispatch table (intent → existing IPC handlers), FIFO history cap 20 in dedicated `command_history` SQLite table, `command.executed` bus emit in try/catch | +20 |
| T5 | `709bae5` | `command.*` IPC surface — 4 channels wired via preload bridge. `Expect<Equal<IntentName, IpcIntentName>>` drift guard keeps intelligence + shared-types in sync | +9 |
| T6 | `15ba829` | Command palette UI — Radix Dialog, Ctrl+K global keybinding (platform-aware), debounced parse, intent/entity chips, confidence bar (red/amber/green), needs_confirmation dialog, history picker (ArrowUp), `/show` slash command, all 6 UI states (hover/focus/loading/error/empty/disabled) | 0 (no renderer DOM harness — gap noted; E2E covers in T8) |
| T7 | `2a3ec7b` | History + audit — `intent-labels.ts` shared between palette and AuditView, new Dashboard "Commands" subtab (5th after Timeline/Stream/Floor/Org), audit row summary for `command.executed` payloads | +16 |
| T8 | `569d960` | E2E spec + test-mode classifier seam — `NODE_ENV=test` swaps real LLM classifier for canned pattern table via `createTestClassifier()`. Spec exercises full round-trip: Ctrl+K → parse → destructive Cancel → destructive Confirm → verify in Commands subview. Added `employees.fire` IPC + repo method + React Query invalidation on execute success | +9 |
| T9 | `cbf8f5b` | Documentation — README Features, `docs/user-guide/command-palette.md` (15 intents × 2 examples), CHANGELOG [Unreleased], CLAUDE.md Status + invariant #11 + Testing + IPC table | 0 |
| T10 | this commit | Verification + marker — orchestrator.json → M31, pending.json cleared, CONTINUITY rewrite | 0 |

**Net M30 delta:** 673 → 819 unit tests (+146). 5 → 7 E2E specs (vault-backup fixed at T0 + new command-palette at T8).

## M30 patterns to carry forward (new learnings)

- **Subagent context exhaustion on E2E tasks.** T8 required THREE subagent handoffs (initial scaffold → mid-E2E bail → finisher bail → coordinator inline). Pattern confirmed from M29: big E2E tasks blow context. Workaround: coordinator runs the final gate (`pnpm test` / `pnpm -F @team-x/desktop test:e2e:run`) and commit inline. Scaffolding + spec authoring goes to subagent; verification + commit stays with coordinator. T9 (docs) hit the same wall but the docs were complete — only the commit step was left, handled inline.
- **`Expect<Equal<A, B>>` compile-time drift guards are worth their weight.** T5 used this trick to couple `IntentName` (intelligence-package-owned) and `IpcIntentName` (shared-types-owned) without a cycle. Any future deviation surfaces at typecheck time. Pattern: two canonical definitions, drift check in the consumer.
- **Canned-classifier seam mirrors canned-provider seam.** T8 added `createTestClassifier()` alongside `provider-factory.ts`'s `test-mode` stream. Gated on `NODE_ENV === 'test'`. Supports `__ECHO_INTENT__:<json>` sentinel for fine-grained spec control, mirroring the `__ECHO_TEXT__:` / `__ECHO_SYSTEM__` family already in the provider. This is now the standard pattern for any deterministic LLM-call swap in E2E.
- **`SLOT_KEY_ALIASES` is a real architectural seam.** T3 hit the classifier-emits-`employeeName` vs slot-filler-needs-`employeeId` mismatch. The fix is a top-of-file alias table, not a parallel key scheme. T4 refines the seam further. New intents that want to reuse a slot must either match the canonical key or register an alias — do not introduce a third key space.
- **ABI rebuild dance remains the biggest CI-loop pain point.** Confirmed for the Nth time: `pnpm test` (Node ABI) and `pnpm -F @team-x/desktop test:e2e` (Electron ABI) cannot run back-to-back without a rebuild in between. Rebuild command: `cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npx node-gyp rebuild --release` for Node ABI; `pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar` for Electron. A CI script that sequences these is still outstanding — documented in CLAUDE.md §Troubleshooting.
- **Invariant #11 was promoted from finding to rule.** "IPC channels that mutate state must emit a bus event." This came out of the vault-backup regression (T0) but the underlying principle — renderer caches need a signal not routed through React Query — is universal. New IPC writes must follow the pattern: (1) persist, (2) emit bus event after commit, (3) subscribe in renderer via `events.onDashboard` filter. T0's `useVaultEventSync` is the reference implementation.
- **Dashboard subtab additions are cheap.** T7's new "Commands" subtab required: store enum extension, subtab nav entry, new view file, guard bypass for no-employees case. ~5 touchpoints. The M14 pattern is sturdy — future subviews should follow the same template.
- **Minimal inline toast instead of a new dep.** T6 shipped an `<output aria-live="polite">` undo toast scoped to the feature rather than add `sonner` or `react-hot-toast`. Flagged for a follow-up pass when a shared primitive is warranted. Don't add deps mid-milestone for one-off UX needs.

## Architectural seams added in M30

- **`@team-x/intelligence/src/nlu/`** — new subtree. Three pure-factory modules (`intent-classifier.ts`, `entity-resolver.ts`, `slot-filler.ts`) + a shared fixtures directory. All DB-agnostic; all deps injected at factory time. Package still imports zero from Electron or better-sqlite3.
- **`apps/desktop/src/main/services/command-service.ts`** — the main-process front-door. Intent → existing IPC handler dispatch, FIFO history in SQLite, bus emission on every execute (success or error), destructive confirmation gate, lifecycle `start()`/`stop()`.
- **`apps/desktop/src/main/services/test-classifier.ts`** — NODE_ENV=test seam. Mirrors the provider-factory's test-mode pattern.
- **`apps/desktop/src/main/db/repos/command-history.ts`** + migration `0009_command_history.sql` — SQLite ring buffer, indexed on `(company_id, executed_at DESC)`.
- **`apps/desktop/src/renderer/src/features/command/`** — palette + `intent-labels.ts`. The intent-labels map is consumed by BOTH the palette (intent chip rendering) and AuditView (command.executed row summary) — shared source of truth.
- **`apps/desktop/src/renderer/src/features/dashboard/commands-view.tsx`** — 5th dashboard subview + `[data-testid]` selectors for E2E.

## Known issues (post-M30)

- **ABI rebuild dance still manual** — see §M30 patterns.
- **Renderer DOM test harness still missing** — T6 palette + T7 commands-view have no component tests. E2E covers the round-trip but not component units. Add jsdom + @testing-library/react in a follow-up if needed.
- **`suggest` is currently a static list** — M30 ships a placeholder that returns common starter phrases. M31 or later can extend with LLM-backed completion.
- **`complex_request` routes to a stub summary** — "Escalated to agentic loop (M31)." M31 must land the real handoff.
- **Undo toast is scoped to the palette feature** — a shared primitive is due. Low priority.

## Next Session Startup Checklist (M31 kickoff)

1. Read this CONTINUITY file.
2. Read `.loki/state/orchestrator.json` → currentMilestone should be `M31`, tasksCompleted 0.
3. Read `docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md` §6 (M31 Agentic Loop design).
4. Write `docs/plans/2026-04-14-team-x-phase-5-m31-agentic-loop.md` with the task breakdown.
5. Populate `.loki/queue/pending.json` with the M31 tasks.
6. Consider whether the `complex_request` stub from M30 T4 handoff needs to be the M31 entry point, or whether M31 introduces a separate `AgenticLoop` service.

## Environment

- OS: Windows 11 Pro
- Shell: bash (Unix syntax — `/dev/null`, forward slashes)
- Repo root: `C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X`
- Node: 20 LTS (ABI 125 for Electron, ABI 137 for local v22 — see Known Issues for the rebuild dance)
- Package manager: pnpm workspaces
- Test runner: Vitest (unit) + Playwright (E2E — 7 specs)
