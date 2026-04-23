**Date:** 2026-04-23  
**Design reference:** [`2026-04-23-team-x-long-run-execution-and-memory-design.md`](./2026-04-23-team-x-long-run-execution-and-memory-design.md)  
**Primary objective:** ship the first `Long-Run Execution And Memory` bundle for Team-X: thread digests, run checkpoints, model-aware context packing, visible operator controls, and internal-runtime adoption of the new context engine.

## Overview

This plan breaks the work into six slices:

1. `Digest and checkpoint foundation`
2. `Context assembler and packer`
3. `Internal runtime integration`
4. `Operator UX and settings`
5. `Resume and interruption hardening`
6. `External runtime follow-through`

The recommended order improves Team-X's current internal execution first, then exposes the controls and only after that uses the new substrate for external runtime execution.

---

## Slice 1: Digest And Checkpoint Foundation

### Goal

Introduce the durable data model and core services for long-run memory without changing execution behavior yet.

### Deliverables

- Add shared types for:
  - `ThreadDigest`
  - `RunCheckpoint`
  - checkpoint kinds and digest freshness state
- Add DB tables for:
  - `thread_digests`
  - `run_checkpoints`
- Add repos for digest and checkpoint CRUD.
- Add `ThreadDigestService`.
- Add `RunCheckpointService`.
- Add basic IPC reads for:
  - get latest digest by thread
  - list checkpoints by thread

### Likely touchpoints

- `packages/shared-types/src/entities.ts`
- `packages/shared-types/src/ipc.ts`
- `packages/shared-types/src/events.ts`
- `apps/desktop/src/main/db/schema.ts`
- new migration under `apps/desktop/src/main/db/migrations/`
- new repos under `apps/desktop/src/main/db/repos/`
- new services under `apps/desktop/src/main/services/`
- `apps/desktop/src/main/ipc/handlers.ts`
- `apps/desktop/src/preload/api.ts`

### Tests

- repo tests for digest and checkpoint persistence
- service tests for freshness and trigger rules
- IPC handler tests for basic reads

### Exit criteria

- Team-X can durably store and retrieve thread digests and run checkpoints
- no execution path depends on them yet

---

## Slice 2: Context Assembler And Packer

### Goal

Build the structured context pipeline that can prepare bounded prompts from multiple sources.

### Deliverables

- Add `ContextAssembler` that collects:
  - recent thread turns
  - latest digest
  - latest checkpoint
  - ticket/project/company state
  - relevant approvals / routines / artifacts
  - RAG evidence
- Add `ContextPacker` that:
  - uses target token budgets
  - prioritizes recent turns and active state
  - compresses or omits low-priority segments
  - returns structured packing metadata
- Add optional debug/audit event emission for pack composition decisions.

### Likely touchpoints

- new `context-assembler-service.ts`
- new `context-packer-service.ts`
- `apps/desktop/src/main/services/retrieval-orchestrator.ts`
- `apps/desktop/src/main/orchestrator/`
- `packages/shared-types/src/ipc.ts`

### Tests

- unit tests for source prioritization
- token allocation tests
- truncation/drop decision tests
- integration tests showing packed context shape from realistic thread state

### Exit criteria

- Team-X can build a bounded prompt pack without relying on raw full-thread history
- packing decisions are testable and inspectable

---

## Slice 3: Internal Runtime Integration

### Goal

Route Team-X's current internal execution through the context engine by default.

### Deliverables

- Update orchestrator execution paths to use packed context for internal runs.
- Add digest-refresh hooks after meaningful run completion.
- Add checkpoint creation hooks for:
  - completion
  - stop
  - timeout
  - approval block
  - budget block
- Preserve current runAgent durability and error semantics.

### Likely touchpoints

- `apps/desktop/src/main/orchestrator/index.ts`
- `apps/desktop/src/main/orchestrator/run-agent.ts`
- `apps/desktop/src/main/services/budget-governance-service.ts`
- `apps/desktop/src/main/services/approval-inbox-service.ts`
- `apps/desktop/src/main/services/routine-service.ts`

### Tests

