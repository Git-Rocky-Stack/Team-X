# Phase 2 — Runtime + Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Cross-phase rules:** See `docs/superpowers/plans/2026-05-27-local-gguf-support.md` § "Cross-phase rules" (CR-1 through CR-10) — canonical there.
>
> **Codex Stage 3 review:** REQUIRED. This phase introduces subprocess spawn surface — Codex independent review is mandatory before merge.

**Goal:** Stand up the runtime layer that drives every loaded GGUF: GPU probe across CUDA/ROCm/Vulkan/Metal/CPU, backend ranking + auto-detect, binary resolver, port allocator, llama-server subprocess lifecycle, LRU pool with auto-swap on agent demand, auto-tune calculations. By the end of this phase, Phase 1's `localGguf.runtime.*` and `localGguf.pool.*` IPC stubs are replaced with real implementations that can spawn a llama-server, run a chat completion, and unload cleanly — driven entirely from the renderer through the typed bridge.

**Architecture:** Five backend-specific probes (parallel, 3 s timeout each) feed into a ranking function. The chosen backend persists in the settings store. The `BinaryResolver` maps `(platform, backend)` to the vendored binary path under `apps/desktop/resources/llama-server/`. The `ServerLifecycle` module spawns `llama-server` with auto-tuned flags, waits for the "HTTP server listening" line, exposes a `ServerHandle` with `baseUrl`/`stop()`/`onCrash()`. The `LruPool` orchestrates the set of running `ServerHandle`s, with LRU eviction when the configured `maxConcurrent` is reached and auto-swap when a non-loaded model is requested.

**Spec coverage:** Implements spec § 11 (binary bundling), § 12 (GPU backend strategy), § 12.4 (auto-tune at import), pool semantics from § 4.1.4 + § 8.1 URL resolution preconditions.

**Estimated PR size:** ~2,500–3,500 LOC net production code + ~3,000 LOC tests + vendored binary tree (large but not LOC). Single PR.

---

## Files this phase touches

### New files

```
scripts/
├── fetch-llama-binaries.mjs                       (production, replaces S1 throwaway)
└── llama-binaries-manifest.json                   (SHA + size manifest, committed)

apps/desktop/resources/llama-server/
├── win32-x64/{cuda,rocm,vulkan,cpu}/server.exe + deps
├── win32-arm64/{vulkan,cpu}/server.exe + deps
├── linux-x64/{cuda,rocm,vulkan,cpu}/server + deps
├── darwin-arm64/metal/server + deps
└── darwin-x64/metal/server + deps

packages/local-gguf-runtime/src/
├── runtime/
│   ├── binary-resolver.ts
│   ├── binary-resolver.test.ts
│   ├── port-allocator.ts
│   ├── port-allocator.test.ts
│   ├── server-lifecycle.ts
│   ├── server-lifecycle.test.ts
│   ├── server-lifecycle.integration.test.ts
│   ├── auto-tune.ts
│   └── auto-tune.test.ts
├── pool/
│   ├── lru-pool.ts
│   ├── lru-pool.test.ts
│   ├── auto-swap.ts
│   └── auto-swap.test.ts
└── gpu-probe/
    ├── nvidia.ts
    ├── nvidia.test.ts
    ├── rocm.ts
    ├── rocm.test.ts
    ├── vulkan.ts
    ├── vulkan.test.ts
    ├── metal.ts
    ├── metal.test.ts
    ├── cpu.ts
    ├── cpu.test.ts
    ├── ranking.ts
    ├── ranking.test.ts
    ├── probe.ts
    ├── probe.test.ts
    └── probe.integration.test.ts

apps/desktop/src/main/services/local-gguf/
├── runtime-service.ts
├── runtime-service.test.ts
├── pool-service.ts
└── pool-service.test.ts

e2e/
└── local-gguf-loading.spec.ts                     (E2E against stub backend)
```

### Modified files

```
apps/desktop/package.json                          (prepack hook → fetch-llama-binaries.mjs)
apps/desktop/electron-builder.yml                  (resources allowlist + asarUnpack)
apps/desktop/src/main/ipc/local-gguf-runtime-handlers.ts  (replace stubs with real impl)
apps/desktop/src/main/index.ts                     (wire RuntimeService + PoolService into handler deps)
packages/local-gguf-runtime/src/index.ts           (export runtime + pool + gpu-probe surfaces)
.gitignore                                         (exclude apps/desktop/resources/llama-server/ from git unless we LFS — see Task 4)
CHANGELOG.md                                       (Phase 2 entry)
```

---

## Tasks

### Task 1: Branch off `main` and verify Phase 1 merged

- [ ] **Step 1: Sync.**

```bash
git checkout main && git pull --ff-only
```

- [ ] **Step 2: Verify Phase 1 merge landed.**

```bash
git log --oneline -20 | grep -i "phase 1\|phase-01\|foundation"
```

Expected: see the Phase 1 merge commit on `main`. If missing, STOP.

- [ ] **Step 3: Verify migration `0014` is on disk.**

```bash
ls apps/desktop/src/main/db/migrations/ | grep 0014
```

Expected: `0014_local_gguf.sql` present.

- [ ] **Step 4: Create phase branch.**

```bash
git checkout -b feat/v3.3.0-phase-02-runtime-pool
```

---

### Task 2: Decide on binary distribution strategy (commit vs LFS vs runtime-fetch)

Vendoring ~300–500 MB of binaries in git is hostile. Three options, decision needed before any code lands:

| Option | Pros | Cons |
|---|---|---|
| **A: Commit binaries to git** | Self-contained clone; reproducible builds | Repo size explodes; clone takes minutes |
| **B: Git LFS** | Repo stays small; clones can opt-out | Requires LFS infra; cost |
| **C: Runtime fetch during install / CI** | Repo stays small; deterministic via SHA manifest | New dev / fresh CI must hit network |

- [ ] **Step 1: Decide. Recommendation: Option C.**

`scripts/fetch-llama-binaries.mjs` runs:
- In CI before `electron-builder` (release.yml)
- As an `postinstall` step locally (dev experience: first `pnpm install` after a fresh clone fetches binaries into a gitignored path)

Repo stays small; SHA manifest is committed (deterministic builds); network access only when binaries are missing or version-pin changes.

- [ ] **Step 2: Update `.gitignore` to exclude the binary tree.**

Append to `.gitignore`:

```
# Vendored llama.cpp binaries (fetched by scripts/fetch-llama-binaries.mjs)
apps/desktop/resources/llama-server/
```

- [ ] **Step 3: Commit the gitignore change.**

```bash
git add .gitignore
git commit -m "$(cat <<'EOF'
chore(repo): gitignore apps/desktop/resources/llama-server/

Per Phase 2 binary-distribution decision (Option C): llama.cpp binaries
are fetched by scripts/fetch-llama-binaries.mjs at install + CI time,
not committed to git. SHA manifest at scripts/llama-binaries-manifest.json
provides deterministic builds.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Write the production binary-fetch script

**Files:**
- Create: `scripts/fetch-llama-binaries.mjs`
- Create: `scripts/llama-binaries-manifest.json`

- [ ] **Step 1: Read the Spike S1 writeup.**

```bash
cat docs/spikes/2026-05-27-S1-llama-binary-fetch.md
```

Note the chosen tag (e.g. `b4321`), the asset filename pattern per combo, and the SHA values.

- [ ] **Step 2: Author `scripts/llama-binaries-manifest.json`.**

Populate from the S1 writeup. Schema:

```json
{
  "llamaCppRelease": "b4321",
  "fetchedFromTag": "b4321",
  "binaries": {
    "win32-x64-cuda": {
      "asset": "llama-b4321-bin-win-cuda-cu12.4-x64.zip",
      "sha256": "<sha-from-S1>",
      "sizeBytes": 192345678,
      "url": "https://github.com/ggerganov/llama.cpp/releases/download/b4321/llama-b4321-bin-win-cuda-cu12.4-x64.zip"
    },
    "win32-x64-rocm": { "asset": "…", "sha256": "…", "sizeBytes": 0, "url": "…" },
    "win32-x64-vulkan": { "asset": "…", "sha256": "…", "sizeBytes": 0, "url": "…" },
    "win32-x64-cpu": { "asset": "…", "sha256": "…", "sizeBytes": 0, "url": "…" },
    "win32-arm64-vulkan": { "asset": "…", "sha256": "…", "sizeBytes": 0, "url": "…" },
    "win32-arm64-cpu": { "asset": "…", "sha256": "…", "sizeBytes": 0, "url": "…" },
    "linux-x64-cuda": { "asset": "…", "sha256": "…", "sizeBytes": 0, "url": "…" },
    "linux-x64-rocm": { "asset": "…", "sha256": "…", "sizeBytes": 0, "url": "…" },
    "linux-x64-vulkan": { "asset": "…", "sha256": "…", "sizeBytes": 0, "url": "…" },
    "linux-x64-cpu": { "asset": "…", "sha256": "…", "sizeBytes": 0, "url": "…" },
    "darwin-arm64-metal": { "asset": "…", "sha256": "…", "sizeBytes": 0, "url": "…" },
    "darwin-x64-metal": { "asset": "…", "sha256": "…", "sizeBytes": 0, "url": "…" }
  }
}
```

Real values come from S1. Combos where the upstream release shipped no asset stay absent from the manifest — fetch script logs them as known gaps.

- [ ] **Step 3: Write `scripts/fetch-llama-binaries.mjs`.**

```javascript
#!/usr/bin/env node
// scripts/fetch-llama-binaries.mjs
//
// Production binary fetcher for the Local GGUF Support feature.
// Reads scripts/llama-binaries-manifest.json, downloads each binary
// bundle into a cache, verifies SHA256, extracts under
// apps/desktop/resources/llama-server/<platform>-<arch>/<backend>/.
// Idempotent: skips already-extracted bundles whose SHA matches.
//
// Invoked by:
//   - apps/desktop/package.json postinstall hook (dev experience)
//   - apps/desktop/package.json prepack hook (electron-builder)
//   - .github/workflows/release.yml before build step

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { execSync } from 'node:child_process';
import process from 'node:process';

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname);
const MANIFEST_PATH = join(REPO_ROOT, 'scripts', 'llama-binaries-manifest.json');
const TARGET_ROOT = join(REPO_ROOT, 'apps', 'desktop', 'resources', 'llama-server');
const CACHE_ROOT = process.env.LLAMA_BIN_CACHE
  ?? join(process.env.HOME ?? process.env.USERPROFILE ?? '.', '.cache', 'team-x-llama-binaries');

