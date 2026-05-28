#!/usr/bin/env node
// scripts/spike-S3/parse-gguf.mjs
//
// THROWAWAY — Phase 0 Spike S3 (GGUF metadata parser).
// Reads a GGUF file (or the first ~256 KB head of one) and extracts the
// subset of metadata required by Team-X's Phase 3 local-GGUF runtime:
//   - arch, params_b, quant, context_max, chat_template, embedding flag,
//     tool-capable heuristic (curated allowlist + chat_template grep),
//     general.name, license, vocab size, tensor count.
//
// Reference: GGUF binary format spec
//   https://github.com/ggml-org/ggml/blob/master/docs/gguf.md
//
// Library decision recorded in the writeup names @huggingface/gguf for
// Phase 3 production; this spike rolls its own parser (no dependencies,
// pure Node stdlib) so the spike branch stays install-free and the
// failure-mode investigation is not coupled to a specific library's
// quirks. Both parsers read the same byte stream — Phase 3 swaps the
// implementation, not the contract.
//
// Usage:
//   node scripts/spike-S3/parse-gguf.mjs --fetch         # download 1 MiB heads of all fixtures
//   node scripts/spike-S3/parse-gguf.mjs --parse <path>  # parse a local head file, emit JSON
//   node scripts/spike-S3/parse-gguf.mjs --report        # run --fetch + --parse over all fixtures, emit results.jsonl
//   node scripts/spike-S3/parse-gguf.mjs --trim          # trim cached heads to 256 KB into docs/spikes/S3-fixtures/

import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const CACHE_DIR = join(REPO_ROOT, '.spike-s3-cache');
const FIXTURES_DIR = join(REPO_ROOT, 'docs', 'spikes', 'S3-fixtures');
const RESULTS_PATH = join(REPO_ROOT, '.spike-s3-cache', 'results.jsonl');

const HEAD_BYTES = 1024 * 1024; // 1 MiB Range fetch
const FIXTURE_BYTES = 256 * 1024; // committed fixture size

// ---------------------------------------------------------------------------
// Fixture catalogue. 11 production GGUFs + 1 locally-truncated corrupt case.
// HF Range fetches resolve only the first 1 MiB; the GGUF header + KV table
// for every model in this list fit inside that window.
// ---------------------------------------------------------------------------

