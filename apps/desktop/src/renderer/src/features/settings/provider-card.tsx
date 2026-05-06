/**
 * ProviderCard — individual provider configuration card.
 *
 * Shows provider name, kind, privacy tier, enabled state.
 * Inline API key input for keyed providers (non-Ollama).
 * Test connection + remove actions.
 *
 * Phase 3 — M18.
 */

import type { PrivacyTier, ProviderConfig } from '@team-x/shared-types';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import {
  useProviderModels,
  useRemoveProvider,
  useTestProviderConnection,
  useUpdateProvider,
} from '@/hooks/use-providers.js';

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const TIER_STYLE: Record<PrivacyTier, string> = {
  local: 'text-green-400 border-green-400/30',
  'open-source-cloud': 'text-blue-400 border-blue-400/30',
  'proprietary-cloud': 'text-amber-400 border-amber-400/30',
};

const TIER_LABEL: Record<PrivacyTier, string> = {
  local: 'Local',
  'open-source-cloud': 'Open-source Cloud',
  'proprietary-cloud': 'Proprietary Cloud',
};

/** Providers that do not require an API key. */
const KEYLESS_KINDS = new Set(['ollama']);

/**
 * Curated Ollama Cloud tags surfaced in the desktop app and official docs.
 * These are suggestions only — the user can still type any valid tag manually.
 */
