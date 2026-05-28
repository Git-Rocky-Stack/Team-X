# Phase 9 — Local Embeddings + RAG Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
>
> **Cross-phase rules:** See master plan § "Cross-phase rules" (CR-1 through CR-10).
>
> **Codex Stage 3 review:** NOT MANDATORY (internal RAG integration; no new external surface).

**Goal:** Wire `local-gguf-embed` (the embeddings adapter shipped in Phase 4) into Team-X's RAG pipeline so users can pick a local GGUF embedding model in Settings → Defaults and have all RAG embeddings flow through it. Switching embedding models triggers an amber re-index confirmation; if accepted, the existing `rag-rebuild.ts` service re-embeds the vault.

**Architecture:** `packages/intelligence/src/rag/embeddings.ts` currently branches between `openai-embed` and `ollama-embed`. Add a third branch for `local-gguf-embed` that triggers when `localGguf.embeddingModelId` is set in runtime settings. On change, `rag-rebuild` runs as a background job with progress events to the UI.

**Spec coverage:** Implements spec § 9 (RAG integration), § 4.1.12 (local embedding models), § 10 Defaults tab (the previously-placeholder tab from Phase 5 fills in here).

**Estimated PR size:** ~1,200 LOC production + ~1,500 LOC tests. Single PR.

---

## Files this phase touches

### New files

```
packages/intelligence/src/rag/local-gguf-embeddings-branch.ts   (the new routing branch)
packages/intelligence/src/rag/local-gguf-embeddings-branch.test.ts

apps/desktop/src/main/services/local-gguf/
├── embedding-router.ts                            (reads runtime settings, dispatches to right adapter)
└── embedding-router.test.ts

apps/desktop/src/renderer/src/features/local-gguf/
├── defaults-tab.tsx                               (replaces the Phase 5 placeholder)
├── defaults-tab.test.tsx
├── embedding-model-picker.tsx
├── embedding-model-picker.test.tsx
├── reindex-confirmation-dialog.tsx
└── reindex-confirmation-dialog.test.tsx
```

### Modified files

```
packages/intelligence/src/rag/embeddings.ts        (add local-gguf branch)
packages/intelligence/src/rag/embeddings.test.ts
apps/desktop/src/main/services/rag-rebuild.ts      (no behavior change, just verify it works through the new path)
apps/desktop/src/main/index.ts                     (wire embedding-router into the rag pipeline)
apps/desktop/src/renderer/src/features/local-gguf/settings-local-models-page.tsx (mount DefaultsTab)
e2e/local-gguf-rag-embedding-switch.spec.ts
CHANGELOG.md
```

---

## Tasks

### Task 1: Branch + sync

```bash
git checkout main && git pull --ff-only
git checkout -b feat/v3.3.0-phase-09-local-embeddings-rag
```

---

### Task 2: Embedding router service (TDD)

**Files:**
- Create: `apps/desktop/src/main/services/local-gguf/embedding-router.ts` + test

Reads `localGguf.embeddingModelId` from runtime settings; if non-null, returns the `local-gguf-embed` adapter; if null, returns the existing `ollama-embed` or `openai-embed` based on whatever Team-X currently uses.

- [ ] **Step 1: TDD test.**

```ts
// embedding-router.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createEmbeddingRouter } from './embedding-router';

describe('createEmbeddingRouter', () => {
  it('routes to local-gguf-embed when embeddingModelId is set', async () => {
    const localEmbed = { embed: vi.fn().mockResolvedValue([[0.1, 0.2]]) };
    const ollamaEmbed = { embed: vi.fn().mockResolvedValue([[0.9, 0.8]]) };
    const router = createEmbeddingRouter({
      getEmbeddingModelId: async () => 'model-uuid-1',
      localGgufEmbed: localEmbed as never,
      ollamaEmbed: ollamaEmbed as never,
    });
    const vec = await router.embed({ input: 'hello' });
    expect(localEmbed.embed).toHaveBeenCalledWith({ input: 'hello', model: 'model-uuid-1' });
    expect(ollamaEmbed.embed).not.toHaveBeenCalled();
    expect(vec).toEqual([[0.1, 0.2]]);
  });

  it('routes to ollama-embed when embeddingModelId is null', async () => {
    const localEmbed = { embed: vi.fn() };
    const ollamaEmbed = { embed: vi.fn().mockResolvedValue([[0.9, 0.8]]) };
    const router = createEmbeddingRouter({
      getEmbeddingModelId: async () => null,
      localGgufEmbed: localEmbed as never,
      ollamaEmbed: ollamaEmbed as never,
    });
    await router.embed({ input: 'hello' });
    expect(ollamaEmbed.embed).toHaveBeenCalled();
    expect(localEmbed.embed).not.toHaveBeenCalled();
  });

  it('passes through model ID to local-gguf-embed', async () => {
    const localEmbed = { embed: vi.fn().mockResolvedValue([[0]]) };
    const router = createEmbeddingRouter({
      getEmbeddingModelId: async () => 'specific-uuid',
      localGgufEmbed: localEmbed as never,
      ollamaEmbed: { embed: vi.fn() } as never,
    });
    await router.embed({ input: ['a', 'b'] });
    expect(localEmbed.embed).toHaveBeenCalledWith({ input: ['a', 'b'], model: 'specific-uuid' });
  });
});
```

