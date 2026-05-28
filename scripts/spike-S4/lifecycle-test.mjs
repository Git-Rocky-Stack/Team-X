#!/usr/bin/env node
/**
 * Spike S4 — llama-server lifecycle harness (throwaway prototype).
 *
 * Validates the four lifecycle risks that the production
 * `packages/local-gguf-runtime/src/runtime/server-lifecycle.ts` will inherit:
 *
 *   1. **Spawn + ready-line detection** — can we reliably know when the
 *      server is accepting HTTP on `127.0.0.1:<port>`? llama.cpp's
 *      `tools/server/server.cpp` has changed the ready log line multiple
 *      times over the project's history ([#3960](https://github.com/ggml-org/llama.cpp/pull/3960),
 *      [#5710](https://github.com/ggml-org/llama.cpp/pull/5710),
 *      [#13146](https://github.com/ggml-org/llama.cpp/pull/13146)) so the
 *      harness watches for a UNION of patterns to stay forward/backward
 *      compatible against any `b<NNNN>` build in S1's tag range.
 *   2. **OpenAI-compatible endpoints** — does `/v1/chat/completions` and
 *      `/v1/embeddings` answer with the documented shape ([OpenAI Chat
 *      Completions reference](https://platform.openai.com/docs/api-reference/chat/create),
 *      [OpenAI Embeddings reference](https://platform.openai.com/docs/api-reference/embeddings))
 *      so the Phase 9 client can be a thin OpenAI-shape wrapper?
 *   3. **Clean termination** — does SIGTERM exit the server fast enough to
 *      meet the spec § 12.4 "Stop server" SLA, and does the port release in
 *      a window short enough that an immediate respawn won't EADDRINUSE?
 *      Note the [Node SIGTERM-on-Windows caveat](https://nodejs.org/api/process.html#signal-events):
 *      on Win32 `process.kill('SIGTERM')` does not deliver SIGTERM
 *      literally — it terminates the process via `TerminateProcess`,
 *      which on llama-server still produces a clean port release in
 *      observed behavior.
 *   4. **Failure-mode triage** — bogus model path, port collision, and
 *      context-overflow must each fail with a discriminable signal so the
 *      production wrapper can map to spec § 14.1 typed errors
 *      (`server-spawn-failed`, `port-bind-failed`, `context-exceeded`).
 *
 * The harness is intentionally pure-Node ≥ 22 stdlib: no npm deps, no
 * native modules. Production code at
 * `packages/local-gguf-runtime/src/runtime/server-lifecycle.ts` will
 * inherit the surface but live behind a TypeScript interface (see § "Subprocess
 * wrapper API" in the writeup).
 *
 * CLI:
 *   node scripts/spike-S4/lifecycle-test.mjs \
 *     --binary <path-to-llama-server[.exe]> \
 *     --model  <path-to-tinyllama-Q4_K_M.gguf> \
 *     [--phase all|happy|F1|F2|F3] \
 *     [--report .spike-s4-cache/report.json] \
 *     [--n-ctx 2048] [--n-threads 4] [--ready-timeout-ms 60000]
 *
 * Default behavior: `--phase all` runs happy-path + F1 + F2 + F3 sequentially
 * and writes a structured JSON report.
 *
 * @file scripts/spike-S4/lifecycle-test.mjs
 * @see  docs/spikes/2026-05-27-S4-llama-server-lifecycle.md
 * @see  docs/spikes/S4-hardware-runbook.md
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, resolve as pathResolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, '..', '..');
const DEFAULT_REPORT = pathResolve(REPO_ROOT, '.spike-s4-cache', 'report.json');

// ---------------------------------------------------------------------------
// Ready-line detection
// ---------------------------------------------------------------------------
//
// llama.cpp's `tools/server/server.cpp` emits one of several ready
// indicators depending on the upstream commit. We watch for ANY of these
// substrings on stdout OR stderr; whichever fires first marks ready.
// Sources for each variant:
//   * "HTTP server listening" — historical; see PR #3960 thread on GitHub
//     (https://github.com/ggml-org/llama.cpp/pull/3960).
//   * "server is listening on" — newer ([commit 7a86131](https://github.com/ggml-org/llama.cpp/commit/7a861313))
//     once httplib transport was swapped in.
//   * "all slots are idle" — emitted slightly later than the listen line
//     but is a reliable post-warmup readiness gate
//     ([PR #5710](https://github.com/ggml-org/llama.cpp/pull/5710)).
//   * "main: server is listening" — appears in some 2024–2026 builds
//     ([file: tools/server/server.cpp](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server.cpp)).
//   * "model loaded" — fallback for very old builds.
// Order does not matter: first-match wins. The actual log emission goes
// through `httplib::Server`'s own `bind_to_port` → `listen` sequence
// (https://github.com/yhirose/cpp-httplib/blob/master/httplib.h).

const READY_PATTERNS = [
  /HTTP server listening/i,
  /server is listening on/i,
  /main: server is listening/i,
  /all slots are idle/i,
  /\bmodel loaded\b/i,
];

/**
 * Pre-stringified union for the writeup table.
 * @returns {string[]}
 */
