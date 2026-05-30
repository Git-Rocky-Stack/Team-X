import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { createLocalModelWatchFoldersRepo } from './local-model-watch-folders.js';

const NANOID = /^[A-Za-z0-9_-]{21}$/;

describe('localModelWatchFoldersRepo', () => {
  let ctx: TestDbHandle;
  let repo: ReturnType<typeof createLocalModelWatchFoldersRepo>;

  beforeEach(async () => {
    ctx = await makeTestDb();
    repo = createLocalModelWatchFoldersRepo(ctx.db);
  });

  afterEach(() => {
    ctx.close();
  });

  it('insert + getById round-trips a UNC path', () => {
    const created = repo.insert({ path: '\\\\NAS-01\\models', recursive: true });
    expect(created.id).toMatch(NANOID);
    expect(created.path).toBe('\\\\NAS-01\\models');
    expect(created.recursive).toBe(true);
    expect(created.status).toBe('unknown');
    expect(created.lastScanAt).toBeNull();
    expect(repo.getById(created.id)).toEqual(created);
  });

  it('insert defaults recursive to true when omitted', () => {
    expect(repo.insert({ path: '/Users/rocky/models' }).recursive).toBe(true);
  });

  it('insert honors recursive=false', () => {
    expect(repo.insert({ path: '/x', recursive: false }).recursive).toBe(false);
  });

  it('list returns folders oldest-first (stable UI ordering)', () => {
    const a = repo.insert({ path: '/a' });
    const b = repo.insert({ path: '/b' });
    const c = repo.insert({ path: '/c' });
    // Force distinct created_at so the ASC ordering is deterministic.
    ctx.raw.run('UPDATE local_model_watch_folders SET created_at = ? WHERE id = ?', [1000, a.id]);
    ctx.raw.run('UPDATE local_model_watch_folders SET created_at = ? WHERE id = ?', [2000, b.id]);
    ctx.raw.run('UPDATE local_model_watch_folders SET created_at = ? WHERE id = ?', [3000, c.id]);
    expect(repo.list().map((w) => w.path)).toEqual(['/a', '/b', '/c']);
  });

  it('updateStatus sets status + lastScanAt + lastScanError', () => {
    const w = repo.insert({ path: '/x' });
    const updated = repo.updateStatus(w.id, 'unreachable', 'EACCES');
    expect(updated.status).toBe('unreachable');
    expect(updated.lastScanError).toBe('EACCES');
    expect(updated.lastScanAt).toBeGreaterThan(0);
  });

  it('updateRecursive flips the recursive flag', () => {
    const w = repo.insert({ path: '/x', recursive: true });
    expect(repo.updateRecursive(w.id, false).recursive).toBe(false);
  });

  it('remove deletes the row', () => {
    const w = repo.insert({ path: '/x' });
    repo.remove(w.id);
    expect(repo.getById(w.id)).toBeNull();
  });
});
