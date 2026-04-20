# Team-X Phase 6 M38 Insight Feedback Loop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn repeated copilot insight dismissals into an explicit, user-confirmed category-weight feedback loop.

**Architecture:** M38 adds a `copilot_category_weights` settings vector keyed by the canonical five `CopilotCategory` values, applies those weights inside `CopilotAnalyzerService`, and surfaces a suggestion after three same-category dismissals in seven days. The suggestion is advisory only: it returns from the dismiss flow and the UI must call `settings.setCopilotWeights` before anything changes.

**Tech Stack:** TypeScript, Vitest, Zod, Drizzle/better-sqlite3 settings repo, Electron IPC/preload, React 19, React Query, existing M33/M34 copilot service and sidebar.

---

## Context

M33 shipped the copilot analyzer, `copilot_insights` table, `copilot.dismiss`, `settings.getCopilot`, and `settings.setCopilot`. M34 shipped the sidebar and dismiss UX. M38 extends those surfaces without changing providers, migrations, insight storage, or autonomy rules.

Important existing facts:

- Canonical copilot categories are five values: `operational`, `cost`, `org`, `workflow`, `anomaly`.
- Phase 6 T0 D20 says "6-key weight vector", but that was category drift from the six-category capability taxonomy. M38 corrects this to a **5-key** copilot weight vector.
- `settings` is keyed by `key` as the primary key, so M38 keeps weights global/app-level. Per-company category weights require a schema change and stay out of scope.
- `copilot.dismissed` currently carries `insightId` and `dismissedAt`. M38 adds forward-looking category/title fields so the append-only event log can support dismissal pattern detection without a new table.
- Existing `settings.setCopilot` restarts analyzer timers but does not emit a bus event. M38 adds a new mutation, `settings.setCopilotWeights`, and it must emit `copilot.weights.changed` per invariant #11.

## Decisions

- **D20 correction:** `copilot_category_weights` is a five-key record, not six-key. Capabilities have six categories; copilot insights do not.
- **Storage:** Use the existing settings table key `copilot_category_weights`; no migration.
- **Scope:** Weights are global for v1.2.0 because the settings table primary key is only `key`. The dismissal detector is company-scoped, but applying the suggestion updates the global vector after explicit confirmation.
- **Clamp:** Each weight is clamped to `[0.0, 2.0]`; default is `1.0`.
- **Hard deny:** Weight `0.0` suppresses analyzer drafts in that category before dedup/persist.
- **Downrank suggestion:** Three same-category dismissals within seven days proposes `currentWeight * 0.5`, rounded to one decimal and clamped. If the current weight is already `0.5` or lower, propose `0.0`.
- **Analyzer weighting:** Weighting is deterministic. Drafts receive a base score from severity (`critical=1.0`, `warning=0.7`, `info=0.4`), multiplied by category weight, then sorted and capped before dedup.

## Non-Goals

- No silent weight mutation. The dismissal detector only returns a suggestion.
- No autonomous action, ticket creation, or analyzer self-healing.
- No new provider/router/MCP surface.
- No database migration or new table.
- No per-company weight persistence in M38.
- No change to M37 capability role-fit.
- No change to `copilot_categories`; category enablement and category weights are distinct controls.

## Task 1: Shared Types For Weights And Bus Event

**Files:**
- Modify: `packages/shared-types/src/events.ts`
- Modify: `packages/shared-types/src/copilot.ts`
- Modify: `packages/shared-types/src/ipc.ts`
- Test: `packages/shared-types/src/copilot-feedback.test.ts` (new)

**Step 1: Write failing shared-type tests**

Create `packages/shared-types/src/copilot-feedback.test.ts`:

```ts
import {
  COPILOT_CATEGORIES,
  COPILOT_CATEGORY_WEIGHT_CLAMP,
  COPILOT_CATEGORY_WEIGHTS_DEFAULT,
} from './ipc.js';

describe('copilot feedback weights', () => {
  it('pins one default weight per canonical copilot category', () => {
    expect(COPILOT_CATEGORIES).toEqual(['operational', 'cost', 'org', 'workflow', 'anomaly']);
    expect(Object.keys(COPILOT_CATEGORY_WEIGHTS_DEFAULT).sort()).toEqual(
      [...COPILOT_CATEGORIES].sort(),
    );
    expect(Object.values(COPILOT_CATEGORY_WEIGHTS_DEFAULT)).toEqual([1, 1, 1, 1, 1]);
  });

  it('pins the M38 clamp', () => {
    expect(COPILOT_CATEGORY_WEIGHT_CLAMP).toEqual({ min: 0, max: 2, default: 1 });
  });
});
```

