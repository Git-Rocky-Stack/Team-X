# M29: RAG Integration into Agent Turns — Implementation Plan

**Milestone:** M29 (Phase 5 — Intelligence Layer)
**Date:** 2026-04-13
**Author:** Rocky Elsalaymeh + Claude
**Status:** Approved
**Depends on:** M28 (Intelligence package + RAG foundation)

---

## Overview

M28 landed the foundation: the `@team-x/intelligence` package (chunker + embedder + retriever), the `embeddings` table + repo, RAG types in `shared-types`, RAG settings defaults, and best-effort `sqlite-vec` init. Nothing is wired up yet.

M29 wires it end-to-end:

1. **On-write indexing.** The intelligence layer subscribes to the event bus. When a message, ticket, meeting minutes block, goal, project, or vault text blob lands, the indexer chunks it, embeds it via a provider-router `embedText` adapter, and upserts rows into the `embeddings` table.
2. **Retrieval at agent turn time.** `resolveSystemPrompt` is extended (not replaced) to accept `threadId`. At turn time, we pull the last user-query seed (last 1–2 user messages in the thread), embed it, retrieve top-K relevant chunks filtered to the same `companyId`, dedup against in-thread history, enforce a token budget, and append an attributed `## Relevant Context` block to the system prompt.
3. **Settings surface.** Settings gets a new RAG panel: enable toggle, provider/model/dimension picker, top-K + threshold + max-tokens controls, a "rebuild embeddings" action, and a live stat panel (row count, last indexed, storage size).

### Invariants preserved

- **Invariant #1** (renderer = pure view): all wiring in main; IPC for status + rebuild only.
- **Invariant #5** (provider-router is the only LLM seam): embedding calls go through a new `embedText` export in `@team-x/provider-router`; the intelligence package never imports `@ai-sdk/*` directly.
- **Invariant #6** (events append-only): the indexer is a *subscriber*, never mutates the events table.
- **Invariant #7** (zero phone-home): embeddings run through the configured provider; default is local Ollama.
- **Invariant #10** (adaptive strategy): when `rag_enabled=false` or no embedding provider is configured, `resolveSystemPrompt` short-circuits to the plain rendered role.md prompt. Zero regressions for existing chat flows.

### Success criteria

- `pnpm test` green. Target: +25 new tests (~665 total).
- `pnpm typecheck` clean.
- `pnpm lint` — 0 errors; warning baseline (41 `noNonNullAssertion`) preserved.
- Manual smoke: file a ticket describing a known fact, create a new chat thread, ask about the fact — agent answer includes the fact with `[Source: ticket #N]` attribution.
- New E2E spec: `rag-flow.spec.ts` — two-thread recall round-trip under the canned test-mode provider (embed stub + retrieval wiring verified).

---

## Task 1: Add `embedText` to `@team-x/provider-router`

**Files:**
- Create: `packages/provider-router/src/embed.ts`
- Create: `packages/provider-router/src/embed.test.ts`
- Create: `packages/provider-router/src/adapters/ollama-embed.ts`
- Create: `packages/provider-router/src/adapters/openai-embed.ts`
- Modify: `packages/provider-router/src/index.ts` (barrel)

### Step 1: Write the failing test

Create `packages/provider-router/src/embed.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { createEmbedText, type EmbedAdapter } from './embed.js';

describe('createEmbedText', () => {
  it('delegates to the adapter for a single text', async () => {
    const adapter: EmbedAdapter = {
      model: 'test-model',
      dimension: 4,
      embed: vi.fn(async (texts) => texts.map(() => [0.1, 0.2, 0.3, 0.4])),
    };
    const embed = createEmbedText(adapter);
    const result = await embed(['hello']);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(adapter.embed).toHaveBeenCalledWith(['hello']);
  });

  it('returns empty for empty input without calling adapter', async () => {
    const adapter: EmbedAdapter = {
      model: 'test-model',
      dimension: 4,
      embed: vi.fn(),
    };
    const embed = createEmbedText(adapter);
    const result = await embed([]);
    expect(result).toEqual([]);
    expect(adapter.embed).not.toHaveBeenCalled();
  });

  it('throws if adapter returns wrong dimension', async () => {
    const adapter: EmbedAdapter = {
      model: 'test-model',
      dimension: 4,
      embed: async () => [[0.1, 0.2]],
    };
    const embed = createEmbedText(adapter);
    await expect(embed(['x'])).rejects.toThrow(/dimension/i);
  });

  it('throws if adapter returns wrong count', async () => {
    const adapter: EmbedAdapter = {
      model: 'test-model',
      dimension: 2,
      embed: async () => [[0.1, 0.2]],
    };
    const embed = createEmbedText(adapter);
    await expect(embed(['x', 'y'])).rejects.toThrow(/count/i);
  });
});
```

### Step 2: Run test to verify FAIL

```bash
pnpm -F @team-x/provider-router test -- embed.test
```
Expected: FAIL (module not found).

### Step 3: Implement `packages/provider-router/src/embed.ts`

```typescript
/**
 * Embedding interface — the provider-router's single seam for
 * turning text into vectors. Mirrors the `ProviderStreamFn` pattern
 * for chat: a minimal adapter contract, a pure factory that enforces
 * invariants (dimension + count), and zero coupling to any specific
 * provider SDK outside the adapter files.
 *
 * Phase 5 — M29.
 */

export interface EmbedAdapter {
  readonly model: string;
  readonly dimension: number;
  embed(texts: string[]): Promise<number[][]>;
}

export type EmbedTextFn = (texts: string[]) => Promise<number[][]>;

export function createEmbedText(adapter: EmbedAdapter): EmbedTextFn {
  return async (texts: string[]): Promise<number[][]> => {
    if (texts.length === 0) return [];
    const vectors = await adapter.embed(texts);

    if (vectors.length !== texts.length) {
      throw new Error(
        `embedText: adapter returned ${vectors.length} vectors for ${texts.length} inputs (count mismatch)`,
      );
    }
    for (let i = 0; i < vectors.length; i++) {
      if (vectors[i].length !== adapter.dimension) {
        throw new Error(
          `embedText: vector ${i} has dimension ${vectors[i].length}, expected ${adapter.dimension}`,
        );
      }
    }
    return vectors;
  };
}
```

### Step 4: Implement the Ollama embedding adapter

Create `packages/provider-router/src/adapters/ollama-embed.ts`:

```typescript
/**
 * Ollama embedding adapter. Calls `/api/embed` on a local Ollama
 * instance. Default dimension for `nomic-embed-text` is 768.
 *
 * Phase 5 — M29.
 */

import type { EmbedAdapter } from '../embed.js';

export interface OllamaEmbedAdapterOptions {
  baseURL?: string;
  model: string;
  dimension: number;
  fetchImpl?: typeof fetch;
}

export function makeOllamaEmbedAdapter(opts: OllamaEmbedAdapterOptions): EmbedAdapter {
  const baseURL = opts.baseURL ?? 'http://127.0.0.1:11434';
  const fetchImpl = opts.fetchImpl ?? fetch;

  return {
    model: opts.model,
    dimension: opts.dimension,
    async embed(texts: string[]): Promise<number[][]> {
      const response = await fetchImpl(`${baseURL}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: opts.model, input: texts }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Ollama /api/embed failed: ${response.status} ${body}`);
      }
      const json = (await response.json()) as { embeddings?: number[][] };
      if (!json.embeddings || !Array.isArray(json.embeddings)) {
        throw new Error('Ollama /api/embed returned no embeddings array');
      }
      return json.embeddings;
    },
  };
}
```

