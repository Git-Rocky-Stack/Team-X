/**
 * Work queue tests.
 *
 * Concurrency tests use manually-resolvable promises (`deferred`) instead
 * of fake timers. Reason: vitest's fake timers don't move microtasks, and
 * the queue's slot bookkeeping happens entirely on the microtask queue
 * (`Promise.resolve().then(...).finally(...)`). Real promise-based control
 * is both faster and more honest about the order things settle.
 *
 * The `flushMicrotasks` helper drains queued microtasks by yielding to a
 * macrotask (`setTimeout(0)`), then awaits a few microtasks for good
 * measure. We need this because dispatching a task uses three chained
 * `.then` callbacks (`Promise.resolve → task → settle → finally`), so a
 * single `await Promise.resolve()` is not enough to observe the new
 * inFlight state after a task settles.
 */

import { describe, expect, it, vi } from 'vitest';

import { createWorkQueue } from './queue.js';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Yield to a macrotask so all currently-queued microtasks settle. The
 * queue's dispatch chain spans several microtask hops; this helper makes
 * the test wait long enough to observe state transitions deterministically.
 */
async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 0));
  // A few extra microtask yields catch any chained `.finally` callbacks
  // that re-entered `dispatch()`.
  for (let i = 0; i < 4; i++) await Promise.resolve();
}

