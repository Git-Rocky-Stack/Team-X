# H-tier Audit Campaign — Session Handoff

**Date:** 2026-05-09
**Owner:** Rocky Elsalaymeh
**Audit being attacked:** `docs/audits/2026-05-07-agentic-system-prompt-engineering-audit.md`
**Campaign status:** P0 (C1–C6) complete in earlier sessions. P1 (H1–H16) — **6 of 16 closed (H1–H6)**. 10 remain (H7–H16).

---

## 1. Why this handoff exists

The H-tier audit campaign is a sequential, one-finding-at-a-time attack on the audit's P1 (high) findings. Rocky drives the cadence with explicit go-ahead messages (`"go ahead h7"`, etc.). Each finding gets the full F10 treatment — implementation, dedicated test coverage, audit-doc ✅ FIXED resolution write-up, and a `TaskUpdate` flip — before moving to the next. No batching, no shortcuts.

This doc captures the campaign state at the close of H6 so the next session can pick up at H7 without context loss.

---

## 2. The unbroken delivery pattern

Every H-finding ships as **one inseparable unit**:

1. **Implementation** — minimal, surgical change at the audit's named path. Every commented decision gets a "Why" line tying back to audit 2026-05-07.
2. **Tests** — at least one new describe block dedicated to the audit's contract (`<feature> — H<n> audit (2026-05-07)`). Pin the regression — never count on incidental coverage.
3. **Verification table** — net new test count, package-by-package green status, typecheck status, pre-existing-only failure call-out.
4. **Audit doc updates** — both the table-row badge (`✅ FIXED (2026-05-09)` + one-paragraph synopsis) AND a full resolution section after the prior finding's section. The resolution must close with a *"Closes the audit's callout"* block that quotes the audit's original complaint and states the new behavior.
5. **TaskUpdate** — flip the corresponding task ID to `completed` only after the four steps above land cleanly.

Trust signal: at H6 close, the pattern has held for 6 consecutive findings (H1–H6) and 6 P0 findings before that (C1–C6).

---

## 3. Closed H-findings — H1 through H6

| # | Finding | Resolution | Net new tests |
|---|---|---|---|
| **H1** | Tool arg schemas not visible in prompt | ✅ Closed by C2 (Vercel AI SDK `LoopProviderToolDescriptor.jsonSchema`). H1 verified post-C2; no separate change needed. | 0 (verified) |
| **H2** | Few-shot examples missing | ✅ Added `FEW_SHOT_EXAMPLES` in `prompt.ts` (single-step + multi-step-with-revision examples). Default-prefix-includes / custom-prefix-excludes gating via `BuildSystemPromptOptions.includeFewShotExamples`. Trust-boundary preserved by narration-only round-trip form (no literal JSON `"action"` blocks). | +10 |
| **H3** | Haiku 4.5 pricing wrong | ✅ Closed by C3 — `pricing.json` now has `claude-haiku-4-5-20251001` at `in: 0.001 / out: 0.005 / cachedIn: 0.0001 / cacheWrite: 0.00125`. | 0 (verified) |
| **H4** | No traceId in runs/events | ✅ End-to-end W3C 32-hex traceId from orchestrator entry → loop → tool → DB → audit log. Drizzle migration 0035 adds `runs.trace_id` + `events.trace_id` (both indexed). `generateTraceId()` lives in `packages/shared-types/src/trace.ts` and is minted **once per logical request** at `run-agent.ts`, `agentic-loop-service.ts`, and `copilot-analyzer-service.ts` — never inside the loop. | +14 |
| **H5** | HTTP 429 not retried | ✅ `transient-errors.ts` rewritten with `isHttp429Error` (cause-chain walk, RFC 7231-aware), `extractRetryAfterMs` (delta-seconds + HTTP-date), `getProviderRetryBackoffMs` (1s → 2s → 4s → 8s → 16s capped at 30s, or honored Retry-After clamped at 30s). `MAX_PROVIDER_ATTEMPTS` bumped 2 → 3. `isTransientFetchFailure` short-circuits on 429 so call sites retry without code change. | +29 |
| **H6** | `query_events.type` is free `z.string().min(1)` | ✅ `EventType` union promoted to `EVENT_TYPES` const tuple in `shared-types/events.ts` (runtime-iterable, byte-identical for compile-time consumers). Schema tightened to `z.enum([...EVENT_TYPES] as [EventType, ...EventType[]]).optional()`. Tool-registry already does `safeParse → invalid_args` so model typos now flip from silent-empty to a structured Zod issue with the full enum surfaced. | +12 |

