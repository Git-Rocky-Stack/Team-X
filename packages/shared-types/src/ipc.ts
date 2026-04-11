/**
 * IPC contracts between the Team-X Electron main process and the
 * renderer. Two layers:
 *
 *   1. `IpcContract` — the low-level request/response shapes keyed
 *      by channel name. Used by the typed `ipcMain.handle` registration
 *      in `apps/desktop/src/main/ipc/register.ts` and by the generic
 *      helper types that derive per-channel argument and return types.
 *
 *   2. `TeamXApi` — the high-level bridge surface the preload exposes
 *      to the renderer via `contextBridge.exposeInMainWorld('teamx', ...)`.
 *      This is the shape the renderer consumes as `window.teamx`. It
 *      mirrors `IpcContract` but:
 *        - wraps each channel in an ergonomic method signature
 *          (positional args where it makes sense, single-object args
 *          where it doesn't),
 *        - adds a one-way event subscription (`events.onDashboard`)
 *          for the live dashboard stream,
 *        - returns an unsubscribe function from `onDashboard` so the
 *          renderer can clean up listeners on unmount.
 *
 * Keeping both layers here — in `@team-x/shared-types` — means:
 *   - preload can type-check its implementation against `TeamXApi`
 *     without cross-app imports,
 *   - the renderer's `window.d.ts` can import the same `TeamXApi`
 *     via the workspace package without reaching across rootDir
 *     boundaries into `apps/desktop/src/preload/`,
 *   - any change to a request or response shape lands in exactly one
 *     place and both sides of the bridge catch the diff at typecheck
 *     time.
 */

import type { ChatMessage, Company, Employee } from './entities.js';
import type { DashboardEvent } from './events.js';

// ---------------------------------------------------------------------------
// Low-level request / response shapes
// ---------------------------------------------------------------------------

export interface ListEmployeesRequest {
  companyId: string;
}

export interface SendChatRequest {
  /**
   * Either a real thread id, or the literal sentinel
   * `AUTO_THREAD_ID` (`'auto'`) to look up or create the user↔employee
   * direct-message thread on the fly. The renderer's chat drawer uses
   * `'auto'` on the very first message and switches to the resolved id
   * after that.
   */
  threadId: string;
  employeeId: string;
  content: string;
}

/**
 * Response to a successful `chat.send`. Carries both the resolved
 * thread id (useful when the caller passed `AUTO_THREAD_ID` and needs
 * to know which thread their message landed in) and the row id of the
 * user's just-appended message. The assistant's reply is NOT in this
 * shape — it streams back asynchronously via the `events.dashboard`
 * channel as `work.started` → `token.delta`* → `work.completed` events.
 */
export interface SendChatResponse {
  threadId: string;
  messageId: string;
}

export interface HireEmployeeRequest {
  companyId: string;
  roleId: string;
  name: string;
}

export interface HireEmployeeResponse {
  employeeId: string;
}

export interface ListChatRequest {
  threadId: string;
}

/**
 * Request to resolve (or lazily create) the user↔employee DM thread
 * for a given employee.  The renderer's chat drawer calls this on
 * open so it can render the existing conversation history BEFORE the
 * user has sent a new message — the previous design only resolved the
 * thread id inside `chat.send`, which left a post-reload drawer with
 * no way to know which thread to fetch.
 */
export interface ResolveThreadRequest {
  employeeId: string;
}

/**
 * Response from `chat.resolveThread`.  Always returns a valid
 * `threadId`: the existing DM thread if one already exists for the
 * (user, employee) pair, otherwise a freshly created empty one.
 */
export interface ResolveThreadResponse {
  threadId: string;
}

// ---------------------------------------------------------------------------
// Low-level channel map (used by ipcMain.handle and its generic helpers)
// ---------------------------------------------------------------------------

