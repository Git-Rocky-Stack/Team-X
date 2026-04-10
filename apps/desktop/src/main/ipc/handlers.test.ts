import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EmployeeRow } from '../db/repos/employees.js';
import type { AppendMessageInput, MessageRow } from '../db/repos/messages.js';
import type {
  AddThreadMemberInput,
  CreateThreadInput,
  GetOrCreateDmThreadInput,
  ThreadMemberRow,
  ThreadRow,
} from '../db/repos/threads.js';
import {
  AUTO_THREAD_ID,
  HUMAN_USER_ID,
  type IpcEmployeesRepo,
  type IpcMessagesRepo,
  type IpcOrchestrator,
  type IpcThreadsRepo,
  createIpcHandlers,
} from './handlers.js';

/**
 * Tests for the pure IPC handler factory.
 *
 * The handlers under test depend on three repos + the orchestrator.
 * To keep failures pinpointed at the handler logic (rather than
 * smeared across drizzle, sql.js, and the orchestrator's queue), we
 * inject hand-rolled fakes for all four — same pattern as
 * `provider-factory.test.ts`. The fakes implement only the methods
 * the handlers actually call (a strict subset of the production
 * repo / orchestrator surface).
 *
 * Coverage:
 *
 *   - employees.list: returns mapped public Employee shapes; nullable
 *     row columns (modelPref, providerPref, avatar) become optional;
 *     internal-only columns (toolsAllowedJson, toolsDeniedJson,
 *     rolePackId) are dropped.
 *   - chat.send: AUTO_THREAD_ID resolution; explicit-thread happy path;
 *     missing employee + missing thread + cross-company mismatch all
 *     reject before any DB writes; the user message is appended with
 *     the right authorId / authorKind; orchestrator.enqueueChat is
 *     called fire-and-forget (handler returns immediately even when
 *     the orchestrator hangs forever).
 *   - chat.list: returns mapped public ChatMessage shapes; internal
 *     columns (toolCallsJson, parentId) are dropped.
 */

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeEmployeesRepo implements IpcEmployeesRepo {
  private byId = new Map<string, EmployeeRow>();
  private byCompany = new Map<string, EmployeeRow[]>();

  put(row: EmployeeRow): void {
    this.byId.set(row.id, row);
    const list = this.byCompany.get(row.companyId) ?? [];
    list.push(row);
    this.byCompany.set(row.companyId, list);
  }

  listByCompany(companyId: string): EmployeeRow[] {
    return this.byCompany.get(companyId) ?? [];
  }

  getById(id: string): EmployeeRow | null {
    return this.byId.get(id) ?? null;
  }
}

class FakeThreadsRepo implements IpcThreadsRepo {
  private threads = new Map<string, ThreadRow>();
  private members = new Map<string, ThreadMemberRow[]>();
  /**
   * Visible to tests so they can assert on getOrCreate behaviour
   * without spying on the method directly.
   */
  getOrCreateCalls: GetOrCreateDmThreadInput[] = [];
  /** What `getOrCreateDmThread` returns. Tests preset this. */
  nextDmThreadId: string | null = null;
  /** Whether the next call should be treated as "creates" the thread row. */
  nextDmCreates = false;

  putThread(row: ThreadRow): void {
    this.threads.set(row.id, row);
  }

  create(input: CreateThreadInput): string {
    const id = `created-${this.threads.size}`;
    this.threads.set(id, {
      id,
      companyId: input.companyId,
      kind: input.kind,
      subject: input.subject ?? null,
      createdBy: input.createdBy,
      createdAt: Date.now(),
    } as ThreadRow);
    return id;
  }

  getById(id: string): ThreadRow | null {
    return this.threads.get(id) ?? null;
  }

  addMember(input: AddThreadMemberInput): void {
    const list = this.members.get(input.threadId) ?? [];
    list.push({
      threadId: input.threadId,
      memberId: input.memberId,
      memberKind: input.memberKind,
      roleInThread: input.roleInThread ?? null,
    } as ThreadMemberRow);
    this.members.set(input.threadId, list);
  }

  listMembers(threadId: string): ThreadMemberRow[] {
    return this.members.get(threadId) ?? [];
  }

  getOrCreateDmThread(input: GetOrCreateDmThreadInput): string {
    this.getOrCreateCalls.push(input);
    if (this.nextDmThreadId === null) {
      throw new Error('test setup: FakeThreadsRepo.nextDmThreadId not configured');
    }
    if (this.nextDmCreates) {
      this.threads.set(this.nextDmThreadId, {
        id: this.nextDmThreadId,
        companyId: input.companyId,
        kind: 'dm',
        subject: null,
        createdBy: input.userId,
        createdAt: Date.now(),
      } as ThreadRow);
    }
    return this.nextDmThreadId;
  }
}

