// packages/local-gguf-runtime/src/library/scanner.test.ts
//
// Folder-scanner tests. The fixture filesystem is memfs, which is POSIX-only:
// every volume key is a forward-slash path. That property is deliberate -- it
// pins the scanner's cross-platform contract: regardless of the separator style
// the caller passes in (POSIX `/m`, Windows drive `C:\\m`, or UNC `\\\\NAS\\share`),
// the scanner must normalize to forward slashes internally so (a) path
// construction is deterministic and (b) the paths it hands to `fs.stat` resolve
// against the POSIX volume. Asserting on forward-slash result paths here is what
// makes these tests pass on Windows, where `node:path.join` would otherwise emit
// backslashes and break both the assertions and the memfs lookups.
import { fs as memfs, vol } from 'memfs';
import { beforeEach, describe, expect, it } from 'vitest';
import { type ScanFolderOptions, scanFolderForGgufs } from './scanner';

// memfs's promises API is structurally compatible with the narrow `fs` surface
// the scanner needs (readdir withFileTypes / stat / access); the cast bridges
// memfs's broader overload signatures to the minimal contract under test.
const fs = memfs.promises as unknown as ScanFolderOptions['fs'];

// File contents are irrelevant to the scanner -- it keys off the `.gguf`
// extension and the `stat` size, never the bytes. Plain ASCII placeholders keep
// this test file pure text (no NUL bytes from a literal GGUF magic header).
const STUB = 'gguf-fixture';

