import { describe, expect, it, vi } from 'vitest';

import type { ArtifactRecord, RuntimeAuditPayload } from '@team-x/shared-types';

import { createRuntimeAuditNormalizer } from './runtime-audit-normalizer-service.js';

function artifactFixture(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    id: 'artifact-1',
    companyId: 'company-1',
    kind: 'runtime-output',
    outcomeKind: 'artifact-created',
    status: 'ready',
    title: 'Runtime output',
    summary: 'Completed.',
    sourceKind: 'runtime-execution',
    sourceRefId: 'run-1',
    ticketId: 'ticket-1',
    fileId: null,
    approvalItemId: null,
    approvalDecisionId: null,
    uri: 'runtime:session-1',
    preview: null,
    createdByEmployeeId: 'employee-1',
    createdByRoutineId: null,
    approvedByOperatorId: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('runtime audit normalizer service', () => {
  it('emits normalized runtime events and mirrors run-scoped events into tool-call rows', () => {
    const bus = {
      emit: vi.fn((input) => ({
        id: `event-${input.type}`,
        type: input.type,
        companyId: input.companyId,
        actorId: input.actorId,
        actorKind: input.actorKind,
        payload: input.payload,
        createdAt: 100,
      })),
    };
    const toolCallsRepo = { create: vi.fn(() => 'tool-call-1') };
    const service = createRuntimeAuditNormalizer({ bus, toolCallsRepo });

    service.emit({
      type: 'runtime.execution.failed',
      companyId: 'company-1',
      employeeId: 'employee-1',
      runtimeProfileId: 'profile-1',
      adapterKind: 'codex',
      transport: 'command',
      sessionId: 'session-1',
      runId: 'run-1',
      threadId: 'thread-1',
      ticketId: 'ticket-1',
      checkoutId: 'checkout-1',
      workspacePath: 'C:\\Team-X\\runtime\\workspace',
      endpointUrl: null,
      leaseExpiresAt: 500,
      status: 'failed',
      message: 'Command exited 1.',
    });

    expect(bus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'runtime.execution.failed',
        companyId: 'company-1',
        actorId: 'employee-1',
        actorKind: 'employee',
        payload: expect.objectContaining({
          runId: 'run-1',
          sessionId: 'session-1',
          status: 'failed',
          message: 'Command exited 1.',
        }),
      }),
    );
    expect(toolCallsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        toolName: 'runtime.execution.failed',
        status: 'error',
        error: 'Command exited 1.',
      }),
    );
    const toolCallInput = JSON.parse(toolCallsRepo.create.mock.calls[0]?.[0].inputJson ?? '{}');
    expect(toolCallInput).toEqual(
      expect.objectContaining({
        adapterKind: 'codex',
        threadId: 'thread-1',
        ticketId: 'ticket-1',
      } satisfies Partial<RuntimeAuditPayload>),
    );
  });

  it('records runtime output artifacts and emits runtime.artifact.created with provenance', () => {
    const bus = {
      emit: vi.fn((input) => ({
        id: `event-${input.type}`,
        type: input.type,
        companyId: input.companyId,
        actorId: input.actorId,
        actorKind: input.actorKind,
        payload: input.payload,
        createdAt: 100,
      })),
    };
    const toolCallsRepo = { create: vi.fn(() => 'tool-call-1') };
    const artifactService = {
      recordRuntimeOutputArtifact: vi.fn(() => artifactFixture()),
    };
    const service = createRuntimeAuditNormalizer({ bus, toolCallsRepo, artifactService });

    const artifact = service.recordArtifact({
      companyId: 'company-1',
      employeeId: 'employee-1',
      runtimeProfileId: 'profile-1',
      adapterKind: 'codex',
      transport: 'command',
      sessionId: 'session-1',
      runId: 'run-1',
      threadId: 'thread-1',
      ticketId: 'ticket-1',
      checkoutId: 'checkout-1',
      workspacePath: 'C:\\Team-X\\runtime\\workspace',
      endpointUrl: null,
      leaseExpiresAt: 500,
      outputText: 'Completed implementation.',
      usage: { promptTokens: 8, completionTokens: 3 },
      createdAt: 200,
    });

    expect(artifact?.id).toBe('artifact-1');
    expect(artifactService.recordRuntimeOutputArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeSessionId: 'session-1',
        runtimeProfileId: 'profile-1',
        runId: 'run-1',
        ticketId: 'ticket-1',
        outputText: 'Completed implementation.',
        usage: { promptTokens: 8, completionTokens: 3 },
      }),
    );
    expect(bus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'runtime.artifact.created',
        payload: expect.objectContaining({
          artifactId: 'artifact-1',
          runId: 'run-1',
          ticketId: 'ticket-1',
        }),
      }),
    );
    expect(toolCallsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        toolName: 'runtime.artifact.created',
        status: 'success',
      }),
    );
  });
});
