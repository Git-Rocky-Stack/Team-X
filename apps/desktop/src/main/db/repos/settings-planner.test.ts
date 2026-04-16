/**
 * Unit tests for planner settings — getPlanner / setPlanner / seedDefaults.
 *
 * Phase 5 — M32 T7.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it } from 'vitest';

import { PLANNER_APPROVAL_LEVEL_DEFAULT, PLANNER_SETTINGS_CLAMPS } from '@team-x/shared-types';

import * as schema from '../schema.js';
import { createSettingsRepo } from './settings.js';

function makeRepo() {
  const raw = new Database(':memory:');
  raw.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'global',
      scope_id TEXT,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
  `);
  const db = drizzle(raw, { schema });
  return createSettingsRepo(db);
}

// ---------------------------------------------------------------------------
// getPlanner — defaults
// ---------------------------------------------------------------------------

describe('getPlanner', () => {
  it('returns defaults when no keys are persisted', () => {
    const repo = makeRepo();
    const p = repo.getPlanner();
    expect(p.maxTickets).toBe(PLANNER_SETTINGS_CLAMPS.maxTickets.default);
    expect(p.maxDepth).toBe(PLANNER_SETTINGS_CLAMPS.maxDepth.default);
    expect(p.approvalLevel).toBe(PLANNER_APPROVAL_LEVEL_DEFAULT);
    expect(p.escalationThreshold).toBe(PLANNER_SETTINGS_CLAMPS.escalationThreshold.default);
  });

  it('reads persisted values', () => {
    const repo = makeRepo();
    repo.set('planner_max_tickets', 25);
    repo.set('planner_max_depth', 3);
    repo.set('planner_approval_level', 'officer');
    repo.set('planner_escalation_threshold', 7);
    const p = repo.getPlanner();
    expect(p.maxTickets).toBe(25);
    expect(p.maxDepth).toBe(3);
    expect(p.approvalLevel).toBe('officer');
    expect(p.escalationThreshold).toBe(7);
  });

  it('falls back to default for invalid approval level', () => {
    const repo = makeRepo();
    repo.set('planner_approval_level', 'bogus');
    expect(repo.getPlanner().approvalLevel).toBe(PLANNER_APPROVAL_LEVEL_DEFAULT);
  });
});

// ---------------------------------------------------------------------------
// setPlanner — clamping
// ---------------------------------------------------------------------------

describe('setPlanner clamping', () => {
  it('clamps maxTickets to [1, 50]', () => {
    const repo = makeRepo();
    repo.setPlanner({ maxTickets: 0 });
    expect(repo.getPlanner().maxTickets).toBe(1);
    repo.setPlanner({ maxTickets: 100 });
    expect(repo.getPlanner().maxTickets).toBe(50);
    repo.setPlanner({ maxTickets: 20 });
    expect(repo.getPlanner().maxTickets).toBe(20);
  });

  it('clamps maxDepth to [1, 4]', () => {
    const repo = makeRepo();
    repo.setPlanner({ maxDepth: 0 });
    expect(repo.getPlanner().maxDepth).toBe(1);
    repo.setPlanner({ maxDepth: 10 });
    expect(repo.getPlanner().maxDepth).toBe(4);
    repo.setPlanner({ maxDepth: 3 });
    expect(repo.getPlanner().maxDepth).toBe(3);
  });

  it('clamps escalationThreshold to [1, 10]', () => {
    const repo = makeRepo();
    repo.setPlanner({ escalationThreshold: 0 });
    expect(repo.getPlanner().escalationThreshold).toBe(1);
    repo.setPlanner({ escalationThreshold: 99 });
    expect(repo.getPlanner().escalationThreshold).toBe(10);
    repo.setPlanner({ escalationThreshold: 5 });
    expect(repo.getPlanner().escalationThreshold).toBe(5);
  });

  it('validates approvalLevel against the enum', () => {
    const repo = makeRepo();
    expect(() => repo.setPlanner({ approvalLevel: 'intern' as never })).toThrow(
      'approvalLevel must be one of',
    );
    // Valid value succeeds
    repo.setPlanner({ approvalLevel: 'supervisor' });
    expect(repo.getPlanner().approvalLevel).toBe('supervisor');
  });

  it('rejects non-finite numeric values', () => {
    const repo = makeRepo();
    expect(() => repo.setPlanner({ maxTickets: Number.NaN })).toThrow('finite number');
    expect(() => repo.setPlanner({ maxDepth: Number.POSITIVE_INFINITY })).toThrow('finite number');
    expect(() => repo.setPlanner({ escalationThreshold: Number.NEGATIVE_INFINITY })).toThrow(
      'finite number',
    );
  });

  it('rounds fractional values before clamping', () => {
    const repo = makeRepo();
    repo.setPlanner({ maxTickets: 7.8 });
    expect(repo.getPlanner().maxTickets).toBe(8);
    repo.setPlanner({ maxDepth: 2.3 });
    expect(repo.getPlanner().maxDepth).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// seedDefaults
// ---------------------------------------------------------------------------

describe('seedDefaults planner keys', () => {
  it('seeds planner keys on first run', () => {
    const repo = makeRepo();
    const count = repo.seedDefaults();
    // At least the four planner keys should be seeded
    expect(count).toBeGreaterThanOrEqual(4);
    const p = repo.getPlanner();
    expect(p.maxTickets).toBe(PLANNER_SETTINGS_CLAMPS.maxTickets.default);
    expect(p.maxDepth).toBe(PLANNER_SETTINGS_CLAMPS.maxDepth.default);
    expect(p.approvalLevel).toBe(PLANNER_APPROVAL_LEVEL_DEFAULT);
    expect(p.escalationThreshold).toBe(PLANNER_SETTINGS_CLAMPS.escalationThreshold.default);
  });

  it('does not overwrite existing planner keys', () => {
    const repo = makeRepo();
    repo.set('planner_max_tickets', 42);
    repo.seedDefaults();
    expect(repo.getPlanner().maxTickets).toBe(42);
  });
});