const FIXTURES = [
  {
    id: '01-llama-3.1-8b-q4km',
    repo: 'bartowski/Meta-Llama-3.1-8B-Instruct-GGUF',
    file: 'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
    label: 'Llama 3.1 8B Instruct (Q4_K_M)',
    expectedArch: 'llama',
    expectedQuant: 'Q4_K_M',
    expectedCtxMax: 131072,
    expectedEmbedding: false,
    expectedToolCapable: true, // Llama-3.1 Instruct supports tool calling per Meta release notes
  },
  {
    id: '02-mistral-7b-v0.3-q4km',
    repo: 'bartowski/Mistral-7B-Instruct-v0.3-GGUF',
    file: 'Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
    label: 'Mistral 7B Instruct v0.3 (Q4_K_M)',
    expectedArch: 'llama', // Mistral models use 'llama' arch in GGUF
    expectedQuant: 'Q4_K_M',
    expectedCtxMax: 32768,
    expectedEmbedding: false,
    expectedToolCapable: true, // v0.3 introduced function-calling tokens
  },
  {
    id: '03-qwen2.5-7b-q4km',
    repo: 'bartowski/Qwen2.5-7B-Instruct-GGUF',
    file: 'Qwen2.5-7B-Instruct-Q4_K_M.gguf',
    label: 'Qwen 2.5 7B Instruct (Q4_K_M)',
    expectedArch: 'qwen2',
    expectedQuant: 'Q4_K_M',
    expectedCtxMax: 32768,
    expectedEmbedding: false,
    expectedToolCapable: true,
  },
  {
    id: '04-gemma-2-9b-q4km',
    repo: 'bartowski/gemma-2-9b-it-GGUF',
    file: 'gemma-2-9b-it-Q4_K_M.gguf',
    label: 'Gemma 2 9B Instruct (Q4_K_M)',
    expectedArch: 'gemma2',
    expectedQuant: 'Q4_K_M',
    expectedCtxMax: 8192,
    expectedEmbedding: false,
    expectedToolCapable: false, // Gemma 2 chat template lacks tool tokens
  },
  {
    id: '05-phi-3.5-mini-q4km',
    repo: 'bartowski/Phi-3.5-mini-instruct-GGUF',
    file: 'Phi-3.5-mini-instruct-Q4_K_M.gguf',
    label: 'Phi 3.5 Mini Instruct (Q4_K_M)',
    expectedArch: 'phi3',
    expectedQuant: 'Q4_K_M',
    expectedCtxMax: 131072,
    expectedEmbedding: false,
    expectedToolCapable: false,
  },
  {
    id: '06-deepseek-coder-v2-lite-q4km',
    repo: 'bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF',
    file: 'DeepSeek-Coder-V2-Lite-Instruct-Q4_K_M.gguf',
    label: 'DeepSeek Coder V2 Lite Instruct (Q4_K_M)',
    expectedArch: 'deepseek2',
    expectedQuant: 'Q4_K_M',
    expectedCtxMax: 163840,
    expectedEmbedding: false,
    expectedToolCapable: false,
  },
  {
    id: '07-hermes-3-llama-3.1-8b-q4km',
    repo: 'bartowski/Hermes-3-Llama-3.1-8B-GGUF',
    file: 'Hermes-3-Llama-3.1-8B-Q4_K_M.gguf',
    label: 'Hermes 3 Llama 3.1 8B (Q4_K_M) — tool-capable',
    expectedArch: 'llama',
    expectedQuant: 'Q4_K_M',
    expectedCtxMax: 131072,
    expectedEmbedding: false,
    expectedToolCapable: true, // Hermes 3 advertises XML-tag tool calling
  },
  {
    id: '08-nomic-embed-text-v1.5',
    repo: 'nomic-ai/nomic-embed-text-v1.5-GGUF',
    file: 'nomic-embed-text-v1.5.Q4_K_M.gguf',
    label: 'Nomic Embed Text v1.5 (Q4_K_M)',
    expectedArch: 'nomic-bert',
    expectedQuant: 'Q4_K_M',
    expectedCtxMax: 2048, // nomic-embed-text-v1.5 actual ctx, NOT 8192
    expectedEmbedding: true,
    expectedToolCapable: false,
  },
  {
    id: '09-bge-large-en-v1.5-q4km',
    repo: 'CompendiumLabs/bge-large-en-v1.5-gguf',
    file: 'bge-large-en-v1.5-q4_k_m.gguf',
    label: 'BGE Large EN v1.5 (Q4_K_M) — embedding',
    expectedArch: 'bert',
    expectedQuant: 'Q4_K_M',
    expectedCtxMax: 512,
    expectedEmbedding: true,
    expectedToolCapable: false,
  },
  {
    id: '10-llama-3.2-3b-f16',
    repo: 'bartowski/Llama-3.2-3B-Instruct-GGUF',
    file: 'Llama-3.2-3B-Instruct-f16.gguf',
    label: 'Llama 3.2 3B Instruct (F16 unquantized)',
    expectedArch: 'llama',
    expectedQuant: 'F16',
    expectedCtxMax: 131072,
    expectedEmbedding: false,
    expectedToolCapable: true, // Llama-3.2 instruct inherits 3.1 tool-calling
  },
  {
    id: '11-llama-3.3-70b-q5km-split',
    repo: 'bartowski/Llama-3.3-70B-Instruct-GGUF',
    file: 'Llama-3.3-70B-Instruct-Q5_K_M/Llama-3.3-70B-Instruct-Q5_K_M-00001-of-00002.gguf',
    label: 'Llama 3.3 70B Instruct (Q5_K_M) — split part 1 of 2',
    expectedArch: 'llama',
    expectedQuant: 'Q5_K_M',
    expectedCtxMax: 131072,
    expectedEmbedding: false,
    expectedToolCapable: true,
    // metadata.gguf.split.count / split.tensors.count / split.no should be present
    expectedSplit: { partOf: 2, partIndex: 0 },
  },
  {
    id: '12-corrupt-magic',
    // Built locally by taking the first 256 KB of fixture #01 and XOR-ing the
    // 4-byte magic header with random garbage. No remote download — this is
    // the cheapest, most deterministic way to exercise the BAD_MAGIC path
    // without depending on a third-party "intentionally corrupt" artifact.
    local: true,
    sourceFixtureId: '01-llama-3.1-8b-q4km',
    label: 'Corrupt magic — fixture 01 with first 4 bytes zeroed',
    expectedFailure: 'gguf-corrupt:BAD_MAGIC',
  },
];