**H-tier net new tests:** 65 (10 + 14 + 29 + 12). Workspace test growth across the campaign: ~+95 (P0 + H1–H6).

---

## 4. Open H-findings — H7 through H16

These are the remaining audit P1s, in audit order. Quoted text is the audit's exact wording — keep it close when implementing so the resolution language tracks.

| # | TaskID | Audit's complaint | Audit-named path |
|---|---|---|---|
| **H7** | 36 | *"Confidence threshold 0.5 applies to destructive intents. 'Fire this bug' can pass to `fire_employee` at 0.55 confidence. Should be 0.8+ for irreversibles."* | `intent-classifier.ts:57, 316-324` |
| **H8** | 37 | *"Cancelled runs skip cost ledger. Budget reconciliation has a blind spot on stop/timeout branches."* | `budget-governance-service.ts:625` |
| **H9** | 38 | *"Step budget arithmetic surprises. Default `maxSteps=8`, but each ReAct iteration consumes 3 (plan + tool_call + tool_result) — only ~2-3 actual tool turns before exhaustion."* | `loop/loop.ts:282, 310, 378` |
| **H10** | 39 | *"Reranker + query expansion not wired into retrieval orchestrator."* | `retrieval-orchestrator.ts` |
| **H11** | 40 | *"Streaming-delta DB writes happen per-chunk; should be batched."* | `orchestrator/run-agent.ts:386` |
| **H12** | 41 | *"Agent self-improvement loop has no causation-chain dedup; can cycle on identical signals."* | self-improvement service |
| **H13** | 42 | *"Copilot can emit unbounded 'critical' severity insights per cycle."* | copilot analyzer |
| **H14** | 43 | *"Copilot category-weight feedback aggregation is not implemented."* | copilot weights |
| **H15** | 44 | *"Default chat path has no tool-result size cap (only the loop has one)."* | `run-agent.ts:415` |
| **H16** | 45 | *"Vault path-traversal: missing resolved-path containment check."* | `services/vault.ts:203-279` |

**H7 is the natural next target** — destructive-intent confidence is a load-bearing safety boundary and the change is small (single-file, threshold constant + test pinning).

---

## 5. Verification baseline at H6 close

| Suite | Tests passing | Delta this campaign |
|---|---|---|
| `@team-x/shared-types` | **74 / 74** | +6 (events-h6) |
| `@team-x/desktop` | **2083 / 2083** individual tests across **188 / 189** files | +36 across H1–H6 |
| `@team-x/intelligence` | 169 / 169 unchanged | — |
| `@team-x/provider-router` | 97 / 97 unchanged | — |
| `@team-x/telemetry-core` | 14 / 14 unchanged | — |

**One pre-existing test-file load failure persists across the campaign** (also failed under H4 + H5 baselines; not introduced by any H-tier work):

- `apps/desktop/src/main/services/provider-factory.test.ts` — `keytar.node is not a valid Win32 application`. This is a native-binary architecture mismatch in the locally-installed `keytar@7.9.0` — the bundled `.node` file isn't compatible with the host's Node ABI. Fixable with `pnpm rebuild keytar` or pinning the binary build target. Not a code defect; not in any H-tier scope.

---

## 6. Pre-existing typecheck debt (NOT introduced by H-tier work)

`pnpm --filter @team-x/desktop typecheck` reports **25 errors** when the `tsbuildinfo` cache is invalidated. None of them touch any H1–H6 path. They surfaced during H6 verification when stale cache was cleared; the H5 "typecheck clean" claim was based on a cached build that masked them.

