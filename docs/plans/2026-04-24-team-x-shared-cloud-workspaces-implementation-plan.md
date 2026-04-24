**Date:** 2026-04-24  
**Design reference:** [`2026-04-24-team-x-shared-cloud-workspaces-design.md`](./2026-04-24-team-x-shared-cloud-workspaces-design.md)  
**Primary objective:** ship the next Paperclip-gap bundle for Team-X: optional linked workspaces, hosted operator auth and invites, event-first sync seams, and visible shared/cloud posture without breaking local-first execution.

## Overview

This plan breaks the work into six slices:

1. `Cloud linkage foundation`
2. `Link / unlink operator flow`
3. `Hosted invite and membership bridge`
4. `Outbound event mirror and snapshots`
5. `Inbound action queue`
6. `Hosted operator surface and hardening`

The sequence keeps Team-X local-first while making shared/cloud workspaces real in controlled, testable stages.

---

## Slice 1: Cloud Linkage Foundation

### Goal

Introduce the durable metadata and typed contracts that all linked-workspace behavior depends on.

### Deliverables

- Add shared types for:
  - workspace link state
  - link metadata
  - sync cursors
  - sync snapshots
  - inbound cloud action envelopes
- Add durable company/workspace metadata for:
  - `cloudWorkspaceId`
  - `cloudTenantId`
  - `cloudLinkState`
  - `linkedDeviceId`
  - `lastSyncedCursor`
  - `lastSnapshotId`
  - `lastSyncAt`
  - `lastSyncError`
- Add validation utilities for link/action payloads.
- Add a local `CloudLinkService` abstraction even if the first version is desktop-only.

### Likely touchpoints

- `packages/shared-types/src/entities.ts`
- `packages/shared-types/src/ipc.ts`
- `apps/desktop/src/main/db/schema.ts`
- new migration under `apps/desktop/src/main/db/migrations/`
- `apps/desktop/src/main/db/repos/companies.ts`
- `apps/desktop/src/main/db/repos/settings.ts`
- new `apps/desktop/src/main/services/cloud-link-service.ts`

### Tests

- shared-type tests for link/action payload contracts
- migration/repo tests for link metadata persistence
- service tests for local link-state transitions

### Exit criteria

- Team-X has a durable linked-workspace contract
- no sync or auth flow depends on ad hoc renderer state

---

## Slice 2: Link / Unlink Operator Flow

### Goal

Make `Link Workspace` and `Unlink Workspace` visible, explicit product actions.

### Deliverables

- Add visible link-state cards to:
  - `Autonomy > Access`
  - `Settings > Portability`
- Add local start/complete/fail/unlink transitions in the link service.
- Add a desktop-side link shell with:
  - `Link Workspace`
  - `Unlink Workspace`
  - `Reconnect`
  - visible last sync and sync-health copy
- Add durable audit events for link/unlink lifecycle changes.

### Likely touchpoints

- `apps/desktop/src/main/services/cloud-link-service.ts`
- `apps/desktop/src/main/ipc/handlers.ts`
- `apps/desktop/src/preload/api.ts`
- `apps/desktop/src/renderer/src/features/autonomy/autonomy-view.tsx`
- `apps/desktop/src/renderer/src/features/settings/portability-section.tsx`
- `apps/desktop/src/renderer/src/hooks/`
- `packages/shared-types/src/events.ts`

### Tests

- link-state service tests
- renderer tests for linked/unlinked/degraded UX
- audit event tests for link lifecycle

### Exit criteria

- operators can explicitly link and unlink a workspace
- Team-X surfaces real linked-workspace posture instead of placeholder messaging

---

## Slice 3: Hosted Invite And Membership Bridge

### Goal

Turn shared/cloud invites into real hosted-workspace collaboration seams.

### Deliverables

- Add hosted invite records and statuses to the link service boundary.
- Extend operator-access logic so linked workspaces can distinguish:
  - local-only invites
  - hosted invites
  - hosted accepted memberships
- Sync accepted invite results into local operator rows and memberships.
- Preserve the local owner model after linking.
- Block unsupported ownership transitions cleanly.

### Likely touchpoints

