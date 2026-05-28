#!/usr/bin/env node
/**
 * Spike S5 — Hugging Face Hub API probe (throwaway prototype).
 *
 * Validates the four HF Hub endpoints the Phase 7 browser needs:
 *   1. GET /api/models?search=…   (list / search)
 *   2. GET /api/models/{repoId}    (model card with siblings file list)
 *   3. HEAD /{repoId}/resolve/main/{file}  (size + Accept-Ranges + ETag)
 *   4. GET /{repoId}/resolve/main/{file} with Range header  (chunked download)
 *
 * Multi-samples every endpoint (default 5) and emits p50 + p95 latency.
 * Also drives the rate-limit stress test (50× anonymous search burst) and
 * the bit-perfect Range stitch validation that proves resume works.
 *
 * Pure Node ≥18 stdlib (built-in `fetch`, `node:crypto`,
 * `node:perf_hooks`). No npm deps. No transformer compilation.
 *
 * CLI:
 *   node scripts/spike-S5/hf-probe.mjs --endpoints       # 4 endpoints × 5 samples
 *   node scripts/spike-S5/hf-probe.mjs --burst           # 50× anonymous search
 *   node scripts/spike-S5/hf-probe.mjs --resume          # Range stitch SHA proof
 *   node scripts/spike-S5/hf-probe.mjs --report          # Run all three, write
 *                                                       # .spike-s5-cache/report.json
 *
 * No HF token is read from the environment. Step 5 of the master plan
 * marks the token-mode rerun as Rocky's optional homework; if you want
 * to see the authenticated headers, set HF_TOKEN and re-run --burst.
 *
 * @file scripts/spike-S5/hf-probe.mjs
 * @see  docs/spikes/2026-05-27-S5-hf-api-client.md
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve as pathResolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, '..', '..');
const CACHE_DIR = pathResolve(REPO_ROOT, '.spike-s5-cache');

// --- Fixture URLs -----------------------------------------------------------
//
// TinyLlama 1.1B Q4_K_M is the spike's range/resume fixture: the smallest
// well-known GGUF on HF Hub (~640 MB) with a stable URL and CDN coverage.
// We never download the whole file — only the first 0–1999 bytes — but it
// is the same file Phase 7 will preview in production, so the Range stitch
// is meaningful evidence.
//
// Model card + search fixtures are the high-traffic bartowski conversions
// referenced in S3 and on the master plan.

const SEARCH_URL =
  'https://huggingface.co/api/models?search=llama&filter=gguf&sort=downloads&direction=-1&limit=5';
const MODEL_CARD_URL =
  'https://huggingface.co/api/models/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF';
// NB: the master plan (lines 1385, 1395) names
// `bartowski/TinyLlama-1.1B-Chat-v1.0-GGUF` for this fixture. That repo
// does not exist — HF returns `401 {"error":"Invalid username or
// password."}` for both the resolve URL and the `/api/models/…` lookup
// (HF uses 401 instead of 404 so the existence of private repos cannot
// be enumerated). The canonical, public-anonymous TinyLlama 1.1B
// Q4_K_M conversion is on TheBloke's namespace; the file inside that
// repo is lowercased per TheBloke's convention. Writeup notes this as
// a small spec amendment.
const TINYLLAMA_URL =
  'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf';

const USER_AGENT = 'team-x-spike-S5/0.1 (+https://github.com/Git-Rocky-Stack/Team-X)';

// --- Helpers ----------------------------------------------------------------

/**
 * Returns the p50 (median) and p95 of a numeric array. Uses nearest-rank
 * percentile (Wikipedia "Nearest-rank method") — adequate for N=5 samples.
 * For N=5, p50 = sorted[2], p95 = sorted[4].
 *
 * @param {number[]} samples
 * @returns {{ p50: number, p95: number, min: number, max: number, n: number }}
 */
