/**
 * command.* IPC handlers — thin adapter from the 4 renderer-facing
 * channels onto `CommandService.parse/execute/history/suggest`.
 *
 * Phase 5 — M30 T5.
 *
 * Kept in a separate module (sibling to `rag-handlers.ts`) rather than
 * folded into the monolithic `handlers.ts` because CommandService has
 * its own composition-root seam: it is built from the classifier,
 * resolver, slot-filler, history repo, bus, and the `IpcHandlers`
 * record itself (it reaches back into other handlers to dispatch
 * resolved intents). Putting this wiring next to `rag-handlers.ts`
 * mirrors the M29 split and avoids a cycle between the palette
 * service and the handler factory.
 *
 * The factory is pure — it takes a `CommandService` dependency and
 * returns a record of async functions. Unit-tested against a
 * hand-rolled fake in `command-handlers.test.ts`. The Electron wiring
 * that maps these functions onto `ipcMain.handle` lives in
 * `main/index.ts` alongside the other sibling registration blocks so
 * the `commandServiceInstance` handle is visible at a single point in
 * the boot graph.
 *
 * Architectural invariants honored:
 *   #1 Renderer is pure view — this module lives in main.
 *   #7 Zero phone-home — every call stays on the local IPC bus; the
 *      classifier may hit a configured LLM provider but that is
 *      user-configured (invariant #5), never implicit.
 */

import type { IntentName } from '@team-x/intelligence';
import type {
  AgenticRunSnapshot,
  CommandHistoryRequest,
  CommandParseRequest,
  CommandStopRequest,
  CommandStopResult,
  CommandSuggestRequest,
  IpcCommandHistoryEntry,
  IpcExecuteRequest,
  IpcExecuteResult,
  IpcIntentName,
  IpcParseResult,
  IpcSuggestItem,
} from '@team-x/shared-types';


import type { AgenticLoopService } from '../services/agentic-loop-service.js';
import type { CommandService } from '../services/command-service.js';

// ---------------------------------------------------------------------------
// IntentName ≡ IpcIntentName — compile-time equality guard.
//
// The intelligence package owns the runtime `INTENT_NAMES` tuple; the
// shared-types package owns the `IpcIntentName` union the renderer
// sees. These MUST stay in lock-step, otherwise `IpcExecuteRequest`
// may arrive at `CommandService.execute` with an intent the service
// does not know, or vice versa the renderer may render an intent
// value the shared-types union rejects.
//
// We enforce bidirectional assignability with the standard
// `Expect<Equal<...>>` pattern. If either side grows or shrinks a
// value, `tsc --build` fails on this line and the diff message points
// at the drift location. This is cheaper than a runtime schema check
// and has zero emit cost.
// ---------------------------------------------------------------------------

type Expect<T extends true> = T;
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
  ? true
  : false;

// Exported so TypeScript keeps the symbol around (an unused local
// `type` declaration fails `noUnusedLocals`). Consumers should not
// import it — the name encodes its single job, which is to fail
// compilation if `IntentName` and `IpcIntentName` ever drift out of
// lock-step. Both directions of assignability are intentionally
// checked so a one-sided superset (e.g. shared-types gains a value
// intelligence doesn't) is caught, not just exact-match.
export type _IntentNameEqualsIpcIntentName = Expect<Equal<IntentName, IpcIntentName>>;

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export interface CommandHandlersDeps {
  /**
   * The fully-constructed command service — built in `main/index.ts`'s
   * composition root after the classifier, resolver, slot filler,
   * history repo, and handler dispatch map are all in scope.
   */
  commandService: CommandService;
  /**
   * Agentic-loop service handle (Phase 5 — M31 T6). Backs `command.stop`
   * so the palette can cancel an in-flight `complex_request` run.
   * `CommandService.execute` still owns the start path (via its own
   * dep injection in T4); this surface exists only for the cancel
   * side, which has no natural home on `CommandService` because it
   * is run-id-keyed rather than intent-keyed.
   */
  agenticLoopService: AgenticLoopService;
  /**
   * Logger for non-throwing failures inside `command.stop`. Defaults
   * to `console` when omitted. Matches the logger shape used by
   * sibling services so tests can capture structured diagnostics.
   */
  logger?: {
    error: (msg: string, err: unknown) => void;
  };
}

/**
 * Channel-keyed map of the five async handlers the register layer
 * mounts on `ipcMain.handle`. Keys mirror `IpcContract` channel
 * strings exactly so a typo becomes a type error.
 */
export interface CommandHandlers {
  'command.parse'(req: CommandParseRequest): Promise<IpcParseResult>;
  'command.execute'(req: IpcExecuteRequest): Promise<IpcExecuteResult>;
  'command.history'(req: CommandHistoryRequest): Promise<IpcCommandHistoryEntry[]>;
  'command.suggest'(req: CommandSuggestRequest): Promise<IpcSuggestItem[]>;
  'command.stop'(req: CommandStopRequest): Promise<CommandStopResult>;
  'command.getRunSnapshot'(req: { runId: string }): Promise<AgenticRunSnapshot | null>;
}