// ---------------------------------------------------------------------------
// GGUF binary format constants
// (spec: https://github.com/ggml-org/ggml/blob/master/docs/gguf.md)
// ---------------------------------------------------------------------------

const GGUF_MAGIC = Buffer.from('GGUF', 'ascii'); // 0x47 0x47 0x55 0x46

const GGUF_TYPE = {
  UINT8: 0,
  INT8: 1,
  UINT16: 2,
  INT16: 3,
  UINT32: 4,
  INT32: 5,
  FLOAT32: 6,
  BOOL: 7,
  STRING: 8,
  ARRAY: 9,
  UINT64: 10,
  INT64: 11,
  FLOAT64: 12,
};

// llama.cpp GGML ftype enum → human-readable quant label.
// Source: https://github.com/ggml-org/llama.cpp/blob/master/gguf-py/gguf/constants.py
//         (LlamaFileType enum)
const FILE_TYPE_TO_QUANT = {
  0: 'F32',
  1: 'F16',
  2: 'Q4_0',
  3: 'Q4_1',
  // 4 + 5 + 6 are deprecated mostly-Q4_1 variants — skipping
  7: 'Q8_0',
  8: 'Q5_0',
  9: 'Q5_1',
  10: 'Q2_K',
  11: 'Q3_K_S',
  12: 'Q3_K_M',
  13: 'Q3_K_L',
  14: 'Q4_K_S',
  15: 'Q4_K_M',
  16: 'Q5_K_S',
  17: 'Q5_K_M',
  18: 'Q6_K',
  19: 'IQ2_XXS',
  20: 'IQ2_XS',
  21: 'Q2_K_S',
  22: 'IQ3_XS',
  23: 'IQ3_XXS',
  24: 'IQ1_S',
  25: 'IQ4_NL',
  26: 'IQ3_S',
  27: 'IQ3_M',
  28: 'IQ2_S',
  29: 'IQ2_M',
  30: 'IQ4_XS',
  31: 'IQ1_M',
  32: 'BF16',
  33: 'Q4_0_4_4',
  34: 'Q4_0_4_8',
  35: 'Q4_0_8_8',
  36: 'TQ1_0',
  37: 'TQ2_0',
};

// Safety bounds — mirrors @huggingface/gguf's CWE-770 limits so a malicious
// file can't drive the parser into a billion-element allocation.
const LIMITS = {
  MAX_KV_COUNT: 100_000,
  MAX_TENSOR_COUNT: 10_000_000,
  MAX_STRING_LENGTH: 10_000_000,
  MAX_ARRAY_LENGTH: 1_000_000,
  MAX_ARRAY_DEPTH: 4,
};

// ---------------------------------------------------------------------------
// Cursor: a thin wrapper around the byte buffer with bounds-checked reads.
// All multi-byte reads are little-endian, per the GGUF spec.
// ---------------------------------------------------------------------------

class Cursor {
  constructor(buf) {
    this.buf = buf;
    this.pos = 0;
  }
  remaining() {
    return this.buf.length - this.pos;
  }
  needs(n) {
    if (this.remaining() < n) {
      const err = new Error(
        `gguf-parse-failed: need ${n} bytes at offset ${this.pos}, only ${this.remaining()} left`,
      );
      err.code = 'EOF';
      throw err;
    }
  }
  u8() {
    this.needs(1);
    return this.buf.readUInt8(this.pos++);
  }
  i8() {
    this.needs(1);
    return this.buf.readInt8(this.pos++);
  }
  u16() {
    this.needs(2);
    const v = this.buf.readUInt16LE(this.pos);
    this.pos += 2;
    return v;
  }
  i16() {
    this.needs(2);
    const v = this.buf.readInt16LE(this.pos);
    this.pos += 2;
    return v;
  }
  u32() {
    this.needs(4);
    const v = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    return v;
  }
  i32() {
    this.needs(4);
    const v = this.buf.readInt32LE(this.pos);
    this.pos += 4;
    return v;
  }
  f32() {
    this.needs(4);
    const v = this.buf.readFloatLE(this.pos);
    this.pos += 4;
    return v;
  }
  bool() {
    return this.u8() !== 0;
  }
  u64() {
    this.needs(8);
    const v = this.buf.readBigUInt64LE(this.pos);
    this.pos += 8;
    return v;
  }
  i64() {
    this.needs(8);
    const v = this.buf.readBigInt64LE(this.pos);
    this.pos += 8;
    return v;
  }
  f64() {
    this.needs(8);
    const v = this.buf.readDoubleLE(this.pos);
    this.pos += 8;
    return v;
  }
  string() {
    const len = Number(this.u64());
    if (len > LIMITS.MAX_STRING_LENGTH) {
      throw new Error(`gguf-corrupt: string length ${len} exceeds ${LIMITS.MAX_STRING_LENGTH}`);
    }
    this.needs(len);
    const v = this.buf.toString('utf8', this.pos, this.pos + len);
    this.pos += len;
    return v;
  }
}

