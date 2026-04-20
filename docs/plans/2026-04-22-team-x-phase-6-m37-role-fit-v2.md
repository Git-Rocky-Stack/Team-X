# Team-X Phase 6 M37 Role-Fit v2 Implementation Plan

> **Status:** Reconciled 2026-04-20 by M37-R. The implementation described below already landed in commit `26d07df`; this document now serves as both the original M37 implementation plan and the reconciliation evidence record.
>
> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task when authoring future task plans. For this M37-R pass, execute verification/reconciliation only; do not add new feature scope.

**Goal:** Replace M32's title-keyword role-fit heuristic with capability-overlap scoring while preserving the locked four-term workload score.

**Architecture:** M36 made role capabilities available through role.md frontmatter. M37 threads those capabilities into the write-side planner scorer, asks decomposition outputs to declare `requiredCapabilities`, and changes only the `role_fit` term inside the existing `0.4 / 0.3 / 0.2 / 0.1` formula. If a subtask has no required capabilities, the scorer falls back to the M32 keyword heuristic to preserve existing behavior for generic or legacy decomposition outputs.

**Tech Stack:** TypeScript, Vitest, Zod, `@team-x/shared-types` capability enum, `@team-x/role-schema` role specs, Electron main-process services.

---

## Reconciliation Evidence

M37-R inventoried the shipped surface from `26d07df` and verified the acceptance criteria:

- `apps/desktop/src/main/services/agentic-tools-write.ts` preserves the locked 4-weight workload score and changes only the role-fit term.
- `computeRoleFit` returns Jaccard overlap when `requiredCapabilities` is present and falls back to the M32 keyword heuristic when it is absent or empty.
- `parseDecomposition` reads provider `requiredCapabilities`, dedupes valid capability strings, and drops invalid provider strings before scoring.
- `AgenticToolsWriteDeps.roleLookup` threads official role frontmatter capabilities into candidate scoring; `apps/desktop/src/main/index.ts` passes `roleLoader`.
- No renderer surface, IPC channel, migration, setting, or bus event was added by M37.

Focused verification run during M37-R:

| Suite | Command | Result |
|-------|---------|--------|
| Shared-types taxonomy | `pnpm -F @team-x/shared-types exec vitest run src/capabilities.test.ts src/capabilities-taxonomy-marker.test.ts` | 2 files / 20 tests passed |
| Role-schema parser/backfill/signature | `pnpm -F @team-x/role-schema exec vitest run src/parse.test.ts src/capabilities-backfill.test.ts src/pack-signature.test.ts` | 3 files / 50 tests passed |
| Desktop role-fit + loader | `pnpm -F @team-x/desktop exec vitest run src/main/services/agentic-tools-write.test.ts src/main/services/role-loader.test.ts` | 2 files / 50 tests passed |

The task sections below are retained to explain what was implemented. Treat them as historical implementation steps, not as outstanding work.

---

## Context

M36 delivered the closed `Capability` enum, parser validation, the 57-role official backfill, and official-pack enforcement. M37 consumes that substrate in `apps/desktop/src/main/services/agentic-tools-write.ts`.

Current M32 behavior:
- `computeRoleFit(employee, subtask)` reads `employee.title + employee.level`.
- `scoreEmployee(...)` keeps the locked formula:
  `0.4 * role_fit + 0.3 * (1 - load_ratio) + 0.2 * availability + 0.1 * past_performance`.
- `decompose_project` parses provider subtasks with `title`, `description`, `complexity`, and `dependsOn`.
- `buildWriteSideTools(...)` is composed in `apps/desktop/src/main/index.ts` without access to the role loader.

M37 decisions:
- **D17:** Capability role-fit is Jaccard overlap: `|employee.capabilities ∩ subtask.requiredCapabilities| / |union|`.
- **D18:** Scoring weights stay unchanged.
- **Q2 resolved:** If `subtask.requiredCapabilities` is missing or empty, use the existing M32 keyword heuristic. This avoids collapsing role-fit signal for legacy provider output and keeps generic subtasks behaviorally stable.

Non-goals:
- No migration.
- No new settings.
- No changes to score weights.
- No renderer surface.
- No autonomous action.

## Task 1: Add Capability-Aware Scorer Tests

**Files:**
- Modify: `apps/desktop/src/main/services/agentic-tools-write.test.ts`
- Modify later: `apps/desktop/src/main/services/agentic-tools-write.ts`

**Step 1: Write failing capability-overlap tests**

Add a new describe block below the existing `computeRoleFit` tests:

