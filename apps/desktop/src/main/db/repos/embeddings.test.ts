/**
 * EmbeddingsRepo unit tests.
 *
 * Uses the shared `makeTestDb()` helper (sql.js / WASM) per the DB-test
 * convention documented in `test-helpers.ts`. The previous incarnation
 * imported `better-sqlite3` directly, which fails under Vitest because the
 * native binding is rebuilt for Electron's ABI by the desktop postinstall
 * hook. Migrating to sql.js eliminates the NMV mismatch and aligns this
 * file with every other repo test in the workspace.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { companies } from '../schema.js';
import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { createEmbeddingsRepo } from './embeddings.js';

let ctx: TestDbHandle;
let repo: ReturnType<typeof createEmbeddingsRepo>;

beforeEach(async () => {
  ctx = await makeTestDb();
  ctx.db
    .insert(companies)
    .values({
      id: 'co-1',
      name: 'Test Co',
      slug: 'test-co',
      createdAt: 1000,
      settingsJson: '{}',
      icon: null,
      theme: 'dark',
      status: 'running',
    })
    .run();
  repo = createEmbeddingsRepo(ctx.db);
});

afterEach(() => {
  ctx.close();
});

function fakeEmbedding(dim = 4): Buffer {
  const arr = new Float32Array(dim);
  for (let i = 0; i < dim; i++) arr[i] = Math.random();
  return Buffer.from(arr.buffer);
}

describe('EmbeddingsRepo', () => {
  it('upserts a single-chunk embedding', () => {
    const id = repo.upsert({
      id: 'emb-1',
      companyId: 'co-1',
      sourceType: 'message',
      sourceId: 'msg-1',
      chunkIndex: 0,
      contentText: 'Hello world',
      embedding: fakeEmbedding(),
      createdAt: Date.now(),
    });
    expect(id).toBe('emb-1');
    const row = repo.getById('emb-1');
    expect(row).not.toBeNull();
    expect(row?.sourceType).toBe('message');
    expect(row?.contentText).toBe('Hello world');
  });

  it('upserts replaces existing chunk', () => {
    const emb = fakeEmbedding();
    repo.upsert({
      id: 'emb-1',
      companyId: 'co-1',
      sourceType: 'ticket',
      sourceId: 'tkt-1',
      chunkIndex: 0,
      contentText: 'Original',
      embedding: emb,
      createdAt: 1000,
    });
    repo.upsert({
      id: 'emb-1',
      companyId: 'co-1',
      sourceType: 'ticket',
      sourceId: 'tkt-1',
      chunkIndex: 0,
      contentText: 'Updated',
      embedding: emb,
      createdAt: 2000,
    });
    const row = repo.getById('emb-1');
    expect(row?.contentText).toBe('Updated');
  });

  it('lists by source ordered by chunk_index', () => {
    repo.upsert({
      id: 'emb-1',
      companyId: 'co-1',
      sourceType: 'ticket',
      sourceId: 'tkt-1',
      chunkIndex: 0,
      contentText: 'Chunk 0',
      embedding: fakeEmbedding(),
      createdAt: 1000,
    });
    repo.upsert({
      id: 'emb-2',
      companyId: 'co-1',
      sourceType: 'ticket',
      sourceId: 'tkt-1',
      chunkIndex: 1,
      contentText: 'Chunk 1',
      embedding: fakeEmbedding(),
      createdAt: 1000,
    });
    const chunks = repo.listBySource('tkt-1');
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.chunkIndex).toBe(0);
    expect(chunks[1]?.chunkIndex).toBe(1);
  });

  it('deletes by source', () => {
    repo.upsert({
      id: 'emb-1',
      companyId: 'co-1',
      sourceType: 'message',
      sourceId: 'msg-1',
      chunkIndex: 0,
      contentText: 'text',
      embedding: fakeEmbedding(),
      createdAt: 1000,
    });
    expect(repo.deleteBySource('msg-1')).toBe(1);
    expect(repo.getById('emb-1')).toBeNull();
  });

  it('lists by company', () => {
    repo.upsert({
      id: 'emb-1',
      companyId: 'co-1',
      sourceType: 'message',
      sourceId: 'msg-1',
      chunkIndex: 0,
      contentText: 'text',
      embedding: fakeEmbedding(),
      createdAt: 1000,
    });
    expect(repo.listByCompany('co-1')).toHaveLength(1);
    expect(repo.listByCompany('co-2')).toHaveLength(0);
  });

  it('counts by company', () => {
    repo.upsert({
      id: 'emb-1',
      companyId: 'co-1',
      sourceType: 'message',
      sourceId: 'msg-1',
      chunkIndex: 0,
      contentText: 'text',
      embedding: fakeEmbedding(),
      createdAt: 1000,
    });
    expect(repo.countByCompany('co-1')).toBe(1);
    expect(repo.countByCompany('co-2')).toBe(0);
  });
});
