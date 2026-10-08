// Normalize an extracted llama.cpp release into the layout BinaryResolver
// expects: `server[.exe]` with every runtime library beside it.
//
// Linux and macOS archives put the binary in a nested folder (`llama-bNNNN/`,
// `build/bin/`) next to versioned libraries and their SONAME symlinks
// (`libllama.so.0 -> libllama.so.0.0.9371`). The loader looks libraries up by
// the SONAME, so the symlinks must travel with the files. Moving a symlink
// with rename() moves the link itself; its relative target names a sibling
// that moves into the same folder, so it still resolves.

import { existsSync } from 'node:fs';
import { readdir, rename, rm, rmdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Move every file and symlink under `dir` (any depth) up into `into`,
 * keeping what is already there, then remove the emptied folders.
 */
async function flattenInto(dir, into) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const from = join(dir, e.name);
    if (e.isDirectory()) {
      await flattenInto(from, into);
      continue;
    }
    if (!e.isFile() && !e.isSymbolicLink()) continue;
    const to = join(into, e.name);
    // existsSync follows links; a dangling link at `to` must still count.
    if (existsSync(to) || (await isLink(to))) {
      await rm(from, { force: true });
    } else {
      await rename(from, to);
    }
  }
  await rmdir(dir).catch(() => undefined);
}

async function isLink(path) {
  const { lstat } = await import('node:fs/promises');
  try {
    return (await lstat(path)).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Rename llama.cpp's `llama-server[.exe]` to `server[.exe]` and flatten any
 * nested layout. Idempotent, and it repairs folders flattened by earlier
 * versions that left the symlinks behind. Keyed on the target platform, not
 * the host, so cross-platform `--all` fetches normalize too.
 */
export async function normalizeServerBinary(extractDir, targetPlatform) {
  const isWin = targetPlatform === 'win32';
  const upstream = isWin ? 'llama-server.exe' : 'llama-server';
  const canonical = isWin ? 'server.exe' : 'server';

  for (const e of await readdir(extractDir, { withFileTypes: true })) {
    if (e.isDirectory()) await flattenInto(join(extractDir, e.name), extractDir);
  }

  if (existsSync(join(extractDir, upstream))) {
    await rename(join(extractDir, upstream), join(extractDir, canonical));
    return `Normalized ${upstream} → ${canonical}`;
  }
  if (!existsSync(join(extractDir, canonical))) {
    throw new Error(`Server binary '${upstream}' not found under ${extractDir}`);
  }
  return null;
}
