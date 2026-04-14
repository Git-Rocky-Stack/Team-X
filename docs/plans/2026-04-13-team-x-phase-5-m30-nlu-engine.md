# M30: NLU Engine + Command Palette — Implementation Plan

**Phase 5 — Intelligence Layer | Milestone 30**
**Plan date:** 2026-04-13
**Previous milestone:** M29 (RAG integration into agent turns) — complete
**Next milestone:** M31 (Agentic Loop)
**Design reference:** `docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md` §5

---

## Overview

M30 gives Rocky a natural-language command surface over the entire app. Instead of clicking through Employees → Hire → filter by level → select role → configure, Rocky can type "Hire a senior backend engineer" into a Cmd+K palette and get a structured, confirmed, executable plan. Same keystroke handles "fire James", "assign the auth bug to Sarah", "find the API spec", "all-hands with the design team", etc.

The NLU layer is the on-ramp to M31's Copilot Agent. Ambiguous or multi-step requests ("why is the frontend team behind schedule?") are classified as `complex_request` and routed to the agentic loop. Everything else resolves deterministically to a known IPC call.

### What ships

- **`@team-x/intelligence/nlu`** — pure package: intent classifier (LLM-backed with JSON output), entity resolver (fuzzy name + FTS5), slot filler. No Electron / DB coupling.
- **`CommandService`** in `apps/desktop/src/main/services/command-service.ts` — orchestrates `parse → resolve entities → fill slots → execute` against the registered IPC handlers.
- **`command.*` IPC surface** — 4 channels (parse, execute, suggest, history).
- **Command palette UI** — Cmd+K modal with live classification, entity chips, confidence bar, confirmation gate for destructive actions, history picker.
- **Destructive-action confirmation gate** — fire / close / delete require an explicit confirm flow; non-destructive actions execute immediately with an undo toast.
- **Command history** — last 20 commands per user, persisted via `settings` key-value store.

### Bonus: T0 — Vault event-bus wiring

Per `docs/plans/2026-04-13-vault-backup-regression-findings.md`, M30 opens with a pre-M30 task (T0) that wires the vault into the existing event bus. This closes a pre-existing staleness regression in `vault-backup.spec.ts` and sets up M32 (RAG-on-vault) for success. See §T0 below.

### Invariants preserved

1. **Renderer is a pure view.** NLU classifier runs in main. Renderer sends text, receives a parsed intent. No LLM call from the renderer.
2. **Provider router is the only LLM surface.** `intent-classifier` calls the user's configured LLM via `provider-router`, honoring privacy tier + concurrency caps.
3. **Orchestrator is the only scheduler.** Command execution goes through existing IPC handlers, which already respect orchestrator pause state (e.g., during meetings).
4. **Append-only events.** Every successful command execution emits a `command.executed` event for the audit log.
5. **Zero phone-home.** NLU uses whatever provider the user has configured. Local Ollama is the default path.
6. **Destructive actions require confirmation.** `fire_employee`, `close_ticket`, `delete_*` cannot execute on a single turn — the palette forces a confirm step.

### Success criteria

- All 15 intents in §5.1 classify correctly against a fixture of ≥60 labeled examples (≥90% accuracy on the fixture).
- Entity resolver handles fuzzy names ("Sarah" → `emp_abc123` when exactly one Sarah exists; asks for clarification when two).
- Slot filler returns structured `missingSlots` with human-readable prompts.
- E2E spec `command-palette.spec.ts` exercises: Cmd+K → "hire a senior backend engineer" → confirm role pick → employee appears in org chart.
- Destructive confirmation gate proven: "fire James" requires an explicit confirm click before the fire IPC fires.
- All existing 665 unit tests + 5 E2E specs remain green (vault-backup green via T0).
- Typecheck clean. Biome lint: 0 errors.

---

## Task breakdown

