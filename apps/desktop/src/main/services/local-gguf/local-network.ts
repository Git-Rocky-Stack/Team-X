/**
 * Is a host on the local network? Shared by Local model endpoints, HTTP
 * runtimes under a Local privacy tier, and createLocalNetworkFetch, which
 * applies the same rule to the address a socket actually connects to.
 */

import type { LookupAddress } from 'node:dns';
import { lookup as dnsLookup } from 'node:dns/promises';

/** Default budget for a DNS lookup made to classify a host. */
const DEFAULT_LOOKUP_TIMEOUT_MS = 5_000;

/** `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`. */
function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  const octets = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : Number.NaN));
  if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = octets as [number, number, number, number];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

/** Loopback `::1`, link-local `fe80::/10`, unique-local `fc00::/7`. */
function isPrivateIpv6(host: string): boolean {
  // URL.hostname keeps the brackets off but preserves the zone-id form.
  const addr =
    host
      .replace(/^\[|\]$/g, '')
      .split('%')[0]
      ?.toLowerCase() ?? '';
  if (addr === '::1' || addr === '::') return true;
  // IPv4-mapped (::ffff:a.b.c.d, or the hex form URL canonicalizes it to):
  // a connection reaches the embedded IPv4 address, so that decides.
  const mapped = /^::ffff:(?:(\d{1,3}(?:\.\d{1,3}){3})|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/.exec(
    addr,
  );
  if (mapped) {
    if (mapped[1]) return isPrivateIpv4(mapped[1]);
    const hi = Number.parseInt(mapped[2] ?? '', 16);
    const lo = Number.parseInt(mapped[3] ?? '', 16);
    return isPrivateIpv4(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`);
  }
  if (/^f[cd][0-9a-f]{2}:/.test(addr)) return true; // fc00::/7
  if (/^fe[89ab][0-9a-f]:/.test(addr)) return true; // fe80::/10
  return false;
}

/** True when `address` (an IP literal, v4 or v6) is loopback / RFC1918 / link-local / ULA. */
export function isLocalNetworkAddress(address: string): boolean {
  return address.includes(':') ? isPrivateIpv6(address) : isPrivateIpv4(address);
}

/**
 * Classify `host` without touching the network.
 *
 *   • `'local'` / `'public'` — an IP literal or `localhost`, decided on sight.
 *   • `'resolve'` — a bare LAN name or an mDNS / `.localhost` name. These
 *     prove nothing on their own: `http://ai` is a real public TLD, and a
 *     search-suffix expansion can turn `bench-rig` into a public record. The
 *     verdict comes from resolving them ({@link EndpointService} does that).
 *
 * Deliberately conservative: any other dotted name is `'public'` without a
 * lookup. A false negative costs the user an explanatory error; a false
 * positive silently breaks the Local privacy tier, which is the whole point of
 * the table.
 */
export function classifyHost(host: string): 'local' | 'public' | 'resolve' {
  const h = host.toLowerCase();
  if (h === 'localhost') return 'local';
  if (h.includes(':') || h.startsWith('[')) return isPrivateIpv6(h) ? 'local' : 'public';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return isPrivateIpv4(h) ? 'local' : 'public';
  if (h.endsWith('.localhost') || h.endsWith('.local')) return 'resolve'; // mDNS / Bonjour
  if (!h.includes('.')) return 'resolve'; // LAN / NetBIOS / search-domain name
  return 'public';
}

const LOCAL_TIER_RULE =
  'Endpoints are Local privacy tier — they may only point at loopback, an RFC1918 / link-local address, or a .local / bare LAN hostname that resolves only to such addresses.';

/**
 * Why `hostname` is not provably on the local network, or null when it is.
 *
 * A name is resolved and EVERY address must be local: a client may connect
 * to any of them, so one public answer is enough to break the Local tier.
 * Endpoints run it on add / update and again before every probe, because DNS
 * can change after the row was written; runtime profiles run it before every
 * resolution under a Local privacy tier.
 */
export async function nonLocalHostReason(
  hostname: string,
  opts: {
    lookup?: (hostname: string, options: { all: true }) => Promise<LookupAddress[]>;
    timeoutMs?: number;
    /** The sentence that explains the rule; defaults to the endpoint rule. */
    rule?: string;
  } = {},
): Promise<string | null> {
  const rule = opts.rule ?? LOCAL_TIER_RULE;
  const lookup = opts.lookup ?? ((name: string) => dnsLookup(name, { all: true }));
  const probeTimeoutMs = opts.timeoutMs ?? DEFAULT_LOOKUP_TIMEOUT_MS;
  const kind = classifyHost(hostname);
  if (kind === 'local') return null;
  if (kind === 'public') return `"${hostname}" is not on the local network. ${rule}`;

  let addresses: LookupAddress[];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // getaddrinfo cannot be cancelled, so bound the wait instead of letting
    // a dead resolver hang an add or a probe.
    addresses = await Promise.race([
      lookup(hostname, { all: true }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`DNS lookup timed out after ${probeTimeoutMs} ms`)),
          probeTimeoutMs,
        );
      }),
    ]);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return `"${hostname}" could not be resolved (${detail}), so it cannot be confirmed to be on the local network.`;
  } finally {
    clearTimeout(timer);
  }

  if (addresses.length === 0) {
    return `"${hostname}" could not be resolved (no addresses), so it cannot be confirmed to be on the local network.`;
  }
  const outside = addresses.map((a) => a.address).filter((a) => !isLocalNetworkAddress(a));
  if (outside.length > 0) {
    return `"${hostname}" resolves to ${outside.join(', ')}, which is not on the local network. ${rule}`;
  }
  return null;
}
