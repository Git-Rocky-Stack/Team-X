# Runtime Limits And Interruptible Chat Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Team-X honor runtime concurrency settings, widen planner bounds for advanced projects, and let users type, queue follow-ups, and stop direct-message replies while an agent is streaming.

**Architecture:** The main process becomes the authority for live concurrency policy and direct-message cancellation. The orchestrator enforces global slots plus provider-kind caps, provider streams become abortable, and the renderer keeps a per-thread FIFO queue for follow-up messages typed during streaming.

**Tech Stack:** Electron, TypeScript, React, Zustand, TanStack Query, Vitest, provider-router adapters, orchestrator facade.

---

### Task 1: Shared Types And Clamp Widening

**Files:**
- Modify: `packages/shared-types/src/ipc.ts`
- Modify: `packages/shared-types/src/events.ts`
- Modify: `packages/shared-types/src/providers.ts`
- Test: `apps/desktop/src/main/db/repos/settings.test.ts`
- Test: `apps/desktop/src/main/db/repos/settings-planner.test.ts`

**Step 1: Write the failing tests**

Add assertions for:
- `PLANNER_SETTINGS_CLAMPS.maxDepth.max === 32`
- `PLANNER_SETTINGS_CLAMPS.maxTickets.max === 200`
- concurrency write/read clamps accepting values up to `32`

Add or update payload expectations so direct work events can carry the cancellation/runtime metadata the renderer needs.

**Step 2: Run tests to verify they fail**

Run:
```bash
pnpm exec vitest run apps/desktop/src/main/db/repos/settings.test.ts apps/desktop/src/main/db/repos/settings-planner.test.ts
```

Expected:
- FAIL on the old `maxDepth === 4`
- FAIL on the old `maxTickets === 50`

**Step 3: Write the minimal implementation**

Change:
- planner clamps to `maxTickets: 200`, `maxDepth: 32`
- add shared concurrency clamp constants or equivalent validation helpers for `1–32`
- extend the direct-work event and chat IPC shapes needed by later tasks

**Step 4: Run tests to verify they pass**

Run:
```bash
pnpm exec vitest run apps/desktop/src/main/db/repos/settings.test.ts apps/desktop/src/main/db/repos/settings-planner.test.ts
```

Expected:
- PASS

**Step 5: Commit**

```bash
git add packages/shared-types/src/ipc.ts packages/shared-types/src/events.ts packages/shared-types/src/providers.ts apps/desktop/src/main/db/repos/settings.test.ts apps/desktop/src/main/db/repos/settings-planner.test.ts
git commit -m "feat: widen planner and concurrency shared limits"
```

### Task 2: Abortable Provider Streams

**Files:**
- Modify: `packages/provider-router/src/stream.ts`
- Modify: `packages/provider-router/src/adapters/anthropic.ts`
- Modify: `packages/provider-router/src/adapters/openai.ts`
- Modify: `packages/provider-router/src/adapters/openai-compat.ts`
- Modify: `packages/provider-router/src/adapters/google.ts`
- Modify: `packages/provider-router/src/adapters/groq.ts`
- Modify: `packages/provider-router/src/adapters/openrouter.ts`
- Modify: `packages/provider-router/src/adapters/together.ts`
- Modify: `packages/provider-router/src/adapters/fireworks.ts`
- Modify: `packages/provider-router/src/adapters/ollama.ts`
- Test: `packages/provider-router/src/adapters/ollama.test.ts`

**Step 1: Write the failing test**

Add an adapter-level test that:
- creates an `AbortController`
- starts a stream
- aborts before completion
- expects the stream to terminate without yielding a normal success tail

**Step 2: Run test to verify it fails**

Run:
```bash
pnpm exec vitest run packages/provider-router/src/adapters/ollama.test.ts
```

Expected:
- FAIL because the current stream contract does not accept `signal`

**Step 3: Write minimal implementation**

Change the provider stream contract to:

```ts
type ProviderStreamFn = (args: {
  system: string;
  messages: StreamMessage[];
  tools?: Record<string, unknown>;
  maxSteps?: number;
  signal?: AbortSignal;
}) => AsyncGenerator<ProviderStreamEvent>;
```

