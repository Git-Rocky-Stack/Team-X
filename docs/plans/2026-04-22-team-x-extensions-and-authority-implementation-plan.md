**Date:** 2026-04-22  
**Design reference:** [`2026-04-22-team-x-extensions-and-authority-design.md`](./2026-04-22-team-x-extensions-and-authority-design.md)  
**Primary objective:** ship a unified `Extensions & Authority` control plane without destabilizing the existing provider, MCP, and employee-role runtime.

## Overview

This plan breaks the work into six slices:

1. `Schema and authority foundation`
2. `Main-process registry and resolver`
3. `Settings UI shell`
4. `MCP migration into the new control plane`
5. `Skill install and assignment`
6. `Validation and hardening`

The recommended first release does not wait on marketplace infrastructure. It ships local-first installs and a clean path for GitHub/marketplace to land afterward.

---

## Slice 1: Schema And Authority Foundation

### Goal

Add the durable data model for extensions, assignments, and authority while preserving existing runtime tables.

### Deliverables

- Add `extensions` table.
- Add `skill_assignments` table.
- Add `authority_grants` table.
- Add `authority_requests` table.
- Add shared-types definitions for:
  - autonomy mode
  - extension summary/detail shapes
  - authority grant types
  - assignment shapes
- Add settings key typing for `extensions_autonomy_mode`.

### Likely touchpoints

- `apps/desktop/src/main/db/schema.ts`
- new migration under `apps/desktop/src/main/db/migrations/`
- new repos under `apps/desktop/src/main/db/repos/`
- `packages/shared-types/src/ipc.ts`
- `packages/shared-types/src/entities.ts` if shared entity shapes are needed

### Tests

- schema/repo round-trip tests
- migration tests
- authority-grant serialization tests

### Exit criteria

- new tables migrate cleanly
- no existing MCP/provider flows regress
- typed IPC contracts compile cleanly

---

## Slice 2: Main-Process Registry And Resolver

### Goal

Add the main-process services that make the new model real.

### Deliverables

- Build `extensions-registry-service`.
- Build `authority-resolver-service`.
- Add install/update/enable/disable/list handlers for extensions.
- Add company-default and employee-override authority handlers.
- Add autonomy-policy read/write handlers.

### Likely touchpoints

- new services under `apps/desktop/src/main/services/`
- `apps/desktop/src/main/ipc/handlers.ts`
- `apps/desktop/src/main/ipc/register.ts`
- `apps/desktop/src/preload/api.ts`
- `apps/desktop/src/main/index.ts`

### Tests

- service unit tests for:
  - effective grant resolution
  - precedence of company vs employee overrides
  - autonomy-policy decisions
- IPC handler tests

### Exit criteria

- renderer can query and mutate extension/authority state through IPC
- effective authority can be computed deterministically for an employee

---

## Slice 3: Settings UI Shell

### Goal

Create the visible `Extensions & Authority` settings section and wire it to the new IPC surface.

### Deliverables

- Add `ExtensionsSection` to [settings-view.tsx](../../apps/desktop/src/renderer/src/features/settings/settings-view.tsx).
- Add UI cards for:
  - autonomy policy
  - installed skills
  - installed MCP servers
  - authority matrix
- Add empty/loading/error states.
- Add obvious install actions:
  - `Install Skill`
  - `Import MCP`
  - `Grant Path`

### Likely touchpoints

- `apps/desktop/src/renderer/src/features/settings/settings-view.tsx`
- new files under `apps/desktop/src/renderer/src/features/settings/`
- `apps/desktop/src/renderer/src/hooks/`
- `apps/desktop/src/renderer/src/styles/globals.css`

### Tests

- source-string or render tests for section composition
- hook tests for query/mutation state
- authority-form validation tests

### Exit criteria

- the new section is visible and functional
- autonomy mode is user-selectable from Settings
- company and employee authority can be inspected from the UI

---

## Slice 4: MCP Migration Into The New Control Plane

### Goal

Wrap the existing MCP runtime in the new extension model instead of inventing a second MCP management path.

### Deliverables

- Bridge existing `mcp_servers` rows into `extensions` metadata.
- Add import flows for:
  - manual stdio/sse entry
  - built-in templates
