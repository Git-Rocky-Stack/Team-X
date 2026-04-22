import type { DashboardEvent, TelemetryRecentRunRow } from '@team-x/shared-types';
import { describe, expect, it } from 'vitest';

import {
  formatAgentRunPhase,
  mergeDashboardAgentRuns,
  projectTelemetryRecentRuns,
  reduceDashboardAgentRuns,
} from './agent-runs-projections.js';

function makeEvent(overrides: Partial<DashboardEvent>): DashboardEvent {
  return {
    id: 'evt-1',
    type: 'command.executed',
    companyId: 'co-1',
    actorId: 'user',
    actorKind: 'user',
    payload: {},
    createdAt: 1,
    ...overrides,
  };
}

describe('agent-runs-projections', () => {
  it('projects persisted telemetry runs into dashboard cards', () => {
    const projected = projectTelemetryRecentRuns([
      {
        runId: 'run-persisted',
        threadId: 'thr-9',
        threadSubject: 'Audit the release train',
        employeeId: 'emp-1',
        employeeName: 'Iris',
        employeeTitle: 'Ops Lead',
        provider: 'openai',
        model: 'gpt-5.4',
        status: 'success',
        error: null,
        promptTokens: 120,
        completionTokens: 80,
        costUsd: '0.012',
        toolCallsCount: 2,
        startedAt: 100,
        endedAt: 150,
      } satisfies TelemetryRecentRunRow,
    ]);

    expect(projected).toHaveLength(1);
    expect(projected[0]?.label).toBe('Audit the release train');
    expect(projected[0]?.latestPhase).toBe('completed');
    expect(projected[0]?.status).toBe('completed');
    expect(projected[0]?.durationMs).toBe(50);
  });

  it('creates a labeled run from command.executed and updates it from agent.step', () => {
    const commanded = reduceDashboardAgentRuns(
      [],
      makeEvent({
        type: 'command.executed',
        payload: {
          companyId: 'co-1',
          actorId: 'user',
          intent: 'complex_request',
          entities: {},
          rawText: 'Audit the release gates',
          outcome: 'ok',
          durationMs: 15,
          runId: 'run-1',
          threadId: 'thr-1',
        },
      }),
    );

    const stepped = reduceDashboardAgentRuns(
      commanded,
      makeEvent({
        type: 'agent.step',
        createdAt: 2,
        payload: {
          runId: 'run-1',
          threadId: 'thr-1',
          stepIndex: 0,
          kind: 'plan',
          data: { text: 'Plan' },
          tokensIn: 50,
          tokensOut: 20,
          costUsd: 0.003,
          provider: 'openai',
          model: 'gpt-5.4',
        },
      }),
    );

    expect(stepped).toHaveLength(1);
    expect(stepped[0]?.label).toBe('Audit the release gates');
    expect(stepped[0]?.latestPhase).toBe('plan');
    expect(stepped[0]?.stepCount).toBe(1);
    expect(stepped[0]?.status).toBe('running');
  });

  it('latches failed terminal state with a failure reason', () => {
    const failed = reduceDashboardAgentRuns(
      [],
      makeEvent({
        type: 'agentic.failed',
        payload: {
          runId: 'run-2',
          threadId: 'thr-2',
          reason: 'budget_exhausted',
          message: 'Token budget exhausted',
          totalSteps: 4,
          tokensIn: 100,
          tokensOut: 200,
          costUsd: 0.02,
          durationMs: 1200,
        },
      }),
    );

    expect(failed[0]?.status).toBe('failed');
    expect(failed[0]?.failureReason).toBe('budget_exhausted');
    expect(failed[0]?.latestPhase).toBe('failed');
  });

  it('lets live runs override persisted seeds for the same runId', () => {
    const persisted = projectTelemetryRecentRuns([
      {
        runId: 'run-override',
        threadId: 'thr-1',
        threadSubject: 'Persisted label',
        employeeId: 'emp-1',
        employeeName: 'Iris',
        employeeTitle: 'Ops Lead',
        provider: 'openai',
        model: 'gpt-5.4',
        status: 'success',
        error: null,
        promptTokens: 10,
        completionTokens: 12,
        costUsd: '0.004',
        toolCallsCount: 0,
        startedAt: 10,
        endedAt: 25,
      } satisfies TelemetryRecentRunRow,
    ]);
    const live = reduceDashboardAgentRuns(
      [],
      makeEvent({
        type: 'agent.step',
        createdAt: 30,
        payload: {
          runId: 'run-override',
          threadId: 'thr-1',
          stepIndex: 1,
          kind: 'tool_call',
          data: { tool: 'search' },
          tokensIn: 44,
          tokensOut: 8,
          costUsd: 0.01,
          provider: 'openai',
          model: 'gpt-5.4',
        },
      }),
    );

    const merged = mergeDashboardAgentRuns(persisted, live);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.latestPhase).toBe('tool_call');
    expect(merged[0]?.status).toBe('running');
    expect(merged[0]?.tokensIn).toBe(44);
  });

  it('formats dashboard-facing phase labels', () => {
    expect(formatAgentRunPhase('running')).toBe('Running');
    expect(formatAgentRunPhase('tool_call')).toBe('Tool call');
    expect(formatAgentRunPhase('delegation_made')).toBe('Delegation');
    expect(formatAgentRunPhase('completed')).toBe('Answer');
  });
});
