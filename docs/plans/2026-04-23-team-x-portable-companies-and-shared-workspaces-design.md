> **Status:** Drafted 2026-04-23 from the Paperclip gap follow-through after the long-run execution/memory bundle.
> **Scope:** Add first-class `Portable Companies And Shared Workspaces` to Team-X: company-scoped export/import, reusable company templates, and operator-sharing posture built on the existing local/invited/cloud seams.
> **Primary driver:** Team-X now has strong autonomy, memory, budgets, approvals, artifacts, and runtime posture, but it still lacks the reusable whole-company story and explicit sharing workflow that Paperclip makes legible.

---

## 1. Problem Statement

Team-X already has destructive full-app backup/restore and a solid operator/access foundation, but those primitives are not yet productized into workspace portability.

Current gaps:

1. backup/restore is app-wide, coarse, and operationally heavy rather than workspace-scoped
2. there is no first-class company export/import package
3. there is no reusable company template system for cloning proven operating models
4. the `local / invited / cloud` auth modes exist, but there is no product workflow for moving a workspace toward shared operation
5. there is no import preview, compatibility check, or trust model for portable workspace bundles

The result is that Team-X can run a serious company, but it cannot yet package that company cleanly for reuse, migration, or eventual sharing.

---

## 2. Goals

- Add company-scoped export/import independent from destructive full backup restore.
- Add reusable `Company Templates` that capture operating model without dragging along volatile history.
- Make workspace sharing posture visible and editable from the product.
- Preserve local-first defaults while designing transportable package metadata for later cloud/shared flows.
- Reuse the current operators, autonomy, extensions, routines, budgets, and settings foundations rather than inventing parallel models.
- Add trust/compatibility checks so imported bundles are inspectable before they mutate local state.

---

## 3. Non-goals

- No real-time sync engine in this bundle.
- No hosted auth backend or invitation-email delivery in this wave.
- No full app-level backup replacement; backup/restore remains for disaster recovery.
- No automatic secrets export. Provider keys, tokens, and other sensitive credentials stay out of portable bundles.
- No attempt to merge two existing companies in one pass. Initial imports should create a new company/workspace copy.

---

## 4. Product Decisions

### 4.1 Portability is company-scoped, not app-scoped

Backups remain full-app disaster recovery. Portability should introduce a smaller, deliberate artifact:

- `Company Package`

This package is the unit for:

- exporting one workspace
- importing one workspace copy
- publishing a reusable template
- moving toward shared/cloud-ready posture later

### 4.2 Export and template are related, but not identical

The bundle should support two operator-facing modes:

- `Export Workspace`
  - preserves current company configuration and selected live state
- `Create Template`
  - strips volatile activity and captures a reusable blueprint

Both modes should use the same manifest family so import, preview, and compatibility logic stay unified.

### 4.3 Secrets never travel in packages

Portable companies must exclude:

- provider API keys
- keychain entries
- secret environment values
- machine-specific absolute file paths where possible

Instead, imports should produce:

- explicit missing-secret warnings
- a post-import checklist
- redacted manifest fields that show what needs reconfiguration

### 4.4 Sharing posture belongs to the workspace, not only to settings

The existing operator foundation already models:

- operator identities
- company memberships
- `local`, `invited`, and `cloud` auth modes

This bundle should make that visible as `Workspace Sharing Posture` with:

- current mode
- readiness state
- export/share eligibility
- invite placeholders and ownership expectations

### 4.5 Imports should be safe, previewable, and non-destructive

The initial import flow should:

- validate package version
- show included sections
- show redactions / missing dependencies
- let the operator rename the incoming company
- create a new workspace copy rather than overwrite an existing one

Overwrite/merge flows can come later.

### 4.6 Templates should favor operating model over historical clutter

Templates should primarily carry:

- company settings and theme
- mission / values
- employees and org structure
- runtime profiles and bindings
- routines
- budgets
- approvals policy defaults
- extensions / skills / MCP posture
- authority defaults
- optional starter projects, goals, and ticket scaffolds

Templates should exclude or strip by default:

- historical messages
- run history
- audits
- volatile approvals
- completed routine runs
- old artifacts unless explicitly marked as starter assets

### 4.7 Portable package metadata must be cloud-ready now

Even without sync in this bundle, package manifests should include stable identifiers for future sharing:

- `workspaceOriginId`
- `packageId`
- `exportedByOperatorId`
- `sharingMode`
- `sourceAppVersion`
- `packageVersion`

That gives later cloud/shared work a durable identity seam instead of one more migration.

