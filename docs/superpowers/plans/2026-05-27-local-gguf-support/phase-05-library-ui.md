# Phase 5 — Library UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
>
> **Cross-phase rules:** See master plan § "Cross-phase rules" (CR-1 through CR-10).
>
> **Codex Stage 3 review:** NOT MANDATORY (pure renderer; no new subprocess, no new HTTP from renderer, no new path handling).

**Goal:** Build the renderer surface for Settings → Local Models — Library tab (grid + cards + filter chips + sort), Folders tab, Endpoints tab, Runtime tab. Status badges using the existing LED+label foundation. Every empty/loading/error state designed per WCAG 2.1 AA. Two new React Query hooks. One new E2E spec.

**Architecture:** New `apps/desktop/src/renderer/src/features/local-gguf/` directory. The page is mounted under the existing Settings navigation pattern. State management via React Query for server state (model list, endpoints, watch folders, GPU inventory, settings) + Zustand slice for UI state (selected tab, filter chips, sort order). All IPC through `window.teamXApi.localGguf.*`. Reuses `.brand-selected` for the active filter chip, `.brand-range` for the pool-size slider in the Runtime tab, the existing status-badge foundation for model/endpoint statuses.

**Spec coverage:** Implements spec § 10 (UI surfaces — Library, Folders, Endpoints, Runtime tabs + status badges + keyboard shortcuts) except § 10.3 (Advanced panel, Phase 6), § 10.4 (GPU visualizer, Phase 6), § 10.5 (Benchmark panel, Phase 10), § 10.2 (Hugging Face, Phase 7).

**Estimated PR size:** ~2,000–2,800 LOC production + ~3,000 LOC RTL + Playwright tests. Single PR.

---

## Files this phase touches

### New files

```
apps/desktop/src/renderer/src/features/local-gguf/
├── settings-local-models-page.tsx                  (tab host + routing)
├── settings-local-models-page.test.tsx
├── library-view.tsx                                (grid + sort + filter)
├── library-view.test.tsx
├── model-card.tsx                                  (single library card)
├── model-card.test.tsx
├── library-filter-chips.tsx                        (filter chip strip)
├── library-filter-chips.test.tsx
├── folders-tab.tsx
├── folders-tab.test.tsx
├── endpoints-tab.tsx
├── endpoints-tab.test.tsx
├── runtime-tab.tsx
├── runtime-tab.test.tsx
├── add-folder-dialog.tsx
├── add-folder-dialog.test.tsx
├── add-endpoint-dialog.tsx
├── add-endpoint-dialog.test.tsx
├── shared/
│   ├── model-status-badge.tsx                      (LED + label, per Team-X CLAUDE.md)
│   ├── model-status-badge.test.tsx
│   ├── empty-state.tsx
│   ├── error-state.tsx
│   ├── loading-skeleton.tsx
│   └── format-bytes.ts                             (pure util)

apps/desktop/src/renderer/src/hooks/
├── use-local-models.ts                             (React Query for library list + mutations)
├── use-local-models.test.ts
├── use-local-model-pool.ts                         (React Query for pool status)
└── use-local-model-pool.test.ts

apps/desktop/src/renderer/src/store/
└── local-gguf-ui-slice.ts                          (Zustand: selected tab, filter, sort)
    local-gguf-ui-slice.test.ts

apps/desktop/e2e/
└── local-gguf-library.spec.ts                      (full library lifecycle through UI)
```

### Modified files

```
apps/desktop/src/renderer/src/app/settings-router.tsx (mount new page)
apps/desktop/src/renderer/src/app/global-shortcuts.ts (Cmd+Shift+L opens Library, Cmd+Shift+H opens HF — HF nav lands but tab body is Phase 7)
apps/desktop/src/renderer/src/styles/globals.css     (add per-card hover transition variable — only if existing primitives don't cover it)
CHANGELOG.md
docs/user-guide/local-models/                       (placeholder index, full docs in Phase 11)
```

---

## Tasks

### Task 1: Branch + sync

```bash
git checkout main && git pull --ff-only
git log --oneline -20 | grep -i "phase 4\|phase-04"
git checkout -b feat/v3.3.0-phase-05-library-ui
```

---

### Task 2: Status badge component (shared, TDD)

**Files:**
- Create: `apps/desktop/src/renderer/src/features/local-gguf/shared/model-status-badge.tsx`
- Create: `apps/desktop/src/renderer/src/features/local-gguf/shared/model-status-badge.test.tsx`

Reuses the LED+label foundation from `Team-X/CLAUDE.md` § "Status badges". Three colors map to spec model statuses:

| Status | Color | LED animation |
|---|---|---|
| `loaded` | green | pulse |
| `loading` | grey | pulse |
| `cold` | (muted text, no LED) | — |
| `error` | red | solid |
| `unreachable` | red | solid |
| `missing` | red | solid |

- [ ] **Step 1: Write the failing RTL test.**

