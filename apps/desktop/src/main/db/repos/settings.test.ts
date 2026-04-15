import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';
import { createSettingsRepo } from './settings.js';

let ctx: TestDbHandle;
let repo: ReturnType<typeof createSettingsRepo>;

beforeEach(async () => {
  ctx = await makeTestDb();
  repo = createSettingsRepo(ctx.db);
});
afterEach(() => ctx.close());

describe('createSettingsRepo', () => {
  describe('get / set', () => {
    it('returns fallback when key does not exist', () => {
      expect(repo.get('nonexistent', 'default')).toBe('default');
    });

    it('returns fallback for getRaw when key does not exist', () => {
      expect(repo.getRaw('nonexistent')).toBeNull();
    });

    it('stores and retrieves a string value', () => {
      repo.set('theme', 'dark');
      expect(repo.get<string>('theme', 'light')).toBe('dark');
    });

    it('stores and retrieves a number value', () => {
      repo.set('slots', 8);
      expect(repo.get<number>('slots', 2)).toBe(8);
    });

    it('stores and retrieves an object value', () => {
      const caps = { ollama: 1, anthropic: 4 };
      repo.set('caps', caps);
      expect(repo.get('caps', {})).toEqual(caps);
    });

    it('upserts on repeated set', () => {
      repo.set('key', 'first');
      repo.set('key', 'second');
      expect(repo.get<string>('key', '')).toBe('second');
    });

    it('getRaw returns raw JSON string', () => {
      repo.set('foo', { bar: 42 });
      expect(repo.getRaw('foo')).toBe('{"bar":42}');
    });
  });

  describe('getAll', () => {
    it('returns empty array when no settings exist', () => {
      expect(repo.getAll()).toEqual([]);
    });

    it('returns all stored settings', () => {
      repo.set('a', 1);
      repo.set('b', 2);
      const all = repo.getAll();
      expect(all).toHaveLength(2);
      expect(all.map((r) => r.key).sort()).toEqual(['a', 'b']);
    });
  });

  describe('seedDefaults', () => {
    it('seeds all default settings on empty DB', () => {
      const count = repo.seedDefaults();
      expect(count).toBe(14);
      expect(repo.get<string>('runtime_strategy', '')).toBe('auto');
      expect(repo.get<string>('max_privacy_tier', '')).toBe('proprietary-cloud');
      expect(repo.get<number>('orchestrator_slots', 0)).toBe(6);
      const caps = repo.get<Record<string, number>>('concurrency_caps', {});
      expect(caps.ollama).toBe(1);
      expect(caps.anthropic).toBe(4);
    });

    it('does not overwrite existing settings', () => {
      repo.set('runtime_strategy', 'lean');
      const count = repo.seedDefaults();
      expect(count).toBe(13); // only 13 new, runtime_strategy kept
      expect(repo.get<string>('runtime_strategy', '')).toBe('lean');
    });

    it('is idempotent', () => {
      repo.seedDefaults();
      const count = repo.seedDefaults();
      expect(count).toBe(0);
    });

    it('seeds RAG defaults', () => {
      repo.seedDefaults();

      expect(repo.get('rag_enabled', false)).toBe(true);
      expect(repo.get('rag_max_tokens', 0)).toBe(2000);
      expect(repo.get('rag_threshold', 0)).toBe(0.7);
      expect(repo.get('rag_top_k', 0)).toBe(5);
      expect(repo.get('embedding_dimension', 0)).toBe(1536);
    });

    it('seeds agentic-loop defaults (M31)', () => {
      repo.seedDefaults();
      expect(repo.get('agentic_max_steps', 0)).toBe(8);
      expect(repo.get('agentic_max_tokens', 0)).toBe(8000);
      expect(repo.get('agentic_timeout_ms', 0)).toBe(120000);
    });
  });

  describe('agentic (M31)', () => {
    it('getAgentic returns defaults on empty DB (no seed yet)', () => {
      // Fallback path — keys missing, shared clamp defaults kick in.
      expect(repo.getAgentic()).toEqual({
        maxSteps: 8,
        maxTokens: 8000,
        timeoutMs: 120000,
      });
    });

    it('getAgentic reflects the last setAgentic values', () => {
      repo.setAgentic({ maxSteps: 12, maxTokens: 16000, timeoutMs: 60000 });
      expect(repo.getAgentic()).toEqual({
        maxSteps: 12,
        maxTokens: 16000,
        timeoutMs: 60000,
      });
    });

    it('setAgentic supports partial patches — untouched keys retain their value', () => {
      repo.setAgentic({ maxSteps: 10, maxTokens: 4000, timeoutMs: 90000 });
      repo.setAgentic({ maxSteps: 20 });
      expect(repo.getAgentic()).toEqual({
        maxSteps: 20,
        maxTokens: 4000,
        timeoutMs: 90000,
      });
    });

    it('setAgentic clamps below-min integers to the minimum', () => {
      // 0 below each field's min (1, 512, 10000); negative also clamps.
      repo.setAgentic({ maxSteps: -5, maxTokens: 0, timeoutMs: -100 });
      expect(repo.getAgentic()).toEqual({
        maxSteps: 1,
        maxTokens: 512,
        timeoutMs: 10000,
      });
    });

    it('setAgentic clamps above-max integers to the maximum', () => {
      repo.setAgentic({ maxSteps: 1000, maxTokens: 999999, timeoutMs: 9_999_999 });
      expect(repo.getAgentic()).toEqual({
        maxSteps: 32,
        maxTokens: 64000,
        timeoutMs: 600000,
      });
    });

    it('setAgentic rounds fractional inputs before clamping', () => {
      repo.setAgentic({ maxSteps: 8.7, maxTokens: 8000.4, timeoutMs: 120000.9 });
      expect(repo.getAgentic()).toEqual({
        maxSteps: 9,
        maxTokens: 8000,
        timeoutMs: 120001,
      });
    });

    it('setAgentic rejects non-finite numbers with an explicit error', () => {
      expect(() => repo.setAgentic({ maxSteps: Number.NaN })).toThrow(/finite number/);
      expect(() => repo.setAgentic({ maxTokens: Number.POSITIVE_INFINITY })).toThrow(
        /finite number/,
      );
      expect(() => repo.setAgentic({ timeoutMs: Number.NEGATIVE_INFINITY })).toThrow(
        /finite number/,
      );
    });

    it('setAgentic is independent of concurrency_caps and orchestrator_slots', () => {
      // Baseline: seed defaults, then change agentic and confirm
      // the concurrency keys are untouched.
      repo.seedDefaults();
      const capsBefore = repo.get<Record<string, number>>('concurrency_caps', {});
      const slotsBefore = repo.get<number>('orchestrator_slots', 0);
      repo.setAgentic({ maxSteps: 16, maxTokens: 2000, timeoutMs: 45000 });
      expect(repo.get('concurrency_caps', {})).toEqual(capsBefore);
      expect(repo.get('orchestrator_slots', 0)).toBe(slotsBefore);
    });
  });
});
