# Phase 7 — Hugging Face Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
>
> **Cross-phase rules:** See master plan § "Cross-phase rules" (CR-1 through CR-10).
>
> **Codex Stage 3 review:** REQUIRED. New HTTP client + download manager + SHA verification — Codex independent review is mandatory.

**Goal:** Land the in-app Hugging Face browser: search UI + filters, model card preview, download manager with progress/pause/resume/cancel, SHA verification on completion, automatic library row creation on success. Replaces `localGguf.hf.*` IPC stubs from Phase 1.

**Architecture:** `@team-x/local-gguf-runtime/src/hf-client/` exports `HfClient` (search, modelCard, startDownload, etc.). Downloads use HTTP Range requests with resume on interrupt; per-file SHA256 verified on completion. `HfService` (main process) coordinates: starts downloads, persists `DownloadHandle` state to memory (downloads are session-scoped — not persisted across app restarts in v1), emits progress events to the renderer.

**Spec coverage:** Implements spec § 4.1.6 (HF Hub browser + downloader), § 10.2 (HF tab UI), § 15 errors `hf-download-failed` + `hf-rate-limited`.

**Estimated PR size:** ~2,500 LOC production + ~3,500 LOC tests + msw mock infrastructure. Single PR.

---

## Files this phase touches

### New files

```
packages/local-gguf-runtime/src/hf-client/
├── api.ts                                          (search, modelCard, file-meta HEAD)
├── api.test.ts                                     (msw-mocked)
├── api.integration.test.ts                         (real HF, env-gated)
├── search.ts                                       (search query builder + filters)
├── search.test.ts
├── download.ts                                     (range-resumable download with SHA verification)
├── download.test.ts
├── download.integration.test.ts                    (real download of TinyLlama, env-gated)
├── rate-limit.ts                                   (429 detection + Retry-After)
└── rate-limit.test.ts

apps/desktop/src/main/services/local-gguf/
├── hf-service.ts                                   (in-process download orchestrator)
└── hf-service.test.ts

apps/desktop/src/renderer/src/features/local-gguf/
├── hf-browser.tsx                                  (search + filters + results)
├── hf-browser.test.tsx
├── hf-model-card-preview.tsx                       (drawer/modal showing siblings + license + description)
├── hf-model-card-preview.test.tsx
├── hf-download-strip.tsx                           (bottom strip with active downloads)
└── hf-download-strip.test.tsx

apps/desktop/src/renderer/src/hooks/
├── use-hf-search.ts
├── use-hf-search.test.ts
├── use-hf-downloads.ts
└── use-hf-downloads.test.ts

apps/desktop/e2e/
└── local-gguf-hf-browser.spec.ts
```

### Modified files

```
packages/shared-types/src/local-gguf.ts             (lift HfSearchResult/HfModelCard/DownloadProgress from preload to shared)
apps/desktop/src/main/ipc/local-gguf-hf-handlers.ts (replace stubs with HfService delegations)
apps/desktop/src/main/ipc/local-gguf-hf-handlers.test.ts
apps/desktop/src/main/index.ts                      (wire HfService deps)
apps/desktop/src/preload/local-gguf-api.ts          (remove inline HF types, import from shared)
apps/desktop/src/renderer/src/features/local-gguf/settings-local-models-page.tsx (mount HfBrowser into Hugging Face tab)
CHANGELOG.md
docs/user-guide/local-models/hugging-face-browser.md (Phase 11 will expand; placeholder added here)
```

---

## Tasks

### Task 1: Branch + sync

```bash
git checkout main && git pull --ff-only
git checkout -b feat/v3.3.0-phase-07-hf-browser
```

---

### Task 2: Lift HF types from preload to shared-types

**Files:**
- Modify: `packages/shared-types/src/local-gguf.ts` (add HfSearchResult, HfModelCard, DownloadProgress)
- Modify: `apps/desktop/src/preload/local-gguf-api.ts` (import from shared, remove inline)

- [ ] **Step 1: Move the three interfaces from `local-gguf-api.ts` to `shared-types/local-gguf.ts` as canonical types** (the Phase 1 placeholder comment explicitly noted Phase 7 would do this).

