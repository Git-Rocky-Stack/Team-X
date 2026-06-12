import type { TeamXApi } from '@team-x/shared-types';

/**
 * Typed reference to the preload bridge. Every renderer call site
 * uses this rather than reaching for `window.teamx` directly so:
 *   - there is exactly one import to swap if the bridge shape ever
 *     changes (unlikely — shared-types is the contract), and
 *   - test doubles can be injected here without mocking `window`.
 *
 * Resolution is LAZY (a getter Proxy) rather than an eager
 * `window.teamx` read at module-eval time. Eager evaluation made this
 * module — and every module that transitively imports it — unloadable
 * under the `node` Vitest environment (where `window` is undefined),
 * the exact hazard flagged in `types/window.d.ts`. Every call site
 * accesses `ipc.<namespace>.<method>(...)` from inside a callback or
 * effect (never at module top level), so deferring the bridge lookup
 * to first property access is transparent at runtime while letting
 * pure logic that lives beside an `ipc` consumer be unit-tested in the
 * `node` environment without a `window` shim.
 */
export const ipc: TeamXApi = new Proxy({} as TeamXApi, {
  get(_target, prop, receiver) {
    return Reflect.get(window.teamx as object, prop, receiver) as unknown;
  },
}) as TeamXApi;
