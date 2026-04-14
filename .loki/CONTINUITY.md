# Loki Continuity — Phase 5, M29 PLANNED

## Current State

- **Phase 4 (Ship-readiness) SHIPPED.** v1.0.0 tagged. All 27 milestones complete.
- **Phase 5 (Intelligence Layer) in flight.** Design doc at `docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md`.
- **M28 (Intelligence Package + RAG Foundation) COMPLETE** — 2026-04-13. T1-T10 all committed.
- **M29 (RAG integration into agent turns) PLANNED** — 2026-04-13. Plan doc at `docs/plans/2026-04-13-team-x-phase-5-m29-rag-agent-integration.md`. Queue at `.loki/queue/pending.json` has 10 TDD tasks ready for RARV execution. Zero code landed yet.
- **Baseline:** 641 unit tests + 4 E2E specs passing. Typecheck clean. Lint: 0 errors, 41 pre-existing `noNonNullAssertion` warnings baseline.
- **M29 target:** ~665 unit tests (+24) + 5 E2E specs (+ `rag-flow.spec.ts`).

## M29 Task Map (from plan doc)

| Task | Scope | Est. tests |
|------|-------|-----------|
| T1 | `embedText` + Ollama + OpenAI embed adapters in provider-router | 4 |
| T2 | Extend `ResolveSystemPrompt` with `threadId` | 0 (type-only) |
| T3 | `RagService` facade in intelligence pkg | 5 |
| T4 | `RagIndexer` event-bus subscriber | 5 |
| T5 | `composeSystemPromptWithRag` | 5 |
| T6 | Composition root wiring in `main/index.ts` | 0 (integration) |
| T7 | `rag.*` IPC channels + handlers | 4 |
| T8 | RAG Settings UI panel | 2 |
| T9 | E2E `rag-flow.spec.ts` | 1 E2E |
| T10 | Full verification + M29 milestone marker | 0 |

## Architectural Seams Added in M29 (for quick lookup)

- **`EmbedAdapter` contract** in `@team-x/provider-router` — minimal `{model, dimension, embed(texts)}` interface. Mirrors `ProviderStreamFn` layering: pure factory (`createEmbedText`) enforces dimension + count invariants, adapter files (`ollama-embed.ts`, `openai-embed.ts`) own the HTTP.
- **`RagService` facade** in `@team-x/intelligence` — two surface methods: `indexSource` + `retrieve`. Delete-then-insert on re-index so shorter content doesn't leave stale chunks. Float32Array ↔ Buffer serialization lives here, not in call sites.
- **`RagIndexer`** in `apps/desktop/src/main/services/` — one event-bus subscriber, dispatch table routes `work.completed` → embed message, `meeting.ended` → embed minutes. Fire-and-forget async (void IIFE) with catch-and-log — never breaks event fan-out (see `event-bus.ts` listener-isolation contract).
- **`composeSystemPromptWithRag`** in `apps/desktop/src/main/services/system-prompt.ts` — pure wrapper around the role.md render step. Dedups against recent thread history, enforces token budget, emits `[Source: label id]` attribution. Zero-regression guarantee when RAG disabled.

## Key Decisions Locked

- **Embedding provider default:** Ollama `nomic-embed-text` (768-dim) — local-first, zero phone-home by default.
- **Cloud fallback:** OpenAI `text-embedding-3-small` (1536-dim). Also works through openai-compat `baseURL` for Together/Fireworks/OpenRouter.
- **Re-index on write, not on read.** On write, delete existing `sourceId` rows then upsert fresh chunks. On read, just filter + cosine.
- **Query seed = last 1–2 user messages in the thread.** Cheap signal, no extra LLM call.
- **Attribution format:** `[Source: {label} {sourceId}] {contentText}`. Labels: `message`, `ticket`, `meeting`, `goal`, `project`, `vault`.
- **Token counting approximation:** `Math.ceil(text.length / 4)`. Good enough for the budget guard; swap for a real tokenizer later if it ever starts to matter.
- **RagService is null when RAG is disabled or no embedding provider is configured.** `resolveSystemPrompt` falls back to plain role.md render — zero regression. This is the key to being safe to ship partial if a downstream task stalls.

## M28 Patterns We're Carrying Forward

- `@team-x/intelligence` is pure-TS, composite tsconfig, no Electron deps. New code goes in the same package.
- `TRunResult` cast for `.changes`: `db.delete(...).run() as unknown as { changes: number }`.
- Float32Array ↔ Buffer: store vectors as BLOB; reconstruct via `new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)`.
- sqlite-vec best-effort init mirrors fts5-init — caller always has a fallback path.
- Settings keys seeded in M28 T9 (`rag_enabled`, `rag_max_tokens`, `rag_threshold`, `rag_top_k`, `embedding_provider`, `embedding_model`, `embedding_dimension`) — do NOT re-seed in M29. Just consume.

## Mistakes to Watch For (Anticipatory, From M28 Experience)

- **`pnpm -F @team-x/desktop typecheck` does not cascade** — always run `pnpm typecheck` at repo root to catch per-package composite-mode regressions.
- **Event-bus listener errors must be caught.** The bus isolates listener throws (see `event-bus.ts` `onListenerError`), but the contract is: don't throw from a subscriber. `RagIndexer` uses `void (async () => { try ... catch ... })()` so errors land in the logger and never reach the bus.
- **Orchestrator signature change (T2) is a type-propagation risk.** Meeting-service tests and orchestrator tests both stub `resolveSystemPrompt`. Update the stubs — don't cast — so TS catches future drift.
- **Provider-factory is the ONLY file that constructs adapters from provider-router.** Same invariant applies to embed adapters — always go through `buildEmbedAdapter`.
- **Component tests that rely on `window.teamx`** — stub via `(globalThis as any).teamx = { ... }` in each test setup. Don't forget to stub every channel the component queries.
- **Commit discipline (lesson from M28 T4 slippage):** After each task, `git log --oneline -5` and verify the plan-task commit matches the expected task number. Don't declare a milestone done until every T# has a corresponding commit.

## Next Session Startup Checklist

1. Read this CONTINUITY file.
2. Read `.loki/state/orchestrator.json` → currentMilestone should be `M29`, tasksCompleted 0.
3. Read `.loki/queue/pending.json` → first pending task is `M29-T1`.
4. Open `docs/plans/2026-04-13-team-x-phase-5-m29-rag-agent-integration.md` → "Task 1: Add `embedText` to `@team-x/provider-router`" has the full TDD recipe.
5. Begin RARV cycle on M29-T1: read `packages/provider-router/src/stream.ts` for the adapter-factory pattern, write `embed.test.ts`, watch it fail, implement, watch it pass, commit.

## Environment

- OS: Windows 11 Pro
- Shell: bash (Unix syntax — `/dev/null`, forward slashes)
- Repo root: `C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X`
- **Working dir warning at session start:** `Team-X/release/1.0.0/` (build output). Change to repo root before running any `pnpm` command.
- Node: 20 LTS
- Package manager: pnpm workspaces
- Test runner: Vitest (unit) + Playwright (E2E)
