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

export type { CopilotCategoryWeights } from './events.js';

export * from './ipc/shapes-workspace.js';
export * from './ipc/shapes-work.js';
export * from './ipc/shapes-platform.js';
export * from './ipc/shapes-settings.js';
export * from './ipc/contract-workspace.js';
export * from './ipc/contract-operations.js';
export * from './ipc/contract.js';
export * from './ipc/bridge-workspace.js';
export * from './ipc/bridge-operations.js';
export * from './ipc/bridge.js';
