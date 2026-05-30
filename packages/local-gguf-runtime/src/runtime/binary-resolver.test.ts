// packages/local-gguf-runtime/src/runtime/binary-resolver.test.ts
import { describe, expect, it } from 'vitest';
import { BinaryResolverError, resolveBinaryPath } from './binary-resolver';

describe('resolveBinaryPath', () => {
  it('returns the correct path for win32-x64 CUDA', () => {
    const result = resolveBinaryPath({
      platform: 'win32',
      arch: 'x64',
      backend: 'cuda',
      resourcesRoot: 'C:/app/resources',
      fileExists: (p) => p === 'C:/app/resources/llama-server/win32-x64/cuda/server.exe',
    });
    expect(result).toBe('C:/app/resources/llama-server/win32-x64/cuda/server.exe');
  });

  it('returns the correct path for linux-x64 Vulkan', () => {
    const result = resolveBinaryPath({
      platform: 'linux',
      arch: 'x64',
      backend: 'vulkan',
      resourcesRoot: '/app/resources',
      fileExists: (p) => p === '/app/resources/llama-server/linux-x64/vulkan/server',
    });
    expect(result).toBe('/app/resources/llama-server/linux-x64/vulkan/server');
  });

  it('returns the correct path for darwin-arm64 Metal', () => {
    const result = resolveBinaryPath({
      platform: 'darwin',
      arch: 'arm64',
      backend: 'metal',
      resourcesRoot: '/app/resources',
      fileExists: (p) => p === '/app/resources/llama-server/darwin-arm64/metal/server',
    });
    expect(result).toBe('/app/resources/llama-server/darwin-arm64/metal/server');
  });

  it('throws BinaryResolverError(binary-not-found) when the path does not exist', () => {
    expect(() =>
      resolveBinaryPath({
        platform: 'linux',
        arch: 'x64',
        backend: 'rocm',
        resourcesRoot: '/app/resources',
        fileExists: () => false,
      }),
    ).toThrowError(BinaryResolverError);
  });

  it('throws BinaryResolverError with kind binary-not-found and the attempted path', () => {
    try {
      resolveBinaryPath({
        platform: 'linux',
        arch: 'x64',
        backend: 'rocm',
        resourcesRoot: '/app/resources',
        fileExists: () => false,
      });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(BinaryResolverError);
      expect((e as BinaryResolverError).error.kind).toBe('binary-not-found');
      expect((e as BinaryResolverError).error.path).toBe(
        '/app/resources/llama-server/linux-x64/rocm/server',
      );
    }
  });

  it('throws BinaryResolverError(binary-unsupported) for unsupported platform+backend', () => {
    try {
      resolveBinaryPath({
        platform: 'darwin',
        arch: 'arm64',
        backend: 'cuda',
        resourcesRoot: '/app/resources',
        fileExists: () => true,
      });
      throw new Error('expected throw');
    } catch (e) {
      expect((e as BinaryResolverError).error.kind).toBe('binary-unsupported');
    }
  });

  it('handles win32-arm64 backends correctly (vulkan + cpu only)', () => {
    expect(() =>
      resolveBinaryPath({
        platform: 'win32',
        arch: 'arm64',
        backend: 'cuda',
        resourcesRoot: 'C:/r',
        fileExists: () => true,
      }),
    ).toThrowError(/unsupported/i);

    const ok = resolveBinaryPath({
      platform: 'win32',
      arch: 'arm64',
      backend: 'vulkan',
      resourcesRoot: 'C:/r',
      fileExists: (p) => p === 'C:/r/llama-server/win32-arm64/vulkan/server.exe',
    });
    expect(ok).toBe('C:/r/llama-server/win32-arm64/vulkan/server.exe');
  });
});
