/**
 * EndpointService specs — the five `localGguf.endpoint.*` channels.
 *
 * Every channel was a Phase 1 not-implemented stub. These specs define the
 * behaviour the real service must have before any of it is written.
 *
 * The load-bearing property under test is the privacy contract: the
 * `local_model_endpoints` table pins `privacy_tier` to `'Local'` with a SQL
 * CHECK, and the type comment says these endpoints are "local-network, never
 * cloud". A CHECK on a literal column value cannot enforce that — nothing
 * stops a row labelled `Local` from pointing at a public API host. The
 * service is where that promise is actually kept, so host validation gets
 * the most coverage here.
 */

import type { RemoteEndpoint } from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';

import {
  type EndpointServiceDeps,
  EndpointServiceError,
  type EndpointServiceRepo,
  createEndpointService,
  isLocalNetworkAddress,
} from './endpoint-service.js';

/**
 * `RequestInit` / `ResponseInit` are type-only DOM lib identifiers, not runtime
 * globals, so eslint's `no-undef` flags them by name even though TypeScript
 * resolves them fine. Deriving the same types from `fetch` and `Response`
 * avoids the bare identifiers without loosening the repo's lint config.
 */
type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

// ---------------------------------------------------------------------------
// In-memory repo double — mirrors createLocalModelEndpointsRepo's contract.
// ---------------------------------------------------------------------------

function makeRepo(): EndpointServiceRepo & { rows: RemoteEndpoint[] } {
  const rows: RemoteEndpoint[] = [];
  let seq = 0;
  return {
    rows,
    list: () => [...rows].reverse(),
    getById: (id) => rows.find((r) => r.id === id) ?? null,
    insert(input) {
      seq += 1;
      const now = 1_000 + seq;
      const row: RemoteEndpoint = {
        id: `ep-${seq}`,
        name: input.name,
        baseUrl: input.baseUrl,
        authHeaderKeyRef: input.authHeaderKeyRef,
        privacyTier: 'Local',
        status: 'unknown',
        lastCheckedAt: null,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      };
      rows.push(row);
      return row;
    },
    updateConfig(id, input) {
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error(`local_model_endpoints row ${id} not found`);
      if (input.name !== undefined) row.name = input.name;
      if (input.baseUrl !== undefined) row.baseUrl = input.baseUrl;
      if ('authHeaderKeyRef' in input) row.authHeaderKeyRef = input.authHeaderKeyRef ?? null;
      row.updatedAt = 9_999;
      return { ...row };
    },
    clearStatus(id) {
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error(`local_model_endpoints row ${id} not found`);
      row.status = 'unknown';
      row.lastError = null;
      row.lastCheckedAt = null;
      row.updatedAt = 9_999;
      return { ...row };
    },
    updateStatus(id, status, lastError) {
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error(`local_model_endpoints row ${id} not found`);
      row.status = status;
      row.lastError = lastError;
      row.lastCheckedAt = 5_000;
      return { ...row };
    },
    remove(id) {
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) rows.splice(i, 1);
    },
  };
}

/** Monotonic clock so latency assertions are exact rather than timing-dependent. */
function makeClock(startAt = 0, stepMs = 42) {
  let t = startAt;
  return () => {
    const current = t;
    t += stepMs;
    return current;
  };
}

