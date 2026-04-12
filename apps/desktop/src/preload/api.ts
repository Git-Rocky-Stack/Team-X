/**
 * Preload API factory — pure function that builds the `TeamXApi`
 * surface the renderer consumes as `window.teamx`.
 *
 * The split between this file and `./index.ts` is the same pattern
 * the rest of the codebase uses: pure factories for testable logic,
 * thin electron-bound wrappers for the actual runtime wiring.
 *
 * `./index.ts` is the one line of code that actually touches
 * `contextBridge.exposeInMainWorld`. Everything that maps method
 * signatures to ipc channel names, wraps `ipcRenderer.on` in an
 * unsubscribe pattern, and narrows the request/response shapes lives
 * here and can be unit-tested with a hand-rolled fake that
 * structurally satisfies `IpcRendererLike`.
 *
 * Why `IpcRendererLike` instead of importing `IpcRenderer` from
 * `'electron'`:
 *
 *   The preload runs in a Chromium isolated world with `contextBridge`,
 *   not in Node, so pulling in the full `electron` module at test time
 *   is expensive and requires the Electron ABI binary. Vitest runs in
 *   plain Node. Declaring our own structural subset lets us:
 *     - test the factory with `{ invoke: vi.fn(), on: vi.fn(), ... }`,
 *     - verify channel names and argument shapes pin exactly, and
 *     - keep electron entirely out of the test runner's dependency
 *       graph.
 *
 *   The real `ipcRenderer` object exported from `'electron'`
 *   structurally satisfies `IpcRendererLike` with zero casts, so
 *   `./index.ts` just does `buildTeamXApi(ipcRenderer)`.
 *
 * Method signature philosophy is documented on the `TeamXApi`
 * interface in `@team-x/shared-types` — positional args where there
 * is exactly one, object literals where there are more.
 */

import type {
  AddMcpServerRequest,
  DashboardEvent,
  DashboardEventListener,
  HireEmployeeRequest,
  HireEmployeeResponse,
  McpServerSummary,
  ResolveThreadRequest,
  ResolveThreadResponse,
  SendChatRequest,
  SendChatResponse,
  TeamXApi,
  TestMcpConnectionRequest,
  TestMcpConnectionResponse,
  Thread,
  UnsubscribeFn,
} from '@team-x/shared-types';

/**
 * Minimal structural subset of Electron's `IpcRenderer` that the
 * preload API factory actually uses. Kept intentionally narrow:
 *
 *   - `invoke` for the three request/response channels,
 *   - `on` to attach a dashboard-event listener,
 *   - `removeListener` to detach it inside the unsubscribe function
 *     we hand back to the renderer.
 *
 * The real `ipcRenderer` singleton from `'electron'` has a much
 * wider surface (`send`, `sendSync`, `postMessage`, `once`,
 * `removeAllListeners`, …). None of those are used by the Team-X
 * bridge; omitting them here makes the factory's test doubles
 * trivial to write.
 */
export interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
}

/**
 * Channel name constants. Extracted to their own block so a grep for
 * a channel name hits exactly ONE location and so the main process's
 * register layer in `main/ipc/register.ts` can be diff-matched against
 * this file when the IPC contract changes. Mirrors the keys of
 * `IpcContract` in `@team-x/shared-types/ipc.ts`.
 */
const CHANNELS = {
  companiesList: 'companies.list',
  employeesList: 'employees.list',
  employeesCreate: 'employees.create',
  chatSend: 'chat.send',
  chatList: 'chat.list',
  chatResolveThread: 'chat.resolveThread',
  chatListThreads: 'chat.listThreads',
  eventsDashboard: 'events.dashboard',
  // MCP management (Phase 2 — M10)
  mcpList: 'mcp.list',
  mcpToggle: 'mcp.toggle',
  mcpAddServer: 'mcp.addServer',
  mcpRemoveServer: 'mcp.removeServer',
  mcpTestConnection: 'mcp.testConnection',
} as const;

/**
 * Build the `TeamXApi` object the preload hands to `contextBridge`.
 * Captures the supplied `ipc` handle in a closure so each returned
 * method routes through the same transport.
 */
export function buildTeamXApi(ipc: IpcRendererLike): TeamXApi {
  return {
    companies: {
      list: () => ipc.invoke(CHANNELS.companiesList) as ReturnType<TeamXApi['companies']['list']>,
    },
    employees: {
      list: (companyId: string) =>
        ipc.invoke(CHANNELS.employeesList, { companyId }) as ReturnType<
          TeamXApi['employees']['list']
        >,
      create: (req: HireEmployeeRequest) =>
        ipc.invoke(CHANNELS.employeesCreate, req) as Promise<HireEmployeeResponse>,
    },
    chat: {
      send: (req: SendChatRequest) =>
        ipc.invoke(CHANNELS.chatSend, req) as Promise<SendChatResponse>,
      list: (threadId: string) =>
        ipc.invoke(CHANNELS.chatList, { threadId }) as ReturnType<TeamXApi['chat']['list']>,
      resolveThread: (req: ResolveThreadRequest) =>
        ipc.invoke(CHANNELS.chatResolveThread, req) as Promise<ResolveThreadResponse>,
      listThreads: (companyId: string) =>
        ipc.invoke(CHANNELS.chatListThreads, { companyId }) as Promise<Thread[]>,
    },
    events: {
      onDashboard: (listener: DashboardEventListener): UnsubscribeFn => {
        // Wrap the caller's listener in an ipc-level listener that
        // strips the first `event` argument (IpcRendererEvent) and
        // forwards only the payload the main process actually sent.
        // We have to keep a stable reference to the wrapper so the
        // unsubscribe call can remove THE SAME function — passing a
        // fresh wrapper to `removeListener` would be a no-op.
        const ipcListener = (_e: unknown, payload: unknown) => {
          listener(payload as DashboardEvent);
        };
        ipc.on(CHANNELS.eventsDashboard, ipcListener);
        return () => {
          ipc.removeListener(CHANNELS.eventsDashboard, ipcListener);
        };
      },
    },
    mcp: {
      list: (companyId: string) =>
        ipc.invoke(CHANNELS.mcpList, { companyId }) as Promise<McpServerSummary[]>,
      toggle: (serverId: string, enabled: boolean) =>
        ipc.invoke(CHANNELS.mcpToggle, { serverId, enabled }) as Promise<void>,
      addServer: (req: AddMcpServerRequest) =>
        ipc.invoke(CHANNELS.mcpAddServer, req) as Promise<{ serverId: string }>,
      removeServer: (serverId: string) =>
        ipc.invoke(CHANNELS.mcpRemoveServer, { serverId }) as Promise<void>,
      testConnection: (req: TestMcpConnectionRequest) =>
        ipc.invoke(CHANNELS.mcpTestConnection, req) as Promise<TestMcpConnectionResponse>,
    },
  };
}

/**
 * Channel name constants — exported primarily for tests that want to
 * verify the preload invokes the right strings without string-comparing
 * literals. The main process's register layer has its own copy of the
 * same constants; if either side drifts, the renderer's invoke lands
 * on a ghost handler and the handler's `ipcMain.handle` never fires.
 */
export { CHANNELS as PRELOAD_CHANNELS };
