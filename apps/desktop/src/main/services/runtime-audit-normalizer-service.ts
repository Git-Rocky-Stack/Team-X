import type {
  ActorKind,
  ArtifactRecord,
  RuntimeAuditEventType,
  RuntimeAuditPayload,
  RuntimeAuditUsageDelta,
  RuntimeProfileKind,
  RuntimeSessionStatus,
} from '@team-x/shared-types';

import type { ToolCallsRepo } from '../db/repos/mcp-servers.js';
import type { EventBus } from '../orchestrator/event-bus.js';
import type { ArtifactService } from './artifact-service.js';

export interface RuntimeAuditContext {
  companyId: string;
  employeeId: string;
  runtimeProfileId: string | null;
  adapterKind: RuntimeProfileKind;
  transport: 'command' | 'http' | null;
  sessionId: string | null;
  runId: string | null;
  threadId: string | null;
  ticketId: string | null;
  checkoutId: string | null;
  workspacePath: string | null;
  endpointUrl: string | null;
  leaseExpiresAt: number | null;
}

export interface EmitRuntimeAuditEventInput extends RuntimeAuditContext {
  type: RuntimeAuditEventType;
  status?: RuntimeSessionStatus;
  message?: string | null;
  usage?: RuntimeAuditUsageDelta | null;
  conflictingCheckoutId?: string | null;
  conflictingEmployeeId?: string | null;
  artifactId?: string | null;
}

export interface RecordRuntimeArtifactInput extends RuntimeAuditContext {
  outputText: string;
  usage: RuntimeAuditUsageDelta | null;
  createdAt: number;
}

export interface RuntimeAuditNormalizerDeps {
  bus?: Pick<EventBus, 'emit'>;
  toolCallsRepo?: Pick<ToolCallsRepo, 'create'>;
  artifactService?: Pick<ArtifactService, 'recordRuntimeOutputArtifact'>;
  logger?: Pick<Console, 'warn'>;
}

function runtimeToolStatus(
  eventType: RuntimeAuditEventType,
): 'success' | 'error' | 'denied' {
  if (eventType === 'runtime.checkout.conflict') return 'denied';
  if (
    eventType === 'runtime.execution.failed' ||
    eventType === 'runtime.session.stale'
  ) {
    return 'error';
  }
  return 'success';
}

function artifactTitle(input: RecordRuntimeArtifactInput): string {
  const label = input.ticketId ? `ticket ${input.ticketId}` : input.adapterKind;
  return `Runtime output for ${label}`;
}

export function createRuntimeAuditNormalizer({
  bus,
  toolCallsRepo,
  artifactService,
  logger = console,
}: RuntimeAuditNormalizerDeps) {
  function emit(input: EmitRuntimeAuditEventInput): void {
    const payload: RuntimeAuditPayload = {
      sessionId: input.sessionId,
      employeeId: input.employeeId,
      runtimeProfileId: input.runtimeProfileId,
      adapterKind: input.adapterKind,
      transport: input.transport,
      runId: input.runId,
      threadId: input.threadId,
      ticketId: input.ticketId,
      checkoutId: input.checkoutId,
      conflictingCheckoutId: input.conflictingCheckoutId ?? null,
      conflictingEmployeeId: input.conflictingEmployeeId ?? null,
      artifactId: input.artifactId ?? null,
      status: input.status,
      message: input.message ?? null,
      usage: input.usage ?? null,
      workspacePath: input.workspacePath,
      endpointUrl: input.endpointUrl,
      leaseExpiresAt: input.leaseExpiresAt,
    };

    let eventId: string | null = null;
    if (bus) {
      try {
        eventId = bus.emit<RuntimeAuditPayload>({
          type: input.type,
          companyId: input.companyId,
          actorId: input.employeeId,
          actorKind: 'employee' satisfies ActorKind,
          payload,
        }).id;
      } catch (error) {
        logger.warn(`[runtime-audit] failed to emit ${input.type}`, error);
      }
    }

    if (toolCallsRepo && input.runId) {
      try {
        toolCallsRepo.create({
          runId: input.runId,
          toolName: input.type,
          mcpServerId: null,
          inputJson: JSON.stringify(payload),
          outputJson: JSON.stringify({ eventId, artifactId: payload.artifactId ?? null }),
          latencyMs: 0,
          status: runtimeToolStatus(input.type),
          error:
            input.type === 'runtime.execution.failed' ||
            input.type === 'runtime.checkout.conflict' ||
            input.type === 'runtime.session.stale'
              ? input.message ?? input.type
              : null,
        });
      } catch (error) {
        logger.warn(`[runtime-audit] failed to record tool-call row for ${input.type}`, error);
      }
    }
  }

  function recordArtifact(input: RecordRuntimeArtifactInput): ArtifactRecord | null {
    if (!artifactService || !input.sessionId) return null;
    try {
      const artifact = artifactService.recordRuntimeOutputArtifact({
        companyId: input.companyId,
        runtimeSessionId: input.sessionId,
        runtimeProfileId: input.runtimeProfileId,
        adapterKind: input.adapterKind,
        runId: input.runId,
        ticketId: input.ticketId,
        employeeId: input.employeeId,
        title: artifactTitle(input),
        outputText: input.outputText,
        usage: input.usage,
        createdAt: input.createdAt,
      });
      emit({
        ...input,
        type: 'runtime.artifact.created',
        status: 'working',
        message: 'Runtime output artifact recorded.',
        artifactId: artifact.id,
      });
      return artifact;
    } catch (error) {
      logger.warn('[runtime-audit] failed to record runtime output artifact', error);
      return null;
    }
  }

  return {
    emit,
    recordArtifact,
  };
}

export type RuntimeAuditNormalizer = ReturnType<typeof createRuntimeAuditNormalizer>;
