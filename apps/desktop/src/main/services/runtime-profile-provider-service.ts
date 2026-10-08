import type { LookupAddress } from 'node:dns';

import type { ProviderStreamFn } from '@team-x/provider-router';
import type { PrivacyTier, RuntimeProfile } from '@team-x/shared-types';

import type { EmployeeRow } from '../db/repos/employees.js';

import type { ExternalRuntimeAdapters } from './external-runtime-adapters.js';
import { nonLocalHostReason } from './local-gguf/endpoint-service.js';
import {
  PrivacyTierViolationError,
  type ProviderFactory,
  exceedsPrivacyTier,
} from './provider-factory.js';
import type { RuntimeProfilesService } from './runtime-profiles-service.js';

/** How the refusal message names each external runtime kind. */
const RUNTIME_KIND_LABEL: Record<string, string> = {
  codex: 'Codex',
  'claude-code': 'Claude Code',
  cursor: 'Cursor',
  bash: 'command',
  http: 'HTTP',
};

const HTTP_LOCAL_RULE =
  'An HTTP runtime counts as Local only when its URL is loopback, an RFC1918 / link-local address, or a .local / bare LAN hostname that resolves only to such addresses.';

function getOptionalString(
  config: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = config?.[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface RuntimeProfileProviderServiceDeps {
  runtimeProfilesService: RuntimeProfilesService;
  providerFactory: ProviderFactory;
  externalRuntimeAdapters: ExternalRuntimeAdapters;
  /**
   * Settings → Privacy's max tier, read on every resolution. When present, an
   * external runtime above it is refused with a `PrivacyTierViolationError`
   * (Team-X-internal profiles are checked by the provider factory). Absent =
   * no enforcement.
   */
  getMaxPrivacyTier?: () => PrivacyTier;
  /** DNS resolver for HTTP runtimes on a bare LAN name; defaults to the OS resolver. */
  lookup?: (hostname: string, options: { all: true }) => Promise<LookupAddress[]>;
}

/**
 * The privacy tier an external runtime profile runs at, and why. Errs toward
 * the least private tier whenever locality cannot be shown:
 *
 *   - Codex, Claude Code and Cursor send prompts to their vendors' clouds,
 *     whether launched as a command or reached through an endpoint URL.
 *   - A command runtime can send data anywhere; Team-X cannot see where.
 *   - An HTTP runtime is Local only when its host is provably on the local
 *     network (the same rule Local model endpoints follow).
 */
async function classifyRuntimeTier(
  profile: RuntimeProfile,
  lookup: RuntimeProfileProviderServiceDeps['lookup'],
): Promise<{ tier: PrivacyTier; reason: string }> {
  switch (profile.kind) {
    case 'http': {
      const raw = getOptionalString(profile.config, 'baseUrl');
      let hostname: string | null = null;
      try {
        hostname = raw ? new URL(raw).hostname : null;
      } catch {
        hostname = null;
      }
      if (hostname === null) {
        return {
          tier: 'proprietary-cloud',
          reason: 'Its URL could not be read, so Team-X cannot confirm it stays local.',
        };
      }
      const nonLocal = await nonLocalHostReason(hostname, {
        ...(lookup ? { lookup } : {}),
        rule: HTTP_LOCAL_RULE,
      });
      return nonLocal === null
        ? { tier: 'local', reason: '' }
        : { tier: 'proprietary-cloud', reason: nonLocal };
    }
    case 'bash':
      return {
        tier: 'proprietary-cloud',
        reason:
          'A command runtime can send data to any service, so Team-X cannot confirm it stays local.',
      };
    default:
      return {
        tier: 'proprietary-cloud',
        reason: `${RUNTIME_KIND_LABEL[profile.kind] ?? profile.kind} sends prompts to its vendor's cloud service.`,
      };
  }
}

export interface RuntimeProfileProviderService {
  resolveForEmployee(employee: EmployeeRow): Promise<{
    providerName: string;
    providerKind?: string;
    model: string;
    stream: ProviderStreamFn;
  }>;
}

export function createRuntimeProfileProviderService(
  deps: RuntimeProfileProviderServiceDeps,
): RuntimeProfileProviderService {
  const { runtimeProfilesService, providerFactory, externalRuntimeAdapters, getMaxPrivacyTier } =
    deps;

  /**
   * Refuse `profile` when it runs above Settings → Privacy's max tier. Runs
   * after the adapter is built (building starts nothing — the stream is lazy)
   * and before it is handed to the orchestrator, so a refused runtime is
   * never spawned or called.
   */
  async function assertRuntimeAllowed(profile: RuntimeProfile): Promise<void> {
    if (getMaxPrivacyTier === undefined) return;
    const maxTier = getMaxPrivacyTier();
    // Every classification is at or below proprietary-cloud; skip the DNS
    // lookup when even that is allowed.
    if (!exceedsPrivacyTier({ privacyTier: 'proprietary-cloud' }, maxTier)) return;
    const { tier, reason } = await classifyRuntimeTier(profile, deps.lookup);
    if (!exceedsPrivacyTier({ privacyTier: tier }, maxTier)) return;
    throw new PrivacyTierViolationError({
      provider: { id: profile.id, name: profile.name, privacyTier: tier },
      model: RUNTIME_KIND_LABEL[profile.kind] ?? profile.kind,
      maxTier,
      remedyScope: 'employee',
      purpose: 'runtime',
      reason,
    });
  }

  return {
    async resolveForEmployee(employee: EmployeeRow): Promise<{
      providerName: string;
      providerKind?: string;
      model: string;
      stream: ProviderStreamFn;
    }> {
      const profile = runtimeProfilesService.getProfileForEmployee(employee.id);
      if (!profile || !profile.enabled) {
        return providerFactory.resolveForEmployee(employee);
      }

      if (profile.kind === 'teamx-internal') {
        const providerId = getOptionalString(profile.config, 'providerId');
        const model = getOptionalString(profile.config, 'model');
        if (providerId) {
          return providerFactory.create({
            providerId,
            ...(model ? { model } : {}),
          });
        }
        if (model) {
          const fallback = await providerFactory.resolveForEmployee(employee);
          return providerFactory.create({
            providerId: fallback.providerName,
            model,
          });
        }
        return providerFactory.resolveForEmployee(employee);
      }

      const adapted = externalRuntimeAdapters.createResolvedProvider({
        employee,
        profile,
      });
      if (adapted) {
        await assertRuntimeAllowed(profile);
        return adapted;
      }

      return providerFactory.resolveForEmployee(employee);
    },
  };
}