// ---------------------------------------------------------------------------
// Read a single GGUF metadata value, dispatching on its type tag.
// ---------------------------------------------------------------------------

function readValue(cur, type, depth = 0) {
  switch (type) {
    case GGUF_TYPE.UINT8:
      return cur.u8();
    case GGUF_TYPE.INT8:
      return cur.i8();
    case GGUF_TYPE.UINT16:
      return cur.u16();
    case GGUF_TYPE.INT16:
      return cur.i16();
    case GGUF_TYPE.UINT32:
      return cur.u32();
    case GGUF_TYPE.INT32:
      return cur.i32();
    case GGUF_TYPE.FLOAT32:
      return cur.f32();
    case GGUF_TYPE.BOOL:
      return cur.bool();
    case GGUF_TYPE.STRING:
      return cur.string();
    case GGUF_TYPE.UINT64:
      return Number(cur.u64()); // safe for the keys we touch
    case GGUF_TYPE.INT64:
      return Number(cur.i64());
    case GGUF_TYPE.FLOAT64:
      return cur.f64();
    case GGUF_TYPE.ARRAY: {
      if (depth >= LIMITS.MAX_ARRAY_DEPTH) {
        throw new Error(`gguf-corrupt: array nesting depth exceeded ${LIMITS.MAX_ARRAY_DEPTH}`);
      }
      const subType = cur.u32();
      const len = Number(cur.u64());
      if (len > LIMITS.MAX_ARRAY_LENGTH) {
        throw new Error(`gguf-corrupt: array length ${len} exceeds ${LIMITS.MAX_ARRAY_LENGTH}`);
      }
      const arr = new Array(len);
      for (let i = 0; i < len; i++) {
        arr[i] = readValue(cur, subType, depth + 1);
      }
      return arr;
    }
    default:
      throw new Error(`gguf-corrupt: unknown value type tag ${type}`);
  }
}

// ---------------------------------------------------------------------------
// Top-level parser. Reads magic + version + counts, then walks the KV table.
// Stops cleanly when the head buffer is exhausted — the head is intentionally
// a partial download (1 MiB or 256 KB) and we want successful "partial" parses.
//
// The parser is success-tolerant of truncation mid-KV-table for two reasons:
//   1. We only ever read 1 MiB of a multi-GB file, so EOF inside the KV table
//      is the common case for very-large-vocab models (Hermes 3 tokenizer
//      table alone runs ~3 MB).
//   2. We extract enough metadata as we go (arch, params, ctx, quant, chat
//      template) to satisfy the Phase 3 needs from a partial read.
//
// On EOF: return what we've collected with status='partial'.
// On invalid magic / bad version: throw a gguf-corrupt error.
// ---------------------------------------------------------------------------

