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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildCommandHandlers', () => {
  it('returns the four expected channel keys', () => {
    const handlers = buildCommandHandlers({ commandService: makeServiceMock() });
    expect(Object.keys(handlers).sort()).toEqual([
      'command.execute',
      'command.history',
      'command.parse',
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
    const handlers = buildCommandHandlers({ commandService: service });

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
    const handlers = buildCommandHandlers({ commandService: service });

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
    const handlers = buildCommandHandlers({ commandService: service });

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
    const handlers = buildCommandHandlers({ commandService: service });

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
    const handlers = buildCommandHandlers({ commandService: service });

    const req: CommandHistoryRequest = { limit: 10, companyId: 'company_1' };
    const out = await handlers['command.history'](req);

    expect(out).toEqual(canned);
    expect(service.history).toHaveBeenCalledWith(10, 'company_1');
  });

  it('command.history with an empty request passes undefined for both args (service applies defaults)', async () => {
    const service = makeServiceMock();
    const handlers = buildCommandHandlers({ commandService: service });

    await handlers['command.history']({});

    expect(service.history).toHaveBeenCalledWith(undefined, undefined);
  });

  it('command.suggest forwards partial + context to CommandService.suggest', async () => {
    const canned: IpcSuggestItem[] = [
      { text: 'Hire a senior backend engineer', intent: 'hire_employee' },
    ];
    const service = makeServiceMock({ suggest: canned });
    const handlers = buildCommandHandlers({ commandService: service });

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
    const handlers = buildCommandHandlers({ commandService: service });

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
