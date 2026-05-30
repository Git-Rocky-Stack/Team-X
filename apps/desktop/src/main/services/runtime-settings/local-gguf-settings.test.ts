import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCAL_GGUF_SETTINGS,
  type LocalGgufSettingsAccessor,
  type LocalGgufSettingsStore,
  createLocalGgufSettingsAccessor,
} from './local-gguf-settings.js';

function inMemoryStore(): LocalGgufSettingsStore {
  const m = new Map<string, unknown>();
  return {
    get<T>(key: string): T | undefined {
      return m.get(key) as T | undefined;
    },
    set<T>(key: string, value: T): void {
      m.set(key, value);
    },
  };
}

describe('localGgufSettingsAccessor', () => {
  let store: LocalGgufSettingsStore;
  let accessor: LocalGgufSettingsAccessor;

  beforeEach(() => {
    store = inMemoryStore();
    accessor = createLocalGgufSettingsAccessor(store);
  });

  it('returns defaults when the store is empty', () => {
    expect(accessor.get()).toEqual(DEFAULT_LOCAL_GGUF_SETTINGS);
  });

  it('overlays persisted values on the defaults', () => {
    store.set('localGguf.activeBackend', 'cuda');
    store.set('localGguf.maxConcurrentLocalModels', 3);
    const s = accessor.get();
    expect(s.activeBackend).toBe('cuda');
    expect(s.maxConcurrentLocalModels).toBe(3);
    expect(s.activeBackendIsAutoDetected).toBe(
      DEFAULT_LOCAL_GGUF_SETTINGS.activeBackendIsAutoDetected,
    );
  });

  it('updateBackend persists backend + autoDetected and clears the fallback reason', () => {
    accessor.recordFallback('vulkan', 'stale');
    accessor.updateBackend('cuda', true);
    const s = accessor.get();
    expect(s.activeBackend).toBe('cuda');
    expect(s.activeBackendIsAutoDetected).toBe(true);
    expect(s.autoFallbackReason).toBeNull();
  });

  it('recordFallback stores the reason and flips activeBackendIsAutoDetected to false', () => {
    accessor.updateBackend('cuda', true);
    accessor.recordFallback('vulkan', 'CUDA initialization failed');
    const s = accessor.get();
    expect(s.activeBackend).toBe('vulkan');
    expect(s.activeBackendIsAutoDetected).toBe(false);
    expect(s.autoFallbackReason).toBe('CUDA initialization failed');
  });

  it('setMaxConcurrent rejects values < 1', () => {
    expect(() => accessor.setMaxConcurrent(0)).toThrow(/at least 1/i);
    expect(() => accessor.setMaxConcurrent(-1)).toThrow(/at least 1/i);
  });

  it('setMaxConcurrent floors and persists valid values', () => {
    accessor.setMaxConcurrent(4.9);
    expect(accessor.get().maxConcurrentLocalModels).toBe(4);
  });

  it('setDefaultLibraryFolder persists and clears', () => {
    accessor.setDefaultLibraryFolder('/Users/rocky/models');
    expect(accessor.get().defaultLibraryFolder).toBe('/Users/rocky/models');
    accessor.setDefaultLibraryFolder(null);
    expect(accessor.get().defaultLibraryFolder).toBeNull();
  });

  it('setEmbeddingModelId persists', () => {
    accessor.setEmbeddingModelId('mod-uuid');
    expect(accessor.get().embeddingModelId).toBe('mod-uuid');
  });

  it('setHfTokenKeyRef persists', () => {
    accessor.setHfTokenKeyRef('team-x.local-gguf.hf-token');
    expect(accessor.get().hfTokenKeyRef).toBe('team-x.local-gguf.hf-token');
  });

  it('setLlamaBinariesVersion persists', () => {
    accessor.setLlamaBinariesVersion('b9371');
    expect(accessor.get().llamaBinariesVersion).toBe('b9371');
  });
});