export function buildCommandHandlers(deps: CommandHandlersDeps): CommandHandlers {
  const { commandService, agenticLoopService, logger = console } = deps;

  return {
    /**
     * `command.parse` — classify + resolve + slot-fill.
     *
     * Forwards `currentView` and `recentIntents` only when defined so
     * the `NluContext` handed to the classifier stays minimal for the
     * common case. Defaults are the classifier's responsibility, not
     * the handler's.
     */
    async 'command.parse'(req: CommandParseRequest): Promise<IpcParseResult> {
      const context = {
        companyId: req.companyId,
        ...(req.currentView !== undefined ? { currentView: req.currentView } : {}),
        ...(req.recentIntents !== undefined ? { recentIntents: req.recentIntents } : {}),
      };
      return commandService.parse(req.text, context);
    },

    /**
     * `command.execute` — dispatch a validated intent + entity bag to
     * the underlying IPC handler chain.
     *
     * The service is the sole authority for the destructive-intent
     * confirmation gate (CommandService §Gate 2). We deliberately
     * forward `req.confirmed` verbatim rather than defaulting it to
     * `true` — the handler contract is "the caller proves it
     * confirmed"; masking that would bypass the gate.
     */
    async 'command.execute'(req: IpcExecuteRequest): Promise<IpcExecuteResult> {
      // IpcExecuteRequest and the desktop-side ExecuteRequest share the
      // same structural shape (the IntentName equality guard above
      // asserts the intent union lines up exactly). Forwarding as-is
      // is therefore type-safe and avoids a pointless object clone.
      return commandService.execute(req);
    },

    /**
     * `command.history` — newest-first page.
     *
     * Defaults left entirely to the service (it has the per-company
     * FIFO cap constant and the `defaultCompanyId` fallback). The
     * renderer is allowed to call with `{}` — the preload bridge
     * explicitly supports that by defaulting `req` to an empty object.
     */
    async 'command.history'(req: CommandHistoryRequest): Promise<IpcCommandHistoryEntry[]> {
      return commandService.history(req.limit, req.companyId);
    },

    /**
     * `command.suggest` — prefix-matched static palette suggestions.
     *
     * Same NluContext-assembly pattern as `parse`: forward only the
     * fields the caller provided so the downstream classifier / RAG
     * picker sees exactly what the user meant.
     */
    async 'command.suggest'(req: CommandSuggestRequest): Promise<IpcSuggestItem[]> {
      const context = {
        companyId: req.companyId,
        ...(req.currentView !== undefined ? { currentView: req.currentView } : {}),
      };
      return commandService.suggest(req.partial, context);
    },

    /**
     * `command.stop` — cancel an in-flight agentic-loop run.
     *
     * Idempotent by design: the underlying `AgenticLoopService.stop()`
     * is a no-op when the `runId` is unknown or already in a terminal
     * state. We still probe `getRun()` first so the response can
     * accurately report whether a live run was actually cancelled,
     * which the palette uses for its "Stop" button telemetry.
     *
     * The authoritative "run has ended" signal is the `agentic.failed`
     * (status=`canceled`) event on `events.dashboard` — the palette
     * step-log mode subscribes to that, not to this return value, to
     * flip out of the running state. Returning synchronously here
     * avoids the renderer having to await the abort propagation
     * through the provider / tool stack, which can be non-trivial.
     *
     * Failures inside `stop()` (vanishingly rare — the service path
     * is sync aside from the abort signal) are logged and swallowed;
     * we do NOT propagate them back to the renderer because the
     * user's intent has already been captured by raising the abort
     * signal on the underlying run, if there was one.
     */
    async 'command.stop'(req: CommandStopRequest): Promise<CommandStopResult> {
      try {
        const run = agenticLoopService.getRun(req.runId);
        const stoppable = run !== null && run.status === 'running';
        if (stoppable) {
          agenticLoopService.stop(req.runId);
        }
        return { stopped: stoppable };
      } catch (err) {
        logger.error(`[command.stop] failed to stop run ${req.runId}`, err);
        return { stopped: false };
      }
    },

    /**
     * `command.getRunSnapshot` — backfill on mount for the palette
     * step-log (Phase 5 — M32 T0 / F1).
     *
     * Thin pass-through to `AgenticLoopService.getRunSnapshot`. Returns
     * `null` for unknown or evicted runs — the renderer hook treats
     * that as "no backfill available" and relies purely on the live
     * bus stream. Pure read; no side-effects, no mutation. Safe to
     * call repeatedly.
     */
    async 'command.getRunSnapshot'(req: {
      runId: string;
    }): Promise<AgenticRunSnapshot | null> {
      return agenticLoopService.getRunSnapshot(req.runId);
    },
  };
}
