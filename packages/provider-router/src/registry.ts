import type { PrivacyTier, ProviderConfig } from '@team-x/shared-types';

const TIER_ORDER: Record<PrivacyTier, number> = {
  local: 0,
  'open-source-cloud': 1,
  'proprietary-cloud': 2,
};

export interface PickOptions {
  preferred: string[];
  maxTier: PrivacyTier;
}

export interface ProviderRegistry {
  list(filter?: { maxTier?: PrivacyTier }): ProviderConfig[];
  pickProvider(opts: PickOptions): ProviderConfig | null;
}

export function createRegistry(providers: ProviderConfig[]): ProviderRegistry {
  const enabled = providers.filter((p) => p.enabled);

  function list(filter?: { maxTier?: PrivacyTier }) {
    if (!filter?.maxTier) return enabled;
    const limit = TIER_ORDER[filter.maxTier];
    return enabled.filter((p) => TIER_ORDER[p.privacyTier] <= limit);
  }

  function pickProvider({ preferred, maxTier }: PickOptions): ProviderConfig | null {
    const allowed = list({ maxTier });
    for (const id of preferred) {
      const hit = allowed.find((p) => p.id === id || p.kind === id);
      if (hit) return hit;
    }
    return null;
  }

  return { list, pickProvider };
}
