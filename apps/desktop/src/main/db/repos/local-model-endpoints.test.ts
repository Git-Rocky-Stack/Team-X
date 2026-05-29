import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { createLocalModelEndpointsRepo } from './local-model-endpoints.js';

const NANOID = /^[A-Za-z0-9_-]{21}$/;

describe('localModelEndpointsRepo', () => {
  let ctx: TestDbHandle;
  let repo: ReturnType<typeof createLocalModelEndpointsRepo>;

  beforeEach(async () => {
    ctx = await makeTestDb();
    repo = createLocalModelEndpointsRepo(ctx.db);
  });

  afterEach(() => {
    ctx.close();
  });

  it('insert + getById round-trips', () => {
    const created = repo.insert({
      name: 'LM Studio on bench',
      baseUrl: 'http://192.168.1.50:1234',
      authHeaderKeyRef: null,
    });
    expect(created.id).toMatch(NANOID);
    expect(created.name).toBe('LM Studio on bench');
    expect(created.baseUrl).toBe('http://192.168.1.50:1234');
    expect(created.privacyTier).toBe('Local');
    expect(created.status).toBe('unknown');
    expect(created.lastCheckedAt).toBeNull();
    expect(repo.getById(created.id)).toEqual(created);
  });

  it('getById returns null for an unknown id', () => {
    expect(repo.getById('nope')).toBeNull();
  });

  it('list returns endpoints newest-first', () => {
    const a = repo.insert({ name: 'A', baseUrl: 'http://a', authHeaderKeyRef: null });
    const b = repo.insert({ name: 'B', baseUrl: 'http://b', authHeaderKeyRef: null });
    const c = repo.insert({ name: 'C', baseUrl: 'http://c', authHeaderKeyRef: null });
    // Force distinct created_at so the DESC ordering is deterministic.
    ctx.raw.run('UPDATE local_model_endpoints SET created_at = ? WHERE id = ?', [1000, a.id]);
    ctx.raw.run('UPDATE local_model_endpoints SET created_at = ? WHERE id = ?', [2000, b.id]);
    ctx.raw.run('UPDATE local_model_endpoints SET created_at = ? WHERE id = ?', [3000, c.id]);
    expect(repo.list().map((e) => e.name)).toEqual(['C', 'B', 'A']);
  });

  it('updateStatus sets status + lastCheckedAt + lastError', () => {
    const e = repo.insert({ name: 'X', baseUrl: 'http://x', authHeaderKeyRef: null });
    const updated = repo.updateStatus(e.id, 'unreachable', 'ECONNREFUSED');
    expect(updated.status).toBe('unreachable');
    expect(updated.lastError).toBe('ECONNREFUSED');
    expect(updated.lastCheckedAt).toBeGreaterThan(0);
  });

  it('updateAuthRef rotates and clears the keytar reference', () => {
    const e = repo.insert({ name: 'X', baseUrl: 'http://x', authHeaderKeyRef: null });
    expect(repo.updateAuthRef(e.id, 'team-x.local-gguf.endpoint:X-v1').authHeaderKeyRef).toBe(
      'team-x.local-gguf.endpoint:X-v1',
    );
    expect(repo.updateAuthRef(e.id, null).authHeaderKeyRef).toBeNull();
  });

  it('rename updates the name', () => {
    const e = repo.insert({ name: 'Old', baseUrl: 'http://x', authHeaderKeyRef: null });
    expect(repo.rename(e.id, 'New').name).toBe('New');
  });

  it('remove deletes the endpoint', () => {
    const e = repo.insert({ name: 'X', baseUrl: 'http://x', authHeaderKeyRef: null });
    repo.remove(e.id);
    expect(repo.getById(e.id)).toBeNull();
  });

  it('removing an endpoint cascades to its local_models rows', () => {
    const e = repo.insert({ name: 'X', baseUrl: 'http://x', authHeaderKeyRef: null });
    ctx.raw.run(
      `INSERT INTO local_models (id, display_name, source_type, endpoint_id, created_at, updated_at)
       VALUES ('m1', 'M', 'remote-endpoint', ?, ?, ?)`,
      [e.id, Date.now(), Date.now()],
    );
    repo.remove(e.id);
    const count = ctx.raw.exec("SELECT COUNT(*) FROM local_models WHERE id = 'm1'")[0]?.values[0]?.[0];
    expect(count).toBe(0);
  });

  it('rejects a non-Local privacy_tier (CHECK constraint)', () => {
    expect(() =>
      ctx.raw.run(
        `INSERT INTO local_model_endpoints (id, name, base_url, privacy_tier, status, created_at, updated_at)
         VALUES ('bad', 'Bad', 'http://x', 'Cloud', 'unknown', ?, ?)`,
        [Date.now(), Date.now()],
      ),
    ).toThrow();
  });
});
