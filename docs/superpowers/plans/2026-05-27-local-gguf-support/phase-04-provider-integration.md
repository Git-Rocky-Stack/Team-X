# Phase 4 — Provider Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
>
> **Cross-phase rules:** See master plan § "Cross-phase rules" (CR-1 through CR-10).
>
> **Codex Stage 3 review:** REQUIRED. Provider-router is a security-sensitive boundary — Codex independent review is mandatory.

**Goal:** Wire local GGUF into the `@team-x/provider-router` so the orchestrator and agentic loop can drive a loaded GGUF (local subprocess OR remote LAN endpoint) through the same streaming HTTP path used for every cloud provider. Two new adapters: `local-gguf` (chat) and `local-gguf-embed` (embeddings). Two new registry entries (privacy tier `Local`, cost `$0`). Adaptive routing extended.

**Architecture:** Both adapters are thin OpenAI-compat wrappers. URL resolution is the only non-trivial logic — for `source_type='file'|'folder-entry'` models the adapter calls into `PoolService.acquireOrLoad(modelId)` to get a `baseUrl`; for `source_type='remote-endpoint'` it reads the endpoint row. Tool gating: if the model row has `isToolCapable=false`, the chat adapter strips `tools` and `tool_choice` from the outbound request and surfaces a typed warning event.

**Spec coverage:** Implements spec § 8 (provider integration), § 4.1 privacy tier `Local`, adaptive routing extension.

**Estimated PR size:** ~1,500 LOC production + ~2,000 LOC tests. Single PR.

---

## Files this phase touches

### New files

```
packages/provider-router/src/adapters/
├── local-gguf.ts                                  (chat adapter — OpenAI-compat over resolved URL)
├── local-gguf.test.ts
├── local-gguf-embed.ts                            (embeddings adapter)
├── local-gguf-embed.test.ts
├── local-gguf-url-resolver.ts                     (pool / endpoint lookup)
└── local-gguf-url-resolver.test.ts
```

### Modified files

```
packages/provider-router/src/registry.ts          (register both adapters with Local tier, $0 cost)
packages/provider-router/src/registry.test.ts     (cover new registrations)
packages/provider-router/src/index.ts             (export new types)
packages/provider-router/src/adaptive-routing.ts  (handle local-gguf in Lean/Auto/Always-On)
packages/provider-router/src/adaptive-routing.test.ts
apps/desktop/src/main/index.ts                    (inject PoolService + endpoints repo into provider-router)
CHANGELOG.md
```

---

## Tasks

### Task 1: Branch + sync

```bash
git checkout main && git pull --ff-only
git log --oneline -20 | grep -i "phase 3\|phase-03"
git checkout -b feat/v3.3.0-phase-04-provider-integration
```

---

### Task 2: URL resolver (TDD)

**Files:**
- Create: `packages/provider-router/src/adapters/local-gguf-url-resolver.ts`
- Create: `packages/provider-router/src/adapters/local-gguf-url-resolver.test.ts`

- [ ] **Step 1: TDD test.**