Each task follows the M29 structure: failing test → implementation → passing test → commit. Tasks T1–T4 are NLU-package-internal and can be dispatched to fresh subagents with no shared state. T5–T10 are integration steps that must run in order.

### T0: Vault event-bus wiring (bonus — fixes vault-backup.spec.ts)

**Depends on:** nothing. Runs first so the baseline E2E suite is fully green before M30 proper begins.

**Scope:**
1. Extend `packages/shared-types/src/events.ts` with `vault.file_created` + `vault.file_deleted` event types and payload interfaces.
2. Inject `bus: EventBus` dependency into `createVaultService(deps)` in `apps/desktop/src/main/services/vault.ts`. Emit on successful `upload` and `remove`. Place the emit **after** the DB commit so the event-bus "subscribers never see an event before it's persisted" guarantee holds.
3. Wire `bus` through in `apps/desktop/src/main/index.ts` composition root.
4. Add `useVaultEventSync(companyId)` hook in `apps/desktop/src/renderer/src/hooks/use-vault.ts`. Subscribes to the existing `window.teamx.events.onEvent` preload bridge, filters by `companyId + type ∈ {vault.*}`, calls `queryClient.invalidateQueries({ queryKey: ['vault'] })`.
5. Mount `useVaultEventSync` once inside `VaultView`.
6. Unit tests for vault service: "emits `vault.file_created` after successful upload", "emits `vault.file_deleted` after successful remove", "does not emit if DB insert throws".
7. Run full E2E: `vault-backup.spec.ts` goes green without modification.

**Commit message:** `fix(vault): M30 T0 — emit bus events on create/delete, renderer invalidates cache`

**Acceptance:**
- 5/5 E2E specs green.
- Two new vault events appear in `AuditView` after uploads.
- No regression in ticket-attachments (which calls through vault service).

---

### T1: Intent schema + classifier (LLM-backed)

**Depends on:** T0.

**New file:** `packages/intelligence/src/nlu/intent-classifier.ts`

**Interface:**
```ts
export interface IntentResult {
  intent: IntentName;  // one of the 15
  entities: Record<string, string>;
  confidence: number;  // 0..1
  missingSlots: string[];  // required entity keys not resolved
  rawText: string;
}

export interface IntentClassifier {
  classify(text: string, context: NluContext): Promise<IntentResult>;
}

export interface NluContext {
  companyId: string;
  currentView?: string;  // hint: if on Meetings view, prefer meeting intents
  recentIntents?: IntentName[];  // hint: if user just called a meeting, "end it" → end_meeting
}
```

**Implementation:**
- Structured-output prompt: system prompt lists all 15 intents + required/optional entity slots + examples. Asks the LLM for JSON `{ intent, entities, confidence, missingSlots }`.
- Uses the user's configured provider via `provider-router`. Defaults to the `'balanced'` model tier.
- JSON-parse with Zod validation; on parse failure, retry once with a "your previous output was not valid JSON" nudge, then fall back to `complex_request` with `confidence: 0`.
- Include the confidence threshold logic: < 0.5 → escalate to `complex_request`.

**Test fixture:** `packages/intelligence/src/nlu/fixtures/intent-examples.test.ts` — 60 labeled text → intent examples. Run with a deterministic mock LLM that returns canned JSON keyed by exact text match for unit tests. The real LLM only runs in the E2E spec.

**Commit message:** `feat(intelligence): M30 T1 — intent classifier (15 intents, LLM-backed JSON output)`

**Acceptance:**
- ≥12 unit tests cover parse success, JSON retry, confidence threshold, all 15 intent names exported.
- Fixture of 60 labeled examples achieves ≥90% accuracy against a canned mock provider.

---

### T2: Entity resolver (fuzzy + FTS5)

**Depends on:** T0.

**New file:** `packages/intelligence/src/nlu/entity-resolver.ts`

