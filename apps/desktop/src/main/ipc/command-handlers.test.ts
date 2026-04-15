/**
 * Unit tests for the M30 T5 `command.*` IPC handler factory.
 *
 * Scope — these tests verify the adapter layer ONLY:
 *   - channel keys match the `IpcContract` strings exactly,
 *   - request payloads are forwarded to the right `CommandService`
 *     method with the right positional arguments,
 *   - return values pass through untouched,
 *   - the destructive-confirmation gate is NOT silently bypassed,
 *   - service throws propagate so the `register.ts` wrapper sees them.
 *
 * The CommandService itself is mocked with a hand-rolled record of
 * `vi.fn()` returns — the classifier / resolver / slot-filler / repo
 * / bus are out of scope here (each has its own spec). No Electron
 * boot, no provider seams, no I/O.
 */

import { describe, expect, it, vi } from 'vitest';

import type {
  CommandHistoryRequest,
  CommandParseRequest,
  CommandSuggestRequest,
  IpcCommandHistoryEntry,
  IpcExecuteRequest,
  IpcExecuteResult,
  IpcParseResult,
  IpcSuggestItem,
} from '@team-x/shared-types';

import type { AgenticLoopRunState, AgenticLoopService } from '../services/agentic-loop-service.js';
import type { CommandService } from '../services/command-service.js';
import { buildCommandHandlers } from './command-handlers.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a CommandService stub where each of the four public methods
 * is a `vi.fn()` with a canned return value. The `stop` lifecycle
 * hook is a no-op fn — T5's handlers never call it, but we include
 * it so the mock structurally satisfies `CommandService` for the
 * compiler.
 */
function makeServiceMock(
  overrides: {
    parse?: IpcParseResult;
    execute?: IpcExecuteResult;
    history?: IpcCommandHistoryEntry[];
    suggest?: IpcSuggestItem[];
    parseImpl?: (text: string, context: unknown) => Promise<IpcParseResult>;
    executeImpl?: (req: IpcExecuteRequest) => Promise<IpcExecuteResult>;
    historyImpl?: (limit?: number, companyId?: string) => Promise<IpcCommandHistoryEntry[]>;
    suggestImpl?: (partial: string, context: unknown) => Promise<IpcSuggestItem[]>;
  } = {},
): CommandService {
  const defaultParse: IpcParseResult = {
    kind: 'ready',
    intent: 'check_status',
    entities: {},
    summary: 'Check team status',
  };
  const defaultExecute: IpcExecuteResult = {
    kind: 'ok',
    intent: 'check_status',
    summary: 'ok',
  };
  const defaultHistory: IpcCommandHistoryEntry[] = [];
  const defaultSuggest: IpcSuggestItem[] = [];

  return {
    parse: vi.fn(
      overrides.parseImpl ??
        (async () => (overrides.parse !== undefined ? overrides.parse : defaultParse)),
    ),
    execute: vi.fn(
      overrides.executeImpl ??
        (async () => (overrides.execute !== undefined ? overrides.execute : defaultExecute)),
    ),
    history: vi.fn(
      overrides.historyImpl ??
        (async () => (overrides.history !== undefined ? overrides.history : defaultHistory)),
    ),
    suggest: vi.fn(
      overrides.suggestImpl ??
        (async () => (overrides.suggest !== undefined ? overrides.suggest : defaultSuggest)),
    ),
    stop: vi.fn(),
  } as unknown as CommandService;
}

/**
 * Minimal `AgenticLoopService` stub for T6 `command.stop` tests. The
 * factory only ever touches `getRun()` + `stop()`; the other methods
 * are `vi.fn()` no-ops so the mock structurally satisfies the
 * interface for the TypeScript compiler.
 */
function makeAgenticMock(
  overrides: {
    getRun?: (runId: string) => AgenticLoopRunState | null;
    stopImpl?: (runId: string) => void;
  } = {},
): AgenticLoopService {
  return {
    start: vi.fn(),
    waitForRun: vi.fn(async () => undefined),
    getRun: vi.fn(overrides.getRun ?? (() => null)),
    stop: vi.fn(overrides.stopImpl ?? (() => undefined)),
  } as unknown as AgenticLoopService;
}

/**
 * Build a minimal `AgenticLoopRunState` with just the fields
 * `command.stop` probes (`runId`, `status`). The rest are filler so
 * the type checker is satisfied — no production code path reads them.
 */
function runStateFixture(overrides: Partial<AgenticLoopRunState> = {}): AgenticLoopRunState {
  return {
    runId: 'run_1',
    threadId: 'thread_1',
    companyId: 'company_1',
    systemAgentId: 'sys_agent',
    provider: 'test',
    model: 'test-model',
    startedAt: 0,
    endedAt: null,
    status: 'running',
    answer: null,
    errorReason: null,
    errorMessage: null,
    steps: [],
    promptTokens: 0,
    completionTokens: 0,
    costUsd: 0,
    toolCallsCount: 0,
    ...overrides,
  };
}

