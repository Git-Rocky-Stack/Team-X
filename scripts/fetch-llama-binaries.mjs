#!/usr/bin/env node
import { execFile } from 'node:child_process';
// scripts/fetch-llama-binaries.mjs
// ---------------------------------------------------------------------------
// Production fetch script for llama.cpp binary distribution (Option C).
//
// Usage:
//   node scripts/fetch-llama-binaries.mjs            # fetch current platform
//   node scripts/fetch-llama-binaries.mjs --all      # fetch all platforms
//   node scripts/fetch-llama-binaries.mjs --update-manifest          # current platform, populate real SHAs
//   node scripts/fetch-llama-binaries.mjs --update-manifest --all    # all platforms, populate real SHAs
//
// Behaviour:
//   - Downloads each asset to REPO_ROOT/.llama-cache/<tag>/<asset>
//   - SHA256-verifies the download against the manifest value (skipped in
//     --update-manifest mode — we're computing the real SHA, not checking it)
//   - Extracts into apps/desktop/resources/llama-server/<platform>/<arch>/<backend>/
//   - Idempotent: if a .sha256 marker file already matches, the asset is skipped
//   - For win32-x64-cuda: also downloads + extracts the companion cudart bundle
//     into the same extractTo directory
//   - In --update-manifest mode: computes the real sha256 + actual sizeBytes
//     for every processed asset and writes them back into the manifest JSON,
//     preserving formatting and key order. Safe to re-run.
//
// Gaps (documented — logged as WARN during CI):
//   - win32-arm64-vulkan: not shipped in b9371; Win arm64 gets cpu only
//   - linux-x64-cuda: not shipped as a bundled tarball in b9371; ship Vulkan
//
// Environment:
//   LLAMA_SKIP_VERIFY=1   Skip SHA256 verification even in normal mode (CI emergency escape)
// ---------------------------------------------------------------------------
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Paths — use fileURLToPath to avoid the leading-slash Windows path bug that
// `new URL('..', import.meta.url).pathname` produces on win32 (/E:/...).
// ---------------------------------------------------------------------------
const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const MANIFEST_PATH = join(SCRIPT_DIR, 'llama-binaries-manifest.json');
const CACHE_ROOT = join(REPO_ROOT, '.llama-cache');

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const FLAG_ALL = args.includes('--all');
const FLAG_UPDATE_MANIFEST = args.includes('--update-manifest');
const FLAG_SKIP_VERIFY = process.env.LLAMA_SKIP_VERIFY === '1';
// --soft: never hard-fail (exit 0 on error). Used by the postinstall hook so a
// network hiccup or offline/CI environment can't break `pnpm install`. Release
// builds (prepack) run WITHOUT --soft so a fetch/verify failure stops the build.
const FLAG_SOFT = args.includes('--soft');

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------
const log = (level, msg) => {
  const prefix =
    { INFO: '  [INFO]', WARN: '  [WARN]', ERROR: '[ERROR]', OK: '    [OK]' }[level] ?? ' [????]';
  console.log(`${prefix} ${msg}`);
};

// ---------------------------------------------------------------------------
// Load manifest
// ---------------------------------------------------------------------------
let manifest;
try {
  manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
} catch (err) {
  log('ERROR', `Failed to read manifest at ${MANIFEST_PATH}: ${err.message}`);
  process.exit(1);
}

const { llamaCppRelease: TAG, repo: REPO, binaries: BINARIES, gaps: GAPS } = manifest;

log('INFO', `llama.cpp release: ${TAG}  |  repo: ${REPO}`);
log(
  'INFO',
  `mode: ${FLAG_UPDATE_MANIFEST ? '--update-manifest' : 'normal'}${FLAG_ALL ? ' --all' : ' (current platform only)'}`,
);
log('INFO', '');

