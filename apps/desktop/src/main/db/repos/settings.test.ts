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
      expect(count).toBe(4);
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
      expect(count).toBe(3); // only 3 new, runtime_strategy kept
      expect(repo.get<string>('runtime_strategy', '')).toBe('lean');
    });

    it('is idempotent', () => {
      repo.seedDefaults();
      const count = repo.seedDefaults();
      expect(count).toBe(0);
    });
  });
});
