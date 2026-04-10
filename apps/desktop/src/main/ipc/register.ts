/**
 * IPC register — the electron-glue layer for the pure handlers in
 * `./handlers.ts`. Two responsibilities:
 *
 *   1. Mount each handler on `ipcMain.handle` against the channel name
 *      from the shared-types `IpcContract`. The Electron `invoke` /
 *      `handle` pair is the only IPC pattern Team-X uses for
 *      request/response — fire-and-forget signaling goes through the
 *      dashboard event channel below.
 *
 *   2. Subscribe a forwarder to the orchestrator's event bus that
 *      fans every `DashboardEvent` out to every live `BrowserWindow`
 *      via `webContents.send('events.dashboard', evt)`. This is the
 *      one-way push channel the renderer subscribes to via the
 *      preload bridge (T34) so the cockpit can update in real time.
 *
 * Why this file is intentionally tiny:
 *
 *   Everything interesting (request validation, repo coordination,
 *   row → public-shape mapping, fail-closed checks, fire-and-forget
 *   orchestrator wiring) lives in `handlers.ts` where it can be
 *   exhaustively unit-tested without electron. This file is just the
 *   wiring — three `ipcMain.handle` calls and one bus subscription —
 *   so it has zero unit tests by design. Integration coverage lands
 *   in the Playwright smoke test (T49) which boots a real Electron
 *   instance.
 *
 * Lifecycle:
 *
 *   `registerIpcHandlers` returns an `unregister` function that the
 *   main process invokes from `app.will-quit`. The unregister:
 *
 *     - removes every `ipcMain.handle` mapping (so a stray late
 *       invoke from a teardown sequence doesn't hit a ghost handler),
 *     - and detaches the bus subscriber (so the bus does not keep a
 *       dead reference to a `webContents` that has already been
 *       garbage collected).
 *
 *   The forwarder also defends against destroyed windows: a
 *   `webContents.send` on a destroyed `BrowserWindow` throws, and
 *   that throw must NOT cascade into the bus and break delivery to
 *   the rest of the windows. We pre-filter via `isDestroyed()` and
 *   wrap the `send` in try/catch as a belt-and-suspenders measure.
 */

import { BrowserWindow, ipcMain } from 'electron';

import type { EventBus } from '../orchestrator/event-bus.js';
import type { IpcHandlers } from './handlers.js';

/**
 * Channel names — kept as a const tuple so the matching unregister
 * call can iterate them without re-typing the strings (and so a
 * future change to the contract has exactly one source of truth).
 *
 * Mirrors the channel keys in `@team-x/shared-types` `IpcContract`;
 * the typed preload bridge in T34 hands the renderer a wrapper that
 * uses these exact strings.
 */
const REQUEST_CHANNELS = ['employees.list', 'chat.send', 'chat.list'] as const;

/** Channel name for the one-way bus → renderer fan-out. */
const EVENT_CHANNEL = 'events.dashboard';

/**
 * Wire `handlers` into Electron's IPC and start forwarding events
 * from `bus` to every live BrowserWindow. Returns a teardown
 * function — call it from `app.will-quit` to clean up handler
 * mappings and detach the bus subscription.
 */
export function registerIpcHandlers(handlers: IpcHandlers, bus: EventBus): () => void {
  ipcMain.handle('employees.list', async (_event, request: { companyId: string }) => {
    return handlers.employeesList(request);
  });

  ipcMain.handle(
    'chat.send',
    async (_event, request: { threadId: string; employeeId: string; content: string }) => {
      return handlers.chatSend(request);
    },
  );

  ipcMain.handle('chat.list', async (_event, request: { threadId: string }) => {
    return handlers.chatList(request);
  });

  // Bus → renderer forwarder. The bus is synchronous fan-out, so the
  // listener runs on the same tick as the orchestrator's `emit` call —
  // tokens reach the renderer with no extra event-loop hop.
  const unsubscribe = bus.subscribe((event) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      try {
        win.webContents.send(EVENT_CHANNEL, event);
      } catch (err) {
        // A `webContents.send` failure on one window must not break
        // delivery to the others, and must not propagate back into
        // the bus (where the orchestrator would see a thrown listener).
        // Log so the failure is not silent and move on.
        console.error(
          `[ipc/register] failed to forward event ${event.id} (${event.type}) to window ${win.id}:`,
          err,
        );
      }
    }
  });

  return function unregister(): void {
    for (const channel of REQUEST_CHANNELS) {
      ipcMain.removeHandler(channel);
    }
    unsubscribe();
  };
}
