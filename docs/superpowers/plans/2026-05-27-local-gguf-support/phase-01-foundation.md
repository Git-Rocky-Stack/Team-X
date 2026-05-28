# Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to execute this task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Cross-phase rules:** Re-read `docs/superpowers/plans/2026-05-27-local-gguf-support.md` § "Cross-phase rules" before starting. Branch naming, commit style, TDD discipline, coverage targets, quality gate, and review wall are canonical there. This phase plan only restates phase-specific items.
>
> **Codex Stage 3 review:** REQUIRED (this phase introduces IPC contracts + SQL migration — both security-sensitive boundaries).

**Goal:** Scaffold the foundation that every subsequent phase depends on — new `@team-x/local-gguf-runtime` package, shared-types contracts, Drizzle migration `0014_local_gguf` with 5 tables + indexes, IPC handler stubs (typed-but-not-implemented), preload bridge, 4 db repos, runtime-settings accessor.

**Architecture:** Phase 1 introduces no business logic — only structural surfaces and type contracts. Every IPC handler stub throws a typed `not-implemented` error that subsequent phases replace with real implementations. The migration is forward-only; rollback is documented but not implemented. All public types are exported from `@team-x/shared-types`.

**Spec coverage:** Implements spec § 6 (package structure setup), § 7 (data model — all 5 tables), and lays the foundation for §§ 8–15 by defining the shared types they consume.

**Estimated PR size:** ~1,500–2,000 LOC net production code + ~2,000 LOC tests + the migration SQL. Single PR.

---

## Files this phase touches

### New files

```
packages/local-gguf-runtime/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── biome.json
├── src/
│   ├── index.ts                                   (public exports)
│   └── errors.ts                                  (LocalGgufError union re-export)

packages/shared-types/src/
├── local-gguf.ts                                  (all entities, IPC contracts, error union)
└── local-gguf.test.ts                             (runtime guard + type-shape tests)

apps/desktop/src/main/
├── db/migrations/0014_local_gguf.sql              (5 tables + indexes)
├── db/repos/
│   ├── local-models.ts                            (CRUD)
│   ├── local-models.test.ts
│   ├── local-model-advanced-params.ts             (CRUD)
│   ├── local-model-advanced-params.test.ts
│   ├── local-model-endpoints.ts                   (CRUD)
│   ├── local-model-endpoints.test.ts
│   ├── local-model-watch-folders.ts               (CRUD)
│   └── local-model-watch-folders.test.ts
├── ipc/
│   ├── local-gguf-library-handlers.ts             (typed stubs)
│   ├── local-gguf-library-handlers.test.ts
│   ├── local-gguf-runtime-handlers.ts             (typed stubs)
│   ├── local-gguf-runtime-handlers.test.ts
│   ├── local-gguf-hf-handlers.ts                  (typed stubs)
│   ├── local-gguf-hf-handlers.test.ts
│   ├── local-gguf-benchmark-handlers.ts           (typed stubs)
│   ├── local-gguf-benchmark-handlers.test.ts
│   ├── local-gguf-endpoint-handlers.ts            (typed stubs)
│   └── local-gguf-endpoint-handlers.test.ts
└── services/runtime-settings/
    ├── local-gguf-settings.ts                     (typed accessor)
    └── local-gguf-settings.test.ts

apps/desktop/src/preload/
└── local-gguf-api.ts                              (preload bridge module)
```

### Modified files

```
pnpm-workspace.yaml                                (register new package)
package.json                                       (add llamaCppRelease pin; ensure scripts pick up new package)
apps/desktop/package.json                          (add @team-x/local-gguf-runtime + @team-x/shared-types deps if not already)
apps/desktop/drizzle.config.ts                     (verify migrations dir picks up 0014)
apps/desktop/src/main/db/client.ts                 (register the 4 new repos)
apps/desktop/src/preload/index.ts                  (mount the local-gguf-api surface)
apps/desktop/src/renderer/src/types/window.d.ts    (extend TeamXApi with localGguf)
CHANGELOG.md                                       (Unreleased entry for Phase 1)
```

---

## Tasks

### Task 1: Branch off `main` and verify clean tree

- [ ] **Step 1: Confirm `main` is clean and up to date.**

```bash
git status
git checkout main
git pull --ff-only
git log -1 --oneline
```

Expected: working tree clean, on `main`, HEAD matches origin.

- [ ] **Step 2: Confirm Phase 0 spikes are all merged.**

```bash
git log --oneline --all | grep -i "spike(S" | head -20
```

Expected: see merge commits for S1, S2, S3, S4, S5 spikes. If any spike is still open, STOP and finish Phase 0 first.

- [ ] **Step 3: Create the phase branch.**

```bash
git checkout -b feat/v3.3.0-phase-01-foundation
git status
```

Expected: on `feat/v3.3.0-phase-01-foundation`, clean tree.

---

### Task 2: Scaffold the `@team-x/local-gguf-runtime` package skeleton

**Files:**
- Create: `packages/local-gguf-runtime/package.json`
- Create: `packages/local-gguf-runtime/tsconfig.json`
- Create: `packages/local-gguf-runtime/vitest.config.ts`
- Create: `packages/local-gguf-runtime/biome.json`
- Create: `packages/local-gguf-runtime/src/index.ts`

- [ ] **Step 1: Create `packages/local-gguf-runtime/package.json`.**

```json
{
  "name": "@team-x/local-gguf-runtime",
  "version": "3.2.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    },
    "./errors": {
      "types": "./src/errors.ts",
      "import": "./src/errors.ts"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json --noEmit",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@team-x/shared-types": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vitest": "^2.1.9"
  }
}
```

Note: `version` matches the workspace freeze-pin convention (master plan global rules CR-10).

- [ ] **Step 2: Create `packages/local-gguf-runtime/tsconfig.json`.**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": false,
    "noEmit": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

- [ ] **Step 3: Create `packages/local-gguf-runtime/vitest.config.ts`.**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: {
        lines: 90,
        branches: 90,
        functions: 90,
        statements: 90,
      },
    },
  },
});
```

- [ ] **Step 4: Create `packages/local-gguf-runtime/biome.json`.**

```json
{
  "$schema": "../../node_modules/@biomejs/biome/configuration_schema.json",
  "extends": ["../../biome.json"]
}
```

- [ ] **Step 5: Create `packages/local-gguf-runtime/src/index.ts` (placeholder until subsequent tasks add exports).**

```ts
// Public exports for @team-x/local-gguf-runtime.
// Phase 1 ships only the errors re-export; subsequent phases extend this surface.

export * from './errors';
```

- [ ] **Step 6: Commit.**

```bash
git add packages/local-gguf-runtime/
git commit -m "$(cat <<'EOF'
feat(local-gguf): scaffold @team-x/local-gguf-runtime package skeleton

Adds package.json, tsconfig, vitest config, and Biome config for the
new local-gguf-runtime package. Index.ts re-exports errors only;
subsequent phases extend the public surface.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Register the new package in the workspace

**Files:**
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: Read current `pnpm-workspace.yaml`.**

```bash
cat pnpm-workspace.yaml
```

Expected: existing `packages:` list with `apps/*` and `packages/*` globs (or equivalent).

- [ ] **Step 2: Confirm `packages/*` glob already includes the new package.**

If `pnpm-workspace.yaml` already has `packages/*` as a glob, the new package is auto-picked-up. Verify by running:

```bash
pnpm -r ls --depth -1 --json | jq -r '.[].name' | sort | grep local-gguf
```

Expected: `@team-x/local-gguf-runtime` appears in the list.

If it does NOT appear (because the workspace uses explicit listing), edit `pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 3: Run `pnpm install` to wire the package in.**

```bash
pnpm install
```

Expected: install completes, no errors. New entry visible in `node_modules/.pnpm/@team-x+local-gguf-runtime@...`.

- [ ] **Step 4: Verify typecheck picks up the new package.**

```bash
pnpm typecheck
```

Expected: zero errors. The new package compiles cleanly (it's effectively empty + the errors re-export, which depends on shared-types not yet updated — that comes in Task 4. If this fails on `Cannot find module './errors'`, that's expected — we'll fix in Task 5).

If the failure is the expected `Cannot find module './errors'`, comment out the export in `src/index.ts` temporarily:

```ts
// Will be uncommented after Task 5 lands the errors module.
// export * from './errors';
```

Re-run `pnpm typecheck` — expected zero errors.

- [ ] **Step 5: Commit workspace wiring.**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml packages/local-gguf-runtime/src/index.ts
git commit -m "$(cat <<'EOF'
chore(workspace): register @team-x/local-gguf-runtime package

pnpm install wires the new package into the workspace; index.ts
errors re-export is temporarily commented out until Task 5 lands the
errors module — uncommented later in this phase.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Add `LocalGgufError` and supporting types to `@team-x/shared-types`

**Files:**
- Create: `packages/shared-types/src/local-gguf.ts`
- Create: `packages/shared-types/src/local-gguf.test.ts`
- Modify: `packages/shared-types/src/index.ts` (re-export)

**TDD: red → green → refactor.**

- [ ] **Step 1: Write the failing test first.**

Create `packages/shared-types/src/local-gguf.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  isLocalGgufError,
  type GpuBackend,
  type LocalGgufError,
  type LocalModel,
  type GpuInventory,
  type SourceType,
  type ModelStatus,
  type AdvancedParams,
  type RemoteEndpoint,
  type WatchFolder,
  type LocalGgufRuntimeSettings,
} from './local-gguf';

describe('isLocalGgufError', () => {
  it('returns true for any LocalGgufError variant', () => {
    const variants: LocalGgufError[] = [
      { kind: 'binary-not-found', backend: 'cuda', path: '/nope' },
      { kind: 'binary-unsupported', backend: 'rocm', osVersion: 'Windows 7' },
      { kind: 'gpu-probe-failed', reason: 'nvidia-smi missing' },
      { kind: 'oom-predicted', requiredMb: 9000, availableMb: 4000 },
      { kind: 'oom-runtime', lastStderr: 'CUDA OOM' },
      { kind: 'gguf-parse-failed', path: '/x.gguf', reason: 'EOF' },
      { kind: 'gguf-corrupt', path: '/x.gguf' },
      { kind: 'server-spawn-failed', exitCode: 1, stderr: 'no model' },
      { kind: 'server-crashed', pid: 1234, exitCode: null, stderr: 'sigsegv' },
      { kind: 'port-exhausted' },
      { kind: 'source-unreachable', path: '//NAS/models' },
      { kind: 'hf-download-failed', repo: 'a/b', file: 'c.gguf', httpStatus: 500, body: 'oops' },
      { kind: 'hf-rate-limited', retryAfterS: 60 },
      { kind: 'endpoint-unreachable', url: 'http://x:1234' },
      { kind: 'endpoint-auth-failed', url: 'http://x:1234' },
      { kind: 'pool-full', current: 1, max: 1 },
      { kind: 'context-too-large', requested: 99999, max: 4096 },
    ];
    for (const v of variants) {
      expect(isLocalGgufError(v)).toBe(true);
    }
  });

  it('returns false for non-error values', () => {
    expect(isLocalGgufError(null)).toBe(false);
    expect(isLocalGgufError(undefined)).toBe(false);
    expect(isLocalGgufError('error')).toBe(false);
    expect(isLocalGgufError(42)).toBe(false);
    expect(isLocalGgufError({})).toBe(false);
    expect(isLocalGgufError({ kind: 42 })).toBe(false);
    expect(isLocalGgufError({ kind: '' })).toBe(true); // any non-empty kind passes structural check; spec-level validity is enforced by TS
  });
});

describe('LocalGgufError kind exhaustiveness', () => {
  // Compile-time exhaustiveness check — if a new variant is added to LocalGgufError,
  // this switch will fail TypeScript compilation unless the new variant is added here.
  it('every kind has a discriminator case', () => {
    function exhaustive(e: LocalGgufError): string {
      switch (e.kind) {
        case 'binary-not-found': return e.path;
        case 'binary-unsupported': return e.osVersion;
        case 'gpu-probe-failed': return e.reason;
        case 'oom-predicted': return `${e.requiredMb}/${e.availableMb}`;
        case 'oom-runtime': return e.lastStderr;
        case 'gguf-parse-failed': return e.reason;
        case 'gguf-corrupt': return e.path;
        case 'server-spawn-failed': return e.stderr;
        case 'server-crashed': return e.stderr;
        case 'port-exhausted': return 'port-exhausted';
        case 'source-unreachable': return e.path;
        case 'hf-download-failed': return e.repo;
        case 'hf-rate-limited': return String(e.retryAfterS);
        case 'endpoint-unreachable': return e.url;
        case 'endpoint-auth-failed': return e.url;
        case 'pool-full': return `${e.current}/${e.max}`;
        case 'context-too-large': return `${e.requested}/${e.max}`;
        default: {
          const _never: never = e;
          return _never;
        }
      }
    }
    expect(exhaustive({ kind: 'port-exhausted' })).toBe('port-exhausted');
  });
});

describe('GpuBackend type', () => {
  it('accepts the five backend values', () => {
    const backends: GpuBackend[] = ['cuda', 'rocm', 'vulkan', 'metal', 'cpu'];
    expect(backends).toHaveLength(5);
  });
});

describe('SourceType type', () => {
  it('accepts the three source-type values', () => {
    const sources: SourceType[] = ['file', 'folder-entry', 'remote-endpoint'];
    expect(sources).toHaveLength(3);
  });
});

describe('ModelStatus type', () => {
  it('accepts the six status values', () => {
    const statuses: ModelStatus[] = ['cold', 'loading', 'loaded', 'error', 'unreachable', 'missing'];
    expect(statuses).toHaveLength(6);
  });
});

describe('LocalModel shape', () => {
  it('accepts a fully-populated file-sourced model', () => {
    const m: LocalModel = {
      id: 'uuid-1',
      displayName: 'Llama-3.1-8B-Q4_K_M',
      sourceType: 'file',
      sourcePath: '/models/llama-3.1-8b.gguf',
      endpointId: null,
      ggufArch: 'llama',
      ggufParamsB: 8.0,
      ggufQuant: 'Q4_K_M',
      ggufContextMax: 131072,
      ggufSizeBytes: 4_900_000_000,
      ggufSha256: 'abc',
      ggufChatTemplate: '<|begin_of_text|>...',
      isEmbeddingModel: false,
      isToolCapable: false,
      hfRepoId: 'bartowski/Meta-Llama-3.1-8B-Instruct-GGUF',
      hfFilename: 'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
      license: 'Llama 3.1 Community License',
      chatTemplateOverride: null,
      systemPromptOverride: null,
      status: 'cold',
      statusDetail: null,
      lastUsedAt: null,
      createdAt: 1716750000000,
      updatedAt: 1716750000000,
    };
    expect(m.id).toBe('uuid-1');
  });

  it('accepts a remote-endpoint-sourced model', () => {
    const m: LocalModel = {
      id: 'uuid-2',
      displayName: 'Remote LM Studio',
      sourceType: 'remote-endpoint',
      sourcePath: null,
      endpointId: 'ep-1',
      ggufArch: null,
      ggufParamsB: null,
      ggufQuant: null,
      ggufContextMax: null,
      ggufSizeBytes: null,
      ggufSha256: null,
      ggufChatTemplate: null,
      isEmbeddingModel: false,
      isToolCapable: false,
      hfRepoId: null,
      hfFilename: null,
      license: null,
      chatTemplateOverride: null,
      systemPromptOverride: null,
      status: 'cold',
      statusDetail: null,
      lastUsedAt: null,
      createdAt: 1716750000000,
      updatedAt: 1716750000000,
    };
    expect(m.endpointId).toBe('ep-1');
  });
});

describe('GpuInventory shape', () => {
  it('accepts a fully populated NVIDIA inventory', () => {
    const inv: GpuInventory = {
      detectedAt: 1716750000000,
      cuda: {
        available: true,
        devices: [{ name: 'RTX 4090', vramMb: 24576, backend: 'cuda' }],
        driverVersion: '555.42',
        cudaVersion: '12.5',
      },
      rocm: { available: false, devices: [] },
      vulkan: { available: true, devices: [{ name: 'RTX 4090', vramMb: 24576, backend: 'vulkan' }] },
      metal: { available: false, devices: [] },
      cpu: { cores: 16, ramMb: 65536 },
    };
    expect(inv.cuda.devices[0].vramMb).toBe(24576);
  });
});

describe('LocalGgufRuntimeSettings shape', () => {
  it('accepts a default settings record', () => {
    const s: LocalGgufRuntimeSettings = {
      activeBackend: 'cpu',
      activeBackendIsAutoDetected: true,
      autoFallbackReason: null,
      maxConcurrentLocalModels: 1,
      defaultLibraryFolder: null,
      embeddingModelId: null,
      hfTokenKeyRef: null,
      llamaBinariesVersion: 'b4321',
    };
    expect(s.maxConcurrentLocalModels).toBe(1);
  });
});

describe('AdvancedParams shape (all-null = use auto-tune)', () => {
  it('accepts an all-null params record', () => {
    const p: AdvancedParams = {
      modelId: 'uuid-1',
      nCtx: null,
      nGpuLayers: null,
      nBatch: null,
      nThreads: null,
      temperature: null,
      topP: null,
      topK: null,
      repeatPenalty: null,
      mmap: null,
      mlock: null,
      flashAttention: null,
      updatedAt: 1716750000000,
    };
    expect(p.modelId).toBe('uuid-1');
  });
});