// ---------------------------------------------------------------------------
// Log known gaps up-front (CI visibility)
// ---------------------------------------------------------------------------
if (GAPS) {
  for (const [key, info] of Object.entries(GAPS)) {
    log('WARN', `GAP [${key}]: ${info.reason}`);
    log('WARN', `       Fallback: ${info.fallback}`);
  }
  log('INFO', '');
}

// ---------------------------------------------------------------------------
// Determine which combos to process
// ---------------------------------------------------------------------------
function currentPlatformKey() {
  const p = process.platform; // 'win32' | 'linux' | 'darwin'
  const a = process.arch; // 'x64' | 'arm64'
  // Return an array of keys that match this platform, ordered best→fallback.
  return Object.keys(BINARIES).filter((k) => k.startsWith(`${p}-${a}-`));
}

const ALL_KEYS = Object.keys(BINARIES);
const TARGET_KEYS = FLAG_ALL ? ALL_KEYS : currentPlatformKey();

if (TARGET_KEYS.length === 0) {
  log(
    'WARN',
    `No manifest entries match current platform (${process.platform}-${process.arch}). Use --all to fetch everything.`,
  );
  process.exit(0);
}

log('INFO', `Processing ${TARGET_KEYS.length} combo(s): ${TARGET_KEYS.join(', ')}`);
log('INFO', '');

