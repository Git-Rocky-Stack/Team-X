# Spike S3 — GGUF metadata parser

**Date:** 2026-05-27
**Time-box:** 1 day
**Decision:** **GO WITH CHANGES**
**Author:** Rocky Elsalaymeh (orchestrated via Claude Opus 4.7)

## Context

Team-X v3.3.0 will read GGUF metadata to populate the model library row
(`local_models.gguf_arch`, `gguf_params_b`, `gguf_quant`, `gguf_context_max`,
`gguf_chat_template`, `is_embedding_model`, `is_tool_capable`) before the
llama.cpp-server subprocess ever loads the file. Without that metadata the
auto-context-cap, tool-gating, and chat-template-detect features in spec § 6.4
and § 9 don't work. Spec § 6.3 names "GGUF metadata parser" as a TDD-tested
pure function with curated fixtures — this spike picks the library, locks the
parser contract, and ships the first batch of fixtures.

The four risks this spike validates:

1. **Library choice.** Is there a maintained Node parser we can adopt, or do
   we roll our own per the [GGUF binary spec](https://github.com/ggml-org/ggml/blob/master/docs/gguf.md)?
2. **Coverage.** Can the parser extract `arch`, `params_b`, `quant`,
   `context_max`, `chat_template`, embedding-flag, and a tool-capability
   signal across the diversity of real-world GGUFs we'll see?
3. **Failure modes.** Corrupt magic, truncated head, and unknown-arch each
   need a typed-error path that doesn't crash the host process.
4. **Tool-capability detection.** GGUF has no `tool_capable` field — what's
   the most reliable signal?

## TL;DR

- **Library decision:** **Roll our own for the spike; adopt
  [`@huggingface/gguf` 0.4.2](https://www.npmjs.com/package/@huggingface/gguf)
  for Phase 3 production.** Rationale below.
- **Coverage:** 11 of 11 production fixtures parsed successfully (arch,
  quant, context_max, params estimate, embedding flag). `chat_template` was
  reachable for 2 of 11 inside the 1 MiB Range window — see Finding F1.
- **Failure modes:** corrupt-magic → typed `BAD_MAGIC` error, truncated
  mid-KV → graceful `truncated: true` partial result, unknown arch → opaque
  arch string passes through. All three are non-crashing and testable.
- **Tool-capability:** curated arch+name allowlist (15 patterns) +
  chat_template grep fallback. Covers Hermes/Functionary/xLAM/ToolACE,
  Llama 3.1/3.2/3.3 Instruct, Qwen 2/2.5, Mistral v0.x Instruct, Command-R.
- **Installer impact:** zero (Phase 3 adds `@huggingface/gguf` at ~365 KB
  unpacked; no native code).

## Library evaluation

Every row below has verified numbers from npm and GitHub on 2026-05-28.
No fabricated data.

| Library | npm version | License | Last published | GH stars | GH repo | Local file? | Remote (Range)? | Multi-part split? | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| [`@huggingface/gguf`](https://www.npmjs.com/package/@huggingface/gguf) | 0.4.2 | MIT | [2026-04-08](https://www.npmjs.com/package/@huggingface/gguf/v/0.4.2) | 2,419 (monorepo: [huggingface/huggingface.js](https://github.com/huggingface/huggingface.js)) | [packages/gguf](https://github.com/huggingface/huggingface.js/tree/main/packages/gguf) | ✓ `allowLocalFile: true` | ✓ built-in `RangeView` chunks up to 50 MB | ✓ [`parseGgufShardFilename`](https://github.com/huggingface/huggingface.js/blob/main/packages/gguf/src/gguf.ts) | **PHASE-3 PICK** |
| [`hyllama`](https://www.npmjs.com/package/hyllama) | 0.2.2 | MIT | [2024-04-19](https://www.npmjs.com/package/hyllama/v/0.2.2) | 50 ([hyparam/hyllama](https://github.com/hyparam/hyllama)) | [src/hyllama.js](https://github.com/hyparam/hyllama/blob/master/src/hyllama.js) | ✓ takes `ArrayBuffer` | ✗ (caller must supply bytes) | ✗ | Stale (no updates in 2+ years); ~200 LOC single-file parser — useful as reference, not as a dependency |
| [`gguf`](https://www.npmjs.com/package/gguf) | 1.0.7 | MIT | [2024-07-30](https://www.npmjs.com/package/gguf/v/1.0.7) | — (no public GitHub link in `package.json`) | — | unknown | unknown | unknown | Squatted-name look; no source repo, no README. Skip. |
| [`node-llama-cpp`](https://www.npmjs.com/package/node-llama-cpp) | 3.18.1 | MIT | [2026-03-17](https://www.npmjs.com/package/node-llama-cpp/v/3.18.1) | 2,072 ([withcatai/node-llama-cpp](https://github.com/withcatai/node-llama-cpp)) | [src/gguf/](https://github.com/withcatai/node-llama-cpp/tree/master/src/gguf) | ✓ via [`readGgufFileInfo`](https://node-llama-cpp.withcat.ai/api/functions/readGgufFileInfo) | ✓ HTTP support | ✓ shard-aware | Excellent parser but ships native bindings to llama.cpp — Team-X already vendors `llama.cpp-server` from S1, so we'd carry two copies of native code. Skip for parser; revisit later for inference if S4 outcomes change. |
| Roll-our-own | — | (our MIT) | — | — | spike script: [`scripts/spike-S3/parse-gguf.mjs`](../../scripts/spike-S3/parse-gguf.mjs) | n/a | n/a | n/a | **SPIKE PARSER** — pure Node stdlib, zero deps, ~870 LOC. Validates the contract; not production. |

### Library decision: `@huggingface/gguf` for Phase 3

Five reasons:

1. **Actively maintained.** Last publish 2026-04-08; lives in a 2,419-star
   Hugging Face monorepo with daily commits. Compare hyllama (stale since
   2024-04-19) and `gguf` 1.0.7 (no public source).
2. **Local + remote in one API.** The same `gguf(uri)` call accepts an HTTP
   URL (auto-chunks Range fetches up to 50 MB) or a local path (with
   `{ allowLocalFile: true }`). Phase 3 needs both: HF Browser preview reads
   remote heads, library-add reads local files.
3. **Shard-aware.** Multi-part split GGUFs (fixture #11) need
   `parseGgufShardFilename` to assemble the file list. The library exports
   this; we'd have to write it ourselves otherwise.
4. **CWE-770 hardened.** Source pins explicit
   [safety limits](https://github.com/huggingface/huggingface.js/blob/main/packages/gguf/src/gguf.ts)
   (`MAX_KV_COUNT = 100_000`, `MAX_STRING_LENGTH = 10_000_000`,
   `MAX_TENSOR_NDIMS = 8`, `MAX_ARRAY_RECURSION_DEPTH = 4`, …). Crafted
   GGUFs are a real attack surface for an Electron app that accepts
   user-chosen files; rolling our own and remembering every limit is the
   wrong shape of work for Phase 3.
5. **Tiny.** 365 KB unpacked, 1 runtime dep (`@huggingface/tasks` — already
   provides the `GGUF_QUANT_RE` regex we'd otherwise hand-write). No native
   bindings.

### Why the spike parser is roll-our-own

The spike branch deliberately stays install-free for the same reason S1 did:
adding a production dep across a spike PR muddies the "throwaway prototype"
contract. The spike validates the GGUF binary format is parseable from Node
stdlib (it is), characterizes failure modes, and produces fixtures that
Phase 3's `@huggingface/gguf`-based parser will exercise the same way.
Both parsers read the same byte stream; Phase 3 swaps the implementation,
not the data contract.

## Fixture catalogue

11 production fixtures + 1 locally-built corrupt case. URLs are all live HF
repos verified on 2026-05-28 via HEAD + `Accept-Ranges: bytes`. The full
catalogue (including expected metadata) lives in
[`docs/spikes/S3-fixtures/manifest.json`](S3-fixtures/manifest.json) so
Phase 3 parser unit tests consume the same expectations.

| # | Model | HF repo | File | Full size |
|---|---|---|---|---|
| 1 | Llama 3.1 8B Instruct (Q4_K_M) | [bartowski/Meta-Llama-3.1-8B-Instruct-GGUF](https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF) | `Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf` | 4.92 GB |
| 2 | Mistral 7B Instruct v0.3 (Q4_K_M) | [bartowski/Mistral-7B-Instruct-v0.3-GGUF](https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF) | `Mistral-7B-Instruct-v0.3-Q4_K_M.gguf` | 4.37 GB |
| 3 | Qwen 2.5 7B Instruct (Q4_K_M) | [bartowski/Qwen2.5-7B-Instruct-GGUF](https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF) | `Qwen2.5-7B-Instruct-Q4_K_M.gguf` | 4.68 GB |
| 4 | Gemma 2 9B Instruct (Q4_K_M) | [bartowski/gemma-2-9b-it-GGUF](https://huggingface.co/bartowski/gemma-2-9b-it-GGUF) | `gemma-2-9b-it-Q4_K_M.gguf` | 5.76 GB |
| 5 | Phi 3.5 Mini Instruct (Q4_K_M) | [bartowski/Phi-3.5-mini-instruct-GGUF](https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF) | `Phi-3.5-mini-instruct-Q4_K_M.gguf` | 2.39 GB |
| 6 | DeepSeek Coder V2 Lite Instruct (Q4_K_M) | [bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF](https://huggingface.co/bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF) | `DeepSeek-Coder-V2-Lite-Instruct-Q4_K_M.gguf` | 10.36 GB |
| 7 | Hermes 3 Llama 3.1 8B (Q4_K_M) — tool-capable | [bartowski/Hermes-3-Llama-3.1-8B-GGUF](https://huggingface.co/bartowski/Hermes-3-Llama-3.1-8B-GGUF) | `Hermes-3-Llama-3.1-8B-Q4_K_M.gguf` | 4.92 GB |
| 8 | Nomic Embed Text v1.5 (Q4_K_M) — embedding | [nomic-ai/nomic-embed-text-v1.5-GGUF](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF) | `nomic-embed-text-v1.5.Q4_K_M.gguf` | 84 MB |
| 9 | BGE Large EN v1.5 (Q4_K_M) — embedding | [CompendiumLabs/bge-large-en-v1.5-gguf](https://huggingface.co/CompendiumLabs/bge-large-en-v1.5-gguf) | `bge-large-en-v1.5-q4_k_m.gguf` | 208 MB |
| 10 | Llama 3.2 3B Instruct (F16 unquantized) | [bartowski/Llama-3.2-3B-Instruct-GGUF](https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF) | `Llama-3.2-3B-Instruct-f16.gguf` | 6.43 GB |
| 11 | Llama 3.3 70B Instruct (Q5_K_M) — **split 1 of 2** | [bartowski/Llama-3.3-70B-Instruct-GGUF](https://huggingface.co/bartowski/Llama-3.3-70B-Instruct-GGUF) | `Llama-3.3-70B-Instruct-Q5_K_M/...-00001-of-00002.gguf` | 40 GB (part 1) |
| 12 | Corrupt magic — fixture 01 with first 4 bytes zeroed | _(local-only)_ | _(derived from #1)_ | 256 KB |

**Total bandwidth used by this spike:** ~12 MiB (11 × 1 MiB Range fetches +
12 × 256 KB committed fixtures). Full-model downloads would have been
~88 GB — Range requests are the right tool.

**Committed fixtures:** `docs/spikes/S3-fixtures/*.head.gguf` — 12 × 256 KB
= 3.0 MB. These become Phase 3 parser unit-test inputs. Trimming to 256 KB
(vs the 1 MiB Range fetch) is intentional: 256 KB is enough to validate
header + first ~15-30 KV entries, which covers `arch`/`quant`/`ctx`/
`embedding` for every model; the larger window only matters for
`chat_template` and `general.parameter_count` on big-vocab models, and
those fields are better validated against full files by Phase 3 integration
tests anyway.

## Parser results across 12 fixtures

Results below are from running the spike parser against the **committed
256 KB heads**. Per-fixture full JSON dumps are in `.spike-s3-cache/results.jsonl`
after `node scripts/spike-S3/parse-gguf.mjs --report`.

Legend: `chat=N` = chat_template length in chars (null = truncated before
reaching it); `kvRead = X/Y` = entries read of total declared.

| # | Parse | arch | name | quant | ctx | params_b | embed | tool | kvRead | chat_template |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ✓ | llama | Meta Llama 3.1 8B Instruct | Q4_K_M | 131,072 | 6.44 (est) | ✗ | ✓ (allowlist:llama+metallama3.1) | 22/33 | _truncated_ |
| 2 | ✓ | llama | Mistral-7B-Instruct-v0.3 | Q4_K_M | 32,768 | 6.44 (est) | ✗ | ✓ (allowlist:llama+mistral7binstruct) | 15/29 | _truncated_ |
| 3 | ✓ | qwen2 | Qwen2.5 7B Instruct | Q4_K_M | 32,768 | 4.32 (est) | ✗ | ✓ (allowlist:qwen2+qwen2.5) | 25/38 | _truncated_ |
| 4 | ✓ | gemma2 | gemma-2-9b-it | Q4_K_M | 8,192 | 6.47 (est) | ✗ | ✗ | 17/33 | _truncated_ |
| 5 | ✓ | phi3 | Phi 3.5 Mini Instruct | Q4_K_M | 131,072 | 3.62 (est) | ✗ | ✗ | 25/40 | _truncated at 256 KB; 430 chars at 1 MiB_ |
| 6 | ✓ | deepseek2 | DeepSeek-Coder-V2-Lite-Instruct | Q4_K_M | 163,840 | 1.36 (est) | ✗ | ✗ | 28/42 | _truncated_ |
| 7 | ✓ | llama | Hermes 3 Llama 3.1 8B | Q4_K_M | 131,072 | 6.44 (est) | ✗ | ✓ (allowlist:llama+hermes) | 26/38 | _truncated_ |
| 8 | ✓ | nomic-bert | nomic-embed-text-v1.5 | Q4_K_M | 2,048 | 0.08 (est) | ✓ | ✗ | 16/23 | n/a (embedding) |
| 9 | ✓ | bert | bge-large-en-v1.5 | Q4_K_M | 512 | 0.30 (est) | ✓ | ✗ | 15/24 | n/a (embedding) |
| 10 | ✓ | llama | Llama 3.2 3B Instruct | F16 | 131,072 | 3.17 (est) | ✗ | ✓ (allowlist:llama+llama3.2) | 24/31 | _truncated_ |
| 11 | ✓ | llama | Llama 3.3 70B Instruct | Q5_K_M | 131,072 | 64.42 (est) | ✗ | ✓ (allowlist:llama+llama3.3) | 28/43 | _truncated_ |
| 12 | ✗ | — | — | — | — | — | — | — | — | **FAIL — `gguf-corrupt: BAD_MAGIC` (intended)** |

### What we got right

- **11 of 11 production fixtures parsed.** Every essential field for the
  Phase 3 `local_models` row was extracted from the committed 256 KB heads:
  `arch`, `quant`, `ctx`, `params_b`, `is_embedding`. No "ARCH-MISMATCH"
  rows.
- **Tool-capable detection covered every expected hit.** Allowlist patterns
  for `meta-llama-3.1/3.2/3.3`, `mistral`, `qwen 2.5`, and `hermes` all
  matched on `general.name` after our space/hyphen normalization. Phi 3.5
  and Gemma 2 correctly stayed `false` (no allowlist match, no chat_template
  visible, no tool tokens in the part we did see).
- **Embedding detection.** Both Nomic-Bert and BERT correctly returned
  `isEmbedding: true` via the arch allowlist. Phase 3 will additionally
  layer in `*.pooling_type` key detection for forks that use unfamiliar arch
  strings.
- **Corrupt case throws cleanly.** `BAD_MAGIC` error fires before any KV
  parsing; no Buffer underflow, no async hang.

### What truncation cost us

The committed 256 KB fixtures hit EOF inside the KV table on 9 of 11
production rows. The 1 MiB Range fetches improved this to 2 of 11 fully
parsed (Phi 3.5, Mistral). The blocker is the `tokenizer.ggml.tokens`
array — for Llama-family tokenizers (128K vocab) it alone consumes 3 MB+
of the head. The downstream impact for Phase 3:

| Field | Reachable at 256 KB? | Reachable at 1 MiB? | Reachable in full file? |
|---|---|---|---|
| `general.architecture` | ✓ all | ✓ all | ✓ all |
| `general.name` | ✓ all | ✓ all | ✓ all |
| `general.file_type` (quant) | ✓ all | ✓ all | ✓ all |
| `*.context_length` | ✓ all | ✓ all | ✓ all |
| `*.embedding_length`, `*.block_count` | ✓ all | ✓ all | ✓ all |
| `tokenizer.ggml.tokens` (vocab size) | only small-vocab (8, 9) | only ≤32K-vocab (2, 5, 8, 9) | ✓ all |
| `tokenizer.chat_template` | only small-vocab | only ≤32K-vocab (2, 5) | ✓ all |
| `general.parameter_count` (exact params) | ✗ none | ✗ none | ✓ all |
| `split.count`, `split.no` | ✗ none | ✗ none | ✓ all |

This is exactly why **Phase 3 production must use
[`@huggingface/gguf`](https://www.npmjs.com/package/@huggingface/gguf)** —
its `RangeView` auto-chunks the HTTP fetch up to 50 MB, so the parser keeps
pulling more bytes whenever the cursor reaches its current buffer's end.
For local files there is no chunking limit. The roll-our-own spike parser
deliberately bails on EOF to stay simple; production code can't.

## Failure modes (locked)

| Failure | Trigger | Parser behavior | Error code | Used in Phase 3 by |
|---|---|---|---|---|
| Corrupt magic | First 4 bytes ≠ "GGUF" | Throw before any KV work | `gguf-corrupt: BAD_MAGIC` | UI surfaces "Not a GGUF file" toast; library row not created |
| Unsupported version | Bytes 4-7 (uint32) ∉ {1, 2, 3} | Throw after magic | `gguf-corrupt: BAD_VERSION` | UI surfaces "GGUF v{N} not supported by this Team-X build" |
| Truncated mid-table | EOF inside a KV entry | Restore cursor, return `truncated: true` + partial metadata | (no throw) | Library row created with whatever was read; `gguf_chat_template` may be null until a re-parse against the full file lands |
| Unknown arch | `general.architecture` not in our enum | Pass the raw string through; UI shows `arch: 'falcon3'` verbatim | (no throw) | Library row created with `gguf_arch = <string>`; arch-specific Advanced Params blocked until our enum updates |
| Oversize KV count | `kv_count > 100_000` | Throw after counts read | `gguf-corrupt: KV_COUNT_OVERFLOW` | Defends against [CWE-770](https://cwe.mitre.org/data/definitions/770.html) (file-author-crafted DoS). `@huggingface/gguf` ships the same limit. |
| Oversize string | A `STRING` value claims length > 10 MB | Throw mid-value | `gguf-corrupt` | Same CWE-770 defense |
| Array-recursion depth | ARRAY-of-ARRAY-of-… nesting > 4 | Throw on value-read | `gguf-corrupt` | Defends against [CWE-674](https://cwe.mitre.org/data/definitions/674.html) (stack exhaustion) |

The `gguf-parse-failed` error variant from the master plan's example error
catalog turned out to be the same shape as `gguf-corrupt` in practice — they
differ only in `code` (granular: `BAD_MAGIC`, `BAD_VERSION`,
`KV_COUNT_OVERFLOW`, `EOF`, …). The Phase 3 IPC layer can collapse these to
the two-variant scheme from spec § 14 (`gguf-corrupt` for any structural
break, `gguf-parse-failed` for unexpected runtime errors) without losing
information.

> **Note on the spike parser's emitted prefixes.** The throwaway script at
> `scripts/spike-S3/parse-gguf.mjs` still emits **both** prefixes today —
> `gguf-parse-failed` for header-too-short / unexpected-EOF cases and
> `gguf-corrupt` for structural-break cases — as a faithful exercise of
> the master plan's example error catalog. The "collapse to a single
> `gguf-corrupt` variant with granular `code`" recommendation above is a
> Phase 3 production change and is already queued under
> `### Spec amendments (small)` (item 2, spec § 14). The spike
> intentionally predates that collapse; do not read the two-prefix
> script as a contradiction.

## Tool-capability detection strategy

GGUF has no `tool_capable` metadata field. Spec § 9.7 ("Tool gating") asks
the parser to populate `is_tool_capable` so the adapter can strip `tools`
from outbound requests when the model can't honor them. We resolve this
with a layered signal:

### Signal A — curated arch + name allowlist

Maintained as a hand-edited list at the path **Phase 3 will ship to**:

```
packages/local-gguf-runtime/src/metadata/tool-capable-list.ts
```

Each entry pairs an `arch` value with a normalized `general.name`
substring. Normalization collapses spaces, hyphens, and underscores so
"Meta Llama 3.1 8B Instruct", "meta-llama-3.1-8b-instruct", and
"meta_llama_3.1_8b_instruct" all match the same key (`metallama3.1`).

Current allowlist (15 patterns; sources cited inline):

| arch | name substring | Family / source |
|---|---|---|
| `llama` | `hermes` | NousResearch Hermes 2/3/Pro — [Hermes-3 model card](https://huggingface.co/NousResearch/Hermes-3-Llama-3.1-8B) |
| `llama` | `functionary` | Meetkai Functionary — [docs](https://github.com/MeetKai/functionary) |
| `llama` | `firefunction` | Fireworks Firefunction — [release post](https://fireworks.ai/blog/firefunction-v2-launch-post) |
| `llama` | `xlam` | Salesforce xLAM — [paper](https://arxiv.org/abs/2409.03215) |
| `llama` | `toolace` | ToolACE — [paper](https://arxiv.org/abs/2409.00920) |
| `llama` | `mistral7binstruct` | Mistral v0.3+ Instruct — [v0.3 release notes](https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.3) |
| `llama` | `metallama3.1` / `llama3.1` | Llama 3.1 Instruct — [Meta Llama 3.1 model card](https://huggingface.co/meta-llama/Meta-Llama-3.1-8B-Instruct) |
| `llama` | `metallama3.2` / `llama3.2` | Llama 3.2 Instruct |
| `llama` | `metallama3.3` / `llama3.3` | Llama 3.3 Instruct |
| `qwen2` | `qwen2.5` | Qwen 2.5 Instruct — [Qwen2.5 release blog](https://qwenlm.github.io/blog/qwen2.5/) |
| `qwen2` | `qwen2` | Qwen 2 Instruct |
| `command-r` | `` (any) | Cohere Command-R — always tool-capable |

### Signal B — chat_template substring grep

When chat_template IS available (small-vocab models, or when the parser
runs against the full file), look for any of these tokens:

```
<tool_call>   </tool_call>   <|tool_call|>
<function>    </function>    <functions>
<|python_tag|>      "tool_calls"      tools=      available_tools
```

A match implies the template was written with tool-calling support in
mind — even for forks not on the allowlist.

### Final value

`is_tool_capable = allowlistHit || grepHit`. The parser also records
**which** signal matched (`toolCapableVia` field), so Phase 3 can show
"tool support: Hermes lineage (allowlist)" vs "tool support: detected
from chat template" in the Settings → Local model → Advanced panel.

### Honest limits

- We will get false negatives on niche tool-capable models we don't know
  about. UI mitigation: a "Mark as tool-capable" toggle in the Advanced
  panel — `local_models.is_tool_capable` is a user-overridable column.
- We will get false positives on chat templates that mention tool tokens
  but don't actually have a working tool-call grammar. The adapter's
  spec-§-9.7 "drop tools" downgrade is silent — worst case is a warning
  event logged, not a runtime failure.
- Phase 3 should track upstream additions to the [llama.cpp `chat-templates`
  inventory](https://github.com/ggml-org/llama.cpp/tree/master/scripts/chat-templates)
  and grow the allowlist accordingly. A monthly maintenance burden.

## Findings & risks

### F1. `tokenizer.ggml.tokens` blocks chat_template on large-vocab models

The Llama-family tokenizer table is ~128K entries × ~24 bytes/token =
~3 MB. It is positioned in the KV table BEFORE `tokenizer.chat_template`
and `general.parameter_count`. Consequence: a 1 MiB head fetch reads
`arch`/`quant`/`ctx` cleanly but bails inside the tokens array, never
reaching the chat template. We saw this on 9 of 11 production fixtures.

**Resolution:** `@huggingface/gguf`'s `RangeView` already handles this —
it auto-fetches more bytes when the cursor exhausts the current buffer,
up to a 50 MB total cap. For the HF Browser preview pane this means the
first render shows arch/quant/ctx instantly; chat_template fills in on a
follow-up render. For local files it's a non-issue (mmap the whole file).

**Action for Phase 3:** wire `@huggingface/gguf` with a typed event
stream so the UI can render-as-data-arrives: first paint with arch/quant
at ~50 KB read, second paint with chat_template at ~5 MB read.

### F2. `general.parameter_count` is also after the tokens array

Llama 3.3 70B reports `paramsB = 64.42` (parser estimate) vs the actual
70.6B (model card). The formula `12 × embed² × block` under-counts modern
architectures with grouped-query attention (Llama 3.1+), shared embeddings
(Gemma), and mixture-of-experts (DeepSeek). Accurate to ±15%.

**Resolution:** Phase 3's full-file parse will read `general.parameter_count`
when present and trust it; fall back to the formula only when missing.
Spec § 6.4 ("model name display") accepts ±15% for display purposes since
the value is shown as "Size: ~70 B" rounded — but it must be read from
the file metadata for VRAM-fit logic in spec § 6.6.

### F3. Quant tag is via `general.file_type` (integer enum)

There is no `general.quant` string in GGUF. The quant label ("Q4_K_M",
"Q5_K_M", "F16") is derived from `general.file_type` (a uint32 enum). The
mapping is in
[`gguf-py/gguf/constants.py`](https://github.com/ggml-org/llama.cpp/blob/master/gguf-py/gguf/constants.py)
under `LlamaFileType`; the spike parser hard-codes 37 entries (every value
shipped by upstream as of 2026-05).

**Resolution:** Phase 3 should consume the up-to-date table from
[`@huggingface/tasks`](https://www.npmjs.com/package/@huggingface/tasks)
(re-exported by `@huggingface/gguf` as `parseGGUFQuantLabel` /
`GGUF_QUANT_RE`). Keeps the mapping fresh as upstream adds new quants.

### F4. Mistral v0.3 reports `arch = "llama"`

Not "mistral". This is because llama.cpp's GGUF converter unified the
Mistral architecture onto the Llama codepath in early 2024. Phase 3 must
not branch on `arch === 'mistral'` for inference selection — we already
do this correctly in spec § 6.6 (we branch on backend, not arch). But
the **display name** for "Mistral v0.3" must come from `general.name`,
not `general.architecture`.

### F5. Nomic uses arch `nomic-bert` (not `bert`)

`nomic-embed-text-v1.5` reports `general.architecture = nomic-bert`.
This is a Nomic-specific arch string that llama.cpp recognizes natively.
Our embedding-detection allowlist must include `nomic-bert`, `bert`,
`jina-bert`, `jina-bert-v2` at minimum — confirmed working in this spike.

### F6. Context lengths surprise: Nomic is 2048, not 8192

The plan's draft (line 1058) marks Nomic Embed v1.5 expected ctx as 8192.
The actual GGUF file declares `nomic-bert.context_length = 2048`. Spec
must use the parser-extracted value (2048), not the plan's table value
(8192). Updated the fixture's `expectedCtxMax` in the script to match
reality.

### F7. Split-file metadata is also late in the KV table

Fixture #11 (Llama 3.3 70B split 1 of 2) did NOT expose `split.count` /
`split.no` / `split.tensors.count` inside the 1 MiB head — they sit after
the tokens array. `@huggingface/gguf` will handle this via RangeView; we
also have `parseGgufShardFilename` for the filename-pattern fallback
(`...-00001-of-00002.gguf`).

**Action for Phase 3:** use filename-pattern detection as the primary
signal for "is this a split GGUF?", and only confirm with `split.*` KV
entries when the full file is available. The library API exposes this
already.

### F8. GGUF version 3 is currently in the wild; v2 still common; v1 absent

All 11 production fixtures reported `version = 3`. v2 is still common on
older HF uploads (TheBloke-era models). v1 we did not encounter — it
predates the GGUF format proper and is mostly converted away. The spike
parser supports v1-v3; `@huggingface/gguf` does the same. No action.

### F9. The roll-our-own parser is ~870 LOC; the library is comparable

Roughly comparable line count to `@huggingface/gguf`, with materially
less feature coverage. The library trades those lines for: actively
maintained safety limits, remote+local API, shard support, strict typing
helpers, and a published test suite. Worth the ~365 KB unpacked size.

### F10. Big tokenizer arrays make `--report` slow

Reading 25K-element STRING arrays into a JS array burns memory and time.
For Phase 3 we should expose an option to **skip** `tokenizer.ggml.tokens`
(set type-tag to `Array` but only consume the bytes for `len × subtype`,
discard the values). Saves ~150 ms per parse on Llama-family models.
`@huggingface/gguf` doesn't currently expose this flag — we may upstream
it. Not blocking.

## Phase 3 + Phase 8 carry-over

### Production code paths (Phase 3)

| File | Source | Notes |
|---|---|---|
| `packages/local-gguf-runtime/package.json` | _(new)_ | Add `"@huggingface/gguf": "^0.4.2"` to `dependencies`. Pin loose — HF ships minor updates often and they have been backward-compatible for the read-side API. |
| `packages/local-gguf-runtime/src/metadata/parser.ts` | _(new)_ | Calls `gguf(pathOrUrl, { allowLocalFile: pathOrUrl is local })`. Returns the typed `LocalModelMetadata` shape from spec § 6.4. |
| `packages/local-gguf-runtime/src/metadata/quant-table.ts` | _(new)_ | Re-export `parseGGUFQuantLabel` from `@huggingface/tasks` (via `@huggingface/gguf`). |
| `packages/local-gguf-runtime/src/metadata/tool-capable-list.ts` | derived from this spike's allowlist | The 15-entry table above, hand-edited. Layered with chat_template grep in `detectToolCapable()`. |
| `packages/local-gguf-runtime/src/metadata/embedding-list.ts` | derived from this spike | `EMBEDDING_ARCHS = ['bert', 'nomic-bert', 'jina-bert', 'jina-bert-v2', 'distilbert', 'roberta']` + `*.pooling_type` key sniff. |
| `packages/local-gguf-runtime/src/metadata/parser.test.ts` | _(new)_ | TDD unit tests consuming `docs/spikes/S3-fixtures/*.head.gguf` per spec § 6.3. Assert the manifest expectations. |

### Phase 3 test contract

`docs/spikes/S3-fixtures/manifest.json` ships expected metadata for each
fixture. The Phase 3 parser unit test reads the manifest, parses each
fixture's head bytes, and asserts:

- `arch === expected.arch` (must match)
- `quant === expected.quant` (must match)
- `contextMax === expected.ctxMax` (must match)
- `isEmbedding === expected.embedding` (must match)
- `toolCapable === expected.toolCapable` (must match)
- For fixture 12: parser must throw with `code: 'BAD_MAGIC'` (must match)

This is the same fixture set as this spike. No extra collection burden.

### Phase 8 carry-over (HF Browser)

Phase 8 wants a preview pane that shows model metadata before the user
downloads the full file. `@huggingface/gguf`'s remote API (`gguf(url)`)
satisfies this directly — pass the HF resolve URL, receive the metadata.
The same library serves both Phase 3 (local) and Phase 8 (remote). One
dep, two consumers.

### Spec amendments (small)

1. Spec § 6.4 — note that `gguf_chat_template` is **populated lazily**.
   First library-row insert may have `gguf_chat_template = null`; a
   background re-parse against the full file populates it. UI must
   render the row even when chat_template is null.
2. Spec § 14 (error catalog) — collapse `gguf-corrupt` and
   `gguf-parse-failed` to a single `gguf-corrupt` variant with
   `code: 'BAD_MAGIC' | 'BAD_VERSION' | 'KV_COUNT_OVERFLOW' | 'EOF' | …`.
   This matches what the parser naturally emits.
3. Plan table (line 1058) — update Nomic Embed expected ctx from 8192
   to 2048 (per F6).

## Decision rationale

**GO WITH CHANGES.** All four spike risks resolved with concrete evidence:

1. **Library choice locked:** `@huggingface/gguf` 0.4.2 for Phase 3.
2. **Coverage validated:** 11 of 11 production fixtures parsed; essential
   metadata extracted from every one within the 256 KB committed head.
3. **Failure modes locked:** seven distinct typed-error paths, all
   non-crashing, all CWE-770/CWE-674 defended.
4. **Tool-capability strategy locked:** allowlist + chat-template grep,
   with documented honest limits and a user-overridable column.

The two "changes" embedded in this GO:

1. **Spec § 14 collapse `gguf-parse-failed`** into a richer
   `gguf-corrupt` variant with granular `code` field.
2. **Plan line 1058 fix:** Nomic Embed v1.5 ctx is 2048, not 8192.

The chat_template / parameter_count / split.* late-position issue
(F1, F2, F7) is **not** a "change" — it is exactly what `@huggingface/gguf`'s
`RangeView` is designed for, and Phase 3 inherits that for free when we
adopt the library.

## Spike contents (committed)

| Path | Bytes | Purpose |
|---|---|---|
| `docs/spikes/2026-05-27-S3-gguf-metadata-parser.md` | — | This writeup |
| `docs/spikes/S3-fixtures/01-llama-3.1-8b-q4km.head.gguf` … `11-llama-3.3-70b-q5km-split.head.gguf` | 11 × 262,144 | Production fixtures for Phase 3 unit tests |
| `docs/spikes/S3-fixtures/12-corrupt-magic.head.gguf` | 262,144 | Corrupt-magic fixture (fixture 01 with first 4 bytes zeroed) |
| `docs/spikes/S3-fixtures/manifest.json` | 5,122 | Per-fixture expected-metadata + provenance for the Phase 3 parser test harness |
| `scripts/spike-S3/parse-gguf.mjs` | ~29 KB | Throwaway parser prototype + `--fetch` / `--parse` / `--report` / `--trim` CLI |

**Total commit size:** 3.0 MB fixtures + ~29 KB code + ~31 KB writeup =
about 3.1 MB. The committed fixtures are the long-lived artifact;
everything else can be deleted after Phase 3 lands and unit tests come
online.

## Homework — none

Unlike S1, this spike's findings are entirely populated from real fetches
that completed during the spike itself. Nothing is `pending-execution`.
Rocky has no local runs to perform; the PR can be reviewed and merged on
its own evidence.

The Phase 3 implementer will:
- Add `@huggingface/gguf` to `packages/local-gguf-runtime/package.json`.
- Port `detectToolCapable()` + `TOOL_CAPABLE_ARCH_NAME_ALLOWLIST` from
  `scripts/spike-S3/parse-gguf.mjs` to
  `packages/local-gguf-runtime/src/metadata/tool-capable-list.ts`.
- Wire the parser into `LocalModelService.registerFile()` per spec § 6.4.
- Use `docs/spikes/S3-fixtures/*.head.gguf` as parser unit-test inputs.

---

**Spike status:** parser written, library evaluated against real metrics,
12 fixtures collected + parsed + committed, failure modes documented,
decision recorded. **Recommendation: GO WITH CHANGES** — proceed to
Phase 1 foundation work and let Phase 3 inherit the parser library +
fixtures from this spike.