function percentiles(samples) {
  if (samples.length === 0) return { p50: 0, p95: 0, min: 0, max: 0, n: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const p50Index = Math.ceil(0.5 * sorted.length) - 1;
  const p95Index = Math.ceil(0.95 * sorted.length) - 1;
  return {
    p50: sorted[Math.max(0, p50Index)],
    p95: sorted[Math.max(0, p95Index)],
    min: sorted[0],
    max: sorted[sorted.length - 1],
    n: sorted.length,
  };
}

/**
 * Captures rate-limit + cache headers from an HF response.
 * HF Hub uses a mix of standard (`x-ratelimit-*`) and CDN-specific headers.
 *
 * @param {Headers} h
 */
function captureHeaders(h) {
  return {
    'content-length': h.get('content-length'),
    'content-type': h.get('content-type'),
    'content-range': h.get('content-range'),
    'accept-ranges': h.get('accept-ranges'),
    etag: h.get('etag'),
    'x-repo-commit': h.get('x-repo-commit'),
    'x-linked-etag': h.get('x-linked-etag'),
    'x-linked-size': h.get('x-linked-size'),
    'x-ratelimit-limit': h.get('x-ratelimit-limit'),
    'x-ratelimit-remaining': h.get('x-ratelimit-remaining'),
    'x-ratelimit-reset': h.get('x-ratelimit-reset'),
    'retry-after': h.get('retry-after'),
    'cache-control': h.get('cache-control'),
    'x-cache': h.get('x-cache'),
    'cf-cache-status': h.get('cf-cache-status'),
    server: h.get('server'),
  };
}

/**
 * Wraps `fetch` to time each call with sub-ms precision.
 * Always passes the spike's User-Agent so HF sees consistent telemetry.
 *
 * @param {string} url
 * @param {RequestInit} [init]
 */
async function timedFetch(url, init = {}) {
  const t0 = performance.now();
  const res = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': USER_AGENT,
      ...(init.headers || {}),
    },
  });
  const latencyMs = performance.now() - t0;
  return { res, latencyMs };
}

/**
 * Sleeps for `ms` milliseconds. Used between sample runs so we don't
 * hammer the CDN edge node and skew p95.
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Endpoint probes (5 samples each by default) ---------------------------

/**
 * Probe 1: search. Returns the array length, first hit's id, plus the
 * latency for each sample.
 */
async function probeSearch(samples = 5) {
  const latencies = [];
  let lastHeaders = null;
  let lastStatus = null;
  let resultCount = 0;
  let sampleId = null;
  let sampleDownloads = null;
  for (let i = 0; i < samples; i++) {
    const { res, latencyMs } = await timedFetch(SEARCH_URL);
    latencies.push(latencyMs);
    lastStatus = res.status;
    lastHeaders = captureHeaders(res.headers);
    if (i === samples - 1) {
      const json = await res.json();
      resultCount = Array.isArray(json) ? json.length : 0;
      sampleId = json?.[0]?.id ?? null;
      sampleDownloads = json?.[0]?.downloads ?? null;
    } else {
      await res.arrayBuffer(); // drain
    }
    if (i < samples - 1) await sleep(250);
  }
  return {
    test: 'search',
    url: SEARCH_URL,
    status: lastStatus,
    latency: percentiles(latencies),
    latencySamples: latencies.map((n) => Number(n.toFixed(2))),
    resultsCount: resultCount,
    sampleId,
    sampleDownloads,
    headers: lastHeaders,
  };
}

/**
 * Probe 2: model card. Counts siblings, picks one .gguf sample.
 */
async function probeModelCard(samples = 5) {
  const latencies = [];
  let lastHeaders = null;
  let lastStatus = null;
  let filesCount = 0;
  let ggufCount = 0;
  let sampleGguf = null;
  let lastModified = null;
  let downloadsAllTime = null;
  for (let i = 0; i < samples; i++) {
    const { res, latencyMs } = await timedFetch(MODEL_CARD_URL);
    latencies.push(latencyMs);
    lastStatus = res.status;
    lastHeaders = captureHeaders(res.headers);
    if (i === samples - 1) {
      const json = await res.json();
      filesCount = json?.siblings?.length ?? 0;
      const ggufs = (json?.siblings ?? []).filter((s) => s.rfilename?.endsWith('.gguf'));
      ggufCount = ggufs.length;
      sampleGguf = ggufs[0]?.rfilename ?? null;
      lastModified = json?.lastModified ?? null;
      downloadsAllTime = json?.downloadsAllTime ?? json?.downloads ?? null;
    } else {
      await res.arrayBuffer();
    }
    if (i < samples - 1) await sleep(250);
  }
  return {
    test: 'modelCard',
    url: MODEL_CARD_URL,
    status: lastStatus,
    latency: percentiles(latencies),
    latencySamples: latencies.map((n) => Number(n.toFixed(2))),
    filesCount,
    ggufCount,
    sampleGguf,
    lastModified,
    downloadsAllTime,
    headers: lastHeaders,
  };
}

/**
 * Probe 3: HEAD on a GGUF resolve URL. Captures content-length,
 * Accept-Ranges, ETag, x-repo-commit, x-linked-etag/size.
 * Follows redirects (resolve/main URLs redirect to LFS CDN).
 */
