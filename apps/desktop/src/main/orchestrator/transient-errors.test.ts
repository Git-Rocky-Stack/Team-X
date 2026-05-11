/**
 * Unit tests for `isTransientFetchFailure` and the H5 (audit 2026-05-07)
 * additions: HTTP 429 detection, `Retry-After` parsing, and the
 * exponential-backoff helper. Pure-function checks — no orchestrator
 * wiring, no DB. Covers the three observed shapes of transient network
 * failure (`fetch failed` TypeError, undici cause-chain `code`, Node
 * net `code`) AND the new H5 shapes (numeric `status: 429`, message
 * patterns "HTTP 429" / "rate limit" / "Too Many Requests"), plus the
 * negative cases that must NOT trigger a retry.
 */
import { describe, expect, it } from 'vitest';

import {
  PROVIDER_RETRY_BACKOFF_MS,
  RATE_LIMIT_BACKOFF_BASE_MS,
  RATE_LIMIT_BACKOFF_CAP_MS,
  extractRetryAfterMs,
  getProviderRetryBackoffMs,
  isHttp429Error,
  isTransientFetchFailure,
} from './transient-errors.js';

describe('isTransientFetchFailure', () => {
  describe('positive matches (retry should fire)', () => {
    it('matches the bare undici TypeError("fetch failed")', () => {
      expect(isTransientFetchFailure(new TypeError('fetch failed'))).toBe(true);
    });

    it('matches "fetch failed" with surrounding whitespace', () => {
      expect(isTransientFetchFailure(new TypeError('  fetch failed  '))).toBe(true);
    });

    it('matches when the real cause is wrapped one level deep', () => {
      const inner = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
      const outer = new TypeError('fetch failed', { cause: inner });
      expect(isTransientFetchFailure(outer)).toBe(true);
    });

    it('matches when the cause chain hides ECONNREFUSED two levels deep', () => {
      const root = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:11434'), {
        code: 'ECONNREFUSED',
      });
      const middle = new TypeError('fetch failed', { cause: root });
      const top = new Error('Provider stream errored', { cause: middle });
      expect(isTransientFetchFailure(top)).toBe(true);
    });

    it('matches an undici UND_ERR_SOCKET on the top-level error', () => {
      const err = Object.assign(new Error('Other side closed'), { code: 'UND_ERR_SOCKET' });
      expect(isTransientFetchFailure(err)).toBe(true);
    });

    it('matches ETIMEDOUT', () => {
      const err = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });
      expect(isTransientFetchFailure(err)).toBe(true);
    });
  });

  describe('negative matches (no retry)', () => {
    it('does not match a DOMException AbortError', () => {
      const err = new DOMException('The user aborted a request', 'AbortError');
      expect(isTransientFetchFailure(err)).toBe(false);
    });

    it('does not match an Error whose name is AbortError', () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      expect(isTransientFetchFailure(err)).toBe(false);
    });

    it('does not match adapter HTTP-status errors', () => {
      const err = new Error('[provider-router/ollama] Ollama returned HTTP 400: prompt too long');
      expect(isTransientFetchFailure(err)).toBe(false);
    });

    it('does not match arbitrary unrelated errors', () => {
      expect(isTransientFetchFailure(new Error('something else broke'))).toBe(false);
    });

    it('does not match non-Error throws', () => {
      expect(isTransientFetchFailure('fetch failed')).toBe(false);
      expect(isTransientFetchFailure(null)).toBe(false);
      expect(isTransientFetchFailure(undefined)).toBe(false);
      expect(isTransientFetchFailure(42)).toBe(false);
    });

    it('does not loop forever on a self-referential cause', () => {
      const err = new Error('weird');
      // Intentionally craft a self-cause to test loop guard.
      Object.assign(err, { cause: err });
      expect(isTransientFetchFailure(err)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// H5 audit 2026-05-07 — HTTP 429 detection, Retry-After parsing, backoff
// ---------------------------------------------------------------------------

describe('isHttp429Error (H5 audit 2026-05-07)', () => {
  it('matches an Error with `status: 429` (Anthropic / OpenAI SDK shape)', () => {
    const err = Object.assign(new Error('Rate limited'), { status: 429 });
    expect(isHttp429Error(err)).toBe(true);
  });

  it('matches an Error with `statusCode: 429` (alt SDK shape)', () => {
    const err = Object.assign(new Error('429 Too Many Requests'), { statusCode: 429 });
    expect(isHttp429Error(err)).toBe(true);
  });

  it('matches a message containing "HTTP 429"', () => {
    expect(
      isHttp429Error(new Error('[provider-router/anthropic] anthropic returned HTTP 429')),
    ).toBe(true);
  });

  it('matches a message containing "Too Many Requests"', () => {
    expect(isHttp429Error(new Error('429 Too Many Requests'))).toBe(true);
  });

  it('matches a message containing "rate limit"', () => {
    expect(isHttp429Error(new Error('rate limit exceeded'))).toBe(true);
    expect(isHttp429Error(new Error('rate-limited'))).toBe(true);
    expect(isHttp429Error(new Error('Rate Limited'))).toBe(true);
  });

  it('matches when the 429 is hidden inside a wrapped cause chain', () => {
    const inner = Object.assign(new Error('429: rate limited'), { status: 429 });
    const outer = new Error('Provider stream errored', { cause: inner });
    expect(isHttp429Error(outer)).toBe(true);
  });

  it('does NOT match other HTTP errors (400, 500, etc.)', () => {
    expect(isHttp429Error(Object.assign(new Error('Bad request'), { status: 400 }))).toBe(false);
    expect(isHttp429Error(Object.assign(new Error('server error'), { status: 500 }))).toBe(false);
    expect(isHttp429Error(new Error('HTTP 503 service unavailable'))).toBe(false);
  });

  it('does NOT match arbitrary errors', () => {
    expect(isHttp429Error(new Error('socket hang up'))).toBe(false);
    expect(isHttp429Error(null)).toBe(false);
    expect(isHttp429Error(undefined)).toBe(false);
    expect(isHttp429Error('429')).toBe(false);
  });

  it('does not match a 429-substring inside an unrelated number', () => {
    // `4290`, `1429`, etc. should NOT match — pattern requires a word
    // boundary on either side of `429`.
    expect(isHttp429Error(new Error('total tokens 1429'))).toBe(false);
    expect(isHttp429Error(new Error('balance: 4290 USD'))).toBe(false);
  });
});

describe('isTransientFetchFailure — 429 path (H5 audit 2026-05-07)', () => {
  it('returns true for HTTP 429 errors so the retry loop fires', () => {
    expect(isTransientFetchFailure(new Error('HTTP 429 Too Many Requests'))).toBe(true);
    expect(isTransientFetchFailure(Object.assign(new Error('rate limited'), { status: 429 }))).toBe(
      true,
    );
  });

  it('still returns false for 400 / 500 (non-retryable HTTP)', () => {
    expect(
      isTransientFetchFailure(
        new Error('[provider-router/ollama] Ollama returned HTTP 400: prompt too long'),
      ),
    ).toBe(false);
    expect(
      isTransientFetchFailure(Object.assign(new Error('internal server error'), { status: 500 })),
    ).toBe(false);
  });

  it('429 detection survives the same cause-chain walk as network errors', () => {
    const inner = Object.assign(new Error('rate limit hit'), { status: 429 });
    const outer = new Error('AI_APICallError', { cause: inner });
    expect(isTransientFetchFailure(outer)).toBe(true);
  });
});

describe('extractRetryAfterMs (H5 audit 2026-05-07)', () => {
  it('parses numeric seconds from a Retry-After string', () => {
    const err = Object.assign(new Error('429'), {
      status: 429,
      headers: { 'retry-after': '60' },
    });
    expect(extractRetryAfterMs(err)).toBe(60_000);
  });

  it('parses numeric seconds from a Retry-After number', () => {
    const err = Object.assign(new Error('429'), {
      status: 429,
      headers: { 'retry-after': 30 },
    });
    expect(extractRetryAfterMs(err)).toBe(30_000);
  });

  it('parses an HTTP-date Retry-After', () => {
    const fixedNow = Date.parse('2026-05-09T12:00:00Z');
    const err = Object.assign(new Error('429'), {
      status: 429,
      headers: { 'retry-after': 'Sat, 09 May 2026 12:00:45 GMT' },
    });
    expect(extractRetryAfterMs(err, fixedNow)).toBe(45_000);
  });

  it('clamps a past HTTP-date to 0 (do not return negative wait)', () => {
    const fixedNow = Date.parse('2026-05-09T12:00:00Z');
    const err = Object.assign(new Error('429'), {
      status: 429,
      headers: { 'retry-after': 'Sat, 09 May 2026 11:55:00 GMT' },
    });
    expect(extractRetryAfterMs(err, fixedNow)).toBe(0);
  });

  it('reads from a Headers-like .get(key) accessor (case-insensitive)', () => {
    const headers = {
      get(key: string): string | null {
        return key.toLowerCase() === 'retry-after' ? '15' : null;
      },
    };
    const err = Object.assign(new Error('429'), { status: 429, headers });
    expect(extractRetryAfterMs(err)).toBe(15_000);
  });

  it('reads from `responseHeaders` when present (Vercel AI SDK shape)', () => {
    const err = Object.assign(new Error('429'), {
      status: 429,
      responseHeaders: { 'Retry-After': '5' },
    });
    expect(extractRetryAfterMs(err)).toBe(5_000);
  });

  it('reads from a top-level `retryAfter` field on the error', () => {
    const err = Object.assign(new Error('429'), { status: 429, retryAfter: '8' });
    expect(extractRetryAfterMs(err)).toBe(8_000);
  });

  it('walks the cause chain looking for headers', () => {
    const inner = Object.assign(new Error('429'), {
      status: 429,
      headers: { 'retry-after': '12' },
    });
    const outer = new Error('AI_APICallError', { cause: inner });
    expect(extractRetryAfterMs(outer)).toBe(12_000);
  });

  it('returns null when no Retry-After is present', () => {
    expect(extractRetryAfterMs(new Error('429 with no header'))).toBeNull();
    expect(extractRetryAfterMs(null)).toBeNull();
    expect(extractRetryAfterMs(undefined)).toBeNull();
  });

  it('returns null for an unparseable Retry-After string', () => {
    const err = Object.assign(new Error('429'), {
      status: 429,
      headers: { 'retry-after': 'banana' },
    });
    expect(extractRetryAfterMs(err)).toBeNull();
  });
});

describe('getProviderRetryBackoffMs (H5 audit 2026-05-07)', () => {
  it('returns the network-flake constant (200 ms) for non-429 transient errors', () => {
    const err = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    expect(getProviderRetryBackoffMs(err, 0)).toBe(PROVIDER_RETRY_BACKOFF_MS);
    expect(getProviderRetryBackoffMs(err, 1)).toBe(PROVIDER_RETRY_BACKOFF_MS);
  });

  it('returns Retry-After when the 429 supplies one (clamped to 30s)', () => {
    const err = Object.assign(new Error('rate limited'), {
      status: 429,
      headers: { 'retry-after': '7' },
    });
    expect(getProviderRetryBackoffMs(err, 0)).toBe(7_000);
  });

  it('clamps a Retry-After above the 30s cap', () => {
    const err = Object.assign(new Error('rate limited'), {
      status: 429,
      headers: { 'retry-after': '600' }, // 10 minutes
    });
    expect(getProviderRetryBackoffMs(err, 0)).toBe(RATE_LIMIT_BACKOFF_CAP_MS);
  });

  it('falls back to exponential backoff when no Retry-After is present', () => {
    const err = Object.assign(new Error('rate limited'), { status: 429 });
    expect(getProviderRetryBackoffMs(err, 0)).toBe(RATE_LIMIT_BACKOFF_BASE_MS); // 1s
    expect(getProviderRetryBackoffMs(err, 1)).toBe(RATE_LIMIT_BACKOFF_BASE_MS * 2); // 2s
    expect(getProviderRetryBackoffMs(err, 2)).toBe(RATE_LIMIT_BACKOFF_BASE_MS * 4); // 4s
    expect(getProviderRetryBackoffMs(err, 3)).toBe(RATE_LIMIT_BACKOFF_BASE_MS * 8); // 8s
    expect(getProviderRetryBackoffMs(err, 4)).toBe(RATE_LIMIT_BACKOFF_BASE_MS * 16); // 16s
  });

  it('caps exponential backoff at the 30s ceiling', () => {
    const err = Object.assign(new Error('rate limited'), { status: 429 });
    // 1000 * 2^5 = 32_000, above the 30_000 cap.
    expect(getProviderRetryBackoffMs(err, 5)).toBe(RATE_LIMIT_BACKOFF_CAP_MS);
    expect(getProviderRetryBackoffMs(err, 100)).toBe(RATE_LIMIT_BACKOFF_CAP_MS);
  });

  it('treats negative attempt as zero (defensive)', () => {
    const err = Object.assign(new Error('rate limited'), { status: 429 });
    expect(getProviderRetryBackoffMs(err, -1)).toBe(RATE_LIMIT_BACKOFF_BASE_MS);
  });
});