```tsx
// apps/desktop/src/renderer/src/features/local-gguf/shared/model-status-badge.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModelStatusBadge } from './model-status-badge';

describe('ModelStatusBadge', () => {
  it('renders Loaded with green pulsing LED', () => {
    render(<ModelStatusBadge status="loaded" />);
    const badge = screen.getByRole('status', { name: /loaded/i });
    expect(badge).toBeInTheDocument();
    const led = badge.querySelector('[data-led]');
    expect(led).toHaveClass(/bg-green/);
    expect(led).toHaveClass(/animate-pulse/);
  });

  it('renders Loading with grey pulsing LED', () => {
    render(<ModelStatusBadge status="loading" />);
    const led = screen.getByRole('status').querySelector('[data-led]');
    expect(led).toHaveClass(/bg-muted/);
    expect(led).toHaveClass(/animate-pulse/);
  });

  it('renders Cold without an LED', () => {
    render(<ModelStatusBadge status="cold" />);
    const badge = screen.getByRole('status', { name: /cold/i });
    expect(badge.querySelector('[data-led]')).toBeNull();
  });

  it('renders Error with solid red LED + status-detail tooltip', () => {
    render(<ModelStatusBadge status="error" detail="Failed to load" />);
    const led = screen.getByRole('status').querySelector('[data-led]');
    expect(led).toHaveClass(/bg-red/);
    expect(led).not.toHaveClass(/animate-pulse/);
    expect(screen.getByRole('status')).toHaveAttribute('title', expect.stringContaining('Failed to load'));
  });

  it('renders Unreachable with solid red LED', () => {
    render(<ModelStatusBadge status="unreachable" />);
    const led = screen.getByRole('status').querySelector('[data-led]');
    expect(led).toHaveClass(/bg-red/);
  });

  it('badge text size is text-[10px] per Team-X status-badge foundation', () => {
    render(<ModelStatusBadge status="loaded" />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveClass(/text-\[10px\]/);
  });

  it('has aria-label including the status word', () => {
    render(<ModelStatusBadge status="loaded" />);
    expect(screen.getByRole('status')).toHaveAccessibleName(/loaded/i);
  });
});
```

- [ ] **Step 2: Run; expect fail.**

- [ ] **Step 3: Implement.**

```tsx
// apps/desktop/src/renderer/src/features/local-gguf/shared/model-status-badge.tsx
import type { ModelStatus } from '@team-x/shared-types';
import { cn } from '@/lib/utils';

const CONFIG: Record<ModelStatus, { color: string | null; pulse: boolean; label: string }> = {
  loaded:       { color: 'green', pulse: true, label: 'Loaded' },
  loading:      { color: 'grey', pulse: true, label: 'Loading' },
  cold:         { color: null, pulse: false, label: 'Cold' },
  error:        { color: 'red', pulse: false, label: 'Error' },
  unreachable:  { color: 'red', pulse: false, label: 'Unreachable' },
  missing:      { color: 'red', pulse: false, label: 'Missing' },
};

const COLOR_CLASSES = {
  green: { border: 'border-green-400/40', bg: 'bg-green-400/10', text: 'text-green-400', led: 'bg-green-400' },
  grey: { border: 'border-muted-foreground/30', bg: 'bg-muted/20', text: 'text-muted-foreground', led: 'bg-muted-foreground' },
  red: { border: 'border-red-400/40', bg: 'bg-red-500/10', text: 'text-red-400', led: 'bg-red-400' },
} as const;

export interface ModelStatusBadgeProps {
  status: ModelStatus;
  detail?: string;
}

export function ModelStatusBadge({ status, detail }: ModelStatusBadgeProps) {
  const config = CONFIG[status];
  if (config.color === null) {
    return (
      <span
        role="status"
        aria-label={`Status: ${config.label}`}
        className="text-[10px] px-1.5 py-0 gap-1.5 text-muted-foreground"
      >
        {config.label}
      </span>
    );
  }
  const colors = COLOR_CLASSES[config.color as keyof typeof COLOR_CLASSES];
  return (
    <span
      role="status"
      aria-label={`Status: ${config.label}${detail ? `. ${detail}` : ''}`}
      title={detail}
      className={cn(
        'inline-flex items-center text-[10px] px-1.5 py-0 gap-1.5 border rounded',
        colors.border, colors.bg, colors.text,
      )}
    >
      <span
        data-led
        className={cn('w-1.5 h-1.5 rounded-full', colors.led, config.pulse && 'animate-pulse')}
      />
      {config.label}
    </span>
  );
}
```

- [ ] **Step 4: Run + commit.**

```
feat(local-gguf-ui): ModelStatusBadge — LED + label foundation, all 6 status colors, WCAG-compliant aria
```

---

### Task 3: Shared format helpers + skeleton + empty/error states

