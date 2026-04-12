/**
 * IPC handlers — pure factory exposing the three Phase 1 channels
 * (`employees.list`, `chat.send`, `chat.list`) as plain async functions.
 *
 * Why a pure factory:
 *
 *   This module has zero electron imports on purpose. The electron
 *   surface (`ipcMain.handle`, `BrowserWindow`, `webContents.send`)
 *   lives in `./register.ts`. That split lets the entire request /
 *   response lifecycle of every IPC channel be unit-tested with
 *   in-memory repos and a stub orchestrator — `vitest run` never
 *   has to load Electron's native binding, the renderer never has
 *   to be alive, and a test failure points straight at the handler
 *   logic instead of getting buried under Electron mocks.
 *
 *   `register.ts` is a thin glue layer that wires the same handlers
 *   into `ipcMain.handle`, so the integration path is exactly one
 *   un-tested electron call per channel. That's the same trade-off
 *   the rest of the project makes (pure factories with cross-driver
 *   generic typing for everything DB-touching, electron-bound
 *   wrappers for the actual `app.whenReady()` wiring).
 *
 * Phase 1 chat semantics:
 *
 *   `chat.send` accepts an "auto" sentinel for `threadId` which the
 *   handler resolves to the user↔employee DM thread (creating it if
 *   it doesn't exist). The renderer's `ChatDrawer` component (T42)
 *   uses this on the very first message — every subsequent message
 *   in the same drawer session keeps using the resolved id. The
 *   `messageId` returned to the renderer is the row id of the
 *   USER's just-appended message, not the assistant's reply: the
 *   reply id is delivered live via the `events.dashboard` channel
 *   as part of `work.started` / `token.delta` events.
 *
 *   Phase 1 hardcodes the human user as `HUMAN_USER_ID = 'rocky'`
 *   to match the seed and the orchestrator integration tests. Phase 2
 *   replaces this with a proper users table when multi-user lands.
 */

import type {
  AddTicketCommentRequest,
  AddTicketCommentResponse,
  AssignTicketRequest,
  ChatMessage,
  CloseTicketRequest,
  Company,
  CompanySettings,
  CreateTicketRequest,
  CreateTicketResponse,
  Employee,
  GetTicketRequest,
  HireEmployeeRequest,
  HireEmployeeResponse,
  ListTicketsRequest,
  McpServerSummary,
  ReopenTicketRequest,
  ResolveThreadRequest,
  ResolveThreadResponse,
  SendChatRequest,
  SendChatResponse,
  TestMcpConnectionRequest,
  TestMcpConnectionResponse,
  Thread,
  Ticket,
  TicketDetail,
  UpdateTicketRequest,
} from '@team-x/shared-types';
import { AUTO_THREAD_ID } from '@team-x/shared-types';

import type { RoleSpec } from '@team-x/shared-types';

import type { CompanyRow } from '../db/repos/companies.js';
import type { CreateEmployeeInput, EmployeeRow } from '../db/repos/employees.js';
import type { AppendMessageInput, MessageRow } from '../db/repos/messages.js';
import type {
  AddThreadMemberInput,
  CreateThreadInput,
  GetOrCreateDmThreadInput,
  ThreadMemberRow,
  ThreadRow,
  ThreadWithMembers,
} from '../db/repos/threads.js';
import type { CreateTicketInput, TicketRow, UpdateTicketInput } from '../db/repos/tickets.js';

/**
 * Hardcoded id of the (single) human user in Phase 1. Replaced by a
 * real users table in Phase 2 — the constant is exported so the IPC
 * register layer and any future settings UI can reference one source.
 */
export const HUMAN_USER_ID = 'rocky';

/**
 * Re-export shared-types symbols that handler consumers (tests, the
 * register layer) have historically imported from this module. Keeping
 * the re-export preserves the existing call sites while making
 * shared-types the single source of truth for the string sentinel and
 * the request/response shapes.
 */
export { AUTO_THREAD_ID };
export type {
  HireEmployeeRequest,
  HireEmployeeResponse,
  ResolveThreadRequest,
  ResolveThreadResponse,
  SendChatRequest,
  SendChatResponse,
};

