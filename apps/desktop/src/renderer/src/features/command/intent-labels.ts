/**
 * Intent display labels — single source of truth for rendering an
 * `IpcIntentName` into human-readable palette/audit copy.
 *
 * Phase 5 — M30 T7.
 *
 * Extracted from `command-palette.tsx`'s inline `INTENT_META` so:
 *   1. The audit-log row renderer can render `command.executed` events
 *      with the same intent copy the palette shows — no drift between
 *      "what I typed" and "what I see in history".
 *   2. The Dashboard "Commands" subview can reuse the same mapping.
 *   3. Future views (command cards on the Floor subview, global search
 *      autocomplete, etc.) inherit the labels for free.
 *
 * Keep this file tiny and Electron-import-free — it's a pure mapping.
 * The palette still owns the `destructive` flag in its own `INTENT_META`
 * because that drives UI color choices specific to the palette modal.
 *
 * If a new intent lands in `IpcIntentName`, TypeScript exhaustiveness
 * in `Record<IpcIntentName, string>` fails the build here. That's the
 * guardrail — do not use a loose `Record<string, string>`.
 */

import type { IpcIntentName } from '@team-x/shared-types';

/**
 * Human-readable label per intent. Destructive intents use explicit
 * verbs ("Fire", "Close", "End", "Promote") so audit-log readers
 * instantly see the gravity of the action.
 */
export const INTENT_LABELS: Record<IpcIntentName, string> = {
  hire_employee: 'Hire Employee',
  fire_employee: 'Fire Employee',
  promote_employee: 'Promote Employee',
  assign_ticket: 'Assign Ticket',
  create_ticket: 'Create Ticket',
  close_ticket: 'Close Ticket',
  reopen_ticket: 'Reopen Ticket',
  create_project: 'Create Project',
  create_goal: 'Create Goal',
  call_meeting: 'Call Meeting',
  end_meeting: 'End Meeting',
  check_status: 'Check Status',
  show_view: 'Show View',
  search_vault: 'Search Vault',
  complex_request: 'Route to Agent',
};

/**
 * Lookup helper. Unknown strings (stale rows, bus payloads from
 * older builds) fall back to the raw string so UI never renders an
 * empty cell.
 */
export function intentLabel(intent: string): string {
  return INTENT_LABELS[intent as IpcIntentName] ?? intent;
}