export interface IpcContract {
  'companies.list': {
    request: Record<string, never>;
    response: Company[];
  };
  'employees.list': {
    request: ListEmployeesRequest;
    response: Employee[];
  };
  'employees.create': {
    request: HireEmployeeRequest;
    response: HireEmployeeResponse;
  };
  'chat.send': {
    request: SendChatRequest;
    response: SendChatResponse;
  };
  'chat.list': {
    request: ListChatRequest;
    response: ChatMessage[];
  };
  'chat.resolveThread': {
    request: ResolveThreadRequest;
    response: ResolveThreadResponse;
  };
}

export type IpcChannel = keyof IpcContract;
export type EventChannel = 'events.dashboard';

// ---------------------------------------------------------------------------
// High-level bridge surface — what the renderer sees as `window.teamx`
// ---------------------------------------------------------------------------

/**
 * Type of the callback a renderer passes to `events.onDashboard`. The
 * renderer typically narrows on `event.type` (e.g. `token.delta`) and
 * casts `event.payload` to the matching payload type (see
 * `TokenDeltaPayload`, `WorkStartedPayload`, `WorkCompletedPayload`).
 */
export type DashboardEventListener = (event: DashboardEvent) => void;

/**
 * Returned from `events.onDashboard` — call it to stop receiving
 * events. The renderer hooks this up to its `useEffect` cleanup
 * returns so subscriptions don't outlive the component that made them.
 */
export type UnsubscribeFn = () => void;

/**
 * The full `window.teamx` surface exposed by the preload bridge.
 *
 * Signature philosophy: prefer positional args where there is exactly
 * ONE obvious parameter (`employees.list(companyId)`,
 * `chat.list(threadId)`) and an object literal where more than one
 * field is in play (`chat.send(req)`). This mirrors how the renderer's
 * React hooks consume each method and keeps call sites self-documenting
 * without forcing the caller to remember positional order.
 */
export interface TeamXApi {
  companies: {
    /** Return every company. Phase 1 always returns exactly one. */
    list(): Promise<Company[]>;
  };
  employees: {
    /** Return every employee in the given company, mapped to the public Employee shape. */
    list(companyId: string): Promise<Employee[]>;

    /**
     * Create a new employee for the given company from a role-pack role.
     * The main process resolves the role spec from the role-loader,
     * fills in level/title/sha/tools, and inserts the row.
     */
    create(req: HireEmployeeRequest): Promise<HireEmployeeResponse>;
  };
  chat: {
    /**
     * Append the user's message to a thread and enqueue an assistant
     * turn. Returns as soon as the user message is persisted — the
     * reply streams in via `events.onDashboard` token-delta events.
     *
     * Pass `threadId: 'auto'` to resolve the user↔employee DM thread
     * (creating it on first send). The response echoes the actually-
     * resolved thread id so the renderer can cache it for subsequent
     * sends in the same drawer session.
     */
    send(req: SendChatRequest): Promise<SendChatResponse>;

    /** Return every message in a thread, oldest-first, mapped to ChatMessage shape. */
    list(threadId: string): Promise<ChatMessage[]>;

    /**
     * Resolve (or lazily create) the user↔employee DM thread for the
     * given employee.  The drawer calls this on open so it can fetch
     * the existing chat history before the user sends anything — a
     * post-reload drawer has no cached thread id, and without this
     * call the only way to rehydrate was to send a new message.
     */
    resolveThread(req: ResolveThreadRequest): Promise<ResolveThreadResponse>;
  };
  events: {
    /**
     * Subscribe to the live dashboard event stream. The callback runs
     * for every event emitted by the orchestrator's event bus in the
     * main process — token deltas, work lifecycle, employee status
     * changes. Returns an unsubscribe function that MUST be called
     * when the subscriber is no longer interested (e.g. React
     * `useEffect` cleanup) so dead listeners don't accumulate.
     */
    onDashboard(listener: DashboardEventListener): UnsubscribeFn;
  };
}

/**
 * Sentinel value the renderer passes as `threadId` to
 * `chat.send` to request the user↔employee DM thread be looked up or
 * created on the fly. Exported from shared-types so both the preload
 * and the renderer reference the same string constant.
 */
export const AUTO_THREAD_ID = 'auto';
