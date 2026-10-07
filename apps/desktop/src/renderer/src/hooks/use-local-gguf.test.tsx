/**
 * React Query hooks for the `localGguf.*` bridge — behaviour specs.
 *
 * These drive real hooks against a stubbed preload bridge (`window.teamx`),
 * which is what `lib/ipc.ts`'s lazy Proxy resolves against. Assertions are on
 * what the hook returns and which caches it invalidates — never on "the mock
 * was called" alone, except where forwarding the exact argument shape to the
 * main process IS the behaviour under test.
 *
 * Cache invalidation gets heavy coverage because it is the part that fails
 * silently: a mutation that forgets to invalidate leaves the panel showing
 * stale data with no error anywhere, which is indistinguishable from the write
 * not having happened.
 *
 * @vitest-environment jsdom
 */
import '@/components/console/test-setup';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useActiveDownloads,
  useAddEndpoint,
  useAddModelFile,
  useAddModelFolder,
  useBenchmarkHistory,
  useBinariesVersion,
  useCancelDownload,
  useEndpoints,
  useGpuInventory,
  useHfModelCard,
  useHfSearch,
  useLocalModel,
  useLocalModels,
  useLocalRuntimeSettings,
  usePauseDownload,
  usePoolLoad,
  usePoolStatus,
  usePoolUnload,
  useRemoveEndpoint,
  useRemoveFolder,
  useRemoveModel,
  useReprobeGpu,
  useResetAdvanced,
  useResumeDownload,
  useRunBenchmark,
  useScanFolder,
  useSetAdvancedParams,
  useSetChatTemplate,
  useSetLocalRuntimeSettings,
  useSetMaxConcurrent,
  useSetSystemPrompt,
  useStartDownload,
  useTestEndpoint,
  useUpdateEndpoint,
  useWatchFolders,
} from './use-local-gguf.js';

// ---------------------------------------------------------------------------
// Bridge stub
// ---------------------------------------------------------------------------

function makeBridge() {
  return {
    library: {
      list: vi.fn().mockResolvedValue([{ id: 'm1', displayName: 'Qwen3 8B' }]),
      get: vi.fn().mockResolvedValue({ id: 'm1', displayName: 'Qwen3 8B' }),
      addFile: vi.fn().mockResolvedValue({ id: 'm2' }),
      addFolder: vi.fn().mockResolvedValue({ id: 'f1' }),
      listFolders: vi.fn().mockResolvedValue([{ id: 'f1', path: 'D:/models' }]),
      removeModel: vi.fn().mockResolvedValue(undefined),
      removeFolder: vi.fn().mockResolvedValue(undefined),
      scanFolder: vi.fn().mockResolvedValue({ addedCount: 2, removedCount: 0 }),
      setSystemPrompt: vi.fn().mockResolvedValue({ id: 'm1' }),
      setChatTemplate: vi.fn().mockResolvedValue({ id: 'm1' }),
      setAdvancedParams: vi.fn().mockResolvedValue({ modelId: 'm1' }),
      resetAdvanced: vi.fn().mockResolvedValue({ modelId: 'm1' }),
      listBySourceType: vi.fn().mockResolvedValue([]),
    },
    runtime: {
      gpuInventory: vi.fn().mockResolvedValue({ cpu: { cores: 16, ramMb: 65536 } }),
      reprobeGpu: vi.fn().mockResolvedValue({ cpu: { cores: 16, ramMb: 65536 } }),
      settings: vi.fn().mockResolvedValue({ activeBackend: 'cuda' }),
      setSettings: vi.fn().mockResolvedValue({ activeBackend: 'vulkan' }),
      binariesVersion: vi.fn().mockResolvedValue('b9371'),
    },
    pool: {
      status: vi.fn().mockResolvedValue({ loaded: [], maxConcurrent: 1 }),
      load: vi.fn().mockResolvedValue({ modelId: 'm1', baseUrl: 'http://127.0.0.1:1', pid: 1 }),
      unload: vi.fn().mockResolvedValue(undefined),
      setMaxConcurrent: vi.fn().mockResolvedValue(undefined),
    },
    endpoint: {
      list: vi.fn().mockResolvedValue([{ id: 'ep-1', name: 'Bench' }]),
      add: vi.fn().mockResolvedValue({ id: 'ep-2' }),
      remove: vi.fn().mockResolvedValue(undefined),
      test: vi.fn().mockResolvedValue({ reachable: true, latencyMs: 12 }),
      update: vi.fn().mockResolvedValue({ id: 'ep-1' }),
    },
    hf: {
      search: vi.fn().mockResolvedValue([{ repoId: 'Qwen/Qwen3-8B-GGUF' }]),
      modelCard: vi.fn().mockResolvedValue({ repoId: 'Qwen/Qwen3-8B-GGUF', siblings: [] }),
      startDownload: vi.fn().mockResolvedValue({ handleId: 'dl-1' }),
      pauseDownload: vi.fn().mockResolvedValue(undefined),
      resumeDownload: vi.fn().mockResolvedValue(undefined),
      cancelDownload: vi.fn().mockResolvedValue(undefined),
      activeDownloads: vi.fn().mockResolvedValue([{ handleId: 'dl-1', state: 'downloading' }]),
    },
    benchmark: {
      run: vi.fn().mockResolvedValue({ id: 'b1', modelId: 'm1' }),
      history: vi.fn().mockResolvedValue([{ id: 'b1' }]),
    },
  };
}

