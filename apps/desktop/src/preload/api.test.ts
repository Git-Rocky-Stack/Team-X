import type { DashboardEvent } from '@team-x/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type IpcRendererLike, PRELOAD_CHANNELS, buildTeamXApi } from './api.js';

/**
 * Tests for the preload `buildTeamXApi` factory.
 *
 * The factory is pure TypeScript — it captures an `IpcRendererLike`
 * in a closure and routes each `TeamXApi` method through it. These
 * tests exercise the factory with a hand-rolled fake that records
 * every invoke / on / removeListener call so we can assert:
 *
 *   1. Channel names pin exactly to the `PRELOAD_CHANNELS` table
 *      (so a typo here would match the channel constant check but
 *      diverge from the main-process register layer's string, and
 *      that would be caught by the Playwright smoke test in T49).
 *
 *   2. Argument shapes pin exactly (positional companyId becomes
 *      `{ companyId }`, raw threadId becomes `{ threadId }`,
 *      chat.send request is forwarded verbatim).
 *
 *   3. Return values from `ipc.invoke` pass through untouched — we
 *      do not double-wrap promises, we do not map properties.
 *
 *   4. `events.onDashboard` attaches a listener, strips the ipc
 *      event argument from the callback invocation, and returns an
 *      unsubscribe function that removes THE SAME wrapper the
 *      subscribe call attached.
 *
 * The fake IPC transport intentionally stores listeners in a
 * `Map<channel, Set<listener>>` so tests can emit synthetic events
 * by reaching into the map and calling every listener directly — the
 * same pattern the real `ipcRenderer.on` uses internally.
 */

interface InvokeCall {
  channel: string;
  args: unknown[];
}

interface ListenerRef {
  channel: string;
  fn: (event: unknown, ...args: unknown[]) => void;
}

/**
 * Build a fake `IpcRendererLike` for tests. Records every call and
 * exposes an `emit` helper so tests can simulate main-process events.
 */
