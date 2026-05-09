/**
 * Trace ID — W3C-format identifier propagated end-to-end across an
 * orchestrator-managed request so logs, runs, and events can be joined
 * for forensic reconstruction.
 *
 * The format matches the W3C Trace Context spec (32 lowercase hex chars,
 * the `trace-id` field of `traceparent`). Keeping the workspace's helper
 * compatible with that spec means future OTel exports can pass the same
 * id through `intelligence/observability/tracing.ts` without translation.
 *
 * Producers (one per logical request — generate ONCE at the entry point):
 *   - `apps/desktop/src/main/orchestrator/run-agent.ts` (default chat)
 *   - `apps/desktop/src/main/services/agentic-loop-service.ts` (M31 loop)
 *   - `apps/desktop/src/main/services/copilot-analyzer-service.ts`
 *   - `apps/desktop/src/main/services/autonomy-benchmark-memory-context.ts`
 *
 * Carriers:
 *   - `runs.start({ traceId })` — `runs.trace_id` column.
 *   - `bus.emit({ traceId })` → `events.trace_id` column.
 *   - `LoopDeps.traceId` → `LoopRun.traceId` echo for orchestrator-side
 *     `runs.finish` correlation.
 *
 * Consumers — Telemetry tab + audit log can JOIN
 *   `runs WHERE trace_id = ?  ⋈  events WHERE trace_id = ?`
 * to render an end-to-end run timeline.
 *
 * Audit 2026-05-07 H4 — End-to-end traceId propagation.
 */

/**
 * 32-char lowercase hex string. Branded so callers cannot pass an
 * arbitrary string where a `TraceId` is expected — `generateTraceId()`
 * is the only way to mint one inside this package, and `parseTraceId()`
 * is the only way to widen one from the wire/DB.
 */
export type TraceId = string & { readonly __brand: 'TraceId' };

/**
 * W3C trace-id regex — 32 lowercase hex chars, NOT all zeros (the spec
 * reserves all-zero as "invalid"). The all-zero check is enforced via a
 * runtime predicate so the regex stays simple.
 */
const TRACE_ID_RE = /^[0-9a-f]{32}$/;
const ALL_ZERO = '0'.repeat(32);

/**
 * Generate a new W3C-format trace ID. Uses `crypto.getRandomValues` when
 * available (Node 19+, Electron, browsers) and falls back to
 * `Math.random()` only when no crypto source is reachable — that fallback
 * is acceptable for our use case (correlation, not authentication) and
 * matches the existing `tracing.ts` idGen behaviour.
 */
export function generateTraceId(): TraceId {
  // Prefer crypto.getRandomValues for entropy. Node's `globalThis.crypto`
  // is provided in Node 19+ and Electron; older runtimes fall through to
  // the Math.random() path below.
  const cryptoSource =
    (typeof globalThis !== 'undefined' &&
      (globalThis as { crypto?: { getRandomValues?: (b: Uint8Array) => Uint8Array } }).crypto) ||
    null;

  let bytes: Uint8Array;
  if (cryptoSource && typeof cryptoSource.getRandomValues === 'function') {
    bytes = new Uint8Array(16);
    cryptoSource.getRandomValues(bytes);
  } else {
    bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  let hex = '';
  for (let i = 0; i < 16; i++) {
    // bytes is a fresh fixed-size Uint8Array; `bytes[i]` is always a number
    // for i in [0, 16). The `?? 0` is defensive against
    // `noUncheckedIndexedAccess` rather than a real runtime concern.
    hex += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  }

  // Vanishingly unlikely, but the W3C spec rejects all-zero IDs — clamp
  // the last byte to a non-zero value if we hit the lottery.
  if (hex === ALL_ZERO) {
    hex = `${hex.slice(0, 31)}1`;
  }

  return hex as TraceId;
}

/** Type guard — true iff `value` is a valid W3C trace-id string. */
export function isTraceId(value: unknown): value is TraceId {
  return typeof value === 'string' && value !== ALL_ZERO && TRACE_ID_RE.test(value);
}

/**
 * Widen a string from the wire / DB into a TraceId. Returns `null` when
 * the input is not a valid trace-id (length wrong, non-hex chars, all
 * zeros). Use this at trust boundaries (IPC inputs, DB row reads) to
 * avoid silently propagating malformed values.
 */
export function parseTraceId(value: unknown): TraceId | null {
  return isTraceId(value) ? value : null;
}
