# Team-X Phase 6 M40 Insight Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add local JSON and CSV export for active Copilot insights from the Copilot sidebar.

**Architecture:** M40 is a local read/export milestone. It adds a `copilot.export` IPC channel that serializes active insights from the existing `copilot_insights` table, writes the file under the same local export directory pattern used by M24 audit export, and returns the saved path plus row counts to the renderer. The sidebar gains visible category/severity filters and export controls; company-scope exports mirror the visible sidebar filters, while all-company exports apply the same filters across every company and are explicitly labeled global.

**Tech Stack:** TypeScript, Vitest, Drizzle/better-sqlite3, Electron IPC/preload, React 19, React Query, Radix Sheet, Playwright.

---

## Context

Phase 5 M33 shipped the Copilot service and persisted proactive insights in `copilot_insights`. Phase 5 M34 surfaced active insights in `CopilotSidebar`. Phase 6 M38 added feedback-category weights and dismissal-pattern suggestions. Phase 6 M39 added telemetry per-kind filtering. M40 rounds out the Phase 6 evidence surface by letting the operator export the local insight set for review outside the app.

Existing facts:

- `apps/desktop/src/main/db/repos/copilot-insights.ts` already supports `listActive({ companyId, category?, severity?, limit? })`.
- `packages/shared-types/src/copilot.ts` already defines `CopilotInsight`, `CopilotInsightListArgs`, category/severity unions, and list/dismiss/ask/configure request shapes.
- `apps/desktop/src/renderer/src/hooks/use-copilot.ts` already accepts optional category/severity filters and folds them into the React Query key.
- `apps/desktop/src/renderer/src/features/copilot/copilot-sidebar.tsx` currently calls `useCopilotInsights(companyId)` with no visible filter state.
- M24 audit export writes under `tmpdir()/team-x-exports`, names files with an ISO timestamp, returns `{ filePath }`, and does not emit a bus event because export is read-only.

## M40 Decision Log

### D24: Export Mirrors Visible Filters

Q4 from the Phase 6 plan is resolved as follows:

- Company-scope export mirrors the current Copilot sidebar category/severity filter state.
- M40 adds visible category and severity filter chips to the sidebar so the filter state is explicit before export.
- All-company export applies the same category/severity filters across all companies, but the scope control labels that it is global because the visible feed remains company-scoped.
- Default state is `category=all`, `severity=all`, `scope=company`, so existing sidebar behavior stays unchanged until the operator changes a control.

Rejected alternative: always export the full active-insights set regardless of visible filters. That is surprising because the user sees a narrowed list but receives a wider file.

### D25: Local Export Contract Mirrors M24 Audit Export

M40 does not introduce a native save dialog. The current M24 audit-export implementation writes to `tmpdir()/team-x-exports` and returns the saved file path; M40 mirrors that contract for parity and avoids changing two export surfaces in one milestone. A future polish task can upgrade both Audit and Copilot exports to a real `dialog.showSaveDialog` flow together.

### D26: Read-Only Export Emits No Bus Event

`copilot.export` reads existing rows and writes a user-requested local file. It does not mutate app state, settings, insights, or events. Architectural invariant #11 applies to IPC mutations; this channel is read-only and emits no bus event.

## Scope

M40 ships:

- `copilot.export` IPC channel.
- Shared export request/response contracts.
- Copilot insight export row projection, JSON serializer, and CSV serializer.
- Main-process file writer using the M24 `team-x-exports` temp directory pattern.
- Preload bridge method `teamx.copilot.export`.
- React Query mutation hook `useCopilotExport`.
- Copilot sidebar category/severity filters, export scope control, CSV/JSON buttons, and success/error status copy.
- Focused unit/source-contract tests plus one Playwright coverage path.
- User-guide update for local insight export.

## Non-Goals

- No network export, telemetry upload, phone-home, automated sharing, email, cloud sync, or provider call.
- No migration, new table, settings key, bus event, or MCP surface.
- No changes to insight generation, analyzer prompts, feedback weights, dismissal suggestions, or TTL behavior.
- No audit-export refactor.
- No PDF, Markdown, XLSX, or clipboard export.
- No exporting dismissed or expired insights.
- No destructive action or confirmation gate.

## Export Shape

### Request