describe('createWorkQueue', () => {
  describe('options validation', () => {
    it('throws if slots is zero', () => {
      expect(() => createWorkQueue({ slots: 0 })).toThrow(/positive integer/);
    });

    it('throws if slots is negative', () => {
      expect(() => createWorkQueue({ slots: -1 })).toThrow(/positive integer/);
    });

    it('throws if slots is fractional', () => {
      expect(() => createWorkQueue({ slots: 1.5 })).toThrow(/positive integer/);
    });
  });

  describe('basic dispatch', () => {
    it('runs a single enqueued task and resolves with its value', async () => {
      const q = createWorkQueue({ slots: 1 });
      const result = await q.enqueue(async () => 42);
      expect(result).toBe(42);
    });

    it('propagates a task rejection to the enqueue caller', async () => {
      const q = createWorkQueue({ slots: 1 });
      const err = new Error('boom');
      await expect(q.enqueue(async () => Promise.reject(err))).rejects.toBe(err);
    });

    it('propagates a synchronous throw inside the task to the enqueue caller', async () => {
      const q = createWorkQueue({ slots: 1 });
      await expect(
        q.enqueue(async () => {
          throw new Error('sync boom');
        }),
      ).rejects.toThrow('sync boom');
    });

    it('runs the task asynchronously even when the queue is empty', async () => {
      // The queue must yield at least one microtask before invoking the task,
      // otherwise an `enqueue` call inside another task callback could
      // re-enter dispatch and break expectations about ordering.
      const q = createWorkQueue({ slots: 1 });
      const order: string[] = [];
      const promise = q.enqueue(async () => {
        order.push('task');
      });
      order.push('after-enqueue');
      await promise;
      expect(order).toEqual(['after-enqueue', 'task']);
    });
  });

  describe('concurrency cap', () => {
    it('runs at most `slots` tasks concurrently', async () => {
      const q = createWorkQueue({ slots: 2 });
      const d1 = deferred<void>();
      const d2 = deferred<void>();
      const d3 = deferred<void>();
      const d4 = deferred<void>();
      const started: number[] = [];

      const make = (i: number, d: Deferred<void>) => async () => {
        started.push(i);
        return d.promise;
      };

      const p1 = q.enqueue(make(1, d1));
      const p2 = q.enqueue(make(2, d2));
      const p3 = q.enqueue(make(3, d3));
      const p4 = q.enqueue(make(4, d4));

      await flushMicrotasks();
      // Only the first two tasks have started.
      expect(started).toEqual([1, 2]);
      expect(q.inFlight).toBe(2);
      expect(q.pending).toBe(2);
      expect(q.size).toBe(4);

      // Resolve task 1; task 3 must take its slot.
      d1.resolve();
      await p1;
      await flushMicrotasks();
      expect(started).toEqual([1, 2, 3]);
      expect(q.inFlight).toBe(2);
      expect(q.pending).toBe(1);

      // Resolve task 2; task 4 must take the slot.
      d2.resolve();
      await p2;
      await flushMicrotasks();
      expect(started).toEqual([1, 2, 3, 4]);
      expect(q.inFlight).toBe(2);
      expect(q.pending).toBe(0);

      // Drain the rest.
      d3.resolve();
      d4.resolve();
      await Promise.all([p3, p4]);
      await flushMicrotasks();
      expect(q.inFlight).toBe(0);
      expect(q.size).toBe(0);
    });

    it('with slots=1, completion order equals enqueue order (strict FIFO)', async () => {
      const q = createWorkQueue({ slots: 1 });
      const completed: number[] = [];
      const tasks = [1, 2, 3, 4, 5].map((i) =>
        q.enqueue(async () => {
          // Vary microtask depth to make sure the queue serializes
          // regardless of how each task internally schedules work.
          await Promise.resolve();
          await Promise.resolve();
          completed.push(i);
        }),
      );
      await Promise.all(tasks);
      expect(completed).toEqual([1, 2, 3, 4, 5]);
    });

    it('dispatch order is FIFO even when slots > 1', async () => {
      // Dispatch order != completion order with slots > 1, but the
      // first N tasks (where N = slots) must always be the first N
      // enqueued.
      const q = createWorkQueue({ slots: 3 });
      const dispatched: number[] = [];
      const ds = [0, 1, 2, 3, 4, 5, 6].map(() => deferred<void>());
      const ps = ds.map((d, i) =>
        q.enqueue(async () => {
          dispatched.push(i);
          return d.promise;
        }),
      );
      await flushMicrotasks();
      expect(dispatched).toEqual([0, 1, 2]);
      ds[0]?.resolve();
      await ps[0];
      await flushMicrotasks();
      expect(dispatched).toEqual([0, 1, 2, 3]);
      ds[1]?.resolve();
      await ps[1];
      await flushMicrotasks();
      expect(dispatched).toEqual([0, 1, 2, 3, 4]);
      // Clean up.
      for (const d of ds) d.resolve();
      await Promise.all(ps);
    });
  });

  describe('slot release on completion', () => {
    it('frees the slot when a task succeeds', async () => {
      const q = createWorkQueue({ slots: 1 });
      await q.enqueue(async () => 'a');
      expect(q.inFlight).toBe(0);
      await q.enqueue(async () => 'b');
      expect(q.inFlight).toBe(0);
    });

    it('frees the slot when a task throws', async () => {
      const q = createWorkQueue({ slots: 1 });
      await expect(
        q.enqueue(async () => {
          throw new Error('x');
        }),
      ).rejects.toThrow('x');
      expect(q.inFlight).toBe(0);
      // The next task must run, proving the slot is not leaked.
      const v = await q.enqueue(async () => 'after');
      expect(v).toBe('after');
    });

    it('errors do not block subsequent dispatches', async () => {
      const q = createWorkQueue({ slots: 2 });
      const results = await Promise.allSettled([
        q.enqueue(async () => {
          throw new Error('first fails');
        }),
        q.enqueue(async () => 'ok-1'),
        q.enqueue(async () => {
          throw new Error('third fails');
        }),
        q.enqueue(async () => 'ok-2'),
      ]);
      expect(results[0]?.status).toBe('rejected');
      expect(results[1]?.status).toBe('fulfilled');
      expect(results[2]?.status).toBe('rejected');
      expect(results[3]?.status).toBe('fulfilled');
      expect(q.inFlight).toBe(0);
    });
  });

  describe('pause / resume', () => {
    it('pause prevents new dispatches', async () => {
      const q = createWorkQueue({ slots: 10 });
      q.pause();
      const ran = vi.fn(async () => undefined);
      q.enqueue(ran);
      q.enqueue(ran);
      q.enqueue(ran);
      await flushMicrotasks();
      expect(ran).not.toHaveBeenCalled();
      expect(q.pending).toBe(3);
      expect(q.inFlight).toBe(0);
      expect(q.isPaused).toBe(true);
    });

    it('pause does NOT preempt in-flight tasks', async () => {
      const q = createWorkQueue({ slots: 1 });
      const d = deferred<void>();
      const p = q.enqueue(async () => {
        await d.promise;
      });
      await flushMicrotasks();
      expect(q.inFlight).toBe(1);
      q.pause();
      expect(q.inFlight).toBe(1); // unchanged
      d.resolve();
      await p;
      expect(q.inFlight).toBe(0);
    });

    it('resume drains the backlog up to slots', async () => {
      const q = createWorkQueue({ slots: 2 });
      q.pause();
      const ran: number[] = [];
      const ds = [0, 1, 2, 3].map(() => deferred<void>());
      const ps = ds.map((d, i) =>
        q.enqueue(async () => {
          ran.push(i);
          return d.promise;
        }),
      );
      await flushMicrotasks();
      expect(ran).toEqual([]);

      q.resume();
      await flushMicrotasks();
      expect(ran).toEqual([0, 1]);
      expect(q.inFlight).toBe(2);

      // Clean up.
      for (const d of ds) d.resolve();
      await Promise.all(ps);
    });

    it('pause and resume are idempotent', () => {
      const q = createWorkQueue({ slots: 1 });
      expect(q.isPaused).toBe(false);
      q.resume(); // no-op when already running
      expect(q.isPaused).toBe(false);
      q.pause();
      q.pause();
      expect(q.isPaused).toBe(true);
      q.resume();
      q.resume();
      expect(q.isPaused).toBe(false);
    });
  });

  describe('drain', () => {
    it('resolves immediately when nothing is in flight', async () => {
      const q = createWorkQueue({ slots: 1 });
      await expect(q.drain()).resolves.toBeUndefined();
    });

    it('resolves once all in-flight tasks have settled', async () => {
      const q = createWorkQueue({ slots: 2 });
      const d1 = deferred<void>();
      const d2 = deferred<void>();
      q.enqueue(async () => d1.promise);
      q.enqueue(async () => d2.promise);
      await flushMicrotasks();

      let drained = false;
      const drainP = q.drain().then(() => {
        drained = true;
      });
      await flushMicrotasks();
      expect(drained).toBe(false);

      d1.resolve();
      await flushMicrotasks();
      expect(drained).toBe(false); // still one in flight

      d2.resolve();
      await drainP;
      expect(drained).toBe(true);
      expect(q.inFlight).toBe(0);
    });

    it('resolves once the entire backlog clears in non-paused state', async () => {
      const q = createWorkQueue({ slots: 1 });
      const ds = [0, 1, 2].map(() => deferred<void>());
      for (const d of ds) {
        q.enqueue(async () => d.promise);
      }
      const drainP = q.drain();
      let drained = false;
      drainP.then(() => {
        drained = true;
      });

      await flushMicrotasks();
      expect(drained).toBe(false);
      ds[0]?.resolve();
      await flushMicrotasks();
      expect(drained).toBe(false);
      ds[1]?.resolve();
      await flushMicrotasks();
      expect(drained).toBe(false);
      ds[2]?.resolve();
      await drainP;
      expect(drained).toBe(true);
    });

    it('resolves when in-flight clears even if there are still queued items (paused state)', async () => {
      // This is the graceful-shutdown semantic: pause() then drain()
      // waits for currently-running work to finish but lets queued items
      // sit untouched. The user is expected to discard the queue or
      // resume on next boot.
      const q = createWorkQueue({ slots: 1 });
      const inFlightDeferred = deferred<void>();
      // The first task occupies the only slot.
      const p1 = q.enqueue(async () => inFlightDeferred.promise);
      await flushMicrotasks();
      // Two more queued behind it.
      q.enqueue(async () => undefined);
      q.enqueue(async () => undefined);
      expect(q.inFlight).toBe(1);
      expect(q.pending).toBe(2);

      q.pause();
      const drainP = q.drain();
      let drained = false;
      drainP.then(() => {
        drained = true;
      });

      await flushMicrotasks();
      expect(drained).toBe(false);

      inFlightDeferred.resolve();
      await p1;
      await drainP;
      expect(drained).toBe(true);
      // The two queued tasks are still pending — pause held them back.
      expect(q.pending).toBe(2);
      expect(q.inFlight).toBe(0);
    });

    it('multiple concurrent drain() callers all resolve at the same time', async () => {
      const q = createWorkQueue({ slots: 1 });
      const d = deferred<void>();
      q.enqueue(async () => d.promise);
      await flushMicrotasks();
      const a = q.drain();
      const b = q.drain();
      const c = q.drain();
      d.resolve();
      await Promise.all([a, b, c]);
      // No assertion beyond "did not hang" — Promise.all resolving is the
      // assertion.
    });
  });

  describe('counters', () => {
    it('size, inFlight, and pending stay in sync through the lifecycle', async () => {
      const q = createWorkQueue({ slots: 2 });
      expect(q.size).toBe(0);
      expect(q.inFlight).toBe(0);
      expect(q.pending).toBe(0);

      const ds = [0, 1, 2, 3].map(() => deferred<void>());
      const ps = ds.map((d) => q.enqueue(async () => d.promise));
      await flushMicrotasks();
      expect(q.size).toBe(4);
      expect(q.inFlight).toBe(2);
      expect(q.pending).toBe(2);

      ds[0]?.resolve();
      await ps[0];
      await flushMicrotasks();
      expect(q.size).toBe(3);
      expect(q.inFlight).toBe(2);
      expect(q.pending).toBe(1);

      ds[1]?.resolve();
      await ps[1];
      await flushMicrotasks();
      expect(q.size).toBe(2);
      expect(q.inFlight).toBe(2);
      expect(q.pending).toBe(0);

      ds[2]?.resolve();
      ds[3]?.resolve();
      await Promise.all([ps[2], ps[3]]);
      await flushMicrotasks();
      expect(q.size).toBe(0);
      expect(q.inFlight).toBe(0);
      expect(q.pending).toBe(0);
    });
  });
});
