/**
 * Unit tests for the migration runner wrapper. Same rationale as
 * client.test.ts — we mock drizzle's migrator so the test exercises the
 * wrapper's argument-forwarding behavior without loading better-sqlite3's
 * native binding. Real migration behavior is integration-verified under
 * `pnpm -F @team-x/desktop dev`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted() co-hoists the mock fn alongside vi.mock so the factory can
// close over it without hitting the temporal-dead-zone on `const migrateMock`.
const { migrateMock } = vi.hoisted(() => ({ migrateMock: vi.fn() }));

vi.mock('drizzle-orm/better-sqlite3/migrator', () => ({
  migrate: migrateMock,
}));

import { runMigrations } from './migrate.js';

describe('db/migrate', () => {
  beforeEach(() => {
    migrateMock.mockClear();
  });

  it('forwards the db handle and migrations folder to drizzle migrate', () => {
    const fakeDb = { __fake: true } as unknown as Parameters<typeof runMigrations>[0];
    runMigrations(fakeDb, '/abs/path/to/migrations');
    expect(migrateMock).toHaveBeenCalledTimes(1);
    expect(migrateMock).toHaveBeenCalledWith(fakeDb, {
      migrationsFolder: '/abs/path/to/migrations',
    });
  });

  it('propagates errors from drizzle migrate unchanged', () => {
    migrateMock.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const fakeDb = {} as unknown as Parameters<typeof runMigrations>[0];
    expect(() => runMigrations(fakeDb, '/abs/migrations')).toThrow('boom');
  });
});