let bridge: ReturnType<typeof makeBridge>;
let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  bridge = makeBridge();
  (window as unknown as { teamx: unknown }).teamx = { localGguf: bridge };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

/** Run a mutation and wait for it to settle. */
async function runMutation<TArgs>(
  hook: () => { mutate: (args: TArgs) => void; isSuccess: boolean },
  args: TArgs,
) {
  const { result } = renderHook(hook, { wrapper });
  result.current.mutate(args);
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  return result;
}

// ===========================================================================
// Queries
// ===========================================================================

describe('use-local-gguf — library queries', () => {
  it('useLocalModels returns the library list from the bridge', async () => {
    const { result } = renderHook(() => useLocalModels(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'm1', displayName: 'Qwen3 8B' }]);
  });

  it('useLocalModel fetches one model by id', async () => {
    const { result } = renderHook(() => useLocalModel('m1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(bridge.library.get).toHaveBeenCalledWith('m1');
  });

  it('useLocalModel stays idle with no selection instead of fetching a null id', async () => {
    const { result } = renderHook(() => useLocalModel(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(bridge.library.get).not.toHaveBeenCalled();
  });
});

describe('use-local-gguf — watch folders', () => {
  it('useWatchFolders returns the registered folders', async () => {
    const { result } = renderHook(() => useWatchFolders(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'f1', path: 'D:/models' }]);
  });

  it('adding a folder refreshes the folder list as well as the library', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries');
    await runMutation(() => useAddModelFolder(), { path: 'D:/m', recursive: true });
    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(['local-gguf', 'folders']));
  });

  it('removing a folder refreshes the folder list and the library', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries');
    await runMutation(() => useRemoveFolder(), 'f1');
    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(['local-gguf', 'folders']));
    expect(keys).toContain(JSON.stringify(['local-gguf', 'library']));
  });

  it('scanning a folder refreshes the folder list, since the scan stamps its status', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries');
    await runMutation(() => useScanFolder(), 'f1');
    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(['local-gguf', 'folders']));
  });
});

