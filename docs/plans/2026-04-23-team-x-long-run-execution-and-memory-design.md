> **Status:** Approved 2026-04-23 from the Paperclip gap review and the follow-up long-session assessment.
> **Scope:** Add a first-class `Long-Run Execution And Memory` layer for Team-X with rolling thread digests, run checkpoints, model-aware context packing, and resume-ready execution, then use that substrate to strengthen future external runtime execution.
> **Primary driver:** Team-X is already strong on desktop supervision, routines, budgets, approvals, and artifacts, but it still relies too heavily on raw thread history for execution. That makes long-running and ultra-long sessions weaker than they should be and leaves future Codex / Claude Code / Cursor runtime execution without a strong memory substrate.

---

## 1. Problem Statement

Team-X is already capable of serious autonomous work, but its long-horizon execution story still has clear limits:

1. chat and agent runs still depend too directly on raw thread history
2. there is no durable rolling digest for long threads
3. there is no explicit run checkpoint / handoff record for resume flows
4. context assembly is not yet model-aware in a way that actively packs the best evidence into bounded windows
5. stop, timeout, approval, and budget-block events are durable, but they do not yet generate strong resumable handoff state
6. future external runtimes would inherit the same weakness if they were wired before memory and context handling improve

The result is that Team-X is strong for normal operations, but not yet ideal for ultra-long sessions, massive turn counts, or resume-heavy workflows where execution should continue from condensed state instead of replaying a giant transcript.

---

## 2. Goals

- Add a dedicated `Context Engine` for long-run execution.
- Introduce rolling `Thread Digests` for long-lived threads.
- Introduce durable `Run Checkpoints` that capture resumable handoff state.
- Add `Context Assembler` and `Context Packer` services that compose bounded prompts from multiple sources.
- Make context packing aware of runtime/model limits rather than blindly sending raw history.
- Surface memory and context state to operators in the product UI.
- Strengthen stop/resume/approval/budget-block flows with explicit checkpointed state.
- Provide a reusable execution substrate for future external runtime adapters.

---

## 3. Non-goals

- No attempt to build a full generic memory platform in one pass.
- No hosted sync engine or cloud memory backend in this wave.
- No replacement of the existing RAG system; this wave should compose with it.
- No requirement to fully solve external Codex / Claude Code / Cursor execution in the same initial slice.
- No silent AI-only memory behavior; operators must be able to inspect what the system is doing.

---

## 4. Product Decisions

### 4.1 Context Engine comes before broader BYO-runtime execution

Team-X should improve long-run memory and context handling before it wires real external runtimes. Otherwise those runtimes will inherit the current weak long-thread behavior.

### 4.2 The solution is layered, not monolithic

This should land as four additive layers:

- `Thread Digest`
- `Run Checkpoint`
- `Context Assembler`
- `Context Packer`

Each layer should be independently testable and useful.

### 4.3 Memory must be visible, not hidden

Operators should be able to inspect:

- current thread digest
- latest run checkpoint
- packed context composition
- dropped sources or truncation decisions

This is not a hidden summarization feature. It is part of the operator control plane.

### 4.4 Recent turns still matter

Thread digestion is not a license to ignore recent interaction. Packed context should preserve:

- the latest raw turns
- current objective and execution state
- pinned facts
- relevant artifacts and approvals

The goal is compression without loss of operational truth.

### 4.5 Checkpoints are explicit handoffs

A checkpoint should not be just another summary blob. It should capture:

- objective
- progress so far
- blockers
- next best action
- active artifacts and files
- unresolved approvals
- relevant routine / budget / governance state

This is what makes stop/resume and interrupted execution usable at scale.

### 4.6 Model-aware packing is required

Team-X already knows provider/model metadata, but it should actively use that information to pack context. The packer should allocate budget deliberately across:

- recent turns
- thread digest
- run checkpoint
- RAG results
- operational state
- artifacts

### 4.7 Graceful degradation is mandatory

If digest refresh fails, checkpoint writing fails, or a context source is unavailable, the run should still proceed when possible with degraded but explicit behavior. Memory enhancement should improve execution, not make it fragile.

---

## 5. Architecture

### 5.1 ThreadDigestService

Maintains the durable rolling summary for a thread.

Responsibilities:

- decide when a digest is stale enough to refresh
- summarize long raw history into a durable condensed view
- maintain pinned facts and key decisions
- track which message boundary the digest covers

Recommended durable record:

- `thread_digests`

Suggested fields:

- `id`
- `companyId`
- `threadId`
- `summary`
- `pinnedFactsJson`
- `lastSummarizedMessageId`
- `estimatedTokens`
- `freshness`
- `createdAt`
- `updatedAt`

