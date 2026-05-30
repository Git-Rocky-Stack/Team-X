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
const READY_LINE_REGEX = /HTTP server listening/i;

export async function spawnServer(opts: SpawnServerOptions): Promise<ServerHandle> {
  const spawnFn = opts.spawnFn ?? nodeSpawn;
  const args = buildArgs(opts);

  const proc = spawnFn(opts.binaryPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  }) as ChildProcess;

  let stderrBuf = '';
  let stdoutBuf = '';
  let ready = false;

  proc.stdout?.on('data', (d: Buffer) => {
    const s = d.toString();
    stdoutBuf += s;
    if (opts.onLog) opts.onLog(s, 'stdout');
    if (READY_LINE_REGEX.test(stdoutBuf)) ready = true;
  });
  proc.stderr?.on('data', (d: Buffer) => {
    const s = d.toString();
    stderrBuf += s;
    if (opts.onLog) opts.onLog(s, 'stderr');
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

  proc.on('exit', (code) => {
    if (!stopped) {
      const info = { exitCode: code, stderr: stderrBuf };
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
 * Polls until:
 *   (a) isReady() returns true → resolves
 *   (b) proc emits 'exit' before ready → rejects with server-spawn-failed
 *   (c) timeoutMs elapses without ready → kills proc, rejects
 *
 * Timer-leak safety: every resolve/reject path clears BOTH the interval AND
 * the outer timeout. A single `settled` flag prevents double-rejection from
 * the interval and timeout racing each other.
 */
function waitForReadyOrExit(
  proc: ChildProcess,
  isReady: () => boolean,
  stderrSnap: () => string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let exitCode: number | null = null;
    let exited = false;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearInterval(interval);
      clearTimeout(timeoutHandle);
      fn();
    };

    proc.on('exit', (code) => {
      exitCode = code;
      exited = true;
    });

    const interval = setInterval(() => {
      if (isReady()) {
        settle(() => resolve());
      } else if (exited) {
        settle(() =>
          reject(
            new ServerLifecycleError({
              kind: 'server-spawn-failed',
              exitCode,
              stderr: stderrSnap(),
            }),
          ),
        );
      }
    }, 50);

    const timeoutHandle = setTimeout(() => {
      settle(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          /* already dead */
        }
        reject(
          new ServerLifecycleError({
            kind: 'server-spawn-failed',
            exitCode: null,
            stderr: stderrSnap(),
          }),
        );
      });
    }, timeoutMs);
  });
}
