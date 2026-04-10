/**
 * Work queue — FIFO async queue with a slot semaphore, pause/resume, and
 * drain.
 *
 * This is the orchestrator's only scheduler primitive (CLAUDE.md
 * invariant #2: "Orchestrator is the only scheduler. If the orchestrator
 * says pause, nothing new dispatches."). Every agent execution, every
 * meeting turn, every background MCP call funnels through one of these.
 *
 * Why hand-roll instead of pulling p-queue / p-limit:
 *   - We need pause/resume baked into the semaphore semantics, not as a
 *     pre-filter — pause must take effect mid-dispatch so a meeting
 *     primitive can land race-free.
 *   - The orchestrator runs in the Electron main process. Every
 *     dependency adds startup cost and another supply-chain surface.
 *   - The implementation is ~80 lines of well-tested code; the dependency
 *     would be the same lines plus a versioned API surface to babysit.
 *
 * Concurrency model:
 *
 *   - `slots` is a hard cap on simultaneously-running tasks. Items above
 *     the cap wait in a FIFO queue.
 *   - Tasks dispatch in enqueue order. With `slots > 1`, dispatch is FIFO
 *     but completion order depends on per-task duration (a slow first
 *     task can finish after a fast second task). With `slots = 1`,
 *     dispatch and completion are both strictly FIFO.
 *   - Pausing prevents NEW dispatches. In-flight tasks are NOT preempted —
 *     this is a soft pause, the right semantic for agents that may be
 *     mid-stream when a meeting starts.
 *   - Drain returns a Promise that resolves the next time `inFlight`
 *     reaches zero. Combine `pause()` + `drain()` for graceful shutdown:
 *     pause stops new dispatches, drain waits for current ones to settle.
 *     Without pause, drain blocks until both the queue and the in-flight
 *     set are empty (i.e. the producer has stopped enqueueing AND the
 *     backlog has cleared).
 *   - Errors thrown or rejected by a task propagate to the Promise
 *     returned from `enqueue` — the queue does NOT swallow them. The
 *     slot is released on both success and failure paths so a flaky
 *     task can never leak capacity.
 *
 * Drain is intentionally NOT a lifecycle method. The queue itself has no
 * "shutdown" — the orchestrator owns lifecycle. Reusing a drained queue
 * is fine: enqueue more work and it will dispatch.
 */

/**
 * Any zero-arg async function. The queue treats `task()` as a black box —
 * it does not retry, time out, or inspect the resolved value. Result type
 * `T` flows back through `enqueue<T>` so callers keep their compile-time
 * shape.
 */
export type WorkTask<T = void> = () => Promise<T>;

export interface WorkQueueOptions {
  /**
   * Maximum number of tasks running at once. Must be a positive integer.
   * Phase 1 default-binds this to a per-provider cap (anthropic=4,
   * ollama=1, openai=6, …). The queue does not enforce providers — that
   * is the caller's responsibility.
   */
  slots: number;
}

export interface WorkQueue {
  /**
   * Submit a task for execution. Returns a Promise that resolves with
   * the task's result (or rejects with its error) once the task has
   * actually run. The Promise does NOT track queue position — only the
   * eventual outcome.
   *
   * Tasks are dispatched in submission order whenever a slot is free
   * AND the queue is not paused.
   */
  enqueue<T>(task: WorkTask<T>): Promise<T>;

  /**
   * Stop dispatching new tasks. In-flight tasks continue to completion.
   * Subsequent `enqueue` calls are accepted but their tasks remain in
   * the FIFO until `resume` is called. Idempotent.
   */
  pause(): void;

  /**
   * Resume dispatching. Any backlog accumulated during the paused
   * interval flushes immediately, subject to the `slots` cap. Idempotent.
   */
  resume(): void;

  /**
   * Returns a Promise that resolves the next time `inFlight` reaches
   * zero. If `inFlight` is already zero at call time, the Promise
   * resolves on the next microtask. Does NOT prevent new dispatches —
   * combine with `pause()` for clean shutdown.
   */
  drain(): Promise<void>;

