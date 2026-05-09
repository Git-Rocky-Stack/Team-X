/**
 * Transient-failure classification for provider streams.
 *
 * `runAgent` retries the provider call when the very first fetch fails
 * for reasons that are almost always self-healing. Two error families
 * qualify as transient:
 *
 *   1. **Network-layer flakes** — undici / Node socket errors
 *      (ECONNRESET, ETIMEDOUT, UND_ERR_SOCKET, etc.). Most commonly a
 *      stale keepalive socket pulled from undici's HTTP agent pool after
 *      the upstream silently closed it. Backoff is short (200 ms) — the
 *      issue is local-pool, not upstream.
 *   2. **HTTP 429 rate-limit responses** — H5 (audit 2026-05-07). Backoff
 *      honors `Retry-After` when present, otherwise uses exponential
 *      backoff capped at 30 s. Critically different from network flakes:
 *      retrying immediately is counter-productive; we MUST wait. The
 *      audit's complaint was that 429 responses were not retried at all,
 *      so a brief rate-limit cascade would surface to the user as a
 *      hard failure on the first request that hit the limit.
 *
 * The retry only fires when:
 *   1. zero chunks have been received yet, AND
 *   2. the underlying error is one of the patterns this module
 *      classifies as transient, AND
 *   3. the user has not aborted, AND
 *   4. we have not hit `MAX_PROVIDER_ATTEMPTS`.
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

// ---------------------------------------------------------------------------
// HTTP 429 — H5 (audit 2026-05-07)
// ---------------------------------------------------------------------------

/**
 * Patterns that surface on adapter-thrown errors when the upstream
 * returned HTTP 429. The Vercel AI SDK propagates these as either:
 *   - an `APICallError` with `statusCode: 429`, or
 *   - an `Error` whose message embeds the status (`"HTTP 429"`,
 *     `"Rate limit"`, etc.) — the path our local adapter throws take.
 *
 * Order is irrelevant — these are anchored as boolean OR.
 */
const HTTP_429_MESSAGE_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bhttp\s*429\b/i,
  /\b429\s*[:-]/,
  /\b429\s+too many requests\b/i,
  /\brate[\s_-]?limit(?:ed|ing)?\b/i,
  /\btoo many requests\b/i,
]);

/**
 * Returns true when `err` (or any error in its cause chain) signals an
 * HTTP 429 response. Probes both numeric `status` / `statusCode`
 * properties (Anthropic / OpenAI SDKs surface 429 this way) AND
 * message text (adapter-thrown errors). Walking the cause chain is
 * essential because the Vercel AI SDK wraps the underlying provider
 * error inside its own `AI_APICallError`, and the SDK in turn wraps
 * inside `streamText` rejections.
 */
export function isHttp429Error(err: unknown): boolean {
  if (err === null || err === undefined) return false;

  let current: unknown = err;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (!(current instanceof Error)) break;

    const obj = current as Error & { status?: unknown; statusCode?: unknown };
    if (obj.status === 429 || obj.statusCode === 429) {
      return true;
    }

    const message = typeof current.message === 'string' ? current.message : '';
    for (const pattern of HTTP_429_MESSAGE_PATTERNS) {
      if (pattern.test(message)) return true;
    }

    const cause = (current as Error & { cause?: unknown }).cause;
    if (cause === current || cause === undefined || cause === null) break;
    current = cause;
  }

  return false;
}

/**
 * Walk the cause chain looking for a `Retry-After` value on either the
 * error itself, its `headers` map, or its `responseHeaders` map.
 * Supports the two RFC-7231 wire formats:
 *
 *   - **Delta-seconds** (`Retry-After: 60`) — most common for 429s.
 *   - **HTTP-date** (`Retry-After: Wed, 21 Oct 2026 07:28:00 GMT`).
 *
 * Returns the wait duration in milliseconds, clamped to ≥ 0. Returns
 * `null` when no parseable `Retry-After` is found — callers should
 * fall back to exponential backoff in that case.
 */
export function extractRetryAfterMs(err: unknown, nowMs?: number): number | null {
  if (err === null || err === undefined) return null;

  const now = nowMs ?? Date.now();
  let current: unknown = err;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (current === null || (typeof current !== 'object' && !(current instanceof Error))) {
      break;
    }

    const value = pickRetryAfterValue(current as Record<string, unknown>);
    if (value !== null) {
      const parsed = parseRetryAfterValue(value, now);
      if (parsed !== null) return parsed;
    }

    if (current instanceof Error) {
      const cause = (current as Error & { cause?: unknown }).cause;
      if (cause === current || cause === undefined || cause === null) break;
      current = cause;
    } else {
      break;
    }
  }

  return null;
}

function pickRetryAfterValue(obj: Record<string, unknown>): unknown {
  // Direct field on the error object — some adapters set this.
  const direct =
    obj['retryAfter'] ??
    obj['retry_after'] ??
    obj['retryAfterMs'] ??
    obj['retry-after'] ??
    null;
  if (direct !== null && direct !== undefined) return direct;

  for (const key of ['headers', 'responseHeaders']) {
    const headers = obj[key];
    if (headers === null || headers === undefined) continue;
    const fromHeaders = pickFromHeaders(headers);
    if (fromHeaders !== null) return fromHeaders;
  }

  return null;
}

