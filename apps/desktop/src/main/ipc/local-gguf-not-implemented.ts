/**
 * Shared thrower for Phase 1 localGguf IPC stubs.
 *
 * Every localGguf.* channel is registered in Phase 1 so the contract surface
 * exists, but the real logic lands in a later phase. Until then the handler
 * throws this — callers fail fast with a clear, greppable message instead of
 * silently receiving undefined. Returns `never`, so it satisfies any
 * handler's annotated return type.
 */
export function notImplemented(channel: string): never {
  throw new Error(`localGguf channel "${channel}" is not implemented yet (Phase 1 stub)`);
}
