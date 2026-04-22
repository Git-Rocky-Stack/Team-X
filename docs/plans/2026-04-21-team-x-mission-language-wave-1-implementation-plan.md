# Team-X Mission Language Wave 1 - Implementation Plan

**Date:** 2026-04-21  
**Design reference:** [`2026-04-21-team-x-mission-language-wave-1-design.md`](./2026-04-21-team-x-mission-language-wave-1-design.md)  
**Primary objective:** carry the Mission Control visual language through the app shell and the next highest-frequency operational surfaces without rewriting Team-X's navigation or feature contracts.

## Overview

Wave 1 is organized into five implementation slices:

1. `Shell foundation`
2. `Tickets`
3. `Telemetry`
4. `Chat, Copilot, and Company Settings`
5. `Validation and finish polish`

The plan is intentionally shell-first. Shared surface primitives land before page-level restyles so every Wave 1 surface uses the same grammar.

---

## Slice 1: Shell Foundation

### Goal

Create the shared mission-language primitives and apply them to the global shell layer first.

### Deliverables

- Add reusable mission primitives for page framing, heroes, section cards, state blocks, and control rows.
- Restyle the top bar with stronger control grouping and active-state hierarchy.
- Upgrade the workspace switcher to match the new shell language.
- Ensure existing pages still mount correctly inside the new shell.

### Likely touchpoints

- `apps/desktop/src/renderer/src/app/top-bar.tsx`
- `apps/desktop/src/renderer/src/features/workspace/workspace-switcher.tsx`
- new shared mission/shell components under `apps/desktop/src/renderer/src/features/`
- `apps/desktop/src/renderer/src/styles/globals.css`

### Tests

- source or unit tests for shared mission primitives
- top-bar/workspace-switcher guard updates if structure changes
- live launch verification

### Exit criteria

- the app shell clearly carries Mission Control language
- page content still mounts without layout regressions
- workspace controls remain fully usable

---

## Slice 2: Tickets

### Goal

Bring the ticket workflow into the new operational shell while preserving board and detail behavior.

### Deliverables

- Add a tickets operations header with backlog and blocked counts.
- Wrap the kanban board in mission-style section surfaces.
- Integrate the detail panel visually with the board rather than leaving it as a plain adjacent region.
- Align loading, empty, and error states with the shared mission state treatment.

### Likely touchpoints

- `apps/desktop/src/renderer/src/features/tickets/tickets-view.tsx`
- `apps/desktop/src/renderer/src/features/tickets/kanban-board.tsx`
- `apps/desktop/src/renderer/src/features/tickets/ticket-detail.tsx`
- shared mission primitives

### Tests

- touched tickets renderer tests
- state coverage for loading/error/empty cases
- live navigation check from dashboard queue deep-links into Tickets

### Exit criteria

- tickets feels like a first-class operational surface
- detail panel behavior is unchanged functionally
- state handling remains explicit and localized

---

## Slice 3: Telemetry

### Goal

Restyle Telemetry into a polished analytics command surface without changing its subview model.

### Deliverables

- Add a telemetry hero with scope context and summary metrics.
- Convert subtabs and kind filters into mission-style segmented controls.
- Wrap charts, tables, and breakdown views in stronger section cards.
- Bring loading, empty, and error treatments into the shared mission pattern.

### Likely touchpoints

- `apps/desktop/src/renderer/src/features/telemetry/telemetry-view.tsx`
- `apps/desktop/src/renderer/src/features/telemetry/company-telemetry.tsx`
- `apps/desktop/src/renderer/src/features/telemetry/employee-telemetry.tsx`
- `apps/desktop/src/renderer/src/features/telemetry/cost-breakdown.tsx`
- shared mission primitives

### Tests

- touched telemetry guard tests
- targeted checks that subview switching and kind filters still work
- live telemetry navigation verification

### Exit criteria

- telemetry reads as part of the same operational product as Mission Control
- analytics content remains easy to scan
- existing subview/filter behavior stays intact

---

## Slice 4: Chat, Copilot, And Company Settings

### Goal

Unify communication and workspace-control surfaces with the mission-language shell.

### Deliverables

- Restyle `ChatView` headers and state handling.
- Upgrade `ChatDrawer` read-only and live-state chrome to match the new shell.
- Bring `CopilotSidebar` into the same communication-system treatment.
- Upgrade `CompanySettings` into a stronger workspace-control sheet with better section hierarchy and dangerous-action containment.

### Likely touchpoints

- `apps/desktop/src/renderer/src/features/chat/chat-view.tsx`
- `apps/desktop/src/renderer/src/features/chat/chat-drawer.tsx`
- `apps/desktop/src/renderer/src/features/copilot/copilot-sidebar.tsx`
- `apps/desktop/src/renderer/src/features/workspace/company-settings.tsx`
- shared mission primitives

### Tests

- touched chat/copilot/settings renderer tests
- state coverage for loading/error/read-only banners where applicable
- live interaction pass across Chat and Copilot thread entry points

### Exit criteria

- chat and copilot feel like one system with multiple modes
- workspace settings visually fits the new shell
- no regression to chat thread flows or settings mutations

---

## Slice 5: Validation And Finish Polish

### Goal

Lock the Wave 1 carry-forward down and ensure the new language is stable enough for Wave 2 reuse.

### Deliverables

- Tighten any remaining state mismatches across Wave 1 pages.
- Normalize spacing, card depth, and control-row behavior across the updated views.
- Confirm the shared mission primitives are sufficient for future page adoption.

### Likely touchpoints

- shared mission primitives
- touched Wave 1 views
- `apps/desktop/src/renderer/src/styles/globals.css`

### Tests

- focused renderer tests for touched surfaces
- `pnpm -F @team-x/desktop typecheck`
- `pnpm -F @team-x/desktop build`
- `git diff --check`
- live app launch and spot-check after the full pass

### Exit criteria

- Wave 1 reads as one coherent product pass
- state handling remains clear on all touched pages
- shared primitives are reusable enough to support Wave 2

---

## Recommended Task Breakdown

### T1: Build shared mission primitives

- add page shell, hero, section card, control row, state block, metric tile, and rail card

### T2: Restyle the app shell

- update top bar and workspace switcher
- make sure all existing views still mount cleanly

### T3: Restyle Tickets

- add operations header and stronger board/detail hierarchy

### T4: Restyle Telemetry

- add page hero, segmented controls, and upgraded data surfaces

### T5: Restyle Chat, Copilot, and Company Settings

- unify communication chrome
- upgrade the workspace-control sheet

### T6: Validate Wave 1 end-to-end

- run focused tests
- run desktop typecheck/build
- launch the app and verify the updated shell live

---

## Verification Strategy

At the end of each slice:

- run touched renderer tests
- verify state treatment for loading, empty, and error paths
- launch the desktop app when the slice materially changes page layout or interaction chrome

At the end of the full pass:

- run focused Wave 1 tests
- run `pnpm -F @team-x/desktop typecheck`
- run `pnpm -F @team-x/desktop build`
- run `git diff --check`
- launch the app and spot-check Wave 1 navigation and usability