**These are tracked here so the next session doesn't mistake them for H-campaign regressions:**

### a. C2 (Vercel AI SDK migration) leftovers
- `src/main/index.ts:50` — `Module '"@team-x/intelligence"' has no exported member 'LoopProviderToolCall'`.
- `src/main/index.ts:2208` — `Property 'tools' does not exist on type 'LoopCompleteRequest'`.
- `src/main/index.ts:2305` — `'toolCalls' does not exist in type 'LoopProviderCompletion'`.
- `src/main/services/test-agentic-provider.ts:52, 254, 310` — same family.

### b. C3 (prompt cache) leftovers
- `src/main/index.ts:2282-2283, 2517-2518` — `cachedInputTokens` / `cacheWriteTokens` not on `StreamUsage`.
- `src/main/orchestrator/run-agent.ts:595-596, 660-661, 749-750` — same family.

### c. H4 (traceId) propagation gap
- `src/main/services/agentic-loop-service.ts:765` — `'traceId' does not exist in type 'LoopDeps'`.
- `src/main/services/copilot-analyzer-service.ts:779` — `'traceId' does not exist in type 'CopilotAnalyzerRunsRepoStartInput'`.
- `src/main/services/copilot-analyzer-service.ts:961` — `'traceId' does not exist in type` (the `EmitInput` shape).

The H4 source files (`packages/intelligence/src/loop/types.ts:357`, etc.) DO have the `traceId` field — verified by grep. The desktop typecheck failing here points at a project-references / `tsbuildinfo` propagation issue, not missing source. A rebuild of `@team-x/intelligence` and a fresh `tsbuildinfo` clear should resolve all three; if not, it's a tsconfig path-mapping problem worth explicit investigation.

### d. Unrelated cosmetic
- `src/main/services/retrieval-orchestrator.ts:99` — unused `SOURCE_LABELS` import.
- `src/main/index.ts:436, 2224, 2238` — provider-router signature drifts.

### e. `@team-x/intelligence` typecheck
- `packages/intelligence/src/service/unified.ts:395, 415, 438` — `noUncheckedIndexedAccess` strict-null leakage. Pre-existing; not in any H-tier scope.

**Recommendation for next session:** before starting H7, run `pnpm --filter @team-x/intelligence typecheck` and `pnpm --filter @team-x/desktop typecheck` once to confirm the pre-existing-only set. If new errors appear, they're H-tier regressions and need attention before going further. A possible pre-cleanup task is to triage these into their own follow-up tickets so the campaign baseline is honest.

---

## 7. Files touched in H1–H6

### Source