### Step 5: Implement the OpenAI embedding adapter

Create `packages/provider-router/src/adapters/openai-embed.ts`:

```typescript
/**
 * OpenAI embedding adapter. Uses `text-embedding-3-small` (1536-dim)
 * by default. Compatible with any OpenAI-style endpoint (OpenAI,
 * Together, Fireworks, OpenRouter, OpenAI-compat).
 *
 * Phase 5 — M29.
 */

import type { EmbedAdapter } from '../embed.js';

export interface OpenAIEmbedAdapterOptions {
  apiKey: string;
  model: string;
  dimension: number;
  baseURL?: string;
  fetchImpl?: typeof fetch;
}

export function makeOpenAIEmbedAdapter(opts: OpenAIEmbedAdapterOptions): EmbedAdapter {
  const baseURL = opts.baseURL ?? 'https://api.openai.com/v1';
  const fetchImpl = opts.fetchImpl ?? fetch;

  return {
    model: opts.model,
    dimension: opts.dimension,
    async embed(texts: string[]): Promise<number[][]> {
      const response = await fetchImpl(`${baseURL}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({ model: opts.model, input: texts }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`OpenAI /embeddings failed: ${response.status} ${body}`);
      }
      const json = (await response.json()) as {
        data?: Array<{ embedding: number[]; index: number }>;
      };
      if (!json.data) throw new Error('OpenAI /embeddings returned no data array');
      // OpenAI returns data sorted by index; be defensive.
      return [...json.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    },
  };
}
```

### Step 6: Update barrel export

Modify `packages/provider-router/src/index.ts`:

```typescript
// existing exports ...
export { createEmbedText, type EmbedAdapter, type EmbedTextFn } from './embed.js';
export { makeOllamaEmbedAdapter, type OllamaEmbedAdapterOptions } from './adapters/ollama-embed.js';
export { makeOpenAIEmbedAdapter, type OpenAIEmbedAdapterOptions } from './adapters/openai-embed.js';
```

### Step 7: Run tests to verify PASS

```bash
pnpm -F @team-x/provider-router test -- embed.test
```
Expected: PASS (4 tests).

### Step 8: Commit

```bash
git add packages/provider-router/
git commit -m "feat(provider-router): M29 T1 — embedText + Ollama/OpenAI embedding adapters"
```

---

## Task 2: Extend `ResolveSystemPrompt` to accept `threadId`

**Rationale:** The existing signature is `({ employee, company }) => Promise<string>`. To inject RAG context at turn time, the resolver needs the thread id to seed the query vector from recent user messages.

**Files:**
- Modify: `apps/desktop/src/main/orchestrator/index.ts`
- Modify: `apps/desktop/src/main/orchestrator/orchestrator.test.ts`
- Modify: `apps/desktop/src/main/orchestrator/meeting-service.test.ts`
- Modify: `apps/desktop/src/main/index.ts` (composition root call-site)

### Step 1: Update the type

In `apps/desktop/src/main/orchestrator/index.ts`, change:

```typescript
export type ResolveSystemPrompt = (args: {
  employee: EmployeeRow;
  company: CompanyRow;
  threadId: string;
}) => Promise<string>;
```

### Step 2: Update both call sites in `orchestrator/index.ts`

Both `enqueueChat` and `enqueueAgentReply` already have `args.threadId` in scope — pass it through:

```typescript
const system = await resolveSystemPrompt({
  employee,
  company,
  threadId: args.threadId,
});
```

### Step 3: Update existing tests

In `orchestrator.test.ts`, update `defaultResolveSystem` and any inline overrides to accept the new shape. The `systemPromptCalls` trace should gain a `threadId` field so the new wiring can be asserted.

In `meeting-service.test.ts`, update the stub:

```typescript
resolveSystemPrompt: async ({ employee }) => `You are ${employee.name}.`,
// — signature stays structurally compatible because threadId is ignored.
```

### Step 4: Run the orchestrator test suite

```bash
pnpm -F @team-x/desktop test -- orchestrator
```
Expected: PASS. Asserts the new threadId is threaded through.

### Step 5: Commit

```bash
git add apps/desktop/src/main/orchestrator/
git commit -m "feat(orchestrator): M29 T2 — extend ResolveSystemPrompt with threadId"
```

---

## Task 3: `RagService` in `@team-x/intelligence`

**Rationale:** A single facade that composes chunker + embedder + retriever + repo reads. Two surface methods: `indexSource()` and `retrieve()`. Everything RAG-related in `resolveSystemPrompt` and the indexer goes through this service — no direct chunker/retriever plumbing outside the package.

**Files:**
- Create: `packages/intelligence/src/rag/service.ts`
- Create: `packages/intelligence/src/rag/service.test.ts`
- Modify: `packages/intelligence/src/rag/index.ts` (barrel)

### Step 1: Write the failing test

Create `packages/intelligence/src/rag/service.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { createRagService, type RagRepo } from './service.js';
import type { EmbedTextFn } from './embeddings.js';

const fakeEmbed: EmbedTextFn = async (texts) =>
  texts.map((t) => [t.length % 10, (t.length * 2) % 10, 1, 0]);

function makeFakeRepo(): RagRepo & { rows: Map<string, unknown[]> } {
  const rows = new Map<string, unknown[]>();
  return {
    rows,
    upsert(row): string {
      const list = (rows.get(row.companyId) ?? []) as unknown[];
      list.push(row);
      rows.set(row.companyId, list);
      return row.id;
    },
    deleteBySource(sourceId): number {
      let removed = 0;
      for (const [cid, list] of rows.entries()) {
        const filtered = (list as Array<{ sourceId: string }>).filter((r) => r.sourceId !== sourceId);
        removed += list.length - filtered.length;
        rows.set(cid, filtered);
      }
      return removed;
    },
    listByCompany(companyId) {
      return (rows.get(companyId) ?? []) as never[];
    },
  };
}

describe('RagService.indexSource', () => {
  it('chunks, embeds and upserts a document', async () => {
    const repo = makeFakeRepo();
    const svc = createRagService({
      embedText: fakeEmbed,
      dimension: 4,
      repo,
      chunker: { maxTokens: 64, overlapTokens: 8 },
    });
    await svc.indexSource({
      companyId: 'c1',
      sourceType: 'message',
      sourceId: 'm1',
      content: 'Hello world. This is a message.',
    });
    expect(repo.listByCompany('c1').length).toBeGreaterThan(0);
  });

  it('replaces existing chunks on re-index (deleteBySource first)', async () => {
    const repo = makeFakeRepo();
    const svc = createRagService({
      embedText: fakeEmbed,
      dimension: 4,
      repo,
      chunker: { maxTokens: 64, overlapTokens: 8 },
    });
    await svc.indexSource({ companyId: 'c1', sourceType: 'message', sourceId: 'm1', content: 'v1' });
    await svc.indexSource({ companyId: 'c1', sourceType: 'message', sourceId: 'm1', content: 'v2' });
    const rows = repo.listByCompany('c1') as Array<{ contentText: string }>;
    expect(rows.every((r) => r.contentText.includes('v2'))).toBe(true);
  });

  it('skips empty content without embedding', async () => {
    const repo = makeFakeRepo();
    const embed = vi.fn(fakeEmbed);
    const svc = createRagService({
      embedText: embed,
      dimension: 4,
      repo,
      chunker: { maxTokens: 64, overlapTokens: 8 },
    });
    await svc.indexSource({ companyId: 'c1', sourceType: 'message', sourceId: 'm1', content: '   ' });
    expect(embed).not.toHaveBeenCalled();
    expect(repo.listByCompany('c1').length).toBe(0);
  });
});

