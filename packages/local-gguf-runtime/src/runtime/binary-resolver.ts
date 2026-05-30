// packages/local-gguf-runtime/src/runtime/binary-resolver.ts
import type { GpuBackend, LocalGgufError } from '@team-x/shared-types';

export class BinaryResolverError extends Error {
  constructor(public readonly error: LocalGgufError) {
    super(`BinaryResolverError: ${JSON.stringify(error)}`);
    this.name = 'BinaryResolverError';
  }
}

export interface ResolveBinaryOptions {
  platform: NodeJS.Platform;
  arch: 'x64' | 'arm64';
  backend: GpuBackend;
  resourcesRoot: string;
  fileExists: (path: string) => boolean;
}

const SUPPORTED: Record<string, GpuBackend[]> = {
  'win32-x64': ['cuda', 'rocm', 'vulkan', 'cpu'],
  'win32-arm64': ['vulkan', 'cpu'],
  'linux-x64': ['cuda', 'rocm', 'vulkan', 'cpu'],
  'darwin-arm64': ['metal'],
  'darwin-x64': ['metal'],
};

export function resolveBinaryPath(opts: ResolveBinaryOptions): string {
  const platformKey = `${opts.platform}-${opts.arch}`;
  const supported = SUPPORTED[platformKey];
  if (!supported || !supported.includes(opts.backend)) {
    throw new BinaryResolverError({
      kind: 'binary-unsupported',
      backend: opts.backend,
      osVersion: platformKey,
    });
  }
  const binaryName = opts.platform === 'win32' ? 'server.exe' : 'server';
  // Normalize backslashes so a Windows-native resourcesRoot (e.g.
  // "C:\\app\\resources" from app.getAppPath()) yields a consistent
  // forward-slash path rather than a mixed-separator one.
  const root = opts.resourcesRoot.replace(/\\/g, '/');
  const path = `${root}/llama-server/${platformKey}/${opts.backend}/${binaryName}`;
  if (!opts.fileExists(path)) {
    throw new BinaryResolverError({
      kind: 'binary-not-found',
      backend: opts.backend,
      path,
    });
  }
  return path;
}
