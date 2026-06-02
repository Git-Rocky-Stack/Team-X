// packages/local-gguf-runtime/src/library/scanner.ts
//
// Folder scanner: walks a directory, finds `.gguf` files (optionally
// recursively), groups multi-part split GGUFs into single candidates, sums
// their sizes, and returns the candidates plus an optional reachability error.
//
// ── Cross-platform path strategy (load-bearing — read before editing) ────────
// The whole scanner operates in POSIX form: forward slashes, internally and on
// the way out. Three facts force this:
//
//   1. `node:path.join` is platform-aware. On Windows it emits backslashes, so
//      `join('/m', 'a.gguf')` → `'\\m\\a.gguf'`. That corrupts result paths and
//      breaks any consumer (and the memfs test volume) keyed on forward slashes.
//   2. `lastIndexOf('/')` returns -1 on a backslash path, so naïve parent/name
//      extraction silently produces garbage on Windows-native inputs.
//   3. `path.posix.join('//NAS/share', x)` collapses the leading `//` to `/`,
//      destroying the UNC root. So we cannot lean on `path.posix.join` either.
//
// The fix is small and explicit: normalize the incoming `folder` and every
// `readdir` name to forward slashes, then do all joining with a hand-rolled
// `joinPosix` that concatenates with a single `/` while preserving a leading
// `//` (UNC) — never collapsing it. Result paths are therefore deterministic,
// forward-slash, and (crucially) accepted verbatim by `node:fs` on Windows:
//   • a drive path `C:\\Users\\me\\models` → `C:/Users/me/models`
//   • a UNC share  `\\\\NAS\\share`        → `//NAS/share`
// both of which `fs.readdir` / `fs.stat` resolve on Windows. So the same code
// path serves the memfs POSIX fixtures (test-deterministic on Windows) and real
// local + network-share disk in production (Phase 3 § 14).
//
// ── Why this package stays separator-agnostic ───────────────────────────────
// The caller injects `fs` (LibraryService passes `node:fs/promises`; tests pass
// memfs). We never touch `process.platform` or the native `path` separator, so
// the module is pure and trivially testable on any OS.

import type { LocalGgufError } from '@team-x/shared-types';
import { getHeadFile, groupSplitFiles, isComplete } from './split-gguf.js';

/** One resolved library candidate — a single model, whether one file or a split set. */
export interface ScanCandidate {
  /** Forward-slash path to the head file (part-00001 of a split, or the file itself). */
  headPath: string;
  /** Forward-slash paths to every part (length ≥ 1), sorted by part index. */
  partPaths: string[];
  /** True when the candidate is a split whose shard set is not contiguous/complete. */
  isSplitIncomplete: boolean;
  /** Sum of the byte sizes of all parts that could be `stat`-ed. */
  sizeBytes: number;
  /** Human-readable base name (split base, or the plain filename minus `.gguf`). */
  baseName: string;
}

/** Result of a folder scan: the candidates found, plus a reachability error if any. */
export interface ScanFolderResult {
  candidates: ScanCandidate[];
  error: LocalGgufError | null;
}

/**
 * Narrow filesystem surface the scanner depends on. Injected so production wires
 * `node:fs/promises` and tests wire memfs — the scanner itself stays pure.
 */
export interface ScanFolderOptions {
  recursive: boolean;
  fs: {
    readdir: (
      p: string,
      opts?: { withFileTypes: true },
    ) => Promise<Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>>;
    stat: (p: string) => Promise<{ size: number }>;
    access: (p: string) => Promise<void>;
  };
}