describe('RagService.retrieve', () => {
  it('returns top-K results above threshold, filtered by company', async () => {
    const repo = makeFakeRepo();
    const svc = createRagService({
      embedText: fakeEmbed,
      dimension: 4,
      repo,
      chunker: { maxTokens: 64, overlapTokens: 8 },
    });
    await svc.indexSource({ companyId: 'c1', sourceType: 'message', sourceId: 'a', content: 'Apples' });
    await svc.indexSource({ companyId: 'c1', sourceType: 'message', sourceId: 'b', content: 'Oranges' });
    await svc.indexSource({ companyId: 'c2', sourceType: 'message', sourceId: 'c', content: 'Apples' });

    const results = await svc.retrieve({
      companyId: 'c1',
      query: 'apples',
      topK: 5,
      threshold: 0.0,
    });
    expect(results.every((r) => r.sourceId === 'a' || r.sourceId === 'b')).toBe(true);
  });

  it('returns empty when threshold is too high', async () => {
    const repo = makeFakeRepo();
    const svc = createRagService({
      embedText: fakeEmbed,
      dimension: 4,
      repo,
      chunker: { maxTokens: 64, overlapTokens: 8 },
    });
    await svc.indexSource({ companyId: 'c1', sourceType: 'message', sourceId: 'a', content: 'Apples' });
    const results = await svc.retrieve({
      companyId: 'c1',
      query: 'orange',
      topK: 5,
      threshold: 0.999,
    });
    expect(results).toHaveLength(0);
  });
});
```

### Step 2: Run test to verify FAIL

```bash
pnpm -F @team-x/intelligence test -- service.test
```
Expected: FAIL.

### Step 3: Implement `packages/intelligence/src/rag/service.ts`

```typescript
/**
 * RagService — the one-call facade used by both the on-write indexer
 * and the agent-turn retriever. Composes chunker + embedder + repo.
 *
 * Phase 5 — M29.
 */

import type { EmbeddingSourceType } from '@team-x/shared-types';

import { chunkText, type ChunkOptions } from './chunker.js';
import type { EmbedTextFn } from './embeddings.js';
import { cosineSimilarity } from './retriever.js';

export interface RagEmbeddingRow {
  id: string;
  companyId: string;
  sourceType: EmbeddingSourceType;
  sourceId: string;
  chunkIndex: number;
  contentText: string;
  embedding: Buffer;
  createdAt: number;
}

export interface RagUpsertInput {
  id: string;
  companyId: string;
  sourceType: EmbeddingSourceType;
  sourceId: string;
  chunkIndex: number;
  contentText: string;
  embedding: Buffer;
  createdAt: number;
}

/**
 * Structural interface the service needs from the embeddings repo.
 * Matches `createEmbeddingsRepo` return value shape; a fake can be
 * a plain object with these three methods.
 */
export interface RagRepo {
  upsert(input: RagUpsertInput): string;
  deleteBySource(sourceId: string): number;
  listByCompany(companyId: string): RagEmbeddingRow[];
}

export interface RagServiceOptions {
  embedText: EmbedTextFn;
  dimension: number;
  repo: RagRepo;
  chunker?: ChunkOptions;
  now?: () => number;
  idGen?: () => string;
}

export interface IndexSourceInput {
  companyId: string;
  sourceType: EmbeddingSourceType;
  sourceId: string;
  content: string;
}

export interface RetrieveInput {
  companyId: string;
  query: string;
  topK: number;
  threshold: number;
  excludeSourceIds?: string[];
}

export interface RetrievalHit {
  sourceType: EmbeddingSourceType;
  sourceId: string;
  chunkIndex: number;
  contentText: string;
  similarity: number;
}

export interface RagService {
  indexSource(input: IndexSourceInput): Promise<number>;
  retrieve(input: RetrieveInput): Promise<RetrievalHit[]>;
  deleteBySource(sourceId: string): number;
}

function bufferToFloatArray(buf: Buffer): number[] {
  const view = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return Array.from(view);
}

function floatArrayToBuffer(vec: number[]): Buffer {
  return Buffer.from(new Float32Array(vec).buffer);
}

export function createRagService(opts: RagServiceOptions): RagService {
  const now = opts.now ?? Date.now;
  const idGen =
    opts.idGen ?? (() => `emb_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`);
  const chunkerOpts: ChunkOptions = opts.chunker ?? { maxTokens: 512, overlapTokens: 64 };

  return {
    async indexSource(input: IndexSourceInput): Promise<number> {
      if (!input.content.trim()) return 0;

      const chunks = chunkText(input.content, chunkerOpts);
      if (chunks.length === 0) return 0;

      // Upsert is idempotent on (sourceId, chunkIndex), but a shorter
      // re-index (fewer chunks than last time) would leave stale rows.
      // Delete first, then bulk re-add.
      opts.repo.deleteBySource(input.sourceId);

      const vectors = await opts.embedText(chunks.map((c) => c.text));
      const ts = now();

      for (let i = 0; i < chunks.length; i++) {
        opts.repo.upsert({
          id: idGen(),
          companyId: input.companyId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          chunkIndex: i,
          contentText: chunks[i].text,
          embedding: floatArrayToBuffer(vectors[i]),
          createdAt: ts,
        });
      }

      return chunks.length;
    },

    async retrieve(input: RetrieveInput): Promise<RetrievalHit[]> {
      if (!input.query.trim()) return [];

      const [queryVector] = await opts.embedText([input.query]);
      if (!queryVector) return [];

      const rows = opts.repo.listByCompany(input.companyId);
      const exclude = new Set(input.excludeSourceIds ?? []);

      const ranked: RetrievalHit[] = [];
      for (const row of rows) {
        if (exclude.has(row.sourceId)) continue;
        const similarity = cosineSimilarity(queryVector, bufferToFloatArray(row.embedding));
        if (similarity < input.threshold) continue;
        ranked.push({
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          chunkIndex: row.chunkIndex,
          contentText: row.contentText,
          similarity,
        });
      }

      ranked.sort((a, b) => b.similarity - a.similarity);
      return ranked.slice(0, input.topK);
    },

    deleteBySource(sourceId: string): number {
      return opts.repo.deleteBySource(sourceId);
    },
  };
}
```

### Step 4: Update barrel

Modify `packages/intelligence/src/rag/index.ts`:

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
export {
  createRagService,
  type RagService,
  type RagServiceOptions,
  type RagRepo,
  type RagEmbeddingRow,
  type RagUpsertInput,
  type IndexSourceInput,
  type RetrieveInput,
  type RetrievalHit,
} from './service.js';
```

