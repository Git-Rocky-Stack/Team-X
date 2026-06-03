// packages/local-gguf-runtime/src/runtime/server-lifecycle.ts
import { type ChildProcess, spawn as nodeSpawn } from 'node:child_process';
import type { LocalGgufError } from '@team-x/shared-types';

export class ServerLifecycleError extends Error {
  constructor(public readonly error: LocalGgufError) {
    super(`ServerLifecycleError: ${JSON.stringify(error)}`);
    this.name = 'ServerLifecycleError';
  }
}

export interface SpawnServerOptions {
  binaryPath: string;
  modelPath: string;
  port: number;
  nCtx: number;
  nGpuLayers: number;
  nBatch: number;
  nThreads: number;
  flashAttention?: boolean;
  mmap?: boolean;
  mlock?: boolean;
  readyTimeoutMs?: number;
  spawnFn?: typeof nodeSpawn;
  onLog?: (chunk: string, stream: 'stdout' | 'stderr') => void;
}

export interface ServerHandle {
  port: number;
  pid: number;
  baseUrl: string;
  stop: (signal?: 'SIGTERM' | 'SIGKILL') => Promise<void>;
  onCrash: (cb: (info: { exitCode: number | null; stderr: string }) => void) => void;
}

const DEFAULT_READY_TIMEOUT_MS = 60_000;
// Readiness-line union, validated against llama.cpp b9371 on real hardware
// (docs/spikes/2026-05-27-S4-llama-server-lifecycle.md). b9371 emits
// `srv  llama_server: model loaded` immediately followed by
// `srv  llama_server: server is listening on …` — it does NOT emit the
// historical `HTTP server listening` line. We keep all five wordings
// (first match wins) so an upstream log-line change doesn't silently break
// readiness detection. These lines arrive on STDERR (see the stderr handler).
const READY_LINE_REGEX =
  /\bmodel loaded\b|server is listening on|main: server is listening|all slots are idle|HTTP server listening/i;
// Cap the retained stderr to the most recent bytes (enough for crash
// diagnostics). llama-server streams to stderr for its entire lifetime, so an
// uncapped buffer is an unbounded heap-growth (OOM) vector in the host process.
const STDERR_RETAIN_BYTES = 65_536;

export async function spawnServer(opts: SpawnServerOptions): Promise<ServerHandle> {
  const spawnFn = opts.spawnFn ?? nodeSpawn;
  const args = buildArgs(opts);

  const proc = spawnFn(opts.binaryPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  }) as ChildProcess;

  let stderrBuf = '';
  let stdoutBuf = '';
  let ready = false;

  // Persistent 'error' listener so a post-ready runtime error never surfaces as
  // an unhandled 'error' event (which would crash the host process). Pre-ready
  // spawn errors are handled — and rejected — by waitForReadyOrExit below.
  proc.on('error', () => {
    /* recorded via stderr/exit; presence prevents an unhandled throw */
  });

  proc.stdout?.on('data', (d: Buffer) => {
    const s = d.toString();
    if (opts.onLog) opts.onLog(s, 'stdout');
    // Only accumulate + scan until ready: llama-server is verbose, and
    // re-testing an ever-growing buffer on every chunk is O(n²). Once the
    // ready-line is seen we stop buffering (callers stream via onLog).
    if (!ready) {
      stdoutBuf += s;
      if (READY_LINE_REGEX.test(stdoutBuf)) ready = true;
    }
  });
  proc.stderr?.on('data', (d: Buffer) => {
    const s = d.toString();
    if (opts.onLog) opts.onLog(s, 'stderr');
    // Retain only the most recent STDERR_RETAIN_BYTES (rolling tail) so a
    // long-lived, chatty server can't grow this buffer without bound. The
    // onLog callback above still receives the full, untruncated stream.
    stderrBuf += s;
    // llama.cpp b9371 logs its readiness lines (`model loaded`,
    // `server is listening on …`) to STDERR, not stdout — so readiness MUST be
    // scanned here too, not only on stdout. We test before the rolling-tail
    // slice below: pre-ready output is small (ready fires in ~1-2 s, well under
    // the cap), so testing the whole accumulated buffer safely tolerates a
    // ready line split across chunks without any O(n²) regrowth concern.
    if (!ready && READY_LINE_REGEX.test(stderrBuf)) ready = true;
    if (stderrBuf.length > STDERR_RETAIN_BYTES) {
      stderrBuf = stderrBuf.slice(-STDERR_RETAIN_BYTES);
    }
  });

  await waitForReadyOrExit(
    proc,
    () => ready,
    () => stderrBuf,
    opts.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
  );

  if (proc.pid === undefined) {
    throw new ServerLifecycleError({
      kind: 'server-spawn-failed',
      exitCode: null,
      stderr: stderrBuf,
    });
  }

  const crashCallbacks: Array<(info: { exitCode: number | null; stderr: string }) => void> = [];
  let stopped = false;
  // Buffer the crash so a consumer (e.g. the LRU pool) that registers onCrash
  // after a fast post-ready crash still receives it, rather than the slot
  // leaking silently.
  let pendingCrash: { exitCode: number | null; stderr: string } | undefined;

  proc.on('exit', (code) => {
    if (!stopped) {
      const info = { exitCode: code, stderr: stderrBuf };
      pendingCrash = info;
      for (const cb of crashCallbacks) cb(info);
    }
  });

  return {
    port: opts.port,
    pid: proc.pid,
    baseUrl: `http://127.0.0.1:${opts.port}`,
    async stop(signal = 'SIGTERM') {
      stopped = true;
      // exitCode is null while process is running; non-null once exited.
      // signalCode may also be non-null on signal termination.
      // For injected fake procs in tests these may be undefined — treat undefined as null.
      const exitCode = (proc as ChildProcess & { exitCode: number | null | undefined }).exitCode;
      const signalCode = (proc as ChildProcess & { signalCode: string | null | undefined })
        .signalCode;
      if (exitCode != null || signalCode != null) return;
      try {
        proc.kill(signal);
      } catch {
        /* already dead */
      }
      await new Promise<void>((resolve) => {
        // Re-check in case process exited between the guard above and here.
        const ec = (proc as ChildProcess & { exitCode: number | null | undefined }).exitCode;
        const sc = (proc as ChildProcess & { signalCode: string | null | undefined }).signalCode;
        if (ec != null || sc != null) return resolve();
        proc.once('exit', () => resolve());
      });
    },
    onCrash(cb) {
      // Deliver immediately if the process already crashed before this
      // subscriber registered (race with a fast post-ready crash).
      if (pendingCrash) {
        cb(pendingCrash);
        return;
      }
      crashCallbacks.push(cb);
    },
  };
}