```ts
// packages/provider-router/src/adapters/local-gguf-url-resolver.test.ts
import { describe, expect, it, vi } from 'vitest';
import { resolveLocalGgufUrl, type ResolveDeps } from './local-gguf-url-resolver';

describe('resolveLocalGgufUrl', () => {
  it('returns pool baseUrl for file-source models', async () => {
    const deps: ResolveDeps = {
      getModel: async (id) => ({
        id, sourceType: 'file', sourcePath: '/m.gguf', endpointId: null,
        // ... other LocalModel fields, minimal for the test
      } as never),
      acquireFromPool: async (id) => ({ baseUrl: 'http://127.0.0.1:50001', pid: 12345 }),
      getEndpoint: async () => null,
      readAuthHeader: async () => null,
    };
    const result = await resolveLocalGgufUrl('model-1', deps);
    expect(result.baseUrl).toBe('http://127.0.0.1:50001');
    expect(result.authHeader).toBeNull();
  });

  it('returns endpoint baseUrl for remote-endpoint models', async () => {
    const deps: ResolveDeps = {
      getModel: async (id) => ({
        id, sourceType: 'remote-endpoint', sourcePath: null, endpointId: 'ep-1',
      } as never),
      acquireFromPool: async () => { throw new Error('should not be called'); },
      getEndpoint: async (id) => ({
        id, name: 'LM Studio', baseUrl: 'http://192.168.1.50:1234',
        authHeaderKeyRef: null, privacyTier: 'Local', status: 'reachable',
      } as never),
      readAuthHeader: async () => null,
    };
    const result = await resolveLocalGgufUrl('model-2', deps);
    expect(result.baseUrl).toBe('http://192.168.1.50:1234');
  });

  it('injects Authorization header when endpoint has an authHeaderKeyRef', async () => {
    const deps: ResolveDeps = {
      getModel: async () => ({
        id: 'm', sourceType: 'remote-endpoint', sourcePath: null, endpointId: 'ep-1',
      } as never),
      acquireFromPool: async () => { throw new Error(); },
      getEndpoint: async () => ({
        id: 'ep-1', name: 'X', baseUrl: 'http://x', authHeaderKeyRef: 'team-x.local-gguf.ep:X',
        privacyTier: 'Local', status: 'reachable',
      } as never),
      readAuthHeader: async (ref) => `Bearer ${ref}-token`,
    };
    const result = await resolveLocalGgufUrl('m', deps);
    expect(result.authHeader).toBe('Bearer team-x.local-gguf.ep:X-token');
  });

  it('throws when model row not found', async () => {
    const deps: ResolveDeps = {
      getModel: async () => null,
      acquireFromPool: async () => { throw new Error(); },
      getEndpoint: async () => null,
      readAuthHeader: async () => null,
    };
    await expect(resolveLocalGgufUrl('nope', deps)).rejects.toThrow(/not found/i);
  });

  it('throws when remote-endpoint model has missing endpoint row', async () => {
    const deps: ResolveDeps = {
      getModel: async () => ({ id: 'm', sourceType: 'remote-endpoint', endpointId: 'ep-gone' } as never),
      acquireFromPool: async () => { throw new Error(); },
      getEndpoint: async () => null,
      readAuthHeader: async () => null,
    };
    await expect(resolveLocalGgufUrl('m', deps)).rejects.toThrow(/endpoint.*not found/i);
  });
});
```

- [ ] **Step 2: Run; expect fail.**

- [ ] **Step 3: Implement.**

```ts
// packages/provider-router/src/adapters/local-gguf-url-resolver.ts
import type { LocalModel, RemoteEndpoint } from '@team-x/shared-types';

export interface ResolveDeps {
  getModel: (id: string) => Promise<LocalModel | null>;
  acquireFromPool: (modelId: string) => Promise<{ baseUrl: string; pid: number }>;
  getEndpoint: (endpointId: string) => Promise<RemoteEndpoint | null>;
  readAuthHeader: (keyRef: string) => Promise<string | null>;
}

export interface ResolvedUrl {
  baseUrl: string;
  authHeader: string | null;
}

export async function resolveLocalGgufUrl(
  modelId: string,
  deps: ResolveDeps,
): Promise<ResolvedUrl> {
  const model = await deps.getModel(modelId);
  if (!model) throw new Error(`local-gguf model not found: ${modelId}`);

  if (model.sourceType === 'remote-endpoint') {
    if (!model.endpointId) throw new Error(`remote-endpoint model has no endpointId: ${modelId}`);
    const endpoint = await deps.getEndpoint(model.endpointId);
    if (!endpoint) throw new Error(`local-gguf endpoint not found: ${model.endpointId}`);
    let authHeader: string | null = null;
    if (endpoint.authHeaderKeyRef) {
      authHeader = await deps.readAuthHeader(endpoint.authHeaderKeyRef);
    }
    return { baseUrl: endpoint.baseUrl, authHeader };
  }

  // file or folder-entry → pool
  const handle = await deps.acquireFromPool(modelId);
  return { baseUrl: handle.baseUrl, authHeader: null };
}
```

- [ ] **Step 4: Run + commit.**

```
feat(provider-router): local-gguf URL resolver (pool vs remote-endpoint)
```

---

### Task 3: `local-gguf` chat adapter (TDD)

**Files:**
- Create: `packages/provider-router/src/adapters/local-gguf.ts`
- Create: `packages/provider-router/src/adapters/local-gguf.test.ts`

Mirror the structure of the existing `openai-compat.ts` adapter — read it first to match streaming, request shape, error handling, abort signal conventions.

- [ ] **Step 1: Read openai-compat.ts for pattern.**

```bash
cat packages/provider-router/src/adapters/openai-compat.ts
```

- [ ] **Step 2: TDD test (mocked URL resolver + mocked fetch).**