const ALL_FLAG = process.argv.includes('--all');
const SKIP_PLATFORMS = (process.env.LLAMA_BIN_SKIP_PLATFORMS ?? '').split(',').filter(Boolean);

function currentPlatformKeys() {
  const platform = process.platform; // 'win32' | 'linux' | 'darwin'
  const arch = process.arch; // 'x64' | 'arm64'
  const prefix = `${platform}-${arch}-`;
  return { platform, arch, prefix };
}

async function sha256File(path) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

async function fileExists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function download(url, destPath) {
  await mkdir(dirname(destPath), { recursive: true });
  console.log(`[fetch] ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Download failed (${res.status} ${res.statusText}): ${url}`);
  }
  if (!res.body) throw new Error(`Empty body: ${url}`);
  await pipeline(res.body, createWriteStream(destPath));
}

async function extractZip(archivePath, targetDir) {
  await mkdir(targetDir, { recursive: true });
  if (process.platform === 'win32') {
    execSync(`powershell -Command "Expand-Archive -Force -Path '${archivePath}' -DestinationPath '${targetDir}'"`, { stdio: 'inherit' });
  } else {
    execSync(`unzip -q -o "${archivePath}" -d "${targetDir}"`, { stdio: 'inherit' });
  }
}

async function isAlreadyExtracted(targetDir, expectedSha) {
  const markerPath = join(targetDir, '.sha256');
  if (!(await fileExists(markerPath))) return false;
  const actual = (await readFile(markerPath, 'utf8')).trim();
  return actual === expectedSha;
}

async function processBinary(key, spec) {
  const targetDir = join(TARGET_ROOT, ...key.split('-'));
  if (await isAlreadyExtracted(targetDir, spec.sha256)) {
    console.log(`[skip] ${key} — already extracted at ${targetDir}`);
    return;
  }
  // Clear any partial extraction so we start clean.
  if (await fileExists(targetDir)) {
    await rm(targetDir, { recursive: true, force: true });
  }
  const cachedArchive = join(CACHE_ROOT, key, spec.asset);
  // Reuse cached download if SHA matches; otherwise re-fetch.
  let needDownload = true;
  if (await fileExists(cachedArchive)) {
    const actual = await sha256File(cachedArchive);
    if (actual === spec.sha256) {
      needDownload = false;
      console.log(`[cache-hit] ${key}`);
    } else {
      console.log(`[cache-miss-sha] ${key} (expected ${spec.sha256}, got ${actual})`);
    }
  }
  if (needDownload) {
    await download(spec.url, cachedArchive);
    const actual = await sha256File(cachedArchive);
    if (actual !== spec.sha256) {
      throw new Error(
        `SHA256 mismatch for ${key}: expected ${spec.sha256}, got ${actual}. ` +
        `Manifest may be stale, or the upstream release was retagged.`
      );
    }
  }
  await extractZip(cachedArchive, targetDir);
  await writeFile(join(targetDir, '.sha256'), spec.sha256, 'utf8');
  console.log(`[ok] ${key} → ${targetDir}`);
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const { prefix } = currentPlatformKeys();

  let keysToProcess;
  if (ALL_FLAG) {
    keysToProcess = Object.keys(manifest.binaries);
  } else {
    // Default: fetch only this OS+arch's combos.
    keysToProcess = Object.keys(manifest.binaries).filter((k) => k.startsWith(prefix));
  }
  keysToProcess = keysToProcess.filter((k) => !SKIP_PLATFORMS.includes(k));

  if (keysToProcess.length === 0) {
    console.warn(`No binaries to fetch for ${prefix} (and --all not set). Exiting.`);
    return;
  }

  console.log(`Fetching ${keysToProcess.length} binary bundle(s) for llama.cpp ${manifest.llamaCppRelease}…`);
  await mkdir(CACHE_ROOT, { recursive: true });

  for (const key of keysToProcess) {
    const spec = manifest.binaries[key];
    if (!spec) {
      console.warn(`[skip-missing-spec] ${key} not in manifest — gap from upstream release`);
      continue;
    }
    await processBinary(key, spec);
  }

  console.log(`Done. Binaries at ${TARGET_ROOT}`);
}

main().catch((err) => {
  console.error('fetch-llama-binaries failed:', err.message);
  process.exit(1);
});
```

- [ ] **Step 4: Make executable + test locally.**

```bash
chmod +x scripts/fetch-llama-binaries.mjs
node scripts/fetch-llama-binaries.mjs
```

Expected: fetches this OS+arch's combos into `apps/desktop/resources/llama-server/<platform>-<arch>/<backend>/`. Re-run; expected to log `[skip]` for all combos.

- [ ] **Step 5: Test SHA mismatch handling.**

Manually edit the manifest to change one `sha256` value. Re-run. Expected: fails with `SHA256 mismatch for <key>: expected <bad>, got <real>`. Revert the manifest edit.

- [ ] **Step 6: Test `--all` flag.**

```bash
node scripts/fetch-llama-binaries.mjs --all
```

Expected: fetches every combo regardless of current platform. Useful for cross-platform CI runners.

- [ ] **Step 7: Commit.**

```bash
git add scripts/fetch-llama-binaries.mjs scripts/llama-binaries-manifest.json
git commit -m "$(cat <<'EOF'
feat(scripts): production llama.cpp binary fetcher + SHA manifest

scripts/fetch-llama-binaries.mjs:
  - Reads scripts/llama-binaries-manifest.json (committed, deterministic
    build inputs)
  - Default mode fetches only the current OS+arch's combos
  - --all fetches every combo (CI cross-platform)
  - Caches archives under ~/.cache/team-x-llama-binaries/<tag>/
  - Verifies SHA256 against manifest before extracting
  - Idempotent: writes .sha256 marker into extracted dir, skips on match
  - Cross-platform extraction (Expand-Archive on Windows, unzip elsewhere)

Manifest pinned to llama.cpp release per Spike S1 writeup.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Hook the fetcher into `apps/desktop/package.json` and electron-builder

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/electron-builder.yml`

- [ ] **Step 1: Add `postinstall` + `prepack` hooks.**

Read current `apps/desktop/package.json`. Locate the `scripts` block. Add:

```json
{
  "scripts": {
    ...,
    "postinstall": "node ../../scripts/fetch-llama-binaries.mjs || echo 'llama binaries fetch failed; run manually'",
    "prepack:llama-binaries": "node ../../scripts/fetch-llama-binaries.mjs --all"
  }
}
```

If an existing `postinstall` already runs `electron-builder install-app-deps` (typical Electron setup), CHAIN it — don't replace:

```json
"postinstall": "electron-builder install-app-deps && node ../../scripts/fetch-llama-binaries.mjs || echo 'llama binaries fetch failed'"
```

- [ ] **Step 2: Wire the fetcher into `dist:*` scripts.**

Existing `dist:*` scripts should run `prepack:llama-binaries` first. Example, if existing reads:

```json
"dist:win": "electron-builder --win"
```

change to:

```json
"dist:win": "node ../../scripts/fetch-llama-binaries.mjs --all && electron-builder --win"
```

Repeat for `dist:mac`, `dist:linux`, `dist`, `dist:publish`.

- [ ] **Step 3: Modify `apps/desktop/electron-builder.yml`.**

Add `apps/desktop/resources/llama-server/**/*` to the `files` allowlist + `asarUnpack` (binaries can't be in the asar archive — Node `child_process.spawn` needs real filesystem paths). Find the existing `files:` block and append:

```yaml
files:
  # ... existing entries ...
  - "resources/llama-server/**/*"

asarUnpack:
  # ... existing entries ...
  - "resources/llama-server/**/*"

extraResources:
  - from: "resources/llama-server"
    to: "llama-server"
    filter: ["**/*"]
```

Note: `extraResources` places the tree under `process.resourcesPath` in production builds. `asarUnpack` ensures dev mode also sees real files. The `BinaryResolver` in Task 6 handles both layouts.

- [ ] **Step 4: Smoke test.**

```bash
pnpm -F @team-x/desktop dist:linux --dir
# (--dir produces an unpacked dir without a final installer, faster)
```

Expected: build succeeds; check the output dir contains `resources/llama-server/<platform>-<arch>/<backend>/server` (or `server.exe`).

- [ ] **Step 5: Commit.**

```bash
git add apps/desktop/package.json apps/desktop/electron-builder.yml
git commit -m "$(cat <<'EOF'
build(desktop): wire llama-binary fetcher into install + dist + builder

apps/desktop/package.json:
  - postinstall chains binary fetch after install-app-deps (dev experience)
  - dist:* scripts invoke fetch --all before electron-builder (CI cross-platform)

apps/desktop/electron-builder.yml:
  - files allowlist + asarUnpack include resources/llama-server tree
  - extraResources copies binaries to process.resourcesPath in production
    so subprocess.spawn can hit real filesystem paths

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Write the `BinaryResolver` module (TDD)

**Files:**
- Create: `packages/local-gguf-runtime/src/runtime/binary-resolver.ts`
- Create: `packages/local-gguf-runtime/src/runtime/binary-resolver.test.ts`

The resolver maps `(platform, arch, backend)` → absolute path to the `server` binary, handling dev vs production layouts.

- [ ] **Step 1: Write the failing test.**