// ---------------------------------------------------------------------------
// Download a single URL → localPath. Handles redirects. Throws on non-200.
// ---------------------------------------------------------------------------
async function download(url, localPath) {
  await mkdir(
    basename(localPath) === localPath
      ? '.'
      : localPath.slice(0, localPath.lastIndexOf('\\')).replace(/\//g, '\\') || '.',
    { recursive: true },
  ).catch(() => {});
  await mkdir(join(localPath, '..').replace(/\\/g, '/'), { recursive: true });

  log('INFO', `Downloading: ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  }
  if (!res.body) {
    throw new Error(`Empty response body — ${url}`);
  }
  await pipeline(res.body, createWriteStream(localPath));
  const { size } = await stat(localPath);
  log('INFO', `  Saved ${(size / 1024 / 1024).toFixed(2)} MB → ${localPath}`);
  return size;
}

// ---------------------------------------------------------------------------
// SHA256 a local file
// ---------------------------------------------------------------------------
async function sha256File(filePath) {
  const data = await readFile(filePath);
  return createHash('sha256').update(data).digest('hex');
}

// ---------------------------------------------------------------------------
// Extract an archive to a target directory.
// archiveType: 'zip' | 'tar.gz'
// ---------------------------------------------------------------------------
async function extract(archivePath, archiveType, extractTo) {
  await mkdir(extractTo, { recursive: true });

  if (archiveType === 'zip') {
    if (process.platform === 'win32') {
      // Use the OS-bundled bsdtar (System32\tar.exe, Win10 1803+/Win11), which
      // extracts zip natively via an args array. This deliberately avoids a
      // PowerShell `-Command` string (e.g. Expand-Archive), whose only way to
      // pass the paths is bare interpolation into a script literal — a shell
      // injection surface if an archive/destination path ever contains a quote.
      log('INFO', `  Extracting zip (bsdtar) → ${extractTo}`);
      const tarBin = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
      await execFileAsync(tarBin, ['-xf', archivePath, '-C', extractTo]);
    } else {
      log('INFO', `  Extracting zip (unzip) → ${extractTo}`);
      await execFileAsync('unzip', ['-o', archivePath, '-d', extractTo]);
    }
  } else if (archiveType === 'tar.gz') {
    log('INFO', `  Extracting tar.gz → ${extractTo}`);
    // On Windows, the `tar` on PATH is often MSYS/Git GNU tar, which reads the
    // `E:\...` archive path as a remote `host:path` and mangles backslash dirs.
    // Use the OS-bundled bsdtar (System32\tar.exe, present on Win10 1803+/Win11)
    // explicitly — it handles native Windows drive-letter paths cleanly.
    const tarBin =
      process.platform === 'win32'
        ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
        : 'tar';
    await execFileAsync(tarBin, ['-xzf', archivePath, '-C', extractTo]);
  } else {
    throw new Error(`Unknown archiveType '${archiveType}' for archive: ${archivePath}`);
  }
}

// ---------------------------------------------------------------------------
// Recursively locate a file by name under `dir` (shallow — max 4 levels).
// ---------------------------------------------------------------------------
async function findFile(dir, name, depth = 0) {
  if (depth > 4) return null;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isFile() && e.name === name) return join(dir, e.name);
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      const found = await findFile(join(dir, e.name), name, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Normalize the upstream server binary name to the canonical `server[.exe]`
// that BinaryResolver expects. llama.cpp ships it as `llama-server[.exe]`.
// Handles both flat extraction and a nested `build/bin/` layout (the binary's
// sibling libs are flattened up alongside it). Keyed on the COMBO's target
// platform, not the host — so cross-platform `--all` fetches normalize too.
// ---------------------------------------------------------------------------
async function normalizeServerBinary(extractDir, targetPlatform) {
  const isWin = targetPlatform === 'win32';
  const upstream = isWin ? 'llama-server.exe' : 'llama-server';
  const canonical = isWin ? 'server.exe' : 'server';
  if (existsSync(join(extractDir, canonical))) return; // already normalized

  const found = await findFile(extractDir, upstream);
  if (!found) {
    throw new Error(`Server binary '${upstream}' not found under ${extractDir}`);
  }
  const foundDir = dirname(found);
  if (resolve(foundDir) !== resolve(extractDir)) {
    // Nested layout (e.g. build/bin/): flatten files up to the backend dir so
    // the server binary sits beside its runtime libs at the resolved path.
    for (const e of await readdir(foundDir, { withFileTypes: true })) {
      if (e.isFile()) await rename(join(foundDir, e.name), join(extractDir, e.name));
    }
  }
  await rename(join(extractDir, upstream), join(extractDir, canonical));
  log('INFO', `  Normalized ${upstream} → ${canonical}`);
}

// ---------------------------------------------------------------------------
// Process a single asset (download + verify + extract).
// Returns { sha256, sizeBytes } of the downloaded archive.
// ---------------------------------------------------------------------------
async function processAsset(asset, archiveType, expectedSha256, sizeBytes, url, extractTo, label) {
  const cacheDir = join(CACHE_ROOT, TAG);
  await mkdir(cacheDir, { recursive: true });
  const cachePath = join(cacheDir, asset);
  const markerPath = `${cachePath}.sha256`;

  // Idempotency: if marker matches expected SHA (and not in update-manifest mode), skip.
  if (!FLAG_UPDATE_MANIFEST && expectedSha256 !== 'pending-execution' && existsSync(markerPath)) {
    const existingMarker = (await readFile(markerPath, 'utf8')).trim();
    if (existingMarker === expectedSha256) {
      log('OK', `${label}: cache hit — skipping download+verify`);
      return { sha256: expectedSha256, sizeBytes };
    }
  }

  // Download — or reuse a complete cached archive (cache holds immutable
  // release assets; reuse avoids re-pulling ~1GB on a re-run).
  let actualSize;
  if (existsSync(cachePath)) {
    actualSize = (await stat(cachePath)).size;
    log('INFO', `  Cache hit (${(actualSize / 1024 / 1024).toFixed(2)} MB) → ${cachePath}`);
  } else {
    actualSize = await download(url, cachePath);
  }

  // Compute SHA256
  const actualSha256 = await sha256File(cachePath);
  log('INFO', `  SHA256: ${actualSha256}`);

  // Verify (unless updating manifest or skip-verify flag)
  if (!FLAG_UPDATE_MANIFEST && !FLAG_SKIP_VERIFY) {
    if (expectedSha256 !== 'pending-execution' && actualSha256 !== expectedSha256) {
      throw new Error(
        `SHA256 mismatch for ${asset}!\n  Expected: ${expectedSha256}\n  Got:      ${actualSha256}`,
      );
    }
  }

  // Extract
  await extract(cachePath, archiveType, resolve(REPO_ROOT, extractTo));

  // Write marker
  await writeFile(markerPath, actualSha256, 'utf8');
  log('OK', `${label}: done`);

  return { sha256: actualSha256, sizeBytes: actualSize };
}

// ---------------------------------------------------------------------------
// Main processing loop
// ---------------------------------------------------------------------------
const manifestUpdates = {};

try {
  for (const key of TARGET_KEYS) {
    const entry = BINARIES[key];
    log('INFO', `── ${key} ────────────────────────────────`);

    // Primary asset
    const primary = await processAsset(
      entry.asset,
      entry.archiveType,
      entry.sha256,
      entry.sizeBytes,
      entry.url,
      entry.extractTo,
      key,
    );

    // Normalize llama-server[.exe] → server[.exe] for the combo's target platform.
    await normalizeServerBinary(resolve(REPO_ROOT, entry.extractTo), key.split('-')[0]);

    if (FLAG_UPDATE_MANIFEST) {
      manifestUpdates[key] = { sha256: primary.sha256, sizeBytes: primary.sizeBytes };
    }

    // Companion cudart bundle (win32-x64-cuda only, or any entry with .cudart)
    if (entry.cudart) {
      const cudart = entry.cudart;
      log('INFO', `  [cudart companion for ${key}]`);
      const cudartResult = await processAsset(
        cudart.asset,
        cudart.archiveType,
        cudart.sha256,
        cudart.sizeBytes,
        cudart.url,
        entry.extractTo, // extract into the same dir as the server binary
        `${key}:cudart`,
      );

      if (FLAG_UPDATE_MANIFEST) {
        if (!manifestUpdates[key]) manifestUpdates[key] = {};
        manifestUpdates[key].cudart = {
          sha256: cudartResult.sha256,
          sizeBytes: cudartResult.sizeBytes,
        };
      }
    }

    log('INFO', '');
  }
} catch (err) {
  if (FLAG_SOFT) {
    log(
      'WARN',
      `Fetch failed but --soft is set; install continues without binaries: ${err.message}`,
    );
    log('WARN', 'Fetch later with: node scripts/fetch-llama-binaries.mjs');
    process.exit(0);
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Write manifest updates back to disk (--update-manifest mode)
// ---------------------------------------------------------------------------
if (FLAG_UPDATE_MANIFEST && Object.keys(manifestUpdates).length > 0) {
  log('INFO', '── Writing manifest updates ────────────────────────────');

  // Re-read manifest to preserve formatting
  const raw = await readFile(MANIFEST_PATH, 'utf8');
  const updated = JSON.parse(raw);

  const now = new Date().toISOString();
  updated.verifiedAt = now;

  for (const [key, updates] of Object.entries(manifestUpdates)) {
    if (updated.binaries[key]) {
      updated.binaries[key].sha256 = updates.sha256;
      updated.binaries[key].sizeBytes = updates.sizeBytes;
      if (updates.cudart && updated.binaries[key].cudart) {
        updated.binaries[key].cudart.sha256 = updates.cudart.sha256;
        updated.binaries[key].cudart.sizeBytes = updates.cudart.sizeBytes;
      }
    }
  }

  await writeFile(MANIFEST_PATH, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  log('OK', `Manifest updated at ${MANIFEST_PATH} (verifiedAt: ${now})`);
}

log('INFO', '');
log('OK', `fetch-llama-binaries complete — ${TARGET_KEYS.length} combo(s) processed`);
log('INFO', '');
log('INFO', 'To populate ALL SHA256 hashes in the manifest, run:');
log('INFO', '  node scripts/fetch-llama-binaries.mjs --update-manifest --all');
