/**
 * ProvidersSection — grid of provider cards with add-provider action.
 *
 * Phase 3 — M18.
 */

import { useState } from 'react';

import { AddProviderDialog } from './add-provider-dialog.js';
import { ProviderCard } from './provider-card.js';

import { Button } from '@/components/ui/button.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useProviders } from '@/hooks/use-providers.js';

export function ProvidersSection() {
  const { data: providers = [], isLoading, isError, refetch } = useProviders();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-h2 text-foreground">AI Providers</h2>
          <p className="text-body-sm text-muted-foreground mt-1">
            Configure LLM providers and API keys for your agents.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
          Add Provider
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <Skeleton className="h-52 rounded-lg" />
          <Skeleton className="h-52 rounded-lg" />
          <Skeleton className="h-52 rounded-lg" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-body text-destructive">Failed to load providers.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : providers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-body text-muted-foreground">No providers configured.</p>
          <p className="text-caption text-muted-foreground/70 mt-1">
            Add a provider to start running AI agents.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {providers.map((p) => (
            <ProviderCard key={p.id} provider={p} />
          ))}
        </div>
      )}

      <AddProviderDialog open={addOpen} onOpenChange={setAddOpen} />
    </section>
  );
}