/**
 * Helper to reduce the boilerplate of calling `buildCommandHandlers`
 * with both mocks every test. Any test that needs to customize the
 * agentic mock passes `agenticLoopService` explicitly.
 */
function build(
  commandService: CommandService,
  agenticLoopService: AgenticLoopService = makeAgenticMock(),
) {
  return buildCommandHandlers({ commandService, agenticLoopService });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildCommandHandlers', () => {
  it('returns the five expected channel keys', () => {
    const handlers = build(makeServiceMock());
    expect(Object.keys(handlers).sort()).toEqual([
      'command.execute',
      'command.history',
      'command.parse',
      'command.stop',
      'command.suggest',
    ]);
  });

  it('command.parse forwards text + full context to CommandService.parse and echoes the result', async () => {
    const canned: IpcParseResult = {
      kind: 'needs_clarification',
      missing: 'roleQuery',
      prompt: 'Which role?',
      pending: {
        intent: 'hire_employee',
        entities: {},
        rawText: 'hire someone',
        classifiedAt: '2026-04-13T00:00:00.000Z',
      },
    };
    const service = makeServiceMock({ parse: canned });
    const handlers = build(service);

    const req: CommandParseRequest = {
      text: 'hire a senior backend engineer',
      companyId: 'company_1',
      currentView: 'dashboard',
      recentIntents: ['check_status'],
    };
    const out = await handlers['command.parse'](req);

    expect(out).toEqual(canned);
    expect(service.parse).toHaveBeenCalledTimes(1);
    expect(service.parse).toHaveBeenCalledWith('hire a senior backend engineer', {
      companyId: 'company_1',
      currentView: 'dashboard',
      recentIntents: ['check_status'],
    });
  });

  it('command.parse omits undefined currentView + recentIntents so the NluContext stays minimal', async () => {
    const service = makeServiceMock();
    const handlers = build(service);

    const req: CommandParseRequest = {
      text: 'what is everyone working on?',
      companyId: 'company_2',
      // currentView + recentIntents intentionally absent
    };
    await handlers['command.parse'](req);

    expect(service.parse).toHaveBeenCalledWith('what is everyone working on?', {
      companyId: 'company_2',
    });
    // Defense-in-depth: the forwarded context literal must NOT carry
    // `currentView: undefined` or `recentIntents: undefined` keys —
    // the classifier treats key presence as meaningful.
    const contextArg = (service.parse as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect('currentView' in contextArg).toBe(false);
    expect('recentIntents' in contextArg).toBe(false);
  });

  it('command.execute forwards the request verbatim to CommandService.execute and echoes the result', async () => {
    const canned: IpcExecuteResult = {
      kind: 'ok',
      intent: 'create_ticket',
      resultId: 'ticket_42',
      summary: 'Filed ticket: Payment flow bug',
    };
    const service = makeServiceMock({ execute: canned });
    const handlers = build(service);

    const req: IpcExecuteRequest = {
      intent: 'create_ticket',
      entities: { title: 'Payment flow bug' },
      companyId: 'company_1',
      actorId: 'user',
      rawText: 'file a bug ticket: Payment flow bug',
    };
    const out = await handlers['command.execute'](req);

    expect(out).toEqual(canned);
    expect(service.execute).toHaveBeenCalledTimes(1);
    expect(service.execute).toHaveBeenCalledWith(req);
  });

  it('command.execute with a destructive intent and confirmed !== true must NOT be auto-defaulted to true', async () => {
    // If the handler silently coerces `confirmed` to `true`, the
    // destructive gate in CommandService.execute is bypassed and
    // e.g. `fire_employee` runs without user consent. Assert the
    // handler forwards `confirmed` exactly as received — including
    // when it is absent.
    let observedConfirmed: boolean | undefined = true; // init to a deliberately-wrong sentinel
    const service = makeServiceMock({
      executeImpl: async (req) => {
        observedConfirmed = req.confirmed;
        return { kind: 'needs_confirmation', summary: 'Fire employee emp_1?' };
      },
    });
    const handlers = build(service);

    const req: IpcExecuteRequest = {
      intent: 'fire_employee',
      entities: { employeeId: 'emp_1' },
      companyId: 'company_1',
      // confirmed deliberately absent
    };
    const out = await handlers['command.execute'](req);

    expect(observedConfirmed).toBeUndefined();
    expect(out).toEqual({
      kind: 'needs_confirmation',
      summary: 'Fire employee emp_1?',
    });
  });

  it('command.history forwards both limit and companyId to CommandService.history', async () => {
    const canned: IpcCommandHistoryEntry[] = [
      {
        id: 'cmd_1',
        text: 'check status',
        intent: 'check_status',
        entities: {},
        executedAt: '2026-04-13T00:00:00.000Z',
        outcome: 'ok',
        companyId: 'company_1',
        actorId: 'user',
      },
    ];
    const service = makeServiceMock({ history: canned });
    const handlers = build(service);

    const req: CommandHistoryRequest = { limit: 10, companyId: 'company_1' };
    const out = await handlers['command.history'](req);

    expect(out).toEqual(canned);
    expect(service.history).toHaveBeenCalledWith(10, 'company_1');
  });

  it('command.history with an empty request passes undefined for both args (service applies defaults)', async () => {
    const service = makeServiceMock();
    const handlers = build(service);

    await handlers['command.history']({});

    expect(service.history).toHaveBeenCalledWith(undefined, undefined);
  });

  it('command.suggest forwards partial + context to CommandService.suggest', async () => {
    const canned: IpcSuggestItem[] = [
      { text: 'Hire a senior backend engineer', intent: 'hire_employee' },
    ];
    const service = makeServiceMock({ suggest: canned });
    const handlers = build(service);

    const req: CommandSuggestRequest = {
      partial: 'hir',
      companyId: 'company_1',
      currentView: 'employees',
    };
    const out = await handlers['command.suggest'](req);

    expect(out).toEqual(canned);
    expect(service.suggest).toHaveBeenCalledWith('hir', {
      companyId: 'company_1',
      currentView: 'employees',
    });
  });

  // -------------------------------------------------------------------------
  // T6 — command.stop
  // -------------------------------------------------------------------------

  it('command.stop returns { stopped: true } and calls AgenticLoopService.stop for a running run', async () => {
    const agentic = makeAgenticMock({
      getRun: (runId) => (runId === 'run_1' ? runStateFixture({ runId, status: 'running' }) : null),
    });
    const handlers = build(makeServiceMock(), agentic);

    const out = await handlers['command.stop']({ runId: 'run_1' });

    expect(out).toEqual({ stopped: true });
    expect(agentic.getRun).toHaveBeenCalledWith('run_1');
    expect(agentic.stop).toHaveBeenCalledTimes(1);
    expect(agentic.stop).toHaveBeenCalledWith('run_1');
  });

  it('command.stop returns { stopped: false } for an unknown runId and does NOT call stop()', async () => {
    const agentic = makeAgenticMock({ getRun: () => null });
    const handlers = build(makeServiceMock(), agentic);

    const out = await handlers['command.stop']({ runId: 'does_not_exist' });

    expect(out).toEqual({ stopped: false });
    expect(agentic.getRun).toHaveBeenCalledWith('does_not_exist');
    expect(agentic.stop).not.toHaveBeenCalled();
  });

  it('command.stop returns { stopped: false } for a run that is already in a terminal state', async () => {
    // Terminal = anything other than 'running'. We exercise the most
    // common post-run status ('completed') here; the same branch also
    // covers 'failed', 'canceled', and 'budget_exhausted'.
    const agentic = makeAgenticMock({
      getRun: (runId) => runStateFixture({ runId, status: 'completed', endedAt: 1 }),
    });
    const handlers = build(makeServiceMock(), agentic);

    const out = await handlers['command.stop']({ runId: 'run_1' });

    expect(out).toEqual({ stopped: false });
    expect(agentic.stop).not.toHaveBeenCalled();
  });

  it('command.stop swallows exceptions from the service, logs them, and resolves { stopped: false }', async () => {
    // The renderer has already captured the user's intent to cancel
    // by the time this channel fires — re-raising the error to the
    // caller produces a worse UX than failing open + logging.
    const boom = new Error('abort signal wire broke');
    const agentic = makeAgenticMock({
      getRun: () => {
        throw boom;
      },
    });
    const log = { error: vi.fn() };
    const handlers = buildCommandHandlers({
      commandService: makeServiceMock(),
      agenticLoopService: agentic,
      logger: log,
    });

    const out = await handlers['command.stop']({ runId: 'run_1' });

    expect(out).toEqual({ stopped: false });
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error.mock.calls[0]?.[1]).toBe(boom);
  });

  it('rethrows when CommandService throws — register.ts is the single telemetry/wrapping layer', async () => {
    // `register.ts` wraps every ipcMain.handle callback and surfaces
    // errors back to the renderer via the electron IPC reject path.
    // Our factory must NOT swallow errors here, otherwise the
    // rejection never reaches the renderer's `invoke` promise.
    const boom = new Error('classifier blew up');
    const service = makeServiceMock({
      parseImpl: async () => {
        throw boom;
      },
      executeImpl: async () => {
        throw boom;
      },
      historyImpl: async () => {
        throw boom;
      },
      suggestImpl: async () => {
        throw boom;
      },
    });
    const handlers = build(service);

    await expect(handlers['command.parse']({ text: 'x', companyId: 'company_1' })).rejects.toBe(
      boom,
    );
    await expect(
      handlers['command.execute']({
        intent: 'check_status',
        entities: {},
        companyId: 'company_1',
      }),
    ).rejects.toBe(boom);
    await expect(handlers['command.history']({})).rejects.toBe(boom);
    await expect(
      handlers['command.suggest']({ partial: 'x', companyId: 'company_1' }),
    ).rejects.toBe(boom);
  });
});