function buildArgs(opts: SpawnServerOptions): string[] {
  const args = [
    '-m',
    opts.modelPath,
    '--host',
    '127.0.0.1',
    '--port',
    String(opts.port),
    '-c',
    String(opts.nCtx),
    '-ngl',
    String(opts.nGpuLayers),
    '-b',
    String(opts.nBatch),
    '-t',
    String(opts.nThreads),
  ];
  if (opts.flashAttention) args.push('--flash-attn');
  if (opts.mmap === false) args.push('--no-mmap');
  if (opts.mlock) args.push('--mlock');
  return args;
}

/**
 * Resolves/rejects on the first of:
 *   (a) isReady() returns true → resolves
 *   (b) proc emits 'error' (e.g. ENOENT — bad binary path) → rejects immediately
 *       with the spawn error, instead of waiting out the full timeout
 *   (c) proc emits 'exit' before ready → rejects with server-spawn-failed
 *       (unless the ready-line landed in the same tick — ready wins)
 *   (d) timeoutMs elapses without ready → kills proc, rejects
 *
 * Timer/listener-leak safety: `settle()` runs once (guarded by `settled`),
 * clears BOTH timers, and removes the 'exit'/'error' listeners it registered.
 */
function waitForReadyOrExit(
  proc: ChildProcess,
  isReady: () => boolean,
  stderrSnap: () => string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const rejectSpawnFailed = (exitCode: number | null, extra = '') =>
      reject(
        new ServerLifecycleError({
          kind: 'server-spawn-failed',
          exitCode,
          stderr: `${stderrSnap()}${extra}`,
        }),
      );

    const onExit = (code: number | null) => {
      // Ready-line may have landed in the same tick as exit — ready wins.
      if (isReady()) settle(() => resolve());
      else settle(() => rejectSpawnFailed(code));
    };
    const onError = (err: Error) => {
      // Spawn-level failure (ENOENT, EACCES). Surface it now, don't time out.
      settle(() => rejectSpawnFailed(null, err.message));
    };

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearInterval(interval);
      clearTimeout(timeoutHandle);
      proc.removeListener('exit', onExit);
      proc.removeListener('error', onError);
      fn();
    };

    proc.on('exit', onExit);
    proc.on('error', onError);

    const interval = setInterval(() => {
      if (isReady()) settle(() => resolve());
    }, 50);

    const timeoutHandle = setTimeout(() => {
      settle(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          /* already dead */
        }
        rejectSpawnFailed(null);
      });
    }, timeoutMs);
  });
}