async function probeFileHead(samples = 5) {
  const latencies = [];
  let lastHeaders = null;
  let lastStatus = null;
  let finalUrl = null;
  for (let i = 0; i < samples; i++) {
    const { res, latencyMs } = await timedFetch(TINYLLAMA_URL, {
      method: 'HEAD',
      redirect: 'follow',
    });
    latencies.push(latencyMs);
    lastStatus = res.status;
    lastHeaders = captureHeaders(res.headers);
    finalUrl = res.url;
    if (i < samples - 1) await sleep(250);
  }
  return {
    test: 'fileHead',
    url: TINYLLAMA_URL,
    finalUrl,
    status: lastStatus,
    latency: percentiles(latencies),
    latencySamples: latencies.map((n) => Number(n.toFixed(2))),
    headers: lastHeaders,
  };
}

/**
 * Probe 4: Range download of bytes 0–1023.
 */
async function probeRangeDownload(samples = 5) {
  const latencies = [];
  let lastHeaders = null;
  let lastStatus = null;
  let lastBytes = 0;
  for (let i = 0; i < samples; i++) {
    const { res, latencyMs } = await timedFetch(TINYLLAMA_URL, {
      headers: { Range: 'bytes=0-1023' },
    });
    latencies.push(latencyMs);
    lastStatus = res.status;
    lastHeaders = captureHeaders(res.headers);
    const buf = await res.arrayBuffer();
    lastBytes = buf.byteLength;
    if (i < samples - 1) await sleep(250);
  }
  return {
    test: 'rangeDownload',
    url: TINYLLAMA_URL,
    status: lastStatus,
    latency: percentiles(latencies),
    latencySamples: latencies.map((n) => Number(n.toFixed(2))),
    bytesReturned: lastBytes,
    headers: lastHeaders,
  };
}

// --- Step 4: rate-limit burst ----------------------------------------------

/**
 * Hits SEARCH_URL `count` times sequentially with no auth.
 * Records every status, every rate-limit header, every latency.
 * Stops early if 429 fires AND emits the Retry-After value.
 *
 * @param {number} count
 */
async function rateLimitBurst(count = 50) {
  const samples = [];
  const startedAt = Date.now();
  let firstRateLimit = null;
  let any429 = false;
  for (let i = 0; i < count; i++) {
    const t0 = performance.now();
    let res;
    try {
      res = await fetch(SEARCH_URL, {
        headers: { 'User-Agent': USER_AGENT },
      });
    } catch (e) {
      samples.push({
        i,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        latencyMs: performance.now() - t0,
      });
      continue;
    }
    const latencyMs = performance.now() - t0;
    const headers = captureHeaders(res.headers);
    // Drain body so the socket can be reused
    await res.arrayBuffer();
    const sample = {
      i,
      status: res.status,
      latencyMs: Number(latencyMs.toFixed(2)),
      headers,
    };
    samples.push(sample);
    if (i === 0) firstRateLimit = headers['x-ratelimit-remaining'];
    if (res.status === 429) {
      any429 = true;
      break; // stop the burst — we have the answer we needed
    }
  }
  const elapsedMs = Date.now() - startedAt;
  const observedStatuses = [...new Set(samples.map((s) => s.status).filter(Boolean))];
  return {
    test: 'rateLimitBurst',
    requested: count,
    completed: samples.length,
    elapsedMs,
    requestsPerSecond: Number((samples.length / (elapsedMs / 1000)).toFixed(2)),
    statuses: observedStatuses,
    firstRateLimitRemaining: firstRateLimit,
    lastRateLimitRemaining: samples[samples.length - 1]?.headers['x-ratelimit-remaining'] ?? null,
    any429,
    retryAfterAt429: samples.find((s) => s.status === 429)?.headers['retry-after'] ?? null,
    rateLimitHeadersPresent: Boolean(firstRateLimit !== null && firstRateLimit !== undefined),
    samples,
  };
}

// --- Step 6: bit-perfect Range stitch --------------------------------------

/**
 * Proves Range-based resume is bit-perfect:
 *  1. Fetch bytes 0–999 via a Range request, hash
 *  2. Fetch bytes 1000–1999 via a Range request, hash
 *  3. Concatenate the two buffers, hash the concat
 *  4. Independently fetch bytes 0–1999 in a single Range request, hash
 *  5. Assert concat-hash === single-shot-hash
 *
 * Never downloads the full ~640 MB file — only 2000 bytes total of new
 * payload, plus a second 2000-byte independent read for the comparison.
 */
