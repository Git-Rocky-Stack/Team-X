/**
 * createLocalNetworkFetch — the Local privacy tier enforced at connect time
 * (audit 2026-10-07 P1-3).
 *
 * These run real HTTP servers on 127.0.0.1 and inject only the resolver, so
 * what is asserted is where a socket actually goes.
 */

import type { LookupAddress } from 'node:dns';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLocalNetworkFetch } from './local-network-fetch.js';

interface Recorder {
  server: Server;
  port: number;
  hits: Array<{ method?: string; url?: string; host?: string; body: string }>;
}

async function listen(handler?: Parameters<typeof createServer>[1]): Promise<Recorder> {
  const hits: Recorder['hits'] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      hits.push({ method: req.method, url: req.url, host: req.headers.host, body });
      if (handler) handler(req, res);
      else {
        res.setHeader('content-type', 'application/json');
        res.end('{"data":[]}');
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: (server.address() as AddressInfo).port, hits };
}

const answers =
  (...addresses: string[]) =>
  async (): Promise<LookupAddress[]> =>
    addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));

let target: Recorder;

beforeEach(async () => {
  target = await listen();
});

afterEach(async () => {
  await new Promise((r) => target.server.close(r));
  vi.unstubAllEnvs();
});

describe('createLocalNetworkFetch', () => {
  it('reaches a LAN name that resolves only to local addresses', async () => {
    const fetchLocal = createLocalNetworkFetch({ lookup: answers('127.0.0.1') });
    const res = await fetchLocal(`http://bench-rig:${target.port}/v1/models`, {
      headers: { authorization: 'Bearer t' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [] });
    expect(target.hits).toHaveLength(1);
    expect(target.hits[0]?.host).toBe(`bench-rig:${target.port}`);
  });

  it('posts a body', async () => {
    const fetchLocal = createLocalNetworkFetch({ lookup: answers('127.0.0.1') });
    await fetchLocal(`http://rig:${target.port}/run`, { method: 'POST', body: '{"x":1}' });
    expect(target.hits[0]).toMatchObject({ method: 'POST', body: '{"x":1}' });
  });

  it('refuses before connecting when any resolved address is public', async () => {
    const fetchLocal = createLocalNetworkFetch({ lookup: answers('127.0.0.1', '8.8.8.8') });
    await expect(fetchLocal(`http://rig:${target.port}/v1/models`)).rejects.toThrow(
      /8\.8\.8\.8.*not on the local network/,
    );
    expect(target.hits).toHaveLength(0);
  });

  it('checks the answer the socket actually uses, so DNS rebinding cannot slip past', async () => {
    // A rebinding resolver answers "local" to whoever asks first and "public"
    // after. The only lookup that counts is the connection's own, so the
    // public answer is the one checked, and refused.
    let calls = 0;
    const rebinding = async (): Promise<LookupAddress[]> => {
      calls += 1;
      return [{ address: calls === 1 ? '127.0.0.1' : '93.184.216.34', family: 4 }];
    };
    const fetchLocal = createLocalNetworkFetch({ lookup: rebinding });
    // First request: the resolver's first (local) answer is the connect-time answer.
    await expect(fetchLocal(`http://rig:${target.port}/a`)).resolves.toMatchObject({ status: 200 });
    // Second request: the rebinding answer is caught at connect time.
    await expect(fetchLocal(`http://rig:${target.port}/b`)).rejects.toThrow(
      /not on the local network/,
    );
    expect(target.hits.map((h) => h.url)).toEqual(['/a']);
  });

  it('refuses a public IP literal without a lookup', async () => {
    let looked = false;
    const fetchLocal = createLocalNetworkFetch({
      lookup: async () => {
        looked = true;
        return [];
      },
    });
    await expect(fetchLocal('http://93.184.216.34/v1/models')).rejects.toThrow(
      /not on the local network/,
    );
    expect(looked).toBe(false);
  });

  it('treats an IPv4-mapped IPv6 answer by the IPv4 it reaches', async () => {
    const fetchLocal = createLocalNetworkFetch({ lookup: answers('::ffff:8.8.8.8') });
    await expect(fetchLocal(`http://rig:${target.port}/`)).rejects.toThrow(
      /not on the local network/,
    );
    expect(target.hits).toHaveLength(0);
  });

  it('never follows a redirect, and reports it under redirect: manual', async () => {
    const bouncer = await listen((_req, res) => {
      res.statusCode = 302;
      res.setHeader('location', 'http://93.184.216.34/steal');
      res.end();
    });
    try {
      const fetchLocal = createLocalNetworkFetch({ lookup: answers('127.0.0.1') });
      await expect(fetchLocal(`http://rig:${bouncer.port}/v1/models`)).rejects.toThrow(/redirect/i);
      const manual = await fetchLocal(`http://rig:${bouncer.port}/v1/models`, {
        redirect: 'manual',
      });
      expect(manual.status).toBe(302);
      expect(manual.headers.get('location')).toBe('http://93.184.216.34/steal');
    } finally {
      await new Promise((r) => bouncer.server.close(r));
    }
  });

  it('ignores proxy environment variables: LAN traffic never goes via a proxy', async () => {
    const proxy = await listen();
    try {
      vi.stubEnv('HTTP_PROXY', `http://127.0.0.1:${proxy.port}`);
      vi.stubEnv('http_proxy', `http://127.0.0.1:${proxy.port}`);
      const fetchLocal = createLocalNetworkFetch({ lookup: answers('127.0.0.1') });
      await fetchLocal(`http://rig:${target.port}/v1/models`);
      expect(proxy.hits).toHaveLength(0);
      expect(target.hits).toHaveLength(1);
    } finally {
      await new Promise((r) => proxy.server.close(r));
    }
  });

  it('honours an abort signal', async () => {
    const slow = await listen(() => {
      /* never answers */
    });
    try {
      const fetchLocal = createLocalNetworkFetch({ lookup: answers('127.0.0.1') });
      const controller = new AbortController();
      const pending = fetchLocal(`http://rig:${slow.port}/`, { signal: controller.signal });
      setTimeout(() => controller.abort(), 20);
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    } finally {
      slow.server.closeAllConnections();
      await new Promise((r) => slow.server.close(r));
    }
  });

  it('rejects non-HTTP schemes', async () => {
    const fetchLocal = createLocalNetworkFetch({ lookup: answers('127.0.0.1') });
    await expect(fetchLocal('file:///etc/passwd')).rejects.toThrow(/http or https/);
  });
});