Run:

```bash
pnpm -F @team-x/shared-types exec vitest run src/copilot-feedback.test.ts
```

Expected: FAIL because the constants and types do not exist yet.

**Step 2: Add wire types and constants**

In `packages/shared-types/src/ipc.ts`, add:

```ts
export type CopilotCategoryWeights = Record<CopilotCategory, number>;

export const COPILOT_CATEGORY_WEIGHT_CLAMP = {
  min: 0,
  max: 2,
  default: 1,
} as const;

export const COPILOT_CATEGORY_WEIGHTS_DEFAULT: CopilotCategoryWeights = {
  operational: 1,
  cost: 1,
  org: 1,
  workflow: 1,
  anomaly: 1,
};

export interface SettingsGetCopilotWeightsRequest {
  companyId: string;
}

export interface SettingsGetCopilotWeightsResponse {
  weights: CopilotCategoryWeights;
}

export interface SettingsSetCopilotWeightsRequest {
  companyId: string;
  weights: Partial<CopilotCategoryWeights>;
}

export interface SettingsSetCopilotWeightsResponse {
  weights: CopilotCategoryWeights;
}
```

Add `settings.getCopilotWeights` and `settings.setCopilotWeights` entries to `IpcContract` and `TeamXApi.settings`.

In `packages/shared-types/src/events.ts`, add the event type and payload:

```ts
| 'copilot.weights.changed'
```

```ts
export interface CopilotWeightsChangedPayload {
  weights: CopilotCategoryWeights;
  changedKeys: CopilotCategory[];
  changedAt: number;
}
```

Import `CopilotCategoryWeights` with `import type` to avoid runtime cycles.

In `packages/shared-types/src/copilot.ts`, extend `CopilotDismissResult`:

```ts
feedbackSuggestion?: CopilotFeedbackSuggestion;
```

Add:

```ts
export interface CopilotFeedbackSuggestion {
  category: CopilotCategory;
  dismissalsInWindow: number;
  windowDays: number;
  currentWeight: number;
  suggestedWeight: number;
  reason: string;
}
```

**Step 3: Verify green**

Run:

```bash
pnpm -F @team-x/shared-types exec vitest run src/copilot-feedback.test.ts src/ipc.test.ts
```

Expected: PASS.

**Commit:**

```bash
git add packages/shared-types/src/events.ts packages/shared-types/src/copilot.ts packages/shared-types/src/ipc.ts packages/shared-types/src/copilot-feedback.test.ts
git commit -m "feat(m38): add copilot feedback weight contracts"
```

## Task 2: Settings Repo Weight Persistence

**Files:**
- Modify: `apps/desktop/src/main/db/repos/settings.ts`
- Test: `apps/desktop/src/main/db/repos/settings-copilot.test.ts`

**Step 1: Write failing repo tests**

Add tests covering:

- `seedDefaults()` creates `copilot_category_weights`.
- `getCopilotWeights()` returns the five-key default when missing.
- `setCopilotWeights({ cost: 0.25 })` preserves other categories.
- values clamp to `0` and `2`.
- unknown / missing category keys are ignored by TypeScript contract and runtime defensive code.

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/main/db/repos/settings-copilot.test.ts
```

Expected: FAIL because repo methods do not exist.

**Step 2: Implement repo methods**

Add default:

```ts
{ key: 'copilot_category_weights', value: COPILOT_CATEGORY_WEIGHTS_DEFAULT },
```

Add helpers:

```ts
function clampFloat(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value * 10) / 10));
}
```

Add:

```ts
getCopilotWeights(): SettingsGetCopilotWeightsResponse {
  const raw = this.get<unknown>('copilot_category_weights', COPILOT_CATEGORY_WEIGHTS_DEFAULT);
  const out = { ...COPILOT_CATEGORY_WEIGHTS_DEFAULT };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const cat of COPILOT_CATEGORIES) {
      const value = (raw as Record<string, unknown>)[cat];
      if (typeof value === 'number' && Number.isFinite(value)) {
        out[cat] = clampFloat(value, COPILOT_CATEGORY_WEIGHT_CLAMP.min, COPILOT_CATEGORY_WEIGHT_CLAMP.max);
      }
    }
  }
  return { weights: out };
}