### Step 5: Run test to verify PASS

```bash
pnpm -F @team-x/intelligence test -- service.test
```
Expected: PASS (5 tests).

### Step 6: Commit

```bash
git add packages/intelligence/
git commit -m "feat(intelligence): M29 T3 — RagService (index + retrieve facade)"
```

---

## Task 4: `RagIndexer` — event-bus subscriber

**Files:**
- Create: `apps/desktop/src/main/services/rag-indexer.ts`
- Create: `apps/desktop/src/main/services/rag-indexer.test.ts`

### Step 1: Write the failing test

Create `apps/desktop/src/main/services/rag-indexer.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { createRagIndexer, type RagIndexerDeps } from './rag-indexer.js';
import type { DashboardEvent } from '@team-x/shared-types';

function makeFakeBus() {
  const listeners: Array<(e: DashboardEvent) => void> = [];
  return {
    listeners,
    subscribe(fn: (e: DashboardEvent) => void) {
      listeners.push(fn);
      return () => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    emit(e: DashboardEvent) {
      for (const fn of listeners) fn(e);
    },
  };
}

function makeDeps(overrides: Partial<RagIndexerDeps> = {}): RagIndexerDeps & {
  indexed: Array<{ sourceType: string; sourceId: string; content: string }>;
} {
  const indexed: Array<{ sourceType: string; sourceId: string; content: string }> = [];
  const bus = makeFakeBus();
  return {
    bus,
    indexed,
    service: {
      indexSource: vi.fn(async (input) => {
        indexed.push({
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          content: input.content,
        });
        return 1;
      }),
      retrieve: vi.fn(),
      deleteBySource: vi.fn(() => 0),
    },
    getMessage: vi.fn((id: string) => ({
      id,
      threadId: 't1',
      authorId: 'e1',
      authorKind: 'employee' as const,
      content: `fetched:${id}`,
      createdAt: 1,
    })),
    getCompanyIdForThread: vi.fn(() => 'c1'),
    isEnabled: () => true,
    logger: { error: vi.fn(), info: vi.fn() },
    ...overrides,
  };
}

describe('RagIndexer', () => {
  it('indexes message content on work.completed', async () => {
    const deps = makeDeps();
    const indexer = createRagIndexer(deps);
    indexer.start();

    deps.bus.emit({
      id: 'evt1',
      type: 'work.completed',
      companyId: 'c1',
      actorId: 'e1',
      actorKind: 'employee',
      payload: { threadId: 't1', employeeId: 'e1', messageId: 'm1' },
      createdAt: Date.now(),
    });

    // Give microtask queue a tick for async service call.
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.indexed).toContainEqual({
      sourceType: 'message',
      sourceId: 'm1',
      content: 'fetched:m1',
    });
  });

  it('no-ops when indexer is disabled', async () => {
    const deps = makeDeps({ isEnabled: () => false });
    const indexer = createRagIndexer(deps);
    indexer.start();

    deps.bus.emit({
      id: 'evt1',
      type: 'work.completed',
      companyId: 'c1',
      actorId: 'e1',
      actorKind: 'employee',
      payload: { threadId: 't1', employeeId: 'e1', messageId: 'm1' },
      createdAt: Date.now(),
    });

    await Promise.resolve();
    expect(deps.indexed).toHaveLength(0);
  });

  it('unsubscribe stops further indexing', async () => {
    const deps = makeDeps();
    const indexer = createRagIndexer(deps);
    indexer.start();
    indexer.stop();

    deps.bus.emit({
      id: 'evt1',
      type: 'work.completed',
      companyId: 'c1',
      actorId: 'e1',
      actorKind: 'employee',
      payload: { threadId: 't1', employeeId: 'e1', messageId: 'm1' },
      createdAt: Date.now(),
    });

    await Promise.resolve();
    expect(deps.indexed).toHaveLength(0);
  });

  it('errors in indexSource are caught and logged, not thrown', async () => {
    const deps = makeDeps();
    deps.service.indexSource = vi.fn(async () => {
      throw new Error('boom');
    });
    const indexer = createRagIndexer(deps);
    indexer.start();

    expect(() =>
      deps.bus.emit({
        id: 'evt1',
        type: 'work.completed',
        companyId: 'c1',
        actorId: 'e1',
        actorKind: 'employee',
        payload: { threadId: 't1', employeeId: 'e1', messageId: 'm1' },
        createdAt: Date.now(),
      }),
    ).not.toThrow();

    await Promise.resolve();
    await Promise.resolve();
    expect(deps.logger.error).toHaveBeenCalled();
  });

  it('indexes meeting minutes on meeting.ended', async () => {
    const deps = makeDeps({
      getMeetingMinutes: vi.fn(() => ({ id: 'mtg1', minutesText: 'decisions and actions' })),
    });
    const indexer = createRagIndexer(deps);
    indexer.start();

    deps.bus.emit({
      id: 'evt2',
      type: 'meeting.ended',
      companyId: 'c1',
      actorId: 'orchestrator',
      actorKind: 'orchestrator',
      payload: { meetingId: 'mtg1' },
      createdAt: Date.now(),
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(deps.indexed).toContainEqual({
      sourceType: 'meeting_minutes',
      sourceId: 'mtg1',
      content: 'decisions and actions',
    });
  });
});
```

### Step 2: Run test to verify FAIL

```bash
pnpm -F @team-x/desktop test -- rag-indexer
```
Expected: FAIL.

### Step 3: Implement `apps/desktop/src/main/services/rag-indexer.ts`

