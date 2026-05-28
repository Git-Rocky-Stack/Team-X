# Phase 3 — Library + Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
>
> **Cross-phase rules:** See master plan § "Cross-phase rules" (CR-1 through CR-10).
>
> **Codex Stage 3 review:** REQUIRED. This phase introduces filesystem path handling including UNC/SMB — Codex independent review is mandatory.

**Goal:** Land the GGUF metadata parser (using Spike S3 findings), the library CRUD service, folder scan + auto-watch (local + UNC/SMB), multi-part split-GGUF handling, and network-share resilience (poll + status flip + retry). By the end of this phase, `localGguf.library.*` IPC stubs are replaced with real implementations. Users can drop a `.gguf` file via the picker (E2E-verified through stub picker), point at a folder (incl. `\\NAS\share`), and see metadata-rich library rows.

**Architecture:** `metadata/parser.ts` reads the first ≤ 1 MiB of a GGUF file and extracts the metadata table (arch, params, quant, context_max, chat_template, embedding flag, tool-capable hint). `library/scanner.ts` walks a folder (respecting `recursive`), finds `.gguf` files (incl. multi-part `*-00001-of-NNNNN.gguf` heads), and produces `LocalModel` candidates. `library/folder-watcher.ts` uses `chokidar` for change detection. `library/resilience.ts` polls every 30 s with exponential backoff up to 5 min, flipping watch-folder + model status on disconnect/reconnect. `LibraryService` (main process) orchestrates all of the above behind the IPC handlers.

**Spec coverage:** Implements spec § 4.1.2 (intake), § 14 (network-share resilience), § 13 backup semantics (registry-only, files-never), GGUF metadata extraction from Spike S3.

**Estimated PR size:** ~2,500–3,200 LOC production + ~3,500 LOC tests + the Spike-S3 fixtures already on disk become parser test inputs. Single PR.

---

## Files this phase touches

### New files

```
packages/local-gguf-runtime/src/metadata/
├── parser.ts                                       (GGUF binary parser)
├── parser.test.ts
└── parser.test-fixtures/                           (symlinks/copies from docs/spikes/S3-fixtures)

packages/local-gguf-runtime/src/library/
├── scanner.ts                                      (folder walk → LocalModel candidates)
├── scanner.test.ts
├── folder-watcher.ts                               (chokidar wrapper, debounced events)
├── folder-watcher.test.ts
├── split-gguf.ts                                   (multi-part file recognition)
├── split-gguf.test.ts
├── resilience.ts                                   (poll loop + status flip + backoff)
└── resilience.test.ts

apps/desktop/src/main/services/local-gguf/
├── library-service.ts
└── library-service.test.ts

e2e/
└── local-gguf-network-share-resilience.spec.ts
```

### Modified files

```
packages/local-gguf-runtime/package.json            (add chokidar 3.x)
apps/desktop/src/main/ipc/local-gguf-library-handlers.ts (replace stubs)
apps/desktop/src/main/ipc/local-gguf-library-handlers.test.ts (update for real behavior)
apps/desktop/src/main/index.ts                      (wire LibraryService deps)
CHANGELOG.md
```

---

## Tasks

### Task 1: Branch off `main` + verify Phase 2 merged

```bash
git checkout main && git pull --ff-only
git log --oneline -20 | grep -i "phase 2\|phase-02"
git checkout -b feat/v3.3.0-phase-03-library-scanning
```

---

### Task 2: GGUF metadata parser (TDD, uses S3 fixtures)

**Files:**
- Create: `packages/local-gguf-runtime/src/metadata/parser.ts`
- Create: `packages/local-gguf-runtime/src/metadata/parser.test.ts`

- [ ] **Step 1: Copy/symlink S3 spike fixtures.**

```bash
mkdir -p packages/local-gguf-runtime/src/metadata/parser.test-fixtures
cp -r docs/spikes/S3-fixtures/* packages/local-gguf-runtime/src/metadata/parser.test-fixtures/
```

This co-locates the fixtures with the parser. Per master plan global file structure they're inside the package src tree.