**Files:**
- Create: `apps/desktop/src/renderer/src/features/local-gguf/shared/format-bytes.ts` + test
- Create: `apps/desktop/src/renderer/src/features/local-gguf/shared/empty-state.tsx` + test
- Create: `apps/desktop/src/renderer/src/features/local-gguf/shared/error-state.tsx` + test
- Create: `apps/desktop/src/renderer/src/features/local-gguf/shared/loading-skeleton.tsx` + test

- [ ] **Step 1: `format-bytes.ts` (pure function).**

```ts
// format-bytes.ts
export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || n === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = Math.abs(n);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
```

Test: `formatBytes(0)`, `formatBytes(null)`, `formatBytes(1024)`, `formatBytes(1.5 * 1024 * 1024)`, `formatBytes(4_000_000_000)` etc.

- [ ] **Step 2: `empty-state.tsx`.** Renders an icon, a heading, body text, and an optional primary CTA. Used by the Library, Folders, Endpoints tabs.

- [ ] **Step 3: `error-state.tsx`.** Takes a `LocalGgufError` and renders a typed message per `kind`. Snapshot tests for each variant prove every kind has a discriminated render branch (spec § 19 acceptance criterion #10).

```tsx
// apps/desktop/src/renderer/src/features/local-gguf/shared/error-state.tsx
import type { LocalGgufError } from '@team-x/shared-types';

export interface ErrorStateProps {
  error: LocalGgufError;
  onRetry?: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const { title, body } = renderError(error);
  return (
    <div role="alert" className="rounded-lg border border-red-400/40 bg-red-500/10 p-4 text-red-400">
      <h3 className="font-medium text-sm">{title}</h3>
      <p className="text-xs text-red-300/80 mt-1">{body}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 text-xs underline focus-visible:outline-offset-2">
          Retry
        </button>
      )}
    </div>
  );
}

function renderError(e: LocalGgufError): { title: string; body: string } {
  switch (e.kind) {
    case 'binary-not-found': return {
      title: 'Llama.cpp binary missing',
      body: `The ${e.backend.toUpperCase()} backend binary wasn't found at ${e.path}. Reinstall Team-X or run the binary fetcher manually.`,
    };
    case 'binary-unsupported': return {
      title: 'Backend unsupported on this platform',
      body: `${e.backend.toUpperCase()} isn't shipped for ${e.osVersion}. Switch to a different backend in Settings → Runtime.`,
    };
    case 'gpu-probe-failed': return { title: 'GPU detection failed', body: e.reason };
    case 'oom-predicted': return {
      title: 'Not enough VRAM to load this model',
      body: `Predicted ${e.requiredMb} MB needed, only ${e.availableMb} MB available. Reduce GPU layers in Advanced settings, or unload another model.`,
    };
    case 'oom-runtime': return {
      title: 'Model crashed: GPU ran out of memory',
      body: 'The model loaded partially but ran out of VRAM at inference time. Reduce context length or GPU layers in Advanced settings.',
    };
    case 'gguf-parse-failed': return {
      title: 'Cannot read this GGUF',
      body: `Parser error: ${e.reason}. The file may be corrupt or from an unsupported GGUF version.`,
    };
    case 'gguf-corrupt': return {
      title: 'GGUF file is corrupt',
      body: e.sha256Mismatch ? 'SHA256 mismatch — the file does not match its registered hash.' : 'The file is missing the GGUF header signature.',
    };
    case 'server-spawn-failed': return {
      title: 'Llama-server failed to start',
      body: e.stderr.split('\n').slice(-3).join('\n').trim() || 'No stderr available.',
    };
    case 'server-crashed': return {
      title: 'Llama-server crashed unexpectedly',
      body: `Process ${e.pid} exited (code ${e.exitCode}). Last stderr: ${e.stderr.split('\n').slice(-3).join('\n').trim()}`,
    };
    case 'port-exhausted': return {
      title: 'No port available',
      body: 'The system has no free port in the ephemeral range. Restart Team-X.',
    };
    case 'source-unreachable': return {
      title: 'Source is unreachable',
      body: `Cannot access ${e.path}. If this is a network share, check that the device is online.`,
    };
    case 'hf-download-failed': return {
      title: 'Download failed',
      body: `HTTP ${e.httpStatus} downloading ${e.file} from ${e.repo}.`,
    };
    case 'hf-rate-limited': return {
      title: 'Hugging Face rate-limited the download',
      body: `Retry in ${e.retryAfterS} seconds, or add an HF token in Settings → Defaults.`,
    };
    case 'endpoint-unreachable': return {
      title: 'Endpoint unreachable',
      body: `${e.url}${e.httpStatus ? ` (HTTP ${e.httpStatus})` : ''}`,
    };
    case 'endpoint-auth-failed': return {
      title: 'Endpoint authentication failed',
      body: `${e.url} rejected the configured credentials.`,
    };
    case 'pool-full': return {
      title: 'Pool is full',
      body: `${e.current} / ${e.max} models loaded. Unload one or raise the pool size in Runtime settings.`,
    };
    case 'context-too-large': return {
      title: 'Context too large for this model',
      body: `Requested ${e.requested} tokens; this model supports up to ${e.max}.`,
    };
    default: {
      const _never: never = e;
      return { title: 'Unknown error', body: JSON.stringify(_never) };
    }
  }
}
```

Test for every `kind` — assert title is non-empty and body contains a hint. **This is acceptance criterion #10 from the spec.**

- [ ] **Step 4: `loading-skeleton.tsx`** — animated placeholder for the card grid while React Query fetches.

- [ ] **Step 5: Commit each.**

```
feat(local-gguf-ui): format-bytes utility
feat(local-gguf-ui): ErrorState with discriminated branch per LocalGgufError kind (17 variants, snapshot-tested)
feat(local-gguf-ui): EmptyState + LoadingSkeleton
```

---

### Task 4: React Query hooks

**Files:**
- Create: `apps/desktop/src/renderer/src/hooks/use-local-models.ts` + test
- Create: `apps/desktop/src/renderer/src/hooks/use-local-model-pool.ts` + test

- [ ] **Step 1: Read existing React Query hooks for pattern.**

```bash
cat apps/desktop/src/renderer/src/hooks/use-employees.ts | head -80
```

- [ ] **Step 2: `use-local-models.ts`.**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { LocalModel, SourceType } from '@team-x/shared-types';

const KEY = ['localGguf', 'models'] as const;

export function useLocalModels() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => window.teamXApi.localGguf.library.list(),
    refetchInterval: 5000, // status changes mid-session
  });
}

export function useLocalModelsBySourceType(sourceType: SourceType) {
  return useQuery({
    queryKey: [...KEY, 'by-source', sourceType],
    queryFn: () => window.teamXApi.localGguf.library.listBySourceType(sourceType),
  });
}

export function useAddLocalModelFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => window.teamXApi.localGguf.library.addFile(path),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRemoveLocalModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.teamXApi.localGguf.library.removeModel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSetSystemPrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, prompt }: { id: string; prompt: string | null }) =>
      window.teamXApi.localGguf.library.setSystemPrompt(id, prompt),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSetChatTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, template }: { id: string; template: string | null }) =>
      window.teamXApi.localGguf.library.setChatTemplate(id, template),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
```

