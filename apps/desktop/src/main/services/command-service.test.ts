/**
 * CommandService unit tests — pipeline + dispatch + confirmation gate
 * + history FIFO + event emission.
 *
 * Stubs every dependency: classifier, resolver, slot-filler, handlers,
 * history repo, and event bus. No DB, no LLM, no orchestrator.
 *
 * Phase 5 — M30 T4.
 */

import type {
  IntentClassifier,
  IntentName,
  IntentResult,
  NluContext,
  ResolvedEntity,
  SlotFiller,
} from '@team-x/intelligence';
import type { CommandExecutedPayload, DashboardEvent } from '@team-x/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommandHistoryRow } from '../db/repos/command-history.js';
import {
  COMMAND_HISTORY_CAP,
  type CommandEntityResolver,
  type CommandEventBus,
  type CommandHandlers,
  type CommandService,
  type ExecuteRequest,
  createCommandService,
} from './command-service.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function makeClassifier(result: Partial<IntentResult> & { intent: IntentName }): IntentClassifier {
  return {
    classify: vi.fn(
      async (text: string, _ctx: NluContext): Promise<IntentResult> => ({
        intent: result.intent,
        entities: result.entities ?? {},
        confidence: result.confidence ?? 0.9,
        missingSlots: result.missingSlots ?? [],
        rawText: text,
      }),
    ),
  };
}

function makeResolver(overrides: Partial<CommandEntityResolver> = {}): CommandEntityResolver {
  const notFound: ResolvedEntity<unknown> = { kind: 'not_found' };
  return {
    resolveEmployee: vi.fn(async () => notFound),
    resolveTicket: vi.fn(async () => notFound),
    resolveVaultFile: vi.fn(async () => notFound),
    resolveRole: vi.fn(async () => notFound),
    ...overrides,
  };
}

function makeSlotFiller(result: ReturnType<SlotFiller['fill']>): SlotFiller {
  return {
    fill: vi.fn(() => result),
  };
}

function makeHandlers(overrides: Partial<CommandHandlers> = {}): CommandHandlers {
  return {
    employeesList: vi.fn(async () => [
      { id: 'emp-1', name: 'Sarah Chen', title: 'CEO', status: 'active' },
    ]),
    employeesCreate: vi.fn(async () => ({ employeeId: 'emp-new' })),
    ticketsAssign: vi.fn(async () => undefined),
    ticketsCreate: vi.fn(async () => ({ ticketId: 'tix-new' })),
    ticketsClose: vi.fn(async () => undefined),
    ticketsReopen: vi.fn(async () => undefined),
    projectsCreate: vi.fn(async () => ({ projectId: 'proj-new' })),
    goalsCreate: vi.fn(async () => ({ goalId: 'goal-new' })),
    meetingsCall: vi.fn(async () => ({ meetingId: 'mtg-new', threadId: 'thr-new' })),
    meetingsEnd: vi.fn(async () => undefined),
    vaultSearch: vi.fn(async () => [
      { file: { id: 'f1', originalName: 'api-spec.md' }, snippet: 'foo' },
    ]),
    ...overrides,
  };
}

function makeHistoryRepo() {
  const rows: CommandHistoryRow[] = [];
  const repo = {
    append: vi.fn(
      (
        input: Parameters<CommandService['history']>[0] extends never
          ? never
          : {
              id: string;
              companyId: string;
              actorId: string;
              text: string;
              intent: string;
              entitiesJson: string;
              executedAt: string;
              outcome: 'ok' | 'error';
              resultId?: string | null;
            },
      ) => {
        rows.unshift({
          id: input.id,
          companyId: input.companyId,
          actorId: input.actorId,
          text: input.text,
          intent: input.intent,
          entitiesJson: input.entitiesJson,
          executedAt: input.executedAt,
          outcome: input.outcome,
          resultId: input.resultId ?? null,
        });
        return input.id;
      },
    ),
    recent: vi.fn((companyId: string, limit = 20) => {
      return rows
        .filter((r) => r.companyId === companyId)
        .slice(0, Math.min(100, Math.max(1, limit)));
    }),
    trim: vi.fn((companyId: string, max: number) => {
      const forCompany = rows.filter((r) => r.companyId === companyId);
      if (forCompany.length <= max) return 0;
      const evicted = forCompany.slice(max);
      for (const row of evicted) {
        const i = rows.indexOf(row);
        if (i >= 0) rows.splice(i, 1);
      }
      return evicted.length;
    }),
    clearForCompany: vi.fn((companyId: string) => {
      const n = rows.filter((r) => r.companyId === companyId).length;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i]?.companyId === companyId) rows.splice(i, 1);
      }
      return n;
    }),
  };
  return { repo, rows };
}

