/**
 * Errors already reported to the dashboard as a `work.failed` event.
 *
 * The orchestrator reports a turn it refuses before starting (a provider the
 * privacy tier forbids, a missing API key, a disabled provider). Callers that
 * also report failures themselves — chat.send, chat recovery at boot — check
 * here so the user does not see the same refusal twice. A module of its own so
 * the IPC layer can import it without the orchestrator.
 */
const reported = new WeakSet<object>();

/** Record that `err` has been reported. Non-object throwables cannot be tracked. */
export function markWorkFailureReported(err: unknown): void {
  if (typeof err === 'object' && err !== null) reported.add(err);
}

/** True when `err` was already reported to the dashboard as `work.failed`. */
export function isWorkFailureReported(err: unknown): boolean {
  return typeof err === 'object' && err !== null && reported.has(err);
}