class FakeMessagesRepo implements IpcMessagesRepo {
  appended: AppendMessageInput[] = [];
  private byThread = new Map<string, MessageRow[]>();
  private nextIdCounter = 1;

  putThread(threadId: string, rows: MessageRow[]): void {
    this.byThread.set(threadId, rows);
  }

  append(input: AppendMessageInput): string {
    this.appended.push(input);
    const id = `msg-${this.nextIdCounter++}`;
    const list = this.byThread.get(input.threadId) ?? [];
    list.push({
      id,
      threadId: input.threadId,
      authorId: input.authorId,
      authorKind: input.authorKind,
      content: input.content,
      toolCallsJson: null,
      parentId: input.parentId ?? null,
      createdAt: Date.now(),
    } as MessageRow);
    this.byThread.set(input.threadId, list);
    return id;
  }

  listByThread(threadId: string): MessageRow[] {
    return this.byThread.get(threadId) ?? [];
  }
}

class FakeOrchestrator implements IpcOrchestrator {
  enqueueCalls: Array<{ threadId: string; employeeId: string; userMessageId: string }> = [];
  /**
   * What `enqueueChat` resolves to. Tests can set this to a never-
   * resolving promise to verify the handler doesn't await it.
   */
  nextEnqueueResult: Promise<void> = Promise.resolve();

  async enqueueChat(args: {
    threadId: string;
    employeeId: string;
    userMessageId: string;
  }): Promise<void> {
    this.enqueueCalls.push(args);
    return this.nextEnqueueResult;
  }
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeEmployeeRow(overrides: Partial<EmployeeRow> = {}): EmployeeRow {
  return {
    id: 'emp-iris',
    companyId: 'co-1',
    rolePackId: 'strategia-official',
    roleId: 'chief-executive-officer',
    roleMdSha: 'a'.repeat(64),
    level: 'officer',
    name: 'Iris Kovač',
    title: 'Chief Executive Officer',
    status: 'idle',
    modelPref: null,
    providerPref: null,
    toolsAllowedJson: '[]',
    toolsDeniedJson: '[]',
    avatar: null,
    createdAt: 1_700_000_000_000,
    ...overrides,
  } as EmployeeRow;
}

function makeMessageRow(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: 'msg-1',
    threadId: 'thread-1',
    authorId: 'rocky',
    authorKind: 'user',
    content: 'hi',
    toolCallsJson: null,
    parentId: null,
    createdAt: 1_700_000_000_000,
    ...overrides,
  } as MessageRow;
}

function makeThreadRow(overrides: Partial<ThreadRow> = {}): ThreadRow {
  return {
    id: 'thread-1',
    companyId: 'co-1',
    kind: 'dm',
    subject: null,
    createdBy: 'rocky',
    createdAt: 1_700_000_000_000,
    ...overrides,
  } as ThreadRow;
}

interface Fixture {
  employees: FakeEmployeesRepo;
  threads: FakeThreadsRepo;
  messages: FakeMessagesRepo;
  orchestrator: FakeOrchestrator;
  handlers: ReturnType<typeof createIpcHandlers>;
}

function buildFixture(): Fixture {
  const employees = new FakeEmployeesRepo();
  const threads = new FakeThreadsRepo();
  const messages = new FakeMessagesRepo();
  const orchestrator = new FakeOrchestrator();
  const handlers = createIpcHandlers({
    employeesRepo: employees,
    threadsRepo: threads,
    messagesRepo: messages,
    orchestrator,
  });
  return { employees, threads, messages, orchestrator, handlers };
}

// ---------------------------------------------------------------------------
// employees.list
// ---------------------------------------------------------------------------