function makeBus() {
  const events: DashboardEvent[] = [];
  const bus: CommandEventBus = {
    emit: vi.fn(
      <T>(input: {
        type: 'command.executed';
        companyId: string;
        actorId: string;
        actorKind: 'user' | 'employee' | 'system';
        payload: T;
      }): DashboardEvent<T> => {
        const e: DashboardEvent<T> = {
          id: `evt_${events.length + 1}`,
          type: input.type,
          companyId: input.companyId,
          actorId: input.actorId,
          actorKind: input.actorKind,
          payload: input.payload,
          createdAt: Date.now(),
        };
        events.push(e as DashboardEvent);
        return e;
      },
    ),
  };
  return { bus, events };
}

function buildService(
  overrides: {
    classifier?: IntentClassifier;
    resolver?: CommandEntityResolver;
    slotFiller?: SlotFiller;
    handlers?: CommandHandlers;
  } = {},
): {
  svc: CommandService;
  handlers: CommandHandlers;
  historyRepo: ReturnType<typeof makeHistoryRepo>['repo'];
  historyRows: CommandHistoryRow[];
  bus: CommandEventBus;
  events: DashboardEvent[];
} {
  const { repo, rows } = makeHistoryRepo();
  const { bus, events } = makeBus();
  const handlers = overrides.handlers ?? makeHandlers();
  const svc = createCommandService({
    classifier: overrides.classifier ?? makeClassifier({ intent: 'check_status' }),
    resolver: overrides.resolver ?? makeResolver(),
    slotFiller:
      overrides.slotFiller ??
      makeSlotFiller({ kind: 'ready', intent: 'check_status', entities: {} }),
    handlers,
    historyRepo: repo,
    bus,
    defaultCompanyId: 'co-1',
    now: () => new Date('2026-04-13T12:00:00.000Z'),
    newId: (() => {
      let n = 0;
      return () => `id-${++n}`;
    })(),
    logger: { error: vi.fn(), info: vi.fn() },
  });
  return { svc, handlers, historyRepo: repo, historyRows: rows, bus, events };
}

const CTX: NluContext = { companyId: 'co-1' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CommandService.parse', () => {
  it('1. returns ready when classifier + slot filler agree', async () => {
    const { svc } = buildService({
      classifier: makeClassifier({
        intent: 'create_ticket',
        entities: { title: 'Login bug' },
      }),
      slotFiller: makeSlotFiller({
        kind: 'ready',
        intent: 'create_ticket',
        entities: { title: 'Login bug' },
      }),
    });
    const result = await svc.parse('file a bug: login', CTX);
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.intent).toBe('create_ticket');
      expect(result.entities.title).toBe('Login bug');
      expect(result.summary).toContain('Login bug');
    }
  });

  it('2. returns needs_clarification with options when resolver is ambiguous', async () => {
    const { svc } = buildService({
      classifier: makeClassifier({
        intent: 'hire_employee',
        entities: { roleQuery: 'engineer' },
      }),
      resolver: makeResolver({
        resolveRole: vi.fn(async () => ({
          kind: 'ambiguous',
          candidates: [{ id: 'r1' }, { id: 'r2' }],
        })),
      }),
      slotFiller: makeSlotFiller({
        kind: 'needs_clarification',
        missing: 'roleId',
        prompt: 'Which role?',
        options: ['Senior Backend Engineer', 'Senior Frontend Engineer'],
      }),
    });
    const result = await svc.parse('hire a senior engineer', CTX);
    expect(result.kind).toBe('needs_clarification');
    if (result.kind === 'needs_clarification') {
      expect(result.missing).toBe('roleId');
      expect(result.options?.length).toBe(2);
      expect(result.pending.intent).toBe('hire_employee');
      expect(result.pending.classifiedAt).toBe('2026-04-13T12:00:00.000Z');
    }
  });

  it('3. returns needs_confirmation for destructive intents with summary', async () => {
    const { svc } = buildService({
      classifier: makeClassifier({
        intent: 'fire_employee',
        entities: { employeeQuery: 'Sarah' },
      }),
      resolver: makeResolver({
        resolveEmployee: vi.fn(async () => ({
          kind: 'unique',
          value: { id: 'emp-1', name: 'Sarah' },
        })),
      }),
      slotFiller: makeSlotFiller({
        kind: 'needs_confirmation',
        intent: 'fire_employee',
        entities: { employeeId: 'emp-1' },
        summary: 'Fire Sarah Chen?',
      }),
    });
    const result = await svc.parse('fire sarah', CTX);
    expect(result.kind).toBe('needs_confirmation');
    if (result.kind === 'needs_confirmation') {
      expect(result.intent).toBe('fire_employee');
      expect(result.summary).toBe('Fire Sarah Chen?');
      expect(result.pending.rawText).toBe('fire sarah');
    }
  });
});

