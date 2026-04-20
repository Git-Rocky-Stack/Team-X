# Team-X Phase 6 M39 Telemetry Per-Kind Filter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Surface the existing `runs.kind` discriminator in the Telemetry tab so operators can filter aggregate usage by All / Work / Agentic / Copilot.

**Architecture:** M39 is read-path-only. The existing `runs.kind` column from migration 0012 remains the single source of truth; shared IPC request types gain an optional kind filter, the runs repo applies that filter to all four aggregate queries, and the renderer owns an `all` chip state that maps to `kind: undefined` on the wire. No migrations, new tables, provider changes, settings keys, or write-side behavior ship in M39.

**Tech Stack:** TypeScript, Vitest, Drizzle/better-sqlite3, Electron IPC/preload, React 19, React Query, Recharts, Playwright.

---

## Context

Phase 3 M17 shipped four telemetry read paths: `telemetry.companyStats`, `telemetry.dailyUsage`, `telemetry.employeeStats`, and `telemetry.costBreakdown`. Phase 5 M33 migration 0012 added `runs.kind` with default `work`; copilot analyzer ticks write `kind='copilot'`; agentic loop work can write `kind='agentic'`; older and ordinary employee chat runs stay in `work`.

The column is present and populated, but the Telemetry tab still shows only aggregate totals. M39 closes that gap without changing persistence.

Important existing facts:

- `apps/desktop/src/main/db/repos/runs.ts` already stores `kind?: 'work' | 'agentic' | 'copilot'` on `start()`.
- All four aggregate methods filter by `employees.company_id` and completed status today.
- `packages/shared-types/src/ipc.ts` already models telemetry requests and responses, but the company/employee convenience methods in `TeamXApi.telemetry` currently accept `companyId: string`.
- `apps/desktop/src/renderer/src/features/telemetry/telemetry-view.tsx` owns the subview tabs, while each subview owns its own data hook call.
- There are no renderer telemetry tests today; M39 should add focused component/source-contract tests instead of relying only on E2E.

## Design Decision

Recommended approach: add an optional `kind?: TelemetryRunKind` field to every telemetry request and keep `all` renderer-only.

Alternatives considered:

- **Separate IPC channels per kind:** rejected because it multiplies the API surface and duplicates the same aggregate SQL.
- **Persist a telemetry filter setting:** rejected because Phase 6 D21 says read-path-only and there is no user value in remembering this tab-local view for v1.2.0.
- **Send `kind: 'all'` over IPC:** rejected because SQL should only receive real persisted `runs.kind` values; omitting `kind` is the cleaner aggregate contract.

## Decisions

- **D21 read-path-only holds.** No migration; no settings key; no event bus changes.
- **Wire type:** `TelemetryRunKind = 'work' | 'agentic' | 'copilot'`. Renderer-only `TelemetryKindFilter = 'all' | TelemetryRunKind`.
- **All means omitted.** The renderer maps `all` to `kind: undefined`; main-process handlers validate only real persisted kinds.
- **Every subview respects the filter.** Company cards, daily charts, employee table, and cost breakdown all re-query on chip change.
- **Default behavior preserved.** Initial state is `all`, so existing aggregate totals remain unchanged until the operator changes the chip.
- **No per-kind write changes.** M39 may add tests proving existing `runs.start({ kind })` drives filters, but it does not alter run writers.

## Non-Goals

- No migration or backfill.
- No telemetry digest, recommendations, budget controls, or settings mutation.
- No phone-home telemetry.
- No new provider/router/MCP surface.
- No changes to M38 copilot category weights.
- No changes to M37 role-fit scoring.
- No new Telemetry subview beyond filtering the existing Company / Employees / Cost views.

## Task 1: Shared Types For Telemetry Kind Filter

**Files:**
- Modify: `packages/shared-types/src/ipc.ts`
- Test: `packages/shared-types/src/telemetry-kind-filter.test.ts` (new)

**Step 1: Write failing shared-type tests**

Create `packages/shared-types/src/telemetry-kind-filter.test.ts`:

```ts
import {
  TELEMETRY_KIND_FILTERS,
  TELEMETRY_RUN_KINDS,
  type TelemetryCostBreakdownRequest,
  type TelemetryDailyUsageRequest,
} from './ipc.js';

describe('telemetry kind filter contracts', () => {
  it('pins persisted run kinds separately from the renderer all filter', () => {
    expect(TELEMETRY_RUN_KINDS).toEqual(['work', 'agentic', 'copilot']);
    expect(TELEMETRY_KIND_FILTERS).toEqual(['all', 'work', 'agentic', 'copilot']);
  });

  it('allows aggregate requests to carry an optional persisted run kind', () => {
    const daily: TelemetryDailyUsageRequest = {
      companyId: 'company-1',
      fromMs: 0,
      toMs: 1,
      kind: 'agentic',
    };
    const cost: TelemetryCostBreakdownRequest = {
      companyId: 'company-1',
      kind: 'copilot',
    };

    expect(daily.kind).toBe('agentic');
    expect(cost.kind).toBe('copilot');
  });
});
```

Run:

```bash
pnpm -F @team-x/shared-types exec vitest run src/telemetry-kind-filter.test.ts
```

Expected: FAIL because the constants/types and request fields do not exist.

**Step 2: Add contracts**

In `packages/shared-types/src/ipc.ts`, near telemetry shapes, add:

```ts
export const TELEMETRY_RUN_KINDS = ['work', 'agentic', 'copilot'] as const;
export type TelemetryRunKind = (typeof TELEMETRY_RUN_KINDS)[number];

export const TELEMETRY_KIND_FILTERS = ['all', ...TELEMETRY_RUN_KINDS] as const;
export type TelemetryKindFilter = (typeof TELEMETRY_KIND_FILTERS)[number];
```

Add `kind?: TelemetryRunKind` to:

- `TelemetryCompanyStatsRequest`
- `TelemetryDailyUsageRequest`
- `TelemetryEmployeeStatsRequest`
- `TelemetryCostBreakdownRequest`

Update `TeamXApi.telemetry` to use request objects consistently:

```ts
companyStats(req: TelemetryCompanyStatsRequest): Promise<TelemetryCompanyStatsResponse>;
employeeStats(req: TelemetryEmployeeStatsRequest): Promise<TelemetryEmployeeStatsRow[]>;
```

`dailyUsage` and `costBreakdown` already use request objects.

**Step 3: Verify green**

Run:

```bash
pnpm -F @team-x/shared-types exec vitest run src/telemetry-kind-filter.test.ts
```

Expected: PASS.

**Commit:**

```bash
git add packages/shared-types/src/ipc.ts packages/shared-types/src/telemetry-kind-filter.test.ts
git commit -m "feat(m39): add telemetry kind filter contracts"
```

## Task 2: Runs Repo Per-Kind Aggregate Filters

**Files:**
- Modify: `apps/desktop/src/main/db/repos/runs.ts`
- Test: `apps/desktop/src/main/db/repos/runs-telemetry.test.ts`

**Step 1: Write failing repo tests**

Extend `seedRun()` in `runs-telemetry.test.ts` with:

```ts
kind?: 'work' | 'agentic' | 'copilot';
```

and pass it through to `runs.start({ ..., kind: opts.kind })`.

Add focused tests:

```ts
it('filters companyStats by run kind when provided', () => {
  const cid = seedCompany('Kind Corp');
  const emp = seedEmployee(cid, 'swe', 'Alice');
  seedRun({ employeeId: emp, provider: 'ollama', model: 'llama3.1:8b', promptTokens: 10, completionTokens: 5, latencyMs: 100, costUsd: '0', kind: 'work' });
  seedRun({ employeeId: emp, provider: 'ollama', model: 'llama3.1:8b', promptTokens: 100, completionTokens: 50, latencyMs: 200, costUsd: '0', kind: 'agentic' });
  seedRun({ employeeId: emp, provider: 'ollama', model: 'llama3.1:8b', promptTokens: 1000, completionTokens: 500, latencyMs: 300, costUsd: '0', kind: 'copilot' });

  expect(runs.companyStats(cid).totalRuns).toBe(3);
  expect(runs.companyStats(cid, 'agentic').totalRuns).toBe(1);
  expect(runs.companyStats(cid, 'agentic').totalTokens).toBe(150);
});
```

Add equivalent assertions for:

- `dailyUsage(companyId, fromMs, toMs, 'copilot')`
- `employeeStats(companyId, 'work')`
- `costBreakdown(companyId, fromMs, toMs, 'agentic')`

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/main/db/repos/runs-telemetry.test.ts
```

Expected: FAIL because aggregate methods do not accept/apply the filter yet.

**Step 2: Implement filter helper**

In `runs.ts`, import the type:

```ts
import type { TelemetryRunKind } from '@team-x/shared-types';
```

Add:

```ts
function runKindCondition(kind?: TelemetryRunKind) {
  return kind === undefined ? undefined : eq(runs.kind, kind);
}

