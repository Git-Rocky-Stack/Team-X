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
import {
  AlertCircle,
  CheckCircle2,
  Key,
  Loader2,
  Power,
  PowerOff,
  Trash2,
  Zap,
} from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import {
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

  const [apiKey, setApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);

  const needsKey = !KEYLESS_KINDS.has(provider.kind);
  const isBusy = updateMut.isPending || removeMut.isPending;

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
          {provider.enabled ? (
            <>
              <Power className="h-3 w-3" /> Enabled
            </>
          ) : (
            <>
              <PowerOff className="h-3 w-3" /> Disabled
            </>
          )}
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
                autoFocus
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
              variant="outline"
              size="sm"
              onClick={() => setShowKeyInput(true)}
              className="gap-1.5 text-xs w-full justify-center"
            >
              <Key className="h-3 w-3" />
              Set API Key
            </Button>
          )}
        </div>
      )}

      {/* ---- Actions footer ---- */}
      <div className="border-t border-border px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testMut.isPending}
            className="gap-1.5 text-xs"
          >
            {testMut.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Zap className="h-3 w-3" />
            )}
            Test
          </Button>

          {/* Test result indicator */}
          {testMut.isSuccess && testMut.data.ok && (
            <span className="flex items-center gap-1 text-[11px] text-green-400">
              <CheckCircle2 className="h-3 w-3" /> Connected
            </span>
          )}
          {testMut.isSuccess && !testMut.data.ok && (
            <span
              className="flex items-center gap-1 text-[11px] text-destructive"
              title={testMut.data.error}
            >
              <AlertCircle className="h-3 w-3" /> Failed
            </span>
          )}
          {testMut.isError && (
            <span className="flex items-center gap-1 text-[11px] text-destructive">
              <AlertCircle className="h-3 w-3" /> Error
            </span>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleRemove}
          disabled={removeMut.isPending}
          className="gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          {removeMut.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
          Remove
        </Button>
      </div>
    </div>
  );
}
