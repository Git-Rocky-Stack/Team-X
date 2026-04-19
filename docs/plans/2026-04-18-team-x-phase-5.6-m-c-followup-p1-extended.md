# Phase 5.6 M-C FOLLOWUP-P1-extended — Invariant #11 employee lifecycle + ticket attachment emits

**Originating findings:** `docs/qa/2026-04-18-autonomous-run-report.md` §4 — BUG-009 / BUG-010 / BUG-011
**Originating tracker rows:** `docs/qa/templates/BUG-TRACKING-TEMPLATE.csv` BUG-009, BUG-010, BUG-011
**Parent plan:** [`docs/plans/2026-04-17-team-x-phase-5.6-remediation.md`](2026-04-17-team-x-phase-5.6-remediation.md)
**Predecessor:** Phase 5.6 M-C step (f) — main-side Invariant #11 tickets/projects/goals hardening (atomic commit `a4dc24e`)
**Successor:** Phase 5.6 M-D — UI backfill (Cluster A WorkspaceSwitcher + Cluster B OrgChartView + Hire/Fire/attachment UI)
**Classification:** M-C post-ship hardening increment. Ships as a single atomic + paired ledger per the established M-C cadence; does NOT reopen M-C (already complete) nor block M-D entry.
**Drafted:** 2026-04-18

## Problem

The autonomous QA run on commit `a4dc24e` (82 of 104 test cases executed, 95.1% pass rate, 0 P0 regressions) filed three new P1 bugs that extend the FOLLOWUP-P1 pattern step (f) closed for `tickets.*` / `projects.*` / `goals.*`:

- **BUG-009** — `employees.create` (handlers.ts L1766) performs the durable repo write but does NOT emit a bus event. Renderer employee-list caches cannot auto-invalidate on hire; `onSuccess` fallbacks miss agent-initiated and E2E-initiated hires.
- **BUG-010** — `employees.fire` (handlers.ts L1806) performs the durable repo delete (+ keychain cleanup via downstream hooks) but does NOT emit a bus event. Renderer org-chart + employee-list caches stale after IPC-driven fire.
- **BUG-011** — `tickets.attachFile` (L3952) and `tickets.detachFile` (L3963) do NOT emit bus events. Ticket-detail attachment lists go stale after agent-initiated or E2E-initiated attach/detach. Known-deferred from step (f) per its `nextStep` note ("Attachment lifecycle is deferred to a later FOLLOWUP-P1-extended milestone before M-D's attachment UI needs cache invalidation").

All three violate architectural invariant #11 (IPC channels that mutate state must emit a bus event). Step (f) closed the gap across 14 handlers. This atomic closes it across the remaining 4 mutation paths that step (f) scoped out for a clean envelope.

Closing these before M-D is load-bearing: M-D's HireDialog + FireDialog + attachment panel all depend on bus-driven cache invalidation (TC-UI-MD-015 is the canonical guard), and M-D's TC-INT-CLB-005 is already marked `Gated on M-D + BUG-010 fix` in the tracker.

## Scope

**4 new events** across two namespaces, one per state-mutating IPC channel. No new IPC channels. No request/response wire shape changes. No repo surface widening. Pure event-emission additive work — same discipline as step (f).

### Employees (2)

| Event | Emitted by | Payload highlights |
|---|---|---|
| `employee.hired` | `employees.create` | `employeeId`, `companyId`, `roleId`, `level`, `name`, `title`, `hiredAt` |
| `employee.fired` | `employees.fire` | `employeeId`, `companyId`, `roleId` (snapshot), `level` (snapshot), `name` (snapshot), `title` (snapshot), `firedAt` |

### Tickets — attachment lifecycle (2)

| Event | Emitted by | Payload highlights |
|---|---|---|
| `ticket.attachmentAdded` | `tickets.attachFile` | `attachmentId`, `ticketId`, `companyId`, `fileId`, `attachedBy`, `attachedAt` |
| `ticket.attachmentRemoved` | `tickets.detachFile` | `attachmentId` (snapshot), `ticketId`, `companyId`, `fileId`, `removedAt` |

### Out of scope (intentional)

- **`companies.create` / `companies.update` / `companies.delete` / `companies.archive`** — already emit bus events (steps e + F3 shipped).
- **`employees.promote` / `employees.setManager`** — already emit bus events (step d shipped).
- **Renderer views (HireDialog, FireDialog, attachment panel)** — UI components land in M-D. This atomic ships the main-side emits + the renderer hook subscription layer; M-D wires the mounts.
- **New IPC channels** — none. The four channels already exist and already behave correctly on the durable-write side.

## Design decisions

