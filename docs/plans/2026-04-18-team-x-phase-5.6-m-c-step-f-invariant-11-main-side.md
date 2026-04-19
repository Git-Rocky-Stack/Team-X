# Phase 5.6 M-C step (f) — Main-side Invariant #11 completeness hardening

**Originating finding:** `docs/qa/2026-04-18-ground-zero-audit.md` §3.1 (P1)
**Parent plan:** [`docs/plans/2026-04-17-team-x-phase-5.6-remediation.md`](../plans/2026-04-17-team-x-phase-5.6-remediation.md)
**Predecessor:** Phase 5.6 M-C step (e) — companies.update + companies.delete (atomic commit `fd3617b`)
**Successor:** Phase 5.6 M-D — UI backfill
**Classification:** M-C extension (step f). Ships as a single atomic + paired ledger per established M-C cadence.
**Drafted:** 2026-04-18

## Problem

Commit `30b1520` closed the **renderer side** of Invariant #11 by adding four `useXxxEventSync` hooks (tickets / meetings / projects / goals) that subscribe to the main-process dashboard bus and invalidate React Query caches on cross-process mutation. But the **main side** is still dark: the `tickets.*`, `projects.*`, `goals.*` IPC handlers **do not emit bus events**. The existing hooks subscribe to the narrow set of events the M32 planner tools already emit (`task.delegated`, `plan.*`) — enough to prevent the worst staleness, not enough to close the invariant.

Architectural invariant #11 mandates that every state-mutating IPC channel emits a bus event. Today, 14 mutation handlers violate it. This milestone closes the gap.

## Scope

**14 new events** across three namespaces. Scoping rule: one event per state-mutating IPC channel, with paired-payload-shape when two sibling channels have strictly symmetric semantics (none qualify in this batch).

### Tickets (6)

| Event | Emitted by | Payload highlights |
|---|---|---|
| `ticket.created` | `tickets.create` | `ticketId`, `companyId`, `title`, `assigneeId \| null`, `createdAt` |
| `ticket.updated` | `tickets.update` | `ticketId`, `companyId`, `patchedKeys[]`, `updatedAt` |
| `ticket.assigned` | `tickets.assign` | `ticketId`, `companyId`, `assigneeId`, `previousAssigneeId \| null`, `threadId`, `assignedAt` |
| `ticket.closed` | `tickets.close` | `ticketId`, `companyId`, `closedAt` |
| `ticket.reopened` | `tickets.reopen` | `ticketId`, `companyId`, `reopenedAt` |
| `ticket.commentAdded` | `tickets.addComment` | `ticketId`, `companyId`, `messageId`, `authorId`, `addedAt` |

### Projects (5)

| Event | Emitted by | Payload highlights |
|---|---|---|
| `project.created` | `projects.create` | `projectId`, `companyId`, `title`, `goalId \| null`, `createdAt` |
| `project.updated` | `projects.update` | `projectId`, `companyId`, `patchedKeys[]`, `updatedAt` |
| `project.deleted` | `projects.delete` | `projectId`, `companyId`, `title` (snapshot), `deletedAt` |
| `project.ticketLinked` | `projects.linkTicket` | `projectId`, `companyId`, `ticketId`, `linkedAt` |
| `project.ticketUnlinked` | `projects.unlinkTicket` | `projectId`, `companyId`, `ticketId`, `unlinkedAt` |

### Goals (3)

| Event | Emitted by | Payload highlights |
|---|---|---|
| `goal.created` | `goals.create` | `goalId`, `companyId`, `title`, `createdAt` |
| `goal.updated` | `goals.update` | `goalId`, `companyId`, `patchedKeys[]`, `progress` (normalized 0-1, re-computed post-write), `updatedAt` |
| `goal.deleted` | `goals.delete` | `goalId`, `companyId`, `title` (snapshot), `deletedAt` |

### Out of scope (deferred)

- `tickets.attachFile` + `tickets.detachFile` — ticket attachment lifecycle, ships as a smaller follow-up (`FOLLOWUP-P1-extended`) so this milestone keeps the clean 14-event envelope Rocky scoped. Will ship before M-D's attachment UI needs cache invalidation.
- Phase 5.6 M-C step f does **not** introduce new IPC channels, does **not** change request/response wire shapes, does **not** widen any repo surface. Pure event-emission additive work.

## Design decisions

