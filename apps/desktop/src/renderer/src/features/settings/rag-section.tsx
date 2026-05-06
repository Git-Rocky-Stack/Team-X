/**
 * RAG Settings panel — exposes rag_enabled + retrieval knobs + embedding
 * provider config + rebuild/delete actions.
 *
 * NOTE: Team-X has no jsdom/@testing-library infrastructure, so this
 * component ships without a co-located *.test.tsx file. The rag-flow
 * E2E spec (M29 T9) drives the UI end-to-end against the canned
 * test-mode provider and verifies the settings path works.
 * Introducing a renderer unit-test stack is out of scope for M29.
 *
 * Phase 5 — M29 T8.
 */

import type { SettingsGetRagConfigResponse } from '@team-x/shared-types';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import {
  useDeleteRag,
  useRagConfig,
  useRagStats,
  useRebuildRag,
  useSetRagConfig,
} from '@/hooks/use-rag.js';
import { useAppStore } from '@/store/app-store.js';

type ConfirmAction = 'rebuild' | 'delete' | null;

const RAG_TOP_K_MIN = 1;
const RAG_TOP_K_MAX = 20;
const RAG_THRESHOLD_MIN = 0;
const RAG_THRESHOLD_MAX = 1;
const RAG_THRESHOLD_STEP = 0.05;
const RAG_MAX_TOKENS_MIN = 100;
const RAG_MAX_TOKENS_MAX = 4000;
const RAG_MAX_TOKENS_STEP = 100;
const EMBEDDING_DIM_MIN = 1;
const EMBEDDING_DIM_MAX = 4096;

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function formatRelative(ms: number | null): string {
  if (ms === null) return 'Never';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) {
    const m = Math.floor(diff / 60_000);
    return `${m} minute${m === 1 ? '' : 's'} ago`;
  }
  if (diff < 86_400_000) {
    const h = Math.floor(diff / 3_600_000);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  const d = Math.floor(diff / 86_400_000);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function RagSection() {
  const companyId = useAppStore((s) => s.companyId);

  const { data: config, isLoading: configLoading, isError: configError } = useRagConfig();
  const { data: stats, isLoading: statsLoading } = useRagStats(companyId);
  const setConfig = useSetRagConfig();
  const rebuildRag = useRebuildRag(companyId);
  const deleteRag = useDeleteRag(companyId);

  // Local draft state — mirrors server values on load and after each
  // successful save. This lets users type freely without every
  // keystroke triggering an IPC round trip. Saves fire onBlur for
  // text/number inputs and onClick for toggles + action buttons.
  const [draft, setDraft] = useState<SettingsGetRagConfigResponse | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [rebuildFeedback, setRebuildFeedback] = useState<string | null>(null);
  const [deleteFeedback, setDeleteFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (config) setDraft(config);
  }, [config]);

  if (configLoading || !draft) {
    return (
      <section className="space-y-3" aria-busy="true">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          RAG (Retrieval-Augmented Generation)
        </h4>
        <Skeleton className="h-48 rounded-lg" />
      </section>
    );
  }

  if (configError || !config) {
    return (
      <section className="space-y-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          RAG (Retrieval-Augmented Generation)
        </h4>
        <div className="flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          Failed to load RAG configuration.
        </div>
      </section>
    );
  }

  const enabled = draft.ragEnabled;
  const disabledKnobs = !enabled;

  function commit<K extends keyof SettingsGetRagConfigResponse>(
    key: K,
    value: SettingsGetRagConfigResponse[K],
  ) {
    if (!draft) return;
    if (draft[key] === value) return;
    setDraft({ ...draft, [key]: value });
    setConfig.mutate({ [key]: value } as SettingsSetRagConfigPatch);
  }

  function handleToggle() {
    if (!draft) return;
    const next = !draft.ragEnabled;
    setDraft({ ...draft, ragEnabled: next });
    setConfig.mutate({ ragEnabled: next });
  }

  function handleRebuildConfirm() {
    setConfirmAction(null);
    setRebuildFeedback(null);
    rebuildRag.mutate(undefined, {
      onSuccess: (res) =>
        setRebuildFeedback(`Scheduled ${res.scheduled} source(s) for re-indexing.`),
    });
  }

  function handleDeleteConfirm() {
    setConfirmAction(null);
    setDeleteFeedback(null);
    deleteRag.mutate(undefined, {
      onSuccess: (res) => setDeleteFeedback(`Deleted ${res.deleted} embedding row(s).`),
    });
  }

  const hasCompany = !!companyId;

  return (
    <section className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          RAG (Retrieval-Augmented Generation)
        </h4>
        {setConfig.isPending && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-label="Saving" />
        )}
        <span className="ml-auto">
          {enabled ? (
            <Badge
              variant="outline"
              className="border-green-400/40 bg-green-400/10 text-green-400 text-[10px] px-1.5 py-0 gap-1.5"
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.85)] animate-pulse"
              />
              Enabled
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-red-400/40 bg-red-500/10 text-red-400 text-[10px] px-1.5 py-0 gap-1.5"
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.85)]"
              />
              Disabled
            </Badge>
          )}
        </span>
      </div>

      {/* Master toggle */}
      <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface-50 p-4">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="rag-enabled-toggle"
            className="text-xs font-medium text-foreground cursor-pointer"
          >
            Enable RAG
          </label>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            Injects relevant context from past messages, tickets, and meetings into agent prompts.
          </p>
        </div>
        <button
          id="rag-enabled-toggle"
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Enable RAG"
          onClick={handleToggle}
          disabled={setConfig.isPending}
          className={`
            relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
            focus-visible:ring-offset-2 focus-visible:ring-offset-background
            disabled:cursor-not-allowed disabled:opacity-50
            ${enabled ? 'bg-brand' : 'bg-surface-100 border border-border'}
          `}
        >
          <span
            aria-hidden="true"
            className={`
              inline-block h-3.5 w-3.5 transform rounded-full bg-background shadow transition-transform
              ${enabled ? 'translate-x-5' : 'translate-x-1'}
            `}
          />
        </button>
      </div>

      {/* Embedding provider */}
      <div
        className={`rounded-lg border border-border bg-surface-50 p-4 space-y-3 transition-opacity ${disabledKnobs ? 'opacity-60' : ''}`}
        aria-disabled={disabledKnobs}
      >
        <p className="text-xs font-semibold text-foreground">Embedding Provider</p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label
              htmlFor="rag-embedding-provider"
              className="text-[11px] font-medium text-muted-foreground"
            >
              Provider
            </label>
            <Input
              id="rag-embedding-provider"
              value={draft.embeddingProvider}
              onChange={(e) => setDraft({ ...draft, embeddingProvider: e.target.value })}
              onBlur={() => commit('embeddingProvider', draft.embeddingProvider.trim() || 'auto')}
              disabled={disabledKnobs || setConfig.isPending}
              placeholder="auto"
              className="h-8 text-xs"
            />
            <p className="text-[10px] text-muted-foreground/70">
              &apos;auto&apos; or provider id (e.g. &apos;ollama-local&apos;)
            </p>
          </div>
          <div className="space-y-1">
            <label
              htmlFor="rag-embedding-model"
              className="text-[11px] font-medium text-muted-foreground"
            >
              Model
            </label>
            <Input
              id="rag-embedding-model"
              value={draft.embeddingModel}
              onChange={(e) => setDraft({ ...draft, embeddingModel: e.target.value })}
              onBlur={() => commit('embeddingModel', draft.embeddingModel.trim() || 'auto')}
              disabled={disabledKnobs || setConfig.isPending}
              placeholder="nomic-embed-text"
              className="h-8 text-xs"
            />
            <p className="text-[10px] text-muted-foreground/70">&apos;auto&apos; or model name</p>
          </div>
          <div className="space-y-1">
            <label
              htmlFor="rag-embedding-dimension"
              className="text-[11px] font-medium text-muted-foreground"
            >
              Dimension
            </label>
            <Input
              id="rag-embedding-dimension"
              type="number"
              inputMode="numeric"
              min={EMBEDDING_DIM_MIN}
              max={EMBEDDING_DIM_MAX}
              step={1}
              value={draft.embeddingDimension}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  embeddingDimension: Number.parseInt(e.target.value, 10) || 0,
                })
              }
              onBlur={() => {
                const next = clamp(draft.embeddingDimension, EMBEDDING_DIM_MIN, EMBEDDING_DIM_MAX);
                if (next !== draft.embeddingDimension) {
                  setDraft({ ...draft, embeddingDimension: next });
                }
                commit('embeddingDimension', next);
              }}
              disabled={disabledKnobs || setConfig.isPending}
              className="h-8 text-xs font-mono"
            />
            <p className="text-[10px] text-muted-foreground/70">
              Must match provider output (e.g. 768, 1536)
            </p>
          </div>
        </div>
      </div>

      {/* Retrieval knobs */}
      <div
        className={`rounded-lg border border-border bg-surface-50 p-4 space-y-4 transition-opacity ${disabledKnobs ? 'opacity-60' : ''}`}
        aria-disabled={disabledKnobs}
      >
        <p className="text-xs font-semibold text-foreground">Retrieval</p>

        {/* Top-K */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="rag-top-k" className="text-[11px] font-medium text-muted-foreground">
              Top-K
            </label>
            <span className="text-[11px] font-mono text-foreground tabular-nums">
              {draft.ragTopK}
            </span>
          </div>
          <Input
            id="rag-top-k"
            type="number"
            inputMode="numeric"
            min={RAG_TOP_K_MIN}
            max={RAG_TOP_K_MAX}
            step={1}
            value={draft.ragTopK}
            onChange={(e) =>
              setDraft({ ...draft, ragTopK: Number.parseInt(e.target.value, 10) || 0 })
            }
            onBlur={() => {
              const next = clamp(draft.ragTopK, RAG_TOP_K_MIN, RAG_TOP_K_MAX);
              if (next !== draft.ragTopK) setDraft({ ...draft, ragTopK: next });
              commit('ragTopK', next);
            }}
            disabled={disabledKnobs || setConfig.isPending}
            className="h-8 text-xs font-mono"
          />
          <p className="text-[10px] text-muted-foreground/70">
            Number of relevant chunks to retrieve per query (1–{RAG_TOP_K_MAX}).
          </p>
        </div>

        {/* Threshold */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <label
              htmlFor="rag-threshold"
              className="text-[11px] font-medium text-muted-foreground"
            >
              Threshold
            </label>
            <span className="text-[11px] font-mono text-foreground tabular-nums">
              {draft.ragThreshold.toFixed(2)}
            </span>
          </div>
          <input
            id="rag-threshold"
            type="range"
            min={RAG_THRESHOLD_MIN}
            max={RAG_THRESHOLD_MAX}
            step={RAG_THRESHOLD_STEP}
            value={draft.ragThreshold}
            onChange={(e) =>
              setDraft({ ...draft, ragThreshold: Number.parseFloat(e.target.value) })
            }
            onMouseUp={() => commit('ragThreshold', draft.ragThreshold)}
            onTouchEnd={() => commit('ragThreshold', draft.ragThreshold)}
            onKeyUp={() => commit('ragThreshold', draft.ragThreshold)}
            disabled={disabledKnobs || setConfig.isPending}
            className="brand-range"
            aria-valuemin={RAG_THRESHOLD_MIN}
            aria-valuemax={RAG_THRESHOLD_MAX}
            aria-valuenow={draft.ragThreshold}
          />
          <p className="text-[10px] text-muted-foreground/70">
            Cosine similarity cutoff — higher = stricter match.
          </p>
        </div>

        {/* Max tokens */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <label
              htmlFor="rag-max-tokens"
              className="text-[11px] font-medium text-muted-foreground"
            >
              Max tokens
            </label>
            <span className="text-[11px] font-mono text-foreground tabular-nums">
              {draft.ragMaxTokens}
            </span>
          </div>
          <Input
            id="rag-max-tokens"
            type="number"
            inputMode="numeric"
            min={RAG_MAX_TOKENS_MIN}
            max={RAG_MAX_TOKENS_MAX}
            step={RAG_MAX_TOKENS_STEP}
            value={draft.ragMaxTokens}
            onChange={(e) =>
              setDraft({ ...draft, ragMaxTokens: Number.parseInt(e.target.value, 10) || 0 })
            }
            onBlur={() => {
              const next = clamp(draft.ragMaxTokens, RAG_MAX_TOKENS_MIN, RAG_MAX_TOKENS_MAX);
              if (next !== draft.ragMaxTokens) setDraft({ ...draft, ragMaxTokens: next });
              commit('ragMaxTokens', next);
            }}
            disabled={disabledKnobs || setConfig.isPending}
            className="h-8 text-xs font-mono"
          />
          <p className="text-[10px] text-muted-foreground/70">
            Maximum token budget for injected context ({RAG_MAX_TOKENS_MIN}–{RAG_MAX_TOKENS_MAX}).
          </p>
        </div>
      </div>

      {/* Save error banner */}
      {setConfig.isError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 truncate">Failed to save: {String(setConfig.error)}</span>
        </div>
      )}

      {/* Stats card */}
      <div className="rounded-lg border border-border bg-surface-50 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-foreground">Index Stats</p>
          {statsLoading && !stats ? (
            <Badge
              variant="outline"
              className="border-muted-foreground/30 bg-muted/20 text-muted-foreground text-[10px] px-1.5 py-0 gap-1.5"
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-pulse"
              />
              Detecting…
            </Badge>
          ) : stats?.enabled ? (
            <Badge
              variant="outline"
              className="border-green-400/40 bg-green-400/10 text-green-400 text-[10px] px-1.5 py-0 gap-1.5"
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.85)] animate-pulse"
              />
              Indexing Active
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-red-400/40 bg-red-500/10 text-red-400 text-[10px] px-1.5 py-0 gap-1.5"
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.85)]"
              />
              Indexing Offline
            </Badge>
          )}
        </div>
        {!hasCompany ? (
          <p className="text-[11px] text-muted-foreground">Select a company to view index stats.</p>
        ) : statsLoading ? (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading stats…
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Chunks Indexed
              </p>
              <p className="text-sm font-semibold text-foreground tabular-nums mt-0.5">
                {stats.embeddingCount.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Last Indexed
              </p>
              <p className="text-sm font-medium text-foreground mt-0.5">
                {formatRelative(stats.lastIndexedAt)}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">No stats available.</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="rounded-lg border border-border bg-surface-50 p-4 space-y-2">
        <p className="text-xs font-semibold text-foreground">Maintenance</p>
        <p className="text-[11px] text-muted-foreground leading-snug">
          Rebuild re-indexes every eligible source. Delete wipes all embeddings without re-indexing.
          Both actions are destructive and cannot be undone.
        </p>

        {/* Rebuild row */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">Rebuild Index</p>
            <p className="text-[10px] text-muted-foreground">
              Wipe and re-embed every eligible source for this company.
            </p>
          </div>
          {confirmAction === 'rebuild' ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] text-amber-400 mr-1">Rebuild all?</span>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 px-2.5 text-[11px]"
                onClick={handleRebuildConfirm}
                disabled={rebuildRag.isPending || !hasCompany}
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2.5 text-[11px]"
                onClick={() => setConfirmAction(null)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-[11px] gap-1.5 shrink-0"
              onClick={() => {
                setRebuildFeedback(null);
                setConfirmAction('rebuild');
              }}
              disabled={!hasCompany || rebuildRag.isPending || deleteRag.isPending}
            >
              {rebuildRag.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {rebuildRag.isPending ? 'Rebuilding…' : 'Rebuild'}
            </Button>
          )}
        </div>

        {/* Delete row */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">Delete All Embeddings</p>
            <p className="text-[10px] text-muted-foreground">
              Wipe every embedding row. No re-index.
            </p>
          </div>
          {confirmAction === 'delete' ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] text-red-400 mr-1">Delete all?</span>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 px-2.5 text-[11px]"
                onClick={handleDeleteConfirm}
                disabled={deleteRag.isPending || !hasCompany}
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2.5 text-[11px]"
                onClick={() => setConfirmAction(null)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-[11px] gap-1.5 shrink-0 hover:text-destructive hover:border-destructive/50"
              onClick={() => {
                setDeleteFeedback(null);
                setConfirmAction('delete');
              }}
              disabled={!hasCompany || rebuildRag.isPending || deleteRag.isPending}
            >
              {deleteRag.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              {deleteRag.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          )}
        </div>

        {/* Action feedback banners */}
        {rebuildFeedback && (
          <div className="mt-2 flex items-center gap-2 rounded bg-green-500/10 px-3 py-2 text-xs text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            {rebuildFeedback}
          </div>
        )}
        {rebuildRag.isError && (
          <div className="mt-2 flex items-center gap-2 rounded bg-red-500/10 px-3 py-2 text-xs text-red-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">Rebuild failed: {String(rebuildRag.error)}</span>
          </div>
        )}
        {deleteFeedback && (
          <div className="mt-2 flex items-center gap-2 rounded bg-green-500/10 px-3 py-2 text-xs text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            {deleteFeedback}
          </div>
        )}
        {deleteRag.isError && (
          <div className="mt-2 flex items-center gap-2 rounded bg-red-500/10 px-3 py-2 text-xs text-red-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">Delete failed: {String(deleteRag.error)}</span>
          </div>
        )}
      </div>
    </section>
  );
}

// Local alias so the `commit()` cast stays precise instead of going
// through `any`. Each call constructs a one-key patch object whose
// value type matches the corresponding RAG config field.
type SettingsSetRagConfigPatch = {
  [K in keyof SettingsGetRagConfigResponse]?: SettingsGetRagConfigResponse[K];
};