describe('CommandService.execute', () => {
  const baseReq = (overrides: Partial<ExecuteRequest> = {}): ExecuteRequest => ({
    intent: 'check_status',
    entities: {},
    companyId: 'co-1',
    actorId: 'user',
    rawText: 'what is everyone working on',
    ...overrides,
  });

  it('4. happy path: assign_ticket dispatches + emits command.executed', async () => {
    const { svc, handlers, events } = buildService();
    const req = baseReq({
      intent: 'assign_ticket',
      entities: { ticketId: 'tix-9', employeeId: 'emp-1' },
    });
    const result = await svc.execute(req);
    expect(result.kind).toBe('ok');
    expect(handlers.ticketsAssign).toHaveBeenCalledWith({
      ticketId: 'tix-9',
      assigneeId: 'emp-1',
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('command.executed');
    const payload = events[0]?.payload as CommandExecutedPayload;
    expect(payload.intent).toBe('assign_ticket');
    expect(payload.outcome).toBe('ok');
    expect(payload.entities).toEqual({ ticketId: 'tix-9', employeeId: 'emp-1' });
  });

  it('5. destructive without confirmed returns needs_confirmation and does NOT dispatch', async () => {
    const fireMock = vi.fn(async () => undefined);
    const { svc, events } = buildService({
      handlers: makeHandlers({ employeesFire: fireMock }),
    });
    const result = await svc.execute(
      baseReq({ intent: 'fire_employee', entities: { employeeId: 'emp-1' } }),
    );
    expect(result.kind).toBe('needs_confirmation');
    expect(fireMock).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
  });

  it('6. destructive with confirmed:true dispatches and emits ok event', async () => {
    const fireMock = vi.fn(async () => undefined);
    const { svc, events } = buildService({
      handlers: makeHandlers({ employeesFire: fireMock }),
    });
    const result = await svc.execute(
      baseReq({
        intent: 'fire_employee',
        entities: { employeeId: 'emp-1' },
        confirmed: true,
      }),
    );
    expect(result.kind).toBe('ok');
    expect(fireMock).toHaveBeenCalledWith({ employeeId: 'emp-1' });
    expect(events).toHaveLength(1);
    expect((events[0]?.payload as CommandExecutedPayload).outcome).toBe('ok');
  });

  it('7. handler throw returns error result and emits error event', async () => {
    const boom = vi.fn(async () => {
      throw new Error('db is down');
    });
    const { svc, events } = buildService({
      handlers: makeHandlers({ ticketsAssign: boom }),
    });
    const result = await svc.execute(
      baseReq({
        intent: 'assign_ticket',
        entities: { ticketId: 'tix-9', employeeId: 'emp-1' },
      }),
    );
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.code).toBe('handler_error');
      expect(result.message).toContain('db is down');
    }
    expect(events).toHaveLength(1);
    expect((events[0]?.payload as CommandExecutedPayload).outcome).toBe('error');
  });

  it('8. unknown intent rejects with unknown_intent', async () => {
    const { svc, events } = buildService();
    const result = await svc.execute({
      intent: 'nope' as IntentName,
      entities: {},
      companyId: 'co-1',
    });
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.code).toBe('unknown_intent');
    }
    expect(events).toHaveLength(0);
  });

  it('9. missing required entity returns missing_entity error', async () => {
    const { svc, events, handlers } = buildService();
    const result = await svc.execute(
      baseReq({ intent: 'assign_ticket', entities: { ticketId: 'tix-9' } }),
    );
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.code).toBe('missing_entity');
      expect(result.message).toContain('employeeId');
    }
    expect(handlers.ticketsAssign).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
  });

  it('12. complex_request returns M31-stub summary without touching handlers', async () => {
    const { svc, handlers, events } = buildService();
    const result = await svc.execute(baseReq({ intent: 'complex_request', entities: {} }));
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.summary).toContain('agentic loop');
    }
    // No concrete backend handler should have been called.
    expect(handlers.employeesCreate).not.toHaveBeenCalled();
    expect(handlers.ticketsCreate).not.toHaveBeenCalled();
    expect(events).toHaveLength(1);
  });

  it('13. show_view returns ok navigation summary without calling a handler', async () => {
    const { svc, handlers } = buildService();
    const result = await svc.execute(
      baseReq({ intent: 'show_view', entities: { view: 'telemetry' } }),
    );
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.summary).toContain('telemetry');
    }
    // No handler should have fired.
    expect(handlers.vaultSearch).not.toHaveBeenCalled();
    expect(handlers.ticketsCreate).not.toHaveBeenCalled();
  });

  it('15. check_status returns structured ok summary derived from employees.list', async () => {
    const { svc, handlers } = buildService({
      handlers: makeHandlers({
        employeesList: vi.fn(async () => [
          { id: 'e1', name: 'A', status: 'active' },
          { id: 'e2', name: 'B', status: 'active' },
          { id: 'e3', name: 'C', status: 'archived' },
        ]),
      }),
    });
    const result = await svc.execute(baseReq({ intent: 'check_status', entities: {} }));
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.summary).toMatch(/3 employees/);
      expect(result.summary).toMatch(/2 active/);
    }
    expect(handlers.employeesList).toHaveBeenCalledWith({ companyId: 'co-1' });
  });
});