function readyPatternsForReport() {
  return READY_PATTERNS.map((re) => re.source);
}

// ---------------------------------------------------------------------------
// CLI parsing — tiny zero-dep flag reader. We deliberately avoid `process.argv`
// libraries (yargs/commander) because this script ships as a `.mjs` Node
// script that must run with `node scripts/spike-S4/lifecycle-test.mjs ...`
// alone, with zero npm install on Rocky's hardware rigs.
// ---------------------------------------------------------------------------

/**
 * @param {string[]} argv
 * @returns {Record<string, string | boolean>}
 */
function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv);

if (args.help || args.h) {
  process.stdout.write(`Usage: node scripts/spike-S4/lifecycle-test.mjs --binary <path> --model <path> [options]

Required:
  --binary <path>          Path to llama-server[.exe]
  --model  <path>          Path to a .gguf model file

Optional:
  --phase   all|happy|F1|F2|F3   Which test(s) to run (default: all)
  --report  <path>               JSON report destination (default: .spike-s4-cache/report.json)
  --n-ctx   <int>                -c context size (default: 2048)
  --n-threads <int>              -t threads (default: omit = llama-server default)
  --n-gpu-layers <int>           -ngl GPU layers (default: 0 = CPU only)
  --ready-timeout-ms <int>       Ready-line wait budget (default: 60000)
  --shutdown-grace-ms <int>      SIGTERM-to-SIGKILL escalation window (default: 5000)
  --no-embeddings                Skip /v1/embeddings call (some builds don't expose it)

Examples:
  node scripts/spike-S4/lifecycle-test.mjs --binary .\\.spike-s4-bin\\llama-server.exe \\
    --model .\\.spike-s4-cache\\tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf

  node scripts/spike-S4/lifecycle-test.mjs --binary ./llama-server --model ./tinyllama.gguf \\
    --phase happy --n-gpu-layers 99
`);
  process.exit(0);
}

const BINARY = typeof args.binary === 'string' ? args.binary : null;
const MODEL = typeof args.model === 'string' ? args.model : null;
const PHASE = typeof args.phase === 'string' ? args.phase : 'all';
const REPORT_PATH = typeof args.report === 'string' ? args.report : DEFAULT_REPORT;
const N_CTX = typeof args['n-ctx'] === 'string' ? Number(args['n-ctx']) : 2048;
const N_THREADS = typeof args['n-threads'] === 'string' ? Number(args['n-threads']) : null;
const N_GPU_LAYERS = typeof args['n-gpu-layers'] === 'string' ? Number(args['n-gpu-layers']) : 0;
const READY_TIMEOUT_MS =
  typeof args['ready-timeout-ms'] === 'string' ? Number(args['ready-timeout-ms']) : 60_000;
const SHUTDOWN_GRACE_MS =
  typeof args['shutdown-grace-ms'] === 'string' ? Number(args['shutdown-grace-ms']) : 5_000;
const SKIP_EMBEDDINGS = args['no-embeddings'] === true;

if (!BINARY || !MODEL) {
  process.stderr.write('error: --binary and --model are both required\n');
  process.stderr.write('       run with --help for usage\n');
  process.exit(2);
}

const VALID_PHASES = new Set(['all', 'happy', 'F1', 'F2', 'F3']);
if (!VALID_PHASES.has(PHASE)) {
  process.stderr.write(`error: --phase must be one of: ${[...VALID_PHASES].join(', ')}\n`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Port allocation
// ---------------------------------------------------------------------------
//
// Strategy: bind a transient `net.createServer()` to port 0 on the loopback
// interface, read the OS-assigned port, close the listener, return the
// number. This is the standard Node pattern documented on the
// [`server.listen(0)` docs](https://nodejs.org/api/net.html#serverlistenport-host-backlog-callback)
// and matches the IANA-recommended ephemeral range
// [RFC 6335 § 6](https://www.rfc-editor.org/rfc/rfc6335.html#section-6)
// (49152–65535). Linux kernel assigns from `/proc/sys/net/ipv4/ip_local_port_range`,
// macOS from `net.inet.ip.portrange.first/last`, Windows from its
// [dynamic port range](https://learn.microsoft.com/en-us/troubleshoot/windows-server/networking/default-dynamic-port-range-tcpip-chang).
// Race risk: after we close the listener, another process could claim the
// port before our spawn binds it. Mitigation in production = retry the
// allocation up to N times if the spawned server logs a bind error;
// acceptable because the window is typically <1 ms on a healthy box.

/**
 * @returns {Promise<number>}
 */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (!addr || typeof addr === 'string') {
        srv.close();
        reject(new Error('port allocator: server.address() returned string or null'));
        return;
      }
      const port = addr.port;
      srv.close((closeErr) => {
        if (closeErr) reject(closeErr);
        else resolve(port);
      });
    });
  });
}