function parseHead(buf, { tolerateEOF = true } = {}) {
  if (buf.length < 16) {
    const e = new Error('gguf-parse-failed: file too short for header (need 24 bytes minimum)');
    e.code = 'EOF';
    throw e;
  }
  if (!buf.subarray(0, 4).equals(GGUF_MAGIC)) {
    const got = buf.subarray(0, 4).toString('hex');
    const e = new Error(
      `gguf-corrupt: magic bytes mismatch — got 0x${got}, expected 0x47475546 ("GGUF")`,
    );
    e.code = 'BAD_MAGIC';
    throw e;
  }
  const cur = new Cursor(buf);
  cur.pos = 4;
  const version = cur.u32();
  if (version < 1 || version > 3) {
    const e = new Error(
      `gguf-corrupt: unsupported version ${version} (this parser supports v1–v3)`,
    );
    e.code = 'BAD_VERSION';
    throw e;
  }
  const tensorCount = Number(cur.u64());
  const kvCount = Number(cur.u64());
  if (kvCount > LIMITS.MAX_KV_COUNT) {
    const e = new Error(`gguf-corrupt: kv_count ${kvCount} exceeds ${LIMITS.MAX_KV_COUNT}`);
    e.code = 'KV_COUNT_OVERFLOW';
    throw e;
  }
  if (tensorCount > LIMITS.MAX_TENSOR_COUNT) {
    const e = new Error(
      `gguf-corrupt: tensor_count ${tensorCount} exceeds ${LIMITS.MAX_TENSOR_COUNT}`,
    );
    e.code = 'TENSOR_COUNT_OVERFLOW';
    throw e;
  }

  const metadata = {};
  let entriesRead = 0;
  let truncated = false;
  let truncationReason = null;
  for (let i = 0; i < kvCount; i++) {
    const before = cur.pos;
    try {
      const key = cur.string();
      const valueType = cur.u32();
      const value = readValue(cur, valueType, 0);
      metadata[key] = value;
      entriesRead++;
    } catch (err) {
      if (err.code === 'EOF' && tolerateEOF) {
        // partial download — we've read what we can; restore cursor and bail
        cur.pos = before;
        truncated = true;
        truncationReason = `EOF at KV entry ${i} of ${kvCount} (offset ${before})`;
        break;
      }
      throw err;
    }
  }

  return {
    version,
    tensorCount,
    kvCountDeclared: kvCount,
    kvCountRead: entriesRead,
    truncated,
    truncationReason,
    metadata,
  };
}

// ---------------------------------------------------------------------------
// Tool-capability detection strategy (per design spec § 11 + spike S3 plan).
//
// GGUF metadata HAS NO `tool_capable` field. We layer two signals:
//
//   (a) Curated arch + display-name allowlist — model families documented by
//       upstream as supporting OpenAI-compatible tool calling. This is the
//       authoritative signal for known families.
//
//   (b) chat_template substring grep — looks for the token patterns that
//       tool-aware templates inject. Catches forks/derivatives not in (a).
//
// Final value: capable = (a) || (b). Phase 3 ships this allowlist as
// packages/local-gguf-runtime/src/metadata/tool-capable-list.ts so it can
// be edited without touching the parser.
// ---------------------------------------------------------------------------

// Each entry matches a `general.name` substring after lowercase normalization
// that strips spaces and hyphens (so "Meta Llama 3.1 8B Instruct",
// "Meta-Llama-3.1-8B-Instruct", and "meta_llama_3.1_8b_instruct" all collapse
// to the same key). Patterns below are stored pre-normalized.
const TOOL_CAPABLE_ARCH_NAME_ALLOWLIST = [
  { arch: 'llama', name: 'hermes' }, // Hermes 2 / 3 / Pro
  { arch: 'llama', name: 'functionary' }, // Meetkai Functionary
  { arch: 'llama', name: 'firefunction' }, // Fireworks Firefunction
  { arch: 'llama', name: 'xlam' }, // Salesforce xLAM
  { arch: 'llama', name: 'toolace' }, // ToolACE
  { arch: 'llama', name: 'mistral7binstruct' }, // Mistral v0.x Instruct (some ship arch=llama)
  { arch: 'llama', name: 'metallama3.1' }, // Llama 3.1 Instruct (matches "Meta Llama 3.1 …")
  { arch: 'llama', name: 'metallama3.2' }, // Llama 3.2 Instruct
  { arch: 'llama', name: 'metallama3.3' }, // Llama 3.3 Instruct
  { arch: 'llama', name: 'llama3.1' }, // bare "Llama 3.1" fork case
  { arch: 'llama', name: 'llama3.2' },
  { arch: 'llama', name: 'llama3.3' },
  { arch: 'qwen2', name: 'qwen2.5' }, // Qwen 2.5 Instruct (Hermes-style toolcalls)
  { arch: 'qwen2', name: 'qwen2' }, // Qwen 2 Instruct
  { arch: 'command-r', name: '' }, // Cohere Command-R (always tool-capable)
];

function normalizeName(s) {
  return (s || '').toLowerCase().replace(/[\s\-_]/g, '');
}

