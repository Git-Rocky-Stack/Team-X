// packages/local-gguf-runtime/src/metadata/parser.ts
//
// Hand-rolled GGUF v2/v3 header + key-value parser.
//
// We parse the GGUF metadata block ourselves rather than depend on a native
// llama.cpp binding: the renderer/library layer only needs the small set of
// fields in `GgufMetadata`, and a pure-TS parser keeps this package free of
// native add-ons and runnable in the test sandbox against fixture bytes.
//
// GGUF layout (https://github.com/ggerganov/ggml/blob/master/docs/gguf.md):
//   magic:        4 bytes  ascii "GGUF"
//   version:      u32      (2 or 3 supported)
//   tensor_count: u64      (we skip the tensor table — metadata only)
//   kv_count:     u64
//   kv_count × { key:string, value_type:u32, value:<typed> }
//
// Strings are `u64 length + utf8 bytes`. Arrays are `u32 item_type + u64 len +
// items`. All multi-byte integers are little-endian.
//
// Truncation policy — important for "head" inputs:
//   The S3 fixtures (and any caller that reads only a file *head* to avoid
//   loading multi-GB models into memory) deliberately stop after the first
//   ~256 KB. The chat_template KV sits *after* the large tokenizer token
//   array, so it is often not in the head at all. We therefore parse the KV
//   list defensively: every read is bounds-checked, and once a read would
//   overrun the buffer mid-KV-list we stop and return what we have. The
//   header (magic/version/counts), by contrast, must be fully present — a
//   buffer too short to even hold the fixed header is a real parse failure.

import type { GgufMetadata, LocalGgufError } from '@team-x/shared-types';
import { isEmbeddingArch } from './embedding-arches.js';
import { isToolCapable } from './tool-capable-list.js';

export class ParserError extends Error {
  constructor(public readonly error: LocalGgufError) {
    super(`ParserError: ${JSON.stringify(error)}`);
    this.name = 'ParserError';
  }
}

const GGUF_MAGIC = 'GGUF';
const HEADER_BYTES = 24; // magic(4) + version(4) + tensorCount(8) + kvCount(8)
const SUPPORTED_VERSIONS = new Set([2, 3]);

// GGUF metadata value types.
enum GgufType {
  U8 = 0,
  I8 = 1,
  U16 = 2,
  I16 = 3,
  U32 = 4,
  I32 = 5,
  F32 = 6,
  BOOL = 7,
  STRING = 8,
  ARRAY = 9,
  U64 = 10,
  I64 = 11,
  F64 = 12,
}

// general.file_type → quantization label. Values per llama.cpp `llama_ftype`.
const FILE_TYPE_TO_QUANT: Record<number, string> = {
  0: 'F32',
  1: 'F16',
  2: 'Q4_0',
  3: 'Q4_1',
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
  19: 'Q8_K',
  20: 'IQ2_XXS',
  21: 'IQ2_XS',
  22: 'Q2_K_S',
  23: 'IQ3_XS',
  24: 'IQ3_XXS',
  25: 'IQ1_S',
  26: 'IQ4_NL',
  27: 'IQ3_S',
  28: 'IQ3_M',
  29: 'IQ2_S',
  30: 'IQ2_M',
  31: 'IQ4_XS',
  32: 'IQ1_M',
  33: 'BF16',
};

type KvValue = string | number | boolean | Array<string | number | boolean>;

/**
 * Bounds-checked little-endian cursor over a GGUF buffer. Every read advances
 * `off` and throws `RangeError` (caught and reclassified by callers) if the
 * requested span runs past the end of the buffer.
 */
class Cursor {
  off = 0;
  constructor(private readonly buf: Buffer) {}

  private ensure(n: number): void {
    if (this.off + n > this.buf.length) {
      throw new RangeError(
        `read of ${n} byte(s) at offset ${this.off} overruns buffer length ${this.buf.length}`,
      );
    }
  }