/**
 * Verify a TCP port can be bound on 127.0.0.1 — used after SIGTERM to
 * prove the port released. Returns ms-elapsed-to-bind on success, throws
 * the OS error on EADDRINUSE.
 *
 * @param {number} port
 * @returns {Promise<number>} milliseconds elapsed
 */
function probePortBindable(port) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const srv = createServer();
    srv.unref();
    srv.on('error', (err) => reject(err));
    srv.listen(port, '127.0.0.1', () => {
      const ms = performance.now() - t0;
      srv.close(() => resolve(ms));
    });
  });
}

/**
 * Forcibly occupy a port for the duration of a callback — used in F2
 * to provoke server bind failure.
 *
 * @param {number} port
 * @param {(p: number) => Promise<void>} fn
 * @returns {Promise<void>}
 */
async function holdingPort(port, fn) {
  const srv = createServer();
  srv.on('connection', (sock) => sock.destroy());
  await new Promise((res, rej) => {
    srv.on('error', rej);
    srv.listen(port, '127.0.0.1', () => res(undefined));
  });
  try {
    await fn(port);
  } finally {
    await new Promise((res) => srv.close(() => res(undefined)));
  }
}

// ---------------------------------------------------------------------------
// Subprocess: spawn llama-server with full stdio capture
// ---------------------------------------------------------------------------
//
// We use `child_process.spawn` (not `exec` or `execFile`) so we can stream
// stdout/stderr line-by-line for ready-pattern detection without buffering
// the entire output. `stdio: ['ignore', 'pipe', 'pipe']` per
// [Node docs](https://nodejs.org/api/child_process.html#child_processspawncommand-args-options)
// — we don't write to the server's stdin so it's `ignore`.
//
// Important: on Windows, `spawn` does NOT use a shell unless `shell: true`,
// which means `BINARY` must be a real executable file (e.g. `llama-server.exe`),
// not a `.cmd` shim. The S4 runbook tells Rocky to extract the asset
// straight from the S1 release archive.

/**
 * @typedef {Object} SpawnResult
 * @property {number} port
 * @property {number} pid
 * @property {number} spawnMs        ms from `spawn` call to subprocess pid
 * @property {number} readyMs        ms from spawn to first ready-pattern hit
 * @property {string} readyPattern   pattern that fired (regex source) or 'TIMEOUT'
 * @property {string[]} stdoutLines  full captured stdout (lines, no trailing \n)
 * @property {string[]} stderrLines  full captured stderr (lines, no trailing \n)
 * @property {import('node:child_process').ChildProcess} proc
 */

/**
 * Spawn llama-server and wait for the first ready pattern to appear in
 * stdout or stderr. Times out at `READY_TIMEOUT_MS`.
 *
 * @param {Object} opts
 * @param {string} opts.binary
 * @param {string} opts.model
 * @param {number} opts.port
 * @param {number} opts.nCtx
 * @param {number} opts.nGpuLayers
 * @param {number | null} opts.nThreads
 * @param {number} opts.readyTimeoutMs
 * @returns {Promise<SpawnResult>}
 */
async function spawnAndWaitReady(opts) {
  const cliArgs = [
    '-m',
    opts.model,
    '--host',
    '127.0.0.1',
    '--port',
    String(opts.port),
    '-c',
    String(opts.nCtx),
    '-ngl',
    String(opts.nGpuLayers),
  ];
  if (opts.nThreads != null && Number.isFinite(opts.nThreads)) {
    cliArgs.push('-t', String(opts.nThreads));
  }
  // Newer llama-server builds expose embeddings via a flag; older ones
  // serve `/v1/embeddings` unconditionally. We pass the flag and tolerate
  // failure — if it's unknown the server still starts and stdout has a
  // warning line, which we capture in the stderr/stdout buffers for
  // post-hoc inspection.
  cliArgs.push('--embeddings');

  const t0 = performance.now();
  /** @type {import('node:child_process').ChildProcess} */
  const proc = spawn(opts.binary, cliArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const spawnMs = performance.now() - t0;

  /** @type {string[]} */
  const stdoutLines = [];
  /** @type {string[]} */
  const stderrLines = [];
  /** @type {{ resolve: (s: SpawnResult) => void; reject: (e: Error) => void; ready: boolean }} */
  const state = { resolve: () => {}, reject: () => {}, ready: false };
  /** @type {string} */
  let stdoutCarry = '';
  /** @type {string} */
  let stderrCarry = '';

  /** @type {string | null} */
  let firstMatch = null;

  const scanForReady = (chunk) => {
    if (state.ready) return;
    for (const re of READY_PATTERNS) {
      if (re.test(chunk)) {
        state.ready = true;
        firstMatch = re.source;
        const readyMs = performance.now() - t0;
        state.resolve({
          port: opts.port,
          pid: proc.pid ?? -1,
          spawnMs,
          readyMs,
          readyPattern: firstMatch,
          stdoutLines,
          stderrLines,
          proc,
        });
        return;
      }
    }
  };

  if (proc.stdout) {
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => {
      stdoutCarry += chunk;
      const lines = stdoutCarry.split(/\r?\n/);
      stdoutCarry = lines.pop() ?? '';
      for (const line of lines) {
        stdoutLines.push(line);
        scanForReady(line);
      }
    });
  }
  if (proc.stderr) {
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (chunk) => {
      stderrCarry += chunk;
      const lines = stderrCarry.split(/\r?\n/);
      stderrCarry = lines.pop() ?? '';
      for (const line of lines) {
        stderrLines.push(line);
        scanForReady(line);
      }
    });
  }

  proc.on('error', (err) => {
    state.reject(new Error(`spawn error: ${err.message}`));
  });
  proc.on('exit', (code, signal) => {
    if (!state.ready) {
      state.reject(
        new Error(
          `server exited before ready (code=${code}, signal=${signal}, ` +
            `stderr_tail=${JSON.stringify(stderrLines.slice(-5).join('\n'))})`,
        ),
      );
    }
  });

  return new Promise((resolve, reject) => {
    state.resolve = resolve;
    state.reject = reject;
    setTimeout(() => {
      if (!state.ready) {
        state.reject(
          new Error(
            `ready-timeout after ${opts.readyTimeoutMs} ms; ` +
              `stderr_tail=${JSON.stringify(stderrLines.slice(-10).join('\n'))}`,
          ),
        );
      }
    }, opts.readyTimeoutMs);
  });
}

