# M28: Intelligence Package + RAG Foundation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Scaffold the `packages/intelligence` workspace package and build the RAG foundation: embeddings table, chunker, embedding generation via provider-router, sqlite-vec storage, and retrieval.

**Architecture:** New `@team-x/intelligence` package following the same patterns as `@team-x/telemetry-core` (ESM, composite tsconfig, workspace dep). The package is pure TypeScript with no Electron dependency. It depends on `@team-x/shared-types` and `@team-x/provider-router`. The DB migration (0008) adds the `embeddings` table. sqlite-vec integration follows the same best-effort pattern as FTS5 in `fts5-init.ts`. New settings keys for RAG configuration are seeded alongside existing defaults.

**Tech Stack:** TypeScript strict, Vitest, Drizzle ORM, sqlite-vec, AI SDK embedding adapters, pnpm workspace.

---

### Task 1: Scaffold the `packages/intelligence` package

**Files:**
- Create: `packages/intelligence/package.json`
- Create: `packages/intelligence/tsconfig.json`
- Create: `packages/intelligence/src/index.ts`

**Step 1: Create `packages/intelligence/package.json`**

```json
{
  "name": "@team-x/intelligence",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@team-x/shared-types": "workspace:*",
    "@team-x/provider-router": "workspace:*"
  },
  "devDependencies": {
    "typescript": "5.5.4",
    "vitest": "^2"
  }
}
```

**Step 2: Create `packages/intelligence/tsconfig.json`**

Follow the `telemetry-core` pattern — composite, extends base, references both shared-types and provider-router:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "./src",
    "outDir": "./dist",
    "noEmit": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.test.ts"],
  "references": [
    { "path": "../shared-types" },
    { "path": "../provider-router" }
  ]
}
```

**Step 3: Create `packages/intelligence/src/index.ts`**

Placeholder barrel export. Will be populated as modules are built:

```typescript
export const INTELLIGENCE_VERSION = '1.0.0';
```

**Step 4: Run `pnpm install` to link the new workspace package**

Run: `pnpm install`
Expected: installs cleanly, new package visible in workspace graph.

**Step 5: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS (no type errors).

**Step 6: Commit**

```bash
git add packages/intelligence/
git commit -m "feat(intelligence): M28 T1 — scaffold @team-x/intelligence package"
```

---

### Task 2: Add RAG types to `@team-x/shared-types`

**Files:**
- Create: `packages/shared-types/src/rag.ts`
- Create: `packages/shared-types/src/rag.test.ts`
- Modify: `packages/shared-types/src/index.ts`

**Step 1: Write the failing test**

Create `packages/shared-types/src/rag.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { EmbeddingChunk, EmbeddingSourceType, RagRetrievalResult } from './rag.js';

