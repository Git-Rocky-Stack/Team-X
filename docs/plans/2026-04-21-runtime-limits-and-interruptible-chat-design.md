# Team-X Runtime Limits + Interruptible Chat Design

> **Status:** Approved 2026-04-21.
> **Scope:** Make runtime concurrency settings authoritative, widen planner guardrails for advanced projects, and remove the direct-message composer lockout while an agent is responding.
> **Primary driver:** The Settings UI currently exposes values the runtime ignores or clamps too tightly, and the chat drawer disables input during streaming.

---

## 1. Problem Statement

Three separate behaviors are constraining the product in ways the UI does not make honest:

1. `orchestrator_slots` is persisted in settings, but Electron main still boots the orchestrator with a hardcoded `2` slots.
2. `concurrency_caps` is persisted in settings, but no runtime scheduler enforces per-provider-kind limits.
3. `planner_max_depth` is genuinely wired, but its shared clamp is capped at `4`, which is too shallow for larger decomposition trees.
4. The employee DM composer is disabled while the agent is streaming, so the user cannot type, queue follow-ups, or stop the reply in progress.

The result is a mismatch between visible configuration and actual behavior, plus a chat experience that blocks the user during the most latency-sensitive part of the product.

---

## 2. Goals

- Make concurrency settings authoritative at runtime.
- Enforce both global slots and per-provider-kind caps without requiring app restarts.
- Raise planner depth ceiling from `4` to `32`.
- Raise planner max-ticket ceiling from `50` to `200`.
- Keep the DM composer editable while an agent is streaming.
- Add a direct-chat stop control.
- Preserve user follow-up messages typed during streaming and send them in FIFO order after the current turn ends or is stopped.

---

## 3. Non-goals

- No changes to Copilot thread read-only behavior in this pass.
- No changes to agentic-loop budgets beyond verifying they are already live and sufficiently wide.
- No instance-level provider caps. Enforcement remains by provider kind (`ollama`, `openai`, `custom-openai`, etc.).
- No attempt to make planner depth or ticket counts unbounded. Hard ceilings remain.
- No attempt to redesign the full chat transcript renderer beyond what is needed to support queued follow-ups and stop.

---

## 4. Decisions

### 4.1 Runtime settings become the source of truth

`orchestrator_slots` and `concurrency_caps` move from "saved preferences" to actual runtime policy. The orchestrator must consume those values directly, and settings writes must update the live scheduler.

### 4.2 Per-provider enforcement happens in the orchestrator facade

The generic `WorkQueue` remains a reusable primitive, but provider-kind scheduling policy moves into `apps/desktop/src/main/orchestrator/index.ts`.

Reason:
- provider-kind dispatch depends on employee lookup and provider resolution
- blocked Ollama work must not consume global slots while OpenAI work is available
- live cap changes must apply to future dispatches without tearing down the queue

### 4.3 Scheduler fairness is "FIFO among dispatchable work"

The scheduler will preserve enqueue order where limits allow, but a head-of-line job blocked by a saturated provider kind will not stall unrelated work from another provider kind.

Example:
- queued jobs: `ollama`, `ollama`, `openai`
- `ollama` cap full, `openai` cap available
- the `openai` job may dispatch before the second `ollama` job

This is intentional. Strict total FIFO is less important than honoring the configured caps without starving other providers.

### 4.4 Planner ceilings widen, but remain bounded

- `planner_max_depth`: `1–32`, default remains `2`
- `planner_max_tickets`: `1–200`, default remains `10`
- `orchestrator_slots`: validated to `1–32`
- `providerCaps[kind]`: validated to `1–32`

The defaults stay conservative; only the hard ceilings widen.

### 4.5 Direct chat becomes interruptible and queueable

For employee DM threads:

- the composer stays enabled while the agent is streaming
- the disabled textarea / blocked cursor state is removed
- a visible `Stop` action appears while the current reply is active
- sends pressed during streaming are stored in a per-thread FIFO queue
- when the current reply ends or is canceled, the oldest queued message is sent automatically
- if multiple follow-ups were queued, they continue one-at-a-time in FIFO order across subsequent turns

Assumption locked for implementation:
- preserve every queued follow-up; do not collapse to one "latest draft"

### 4.6 Direct chat stop must be real cancellation

Stopping a direct-message reply must abort the in-flight provider stream, not merely hide future tokens in the renderer. That requires an abort path through:

- provider-router stream contract
- adapter implementations
- `runAgent`
- orchestrator run registry
- chat IPC

This is more work than a UI-only patch, but it avoids burning tokens after the user has already stopped the turn.

---

## 5. Architecture

### 5.1 Settings-backed concurrency policy

The orchestrator will hold a mutable concurrency policy:

- `globalSlots`
- `providerCapsByKind`

New method on the orchestrator surface:

- `updateConcurrency({ slots, providerCaps })`

Electron main will:

1. read settings on startup
2. boot the orchestrator with those values
3. call `updateConcurrency(...)` after successful `settings.setRuntime` and `settings.setConcurrency` writes

Running turns are never preempted by a cap change. Over-cap states are allowed temporarily until existing in-flight work finishes.

### 5.2 Provider-aware dispatch

The orchestrator will own a pending turn list instead of relying on a blind FIFO semaphore alone.

Each pending job will resolve enough metadata to become schedulable:

- thread id
- employee id
- company id
- provider kind

Dispatch rule:

- job is eligible only if:
  - orchestrator is not globally paused
  - the company is not meeting-paused
  - global in-flight count is below `slots`
  - provider-kind in-flight count is below that kind's cap

When multiple jobs are pending, the dispatcher scans in enqueue order and starts the first eligible job. This keeps behavior predictable without allowing one provider kind to freeze the whole system.

