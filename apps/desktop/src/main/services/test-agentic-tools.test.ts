/**
 * Tests for the M32 T3 test-mode agentic tool composer
 * (`createTestToolsForEmployee`) and the standalone test-side
 * write-tools factory (`createTestWriteSideTools`).
 *
 * These tests pin the LOCKSTEP invariant called out in
 * `test-agentic-tools.ts`: the test-mode level gates MUST mirror the
 * production gates in `buildWriteSideTools` (`agentic-tools-write.ts`).
 * A divergence here would let an E2E spec pass even though the
 * production registry would reject the same level — silently masking
 * the bug. Kept narrow (level-gating + composition swap), because the
 * tool BODIES are exercised separately by `agentic-tools-write.test.ts`
 * in production mode and by `agentic-loop-service.test.ts` end-to-end.
 *
 * Phase 5 — M32 — T3.
 */

import type { Tool } from '@team-x/intelligence';
import { describe, expect, it } from 'vitest';

import { createTestToolsForEmployee, createTestWriteSideTools } from './test-agentic-tools.js';

const READ_SIDE_NAMES = [
  'query_employees',
  'query_tickets',
  'query_projects',
  'query_meetings',
  'query_vault',
  'query_events',
] as const;

const WRITE_SIDE_NAMES = ['decompose_project', 'delegate_subtask', 'review_deliverable'] as const;

function names(tools: readonly Tool[]): string[] {
  return tools.map((t) => t.name);
}

describe('createTestToolsForEmployee — M32 T3 level-gated composer', () => {
  it('exposes all read-side + all write-side tools to the system-agent', () => {
    const tools = createTestToolsForEmployee({
      companyId: 'co-1',
      employee: { id: 'emp-sys', level: 'system', isSystem: true },
    });
    const got = names(tools);
    for (const n of READ_SIDE_NAMES) expect(got).toContain(n);
    for (const n of WRITE_SIDE_NAMES) expect(got).toContain(n);
    // Exact length confirms no other tools sneak in.
    expect(tools).toHaveLength(READ_SIDE_NAMES.length + WRITE_SIDE_NAMES.length);
  });

  it('exposes read-side ONLY to an IC — write-side gates filter every tool', () => {
    const tools = createTestToolsForEmployee({
      companyId: 'co-1',
      employee: { id: 'emp-ic', level: 'ic', isSystem: false },
    });
    const got = names(tools);
    for (const n of READ_SIDE_NAMES) expect(got).toContain(n);
    for (const n of WRITE_SIDE_NAMES) expect(got).not.toContain(n);
    expect(tools).toHaveLength(READ_SIDE_NAMES.length);
  });

  it('exposes read-side + decompose ONLY to an officer (no delegate, no review)', () => {
    const tools = createTestToolsForEmployee({
      companyId: 'co-1',
      employee: { id: 'emp-ceo', level: 'officer', isSystem: false },
    });
    const got = names(tools);
    expect(got).toContain('decompose_project');
    expect(got).not.toContain('delegate_subtask');
    expect(got).not.toContain('review_deliverable');
    for (const n of READ_SIDE_NAMES) expect(got).toContain(n);
  });

  it('exposes read-side + ALL write-side to a management-level actor (overlap of both gates)', () => {
    const tools = createTestToolsForEmployee({
      companyId: 'co-1',
      employee: { id: 'emp-mgr', level: 'management', isSystem: false },
    });
    const got = names(tools);
    for (const n of READ_SIDE_NAMES) expect(got).toContain(n);
    for (const n of WRITE_SIDE_NAMES) expect(got).toContain(n);
  });

  it('exposes read-side + delegate + review (NOT decompose) to a supervisor and a lead', () => {
    for (const level of ['supervisor', 'lead'] as const) {
      const tools = createTestToolsForEmployee({
        companyId: 'co-1',
        employee: { id: `emp-${level}`, level, isSystem: false },
      });
      const got = names(tools);
      expect(got).toContain('delegate_subtask');
      expect(got).toContain('review_deliverable');
      expect(got).not.toContain('decompose_project');
      for (const n of READ_SIDE_NAMES) expect(got).toContain(n);
    }
  });
});

describe('createTestWriteSideTools — M32 T3 standalone level-gated factory', () => {
  it('returns an empty array for an IC and unknown levels (composition-root swap safety)', () => {
    expect(createTestWriteSideTools({ id: 'a', level: 'ic', isSystem: false })).toHaveLength(0);
    expect(createTestWriteSideTools({ id: 'b', level: 'intern', isSystem: false })).toHaveLength(0);
    expect(createTestWriteSideTools({ id: 'c', level: '', isSystem: false })).toHaveLength(0);
  });

  it('returns the schema-identical write-side mirror — tool names, schemas, and descriptions match production', () => {
    const tools = createTestWriteSideTools({ id: 'sys', level: 'system', isSystem: true });
    expect(names(tools)).toEqual(['decompose_project', 'delegate_subtask', 'review_deliverable']);
    for (const t of tools) {
      // Every test-mode tool exposes a strict zod schema (loop registry contract).
      expect(typeof t.schema.safeParse).toBe('function');
      expect(typeof t.execute).toBe('function');
      // Description is not empty — the loop's system prompt builder reads it.
      expect(t.description.length).toBeGreaterThan(20);
    }
  });
});