**Interface:**
```ts
export interface EntityResolver {
  resolveEmployee(name: string, companyId: string): Promise<ResolvedEntity<EmployeeRow>>;
  resolveTicket(ref: string, companyId: string): Promise<ResolvedEntity<TicketRow>>;
  resolveVaultFile(query: string, companyId: string): Promise<ResolvedEntity<VaultFile>>;
  resolveRole(query: string): Promise<ResolvedEntity<RoleDefinition>>;
}

export type ResolvedEntity<T> =
  | { kind: 'unique'; value: T }
  | { kind: 'ambiguous'; candidates: T[] }   // 2-5 matches, palette asks user to pick
  | { kind: 'not_found' };
```

**Implementation:**
- **Employees:** fuzzy match on `name` + `role.name` (Levenshtein via a small pure function; no `fuzzysort` dep). "Sarah" matches "Sarah Chen" uniquely if only one Sarah exists.
- **Tickets:** #N → by id; otherwise FTS5 on `title + description`.
- **Vault files:** FTS5 on filename + extracted text (uses the existing `vault.fts` table from M21).
- **Roles:** fuzzy match on `name + level + id` against the loaded role pack.

All resolvers take a `deps` object with DB + role-loader access. Package stays DB-agnostic via interfaces.

**Commit message:** `feat(intelligence): M30 T2 — entity resolver (fuzzy names + FTS5)`

**Acceptance:**
- Unit tests for unique / ambiguous / not_found per resolver.
- Levenshtein helper unit-tested against a table of examples.
- No DB or Electron imports in the package itself (deps injected).

---

### T3: Slot filler

**Depends on:** T1, T2.

**New file:** `packages/intelligence/src/nlu/slot-filler.ts`

**Responsibility:** Given a classifier result + resolved entities, determine what's still missing and generate a human-readable prompt.

**Interface:**
```ts
export interface SlotFiller {
  fill(intent: IntentResult, resolved: ResolvedEntities): FillResult;
}

export type FillResult =
  | { kind: 'ready'; intent: IntentName; entities: Record<string, string> }
  | { kind: 'needs_clarification'; missing: string; prompt: string; options?: string[] }
  | { kind: 'needs_confirmation'; intent: IntentName; entities: Record<string, string>; summary: string };
```

**Logic:**
- Per-intent required slots table (e.g., `hire_employee` requires `roleId`, `fire_employee` requires `employeeId`).
- If resolver returned `ambiguous`, emit `needs_clarification` with the candidates as options.
- If intent is destructive (fire / close / delete / end_meeting), emit `needs_confirmation` with a human summary ("Fire Sarah Chen (Senior Frontend Engineer)?").

**Commit message:** `feat(intelligence): M30 T3 — slot filler with destructive-action confirmation gate`

---

### T4: CommandService (main-process orchestrator)

**Depends on:** T1, T2, T3.

**New file:** `apps/desktop/src/main/services/command-service.ts`

**Responsibility:** Front-door for `command.parse` + `command.execute`. Owns the intent → IPC handler dispatch table.

**Dispatch table:**
```ts
const DISPATCH: Record<IntentName, (entities, deps) => Promise<unknown>> = {
  hire_employee:    (e, d) => d.handlers.employeesCreate(...),
  fire_employee:    (e, d) => d.handlers.employeesFire(...),
  promote_employee: (e, d) => d.handlers.employeesPromote(...),
  assign_ticket:    (e, d) => d.handlers.ticketsAssign(...),
  // ... 11 more
  complex_request:  (e, d) => d.handlers.agenticLoopStart(...),  // stub in M30; wired in M31
};
```

**Invariants:**
- Never calls a handler without all required entities resolved.
- Destructive intents require `confirmed: true` in the execute request.
- Emits `command.executed` event to the bus on success (payload: intent, entities summary, resulting entityId).

**Commit message:** `feat(command): M30 T4 — CommandService dispatch + confirmation gate`

---

### T5: `command.*` IPC surface

**Depends on:** T4.

**New file:** `apps/desktop/src/main/ipc/command-handlers.ts`

