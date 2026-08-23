/**
 * IPC handlers for the localGguf.endpoint.* channels (remote LAN endpoints).
 *
 * Phase 5 (endpoints) — LIVE. Each channel delegates to the injected
 * {@link EndpointService}, which owns URL validation (including the
 * local-network check that keeps the `Local` privacy tier honest), duplicate
 * detection, the `/v1/models` reachability probe, and status persistence. The
 * Phase 1 not-implemented stubs these replaced are gone; the boot sequence
 * constructs the service and passes it in via `deps`.
 *
 * Argument typing mirrors the sibling library and runtime handlers: each
 * handler destructures `(_event, ...)`, types the positional args to the
 * contract the channel encodes, and returns the service promise directly.
 */

import type { LocalGgufError, RemoteEndpoint } from '@team-x/shared-types';
import type { IpcMain } from 'electron';

import type { EndpointService } from '../services/local-gguf/endpoint-service.js';

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

/** Service the endpoint channels delegate to (constructed at boot). */
export interface LocalGgufEndpointHandlerDeps {
  endpoints: EndpointService;
}

export function registerLocalGgufEndpointHandlers(
  ipc: IpcMain,
  deps: LocalGgufEndpointHandlerDeps,
): void {
  const { endpoints } = deps;

  ipc.handle('localGguf.endpoint.list', (): Promise<RemoteEndpoint[]> => endpoints.list());

  ipc.handle(
    'localGguf.endpoint.add',
    (
      _event,
      config: { name: string; baseUrl: string; authHeaderKeyRef: string | null },
    ): Promise<RemoteEndpoint> => endpoints.add(config),
  );

  ipc.handle(
    'localGguf.endpoint.remove',
    (_event, id: string): Promise<void> => endpoints.remove(id),
  );

  ipc.handle(
    'localGguf.endpoint.test',
    (_event, id: string): Promise<EndpointTestResult> => endpoints.test(id),
  );

  ipc.handle(
    'localGguf.endpoint.update',
    (
      _event,
      id: string,
      partial: { name?: string; baseUrl?: string; authHeaderKeyRef?: string | null },
    ): Promise<RemoteEndpoint> => endpoints.update(id, partial),
  );
}