describe('RemoteEndpoint shape', () => {
  it('accepts a Local-tier endpoint', () => {
    const e: RemoteEndpoint = {
      id: 'ep-1',
      name: 'LM Studio on bench',
      baseUrl: 'http://192.168.1.50:1234',
      authHeaderKeyRef: null,
      privacyTier: 'Local',
      status: 'unknown',
      lastCheckedAt: null,
      lastError: null,
      createdAt: 1716750000000,
      updatedAt: 1716750000000,
    };
    expect(e.privacyTier).toBe('Local');
  });
});

describe('WatchFolder shape', () => {
  it('accepts a UNC-path watched folder', () => {
    const w: WatchFolder = {
      id: 'wf-1',
      path: '\\\\NAS-01\\models\\meta',
      recursive: true,
      status: 'unknown',
      lastScanAt: null,
      lastScanError: null,
      createdAt: 1716750000000,
      updatedAt: 1716750000000,
    };
    expect(w.path.startsWith('\\\\')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

```bash
pnpm -F @team-x/shared-types test -- local-gguf.test.ts
```

Expected: FAIL with `Cannot find module './local-gguf'` — confirms the test runs but the production module doesn't exist yet.

- [ ] **Step 3: Create `packages/shared-types/src/local-gguf.ts`.**

```ts
// packages/shared-types/src/local-gguf.ts
//
// Canonical types for the Local & Networked GGUF Support feature (v3.3.0).
// Locked in Phase 1; changes require master-plan update + migration of all
// consumers in the same commit.

export type GpuBackend = 'cuda' | 'rocm' | 'vulkan' | 'metal' | 'cpu';

export type SourceType = 'file' | 'folder-entry' | 'remote-endpoint';

export type ModelStatus =
  | 'cold'
  | 'loading'
  | 'loaded'
  | 'error'
  | 'unreachable'
  | 'missing';

export type EndpointStatus =
  | 'unknown'
  | 'reachable'
  | 'unreachable'
  | 'auth-failed';

export type WatchFolderStatus = 'unknown' | 'reachable' | 'unreachable';

export interface GpuDevice {
  name: string;
  vramMb: number;
  backend: GpuBackend;
}

export interface GpuInventory {
  detectedAt: number;
  cuda: {
    available: boolean;
    devices: GpuDevice[];
    driverVersion?: string;
    cudaVersion?: string;
  };
  rocm: {
    available: boolean;
    devices: GpuDevice[];
    rocmVersion?: string;
  };
  vulkan: { available: boolean; devices: GpuDevice[] };
  metal: { available: boolean; devices: GpuDevice[] };
  cpu: { cores: number; ramMb: number };
}

export interface GgufMetadata {
  arch: string;
  paramsBillions: number | null;
  quant: string | null;
  contextMax: number | null;
  chatTemplate: string | null;
  isEmbeddingModel: boolean;
  isToolCapable: boolean;
  fileSizeBytes: number;
  sha256: string | null;
}

export interface LocalModel {
  id: string;
  displayName: string;
  sourceType: SourceType;
  sourcePath: string | null;
  endpointId: string | null;
  ggufArch: string | null;
  ggufParamsB: number | null;
  ggufQuant: string | null;
  ggufContextMax: number | null;
  ggufSizeBytes: number | null;
  ggufSha256: string | null;
  ggufChatTemplate: string | null;
  isEmbeddingModel: boolean;
  isToolCapable: boolean;
  hfRepoId: string | null;
  hfFilename: string | null;
  license: string | null;
  chatTemplateOverride: string | null;
  systemPromptOverride: string | null;
  status: ModelStatus;
  statusDetail: string | null;
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface AdvancedParams {
  modelId: string;
  nCtx: number | null;
  nGpuLayers: number | null;
  nBatch: number | null;
  nThreads: number | null;
  temperature: number | null;
  topP: number | null;
  topK: number | null;
  repeatPenalty: number | null;
  mmap: boolean | null;
  mlock: boolean | null;
  flashAttention: boolean | null;
  updatedAt: number;
}

export interface BenchmarkResult {
  id: string;
  modelId: string;
  promptEvalTokS: number;
  genTokS: number;
  ttftMs: number;
  vramPeakMb: number | null;
  backend: GpuBackend;
  nCtxUsed: number;
  nGpuLayersUsed: number;
  ranAt: number;
}

export interface RemoteEndpoint {
  id: string;
  name: string;
  baseUrl: string;
  authHeaderKeyRef: string | null;
  privacyTier: 'Local';
  status: EndpointStatus;
  lastCheckedAt: number | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface WatchFolder {
  id: string;
  path: string;
  recursive: boolean;
  status: WatchFolderStatus;
  lastScanAt: number | null;
  lastScanError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface LocalGgufRuntimeSettings {
  activeBackend: GpuBackend;
  activeBackendIsAutoDetected: boolean;
  autoFallbackReason: string | null;
  maxConcurrentLocalModels: number;
  defaultLibraryFolder: string | null;
  embeddingModelId: string | null;
  hfTokenKeyRef: string | null;
  llamaBinariesVersion: string;
}

export type LocalGgufError =
  | { kind: 'binary-not-found'; backend: GpuBackend; path: string }
  | { kind: 'binary-unsupported'; backend: GpuBackend; osVersion: string }
  | { kind: 'gpu-probe-failed'; reason: string }
  | { kind: 'oom-predicted'; requiredMb: number; availableMb: number }
  | { kind: 'oom-runtime'; lastStderr: string }
  | { kind: 'gguf-parse-failed'; path: string; reason: string }
  | { kind: 'gguf-corrupt'; path: string; sha256Mismatch?: boolean }
  | { kind: 'server-spawn-failed'; exitCode: number | null; stderr: string }
  | {
      kind: 'server-crashed';
      pid: number;
      exitCode: number | null;
      stderr: string;
    }
  | { kind: 'port-exhausted' }
  | { kind: 'source-unreachable'; path: string }
  | {
      kind: 'hf-download-failed';
      repo: string;
      file: string;
      httpStatus: number;
      body: string;
    }
  | { kind: 'hf-rate-limited'; retryAfterS: number }
  | { kind: 'endpoint-unreachable'; url: string; httpStatus?: number }
  | { kind: 'endpoint-auth-failed'; url: string }
  | { kind: 'pool-full'; current: number; max: number }
  | { kind: 'context-too-large'; requested: number; max: number };

/**
 * Structural type guard. Confirms an unknown value is shaped like a
 * LocalGgufError (object with a string `kind`). Does NOT enforce that
 * `kind` is one of the declared variants — that's TypeScript's job at
 * compile time. Useful at IPC + JSON deserialization boundaries.
 */
export function isLocalGgufError(value: unknown): value is LocalGgufError {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { kind?: unknown };
  return typeof v.kind === 'string';
}
```

- [ ] **Step 4: Re-export from the `@team-x/shared-types` barrel.**

Open `packages/shared-types/src/index.ts` and add the new export at the bottom (or alphabetically-ordered if that's the convention — verify by reading the file):

```bash
cat packages/shared-types/src/index.ts | head -50
```

Then add:

```ts
export * from './local-gguf';
```

- [ ] **Step 5: Run the test to verify it passes.**

```bash
pnpm -F @team-x/shared-types test -- local-gguf.test.ts
```

Expected: 9 test files pass, ~15 assertions green. If any test fails, the type definition in `local-gguf.ts` is missing or misnamed — fix.

- [ ] **Step 6: Run the full shared-types test suite to check no regression.**

```bash
pnpm -F @team-x/shared-types test
```

Expected: all existing tests pass + the new ones.

- [ ] **Step 7: Typecheck the whole workspace.**

```bash
pnpm typecheck
```

Expected: zero errors. If the `@team-x/local-gguf-runtime` package complains about `./errors`, that's still expected — Task 5 fixes it.

- [ ] **Step 8: Commit.**

```bash
git add packages/shared-types/src/local-gguf.ts packages/shared-types/src/local-gguf.test.ts packages/shared-types/src/index.ts
git commit -m "$(cat <<'EOF'
feat(shared-types): add LocalGgufError + LocalModel + GpuInventory contracts

Locks in the canonical TypeScript contracts for the v3.3.0 local GGUF
support feature: LocalGgufError discriminated union (17 variants),
LocalModel entity, AdvancedParams, BenchmarkResult, RemoteEndpoint,
WatchFolder, LocalGgufRuntimeSettings, and GpuInventory shape.
Includes structural type guard isLocalGgufError() and compile-time
exhaustiveness coverage in the test file.

Implements spec § 6 + § 7 (entities) + § 15 (error taxonomy).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Create `@team-x/local-gguf-runtime` errors module

**Files:**
- Create: `packages/local-gguf-runtime/src/errors.ts`

This is intentionally thin — the canonical error type lives in `@team-x/shared-types`. This module re-exports it so consumers can import from `@team-x/local-gguf-runtime/errors` without crossing the shared-types boundary.

- [ ] **Step 1: Create `packages/local-gguf-runtime/src/errors.ts`.**

```ts
// packages/local-gguf-runtime/src/errors.ts
//
// Re-exports the canonical LocalGgufError union from @team-x/shared-types.
// This indirection lets runtime consumers import errors from
// `@team-x/local-gguf-runtime/errors` without depending on shared-types
// transitively — keeps the dependency graph readable.

export {
  isLocalGgufError,
  type LocalGgufError,
  type GpuBackend,
} from '@team-x/shared-types';
```

- [ ] **Step 2: Restore the public export in the package index.**

Edit `packages/local-gguf-runtime/src/index.ts`:

```ts
// Public exports for @team-x/local-gguf-runtime.
// Phase 1 ships only the errors re-export; subsequent phases extend this surface.

export * from './errors';
```

- [ ] **Step 3: Typecheck.**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 4: Run the runtime package's tests (none yet — should be a clean pass).**

```bash
pnpm -F @team-x/local-gguf-runtime test
```

Expected: `No test files found` is acceptable here. If the harness configures `passWithNoTests`, it exits 0; otherwise it exits with a benign warning. Verify vitest exit code is 0 either way (vitest 2.x defaults to `passWithNoTests: false`; the `vitest.config.ts` in Task 2 didn't enable it — add `passWithNoTests: true` to vitest config if needed).

If exit code is nonzero, edit `packages/local-gguf-runtime/vitest.config.ts` to add `passWithNoTests: true` under `test:`:

```ts
test: {
  environment: 'node',
  passWithNoTests: true,
  ...
}
```

Re-run.

- [ ] **Step 5: Commit.**

```bash
git add packages/local-gguf-runtime/src/errors.ts packages/local-gguf-runtime/src/index.ts packages/local-gguf-runtime/vitest.config.ts
git commit -m "$(cat <<'EOF'
feat(local-gguf): re-export LocalGgufError from runtime package

Adds packages/local-gguf-runtime/src/errors.ts as a thin re-export
of the canonical LocalGgufError union from @team-x/shared-types.
Lets downstream phases import errors from
`@team-x/local-gguf-runtime/errors` without crossing shared-types
directly. Vitest config sets passWithNoTests so the package builds
green before its real test suite arrives in Phase 2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Add Drizzle migration `0014_local_gguf`

**Files:**
- Create: `apps/desktop/src/main/db/migrations/0014_local_gguf.sql`
- Create: `apps/desktop/src/main/db/migrations/meta/0014_snapshot.json` (generated by drizzle-kit)
- Create: `apps/desktop/src/main/db/0014-local-gguf-migration.test.ts` (forward-only test)

**Spec coverage:** Implements spec § 7 (all 5 tables, indexes, CHECK constraints).

- [ ] **Step 1: Read the existing migrations directory to confirm `0013` is the latest.**

```bash
ls apps/desktop/src/main/db/migrations/ | sort
```

Expected: `0000_initial.sql` … `0013_<latest>.sql`, plus a `meta/` subdir. The new file is `0014_local_gguf.sql`. If `0013` is NOT the latest (a `0014` already exists), STOP — sync with `main` and rename appropriately.

- [ ] **Step 2: Write the failing forward-only migration test.**

Create `apps/desktop/src/main/db/0014-local-gguf-migration.test.ts`:

```ts
import Database from 'better-sqlite3';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

describe('migration 0014_local_gguf', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = new Database(':memory:');
    // Apply all migrations up to 0013 first (consult migrate.ts patterns;
    // for the test we apply the raw SQL files in order).
    const migrationDir = join(__dirname, 'migrations');
    for (let i = 0; i <= 13; i++) {
      const padded = String(i).padStart(4, '0');
      // The migration file name pattern varies — read from disk.
      const files = await readMigrationFile(migrationDir, padded);
      for (const sql of files) {
        db.exec(sql);
      }
    }
  });

  afterEach(() => {
    db.close();
  });

  it('creates table local_models with the expected columns', async () => {
    const sql = await readFile(join(__dirname, 'migrations', '0014_local_gguf.sql'), 'utf8');
    db.exec(sql);

    const cols = db.prepare(`PRAGMA table_info(local_models)`).all() as Array<{ name: string; type: string; notnull: number; pk: number }>;
    const names = cols.map((c) => c.name).sort();
    expect(names).toEqual(
      [
        'chat_template_override',
        'created_at',
        'display_name',
        'endpoint_id',
        'gguf_arch',
        'gguf_chat_template',
        'gguf_context_max',
        'gguf_params_b',
        'gguf_quant',
        'gguf_sha256',
        'gguf_size_bytes',
        'hf_filename',
        'hf_repo_id',
        'id',
        'is_embedding_model',
        'is_tool_capable',
        'last_used_at',
        'license',
        'source_path',
        'source_type',
        'status',
        'status_detail',
        'system_prompt_override',
        'updated_at',
      ].sort(),
    );
    expect(cols.find((c) => c.name === 'id')?.pk).toBe(1);
  });

  it('creates table local_model_advanced_params with FK + cascade', async () => {
    const sql = await readFile(join(__dirname, 'migrations', '0014_local_gguf.sql'), 'utf8');
    db.exec(sql);
    db.exec(`PRAGMA foreign_keys = ON`);

    // Insert a model, an advanced-params row, then delete the model → row should cascade
    const now = Date.now();
    db.prepare(`
      INSERT INTO local_models (
        id, display_name, source_type, source_path, endpoint_id,
        gguf_arch, gguf_params_b, gguf_quant, gguf_context_max, gguf_size_bytes,
        gguf_sha256, gguf_chat_template, is_embedding_model, is_tool_capable,
        hf_repo_id, hf_filename, license, chat_template_override, system_prompt_override,
        status, status_detail, last_used_at, created_at, updated_at
      ) VALUES (
        'm1', 'Test', 'file', '/tmp/a.gguf', NULL,
        'llama', 7.0, 'Q4_K_M', 4096, 4000000,
        NULL, NULL, 0, 0,
        NULL, NULL, NULL, NULL, NULL,
        'cold', NULL, NULL, ?, ?
      )
    `).run(now, now);

    db.prepare(`
      INSERT INTO local_model_advanced_params (model_id, n_ctx, updated_at)
      VALUES ('m1', 8192, ?)
    `).run(now);

    const before = db.prepare(`SELECT COUNT(*) as c FROM local_model_advanced_params`).get() as { c: number };
    expect(before.c).toBe(1);

    db.prepare(`DELETE FROM local_models WHERE id = ?`).run('m1');

    const after = db.prepare(`SELECT COUNT(*) as c FROM local_model_advanced_params`).get() as { c: number };
    expect(after.c).toBe(0);
  });

  it('creates index idx_local_models_endpoint_id', async () => {
    const sql = await readFile(join(__dirname, 'migrations', '0014_local_gguf.sql'), 'utf8');
    db.exec(sql);

    const indexes = db.prepare(`PRAGMA index_list(local_models)`).all() as Array<{ name: string }>;
    const names = indexes.map((i) => i.name);
    expect(names).toContain('idx_local_models_endpoint_id');
    expect(names).toContain('idx_local_models_source_type');
    expect(names).toContain('idx_local_models_status');
    expect(names).toContain('idx_local_models_last_used_at');
  });

  it('enforces source_type CHECK constraint', async () => {
    const sql = await readFile(join(__dirname, 'migrations', '0014_local_gguf.sql'), 'utf8');
    db.exec(sql);

    const insertBadSourceType = () =>
      db.prepare(`
        INSERT INTO local_models (
          id, display_name, source_type, source_path, endpoint_id,
          gguf_arch, gguf_params_b, gguf_quant, gguf_context_max, gguf_size_bytes,
          gguf_sha256, gguf_chat_template, is_embedding_model, is_tool_capable,
          hf_repo_id, hf_filename, license, chat_template_override, system_prompt_override,
          status, status_detail, last_used_at, created_at, updated_at
        ) VALUES (
          'm-bad', 'Bad', 'invalid-source-type', '/x', NULL,
          NULL, NULL, NULL, NULL, NULL,
          NULL, NULL, 0, 0,
          NULL, NULL, NULL, NULL, NULL,
          'cold', NULL, NULL, 0, 0
        )
      `).run();
    expect(insertBadSourceType).toThrow(/CHECK constraint failed/);
  });

  it('enforces the source-type/path/endpoint cross-constraint', async () => {
    const sql = await readFile(join(__dirname, 'migrations', '0014_local_gguf.sql'), 'utf8');
    db.exec(sql);

    // source_type='file' but source_path NULL → must fail
    const fileButNoPath = () =>
      db.prepare(`
        INSERT INTO local_models (
          id, display_name, source_type, source_path, endpoint_id,
          gguf_arch, gguf_params_b, gguf_quant, gguf_context_max, gguf_size_bytes,
          gguf_sha256, gguf_chat_template, is_embedding_model, is_tool_capable,
          hf_repo_id, hf_filename, license, chat_template_override, system_prompt_override,
          status, status_detail, last_used_at, created_at, updated_at
        ) VALUES (
          'm-bad', 'Bad', 'file', NULL, NULL,
          NULL, NULL, NULL, NULL, NULL,
          NULL, NULL, 0, 0,
          NULL, NULL, NULL, NULL, NULL,
          'cold', NULL, NULL, 0, 0
        )
      `).run();
    expect(fileButNoPath).toThrow(/CHECK constraint failed/);

    // source_type='remote-endpoint' but endpoint_id NULL → must fail
    const remoteButNoEndpoint = () =>
      db.prepare(`
        INSERT INTO local_models (
          id, display_name, source_type, source_path, endpoint_id,
          gguf_arch, gguf_params_b, gguf_quant, gguf_context_max, gguf_size_bytes,
          gguf_sha256, gguf_chat_template, is_embedding_model, is_tool_capable,
          hf_repo_id, hf_filename, license, chat_template_override, system_prompt_override,
          status, status_detail, last_used_at, created_at, updated_at
        ) VALUES (
          'm-bad2', 'Bad', 'remote-endpoint', NULL, NULL,
          NULL, NULL, NULL, NULL, NULL,
          NULL, NULL, 0, 0,
          NULL, NULL, NULL, NULL, NULL,
          'cold', NULL, NULL, 0, 0
        )
      `).run();
    expect(remoteButNoEndpoint).toThrow(/CHECK constraint failed/);
  });

  it('creates all 5 new tables', async () => {
    const sql = await readFile(join(__dirname, 'migrations', '0014_local_gguf.sql'), 'utf8');
    db.exec(sql);

    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'local_model%'`).all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name).sort();
    expect(names).toEqual([
      'local_model_advanced_params',
      'local_model_benchmarks',
      'local_model_endpoints',
      'local_model_watch_folders',
      'local_models',
    ]);
  });
});

