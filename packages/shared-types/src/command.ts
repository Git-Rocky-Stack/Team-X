/**
 * Command palette IPC contracts (Phase 5 — M30 T5).
 *
 * These types mirror the structural shapes exposed by `CommandService`
 * in `apps/desktop/src/main/services/command-service.ts`. The desktop
 * service is the source of truth for the runtime behaviour; this file
 * is the source of truth for the `command.*` IPC channel payloads so
 * the renderer and the preload can type-check against a single
 * workspace-root contract without pulling a desktop-side dependency
 * into `@team-x/shared-types`.
 *
 * Why duplicate the shapes here instead of re-exporting from
 * `@team-x/intelligence` or `apps/desktop`:
 *
 *   - `@team-x/shared-types` is a leaf package with no workspace deps
 *     other than zod at runtime and TypeScript at build time. Pulling
 *     in `@team-x/intelligence` would add a dep edge from a leaf onto
 *     a package that already imports shared-types (`DashboardEvent`,
 *     etc.), closing a cycle.
 *   - The renderer must not see `apps/desktop` types — it communicates
 *     with main exclusively through `@team-x/shared-types`.
 *   - A parallel, hand-mirrored shape pinned by a compile-time
 *     `Expect<Equal<...>>` check in the desktop package guarantees the
 *     two never drift silently.
 *
 * The `IpcIntentName` union MUST stay in lock-step with
 * `IntentName` in `@team-x/intelligence`. The desktop package's
 * `command-handlers.ts` enforces this with a type-level equality
 * check: if `INTENT_NAMES` in intelligence grows a value,
 * `tsc --build` in the desktop app fails until this union is updated.
 */

/**
 * The canonical set of intent names the NLU engine can classify.
 *
 * Copy of `INTENT_NAMES` in `@team-x/intelligence/nlu/intent-classifier`.
 * Update both in the same commit — the type-equality check in
 * `apps/desktop/src/main/ipc/command-handlers.ts` makes drift a build
 * failure.
 */
export type IpcIntentName =
  | 'hire_employee'
  | 'fire_employee'
  | 'assign_ticket'
  | 'create_ticket'
  | 'close_ticket'
  | 'promote_employee'
  | 'create_project'
  | 'create_goal'
  | 'call_meeting'
  | 'end_meeting'
  | 'check_status'
  | 'show_view'
  | 'search_vault'
  | 'complex_request'
  | 'reopen_ticket';

/**
 * A classifier/slot-filler pipeline snapshot the renderer can stash in
 * its `PendingPalette` state so a second call (user picked a clarifier
 * option, or confirmed a destructive prompt) can round-trip back with
 * the original text + entities.
 */
export interface IpcPendingParse {
  intent: IpcIntentName;
  /** Partial entity map — may be empty for clarification pending a pick. */
  entities: Record<string, string>;
  rawText: string;
  /** ISO-8601 UTC timestamp of the classify-then-fill pipeline run. */
  classifiedAt: string;
}

/**
 * Result of `command.parse`. A discriminated union so the renderer
 * `switch (result.kind)` stays exhaustive and gets narrowed types for
 * the ready/clarification/confirmation branches.
 *
 *   - `'ready'` — fire-and-forget: pass the intent + entities straight
 *     to `command.execute` with no further prompting.
 *   - `'needs_clarification'` — surface the prompt + optional pick list
 *     to the user, gather their choice, then call `command.parse`
 *     again with the augmented text (or `command.execute` directly if
 *     the UI has assembled the full entity map).
 *   - `'needs_confirmation'` — destructive intent detected; show the
 *     `summary` in a confirm dialog, then call `command.execute` with
 *     `confirmed: true`.
 */
export type IpcParseResult =
  | {
      kind: 'ready';
      intent: IpcIntentName;
      entities: Record<string, string>;
      summary?: string;
    }
  | {
      kind: 'needs_clarification';
      missing: string;
      prompt: string;
      options?: string[];
      pending: IpcPendingParse;
    }
  | {
      kind: 'needs_confirmation';
      intent: IpcIntentName;
      entities: Record<string, string>;
      summary: string;
      pending: IpcPendingParse;
    };