```ts
// packages/shared-types/src/local-gguf.ts (append)

export interface HfSearchFilters {
  arch?: string;
  minParamsB?: number;
  maxParamsB?: number;
  quant?: string;
  license?: 'permissive' | 'restrictive' | 'any';
}

export interface HfSearchResult {
  repoId: string;
  author: string;
  downloads: number;
  likes: number;
  description: string;
  tags: string[];
  lastModified: string; // ISO date
  hasGgufFile: boolean;
}

export interface HfFileSibling {
  rfilename: string;
  sizeBytes: number | null;
  sha256: string | null;
}

export interface HfModelCard {
  repoId: string;
  author: string;
  description: string;
  license: string | null;
  tags: string[];
  siblings: HfFileSibling[];
  cardData: Record<string, unknown> | null;
  lastModified: string;
}

export type DownloadState = 'pending' | 'downloading' | 'paused' | 'completed' | 'cancelled' | 'failed';

export interface DownloadProgress {
  handleId: string;
  repoId: string;
  filename: string;
  bytesReceived: number;
  bytesTotal: number;
  state: DownloadState;
  errorMessage: string | null;
  speedBytesPerS: number;
  etaSeconds: number | null;
}
```

- [ ] **Step 2: Update preload bridge to import from shared, remove inline definitions.**

- [ ] **Step 3: Run typecheck.**

- [ ] **Step 4: Commit.**

```
refactor(shared-types): lift HF types from preload to shared-types as canonical
```

---

### Task 3: Rate-limit helper (TDD)

**Files:**
- Create: `packages/local-gguf-runtime/src/hf-client/rate-limit.ts`
- Create: `packages/local-gguf-runtime/src/hf-client/rate-limit.test.ts`

- [ ] **Step 1: TDD.**

```ts
// packages/local-gguf-runtime/src/hf-client/rate-limit.test.ts
import { describe, expect, it } from 'vitest';
import { parseRetryAfter, isRateLimitResponse } from './rate-limit';

describe('rate-limit helpers', () => {
  it('parses Retry-After as seconds', () => {
    expect(parseRetryAfter('60')).toBe(60);
    expect(parseRetryAfter('120')).toBe(120);
  });

  it('parses Retry-After as HTTP date', () => {
    const future = new Date(Date.now() + 60_000);
    const result = parseRetryAfter(future.toUTCString());
    expect(result).toBeGreaterThan(55);
    expect(result).toBeLessThan(70);
  });

  it('falls back to 60 on malformed Retry-After', () => {
    expect(parseRetryAfter('garbage')).toBe(60);
    expect(parseRetryAfter('')).toBe(60);
    expect(parseRetryAfter(null)).toBe(60);
  });

  it('isRateLimitResponse detects status 429', () => {
    expect(isRateLimitResponse({ status: 429 } as Response)).toBe(true);
    expect(isRateLimitResponse({ status: 200 } as Response)).toBe(false);
    expect(isRateLimitResponse({ status: 500 } as Response)).toBe(false);
  });
});
```

- [ ] **Step 2: Implement.**

```ts
// packages/local-gguf-runtime/src/hf-client/rate-limit.ts
const DEFAULT_RETRY_S = 60;

export function parseRetryAfter(value: string | null): number {
  if (!value) return DEFAULT_RETRY_S;
  const asInt = parseInt(value, 10);
  if (!Number.isNaN(asInt) && String(asInt) === value.trim()) return asInt;
  const asDate = new Date(value).getTime();
  if (!Number.isNaN(asDate)) {
    const secs = Math.ceil((asDate - Date.now()) / 1000);
    return secs > 0 ? secs : DEFAULT_RETRY_S;
  }
  return DEFAULT_RETRY_S;
}

export function isRateLimitResponse(res: { status: number }): boolean {
  return res.status === 429;
}
```

- [ ] **Step 3: Run + commit.**

```
feat(hf-client): rate-limit helpers (parseRetryAfter + isRateLimitResponse)
```

---

### Task 4: Search query builder (TDD)

**Files:**
- Create: `packages/local-gguf-runtime/src/hf-client/search.ts` + test

Pure function — builds `?search=…&filter=gguf&sort=…&limit=N` URL.

- [ ] **Step 1: TDD.**

```ts
// packages/local-gguf-runtime/src/hf-client/search.test.ts
import { describe, expect, it } from 'vitest';
import { buildSearchUrl } from './search';

describe('buildSearchUrl', () => {
  it('builds the basic GGUF search URL', () => {
    const url = buildSearchUrl({ query: 'llama 3.1', filters: {}, limit: 20 });
    expect(url).toContain('search=llama+3.1');
    expect(url).toContain('filter=gguf');
    expect(url).toContain('limit=20');
    expect(url).toContain('sort=downloads');
  });

  it('encodes arch filter as a tag', () => {
    const url = buildSearchUrl({ query: '', filters: { arch: 'mistral' }, limit: 20 });
    expect(url).toContain('filter=gguf');
    expect(url).toContain('search=mistral');
  });

  it('clamps limit to 100', () => {
    const url = buildSearchUrl({ query: '', filters: {}, limit: 999 });
    expect(url).toContain('limit=100');
  });

  it('uses sort=downloads by default but allows likes/last-modified', () => {
    expect(buildSearchUrl({ query: 'x', filters: {}, sort: 'likes', limit: 10 })).toContain('sort=likes');
    expect(buildSearchUrl({ query: 'x', filters: {}, sort: 'last-modified', limit: 10 })).toContain('sort=last_modified');
  });
});
```

