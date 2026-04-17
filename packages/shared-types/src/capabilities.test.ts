import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_CATEGORIES,
  CAPABILITY_CATEGORY_MAP,
  CAPABILITY_LIST,
  type Capability,
  type CapabilityCategory,
  isCapability,
} from './capabilities.js';

/**
 * Shape + invariant tests for the Phase 6 M36 locked capability taxonomy.
 *
 * These tests pin the §5.1 contract: 41 capabilities across exactly 6
 * categories, lowercase-snake_case convention, flat strings only, no
 * duplicates, no cross-category leakage. A silent rename or reorder fires
 * here at CI time — the M36 exit source-string-audit test (lineage from
 * M35 T3/T8/T9/T10) is layered on top and fires additionally.
 */
describe('capability taxonomy', () => {
  // -------------------------------------------------------------------------
  // CAPABILITY_LIST shape (§5.1 — 41 capabilities)
  // -------------------------------------------------------------------------

  it('CAPABILITY_LIST has exactly 41 entries', () => {
    expect(CAPABILITY_LIST).toHaveLength(41);
  });

  it('CAPABILITY_LIST has no duplicate entries', () => {
    const unique = new Set(CAPABILITY_LIST);
    expect(unique.size).toBe(CAPABILITY_LIST.length);
  });

  it('every capability is lowercase-snake_case (Q1 §5.2 convention)', () => {
    const snakeCasePattern = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
    for (const cap of CAPABILITY_LIST) {
      expect(cap, `capability "${cap}" violates lowercase-snake_case`).toMatch(snakeCasePattern);
    }
  });

  // -------------------------------------------------------------------------
  // CAPABILITY_CATEGORIES shape (6-literal union)
  // -------------------------------------------------------------------------

  it('CAPABILITY_CATEGORIES contains exactly 6 categories in declaration order', () => {
    expect(CAPABILITY_CATEGORIES).toEqual([
      'engineering',
      'product',
      'design',
      'operations',
      'strategy',
      'support',
    ]);
  });

  // -------------------------------------------------------------------------
  // CAPABILITY_CATEGORY_MAP — per-category count invariants (§5.1 locked)
  // -------------------------------------------------------------------------

  it('engineering category has 10 capabilities', () => {
    expect(CAPABILITY_CATEGORY_MAP.engineering).toHaveLength(10);
  });

  it('product category has 7 capabilities', () => {
    expect(CAPABILITY_CATEGORY_MAP.product).toHaveLength(7);
  });

  it('design category has 5 capabilities', () => {
    expect(CAPABILITY_CATEGORY_MAP.design).toHaveLength(5);
  });

  it('operations category has 7 capabilities', () => {
    expect(CAPABILITY_CATEGORY_MAP.operations).toHaveLength(7);
  });

  it('strategy category has 6 capabilities', () => {
    expect(CAPABILITY_CATEGORY_MAP.strategy).toHaveLength(6);
  });

  it('support category has 6 capabilities', () => {
    expect(CAPABILITY_CATEGORY_MAP.support).toHaveLength(6);
  });

  // -------------------------------------------------------------------------
  // Map ↔ list consistency — no orphaned entries in either direction
  // -------------------------------------------------------------------------

  it('every capability in CAPABILITY_CATEGORY_MAP appears exactly once in CAPABILITY_LIST', () => {
    const flattened = Object.values(CAPABILITY_CATEGORY_MAP).flat();
    expect(flattened).toHaveLength(CAPABILITY_LIST.length);
    expect(new Set(flattened)).toEqual(new Set(CAPABILITY_LIST));
  });

  it('every capability belongs to exactly one category (no cross-category leakage)', () => {
    const categoryOf = new Map<string, CapabilityCategory>();
    for (const category of CAPABILITY_CATEGORIES) {
      for (const cap of CAPABILITY_CATEGORY_MAP[category]) {
        expect(
          categoryOf.has(cap),
          `capability "${cap}" appears in both "${categoryOf.get(cap)}" and "${category}"`,
        ).toBe(false);
        categoryOf.set(cap, category);
      }
    }
    expect(categoryOf.size).toBe(CAPABILITY_LIST.length);
  });

  // -------------------------------------------------------------------------
  // Pinned literal values — §5.1 verbatim check (spot-check per category)
  // -------------------------------------------------------------------------

  it('pins representative literal strings per category (§5.1 verbatim)', () => {
    expect(CAPABILITY_CATEGORY_MAP.engineering).toContain('backend_engineering');
    expect(CAPABILITY_CATEGORY_MAP.engineering).toContain('api_design');
    expect(CAPABILITY_CATEGORY_MAP.product).toContain('product_management');
    expect(CAPABILITY_CATEGORY_MAP.product).toContain('user_research');
    expect(CAPABILITY_CATEGORY_MAP.design).toContain('ux_design');
    expect(CAPABILITY_CATEGORY_MAP.design).toContain('design_systems');
    expect(CAPABILITY_CATEGORY_MAP.operations).toContain('project_management');
    expect(CAPABILITY_CATEGORY_MAP.operations).toContain('vendor_management');
    expect(CAPABILITY_CATEGORY_MAP.strategy).toContain('executive_leadership');
    expect(CAPABILITY_CATEGORY_MAP.strategy).toContain('fundraising');
    expect(CAPABILITY_CATEGORY_MAP.support).toContain('customer_success');
    expect(CAPABILITY_CATEGORY_MAP.support).toContain('developer_relations');
  });

  // -------------------------------------------------------------------------
  // isCapability — happy path
  // -------------------------------------------------------------------------

  it('isCapability returns true for every entry in CAPABILITY_LIST', () => {
    for (const cap of CAPABILITY_LIST) {
      expect(isCapability(cap), `isCapability rejected "${cap}"`).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // isCapability — rejection paths (closed-enum contract)
  // -------------------------------------------------------------------------

  it('isCapability rejects unknown strings', () => {
    expect(isCapability('unknown_capability')).toBe(false);
    expect(isCapability('Backend_Engineering')).toBe(false); // case-sensitive
    expect(isCapability('backend-engineering')).toBe(false); // hyphens rejected
    expect(isCapability('backend_eng')).toBe(false); // abbreviation rejected
    expect(isCapability(' backend_engineering ')).toBe(false); // whitespace rejected
  });

  it('isCapability rejects the empty string', () => {
    expect(isCapability('')).toBe(false);
  });

  it('isCapability rejects non-string values', () => {
    expect(isCapability(null)).toBe(false);
    expect(isCapability(undefined)).toBe(false);
    expect(isCapability(0)).toBe(false);
    expect(isCapability(42)).toBe(false);
    expect(isCapability(true)).toBe(false);
    expect(isCapability(false)).toBe(false);
    expect(isCapability([])).toBe(false);
    expect(isCapability(['backend_engineering'])).toBe(false);
    expect(isCapability({})).toBe(false);
    expect(isCapability({ name: 'backend_engineering' })).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Type-level narrowing — compile-time proof (verified at typecheck time)
  // -------------------------------------------------------------------------

  it('isCapability narrows `unknown` to `Capability`', () => {
    const raw: unknown = 'backend_engineering';
    if (isCapability(raw)) {
      const typed: Capability = raw;
      expect(typed).toBe('backend_engineering');
    } else {
      throw new Error('unreachable — "backend_engineering" is a valid capability');
    }
  });
});