function compactConditions<T>(conditions: Array<T | undefined>): T[] {
  return conditions.filter((condition): condition is T => condition !== undefined);
}
```

Update signatures:

```ts
companyStats(companyId: string, kind?: TelemetryRunKind): CompanyStats
dailyUsage(companyId: string, fromMs: number, toMs: number, kind?: TelemetryRunKind): DailyUsageRow[]
employeeStats(companyId: string, kind?: TelemetryRunKind): EmployeeStatsRow[]
costBreakdown(companyId: string, fromMs?: number, toMs?: number, kind?: TelemetryRunKind): CostBreakdownRow[]
```

Apply `runKindCondition(kind)` inside every existing `where(and(...))` condition list.

**Step 3: Verify green**

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/main/db/repos/runs-telemetry.test.ts
```

Expected: PASS.

**Commit:**

```bash
git add apps/desktop/src/main/db/repos/runs.ts apps/desktop/src/main/db/repos/runs-telemetry.test.ts
git commit -m "feat(m39): filter telemetry aggregates by run kind"
```

## Task 3: IPC And Preload Kind Propagation

**Files:**
- Modify: `apps/desktop/src/main/ipc/handlers.ts`
- Modify: `apps/desktop/src/preload/api.ts`
- Test: `apps/desktop/src/main/ipc/telemetry-handlers.test.ts` (new)

**Step 1: Write failing IPC tests**

Create `apps/desktop/src/main/ipc/telemetry-handlers.test.ts` with a narrow fake `runsRepo` that records the kind passed to each aggregate method.

Cover:

- `telemetry.companyStats({ companyId, kind: 'agentic' })` passes `agentic`.
- `telemetry.dailyUsage({ companyId, fromMs, toMs, kind: 'copilot' })` passes `copilot`.
- `telemetry.employeeStats({ companyId, kind: 'work' })` passes `work`.
- `telemetry.costBreakdown({ companyId, kind: 'agentic' })` passes `agentic`.
- invalid runtime kind throws before repo access.

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/main/ipc/telemetry-handlers.test.ts
```

Expected: FAIL because handlers ignore `kind` and the test file does not exist.

**Step 2: Implement validation and handler propagation**

In `handlers.ts`, import:

```ts
import { TELEMETRY_RUN_KINDS, type TelemetryRunKind } from '@team-x/shared-types';
```

Add helper:

```ts
function assertTelemetryRunKind(value: unknown, channel: string): TelemetryRunKind | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string' && TELEMETRY_RUN_KINDS.includes(value as TelemetryRunKind)) {
    return value as TelemetryRunKind;
  }
  throw new Error(`[ipc] ${channel}: kind must be work, agentic, or copilot`);
}
```

Update the four telemetry handlers to compute `const kind = assertTelemetryRunKind(req.kind, '<channel>')` and pass it to the repo method.

**Step 3: Update preload bridge**

In `apps/desktop/src/preload/api.ts`, change:

```ts
companyStats: (req: TelemetryCompanyStatsRequest) =>
  ipc.invoke(CHANNELS.telemetryCompanyStats, req) as Promise<TelemetryCompanyStatsResponse>,
employeeStats: (req: TelemetryEmployeeStatsRequest) =>
  ipc.invoke(CHANNELS.telemetryEmployeeStats, req) as Promise<TelemetryEmployeeStatsRow[]>,
```

`dailyUsage` and `costBreakdown` keep their existing request-object shape and now carry `kind` through automatically.

**Step 4: Verify green**

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/main/ipc/telemetry-handlers.test.ts
pnpm typecheck
```

Expected: PASS; typecheck may fail until renderer hooks are updated in Task 4 if this task changes `TeamXApi` first. If so, record that as the expected TDD red and proceed directly to Task 4 before committing.

**Commit:**

```bash
git add apps/desktop/src/main/ipc/handlers.ts apps/desktop/src/preload/api.ts apps/desktop/src/main/ipc/telemetry-handlers.test.ts
git commit -m "feat(m39): pass telemetry kind through IPC"
```

## Task 4: Renderer Hooks And Filter Helpers

**Files:**
- Modify: `apps/desktop/src/renderer/src/hooks/use-telemetry.ts`
- Test: `apps/desktop/src/renderer/src/hooks/use-telemetry.test.tsx` (new or extend if present)

