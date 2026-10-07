/**
 * React Query hooks for the `localGguf.*` IPC surface — the local & networked
 * GGUF model library (v3.3.0).
 *
 * Covers all twenty-six channels across five areas: `library` (models and
 * watched folders), `runtime` (GPU probe + persisted settings), `pool` (LRU
 * load / unload), `endpoint` (remote LAN servers), `hf` (Hugging Face browser
 * and its download manager), and `benchmark`.
 *
 * All hooks route through the preload bridge via `@/lib/ipc`, matching the
 * convention in `use-rag.ts` — the renderer never reaches for `window.teamx`
 * directly, so the bridge can be swapped or stubbed in one place.
 *
 * ## Cache keys
 *
 * Every key is rooted at `['local-gguf', …]` so a coarse invalidation can
 * refresh the whole subsystem, while individual panels subscribe to the narrow
 * key they actually render.
 *
 * ## Two things poll
 *
 * `pool` and `downloads` refetch on an interval because both change without
 * the renderer doing anything: the LRU pool evicts a model to make room for
 * another, and a download advances byte by byte in the main process. Every
 * other key changes only in response to a mutation and is invalidated by it.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdvancedParams, LocalGgufRuntimeSettings } from '@team-x/shared-types';

import { ipc } from '@/lib/ipc.js';

/** Pool membership changes on eviction, with no renderer action to hook. */
const POOL_POLL_MS = 4_000;
/** Fast enough that a progress bar moves smoothly; slow enough to stay cheap. */
const DOWNLOAD_POLL_MS = 1_000;

const KEYS = {
  library: ['local-gguf', 'library'] as const,
  folders: ['local-gguf', 'folders'] as const,
  model: (id: string) => ['local-gguf', 'model', id] as const,
  gpu: ['local-gguf', 'gpu'] as const,
  runtimeSettings: ['local-gguf', 'runtime-settings'] as const,
  binaries: ['local-gguf', 'binaries'] as const,
  pool: ['local-gguf', 'pool'] as const,
  endpoints: ['local-gguf', 'endpoints'] as const,
  downloads: ['local-gguf', 'downloads'] as const,
  hfSearch: (q: string, f: Record<string, unknown>) => ['local-gguf', 'hf-search', q, f] as const,
  hfCard: (repoId: string) => ['local-gguf', 'hf-card', repoId] as const,
  benchmarks: (modelId: string) => ['local-gguf', 'benchmarks', modelId] as const,
};

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

export function useLocalModels() {
  return useQuery({
    queryKey: KEYS.library,
    queryFn: () => ipc.localGguf.library.list(),
  });
}

/**
 * Registered watch folders.
 *
 * `removeFolder` and `scanFolder` both take a folder id, so without this the
 * UI had no way to reach either — the ids existed only in the database.
 */
export function useWatchFolders() {
  return useQuery({
    queryKey: KEYS.folders,
    queryFn: () => ipc.localGguf.library.listFolders(),
  });
}

export function useLocalModel(id: string | null) {
  return useQuery({
    queryKey: KEYS.model(id ?? ''),
    queryFn: () => ipc.localGguf.library.get(id as string),
    enabled: id !== null,
  });
}

export function useAddModelFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => ipc.localGguf.library.addFile(path),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.library });
    },
  });
}

export function useAddModelFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, recursive }: { path: string; recursive: boolean }) =>
      ipc.localGguf.library.addFolder(path, recursive),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.library });
      qc.invalidateQueries({ queryKey: KEYS.folders });
    },
  });
}

export function useRemoveModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ipc.localGguf.library.removeModel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.library });
      // A removed model may still have been resident in the pool.
      qc.invalidateQueries({ queryKey: KEYS.pool });
    },
  });
}

export function useRemoveFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ipc.localGguf.library.removeFolder(id),
    onSuccess: () => {
      // Dropping a folder cascades to its folder-entry models.
      qc.invalidateQueries({ queryKey: KEYS.library });
      qc.invalidateQueries({ queryKey: KEYS.folders });
      qc.invalidateQueries({ queryKey: KEYS.pool });
    },
  });
}

export function useScanFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ipc.localGguf.library.scanFolder(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.library });
      // A scan stamps the folder's status and lastScanAt.
      qc.invalidateQueries({ queryKey: KEYS.folders });
    },
  });
}

export function useSetSystemPrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, prompt }: { id: string; prompt: string | null }) =>
      ipc.localGguf.library.setSystemPrompt(id, prompt),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: KEYS.model(id) });
      qc.invalidateQueries({ queryKey: KEYS.library });
    },
  });
}

export function useSetChatTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, template }: { id: string; template: string | null }) =>
      ipc.localGguf.library.setChatTemplate(id, template),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: KEYS.model(id) });
      qc.invalidateQueries({ queryKey: KEYS.library });
    },
  });
}

export function useSetAdvancedParams() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, params }: { id: string; params: Partial<AdvancedParams> }) =>
      ipc.localGguf.library.setAdvancedParams(id, params),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: KEYS.model(id) });
    },
  });
}

export function useResetAdvanced() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ipc.localGguf.library.resetAdvanced(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: KEYS.model(id) });
    },
  });
}

// ---------------------------------------------------------------------------
// Runtime + pool
// ---------------------------------------------------------------------------

export function useGpuInventory() {
  return useQuery({
    queryKey: KEYS.gpu,
    queryFn: () => ipc.localGguf.runtime.gpuInventory(),
  });
}