async function rangeStitch() {
  const fetchRange = async (range) => {
    const t0 = performance.now();
    const res = await fetch(TINYLLAMA_URL, {
      headers: { Range: range, 'User-Agent': USER_AGENT },
    });
    const latencyMs = performance.now() - t0;
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      range,
      status: res.status,
      contentRange: res.headers.get('content-range'),
      bytes: buf.byteLength,
      sha256: createHash('sha256').update(buf).digest('hex'),
      latencyMs: Number(latencyMs.toFixed(2)),
      buf,
    };
  };

  const partA = await fetchRange('bytes=0-999');
  const partB = await fetchRange('bytes=1000-1999');
  const combined = Buffer.concat([partA.buf, partB.buf]);
  const combinedSha = createHash('sha256').update(combined).digest('hex');

  const singleShot = await fetchRange('bytes=0-1999');

  const bitPerfect = combinedSha === singleShot.sha256 && combined.length === singleShot.bytes;

  return {
    test: 'rangeStitch',
    partA: { ...partA, buf: undefined },
    partB: { ...partB, buf: undefined },
    combinedBytes: combined.length,
    combinedSha,
    singleShot: { ...singleShot, buf: undefined },
    bitPerfect,
  };
}

// --- Runner ----------------------------------------------------------------

async function ensureCacheDir() {
  await mkdir(CACHE_DIR, { recursive: true });
}

async function writeJsonReport(filename, data) {
  await ensureCacheDir();
  const fullPath = pathResolve(CACHE_DIR, filename);
  await writeFile(fullPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return fullPath;
}

function summarizeEndpoint(report) {
  if (!report?.latency) return '';
  const { p50, p95, min, max, n } = report.latency;
  return (
    `  ${report.test.padEnd(14)} status=${report.status} ` +
    `p50=${p50.toFixed(0)}ms p95=${p95.toFixed(0)}ms ` +
    `min=${min.toFixed(0)}ms max=${max.toFixed(0)}ms n=${n}`
  );
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const wantEndpoints = args.has('--endpoints') || args.has('--report');
  const wantBurst = args.has('--burst') || args.has('--report');
  const wantResume = args.has('--resume') || args.has('--report');
  const wantReport = args.has('--report');

  if (!wantEndpoints && !wantBurst && !wantResume) {
    console.log(
      [
        'Usage: node scripts/spike-S5/hf-probe.mjs <flags>',
        '  --endpoints   4 endpoints × 5 samples (search/modelCard/fileHead/rangeDownload)',
        '  --burst       50× anonymous search to characterize rate limits',
        '  --resume      bit-perfect Range stitch (0-999 + 1000-1999 vs 0-1999)',
        '  --report      run all three, write .spike-s5-cache/report.json',
      ].join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  /** @type {Record<string, unknown>} */
  const report = { startedAt: new Date().toISOString(), userAgent: USER_AGENT };

  if (wantEndpoints) {
    console.log('\n[1/3] Multi-sample endpoint probes (5 samples each, 250 ms gap)…');
    const search = await probeSearch(5);
    console.log(summarizeEndpoint(search));
    const modelCard = await probeModelCard(5);
    console.log(summarizeEndpoint(modelCard));
    const fileHead = await probeFileHead(5);
    console.log(summarizeEndpoint(fileHead));
    const rangeDownload = await probeRangeDownload(5);
    console.log(summarizeEndpoint(rangeDownload));
    report.endpoints = { search, modelCard, fileHead, rangeDownload };
  }

  if (wantBurst) {
    console.log('\n[2/3] Rate-limit stress (50× anonymous search burst)…');
    const burst = await rateLimitBurst(50);
    console.log(
      `  completed=${burst.completed}/${burst.requested} ` +
        `statuses=${burst.statuses.join(',')} any429=${burst.any429} ` +
        `rateLimitHeadersPresent=${burst.rateLimitHeadersPresent} ` +
        `requestsPerSecond=${burst.requestsPerSecond}`,
    );
    report.burst = burst;
  }

  if (wantResume) {
    console.log('\n[3/3] Range stitch (bit-perfect resume validation)…');
    const stitch = await rangeStitch();
    console.log(
      `  partA(0-999) sha=${stitch.partA.sha256.slice(0, 16)}… ` +
        `partB(1000-1999) sha=${stitch.partB.sha256.slice(0, 16)}…`,
    );
    console.log(
      `  combined(${stitch.combinedBytes}B) sha=${stitch.combinedSha.slice(0, 16)}… ` +
        `singleShot(0-1999) sha=${stitch.singleShot.sha256.slice(0, 16)}…`,
    );
    console.log(`  bitPerfect=${stitch.bitPerfect}`);
    report.resume = stitch;
  }

  report.finishedAt = new Date().toISOString();

  if (wantReport) {
    const path = await writeJsonReport('report.json', report);
    console.log(`\nReport written: ${path}`);
  }
}

main().catch((e) => {
  console.error('FATAL:', e instanceof Error ? e.stack : String(e));
  process.exitCode = 1;
});