### 5.2 RunCheckpointService

Creates resumable handoff records at meaningful boundaries.

Checkpoint triggers should include:

- run completed
- run stopped
- run timed out
- approval blocked
- budget blocked
- routine completed

Recommended durable record:

- `run_checkpoints`

Suggested fields:

- `id`
- `companyId`
- `threadId`
- `runId`
- `employeeId`
- `checkpointKind`
- `objective`
- `progressSummary`
- `blockersJson`
- `nextAction`
- `activeArtifactRefsJson`
- `unresolvedApprovalRefsJson`
- `createdAt`

### 5.3 ContextAssembler

Builds the candidate context set for a run from multiple sources:

- recent raw thread turns
- latest thread digest
- latest run checkpoint
- relevant operational state
- relevant RAG evidence
- linked artifacts
- current approval / budget / routine signals

This service should stay source-aware and return structured segments rather than a single flat string.

### 5.4 ContextPacker

Transforms candidate context into the final bounded prompt pack.

Responsibilities:

- honor runtime/model budget ceilings
- preserve recent turns
- prioritize high-value segments
- drop or compress lower-value material first
- emit reasoning for included and omitted context

Optional but recommended later:

- `context_pack_events` for audit/debug

---

## 6. Execution Flow

1. A new run begins.
2. Team-X resolves the thread, employee, runtime, and model posture.
3. `ContextAssembler` loads recent turns, the latest digest, the latest checkpoint, and relevant evidence.
4. `ContextPacker` fits those sources into the target context budget.
5. The run executes using packed context rather than raw unbounded history.
6. On completion or interruption, `RunCheckpointService` writes a handoff record.
7. If enough new material accumulated, `ThreadDigestService` refreshes the thread digest.

This keeps execution bounded while preserving a durable narrative of what happened and what should happen next.

---

## 7. User Experience

### 7.1 Autonomy

Add a new `Context` or `Memory` subview under `Autonomy`.

It should show:

- digest health
- checkpoint coverage
- recent truncation or drop events
- average packed context size
- blocked runs caused by context limits

Operators should be able to inspect the latest digest and checkpoint directly from this surface.

### 7.2 Thread-level visibility

Chat and ticket surfaces should expose a small `Context status` control or chip.

Suggested actions:

- refresh summary
- pin fact
- create handoff snapshot
- inspect latest checkpoint

Resume flows should show that a run resumed from a checkpoint rather than silently replaying a huge transcript.

### 7.3 Settings

Add live-editable controls for:

- auto-summarization enabled
- digest refresh threshold
- checkpoint on stop / timeout / approval / budget block
- packing aggressiveness
- source allocation ratios

### 7.4 User Guide

Add a short onboarding section that explains:

- recent turns are not the only memory source
- long-run stability depends on digests and checkpoints
- pinned facts are workspace-scoped and operator-visible

---

## 8. Error Handling

- If digest refresh fails, runs proceed with recent turns plus the last valid digest.
- If checkpoint creation fails, the run still finishes, but Team-X should emit a visible warning or audit event.
- If context packing cannot produce a minimum viable prompt, fail early with an operator-facing explanation.
- If a digest references missing sources, mark it degraded and fall back gracefully.

---

## 9. Testing Strategy

### 9.1 Unit tests

- digest refresh threshold logic
- checkpoint trigger logic
- packer priority and truncation rules
- model-aware allocation logic

### 9.2 Integration tests

- long thread condenses into digest plus recent turns
- stopped run resumes from checkpointed state
- approval-blocked run leaves a useful checkpoint
- routine-created work begins with usable packed context

### 9.3 UI guards

- Autonomy context surface exists
- thread-level context status is visible
- resumed or condensed runs surface explicit context state

---

## 10. Rollout Recommendation

1. `Foundation`
   - schema
   - shared types
   - `ThreadDigestService`
   - `RunCheckpointService`
2. `Context packing`
   - `ContextAssembler`
   - `ContextPacker`
   - model-aware limits
3. `Operator UX`
   - autonomy subview
   - thread chips
   - inspect panels
   - settings
4. `Internal runtime integration`
   - route Team-X internal runs through the context engine by default
5. `External runtime follow-through`
   - wire Codex / Claude Code / Cursor execution onto the same substrate
6. `Portability`
   - later export/import of digests, checkpoints, and reusable operating context

---

## 11. Why This Order

This ordering is intentional.

If Team-X wires more external runtimes first, they inherit the current weak long-session story.

If Team-X lands the context engine first:

- current internal execution improves immediately
- long threads become safer and more legible
- stop/resume flows become more truthful
- future BYO-agent execution lands on a much stronger foundation

That makes this the highest-leverage next bundle after the current autonomy-control work.