```ts
// packages/local-gguf-runtime/src/runtime/binary-resolver.test.ts
import { describe, expect, it, vi } from 'vitest';
import { resolveBinaryPath, BinaryResolverError } from './binary-resolver';

describe('resolveBinaryPath', () => {
  it('returns the correct path for win32-x64 CUDA', () => {
    const result = resolveBinaryPath({
      platform: 'win32',
      arch: 'x64',
      backend: 'cuda',
      resourcesRoot: 'C:/app/resources',
      fileExists: (p) => p === 'C:/app/resources/llama-server/win32-x64/cuda/server.exe',
    });
    expect(result).toBe('C:/app/resources/llama-server/win32-x64/cuda/server.exe');
  });

  it('returns the correct path for linux-x64 Vulkan', () => {
    const result = resolveBinaryPath({
      platform: 'linux',
      arch: 'x64',
      backend: 'vulkan',
      resourcesRoot: '/app/resources',
      fileExists: (p) => p === '/app/resources/llama-server/linux-x64/vulkan/server',
    });
    expect(result).toBe('/app/resources/llama-server/linux-x64/vulkan/server');
  });

  it('returns the correct path for darwin-arm64 Metal', () => {
    const result = resolveBinaryPath({
      platform: 'darwin',
      arch: 'arm64',
      backend: 'metal',
      resourcesRoot: '/app/resources',
      fileExists: (p) => p === '/app/resources/llama-server/darwin-arm64/metal/server',
    });
    expect(result).toBe('/app/resources/llama-server/darwin-arm64/metal/server');
  });

  it('throws BinaryResolverError(binary-not-found) when the path does not exist', () => {
    expect(() =>
      resolveBinaryPath({
        platform: 'linux',
        arch: 'x64',
        backend: 'rocm',
        resourcesRoot: '/app/resources',
        fileExists: () => false,
      }),
    ).toThrowError(BinaryResolverError);
  });

  it('throws BinaryResolverError with kind binary-not-found and the attempted path', () => {
    try {
      resolveBinaryPath({
        platform: 'linux',
        arch: 'x64',
        backend: 'rocm',
        resourcesRoot: '/app/resources',
        fileExists: () => false,
      });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(BinaryResolverError);
      expect((e as BinaryResolverError).error.kind).toBe('binary-not-found');
      expect((e as BinaryResolverError).error.path).toBe(
        '/app/resources/llama-server/linux-x64/rocm/server',
      );
    }
  });

  it('throws BinaryResolverError(binary-unsupported) for unsupported platform+backend', () => {
    try {
      resolveBinaryPath({
        platform: 'darwin',
        arch: 'arm64',
        backend: 'cuda',
        resourcesRoot: '/app/resources',
        fileExists: () => true,
      });
      throw new Error('expected throw');
    } catch (e) {
      expect((e as BinaryResolverError).error.kind).toBe('binary-unsupported');
    }
  });

  it('handles win32-arm64 backends correctly (vulkan + cpu only)', () => {
    expect(() =>
      resolveBinaryPath({
        platform: 'win32',
        arch: 'arm64',
        backend: 'cuda',
        resourcesRoot: 'C:/r',
        fileExists: () => true,
      }),
    ).toThrowError(/unsupported/i);

    const ok = resolveBinaryPath({
      platform: 'win32',
      arch: 'arm64',
      backend: 'vulkan',
      resourcesRoot: 'C:/r',
      fileExists: (p) => p === 'C:/r/llama-server/win32-arm64/vulkan/server.exe',
    });
    expect(ok).toBe('C:/r/llama-server/win32-arm64/vulkan/server.exe');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

```bash
pnpm -F @team-x/local-gguf-runtime test -- binary-resolver.test.ts
```

Expected: FAIL with `Cannot find module './binary-resolver'`.

- [ ] **Step 3: Write the production module.**

```ts
// packages/local-gguf-runtime/src/runtime/binary-resolver.ts
import type { GpuBackend, LocalGgufError } from '@team-x/shared-types';

export class BinaryResolverError extends Error {
  constructor(public readonly error: LocalGgufError) {
    super(`BinaryResolverError: ${JSON.stringify(error)}`);
    this.name = 'BinaryResolverError';
  }
}

export interface ResolveBinaryOptions {
  platform: NodeJS.Platform;
  arch: 'x64' | 'arm64';
  backend: GpuBackend;
  resourcesRoot: string;
  fileExists: (path: string) => boolean;
}

const SUPPORTED: Record<string, GpuBackend[]> = {
  'win32-x64': ['cuda', 'rocm', 'vulkan', 'cpu'],
  'win32-arm64': ['vulkan', 'cpu'],
  'linux-x64': ['cuda', 'rocm', 'vulkan', 'cpu'],
  'darwin-arm64': ['metal'],
  'darwin-x64': ['metal'],
};

export function resolveBinaryPath(opts: ResolveBinaryOptions): string {
  const platformKey = `${opts.platform}-${opts.arch}`;
  const supported = SUPPORTED[platformKey];
  if (!supported || !supported.includes(opts.backend)) {
    throw new BinaryResolverError({
      kind: 'binary-unsupported',
      backend: opts.backend,
      osVersion: platformKey,
    });
  }
  const binaryName = opts.platform === 'win32' ? 'server.exe' : 'server';
  const path = `${opts.resourcesRoot}/llama-server/${platformKey}/${opts.backend}/${binaryName}`;
  if (!opts.fileExists(path)) {
    throw new BinaryResolverError({
      kind: 'binary-not-found',
      backend: opts.backend,
      path,
    });
  }
  return path;
}
```

- [ ] **Step 4: Run the test.**

```bash
pnpm -F @team-x/local-gguf-runtime test -- binary-resolver.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit.**

```bash
git add packages/local-gguf-runtime/src/runtime/binary-resolver.ts packages/local-gguf-runtime/src/runtime/binary-resolver.test.ts
git commit -m "$(cat <<'EOF'
feat(local-gguf): add BinaryResolver mapping (platform, arch, backend) to binary path

resolveBinaryPath() returns the absolute path to llama-server for the
requested combo or throws BinaryResolverError with the appropriate
LocalGgufError variant (binary-unsupported when the combo isn't shipped
for this platform; binary-not-found when fetch-llama-binaries.mjs
hasn't run yet or the path is corrupt). Supported matrix:
win32-x64 = cuda+rocm+vulkan+cpu, win32-arm64 = vulkan+cpu,
linux-x64 = cuda+rocm+vulkan+cpu, darwin-* = metal-only.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Write the `PortAllocator` module (TDD)

**Files:**
- Create: `packages/local-gguf-runtime/src/runtime/port-allocator.ts`
- Create: `packages/local-gguf-runtime/src/runtime/port-allocator.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// packages/local-gguf-runtime/src/runtime/port-allocator.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:net';
import { allocatePort, PortAllocatorError } from './port-allocator';

describe('allocatePort', () => {
  it('returns a port number in the ephemeral range', async () => {
    const port = await allocatePort();
    expect(port).toBeGreaterThanOrEqual(49152);
    expect(port).toBeLessThanOrEqual(65535);
  });

  it('returned ports are bindable', async () => {
    const port = await allocatePort();
    await new Promise<void>((resolve, reject) => {
      const srv = createServer();
      srv.listen(port, '127.0.0.1', () => {
        srv.close(() => resolve());
      });
      srv.on('error', reject);
    });
  });

  it('returns distinct ports on rapid successive calls', async () => {
    const ports = await Promise.all([allocatePort(), allocatePort(), allocatePort(), allocatePort()]);
    const unique = new Set(ports);
    expect(unique.size).toBe(ports.length);
  });

  it('throws PortAllocatorError(port-exhausted) when no port is available', async () => {
    // Mock by passing a tiny range with all ports busy
    const blockers: ReturnType<typeof createServer>[] = [];
    try {
      // Allocate and HOLD a small range so the allocator's range is fully busy
      for (let p = 50000; p <= 50005; p++) {
        const srv = createServer();
        await new Promise<void>((resolve, reject) => {
          srv.listen(p, '127.0.0.1', () => resolve());
          srv.on('error', reject);
        });
        blockers.push(srv);
      }
      await expect(
        allocatePort({ rangeStart: 50000, rangeEnd: 50005, maxAttempts: 3 }),
      ).rejects.toThrowError(PortAllocatorError);
    } finally {
      for (const s of blockers) await new Promise<void>((r) => s.close(() => r()));
    }
  });
});
```

- [ ] **Step 2: Run to verify failure.**

```bash
pnpm -F @team-x/local-gguf-runtime test -- port-allocator.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Write the production module.**

```ts
// packages/local-gguf-runtime/src/runtime/port-allocator.ts
import { createServer } from 'node:net';
import type { LocalGgufError } from '@team-x/shared-types';

export class PortAllocatorError extends Error {
  constructor(public readonly error: LocalGgufError) {
    super(`PortAllocatorError: ${JSON.stringify(error)}`);
    this.name = 'PortAllocatorError';
  }
}

export interface AllocatePortOptions {
  rangeStart?: number; // default 49152
  rangeEnd?: number;   // default 65535
  maxAttempts?: number; // default 50
}

export async function allocatePort(opts: AllocatePortOptions = {}): Promise<number> {
  const rangeStart = opts.rangeStart ?? 49152;
  const rangeEnd = opts.rangeEnd ?? 65535;
  const maxAttempts = opts.maxAttempts ?? 50;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = Math.floor(Math.random() * (rangeEnd - rangeStart + 1)) + rangeStart;
    const available = await tryBind(port);
    if (available) return port;
  }
  throw new PortAllocatorError({ kind: 'port-exhausted' });
}

function tryBind(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => {
      srv.close(() => resolve(true));
    });
  });
}
```

- [ ] **Step 4: Run.**

```bash
pnpm -F @team-x/local-gguf-runtime test -- port-allocator.test.ts
```

Expected: 4 tests pass. (The exhaustion test may be slow; OK.)

- [ ] **Step 5: Commit.**

```bash
git add packages/local-gguf-runtime/src/runtime/port-allocator.ts packages/local-gguf-runtime/src/runtime/port-allocator.test.ts
git commit -m "$(cat <<'EOF'
feat(local-gguf): add PortAllocator for llama-server subprocess ports

allocatePort() picks a random port in the IANA ephemeral range
(49152–65535) and verifies it's bindable on 127.0.0.1 before returning.
Configurable range and max-attempts. Throws PortAllocatorError with
LocalGgufError kind 'port-exhausted' when no port can be acquired.

Race note: between allocation and llama-server's actual bind, the
port could be claimed by another process — that's an accepted small
race window. The ServerLifecycle's spawn-to-ready loop catches the
"bind: address already in use" stderr and re-allocates.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Write the `AutoTune` module (TDD)

**Files:**
- Create: `packages/local-gguf-runtime/src/runtime/auto-tune.ts`
- Create: `packages/local-gguf-runtime/src/runtime/auto-tune.test.ts`

Auto-tune is pure math — perfect for TDD.

- [ ] **Step 1: Write the failing test.**

```ts
// packages/local-gguf-runtime/src/runtime/auto-tune.test.ts
import { describe, expect, it } from 'vitest';
import { autoTune } from './auto-tune';