describe('scanFolderForGgufs', () => {
  beforeEach(() => {
    vol.reset();
  });

  it('finds a single .gguf in a flat folder', async () => {
    vol.fromJSON({
      '/models/llama-7b.gguf': STUB,
    });
    const result = await scanFolderForGgufs('/models', { recursive: false, fs });
    expect(result.error).toBeNull();
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.headPath).toBe('/models/llama-7b.gguf');
    expect(result.candidates[0]?.partPaths).toEqual(['/models/llama-7b.gguf']);
    expect(result.candidates[0]?.isSplitIncomplete).toBe(false);
    expect(result.candidates[0]?.baseName).toBe('llama-7b');
  });

  it('skips non-.gguf files', async () => {
    vol.fromJSON({
      '/m/a.gguf': STUB,
      '/m/b.bin': STUB,
      '/m/c.gguf': STUB,
      '/m/notes.txt': STUB,
    });
    const result = await scanFolderForGgufs('/m', { recursive: false, fs });
    expect(result.candidates.map((c) => c.headPath).sort()).toEqual(['/m/a.gguf', '/m/c.gguf']);
  });

  it('matches .gguf case-insensitively', async () => {
    vol.fromJSON({
      '/m/lower.gguf': STUB,
      '/m/upper.GGUF': STUB,
      '/m/mixed.Gguf': STUB,
    });
    const result = await scanFolderForGgufs('/m', { recursive: false, fs });
    expect(result.candidates.map((c) => c.headPath).sort()).toEqual([
      '/m/lower.gguf',
      '/m/mixed.Gguf',
      '/m/upper.GGUF',
    ]);
  });

  it('descends into subfolders when recursive=true', async () => {
    vol.fromJSON({
      '/m/a.gguf': STUB,
      '/m/sub/b.gguf': STUB,
      '/m/sub/deeper/c.gguf': STUB,
    });
    const result = await scanFolderForGgufs('/m', { recursive: true, fs });
    expect(result.candidates.map((c) => c.headPath).sort()).toEqual([
      '/m/a.gguf',
      '/m/sub/b.gguf',
      '/m/sub/deeper/c.gguf',
    ]);
  });

  it('stays at the top level when recursive=false', async () => {
    vol.fromJSON({
      '/m/a.gguf': STUB,
      '/m/sub/b.gguf': STUB,
    });
    const result = await scanFolderForGgufs('/m', { recursive: false, fs });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.headPath).toBe('/m/a.gguf');
  });

  it('groups a 3-of-9 split into ONE incomplete candidate', async () => {
    vol.fromJSON({
      '/m/Llama-405B-Q4_K_M-00001-of-00009.gguf': STUB,
      '/m/Llama-405B-Q4_K_M-00002-of-00009.gguf': STUB,
      '/m/Llama-405B-Q4_K_M-00003-of-00009.gguf': STUB,
    });
    const result = await scanFolderForGgufs('/m', { recursive: false, fs });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.headPath).toBe('/m/Llama-405B-Q4_K_M-00001-of-00009.gguf');
    expect(result.candidates[0]?.partPaths).toEqual([
      '/m/Llama-405B-Q4_K_M-00001-of-00009.gguf',
      '/m/Llama-405B-Q4_K_M-00002-of-00009.gguf',
      '/m/Llama-405B-Q4_K_M-00003-of-00009.gguf',
    ]);
    expect(result.candidates[0]?.isSplitIncomplete).toBe(true);
    expect(result.candidates[0]?.baseName).toBe('Llama-405B-Q4_K_M');
  });

  it('points headPath at part-00001 even when readdir order is shuffled', async () => {
    // memfs returns entries in insertion order; insert out of sequence.
    vol.fromJSON({
      '/m/Model-00003-of-00003.gguf': STUB,
      '/m/Model-00001-of-00003.gguf': STUB,
      '/m/Model-00002-of-00003.gguf': STUB,
    });
    const result = await scanFolderForGgufs('/m', { recursive: false, fs });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.headPath).toBe('/m/Model-00001-of-00003.gguf');
    expect(result.candidates[0]?.isSplitIncomplete).toBe(false);
  });

  it('marks a complete 9-of-9 split as not incomplete', async () => {
    const files: Record<string, string> = {};
    for (let i = 1; i <= 9; i++) {
      const padded = String(i).padStart(5, '0');
      files[`/m/Llama-405B-Q4_K_M-${padded}-of-00009.gguf`] = STUB;
    }
    vol.fromJSON(files);
    const result = await scanFolderForGgufs('/m', { recursive: false, fs });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.isSplitIncomplete).toBe(false);
    expect(result.candidates[0]?.partPaths).toHaveLength(9);
  });

  it('captures the file size of a plain .gguf', async () => {
    vol.fromJSON({ '/m/a.gguf': 'X'.repeat(4000) });
    const result = await scanFolderForGgufs('/m', { recursive: false, fs });
    expect(result.candidates[0]?.sizeBytes).toBe(4000);
  });

  it('sums sizeBytes across every part of a split', async () => {
    vol.fromJSON({
      '/m/Big-00001-of-00003.gguf': 'A'.repeat(1000),
      '/m/Big-00002-of-00003.gguf': 'B'.repeat(2000),
      '/m/Big-00003-of-00003.gguf': 'C'.repeat(3000),
    });
    const result = await scanFolderForGgufs('/m', { recursive: false, fs });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.sizeBytes).toBe(6000);
  });

  it('handles a folder mixing a split and a plain .gguf', async () => {
    vol.fromJSON({
      '/m/Mistral-7B-Q4_K_M.gguf': 'X'.repeat(500),
      '/m/Big-00001-of-00002.gguf': 'A'.repeat(1000),
      '/m/Big-00002-of-00002.gguf': 'B'.repeat(1000),
    });
    const result = await scanFolderForGgufs('/m', { recursive: false, fs });
    expect(result.candidates).toHaveLength(2);
    const byBase = new Map(result.candidates.map((c) => [c.baseName, c]));

    const plain = byBase.get('Mistral-7B-Q4_K_M');
    expect(plain?.headPath).toBe('/m/Mistral-7B-Q4_K_M.gguf');
    expect(plain?.partPaths).toEqual(['/m/Mistral-7B-Q4_K_M.gguf']);
    expect(plain?.isSplitIncomplete).toBe(false);
    expect(plain?.sizeBytes).toBe(500);

    const split = byBase.get('Big');
    expect(split?.headPath).toBe('/m/Big-00001-of-00002.gguf');
    expect(split?.partPaths).toHaveLength(2);
    expect(split?.isSplitIncomplete).toBe(false);
    expect(split?.sizeBytes).toBe(2000);
  });

  it('groups split parts per-directory, not across directories (recursive)', async () => {
    // Same base name in two different folders must yield two candidates, each
    // headed by its own directory's part-00001 -- never cross-joined.
    vol.fromJSON({
      '/m/dirA/Model-00001-of-00002.gguf': STUB,
      '/m/dirA/Model-00002-of-00002.gguf': STUB,
      '/m/dirB/Model-00001-of-00002.gguf': STUB,
      '/m/dirB/Model-00002-of-00002.gguf': STUB,
    });
    const result = await scanFolderForGgufs('/m', { recursive: true, fs });
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((c) => c.headPath).sort()).toEqual([
      '/m/dirA/Model-00001-of-00002.gguf',
      '/m/dirB/Model-00001-of-00002.gguf',
    ]);
  });

  it('returns source-unreachable + empty candidates when the folder is absent', async () => {
    const result = await scanFolderForGgufs('/no-such-folder', { recursive: false, fs });
    expect(result.candidates).toEqual([]);
    expect(result.error).toEqual({ kind: 'source-unreachable', path: '/no-such-folder' });
  });

  it('returns an empty (non-error) result for a folder with no .gguf files', async () => {
    vol.fromJSON({ '/m/readme.md': STUB, '/m/weights.bin': STUB });
    const result = await scanFolderForGgufs('/m', { recursive: false, fs });
    expect(result.candidates).toEqual([]);
    expect(result.error).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Cross-platform path trap -- the crux of this task.
  //
  // memfs keys are POSIX. We feed the scanner Windows-style inputs (drive-letter
  // backslash + UNC double-backslash) and assert it (a) normalizes them so the
  // walk + stat calls resolve against the POSIX volume, and (b) returns
  // forward-slash result paths. This is the behavior that lets the same scanner
  // serve a real `C:\\...\\models` folder and a real `\\\\NAS\\share` on Windows
  // while remaining test-deterministic.
  // -------------------------------------------------------------------------
  it('normalizes a Windows drive-letter input to forward-slash output', async () => {
    // The volume is keyed with the normalized (forward-slash) form; the caller
    // passes the native backslash form. Equivalence proves normalization.
    vol.fromJSON({
      'C:/Users/me/models/llama.gguf': STUB,
      'C:/Users/me/models/Big-00001-of-00002.gguf': STUB,
      'C:/Users/me/models/Big-00002-of-00002.gguf': STUB,
    });
    const result = await scanFolderForGgufs('C:\\Users\\me\\models', { recursive: false, fs });
    expect(result.error).toBeNull();
    expect(result.candidates.map((c) => c.headPath).sort()).toEqual([
      'C:/Users/me/models/Big-00001-of-00002.gguf',
      'C:/Users/me/models/llama.gguf',
    ]);
    // No backslash leaks into any emitted path.
    for (const c of result.candidates) {
      expect(c.headPath).not.toContain('\\');
      for (const p of c.partPaths) expect(p).not.toContain('\\');
    }
  });

  it('normalizes a UNC \\\\NAS\\share input to //NAS/share output', async () => {
    // node:fs on Windows accepts `//NAS/share/...` for UNC; memfs models it the
    // same way. The leading `//` (double slash) must survive normalization.
    vol.fromJSON({
      '//NAS/share/models/a.gguf': STUB,
      '//NAS/share/models/sub/b.gguf': STUB,
    });
    const result = await scanFolderForGgufs('\\\\NAS\\share\\models', { recursive: true, fs });
    expect(result.error).toBeNull();
    expect(result.candidates.map((c) => c.headPath).sort()).toEqual([
      '//NAS/share/models/a.gguf',
      '//NAS/share/models/sub/b.gguf',
    ]);
    for (const c of result.candidates) {
      expect(c.headPath).not.toContain('\\');
    }
  });

  it('strips a trailing slash on the input folder so child paths have no double slash', async () => {
    vol.fromJSON({ '/m/a.gguf': STUB });
    const result = await scanFolderForGgufs('/m/', { recursive: false, fs });
    expect(result.candidates[0]?.headPath).toBe('/m/a.gguf');
  });

  // -------------------------------------------------------------------------
  // normalizeFolder edge cases for degenerate roots.
  //
  // normalizeFolder must never strip a trailing slash when doing so would leave
  // a bare UNC host (`//host` — no share) or the POSIX root `/`.  The safe
  // strip case (e.g. `//NAS/share/` → `//NAS/share`) is already covered by the
  // UNC test above; these lock the "don't strip" guard paths.
  // -------------------------------------------------------------------------
  it('does NOT strip trailing slash from a bare UNC host (//NAS/)', async () => {
    // `//NAS/` has no share segment after the host — stripping to `//NAS` would
    // corrupt the path. We assert via observable scan behavior: pass `//NAS/`
    // as the folder; access will reject (volume has nothing there), so we just
    // confirm the error path is `//NAS/` (not `//NAS`) — i.e. the slash was kept.
    const result = await scanFolderForGgufs('//NAS/', { recursive: false, fs });
    expect(result.error?.kind).toBe('source-unreachable');
    expect(result.error?.path).toBe('//NAS/');
  });

  it('does NOT strip the sole slash from a bare POSIX root (/)', async () => {
    // `/` is length 1, so the strip branch is never entered — length guard fires
    // before the isBareUncHost check.  memfs always treats `/` as accessible (it
    // is the FS root), so the scan succeeds with an empty result rather than an
    // unreachable error.  The key invariant: no exception propagates and no path
    // is mangled (the scan used `/`, not an empty string).
    const result = await scanFolderForGgufs('/', { recursive: false, fs });
    expect(result.error).toBeNull();
    expect(result.candidates).toEqual([]);
  });

  it('does NOT strip from bare double-slash (//)', async () => {
    // `//` ends with `/` but stripping would leave `/` — wrong.  The guard
    // catches this: stripped === `/`, so the strip is skipped.  memfs treats `//`
    // as accessible (same as `/`), so the scan returns empty candidates, no error.
    const result = await scanFolderForGgufs('//', { recursive: false, fs });
    expect(result.error).toBeNull();
    expect(result.candidates).toEqual([]);
  });

  it('strips trailing slash from a UNC share path (//NAS/share/)', async () => {
    // This is the "should strip" case to complement the guard tests above.
    vol.fromJSON({ '//NAS/share/models/x.gguf': STUB });
    const result = await scanFolderForGgufs('//NAS/share/', { recursive: true, fs });
    expect(result.error).toBeNull();
    const head = result.candidates[0]?.headPath;
    expect(head).toBe('//NAS/share/models/x.gguf');
    // headPath must not contain double-slash anywhere except the leading `//`.
    expect(head?.slice(2)).not.toContain('//');
  });

  // -------------------------------------------------------------------------
  // Resilience tests — the scanner must not throw even when the filesystem
  // misbehaves mid-scan.  The code already handles both cases; these tests lock
  // that behavior so regressions are caught immediately.
  //
  // Stubs wrap `memfs.promises` and delegate everything to it, overriding only
  // the single method under test for a specific path substring.
  // -------------------------------------------------------------------------
  it('readdir-throws-on-subfolder: still returns candidates from readable dirs', async () => {
    vol.fromJSON({
      '/m/top.gguf': STUB,
      '/m/blocked/secret.gguf': STUB,
      '/m/ok/fine.gguf': STUB,
    });

    // Stub: readdir throws EACCES for '/m/blocked', delegates everything else.
    const stubbedFs: ScanFolderOptions['fs'] = {
      readdir: async (p, opts) => {
        if (p.includes('blocked')) throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
        // memfs readdir with withFileTypes=true returns Dirent-like objects.
        return (memfs.promises as unknown as ScanFolderOptions['fs']).readdir(p, opts);
      },
      stat: (p) => (memfs.promises as unknown as ScanFolderOptions['fs']).stat(p),
      access: (p) => (memfs.promises as unknown as ScanFolderOptions['fs']).access(p),
    };

    // Must NOT throw.
    const result = await scanFolderForGgufs('/m', { recursive: true, fs: stubbedFs });
    expect(result.error).toBeNull();
    // top.gguf and ok/fine.gguf are returned; blocked/secret.gguf is silently skipped.
    const heads = result.candidates.map((c) => c.headPath).sort();
    expect(heads).toEqual(['/m/ok/fine.gguf', '/m/top.gguf']);
  });

  it('stat-throws-on-one-part: candidate still returned, sizeBytes sums OK parts only', async () => {
    vol.fromJSON({
      '/m/Big-00001-of-00002.gguf': 'A'.repeat(1000),
      '/m/Big-00002-of-00002.gguf': 'B'.repeat(2000),
    });

    // Stub: stat throws for part-00002, succeeds for everything else.
    const stubbedFs: ScanFolderOptions['fs'] = {
      readdir: (p, opts) => (memfs.promises as unknown as ScanFolderOptions['fs']).readdir(p, opts),
      stat: async (p) => {
        if (p.includes('00002-of-00002')) throw Object.assign(new Error('EIO'), { code: 'EIO' });
        return (memfs.promises as unknown as ScanFolderOptions['fs']).stat(p);
      },
      access: (p) => (memfs.promises as unknown as ScanFolderOptions['fs']).access(p),
    };

    // Must NOT throw.
    const result = await scanFolderForGgufs('/m', { recursive: false, fs: stubbedFs });
    expect(result.error).toBeNull();
    expect(result.candidates).toHaveLength(1);
    // Candidate is still returned (grouping is driven by filenames, not stat).
    expect(result.candidates[0]?.headPath).toBe('/m/Big-00001-of-00002.gguf');
    // sizeBytes reflects only the part that stat'd successfully (part-00001 = 1000 bytes).
    expect(result.candidates[0]?.sizeBytes).toBe(1000);
    // Both part paths are listed — completeness is name-driven, not stat-driven.
    expect(result.candidates[0]?.partPaths).toHaveLength(2);
  });
});
