import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IpcProvidersService } from './handlers.js';
import { createIpcHandlers } from './handlers.js';

/**
 * Tests for the `providers.listModels` IPC handler's never-reject contract.
 *
 * Phase 4a Stage-3 catch (re-review of aaba272): the never-reject posture
 * was only enforced INSIDE `listOllamaModels` (the fetch). The HANDLER
 * around it still threw on three paths the auto-fired renderer
 * `useProviderModels` query hits in normal operation — a malformed request,
 * a provider removed between a cache invalidation and its refetch (a benign
 * race), and any unexpected lookup failure — re-surfacing the
 * `Error occurred in handler for 'providers.listModels'` main-process stderr
 * spam the contract exists to kill. These tests pin that EVERY path RESOLVES
 * with a typed `{ models: [], status: 'error', detail }` instead of rejecting,
 * and that the two benign cases (bad input, removed provider) stay silent.
 */

// A placeholder for the dep surfaces the listModels handler never touches.
const noop = {} as never;

function buildProvidersService(
  getImpl: () => ReturnType<IpcProvidersService['get']>,
): IpcProvidersService {
  return {
    list: () => [],
    get: () => getImpl(),
    add: () => {
      throw new Error('FakeProvidersService.add not used');
    },
    update: () => {
      /* not exercised by providers.listModels */
    },
    remove: async () => {
      /* not exercised by providers.listModels */
    },
    isConfigured: async () => false,
  };
}

function buildHandlers(getImpl: () => ReturnType<IpcProvidersService['get']>) {
  const providersService = buildProvidersService(getImpl);
  return createIpcHandlers({
    companiesRepo: noop,
    employeesRepo: noop,
    threadsRepo: noop,
    messagesRepo: noop,
    orchestrator: noop,
    roleLookup: noop,
    bus: noop,
    providersService,
  } as Parameters<typeof createIpcHandlers>[0]);
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockReturnValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('IPC providers.listModels — never-reject contract', () => {
  it('resolves with a typed error (never rejects, never looks up) on a malformed request', async () => {
    const handlers = buildHandlers(() => {
      throw new Error('providersService.get must not be called for a malformed request');
    });

    const result = await handlers.providersListModels({ providerId: '' });

    expect(result.models).toEqual([]);
    expect(result.status).toBe('error');
    expect(result.detail).toContain('providerId');
    // A client-side validation miss is benign — it must NOT spam the main log.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('resolves with a typed error (never rejects) when the provider was removed before refetch', async () => {
    // The renderer query auto-fires and re-fires on invalidation; a provider
    // removed between invalidation and refetch is a benign race, not a reason
    // to reject the IPC call and log a handler error.
    const handlers = buildHandlers(() => null);

    const result = await handlers.providersListModels({ providerId: 'ollama-local' });

    expect(result.models).toEqual([]);
    expect(result.status).toBe('error');
    expect(result.detail).toContain('ollama-local');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('resolves with a typed error (never rejects) on an unexpected lookup failure', async () => {
    const handlers = buildHandlers(() => {
      throw new Error('sqlite: database is locked');
    });

    const result = await handlers.providersListModels({ providerId: 'ollama-local' });

    expect(result.models).toEqual([]);
    expect(result.status).toBe('error');
    expect(result.detail).toContain('database is locked');
    // A genuinely unexpected failure IS surfaced (warned) before degrading.
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('resolves with a typed error (never rejects, never looks up) on a null or undefined request', async () => {
    // IPC delivers arbitrary payloads at runtime; a null/undefined request must
    // not throw on `req.providerId` before the guard and reject the call.
    const handlers = buildHandlers(() => {
      throw new Error('providersService.get must not be called for a null request');
    });

    const fromNull = await handlers.providersListModels(null as never);
    const fromUndefined = await handlers.providersListModels(undefined as never);

    for (const result of [fromNull, fromUndefined]) {
      expect(result.models).toEqual([]);
      expect(result.status).toBe('error');
      expect(result.detail).toContain('providerId');
    }
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