**Channels:**
| Channel | Request | Response |
|---------|---------|----------|
| `command.parse` | `{ text, companyId }` | `IntentResult + { resolved, fillResult }` |
| `command.execute` | `{ intent, entities, confirmed }` | `{ success, result, error? }` |
| `command.suggest` | `{ partial, companyId }` | `{ suggestions: [{ text, intent, description }] }` |
| `command.history` | `{}` | `{ commands: [{ text, intent, timestamp }] }` |

**Wiring:** Extend `TeamXApi` in `packages/shared-types/src/ipc.ts`. Register in `register.ts`. Add preload bridge methods.

**History storage:** `settings` key-value store, key `command.history`, JSON-serialized array of last 20 entries.

**Commit message:** `feat(command): M30 T5 — command.* IPC channels (parse, execute, suggest, history)`

---

### T6: Command palette UI

**Depends on:** T5.

**New files:**
- `apps/desktop/src/renderer/src/features/command/command-palette.tsx`
- `apps/desktop/src/renderer/src/hooks/use-command.ts`

**Behavior:**
- Global keybinding: `Cmd+K` / `Ctrl+K` opens the palette. `Esc` closes. Handled in `app-shell.tsx` via `window.addEventListener('keydown')`.
- Modal: Radix `Dialog`, centered, 560px wide.
- Input at top. Debounced 200ms → calls `command.parse`.
- Below input: intent chip, entity chips (one per resolved entity), confidence bar (color-coded: red < 0.5, amber 0.5–0.8, green > 0.8).
- If `fillResult.kind === 'needs_clarification'`: show candidate options as selectable rows.
- If `fillResult.kind === 'needs_confirmation'`: show a summary + Confirm / Cancel buttons. `Enter` while focused on Confirm triggers `command.execute`.
- If `fillResult.kind === 'ready'`: `Enter` triggers `command.execute` immediately.
- Post-execute: show an undo toast for non-destructive actions (Create / Assign). Destructive actions (Fire / Close / Delete) do not offer undo (they are explicit).
- History picker: press `↑` from empty input → cycle through last 20.
- Structured command fallback: typing `/tickets.assign` bypasses NLU, parses `/<channel>` directly.

**Styling:** matches existing shadcn theme. Strategia red accent on focused elements.

**Commit message:** `feat(ui): M30 T6 — command palette with Cmd+K, live classification, confirmation gate`

---

### T7: History + audit log integration

**Depends on:** T5, T6.

**Scope:**
1. Every successful `command.execute` writes to `settings.command.history` (FIFO, cap 20).
2. Every successful `command.execute` emits `command.executed` to the bus (new event type — add to `events.ts`).
3. `AuditView` already renders all event types; confirm `command.executed` renders cleanly with the intent + entities summary.
4. Add a "Recent Commands" section to the Dashboard subview showing the latest 10.

**Commit message:** `feat(command): M30 T7 — command history + audit log events`

---

### T8: E2E spec — `command-palette.spec.ts`

**Depends on:** T6, T7.

**New file:** `apps/desktop/e2e/command-palette.spec.ts`

**Coverage:**
1. Press Cmd+K → palette visible.
2. Type "hire a senior frontend engineer" → wait for `command.parse` response.
3. Assert intent chip reads "hire_employee", role entity chip shows "Senior Frontend Engineer".
4. Press Enter → confirm step shown (hire is not destructive, but we confirm for UX symmetry on first impl).
5. Click Confirm → employee row appears in Employees tab.
6. Press Cmd+K again → type "fire <new employee name>".
7. Assert destructive confirmation gate ("Fire X?"). Click Cancel. Confirm employee still present.
8. Press Cmd+K → type "fire X" → Click Confirm → employee removed.
9. Press Cmd+K → press ↑ → history shows the two recent commands.

