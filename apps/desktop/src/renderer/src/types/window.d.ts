// Global window.teamx declaration for the Team-X renderer.
//
// This file is a pure TypeScript ambient declaration — no runtime
// code — that augments the DOM Window interface with the
// teamx: TeamXApi property the preload bridge exposes via
// contextBridge.exposeInMainWorld('teamx', ...) in
// apps/desktop/src/preload/index.ts.
//
// Placement in src/renderer/src/types/ rather than at the project
// root means:
//   - it is included by the renderer's tsconfig.renderer.json
//     include glob (src/renderer/src), so the augmentation is picked
//     up automatically by every renderer source file without needing
//     an explicit triple-slash reference directive,
//   - the main process and preload tsconfigs do NOT include this
//     file, so main-process code cannot accidentally reach for
//     window.teamx (which would crash because window is undefined
//     in the main Node runtime),
//   - the React components that are about to land in Milestone 5
//     (dashboard cards, chat drawer, hire dialog) get full
//     autocomplete and type info on window.teamx call sites without
//     having to import anything.
//
// The TeamXApi type itself is defined in the shared-types package
// at packages/shared-types/src/ipc.ts and is the single source of
// truth for the bridge surface. Both the preload (preload/api.ts)
// and this declaration reference it, so a change on either side of
// the bridge is caught when the compiler runs.
//
// Note: this header uses line comments rather than a JSDoc block so
// TypeScript's declaration-file JSDoc parser never tries to parse
// identifiers inside the comment body as tags or keywords.

import type { TeamXApi } from '@team-x/shared-types';

declare global {
  interface Window {
    /**
     * Typed bridge to the main process. Populated by the preload
     * script via `contextBridge.exposeInMainWorld('teamx', api)`.
     *
     * Non-optional because every renderer runs with the preload
     * attached — if `window.teamx` were ever missing at runtime,
     * that would indicate a BrowserWindow was created without a
     * preload script, which is a wiring bug we want to surface
     * loudly (as a `TypeError: Cannot read properties of undefined`)
     * rather than silently type-narrowing to `undefined` at every
     * call site.
     */
    teamx: TeamXApi;
  }
}

// An empty export turns this file into an ES module, which is what
// `declare global` requires to merge with the ambient DOM lib types.
// Without this line, TypeScript would treat the whole file as a
// script and refuse the `declare global` block.
export {};
