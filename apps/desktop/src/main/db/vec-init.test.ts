import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it } from 'vitest';

import * as schema from './schema.js';
import { initVec } from './vec-init.js';

describe('initVec', () => {
  it('returns boolean without throwing when sqlite-vec unavailable', () => {
    const raw = new Database(':memory:');
    const db = drizzle(raw, { schema });
    const result = initVec(db, 1536);
    expect(typeof result).toBe('boolean');
  });

  it('accepts different dimensions', () => {
    const raw = new Database(':memory:');
    const db = drizzle(raw, { schema });
    const result = initVec(db, 768);
    expect(typeof result).toBe('boolean');
  });
});
