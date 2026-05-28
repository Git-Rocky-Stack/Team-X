#!/usr/bin/env node
// scripts/spike-S1/fetch-test.mjs
// ---------------------------------------------------------------------------
// Spike S1 — verify download + SHA256 verification for one llama.cpp asset
// end-to-end. THROWAWAY: deleted when the spike PR merges.
//
// Usage:
//   node scripts/spike-S1/fetch-test.mjs <asset-filename>
//
// Environment:
//   LLAMA_TAG       Override the release tag (default: b9371)
//   LLAMA_REPO      Override the GitHub repo (default: ggml-org/llama.cpp)
//
// Output: single line of JSON with asset, sizeBytes, sha256, downloadMs.
// Designed to be appended to a results file with `>> spike-s1-results.jsonl`.
// ---------------------------------------------------------------------------
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const TAG = process.env.LLAMA_TAG ?? 'b9371';
const REPO = process.env.LLAMA_REPO ?? 'ggml-org/llama.cpp';
const ASSET = process.argv[2];

if (!ASSET) {
  console.error('Usage: node scripts/spike-S1/fetch-test.mjs <asset-filename>');
  console.error('  e.g. node scripts/spike-S1/fetch-test.mjs llama-b9371-bin-win-cuda-13.3-x64.zip');
  process.exit(2);
}

const URL = `https://github.com/${REPO}/releases/download/${TAG}/${ASSET}`;
const OUT_DIR = join(process.cwd(), '.spike-s1-cache', TAG);
const OUT_PATH = join(OUT_DIR, ASSET);

await mkdir(OUT_DIR, { recursive: true });

process.stderr.write(`[fetch] ${URL}\n`);
const t0 = Date.now();
const res = await fetch(URL, { redirect: 'follow' });
if (!res.ok) {
  console.error(`HTTP ${res.status} ${res.statusText} for ${URL}`);
  process.exit(1);
}
if (!res.body) {
  console.error(`No response body for ${URL}`);
  process.exit(1);
}
await pipeline(res.body, createWriteStream(OUT_PATH));
const downloadMs = Date.now() - t0;

const sizeBytes = (await stat(OUT_PATH)).size;
const sha256 = createHash('sha256').update(await readFile(OUT_PATH)).digest('hex');

console.log(
  JSON.stringify({
    tag: TAG,
    asset: ASSET,
    sizeBytes,
    sizeMb: +(sizeBytes / (1024 * 1024)).toFixed(2),
    sha256,
    downloadMs,
    url: URL,
  }),
);