```typescript
/**
 * RagIndexer — subscribes to the event bus and indexes new content
 * into the embeddings table on write. One subscriber, one dispatch
 * table, one shared service call.
 *
 * Invariant #6 (events append-only): never mutates the events table.
 * Invariant #7 (zero phone-home): never makes network calls beyond
 * the configured embedding provider.
 *
 * Phase 5 — M29.
 */

import type { RagService } from '@team-x/intelligence';
import type { DashboardEvent, EmbeddingSourceType } from '@team-x/shared-types';

export interface RagIndexerBus {
  subscribe(listener: (event: DashboardEvent) => void): () => void;
}

export interface RagIndexerDeps {
  bus: RagIndexerBus;
  service: Pick<RagService, 'indexSource' | 'retrieve' | 'deleteBySource'>;
  getMessage(id: string): { id: string; content: string; threadId: string } | null;
  getCompanyIdForThread(threadId: string): string | null;
  getMeetingMinutes?: (id: string) => { id: string; minutesText: string } | null;
  isEnabled: () => boolean;
  logger?: { info?: (msg: string, ...args: unknown[]) => void; error: (msg: string, err: unknown) => void };
}

export interface RagIndexer {
  start(): void;
  stop(): void;
}

export function createRagIndexer(deps: RagIndexerDeps): RagIndexer {
  let unsubscribe: (() => void) | null = null;
  const logger = deps.logger ?? { error: (m, e) => console.error('[rag-indexer]', m, e) };

  const handle = (event: DashboardEvent): void => {
    if (!deps.isEnabled()) return;

    void (async () => {
      try {
        const job = toIndexJob(event, deps);
        if (!job) return;
        await deps.service.indexSource(job);
      } catch (err) {
        logger.error('indexSource failed', err);
      }
    })();
  };

  return {
    start(): void {
      if (unsubscribe) return;
      unsubscribe = deps.bus.subscribe(handle);
    },
    stop(): void {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },
  };
}

interface IndexJob {
  companyId: string;
  sourceType: EmbeddingSourceType;
  sourceId: string;
  content: string;
}

function toIndexJob(event: DashboardEvent, deps: RagIndexerDeps): IndexJob | null {
  if (event.type === 'work.completed') {
    const payload = event.payload as { messageId?: string; threadId?: string } | null;
    if (!payload?.messageId || !payload.threadId) return null;
    const msg = deps.getMessage(payload.messageId);
    if (!msg || !msg.content.trim()) return null;
    const companyId = event.companyId ?? deps.getCompanyIdForThread(payload.threadId);
    if (!companyId) return null;
    return { companyId, sourceType: 'message', sourceId: msg.id, content: msg.content };
  }

  if (event.type === 'meeting.ended' && deps.getMeetingMinutes) {
    const payload = event.payload as { meetingId?: string } | null;
    if (!payload?.meetingId) return null;
    const minutes = deps.getMeetingMinutes(payload.meetingId);
    if (!minutes || !minutes.minutesText.trim()) return null;
    return {
      companyId: event.companyId,
      sourceType: 'meeting_minutes',
      sourceId: minutes.id,
      content: minutes.minutesText,
    };
  }

  // ticket/goal/project/vault-file are emitted via work.started/completed
  // on their creator thread, or indexed explicitly at write time via
  // the repo layer (T10 wires those paths).
  return null;
}
```

### Step 4: Run test to verify PASS

```bash
pnpm -F @team-x/desktop test -- rag-indexer
```
Expected: PASS (5 tests).

### Step 5: Commit

```bash
git add apps/desktop/src/main/services/rag-indexer.ts apps/desktop/src/main/services/rag-indexer.test.ts
git commit -m "feat(services): M29 T4 — RagIndexer (event-bus subscriber for on-write indexing)"
```

---

## Task 5: `resolveSystemPromptWithRag` wrapper

**Files:**
- Create: `apps/desktop/src/main/services/system-prompt.ts`
- Create: `apps/desktop/src/main/services/system-prompt.test.ts`

### Step 1: Write the failing test

Create `apps/desktop/src/main/services/system-prompt.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import {
  composeSystemPromptWithRag,
  type ComposeDeps,
  type RecentMessage,
} from './system-prompt.js';

function makeDeps(overrides: Partial<ComposeDeps> = {}): ComposeDeps {
  return {
    renderRoleSystemPrompt: vi.fn(async () => 'You are a CEO.'),
    isRagEnabled: () => true,
    getRagConfig: () => ({ topK: 3, threshold: 0.3, maxTokens: 400 }),
    getRecentUserMessages: (): RecentMessage[] => [
      { id: 'u1', content: 'What is our Q3 plan?', sourceId: 'u1' },
    ],
    retrieve: vi.fn(async () => [
      { sourceType: 'ticket', sourceId: 'T-42', chunkIndex: 0, contentText: 'Q3 launch', similarity: 0.8 },
    ]),
    countTokens: (s: string) => s.split(/\s+/).length,
    ...overrides,
  };
}

describe('composeSystemPromptWithRag', () => {
  it('returns plain role prompt when RAG disabled', async () => {
    const deps = makeDeps({ isRagEnabled: () => false });
    const prompt = await composeSystemPromptWithRag(deps, {
      employeeId: 'e1',
      companyId: 'c1',
      threadId: 't1',
    });
    expect(prompt).toBe('You are a CEO.');
    expect(deps.retrieve).not.toHaveBeenCalled();
  });

  it('returns plain role prompt when no recent user messages', async () => {
    const deps = makeDeps({ getRecentUserMessages: () => [] });
    const prompt = await composeSystemPromptWithRag(deps, {
      employeeId: 'e1',
      companyId: 'c1',
      threadId: 't1',
    });
    expect(prompt).toBe('You are a CEO.');
    expect(deps.retrieve).not.toHaveBeenCalled();
  });

  it('appends a Relevant Context block when retrieval yields hits', async () => {
    const deps = makeDeps();
    const prompt = await composeSystemPromptWithRag(deps, {
      employeeId: 'e1',
      companyId: 'c1',
      threadId: 't1',
    });
    expect(prompt).toContain('You are a CEO.');
    expect(prompt).toContain('## Relevant Context');
    expect(prompt).toContain('[Source: ticket T-42]');
    expect(prompt).toContain('Q3 launch');
  });

  it('enforces maxTokens by truncating the context block', async () => {
    const long = 'word '.repeat(500);
    const deps = makeDeps({
      retrieve: vi.fn(async () => [
        { sourceType: 'ticket', sourceId: 'T-1', chunkIndex: 0, contentText: long, similarity: 0.9 },
        { sourceType: 'ticket', sourceId: 'T-2', chunkIndex: 0, contentText: long, similarity: 0.85 },
      ]),
      getRagConfig: () => ({ topK: 3, threshold: 0.3, maxTokens: 50 }),
    });
    const prompt = await composeSystemPromptWithRag(deps, {
      employeeId: 'e1',
      companyId: 'c1',
      threadId: 't1',
    });
    // Budget is tight — should include at most one source.
    const sourceCount = (prompt.match(/\[Source:/g) ?? []).length;
    expect(sourceCount).toBeLessThanOrEqual(1);
  });

  it('dedups hits whose sourceId appears in excluded list', async () => {
    const retrieve = vi.fn(async () => [
      { sourceType: 'message', sourceId: 'm1', chunkIndex: 0, contentText: 'X', similarity: 0.9 },
    ]);
    const deps = makeDeps({
      retrieve,
      getRecentUserMessages: () => [{ id: 'm1', content: 'already in thread', sourceId: 'm1' }],
    });
    const prompt = await composeSystemPromptWithRag(deps, {
      employeeId: 'e1',
      companyId: 'c1',
      threadId: 't1',
    });
    expect(prompt).not.toContain('[Source: message m1]');
    expect(retrieve).toHaveBeenCalledWith(
      expect.objectContaining({ excludeSourceIds: expect.arrayContaining(['m1']) }),
    );
  });
});
```

### Step 2: Run test to verify FAIL

```bash
pnpm -F @team-x/desktop test -- system-prompt
```
Expected: FAIL.

### Step 3: Implement `apps/desktop/src/main/services/system-prompt.ts`