const CHAT_TEMPLATE_TOOL_GREP = [
  '<tool_call>',
  '</tool_call>',
  '<|tool_call|>',
  '<function>',
  '</function>',
  '<functions>',
  '<|python_tag|>', // Llama 3.1+ tool-call marker
  '"tool_calls"',
  'tools=',
  'available_tools',
];

function detectToolCapable({ arch, name, chatTemplate }) {
  const normName = normalizeName(name);
  const lowArch = (arch || '').toLowerCase();
  const allowlistHit = TOOL_CAPABLE_ARCH_NAME_ALLOWLIST.find((e) => {
    if (e.arch && lowArch !== e.arch) return false;
    if (e.name && !normName.includes(e.name)) return false;
    return true;
  });
  const grepHit =
    (chatTemplate || '').length > 0
      ? CHAT_TEMPLATE_TOOL_GREP.find((tok) => chatTemplate.includes(tok))
      : null;
  return {
    capable: Boolean(allowlistHit || grepHit),
    via: allowlistHit
      ? `allowlist:${allowlistHit.arch}+${allowlistHit.name || '*'}`
      : grepHit
        ? `chat-template:${grepHit}`
        : null,
  };
}

// ---------------------------------------------------------------------------
// Distil the raw KV map into the Phase-3 metadata shape.
// ---------------------------------------------------------------------------

function distilMetadata(parsed) {
  const m = parsed.metadata;
  const arch = m['general.architecture'] ?? null;
  const name = m['general.name'] ?? null;
  const license = m['general.license'] ?? null;
  const fileType = m['general.file_type'] ?? null;
  const quant = fileType != null ? (FILE_TYPE_TO_QUANT[fileType] ?? `file_type=${fileType}`) : null;

  // context_max is arch-prefixed (e.g. llama.context_length, qwen2.context_length).
  // Search any `*.context_length` key.
  let contextMax = null;
  for (const k of Object.keys(m)) {
    if (k.endsWith('.context_length') || k.endsWith('.max_position_embeddings')) {
      contextMax = m[k];
      break;
    }
  }

  const chatTemplate = m['tokenizer.chat_template'] ?? null;

  // Embedding flag — embedding models declare general.architecture in
  // {bert, nomic-bert, jina-bert, ...} families and lack any *.block_count
  // attention head (or have a pooling head). Layered detection:
  //  (a) arch in known embedding-arch set.
  //  (b) general.type === 'model' AND ANY *.pooling_type key present.
  const EMBEDDING_ARCHS = new Set([
    'bert',
    'nomic-bert',
    'jina-bert',
    'jina-bert-v2',
    'distilbert',
    'roberta',
  ]);
  const hasPooling = Object.keys(m).some((k) => k.endsWith('.pooling_type'));
  const isEmbedding = EMBEDDING_ARCHS.has(arch) || hasPooling;

  // params_b — derived from tensor count + hidden size when not stored directly.
  // GGUF v3 stores general.parameter_count (preferred). Fallback: compute from
  // arch.block_count × arch.embedding_length × ~12 (rough ballpark of total
  // params per layer for a transformer block), accurate to ±15% for the
  // Phase-3 "Size: ~8 B" UI display.
  let paramsB = null;
  if (typeof m['general.parameter_count'] === 'number') {
    paramsB = m['general.parameter_count'] / 1e9;
  } else if (arch) {
    const block = m[`${arch}.block_count`];
    const embed = m[`${arch}.embedding_length`];
    if (typeof block === 'number' && typeof embed === 'number') {
      // 12 × embed^2 × block is the standard transformer param estimate
      paramsB = (12 * embed * embed * block) / 1e9;
    }
  }

  // Multi-part split metadata — added in @huggingface/gguf 0.2+ tracking
  // llama.cpp's split.* keys.
  const split = {
    no: m['split.no'] ?? null,
    count: m['split.count'] ?? null,
    tensorsCount: m['split.tensors.count'] ?? null,
  };

  const toolCapable = detectToolCapable({ arch, name, chatTemplate });

  // Vocab size — tokenizer.ggml.tokens length when array was read, else null.
  let vocabSize = null;
  const tokens = m['tokenizer.ggml.tokens'];
  if (Array.isArray(tokens)) vocabSize = tokens.length;

  return {
    arch,
    name,
    license,
    quant,
    contextMax,
    chatTemplate: chatTemplate
      ? { length: chatTemplate.length, snippet: chatTemplate.slice(0, 120) }
      : null,
    isEmbedding,
    toolCapable: toolCapable.capable,
    toolCapableVia: toolCapable.via,
    paramsB: paramsB != null ? Number(paramsB.toFixed(2)) : null,
    vocabSize,
    split: split.count != null ? split : null,
    versionRead: parsed.version,
    tensorCountDeclared: parsed.tensorCount,
    kvCountDeclared: parsed.kvCountDeclared,
    kvCountRead: parsed.kvCountRead,
    truncated: parsed.truncated,
    truncationReason: parsed.truncationReason,
  };
}

