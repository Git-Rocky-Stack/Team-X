import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../schema.js';
import { createEmbeddingsRepo } from './embeddings.js';

function createTestDb() {
  const raw = new Database(':memory:');
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  const db = drizzle(raw, { schema });

  // Create minimal tables needed for embeddings tests
  raw.exec(
    [
      'CREATE TABLE companies (',
      '  id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,',
      '  created_at INTEGER NOT NULL, settings_json TEXT NOT NULL DEFAULT "{}",',
      '  icon TEXT, theme TEXT NOT NULL DEFAULT "dark", status TEXT NOT NULL DEFAULT "running",',
      '  archived_at INTEGER, mcp_configs_json TEXT, provider_prefs_json TEXT, max_concurrent_agents INTEGER',
      ');',
      'CREATE TABLE embeddings (',
      '  id TEXT PRIMARY KEY, company_id TEXT NOT NULL, source_type TEXT NOT NULL,',
      '  source_id TEXT NOT NULL, chunk_index INTEGER NOT NULL DEFAULT 0,',
      '  content_text TEXT NOT NULL, embedding BLOB NOT NULL, created_at INTEGER NOT NULL,',
      '  UNIQUE(source_id, chunk_index)',
      ');',
      "INSERT INTO companies (id, name, slug, created_at) VALUES ('co-1', 'Test Co', 'test-co', 1000);",
    ].join('\n'),
  );

  return { db, raw };
}

function fakeEmbedding(dim = 4): Buffer {
  const arr = new Float32Array(dim);
  for (let i = 0; i < dim; i++) arr[i] = Math.random();
  return Buffer.from(arr.buffer);
}

describe('EmbeddingsRepo', () => {
  let repo: ReturnType<typeof createEmbeddingsRepo>;

  beforeEach(() => {
    const { db } = createTestDb();
    repo = createEmbeddingsRepo(db);
  });

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
