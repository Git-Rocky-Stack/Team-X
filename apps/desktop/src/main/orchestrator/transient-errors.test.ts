/**
 * Unit tests for `isTransientFetchFailure`. Pure-function checks — no
 * orchestrator wiring, no DB. Covers the three observed shapes of
 * transient network failure (`fetch failed` TypeError, undici cause-
 * chain `code`, Node net `code`) plus the negative cases that must
 * NOT trigger a retry (abort, HTTP-status errors, unknown errors).
 */
import { describe, expect, it } from 'vitest';

import { isTransientFetchFailure } from './transient-errors.js';

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
      const err = new Error(
        '[provider-router/ollama] Ollama returned HTTP 400: prompt too long',
      );
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
