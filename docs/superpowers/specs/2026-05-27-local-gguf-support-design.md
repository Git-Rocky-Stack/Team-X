# Local & Networked GGUF Support — Design Spec

| Field | Value |
|---|---|
| **Status** | Draft — awaiting Rocky's review |
| **Owner** | Rocky Elsalaymeh |
| **Date** | 2026-05-27 |
| **Authored via** | `/superpowers:brainstorming` |
| **Next step** | `/superpowers:writing-plans` |
| **Target release** | v3.3.0 (beta first) |
| **Repo** | `Git-Rocky-Stack/Team-X` (MIT, public) |
| **Migration ID** | `0014_local_gguf` (next after `0013`) |

---

## 1. Goal

Let Team-X users with GPU hardware directly import, register, and use their own GGUF-format LLMs — from local files, network-mounted shares (NAS / UNC / SMB), or LAN-hosted inference endpoints — without leaving the app. Open-source model evolution moves faster than Team-X can ship app updates; this feature shifts the model surface from a fixed adapter list to a user-owned library that always tracks the bleeding edge.

A single user-visible sentence: **"You point Team-X at a GGUF file, folder, or LAN endpoint — and it just works."**

## 2. Background & motivation

Team-X v3.2.1 supports ten LLM providers including Ollama (HTTP, local) and an `openai-compat` wildcard adapter. Local inference today requires the user to operate Ollama as a separate process *and* author a Modelfile (`ollama create -f`) for every raw GGUF they want to run. That is friction: the GGUF ecosystem (TheBloke, bartowski, lmstudio-community, the model authors themselves) moves weekly, and users with high-end GPUs want zero-friction access to whatever they've downloaded.

The open-source power-user audience also operates *across* their network — GGUFs sit on a NAS, inference runs on a workstation GPU, sometimes another machine on the LAN hosts a llama.cpp-server or LM Studio instance. Today, Team-X has no first-class model for any of that.

This spec closes the gap with a hybrid architecture: bundle a multi-backend `llama.cpp-server` binary set the app manages on the user's behalf for local-file GGUFs, and also let users register remote OpenAI-compatible endpoints for LAN inference. Both paths converge in a single unified library surface.

## 3. Glossary

