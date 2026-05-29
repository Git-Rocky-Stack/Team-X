# @team-x/local-gguf-runtime

Runtime engine for Team-X's **Local & Networked GGUF Support** (v3.3.0).

This package owns the platform-facing machinery for running GGUF models
locally and against LAN endpoints:

- **GPU probe** — cross-platform detection (CUDA / ROCm / Vulkan / Metal / CPU)
  and backend ranking.
- **llama-server lifecycle** — spawn, ready-detection, OpenAI-compatible HTTP,
  graceful termination, failure triage.
- **LRU pool** — bounded concurrent model loading with auto-swap.
- **GGUF metadata parser** — arch, params, quant, context window, chat template,
  embedding/tool-capability detection.
- **Hugging Face Hub client** — search, model cards, resumable downloads.
- **Benchmark runner** — per-model throughput + TTFT + VRAM measurement.

## Phase 1 status

This package currently ships only the `errors` re-export (the canonical
`LocalGgufError` union lives in `@team-x/shared-types`). Each subsequent
phase extends the public surface:

| Area | Phase |
|---|---|
| GPU probe (`src/gpu-probe/`) | Phase 2 (Spike S2 findings) |
| Runtime + pool (`src/runtime/`, `src/pool/`) | Phase 2 (Spike S4 findings) |
| Library scanning (`src/library/`) | Phase 3 |
| GGUF metadata (`src/metadata/`) | Phases 3, 6, 8, 9 (Spike S3 findings) |
| HF client (`src/hf-client/`) | Phase 7 (Spike S5 findings) |
| Benchmark runner (`src/benchmark/`) | Phase 10 |

See `docs/superpowers/plans/2026-05-27-local-gguf-support.md` for the master plan.

## Imports

```ts
import { isLocalGgufError, type LocalGgufError } from '@team-x/local-gguf-runtime';
// or, scoped:
import { isLocalGgufError } from '@team-x/local-gguf-runtime/errors';
```