```ts
describe('computeRoleFit — capabilities v2', () => {
  it('returns 1.0 when employee capabilities exactly cover required capabilities', () => {
    const emp: ScorerEmployee = {
      id: 'backend',
      name: 'Backend',
      title: 'Office Generalist',
      level: 'ic',
      status: 'idle',
      isSystem: false,
      capabilities: ['backend_engineering', 'api_design'],
    };

    expect(
      computeRoleFit(emp, {
        title: 'Build service contract',
        type: 'implement',
        requiredCapabilities: ['backend_engineering', 'api_design'],
      }),
    ).toBe(1);
  });

  it('uses Jaccard overlap for partial capability matches', () => {
    const emp: ScorerEmployee = {
      id: 'fullstack',
      name: 'Fullstack',
      title: 'Senior Fullstack Engineer',
      level: 'ic',
      status: 'idle',
      isSystem: false,
      capabilities: ['backend_engineering', 'api_design'],
    };

    expect(
      computeRoleFit(emp, {
        title: 'Build typed UI client',
        requiredCapabilities: ['frontend_engineering', 'api_design'],
      }),
    ).toBeCloseTo(1 / 3, 10);
  });

  it('falls back to the M32 keyword heuristic when required capabilities are absent', () => {
    const emp: ScorerEmployee = {
      id: 'legacy',
      name: 'Legacy',
      title: 'Senior Software Engineer',
      level: 'ic',
      status: 'idle',
      isSystem: false,
      capabilities: ['content_marketing'],
    };

    expect(computeRoleFit(emp, { title: 'Implement auth module', type: 'implement' })).toBeGreaterThan(
      0.5,
    );
  });

  it('falls back to the M32 keyword heuristic when required capabilities are empty', () => {
    const emp: ScorerEmployee = {
      id: 'legacy-empty',
      name: 'Legacy Empty',
      title: 'Senior Software Engineer',
      level: 'ic',
      status: 'idle',
      isSystem: false,
      capabilities: ['content_marketing'],
    };

    expect(
      computeRoleFit(emp, {
        title: 'Implement auth module',
        type: 'implement',
        requiredCapabilities: [],
      }),
    ).toBeGreaterThan(0.5);
  });
});
```

**Step 2: Run tests and verify failure**

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/main/services/agentic-tools-write.test.ts
```

Expected:
- TypeScript/Vitest fails because `ScorerEmployee.capabilities` and `SubtaskHint.requiredCapabilities` do not exist yet, or assertions fail because `computeRoleFit` still uses title keywords.

**Step 3: Commit after green**

After Task 2 is green:

```bash
git add apps/desktop/src/main/services/agentic-tools-write.test.ts apps/desktop/src/main/services/agentic-tools-write.ts
git commit -m "feat(m37): add capability-driven role-fit scorer"
```

## Task 2: Implement Capability Role-Fit

**Files:**
- Modify: `apps/desktop/src/main/services/agentic-tools-write.ts`

**Step 1: Add capability imports and type fields**

Add:

```ts
import type { Capability } from '@team-x/shared-types';
```

Extend `SubtaskHint`:

```ts
readonly requiredCapabilities?: readonly Capability[];
```

Extend `ScorerEmployee`:

```ts
readonly capabilities?: readonly Capability[];
```

**Step 2: Preserve the M32 heuristic as a helper**

Rename current `computeRoleFit` body into:

```ts
function computeKeywordRoleFit(employee: ScorerEmployee, subtask: SubtaskHint): number {
  // existing implementation body
}
```

**Step 3: Add Jaccard helper**

```ts
function computeCapabilityRoleFit(
  employeeCapabilities: readonly Capability[],
  requiredCapabilities: readonly Capability[],
): number {
  if (employeeCapabilities.length === 0 || requiredCapabilities.length === 0) return 0;
  const employeeSet = new Set(employeeCapabilities);
  const requiredSet = new Set(requiredCapabilities);
  let intersection = 0;
  for (const capability of requiredSet) {
    if (employeeSet.has(capability)) intersection += 1;
  }
  const union = new Set([...employeeSet, ...requiredSet]).size;
  return union === 0 ? 0 : clamp01(intersection / union);
}
```

**Step 4: Update `computeRoleFit`**

```ts
export function computeRoleFit(employee: ScorerEmployee, subtask: SubtaskHint): number {
  if (employee.isSystem) return 0;
  const requiredCapabilities = subtask.requiredCapabilities ?? [];
  if (requiredCapabilities.length > 0) {
    return computeCapabilityRoleFit(employee.capabilities ?? [], requiredCapabilities);
  }
  return computeKeywordRoleFit(employee, subtask);
}
```

**Step 5: Run focused tests**

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/main/services/agentic-tools-write.test.ts
```

Expected: PASS.

## Task 3: Parse `requiredCapabilities` From Decomposition Output

**Files:**
- Modify: `apps/desktop/src/main/services/agentic-tools-write.ts`
- Modify: `apps/desktop/src/main/services/agentic-tools-write.test.ts`

