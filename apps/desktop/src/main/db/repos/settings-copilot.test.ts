/**
 * Unit tests for copilot-service settings — getCopilot / setCopilot.
 *
 * Phase 5 — M33 T7.
 */

import {
  COPILOT_CATEGORIES,
  COPILOT_CATEGORY_WEIGHTS_DEFAULT,
  COPILOT_CATEGORY_WEIGHT_CLAMP,
  COPILOT_ENABLED_DEFAULT,
  COPILOT_SETTINGS_CLAMPS,
  type CopilotCategory,
  type SettingsSetCopilotWeightsRequest,
} from '@team-x/shared-types';
import { describe, expect, it } from 'vitest';

import { makeTestDb } from '../test-helpers.js';

import { createSettingsRepo } from './settings.js';

// Migrated to sql.js (`makeTestDb()`) per the workspace DB-test convention
// — see `test-helpers.ts`. The previous `better-sqlite3` import failed under
// Vitest because the native binding is rebuilt for Electron's ABI.
async function makeRepo() {
  const ctx = await makeTestDb();
  return createSettingsRepo(ctx.db);
}

// ---------------------------------------------------------------------------
// getCopilot — defaults
// ---------------------------------------------------------------------------

describe('getCopilot defaults', () => {
  it('returns defaults when no keys are persisted', async () => {
    const repo = await makeRepo();
    const c = repo.getCopilot();
    expect(c.enabled).toBe(COPILOT_ENABLED_DEFAULT);
    expect(c.intervalMinutes).toBe(COPILOT_SETTINGS_CLAMPS.intervalMinutes.default);
    expect(c.categories).toEqual(Array.from(COPILOT_CATEGORIES));
  });
});

// ---------------------------------------------------------------------------
// setCopilot — clamping + validation
// ---------------------------------------------------------------------------

describe('setCopilot clamping', () => {
  it('clamps intervalMinutes to [1, 60] on both read and write paths', async () => {
    const repo = await makeRepo();
    // Write-side clamp: 0 -> 1 (min), 999 -> 60 (max), 15 passes through.
    repo.setCopilot({ companyId: 'c1', intervalMinutes: 0 });
    expect(repo.getCopilot().intervalMinutes).toBe(1);
    repo.setCopilot({ companyId: 'c1', intervalMinutes: 999 });
    expect(repo.getCopilot().intervalMinutes).toBe(60);
    repo.setCopilot({ companyId: 'c1', intervalMinutes: 15 });
    expect(repo.getCopilot().intervalMinutes).toBe(15);

    // Read-side clamp: a stale out-of-range persisted value is clamped
    // at read time so the analyzer never observes an invalid interval.
    repo.set('copilot_interval_minutes', 120);
    expect(repo.getCopilot().intervalMinutes).toBe(60);
    repo.set('copilot_interval_minutes', 0);
    expect(repo.getCopilot().intervalMinutes).toBe(1);
  });

  it('empty categories fall back to the full COPILOT_CATEGORIES set (write-side guard)', async () => {
    const repo = await makeRepo();
    repo.setCopilot({ companyId: 'c1', categories: [] });
    expect(repo.getCopilot().categories).toEqual(Array.from(COPILOT_CATEGORIES));
    expect(repo.getCopilot().categories.length).toBe(COPILOT_CATEGORIES.length);
  });

  it('filters unknown categories and keeps the valid subset', async () => {
    const repo = await makeRepo();
    const dirty = ['operational', 'bogus', 'anomaly', 'nope'] as unknown as CopilotCategory[];
    repo.setCopilot({ companyId: 'c1', categories: dirty });
    expect(repo.getCopilot().categories).toEqual(['operational', 'anomaly']);
  });
});

// ---------------------------------------------------------------------------
// copilot category weights — defaults + persistence
// ---------------------------------------------------------------------------

describe('copilot category weights', () => {
  it('seedDefaults creates the copilot_category_weights setting', async () => {
    const repo = await makeRepo();

    repo.seedDefaults();

    const raw = repo.getRaw('copilot_category_weights');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? 'null')).toEqual(COPILOT_CATEGORY_WEIGHTS_DEFAULT);
  });

  it('returns five-key defaults when no weights are persisted', async () => {
    const repo = await makeRepo();

    expect(repo.getCopilotWeights()).toEqual({ weights: COPILOT_CATEGORY_WEIGHTS_DEFAULT });
  });

  it('patches one category without changing the others', async () => {
    const repo = await makeRepo();

    const result = repo.setCopilotWeights({ companyId: 'c1', weights: { cost: 0.25 } });

    expect(result.weights).toEqual({
      ...COPILOT_CATEGORY_WEIGHTS_DEFAULT,
      cost: 0.3,
    });
    expect(repo.getCopilotWeights().weights).toEqual(result.weights);
  });

  it('clamps weights into the M38 category-weight range', async () => {
    const repo = await makeRepo();

    const result = repo.setCopilotWeights({
      companyId: 'c1',
      weights: { operational: -1, anomaly: 9 },
    });

    expect(result.weights.operational).toBe(COPILOT_CATEGORY_WEIGHT_CLAMP.min);
    expect(result.weights.anomaly).toBe(COPILOT_CATEGORY_WEIGHT_CLAMP.max);
  });

  it('ignores unknown runtime keys and malformed persisted values', async () => {
    const repo = await makeRepo();

    const dirty = {
      companyId: 'c1',
      weights: { workflow: 1.5, bogus: 0 },
    } as unknown as SettingsSetCopilotWeightsRequest;
    repo.setCopilotWeights(dirty);
    expect(repo.getCopilotWeights().weights).toEqual({
      ...COPILOT_CATEGORY_WEIGHTS_DEFAULT,
      workflow: 1.5,
    });

    repo.set('copilot_category_weights', { cost: 1.7, org: 'bad', extra: 2 });
    expect(repo.getCopilotWeights().weights).toEqual({
      ...COPILOT_CATEGORY_WEIGHTS_DEFAULT,
      cost: 1.7,
    });
  });
});
