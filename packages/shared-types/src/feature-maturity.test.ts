import { describe, expect, it } from 'vitest';

import { FEATURE_MATURITY, type FeatureMaturityEntry } from './feature-maturity.js';

describe('FEATURE_MATURITY (audit 2026-10-07 P2-3)', () => {
  const entries = Object.entries(FEATURE_MATURITY) as Array<[string, FeatureMaturityEntry]>;

  it('lists every surface the audit named as a placeholder', () => {
    expect(Object.keys(FEATURE_MATURITY).sort()).toEqual([
      'cloudWorkspaceLink',
      'operatorInvites',
      'retrievalReranker',
      'sharedCloudIdentity',
    ]);
  });

  it('gives each preview surface an honest summary and acceptance criteria', () => {
    for (const [key, entry] of entries) {
      expect(entry.maturity, key).toBe('preview');
      expect(entry.badge.length, key).toBeGreaterThan(0);
      expect(entry.summary.length, key).toBeGreaterThan(20);
      expect(entry.acceptance.length, `${key} needs criteria for leaving preview`).toBeGreaterThan(
        0,
      );
    }
  });

  it('marks the cloud surfaces as local-only, since nothing leaves the machine', () => {
    for (const key of ['cloudWorkspaceLink', 'operatorInvites', 'sharedCloudIdentity'] as const) {
      expect(FEATURE_MATURITY[key].scope).toBe('local-only');
      expect(FEATURE_MATURITY[key].badge).toMatch(/local only/i);
    }
  });
});