- `apps/desktop/src/main/services/operator-access-service.ts`
- `apps/desktop/src/main/db/repos/operators.ts`
- `apps/desktop/src/main/ipc/handlers.ts`
- `apps/desktop/src/preload/api.ts`
- `apps/desktop/src/renderer/src/features/autonomy/autonomy-view.tsx`
- `apps/desktop/src/renderer/src/hooks/use-operators.ts`
- `packages/shared-types/src/entities.ts`
- `packages/shared-types/src/ipc.ts`

### Tests

- operator-access service tests for hosted invite acceptance and membership sync
- IPC tests for invite lifecycle actions
- renderer tests for hosted invite copy/state

### Exit criteria

- linked workspaces can model real hosted invites and accepted memberships
- operator identity remains understandable and local-owner-safe

---

## Slice 4: Outbound Event Mirror And Snapshots

### Goal

Publish a safe, recoverable shared-workspace mirror without table replication.

### Deliverables

- Add a local sync publisher that emits ordered workspace events.
- Add periodic sanitized snapshot assembly.
- Track acknowledged cursors and pending outbound queue length.
- Add retry/replay behavior from the last acknowledged cursor.
- Mirror initial event families:
  - approvals
  - artifacts
  - operator/membership changes
  - portability events
  - link lifecycle events

### Likely touchpoints

- new `apps/desktop/src/main/services/cloud-sync-service.ts`
- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/main/db/repos/events.ts`
- approval/artifact/operator services
- `packages/shared-types/src/events.ts`
- `packages/shared-types/src/entities.ts`

### Tests

- sync publisher tests for ordering and cursor advancement
- snapshot assembly tests with redaction coverage
- replay/recovery tests from snapshot plus later events

### Exit criteria

- linked workspaces can publish mirrored history and snapshots safely
- sync state is recoverable without raw full-table replication

---

## Slice 5: Inbound Action Queue

### Goal

Let cloud operators influence the workspace through typed, auditable actions.

### Deliverables

- Add inbound action storage and apply state.
- Support typed actions such as:
  - approval review
  - membership or invite action
  - sharing posture request
  - artifact acknowledgement
  - sync request
- Apply inbound actions locally through existing services instead of direct row mutation.
- Emit canonical resulting workspace events and audit rows.
- Surface blocked actions with exact failure reasons.

### Likely touchpoints

- `cloud-sync-service.ts`
- approval/operator/artifact services
- `apps/desktop/src/main/ipc/handlers.ts`
- `packages/shared-types/src/entities.ts`
- `packages/shared-types/src/events.ts`

### Tests

- inbound action application tests
- blocked-action tests for invalid or unsupported mutations
- audit/event tests proving canonical local event emission

### Exit criteria

- cloud-originated operator actions flow through typed local application
- Team-X avoids a generic remote mutation endpoint

---

## Slice 6: Hosted Operator Surface And Hardening

### Goal

Make linked workspaces understandable, trustworthy, and usable in real supervision scenarios.

### Deliverables

- Extend Team-X surfaces with:
  - link health
  - last sync
  - outbound queue count
  - inbound action count
  - degraded-state messaging
- Extend the User Guide for linked workspaces and hosted supervision.
- Add sharper error handling for:
  - expired auth
  - device mismatch
  - invalid cursor replay
  - blocked inbound actions
  - cloud unavailable / desktop unavailable posture
- Add source-guard tests for local-first and secret-boundary messaging.

### Likely touchpoints

- `apps/desktop/src/renderer/src/features/autonomy/`
- `apps/desktop/src/renderer/src/features/settings/`
- `apps/desktop/src/renderer/src/features/user-guide/`
- `apps/desktop/src/renderer/src/features/dashboard/`
- `apps/desktop/src/renderer/src/features/telemetry/`

### Tests

- renderer tests for degraded/offline/linked UX
- user-guide source guards
- integration tests around link-state transitions and sync failure visibility

### Exit criteria

- linked workspaces behave visibly and safely under normal and degraded conditions
- Team-X has a real shared/cloud workspace story without sacrificing local-first operation

---

## Recommended Execution Notes

- Keep unlinked workspaces fully first-class. Linked/cloud behavior is additive.
- Do not mirror secrets or local authority automatically.
- Prefer typed domain actions over generic sync mutations.
- Desktop remains authoritative for desktop-owned domains in Wave 1.
- Cloud remains authoritative for hosted identity and invite/session state.
- Treat snapshots as sync/bootstrap artifacts, not backup replacements.
