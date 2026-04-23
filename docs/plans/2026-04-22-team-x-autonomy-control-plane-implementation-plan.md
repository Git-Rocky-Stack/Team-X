**Date:** 2026-04-22  
**Design reference:** [`2026-04-22-team-x-autonomy-control-plane-design.md`](./2026-04-22-team-x-autonomy-control-plane-design.md)  
**Primary objective:** ship the first `Autonomy Control Plane` foundation for Team-X: operator identities, runtime profiles, recurring routines, budget governance, unified approvals, artifact records, and shared/cloud-ready seams.

## Overview

This plan breaks the work into eight slices:

1. `Operator and access foundation`
2. `Autonomy route and shell`
3. `Runtime profiles and employee bindings`
4. `Routine model and orchestration`
5. `Budget policies and enforcement`
6. `Approvals inbox`
7. `Artifacts and explicit outcomes`
8. `Shared/cloud seams and hardening`

The recommended path starts by replacing the single-human assumption and adding the new autonomy surface, then layers execution and governance on top. This keeps the architecture coherent and avoids bolting budgets or approvals onto an unstable identity model.

---

## Slice 1: Operator And Access Foundation

### Goal

Introduce real human operator identities and company membership without breaking local single-owner behavior.

### Deliverables

- Add operator and membership entities to shared types.
- Add database tables for:
  - `operators`
  - `operator_memberships`
- Replace the hardcoded `HUMAN_USER_ID` assumption with a local owner bootstrap path.
- Make audit, approval, and write-side flows resolve actor identity through an operator service.
- Preserve a zero-login local default.

### Likely touchpoints

- `packages/shared-types/src/entities.ts`
- `packages/shared-types/src/ipc.ts`
- `packages/shared-types/src/events.ts`
- `apps/desktop/src/main/db/schema.ts`
- new migration under `apps/desktop/src/main/db/migrations/`
- `apps/desktop/src/main/ipc/handlers.ts`
- `apps/desktop/src/main/db/repos/threads.ts`
- new `apps/desktop/src/main/services/operator-access-service.ts`

### Tests

- repo tests for operator bootstrap and membership lookups
- IPC handler tests showing local owner resolution
- regression test proving existing DM/chat flows still work after actor resolution changes

### Exit criteria

- Team-X no longer depends on a hardcoded single-human id
- current local desktop behavior still works with an auto-bootstrapped owner

---

## Slice 2: Autonomy Route And Shell

### Goal

Add the new operator-facing control plane surface to the app.

### Deliverables

- Add `autonomy` to the app store route union.
- Route the new view through [App.tsx](../../apps/desktop/src/renderer/src/App.tsx).
- Add a persistent left-rail nav entry.
- Build an `AutonomyView` shell with subview tabs for:
  - `Runtimes`
  - `Routines`
  - `Budgets`
  - `Approvals`
  - `Artifacts`
  - `Access`
- Reuse mission shell components and the current product design language.

### Likely touchpoints

- `apps/desktop/src/renderer/src/store/app-store.ts`
- `apps/desktop/src/renderer/src/App.tsx`
- `apps/desktop/src/renderer/src/app/sidenav.tsx`
- new files under `apps/desktop/src/renderer/src/features/autonomy/`
- `apps/desktop/src/renderer/src/features/mission/mission-shell.tsx`

### Tests

- route/source guards for the new app destination
- shell rendering tests
- navigation tests for the new left-rail entry

### Exit criteria

- the control plane exists as a visible first-class app surface
- empty states render cleanly even before the deeper slices land

---

## Slice 3: Runtime Profiles And Employee Bindings

### Goal

Introduce a real BYO-agent runtime layer for employees.

### Deliverables

- Add `runtime_profiles` and `employee_runtime_bindings` tables.
- Create IPC for:
  - list runtime profiles
  - create/update/delete runtime profile
  - bind employee to runtime profile
  - validate runtime profile health
- Support first runtime kinds:
  - `teamx-internal`
  - `bash`
  - `http`
  - external adapter placeholder kinds for `codex`, `claude-code`, and `cursor`
- Surface runtime assignment and health in the `Runtimes` panel.
- Connect runtime profiles to existing provider and extensions data where appropriate.

### Likely touchpoints

- `packages/shared-types/src/entities.ts`
- `packages/shared-types/src/ipc.ts`
- `apps/desktop/src/main/db/schema.ts`
- new repo under `apps/desktop/src/main/db/repos/`
- new `runtime-profile-service.ts`
- `apps/desktop/src/main/ipc/handlers.ts`
- new runtime UI under `features/autonomy/`
- existing settings/provider helpers as reference inputs

### Tests

- runtime profile CRUD tests
- employee binding tests
- health-check tests for local and HTTP runtime kinds
- renderer tests for assignment UI and status rendering

### Exit criteria

- employees can be assigned to named runtime profiles
- the system can distinguish internal vs external runtime posture

---

## Slice 4: Routine Model And Orchestration

### Goal

Add first-class recurring operating loops without violating the existing orchestrator model.

### Deliverables

- Add `routines` and `routine_runs` tables.
- Create routine CRUD IPC and renderer hooks.
- Define supported trigger modes for the first pass:
  - interval
  - daily/weekly schedule
  - event-assisted recurrence later
- Build a routine service that converts due routines into explicit work objects.
- Integrate routine execution with the existing orchestrator rather than building a separate scheduler engine.
- Add routine visibility to the `Routines` autonomy panel and a compact signal on Mission Control later.

### Likely touchpoints