Test using the existing renderer test setup (QueryClient mocked in tests).

- [ ] **Step 3: `use-local-model-pool.ts`.**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const KEY = ['localGguf', 'pool'] as const;

export function useLocalModelPool() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => window.teamXApi.localGguf.pool.status(),
    refetchInterval: 2000,
  });
}

export function useLoadModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.teamXApi.localGguf.pool.load(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); qc.invalidateQueries({ queryKey: ['localGguf', 'models'] }); },
  });
}

export function useUnloadModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.teamXApi.localGguf.pool.unload(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); qc.invalidateQueries({ queryKey: ['localGguf', 'models'] }); },
  });
}

export function useSetMaxConcurrent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (n: number) => window.teamXApi.localGguf.pool.setMaxConcurrent(n),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
```

- [ ] **Step 4: Commit each.**

```
feat(local-gguf-ui): useLocalModels + useAddLocalModelFile + useRemoveLocalModel + setSystemPrompt + setChatTemplate hooks
feat(local-gguf-ui): useLocalModelPool + useLoadModel + useUnloadModel + useSetMaxConcurrent hooks
```

---

### Task 5: Zustand UI slice

**Files:**
- Create: `apps/desktop/src/renderer/src/store/local-gguf-ui-slice.ts` + test

```ts
import { create } from 'zustand';

type LibraryTab = 'library' | 'huggingface' | 'runtime' | 'endpoints' | 'folders' | 'defaults';

type SortOrder = 'last-used' | 'name-asc' | 'size-desc' | 'created-desc';

type FilterChip = 'all' | 'loaded' | 'cold' | 'chat' | 'embeddings' | 'tool-capable'
  | 'source-local' | 'source-nas' | 'source-endpoint';

interface LocalGgufUiState {
  selectedTab: LibraryTab;
  selectedFilter: FilterChip;
  sortOrder: SortOrder;
  setSelectedTab: (tab: LibraryTab) => void;
  setSelectedFilter: (filter: FilterChip) => void;
  setSortOrder: (order: SortOrder) => void;
}

