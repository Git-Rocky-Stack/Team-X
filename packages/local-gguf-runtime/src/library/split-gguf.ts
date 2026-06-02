// packages/local-gguf-runtime/src/library/split-gguf.ts
//
// Pure string/path helpers for split-GGUF filenames.
//
// Split GGUFs follow the naming convention:
//   <base>-NNNNN-of-MMMMM.gguf
// e.g. Llama-3.1-405B-Instruct-Q4_K_M-00001-of-00009.gguf
//
// Only part 1 holds the GGUF metadata header; later parts hold tensor data.
// All functions operate on bare filenames (no directory path components).

const SPLIT_REGEX = /^(.+?)-(\d{5})-of-(\d{5})\.gguf$/i;

export interface SplitInfo {
  baseName: string;
  partIndex: number;
  partTotal: number;
}

/** Returns true when the filename matches the split-GGUF naming convention. */
export function isSplitPart(filename: string): boolean {
  return SPLIT_REGEX.test(filename);
}

/**
 * Extracts split metadata from a filename.
 * Returns null when the filename does not match the split-GGUF pattern.
 */
export function extractSplitInfo(filename: string): SplitInfo | null {
  const m = SPLIT_REGEX.exec(filename);
  if (!m) return null;
  const baseName = m[1];
  const partStr = m[2];
  const totalStr = m[3];
  // The regex matched — all three groups are guaranteed present.
  // Explicit guards satisfy noUncheckedIndexedAccess without non-null assertions.
  if (baseName === undefined || partStr === undefined || totalStr === undefined) return null;
  return {
    baseName,
    partIndex: Number.parseInt(partStr, 10),
    partTotal: Number.parseInt(totalStr, 10),
  };
}

/**
 * Groups filenames by their base model name.
 *
 * Split parts are keyed by their parsed baseName; plain .gguf files are keyed
 * by their filename with the .gguf extension stripped. Within each group the
 * parts are sorted ascending by partIndex (non-split files stay in place as
 * sole members of their group).
 */
export function groupSplitFiles(filenames: string[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const f of filenames) {
    const info = extractSplitInfo(f);
    const key = info ? info.baseName : f.replace(/\.gguf$/i, '');
    const existing = grouped.get(key) ?? [];
    existing.push(f);
    grouped.set(key, existing);
  }
  for (const [, parts] of grouped) {
    parts.sort(
      (a, b) => (extractSplitInfo(a)?.partIndex ?? 0) - (extractSplitInfo(b)?.partIndex ?? 0),
    );
  }
  return grouped;
}

/**
 * Returns the "head" file — the part that contains the GGUF metadata header.
 *
 * For a split model this is the shard with the lowest partIndex (00001).
 * For a single non-split file the file itself is returned.
 * Throws when `parts` is empty.
 */
export function getHeadFile(parts: string[]): string {
  if (parts.length === 0) throw new Error('parts must not be empty');
  const first = parts[0];
  if (parts.length === 1) {
    // Guaranteed non-undefined because length === 1.
    if (first === undefined) throw new Error('parts must not be empty');
    return first;
  }
  const sorted = [...parts].sort(
    (a, b) => (extractSplitInfo(a)?.partIndex ?? 0) - (extractSplitInfo(b)?.partIndex ?? 0),
  );
  const head = sorted[0];
  // sorted is a non-empty copy of a non-empty array — head is always defined.
  if (head === undefined) throw new Error('parts must not be empty');
  return head;
}

/**
 * Returns true when the `parts` array represents a complete, contiguous set
 * of shards for the model.
 *
 * Rules:
 * - An empty array is never complete.
 * - A single non-split .gguf file is always complete.
 * - A single split-part file is NOT complete (partTotal > 1 by definition, and
 *   even a 1-of-1 degenerate split is only complete when parts.length === 1
 *   and partTotal === 1).
 * - For a multi-file split: the array length must equal partTotal, all parts
 *   must agree on partTotal, and the set of observed partIndex values must
 *   cover every integer from 1 to partTotal with no duplicates.
 */
export function isComplete(parts: string[]): boolean {
  if (parts.length === 0) return false;
  const head = parts[0];
  // Guaranteed non-undefined because length > 0.
  if (head === undefined) return false;
  if (parts.length === 1 && !isSplitPart(head)) return true;
  const first = extractSplitInfo(head);
  if (!first) return false;
  if (parts.length !== first.partTotal) return false;
  const seen = new Set<number>();
  for (const p of parts) {
    const info = extractSplitInfo(p);
    if (!info || info.partTotal !== first.partTotal) return false;
    // Reject out-of-range indices (e.g. 00005-of-00003) — a malformed shard
    // must not let an otherwise count-matching set report as complete.
    if (info.partIndex < 1 || info.partIndex > first.partTotal) return false;
    seen.add(info.partIndex);
  }
  // size === partTotal distinct indices, each within [1, partTotal] ⟹ exactly {1..partTotal}.
  return seen.size === first.partTotal;
}
