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
 *   Legacy compatibility note: Team-X's historical chat, thread, and
 *   audit rows already use `HUMAN_USER_ID = 'rocky'`. The operator
 *   foundation now backs that durable id with a bootstrapped local
 *   owner operator row so existing history stays attributable while
 *   the product moves toward a proper multi-operator model.
 */

import { createAutonomyHandlers } from './handlers/autonomy.js';
import { createChatHandlers } from './handlers/chat.js';
import { createCompaniesHandlers } from './handlers/companies.js';
import { createHandlerContext } from './handlers/context.js';
import type { IpcHandlers } from './handlers/contract.js';
import type { IpcHandlerDeps } from './handlers/deps.js';
import { createEmployeesHandlers } from './handlers/employees.js';
import { createExtensionsHandlers } from './handlers/extensions.js';
import { createOperatorsCloudHandlers } from './handlers/operators-cloud.js';
import { createPlanningHandlers } from './handlers/planning.js';
import { createProactiveUpdaterHandlers } from './handlers/proactive-updater.js';
import { createProvidersDataHandlers } from './handlers/providers-data.js';
import { createScheduleHandlers } from './handlers/schedule.js';
import { createSettingsHandlers } from './handlers/settings.js';
import { createTicketsHandlers } from './handlers/tickets.js';

export * from './handlers/deps.js';
export type { IpcHandlers } from './handlers/contract.js';

/**
 * Compose the per-context handler modules into the one record
 * `register.ts` wires to `ipcMain.handle`. Each module owns one bounded
 * context (audit 2026-10-07 P1-7); the `IpcHandlers` annotation makes the
 * compiler prove the composition covers every channel.
 */
export function createIpcHandlers(deps: IpcHandlerDeps): IpcHandlers {
  // Delegating handlers resolve their sibling through the composed record,
  // never through a receiver, so destructuring one handler off it is safe.
  // The getter runs only inside handler bodies, after `impl` is initialised.
  const ctx = createHandlerContext(deps, () => impl);
  const impl: IpcHandlers = {
    ...createCompaniesHandlers(ctx),
    ...createOperatorsCloudHandlers(ctx),
    ...createAutonomyHandlers(ctx),
    ...createScheduleHandlers(ctx),
    ...createEmployeesHandlers(ctx),
    ...createChatHandlers(ctx),
    ...createExtensionsHandlers(ctx),
    ...createPlanningHandlers(ctx),
    ...createSettingsHandlers(ctx),
    ...createProvidersDataHandlers(ctx),
    ...createTicketsHandlers(ctx),
    ...createProactiveUpdaterHandlers(ctx),
  };
  return impl;
}
