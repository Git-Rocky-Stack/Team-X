import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { createCompaniesRepo } from './companies.js';
import { createEmployeesRepo } from './employees.js';
import { createMessagesRepo } from './messages.js';
import {
  INTERRUPTED_WORK_RUN_ERROR,
  INTERRUPTED_WORK_RUN_MESSAGE,
  createRunsRepo,
} from './runs.js';
import { createThreadsRepo } from './threads.js';

describe('runs repo', () => {
  let ctx: TestDbHandle;
  let runs: ReturnType<typeof createRunsRepo>;
  let companies: ReturnType<typeof createCompaniesRepo>;
  let employees: ReturnType<typeof createEmployeesRepo>;
  let messages: ReturnType<typeof createMessagesRepo>;
  let threads: ReturnType<typeof createThreadsRepo>;

  beforeEach(async () => {
    ctx = await makeTestDb();
    companies = createCompaniesRepo(ctx.db);
    employees = createEmployeesRepo(ctx.db);
    messages = createMessagesRepo(ctx.db);
    threads = createThreadsRepo(ctx.db);
    runs = createRunsRepo(ctx.db);
  });

  afterEach(() => {
    ctx.close();
  });

  describe('start', () => {
    it('returns a non-empty id and persists required fields', () => {
      const id = runs.start({
        employeeId: 'emp-1',
        provider: 'anthropic',
        model: 'claude-opus-4-6',
      });
      expect(id).toBeTypeOf('string');
      expect(id.length).toBeGreaterThan(0);
      const all = runs.listByEmployee('emp-1');
      expect(all).toHaveLength(1);
      expect(all[0]?.id).toBe(id);
      expect(all[0]?.provider).toBe('anthropic');
      expect(all[0]?.model).toBe('claude-opus-4-6');
    });

    it('defaults status to "running" on start', () => {
      const id = runs.start({
        employeeId: 'e',
        provider: 'p',
        model: 'm',
      });
      const row = runs.listByEmployee('e').find((r) => r.id === id);
      expect(row?.status).toBe('running');
    });

    it('defaults token counts, latency, cost, and tool_calls_count to zero', () => {
      const id = runs.start({
        employeeId: 'e',
        provider: 'p',
        model: 'm',
      });
      const row = runs.listByEmployee('e').find((r) => r.id === id);
      expect(row?.promptTokens).toBe(0);
      expect(row?.completionTokens).toBe(0);
      expect(row?.latencyMs).toBe(0);
      expect(row?.costUsd).toBe('0');
      expect(row?.toolCallsCount).toBe(0);
      // C3 — cache columns must default to 0 so legacy callers that
      // omit them in finish() don't trip the NOT NULL constraint.
      expect(row?.cacheReadTokens).toBe(0);
      expect(row?.cacheWriteTokens).toBe(0);
    });

    it('stores startedAt as a positive integer in ms and leaves endedAt null', () => {
      const before = Date.now();
      const id = runs.start({ employeeId: 'e', provider: 'p', model: 'm' });
      const after = Date.now();
      const row = runs.listByEmployee('e').find((r) => r.id === id);
      expect(row?.startedAt).toBeGreaterThanOrEqual(before);
      expect(row?.startedAt).toBeLessThanOrEqual(after);
      expect(row?.endedAt).toBeNull();
    });

    it('accepts an optional threadId', () => {
      const id = runs.start({
        employeeId: 'e',
        provider: 'p',
        model: 'm',
        threadId: 'thread-abc',
      });
      const row = runs.listByEmployee('e').find((r) => r.id === id);
      expect(row?.threadId).toBe('thread-abc');
    });

    it('leaves threadId null when omitted', () => {
      const id = runs.start({ employeeId: 'e', provider: 'p', model: 'm' });
      const row = runs.listByEmployee('e').find((r) => r.id === id);
      expect(row?.threadId).toBeNull();
    });
  });

  describe('finish', () => {
    it('updates an existing run with success metrics', () => {
      const id = runs.start({ employeeId: 'e', provider: 'p', model: 'm' });
      runs.finish(id, {
        status: 'success',
        promptTokens: 120,
        completionTokens: 480,
        latencyMs: 1234,
        costUsd: '0.00912',
        toolCallsCount: 2,
      });
      const row = runs.listByEmployee('e').find((r) => r.id === id);
      expect(row?.status).toBe('success');
      expect(row?.promptTokens).toBe(120);
      expect(row?.completionTokens).toBe(480);
      expect(row?.latencyMs).toBe(1234);
      expect(row?.costUsd).toBe('0.00912');
      expect(row?.toolCallsCount).toBe(2);
      expect(row?.endedAt).not.toBeNull();
    });

    it('records endedAt as a positive integer ≥ startedAt', async () => {
      const id = runs.start({ employeeId: 'e', provider: 'p', model: 'm' });
      await new Promise((r) => setTimeout(r, 3));
      runs.finish(id, {
        status: 'success',
        promptTokens: 1,
        completionTokens: 1,
        latencyMs: 1,
        costUsd: '0',
      });
      const row = runs.listByEmployee('e').find((r) => r.id === id);
      expect(row?.endedAt).not.toBeNull();
      expect(row?.endedAt).toBeGreaterThanOrEqual(row?.startedAt ?? 0);
    });

    it('accepts an error status with an error message', () => {
      const id = runs.start({ employeeId: 'e', provider: 'p', model: 'm' });
      runs.finish(id, {
        status: 'error',
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: 42,
        costUsd: '0',
        error: 'provider returned 503',
      });
      const row = runs.listByEmployee('e').find((r) => r.id === id);
      expect(row?.status).toBe('error');
      expect(row?.error).toBe('provider returned 503');
    });

    it('defaults toolCallsCount to 0 when omitted from finish payload', () => {
      const id = runs.start({ employeeId: 'e', provider: 'p', model: 'm' });
      runs.finish(id, {
        status: 'success',
        promptTokens: 10,
        completionTokens: 20,
        latencyMs: 100,
        costUsd: '0.001',
      });
      const row = runs.listByEmployee('e').find((r) => r.id === id);
      expect(row?.toolCallsCount).toBe(0);
    });

    it('is a no-op on unknown id (does not throw)', () => {
      expect(() =>
        runs.finish('no-such-run', {
          status: 'success',
          promptTokens: 0,
          completionTokens: 0,
          latencyMs: 0,
          costUsd: '0',
        }),
      ).not.toThrow();
    });

    it('records Anthropic prompt-cache token counts when the call surfaces them (C3)', () => {
      const id = runs.start({ employeeId: 'e', provider: 'anthropic', model: 'claude-sonnet-4-6' });
      runs.finish(id, {
        status: 'success',
        promptTokens: 200, // fresh input
        completionTokens: 50, // output
        cacheReadTokens: 4000, // discounted re-use
        cacheWriteTokens: 1000, // premium first-time caching
        latencyMs: 800,
        costUsd: '0.0234',
      });
      const row = runs.listByEmployee('e').find((r) => r.id === id);
      expect(row?.promptTokens).toBe(200);
      expect(row?.completionTokens).toBe(50);
      expect(row?.cacheReadTokens).toBe(4000);
      expect(row?.cacheWriteTokens).toBe(1000);
    });

    it('defaults cache columns to 0 when finish() omits them (legacy callers)', () => {
      const id = runs.start({ employeeId: 'e', provider: 'ollama-local', model: 'gemma3:27b' });
      runs.finish(id, {
        status: 'success',
        promptTokens: 100,
        completionTokens: 50,
        latencyMs: 400,
        costUsd: '0',
      });
      const row = runs.listByEmployee('e').find((r) => r.id === id);
      expect(row?.cacheReadTokens).toBe(0);
      expect(row?.cacheWriteTokens).toBe(0);
    });
  });

  describe('recoverInterruptedWorkRuns', () => {
    it('closes stale running work rows and fills the empty assistant message', () => {
      const companyId = companies.create({ name: 'Acme', slug: 'acme' });
      const employeeId = employees.create({
        companyId,
        rolePackId: 'pack',
        roleId: 'ceo',
        roleMdSha: 'sha',
        level: 'officer',
        name: 'Iris',
        title: 'CEO',
      });
      const threadId = threads.create({ companyId, kind: 'dm', createdBy: 'rocky' });
      const runId = runs.start({
        employeeId,
        provider: 'ollama-local',
        model: 'gemma4:31b-cloud',
        threadId,
      });
      const runBefore = runs.getById(runId);
      const messageId = messages.append({
        threadId,
        authorId: employeeId,
        authorKind: 'employee',
        content: '',
      });

      const recovered = runs.recoverInterruptedWorkRuns({
        now: (runBefore?.startedAt ?? Date.now()) + 60_000,
      });

      expect(recovered).toBe(1);
      const runAfter = runs.getById(runId);
      expect(runAfter?.status).toBe('error');
      expect(runAfter?.error).toBe(INTERRUPTED_WORK_RUN_ERROR);
      expect(runAfter?.endedAt).not.toBeNull();
      expect(runAfter?.latencyMs).toBe(60_000);
      expect(messages.listByThread(threadId).find((row) => row.id === messageId)?.content).toBe(
        INTERRUPTED_WORK_RUN_MESSAGE,
      );
    });

    it('does not modify terminal or non-work rows', () => {
      const workRunId = runs.start({ employeeId: 'emp', provider: 'p', model: 'm' });
      runs.finish(workRunId, {
        status: 'success',
        promptTokens: 1,
        completionTokens: 1,
        latencyMs: 1,
        costUsd: '0',
      });
      const copilotRunId = runs.start({
        employeeId: 'emp',
        provider: 'p',
        model: 'm',
        kind: 'copilot',
      });

      expect(runs.recoverInterruptedWorkRuns()).toBe(0);
      expect(runs.getById(workRunId)?.status).toBe('success');
      expect(runs.getById(copilotRunId)?.status).toBe('running');
    });
  });

  describe('listByEmployee', () => {
    it('returns an empty array when an employee has no runs', () => {
      expect(runs.listByEmployee('nobody')).toEqual([]);
    });

    it('returns only runs for the given employee', () => {
      runs.start({ employeeId: 'emp-a', provider: 'p', model: 'm' });
      runs.start({ employeeId: 'emp-a', provider: 'p', model: 'm' });
      runs.start({ employeeId: 'emp-b', provider: 'p', model: 'm' });
      expect(runs.listByEmployee('emp-a')).toHaveLength(2);
      expect(runs.listByEmployee('emp-b')).toHaveLength(1);
      expect(runs.listByEmployee('emp-c')).toHaveLength(0);
    });
  });

  describe('recentRuns', () => {
    it('returns newest-first joined run summaries for a company', async () => {
      const companyId = companies.create({ name: 'Acme', slug: 'acme' });
      const otherCompanyId = companies.create({ name: 'Beta', slug: 'beta' });
      const employeeId = employees.create({
        companyId,
        rolePackId: 'pack',
        roleId: 'ops',
        roleMdSha: 'sha',
        level: 'lead',
        name: 'Iris',
        title: 'Operations Lead',
      });
      const otherEmployeeId = employees.create({
        companyId: otherCompanyId,
        rolePackId: 'pack',
        roleId: 'ops',
        roleMdSha: 'sha',
        level: 'lead',
        name: 'Mina',
        title: 'Ops',
      });
      const threadId = threads.create({
        companyId,
        kind: 'group',
        createdBy: 'rocky',
        subject: 'Quarterly release review',
      });

      const olderRunId = runs.start({
        employeeId,
        provider: 'openai',
        model: 'gpt-5.4',
        threadId,
        kind: 'agentic',
      });
      await new Promise((resolve) => setTimeout(resolve, 3));
      runs.finish(olderRunId, {
        status: 'success',
        promptTokens: 10,
        completionTokens: 20,
        cacheReadTokens: 750, // C3 — exercise the recentRuns projection
        cacheWriteTokens: 250,
        latencyMs: 100,
        costUsd: '0.01',
      });

      const newerRunId = runs.start({
        employeeId,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        threadId,
        kind: 'agentic',
      });

      const otherRunId = runs.start({
        employeeId: otherEmployeeId,
        provider: 'anthropic',
        model: 'claude',
        kind: 'agentic',
      });
      runs.finish(otherRunId, {
        status: 'error',
        promptTokens: 1,
        completionTokens: 1,
        latencyMs: 10,
        costUsd: '0.001',
        error: 'ignore me',
      });

      const recent = runs.recentRuns(companyId, 5, 'agentic');

      expect(recent).toHaveLength(2);
      expect(recent[0]?.runId).toBe(newerRunId);
      expect(recent[0]?.employeeName).toBe('Iris');
      expect(recent[0]?.threadSubject).toBe('Quarterly release review');
      expect(recent[1]?.runId).toBe(olderRunId);
      // C3 — cache columns flow through the recentRuns projection so
      // the dashboard can render per-row cost-explainer drill-down.
      expect(recent[1]?.cacheReadTokens).toBe(750);
      expect(recent[1]?.cacheWriteTokens).toBe(250);
      // The newer (still-running) row had no finish() call yet.
      expect(recent[0]?.cacheReadTokens).toBe(0);
      expect(recent[0]?.cacheWriteTokens).toBe(0);
    });

    it('respects the limit and kind filter', () => {
      const companyId = companies.create({ name: 'Gamma', slug: 'gamma' });
      const employeeId = employees.create({
        companyId,
        rolePackId: 'pack',
        roleId: 'eng',
        roleMdSha: 'sha',
        level: 'ic',
        name: 'Tao',
        title: 'Engineer',
      });

      const workRunId = runs.start({
        employeeId,
        provider: 'openai',
        model: 'gpt-5.4',
        kind: 'work',
      });
      runs.finish(workRunId, {
        status: 'success',
        promptTokens: 3,
        completionTokens: 5,
        latencyMs: 9,
        costUsd: '0.002',
      });

      runs.start({
        employeeId,
        provider: 'openai',
        model: 'gpt-5.4-mini',
        kind: 'agentic',
      });

      const recent = runs.recentRuns(companyId, 1, 'agentic');

      expect(recent).toHaveLength(1);
      expect(recent[0]?.status).toBe('running');
      expect(recent[0]?.model).toBe('gpt-5.4-mini');
    });
  });

  // ---------------------------------------------------------------------
  // H4 audit 2026-05-07 — traceId propagation
  // ---------------------------------------------------------------------

  describe('traceId (H4 audit 2026-05-07)', () => {
    it('persists a traceId supplied on start() and surfaces it on the row', () => {
      const id = runs.start({
        employeeId: 'e',
        provider: 'p',
        model: 'm',
        traceId: '0123456789abcdef0123456789abcdef',
      });
      const row = runs.getById(id);
      expect(row?.traceId).toBe('0123456789abcdef0123456789abcdef');
    });

    it('leaves traceId null when no value is supplied (back-compat for legacy callers)', () => {
      const id = runs.start({ employeeId: 'e', provider: 'p', model: 'm' });
      const row = runs.getById(id);
      expect(row?.traceId).toBeNull();
    });

    it('listByTraceId returns every run sharing a trace ID', () => {
      const traceA = '11112222333344445555666677778888';
      const traceB = '99998888777766665555444433332222';
      const a1 = runs.start({ employeeId: 'e', provider: 'p', model: 'm', traceId: traceA });
      const a2 = runs.start({ employeeId: 'e', provider: 'p', model: 'm', traceId: traceA });
      runs.start({ employeeId: 'e', provider: 'p', model: 'm', traceId: traceB });
      runs.start({ employeeId: 'e', provider: 'p', model: 'm' }); // no trace

      const aRows = runs.listByTraceId(traceA);
      expect(aRows.map((r) => r.id).sort()).toEqual([a1, a2].sort());
      expect(runs.listByTraceId(traceB)).toHaveLength(1);
      expect(runs.listByTraceId('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toHaveLength(0);
    });

    it('recentRuns surfaces traceId in the projection', async () => {
      const companyId = companies.create({ name: 'Acme', slug: 'acme' });
      const employeeId = employees.create({
        companyId,
        rolePackId: 'pack',
        roleId: 'ops',
        roleMdSha: 'sha',
        level: 'lead',
        name: 'Iris',
        title: 'Operations Lead',
      });
      const trace = '0123456789abcdef0123456789abcdef';
      runs.start({
        employeeId,
        provider: 'p',
        model: 'm',
        traceId: trace,
      });

      const recent = runs.recentRuns(companyId, 5);
      expect(recent).toHaveLength(1);
      expect(recent[0]?.traceId).toBe(trace);
    });
  });
});
