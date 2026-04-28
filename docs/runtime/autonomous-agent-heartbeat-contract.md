# Autonomous Agent Heartbeat Contract

**Status:** P0 runtime contract  
**Applies to:** Bash, HTTP, Codex, Claude Code, Cursor, and future external runtime adapters.

Every external runtime execution must be represented by a durable runtime session and must keep that session alive with heartbeats while it owns work. A runtime is operationally real only when Team-X can answer who is running, what work is claimed, when it last checked in, what budget was spent, and why it stopped.

## Required Session Lifecycle

1. Create a `runtime_sessions` row before invoking the external process or endpoint.
2. Assign `companyId`, `employeeId`, `runtimeProfileId`, `adapterKind`, and `workspacePath` when known.
3. Move status through `starting -> idle|working|blocked -> ended|failed|offline|stale`.
4. Persist `currentRunId` and `currentTicketId` whenever the runtime begins or changes active work.
5. Mark sessions `stale` instead of deleting them when heartbeat freshness expires.
6. Mark sessions `ended` or `failed` with `failureReason` on normal completion, cancellation, budget block, approval block, or adapter error.

## Heartbeat Payload

Each heartbeat persists into `runtime_heartbeats` and updates the current `runtime_sessions` projection atomically:

| Field | Requirement |
| --- | --- |
| `sessionId` | Required. Must reference the active runtime session. |
| `status` | Required when status changes; otherwise inherited from the session. |
| `currentRunId` | Required when the runtime owns a Team-X run. |
| `currentTicketId` | Required when the runtime owns a ticket checkout. |
| `costDeltaJson` | Required for spend-bearing work; use `{}` when no spend happened. |
| `message` | Short operator-facing diagnostic. No secrets. |
| `leaseExpiresAt` | Required for long-running runtime ownership. |
| `createdAt` | Main-process timestamp. |

## Cadence And Staleness

- A runtime must heartbeat before and after checkout, before every expensive execution step, after any tool/action batch, and before completion.
- Interactive command runtimes should heartbeat at least every 30 seconds while active.
- HTTP adapters should heartbeat around every request and long-poll phase.
- A runtime whose latest heartbeat is older than the configured freshness window is marked `stale`.
- Stale sessions remain auditable history and must not be overwritten by a later runtime process.

## Ticket Checkout Coupling

- A runtime must claim a ticket through `ticket_checkouts` before performing ticket-scoped autonomous work.
- Exactly one active checkout may exist per ticket.
- A self-owned checkout refresh extends the lease and does not create a duplicate.
- Another runtime receives a deterministic conflict until the active checkout is released or expired.
- Completion, block, cancellation, or failure must release the checkout with a terminal status and reason.

## Budget And Approval Coupling

- Runtime wake, checkout, and heartbeat continuation must be eligible for budget hard-stop evaluation.
- Budget-blocked or approval-blocked work must move the session to `blocked`, record a heartbeat, and preserve enough run/checkpoint state to resume.
- Spend-bearing heartbeats must include cost deltas so Mission Control can stop work before silent overruns.

## Secret And Workspace Rules

- Runtime config must use `secret_ref` objects for sensitive keys; inline API keys, tokens, secrets, and passwords are rejected.
- Secret refs resolve only in the Electron main process at execution time.
- Decrypted secrets may be injected into runtime environment variables, but must never be sent to the renderer, exported in company packages, or written to heartbeat messages.
- External runtimes run in per-company, per-employee, per-profile workspace paths with `home`, `workspace`, `logs`, and `tmp` directories.