**Test mode hooks:**
- Canned classifier: in `NODE_ENV=test`, `intent-classifier.classify` returns pre-programmed results keyed by exact input text. No LLM call.
- `__ECHO_INTENT__:<json>` sentinel for fine-grained spec control (optional).

**Commit message:** `test(e2e): M30 T8 — command-palette spec (parse → confirm → execute → history)`

---

### T9: Documentation

**Depends on:** T8.

**Scope:**
1. Update `README.md` Features section with "Natural-language command palette (Cmd+K)".
2. New user guide: `docs/user-guide/command-palette.md` covering all 15 intents with examples.
3. Update `CHANGELOG.md` under `## [Unreleased]` with M30 entries.
4. Update `CLAUDE.md` IPC channels table with `command.*`.
5. Update `CLAUDE.md` with the new architectural rule from findings doc §7: "IPC channels that mutate state must emit a bus event."

**Commit message:** `docs: M30 T9 — command palette user guide + CLAUDE.md updates`

---

### T10: Verification + milestone marker

**Depends on:** T0–T9.

**Checklist:**
1. `pnpm test` — all unit tests green (targeting ≥720 tests after M30).
2. `pnpm typecheck` (from repo root — NOT workspace-scoped).
3. `pnpm lint` — 0 errors.
4. `pnpm -F @team-x/desktop test:e2e` — all 6 specs green (smoke, ticket-flow, meeting-flow, rag-flow, vault-backup, command-palette).
5. `pnpm build` — production build clean.
6. Manual smoke: boot dev, open palette, try 5 intents (hire / fire / assign / search / call meeting). Confirm each resolves + executes.
7. Update `.loki/CONTINUITY.md` with M30 status.
8. Update `.loki/state/orchestrator.json` — currentMilestone → M31.
9. Marker commit.

**Commit message:** `chore(loki): M30 complete — update continuity + orchestrator state to M31`

---

## Summary of deliverables

| Task | Deliverable | Tests added |
|------|-------------|-------------|
| T0 | Vault event-bus wiring (bonus) | +6 unit |
| T1 | Intent classifier | +12 unit |
| T2 | Entity resolver | +15 unit |
| T3 | Slot filler | +8 unit |
| T4 | CommandService | +10 unit |
| T5 | command.* IPC | +8 unit |
| T6 | Command palette UI | 0 (no DOM test infra) |
| T7 | History + audit integration | +4 unit |
| T8 | `command-palette.spec.ts` | +1 E2E |
| T9 | Documentation | 0 |
| T10 | Verification + marker | 0 |

**Total:** +63 unit tests (665 → ~728), +1 E2E spec (5 → 6).

## Risks + open questions

1. **LLM JSON reliability.** Smaller local models (Ollama 8B) can produce malformed JSON. The classifier has a one-shot retry + `complex_request` fallback, but if the user's configured provider is unreliable, the palette becomes unusable. Mitigation: ship with Anthropic/OpenAI as the recommended NLU provider; document the fallback in the user guide.
2. **Confidence threshold tuning.** 0.5 is a placeholder. Tune against the 60-example fixture and adjust. May need per-intent thresholds (destructive actions require higher confidence).
3. **Fuzzy-name ambiguity in large companies.** 50+ employees with common first names will frequently be ambiguous. The palette handles this by showing candidates — UX tested in T8 but not in a 50-person company at M30 scale.
4. **Cmd+K keybinding conflict.** Chrome DevTools + Spotlight + some macOS tools bind Cmd+K. Chose it anyway because it's the industry standard (Linear, Notion, VS Code, Raycast). User can rebind later.

## Handoff notes for the next session

- This plan is ready for `.loki/queue/pending.json` construction — one entry per task, T0–T10.
- T0 is NOT part of the M30 milestone count — it's a bonus bug fix on the same branch. Marker commit still reads `M30 complete`.
- Subagent dispatch pattern from M29 applies: each task fresh agent with full task text + scene-setting context + two-stage review (spec + code quality).
