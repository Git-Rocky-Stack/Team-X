/**
 * Heartbeat service - proactive agent execution engine.
 *
 * This service transforms Team-X from reactive (agents only respond to chat)
 * to proactive (agents wake up autonomously to work on assigned tasks).
 *
 * Core responsibilities:
 * - Queue and schedule agent wakeup requests
 * - Process pending wakeup requests with priority ordering
 * - Retry failed wakeups with exponential backoff
 * - Monitor agent liveness and recovery
 * - Provide simple API for triggering agent execution
 *
 * Based on Paperclip.ai architecture analysis:
 * - Wakeup queue with coalescing and prioritization
 * - Bounded transient retry logic: [2min, 10min, 30min, 2hr]
 * - Goal ancestry propagation through execution chain
 * - Atomic execution to prevent double-work
 */

import type { EventType } from '@team-x/shared-types';

import type {
  AgentWakeupRequestRow,
  AgentWakeupRequestsRepo,
} from '../db/repos/agent-wakeup-requests.js';
import type { EmployeesRepo } from '../db/repos/employees.js';

import type { EventBus } from './event-bus.js';

export interface WakeupTrigger {
  type: 'routine' | 'ticket_assigned' | 'schedule' | 'manual' | 'goal_decomposed';
  id?: string; // routineId, ticketId, goalId, etc.
}

export interface WakeupContext {
  companyId: string;
  goalId?: string;
  projectId?: string;
  sourceKind: 'routine_execution' | 'manual_assignment' | 'schedule' | 'goal_decomposition';
  sourceRefId?: string;
  metadata?: Record<string, unknown>;
}

export interface WakeupRequest {
  id: string;
  companyId: string;
  agentId: string;
  status: AgentWakeupRequestRow['status'];
  trigger: WakeupTrigger;
  priority: number;
  scheduledFor: Date;
  context: WakeupContext;
}

export interface HeartbeatServiceDeps {
  agentWakeupRequestsRepo: AgentWakeupRequestsRepo;
  employeesRepo: EmployeesRepo;
  bus: EventBus;
}

export interface HeartbeatService {
  // Queue a wakeup request
  scheduleWakeup(input: {
    agentId: string;
    trigger: WakeupTrigger;
    scheduledFor?: Date;
    context: WakeupContext;
    priority?: number;
  }): Promise<string>;

  // Process pending wakeup requests
  processWakeupQueue(companyId: string): Promise<void>;

  // Retry failed wakeup
  retryFailedWakeup(wakeupId: string): Promise<void>;

  // Get agent wakeup history
  getAgentWakeupHistory(agentId: string, limit?: number): Promise<WakeupRequest[]>;

  // Monitor agent liveness
  checkAgentLiveness(agentId: string): Promise<LivenessStatus>;

  // Start heartbeat processing loop
  start(intervalMs: number): void;

  // Stop heartbeat processing
  stop(): void;

  // Get wakeup statistics
  getStats(companyId: string): Promise<WakeupStats>;
}

export interface LivenessStatus {
  agentId: string;
  isAlive: boolean;
  lastActivityAt: number;
  pendingWakeups: number;
  failedWakeups: number;
}

export interface WakeupStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  avgProcessingTimeMs: number;
}

const DEFAULT_HEARTBEAT_INTERVAL_MS = 60 * 1000; // 1 minute
const MAX_CONCURRENT_PROCESSING = 5;