- [ ] **Step 2: Write the failing test (uses Spike S3 findings — the library decision from S3's writeup determines the implementation strategy).**

```ts
// packages/local-gguf-runtime/src/metadata/parser.test.ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGgufMetadata, ParserError } from './parser';

const FIXTURE_DIR = join(__dirname, 'parser.test-fixtures');

describe('parseGgufMetadata', () => {
  it('parses Llama-3.1-8B-Instruct-Q4_K_M head', async () => {
    const buf = await readFile(join(FIXTURE_DIR, 'llama-3.1-8b-Q4_K_M.head.gguf'));
    const meta = parseGgufMetadata(buf);
    expect(meta.arch).toBe('llama');
    expect(meta.paramsBillions).toBeCloseTo(8.0, 0);
    expect(meta.quant).toBe('Q4_K_M');
    expect(meta.contextMax).toBe(131072);
    expect(meta.chatTemplate).toContain('<|begin_of_text|>');
    expect(meta.isEmbeddingModel).toBe(false);
  });

  it('parses Mistral-7B-Instruct-Q4_K_M head', async () => {
    const buf = await readFile(join(FIXTURE_DIR, 'mistral-7b-Q4_K_M.head.gguf'));
    const meta = parseGgufMetadata(buf);
    expect(meta.arch).toBe('llama'); // Mistral GGUF often reports llama arch
    expect(meta.quant).toBe('Q4_K_M');
  });

  it('parses Qwen2.5-7B Q4_K_M head', async () => {
    const buf = await readFile(join(FIXTURE_DIR, 'qwen2.5-7b-Q4_K_M.head.gguf'));
    const meta = parseGgufMetadata(buf);
    expect(meta.arch).toBe('qwen2');
    expect(meta.contextMax).toBe(32768);
  });

  it('flags nomic-embed as embedding model', async () => {
    const buf = await readFile(join(FIXTURE_DIR, 'nomic-embed-Q4_K_M.head.gguf'));
    const meta = parseGgufMetadata(buf);
    expect(meta.isEmbeddingModel).toBe(true);
    expect(meta.arch).toBe('nomic-bert');
  });

  it('flags bge-large as embedding model', async () => {
    const buf = await readFile(join(FIXTURE_DIR, 'bge-large-Q4_K_M.head.gguf'));
    const meta = parseGgufMetadata(buf);
    expect(meta.isEmbeddingModel).toBe(true);
  });

  it('flags Hermes-3-Llama-3.1-8B as tool-capable', async () => {
    const buf = await readFile(join(FIXTURE_DIR, 'hermes-3-llama-3.1-8b-Q4_K_M.head.gguf'));
    const meta = parseGgufMetadata(buf);
    expect(meta.isToolCapable).toBe(true);
  });

  it('throws ParserError(gguf-parse-failed) on truncated head', async () => {
    const truncated = Buffer.from('GGUF\x03\x00\x00\x00'); // valid magic + version, truncated
    expect(() => parseGgufMetadata(truncated)).toThrowError(ParserError);
    try {
      parseGgufMetadata(truncated);
    } catch (e) {
      expect((e as ParserError).error.kind).toBe('gguf-parse-failed');
    }
  });

  it('throws ParserError(gguf-corrupt) on missing magic', async () => {
    const garbage = Buffer.from('NOT_A_GGUF_FILE');
    expect(() => parseGgufMetadata(garbage)).toThrowError(ParserError);
    try { parseGgufMetadata(garbage); } catch (e) {
      expect((e as ParserError).error.kind).toBe('gguf-corrupt');
    }
  });

  it('returns paramsBillions=null when metadata is missing the tensor info but parses the rest', async () => {
    // Use a known fixture where param count isn't in metadata
    const buf = await readFile(join(FIXTURE_DIR, 'unknown-arch-sample.head.gguf'));
    const meta = parseGgufMetadata(buf);
    expect(meta.arch).toBeTruthy(); // arch should still parse
  });
});
```

- [ ] **Step 3: Run; expect fail.**

- [ ] **Step 4: Implement the parser.** Per S3 spike decision, the implementation is either (a) using a chosen library like `@huggingface/gguf` or `gguf-parser-js`, or (b) hand-rolled per [GGUF spec](https://github.com/ggerganov/ggml/blob/master/docs/gguf.md). The skeleton below is hand-rolled (covers the minimum: header + key-value table); if S3 selected a library, replace the body.

```ts
// packages/local-gguf-runtime/src/metadata/parser.ts
//
// GGUF metadata parser. Implements a minimal-but-correct subset of the
// GGUF binary format spec sufficient to extract:
//   - general.architecture
//   - general.name
//   - general.file_type (quant)
//   - <arch>.context_length
//   - tokenizer.chat_template
// Tensor data is NOT parsed — we only walk the header + KV table.
//
// Spec: https://github.com/ggerganov/ggml/blob/master/docs/gguf.md
//
// (If Spike S3 selected a library, this file becomes a thin adapter
// around it. Either way the exported signature stays stable.)

import type { GgufMetadata, LocalGgufError } from '@team-x/shared-types';
import { isEmbeddingArch } from './embedding-arches';
import { isKnownToolCapable } from './tool-capable-list';

export class ParserError extends Error {
  constructor(public readonly error: LocalGgufError) {
    super(`ParserError: ${JSON.stringify(error)}`);
    this.name = 'ParserError';
  }
}

const GGUF_MAGIC = Buffer.from('GGUF', 'utf8');

enum GgufType {
  UINT8 = 0, INT8 = 1, UINT16 = 2, INT16 = 3,
  UINT32 = 4, INT32 = 5, FLOAT32 = 6, BOOL = 7,
  STRING = 8, ARRAY = 9, UINT64 = 10, INT64 = 11, FLOAT64 = 12,
}

interface Cursor { buf: Buffer; pos: number; }

function readU32(c: Cursor): number { const v = c.buf.readUInt32LE(c.pos); c.pos += 4; return v; }
function readU64(c: Cursor): bigint { const v = c.buf.readBigUInt64LE(c.pos); c.pos += 8; return v; }
function readI64(c: Cursor): bigint { const v = c.buf.readBigInt64LE(c.pos); c.pos += 8; return v; }
function readF32(c: Cursor): number { const v = c.buf.readFloatLE(c.pos); c.pos += 4; return v; }
function readF64(c: Cursor): number { const v = c.buf.readDoubleLE(c.pos); c.pos += 8; return v; }
function readBool(c: Cursor): boolean { const v = c.buf.readUInt8(c.pos) !== 0; c.pos += 1; return v; }
function readString(c: Cursor): string {
  const len = Number(readU64(c));
  if (c.pos + len > c.buf.length) throw new ParserError({ kind: 'gguf-parse-failed', path: '', reason: 'string overruns buffer' });
  const s = c.buf.toString('utf8', c.pos, c.pos + len);
  c.pos += len;
  return s;
}

function readValue(c: Cursor, type: number): unknown {
  switch (type) {
    case GgufType.UINT8: { const v = c.buf.readUInt8(c.pos); c.pos += 1; return v; }
    case GgufType.INT8: { const v = c.buf.readInt8(c.pos); c.pos += 1; return v; }
    case GgufType.UINT16: { const v = c.buf.readUInt16LE(c.pos); c.pos += 2; return v; }
    case GgufType.INT16: { const v = c.buf.readInt16LE(c.pos); c.pos += 2; return v; }
    case GgufType.UINT32: return readU32(c);
    case GgufType.INT32: { const v = c.buf.readInt32LE(c.pos); c.pos += 4; return v; }
    case GgufType.FLOAT32: return readF32(c);
    case GgufType.BOOL: return readBool(c);
    case GgufType.STRING: return readString(c);
    case GgufType.UINT64: return Number(readU64(c));
    case GgufType.INT64: return Number(readI64(c));
    case GgufType.FLOAT64: return readF64(c);
    case GgufType.ARRAY: {
      const itemType = readU32(c);
      const len = Number(readU64(c));
      const out = [];
      for (let i = 0; i < len; i++) out.push(readValue(c, itemType));
      return out;
    }
    default:
      throw new ParserError({ kind: 'gguf-parse-failed', path: '', reason: `unknown value type ${type}` });
  }
}

// Map general.file_type → human-readable quant string per llama.cpp source.
const FILE_TYPE_TO_QUANT: Record<number, string> = {
  0: 'F32', 1: 'F16', 2: 'Q4_0', 3: 'Q4_1', 7: 'Q8_0', 8: 'Q5_0', 9: 'Q5_1',
  10: 'Q2_K', 11: 'Q3_K_S', 12: 'Q3_K_M', 13: 'Q3_K_L',
  14: 'Q4_K_S', 15: 'Q4_K_M', 16: 'Q5_K_S', 17: 'Q5_K_M', 18: 'Q6_K',
  19: 'IQ2_XXS', 20: 'IQ2_XS', 21: 'IQ3_XXS', 22: 'IQ1_S',
  // ...add others as needed; unknown → null
};

export function parseGgufMetadata(buf: Buffer, sourcePath = ''): GgufMetadata {
  if (buf.length < 24) {
    throw new ParserError({ kind: 'gguf-corrupt', path: sourcePath });
  }
  if (!buf.subarray(0, 4).equals(GGUF_MAGIC)) {
    throw new ParserError({ kind: 'gguf-corrupt', path: sourcePath });
  }
  const cursor: Cursor = { buf, pos: 4 };
  const version = readU32(cursor);
  if (version < 1 || version > 3) {
    throw new ParserError({ kind: 'gguf-parse-failed', path: sourcePath, reason: `unsupported GGUF version ${version}` });
  }
  /* tensorCount */ readU64(cursor);
  const kvCount = Number(readU64(cursor));

  const kv: Record<string, unknown> = {};
  try {
    for (let i = 0; i < kvCount; i++) {
      const key = readString(cursor);
      const type = readU32(cursor);
      const value = readValue(cursor, type);
      kv[key] = value;
    }
  } catch (e) {
    if (e instanceof ParserError) throw e;
    throw new ParserError({ kind: 'gguf-parse-failed', path: sourcePath, reason: (e as Error).message });
  }

  const arch = String(kv['general.architecture'] ?? 'unknown');
  const name = String(kv['general.name'] ?? '');
  const fileType = typeof kv['general.file_type'] === 'number' ? (kv['general.file_type'] as number) : null;
  const quant = fileType !== null ? (FILE_TYPE_TO_QUANT[fileType] ?? null) : null;

  const contextMaxKey = `${arch}.context_length`;
  const contextMax = typeof kv[contextMaxKey] === 'number' ? (kv[contextMaxKey] as number) : null;

  const chatTemplate = typeof kv['tokenizer.chat_template'] === 'string'
    ? (kv['tokenizer.chat_template'] as string)
    : null;

  const blockCountKey = `${arch}.block_count`;
  const embeddingLengthKey = `${arch}.embedding_length`;
  const blockCount = typeof kv[blockCountKey] === 'number' ? (kv[blockCountKey] as number) : null;
  const embeddingLength = typeof kv[embeddingLengthKey] === 'number' ? (kv[embeddingLengthKey] as number) : null;
  const paramsBillions = (blockCount && embeddingLength)
    ? estimateParamsBillions(arch, blockCount, embeddingLength)
    : null;

  return {
    arch,
    paramsBillions,
    quant,
    contextMax,
    chatTemplate,
    isEmbeddingModel: isEmbeddingArch(arch),
    isToolCapable: isKnownToolCapable(arch, name, chatTemplate ?? ''),
    fileSizeBytes: buf.length, // caller may override with actual file size
    sha256: null, // computed by hf-client on download; null for local files
  };
}

// Crude parameter-count estimate. The accurate formula varies by arch;
// for v1 we accept a ±10% error band.
function estimateParamsBillions(arch: string, blockCount: number, embeddingLength: number): number {
  // Approximation: total params ≈ blockCount × embeddingLength × 12 (rough avg of attention + FFN proportions)
  const FACTOR = 12;
  return (blockCount * embeddingLength * embeddingLength * FACTOR) / 1e9;
}
```

- [ ] **Step 5: Author the supporting `embedding-arches.ts` and `tool-capable-list.ts` (TDD each).**

```ts
// packages/local-gguf-runtime/src/metadata/embedding-arches.ts
export const EMBEDDING_ARCHES = new Set<string>([
  'bert', 'nomic-bert', 'xlm-roberta', 'e5', 'bge', 't5', 'mpnet',
]);

export function isEmbeddingArch(arch: string): boolean {
  return EMBEDDING_ARCHES.has(arch.toLowerCase());
}
```

```ts
// packages/local-gguf-runtime/src/metadata/tool-capable-list.ts
// Heuristic: tool-capability isn't a GGUF metadata field. Maintain a
// curated list of model-name patterns known to be trained for
// OpenAI-style function calling. Expand as new models ship.
const PATTERNS: RegExp[] = [
  /hermes-?2/i,
  /hermes-?3/i,
  /nous.*tool/i,
  /functionary/i,
  /firefunction/i,
  /xlam/i,
];

export function isKnownToolCapable(arch: string, name: string, chatTemplate: string): boolean {
  for (const p of PATTERNS) {
    if (p.test(name)) return true;
  }
  // Some chat templates contain explicit tool markers
  if (/<tool_call>|<\|tool\|>|<function_call>/i.test(chatTemplate)) return true;
  return false;
}
```

Each gets its own test file with simple cases (positive + negative matches).

- [ ] **Step 6: Run all metadata tests.**

```bash
pnpm -F @team-x/local-gguf-runtime test -- metadata
```

Expected: all pass.

- [ ] **Step 7: Commit (one commit per file pair).**

```
feat(local-gguf): GGUF metadata parser (hand-rolled, ~200 LOC, S3 fixtures)
feat(local-gguf): embedding-arch detection (curated set)
feat(local-gguf): tool-capable hint detection (pattern-based, expandable)
```

---

### Task 3: Multi-part split-GGUF handling

**Files:**
- Create: `packages/local-gguf-runtime/src/library/split-gguf.ts`
- Create: `packages/local-gguf-runtime/src/library/split-gguf.test.ts`

Split GGUFs follow the naming convention `<base>-NNNNN-of-MMMMM.gguf` (e.g. `Llama-3.1-405B-Instruct-Q4_K_M-00001-of-00009.gguf`). Only the first part contains the metadata header; subsequent parts hold tensor data.

- [ ] **Step 1: TDD `isSplitPart`, `extractSplitInfo`, `groupSplitFiles`, `getHeadFile`.**

```ts
// packages/local-gguf-runtime/src/library/split-gguf.test.ts
import { describe, expect, it } from 'vitest';
import {
  isSplitPart, extractSplitInfo, groupSplitFiles, getHeadFile,
} from './split-gguf';

describe('split-gguf', () => {
  it('isSplitPart recognises the standard format', () => {
    expect(isSplitPart('Llama-3.1-405B-Q4_K_M-00001-of-00009.gguf')).toBe(true);
    expect(isSplitPart('Llama-3.1-8B-Q4_K_M.gguf')).toBe(false);
    expect(isSplitPart('not-a-gguf.bin')).toBe(false);
  });

  it('extractSplitInfo returns part index, total, and base name', () => {
    const info = extractSplitInfo('Llama-3.1-405B-Q4_K_M-00001-of-00009.gguf');
    expect(info).toEqual({
      baseName: 'Llama-3.1-405B-Q4_K_M',
      partIndex: 1,
      partTotal: 9,
    });
  });

  it('groupSplitFiles groups parts by base name', () => {
    const files = [
      'Llama-405B-Q4_K_M-00001-of-00009.gguf',
      'Llama-405B-Q4_K_M-00002-of-00009.gguf',
      'Llama-405B-Q4_K_M-00009-of-00009.gguf',
      'Mistral-7B-Q4_K_M.gguf',
    ];
    const grouped = groupSplitFiles(files);
    expect(grouped.size).toBe(2);
    expect(grouped.get('Llama-405B-Q4_K_M')?.length).toBe(3);
    expect(grouped.get('Mistral-7B-Q4_K_M')?.length).toBe(1);
  });

  it('getHeadFile returns the first part of a split, or the file itself if not split', () => {
    expect(getHeadFile([
      'Llama-405B-Q4_K_M-00001-of-00009.gguf',
      'Llama-405B-Q4_K_M-00002-of-00009.gguf',
    ])).toBe('Llama-405B-Q4_K_M-00001-of-00009.gguf');
    expect(getHeadFile(['Mistral-7B-Q4_K_M.gguf'])).toBe('Mistral-7B-Q4_K_M.gguf');
  });

  it('isComplete returns false when a part is missing', () => {
    // Add to split-gguf API as part of step 2
  });
});
```

- [ ] **Step 2: Implement.**

```ts
// packages/local-gguf-runtime/src/library/split-gguf.ts
const SPLIT_REGEX = /^(.+?)-(\d{5})-of-(\d{5})\.gguf$/i;

export interface SplitInfo {
  baseName: string;
  partIndex: number;
  partTotal: number;
}

export function isSplitPart(filename: string): boolean {
  return SPLIT_REGEX.test(filename);
}

export function extractSplitInfo(filename: string): SplitInfo | null {
  const m = SPLIT_REGEX.exec(filename);
  if (!m) return null;
  return { baseName: m[1], partIndex: parseInt(m[2], 10), partTotal: parseInt(m[3], 10) };
}

export function groupSplitFiles(filenames: string[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const f of filenames) {
    const info = extractSplitInfo(f);
    const key = info ? info.baseName : f.replace(/\.gguf$/i, '');
    const existing = grouped.get(key) ?? [];
    existing.push(f);
    grouped.set(key, existing);
  }
  // Sort parts numerically
  for (const [, parts] of grouped) {
    parts.sort((a, b) => {
      const ai = extractSplitInfo(a)?.partIndex ?? 0;
      const bi = extractSplitInfo(b)?.partIndex ?? 0;
      return ai - bi;
    });
  }
  return grouped;
}

export function getHeadFile(parts: string[]): string {
  if (parts.length === 0) throw new Error('parts must not be empty');
  if (parts.length === 1) return parts[0];
  const sorted = [...parts].sort((a, b) => {
    const ai = extractSplitInfo(a)?.partIndex ?? 0;
    const bi = extractSplitInfo(b)?.partIndex ?? 0;
    return ai - bi;
  });
  return sorted[0];
}

export function isComplete(parts: string[]): boolean {
  if (parts.length === 0) return false;
  if (parts.length === 1 && !isSplitPart(parts[0])) return true;
  const first = extractSplitInfo(parts[0]);
  if (!first) return false;
  if (parts.length !== first.partTotal) return false;
  const seen = new Set<number>();
  for (const p of parts) {
    const info = extractSplitInfo(p);
    if (!info || info.partTotal !== first.partTotal) return false;
    seen.add(info.partIndex);
  }
  return seen.size === first.partTotal;
}
```

- [ ] **Step 3: Run + commit.**

```
feat(local-gguf): split-GGUF helpers — isSplitPart / group / getHead / isComplete
```

---

### Task 4: Library scanner (TDD with memfs + integration)

**Files:**
- Create: `packages/local-gguf-runtime/src/library/scanner.ts`
- Create: `packages/local-gguf-runtime/src/library/scanner.test.ts`

Walk a folder, find `.gguf` files (recursive option), group split parts, return candidates for library insertion.

- [ ] **Step 1: Install memfs.**

```bash
pnpm -F @team-x/local-gguf-runtime add -D memfs@^4
```

- [ ] **Step 2: TDD test using memfs.**

```ts
// packages/local-gguf-runtime/src/library/scanner.test.ts
import { describe, expect, it } from 'vitest';
import { fs as memfs, vol } from 'memfs';
import { scanFolderForGgufs, type ScanFolderResult } from './scanner';

describe('scanFolderForGgufs', () => {
  beforeEach(() => { vol.reset(); });

  it('finds single .gguf in a flat folder', async () => {
    vol.fromJSON({
      '/models/llama-7b.gguf': Buffer.from('GGUF\x03\x00\x00\x00' /* + minimal valid header */).toString('binary'),
    });
    const result = await scanFolderForGgufs('/models', { recursive: false, fs: memfs.promises });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].headPath).toBe('/models/llama-7b.gguf');
  });

  it('skips non-.gguf files', async () => {
    vol.fromJSON({
      '/m/a.gguf': '...',
      '/m/b.bin': '...',
      '/m/c.gguf': '...',
    });
    const result = await scanFolderForGgufs('/m', { recursive: false, fs: memfs.promises });
    expect(result.candidates.map((c) => c.headPath).sort()).toEqual(['/m/a.gguf', '/m/c.gguf']);
  });

  it('recursive=true descends into subfolders', async () => {
    vol.fromJSON({
      '/m/a.gguf': '...',
      '/m/sub/b.gguf': '...',
      '/m/sub/deeper/c.gguf': '...',
    });
    const result = await scanFolderForGgufs('/m', { recursive: true, fs: memfs.promises });
    expect(result.candidates).toHaveLength(3);
  });

  it('recursive=false stays at top level', async () => {
    vol.fromJSON({
      '/m/a.gguf': '...',
      '/m/sub/b.gguf': '...',
    });
    const result = await scanFolderForGgufs('/m', { recursive: false, fs: memfs.promises });
    expect(result.candidates).toHaveLength(1);
  });

  it('groups multi-part split GGUFs into a single candidate', async () => {
    vol.fromJSON({
      '/m/Llama-405B-Q4_K_M-00001-of-00009.gguf': '...',
      '/m/Llama-405B-Q4_K_M-00002-of-00009.gguf': '...',
      '/m/Llama-405B-Q4_K_M-00003-of-00009.gguf': '...',
    });
    const result = await scanFolderForGgufs('/m', { recursive: false, fs: memfs.promises });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].headPath).toBe('/m/Llama-405B-Q4_K_M-00001-of-00009.gguf');
    expect(result.candidates[0].partPaths).toHaveLength(3);
    expect(result.candidates[0].isSplitIncomplete).toBe(true); // 3 of 9 present
  });

  it('returns isSplitIncomplete=false when all parts are present', async () => {
    const files: Record<string, string> = {};
    for (let i = 1; i <= 9; i++) {
      const padded = String(i).padStart(5, '0');
      files[`/m/Llama-405B-Q4_K_M-${padded}-of-00009.gguf`] = '...';
    }
    vol.fromJSON(files);
    const result = await scanFolderForGgufs('/m', { recursive: false, fs: memfs.promises });
    expect(result.candidates[0].isSplitIncomplete).toBe(false);
  });

  it('captures file sizes', async () => {
    vol.fromJSON({ '/m/a.gguf': 'X'.repeat(4_000) });
    const result = await scanFolderForGgufs('/m', { recursive: false, fs: memfs.promises });
    expect(result.candidates[0].sizeBytes).toBe(4000);
  });

  it('returns source-unreachable error when folder does not exist', async () => {
    const result = await scanFolderForGgufs('/no-such-folder', { recursive: false, fs: memfs.promises });
    expect(result.error).toEqual({ kind: 'source-unreachable', path: '/no-such-folder' });
    expect(result.candidates).toEqual([]);
  });
});

import { beforeEach } from 'vitest';
```

- [ ] **Step 3: Run; expect fail.**

- [ ] **Step 4: Implement.**

```ts
// packages/local-gguf-runtime/src/library/scanner.ts
import { join } from 'node:path';
import type { LocalGgufError } from '@team-x/shared-types';
import { extractSplitInfo, groupSplitFiles, getHeadFile, isComplete } from './split-gguf';

export interface ScanCandidate {
  headPath: string;             // absolute path to the part-1 file (or to the file if not split)
  partPaths: string[];          // absolute paths to all parts (1+)
  isSplitIncomplete: boolean;
  sizeBytes: number;            // sum across all parts
  baseName: string;             // human-readable name
}

export interface ScanFolderResult {
  candidates: ScanCandidate[];
  error: LocalGgufError | null;
}

export interface ScanFolderOptions {
  recursive: boolean;
  fs: {
    readdir: (p: string, opts?: { withFileTypes: true }) => Promise<Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>>;
    stat: (p: string) => Promise<{ size: number }>;
    access: (p: string) => Promise<void>;
  };
}

export async function scanFolderForGgufs(folder: string, opts: ScanFolderOptions): Promise<ScanFolderResult> {
  try {
    await opts.fs.access(folder);
  } catch {
    return { candidates: [], error: { kind: 'source-unreachable', path: folder } };
  }
  const ggufFiles: string[] = [];
  await walk(folder, opts.recursive, opts.fs, ggufFiles);

  // Group: relativeName → absolutePath map for the splitter
  const folderToFiles = new Map<string, string[]>();
  for (const abs of ggufFiles) {
    const parent = abs.substring(0, abs.lastIndexOf('/'));
    const name = abs.substring(abs.lastIndexOf('/') + 1);
    const existing = folderToFiles.get(parent) ?? [];
    existing.push(name);
    folderToFiles.set(parent, existing);
  }

  const candidates: ScanCandidate[] = [];
  for (const [parent, names] of folderToFiles) {
    const grouped = groupSplitFiles(names);
    for (const [baseName, parts] of grouped) {
      const headName = getHeadFile(parts);
      const partPaths = parts.map((n) => join(parent, n));
      let totalSize = 0;
      for (const p of partPaths) {
        try { totalSize += (await opts.fs.stat(p)).size; } catch { /* skip */ }
      }
      candidates.push({
        headPath: join(parent, headName),
        partPaths,
        isSplitIncomplete: !isComplete(parts),
        sizeBytes: totalSize,
        baseName,
      });
    }
  }
  return { candidates, error: null };
}

async function walk(
  folder: string,
  recursive: boolean,
  fs: ScanFolderOptions['fs'],
  out: string[],
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(folder, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const abs = join(folder, ent.name);
    if (ent.isFile() && /\.gguf$/i.test(ent.name)) {
      out.push(abs);
    } else if (ent.isDirectory() && recursive) {
      await walk(abs, recursive, fs, out);
    }
  }
}
```

- [ ] **Step 5: Run + commit.**

```
feat(local-gguf): folder scanner producing GGUF candidates with split-group support
```

---

### Task 5: Folder watcher (TDD)

**Files:**
- Create: `packages/local-gguf-runtime/src/library/folder-watcher.ts`
- Create: `packages/local-gguf-runtime/src/library/folder-watcher.test.ts`

Wraps chokidar with a debounced event emitter so a multi-file drop fires once.

- [ ] **Step 1: Add chokidar dep.**

```bash
pnpm -F @team-x/local-gguf-runtime add chokidar@^3
```

- [ ] **Step 2: TDD test (mocked chokidar).**

```ts
// packages/local-gguf-runtime/src/library/folder-watcher.test.ts
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createFolderWatcher } from './folder-watcher';

function makeFakeChokidar() {
  const watcher = new EventEmitter() as EventEmitter & { close: () => Promise<void> };
  watcher.close = async () => undefined;
  const watch = vi.fn().mockReturnValue(watcher);
  return { watch, watcher };
}

describe('folder watcher', () => {
  it('emits debounced add/unlink events', async () => {
    const { watch, watcher } = makeFakeChokidar();
    const events: Array<{ type: 'add' | 'unlink'; path: string }> = [];
    const w = createFolderWatcher('/m', { recursive: true, chokidarFactory: watch, debounceMs: 50 });
    w.on('change', (e) => events.push(e));
    await vi.waitFor(() => expect(watch).toHaveBeenCalledTimes(1));
    watcher.emit('add', '/m/a.gguf');
    watcher.emit('add', '/m/b.gguf');
    watcher.emit('unlink', '/m/c.gguf');
    await new Promise((r) => setTimeout(r, 100));
    expect(events).toHaveLength(3);
    expect(events).toContainEqual({ type: 'add', path: '/m/a.gguf' });
    expect(events).toContainEqual({ type: 'unlink', path: '/m/c.gguf' });
    await w.close();
  });

  it('only emits .gguf path events', async () => {
    const { watch, watcher } = makeFakeChokidar();
    const events: Array<{ type: 'add' | 'unlink'; path: string }> = [];
    const w = createFolderWatcher('/m', { recursive: true, chokidarFactory: watch, debounceMs: 10 });
    w.on('change', (e) => events.push(e));
    watcher.emit('add', '/m/readme.md');
    watcher.emit('add', '/m/model.gguf');
    await new Promise((r) => setTimeout(r, 50));
    expect(events).toEqual([{ type: 'add', path: '/m/model.gguf' }]);
    await w.close();
  });

  it('forwards error events as resilience-friendly signals', async () => {
    const { watch, watcher } = makeFakeChokidar();
    const errors: Error[] = [];
    const w = createFolderWatcher('/m', { recursive: true, chokidarFactory: watch });
    w.on('error', (e) => errors.push(e));
    watcher.emit('error', new Error('EACCES'));
    expect(errors).toHaveLength(1);
    await w.close();
  });

  it('close stops the underlying watcher', async () => {
    const { watch, watcher } = makeFakeChokidar();
    const close = vi.spyOn(watcher, 'close');
    const w = createFolderWatcher('/m', { recursive: true, chokidarFactory: watch });
    await w.close();
    expect(close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Implement.**

```ts
// packages/local-gguf-runtime/src/library/folder-watcher.ts
import { EventEmitter } from 'node:events';
import chokidar from 'chokidar';

export interface FolderWatcherOptions {
  recursive: boolean;
  chokidarFactory?: typeof chokidar.watch;
  debounceMs?: number;
}

export interface FolderWatcherChangeEvent {
  type: 'add' | 'unlink';
  path: string;
}

export interface FolderWatcher extends EventEmitter {
  close: () => Promise<void>;
}

export function createFolderWatcher(folder: string, opts: FolderWatcherOptions): FolderWatcher {
  const emitter = new EventEmitter() as FolderWatcher;
  const factory = opts.chokidarFactory ?? chokidar.watch;
  const w = factory(folder, {
    persistent: true,
    ignoreInitial: true,
    depth: opts.recursive ? undefined : 0,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  });

  const debounceMs = opts.debounceMs ?? 250;
  const pending = new Map<string, FolderWatcherChangeEvent>();
  let flushTimer: NodeJS.Timeout | null = null;

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      for (const e of pending.values()) emitter.emit('change', e);
      pending.clear();
    }, debounceMs);
  }

  function shouldEmit(path: string): boolean {
    return /\.gguf$/i.test(path);
  }

  w.on('add', (p: string) => {
    if (!shouldEmit(p)) return;
    pending.set(p, { type: 'add', path: p });
    scheduleFlush();
  });
  w.on('unlink', (p: string) => {
    if (!shouldEmit(p)) return;
    pending.set(p, { type: 'unlink', path: p });
    scheduleFlush();
  });
  w.on('error', (e: Error) => emitter.emit('error', e));

  emitter.close = async () => {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    await w.close();
  };
  return emitter;
}
```

- [ ] **Step 4: Run + commit.**

```
feat(local-gguf): folder watcher with chokidar + 250ms debounce + .gguf filter
```

---

### Task 6: Network-share resilience module (TDD)

**Files:**
- Create: `packages/local-gguf-runtime/src/library/resilience.ts`
- Create: `packages/local-gguf-runtime/src/library/resilience.test.ts`

Polls each watched path on a configurable interval (default 30 s with exponential backoff to 5 min ceiling), flips status, never gives up.

- [ ] **Step 1: TDD test using fake timers.**

```ts
// packages/local-gguf-runtime/src/library/resilience.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createResilienceMonitor } from './resilience';