// ---------------------------------------------------------------------------
// Repo shapes (narrow structural interfaces)
// ---------------------------------------------------------------------------
//
// Same rationale as orchestrator/index.ts — we declare exactly the methods
// the handlers actually use so tests can hand-roll fakes without depending
// on drizzle's BetterSQLite3Database<Schema> generic. The real
// `createXRepo(db)` return values structurally satisfy these.

export interface IpcCompaniesRepo {
  list(): CompanyRow[];
}

export interface IpcEmployeesRepo {
  listByCompany(companyId: string): EmployeeRow[];
  getById(id: string): EmployeeRow | null;
  create(input: CreateEmployeeInput): string;
}

export interface IpcThreadsRepo {
  create(input: CreateThreadInput): string;
  getById(id: string): ThreadRow | null;
  addMember(input: AddThreadMemberInput): void;
  listMembers(threadId: string): ThreadMemberRow[];
  getOrCreateDmThread(input: GetOrCreateDmThreadInput): string;
  listByCompanyWithMembers(companyId: string): ThreadWithMembers[];
}

export interface IpcMessagesRepo {
  append(input: AppendMessageInput): string;
  listByThread(threadId: string): MessageRow[];
}

export interface IpcTicketsRepo {
  create(input: CreateTicketInput): string;
  getById(id: string): TicketRow | null;
  listByCompany(companyId: string): TicketRow[];
  listByAssignee(assigneeId: string): TicketRow[];
  update(id: string, input: UpdateTicketInput): void;
  assign(id: string, assigneeId: string): void;
  setThreadId(id: string, threadId: string): void;
  close(id: string): void;
  reopen(id: string): void;
}

/**
 * The narrow slice of the orchestrator the IPC layer needs. Decouples
 * the handlers from the full `Orchestrator` interface so tests can pass
 * a single-method stub.
 */
export interface IpcOrchestrator {
  enqueueChat(args: {
    threadId: string;
    employeeId: string;
    userMessageId: string;
  }): Promise<void>;
}

/**
 * Narrow slice of the role-loader the IPC layer needs for hire flow.
 * Decouples the handler from the full `RoleLoader` interface.
 */
export interface IpcRoleLookup {
  getSpec(roleId: string): RoleSpec | null;
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

import type { McpServersRepo } from '../db/repos/mcp-servers.js';
import type { McpHost } from '../services/mcp-host.js';

export interface IpcHandlerDeps {
  companiesRepo: IpcCompaniesRepo;
  employeesRepo: IpcEmployeesRepo;
  threadsRepo: IpcThreadsRepo;
  messagesRepo: IpcMessagesRepo;
  ticketsRepo: IpcTicketsRepo;
  orchestrator: IpcOrchestrator;
  roleLookup: IpcRoleLookup;
  mcpHost: McpHost;
  mcpServersRepo: McpServersRepo;
}

export interface IpcHandlers {
  /** `companies.list` — return every company. Phase 1 always returns exactly one. */
  companiesList(): Promise<Company[]>;

  /**
   * `employees.list` — return every employee in a given company,
   * mapped from the raw DB row to the public `Employee` shape from
   * shared-types. The renderer uses this to drive the dashboard cards
   * + the chat drawer's recipient list.
   */
  employeesList(req: { companyId: string }): Promise<Employee[]>;

  /**
   * `employees.create` — hire a new employee from a role-pack role.
   * Looks up the role spec from the role-loader, fills in the DB row
   * fields (level, title, sha, tools), and returns the new employee id.
   */
  employeesCreate(req: HireEmployeeRequest): Promise<HireEmployeeResponse>;

  /**
   * `chat.send` — append the user's message and enqueue an
   * orchestrator turn for the assistant reply. Returns immediately
   * after enqueue (does NOT wait for the reply); the reply streams
   * back to the renderer via the `events.dashboard` channel.
   *
   * The `threadId` may be the literal `AUTO_THREAD_ID` sentinel, in
   * which case the handler resolves it to the user↔employee DM
   * (creating one on the fly if necessary).
   *
   * Throws if the employee does not exist, or — when an explicit
   * threadId is provided — if the thread does not belong to the
   * employee's company. Both checks fail closed: the user message
   * is NOT persisted on the failing path so a 400-style rejection
   * does not litter the chat log with orphan rows.
   */
  chatSend(req: SendChatRequest): Promise<SendChatResponse>;