Then forward `signal` through `streamAgent(...)` and each adapter's `streamText(...)` call.

**Step 4: Run test to verify it passes**

Run:
```bash
pnpm exec vitest run packages/provider-router/src/adapters/ollama.test.ts
```

Expected:
- PASS

**Step 5: Commit**

```bash
git add packages/provider-router/src/stream.ts packages/provider-router/src/adapters/anthropic.ts packages/provider-router/src/adapters/openai.ts packages/provider-router/src/adapters/openai-compat.ts packages/provider-router/src/adapters/google.ts packages/provider-router/src/adapters/groq.ts packages/provider-router/src/adapters/openrouter.ts packages/provider-router/src/adapters/together.ts packages/provider-router/src/adapters/fireworks.ts packages/provider-router/src/adapters/ollama.ts packages/provider-router/src/adapters/ollama.test.ts
git commit -m "feat: add abort support to provider streams"
```

### Task 3: Orchestrator Provider-Aware Scheduler

**Files:**
- Modify: `apps/desktop/src/main/orchestrator/index.ts`
- Modify: `apps/desktop/src/main/orchestrator/run-agent.ts`
- Test: `apps/desktop/src/main/orchestrator/orchestrator.test.ts`
- Test: `apps/desktop/src/main/orchestrator/run-agent.test.ts`

**Step 1: Write the failing tests**

Add orchestrator tests for:
- global slots from settings instead of hardcoded `2`
- provider-kind caps enforced across mixed jobs
- blocked Ollama work not starving OpenAI work
- live `updateConcurrency(...)` applying to future jobs
- canceling a queued DM turn by thread
- canceling an in-flight DM turn by thread

Add a `run-agent` test for aborting an active turn and emitting a terminal failure shape instead of success.

**Step 2: Run tests to verify they fail**

Run:
```bash
pnpm exec vitest run apps/desktop/src/main/orchestrator/orchestrator.test.ts apps/desktop/src/main/orchestrator/run-agent.test.ts
```

Expected:
- FAIL because the current orchestrator is queue-only and non-cancelable

**Step 3: Write minimal implementation**

Implement in `orchestrator/index.ts`:
- a pending-turn list
- global in-flight counter
- per-provider-kind in-flight counters
- `updateConcurrency(...)`
- `stopThread(threadId)` for queued/running DM turns
- per-turn `AbortController` storage

Implement in `run-agent.ts`:
- accept `signal?: AbortSignal`
- pass it into `streamAgent(...)`
- treat abort as a cancelled/failed terminal path, not success

**Step 4: Run tests to verify they pass**

Run:
```bash
pnpm exec vitest run apps/desktop/src/main/orchestrator/orchestrator.test.ts apps/desktop/src/main/orchestrator/run-agent.test.ts
```

Expected:
- PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/main/orchestrator/index.ts apps/desktop/src/main/orchestrator/run-agent.ts apps/desktop/src/main/orchestrator/orchestrator.test.ts apps/desktop/src/main/orchestrator/run-agent.test.ts
git commit -m "feat: enforce live provider-aware orchestrator concurrency"
```

### Task 4: Main-Process Wiring For Live Settings And Chat Stop

**Files:**
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/main/ipc/handlers.ts`
- Modify: `apps/desktop/src/main/ipc/register.ts`
- Modify: `apps/desktop/src/preload/api.ts`
- Test: `apps/desktop/src/main/ipc/handlers.test.ts`
- Test: `apps/desktop/src/preload/api.test.ts`

**Step 1: Write the failing tests**

Add tests for:
- main boot using persisted `orchestrator_slots`
- `settings.setConcurrency` pushing live policy into the orchestrator
- `settings.setRuntime` pushing live policy into the orchestrator
- new `chat.stop` IPC returning `{ stopped: true|false }`

**Step 2: Run tests to verify they fail**

Run:
```bash
pnpm exec vitest run apps/desktop/src/main/ipc/handlers.test.ts apps/desktop/src/preload/api.test.ts
```

Expected:
- FAIL because the current handlers only persist values and there is no `chat.stop`

**Step 3: Write minimal implementation**