describe('IPC: employees.list', () => {
  it('returns mapped Employee shapes for the given company', async () => {
    const fx = buildFixture();
    fx.employees.put(
      makeEmployeeRow({
        id: 'emp-iris',
        modelPref: null,
        providerPref: null,
        avatar: null,
      }),
    );
    fx.employees.put(
      makeEmployeeRow({
        id: 'emp-mateo',
        name: 'Mateo Reyes',
        title: 'Senior Fullstack Engineer',
        roleId: 'senior-fullstack-engineer',
        level: 'ic',
        modelPref: 'claude-haiku-4-5',
        providerPref: 'anthropic',
        avatar: 'https://example.com/mateo.png',
      }),
    );

    const result = await fx.handlers.employeesList({ companyId: 'co-1' });
    expect(result).toHaveLength(2);

    const iris = result.find((e) => e.id === 'emp-iris');
    expect(iris).toEqual({
      id: 'emp-iris',
      companyId: 'co-1',
      roleId: 'chief-executive-officer',
      roleMdSha: 'a'.repeat(64),
      level: 'officer',
      name: 'Iris Kovač',
      title: 'Chief Executive Officer',
      status: 'idle',
      createdAt: 1_700_000_000_000,
    });
    // Optional fields are absent when the row column is null.
    expect(iris).not.toHaveProperty('modelPref');
    expect(iris).not.toHaveProperty('providerPref');
    expect(iris).not.toHaveProperty('avatar');

    const mateo = result.find((e) => e.id === 'emp-mateo');
    expect(mateo?.modelPref).toBe('claude-haiku-4-5');
    expect(mateo?.providerPref).toBe('anthropic');
    expect(mateo?.avatar).toBe('https://example.com/mateo.png');
  });

  it('drops internal-only columns from the public shape', async () => {
    const fx = buildFixture();
    fx.employees.put(
      makeEmployeeRow({
        toolsAllowedJson: '["browse","context7"]',
        toolsDeniedJson: '["shell"]',
      }),
    );
    const result = await fx.handlers.employeesList({ companyId: 'co-1' });
    expect(result[0]).not.toHaveProperty('toolsAllowedJson');
    expect(result[0]).not.toHaveProperty('toolsDeniedJson');
    expect(result[0]).not.toHaveProperty('rolePackId');
  });

  it('returns an empty array for a company with no employees', async () => {
    const fx = buildFixture();
    const result = await fx.handlers.employeesList({ companyId: 'co-empty' });
    expect(result).toEqual([]);
  });

  it('rejects when companyId is missing or empty', async () => {
    const fx = buildFixture();
    await expect(fx.handlers.employeesList({ companyId: '' })).rejects.toThrow(/companyId/);
  });
});

// ---------------------------------------------------------------------------
// chat.send
// ---------------------------------------------------------------------------

describe('IPC: chat.send', () => {
  it('appends the user message and enqueues an orchestrator turn (explicit thread)', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'emp-iris', companyId: 'co-1' }));
    fx.threads.putThread(makeThreadRow({ id: 'thread-1', companyId: 'co-1' }));

    const result = await fx.handlers.chatSend({
      threadId: 'thread-1',
      employeeId: 'emp-iris',
      content: 'What is our top priority this week?',
    });

    expect(result).toEqual({ threadId: 'thread-1', messageId: 'msg-1' });
    expect(fx.messages.appended).toHaveLength(1);
    expect(fx.messages.appended[0]).toEqual({
      threadId: 'thread-1',
      authorId: HUMAN_USER_ID,
      authorKind: 'user',
      content: 'What is our top priority this week?',
    });
    expect(fx.orchestrator.enqueueCalls).toEqual([
      { threadId: 'thread-1', employeeId: 'emp-iris', userMessageId: 'msg-1' },
    ]);
  });

  it('resolves AUTO_THREAD_ID via getOrCreateDmThread using the employee company', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'emp-iris', companyId: 'co-1' }));
    fx.threads.nextDmThreadId = 'auto-resolved-thread';
    fx.threads.nextDmCreates = true;

    const result = await fx.handlers.chatSend({
      threadId: AUTO_THREAD_ID,
      employeeId: 'emp-iris',
      content: 'hi',
    });

    expect(result.threadId).toBe('auto-resolved-thread');
    expect(fx.threads.getOrCreateCalls).toEqual([
      { companyId: 'co-1', employeeId: 'emp-iris', userId: HUMAN_USER_ID },
    ]);
    expect(fx.messages.appended[0]?.threadId).toBe('auto-resolved-thread');
  });

  it('does NOT await the orchestrator — returns immediately even when enqueueChat hangs', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'emp-iris', companyId: 'co-1' }));
    fx.threads.putThread(makeThreadRow({ id: 'thread-1', companyId: 'co-1' }));
    // Hang forever — the handler must not await this.
    fx.orchestrator.nextEnqueueResult = new Promise(() => {
      /* never resolves */
    });

    const sendPromise = fx.handlers.chatSend({
      threadId: 'thread-1',
      employeeId: 'emp-iris',
      content: 'hi',
    });

    // Race against a 50ms timer — the handler should resolve well
    // before the timer fires. If we accidentally awaited, this assertion
    // would fail because sendPromise would still be pending.
    const winner = await Promise.race([
      sendPromise.then(() => 'send'),
      new Promise<string>((resolve) => setTimeout(() => resolve('timer'), 50)),
    ]);
    expect(winner).toBe('send');
  });

  it('rejects when the employee does not exist (no DB writes happen)', async () => {
    const fx = buildFixture();
    await expect(
      fx.handlers.chatSend({
        threadId: 'thread-1',
        employeeId: 'ghost',
        content: 'hi',
      }),
    ).rejects.toThrow(/employee not found/);
    expect(fx.messages.appended).toEqual([]);
    expect(fx.orchestrator.enqueueCalls).toEqual([]);
  });

  it('rejects when an explicit thread does not exist', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'emp-iris', companyId: 'co-1' }));
    await expect(
      fx.handlers.chatSend({
        threadId: 'no-such-thread',
        employeeId: 'emp-iris',
        content: 'hi',
      }),
    ).rejects.toThrow(/thread not found/);
    expect(fx.messages.appended).toEqual([]);
  });

  it('rejects when the thread belongs to a different company than the employee', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'emp-iris', companyId: 'co-1' }));
    fx.threads.putThread(makeThreadRow({ id: 'thread-other', companyId: 'co-2' }));
    await expect(
      fx.handlers.chatSend({
        threadId: 'thread-other',
        employeeId: 'emp-iris',
        content: 'hi',
      }),
    ).rejects.toThrow(/does not belong to/);
    expect(fx.messages.appended).toEqual([]);
  });

  it('rejects when content is empty', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'emp-iris', companyId: 'co-1' }));
    fx.threads.putThread(makeThreadRow({ id: 'thread-1', companyId: 'co-1' }));
    await expect(
      fx.handlers.chatSend({
        threadId: 'thread-1',
        employeeId: 'emp-iris',
        content: '',
      }),
    ).rejects.toThrow(/content is required/);
  });

  it('rejects when employeeId is empty', async () => {
    const fx = buildFixture();
    await expect(
      fx.handlers.chatSend({ threadId: 'thread-1', employeeId: '', content: 'hi' }),
    ).rejects.toThrow(/employeeId/);
  });
});