- [ ] **Step 2: Implement.**

```ts
// packages/local-gguf-runtime/src/hf-client/search.ts
import type { HfSearchFilters } from '@team-x/shared-types';

export type SearchSort = 'downloads' | 'likes' | 'last-modified';

export interface BuildSearchUrlOptions {
  query: string;
  filters: HfSearchFilters;
  sort?: SearchSort;
  limit?: number;
}

const HF_API_BASE = 'https://huggingface.co/api/models';

export function buildSearchUrl(opts: BuildSearchUrlOptions): string {
  const params = new URLSearchParams();
  const queryParts: string[] = [];
  if (opts.query) queryParts.push(opts.query);
  if (opts.filters.arch) queryParts.push(opts.filters.arch);
  if (opts.filters.quant) queryParts.push(opts.filters.quant);
  if (queryParts.length > 0) params.set('search', queryParts.join(' '));
  params.set('filter', 'gguf');
  const sortKey = opts.sort === 'likes' ? 'likes' : opts.sort === 'last-modified' ? 'last_modified' : 'downloads';
  params.set('sort', sortKey);
  params.set('direction', '-1');
  const limit = Math.min(Math.max(1, opts.limit ?? 20), 100);
  params.set('limit', String(limit));
  return `${HF_API_BASE}?${params.toString()}`;
}
```

- [ ] **Step 3: Run + commit.**

```
feat(hf-client): search URL builder (GGUF filter, sort, clamp)
```

---

### Task 5: HF API client — search + modelCard + fileMeta (TDD with msw)

**Files:**
- Create: `packages/local-gguf-runtime/src/hf-client/api.ts` + test
- Create: `packages/local-gguf-runtime/src/hf-client/api.integration.test.ts`

- [ ] **Step 1: Install msw.**

```bash
pnpm -F @team-x/local-gguf-runtime add -D msw@^2
```

- [ ] **Step 2: TDD test using msw.**

```ts
// api.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createHfClient } from './api';

const server = setupServer(
  http.get('https://huggingface.co/api/models', () => HttpResponse.json([
    { id: 'bartowski/Meta-Llama-3.1-8B-Instruct-GGUF', author: 'bartowski', downloads: 100000, likes: 200, tags: ['gguf', 'llama'], lastModified: '2026-01-01T00:00:00.000Z' },
  ])),
  http.get('https://huggingface.co/api/models/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF', () => HttpResponse.json({
    id: 'bartowski/Meta-Llama-3.1-8B-Instruct-GGUF',
    author: 'bartowski',
    description: 'Llama 3.1 8B Instruct in GGUF',
    cardData: { license: 'llama3.1' },
    tags: ['gguf', 'llama'],
    siblings: [{ rfilename: 'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf', size: 4_900_000_000 }],
    lastModified: '2026-01-01T00:00:00.000Z',
  })),
  http.head('https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf', () => new HttpResponse(null, {
    status: 200,
    headers: { 'content-length': '4900000000', 'accept-ranges': 'bytes', etag: '"abc123"' },
  })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

describe('HfClient.search', () => {
  it('returns canonical HfSearchResult shape', async () => {
    const client = createHfClient();
    const results = await client.search('llama', {}, { limit: 5 });
    expect(results).toHaveLength(1);
    expect(results[0].repoId).toBe('bartowski/Meta-Llama-3.1-8B-Instruct-GGUF');
    expect(results[0].downloads).toBe(100000);
    expect(results[0].hasGgufFile).toBe(true);
  });

  it('passes auth token in Authorization header when set', async () => {
    let observedAuth: string | undefined;
    server.use(
      http.get('https://huggingface.co/api/models', ({ request }) => {
        observedAuth = request.headers.get('authorization') ?? undefined;
        return HttpResponse.json([]);
      }),
    );
    const client = createHfClient({ token: 'hf_t' });
    await client.search('x', {}, { limit: 5 });
    expect(observedAuth).toBe('Bearer hf_t');
  });

  it('throws hf-rate-limited on 429', async () => {
    server.use(
      http.get('https://huggingface.co/api/models', () => new HttpResponse(null, { status: 429, headers: { 'retry-after': '90' } })),
    );
    const client = createHfClient();
    await expect(client.search('x', {}, { limit: 5 })).rejects.toMatchObject({ error: { kind: 'hf-rate-limited', retryAfterS: 90 } });
  });

  it('throws hf-download-failed on other HTTP errors', async () => {
    server.use(http.get('https://huggingface.co/api/models', () => new HttpResponse(null, { status: 500 })));
    const client = createHfClient();
    await expect(client.search('x', {}, { limit: 5 })).rejects.toMatchObject({ error: { kind: 'hf-download-failed', httpStatus: 500 } });
  });
});

describe('HfClient.modelCard', () => {
  it('returns canonical HfModelCard shape', async () => {
    const client = createHfClient();
    const card = await client.modelCard('bartowski/Meta-Llama-3.1-8B-Instruct-GGUF');
    expect(card.author).toBe('bartowski');
    expect(card.license).toBe('llama3.1');
    expect(card.siblings).toHaveLength(1);
    expect(card.siblings[0].sizeBytes).toBe(4_900_000_000);
  });
});

describe('HfClient.fileMeta', () => {
  it('returns size + etag from HEAD', async () => {
    const client = createHfClient();
    const meta = await client.fileMeta('bartowski/Meta-Llama-3.1-8B-Instruct-GGUF', 'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf');
    expect(meta.sizeBytes).toBe(4_900_000_000);
    expect(meta.etag).toBe('"abc123"');
    expect(meta.acceptsRanges).toBe(true);
  });
});
```