Tests cover: streamed chat completion, tool-gating (model with `isToolCapable=false` has `tools` stripped from outbound), chat-template override propagation, abort signal honored, error mapping (4xx → typed `LocalGgufError` variants).

```ts
// packages/provider-router/src/adapters/local-gguf.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createLocalGgufAdapter } from './local-gguf';

describe('local-gguf chat adapter', () => {
  it('streams a chat completion via OpenAI-compat SSE', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: makeSseStream([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    });
    const adapter = createLocalGgufAdapter({
      resolveUrl: async () => ({ baseUrl: 'http://127.0.0.1:50001', authHeader: null }),
      getModelRow: async () => ({ id: 'm', isToolCapable: false, chatTemplateOverride: null } as never),
      fetch: fakeFetch as never,
    });
    const chunks: string[] = [];
    for await (const c of adapter.streamChat({ model: 'm', messages: [{ role: 'user', content: 'hi' }] })) {
      if (c.kind === 'token') chunks.push(c.text);
    }
    expect(chunks.join('')).toBe('Hello world');
  });

  it('strips tools when the model is not tool-capable', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, body: makeSseStream(['data: [DONE]\n\n']) });
    const adapter = createLocalGgufAdapter({
      resolveUrl: async () => ({ baseUrl: 'http://x', authHeader: null }),
      getModelRow: async () => ({ id: 'm', isToolCapable: false, chatTemplateOverride: null } as never),
      fetch: fakeFetch as never,
    });
    for await (const _ of adapter.streamChat({
      model: 'm',
      messages: [],
      tools: [{ type: 'function', function: { name: 't', parameters: {} } }],
      toolChoice: 'auto',
    } as never)) { /* drain */ }
    const body = JSON.parse((fakeFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  it('passes through tools when the model IS tool-capable', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, body: makeSseStream(['data: [DONE]\n\n']) });
    const adapter = createLocalGgufAdapter({
      resolveUrl: async () => ({ baseUrl: 'http://x', authHeader: null }),
      getModelRow: async () => ({ id: 'm', isToolCapable: true, chatTemplateOverride: null } as never),
      fetch: fakeFetch as never,
    });
    for await (const _ of adapter.streamChat({
      model: 'm', messages: [],
      tools: [{ type: 'function', function: { name: 'a', parameters: {} } }],
    } as never)) {}
    const body = JSON.parse((fakeFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.tools).toHaveLength(1);
  });

  it('includes chat_template field when override is set', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, body: makeSseStream(['data: [DONE]\n\n']) });
    const adapter = createLocalGgufAdapter({
      resolveUrl: async () => ({ baseUrl: 'http://x', authHeader: null }),
      getModelRow: async () => ({ id: 'm', isToolCapable: false, chatTemplateOverride: '<custom>' } as never),
      fetch: fakeFetch as never,
    });
    for await (const _ of adapter.streamChat({ model: 'm', messages: [] })) {}
    const body = JSON.parse((fakeFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.chat_template).toBe('<custom>');
  });

  it('injects Authorization header when resolveUrl returns one', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, body: makeSseStream(['data: [DONE]\n\n']) });
    const adapter = createLocalGgufAdapter({
      resolveUrl: async () => ({ baseUrl: 'http://x', authHeader: 'Bearer T' }),
      getModelRow: async () => ({ id: 'm', isToolCapable: false, chatTemplateOverride: null } as never),
      fetch: fakeFetch as never,
    });
    for await (const _ of adapter.streamChat({ model: 'm', messages: [] })) {}
    const headers = (fakeFetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer T');
  });

  it('honors AbortSignal', async () => {
    const fakeFetch = vi.fn().mockImplementation((_url, init) => new Promise((_, reject) => {
      (init.signal as AbortSignal).addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const adapter = createLocalGgufAdapter({
      resolveUrl: async () => ({ baseUrl: 'http://x', authHeader: null }),
      getModelRow: async () => ({ id: 'm', isToolCapable: false, chatTemplateOverride: null } as never),
      fetch: fakeFetch as never,
    });
    const ac = new AbortController();
    const iter = adapter.streamChat({ model: 'm', messages: [], signal: ac.signal });
    setTimeout(() => ac.abort(), 5);
    await expect((async () => { for await (const _ of iter) {} })()).rejects.toThrow();
  });

  it('maps endpoint-unreachable HTTP error', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: false, status: 0, statusText: 'fetch failed' });
    const adapter = createLocalGgufAdapter({
      resolveUrl: async () => ({ baseUrl: 'http://x', authHeader: null }),
      getModelRow: async () => ({ id: 'm', isToolCapable: false, chatTemplateOverride: null } as never),
      fetch: fakeFetch as never,
    });
    const iter = adapter.streamChat({ model: 'm', messages: [] });
    await expect((async () => { for await (const _ of iter) {} })()).rejects.toMatchObject({ error: { kind: 'endpoint-unreachable' } });
  });
});

function makeSseStream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
      controller.close();
    },
  });
}
```