function pickFromHeaders(headers: unknown): unknown {
  if (typeof headers !== 'object' || headers === null) return null;
  // `Headers`-like objects expose a `get(key)` accessor — case-insensitive.
  const getter = (headers as { get?: (k: string) => string | null | undefined }).get;
  if (typeof getter === 'function') {
    const fromGet =
      getter.call(headers, 'retry-after') ?? getter.call(headers, 'Retry-After') ?? null;
    if (fromGet !== null && fromGet !== undefined) return fromGet;
  }
  const h = headers as Record<string, unknown>;
  return h['retry-after'] ?? h['Retry-After'] ?? null;
}

function parseRetryAfterValue(value: unknown, nowMs: number): number | null {
  // Numeric (seconds). Per RFC 7231 the delta is non-negative.
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Math.round(value * 1000) : null;
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  // Try numeric seconds first.
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return Math.round(asNumber * 1000);
  }

  // Fallback: HTTP-date.
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    return Math.max(0, parsed - nowMs);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Abort detection — shared by the classifier and the orchestrator caller
// ---------------------------------------------------------------------------

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
 * Returns true when `err` represents a transient failure that's safe to
 * retry once before any provider output has been seen. Includes both
 * network-layer flakes (sockets, undici timeouts) AND HTTP 429 rate-
 * limit responses (H5, audit 2026-05-07).
 *
 * Returns false for:
 *   - aborts / cancellations (user-initiated stop)
 *   - non-429 HTTP-status errors thrown explicitly by adapters (400, 403,
 *     500, etc.) — those are not retryable in this code path
 *   - anything we can't recognise
 *
 * Handles wrapped errors by walking up to {@link MAX_CAUSE_DEPTH} levels
 * of `error.cause`, which is how undici and the Vercel AI SDK surface
 * the real underlying error.
 */
export function isTransientFetchFailure(err: unknown): boolean {
  if (err === null || err === undefined) return false;
  if (isAbortLike(err)) return false;

  // H5 — HTTP 429 is now retryable (with longer, possibly Retry-After-honoring backoff).
  if (isHttp429Error(err)) return true;

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

// ---------------------------------------------------------------------------
// Backoff policy
// ---------------------------------------------------------------------------

/**
 * Backoff between attempts for network-layer flakes. 200 ms is long
 * enough for undici's keepalive pool to evict the dead socket and
 * short enough that the user does not notice the delay in the
 * streaming-spinner UI.
 */
export const PROVIDER_RETRY_BACKOFF_MS = 200;

/**
 * Base for exponential backoff on rate-limit retries. attempt 0 → 1 s,
 * attempt 1 → 2 s, attempt 2 → 4 s, etc. Anthropic / OpenAI 429s
 * typically resolve within a handful of seconds; this base hits the
 * common case without needlessly delaying the rare one. H5 audit.
 */
export const RATE_LIMIT_BACKOFF_BASE_MS = 1000;

/**
 * Hard ceiling on rate-limit backoff. 30 s caps both the exponential
 * curve AND any pathological `Retry-After` an upstream might send.
 * Beyond that, we fail the user-visible request rather than block the
 * UI for half a minute. H5 audit.
 */
export const RATE_LIMIT_BACKOFF_CAP_MS = 30_000;

/**
 * Compute the wait before the NEXT attempt given the failure of the
 * CURRENT one. `attempt` is the zero-indexed number of the failing
 * attempt — so for the loop sequence:
 *
 *   attempt 0 fails → wait getProviderRetryBackoffMs(err, 0)
 *   attempt 1 fails → wait getProviderRetryBackoffMs(err, 1)
 *   …
 *
 * Policy:
 *   - HTTP 429 with parseable `Retry-After` header: honor it
 *     (clamped to RATE_LIMIT_BACKOFF_CAP_MS).
 *   - HTTP 429 without `Retry-After`: exponential backoff
 *     `RATE_LIMIT_BACKOFF_BASE_MS * 2^attempt`, capped at 30 s.
 *   - Any other transient error: the fixed
 *     `PROVIDER_RETRY_BACKOFF_MS` (200 ms).
 *
 * H5 audit 2026-05-07.
 */
export function getProviderRetryBackoffMs(
  err: unknown,
  attempt: number,
  nowMs?: number,
): number {
  if (isHttp429Error(err)) {
    const retryAfter = extractRetryAfterMs(err, nowMs);
    if (retryAfter !== null) {
      return Math.min(Math.max(0, retryAfter), RATE_LIMIT_BACKOFF_CAP_MS);
    }
    const safeAttempt = Math.max(0, attempt);
    const expBackoff = RATE_LIMIT_BACKOFF_BASE_MS * 2 ** safeAttempt;
    return Math.min(expBackoff, RATE_LIMIT_BACKOFF_CAP_MS);
  }
  return PROVIDER_RETRY_BACKOFF_MS;
}

/**
 * User-facing message for a provider call that failed every retry with
 * a transient network or rate-limit error. Phrased as an actionable
 * next step rather than a stack-trace excerpt — this lands in the chat
 * bubble where the assistant reply would have rendered.
 */
export const PROVIDER_CONNECTION_DROPPED_MESSAGE =
  'Provider connection dropped. Please retry, or switch to a different provider in Settings.';

/**
 * Number of attempts (1 initial + 2 retries) `runAgent` makes before
 * declaring a provider call failed. Bumped from 2 → 3 by H5 (audit
 * 2026-05-07) so HTTP 429 cascades have two retries' worth of
 * exponential backoff (1 s + 2 s by default) before the call surfaces
 * as a hard failure. Network-layer flakes still resolve on the first
 * retry in the overwhelming majority of cases — the extra attempt
 * costs at most an additional 200 ms on the rare double-flake.
 */
export const MAX_PROVIDER_ATTEMPTS = 3;
