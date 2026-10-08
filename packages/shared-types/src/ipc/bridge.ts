/**
 * The high-level `window.teamx` bridge surface the preload exposes.
 * Split from ipc.ts by bounded context (audit 2026-10-07 P1-7).
 */
import type { DashboardEvent } from '../events.js';
import type { TeamXApiOperations } from './bridge-operations.js';
import type { TeamXApiWorkspace } from './bridge-workspace.js';

// ---------------------------------------------------------------------------
// High-level bridge surface — what the renderer sees as `window.teamx`
// ---------------------------------------------------------------------------

/**
 * Type of the callback a renderer passes to `events.onDashboard`. The
 * renderer typically narrows on `event.type` (e.g. `token.delta`) and
 * casts `event.payload` to the matching payload type (see
 * `TokenDeltaPayload`, `WorkStartedPayload`, `WorkCompletedPayload`).
 */
export type DashboardEventListener = (event: DashboardEvent) => void;

/**
 * Returned from `events.onDashboard` — call it to stop receiving
 * events. The renderer hooks this up to its `useEffect` cleanup
 * returns so subscriptions don't outlive the component that made them.
 */
export type UnsubscribeFn = () => void;

/**
 * The full `window.teamx` surface exposed by the preload bridge.
 *
 * Signature philosophy: prefer positional args where there is exactly
 * ONE obvious parameter (`employees.list(companyId)`,
 * `chat.list(threadId)`) and an object literal where more than one
 * field is in play (`chat.send(req)`). This mirrors how the renderer's
 * React hooks consume each method and keeps call sites self-documenting
 * without forcing the caller to remember positional order.
 */
export interface TeamXApi extends TeamXApiWorkspace, TeamXApiOperations {}

/**
 * Sentinel value the renderer passes as `threadId` to
 * `chat.send` to request the user↔employee DM thread be looked up or
 * created on the fly. Exported from shared-types so both the preload
 * and the renderer reference the same string constant.
 */
export const AUTO_THREAD_ID = 'auto';
