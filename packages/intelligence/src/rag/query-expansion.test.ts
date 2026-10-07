/**
 * Query-expansion service statistics.
 *
 * `avgExpansionsPerQuery` used to return the running total itself, so the
 * "average" grew without bound with every query. The service now counts the
 * variants it generates (the original query excluded) and divides by the
 * number of queries it expanded.
 */

import { describe, expect, it } from 'vitest';
import { createQueryExpansionService } from './query-expansion.js';

describe('createQueryExpansionService — getStats', () => {
  it('reports zeros before any query is expanded', () => {
    const svc = createQueryExpansionService({});
    expect(svc.getStats()).toEqual({
      totalExpansions: 0,
      avgExpansionsPerQuery: 0,
      methodCounts: {},
    });
  });

  it('averages generated variants over queries expanded', async () => {
    const svc = createQueryExpansionService({});
    const queries = ['show blocked tickets', 'what is the status of the launch project'];

    let variants = 0;
    for (const q of queries) {
      const expanded = await svc.expand(q, { companyId: 'co-1' });
      variants += expanded.expansions.filter((e) => e !== q).length;
    }

    // Fixture sanity: the deterministic strategies do produce variants, so
    // the average below is a real division rather than 0/2.
    expect(variants).toBeGreaterThan(0);

    const stats = svc.getStats();
    expect(stats.totalExpansions).toBe(variants);
    expect(stats.avgExpansionsPerQuery).toBeCloseTo(variants / queries.length);
  });
});