setCopilotWeights(req: SettingsSetCopilotWeightsRequest): SettingsSetCopilotWeightsResponse {
  const current = this.getCopilotWeights().weights;
  const next = { ...current };
  for (const cat of COPILOT_CATEGORIES) {
    const value = req.weights[cat];
    if (value !== undefined) {
      next[cat] = clampFloat(value, COPILOT_CATEGORY_WEIGHT_CLAMP.min, COPILOT_CATEGORY_WEIGHT_CLAMP.max);
    }
  }
  this.set('copilot_category_weights', next);
  return { weights: next };
}
```

**Step 3: Verify green**

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/main/db/repos/settings-copilot.test.ts
```

Expected: PASS.

**Commit:**

```bash
git add apps/desktop/src/main/db/repos/settings.ts apps/desktop/src/main/db/repos/settings-copilot.test.ts
git commit -m "feat(m38): persist copilot category weights"
```

## Task 3: IPC Get/Set Weights With Bus Event

**Files:**
- Modify: `apps/desktop/src/main/ipc/handlers.ts`
- Modify: `apps/desktop/src/main/ipc/register.ts`
- Modify: `apps/desktop/src/preload/api.ts`
- Test: `apps/desktop/src/main/ipc/settings-copilot-handlers.test.ts`

**Step 1: Write failing IPC tests**

Add tests:

- `settings.getCopilotWeights` returns repo weights.
- `settings.setCopilotWeights` requires `companyId`.
- `settings.setCopilotWeights` persists and returns clamped weights.
- successful set emits `copilot.weights.changed` with `changedKeys`.
- bus emit failure is swallowed after the durable write.

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/main/ipc/settings-copilot-handlers.test.ts
```

Expected: FAIL because IPC handlers/channels do not exist.

**Step 2: Implement IPC handlers**

Extend the settings repo interface in `handlers.ts`:

```ts
getCopilotWeights(): SettingsGetCopilotWeightsResponse;
setCopilotWeights(req: SettingsSetCopilotWeightsRequest): SettingsSetCopilotWeightsResponse;
```

Add handlers:

```ts
async settingsGetCopilotWeights(req: SettingsGetCopilotWeightsRequest) {
  assertCompanyId(req.companyId, 'settings.getCopilotWeights');
  return settingsRepo.getCopilotWeights();
}

async settingsSetCopilotWeights(req: SettingsSetCopilotWeightsRequest) {
  assertCompanyId(req.companyId, 'settings.setCopilotWeights');
  const before = settingsRepo.getCopilotWeights().weights;
  const result = settingsRepo.setCopilotWeights(req);
  const changedKeys = COPILOT_CATEGORIES.filter((cat) => before[cat] !== result.weights[cat]);
  emitBestEffort('copilot.weights.changed', req.companyId, HUMAN_USER_ID, 'user', {
    weights: result.weights,
    changedKeys,
    changedAt: Date.now(),
  });
  return result;
}
```

Use the existing bus helper pattern already used by Phase 5.6 invariant #11 handlers.

Wire channel names in `register.ts` and preload `api.ts`.

**Step 3: Verify green**

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/main/ipc/settings-copilot-handlers.test.ts
```

Expected: PASS.

**Commit:**

```bash
git add apps/desktop/src/main/ipc/handlers.ts apps/desktop/src/main/ipc/register.ts apps/desktop/src/preload/api.ts apps/desktop/src/main/ipc/settings-copilot-handlers.test.ts
git commit -m "feat(m38): expose copilot weight settings IPC"
```

## Task 4: Analyzer Weighting

**Files:**
- Modify: `apps/desktop/src/main/services/copilot-analyzer-service.ts`
- Test: `apps/desktop/src/main/services/copilot-analyzer-service.test.ts`

**Step 1: Write failing pure-helper tests**

Add tests for:

