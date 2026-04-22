# Dashboard Mission Control - Implementation Plan

**Date:** 2026-04-21  
**Design reference:** [`2026-04-21-dashboard-mission-control-design.md`](./2026-04-21-dashboard-mission-control-design.md)  
**Primary objective:** turn the dashboard into a bold operations-first control surface without inventing fake activity or destabilizing adjacent views.

## Overview

This plan turns the approved design into five implementation slices:

1. `Dashboard shell and visual hierarchy`
2. `Agent Runs panel`
3. `Employee Queues panel`
4. `Workspace-scoped layout persistence`
5. `Validation and cascade readiness`

The first pass should stay narrow: make the dashboard excellent first, then reuse its visual language elsewhere.

---

## Slice 1: Dashboard Shell And Visual Hierarchy

### Goal

Replace the current flat dashboard shell with a mission-control layout that establishes a stronger visual hierarchy and supports the new live panels.

### Deliverables

- Create the `Operations Hero` surface.
- Refresh dashboard spacing, surface layering, and page-level background treatment.
- Reframe the dashboard content order around:
  - hero
  - hybrid board
  - secondary rail
- Add visible `Agent Runs` and `Employee Queues` toggles to the hero.
- Add a `Reset layout` action.

### Likely touchpoints

- `apps/desktop/src/renderer/src/App.tsx`
- `apps/desktop/src/renderer/src/features/dashboard/cards-view.tsx`
- `apps/desktop/src/renderer/src/features/dashboard/dashboard-subtabs.tsx`
- `apps/desktop/src/renderer/src/styles/globals.css`
- new dashboard-specific components under `features/dashboard/`

### Tests

- dashboard render tests for the new hero and control strip
- layout tests for default hybrid visibility
- responsive smoke checks where feasible in existing renderer tests

### Exit criteria

- the dashboard reads as a clear mission-control page
- the hybrid board has a stable layout contract
- toggles are visible and keyboard-accessible

---

## Slice 2: Agent Runs Panel

### Goal

Surface active and recent agentic execution in a compact board that stays grounded in real run state.

### Deliverables

- Add an `Agent Runs` panel component.
- Derive run cards from existing run snapshot and dashboard event surfaces.
- Show:
  - request label
  - latest phase
  - step count
  - elapsed time
  - tokens
  - cost
  - terminal result or failure
- Keep progress step-based rather than percentage-based.
- Route card clicks into the related Copilot transcript.

### Likely touchpoints

- new hook for dashboard run projection under `apps/desktop/src/renderer/src/hooks/`
- `apps/desktop/src/renderer/src/hooks/use-agent-step-stream.ts`
- `apps/desktop/src/renderer/src/features/command/step-card.tsx`
- `apps/desktop/src/renderer/src/features/chat/chat-drawer.tsx`
- renderer event subscription utilities

### Tests

- unit tests for run-card state projection
- event-driven tests for running -> completed and running -> failed transitions
- click-through tests for transcript navigation

### Exit criteria

- the dashboard shows active runs without fabricated progress
- terminal states are explicit and scannable
- run cards deep-link correctly into Copilot context

---

## Slice 3: Employee Queues Panel

### Goal

Show employee workload as a combined durable and live queue surface.

### Deliverables

- Add an `Employee Queues` panel component.
- Aggregate ticket backlog per employee by:
  - `open`
  - `in-progress`
  - `blocked`
  - `done`
- Layer live state on top using existing employee live and queued-chat state.
- Show queue pressure visually without losing precise counts.
- Support drill-down actions into Tickets or Chat.

### Likely touchpoints

- `apps/desktop/src/renderer/src/features/dashboard/employee-card.tsx`
- `apps/desktop/src/renderer/src/hooks/use-tickets.ts`
- `apps/desktop/src/renderer/src/store/app-store.ts`
- `apps/desktop/src/renderer/src/features/tickets/`
- new queue projection helper or hook under `features/dashboard/` or `hooks/`

### Tests

