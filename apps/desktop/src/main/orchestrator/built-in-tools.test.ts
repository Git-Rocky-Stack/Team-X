import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentMessagePayload } from '@team-x/shared-types';

import type { EmployeeRow } from '../db/repos/employees.js';
import type {
  BuiltInToolDeps,
  BuiltInToolEmployeesRepo,
  BuiltInToolMessagesRepo,
  BuiltInToolThreadsRepo,
  EnqueueAgentReplyFn,
} from './built-in-tools.js';
import {
  buildBuiltInTools,
  buildListColleaguesTool,
  buildSendMessageTool,
} from './built-in-tools.js';
import type { EventBus } from './event-bus.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function fakeEmployee(overrides: Partial<EmployeeRow> = {}): EmployeeRow {
  return {
    id: 'emp-swe',
    companyId: 'company-1',
    rolePackId: 'strategia-official',
    roleId: 'senior-fullstack-engineer',
    roleMdSha: 'abc123',
    level: 'IC',
    name: 'Iris Chen',
    title: 'Senior Fullstack Engineer',
    status: 'idle',
    modelPref: null,
    providerPref: null,
    toolsAllowedJson: '[]',
    toolsDeniedJson: '[]',
    avatar: null,
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeDeps(): {
  deps: BuiltInToolDeps;
  employees: BuiltInToolEmployeesRepo;
  messages: BuiltInToolMessagesRepo;
  threads: BuiltInToolThreadsRepo;
  enqueueAgentReply: EnqueueAgentReplyFn;
  bus: EventBus;
} {
  const employeeMap = new Map<string, EmployeeRow>();
  employeeMap.set(
    'emp-ceo',
    fakeEmployee({ id: 'emp-ceo', name: 'Alex Rivera', title: 'CEO', level: 'Officer' }),
  );
  employeeMap.set(
    'emp-swe',
    fakeEmployee({ id: 'emp-swe', name: 'Iris Chen', title: 'Senior SWE', level: 'IC' }),
  );
  employeeMap.set(
    'emp-other',
    fakeEmployee({ id: 'emp-other', companyId: 'company-2', name: 'Other', title: 'PM' }),
  );

  const employees: BuiltInToolEmployeesRepo = {
    getById: (id) => employeeMap.get(id) ?? null,
    listByCompany: (companyId) =>
      [...employeeMap.values()].filter((e) => e.companyId === companyId),
  };

  const messages: BuiltInToolMessagesRepo = {
    append: vi.fn().mockReturnValue('msg-1'),
  };

  const threads: BuiltInToolThreadsRepo = {
    getOrCreateEmployeeDmThread: vi.fn().mockReturnValue('thread-1'),
    updateLastMessageAt: vi.fn(),
  };

  const enqueueAgentReply: EnqueueAgentReplyFn = vi.fn().mockResolvedValue(undefined);

  const bus = {
    emit: vi.fn().mockReturnValue({
      id: 'evt-1',
      type: 'message.agent_to_agent',
      companyId: 'company-1',
      actorId: 'emp-ceo',
      actorKind: 'employee',
      payload: {},
      createdAt: Date.now(),
    }),
    subscribe: vi.fn().mockReturnValue(() => {}),
    replaySince: vi.fn().mockReturnValue([]),
  } as unknown as EventBus;

  const deps: BuiltInToolDeps = { bus, employees, messages, threads, enqueueAgentReply };

  return { deps, employees, messages, threads, enqueueAgentReply, bus };
}

// ---------------------------------------------------------------------------
// send_message_to_colleague
// ---------------------------------------------------------------------------

describe('buildSendMessageTool', () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('has the correct name and description', () => {
    const tool = buildSendMessageTool(deps.deps, 'emp-ceo', 'company-1');
    expect(tool.name).toBe('send_message_to_colleague');
    expect(tool.description).toContain('Send a message');
  });

  it('sends a message and returns success', async () => {
    const tool = buildSendMessageTool(deps.deps, 'emp-ceo', 'company-1');
    const result = await tool.execute({
      recipientEmployeeId: 'emp-swe',
      message: 'Hello Iris',
    } as never);
    const r = result as {
      success: boolean;
      threadId: string;
      messageId: string;
      recipientName: string;
    };

    expect(r.success).toBe(true);
    expect(r.threadId).toBe('thread-1');
    expect(r.messageId).toBe('msg-1');
    expect(r.recipientName).toBe('Iris Chen');

    // Verify thread was resolved
    expect(deps.threads.getOrCreateEmployeeDmThread).toHaveBeenCalledWith({
      companyId: 'company-1',
      fromEmployeeId: 'emp-ceo',
      toEmployeeId: 'emp-swe',
    });

    // Verify message was appended with isAgentInitiated
    expect(deps.messages.append).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-1',
        authorId: 'emp-ceo',
        authorKind: 'employee',
        content: 'Hello Iris',
        isAgentInitiated: true,
      }),
    );

    // Verify last_message_at was updated
    expect(deps.threads.updateLastMessageAt).toHaveBeenCalledWith('thread-1', expect.any(Number));

    // Verify event was emitted
    expect(deps.bus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message.agent_to_agent',
        companyId: 'company-1',
        actorId: 'emp-ceo',
        actorKind: 'employee',
        payload: expect.objectContaining({
          fromEmployeeId: 'emp-ceo',
          toEmployeeId: 'emp-swe',
          threadId: 'thread-1',
          messageId: 'msg-1',
        } satisfies AgentMessagePayload),
      }),
    );

    // Verify work was enqueued for recipient
    expect(deps.enqueueAgentReply).toHaveBeenCalledWith({
      threadId: 'thread-1',
      employeeId: 'emp-swe',
      triggerMessageId: 'msg-1',
    });
  });

  it('rejects messaging a non-existent employee', async () => {
    const tool = buildSendMessageTool(deps.deps, 'emp-ceo', 'company-1');
    const result = await tool.execute({ recipientEmployeeId: 'ghost', message: 'hi' } as never);
    const r = result as { success: boolean; error: string };
    expect(r.success).toBe(false);
    expect(r.error).toContain('not found');
  });

  it('rejects messaging an employee in a different company', async () => {
    const tool = buildSendMessageTool(deps.deps, 'emp-ceo', 'company-1');
    const result = await tool.execute({ recipientEmployeeId: 'emp-other', message: 'hi' } as never);
    const r = result as { success: boolean; error: string };
    expect(r.success).toBe(false);
    expect(r.error).toContain('not in your company');
  });

  it('rejects messaging yourself', async () => {
    const tool = buildSendMessageTool(deps.deps, 'emp-ceo', 'company-1');
    const result = await tool.execute({
      recipientEmployeeId: 'emp-ceo',
      message: 'hi me',
    } as never);
    const r = result as { success: boolean; error: string };
    expect(r.success).toBe(false);
    expect(r.error).toContain('cannot message yourself');
  });
});

// ---------------------------------------------------------------------------
// list_colleagues
// ---------------------------------------------------------------------------

describe('buildListColleaguesTool', () => {
  it('returns colleagues in the same company, excluding self', async () => {
    const { deps } = makeDeps();
    const tool = buildListColleaguesTool(deps, 'emp-ceo', 'company-1');
    const result = (await tool.execute({} as never)) as Array<{ id: string; name: string }>;

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('emp-swe');
    expect(result[0]?.name).toBe('Iris Chen');
  });

  it('has the correct name', () => {
    const { deps } = makeDeps();
    const tool = buildListColleaguesTool(deps, 'emp-ceo', 'company-1');
    expect(tool.name).toBe('list_colleagues');
  });
});

// ---------------------------------------------------------------------------
// buildBuiltInTools
// ---------------------------------------------------------------------------

describe('buildBuiltInTools', () => {
  it('returns both tools', () => {
    const { deps } = makeDeps();
    const tools = buildBuiltInTools(deps, 'emp-ceo', 'company-1');
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name).sort()).toEqual([
      'list_colleagues',
      'send_message_to_colleague',
    ]);
  });
});
