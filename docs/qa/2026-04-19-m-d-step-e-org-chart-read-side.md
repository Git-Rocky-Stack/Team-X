# Phase 5.6 M-D Step (e) QA Evidence — OrgChartView Read-Side

Date: 2026-04-19

## Scope

- Org top-bar tab enabled.
- `useOrgChart` queries `orgchart.get` with company-scoped React Query keys.
- `useOrgChartEventSync` invalidates `['orgchart', companyId]` on `employee.hired`, `employee.fired`, `employee.promoted`, and `employee.managerSet`.
- `OrgChartView` renders no-company, loading, error, empty, and tree states.
- `OrgChartTree` builds the hierarchy client-side from `employees`, `edges`, and `rootIds`.
- `OrgChartNode` renders level badges and a keyboard-reachable step-(f) action affordance.
- `apps/desktop/e2e/org-chart.spec.ts` covers the seeded read-side path.

## Verification

- RED first: `pnpm -F @team-x/desktop exec vitest run src/renderer/src/features/orgchart/org-chart-view.test.tsx src/renderer/src/features/chat/chat-view.test.tsx` failed as expected before implementation, then passed 14/14.
- Focused renderer suite: 4 files / 113 tests.
- `pnpm -F @team-x/desktop typecheck` — PASS.
- `pnpm lint` — PASS, 0 errors / 21 warnings.
- `pnpm -F @team-x/desktop build` — PASS.
- `pnpm -F @team-x/desktop exec playwright test e2e/org-chart.spec.ts` — PASS, 1/1 case.
- `pnpm -F @team-x/desktop exec playwright test e2e/workspace-switcher.spec.ts` — PASS, 4/4 cases.

## Result

Step (e) is implemented and verified in atomic commit `2853d18`. No new IPC channels were added; M-D preserves the M-C exit allowlist shape.