---

## 5. Recommended User Experience

## 5.1 New Settings surface: `Portability`

Add a new Settings section:

- `Portability`

This section should sit near `Backup & Restore`, but it is a different product surface with distinct messaging:

- `Backups` are disaster recovery
- `Portability` is reuse, migration, and sharing readiness

Recommended cards:

- `Export Workspace`
- `Import Package`
- `Templates`
- `Sharing Posture`

## 5.2 Export flow

Operators choose:

- `Workspace Export`
- `Template Export`

Export options should include clear toggles such as:

- include starter projects / goals
- include open tickets
- include autonomy configuration
- include extensions and authority posture
- include starter assets from vault

The result should be one portable file plus a human-readable manifest summary.

## 5.3 Import flow

The import flow should show:

- package identity
- Team-X version compatibility
- sections included
- redactions
- missing secrets
- expected workspace auth mode
- whether the import is a template or a full workspace export

The operator then chooses:

- new company name
- slug
- theme / branding override optional
- whether to immediately open the imported workspace

## 5.4 Templates experience

Operators should be able to:

- export current workspace as template
- install a local template package
- browse built-in templates later
- create a new company from template

Templates should feel like reusable operating systems for a company, not raw JSON dumps.

## 5.5 Sharing posture experience

`Autonomy > Access` should gain a clearer workspace-sharing block that explains:

- `Local`
  - single-machine local owner
- `Invited`
  - workspace is prepared for multiple operators but still local-first
- `Cloud`
  - workspace is prepared for future hosted/shared control plane

This bundle only needs posture and readiness, not a live remote auth backend.

---

## 6. Architecture

### 6.1 CompanyPackage manifest

Recommended top-level structure:

- `manifest`
- `company`
- `employees`
- `org`
- `autonomy`
- `extensions`
- `projects`
- `goals`
- `starterAssets`

Suggested manifest fields:

- `packageId`
- `packageVersion`
- `mode` (`workspace-export` | `template`)
- `workspaceOriginId`
- `companyOriginId`
- `sourceAppVersion`
- `exportedAt`
- `exportedByOperatorId`
- `sharingMode`
- `sections`
- `redactions`
- `compatibility`

### 6.2 Portability service layer

Add a dedicated service family:

- `CompanyPortabilityService`
- `CompanyTemplateService`

Responsibilities:

- assemble export snapshot from existing repos/services
- normalize ids and manifest structure
- redact secrets and machine-local paths
- validate imports
- create new workspace copies from packages
- create template-derived workspaces with fresh ids

### 6.3 Workspace identity foundation

Introduce stable ids that survive export/import:

- `workspaceOriginId`
- `companyOriginId`

Imported copies should also get local runtime ids, but preserve origin metadata so later sharing/sync can reason about ancestry.

### 6.4 Import planner

Imports should not write directly from raw package JSON into repos.

Add an `Import Planner` step that computes:

- compatibility warnings
- renamed ids
- stripped sections
- missing dependencies
- post-import tasks

This keeps the first import flow inspectable and testable.

### 6.5 Sharing posture model

Extend company settings or a closely related workspace metadata record with:

- current sharing mode
- export eligibility
- operator readiness
- missing requirements for invited/cloud posture

This should compose with the existing operator membership model, not replace it.

---

## 7. Recommended Data Boundaries

### Export by default

- company identity and settings
- employees and org edges
- runtime profiles and bindings
- routines
- budget policies
- extension summaries, assignments, authority grants
- starter goals/projects/tickets marked as reusable
- workspace sharing posture
- user-guide onboarding defaults where relevant

### Exclude or redact by default

- provider secrets
- historical chats/messages
- run ledger history
- audit event history
- resolved approval items
- transient runtime health rows
- machine-specific vault absolute paths

### Optional later

- artifact packs
- selected knowledge/vault starter assets
- curated prompt/history excerpts

---

## 8. Testing Expectations

- package schema round-trip tests
- export snapshot tests over realistic seeded workspaces
- import planner tests for compatibility and redaction behavior
- template-instantiation tests proving fresh ids + preserved origin metadata
- renderer tests for portability settings cards and preview states
- access/autonomy source guards for sharing posture language

---

## 9. Recommended Sequence

1. `Package schema and origin metadata foundation`
2. `Company export service`
3. `Import planner and new-company import flow`
4. `Template export/install/create flow`
5. `Sharing posture UI and operator-readiness wiring`

This keeps the bundle local-first, shippable, and aligned with the remaining Paperclip gaps without prematurely building a sync engine.