- orchestrator integration tests for condensed history execution
- regression tests for stop/resume and timeout behavior
- tests proving checkpoints are created for blocked or interrupted runs

### Exit criteria

- Team-X internal runs no longer depend solely on raw thread history
- long-running internal execution has durable checkpointed state

---

## Slice 4: Operator UX And Settings

### Goal

Expose the context engine to operators as a visible, controllable product surface.

### Deliverables

- Add `Context` or `Memory` subview under `Autonomy`.
- Surface:
  - digest health
  - checkpoint coverage
  - recent truncation/drop events
  - packed context usage stats
- Add thread-level context controls in Chat and ticket surfaces:
  - inspect latest digest
  - inspect latest checkpoint
  - refresh summary
  - pin fact
  - create handoff snapshot
- Add Settings controls for digest and packing behavior.
- Extend User Guide onboarding with context-engine guidance.

### Likely touchpoints

- `apps/desktop/src/renderer/src/features/autonomy/`
- `apps/desktop/src/renderer/src/features/chat/`
- `apps/desktop/src/renderer/src/features/tickets/`
- `apps/desktop/src/renderer/src/features/settings/`
- `apps/desktop/src/renderer/src/features/user-guide/`
- renderer hooks for new IPC reads and actions

### Tests

- autonomy source guards
- settings source guards
- user-guide source guards
- focused renderer tests for context-state visibility and actions

### Exit criteria

- operators can inspect and steer Team-X memory behavior from the UI
- memory behavior is visible rather than hidden

---

## Slice 5: Resume And Interruption Hardening

### Goal

Make interrupted execution behave like resumable work instead of a broken chat transcript.

### Deliverables

- Add explicit checkpoint-backed resume semantics for:
  - user stop
  - provider timeout
  - provider stall
  - budget block
  - approval wait
- Surface resume origin in the UI so operators can tell when a run used checkpointed state.
- Tighten failure handling when minimum viable packed context cannot be assembled.

### Likely touchpoints

- `apps/desktop/src/main/orchestrator/run-agent.ts`
- `apps/desktop/src/main/orchestrator/index.ts`
- `apps/desktop/src/renderer/src/features/chat/`
- `apps/desktop/src/renderer/src/features/dashboard/`
- `apps/desktop/src/renderer/src/features/autonomy/`

### Tests

- timeout/stall resume tests
- budget and approval resume tests
- renderer tests for resumed-from-checkpoint indicators

### Exit criteria

- interrupted runs leave useful resumable state
- operators can tell what resumed and from where

---

## Slice 6: External Runtime Follow-through

### Goal

Use the new context substrate to strengthen real external runtime execution.

### Deliverables

- Upgrade runtime profile execution from posture-only toward real adapters for:
  - `codex`
  - `claude-code`
  - `cursor`
  - follow-on `bash` / `http` execution where appropriate
- Ensure external runtime invocation receives packed context and emits checkpoints.
- Preserve budgets, approvals, authority, and artifacts through the same pipeline.

### Likely touchpoints

- `apps/desktop/src/main/services/runtime-profiles-service.ts`
- new adapter execution services
- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/main/services/operator-access-service.ts`
- `apps/desktop/src/main/services/artifact-service.ts`

### Tests

- adapter invocation tests
- checkpointed external-runtime execution tests
- governance parity tests across internal and external runs

### Exit criteria

- external runtime execution no longer lands on a weak long-session substrate
- internal and external runs share the same memory/governance story

---

## Recommended Execution Notes

- Land this bundle only after the current autonomy hardening slice is checkpointed cleanly.
- Keep `ContextAssembler` and `ContextPacker` independent from renderer or IPC concerns.
- Preserve current failure visibility; never reintroduce silent empty-output or silent-stall behavior.
- Bias toward additive schema and service seams rather than rewriting the current orchestrator wholesale.

---

## Suggested First Implementation Pair

The clean first implementation pass is:

1. `Digest and checkpoint foundation`
2. `Context assembler and packer`

That gives Team-X the durable memory substrate before execution wiring changes, and it keeps the initial risk contained to schema, services, and testable prompt-composition logic.