describe('autoTune', () => {
  it('caps n_ctx at min(model max, 4096)', () => {
    const a = autoTune({
      ggufContextMax: 131072,
      ggufArch: 'llama',
      ggufParamsB: 8.0,
      ggufQuant: 'Q4_K_M',
      ggufSizeBytes: 4_900_000_000,
      availableVramMb: 24_576,
      physicalCores: 16,
    });
    expect(a.nCtx).toBe(4096);
  });

  it('uses model context_max if it is smaller than 4096', () => {
    const a = autoTune({
      ggufContextMax: 2048,
      ggufArch: 'bert',
      ggufParamsB: 0.3,
      ggufQuant: 'Q4_K_M',
      ggufSizeBytes: 200_000_000,
      availableVramMb: 24_576,
      physicalCores: 16,
    });
    expect(a.nCtx).toBe(2048);
  });

  it('returns 4096 default when context_max is unknown', () => {
    const a = autoTune({
      ggufContextMax: null,
      ggufArch: 'unknown',
      ggufParamsB: 7.0,
      ggufQuant: 'Q4_K_M',
      ggufSizeBytes: 4_000_000_000,
      availableVramMb: 8_192,
      physicalCores: 8,
    });
    expect(a.nCtx).toBe(4096);
  });

  it('offloads all layers when VRAM comfortably exceeds model size × 1.2', () => {
    const a = autoTune({
      ggufContextMax: 4096,
      ggufArch: 'llama',
      ggufParamsB: 7.0,
      ggufQuant: 'Q4_K_M',
      ggufSizeBytes: 4_000_000_000,
      availableVramMb: 24_576,
      physicalCores: 16,
    });
    expect(a.nGpuLayers).toBe(999); // 999 is llama.cpp's "all layers" sentinel
  });

  it('offloads zero layers (CPU only) when VRAM is below model size', () => {
    const a = autoTune({
      ggufContextMax: 4096,
      ggufArch: 'llama',
      ggufParamsB: 70.0,
      ggufQuant: 'Q4_K_M',
      ggufSizeBytes: 40_000_000_000,
      availableVramMb: 8_192,
      physicalCores: 16,
    });
    expect(a.nGpuLayers).toBe(0);
  });

  it('partial offload when VRAM fits some but not all layers', () => {
    // ~13 GB model, 8 GB VRAM. With 0.85 safety, usable is ~6.96 GB.
    // Roughly half the layers fit.
    const a = autoTune({
      ggufContextMax: 4096,
      ggufArch: 'llama',
      ggufParamsB: 13.0,
      ggufQuant: 'Q4_K_M',
      ggufSizeBytes: 7_500_000_000,
      availableVramMb: 8_192,
      physicalCores: 8,
    });
    expect(a.nGpuLayers).toBeGreaterThan(0);
    expect(a.nGpuLayers).toBeLessThan(999);
  });

  it('threads = max(1, physicalCores - 2)', () => {
    expect(autoTune({ ggufContextMax: 4096, ggufArch: 'l', ggufParamsB: 7, ggufQuant: 'Q4', ggufSizeBytes: 4_000_000_000, availableVramMb: 0, physicalCores: 1 }).nThreads).toBe(1);
    expect(autoTune({ ggufContextMax: 4096, ggufArch: 'l', ggufParamsB: 7, ggufQuant: 'Q4', ggufSizeBytes: 4_000_000_000, availableVramMb: 0, physicalCores: 2 }).nThreads).toBe(1);
    expect(autoTune({ ggufContextMax: 4096, ggufArch: 'l', ggufParamsB: 7, ggufQuant: 'Q4', ggufSizeBytes: 4_000_000_000, availableVramMb: 0, physicalCores: 8 }).nThreads).toBe(6);
    expect(autoTune({ ggufContextMax: 4096, ggufArch: 'l', ggufParamsB: 7, ggufQuant: 'Q4', ggufSizeBytes: 4_000_000_000, availableVramMb: 0, physicalCores: 32 }).nThreads).toBe(30);
  });

  it('sampling defaults are stable', () => {
    const a = autoTune({
      ggufContextMax: 4096, ggufArch: 'l', ggufParamsB: 7, ggufQuant: 'Q4', ggufSizeBytes: 4_000_000_000, availableVramMb: 0, physicalCores: 8,
    });
    expect(a.temperature).toBe(0.7);
    expect(a.topP).toBe(0.95);
    expect(a.topK).toBe(40);
    expect(a.repeatPenalty).toBe(1.1);
    expect(a.nBatch).toBe(512);
  });
});
```

- [ ] **Step 2: Run to verify failure.**

```bash
pnpm -F @team-x/local-gguf-runtime test -- auto-tune.test.ts
```

- [ ] **Step 3: Write the production module.**

```ts
// packages/local-gguf-runtime/src/runtime/auto-tune.ts
//
// Auto-tune llama-server flags from GGUF metadata + detected hardware.
// All values are deterministic for a given input — no I/O.

export interface AutoTuneInput {
  ggufContextMax: number | null;
  ggufArch: string;
  ggufParamsB: number;
  ggufQuant: string;
  ggufSizeBytes: number;
  availableVramMb: number;
  physicalCores: number;
}

export interface AutoTuneOutput {
  nCtx: number;
  nGpuLayers: number;
  nBatch: number;
  nThreads: number;
  temperature: number;
  topP: number;
  topK: number;
  repeatPenalty: number;
}

const DEFAULT_NCTX = 4096;
const DEFAULT_NBATCH = 512;
const VRAM_SAFETY = 0.85;
const ALL_LAYERS_SENTINEL = 999;

// Rough per-arch layer-count table used to estimate partial offload.
// Numbers from real GGUF metadata across Llama 3.x, Mistral, Qwen 2.x, etc.
const ARCH_LAYER_COUNTS: Record<string, number> = {
  llama: 32,
  llama2: 32,
  llama3: 32,
  mistral: 32,
  qwen2: 32,
  qwen2_moe: 28,
  gemma2: 42,
  phi3: 32,
  deepseek2: 30,
  // Embedding archs have many fewer layers
  bert: 12,
  'nomic-bert': 12,
  'xlm-roberta': 12,
};

// Per-billion-parameter VRAM cost (Q4_K_M typical). Multiplied by params count.
const VRAM_MB_PER_BILLION = 600; // rough; tuned to be conservative

