# Loki Continuity — Phase 5, M28 COMPLETE

## Current State
- **Phase 4 (Ship-readiness) SHIPPED.** v1.0.0 tagged. All 27 milestones complete.
- **Phase 5 (Intelligence Layer) in flight.** Design doc at `docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md`.
- **M28 (Intelligence Package + RAG Foundation) COMPLETE.** T1-T10 all committed.
- 641 unit tests + 4 E2E specs passing. Typecheck + lint clean (0 errors, 41 pre-existing `noNonNullAssertion` warnings baseline).
- **Next: M29 (RAG integration into agent turns).**

## M28 Final Commit Chain (this session)
- `cb2f5b7` feat(db): M28 T4 — embeddings repo (upsert, listBySource, deleteBySource, countByCompany) + pnpm-lock for intelligence package
- `94e74d2` fix(build): bundle db migrations as extraResources
- `1077e08` fix(main): surface fatal init errors via dialog before exit
- `521be8b` chore: M28 T10 — typecheck cast + lint cleanup
- `4945f83` feat(intelligence): M28 complete — intelligence package + RAG foundation

(T1-T3, T5-T9 commits were already in place from prior sessions — see git log.)

## M28 Deliverables (by task)
1. [x] **T1** — `@team-x/intelligence` package scaffold (composite tsconfig, deps on shared-types + provider-router)
2. [x] **T2** — RAG types in shared-types (EmbeddingChunk, EmbeddingSourceType, RagRetrievalResult, RagConfig, DEFAULT_RAG_CONFIG)
3. [x] **T3** — Embeddings table + Drizzle schema + migration `0008_embeddings.sql`
4. [x] **T4** — EmbeddingsRepo (upsert with source_id/chunk_index conflict, getById, listBySource, deleteBySource returns row count via better-sqlite3 cast, listByCompany, countByCompany)
5. [x] **T5** — sqlite-vec initializer (best-effort, mirrors fts5-init pattern)
6. [x] **T6** — Text chunker with sentence-boundary splitting + configurable token overlap
7. [x] **T7** — Embedding generator (provider-agnostic EmbedTextFn, Float32Array ↔ Buffer)
8. [x] **T8** — Cosine similarity retriever with brute-force fallback + threshold/top-K filtering
9. [x] **T9** — RAG settings defaults seeded (rag_enabled, rag_max_tokens, rag_threshold, rag_top_k, embedding_provider, embedding_model, embedding_dimension)
10. [x] **T10** — Full verification pass: 641 tests, typecheck clean, lint 0 errors

## Packaging Fixes That Landed Alongside M28
- `electron-builder.yml` — bundle `apps/desktop/src/main/db/migrations/` as `extraResources`. Without this, packaged builds would fail on first launch trying to apply 0008 (and every previous migration).
- `main/index.ts` — `app.whenReady().then(...)` now has a `.catch()` that shows a dialog and exits cleanly with code 1 instead of silently leaving Electron running with no window.

## Patterns established in M28
- **@team-x/intelligence pure-TS package** — composite tsconfig, no Electron deps; follows the telemetry-core mold.
- **sqlite-vec best-effort init** — same pattern as fts5-init.ts; catches `CREATE VIRTUAL TABLE` failures and falls back to brute-force cosine in the retriever.
- **Generic `TRunResult` cast for `.changes`** — `db.delete(...).run() as unknown as { changes: number }`. Repo is generic but runtime is always better-sqlite3.
- **Provider-agnostic embedding callback** — `EmbedTextFn = (texts: string[]) => Promise<number[][]>`. The intelligence package never imports a provider directly; wiring happens at the composition root (desktop/main).
- **Float32Array ↔ Buffer serialization** — store vectors as BLOB; reconstruct via `new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)`.

## Mistakes & Learnings (this session)
- T4 embeddings repo was written but the commit slipped — always verify `git log` matches plan task numbering before declaring a milestone done.
- Plan specified `deleteBySource(): number` but the rest of the repo layer uses `delete(): void`. Honored the plan and the test assertion, but required a `TRunResult` cast. Worth noting as an inconsistency if we ever harmonize the repo API surface.
- The 41 `noNonNullAssertion` lint warnings are a pre-existing baseline from Phase 4 — Biome config has this as `warn`, not `error`. Do NOT auto-fix them across legacy test files without explicit user approval; the `!` pattern after `expect(x).not.toBeNull()` is an intentional type-narrowing idiom here.
- Biome's `--reporter=summary` is the fastest way to get the error-vs-warning split when counts disagree with displayed diagnostics.
- `pnpm-lock.yaml` workspace-package additions need to be committed with the package scaffold (T1); if they slip, bundle them with the next related commit and note the source task.

## Next Up: M29
**RAG integration into agent turns.** Two halves:
1. Event-bus subscription for on-write indexing — when messages/tickets/meeting-minutes/goals/projects/vault-files land, chunk + embed + upsert.
2. `resolveSystemPrompt` enhancement — at agent turn time, embed the user prompt, retrieve top-K relevant chunks, inject as context block under token budget.

Plan doc expected at `docs/plans/2026-04-13-team-x-phase-5-m29-*.md` (not yet written — first step of M29 will be writing the plan).