/** Replace every backslash with a forward slash. The only OS-separator touch-point. */
function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Normalize a caller-supplied folder to canonical POSIX form:
 *   • backslashes → forward slashes
 *   • drop a single trailing slash (so children don't get a doubled separator),
 *     while preserving a bare root (`/`) and a UNC prefix (`//host/share`).
 */
function normalizeFolder(folder: string): string {
  const posix = toPosix(folder);
  if (posix.length > 1 && posix.endsWith('/')) {
    const stripped = posix.slice(0, -1);
    // Don't strip below a valid root: keep bare POSIX '/' and bare UNC host
    // '//host' (no share segment yet) — stripping either would corrupt the path.
    const isBareUncHost = stripped.startsWith('//') && !stripped.slice(2).includes('/');
    if (stripped !== '' && stripped !== '/' && !isBareUncHost) return stripped;
  }
  return posix;
}

/**
 * Join a normalized POSIX directory with a child name using exactly one `/`.
 * Unlike `path.posix.join`, this never collapses a leading `//` (UNC root) and
 * never re-resolves `.`/`..` — inputs here are already clean directory paths and
 * bare entry names from `readdir`.
 */
function joinPosix(dir: string, name: string): string {
  if (dir.endsWith('/')) return `${dir}${name}`;
  return `${dir}/${name}`;
}

/**
 * Extract the parent directory of a normalized POSIX path (no trailing slash).
 * Precondition: `posixPath` always contains at least one `/` — guaranteed by
 * `joinPosix`, which builds every scanner-internal path from a normalized root.
 */
function parentOf(posixPath: string): string {
  const idx = posixPath.lastIndexOf('/');
  if (idx <= 0) return posixPath.slice(0, idx + 1); // root-ish: '' or '/'
  return posixPath.slice(0, idx);
}

/** Extract the final segment (file/dir name) of a normalized POSIX path. */
function nameOf(posixPath: string): string {
  return posixPath.slice(posixPath.lastIndexOf('/') + 1);
}

const GGUF_EXT = /\.gguf$/i;

/**
 * Recursively collect forward-slash paths of every `.gguf` file under `dir`.
 * Descends into subdirectories only when `recursive` is true. A `readdir` that
 * throws (permission, mid-scan disconnect) is swallowed for that directory so a
 * single unreadable subtree never aborts the whole scan.
 */
async function walk(
  dir: string,
  recursive: boolean,
  fs: ScanFolderOptions['fs'],
  out: string[],
): Promise<void> {
  let entries: Awaited<ReturnType<ScanFolderOptions['fs']['readdir']>>;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const childPath = joinPosix(dir, toPosix(ent.name));
    if (ent.isFile() && GGUF_EXT.test(ent.name)) {
      out.push(childPath);
    } else if (recursive && ent.isDirectory()) {
      await walk(childPath, recursive, fs, out);
    }
  }
}

/**
 * Scan `folder` for GGUF models and return library candidates.
 *
 * If the folder is unreachable (`access` rejects), resolves to an empty
 * candidate list plus a `source-unreachable` error. Otherwise walks the tree
 * (recursing only when `opts.recursive`), groups `.gguf` files per directory via
 * `groupSplitFiles` so a multi-part split collapses to one candidate, and emits
 * a `ScanCandidate` per group with its head path, parts, completeness, summed
 * size, and base name. All returned paths use forward slashes (see file header).
 */
export async function scanFolderForGgufs(
  folder: string,
  opts: ScanFolderOptions,
): Promise<ScanFolderResult> {
  const root = normalizeFolder(folder);

  try {
    await opts.fs.access(root);
  } catch {
    return { candidates: [], error: { kind: 'source-unreachable', path: root } };
  }

  const ggufPaths: string[] = [];
  await walk(root, opts.recursive, opts.fs, ggufPaths);

  // Bucket filenames by their parent directory so split grouping is scoped per
  // directory — two same-named splits in sibling folders stay distinct models.
  const filesByDir = new Map<string, string[]>();
  for (const filePath of ggufPaths) {
    const dir = parentOf(filePath);
    const bucket = filesByDir.get(dir) ?? [];
    bucket.push(nameOf(filePath));
    filesByDir.set(dir, bucket);
  }

  const candidates: ScanCandidate[] = [];
  for (const [dir, names] of filesByDir) {
    const grouped = groupSplitFiles(names);
    for (const [baseName, parts] of grouped) {
      const partPaths = parts.map((n) => joinPosix(dir, n));

      let sizeBytes = 0;
      for (const partPath of partPaths) {
        try {
          sizeBytes += (await opts.fs.stat(partPath)).size;
        } catch {
          // A part that fails to stat (e.g. removed mid-scan) is skipped rather
          // than failing the candidate; completeness still reflects the names.
        }
      }

      candidates.push({
        headPath: joinPosix(dir, getHeadFile(parts)),
        partPaths,
        isSplitIncomplete: !isComplete(parts),
        sizeBytes,
        baseName,
      });
    }
  }

  return { candidates, error: null };
}