1. **Snapshot-before-drop for `employee.fired`.** `employees.fire` deletes the row via `employeesRepo.delete(employeeId)`. The bus payload carries `roleId` / `level` / `name` / `title` captured from the `getById` read BEFORE the delete, so audit-view chips + renderer caches can render the departed employee's identifier without a post-fire read that would now miss. Mirrors `company.deleted` (step e) and `goal.deleted` / `project.deleted` (step f).
2. **Snapshot-before-drop for `ticket.attachmentRemoved`.** `tickets.detachFile` drops the attachment row via `detachByFile(ticketId, fileId)` (void return). The bus payload needs `attachmentId` for renderer optimistic animation. Strategy: call `ticketAttachmentsRepo.listByTicket(ticketId)` BEFORE the detach to find the matching row by `fileId`, capture its `id`, then perform the detach. If no matching row exists, the detach is a no-op and the bus event still fires with `attachmentId: null` (empty-patch-still-emits discipline, mirrors `companies.update` step e).
3. **Attachment emits thread `companyId` via a ticket fetch.** Attachment handlers receive only `ticketId` + `fileId` — no `companyId`. The handler fetches `ticketsRepo.getById(ticketId)` to thread `companyId` into the bus event. Doubles as a phantom-ticket-id validation guard (unknown ticket aborts before the repo write). Mirrors `projects.linkTicket` / `projects.unlinkTicket` companyId threading (step f).
4. **HUMAN_USER_ID actor on all four emits.** Consistent with step (d) / step (e) / step (f) / BUG-005 sweep. Agent-initiated mutations get a threaded actor in a later milestone; today the emits are HUMAN_USER_ID + actorKind 'user'.
5. **Bus emit is best-effort.** Each emit sits inside a `try/catch` that logs `[ipc] <channel>: bus emit failed (row still <verb>)` without rethrowing. The durable write already succeeded — a bus failure must not surface as an IPC throw to the renderer. Mirrors every existing emit in handlers.ts.
6. **Patch-less events carry full snapshots.** `employee.hired` / `employee.fired` / `ticket.attachmentAdded` / `ticket.attachmentRemoved` are lifecycle events (not patches), so payloads carry full identifying fields rather than `patchedKeys[]`. Same shape discipline as `employee.promoted` (full pre/post snapshot) and `project.deleted` (full pre-drop snapshot).
7. **Renderer hook split — new `useEmployeeEventSync` + widened `useTicketEventSync`.**
   - `useEmployeeEventSync` is NEW (use-employees.ts currently has only the `useEmployees` query). Listens for `employee.hired` / `employee.fired` on the `companyId`-scoped dashboard bus and invalidates `['employees', companyId]`. Not yet mounted anywhere — M-D lands the HireDialog / FireDialog / OrgChartView mounts. The hook is ready-to-import so M-D is a single-line consumer.
   - `useTicketEventSync` is WIDENED. Two new event literals added to the filter list alongside the eight that step (f) shipped. On attachment events, the hook invalidates `['ticket-attachments', payload.ticketId]` in addition to the existing `['tickets', companyId]` + `['ticket-detail']` invalidations.
8. **New `useEmployeeEventSync` follows the canonical `useXxxEventSync` signature.** `(companyId: string | null): void`, mounts once via `useEffect`, returns the `unsubscribe`, guards on `event.companyId !== companyId` scope mismatch, invalidates per-key. Mirrors the four step-(f) hooks exactly.
9. **`event-sync-hooks.test.ts` expansion — new `useEmployeeEventSync` describe block + widened `useTicketEventSync` describe block.** Per-event-type subscription assertions, invalidation assertions, JSDoc FOLLOWUP-P1-extended anchor assertion, mount-once cross-hook contract row.
10. **No new E2E spec.** No renderer contract change surfacing to the user until M-D. The added bus emissions are observable only through unit-test assertions until M-D lands a renderer-facing E2E spec. The 11 specs / 12 Playwright cases baseline is preserved.
11. **QA ledger flips as part of this atomic.** `docs/qa/templates/BUG-TRACKING-TEMPLATE.csv` rows BUG-009 + BUG-010 + BUG-011 get `Resolution` + `Resolved Date` + `Verified By` populated. `docs/qa/templates/TEST-EXECUTION-TRACKING.csv` rows TC-IPC-BUS-001 + TC-IPC-BUS-005 flip `failed` → `passed` with the atomic commit SHA as evidence.

## Task breakdown

| T# | Task | Est LOC | Est tests |
|---|---|---|---|
| T1 | Plan doc (this file) | ~200 | — |
| T2 | `packages/shared-types/src/events.ts` — +4 `EventType` literals + 4 payload interfaces (with JSDoc anchoring step-(f) → FOLLOWUP-P1-extended lineage) | ~90 | — |
| T3 | `apps/desktop/src/main/ipc/handlers.ts` — 4 bus.emit blocks (employeesCreate + employeesFire snapshot-before-drop + ticketsAttachFile + ticketsDetachFile attachment-id snapshot) | ~150 | — |
| T4 | `apps/desktop/src/main/ipc/invariant-11-emit-handlers.test.ts` — +4 describe blocks × (happy path + throw-swallow + unwired warn) + cross-cutting HUMAN_USER_ID + cross-company isolation extensions | ~220 | +15 |
| T5 | `apps/desktop/src/renderer/src/hooks/use-employees.ts` — NEW `useEmployeeEventSync` hook. `apps/desktop/src/renderer/src/hooks/use-tickets.ts` — widen `useTicketEventSync` filter + JSDoc | ~80 | — |
| T6 | `apps/desktop/src/renderer/src/hooks/event-sync-hooks.test.ts` — +1 NEW describe block for `useEmployeeEventSync` + widened `useTicketEventSync` assertions + cross-hook contract row extended | ~150 | +12 |
| T7 | Verify (Node ABI rebuild → vitest full run → typecheck → lint → audit:claims → Electron ABI rebuild → E2E sanity) + atomic commit `feat(phase-5.6-m-c): FOLLOWUP-P1-extended …` + paired `chore(loki): …` ledger + QA tracker flip + audit section §3.1 CLOSED annotation | — | — |