describe('use-local-gguf — runtime and pool queries', () => {
  it('useGpuInventory returns the probed inventory', async () => {
    const { result } = renderHook(() => useGpuInventory(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ cpu: { cores: 16, ramMb: 65536 } });
  });

  it('useLocalRuntimeSettings returns the persisted settings', async () => {
    const { result } = renderHook(() => useLocalRuntimeSettings(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ activeBackend: 'cuda' });
  });

  it('useBinariesVersion returns the bundled llama.cpp build', async () => {
    const { result } = renderHook(() => useBinariesVersion(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe('b9371');
  });

  it('usePoolStatus refetches on its own, because eviction happens without the UI acting', async () => {
    // Asserts the refetch actually happens rather than that an option is set —
    // a config assertion passes even if the option is one react-query ignores.
    vi.useFakeTimers();
    try {
      renderHook(() => usePoolStatus(), { wrapper });
      await vi.advanceTimersByTimeAsync(0);
      expect(bridge.pool.status).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(10_000);
      expect(bridge.pool.status.mock.calls.length).toBeGreaterThan(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('use-local-gguf — endpoint, HF and benchmark queries', () => {
  it('useEndpoints returns the endpoint list', async () => {
    const { result } = renderHook(() => useEndpoints(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'ep-1', name: 'Bench' }]);
  });

  it('useHfSearch forwards the query and filters', async () => {
    const filters = { author: 'bartowski' };
    const { result } = renderHook(() => useHfSearch('qwen3', filters), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(bridge.hf.search).toHaveBeenCalledWith('qwen3', filters);
  });

  it('useHfSearch does not fire for a blank query', () => {
    const { result } = renderHook(() => useHfSearch('   ', {}), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(bridge.hf.search).not.toHaveBeenCalled();
  });

  it('useHfModelCard stays idle until a repo is selected', () => {
    const { result } = renderHook(() => useHfModelCard(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(bridge.hf.modelCard).not.toHaveBeenCalled();
  });

  it('useActiveDownloads refetches so progress advances without user input', async () => {
    vi.useFakeTimers();
    try {
      renderHook(() => useActiveDownloads(), { wrapper });
      await vi.advanceTimersByTimeAsync(0);
      expect(bridge.hf.activeDownloads).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(5_000);
      expect(bridge.hf.activeDownloads.mock.calls.length).toBeGreaterThan(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('useBenchmarkHistory scopes to the model and stays idle without one', async () => {
    const { result } = renderHook(() => useBenchmarkHistory('m1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(bridge.benchmark.history).toHaveBeenCalledWith('m1');

    const idle = renderHook(() => useBenchmarkHistory(null), { wrapper });
    expect(idle.result.current.fetchStatus).toBe('idle');
  });
});

// ===========================================================================
// Mutations — argument forwarding
// ===========================================================================

describe('use-local-gguf — mutations forward their arguments', () => {
  it('useAddModelFile passes the chosen path', async () => {
    await runMutation(() => useAddModelFile(), 'D:/models/a.gguf');
    expect(bridge.library.addFile).toHaveBeenCalledWith('D:/models/a.gguf');
  });

  it('useAddModelFolder passes the path and the recursive flag', async () => {
    await runMutation(() => useAddModelFolder(), { path: 'D:/models', recursive: true });
    expect(bridge.library.addFolder).toHaveBeenCalledWith('D:/models', true);
  });

  it('useSetSystemPrompt passes the id and the prompt, including a null clear', async () => {
    await runMutation(() => useSetSystemPrompt(), { id: 'm1', prompt: null });
    expect(bridge.library.setSystemPrompt).toHaveBeenCalledWith('m1', null);
  });

  it('useSetChatTemplate passes the id and the template', async () => {
    await runMutation(() => useSetChatTemplate(), { id: 'm1', template: '{{ msg }}' });
    expect(bridge.library.setChatTemplate).toHaveBeenCalledWith('m1', '{{ msg }}');
  });

  it('useSetAdvancedParams passes a partial patch', async () => {
    await runMutation(() => useSetAdvancedParams(), { id: 'm1', params: { nCtx: 4096 } });
    expect(bridge.library.setAdvancedParams).toHaveBeenCalledWith('m1', { nCtx: 4096 });
  });

  it('useSetMaxConcurrent passes the new capacity', async () => {
    await runMutation(() => useSetMaxConcurrent(), 3);
    expect(bridge.pool.setMaxConcurrent).toHaveBeenCalledWith(3);
  });

  it('useAddEndpoint passes the whole config object', async () => {
    const config = { name: 'Bench', baseUrl: 'http://10.0.0.2:1234', authHeaderKeyRef: null };
    await runMutation(() => useAddEndpoint(), config);
    expect(bridge.endpoint.add).toHaveBeenCalledWith(config);
  });

  it('useUpdateEndpoint passes the id and the partial separately', async () => {
    await runMutation(() => useUpdateEndpoint(), { id: 'ep-1', partial: { name: 'Renamed' } });
    expect(bridge.endpoint.update).toHaveBeenCalledWith('ep-1', { name: 'Renamed' });
  });

  it('useStartDownload passes the repo, filename and target folder', async () => {
    await runMutation(() => useStartDownload(), {
      repoId: 'Qwen/Qwen3-8B-GGUF',
      filename: 'model.gguf',
      targetFolder: 'D:/models',
    });
    expect(bridge.hf.startDownload).toHaveBeenCalledWith(
      'Qwen/Qwen3-8B-GGUF',
      'model.gguf',
      'D:/models',
    );
  });
});

// ===========================================================================
// Mutations — cache invalidation
// ===========================================================================

describe('use-local-gguf — mutations refresh the caches they affect', () => {
  /** Assert a mutation invalidated every one of `keys`. */
  async function expectInvalidates<TArgs>(
    hook: () => { mutate: (a: TArgs) => void; isSuccess: boolean },
    args: TArgs,
    keys: string[][],
  ) {
    const spy = vi.spyOn(client, 'invalidateQueries');
    await runMutation(hook, args);
    const invalidated = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    for (const key of keys) {
      expect(invalidated).toContain(JSON.stringify(key));
    }
  }

  it('adding a model refreshes the library', async () => {
    await expectInvalidates(() => useAddModelFile(), 'D:/a.gguf', [['local-gguf', 'library']]);
  });

  it('removing a model refreshes the library and the pool', async () => {
    // A removed model may still be resident, so the pool view is stale too.
    await expectInvalidates(() => useRemoveModel(), 'm1', [
      ['local-gguf', 'library'],
      ['local-gguf', 'pool'],
    ]);
  });

  it('scanning a folder refreshes the library', async () => {
    await expectInvalidates(() => useScanFolder(), 'f1', [['local-gguf', 'library']]);
  });

  it('resetting advanced params refreshes that model', async () => {
    await expectInvalidates(() => useResetAdvanced(), 'm1', [['local-gguf', 'model', 'm1']]);
  });

  it('re-probing the GPU refreshes the inventory', async () => {
    await expectInvalidates(() => useReprobeGpu(), undefined, [['local-gguf', 'gpu']]);
  });

  it('changing runtime settings refreshes the settings', async () => {
    await expectInvalidates(() => useSetLocalRuntimeSettings(), { activeBackend: 'vulkan' }, [
      ['local-gguf', 'runtime-settings'],
    ]);
  });

  it('loading a model refreshes the pool and the library status', async () => {
    await expectInvalidates(() => usePoolLoad(), 'm1', [
      ['local-gguf', 'pool'],
      ['local-gguf', 'library'],
    ]);
  });

  it('unloading a model refreshes the pool and the library status', async () => {
    await expectInvalidates(() => usePoolUnload(), 'm1', [
      ['local-gguf', 'pool'],
      ['local-gguf', 'library'],
    ]);
  });

  it('adding an endpoint refreshes the endpoint list', async () => {
    await expectInvalidates(
      () => useAddEndpoint(),
      { name: 'A', baseUrl: 'http://10.0.0.1:1234', authHeaderKeyRef: null },
      [['local-gguf', 'endpoints']],
    );
  });

  it('removing an endpoint refreshes the endpoint list and the library', async () => {
    // Removing an endpoint cascades to its remote-endpoint models.
    await expectInvalidates(() => useRemoveEndpoint(), 'ep-1', [
      ['local-gguf', 'endpoints'],
      ['local-gguf', 'library'],
    ]);
  });

  it('probing an endpoint refreshes the list so the stored verdict shows', async () => {
    await expectInvalidates(() => useTestEndpoint(), 'ep-1', [['local-gguf', 'endpoints']]);
  });

  it.each([
    ['pause', () => usePauseDownload()],
    ['resume', () => useResumeDownload()],
    ['cancel', () => useCancelDownload()],
  ])('%s refreshes the download list', async (_label, hook) => {
    await expectInvalidates(hook as never, 'dl-1' as never, [['local-gguf', 'downloads']]);
  });

  it('starting a download refreshes the download list', async () => {
    await expectInvalidates(
      () => useStartDownload(),
      { repoId: 'a/b', filename: 'm.gguf', targetFolder: 'D:/models' },
      [['local-gguf', 'downloads']],
    );
  });

  it('running a benchmark refreshes that model’s history', async () => {
    await expectInvalidates(() => useRunBenchmark(), 'm1', [['local-gguf', 'benchmarks', 'm1']]);
  });

  it('a completed download refreshes the library, since the file is now scannable', async () => {
    await expectInvalidates(
      () => useStartDownload(),
      { repoId: 'a/b', filename: 'm.gguf', targetFolder: 'D:/models' },
      [['local-gguf', 'library']],
    );
  });
});

describe('use-local-gguf — failures surface', () => {
  it('a rejected mutation reports the error rather than resolving quietly', async () => {
    bridge.library.addFile.mockRejectedValueOnce(new Error('gguf-parse-failed'));
    const { result } = renderHook(() => useAddModelFile(), { wrapper });
    result.current.mutate('D:/broken.gguf');
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('gguf-parse-failed'));
  });

  it('a rejected query reports the error', async () => {
    bridge.runtime.gpuInventory.mockRejectedValueOnce(new Error('gpu-probe-failed'));
    const { result } = renderHook(() => useGpuInventory(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