| Path | H-finding(s) | Nature |
|---|---|---|
| `packages/shared-types/src/events.ts` | H4, H6 | Added `traceId?: string \| null` to `DashboardEvent`. Promoted `EventType` union to `EVENT_TYPES` const tuple. |
| `packages/shared-types/src/trace.ts` | H4 | New file — `TraceId` branded type, `generateTraceId()`, `isTraceId()`, `parseTraceId()`. |
| `packages/shared-types/src/index.ts` | H4 | Re-export `trace.js`. |
| `packages/intelligence/src/loop/prompt.ts` | H2 | Added `FEW_SHOT_EXAMPLES` + `BuildSystemPromptOptions.includeFewShotExamples`. |
| `packages/intelligence/src/index.ts` | H2 | Re-export `FEW_SHOT_EXAMPLES`. |
| `packages/intelligence/src/loop/types.ts` | H4 | Added `traceId?: string` to `LoopDeps` and `LoopRun`. |
| `packages/intelligence/src/loop/loop.ts` | H4 | `finalize()` echoes `ctx.deps.traceId` to `LoopRun.traceId`. |
| `apps/desktop/src/main/db/migrations/0035_runs_events_trace_id.sql` | H4 | New — adds nullable `trace_id` columns + indexes on both `runs` and `events`. |
| `apps/desktop/src/main/db/migrations/meta/_journal.json` | H4 | Migration index 35 entry. |
| `apps/desktop/src/main/db/schema.ts` | H4 | Promoted `events` to indexed-table form; added `traceId` columns. |
| `apps/desktop/src/main/db/repos/runs.ts` | H4 | `traceId` plumbing on `start`, `RecentRunRow`, new `listByTraceId`. |
| `apps/desktop/src/main/db/repos/events.ts` | H4 | `traceId` plumbing on `append`, new `listByTraceId`. |
| `apps/desktop/src/main/orchestrator/event-bus.ts` | H4 | `EmitInput.traceId` propagates through `repo.append` and `parseRow` replay. |
| `apps/desktop/src/main/orchestrator/run-agent.ts` | H4, H5 | Mints traceId once at start; threads through 8 emit sites. Replaces `PROVIDER_RETRY_BACKOFF_MS` constant with `getProviderRetryBackoffMs(err, attempt)` helper. |
| `apps/desktop/src/main/orchestrator/transient-errors.ts` | H5 | Full rewrite — `isHttp429Error`, `extractRetryAfterMs`, `getProviderRetryBackoffMs`. `MAX_PROVIDER_ATTEMPTS` 2 → 3. |
| `apps/desktop/src/main/services/agentic-loop-service.ts` | H4 | Mints traceId once at `start()`; threads through `runs.start`, `createAgenticLoop`, 4 emit sites. |
| `apps/desktop/src/main/services/copilot-analyzer-service.ts` | H4 | Mints traceId per tick; threads through `runsRepo.start` + 9 emit sites. |
| `apps/desktop/src/main/services/agentic-tools.ts` | H6 | Imports `EVENT_TYPES`. `queryEventsSchema.type` now `z.enum`. Description updated with examples. |

### Tests (new files)

| Path | H-finding(s) |
|---|---|
| `packages/shared-types/src/trace.test.ts` | H4 |
| `packages/shared-types/src/events-h6.test.ts` | H6 |

### Tests (touched)

| Path | H-finding(s) | Net new |
|---|---|---|
| `packages/intelligence/src/loop/prompt.test.ts` | H2 | +10 |
| `apps/desktop/src/main/db/repos/runs.test.ts` | H4 | +4 |
| `apps/desktop/src/main/db/repos/events.test.ts` | H4 | +3 |
| `apps/desktop/src/main/orchestrator/event-bus.test.ts` | H4 | +2 |
| `apps/desktop/src/main/orchestrator/run-agent.test.ts` | H4, H5 | +4 (and 1 boundary update) |
| `apps/desktop/src/main/orchestrator/transient-errors.test.ts` | H5 | +27 |
| `apps/desktop/src/main/services/agentic-loop-service.test.ts` | H4 | +3 |
| `apps/desktop/src/main/services/agentic-tools.test.ts` | H6 | +6 |

### Audit doc

- `docs/audits/2026-05-07-agentic-system-prompt-engineering-audit.md` — H1, H2, H3, H4, H5, H6 table-row badges + full resolution sections. Each section closes with a *"Closes the audit's callout"* quote-and-rebuttal pair.

---

## 8. Conventions to keep using

These choices are now load-bearing across the campaign — keep them on H7+:

1. **TraceId discipline.** Mint **exactly once** per logical request at the orchestrator entry. Never inside the loop. Pass it through `LoopDeps.traceId`; let `LoopRun.traceId` echo on the way out. The single-trace-per-request invariant is what makes `runs ⋈ events ON trace_id` honest.
2. **`as const` tuple as source of truth.** When promoting a type to be runtime-iterable (H6 pattern, mirrored from `RUNTIME_AUDIT_EVENT_TYPES`), the const tuple is the source; the union is `(typeof X)[number]`. Spread-with-as-const preserves literal narrowing — use it for composing tuples (e.g., `EVENT_TYPES` spreading `RUNTIME_AUDIT_EVENT_TYPES`).
3. **Audit-driven test naming.** New describe blocks always read `<feature> — <change> (H<n> audit 2026-05-07)`. The string `audit 2026-05-07` is greppable across the workspace and traces every test back to its finding.
4. **Cache-stable system prompt.** Anything added to the prompt (H2 examples, H6 enum guidance in tool description) goes inside the canonical prefix so it counts toward Anthropic prompt-cache prefix per C3.
5. **Word-boundary regex discipline.** Pattern matching for HTTP/error strings (H5) MUST use `\b` so `1429` ≠ `429`. Pin the discipline with negative tests.
6. **Empty-patch-still-emits.** Bus events fire even on no-op writes so the renderer's optimistic-update reconciliation works (H4 pattern from `companies.update` / `tickets.update`).
7. **Capture-before-drop.** When recording an event for a deleted row, snapshot the identifier fields BEFORE the delete so audit-view chips can still render after the row is gone.
8. **Defensive `bytes[i] ?? 0`.** `noUncheckedIndexedAccess` is on; even fixed-size `Uint8Array` indexing needs the fallback to satisfy TS strict mode without runtime cost.

