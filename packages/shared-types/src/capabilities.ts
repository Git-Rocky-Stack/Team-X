/**
 * Capability taxonomy — the closed vocabulary consumed by the role-schema
 * parser (M36 T2+) and, downstream, by `computeRoleFit` v2 (M37).
 *
 * Locked at Phase 6 M36 T0 per
 * `docs/plans/2026-04-21-team-x-phase-6-m36-capabilities-taxonomy.md` §5.1:
 * **41 capabilities across 6 categories**. Additions require a
 * retrospective-driven amendment (mirrors M32's locked 4-weight scoring
 * signature). Silent renames / reorderings are caught by the M36 exit
 * source-string-audit test (§5.8, lineage from M35 T3/T8/T9/T10).
 *
 * **Case convention (Q1 resolved, §5.2):** lowercase-snake_case. Strict
 * equality at parse time — no runtime normalization, no locale-sensitive
 * comparison. Grep-friendly and IDE-autocomplete-friendly.
 *
 * **Shape contract (§3 — "What ships"):**
 * - `CapabilityCategory` — 6-literal union (`engineering` / `product` /
 *   `design` / `operations` / `strategy` / `support`).
 * - `CAPABILITY_CATEGORY_MAP` — single source of truth. 6-key record,
 *   each value is a readonly tuple of the capabilities in that category.
 * - `Capability` — derived union of all 41 literals, pulled from the map
 *   values so the taxonomy has exactly one authoring surface.
 * - `CAPABILITY_LIST` — flattened readonly array of all 41 capabilities,
 *   in category-declaration order (engineering → product → design →
 *   operations → strategy → support).
 * - `CAPABILITY_CATEGORIES` — readonly array of the 6 category names in
 *   declaration order.
 * - `isCapability(value)` — O(1) runtime type guard backed by an internal
 *   Set. Accepts `unknown` so callers can validate parser output, IPC
 *   payloads, and untyped role-pack frontmatter without a pre-narrow.
 */

// ---------------------------------------------------------------------------
// Categories — locked 6-literal union
// ---------------------------------------------------------------------------

export type CapabilityCategory =
  | 'engineering'
  | 'product'
  | 'design'
  | 'operations'
  | 'strategy'
  | 'support';

export const CAPABILITY_CATEGORIES: readonly CapabilityCategory[] = [
  'engineering',
  'product',
  'design',
  'operations',
  'strategy',
  'support',
] as const;

// ---------------------------------------------------------------------------
// Category → Capability map — single source of truth
// ---------------------------------------------------------------------------
//
// Ordering inside each tuple is stable and carries semantic weight — the M36
// exit source-string-audit test (capabilities-taxonomy-marker.test.ts) pins
// specific literal strings at specific positions. Do not reorder without
// updating the marker test in lockstep.

export const CAPABILITY_CATEGORY_MAP = {
  engineering: [
    'backend_engineering',
    'frontend_engineering',
    'mobile_engineering',
    'data_engineering',
    'ml_engineering',
    'devops',
    'site_reliability',
    'security_engineering',
    'qa_engineering',
    'api_design',
  ],
  product: [
    'product_management',
    'product_strategy',
    'roadmap_planning',
    'requirements_analysis',
    'user_research',
    'feature_prioritization',
    'product_analytics',
  ],
  design: ['ux_design', 'ui_design', 'visual_design', 'interaction_design', 'design_systems'],
  operations: [
    'project_management',
    'people_management',
    'process_improvement',
    'financial_operations',
    'legal_compliance',
    'hr_operations',
    'vendor_management',
  ],
  strategy: [
    'executive_leadership',
    'business_strategy',
    'market_analysis',
    'partnerships',
    'fundraising',
    'corporate_development',
  ],
  support: [
    'customer_success',
    'technical_writing',
    'technical_support',
    'content_marketing',
    'sales',
    'developer_relations',
  ],
} as const satisfies Record<CapabilityCategory, readonly string[]>;

// ---------------------------------------------------------------------------
// Capability union — derived from the map, not authored twice
// ---------------------------------------------------------------------------

type CapabilityCategoryMap = typeof CAPABILITY_CATEGORY_MAP;

export type Capability = CapabilityCategoryMap[CapabilityCategory][number];

// ---------------------------------------------------------------------------
// Flattened runtime list — category-declaration order
// ---------------------------------------------------------------------------

export const CAPABILITY_LIST: readonly Capability[] = [
  ...CAPABILITY_CATEGORY_MAP.engineering,
  ...CAPABILITY_CATEGORY_MAP.product,
  ...CAPABILITY_CATEGORY_MAP.design,
  ...CAPABILITY_CATEGORY_MAP.operations,
  ...CAPABILITY_CATEGORY_MAP.strategy,
  ...CAPABILITY_CATEGORY_MAP.support,
] as const;

// ---------------------------------------------------------------------------
// Type guard — O(1) via Set lookup
// ---------------------------------------------------------------------------
//
// Set is frozen at module load. Callers pass `unknown` because capability
// strings arrive from three untrusted sources: role-pack frontmatter parsers
// (M36 T2), IPC payloads (M37+ role-fit preview handler), and any future
// community-pack loader. The guard narrows to the `Capability` literal union
// without running `CAPABILITY_LIST.includes(...)` on every call.

const CAPABILITY_SET: ReadonlySet<string> = new Set<string>(CAPABILITY_LIST);

export function isCapability(value: unknown): value is Capability {
  return typeof value === 'string' && CAPABILITY_SET.has(value);
}
