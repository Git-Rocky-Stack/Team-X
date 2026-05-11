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

// Bump `ipcRenderer`'s per-emitter listener cap above Node's default of 10.
//
// The renderer architecture deliberately splits cross-process cache
// invalidation across many narrowly-scoped React hooks — `useTicketEventSync`,
// `useMeetingEventSync`, `useProjectEventSync`, `useGoalEventSync`,
// `useEmployeeEventSync`, `useCompanyEventSync`, `useScheduleEventSync`,
// `useVaultEventSync`, `useArtifactEventSync`, `useOrgChartEventSync`,
// `useChatEventSync`, `useCopilot`, `useDashboardEvents`, plus the
// `mission-control-dashboard`, `board-message-queue`, `proactive-controls`,
// and `use-agent-step-stream` components — and each independently subscribes
// to `events.dashboard` via `ipc.events.onDashboard`. This many-subscribers
// pattern is enforced as the correct architecture by the cross-hook contract
// in `apps/desktop/src/renderer/src/hooks/event-sync-hooks.test.ts`
// (Invariant #11: every feature's cache invalidation runs in its own
// dedicated effect with a `[companyId, qc]` dep array).
//
// Every subscriber correctly returns its `unsubscribe` from `useEffect`,
// and `events.onDashboard` in `./api.ts` holds a stable wrapper ref so
// `ipc.removeListener` actually detaches the same function — so this is
// legitimate fan-out, not a leak.
//
// 50 gives ~3x headroom over today's ~17 subscription sites for future
// event-sync hooks while keeping the leak-detector active for accidental
// runaway accumulation. Bump (with a comment cite) if a new feature pushes
// the count past ~40; replace with a renderer-side fan-out bus if it gets
// any wider than that.
ipcRenderer.setMaxListeners(50);

// `ipcRenderer` from 'electron' structurally satisfies `IpcRendererLike`
// (it has `invoke`, `on`, and `removeListener` with compatible signatures),
// so the factory call type-checks with zero casts.
const api = buildTeamXApi(ipcRenderer);

contextBridge.exposeInMainWorld('teamx', api);