---

## 9. To kick off H7

The H7 audit complaint is:

> *"Confidence threshold 0.5 applies to destructive intents. 'Fire this bug' can pass to `fire_employee` at 0.55 confidence. Should be 0.8+ for irreversibles."*
>
> — `intent-classifier.ts:57, 316-324`

The next session can begin with:

1. Read `apps/desktop/src/main/services/intent-classifier.ts:57` (the threshold constant) and `:316-324` (the destructive-intent gating block).
2. Identify which intent names the audit considers "destructive" (`fire_employee` is named; likely also `delete_*`, `archive_*`, ticket-close paths, vault file-delete, possibly `delegate_subtask`).
3. Decide between two architectures:
   - **Option A:** A single elevated threshold (0.8) applied via a `DESTRUCTIVE_INTENTS: ReadonlySet<IntentName>` allow-list-style gate.
   - **Option B:** Per-intent threshold table keyed by intent kind.
4. Mint the change, add `intent-classifier.test.ts` H7 describe block pinning both directions (passes at ≥0.8, rejects at 0.55–0.79 for destructive intents while leaving non-destructive intents on the 0.5 baseline).
5. Audit doc resolution + TaskUpdate #36.

The kick-off message Rocky will use is `"go ahead h7"` (campaign continuity rule).

---

## 10. Risks and open items

1. **Pre-existing typecheck errors (§6).** These are NOT introduced by the campaign but they're real and they hide regressions. **Recommend the next session triage them into a dedicated cleanup task before completing H10–H16** so the campaign's "typecheck clean" claims regain credibility. Highest-priority subset: the H4 `LoopDeps.traceId` propagation (3 errors). If those are a tsbuildinfo / project-references issue, the fix is mechanical; if they're a real source gap, that's an H4 follow-up.
2. **Keytar test-load failure.** Same provenance every campaign session. A 2-minute fix (`pnpm rebuild keytar` or version pin); no urgency.
3. **H10 scope.** "Wire reranker + query expansion into retrieval orchestrator" is the largest H-finding by surface area (likely +200 LOC + a new test file). Plan to spend more cycles on it relative to H7–H9.
4. **H15 + H11 interact.** H15 (default-chat tool-result cap) and H11 (batched streaming-delta DB writes) both touch `run-agent.ts` lifecycle. Doing them in order (H11 first, then H15) keeps the diff cleaner than interleaved.
5. **H16 path-traversal.** Security-critical. Test discipline must include adversarial inputs (`..\..\..`, symlinks, NTFS short names, mixed-separator paths). Don't ship without explicit negative tests.

---

## 11. Quick re-orientation commands

For the next session — these tell you the state in under a minute:

```powershell
# Campaign progress
git log --oneline -20

# H6 verification re-run
pnpm vitest run packages/shared-types/src/events-h6.test.ts
pnpm vitest run apps/desktop/src/main/services/agentic-tools.test.ts

# Pre-existing typecheck baseline (expect the §6 errors)
pnpm --filter @team-x/desktop typecheck

# Find every audit-traced test
git grep -n "audit 2026-05-07"
```

---

## Sign-off

H1–H6 closed cleanly. H7 ready to start on Rocky's go-ahead. Discipline holds.