- `weightInsightDrafts` drops categories with `0` weight.
- `weightInsightDrafts` sorts `critical` above `warning` before equal weights.
- category multiplier can push a `warning` weighted `2.0` above a `critical` weighted `1.0`.
- result is capped at `MAX_WEIGHTED_DRAFTS_PER_TICK`.

Expected helper shape:

```ts
weightInsightDrafts(drafts, weights).map((x) => x.category)
```

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/main/services/copilot-analyzer-service.test.ts
```

Expected: FAIL because helper does not exist.

**Step 2: Implement helper**

Add:

```ts
const MAX_WEIGHTED_DRAFTS_PER_TICK = 5;
const SEVERITY_BASE_SCORE: Record<CopilotSeverity, number> = {
  critical: 1,
  warning: 0.7,
  info: 0.4,
};
```

Add exported test helper:

```ts
export function weightInsightDrafts(
  drafts: readonly InsightDraft[],
  weights: CopilotCategoryWeights,
): InsightDraft[] {
  return drafts
    .map((draft, index) => ({
      draft,
      score: (SEVERITY_BASE_SCORE[draft.severity] ?? 0) * (weights[draft.category] ?? 1),
      index,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_WEIGHTED_DRAFTS_PER_TICK)
    .map((x) => x.draft);
}
```

Extend `CopilotAnalyzerSettings`:

```ts
categoryWeights: CopilotCategoryWeights;
```

Default to `COPILOT_CATEGORY_WEIGHTS_DEFAULT`.

Before the dedup loop:

```ts
const weightedDrafts = weightInsightDrafts(drafts, settings.categoryWeights);
proposedCount = drafts.length;
for (const draft of weightedDrafts) {
  ...
}
```

Keep `insightsProposed` as pre-weight count so telemetry can show model output volume, not persisted count.

**Step 3: Add integration tests**

Add a service test where the provider returns one `cost` and one `operational` draft, settings set `cost: 0`, and only the operational insight persists.

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/main/services/copilot-analyzer-service.test.ts
```

Expected: PASS.

**Commit:**

```bash
git add apps/desktop/src/main/services/copilot-analyzer-service.ts apps/desktop/src/main/services/copilot-analyzer-service.test.ts
git commit -m "feat(m38): apply copilot category weights in analyzer"
```

## Task 5: Dismissal Pattern Detector

**Files:**
- Modify: `packages/shared-types/src/copilot.ts`
- Modify: `apps/desktop/src/main/ipc/handlers.ts`
- Modify: `apps/desktop/src/main/ipc/copilot-handlers.test.ts`

**Step 1: Write failing dismiss-flow tests**

In `copilot-handlers.test.ts`, add tests:

- Two same-category dismissals in seven days returns no suggestion.
- Third same-category dismissal returns a suggestion.
- Mixed categories do not trigger.
- Dismissals older than seven days do not count.
- current weight `1.0` suggests `0.5`; current weight `0.5` suggests `0.0`.

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/main/ipc/copilot-handlers.test.ts
```

Expected: FAIL because dismiss result has no suggestion and dismissed events lack category context.

**Step 2: Extend dismiss event payload**

When handling `copilot.dismiss`, fetch the insight row before dismissal and emit:

```ts
{
  insightId,
  dismissedAt,
  category: row.category,
  title: row.title,
}
```

Update `CopilotDismissedPayload` accordingly. Existing consumers ignore extra payload fields.

**Step 3: Add detector helper**

Add a pure helper in `handlers.ts` or a new small module if the test setup becomes crowded:

```ts
export function buildCopilotFeedbackSuggestion(args: {
  category: CopilotCategory;
  dismissalsInWindow: number;
  currentWeight: number;
}): CopilotFeedbackSuggestion | null {
  if (args.dismissalsInWindow < 3) return null;
  const suggestedWeight = args.currentWeight <= 0.5 ? 0 : Math.max(0, Math.round(args.currentWeight * 5) / 10);
  if (suggestedWeight === args.currentWeight) return null;
  return {
    category: args.category,
    dismissalsInWindow: args.dismissalsInWindow,
    windowDays: 7,
    currentWeight: args.currentWeight,
    suggestedWeight,
    reason: `You dismissed ${args.dismissalsInWindow} ${args.category} insights in the last 7 days.`,
  };
}
```

The handler can count recent dismissals from the append-only events repo by company, filtering `copilot.dismissed` payloads by category and `createdAt >= now - 7 days`.

**Step 4: Return suggestion from dismiss**

Extend `CopilotDismissResult`:

```ts
return { id, dismissedAt, feedbackSuggestion };
```

Do not call `settings.setCopilotWeights` here.

**Step 5: Verify green**

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/main/ipc/copilot-handlers.test.ts
```

Expected: PASS.

**Commit:**

```bash
git add packages/shared-types/src/copilot.ts packages/shared-types/src/events.ts apps/desktop/src/main/ipc/handlers.ts apps/desktop/src/main/ipc/copilot-handlers.test.ts
git commit -m "feat(m38): suggest copilot downrank after repeated dismissals"
```

## Task 6: Renderer Settings And Suggestion UI

**Files:**
- Modify: `apps/desktop/src/renderer/src/hooks/use-settings.ts`
- Modify: `apps/desktop/src/renderer/src/hooks/use-copilot.ts`
- Modify: `apps/desktop/src/renderer/src/features/settings/copilot-section.tsx`
- Modify: `apps/desktop/src/renderer/src/features/copilot/copilot-sidebar.tsx`
- Test: `apps/desktop/src/renderer/src/features/copilot/copilot-helpers.test.ts`
- Test: `apps/desktop/src/renderer/src/features/settings/copilot-section.test.tsx` (new if no suitable existing test)

**Step 1: Write failing renderer tests**

Add tests that assert:

- `CopilotSection` renders one weight control per `COPILOT_CATEGORIES` entry.
- values display as `0.0x` through `2.0x`.
- applying a suggestion calls `settings.setCopilotWeights` with the suggested category weight.
- dismissing the suggestion banner does not mutate settings.

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/renderer/src/features/copilot/copilot-helpers.test.ts src/renderer/src/features/settings/copilot-section.test.tsx
```

Expected: FAIL until hooks/UI exist.

**Step 2: Add hooks**

In `use-settings.ts`:

```ts
export function useCopilotWeights(companyId: string | null) {
  return useQuery({
    queryKey: ['settings', 'copilot-weights', companyId],
    queryFn: () => ipc.settings.getCopilotWeights({ companyId: companyId! }),
    enabled: !!companyId,
  });
}

export function useSetCopilotWeights() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: SettingsSetCopilotWeightsRequest) => ipc.settings.setCopilotWeights(req),
    onSuccess: (_result, req) => {
      qc.invalidateQueries({ queryKey: ['settings', 'copilot-weights', req.companyId] });
    },
  });
}
```

Avoid `companyId!` if touching this area also clears the existing lint warnings; otherwise use the existing hook style and keep the warning count stable.

**Step 3: Add settings controls**

In `CopilotSection`, add a "Category weighting" group below allowed categories. Use stable dimensions and no nested cards. A simple range or number input per category is enough for M38:

```tsx
<input
  type="number"
  min={0}
  max={2}
  step={0.1}
  value={weights[cat]}
  onBlur={() => setCopilotWeights.mutate({ companyId, weights: { [cat]: next } }) }
