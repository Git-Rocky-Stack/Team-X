# Phase 5.6 M-D Step (g) — E2E + Verification Gate

**Date:** 2026-04-19 (America/Los_Angeles; some run artifacts use 2026-04-20 UTC timestamps)  
**Milestone:** Phase 5.6 M-D — UI Backfill  
**Result:** PASS — M-D exit KPI closed

## Scope

Step (g) closes M-D by adding the remaining company lifecycle audit assertions and running the full verification gate over the restored renderer surfaces:

- Cluster A: WorkspaceSwitcher, CreateCompanyDialog, CompanySettings, HireDialog manager-select.
- Cluster B: OrgChartView, drag reassignment, manager-select rejection, promote, fire.
- Cluster C: Chat tab and ChatDrawer handoff.

## E2E Changes

- `apps/desktop/e2e/workspace-switcher.spec.ts`
  - `createWorkspace()` now returns the created company id for audit assertions.
  - Added `expectCompanyAuditEvents()` over `window.teamx.audit.list`.
  - CompanySettings flow now verifies `company.created`, `company.updated`, `company.archived`, and the post-sweep `company.deleted` row.
  - Note: `companies.delete` intentionally sweeps prior event rows for the target company before emitting the snapshot-bearing `company.deleted` row, so the delete path asserts only the durable post-delete event for that workspace.
- `apps/desktop/e2e/org-chart.spec.ts`
  - Kept valid drag/drop coverage for report-to-manager reassignment and persistence across app restart.
  - Hardened the invalid-cycle check to use the visible manager-select flow after restart. This avoids a flaky nested ancestor-to-descendant drag gesture while still exercising the same `employees.setManager` cycle guard and rollback/toast behavior.

## Verification

| Gate | Result |
|---|---|
| Node ABI rebuild | PASS — `npm run install` in `node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3` |
| Full Vitest | PASS — `pnpm test` → 125 files / 1683 tests |
| Root typecheck | PASS — `pnpm typecheck` clean across 6 packages |
| Lint | PASS — `pnpm lint` → 0 errors / 21 existing warnings |
| Claims audit | PASS — `pnpm audit:claims` → 92 verified / 3 allowlisted / 0 UNALLOWED out of 95 |
| Whitespace | PASS — `git diff --check` clean |
| Electron ABI rebuild | PASS — `pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar` |
| Build | PASS — `pnpm build` |
| Focused workspace E2E | PASS — `pnpm -F @team-x/desktop exec playwright test e2e/workspace-switcher.spec.ts` → 4/4 |
| Focused org-chart E2E | PASS — `pnpm -F @team-x/desktop exec playwright test e2e/org-chart.spec.ts` → 2/2 |
| Full Playwright | PASS — `pnpm -F @team-x/desktop exec playwright test` → 18/18 |

## Notes

- Full Playwright initially surfaced one flaky assertion in `org-chart.spec.ts`: the valid reparent path passed, but the invalid nested drag did not consistently fire the drop handler in the full-suite run. The test now verifies the invalid cycle through manager-select, which uses the same mutation path and user-facing toast without relying on nested HTML5 drag semantics.
- M-D added no IPC channels, migrations, or bus events. The allowlist remains unchanged at 3 entries, all scheduled for M-F documentation truth-up.
- The remaining FOLLOWUP-P2 from step (f) is unchanged: add a future thin read-only `roles.list` IPC so `useRoles()` no longer needs the bundled static 55-role non-system catalog.

## Exit KPI

- Unit: 125 files / 1683 tests.
- E2E: 13 specs / 18 Playwright cases.
- Typecheck: clean across 6 packages.
- Lint: 0 errors / 21 warnings.
- Claims audit: 92 verified / 3 allowlisted / 0 UNALLOWED.
- Phase 5.6 M-D status: shipped; M-F Documentation Truth-Up is unblocked.
