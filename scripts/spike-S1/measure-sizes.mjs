#!/usr/bin/env node
// scripts/spike-S1/measure-sizes.mjs
// ---------------------------------------------------------------------------
// Spike S1 — extract llama.cpp archives and measure unpacked size on disk.
// THROWAWAY: deleted when the spike PR merges.
//
// Usage:
//   node scripts/spike-S1/measure-sizes.mjs <archive1> [archive2] [...]
//
// Cross-platform extraction:
//   - .zip   → PowerShell `Expand-Archive` on win32, `unzip` on POSIX
//   - .tar.gz → `tar -xzf` (built into both Windows 10+ and POSIX)
//
// Output: one JSON line per archive with extractedSizeBytes + extractedSizeMb.
// ---------------------------------------------------------------------------
import { execSync } from 'node:child_process';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

async function dirSize(path) {
  let total = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const p = join(path, entry.name);
    if (entry.isDirectory()) total += await dirSize(p);
    else total += (await stat(p)).size;
  }
  return total;
}

function extract(archive, destDir) {
  const isWin = process.platform === 'win32';
  if (archive.endsWith('.zip')) {
    if (isWin) {
      // Use PowerShell Expand-Archive — bundled on every Windows 10+ host.
      execSync(
        `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${archive}' -DestinationPath '${destDir}' -Force"`,
        { stdio: 'inherit' },
      );
    } else {
      execSync(`unzip -q -o "${archive}" -d "${destDir}"`, { stdio: 'inherit' });
    }
  } else if (archive.endsWith('.tar.gz') || archive.endsWith('.tgz')) {
    // `tar` ships on Windows 10 1803+ and every modern POSIX host.
    execSync(`tar -xzf "${archive}" -C "${destDir}"`, { stdio: 'inherit' });
  } else {
    throw new Error(`Unsupported archive type: ${archive}`);
  }
}

const archives = process.argv.slice(2);
if (archives.length === 0) {
  console.error('Usage: node scripts/spike-S1/measure-sizes.mjs <archive1> [archive2] ...');
  process.exit(2);
}

for (const archive of archives) {
  const absArchive = resolve(archive);
  const stem = basename(archive).replace(/\.(zip|tar\.gz|tgz)$/i, '');
  const extractDir = resolve(process.cwd(), '.spike-s1-extracted', stem);
  await rm(extractDir, { recursive: true, force: true });
  await mkdir(extractDir, { recursive: true });

  process.stderr.write(`[extract] ${absArchive} -> ${extractDir}\n`);
  extract(absArchive, extractDir);

  const extractedSizeBytes = await dirSize(extractDir);
  console.log(
    JSON.stringify({
      archive: basename(archive),
      extractedSizeBytes,
      extractedSizeMb: +(extractedSizeBytes / (1024 * 1024)).toFixed(2),
      extractDir,
    }),
  );
}
