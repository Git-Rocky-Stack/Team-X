/**
 * Typed reference to the preload bridge. Every renderer call site
 * uses this rather than reaching for `window.teamx` directly so:
 *   - there is exactly one import to swap if the bridge shape ever
 *     changes (unlikely — shared-types is the contract), and
 *   - test doubles can be injected here without mocking `window`.
 */
export const ipc = window.teamx;