```typescript
/**
 * composeSystemPromptWithRag — wraps the existing role.md render step
 * with a retrieve-and-inject pass. Returned string is the pre-rendered
 * system prompt `runAgent` expects.
 *
 * Zero regression: when RAG is disabled or retrieval is empty, returns
 * the plain rendered role prompt with no diff.
 *
 * Phase 5 — M29.
 */

import type { RetrievalHit } from '@team-x/intelligence';

export interface RecentMessage {
  id: string;
  content: string;
  sourceId: string;
}

export interface ComposeInput {
  employeeId: string;
  companyId: string;
  threadId: string;
}

export interface ComposeDeps {
  renderRoleSystemPrompt(input: ComposeInput): Promise<string>;
  isRagEnabled(): boolean;
  getRagConfig(): { topK: number; threshold: number; maxTokens: number };
  getRecentUserMessages(input: ComposeInput): RecentMessage[];
  retrieve(input: {
    companyId: string;
    query: string;
    topK: number;
    threshold: number;
    excludeSourceIds: string[];
  }): Promise<RetrievalHit[]>;
  countTokens(text: string): number;
}

const SOURCE_LABELS: Record<string, string> = {
  message: 'message',
  ticket: 'ticket',
  meeting_minutes: 'meeting',
  goal: 'goal',
  project: 'project',
  vault_file: 'vault',
};

export async function composeSystemPromptWithRag(
  deps: ComposeDeps,
  input: ComposeInput,
): Promise<string> {
  const base = await deps.renderRoleSystemPrompt(input);

  if (!deps.isRagEnabled()) return base;

  const recent = deps.getRecentUserMessages(input);
  if (recent.length === 0) return base;

  const query = recent
    .slice(-2)
    .map((m) => m.content)
    .join('\n\n')
    .trim();
  if (!query) return base;

  const { topK, threshold, maxTokens } = deps.getRagConfig();

  const hits = await deps.retrieve({
    companyId: input.companyId,
    query,
    topK,
    threshold,
    excludeSourceIds: recent.map((m) => m.sourceId),
  });
  if (hits.length === 0) return base;

  const lines: string[] = [];
  let used = 0;
  for (const hit of hits) {
    const label = SOURCE_LABELS[hit.sourceType] ?? hit.sourceType;
    const formatted = `[Source: ${label} ${hit.sourceId}] ${hit.contentText}`;
    const cost = deps.countTokens(formatted);
    if (used + cost > maxTokens) break;
    used += cost;
    lines.push(formatted);
  }

  if (lines.length === 0) return base;

  return `${base}\n\n## Relevant Context\n${lines.join('\n\n')}`;
}
```

### Step 4: Run test to verify PASS

```bash
pnpm -F @team-x/desktop test -- system-prompt
```
Expected: PASS (5 tests).

### Step 5: Commit

```bash
git add apps/desktop/src/main/services/system-prompt.ts apps/desktop/src/main/services/system-prompt.test.ts
git commit -m "feat(services): M29 T5 — composeSystemPromptWithRag with dedup + token budget + attribution"
```

---

## Task 6: Composition root wiring in `main/index.ts`

**Rationale:** Everything shipped above is pure modules. T6 is where the desktop main process instantiates the `EmbedAdapter`, wraps it with `createEmbedText`, builds the `RagService`, starts the `RagIndexer`, and replaces the raw `resolveSystemPrompt` with `composeSystemPromptWithRag`.

**Files:**
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/main/services/provider-factory.ts` (add `buildEmbedAdapter` resolver)

### Step 1: Add `buildEmbedAdapter` helper

In `apps/desktop/src/main/services/provider-factory.ts`, add:

```typescript
import {
  makeOllamaEmbedAdapter,
  makeOpenAIEmbedAdapter,
  type EmbedAdapter,
} from '@team-x/provider-router';

export async function buildEmbedAdapter(args: {
  provider: string;
  model: string;
  dimension: number;
  providersService: ProvidersService;
  secretsStore: SecretsStore;
}): Promise<EmbedAdapter | null> {
  const config = args.providersService.getByName(args.provider);
  if (!config || !config.enabled) return null;

  if (config.kind === 'ollama') {
    return makeOllamaEmbedAdapter({
      baseURL: config.baseUrl ?? undefined,
      model: args.model,
      dimension: args.dimension,
    });
  }

  if (config.kind === 'openai' || config.kind === 'openai-compat') {
    const apiKey = await args.secretsStore.get(config.secretKey ?? `provider.${args.provider}.apiKey`);
    if (!apiKey) return null;
    return makeOpenAIEmbedAdapter({
      apiKey,
      model: args.model,
      dimension: args.dimension,
      baseURL: config.baseUrl ?? undefined,
    });
  }

  return null;
}
```

### Step 2: Wire RAG service + indexer at boot

In `apps/desktop/src/main/index.ts`, after the orchestrator is wired, add:

```typescript
import { createEmbedText, type EmbedTextFn } from '@team-x/provider-router';
import { createRagService, type RagService } from '@team-x/intelligence';

import { buildEmbedAdapter } from './services/provider-factory.js';
import { createRagIndexer } from './services/rag-indexer.js';
import { composeSystemPromptWithRag } from './services/system-prompt.js';
import { createEmbeddingsRepo } from './db/repos/embeddings.js';

// --- RAG wiring (M29) ----------------------------------------------------

const embeddingsRepo = createEmbeddingsRepo(db);

async function buildRagService(): Promise<RagService | null> {
  const enabled = (await settingsRepo.get('rag_enabled')) === 'true';
  if (!enabled) return null;

  const provider = (await settingsRepo.get('embedding_provider')) ?? 'ollama-local';
  const model = (await settingsRepo.get('embedding_model')) ?? 'nomic-embed-text';
  const dimension = Number((await settingsRepo.get('embedding_dimension')) ?? '768');

  const adapter = await buildEmbedAdapter({
    provider,
    model,
    dimension,
    providersService,
    secretsStore,
  });
  if (!adapter) return null;

  const embedText: EmbedTextFn = createEmbedText(adapter);

  return createRagService({
    embedText,
    dimension,
    repo: embeddingsRepo,
  });
}

let ragService: RagService | null = await buildRagService();

const ragIndexer = createRagIndexer({
  bus: eventBus,
  service: {
    indexSource: async (i) => ragService?.indexSource(i) ?? 0,
    retrieve: async (q) => ragService?.retrieve(q) ?? [],
    deleteBySource: (id) => ragService?.deleteBySource(id) ?? 0,
  },
  getMessage: (id) => messagesRepo.getById(id),
  getCompanyIdForThread: (threadId) => threadsRepo.getById(threadId)?.companyId ?? null,
  getMeetingMinutes: (id) => {
    const m = meetingsRepo.getById(id);
    return m?.minutesText ? { id: m.id, minutesText: m.minutesText } : null;
  },
  isEnabled: () => ragService !== null,
});
ragIndexer.start();

// ... existing shutdown handler additions:
app.on('will-quit', () => {
  ragIndexer.stop();
});
```

### Step 3: Swap `resolveSystemPrompt` to the wrapped version

Replace the existing resolver with:

```typescript
const resolveSystemPrompt: ResolveSystemPrompt = async ({ employee, company, threadId }) => {
  const renderPlain = async (): Promise<string> => {
    const role = await roleLoader.load(employee.rolePackId, employee.roleId);
    return renderRoleBody(role.body, buildTemplateVars(company, employee));
  };

  if (!ragService) return renderPlain();

  const enabled = (await settingsRepo.get('rag_enabled')) === 'true';
  const topK = Number((await settingsRepo.get('rag_top_k')) ?? '5');
  const threshold = Number((await settingsRepo.get('rag_threshold')) ?? '0.3');
  const maxTokens = Number((await settingsRepo.get('rag_max_tokens')) ?? '800');

  return composeSystemPromptWithRag(
    {
      renderRoleSystemPrompt: renderPlain,
      isRagEnabled: () => enabled,
      getRagConfig: () => ({ topK, threshold, maxTokens }),
      getRecentUserMessages: ({ threadId: tid }) =>
        messagesRepo.listByThread(tid, { limit: 10 })
          .filter((m) => m.authorKind === 'user')
          .slice(-2)
          .map((m) => ({ id: m.id, content: m.content, sourceId: m.id })),
      retrieve: (q) => ragService!.retrieve(q),
      countTokens: (text) => Math.ceil(text.length / 4), // cheap approximation
    },
    { employeeId: employee.id, companyId: company.id, threadId },
  );
};
```