**Step 1: Write failing hook/source-contract tests**

Add tests that pin:

- `useCompanyStats` query key includes `kind`.
- `useDailyUsage` query key includes `kind`.
- `useEmployeeStats` query key includes `kind`.
- `useCostBreakdown` query key includes `kind`.
- `all` is renderer-only and maps to omitted `kind`.

If the existing test harness makes hook execution heavy, use the local source-string contract pattern already used elsewhere in the repo: read `use-telemetry.ts` and assert the query keys include `req?.kind` or `kind`.

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/renderer/src/hooks/use-telemetry.test.tsx
```

Expected: FAIL because hooks do not include `kind` yet.

**Step 2: Update hook signatures**

Change hooks to request-object inputs:

```ts
export function useCompanyStats(req: TelemetryCompanyStatsRequest | null) { ... }
export function useDailyUsage(req: TelemetryDailyUsageRequest | null) { ... }
export function useEmployeeStats(req: TelemetryEmployeeStatsRequest | null) { ... }
export function useCostBreakdown(req: TelemetryCostBreakdownRequest | null) { ... }
```

Every query key must include `req?.kind ?? 'all'`.

Add helper:

```ts
export function telemetryRequestKind(filter: TelemetryKindFilter): TelemetryRunKind | undefined {
  return filter === 'all' ? undefined : filter;
}
```

**Step 3: Verify green**

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/renderer/src/hooks/use-telemetry.test.tsx
```

Expected: PASS.

**Commit:**

```bash
git add apps/desktop/src/renderer/src/hooks/use-telemetry.ts apps/desktop/src/renderer/src/hooks/use-telemetry.test.tsx
git commit -m "feat(m39): include telemetry kind in renderer queries"
```

## Task 5: Telemetry Filter Chips

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/telemetry/telemetry-view.tsx`
- Test: `apps/desktop/src/renderer/src/features/telemetry/telemetry-view.test.tsx` (new)

**Step 1: Write failing component tests**

Add tests for a small exported component, `TelemetryKindFilterChips`, or test the full view if the store harness is already available:

- Renders four buttons: All, Work, Agentic, Copilot.
- Default active filter is All.
- Clicking Copilot calls `onChange('copilot')`.
- Each button has `data-telemetry-kind-filter="<filter>"`.

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/renderer/src/features/telemetry/telemetry-view.test.tsx
```

Expected: FAIL because the chip component/selectors do not exist.

**Step 2: Add chips and local state**

In `telemetry-view.tsx`:

```ts
const KIND_FILTER_LABELS: Record<TelemetryKindFilter, string> = {
  all: 'All',
  work: 'Work',
  agentic: 'Agentic',
  copilot: 'Copilot',
};
```

Add `useState<TelemetryKindFilter>('all')` in `TelemetryView`, render the chip row below subtabs, and pass `kindFilter` to every subview.

Buttons:

```tsx
<button
  type="button"
  data-telemetry-kind-filter={filter}
  aria-pressed={filter === active}
  onClick={() => onChange(filter)}
>
  {KIND_FILTER_LABELS[filter]}
</button>
```

Keep styling aligned with existing subtab buttons: border radius <= 8px, no new palette, no nested section card.

**Step 3: Verify green**

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/renderer/src/features/telemetry/telemetry-view.test.tsx
```

Expected: PASS.

**Commit:**

```bash
git add apps/desktop/src/renderer/src/features/telemetry/telemetry-view.tsx apps/desktop/src/renderer/src/features/telemetry/telemetry-view.test.tsx
git commit -m "feat(m39): add telemetry kind filter chips"
```

## Task 6: Wire Subviews To Filtered Requests

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/telemetry/company-telemetry.tsx`
- Modify: `apps/desktop/src/renderer/src/features/telemetry/employee-telemetry.tsx`
- Modify: `apps/desktop/src/renderer/src/features/telemetry/cost-breakdown.tsx`
- Test: `apps/desktop/src/renderer/src/features/telemetry/telemetry-subviews.test.tsx` (new)

**Step 1: Write failing source-contract tests**

Add tests that read the three subview files and assert:

- `CompanyTelemetry` accepts `kindFilter`.
- `CompanyTelemetry` passes `kind` into both `useCompanyStats` and `useDailyUsage`.
- `EmployeeTelemetry` passes `kind` into `useEmployeeStats`.
- `CostBreakdown` passes `kind` into `useCostBreakdown` and preserves date range filters.

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/renderer/src/features/telemetry/telemetry-subviews.test.tsx
```

Expected: FAIL until subviews propagate the filter.

**Step 2: Update props and requests**

For each subview:

```ts
import type { TelemetryKindFilter } from '@team-x/shared-types';
import { telemetryRequestKind } from '@/hooks/use-telemetry.js';

interface Props {
  companyId: string;
  kindFilter: TelemetryKindFilter;
}
```

Use:

```ts
const kind = telemetryRequestKind(kindFilter);
```

Pass request objects:

```ts
useCompanyStats({ companyId, kind });
useDailyUsage({ companyId, fromMs: thirtyDaysAgo, toMs: now, kind });
useEmployeeStats({ companyId, kind });
useCostBreakdown({ companyId, fromMs, toMs, kind });
```

When `kind` is `undefined`, the request remains an all-kinds aggregate.

**Step 3: Verify green**

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/renderer/src/features/telemetry/telemetry-subviews.test.tsx
pnpm typecheck
```

Expected: PASS.

**Commit:**

```bash
git add apps/desktop/src/renderer/src/features/telemetry/company-telemetry.tsx apps/desktop/src/renderer/src/features/telemetry/employee-telemetry.tsx apps/desktop/src/renderer/src/features/telemetry/cost-breakdown.tsx apps/desktop/src/renderer/src/features/telemetry/telemetry-subviews.test.tsx
git commit -m "feat(m39): apply telemetry kind filter to subviews"
```

## Task 7: Telemetry Kind Filter E2E

**Files:**
- Create: `apps/desktop/e2e/telemetry-kind-filter.spec.ts`

**Step 1: Write failing Playwright spec**

Create an E2E spec that:

1. Launches Electron with a temp user data dir.
2. Resolves the seeded company id.
3. Generates at least one `work` run through a normal chat path.
4. Generates at least one `copilot` run through `teamx.copilot.configure({ companyId })`.
5. Opens Telemetry.
6. Confirms All total runs is at least the sum of visible filtered buckets.
7. Clicks `[data-telemetry-kind-filter="copilot"]` and confirms the Company total reflects only copilot runs.
8. Clicks `[data-telemetry-kind-filter="work"]` and confirms the Company total reflects only work runs.

Use deterministic UI anchors from the implementation, for example `data-telemetry-stat="total-runs"` if Task 5/6 adds it to the Total Runs stat card.

Run:

```bash
pnpm -F @team-x/desktop exec playwright test e2e/telemetry-kind-filter.spec.ts
```

Expected: FAIL until UI selectors and filter propagation exist.

**Step 2: Add stable stat selector if needed**

If the E2E cannot reliably read the Total Runs card, add a stable selector to the existing stat card:

```tsx
<StatCard label="Total Runs" value={...} dataTelemetryStat="total-runs" />
```

Use `data-telemetry-stat="total-runs"` on the card root.

**Step 3: Verify green**

Run:

```bash
pnpm -F @team-x/desktop exec playwright test e2e/telemetry-kind-filter.spec.ts
```

Expected: PASS.

**Commit:**

```bash
git add apps/desktop/e2e/telemetry-kind-filter.spec.ts apps/desktop/src/renderer/src/features/telemetry/company-telemetry.tsx
git commit -m "test(m39): cover telemetry kind filter e2e"
```

## Task 8: Verification Gate

**Files:**
- No new implementation files expected.

**Step 1: Format touched files**

Run:

```bash
pnpm exec biome check --write packages/shared-types/src/ipc.ts packages/shared-types/src/telemetry-kind-filter.test.ts apps/desktop/src/main/db/repos/runs.ts apps/desktop/src/main/db/repos/runs-telemetry.test.ts apps/desktop/src/main/ipc/handlers.ts apps/desktop/src/main/ipc/telemetry-handlers.test.ts apps/desktop/src/preload/api.ts apps/desktop/src/renderer/src/hooks/use-telemetry.ts apps/desktop/src/renderer/src/hooks/use-telemetry.test.tsx apps/desktop/src/renderer/src/features/telemetry/telemetry-view.tsx apps/desktop/src/renderer/src/features/telemetry/telemetry-view.test.tsx apps/desktop/src/renderer/src/features/telemetry/company-telemetry.tsx apps/desktop/src/renderer/src/features/telemetry/employee-telemetry.tsx apps/desktop/src/renderer/src/features/telemetry/cost-breakdown.tsx apps/desktop/src/renderer/src/features/telemetry/telemetry-subviews.test.tsx apps/desktop/e2e/telemetry-kind-filter.spec.ts
```