Change `index.ts`:
- remove `PHASE_1_ORCHESTRATOR_SLOTS = 2` from actual runtime wiring
- read concurrency settings from `settingsRepo` before `buildOrchestrator(...)`

Change IPC:
- `chat.send` remains fire-and-forget for user messages
- add `chat.stop({ threadId })`
- after concurrency/runtime settings writes, call `orchestrator.updateConcurrency(...)`

**Step 4: Run tests to verify they pass**

Run:
```bash
pnpm exec vitest run apps/desktop/src/main/ipc/handlers.test.ts apps/desktop/src/preload/api.test.ts
```

Expected:
- PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/main/index.ts apps/desktop/src/main/ipc/handlers.ts apps/desktop/src/main/ipc/register.ts apps/desktop/src/preload/api.ts apps/desktop/src/main/ipc/handlers.test.ts apps/desktop/src/preload/api.test.ts
git commit -m "feat: wire live concurrency updates and chat stop ipc"
```

### Task 5: Concurrency And Planner Settings UI

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/settings/concurrency-section.tsx`
- Modify: `apps/desktop/src/renderer/src/features/settings/planner-section.tsx`
- Modify: `apps/desktop/src/renderer/src/hooks/use-settings.ts`
- Test: `apps/desktop/src/renderer/src/features/settings/concurrency-section.test.ts`

**Step 1: Write the failing test**

Add a renderer test that expects:
- numeric editing for orchestrator slots
- numeric editing for per-provider-kind caps
- planner labels reflecting the widened `32` and `200` bounds

**Step 2: Run test to verify it fails**

Run:
```bash
pnpm exec vitest run apps/desktop/src/renderer/src/features/settings/concurrency-section.test.ts
```

Expected:
- FAIL because the current UI still uses hardcoded slot buttons and read-only provider caps

**Step 3: Write minimal implementation**

Replace:
- fixed slot buttons with numeric input and blur-save
- cap badges with editable numeric inputs per visible provider kind

Keep:
- provider-kind filtering from the earlier cleanup

Let planner UI inherit new shared clamp bounds.

**Step 4: Run test to verify it passes**

Run:
```bash
pnpm exec vitest run apps/desktop/src/renderer/src/features/settings/concurrency-section.test.ts
```

Expected:
- PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/features/settings/concurrency-section.tsx apps/desktop/src/renderer/src/features/settings/planner-section.tsx apps/desktop/src/renderer/src/hooks/use-settings.ts apps/desktop/src/renderer/src/features/settings/concurrency-section.test.ts
git commit -m "feat: make concurrency and planner settings fully editable"
```

### Task 6: Interruptible Chat State And Composer Queue

**Files:**
- Modify: `apps/desktop/src/renderer/src/store/app-store.ts`
- Modify: `apps/desktop/src/renderer/src/hooks/use-chat.ts`
- Modify: `apps/desktop/src/renderer/src/features/chat/composer.tsx`
- Modify: `apps/desktop/src/renderer/src/features/chat/chat-drawer.tsx`
- Modify: `apps/desktop/src/renderer/src/features/chat/message-list.tsx`
- Test: `apps/desktop/src/renderer/src/features/chat/message-list.test.ts`
- Test: `apps/desktop/src/renderer/src/features/chat/chat-drawer.test.tsx`

**Step 1: Write the failing test**

Add renderer tests for:
- composer stays enabled while `isThinking`
- `Stop` button appears during streaming
- send pressed during streaming adds to a per-thread queue instead of dispatching immediately
- queued messages flush in FIFO order after stop or completion

**Step 2: Run tests to verify they fail**

Run:
```bash
pnpm exec vitest run apps/desktop/src/renderer/src/features/chat/message-list.test.ts apps/desktop/src/renderer/src/features/chat/chat-drawer.test.tsx
```

Expected:
- FAIL because the current composer is disabled during streaming

**Step 3: Write minimal implementation**

Add store state keyed by thread for:

```ts
type PendingChatQueueState = {
  queuedMessages: string[];
  isStopping: boolean;
};
```

Update `Composer` so:
- textarea is never disabled by agent streaming
- send during streaming enqueues locally
- stop invokes `ipc.chat.stop({ threadId })`

Update `ChatDrawer` so:
- it flushes the next queued message when the thread becomes idle
- it does not start the next queued message while `isStopping` is true

**Step 4: Run tests to verify they pass**

Run:
```bash
pnpm exec vitest run apps/desktop/src/renderer/src/features/chat/message-list.test.ts apps/desktop/src/renderer/src/features/chat/chat-drawer.test.tsx
```

Expected:
- PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/store/app-store.ts apps/desktop/src/renderer/src/hooks/use-chat.ts apps/desktop/src/renderer/src/features/chat/composer.tsx apps/desktop/src/renderer/src/features/chat/chat-drawer.tsx apps/desktop/src/renderer/src/features/chat/message-list.tsx apps/desktop/src/renderer/src/features/chat/message-list.test.ts apps/desktop/src/renderer/src/features/chat/chat-drawer.test.tsx
git commit -m "feat: make direct chat interruptible and queue follow-ups"
```

