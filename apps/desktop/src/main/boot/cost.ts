import { calcCostUsd } from '@team-x/telemetry-core';

import type { CostCalculator } from '../orchestrator/run-agent.js';

/**
 * Wrap `telemetry-core`'s `calcCostUsd` into the orchestrator's
 * `CostCalculator` shape. The orchestrator API uses
 * `(provider, model, tokens) -> string` so all storage stays decimal-safe;
 * `calcCostUsd` returns a number, so we format here at the boundary.
 * Six decimal places is enough for sub-cent precision on the smallest
 * Phase 1 model (claude-haiku at $0.001/1k input).
 *
 * C3 (audit 2026-05-07): when the Anthropic adapter has prompt caching
 * enabled, the `usage` chunk carries `cachedInputTokens` (cache read)
 * and `cacheWriteTokens` (cache creation) alongside the fresh input
 * count. We thread both into `calcCostUsd` via its object form so the
 * read tokens get the discounted rate and the write tokens get the
 * premium rate. Non-Anthropic / non-cached calls leave them undefined
 * and the calculator falls back to the legacy fresh-only formula.
 */
export const calcCost: CostCalculator = ({
  model,
  promptTokens,
  completionTokens,
  cachedInputTokens,
  cacheWriteTokens,
}) => {
  const result = calcCostUsd(model, {
    promptTokens,
    completionTokens,
    ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
    ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
  });
  return result.usd.toFixed(6);
};