  u8(): number {
    this.ensure(1);
    const v = this.buf.readUInt8(this.off);
    this.off += 1;
    return v;
  }
  i8(): number {
    this.ensure(1);
    const v = this.buf.readInt8(this.off);
    this.off += 1;
    return v;
  }
  u16(): number {
    this.ensure(2);
    const v = this.buf.readUInt16LE(this.off);
    this.off += 2;
    return v;
  }
  i16(): number {
    this.ensure(2);
    const v = this.buf.readInt16LE(this.off);
    this.off += 2;
    return v;
  }
  u32(): number {
    this.ensure(4);
    const v = this.buf.readUInt32LE(this.off);
    this.off += 4;
    return v;
  }
  i32(): number {
    this.ensure(4);
    const v = this.buf.readInt32LE(this.off);
    this.off += 4;
    return v;
  }
  f32(): number {
    this.ensure(4);
    const v = this.buf.readFloatLE(this.off);
    this.off += 4;
    return v;
  }
  f64(): number {
    this.ensure(8);
    const v = this.buf.readDoubleLE(this.off);
    this.off += 8;
    return v;
  }
  bool(): boolean {
    return this.u8() !== 0;
  }
  // u64/i64 returned as JS numbers — model counts/lengths are well within
  // Number.MAX_SAFE_INTEGER; precision loss is not a concern for GGUF metadata.
  u64(): number {
    this.ensure(8);
    const v = this.buf.readBigUInt64LE(this.off);
    this.off += 8;
    return Number(v);
  }
  i64(): number {
    this.ensure(8);
    const v = this.buf.readBigInt64LE(this.off);
    this.off += 8;
    return Number(v);
  }
  string(): string {
    const len = this.u64();
    this.ensure(len);
    const s = this.buf.toString('utf8', this.off, this.off + len);
    this.off += len;
    return s;
  }
}

function readValue(cur: Cursor, type: number): KvValue {
  switch (type) {
    case GgufType.U8:
      return cur.u8();
    case GgufType.I8:
      return cur.i8();
    case GgufType.U16:
      return cur.u16();
    case GgufType.I16:
      return cur.i16();
    case GgufType.U32:
      return cur.u32();
    case GgufType.I32:
      return cur.i32();
    case GgufType.F32:
      return cur.f32();
    case GgufType.BOOL:
      return cur.bool();
    case GgufType.STRING:
      return cur.string();
    case GgufType.U64:
      return cur.u64();
    case GgufType.I64:
      return cur.i64();
    case GgufType.F64:
      return cur.f64();
    case GgufType.ARRAY: {
      const itemType = cur.u32();
      const len = cur.u64();
      const arr: Array<string | number | boolean> = [];
      for (let i = 0; i < len; i++) {
        arr.push(readValue(cur, itemType) as string | number | boolean);
      }
      return arr;
    }
    default:
      throw new ParserError({
        kind: 'gguf-parse-failed',
        path: '',
        reason: `unknown GGUF value type ${type}`,
      });
  }
}

