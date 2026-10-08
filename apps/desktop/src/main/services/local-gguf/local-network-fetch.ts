/**
 * A `fetch` that can only reach the local network (audit 2026-10-07 P1-3).
 *
 * `nonLocalHostReason` decides whether a host is local by resolving it. If the
 * request then goes out through the global `fetch`, the connection resolves
 * the name a second time, and a rebinding DNS server can answer "local" to the
 * check and "public" to the socket. Here the check IS the connection's
 * lookup: Node calls the `lookup` hook below to pick the address it connects
 * to, the hook refuses unless every answer is local, and the socket can only
 * use what the hook returned.
 *
 * On top of that:
 *   - A public IP literal is refused before any socket opens. (Node skips
 *     `lookup` for literals, so they are checked up front.)
 *   - Redirects are never followed. Under `redirect: 'manual'` the 3xx is
 *     returned so the caller can report it; otherwise it is an error.
 *   - Each request gets its own agent, so proxy settings (`HTTP_PROXY`,
 *     `NODE_USE_ENV_PROXY`) and pooled sockets never apply. LAN traffic and
 *     its Authorization header go straight to the LAN host.
 */

import type { LookupAddress } from 'node:dns';
import { lookup as dnsLookup } from 'node:dns/promises';
import { Agent as HttpAgent, type IncomingMessage, request as httpRequest } from 'node:http';
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';
import { Readable } from 'node:stream';

import { classifyHost, isLocalNetworkAddress } from './local-network.js';

export interface LocalNetworkFetchOptions {
  /** Resolver; defaults to the OS resolver (`dns.promises.lookup`). */
  lookup?: (hostname: string, options: { all: true }) => Promise<LookupAddress[]>;
}

export type LocalNetworkFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const RULE =
  'Local-tier traffic may only reach loopback, RFC1918, link-local or unique-local addresses.';

export function createLocalNetworkFetch(options: LocalNetworkFetchOptions = {}): LocalNetworkFetch {
  const resolve = options.lookup ?? ((name: string) => dnsLookup(name, { all: true }));

  /** The connect-time resolver: every answer must be local, or nothing connects. */
  const guardedLookup: LookupFunction = (hostname, lookupOptions, callback) => {
    resolve(hostname, { all: true }).then(
      (addresses) => {
        const outside = addresses.map((a) => a.address).filter((a) => !isLocalNetworkAddress(a));
        if (addresses.length === 0 || outside.length > 0) {
          const detail = addresses.length === 0 ? 'no addresses' : `${outside.join(', ')}`;
          const err = Object.assign(
            new Error(
              `"${hostname}" resolves to ${detail}, which is not on the local network. ${RULE}`,
            ),
            { code: 'ENOTLOCAL' },
          );
          callback(err, '', 4);
          return;
        }
        if (lookupOptions.all) {
          (callback as (e: null, a: LookupAddress[]) => void)(null, addresses);
        } else {
          const first = addresses[0] as LookupAddress;
          callback(null, first.address, first.family);
        }
      },
      (err: Error) => callback(Object.assign(err, { code: 'ENOTFOUND' }), '', 4),
    );
  };

  return async (input, requestInit = {}) => {
    // A Request contributes its URL, method and headers; init overrides them.
    const init: RequestInit =
      input instanceof Request
        ? { method: input.method, headers: input.headers, ...requestInit }
        : requestInit;
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new TypeError(`Local network requests must use http or https; got ${url.protocol}`);
    }
    if (classifyHost(url.hostname) === 'public') {
      throw new Error(`"${url.hostname}" is not on the local network. ${RULE}`);
    }
    // An IP literal never reaches `lookup`; classifyHost has just decided it.

    const body = toBody(init.body);
    const headers = new Headers(init.headers);
    if (body !== undefined && !headers.has('content-length')) {
      headers.set('content-length', String(body.byteLength));
    }
    const isHttps = url.protocol === 'https:';
    // A fresh agent per request: no keep-alive reuse, no environment proxy.
    const agent = isHttps
      ? new HttpsAgent({ keepAlive: false, lookup: guardedLookup })
      : new HttpAgent({ keepAlive: false, lookup: guardedLookup });

    const response = await new Promise<IncomingMessage>((resolveResponse, reject) => {
      const req = (isHttps ? httpsRequest : httpRequest)(
        url,
        {
          method: init.method ?? 'GET',
          headers: Object.fromEntries(headers.entries()),
          agent,
          lookup: guardedLookup,
          ...(init.signal ? { signal: init.signal } : {}),
        },
        resolveResponse,
      );
      req.on('error', reject);
      if (body !== undefined) req.write(body);
      req.end();
    }).finally(() => agent.destroy());

    const status = response.statusCode ?? 0;
    if (status >= 300 && status < 400 && init.redirect !== 'manual') {
      response.resume();
      throw new TypeError(
        `Local network request to ${url.origin} was redirected (HTTP ${status}); redirects are not followed.`,
      );
    }

    const responseHeaders = new Headers();
    for (const [name, value] of Object.entries(response.headers)) {
      if (Array.isArray(value)) for (const v of value) responseHeaders.append(name, v);
      else if (value !== undefined) responseHeaders.set(name, value);
    }
    const noBody = status === 204 || status === 304 || init.method === 'HEAD';
    if (noBody) response.resume();
    return new Response(noBody ? null : (Readable.toWeb(response) as ReadableStream<Uint8Array>), {
      status,
      statusText: response.statusMessage ?? '',
      headers: responseHeaders,
    });
  };
}

function toBody(body: RequestInit['body']): Uint8Array | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  throw new TypeError('Local network requests accept a string or bytes body.');
}
