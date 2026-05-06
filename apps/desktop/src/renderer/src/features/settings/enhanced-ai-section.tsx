/**
 * Enhanced AI Settings panel — exposes LLM provider config + Phase 2 & 3
 * feature toggles.
 *
 * Phase 5 — M32.
 *
 * NOTE: Like the RAG section, this component ships without a co-located
 * *.test.tsx file. The enhanced-ai E2E spec (M32 T7) drives the UI
 * end-to-end.
 */

import type {
  SettingsGetEnhancedAiConfigResponse,
  SettingsSetEnhancedAiConfigRequest,
} from '@team-x/shared-types';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge.js';
import { Input } from '@/components/ui/input.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useEnhancedAiConfig, useSetEnhancedAiConfig } from '@/hooks/use-enhanced-ai.js';
import { useProviders } from '@/hooks/use-providers.js';

const LLM_MAX_TOKENS_MIN = 1;
const LLM_MAX_TOKENS_MAX = 32000;
const LLM_TEMPERATURE_MIN = 0;
const LLM_TEMPERATURE_MAX = 2;
const LLM_TEMPERATURE_STEP = 0.1;
const PLANNING_THRESHOLD_MIN = 50;
const PLANNING_THRESHOLD_MAX = 1000;
const TRACING_SAMPLE_RATE_MIN = 0;
const TRACING_SAMPLE_RATE_MAX = 1;
const TRACING_SAMPLE_RATE_STEP = 0.05;

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function EnhancedAiSection() {
  const { data: config, isLoading: configLoading, isError: configError } = useEnhancedAiConfig();
  const setConfig = useSetEnhancedAiConfig();
  const { data: providers, isLoading: providersLoading } = useProviders();

  // Local draft state — mirrors server values on load and after each
  // successful save.
  const [draft, setDraft] = useState<SettingsGetEnhancedAiConfigResponse | null>(null);

  useEffect(() => {
    if (config) setDraft(config);
  }, [config]);

  if (configLoading || !draft) {
    return (
      <section className="space-y-3" aria-busy="true">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Enhanced AI
        </h4>
        <Skeleton className="h-48 rounded-lg" />
      </section>
    );
  }

  if (configError || !config) {
    return (
      <section className="space-y-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Enhanced AI
        </h4>
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          Failed to load Enhanced AI configuration.
        </div>
      </section>
    );
  }

  function commit<K extends keyof SettingsGetEnhancedAiConfigResponse>(
    key: K,
    value: SettingsGetEnhancedAiConfigResponse[K],
  ) {
    if (!draft) return;
    if (draft[key] === value) return;
    setDraft({ ...draft, [key]: value });
    setConfig.mutate({ [key]: value } as SettingsSetEnhancedAiConfigRequest);
  }

  function handleToggle(key: keyof SettingsGetEnhancedAiConfigResponse) {
    if (!draft) return;
    const next = !draft[key];
    setDraft({ ...draft, [key]: next });
    setConfig.mutate({ [key]: next } as SettingsSetEnhancedAiConfigRequest);
  }

  // "LLM Detected" reflects whether the orchestrator can actually route a
  // call right now — i.e. at least one configured provider is enabled.
  // The Enhanced AI llmProvider field is a routing preference ('auto' is
  // the default); it is not the source of truth for availability.
  const hasEnabledProvider = (providers ?? []).some((provider) => provider.enabled);
  const detectionPending = providersLoading && !providers;
  const llmDisabled = !hasEnabledProvider && !detectionPending;

  return (
    <section className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Enhanced AI
        </h4>
        {setConfig.isPending && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-label="Saving" />
        )}
        <span className="ml-auto">
          {detectionPending ? (
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
          ) : hasEnabledProvider ? (
            <Badge
              variant="outline"
              className="border-green-400/40 bg-green-400/10 text-green-400 text-[10px] px-1.5 py-0 gap-1.5"
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.85)] animate-pulse"
              />
              LLM Detected
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
              No LLM Detected
            </Badge>
          )}
        </span>
      </div>

      {/* LLM Provider */}
      <div
        className="rounded-lg border border-border bg-surface-50 p-4 space-y-3"
        aria-disabled={llmDisabled}
      >
        <p className="text-xs font-semibold text-foreground">LLM Provider</p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label
              htmlFor="ai-llm-provider"
              className="text-[11px] font-medium text-muted-foreground"
            >
              Provider
            </label>
            <Input
              id="ai-llm-provider"
              value={draft.llmProvider}
              onChange={(e) => setDraft({ ...draft, llmProvider: e.target.value })}
              onBlur={() => commit('llmProvider', draft.llmProvider.trim() || 'auto')}
              disabled={setConfig.isPending}
              placeholder="auto"
              className="h-8 text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              &apos;auto&apos; or provider id (e.g. &apos;openai&apos;, &apos;anthropic&apos;)
            </p>
          </div>
          <div className="space-y-1">
            <label htmlFor="ai-llm-model" className="text-[11px] font-medium text-muted-foreground">
              Model
            </label>
            <Input
              id="ai-llm-model"
              value={draft.llmModel}
              onChange={(e) => setDraft({ ...draft, llmModel: e.target.value })}
              onBlur={() => commit('llmModel', draft.llmModel.trim() || 'auto')}
              disabled={setConfig.isPending}
              placeholder="gpt-4"
              className="h-8 text-xs"
            />
            <p className="text-[10px] text-muted-foreground">&apos;auto&apos; or model name</p>
          </div>
          <div className="space-y-1">
            <label
              htmlFor="ai-llm-max-tokens"
              className="text-[11px] font-medium text-muted-foreground"
            >
              Max Tokens
            </label>
            <Input
              id="ai-llm-max-tokens"
              type="number"
              inputMode="numeric"
              min={LLM_MAX_TOKENS_MIN}
              max={LLM_MAX_TOKENS_MAX}
              step={100}
              value={draft.llmMaxTokens}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  llmMaxTokens: Number.parseInt(e.target.value, 10) || 0,
                })
              }
              onBlur={() => {
                const next = clamp(draft.llmMaxTokens, LLM_MAX_TOKENS_MIN, LLM_MAX_TOKENS_MAX);
                if (next !== draft.llmMaxTokens) {
                  setDraft({ ...draft, llmMaxTokens: next });
                }
                commit('llmMaxTokens', next);
              }}
              disabled={setConfig.isPending}
              className="h-8 text-xs font-mono"
            />
            <p className="text-[10px] text-muted-foreground">
              Max tokens per completion ({LLM_MAX_TOKENS_MIN}–{LLM_MAX_TOKENS_MAX})
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-4">
              <label
                htmlFor="ai-llm-temperature"
                className="text-[11px] font-medium text-muted-foreground"
              >
                Temperature
              </label>
              <span className="text-[11px] font-mono text-foreground tabular-nums">
                {draft.llmTemperature.toFixed(1)}
              </span>
            </div>
            <input
              id="ai-llm-temperature"
              type="range"
              min={LLM_TEMPERATURE_MIN}
              max={LLM_TEMPERATURE_MAX}
              step={LLM_TEMPERATURE_STEP}
              value={draft.llmTemperature}
              onChange={(e) =>
                setDraft({ ...draft, llmTemperature: Number.parseFloat(e.target.value) })
              }
              onMouseUp={() => commit('llmTemperature', draft.llmTemperature)}
              onTouchEnd={() => commit('llmTemperature', draft.llmTemperature)}
              onKeyUp={() => commit('llmTemperature', draft.llmTemperature)}
              disabled={setConfig.isPending}
              className="brand-range"
              aria-valuemin={LLM_TEMPERATURE_MIN}
              aria-valuemax={LLM_TEMPERATURE_MAX}
              aria-valuenow={draft.llmTemperature}
            />
            <p className="text-[10px] text-muted-foreground">
              Sampling temperature (0 = focused, 2 = creative)
            </p>
          </div>
        </div>
      </div>

      {/* Feature Toggles */}
      <div
        className="rounded-lg border border-border bg-surface-50 p-4 space-y-4"
        aria-disabled={llmDisabled}
      >
        <p className="text-xs font-semibold text-foreground">Additional AI Settings</p>

        {/* Query Expansion */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">Query Expansion</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
              Generate semantic variations for better retrieval recall.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draft.queryExpansionEnabled}
            aria-label="Toggle query expansion"
            onClick={() => handleToggle('queryExpansionEnabled')}
            disabled={setConfig.isPending}
            className={`
              relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
              focus-visible:ring-offset-2 focus-visible:ring-offset-background
              disabled:cursor-not-allowed disabled:opacity-50
              ${draft.queryExpansionEnabled ? 'bg-brand' : 'bg-surface-100 border border-border'}
            `}
          >
            <span
              aria-hidden="true"
              className={`
                inline-block h-3.5 w-3.5 transform rounded-full bg-background shadow transition-transform
                ${draft.queryExpansionEnabled ? 'translate-x-5' : 'translate-x-1'}
              `}
            />
          </button>
        </div>

        {/* Semantic Chunking */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">Semantic Chunking</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
              Structure-aware content splitting for better context.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draft.semanticChunkingEnabled}
            aria-label="Toggle semantic chunking"
            onClick={() => handleToggle('semanticChunkingEnabled')}
            disabled={setConfig.isPending}
            className={`
              relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
              focus-visible:ring-offset-2 focus-visible:ring-offset-background
              disabled:cursor-not-allowed disabled:opacity-50
              ${draft.semanticChunkingEnabled ? 'bg-brand' : 'bg-surface-100 border border-border'}
            `}
          >
            <span
              aria-hidden="true"
              className={`
                inline-block h-3.5 w-3.5 transform rounded-full bg-background shadow transition-transform
                ${draft.semanticChunkingEnabled ? 'translate-x-5' : 'translate-x-1'}
              `}
            />
          </button>
        </div>

        {/* Long-Term Memory */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">Long-Term Memory</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
              Extract and store facts across conversations with freshness tracking.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draft.longTermMemoryEnabled}
            aria-label="Toggle long-term memory"
            onClick={() => handleToggle('longTermMemoryEnabled')}
            disabled={setConfig.isPending}
            className={`
              relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
              focus-visible:ring-offset-2 focus-visible:ring-offset-background
              disabled:cursor-not-allowed disabled:opacity-50
              ${draft.longTermMemoryEnabled ? 'bg-brand' : 'bg-surface-100 border border-border'}
            `}
          >
            <span
              aria-hidden="true"
              className={`
                inline-block h-3.5 w-3.5 transform rounded-full bg-background shadow transition-transform
                ${draft.longTermMemoryEnabled ? 'translate-x-5' : 'translate-x-1'}
              `}
            />
          </button>
        </div>

        {/* Knowledge Graph */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">Knowledge Graph</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
              Cross-thread entity relationships and context linking.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draft.knowledgeGraphEnabled}
            aria-label="Toggle knowledge graph"
            onClick={() => handleToggle('knowledgeGraphEnabled')}
            disabled={setConfig.isPending}
            className={`
              relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
              focus-visible:ring-offset-2 focus-visible:ring-offset-background
              disabled:cursor-not-allowed disabled:opacity-50
              ${draft.knowledgeGraphEnabled ? 'bg-brand' : 'bg-surface-100 border border-border'}
            `}
          >
            <span
              aria-hidden="true"
              className={`
                inline-block h-3.5 w-3.5 transform rounded-full bg-background shadow transition-transform
                ${draft.knowledgeGraphEnabled ? 'translate-x-5' : 'translate-x-1'}
              `}
            />
          </button>
        </div>

        {/* Multi-Turn Planning */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">Multi-Turn Planning</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug mb-2">
              Decompose complex queries into execution plans.
            </p>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="ai-planning-threshold"
                  className="text-[10px] text-muted-foreground"
                >
                  Threshold
                </label>
                <span className="text-[10px] font-mono text-foreground tabular-nums">
                  {draft.planningThreshold} chars
                </span>
              </div>
              <Input
                id="ai-planning-threshold"
                type="number"
                inputMode="numeric"
                min={PLANNING_THRESHOLD_MIN}
                max={PLANNING_THRESHOLD_MAX}
                step={10}
                value={draft.planningThreshold}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    planningThreshold: Number.parseInt(e.target.value, 10) || 0,
                  })
                }
                onBlur={() => {
                  const next = clamp(
                    draft.planningThreshold,
                    PLANNING_THRESHOLD_MIN,
                    PLANNING_THRESHOLD_MAX,
                  );
                  if (next !== draft.planningThreshold) {
                    setDraft({ ...draft, planningThreshold: next });
                  }
                  commit('planningThreshold', next);
                }}
                disabled={!draft.planningEnabled || setConfig.isPending}
                className="h-7 text-xs font-mono"
              />
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draft.planningEnabled}
            aria-label="Toggle multi-turn planning"
            onClick={() => handleToggle('planningEnabled')}
            disabled={setConfig.isPending}
            className={`
              relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors mt-5
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
              focus-visible:ring-offset-2 focus-visible:ring-offset-background
              disabled:cursor-not-allowed disabled:opacity-50
              ${draft.planningEnabled ? 'bg-brand' : 'bg-surface-100 border border-border'}
            `}
          >
            <span
              aria-hidden="true"
              className={`
                inline-block h-3.5 w-3.5 transform rounded-full bg-background shadow transition-transform
                ${draft.planningEnabled ? 'translate-x-5' : 'translate-x-1'}
              `}
            />
          </button>
        </div>

        {/* Streaming Responses */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">Streaming Responses</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
              Real-time token streaming for faster perceived response.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draft.streamingEnabled}
            aria-label="Toggle streaming responses"
            onClick={() => handleToggle('streamingEnabled')}
            disabled={setConfig.isPending}
            className={`
              relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
              focus-visible:ring-offset-2 focus-visible:ring-offset-background
              disabled:cursor-not-allowed disabled:opacity-50
              ${draft.streamingEnabled ? 'bg-brand' : 'bg-surface-100 border border-border'}
            `}
          >
            <span
              aria-hidden="true"
              className={`
                inline-block h-3.5 w-3.5 transform rounded-full bg-background shadow transition-transform
                ${draft.streamingEnabled ? 'translate-x-5' : 'translate-x-1'}
              `}
            />
          </button>
        </div>

        {/* Distributed Tracing */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">Distributed Tracing</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug mb-2">
              Request lifecycle tracking and observability.
            </p>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="ai-tracing-sample-rate"
                  className="text-[10px] text-muted-foreground"
                >
                  Sample Rate
                </label>
                <span className="text-[10px] font-mono text-foreground tabular-nums">
                  {Math.round(draft.tracingSampleRate * 100)}%
                </span>
              </div>
              <input
                id="ai-tracing-sample-rate"
                type="range"
                min={TRACING_SAMPLE_RATE_MIN}
                max={TRACING_SAMPLE_RATE_MAX}
                step={TRACING_SAMPLE_RATE_STEP}
                value={draft.tracingSampleRate}
                onChange={(e) =>
                  setDraft({ ...draft, tracingSampleRate: Number.parseFloat(e.target.value) })
                }
                onMouseUp={() => commit('tracingSampleRate', draft.tracingSampleRate)}
                onTouchEnd={() => commit('tracingSampleRate', draft.tracingSampleRate)}
                onKeyUp={() => commit('tracingSampleRate', draft.tracingSampleRate)}
                disabled={!draft.tracingEnabled || setConfig.isPending}
                className="brand-range"
                aria-valuemin={TRACING_SAMPLE_RATE_MIN}
                aria-valuemax={TRACING_SAMPLE_RATE_MAX}
                aria-valuenow={draft.tracingSampleRate}
              />
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draft.tracingEnabled}
            aria-label="Toggle distributed tracing"
            onClick={() => handleToggle('tracingEnabled')}
            disabled={setConfig.isPending}
            className={`
              relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors mt-5
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
              focus-visible:ring-offset-2 focus-visible:ring-offset-background
              disabled:cursor-not-allowed disabled:opacity-50
              ${draft.tracingEnabled ? 'bg-brand' : 'bg-surface-100 border border-border'}
            `}
          >
            <span
              aria-hidden="true"
              className={`
                inline-block h-3.5 w-3.5 transform rounded-full bg-background shadow transition-transform
                ${draft.tracingEnabled ? 'translate-x-5' : 'translate-x-1'}
              `}
            />
          </button>
        </div>
      </div>

      {/* Save error banner */}
      {setConfig.isError && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <span className="min-w-0 truncate">Failed to save: {String(setConfig.error)}</span>
        </div>
      )}

      {/* Info banner for LLM */}
      {!detectionPending && !hasEnabledProvider && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          <span className="min-w-0">
            Enable an LLM provider in Provider settings to enable Enhanced AI features.
          </span>
        </div>
      )}
    </section>
  );
}
