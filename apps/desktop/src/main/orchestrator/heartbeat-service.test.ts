/**
 * Heartbeat service tests - validates proactive execution foundation.
 *
 * These tests verify that the wakeup queue, retry logic, and liveness
 * monitoring work correctly. This is the foundation for autonomous
 * agent execution in Team-X.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { nanoid } from 'nanoid';

import type { AgentWakeupRequestsRepo } from '../db/repos/agent-wakeup-requests.js';
import type { EmployeesRepo } from '../db/repos/employees.js';
import type { EventBus } from './event-bus.js';
import { createHeartbeatService } from './heartbeat-service.js';

// Mock dependencies
const mockAgentWakeupRequestsRepo: AgentWakeupRequestsRepo = {
  create: vi.fn(),
  getById: vi.fn(),
  listByCompany: vi.fn(),
  listByAgent: vi.fn(),
  listPendingDue: vi.fn(),
  listFailedDueForRetry: vi.fn(),
  listByTriggerType: vi.fn(),
  update: vi.fn(),
  markAsProcessing: vi.fn(),
  markAsCompleted: vi.fn(),
  markAsFailedWithRetry: vi.fn(),
  cancel: vi.fn(),
  deleteOldCompleted: vi.fn(),
  getStats: vi.fn(),
} as unknown as AgentWakeupRequestsRepo;

const mockEmployeesRepo: EmployeesRepo = {
  getById: vi.fn(),
} as unknown as EmployeesRepo;

const mockEventBus: EventBus = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

describe('HeartbeatService', () => {
  let heartbeatService = createHeartbeatService({
    agentWakeupRequestsRepo: mockAgentWakeupRequestsRepo,
    employeesRepo: mockEmployeesRepo,
    bus: mockEventBus,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    heartbeatService = createHeartbeatService({
      agentWakeupRequestsRepo: mockAgentWakeupRequestsRepo,
      employeesRepo: mockEmployeesRepo,
      bus: mockEventBus,
    });
  });

  describe('scheduleWakeup', () => {
    it('should create a wakeup request for a valid agent', async () => {
      const mockAgent = {
        id: 'agent-123',
        companyId: 'company-456',
        name: 'Test Agent',
        roleId: 'ceo',
      };
      vi.mocked(mockEmployeesRepo.getById).mockReturnValue(mockAgent as any);

      const mockWakeupId = 'wakeup-789';
      vi.mocked(mockAgentWakeupRequestsRepo.create).mockReturnValue(mockWakeupId);

      const wakeupId = await heartbeatService.scheduleWakeup({
        agentId: 'agent-123',
        trigger: { type: 'routine', id: 'routine-abc' },
        scheduledFor: new Date(),
        context: {
          companyId: 'company-456',
          sourceKind: 'routine_execution',
        },
      });

      expect(wakeupId).toBe(mockWakeupId);
      expect(mockAgentWakeupRequestsRepo.create).toHaveBeenCalledWith({
        companyId: 'company-456',
        agentId: 'agent-123',
        triggerType: 'routine',
        triggerId: 'routine-abc',
        priority: 50,
        scheduledFor: expect.any(Number),
        context: {
          companyId: 'company-456',
          sourceKind: 'routine_execution',
        },
      });
      expect(mockEventBus.emit).toHaveBeenCalledWith({
        type: 'wakeup.scheduled',
        companyId: 'company-456',
        actorId: 'agent-123',
        actorKind: 'employee',
        payload: {
          wakeupId: mockWakeupId,
          agentId: 'agent-123',
          trigger: { type: 'routine', id: 'routine-abc' },
          context: {
            companyId: 'company-456',
            sourceKind: 'routine_execution',
          },
        },
      });
    });

    it('should throw error for non-existent agent', async () => {
      vi.mocked(mockEmployeesRepo.getById).mockReturnValue(null);

      await expect(
        heartbeatService.scheduleWakeup({
          agentId: 'non-existent',
          trigger: { type: 'manual' },
          scheduledFor: new Date(),
          context: {
            companyId: 'company-456',
            sourceKind: 'manual_assignment',
          },
        })
      ).rejects.toThrow('Agent not found: non-existent');
    });

    it('should throw error for agent from different company', async () => {
      const mockAgent = {
        id: 'agent-123',
        companyId: 'different-company',
        name: 'Test Agent',
        roleId: 'ceo',
      };
      vi.mocked(mockEmployeesRepo.getById).mockReturnValue(mockAgent as any);

      await expect(
        heartbeatService.scheduleWakeup({
          agentId: 'agent-123',
          trigger: { type: 'manual' },
          scheduledFor: new Date(),
          context: {
            companyId: 'company-456',
            sourceKind: 'manual_assignment',
          },
        })
      ).rejects.toThrow('does not belong to company');
    });
  });

  describe('processWakeupQueue', () => {
    it('should process pending wakeup requests', async () => {
      const mockPendingRequests = [
        {
          id: 'wakeup-1',
          companyId: 'company-456',
          agentId: 'agent-1',
          triggerType: 'routine',
          triggerId: 'routine-1',
          priority: 60,
          scheduledFor: Date.now() - 1000,
          status: 'pending',
          attemptCount: 0,
          maxAttempts: 4,
          contextJson: '{}',
          resultJson: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'wakeup-2',
          companyId: 'company-456',
          agentId: 'agent-2',
          triggerType: 'ticket_assigned',
          triggerId: 'ticket-1',
          priority: 70,
          scheduledFor: Date.now() - 500,
          status: 'pending',
          attemptCount: 0,
          maxAttempts: 4,
          contextJson: '{}',
          resultJson: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const mockAgents = {
        'agent-1': { id: 'agent-1', companyId: 'company-456', name: 'Agent 1', roleId: 'ceo' },
        'agent-2': { id: 'agent-2', companyId: 'company-456', name: 'Agent 2', roleId: 'dev' },
      };

      vi.mocked(mockAgentWakeupRequestsRepo.listPendingDue).mockReturnValue(mockPendingRequests as any);
      vi.mocked(mockAgentWakeupRequestsRepo.listFailedDueForRetry).mockReturnValue([]);
      vi.mocked(mockEmployeesRepo.getById).mockImplementation((id) => mockAgents[id as keyof typeof mockAgents] as any);

      await heartbeatService.processWakeupQueue('company-456');

      expect(mockAgentWakeupRequestsRepo.markAsProcessing).toHaveBeenCalledTimes(2);
      expect(mockEventBus.emit).toHaveBeenCalledWith({
        type: 'agent.wakeup',
        companyId: 'company-456',
        actorId: 'agent-1',
        actorKind: 'employee',
        payload: {
          wakeupRequestId: 'wakeup-1',
          agentId: 'agent-1',
          trigger: { type: 'routine', id: 'routine-1' },
          context: {},
        },
      });
      expect(mockEventBus.emit).toHaveBeenCalledWith({
        type: 'agent.wakeup',
        companyId: 'company-456',
        actorId: 'agent-2',
        actorKind: 'employee',
        payload: {
          wakeupRequestId: 'wakeup-2',
          agentId: 'agent-2',
          trigger: { type: 'ticket_assigned', id: 'ticket-1' },
          context: {},
        },
      });
    });

    it('should handle processing errors gracefully', async () => {
      const mockRequest = {
        id: 'wakeup-fail',
        companyId: 'company-456',
        agentId: 'agent-1',
        triggerType: 'routine',
        triggerId: 'routine-1',
        priority: 60,
        scheduledFor: Date.now() - 1000,
        status: 'pending',
        attemptCount: 0,
        maxAttempts: 4,
        contextJson: '{}',
        resultJson: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      vi.mocked(mockAgentWakeupRequestsRepo.listPendingDue).mockReturnValue([mockRequest] as any);
      vi.mocked(mockAgentWakeupRequestsRepo.listFailedDueForRetry).mockReturnValue([]);
      vi.mocked(mockEmployeesRepo.getById).mockImplementation(() => {
        throw new Error('Database connection failed');
      });
      vi.mocked(mockAgentWakeupRequestsRepo.markAsFailedWithRetry).mockReturnValue(120000); // 2 minutes

      await heartbeatService.processWakeupQueue('company-456');

      expect(mockAgentWakeupRequestsRepo.markAsFailedWithRetry).toHaveBeenCalledWith(
        'wakeup-fail',
        expect.any(String),
        4
      );
    });
  });

  describe('checkAgentLiveness', () => {
    it('should return liveness status for an active agent', async () => {
      const mockAgent = {
        id: 'agent-active',
        companyId: 'company-456',
        name: 'Active Agent',
        roleId: 'ceo',
      };

      const mockHistory = [
        {
          id: 'wakeup-1',
          companyId: 'company-456',
          agentId: 'agent-active',
          trigger: { type: 'routine', id: 'routine-1' },
          priority: 60,
          scheduledFor: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
          context: {
            companyId: 'company-456',
            sourceKind: 'routine_execution',
          },
        },
        {
          id: 'wakeup-2',
          companyId: 'company-456',
          agentId: 'agent-active',
          trigger: { type: 'manual', id: 'manual-1' },
          priority: 80,
          scheduledFor: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
          context: {
            companyId: 'company-456',
            sourceKind: 'manual_assignment',
          },
        },
      ];

      vi.mocked(mockEmployeesRepo.getById).mockReturnValue(mockAgent as any);
      vi.mocked(mockAgentWakeupRequestsRepo.listByAgent).mockReturnValue(mockHistory as any[]);

      const liveness = await heartbeatService.checkAgentLiveness('agent-active');

      expect(liveness).toEqual({
        agentId: 'agent-active',
        isAlive: true,
        lastActivityAt: expect.any(Number),
        pendingWakeups: 0,
        failedWakeups: 0,
      });
    });

    it('should return inactive status for agent with no recent activity', async () => {
      const mockAgent = {
        id: 'agent-inactive',
        companyId: 'company-456',
        name: 'Inactive Agent',
        roleId: 'dev',
      };

      vi.mocked(mockEmployeesRepo.getById).mockReturnValue(mockAgent as any);
      vi.mocked(mockAgentWakeupRequestsRepo.listByAgent).mockReturnValue([]);

      const liveness = await heartbeatService.checkAgentLiveness('agent-inactive');

      expect(liveness).toEqual({
        agentId: 'agent-inactive',
        isAlive: false,
        lastActivityAt: expect.any(Number),
        pendingWakeups: 0,
        failedWakeups: 0,
      });
    });
  });

  describe('getStats', () => {
    it('should return wakeup statistics', async () => {
      const mockRepoStats = {
        pending: 5,
        processing: 2,
        completed: 15,
        failed: 3,
      };

      vi.mocked(mockAgentWakeupRequestsRepo.getStats).mockReturnValue(mockRepoStats);

      const stats = await heartbeatService.getStats('company-456');

      expect(stats).toEqual({
        pending: 5,
        processing: 2,
        completed: 15,
        failed: 3,
        avgProcessingTimeMs: 0,
      });
    });
  });
});