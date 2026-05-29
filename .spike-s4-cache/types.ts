import type { ChildProcess } from 'node:child_process';

export type LlamaBackend = 'cpu' | 'cuda' | 'rocm' | 'vulkan' | 'metal';

export type ServerCrashReason =
  | 'spawn-error'
  | 'model-load-failed'
  | 'port-bind-failed'
  | 'ready-timeout'
  | 'oom'
  | 'manual-stop'
  | 'unknown';

export interface ServerCrashInfo {
  readonly reason: ServerCrashReason;
  readonly exitCode: number | null;
  readonly exitSignal: NodeJS.Signals | null;
  readonly stderrTail: string;
  readonly matchedPattern: string | null;
  readonly uptimeMs: number;
}

export interface ServerHandle {
  readonly port: number;
  readonly pid: number;
  readonly baseUrl: string;
  readonly binaryTag: string;
  readonly backend: LlamaBackend;
  readonly readyMs: number;
  waitReady(timeoutMs: number): Promise<void>;
  health(): Promise<{ ok: boolean; httpStatus: number; latencyMs: number }>;
  stop(opts?: { signal?: 'SIGTERM' | 'SIGKILL'; shutdownGraceMs?: number }): Promise<{
    exitCode: number | null;
    exitSignal: NodeJS.Signals | null;
    portReleaseMs: number;
    escalatedToSigkill: boolean;
  }>;
  onCrash(cb: (info: ServerCrashInfo) => void): () => void;
  onStdout(cb: (line: string) => void): () => void;
  onStderr(cb: (line: string) => void): () => void;
  readonly _proc: ChildProcess;
}

export interface SpawnServerOpts {
  readonly binaryPath: string;
  readonly modelPath: string;
  readonly nCtx: number;
  readonly nGpuLayers: number;
  readonly nBatch?: number;
  readonly nThreads?: number;
  readonly backend: LlamaBackend;
  readonly binaryTag: string;
  readonly portStrategy?: 'auto' | { fixed: number };
  readonly readyTimeoutMs?: number;
  readonly preflightBind?: boolean;
  readonly extraEnv?: Readonly<Record<string, string>>;
  readonly extraArgs?: ReadonlyArray<string>;
}

export declare function spawnServer(opts: SpawnServerOpts): Promise<ServerHandle>;