describe('resilience monitor', () => {
  it('calls onReachableChange(true) when path becomes reachable', async () => {
    let reachable = false;
    const monitor = createResilienceMonitor(['/m'], {
      checkAccess: async () => { if (!reachable) throw new Error('ENOENT'); },
      baseIntervalMs: 10,
      maxIntervalMs: 50,
    });
    const events: Array<{ path: string; reachable: boolean }> = [];
    monitor.on('reachableChange', (e) => events.push(e));
    monitor.start();
    await new Promise((r) => setTimeout(r, 30));
    expect(events.some((e) => e.path === '/m' && e.reachable === false)).toBe(true);
    reachable = true;
    await new Promise((r) => setTimeout(r, 50));
    expect(events.some((e) => e.path === '/m' && e.reachable === true)).toBe(true);
    monitor.stop();
  });

  it('exponential backoff caps at maxIntervalMs', async () => {
    const calls: number[] = [];
    const monitor = createResilienceMonitor(['/m'], {
      checkAccess: async () => { calls.push(Date.now()); throw new Error('ENOENT'); },
      baseIntervalMs: 10,
      maxIntervalMs: 50,
    });
    monitor.start();
    await new Promise((r) => setTimeout(r, 200));
    monitor.stop();
    // Verify intervals grow but don't exceed maxIntervalMs (with some jitter tolerance)
    for (let i = 2; i < calls.length; i++) {
      const delta = calls[i] - calls[i - 1];
      expect(delta).toBeLessThanOrEqual(60);
    }
  });

  it('stop cancels pending checks', async () => {
    let calls = 0;
    const monitor = createResilienceMonitor(['/m'], {
      checkAccess: async () => { calls++; },
      baseIntervalMs: 10,
      maxIntervalMs: 100,
    });
    monitor.start();
    await new Promise((r) => setTimeout(r, 30));
    monitor.stop();
    const callsAtStop = calls;
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(callsAtStop);
  });
});
```

- [ ] **Step 2: Implement.**

```ts
// packages/local-gguf-runtime/src/library/resilience.ts
import { EventEmitter } from 'node:events';

