/**
 * PrivacySection — privacy tier selector, the tier's run-time consequence
 * (which configured providers it refuses), and per-provider availability.
 *
 * The tier is enforced in the main process: the provider factory refuses any
 * run or embedding call on a provider above it. The "Blocked at this tier"
 * well shows that consequence up front, so the operator learns which
 * employees will stop running before a run fails rather than after.
 *
 * Phase 3 — M19.
 */

import type { PrivacyTier } from '@team-x/shared-types';
import { Loader2 } from 'lucide-react';

import {
  Faceplate,
  LampTile,
  RecessedWell,
  SubviewState,
  Tag,
} from '@/components/console/index.js';
import { usePrivacySettings, useSetPrivacy } from '@/hooks/use-settings.js';
import { cn } from '@/lib/utils.js';

interface TierOption {
  value: PrivacyTier;
  label: string;
  description: string;
}

const TIERS: TierOption[] = [
  {
    value: 'local',
    label: 'Local Only',
    description: 'Only local providers (Ollama). No data leaves your machine.',
  },
  {
    value: 'open-source-cloud',
    label: 'Open-Source Cloud',
    description: 'Local + open-source cloud providers (Groq, Together, Fireworks, OpenRouter).',
  },
  {
    value: 'proprietary-cloud',
    label: 'All Providers',
    description: 'No restrictions. Includes proprietary APIs (Anthropic, OpenAI, Google).',
  },
];

/**
 * Tier-risk LED, expressed in console tokens (replaces the legacy per-tier
 * selection-tint variants): local = safe go-green, open-source =
 * informational scope-cyan, proprietary = caution hold-amber.
 */
const TIER_LED: Record<PrivacyTier, string> = {
  local: 'bg-[var(--led-go)]',
  'open-source-cloud': 'bg-[var(--led-scope)]',
  'proprietary-cloud': 'bg-[var(--led-hold)]',
};

/** Provider-side tier names — same wording as the main-process refusal. */
const PROVIDER_TIER_NAME: Record<PrivacyTier, string> = {
  local: 'Local',
  'open-source-cloud': 'Open-Source Cloud',
  'proprietary-cloud': 'Proprietary Cloud',
};

export function PrivacySection() {
  const { data, isLoading } = usePrivacySettings();
  const setPrivacy = useSetPrivacy();

  if (isLoading || !data) {
    return (
      <Faceplate kicker="Privacy" serial="TIER" bodyClassName="space-y-3">
        <h2 className="text-h2 text-foreground">Privacy Tier</h2>
        <SubviewState
          lampLabel="SYNC"
          lampTone="hold"
          title="Loading privacy tier…"
          className="min-h-0 p-6"
        />
      </Faceplate>
    );
  }

  const { maxTier, availableProviders, blockedProviders, retrievalEmbeddingProviderId } = data;
  const retrievalProvider =
    blockedProviders.find((p) => p.id === retrievalEmbeddingProviderId) ?? null;
  const maxTierLabel = TIERS.find((t) => t.value === maxTier)?.label ?? maxTier;

  return (
    <Faceplate kicker="Privacy" serial="TIER" bodyClassName="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-h2 text-foreground">Privacy Tier</h2>
        {setPrivacy.isPending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>

      {/* Tier selector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        {TIERS.map((opt) => {
          const isActive = maxTier === opt.value;
          return (
            <button
              type="button"
              key={opt.value}
              onClick={() => setPrivacy.mutate({ maxTier: opt.value })}
              disabled={setPrivacy.isPending}
              className={cn(
                'flex flex-col items-start rounded-lg border p-3 text-left transition-colors',
                isActive
                  ? 'border-[var(--armed-edge)] bg-[var(--armed-soft)] text-foreground'
                  : 'border-[var(--hairline)] bg-transparent text-muted-foreground hover:border-[var(--hairline-strong)]',
              )}
            >
              <span className="flex items-center gap-2 text-body-strong">
                <span
                  aria-hidden="true"
                  className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TIER_LED[opt.value])}
                />
                {opt.label}
              </span>
              <span className="text-caption mt-0.5 opacity-70">{opt.description}</span>
            </button>
          );
        })}
      </div>

      {/* Run-time consequence: configured providers this tier refuses */}
      <div className="space-y-2">
        <h3 className="text-eyebrow-sm text-silver-mute uppercase tracking-[0.14em]">
          Blocked at this tier
        </h3>
        <RecessedWell className="overflow-hidden p-0" data-privacy-blocked="">
          {blockedProviders.length === 0 ? (
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="text-caption text-[var(--display-fg)]">
                No configured provider is blocked at this tier.
              </p>
              <LampTile small interactive={false} label="CLEAR" tone="go" />
            </div>
          ) : (
            <>
              <p className="max-w-[72ch] px-4 pt-3 pb-2 text-caption text-[var(--display-fg-mute)] leading-relaxed">
                Employees on these providers will refuse to run under {maxTierLabel}. Move them to
                an allowed provider or raise the tier.
              </p>
              {retrievalProvider ? (
                <p className="max-w-[72ch] px-4 pb-2 text-caption text-[var(--display-fg-mute)] leading-relaxed">
                  Retrieval embeds through {retrievalProvider.name}: chats keep ticket, goal,
                  project and vault context, but semantic search pauses and new content is not
                  indexed. Choose an allowed embedding provider in Settings → Retrieval, or raise
                  the tier and rebuild the index there.
                </p>
              ) : null}
              <ul className="divide-y divide-[var(--hairline)] border-[var(--hairline)] border-t">
                {blockedProviders.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-body-strong text-[var(--display-fg)]">
                        {p.name}
                      </span>
                      <Tag>{PROVIDER_TIER_NAME[p.privacyTier] ?? p.privacyTier}</Tag>
                      {p.id === retrievalEmbeddingProviderId ? <Tag>Retrieval</Tag> : null}
                    </div>
                    <LampTile small interactive={false} label="NO-GO" tone="nogo" />
                  </li>
                ))}
              </ul>
            </>
          )}
        </RecessedWell>
      </div>

      {/* Provider availability */}
      {availableProviders.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-eyebrow-sm text-silver-mute uppercase tracking-[0.14em]">
            Provider availability
          </h3>
          <RecessedWell className="divide-y divide-[var(--hairline)]">
            {availableProviders.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-body-strong text-[var(--display-fg)] truncate">
                    {p.name}
                  </span>
                  <Tag mono>{p.kind}</Tag>
                </div>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-caption text-[var(--display-fg-mute)]">
                    {p.allowed ? 'Allowed' : 'Blocked'}
                  </span>
                  <LampTile
                    small
                    interactive={false}
                    label={p.allowed ? 'GO' : 'NO-GO'}
                    tone={p.allowed ? 'go' : 'nogo'}
                  />
                </span>
              </div>
            ))}
          </RecessedWell>
        </div>
      )}
    </Faceplate>
  );
}