### 5.3 Direct chat run registry

Today, agentic-loop runs are cancelable, but direct DM turns are not. This design adds a parallel registry in the orchestrator for normal chat turns:

- queued turn by thread
- running turn by thread
- per-turn `AbortController`
- per-turn provider kind

New orchestrator capability:

- stop the active or queued DM turn for a thread

Main-side `chat.stop` will target the thread, not a renderer-generated token, so the chat drawer can always address "the thing currently responding in this thread."

### 5.4 Abortable provider streams

The provider-router contract will grow a signal:

- `ProviderStreamFn(args)` gains `signal?: AbortSignal`
- `streamAgent(...)` forwards it
- every adapter forwards it to the underlying AI SDK call
- `runAgent` creates and owns the controller for direct DM turns

This keeps cancellation consistent across Ollama, OpenAI-compatible endpoints, and the cloud providers.

### 5.5 Interruptible chat state in the renderer

The renderer needs a real per-thread chat session state, not just `employeeLive[employeeId].status`.

Add per-thread state for:

- `isStreaming`
- `isStopping`
- `queuedMessages: string[]`
- `activeRunState` or equivalent "thread has an active DM turn" marker

The chat drawer will:

- keep the draft editable during streaming
- change the primary action from disabled send to `Stop` while streaming
- allow pressing send while streaming, which appends to the local queue
- flush queued messages automatically when the thread returns to idle

Queued follow-ups are local until sent. They are not persisted as user messages until their turn actually begins.

---

## 6. UI Behavior

### 6.1 Concurrency settings

The current button row (`2 / 4 / 6 / 8 / 10`) is too restrictive. Replace it with numeric inputs:

- `Orchestrator Slots`
- editable cap per visible provider kind

The section continues to hide deleted provider kinds from the UI, but persisted unknown kinds remain harmless data and do not affect dispatch unless a matching provider exists.

### 6.2 Planner settings

The planner UI already uses shared clamp constants. Once the constants widen, the UI automatically allows:

- `Max Tickets per Plan` up to `200`
- `Max Nesting Depth` up to `32`

### 6.3 Chat drawer

For employee DM view:

- remove the disabled textarea state
- keep placeholder neutral while streaming
- show `Stop` while the agent is active
- if the user presses send while streaming, enqueue the message and show queued state in the composer
- when the current turn stops or completes, automatically send the oldest queued item

Copilot thread view and agent-to-agent read-only thread view remain unchanged.

---

## 7. Data Flow

### 7.1 Concurrency changes

1. Renderer calls `settings.setConcurrency` or `settings.setRuntime`
2. main persists settings
3. main resolves the effective slot count and provider caps
4. main calls `orchestrator.updateConcurrency(...)`
5. future queued jobs dispatch under the new policy

### 7.2 Direct chat send while idle

1. renderer calls `chat.send`
2. main persists the user message
3. main enqueues a DM turn
4. orchestrator dispatches when policy allows
5. `work.started` / `token.delta` / `work.completed|failed` drive live UI

### 7.3 Direct chat send while streaming

1. renderer sees thread is active
2. send press pushes text into local per-thread queue
3. no IPC call is made yet
4. once the thread becomes idle or canceled, renderer sends the next queued item

### 7.4 Direct chat stop

1. renderer calls `chat.stop({ threadId })`
2. main asks orchestrator to cancel the queued or running DM turn for that thread
3. orchestrator aborts the controller or removes the queued job
4. final state lands as `work.failed` with a cancel-shaped error
5. renderer marks the thread idle and flushes the next queued follow-up, if any

---

## 8. Error Handling

- If `chat.stop` targets a thread with no active DM turn, return `{ stopped: false }`, not an exception.
- If a provider does not honor abort quickly, the UI still enters `stopping` state and waits for terminal event; do not start queued follow-ups until the current turn is truly terminal.
- If a queued follow-up send fails at IPC level, leave it in the local queue and surface an inline error rather than silently dropping it.
- If concurrency settings contain malformed caps, clamp them on write and also sanitize on read for defensive safety.
- If a provider kind is missing from `concurrency_caps`, fall back to the shared default for that kind.

---

## 9. Other Limits Audited

### Must change in this pass

- hardcoded orchestrator slots in Electron main
- non-enforced provider-kind caps
- planner max depth cap of `4`
- planner max tickets cap of `50`
- disabled DM composer during streaming

### Verified as already adjustable enough

- agentic loop max steps: up to `32`
- agentic loop max tokens: up to `64000`
- agentic loop timeout: up to `600000ms`
- copilot settings: persisted and read live
- RAG settings: persisted and read live

---

## 10. Testing Strategy

### Main / scheduler

- unit tests for provider-kind enforcement
- unit tests for mixed-provider fairness
- unit tests for live cap changes without restart
- unit tests for canceling queued and running DM turns
- unit tests for pause / resume / shutdown interactions under the new scheduler

### Provider router

- adapter coverage for abort signal passthrough
- stream contract tests proving aborted DM turns terminate cleanly

### Settings

- settings clamp tests for widened planner and concurrency ceilings
- IPC handler tests proving `settings.setConcurrency` updates runtime policy

### Renderer

- chat drawer tests for enabled composer during streaming
- tests for queueing follow-up messages while streaming
- tests for `Stop` button visibility and post-stop queue flush
- concurrency section tests for numeric editing and provider-kind cap save path

---

## 11. Rollout Order

1. widen shared clamps and IPC shapes
2. make provider-router streams abortable
3. refactor orchestrator scheduling + direct-turn cancellation
4. wire live settings updates from main
5. update concurrency and planner settings UIs
6. update chat drawer/composer queue behavior
7. run focused tests, then broader verification

This order reduces risk: cancellation and scheduling become real before the renderer depends on them.

