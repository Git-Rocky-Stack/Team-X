/**
 * Preload script — runs in Chromium's isolated world before the
 * renderer executes, with `contextIsolation: true` and
 * `nodeIntegration: false` (both enforced in `main/index.ts`'s
 * `BrowserWindow.webPreferences`).
 *
 * Responsibilities — exactly two, to honor CLAUDE.md's architectural
 * invariant #1 ("Renderer is a pure view"):
 *
 *   1. Build the `TeamXApi` surface via `buildTeamXApi(ipcRenderer)`.
 *      All the channel-name / argument-shape / unsubscribe logic lives
 *      in `./api.ts` where it is unit-testable without electron.
 *
 *   2. Hand the built API to `contextBridge.exposeInMainWorld('teamx',
 *      api)` so the renderer can reach it as `window.teamx`. The
 *      context bridge is Electron's trusted serialization boundary —
 *      only cloneable values and exposed functions cross it, which is
 *      exactly what we want (no raw `ipcRenderer`, no Node globals,
 *      no filesystem access leaking into the renderer's JS world).
 *
 * This file is deliberately as small as possible. Anything that
 * belongs in a unit test belongs in `./api.ts`; anything that needs
 * the real electron runtime belongs here. No business logic, no
 * channel string literals, no request shape normalization — all of
 * that is handled by the factory.
 *
 * The renderer consumes this API via the `window.teamx` declaration
 * in `apps/desktop/src/renderer/src/types/window.d.ts`, which
 * declares `interface Window { teamx: TeamXApi }` so TypeScript can
 * type-check every call site against the same `@team-x/shared-types`
 * contract the main process's IPC handler layer implements.
 */

import { contextBridge, ipcRenderer } from 'electron';

import { buildTeamXApi } from './api.js';

// `ipcRenderer` from 'electron' structurally satisfies `IpcRendererLike`
// (it has `invoke`, `on`, and `removeListener` with compatible signatures),
// so the factory call type-checks with zero casts.
const api = buildTeamXApi(ipcRenderer);

contextBridge.exposeInMainWorld('teamx', api);