  /**
   * `chat.list` — return every message in a thread, oldest-first,
   * mapped to the public `ChatMessage` shape. The renderer's chat
   * drawer fetches this on mount and on every thread switch; live
   * updates after that come from the dashboard event stream rather
   * than re-polling this endpoint.
   */
  chatList(req: { threadId: string }): Promise<ChatMessage[]>;

  /**
   * `chat.resolveThread` — resolve (or lazily create) the user↔employee
   * DM thread for the given employee, returning only its id. Read-ish:
   * does NOT append a message, does NOT kick the orchestrator. The
   * drawer calls this on open so it can fetch the previous chat
   * history before the user sends anything. Without it a post-reload
   * drawer has no way to know which thread to fetch — the only thread
   * resolver was `chat.send`, which required sending a real message
   * first.
   *
   * Throws if the employee does not exist. On first open for an
   * employee, creates a fresh `kind='dm'` thread between `rocky` and
   * the employee via `getOrCreateDmThread` (same path `chat.send` uses
   * for the `AUTO_THREAD_ID` sentinel), so both entry points share
   * one source of truth for DM resolution.
   */
  chatResolveThread(req: ResolveThreadRequest): Promise<ResolveThreadResponse>;

  /**
   * `chat.listThreads` — return all threads for a company with their
   * members and last-message timestamp, sorted by most-recent first.
   * The renderer uses this to populate the thread list sidebar.
   */
  chatListThreads(req: { companyId: string }): Promise<Thread[]>;

  // -----------------------------------------------------------------------
  // MCP management handlers (Phase 2 — M10)
  // -----------------------------------------------------------------------

  /**
   * `mcp.list` — return all MCP servers available to a company.
   * Includes global servers (companyId=null) and company-specific servers.
   */
  mcpList(req: { companyId: string }): Promise<McpServerSummary[]>;

  /**
   * `mcp.toggle` — enable or disable an MCP server for a company.
   */
  mcpToggle(req: { serverId: string; enabled: boolean }): Promise<void>;

  /**
   * `mcp.addServer` — register a new MCP server (global or company-specific).
   */
  mcpAddServer(req: {
    companyId: string | null;
    name: string;
    transport: 'stdio' | 'sse';
    configJson: string;
  }): Promise<{ serverId: string }>;

  /**
   * `mcp.removeServer` — remove an MCP server.
   */
  mcpRemoveServer(req: { serverId: string }): Promise<void>;

  /**
   * `mcp.testConnection` — test an MCP connection without persisting.
   */
  mcpTestConnection(req: TestMcpConnectionRequest): Promise<TestMcpConnectionResponse>;

  // -----------------------------------------------------------------------
  // Ticket management handlers (Phase 2 — M12)
  // -----------------------------------------------------------------------

  /** `tickets.create` — file a new ticket. Optionally assigns immediately. */
  ticketsCreate(req: CreateTicketRequest): Promise<CreateTicketResponse>;

  /** `tickets.update` — update mutable ticket fields. */
  ticketsUpdate(req: UpdateTicketRequest): Promise<void>;

  /** `tickets.assign` — assign a ticket to an employee, creating thread + WorkItem. */
  ticketsAssign(req: AssignTicketRequest): Promise<void>;

  /** `tickets.close` — close a ticket (status → done). */
  ticketsClose(req: CloseTicketRequest): Promise<void>;

  /** `tickets.reopen` — reopen a closed ticket. */
  ticketsReopen(req: ReopenTicketRequest): Promise<void>;

  /** `tickets.addComment` — add a comment to the ticket's discussion thread. */
  ticketsAddComment(req: AddTicketCommentRequest): Promise<AddTicketCommentResponse>;

