# Phase 5.6 M-D Workspace Switcher Pre-Flight

**Date:** 2026-04-19  
**Milestone:** Phase 5.6 M-D — UI Backfill  
**Commit:** `1d04e77 test(e2e): add workspace switcher preflight`

## Scope

This pre-flight validates the restored step (a+b) multi-company surface before M-D step (c):

- boot Electron with a fresh user data directory;
- verify the top-bar `WorkspaceSwitcher` renders with seeded `Strategia-X`;
- open the switcher and launch `CreateCompanyDialog`;
- create a second workspace through the live `companies.create` IPC path;
- verify the new workspace becomes active;
- verify both seeded and new workspaces are present through `companies.list`;
- switch back to `Strategia-X`.

## Findings Closed

| Finding | Root Cause | Fix |
|---|---|---|
| Native startup failure | `better-sqlite3` binary had Node ABI `137`; Electron required ABI `125`. | Rebuilt Electron native modules with `pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar`. |
| Existing E2E strict-mode selector failures | Step (a) added a second visible `Strategia-X` in the workspace switcher, so `getByText('Strategia-X', { exact: true })` matched two nodes. | Added stable `data-testid="app-brand-name"` to the brand label and updated boot assertions to use it. |
| Created workspace did not stay active | `CreateCompanyDialog` called `setCompanyId(result.companyId)` before the global `['companies']` cache included the new row; `App.tsx` interpreted the id as stale and reset to `companies[0]`. | Hydrate `['companies']` with the created company, invalidate/refetch, then flip `companyId`. |
| Dropdown stayed open behind create flow | Create menu item used `e.preventDefault()`, blocking Radix's normal menu-close behavior. | Let Radix close the menu by using `onSelect={() => setCreateOpen(true)}`. |

## Verification

- `pnpm -F @team-x/desktop build` — pass.
- `pnpm -F @team-x/desktop exec vitest run src/renderer/src/features/workspace/create-company-dialog.test.tsx src/renderer/src/features/workspace/workspace-switcher.test.tsx src/renderer/src/hooks/event-sync-hooks.test.ts` — pass, 140 tests.
- `pnpm -F @team-x/desktop exec playwright test` — pass, 13/13 cases.
- `pnpm lint` — pass, 21 known warnings.
- `pnpm typecheck` — pass.
- `pnpm test` — pass, 121 files / 1655 tests.
- Final post-Electron-rebuild pre-flight: `pnpm -F @team-x/desktop exec playwright test e2e/workspace-switcher.spec.ts` — pass.

## Result

M-D step (a+b) is now protected by a real E2E pre-flight. Head-of-queue advances to step (c): `CompanySettings` panel + `HireDialog` manager-select.