const CURATED_OLLAMA_CLOUD_MODELS = [
  'gpt-oss:120b-cloud',
  'gpt-oss:20b-cloud',
  'deepseek-v3.1:671b-cloud',
  'qwen3-coder:480b-cloud',
  'glm-5.1:cloud',
  'minimax-m2.7:cloud',
  'kimi-k2.5:cloud',
  'gemma4:31b-cloud',
  'qwen3.5:397b-cloud',
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ProviderCardProps {
  provider: ProviderConfig;
}

export function ProviderCard({ provider }: ProviderCardProps) {
  const updateMut = useUpdateProvider();
  const removeMut = useRemoveProvider();
  const testMut = useTestProviderConnection();
  const modelQuery = useProviderModels(provider.id, provider.kind === 'ollama');

  const [apiKey, setApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [ollamaModel, setOllamaModel] = useState(provider.defaultModel ?? '');

  const needsKey = !KEYLESS_KINDS.has(provider.kind);
  const isBusy = updateMut.isPending || removeMut.isPending;
  const isOllama = provider.kind === 'ollama';
  const persistedOllamaModel = provider.defaultModel ?? '';
  const hasUnsavedOllamaModel = ollamaModel.trim() !== persistedOllamaModel.trim();
  const allOllamaModels = modelQuery.data?.models ?? [];
  const detectedLocalModels = allOllamaModels.filter((model) => !model.includes('cloud'));
  const detectedCloudModels = allOllamaModels.filter((model) => model.includes('cloud'));
  const suggestedCloudModels = CURATED_OLLAMA_CLOUD_MODELS.filter(
    (model) => !allOllamaModels.includes(model),
  );

  useEffect(() => {
    setOllamaModel(provider.defaultModel ?? '');
  }, [provider.defaultModel]);

  function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
  }

  function saveOllamaModel(nextModel: string) {
    const trimmedModel = nextModel.trim();
    const nextConfig: { baseUrl?: string; defaultModel?: string } = {};
    if (provider.baseUrl?.trim()) nextConfig.baseUrl = provider.baseUrl.trim();
    if (trimmedModel) nextConfig.defaultModel = trimmedModel;
    updateMut.mutate({
      providerId: provider.id,
      configJson: JSON.stringify(nextConfig),
    });
  }

  // ---- Toggle enabled/disabled ---------------------------------------------
  function handleToggle() {
    updateMut.mutate({
      providerId: provider.id,
      enabled: !provider.enabled,
    });
  }

  // ---- Save API key --------------------------------------------------------
  function handleSaveKey(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    updateMut.mutate(
      { providerId: provider.id, apiKey: apiKey.trim() },
      {
        onSuccess: () => {
          setApiKey('');
          setShowKeyInput(false);
        },
      },
    );
  }

  // ---- Test connection -----------------------------------------------------
  function handleTest() {
    testMut.mutate(provider.id);
  }

  function handleSaveModel(e: React.FormEvent) {
    e.preventDefault();
    saveOllamaModel(ollamaModel);
  }

  // ---- Remove provider -----------------------------------------------------
  function handleRemove() {
    removeMut.mutate(provider.id);
  }

  return (
    <div className="flex flex-col rounded-lg border border-border bg-surface-50 overflow-hidden">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-100 text-xs font-bold uppercase text-muted-foreground">
            {provider.kind.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{provider.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                {provider.kind}
              </Badge>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 ${TIER_STYLE[provider.privacyTier]}`}
              >
                {TIER_LABEL[provider.privacyTier]}
              </Badge>
            </div>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleToggle}
          disabled={isBusy}
          className={`shrink-0 gap-1.5 text-xs ${
            provider.enabled
              ? 'text-green-400 border-green-400/30 hover:bg-green-400/10'
              : 'text-muted-foreground'
          }`}
        >
          {provider.enabled ? 'Enabled' : 'Disabled'}
        </Button>
      </div>

      {/* ---- Base URL (if set) ---- */}
      {provider.baseUrl && (
        <div className="px-4 pb-1">
          <p className="text-[11px] text-muted-foreground/70 font-mono truncate">
            {provider.baseUrl}
          </p>
        </div>
      )}

      {isOllama && (
        <div className="border-t border-border px-4 py-3">
          <label
            htmlFor={`provider-model-${provider.id}`}
            className="text-xs font-medium text-muted-foreground"
          >
            Default Model
          </label>
          <form onSubmit={handleSaveModel} className="mt-2 flex gap-2">
            <Input
              id={`provider-model-${provider.id}`}
              value={ollamaModel}
              onChange={(e) => setOllamaModel(e.target.value)}
              placeholder="e.g. glm-5:cloud or llama3.1:8b"
              className="text-xs h-8 flex-1 font-mono"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={updateMut.isPending || !hasUnsavedOllamaModel}
              className="h-8 text-xs shrink-0"
            >
              {updateMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void modelQuery.refetch();
              }}
              disabled={modelQuery.isFetching}
              className="h-8 text-xs shrink-0"
            >
              {modelQuery.isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Refresh'}
            </Button>
          </form>
          <div className="mt-2 rounded-md border border-border bg-background/40 px-3 py-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label
                htmlFor={`provider-model-select-${provider.id}`}
                className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
              >
                Model Picker
              </label>
              {!modelQuery.isFetching && !modelQuery.isError && allOllamaModels.length > 0 && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  {allOllamaModels.length} detected
                  {suggestedCloudModels.length > 0 ? ` + ${suggestedCloudModels.length} cloud` : ''}
                </span>
              )}
            </div>
            {modelQuery.isFetching ? (
              <div className="flex items-center gap-2 py-1 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading Ollama tags...
              </div>
            ) : modelQuery.isError ? (
              <p className="text-[11px] text-muted-foreground">
                Could not load Ollama tags right now.
              </p>
            ) : allOllamaModels.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No Ollama tags detected from the local daemon.
              </p>
            ) : (
              <select
                id={`provider-model-select-${provider.id}`}
                value=""
                onChange={(e) => {
                  const nextModel = e.target.value;
                  if (nextModel.trim().length > 0) {
                    setOllamaModel(nextModel);
                    saveOllamaModel(nextModel);
                  }
                }}
                className="h-8 w-full rounded-md border border-border bg-background px-3 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Choose an Ollama model…</option>
                {detectedLocalModels.length > 0 && (
                  <optgroup label="Detected Local Models">
                    {detectedLocalModels.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </optgroup>
                )}
                {detectedCloudModels.length > 0 && (
                  <optgroup label="Detected Cloud Models">
                    {detectedCloudModels.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </optgroup>
                )}
                {suggestedCloudModels.length > 0 && (
                  <optgroup label="Suggested Cloud Models">
                    {suggestedCloudModels.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}
          </div>
          {hasUnsavedOllamaModel && (
            <p className="mt-2 text-[11px] text-amber-400/80">
              {updateMut.isPending
                ? 'Saving the selected Ollama model now...'
                : 'Model change is staged locally. Press Save to apply it.'}
            </p>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground/70">
            {modelQuery.isError
              ? 'Could not load local Ollama tags. Cloud models can also be entered manually.'
              : modelQuery.data && modelQuery.data.models.length > 0
                ? `${modelQuery.data.models.length} detected model(s). Suggested Ollama Cloud tags are also included below, and any valid model can still be entered manually.`
                : 'Cloud models can also be entered manually, even when they do not appear in the local tag list.'}
          </p>
        </div>
      )}

      {/* ---- API Key section (non-Ollama providers) ---- */}
      {needsKey && (
        <div className="border-t border-border px-4 py-3">
          {showKeyInput ? (
            <form onSubmit={handleSaveKey} className="flex gap-2">
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste API key..."
                className="text-xs h-8 flex-1 font-mono"
              />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={!apiKey.trim() || updateMut.isPending}
                className="h-8 text-xs shrink-0"
              >
                {updateMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowKeyInput(false);
                  setApiKey('');
                }}
                className="h-8 text-xs shrink-0"
              >
                Cancel
              </Button>
            </form>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowKeyInput(true)}
              className="text-xs w-full justify-center"
            >
              Set API Key
            </Button>
          )}
        </div>
      )}

      {/* ---- Actions footer ---- */}
      <div className="border-t border-border px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testMut.isPending}
            className="gap-1.5 text-xs"
          >
            {testMut.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            Test
          </Button>

          {/* Test result indicator */}
          {testMut.isSuccess && testMut.data.ok && (
            <span className="text-[11px] text-green-400">Connected</span>
          )}
          {testMut.isSuccess && !testMut.data.ok && (
            <span className="text-[11px] text-destructive" title={testMut.data.error}>
              Failed
            </span>
          )}
          {testMut.isError && <span className="text-[11px] text-destructive">Error</span>}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRemove}
          disabled={removeMut.isPending}
          className="gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          {removeMut.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Remove
        </Button>
      </div>

      {removeMut.isError && (
        <div className="border-t border-border px-4 py-2">
          <p className="text-[11px] text-destructive">
            Failed to remove provider. {errorMessage(removeMut.error, 'Try again.')}
          </p>
        </div>
      )}
    </div>
  );
}