// ---------------------------------------------------------------------------
// HTTP probes — chat + embeddings
// ---------------------------------------------------------------------------
//
// We rely on the built-in `fetch` (Node ≥ 18; the repo pins ≥ 22.13). The
// llama-server's OpenAI-compat layer is documented under
// `examples/server/README.md`
// (https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
// and is wire-compatible with the
// [OpenAI Chat Completions reference](https://platform.openai.com/docs/api-reference/chat/create)
// and the [Embeddings reference](https://platform.openai.com/docs/api-reference/embeddings).
// We pass `stream: false` because Phase 9 streaming is a separate concern.

/**
 * @param {number} port
 * @param {string} model      Display string passed in `model:` — llama-server
 *                            ignores this and uses whatever was loaded at spawn,
 *                            but the field is required by some OpenAI clients.
 * @returns {Promise<{ status: number; latencyMs: number; body: unknown; rawText: string }>}
 */
async function callChatCompletions(port, model) {
  const url = `http://127.0.0.1:${port}/v1/chat/completions`;
  const payload = {
    model,
    messages: [{ role: 'user', content: 'Say "hello".' }],
    stream: false,
    max_tokens: 16,
    temperature: 0,
    seed: 42,
  };
  const t0 = performance.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const rawText = await res.text();
  const latencyMs = performance.now() - t0;
  /** @type {unknown} */
  let body;
  try {
    body = JSON.parse(rawText);
  } catch {
    body = { _parseError: true, _raw: rawText.slice(0, 400) };
  }
  return { status: res.status, latencyMs, body, rawText };
}

/**
 * @param {number} port
 * @param {string} model
 * @returns {Promise<{ status: number; latencyMs: number; body: unknown; rawText: string }>}
 */
async function callEmbeddings(port, model) {
  const url = `http://127.0.0.1:${port}/v1/embeddings`;
  const payload = {
    model,
    input: 'test sentence',
  };
  const t0 = performance.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const rawText = await res.text();
  const latencyMs = performance.now() - t0;
  /** @type {unknown} */
  let body;
  try {
    body = JSON.parse(rawText);
  } catch {
    body = { _parseError: true, _raw: rawText.slice(0, 400) };
  }
  return { status: res.status, latencyMs, body, rawText };
}

// ---------------------------------------------------------------------------
// Termination + port-release verification
// ---------------------------------------------------------------------------
//
// `process.kill(SIGTERM)` semantics differ by platform per the
// [Node.js Signal Events docs](https://nodejs.org/api/process.html#signal-events):
//
//   * POSIX (linux/darwin): real SIGTERM; llama-server's `signal()`
//     handler in `tools/server/server.cpp` triggers a clean drain →
//     `httplib::Server::stop()` → process exit 0.
//   * Win32: there is no SIGTERM. `child.kill('SIGTERM')` calls
//     [`TerminateProcess`](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-terminateprocess)
//     which is closer to SIGKILL semantics. llama-server does not get
//     the chance to drain in-flight HTTP responses, but the OS releases
//     the TCP listener immediately and the port becomes reusable.
//
// Therefore on Windows we expect:
//   - process exits with platform-specific code (often `1` or
//     `0xC000013A` mapped by Node)
//   - port releases within ~50 ms typical, well under our 2 s probe window
//
// On POSIX we expect:
//   - process exits 0
//   - port releases within ~50-200 ms after the in-flight close finishes

