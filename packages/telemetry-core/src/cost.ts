import pricingData from './pricing.json' with { type: 'json' };

export interface CostResult {
  /** Total cost in USD for this LLM call (input tokens + output tokens). */
  usd: number;
  /** True when the model id (or its wildcard family) had a pricing entry. */
  known: boolean;
  /** The exact model id from pricing.json that matched, or null if unknown. */
  matchedModel: string | null;
}

interface ModelPrice {
  in: number;
  out: number;
}

interface PricingTable {
  version: string;
  currency: string;
  unit: string;
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
 * Compute the USD cost of a single LLM call given its model id and token
 * counts. Pricing is per 1k tokens (matching the upstream provider docs).
 *
 * Defensive on inputs: negative token counts are clamped to zero so an
 * upstream bug never produces a negative cost.
 */
export function calcCostUsd(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
): CostResult {
  const inTokens = Math.max(0, promptTokens);
  const outTokens = Math.max(0, completionTokens);

  const hit = lookupPrice(modelId);
  if (!hit) {
    return { usd: 0, known: false, matchedModel: null };
  }

  const usd = (inTokens / 1000) * hit.price.in + (outTokens / 1000) * hit.price.out;
  return { usd, known: true, matchedModel: hit.matched };
}

/** The pricing table this calculator is using. Exposed for diagnostics. */
export function getPricingVersion(): string {
  return pricing.version;
}
