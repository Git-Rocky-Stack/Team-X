import type { BenchmarkResult } from '@team-x/shared-types';
import type { IpcMain } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import type { BenchmarkService } from '../services/local-gguf/benchmark-service.js';

import {
  LOCAL_GGUF_BENCHMARK_CHANNELS,
  registerLocalGgufBenchmarkHandlers,
} from './local-gguf-benchmark-handlers.js';

function makeFakeIpc() {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  const ipc = {
    handle(channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) {
      handlers.set(channel, fn);
    },
  } as unknown as IpcMain;
  return {
    ipc,
    channels: () => [...handlers.keys()],
    invoke: (channel: string, ...args: unknown[]) => {
      const fn = handlers.get(channel);
      if (!fn) throw new Error(`no handler for ${channel}`);
      return fn({}, ...args);
    },
  };
}

function makeFakeBenchmarks() {
  const sentinels = {
    run: { id: 'bench-1', modelId: 'model-1' } as unknown as BenchmarkResult,
    history: [{ id: 'bench-1' }] as unknown as BenchmarkResult[],
  };
  const benchmark = {
    run: vi.fn().mockResolvedValue(sentinels.run),
    history: vi.fn().mockResolvedValue(sentinels.history),
  } satisfies Record<keyof BenchmarkService, ReturnType<typeof vi.fn>>;
  return { benchmark: benchmark as unknown as BenchmarkService, mocks: benchmark, sentinels };
}

describe('localGguf benchmark IPC handlers (Phase 10 — BenchmarkService delegations)', () => {
  it('registers every benchmark channel exactly once', () => {
    const f = makeFakeIpc();
    const { benchmark } = makeFakeBenchmarks();
    registerLocalGgufBenchmarkHandlers(f.ipc, { benchmark });

    expect(f.channels().sort()).toEqual([...LOCAL_GGUF_BENCHMARK_CHANNELS].sort());
    expect(f.channels()).toHaveLength(2);
  });

  it('benchmark.run forwards the model id and returns the stored result', async () => {
    const f = makeFakeIpc();
    const { benchmark, mocks, sentinels } = makeFakeBenchmarks();
    registerLocalGgufBenchmarkHandlers(f.ipc, { benchmark });

    await expect(f.invoke('localGguf.benchmark.run', 'model-1')).resolves.toBe(sentinels.run);
    expect(mocks.run).toHaveBeenCalledWith('model-1');
  });

  it('benchmark.history forwards the model id', async () => {
    const f = makeFakeIpc();
    const { benchmark, mocks, sentinels } = makeFakeBenchmarks();
    registerLocalGgufBenchmarkHandlers(f.ipc, { benchmark });

    await expect(f.invoke('localGguf.benchmark.history', 'model-1')).resolves.toBe(
      sentinels.history,
    );
    expect(mocks.history).toHaveBeenCalledWith('model-1');
  });

  it('surfaces a refusal from the service rather than swallowing it', async () => {
    const f = makeFakeIpc();
    const { benchmark, mocks } = makeFakeBenchmarks();
    mocks.run.mockRejectedValueOnce(new Error('llama-server returned no timings'));
    registerLocalGgufBenchmarkHandlers(f.ipc, { benchmark });

    await expect(f.invoke('localGguf.benchmark.run', 'model-1')).rejects.toThrow(/timings/);
  });

  it('no handler answers with the Phase 1 not-implemented error any more', async () => {
    const f = makeFakeIpc();
    const { benchmark } = makeFakeBenchmarks();
    registerLocalGgufBenchmarkHandlers(f.ipc, { benchmark });

    for (const channel of LOCAL_GGUF_BENCHMARK_CHANNELS) {
      await expect(f.invoke(channel, 'model-1')).resolves.not.toThrow();
    }
  });
});
