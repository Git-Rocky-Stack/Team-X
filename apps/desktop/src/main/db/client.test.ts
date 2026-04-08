/**
 * Unit tests for the DB client singleton state machine + pragma orchestration.
 *
 * Why the mocks: the better-sqlite3 native binding in this workspace is built
 * against Electron's ABI (see Task 18), so Vitest running under plain Node
 * cannot `require('better-sqlite3')` directly — it would fail with a
 * NODE_MODULE_VERSION mismatch. We mock the driver and drizzle wrapper so
 * these tests exercise the pure JS orchestration (pragmas, singleton
 * lifecycle) without touching the native module. Real DB behavior is
 * integration-verified under `pnpm -F @team-x/desktop dev`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted() co-hoists these mock fns to the top of the file alongside
// vi.mock, so the factories below can reference them without hitting the
// temporal-dead-zone that bites plain `const` declarations used in hoisted
// factories.
const { pragmaMock, closeMock, DatabaseMock, drizzleMock } = vi.hoisted(() => {
  const pragma = vi.fn();
  const close = vi.fn();
  // `new DatabaseMock(path)` returns the object literal, so the function
  // acts as a constructor whose returned object overrides the `this` binding
  // per the standard JS `new` semantics. This keeps `Database` trackable as
  // a vi.fn() spy while still satisfying `new Database(':memory:')`.
  const dbCtor = vi.fn((path: string) => ({ path, pragma, close }));
  const drz = vi.fn((raw: unknown, opts: unknown) => ({
    __mockDrizzle: true,
    raw,
    opts,
  }));
  return { pragmaMock: pragma, closeMock: close, DatabaseMock: dbCtor, drizzleMock: drz };
});

vi.mock('better-sqlite3', () => ({ default: DatabaseMock }));
vi.mock('drizzle-orm/better-sqlite3', () => ({ drizzle: drizzleMock }));

import { closeDb, createDb, getDb, initDb } from './client.js';

describe('db/client', () => {
  beforeEach(() => {
    // Ensure each test starts with no cached singleton.
    closeDb();
    pragmaMock.mockClear();
    closeMock.mockClear();
    DatabaseMock.mockClear();
    drizzleMock.mockClear();
  });

  afterEach(() => {
    closeDb();
  });

  describe('createDb', () => {
    it('opens better-sqlite3 with the provided path', () => {
      createDb(':memory:');
      expect(DatabaseMock).toHaveBeenCalledTimes(1);
      expect(DatabaseMock).toHaveBeenCalledWith(':memory:');
    });

    it('sets journal_mode=WAL, foreign_keys=ON, synchronous=NORMAL', () => {
      createDb(':memory:');
      expect(pragmaMock).toHaveBeenCalledTimes(3);
      expect(pragmaMock).toHaveBeenNthCalledWith(1, 'journal_mode = WAL');
      expect(pragmaMock).toHaveBeenNthCalledWith(2, 'foreign_keys = ON');
      expect(pragmaMock).toHaveBeenNthCalledWith(3, 'synchronous = NORMAL');
    });

    it('returns a handle containing both the drizzle db and the raw connection', () => {
      const handle = createDb(':memory:');
      expect(handle.db).toBeDefined();
      expect(handle.raw).toBeDefined();
      expect((handle.db as unknown as { __mockDrizzle: boolean }).__mockDrizzle).toBe(true);
    });

    it('does not mutate the singleton cache — createDb is pure', () => {
      createDb(':memory:');
      expect(() => getDb()).toThrow(/not initialized/);
    });
  });

  describe('initDb / getDb / closeDb singleton', () => {
    it('getDb before initDb throws', () => {
      expect(() => getDb()).toThrow(/not initialized/);
    });

    it('initDb caches a handle and returns it', () => {
      const handle = initDb(':memory:');
      expect(handle.db).toBeDefined();
      expect(handle.raw).toBeDefined();
    });

    it('initDb called twice throws', () => {
      initDb(':memory:');
      expect(() => initDb(':memory:')).toThrow(/already initialized/);
    });

    it('getDb after initDb returns the initialized drizzle db', () => {
      const handle = initDb(':memory:');
      expect(getDb()).toBe(handle.db);
    });

    it('closeDb closes the raw connection and resets the cache', () => {
      initDb(':memory:');
      closeDb();
      expect(closeMock).toHaveBeenCalledTimes(1);
      expect(() => getDb()).toThrow(/not initialized/);
    });

    it('closeDb before initDb is a no-op', () => {
      expect(() => closeDb()).not.toThrow();
      expect(closeMock).not.toHaveBeenCalled();
    });

    it('initDb works again after closeDb (full lifecycle)', () => {
      initDb(':memory:');
      closeDb();
      const handle2 = initDb(':memory:');
      expect(handle2.db).toBeDefined();
      expect(getDb()).toBe(handle2.db);
    });
  });
});
