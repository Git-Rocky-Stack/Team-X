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

## P1 Continuation

### P1.3 Autonomy Doctor

Status: shipped as the first P1 follow-through slice.

- Added a typed Autonomy Doctor report contract shared across main, preload, renderer, and CLI.
- Added `createAutonomyDoctorService` for database integrity, migration-table presence, backup posture, runtime profile health, runtime secret refs, active sessions, active checkouts, workspace paths, MCP health, provider readiness, and budget blockers.
- Added Autonomy > Doctor as the operator-facing entry point.
- Added `pnpm autonomy:doctor` for JSON support reports against the default or supplied SQLite database.

Exit criteria:

- operators can run one workflow before unattended runtime work;
- the report is deterministic and JSON-ready;
- support can reproduce the core report from the CLI even when the app cannot be launched.

### P1.4 Template Marketplace Workflow

Status: shipped as the second P1 follow-through slice.

- Added package-source resolution for local paths, GitHub blob/raw URLs, and GitHub shorthand refs.
- Extended import preview with source provenance, structured missing-secret rows, and deterministic dry-run plan actions.
- Added missing-secret binding from the preview workflow into the OS keychain for bindable runtime `apiKey` refs.
- Kept install/import non-destructive: templates land in the local library, and workspace package imports create a fresh company with remapped local ids.
- Documented the operator workflow in `docs/runtime/template-marketplace.md`.

Exit criteria:

- operators can source template packages from disk or GitHub;
- operators can dry-run import/install impact before mutating local state;
- runtime secret gaps are visible and bindable without leaking package secrets into disk-backed state.

### P1.5 External Runtime Audit Normalization

Status: shipped as the third P1 follow-through slice.

- Added a shared normalized `runtime.*` event vocabulary for session start, heartbeat, checkout claim/conflict, execution start/output/failure, artifact creation, stale sessions, and recovered sessions.
- Added a runtime audit normalizer that emits into the existing DB-backed event bus, mirrors run-scoped runtime events into the tool-call log, and keeps run/thread/ticket/session provenance on every payload.
- Added runtime output artifacts (`runtime-output` sourced from `runtime-execution`) so successful external runtime deliverables are reviewable artifacts, not only chat text.
- Wired external Bash/HTTP/Codex-style adapters through the normalizer while preserving the existing session, heartbeat, checkout, workspace, secret-ref, and budget hard-stop behavior.
- Added stale-session reaping to runtime operations snapshots so Mission Control sees stale runtime state and the audit trail records `runtime.session.stale`; stale sessions can be explicitly recovered through the session service.
- Documented the contract in `docs/runtime/external-runtime-audit-normalization.md`.

Exit criteria:

- every external runtime execution emits normalized runtime events;
- checkout conflicts and budget/runtime failures are audit-visible;
- run-scoped runtime events are mirrored into the tool-call log;
- successful runtime output is captured as an artifact with session/run/ticket provenance;
- Mission Control can project stale runtime state from the operations snapshot.

## P2 Continuation

### P2.1 Autonomy Benchmark Harness

Status: shipped as the first P2 strategic differentiator slice.

- Added shared benchmark report types for scenario ids, runtime targets, metrics, evidence, results, and summaries.
- Added a deterministic `control-plane-simulated` benchmark service that runs all ten Paperclip audit scenarios across Team-X internal, Bash, HTTP, Codex, and Claude Code runtime kinds.
- Added an in-memory Team-X benchmark context that exercises real runtime sessions, heartbeats, ticket checkouts, stale recovery, normalized runtime audit events, tool-call mirrors, and runtime output artifacts.
- Added `pnpm autonomy:benchmark` with runtime/scenario filters, JSON output, summary mode, and optional report file export.
- Documented the workflow in `docs/runtime/autonomy-benchmark-harness.md`.

Exit criteria:

- operators can produce a repeatable autonomy benchmark report from the repo CLI;
- the benchmark covers every P2 scenario named in the Paperclip audit;
- duplicate-work prevention, stale recovery, budget blocks, missing secrets, artifacts, and reboot/resume behavior are expressed as measurable scenario results;
- the first report mode is honest about simulated runtime execution while proving the durable Team-X control-plane contracts.

### P2.2 Adaptive Runtime/Model Routing

Status: shipped as the second P2 strategic differentiator slice.

- Added `routeAdaptiveWork` to `@team-x/provider-router` as a pure routing policy for triage, planning, review, repository work, and hosted-bot work.
- The policy consumes `ProviderConfig`, enabled runtime profile candidates, and optional P2.1 autonomy benchmark reports.
- Private company data now has an explicit hard local-only decision path: cloud providers and hosted HTTP runtimes are excluded before selection.
- Repository work prefers execution-backed coding runtimes, with Codex/Claude/Cursor/Bash candidates ranked by benchmark evidence when available.
- Hosted-bot work prefers HTTP runtime profiles and can block when a runtime is required but privacy or availability prevents a valid route.
- Documented the policy and decision evidence in `docs/runtime/adaptive-runtime-routing.md`.

Exit criteria:

- low-risk triage selects cheap local execution when available;
- planning/review requests escalate to the strongest allowed model tier;
- repository and hosted-bot work can be routed to runtime profiles instead of only internal providers;
- benchmark reports materially influence runtime ranking;
- private company data cannot leak into cloud/hosted routes when local-only policy is required;
- every route decision carries machine-readable evidence and human-readable reasons.

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
