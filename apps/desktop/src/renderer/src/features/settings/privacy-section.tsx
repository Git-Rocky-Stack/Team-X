/**
 * PrivacySection — privacy tier selector + per-provider allowed/blocked indicator.
 *
 * Phase 3 — M19.
 */

import type { PrivacyTier } from '@team-x/shared-types';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

import { Faceplate, RecessedWell, SubviewState, Tag } from '@/components/console/index.js';
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

  const { maxTier, availableProviders } = data;

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

      {/* Provider availability */}
      {availableProviders.length > 0 && (
        <RecessedWell className="divide-y divide-[var(--hairline)]">
          {availableProviders.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-body-strong text-[var(--display-fg)] truncate">{p.name}</span>
                <Tag mono>{p.kind}</Tag>
              </div>
              {p.allowed ? (
                <span className="flex items-center gap-1 text-caption text-[var(--led-go)] shrink-0">
                  <CheckCircle2 className="h-3 w-3" /> Allowed
                </span>
              ) : (
                <span className="flex items-center gap-1 text-caption text-[var(--led-nogo)] shrink-0">
                  <XCircle className="h-3 w-3" /> Blocked
                </span>
              )}
            </div>
          ))}
        </RecessedWell>
      )}
    </Faceplate>
  );
}