```ts
export const COPILOT_EXPORT_FORMATS = ['csv', 'json'] as const;
export type CopilotExportFormat = (typeof COPILOT_EXPORT_FORMATS)[number];

export const COPILOT_EXPORT_SCOPES = ['company', 'all'] as const;
export type CopilotExportScope = (typeof COPILOT_EXPORT_SCOPES)[number];

export interface CopilotExportRequest {
  format: CopilotExportFormat;
  scope: CopilotExportScope;
  companyId?: string;
  category?: CopilotCategory;
  severity?: CopilotSeverity;
}

export interface CopilotExportResponse {
  filePath: string;
  rowCount: number;
  truncated: boolean;
  format: CopilotExportFormat;
  scope: CopilotExportScope;
}
```

Validation:

- `format` must be `csv` or `json`.
- `scope` must be `company` or `all`.
- `scope='company'` requires non-empty `companyId`.
- `scope='all'` ignores `companyId` if supplied.
- `category` must be a valid `CopilotCategory` when supplied.
- `severity` must be a valid `CopilotSeverity` when supplied.

### JSON

JSON export is an object with metadata and rows:

```json
{
  "version": 1,
  "exportedAt": "2026-04-20T09:30:00.000Z",
  "scope": "company",
  "companyId": "company-1",
  "filters": {
    "category": "cost",
    "severity": "warning"
  },
  "rowCount": 1,
  "truncated": false,
  "insights": [
    {
      "id": "insight-1",
      "companyId": "company-1",
      "category": "cost",
      "severity": "warning",
      "title": "Token spend is rising",
      "detail": "Cost rose 30% today.",
      "actionSuggestion": "Review high-cost runs.",
      "actionIntent": "show_view",
      "actionEntitiesJson": "{\"view\":\"telemetry\"}",
      "createdAt": 1713576600000,
      "expiresAt": 1713663000000
    }
  ]
}
```

### CSV

CSV export header:

```text
id,companyId,category,severity,title,detail,actionSuggestion,actionIntent,actionEntitiesJson,createdAt,expiresAt
```

CSV values must quote fields with commas, quotes, or newlines and escape quotes by doubling them.

### Row Cap

Export caps at 10,000 active insights, matching the audit export's practical cap. `truncated=true` when more rows match than the export includes. The expected Team-X active insight volume is far below this, but the response must expose truncation explicitly.

## Task 1: Shared Export Contracts

**Files:**

- Modify: `packages/shared-types/src/copilot.ts`
- Modify: `packages/shared-types/src/ipc.ts`
- Modify: `apps/desktop/src/preload/api.ts`
- Test: `packages/shared-types/src/copilot-export.test.ts` (new)

**Step 1: Write failing shared-type tests**

Create `packages/shared-types/src/copilot-export.test.ts`:

```ts
import {
  COPILOT_CATEGORIES,
  COPILOT_EXPORT_FORMATS,
  COPILOT_EXPORT_SCOPES,
  COPILOT_SEVERITIES,
  type CopilotExportRequest,
  type CopilotExportResponse,
} from './index.js';

describe('copilot export contracts', () => {
  it('pins export formats and scopes', () => {
    expect(COPILOT_EXPORT_FORMATS).toEqual(['csv', 'json']);
    expect(COPILOT_EXPORT_SCOPES).toEqual(['company', 'all']);
  });

  it('allows export requests to carry scope plus visible sidebar filters', () => {
    const req: CopilotExportRequest = {
      format: 'json',
      scope: 'company',
      companyId: 'company-1',
      category: COPILOT_CATEGORIES[0],
      severity: COPILOT_SEVERITIES[0],
    };
    const res: CopilotExportResponse = {
      filePath: 'C:/tmp/team-x-exports/copilot-insights-export.json',
      rowCount: 1,
      truncated: false,
      format: req.format,
      scope: req.scope,
    };

    expect(req.scope).toBe('company');
    expect(res.rowCount).toBe(1);
  });
});
```

Run:

```bash
pnpm -F @team-x/shared-types exec vitest run src/copilot-export.test.ts
```

Expected: FAIL because the export constants and types do not exist.

**Step 2: Add contracts**

In `packages/shared-types/src/copilot.ts`, add the constants and request/response interfaces from "Export Shape".

In `packages/shared-types/src/ipc.ts`:

- Import `CopilotExportRequest` and `CopilotExportResponse`.
- Add low-level `IpcContract['copilot.export']`.
- Add `TeamXApi.copilot.export(req: CopilotExportRequest): Promise<CopilotExportResponse>`.

In `apps/desktop/src/preload/api.ts`:

- Import `CopilotExportRequest` and `CopilotExportResponse`.
- Add `copilotExport: 'copilot.export'` to `CHANNELS`.
- Add `copilot.export(req)` to satisfy the widened `TeamXApi` object.