- new DB schema + repos
- new `routine-service.ts`
- orchestrator integration in `apps/desktop/src/main/index.ts` or adjacent services
- `packages/shared-types/src/events.ts`
- renderer autonomy panels

### Tests

- due-routine selection tests
- routine-run creation tests
- orchestrator integration tests showing routines produce explicit work objects
- renderer tests for list/empty/error states

### Exit criteria

- operators can define recurring routines
- a due routine results in visible work, not hidden background state only

---

## Slice 5: Budget Policies And Enforcement

### Goal

Elevate budgets from technical caps to operator-facing business governance.

### Deliverables

- Add `budget_policies` and `budget_ledger_entries` tables.
- Create policy scopes for:
  - company
  - employee
  - runtime profile
  - routine
- Build a budget governance service that can:
  - compute current spend vs policy
  - emit warnings
  - hard-stop or auto-pause execution
  - trigger approval items for exceptions
- Connect current telemetry/cost data to the new policy layer.
- Add `Budgets` panel UI with summaries, thresholds, and control affordances.

### Likely touchpoints

- new DB schema + repos
- `apps/desktop/src/main/services/budget-governance-service.ts`
- provider/router or run-completion accounting seam
- telemetry IPC and aggregation helpers
- autonomy budgets renderer panel

### Tests

- policy scope resolution tests
- warning and hard-stop tests
- approval-escalation tests for over-limit actions
- renderer tests for budget summaries and alert states

### Exit criteria

- operators can create and inspect budget policy
- runtime or routine execution can be blocked or escalated by budget policy

---

## Slice 6: Approvals Inbox

### Goal

Unify existing approval work into one operator surface.

### Deliverables

- Add `approval_items` and `approval_decisions` tables if not covered by prior slices.
- Build an approval inbox service with item kinds for:
  - authority
  - planner
  - runtime
  - routine
  - budget
  - deliverable
  - artifact
- Route current authority-request and planner-style approvals into the new unified model.
- Build the `Approvals` autonomy panel with filtering, decision controls, and rationale display.
- Emit clear audit events for every approval transition.

### Likely touchpoints

- existing authority repo + handlers
- planner settings / write-side tool approval seams
- new approval service and repos
- renderer autonomy approvals panel
- audit event helpers

### Tests

- item creation and decision tests
- migration tests for authority/planner-originated approvals
- renderer tests for inbox filtering and actions

### Exit criteria

- operators can see pending governance work in one place
- existing approval-related subsystems begin resolving through the shared model

---

## Slice 7: Artifacts And Explicit Outcomes

### Goal

Make outputs first-class and tie them to execution context.

### Deliverables

- Add `artifacts` table and shared contracts.
- Create artifact record creation paths for:
  - routine outputs
  - deliverable reviews
  - generated exports or reports
  - linked vault/file outputs where possible
- Build `Artifacts` autonomy panel with filters, provenance, and preview/open actions.
- Add explicit outcome typing so work can resolve to:
  - artifact created
  - approval complete
  - report generated
  - publish/deploy pending or complete

### Likely touchpoints

- new `artifact-service.ts`
- write-side tool and review seams
- file/vault download metadata
- autonomy renderer panel

### Tests

- artifact creation tests
- provenance-linkage tests
- renderer tests for artifact list rendering and empty states

### Exit criteria

- Team-X can show concrete work products rather than only status transitions

---

## Slice 8: Shared/Cloud Seams And Hardening

### Goal

Make the first bundle structurally ready for multi-user and hosted operation without forcing cloud mode now.

### Deliverables

- Ensure every new control-plane entity is company-scoped and actor-aware.
- Remove remaining renderer or handler assumptions that a single local human owns all actions.
- Introduce a transport boundary abstraction so the domain model can later be served over IPC or remote API.
- Add `Access` panel UI for operator memberships and local/shared posture.
- Add user-guide content and onboarding for the new autonomy surfaces.
- Add dashboard and telemetry integrations where the new signals matter.

### Likely touchpoints

- renderer hooks that currently assume local-only access
- `apps/desktop/src/main/ipc/handlers.ts`
- preload API typing
- user guide content
- dashboard / telemetry summary rows

### Tests

- actor-attribution tests across the new entities
- transport-boundary contract tests
- renderer tests for access states and local/shared posture messaging

### Exit criteria

- the control plane is still local-first, but the architecture is no longer trapped in a single-user local-only assumption

---

## Recommended Task Breakdown

### T1: Operator tables and local owner bootstrap

- schema
- repo
- actor resolution
- regression coverage

### T2: Add the autonomy route and shell

- new top-level app view
- left-rail nav
- subview state

### T3: Ship runtime profiles

- CRUD
- assignment
- health
- first runtime kinds

### T4: Ship routine definitions and due-run execution

- routine scheduler model
- explicit work creation
- UI shell

### T5: Add budget policy and enforcement

- policy scopes
- ledgering
- warnings and stop behavior

### T6: Unify approvals

- approval items
- shared inbox
- hook authority and planner flows into it

### T7: Add artifact records and outcomes

- artifact model
- renderer listing
- source linkage

### T8: Harden for shared/cloud-ready operation

- operator access UI
- actor-aware flows
- transport seams
- onboarding and dashboard integration

---

## Recommended Initial Implementation Slice

The clean first slice is:

- `Slice 1: Operator and access foundation`
- `Slice 2: Autonomy route and shell`

That pairing creates the visible product destination and removes the most dangerous architectural blocker first: the hardcoded single-human assumption. It also gives every later slice a stable place to land in the UI.

Only after that should the work move into runtime profiles and routines.