async function readMigrationFile(dir: string, padded: string): Promise<string[]> {
  const { readdir, readFile } = await import('node:fs/promises');
  const files = (await readdir(dir)).filter((f) => f.startsWith(padded + '_') || f.startsWith(padded + '-'));
  const sqls: string[] = [];
  for (const f of files) {
    if (f.endsWith('.sql')) sqls.push(await readFile(join(dir, f), 'utf8'));
  }
  return sqls;
}
```

- [ ] **Step 3: Run the test to verify it fails.**

```bash
pnpm -F @team-x/desktop test -- 0014-local-gguf-migration.test.ts
```

Expected: FAIL with `ENOENT: no such file or directory ... 0014_local_gguf.sql`. Confirms the test runs.

- [ ] **Step 4: Create the migration file `apps/desktop/src/main/db/migrations/0014_local_gguf.sql`.**

```sql
-- Migration: 0014_local_gguf
-- Date: 2026-05-27
-- Spec: docs/superpowers/specs/2026-05-27-local-gguf-support-design.md § 7
--
-- Introduces 5 tables for the Local & Networked GGUF Support feature:
--   - local_models                  (the library)
--   - local_model_advanced_params   (per-model overrides; PK = model_id)
--   - local_model_benchmarks        (benchmark history per model)
--   - local_model_endpoints         (remote LAN endpoints)
--   - local_model_watch_folders     (folder-scan sources)
--
-- Forward-only. Rollback note: dropping these tables is safe (no other
-- table references them), but downstream features in v3.3.0+ depend on
-- their existence. To roll back, also remove every consumer in
-- packages/local-gguf-runtime/, packages/provider-router/ (local-gguf
-- adapters), packages/intelligence/src/rag/embeddings.ts (local-gguf-embed
-- branch), and apps/desktop/src/main/services/local-gguf/. Migration is
-- not reversible by SQL alone.

-- 1. The library: every model the user has registered, of any source type.
CREATE TABLE local_models (
  id                       TEXT PRIMARY KEY,
  display_name             TEXT NOT NULL,
  source_type              TEXT NOT NULL CHECK (source_type IN
                              ('file', 'folder-entry', 'remote-endpoint')),
  source_path              TEXT,
  endpoint_id              TEXT REFERENCES local_model_endpoints(id) ON DELETE CASCADE,
  gguf_arch                TEXT,
  gguf_params_b            REAL,
  gguf_quant               TEXT,
  gguf_context_max         INTEGER,
  gguf_size_bytes          INTEGER,
  gguf_sha256              TEXT,
  gguf_chat_template       TEXT,
  is_embedding_model       INTEGER NOT NULL DEFAULT 0 CHECK (is_embedding_model IN (0, 1)),
  is_tool_capable          INTEGER NOT NULL DEFAULT 0 CHECK (is_tool_capable IN (0, 1)),
  hf_repo_id               TEXT,
  hf_filename              TEXT,
  license                  TEXT,
  chat_template_override   TEXT,
  system_prompt_override   TEXT,
  status                   TEXT NOT NULL DEFAULT 'cold'
                              CHECK (status IN ('cold', 'loading', 'loaded',
                                                'error', 'unreachable', 'missing')),
  status_detail            TEXT,
  last_used_at             INTEGER,
  created_at               INTEGER NOT NULL,
  updated_at               INTEGER NOT NULL,
  CHECK (
    (source_type = 'file'             AND source_path IS NOT NULL AND endpoint_id IS NULL) OR
    (source_type = 'folder-entry'     AND source_path IS NOT NULL AND endpoint_id IS NULL) OR
    (source_type = 'remote-endpoint'  AND endpoint_id IS NOT NULL AND source_path IS NULL)
  )
);

CREATE INDEX idx_local_models_source_type  ON local_models(source_type);
CREATE INDEX idx_local_models_status       ON local_models(status);
CREATE INDEX idx_local_models_last_used_at ON local_models(last_used_at);
CREATE INDEX idx_local_models_endpoint_id  ON local_models(endpoint_id);

-- 2. Per-model Advanced panel overrides. NULL values mean "use auto-tune."
CREATE TABLE local_model_advanced_params (
  model_id          TEXT PRIMARY KEY REFERENCES local_models(id) ON DELETE CASCADE,
  n_ctx             INTEGER,
  n_gpu_layers      INTEGER,
  n_batch           INTEGER,
  n_threads         INTEGER,
  temperature       REAL,
  top_p             REAL,
  top_k             INTEGER,
  repeat_penalty    REAL,
  mmap              INTEGER CHECK (mmap IS NULL OR mmap IN (0, 1)),
  mlock             INTEGER CHECK (mlock IS NULL OR mlock IN (0, 1)),
  flash_attention   INTEGER CHECK (flash_attention IS NULL OR flash_attention IN (0, 1)),
  updated_at        INTEGER NOT NULL
);

-- 3. Benchmark history per model.
CREATE TABLE local_model_benchmarks (
  id                    TEXT PRIMARY KEY,
  model_id              TEXT NOT NULL REFERENCES local_models(id) ON DELETE CASCADE,
  prompt_eval_tok_s     REAL NOT NULL,
  gen_tok_s             REAL NOT NULL,
  ttft_ms               INTEGER NOT NULL,
  vram_peak_mb          INTEGER,
  backend               TEXT NOT NULL,
  n_ctx_used            INTEGER NOT NULL,
  n_gpu_layers_used     INTEGER NOT NULL,
  ran_at                INTEGER NOT NULL
);

CREATE INDEX idx_local_model_benchmarks_model_id_ran_at
  ON local_model_benchmarks(model_id, ran_at DESC);

-- 4. Remote LAN endpoints.
CREATE TABLE local_model_endpoints (
  id                       TEXT PRIMARY KEY,
  name                     TEXT NOT NULL,
  base_url                 TEXT NOT NULL,
  auth_header_key_ref      TEXT,
  privacy_tier             TEXT NOT NULL DEFAULT 'Local'
                              CHECK (privacy_tier = 'Local'),
  status                   TEXT NOT NULL DEFAULT 'unknown'
                              CHECK (status IN ('unknown', 'reachable',
                                                'unreachable', 'auth-failed')),
  last_checked_at          INTEGER,
  last_error               TEXT,
  created_at               INTEGER NOT NULL,
  updated_at               INTEGER NOT NULL
);