  /** Total work known to the queue (queued + currently running). */
  readonly size: number;
  /** Tasks currently running. */
  readonly inFlight: number;
  /** Tasks waiting for a slot to free up. */
  readonly pending: number;
  /** Whether `pause()` has been called more recently than `resume()`. */
  readonly isPaused: boolean;
}

interface Job<T = unknown> {
  task: WorkTask<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export function createWorkQueue(options: WorkQueueOptions): WorkQueue {
  const slots = options.slots;
  if (!Number.isInteger(slots) || slots < 1) {
    throw new Error(`createWorkQueue: slots must be a positive integer, got ${slots}`);
  }

  let inFlight = 0;
  let paused = false;
  const queue: Job[] = [];
  const drainWaiters: Array<() => void> = [];

  function notifyDrainIfIdle(): void {
    if (inFlight === 0 && drainWaiters.length > 0) {
      // Snapshot then clear so a drain waiter that re-arms drain inside
      // its own .then() does not see itself in the live waiters list.
      const waiters = drainWaiters.splice(0, drainWaiters.length);
      for (const w of waiters) w();
    }
  }

  function dispatch(): void {
    while (!paused && inFlight < slots && queue.length > 0) {
      const job = queue.shift();
      // The shift cannot return undefined here — queue.length > 0 was
      // checked above — but TypeScript doesn't know that.
      if (!job) continue;
      inFlight++;
      // Wrap synchronous throws in a rejected promise so the slot
      // bookkeeping path is identical for sync-throw, async-throw, and
      // resolve.
      //
      // Bookkeeping order matters: `inFlight--` MUST happen BEFORE
      // `job.resolve/reject`. The outer enqueue Promise's `await`
      // continuation is queued the moment we settle it, and a `.finally`
      // bookkeeping callback would run in a SEPARATE later microtask —
      // so by the time the test code runs `expect(q.inFlight).toBe(0)`
      // after `await p`, the slot would still look occupied. Decrementing
      // inline avoids that observable race entirely.
      //
      // We then call `dispatch()` synchronously to pull the next task
      // off the backlog. In a backlog-with-multiple-tasks case the
      // observer of `await enqueue(...)` will see inFlight already
      // bumped back up — that is correct, because the slot was
      // genuinely re-allocated before the await continuation ran. The
      // contract is "after `await p`, the SLOT FROM THIS TASK is free",
      // not "the queue has zero tasks running".
      Promise.resolve()
        .then(() => job.task())
        .then(
          (value) => {
            inFlight--;
            job.resolve(value);
            dispatch();
            notifyDrainIfIdle();
          },
          (err) => {
            inFlight--;
            job.reject(err);
            dispatch();
            notifyDrainIfIdle();
          },
        );
    }
  }

  return {
    enqueue<T>(task: WorkTask<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        // The Job type is invariant in T (it stores both a task that
        // PRODUCES T and a resolve that CONSUMES T), so we can't
        // express it as `Job<T>` in the shared array. The cast is
        // safe because resolve/task are paired at insertion time and
        // never crossed afterwards.
        queue.push({ task, resolve, reject } as unknown as Job<unknown>);
        dispatch();
      });
    },

    pause(): void {
      paused = true;
    },

    resume(): void {
      if (!paused) return;
      paused = false;
      dispatch();
    },

    drain(): Promise<void> {
      if (inFlight === 0) {
        // Resolve on the next microtask so drain() is always
        // asynchronous regardless of state. This avoids subtle bugs
        // where a caller assumed `await drain()` yielded the event
        // loop and the queue was idle by the time their next line ran.
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        drainWaiters.push(resolve);
      });
    },

    get size() {
      return queue.length + inFlight;
    },
    get inFlight() {
      return inFlight;
    },
    get pending() {
      return queue.length;
    },
    get isPaused() {
      return paused;
    },
  };
}