- [ ] **Step 3: Run; expect fail.**

- [ ] **Step 4: Implement.**

```ts
// packages/provider-router/src/adapters/local-gguf.ts
import type { LocalGgufError, LocalModel } from '@team-x/shared-types';
import type { ResolveDeps } from './local-gguf-url-resolver';

export class LocalGgufAdapterError extends Error {
  constructor(public readonly error: LocalGgufError) {
    super(`LocalGgufAdapterError: ${JSON.stringify(error)}`);
    this.name = 'LocalGgufAdapterError';
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface ChatTool {
  type: 'function';
  function: { name: string; description?: string; parameters: object };
}

export interface StreamChatOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
  max_tokens?: number;
  tools?: ChatTool[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  signal?: AbortSignal;
}

export type StreamChatChunk =
  | { kind: 'token'; text: string }
  | { kind: 'tool_call'; id: string; name: string; arguments: string }
  | { kind: 'done'; usage?: { prompt_tokens: number; completion_tokens: number } };

export interface LocalGgufAdapterDeps {
  resolveUrl: (modelId: string) => Promise<{ baseUrl: string; authHeader: string | null }>;
  getModelRow: (modelId: string) => Promise<Pick<LocalModel, 'id' | 'isToolCapable' | 'chatTemplateOverride'>>;
  fetch?: typeof fetch;
}

export function createLocalGgufAdapter(deps: LocalGgufAdapterDeps) {
  const fetchFn = deps.fetch ?? fetch;
  return {
    async *streamChat(opts: StreamChatOptions): AsyncGenerator<StreamChatChunk> {
      const [{ baseUrl, authHeader }, model] = await Promise.all([
        deps.resolveUrl(opts.model),
        deps.getModelRow(opts.model),
      ]);

      const body: Record<string, unknown> = {
        model: opts.model,
        messages: opts.messages,
        stream: true,
      };
      if (opts.temperature !== undefined) body.temperature = opts.temperature;
      if (opts.top_p !== undefined) body.top_p = opts.top_p;
      if (opts.top_k !== undefined) body.top_k = opts.top_k;
      if (opts.max_tokens !== undefined) body.max_tokens = opts.max_tokens;

      if (opts.tools && model.isToolCapable) {
        body.tools = opts.tools;
        if (opts.toolChoice) body.tool_choice = opts.toolChoice;
      }

      if (model.chatTemplateOverride) {
        body.chat_template = model.chatTemplateOverride;
      }

      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (authHeader) headers['Authorization'] = authHeader;

      let res;
      try {
        res = await fetchFn(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: opts.signal,
        });
      } catch (e) {
        throw new LocalGgufAdapterError({ kind: 'endpoint-unreachable', url: baseUrl });
      }
      if (!res.ok) {
        if (res.status === 0) throw new LocalGgufAdapterError({ kind: 'endpoint-unreachable', url: baseUrl, httpStatus: res.status });
        if (res.status === 401 || res.status === 403) throw new LocalGgufAdapterError({ kind: 'endpoint-auth-failed', url: baseUrl });
        throw new LocalGgufAdapterError({ kind: 'endpoint-unreachable', url: baseUrl, httpStatus: res.status });
      }
      if (!res.body) {
        throw new LocalGgufAdapterError({ kind: 'endpoint-unreachable', url: baseUrl });
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split(/\n\n/);
          buffer = events.pop() ?? '';
          for (const ev of events) {
            const line = ev.trim();
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') {
              yield { kind: 'done' };
              return;
            }
            try {
              const obj = JSON.parse(payload);
              const choice = obj.choices?.[0];
              const delta = choice?.delta;
              if (delta?.content) yield { kind: 'token', text: delta.content };
              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  yield { kind: 'tool_call', id: tc.id, name: tc.function?.name, arguments: tc.function?.arguments };
                }
              }
            } catch { /* swallow malformed line */ }
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
}

export type LocalGgufAdapter = ReturnType<typeof createLocalGgufAdapter>;
```