-- 5. Watched folders (file-system source — local paths or UNC/SMB).
CREATE TABLE local_model_watch_folders (
  id                TEXT PRIMARY KEY,
  path              TEXT NOT NULL,
  recursive         INTEGER NOT NULL DEFAULT 1 CHECK (recursive IN (0, 1)),
  status            TEXT NOT NULL DEFAULT 'unknown'
                       CHECK (status IN ('unknown', 'reachable', 'unreachable')),
  last_scan_at      INTEGER,
  last_scan_error   TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE INDEX idx_local_model_watch_folders_status ON local_model_watch_folders(status);
```

- [ ] **Step 5: Generate the Drizzle snapshot.**

```bash
pnpm -F @team-x/desktop exec drizzle-kit generate --name local_gguf
```

Expected: drizzle-kit writes `apps/desktop/src/main/db/migrations/meta/0014_snapshot.json` and updates `apps/desktop/src/main/db/migrations/meta/_journal.json`. If drizzle-kit objects because no schema changes were made (the migration is hand-written SQL), accept that — the meta snapshot for hand-written SQL migrations may need to be hand-edited following the pattern in `meta/0000_snapshot.json`. Inspect a few existing snapshot files first:

```bash
ls apps/desktop/src/main/db/migrations/meta/
cat apps/desktop/src/main/db/migrations/meta/_journal.json
```

If the journal needs an entry, add it:

```json
{
  "idx": 14,
  "version": "<existing version>",
  "when": <epoch-ms-now>,
  "tag": "0014_local_gguf",
  "breakpoints": true
}
```

- [ ] **Step 6: Run the migration test.**

```bash
pnpm -F @team-x/desktop test -- 0014-local-gguf-migration.test.ts
```

Expected: 6 tests pass — column inventory, FK cascade, indexes, CHECK source_type, CHECK cross-constraint, all-5-tables.

- [ ] **Step 7: Run the full desktop test suite to confirm no regression.**

```bash
pnpm -F @team-x/desktop test
```

Expected: all existing tests pass + the new migration tests.

- [ ] **Step 8: Commit.**

```bash
git add apps/desktop/src/main/db/migrations/0014_local_gguf.sql apps/desktop/src/main/db/migrations/meta/ apps/desktop/src/main/db/0014-local-gguf-migration.test.ts
git commit -m "$(cat <<'EOF'
feat(db): add migration 0014_local_gguf — 5 tables + indexes + CHECKs

Introduces local_models, local_model_advanced_params,
local_model_benchmarks, local_model_endpoints, local_model_watch_folders.
CHECK constraints enforce source_type union, status union, and the
source-type/path/endpoint cross-constraint that disambiguates how a
LocalModel row points at its backing source. Indexes cover the
hot-path queries: source_type, status, last_used_at, endpoint_id
(supports the ON DELETE CASCADE from endpoints), and
(model_id, ran_at DESC) for benchmark history.

Implements spec § 7. Forward-only — rollback notes inline in SQL header.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Create `local-models` repo (CRUD)

**Files:**
- Create: `apps/desktop/src/main/db/repos/local-models.ts`
- Create: `apps/desktop/src/main/db/repos/local-models.test.ts`

**TDD per CRUD method.** Read `apps/desktop/src/main/db/repos/employees.ts` first to match the existing repo pattern (constructor takes a `Database` instance, exported as a class or factory, returns typed entities).

- [ ] **Step 1: Inspect existing repo pattern.**

```bash
ls apps/desktop/src/main/db/repos/
```

Pick a similar-shape repo (e.g. `employees.ts` or `companies.ts`) and read its structure:

```bash
cat apps/desktop/src/main/db/repos/employees.ts | head -80
cat apps/desktop/src/main/db/repos/employees.test.ts | head -80
```

Note: factory function vs class, transaction wrapping convention, ID generation (likely `crypto.randomUUID()`), `created_at`/`updated_at` handling, row-to-entity mapping (snake_case ↔ camelCase).

- [ ] **Step 2: Write the failing test file.**

Create `apps/desktop/src/main/db/repos/local-models.test.ts` (skeleton — fill in each test as you go through Steps 3–10):

```ts
import Database from 'better-sqlite3';
import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocalModelsRepo, type LocalModelsRepo } from './local-models';

describe('localModelsRepo', () => {
  let db: Database.Database;
  let repo: LocalModelsRepo;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`PRAGMA foreign_keys = ON`);
    const migrationDir = join(__dirname, '..', 'migrations');
    const files = (await readdir(migrationDir)).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      db.exec(await readFile(join(migrationDir, f), 'utf8'));
    }
    repo = createLocalModelsRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  it('insert + getById round-trips a file-source model', () => {
    const created = repo.insert({
      displayName: 'Llama-3.1-8B-Q4_K_M',
      sourceType: 'file',
      sourcePath: '/models/llama-3.1-8b.gguf',
      endpointId: null,
      ggufArch: 'llama',
      ggufParamsB: 8.0,
      ggufQuant: 'Q4_K_M',
      ggufContextMax: 131072,
      ggufSizeBytes: 4_900_000_000,
      ggufSha256: null,
      ggufChatTemplate: null,
      isEmbeddingModel: false,
      isToolCapable: false,
      hfRepoId: null,
      hfFilename: null,
      license: null,
      chatTemplateOverride: null,
      systemPromptOverride: null,
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.displayName).toBe('Llama-3.1-8B-Q4_K_M');
    expect(created.status).toBe('cold');
    expect(created.createdAt).toBeGreaterThan(0);
    expect(created.updatedAt).toBe(created.createdAt);

    const fetched = repo.getById(created.id);
    expect(fetched).toEqual(created);
  });

  it('insert with remote-endpoint source requires endpointId', () => {
    // First insert an endpoint row directly (the endpoints repo doesn't exist yet in this task,
    // so we use raw SQL — this also tests that the cross-CHECK fires correctly).
    const now = Date.now();
    db.prepare(`
      INSERT INTO local_model_endpoints (id, name, base_url, privacy_tier, status, created_at, updated_at)
      VALUES ('ep-1', 'LM Studio', 'http://192.168.1.50:1234', 'Local', 'unknown', ?, ?)
    `).run(now, now);

    const created = repo.insert({
      displayName: 'LM Studio Model',
      sourceType: 'remote-endpoint',
      sourcePath: null,
      endpointId: 'ep-1',
      ggufArch: null,
      ggufParamsB: null,
      ggufQuant: null,
      ggufContextMax: null,
      ggufSizeBytes: null,
      ggufSha256: null,
      ggufChatTemplate: null,
      isEmbeddingModel: false,
      isToolCapable: false,
      hfRepoId: null,
      hfFilename: null,
      license: null,
      chatTemplateOverride: null,
      systemPromptOverride: null,
    });
    expect(created.endpointId).toBe('ep-1');
    expect(created.sourcePath).toBeNull();
  });

  it('list returns all rows ordered by last_used_at DESC NULLS LAST then created_at DESC', () => {
    const m1 = repo.insert(fileFixture('M1'));
    const m2 = repo.insert(fileFixture('M2'));
    const m3 = repo.insert(fileFixture('M3'));
    repo.touchLastUsed(m2.id);

    const list = repo.list();
    expect(list.map((m) => m.displayName)).toEqual(['M2', 'M3', 'M1']);
  });

  it('listBySourceType filters correctly', () => {
    const m1 = repo.insert(fileFixture('M1'));
    const m2 = repo.insert(fileFixture('M2'));
    db.prepare(`
      INSERT INTO local_model_endpoints (id, name, base_url, privacy_tier, status, created_at, updated_at)
      VALUES ('ep-1', 'EP', 'http://x', 'Local', 'unknown', 1, 1)
    `).run();
    const m3 = repo.insert(remoteFixture('M3', 'ep-1'));

    const files = repo.listBySourceType('file');
    expect(files.map((m) => m.id).sort()).toEqual([m1.id, m2.id].sort());

    const remotes = repo.listBySourceType('remote-endpoint');
    expect(remotes.map((m) => m.id)).toEqual([m3.id]);
  });

  it('updateStatus updates status + statusDetail + updatedAt', () => {
    const m = repo.insert(fileFixture('M1'));
    const before = m.updatedAt;
    // Sleep one tick so updatedAt advances
    const result = repo.updateStatus(m.id, 'error', 'failed to load');
    expect(result.status).toBe('error');
    expect(result.statusDetail).toBe('failed to load');
    expect(result.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('setSystemPrompt persists per-model override', () => {
    const m = repo.insert(fileFixture('M1'));
    const updated = repo.setSystemPrompt(m.id, 'You are a sarcastic assistant.');
    expect(updated.systemPromptOverride).toBe('You are a sarcastic assistant.');
  });

  it('setSystemPrompt(null) clears the override', () => {
    const m = repo.insert(fileFixture('M1'));
    repo.setSystemPrompt(m.id, 'X');
    const cleared = repo.setSystemPrompt(m.id, null);
    expect(cleared.systemPromptOverride).toBeNull();
  });

  it('setChatTemplateOverride persists', () => {
    const m = repo.insert(fileFixture('M1'));
    const updated = repo.setChatTemplateOverride(m.id, '<|user|>{{prompt}}<|assistant|>');
    expect(updated.chatTemplateOverride).toBe('<|user|>{{prompt}}<|assistant|>');
  });

  it('remove deletes the row', () => {
    const m = repo.insert(fileFixture('M1'));
    repo.remove(m.id);
    expect(repo.getById(m.id)).toBeNull();
  });

  it('remove cascades to local_model_advanced_params', () => {
    const m = repo.insert(fileFixture('M1'));
    db.prepare(`
      INSERT INTO local_model_advanced_params (model_id, n_ctx, updated_at)
      VALUES (?, 8192, ?)
    `).run(m.id, Date.now());
    const before = db.prepare(`SELECT COUNT(*) AS c FROM local_model_advanced_params`).get() as { c: number };
    expect(before.c).toBe(1);
    repo.remove(m.id);
    const after = db.prepare(`SELECT COUNT(*) AS c FROM local_model_advanced_params`).get() as { c: number };
    expect(after.c).toBe(0);
  });
});

function fileFixture(name: string) {
  return {
    displayName: name,
    sourceType: 'file' as const,
    sourcePath: `/m/${name}.gguf`,
    endpointId: null,
    ggufArch: 'llama' as string | null,
    ggufParamsB: 7.0 as number | null,
    ggufQuant: 'Q4_K_M' as string | null,
    ggufContextMax: 4096 as number | null,
    ggufSizeBytes: 4_000_000_000 as number | null,
    ggufSha256: null,
    ggufChatTemplate: null,
    isEmbeddingModel: false,
    isToolCapable: false,
    hfRepoId: null,
    hfFilename: null,
    license: null,
    chatTemplateOverride: null,
    systemPromptOverride: null,
  };
}

function remoteFixture(name: string, endpointId: string) {
  return {
    displayName: name,
    sourceType: 'remote-endpoint' as const,
    sourcePath: null,
    endpointId,
    ggufArch: null,
    ggufParamsB: null,
    ggufQuant: null,
    ggufContextMax: null,
    ggufSizeBytes: null,
    ggufSha256: null,
    ggufChatTemplate: null,
    isEmbeddingModel: false,
    isToolCapable: false,
    hfRepoId: null,
    hfFilename: null,
    license: null,
    chatTemplateOverride: null,
    systemPromptOverride: null,
  };
}
```

- [ ] **Step 3: Run the test to verify it fails.**

```bash
pnpm -F @team-x/desktop test -- local-models.test.ts
```

Expected: FAIL with `Cannot find module './local-models'`.

- [ ] **Step 4: Create `apps/desktop/src/main/db/repos/local-models.ts`.**

```ts
// apps/desktop/src/main/db/repos/local-models.ts
//
// Repository for the local_models table. Wraps prepared statements
// behind a small typed surface; row-to-entity mapping is in mapRow.

import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { LocalModel, ModelStatus, SourceType } from '@team-x/shared-types';

export interface InsertLocalModelInput {
  displayName: string;
  sourceType: SourceType;
  sourcePath: string | null;
  endpointId: string | null;
  ggufArch: string | null;
  ggufParamsB: number | null;
  ggufQuant: string | null;
  ggufContextMax: number | null;
  ggufSizeBytes: number | null;
  ggufSha256: string | null;
  ggufChatTemplate: string | null;
  isEmbeddingModel: boolean;
  isToolCapable: boolean;
  hfRepoId: string | null;
  hfFilename: string | null;
  license: string | null;
  chatTemplateOverride: string | null;
  systemPromptOverride: string | null;
}

export interface LocalModelsRepo {
  insert(input: InsertLocalModelInput): LocalModel;
  getById(id: string): LocalModel | null;
  list(): LocalModel[];
  listBySourceType(sourceType: SourceType): LocalModel[];
  updateStatus(id: string, status: ModelStatus, detail: string | null): LocalModel;
  setSystemPrompt(id: string, prompt: string | null): LocalModel;
  setChatTemplateOverride(id: string, template: string | null): LocalModel;
  touchLastUsed(id: string): LocalModel;
  remove(id: string): void;
}

interface LocalModelRow {
  id: string;
  display_name: string;
  source_type: SourceType;
  source_path: string | null;
  endpoint_id: string | null;
  gguf_arch: string | null;
  gguf_params_b: number | null;
  gguf_quant: string | null;
  gguf_context_max: number | null;
  gguf_size_bytes: number | null;
  gguf_sha256: string | null;
  gguf_chat_template: string | null;
  is_embedding_model: number;
  is_tool_capable: number;
  hf_repo_id: string | null;
  hf_filename: string | null;
  license: string | null;
  chat_template_override: string | null;
  system_prompt_override: string | null;
  status: ModelStatus;
  status_detail: string | null;
  last_used_at: number | null;
  created_at: number;
  updated_at: number;
}

function mapRow(row: LocalModelRow): LocalModel {
  return {
    id: row.id,
    displayName: row.display_name,
    sourceType: row.source_type,
    sourcePath: row.source_path,
    endpointId: row.endpoint_id,
    ggufArch: row.gguf_arch,
    ggufParamsB: row.gguf_params_b,
    ggufQuant: row.gguf_quant,
    ggufContextMax: row.gguf_context_max,
    ggufSizeBytes: row.gguf_size_bytes,
    ggufSha256: row.gguf_sha256,
    ggufChatTemplate: row.gguf_chat_template,
    isEmbeddingModel: row.is_embedding_model === 1,
    isToolCapable: row.is_tool_capable === 1,
    hfRepoId: row.hf_repo_id,
    hfFilename: row.hf_filename,
    license: row.license,
    chatTemplateOverride: row.chat_template_override,
    systemPromptOverride: row.system_prompt_override,
    status: row.status,
    statusDetail: row.status_detail,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createLocalModelsRepo(db: Database.Database): LocalModelsRepo {
  const insertStmt = db.prepare(`
    INSERT INTO local_models (
      id, display_name, source_type, source_path, endpoint_id,
      gguf_arch, gguf_params_b, gguf_quant, gguf_context_max, gguf_size_bytes,
      gguf_sha256, gguf_chat_template, is_embedding_model, is_tool_capable,
      hf_repo_id, hf_filename, license, chat_template_override, system_prompt_override,
      status, status_detail, last_used_at, created_at, updated_at
    ) VALUES (
      @id, @display_name, @source_type, @source_path, @endpoint_id,
      @gguf_arch, @gguf_params_b, @gguf_quant, @gguf_context_max, @gguf_size_bytes,
      @gguf_sha256, @gguf_chat_template, @is_embedding_model, @is_tool_capable,
      @hf_repo_id, @hf_filename, @license, @chat_template_override, @system_prompt_override,
      'cold', NULL, NULL, @created_at, @updated_at
    )
  `);

  const getByIdStmt = db.prepare(`SELECT * FROM local_models WHERE id = ?`);

  const listStmt = db.prepare(`
    SELECT * FROM local_models
    ORDER BY (last_used_at IS NULL), last_used_at DESC, created_at DESC
  `);

  const listBySourceTypeStmt = db.prepare(`
    SELECT * FROM local_models
    WHERE source_type = ?
    ORDER BY (last_used_at IS NULL), last_used_at DESC, created_at DESC
  `);

  const updateStatusStmt = db.prepare(`
    UPDATE local_models SET status = ?, status_detail = ?, updated_at = ? WHERE id = ?
  `);

  const setSystemPromptStmt = db.prepare(`
    UPDATE local_models SET system_prompt_override = ?, updated_at = ? WHERE id = ?
  `);

  const setChatTemplateStmt = db.prepare(`
    UPDATE local_models SET chat_template_override = ?, updated_at = ? WHERE id = ?
  `);

  const touchLastUsedStmt = db.prepare(`
    UPDATE local_models SET last_used_at = ?, updated_at = ? WHERE id = ?
  `);

  const removeStmt = db.prepare(`DELETE FROM local_models WHERE id = ?`);

  return {
    insert(input) {
      const id = randomUUID();
      const now = Date.now();
      insertStmt.run({
        id,
        display_name: input.displayName,
        source_type: input.sourceType,
        source_path: input.sourcePath,
        endpoint_id: input.endpointId,
        gguf_arch: input.ggufArch,
        gguf_params_b: input.ggufParamsB,
        gguf_quant: input.ggufQuant,
        gguf_context_max: input.ggufContextMax,
        gguf_size_bytes: input.ggufSizeBytes,
        gguf_sha256: input.ggufSha256,
        gguf_chat_template: input.ggufChatTemplate,
        is_embedding_model: input.isEmbeddingModel ? 1 : 0,
        is_tool_capable: input.isToolCapable ? 1 : 0,
        hf_repo_id: input.hfRepoId,
        hf_filename: input.hfFilename,
        license: input.license,
        chat_template_override: input.chatTemplateOverride,
        system_prompt_override: input.systemPromptOverride,
        created_at: now,
        updated_at: now,
      });
      const row = getByIdStmt.get(id) as LocalModelRow;
      return mapRow(row);
    },
    getById(id) {
      const row = getByIdStmt.get(id) as LocalModelRow | undefined;
      return row ? mapRow(row) : null;
    },
    list() {
      const rows = listStmt.all() as LocalModelRow[];
      return rows.map(mapRow);
    },
    listBySourceType(sourceType) {
      const rows = listBySourceTypeStmt.all(sourceType) as LocalModelRow[];
      return rows.map(mapRow);
    },
    updateStatus(id, status, detail) {
      updateStatusStmt.run(status, detail, Date.now(), id);
      const row = getByIdStmt.get(id) as LocalModelRow;
      return mapRow(row);
    },
    setSystemPrompt(id, prompt) {
      setSystemPromptStmt.run(prompt, Date.now(), id);
      const row = getByIdStmt.get(id) as LocalModelRow;
      return mapRow(row);
    },
    setChatTemplateOverride(id, template) {
      setChatTemplateStmt.run(template, Date.now(), id);
      const row = getByIdStmt.get(id) as LocalModelRow;
      return mapRow(row);
    },
    touchLastUsed(id) {
      const now = Date.now();
      touchLastUsedStmt.run(now, now, id);
      const row = getByIdStmt.get(id) as LocalModelRow;
      return mapRow(row);
    },
    remove(id) {
      removeStmt.run(id);
    },
  };
}
```

- [ ] **Step 5: Run the test.**

```bash
pnpm -F @team-x/desktop test -- local-models.test.ts
```

Expected: all 10 tests pass.

- [ ] **Step 6: Run typecheck.**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 7: Commit.**

```bash
git add apps/desktop/src/main/db/repos/local-models.ts apps/desktop/src/main/db/repos/local-models.test.ts
git commit -m "$(cat <<'EOF'
feat(db): add local_models repo with CRUD + status + override mutations

createLocalModelsRepo(db) returns a typed repo with insert, getById,
list (ordered by last_used_at DESC NULLS LAST then created_at DESC),
listBySourceType, updateStatus, setSystemPrompt,
setChatTemplateOverride, touchLastUsed, and remove. Cascading FK
deletes from this table propagate to local_model_advanced_params and
local_model_benchmarks per the migration.

Implements spec § 7 local_models table operations.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Create `local-model-advanced-params` repo

**Files:**
- Create: `apps/desktop/src/main/db/repos/local-model-advanced-params.ts`
- Create: `apps/desktop/src/main/db/repos/local-model-advanced-params.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `apps/desktop/src/main/db/repos/local-model-advanced-params.test.ts`:

```ts
import Database from 'better-sqlite3';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocalModelAdvancedParamsRepo, type LocalModelAdvancedParamsRepo } from './local-model-advanced-params';

describe('localModelAdvancedParamsRepo', () => {
  let db: Database.Database;
  let repo: LocalModelAdvancedParamsRepo;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`PRAGMA foreign_keys = ON`);
    const migrationDir = join(__dirname, '..', 'migrations');
    const files = (await readdir(migrationDir)).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) db.exec(await readFile(join(migrationDir, f), 'utf8'));
    // Seed a model so FK targets are valid
    const now = Date.now();
    db.prepare(`
      INSERT INTO local_models (
        id, display_name, source_type, source_path, endpoint_id,
        gguf_arch, gguf_params_b, gguf_quant, gguf_context_max, gguf_size_bytes,
        gguf_sha256, gguf_chat_template, is_embedding_model, is_tool_capable,
        hf_repo_id, hf_filename, license, chat_template_override, system_prompt_override,
        status, status_detail, last_used_at, created_at, updated_at
      ) VALUES ('m1', 'M', 'file', '/x.gguf', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, NULL, NULL, NULL, NULL, NULL, 'cold', NULL, NULL, ?, ?)
    `).run(now, now);
    repo = createLocalModelAdvancedParamsRepo(db);
  });

  afterEach(() => { db.close(); });

  it('upsert inserts when no row exists', () => {
    const result = repo.upsert('m1', {
      nCtx: 8192,
      nGpuLayers: 35,
      nBatch: 512,
      nThreads: 8,
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      repeatPenalty: 1.1,
      mmap: true,
      mlock: false,
      flashAttention: true,
    });
    expect(result.modelId).toBe('m1');
    expect(result.nCtx).toBe(8192);
    expect(result.flashAttention).toBe(true);
  });

  it('upsert updates an existing row in place (PK is model_id)', () => {
    repo.upsert('m1', { nCtx: 4096, nGpuLayers: 0, nBatch: null, nThreads: null, temperature: null, topP: null, topK: null, repeatPenalty: null, mmap: null, mlock: null, flashAttention: null });
    const updated = repo.upsert('m1', { nCtx: 8192, nGpuLayers: 35, nBatch: null, nThreads: null, temperature: null, topP: null, topK: null, repeatPenalty: null, mmap: null, mlock: null, flashAttention: null });
    expect(updated.nCtx).toBe(8192);
    expect(updated.nGpuLayers).toBe(35);

    const count = db.prepare(`SELECT COUNT(*) AS c FROM local_model_advanced_params WHERE model_id = 'm1'`).get() as { c: number };
    expect(count.c).toBe(1);
  });

  it('getByModelId returns null for unknown model', () => {
    expect(repo.getByModelId('does-not-exist')).toBeNull();
  });

  it('getByModelId returns row when present', () => {
    repo.upsert('m1', { nCtx: 4096, nGpuLayers: null, nBatch: null, nThreads: null, temperature: null, topP: null, topK: null, repeatPenalty: null, mmap: null, mlock: null, flashAttention: null });
    const fetched = repo.getByModelId('m1');
    expect(fetched?.nCtx).toBe(4096);
  });

  it('clear removes the row (caller uses this for Reset-to-Auto)', () => {
    repo.upsert('m1', { nCtx: 4096, nGpuLayers: 35, nBatch: null, nThreads: null, temperature: null, topP: null, topK: null, repeatPenalty: null, mmap: null, mlock: null, flashAttention: null });
    repo.clear('m1');
    expect(repo.getByModelId('m1')).toBeNull();
  });

  it('cascade-deletes when parent local_models row is removed', () => {
    repo.upsert('m1', { nCtx: 4096, nGpuLayers: 35, nBatch: null, nThreads: null, temperature: null, topP: null, topK: null, repeatPenalty: null, mmap: null, mlock: null, flashAttention: null });
    db.prepare(`DELETE FROM local_models WHERE id = 'm1'`).run();
    expect(repo.getByModelId('m1')).toBeNull();
  });

  it('rejects mmap value outside {0, 1, null}', () => {
    expect(() => db.prepare(`INSERT INTO local_model_advanced_params (model_id, mmap, updated_at) VALUES ('m1', 2, ?)`).run(Date.now()))
      .toThrow(/CHECK constraint failed/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

```bash
pnpm -F @team-x/desktop test -- local-model-advanced-params.test.ts
```

Expected: FAIL with `Cannot find module './local-model-advanced-params'`.

- [ ] **Step 3: Create `apps/desktop/src/main/db/repos/local-model-advanced-params.ts`.**

```ts
// apps/desktop/src/main/db/repos/local-model-advanced-params.ts
//
// Repository for the local_model_advanced_params table. The PK is
// model_id, so the row exists at most once per model. NULL values
// in any column mean "fall back to auto-tune."

import type Database from 'better-sqlite3';
import type { AdvancedParams } from '@team-x/shared-types';

export interface UpsertAdvancedParamsInput {
  nCtx: number | null;
  nGpuLayers: number | null;
  nBatch: number | null;
  nThreads: number | null;
  temperature: number | null;
  topP: number | null;
  topK: number | null;
  repeatPenalty: number | null;
  mmap: boolean | null;
  mlock: boolean | null;
  flashAttention: boolean | null;
}

export interface LocalModelAdvancedParamsRepo {
  upsert(modelId: string, params: UpsertAdvancedParamsInput): AdvancedParams;
  getByModelId(modelId: string): AdvancedParams | null;
  clear(modelId: string): void;
}

interface AdvancedParamsRow {
  model_id: string;
  n_ctx: number | null;
  n_gpu_layers: number | null;
  n_batch: number | null;
  n_threads: number | null;
  temperature: number | null;
  top_p: number | null;
  top_k: number | null;
  repeat_penalty: number | null;
  mmap: number | null;
  mlock: number | null;
  flash_attention: number | null;
  updated_at: number;
}

function nullableBool(v: number | null): boolean | null {
  if (v === null) return null;
  return v === 1;
}

function boolToInt(v: boolean | null): number | null {
  if (v === null) return null;
  return v ? 1 : 0;
}

function mapRow(row: AdvancedParamsRow): AdvancedParams {
  return {
    modelId: row.model_id,
    nCtx: row.n_ctx,
    nGpuLayers: row.n_gpu_layers,
    nBatch: row.n_batch,
    nThreads: row.n_threads,
    temperature: row.temperature,
    topP: row.top_p,
    topK: row.top_k,
    repeatPenalty: row.repeat_penalty,
    mmap: nullableBool(row.mmap),
    mlock: nullableBool(row.mlock),
    flashAttention: nullableBool(row.flash_attention),
    updatedAt: row.updated_at,
  };
}

export function createLocalModelAdvancedParamsRepo(
  db: Database.Database,
): LocalModelAdvancedParamsRepo {
  const upsertStmt = db.prepare(`
    INSERT INTO local_model_advanced_params (
      model_id, n_ctx, n_gpu_layers, n_batch, n_threads,
      temperature, top_p, top_k, repeat_penalty,
      mmap, mlock, flash_attention, updated_at
    ) VALUES (
      @model_id, @n_ctx, @n_gpu_layers, @n_batch, @n_threads,
      @temperature, @top_p, @top_k, @repeat_penalty,
      @mmap, @mlock, @flash_attention, @updated_at
    )
    ON CONFLICT(model_id) DO UPDATE SET
      n_ctx = excluded.n_ctx,
      n_gpu_layers = excluded.n_gpu_layers,
      n_batch = excluded.n_batch,
      n_threads = excluded.n_threads,
      temperature = excluded.temperature,
      top_p = excluded.top_p,
      top_k = excluded.top_k,
      repeat_penalty = excluded.repeat_penalty,
      mmap = excluded.mmap,
      mlock = excluded.mlock,
      flash_attention = excluded.flash_attention,
      updated_at = excluded.updated_at
  `);

  const getStmt = db.prepare(`SELECT * FROM local_model_advanced_params WHERE model_id = ?`);
  const clearStmt = db.prepare(`DELETE FROM local_model_advanced_params WHERE model_id = ?`);

  return {
    upsert(modelId, params) {
      const updatedAt = Date.now();
      upsertStmt.run({
        model_id: modelId,
        n_ctx: params.nCtx,
        n_gpu_layers: params.nGpuLayers,
        n_batch: params.nBatch,
        n_threads: params.nThreads,
        temperature: params.temperature,
        top_p: params.topP,
        top_k: params.topK,
        repeat_penalty: params.repeatPenalty,
        mmap: boolToInt(params.mmap),
        mlock: boolToInt(params.mlock),
        flash_attention: boolToInt(params.flashAttention),
        updated_at: updatedAt,
      });
      const row = getStmt.get(modelId) as AdvancedParamsRow;
      return mapRow(row);
    },
    getByModelId(modelId) {
      const row = getStmt.get(modelId) as AdvancedParamsRow | undefined;
      return row ? mapRow(row) : null;
    },
    clear(modelId) {
      clearStmt.run(modelId);
    },
  };
}
```

- [ ] **Step 4: Run the test.**

```bash
pnpm -F @team-x/desktop test -- local-model-advanced-params.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Typecheck.**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 6: Commit.**

```bash
git add apps/desktop/src/main/db/repos/local-model-advanced-params.ts apps/desktop/src/main/db/repos/local-model-advanced-params.test.ts
git commit -m "$(cat <<'EOF'
feat(db): add local_model_advanced_params repo with upsert + clear

createLocalModelAdvancedParamsRepo(db) returns a repo with upsert
(insert-or-update on conflict by model_id PK), getByModelId, and
clear (used for "Reset to Auto" — deletes the row so callers
fall back to auto-tune). Boolean fields (mmap, mlock, flash_attention)
map to nullable INTEGER (0/1/NULL) at the SQL boundary.

Implements spec § 7 local_model_advanced_params operations.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Create `local-model-endpoints` repo

**Files:**
- Create: `apps/desktop/src/main/db/repos/local-model-endpoints.ts`
- Create: `apps/desktop/src/main/db/repos/local-model-endpoints.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `apps/desktop/src/main/db/repos/local-model-endpoints.test.ts`:

```ts
import Database from 'better-sqlite3';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocalModelEndpointsRepo, type LocalModelEndpointsRepo } from './local-model-endpoints';

describe('localModelEndpointsRepo', () => {
  let db: Database.Database;
  let repo: LocalModelEndpointsRepo;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`PRAGMA foreign_keys = ON`);
    const migrationDir = join(__dirname, '..', 'migrations');
    const files = (await readdir(migrationDir)).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) db.exec(await readFile(join(migrationDir, f), 'utf8'));
    repo = createLocalModelEndpointsRepo(db);
  });

  afterEach(() => { db.close(); });

  it('insert + getById round-trips', () => {
    const created = repo.insert({
      name: 'LM Studio on bench',
      baseUrl: 'http://192.168.1.50:1234',
      authHeaderKeyRef: null,
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.name).toBe('LM Studio on bench');
    expect(created.baseUrl).toBe('http://192.168.1.50:1234');
    expect(created.privacyTier).toBe('Local');
    expect(created.status).toBe('unknown');
    const fetched = repo.getById(created.id);
    expect(fetched).toEqual(created);
  });

  it('list returns endpoints ordered by created_at DESC', () => {
    const e1 = repo.insert({ name: 'A', baseUrl: 'http://a', authHeaderKeyRef: null });
    const e2 = repo.insert({ name: 'B', baseUrl: 'http://b', authHeaderKeyRef: null });
    const e3 = repo.insert({ name: 'C', baseUrl: 'http://c', authHeaderKeyRef: null });
    const list = repo.list();
    expect(list.map((e) => e.name)).toEqual(['C', 'B', 'A']);
  });

  it('updateStatus sets status + lastCheckedAt + lastError', () => {
    const e = repo.insert({ name: 'X', baseUrl: 'http://x', authHeaderKeyRef: null });
    const updated = repo.updateStatus(e.id, 'unreachable', 'ECONNREFUSED');
    expect(updated.status).toBe('unreachable');
    expect(updated.lastError).toBe('ECONNREFUSED');
    expect(updated.lastCheckedAt).toBeGreaterThan(0);
  });

  it('updateAuthRef rotates the keytar reference', () => {
    const e = repo.insert({ name: 'X', baseUrl: 'http://x', authHeaderKeyRef: null });
    const u1 = repo.updateAuthRef(e.id, 'team-x.local-gguf.endpoint:X-v1');
    expect(u1.authHeaderKeyRef).toBe('team-x.local-gguf.endpoint:X-v1');
    const u2 = repo.updateAuthRef(e.id, null);
    expect(u2.authHeaderKeyRef).toBeNull();
  });

  it('rename updates the name', () => {
    const e = repo.insert({ name: 'Old', baseUrl: 'http://x', authHeaderKeyRef: null });
    const renamed = repo.rename(e.id, 'New');
    expect(renamed.name).toBe('New');
  });

  it('remove deletes the endpoint', () => {
    const e = repo.insert({ name: 'X', baseUrl: 'http://x', authHeaderKeyRef: null });
    repo.remove(e.id);
    expect(repo.getById(e.id)).toBeNull();
  });

  it('removing an endpoint cascades to its local_models rows', () => {
    const e = repo.insert({ name: 'X', baseUrl: 'http://x', authHeaderKeyRef: null });
    db.prepare(`
      INSERT INTO local_models (
        id, display_name, source_type, source_path, endpoint_id,
        gguf_arch, gguf_params_b, gguf_quant, gguf_context_max, gguf_size_bytes,
        gguf_sha256, gguf_chat_template, is_embedding_model, is_tool_capable,
        hf_repo_id, hf_filename, license, chat_template_override, system_prompt_override,
        status, status_detail, last_used_at, created_at, updated_at
      ) VALUES ('m1', 'M', 'remote-endpoint', NULL, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, NULL, NULL, NULL, NULL, NULL, 'cold', NULL, NULL, ?, ?)
    `).run(e.id, Date.now(), Date.now());
    repo.remove(e.id);
    const count = db.prepare(`SELECT COUNT(*) AS c FROM local_models WHERE id = 'm1'`).get() as { c: number };
    expect(count.c).toBe(0);
  });

  it('rejects non-Local privacy_tier (CHECK constraint)', () => {
    expect(() => db.prepare(`
      INSERT INTO local_model_endpoints (id, name, base_url, privacy_tier, status, created_at, updated_at)
      VALUES ('bad', 'Bad', 'http://x', 'Cloud', 'unknown', 0, 0)
    `).run()).toThrow(/CHECK constraint failed/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

```bash
pnpm -F @team-x/desktop test -- local-model-endpoints.test.ts
```

Expected: FAIL with `Cannot find module './local-model-endpoints'`.

- [ ] **Step 3: Create `apps/desktop/src/main/db/repos/local-model-endpoints.ts`.**

```ts
// apps/desktop/src/main/db/repos/local-model-endpoints.ts
//
// Repository for the local_model_endpoints table. Remote LAN
// endpoints (LM Studio, Ollama, llama-server, KoboldCPP, vLLM).
// privacy_tier is constrained to 'Local' at the SQL level — these
// endpoints are local-network, not cloud.

import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { EndpointStatus, RemoteEndpoint } from '@team-x/shared-types';

export interface InsertEndpointInput {
  name: string;
  baseUrl: string;
  authHeaderKeyRef: string | null;
}

export interface LocalModelEndpointsRepo {
  insert(input: InsertEndpointInput): RemoteEndpoint;
  getById(id: string): RemoteEndpoint | null;
  list(): RemoteEndpoint[];
  updateStatus(id: string, status: EndpointStatus, lastError: string | null): RemoteEndpoint;
  updateAuthRef(id: string, ref: string | null): RemoteEndpoint;
  rename(id: string, name: string): RemoteEndpoint;
  remove(id: string): void;
}

interface EndpointRow {
  id: string;
  name: string;
  base_url: string;
  auth_header_key_ref: string | null;
  privacy_tier: 'Local';
  status: EndpointStatus;
  last_checked_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

function mapRow(row: EndpointRow): RemoteEndpoint {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    authHeaderKeyRef: row.auth_header_key_ref,
    privacyTier: row.privacy_tier,
    status: row.status,
    lastCheckedAt: row.last_checked_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createLocalModelEndpointsRepo(db: Database.Database): LocalModelEndpointsRepo {
  const insertStmt = db.prepare(`
    INSERT INTO local_model_endpoints (
      id, name, base_url, auth_header_key_ref, privacy_tier,
      status, last_checked_at, last_error, created_at, updated_at
    ) VALUES (
      @id, @name, @base_url, @auth_header_key_ref, 'Local',
      'unknown', NULL, NULL, @created_at, @updated_at
    )
  `);

  const getStmt = db.prepare(`SELECT * FROM local_model_endpoints WHERE id = ?`);
  const listStmt = db.prepare(`SELECT * FROM local_model_endpoints ORDER BY created_at DESC`);
  const updateStatusStmt = db.prepare(`
    UPDATE local_model_endpoints
    SET status = ?, last_checked_at = ?, last_error = ?, updated_at = ?
    WHERE id = ?
  `);
  const updateAuthStmt = db.prepare(`
    UPDATE local_model_endpoints SET auth_header_key_ref = ?, updated_at = ? WHERE id = ?
  `);
  const renameStmt = db.prepare(`
    UPDATE local_model_endpoints SET name = ?, updated_at = ? WHERE id = ?
  `);
  const removeStmt = db.prepare(`DELETE FROM local_model_endpoints WHERE id = ?`);

  return {
    insert(input) {
      const id = randomUUID();
      const now = Date.now();
      insertStmt.run({
        id,
        name: input.name,
        base_url: input.baseUrl,
        auth_header_key_ref: input.authHeaderKeyRef,
        created_at: now,
        updated_at: now,
      });
      return mapRow(getStmt.get(id) as EndpointRow);
    },
    getById(id) {
      const row = getStmt.get(id) as EndpointRow | undefined;
      return row ? mapRow(row) : null;
    },
    list() {
      return (listStmt.all() as EndpointRow[]).map(mapRow);
    },
    updateStatus(id, status, lastError) {
      const now = Date.now();
      updateStatusStmt.run(status, now, lastError, now, id);
      return mapRow(getStmt.get(id) as EndpointRow);
    },
    updateAuthRef(id, ref) {
      updateAuthStmt.run(ref, Date.now(), id);
      return mapRow(getStmt.get(id) as EndpointRow);
    },
    rename(id, name) {
      renameStmt.run(name, Date.now(), id);
      return mapRow(getStmt.get(id) as EndpointRow);
    },
    remove(id) {
      removeStmt.run(id);
    },
  };
}
```

- [ ] **Step 4: Run the test.**

```bash
pnpm -F @team-x/desktop test -- local-model-endpoints.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 5: Typecheck.**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 6: Commit.**

```bash
git add apps/desktop/src/main/db/repos/local-model-endpoints.ts apps/desktop/src/main/db/repos/local-model-endpoints.test.ts
git commit -m "$(cat <<'EOF'
feat(db): add local_model_endpoints repo for remote LAN endpoints

createLocalModelEndpointsRepo(db) returns insert / getById / list /
updateStatus / updateAuthRef (keytar reference rotation) / rename /
remove. privacy_tier is enforced at 'Local' by SQL CHECK. Endpoint
removal cascades to local_models rows referencing it (FK is
ON DELETE CASCADE per the migration).

Implements spec § 7 local_model_endpoints operations.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Create `local-model-watch-folders` repo

**Files:**
- Create: `apps/desktop/src/main/db/repos/local-model-watch-folders.ts`
- Create: `apps/desktop/src/main/db/repos/local-model-watch-folders.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `apps/desktop/src/main/db/repos/local-model-watch-folders.test.ts`:

```ts
import Database from 'better-sqlite3';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocalModelWatchFoldersRepo, type LocalModelWatchFoldersRepo } from './local-model-watch-folders';

describe('localModelWatchFoldersRepo', () => {
  let db: Database.Database;
  let repo: LocalModelWatchFoldersRepo;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`PRAGMA foreign_keys = ON`);
    const migrationDir = join(__dirname, '..', 'migrations');
    const files = (await readdir(migrationDir)).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) db.exec(await readFile(join(migrationDir, f), 'utf8'));
    repo = createLocalModelWatchFoldersRepo(db);
  });

  afterEach(() => { db.close(); });

  it('insert + getById round-trips a UNC path', () => {
    const created = repo.insert({ path: '\\\\NAS-01\\models', recursive: true });
    expect(created.path).toBe('\\\\NAS-01\\models');
    expect(created.recursive).toBe(true);
    expect(created.status).toBe('unknown');
    expect(repo.getById(created.id)).toEqual(created);
  });

  it('insert defaults recursive to true if omitted', () => {
    const created = repo.insert({ path: '/Users/rocky/models' });
    expect(created.recursive).toBe(true);
  });

  it('list returns folders ordered by created_at ASC (oldest first)', () => {
    const w1 = repo.insert({ path: '/a' });
    const w2 = repo.insert({ path: '/b' });
    const w3 = repo.insert({ path: '/c' });
    const list = repo.list();
    expect(list.map((w) => w.path)).toEqual(['/a', '/b', '/c']);
  });

  it('updateStatus sets status + lastScanAt + lastScanError + updatedAt', () => {
    const w = repo.insert({ path: '/x' });
    const updated = repo.updateStatus(w.id, 'unreachable', 'EACCES');
    expect(updated.status).toBe('unreachable');
    expect(updated.lastScanError).toBe('EACCES');
    expect(updated.lastScanAt).toBeGreaterThan(0);
  });

  it('updateRecursive flips the recursive flag', () => {
    const w = repo.insert({ path: '/x', recursive: true });
    const updated = repo.updateRecursive(w.id, false);
    expect(updated.recursive).toBe(false);
  });

  it('remove deletes the row', () => {
    const w = repo.insert({ path: '/x' });
    repo.remove(w.id);
    expect(repo.getById(w.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

```bash
pnpm -F @team-x/desktop test -- local-model-watch-folders.test.ts
```

Expected: FAIL with `Cannot find module './local-model-watch-folders'`.

- [ ] **Step 3: Create `apps/desktop/src/main/db/repos/local-model-watch-folders.ts`.**

```ts
// apps/desktop/src/main/db/repos/local-model-watch-folders.ts
//
// Repository for the local_model_watch_folders table. Folder sources
// for GGUF discovery — local paths or UNC/SMB paths.

import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { WatchFolder, WatchFolderStatus } from '@team-x/shared-types';

export interface InsertWatchFolderInput {
  path: string;
  recursive?: boolean;
}

export interface LocalModelWatchFoldersRepo {
  insert(input: InsertWatchFolderInput): WatchFolder;
  getById(id: string): WatchFolder | null;
  list(): WatchFolder[];
  updateStatus(id: string, status: WatchFolderStatus, lastScanError: string | null): WatchFolder;
  updateRecursive(id: string, recursive: boolean): WatchFolder;
  remove(id: string): void;
}

interface WatchFolderRow {
  id: string;
  path: string;
  recursive: number;
  status: WatchFolderStatus;
  last_scan_at: number | null;
  last_scan_error: string | null;
  created_at: number;
  updated_at: number;
}

function mapRow(row: WatchFolderRow): WatchFolder {
  return {
    id: row.id,
    path: row.path,
    recursive: row.recursive === 1,
    status: row.status,
    lastScanAt: row.last_scan_at,
    lastScanError: row.last_scan_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createLocalModelWatchFoldersRepo(db: Database.Database): LocalModelWatchFoldersRepo {
  const insertStmt = db.prepare(`
    INSERT INTO local_model_watch_folders (
      id, path, recursive, status, last_scan_at, last_scan_error, created_at, updated_at
    ) VALUES (
      @id, @path, @recursive, 'unknown', NULL, NULL, @created_at, @updated_at
    )
  `);
  const getStmt = db.prepare(`SELECT * FROM local_model_watch_folders WHERE id = ?`);
  const listStmt = db.prepare(`SELECT * FROM local_model_watch_folders ORDER BY created_at ASC`);
  const updateStatusStmt = db.prepare(`
    UPDATE local_model_watch_folders
    SET status = ?, last_scan_at = ?, last_scan_error = ?, updated_at = ?
    WHERE id = ?
  `);
  const updateRecursiveStmt = db.prepare(`
    UPDATE local_model_watch_folders SET recursive = ?, updated_at = ? WHERE id = ?
  `);
  const removeStmt = db.prepare(`DELETE FROM local_model_watch_folders WHERE id = ?`);

  return {
    insert(input) {
      const id = randomUUID();
      const now = Date.now();
      const recursive = input.recursive === undefined ? true : input.recursive;
      insertStmt.run({
        id,
        path: input.path,
        recursive: recursive ? 1 : 0,
        created_at: now,
        updated_at: now,
      });
      return mapRow(getStmt.get(id) as WatchFolderRow);
    },
    getById(id) {
      const row = getStmt.get(id) as WatchFolderRow | undefined;
      return row ? mapRow(row) : null;
    },
    list() {
      return (listStmt.all() as WatchFolderRow[]).map(mapRow);
    },
    updateStatus(id, status, lastScanError) {
      const now = Date.now();
      updateStatusStmt.run(status, now, lastScanError, now, id);
      return mapRow(getStmt.get(id) as WatchFolderRow);
    },
    updateRecursive(id, recursive) {
      updateRecursiveStmt.run(recursive ? 1 : 0, Date.now(), id);
      return mapRow(getStmt.get(id) as WatchFolderRow);
    },
    remove(id) {
      removeStmt.run(id);
    },
  };
}
```

- [ ] **Step 4: Run the test.**

```bash
pnpm -F @team-x/desktop test -- local-model-watch-folders.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Typecheck.**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 6: Commit.**

```bash
git add apps/desktop/src/main/db/repos/local-model-watch-folders.ts apps/desktop/src/main/db/repos/local-model-watch-folders.test.ts
git commit -m "$(cat <<'EOF'
feat(db): add local_model_watch_folders repo

createLocalModelWatchFoldersRepo(db) returns insert (recursive
defaults to true), getById, list (oldest first — stable ordering for
UI), updateStatus, updateRecursive, remove. Paths are stored verbatim
including UNC (\\\\NAS\\share) and mapped-drive paths.

Implements spec § 7 local_model_watch_folders operations.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Register the new repos in the db client

**Files:**
- Modify: `apps/desktop/src/main/db/client.ts`

- [ ] **Step 1: Read the existing client.ts pattern.**

```bash
cat apps/desktop/src/main/db/client.ts
```

Identify the pattern for adding repos to the exported db client.

- [ ] **Step 2: Modify `client.ts` to wire in the 4 new repos.**

Add imports at the top:

```ts
import { createLocalModelsRepo, type LocalModelsRepo } from './repos/local-models';
import { createLocalModelAdvancedParamsRepo, type LocalModelAdvancedParamsRepo } from './repos/local-model-advanced-params';
import { createLocalModelEndpointsRepo, type LocalModelEndpointsRepo } from './repos/local-model-endpoints';
import { createLocalModelWatchFoldersRepo, type LocalModelWatchFoldersRepo } from './repos/local-model-watch-folders';
```

Extend the client interface and the factory to include the new repos (exact insertion point depends on existing structure — find where existing repos are added and extend in the same place). Example shape:

```ts
export interface DbClient {
  // ... existing repos ...
  localModels: LocalModelsRepo;
  localModelAdvancedParams: LocalModelAdvancedParamsRepo;
  localModelEndpoints: LocalModelEndpointsRepo;
  localModelWatchFolders: LocalModelWatchFoldersRepo;
}

export function createDbClient(db: Database.Database): DbClient {
  return {
    // ... existing repo factories ...
    localModels: createLocalModelsRepo(db),
    localModelAdvancedParams: createLocalModelAdvancedParamsRepo(db),
    localModelEndpoints: createLocalModelEndpointsRepo(db),
    localModelWatchFolders: createLocalModelWatchFoldersRepo(db),
  };
}
```

If the existing pattern uses a different shape (e.g. lazy properties, dependency-injected sub-clients), match that pattern instead.

- [ ] **Step 3: Run typecheck.**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 4: Run any existing client tests + the new repo tests together.**

```bash
pnpm -F @team-x/desktop test -- client.test.ts
pnpm -F @team-x/desktop test -- local-model
```

Expected: all green.

- [ ] **Step 5: Commit.**

```bash
git add apps/desktop/src/main/db/client.ts
git commit -m "$(cat <<'EOF'
feat(db): register 4 new local-gguf repos in DbClient

Wires localModels, localModelAdvancedParams, localModelEndpoints,
and localModelWatchFolders into the DbClient surface so main-process
services can access them through the existing dependency-injection
seam.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Add runtime-settings accessor for the `localGguf.*` namespace

**Files:**
- Create: `apps/desktop/src/main/services/runtime-settings/local-gguf-settings.ts`
- Create: `apps/desktop/src/main/services/runtime-settings/local-gguf-settings.test.ts`

This wraps the existing app settings store with a typed accessor for `LocalGgufRuntimeSettings`. The actual settings persistence is unchanged — same key-value store the rest of Team-X uses.

- [ ] **Step 1: Read the existing settings-store pattern.**

```bash
ls apps/desktop/src/main/services/runtime-settings/ 2>/dev/null || \
  find apps/desktop/src -name "runtime-*settings*" -o -name "*-settings.ts" | head -20
```

Identify how other features (e.g. runtime-strategy, copilot weights) read and write structured settings. Note the store API (likely something like `settingsStore.get(key)` / `set(key, value)` with JSON serialization).

- [ ] **Step 2: Write the failing test.**

Create `apps/desktop/src/main/services/runtime-settings/local-gguf-settings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  createLocalGgufSettingsAccessor,
  DEFAULT_LOCAL_GGUF_SETTINGS,
  type LocalGgufSettingsAccessor,
  type LocalGgufSettingsStore,
} from './local-gguf-settings';

function inMemoryStore(): LocalGgufSettingsStore {
  const m = new Map<string, unknown>();
  return {
    get<T>(key: string): T | undefined {
      return m.get(key) as T | undefined;
    },
    set<T>(key: string, value: T): void {
      m.set(key, value);
    },
  };
}

describe('localGgufSettingsAccessor', () => {
  let store: LocalGgufSettingsStore;
  let accessor: LocalGgufSettingsAccessor;

  beforeEach(() => {
    store = inMemoryStore();
    accessor = createLocalGgufSettingsAccessor(store);
  });

  it('returns defaults when store is empty', () => {
    const s = accessor.get();
    expect(s).toEqual(DEFAULT_LOCAL_GGUF_SETTINGS);
  });

  it('returns persisted values overlaid on defaults', () => {
    store.set('localGguf.activeBackend', 'cuda');
    store.set('localGguf.maxConcurrentLocalModels', 3);
    const s = accessor.get();
    expect(s.activeBackend).toBe('cuda');
    expect(s.maxConcurrentLocalModels).toBe(3);
    expect(s.activeBackendIsAutoDetected).toBe(DEFAULT_LOCAL_GGUF_SETTINGS.activeBackendIsAutoDetected);
  });

  it('updateBackend persists activeBackend + autoDetected flag + clears fallback reason', () => {
    accessor.updateBackend('cuda', /*autoDetected*/ true);
    const s = accessor.get();
    expect(s.activeBackend).toBe('cuda');
    expect(s.activeBackendIsAutoDetected).toBe(true);
    expect(s.autoFallbackReason).toBeNull();
  });

  it('recordFallback stores reason and flips activeBackendIsAutoDetected to false', () => {
    accessor.updateBackend('cuda', true);
    accessor.recordFallback('vulkan', 'CUDA initialization failed');
    const s = accessor.get();
    expect(s.activeBackend).toBe('vulkan');
    expect(s.activeBackendIsAutoDetected).toBe(false);
    expect(s.autoFallbackReason).toBe('CUDA initialization failed');
  });

  it('setMaxConcurrent rejects values < 1', () => {
    expect(() => accessor.setMaxConcurrent(0)).toThrow(/at least 1/i);
    expect(() => accessor.setMaxConcurrent(-1)).toThrow(/at least 1/i);
  });

  it('setMaxConcurrent persists valid values', () => {
    accessor.setMaxConcurrent(4);
    expect(accessor.get().maxConcurrentLocalModels).toBe(4);
  });

  it('setDefaultLibraryFolder persists', () => {
    accessor.setDefaultLibraryFolder('/Users/rocky/models');
    expect(accessor.get().defaultLibraryFolder).toBe('/Users/rocky/models');
    accessor.setDefaultLibraryFolder(null);
    expect(accessor.get().defaultLibraryFolder).toBeNull();
  });

  it('setEmbeddingModelId persists', () => {
    accessor.setEmbeddingModelId('mod-uuid');
    expect(accessor.get().embeddingModelId).toBe('mod-uuid');
  });

  it('setHfTokenKeyRef persists', () => {
    accessor.setHfTokenKeyRef('team-x.local-gguf.hf-token');
    expect(accessor.get().hfTokenKeyRef).toBe('team-x.local-gguf.hf-token');
  });

  it('setLlamaBinariesVersion persists', () => {
    accessor.setLlamaBinariesVersion('b4321');
    expect(accessor.get().llamaBinariesVersion).toBe('b4321');
  });
});

import { beforeEach } from 'vitest';
```

- [ ] **Step 3: Run the test to verify it fails.**

```bash
pnpm -F @team-x/desktop test -- local-gguf-settings.test.ts
```

Expected: FAIL with `Cannot find module './local-gguf-settings'`.

- [ ] **Step 4: Create `apps/desktop/src/main/services/runtime-settings/local-gguf-settings.ts`.**

```ts
// apps/desktop/src/main/services/runtime-settings/local-gguf-settings.ts
//
// Typed accessor for the localGguf.* settings namespace, layered on
// top of the existing app key-value settings store. Values are
// persisted under keys: localGguf.activeBackend,
// localGguf.activeBackendIsAutoDetected, etc.

import type { GpuBackend, LocalGgufRuntimeSettings } from '@team-x/shared-types';

export interface LocalGgufSettingsStore {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
}

export interface LocalGgufSettingsAccessor {
  get(): LocalGgufRuntimeSettings;
  updateBackend(backend: GpuBackend, autoDetected: boolean): void;
  recordFallback(backend: GpuBackend, reason: string): void;
  setMaxConcurrent(n: number): void;
  setDefaultLibraryFolder(path: string | null): void;
  setEmbeddingModelId(id: string | null): void;
  setHfTokenKeyRef(ref: string | null): void;
  setLlamaBinariesVersion(version: string): void;
}

export const DEFAULT_LOCAL_GGUF_SETTINGS: LocalGgufRuntimeSettings = {
  activeBackend: 'cpu',
  activeBackendIsAutoDetected: true,
  autoFallbackReason: null,
  maxConcurrentLocalModels: 1,
  defaultLibraryFolder: null,
  embeddingModelId: null,
  hfTokenKeyRef: null,
  llamaBinariesVersion: 'unknown',
};

const KEYS = {
  activeBackend: 'localGguf.activeBackend',
  activeBackendIsAutoDetected: 'localGguf.activeBackendIsAutoDetected',
  autoFallbackReason: 'localGguf.autoFallbackReason',
  maxConcurrentLocalModels: 'localGguf.maxConcurrentLocalModels',
  defaultLibraryFolder: 'localGguf.defaultLibraryFolder',
  embeddingModelId: 'localGguf.embeddingModelId',
  hfTokenKeyRef: 'localGguf.hfTokenKeyRef',
  llamaBinariesVersion: 'localGguf.llamaBinariesVersion',
} as const;

export function createLocalGgufSettingsAccessor(
  store: LocalGgufSettingsStore,
): LocalGgufSettingsAccessor {
  return {
    get() {
      return {
        activeBackend:
          store.get<GpuBackend>(KEYS.activeBackend) ?? DEFAULT_LOCAL_GGUF_SETTINGS.activeBackend,
        activeBackendIsAutoDetected:
          store.get<boolean>(KEYS.activeBackendIsAutoDetected) ?? DEFAULT_LOCAL_GGUF_SETTINGS.activeBackendIsAutoDetected,
        autoFallbackReason:
          store.get<string | null>(KEYS.autoFallbackReason) ?? DEFAULT_LOCAL_GGUF_SETTINGS.autoFallbackReason,
        maxConcurrentLocalModels:
          store.get<number>(KEYS.maxConcurrentLocalModels) ?? DEFAULT_LOCAL_GGUF_SETTINGS.maxConcurrentLocalModels,
        defaultLibraryFolder:
          store.get<string | null>(KEYS.defaultLibraryFolder) ?? DEFAULT_LOCAL_GGUF_SETTINGS.defaultLibraryFolder,
        embeddingModelId:
          store.get<string | null>(KEYS.embeddingModelId) ?? DEFAULT_LOCAL_GGUF_SETTINGS.embeddingModelId,
        hfTokenKeyRef:
          store.get<string | null>(KEYS.hfTokenKeyRef) ?? DEFAULT_LOCAL_GGUF_SETTINGS.hfTokenKeyRef,
        llamaBinariesVersion:
          store.get<string>(KEYS.llamaBinariesVersion) ?? DEFAULT_LOCAL_GGUF_SETTINGS.llamaBinariesVersion,
      };
    },
    updateBackend(backend, autoDetected) {
      store.set(KEYS.activeBackend, backend);
      store.set(KEYS.activeBackendIsAutoDetected, autoDetected);
      store.set(KEYS.autoFallbackReason, null);
    },
    recordFallback(backend, reason) {
      store.set(KEYS.activeBackend, backend);
      store.set(KEYS.activeBackendIsAutoDetected, false);
      store.set(KEYS.autoFallbackReason, reason);
    },
    setMaxConcurrent(n) {
      if (n < 1) throw new Error('maxConcurrentLocalModels must be at least 1');
      store.set(KEYS.maxConcurrentLocalModels, Math.floor(n));
    },
    setDefaultLibraryFolder(path) {
      store.set(KEYS.defaultLibraryFolder, path);
    },
    setEmbeddingModelId(id) {
      store.set(KEYS.embeddingModelId, id);
    },
    setHfTokenKeyRef(ref) {
      store.set(KEYS.hfTokenKeyRef, ref);
    },
    setLlamaBinariesVersion(version) {
      store.set(KEYS.llamaBinariesVersion, version);
    },
  };
}
```

- [ ] **Step 5: Run the test.**

```bash
pnpm -F @team-x/desktop test -- local-gguf-settings.test.ts
```

Expected: 10 tests pass.

- [ ] **Step 6: Commit.**

```bash
git add apps/desktop/src/main/services/runtime-settings/local-gguf-settings.ts apps/desktop/src/main/services/runtime-settings/local-gguf-settings.test.ts
git commit -m "$(cat <<'EOF'
feat(settings): add typed accessor for localGguf.* runtime settings

createLocalGgufSettingsAccessor wraps the app key-value store with a
typed surface for the eight LocalGgufRuntimeSettings fields:
activeBackend, activeBackendIsAutoDetected, autoFallbackReason,
maxConcurrentLocalModels, defaultLibraryFolder, embeddingModelId,
hfTokenKeyRef, llamaBinariesVersion. Defaults defined in
DEFAULT_LOCAL_GGUF_SETTINGS and overlay any persisted values from
the store. updateBackend clears the fallback reason; recordFallback
captures the reason and flips autoDetected to false.

Implements spec § 7 (runtime-settings) + supports later phases'
backend detection persistence.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Create IPC handler stubs (typed, throw-not-implemented)

Phase 1 introduces every IPC channel in the `localGguf.*` namespace at the contract level. Each handler is a TYPED stub that throws a `LocalGgufError`-shaped error indicating it's not implemented yet. Subsequent phases replace each stub with the real implementation.

**Files:**
- Create: `apps/desktop/src/main/ipc/local-gguf-library-handlers.ts`
- Create: `apps/desktop/src/main/ipc/local-gguf-library-handlers.test.ts`
- Create: `apps/desktop/src/main/ipc/local-gguf-runtime-handlers.ts`
- Create: `apps/desktop/src/main/ipc/local-gguf-runtime-handlers.test.ts`
- Create: `apps/desktop/src/main/ipc/local-gguf-hf-handlers.ts`
- Create: `apps/desktop/src/main/ipc/local-gguf-hf-handlers.test.ts`
- Create: `apps/desktop/src/main/ipc/local-gguf-benchmark-handlers.ts`
- Create: `apps/desktop/src/main/ipc/local-gguf-benchmark-handlers.test.ts`
- Create: `apps/desktop/src/main/ipc/local-gguf-endpoint-handlers.ts`
- Create: `apps/desktop/src/main/ipc/local-gguf-endpoint-handlers.test.ts`

Because there are 5 handler modules with similar shape, this task batches them. **Do them one at a time, TDD each. Commit after each pair.**

- [ ] **Step 1: Read an existing IPC handler module to match the pattern.**

```bash
cat apps/desktop/src/main/ipc/rag-handlers.ts | head -80
```

Note: how handlers are registered with `ipcMain.handle()` or a typed registration helper, how the test mocks IPC, return shape, error shape.

- [ ] **Step 2: Create the library handlers module.**

Create `apps/desktop/src/main/ipc/local-gguf-library-handlers.ts`:

```ts
// apps/desktop/src/main/ipc/local-gguf-library-handlers.ts
//
// IPC handlers for the localGguf.library.* channels.
// Phase 1: all handlers are typed stubs that throw NotImplementedError.
// Phase 3 (library + scanning) replaces these stubs with real
// implementations against the LibraryService.

import type { IpcMain } from 'electron';
import type {
  LocalModel,
  AdvancedParams,
  WatchFolder,
  SourceType,
} from '@team-x/shared-types';

export interface LocalGgufLibraryHandlerDeps {
  // Filled in Phase 3 with the LibraryService dependency. For Phase 1
  // the stubs ignore all dependencies and throw.
}

const NOT_IMPLEMENTED = (channel: string) =>
  Object.freeze({
    kind: 'gpu-probe-failed' as const, // generic typed error until Phase 2 introduces 'not-implemented' kind
    reason: `IPC channel ${channel} is not implemented yet (Phase 1 stub)`,
  });

export function registerLocalGgufLibraryHandlers(
  ipc: IpcMain,
  _deps: LocalGgufLibraryHandlerDeps,
): void {
  ipc.handle('localGguf.library.list', async (): Promise<LocalModel[]> => {
    throw NOT_IMPLEMENTED('localGguf.library.list');
  });
  ipc.handle('localGguf.library.get', async (_e, _id: string): Promise<LocalModel | null> => {
    throw NOT_IMPLEMENTED('localGguf.library.get');
  });
  ipc.handle('localGguf.library.addFile', async (_e, _path: string): Promise<LocalModel> => {
    throw NOT_IMPLEMENTED('localGguf.library.addFile');
  });
  ipc.handle(
    'localGguf.library.addFolder',
    async (_e, _path: string, _recursive: boolean): Promise<WatchFolder> => {
      throw NOT_IMPLEMENTED('localGguf.library.addFolder');
    },
  );
  ipc.handle('localGguf.library.removeModel', async (_e, _id: string): Promise<void> => {
    throw NOT_IMPLEMENTED('localGguf.library.removeModel');
  });
  ipc.handle('localGguf.library.removeFolder', async (_e, _id: string): Promise<void> => {
    throw NOT_IMPLEMENTED('localGguf.library.removeFolder');
  });
  ipc.handle(
    'localGguf.library.scanFolder',
    async (_e, _id: string): Promise<{ addedCount: number; removedCount: number }> => {
      throw NOT_IMPLEMENTED('localGguf.library.scanFolder');
    },
  );
  ipc.handle(
    'localGguf.library.setSystemPrompt',
    async (_e, _id: string, _prompt: string | null): Promise<LocalModel> => {
      throw NOT_IMPLEMENTED('localGguf.library.setSystemPrompt');
    },
  );
  ipc.handle(
    'localGguf.library.setChatTemplate',
    async (_e, _id: string, _template: string | null): Promise<LocalModel> => {
      throw NOT_IMPLEMENTED('localGguf.library.setChatTemplate');
    },
  );
  ipc.handle(
    'localGguf.library.setAdvancedParams',
    async (_e, _id: string, _params: Partial<AdvancedParams>): Promise<AdvancedParams> => {
      throw NOT_IMPLEMENTED('localGguf.library.setAdvancedParams');
    },
  );
  ipc.handle(
    'localGguf.library.resetAdvanced',
    async (_e, _id: string): Promise<AdvancedParams> => {
      throw NOT_IMPLEMENTED('localGguf.library.resetAdvanced');
    },
  );
  ipc.handle(
    'localGguf.library.listBySourceType',
    async (_e, _t: SourceType): Promise<LocalModel[]> => {
      throw NOT_IMPLEMENTED('localGguf.library.listBySourceType');
    },
  );
}
```

- [ ] **Step 3: Write the test for the library handlers.**

Create `apps/desktop/src/main/ipc/local-gguf-library-handlers.test.ts`:

```ts
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { registerLocalGgufLibraryHandlers } from './local-gguf-library-handlers';

interface FakeIpcMain extends EventEmitter {
  handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => void;
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  registered: Map<string, (event: unknown, ...args: unknown[]) => unknown>;
}

function makeFakeIpcMain(): FakeIpcMain {
  const m = new EventEmitter() as FakeIpcMain;
  m.registered = new Map();
  m.handle = (channel, fn) => { m.registered.set(channel, fn); };
  m.invoke = async (channel, ...args) => {
    const fn = m.registered.get(channel);
    if (!fn) throw new Error(`No handler for ${channel}`);
    return fn({}, ...args);
  };
  return m;
}

describe('localGguf library IPC handlers (Phase 1 stubs)', () => {
  it('registers every library channel', () => {
    const ipc = makeFakeIpcMain();
    registerLocalGgufLibraryHandlers(ipc as never, {});
    expect(Array.from(ipc.registered.keys()).sort()).toEqual([
      'localGguf.library.addFile',
      'localGguf.library.addFolder',
      'localGguf.library.get',
      'localGguf.library.list',
      'localGguf.library.listBySourceType',
      'localGguf.library.removeFolder',
      'localGguf.library.removeModel',
      'localGguf.library.resetAdvanced',
      'localGguf.library.scanFolder',
      'localGguf.library.setAdvancedParams',
      'localGguf.library.setChatTemplate',
      'localGguf.library.setSystemPrompt',
    ]);
  });

  it.each([
    'localGguf.library.list',
    'localGguf.library.get',
    'localGguf.library.addFile',
    'localGguf.library.addFolder',
    'localGguf.library.removeModel',
    'localGguf.library.removeFolder',
    'localGguf.library.scanFolder',
    'localGguf.library.setSystemPrompt',
    'localGguf.library.setChatTemplate',
    'localGguf.library.setAdvancedParams',
    'localGguf.library.resetAdvanced',
    'localGguf.library.listBySourceType',
  ])('handler %s throws a not-implemented error', async (channel) => {
    const ipc = makeFakeIpcMain();
    registerLocalGgufLibraryHandlers(ipc as never, {});
    await expect(ipc.invoke(channel)).rejects.toMatchObject({
      kind: 'gpu-probe-failed',
      reason: expect.stringContaining('not implemented'),
    });
  });
});
```

- [ ] **Step 4: Run the test.**

```bash
pnpm -F @team-x/desktop test -- local-gguf-library-handlers.test.ts
```

Expected: 13 assertions pass (1 for registration + 12 for each channel throwing).

- [ ] **Step 5: Commit.**

```bash
git add apps/desktop/src/main/ipc/local-gguf-library-handlers.ts apps/desktop/src/main/ipc/local-gguf-library-handlers.test.ts
git commit -m "$(cat <<'EOF'
feat(ipc): add local-gguf library IPC handler stubs (Phase 1)

Registers all 12 localGguf.library.* channels with typed signatures.
Every handler throws a typed not-implemented error so callers fail
fast and visibly. Phase 3 (library + scanning) replaces these stubs
with real implementations against the LibraryService.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Repeat for runtime, hf, benchmark, and endpoint handler modules.**

Apply the same pattern (write stub module → write test → run → commit) for:

**`local-gguf-runtime-handlers.ts`** channels:
- `localGguf.runtime.gpuInventory` → `GpuInventory`
- `localGguf.runtime.reprobeGpu` → `GpuInventory`
- `localGguf.runtime.settings` → `LocalGgufRuntimeSettings`
- `localGguf.runtime.setSettings` → `LocalGgufRuntimeSettings` (takes `Partial<LocalGgufRuntimeSettings>`)
- `localGguf.runtime.binariesVersion` → `string`
- `localGguf.pool.status` → `{ loaded: { modelId: string; baseUrl: string; pid: number }[]; maxConcurrent: number }`
- `localGguf.pool.load` → `{ modelId: string; baseUrl: string; pid: number }` (takes `id: string`)
- `localGguf.pool.unload` → `void` (takes `id: string`)
- `localGguf.pool.setMaxConcurrent` → `void` (takes `n: number`)

**`local-gguf-hf-handlers.ts`** channels:
- `localGguf.hf.search` → `HfSearchResult[]` (define this type inline in the stub module — interface `HfSearchResult { repoId: string; downloads: number; likes: number; description: string; tags: string[] }`)
- `localGguf.hf.modelCard` → `HfModelCard`
- `localGguf.hf.startDownload` → `{ handleId: string }`
- `localGguf.hf.pauseDownload` → `void`
- `localGguf.hf.resumeDownload` → `void`
- `localGguf.hf.cancelDownload` → `void`
- `localGguf.hf.activeDownloads` → `DownloadProgress[]`

For the inline types (`HfSearchResult`, `HfModelCard`, `DownloadProgress`), Phase 7 will move them into `@team-x/shared-types` and replace the inline definitions. Stub them here as a minimum-viable type:

```ts
export interface HfSearchResult {
  repoId: string;
  downloads: number;
  likes: number;
  description: string;
  tags: string[];
}
export interface HfModelCard {
  repoId: string;
  description: string;
  license: string | null;
  siblings: Array<{ rfilename: string; sizeBytes: number | null }>;
}
export interface DownloadProgress {
  handleId: string;
  repoId: string;
  filename: string;
  bytesReceived: number;
  bytesTotal: number;
  state: 'pending' | 'downloading' | 'paused' | 'completed' | 'cancelled' | 'failed';
  errorMessage: string | null;
}
```

**`local-gguf-benchmark-handlers.ts`** channels:
- `localGguf.benchmark.run` → `BenchmarkResult` (takes `modelId: string`)
- `localGguf.benchmark.history` → `BenchmarkResult[]` (takes `modelId: string`)

**`local-gguf-endpoint-handlers.ts`** channels:
- `localGguf.endpoint.list` → `RemoteEndpoint[]`
- `localGguf.endpoint.add` → `RemoteEndpoint` (takes `{ name: string; baseUrl: string; authHeaderKeyRef: string | null }`)
- `localGguf.endpoint.remove` → `void` (takes `id: string`)
- `localGguf.endpoint.test` → `{ reachable: boolean; latencyMs?: number; error?: LocalGgufError }` (takes `id: string`)
- `localGguf.endpoint.update` → `RemoteEndpoint` (takes `id: string` + `partial: { name?: string; baseUrl?: string; authHeaderKeyRef?: string | null }`)

Each module follows the same structure as the library module above. Each test asserts:
1. All declared channels are registered.
2. Every channel throws when invoked.

Commit each module with a separate, descriptive commit:

```bash
# Example for runtime handlers (repeat pattern for the others):
git add apps/desktop/src/main/ipc/local-gguf-runtime-handlers.ts apps/desktop/src/main/ipc/local-gguf-runtime-handlers.test.ts
git commit -m "$(cat <<'EOF'
feat(ipc): add local-gguf runtime + pool IPC handler stubs (Phase 1)

Registers all 9 localGguf.runtime.* and localGguf.pool.* channels.
Every handler throws a typed not-implemented error. Phase 2 (runtime
+ pool) replaces these stubs with real implementations against the
RuntimeService and PoolService.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: After all five modules + tests are in, run the IPC suite.**

```bash
pnpm -F @team-x/desktop test -- local-gguf-.*-handlers.test.ts
```

Expected: every channel asserts registration + throws-on-invoke.

- [ ] **Step 8: Typecheck.**

```bash
pnpm typecheck
```

Expected: zero errors.

---

### Task 14: Create the preload bridge module

**Files:**
- Create: `apps/desktop/src/preload/local-gguf-api.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/src/types/window.d.ts`

The preload module exposes a typed `localGguf` surface on `window.teamXApi` so renderer code can call into the main process through a single typed object.

- [ ] **Step 1: Read existing preload bridge pattern.**

```bash
cat apps/desktop/src/preload/index.ts | head -80
cat apps/desktop/src/renderer/src/types/window.d.ts | head -80
```

Identify how the existing `teamXApi` object is constructed, how it's exposed via `contextBridge.exposeInMainWorld`, and how its types are declared in `window.d.ts`.

- [ ] **Step 2: Create `apps/desktop/src/preload/local-gguf-api.ts`.**

```ts
// apps/desktop/src/preload/local-gguf-api.ts
//
// Typed preload bridge for the localGguf.* IPC namespace.
// Renderer accesses this as `window.teamXApi.localGguf.<area>.<method>(...)`.

import { ipcRenderer } from 'electron';
import type {
  AdvancedParams,
  BenchmarkResult,
  GpuInventory,
  LocalGgufError,
  LocalGgufRuntimeSettings,
  LocalModel,
  RemoteEndpoint,
  SourceType,
  WatchFolder,
} from '@team-x/shared-types';

// Inline types matching the IPC stubs (will move to shared-types in Phase 7).
export interface HfSearchResult {
  repoId: string;
  downloads: number;
  likes: number;
  description: string;
  tags: string[];
}
export interface HfModelCard {
  repoId: string;
  description: string;
  license: string | null;
  siblings: Array<{ rfilename: string; sizeBytes: number | null }>;
}
export interface DownloadProgress {
  handleId: string;
  repoId: string;
  filename: string;
  bytesReceived: number;
  bytesTotal: number;
  state: 'pending' | 'downloading' | 'paused' | 'completed' | 'cancelled' | 'failed';
  errorMessage: string | null;
}

export interface LocalGgufApi {
  library: {
    list: () => Promise<LocalModel[]>;
    get: (id: string) => Promise<LocalModel | null>;
    addFile: (path: string) => Promise<LocalModel>;
    addFolder: (path: string, recursive: boolean) => Promise<WatchFolder>;
    removeModel: (id: string) => Promise<void>;
    removeFolder: (id: string) => Promise<void>;
    scanFolder: (id: string) => Promise<{ addedCount: number; removedCount: number }>;
    setSystemPrompt: (id: string, prompt: string | null) => Promise<LocalModel>;
    setChatTemplate: (id: string, template: string | null) => Promise<LocalModel>;
    setAdvancedParams: (id: string, params: Partial<AdvancedParams>) => Promise<AdvancedParams>;
    resetAdvanced: (id: string) => Promise<AdvancedParams>;
    listBySourceType: (sourceType: SourceType) => Promise<LocalModel[]>;
  };
  runtime: {
    gpuInventory: () => Promise<GpuInventory>;
    reprobeGpu: () => Promise<GpuInventory>;
    settings: () => Promise<LocalGgufRuntimeSettings>;
    setSettings: (partial: Partial<LocalGgufRuntimeSettings>) => Promise<LocalGgufRuntimeSettings>;
    binariesVersion: () => Promise<string>;
  };
  pool: {
    status: () => Promise<{
      loaded: Array<{ modelId: string; baseUrl: string; pid: number }>;
      maxConcurrent: number;
    }>;
    load: (id: string) => Promise<{ modelId: string; baseUrl: string; pid: number }>;
    unload: (id: string) => Promise<void>;
    setMaxConcurrent: (n: number) => Promise<void>;
  };
  endpoint: {
    list: () => Promise<RemoteEndpoint[]>;
    add: (config: {
      name: string;
      baseUrl: string;
      authHeaderKeyRef: string | null;
    }) => Promise<RemoteEndpoint>;
    remove: (id: string) => Promise<void>;
    test: (id: string) => Promise<{
      reachable: boolean;
      latencyMs?: number;
      error?: LocalGgufError;
    }>;
    update: (
      id: string,
      partial: { name?: string; baseUrl?: string; authHeaderKeyRef?: string | null },
    ) => Promise<RemoteEndpoint>;
  };
  hf: {
    search: (query: string, filters: Record<string, unknown>) => Promise<HfSearchResult[]>;
    modelCard: (repoId: string) => Promise<HfModelCard>;
    startDownload: (
      repoId: string,
      filename: string,
      targetFolder: string,
    ) => Promise<{ handleId: string }>;
    pauseDownload: (handleId: string) => Promise<void>;
    resumeDownload: (handleId: string) => Promise<void>;
    cancelDownload: (handleId: string) => Promise<void>;
    activeDownloads: () => Promise<DownloadProgress[]>;
  };
  benchmark: {
    run: (modelId: string) => Promise<BenchmarkResult>;
    history: (modelId: string) => Promise<BenchmarkResult[]>;
  };
}

export const localGgufApi: LocalGgufApi = {
  library: {
    list: () => ipcRenderer.invoke('localGguf.library.list'),
    get: (id) => ipcRenderer.invoke('localGguf.library.get', id),
    addFile: (path) => ipcRenderer.invoke('localGguf.library.addFile', path),
    addFolder: (path, recursive) =>
      ipcRenderer.invoke('localGguf.library.addFolder', path, recursive),
    removeModel: (id) => ipcRenderer.invoke('localGguf.library.removeModel', id),
    removeFolder: (id) => ipcRenderer.invoke('localGguf.library.removeFolder', id),
    scanFolder: (id) => ipcRenderer.invoke('localGguf.library.scanFolder', id),
    setSystemPrompt: (id, prompt) =>
      ipcRenderer.invoke('localGguf.library.setSystemPrompt', id, prompt),
    setChatTemplate: (id, template) =>
      ipcRenderer.invoke('localGguf.library.setChatTemplate', id, template),
    setAdvancedParams: (id, params) =>
      ipcRenderer.invoke('localGguf.library.setAdvancedParams', id, params),
    resetAdvanced: (id) => ipcRenderer.invoke('localGguf.library.resetAdvanced', id),
    listBySourceType: (sourceType) =>
      ipcRenderer.invoke('localGguf.library.listBySourceType', sourceType),
  },
  runtime: {
    gpuInventory: () => ipcRenderer.invoke('localGguf.runtime.gpuInventory'),
    reprobeGpu: () => ipcRenderer.invoke('localGguf.runtime.reprobeGpu'),
    settings: () => ipcRenderer.invoke('localGguf.runtime.settings'),
    setSettings: (partial) => ipcRenderer.invoke('localGguf.runtime.setSettings', partial),
    binariesVersion: () => ipcRenderer.invoke('localGguf.runtime.binariesVersion'),
  },
  pool: {
    status: () => ipcRenderer.invoke('localGguf.pool.status'),
    load: (id) => ipcRenderer.invoke('localGguf.pool.load', id),
    unload: (id) => ipcRenderer.invoke('localGguf.pool.unload', id),
    setMaxConcurrent: (n) => ipcRenderer.invoke('localGguf.pool.setMaxConcurrent', n),
  },
  endpoint: {
    list: () => ipcRenderer.invoke('localGguf.endpoint.list'),
    add: (config) => ipcRenderer.invoke('localGguf.endpoint.add', config),
    remove: (id) => ipcRenderer.invoke('localGguf.endpoint.remove', id),
    test: (id) => ipcRenderer.invoke('localGguf.endpoint.test', id),
    update: (id, partial) => ipcRenderer.invoke('localGguf.endpoint.update', id, partial),
  },
  hf: {
    search: (query, filters) => ipcRenderer.invoke('localGguf.hf.search', query, filters),
    modelCard: (repoId) => ipcRenderer.invoke('localGguf.hf.modelCard', repoId),
    startDownload: (repoId, filename, targetFolder) =>
      ipcRenderer.invoke('localGguf.hf.startDownload', repoId, filename, targetFolder),
    pauseDownload: (handleId) => ipcRenderer.invoke('localGguf.hf.pauseDownload', handleId),
    resumeDownload: (handleId) => ipcRenderer.invoke('localGguf.hf.resumeDownload', handleId),
    cancelDownload: (handleId) => ipcRenderer.invoke('localGguf.hf.cancelDownload', handleId),
    activeDownloads: () => ipcRenderer.invoke('localGguf.hf.activeDownloads'),
  },
  benchmark: {
    run: (modelId) => ipcRenderer.invoke('localGguf.benchmark.run', modelId),
    history: (modelId) => ipcRenderer.invoke('localGguf.benchmark.history', modelId),
  },
};
```

- [ ] **Step 3: Mount the surface in `apps/desktop/src/preload/index.ts`.**

Find the existing teamXApi construction and add the `localGguf` field:

```ts
// Existing preload code that builds the teamXApi object:
import { localGgufApi } from './local-gguf-api';

const teamXApi = {
  // ... existing surfaces ...
  localGguf: localGgufApi,
};

contextBridge.exposeInMainWorld('teamXApi', teamXApi);
```

- [ ] **Step 4: Extend `apps/desktop/src/renderer/src/types/window.d.ts`.**

Add the type import + extend the TeamXApi interface:

```ts
import type { LocalGgufApi } from '../../../preload/local-gguf-api';

declare global {
  interface Window {
    teamXApi: {
      // ... existing surfaces ...
      localGguf: LocalGgufApi;
    };
  }
}

export {};
```

(Match the exact declaration style used by the existing file — `interface Window` extension, `declare global { ... }`, etc.)

- [ ] **Step 5: Typecheck.**

```bash
pnpm typecheck
```

Expected: zero errors. If errors fire because the existing `Window['teamXApi']` is declared as a literal type not an interface, refactor to interface OR use intersection types to add `localGguf` without breaking existing code.

- [ ] **Step 6: Run desktop unit tests to confirm nothing regressed.**

```bash
pnpm -F @team-x/desktop test
```

Expected: every existing test passes + the new repo/handler/settings tests pass.

- [ ] **Step 7: Commit.**

```bash
git add apps/desktop/src/preload/local-gguf-api.ts apps/desktop/src/preload/index.ts apps/desktop/src/renderer/src/types/window.d.ts
git commit -m "$(cat <<'EOF'
feat(preload): expose typed localGguf API surface to renderer

Adds apps/desktop/src/preload/local-gguf-api.ts as a typed bridge
over the localGguf.* IPC namespace (library, runtime, pool,
endpoint, hf, benchmark sub-objects). Mounted on window.teamXApi
under the localGguf key and declared in window.d.ts. Renderer
features in Phases 5–11 call into the main process through this
single typed object — no raw ipcRenderer.invoke in renderer code.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Register IPC handlers at app boot

**Files:**
- Modify: an existing main-process bootstrap file that calls `ipcMain.handle` / `registerXyzHandlers` for other features (likely `apps/desktop/src/main/index.ts` or a dedicated wiring module).

- [ ] **Step 1: Find the bootstrap.**

```bash
grep -rn "registerRagHandlers\|register.*Handlers" apps/desktop/src/main --include="*.ts" | head -20
```

Identify the wiring module.

- [ ] **Step 2: Add registration calls.**

In the bootstrap, alongside existing `registerXyzHandlers(ipcMain, deps)` lines, add:

```ts
import { registerLocalGgufLibraryHandlers } from './ipc/local-gguf-library-handlers';
import { registerLocalGgufRuntimeHandlers } from './ipc/local-gguf-runtime-handlers';
import { registerLocalGgufHfHandlers } from './ipc/local-gguf-hf-handlers';
import { registerLocalGgufBenchmarkHandlers } from './ipc/local-gguf-benchmark-handlers';
import { registerLocalGgufEndpointHandlers } from './ipc/local-gguf-endpoint-handlers';

// ... existing registrations ...

registerLocalGgufLibraryHandlers(ipcMain, {});
registerLocalGgufRuntimeHandlers(ipcMain, {});
registerLocalGgufHfHandlers(ipcMain, {});
registerLocalGgufBenchmarkHandlers(ipcMain, {});
registerLocalGgufEndpointHandlers(ipcMain, {});
```

- [ ] **Step 3: Typecheck + run all desktop tests.**

```bash
pnpm typecheck && pnpm -F @team-x/desktop test
```

Expected: all green.

- [ ] **Step 4: Commit.**

```bash
git add apps/desktop/src/main/index.ts # (or whichever file you modified)
git commit -m "$(cat <<'EOF'
feat(main): register local-gguf IPC handlers at app boot

Wires all five localGguf.* IPC handler modules into the main-process
boot sequence. Handlers are Phase 1 stubs (throw not-implemented);
later phases replace them with real implementations as services come
online.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Update CHANGELOG and add llamaCppRelease pin placeholder

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json` (root)

- [ ] **Step 1: Read existing CHANGELOG.**

```bash
head -30 CHANGELOG.md
```

Find the `[Unreleased]` section.

- [ ] **Step 2: Add Phase 1 entry.**

Add to `[Unreleased]` (preserve existing entries; add at the bottom of the section so chronology is clear):

```markdown
## [Unreleased]

### Added
- **Local & Networked GGUF Support (Phase 1 — Foundation)**: scaffolded
  `@team-x/local-gguf-runtime` package with shared TypeScript contracts
  (`LocalGgufError` union, `LocalModel`, `GpuInventory`, `AdvancedParams`,
  `RemoteEndpoint`, `WatchFolder`, `LocalGgufRuntimeSettings` —
  all in `@team-x/shared-types`). Added Drizzle migration
  `0014_local_gguf` with five new tables (`local_models`,
  `local_model_advanced_params`, `local_model_benchmarks`,
  `local_model_endpoints`, `local_model_watch_folders`), CHECK
  constraints disambiguating source-type/path/endpoint, and indexes
  covering hot queries + FK cascade paths. Added four db repos
  (LocalModelsRepo, LocalModelAdvancedParamsRepo, LocalModelEndpointsRepo,
  LocalModelWatchFoldersRepo) plus the LocalGgufSettingsAccessor for
  the `localGguf.*` runtime settings namespace. Registered all five IPC
  handler modules — `library`, `runtime`, `pool`, `hf`, `benchmark`,
  `endpoint` — as typed stubs (each channel throws a typed
  not-implemented error; subsequent phases replace stubs with real
  implementations). Exposed the typed `window.teamXApi.localGguf`
  surface via the preload bridge. No user-visible feature in this
  phase — pure foundation.
```

- [ ] **Step 3: Add `llamaCppRelease` field to root `package.json`.**

Read the current root `package.json`. Add a `llamaCppRelease` top-level field with the tag chosen in Spike S1's writeup (read `docs/spikes/2026-05-27-S1-llama-binary-fetch.md` → `## Chosen release` → tag). Example:

```json
{
  "name": "team-x",
  "version": "3.2.1",
  "llamaCppRelease": "b4321",
  ...
}
```

(Use the actual tag from the S1 writeup, not the placeholder `b4321`.)

- [ ] **Step 4: Typecheck (verifies nothing depending on package.json shape breaks).**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 5: Commit.**

```bash
git add CHANGELOG.md package.json
git commit -m "$(cat <<'EOF'
chore(release): Phase 1 CHANGELOG entry + llamaCppRelease pin

Documents the Phase 1 foundation deliverables under [Unreleased] and
pins the llama.cpp release tag chosen in Spike S1 at the root
package.json level. Phase 2 (Runtime + Pool) reads this field from
its binary fetch script.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: Phase 1 Quality Gate — run the full checklist

Before opening the PR, run every blocking gate from master-plan § CR-6 and § CR-7.

- [ ] **Step 1: Typecheck.**

```bash
pnpm typecheck
```

Expected: zero errors. If any error: fix before proceeding.

- [ ] **Step 2: Biome lint + renderer ESLint.**

```bash
pnpm lint
pnpm lint:eslint
```

Expected: clean on both. Fix any reported issues with `pnpm lint:fix` + manual review.

- [ ] **Step 3: Full test suite.**

```bash
pnpm test
```

Expected: 100% pass, including the new tests.

- [ ] **Step 4: Coverage report on new code.**

```bash
pnpm test:coverage
```

Open the HTML report or inspect the JSON for the new files. Expected: ≥ 90% line + branch on each new module in `@team-x/local-gguf-runtime` and in `apps/desktop/src/main/db/repos/local-model-*`. If any file is below 90%, add tests targeting the uncovered branches.

- [ ] **Step 5: E2E (no new specs in Phase 1, but ensure nothing regressed).**

```bash
pnpm -F @team-x/desktop test:e2e
```

Expected: 100% pass on existing specs.

- [ ] **Step 6: Conformance / audit / autonomy gates.**

```bash
pnpm audit:claims:strict
pnpm autonomy:doctor
```

Expected: clean.

- [ ] **Step 7: Performance assertion for Phase 1.**

Phase 1 is structural — perf assertion is: the migration runs cleanly against an empty DB in under 100 ms. Add this assertion to `apps/desktop/src/main/db/0014-local-gguf-migration.test.ts` if not already present:

```ts
it('runs the migration in under 100ms on an empty DB', () => {
  const db2 = new Database(':memory:');
  try {
    const sql = require('node:fs').readFileSync(
      require('node:path').join(__dirname, 'migrations', '0014_local_gguf.sql'),
      'utf8',
    );
    const t0 = Date.now();
    db2.exec(sql);
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(100);
  } finally {
    db2.close();
  }
});
```

Re-run the test to confirm green.

```bash
pnpm -F @team-x/desktop test -- 0014-local-gguf-migration.test.ts
```

- [ ] **Step 8: Security scan checklist.**

This phase introduces:
- A SQL migration: reviewed for injection risk — none (no user input touches the migration body; all repo statements use parameterized `?` or `@named` placeholders).
- IPC handlers: reviewed — all are stubs throwing, no user input flows through any real logic yet.
- No `spawn`/`exec` calls in this phase.
- No new HTTP calls in this phase.

Document the review by adding a single line to the PR description (Step 18 below).

- [ ] **Step 9: Verify final state.**

```bash
git status
git log --oneline origin/main..HEAD
```

Expected: clean tree; commits visible for every Task 2–16. Count should be ~15–20 commits.

---

### Task 18: Open the PR

- [ ] **Step 1: Push the branch.**

```bash
git push -u origin feat/v3.3.0-phase-01-foundation
```

- [ ] **Step 2: Open the PR.**

```bash
gh pr create \
  --base main \
  --head feat/v3.3.0-phase-01-foundation \
  --title "feat(v3.3.0): Phase 1 — Local GGUF foundation (package, types, migration, repos, IPC stubs)" \
  --body "$(cat <<'EOF'
## Summary
Phase 1 of the v3.3.0 Local & Networked GGUF Support feature. Pure foundation — no user-visible behavior in this PR. Sets up every contract, table, repo, and IPC channel that Phases 2–11 fill in.

Spec: `docs/superpowers/specs/2026-05-27-local-gguf-support-design.md` (commit `ca24e59`).
Plan: `docs/superpowers/plans/2026-05-27-local-gguf-support/phase-01-foundation.md`.

## What lands in this PR
- New package `@team-x/local-gguf-runtime` scaffold (index re-exports errors only — future phases extend)
- `@team-x/shared-types` extended with `LocalGgufError` discriminated union (17 variants), `LocalModel`, `GpuInventory`, `AdvancedParams`, `BenchmarkResult`, `RemoteEndpoint`, `WatchFolder`, `LocalGgufRuntimeSettings`
- Drizzle migration `0014_local_gguf.sql` — 5 tables, CHECK constraints disambiguating source-type/path/endpoint, indexes covering hot queries + FK cascade paths
- Four new db repos: `LocalModelsRepo`, `LocalModelAdvancedParamsRepo`, `LocalModelEndpointsRepo`, `LocalModelWatchFoldersRepo`
- `LocalGgufSettingsAccessor` for `localGguf.*` runtime settings namespace
- All five IPC handler modules (`library`, `runtime` + `pool`, `hf`, `benchmark`, `endpoint`) registered as typed stubs — every channel throws a not-implemented error
- Preload bridge `apps/desktop/src/preload/local-gguf-api.ts` exposing typed `window.teamXApi.localGguf` surface
- `package.json` pinned to llama.cpp release tag from Spike S1
- `CHANGELOG.md` `[Unreleased]` entry

## Quality gates
- ✅ `pnpm typecheck` — zero errors; no new `any`
- ✅ `pnpm lint` + `pnpm lint:eslint` — clean
- ✅ `pnpm test` — 100% pass; ≥ 90% line+branch on every new module
- ✅ `pnpm -F @team-x/desktop test:e2e` — 100% pass (existing specs)
- ✅ `pnpm audit:claims:strict` — clean
- ✅ `pnpm autonomy:doctor` — clean
- ✅ Perf assertion: migration runs in < 100 ms on empty DB
- ✅ Security review: no new `spawn`/`exec`, no new HTTP; SQL repo statements all parameterized; IPC handlers are stubs (no user data flows through real logic)

## Review wall
- [x] Stage 1 — CI green
- [ ] Stage 2 — `superpowers:requesting-code-review` → `feature-dev:code-reviewer` agent
- [ ] Stage 3 — `dev-tools:codex-review` (MANDATORY per master plan § CR-7 — IPC contracts + migration)
- [ ] Stage 4 — Rocky sign-off

## Test plan
- [ ] Pull this branch locally
- [ ] `pnpm install && pnpm test` — all green
- [ ] `pnpm -F @team-x/desktop dev` — app boots, no console errors related to localGguf
- [ ] In DevTools console: `await window.teamXApi.localGguf.library.list()` — should reject with the typed not-implemented error
- [ ] Stage 2 internal review report attached as a comment
- [ ] Stage 3 Codex review report attached as a comment
EOF
)"
```

- [ ] **Step 3: Invoke Stage 2 — internal review.**

Per master plan § CR-7, run the `superpowers:requesting-code-review` skill against this branch. The skill dispatches the `feature-dev:code-reviewer` sub-agent to review the entire phase diff. Resolve any high-confidence findings.

- [ ] **Step 4: Invoke Stage 3 — Codex independent review.**

Per master plan § CR-7, this phase is **MANDATORY** for Codex (IPC contracts + SQL migration). Run:

```bash
# Invokes the `dev-tools:codex-review` skill, which writes a report to .jez/reviews/
# (Refer to the skill's documentation for exact invocation; below is a placeholder
#  matching the typical `/codex review` slash-command invocation.)
```

Resolve any HIGH severity findings before merge. Attach the report as a PR comment.

- [ ] **Step 5: Stage 4 — Rocky sign-off.**

Rocky reviews the PR end-to-end. After sign-off, merge to `main`. Phase 2 (`phase-02-runtime-pool.md`) begins on the new `main`.

---

## Phase 1 — Spec coverage map

For Stage 2/3 reviewers verifying that this phase implements what it claims:

| Spec section | Implemented by |
|---|---|
| § 6 (package structure — `@team-x/local-gguf-runtime` skeleton) | Tasks 2, 3, 5 |
| § 7 table `local_models` | Tasks 6, 7 |
| § 7 table `local_model_advanced_params` | Tasks 6, 8 |
| § 7 table `local_model_endpoints` | Tasks 6, 9 |
| § 7 table `local_model_watch_folders` | Tasks 6, 10 |
| § 7 table `local_model_benchmarks` | Task 6 (table created); CRUD lands in Phase 10 |
| § 7 indexes (4 on `local_models`, 1 on `benchmarks`, 1 on `watch_folders`) | Task 6 |
| § 7 CHECK constraints | Task 6 + tests in Task 6 + Task 7 |
| § 7 runtime settings via existing app store (no new table) | Task 12 |
| § 8 IPC channel namespace declaration | Task 13 (stubs) |
| § 8 preload bridge | Task 14 |
| § 15 `LocalGgufError` union | Task 4 |
| § 16.1 TDD discipline | applied throughout |
| § 16.3 quality gates | Task 17 |

Any spec requirement NOT listed is implemented in a later phase. See master plan § "Phases 1–11 — Index" for the mapping.
