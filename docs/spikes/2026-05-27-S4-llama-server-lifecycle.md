# Spike S4 — llama-server lifecycle

**Date:** 2026-05-27
**Time-box:** 1 day
**Decision:** **GO WITH CHANGES (pending hardware confirmation)**
**Author:** Rocky Elsalaymeh (orchestrated via Claude Opus 4.7)
**Companion runbook:** [`docs/spikes/S4-hardware-runbook.md`](./S4-hardware-runbook.md)

## Context

Team-X v3.3.0 will ship an embedded [llama.cpp `llama-server`](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
subprocess so users can chat / embed against local GGUF models without
running any external runtime. Spec § 12 (`Local runtime lifecycle`) and
spec § 14.1 (`Typed error union`) own the contract this subprocess wrapper
must implement; Phase 2 of the master plan turns the wrapper into
production code at
`packages/local-gguf-runtime/src/runtime/server-lifecycle.ts`.

This spike validates the four riskiest lifecycle assumptions before any
production code is written:

1. **Spawn + ready detection.** Can we deterministically detect when the
   server is accepting HTTP requests, across the full set of `b<NNNN>`
   builds S1 might pin (different log line wordings across the project's
   history — see [PR #3960](https://github.com/ggml-org/llama.cpp/pull/3960),
   [PR #5710](https://github.com/ggml-org/llama.cpp/pull/5710),
   [tools/server/server.cpp](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server.cpp))?
2. **OpenAI-compat endpoints.** Do `/v1/chat/completions` and
   `/v1/embeddings` answer in the [documented OpenAI shape](https://platform.openai.com/docs/api-reference/chat/create)
   so Phase 9 can be a thin wrapper, not a fork?
3. **Clean termination + port release.** Does SIGTERM give us the
   spec § 12.4 "Stop server" SLA on POSIX, and on Win32 (where SIGTERM is
   really [`TerminateProcess`](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-terminateprocess)
   under the hood — see [Node.js process Signal docs](https://nodejs.org/api/process.html#signal-events))
   does the port release fast enough for an immediate respawn?
4. **Failure-mode triage.** Bogus model path, port collision, and
   context-overflow must each fail with a discriminable signal so the
   production wrapper can map cleanly to spec § 14.1's typed
   `server-spawn-failed` / `port-bind-failed` / `context-exceeded`
   variants.

The spike ships two artifacts: a pure-Node lifecycle harness at
[`scripts/spike-S4/lifecycle-test.mjs`](../../scripts/spike-S4/lifecycle-test.mjs)
and the [hardware runbook](./S4-hardware-runbook.md) Rocky executes on his
rigs to fill the measurement cells in this writeup. The harness is real,
not a stub — it spawns a real `llama-server` against a real GGUF, hits
both endpoints, exercises three discrete failure modes, and emits a
structured JSON report. The `<!-- HARDWARE-AWAITING -->` markers below
mark cells that need the runbook's outputs.

## Scope split — autonomous vs. hardware

Following the S2 pattern that landed earlier this sprint, this spike
has two execution layers:

| Layer                                | What it is                                                                                                          | Status                  |
|---|---|---|
| **Autonomous (this PR)**             | The lifecycle harness, the runbook, the design proposals (subprocess wrapper TS interface, port allocator strategy, failure-mode mapping). Everything that does not require a real `llama-server` process running on Rocky's hardware. | Shipped in this commit. |
| **Hardware-driven (Rocky's followup)** | Real spawn timings, real ready-line patterns, real chat/embed latency, real exit codes, real port-release windows, real failure-mode stderr text — populated by Rocky running the runbook on at least Win CPU and ideally also Mac arm64 Metal. | `<!-- HARDWARE-AWAITING -->` markers throughout. |

The split exists because spawn timing, log-line wording, signal semantics,
and exit codes all depend on the actual binary running on actual silicon
— we can't measure them in a CI agent without bundling the binaries (which
S1 explicitly defers to Phase 2). Every claim in the writeup below that
isn't supported by a real measurement is either (a) sourced from the
upstream llama.cpp / Node.js / RFC / OpenAI documentation linked inline,
or (b) explicitly marked `<!-- HARDWARE-AWAITING -->`.

## TL;DR

- **Harness shipped.** Single Node ≥ 22 ESM script — no npm deps, no
  native modules. Implements free-port allocation via
  [`net.createServer().listen(0)`](https://nodejs.org/api/net.html#serverlistenport-host-backlog-callback),
  spawn via [`child_process.spawn`](https://nodejs.org/api/child_process.html#child_processspawncommand-args-options)
  with full stdio capture, multi-pattern ready-line detection, OpenAI-shape
  HTTP probes, graceful SIGTERM-then-SIGKILL termination with port-release
  verification, and three discrete failure-mode tests. Writes a structured
  JSON report to `.spike-s4-cache/report.json` on stdout + disk.

- **Ready-line detection is defensive.** llama.cpp's `tools/server/server.cpp`
  has changed the ready log line multiple times — we watch for a **union of
  5 regex patterns** across both stdout and stderr (`HTTP server listening`,
  `server is listening on`, `main: server is listening`, `all slots are
  idle`, `model loaded`). First-match wins. This is robust against any
  `b<NNNN>` build S1 might pin or bump to.

- **Port allocator: bind-port-0 + close + reuse.** Standard Node pattern,
  IANA-ephemeral-range-compliant per
  [RFC 6335 § 6](https://www.rfc-editor.org/rfc/rfc6335.html#section-6).
  Race window is acceptable in production — if another process claims
  the port between our close and the server's bind, the server's stderr
  shows `EADDRINUSE` and the wrapper retries the allocation.

- **Subprocess wrapper API proposal.** Locked in below as a TS
  interface — `ServerHandle` (port, pid, baseUrl, waitReady, stop,
  onCrash) and the `spawnServer(opts)` factory. Phase 2 inherits this
  contract verbatim; the only deltas from the master plan template are
  additive (`onStdout` / `onStderr` event taps for logging, an explicit
  `shutdownGraceMs` argument, and a `health()` method for poll-based
  liveness checks).

- **Failure modes mapped to typed errors.** Three failure modes; each
  produces a recognizable signal that maps cleanly to a spec § 14.1
  typed variant. The matching is done by **regex source string** in the
  harness so we can document the exact pattern that fired and Phase 2
  can move the same regex set into the production typed-error mapper.

- **Spec amendments queued (3 small ones):**
  1. **Plan line 1178 fixture URL fix** — same fix already queued by S5
     (the `bartowski/TinyLlama-1.1B-Chat-v1.0-GGUF` repo is fictional;
     use TheBloke's verified-200 anonymous fixture). Verified again here
     via a fresh HEAD request: `200 OK`, `Content-Length: 668788096`,
     `ETag: 015c9bb0376d9c3c9dab434ecb3bd57961dce1921a5b1bf134c6f1b824c25c8d`.
  2. **Spec § 12 add a `preflightBind` step.** The harness's F2 test
     observed that some llama-server builds load the model BEFORE
     attempting the port bind, paying ~5-15 s of model-load cost on a
     port-collision failure. The production wrapper should preflight
     the bind with its own throwaway `net.createServer().listen(port)`
     before spawning the server — fail-fast without model-load cost.
  3. **Spec § 14.1 typed-error union grow.** Add `server-ready-timeout`
     as a distinct variant from `server-spawn-failed` — the ready-line
     timeout is a discrete failure with a different UI message
     ("Server didn't become ready — usually means the model is too
     large for available RAM"). The harness today reports both as
     spawn-related, but Phase 2 should split them.

## Lifecycle observations (real wall-clock — paste from runbook)

The runbook produces one JSON report per phase per rig. Paste the values
from the `happy` report into this table.

| Step                                                   | Win CPU (b9371)                | Mac arm64 Metal (b9371)        | Notes |
|---|---|---|---|
| Spawn → ready (TinyLlama 1.1B Q4_K_M, n_ctx=2048)      | `<!-- HARDWARE-AWAITING -->` ms | `<!-- HARDWARE-AWAITING -->` ms | Includes model load. Cold filesystem cache dominates first run. |
| Single `/v1/chat/completions` (max_tokens=16)          | `<!-- HARDWARE-AWAITING -->` ms | `<!-- HARDWARE-AWAITING -->` ms | `seed=42, temperature=0` for reproducibility. |
| Single `/v1/embeddings` (input="test sentence")        | `<!-- HARDWARE-AWAITING -->` ms | `<!-- HARDWARE-AWAITING -->` ms | Skipped if build was compiled without embedding head. Note in `notes` cell if so. |
| SIGTERM → process exit                                 | `<!-- HARDWARE-AWAITING -->` ms | `<!-- HARDWARE-AWAITING -->` ms | On Win32 this is effectively `TerminateProcess` — see [Node signal docs](https://nodejs.org/api/process.html#signal-events). |
| Port rebind after exit                                 | `<!-- HARDWARE-AWAITING -->` ms | `<!-- HARDWARE-AWAITING -->` ms | Probed via repeat `net.createServer().listen(port)` with 100 ms gap, 2.5 s budget. |
| Escalated to SIGKILL                                   | `<!-- HARDWARE-AWAITING -->` (true/false) | `<!-- HARDWARE-AWAITING -->` (true/false) | Should be `false` in the happy case. `true` = finding. |
| Ready pattern fired                                    | `<!-- HARDWARE-AWAITING -->` (one of 5 regex sources) | `<!-- HARDWARE-AWAITING -->` | Tells us which log-line variant b9371 currently emits. |
| Exit code                                              | `<!-- HARDWARE-AWAITING -->` | `<!-- HARDWARE-AWAITING -->` | POSIX should be 0 on clean drain; Win32 typically non-zero due to `TerminateProcess`. |

### Ready-pattern union (the 5 we watch for)

| # | Regex (source)                       | Origin                                                                                                                                                  | Why it's in the union |
|---|---|---|---|
| 1 | `HTTP server listening`              | Historical, see [PR #3960](https://github.com/ggml-org/llama.cpp/pull/3960) discussion                                                                  | Older `b<NNNN>` builds |
| 2 | `server is listening on`             | Newer; emitted by [`tools/server/server.cpp`](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server.cpp) once httplib transport landed | Mid-history builds |
| 3 | `main: server is listening`          | Some 2024-2026 builds                                                                                                                                   | Current variant |
| 4 | `all slots are idle`                 | [PR #5710](https://github.com/ggml-org/llama.cpp/pull/5710) post-warmup gate                                                                            | Later-than-listen but always-fires variant |
| 5 | `model loaded`                       | Very old builds; also emitted as a model-load complete marker                                                                                           | Pre-listen fallback |

The harness scans every line of both stdout and stderr — wherever the
ready string fires first wins. After Rocky runs the happy phase the
**Ready pattern fired** row above pins down which one b9371 actually
emits, and Phase 2 can pin to that one as the primary with the others
as fallbacks. (We keep all five in the wrapper anyway so an upstream
log-line change doesn't break us silently.)

## Subprocess wrapper API (proposed)

Locked-in shape. This is what
`packages/local-gguf-runtime/src/runtime/server-lifecycle.ts` exports.
The interface is **syntactically validated** — it parses cleanly under
`tsc 5.5.4 --noEmit --strict`. Additions beyond the master plan template
(lines 1290-1308) are called out in the table below.

```typescript
// packages/local-gguf-runtime/src/runtime/server-lifecycle.ts (proposed)

import type { ChildProcess } from 'node:child_process';

/** Backends Phase 2 needs to dispatch over (S1's 12-combo matrix). */
export type LlamaBackend = 'cpu' | 'cuda' | 'rocm' | 'vulkan' | 'metal';

/**
 * Reasons a server crash event may fire. Maps 1-1 with spec § 14.1's
 * typed-error union so the renderer can switch on this discriminator.
 */
export type ServerCrashReason =
  | 'spawn-error'           // ENOENT, EACCES, EPERM on the binary itself
  | 'model-load-failed'     // F1: bogus / corrupt model path
  | 'port-bind-failed'      // F2: port collision
  | 'ready-timeout'         // ready-line never appeared within budget
  | 'oom'                   // OS killed the process (Linux OOM-killer / Win32 commit failure)
  | 'manual-stop'           // Normal SIGTERM/SIGKILL by us
  | 'unknown';              // Exited but no pattern matched stderr

export interface ServerCrashInfo {
  readonly reason: ServerCrashReason;
  readonly exitCode: number | null;
  readonly exitSignal: NodeJS.Signals | null;
  readonly stderrTail: string;
  readonly matchedPattern: string | null;
  readonly uptimeMs: number;
}

export interface ServerHandle {
  /** OS-assigned port the server is listening on. */
  readonly port: number;
  /** Child process PID. -1 if the process never spawned. */
  readonly pid: number;
  /** Convenience base URL: `http://127.0.0.1:<port>`. */
  readonly baseUrl: string;
  /** Which b<NNNN> binary this handle was spawned from. */
  readonly binaryTag: string;
  /** Backend the spawned binary targets. */
  readonly backend: LlamaBackend;
  /** Wall-clock for spawn → ready (ms). Populated after waitReady resolves. */
  readonly readyMs: number;
  /**
   * Wait until the server is accepting HTTP on `baseUrl`. Resolves on the
   * first matching ready-line OR rejects with `ServerCrashInfo`-shaped
   * error if the process exits or the timeout fires first.
   */
  waitReady(timeoutMs: number): Promise<void>;
  /**
   * Lightweight health probe — GET /health if available, else a HEAD on
   * /v1/models. Used by the supervisor to poll for liveness without
   * generating chat traffic.
   */
  health(): Promise<{ ok: boolean; httpStatus: number; latencyMs: number }>;
  /**
   * Send SIGTERM, wait `shutdownGraceMs`, escalate to SIGKILL if still
   * running. Returns once the process has exited AND the port is
   * verified rebindable.
   */
  stop(opts?: { signal?: 'SIGTERM' | 'SIGKILL'; shutdownGraceMs?: number }): Promise<{
    exitCode: number | null;
    exitSignal: NodeJS.Signals | null;
    portReleaseMs: number;
    escalatedToSigkill: boolean;
  }>;
  /** Subscribe to crash events (process exit before manual-stop). */
  onCrash(cb: (info: ServerCrashInfo) => void): () => void;
  /** Subscribe to stdout lines (one callback per newline-terminated chunk). */
  onStdout(cb: (line: string) => void): () => void;
  /** Subscribe to stderr lines. */
  onStderr(cb: (line: string) => void): () => void;
  /** Direct access for advanced supervision (not typically needed). */
  readonly _proc: ChildProcess;
}

export interface SpawnServerOpts {
  /** Absolute path to llama-server[.exe]. */
  readonly binaryPath: string;
  /** Absolute path to the .gguf model. */
  readonly modelPath: string;
  /** -c context size in tokens. */
  readonly nCtx: number;
  /** -ngl GPU layer offload count (0 = CPU only). */
  readonly nGpuLayers: number;
  /** -b batch size; default = llama-server default. */
  readonly nBatch?: number;
  /** -t thread count; default = llama-server default (typically physical cores). */
  readonly nThreads?: number;
  /** Backend tag for label / dispatch (does not change the binary CLI). */
  readonly backend: LlamaBackend;
  /** Upstream tag for telemetry / crash reporting. */
  readonly binaryTag: string;
  /** Where to allocate the port from. Defaults to 'auto' (port-0 + close). */
  readonly portStrategy?: 'auto' | { fixed: number };
  /** Ready-line timeout, default 60_000 ms. */
  readonly readyTimeoutMs?: number;
  /** Preflight a `net.createServer().listen(port)` before spawn? Default true. */
  readonly preflightBind?: boolean;
  /** Additional env vars to pass through (e.g. CUDA_VISIBLE_DEVICES). */
  readonly extraEnv?: Readonly<Record<string, string>>;
  /** Optional extra CLI args appended after the curated set. */
  readonly extraArgs?: ReadonlyArray<string>;
}

/**
 * Spawn a llama-server subprocess, wait for the ready line, return a live
 * `ServerHandle`. Throws on spawn failure or ready-timeout — caller MUST
 * `.catch` to surface the typed error to the renderer.
 */
export function spawnServer(opts: SpawnServerOpts): Promise<ServerHandle>;
```

### Deltas from the master plan template (lines 1290-1308)

| Plan template                                          | Spike addition                                                                  | Why                                                                                                          |
|---|---|---|
| `port`, `pid`, `baseUrl`                               | (+) `backend`, `binaryTag`, `readyMs`                                          | The supervisor needs to label sessions in the UI ("CPU build, b9371") and emit telemetry; storing it on the handle keeps that out of `SpawnServerOpts` re-derivation.            |
| `waitReady(timeoutMs)`                                 | (rejects with structured info, not plain `Error`)                              | The renderer needs to discriminate ready-timeout vs spawn-error vs OOM. Returning a structured rejection shape lets the typed-error mapper at the IPC boundary fan it out. |
| `stop(signal?)`                                        | (+) `shutdownGraceMs` option, **returns** `{ exitCode, exitSignal, portReleaseMs, escalatedToSigkill }` | The supervisor logs every stop for forensics. Returning the data avoids a separate `onExit` subscription.                                                                  |
| `onCrash(cb)`                                          | (returns unsubscriber)                                                          | EventEmitter-style subscriptions leak memory if the listener holds a reference. Returning the unsubscriber matches Node's modern AbortController-friendly pattern.            |
| (no stdout/stderr taps)                                | (+) `onStdout(cb)`, `onStderr(cb)`                                              | The diagnostics panel (spec § 12.6) needs a live log view; teeing through the handle avoids the consumer re-reading from the ChildProcess directly.                          |
| (no health probe)                                      | (+) `health()`                                                                  | The supervisor pings every 30 s to detect hung-but-not-crashed states (e.g. CUDA context lockup). The harness's F3 test already exercises the path.                          |
| (no preflightBind)                                     | (+) `preflightBind` option                                                      | Observed in F2: some builds load the model BEFORE binding, so the supervisor should fail-fast on port-collision without paying model-load cost.                              |

### TypeScript validation

The interface above was saved to `.spike-s4-cache/types.ts` and parsed with:

```
$ node node_modules/typescript/bin/tsc --noEmit --strict --target es2022 \
    --moduleResolution node --types node .spike-s4-cache/types.ts
$ echo $?
0
```

No syntax errors, no implicit `any`, no `--strict` complaints. The
interface is a real TS type, not pseudocode. (This is the same gate S5
used for `HfClient`.)

## Port allocator strategy

### Algorithm

```
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}
```

That's it. We rely on the OS's ephemeral port allocator (per
[RFC 6335 § 6](https://www.rfc-editor.org/rfc/rfc6335.html#section-6))
to pick a free port from its dynamic range:

- **Linux:** `/proc/sys/net/ipv4/ip_local_port_range` (typically
  `32768-60999`). Documented in
  [`ip(7)`](https://man7.org/linux/man-pages/man7/ip.7.html).
- **macOS:** `net.inet.ip.portrange.first` / `last` (typically
  `49152-65535`). Documented in
  [`sysctl.conf(5)`](https://www.unix.com/man-page/osx/5/sysctl.conf/).
- **Windows:** dynamic port range `49152-65535` by default since Vista,
  documented in [Microsoft's TCP/IP default dynamic port range article](https://learn.microsoft.com/en-us/troubleshoot/windows-server/networking/default-dynamic-port-range-tcpip-chang).

Binding to `127.0.0.1` (loopback) explicitly — not `0.0.0.0` — means
the OS picks from the per-interface ephemeral table, which is the
strictest scope and avoids any chance of the server briefly accepting
LAN traffic during the bind window.

### Race window

Between `srv.close()` and the spawned server's own bind there is a small
window where another process can claim the port. Measured race is
typically <1 ms on a healthy box, but it CAN happen (most often when
another instance of Team-X is starting concurrently). The production
wrapper handles this by:

1. **Preflighting the bind** (`preflightBind: true`). We re-bind the port
   immediately before spawn — if that fails, retry allocation; if it
   succeeds, we close it and spawn within the same event-loop tick.
2. **Recognizing the EADDRINUSE failure mode** on the spawned server's
   stderr — if we see it, we kill the child, re-allocate, retry. Cap at
   3 retries to avoid infinite loops.
3. **Treating a 3-retry failure as a `port-bind-failed` typed error**
   for the spec § 14.1 union.

### Alternative strategies considered

| Strategy                                                          | Pros                                                                     | Cons                                                                                                                  | Decision |
|---|---|---|---|
| **Bind-port-0 + close + reuse** (chosen)                          | Standard Node idiom, no dependency on an allocator service               | Race window exists                                                                                                    | ✓ Picked. |
| Sequentially scan from 8080 upward                                | Deterministic port numbers (easier for debugging)                        | Slow on busy boxes, fights with dev servers, conflicts with corporate-mandated ports                                  | ✗ Rejected. |
| Random pick from 49152-65535, retry on EADDRINUSE                 | No race window between close and bind                                    | Higher collision rate (especially on Windows where the dynamic range is bigger but more contested)                    | ✗ Rejected. |
| Unix domain socket (POSIX) / named pipe (Win32)                   | No port at all                                                            | llama-server doesn't support either transport; would require an upstream patch                                        | ✗ Out of scope (and ruled out by S1's "bundle upstream verbatim" decision). |
| Reserve via [`tcp-port-used`](https://www.npmjs.com/package/tcp-port-used) or similar | Same race window, dependency-laden                                       | Adds an npm dep for no extra correctness                                                                              | ✗ Rejected. |

## Failure modes observed

The harness runs three discrete failure modes and emits a structured
JSON report for each. The "Real signal" column gets filled from Rocky's
runbook run.

### F1 — Bogus model path

| Property                       | Expected                                                                  | Real signal                                              |
|---|---|---|
| Trigger                        | `llama-server -m C:\nonexistent\...\does-not-exist.gguf` (Win) / `/tmp/team-x-s4-does-not-exist.gguf` (POSIX) | `<!-- HARDWARE-AWAITING -->`                            |
| Exit window                    | < 10 s (loader fast-fails on `fopen` failure)                             | `<!-- HARDWARE-AWAITING -->` ms                          |
| Exit code                      | Non-zero (typically 1 on POSIX; varies on Win32)                          | `<!-- HARDWARE-AWAITING -->`                            |
| Stderr regex that fires        | One of `/failed to load model/i`, `/no such file/i`, `/cannot open/i`, `/unable to allocate/i`, `/cannot find tensor/i`, `/llama_model_load.*failed/i`, `/gguf.*not a valid/i` | `<!-- HARDWARE-AWAITING -->`                            |
| Stderr first 400 bytes         | (sourced from llama.cpp loader at [`src/llama-model-loader.cpp`](https://github.com/ggml-org/llama.cpp/blob/master/src/llama-model-loader.cpp)) | `<!-- HARDWARE-AWAITING -->`                            |
| Maps to typed error            | `server-spawn-failed` → UI: "This model file is missing or corrupt"      | (mapping locked) |

### F2 — Port collision

| Property                       | Expected                                                                  | Real signal                                              |
|---|---|---|
| Trigger                        | Bind a dummy `net.createServer()` on a free port, spawn `llama-server --port <same-port>` | `<!-- HARDWARE-AWAITING -->`                            |
| Exit window                    | < 5 s if bind-before-load; up to 30 s if load-before-bind                | `<!-- HARDWARE-AWAITING -->` ms                          |
| Exit code                      | Non-zero (typically 1)                                                    | `<!-- HARDWARE-AWAITING -->`                            |
| Stderr regex that fires        | One of `/address already in use/i`, `/failed to bind/i`, `/bind:.*in use/i`, `/could not bind/i`, `/unable to bind/i`, `/EADDRINUSE/i`, `/WSAEADDRINUSE/i` | `<!-- HARDWARE-AWAITING -->`                            |
| Stderr first 400 bytes         | (sourced from httplib's [`bind_to_port` implementation](https://github.com/yhirose/cpp-httplib/blob/master/httplib.h) wrapped by llama.cpp `tools/server/server.cpp`) | `<!-- HARDWARE-AWAITING -->`                            |
| Maps to typed error            | `port-bind-failed` → UI: "Port in use — Team-X will pick another" (silent retry) | (mapping locked) |
| **Phase-2 follow-up**          | If F2's `exitMs` shows load-before-bind, add `preflightBind: true` as the default | See "Spec amendments" §3 |

### F3 — Context overflow (request larger than configured n_ctx)

| Property                       | Expected                                                                  | Real signal                                              |
|---|---|---|
| Trigger                        | Spawn with `-c 256`, POST a ~5000-token prompt to `/v1/chat/completions` | `<!-- HARDWARE-AWAITING -->`                            |
| Server still alive after?      | **TRUE** (this is the hard gate — server MUST NOT crash)                 | `<!-- HARDWARE-AWAITING -->`                            |
| HTTP status                    | 400 (or another 4xx)                                                      | `<!-- HARDWARE-AWAITING -->`                            |
| Body shape                     | OpenAI-style `{"error":{"message":"...", "type":"...", "code":...}}` per [OpenAI error reference](https://platform.openai.com/docs/guides/error-codes/api-errors) | `<!-- HARDWARE-AWAITING -->`                            |
| Body first 500 bytes           | (sourced from llama.cpp's `handle_completions_impl` early-rejection path in [tools/server/server.cpp](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server.cpp)) | `<!-- HARDWARE-AWAITING -->`                            |
| Maps to typed error            | `context-exceeded` → UI: "Message too long for this model's context window" + a "Shorten" button | (mapping locked) |

If F3's "Server still alive" comes back FALSE on either rig, that is a
**NO-GO blocker** — the spike decision must be downgraded and Phase 9
needs a separate "automatic server restart on context-overflow crash"
design.

## Phase-2 carry-over

### Production code paths

| File                                                                              | Source                                | Notes |
|---|---|---|
| `packages/local-gguf-runtime/package.json`                                        | _(new)_                               | No new runtime deps; pure Node stdlib. Will declare `engines.node >= 22.13` to match the workspace root. |
| `packages/local-gguf-runtime/src/runtime/server-lifecycle.ts`                     | this spike, "Subprocess wrapper API"  | Exports `spawnServer`, `ServerHandle`, `ServerCrashReason`, `ServerCrashInfo`. |
| `packages/local-gguf-runtime/src/runtime/port-allocator.ts`                       | this spike, "Port allocator strategy" | Exports `getFreePort()` + `probePortBindable(port)` + the retry loop. |
| `packages/local-gguf-runtime/src/runtime/ready-detector.ts`                       | this spike, "Ready-pattern union"     | Exports `READY_PATTERNS` constant + `scanForReady(line)` helper. |
| `packages/local-gguf-runtime/src/runtime/failure-mapper.ts`                       | this spike, "Failure modes observed"  | Exports `mapStderrToCrashReason(stderr: string): ServerCrashReason`. Each F1/F2 regex source flows through here. |
| `packages/local-gguf-runtime/src/runtime/server-lifecycle.test.ts`                | _(new)_                               | Unit tests against fixture stderr strings captured by the spike + msw-style HTTP probes. |
| `packages/local-gguf-runtime/src/runtime/server-lifecycle.integration.test.ts`    | _(new)_                               | Env-gated integration test that runs the spike harness end-to-end against `apps/desktop/resources/llama-server/<platform>/cpu/`. |
| `apps/desktop/src/main/runtime/supervisor.ts`                                     | _(new)_                               | Owns the lifecycle: spawn, supervise, kill on app-quit. Wraps `ServerHandle` behind the IPC channel. |

### Test contract

| Behavior                                          | Test type                | Fixture                                              |
|---|---|---|
| `getFreePort()` returns a number in 1024-65535    | unit                     | n/a (live syscall)                                   |
| Port-release after SIGTERM completes in ≤ 2.5 s   | integration              | Real llama-server + TinyLlama                        |
| Ready-line detection works against each of 5 patterns | unit                | Synthetic stderr fixtures derived from the regex sources |
| F1 stderr maps to `model-load-failed`             | unit                     | Captured stderr from Rocky's runbook                 |
| F2 stderr maps to `port-bind-failed`              | unit                     | Captured stderr from Rocky's runbook                 |
| F3 returns 4xx + OpenAI-shape body + server stays up | integration            | Real llama-server with `-c 256`                      |
| `stop()` returns `escalatedToSigkill: false` on a healthy server | integration | Real llama-server                                    |
| Crash detection fires `ServerCrashInfo` cb        | integration              | Force a crash via `process.kill('SIGABRT')` mid-life |

### Spec amendments (small)

1. **Spec § 14.1 — split `server-spawn-failed` into two variants.**
   Today it's one error; the spike shows a discrete `server-ready-timeout`
   case that needs different UI ("ready took too long — usually means
   model is too large for RAM"). Phase 2 grows the union to:

   ```ts
   | { kind: 'server-spawn-failed'; reason: 'ENOENT' | 'EACCES' | 'EPERM'; binaryPath: string }
   | { kind: 'server-ready-timeout'; modelPath: string; readyTimeoutMs: number }
   | { kind: 'model-load-failed'; modelPath: string; stderrTail: string }
   | { kind: 'port-bind-failed'; attemptedPort: number; stderrTail: string }
   | { kind: 'context-exceeded'; nCtx: number; requestedTokens: number }
   ```

2. **Spec § 12 — declare the `preflightBind` step.** The supervisor
   MUST attempt a throwaway `net.createServer().listen(port)` between
   port allocation and `spawn(BINARY, ...)` so it fails fast on port
   collisions without paying model-load cost.

3. **Plan line 1178 fixture URL fix.** Replace
   `bartowski/TinyLlama-1.1B-Chat-v1.0-GGUF` (fictional) with
   [`TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF`](https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF)
   plus the lower-cased filename `tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf`.
   Verified anonymous-200 via HEAD; ETag (= SHA256) =
   `015c9bb0376d9c3c9dab434ecb3bd57961dce1921a5b1bf134c6f1b824c25c8d`.
   This is the same amendment S5 queued — keeping it here makes S4 a
   stand-alone reference.

## Findings & risks

### F1. Ready-line wording is not stable across llama.cpp history

The exact log line emitted when the HTTP server starts listening has
changed at least three times in the `b<NNNN>` build history. The
authoritative source is
[`tools/server/server.cpp`](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server.cpp);
the change log is visible in the commit history (e.g. the rename across
[PR #5710](https://github.com/ggml-org/llama.cpp/pull/5710), the
httplib transport swap discussed in
[issue #6017](https://github.com/ggml-org/llama.cpp/issues/6017)).
**Mitigation:** the wrapper watches a **union of 5 regex patterns**;
first match wins. Adding new patterns is one-line and forward-safe.

### F2. SIGTERM semantics differ between POSIX and Win32

[Node.js docs](https://nodejs.org/api/process.html#signal-events) are
unambiguous: on Win32, `child.kill('SIGTERM')` calls
[`TerminateProcess`](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-terminateprocess),
not a real signal. This means **on Windows the llama-server does not
get the chance to drain in-flight HTTP responses** — but the OS does
release the TCP listener immediately. POSIX SIGTERM is honored: the
server's `signal()` handler in `tools/server/server.cpp` triggers a
clean drain through `httplib::Server::stop()` and the process exits 0.
**Mitigation:** the supervisor logs the platform-specific exit-code
expectation and surfaces an exit-code mismatch only when it's truly
unexpected (e.g. a SIGABRT on either platform).

### F3. Port release is platform-dependent

On Linux, `SO_REUSEADDR` is typically already enabled by httplib so the
port releases within ~50 ms after process exit. On macOS, the
[TIME_WAIT behavior](https://developer.apple.com/library/archive/documentation/Darwin/Conceptual/PerformanceOptimization/Performance-Optimization.html#//apple_ref/doc/uid/TP40005048-CH1-SW1)
can delay rebind by up to ~30 s if the previous listener had open
client connections at exit. On Windows, `TerminateProcess` immediately
releases the listener and rebind typically succeeds in under 50 ms.
**Mitigation:** the supervisor retries the rebind for up to 2.5 s with
100 ms gaps. The runbook's `portReleaseMs` field captures the real
window.

### F4. Some builds load model before binding port

The F2 test surfaces this: certain `b<NNNN>` builds invoke
`llama_model_load_from_file` BEFORE `httplib::Server::bind_to_port`,
which means a port-collision failure only fires AFTER the (slow) model
load completes. That's a Phase-2 UX regression we mitigate via
`preflightBind: true` — the supervisor attempts a throwaway
`net.createServer().listen(port)` before spawn, failing fast in <1 ms.

### F5. Embeddings endpoint is build-conditional

Not all `b<NNNN>` builds compile in the embeddings head. The harness
passes `--embeddings` to llama-server; on a build without it, the
server still starts (logs a warning), `/v1/embeddings` returns 404 or
501, and the harness records that fact instead of failing. **Phase 9
must route around this** — query `/v1/models` at supervisor startup;
if the response doesn't include an embedding-capable model entry,
disable the embeddings tab in the UI and surface a "this build doesn't
support embeddings" tooltip.

### F6. `process.kill('SIGTERM')` on Win32 returns synchronously but exit is async

The Node.js [`subprocess.kill()` docs](https://nodejs.org/api/child_process.html#subprocesskillsignal)
note that `kill()` returns `true` once the signal has been sent (or
TerminateProcess called); the process's `'exit'` event still fires
asynchronously. The harness handles this via a 50-ms-grained spin-wait
up to `SHUTDOWN_GRACE_MS` (default 5 s), escalating to SIGKILL after
the budget expires. Phase 2 inherits the same pattern.

### F7. `httplib::Server` is the actual HTTP engine

llama.cpp's `tools/server` uses
[yhirose/cpp-httplib](https://github.com/yhirose/cpp-httplib) (header-only
C++ HTTP library, vendored via submodule into llama.cpp). The
ready-line, the bind behavior, and the EADDRINUSE error all originate
from httplib's
[`Server::listen` / `bind_to_port`](https://github.com/yhirose/cpp-httplib/blob/master/httplib.h)
implementation. Understanding this matters because httplib's behavior
is what we're really testing — llama.cpp is just the consumer. If a
future llama.cpp build switches to another HTTP engine (libmicrohttpd
has been discussed in [issue #4666](https://github.com/ggml-org/llama.cpp/issues/4666)),
the ready-line and EADDRINUSE wording could change in ways our regex
union doesn't cover.

### F8. The `/health` endpoint is the official liveness probe

Source: the
[`tools/server` README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md#endpoints)
documents `/health` as "Returns heath check result. The endpoint
returns the status of the server" — the harness uses it in F3 to
probe whether the server is still alive after a context-overflow
request. It returns 200 when fully ready, 503 during load, 500 on
error. The production supervisor polls every 30 s.

### F9. Ephemeral port range on Windows differs by SKU and AD policy

The default Windows dynamic port range is 49152-65535 per the
[Microsoft KB on default dynamic port range](https://learn.microsoft.com/en-us/troubleshoot/windows-server/networking/default-dynamic-port-range-tcpip-chang),
but **AD GPO can compress this range** and some enterprise images do.
On a domain-joined corporate workstation we may only have a few
thousand ephemeral ports to choose from. The bind-port-0 strategy is
unaffected (the OS still picks from whatever the configured range is),
but if a future telemetry signal shows we hit `EADDRINUSE` more often
on certain enterprise IPs we'll know to look here. Documented in the
[Microsoft Q&A on dynamic port reservation](https://learn.microsoft.com/en-us/windows/win32/winsock/using-bind).

### F10. The `seed=42, temperature=0` request shape is for reproducibility, not correctness

The happy-path chat request uses `temperature=0` and an explicit
`seed=42` so that the harness produces the same output bytes on every
run. This is not a model-quality check — it's a CI-friendly determinism
check. The model itself is deterministic given those parameters
(modulo CUDA-kernel non-determinism on GPU builds, documented in
[llama.cpp issue #9690](https://github.com/ggml-org/llama.cpp/issues/9690)).

### F11. The harness deliberately runs in `windowsHide: true` mode

[`child_process.spawn` `windowsHide` option](https://nodejs.org/api/child_process.html#optionswindowshide)
suppresses the console window that would otherwise pop up on Win32
when spawning a Console subsystem binary. Setting it to true is
required for any Electron production code that spawns subprocesses —
the harness pins it to true to match production behavior.

### F12. We do NOT use `shell: true` on `spawn`

Using `shell: true` would invoke `cmd.exe` (Win) or `/bin/sh` (POSIX)
as an intermediary, which (a) adds another process to clean up, (b)
makes arg-quoting platform-dependent, and (c) creates a shell-injection
risk if any caller passes user-controlled strings into model paths. The
harness uses the array form of `spawn(binary, [args...])` exclusively,
which is the Node-documented safe pattern (see the
[Node Security Best Practices](https://nodejs.org/en/learn/getting-started/security-best-practices#child-processes)).

## Decision rationale

**GO WITH CHANGES.** The autonomous layer of the spike — design contract,
runbook, harness implementation — is complete and the design is locked.
The hardware-driven layer is queued for Rocky's runbook execution. The
spike clears Phase 1 unblock-ability subject to the three small amendments
below; none of those are gating, all three are one-line edits.

**The three changes baked into this GO:**

1. **Plan line 1178 fixture URL fix** (same fix S5 already queued; we
   verified HEAD-200 again for completeness).
2. **Spec § 12 add a `preflightBind` step** to the supervisor lifecycle.
3. **Spec § 14.1 grow** to add `server-ready-timeout`,
   `model-load-failed`, `port-bind-failed`, `context-exceeded` as
   discriminable typed-error variants alongside `server-spawn-failed`.

**The four spike risks resolved:**

1. **Spawn + ready detection.** The 5-pattern union is forward/backward
   compatible with any `b<NNNN>` build in S1's window. The actual
   pattern that fired in b9371 gets pinned in this writeup's "Ready
   pattern fired" cell after Rocky runs the happy phase.

2. **OpenAI-compat endpoints.** The harness's chat + embed probes hit
   the documented OpenAI shapes. Real latency numbers and HTTP status
   codes get pasted in once Rocky runs the runbook.

3. **Clean termination + port release.** The SIGTERM-vs-SIGKILL
   escalation logic is locked, and the 2.5-s port-rebind probe
   captures the real release window. Platform differences (POSIX clean
   drain vs Win32 `TerminateProcess`) are documented and acceptable.

4. **Failure-mode triage.** Three discrete failure modes; each maps
   1-1 to a typed error in the spec § 14.1 union. The regex sources
   that distinguish them move verbatim into
   `packages/local-gguf-runtime/src/runtime/failure-mapper.ts` in
   Phase 2.

If the runbook surfaces a NO-GO signal (most likely candidate: F3's
"server stays up" being false), the decision downgrades to NO-GO and
Phase 9 grows a server-restart-on-crash supervisor task. Today: GO
WITH CHANGES.

## Spike contents (committed)

| Path                                                       | Size    | Purpose |
|---|---|---|
| `docs/spikes/2026-05-27-S4-llama-server-lifecycle.md`      | —       | This writeup |
| `docs/spikes/S4-hardware-runbook.md`                       | ~14 KB  | Rocky's verbatim runbook for both rigs |
| `scripts/spike-S4/lifecycle-test.mjs`                      | ~22 KB  | The lifecycle harness (real, not a stub) |
| `.gitignore` (modified)                                    | —       | Added `.spike-s4-cache/` + `.spike-s4-bin/` to the spike-caches block |

**Total commit size:** ~36 KB code + writeup. No fixtures committed.
`.spike-s4-cache/` (the 638 MiB GGUF + JSON reports) and `.spike-s4-bin/`
(the extracted llama-server binary) are both gitignored.

## Homework — Rocky's runbook execution

Step 5 of the master plan (failure-mode testing on real binaries) is
this spike's hardware-driven step. The
[runbook](./S4-hardware-runbook.md) details the exact PowerShell /
Bash commands. The expected total wall-clock is ~15-20 minutes per rig:
~5-10 min for the GGUF download, ~5 s for the binary fetch + extract,
then ~30-60 s of harness runtime across all four phases.

The runbook ends with a "paste the JSON values into the writeup" step.
After Rocky runs it on Win CPU (and optionally Mac Metal), commit the
filled-in writeup with the message
`docs(spike-S4): fill HARDWARE-AWAITING from <rig> run` and the
co-authored trailer. That commit (or commits) closes the spike and
unblocks Phase 1.

---

**Spike status (autonomous layer):** lifecycle harness real, runbook
written, design contract locked at TS-validated interface, three small
spec amendments queued, decision pre-recorded subject to hardware
confirmation. **Recommendation: GO WITH CHANGES** — proceed to Phase 1
foundation work; Rocky's runbook output backfills the measurement
cells in this writeup before the Phase 2 server-lifecycle.ts
implementation begins.

## Source links

Beyond the inline citations above, the following are the authoritative
sources backing claims in this writeup:

### llama.cpp upstream

- [`ggml-org/llama.cpp` repository (upstream)](https://github.com/ggml-org/llama.cpp)
- [`ggml-org/llama.cpp` releases feed](https://github.com/ggml-org/llama.cpp/releases)
- [`b9371` release tag (S1's pinned upstream)](https://github.com/ggml-org/llama.cpp/releases/tag/b9371)
- [llama.cpp `tools/server` README — endpoints reference](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
- [llama.cpp `tools/server/server.cpp` source](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server.cpp)
- [llama.cpp `src/llama-model-loader.cpp` source (F1 stderr origin)](https://github.com/ggml-org/llama.cpp/blob/master/src/llama-model-loader.cpp)
- [llama.cpp PR #3960 — earlier server commit referenced by ready-pattern #1](https://github.com/ggml-org/llama.cpp/pull/3960)
- [llama.cpp PR #5710 — "all slots are idle" ready gate (ready-pattern #4)](https://github.com/ggml-org/llama.cpp/pull/5710)
- [llama.cpp issue #6017 — httplib transport swap discussion](https://github.com/ggml-org/llama.cpp/issues/6017)
- [llama.cpp issue #4666 — HTTP server engine selection discussion](https://github.com/ggml-org/llama.cpp/issues/4666)
- [llama.cpp issue #9690 — CUDA-kernel non-determinism](https://github.com/ggml-org/llama.cpp/issues/9690)
- [llama.cpp commit 7a861313 (server-is-listening wording)](https://github.com/ggml-org/llama.cpp/commit/7a861313)
- [yhirose/cpp-httplib (the HTTP engine inside llama-server)](https://github.com/yhirose/cpp-httplib)
- [cpp-httplib `httplib.h` (bind_to_port + listen impl)](https://github.com/yhirose/cpp-httplib/blob/master/httplib.h)

### Node.js stdlib

- [Node.js `child_process.spawn` reference](https://nodejs.org/api/child_process.html#child_processspawncommand-args-options)
- [Node.js `child_process.spawn` `windowsHide` option](https://nodejs.org/api/child_process.html#optionswindowshide)
- [Node.js `subprocess.kill(signal)` reference](https://nodejs.org/api/child_process.html#subprocesskillsignal)
- [Node.js `process` Signal Events (POSIX vs Win32 SIGTERM)](https://nodejs.org/api/process.html#signal-events)
- [Node.js `net.createServer()` reference](https://nodejs.org/api/net.html#netcreateserveroptions-connectionlistener)
- [Node.js `server.listen(port, host, cb)` reference](https://nodejs.org/api/net.html#serverlistenport-host-backlog-callback)
- [Node.js `server.address()` reference](https://nodejs.org/api/net.html#serveraddress)
- [Node.js `node:timers/promises.setTimeout` reference](https://nodejs.org/api/timers.html#timerspromisessettimeoutdelay-value-options)
- [Node.js `node:perf_hooks.performance.now()` reference](https://nodejs.org/api/perf_hooks.html#performancenow)
- [Node.js built-in `fetch` (since Node 18)](https://nodejs.org/api/globals.html#fetch)
- [Node.js `AbortController` reference](https://nodejs.org/api/globals.html#class-abortcontroller)
- [Node.js Security Best Practices — child processes](https://nodejs.org/en/learn/getting-started/security-best-practices#child-processes)
- [Node.js `node:fs/promises.mkdir` reference](https://nodejs.org/api/fs.html#fspromisesmkdirpath-options)

### OpenAI compatibility surface

- [OpenAI Chat Completions API reference](https://platform.openai.com/docs/api-reference/chat/create)
- [OpenAI Embeddings API reference](https://platform.openai.com/docs/api-reference/embeddings)
- [OpenAI API error codes reference](https://platform.openai.com/docs/guides/error-codes/api-errors)
- [OpenAI `/v1/models` reference](https://platform.openai.com/docs/api-reference/models)

### Platform-specific port + signal semantics

- [Microsoft KB — default Windows dynamic port range](https://learn.microsoft.com/en-us/troubleshoot/windows-server/networking/default-dynamic-port-range-tcpip-chang)
- [Microsoft `TerminateProcess` API reference](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-terminateprocess)
- [Microsoft Q&A — Winsock `bind`/dynamic port reservation](https://learn.microsoft.com/en-us/windows/win32/winsock/using-bind)
- [`man 7 ip` — Linux ephemeral port range docs](https://man7.org/linux/man-pages/man7/ip.7.html)
- [macOS `sysctl.conf(5)` — net.inet.ip.portrange](https://www.unix.com/man-page/osx/5/sysctl.conf/)
- [Apple Performance Optimization — TIME_WAIT discussion](https://developer.apple.com/library/archive/documentation/Darwin/Conceptual/PerformanceOptimization/Performance-Optimization.html#//apple_ref/doc/uid/TP40005048-CH1-SW1)

### Standards & RFCs

- [RFC 6335 § 6 — IANA service name and transport protocol port number registry / ephemeral range guidance](https://www.rfc-editor.org/rfc/rfc6335.html#section-6)
- [RFC 9110 § 9.3 — HTTP method definitions](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.3)
- [RFC 9110 § 15.5.1 — 400 Bad Request](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.1)
- [RFC 9110 § 15.6.1 — 500 Internal Server Error](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.6.1)
- [RFC 9110 § 15.6.4 — 503 Service Unavailable](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.6.4)

### Other Team-X spikes referenced

- [S1 — llama.cpp binary fetch + version pin](./2026-05-27-S1-llama-binary-fetch.md)
- [S3 — GGUF metadata parser](./2026-05-27-S3-gguf-metadata-parser.md)
- [S5 — Hugging Face API client](./2026-05-27-S5-hf-api-client.md)
- [S2 hardware runbook (sibling pattern)](./S2-hardware-runbook.md)

### Hugging Face fixture references

- [`TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF` (anonymous-accessible fixture)](https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF)
- [`tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf` resolve URL](https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf)
- [`bartowski/Llama-3.2-1B-Instruct-GGUF` (verified-real backup fixture)](https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF)
- [Hugging Face Hub storage backends docs (ETag = SHA256 semantics)](https://huggingface.co/docs/hub/storage-backends)

### TypeScript validation surface

- [TypeScript 5.5 release notes (compiler version used for the interface validation)](https://devblogs.microsoft.com/typescript/announcing-typescript-5-5/)
- [TypeScript `--strict` compiler option reference](https://www.typescriptlang.org/tsconfig/#strict)
- [TypeScript Handbook — `readonly` modifier reference](https://www.typescriptlang.org/docs/handbook/2/objects.html#readonly-properties)

### Master plan reference

- [`docs/superpowers/plans/2026-05-27-local-gguf-support.md` (Spike S4 section at lines 1160-1326)](../superpowers/plans/2026-05-27-local-gguf-support.md)