/>
```

**Step 4: Add suggestion banner**

When `useDismissCopilotInsight` receives a `feedbackSuggestion`, store it in React Query cache or local sidebar state. Render a compact banner in `CopilotSidebar`:

- Text: `Reduce Cost insights to 0.5x?`
- Primary action: `Apply`
- Secondary action: `Keep current`

The `Apply` button calls `settings.setCopilotWeights({ companyId, weights: { [category]: suggestedWeight } })`.

**Step 5: Verify green**

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/renderer/src/features/copilot/copilot-helpers.test.ts src/renderer/src/features/settings/copilot-section.test.tsx
```

Expected: PASS.

**Commit:**

```bash
git add apps/desktop/src/renderer/src/hooks/use-settings.ts apps/desktop/src/renderer/src/hooks/use-copilot.ts apps/desktop/src/renderer/src/features/settings/copilot-section.tsx apps/desktop/src/renderer/src/features/copilot/copilot-sidebar.tsx apps/desktop/src/renderer/src/features/copilot/copilot-helpers.test.ts apps/desktop/src/renderer/src/features/settings/copilot-section.test.tsx
git commit -m "feat(m38): surface copilot feedback suggestions"
```

## Task 7: M38 Integration E2E

**Files:**
- Create: `apps/desktop/e2e/copilot-feedback.spec.ts`