// ---------------------------------------------------------------------------
// chat.send: orchestrator failure handling
// ---------------------------------------------------------------------------

describe('IPC: chat.send orchestrator failure handling', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('logs (does not throw) when the orchestrator turn rejects asynchronously', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'emp-iris', companyId: 'co-1' }));
    fx.threads.putThread(makeThreadRow({ id: 'thread-1', companyId: 'co-1' }));
    fx.orchestrator.nextEnqueueResult = Promise.reject(new Error('provider down'));

    // The handler returns successfully with the user message id.
    const result = await fx.handlers.chatSend({
      threadId: 'thread-1',
      employeeId: 'emp-iris',
      content: 'hi',
    });
    expect(result).toEqual({ threadId: 'thread-1', messageId: 'msg-1' });

    // Wait for the rejected promise's catch handler to run.
    await new Promise((r) => setTimeout(r, 0));
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('orchestrator turn failed'),
      expect.any(Error),
    );
  });
});

// ---------------------------------------------------------------------------
// chat.list
// ---------------------------------------------------------------------------

describe('IPC: chat.list', () => {
  it('returns mapped ChatMessage shapes oldest-first', async () => {
    const fx = buildFixture();
    fx.messages.putThread('thread-1', [
      makeMessageRow({ id: 'msg-1', content: 'hi', authorKind: 'user' }),
      makeMessageRow({
        id: 'msg-2',
        content: 'hello back',
        authorKind: 'employee',
        authorId: 'emp-iris',
      }),
    ]);

    const result = await fx.handlers.chatList({ threadId: 'thread-1' });
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe('msg-1');
    expect(result[0]?.content).toBe('hi');
    expect(result[1]?.id).toBe('msg-2');
    expect(result[1]?.authorId).toBe('emp-iris');
    expect(result[1]?.authorKind).toBe('employee');
  });

  it('drops toolCallsJson and parentId from the public shape', async () => {
    const fx = buildFixture();
    fx.messages.putThread('thread-1', [
      makeMessageRow({
        id: 'msg-1',
        content: 'tool-using message',
        toolCallsJson: '[{"name":"browse"}]',
        parentId: 'parent-msg',
      } as Partial<MessageRow>),
    ]);

    const result = await fx.handlers.chatList({ threadId: 'thread-1' });
    expect(result[0]).not.toHaveProperty('toolCallsJson');
    expect(result[0]).not.toHaveProperty('parentId');
  });

  it('returns an empty array for a thread with no messages', async () => {
    const fx = buildFixture();
    const result = await fx.handlers.chatList({ threadId: 'thread-empty' });
    expect(result).toEqual([]);
  });

  it('rejects when threadId is missing', async () => {
    const fx = buildFixture();
    await expect(fx.handlers.chatList({ threadId: '' })).rejects.toThrow(/threadId/);
  });
});