- [ ] **Step 5: Run + commit.**

```
feat(provider-router): local-gguf chat adapter — OpenAI-compat streaming, tool gating, chat-template override, abort signal
```

---

### Task 4: `local-gguf-embed` adapter (TDD)

**Files:**
- Create: `packages/provider-router/src/adapters/local-gguf-embed.ts`
- Create: `packages/provider-router/src/adapters/local-gguf-embed.test.ts`

Mirror `ollama-embed.ts` — POST `/v1/embeddings`, returns vectors.

- [ ] **Step 1: Read ollama-embed.ts for the pattern.**

```bash
cat packages/provider-router/src/adapters/ollama-embed.ts
```

- [ ] **Step 2: TDD test.** Cover: successful embed, batch input, abort, HTTP error mapping.

- [ ] **Step 3: Implement.**

```ts
// packages/provider-router/src/adapters/local-gguf-embed.ts
export interface LocalGgufEmbedDeps {
  resolveUrl: (modelId: string) => Promise<{ baseUrl: string; authHeader: string | null }>;
  fetch?: typeof fetch;
}

export interface EmbedOptions {
  model: string;
  input: string | string[];
  signal?: AbortSignal;
}

export function createLocalGgufEmbedAdapter(deps: LocalGgufEmbedDeps) {
  const fetchFn = deps.fetch ?? fetch;
  return {
    async embed(opts: EmbedOptions): Promise<number[][]> {
      const { baseUrl, authHeader } = await deps.resolveUrl(opts.model);
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (authHeader) headers['Authorization'] = authHeader;
      const res = await fetchFn(`${baseUrl}/v1/embeddings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: opts.model, input: opts.input }),
        signal: opts.signal,
      });
      if (!res.ok) throw new Error(`embeddings failed: ${res.status}`);
      const json = await res.json();
      return json.data.map((d: { embedding: number[] }) => d.embedding);
    },
  };
}

export type LocalGgufEmbedAdapter = ReturnType<typeof createLocalGgufEmbedAdapter>;
```

- [ ] **Step 4: Run + commit.**

```
feat(provider-router): local-gguf-embed adapter (POST /v1/embeddings)
```

---

### Task 5: Register both adapters in `registry.ts`

**Files:**
- Modify: `packages/provider-router/src/registry.ts`
- Modify: `packages/provider-router/src/registry.test.ts`
- Modify: `packages/provider-router/src/index.ts`

- [ ] **Step 1: Read existing `registry.ts` to match the registration shape.**

- [ ] **Step 2: Add entries for `local-gguf` and `local-gguf-embed`.**

```ts
// in registry.ts, alongside existing entries:
{
  id: 'local-gguf',
  displayName: 'Local GGUF',
  privacyTier: 'Local',
  capabilities: { chat: true, embed: false, tools: 'conditional' /* per-model */ },
  costModel: { input: 0, output: 0 },
  // Adapter is constructed at app boot with PoolService + repo deps; registry
  // just records the metadata. Real wiring happens in apps/desktop/src/main/index.ts.
},
{
  id: 'local-gguf-embed',
  displayName: 'Local GGUF (Embeddings)',
  privacyTier: 'Local',
  capabilities: { chat: false, embed: true, tools: false },
  costModel: { input: 0, output: 0 },
},
```

(Adjust the shape to whatever `registry.ts` currently expects.)

- [ ] **Step 3: Extend `registry.test.ts`.**

- [ ] **Step 4: Export adapter factories from `index.ts`.**

- [ ] **Step 5: Run + commit.**

```
feat(provider-router): register local-gguf + local-gguf-embed (Local tier, $0 cost)
```

---

### Task 6: Adaptive routing extension

**Files:**
- Modify: `packages/provider-router/src/adaptive-routing.ts`
- Modify: `packages/provider-router/src/adaptive-routing.test.ts`

Strategy:
- `Lean`: prefer `local-gguf` when ≥ 1 model is loaded in the pool
- `Auto`: `local-gguf` competes on hardware-profile-aware scoring (existing path)
- `Always-On`: same as `Lean`

- [ ] **Step 1: Read existing `adaptive-routing.ts`.**

- [ ] **Step 2: Add test cases for Lean / Auto / Always-On with local-gguf available + loaded.**

- [ ] **Step 3: Implement the routing changes.**

- [ ] **Step 4: Run + commit.**

```
feat(provider-router): adaptive routing prefers local-gguf in Lean/Always-On when pool non-empty
```

---

### Task 7: Wire adapters in `apps/desktop/src/main/index.ts`

**Files:**
- Modify: `apps/desktop/src/main/index.ts`

- [ ] **Step 1: At app boot, after PoolService and DbClient are constructed, instantiate the adapters with proper deps:**

```ts
import { createLocalGgufAdapter } from '@team-x/provider-router/adapters/local-gguf';
import { createLocalGgufEmbedAdapter } from '@team-x/provider-router/adapters/local-gguf-embed';
import { resolveLocalGgufUrl } from '@team-x/provider-router/adapters/local-gguf-url-resolver';
import keytar from 'keytar';