**Step 1: Write failing parser tests**

Add tests near the `decompose_project` tests:

```ts
it('passes requiredCapabilities from provider output into role-fit scoring', async () => {
  const subtasks = [
    {
      title: 'Backend API',
      description: 'Build API',
      complexity: 'M',
      dependsOn: [],
      requiredCapabilities: ['backend_engineering', 'api_design'],
    },
  ];
  const { deps } = makeDeps({
    employees: [
      {
        id: 'backend',
        companyId: 'co-1',
        name: 'Backend Dev',
        title: 'Generalist',
        level: 'ic',
        status: 'idle',
        isSystem: false,
        roleId: 'backend-developer',
      },
      {
        id: 'content',
        companyId: 'co-1',
        name: 'Content',
        title: 'Senior Software Engineer',
        level: 'ic',
        status: 'idle',
        isSystem: false,
        roleId: 'content-strategist',
      },
    ],
    providerText: JSON.stringify(subtasks),
    roleSpecs: new Map([
      ['backend-developer', ['backend_engineering', 'api_design']],
      ['content-strategist', ['content_marketing']],
    ]),
  });

  const tool = buildDecomposeProjectTool(deps);
  const result = (await tool.execute({ brief: 'Build API' }, makeCtx())) as DecomposedPlan;

  expect(result.subtasks[0]?.assigneeId).toBe('backend');
});
```

Also add a parser-focused case where provider output includes invalid required capabilities:

```ts
it('drops invalid provider-required capabilities before scoring', async () => {
  // provider emits ['backend_engineering', 'not_real']; scoring should see only backend_engineering
});
```

**Step 2: Run tests and verify failure**

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/main/services/agentic-tools-write.test.ts
```

Expected: FAIL because `parseDecomposition` ignores `requiredCapabilities` and deps do not expose role specs yet.

**Step 3: Extend parsed subtask shape**

Import runtime guard:

```ts
import { isCapability, type Capability } from '@team-x/shared-types';
```

Update `parseDecomposition` return shape with:

```ts
requiredCapabilities: Capability[];
```

When reading each candidate:

```ts
const requiredCapabilitiesRaw = Array.isArray(obj.requiredCapabilities)
  ? obj.requiredCapabilities
  : [];
const requiredCapabilities: Capability[] = [];
for (const rawCapability of requiredCapabilitiesRaw) {
  if (isCapability(rawCapability) && !requiredCapabilities.includes(rawCapability)) {
    requiredCapabilities.push(rawCapability);
  }
}
```

Include `requiredCapabilities` in the collected object.

**Step 4: Update provider prompt**

Change the decomposition system prompt so each item includes:

```text
`requiredCapabilities` (array of capability enum strings, optional but preferred)
```

List the allowed capability strings by joining `CAPABILITY_LIST`. Keep the prompt under the existing one-call design. Do not ask for arbitrary strings.

**Step 5: Pass required capabilities into scorer hint**

When building `hint`:

```ts
requiredCapabilities: raw.requiredCapabilities,
```

**Step 6: Run focused tests**

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/main/services/agentic-tools-write.test.ts
```

Expected: parser-related tests still fail until Task 4 supplies employee capabilities.

## Task 4: Thread Employee Capabilities Into Planner Scoring

**Files:**
- Modify: `apps/desktop/src/main/services/agentic-tools-write.ts`
- Modify: `apps/desktop/src/main/services/agentic-tools-write.test.ts`
- Modify: `apps/desktop/src/main/index.ts`

**Step 1: Add a role lookup dependency**

In `agentic-tools-write.ts`, import type:

```ts
import type { RoleSpec } from '@team-x/shared-types';
```

Add interface:

```ts
export interface WriteSideRoleLookup {
  getSpec(roleId: string): RoleSpec | null;
}
```

Extend `AgenticToolsWriteDeps`:

```ts
readonly roleLookup?: WriteSideRoleLookup;
```

**Step 2: Add helper**

```ts
function capabilitiesForEmployee(
  deps: AgenticToolsWriteDeps,
  employee: { roleId?: string },
): readonly Capability[] {
  if (!employee.roleId || !deps.roleLookup) return [];
  return deps.roleLookup.getSpec(employee.roleId)?.frontmatter.capabilities ?? [];
}
```

**Step 3: Include capabilities when scoring candidates**

In `buildDecomposeProjectTool`, where `scoreEmployee` receives candidate data, add:

```ts
capabilities: capabilitiesForEmployee(deps, e),
```

Keep all existing title/level/status fields unchanged.

**Step 4: Wire production composition**

In `apps/desktop/src/main/index.ts`, pass the already-created `roleLoader` into `buildWriteSideTools`:

```ts
roleLookup: roleLoader,
```