**Step 1: Write failing E2E**

Scenario:

1. Launch app in test mode.
2. Force analyzer to create three same-category insights through the canned copilot provider.
3. Dismiss three `cost` insights.
4. Assert the feedback suggestion banner appears.
5. Click `Apply`.
6. Assert an audit/event row with `copilot.weights.changed` exists.
7. Reopen settings and verify the `cost` weight displays the suggested value.

Run:

```bash
pnpm -F @team-x/desktop exec playwright test e2e/copilot-feedback.spec.ts
```

Expected: FAIL until the UI and IPC are wired.

**Step 2: Stabilize selectors**

Use `data-copilot-feedback-suggestion`, `data-copilot-feedback-apply`, and `data-copilot-weight-category="<category>"`. Do not assert copy that may change.

**Step 3: Verify green**

Run:

```bash
pnpm -F @team-x/desktop exec playwright test e2e/copilot-feedback.spec.ts
```

Expected: PASS.

**Commit:**

```bash
git add apps/desktop/e2e/copilot-feedback.spec.ts
git commit -m "test(m38): cover copilot feedback loop e2e"
```

## Task 8: Verification Gate

**Files:**
- No new implementation files expected.

**Step 1: Format touched files**

Run:

```bash
pnpm exec biome check --write packages/shared-types/src/events.ts packages/shared-types/src/copilot.ts packages/shared-types/src/ipc.ts apps/desktop/src/main/db/repos/settings.ts apps/desktop/src/main/ipc/handlers.ts apps/desktop/src/main/ipc/register.ts apps/desktop/src/preload/api.ts apps/desktop/src/main/services/copilot-analyzer-service.ts apps/desktop/src/renderer/src/hooks/use-settings.ts apps/desktop/src/renderer/src/hooks/use-copilot.ts apps/desktop/src/renderer/src/features/settings/copilot-section.tsx apps/desktop/src/renderer/src/features/copilot/copilot-sidebar.tsx
```

Expected: no formatter/import diagnostics remain.

**Step 2: Run focused tests**

Run:

```bash
pnpm -F @team-x/shared-types exec vitest run src/copilot-feedback.test.ts src/ipc.test.ts
pnpm -F @team-x/desktop exec vitest run src/main/db/repos/settings-copilot.test.ts src/main/ipc/settings-copilot-handlers.test.ts src/main/ipc/copilot-handlers.test.ts src/main/services/copilot-analyzer-service.test.ts src/renderer/src/features/copilot/copilot-helpers.test.ts src/renderer/src/features/settings/copilot-section.test.tsx
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
- lint exits 0 with the existing warning budget.
- claim evidence remains 95 verified / 0 allowlisted / 0 UNALLOWED unless the plan/doc claims intentionally expand.

**Step 4: Run E2E**

Run:

```bash
pnpm -F @team-x/desktop exec playwright test e2e/copilot-feedback.spec.ts
```

Expected: PASS.

**Step 5: Commit verification ledger**

```bash
git add .loki/queue/current-task.json .loki/queue/pending.json .loki/state/orchestrator.json docs/plans/2026-04-23-team-x-phase-6-m38-insight-feedback-loop.md
git commit -m "chore(loki): ledger phase 6 m38 feedback loop"
```

## Acceptance Criteria

- `copilot_category_weights` exists with one clamped value for each canonical copilot category.
- `settings.getCopilotWeights` and `settings.setCopilotWeights` are typed, bridged, and tested.
- `settings.setCopilotWeights` emits `copilot.weights.changed` after durable persistence.
- Analyzer suppresses weight `0.0` categories and uses severity score multiplied by category weight before dedup.
- Three same-category dismissals in seven days return a suggestion; no weight mutates until explicit user confirmation.
- Copilot settings expose category weights; Copilot sidebar surfaces a suggestion with Apply / Keep current actions.
- No migration, provider, autonomous-action, or role-fit changes ship in M38.

## Follow-Up Boundary

M38 does not implement learning beyond deterministic category weights. Per-company weights, per-user profiles, multi-company rollups, and analyzer-generated self-actions are future-phase material.
