/**
 * ProvidersSection — grid of provider cards with add-provider action.
 *
 * Phase 3 — M18.
 */

import { useState } from 'react';

import { AddProviderDialog } from './add-provider-dialog.js';
import { ProviderCard } from './provider-card.js';

import { Faceplate, SubviewState } from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
import { useProviders } from '@/hooks/use-providers.js';

export function ProvidersSection() {
  const { data: providers = [], isLoading, isError, refetch } = useProviders();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <>
      <Faceplate kicker="Console" serial="PROVIDERS" bodyClassName="space-y-4">
        <div className="flex items-center justify-between">
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
          <SubviewState
            lampLabel="SYNC"
            lampTone="hold"
            title="Loading providers…"
            className="min-h-0 p-6"
          />
        ) : isError ? (
          <SubviewState
            lampLabel="NO-GO"
            lampTone="nogo"
            title="Failed to load providers."
            action={
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            }
            className="min-h-0 p-6"
          />
        ) : providers.length === 0 ? (
          <SubviewState
            lampLabel="STBY"
            lampTone="off"
            title="No providers configured."
            description="Add a provider to start running AI agents."
            className="min-h-0 p-6"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {providers.map((p) => (
              <ProviderCard key={p.id} provider={p} />
            ))}
          </div>
        )}
      </Faceplate>

      <AddProviderDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}