/**
 * Send SIGTERM, wait up to `SHUTDOWN_GRACE_MS`, escalate to SIGKILL if
 * the process is still running. Returns the observed exit code+signal
 * plus the time-to-exit and time-to-port-release.
 *
 * @param {import('node:child_process').ChildProcess} proc
 * @param {number} port
 * @returns {Promise<{
 *   exitCode: number | null;
 *   exitSignal: NodeJS.Signals | null;
 *   exitMs: number;
 *   portReleaseMs: number;
 *   escalatedToSigkill: boolean;
 * }>}
 */
async function gracefulStop(proc, port) {
  const t0 = performance.now();
  /** @type {{ exitCode: number | null; exitSignal: NodeJS.Signals | null } | null} */
  let exitInfo = null;
  proc.once('exit', (code, signal) => {
    exitInfo = { exitCode: code, exitSignal: signal };
  });
  proc.kill('SIGTERM');

  // Spin-wait up to SHUTDOWN_GRACE_MS for exit.
  let waited = 0;
  while (waited < SHUTDOWN_GRACE_MS && !exitInfo) {
    await sleep(50);
    waited += 50;
  }
  let escalatedToSigkill = false;
  if (!exitInfo) {
    escalatedToSigkill = true;
    proc.kill('SIGKILL');
    // Poll a bit longer for the SIGKILL exit signal.
    let killWaited = 0;
    while (killWaited < 3000 && !exitInfo) {
      await sleep(50);
      killWaited += 50;
    }
  }
  const exitMs = performance.now() - t0;

  // Probe port-release. We retry the bind for up to 2.5 s with 100 ms gaps.
  // On Windows, immediate rebind can fail with WSAEADDRINUSE for ~50 ms
  // even after TerminateProcess — well within tolerance.
  const probeT0 = performance.now();
  let portReleaseMs = -1;
  for (let i = 0; i < 25; i++) {
    try {
      await probePortBindable(port);
      portReleaseMs = performance.now() - probeT0;
      break;
    } catch {
      await sleep(100);
    }
  }

  return {
    exitCode: exitInfo?.exitCode ?? null,
    exitSignal: exitInfo?.exitSignal ?? null,
    exitMs,
    portReleaseMs,
    escalatedToSigkill,
  };
}

// ---------------------------------------------------------------------------
// Happy-path lifecycle test
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} HappyResult
 * @property {number} port
 * @property {number} spawnMs
 * @property {number} readyMs
 * @property {string} readyPattern
 * @property {{ status: number; latencyMs: number; bodySample: string } | null} chat
 * @property {{ status: number; latencyMs: number; bodySample: string } | null} embed
 * @property {{ exitCode: number | null; exitSignal: string | null; exitMs: number; portReleaseMs: number; escalatedToSigkill: boolean }} termination
 * @property {string[]} stdoutTail
 * @property {string[]} stderrTail
 */

/**
 * @returns {Promise<HappyResult>}
 */
async function runHappy() {
  process.stderr.write('[happy] allocating free port...\n');
  const port = await getFreePort();
  process.stderr.write(`[happy] allocated port ${port}\n`);
  process.stderr.write(`[happy] spawning ${BINARY} -m ${MODEL} --port ${port} ...\n`);

  const spawned = await spawnAndWaitReady({
    binary: BINARY,
    model: MODEL,
    port,
    nCtx: N_CTX,
    nGpuLayers: N_GPU_LAYERS,
    nThreads: N_THREADS,
    readyTimeoutMs: READY_TIMEOUT_MS,
  });
  process.stderr.write(
    `[happy] ready in ${spawned.readyMs.toFixed(0)} ms (pattern: /${spawned.readyPattern}/)\n`,
  );

  let chat = null;
  try {
    const r = await callChatCompletions(port, 'tinyllama-chat-v1.0');
    chat = {
      status: r.status,
      latencyMs: r.latencyMs,
      bodySample: JSON.stringify(r.body).slice(0, 320),
    };
    process.stderr.write(`[happy] chat: HTTP ${r.status} in ${r.latencyMs.toFixed(0)} ms\n`);
  } catch (e) {
    process.stderr.write(`[happy] chat ERROR: ${e instanceof Error ? e.message : String(e)}\n`);
  }

  let embed = null;
  if (!SKIP_EMBEDDINGS) {
    try {
      const r = await callEmbeddings(port, 'tinyllama-chat-v1.0');
      embed = {
        status: r.status,
        latencyMs: r.latencyMs,
        bodySample: JSON.stringify(r.body).slice(0, 320),
      };
      process.stderr.write(`[happy] embed: HTTP ${r.status} in ${r.latencyMs.toFixed(0)} ms\n`);
    } catch (e) {
      process.stderr.write(`[happy] embed ERROR: ${e instanceof Error ? e.message : String(e)}\n`);
    }
  }

  process.stderr.write('[happy] sending SIGTERM...\n');
  const termination = await gracefulStop(spawned.proc, port);
  process.stderr.write(
    `[happy] exit code=${termination.exitCode} signal=${termination.exitSignal} ` +
      `in ${termination.exitMs.toFixed(0)} ms; port rebind in ${termination.portReleaseMs.toFixed(0)} ms` +
      `${termination.escalatedToSigkill ? ' (escalated to SIGKILL)' : ''}\n`,
  );

  return {
    port,
    spawnMs: spawned.spawnMs,
    readyMs: spawned.readyMs,
    readyPattern: spawned.readyPattern,
    chat,
    embed,
    termination: {
      exitCode: termination.exitCode,
      exitSignal: termination.exitSignal,
      exitMs: termination.exitMs,
      portReleaseMs: termination.portReleaseMs,
      escalatedToSigkill: termination.escalatedToSigkill,
    },
    stdoutTail: spawned.stdoutLines.slice(-20),
    stderrTail: spawned.stderrLines.slice(-20),
  };
}