- [ ] **Step 2: Implement.**

```ts
// embedding-router.ts
export interface EmbeddingAdapter {
  embed: (opts: { input: string | string[]; model?: string }) => Promise<number[][]>;
}

export interface EmbeddingRouterDeps {
  getEmbeddingModelId: () => Promise<string | null>;
  localGgufEmbed: EmbeddingAdapter;
  ollamaEmbed: EmbeddingAdapter;
}

export interface RouterEmbedOptions {
  input: string | string[];
}

export function createEmbeddingRouter(deps: EmbeddingRouterDeps) {
  return {
    async embed(opts: RouterEmbedOptions): Promise<number[][]> {
      const id = await deps.getEmbeddingModelId();
      if (id) {
        return deps.localGgufEmbed.embed({ input: opts.input, model: id });
      }
      return deps.ollamaEmbed.embed({ input: opts.input });
    },
  };
}

export type EmbeddingRouter = ReturnType<typeof createEmbeddingRouter>;
```

- [ ] **Step 3: Run + commit.**

```
feat(local-gguf): EmbeddingRouter dispatches between local-gguf-embed and existing path
```

---

### Task 3: Wire EmbeddingRouter into the RAG pipeline

**Files:**
- Modify: `packages/intelligence/src/rag/embeddings.ts`
- Modify: `packages/intelligence/src/rag/embeddings.test.ts`

Replace the existing direct dispatch with a call into the injected router. Existing tests should still pass with the router stubbed to fall through to `ollama-embed`.

- [ ] **Step 1: Read existing embeddings.ts to understand current shape.**

- [ ] **Step 2: Refactor to accept an injected embedding function (or router).**

- [ ] **Step 3: Update tests.**

- [ ] **Step 4: Commit.**

```
refactor(intelligence): RAG embeddings.ts accepts injected router (covers local + ollama + openai paths)
```

---

### Task 4: Wire router at app boot

**Files:**
- Modify: `apps/desktop/src/main/index.ts`

After `localGgufEmbedAdapter` and the existing `ollamaEmbedAdapter` are constructed:

```ts
const embeddingRouter = createEmbeddingRouter({
  getEmbeddingModelId: async () => localGgufSettings.get().embeddingModelId,
  localGgufEmbed: localGgufEmbedAdapter,
  ollamaEmbed: ollamaEmbedAdapter,
});

// Pass to the RAG service constructor (replacing whatever was previously passed)
const ragIndexer = createRagIndexer({ embeddings: embeddingRouter, /* ... */ });
```

(Adjust to match the actual current wiring in index.ts.)

```
feat(main): wire EmbeddingRouter into RAG pipeline at boot
```

---

### Task 5: `EmbeddingModelPicker` component (TDD)

**Files:**
- Create: `apps/desktop/src/renderer/src/features/local-gguf/embedding-model-picker.tsx` + test

Dropdown listing all `is_embedding_model = 1` rows from the library. Default "None — use existing (Ollama) path".

- [ ] **Step 1: TDD.**

