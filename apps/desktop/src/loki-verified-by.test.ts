// Phase 5.6 M-E S4 — Loki ledger evidence-field validator.
//
// Enforces the verifiedBy contract on .loki/queue/pending.json
// sub-milestones. Every entry whose status begins with "shipped" MUST
// carry a non-empty verifiedBy array naming concrete evidence artifacts
// (test paths, spec paths, migration paths, CI run URLs) that prove the
// milestone shipped. New (non-shipped / queued / blocked) entries do
// not require verifiedBy yet — it lands at ship time.
//
// Schema reference: .loki/queue/schema.json (JSON Schema 2020-12).
// Plan: docs/plans/2026-04-17-team-x-phase-5.6-remediation.md §7 S5.
// First applies to: Phase 5.6 M-A onward (M-A + M-B backfilled in M-E).

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '../../..');
const PENDING_PATH = join(REPO_ROOT, '.loki', 'queue', 'pending.json');
const CURRENT_TASK_PATH = join(REPO_ROOT, '.loki', 'queue', 'current-task.json');

function loadJson(path: string): unknown {
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw);
}

function isShipped(status: unknown): boolean {
  return typeof status === 'string' && status.trim().toLowerCase().startsWith('shipped');
}

function hasNonEmptyVerifiedBy(entry: Record<string, unknown>): boolean {
  const v = entry.verifiedBy;
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && x.length > 0);
}

describe('Loki S4 — verifiedBy contract on .loki/queue/pending.json', () => {
  const pending = loadJson(PENDING_PATH) as Record<string, unknown>;

  it('pending.json parses as JSON', () => {
    expect(typeof pending).toBe('object');
    expect(pending).not.toBeNull();
  });

  it('every shipped sub-milestone has a non-empty verifiedBy array', () => {
    const subs = (pending.subMilestones ?? []) as Array<Record<string, unknown>>;
    expect(Array.isArray(subs)).toBe(true);
    const offenders: string[] = [];
    for (const sub of subs) {
      if (!isShipped(sub.status)) continue;
      if (!hasNonEmptyVerifiedBy(sub)) {
        offenders.push(`${String(sub.id)} (${String(sub.name)})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every verifiedBy entry is a non-empty string', () => {
    const subs = (pending.subMilestones ?? []) as Array<Record<string, unknown>>;
    for (const sub of subs) {
      if (!isShipped(sub.status)) continue;
      const v = sub.verifiedBy as unknown[];
      for (const item of v) {
        expect(typeof item).toBe('string');
        expect(String(item).length).toBeGreaterThan(0);
      }
    }
  });

  it('previousSubMilestones entries (if present) also carry verifiedBy', () => {
    const prev = pending.previousSubMilestones as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (!prev) return;
    const offenders: string[] = [];
    for (const [id, entry] of Object.entries(prev)) {
      if (!hasNonEmptyVerifiedBy(entry)) {
        offenders.push(id);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('Loki S4 — verifiedBy slot on .loki/queue/current-task.json', () => {
  const current = loadJson(CURRENT_TASK_PATH) as Record<string, unknown>;

  it('current-task.json parses as JSON', () => {
    expect(typeof current).toBe('object');
    expect(current).not.toBeNull();
  });

  it('current-task.json carries a verifiedBy slot (null OR non-empty array)', () => {
    expect('verifiedBy' in current).toBe(true);
    const v = current.verifiedBy;
    if (v === null) {
      // Placeholder before milestone completion is allowed.
      expect(v).toBeNull();
    } else {
      expect(Array.isArray(v)).toBe(true);
      expect((v as unknown[]).length).toBeGreaterThan(0);
      for (const item of v as unknown[]) {
        expect(typeof item).toBe('string');
        expect(String(item).length).toBeGreaterThan(0);
      }
    }
  });

  it('if current task status begins with "shipped", verifiedBy must be populated', () => {
    if (!isShipped(current.status)) return;
    expect(hasNonEmptyVerifiedBy(current)).toBe(true);
  });
});
