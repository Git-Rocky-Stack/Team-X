// packages/local-gguf-runtime/src/pool/auto-swap.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ServerHandle } from '../runtime/server-lifecycle';
import { createAutoSwapPolicy } from './auto-swap';
import type { LoadedEntry, LruPool } from './lru-pool';

// ---------------------------------------------------------------------------
// Fake LruPool
// ---------------------------------------------------------------------------

function makeFakePool(acquireImpl: (modelId: string) => Promise<ServerHandle>): LruPool {
  return {
    acquire: vi.fn().mockImplementation(acquireImpl),
    release: vi.fn().mockResolvedValue(undefined),
    setMaxConcurrent: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue({ loaded: [] as LoadedEntry[], maxConcurrent: 2 }),
    shutdownAll: vi.fn().mockResolvedValue(undefined),
  };
}

function makeFakeHandle(port = 9500): ServerHandle {
  return {
    port,
    pid: port * 10,
    baseUrl: `http://127.0.0.1:${port}`,
    stop: vi.fn().mockResolvedValue(undefined),
    onCrash: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createAutoSwapPolicy', () => {
  it('returns a policy object with a resolveOrLoad method', () => {
    const pool = makeFakePool(async () => makeFakeHandle());
    const policy = createAutoSwapPolicy(pool);
    expect(policy).toBeDefined();
    expect(typeof policy.resolveOrLoad).toBe('function');
  });

  it('delegates resolveOrLoad to pool.acquire with the correct modelId', async () => {
    const handle = makeFakeHandle(9501);
    const pool = makeFakePool(async () => handle);
    const policy = createAutoSwapPolicy(pool);

    const result = await policy.resolveOrLoad('my-model');

    expect(pool.acquire).toHaveBeenCalledOnce();
    expect(pool.acquire).toHaveBeenCalledWith('my-model');
    expect(result).toBe(handle);
  });

  it('propagates the exact ServerHandle returned by pool.acquire', async () => {
    const handleA = makeFakeHandle(9502);
    const handleB = makeFakeHandle(9503);

    let callCount = 0;
    const pool = makeFakePool(async (_id) => {
      callCount++;
      return callCount === 1 ? handleA : handleB;
    });
    const policy = createAutoSwapPolicy(pool);

    const r1 = await policy.resolveOrLoad('model-1');
    const r2 = await policy.resolveOrLoad('model-2');

    expect(r1).toBe(handleA);
    expect(r2).toBe(handleB);
    expect(pool.acquire).toHaveBeenCalledTimes(2);
    expect(pool.acquire).toHaveBeenNthCalledWith(1, 'model-1');
    expect(pool.acquire).toHaveBeenNthCalledWith(2, 'model-2');
  });

  it('propagates rejections from pool.acquire', async () => {
    const loadError = new Error('model load failed');
    const pool = makeFakePool(async () => {
      throw loadError;
    });
    const policy = createAutoSwapPolicy(pool);

    await expect(policy.resolveOrLoad('bad-model')).rejects.toThrow('model load failed');
  });

  it('does not call any other LruPool methods', async () => {
    const handle = makeFakeHandle(9510);
    const pool = makeFakePool(async () => handle);
    const policy = createAutoSwapPolicy(pool);

    await policy.resolveOrLoad('model-isolation');

    expect(pool.release).not.toHaveBeenCalled();
    expect(pool.setMaxConcurrent).not.toHaveBeenCalled();
    expect(pool.getStatus).not.toHaveBeenCalled();
    expect(pool.shutdownAll).not.toHaveBeenCalled();
  });
});
