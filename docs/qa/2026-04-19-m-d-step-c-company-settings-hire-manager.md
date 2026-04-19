# Phase 5.6 M-D Step (c) QA Evidence — CompanySettings + HireDialog Manager Select

Date: 2026-04-19

## Scope

Step (c) ships the Cluster A workspace settings surface and closes the remaining hire-dialog manager assignment gap:

- `CompanySettings` sheet wired to `companies.update`, `companies.archive`, and `companies.delete`
- Workspace switcher CTA for opening company settings
- Public `Company` wire shape widened with `status`, `icon`, and `theme`
- `useCompanies()` filters archived companies out of active workspace selection
- `HireDialog` adds a same-company `Reports to (optional)` select and calls `employees.setManager` after a successful hire
- `apps/desktop/e2e/workspace-switcher.spec.ts` now covers create/switch, settings edit/archive/delete, and hire-manager org-edge creation

## Verification

| Gate | Result |
| --- | --- |
| `pnpm -F @team-x/desktop exec vitest run src/renderer/src/features/workspace/company-settings.test.tsx` | PASS — 10/10 |
| Focused step (c) regression suite: `company-settings.test.tsx`, `workspace-switcher.test.tsx`, `create-company-dialog.test.tsx`, `companies-handlers.test.ts`, `handlers.test.ts` | PASS — 5 files / 118 tests |
| `pnpm -F @team-x/desktop typecheck` | PASS |
| `pnpm lint` | PASS — 0 errors / 21 warnings |
| `pnpm -F @team-x/desktop build` | PASS |
| `pnpm -F @team-x/desktop test` | PASS — 87 files / 1335 tests |
| `pnpm -F @team-x/desktop exec playwright test e2e/workspace-switcher.spec.ts` | PASS — 3/3 cases |
| `pnpm exec vitest run packages/shared-types/src/entities.test.ts` | PASS — 16/16 |

## Native ABI Note

The full desktop Vitest suite requires `better-sqlite3` rebuilt for the local Node ABI. After the full Vitest pass, `electron-rebuild -f -w better-sqlite3,keytar` was run and the workspace-switcher Playwright spec was rerun green, leaving native modules restored for Electron execution.

## Result

Step (c) is implemented and verified in the working tree. No new IPC channels were added; M-D preserves the M-C exit allowlist shape.
