/**
 * `initVec` tests — verifies the sqlite-vec initializer degrades gracefully
 * when the extension is unavailable.
 *
 * Uses `makeTestDb()` (sql.js / WASM) per the workspace DB-test convention.
 * sql.js does not ship the vec0 module, so `initVec` should hit its catch
 * branch and return `false` — exactly the production fallback behavior we
 * want under brute-force cosine similarity.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from './test-helpers.js';
import { initVec } from './vec-init.js';

let ctx: TestDbHandle;

beforeEach(async () => {
  ctx = await makeTestDb();
});

afterEach(() => {
  ctx.close();
});

describe('initVec', () => {
  it('returns boolean without throwing when sqlite-vec unavailable', () => {
    const result = initVec(ctx.db, 1536);
    expect(typeof result).toBe('boolean');
  });

  it('accepts different dimensions', () => {
    const result = initVec(ctx.db, 768);
    expect(typeof result).toBe('boolean');
  });
});