- [ ] **Step 3: Implement.**

```ts
// packages/local-gguf-runtime/src/hf-client/api.ts
import type { HfModelCard, HfSearchFilters, HfSearchResult, LocalGgufError } from '@team-x/shared-types';
import { buildSearchUrl, type SearchSort } from './search';
import { isRateLimitResponse, parseRetryAfter } from './rate-limit';

export class HfClientError extends Error {
  constructor(public readonly error: LocalGgufError) {
    super(`HfClientError: ${JSON.stringify(error)}`);
    this.name = 'HfClientError';
  }
}

export interface FileMeta {
  sizeBytes: number | null;
  etag: string | null;
  acceptsRanges: boolean;
}

export interface HfClientOptions {
  token?: string | null;
  fetch?: typeof fetch;
}

export function createHfClient(opts: HfClientOptions = {}) {
  const fetchFn = opts.fetch ?? fetch;
  const authHeaders = opts.token ? { authorization: `Bearer ${opts.token}` } : {};

  return {
    async search(query: string, filters: HfSearchFilters, page: { limit?: number; sort?: SearchSort } = {}): Promise<HfSearchResult[]> {
      const url = buildSearchUrl({ query, filters, sort: page.sort, limit: page.limit });
      const res = await fetchFn(url, { headers: authHeaders });
      if (isRateLimitResponse(res)) {
        throw new HfClientError({ kind: 'hf-rate-limited', retryAfterS: parseRetryAfter(res.headers.get('retry-after')) });
      }
      if (!res.ok) {
        throw new HfClientError({ kind: 'hf-download-failed', repo: 'search', file: '', httpStatus: res.status, body: await res.text() });
      }
      const arr = (await res.json()) as Array<Record<string, unknown>>;
      return arr.map((row) => ({
        repoId: String(row.id),
        author: String((row.id as string).split('/')[0] ?? ''),
        downloads: Number(row.downloads ?? 0),
        likes: Number(row.likes ?? 0),
        description: typeof row.description === 'string' ? row.description : '',
        tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
        lastModified: String(row.lastModified ?? ''),
        hasGgufFile: true, // filter=gguf guarantees this
      }));
    },

    async modelCard(repoId: string): Promise<HfModelCard> {
      const res = await fetchFn(`https://huggingface.co/api/models/${encodeURIComponent(repoId)}`, { headers: authHeaders });
      if (isRateLimitResponse(res)) {
        throw new HfClientError({ kind: 'hf-rate-limited', retryAfterS: parseRetryAfter(res.headers.get('retry-after')) });
      }
      if (!res.ok) throw new HfClientError({ kind: 'hf-download-failed', repo: repoId, file: '', httpStatus: res.status, body: await res.text() });
      const obj = (await res.json()) as Record<string, unknown>;
      const cardData = (obj.cardData ?? null) as Record<string, unknown> | null;
      return {
        repoId,
        author: repoId.split('/')[0] ?? '',
        description: typeof obj.description === 'string' ? obj.description : '',
        license: cardData && typeof cardData.license === 'string' ? cardData.license : null,
        tags: Array.isArray(obj.tags) ? (obj.tags as string[]) : [],
        siblings: Array.isArray(obj.siblings)
          ? (obj.siblings as Array<{ rfilename: string; size?: number }>).map((s) => ({
              rfilename: s.rfilename,
              sizeBytes: typeof s.size === 'number' ? s.size : null,
              sha256: null,
            }))
          : [],
        cardData,
        lastModified: String(obj.lastModified ?? ''),
      };
    },

    async fileMeta(repoId: string, filename: string): Promise<FileMeta> {
      const url = `https://huggingface.co/${repoId}/resolve/main/${encodeURIComponent(filename)}`;
      const res = await fetchFn(url, { method: 'HEAD', redirect: 'follow', headers: authHeaders });
      if (!res.ok) throw new HfClientError({ kind: 'hf-download-failed', repo: repoId, file: filename, httpStatus: res.status, body: '' });
      const lenStr = res.headers.get('content-length');
      return {
        sizeBytes: lenStr ? parseInt(lenStr, 10) : null,
        etag: res.headers.get('etag'),
        acceptsRanges: (res.headers.get('accept-ranges') ?? '').toLowerCase().includes('bytes'),
      };
    },
  };
}

