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
  ChatMessage,
  Company,
  CompanySettings,
  Employee,
  SendChatRequest,
  SendChatResponse,
} from '@team-x/shared-types';
import { AUTO_THREAD_ID } from '@team-x/shared-types';

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
export type { SendChatRequest, SendChatResponse };

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
}

export interface IpcThreadsRepo {
  create(input: CreateThreadInput): string;
  getById(id: string): ThreadRow | null;
  addMember(input: AddThreadMemberInput): void;
  listMembers(threadId: string): ThreadMemberRow[];
  getOrCreateDmThread(input: GetOrCreateDmThreadInput): string;
}

export interface IpcMessagesRepo {
  append(input: AppendMessageInput): string;
  listByThread(threadId: string): MessageRow[];
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

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface IpcHandlerDeps {
  companiesRepo: IpcCompaniesRepo;
  employeesRepo: IpcEmployeesRepo;
  threadsRepo: IpcThreadsRepo;
  messagesRepo: IpcMessagesRepo;
  orchestrator: IpcOrchestrator;
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

import type { AuthorKind, EmployeeStatus } from '@team-x/shared-types';

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
  // Drop toolCallsJson + parentId — Phase 1 renderer does not consume
  // them. Phase 2's tickets / meeting threading will widen the public
  // ChatMessage shape and the mapper will start forwarding them.
  return {
    id: row.id,
    threadId: row.threadId,
    authorId: row.authorId,
    authorKind: row.authorKind as AuthorKind,
    content: row.content,
    createdAt: row.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createIpcHandlers(deps: IpcHandlerDeps): IpcHandlers {
  const { companiesRepo, employeesRepo, threadsRepo, messagesRepo, orchestrator } = deps;

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
  };
}