```tsx
// excerpt
import { useQuery } from '@tanstack/react-query';
import { useLocalModelsBySourceType } from '@/hooks/use-local-models';

export function EmbeddingModelPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const { data } = useQuery({
    queryKey: ['localGguf', 'embedding-models'],
    queryFn: async () => {
      const all = await window.teamXApi.localGguf.library.list();
      return all.filter((m) => m.isEmbeddingModel);
    },
  });
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-medium" htmlFor="embedding-model-picker">Embedding model for RAG</label>
      <select
        id="embedding-model-picker"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="text-xs rounded border border-border bg-card px-2 py-1"
      >
        <option value="">None — use Ollama / existing path</option>
        {data?.map((m) => (
          <option key={m.id} value={m.id}>{m.displayName} ({m.ggufQuant ?? '?'})</option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Run + commit.**

```
feat(local-gguf-ui): EmbeddingModelPicker filters library to embedding-arch rows
```

---

### Task 6: `ReindexConfirmationDialog` (TDD)

**Files:**
- Create: `apps/desktop/src/renderer/src/features/local-gguf/reindex-confirmation-dialog.tsx` + test

Amber-styled confirmation modal explaining that switching embedding models requires re-indexing N RAG sources (~ M minutes). Confirm calls into the runtime-settings + triggers `rag-rebuild`.

- [ ] **Step 1: TDD test.**

```tsx
// reindex-confirmation-dialog.tsx
export interface ReindexConfirmationDialogProps {
  open: boolean;
  fromModelLabel: string;
  toModelLabel: string;
  estimatedMinutes: number;
  sourceCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ReindexConfirmationDialog({ open, fromModelLabel, toModelLabel, estimatedMinutes, sourceCount, onCancel, onConfirm }: ReindexConfirmationDialogProps) {
  if (!open) return null;
  return (
    <div role="dialog" aria-labelledby="reindex-title" aria-modal className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="rounded-lg border border-amber-400/40 bg-amber-400/5 p-6 max-w-md flex flex-col gap-4">
        <h2 id="reindex-title" className="text-base font-medium text-amber-400">
          Re-indexing required
        </h2>
        <p className="text-sm text-foreground">
          Switching from <strong>{fromModelLabel}</strong> to <strong>{toModelLabel}</strong> changes the embedding vector space — existing RAG embeddings won't match.
        </p>
        <p className="text-sm text-muted-foreground">
          Team-X will re-index {sourceCount} RAG source{sourceCount === 1 ? '' : 's'}. Estimated time: <strong>≈ {estimatedMinutes} minute{estimatedMinutes === 1 ? '' : 's'}</strong>.
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="text-xs px-3 py-1 rounded border border-border">Cancel</button>
          <button onClick={onConfirm} className="text-xs px-3 py-1 rounded bg-amber-400 text-amber-950 font-medium">
            Re-index now
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit.**

```
feat(local-gguf-ui): ReindexConfirmationDialog — amber gate before embedding-model swap
```

---

### Task 7: `DefaultsTab` (replaces Phase 5 placeholder)

**Files:**
- Create: `apps/desktop/src/renderer/src/features/local-gguf/defaults-tab.tsx` + test
- Modify: `apps/desktop/src/renderer/src/features/local-gguf/settings-local-models-page.tsx`

DefaultsTab contains: HF token input (keytar-backed), default library folder picker, embedding model picker (Task 5) with re-index confirmation flow.

- [ ] **Step 1: TDD.**

- [ ] **Step 2: Implement.**

```tsx
import { useState } from 'react';
import { EmbeddingModelPicker } from './embedding-model-picker';
import { ReindexConfirmationDialog } from './reindex-confirmation-dialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function DefaultsTab() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['localGguf', 'settings'], queryFn: () => window.teamXApi.localGguf.runtime.settings() });
  const { data: ragStats } = useQuery({ queryKey: ['rag', 'stats'], queryFn: () => window.teamXApi.rag.stats() }); // assume an existing IPC exists; if not, mock to source count
  const setSettings = useMutation({
    mutationFn: (partial) => window.teamXApi.localGguf.runtime.setSettings(partial),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['localGguf', 'settings'] }),
  });

  const [pendingEmbeddingId, setPendingEmbeddingId] = useState<string | null | undefined>(undefined);

  if (!settings) return null;

  return (
    <div className="flex flex-col gap-6">
      <EmbeddingModelPicker
        value={settings.embeddingModelId}
        onChange={(id) => setPendingEmbeddingId(id)}
      />

      <ReindexConfirmationDialog
        open={pendingEmbeddingId !== undefined && pendingEmbeddingId !== settings.embeddingModelId}
        fromModelLabel={settings.embeddingModelId ? 'current local model' : 'Ollama'}
        toModelLabel={pendingEmbeddingId ? 'selected local model' : 'Ollama'}
        sourceCount={ragStats?.sourceCount ?? 0}
        estimatedMinutes={Math.max(1, Math.round((ragStats?.sourceCount ?? 0) / 50))}
        onCancel={() => setPendingEmbeddingId(undefined)}
        onConfirm={async () => {
          await setSettings.mutateAsync({ embeddingModelId: pendingEmbeddingId });
          await window.teamXApi.rag.rebuild(); // existing IPC
          setPendingEmbeddingId(undefined);
        }}
      />

      {/* default library folder + HF token sections — match existing input patterns */}
    </div>
  );
}
```

- [ ] **Step 3: Commit.**

```
feat(local-gguf-ui): DefaultsTab — embedding-model picker + re-index gate + default folder + HF token
```

---

### Task 8: E2E spec — `local-gguf-rag-embedding-switch.spec.ts`

Full UI flow: open Defaults → pick a local embedding model → see confirmation → confirm → assert RAG re-index runs → assert subsequent RAG attribution references the new embeddings.

```
test(e2e): local-gguf-rag-embedding-switch — picker → confirmation → reindex → attribution
```

---

### Task 9: CHANGELOG + quality gate + PR

```markdown
### Added
- **Local & Networked GGUF Support (Phase 9 — Local embeddings + RAG)**:
  RAG embedding routing now branches between local-gguf-embed (when a
  local embedding model is configured) and the existing Ollama / OpenAI
  path. Defaults tab (previously Phase-5 placeholder) gains an embedding-
  model picker filtered to library rows where is_embedding_model=1.
  Switching embedding models triggers an amber re-index confirmation
  dialog (count of sources + estimated time); confirming runs the
  existing rag-rebuild service end-to-end. Acceptance criterion #7 from
  the spec is now testable end-to-end.
```

Quality gate + Stage 1/2/4 review (Stage 3 NOT mandatory).

---

## Phase 9 — Spec coverage map

| Spec section | Implemented by |
|---|---|
| § 9 RAG integration | Tasks 2, 3, 4 |
| § 4.1.12 local embedding models | Tasks 2, 5 |
| § 10 Defaults tab | Tasks 6, 7 |
| § 19 acceptance criterion #7 (re-index on embedding swap) | Tasks 6, 7, 8 |
