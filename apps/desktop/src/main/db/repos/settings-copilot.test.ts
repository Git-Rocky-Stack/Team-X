/**
 * Unit tests for copilot-service settings — getCopilot / setCopilot.
 *
 * Phase 5 — M33 T7.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it } from 'vitest';

import {
  COPILOT_CATEGORIES,
  COPILOT_ENABLED_DEFAULT,
  COPILOT_SETTINGS_CLAMPS,
  type CopilotCategory,
} from '@team-x/shared-types';

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
