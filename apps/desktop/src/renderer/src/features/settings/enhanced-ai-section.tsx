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

import { Faceplate, LampTile, SubviewState } from '@/components/console/index.js';
import { Input } from '@/components/ui/input.js';
import { Switch } from '@/components/ui/switch.js';
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
      <Faceplate kicker="AI" serial="ENHANCED" bodyClassName="space-y-3">
        <h2 className="text-h2 text-foreground">Enhanced AI</h2>
        <SubviewState
          lampLabel="SYNC"
          lampTone="hold"
          title="Loading Enhanced AI configuration…"
          className="min-h-0 p-6"
        />
      </Faceplate>
    );
  }

  if (configError || !config) {
    return (
      <Faceplate kicker="AI" serial="ENHANCED" bodyClassName="space-y-3">
        <h2 className="text-h2 text-foreground">Enhanced AI</h2>
        <SubviewState
          lampLabel="NO-GO"
          lampTone="nogo"
          title="Failed to load Enhanced AI configuration."
          className="min-h-0 p-6"
        />
      </Faceplate>
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

  // "LLM Detected" reflects whether the orchestrator can actually route a
  // call right now — i.e. at least one configured provider is enabled.
  // The Enhanced AI llmProvider field is a routing preference ('auto' is
  // the default); it is not the source of truth for availability.
  const hasEnabledProvider = (providers ?? []).some((provider) => provider.enabled);
  const detectionPending = providersLoading && !providers;
  const llmDisabled = !hasEnabledProvider && !detectionPending;

  return (
    <Faceplate kicker="AI" serial="ENHANCED" bodyClassName="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h2 className="text-h2 text-foreground">Enhanced AI</h2>
        {setConfig.isPending && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-label="Saving" />
        )}
        <span className="ml-auto flex items-center gap-1.5">
          {detectionPending ? (
            <>
              <LampTile small interactive={false} label="SYNC" tone="hold" />
              <span className="text-caption text-silver-mute">Detecting…</span>
            </>
          ) : hasEnabledProvider ? (
            <>
              <LampTile small interactive={false} label="GO" tone="go" />
              <span className="text-caption text-silver-mute">LLM Detected</span>
            </>
          ) : (
            <>
              <LampTile small interactive={false} label="NO-GO" tone="nogo" />
              <span className="text-caption text-silver-mute">No LLM Detected</span>
            </>
          )}
        </span>
      </div>

      {/* LLM Provider */}
      <div
        className="rounded-inset border border-[var(--hairline)] p-4 space-y-3"
        aria-disabled={llmDisabled}
      >
        <h3 className="text-h3 text-foreground">LLM Provider</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label htmlFor="ai-llm-provider" className="text-label text-muted-foreground">
              Provider
            </label>
            <Input
              id="ai-llm-provider"
              value={draft.llmProvider}
              onChange={(e) => setDraft({ ...draft, llmProvider: e.target.value })}
              onBlur={() => commit('llmProvider', draft.llmProvider.trim() || 'auto')}
              disabled={setConfig.isPending}
              placeholder="auto"
              className="h-8 text-body-sm"
            />
            <p className="text-caption text-muted-foreground">
              &apos;auto&apos; or provider id (e.g. &apos;openai&apos;, &apos;anthropic&apos;)
            </p>
          </div>
          <div className="space-y-1">
            <label htmlFor="ai-llm-model" className="text-label text-muted-foreground">
              Model
            </label>
            <Input
              id="ai-llm-model"
              value={draft.llmModel}
              onChange={(e) => setDraft({ ...draft, llmModel: e.target.value })}
              onBlur={() => commit('llmModel', draft.llmModel.trim() || 'auto')}
              disabled={setConfig.isPending}
              placeholder="gpt-4"
              className="h-8 text-body-sm"
            />
            <p className="text-caption text-muted-foreground">&apos;auto&apos; or model name</p>
          </div>
          <div className="space-y-1">
            <label htmlFor="ai-llm-max-tokens" className="text-label text-muted-foreground">
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
              className="h-8 text-code-sm"
            />
            <p className="text-caption text-muted-foreground">
              Max tokens per completion ({LLM_MAX_TOKENS_MIN}–{LLM_MAX_TOKENS_MAX})
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="ai-llm-temperature" className="text-label text-muted-foreground">
                Temperature
              </label>
              <span className="text-code-sm text-foreground tabular-nums">
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
            <p className="text-caption text-muted-foreground">
              Sampling temperature (0 = focused, 2 = creative)
            </p>
          </div>
        </div>
      </div>

      {/* Feature Toggles */}
      <div
        className="rounded-inset border border-[var(--hairline)] p-4 space-y-4"
        aria-disabled={llmDisabled}
      >
        <h3 className="text-h3 text-foreground">Additional AI Settings</h3>

        {/* Query Expansion */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-body-strong text-foreground">Query Expansion</p>
            <p className="text-caption text-muted-foreground mt-0.5 leading-snug">
              Generate semantic variations for better retrieval recall.
            </p>
          </div>
          <Switch
            checked={draft.queryExpansionEnabled}
            onCheckedChange={(checked) => commit('queryExpansionEnabled', checked)}
            disabled={setConfig.isPending}
            aria-label="Toggle query expansion"
          />
        </div>

        {/* Semantic Chunking */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-body-strong text-foreground">Semantic Chunking</p>
            <p className="text-caption text-muted-foreground mt-0.5 leading-snug">
              Structure-aware content splitting for better context.
            </p>
          </div>
          <Switch
            checked={draft.semanticChunkingEnabled}
            onCheckedChange={(checked) => commit('semanticChunkingEnabled', checked)}
            disabled={setConfig.isPending}
            aria-label="Toggle semantic chunking"
          />
        </div>

        {/* Long-Term Memory */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-body-strong text-foreground">Long-Term Memory</p>
            <p className="text-caption text-muted-foreground mt-0.5 leading-snug">
              Extract and store facts across conversations with freshness tracking.
            </p>
          </div>
          <Switch
            checked={draft.longTermMemoryEnabled}
            onCheckedChange={(checked) => commit('longTermMemoryEnabled', checked)}
            disabled={setConfig.isPending}
            aria-label="Toggle long-term memory"
          />
        </div>

        {/* Knowledge Graph */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-body-strong text-foreground">Knowledge Graph</p>
            <p className="text-caption text-muted-foreground mt-0.5 leading-snug">
              Cross-thread entity relationships and context linking.
            </p>
          </div>
          <Switch
            checked={draft.knowledgeGraphEnabled}
            onCheckedChange={(checked) => commit('knowledgeGraphEnabled', checked)}
            disabled={setConfig.isPending}
            aria-label="Toggle knowledge graph"
          />
        </div>

        {/* Multi-Turn Planning */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-body-strong text-foreground">Multi-Turn Planning</p>
            <p className="text-caption text-muted-foreground mt-0.5 leading-snug mb-2">
              Decompose complex queries into execution plans.
            </p>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="ai-planning-threshold"
                  className="text-caption text-muted-foreground"
                >
                  Threshold
                </label>
                <span className="text-caption font-mono text-foreground tabular-nums">
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
                className="h-7 text-code-sm"
              />
            </div>
          </div>
          <Switch
            checked={draft.planningEnabled}
            onCheckedChange={(checked) => commit('planningEnabled', checked)}
            disabled={setConfig.isPending}
            aria-label="Toggle multi-turn planning"
            className="mt-5"
          />
        </div>

        {/* Streaming Responses */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-body-strong text-foreground">Streaming Responses</p>
            <p className="text-caption text-muted-foreground mt-0.5 leading-snug">
              Real-time token streaming for faster perceived response.
            </p>
          </div>
          <Switch
            checked={draft.streamingEnabled}
            onCheckedChange={(checked) => commit('streamingEnabled', checked)}
            disabled={setConfig.isPending}
            aria-label="Toggle streaming responses"
          />
        </div>

        {/* Distributed Tracing */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-body-strong text-foreground">Distributed Tracing</p>
            <p className="text-caption text-muted-foreground mt-0.5 leading-snug mb-2">
              Request lifecycle tracking and observability.
            </p>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="ai-tracing-sample-rate"
                  className="text-caption text-muted-foreground"
                >
                  Sample Rate
                </label>
                <span className="text-caption font-mono text-foreground tabular-nums">
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
          <Switch
            checked={draft.tracingEnabled}
            onCheckedChange={(checked) => commit('tracingEnabled', checked)}
            disabled={setConfig.isPending}
            aria-label="Toggle distributed tracing"
            className="mt-5"
          />
        </div>
      </div>

      {/* Save error banner */}
      {setConfig.isError && (
        <div className="rounded-inset border border-[var(--led-nogo-edge)] bg-[var(--warn-soft)] px-3 py-2 text-body text-[var(--led-nogo)]">
          <span className="min-w-0 truncate">Failed to save: {String(setConfig.error)}</span>
        </div>
      )}

      {/* Info banner for LLM */}
      {!detectionPending && !hasEnabledProvider && (
        <div className="rounded-inset border border-[var(--led-warn-edge)] bg-[var(--warn-soft)] px-3 py-2 text-body text-[var(--led-warn)]">
          <span className="min-w-0">
            Enable an LLM provider in Provider settings to enable Enhanced AI features.
          </span>
        </div>
      )}
    </Faceplate>
  );
}