  /** `tickets.list` — list all tickets for a company. */
  ticketsList(req: ListTicketsRequest): Promise<Ticket[]>;

  /** `tickets.get` — get full ticket detail with thread messages and assignee. */
  ticketsGet(req: GetTicketRequest): Promise<TicketDetail>;
}

// ---------------------------------------------------------------------------
// Row → public shape mappers
// ---------------------------------------------------------------------------
//
// The `EmployeeRow` and `MessageRow` types from the repos contain
// internal-only columns (toolsAllowedJson, toolsDeniedJson, parentId,
// etc.) and have nullable fields where the public shapes use
// optionals. The mappers strip the internals and normalize the
// nullables so the renderer never sees a half-shape it has to
// re-validate.

import type {
  AuthorKind,
  EmployeeStatus,
  TicketPriority,
  TicketStatus,
} from '@team-x/shared-types';

function rowToTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    companyId: row.companyId,
    title: row.title,
    description: row.description,
    status: row.status as TicketStatus,
    priority: row.priority as TicketPriority,
    assigneeId: row.assigneeId,
    reporterId: row.reporterId,
    reporterKind: row.reporterKind as AuthorKind,
    labelsJson: row.labelsJson,
    dependenciesJson: row.dependenciesJson,
    slaHours: row.slaHours,
    dueAt: row.dueAt,
    threadId: row.threadId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    closedAt: row.closedAt,
  };
}

function rowToCompany(row: CompanyRow): Company {
  let settings: CompanySettings = {};
  try {
    const parsed = JSON.parse(row.settingsJson);
    if (parsed && typeof parsed === 'object') settings = parsed as CompanySettings;
  } catch {
    // Corrupted JSON — fall back to empty settings.
  }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.createdAt,
    settings,
  };
}

function rowToEmployee(row: EmployeeRow): Employee {
  // Strip the rolePackId, toolsAllowed/Denied JSON columns — they are
  // internal to the agent runtime and not part of the renderer
  // contract. Map nullable columns onto the optional public fields.
  const employee: Employee = {
    id: row.id,
    companyId: row.companyId,
    roleId: row.roleId,
    roleMdSha: row.roleMdSha,
    level: row.level,
    name: row.name,
    title: row.title,
    status: row.status as EmployeeStatus,
    createdAt: row.createdAt,
  };
  if (row.modelPref !== null) employee.modelPref = row.modelPref;
  if (row.providerPref !== null) employee.providerPref = row.providerPref;
  if (row.avatar !== null) employee.avatar = row.avatar;
  return employee;
}