const resolveDeps = {
  getModel: async (id) => dbClient.localModels.getById(id),
  acquireFromPool: async (id) => poolService.acquireOrLoad(id),
  getEndpoint: async (id) => dbClient.localModelEndpoints.getById(id),
  readAuthHeader: async (ref) => keytar.getPassword('team-x', ref),
};

const localGgufAdapter = createLocalGgufAdapter({
  resolveUrl: (modelId) => resolveLocalGgufUrl(modelId, resolveDeps),
  getModelRow: async (id) => {
    const m = await dbClient.localModels.getById(id);
    if (!m) throw new Error(`model ${id} not found`);
    return { id: m.id, isToolCapable: m.isToolCapable, chatTemplateOverride: m.chatTemplateOverride };
  },
});

const localGgufEmbedAdapter = createLocalGgufEmbedAdapter({
  resolveUrl: (modelId) => resolveLocalGgufUrl(modelId, resolveDeps),
});

// Register with the existing ProviderRouter instance
providerRouter.register('local-gguf', localGgufAdapter);
providerRouter.register('local-gguf-embed', localGgufEmbedAdapter);
```

(Exact shape matches the existing ProviderRouter API — refer to the index.ts for the correct method name.)

- [ ] **Step 2: Run typecheck + full test.**

- [ ] **Step 3: Commit.**

```
feat(main): wire local-gguf + local-gguf-embed adapters at app boot
```

---

### Task 8: $0 cost verification test (regression guard)

**Files:**
- Create: `packages/telemetry-core/src/local-gguf-cost.test.ts` (or extend existing)

Confirm that a chat turn through `local-gguf` produces `costInUsd = 0` in the telemetry layer. Mirrors the existing Ollama-zero-cost test.

- [ ] **Step 1: Read existing zero-cost tests (Ollama path).**

- [ ] **Step 2: Add a regression test for `local-gguf` + `local-gguf-embed`.**

- [ ] **Step 3: Run + commit.**

```
test(telemetry-core): local-gguf + local-gguf-embed cost = $0 regression test
```

---

### Task 9: CHANGELOG + quality gate + PR

```markdown
### Added
- **Local & Networked GGUF Support (Phase 4 — Provider integration)**: two
  new adapters in `@team-x/provider-router` — `local-gguf` (chat, OpenAI-
  compat streaming, tool gating based on per-model `isToolCapable`,
  chat-template override propagation) and `local-gguf-embed` (embeddings).
  URL resolver dispatches to PoolService for file-source models and to
  the endpoints repo for remote-endpoint models, with optional keytar-
  backed Authorization header injection. Provider registry entries added
  with privacy tier `Local` and $0 cost. Adaptive routing extended to
  prefer local-gguf in Lean and Always-On strategies when the pool is
  non-empty.
```

Per-phase quality gate per master plan § CR-6 + CR-7. Performance assertions:
- Adapter overhead < 5 ms before first token streams (excluding model warmup).
- URL resolver < 2 ms when model + endpoint rows are cached in the repo.

Codex Stage 3 MANDATORY (provider-router behavior change).

---

## Phase 4 — Spec coverage map

| Spec section | Implemented by |
|---|---|
| § 8.1 chat adapter | Tasks 2, 3 |
| § 8.1 tool gating | Task 3 |
| § 8.1 chat-template override propagation | Task 3 |
| § 8.2 embeddings adapter | Task 4 |
| § 8.3 provider registry registration (Local tier, $0) | Task 5 |
| § 8.4 adaptive routing | Task 6 |
| § 8.5 cost tracking ($0 like Ollama) | Tasks 5, 8 |
| § 15 errors `endpoint-unreachable`, `endpoint-auth-failed` | Task 3 |