export function createHeartbeatService(deps: HeartbeatServiceDeps): HeartbeatService {
  const { agentWakeupRequestsRepo, employeesRepo, bus } = deps;
  let processingInterval: NodeJS.Timeout | null = null;
  let isProcessing = false;

  async function scheduleWakeup(input: {
    agentId: string;
    trigger: WakeupTrigger;
    scheduledFor?: Date;
    context: WakeupContext;
    priority?: number;
  }): Promise<string> {
    // Validate agent exists
    const agent = employeesRepo.getById(input.agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${input.agentId}`);
    }

    // Ensure agent belongs to the company
    if (agent.companyId !== input.context.companyId) {
      throw new Error(
        `Agent ${input.agentId} does not belong to company ${input.context.companyId}`,
      );
    }

    // Create wakeup request
    const wakeupId = agentWakeupRequestsRepo.create({
      companyId: input.context.companyId,
      agentId: input.agentId,
      triggerType: input.trigger.type,
      triggerId: input.trigger.id,
      priority: input.priority ?? 50,
      scheduledFor: input.scheduledFor?.getTime() ?? Date.now(),
      context: input.context,
    });

    // Emit wakeup scheduled event
    bus.emit({
      type: 'wakeup.scheduled' as EventType,
      companyId: input.context.companyId,
      actorId: input.agentId,
      actorKind: 'employee',
      payload: {
        wakeupId,
        agentId: input.agentId,
        trigger: input.trigger,
        context: input.context,
      },
    });

    return wakeupId;
  }

  async function processWakeupQueue(companyId: string): Promise<void> {
    if (isProcessing) {
      console.log('[heartbeat] Already processing wakeup queue, skipping');
      return;
    }

    isProcessing = true;
    try {
      // Get pending requests that are due
      const pendingRequests = agentWakeupRequestsRepo.listPendingDue(companyId);

      // Process in priority order, with concurrency limit
      const processing = pendingRequests.slice(0, MAX_CONCURRENT_PROCESSING);
      console.log(
        `[heartbeat] Processing ${processing.length} wakeup requests for company ${companyId}`,
      );

      for (const request of processing) {
        await processWakeupRequest(request);
      }

      // Check for failed requests that need retry
      const failedRequests = agentWakeupRequestsRepo.listFailedDueForRetry(companyId);
      console.log(`[heartbeat] Retrying ${failedRequests.length} failed wakeup requests`);

      for (const request of failedRequests) {
        await retryFailedWakeup(request.id);
      }
    } finally {
      isProcessing = false;
    }
  }

  async function processWakeupRequest(request: AgentWakeupRequestRow): Promise<void> {
    try {
      // Mark as processing
      agentWakeupRequestsRepo.markAsProcessing(request.id);

      // Get agent details
      const agent = employeesRepo.getById(request.agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${request.agentId}`);
      }

      // Parse context
      const context = JSON.parse(request.contextJson) as WakeupContext;

      // Emit agent wakeup event
      bus.emit({
        type: 'agent.wakeup' as EventType,
        companyId: request.companyId,
        actorId: request.agentId,
        actorKind: 'employee',
        payload: {
          wakeupRequestId: request.id,
          agentId: request.agentId,
          trigger: {
            type: request.triggerType,
            id: request.triggerId,
          },
          context,
        },
      });

      // Mark as completed
      agentWakeupRequestsRepo.markAsCompleted(request.id, {
        success: true,
        processedAt: Date.now(),
      });

      console.log(
        `[heartbeat] Successfully processed wakeup ${request.id} for agent ${request.agentId}`,
      );
    } catch (error) {
      console.error(`[heartbeat] Error processing wakeup ${request.id}:`, error);

      // Mark as failed with retry
      const retryDelay = agentWakeupRequestsRepo.markAsFailedWithRetry(
        request.id,
        error instanceof Error ? error.message : String(error),
        request.maxAttempts,
      );

      if (retryDelay !== null) {
        console.log(`[heartbeat] Scheduled retry for wakeup ${request.id} in ${retryDelay}ms`);
      } else {
        console.error(
          `[heartbeat] Wakeup ${request.id} failed permanently after ${request.attemptCount} attempts`,
        );
      }
    }
  }

  async function retryFailedWakeup(wakeupId: string): Promise<void> {
    const request = agentWakeupRequestsRepo.getById(wakeupId);
    if (!request) {
      console.error(`[heartbeat] Wakeup request not found: ${wakeupId}`);
      return;
    }

    if (request.status !== 'failed') {
      console.log(`[heartbeat] Wakeup ${wakeupId} is not in failed state, skipping retry`);
      return;
    }

    // Reset to pending for retry
    agentWakeupRequestsRepo.update(wakeupId, {
      status: 'pending',
    });

    console.log(`[heartbeat] Reset wakeup ${wakeupId} to pending for retry`);
  }

  async function getAgentWakeupHistory(agentId: string, limit = 50): Promise<WakeupRequest[]> {
    const requests = agentWakeupRequestsRepo.listByAgent(agentId);

    return requests.slice(0, limit).map((row) => ({
      id: row.id,
      companyId: row.companyId,
      agentId: row.agentId,
      status: row.status,
      trigger: {
        type: row.triggerType as WakeupTrigger['type'],
        id: row.triggerId ?? undefined,
      },
      priority: row.priority,
      scheduledFor: new Date(row.scheduledFor),
      context: JSON.parse(row.contextJson) as WakeupContext,
    }));
  }

  async function checkAgentLiveness(agentId: string): Promise<LivenessStatus> {
    const agent = employeesRepo.getById(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const history = await getAgentWakeupHistory(agentId, 100);
    const pending = history.filter(
      (r) => r.status === 'pending' || r.status === 'processing',
    ).length;
    const failed = history.filter((r) => r.status === 'failed').length;

    // Agent is considered alive if it has recent successful activity
    const recentCompleted = history.filter((r) => {
      if (r.status !== 'completed') return false;
      const completedAt = r.scheduledFor.getTime() + 30 * 60 * 1000; // Assume 30min processing window
      return completedAt > Date.now() - 24 * 60 * 60 * 1000; // Last 24 hours
    });

    const isAlive = recentCompleted.length > 0 || pending > 0;
    const lastActivityAt = recentCompleted[0]?.scheduledFor.getTime() ?? Date.now();

    return {
      agentId,
      isAlive,
      lastActivityAt,
      pendingWakeups: pending,
      failedWakeups: failed,
    };
  }

  function start(intervalMs: number = DEFAULT_HEARTBEAT_INTERVAL_MS): void {
    if (processingInterval !== null) {
      console.log('[heartbeat] Heartbeat already running');
      return;
    }

    console.log(`[heartbeat] Starting heartbeat processing loop (${intervalMs}ms interval)`);

    processingInterval = setInterval(async () => {
      const companies = agentWakeupRequestsRepo.listCompaniesWithDueWork();

      for (const companyId of companies) {
        try {
          await processWakeupQueue(companyId);
        } catch (error) {
          console.error(`[heartbeat] Error processing company ${companyId}:`, error);
        }
      }
    }, intervalMs);

    // Initial processing on start
    setTimeout(async () => {
      const companies = agentWakeupRequestsRepo.listCompaniesWithDueWork();
      for (const companyId of companies) {
        try {
          await processWakeupQueue(companyId);
        } catch (error) {
          console.error(`[heartbeat] Error in initial processing for company ${companyId}:`, error);
        }
      }
    }, 1000);
  }

  function stop(): void {
    if (processingInterval === null) {
      console.log('[heartbeat] Heartbeat not running');
      return;
    }

    console.log('[heartbeat] Stopping heartbeat processing loop');
    clearInterval(processingInterval);
    processingInterval = null;
  }

  async function getStats(companyId: string): Promise<WakeupStats> {
    const repoStats = agentWakeupRequestsRepo.getStats(companyId);

    // Calculate average processing time from completed requests
    const companyCompleted = agentWakeupRequestsRepo
      .listByCompany(companyId)
      .filter(
        (request) =>
          request.status === 'completed' &&
          request.startedAt !== null &&
          request.completedAt !== null,
      );

    let avgProcessingTimeMs = 0;
    if (companyCompleted.length > 0) {
      const totalProcessingTime = companyCompleted.reduce(
        (total, request) => total + ((request.completedAt ?? 0) - (request.startedAt ?? 0)),
        0,
      );
      avgProcessingTimeMs = Math.round(totalProcessingTime / companyCompleted.length);
    }

    return {
      pending: repoStats.pending,
      processing: repoStats.processing,
      completed: repoStats.completed,
      failed: repoStats.failed,
      avgProcessingTimeMs,
    };
  }

  return {
    scheduleWakeup,
    processWakeupQueue,
    retryFailedWakeup,
    getAgentWakeupHistory,
    checkAgentLiveness,
    start,
    stop,
    getStats,
  };
}
