/**
 * llama.cpp binary layout (scripts/lib/llama-layout.mjs).
 *
 * Linux and macOS releases ship versioned libraries plus SONAME symlinks
 * (`libllama.so.0 -> libllama.so.0.0.9371`) in a nested folder. Flattening
 * moved only regular files, so the symlinks stayed behind, the server could
 * not load `libllama.so.0`, and Local GGUF could not start a model on either
 * OS. Found by running the previously-skipped real-binary integration test
 * (audit 2026-10-07 P1-6).
 *
 * Located under apps/desktop/src/ because Vitest's projects cover apps/* and
 * packages/*, not scripts/.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// @ts-expect-error — .mjs script with implicit module resolution; vitest resolves at runtime.
import { normalizeServerBinary } from '../../../scripts/lib/llama-layout.mjs';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'llama-layout-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** The layout the b9371 Linux archive extracts to. */
function upstreamLinuxLayout(dir: string): string {
  const nested = join(dir, 'llama-b9371');
  mkdirSync(nested, { recursive: true });
  writeFileSync(join(nested, 'llama-server'), 'ELF');
  writeFileSync(join(nested, 'libllama.so.0.0.9371'), 'lib');
  symlinkSync('libllama.so.0.0.9371', join(nested, 'libllama.so.0'));
  symlinkSync('libllama.so.0', join(nested, 'libllama.so'));
  writeFileSync(join(nested, 'libggml.so.0.13.0'), 'lib');
  symlinkSync('libggml.so.0.13.0', join(nested, 'libggml.so.0'));
  return nested;
}

describe.skipIf(process.platform === 'win32')('normalizeServerBinary — symlinked libraries', () => {
  it('moves SONAME symlinks up beside the server, still pointing at their libraries', async () => {
    upstreamLinuxLayout(root);
    await normalizeServerBinary(root, 'linux');

    expect(existsSync(join(root, 'server'))).toBe(true);
    for (const [link, target] of [
      ['libllama.so.0', 'libllama.so.0.0.9371'],
      ['libllama.so', 'libllama.so.0'],
      ['libggml.so.0', 'libggml.so.0.13.0'],
    ]) {
      expect(lstatSync(join(root, link)).isSymbolicLink(), link).toBe(true);
      expect(readlinkSync(join(root, link))).toBe(target);
      // Resolves: the chain ends at a real file in the same folder.
      expect(existsSync(join(root, link)), `${link} dangles`).toBe(true);
    }
    expect(existsSync(join(root, 'llama-b9371'))).toBe(false);
  });

  it('repairs a folder an earlier run left half-flattened', async () => {
    const nested = upstreamLinuxLayout(root);
    // What the old script left: regular files moved up and the binary
    // renamed, symlinks stranded in the nested folder.
    for (const f of ['libllama.so.0.0.9371', 'libggml.so.0.13.0']) {
      writeFileSync(join(root, f), 'lib');
      rmSync(join(nested, f));
    }
    writeFileSync(join(root, 'server'), 'ELF');
    rmSync(join(nested, 'llama-server'));

    await normalizeServerBinary(root, 'linux');

    expect(existsSync(join(root, 'libllama.so.0'))).toBe(true);
    expect(existsSync(join(root, 'libggml.so.0'))).toBe(true);
    expect(existsSync(join(root, 'llama-b9371'))).toBe(false);
  });
});

describe('normalizeServerBinary — names', () => {
  it('renames a flat Windows server to server.exe', async () => {
    writeFileSync(join(root, 'llama-server.exe'), 'MZ');
    writeFileSync(join(root, 'ggml.dll'), 'dll');
    await normalizeServerBinary(root, 'win32');
    expect(existsSync(join(root, 'server.exe'))).toBe(true);
    expect(existsSync(join(root, 'ggml.dll'))).toBe(true);
  });

  it('is a no-op on an already-normalized folder', async () => {
    writeFileSync(join(root, 'server'), 'ELF');
    await normalizeServerBinary(root, 'linux');
    expect(existsSync(join(root, 'server'))).toBe(true);
  });

  it('fails clearly when there is no server binary at all', async () => {
    await expect(normalizeServerBinary(root, 'linux')).rejects.toThrow(/not found/);
  });
});