export type HfClient = ReturnType<typeof createHfClient>;
```

- [ ] **Step 4: Integration test (env-gated against real HF).**

```ts
// api.integration.test.ts
import { describe, expect, it } from 'vitest';
import { createHfClient } from './api';

const RUN = process.env.RUN_HF_INTEGRATION_TESTS === 'true';

describe.skipIf(!RUN)('HfClient (real HF integration)', () => {
  it('searches GGUF models', async () => {
    const client = createHfClient({ token: process.env.HF_TOKEN ?? null });
    const results = await client.search('llama 3.1', {}, { limit: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].repoId).toContain('/');
  }, 30_000);

  it('fetches a known model card', async () => {
    const client = createHfClient({ token: process.env.HF_TOKEN ?? null });
    const card = await client.modelCard('bartowski/TinyLlama-1.1B-Chat-v1.0-GGUF');
    expect(card.siblings.some((s) => s.rfilename.endsWith('.gguf'))).toBe(true);
  }, 30_000);
});
```

- [ ] **Step 5: Commit.**

```
feat(hf-client): HfClient — search + modelCard + fileMeta with msw unit tests + env-gated real integration
```

---

### Task 6: Download manager (TDD)

**Files:**
- Create: `packages/local-gguf-runtime/src/hf-client/download.ts` + test
- Create: `packages/local-gguf-runtime/src/hf-client/download.integration.test.ts`

Resumable download with progress callbacks + SHA verification + cancel + pause.

- [ ] **Step 1: TDD test (msw + memfs).**

```ts
// download.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { vol, fs as memfs } from 'memfs';
import { createDownloader } from './download';

const FILE_CONTENT = Buffer.alloc(10_000, 0xAB);
const FILE_SHA256 = require('node:crypto').createHash('sha256').update(FILE_CONTENT).digest('hex');

const server = setupServer(
  http.head('https://huggingface.co/foo/bar/resolve/main/x.gguf', () => new HttpResponse(null, {
    status: 200,
    headers: { 'content-length': String(FILE_CONTENT.length), 'accept-ranges': 'bytes' },
  })),
  http.get('https://huggingface.co/foo/bar/resolve/main/x.gguf', ({ request }) => {
    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      const m = /bytes=(\d+)-(\d*)/.exec(rangeHeader)!;
      const start = parseInt(m[1], 10);
      const end = m[2] ? parseInt(m[2], 10) : FILE_CONTENT.length - 1;
      const slice = FILE_CONTENT.subarray(start, end + 1);
      return new HttpResponse(slice, {
        status: 206,
        headers: { 'content-range': `bytes ${start}-${end}/${FILE_CONTENT.length}`, 'content-length': String(slice.length) },
      });
    }
    return new HttpResponse(FILE_CONTENT, { headers: { 'content-length': String(FILE_CONTENT.length) } });
  }),
);

beforeAll(() => server.listen());
afterAll(() => server.close());

