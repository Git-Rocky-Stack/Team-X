/**
 * IPC handlers for the localGguf.endpoint.* channels (remote LAN endpoints).
 *
 * Phase 1: typed not-implemented stubs. Phase 5 (endpoints UI / service)
 * replaces them with real implementations against the EndpointService.
 */

import type { LocalGgufError, RemoteEndpoint } from '@team-x/shared-types';
import type { IpcMain } from 'electron';

import { notImplemented } from './local-gguf-not-implemented.js';

/** Result of a localGguf.endpoint.test reachability probe. */
export interface EndpointTestResult {
  reachable: boolean;
  latencyMs?: number;
  error?: LocalGgufError;
}

export const LOCAL_GGUF_ENDPOINT_CHANNELS = [
  'localGguf.endpoint.list',
  'localGguf.endpoint.add',
  'localGguf.endpoint.remove',
  'localGguf.endpoint.test',
  'localGguf.endpoint.update',
] as const;

export function registerLocalGgufEndpointHandlers(ipc: IpcMain): void {
  ipc.handle('localGguf.endpoint.list', async (): Promise<RemoteEndpoint[]> =>
    notImplemented('localGguf.endpoint.list'),
  );
  ipc.handle('localGguf.endpoint.add', async (): Promise<RemoteEndpoint> =>
    notImplemented('localGguf.endpoint.add'),
  );
  ipc.handle('localGguf.endpoint.remove', async (): Promise<void> =>
    notImplemented('localGguf.endpoint.remove'),
  );
  ipc.handle('localGguf.endpoint.test', async (): Promise<EndpointTestResult> =>
    notImplemented('localGguf.endpoint.test'),
  );
  ipc.handle('localGguf.endpoint.update', async (): Promise<RemoteEndpoint> =>
    notImplemented('localGguf.endpoint.update'),
  );
}