- Surface health, enablement, and requested authority in the UI.
- Route MCP tool checks through `authority-resolver-service` before `mcpHost.callTool(...)`.

### Likely touchpoints

- `apps/desktop/src/main/services/mcp-host.ts`
- `apps/desktop/src/main/db/repos/mcp-servers.ts`
- new extension registry service
- settings renderer components

### Tests

- MCP bridging tests
- authority enforcement tests at `mcp-host` boundary
- enable/disable flow tests

### Exit criteria

- every MCP server visible in Settings has provenance and authority metadata
- MCP runtime still uses the single main-process host
- denied capability/path grants block runtime calls correctly

---

## Slice 5: Skill Install And Assignment

### Goal

Ship the first meaningful skills path with maximum flexibility in source, but a narrow enough runtime to be safe.

### Deliverables

- Local skill install flow.
- GitHub-backed install flow.
- Skill assignment model:
  - workspace enabled
  - employee enabled
  - employee disabled override
- Skill health validation:
  - manifest present
  - entrypoint valid
  - requested authority parsed
- Phase 1 runtime contribution:
  - prompt snippets
  - instruction bundles
  - declarative tool recommendations

### Likely touchpoints

- new skill install service under `apps/desktop/src/main/services/`
- app-data extension storage helper
- renderer install dialogs
- employee detail/settings surfaces if assignment editing lives there
- orchestrator or prompt assembly seam where installed skills are materialized

### Tests

- install-flow tests for local and GitHub sources
- assignment precedence tests
- prompt-materialization tests
- invalid manifest / unhealthy skill tests

### Exit criteria

- a user can install a skill and see it assigned to the workspace or an employee
- the skill contributes runtime instructions predictably
- bad installs fail visibly without breaking the whole runtime

---

## Slice 6: Validation And Hardening

### Goal

Make the control plane trustworthy enough to expand later.

### Deliverables

- Add path normalization and Windows-safe authority matching.
- Add audit events for:
  - install
  - enable/disable
  - grant approved/denied
  - authority violation
- Verify error states across:
  - missing local folders
  - GitHub fetch failures
  - unhealthy MCP servers
  - denied path grants
- Add migration/backfill coverage for existing MCP rows.

### Likely touchpoints

- extension service tests
- authority resolver tests
- audit/event emission
- telemetry or audit renderer surfaces if extension actions should be visible there

### Tests

- Windows path casing/normalization tests
- audit event tests
- backfill tests for existing MCP rows
- renderer error-state tests

### Exit criteria

- the product explains partial or denied extension states clearly
- authority checks are deterministic on Windows paths
- existing users with MCP rows upgrade cleanly

---

## Recommended Task Breakdown

### T1: Add schema and IPC contracts

- migrations
- repos
- shared-types additions
- preload bridge

### T2: Build registry and authority services

- extension listing
- autonomy settings
- effective authority resolver

### T3: Add the Settings section shell

- visible section
- queries/mutations
- empty/loading/error states

### T4: Wrap MCP into the new surface

- bridge old rows
- add health + trust + authority views
- enforce authority at runtime

### T5: Ship local-first skills

- local install
- GitHub install
- workspace/employee assignment
- prompt contribution path

### T6: Harden and prepare for marketplace

- path normalization
- audit
- upgrade/backfill coverage
- signed-manifest shape

---

## Verification Strategy

At the end of each slice:

- run focused repo/service tests for the touched area
- run `pnpm -F @team-x/desktop typecheck`
- run `pnpm -F @team-x/desktop build`

At the end of the full pass:

- run touched renderer + main-process tests
- run `git diff --check`
- live-test:
  - install a local skill
  - import an MCP entry
  - deny a path grant
  - verify the denied action is blocked and explained

---

## Recommended First Implementation Slice

Start with `Schema and authority foundation` plus the `Settings UI shell`.

Why this first:

- it gives the product a visible control surface quickly
- it avoids deep runtime risk on day one
- it lets MCP and skills land on a stable, typed base instead of accumulating more one-off settings

After that, the next best slice is `MCP migration into the new control plane`, because MCP already has a working runtime path that can prove the authority model before skills expand it further.