describe('downloader', () => {
  beforeEach(() => vol.reset());

  it('downloads a file end-to-end and reports progress', async () => {
    const events: { received: number; total: number }[] = [];
    const handle = await createDownloader({ fs: memfs.promises }).start({
      repoId: 'foo/bar',
      filename: 'x.gguf',
      targetPath: '/dl/x.gguf',
      expectedSha256: FILE_SHA256,
      onProgress: (p) => events.push({ received: p.bytesReceived, total: p.bytesTotal }),
    });
    expect(handle.state).toBe('completed');
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1].received).toBe(10_000);
  });

  it('resumes from partial file using Range', async () => {
    vol.fromJSON({ '/dl/x.gguf.part': FILE_CONTENT.subarray(0, 5000).toString('binary') });
    const handle = await createDownloader({ fs: memfs.promises }).start({
      repoId: 'foo/bar', filename: 'x.gguf', targetPath: '/dl/x.gguf', expectedSha256: FILE_SHA256,
    });
    expect(handle.state).toBe('completed');
    const finalBuf = (memfs.readFileSync('/dl/x.gguf') as Buffer);
    expect(finalBuf.length).toBe(10_000);
  });

  it('fails with sha256-mismatch when content does not match', async () => {
    const handle = await createDownloader({ fs: memfs.promises }).start({
      repoId: 'foo/bar', filename: 'x.gguf', targetPath: '/dl/x.gguf',
      expectedSha256: 'deadbeef'.repeat(8),
    });
    expect(handle.state).toBe('failed');
    expect(handle.errorMessage).toMatch(/sha256/i);
  });

  it('honors cancel signal', async () => {
    const downloader = createDownloader({ fs: memfs.promises });
    const ac = new AbortController();
    const p = downloader.start({
      repoId: 'foo/bar', filename: 'x.gguf', targetPath: '/dl/x.gguf', expectedSha256: FILE_SHA256, signal: ac.signal,
    });
    ac.abort();
    const handle = await p;
    expect(['cancelled', 'failed']).toContain(handle.state);
  });

  it('reports speed and ETA', async () => {
    let lastSpeed: number = 0;
    await createDownloader({ fs: memfs.promises }).start({
      repoId: 'foo/bar', filename: 'x.gguf', targetPath: '/dl/x.gguf', expectedSha256: FILE_SHA256,
      onProgress: (p) => { lastSpeed = p.speedBytesPerS; },
    });
    expect(lastSpeed).toBeGreaterThanOrEqual(0);
  });
});

import { beforeEach } from 'vitest';
```

- [ ] **Step 2: Implement.**

```ts
// packages/local-gguf-runtime/src/hf-client/download.ts
import { createHash } from 'node:crypto';
import type { DownloadProgress, DownloadState, LocalGgufError } from '@team-x/shared-types';

export class DownloadError extends Error {
  constructor(public readonly error: LocalGgufError) { super(JSON.stringify(error)); }
}

export interface DownloaderDeps {
  fetch?: typeof fetch;
  fs: {
    stat: (p: string) => Promise<{ size: number }>;
    writeFile: (p: string, data: Buffer) => Promise<void>;
    appendFile: (p: string, data: Buffer) => Promise<void>;
    rename: (a: string, b: string) => Promise<void>;
    readFile: (p: string) => Promise<Buffer>;
    unlink: (p: string) => Promise<void>;
    mkdir?: (p: string, opts: { recursive: true }) => Promise<void>;
  };
}

export interface StartDownloadOptions {
  repoId: string;
  filename: string;
  targetPath: string;
  expectedSha256?: string | null;
  token?: string | null;
  signal?: AbortSignal;
  onProgress?: (p: DownloadProgress) => void;
  handleId?: string;
}

export interface DownloadHandle {
  handleId: string;
  state: DownloadState;
  bytesReceived: number;
  bytesTotal: number;
  errorMessage: string | null;
}