function rowToChatMessage(row: MessageRow): ChatMessage {
  const msg: ChatMessage = {
    id: row.id,
    threadId: row.threadId,
    authorId: row.authorId,
    authorKind: row.authorKind as AuthorKind,
    content: row.content,
    createdAt: row.createdAt,
  };
  if (row.isAgentInitiated) msg.isAgentInitiated = true;
  return msg;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createIpcHandlers(deps: IpcHandlerDeps): IpcHandlers {
  const {
    companiesRepo,
    employeesRepo,
    threadsRepo,
    messagesRepo,
    ticketsRepo,
    orchestrator,
    roleLookup,
    mcpHost,
    mcpServersRepo,
  } = deps;

  return {
    async companiesList() {
      return companiesRepo.list().map(rowToCompany);
    },

    async employeesList({ companyId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] employees.list: companyId is required');
      }
      const rows = employeesRepo.listByCompany(companyId);
      return rows.map(rowToEmployee);
    },

    async employeesCreate({ companyId, roleId, name }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] employees.create: companyId is required');
      }
      if (typeof roleId !== 'string' || roleId.length === 0) {
        throw new Error('[ipc] employees.create: roleId is required');
      }
      if (typeof name !== 'string' || name.trim().length === 0) {
        throw new Error('[ipc] employees.create: name is required');
      }

      const spec = roleLookup.getSpec(roleId);
      if (!spec) {
        throw new Error(`[ipc] employees.create: role not found: ${roleId}`);
      }

      const employeeId = employeesRepo.create({
        companyId,
        rolePackId: 'strategia-official',
        roleId: spec.frontmatter.id,
        roleMdSha: spec.sha256,
        level: spec.frontmatter.level,
        name: name.trim(),
        title: spec.frontmatter.name,
        toolsAllowed: spec.frontmatter.tools_allowed ?? [],
        toolsDenied: spec.frontmatter.tools_denied ?? [],
      });

      return { employeeId };
    },

    async chatSend({ threadId, employeeId, content }) {
      if (typeof employeeId !== 'string' || employeeId.length === 0) {
        throw new Error('[ipc] chat.send: employeeId is required');
      }
      if (typeof content !== 'string' || content.length === 0) {
        throw new Error('[ipc] chat.send: content is required');
      }

      // Look up the target employee FIRST. We need its companyId to
      // resolve `AUTO_THREAD_ID`, AND we want a clear error before any
      // DB writes if the employee is missing.
      const employee = employeesRepo.getById(employeeId);
      if (!employee) {
        throw new Error(`[ipc] chat.send: employee not found: ${employeeId}`);
      }

      // Resolve the thread.
      let resolvedThreadId: string;
      if (threadId === AUTO_THREAD_ID) {
        resolvedThreadId = threadsRepo.getOrCreateDmThread({
          companyId: employee.companyId,
          employeeId,
          userId: HUMAN_USER_ID,
        });
      } else {
        const thread = threadsRepo.getById(threadId);
        if (!thread) {
          throw new Error(`[ipc] chat.send: thread not found: ${threadId}`);
        }
        // Defensive: refuse to send into a thread that doesn't belong
        // to the employee's company. The orchestrator has its own
        // version of this check (see orchestrator/index.ts), but
        // catching it here avoids opening a runs row for a doomed turn.
        if (thread.companyId !== employee.companyId) {
          throw new Error(
            `[ipc] chat.send: thread ${threadId} does not belong to ` +
              `employee ${employeeId}'s company`,
          );
        }
        resolvedThreadId = threadId;
      }

      // Append the user's message — this gives us the id we hand the
      // orchestrator (which uses it for correlation in `work.failed`
      // payloads) and return to the renderer.
      const messageId = messagesRepo.append({
        threadId: resolvedThreadId,
        authorId: HUMAN_USER_ID,
        authorKind: 'user',
        content,
      });

      // Kick off the assistant turn. CRITICAL: do NOT await the
      // returned Promise. `orchestrator.enqueueChat` resolves when the
      // turn has fully completed (assistant message persisted, runs
      // row closed, `work.completed` emitted) — awaiting it here would
      // block the IPC reply for the entire duration of the LLM stream
      // and the renderer would not see the user's message in the
      // drawer until the assistant had finished thinking. The whole
      // point of the dashboard event channel is to deliver the reply
      // live; this handler's job is to persist the user's input,
      // queue the work, and get out of the way.
      //
      // The orchestrator's failure modes (shutdown, provider error,
      // role-loader miss) all surface either as `work.failed`
      // dashboard events (which the renderer renders) or via the
      // logged catch below. We never re-throw, because the user
      // message has already been persisted and the renderer's chat
      // bubble is already on screen — a thrown IPC reply would
      // confuse the UI into thinking the entire send was rejected.
      orchestrator
        .enqueueChat({
          threadId: resolvedThreadId,
          employeeId,
          userMessageId: messageId,
        })
        .catch((err: unknown) => {
          console.error(
            `[ipc] chat.send: orchestrator turn failed for thread=${resolvedThreadId} ` +
              `employee=${employeeId} userMessage=${messageId}:`,
            err,
          );
        });

      return { threadId: resolvedThreadId, messageId };
    },

    async chatList({ threadId }) {
      if (typeof threadId !== 'string' || threadId.length === 0) {
        throw new Error('[ipc] chat.list: threadId is required');
      }
      const rows = messagesRepo.listByThread(threadId);
      return rows.map(rowToChatMessage);
    },

    async chatResolveThread({ employeeId }) {
      if (typeof employeeId !== 'string' || employeeId.length === 0) {
        throw new Error('[ipc] chat.resolveThread: employeeId is required');
      }
      const employee = employeesRepo.getById(employeeId);
      if (!employee) {
        throw new Error(`[ipc] chat.resolveThread: employee not found: ${employeeId}`);
      }
      const threadId = threadsRepo.getOrCreateDmThread({
        companyId: employee.companyId,
        employeeId,
        userId: HUMAN_USER_ID,
      });
      return { threadId };
    },

    async chatListThreads({ companyId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] chat.listThreads: companyId is required');
      }
      const rows = threadsRepo.listByCompanyWithMembers(companyId);
      return rows.map(
        (row): Thread => ({
          id: row.id,
          companyId: row.companyId,
          kind: row.kind as Thread['kind'],
          subject: row.subject,
          createdBy: row.createdBy,
          createdAt: row.createdAt,
          lastMessageAt: row.lastMessageAt ?? null,
          members: row.members.map((m) => ({
            memberId: m.memberId,
            memberKind: m.memberKind as 'user' | 'employee',
            roleInThread: m.roleInThread,
          })),
        }),
      );
    },

    // -----------------------------------------------------------------------
    // MCP management handlers
    // -----------------------------------------------------------------------

    async mcpList({ companyId: _companyId }) {
      const servers = mcpHost.listServers();
      return servers.map((server) => ({
        id: server.id,
        companyId: server.companyId,
        name: server.name,
        transport: server.transport,
        enabled: server.enabled,
        lastHealth: server.lastHealth,
        toolCount: server.tools.length,
      }));
    },

    async mcpToggle({ serverId, enabled }) {
      const server = mcpHost.getServer(serverId);
      if (!server) {
        throw new Error(`[ipc] mcp.toggle: server not found: ${serverId}`);
      }

      if (enabled && !server.connected) {
        // Reconnect
        const config = mcpServersRepo.getById(serverId);
        if (!config) {
          throw new Error(`[ipc] mcp.toggle: server config not found: ${serverId}`);
        }
        await mcpHost.connectToServer({
          id: config.id,
          companyId: config.companyId,
          name: config.name,
          transport: config.transport as 'stdio' | 'sse',
          configJson: config.configJson,
          enabled: config.enabled,
          lastHealth: config.lastHealth,
        });
      } else if (!enabled && server.connected) {
        // Disconnect
        await mcpHost.disconnectServer(serverId);
      }

      mcpServersRepo.updateEnabled(serverId, enabled);
    },

    async mcpAddServer({ companyId, name, transport, configJson }) {
      const serverId = mcpServersRepo.create({
        companyId,
        name,
        transport,
        configJson,
      });

      // Try to connect immediately
      const config = mcpServersRepo.getById(serverId);
      if (config) {
        await mcpHost
          .connectToServer({
            id: config.id,
            companyId: config.companyId,
            name: config.name,
            transport: config.transport as 'stdio' | 'sse',
            configJson: config.configJson,
            enabled: config.enabled,
            lastHealth: config.lastHealth,
          })
          .catch((err) => {
            console.error(`[ipc] mcp.addServer: failed to connect to ${name}:`, err);
          });
      }

      return { serverId };
    },

    async mcpRemoveServer({ serverId }) {
      await mcpHost.disconnectServer(serverId);
      mcpServersRepo.delete(serverId);
    },

    async mcpTestConnection({ transport, configJson }) {
      try {
        const client = new (await import('@modelcontextprotocol/sdk/client/index.js')).Client({
          name: 'team-x-test-connection',
          version: '0.0.1',
        });

        const clientTransport =
          transport === 'stdio'
            ? new (await import('@modelcontextprotocol/sdk/client/stdio.js')).StdioClientTransport(
                JSON.parse(configJson),
              )
            : new (await import('@modelcontextprotocol/sdk/client/sse.js')).SSEClientTransport(
                new URL(JSON.parse(configJson).url),
              );

        await client.connect(clientTransport);
        const tools = await client.listTools();
        await client.close();

        return {
          ok: true,
          toolCount: tools.tools?.length ?? 0,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          error: message,
        };
      }
    },

    // -----------------------------------------------------------------------
    // Ticket management handlers (Phase 2 — M12)
    // -----------------------------------------------------------------------

    async ticketsCreate(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] tickets.create: companyId is required');
      }
      if (typeof req.title !== 'string' || req.title.trim().length === 0) {
        throw new Error('[ipc] tickets.create: title is required');
      }

      const ticketId = ticketsRepo.create({
        companyId: req.companyId,
        title: req.title.trim(),
        description: req.description ?? '',
        priority: req.priority ?? 'medium',
        assigneeId: req.assigneeId ?? null,
        reporterId: HUMAN_USER_ID,
        reporterKind: 'user',
        labelsJson: req.labelsJson ?? '[]',
        slaHours: req.slaHours ?? null,
        dueAt: req.dueAt ?? null,
      });

      // If assigneeId was provided, trigger immediate assignment flow
      if (req.assigneeId) {
        const employee = employeesRepo.getById(req.assigneeId);
        if (employee) {
          const ticket = ticketsRepo.getById(ticketId);
          if (ticket) {
            // Create the ticket discussion thread
            const threadId = threadsRepo.create({
              companyId: req.companyId,
              kind: 'ticket',
              subject: req.title.trim(),
              createdBy: HUMAN_USER_ID,
            });
            threadsRepo.addMember({
              threadId,
              memberId: HUMAN_USER_ID,
              memberKind: 'user',
            });
            threadsRepo.addMember({
              threadId,
              memberId: req.assigneeId,
              memberKind: 'employee',
            });
            ticketsRepo.setThreadId(ticketId, threadId);
            ticketsRepo.assign(ticketId, req.assigneeId);

            // Post the ticket description as the first message
            const msgContent = `**Ticket: ${req.title.trim()}**\n\n${req.description ?? '(no description)'}`;
            const messageId = messagesRepo.append({
              threadId,
              authorId: HUMAN_USER_ID,
              authorKind: 'user',
              content: msgContent,
            });

            // Enqueue agent work (fire-and-forget)
            orchestrator
              .enqueueChat({
                threadId,
                employeeId: req.assigneeId,
                userMessageId: messageId,
              })
              .catch((err: unknown) => {
                console.error(
                  `[ipc] tickets.create: orchestrator turn failed for ticket=${ticketId}:`,
                  err,
                );
              });
          }
        }
      }

      return { ticketId };
    },

    async ticketsUpdate(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.update: ticketId is required');
      }
      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.update: ticket not found: ${req.ticketId}`);
      }
      ticketsRepo.update(req.ticketId, {
        title: req.title,
        description: req.description,
        priority: req.priority,
        status: req.status,
        labelsJson: req.labelsJson,
        slaHours: req.slaHours,
        dueAt: req.dueAt,
      });
    },

    async ticketsAssign(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.assign: ticketId is required');
      }
      if (typeof req.assigneeId !== 'string' || req.assigneeId.length === 0) {
        throw new Error('[ipc] tickets.assign: assigneeId is required');
      }

      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.assign: ticket not found: ${req.ticketId}`);
      }
      const employee = employeesRepo.getById(req.assigneeId);
      if (!employee) {
        throw new Error(`[ipc] tickets.assign: employee not found: ${req.assigneeId}`);
      }

      ticketsRepo.assign(req.ticketId, req.assigneeId);

      // Create discussion thread if one doesn't exist yet
      let threadId = ticket.threadId;
      if (!threadId) {
        threadId = threadsRepo.create({
          companyId: ticket.companyId,
          kind: 'ticket',
          subject: ticket.title,
          createdBy: HUMAN_USER_ID,
        });
        threadsRepo.addMember({
          threadId,
          memberId: HUMAN_USER_ID,
          memberKind: 'user',
        });
        threadsRepo.addMember({
          threadId,
          memberId: req.assigneeId,
          memberKind: 'employee',
        });
        ticketsRepo.setThreadId(req.ticketId, threadId);

        // Post the ticket description as the first message
        const msgContent = `**Ticket: ${ticket.title}**\n\n${ticket.description || '(no description)'}`;
        const messageId = messagesRepo.append({
          threadId,
          authorId: HUMAN_USER_ID,
          authorKind: 'user',
          content: msgContent,
        });

        // Enqueue agent work
        orchestrator
          .enqueueChat({
            threadId,
            employeeId: req.assigneeId,
            userMessageId: messageId,
          })
          .catch((err: unknown) => {
            console.error(
              `[ipc] tickets.assign: orchestrator turn failed for ticket=${req.ticketId}:`,
              err,
            );
          });
      } else {
        // Thread exists — post a reassignment notice and enqueue
        const msgContent = `Ticket reassigned to ${employee.name} (${employee.title}).`;
        const messageId = messagesRepo.append({
          threadId,
          authorId: HUMAN_USER_ID,
          authorKind: 'system',
          content: msgContent,
        });

        // Ensure new assignee is a thread member
        const members = threadsRepo.listMembers(threadId);
        const alreadyMember = members.some(
          (m) => m.memberId === req.assigneeId && m.memberKind === 'employee',
        );
        if (!alreadyMember) {
          threadsRepo.addMember({
            threadId,
            memberId: req.assigneeId,
            memberKind: 'employee',
          });
        }

        orchestrator
          .enqueueChat({
            threadId,
            employeeId: req.assigneeId,
            userMessageId: messageId,
          })
          .catch((err: unknown) => {
            console.error(
              `[ipc] tickets.assign: orchestrator turn failed for ticket=${req.ticketId}:`,
              err,
            );
          });
      }
    },

    async ticketsClose(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.close: ticketId is required');
      }
      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.close: ticket not found: ${req.ticketId}`);
      }
      ticketsRepo.close(req.ticketId);
    },

    async ticketsReopen(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.reopen: ticketId is required');
      }
      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.reopen: ticket not found: ${req.ticketId}`);
      }
      ticketsRepo.reopen(req.ticketId);
    },

    async ticketsAddComment(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.addComment: ticketId is required');
      }
      if (typeof req.content !== 'string' || req.content.trim().length === 0) {
        throw new Error('[ipc] tickets.addComment: content is required');
      }

      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.addComment: ticket not found: ${req.ticketId}`);
      }

      // Ensure ticket has a thread
      let threadId = ticket.threadId;
      if (!threadId) {
        threadId = threadsRepo.create({
          companyId: ticket.companyId,
          kind: 'ticket',
          subject: ticket.title,
          createdBy: HUMAN_USER_ID,
        });
        threadsRepo.addMember({
          threadId,
          memberId: HUMAN_USER_ID,
          memberKind: 'user',
        });
        ticketsRepo.setThreadId(req.ticketId, threadId);
      }

      const messageId = messagesRepo.append({
        threadId,
        authorId: HUMAN_USER_ID,
        authorKind: 'user',
        content: req.content.trim(),
      });

      // If the ticket is assigned, enqueue a response from the agent
      if (ticket.assigneeId) {
        orchestrator
          .enqueueChat({
            threadId,
            employeeId: ticket.assigneeId,
            userMessageId: messageId,
          })
          .catch((err: unknown) => {
            console.error(
              `[ipc] tickets.addComment: orchestrator turn failed for ticket=${req.ticketId}:`,
              err,
            );
          });
      }

      return { messageId };
    },

    async ticketsList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] tickets.list: companyId is required');
      }
      return ticketsRepo.listByCompany(req.companyId).map(rowToTicket);
    },

    async ticketsGet(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.get: ticketId is required');
      }
      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.get: ticket not found: ${req.ticketId}`);
      }

      // Fetch thread messages if the ticket has a discussion thread
      let messages: ChatMessage[] = [];
      if (ticket.threadId) {
        const rows = messagesRepo.listByThread(ticket.threadId);
        messages = rows.map(rowToChatMessage);
      }

      // Fetch assignee
      let assignee: Employee | null = null;
      if (ticket.assigneeId) {
        const empRow = employeesRepo.getById(ticket.assigneeId);
        if (empRow) assignee = rowToEmployee(empRow);
      }

      return {
        ...rowToTicket(ticket),
        messages,
        assignee,
      };
    },
  };
}
