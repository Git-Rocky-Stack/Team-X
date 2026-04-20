/**
 * Telemetry aggregate query tests (Phase 3 — M17).
 *
 * Tests the four aggregate methods added to the runs repo:
 * companyStats, dailyUsage, employeeStats, costBreakdown.
 *
 * Each test seeds a company + employees + finished runs, then asserts
 * the aggregate output. The runs repo's subqueries filter by
 * `employees.company_id`, so we also seed a second company to verify
 * cross-company isolation.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';
import { createCompaniesRepo } from './companies.js';
import { createEmployeesRepo } from './employees.js';
import { createRunsRepo } from './runs.js';

/** Helper: one day in milliseconds. */
const DAY_MS = 86_400_000;

describe('runs repo — telemetry aggregates', () => {
  let ctx: TestDbHandle;
  let companies: ReturnType<typeof createCompaniesRepo>;
  let employees: ReturnType<typeof createEmployeesRepo>;
  let runs: ReturnType<typeof createRunsRepo>;

  beforeEach(async () => {
    ctx = await makeTestDb();
    companies = createCompaniesRepo(ctx.db);
    employees = createEmployeesRepo(ctx.db);
    runs = createRunsRepo(ctx.db);
  });

  afterEach(() => {
    ctx.close();
  });

  /** Helper to backdate a run's startedAt directly via raw SQL. */
  function backdateRun(runId: string, startedAt: number): void {
    ctx.raw.run(`UPDATE runs SET started_at = ${startedAt} WHERE id = '${runId}'`);
  }

  /** Helper to seed a finished run with specific params and optional backdate. */
  function seedRun(opts: {
    employeeId: string;
    provider: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
    costUsd: string;
    toolCallsCount?: number;
    status?: 'success' | 'error';
    startedAt?: number;
    kind?: 'work' | 'agentic' | 'copilot';
  }): string {
    const id = runs.start({
      employeeId: opts.employeeId,
      provider: opts.provider,
      model: opts.model,
      kind: opts.kind,
    });
    runs.finish(id, {
      status: opts.status ?? 'success',
      promptTokens: opts.promptTokens,
      completionTokens: opts.completionTokens,
      latencyMs: opts.latencyMs,
      costUsd: opts.costUsd,
      toolCallsCount: opts.toolCallsCount ?? 0,
    });
    if (opts.startedAt !== undefined) {
      backdateRun(id, opts.startedAt);
    }
    return id;
  }

  function seedCompany(name: string): string {
    return companies.create({ name, slug: name.toLowerCase().replace(/\s+/g, '-') });
  }

  function seedEmployee(companyId: string, roleId: string, name: string): string {
    return employees.create({
      companyId,
      rolePackId: 'strategia-official',
      roleId,
      roleMdSha: 'test-sha',
      level: 'ic',
      name,
      title: name,
    });
  }

  // ---------------------------------------------------------------
  // companyStats
  // ---------------------------------------------------------------

  describe('companyStats', () => {
    it('returns zero-value stats for a company with no runs', () => {
      const cid = seedCompany('Empty Corp');
      seedEmployee(cid, 'ceo', 'Nobody');
      const stats = runs.companyStats(cid);
      expect(stats.totalRuns).toBe(0);
      expect(stats.totalTokens).toBe(0);
      expect(stats.totalCostUsd).toBe('0');
      expect(stats.avgLatencyMs).toBe(0);
      expect(stats.totalToolCalls).toBe(0);
    });

    it('aggregates only completed runs (excludes running)', () => {
      const cid = seedCompany('Corp A');
      const emp = seedEmployee(cid, 'swe', 'Alice');

      seedRun({
        employeeId: emp,
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        promptTokens: 100,
        completionTokens: 50,
        latencyMs: 200,
        costUsd: '0.005',
        toolCallsCount: 2,
      });

      // Still running — should be excluded
      runs.start({ employeeId: emp, provider: 'ollama', model: 'llama3.1:8b' });

      const stats = runs.companyStats(cid);
      expect(stats.totalRuns).toBe(1);
      expect(stats.totalTokens).toBe(150);
      expect(Number(stats.totalCostUsd)).toBeCloseTo(0.005, 4);
      expect(stats.avgLatencyMs).toBe(200);
      expect(stats.totalToolCalls).toBe(2);
    });

    it('includes error runs in aggregates', () => {
      const cid = seedCompany('Corp B');
      const emp = seedEmployee(cid, 'swe', 'Bob');

      seedRun({
        employeeId: emp,
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        promptTokens: 100,
        completionTokens: 50,
        latencyMs: 200,
        costUsd: '0.005',
      });

      seedRun({
        employeeId: emp,
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        promptTokens: 50,
        completionTokens: 0,
        latencyMs: 100,
        costUsd: '0.001',
        status: 'error',
      });

      const stats = runs.companyStats(cid);
      expect(stats.totalRuns).toBe(2);
      expect(stats.totalTokens).toBe(200);
      expect(Number(stats.totalCostUsd)).toBeCloseTo(0.006, 4);
    });

    it('isolates companies — does not include runs from other companies', () => {
      const cidA = seedCompany('Corp A');
      const cidB = seedCompany('Corp B');
      const empA = seedEmployee(cidA, 'swe', 'Alice');
      const empB = seedEmployee(cidB, 'swe', 'Bob');

      seedRun({
        employeeId: empA,
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        promptTokens: 100,
        completionTokens: 50,
        latencyMs: 200,
        costUsd: '0.005',
      });

      seedRun({
        employeeId: empB,
        provider: 'ollama',
        model: 'llama3.1:8b',
        promptTokens: 500,
        completionTokens: 300,
        latencyMs: 800,
        costUsd: '0',
      });

      const statsA = runs.companyStats(cidA);
      expect(statsA.totalRuns).toBe(1);
      expect(statsA.totalTokens).toBe(150);

      const statsB = runs.companyStats(cidB);
      expect(statsB.totalRuns).toBe(1);
      expect(statsB.totalTokens).toBe(800);
    });
  });

  // ---------------------------------------------------------------
  // dailyUsage
  // ---------------------------------------------------------------

  describe('dailyUsage', () => {
    it('returns empty array when no runs match the date range', () => {
      const cid = seedCompany('Corp');
      seedEmployee(cid, 'swe', 'Alice');
      const result = runs.dailyUsage(cid, 0, Date.now());
      expect(result).toEqual([]);
    });

    it('groups runs by calendar day', () => {
      const cid = seedCompany('Corp');
      const emp = seedEmployee(cid, 'swe', 'Alice');
      const twoDaysAgo = Date.now() - 2 * DAY_MS;
      const oneDayAgo = Date.now() - DAY_MS;

      seedRun({
        employeeId: emp,
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        promptTokens: 100,
        completionTokens: 50,
        latencyMs: 200,
        costUsd: '0.005',
        startedAt: twoDaysAgo,
      });

      seedRun({
        employeeId: emp,
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        promptTokens: 200,
        completionTokens: 100,
        latencyMs: 300,
        costUsd: '0.010',
        startedAt: oneDayAgo,
      });

      seedRun({
        employeeId: emp,
        provider: 'ollama',
        model: 'llama3.1:8b',
        promptTokens: 50,
        completionTokens: 25,
        latencyMs: 100,
        costUsd: '0',
        startedAt: oneDayAgo,
      });

      const result = runs.dailyUsage(cid, twoDaysAgo - DAY_MS, Date.now() + DAY_MS);
      expect(result.length).toBe(2);

      // First day: 1 run
      expect(result[0]?.totalRuns).toBe(1);
      expect(result[0]?.totalTokens).toBe(150);

      // Second day: 2 runs merged
      expect(result[1]?.totalRuns).toBe(2);
      expect(result[1]?.totalTokens).toBe(375);
    });

    it('respects date range boundaries', () => {
      const cid = seedCompany('Corp');
      const emp = seedEmployee(cid, 'swe', 'Alice');
      const now = Date.now();

      seedRun({
        employeeId: emp,
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        promptTokens: 100,
        completionTokens: 50,
        latencyMs: 200,
        costUsd: '0.005',
        startedAt: now - 10 * DAY_MS,
      });

      seedRun({
        employeeId: emp,
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        promptTokens: 200,
        completionTokens: 100,
        latencyMs: 300,
        costUsd: '0.010',
        startedAt: now,
      });

      // Only the recent run should match
      const result = runs.dailyUsage(cid, now - 2 * DAY_MS, now + DAY_MS);
      expect(result.length).toBe(1);
      expect(result[0]?.totalTokens).toBe(300);
    });

    it('returns days in chronological order', () => {
      const cid = seedCompany('Corp');
      const emp = seedEmployee(cid, 'swe', 'Alice');
      const now = Date.now();

      // Seed in reverse order
      seedRun({
        employeeId: emp,
        provider: 'anthropic',
        model: 'x',
        promptTokens: 1,
        completionTokens: 0,
        latencyMs: 1,
        costUsd: '0',
        startedAt: now,
      });
      seedRun({
        employeeId: emp,
        provider: 'anthropic',
        model: 'x',
        promptTokens: 1,
        completionTokens: 0,
        latencyMs: 1,
        costUsd: '0',
        startedAt: now - 3 * DAY_MS,
      });

      const result = runs.dailyUsage(cid, now - 5 * DAY_MS, now + DAY_MS);
      expect(result.length).toBe(2);
      expect(result[0]?.day < result[1]?.day).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // employeeStats
  // ---------------------------------------------------------------

  describe('employeeStats', () => {
    it('returns empty array for a company with no completed runs', () => {
      const cid = seedCompany('Corp');
      seedEmployee(cid, 'swe', 'Alice');
      expect(runs.employeeStats(cid)).toEqual([]);
    });

    it('returns per-employee breakdown sorted by total runs descending', () => {
      const cid = seedCompany('Corp');
      const emp1 = seedEmployee(cid, 'ceo', 'Alice');
      const emp2 = seedEmployee(cid, 'swe', 'Bob');

      // Alice: 1 run
      seedRun({
        employeeId: emp1,
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        promptTokens: 100,
        completionTokens: 50,
        latencyMs: 200,
        costUsd: '0.005',
        toolCallsCount: 2,
      });

      // Bob: 2 runs
      seedRun({
        employeeId: emp2,
        provider: 'ollama',
        model: 'llama3.1:8b',
        promptTokens: 200,
        completionTokens: 100,
        latencyMs: 400,
        costUsd: '0',
      });
      seedRun({
        employeeId: emp2,
        provider: 'ollama',
        model: 'llama3.1:8b',
        promptTokens: 150,
        completionTokens: 80,
        latencyMs: 350,
        costUsd: '0',
      });

      const result = runs.employeeStats(cid);
      expect(result).toHaveLength(2);

      // Bob first (2 runs > 1)
      expect(result[0]?.employeeId).toBe(emp2);
      expect(result[0]?.totalRuns).toBe(2);
      expect(result[0]?.totalTokens).toBe(530);
      expect(result[0]?.avgLatencyMs).toBe(375);

      // Alice second
      expect(result[1]?.employeeId).toBe(emp1);
      expect(result[1]?.totalRuns).toBe(1);
      expect(result[1]?.totalTokens).toBe(150);
      expect(result[1]?.totalToolCalls).toBe(2);
    });

    it('excludes running runs from employee aggregates', () => {
      const cid = seedCompany('Corp');
      const emp = seedEmployee(cid, 'swe', 'Alice');

      seedRun({
        employeeId: emp,
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        promptTokens: 100,
        completionTokens: 50,
        latencyMs: 200,
        costUsd: '0.005',
      });

      // Still running
      runs.start({ employeeId: emp, provider: 'ollama', model: 'llama3.1:8b' });

      const result = runs.employeeStats(cid);
      expect(result).toHaveLength(1);
      expect(result[0]?.totalRuns).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // costBreakdown
  // ---------------------------------------------------------------

  describe('costBreakdown', () => {
    it('returns empty array when no runs exist', () => {
      const cid = seedCompany('Corp');
      seedEmployee(cid, 'swe', 'Alice');
      expect(runs.costBreakdown(cid)).toEqual([]);
    });

    it('groups by provider + model and sorts by cost descending', () => {
      const cid = seedCompany('Corp');
      const emp = seedEmployee(cid, 'swe', 'Alice');

      // Expensive model: 2 runs
      seedRun({
        employeeId: emp,
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        promptTokens: 200,
        completionTokens: 100,
        latencyMs: 300,
        costUsd: '0.020',
      });
      seedRun({
        employeeId: emp,
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        promptTokens: 100,
        completionTokens: 50,
        latencyMs: 200,
        costUsd: '0.010',
      });

      // Cheap model: 1 run
      seedRun({
        employeeId: emp,
        provider: 'ollama',
        model: 'llama3.1:8b',
        promptTokens: 500,
        completionTokens: 300,
        latencyMs: 500,
        costUsd: '0',
      });

      const result = runs.costBreakdown(cid);
      expect(result).toHaveLength(2);

      // Anthropic first (higher cost)
      expect(result[0]?.provider).toBe('anthropic');
      expect(result[0]?.model).toBe('claude-opus-4-6');
      expect(result[0]?.totalRuns).toBe(2);
      expect(Number(result[0]?.costUsd)).toBeCloseTo(0.03, 4);

      // Ollama second
      expect(result[1]?.provider).toBe('ollama');
      expect(result[1]?.totalRuns).toBe(1);
    });

    it('respects optional date range filter', () => {
      const cid = seedCompany('Corp');
      const emp = seedEmployee(cid, 'swe', 'Alice');
      const now = Date.now();

      seedRun({
        employeeId: emp,
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        promptTokens: 100,
        completionTokens: 50,
        latencyMs: 200,
        costUsd: '0.005',
        startedAt: now - 30 * DAY_MS,
      });

      seedRun({
        employeeId: emp,
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        promptTokens: 200,
        completionTokens: 100,
        latencyMs: 300,
        costUsd: '0.015',
        startedAt: now,
      });

      // Last 7 days only — should get 1 run
      const result = runs.costBreakdown(cid, now - 7 * DAY_MS, now + DAY_MS);
      expect(result).toHaveLength(1);
      expect(result[0]?.totalRuns).toBe(1);
      expect(Number(result[0]?.costUsd)).toBeCloseTo(0.015, 4);
    });

    it('isolates companies in cost breakdown', () => {
      const cidA = seedCompany('Corp A');
      const cidB = seedCompany('Corp B');
      const empA = seedEmployee(cidA, 'swe', 'Alice');
      const empB = seedEmployee(cidB, 'swe', 'Bob');

      seedRun({
        employeeId: empA,
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        promptTokens: 100,
        completionTokens: 50,
        latencyMs: 200,
        costUsd: '0.005',
      });

      seedRun({
        employeeId: empB,
        provider: 'ollama',
        model: 'llama3.1:8b',
        promptTokens: 300,
        completionTokens: 200,
        latencyMs: 500,
        costUsd: '0',
      });

      const resultA = runs.costBreakdown(cidA);
      expect(resultA).toHaveLength(1);
      expect(resultA[0]?.provider).toBe('anthropic');

      const resultB = runs.costBreakdown(cidB);
      expect(resultB).toHaveLength(1);
      expect(resultB[0]?.provider).toBe('ollama');
    });
  });

  describe('kind filters', () => {
    it('filters all telemetry aggregates by persisted run kind when provided', () => {
      const cid = seedCompany('Kind Corp');
      const emp = seedEmployee(cid, 'swe', 'Alice');
      const now = Date.now();

      seedRun({
        employeeId: emp,
        provider: 'anthropic',
        model: 'claude-work',
        promptTokens: 10,
        completionTokens: 5,
        latencyMs: 100,
        costUsd: '0.001',
        toolCallsCount: 1,
        startedAt: now - DAY_MS,
        kind: 'work',
      });
      seedRun({
        employeeId: emp,
        provider: 'anthropic',
        model: 'claude-agentic',
        promptTokens: 100,
        completionTokens: 50,
        latencyMs: 200,
        costUsd: '0.01',
        toolCallsCount: 2,
        startedAt: now - DAY_MS,
        kind: 'agentic',
      });
      seedRun({
        employeeId: emp,
        provider: 'ollama',
        model: 'llama-copilot',
        promptTokens: 1000,
        completionTokens: 500,
        latencyMs: 300,
        costUsd: '0',
        toolCallsCount: 3,
        startedAt: now - DAY_MS,
        kind: 'copilot',
      });

      expect(runs.companyStats(cid).totalRuns).toBe(3);

      const agenticCompany = runs.companyStats(cid, 'agentic');
      expect(agenticCompany.totalRuns).toBe(1);
      expect(agenticCompany.totalTokens).toBe(150);
      expect(agenticCompany.totalToolCalls).toBe(2);

      const copilotDaily = runs.dailyUsage(cid, now - 2 * DAY_MS, now, 'copilot');
      expect(copilotDaily).toHaveLength(1);
      expect(copilotDaily[0]?.totalRuns).toBe(1);
      expect(copilotDaily[0]?.totalTokens).toBe(1500);

      const workEmployees = runs.employeeStats(cid, 'work');
      expect(workEmployees).toHaveLength(1);
      expect(workEmployees[0]?.employeeId).toBe(emp);
      expect(workEmployees[0]?.totalRuns).toBe(1);
      expect(workEmployees[0]?.totalTokens).toBe(15);

      const agenticCost = runs.costBreakdown(cid, now - 2 * DAY_MS, now, 'agentic');
      expect(agenticCost).toHaveLength(1);
      expect(agenticCost[0]?.provider).toBe('anthropic');
      expect(agenticCost[0]?.model).toBe('claude-agentic');
      expect(agenticCost[0]?.totalRuns).toBe(1);
      expect(agenticCost[0]?.totalTokens).toBe(150);
      expect(Number(agenticCost[0]?.costUsd)).toBeCloseTo(0.01, 4);
    });
  });
});