| Term | Meaning |
|---|---|
| **GGUF** | The "GPT-Generated Unified Format" used by llama.cpp for quantized model weights. Self-describing binary format with embedded metadata (architecture, parameter count, quantization, context length, chat template, etc.). |
| **llama.cpp-server** | The `server` binary shipped by [ggerganov/llama.cpp](https://github.com/ggerganov/llama.cpp) that exposes OpenAI-compatible `/v1/chat/completions` and `/v1/embeddings` over HTTP. |
| **Backend** | The GPU/CPU acceleration target a llama.cpp binary was compiled against — CUDA, ROCm, Vulkan, Metal, or pure CPU. |
| **Pool** | The set of currently-loaded GGUF models, each backed by its own llama-server subprocess on its own localhost port, governed by an LRU eviction policy. |
| **Endpoint** | A remote OpenAI-compatible HTTP service on the LAN (LM Studio, Ollama, another llama-server, KoboldCPP, vLLM) registered in the library. |
| **Library** | The unified, user-facing collection of models, regardless of whether they're backed by a local file, a folder-watch entry, or a remote endpoint. |
| **Spike** | A time-boxed (≤ 1 day) investigation branched off `main`, exists to validate one specific assumption, produces a writeup, concludes with go/no-go. |

## 4. Scope

### 4.1 In scope (v1)

**Core:**

1. **Hybrid inference architecture.** Bundled multi-backend `llama.cpp-server` subprocess for local files; OpenAI-compatible HTTP for remote LAN endpoints.
2. **Unified intake.** Single-file picker (incl. multi-part split GGUFs), folder scan + auto-watch (local + UNC/SMB), manual remote endpoint registration.
3. **Full GPU backend matrix.** CUDA (NVIDIA), ROCm (AMD), Vulkan (cross-vendor fallback), Metal (Apple), CPU (final fallback) — runtime auto-detect with manual override.
4. **LRU concurrency pool.** Default 1 active model, user-configurable cap (VRAM-aware), auto-swap on agent request for non-loaded model.
5. **Tiered per-model controls.** Auto-tuned safe defaults at import time; expandable Advanced panel exposes `n_ctx`, `n_gpu_layers`, `n_batch`, `n_threads`, sampling params, `mmap`, `mlock`, `flash_attention`; reset-to-auto button.

**Tier-1 power-user add-ons (rolled in):**

6. **Hugging Face Hub browser + downloader.** In-app search, filter, model card preview, one-click download with resume, SHA verification, downloads land in a configured library folder.
7. **GPU offload visualizer + VRAM budget.** Live per-layer offload bar with `n_gpu_layers` slider that re-projects VRAM use in real time.
8. **VRAM/RAM headroom guard.** Pre-flight prediction blocks model loads that would OOM the GPU; soft warning for marginal cases.
9. **Chat-template auto-detect + per-model override.** Read `tokenizer.chat_template` from GGUF metadata; allow override per model.
10. **Per-model system-prompt override.** Per-library-row text field, applied before the system prompt the orchestrator/role would normally inject.
11. **Tool-calling / MCP capability badge + gating.** Detect tool-trained models from metadata + curated list; gate MCP tool injection in `provider-router` accordingly.
12. **Local embedding models.** Extend `@team-x/intelligence/rag/embeddings.ts` to route through `local-gguf-embed` for embedding-class GGUFs.
13. **Per-model benchmark runner.** Canned 200-token prompt × 3, reports `prompt-eval tok/s`, `gen tok/s`, `TTFT`, `VRAM peak`, persists per model.

**Tier-2 item rolled in (non-negotiable for production quality):**

14. **Network-share resilience.** Source-disappearance (NAS offline, share unmounted) is a graceful state, not a crash; 30s exponential-backoff poll auto-recovers when the source returns.

### 4.2 Out of scope (deferred — v2 enhancement spec)

| Deferred feature | Why deferred |
|---|---|
| Per-role / per-employee model pinning | Touches the orchestrator + role schema; large enough to warrant its own spec. |
| Arena (side-by-side multi-model comparison) | UX-heavy; v2 polish item. |
| Speculative decoding (draft + target pairs) | Requires multi-model-loaded pairing semantics; defer. |
| Bring-your-own llama.cpp binary | Power-user knob; defer to v2. |
| Multi-GPU tensor split | Small audience; defer. |
| Quantization-on-import (`llama-quantize`) | Niche; defer. |
| In-app GGUF inspector | Debug surface; defer. |
| KV-cache session persistence | Finicky; defer. |
| Server-mode export (Team-X as LAN inference host) | Inverts the model — separate product surface. |
| Model tags / collections | Library-organization sugar; defer. |
| License badge surfacing | Defer. |
| In-app CLI | This is **Feature B**, a separate brainstorm + spec + plan cycle. The GGUF IPC contracts in this spec will be CLI-ready so Feature B requires zero refactor. |

## 5. Architecture overview

```
                          ┌─────────────────────────────────────────┐
                          │  Renderer (React 19 + Tailwind)         │
                          │  features/local-gguf/                   │
                          │    LibraryView · ModelCard · HFBrowser  │
                          │    Settings · BenchmarkPanel            │
                          │    GpuOffloadVisualizer                 │
                          └────────────────┬────────────────────────┘
                                           │ typed IPC (preload)
                          ┌────────────────▼────────────────────────┐
                          │  Main process                           │
                          │  services/local-gguf/                   │
                          │    library-service  (scan/watch/CRUD)   │
                          │    runtime-service  (server lifecycle)  │
                          │    pool-service     (LRU concurrency)   │
                          │    hf-service       (HF Hub client)     │
                          │    benchmark-service                    │
                          │    gpu-probe                            │
                          └────┬───────────────────────────┬────────┘
                               │                           │
                  spawns/manages                 talks via OpenAI-compat HTTP
                               │                           │
                  ┌────────────▼──────────┐    ┌───────────▼────────────┐
                  │ llama.cpp-server      │    │ Remote LAN endpoints   │
                  │ (subprocess per       │    │ (LM Studio · Ollama ·  │
                  │  loaded model, on a   │    │  custom llama-server)  │
                  │  random localhost port│    └────────────────────────┘
                  │  selected from a pool)│
                  └───────────────────────┘
```

Two key architectural invariants:

- **The provider-router never knows whether a `local-gguf` model is backed by a local subprocess or a remote endpoint.** It receives a resolved base URL from the pool/endpoint registry and a model id. This keeps the orchestrator and agentic loop unchanged.
- **The renderer makes zero direct calls to llama-server.** All IPC, even for advanced controls and benchmark runs, goes through the typed preload bridge. Same posture as every other Team-X subsystem.

## 6. Package structure

```
packages/
├── local-gguf-runtime/       ← NEW
│   src/
│     library/                ← scan, folder-watch, multi-part GGUF
│     runtime/                ← llama-server lifecycle, port allocator
│     pool/                   ← LRU pool, eviction logic
│     gpu-probe/              ← cross-platform GPU detection
│     hf-client/              ← Hugging Face Hub API client
│     benchmark/              ← canned-prompt benchmark
│     metadata/               ← GGUF binary parser
│     errors.ts               ← LocalGgufError discriminated union
│     index.ts
│
├── provider-router/          ← EXTEND
│   src/adapters/
│     local-gguf.ts           ← NEW chat adapter (OpenAI-compat over resolved URL)
│     local-gguf-embed.ts     ← NEW embeddings adapter
│
├── intelligence/             ← EXTEND
│   src/rag/embeddings.ts     ← add local-gguf-embed path
│
└── shared-types/             ← EXTEND
    src/
      local-gguf.ts           ← NEW IPC contracts, GGUF metadata types,
                                  LocalGgufError export, pool/library entities

apps/desktop/
└── src/
    ├── main/
    │   ├── services/local-gguf/   ← NEW (thin wrappers + IPC handlers)
    │   ├── ipc/
    │   │   ├── local-gguf-library-handlers.ts    ← NEW
    │   │   ├── local-gguf-runtime-handlers.ts    ← NEW
    │   │   ├── local-gguf-hf-handlers.ts         ← NEW
    │   │   ├── local-gguf-benchmark-handlers.ts  ← NEW
    │   │   └── local-gguf-endpoint-handlers.ts   ← NEW
    │   └── db/
    │       ├── migrations/0014_local_gguf.sql    ← NEW
    │       └── repos/
    │           ├── local-models.ts               ← NEW
    │           ├── local-model-advanced-params.ts ← NEW
    │           ├── local-model-benchmarks.ts     ← NEW
    │           ├── local-model-endpoints.ts      ← NEW
    │           └── local-model-watch-folders.ts  ← NEW
    │
    ├── preload/                                  ← extend TeamXApi
    │
    ├── renderer/src/
    │   ├── features/local-gguf/                  ← NEW
    │   │   ├── LibraryView.tsx
    │   │   ├── ModelCard.tsx
    │   │   ├── HfBrowser.tsx
    │   │   ├── HfDownloadStrip.tsx
    │   │   ├── AdvancedPanel.tsx
    │   │   ├── GpuOffloadVisualizer.tsx
    │   │   ├── BenchmarkPanel.tsx
    │   │   ├── EndpointsTab.tsx
    │   │   ├── FoldersTab.tsx
    │   │   ├── RuntimeTab.tsx
    │   │   └── settings-local-models-page.tsx
    │   └── hooks/
    │       ├── use-local-models.ts
    │       ├── use-local-model-pool.ts
    │       ├── use-hf-search.ts
    │       └── use-hf-downloads.ts
    │
    └── resources/llama-server/                   ← NEW (vendored binaries)
```

`@team-x/local-gguf-runtime` exists as a separate package (not in `apps/desktop/src/main/services/`) because (a) its functionality is pure Node — no Electron deps — so it's unit-testable in vitest without spinning the app, (b) it isolates the binary-bundling concern, and (c) the eventual CLI in Feature B can depend on it directly.

## 7. Data model — migration `0014_local_gguf`

Five new tables. All `id` columns are `TEXT PRIMARY KEY` populated with `uuid` (matching the existing Team-X convention). Timestamps are `INTEGER NOT NULL` epoch-ms. Foreign keys with `ON DELETE CASCADE` where row death cascades sensibly.

```sql
-- 1. The library: every model the user has registered, of any source type.
CREATE TABLE local_models (
  id                       TEXT PRIMARY KEY,
  display_name             TEXT NOT NULL,
  source_type              TEXT NOT NULL CHECK (source_type IN
                              ('file', 'folder-entry', 'remote-endpoint')),
  source_path              TEXT,                  -- file path or folder entry path
  endpoint_id              TEXT REFERENCES local_model_endpoints(id) ON DELETE CASCADE,
  gguf_arch                TEXT,                  -- e.g. 'llama', 'mistral', 'qwen2'
  gguf_params_b            REAL,                  -- billions, e.g. 7.0, 13.0, 70.6
  gguf_quant               TEXT,                  -- e.g. 'Q4_K_M', 'Q5_K_M', 'F16'
  gguf_context_max         INTEGER,               -- max context from metadata
  gguf_size_bytes          INTEGER,               -- on-disk file size
  gguf_sha256              TEXT,                  -- nullable; populated for HF downloads
  gguf_chat_template       TEXT,                  -- raw chat_template from metadata
  is_embedding_model       INTEGER NOT NULL DEFAULT 0 CHECK (is_embedding_model IN (0, 1)),
  is_tool_capable          INTEGER NOT NULL DEFAULT 0 CHECK (is_tool_capable IN (0, 1)),
  hf_repo_id               TEXT,                  -- e.g. 'bartowski/Llama-3.1-70B-Instruct-GGUF'
  hf_filename              TEXT,                  -- the specific file inside the repo
  license                  TEXT,                  -- detected from metadata or HF card
  chat_template_override   TEXT,                  -- user override (nullable)
  system_prompt_override   TEXT,                  -- user override (nullable)
  status                   TEXT NOT NULL DEFAULT 'cold'
                              CHECK (status IN ('cold', 'loading', 'loaded',
                                                'error', 'unreachable', 'missing')),
  status_detail            TEXT,                  -- last error message or context
  last_used_at             INTEGER,
  created_at               INTEGER NOT NULL,
  updated_at               INTEGER NOT NULL,
  CHECK (
    (source_type = 'file' AND source_path IS NOT NULL AND endpoint_id IS NULL) OR
    (source_type = 'folder-entry' AND source_path IS NOT NULL AND endpoint_id IS NULL) OR
    (source_type = 'remote-endpoint' AND endpoint_id IS NOT NULL AND source_path IS NULL)
  )
);

CREATE INDEX idx_local_models_source_type ON local_models(source_type);
CREATE INDEX idx_local_models_status ON local_models(status);
CREATE INDEX idx_local_models_last_used_at ON local_models(last_used_at);
CREATE INDEX idx_local_models_endpoint_id ON local_models(endpoint_id);

-- 2. Per-model Advanced panel overrides. Singleton row per model.
--    NULL values mean "use auto-tuned default."
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
  backend               TEXT NOT NULL,            -- 'cuda' | 'rocm' | 'vulkan' | 'metal' | 'cpu'
  n_ctx_used            INTEGER NOT NULL,
  n_gpu_layers_used     INTEGER NOT NULL,
  ran_at                INTEGER NOT NULL
);

CREATE INDEX idx_local_model_benchmarks_model_id_ran_at
  ON local_model_benchmarks(model_id, ran_at DESC);

-- 4. Remote LAN endpoints (LM Studio, Ollama, llama-server, KoboldCPP, vLLM).
CREATE TABLE local_model_endpoints (
  id                       TEXT PRIMARY KEY,
  name                     TEXT NOT NULL,
  base_url                 TEXT NOT NULL,         -- e.g. 'http://192.168.1.50:1234'
  auth_header_key_ref      TEXT,                  -- keytar account ref (nullable)
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
  path              TEXT NOT NULL,                -- absolute path or UNC
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

**Runtime settings** (chosen GPU backend, default pool size cap, default library folder, currently selected embedding model id, default HF cache dir) live in the **existing app settings store**, not a new table. They register under a `localGguf` namespace alongside other Team-X runtime settings.

**Files are never copied.** The library registers GGUFs by `source_path`. Backup includes the registry rows; backup does **not** include the GGUF files themselves. Restore on new hardware surfaces `Missing` rows with locate/re-download actions.

## 8. Provider-router integration

Two new adapters in `packages/provider-router/src/adapters/`:

### 8.1 `local-gguf.ts` (chat)

Thin OpenAI-compatible streaming adapter, modeled on `openai-compat.ts`. Differs in three ways:

1. **URL resolution.** Before sending the request, the adapter calls into the pool-service (for `file` and `folder-entry` source-typed models) or reads the endpoint row (for `remote-endpoint` models) to get a live `baseUrl`. If pool lookup forces a load, the adapter awaits the load completion before sending.
2. **Tool gating.** If the model's `is_tool_capable` flag is false, the adapter strips `tools` and `tool_choice` from the outbound request and surfaces a typed warning event that the orchestrator can log (but does NOT fail the call — orchestrator may have already adapted).
3. **Chat-template handling.** If `chat_template_override` is set on the model row, the adapter passes it as `chat_template` in the request body (llama.cpp-server accepts this). Otherwise relies on the server's default behavior (which uses the GGUF-embedded template).

### 8.2 `local-gguf-embed.ts` (embeddings)

Mirror of `ollama-embed.ts`, talking to llama.cpp-server's `/v1/embeddings`. Used only for `local_models` rows where `is_embedding_model = 1`.

### 8.3 Provider registry

`packages/provider-router/src/registry.ts` gets two new entries:

- Provider id `local-gguf`, privacy tier `Local`, cost `$0` per token, supports streaming, supports tools (conditional per model).
- Provider id `local-gguf-embed`, privacy tier `Local`, cost `$0`.

### 8.4 Adaptive routing

`packages/provider-router/src/adaptive-routing.ts` learns about the new providers:

- In `Lean` strategy, `local-gguf` is preferred over cloud providers when at least one model is loaded.
- In `Auto` strategy, `local-gguf` competes on hardware-profile-aware scoring (existing path).
- In `Always-On` strategy, behaves the same as `Lean`.

### 8.5 Cost / telemetry

`telemetry-core` already handles $0-cost providers (Ollama precedent). No changes needed — confirm via existing unit test, no regression.

## 9. RAG integration (local embeddings)

`@team-x/intelligence/src/rag/embeddings.ts` currently delegates to either `openai-embed` or `ollama-embed`. Add a third path:

1. **Detection at import.** When a GGUF lands in the library, the metadata parser flags `is_embedding_model = 1` if `general.architecture` matches one of: `bert`, `nomic-bert`, `xlm-roberta`, `e5`, `bge`, plus any GGUF advertising `general.task = 'feature-extraction'`. Curated list lives in `packages/local-gguf-runtime/src/metadata/embedding-arches.ts` and is testable.
2. **User selection.** Settings → Local Models → Defaults → "Embedding model" dropdown lists embedding-flagged models. Selecting one sets the runtime-settings value.
3. **Routing.** `embeddings.ts` reads runtime settings before dispatching. If a local-gguf-embed model id is configured, route through `local-gguf-embed`. Otherwise existing behavior.
4. **Re-index gate.** Changing the embedding model invalidates all existing embeddings (different vector spaces). The Settings change is an amber confirmation: *"Switching the embedding model will require re-indexing all RAG sources (≈ N minutes for current vault). Continue?"* Confirming queues a background `rag-rebuild` job; the existing `rag-rebuild.ts` service handles the heavy work — we just provide the trigger.

## 10. UI surfaces

A new top-level Settings page: **Settings → Local Models** (peer of Providers, not nested under it). Sub-tabs:

```
Settings → Local Models
├── Library          ← grid of model cards (default landing tab)
├── Hugging Face     ← in-app HF browser/downloader
├── Runtime          ← bundled llama.cpp version, GPU backend override, default pool size
├── Endpoints        ← remote LAN endpoint list
├── Folders          ← watched folder list
└── Defaults         ← global per-model defaults, embedding model selection
```

### 10.1 Library view

Responsive grid of model cards (3 columns on wide layouts, 2 on tablet, 1 on narrow). Sort: status (loaded first), then last-used-at desc. Filter chips at top: `All` / `Loaded` / `Cold` / `Chat` / `Embeddings` / `Tool-capable` / `Source: Local` / `Source: NAS` / `Source: Endpoint`.

Each card layout (matching the visual brief from Part 2):

```
┌────────────────────────────────────────────────┐
│ Llama-3.1-70B-Instruct-Q4_K_M     [● Loaded]  │
│ llama · 70.6B · Q4_K_M · 8192 ctx · 39.7 GB    │
│ Source: \\NAS-01\models\meta\Llama-3.1-70B...  │
│                                                 │
│ 28/80 layers on GPU  ▓▓▓▓▓▓▓▓░░░░░ 9.4/16 GB  │
│                                                 │
│ [Tool-capable] [License: Llama 3.1]            │
│                                                 │
│ Last benchmark: 42 tok/s · TTFT 380 ms         │
│                                                 │
│ [Make Active] [Benchmark] [Advanced] [Remove]  │
└────────────────────────────────────────────────┘
```

Status badges follow the existing Team-X foundation (`Team-X/CLAUDE.md` § "Status badges"): 1.5×1.5 LED + label, green-pulse for `Loaded`, grey-pulse for `Loading`/`scanning`, red-solid for `Error`/`Unreachable`.

### 10.2 Hugging Face tab

Top row: search field with quick-filter chips (arch, size range, quant, license-free). Below: result list of HF repos with model card preview on click, "Download this file" buttons per `.gguf` in the repo. Bottom strip: active downloads with progress bar, pause/resume, cancel.

Search uses the HF Hub public API. No auth required for read; surfaces a "Configure HF token (optional, raises rate limit)" link in Settings → Defaults.

Successful download → SHA verification → automatic library entry → toast confirmation.

### 10.3 Advanced panel (per model)

Triggered by `Advanced` on a card. Collapsed by default. Layout:

- Top section: auto-tune summary (the values being used right now).
- Middle: editable fields for `n_ctx`, `n_gpu_layers`, `n_batch`, `n_threads`, `temperature`, `top_p`, `top_k`, `repeat_penalty`, plus checkboxes for `mmap`, `mlock`, `flash_attention`.
- Bottom: the GPU offload visualizer (live preview of layer distribution as the slider moves).
- Footer: `Reset to Auto` button, `Apply` button (gated on validation), `Cancel`.

### 10.4 GPU offload visualizer

Stacked horizontal bar split by layer position: GPU layers (brand red, with VRAM scale) → CPU layers (muted). Range slider for `n_gpu_layers` directly above the bar. Live VRAM projection text right of the bar: `9.4 / 16 GB VRAM · 4.1 GB RAM`. Red warning text when projection exceeds available + 1 GB safety: *"Predicted VRAM use exceeds available capacity. Load may fail."* When projection exceeds available outright, the `Apply` button is disabled (block, not warn).

Slider styling reuses `.brand-range` from `globals.css` per `Team-X/CLAUDE.md` reusable-primitives section.

### 10.5 Benchmark panel

Triggered by `Benchmark` button on a card. Modal. Three-line summary while running (`Loading model...` → `Warming up...` → `Running prompt eval...` → `Running generation...`). On completion shows the four metrics + a button `Save to history` (auto-yes after 3 s).

### 10.6 Keyboard shortcuts

- `Cmd/Ctrl+Shift+L` opens Settings → Local Models → Library tab.
- `Cmd/Ctrl+Shift+H` opens Settings → Local Models → Hugging Face tab.
- Wired through the existing Team-X global-shortcut surface.

## 11. Runtime binary bundling

llama.cpp-server binaries vendored under:

```
apps/desktop/resources/llama-server/
├── win32-x64/
│   ├── cuda/    (server.exe, ggml.dll, llama.dll, cudart64_*.dll)
│   ├── rocm/    (server.exe, hipBLAS deps)
│   ├── vulkan/  (server.exe, vulkan-1 deps)
│   └── cpu/     (server.exe, openmp deps)
├── win32-arm64/
│   ├── vulkan/  (server.exe)
│   └── cpu/     (server.exe)
├── linux-x64/
│   ├── cuda/    (server, libggml.so, libllama.so, libcudart.so)
│   ├── rocm/    (server, libhipblas.so)
│   ├── vulkan/  (server, libvulkan.so)
│   └── cpu/     (server)
├── darwin-arm64/
│   └── metal/   (server — Metal unified)
└── darwin-x64/
    └── metal/   (server)
```

### 11.1 Fetch pipeline

New script `scripts/fetch-llama-binaries.mjs` runs in CI **before** electron-builder. It:

1. Reads the pinned `llamaCppRelease` field from root `package.json` (e.g. `"llamaCppRelease": "b4321"`).
2. Downloads pre-built artifacts from the `ggerganov/llama.cpp` releases for that tag.
3. Verifies SHA256 against a checked-in manifest at `scripts/llama-binaries-manifest.json`.
4. Extracts to `apps/desktop/resources/llama-server/`.
5. Writes a `version.json` next to the binaries with the tag + verification timestamp (read by the runtime service to surface version info in Settings → Runtime).
6. Caches the download bundle under `~/.cache/team-x-llama-binaries/<tag>/` so subsequent CI runs skip re-download.

The script is **idempotent** — if extracted binaries already match the manifest's SHA, it skips. It runs as a `prepack` hook in `apps/desktop/package.json` so local `pnpm dist` invocations work too.

### 11.2 Installer-size impact

Approximate growth per OS (relative to v3.2.1 baseline):

| OS | Current | After v1 GGUF | Delta |
|---|---|---|---|
| Windows x64 NSIS | ~110 MB | ~510 MB | +400 MB (CUDA + ROCm + Vulkan + CPU) |
| Windows arm64 NSIS | ~95 MB | ~155 MB | +60 MB (Vulkan + CPU only) |
| Linux x64 (AppImage + .deb) | ~115 MB | ~515 MB | +400 MB |
| macOS x64 + arm64 DMG | ~135 MB | ~175 MB | +40 MB (Metal only) |

Documented explicitly in CHANGELOG. Acceptable for v1. If field feedback indicates the size hurts adoption, a v2 enhancement makes backends *optional* with on-demand downloads under Settings → Runtime → "Download CUDA backend."

### 11.3 Mac signing

Every shipped llama-server binary, every `.dylib`, and every `.so` consumed by the Mac build must be signed + notarized once Team-X Mac-signing Phases 1–3 land (currently external; see `docs/handoffs/2026-05-10-mac-codesigning-plan.md`). Until then, the existing `mac.identity: null` workaround in `apps/desktop/electron-builder.yml` continues to apply — Mac DMG ships unsigned with the same Gatekeeper UX as v3.2.1. **No new blocker; significant new surface for Phase 4 notarization runs.** Spec called out so this isn't a ship surprise.

## 12. GPU backend strategy

### 12.1 Detection

A `gpu-probe` service runs **once at app startup**, results cached in the existing app settings store under `localGguf.gpuProbe`. Probe is parallelized, each backend probe has a 3 s timeout, failures are non-fatal.

Probes per OS:

| Platform | Probe |
|---|---|
| Windows / Linux NVIDIA | `nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap --format=csv,noheader` |
| Linux AMD ROCm | `rocminfo` (parse for `gfx*` agents and `Mem` segments) |
| Windows / Linux cross-vendor fallback | `vulkaninfo --summary` (parse adapter list) |
| macOS | `system_profiler SPDisplaysDataType` |

Each probe returns a structured `GpuInventory` typed in `shared-types`:

```ts
type GpuInventory = {
  detectedAt: number;
  cuda: { available: boolean; devices: GpuDevice[]; driverVersion?: string; cudaVersion?: string };
  rocm: { available: boolean; devices: GpuDevice[]; rocmVersion?: string };
  vulkan: { available: boolean; devices: GpuDevice[] };
  metal: { available: boolean; devices: GpuDevice[] };
  cpu: { cores: number; ram_mb: number };
};

type GpuDevice = { name: string; vram_mb: number; backend: 'cuda' | 'rocm' | 'vulkan' | 'metal' };
```

### 12.2 Backend ranking

For each detected GPU, rank backends best → worst:

- NVIDIA with CUDA ≥ 11 → `cuda` > `vulkan` > `cpu`
- AMD with ROCm → `rocm` > `vulkan` > `cpu`
- Intel / Apple Silicon / AMD without ROCm → `vulkan` > `cpu`
- macOS → `metal` (no choice on Mac; we don't ship the others on macOS)
- No GPU → `cpu`

The chosen backend persists in the app settings store under `localGguf.activeBackend`. Settings → Runtime surfaces it as `Active backend: CUDA (auto-detected)` with an override dropdown.

### 12.3 Health check before model load

The runtime-service smoke-tests the active backend before each model load by spawning the chosen binary with `--version` and a 5 s timeout. On failure, fall back one rank, log via toast (`"CUDA failed to initialize, falling back to Vulkan"`), and persist the fallback choice with an `autoFallbackReason` flag so Settings can show *"CUDA was disabled because: <reason>. Click to re-attempt."*

### 12.4 Auto-tune at import

When a GGUF lands in the library, the runtime-service computes default params:

- `n_gpu_layers` = `min(layers_in_model, layers_that_fit_in_VRAM(available_VRAM_mb × 0.85))`. Layer-to-VRAM estimation uses a curated coefficient table per arch + quant (testable, in `metadata/vram-estimator.ts`).
- `n_ctx` = `min(GGUF metadata context_max, 4096)`.
- `n_batch` = `512` (llama.cpp default).
- `n_threads` = `max(1, physical_cores − 2)`.
- Sampling defaults: `temperature=0.7`, `top_p=0.95`, `top_k=40`, `repeat_penalty=1.1`.

Auto-tune re-runs when (a) `gpuProbe` is re-run (e.g. hardware change), (b) the source GGUF mtime changes (re-scanned), or (c) the user clicks `Reset to Auto`.

## 13. Backup / restore semantics

| Item | Backed up? |
|---|---|
| Library rows (`local_models`) | ✓ Yes |
| Advanced params (`local_model_advanced_params`) | ✓ Yes |
| Benchmarks (`local_model_benchmarks`) | ✓ Yes |
| Endpoints (`local_model_endpoints`) — auth headers via keytar ref only | ✓ Yes (header values resolve from keytar on host machine) |
| Watch folders (`local_model_watch_folders`) | ✓ Yes |
| Runtime settings (`localGguf.*` in app settings) | ✓ Yes |
| GGUF model files | ✗ No — never |
| Vendored llama.cpp binaries | ✗ No — re-bundled by installer |
| GPU probe cache | ✗ No — re-runs on launch |
| HF download cache | ✗ No |

On restore to a new machine, library rows reappear but model files are absent. UX: card status flips to `Missing`, three action buttons surface:

1. **Locate** — file picker, allows re-pointing `source_path`.
2. **Re-download** — only available if `hf_repo_id` populated; pulls fresh from HF.
3. **Remove from library** — drops the row.

## 14. Network-share resilience

UNC paths (`\\NAS-01\models\`), SMB shares, and mapped drives are first-class. Library MUST handle source-disappearance gracefully.

### 14.1 Polling

Every 30 s, library-service polls each registered source (folder roots + individual file parents):

- For folders, `fs.access(path, R_OK)` with a 3 s timeout.
- For individual files, same check on the file directly.
- Unreachable sources flip status to `unreachable` (red LED).

### 14.2 Active inference protection

If a loaded model's source becomes unreachable, the llama-server subprocess KEEPS RUNNING — llama.cpp has the weights mmap'd, the share disappearing doesn't kill the process. The library card stays `Loaded` but adds: *"Source unreachable — model still resident in memory. Cannot reload if unloaded."* Subsequent inference calls continue working until the user unloads or the OS evicts the mmap (rare).

### 14.3 Graceful unload

If the user attempts to unload an unreachable-source loaded model, a confirmation: *"This model's source is currently unreachable. If you unload now, you won't be able to reload without restoring the source. Continue?"*

### 14.4 Retry policy

30 s polling with exponential backoff up to a 5 min ceiling — `30s → 60s → 120s → 300s → 300s …`. Never gives up. Auto-recovers silently when source returns. Recovery flips status back to `cold` (or `loaded` if the subprocess survived).

## 15. Failure modes — `LocalGgufError` taxonomy

Single discriminated union in `packages/shared-types/src/local-gguf.ts`:

```ts
export type LocalGgufError =
  | { kind: 'binary-not-found'; backend: GpuBackend; path: string }
  | { kind: 'binary-unsupported'; backend: GpuBackend; osVersion: string }
  | { kind: 'gpu-probe-failed'; reason: string }
  | { kind: 'oom-predicted'; required_mb: number; available_mb: number }
  | { kind: 'oom-runtime'; lastStderr: string }
  | { kind: 'gguf-parse-failed'; path: string; reason: string }
  | { kind: 'gguf-corrupt'; path: string; sha256_mismatch?: boolean }
  | { kind: 'server-spawn-failed'; exitCode: number | null; stderr: string }
  | { kind: 'server-crashed'; pid: number; exitCode: number | null; stderr: string }
  | { kind: 'port-exhausted' }
  | { kind: 'source-unreachable'; path: string }
  | { kind: 'hf-download-failed'; repo: string; file: string; httpStatus: number; body: string }
  | { kind: 'hf-rate-limited'; retryAfter_s: number }
  | { kind: 'endpoint-unreachable'; url: string; httpStatus?: number }
  | { kind: 'endpoint-auth-failed'; url: string }
  | { kind: 'pool-full'; current: number; max: number }
  | { kind: 'context-too-large'; requested: number; max: number };
```

Every UI surface that can encounter any of these has a designed empty/error/loading state with a discriminated render branch. No generic "Something went wrong" anywhere. Snapshot tests enforce one render per `kind`.

---

## 16. Quality engineering framework (non-negotiable spine)

**The MIT-public posture and complexity of Team-X demand zero tolerance for half-measures.** This framework is reviewer-blocking, not aspirational. Every PR that lands under this spec passes through every gate below.

### 16.1 TDD discipline

Every implementation step follows **red → green → refactor**:

1. Invoke `superpowers:test-driven-development` skill at the start of every implementation step.
2. Write the failing test first.
3. Run it. Confirm it fails for the right reason.
4. Write the minimum code to make it pass.
5. Run again. Confirm green.
6. Refactor; tests stay green throughout.
7. Invoke `superpowers:verification-before-completion` skill before marking the task complete.

Surfaces categorized:

| Surface | Test strategy | Why |
|---|---|---|
| GGUF metadata parser | TDD unit (vitest) — fixtures of known GGUF headers | Pure function; fixtures from curated set of real models |
| LRU pool eviction logic | TDD unit | Pure state machine |
| Auto-tune calculations | TDD unit | Pure math; deterministic |
| VRAM headroom predictor | TDD unit | Pure math |
| Chat-template auto-detect | TDD unit | Pure function on metadata |
| Library scan + folder watch | TDD unit (memfs) + integration (real FS) | Mockable + ground-truth smoke |
| HF API client | TDD unit (msw) + nightly integration | Mocked HTTP for fast tests; real HF gated behind env flag |
| llama-server lifecycle | Integration test (real CPU binary) | Mocking subprocess lifecycle is lossy |
| GPU probe | Integration test (per-OS in CI) | OS-specific tools; no point mocking |
| IPC handlers | TDD unit | Service is the integration boundary |
| Renderer components | RTL + Playwright visual snapshot | Existing Team-X bar |
| End-to-end flows | Playwright E2E | Mirrors existing patterns |

**Coverage targets:**
- ≥ 90% line + branch on every new module in `@team-x/local-gguf-runtime`.
- ≥ 90% line + branch on the two new adapters in `@team-x/provider-router`.
- Renderer held to the existing 80% repo bar.
- Reports surface via `pnpm test:coverage` and are blocking in CI for new code.

### 16.2 Code review gates

**Every phase ends with a five-stage review wall. No phase merges to `main` until all stages pass.**

| Stage | Gate | Mechanism |
|---|---|---|
| 1 | Automated CI green | `ci.yml` — lint + typecheck + test × 3 OSes + E2E smoke (already exists, blocks merge) |
| 2 | Internal review (sub-agent) | Invoke `superpowers:requesting-code-review` skill. `feature-dev:code-reviewer` agent reviews entire phase diff. Findings filed as PR comments; high-confidence issues blocking. |
| 3 | Independent second opinion | Invoke `dev-tools:codex-review` skill. Codex (GPT-5/o3 family) runs an independent review, report saved under `.jez/reviews/`. **MANDATORY for any phase touching:** subprocess spawning, file path handling, HTTP/network calls, keytar/keychain, IPC bridge surface. Any **HIGH** finding blocks merge. |
| 4 | Rocky sign-off | Read-through of phase summary + UI screenshots/recordings + benchmark numbers. Rocky decides merge. |
| 5 | Pre-ship gate | `ship-engineer` agent runs at release-tag time. Extended for this feature to verify (a) llama-server binaries present in artifact, (b) manifest SHAs match, (c) electron-builder file allowlist includes the new resources tree. |

Codex review (Stage 3) maps to phases as follows in v1:

| Phase | Codex review mandatory? | Why |
|---|---|---|
| Phase 0 spikes | Optional | Spikes are throwaway — review focus is the writeup |
| Phase 1 (Foundation) | Yes | New IPC contracts + migration |
| Phase 2 (Runtime + Pool) | Yes | Subprocess spawn surface |
| Phase 3 (Library + Scanning) | Yes | File path handling, UNC/SMB |
| Phase 4 (Provider integration) | Yes | Provider-router is a security-sensitive boundary |
| Phase 5 (Library UI) | No (unless XSS surface introduced) | Pure renderer |
| Phase 6 (GPU visualizer / VRAM guard) | No | Pure renderer + math |
| Phase 7 (HF Browser) | Yes | HTTP, downloads, SHA |
| Phase 8 (Chat-template + tool gating) | Yes | Provider-router behavior change |
| Phase 9 (Local embeddings) | No | RAG integration is internal |
| Phase 10 (Benchmark runner) | No | Internal computation |
| Phase 11 (Docs + a11y + beta) | Yes | Final pre-release pass |

### 16.3 Quality gates (per-phase blocking)

Every phase exit runs this checklist. Phase doesn't merge until all green.

- [ ] `pnpm typecheck` — zero errors, zero new `any` introduced.
- [ ] `pnpm lint` (Biome) clean + renderer ESLint clean.
- [ ] `pnpm test` — 100% pass; ≥ 90% line+branch on new code in `@team-x/local-gguf-runtime` and `@team-x/provider-router` new adapters.
- [ ] `pnpm test:coverage` JSON report attached to PR.
- [ ] `pnpm -F @team-x/desktop test:e2e` — 100% pass. Any phase touching renderer adds ≥ 1 E2E spec.
- [ ] `pnpm audit:claims:strict` clean (existing claim-evidence conformance gate).
- [ ] `pnpm autonomy:doctor` clean (existing diagnostic).
- [ ] WCAG 2.1 AA verified for any UI delivered — manual checklist + axe-core scan in an E2E spec.
- [ ] Performance assertion: phase-specific perf-target met and asserted in a test (examples: library scan of 100 GGUFs in < 2 s; auto-tune computation < 100 ms; subprocess spawn-to-ready < 30 s for 7B Q4 on CUDA; HF search round-trip < 800 ms).
- [ ] Security scan: any new `spawn`/`exec` reviewed for argument-injection; any new path read reviewed for traversal; any new HTTP call reviewed for SSRF.
- [ ] CHANGELOG entry under `[Unreleased]` with phase scope.
- [ ] User-guide docs updated if user-visible surface delivered.
- [ ] `llms.txt` + `long-llms.txt` updated if user-guide content changed.
- [ ] No new IPC channel without a typed `shared-types` contract + unit test.
- [ ] No new SQL migration without a forward-only test + a rollback note in the migration header.

---

## 17. Phased delivery with Phase-0 spikes

**Spikes are time-boxed (≤ 1 day each), branched off `main`, exist to validate one assumption each, produce `docs/spikes/<spike-name>.md` writeup, conclude with explicit go/no-go.** They are NOT product code.

```
Phase 0 — Spikes (de-risk before committing to real phases)

  S1 · llama.cpp binary fetch + version-pin
       Goal:   scripts/fetch-llama-binaries.mjs deterministically downloads,
               verifies, and bundles all OS×backend combos.
       Assets: known-good ggerganov/llama.cpp release tag, SHA manifest,
               confirmed installer-size impact vs estimate.
       Exit:   binary acquisition runnable in CI.

  S2 · GPU probe cross-platform
       Goal:   nvidia-smi / rocminfo / vulkaninfo / system_profiler output
               parsing on real hardware (Rocky's Windows GPU rig + a Mac;
               Linux GPU probe smoke-tested in CI on stub runner).
       Assets: GpuInventory shape proven against real outputs; edge-case
               outputs captured as fixtures.
       Exit:   probe returns structured inventory across the matrix or
               explicitly flags "unsupported".

  S3 · GGUF metadata parser
       Goal:   parse 12+ real GGUFs (Llama 3.x, Mistral, Qwen, Gemma, Phi,
               nomic-embed, BGE-large, plus one obviously-corrupt sample)
               and extract arch/params/quant/context_max/chat_template/
               tool-support/embedding-arch flag.
       Assets: parser library identified or written; fixtures committed.
       Exit:   parser handles every fixture; unknown-arch + corrupt-file
               failure modes designed.

  S4 · llama-server lifecycle
       Goal:   spawn server with a real CPU-build binary, hit
               /v1/chat/completions, kill cleanly, verify port release.
               Repeat on Vulkan + Metal where dev hardware allows.
       Assets: subprocess wrapper API designed; port allocator strategy
               chosen; stderr capture pattern proven.
       Exit:   subprocess lifecycle proven across at least CPU + Vulkan.

  S5 · Hugging Face API client
       Goal:   validate search, model card fetch, file download with
               resume support, rate-limit handling against a real HF
               account (optional auth token).
       Assets: HF client interface designed against real responses; rate-
               limit retry strategy proven.
       Exit:   HF client ready to implement in Phase 7.

Phase 1 — Foundation
  - New package @team-x/local-gguf-runtime scaffolded with module
    boundaries, vitest config, biome config.
  - shared-types IPC contracts: library, runtime, pool, hf, benchmark,
    endpoint, error taxonomy.
  - Drizzle migration 0014_local_gguf (5 tables + indexes).
  - Empty service stubs with dependency injection seams.
  - Preload bridge extended; renderer hook scaffolding (no UI yet).

Phase 2 — Runtime + Pool
  - llama-server lifecycle service (uses S4 findings).
  - LRU pool service with auto-swap on agent request.
  - GPU probe (uses S2).
  - Backend ranking + auto-select.
  - Port allocator (uses S4).
  - Integration tests with real CPU binary in CI.

Phase 3 — Library + Scanning
  - GGUF metadata parser (uses S3).
  - Library CRUD repo + service.
  - Folder scan + auto-watch (incl. UNC/SMB).
  - File picker flow.
  - Multi-part split-GGUF handling.
  - Network-share resilience (poll + status flip + retry).

Phase 4 — Provider integration
  - local-gguf chat adapter (with tool gating).
  - local-gguf-embed adapter.
  - Provider registry registration.
  - Privacy-tier wiring + adaptive-routing extension.
  - Cost = $0 verified against telemetry-core.

Phase 5 — Library UI
  - Settings → Local Models page + tab scaffolding.
  - Library view (grid + cards + filter chips + sort).
  - Folders tab.
  - Endpoints tab.
  - Runtime tab (backend display + override + version info).
  - Status badges, all designed empty/loading/error states.

Phase 6 — GPU Offload Visualizer + VRAM Guard + Advanced panel
  - Per-model Advanced controls panel.
  - GPU offload visualizer with live VRAM projection.
  - VRAM headroom guard (block + warn behavior).
  - Reset-to-Auto path.

Phase 7 — Hugging Face Browser
  - HF search UI + filters (uses S5).
  - Model card preview.
  - Download manager (progress, pause/resume, cancel).
  - SHA verification on completion.
  - Toast + auto-library-add on success.

Phase 8 — Chat-template + System-prompt + Tool-calling badge
  - Auto-detect chat template from GGUF metadata.
  - Per-model override in Advanced panel.
  - Per-model system-prompt override.
  - Tool-capability detection (curated list + metadata hints).
  - MCP injection gating in provider-router.

Phase 9 — Local Embeddings + RAG Integration
  - local-gguf-embed wired into intelligence/rag/embeddings.ts.
  - Embedding-model selection in Settings → Defaults.
  - Re-index confirmation flow + rag-rebuild integration.

Phase 10 — Benchmark Runner
  - Canned-prompt benchmark service.
  - Per-model benchmark history persistence.
  - Library-card display of latest benchmark.

Phase 11 — Documentation + Accessibility + Polish + Beta
  - Comprehensive user-guide section (docs/user-guide/local-models/).
  - llms.txt + long-llms.txt updates.
  - Accessibility audit (axe-core in E2E, manual keyboard walkthrough).
  - All empty/loading/error states verified end-to-end.
  - Full E2E spec suite (5+ new specs).
  - Performance budgets verified.
  - Release notes drafted.
  - Cut v3.3.0-beta.1 tag → 14-day field test → promote to v3.3.0 stable.
```

### 17.1 Gates between phases

Every phase exits through the Quality Gates list (§ 16.3) + the Code Review wall Stages 1–4 (§ 16.2). Stage 5 (`ship-engineer`) gates only release-tag cuts (beta + stable).

### 17.2 Phase sizing

Phases are sized for a clean review wall and a single PR with a single coherent CHANGELOG entry. Some phases are bigger than others — Phase 2 (runtime + pool) and Phase 7 (HF browser) carry the heaviest implementation weight. If a phase exceeds ~1500 LOC of net production code or feels reviewer-overwhelming during execution, the writing-plans skill will break it into sub-phases automatically; the spec doesn't prescribe.

## 18. Testing strategy summary

- **Unit:** new vitest suites in `@team-x/local-gguf-runtime`; additions to `@team-x/provider-router`; additions to `@team-x/intelligence`. Targets ≥ 90% on new code.
- **Integration:** `apps/desktop/src/main/services/local-gguf/*.integration.test.ts` — real subprocess spawns (CPU binary is enough), real filesystem, mocked HF via msw.
- **E2E:** new Playwright specs:
  - `e2e/local-gguf-library.spec.ts` — full library CRUD round-trip
  - `e2e/local-gguf-hf-browser.spec.ts` — search → download → library entry → chat
  - `e2e/local-gguf-loading.spec.ts` — load model → chat → unload → reload
  - `e2e/local-gguf-rag-embedding-switch.spec.ts` — embedding swap + re-index
  - `e2e/local-gguf-network-share-resilience.spec.ts` — share disconnect/reconnect
  - `e2e/local-gguf-accessibility.spec.ts` — axe-core + keyboard navigation
- All E2E specs run against a **stub backend** that fakes llama-server (so E2E does not require a real GPU in CI).
- **Manual smoke matrix** (per release): `docs/qa/local-gguf-smoke-matrix.md` pinned. Rocky's hardware covers Windows NVIDIA and Mac arm64 reliably; Linux NVIDIA, Linux AMD/ROCm, Windows AMD/ROCm, Windows Intel iGPU, Mac x64 require contributor support — call this out in `CONTRIBUTING.md` and accept it as a beta-period field-test surface.

## 19. Acceptance criteria

The feature ships when every one of these is verifiable green.

1. User can drop a `.gguf` file via the picker, see a metadata-rich card within 3 s, and chat with it within 30 s on CUDA-class hardware (7B Q4 reference).
2. User can point at a UNC/SMB folder; library auto-populates and auto-watches; newly dropped files appear within 5 s.
3. User can add a LAN endpoint (LM Studio / Ollama / llama-server) and chat through it.
4. User can search HF, download a GGUF (with resume on interrupt), see it in the library, and chat with it — all in-app.
5. Multiple models can be loaded simultaneously up to the configured pool size; LRU eviction is correct and visible in the UI.
6. VRAM guard blocks an OOM-bound load with an actionable error before the subprocess spawns.
7. Switching the embedding model triggers a confirmation + re-indexing job; RAG attribution after the switch references the new embeddings.
8. Tool-capable GGUFs receive MCP tool injection; non-capable GGUFs do not.
9. NAS disconnect mid-conversation produces a graceful `Unreachable` state, never crashes the app; reconnect auto-recovers.
10. Every `LocalGgufError` variant has a designed UI state proven by a snapshot test.
11. All five new IPC channel families are typed end-to-end and have unit-test coverage.
12. Installer size growth ≤ 500 MB per OS; documented in CHANGELOG.
13. Beta tag → stable tag transition gated on at least 14 days of field testing with zero P0/P1 reports.

## 20. Open questions / risks

| Risk | Mitigation |
|---|---|
| llama.cpp ABI changes between pinned tags | Pin a known-good tag in `package.json`; bump deliberately with a spike re-run; never auto-upgrade. |
| ROCm bundling complexity on Windows | Validate in Spike S1; if Windows ROCm proves too fragile to bundle, defer Windows ROCm to v2 and document the fallback (Vulkan covers Windows AMD users). |
| HF API rate-limiting | Surface "Configure HF token" link; back off on 429 with `retryAfter`; provide a UX-clear error state. |
| Mac notarization scope explosion | Already documented in § 11.3; accept as a known cost of the Full Matrix choice. |
| Installer-size pushback from non-power-users | Documented in § 11.2 + CHANGELOG; v2 enhancement on-demand-download path defined. |
| Subprocess port conflicts on locked-down machines | Port allocator probes a fixed range (49152–65535) and skips in-use ports; surfaces `port-exhausted` typed error with explicit guidance. |
| Stub-backend drift from real llama-server behavior | Integration tests against real CPU binary in CI; nightly real-binary E2E job catches drift. |
| Phase-0 spikes taking longer than 1 day each | Spikes are time-boxed; if S1 or S3 overflows, the spec is revised before downstream phases begin. The whole point of the spike. |

## 21. References

- llama.cpp project: https://github.com/ggerganov/llama.cpp
- llama.cpp server documentation: https://github.com/ggerganov/llama.cpp/blob/master/examples/server/README.md
- GGUF format spec: https://github.com/ggerganov/ggml/blob/master/docs/gguf.md
- Hugging Face Hub API: https://huggingface.co/docs/hub/api
- Team-X provider router precedent: `packages/provider-router/src/adapters/openai-compat.ts` (URL-resolved OpenAI-compat pattern)
- Team-X Ollama precedent: `packages/provider-router/src/adapters/ollama.ts` (local HTTP, $0 cost path)
- Team-X RAG embeddings: `packages/intelligence/src/rag/embeddings.ts`
- Team-X Mac signing plan: `docs/handoffs/2026-05-10-mac-codesigning-plan.md`
- Team-X v3.2.1 release pipeline: `docs/handoffs/2026-05-12-v3.2.1-release-pipeline-validated.md`
- Team-X status badge foundation: `Team-X/CLAUDE.md` § "Status badges"
- Team-X reusable visual primitives: `Team-X/CLAUDE.md` § "Reusable visual primitives"

---

**End of spec.** Next step: `/superpowers:writing-plans` to produce the bite-sized, TDD-shaped implementation plan with task-by-task checkboxes and the Phase-0 spikes scheduled first.
