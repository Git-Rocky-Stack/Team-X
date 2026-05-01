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
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it } from 'vitest';


import * as schema from '../schema.js';

import { createSettingsRepo } from './settings.js';

function makeRepo() {
  const raw = new Database(':memory:');
  const ddl = [
    'CREATE TABLE IF NOT EXISTS settings (',
    '  key TEXT PRIMARY KEY,',
    '  value_json TEXT NOT NULL,',
    "  scope TEXT NOT NULL DEFAULT 'global',",
    '  scope_id TEXT,',
    '  updated_at INTEGER NOT NULL DEFAULT 0',
    ')',
  ].join('\n');
  raw.prepare(ddl).run();
  const db = drizzle(raw, { schema });
  return createSettingsRepo(db);
}

// ---------------------------------------------------------------------------
// getCopilot — defaults
// ---------------------------------------------------------------------------

describe('getCopilot defaults', () => {
  it('returns defaults when no keys are persisted', () => {
    const repo = makeRepo();
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
  it('clamps intervalMinutes to [1, 60] on both read and write paths', () => {
    const repo = makeRepo();
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

  it('empty categories fall back to the full COPILOT_CATEGORIES set (write-side guard)', () => {
    const repo = makeRepo();
    repo.setCopilot({ companyId: 'c1', categories: [] });
    expect(repo.getCopilot().categories).toEqual(Array.from(COPILOT_CATEGORIES));
    expect(repo.getCopilot().categories.length).toBe(COPILOT_CATEGORIES.length);
  });

  it('filters unknown categories and keeps the valid subset', () => {
    const repo = makeRepo();
    const dirty = ['operational', 'bogus', 'anomaly', 'nope'] as unknown as CopilotCategory[];
    repo.setCopilot({ companyId: 'c1', categories: dirty });
    expect(repo.getCopilot().categories).toEqual(['operational', 'anomaly']);
  });
});

// ---------------------------------------------------------------------------
// copilot category weights — defaults + persistence
// ---------------------------------------------------------------------------

describe('copilot category weights', () => {
  it('seedDefaults creates the copilot_category_weights setting', () => {
    const repo = makeRepo();

    repo.seedDefaults();

    const raw = repo.getRaw('copilot_category_weights');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? 'null')).toEqual(COPILOT_CATEGORY_WEIGHTS_DEFAULT);
  });

  it('returns five-key defaults when no weights are persisted', () => {
    const repo = makeRepo();

    expect(repo.getCopilotWeights()).toEqual({ weights: COPILOT_CATEGORY_WEIGHTS_DEFAULT });
  });

  it('patches one category without changing the others', () => {
    const repo = makeRepo();

    const result = repo.setCopilotWeights({ companyId: 'c1', weights: { cost: 0.25 } });

    expect(result.weights).toEqual({
      ...COPILOT_CATEGORY_WEIGHTS_DEFAULT,
      cost: 0.3,
    });
    expect(repo.getCopilotWeights().weights).toEqual(result.weights);
  });

  it('clamps weights into the M38 category-weight range', () => {
    const repo = makeRepo();

    const result = repo.setCopilotWeights({
      companyId: 'c1',
      weights: { operational: -1, anomaly: 9 },
    });

    expect(result.weights.operational).toBe(COPILOT_CATEGORY_WEIGHT_CLAMP.min);
    expect(result.weights.anomaly).toBe(COPILOT_CATEGORY_WEIGHT_CLAMP.max);
  });

  it('ignores unknown runtime keys and malformed persisted values', () => {
    const repo = makeRepo();

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
