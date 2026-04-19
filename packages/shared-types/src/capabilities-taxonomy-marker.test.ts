import { describe, expect, it } from 'vitest';
import { CAPABILITY_CATEGORIES, CAPABILITY_CATEGORY_MAP, CAPABILITY_LIST } from './capabilities.js';

describe('M36 capabilities taxonomy marker', () => {
  it('pins the locked category names and capability count', () => {
    expect(CAPABILITY_CATEGORIES).toEqual([
      'engineering',
      'product',
      'design',
      'operations',
      'strategy',
      'support',
    ]);
    expect(CAPABILITY_LIST).toHaveLength(41);
  });

  it('pins representative capability literals from the first three categories', () => {
    expect(CAPABILITY_CATEGORY_MAP.engineering).toContain('backend_engineering');
    expect(CAPABILITY_CATEGORY_MAP.product).toContain('product_management');
    expect(CAPABILITY_CATEGORY_MAP.design).toContain('ux_design');
  });
});