function asString(v: KvValue | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
function asNumber(v: KvValue | undefined): number | undefined {
  return typeof v === 'number' ? v : undefined;
}
function asStringArray(v: KvValue | undefined): string[] | undefined {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return undefined;
}

/**
 * Parse the metadata block of a GGUF buffer (or buffer *head*) into the
 * canonical `GgufMetadata` shape.
 *
 * @param buf        GGUF bytes. May be a truncated head; the KV walk stops
 *                   gracefully when it runs out of bytes.
 * @param sourcePath Path used only to annotate thrown errors. Does not affect
 *                   parsing. Defaults to ''.
 *
 * @throws ParserError with `kind: 'gguf-corrupt'`     — missing magic / too small.
 * @throws ParserError with `kind: 'gguf-parse-failed'` — unsupported version or
 *         a malformed header / value (with a human-readable `reason`).
 */
export function parseGgufMetadata(buf: Buffer, sourcePath = ''): GgufMetadata {
  // 1. Magic + minimum size → corruption (not a recoverable parse error).
  if (buf.length < HEADER_BYTES || buf.toString('ascii', 0, 4) !== GGUF_MAGIC) {
    throw new ParserError({ kind: 'gguf-corrupt', path: sourcePath });
  }

  const cur = new Cursor(buf);

  // 2. Fixed header — must be fully present.
  let version: number;
  let kvCount: number;
  try {
    cur.off = 4; // skip magic (already validated)
    version = cur.u32();
    cur.u64(); // tensorCount — skipped (metadata only)
    kvCount = cur.u64();
  } catch (e) {
    throw new ParserError({
      kind: 'gguf-parse-failed',
      path: sourcePath,
      reason: `truncated GGUF header: ${(e as Error).message}`,
    });
  }

  if (!SUPPORTED_VERSIONS.has(version)) {
    throw new ParserError({
      kind: 'gguf-parse-failed',
      path: sourcePath,
      reason: `unsupported GGUF version ${version} (supported: 2, 3)`,
    });
  }

  // 3. KV walk — truncation-tolerant. Capture as many KVs as the buffer holds;
  //    stop cleanly when a read would overrun (head input). A non-RangeError
  //    (e.g. an unknown value type) is a genuine malformation → re-throw.
  //
  //    Exception: if the header promises KVs but the body overruns before even
  //    the *first* KV is read, the buffer is truncated/garbage right after the
  //    header rather than a legitimate metadata head — that is a real parse
  //    failure, not a recoverable partial read.
  const kv: Record<string, KvValue> = {};
  let parsedKvCount = 0;
  for (let i = 0; i < kvCount; i++) {
    const before = cur.off;
    try {
      const key = cur.string();
      const type = cur.u32();
      kv[key] = readValue(cur, type);
      parsedKvCount++;
    } catch (e) {
      if (e instanceof RangeError) {
        cur.off = before; // rewind to last complete KV
        if (parsedKvCount === 0) {
          throw new ParserError({
            kind: 'gguf-parse-failed',
            path: sourcePath,
            reason: `truncated GGUF metadata: header declares ${kvCount} KV pair(s) but the buffer overruns before the first is readable (${e.message})`,
          });
        }
        break; // truncated head — keep what we parsed
      }
      if (e instanceof ParserError) {
        // Re-stamp the source path onto value-level parse failures.
        throw new ParserError({
          kind: 'gguf-parse-failed',
          path: sourcePath,
          reason: e.error.kind === 'gguf-parse-failed' ? e.error.reason : 'malformed GGUF value',
        });
      }
      throw e;
    }
  }

  // 4. Project the captured KVs onto GgufMetadata.
  const arch = asString(kv['general.architecture']) ?? 'unknown';
  const name = asString(kv['general.name']) ?? '';
  const tags = asStringArray(kv['general.tags']) ?? [];
  const chatTemplate = asString(kv['tokenizer.chat_template']) ?? null;

  const fileType = asNumber(kv['general.file_type']);
  const quant = fileType !== undefined ? (FILE_TYPE_TO_QUANT[fileType] ?? null) : null;

  const contextMax = asNumber(kv[`${arch}.context_length`]) ?? null;

  const blockCount = asNumber(kv[`${arch}.block_count`]);
  const embeddingLength = asNumber(kv[`${arch}.embedding_length`]);
  const paramsBillions = estimateParamsBillions(blockCount, embeddingLength);

  const isEmbeddingModel = isEmbeddingArch(arch);
  // Embedding models are never tool-capable; isToolCapable short-circuits on
  // embedding archs, so we can pass the same inputs unconditionally.
  const isToolCapableModel = isToolCapable({ arch, name, tags, chatTemplate });

  return {
    arch,
    paramsBillions,
    quant,
    contextMax,
    chatTemplate,
    isEmbeddingModel,
    isToolCapable: isToolCapableModel,
    fileSizeBytes: buf.length,
    sha256: null,
  };
}

/**
 * Crude transformer-parameter estimate from block count and hidden size.
 * Returns billions of parameters, or null when the inputs are missing.
 *
 * This is a coarse heuristic (per-layer attention + MLP weights, ignoring
 * embeddings, GQA, and MoE sparsity), used only for rough display / sizing —
 * never asserted to an exact value. Real param counts come from the file size
 * and quant elsewhere.
 */
function estimateParamsBillions(
  blockCount: number | undefined,
  embeddingLength: number | undefined,
): number | null {
  if (
    blockCount === undefined ||
    embeddingLength === undefined ||
    blockCount <= 0 ||
    embeddingLength <= 0
  ) {
    return null;
  }
  // ~12 × d_model² parameters per transformer block (4·d² attention + 8·d² MLP).
  const params = blockCount * 12 * embeddingLength * embeddingLength;
  return params / 1e9;
}
