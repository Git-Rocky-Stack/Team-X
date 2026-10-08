/**
 * EndpointService — Electron-main orchestrator for remote LAN GGUF endpoints
 * (v3.3.0 Local & Networked GGUF Support, spec § 7 / § 13).
 *
 * Backs the five `localGguf.endpoint.*` channels, which shipped in Phase 1 as
 * not-implemented stubs. LM Studio, Ollama, llama-server, KoboldCPP and vLLM
 * all expose an OpenAI-compatible `/v1/models`, so one probe covers every
 * supported server.
 *
 * House style mirrors `pool-service.ts` and `runtime-service.ts`: a pure
 * factory returning an object of methods (no class / `new` / `this`). Every
 * I/O dependency — the repo (narrowed to the structural slice consumed), the
 * keychain reader, `fetch`, and the clock — is injectable with a real default,
 * so unit tests drive it with fakes (no real network, no real keychain).
 *
 * ## The privacy contract is enforced here, not by the schema
 *
 * `local_model_endpoints.privacy_tier` is pinned to `'Local'` by a SQL CHECK,
 * and the type's doc says these endpoints are "local-network, never cloud".
 * A CHECK on a literal column value cannot enforce that — it only guarantees
 * the row carries the string `Local`, not that the URL points anywhere local.
 * Without a host check, a user could register `https://api.openai.com` and the
 * app would label a cloud provider as a Local-tier endpoint, then route
 * privacy-tier-filtered traffic to it. `assertLocalNetworkUrl` is where
 * that promise is actually kept, and it runs on both `add` and `update`. A
 * hostname is resolved and every address must be local; the probe re-resolves
 * before each request (DNS is not a property of the row) and never follows a
 * redirect off the LAN.
 *
 * ## Judgment calls (documented for review)
 *
 *   • Trailing slashes are stripped at write time so probe URLs never double
 *     up (`http://host:1234//v1/models`).
 *   • A duplicate `baseUrl` is rejected rather than silently inserted, matching
 *     `library-service.addFolder`'s duplicate-path stance. Two rows for one
 *     server produce two contradictory status lamps for the same box.
 *   • Changing `baseUrl` resets `status` to `'unknown'`. A prior `reachable`
 *     verdict describes the *old* address; carrying it over would show a green
 *     endpoint for a host nobody has probed.
 *   • `remove` on an unknown id is a no-op, not an error. The postcondition
 *     (the row is absent) already holds, and idempotent delete is what the
 *     repo layer does.
 *   • A probe never throws for a *reachable-but-unhappy* server. Transport
 *     failures, timeouts and HTTP errors all resolve to a typed
 *     {@link EndpointTestResult}; only a missing endpoint row throws, because
 *     there is nothing to report a verdict about.
 */

import type { LookupAddress } from 'node:dns';
import { lookup as dnsLookup } from 'node:dns/promises';

import type { EndpointStatus, LocalGgufError, RemoteEndpoint } from '@team-x/shared-types';

import type {
  InsertEndpointInput,
  UpdateEndpointConfigInput,
} from '../../db/repos/local-model-endpoints.js';
import type { EndpointTestResult } from '../../ipc/local-gguf-endpoint-handlers.js';

import { createLocalNetworkFetch } from './local-network-fetch.js';
import { nonLocalHostReason } from './local-network.js';

/** Default probe budget. Long enough for a cold LAN server, short enough to feel live. */
const DEFAULT_PROBE_TIMEOUT_MS = 5_000;

/** Statuses a `fetch` would follow under the default `redirect: 'follow'`. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Narrow structural slice of the local-model-endpoints repo this service consumes. */
export interface EndpointServiceRepo {
  list(): RemoteEndpoint[];
  getById(id: string): RemoteEndpoint | null;
  insert(input: InsertEndpointInput): RemoteEndpoint;
  updateConfig(id: string, input: UpdateEndpointConfigInput): RemoteEndpoint;
  updateStatus(id: string, status: EndpointStatus, lastError: string | null): RemoteEndpoint;
  /** Reset status to 'unknown' and clear `lastCheckedAt` / `lastError`. */
  clearStatus(id: string): RemoteEndpoint;
  remove(id: string): void;
}

/** Narrow structural slice of {@link SecretsStore} — read-only, by design. */
export interface EndpointSecrets {
  getEndpointAuthHeader(keyRef: string): Promise<string | null>;
}

export interface EndpointServiceDeps {
  repo: EndpointServiceRepo;
  /** Keychain reader for `authHeaderKeyRef`. Omitted means "no endpoint uses auth". */
  secrets?: EndpointSecrets;
  /**
   * HTTP client; defaults to {@link createLocalNetworkFetch}, which checks the
   * address each socket connects to, so DNS rebinding between the check
   * below and the connection cannot reach a public host.
   */
  fetchFn?: typeof fetch;
  /** Clock for latency measurement; defaults to `Date.now`. */
  now?: () => number;
  /** Per-probe timeout; defaults to {@link DEFAULT_PROBE_TIMEOUT_MS}. Also bounds each DNS lookup. */
  probeTimeoutMs?: number;
  /**
   * Resolves a hostname to every address it maps to; defaults to
   * `dns.promises.lookup` (the OS resolver — hosts file, mDNS, search
   * domains — i.e. exactly what a later connection would use).
   */
  lookup?: (hostname: string, options: { all: true }) => Promise<LookupAddress[]>;
}

