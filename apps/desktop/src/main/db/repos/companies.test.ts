import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';
import { createCompaniesRepo } from './companies.js';

describe('companies repo', () => {
  let ctx: TestDbHandle;
  let repo: ReturnType<typeof createCompaniesRepo>;

  beforeEach(async () => {
    ctx = await makeTestDb();
    repo = createCompaniesRepo(ctx.db);
  });

  afterEach(() => {
    ctx.close();
  });

  describe('create', () => {
    it('returns a non-empty id', () => {
      const id = repo.create({ name: 'Strategia-X', slug: 'strategia-x' });
      expect(id).toBeTypeOf('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('persists the row with provided name and slug', () => {
      const id = repo.create({ name: 'Strategia-X', slug: 'strategia-x' });
      const got = repo.getById(id);
      expect(got).not.toBeNull();
      expect(got?.name).toBe('Strategia-X');
      expect(got?.slug).toBe('strategia-x');
    });

    it('stores an empty settings object by default', () => {
      const id = repo.create({ name: 'X', slug: 'x' });
      const got = repo.getById(id);
      expect(got?.settingsJson).toBe('{}');
    });

    it('serializes a provided settings object to JSON', () => {
      const id = repo.create({
        name: 'X',
        slug: 'x',
        settings: { mission: 'Build Team-X', hq: 'local' },
      });
      const got = repo.getById(id);
      expect(got).not.toBeNull();
      expect(JSON.parse(got?.settingsJson ?? '{}')).toEqual({
        mission: 'Build Team-X',
        hq: 'local',
      });
    });

    it('defaults theme to "dark"', () => {
      const id = repo.create({ name: 'X', slug: 'x' });
      expect(repo.getById(id)?.theme).toBe('dark');
    });

    it('stores createdAt as a positive integer in ms', () => {
      const before = Date.now();
      const id = repo.create({ name: 'X', slug: 'x' });
      const after = Date.now();
      const got = repo.getById(id);
      expect(got?.createdAt).toBeGreaterThanOrEqual(before);
      expect(got?.createdAt).toBeLessThanOrEqual(after);
    });

    it('enforces unique slug (throws on duplicate)', () => {
      repo.create({ name: 'One', slug: 'same-slug' });
      expect(() => repo.create({ name: 'Two', slug: 'same-slug' })).toThrow();
    });
  });

  describe('getBySlug', () => {
    it('returns the company matching a known slug', () => {
      const id = repo.create({ name: 'Strategia-X', slug: 'strategia-x' });
      const got = repo.getBySlug('strategia-x');
      expect(got?.id).toBe(id);
      expect(got?.name).toBe('Strategia-X');
    });

    it('returns null for an unknown slug', () => {
      expect(repo.getBySlug('does-not-exist')).toBeNull();
    });

    it('is case-sensitive (SQLite default)', () => {
      repo.create({ name: 'X', slug: 'lowercase' });
      expect(repo.getBySlug('LOWERCASE')).toBeNull();
    });
  });

  describe('getById', () => {
    it('returns the company matching a known id', () => {
      const id = repo.create({ name: 'X', slug: 'x' });
      expect(repo.getById(id)).not.toBeNull();
    });

    it('returns null for an unknown id', () => {
      expect(repo.getById('definitely-not-a-real-id')).toBeNull();
    });
  });

  describe('list', () => {
    it('returns an empty array when no companies exist', () => {
      expect(repo.list()).toEqual([]);
    });

    it('returns every created company', () => {
      repo.create({ name: 'A', slug: 'a' });
      repo.create({ name: 'B', slug: 'b' });
      repo.create({ name: 'C', slug: 'c' });
      const all = repo.list();
      expect(all).toHaveLength(3);
      expect(all.map((c) => c.slug).sort()).toEqual(['a', 'b', 'c']);
    });
  });

  describe('setStatus', () => {
    it('updates the company status column', () => {
      const id = repo.create({ name: 'S', slug: 's' });
      const before = repo.getById(id);
      expect(before?.status).toBe('running');

      repo.setStatus(id, 'meeting');
      const after = repo.getById(id);
      expect(after?.status).toBe('meeting');
    });

    it('can transition through all valid statuses', () => {
      const id = repo.create({ name: 'T', slug: 't' });
      for (const status of ['meeting', 'paused', 'running'] as const) {
        repo.setStatus(id, status);
        expect(repo.getById(id)?.status).toBe(status);
      }
    });
  });
});
