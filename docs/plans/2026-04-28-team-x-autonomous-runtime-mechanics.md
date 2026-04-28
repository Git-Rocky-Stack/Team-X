# Team-X Autonomous Runtime Mechanics Implementation Plan

**Date:** 2026-04-28  
**Source audit:** [Paperclip benchmark autonomous-agent audit](../audits/2026-04-28-paperclip-benchmark-autonomous-agent-audit.md)  
**Runtime contract:** [Autonomous agent heartbeat contract](../runtime/autonomous-agent-heartbeat-contract.md)  
**Primary objective:** make autonomous external agents feel operationally real by adding Paperclip-grade runtime mechanics underneath Team-X's existing company, governance, context, artifact, and audit strengths.

## Summary

Team-X already has the stronger operating model: Strategia role accountability, planning/delegation/review tools, RAG and checkpointed memory, budget/approval depth, local-first Electron, Mission Control, portability, auditable artifacts, and tool-call logs.

The gap to close is external-agent execution mechanics:

1. documented heartbeat contract;
2. atomic task checkout and conflict behavior;
3. adapter contracts for execution, parsing, diagnostics, UI config, and CLI watching;
4. per-company runtime homes/workspaces;
5. encrypted secret references injected into runtime environments;
6. budget hard-stops tied to heartbeat execution;
7. import/export ergonomics for portable company templates.

This plan is P0-first. Bash, HTTP, and Codex are the reference runtimes: Bash/HTTP provide deterministic coverage through existing code paths; Codex proves the Paperclip-grade per-runtime home/workspace posture.

## Implementation Sequence

### Slice 1: Runtime Sessions, Heartbeats, And Checkouts

- Add durable `runtime_sessions`, `runtime_heartbeats`, and `ticket_checkouts` tables.
- Add shared types for runtime session status, heartbeat status, checkout status, and typed checkout outcomes.
- Add repos/services for session lifecycle, heartbeat recording, stale-session marking, checkout claim/release, conflict detection, and lease expiry.
- Keep the first slice backend-only except for typed IPC/event seams needed by later UI work.

Exit criteria:

- an external runtime execution can be represented as a live session;
- session heartbeat state can be persisted and queried;
- a ticket can have exactly one active checkout;
- two agents racing for one ticket get one winner and one deterministic conflict;
- stale sessions/checkouts can be marked without deleting history.

### Slice 2: Adapter Registry V2

- Replace thin command/HTTP branching with a typed runtime adapter registry.
- Adapter responsibilities: config schema, validation, execution, output parsing, diagnostics, cancellation, event normalization, and renderer config metadata.
- Migrate Bash and HTTP first, then add Codex with isolated home/session/workspace handling.
- Preserve `team-x-runtime-v1` payload compatibility unless a concrete adapter needs an extension.

Exit criteria:

- Bash, HTTP, and Codex run through one adapter contract;
- adapter diagnostics feed runtime session/heartbeat status;
- command failures, HTTP failures, parser failures, and cancellation emit normalized runtime events.

### Slice 3: Workspace Isolation And Secret References

- Add a runtime workspace manager under Team-X user data:
  - company scope;
  - employee scope;
  - runtime kind/profile scope;
  - `home`, `workspace`, `logs`, and `tmp` directories.
- Default Bash/HTTP/Codex execution to managed workspaces unless an operator explicitly configures an approved path.
- Add runtime profile secret refs for environment injection.
- Reject or flag inline sensitive runtime config keys ending in `apiKey`, `token`, `secret`, or `password`.
- Resolve secret refs only in the main process at execution time.

Exit criteria:

- external runtimes do not share mutable home/session state across companies;
- renderer never receives decrypted runtime secrets;
- exports redact local workspace paths and list missing secret requirements.

### Slice 4: Budget, Approval, Artifact, And Audit Wiring

- Gate runtime wake, checkout, and heartbeat continuation through budget governance.
- Write `budget-blocked` and `approval-blocked` run checkpoints against active sessions/checkouts.
- Require external runtime completion to create or reference artifacts before ticket closure.
- Normalize runtime events into existing event, tool-call, run, artifact, and approval surfaces.

Exit criteria:

- budget hard-stops are visible from runtime session state;
- stale or blocked work produces resumable checkpoints;
- runtime-created deliverables are reviewable artifacts, not just status changes.

### Slice 5: Mission Control, Autonomy UI, And Portability

- Surface runtime live/stale/offline state in Mission Control and Autonomy > Runtimes.
- Show active ticket checkouts, conflicts, stale leases, budget blocks, missing secrets, and adapter diagnostics.
- Extend company package previews with runtime adapter declarations, missing secrets, local path warnings, and workspace compatibility notes.
- Defer GitHub template import and remote/mobile monitoring until the P0 mechanics are stable.

Exit criteria:

- operators can understand who is working, what is claimed, what is stale, and what is blocked without reading logs;
- portable company packages preserve runtime intent without leaking secrets or machine-local paths.

## Test Plan

- Runtime session repo/service tests for create, heartbeat, status changes, stale marking, and company scoping.
- Ticket checkout tests for claim, already-owned, conflict, release, complete, block, lease expiry, and stale reclaim.
- Adapter tests for Bash, HTTP, and Codex validation/execution/parsing/cancellation/error diagnostics.
- Workspace tests proving per-company/per-employee isolation and export redaction.
- Secret-ref tests proving inline sensitive values are rejected and decrypted values stay main-process only.
- Budget tests proving runtime wake/checkout/heartbeat hard-stops create visible blockers/checkpoints.
- Integration tests proving external runtimes create sessions, claim tickets, emit heartbeats, produce artifacts, release checkouts, and recover stale state.
- Renderer tests for Mission Control/Autonomy runtime status, stale checkout alerts, budget-blocked states, missing secret callouts, and accessible controls.
- Portability tests for package export/import previews with adapter declarations, missing secrets, and local path compatibility warnings.

## Assumptions

- Team-X remains local-first with no required hosted account.
- Existing autonomy surfaces are extended, not replaced.
- Bash, HTTP, and Codex are the first reference runtimes.
- Runtime session/checkouts are durable history, not ephemeral UI-only state.
- Remote/mobile monitoring, GitHub template import UX, and benchmark dashboards are P1/P2 follow-ups.