export interface EndpointAddConfig {
  name: string;
  baseUrl: string;
  authHeaderKeyRef: string | null;
}

export interface EndpointUpdateConfig {
  name?: string;
  baseUrl?: string;
  authHeaderKeyRef?: string | null;
}

export interface EndpointService {
  list(): Promise<RemoteEndpoint[]>;
  add(config: EndpointAddConfig): Promise<RemoteEndpoint>;
  remove(id: string): Promise<void>;
  test(id: string): Promise<EndpointTestResult>;
  update(id: string, partial: EndpointUpdateConfig): Promise<RemoteEndpoint>;
}

/**
 * Carries a typed {@link LocalGgufError} so the IPC layer can surface a
 * structured kind to the renderer rather than a bare `Error`. Mirrors
 * `RuntimeServiceError`.
 */
export class EndpointServiceError extends Error {
  constructor(
    message: string,
    public readonly error?: LocalGgufError,
  ) {
    super(message);
    this.name = 'EndpointServiceError';
  }
}

// Host classification lives in ./local-network.ts; re-exported for callers
// that import it from here.
export { classifyHost, isLocalNetworkAddress, nonLocalHostReason } from './local-network.js';

/**
 * Parse a candidate endpoint URL and check its scheme.
 *
 * @returns the parsed URL; its `origin` is the canonical form to persist.
 * @throws {EndpointServiceError} when unparseable or non-HTTP(S).
 */
function parseEndpointUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new EndpointServiceError(`"${raw}" is not a valid URL.`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new EndpointServiceError(
      `Endpoint URLs must use http or https; got "${url.protocol.replace(':', '')}".`,
    );
  }
  return url;
}

// ---------------------------------------------------------------------------

