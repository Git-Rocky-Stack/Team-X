/**
 * PrivacySection — privacy tier selector + per-provider allowed/blocked indicator.
 *
 * Phase 3 — M19.
 */

import type { PrivacyTier } from '@team-x/shared-types';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { usePrivacySettings, useSetPrivacy } from '@/hooks/use-settings.js';

interface TierOption {
  value: PrivacyTier;
  label: string;
  description: string;
  /** Color variant applied alongside `.brand-selected` when this tier is the active choice. */
  selectedVariant: 'brand-selected-green' | 'brand-selected-blue' | 'brand-selected-amber';
}

const TIERS: TierOption[] = [
  {
    value: 'local',
    label: 'Local Only',
    description: 'Only local providers (Ollama). No data leaves your machine.',
    selectedVariant: 'brand-selected-green',
  },
  {
    value: 'open-source-cloud',
    label: 'Open-Source Cloud',
    description: 'Local + open-source cloud providers (Groq, Together, Fireworks, OpenRouter).',
    selectedVariant: 'brand-selected-blue',
  },
  {
    value: 'proprietary-cloud',
    label: 'All Providers',
    description: 'No restrictions. Includes proprietary APIs (Anthropic, OpenAI, Google).',
    selectedVariant: 'brand-selected-amber',
  },
];

export function PrivacySection() {
  const { data, isLoading } = usePrivacySettings();
  const setPrivacy = useSetPrivacy();

  if (isLoading || !data) {
    return (
      <section className="space-y-3">
        <h2 className="text-h2 text-foreground">Privacy Tier</h2>
        <Skeleton className="h-24 rounded-lg" />
      </section>
    );
  }

  const { maxTier, availableProviders } = data;

  return (
    <section className="space-y-3">
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
              className={`
                flex flex-col items-start rounded-lg border p-3 text-left
                ${
                  isActive
                    ? `brand-selected ${opt.selectedVariant}`
                    : 'border-border bg-surface-50 text-muted-foreground transition-colors hover:border-foreground/20'
                }
              `}
            >
              <span className="text-body-strong">{opt.label}</span>
              <span className="text-caption mt-0.5 opacity-70">{opt.description}</span>
            </button>
          );
        })}
      </div>

      {/* Provider availability */}
      {availableProviders.length > 0 && (
        <div className="rounded-lg border border-border bg-surface-50 divide-y divide-border">
          {availableProviders.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-body-strong text-foreground truncate">{p.name}</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono shrink-0">
                  {p.kind}
                </Badge>
              </div>
              {p.allowed ? (
                <span className="flex items-center gap-1 text-caption text-green-400 shrink-0">
                  <CheckCircle2 className="h-3 w-3" /> Allowed
                </span>
              ) : (
                <span className="flex items-center gap-1 text-caption text-destructive shrink-0">
                  <XCircle className="h-3 w-3" /> Blocked
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
