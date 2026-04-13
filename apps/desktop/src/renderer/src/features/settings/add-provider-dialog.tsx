/**
 * AddProviderDialog — register a new LLM provider.
 *
 * Phase 3 — M18.
 */

import type { PrivacyTier, ProviderKind } from '@team-x/shared-types';
import { useState } from 'react';

import { Button } from '@/components/ui/button.js';
import { Dialog } from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { useAddProvider } from '@/hooks/use-providers.js';

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

interface KindOption {
  value: ProviderKind;
  label: string;
  defaultTier: PrivacyTier;
  needsKey: boolean;
  needsBaseUrl: boolean;
}

const KIND_OPTIONS: KindOption[] = [
  {
    value: 'ollama',
    label: 'Ollama (Local)',
    defaultTier: 'local',
    needsKey: false,
    needsBaseUrl: false,
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    defaultTier: 'proprietary-cloud',
    needsKey: true,
    needsBaseUrl: false,
  },
  {
    value: 'openai',
    label: 'OpenAI',
    defaultTier: 'proprietary-cloud',
    needsKey: true,
    needsBaseUrl: false,
  },
  {
    value: 'google',
    label: 'Google AI',
    defaultTier: 'proprietary-cloud',
    needsKey: true,
    needsBaseUrl: false,
  },
  {
    value: 'groq',
    label: 'Groq',
    defaultTier: 'proprietary-cloud',
    needsKey: true,
    needsBaseUrl: false,
  },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    defaultTier: 'open-source-cloud',
    needsKey: true,
    needsBaseUrl: false,
  },
  {
    value: 'together',
    label: 'Together AI',
    defaultTier: 'open-source-cloud',
    needsKey: true,
    needsBaseUrl: false,
  },
  {
    value: 'fireworks',
    label: 'Fireworks AI',
    defaultTier: 'open-source-cloud',
    needsKey: true,
    needsBaseUrl: false,
  },
  {
    value: 'custom-openai',
    label: 'Custom (OpenAI-compatible)',
    defaultTier: 'proprietary-cloud',
    needsKey: true,
    needsBaseUrl: true,
  },
];

const TIER_OPTIONS: { value: PrivacyTier; label: string }[] = [
  { value: 'local', label: 'Local' },
  { value: 'open-source-cloud', label: 'Open-source Cloud' },
  { value: 'proprietary-cloud', label: 'Proprietary Cloud' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AddProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddProviderDialog({ open, onOpenChange }: AddProviderDialogProps) {
  const addMut = useAddProvider();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<ProviderKind>('anthropic');
  const [privacyTier, setPrivacyTier] = useState<PrivacyTier>('proprietary-cloud');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');

  const kindMeta = KIND_OPTIONS.find((o) => o.value === kind);

  function resetForm() {
    setName('');
    setKind('anthropic');
    setPrivacyTier('proprietary-cloud');
    setApiKey('');
    setBaseUrl('');
  }

  function handleKindChange(newKind: ProviderKind) {
    setKind(newKind);
    const meta = KIND_OPTIONS.find((o) => o.value === newKind);
    if (meta) setPrivacyTier(meta.defaultTier);
    if (!name || KIND_OPTIONS.some((o) => o.label === name)) {
      setName(meta?.label ?? '');
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const configJson = baseUrl.trim() ? JSON.stringify({ baseUrl: baseUrl.trim() }) : undefined;

    addMut.mutate(
      {
        name: name.trim(),
        kind,
        privacyTier,
        apiKey: apiKey.trim() || undefined,
        configJson,
      },
      {
        onSuccess: () => {
          resetForm();
          onOpenChange(false);
        },
      },
    );
  }

  // Shared input styling to match native selects with the Input component
  const selectClass =
    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className={`fixed inset-0 z-50 ${open ? 'block' : 'hidden'}`} aria-hidden={!open}>
        <div
          className="fixed inset-0 bg-black/50"
          onClick={() => onOpenChange(false)}
          onKeyDown={() => {}}
          role="presentation"
        />
        <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-6 shadow-xl">
          <h2 className="text-base font-semibold text-foreground">Add Provider</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Register a new LLM provider for your agents to use.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
            {/* Kind */}
            <div>
              <label htmlFor="provider-kind" className="text-xs font-medium text-muted-foreground">
                Provider Type *
              </label>
              <select
                id="provider-kind"
                value={kind}
                onChange={(e) => handleKindChange(e.target.value as ProviderKind)}
                className={`${selectClass} mt-1`}
              >
                {KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Name */}
            <div>
              <label htmlFor="provider-name" className="text-xs font-medium text-muted-foreground">
                Display Name *
              </label>
              <Input
                id="provider-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. My OpenAI Account"
                className="mt-1 text-sm"
              />
            </div>

            {/* Privacy Tier */}
            <div>
              <label htmlFor="provider-tier" className="text-xs font-medium text-muted-foreground">
                Privacy Tier
              </label>
              <select
                id="provider-tier"
                value={privacyTier}
                onChange={(e) => setPrivacyTier(e.target.value as PrivacyTier)}
                className={`${selectClass} mt-1`}
              >
                {TIER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {/* API Key (conditional) */}
            {kindMeta?.needsKey && (
              <div>
                <label htmlFor="provider-key" className="text-xs font-medium text-muted-foreground">
                  API Key
                </label>
                <Input
                  id="provider-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="mt-1 text-sm font-mono"
                />
                <p className="mt-1 text-[11px] text-muted-foreground/70">
                  Stored in your OS keychain. Never saved to disk.
                </p>
              </div>
            )}

            {/* Base URL (conditional) */}
            {kindMeta?.needsBaseUrl && (
              <div>
                <label htmlFor="provider-url" className="text-xs font-medium text-muted-foreground">
                  Base URL *
                </label>
                <Input
                  id="provider-url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://my-llm-server.example.com/v1"
                  className="mt-1 text-sm font-mono"
                />
              </div>
            )}

            {/* Footer buttons */}
            <div className="mt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  resetForm();
                  onOpenChange(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!name.trim() || addMut.isPending}>
                {addMut.isPending ? 'Adding...' : 'Add Provider'}
              </Button>
            </div>

            {addMut.isError && (
              <p className="text-xs text-destructive mt-1">
                Failed to add provider. Check your inputs and try again.
              </p>
            )}
          </form>
        </div>
      </div>
    </Dialog>
  );
}
