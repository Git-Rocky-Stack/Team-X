/**
 * Typed accessor for the `localGguf.*` settings namespace, layered on top of
 * the app's existing key-value settings store (v3.3.0 local GGUF support,
 * spec § 7 runtime settings).
 *
 * The accessor depends only on a tiny `LocalGgufSettingsStore` interface
 * (get/set by string key), not on the concrete settings repo. Phase 2 wires
 * the real store by adapting the settings repo's getRaw/set with JSON
 * (de)serialization. Phase 1 unit-tests it against an in-memory map.
 *
 * Each field of LocalGgufRuntimeSettings persists under a `localGguf.<key>`
 * entry; reads overlay persisted values on DEFAULT_LOCAL_GGUF_SETTINGS so a
 * partially-written store still returns a complete, valid settings object.
 */

import type { GpuBackend, LocalGgufRuntimeSettings } from '@team-x/shared-types';

export interface LocalGgufSettingsStore {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
}

export interface LocalGgufSettingsAccessor {
  get(): LocalGgufRuntimeSettings;
  updateBackend(backend: GpuBackend, autoDetected: boolean): void;
  recordFallback(backend: GpuBackend, reason: string): void;
  setMaxConcurrent(n: number): void;
  setDefaultLibraryFolder(path: string | null): void;
  setEmbeddingModelId(id: string | null): void;
  setHfTokenKeyRef(ref: string | null): void;
  setLlamaBinariesVersion(version: string): void;
}

export const DEFAULT_LOCAL_GGUF_SETTINGS: LocalGgufRuntimeSettings = {
  activeBackend: 'cpu',
  activeBackendIsAutoDetected: true,
  autoFallbackReason: null,
  maxConcurrentLocalModels: 1,
  defaultLibraryFolder: null,
  embeddingModelId: null,
  hfTokenKeyRef: null,
  llamaBinariesVersion: 'unknown',
};

const KEYS = {
  activeBackend: 'localGguf.activeBackend',
  activeBackendIsAutoDetected: 'localGguf.activeBackendIsAutoDetected',
  autoFallbackReason: 'localGguf.autoFallbackReason',
  maxConcurrentLocalModels: 'localGguf.maxConcurrentLocalModels',
  defaultLibraryFolder: 'localGguf.defaultLibraryFolder',
  embeddingModelId: 'localGguf.embeddingModelId',
  hfTokenKeyRef: 'localGguf.hfTokenKeyRef',
  llamaBinariesVersion: 'localGguf.llamaBinariesVersion',
} as const;

export function createLocalGgufSettingsAccessor(
  store: LocalGgufSettingsStore,
): LocalGgufSettingsAccessor {
  return {
    get(): LocalGgufRuntimeSettings {
      return {
        activeBackend:
          store.get<GpuBackend>(KEYS.activeBackend) ?? DEFAULT_LOCAL_GGUF_SETTINGS.activeBackend,
        activeBackendIsAutoDetected:
          store.get<boolean>(KEYS.activeBackendIsAutoDetected) ??
          DEFAULT_LOCAL_GGUF_SETTINGS.activeBackendIsAutoDetected,
        autoFallbackReason:
          store.get<string | null>(KEYS.autoFallbackReason) ??
          DEFAULT_LOCAL_GGUF_SETTINGS.autoFallbackReason,
        maxConcurrentLocalModels:
          store.get<number>(KEYS.maxConcurrentLocalModels) ??
          DEFAULT_LOCAL_GGUF_SETTINGS.maxConcurrentLocalModels,
        defaultLibraryFolder:
          store.get<string | null>(KEYS.defaultLibraryFolder) ??
          DEFAULT_LOCAL_GGUF_SETTINGS.defaultLibraryFolder,
        embeddingModelId:
          store.get<string | null>(KEYS.embeddingModelId) ??
          DEFAULT_LOCAL_GGUF_SETTINGS.embeddingModelId,
        hfTokenKeyRef:
          store.get<string | null>(KEYS.hfTokenKeyRef) ?? DEFAULT_LOCAL_GGUF_SETTINGS.hfTokenKeyRef,
        llamaBinariesVersion:
          store.get<string>(KEYS.llamaBinariesVersion) ??
          DEFAULT_LOCAL_GGUF_SETTINGS.llamaBinariesVersion,
      };
    },

    /** Set the active backend + whether it was auto-detected; clears any prior fallback reason. */
    updateBackend(backend: GpuBackend, autoDetected: boolean): void {
      store.set(KEYS.activeBackend, backend);
      store.set(KEYS.activeBackendIsAutoDetected, autoDetected);
      store.set<string | null>(KEYS.autoFallbackReason, null);
    },

    /** Record a forced fallback to another backend, capturing the reason. */
    recordFallback(backend: GpuBackend, reason: string): void {
      store.set(KEYS.activeBackend, backend);
      store.set(KEYS.activeBackendIsAutoDetected, false);
      store.set(KEYS.autoFallbackReason, reason);
    },

    setMaxConcurrent(n: number): void {
      if (n < 1) throw new Error('maxConcurrentLocalModels must be at least 1');
      store.set(KEYS.maxConcurrentLocalModels, Math.floor(n));
    },

    setDefaultLibraryFolder(path: string | null): void {
      store.set(KEYS.defaultLibraryFolder, path);
    },

    setEmbeddingModelId(id: string | null): void {
      store.set(KEYS.embeddingModelId, id);
    },

    setHfTokenKeyRef(ref: string | null): void {
      store.set(KEYS.hfTokenKeyRef, ref);
    },

    setLlamaBinariesVersion(version: string): void {
      store.set(KEYS.llamaBinariesVersion, version);
    },
  };
}