### Step 4: Verify wiring compiles

```bash
pnpm -F @team-x/desktop typecheck
```
Expected: PASS.

### Step 5: Run the full desktop suite

```bash
pnpm -F @team-x/desktop test
```
Expected: PASS. Existing orchestrator + chat tests must still pass (invariant: no regressions).

### Step 6: Commit

```bash
git add apps/desktop/src/main/index.ts apps/desktop/src/main/services/provider-factory.ts
git commit -m "feat(desktop): M29 T6 — wire RagService + RagIndexer + RAG-enhanced resolveSystemPrompt"
```

---

## Task 7: `rag.*` IPC channels + handlers

**Channels:**
- `rag.stats` — return row count, last indexed ts, enabled state
- `rag.rebuildAll` — delete all embeddings for company, re-queue work to re-index all messages/tickets/meetings/minutes/goals/projects/vault-files
- `rag.deleteForCompany` — nuke embeddings for one company

**Files:**
- Modify: `packages/shared-types/src/ipc.ts` (add 3 channels to `TeamXApi`)
- Create: `apps/desktop/src/main/ipc/rag-handlers.ts`
- Create: `apps/desktop/src/main/ipc/rag-handlers.test.ts`
- Modify: `apps/desktop/src/main/index.ts` (register handlers)
- Modify: `apps/desktop/src/preload/index.ts` (bridge)

### Step 1: Extend IPC types

```typescript
// packages/shared-types/src/ipc.ts
export interface TeamXApi {
  // ... existing
  rag: {
    stats(companyId: string): Promise<{ embeddingCount: number; lastIndexedAt: number | null; enabled: boolean }>;
    rebuildAll(companyId: string): Promise<{ scheduled: number }>;
    deleteForCompany(companyId: string): Promise<{ deleted: number }>;
  };
}
```

### Step 2: Write failing test for handlers

Create `apps/desktop/src/main/ipc/rag-handlers.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { buildRagHandlers, type RagHandlersDeps } from './rag-handlers.js';

function makeDeps(overrides: Partial<RagHandlersDeps> = {}): RagHandlersDeps {
  return {
    embeddingsRepo: {
      countByCompany: vi.fn(() => 42),
      listByCompany: vi.fn(() => [
        { createdAt: 100 },
        { createdAt: 200 },
      ] as never[]),
    },
    isRagEnabled: () => true,
    deleteAllForCompany: vi.fn(() => 42),
    rebuildSources: vi.fn(async () => 10),
    ...overrides,
  };
}

describe('rag.stats', () => {
  it('returns count, last ts, enabled state', async () => {
    const deps = makeDeps();
    const handlers = buildRagHandlers(deps);
    const result = await handlers.stats('c1');
    expect(result).toEqual({ embeddingCount: 42, lastIndexedAt: 200, enabled: true });
  });

  it('returns null lastIndexedAt when no rows', async () => {
    const deps = makeDeps({
      embeddingsRepo: {
        countByCompany: vi.fn(() => 0),
        listByCompany: vi.fn(() => []),
      },
    });
    const handlers = buildRagHandlers(deps);
    const result = await handlers.stats('c1');
    expect(result.lastIndexedAt).toBeNull();
  });
});

describe('rag.rebuildAll', () => {
  it('wipes existing embeddings then rebuilds', async () => {
    const deps = makeDeps();
    const handlers = buildRagHandlers(deps);
    const result = await handlers.rebuildAll('c1');
    expect(deps.deleteAllForCompany).toHaveBeenCalledWith('c1');
    expect(deps.rebuildSources).toHaveBeenCalledWith('c1');
    expect(result.scheduled).toBe(10);
  });
});

describe('rag.deleteForCompany', () => {
  it('returns the delete count', async () => {
    const deps = makeDeps();
    const handlers = buildRagHandlers(deps);
    const result = await handlers.deleteForCompany('c1');
    expect(result.deleted).toBe(42);
  });
});
```

### Step 3: Implement `apps/desktop/src/main/ipc/rag-handlers.ts`

```typescript
/**
 * rag.* IPC handlers — surface RAG state and rebuild control to the
 * renderer's Settings panel.
 *
 * Phase 5 — M29.
 */

export interface RagHandlersDeps {
  embeddingsRepo: {
    countByCompany(companyId: string): number;
    listByCompany(companyId: string): Array<{ createdAt: number }>;
  };
  isRagEnabled: () => boolean;
  deleteAllForCompany(companyId: string): number;
  rebuildSources(companyId: string): Promise<number>;
}

export interface RagHandlers {
  stats(companyId: string): Promise<{ embeddingCount: number; lastIndexedAt: number | null; enabled: boolean }>;
  rebuildAll(companyId: string): Promise<{ scheduled: number }>;
  deleteForCompany(companyId: string): Promise<{ deleted: number }>;
}

export function buildRagHandlers(deps: RagHandlersDeps): RagHandlers {
  return {
    async stats(companyId: string) {
      const embeddingCount = deps.embeddingsRepo.countByCompany(companyId);
      const rows = deps.embeddingsRepo.listByCompany(companyId);
      const lastIndexedAt = rows.length === 0
        ? null
        : rows.reduce((max, r) => Math.max(max, r.createdAt), 0);
      return { embeddingCount, lastIndexedAt, enabled: deps.isRagEnabled() };
    },

    async rebuildAll(companyId: string) {
      deps.deleteAllForCompany(companyId);
      const scheduled = await deps.rebuildSources(companyId);
      return { scheduled };
    },

    async deleteForCompany(companyId: string) {
      return { deleted: deps.deleteAllForCompany(companyId) };
    },
  };
}
```

### Step 4: Register IPC + preload bridge

Wire `ipcMain.handle('rag.stats', ...)`, `rag.rebuildAll`, `rag.deleteForCompany` in `main/index.ts`, and expose on the preload bridge.

### Step 5: Run tests

```bash
pnpm -F @team-x/desktop test -- rag-handlers
pnpm typecheck
```
Expected: PASS.

### Step 6: Commit

```bash
git add packages/shared-types/ apps/desktop/src/main/ipc/rag-handlers.ts apps/desktop/src/main/ipc/rag-handlers.test.ts apps/desktop/src/main/index.ts apps/desktop/src/preload/index.ts
git commit -m "feat(ipc): M29 T7 — rag.stats / rag.rebuildAll / rag.deleteForCompany IPC channels"
```

---

## Task 8: RAG Settings UI panel

