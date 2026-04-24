> **Status:** Drafted 2026-04-24 from the portability follow-through after shared operator invite acceptance.
> **Scope:** Add first-class `Shared And Cloud Workspaces` to Team-X: optional hosted workspace linking, cloud-backed operator auth, event-first sync, remote supervision, and explicit offline/degraded behavior.
> **Primary driver:** Team-X now has strong local-first autonomy, portability, invites, and operator foundations, but it still lacks a real hosted/shared workspace model comparable to Paperclip's public collaboration story.

---

## 1. Problem Statement

Team-X now models operators, invites, portability, workspace origins, and sharing posture, but shared/cloud collaboration is still mostly posture and local placeholders.

Current gaps:

1. `local / invited / cloud` modes exist, but `cloud` is not yet a real linked-workspace product flow
2. operator invites are local-first and do not yet resolve through a hosted identity/auth system
3. there is no event mirror or snapshot sync layer between desktop workspaces and any hosted control plane
4. remote operators cannot yet review approvals, artifacts, or audit history from a shared control plane
5. failure behavior for shared operation is not yet productized into visible link, sync, and degraded-state surfaces

The result is that Team-X is strong as a local-first desktop operating system, but it still lacks a real hosted collaboration story.

---

## 2. Goals

- Preserve local-first, zero-login default behavior for unlinked workspaces.
- Add an explicit `Linked Workspace` posture that connects a local workspace to Team-X Cloud.
- Make hosted operator auth, invites, and membership posture real for linked workspaces.
- Add an event-first, snapshot-assisted sync seam that is safe, auditable, and recoverable.
- Keep local desktop authoritative for execution-owned workspace state in Wave 1.
- Make offline, paused-sync, and degraded states visible and safe instead of silent.
- Reuse the current operators, portability, approvals, artifacts, and autonomy foundations instead of inventing a separate collaboration model.

---

## 3. Non-goals

- No full multi-primary realtime merge engine in this bundle.
- No automatic cloud execution takeover for local agents, files, or authority in Wave 1.
- No secret replication by default. Provider keys, local MCP credentials, filesystem grants, and launcher commands remain local-only.
- No generic remote mutation API for arbitrary workspace rows.
- No requirement that Team-X Cloud exist for basic workspace operation. Unlinked local mode remains first-class.

---

## 4. Product Decisions

### 4.1 Shared/cloud is a second workspace posture, not a second product

Team-X should support two operator-facing workspace postures:

- `Unlinked workspace`
  - today's local-first behavior
  - zero-login
  - desktop owns execution and state
- `Linked workspace`
  - same workspace model, now connected to Team-X Cloud
  - hosted operator auth and invite flow
  - shared approvals, artifacts, audit visibility, and sync posture

This keeps Team-X coherent instead of splitting it into separate local and cloud products.

### 4.2 Ownership is explicit and domain-based

Wave 1 should avoid ambiguous truth.

- `Desktop is authoritative` for:
  - employees
  - tickets
  - projects
  - routines
  - runtime bindings
  - budgets
  - authority
  - local artifacts
  - in-flight runs
  - file-backed execution context
- `Cloud is authoritative` for:
  - hosted operator identity
  - sessions
  - invite redemption
  - tenant/workspace linkage
  - hosted membership posture

Cloud should not directly overwrite desktop-owned workspace rows in Wave 1.

### 4.3 Sync is event-first and snapshot-assisted

Sync should not start as table replication.

Recommended model:

- desktop publishes ordered workspace events
- desktop publishes periodic sanitized snapshots
- cloud stores events and snapshots, tracks acknowledged cursors, and mirrors workspace state for supervision
- cloud-originated operator actions travel back down as typed pending actions for desktop application

This gives Team-X a durable sync spine without forcing full merge semantics.

### 4.4 Hosted collaboration starts with operators, not with cloud execution

Wave 1 should focus on the human collaboration layer first:

- hosted operator auth
- hosted invites
- membership sync
- shared approvals
- shared audit visibility
- shared artifact visibility

Desktop remains the execution host by default. Cloud execution can be a later bundle.

### 4.5 Secrets stay local unless an explicit later feature says otherwise

Linking a workspace must not silently grant cloud access to:

- provider API keys
- local MCP secrets
- filesystem grants
- launcher commands
- machine-specific file paths

Cloud can mirror posture and missing-secret warnings, but not raw secret values.

### 4.6 Linking and unlinking are explicit workspace actions

`Link Workspace` and `Unlink Workspace` should be visible, owner-controlled actions from:

- `Autonomy > Access`
- `Settings > Portability`

Linking should create durable cloud metadata; unlinking should stop sync cleanly while preserving the full local workspace.

### 4.7 Failure behavior must be visible and conservative

If cloud is unavailable:

- linked workspaces still open locally
- sync shows `paused` or `degraded`
- remote actions queue instead of failing silently

If desktop is unavailable:

- cloud operators can inspect mirrored history and queued actions
- any action requiring local application is marked `waiting for linked desktop`

---

## 5. Recommended User Experience

## 5.1 New workspace link surface

Add visible link state to:

- `Autonomy > Access`
- `Settings > Portability`

Recommended status cards:

- `Unlinked`
- `Linking`
- `Linked`
- `Sync paused`
- `Sync degraded`
- `Archived / unlinked`

Status should show:

- link state
- cloud workspace label
- last sync time
- outbound queue count
- inbound action count
- exact last failure reason when degraded

## 5.2 Link workflow

Recommended flow:

1. local owner selects `Link Workspace`
2. desktop opens Team-X Cloud auth
3. cloud creates or selects the tenant/workspace
4. desktop receives:
   - `cloudTenantId`
   - `cloudWorkspaceId`
   - `deviceId`
   - sync credentials
   - initial cursor state
5. desktop stores credentials locally and begins initial publish/bootstrap

## 5.3 Unlink workflow

Unlink should:

- require explicit confirmation
- revoke cloud sessions/tokens locally
- stop sync
- preserve the local workspace intact
- mark the cloud side archived/read-only instead of deleting it silently

## 5.4 Hosted invite workflow

Linked workspaces should replace local placeholder-only invites with hosted invite records:

- owner/admin creates invite
- cloud delivers and tracks invite state
- accepted invite produces a hosted operator identity
- sync materializes or updates the corresponding local operator membership

Local owner remains present even after linking.

## 5.5 Remote supervision workflow

Wave 1 cloud operators should be able to:

- inspect approvals
- inspect artifacts and outcomes
- inspect mirrored audit/event history
- inspect workspace sync health
- queue typed governance actions

Those actions should appear locally as pending inbound actions until the desktop applies them.

---

## 6. Architecture

### 6.1 Link metadata

Extend company/workspace metadata with fields such as:

- `cloudWorkspaceId`
- `cloudTenantId`
- `cloudLinkState`
- `linkedDeviceId`
- `lastSyncedCursor`
- `lastSnapshotId`
- `lastSyncAt`
- `lastSyncError`

These belong with workspace/company metadata, not inside arbitrary renderer-only state.

### 6.2 Device identity

Each linked desktop instance should have a stable `deviceId` so the cloud control plane can reason about:

- current linked host
- reconnects
- duplicate devices
- replay origin

Wave 1 can assume one primary linked desktop per workspace even if multiple viewers exist later.

### 6.3 Outbound sync model

Desktop publishes:

- typed workspace events
- periodic sanitized snapshots
- cursor acknowledgements

Suggested initial event families:

- operator membership changes
- approval events
- budget policy events
- routine events
- artifact events
- portability events
- link lifecycle events

### 6.4 Inbound action model

Cloud should emit only typed actions, not arbitrary row mutations.

Initial action families:

- approval review request
- invite or membership action
- sharing posture update request
- sync request
- artifact acknowledgement or review action

Desktop applies the action, emits canonical resulting workspace events, and sync remains auditable.

### 6.5 Snapshot model

Snapshots should be:

- sanitized
- company-scoped
- versioned
- recoverable by cursor

They are not backups. They are sync/bootstrap checkpoints for linked workspaces.

### 6.6 Secrets and authority boundary

Cloud may know:

- that a workspace depends on a provider, extension, or MCP server
- that a secret is missing locally
- that an authority grant exists in posture form

Cloud may not receive secret values or local filesystem power by default.

---

## 7. Failure Handling And Recovery

- If sync publish fails, retain outbound events locally and surface the exact failure.
- If inbound action apply fails, mark the action blocked with the exact reason and keep it auditable.
- If cursor replay fails, recover from the last acknowledged snapshot plus later events.
- If desktop/cloud posture drifts, desktop wins for desktop-owned domains and cloud wins for identity-owned domains.
- If auth expires, linked workspace remains locally operable with visible re-auth requirement.

---

## 8. Testing Strategy

- shared-type validation tests for link state, sync cursors, and action envelopes
- migration/repo tests for durable link metadata
- service tests for link lifecycle, cursor advancement, snapshot recovery, and inbound action application
- renderer tests for linked/unlinked/degraded status copy and workspace actions
- integration tests proving desktop-owned rows are never silently overwritten by cloud-originated mutations

---

## 9. Recommended Delivery Order

1. `Cloud linkage foundation`
2. `Link / unlink operator flow`
3. `Hosted invite and membership bridge`
4. `Outbound event mirror and snapshots`
5. `Inbound action queue`
6. `Hosted operator surface`

This keeps the bundle local-first, shippable, and aligned with the remaining Paperclip gaps without jumping straight into full merge-heavy collaboration.