Do not register the main-process channel or implement the handler in T1. That remains T3.

**Step 3: Run focused verification**

```bash
pnpm -F @team-x/shared-types exec vitest run src/copilot-export.test.ts
pnpm typecheck
pnpm lint
pnpm audit:claims -- --strict
```

**Step 4: Commit**

```bash
git add packages/shared-types/src/copilot.ts packages/shared-types/src/ipc.ts packages/shared-types/src/copilot-export.test.ts apps/desktop/src/preload/api.ts .loki/queue/current-task.json .loki/queue/pending.json .loki/state/orchestrator.json docs/plans/2026-04-25-team-x-phase-6-m40-insight-export.md
git commit -m "feat(m40): add copilot export contracts"
git push
```

## Task 2: Copilot Insight Export Read Model

**Files:**

- Modify: `apps/desktop/src/main/db/repos/copilot-insights.ts`
- Test: `apps/desktop/src/main/db/repos/copilot-insights-export.test.ts` (new)

**Step 1: Write failing repo tests**

Create tests that seed:

- Two active insights in `company-1`.
- One active insight in `company-2`.
- One dismissed insight.
- One expired insight.

Assertions:

- Company export returns only active rows for one company.
- All-company export returns active rows across companies.
- Category/severity filters apply to both scopes.
- JSON serializer includes metadata, filters, rowCount, truncated, and insights.
- CSV serializer escapes commas, quotes, and newlines.
- Over-cap matching rows returns `truncated=true`.

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/main/db/repos/copilot-insights-export.test.ts
```

Expected: FAIL because export helpers do not exist.

**Step 2: Add repo helpers**

Add:

```ts
export interface CopilotExportFilter {
  scope: 'company' | 'all';
  companyId?: string;
  category?: CopilotCategory;
  severity?: CopilotSeverity;
  limit?: number;
  now?: number;
}

export interface CopilotExportResult {
  rows: CopilotInsightRow[];
  truncated: boolean;
}
```

Add `listActiveForExport(filter: CopilotExportFilter): CopilotExportResult`.

Rules:

- Active means `dismissed_at IS NULL` and `expires_at > now`.
- `scope='company'` adds `company_id = companyId`.
- `scope='all'` omits company condition.
- Category/severity conditions are optional.
- Query `limit + 1` rows to compute truncation, then return at most `limit`.
- Default limit is `10_000`.

Add pure serializers:

```ts
export function serializeCopilotInsightsJson(args: {
  rows: CopilotInsightRow[];
  filter: CopilotExportFilter;
  exportedAtIso: string;
  truncated: boolean;
}): string;

export function serializeCopilotInsightsCsv(rows: CopilotInsightRow[]): string;
```

**Step 3: Run focused verification**

```bash
pnpm -F @team-x/desktop exec vitest run src/main/db/repos/copilot-insights-export.test.ts
pnpm typecheck
pnpm lint
pnpm audit:claims -- --strict
```

**Step 4: Commit**

```bash
git add apps/desktop/src/main/db/repos/copilot-insights.ts apps/desktop/src/main/db/repos/copilot-insights-export.test.ts .loki/queue/current-task.json .loki/queue/pending.json .loki/state/orchestrator.json
git commit -m "feat(m40): add copilot insight export read model"
git push
```

## Task 3: IPC, Register, Handler, and Preload

**Files:**

- Modify: `apps/desktop/src/main/ipc/register.ts`
- Modify: `apps/desktop/src/main/ipc/handlers.ts`
- Test: `apps/desktop/src/main/ipc/copilot-export-handlers.test.ts` (new)

**Step 1: Write failing handler tests**

Test:

- Invalid format rejects before repo access.
- Invalid scope rejects before repo access.
- Company scope without `companyId` rejects.
- Invalid category/severity rejects.
- Valid JSON request calls `listActiveForExport`, writes a `.json` file under `team-x-exports`, and returns rowCount/truncated.
- Valid CSV request writes a `.csv` file.
- Export emits no bus event.

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/main/ipc/copilot-export-handlers.test.ts
```

Expected: FAIL because `copilot.export` is not registered or handled.

**Step 2: Register main-process channel**

In `apps/desktop/src/main/ipc/register.ts`:

- Add `'copilot.export'` to the request channel list.
- Add it to the typed registration map.

**Step 3: Add handler**

In `apps/desktop/src/main/ipc/handlers.ts`:

- Widen the copilot insights repo dependency with `listActiveForExport`.
- Add `copilotExport(req)` to `IpcHandlers`.
- Validate request per "Export Shape".
- Build content with the repo serializers.
- Write to `tmpdir()/team-x-exports/copilot-insights-export-${timestamp}.${format}`.
- Return `{ filePath, rowCount, truncated, format, scope }`.
- Do not emit a bus event.

**Step 4: Run focused verification**

```bash
pnpm -F @team-x/desktop exec vitest run src/main/ipc/copilot-export-handlers.test.ts
pnpm typecheck
pnpm lint
pnpm audit:claims -- --strict
```

**Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc/register.ts apps/desktop/src/main/ipc/handlers.ts apps/desktop/src/main/ipc/copilot-export-handlers.test.ts .loki/queue/current-task.json .loki/queue/pending.json .loki/state/orchestrator.json
git commit -m "feat(m40): wire copilot export ipc"
git push
```

## Task 4: Renderer Export Hook

**Files:**

- Modify: `apps/desktop/src/renderer/src/hooks/use-copilot.ts`
- Test: `apps/desktop/src/renderer/src/hooks/use-copilot-export.test.tsx` (new)

**Step 1: Write failing hook source-contract tests**

Assert:

- `useCopilotExport` is exported.
- It calls `ipc.copilot.export`.
- It accepts `CopilotExportRequest` and returns `CopilotExportResponse`.
- It does not invalidate insight queries on success because export is read-only.

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/renderer/src/hooks/use-copilot-export.test.tsx
```

Expected: FAIL because the hook does not exist.

**Step 2: Add hook**

Add:

```ts
export function useCopilotExport() {
  return useMutation<CopilotExportResponse, Error, CopilotExportRequest>({
    mutationFn: (req) => ipc.copilot.export(req),
  });
}
```

**Step 3: Run focused verification**

```bash
pnpm -F @team-x/desktop exec vitest run src/renderer/src/hooks/use-copilot-export.test.tsx
pnpm typecheck
pnpm lint
pnpm audit:claims -- --strict
```

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/hooks/use-copilot.ts apps/desktop/src/renderer/src/hooks/use-copilot-export.test.tsx .loki/queue/current-task.json .loki/queue/pending.json .loki/state/orchestrator.json
git commit -m "feat(m40): add copilot export hook"
git push
```

## Task 5: Sidebar Filters and Export Controls

**Files:**

- Modify: `apps/desktop/src/renderer/src/features/copilot/copilot-sidebar.tsx`
- Test: `apps/desktop/src/renderer/src/features/copilot/copilot-sidebar-export.test.tsx` (new)

**Step 1: Write failing sidebar source-contract tests**

Assert:

- Category filter buttons render with `data-copilot-category-filter`.
- Severity filter buttons render with `data-copilot-severity-filter`.
- Export scope control renders `company` and `all`.
- CSV and JSON buttons render with `data-copilot-export-format`.
- Export request includes current category/severity/scope.
- Company scope includes `companyId`; all scope omits it.
- Success status includes row count and basename from returned `filePath`.

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/renderer/src/features/copilot/copilot-sidebar-export.test.tsx
```

Expected: FAIL because the sidebar has no export/filter UI.

**Step 2: Add visible filter state**

In `CopilotSidebar`:

- Add category state: `'all' | CopilotCategory`, default `'all'`.
- Add severity state: `'all' | CopilotSeverity`, default `'all'`.
- Pass current filters to `useCopilotInsights(companyId, filters)`.
- Render filter chips above the feed.
- Use `aria-pressed` and stable selectors.

**Step 3: Add export controls**

Add export scope state:

- `scope='company'` by default.
- Scope toggle values: `company`, `all`.

Add buttons:

- CSV button calls `useCopilotExport().mutate({ format: 'csv', scope, companyId, category, severity })`.
- JSON button calls the same with `format: 'json'`.
- If scope is `all`, omit `companyId`.
- Disable while pending.
- Render success copy: `Exported ${rowCount} insight(s) to ${basename}`.
- Render truncation copy when `truncated=true`.
- Render error copy without dropping current filter state.

**Step 4: Run focused verification**

```bash
pnpm -F @team-x/desktop exec vitest run src/renderer/src/features/copilot/copilot-sidebar-export.test.tsx
pnpm typecheck
pnpm lint
pnpm audit:claims -- --strict
```

**Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/features/copilot/copilot-sidebar.tsx apps/desktop/src/renderer/src/features/copilot/copilot-sidebar-export.test.tsx .loki/queue/current-task.json .loki/queue/pending.json .loki/state/orchestrator.json
git commit -m "feat(m40): add copilot sidebar export controls"
git push
```

## Task 6: Insight Export E2E

**Files:**

- Create: `apps/desktop/e2e/copilot-insight-export.spec.ts`

**Step 1: Write failing Playwright spec**

Scenario:

1. Launch Electron with `NODE_ENV=test`.
2. Resolve seeded company id.
3. Configure copilot settings and force a test analyzer tick so active insights exist.
4. Open the Copilot sidebar.
5. Select a category filter that has at least one insight.
6. Click JSON export.
7. Assert success status appears with row count.
8. Switch scope to `all`.
9. Click CSV export.
10. Assert success status appears and the sidebar remains open.

Run:

```bash
pnpm -F @team-x/desktop build
pnpm -F @team-x/desktop exec playwright test e2e/copilot-insight-export.spec.ts
```

Expected initial result: FAIL until the sidebar selectors and export IPC are implemented.

**Step 2: Stabilize selectors only if needed**

If the E2E exposes a missing stable selector, add the smallest selector:

- `data-copilot-export-status`
- `data-copilot-export-scope`
- `data-copilot-export-format`
- `data-copilot-category-filter`
- `data-copilot-severity-filter`

Do not change product behavior in the E2E task unless the missing selector is the only gap.

**Step 3: Run focused verification**

```bash
pnpm -F @team-x/desktop build
pnpm -F @team-x/desktop exec playwright test e2e/copilot-insight-export.spec.ts
pnpm typecheck
pnpm lint
pnpm audit:claims -- --strict
```

**Step 4: Commit**

```bash
git add apps/desktop/e2e/copilot-insight-export.spec.ts apps/desktop/src/renderer/src/features/copilot/copilot-sidebar.tsx .loki/queue/current-task.json .loki/queue/pending.json .loki/state/orchestrator.json
git commit -m "test(m40): cover copilot insight export e2e"
git push
```

## Task 7: User Guide and Status Docs

**Files:**

- Modify: `docs/user-guide/copilot-ui.md`
- Modify: `README.md` if feature counters or user-facing feature list needs update
- Modify: `CLAUDE.md` only if its Phase 6 shipped-status block is updated in this repository state

**Step 1: Add user-facing export instructions**

In `docs/user-guide/copilot-ui.md`, add a short section:

- Open Copilot sidebar.
- Optional: filter by category/severity.
- Choose company or all-company export.
- Click CSV or JSON.
- Export writes locally and the app displays the saved filename.

Do not claim cloud sync, sharing, telemetry digest, or native save-dialog behavior.

**Step 2: Run docs-safe verification**

```bash
pnpm audit:claims -- --strict
pnpm lint
```

**Step 3: Commit**

```bash
git add docs/user-guide/copilot-ui.md README.md CLAUDE.md .loki/queue/current-task.json .loki/queue/pending.json .loki/state/orchestrator.json
git commit -m "docs(m40): document local insight export"
git push
```

Only add `README.md` or `CLAUDE.md` if they actually changed.

## Task 8: Verification Gate

**Files:**

- Modify: `docs/plans/2026-04-25-team-x-phase-6-m40-insight-export.md`
- Modify: `.loki/queue/current-task.json`
- Modify: `.loki/queue/pending.json`
- Modify: `.loki/state/orchestrator.json`

**Step 1: Run touched-file format gate**

```bash
pnpm exec biome check --write packages/shared-types/src/copilot.ts packages/shared-types/src/ipc.ts packages/shared-types/src/copilot-export.test.ts apps/desktop/src/main/db/repos/copilot-insights.ts apps/desktop/src/main/db/repos/copilot-insights-export.test.ts apps/desktop/src/main/ipc/register.ts apps/desktop/src/main/ipc/handlers.ts apps/desktop/src/main/ipc/copilot-export-handlers.test.ts apps/desktop/src/preload/api.ts apps/desktop/src/renderer/src/hooks/use-copilot.ts apps/desktop/src/renderer/src/hooks/use-copilot-export.test.tsx apps/desktop/src/renderer/src/features/copilot/copilot-sidebar.tsx apps/desktop/src/renderer/src/features/copilot/copilot-sidebar-export.test.tsx apps/desktop/e2e/copilot-insight-export.spec.ts
```

Expected: no remaining format errors.

**Step 2: Run focused unit suites**

```bash
pnpm -F @team-x/shared-types exec vitest run src/copilot-export.test.ts
pnpm -F @team-x/desktop exec vitest run src/main/db/repos/copilot-insights-export.test.ts src/main/ipc/copilot-export-handlers.test.ts src/renderer/src/hooks/use-copilot-export.test.tsx src/renderer/src/features/copilot/copilot-sidebar-export.test.tsx
```

**Step 3: Run workspace gates**

```bash
pnpm typecheck
pnpm lint
pnpm audit:claims -- --strict
```

**Step 4: Run build and focused E2E**

```bash
pnpm -F @team-x/desktop build
pnpm -F @team-x/desktop exec playwright test e2e/copilot-insight-export.spec.ts
```

**Step 5: Ledger completion**

- Add a verification ledger section to this plan doc.
- Close M40 in Loki.
- Advance head-of-queue to Phase 6 M41 T0.
- Commit and push:

```bash
git add docs/plans/2026-04-25-team-x-phase-6-m40-insight-export.md .loki/queue/current-task.json .loki/queue/pending.json .loki/state/orchestrator.json
git commit -m "chore(loki): ledger phase 6 m40 insight export"
git push
```

## Acceptance Checklist

- `copilot.export` supports JSON and CSV.
- Company-scope export requires `companyId` and mirrors visible category/severity filters.
- All-company export applies the same category/severity filters globally and is labeled as global.
- Exported rows are active only; dismissed and expired insights are excluded.
- JSON export includes metadata and row count.
- CSV export escapes commas, quotes, and newlines.
- Main process writes only to local filesystem under `team-x-exports`.
- Export emits no bus event.
- Sidebar renders visible filter, scope, CSV, JSON, success, truncation, and error states.
- Focused unit/source-contract tests, typecheck, lint, strict claims, build, and focused E2E pass.

## Verification Ledger

**Completed:** 2026-04-20

**Commit sequence:**

| Task | Commit | Summary |
|---|---|---|
| T0 | `c0366d8` | Authored this M40 plan doc and locked local-only export scope. |
| T1 | `ba84318` | Added shared export contracts and typed preload bridge. |
| T2 | `d4c1d57` | Added active-only export projection plus JSON/CSV serializers. |
| T3 | `6ba960b` | Wired main-process `copilot.export` IPC, validation, registration, and local file write. |
| T4 | `09ef3cd` | Added renderer `useCopilotExport` mutation hook. |
| T5 | `2866b66` | Added sidebar category/severity filters, scope controls, CSV/JSON buttons, and status copy. |
| T6 | `b50b720` | Added focused Playwright coverage for filtered JSON and all-scope CSV export. |
| T7 | `d330934` | Documented local insight export and updated README E2E counters. |
| T8 | `this-ledger-commit` | Ran final verification gates and closed M40. |

**Final verification:**

| Gate | Result |
|---|---|
| Touched-file Biome check | `pnpm exec biome check --write ...` — 14 files checked, no fixes applied. |
| Shared-types focused tests | `pnpm -F @team-x/shared-types exec vitest run src/copilot-export.test.ts` — 1 file / 2 tests passed. |
| Desktop focused tests | `pnpm -F @team-x/desktop exec vitest run src/main/db/repos/copilot-insights-export.test.ts src/main/ipc/copilot-export-handlers.test.ts src/renderer/src/hooks/use-copilot-export.test.tsx src/renderer/src/features/copilot/copilot-sidebar-export.test.tsx` — 4 files / 19 tests passed. |
| Typecheck | `pnpm typecheck` — clean across 6 workspace packages. |
| Lint | `pnpm lint` — 0 errors / 21 known no-non-null-assertion warnings. |
| Strict claim audit | `pnpm audit:claims -- --strict` — 95 verified / 0 allowlisted / 0 UNALLOWED out of 95. |
| Production build | `pnpm -F @team-x/desktop build` — clean. |
| Focused E2E | `pnpm -F @team-x/desktop exec playwright test e2e/copilot-insight-export.spec.ts` — 1 spec / 1 test passed. |

**Exit state:** M40 Insight Export is complete. `copilot.export` is local-only, supports JSON/CSV, excludes dismissed and expired insights, applies company/all scope plus category/severity filters, writes under `team-x-exports`, emits no bus event, and is covered by focused shared-types, repo, IPC, renderer, sidebar, and Playwright tests.

## Follow-Up Boundary

M40 does not upgrade Audit export to a native save dialog and does not introduce cloud sharing. If native destination picking becomes important, handle it as a later cross-export polish that updates both `audit.export` and `copilot.export` together.