export function createEndpointService(deps: EndpointServiceDeps): EndpointService {
  const now = deps.now ?? Date.now;
  const probeTimeoutMs = deps.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const lookup = deps.lookup ?? ((hostname: string) => dnsLookup(hostname, { all: true }));
  const fetchFn = deps.fetchFn ?? createLocalNetworkFetch({ lookup });

  const nonLocalReason = (hostname: string): Promise<string | null> =>
    nonLocalHostReason(hostname, { lookup, timeoutMs: probeTimeoutMs });

  /**
   * Parse, validate and canonicalize a candidate endpoint URL.
   *
   * @returns the origin form with no trailing slash.
   * @throws {EndpointServiceError} when unparseable, non-HTTP(S), or non-local.
   */
  async function assertLocalNetworkUrl(raw: string): Promise<string> {
    const url = parseEndpointUrl(raw);
    const reason = await nonLocalReason(url.hostname);
    if (reason !== null) {
      throw new EndpointServiceError(reason, { kind: 'endpoint-unreachable', url: raw });
    }
    // `url.origin` drops any path, query and fragment, and never has a trailing
    // slash — exactly the canonical form we want to persist and probe against.
    return url.origin;
  }

  function requireEndpoint(id: string): RemoteEndpoint {
    const row = deps.repo.getById(id);
    if (!row) throw new EndpointServiceError(`Endpoint ${id} not found.`);
    return row;
  }

  /**
   * Resolve the `Authorization` header value for an endpoint, if any.
   *
   * A keychain miss is not fatal: the probe still runs, and an authenticated
   * server answers 401, which the caller sees as `endpoint-auth-failed`. That
   * is a truer diagnosis than refusing to probe at all.
   */
  async function resolveAuthHeader(endpoint: RemoteEndpoint): Promise<string | null> {
    if (!endpoint.authHeaderKeyRef || !deps.secrets) return null;
    try {
      return await deps.secrets.getEndpointAuthHeader(endpoint.authHeaderKeyRef);
    } catch (err) {
      console.warn('[endpoint-service] failed to read auth header from the keychain', err);
      return null;
    }
  }

  /**
   * Strip a secret from text destined for the DB or the renderer.
   *
   * Transport errors sometimes echo request headers back in their message.
   * `last_error` is displayed in Settings and persisted in plaintext, so the
   * token must never reach it. Same posture as the URL-credential redaction
   * elsewhere in the codebase: scrub the message, not just the obvious field.
   */
  function redact(text: string, secret: string | null): string {
    return secret ? text.split(secret).join('[redacted]') : text;
  }

  async function probe(
    endpoint: RemoteEndpoint,
  ): Promise<{ result: EndpointTestResult; status: EndpointStatus; lastError: string | null }> {
    // Re-check where the host points NOW, before any byte (or the auth
    // header) leaves the machine. The row was validated when written, but a
    // name's DNS answer is not a property of the row.
    const reason = await nonLocalReason(new URL(endpoint.baseUrl).hostname);
    if (reason !== null) {
      return {
        result: {
          reachable: false,
          error: { kind: 'endpoint-unreachable', url: endpoint.baseUrl },
        },
        status: 'unreachable',
        lastError: reason,
      };
    }

    const authHeader = await resolveAuthHeader(endpoint);
    const headers: Record<string, string> = { accept: 'application/json' };
    if (authHeader) headers.authorization = authHeader;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), probeTimeoutMs);
    const startedAt = now();

    try {
      const response = await fetchFn(`${endpoint.baseUrl}/v1/models`, {
        method: 'GET',
        headers,
        signal: controller.signal,
        // A LAN box must not be able to bounce the probe — auth header and
        // all — to a public host. A redirect is a failed probe, not a hop.
        redirect: 'manual',
      });
      const latencyMs = now() - startedAt;

      // Node's fetch hands back the real 3xx under `manual`; a browser-style
      // runtime returns an opaque redirect with status 0. Treat both alike.
      if (response.type === 'opaqueredirect' || REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get('location');
        return {
          result: {
            reachable: false,
            latencyMs,
            error: {
              kind: 'endpoint-unreachable',
              url: endpoint.baseUrl,
              httpStatus: response.status,
            },
          },
          status: 'unreachable',
          lastError: `HTTP ${response.status} redirect${location ? ` to ${location}` : ''} — endpoints must answer /v1/models directly; redirects are not followed.`,
        };
      }

      if (response.ok) {
        return { result: { reachable: true, latencyMs }, status: 'reachable', lastError: null };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          result: {
            reachable: false,
            latencyMs,
            error: { kind: 'endpoint-auth-failed', url: endpoint.baseUrl },
          },
          status: 'auth-failed',
          lastError: `HTTP ${response.status} — authentication rejected.`,
        };
      }

      return {
        result: {
          reachable: false,
          latencyMs,
          error: {
            kind: 'endpoint-unreachable',
            url: endpoint.baseUrl,
            httpStatus: response.status,
          },
        },
        status: 'unreachable',
        lastError: `HTTP ${response.status} — ${response.statusText || 'request failed'}.`,
      };
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const aborted = err instanceof Error && err.name === 'AbortError';
      const message = aborted ? `Timed out after ${probeTimeoutMs} ms.` : raw;
      return {
        result: {
          reachable: false,
          error: { kind: 'endpoint-unreachable', url: endpoint.baseUrl },
        },
        status: 'unreachable',
        lastError: redact(message, authHeader),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async list(): Promise<RemoteEndpoint[]> {
      return deps.repo.list();
    },

    async add(config: EndpointAddConfig): Promise<RemoteEndpoint> {
      const name = config.name.trim();
      if (name.length === 0) {
        throw new EndpointServiceError('Endpoint name is required.');
      }
      const baseUrl = await assertLocalNetworkUrl(config.baseUrl);

      if (deps.repo.list().some((e) => e.baseUrl === baseUrl)) {
        throw new EndpointServiceError(`An endpoint for ${baseUrl} already exists.`);
      }

      return deps.repo.insert({
        name,
        baseUrl,
        authHeaderKeyRef: config.authHeaderKeyRef,
      });
    },

    async remove(id: string): Promise<void> {
      deps.repo.remove(id);
    },

    async update(id: string, partial: EndpointUpdateConfig): Promise<RemoteEndpoint> {
      const existing = requireEndpoint(id);

      const patch: UpdateEndpointConfigInput = {};

      if (partial.name !== undefined) {
        const name = partial.name.trim();
        if (name.length === 0) throw new EndpointServiceError('Endpoint name is required.');
        patch.name = name;
      }

      let baseUrlChanged = false;
      if (partial.baseUrl !== undefined) {
        // Validate BEFORE any write so a rejected edit leaves the row intact.
        const baseUrl = await assertLocalNetworkUrl(partial.baseUrl);
        if (baseUrl !== existing.baseUrl) {
          if (deps.repo.list().some((e) => e.id !== id && e.baseUrl === baseUrl)) {
            throw new EndpointServiceError(`An endpoint for ${baseUrl} already exists.`);
          }
          baseUrlChanged = true;
        }
        patch.baseUrl = baseUrl;
      }

      if ('authHeaderKeyRef' in partial) {
        patch.authHeaderKeyRef = partial.authHeaderKeyRef ?? null;
      }

      const updated = deps.repo.updateConfig(id, patch);
      if (!baseUrlChanged) return updated;

      // The stored verdict described the previous address. Clear it rather
      // than let a stale "reachable" describe a host nobody has probed.
      // `clearStatus`, not `updateStatus`: the latter always stamps
      // last_checked_at = now, which would leave the row claiming it had
      // never been probed and been checked a moment ago at the same time.
      return deps.repo.clearStatus(id);
    },

    async test(id: string): Promise<EndpointTestResult> {
      const endpoint = requireEndpoint(id);
      const { result, status, lastError } = await probe(endpoint);
      try {
        deps.repo.updateStatus(id, status, lastError);
      } catch (err) {
        // A persistence failure must not swallow a verdict the caller is
        // waiting on — the probe already happened and its answer is real.
        console.warn('[endpoint-service] failed to persist probe verdict', err);
      }
      return result;
    },
  };
}
