import type { RemoteEndpoint } from '@team-x/shared-types';
import type { IpcMain } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import type { EndpointService } from '../services/local-gguf/endpoint-service.js';

import {
  LOCAL_GGUF_ENDPOINT_CHANNELS,
  registerLocalGgufEndpointHandlers,
} from './local-gguf-endpoint-handlers.js';

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

/**
 * Fake EndpointService whose methods resolve to channel-specific sentinels, so
 * each delegation test asserts both the call shape and the returned value.
 */
function makeFakeEndpoints() {
  const sentinels = {
    list: [{ id: 'ep-1' }] as unknown as RemoteEndpoint[],
    add: { id: 'ep-2' } as unknown as RemoteEndpoint,
    remove: undefined,
    test: { reachable: true, latencyMs: 12 },
    update: { id: 'ep-3' } as unknown as RemoteEndpoint,
  };
  const endpoints = {
    list: vi.fn().mockResolvedValue(sentinels.list),
    add: vi.fn().mockResolvedValue(sentinels.add),
    remove: vi.fn().mockResolvedValue(sentinels.remove),
    test: vi.fn().mockResolvedValue(sentinels.test),
    update: vi.fn().mockResolvedValue(sentinels.update),
  } satisfies Record<keyof EndpointService, ReturnType<typeof vi.fn>>;
  return { endpoints: endpoints as unknown as EndpointService, mocks: endpoints, sentinels };
}

describe('localGguf endpoint IPC handlers (Phase 5 — EndpointService delegations)', () => {
  it('registers every endpoint channel exactly once', () => {
    const f = makeFakeIpc();
    const { endpoints } = makeFakeEndpoints();
    registerLocalGgufEndpointHandlers(f.ipc, { endpoints });

    expect(f.channels().sort()).toEqual([...LOCAL_GGUF_ENDPOINT_CHANNELS].sort());
    expect(f.channels()).toHaveLength(5);
  });

  it('endpoint.list returns the service result', async () => {
    const f = makeFakeIpc();
    const { endpoints, mocks, sentinels } = makeFakeEndpoints();
    registerLocalGgufEndpointHandlers(f.ipc, { endpoints });

    await expect(f.invoke('localGguf.endpoint.list')).resolves.toBe(sentinels.list);
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });

  it('endpoint.add forwards the config object', async () => {
    const f = makeFakeIpc();
    const { endpoints, mocks, sentinels } = makeFakeEndpoints();
    registerLocalGgufEndpointHandlers(f.ipc, { endpoints });

    const config = {
      name: 'Bench rig',
      baseUrl: 'http://192.168.1.50:1234',
      authHeaderKeyRef: null,
    };
    await expect(f.invoke('localGguf.endpoint.add', config)).resolves.toBe(sentinels.add);
    expect(mocks.add).toHaveBeenCalledWith(config);
  });

  it('endpoint.remove forwards the id', async () => {
    const f = makeFakeIpc();
    const { endpoints, mocks } = makeFakeEndpoints();
    registerLocalGgufEndpointHandlers(f.ipc, { endpoints });

    await f.invoke('localGguf.endpoint.remove', 'ep-1');
    expect(mocks.remove).toHaveBeenCalledWith('ep-1');
  });

  it('endpoint.test forwards the id and returns the probe verdict', async () => {
    const f = makeFakeIpc();
    const { endpoints, mocks, sentinels } = makeFakeEndpoints();
    registerLocalGgufEndpointHandlers(f.ipc, { endpoints });

    await expect(f.invoke('localGguf.endpoint.test', 'ep-1')).resolves.toBe(sentinels.test);
    expect(mocks.test).toHaveBeenCalledWith('ep-1');
  });

  it('endpoint.update forwards the id and the partial', async () => {
    const f = makeFakeIpc();
    const { endpoints, mocks, sentinels } = makeFakeEndpoints();
    registerLocalGgufEndpointHandlers(f.ipc, { endpoints });

    const partial = { name: 'Renamed' };
    await expect(f.invoke('localGguf.endpoint.update', 'ep-1', partial)).resolves.toBe(
      sentinels.update,
    );
    expect(mocks.update).toHaveBeenCalledWith('ep-1', partial);
  });

  it('surfaces a service rejection to the caller rather than swallowing it', async () => {
    const f = makeFakeIpc();
    const { endpoints, mocks } = makeFakeEndpoints();
    mocks.test.mockRejectedValueOnce(new Error('Endpoint ep-9 not found.'));
    registerLocalGgufEndpointHandlers(f.ipc, { endpoints });

    await expect(f.invoke('localGguf.endpoint.test', 'ep-9')).rejects.toThrow(/not found/);
  });

  it('no handler answers with the Phase 1 not-implemented error any more', async () => {
    const f = makeFakeIpc();
    const { endpoints } = makeFakeEndpoints();
    registerLocalGgufEndpointHandlers(f.ipc, { endpoints });

    for (const channel of LOCAL_GGUF_ENDPOINT_CHANNELS) {
      await expect(f.invoke(channel, 'ep-1', {})).resolves.not.toThrow();
    }
  });
});