### Task 7: Focused Verification

**Files:**
- Verify only

**Step 1: Run orchestrator and IPC tests**

Run:
```bash
pnpm exec vitest run apps/desktop/src/main/orchestrator/orchestrator.test.ts apps/desktop/src/main/orchestrator/run-agent.test.ts apps/desktop/src/main/ipc/handlers.test.ts
```

Expected:
- PASS

**Step 2: Run provider-router tests**

Run:
```bash
pnpm exec vitest run packages/provider-router/src/adapters/ollama.test.ts
```

Expected:
- PASS

**Step 3: Run renderer settings and chat tests**

Run:
```bash
pnpm exec vitest run apps/desktop/src/renderer/src/features/settings/concurrency-section.test.ts apps/desktop/src/renderer/src/features/chat/message-list.test.ts apps/desktop/src/renderer/src/features/chat/chat-drawer.test.tsx
```

Expected:
- PASS

**Step 4: Run broader desktop verification**

Run:
```bash
pnpm -F @team-x/desktop exec vitest run apps/desktop/src/main/orchestrator/orchestrator.test.ts apps/desktop/src/main/ipc/handlers.test.ts apps/desktop/src/renderer/src/features/chat/chat-drawer.test.tsx apps/desktop/src/renderer/src/features/settings/concurrency-section.test.ts
```

Expected:
- PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "test: verify runtime limits and interruptible chat changes"
```

### Task 8: Manual Dev Verification

**Files:**
- Verify only

**Step 1: Start the app**

Run:
```bash
pnpm dev
```

Expected:
- renderer loads
- main reaches `orchestrator + IPC ready`

**Step 2: Verify runtime settings**

Manual checks:
- set `Orchestrator Slots` to a value above `10`
- set `ollama` cap and one cloud-provider cap to different values
- confirm new work follows the updated limits without restarting the app

**Step 3: Verify planner settings**

Manual checks:
- `Max Nesting Depth` allows `32`
- `Max Tickets per Plan` allows `200`

**Step 4: Verify direct chat behavior**

Manual checks:
- while an employee is typing, the composer remains editable
- pressing send while streaming queues the follow-up
- pressing `Stop` ends the current turn
- queued follow-up sends automatically after stop or natural completion

**Step 5: Commit**

```bash
git add -A
git commit -m "docs: record manual verification for runtime limits and chat ux"
```

### Task 9: Optional Follow-Up Audit

**Files:**
- Modify as needed after verification

**Step 1: Audit for any remaining fake settings**

Check:
- settings shown in UI but ignored at runtime
- hidden hardcoded clamps left in renderer or main

**Step 2: Fix any discovered holdouts**

Run focused tests for whichever surface changed.

**Step 3: Re-run verification**

Run:
```bash
pnpm exec vitest run apps/desktop/src/main/orchestrator/orchestrator.test.ts apps/desktop/src/main/ipc/handlers.test.ts apps/desktop/src/renderer/src/features/chat/chat-drawer.test.tsx
```

Expected:
- PASS

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: clean up remaining runtime limit holdouts"
```

Plan complete and saved to `docs/plans/2026-04-21-runtime-limits-and-interruptible-chat.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
