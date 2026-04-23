**Date:** 2026-04-23  
**Design reference:** [`2026-04-23-team-x-portable-companies-and-shared-workspaces-design.md`](./2026-04-23-team-x-portable-companies-and-shared-workspaces-design.md)  
**Primary objective:** ship the next Paperclip-gap bundle for Team-X: workspace-scoped portability, reusable company templates, and visible sharing posture built on the current operator foundation.

## Overview

This plan breaks the work into six slices:

1. `Package schema and origin foundation`
2. `Workspace export`
3. `Import planner and new-company import`
4. `Template workflows`
5. `Sharing posture and operator readiness`
6. `UX polish, guide, and hardening`

The sequence intentionally ships useful local portability before any heavier shared/cloud mechanics.

---

## Slice 1: Package Schema And Origin Foundation

### Goal

Introduce the shared package contracts and stable origin metadata that later export/import/template flows depend on.

### Deliverables

- Add shared types for:
  - `CompanyPackageManifest`
  - `CompanyPackage`
  - `CompanyPackageMode`
  - `CompanyImportPreview`
  - sharing posture/readiness summaries
- Add durable origin metadata to company/workspace records or closely related settings:
  - `workspaceOriginId`
  - `companyOriginId`
  - sharing posture fields
- Add package validation utilities.

### Likely touchpoints

- `packages/shared-types/src/entities.ts`
- `packages/shared-types/src/ipc.ts`
- `apps/desktop/src/main/db/schema.ts`
- new migration under `apps/desktop/src/main/db/migrations/`
- `apps/desktop/src/main/db/repos/companies.ts`
- `apps/desktop/src/main/db/repos/settings.ts`

### Tests

- shared-type/schema tests for package contracts
- migration/repo tests for origin metadata persistence
- validation tests for malformed package manifests

### Exit criteria

- Team-X has a stable company-package contract and persistent origin metadata
- no export/import flow depends on backup restore

---

## Slice 2: Workspace Export

### Goal

Create a real company-scoped export path independent from full-app backup.

### Deliverables

- Add `CompanyPortabilityService.exportCompany`.
- Support export modes:
  - `workspace-export`
  - `template`
- Assemble package contents from current repos/services:
  - company settings
  - employees/org
  - autonomy config
  - extensions/authority posture
  - optional starter projects/goals/tickets
- Redact secrets and emit a manifest summary.
- Add IPC + preload export entry points.

### Likely touchpoints

- new `apps/desktop/src/main/services/company-portability-service.ts`
- `apps/desktop/src/main/ipc/handlers.ts`
- `apps/desktop/src/preload/api.ts`
- related repos under `apps/desktop/src/main/db/repos/`

### Tests

- export snapshot tests with seeded realistic workspace data
- redaction tests for providers/secrets
- manifest summary tests

### Exit criteria

- operators can export one workspace as a portable package
- the package excludes secrets and destructive global state

---

## Slice 3: Import Planner And New-Company Import

### Goal

Add safe, previewable import that creates a new workspace copy.

### Deliverables

- Add `CompanyPortabilityService.previewImport`.
- Add `CompanyPortabilityService.importAsNewCompany`.
- Validate:
  - package version
  - source version compatibility
  - included sections
  - missing dependencies
  - redactions / post-import tasks
- Create imported companies with fresh local ids while preserving origin metadata.
- Add IPC/preload hooks for preview + import.

### Likely touchpoints

- `company-portability-service.ts`
- `apps/desktop/src/main/ipc/handlers.ts`
- `apps/desktop/src/preload/api.ts`
- company/employee/org/autonomy repos

### Tests

- import preview tests for warnings and compatibility results
- import execution tests for fresh ids + preserved origin ids
- failure tests for malformed packages and unsupported versions

### Exit criteria

- Team-X can safely import a package into a new workspace without overwriting existing data
- operators can inspect the import before applying it

---

## Slice 4: Template Workflows

### Goal

Make reusable company templates a first-class operator workflow.

### Deliverables

- Add template-flavored export UX.
- Add local template install/list flows.
- Add create-company-from-template flow.
- Strip volatile state from template packages by default.
- Support optional starter assets where practical.

### Likely touchpoints

- `company-portability-service.ts`
- new renderer portability/template components
- `apps/desktop/src/renderer/src/features/settings/`
- company creation flow

### Tests

- template export tests proving volatile-state stripping
- template create flow tests
- source guards for template UI language

### Exit criteria

- operators can reuse a Team-X operating model as a new workspace template
- templates feel distinct from raw exports

---

## Slice 5: Sharing Posture And Operator Readiness

### Goal

Expose workspace sharing readiness using the current local/invited/cloud operator seams.

### Deliverables

- Add a visible `Sharing Posture` surface.
- Surface:
  - current auth mode
  - operator count and role posture
  - export/share readiness
  - missing requirements for invited/cloud posture
- Extend `Autonomy > Access` to reflect workspace sharing state.
- Add Settings `Portability` messaging that explains local, invited, and cloud posture.

### Likely touchpoints

- `apps/desktop/src/main/services/operator-access-service.ts`
- `apps/desktop/src/renderer/src/features/autonomy/autonomy-view.tsx`
- new renderer portability settings section
- `packages/shared-types/src/entities.ts`

### Tests

- access/autonomy renderer tests
- operator-readiness service tests
- source guards for posture language and actions

### Exit criteria

- Team-X presents a real sharing-readiness story without requiring sync implementation
- operator posture is visible and transport-aware

---

## Slice 6: UX Polish, Guide, And Hardening

### Goal

Make portability legible, safe, and learnable for real operators.

### Deliverables

- Add a dedicated Settings `Portability` section.
- Add import/export progress, errors, and manifest preview states.
- Extend User Guide with portability and sharing guidance.
- Add audit coverage for export/import/template actions.
- Tighten edge cases:
  - missing starter assets
  - unsupported package versions
  - incompatible auth posture
  - duplicate slugs

### Likely touchpoints

- `apps/desktop/src/renderer/src/features/settings/`
- `apps/desktop/src/renderer/src/features/user-guide/`
- `apps/desktop/src/renderer/src/features/autonomy/`
- `apps/desktop/src/main/db/repos/audit.ts`
- `packages/shared-types/src/events.ts`

### Tests

- renderer tests for import/export/template UX
- user-guide source guards
- audit event tests
- focused end-to-end portability flow tests when practical

### Exit criteria

- portability and sharing are visible product features instead of hidden maintenance tasks
- operators can understand what will move, what will not, and what needs reconfiguration

---

## Recommended Execution Notes

- Do not overload the existing backup flow. Keep backup/restore and workspace portability distinct in the UI and service layer.
- Prefer additive package assembly/import services over one-off serializer code in IPC handlers.
- Keep imports non-destructive in the first shipping pass.
- Secrets must remain redacted even in template mode.
- Preserve local-first defaults; shared/cloud should remain posture and metadata until a dedicated sync/auth bundle is approved.

---

## Suggested First Implementation Pair

The clean first implementation pass is:

1. `Package schema and origin foundation`
2. `Workspace export`

That gives Team-X an immediately valuable portability artifact while keeping the first risk contained to schema, manifests, and one-way package assembly.
