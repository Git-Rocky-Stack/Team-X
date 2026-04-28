# External Runtime Audit Normalization

Status: P1.5 shipped on 2026-04-28.

External runtimes now publish one normalized runtime event vocabulary across Bash, HTTP, Codex, Claude Code, Cursor, and future adapters:

- `runtime.session.started`
- `runtime.heartbeat`
- `runtime.checkout.claimed`
- `runtime.checkout.conflict`
- `runtime.execution.started`
- `runtime.execution.output`
- `runtime.execution.failed`
- `runtime.artifact.created`
- `runtime.session.stale`
- `runtime.session.recovered`

## Surfaces

The normalizer writes to the DB-backed event bus first, which makes runtime events visible in Mission Control replay, Audit, and any live event subscribers. When an event has a `runId`, the same normalized payload is mirrored into the tool-call log with the runtime event type as `toolName`; checkout conflicts are `denied`, execution failures and stale sessions are `error`, and the rest are `success`.

Successful runtime output is captured as a first-class `runtime-output` artifact sourced from `runtime-execution`. The artifact preview keeps the session id, profile id, adapter kind, run id, ticket id, token usage, and output text together so reviews and future resume packs can point to a durable deliverable instead of a transient chat stream.

## Payload Contract

Runtime audit payloads include:

- session, employee, runtime profile, adapter, transport, run, thread, ticket, and checkout identifiers;
- conflict owner metadata for checkout races;
- status, message, usage, workspace, endpoint, and lease context;
- artifact id when a runtime deliverable is recorded.

Messages must stay short and secret-free. The normalizer does not write decrypted environment variables, runtime API keys, or inline secret values to events, tool-call rows, artifacts, or renderer-visible payloads.

## Recovery

Runtime operations snapshots reap stale sessions before projecting Mission Control state. Stale sessions remain non-ended operational records, emit `runtime.session.stale` once, and can be recovered through the runtime session service, which emits `runtime.session.recovered` when a stale session is moved back to an active status.