export const useLocalGgufUiStore = create<LocalGgufUiState>((set) => ({
  selectedTab: 'library',
  selectedFilter: 'all',
  sortOrder: 'last-used',
  setSelectedTab: (tab) => set({ selectedTab: tab }),
  setSelectedFilter: (filter) => set({ selectedFilter: filter }),
  setSortOrder: (order) => set({ sortOrder: order }),
}));
```

Test the store via `useLocalGgufUiStore.getState()` mutations.

```
feat(local-gguf-ui): Zustand UI slice for tab + filter + sort
```

---

### Task 6: `ModelCard` component (TDD)

**Files:**
- Create: `apps/desktop/src/renderer/src/features/local-gguf/model-card.tsx` + test

Renders the card layout from spec § 10.1:

```
┌────────────────────────────────────────────────┐
│ Llama-3.1-70B-Instruct-Q4_K_M     [● Loaded]   │
│ llama · 70.6B · Q4_K_M · 8192 ctx · 39.7 GB    │
│ Source: \\NAS-01\models\meta\Llama-3.1-70B...  │
│ [Tool-capable] [License: Llama 3.1]            │
│ Last benchmark: 42 tok/s · TTFT 380 ms         │
│ [Make Active] [Benchmark] [Advanced] [Remove]  │
└────────────────────────────────────────────────┘
```

Note: the GPU offload bar in this card is wired in Phase 6 (`GpuOffloadVisualizer`). For Phase 5, the card has a placeholder slot where Phase 6's component will mount.

- [ ] **Step 1: TDD test — covers visual structure, status badge integration, action button presence, accessibility (keyboard navigable, role="article" or similar).**

- [ ] **Step 2: Implement.**

```tsx
// apps/desktop/src/renderer/src/features/local-gguf/model-card.tsx
import type { LocalModel } from '@team-x/shared-types';
import { Button } from '@/components/ui/button';
import { ModelStatusBadge } from './shared/model-status-badge';
import { formatBytes } from './shared/format-bytes';
import { useLoadModel, useUnloadModel } from '@/hooks/use-local-model-pool';
import { useRemoveLocalModel } from '@/hooks/use-local-models';

export interface ModelCardProps {
  model: LocalModel;
  onAdvanced: () => void;
  onBenchmark: () => void;
}

export function ModelCard({ model, onAdvanced, onBenchmark }: ModelCardProps) {
  const load = useLoadModel();
  const unload = useUnloadModel();
  const remove = useRemoveLocalModel();

  const isLoaded = model.status === 'loaded';
  const isLoading = model.status === 'loading';
  const canMakeActive = model.status === 'cold' || model.status === 'error';
  const canRemove = !isLoading;

  const subtitleParts = [
    model.ggufArch,
    model.ggufParamsB ? `${model.ggufParamsB.toFixed(1)}B` : null,
    model.ggufQuant,
    model.ggufContextMax ? `${model.ggufContextMax.toLocaleString()} ctx` : null,
    formatBytes(model.ggufSizeBytes),
  ].filter(Boolean).join(' · ');

  return (
    <article
      aria-labelledby={`model-card-${model.id}-title`}
      className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 id={`model-card-${model.id}-title`} className="text-sm font-medium text-foreground truncate">
          {model.displayName}
        </h3>
        <ModelStatusBadge status={model.status} detail={model.statusDetail ?? undefined} />
      </div>

      <p className="text-xs text-muted-foreground">{subtitleParts}</p>

      {model.sourcePath && (
        <p className="text-xs text-muted-foreground truncate" title={model.sourcePath}>
          Source: {model.sourcePath}
        </p>
      )}

      <div className="flex flex-wrap gap-1">
        {model.isToolCapable && (
          <span className="text-[10px] px-1.5 py-0.5 border border-blue-400/40 bg-blue-400/10 text-blue-400 rounded">
            Tool-capable
          </span>
        )}
        {model.license && (
          <span className="text-[10px] px-1.5 py-0.5 border border-muted-foreground/30 bg-muted/20 text-muted-foreground rounded">
            License: {model.license}
          </span>
        )}
      </div>

      {/* GPU offload visualizer slot — filled by Phase 6 */}
      <div data-gpu-offload-slot />

      <div className="flex flex-wrap gap-2 mt-2">
        {canMakeActive && (
          <Button size="sm" onClick={() => load.mutate(model.id)} disabled={load.isPending}>
            Make Active
          </Button>
        )}
        {isLoaded && (
          <Button size="sm" variant="secondary" onClick={() => unload.mutate(model.id)} disabled={unload.isPending}>
            Unload
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onBenchmark}>
          Benchmark
        </Button>
        <Button size="sm" variant="outline" onClick={onAdvanced}>
          Advanced
        </Button>
        <Button
          size="sm" variant="ghost"
          onClick={() => { if (confirm(`Remove ${model.displayName}?`)) remove.mutate(model.id); }}
          disabled={!canRemove || remove.isPending}
        >
          Remove
        </Button>
      </div>
    </article>
  );
}
```

- [ ] **Step 3: Run + commit.**

```
feat(local-gguf-ui): ModelCard — full card per spec § 10.1 with action wiring + a11y
```

---

### Task 7: `LibraryFilterChips` (TDD)

**Files:**
- Create: `apps/desktop/src/renderer/src/features/local-gguf/library-filter-chips.tsx` + test

Renders the filter chip strip: All / Loaded / Cold / Chat / Embeddings / Tool-capable / Source: Local / Source: NAS / Source: Endpoint. Active chip uses `.brand-selected` per Team-X CLAUDE.md reusable visual primitives.

- [ ] **Step 1: TDD test.** Cover: all chips render, click changes Zustand state, active chip has `brand-selected` class, keyboard navigation (`Tab` between chips, `Enter` activates).

- [ ] **Step 2: Implement.**

```tsx
import { cn } from '@/lib/utils';
import { useLocalGgufUiStore } from '@/store/local-gguf-ui-slice';

const CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'loaded', label: 'Loaded' },
  { id: 'cold', label: 'Cold' },
  { id: 'chat', label: 'Chat' },
  { id: 'embeddings', label: 'Embeddings' },
  { id: 'tool-capable', label: 'Tool-capable' },
  { id: 'source-local', label: 'Source: Local' },
  { id: 'source-nas', label: 'Source: NAS' },
  { id: 'source-endpoint', label: 'Source: Endpoint' },
] as const;

