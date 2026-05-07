/**
 * Transient-failure classification for provider streams.
 *
 * `runAgent` retries the provider call once when the very first fetch
 * fails for reasons that are almost always self-healing — most commonly
 * a stale keepalive socket pulled from undici's HTTP agent pool after
 * the upstream (Ollama's local→cloud proxy in the canonical case) has
 * silently closed it. The retry only fires when:
 *
 *   1. zero chunks have been received yet, AND
 *   2. the underlying error is one of the patterns this module
 *      classifies as transient.
 *
 * The check walks the `cause` chain because undici wraps the real
 * socket-level error inside a `TypeError('fetch failed')` and the
 * Vercel AI SDK then wraps that again. Without walking the chain we'd
 * only ever see the outer TypeError and miss the precise `code`.
 */
const TRANSIENT_NETWORK_CODES = new Set([
  // Node / OS network errors
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENETUNREACH',
  'EAI_AGAIN',
  'EPIPE',
  // undici-specific
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
]);

const FETCH_FAILED_MESSAGE = /^fetch failed$/i;

const MAX_CAUSE_DEPTH = 5;

function isAbortLike(err: unknown): boolean {
  if (err instanceof DOMException) {
    return err.name === 'AbortError';
  }
  if (err instanceof Error) {
    if (err.name === 'AbortError') return true;
    return /aborted|canceled/i.test(err.message);
  }
  return false;
}

/**
 * Returns true when `err` represents a transient network-layer failure
 * that's safe to retry once before any provider output has been seen.
 *
 * Returns false for:
 *   - aborts / cancellations (user-initiated stop)
 *   - HTTP-status errors thrown explicitly by adapters (e.g. "Ollama
 *     returned HTTP 400") — those are not connection-layer flakes
 *   - anything we can't recognise
 *
 * Handles wrapped errors by walking up to {@link MAX_CAUSE_DEPTH} levels
 * of `error.cause`, which is how undici and the Vercel AI SDK surface
 * the real socket error.
 */
export function isTransientFetchFailure(err: unknown): boolean {
  if (err === null || err === undefined) return false;
  if (isAbortLike(err)) return false;

  let current: unknown = err;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (!(current instanceof Error)) break;

    const message = typeof current.message === 'string' ? current.message.trim() : '';
    if (FETCH_FAILED_MESSAGE.test(message)) {
      return true;
    }

    const code = (current as Error & { code?: unknown }).code;
    if (typeof code === 'string' && TRANSIENT_NETWORK_CODES.has(code)) {
      return true;
    }

    const cause = (current as Error & { cause?: unknown }).cause;
    if (cause === current || cause === undefined || cause === null) break;
    current = cause;
  }

  return false;
}

/**
 * User-facing message for a provider call that failed every retry with
 * a transient network error. Phrased as an actionable next step rather
 * than a stack-trace excerpt — this lands in the chat bubble where the
 * assistant reply would have rendered.
 */
export const PROVIDER_CONNECTION_DROPPED_MESSAGE =
  'Provider connection dropped. Please retry, or switch to a different provider in Settings.';

/**
 * Number of attempts (1 initial + 1 retry) `runAgent` makes before
 * declaring a provider call failed. Hardcoded for now; easy to lift
 * into `RunAgentInput` if a future flow needs to override it.
 */
export const MAX_PROVIDER_ATTEMPTS = 2;

/**
 * Backoff between attempts. 200 ms is long enough for undici's keepalive
 * pool to evict the dead socket and short enough that the user does not
 * notice the delay in the streaming-spinner UI.
 */
export const PROVIDER_RETRY_BACKOFF_MS = 200;