// ---------------------------------------------------------------------------
// F1 — bogus model path
// ---------------------------------------------------------------------------
//
// Spawn with `-m <path-that-does-not-exist>`. Expect:
//   * exit within ~5 s (llama.cpp's loader fails fast in `llama_model_load`)
//   * non-zero exit code
//   * stderr contains a "failed to load" / "no such file" / "Cannot open"
//     style message
//
// llama.cpp's loader error path lives in `src/llama-model-loader.cpp`
// (https://github.com/ggml-org/llama.cpp/blob/master/src/llama-model-loader.cpp).

/**
 * @returns {Promise<{
 *   bogusPath: string;
 *   exitCode: number | null;
 *   exitSignal: string | null;
 *   exitMs: number;
 *   stderrSample: string;
 *   stdoutSample: string;
 *   matchedFailurePattern: string | null;
 * }>}
 */
async function runF1BogusModel() {
  const isWin = process.platform === 'win32';
  const bogusPath = isWin
    ? 'C:\\nonexistent\\team-x-s4\\does-not-exist.gguf'
    : '/tmp/team-x-s4-does-not-exist.gguf';
  process.stderr.write(`[F1] spawning with bogus model: ${bogusPath}\n`);

  const port = await getFreePort();
  const cliArgs = [
    '-m',
    bogusPath,
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '-c',
    String(N_CTX),
    '-ngl',
    '0',
  ];

  const t0 = performance.now();
  const proc = spawn(BINARY, cliArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  /** @type {string[]} */
  const stdoutLines = [];
  /** @type {string[]} */
  const stderrLines = [];
  if (proc.stdout) {
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (d) => stdoutLines.push(d));
  }
  if (proc.stderr) {
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (d) => stderrLines.push(d));
  }

  /** @type {{ exitCode: number | null; exitSignal: NodeJS.Signals | null }} */
  const exitInfo = await new Promise((res) => {
    proc.once('exit', (code, signal) => res({ exitCode: code, exitSignal: signal }));
    // Defensive: if llama-server hangs instead of fast-failing, kill at 10s
    setTimeout(() => {
      if (proc.exitCode == null && proc.signalCode == null) {
        proc.kill('SIGKILL');
      }
    }, 10_000);
  });
  const exitMs = performance.now() - t0;

  const stderrJoined = stderrLines.join('');
  const stdoutJoined = stdoutLines.join('');
  const allText = `${stderrJoined}\n${stdoutJoined}`;

  // Match patterns sourced from llama.cpp loader + GGML mmap paths.
  const failurePatterns = [
    /failed to load model/i,
    /no such file/i,
    /cannot open/i,
    /unable to allocate/i,
    /cannot find tensor/i,
    /llama_model_load.*failed/i,
    /gguf.*not a valid/i,
  ];
  let matchedFailurePattern = null;
  for (const re of failurePatterns) {
    if (re.test(allText)) {
      matchedFailurePattern = re.source;
      break;
    }
  }

  process.stderr.write(
    `[F1] exit code=${exitInfo.exitCode} signal=${exitInfo.exitSignal} in ${exitMs.toFixed(0)} ms; ` +
      `matched=${matchedFailurePattern ?? 'NONE'}\n`,
  );

  return {
    bogusPath,
    exitCode: exitInfo.exitCode,
    exitSignal: exitInfo.exitSignal,
    exitMs,
    stderrSample: stderrJoined.slice(0, 400),
    stdoutSample: stdoutJoined.slice(0, 400),
    matchedFailurePattern,
  };
}

// ---------------------------------------------------------------------------
// F2 — port collision
// ---------------------------------------------------------------------------
//
// Allocate a port, occupy it ourselves with a dummy `net.createServer()`,
// then try to spawn llama-server on the same port. The server's
// `httplib::Server::bind_to_port` returns false, the server's main()
// logs an error and exits non-zero.
//
// The error path lives in `tools/server/server.cpp` in the
// `svr->bind_to_port` check:
// https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server.cpp