export function LibraryFilterChips() {
  const selected = useLocalGgufUiStore((s) => s.selectedFilter);
  const setSelected = useLocalGgufUiStore((s) => s.setSelectedFilter);
  return (
    <div role="tablist" aria-label="Filter library models" className="flex flex-wrap gap-2">
      {CHIPS.map((chip) => {
        const isActive = chip.id === selected;
        return (
          <button
            key={chip.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => setSelected(chip.id)}
            className={cn(
              'text-xs rounded-lg border px-3 py-1.5 transition-colors',
              isActive ? 'brand-selected' : 'border-border hover:border-white/20',
            )}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Run + commit.**

```
feat(local-gguf-ui): LibraryFilterChips reusing .brand-selected primitive
```

---

### Task 8: `LibraryView` (TDD)

**Files:**
- Create: `apps/desktop/src/renderer/src/features/local-gguf/library-view.tsx` + test

Renders the filter strip + sort control + grid of `ModelCard`s. Loading → skeleton. Empty → `EmptyState`. Error → `ErrorState`.

- [ ] **Step 1: TDD.** Cover: loading state, empty state, error state, filter applied, sort applied, grid renders correctly.

- [ ] **Step 2: Implement.**

```tsx
import { useLocalModels } from '@/hooks/use-local-models';
import { useLocalGgufUiStore } from '@/store/local-gguf-ui-slice';
import { ModelCard } from './model-card';
import { LibraryFilterChips } from './library-filter-chips';
import { ErrorState } from './shared/error-state';
import { EmptyState } from './shared/empty-state';
import { LoadingSkeleton } from './shared/loading-skeleton';
import { useState } from 'react';

export function LibraryView() {
  const { data, isLoading, error, refetch } = useLocalModels();
  const filter = useLocalGgufUiStore((s) => s.selectedFilter);
  const sortOrder = useLocalGgufUiStore((s) => s.sortOrder);
  const setSortOrder = useLocalGgufUiStore((s) => s.setSortOrder);

  if (isLoading) return <LoadingSkeleton />;
  if (error) {
    const localError = (error as { error?: never }).error;
    if (localError) return <ErrorState error={localError} onRetry={() => refetch()} />;
    return <ErrorState error={{ kind: 'gpu-probe-failed', reason: String(error) }} onRetry={() => refetch()} />;
  }
  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="Your library is empty"
        body="Add a GGUF file, a folder to watch, or a remote endpoint to get started."
      />
    );
  }

  const filtered = applyFilter(data, filter);
  const sorted = applySort(filtered, sortOrder);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <LibraryFilterChips />
        <select
          aria-label="Sort models"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as never)}
          className="text-xs bg-card border border-border rounded px-2 py-1"
        >
          <option value="last-used">Last used</option>
          <option value="name-asc">Name (A→Z)</option>
          <option value="size-desc">Size (largest first)</option>
          <option value="created-desc">Recently added</option>
        </select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sorted.map((m) => (
          <ModelCard
            key={m.id}
            model={m}
            onAdvanced={() => { /* Phase 6 wires this to AdvancedPanel */ }}
            onBenchmark={() => { /* Phase 10 wires this to BenchmarkPanel */ }}
          />
        ))}
      </div>
    </div>
  );
}

function applyFilter(models, filter) {
  switch (filter) {
    case 'all': return models;
    case 'loaded': return models.filter((m) => m.status === 'loaded');
    case 'cold': return models.filter((m) => m.status === 'cold');
    case 'chat': return models.filter((m) => !m.isEmbeddingModel);
    case 'embeddings': return models.filter((m) => m.isEmbeddingModel);
    case 'tool-capable': return models.filter((m) => m.isToolCapable);
    case 'source-local': return models.filter((m) => m.sourceType === 'file' && !isUnc(m.sourcePath));
    case 'source-nas': return models.filter((m) => m.sourceType === 'file' && isUnc(m.sourcePath));
    case 'source-endpoint': return models.filter((m) => m.sourceType === 'remote-endpoint');
    default: return models;
  }
}

function isUnc(path: string | null): boolean {
  return Boolean(path && (path.startsWith('\\\\') || path.startsWith('//')));
}

function applySort(models, order) {
  const copy = [...models];
  switch (order) {
    case 'last-used':
      return copy.sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
    case 'name-asc':
      return copy.sort((a, b) => a.displayName.localeCompare(b.displayName));
    case 'size-desc':
      return copy.sort((a, b) => (b.ggufSizeBytes ?? 0) - (a.ggufSizeBytes ?? 0));
    case 'created-desc':
      return copy.sort((a, b) => b.createdAt - a.createdAt);
  }
}
```

- [ ] **Step 3: Run + commit.**

```
feat(local-gguf-ui): LibraryView — grid + filters + sort + loading/empty/error states
```

---

### Task 9: `FoldersTab` + `AddFolderDialog` (TDD)

**Files:**
- Create: `apps/desktop/src/renderer/src/features/local-gguf/folders-tab.tsx` + test
- Create: `apps/desktop/src/renderer/src/features/local-gguf/add-folder-dialog.tsx` + test

`FoldersTab` lists watched folders (table or list view); each row shows path + recursive flag + status + actions (scan-now, remove). `AddFolderDialog` is a modal with: path text input (or file picker for local), recursive checkbox, accept/cancel.

- [ ] **Step 1: TDD each.**

- [ ] **Step 2: Implement.**

- [ ] **Step 3: Commit.**

```
feat(local-gguf-ui): FoldersTab + AddFolderDialog with UNC path support
```

---

### Task 10: `EndpointsTab` + `AddEndpointDialog` (TDD)

**Files:**
- Create: `apps/desktop/src/renderer/src/features/local-gguf/endpoints-tab.tsx` + test
- Create: `apps/desktop/src/renderer/src/features/local-gguf/add-endpoint-dialog.tsx` + test

`EndpointsTab` lists remote endpoints with status + actions (test connection, remove, edit). `AddEndpointDialog`: name input, base URL input, optional API key input (stored in keytar — only the reference is persisted in the row).

- [ ] **Step 1: TDD each.**

- [ ] **Step 2: Implement.**

- [ ] **Step 3: Commit.**

```
feat(local-gguf-ui): EndpointsTab + AddEndpointDialog (keytar-backed auth ref)
```

---

### Task 11: `RuntimeTab` (TDD)

**Files:**
- Create: `apps/desktop/src/renderer/src/features/local-gguf/runtime-tab.tsx` + test

Shows: active backend (auto-detected indicator), backend override dropdown, llama.cpp binaries version, pool max-concurrent slider (uses `.brand-range`), default library folder picker, re-probe GPU button. Reads/writes `localGguf.runtime.*` and `localGguf.pool.setMaxConcurrent`.

- [ ] **Step 1: TDD.** Cover: backend display reflects state, override persists, slider updates pool size, re-probe button refetches inventory.

- [ ] **Step 2: Implement.**

```tsx
// excerpt
<input
  type="range"
  min={1} max={Math.max(1, vramBasedMax)} step={1}
  value={settings.maxConcurrentLocalModels}
  onChange={(e) => setMaxConcurrent.mutate(parseInt(e.target.value, 10))}
  className="brand-range"
  aria-label="Maximum concurrent local models"
/>
```

- [ ] **Step 3: Commit.**

```
feat(local-gguf-ui): RuntimeTab — backend display + override + pool slider (.brand-range) + re-probe
```

---

### Task 12: `SettingsLocalModelsPage` (host)

**Files:**
- Create: `apps/desktop/src/renderer/src/features/local-gguf/settings-local-models-page.tsx` + test
- Modify: `apps/desktop/src/renderer/src/app/settings-router.tsx`

Hosts all six tabs (Library / Hugging Face / Runtime / Endpoints / Folders / Defaults). For Phase 5, the Hugging Face and Defaults tabs render placeholder content saying "Coming in Phase 7" / "Coming in Phase 9". Phases 7 and 9 fill them in.

- [ ] **Step 1: TDD.**

- [ ] **Step 2: Implement.**

```tsx
import { useLocalGgufUiStore } from '@/store/local-gguf-ui-slice';
import { LibraryView } from './library-view';
import { FoldersTab } from './folders-tab';
import { EndpointsTab } from './endpoints-tab';
import { RuntimeTab } from './runtime-tab';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'library', label: 'Library' },
  { id: 'huggingface', label: 'Hugging Face' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'endpoints', label: 'Endpoints' },
  { id: 'folders', label: 'Folders' },
  { id: 'defaults', label: 'Defaults' },
] as const;

export function SettingsLocalModelsPage() {
  const selectedTab = useLocalGgufUiStore((s) => s.selectedTab);
  const setSelectedTab = useLocalGgufUiStore((s) => s.setSelectedTab);
  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Local Models</h1>
      <nav role="tablist" aria-label="Local Models sub-sections" className="flex gap-2 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === selectedTab}
            onClick={() => setSelectedTab(t.id)}
            className={cn(
              'px-3 py-2 text-sm transition-colors -mb-px border-b-2',
              t.id === selectedTab ? 'border-brand text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div role="tabpanel">
        {selectedTab === 'library' && <LibraryView />}
        {selectedTab === 'huggingface' && <ComingSoon phase={7} />}
        {selectedTab === 'runtime' && <RuntimeTab />}
        {selectedTab === 'endpoints' && <EndpointsTab />}
        {selectedTab === 'folders' && <FoldersTab />}
        {selectedTab === 'defaults' && <ComingSoon phase={9} />}
      </div>
    </div>
  );
}

function ComingSoon({ phase }: { phase: number }) {
  return (
    <div className="text-sm text-muted-foreground p-4">
      Coming in Phase {phase} of the v3.3.0 Local GGUF rollout.
    </div>
  );
}
```

- [ ] **Step 3: Mount in settings-router.tsx.**

- [ ] **Step 4: Run + commit.**

```
feat(local-gguf-ui): SettingsLocalModelsPage host + mount under Settings route
```

---

### Task 13: Keyboard shortcuts wiring

**Files:**
- Modify: `apps/desktop/src/renderer/src/app/global-shortcuts.ts`

- [ ] **Step 1: Add `Cmd/Ctrl+Shift+L` → open Library tab.**
- [ ] **Step 2: Add `Cmd/Ctrl+Shift+H` → open Hugging Face tab (lands on placeholder until Phase 7).**
- [ ] **Step 3: Test via Playwright.**

```
feat(local-gguf-ui): wire Cmd/Ctrl+Shift+L (Library) and Cmd/Ctrl+Shift+H (HF) shortcuts
```

---

### Task 14: E2E — `local-gguf-library.spec.ts`

**Files:**
- Create: `apps/desktop/e2e/local-gguf-library.spec.ts`

End-to-end through the UI: add a GGUF via the file picker stub, see the card appear, see status update to `cold`, attempt `Make Active` (will either succeed against the test stub or surface a typed error), verify all empty states + the shortcut.

- [ ] **Step 1: Author + run.**

- [ ] **Step 2: Add an axe-core accessibility assertion** to confirm no WCAG violations on the page:

```ts
import AxeBuilder from '@axe-core/playwright';
const results = await new AxeBuilder({ page }).analyze();
expect(results.violations).toEqual([]);
```

- [ ] **Step 3: Commit.**

```
test(e2e): local-gguf-library — full UI lifecycle + axe-core no-violations
```

---

### Task 15: CHANGELOG + quality gate + PR

```markdown
### Added
- **Local & Networked GGUF Support (Phase 5 — Library UI)**: new top-level
  Settings → Local Models page with six tabs (Library / Hugging Face /
  Runtime / Endpoints / Folders / Defaults). Library tab renders a
  responsive 1/2/3-column grid of model cards (per-card: name, metadata
  row, source path, capability badges, action buttons), 9-chip filter
  strip using `.brand-selected`, 4-mode sort dropdown. Folders tab
  manages watched folders incl. UNC/SMB paths. Endpoints tab manages
  remote LAN runners with keytar-backed auth references. Runtime tab
  exposes backend display + override + pool slider (`.brand-range`) +
  binaries version + re-probe GPU. All states (loading / empty / error
  with discriminated branch per LocalGgufError kind) WCAG 2.1 AA
  compliant. Keyboard shortcuts `Cmd/Ctrl+Shift+L` (Library) and
  `Cmd/Ctrl+Shift+H` (HF placeholder until Phase 7).
```

Quality gate per master plan § CR-6/CR-7. Performance assertions:
- Library page initial render < 100 ms after data resolved (RTL `act` measurement).
- Filter change re-render < 16 ms.
- Sort change re-render < 16 ms.

Codex Stage 3 NOT mandatory (pure renderer). Stage 2 sub-agent review only.

---

## Phase 5 — Spec coverage map

| Spec section | Implemented by |
|---|---|
| § 10 Settings → Local Models page + sub-tabs | Task 12 |
| § 10.1 Library view (grid, card layout, filter chips, sort) | Tasks 6, 7, 8 |
| § 10.2 HF tab (placeholder for Phase 7) | Task 12 |
| § 10.3 Advanced panel (Phase 6 placeholder slot) | Task 6 (card slot only; component in Phase 6) |
| § 10.4 GPU offload visualizer (Phase 6) | (slot in Task 6; component in Phase 6) |
| § 10.5 Benchmark panel (Phase 10) | (button wired in Task 6; modal in Phase 10) |
| § 10.6 Keyboard shortcuts | Task 13 |
| § 4.1 Status badges (LED+label) | Task 2 |
| § 15 LocalGgufError UI rendering (one branch per kind) | Task 3 |
| § 19 acceptance criterion #10 (every error variant has snapshot) | Task 3 |