No IPC change is needed.

**Step 5: Update test fakes**

In `agentic-tools-write.test.ts`:
- Add `roleId?: string` to `FakeEmployee`.
- Add optional `roleSpecs?: Map<string, readonly Capability[]>` to `MakeDepsOpts`.
- Add a fake `roleLookup` to `deps`:

```ts
roleLookup: {
  getSpec(roleId: string) {
    const capabilities = opts.roleSpecs?.get(roleId);
    if (!capabilities) return null;
    return {
      frontmatter: { capabilities },
    } as RoleSpec;
  },
},
```

Use a narrow cast if needed to avoid filling the full `RoleSpec` in every test.

**Step 6: Run focused tests**

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/main/services/agentic-tools-write.test.ts
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/desktop/src/main/services/agentic-tools-write.ts apps/desktop/src/main/services/agentic-tools-write.test.ts apps/desktop/src/main/index.ts
git commit -m "feat(m37): thread role capabilities into planner scoring"
```

## Task 5: Regression Guards for Locked Score Formula

**Files:**
- Modify: `apps/desktop/src/main/services/agentic-tools-write.test.ts`

**Step 1: Add formula-stability tests**

Add tests asserting:
- `SCORING_WEIGHTS` still sums to `1.0`.
- a full capability match only changes the role-fit term and preserves load/availability/performance math.
- a no-capability subtask produces the same score as the pre-M37 keyword path for existing golden input.

Example:

```ts
it('capability role-fit changes only the locked role_fit term', () => {
  const emp: ScorerEmployee = {
    id: 'backend',
    name: 'Backend',
    title: 'No Keyword Title',
    level: 'ic',
    status: 'idle',
    isSystem: false,
    capabilities: ['backend_engineering'],
  };

  const score = scoreEmployee(
    emp,
    { title: 'API work', requiredCapabilities: ['backend_engineering'] },
    { openTicketCount: 0, inMeeting: false, avgCompletionMs: null },
  );

  expect(score).toBeCloseTo(0.4 * 1 + 0.3 * 1 + 0.2 * 1 + 0.1 * 0.5, 10);
});
```

**Step 2: Run focused tests**

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/main/services/agentic-tools-write.test.ts
```

Expected: PASS.

## Task 6: Verification Gate

**Files:**
- No new source files expected.

**Step 1: Format touched files**

Run:

```bash
pnpm exec biome check --write apps/desktop/src/main/services/agentic-tools-write.ts apps/desktop/src/main/services/agentic-tools-write.test.ts apps/desktop/src/main/index.ts
```

Expected: no remaining formatting/import diagnostics in touched files.

**Step 2: Run focused tests**

Run:

```bash
pnpm -F @team-x/desktop exec vitest run src/main/services/agentic-tools-write.test.ts
```

Expected: PASS.

**Step 3: Run workspace typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS across all workspace packages.

**Step 4: Run full unit suite**

Run:

```bash
pnpm test
```

Expected: PASS. Test count should increase from the M36 baseline by the new M37 scorer tests.

**Step 5: Run lint**

Run:

```bash
pnpm lint
```

Expected:
- No diagnostics in M37-touched files.
- The known `.loki/queue/pending.json` formatting issue may still fail root lint until that unrelated file is cleaned or ignored.
- Baseline non-null assertion warnings may remain.

**Step 6: Commit verification or document residual lint**

If root lint passes:

```bash
git add .
git commit -m "test(m37): lock role-fit v2 regressions"
```

If root lint fails only for unrelated pre-existing files, record the exact residual in the handoff and do not modify unrelated files.

## Acceptance Criteria

- `computeRoleFit` uses capability Jaccard overlap when `subtask.requiredCapabilities` is non-empty.
- `computeRoleFit` falls back to the M32 keyword heuristic when no required capabilities are present.
- `scoreEmployee` keeps the locked four-weight formula unchanged.
- `decompose_project` can parse provider `requiredCapabilities` and use official role frontmatter capabilities for assignment scoring.
- Production `buildWriteSideTools` receives `roleLoader` as `roleLookup`.
- No new database migrations, IPC channels, or bus events.
- Focused M37 tests, workspace typecheck, and full Vitest pass.

## Follow-Up Boundary

M37 does not add a renderer preview or explainability UI for why an assignee won. If needed, a later milestone can surface the winning `requiredCapabilities` and overlap breakdown in the plan proposal payload, but M37 keeps the public result envelope unchanged.

## M37-R Closeout

M37-R closes the reconciliation gap caused by Phase 5.6 pausing M36 mid-stream and later finding the capability/parser/scorer code already present in branch history. The next new Phase 6 implementation milestone is **M38 Insight Feedback Loop**; it should open with a T0 plan doc before code changes.