Expected: no formatter/import diagnostics remain.

**Step 2: Run focused tests**

Run:

```bash
pnpm -F @team-x/shared-types exec vitest run src/telemetry-kind-filter.test.ts
pnpm -F @team-x/desktop exec vitest run src/main/db/repos/runs-telemetry.test.ts src/main/ipc/telemetry-handlers.test.ts src/renderer/src/hooks/use-telemetry.test.tsx src/renderer/src/features/telemetry/telemetry-view.test.tsx src/renderer/src/features/telemetry/telemetry-subviews.test.tsx
```

Expected: PASS.

**Step 3: Run workspace gates**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm audit:claims -- --strict
```

Expected:

- typecheck clean.
- lint exits 0 with existing warning budget.
- claim evidence remains 95 verified / 0 allowlisted / 0 UNALLOWED unless docs claims intentionally expand.

**Step 4: Run E2E**

Run:

```bash
pnpm -F @team-x/desktop exec playwright test e2e/telemetry-kind-filter.spec.ts
```

Expected: PASS.

**Step 5: Commit verification ledger**

```bash
git add .loki/queue/current-task.json .loki/queue/pending.json .loki/state/orchestrator.json docs/plans/2026-04-24-team-x-phase-6-m39-telemetry-per-kind-filter.md
git commit -m "chore(loki): ledger phase 6 m39 telemetry filter"
```

## Acceptance Criteria

- Telemetry renders four filter chips: All, Work, Agentic, Copilot.
- All is the default and preserves existing aggregate behavior.
- Every telemetry subview re-queries when the filter changes.
- All four aggregate read paths apply the optional `runs.kind` filter.
- Invalid runtime `kind` values are rejected at the IPC boundary.
- No migrations, new settings, bus events, providers, or write-side run behavior changes ship in M39.

## Verification Ledger

M39 completed on 2026-04-20 with the read-path-only boundary preserved: no migrations, new settings, bus events, providers, or write-side run behavior changes shipped.

Final T8 gate:

- Touched-file Biome gate: 16 M39 files checked; no fixes applied.
- Shared-types focused gate: `pnpm -F @team-x/shared-types exec vitest run src/telemetry-kind-filter.test.ts` passed 1 file / 2 tests.
- Desktop focused gate: `pnpm -F @team-x/desktop exec vitest run src/main/db/repos/runs-telemetry.test.ts src/main/ipc/telemetry-handlers.test.ts src/renderer/src/hooks/use-telemetry.test.tsx src/renderer/src/features/telemetry/telemetry-view.test.tsx src/renderer/src/features/telemetry/telemetry-subviews.test.tsx` passed 5 files / 27 tests.
- Workspace typecheck: `pnpm typecheck` clean across 6 workspace packages.
- Lint: `pnpm lint` exited 0 with 21 known `noNonNullAssertion` warnings.
- Strict claim evidence: `pnpm audit:claims -- --strict` passed 95 verified / 0 allowlisted / 0 UNALLOWED.
- Production build: `pnpm -F @team-x/desktop build` passed.
- Focused E2E: `pnpm -F @team-x/desktop exec playwright test e2e/telemetry-kind-filter.spec.ts` passed 1 spec / 1 test.

M39 shipped surface:

- `TelemetryRunKind` and `TelemetryKindFilter` contracts with optional `kind` on the four telemetry aggregate requests.
- Runs repo aggregate filters for company stats, daily usage, employee stats, and cost breakdown.
- IPC validation rejecting invalid runtime `kind` values before repo access.
- Preload request-object support for all aggregate calls, preserving string compatibility for company/employee stats during migration.
- Renderer hooks with request-object inputs and query keys containing `req?.kind ?? 'all'`.
- `TelemetryView` kind chips with stable `data-telemetry-kind-filter` selectors.
- Subviews forwarding `kind` through `telemetryRequestKind(kindFilter)` into aggregate requests.
- Playwright coverage for All/Copilot/Work company Total Runs filtering through a real Electron session.

## Follow-Up Boundary

M39 only makes existing local telemetry easier to inspect. Budget controls, telemetry digest suggestions, per-kind alerting, exported telemetry bundles, and evidence-based default tuning remain future work.