/**
 * @returns {Promise<{
 *   port: number;
 *   exitCode: number | null;
 *   exitSignal: string | null;
 *   exitMs: number;
 *   stderrSample: string;
 *   stdoutSample: string;
 *   matchedFailurePattern: string | null;
 * }>}
 */
async function runF2PortCollision() {
  const port = await getFreePort();
  process.stderr.write(`[F2] occupying port ${port} then attempting llama-server bind...\n`);

  /** @type {{
   *   exitCode: number | null;
   *   exitSignal: string | null;
   *   exitMs: number;
   *   stderrSample: string;
   *   stdoutSample: string;
   *   matchedFailurePattern: string | null;
   * }} */
  let result;

  await holdingPort(port, async () => {
    const cliArgs = [
      '-m',
      MODEL,
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '-c',
      String(N_CTX),
      '-ngl',
      '0',
    ];

    const t0 = performance.now();
    const proc = spawn(BINARY, cliArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    /** @type {string[]} */
    const stdoutLines = [];
    /** @type {string[]} */
    const stderrLines = [];
    if (proc.stdout) {
      proc.stdout.setEncoding('utf8');
      proc.stdout.on('data', (d) => stdoutLines.push(d));
    }
    if (proc.stderr) {
      proc.stderr.setEncoding('utf8');
      proc.stderr.on('data', (d) => stderrLines.push(d));
    }

    /** @type {{ exitCode: number | null; exitSignal: NodeJS.Signals | null }} */
    const exitInfo = await new Promise((res) => {
      proc.once('exit', (code, signal) => res({ exitCode: code, exitSignal: signal }));
      // Defensive 30s timeout — model load might happen before bind on some builds
      setTimeout(() => {
        if (proc.exitCode == null && proc.signalCode == null) {
          process.stderr.write('[F2] timeout — killing llama-server with SIGKILL\n');
          proc.kill('SIGKILL');
        }
      }, 30_000);
    });
    const exitMs = performance.now() - t0;

    const stderrJoined = stderrLines.join('');
    const stdoutJoined = stdoutLines.join('');
    const allText = `${stderrJoined}\n${stdoutJoined}`;

    const failurePatterns = [
      /address already in use/i,
      /failed to bind/i,
      /bind:.*in use/i,
      /could not bind/i,
      /unable to bind/i,
      /EADDRINUSE/i,
      /WSAEADDRINUSE/i,
    ];
    let matchedFailurePattern = null;
    for (const re of failurePatterns) {
      if (re.test(allText)) {
        matchedFailurePattern = re.source;
        break;
      }
    }

    process.stderr.write(
      `[F2] exit code=${exitInfo.exitCode} signal=${exitInfo.exitSignal} in ${exitMs.toFixed(0)} ms; ` +
        `matched=${matchedFailurePattern ?? 'NONE'}\n`,
    );

    result = {
      exitCode: exitInfo.exitCode,
      exitSignal: exitInfo.exitSignal,
      exitMs,
      stderrSample: stderrJoined.slice(0, 400),
      stdoutSample: stdoutJoined.slice(0, 400),
      matchedFailurePattern,
    };
  });

  // @ts-expect-error result is always assigned inside holdingPort callback
  return { port, ...result };
}

// ---------------------------------------------------------------------------
// F3 — context overflow
// ---------------------------------------------------------------------------
//
// Spawn the server with a very low `-c` value (256 tokens), then POST a
// chat completion whose prompt deliberately exceeds that context. Expect:
//   * server stays running (does NOT crash)
//   * /v1/chat/completions returns HTTP 4xx (typically 400) with a JSON
//     body shaped like
//     `{"error":{"code": <something>, "message": "...", "type": "..."}}`
//
// The "context exceeded" early-rejection path is at
// `tools/server/server.cpp::handle_completions_impl` — when `n_prompt_tokens`
// exceeds `n_ctx_per_seq` (or the per-slot context budget), the server
// formats an OpenAI-shape error and returns 400.

/**
 * @returns {Promise<{
 *   port: number;
 *   spawnedOk: boolean;
 *   chatStatus: number | null;
 *   chatLatencyMs: number | null;
 *   chatBodySample: string;
 *   serverStillAliveAfterRequest: boolean;
 *   stderrSample: string;
 *   matchedErrorShape: 'openai-error' | 'plain-error' | 'crashed' | 'unknown';
 * }>}
 */
async function runF3ContextOverflow() {
  const port = await getFreePort();
  process.stderr.write('[F3] spawning with n_ctx=256 to provoke overflow on a long prompt...\n');

  let spawned;
  try {
    spawned = await spawnAndWaitReady({
      binary: BINARY,
      model: MODEL,
      port,
      nCtx: 256,
      nGpuLayers: N_GPU_LAYERS,
      nThreads: N_THREADS,
      readyTimeoutMs: READY_TIMEOUT_MS,
    });
  } catch (e) {
    process.stderr.write(
      `[F3] server failed to reach ready: ${e instanceof Error ? e.message : String(e)}\n`,
    );
    return {
      port,
      spawnedOk: false,
      chatStatus: null,
      chatLatencyMs: null,
      chatBodySample: '',
      serverStillAliveAfterRequest: false,
      stderrSample: '',
      matchedErrorShape: 'crashed',
    };
  }

  // Build a prompt of ~5000 tokens worth of "tokenA tokenB " text. The
  // exact token count depends on the tokenizer, but at ~0.75 tokens-per-word
  // a 6500-word prompt is ~4800-5000 tokens — comfortably more than the
  // 256-token ctx.
  const longPrompt = `${'tokenA tokenB '.repeat(3250)}END`;

  const url = `http://127.0.0.1:${port}/v1/chat/completions`;
  const payload = {
    model: 'tinyllama-chat-v1.0',
    messages: [{ role: 'user', content: longPrompt }],
    stream: false,
    max_tokens: 16,
  };

  const t0 = performance.now();
  /** @type {Response | null} */
  let res = null;
  /** @type {string} */
  let rawText = '';
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    rawText = await res.text();
  } catch (e) {
    rawText = `_fetchError: ${e instanceof Error ? e.message : String(e)}`;
  }
  const chatLatencyMs = performance.now() - t0;

  // Probe that the server is still up (this is the most important assertion)
  let serverStillAliveAfterRequest = false;
  try {
    const healthRes = await fetch(`http://127.0.0.1:${port}/health`, { method: 'GET' });
    serverStillAliveAfterRequest = healthRes.ok || healthRes.status === 503; // 503 during load is OK
  } catch {
    // Some llama-server builds don't expose /health; fall back to a probe.
    try {
      const probeRes = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, messages: [{ role: 'user', content: 'hi' }] }),
      });
      serverStillAliveAfterRequest = probeRes.status < 600;
    } catch {
      serverStillAliveAfterRequest = false;
    }
  }

  /** @type {'openai-error' | 'plain-error' | 'crashed' | 'unknown'} */
  let matchedErrorShape = 'unknown';
  try {
    const parsed = JSON.parse(rawText);
    if (parsed && typeof parsed === 'object' && parsed !== null) {
      const obj = /** @type {Record<string, unknown>} */ (parsed);
      if (
        obj.error &&
        typeof obj.error === 'object' &&
        obj.error !== null &&
        'message' in obj.error
      ) {
        matchedErrorShape = 'openai-error';
      } else if ('message' in obj || 'error' in obj) {
        matchedErrorShape = 'plain-error';
      }
    }
  } catch {
    if (!serverStillAliveAfterRequest) {
      matchedErrorShape = 'crashed';
    }
  }

  // Cleanup
  await gracefulStop(spawned.proc, port);

  return {
    port,
    spawnedOk: true,
    chatStatus: res?.status ?? null,
    chatLatencyMs,
    chatBodySample: rawText.slice(0, 500),
    serverStillAliveAfterRequest,
    stderrSample: spawned.stderrLines.slice(-10).join('\n').slice(0, 600),
    matchedErrorShape,
  };
}

