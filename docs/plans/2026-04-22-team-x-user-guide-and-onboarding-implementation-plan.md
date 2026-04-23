**Date:** 2026-04-22  
**Design reference:** [`2026-04-22-team-x-user-guide-and-onboarding-design.md`](./2026-04-22-team-x-user-guide-and-onboarding-design.md)  
**Primary objective:** ship a first-class in-app `User Guide` with workspace-scoped onboarding progress, role-based content, deep links, and a persistent left-rail entry.

## Overview

This plan breaks the work into six slices:

1. `Guide foundation and routing`
2. `Structured content and guide shell`
3. `Workspace progress persistence`
4. `Interactive onboarding actions`
5. `First-run onboarding behavior`
6. `Hardening and content expansion`

The recommended first release should land a real usable guide quickly, then deepen the checklist logic and content breadth without destabilizing the rest of the shell.

---

## Slice 1: Guide Foundation And Routing

### Goal

Create the new top-level guide surface and make it reachable from the left rail.

### Deliverables

- Add `user-guide` to the app store `ActiveView` union.
- Route the new view through [App.tsx](../../apps/desktop/src/renderer/src/App.tsx).
- Add a persistent `User Guide` entry near the bottom of [sidenav.tsx](../../apps/desktop/src/renderer/src/app/sidenav.tsx).
- Keep the entry visually aligned with the mission-language shell.

### Likely touchpoints

- `apps/desktop/src/renderer/src/store/app-store.ts`
- `apps/desktop/src/renderer/src/App.tsx`
- `apps/desktop/src/renderer/src/app/sidenav.tsx`
- `apps/desktop/src/renderer/src/app/layout.tsx`

### Tests

- source-string guard for the new `user-guide` route
- source-string guard for the lower rail guide entry

### Exit criteria

- the guide is reachable from the app
- the new route does not regress existing views

---

## Slice 2: Structured Content And Guide Shell

### Goal

Build the guide UI around typed content definitions rather than hardcoded inline copy.

### Deliverables

- Add `features/user-guide/guide-content.ts`.
- Add typed role/section/task helpers.
- Build `user-guide-view.tsx` using mission shell primitives.
- Include:
  - role switcher
  - search
  - section index
  - reading pane
  - checklist rail

### Likely touchpoints

- new files under `apps/desktop/src/renderer/src/features/user-guide/`
- `apps/desktop/src/renderer/src/features/mission/mission-shell.tsx`
- `apps/desktop/src/renderer/src/styles/globals.css`

### Tests

- content integrity tests for stable ids and valid role mappings
- render/composition tests for the guide shell

### Exit criteria

- guide content is structured and extensible
- the UI supports role filtering and section selection

---

## Slice 3: Workspace Progress Persistence

### Goal

Persist onboarding state per workspace through `company.settings`.

### Deliverables

- Add `userGuide` to `CompanySettings` in shared types.
- Add helper functions for reading/writing guide settings.
- Add a renderer hook that persists through `ipc.companies.update`.
- Optimistically patch the `['companies']` cache on guide state changes.

### Likely touchpoints

- `packages/shared-types/src/entities.ts`
- `apps/desktop/src/renderer/src/hooks/use-companies.ts`
- new guide preference hook under `features/user-guide/`
- `apps/desktop/src/renderer/src/features/dashboard/use-dashboard-layout-preferences.ts` pattern

### Tests

- helper tests for guide settings merge/read behavior
- mutation tests for optimistic cache writes and rollback on error

### Exit criteria

- guide progress survives workspace switching and relaunch
- persistence errors surface clearly in the UI

---

## Slice 4: Interactive Onboarding Actions

### Goal

Turn the guide into a live operational surface instead of static documentation.

### Deliverables

- Add guide jump actions that can:
  - open `Mission Control`
  - open `Settings`
  - focus `Extensions & Authority`
  - open `Chat`
  - open `Telemetry`
  - open `Audit`
  - request the `Hire` dialog
- Add task rendering for:
  - auto-detected tasks
  - manual tasks
  - jump tasks
- Add progress summaries such as `core steps remaining`

### Likely touchpoints

- `apps/desktop/src/renderer/src/store/app-store.ts`
- `apps/desktop/src/renderer/src/App.tsx`
- guide action helpers/hooks
- `features/settings/settings-view.tsx`

### Tests

- guide action routing tests
- task-completion tests for manual and auto-detected tasks
- settings focus tests if section focus is introduced

### Exit criteria

- the guide can drive users into real product actions
- progress reflects both stored and live state

---

## Slice 5: First-Run Onboarding Behavior

### Goal

Make the guide the default landing experience for not-yet-dismissed workspaces without turning it into a permanent interruption.

### Deliverables

- Detect undismissed guide state after active workspace resolution.
- Auto-open the guide welcome landing once per workspace per session.
- Add dismiss behavior that writes `welcomeDismissedAt`.
- Preserve normal navigation afterward.

### Likely touchpoints

- `apps/desktop/src/renderer/src/App.tsx`
- guide state hook
- `company.settings.userGuide`

### Tests

- first-run redirect test
- dismiss-once persistence test
- workspace switching test

### Exit criteria

- new workspaces see the guide
- dismissed workspaces do not get trapped in repeat onboarding

---

## Slice 6: Hardening And Content Expansion

### Goal

Deepen the guide so it feels comprehensive and trustworthy rather than a thin first pass.

### Deliverables

- Expand guide content for:
  - operations
  - tickets and projects
  - chat and copilot
  - extensions and authority
  - telemetry and audit
  - troubleshooting
- Add sharper completion rules:
  - provider configured
  - employee exists
  - extension installed
  - authority activity exists
- Add guide status affordances in the left rail.
- Improve empty/error states for early-stage workspaces.

### Likely touchpoints

- guide content definitions
- guide progress helpers
- left-rail rendering

### Tests

- coverage for completion heuristics
- rail-summary tests
- renderer state tests for empty and error conditions

### Exit criteria

- the guide feels comprehensive enough to onboard real users
- completion state stays consistent with live workspace data

---

## Recommended Task Breakdown

### T1: Add the route and left-rail entry

- store union update
- root app routing
- lower left-rail guide link

### T2: Build the guide shell and content model

- typed content
- role tabs
- search
- section navigation
- checklist rail

### T3: Persist workspace guide settings

- shared type update
- settings helpers
- optimistic `companies.update` mutation path

### T4: Wire live jump actions

- navigation targets
- hire dialog request path
- settings section focus

### T5: Ship first-run onboarding

- welcome detection
- dismiss persistence
- session-safe auto-open behavior

### T6: Expand and harden

- richer content
- completion heuristics
- status pill in left rail
- focused tests and polish

---

## Verification Strategy

At the end of each slice:

- run focused guide/store tests
- run `pnpm -F @team-x/desktop typecheck`
- run `pnpm -F @team-x/desktop build`

At the end of the full pass:

- run touched renderer tests
- run `git diff --check`
- live-test:
  - first-run welcome
  - dismiss behavior
  - guide deep links
  - workspace progress persistence
  - left-rail progress summary

---

## Recommended First Implementation Slice

Start with `Guide foundation and routing` plus `Structured content and guide shell`.

Why this first:

- it puts the guide into the product immediately
- it creates a real visual/documentation surface before deeper state logic
- it gives persistence and onboarding behavior a stable target to land on next