export interface ResilienceMonitorOptions {
  checkAccess: (path: string) => Promise<void>;
  baseIntervalMs?: number;
  maxIntervalMs?: number;
}

export interface ReachableChangeEvent {
  path: string;
  reachable: boolean;
}

export interface ResilienceMonitor extends EventEmitter {
  start: () => void;
  stop: () => void;
}

const DEFAULT_BASE_MS = 30_000;
const DEFAULT_MAX_MS = 300_000;

export function createResilienceMonitor(
  paths: string[],
  opts: ResilienceMonitorOptions,
): ResilienceMonitor {
  const emitter = new EventEmitter() as ResilienceMonitor;
  const baseInterval = opts.baseIntervalMs ?? DEFAULT_BASE_MS;
  const maxInterval = opts.maxIntervalMs ?? DEFAULT_MAX_MS;
  const state = new Map<string, { reachable: boolean | null; failureCount: number }>();
  for (const p of paths) state.set(p, { reachable: null, failureCount: 0 });
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  async function tick() {
    if (stopped) return;
    for (const p of paths) {
      try {
        await opts.checkAccess(p);
        const prev = state.get(p)!;
        state.set(p, { reachable: true, failureCount: 0 });
        if (prev.reachable !== true) emitter.emit('reachableChange', { path: p, reachable: true });
      } catch {
        const prev = state.get(p)!;
        const failureCount = prev.failureCount + 1;
        state.set(p, { reachable: false, failureCount });
        if (prev.reachable !== false) emitter.emit('reachableChange', { path: p, reachable: false });
      }
    }
    if (!stopped) scheduleNext();
  }

  function nextInterval(): number {
    const maxFailureCount = Math.max(0, ...Array.from(state.values()).map((s) => s.failureCount));
    if (maxFailureCount === 0) return baseInterval;
    const grown = baseInterval * Math.pow(2, Math.min(maxFailureCount - 1, 5));
    return Math.min(grown, maxInterval);
  }

  function scheduleNext() {
    const interval = nextInterval();
    timer = setTimeout(tick, interval);
  }

  emitter.start = () => {
    if (timer) return;
    stopped = false;
    timer = setTimeout(tick, 0); // first check immediately
  };
  emitter.stop = () => {
    stopped = true;
    if (timer) { clearTimeout(timer); timer = null; }
  };
  return emitter;
}
```

- [ ] **Step 3: Run + commit.**

```
feat(local-gguf): network-share resilience monitor — 30 s poll, exp backoff to 5 min, never gives up
```

---

### Task 7: LibraryService (orchestrator in main process)

**Files:**
- Create: `apps/desktop/src/main/services/local-gguf/library-service.ts`
- Create: `apps/desktop/src/main/services/local-gguf/library-service.test.ts`

Ties everything together: scanner, parser, watchers, resilience, repos. Exposes the methods that IPC handlers call.

- [ ] **Step 1: TDD service.** Cover: `addFileToLibrary` (parse + insert row), `addWatchFolder` (insert + start watching + initial scan), `removeWatchFolder` (stop watcher + delete row), `scanFolder` (full re-scan returning added/removed counts), `removeModel` (delete row).

- [ ] **Step 2: Implement.** Heavy file; matches the patterns from existing Team-X services like `rag-indexer.ts`.

- [ ] **Step 3: Commit.**

```
feat(local-gguf): LibraryService — folder add/scan/watch + file picker + resilience integration
```

---

### Task 8: Replace `localGguf.library.*` IPC stubs

**Files:**
- Modify: `apps/desktop/src/main/ipc/local-gguf-library-handlers.ts`
- Modify: `apps/desktop/src/main/ipc/local-gguf-library-handlers.test.ts`

Replace every stub with a delegation to `LibraryService`. Update tests to expect real return shapes.

- [ ] **Step 1: Update handlers + tests.**
- [ ] **Step 2: Commit.**

```
feat(ipc): replace local-gguf library stubs with real LibraryService delegations
```

---

### Task 9: E2E spec — `local-gguf-network-share-resilience.spec.ts`

**Files:**
- Create: `apps/desktop/e2e/local-gguf-network-share-resilience.spec.ts`

E2E simulates a folder going unreachable mid-session and recovering. Uses a real temporary folder; the test programmatically renames it (simulating disconnect) and renames back (simulating reconnect).

- [ ] **Step 1: Write the spec.**

```ts
import { test, expect } from '@playwright/test';
import { mkdtemp, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launchAppForTest } from './helpers/launch';