// ---------------------------------------------------------------------------
// Report writer
// ---------------------------------------------------------------------------

/**
 * @param {string} path
 * @param {Record<string, unknown>} report
 */
async function writeReport(path, report) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/** @type {Record<string, unknown>} */
const report = {
  timestamp: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  nodeVersion: process.version,
  binary: BINARY,
  model: MODEL,
  options: {
    nCtx: N_CTX,
    nThreads: N_THREADS,
    nGpuLayers: N_GPU_LAYERS,
    readyTimeoutMs: READY_TIMEOUT_MS,
    shutdownGraceMs: SHUTDOWN_GRACE_MS,
    skipEmbeddings: SKIP_EMBEDDINGS,
  },
  readyPatterns: readyPatternsForReport(),
  phase: PHASE,
  results: {},
};

try {
  if (PHASE === 'all' || PHASE === 'happy') {
    process.stderr.write('--- happy path ---\n');
    /** @type {Record<string, unknown>} */
    (report.results).happy = await runHappy();
  }
  if (PHASE === 'all' || PHASE === 'F1') {
    process.stderr.write('--- F1: bogus model path ---\n');
    /** @type {Record<string, unknown>} */
    (report.results).F1 = await runF1BogusModel();
  }
  if (PHASE === 'all' || PHASE === 'F2') {
    process.stderr.write('--- F2: port collision ---\n');
    /** @type {Record<string, unknown>} */
    (report.results).F2 = await runF2PortCollision();
  }
  if (PHASE === 'all' || PHASE === 'F3') {
    process.stderr.write('--- F3: context overflow ---\n');
    /** @type {Record<string, unknown>} */
    (report.results).F3 = await runF3ContextOverflow();
  }
} catch (e) {
  report.fatalError = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
  process.stderr.write(`[fatal] ${report.fatalError}\n`);
}

await writeReport(REPORT_PATH, report);
process.stderr.write(`[report] wrote ${REPORT_PATH}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