**Totals:** ~890 LOC / +27 unit tests (1539 step-f baseline → ~1566 post-atomic).

## Verification gate

Per Phase 5.6 M-C verification recipe (carried forward from step e / step f):

1. **Node ABI rebuild** — `cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npm run install`
2. **vitest** — target ~1566/1566 (1539 step-f baseline → +27 new).
3. **typecheck** — clean across 6 packages.
4. **lint** — 0 errors / ≤21 warnings (step-f baseline preserved).
5. **audit:claims** — 92 verified / 3 allowlisted / 0 UNALLOWED (baseline preserved — no new IPC channels, no allowlist movement).
6. **Electron ABI rebuild** — `pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar`.
7. **E2E baseline** — 11 specs / 12 Playwright cases (no new specs; no renderer contract break).
8. **Loki verifiedBy** — populated on the paired ledger commit per S4 contract.
9. **QA tracker flip** — BUG-009/010/011 Resolution + Resolved Date + Verified By fields populated; TC-IPC-BUS-001 + TC-IPC-BUS-005 flip `failed` → `passed` with atomic-commit SHA as evidence.

## Acceptance criteria

- [ ] 4 new `EventType` union members shipped with full JSDoc rationale.
- [ ] 4 new payload interfaces with per-field doc comments.
- [ ] 4 handler emits wired (one per mutation), all with `try/catch` + error log + HUMAN_USER_ID actor + companyId-scoped `DashboardEvent` envelope.
- [ ] Snapshot-before-drop captured for `employee.fired` and `ticket.attachmentRemoved` payloads.
- [ ] Attachment emits thread `companyId` via a ticket fetch (phantom-id guard + companyId threading).
- [ ] 1 new renderer hook (`useEmployeeEventSync`) shipped with canonical signature + scope guard.
- [ ] 1 widened renderer hook (`useTicketEventSync`) subscribes to attachment events + invalidates `['ticket-attachments', ticketId]`.
- [ ] `invariant-11-emit-handlers.test.ts` expanded with 15+ new assertion tests.
- [ ] `event-sync-hooks.test.ts` expanded with 12+ new assertion tests.
- [ ] `docs/qa/templates/BUG-TRACKING-TEMPLATE.csv` rows BUG-009/010/011 populated: `Resolution`, `Resolved Date`, `Verified By`.
- [ ] `docs/qa/templates/TEST-EXECUTION-TRACKING.csv` rows TC-IPC-BUS-001, TC-IPC-BUS-005 flipped `failed` → `passed`.
- [ ] M-E safeguards green (S2 conformance CI, S3 pre-commit, S4 verifiedBy, no allowlist movement expected).
- [ ] Atomic commit `feat(phase-5.6-m-c): FOLLOWUP-P1-extended …` + paired `chore(loki): …` ledger.

## Milestone boundary

This atomic closes the FOLLOWUP-P1-extended scope and finalizes main-side Invariant #11 restoration for Phase 5.6 M-C. After ship, the two non-blocker Sprint-4 rows (TC-IPC-BUS-001, TC-IPC-BUS-005) pass, and M-D (UI Backfill) enters with guaranteed bus-event coverage for every `employees.*` and `tickets.*` mutation the HireDialog / FireDialog / attachment panel will drive.

`.loki/queue/current-task.json` is NOT reopened — M-C stays SHIPPED, stepsShipped gets a new entry appended for this atomic, head-of-queue stays at M-D.

## References

- Autonomous QA run report: [`docs/qa/2026-04-18-autonomous-run-report.md`](../qa/2026-04-18-autonomous-run-report.md)
- Ground-zero audit §3.1: [`docs/qa/2026-04-18-ground-zero-audit.md`](../qa/2026-04-18-ground-zero-audit.md)
- Step-f parent plan: [`docs/plans/2026-04-18-team-x-phase-5.6-m-c-step-f-invariant-11-main-side.md`](2026-04-18-team-x-phase-5.6-m-c-step-f-invariant-11-main-side.md)
- Remediation plan: [`docs/plans/2026-04-17-team-x-phase-5.6-remediation.md`](2026-04-17-team-x-phase-5.6-remediation.md)
- M-E safeguards: [`docs/plans/2026-04-17-team-x-phase-5.6-m-e-process-safeguards.md`](2026-04-17-team-x-phase-5.6-m-e-process-safeguards.md)