describe('CommandService.history', () => {
  const baseReq = (overrides: Partial<ExecuteRequest> = {}): ExecuteRequest => ({
    intent: 'check_status',
    entities: {},
    companyId: 'co-1',
    actorId: 'user',
    rawText: 'status check',
    ...overrides,
  });

  it('10. after 3 successful executes, history(10) returns 3 entries newest-first', async () => {
    const { svc } = buildService();
    await svc.execute(baseReq({ rawText: 'a' }));
    await svc.execute(baseReq({ rawText: 'b' }));
    await svc.execute(baseReq({ rawText: 'c' }));
    const hist = await svc.history(10, 'co-1');
    expect(hist).toHaveLength(3);
    // The repo fake uses `unshift` — most recent first.
    expect(hist[0]?.text).toBe('c');
    expect(hist[1]?.text).toBe('b');
    expect(hist[2]?.text).toBe('a');
    // Each entry must round-trip through JSON correctly.
    expect(hist[0]?.intent).toBe('check_status');
    expect(hist[0]?.outcome).toBe('ok');
  });

  it('11. FIFO cap 20 — 21st execute drops the oldest', async () => {
    const { svc, historyRepo } = buildService();
    for (let i = 0; i < 21; i++) {
      // eslint-disable-next-line no-await-in-loop
      await svc.execute(baseReq({ rawText: `msg-${i}` }));
    }
    // trim() should have been invoked 21 times (once per successful execute).
    expect(historyRepo.trim).toHaveBeenCalledTimes(21);
    // The last trim call should have used COMMAND_HISTORY_CAP.
    expect(historyRepo.trim).toHaveBeenLastCalledWith('co-1', COMMAND_HISTORY_CAP);
    const hist = await svc.history(100, 'co-1');
    expect(hist).toHaveLength(COMMAND_HISTORY_CAP);
    // Oldest ("msg-0") should have been evicted.
    expect(hist.every((e) => e.text !== 'msg-0')).toBe(true);
    // Newest ("msg-20") must still be present.
    expect(hist[0]?.text).toBe('msg-20');
  });
});

describe('CommandService.suggest', () => {
  it('14. suggest("hire", ctx) returns at least one hire-related item', async () => {
    const { svc } = buildService();
    const results = await svc.suggest('hire', CTX);
    expect(results.length).toBeGreaterThan(0);
    const hireHit = results.find((r) => r.intent === 'hire_employee');
    expect(hireHit).toBeDefined();
    expect(hireHit?.text.toLowerCase()).toContain('hire');
  });

  it('16. suggest("") returns the default top suggestions', async () => {
    const { svc } = buildService();
    const results = await svc.suggest('', CTX);
    expect(results.length).toBeGreaterThanOrEqual(5);
    expect(results.length).toBeLessThanOrEqual(8);
  });
});

describe('CommandService lifecycle', () => {
  it('17. stop() is idempotent', () => {
    const { svc } = buildService();
    svc.stop();
    expect(() => svc.stop()).not.toThrow();
  });
});

describe('CommandService.parse — edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('18. empty text returns needs_clarification without calling classifier', async () => {
    const classifier = makeClassifier({ intent: 'check_status' });
    const { svc } = buildService({ classifier });
    const result = await svc.parse('   ', CTX);
    expect(result.kind).toBe('needs_clarification');
    expect(classifier.classify).not.toHaveBeenCalled();
  });

  it('19. classifier throw falls back to complex_request without crashing', async () => {
    const classifier: IntentClassifier = {
      classify: vi.fn(async () => {
        throw new Error('provider down');
      }),
    };
    const { svc } = buildService({ classifier });
    const result = await svc.parse('do something weird', CTX);
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.intent).toBe('complex_request');
    }
  });

  it('20. resolver throw downgrades to not_found without propagating', async () => {
    const { svc } = buildService({
      classifier: makeClassifier({
        intent: 'hire_employee',
        entities: { roleQuery: 'engineer' },
      }),
      resolver: makeResolver({
        resolveRole: vi.fn(async () => {
          throw new Error('fts5 exploded');
        }),
      }),
      slotFiller: makeSlotFiller({
        kind: 'needs_clarification',
        missing: 'roleId',
        prompt: 'Which role?',
      }),
    });
    const result = await svc.parse('hire an engineer', CTX);
    expect(result.kind).toBe('needs_clarification');
  });
});