// ---------------------------------------------------------------------------
// HTTP Range fetch — first HEAD_BYTES of each remote fixture.
// ---------------------------------------------------------------------------

async function fetchHead(url, destPath) {
  const headers = { Range: `bytes=0-${HEAD_BYTES - 1}` };
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!(res.status === 206 || res.status === 200)) {
    throw new Error(`fetch failed: ${res.status} ${res.statusText} for ${url}`);
  }
  const ab = await res.arrayBuffer();
  await mkdir(dirname(destPath), { recursive: true });
  await writeFile(destPath, Buffer.from(ab));
  const st = await stat(destPath);
  return { path: destPath, sizeBytes: st.size, status: res.status };
}

async function fetchAllFixtures() {
  await mkdir(CACHE_DIR, { recursive: true });
  const out = [];
  for (const f of FIXTURES) {
    if (f.local) {
      // Built locally from another fixture — handled in the next step.
      continue;
    }
    const url = `https://huggingface.co/${f.repo}/resolve/main/${f.file}`;
    const dest = join(CACHE_DIR, `${f.id}.head.gguf`);
    if (existsSync(dest)) {
      const st = await stat(dest);
      out.push({ id: f.id, cached: true, sizeBytes: st.size, path: dest });
      console.log(`cached  ${f.id} (${st.size} B)`);
      continue;
    }
    try {
      const r = await fetchHead(url, dest);
      out.push({ id: f.id, cached: false, ...r });
      console.log(`fetched ${f.id} ← ${url} (status=${r.status}, ${r.sizeBytes} B)`);
    } catch (err) {
      out.push({ id: f.id, error: String(err) });
      console.log(`ERROR   ${f.id} :: ${err}`);
    }
    await new Promise((r) => setTimeout(r, 600)); // be polite to HF
  }
  // Build the corrupt fixture by zeroing the magic bytes of fixture 01.
  // (Keeps everything else intact so we know the failure is specifically
  // magic-validation, not EOF or value-type confusion.)
  const sourcePath = join(CACHE_DIR, '01-llama-3.1-8b-q4km.head.gguf');
  const corruptPath = join(CACHE_DIR, '12-corrupt-magic.head.gguf');
  if (existsSync(sourcePath)) {
    const src = await readFile(sourcePath);
    const trimmed = Buffer.from(src.subarray(0, Math.min(FIXTURE_BYTES, src.length)));
    // Zero the first 4 bytes — was "GGUF", now "\0\0\0\0"
    trimmed[0] = 0;
    trimmed[1] = 0;
    trimmed[2] = 0;
    trimmed[3] = 0;
    await writeFile(corruptPath, trimmed);
    out.push({
      id: '12-corrupt-magic',
      cached: false,
      sizeBytes: trimmed.length,
      path: corruptPath,
      fromFixture: '01',
    });
    console.log(`built   12-corrupt-magic (${trimmed.length} B, magic bytes zeroed)`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Parse a single head file from disk.
// ---------------------------------------------------------------------------

async function parseFixture(fixture) {
  const headPath = join(CACHE_DIR, `${fixture.id}.head.gguf`);
  if (!existsSync(headPath)) {
    return { id: fixture.id, error: `cache miss: ${headPath}` };
  }
  const buf = await readFile(headPath);
  let parsed;
  try {
    parsed = parseHead(buf, { tolerateEOF: true });
  } catch (err) {
    return {
      id: fixture.id,
      label: fixture.label,
      parseFailed: true,
      errorCode: err.code ?? 'PARSE_ERROR',
      errorMessage: err.message,
      headBytes: buf.length,
    };
  }
  const distilled = distilMetadata(parsed);
  return {
    id: fixture.id,
    label: fixture.label,
    parseFailed: false,
    headBytes: buf.length,
    expected: {
      arch: fixture.expectedArch,
      quant: fixture.expectedQuant,
      ctxMax: fixture.expectedCtxMax,
      embedding: fixture.expectedEmbedding,
      toolCapable: fixture.expectedToolCapable,
    },
    actual: distilled,
  };
}

async function reportAll() {
  await fetchAllFixtures();
  const lines = [];
  for (const f of FIXTURES) {
    const r = await parseFixture(f);
    lines.push(JSON.stringify(r));
    if (r.parseFailed) {
      console.log(`× ${r.id} :: ${r.errorCode} :: ${r.errorMessage}`);
    } else {
      const a = r.actual;
      const ok = a.arch === r.expected.arch ? 'OK' : 'ARCH-MISMATCH';
      console.log(
        `✓ ${r.id} :: arch=${a.arch} quant=${a.quant} ctx=${a.contextMax} params=${a.paramsB}B tool=${a.toolCapable} embed=${a.isEmbedding} ${ok}`,
      );
    }
  }
  await mkdir(dirname(RESULTS_PATH), { recursive: true });
  await writeFile(RESULTS_PATH, `${lines.join('\n')}\n`);
  console.log(`\nwrote ${RESULTS_PATH}`);
}

// ---------------------------------------------------------------------------
// Trim cached 1 MiB heads to 256 KB and copy into docs/spikes/S3-fixtures/.
// These committed bytes become Phase 3 parser unit-test inputs.
// ---------------------------------------------------------------------------

async function trimFixtures() {
  await mkdir(FIXTURES_DIR, { recursive: true });
  for (const f of FIXTURES) {
    const src = join(CACHE_DIR, `${f.id}.head.gguf`);
    const dst = join(FIXTURES_DIR, `${f.id}.head.gguf`);
    if (!existsSync(src)) {
      console.log(`skip ${f.id} (no cache)`);
      continue;
    }
    const buf = await readFile(src);
    const trimmed = buf.subarray(0, Math.min(FIXTURE_BYTES, buf.length));
    await writeFile(dst, trimmed);
    console.log(`trim ${f.id} → ${dst} (${trimmed.length} B)`);
  }
  // Manifest for downstream parser unit tests.
  const manifest = FIXTURES.map((f) => ({
    id: f.id,
    file: `${f.id}.head.gguf`,
    label: f.label,
    repo: f.repo ?? null,
    sourcePath: f.file ?? null,
    expected: {
      arch: f.expectedArch ?? null,
      quant: f.expectedQuant ?? null,
      ctxMax: f.expectedCtxMax ?? null,
      embedding: f.expectedEmbedding ?? null,
      toolCapable: f.expectedToolCapable ?? null,
      failure: f.expectedFailure ?? null,
    },
  }));
  await writeFile(join(FIXTURES_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${join(FIXTURES_DIR, 'manifest.json')}`);
}

// ---------------------------------------------------------------------------
// CLI dispatch
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const cmd = argv[0];

if (cmd === '--fetch') {
  await fetchAllFixtures();
} else if (cmd === '--parse' && argv[1]) {
  const buf = await readFile(argv[1]);
  try {
    const parsed = parseHead(buf, { tolerateEOF: true });
    const distilled = distilMetadata(parsed);
    console.log(JSON.stringify(distilled, null, 2));
  } catch (err) {
    console.log(
      JSON.stringify(
        { parseFailed: true, errorCode: err.code ?? 'PARSE_ERROR', errorMessage: err.message },
        null,
        2,
      ),
    );
    process.exit(1);
  }
} else if (cmd === '--report') {
  await reportAll();
} else if (cmd === '--trim') {
  await trimFixtures();
} else {
  console.log(`usage:
  node scripts/spike-S3/parse-gguf.mjs --fetch         # download 1 MiB heads of all fixtures
  node scripts/spike-S3/parse-gguf.mjs --parse <path>  # parse a local head file, emit JSON
  node scripts/spike-S3/parse-gguf.mjs --report        # run --fetch + --parse over all fixtures
  node scripts/spike-S3/parse-gguf.mjs --trim          # trim cached heads to 256 KB into docs/spikes/S3-fixtures/`);
  process.exit(1);
}