export function createDownloader(deps: DownloaderDeps) {
  const fetchFn = deps.fetch ?? fetch;
  return {
    async start(opts: StartDownloadOptions): Promise<DownloadHandle> {
      const handleId = opts.handleId ?? `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const partPath = `${opts.targetPath}.part`;
      const url = `https://huggingface.co/${opts.repoId}/resolve/main/${encodeURIComponent(opts.filename)}`;
      const headers: Record<string, string> = {};
      if (opts.token) headers['authorization'] = `Bearer ${opts.token}`;

      // HEAD for total size
      const head = await fetchFn(url, { method: 'HEAD', redirect: 'follow', headers });
      if (!head.ok) {
        return failed(handleId, opts, 0, 0, `HEAD ${head.status}`);
      }
      const totalSize = parseInt(head.headers.get('content-length') ?? '0', 10);

      let already = 0;
      try { already = (await deps.fs.stat(partPath)).size; } catch { /* fresh start */ }
      if (already === totalSize && totalSize > 0) {
        await deps.fs.rename(partPath, opts.targetPath);
        return completed(handleId, opts, totalSize);
      }

      const rangeHeaders = already > 0 ? { ...headers, range: `bytes=${already}-` } : headers;
      const res = await fetchFn(url, { headers: rangeHeaders, signal: opts.signal });
      if (!res.ok && res.status !== 206 && res.status !== 200) {
        return failed(handleId, opts, already, totalSize, `HTTP ${res.status}`);
      }
      if (!res.body) return failed(handleId, opts, already, totalSize, 'empty body');

      const reader = res.body.getReader();
      let received = already;
      const sha = createHash('sha256');
      const sampleStart = Date.now();
      try {
        // Re-hash the already-downloaded portion if resuming
        if (already > 0) {
          try {
            const existing = await deps.fs.readFile(partPath);
            sha.update(existing);
          } catch { /* couldn't re-read; SHA will fail at end which is acceptable */ }
        }
        while (true) {
          if (opts.signal?.aborted) return cancelled(handleId, opts, received, totalSize);
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = Buffer.from(value);
          await deps.fs.appendFile(partPath, chunk);
          sha.update(chunk);
          received += chunk.length;
          if (opts.onProgress) {
            const elapsed = (Date.now() - sampleStart) / 1000;
            const speed = elapsed > 0 ? (received - already) / elapsed : 0;
            const remaining = totalSize - received;
            const eta = speed > 0 ? Math.round(remaining / speed) : null;
            opts.onProgress({
              handleId, repoId: opts.repoId, filename: opts.filename,
              bytesReceived: received, bytesTotal: totalSize, state: 'downloading',
              errorMessage: null, speedBytesPerS: speed, etaSeconds: eta,
            });
          }
        }
      } catch (e) {
        return failed(handleId, opts, received, totalSize, (e as Error).message);
      } finally {
        reader.releaseLock();
      }

      const actualSha = sha.digest('hex');
      if (opts.expectedSha256 && actualSha !== opts.expectedSha256) {
        try { await deps.fs.unlink(partPath); } catch {}
        return failed(handleId, opts, received, totalSize, `sha256 mismatch: expected ${opts.expectedSha256}, got ${actualSha}`);
      }
      await deps.fs.rename(partPath, opts.targetPath);
      return completed(handleId, opts, totalSize);
    },
  };
}

function completed(handleId: string, opts: StartDownloadOptions, total: number): DownloadHandle {
  if (opts.onProgress) opts.onProgress({ handleId, repoId: opts.repoId, filename: opts.filename, bytesReceived: total, bytesTotal: total, state: 'completed', errorMessage: null, speedBytesPerS: 0, etaSeconds: 0 });
  return { handleId, state: 'completed', bytesReceived: total, bytesTotal: total, errorMessage: null };
}
function cancelled(handleId: string, opts: StartDownloadOptions, received: number, total: number): DownloadHandle {
  if (opts.onProgress) opts.onProgress({ handleId, repoId: opts.repoId, filename: opts.filename, bytesReceived: received, bytesTotal: total, state: 'cancelled', errorMessage: null, speedBytesPerS: 0, etaSeconds: null });
  return { handleId, state: 'cancelled', bytesReceived: received, bytesTotal: total, errorMessage: null };
}
function failed(handleId: string, opts: StartDownloadOptions, received: number, total: number, msg: string): DownloadHandle {
  if (opts.onProgress) opts.onProgress({ handleId, repoId: opts.repoId, filename: opts.filename, bytesReceived: received, bytesTotal: total, state: 'failed', errorMessage: msg, speedBytesPerS: 0, etaSeconds: null });
  return { handleId, state: 'failed', bytesReceived: received, bytesTotal: total, errorMessage: msg };
}
```

- [ ] **Step 3: Integration test downloads TinyLlama 1.1B Q4 (~700 MB) from real HF, env-gated.**

- [ ] **Step 4: Commit.**

```
feat(hf-client): resumable downloader with SHA verification + progress + cancel
```

---

### Task 7: HfService (main process)

**Files:**
- Create: `apps/desktop/src/main/services/local-gguf/hf-service.ts` + test

Orchestrates downloads: in-memory map of `handleId → DownloadHandle`, emits progress events to renderer via `ipcMain.send`, integrates with `LibraryService` to auto-add the row on successful download.

- [ ] **Step 1: TDD.**

- [ ] **Step 2: Implement.** Critical pieces:
  - `startDownload(repoId, filename, targetFolder)` → returns `{ handleId }`, kicks off `downloader.start(...)` in the background
  - `onProgress` callback forwards to renderer (`mainWindow.webContents.send('localGguf.hf.progress', payload)`)
  - On successful completion, calls `libraryService.addFile(targetPath)` (sets `hfRepoId` + `hfFilename` for re-download capability)
  - `pause`, `resume`, `cancel` honor the in-memory state

- [ ] **Step 3: Commit.**

```
feat(local-gguf): HfService — in-memory download orchestration + library auto-add on success
```

---

### Task 8: Replace HF IPC stubs

**Files:**
- Modify: `apps/desktop/src/main/ipc/local-gguf-hf-handlers.ts` (and tests)
- Modify: `apps/desktop/src/main/index.ts`

Replace every `localGguf.hf.*` stub with HfService delegation.

```
feat(ipc): replace local-gguf HF stubs with HfService delegations
```

---

### Task 9: Renderer hooks (`use-hf-search`, `use-hf-downloads`)

**Files:**
- Create: `apps/desktop/src/renderer/src/hooks/use-hf-search.ts` + test
- Create: `apps/desktop/src/renderer/src/hooks/use-hf-downloads.ts` + test

`use-hf-search` uses React Query with a 5-second debounce on query input. `use-hf-downloads` subscribes to the progress IPC event + a polling fallback.

```
feat(local-gguf-ui): useHfSearch (debounced) + useHfDownloads (event-driven)
```

---

### Task 10: `HfBrowser` component (TDD)

**Files:**
- Create: `apps/desktop/src/renderer/src/features/local-gguf/hf-browser.tsx` + test

Search bar with debounced query + filter dropdowns (arch, params range, quant, license). Below: vertical list of search results with click → `HfModelCardPreview` drawer. Empty state, loading skeleton, error state (special-case `hf-rate-limited` with retry countdown).

- [ ] **Step 1: TDD.**

- [ ] **Step 2: Implement.**

```
feat(local-gguf-ui): HfBrowser — search + filters + results list + rate-limit handling
```

---

### Task 11: `HfModelCardPreview` (drawer/modal)

**Files:**
- Create: `apps/desktop/src/renderer/src/features/local-gguf/hf-model-card-preview.tsx` + test

Modal showing description, license, tags, list of GGUF siblings with size + "Download" button per row. Clicking Download dispatches `useHfDownloads().start(...)` and closes the drawer.

```
feat(local-gguf-ui): HfModelCardPreview — sibling list + download dispatch
```

---

### Task 12: `HfDownloadStrip` (bottom strip)

**Files:**
- Create: `apps/desktop/src/renderer/src/features/local-gguf/hf-download-strip.tsx` + test

Fixed bottom strip showing active downloads with progress bar, pause/resume/cancel buttons. Disappears when no downloads in flight. Persists position across tab switches inside the page.

```
feat(local-gguf-ui): HfDownloadStrip — bottom strip with progress + pause/resume/cancel per download
```

---

### Task 13: Mount `HfBrowser` in `SettingsLocalModelsPage`

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/local-gguf/settings-local-models-page.tsx`