export function autoTune(input: AutoTuneInput): AutoTuneOutput {
  const nCtx = clamp(input.ggufContextMax ?? DEFAULT_NCTX, 512, DEFAULT_NCTX);

  const modelVramEstimateMb = input.ggufParamsB * VRAM_MB_PER_BILLION;
  const usableVramMb = Math.floor(input.availableVramMb * VRAM_SAFETY);

  let nGpuLayers: number;
  if (input.availableVramMb === 0) {
    nGpuLayers = 0;
  } else if (usableVramMb >= modelVramEstimateMb * 1.2) {
    nGpuLayers = ALL_LAYERS_SENTINEL;
  } else if (usableVramMb < modelVramEstimateMb * 0.5) {
    nGpuLayers = 0;
  } else {
    const totalLayers = ARCH_LAYER_COUNTS[input.ggufArch] ?? 32;
    const ratio = usableVramMb / (modelVramEstimateMb * 1.0);
    nGpuLayers = Math.max(1, Math.floor(totalLayers * ratio));
  }

  const nThreads = Math.max(1, input.physicalCores - 2);

  return {
    nCtx,
    nGpuLayers,
    nBatch: DEFAULT_NBATCH,
    nThreads,
    temperature: 0.7,
    topP: 0.95,
    topK: 40,
    repeatPenalty: 1.1,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
```

- [ ] **Step 4: Run.**

```bash
pnpm -F @team-x/local-gguf-runtime test -- auto-tune.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit.**

```bash
git add packages/local-gguf-runtime/src/runtime/auto-tune.ts packages/local-gguf-runtime/src/runtime/auto-tune.test.ts
git commit -m "$(cat <<'EOF'
feat(local-gguf): add autoTune for llama-server flags from GGUF + hardware

autoTune(input) returns deterministic safe defaults for n_ctx (capped
at min(model max, 4096)), n_gpu_layers (999 sentinel when VRAM fits
whole model with margin; 0 when too tight; partial estimate using
per-arch layer-count table when in between), n_batch (512), n_threads
(physical cores − 2 floor 1), and sampling params (temp 0.7, top_p
0.95, top_k 40, repeat_penalty 1.1).

Pure function — no I/O — perfect for TDD coverage.

Implements spec § 12.4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Write per-backend GPU probes (5 modules, TDD each)

For each backend (nvidia, rocm, vulkan, metal, cpu), write a probe that parses a fixture from Spike S2 and returns the typed structured output. Each backend gets its own task; commit after each.

**General pattern (apply to all 5):**

1. Read `docs/spikes/S2-fixtures/<vendor>/<command>.txt` as test fixture.
2. Write failing parser test.
3. Run, confirm fail.
4. Write parser.
5. Run, confirm pass.
6. Commit.

#### 8a: NVIDIA probe (`packages/local-gguf-runtime/src/gpu-probe/nvidia.ts`)

- [ ] **Step 1: Inspect the S2 fixture.**

```bash
cat docs/spikes/S2-fixtures/windows-nvidia/nvidia-smi.txt
```

Note the CSV format: `name, memory.total [MiB], driver_version, compute_cap`.

- [ ] **Step 2: Write the failing test.**

```ts
// packages/local-gguf-runtime/src/gpu-probe/nvidia.test.ts
import { describe, expect, it } from 'vitest';
import { parseNvidiaSmiCsv, probeNvidia, type ProbeNvidiaDeps } from './nvidia';

describe('parseNvidiaSmiCsv', () => {
  it('parses a single-GPU CSV line', () => {
    const raw = 'NVIDIA GeForce RTX 4090, 24564 MiB, 555.42, 8.9';
    const out = parseNvidiaSmiCsv(raw);
    expect(out).toEqual({
      devices: [{ name: 'NVIDIA GeForce RTX 4090', vramMb: 24564, backend: 'cuda' }],
      driverVersion: '555.42',
      cudaVersion: undefined,
    });
  });

  it('parses multiple GPUs', () => {
    const raw = [
      'NVIDIA GeForce RTX 4090, 24564 MiB, 555.42, 8.9',
      'NVIDIA GeForce RTX 3090, 24576 MiB, 555.42, 8.6',
    ].join('\n');
    const out = parseNvidiaSmiCsv(raw);
    expect(out.devices).toHaveLength(2);
    expect(out.devices[1].name).toBe('NVIDIA GeForce RTX 3090');
  });

  it('returns empty devices on empty input', () => {
    const out = parseNvidiaSmiCsv('');
    expect(out.devices).toHaveLength(0);
  });

  it('tolerates extra whitespace', () => {
    const raw = '  NVIDIA RTX A6000  ,  49152 MiB  ,  535.86  ,  8.6  ';
    const out = parseNvidiaSmiCsv(raw);
    expect(out.devices[0].vramMb).toBe(49152);
    expect(out.devices[0].name).toBe('NVIDIA RTX A6000');
  });
});

describe('probeNvidia', () => {
  it('returns available=true with parsed devices when nvidia-smi succeeds', async () => {
    const deps: ProbeNvidiaDeps = {
      runCommand: async () => ({ stdout: 'NVIDIA RTX 4090, 24564 MiB, 555.42, 8.9', stderr: '', exitCode: 0 }),
      timeoutMs: 3000,
    };
    const result = await probeNvidia(deps);
    expect(result.available).toBe(true);
    expect(result.devices[0].vramMb).toBe(24564);
    expect(result.driverVersion).toBe('555.42');
  });

  it('returns available=false when nvidia-smi exits non-zero', async () => {
    const deps: ProbeNvidiaDeps = {
      runCommand: async () => ({ stdout: '', stderr: 'nvidia-smi not found', exitCode: 127 }),
      timeoutMs: 3000,
    };
    const result = await probeNvidia(deps);
    expect(result.available).toBe(false);
    expect(result.devices).toHaveLength(0);
  });

  it('returns available=false when the command times out', async () => {
    const deps: ProbeNvidiaDeps = {
      runCommand: async () => { throw new Error('Command timed out'); },
      timeoutMs: 3000,
    };
    const result = await probeNvidia(deps);
    expect(result.available).toBe(false);
  });
});
```

- [ ] **Step 3: Run; expect fail.**

```bash
pnpm -F @team-x/local-gguf-runtime test -- nvidia.test.ts
```

- [ ] **Step 4: Write the production module.**

```ts
// packages/local-gguf-runtime/src/gpu-probe/nvidia.ts
import type { GpuDevice } from '@team-x/shared-types';

export interface NvidiaCsvParseResult {
  devices: GpuDevice[];
  driverVersion: string | undefined;
  cudaVersion: string | undefined;
}

export interface ProbeNvidiaDeps {
  runCommand: (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  timeoutMs: number;
}

export interface NvidiaProbeResult {
  available: boolean;
  devices: GpuDevice[];
  driverVersion?: string;
  cudaVersion?: string;
}

export function parseNvidiaSmiCsv(raw: string): NvidiaCsvParseResult {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const devices: GpuDevice[] = [];
  let driverVersion: string | undefined;
  for (const line of lines) {
    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 2) continue;
    const [name, mem, driver] = parts;
    const memMatch = /^(\d+)\s*MiB$/i.exec(mem);
    if (!memMatch) continue;
    devices.push({ name, vramMb: parseInt(memMatch[1], 10), backend: 'cuda' });
    if (driver && !driverVersion) driverVersion = driver;
  }
  return { devices, driverVersion, cudaVersion: undefined };
}

export async function probeNvidia(deps: ProbeNvidiaDeps): Promise<NvidiaProbeResult> {
  try {
    const result = await deps.runCommand('nvidia-smi', [
      '--query-gpu=name,memory.total,driver_version,compute_cap',
      '--format=csv,noheader',
    ]);
    if (result.exitCode !== 0) {
      return { available: false, devices: [] };
    }
    const parsed = parseNvidiaSmiCsv(result.stdout);
    return {
      available: parsed.devices.length > 0,
      devices: parsed.devices,
      driverVersion: parsed.driverVersion,
      cudaVersion: parsed.cudaVersion,
    };
  } catch {
    return { available: false, devices: [] };
  }
}
```

- [ ] **Step 5: Run; expect pass.**

```bash
pnpm -F @team-x/local-gguf-runtime test -- nvidia.test.ts
```

- [ ] **Step 6: Commit.**

```bash
git add packages/local-gguf-runtime/src/gpu-probe/nvidia.ts packages/local-gguf-runtime/src/gpu-probe/nvidia.test.ts
git commit -m "$(cat <<'EOF'
feat(local-gguf): add NVIDIA GPU probe via nvidia-smi CSV parsing

probeNvidia(deps) runs nvidia-smi --query-gpu CSV mode through an
injectable runCommand dep (mockable for tests, real shell-out in
production). parseNvidiaSmiCsv is exported separately for unit
testing against S2 spike fixtures. Returns available=false on any
non-zero exit, timeout, or unparsable output — non-fatal probe.

Implements spec § 12.1 NVIDIA path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

#### 8b: ROCm probe (`rocm.ts`)

Repeat the pattern. Parser handles `rocminfo` text output. The S2 fixture has the format:

```
Marketing Name:          AMD Radeon RX 7900 XTX
Size:                    24560 MB
```

Parser extracts `(name, vramMb)` pairs from `Marketing Name:` and `Size:` lines.

Test covers: single GPU, multiple GPUs, missing-tool exit, malformed output. Production module follows the same dep-injection pattern as `probeNvidia`.

Commit message:

```
feat(local-gguf): add ROCm GPU probe via rocminfo text parsing

probeRocm(deps) runs rocminfo and extracts Marketing Name + Size
pairs per GPU agent. Non-fatal on missing rocminfo (Windows
without ROCm SDK / Linux without rocm-smi installed). Skips system
HSA agents (the host CPU is also enumerated by rocminfo); only
returns devices with vendor 'AMD'.

Implements spec § 12.1 ROCm path.
```

#### 8c: Vulkan probe (`vulkan.ts`)

Parser handles `vulkaninfo --summary` output. Reads "GPU N:" blocks and extracts `deviceName` and `deviceType`. Filters out discrete software renderers (e.g. SwiftShader, llvmpipe) — we want hardware adapters only.

```
feat(local-gguf): add Vulkan GPU probe via vulkaninfo --summary

probeVulkan(deps) runs vulkaninfo --summary and extracts GPU
adapter blocks. Filters software renderers (llvmpipe, SwiftShader)
which are present on systems without hardware GPUs and would
otherwise cause Vulkan to be ranked above CPU when it shouldn't be.

Implements spec § 12.1 Vulkan fallback path.
```

#### 8d: Metal probe (`metal.ts`)

Parser handles `system_profiler SPDisplaysDataType` output (Mac only). Returns the GPU name and VRAM. Apple Silicon has unified memory — VRAM = some fraction of system RAM; we report total system RAM as the VRAM ceiling and let auto-tune handle the safety margin.

```
feat(local-gguf): add Metal GPU probe via system_profiler

probeMetal(deps) runs system_profiler SPDisplaysDataType and
extracts Chipset Model + VRAM. On Apple Silicon (M1/M2/M3 etc.)
VRAM is unified memory; reports total system RAM as the available
VRAM and trusts the autoTune VRAM_SAFETY (0.85) to keep things
sane. macOS only — returns available=false on win32/linux.

Implements spec § 12.1 Metal path.
```

#### 8e: CPU probe (`cpu.ts`)

Simplest: just `os.cpus().length` for physical cores (or `physicalCpuCount` from `node:os` if available) and `os.totalmem()` for system RAM.

```ts
// packages/local-gguf-runtime/src/gpu-probe/cpu.ts
import { cpus, totalmem } from 'node:os';

export interface CpuProbeResult {
  cores: number;
  ramMb: number;
}

export function probeCpu(): CpuProbeResult {
  return {
    cores: cpus().length,
    ramMb: Math.floor(totalmem() / (1024 * 1024)),
  };
}
```

Test: assert `cores >= 1` and `ramMb > 0`.

```
feat(local-gguf): add CPU probe via node:os

probeCpu() returns { cores, ramMb } from os.cpus() and os.totalmem().
Synchronous (no shell-out, no timeout). Always returns a result —
never throws. This is the floor of the backend ranking.
```

---

### Task 9: GPU probe ranking + orchestrator

- [ ] **Step 1: Write `ranking.test.ts` covering all 5 ranking cases from spec § 12.2.**

NVIDIA → cuda > vulkan > cpu. AMD+ROCm → rocm > vulkan > cpu. Intel/AppleSilicon/AMD-no-ROCm → vulkan > cpu. macOS → metal. No GPU → cpu.

- [ ] **Step 2: Implement `ranking.ts`** to take a `GpuInventory` and return an ordered `GpuBackend[]`.

- [ ] **Step 3: Commit.**

- [ ] **Step 4: Write `probe.test.ts` for the orchestrator that runs all 5 probes in parallel and merges into a `GpuInventory`.**

- [ ] **Step 5: Implement `probe.ts`.**

```ts
// packages/local-gguf-runtime/src/gpu-probe/probe.ts
import type { GpuInventory } from '@team-x/shared-types';
import { probeNvidia } from './nvidia';
import { probeRocm } from './rocm';
import { probeVulkan } from './vulkan';
import { probeMetal } from './metal';
import { probeCpu } from './cpu';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

async function defaultRunCommand(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => proc.kill('SIGKILL'), 3000);
    proc.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? -1 });
    });
    proc.on('error', (e) => {
      clearTimeout(timer);
      resolve({ stdout: '', stderr: e.message, exitCode: -1 });
    });
  });
}

export async function probeGpu(): Promise<GpuInventory> {
  const cpuResult = probeCpu();
  const deps = { runCommand: defaultRunCommand, timeoutMs: 3000 };
  const [nvidia, rocm, vulkan, metal] = await Promise.all([
    probeNvidia(deps),
    probeRocm(deps),
    probeVulkan(deps),
    probeMetal(deps),
  ]);
  return {
    detectedAt: Date.now(),
    cuda: { available: nvidia.available, devices: nvidia.devices, driverVersion: nvidia.driverVersion, cudaVersion: nvidia.cudaVersion },
    rocm: { available: rocm.available, devices: rocm.devices, rocmVersion: rocm.rocmVersion },
    vulkan: { available: vulkan.available, devices: vulkan.devices },
    metal: { available: metal.available, devices: metal.devices },
    cpu: { cores: cpuResult.cores, ramMb: cpuResult.ramMb },
  };
}
```

- [ ] **Step 6: Write `probe.integration.test.ts`** that runs `probeGpu()` against real OS and asserts shape:

```ts
import { describe, expect, it } from 'vitest';
import { probeGpu } from './probe';

describe('probeGpu (integration)', () => {
  it('returns a GpuInventory shape regardless of hardware', async () => {
    const inv = await probeGpu();
    expect(typeof inv.detectedAt).toBe('number');
    expect(inv.cpu.cores).toBeGreaterThanOrEqual(1);
    expect(inv.cpu.ramMb).toBeGreaterThan(0);
    expect(Array.isArray(inv.cuda.devices)).toBe(true);
    expect(Array.isArray(inv.rocm.devices)).toBe(true);
    expect(Array.isArray(inv.vulkan.devices)).toBe(true);
    expect(Array.isArray(inv.metal.devices)).toBe(true);
  }, 15000);
});
```

- [ ] **Step 7: Commit.**

```bash
git add packages/local-gguf-runtime/src/gpu-probe/ranking.ts packages/local-gguf-runtime/src/gpu-probe/ranking.test.ts packages/local-gguf-runtime/src/gpu-probe/probe.ts packages/local-gguf-runtime/src/gpu-probe/probe.test.ts packages/local-gguf-runtime/src/gpu-probe/probe.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(local-gguf): GPU probe ranking + orchestrator + integration test

rankBackends(inventory) returns the ordered preference list per spec § 12.2:
  - NVIDIA + CUDA ≥ 11 → cuda > vulkan > cpu
  - AMD + ROCm → rocm > vulkan > cpu
  - Intel / AppleSilicon / AMD without ROCm → vulkan > cpu
  - macOS → metal (no choice; we don't ship the others on macOS)
  - No GPU → cpu

probeGpu() orchestrates all 5 probes in parallel with a 3 s per-probe
timeout, merges into a GpuInventory. Integration test runs against
real OS in CI per OS leg, asserts shape only (concrete devices vary).

Implements spec § 12.1 + § 12.2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: ServerLifecycle module (TDD + integration)

**Files:**
- Create: `packages/local-gguf-runtime/src/runtime/server-lifecycle.ts`
- Create: `packages/local-gguf-runtime/src/runtime/server-lifecycle.test.ts`
- Create: `packages/local-gguf-runtime/src/runtime/server-lifecycle.integration.test.ts`

ServerLifecycle owns the spawn-to-ready-to-stop loop. Returns a `ServerHandle` with `port`, `pid`, `baseUrl`, `waitReady`, `stop`, `onCrash`.

- [ ] **Step 1: Write the unit test** with a mocked `spawn` function:

```ts
// packages/local-gguf-runtime/src/runtime/server-lifecycle.test.ts
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { spawnServer, ServerLifecycleError } from './server-lifecycle';

function makeFakeProc() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    pid: number;
    kill: (sig?: string) => boolean;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.pid = 12345;
  proc.kill = vi.fn().mockReturnValue(true);
  return proc;
}

describe('spawnServer', () => {
  it('resolves to a ServerHandle once the ready-line appears', async () => {
    const fakeProc = makeFakeProc();
    const fakeSpawn = vi.fn().mockReturnValue(fakeProc);

    const promise = spawnServer({
      binaryPath: '/x/server',
      modelPath: '/m.gguf',
      port: 50000,
      nCtx: 4096,
      nGpuLayers: 35,
      nBatch: 512,
      nThreads: 8,
      spawnFn: fakeSpawn as never,
      readyTimeoutMs: 5000,
    });

    // Simulate ready line on stdout
    setImmediate(() => {
      fakeProc.stdout.emit('data', Buffer.from('HTTP server listening on 127.0.0.1:50000\n'));
    });

    const handle = await promise;
    expect(handle.port).toBe(50000);
    expect(handle.pid).toBe(12345);
    expect(handle.baseUrl).toBe('http://127.0.0.1:50000');
    expect(fakeSpawn).toHaveBeenCalledWith('/x/server', expect.arrayContaining(['-m', '/m.gguf', '--port', '50000']), expect.any(Object));
  });

  it('rejects with ServerLifecycleError(server-spawn-failed) when ready-line never arrives', async () => {
    const fakeProc = makeFakeProc();
    const fakeSpawn = vi.fn().mockReturnValue(fakeProc);

    const promise = spawnServer({
      binaryPath: '/x/server',
      modelPath: '/m.gguf',
      port: 50000,
      nCtx: 4096,
      nGpuLayers: 35,
      nBatch: 512,
      nThreads: 8,
      spawnFn: fakeSpawn as never,
      readyTimeoutMs: 50,
    });

    setImmediate(() => {
      fakeProc.stderr.emit('data', Buffer.from('CUDA OOM\n'));
    });

    await expect(promise).rejects.toThrowError(ServerLifecycleError);
  });

  it('rejects with server-spawn-failed when proc exits before ready', async () => {
    const fakeProc = makeFakeProc();
    const fakeSpawn = vi.fn().mockReturnValue(fakeProc);

    const promise = spawnServer({
      binaryPath: '/x/server',
      modelPath: '/m.gguf',
      port: 50000,
      nCtx: 4096,
      nGpuLayers: 35,
      nBatch: 512,
      nThreads: 8,
      spawnFn: fakeSpawn as never,
      readyTimeoutMs: 1000,
    });

    setImmediate(() => {
      fakeProc.stderr.emit('data', Buffer.from('failed to load model\n'));
      fakeProc.emit('exit', 1, null);
    });

    await expect(promise).rejects.toMatchObject({ error: { kind: 'server-spawn-failed' } });
  });

  it('handle.stop() sends SIGTERM and resolves on exit', async () => {
    const fakeProc = makeFakeProc();
    const fakeSpawn = vi.fn().mockReturnValue(fakeProc);

    const promise = spawnServer({
      binaryPath: '/x/server',
      modelPath: '/m.gguf',
      port: 50000,
      nCtx: 4096, nGpuLayers: 35, nBatch: 512, nThreads: 8,
      spawnFn: fakeSpawn as never,
      readyTimeoutMs: 5000,
    });
    setImmediate(() => {
      fakeProc.stdout.emit('data', Buffer.from('HTTP server listening on 127.0.0.1:50000\n'));
    });
    const handle = await promise;

    const stopPromise = handle.stop();
    setImmediate(() => fakeProc.emit('exit', 0, null));
    await stopPromise;
    expect(fakeProc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('onCrash fires when process exits after ready (unexpected exit)', async () => {
    const fakeProc = makeFakeProc();
    const fakeSpawn = vi.fn().mockReturnValue(fakeProc);

    const handle = await new Promise<Awaited<ReturnType<typeof spawnServer>>>((res) => {
      const p = spawnServer({
        binaryPath: '/x/server', modelPath: '/m.gguf', port: 50000,
        nCtx: 4096, nGpuLayers: 35, nBatch: 512, nThreads: 8,
        spawnFn: fakeSpawn as never, readyTimeoutMs: 5000,
      });
      setImmediate(() => fakeProc.stdout.emit('data', Buffer.from('HTTP server listening\n')));
      p.then(res);
    });

    const crashInfo = await new Promise<{ exitCode: number | null; stderr: string }>((resolve) => {
      handle.onCrash(resolve);
      setImmediate(() => {
        fakeProc.stderr.emit('data', Buffer.from('sigsegv\n'));
        fakeProc.emit('exit', 139, null);
      });
    });

    expect(crashInfo.exitCode).toBe(139);
    expect(crashInfo.stderr).toContain('sigsegv');
  });
});
```

- [ ] **Step 2: Run; expect fail.**

- [ ] **Step 3: Write the production module.**

```ts
// packages/local-gguf-runtime/src/runtime/server-lifecycle.ts
import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import type { LocalGgufError } from '@team-x/shared-types';

export class ServerLifecycleError extends Error {
  constructor(public readonly error: LocalGgufError) {
    super(`ServerLifecycleError: ${JSON.stringify(error)}`);
    this.name = 'ServerLifecycleError';
  }
}

export interface SpawnServerOptions {
  binaryPath: string;
  modelPath: string;
  port: number;
  nCtx: number;
  nGpuLayers: number;
  nBatch: number;
  nThreads: number;
  flashAttention?: boolean;
  mmap?: boolean;
  mlock?: boolean;
  readyTimeoutMs?: number;
  spawnFn?: typeof nodeSpawn;
  onLog?: (chunk: string, stream: 'stdout' | 'stderr') => void;
}

export interface ServerHandle {
  port: number;
  pid: number;
  baseUrl: string;
  stop: (signal?: 'SIGTERM' | 'SIGKILL') => Promise<void>;
  onCrash: (cb: (info: { exitCode: number | null; stderr: string }) => void) => void;
}

const DEFAULT_READY_TIMEOUT_MS = 60_000;
const READY_LINE_REGEX = /HTTP server listening/i;

export async function spawnServer(opts: SpawnServerOptions): Promise<ServerHandle> {
  const spawnFn = opts.spawnFn ?? nodeSpawn;
  const args = buildArgs(opts);

  const proc = spawnFn(opts.binaryPath, args, { stdio: ['ignore', 'pipe', 'pipe'] }) as ChildProcess;

  let stderrBuf = '';
  let stdoutBuf = '';
  let ready = false;

  proc.stdout?.on('data', (d: Buffer) => {
    const s = d.toString();
    stdoutBuf += s;
    if (opts.onLog) opts.onLog(s, 'stdout');
    if (READY_LINE_REGEX.test(stdoutBuf)) ready = true;
  });
  proc.stderr?.on('data', (d: Buffer) => {
    const s = d.toString();
    stderrBuf += s;
    if (opts.onLog) opts.onLog(s, 'stderr');
  });

  await waitForReadyOrExit(proc, () => ready, () => stderrBuf, opts.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS);

  if (proc.pid === undefined) {
    throw new ServerLifecycleError({ kind: 'server-spawn-failed', exitCode: null, stderr: stderrBuf });
  }

  const crashCallbacks: Array<(info: { exitCode: number | null; stderr: string }) => void> = [];
  let stopped = false;

  proc.on('exit', (code) => {
    if (!stopped) {
      const info = { exitCode: code, stderr: stderrBuf };
      for (const cb of crashCallbacks) cb(info);
    }
  });

  return {
    port: opts.port,
    pid: proc.pid,
    baseUrl: `http://127.0.0.1:${opts.port}`,
    async stop(signal = 'SIGTERM') {
      stopped = true;
      if (proc.exitCode !== null || proc.signalCode !== null) return;
      proc.kill(signal);
      await new Promise<void>((resolve) => {
        if (proc.exitCode !== null || proc.signalCode !== null) return resolve();
        proc.once('exit', () => resolve());
      });
    },
    onCrash(cb) {
      crashCallbacks.push(cb);
    },
  };
}

function buildArgs(opts: SpawnServerOptions): string[] {
  const args = [
    '-m', opts.modelPath,
    '--host', '127.0.0.1',
    '--port', String(opts.port),
    '-c', String(opts.nCtx),
    '-ngl', String(opts.nGpuLayers),
    '-b', String(opts.nBatch),
    '-t', String(opts.nThreads),
  ];
  if (opts.flashAttention) args.push('--flash-attn');
  if (opts.mmap === false) args.push('--no-mmap');
  if (opts.mlock) args.push('--mlock');
  return args;
}

function waitForReadyOrExit(
  proc: ChildProcess,
  isReady: () => boolean,
  stderrSnap: () => string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let exitCode: number | null = null;
    let exited = false;
    proc.on('exit', (code) => {
      exitCode = code;
      exited = true;
    });
    const interval = setInterval(() => {
      if (isReady()) {
        clearInterval(interval);
        clearTimeout(timeoutHandle);
        resolve();
      } else if (exited) {
        clearInterval(interval);
        clearTimeout(timeoutHandle);
        reject(new ServerLifecycleError({ kind: 'server-spawn-failed', exitCode, stderr: stderrSnap() }));
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        clearTimeout(timeoutHandle);
        try { proc.kill('SIGKILL'); } catch {}
        reject(new ServerLifecycleError({ kind: 'server-spawn-failed', exitCode: null, stderr: stderrSnap() }));
      }
    }, 50);
    const timeoutHandle = setTimeout(() => {
      clearInterval(interval);
      try { proc.kill('SIGKILL'); } catch {}
      reject(new ServerLifecycleError({ kind: 'server-spawn-failed', exitCode: null, stderr: stderrSnap() }));
    }, timeoutMs + 500);
  });
}
```

- [ ] **Step 4: Run; expect pass.**

- [ ] **Step 5: Write the integration test** (uses real CPU binary + TinyLlama-like fixture):

```ts
// packages/local-gguf-runtime/src/runtime/server-lifecycle.integration.test.ts
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnServer } from './server-lifecycle';
import { allocatePort } from './port-allocator';

const BIN = resolve(__dirname, '../../../../apps/desktop/resources/llama-server', process.platform + '-' + process.arch, 'cpu', process.platform === 'win32' ? 'server.exe' : 'server');
const TEST_MODEL = process.env.TEST_GGUF_PATH;
const TEST_INTEGRATION = process.env.RUN_INTEGRATION_TESTS === 'true';

describe.skipIf(!TEST_INTEGRATION || !TEST_MODEL || !existsSync(BIN))('spawnServer (integration, real binary)', () => {
  it('spawns, becomes ready, serves /v1/chat/completions, stops cleanly', async () => {
    const port = await allocatePort();
    const handle = await spawnServer({
      binaryPath: BIN,
      modelPath: TEST_MODEL!,
      port,
      nCtx: 1024,
      nGpuLayers: 0,
      nBatch: 256,
      nThreads: 4,
      readyTimeoutMs: 120_000,
    });
    try {
      const res = await fetch(`${handle.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Say hello.' }], max_tokens: 8 }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.choices?.[0]?.message?.content).toBeTypeOf('string');
    } finally {
      await handle.stop();
    }
  }, 180_000);
});
```

Integration test is gated by `RUN_INTEGRATION_TESTS=true` and `TEST_GGUF_PATH=/path/to/tinyllama.gguf` env vars, so it's opt-in (CI sets these for the nightly leg).

- [ ] **Step 6: Commit.**

```bash
git add packages/local-gguf-runtime/src/runtime/server-lifecycle.ts packages/local-gguf-runtime/src/runtime/server-lifecycle.test.ts packages/local-gguf-runtime/src/runtime/server-lifecycle.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(local-gguf): ServerLifecycle — spawn, wait-ready, stop, onCrash

spawnServer(opts) spawns llama-server with auto-tuned flags, returns
a ServerHandle once the ready-line ("HTTP server listening") is
observed on stdout. Handle exposes baseUrl, stop (SIGTERM with exit
await), onCrash (subscribers fire when proc exits without an
explicit stop). Spawn function is dependency-injected so unit tests
mock without shelling out. Integration test (env-gated) drives a
real CPU-build binary + real GGUF through end-to-end chat.

Implements Spike S4 carry-over + spec § 4.1.1 hybrid runtime.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: LruPool + AutoSwap modules (TDD)

**Files:**
- Create: `packages/local-gguf-runtime/src/pool/lru-pool.ts`
- Create: `packages/local-gguf-runtime/src/pool/lru-pool.test.ts`
- Create: `packages/local-gguf-runtime/src/pool/auto-swap.ts`
- Create: `packages/local-gguf-runtime/src/pool/auto-swap.test.ts`

LruPool tracks `Map<modelId, ServerHandle>` with `maxConcurrent`. On `acquire(modelId, loadFn)`: if cached, bump LRU + return; if pool full, evict oldest (call `stop()`); call `loadFn(modelId)` for the new entry. On `release(modelId)`: optional explicit unload.

- [ ] **Step 1: Write `lru-pool.test.ts`** covering: acquire-empty, acquire-cached, eviction-on-full, setMaxConcurrent shrink-evicts, release, status snapshot.

- [ ] **Step 2: Run; expect fail.**

- [ ] **Step 3: Implement `lru-pool.ts`.**

```ts
// packages/local-gguf-runtime/src/pool/lru-pool.ts
import type { ServerHandle } from '../runtime/server-lifecycle';
import type { LocalGgufError } from '@team-x/shared-types';

export class LruPoolError extends Error {
  constructor(public readonly error: LocalGgufError) {
    super(`LruPoolError: ${JSON.stringify(error)}`);
    this.name = 'LruPoolError';
  }
}

export interface LruPoolDeps {
  loadModel: (modelId: string) => Promise<ServerHandle>;
}

export interface LoadedEntry {
  modelId: string;
  handle: ServerHandle;
  loadedAt: number;
  lastAccessedAt: number;
}

export interface LruPool {
  acquire(modelId: string): Promise<ServerHandle>;
  release(modelId: string): Promise<void>;
  setMaxConcurrent(n: number): Promise<void>;
  getStatus(): { loaded: LoadedEntry[]; maxConcurrent: number };
  shutdownAll(): Promise<void>;
}

export function createLruPool(deps: LruPoolDeps, initialMax: number): LruPool {
  if (initialMax < 1) throw new Error('maxConcurrent must be ≥ 1');
  let maxConcurrent = initialMax;
  const entries = new Map<string, LoadedEntry>();
  const inFlight = new Map<string, Promise<ServerHandle>>();

  async function evictOldest() {
    let oldest: LoadedEntry | null = null;
    for (const e of entries.values()) {
      if (!oldest || e.lastAccessedAt < oldest.lastAccessedAt) oldest = e;
    }
    if (oldest) {
      entries.delete(oldest.modelId);
      try { await oldest.handle.stop(); } catch { /* swallow — best effort */ }
    }
  }

  async function ensureCapacity() {
    while (entries.size >= maxConcurrent) {
      await evictOldest();
    }
  }

  return {
    async acquire(modelId) {
      const existing = entries.get(modelId);
      if (existing) {
        existing.lastAccessedAt = Date.now();
        return existing.handle;
      }
      const pending = inFlight.get(modelId);
      if (pending) return pending;

      const loadPromise = (async () => {
        await ensureCapacity();
        const handle = await deps.loadModel(modelId);
        const entry: LoadedEntry = {
          modelId,
          handle,
          loadedAt: Date.now(),
          lastAccessedAt: Date.now(),
        };
        entries.set(modelId, entry);
        inFlight.delete(modelId);
        return handle;
      })();
      inFlight.set(modelId, loadPromise);
      try {
        return await loadPromise;
      } catch (e) {
        inFlight.delete(modelId);
        throw e;
      }
    },
    async release(modelId) {
      const entry = entries.get(modelId);
      if (!entry) return;
      entries.delete(modelId);
      try { await entry.handle.stop(); } catch { /* best effort */ }
    },
    async setMaxConcurrent(n) {
      if (n < 1) throw new LruPoolError({ kind: 'pool-full', current: entries.size, max: n });
      maxConcurrent = Math.floor(n);
      while (entries.size > maxConcurrent) await evictOldest();
    },
    getStatus() {
      return {
        loaded: Array.from(entries.values()).map((e) => ({ ...e })),
        maxConcurrent,
      };
    },
    async shutdownAll() {
      const all = Array.from(entries.values());
      entries.clear();
      await Promise.all(all.map((e) => e.handle.stop().catch(() => undefined)));
    },
  };
}
```

- [ ] **Step 4: Run; pass.**

- [ ] **Step 5: Commit.**

```
feat(local-gguf): LruPool with eviction, in-flight dedup, shutdown
```

- [ ] **Step 6: Write `auto-swap.test.ts` + `auto-swap.ts`** — a small wrapper that just calls `pool.acquire(modelId)` (which already swaps via eviction). This file documents the public auto-swap policy used by the chat adapter:

```ts
// packages/local-gguf-runtime/src/pool/auto-swap.ts
import type { LruPool } from './lru-pool';
import type { ServerHandle } from '../runtime/server-lifecycle';

export interface AutoSwapPolicy {
  resolveOrLoad(modelId: string): Promise<ServerHandle>;
}

export function createAutoSwapPolicy(pool: LruPool): AutoSwapPolicy {
  return {
    resolveOrLoad(modelId) {
      // The pool's acquire already implements LRU-eviction-on-demand.
      // This indirection documents the policy as a stable interface
      // the provider-router adapter consumes (Phase 4).
      return pool.acquire(modelId);
    },
  };
}
```

Test asserts the policy delegates correctly. Commit.

---

### Task 12: Wire RuntimeService + PoolService in main process

**Files:**
- Create: `apps/desktop/src/main/services/local-gguf/runtime-service.ts`
- Create: `apps/desktop/src/main/services/local-gguf/runtime-service.test.ts`
- Create: `apps/desktop/src/main/services/local-gguf/pool-service.ts`
- Create: `apps/desktop/src/main/services/local-gguf/pool-service.test.ts`

`RuntimeService` orchestrates: probe GPU on boot → persist active backend → resolve binary path → expose to handlers.

`PoolService` wraps the LruPool with a `loadModel(modelId)` callback that pulls the model row from the repo, fetches advanced-params (or auto-tunes), allocates a port, and calls `spawnServer`.

- [ ] **Step 1: TDD each service.** Standard pattern.

- [ ] **Step 2: Implement runtime-service.ts** (boots the probe, persists settings, exposes `getInventory()`, `getActiveBackend()`, `getBinaryPathForActiveBackend()`).

- [ ] **Step 3: Implement pool-service.ts** (depends on runtime-service for binary path, local-models repo for row lookup, local-model-advanced-params for overrides, auto-tune for fallback).

- [ ] **Step 4: Commit each separately.**

---

### Task 13: Replace IPC stubs with real implementations

**Files:**
- Modify: `apps/desktop/src/main/ipc/local-gguf-runtime-handlers.ts`
- Modify: `apps/desktop/src/main/ipc/local-gguf-runtime-handlers.test.ts`
- Modify: `apps/desktop/src/main/index.ts` (pass real dependencies)

- [ ] **Step 1: Update the test** to expect real behavior (return shapes, not throws):

```ts
it('localGguf.runtime.gpuInventory returns a GpuInventory', async () => {
  const fakeRuntimeService = {
    getInventory: async () => ({ /* canned GpuInventory */ } as GpuInventory),
    getActiveBackend: async () => 'cuda',
    reprobeGpu: async () => ({ /* canned */ } as GpuInventory),
    getSettings: async () => DEFAULT_LOCAL_GGUF_SETTINGS,
    setSettings: async (p) => ({ ...DEFAULT_LOCAL_GGUF_SETTINGS, ...p }),
    getBinariesVersion: async () => 'b4321',
  };
  // ... register handlers with this dep ...
  // ... invoke + assert ...
});
```

Cover every channel: `gpuInventory`, `reprobeGpu`, `settings`, `setSettings`, `binariesVersion`, `pool.status`, `pool.load`, `pool.unload`, `pool.setMaxConcurrent`.

- [ ] **Step 2: Implement the real handlers** that thunk to the services.

- [ ] **Step 3: Wire services into the bootstrap** at `apps/desktop/src/main/index.ts`.

- [ ] **Step 4: Commit.**

---

### Task 14: E2E spec — `local-gguf-loading.spec.ts`

**Files:**
- Create: `apps/desktop/e2e/local-gguf-loading.spec.ts`

E2E runs against the **stub backend** Team-X already uses for tests (`__ECHO_AGENT__` precedent). Stub responds to `/v1/chat/completions` with a canned echo so no real GPU is needed in CI.

- [ ] **Step 1: Read existing E2E precedent (smoke.spec.ts) to match patterns.**

```bash
cat apps/desktop/e2e/smoke.spec.ts
```

- [ ] **Step 2: Write the spec.**

```ts
// apps/desktop/e2e/local-gguf-loading.spec.ts
import { test, expect } from '@playwright/test';
import { launchAppForTest } from './helpers/launch';

test('localGguf: list pool status, expects empty pool on boot', async () => {
  const { app, page } = await launchAppForTest();
  try {
    const status = await page.evaluate(() => window.teamXApi.localGguf.pool.status());
    expect(status.loaded).toEqual([]);
    expect(status.maxConcurrent).toBeGreaterThanOrEqual(1);
  } finally {
    await app.close();
  }
});

test('localGguf: runtime settings reflect defaults on a fresh install', async () => {
  const { app, page } = await launchAppForTest();
  try {
    const settings = await page.evaluate(() => window.teamXApi.localGguf.runtime.settings());
    expect(settings.maxConcurrentLocalModels).toBe(1);
    expect(['cuda', 'rocm', 'vulkan', 'metal', 'cpu']).toContain(settings.activeBackend);
  } finally {
    await app.close();
  }
});

test('localGguf: gpu inventory has the expected shape', async () => {
  const { app, page } = await launchAppForTest();
  try {
    const inv = await page.evaluate(() => window.teamXApi.localGguf.runtime.gpuInventory());
    expect(typeof inv.detectedAt).toBe('number');
    expect(inv.cpu.cores).toBeGreaterThanOrEqual(1);
  } finally {
    await app.close();
  }
});
```

- [ ] **Step 3: Run.**

```bash
pnpm -F @team-x/desktop test:e2e -- local-gguf-loading.spec.ts
```

Expected: all green.

- [ ] **Step 4: Commit.**

```
test(e2e): add local-gguf-loading.spec — pool status + runtime settings + GPU inventory smoke
```

---

### Task 15: CHANGELOG + version pin update

```markdown
## [Unreleased]

### Added
- **Local & Networked GGUF Support (Phase 2 — Runtime + Pool)**: bundled
  multi-backend llama.cpp binaries (CUDA + ROCm + Vulkan + Metal + CPU)
  fetched at install + CI time via deterministic SHA manifest. New
  modules: BinaryResolver (platform×backend→path), PortAllocator
  (random ephemeral-range with bind-check), AutoTune (n_ctx/n_gpu_layers/
  n_batch/n_threads/sampling), GPU probe (5 backends in parallel with
  3 s timeouts), backend ranking (CUDA>Vulkan>CPU for NVIDIA;
  ROCm>Vulkan>CPU for AMD; etc.), ServerLifecycle (spawn → wait-ready
  → stop with onCrash subscribers), LruPool (default 1 concurrent,
  VRAM-aware eviction, in-flight dedup, shutdown-all), AutoSwapPolicy
  (wraps the pool for the chat adapter). All `localGguf.runtime.*` and
  `localGguf.pool.*` IPC stubs from Phase 1 replaced with real
  implementations backed by RuntimeService and PoolService.
- Installer size delta: +250–450 MB per OS depending on the bundled
  backends. Documented in installer release notes.
```

- [ ] **Step 1: Append the entry above to `CHANGELOG.md`.**

- [ ] **Step 2: Commit.**

```
chore(release): Phase 2 CHANGELOG entry
```

---

### Task 16: Quality gate (full checklist) — per master plan § CR-6 + CR-7

Run every item from the master plan blocking quality gate. Same step structure as Phase 1 Task 17 — typecheck, lint, test (≥ 90% coverage on new code in this package), E2E, audit, autonomy, perf assertion, security review (subprocess spawn surface is the new attack surface — argument injection review on every `spawnServer` call site, no shell strings).

Phase-specific performance assertions:

- GPU probe completes in < 5 s total (parallel 3 s per probe).
- AutoTune computation < 5 ms.
- Port allocator success rate ≥ 95% within 10 attempts on a normal box.
- Stub-mode `spawnServer` (test-only) returns a `ServerHandle` within 200 ms.

Each assertion lives as a test in the relevant module's test file. Coverage must include them.

---

### Task 17: Open PR

```bash
git push -u origin feat/v3.3.0-phase-02-runtime-pool
gh pr create --base main --head feat/v3.3.0-phase-02-runtime-pool \
  --title "feat(v3.3.0): Phase 2 — Runtime + Pool (binary bundling, GPU probe, llama-server lifecycle, LRU pool)" \
  --body "<PR body matching Phase 1 Task 18 pattern; include the spec coverage map + the Stage 1–4 review wall checkboxes + Codex Stage 3 mandated for subprocess spawn surface>"
```

Stages 2 + 3 + 4 same as Phase 1.

---

## Phase 2 — Spec coverage map

| Spec section | Implemented by |
|---|---|
| § 4.1.1 hybrid inference | Tasks 5, 6, 10 (lifecycle) |
| § 4.1.3 GPU backend matrix | Tasks 5, 8, 9 |
| § 4.1.4 LRU pool | Task 11 |
| § 11.1 binary fetch pipeline | Tasks 2, 3, 4 |
| § 11.2 installer size impact | Task 15 (CHANGELOG documentation) |
| § 12.1 GPU probe per backend | Task 8 |
| § 12.2 backend ranking | Task 9 |
| § 12.3 health check / fallback | Task 12 (RuntimeService) |
| § 12.4 auto-tune at import | Task 7 |
| § 15 LocalGgufError variants `binary-not-found`, `binary-unsupported`, `gpu-probe-failed`, `oom-runtime`, `server-spawn-failed`, `server-crashed`, `port-exhausted`, `pool-full` | Tasks 5, 6, 10, 11, 12 |

Phases 1 and 2 together complete all runtime + storage infrastructure. Phase 3 (Library + Scanning) layers GGUF metadata parsing + library CRUD + folder watching + network resilience on top.
