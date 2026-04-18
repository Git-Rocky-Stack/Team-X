import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RoleSpec } from '@team-x/shared-types';
import type { CompanyRow } from '../db/repos/companies.js';
import type { EmployeeRow } from '../db/repos/employees.js';
import type { AppendMessageInput, MessageRow } from '../db/repos/messages.js';
import type {
  AddThreadMemberInput,
  CreateThreadInput,
  GetOrCreateDmThreadInput,
  ThreadMemberRow,
  ThreadRow,
} from '../db/repos/threads.js';

import type { CreateEmployeeInput } from '../db/repos/employees.js';
import {
  AUTO_THREAD_ID,
  HUMAN_USER_ID,
  type IpcCompaniesRepo,
  type IpcEmployeesRepo,
  type IpcMessagesRepo,
  type IpcOrchestrator,
  type IpcRoleLookup,
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

class FakeCompaniesRepo implements IpcCompaniesRepo {
  private rows: CompanyRow[] = [];
  /** Visible to tests so they can assert on insert ordering / call counts. */
  createCalls: Array<{
    name: string;
    slug: string;
    settings?: Record<string, unknown>;
    icon?: string;
    theme?: string;
  }> = [];
  /** Visible to tests so archive call assertions don't need a spy wrapper. */
  archiveCalls: string[] = [];
  private nextIdCounter = 1;

  put(row: CompanyRow): void {
    this.rows.push(row);
  }

  list(): CompanyRow[] {
    return this.rows;
  }

  create(input: {
    name: string;
    slug: string;
    settings?: Record<string, unknown>;
    icon?: string;
    theme?: string;
  }): string {
    this.createCalls.push(input);
    // Mirror the SQL UNIQUE constraint surfacing — the production repo
    // hands sqlite the row and lets the constraint throw; the fake
    // pre-checks so tests can drive the duplicate-slug code path.
    const dup = this.rows.find((r) => r.slug === input.slug);
    if (dup) {
      throw new Error(`UNIQUE constraint failed: companies.slug (slug=${input.slug})`);
    }
    const id = `company-new-${this.nextIdCounter++}`;
    this.rows.push({
      id,
      name: input.name,
      slug: input.slug,
      createdAt: Date.now(),
      settingsJson: JSON.stringify(input.settings ?? {}),
      icon: input.icon ?? null,
      theme: input.theme ?? 'dark',
      status: 'running',
    } as CompanyRow);
    return id;
  }

  getById(id: string): CompanyRow | null {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  archive(id: string): void {
    this.archiveCalls.push(id);
    const row = this.rows.find((r) => r.id === id);
    if (row) {
      (row as { status: string }).status = 'archived';
    }
  }
}

class FakeEmployeesRepo implements IpcEmployeesRepo {
  private byId = new Map<string, EmployeeRow>();
  private byCompany = new Map<string, EmployeeRow[]>();
  createCalls: CreateEmployeeInput[] = [];
  private nextIdCounter = 1;

  put(row: EmployeeRow): void {
    this.byId.set(row.id, row);
    const list = this.byCompany.get(row.companyId) ?? [];
    list.push(row);
    this.byCompany.set(row.companyId, list);
  }

  listByCompany(companyId: string): EmployeeRow[] {
    return this.byCompany.get(companyId) ?? [];
  }

  listVisibleByCompany(companyId: string): EmployeeRow[] {
    return (this.byCompany.get(companyId) ?? []).filter((r) => !r.isSystem);
  }

  getById(id: string): EmployeeRow | null {
    return this.byId.get(id) ?? null;
  }

  findSystemByRoleId(companyId: string, roleId: string): EmployeeRow | null {
    const rows = this.byCompany.get(companyId) ?? [];
    return rows.find((r) => r.roleId === roleId && r.isSystem) ?? null;
  }

  create(input: CreateEmployeeInput): string {
    this.createCalls.push(input);
    const id = `emp-new-${this.nextIdCounter++}`;
    const row = makeEmployeeRow({
      id,
      companyId: input.companyId,
      rolePackId: input.rolePackId,
      roleId: input.roleId,
      roleMdSha: input.roleMdSha,
      level: input.level,
      name: input.name,
      title: input.title,
    });
    this.put(row);
    return id;
  }

  delete(id: string): void {
    const row = this.byId.get(id);
    if (!row) return;
    this.byId.delete(id);
    const list = this.byCompany.get(row.companyId) ?? [];
    this.byCompany.set(
      row.companyId,
      list.filter((r) => r.id !== id),
    );
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

  /**
   * Mirror of the production `listByCompanyWithMembers` query — returns
   * every stored thread for `companyId` with its membership list joined
   * on. Backs the `chat.listThreads` handler tests (M31 T5). Sort order
   * matches production (createdAt ascending) well enough for the
   * projection assertions we care about.
   */
  listByCompanyWithMembers(companyId: string): (ThreadRow & { members: ThreadMemberRow[] })[] {
    const result: (ThreadRow & { members: ThreadMemberRow[] })[] = [];
    for (const row of this.threads.values()) {
      if (row.companyId !== companyId) continue;
      result.push({ ...row, members: this.members.get(row.id) ?? [] });
    }
    return result;
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

class FakeRoleLookup implements IpcRoleLookup {
  private specs = new Map<string, RoleSpec>();

  putSpec(spec: RoleSpec): void {
    this.specs.set(spec.frontmatter.id, spec);
  }

  getSpec(roleId: string): RoleSpec | null {
    return this.specs.get(roleId) ?? null;
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
    isSystem: false,
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
  companies: FakeCompaniesRepo;
  employees: FakeEmployeesRepo;
  threads: FakeThreadsRepo;
  messages: FakeMessagesRepo;
  orchestrator: FakeOrchestrator;
  roleLookup: FakeRoleLookup;
  handlers: ReturnType<typeof createIpcHandlers>;
}

function makeRoleSpec(overrides: Partial<RoleSpec['frontmatter']> = {}): RoleSpec {
  return {
    frontmatter: {
      id: 'chief-executive-officer',
      name: 'Chief Executive Officer',
      level: 'officer',
      reports_to: [],
      manages: [],
      preferred_model_tier: 'frontier',
      preferred_providers: ['anthropic'],
      fallback_providers: ['openai'],
      tools_allowed: ['browse', 'context7'],
      tools_denied: ['shell'],
      decision_authority: { autonomous: [], escalate: [] },
      escalates_to: [],
      kpis: [],
      output_format: 'markdown',
      temperature: 0.7,
      license: 'MIT',
      author: 'Rocky Stack',
      version: '1.0.0',
      ...overrides,
    },
    body: '# Identity\nYou are the CEO.',
    sourcePath: '/roles/officer/ceo.md',
    sha256: 'b'.repeat(64),
  } as RoleSpec;
}

function buildFixture(): Fixture {
  const companies = new FakeCompaniesRepo();
  const employees = new FakeEmployeesRepo();
  const threads = new FakeThreadsRepo();
  const messages = new FakeMessagesRepo();
  const orchestrator = new FakeOrchestrator();
  const roleLookup = new FakeRoleLookup();
  const handlers = createIpcHandlers({
    companiesRepo: companies,
    employeesRepo: employees,
    threadsRepo: threads,
    messagesRepo: messages,
    orchestrator,
    roleLookup,
  });
  return { companies, employees, threads, messages, orchestrator, roleLookup, handlers };
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
// employees.create
// ---------------------------------------------------------------------------

describe('IPC: employees.create', () => {
  it('creates an employee from a role spec and returns the new id', async () => {
    const fx = buildFixture();
    fx.roleLookup.putSpec(makeRoleSpec());

    const result = await fx.handlers.employeesCreate({
      companyId: 'co-1',
      roleId: 'chief-executive-officer',
      name: 'Iris Kovač',
    });

    expect(result.employeeId).toBe('emp-new-1');
    expect(fx.employees.createCalls).toHaveLength(1);
    expect(fx.employees.createCalls[0]).toMatchObject({
      companyId: 'co-1',
      rolePackId: 'strategia-official',
      roleId: 'chief-executive-officer',
      level: 'officer',
      name: 'Iris Kovač',
      title: 'Chief Executive Officer',
      toolsAllowed: ['browse', 'context7'],
      toolsDenied: ['shell'],
    });
  });

  it('trims whitespace from the name', async () => {
    const fx = buildFixture();
    fx.roleLookup.putSpec(makeRoleSpec());

    await fx.handlers.employeesCreate({
      companyId: 'co-1',
      roleId: 'chief-executive-officer',
      name: '  Iris Kovač  ',
    });

    expect(fx.employees.createCalls[0]?.name).toBe('Iris Kovač');
  });

  it('rejects when the role is not found', async () => {
    const fx = buildFixture();
    await expect(
      fx.handlers.employeesCreate({
        companyId: 'co-1',
        roleId: 'nonexistent-role',
        name: 'Test',
      }),
    ).rejects.toThrow(/role not found/);
  });

  it('rejects when companyId is empty', async () => {
    const fx = buildFixture();
    await expect(
      fx.handlers.employeesCreate({ companyId: '', roleId: 'ceo', name: 'Test' }),
    ).rejects.toThrow(/companyId/);
  });

  it('rejects when name is empty or whitespace', async () => {
    const fx = buildFixture();
    fx.roleLookup.putSpec(makeRoleSpec());
    await expect(
      fx.handlers.employeesCreate({
        companyId: 'co-1',
        roleId: 'chief-executive-officer',
        name: '  ',
      }),
    ).rejects.toThrow(/name is required/);
  });

  // M31 T0 — framework-internal roles (level: system) must never be hireable
  // via the IPC surface. Only `ensureSystemAgent` may seed them.
  it('refuses to hire a framework-internal role (level: system)', async () => {
    const fx = buildFixture();
    fx.roleLookup.putSpec(
      makeRoleSpec({ id: 'system-agent', name: 'Team-X Copilot', level: 'system' }),
    );
    await expect(
      fx.handlers.employeesCreate({
        companyId: 'co-1',
        roleId: 'system-agent',
        name: 'Imposter',
      }),
    ).rejects.toThrow(/framework-internal/);
    expect(fx.employees.createCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// employees.fire — M31 T0 system-agent guard
// ---------------------------------------------------------------------------

describe('IPC: employees.fire', () => {
  it('deletes a regular employee by id', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'emp-iris', companyId: 'co-1' }));
    await fx.handlers.employeesFire({ employeeId: 'emp-iris' });
    expect(fx.employees.getById('emp-iris')).toBeNull();
  });

  it('rejects when employeeId is empty', async () => {
    const fx = buildFixture();
    await expect(fx.handlers.employeesFire({ employeeId: '' })).rejects.toThrow(
      /employeeId is required/,
    );
  });

  it('rejects when the employee does not exist', async () => {
    const fx = buildFixture();
    await expect(fx.handlers.employeesFire({ employeeId: 'ghost' })).rejects.toThrow(
      /employee not found/,
    );
  });

  it('refuses to fire a framework-internal system-agent (isSystem=true)', async () => {
    const fx = buildFixture();
    fx.employees.put(
      makeEmployeeRow({
        id: 'emp-sys',
        companyId: 'co-1',
        roleId: 'system-agent',
        level: 'system',
        isSystem: true,
      }),
    );
    await expect(fx.handlers.employeesFire({ employeeId: 'emp-sys' })).rejects.toThrow(
      /framework-internal/,
    );
    // Row must still be present after the refused delete.
    expect(fx.employees.getById('emp-sys')).not.toBeNull();
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

describe('IPC: chat.resolveThread', () => {
  it('resolves the user↔employee DM thread via getOrCreateDmThread', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'emp-iris', companyId: 'co-1' }));
    fx.threads.nextDmThreadId = 'dm-iris-rocky';
    fx.threads.nextDmCreates = true;

    const result = await fx.handlers.chatResolveThread({ employeeId: 'emp-iris' });

    expect(result).toEqual({ threadId: 'dm-iris-rocky' });
    expect(fx.threads.getOrCreateCalls).toEqual([
      { companyId: 'co-1', employeeId: 'emp-iris', userId: HUMAN_USER_ID },
    ]);
    // Must NOT touch messages or orchestrator — resolveThread is a
    // read-ish lookup that exists to let the drawer find an existing
    // conversation, not to start one.
    expect(fx.messages.appended).toHaveLength(0);
    expect(fx.orchestrator.enqueueCalls).toHaveLength(0);
  });

  it('returns the existing DM thread on a second call for the same employee', async () => {
    const fx = buildFixture();
    fx.employees.put(makeEmployeeRow({ id: 'emp-iris', companyId: 'co-1' }));
    fx.threads.nextDmThreadId = 'dm-iris-rocky';
    fx.threads.nextDmCreates = true;

    const first = await fx.handlers.chatResolveThread({ employeeId: 'emp-iris' });
    // Flip the fixture to "does not create" so the second call would
    // trip the test's creation guard if the handler didn't delegate
    // to getOrCreateDmThread (which is itself idempotent).
    fx.threads.nextDmCreates = false;
    const second = await fx.handlers.chatResolveThread({ employeeId: 'emp-iris' });

    expect(first.threadId).toBe('dm-iris-rocky');
    expect(second.threadId).toBe('dm-iris-rocky');
    expect(fx.threads.getOrCreateCalls).toHaveLength(2);
  });

  it('rejects when employeeId is missing', async () => {
    const fx = buildFixture();
    await expect(fx.handlers.chatResolveThread({ employeeId: '' })).rejects.toThrow(/employeeId/);
  });

  it('rejects when the employee does not exist', async () => {
    const fx = buildFixture();
    await expect(fx.handlers.chatResolveThread({ employeeId: 'emp-ghost' })).rejects.toThrow(
      /employee not found/,
    );
    // Must fail closed — no thread creation attempt for a missing employee.
    expect(fx.threads.getOrCreateCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// chat.listThreads (Phase 5 — M31 T5)
// ---------------------------------------------------------------------------

describe('IPC: chat.listThreads', () => {
  it('flags threads whose members include a system pseudo-employee as isSystemAgent: true', async () => {
    const fx = buildFixture();

    // Seed: one system pseudo-employee + one regular employee in co-1.
    fx.employees.put(
      makeEmployeeRow({
        id: 'emp-system',
        roleId: 'system-agent',
        name: 'System Agent',
        title: 'System Agent',
        isSystem: true,
      }),
    );
    fx.employees.put(makeEmployeeRow({ id: 'emp-iris', isSystem: false }));

    // A Copilot Conversations thread — user + system pseudo-employee.
    fx.threads.putThread(
      makeThreadRow({
        id: 'thread-copilot',
        companyId: 'co-1',
        kind: 'group',
        subject: 'Copilot: who is on leave next week?',
      }),
    );
    fx.threads.addMember({
      threadId: 'thread-copilot',
      memberId: HUMAN_USER_ID,
      memberKind: 'user',
    });
    fx.threads.addMember({
      threadId: 'thread-copilot',
      memberId: 'emp-system',
      memberKind: 'employee',
    });

    const result = await fx.handlers.chatListThreads({ companyId: 'co-1' });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('thread-copilot');
    expect(result[0]?.isSystemAgent).toBe(true);
  });

  it('returns isSystemAgent: false for user↔employee DMs with no system members', async () => {
    const fx = buildFixture();

    fx.employees.put(makeEmployeeRow({ id: 'emp-iris', isSystem: false }));
    fx.threads.putThread(makeThreadRow({ id: 'thread-dm', companyId: 'co-1', kind: 'dm' }));
    fx.threads.addMember({
      threadId: 'thread-dm',
      memberId: HUMAN_USER_ID,
      memberKind: 'user',
    });
    fx.threads.addMember({
      threadId: 'thread-dm',
      memberId: 'emp-iris',
      memberKind: 'employee',
    });

    const result = await fx.handlers.chatListThreads({ companyId: 'co-1' });

    expect(result).toHaveLength(1);
    expect(result[0]?.isSystemAgent).toBe(false);
  });

  it('returns isSystemAgent: false when all employee members are non-system (multi-participant group)', async () => {
    const fx = buildFixture();

    fx.employees.put(makeEmployeeRow({ id: 'emp-iris', isSystem: false }));
    fx.employees.put(makeEmployeeRow({ id: 'emp-mateo', isSystem: false }));

    fx.threads.putThread(makeThreadRow({ id: 'thread-group', companyId: 'co-1', kind: 'group' }));
    fx.threads.addMember({
      threadId: 'thread-group',
      memberId: HUMAN_USER_ID,
      memberKind: 'user',
    });
    fx.threads.addMember({
      threadId: 'thread-group',
      memberId: 'emp-iris',
      memberKind: 'employee',
    });
    fx.threads.addMember({
      threadId: 'thread-group',
      memberId: 'emp-mateo',
      memberKind: 'employee',
    });

    const result = await fx.handlers.chatListThreads({ companyId: 'co-1' });

    expect(result[0]?.isSystemAgent).toBe(false);
  });

  it('maps the full public Thread shape — members + lastMessageAt + isSystemAgent', async () => {
    const fx = buildFixture();

    fx.employees.put(makeEmployeeRow({ id: 'emp-iris', isSystem: false }));
    fx.threads.putThread({
      id: 'thread-dm',
      companyId: 'co-1',
      kind: 'dm',
      subject: null,
      createdBy: 'rocky',
      createdAt: 1_700_000_000_000,
      lastMessageAt: 1_700_000_500_000,
    } as ThreadRow);
    fx.threads.addMember({
      threadId: 'thread-dm',
      memberId: HUMAN_USER_ID,
      memberKind: 'user',
    });
    fx.threads.addMember({
      threadId: 'thread-dm',
      memberId: 'emp-iris',
      memberKind: 'employee',
      roleInThread: 'participant',
    });

    const result = await fx.handlers.chatListThreads({ companyId: 'co-1' });

    expect(result).toEqual([
      {
        id: 'thread-dm',
        companyId: 'co-1',
        kind: 'dm',
        subject: null,
        createdBy: 'rocky',
        createdAt: 1_700_000_000_000,
        lastMessageAt: 1_700_000_500_000,
        members: [
          { memberId: HUMAN_USER_ID, memberKind: 'user', roleInThread: null },
          { memberId: 'emp-iris', memberKind: 'employee', roleInThread: 'participant' },
        ],
        isSystemAgent: false,
      },
    ]);
  });

  it('scopes results to the requested company — cross-company threads never leak', async () => {
    const fx = buildFixture();

    fx.employees.put(makeEmployeeRow({ id: 'emp-system-1', companyId: 'co-1', isSystem: true }));
    fx.employees.put(makeEmployeeRow({ id: 'emp-system-2', companyId: 'co-2', isSystem: true }));

    fx.threads.putThread(makeThreadRow({ id: 'thread-co1', companyId: 'co-1' }));
    fx.threads.addMember({
      threadId: 'thread-co1',
      memberId: 'emp-system-1',
      memberKind: 'employee',
    });

    fx.threads.putThread(makeThreadRow({ id: 'thread-co2', companyId: 'co-2' }));
    fx.threads.addMember({
      threadId: 'thread-co2',
      memberId: 'emp-system-2',
      memberKind: 'employee',
    });

    const co1 = await fx.handlers.chatListThreads({ companyId: 'co-1' });
    expect(co1.map((t) => t.id)).toEqual(['thread-co1']);
    expect(co1[0]?.isSystemAgent).toBe(true);

    const co2 = await fx.handlers.chatListThreads({ companyId: 'co-2' });
    expect(co2.map((t) => t.id)).toEqual(['thread-co2']);
    expect(co2[0]?.isSystemAgent).toBe(true);
  });

  it('rejects when companyId is missing', async () => {
    const fx = buildFixture();
    await expect(fx.handlers.chatListThreads({ companyId: '' })).rejects.toThrow(/companyId/);
  });
});