const OK_MODELS = () =>
  new Response(JSON.stringify({ data: [{ id: 'qwen3-8b' }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

type LookupFn = NonNullable<EndpointServiceDeps['lookup']>;

/**
 * DNS double. Names absent from `table` fail the way getaddrinfo does, so a
 * test can never accidentally depend on the machine's real resolver.
 */
function makeLookup(table: Record<string, string[] | undefined>) {
  return vi.fn(async (hostname: string) => {
    const addresses = table[hostname];
    if (!addresses) {
      throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' });
    }
    return addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  });
}

/** The LAN names the default fixtures use, resolving where a home network would put them. */
const LAN_DNS: Record<string, string[]> = {
  'bench-rig': ['192.168.1.60'],
  'bench-rig.local': ['192.168.1.61', 'fe80::1'],
};

function build(
  overrides: {
    fetchFn?: typeof fetch;
    secrets?: { getEndpointAuthHeader: (ref: string) => Promise<string | null> };
    now?: () => number;
    probeTimeoutMs?: number;
    lookup?: LookupFn;
  } = {},
) {
  const repo = makeRepo();
  const lookup = overrides.lookup ?? makeLookup(LAN_DNS);
  const service = createEndpointService({
    repo,
    fetchFn: overrides.fetchFn ?? (vi.fn(async () => OK_MODELS()) as unknown as typeof fetch),
    secrets: overrides.secrets,
    now: overrides.now ?? makeClock(),
    probeTimeoutMs: overrides.probeTimeoutMs,
    lookup,
  });
  return { repo, service, lookup };
}

// ---------------------------------------------------------------------------

describe('EndpointService — add', () => {
  it('persists a new endpoint with status "unknown" until it is probed', async () => {
    const { service } = build();
    const created = await service.add({
      name: 'LM Studio on bench',
      baseUrl: 'http://192.168.1.50:1234',
      authHeaderKeyRef: null,
    });

    expect(created.name).toBe('LM Studio on bench');
    expect(created.baseUrl).toBe('http://192.168.1.50:1234');
    expect(created.privacyTier).toBe('Local');
    expect(created.status).toBe('unknown');
    expect(created.lastCheckedAt).toBeNull();
  });

  it('normalizes a trailing slash so probe URLs do not double up', async () => {
    const { service } = build();
    const created = await service.add({
      name: 'X',
      baseUrl: 'http://192.168.1.50:1234/',
      authHeaderKeyRef: null,
    });
    expect(created.baseUrl).toBe('http://192.168.1.50:1234');
  });

  it.each([
    ['loopback name', 'http://localhost:8080'],
    ['loopback v4', 'http://127.0.0.1:11434'],
    ['loopback v6', 'http://[::1]:8080'],
    ['RFC1918 10/8', 'http://10.0.0.4:1234'],
    ['RFC1918 172.16/12', 'http://172.20.10.3:1234'],
    ['RFC1918 192.168/16', 'http://192.168.1.50:1234'],
    ['link-local', 'http://169.254.10.2:1234'],
    ['IPv6 unique-local', 'http://[fd00::1]:8080'],
    ['mDNS .local', 'http://bench-rig.local:1234'],
    ['bare LAN hostname', 'http://bench-rig:1234'],
    ['https on the LAN', 'https://192.168.1.50:1234'],
  ])('accepts a local-network base URL (%s)', async (_label, baseUrl) => {
    const { service } = build();
    await expect(
      service.add({ name: 'X', baseUrl, authHeaderKeyRef: null }),
    ).resolves.toMatchObject({ privacyTier: 'Local' });
  });

  it.each([
    ['public API host', 'https://api.openai.com/v1'],
    ['public DNS name', 'https://models.example.com'],
    ['public IPv4', 'http://8.8.8.8:1234'],
    ['public IPv6', 'http://[2606:4700:4700::1111]:8080'],
  ])('refuses a non-local base URL (%s) — privacy tier is Local, not a label', async (_l, url) => {
    const { service, repo } = build();
    await expect(service.add({ name: 'X', baseUrl: url, authHeaderKeyRef: null })).rejects.toThrow(
      /local network/i,
    );
    expect(repo.rows).toHaveLength(0);
  });

  it.each([
    ['not a URL', 'not a url'],
    ['unsupported scheme', 'ftp://192.168.1.50'],
    ['file scheme', 'file:///etc/passwd'],
    ['empty', ''],
  ])('refuses a malformed base URL (%s)', async (_label, baseUrl) => {
    const { service, repo } = build();
    await expect(service.add({ name: 'X', baseUrl, authHeaderKeyRef: null })).rejects.toThrow();
    expect(repo.rows).toHaveLength(0);
  });

  it('refuses a blank name rather than storing an unidentifiable row', async () => {
    const { service } = build();
    await expect(
      service.add({ name: '   ', baseUrl: 'http://192.168.1.50:1234', authHeaderKeyRef: null }),
    ).rejects.toThrow(/name/i);
  });

  it('refuses a second endpoint with the same base URL', async () => {
    const { service } = build();
    await service.add({ name: 'A', baseUrl: 'http://192.168.1.50:1234', authHeaderKeyRef: null });
    await expect(
      service.add({ name: 'B', baseUrl: 'http://192.168.1.50:1234', authHeaderKeyRef: null }),
    ).rejects.toThrow(/already/i);
  });
});

describe('isLocalNetworkAddress — IPv4-mapped IPv6', () => {
  // A resolver may answer a v4 host as ::ffff:a.b.c.d, and WHATWG URL
  // canonicalizes the literal to hex (::ffff:c0a8:105). Either way the
  // embedded IPv4 address is what a connection reaches, so it decides.
  it.each(['::ffff:192.168.1.5', '::ffff:c0a8:105', '[::ffff:10.0.0.7]', '::FFFF:7f00:1'])(
    'treats %s as local',
    (address) => {
      expect(isLocalNetworkAddress(address)).toBe(true);
    },
  );

  it.each(['::ffff:8.8.8.8', '::ffff:808:808'])('treats %s as public', (address) => {
    expect(isLocalNetworkAddress(address)).toBe(false);
  });
});

describe('EndpointService — hostname resolution', () => {
  // A non-literal hostname proves nothing about where it points. `http://ai`
  // is a real public TLD, and a dotless name can be expanded by a DNS search
  // suffix into a public record. The only honest test is to resolve it and
  // require every address to be local.

  it('refuses a dotless name that resolves to a public address', async () => {
    const { service, repo } = build({ lookup: makeLookup({ ai: ['34.120.5.6'] }) });
    await expect(
      service.add({ name: 'X', baseUrl: 'http://ai:8080', authHeaderKeyRef: null }),
    ).rejects.toThrow(/34\.120\.5\.6.*local network/i);
    expect(repo.rows).toHaveLength(0);
  });

  it('refuses a .local name that resolves to a public address', async () => {
    const { service } = build({ lookup: makeLookup({ 'rig.local': ['8.8.4.4'] }) });
    await expect(
      service.add({ name: 'X', baseUrl: 'http://rig.local:1234', authHeaderKeyRef: null }),
    ).rejects.toThrow(/local network/i);
  });

  it('accepts a dotless name whose every address is private', async () => {
    const { service, lookup } = build({
      lookup: makeLookup({ 'bench-rig': ['192.168.1.60', 'fd00::60'] }),
    });
    await expect(
      service.add({ name: 'X', baseUrl: 'http://bench-rig:1234', authHeaderKeyRef: null }),
    ).resolves.toMatchObject({ baseUrl: 'http://bench-rig:1234' });
    expect(lookup).toHaveBeenCalledWith('bench-rig', { all: true });
  });

  it('refuses a name with mixed private and public addresses', async () => {
    // A client may connect to any of them, so one public answer is enough to
    // break the Local tier.
    const { service } = build({
      lookup: makeLookup({ 'bench-rig': ['192.168.1.60', '2606:4700:4700::1111'] }),
    });
    await expect(
      service.add({ name: 'X', baseUrl: 'http://bench-rig:1234', authHeaderKeyRef: null }),
    ).rejects.toThrow(/2606:4700:4700::1111/);
  });

  it('refuses a name that does not resolve, saying why', async () => {
    const { service, repo } = build({ lookup: makeLookup({}) });
    await expect(
      service.add({ name: 'X', baseUrl: 'http://ghost-box:1234', authHeaderKeyRef: null }),
    ).rejects.toThrow(/could not be resolved/i);
    expect(repo.rows).toHaveLength(0);
  });

  it('refuses a name whose lookup returns no addresses', async () => {
    const { service } = build({ lookup: vi.fn(async () => []) });
    await expect(
      service.add({ name: 'X', baseUrl: 'http://bench-rig:1234', authHeaderKeyRef: null }),
    ).rejects.toThrow(/could not be resolved/i);
  });

  it('applies the same resolution rule to an updated base URL', async () => {
    const { service, repo } = build({
      lookup: makeLookup({ ai: ['34.120.5.6'] }),
    });
    const e = await service.add({
      name: 'A',
      baseUrl: 'http://10.0.0.1:1234',
      authHeaderKeyRef: null,
    });
    await expect(service.update(e.id, { baseUrl: 'http://ai:8080' })).rejects.toThrow(
      /local network/i,
    );
    expect(repo.getById(e.id)?.baseUrl).toBe('http://10.0.0.1:1234');
  });

  it('does not consult DNS for IP literals or localhost', async () => {
    const { service, lookup } = build();
    await service.add({ name: 'A', baseUrl: 'http://10.0.0.1:1234', authHeaderKeyRef: null });
    await service.add({ name: 'B', baseUrl: 'http://localhost:8080', authHeaderKeyRef: null });
    await service.add({ name: 'C', baseUrl: 'http://[fd00::1]:8080', authHeaderKeyRef: null });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('re-resolves at probe time and refuses to probe once the name points public', async () => {
    // DNS can change between add and test. The verdict must describe where the
    // name points now, and no request may reach a public host meanwhile.
    const table: Record<string, string[]> = { 'bench-rig': ['192.168.1.60'] };
    const fetchFn = vi.fn(async () => OK_MODELS());
    const { service, repo } = build({
      fetchFn: fetchFn as unknown as typeof fetch,
      lookup: makeLookup(table),
    });
    const e = await service.add({
      name: 'A',
      baseUrl: 'http://bench-rig:1234',
      authHeaderKeyRef: null,
    });

    table['bench-rig'] = ['52.4.4.4'];
    const result = await service.test(e.id);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.reachable).toBe(false);
    expect(result.error).toEqual({ kind: 'endpoint-unreachable', url: 'http://bench-rig:1234' });
    expect(repo.getById(e.id)?.status).toBe('unreachable');
    expect(repo.getById(e.id)?.lastError).toMatch(/52\.4\.4\.4.*local network/i);
  });

  it('fails the probe when the name no longer resolves', async () => {
    const table: Record<string, string[] | undefined> = { 'bench-rig': ['192.168.1.60'] };
    const fetchFn = vi.fn(async () => OK_MODELS());
    const { service, repo } = build({
      fetchFn: fetchFn as unknown as typeof fetch,
      lookup: makeLookup(table),
    });
    const e = await service.add({
      name: 'A',
      baseUrl: 'http://bench-rig:1234',
      authHeaderKeyRef: null,
    });

    table['bench-rig'] = undefined;
    const result = await service.test(e.id);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.reachable).toBe(false);
    expect(repo.getById(e.id)?.lastError).toMatch(/could not be resolved/i);
  });

  it('probes a name that still resolves locally', async () => {
    const { service } = build();
    const e = await service.add({
      name: 'A',
      baseUrl: 'http://bench-rig:1234',
      authHeaderKeyRef: null,
    });
    await expect(service.test(e.id)).resolves.toMatchObject({ reachable: true });
  });
});

describe('EndpointService — list and remove', () => {
  it('lists what the repo holds', async () => {
    const { service } = build();
    await service.add({ name: 'A', baseUrl: 'http://10.0.0.1:1234', authHeaderKeyRef: null });
    await service.add({ name: 'B', baseUrl: 'http://10.0.0.2:1234', authHeaderKeyRef: null });

    expect((await service.list()).map((e) => e.name)).toEqual(['B', 'A']);
  });

  it('removes an endpoint', async () => {
    const { service, repo } = build();
    const e = await service.add({
      name: 'A',
      baseUrl: 'http://10.0.0.1:1234',
      authHeaderKeyRef: null,
    });
    await service.remove(e.id);
    expect(repo.rows).toHaveLength(0);
  });

  it('treats removing an unknown endpoint as already-done', async () => {
    const { service } = build();
    await expect(service.remove('ghost')).resolves.toBeUndefined();
  });
});

describe('EndpointService — update', () => {
  it('applies a partial change and returns the stored row', async () => {
    const { service } = build();
    const e = await service.add({
      name: 'A',
      baseUrl: 'http://10.0.0.1:1234',
      authHeaderKeyRef: null,
    });

    const updated = await service.update(e.id, {
      name: 'Bench rig',
      baseUrl: 'http://10.0.0.9:5678',
    });

    expect(updated).toMatchObject({ name: 'Bench rig', baseUrl: 'http://10.0.0.9:5678' });
  });

  it('validates a replacement base URL with the same rules as add', async () => {
    const { service } = build();
    const e = await service.add({
      name: 'A',
      baseUrl: 'http://10.0.0.1:1234',
      authHeaderKeyRef: null,
    });

    await expect(service.update(e.id, { baseUrl: 'https://api.openai.com' })).rejects.toThrow(
      /local network/i,
    );
    // The rejected edit must not have partially landed.
    expect((await service.list())[0]?.baseUrl).toBe('http://10.0.0.1:1234');
  });

  it('resets status to "unknown" when the base URL changes', async () => {
    // A previous "reachable" verdict describes the OLD address. Keeping it
    // would show a green endpoint for a host nobody has ever probed.
    const { service, repo } = build();
    const e = await service.add({
      name: 'A',
      baseUrl: 'http://10.0.0.1:1234',
      authHeaderKeyRef: null,
    });
    await service.test(e.id);
    expect(repo.getById(e.id)?.status).toBe('reachable');

    const updated = await service.update(e.id, { baseUrl: 'http://10.0.0.2:1234' });
    expect(updated.status).toBe('unknown');
    expect(updated.lastCheckedAt).toBeNull();
    // Assert the STORED row, not just the returned object. Patching
    // `lastCheckedAt` onto the return value while the row kept its timestamp
    // is exactly the divergence this test exists to catch — the next `list()`
    // would show "never probed" beside a check time.
    expect(repo.getById(e.id)).toEqual(updated);
    expect(repo.getById(e.id)?.lastCheckedAt).toBeNull();
    expect(repo.getById(e.id)?.lastError).toBeNull();
  });

  it('clears a recorded probe error when the base URL changes', async () => {
    const { service, repo } = build({
      fetchFn: (async () => new Response('boom', { status: 502 })) as unknown as typeof fetch,
    });
    const e = await service.add({
      name: 'A',
      baseUrl: 'http://10.0.0.1:1234',
      authHeaderKeyRef: null,
    });
    await service.test(e.id);
    expect(repo.getById(e.id)?.lastError).toMatch(/502/);

    await service.update(e.id, { baseUrl: 'http://10.0.0.2:1234' });
    expect(repo.getById(e.id)?.lastError).toBeNull();
  });

  it('keeps the existing status when only the name changes', async () => {
    const { service } = build();
    const e = await service.add({
      name: 'A',
      baseUrl: 'http://10.0.0.1:1234',
      authHeaderKeyRef: null,
    });
    await service.test(e.id);

    expect((await service.update(e.id, { name: 'Renamed' })).status).toBe('reachable');
  });

  it('throws for an unknown endpoint', async () => {
    const { service } = build();
    await expect(service.update('ghost', { name: 'X' })).rejects.toThrow(/not found/i);
  });
});

describe('EndpointService — test (reachability probe)', () => {
  it('probes /v1/models and reports reachable with a measured latency', async () => {
    const fetchFn = vi.fn(async () => OK_MODELS());
    const { service } = build({
      fetchFn: fetchFn as unknown as typeof fetch,
      now: makeClock(0, 42),
    });
    const e = await service.add({
      name: 'A',
      baseUrl: 'http://10.0.0.1:1234',
      authHeaderKeyRef: null,
    });

    const result = await service.test(e.id);

    expect(result.reachable).toBe(true);
    expect(result.latencyMs).toBe(42);
    expect(result.error).toBeUndefined();
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe('http://10.0.0.1:1234/v1/models');
  });

  it('persists the probe verdict so the list reflects the last check', async () => {
    const { service, repo } = build();
    const e = await service.add({
      name: 'A',
      baseUrl: 'http://10.0.0.1:1234',
      authHeaderKeyRef: null,
    });

    await service.test(e.id);

    expect(repo.getById(e.id)).toMatchObject({ status: 'reachable', lastError: null });
    expect(repo.getById(e.id)?.lastCheckedAt).not.toBeNull();
  });

  it('sends the stored auth header when the endpoint has a key reference', async () => {
    const fetchFn = vi.fn(async () => OK_MODELS());
    const { service } = build({
      fetchFn: fetchFn as unknown as typeof fetch,
      secrets: { getEndpointAuthHeader: async () => 'Bearer lan-token-123' },
    });
    const e = await service.add({
      name: 'A',
      baseUrl: 'http://10.0.0.1:1234',
      authHeaderKeyRef: 'bench-rig',
    });

    await service.test(e.id);

    const init = fetchFn.mock.calls[0]?.[1] as FetchInit | undefined;
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer lan-token-123');
  });

  it('sends no auth header when the endpoint has no key reference', async () => {
    const fetchFn = vi.fn(async () => OK_MODELS());
    const { service } = build({ fetchFn: fetchFn as unknown as typeof fetch });
    const e = await service.add({
      name: 'A',
      baseUrl: 'http://10.0.0.1:1234',
      authHeaderKeyRef: null,
    });

    await service.test(e.id);

    const init = fetchFn.mock.calls[0]?.[1] as FetchInit | undefined;
    expect(new Headers(init?.headers).has('authorization')).toBe(false);
  });

  it.each([401, 403])('maps HTTP %i to endpoint-auth-failed', async (status) => {
    const { service, repo } = build({
      fetchFn: (async () => new Response('nope', { status })) as unknown as typeof fetch,
    });
    const e = await service.add({
      name: 'A',
      baseUrl: 'http://10.0.0.1:1234',
      authHeaderKeyRef: null,
    });

    const result = await service.test(e.id);

    expect(result.reachable).toBe(false);
    expect(result.error).toEqual({
      kind: 'endpoint-auth-failed',
      url: 'http://10.0.0.1:1234',
    });
    expect(repo.getById(e.id)?.status).toBe('auth-failed');
  });

  it('maps any other HTTP failure to endpoint-unreachable with the status code', async () => {
    const { service, repo } = build({
      fetchFn: (async () => new Response('boom', { status: 502 })) as unknown as typeof fetch,
    });
    const e = await service.add({
      name: 'A',
      baseUrl: 'http://10.0.0.1:1234',
      authHeaderKeyRef: null,
    });

    const result = await service.test(e.id);

    expect(result.error).toEqual({
      kind: 'endpoint-unreachable',
      url: 'http://10.0.0.1:1234',
      httpStatus: 502,
    });
    expect(repo.getById(e.id)?.status).toBe('unreachable');
    expect(repo.getById(e.id)?.lastError).toMatch(/502/);
  });

  it('maps a transport failure to endpoint-unreachable and records the reason', async () => {
    const { service, repo } = build({
      fetchFn: (async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.1:1234');
      }) as unknown as typeof fetch,
    });
    const e = await service.add({
      name: 'A',
      baseUrl: 'http://10.0.0.1:1234',
      authHeaderKeyRef: null,
    });

    const result = await service.test(e.id);

    expect(result.reachable).toBe(false);
    expect(result.error).toEqual({ kind: 'endpoint-unreachable', url: 'http://10.0.0.1:1234' });
    expect(repo.getById(e.id)?.lastError).toMatch(/ECONNREFUSED/);
  });

  it('aborts a hung probe instead of blocking forever', async () => {
    const fetchFn = vi.fn(
      (_url: unknown, init?: FetchInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const { service } = build({
      fetchFn: fetchFn as unknown as typeof fetch,
      probeTimeoutMs: 10,
    });
    const e = await service.add({
      name: 'A',
      baseUrl: 'http://10.0.0.1:1234',
      authHeaderKeyRef: null,
    });

    const result = await service.test(e.id);

    expect(result.reachable).toBe(false);
    expect(result.error).toMatchObject({ kind: 'endpoint-unreachable' });
  });

  it('never leaks the auth header value into the persisted error text', async () => {
    const { service, repo } = build({
      fetchFn: (async () => {
        throw new Error('request failed with header Bearer lan-token-123');
      }) as unknown as typeof fetch,
      secrets: { getEndpointAuthHeader: async () => 'Bearer lan-token-123' },
    });
    const e = await service.add({
      name: 'A',
      baseUrl: 'http://10.0.0.1:1234',
      authHeaderKeyRef: 'bench-rig',
    });

    await service.test(e.id);

    expect(repo.getById(e.id)?.lastError).not.toContain('lan-token-123');
  });

  it('throws a typed error for an unknown endpoint', async () => {
    const { service } = build();
    await expect(service.test('ghost')).rejects.toBeInstanceOf(EndpointServiceError);
  });

  it('does not follow redirects, so a LAN box cannot bounce the probe to a public host', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://collector.example.com/v1/models' },
        }),
    );
    const { service, repo } = build({ fetchFn: fetchFn as unknown as typeof fetch });
    const e = await service.add({
      name: 'A',
      baseUrl: 'http://10.0.0.1:1234',
      authHeaderKeyRef: null,
    });

    const result = await service.test(e.id);

    const init = fetchFn.mock.calls[0]?.[1] as FetchInit | undefined;
    expect(init?.redirect).toBe('manual');
    expect(result.reachable).toBe(false);
    expect(result.error).toEqual({
      kind: 'endpoint-unreachable',
      url: 'http://10.0.0.1:1234',
      httpStatus: 302,
    });
    expect(repo.getById(e.id)?.status).toBe('unreachable');
    expect(repo.getById(e.id)?.lastError).toMatch(/redirect/i);
  });
});