1. **Snapshot-before-drop for delete/unlink.** `project.deleted`, `goal.deleted`, `project.ticketUnlinked` handlers read the row BEFORE the mutation writes so payloads carry `title` / `ticketId` after the row is gone. Same pattern as `company.deleted` (step e) and `employee.managerSet` (step d).
2. **patchedKeys for updates.** `ticket.updated`, `project.updated`, `goal.updated` carry a typed `patchedKeys` array (not the values) — audit-view chips only need the keys to render a delta chip and omitting the values keeps the event small. Mirrors `company.updated` (step e).
3. **Empty-patch still emits.** `*.update` handlers with a no-op patch still fire the bus event so optimistic renderer paths can reconcile timestamps. Mirrors `companies.update`.
4. **Bus emit is best-effort.** Each emit sits inside a `try/catch` that logs `[ipc] <channel>: bus emit failed (row still <verb>):` without rethrowing. The durable write already succeeded — a bus failure must not surface as an IPC throw to the renderer. Mirrors every existing emit in handlers.ts.
5. **HUMAN_USER_ID actor.** Every emit uses `actorId: HUMAN_USER_ID` + `actorKind: 'user'` for now. Agent-initiated mutations (M32 `delegate_subtask` → `tickets.create`) will gain a threaded actor context in a later milestone; today the tool writes through its own bus event (`task.delegated`) and does not round-trip through `tickets.create`.
6. **Goal progress re-computation.** `goal.updated` payload includes the normalized `progress` field because goal progress is derived from linked projects — the renderer cache needs the fresh value on every mutation. The handler calls `goalsRepo.recalcProgress(goalId)` post-update and includes the result in the payload.
7. **Invariant #11 assertion in tests.** Every new handler test gains a `it('emits <event> on success')` case that asserts `bus.emit` was called exactly once with the right type / companyId / actorId / payload shape. Mirrors `companies-update-handlers.test.ts` and `companies-delete-handlers.test.ts`.
8. **Renderer hook widening is narrow.** `useTicketEventSync` / `useProjectEventSync` / `useGoalEventSync` gain the new event types in their filter list. The existing `task.delegated` / `plan.*` subscriptions stay. `useMeetingEventSync` is untouched (already covers its domain; `meeting.*` events existed pre-M-C).
9. **`event-sync-hooks.test.ts` expansion.** The existing 306-line test file gains assertions for each new event type — currently covers 4 hooks × 2-4 events = ~12 assertions, grows to 4 hooks × 5-8 events = ~24 assertions.
10. **No E2E re-run required.** No renderer contract change; no new IPC surface; the 11 specs / 12 Playwright cases baseline is preserved. The added bus emissions are observable only through unit-test assertions until M-D lands a renderer-facing E2E spec.

## Task breakdown

| T# | Task | Est LOC | Est tests |
|---|---|---|---|
| T1 | Plan doc | ~180 | — |
| T2 | `packages/shared-types/src/events.ts` — extend `EventType` union + add 14 payload interfaces | ~220 | +1 type-level |
| T3 | `apps/desktop/src/main/ipc/handlers.ts` — 14 bus.emit blocks | ~320 | — |
| T4 | Handler test expansions — new `tickets-*-handlers.test.ts` / `projects-*-handlers.test.ts` / `goals-*-handlers.test.ts` groups; bus-emit assertions | ~400 | +30 |
| T5 | Renderer hook widening — 3 hooks × 6-8 new events in filter | ~60 | — |
| T6 | `event-sync-hooks.test.ts` — expand assertions for new event types | ~140 | +12 |
| T7 | Verify + atomic commit + paired ledger | — | — |

**Totals:** ~1120 LOC / +43 unit tests (1454 → ~1497 baseline).

## Verification gate

Per Phase 5.6 verification recipe (carried forward from Phase 5):

1. **Node ABI rebuild** — `cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npm run install`
2. **vitest** — target 1497/1497 (1454 M-C step e baseline → +43 new)
3. **typecheck** — clean across 6 packages
4. **lint** — 0 errors / ≤21 warnings (step d hardening baseline preserved)
5. **audit:claims** — 92 verified / 3 allowlisted / 0 UNALLOWED (baseline preserved — no new IPC channels, no allowlist movement)
6. **Electron ABI rebuild** — `pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar`
7. **E2E baseline** — 11 specs / 12 cases (no new specs; no renderer contract break)
8. **Loki verifiedBy** populated on the paired ledger commit per S4 contract

## Acceptance criteria

- [ ] 14 new `EventType` union members shipped with full JSDoc rationale
- [ ] 14 new payload interfaces with per-field doc comments
- [ ] 14 handler emits wired (one per mutation), all with `try/catch` + error log + HUMAN_USER_ID actor + companyId-scoped `DashboardEvent` envelope
- [ ] Snapshot-before-drop captured for delete/unlink payloads
- [ ] `patchedKeys` typed subsets for update payloads
- [ ] `goal.updated` payload includes recomputed normalized progress
- [ ] 3 renderer hooks widened to subscribe to the new event types
- [ ] `event-sync-hooks.test.ts` expanded with per-event-type assertions
- [ ] 30+ new handler emit-assertion tests
- [ ] M-E safeguards green (S2 conformance CI, S3 pre-commit, S4 verifiedBy, no allowlist movement expected)
- [ ] Atomic commit `feat(phase-5.6-m-c-step-f):` + paired `chore(loki):` ledger
- [ ] QA audit `docs/qa/2026-04-18-ground-zero-audit.md` §3.1 flagged as CLOSED in the M-C step f ledger's verifiedBy

## Milestone boundary

This step **closes** M-C step (f) and completes the main-side Invariant #11 restoration. M-D (UI Backfill) can then proceed with guaranteed bus-event coverage for every ticket/project/goal mutation, so its renderer cache invalidation is first-class and not reliant on narrow planner-tool coverage.

After ship: update `.loki/queue/current-task.json` with the new step f entry, bump `stepsShipped[]`, keep head-of-queue pointing at M-D (step f is a finalization hardening on M-C, not a new milestone).
