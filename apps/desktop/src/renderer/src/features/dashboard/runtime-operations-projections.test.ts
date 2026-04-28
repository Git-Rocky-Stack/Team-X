import type { RuntimeOperationsSnapshot, RuntimeSession } from '@team-x/shared-types';

import { describe, expect, it } from 'vitest';

import { summarizeRuntimeOperationsForDashboard } from './runtime-operations-projections.js';

function session(overrides: Partial<RuntimeSession>): RuntimeSession {
  return {
    id: overrides.id ?? 'session-1',
    companyId: overrides.companyId ?? 'company-1',
    employeeId: overrides.employeeId ?? 'employee-1',
    runtimeProfileId: overrides.runtimeProfileId ?? 'profile-1',
    adapterKind: overrides.adapterKind ?? 'bash',
    status: overrides.status ?? 'working',
    currentRunId: overrides.currentRunId ?? 'run-1',
    currentTicketId: overrides.currentTicketId ?? null,
    pid: overrides.pid ?? null,
    endpointUrl: overrides.endpointUrl ?? null,
    workspacePath: overrides.workspacePath ?? null,
    capabilities: overrides.capabilities ?? {},
    lastHeartbeatAt: overrides.lastHeartbeatAt !== undefined ? overrides.lastHeartbeatAt : 1_000,
    leaseExpiresAt: overrides.leaseExpiresAt !== undefined ? overrides.leaseExpiresAt : null,
    failureReason: overrides.failureReason !== undefined ? overrides.failureReason : null,
    startedAt: overrides.startedAt ?? 900,
    endedAt: overrides.endedAt ?? null,
    createdAt: overrides.createdAt ?? 900,
    updatedAt: overrides.updatedAt ?? 1_000,
  };
}

function snapshot(overrides: Partial<RuntimeOperationsSnapshot>): RuntimeOperationsSnapshot {
  return {
    companyId: overrides.companyId ?? 'company-1',
    generatedAt: overrides.generatedAt ?? 2_000,
    sessions: overrides.sessions ?? [],
    activeCheckouts: overrides.activeCheckouts ?? [],
  };
}

describe('summarizeRuntimeOperationsForDashboard', () => {
  it('summarizes live sessions, adapter spread, and visible blockers', () => {
    const summary = summarizeRuntimeOperationsForDashboard(
      snapshot({
        sessions: [
          session({
            id: 'working-bash',
            adapterKind: 'bash',
            status: 'working',
            workspacePath: 'C:/Team-X/company/runtime/bash/workspace',
            capabilities: { managedWorkspace: true },
            lastHeartbeatAt: 2_000,
          }),
          session({
            id: 'budget-blocked-codex',
            adapterKind: 'codex',
            status: 'blocked',
            failureReason: '[runtime-budget] policy daily cap exceeded',
            lastHeartbeatAt: 1_500,
          }),
          session({
            id: 'checkout-stale-http',
            adapterKind: 'http',
            status: 'stale',
            currentTicketId: 'ticket-1',
            failureReason: '[runtime-checkout] lease expired before heartbeat',
            lastHeartbeatAt: null,
            updatedAt: 1_750,
          }),
        ],
        activeCheckouts: [
          {
            id: 'checkout-1',
            companyId: 'company-1',
            ticketId: 'ticket-1',
            employeeId: 'employee-1',
            runtimeSessionId: 'checkout-stale-http',
            runId: 'run-1',
            status: 'active',
            claimedAt: 1_000,
            lastHeartbeatAt: 1_000,
            expiresAt: 3_000,
            releasedAt: null,
            releaseReason: null,
            createdAt: 1_000,
            updatedAt: 1_000,
          },
        ],
      }),
    );

    expect(summary).toMatchObject({
      sessionCount: 3,
      workingSessionCount: 1,
      blockedSessionCount: 1,
      staleSessionCount: 1,
      failedSessionCount: 0,
      missingHeartbeatCount: 1,
      managedWorkspaceCount: 1,
      activeCheckoutCount: 1,
      budgetBlockedCount: 1,
      checkoutBlockedCount: 1,
      attentionCount: 3,
      latestHeartbeatAt: 2_000,
      stateLabel: 'Action needed',
      stateTone: 'warning',
    });
    expect(summary.adapterCounts).toEqual([
      { kind: 'bash', count: 1 },
      { kind: 'codex', count: 1 },
      { kind: 'http', count: 1 },
    ]);
    expect(summary.recentSessions.map((row) => row.id)).toEqual([
      'working-bash',
      'checkout-stale-http',
      'budget-blocked-codex',
    ]);
  });

  it('keeps an empty workspace quiet', () => {
    expect(summarizeRuntimeOperationsForDashboard(snapshot({}))).toMatchObject({
      sessionCount: 0,
      activeCheckoutCount: 0,
      attentionCount: 0,
      latestHeartbeatAt: null,
      stateLabel: 'Quiet',
      stateTone: 'default',
      adapterCounts: [],
      recentSessions: [],
    });
  });
});