export function useReprobeGpu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => ipc.localGguf.runtime.reprobeGpu(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.gpu });
      // A re-probe can change the auto-detected backend.
      qc.invalidateQueries({ queryKey: KEYS.runtimeSettings });
    },
  });
}

export function useLocalRuntimeSettings() {
  return useQuery({
    queryKey: KEYS.runtimeSettings,
    queryFn: () => ipc.localGguf.runtime.settings(),
  });
}

export function useSetLocalRuntimeSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (partial: Partial<LocalGgufRuntimeSettings>) =>
      ipc.localGguf.runtime.setSettings(partial),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.runtimeSettings });
    },
  });
}

export function useBinariesVersion() {
  return useQuery({
    queryKey: KEYS.binaries,
    queryFn: () => ipc.localGguf.runtime.binariesVersion(),
    // The bundled llama.cpp build cannot change while the app is running.
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function usePoolStatus() {
  return useQuery({
    queryKey: KEYS.pool,
    queryFn: () => ipc.localGguf.pool.status(),
    refetchInterval: POOL_POLL_MS,
  });
}

export function usePoolLoad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (modelId: string) => ipc.localGguf.pool.load(modelId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.pool });
      // Loading flips the model's status column, which the library renders.
      qc.invalidateQueries({ queryKey: KEYS.library });
    },
  });
}

export function usePoolUnload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (modelId: string) => ipc.localGguf.pool.unload(modelId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.pool });
      qc.invalidateQueries({ queryKey: KEYS.library });
    },
  });
}

export function useSetMaxConcurrent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (n: number) => ipc.localGguf.pool.setMaxConcurrent(n),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.pool });
      // Capacity is persisted in the runtime settings too.
      qc.invalidateQueries({ queryKey: KEYS.runtimeSettings });
    },
  });
}

// ---------------------------------------------------------------------------
// Remote LAN endpoints
// ---------------------------------------------------------------------------

export function useEndpoints() {
  return useQuery({
    queryKey: KEYS.endpoints,
    queryFn: () => ipc.localGguf.endpoint.list(),
  });
}

export function useAddEndpoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: { name: string; baseUrl: string; authHeaderKeyRef: string | null }) =>
      ipc.localGguf.endpoint.add(config),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.endpoints });
    },
  });
}

export function useRemoveEndpoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ipc.localGguf.endpoint.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.endpoints });
      // Deleting an endpoint cascades to its remote-endpoint models.
      qc.invalidateQueries({ queryKey: KEYS.library });
    },
  });
}

export function useTestEndpoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ipc.localGguf.endpoint.test(id),
    onSuccess: () => {
      // The probe persists its verdict on the row; re-read it.
      qc.invalidateQueries({ queryKey: KEYS.endpoints });
    },
  });
}

export function useUpdateEndpoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      partial,
    }: {
      id: string;
      partial: { name?: string; baseUrl?: string; authHeaderKeyRef?: string | null };
    }) => ipc.localGguf.endpoint.update(id, partial),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.endpoints });
    },
  });
}

// ---------------------------------------------------------------------------
// Hugging Face browser
// ---------------------------------------------------------------------------

export function useHfSearch(query: string, filters: Record<string, unknown>) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: KEYS.hfSearch(trimmed, filters),
    queryFn: () => ipc.localGguf.hf.search(trimmed, filters),
    // A blank query would ask the Hub for everything; wait for real input.
    enabled: trimmed.length > 0,
  });
}

export function useHfModelCard(repoId: string | null) {
  return useQuery({
    queryKey: KEYS.hfCard(repoId ?? ''),
    queryFn: () => ipc.localGguf.hf.modelCard(repoId as string),
    enabled: repoId !== null,
  });
}

export function useActiveDownloads() {
  return useQuery({
    queryKey: KEYS.downloads,
    queryFn: () => ipc.localGguf.hf.activeDownloads(),
    refetchInterval: DOWNLOAD_POLL_MS,
  });
}

export function useStartDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      repoId,
      filename,
      targetFolder,
    }: {
      repoId: string;
      filename: string;
      targetFolder: string;
    }) => ipc.localGguf.hf.startDownload(repoId, filename, targetFolder),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.downloads });
      // A finished download lands a real .gguf in a watched folder, so the
      // library can gain a row without any further user action.
      qc.invalidateQueries({ queryKey: KEYS.library });
    },
  });
}

export function usePauseDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (handleId: string) => ipc.localGguf.hf.pauseDownload(handleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.downloads });
    },
  });
}

export function useResumeDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (handleId: string) => ipc.localGguf.hf.resumeDownload(handleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.downloads });
    },
  });
}

export function useCancelDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (handleId: string) => ipc.localGguf.hf.cancelDownload(handleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.downloads });
    },
  });
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

export function useBenchmarkHistory(modelId: string | null) {
  return useQuery({
    queryKey: KEYS.benchmarks(modelId ?? ''),
    queryFn: () => ipc.localGguf.benchmark.history(modelId as string),
    enabled: modelId !== null,
  });
}

export function useRunBenchmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (modelId: string) => ipc.localGguf.benchmark.run(modelId),
    onSuccess: (_data, modelId) => {
      qc.invalidateQueries({ queryKey: KEYS.benchmarks(modelId) });
      // A run loads the model through the pool as a side effect.
      qc.invalidateQueries({ queryKey: KEYS.pool });
    },
  });
}
