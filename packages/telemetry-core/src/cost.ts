import pricingData from './pricing.json' with { type: 'json' };

export interface CostResult {
  /**
   * Total cost in USD for this LLM call. Sum of:
   *   freshInput * inRate + cachedInput * cachedInRate +
   *   cacheWrite * cacheWriteRate + output * outRate.
   *
   * For models without cache pricing (Ollama, anything local), the cache
   * components silently contribute zero — the total degenerates to the
   * pre-C3 fresh-input + output formula.
   */
  usd: number;
  /** True when the model id (or its wildcard family) had a pricing entry. */
  known: boolean;
  /** The exact model id from pricing.json that matched, or null if unknown. */
  matchedModel: string | null;
  /**
   * Per-component breakdown for downstream attribution. Useful for the
   * Telemetry tab's cost-explainer drill-down so a user can see where the
   * spend went (fresh input vs cache write vs cache read vs output).
   */
  breakdown: CostBreakdown;
}

export interface CostBreakdown {
  /** USD spent on fresh (un-cached, non-cache-write) input tokens. */
  freshInputUsd: number;
  /** USD spent on cache READS (the discounted re-use of a prior cached prefix). */
  cachedInputUsd: number;
  /** USD spent on cache WRITES (the premium-priced first-time caching of a prefix). */
  cacheWriteUsd: number;
  /** USD spent on completion / output tokens. */
  outputUsd: number;
}

interface ModelPrice {
  in: number;
  out: number;
  /**
   * Cache READ rate (per 1k tokens). Anthropic standard ephemeral cache
   * is 0.10x of `in`. Optional so providers without cache pricing keep
   * their pre-C3 entries valid.
   */
  cachedIn?: number;
  /**
   * Cache WRITE rate (per 1k tokens). Anthropic standard ephemeral cache
   * is 1.25x of `in`. Optional for the same reason as `cachedIn`.
   */
  cacheWrite?: number;
}

interface PricingTable {
  version: string;
  currency: string;
  unit: string;
  notes?: string;
  models: Record<string, ModelPrice>;
}

const pricing = pricingData as PricingTable;

/**
 * Resolve a model id against the pricing table, with wildcard fallback.
 *
 * 1. Exact match wins (`'claude-opus-4-6'` → that entry).
 * 2. Otherwise, walk wildcard entries (`'ollama/*'`) and return the first
 *    whose prefix (everything before the `*`) matches the model id.
 * 3. Return null if nothing matches.
 */
function lookupPrice(modelId: string): { price: ModelPrice; matched: string } | null {
  const exact = pricing.models[modelId];
  if (exact) return { price: exact, matched: modelId };

  for (const [key, price] of Object.entries(pricing.models)) {
    if (!key.includes('*')) continue;
    const prefix = key.slice(0, key.indexOf('*'));
    if (modelId.startsWith(prefix)) {
      return { price, matched: key };
    }
  }
  return null;
}

/**
 * Token counts handed to `calcCostUsd`. All cache fields are optional so
 * providers without prompt caching (Ollama, OpenAI in non-cached mode,
 * older Anthropic models) can keep calling the two-token form.
 *
 * Semantics — matches Anthropic's `usage` shape exactly:
 *
 *   - `promptTokens` is the FRESH input count. Tokens that were cache-read
 *     or cache-written are NOT included here. (This mirrors Anthropic's
 *     `response.usage.input_tokens` which the SDK passes through verbatim.)
 *   - `cachedInputTokens` is the cache READ count (`cache_read_input_tokens`).
 *   - `cacheWriteTokens` is the cache WRITE count
 *     (`cache_creation_input_tokens`).
 *   - `completionTokens` is the output count (`output_tokens`).
 *
 * For non-cache-aware callers, omit the cache fields and the calculation
 * collapses to the pre-C3 formula.
 */
export interface CostInput {
  promptTokens: number;
  completionTokens: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
}

const ZERO_BREAKDOWN: CostBreakdown = {
  freshInputUsd: 0,
  cachedInputUsd: 0,
  cacheWriteUsd: 0,
  outputUsd: 0,
};

/**
 * Compute the USD cost of a single LLM call given its model id and token
 * counts. Pricing is per 1k tokens (matching the upstream provider docs).
 *
 * Defensive on inputs: negative token counts are clamped to zero so an
 * upstream bug never produces a negative cost. Missing cache rates degrade
 * gracefully — for a model whose `cachedIn` / `cacheWrite` are absent in
 * `pricing.json`, those token components are silently priced at the
 * model's base `in` rate (caller is presumed to have set the cache
 * counts to zero anyway in that case; defaulting to `in` keeps the
 * arithmetic monotonic even if a misconfiguration sneaks through).
 *
 * Two call shapes are supported:
 *
 *   calcCostUsd(modelId, promptTokens, completionTokens)         // legacy
 *   calcCostUsd(modelId, { promptTokens, completionTokens, ... }) // C3
 *
 * The legacy form keeps every pre-C3 caller compiling without a coordinated
 * rewrite. The new object form is required for any caller threading
 * Anthropic prompt-caching token counts through to attribution.
 */
export function calcCostUsd(
  modelId: string,
  promptTokensOrInput: number | CostInput,
  completionTokens?: number,
): CostResult {
  const input: CostInput =
    typeof promptTokensOrInput === 'number'
      ? {
          promptTokens: promptTokensOrInput,
          completionTokens: completionTokens ?? 0,
        }
      : promptTokensOrInput;

  const freshInTokens = Math.max(0, input.promptTokens);
  const outTokens = Math.max(0, input.completionTokens);
  const cachedInTokens = Math.max(0, input.cachedInputTokens ?? 0);
  const cacheWriteTokens = Math.max(0, input.cacheWriteTokens ?? 0);

  const hit = lookupPrice(modelId);
  if (!hit) {
    return { usd: 0, known: false, matchedModel: null, breakdown: { ...ZERO_BREAKDOWN } };
  }

  const inRate = hit.price.in;
  const outRate = hit.price.out;
  // Fall back to base input rate when cache rates are absent from the
  // pricing entry. The caller is presumed to be passing zero cache tokens
  // for those models, but defaulting to `in` rather than zero keeps the
  // arithmetic safe under any misconfiguration.
  const cachedInRate = hit.price.cachedIn ?? inRate;
  const cacheWriteRate = hit.price.cacheWrite ?? inRate;

  const freshInputUsd = (freshInTokens / 1000) * inRate;
  const cachedInputUsd = (cachedInTokens / 1000) * cachedInRate;
  const cacheWriteUsd = (cacheWriteTokens / 1000) * cacheWriteRate;
  const outputUsd = (outTokens / 1000) * outRate;
  const usd = freshInputUsd + cachedInputUsd + cacheWriteUsd + outputUsd;

  return {
    usd,
    known: true,
    matchedModel: hit.matched,
    breakdown: { freshInputUsd, cachedInputUsd, cacheWriteUsd, outputUsd },
  };
}

/** The pricing table this calculator is using. Exposed for diagnostics. */
export function getPricingVersion(): string {
  return pricing.version;
}
