import {
  AGENTIC_SETTINGS_CLAMPS,
  COPILOT_CATEGORIES,
  COPILOT_CATEGORY_WEIGHTS_DEFAULT,
  COPILOT_ENABLED_DEFAULT,
  COPILOT_SETTINGS_CLAMPS,
  MEMORY_SETTINGS_CLAMPS,
  MEMORY_TARGET_TOKEN_BUDGET_OPTIONS,
  PLANNER_APPROVAL_LEVEL_DEFAULT,
  PLANNER_SETTINGS_CLAMPS,
} from '@team-x/shared-types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';


import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { createSettingsRepo } from './settings.js';

let ctx: TestDbHandle;
let repo: ReturnType<typeof createSettingsRepo>;

beforeEach(async () => {
  ctx = await makeTestDb();
  repo = createSettingsRepo(ctx.db);
});
afterEach(() => ctx.close());

describe('createSettingsRepo', () => {
  describe('get / set', () => {
    it('returns fallback when key does not exist', () => {
      expect(repo.get('nonexistent', 'default')).toBe('default');
    });

    it('returns fallback for getRaw when key does not exist', () => {
      expect(repo.getRaw('nonexistent')).toBeNull();
    });

    it('stores and retrieves a string value', () => {
      repo.set('theme', 'dark');
      expect(repo.get<string>('theme', 'light')).toBe('dark');
    });

    it('stores and retrieves a number value', () => {
      repo.set('slots', 8);
      expect(repo.get<number>('slots', 2)).toBe(8);
    });

    it('stores and retrieves an object value', () => {
      const caps = { ollama: 1, anthropic: 4 };
      repo.set('caps', caps);
      expect(repo.get('caps', {})).toEqual(caps);
    });

    it('upserts on repeated set', () => {
      repo.set('key', 'first');
      repo.set('key', 'second');
      expect(repo.get<string>('key', '')).toBe('second');
    });

    it('getRaw returns raw JSON string', () => {
      repo.set('foo', { bar: 42 });
      expect(repo.getRaw('foo')).toBe('{"bar":42}');
    });
  });

  describe('getAll', () => {
    it('returns empty array when no settings exist', () => {
      expect(repo.getAll()).toEqual([]);
    });

    it('returns all stored settings', () => {
      repo.set('a', 1);
      repo.set('b', 2);
      const all = repo.getAll();
      expect(all).toHaveLength(2);
      expect(all.map((r) => r.key).sort()).toEqual(['a', 'b']);
    });
  });

  describe('seedDefaults', () => {
    it('seeds all default settings on empty DB', () => {
      const count = repo.seedDefaults();
      expect(count).toBe(28);
      expect(repo.get<string>('runtime_strategy', '')).toBe('auto');
      expect(repo.get<string>('max_privacy_tier', '')).toBe('proprietary-cloud');
      expect(repo.get<number>('orchestrator_slots', 0)).toBe(6);
      const caps = repo.get<Record<string, number>>('concurrency_caps', {});
      expect(caps.ollama).toBe(1);
      expect(caps.anthropic).toBe(4);
    });

    it('does not overwrite existing settings', () => {
      repo.set('runtime_strategy', 'lean');
      const count = repo.seedDefaults();
      expect(count).toBe(27);
      expect(repo.get<string>('runtime_strategy', '')).toBe('lean');
    });

    it('is idempotent', () => {
      repo.seedDefaults();
      const count = repo.seedDefaults();
      expect(count).toBe(0);
    });

    it('seeds RAG defaults', () => {
      repo.seedDefaults();

      expect(repo.get('rag_enabled', false)).toBe(true);
      expect(repo.get('rag_max_tokens', 0)).toBe(2000);
      expect(repo.get('rag_threshold', 0)).toBe(0.7);
      expect(repo.get('rag_top_k', 0)).toBe(5);
      expect(repo.get('embedding_dimension', 0)).toBe(1536);
    });

    it('seeds agentic-loop defaults (M31)', () => {
      repo.seedDefaults();
      expect(repo.get('agentic_max_steps', 0)).toBe(8);
      expect(repo.get('agentic_max_tokens', 0)).toBe(8000);
      expect(repo.get('agentic_timeout_ms', 0)).toBe(120000);
    });
  });

  describe('agentic (M31)', () => {
    it('getAgentic returns defaults on empty DB (no seed yet)', () => {
      // Fallback path — keys missing, shared clamp defaults kick in.
      expect(repo.getAgentic()).toEqual({
        maxSteps: 8,
        maxTokens: 8000,
        timeoutMs: 120000,
      });
    });

    it('getAgentic reflects the last setAgentic values', () => {
      repo.setAgentic({ maxSteps: 12, maxTokens: 16000, timeoutMs: 60000 });
      expect(repo.getAgentic()).toEqual({
        maxSteps: 12,
        maxTokens: 16000,
        timeoutMs: 60000,
      });
    });

    it('setAgentic supports partial patches — untouched keys retain their value', () => {
      repo.setAgentic({ maxSteps: 10, maxTokens: 4000, timeoutMs: 90000 });
      repo.setAgentic({ maxSteps: 20 });
      expect(repo.getAgentic()).toEqual({
        maxSteps: 20,
        maxTokens: 4000,
        timeoutMs: 90000,
      });
    });

    it('setAgentic clamps below-min integers to the minimum', () => {
      // 0 below each field's min (1, 512, 10000); negative also clamps.
      repo.setAgentic({ maxSteps: -5, maxTokens: 0, timeoutMs: -100 });
      expect(repo.getAgentic()).toEqual({
        maxSteps: 1,
        maxTokens: 512,
        timeoutMs: 10000,
      });
    });

    it('setAgentic clamps above-max integers to the maximum', () => {
      repo.setAgentic({ maxSteps: 1000, maxTokens: 999999, timeoutMs: 9_999_999 });
      expect(repo.getAgentic()).toEqual({
        maxSteps: 32,
        maxTokens: 64000,
        timeoutMs: 600000,
      });
    });

    it('setAgentic rounds fractional inputs before clamping', () => {
      repo.setAgentic({ maxSteps: 8.7, maxTokens: 8000.4, timeoutMs: 120000.9 });
      expect(repo.getAgentic()).toEqual({
        maxSteps: 9,
        maxTokens: 8000,
        timeoutMs: 120001,
      });
    });

    it('setAgentic rejects non-finite numbers with an explicit error', () => {
      expect(() => repo.setAgentic({ maxSteps: Number.NaN })).toThrow(/finite number/);
      expect(() => repo.setAgentic({ maxTokens: Number.POSITIVE_INFINITY })).toThrow(
        /finite number/,
      );
      expect(() => repo.setAgentic({ timeoutMs: Number.NEGATIVE_INFINITY })).toThrow(
        /finite number/,
      );
    });

    it('setAgentic is independent of concurrency_caps and orchestrator_slots', () => {
      // Baseline: seed defaults, then change agentic and confirm
      // the concurrency keys are untouched.
      repo.seedDefaults();
      const capsBefore = repo.get<Record<string, number>>('concurrency_caps', {});
      const slotsBefore = repo.get<number>('orchestrator_slots', 0);
      repo.setAgentic({ maxSteps: 16, maxTokens: 2000, timeoutMs: 45000 });
      expect(repo.get('concurrency_caps', {})).toEqual(capsBefore);
      expect(repo.get('orchestrator_slots', 0)).toBe(slotsBefore);
    });
  });

  describe('extensions autonomy', () => {
    it('defaults to balanced on empty DB', () => {
      expect(repo.getExtensions()).toEqual({ autonomyMode: 'balanced' });
    });

    it('persists the selected autonomy mode', () => {
      repo.setExtensions({ autonomyMode: 'autonomous' });
      expect(repo.getExtensions()).toEqual({ autonomyMode: 'autonomous' });
    });

    it('rejects invalid autonomy modes', () => {
      expect(() => repo.setExtensions({ autonomyMode: 'wild-west' as 'balanced' })).toThrow(
        /autonomyMode must be one of/,
      );
    });
  });

  describe('long-run memory defaults', () => {
    it('returns safe defaults on empty DB', () => {
      expect(repo.getMemory()).toEqual({
        defaultTargetTokenBudget: MEMORY_TARGET_TOKEN_BUDGET_OPTIONS[1],
        recentTurnLimit: MEMORY_SETTINGS_CLAMPS.recentTurnLimit.default,
        checkpointHistoryLimit: MEMORY_SETTINGS_CLAMPS.checkpointHistoryLimit.default,
      });
    });

    it('persists and reads the selected memory defaults', () => {
      repo.setMemory({
        defaultTargetTokenBudget: MEMORY_TARGET_TOKEN_BUDGET_OPTIONS[2],
        recentTurnLimit: 18,
        checkpointHistoryLimit: 9,
      });
      expect(repo.getMemory()).toEqual({
        defaultTargetTokenBudget: MEMORY_TARGET_TOKEN_BUDGET_OPTIONS[2],
        recentTurnLimit: 18,
        checkpointHistoryLimit: 9,
      });
    });

    it('supports partial patches', () => {
      repo.setMemory({
        defaultTargetTokenBudget: MEMORY_TARGET_TOKEN_BUDGET_OPTIONS[0],
        recentTurnLimit: 10,
        checkpointHistoryLimit: 5,
      });
      repo.setMemory({ recentTurnLimit: 14 });
      expect(repo.getMemory()).toEqual({
        defaultTargetTokenBudget: MEMORY_TARGET_TOKEN_BUDGET_OPTIONS[0],
        recentTurnLimit: 14,
        checkpointHistoryLimit: 5,
      });
    });

    it('clamps numeric memory fields and rejects invalid budget presets', () => {
      repo.setMemory({
        recentTurnLimit: -100,
        checkpointHistoryLimit: 999,
      });
      expect(repo.getMemory()).toEqual({
        defaultTargetTokenBudget: MEMORY_TARGET_TOKEN_BUDGET_OPTIONS[1],
        recentTurnLimit: MEMORY_SETTINGS_CLAMPS.recentTurnLimit.min,
        checkpointHistoryLimit: MEMORY_SETTINGS_CLAMPS.checkpointHistoryLimit.max,
      });
      expect(() =>
        repo.setMemory({
          defaultTargetTokenBudget: 1234 as (typeof MEMORY_TARGET_TOKEN_BUDGET_OPTIONS)[number],
        }),
      ).toThrow(/defaultTargetTokenBudget must be one of/);
    });

    it('rejects non-finite numeric memory values', () => {
      expect(() => repo.setMemory({ recentTurnLimit: Number.NaN })).toThrow(/finite number/);
      expect(() => repo.setMemory({ checkpointHistoryLimit: Number.POSITIVE_INFINITY })).toThrow(
        /finite number/,
      );
    });
  });

  // -------------------------------------------------------------------
  // M35 T1 — Performance defaults pass + clamp audit (2026-04-19)
  // -------------------------------------------------------------------
  // These tests pin the evidence-based outcome of the M35 T1
  // measurement pass (llama3.1:8b, 66s warm tick, 2288-char prompt;
  // see the header block in `apps/desktop/src/main/db/seed.ts`).
  // All 10 Phase 5 settings clamps held at their current defaults —
  // the measurement justifies holding, not moving. Any future silent
  // tuning of a default within its envelope fails here first.
  describe('M35 T1 — clamp audit (measurement-held defaults)', () => {
    it('pins every numeric default + the three approval/flag defaults after seedDefaults()', () => {
      repo.seedDefaults();
      // RAG retrieval defaults (Phase 5 — M28/M29). `rag_chunk_size`
      // and `rag_chunk_overlap` live in the chunker module
      // (packages/intelligence/src/rag/chunker.ts) as
      // `DEFAULT_OPTIONS.maxTokens`/`overlapTokens`; they are not
      // persisted-settings keys, so we pin the persisted RAG keys
      // here and pin the chunker constants in the chunker test.
      expect(repo.get('rag_enabled', false)).toBe(true);
      expect(repo.get('rag_max_tokens', 0)).toBe(2000);
      expect(repo.get('rag_threshold', 0)).toBe(0.7);
      expect(repo.get('rag_top_k', 0)).toBe(5);
      expect(repo.get('embedding_dimension', 0)).toBe(1536);
      // Agentic loop budgets (M31).
      expect(repo.getAgentic()).toEqual({
        maxSteps: 8,
        maxTokens: 8000,
        timeoutMs: 120000,
      });
      // Task planner guardrails (M32).
      expect(repo.getPlanner()).toEqual({
        maxTickets: 10,
        maxDepth: 2,
        approvalLevel: PLANNER_APPROVAL_LEVEL_DEFAULT,
        escalationThreshold: 3,
      });
      // Copilot service (M33).
      const cop = repo.getCopilot();
      expect(cop.enabled).toBe(COPILOT_ENABLED_DEFAULT);
      expect(cop.intervalMinutes).toBe(5);
      expect(cop.categories).toEqual(Array.from(COPILOT_CATEGORIES));
      expect(repo.getCopilotWeights().weights).toEqual(COPILOT_CATEGORY_WEIGHTS_DEFAULT);
    });

    it('pins clamp envelopes (min/max) unchanged from Phase 5 M31/M32/M33 baseline', () => {
      // The measurement pass tunes DEFAULTS within clamp envelopes —
      // it never moves the envelope itself. If an envelope changes, a
      // larger design-doc amendment is required; this test guards the
      // invariant.
      expect(AGENTIC_SETTINGS_CLAMPS.maxSteps.min).toBe(1);
      expect(AGENTIC_SETTINGS_CLAMPS.maxSteps.max).toBe(32);
      expect(AGENTIC_SETTINGS_CLAMPS.maxTokens.min).toBe(512);
      expect(AGENTIC_SETTINGS_CLAMPS.maxTokens.max).toBe(64000);
      expect(AGENTIC_SETTINGS_CLAMPS.timeoutMs.min).toBe(10000);
      expect(AGENTIC_SETTINGS_CLAMPS.timeoutMs.max).toBe(600000);
      expect(PLANNER_SETTINGS_CLAMPS.maxTickets.min).toBe(1);
      expect(PLANNER_SETTINGS_CLAMPS.maxTickets.max).toBe(200);
      expect(PLANNER_SETTINGS_CLAMPS.maxDepth.min).toBe(1);
      expect(PLANNER_SETTINGS_CLAMPS.maxDepth.max).toBe(32);
      expect(PLANNER_SETTINGS_CLAMPS.escalationThreshold.min).toBe(1);
      expect(PLANNER_SETTINGS_CLAMPS.escalationThreshold.max).toBe(10);
      expect(COPILOT_SETTINGS_CLAMPS.intervalMinutes.min).toBe(1);
      expect(COPILOT_SETTINGS_CLAMPS.intervalMinutes.max).toBe(60);
    });

    it('every (possibly revised) default satisfies min ≤ default ≤ max', () => {
      // Structural invariant: the measurement-held default must ALWAYS
      // sit strictly within its clamp envelope. Holds today; fails
      // loudly the first time anyone bumps a default past the envelope
      // without also moving the envelope.
      const pairs: Array<[string, { min: number; max: number; default: number }]> = [
        ['agentic.maxSteps', AGENTIC_SETTINGS_CLAMPS.maxSteps],
        ['agentic.maxTokens', AGENTIC_SETTINGS_CLAMPS.maxTokens],
        ['agentic.timeoutMs', AGENTIC_SETTINGS_CLAMPS.timeoutMs],
        ['planner.maxTickets', PLANNER_SETTINGS_CLAMPS.maxTickets],
        ['planner.maxDepth', PLANNER_SETTINGS_CLAMPS.maxDepth],
        ['planner.escalationThreshold', PLANNER_SETTINGS_CLAMPS.escalationThreshold],
        ['copilot.intervalMinutes', COPILOT_SETTINGS_CLAMPS.intervalMinutes],
      ];
      for (const [label, c] of pairs) {
        expect({ label, ok: c.default >= c.min && c.default <= c.max }).toEqual({
          label,
          ok: true,
        });
      }
    });
  });
});