Replace the "Coming in Phase 7" placeholder with `<HfBrowser />`. Render `<HfDownloadStrip />` at the page level so it persists across tabs.

```
feat(local-gguf-ui): mount HfBrowser + HfDownloadStrip on Local Models page
```

---

### Task 14: E2E spec — `local-gguf-hf-browser.spec.ts`

**Files:**
- Create: `apps/desktop/e2e/local-gguf-hf-browser.spec.ts`

Uses an mock-HF backend setup (msw or a local test server) for E2E. Walks: open HF tab → search → click result → see preview → click download → see progress → see library entry appear.

```
test(e2e): local-gguf-hf-browser — full search → download → library auto-add cycle (mocked HF)
```

---

### Task 15: CHANGELOG + quality gate + PR

```markdown
### Added
- **Local & Networked GGUF Support (Phase 7 — Hugging Face Browser)**:
  in-app HF Hub search, filter (arch / params / quant / license), model
  card preview drawer with sibling list, resumable download manager
  with SHA verification, progress + pause/resume/cancel UI, bottom
  download strip across the page. New `@team-x/local-gguf-runtime/hf-client`
  package surface. HfService orchestrates downloads and auto-adds the
  library row on successful completion. Rate-limit handling with typed
  `hf-rate-limited` error + Retry-After countdown. Optional HF token
  (stored in keytar) raises the rate limit from anonymous to
  authenticated tier.
```

Quality gate per master plan § CR-6/CR-7. Perf assertions:
- HF search response → UI render < 800 ms p50 (msw-mocked).
- Download throughput ≥ disk-write throughput minus 5% (no in-process bottleneck).

**Codex Stage 3 MANDATORY** (HTTP client + downloads + SHA).

---

## Phase 7 — Spec coverage map

| Spec section | Implemented by |
|---|---|
| § 4.1.6 HF Hub browser + downloader | Tasks 5, 6, 10, 11, 12 |
| § 10.2 HF tab UI | Tasks 10, 11, 12, 13 |
| § 15 errors `hf-download-failed`, `hf-rate-limited` | Tasks 3, 5, 6 |
| § 19 acceptance criterion #4 (HF search → download → in-library → chat) | Tasks 7, 14 |
| Spike S5 carry-over | Tasks 3, 4, 5, 6 |
