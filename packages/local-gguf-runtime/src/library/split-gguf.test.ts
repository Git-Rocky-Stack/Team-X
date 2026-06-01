// packages/local-gguf-runtime/src/library/split-gguf.test.ts
import { describe, expect, it } from 'vitest';
import {
  extractSplitInfo,
  getHeadFile,
  groupSplitFiles,
  isComplete,
  isSplitPart,
} from './split-gguf';

// ---------------------------------------------------------------------------
// isSplitPart
// ---------------------------------------------------------------------------
describe('isSplitPart', () => {
  it('returns true for a standard split filename', () => {
    expect(isSplitPart('Llama-3.1-405B-Instruct-Q4_K_M-00001-of-00009.gguf')).toBe(true);
  });

  it('returns true for part 9-of-9 (last shard)', () => {
    expect(isSplitPart('Llama-3.1-405B-Instruct-Q4_K_M-00009-of-00009.gguf')).toBe(true);
  });

  it('returns true for a minimal 2-part split', () => {
    expect(isSplitPart('Model-00001-of-00002.gguf')).toBe(true);
  });

  it('returns false for a plain (non-split) .gguf file', () => {
    expect(isSplitPart('Mistral-7B-Instruct-Q4_K_M.gguf')).toBe(false);
  });

  it('returns false for a file with the wrong extension', () => {
    expect(isSplitPart('Model-00001-of-00002.bin')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isSplitPart('')).toBe(false);
  });

  it('returns false when the numeric tokens are too short (< 5 digits)', () => {
    // Only 4 digits — not a valid split name per the 5-digit convention
    expect(isSplitPart('Model-0001-of-0009.gguf')).toBe(false);
  });

  it('is case-insensitive on the .gguf extension', () => {
    expect(isSplitPart('Model-00001-of-00002.GGUF')).toBe(true);
    expect(isSplitPart('Model-00001-of-00002.Gguf')).toBe(true);
  });

  it('handles a base name that contains digits and dashes', () => {
    // Non-greedy (.+?) means the base name includes "Foo-2"
    expect(isSplitPart('Foo-2-00001-of-00002.gguf')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractSplitInfo
// ---------------------------------------------------------------------------
describe('extractSplitInfo', () => {
  it('returns correct baseName, partIndex, partTotal for part 1-of-9', () => {
    const info = extractSplitInfo('Llama-3.1-405B-Instruct-Q4_K_M-00001-of-00009.gguf');
    expect(info).toEqual({
      baseName: 'Llama-3.1-405B-Instruct-Q4_K_M',
      partIndex: 1,
      partTotal: 9,
    });
  });

  it('returns correct values for the last shard (9-of-9)', () => {
    const info = extractSplitInfo('Llama-3.1-405B-Instruct-Q4_K_M-00009-of-00009.gguf');
    expect(info).toEqual({
      baseName: 'Llama-3.1-405B-Instruct-Q4_K_M',
      partIndex: 9,
      partTotal: 9,
    });
  });

  it('handles a base name with digits and dashes (non-greedy capture)', () => {
    // The regex (.+?) is non-greedy — it captures up to the first -NNNNN-of-MMMMM
    const info = extractSplitInfo('Foo-2-00001-of-00002.gguf');
    expect(info).toEqual({ baseName: 'Foo-2', partIndex: 1, partTotal: 2 });
  });

  it('parses partIndex as a plain integer (no leading-zero preservation)', () => {
    const info = extractSplitInfo('Model-00005-of-00009.gguf');
    expect(info?.partIndex).toBe(5);
    expect(info?.partTotal).toBe(9);
  });

  it('returns null for a plain .gguf filename', () => {
    expect(extractSplitInfo('Mistral-7B-Q4_K_M.gguf')).toBeNull();
  });

  it('returns null for a non-gguf file', () => {
    expect(extractSplitInfo('Model-00001-of-00002.bin')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(extractSplitInfo('')).toBeNull();
  });

  it('is case-insensitive on the extension', () => {
    const info = extractSplitInfo('Model-00001-of-00002.GGUF');
    expect(info).toEqual({ baseName: 'Model', partIndex: 1, partTotal: 2 });
  });
});

// ---------------------------------------------------------------------------
// groupSplitFiles
// ---------------------------------------------------------------------------
describe('groupSplitFiles', () => {
  it('groups all parts of a split model under its base name', () => {
    const files = [
      'Llama-3.1-405B-Instruct-Q4_K_M-00001-of-00003.gguf',
      'Llama-3.1-405B-Instruct-Q4_K_M-00002-of-00003.gguf',
      'Llama-3.1-405B-Instruct-Q4_K_M-00003-of-00003.gguf',
    ];
    const grouped = groupSplitFiles(files);
    expect(grouped.size).toBe(1);
    expect(grouped.get('Llama-3.1-405B-Instruct-Q4_K_M')).toEqual(files);
  });

  it('sorts parts by index even when input is shuffled', () => {
    const files = [
      'Model-00003-of-00003.gguf',
      'Model-00001-of-00003.gguf',
      'Model-00002-of-00003.gguf',
    ];
    const grouped = groupSplitFiles(files);
    expect(grouped.get('Model')).toEqual([
      'Model-00001-of-00003.gguf',
      'Model-00002-of-00003.gguf',
      'Model-00003-of-00003.gguf',
    ]);
  });

  it('keeps a plain (non-split) .gguf under its bare name (extension stripped)', () => {
    const files = ['Mistral-7B-Q4_K_M.gguf'];
    const grouped = groupSplitFiles(files);
    expect(grouped.has('Mistral-7B-Q4_K_M')).toBe(true);
    expect(grouped.get('Mistral-7B-Q4_K_M')).toEqual(['Mistral-7B-Q4_K_M.gguf']);
  });

  it('handles a mix of split and non-split files', () => {
    const files = [
      'Mistral-7B-Q4_K_M.gguf',
      'BigModel-00002-of-00002.gguf',
      'BigModel-00001-of-00002.gguf',
    ];
    const grouped = groupSplitFiles(files);
    expect(grouped.size).toBe(2);
    expect(grouped.get('Mistral-7B-Q4_K_M')).toEqual(['Mistral-7B-Q4_K_M.gguf']);
    expect(grouped.get('BigModel')).toEqual([
      'BigModel-00001-of-00002.gguf',
      'BigModel-00002-of-00002.gguf',
    ]);
  });

  it('handles two different split models in the same list', () => {
    const files = [
      'ModelA-00002-of-00002.gguf',
      'ModelB-00001-of-00002.gguf',
      'ModelA-00001-of-00002.gguf',
      'ModelB-00002-of-00002.gguf',
    ];
    const grouped = groupSplitFiles(files);
    expect(grouped.size).toBe(2);
    expect(grouped.get('ModelA')).toEqual([
      'ModelA-00001-of-00002.gguf',
      'ModelA-00002-of-00002.gguf',
    ]);
    expect(grouped.get('ModelB')).toEqual([
      'ModelB-00001-of-00002.gguf',
      'ModelB-00002-of-00002.gguf',
    ]);
  });

  it('returns an empty map for an empty input', () => {
    expect(groupSplitFiles([])).toEqual(new Map());
  });
});

// ---------------------------------------------------------------------------
// getHeadFile
// ---------------------------------------------------------------------------
describe('getHeadFile', () => {
  it('returns part-00001 when input is already sorted', () => {
    const parts = [
      'Llama-3.1-405B-Q4_K_M-00001-of-00009.gguf',
      'Llama-3.1-405B-Q4_K_M-00002-of-00009.gguf',
    ];
    expect(getHeadFile(parts)).toBe('Llama-3.1-405B-Q4_K_M-00001-of-00009.gguf');
  });

  it('returns part-00001 even when input is unsorted (reverse order)', () => {
    const parts = [
      'Model-00003-of-00003.gguf',
      'Model-00001-of-00003.gguf',
      'Model-00002-of-00003.gguf',
    ];
    expect(getHeadFile(parts)).toBe('Model-00001-of-00003.gguf');
  });

  it('returns the single file directly when it is not a split part', () => {
    expect(getHeadFile(['Mistral-7B-Q4_K_M.gguf'])).toBe('Mistral-7B-Q4_K_M.gguf');
  });

  it('returns the single file directly when it is a split part (only 1 element)', () => {
    expect(getHeadFile(['Model-00001-of-00009.gguf'])).toBe('Model-00001-of-00009.gguf');
  });

  it('throws when passed an empty array', () => {
    expect(() => getHeadFile([])).toThrow('parts must not be empty');
  });

  it('does not mutate the original array', () => {
    const parts = ['Model-00002-of-00002.gguf', 'Model-00001-of-00002.gguf'];
    getHeadFile(parts);
    // Original array should remain in its original order
    expect(parts[0]).toBe('Model-00002-of-00002.gguf');
  });
});

// ---------------------------------------------------------------------------
// isComplete
// ---------------------------------------------------------------------------
describe('isComplete', () => {
  it('returns true when all N parts are present', () => {
    const parts = [
      'Model-00001-of-00003.gguf',
      'Model-00002-of-00003.gguf',
      'Model-00003-of-00003.gguf',
    ];
    expect(isComplete(parts)).toBe(true);
  });

  it('returns true for all 9 parts of a 9-shard model', () => {
    const parts = Array.from(
      { length: 9 },
      (_, i) => `Llama-3.1-405B-Q4_K_M-${String(i + 1).padStart(5, '0')}-of-00009.gguf`,
    );
    expect(isComplete(parts)).toBe(true);
  });

  it('returns false when a part is missing (3 of 9 present)', () => {
    const parts = [
      'Model-00001-of-00009.gguf',
      'Model-00002-of-00009.gguf',
      'Model-00003-of-00009.gguf',
    ];
    expect(isComplete(parts)).toBe(false);
  });

  it('returns false when the very last shard is absent', () => {
    const parts = [
      'Model-00001-of-00003.gguf',
      'Model-00002-of-00003.gguf',
      // 00003 missing
    ];
    expect(isComplete(parts)).toBe(false);
  });

  it('returns true for a single non-split .gguf file', () => {
    expect(isComplete(['Mistral-7B-Q4_K_M.gguf'])).toBe(true);
  });

  it('returns false for an empty array', () => {
    expect(isComplete([])).toBe(false);
  });

  it('returns false when parts have mismatched partTotal values', () => {
    // First part claims 3-of-3, second claims 2-of-2 — inconsistent set
    const parts = ['Model-00001-of-00003.gguf', 'Model-00002-of-00002.gguf'];
    expect(isComplete(parts)).toBe(false);
  });

  it('returns false when there are duplicate part indices (two 00001-of-00009)', () => {
    // Two copies of shard 1; shard 2 through 9 absent — count matches 9 only
    // if duplicates are naively counted, but seen.size should be < partTotal.
    const parts = [
      'Model-00001-of-00002.gguf',
      'Model-00001-of-00002.gguf', // duplicate — same index twice
    ];
    expect(isComplete(parts)).toBe(false);
  });

  it('returns false for a single split-part file (not complete on its own)', () => {
    // A single file that IS a split part is not the full model
    expect(isComplete(['Model-00001-of-00003.gguf'])).toBe(false);
  });

  it('handles a 1-of-1 split (edge case: partTotal === 1)', () => {
    // A degenerate split where there is exactly one shard claiming 1-of-1
    expect(isComplete(['Model-00001-of-00001.gguf'])).toBe(true);
  });

  it('returns false when a part index is out of range (index > partTotal)', () => {
    // 00005-of-00003 is malformed; count matches partTotal but index 5 is invalid
    const parts = [
      'Model-00001-of-00003.gguf',
      'Model-00002-of-00003.gguf',
      'Model-00005-of-00003.gguf',
    ];
    expect(isComplete(parts)).toBe(false);
  });

  it('returns false when array length matches partTotal but indices are duplicated across mixed bases', () => {
    // Three parts, all claiming -of-00003, but indices 1,2,2 — missing index 3
    const parts = [
      'Model-00001-of-00003.gguf',
      'Model-00002-of-00003.gguf',
      'Model-00002-of-00003.gguf', // duplicate index 2, index 3 absent
    ];
    expect(isComplete(parts)).toBe(false);
  });
});