- projection tests for backlog counts
- projection tests for live state overlays
- empty-state coverage for employees with no assigned work
- navigation tests for queue affordances

### Exit criteria

- employee workload is readable in one scan
- durable backlog and live activity are clearly separated
- blocked and overloaded employees are visually obvious

---

## Slice 4: Workspace-Scoped Layout Persistence

### Goal

Persist dashboard panel visibility per workspace through existing company settings, not global settings.

### Deliverables

- Extend the typed `CompanySettings` shape to include dashboard layout state.
- Read initial dashboard layout from `company.settings`.
- Persist toggle changes through `ipc.companies.update`.
- Implement `Reset layout` back to the default hybrid state.
- Keep the behavior additive and backward-compatible when no dashboard layout is present.

### Likely touchpoints

- `packages/shared-types/src/entities.ts`
- `packages/shared-types/src/ipc.ts` if request typing needs refinement
- `apps/desktop/src/renderer/src/features/workspace/company-settings.tsx` only if shared helper reuse is useful
- company query cache update paths
- new dashboard layout hook or store slice

### Tests

- persistence tests for default state
- persistence tests for show/hide toggles
- cache update tests after `companies.update`
- reset-layout tests

### Exit criteria

- panel visibility survives relaunch and workspace switching
- no saved state still resolves to the default hybrid board
- layout state does not leak across workspaces

---

## Slice 5: Validation And Cascade Readiness

### Goal

Lock the dashboard redesign down and prepare its visual language to propagate into adjacent pages later.

### Deliverables

- Tighten empty and error states for all mission-control panels.
- Add panel-local retry behavior where needed.
- Verify the dashboard still coexists cleanly with Copilot insights and recent commands.
- Capture the reusable visual primitives that should carry into other pages next.

### Likely touchpoints

- dashboard tests
- telemetry snapshot components
- copilot dashboard widget
- commands view styling

### Tests

- dashboard empty-state coverage
- dashboard error-state coverage
- renderer snapshot or structural tests for the new hierarchy

### Exit criteria

- the dashboard feels complete rather than partially refreshed
- panel failures remain isolated
- the page exposes a clear styling direction to cascade outward later

---

## Recommended Task Breakdown

### T1: Build the mission-control shell

- add the operations hero
- establish the new layout and surface hierarchy
- wire visible toggles and layout expansion behavior

### T2: Build `Agent Runs`

- add the panel, run card, and state projection layer
- wire live updates and transcript deep-links

### T3: Build `Employee Queues`

- derive employee workload from tickets and live state
- render the combined queue board

### T4: Persist layout per workspace

- extend typed company settings
- wire `companies.update`
- add reset behavior

### T5: Refine supporting panels

- integrate copilot insights, command history, and telemetry snapshot into the new hierarchy

### T6: Validate the dashboard end-to-end

- run targeted tests
- verify empty, error, and responsive states

---

## Verification Strategy

At the end of each slice:

- run targeted renderer tests for touched dashboard components
- run relevant shared-types and hook tests
- verify no regression to existing dashboard subviews, Copilot drawer entry points, or tickets navigation

At the end of the full pass:

- run touched unit tests
- run renderer typecheck
- smoke the dashboard in the desktop app if feasible

---

## Risks And Controls

- **Signal mismatch risk:** dashboard cards can drift from real execution state if projections are too clever.
  - Control: prefer direct event- and query-backed data over inferred summaries.
- **Visual clutter risk:** stronger visual direction can become noisy.
  - Control: keep the hero dense but disciplined; push deeper detail into drill-downs.
- **Persistence drift risk:** workspace layout changes can feel stale if cache updates lag.
  - Control: update React Query cache optimistically and invalidate after save.
- **Scope creep risk:** dashboard polish can spill into every page at once.
  - Control: finish the dashboard first, then cascade intentionally.

---

## Recommended Immediate Next Step

Start with `T1` and `T4` together:

- establish the new dashboard shell
- wire visible panel toggles
- persist the layout per workspace from the start

That creates a stable frame for the `Agent Runs` and `Employee Queues` panels to drop into next.