**Files:**
- Create: `apps/desktop/src/renderer/views/settings/RagSection.tsx`
- Create: `apps/desktop/src/renderer/views/settings/RagSection.test.tsx`
- Modify: `apps/desktop/src/renderer/views/SettingsView.tsx` (mount section)
- Modify: `apps/desktop/src/renderer/hooks/useRag.ts` (new — React Query wrappers for `rag.*`)

### Step 1: Write the failing component test

Create `apps/desktop/src/renderer/views/settings/RagSection.test.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RagSection } from './RagSection.js';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('RagSection', () => {
  it('renders enabled toggle, top-K, threshold, max-tokens', async () => {
    (globalThis as any).teamx = {
      rag: { stats: vi.fn(async () => ({ embeddingCount: 42, lastIndexedAt: Date.now(), enabled: true })) },
      settings: { getRag: vi.fn(async () => ({ enabled: true, topK: 5, threshold: 0.3, maxTokens: 800 })) },
    };
    renderWithClient(<RagSection companyId="c1" />);
    await waitFor(() => expect(screen.getByText(/42/)).toBeInTheDocument());
    expect(screen.getByLabelText(/top-k/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/threshold/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/max tokens/i)).toBeInTheDocument();
  });

  it('calls rag.rebuildAll when Rebuild button clicked', async () => {
    const rebuildAll = vi.fn(async () => ({ scheduled: 10 }));
    (globalThis as any).teamx = {
      rag: {
        stats: vi.fn(async () => ({ embeddingCount: 42, lastIndexedAt: null, enabled: true })),
        rebuildAll,
      },
      settings: { getRag: vi.fn(async () => ({ enabled: true, topK: 5, threshold: 0.3, maxTokens: 800 })) },
    };
    renderWithClient(<RagSection companyId="c1" />);
    await waitFor(() => expect(screen.getByText(/rebuild/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/rebuild/i));
    await waitFor(() => expect(rebuildAll).toHaveBeenCalledWith('c1'));
  });
});
```

### Step 2: Implement `RagSection.tsx`

Renders under Settings. Includes:

- **Enable toggle** — binds `rag_enabled` via `settings.*` IPC.
- **Embedding provider + model + dimension** — dropdowns sourced from configured providers; dimension auto-derived for known models.
- **Top-K** (default 5), **Threshold** (0.0–1.0 slider, default 0.3), **Max tokens** (default 800).
- **Stats card** — row count, last indexed timestamp, enabled state.
- **Rebuild button** — confirm dialog → `rag.rebuildAll`.
- **Delete button** — `rag.deleteForCompany` with destructive confirm.

Use existing Settings style (card wrapper, right-side descriptive text, accent on primary actions with `#FFAA2024`).

### Step 3: Mount in `SettingsView.tsx`

```typescript
import { RagSection } from './settings/RagSection.js';

// ... inside SettingsView, after PrivacySection:
<RagSection companyId={activeCompanyId} />
```

### Step 4: Run tests

```bash
pnpm -F @team-x/desktop test -- RagSection
```
Expected: PASS (2 tests).

### Step 5: Commit

```bash
git add apps/desktop/src/renderer/
git commit -m "feat(ui): M29 T8 — RAG Settings panel (toggle, top-K, threshold, rebuild, stats)"
```

---

## Task 9: E2E spec — `rag-flow.spec.ts`

**Files:**
- Create: `apps/desktop/e2e/rag-flow.spec.ts`

### Step 1: Design the spec

Uses test-mode provider; stubs `embedText` with a deterministic fake that encodes token length into vector space (the same pattern used in unit tests).

Flow:

1. Boot app with `NODE_ENV=test` + `TEAM_X_RAG_TEST=1` env var that swaps the embed adapter.
2. Create a ticket titled "Q3 launch plan" with description "Launch Elite Archery on Steam by 2026-09-01."
3. Wait for indexer to catch up (poll `rag.stats` until count > 0).
4. Open a new chat thread with the CEO.
5. Ask: "When are we launching?"
6. Assert the streamed reply contains the phrase `2026-09-01` OR that the `token.delta` stream reveals the system prompt included a `[Source: ticket` citation (test-mode provider echoes the prompt).

The test-mode provider in `apps/desktop/src/main/services/provider-factory.ts` already supports canned replies — extend to echo the system prompt when passed a `__ECHO_SYSTEM__` sentinel.

### Step 2: Run the spec

```bash
pnpm -F @team-x/desktop test:e2e -- rag-flow
```
Expected: PASS (1 new E2E spec).

### Step 3: Commit

```bash
git add apps/desktop/e2e/rag-flow.spec.ts apps/desktop/src/main/services/provider-factory.ts
git commit -m "test(e2e): M29 T9 — rag-flow spec (ticket → RAG → chat recall)"
```

---

## Task 10: Full verification pass + milestone marker

### Step 1: Full test suite

```bash
pnpm test
```
Expected: ~665 tests (641 + ~24 new) passing.

### Step 2: Typecheck (all workspaces)

```bash
pnpm typecheck
```
Expected: PASS.

### Step 3: Lint

```bash
pnpm lint:fix && pnpm lint
```
Expected: 0 errors. Warning baseline preserved.

### Step 4: E2E full run

```bash
pnpm -F @team-x/desktop test:e2e
```
Expected: 5 specs pass (smoke, ticket-flow, meeting-flow, vault-backup, rag-flow).

### Step 5: Commit any lint fixes

```bash
git add -A
git commit -m "chore: M29 T10 — lint fixes"
```

### Step 6: Final milestone marker commit

```bash
git commit --allow-empty -m "feat(intelligence): M29 complete — RAG integration into agent turns

New wiring end-to-end:
- embedText + Ollama/OpenAI embedding adapters in provider-router
- ResolveSystemPrompt extended with threadId
- RagService (indexSource + retrieve) facade in @team-x/intelligence
- RagIndexer subscribes to event bus for on-write embedding
- composeSystemPromptWithRag injects [Source: …] citations under token budget
- RAG composition root wired in apps/desktop/src/main/index.ts
- rag.stats / rag.rebuildAll / rag.deleteForCompany IPC
- RAG Settings panel (toggle, top-K, threshold, rebuild, stats)
- rag-flow E2E spec"
```

### Step 7: Update CONTINUITY + orchestrator state

Bump `currentMilestone` to `M30`, flip `phaseComplete` to false, set `tasksCompleted=0`, and log Mistakes & Learnings from this session.

---

## Summary

| Task | Deliverable | Est. Tests |
|------|-------------|-----------|
| T1 | `embedText` + Ollama + OpenAI embed adapters | 4 |
| T2 | Extend `ResolveSystemPrompt` with `threadId` | 0 (type-only) |
| T3 | `RagService` facade in intelligence pkg | 5 |
| T4 | `RagIndexer` event-bus subscriber | 5 |
| T5 | `composeSystemPromptWithRag` | 5 |
| T6 | Composition root wiring | 0 (integration) |
| T7 | `rag.*` IPC channels + handlers | 4 |
| T8 | RAG Settings UI panel | 2 |
| T9 | E2E `rag-flow.spec.ts` | 1 E2E |
| T10 | Full verification + marker commit | 0 |
| **Total** | | **~25 unit + 1 E2E** |

**Next milestone:** M30 (NLU Engine) — intent classifier, entity resolver, slot filler, `command.*` IPC handlers.