/**
 * Request payload for `command.execute`.
 *
 * `confirmed` is REQUIRED-TRUE for destructive intents
 * (`fire_employee`, `close_ticket`, `end_meeting`, `promote_employee`).
 * Omitting it or passing `false` for a destructive intent returns
 * `{ kind: 'needs_confirmation', summary }` without dispatching — the
 * renderer must display the confirm prompt and re-invoke with
 * `confirmed: true`.
 */
export interface IpcExecuteRequest {
  intent: IpcIntentName;
  entities: Record<string, string>;
  /** Required-true for destructive intents. Ignored for non-destructive intents. */
  confirmed?: boolean;
  companyId: string;
  /** Defaults to 'user' in the service. */
  actorId?: string;
  /** Original user text — optional but preserved in history for replay/audit. */
  rawText?: string;
}

/**
 * Response from `command.execute`.
 *
 *   - `'ok'` — handler completed. `resultId` is the new row id when
 *     the intent creates a resource (ticket, project, goal, meeting,
 *     employee); undefined for pure-action intents (assign, close,
 *     reopen, fire, end, promote) and pure-read intents (check_status,
 *     show_view, search_vault).
 *   - `'needs_confirmation'` — destructive-intent gate: the caller
 *     passed no `confirmed: true` for a fire/close/end/promote intent.
 *     The renderer renders `summary` in a confirm dialog.
 *   - `'error'` — typed failure. `code` is one of four enumerated
 *     values so the UI can branch without string-matching.
 */
export type IpcExecuteResult =
  | {
      kind: 'ok';
      intent: IpcIntentName;
      resultId?: string | number;
      summary: string;
      /**
       * Agentic-loop run id for the `complex_request` intent (M31 T4).
       *
       * Populated only when the underlying dispatch started an agentic
       * loop via `AgenticLoopService.start()`. Other intents leave
       * this undefined. Paired with `threadId` so the palette can
       * subscribe to live `agent.step` events and the thread view can
       * open directly to the Copilot conversation on completion.
       */
      runId?: string;
      /**
       * System-agent DM thread id for the `complex_request` intent
       * (M31 T4). Undefined for every other intent. See `runId`.
       */
      threadId?: string;
    }
  | { kind: 'needs_confirmation'; summary: string }
  | {
      kind: 'error';
      code: 'missing_entity' | 'destructive_not_confirmed' | 'handler_error' | 'unknown_intent';
      message: string;
    };

/**
 * A single row the renderer surfaces in the command-history list.
 * Mirrors the desktop `CommandHistoryEntry` shape — keys are identical.
 */
export interface IpcCommandHistoryEntry {
  id: string;
  text: string;
  intent: IpcIntentName;
  entities: Record<string, string>;
  executedAt: string;
  outcome: 'ok' | 'error';
  resultId?: string | number;
  companyId: string;
  actorId: string;
}

/**
 * A single suggestion row the palette renders under the input when
 * the user hasn't pressed Enter yet.
 */
export interface IpcSuggestItem {
  text: string;
  intent?: IpcIntentName;
}

/**
 * Request shape for `command.parse`. `currentView` + `recentIntents`
 * are the optional NLU-context fields the classifier uses to bias
 * prediction; palette UI should pass `currentView` so e.g. "close
 * this" can disambiguate to "close ticket" when the ticket detail
 * view is active.
 */
export interface CommandParseRequest {
  text: string;
  companyId: string;
  currentView?: string;
  recentIntents?: IpcIntentName[];
}

/**
 * Request shape for `command.history`. Both fields optional — main
 * process defaults `limit` to 20 (the per-company FIFO cap) and
 * `companyId` to the active company id when absent.
 */
export interface CommandHistoryRequest {
  limit?: number;
  companyId?: string;
}

/**
 * Request shape for `command.suggest`. Unlike `parse`, the partial
 * input is matched against a static (M30) suggestion table on the
 * main-process side — no LLM call happens here.
 */
export interface CommandSuggestRequest {
  partial: string;
  companyId: string;
  currentView?: string;
}