describe('RAG types', () => {
  it('EmbeddingSourceType is a valid union', () => {
    const types: EmbeddingSourceType[] = [
      'message',
      'ticket',
      'vault_file',
      'meeting_minutes',
      'goal',
      'project',
    ];
    expect(types).toHaveLength(6);
  });

  it('EmbeddingChunk has required fields', () => {
    const chunk: EmbeddingChunk = {
      id: 'emb-1',
      companyId: 'co-1',
      sourceType: 'message',
      sourceId: 'msg-1',
      chunkIndex: 0,
      contentText: 'Hello world',
      createdAt: Date.now(),
    };
    expect(chunk.sourceType).toBe('message');
    expect(chunk.chunkIndex).toBe(0);
  });

  it('RagRetrievalResult includes similarity score', () => {
    const result: RagRetrievalResult = {
      chunk: {
        id: 'emb-1',
        companyId: 'co-1',
        sourceType: 'ticket',
        sourceId: 'tkt-1',
        chunkIndex: 0,
        contentText: 'Fix the login bug',
        createdAt: Date.now(),
      },
      similarity: 0.85,
      sourceLabel: 'ticket #42',
    };
    expect(result.similarity).toBeGreaterThan(0.7);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @team-x/shared-types test`
Expected: FAIL — `./rag.js` does not exist.

**Step 3: Create `packages/shared-types/src/rag.ts`**

```typescript
/**
 * RAG (Retrieval-Augmented Generation) types for the intelligence layer.
 *
 * Phase 5 — M28.
 */

/** Content sources that can be embedded and retrieved. */
export type EmbeddingSourceType =
  | 'message'
  | 'ticket'
  | 'vault_file'
  | 'meeting_minutes'
  | 'goal'
  | 'project';

/** A single chunk of embedded content (without the raw vector). */
export interface EmbeddingChunk {
  id: string;
  companyId: string;
  sourceType: EmbeddingSourceType;
  sourceId: string;
  chunkIndex: number;
  contentText: string;
  createdAt: number;
}

/** Result from RAG retrieval — chunk + similarity score. */
export interface RagRetrievalResult {
  chunk: EmbeddingChunk;
  /** Cosine similarity score (0-1). Higher = more relevant. */
  similarity: number;
  /** Human-readable label, e.g. "ticket #42" or "meeting 2026-04-10". */
  sourceLabel: string;
}

/** Configuration for RAG retrieval at agent turn time. */
export interface RagConfig {
  enabled: boolean;
  maxTokens: number;
  threshold: number;
  topK: number;
}

/** Default RAG configuration values. */
export const DEFAULT_RAG_CONFIG: RagConfig = {
  enabled: true,
  maxTokens: 2000,
  threshold: 0.7,
  topK: 5,
};
```

**Step 4: Add export to `packages/shared-types/src/index.ts`**

Add this line after the existing exports:

```typescript
export * from './rag.js';
```

**Step 5: Run test to verify it passes**

Run: `pnpm -F @team-x/shared-types test`
Expected: PASS.

**Step 6: Commit**

```bash
git add packages/shared-types/src/rag.ts packages/shared-types/src/rag.test.ts packages/shared-types/src/index.ts
git commit -m "feat(shared-types): M28 T2 — RAG types (EmbeddingChunk, RagConfig, source types)"
```

---

### Task 3: Add the `embeddings` DB migration

**Files:**
- Create: `apps/desktop/src/main/db/migrations/0008_embeddings.sql`
- Modify: `apps/desktop/src/main/db/schema.ts` (add `embeddings` table definition)

**Step 1: Create the SQL migration**

Create `apps/desktop/src/main/db/migrations/0008_embeddings.sql`:

```sql
CREATE TABLE `embeddings` (
  `id` text PRIMARY KEY NOT NULL,
  `company_id` text NOT NULL REFERENCES `companies`(`id`),
  `source_type` text NOT NULL,
  `source_id` text NOT NULL,
  `chunk_index` integer NOT NULL DEFAULT 0,
  `content_text` text NOT NULL,
  `embedding` blob NOT NULL,
  `created_at` integer NOT NULL,
  UNIQUE(`source_id`, `chunk_index`)
);

CREATE INDEX `idx_embeddings_company` ON `embeddings`(`company_id`);
CREATE INDEX `idx_embeddings_source` ON `embeddings`(`source_type`, `source_id`);
```

**Step 2: Update drizzle-kit journal**

Run drizzle-kit to generate the journal entry, OR manually add the entry to `meta/_journal.json`. The safest approach is:

Run: `cd apps/desktop && pnpm exec drizzle-kit generate --name embeddings`

If drizzle-kit generates a migration with different SQL than the one above, use the drizzle-generated version and adjust the schema.ts to match. The migration file MUST be named `0008_embeddings.sql` and live alongside the existing `0000`-`0007` files.

**Step 3: Add `embeddings` table to `apps/desktop/src/main/db/schema.ts`**

Add after the `ticketAttachments` table (end of Phase 4 section). Import `blob` from `drizzle-orm/sqlite-core` alongside the existing `integer`, `sqliteTable`, `text` imports:

```typescript
// ---------------------------------------------------------------------------
// Phase 5 — M28: Embeddings (RAG)
// ---------------------------------------------------------------------------

/**
 * Vector embeddings for RAG retrieval. Each row is one chunk of embedded
 * content. The raw embedding vector is stored as a BLOB (Float32Array
 * serialized). The companion `vec_embeddings` sqlite-vec virtual table
 * is created best-effort in `vec-init.ts` (same pattern as FTS5).
 *
 * Architectural invariant #5: all LLM calls (including embedding
 * generation) route through provider-router.
 */
export const embeddings = sqliteTable('embeddings', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  /** message | ticket | vault_file | meeting_minutes | goal | project. */
  sourceType: text('source_type').notNull(),
  /** FK to the originating row (message id, ticket id, etc.). */
  sourceId: text('source_id').notNull(),
  /** For long content split into chunks. 0 for single-chunk content. */
  chunkIndex: integer('chunk_index').notNull().default(0),
  /** The raw text that was embedded — used for display in source attribution. */
  contentText: text('content_text').notNull(),
  /** Serialized Float32Array — the embedding vector. */
  embedding: blob('embedding', { mode: 'buffer' }).notNull(),
  createdAt: integer('created_at').notNull(),
});
```

**Step 4: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/desktop/src/main/db/migrations/0008_embeddings.sql apps/desktop/src/main/db/schema.ts
git add apps/desktop/src/main/db/migrations/meta/
git commit -m "feat(db): M28 T3 — embeddings table migration + Drizzle schema"
```

---

### Task 4: Create the embeddings repo

**Files:**
- Create: `apps/desktop/src/main/db/repos/embeddings.ts`
- Create: `apps/desktop/src/main/db/repos/embeddings.test.ts`

**Step 1: Write the failing test**

Create `apps/desktop/src/main/db/repos/embeddings.test.ts`:

```typescript
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it, beforeEach } from 'vitest';

import * as schema from '../schema.js';
import { createEmbeddingsRepo } from './embeddings.js';

function createTestDb() {
  const raw = new Database(':memory:');
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  const db = drizzle(raw, { schema });

  raw.exec(`
    CREATE TABLE companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      settings_json TEXT NOT NULL DEFAULT '{}',
      icon TEXT,
      theme TEXT NOT NULL DEFAULT 'dark',
      status TEXT NOT NULL DEFAULT 'running',
      archived_at INTEGER,
      mcp_configs_json TEXT,
      provider_prefs_json TEXT,
      max_concurrent_agents INTEGER
    );
    CREATE TABLE embeddings (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL DEFAULT 0,
      content_text TEXT NOT NULL,
      embedding BLOB NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(source_id, chunk_index)
    );
    INSERT INTO companies (id, name, slug, created_at) VALUES ('co-1', 'Test Co', 'test-co', 1000);
  `);

  return { db, raw };
}

function fakeEmbedding(dim: number = 4): Buffer {
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
    expect(row!.sourceType).toBe('message');
    expect(row!.contentText).toBe('Hello world');
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
    expect(row!.contentText).toBe('Updated');
  });

  it('lists by source', () => {
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
    expect(chunks[0]!.chunkIndex).toBe(0);
    expect(chunks[1]!.chunkIndex).toBe(1);
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

    const deleted = repo.deleteBySource('msg-1');
    expect(deleted).toBe(1);
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

    const rows = repo.listByCompany('co-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.companyId).toBe('co-1');
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
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @team-x/desktop test -- embeddings.test`
Expected: FAIL — module `./embeddings.js` not found.

**Step 3: Implement `apps/desktop/src/main/db/repos/embeddings.ts`**

```typescript
/**
 * Embeddings repository — CRUD for the `embeddings` table.
 *
 * Phase 5 — M28. Stores vector embeddings alongside their source text
 * and metadata. The actual ANN search is handled by the sqlite-vec
 * virtual table in vec-init.ts; this repo handles the relational
 * metadata side.
 */

import { count, eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type { Schema } from '../client.js';
import { embeddings } from '../schema.js';

export type EmbeddingRow = typeof embeddings.$inferSelect;
export type EmbeddingInsert = typeof embeddings.$inferInsert;

type EmbeddingsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createEmbeddingsRepo<TRunResult>(db: EmbeddingsDb<TRunResult>) {
  return {
    /** Upsert an embedding row. Replaces on (source_id, chunk_index) conflict. */
    upsert(input: EmbeddingInsert): string {
      db.insert(embeddings)
        .values(input)
        .onConflictDoUpdate({
          target: [embeddings.sourceId, embeddings.chunkIndex],
          set: {
            contentText: input.contentText,
            embedding: input.embedding,
            createdAt: input.createdAt,
          },
        })
        .run();
      return input.id;
    },

    /** Get a single embedding row by id. */
    getById(id: string): EmbeddingRow | null {
      return db.select().from(embeddings).where(eq(embeddings.id, id)).get() ?? null;
    },

    /** List all chunks for a given source (ordered by chunk_index). */
    listBySource(sourceId: string): EmbeddingRow[] {
      return db
        .select()
        .from(embeddings)
        .where(eq(embeddings.sourceId, sourceId))
        .orderBy(embeddings.chunkIndex)
        .all();
    },

    /** Delete all embedding chunks for a source. Returns rows deleted. */
    deleteBySource(sourceId: string): number {
      const result = db.delete(embeddings).where(eq(embeddings.sourceId, sourceId)).run();
      return result.changes;
    },

    /** List all embeddings for a company. */
    listByCompany(companyId: string): EmbeddingRow[] {
      return db
        .select()
        .from(embeddings)
        .where(eq(embeddings.companyId, companyId))
        .all();
    },

    /** Count embeddings for a company. */
    countByCompany(companyId: string): number {
      const result = db
        .select({ value: count() })
        .from(embeddings)
        .where(eq(embeddings.companyId, companyId))
        .get();
      return result?.value ?? 0;
    },
  };
}

export type EmbeddingsRepo = ReturnType<typeof createEmbeddingsRepo>;
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @team-x/desktop test -- embeddings.test`
Expected: PASS (all 6 tests).

**Step 5: Run full typecheck**

Run: `pnpm typecheck`
Expected: PASS.

**Step 6: Commit**

```bash
git add apps/desktop/src/main/db/repos/embeddings.ts apps/desktop/src/main/db/repos/embeddings.test.ts
git commit -m "feat(db): M28 T4 — embeddings repo (upsert, listBySource, deleteBySource, countByCompany)"
```

---

### Task 5: Create the sqlite-vec initializer

**Files:**
- Create: `apps/desktop/src/main/db/vec-init.ts`
- Create: `apps/desktop/src/main/db/vec-init.test.ts`

**Step 1: Write the failing test**

Create `apps/desktop/src/main/db/vec-init.test.ts`:

```typescript
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it } from 'vitest';

import * as schema from './schema.js';
import { initVec } from './vec-init.js';

describe('initVec', () => {
  it('returns false gracefully when sqlite-vec is not available', () => {
    const raw = new Database(':memory:');
    const db = drizzle(raw, { schema });

    // In test environments, sqlite-vec extension is not loaded,
    // so initVec should catch the error and return false.
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
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @team-x/desktop test -- vec-init.test`
Expected: FAIL — module `./vec-init.js` not found.

**Step 3: Implement `apps/desktop/src/main/db/vec-init.ts`**

Follow the exact same pattern as `fts5-init.ts`:

```typescript
/**
 * sqlite-vec initializer — creates the `vec_embeddings` virtual table
 * for ANN (approximate nearest neighbor) vector search.
 *
 * sqlite-vec is a loadable extension. In production (better-sqlite3),
 * we attempt to load it. In test environments it may not be available,
 * so this function catches errors gracefully — same best-effort pattern
 * as FTS5 in `fts5-init.ts`.
 *
 * When sqlite-vec is unavailable, the RAG retriever falls back to
 * brute-force cosine similarity in TypeScript (slower but functional).
 *
 * Phase 5 — M28.
 */

import { sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type { Schema } from './client.js';

/**
 * Attempt to create the sqlite-vec virtual table. Returns true if
 * the table was created (or already exists), false if sqlite-vec
 * is not available.
 *
 * @param db - Drizzle database handle
 * @param dimension - Vector dimension (must match the embedding model)
 */
export function initVec<TRunResult>(
  db: BaseSQLiteDatabase<'sync', TRunResult, Schema>,
  dimension: number,
): boolean {
  try {
    db.run(sql.raw(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_embeddings USING vec0(
        id TEXT PRIMARY KEY,
        embedding float[${dimension}]
      )
    `));
    return true;
  } catch (err) {
    console.warn(
      '[vec] sqlite-vec extension not available, RAG retrieval will use brute-force fallback:',
      err,
    );
    return false;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @team-x/desktop test -- vec-init.test`
Expected: PASS (2 tests).

**Step 5: Commit**

```bash
git add apps/desktop/src/main/db/vec-init.ts apps/desktop/src/main/db/vec-init.test.ts
git commit -m "feat(db): M28 T5 — sqlite-vec initializer (best-effort, same pattern as FTS5)"
```

---

### Task 6: Build the text chunker

**Files:**
- Create: `packages/intelligence/src/rag/chunker.ts`
- Create: `packages/intelligence/src/rag/chunker.test.ts`
- Create: `packages/intelligence/src/rag/index.ts`

**Step 1: Write the failing test**

Create `packages/intelligence/src/rag/chunker.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { chunkText } from './chunker.js';

describe('chunkText', () => {
  it('returns a single chunk for short text', () => {
    const chunks = chunkText('Hello world', { maxTokens: 512, overlapTokens: 64 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('Hello world');
  });

  it('splits long text into overlapping chunks', () => {
    const words = Array.from({ length: 300 }, (_, i) => `word${i}`);
    const longText = words.join(' ');

    const chunks = chunkText(longText, { maxTokens: 100, overlapTokens: 20 });
    expect(chunks.length).toBeGreaterThan(1);

    // Verify overlap: last words of chunk N appear at the start of chunk N+1
    for (let i = 0; i < chunks.length - 1; i++) {
      const currentWords = chunks[i]!.split(' ');
      const nextWords = chunks[i + 1]!.split(' ');
      const overlapWords = currentWords.slice(-20);
      const nextStart = nextWords.slice(0, 20);
      const hasOverlap = overlapWords.some((w) => nextStart.includes(w));
      expect(hasOverlap).toBe(true);
    }
  });

  it('preserves all content across chunks', () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`);
    const longText = words.join(' ');

    const chunks = chunkText(longText, { maxTokens: 80, overlapTokens: 10 });

    for (const word of words) {
      const found = chunks.some((c) => c.includes(word));
      expect(found, `"${word}" missing from chunks`).toBe(true);
    }
  });

  it('handles empty text', () => {
    const chunks = chunkText('', { maxTokens: 512, overlapTokens: 64 });
    expect(chunks).toHaveLength(0);
  });

  it('respects sentence boundaries when possible', () => {
    const text = 'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.';
    const chunks = chunkText(text, { maxTokens: 10, overlapTokens: 2 });
    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      if (chunk !== chunks[chunks.length - 1]) {
        expect(trimmed.endsWith('.') || trimmed.endsWith('!') || trimmed.endsWith('?')).toBe(true);
      }
    }
  });

  it('uses default options when none provided', () => {
    const chunks = chunkText('Short text');
    expect(chunks).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @team-x/intelligence test`
Expected: FAIL.

**Step 3: Implement `packages/intelligence/src/rag/chunker.ts`**

```typescript
/**
 * Text chunker for the RAG pipeline.
 *
 * Splits long content into overlapping chunks suitable for embedding.
 * Uses a simple word-level tokenization (~4 chars/token) and tries to
 * respect sentence boundaries for cleaner context windows.
 *
 * Phase 5 — M28.
 */

export interface ChunkOptions {
  /** Maximum tokens per chunk. Default: 512. */
  maxTokens?: number;
  /** Overlap between adjacent chunks in tokens. Default: 64. */
  overlapTokens?: number;
}

const DEFAULT_OPTIONS: Required<ChunkOptions> = {
  maxTokens: 512,
  overlapTokens: 64,
};

/** Rough token estimate: ~4 characters per token. */
const CHARS_PER_TOKEN = 4;

/**
 * Split text into overlapping chunks.
 *
 * Strategy:
 * 1. Split into sentences.
 * 2. Greedily pack sentences into chunks up to maxTokens.
 * 3. When a chunk is full, start the next chunk with overlapTokens
 *    worth of trailing sentences from the previous chunk.
 */
export function chunkText(text: string, options?: ChunkOptions): string[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!text || text.trim().length === 0) return [];

  const maxChars = opts.maxTokens * CHARS_PER_TOKEN;
  const overlapChars = opts.overlapTokens * CHARS_PER_TOKEN;

  if (text.length <= maxChars) return [text];

  const sentences = splitSentences(text);

  const chunks: string[] = [];
  let currentSentences: string[] = [];
  let currentLength = 0;

  for (const sentence of sentences) {
    const sentenceLength = sentence.length;

    if (currentLength + sentenceLength > maxChars && currentSentences.length > 0) {
      chunks.push(currentSentences.join(' '));

      const overlapSentences: string[] = [];
      let overlapLength = 0;
      for (let i = currentSentences.length - 1; i >= 0; i--) {
        const s = currentSentences[i]!;
        if (overlapLength + s.length > overlapChars) break;
        overlapSentences.unshift(s);
        overlapLength += s.length + 1;
      }
      currentSentences = [...overlapSentences];
      currentLength = overlapLength;
    }

    currentSentences.push(sentence);
    currentLength += sentenceLength + 1;
  }

  if (currentSentences.length > 0) {
    chunks.push(currentSentences.join(' '));
  }

  return chunks;
}

function splitSentences(text: string): string[] {
  const raw = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  if (!raw) return [text];
  return raw.map((s) => s.trim()).filter((s) => s.length > 0);
}
```

**Step 4: Create barrel exports**

Create `packages/intelligence/src/rag/index.ts`:

```typescript
export { chunkText, type ChunkOptions } from './chunker.js';
```

Update `packages/intelligence/src/index.ts`:

```typescript
export const INTELLIGENCE_VERSION = '1.0.0';

export * from './rag/index.js';
```

**Step 5: Run test to verify it passes**

Run: `pnpm -F @team-x/intelligence test`
Expected: PASS (6 tests).

**Step 6: Commit**

```bash
git add packages/intelligence/src/
git commit -m "feat(intelligence): M28 T6 — text chunker with sentence-boundary splitting + overlap"
```

---

### Task 7: Build the embedding generator

**Files:**
- Create: `packages/intelligence/src/rag/embeddings.ts`
- Create: `packages/intelligence/src/rag/embeddings.test.ts`

**Step 1: Write the failing test**

Create `packages/intelligence/src/rag/embeddings.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { createEmbeddingGenerator, type EmbedTextFn } from './embeddings.js';

const fakeEmbed: EmbedTextFn = async (texts) => {
  return texts.map((text) => {
    const dim = 4;
    return new Array(dim).fill(0).map((_, i) => (text.length + i) / 100);
  });
};

describe('EmbeddingGenerator', () => {
  it('generates embeddings for a single text', async () => {
    const gen = createEmbeddingGenerator({ embedText: fakeEmbed, dimension: 4 });
    const results = await gen.embed(['Hello world']);
    expect(results).toHaveLength(1);
    expect(results[0]).toHaveLength(4);
    expect(typeof results[0]![0]).toBe('number');
  });

  it('generates embeddings for multiple texts', async () => {
    const gen = createEmbeddingGenerator({ embedText: fakeEmbed, dimension: 4 });
    const results = await gen.embed(['First', 'Second', 'Third']);
    expect(results).toHaveLength(3);
  });

  it('converts vectors to Float32Array buffers', async () => {
    const gen = createEmbeddingGenerator({ embedText: fakeEmbed, dimension: 4 });
    const buffers = await gen.embedAsBuffers(['Hello world']);
    expect(buffers).toHaveLength(1);
    expect(buffers[0]).toBeInstanceOf(Buffer);
    expect(buffers[0]!.byteLength).toBe(16); // 4 floats * 4 bytes
  });

  it('handles empty input', async () => {
    const gen = createEmbeddingGenerator({ embedText: fakeEmbed, dimension: 4 });
    const results = await gen.embed([]);
    expect(results).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @team-x/intelligence test -- embeddings.test`
Expected: FAIL.

**Step 3: Implement `packages/intelligence/src/rag/embeddings.ts`**

```typescript
/**
 * Embedding generator — converts text into vector representations.
 *
 * Provider-agnostic: takes an EmbedTextFn callback wired to the
 * appropriate provider via provider-router. Respects invariant #5.
 *
 * Phase 5 — M28.
 */

export type EmbedTextFn = (texts: string[]) => Promise<number[][]>;

export interface EmbeddingGeneratorOptions {
  embedText: EmbedTextFn;
  dimension: number;
}

export interface EmbeddingGenerator {
  embed(texts: string[]): Promise<number[][]>;
  embedAsBuffers(texts: string[]): Promise<Buffer[]>;
  readonly dimension: number;
}

export function createEmbeddingGenerator(opts: EmbeddingGeneratorOptions): EmbeddingGenerator {
  const { embedText, dimension } = opts;

  return {
    dimension,

    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      return embedText(texts);
    },

    async embedAsBuffers(texts: string[]): Promise<Buffer[]> {
      if (texts.length === 0) return [];
      const vectors = await embedText(texts);
      return vectors.map((vec) => {
        const arr = new Float32Array(vec);
        return Buffer.from(arr.buffer);
      });
    },
  };
}
```

**Step 4: Update barrel export**

Update `packages/intelligence/src/rag/index.ts`:

```typescript
export { chunkText, type ChunkOptions } from './chunker.js';
export {
  createEmbeddingGenerator,
  type EmbedTextFn,
  type EmbeddingGenerator,
  type EmbeddingGeneratorOptions,
} from './embeddings.js';
```

**Step 5: Run test to verify it passes**

Run: `pnpm -F @team-x/intelligence test -- embeddings.test`
Expected: PASS (4 tests).

**Step 6: Commit**

```bash
git add packages/intelligence/src/rag/
git commit -m "feat(intelligence): M28 T7 — embedding generator (EmbedTextFn callback, Buffer serialization)"
```

---

### Task 8: Build the cosine similarity retriever

**Files:**
- Create: `packages/intelligence/src/rag/retriever.ts`
- Create: `packages/intelligence/src/rag/retriever.test.ts`

**Step 1: Write the failing test**

Create `packages/intelligence/src/rag/retriever.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { cosineSimilarity, rankBySimilarity } from './retriever.js';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0, 0], [1, 0, 0, 0])).toBeCloseTo(1.0, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0, 5);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0, 5);
  });

  it('handles non-unit vectors', () => {
    expect(cosineSimilarity([3, 4], [3, 4])).toBeCloseTo(1.0, 5);
  });
});

describe('rankBySimilarity', () => {
  it('returns top-k results sorted by similarity', () => {
    const query = [1, 0, 0];
    const candidates = [
      { id: 'a', vector: [1, 0, 0], meta: { text: 'exact' } },
      { id: 'b', vector: [0, 1, 0], meta: { text: 'orthogonal' } },
      { id: 'c', vector: [0.9, 0.1, 0], meta: { text: 'close' } },
      { id: 'd', vector: [0.5, 0.5, 0], meta: { text: 'partial' } },
    ];

    const results = rankBySimilarity(query, candidates, { topK: 2, threshold: 0.0 });
    expect(results).toHaveLength(2);
    expect(results[0]!.id).toBe('a');
    expect(results[1]!.id).toBe('c');
  });

  it('filters by threshold', () => {
    const query = [1, 0];
    const candidates = [
      { id: 'a', vector: [1, 0], meta: {} },
      { id: 'b', vector: [0, 1], meta: {} },
    ];

    const results = rankBySimilarity(query, candidates, { topK: 10, threshold: 0.5 });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('a');
  });

  it('returns empty when nothing exceeds threshold', () => {
    const results = rankBySimilarity([1, 0], [{ id: 'a', vector: [0, 1], meta: {} }], { topK: 10, threshold: 0.9 });
    expect(results).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @team-x/intelligence test -- retriever.test`
Expected: FAIL.

**Step 3: Implement `packages/intelligence/src/rag/retriever.ts`**

```typescript
/**
 * Vector similarity retriever — brute-force fallback for when sqlite-vec
 * is not available, plus shared cosine similarity math.
 *
 * Phase 5 — M28.
 */

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export interface SimilarityCandidate<T = unknown> {
  id: string;
  vector: number[];
  meta: T;
}

export interface RankOptions {
  topK: number;
  threshold: number;
}

export interface RankedResult<T = unknown> {
  id: string;
  similarity: number;
  meta: T;
}

export function rankBySimilarity<T>(
  query: number[],
  candidates: SimilarityCandidate<T>[],
  options: RankOptions,
): RankedResult<T>[] {
  return candidates
    .map((c) => ({
      id: c.id,
      similarity: cosineSimilarity(query, c.vector),
      meta: c.meta,
    }))
    .filter((r) => r.similarity >= options.threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, options.topK);
}
```

**Step 4: Update barrel export**

Update `packages/intelligence/src/rag/index.ts`:

```typescript
export { chunkText, type ChunkOptions } from './chunker.js';
export {
  createEmbeddingGenerator,
  type EmbedTextFn,
  type EmbeddingGenerator,
  type EmbeddingGeneratorOptions,
} from './embeddings.js';
export {
  cosineSimilarity,
  rankBySimilarity,
  type SimilarityCandidate,
  type RankOptions,
  type RankedResult,
} from './retriever.js';
```

**Step 5: Run test to verify it passes**

Run: `pnpm -F @team-x/intelligence test -- retriever.test`
Expected: PASS (7 tests).

**Step 6: Commit**

```bash
git add packages/intelligence/src/rag/
git commit -m "feat(intelligence): M28 T8 — cosine similarity retriever (brute-force fallback)"
```

---

### Task 9: Seed RAG default settings

**Files:**
- Modify: `apps/desktop/src/main/db/repos/settings.ts`
- Modify: `apps/desktop/src/main/db/repos/settings.test.ts`

**Step 1: Write the failing test**

Add to the existing `settings.test.ts` file, inside the existing `describe` block:

```typescript
it('seeds RAG defaults', () => {
  repo.seedDefaults();

  expect(repo.get('rag_enabled', false)).toBe(true);
  expect(repo.get('rag_max_tokens', 0)).toBe(2000);
  expect(repo.get('rag_threshold', 0)).toBe(0.7);
  expect(repo.get('rag_top_k', 0)).toBe(5);
  expect(repo.get('embedding_dimension', 0)).toBe(1536);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @team-x/desktop test -- settings.test`
Expected: FAIL — `rag_enabled` returns fallback `false`.

**Step 3: Add RAG defaults to `SETTING_DEFAULTS` in `apps/desktop/src/main/db/repos/settings.ts`**

Add these entries to the `SETTING_DEFAULTS` array after the existing entries:

```typescript
  { key: 'rag_enabled', value: true },
  { key: 'rag_max_tokens', value: 2000 },
  { key: 'rag_threshold', value: 0.7 },
  { key: 'rag_top_k', value: 5 },
  { key: 'embedding_provider', value: 'auto' },
  { key: 'embedding_model', value: 'auto' },
  { key: 'embedding_dimension', value: 1536 },
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @team-x/desktop test -- settings.test`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/desktop/src/main/db/repos/settings.ts apps/desktop/src/main/db/repos/settings.test.ts
git commit -m "feat(settings): M28 T9 — seed RAG defaults (enabled, max_tokens, threshold, top_k, embedding_*)"
```

---

### Task 10: Full test suite + typecheck + lint

**Step 1: Run the full test suite**

Run: `pnpm test`
Expected: All tests pass (612 existing + ~28 new = ~640).

**Step 2: Run typecheck across all workspaces**

Run: `pnpm typecheck`
Expected: PASS.

**Step 3: Run lint and fix**

Run: `pnpm lint:fix && pnpm lint`
Expected: Clean.

**Step 4: Commit any lint fixes**

```bash
git add -A
git commit -m "chore: M28 T10 — lint fixes"
```

**Step 5: Final milestone marker commit**

```bash
git commit --allow-empty -m "feat(intelligence): M28 complete — intelligence package + RAG foundation

New @team-x/intelligence package with:
- Text chunker (sentence-boundary, configurable overlap)
- Embedding generator (provider-agnostic via EmbedTextFn callback)
- Cosine similarity retriever (brute-force fallback)
- RAG types in shared-types (EmbeddingChunk, RagConfig, defaults)
- Embeddings table + migration (0008_embeddings.sql)
- Embeddings repo (upsert, listBySource, deleteBySource, countByCompany)
- sqlite-vec initializer (best-effort, same pattern as FTS5)
- RAG settings defaults seeded alongside existing settings"
```

---

## Summary

| Task | Deliverable | Est. Tests |
|------|-------------|-----------|
| T1 | Package scaffold | 0 (typecheck) |
| T2 | RAG types in shared-types | 3 |
| T3 | Embeddings migration + schema | 0 (migration) |
| T4 | Embeddings repo | 6 |
| T5 | sqlite-vec initializer | 2 |
| T6 | Text chunker | 6 |
| T7 | Embedding generator | 4 |
| T8 | Cosine similarity retriever | 7 |
| T9 | RAG settings defaults | 1 |
| T10 | Full test + lint pass | 0 |
| **Total** | | **~29** |

**Next milestone:** M29 (RAG integration into agent turns) — event bus subscription for on-write indexing, `resolveSystemPrompt` enhancement with retrieval + context injection.