function makeFakeIpc() {
  const invokeCalls: InvokeCall[] = [];
  const listeners = new Map<string, Set<(event: unknown, ...args: unknown[]) => void>>();
  const removed: ListenerRef[] = [];

  let nextInvokeResult: unknown = undefined;

  const ipc: IpcRendererLike = {
    invoke: async (channel: string, ...args: unknown[]) => {
      invokeCalls.push({ channel, args });
      return nextInvokeResult;
    },
    on: (channel, listener) => {
      const set = listeners.get(channel) ?? new Set();
      set.add(listener);
      listeners.set(channel, set);
      return undefined;
    },
    removeListener: (channel, listener) => {
      const set = listeners.get(channel);
      set?.delete(listener);
      removed.push({ channel, fn: listener });
      return undefined;
    },
  };

  return {
    ipc,
    invokeCalls,
    listeners,
    removed,
    setNextInvokeResult(value: unknown) {
      nextInvokeResult = value;
    },
    /** Synthetic event emit — mimics the real ipcRenderer handing a payload to every attached listener. */
    emit(channel: string, ...payloads: unknown[]) {
      const set = listeners.get(channel);
      if (!set) return;
      for (const l of set) l({ senderId: 1 }, ...payloads);
    },
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('buildTeamXApi', () => {
  let fake: ReturnType<typeof makeFakeIpc>;
  let api: ReturnType<typeof buildTeamXApi>;

  beforeEach(() => {
    fake = makeFakeIpc();
    api = buildTeamXApi(fake.ipc);
  });

  describe('system.selectDirectory', () => {
    it('invokes system.selectDirectory without request args', async () => {
      fake.setNextInvokeResult({ canceled: false, folderPath: 'C:/skills/ops' });
      await api.system.selectDirectory();
      expect(fake.invokeCalls).toEqual([
        { channel: PRELOAD_CHANNELS.systemSelectDirectory, args: [] },
      ]);
    });
  });

  describe('employees.list', () => {
    it('invokes employees.list with a { companyId } object', async () => {
      fake.setNextInvokeResult([]);
      await api.employees.list('co-1');
      expect(fake.invokeCalls).toEqual([
        { channel: PRELOAD_CHANNELS.employeesList, args: [{ companyId: 'co-1' }] },
      ]);
    });

    it('passes through the resolved array of employees from invoke', async () => {
      const stub = [{ id: 'e1' }, { id: 'e2' }];
      fake.setNextInvokeResult(stub);
      const result = await api.employees.list('co-1');
      expect(result).toBe(stub);
    });
  });

  describe('employees.update', () => {
    it('invokes employees.update with the request object verbatim', async () => {
      fake.setNextInvokeResult({ employee: { id: 'emp-1', name: 'Nadia' } });
      const req = { employeeId: 'emp-1', name: 'Nadia', title: 'CTO' } as const;
      await api.employees.update(req);
      expect(fake.invokeCalls).toEqual([
        { channel: (PRELOAD_CHANNELS as Record<string, string>).employeesUpdate, args: [req] },
      ]);
    });
  });

  describe('chat.send', () => {
    it('invokes chat.send with the request object verbatim', async () => {
      fake.setNextInvokeResult({ threadId: 't-1', messageId: 'm-1' });
      const req = { threadId: 'auto', employeeId: 'e-1', content: 'hi' } as const;
      await api.chat.send(req);
      expect(fake.invokeCalls).toEqual([{ channel: PRELOAD_CHANNELS.chatSend, args: [req] }]);
    });

    it('passes through the SendChatResponse from invoke', async () => {
      const stub = { threadId: 't-resolved', messageId: 'm-99' };
      fake.setNextInvokeResult(stub);
      const result = await api.chat.send({
        threadId: 'auto',
        employeeId: 'e-1',
        content: 'hi',
      });
      expect(result).toBe(stub);
    });
  });

  describe('chat.list', () => {
    it('invokes chat.list with a { threadId } object', async () => {
      fake.setNextInvokeResult([]);
      await api.chat.list('thread-7');
      expect(fake.invokeCalls).toEqual([
        { channel: PRELOAD_CHANNELS.chatList, args: [{ threadId: 'thread-7' }] },
      ]);
    });

    it('passes through the resolved array of messages from invoke', async () => {
      const stub = [{ id: 'm1' }, { id: 'm2' }];
      fake.setNextInvokeResult(stub);
      const result = await api.chat.list('thread-7');
      expect(result).toBe(stub);
    });
  });

  describe('chat.stop', () => {
    it('invokes chat.stop with the request object verbatim', async () => {
      fake.setNextInvokeResult({ stopped: true });
      const stop = (api.chat as unknown as { stop(req: { threadId: string }): Promise<unknown> })
        .stop;
      const channels = PRELOAD_CHANNELS as Record<string, string>;
      await stop({ threadId: 'thread-7' });
      expect(fake.invokeCalls).toEqual([
        { channel: channels.chatStop, args: [{ threadId: 'thread-7' }] },
      ]);
    });
  });

  describe('chat.resolveThread', () => {
    it('invokes chat.resolveThread with the request object verbatim', async () => {
      fake.setNextInvokeResult({ threadId: 'dm-1' });
      await api.chat.resolveThread({ employeeId: 'emp-iris' });
      expect(fake.invokeCalls).toEqual([
        { channel: PRELOAD_CHANNELS.chatResolveThread, args: [{ employeeId: 'emp-iris' }] },
      ]);
    });

    it('passes through the ResolveThreadResponse from invoke', async () => {
      const stub = { threadId: 'dm-resolved' };
      fake.setNextInvokeResult(stub);
      const result = await api.chat.resolveThread({ employeeId: 'emp-iris' });
      expect(result).toBe(stub);
    });
  });

  describe('providers.listModels', () => {
    it('invokes providers.listModels with a { providerId } object', async () => {
      fake.setNextInvokeResult({ models: ['glm-5:cloud'] });
      await (
        api.providers as unknown as { listModels(providerId: string): Promise<unknown> }
      ).listModels('ollama-local');
      expect(fake.invokeCalls).toEqual([
        { channel: PRELOAD_CHANNELS.providersListModels, args: [{ providerId: 'ollama-local' }] },
      ]);
    });
  });

  describe('telemetry.recentRuns', () => {
    it('invokes telemetry.recentRuns with the request object verbatim', async () => {
      fake.setNextInvokeResult([]);
      await api.telemetry.recentRuns({ companyId: 'co-1', kind: 'agentic', limit: 6 });
      expect(fake.invokeCalls).toEqual([
        {
          channel: PRELOAD_CHANNELS.telemetryRecentRuns,
          args: [{ companyId: 'co-1', kind: 'agentic', limit: 6 }],
        },
      ]);
    });
  });

  describe('runtimeOperations.snapshot', () => {
    it('invokes runtimeOperations.snapshot with a { companyId } object', async () => {
      fake.setNextInvokeResult({
        companyId: 'co-1',
        generatedAt: 1,
        sessions: [],
        activeCheckouts: [],
      });
      await api.runtimeOperations.snapshot('co-1');
      expect(fake.invokeCalls).toEqual([
        {
          channel: (PRELOAD_CHANNELS as Record<string, string>).runtimeOperationsSnapshot,
          args: [{ companyId: 'co-1' }],
        },
      ]);
    });
  });

  describe('autonomyDoctor.run', () => {
    it('invokes autonomyDoctor.run with a { companyId } object', async () => {
      fake.setNextInvokeResult({
        companyId: 'co-1',
        generatedAt: 1,
        status: 'ok',
        checks: [],
        totals: { ok: 0, warning: 0, blocked: 0, findingCount: 0 },
      });
      await api.autonomyDoctor.run('co-1');
      expect(fake.invokeCalls).toEqual([
        {
          channel: (PRELOAD_CHANNELS as Record<string, string>).autonomyDoctorRun,
          args: [{ companyId: 'co-1' }],
        },
      ]);
    });
  });

  describe('autonomyBenchmark.run', () => {
    it('invokes autonomyBenchmark.run with the request object verbatim', async () => {
      fake.setNextInvokeResult({
        id: 'benchmark-1',
        generatedAt: 1,
        mode: 'control-plane-simulated',
        runtimeKinds: ['bash'],
        scenarioIds: ['race-for-one-ticket'],
        results: [],
        summary: {
          scenarioCount: 0,
          passedCount: 0,
          failedCount: 0,
          successRate: 0,
          duplicateWorkRate: 0,
          meanLatencyMs: 0,
          meanStaleRecoveryMs: null,
          totalCostUsd: '0.000000',
          totalTokenCount: 0,
          operatorInterventions: 0,
          artifactCompleteness: 0,
        },
      });
      const req = {
        companyId: 'co-1',
        runtimeKinds: ['bash' as const],
        scenarioIds: ['race-for-one-ticket' as const],
      };

      await api.autonomyBenchmark.run(req);

      expect(fake.invokeCalls).toEqual([
        {
          channel: (PRELOAD_CHANNELS as Record<string, string>).autonomyBenchmarkRun,
          args: [req],
        },
      ]);
    });
  });

  describe('agentImprovement', () => {
    it('invokes agentImprovement.list with a { companyId } object', async () => {
      fake.setNextInvokeResult({
        companyId: 'co-1',
        generatedAt: 1,
        openTicketCount: 0,
        openTickets: [],
        recentRuns: [],
      });

      await api.agentImprovement.list('co-1');

      expect(fake.invokeCalls).toEqual([
        {
          channel: (PRELOAD_CHANNELS as Record<string, string>).agentImprovementList,
          args: [{ companyId: 'co-1' }],
        },
      ]);
    });

    it('invokes agentImprovement.run with the request object verbatim', async () => {
      const req = { companyId: 'co-1', eventLimit: 50 };
      fake.setNextInvokeResult({
        companyId: 'co-1',
        ranAt: 1,
        inspectedEventCount: 0,
        inspectedTicketCount: 0,
        recommendations: [],
        createdTicketIds: [],
        skippedExistingTicketIds: [],
      });

      await api.agentImprovement.run(req);

      expect(fake.invokeCalls).toEqual([
        {
          channel: (PRELOAD_CHANNELS as Record<string, string>).agentImprovementRun,
          args: [req],
        },
      ]);
    });
  });

  describe('events.onDashboard', () => {
    it('attaches a listener to events.dashboard', () => {
      const cb = vi.fn();
      api.events.onDashboard(cb);
      expect(fake.listeners.get(PRELOAD_CHANNELS.eventsDashboard)?.size).toBe(1);
    });

    it('forwards event payloads without the ipc event argument', () => {
      const cb = vi.fn();
      api.events.onDashboard(cb);
      const fakeEvent = { id: 'evt-1', type: 'token.delta' } as unknown as DashboardEvent;
      fake.emit(PRELOAD_CHANNELS.eventsDashboard, fakeEvent);
      expect(cb).toHaveBeenCalledTimes(1);
      // The callback should receive ONLY the payload — no leading
      // IpcRendererEvent-like first arg.
      expect(cb).toHaveBeenCalledWith(fakeEvent);
    });

    it('calls the listener once per emitted event', () => {
      const cb = vi.fn();
      api.events.onDashboard(cb);
      fake.emit(PRELOAD_CHANNELS.eventsDashboard, { id: 'a' });
      fake.emit(PRELOAD_CHANNELS.eventsDashboard, { id: 'b' });
      fake.emit(PRELOAD_CHANNELS.eventsDashboard, { id: 'c' });
      expect(cb).toHaveBeenCalledTimes(3);
    });

    it('returns an unsubscribe that stops future events from reaching the listener', () => {
      const cb = vi.fn();
      const unsubscribe = api.events.onDashboard(cb);
      fake.emit(PRELOAD_CHANNELS.eventsDashboard, { id: 'before' });
      unsubscribe();
      fake.emit(PRELOAD_CHANNELS.eventsDashboard, { id: 'after' });
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith({ id: 'before' });
    });

    it('unsubscribe removes the exact same wrapped listener that was attached', () => {
      const cb = vi.fn();
      const unsubscribe = api.events.onDashboard(cb);
      // Snapshot the attached listener — there should be exactly one.
      const attached = fake.listeners.get(PRELOAD_CHANNELS.eventsDashboard);
      expect(attached?.size).toBe(1);
      const listenerFn = [...(attached ?? [])][0];
      unsubscribe();
      expect(fake.removed).toHaveLength(1);
      expect(fake.removed[0]?.channel).toBe(PRELOAD_CHANNELS.eventsDashboard);
      expect(fake.removed[0]?.fn).toBe(listenerFn);
    });

    it('supports multiple concurrent subscribers with independent unsubscribes', () => {
      const a = vi.fn();
      const b = vi.fn();
      const c = vi.fn();
      const unsubA = api.events.onDashboard(a);
      api.events.onDashboard(b);
      api.events.onDashboard(c);

      fake.emit(PRELOAD_CHANNELS.eventsDashboard, { id: '1' });
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
      expect(c).toHaveBeenCalledTimes(1);

      unsubA();

      fake.emit(PRELOAD_CHANNELS.eventsDashboard, { id: '2' });
      expect(a).toHaveBeenCalledTimes(1); // no more events for a
      expect(b).toHaveBeenCalledTimes(2);
      expect(c).toHaveBeenCalledTimes(2);
    });
  });

  describe('channel constants', () => {
    it('PRELOAD_CHANNELS matches the shared-types IpcContract channel names', () => {
      const channels = PRELOAD_CHANNELS as Record<string, string>;
      expect(PRELOAD_CHANNELS.employeesList).toBe('employees.list');
      expect(channels.employeesUpdate).toBe('employees.update');
      expect(PRELOAD_CHANNELS.chatSend).toBe('chat.send');
      expect(PRELOAD_CHANNELS.chatList).toBe('chat.list');
      expect(channels.chatStop).toBe('chat.stop');
      expect(PRELOAD_CHANNELS.chatResolveThread).toBe('chat.resolveThread');
      expect(PRELOAD_CHANNELS.eventsDashboard).toBe('events.dashboard');
      expect(channels.telemetryRecentRuns).toBe('telemetry.recentRuns');
      expect(channels.autonomyDoctorRun).toBe('autonomyDoctor.run');
      expect(channels.autonomyBenchmarkRun).toBe('autonomyBenchmark.run');
      expect(channels.agentImprovementList).toBe('agentImprovement.list');
      expect(channels.agentImprovementRun).toBe('agentImprovement.run');
      expect(PRELOAD_CHANNELS.providersListModels).toBe('providers.listModels');
    });
  });
});