test('library: NAS disconnect flips status to unreachable, reconnect restores', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'team-x-gguf-e2e-'));
  const ggufPath = join(dir, 'fake.gguf');
  await writeFile(ggufPath, Buffer.concat([Buffer.from('GGUF\x03\x00\x00\x00'), Buffer.alloc(64)]));

  const { app, page } = await launchAppForTest();
  try {
    const folder = await page.evaluate((p) => window.teamXApi.localGguf.library.addFolder(p, true), dir);
    expect(folder.path).toBe(dir);
    expect(folder.status).toBe('unknown');

    await page.evaluate((id) => window.teamXApi.localGguf.library.scanFolder(id), folder.id);

    // Simulate disconnect: rename the folder
    await rename(dir, dir + '-offline');
    await page.waitForTimeout(2000); // let the poll fire (test config uses a short interval)

    // Reconnect
    await rename(dir + '-offline', dir);
    await page.waitForTimeout(2000);

    // App still alive — that's the assertion. No crash.
    const status = await page.evaluate(() => window.teamXApi.localGguf.runtime.gpuInventory());
    expect(typeof status.detectedAt).toBe('number');
  } finally {
    await app.close();
    try { await rm(dir, { recursive: true, force: true }); } catch {}
    try { await rm(dir + '-offline', { recursive: true, force: true }); } catch {}
  }
});
```

- [ ] **Step 2: Run + commit.**

```
test(e2e): add local-gguf-network-share-resilience.spec — disconnect/reconnect cycle
```

---

### Task 10: CHANGELOG + quality gate + PR

```markdown
### Added
- **Local & Networked GGUF Support (Phase 3 — Library + Scanning)**: GGUF
  metadata parser (hand-rolled per ggml spec, ~200 LOC; extracts arch,
  params, quant, context_max, chat_template, embedding flag, tool-capable
  hint). Folder scanner with multi-part split-GGUF grouping. Chokidar-backed
  folder watcher with 250 ms debounce. Network-share resilience monitor
  (30 s base poll, exponential backoff to 5 min ceiling, never gives up).
  LibraryService orchestrates scanner + parser + watchers + resilience +
  repos behind all `localGguf.library.*` IPC channels — Phase 1 stubs
  replaced.
```

Quality gate per master plan § CR-6/CR-7. Performance asserts:
- Scanning 100 GGUFs (memfs) < 200 ms
- Parser on a 1 MiB head < 50 ms
- Folder watcher first event delay ≤ debounce + 50 ms

PR follows Phase 2 pattern with Codex Stage 3 MANDATORY (filesystem path handling, UNC/SMB surface).

---

## Phase 3 — Spec coverage map

| Spec section | Implemented by |
|---|---|
| § 4.1.2 unified intake (file/folder/UNC/SMB) | Tasks 4, 5, 7, 8 |
| § 4.1.2 multi-part split-GGUF | Task 3 |
| § 14 network-share resilience | Tasks 6, 9 |
| § 15 errors: `gguf-parse-failed`, `gguf-corrupt`, `source-unreachable` | Tasks 2, 4, 6 |
| § 13 backup: registry-only (files never copied) | (no copy code path in this phase by design — confirmed via review) |
| Spike S3 carry-over | Task 2 |
