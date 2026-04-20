# Phase 5.6 M-D Step (f) QA Evidence — Org-Chart Interactions

**Scope:** Cluster B org-chart write-side UI over the already-shipped M-C IPC surface.

**Result:** Implemented and verified in atomic commit `3aca4ed`.

## What Changed

- Added optimistic React Query mutation hooks for `employees.fire`, `employees.promote`, and `employees.setManager`, with rollback on IPC failure and reconciliation via the existing employee bus-event invalidators.
- Added `useRoles()` with the 55 bundled non-system role options. The two system pseudo-employee roles remain excluded from renderer selection.
- Replaced the step-(e) placeholder actions with live Chat, Promote, Fire, manager-select, and native HTML drag/drop controls.
- Added `PromoteDialog` and `FireDialog` write gates.
- Extended `org-chart.spec.ts` to cover drag persistence across app restart, invalid drop feedback, promote, fire, and Audit tab event visibility.

## Verification

- RED first: `pnpm -F @team-x/desktop exec vitest run src/renderer/src/features/orgchart/org-chart-interactions.test.tsx` failed before implementation because the step-(f) files and action wiring did not exist.
- Focused renderer suite: `pnpm -F @team-x/desktop exec vitest run src/renderer/src/features/orgchart/org-chart-view.test.tsx src/renderer/src/features/orgchart/org-chart-interactions.test.tsx src/renderer/src/features/chat/chat-view.test.tsx src/renderer/src/app/top-bar.test.tsx src/renderer/src/hooks/event-sync-hooks.test.ts` passed 5 files / 117 tests.
- Typecheck: `pnpm -F @team-x/desktop typecheck` passed.
- Lint: `pnpm lint` passed with 0 errors / 21 pre-existing warnings.
- Build: `pnpm -F @team-x/desktop build` passed.
- E2E: `pnpm -F @team-x/desktop exec playwright test e2e/org-chart.spec.ts` passed 2/2 cases.
- Regression E2E: `pnpm -F @team-x/desktop exec playwright test e2e/workspace-switcher.spec.ts` passed 4/4 cases.

## Follow-Up

`roles.list` is not exposed through preload IPC today. Step (f) stayed inside the M-D no-new-IPC boundary by using the bundled 55-role read-only catalog in `useRoles()`. FOLLOWUP-P2: replace that static renderer catalog with a thin read-only `roles.list` IPC after change-control approval.
