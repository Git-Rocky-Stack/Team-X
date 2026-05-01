import type {
  ApprovalItem,
  ArtifactRecord,
  RoutineRun,
  RunCheckpoint,
  ThreadDigest,
} from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';


import { createContextAssemblerService } from './context-assembler-service.js';

describe('context assembler service', () => {
  it('assembles recent turns, operational blocks, and retrieval evidence for one thread', async () => {
    const digest: ThreadDigest = {
      id: 'digest-1',
      companyId: 'company-1',
      threadId: 'thread-1',
      summary: 'Condensed mission digest',
      pinnedFacts: [{ id: 'fact-1', fact: 'Iris owns executive approvals', sourceMessageId: null }],
      lastSummarizedMessageId: 'message-1',
      estimatedTokens: 120,
      freshness: 'fresh',
      createdAt: 10,
      updatedAt: 11,
    };
    const checkpoint: RunCheckpoint = {
      id: 'checkpoint-1',
      companyId: 'company-1',
      threadId: 'thread-1',
      runId: 'run-1',
      employeeId: 'employee-1',
      checkpointKind: 'approval-blocked',
      objective: 'Ship the launch plan',
      progressSummary: 'Draft is complete and waiting on approval.',
      blockers: [{ kind: 'approval', refId: 'approval-1', summary: 'Awaiting publish approval' }],
      nextAction: 'Resume once the approval clears.',
      activeArtifactRefs: ['artifact-1'],
      unresolvedApprovalRefs: ['approval-1'],
      resumeOrigin: null,
      createdAt: 12,
    };
    const approval: ApprovalItem = {
      id: 'approval-1',
      companyId: 'company-1',
      kind: 'budget_exception',
      summary: 'Needs extra spend to finish launch support',
      status: 'pending',
      subjectRefKind: 'ticket',
      subjectRefId: 'ticket-1',
      createdAt: 13,
      updatedAt: 13,
      latestDecision: null,
    };
    const routineRun: RoutineRun = {
      id: 'routine-run-1',
      companyId: 'company-1',
      routineId: 'routine-1',
      ticketId: 'ticket-1',
      status: 'completed',
      reason: 'scheduled',
      message: 'Launch review generated a status report.',
      errorMessage: null,
      runId: 'run-2',
      createdAt: 14,
      updatedAt: 15,
    };
    const artifact: ArtifactRecord = {
      id: 'artifact-1',
      companyId: 'company-1',
      title: 'Launch Report',
      kind: 'report',
      outcomeKind: 'deliverable',
      status: 'ready',
      summary: 'A concise report for the launch checkpoint.',
      uri: 'vault://artifact-1',
      threadId: 'thread-1',
      ticketId: 'ticket-1',
      approvalItemId: 'approval-1',
      createdAt: 16,
      updatedAt: 16,
    };
    const retrieveEvidence = vi.fn(async () => ({
      queries: ['launch plan'],
      entries: [
        {
          sourceType: 'ticket',
          sourceId: 'ticket-77',
          chunkIndex: 0,
          contentText: 'Ticket 77 captures the original launch plan milestones.',
          score: 0.91,
          reasons: ['vector:launch plan'],
        },
      ],
    }));

    const service = createContextAssemblerService({
      companiesRepo: {
        getById: vi.fn(() => ({
          id: 'company-1',
          name: 'Alpha',
          slug: 'alpha',
          settingsJson: JSON.stringify({
            mission: 'Launch Team-X cleanly.',
            hq: 'Remote',
          }),
          icon: null,
          theme: 'mission-red',
          status: 'running',
          createdAt: 1,
        })),
      },
      threadsRepo: {
        getById: vi.fn(() => ({
          id: 'thread-1',
          companyId: 'company-1',
          kind: 'ticket',
          subject: 'Launch thread',
          createdBy: 'rocky',
          createdAt: 2,
          lastMessageAt: 9,
          ticketId: 'ticket-1',
        })),
      },
      messagesRepo: {
        listByThread: vi.fn(() => [
          {
            id: 'message-1',
            threadId: 'thread-1',
            authorId: 'rocky',
            authorKind: 'user',
            content: 'Please finish the launch plan.',
            createdAt: 3,
          },
          {
            id: 'message-2',
            threadId: 'thread-1',
            authorId: 'employee-1',
            authorKind: 'employee',
            content: "I couldn't complete that reply. Provider returned no assistant text.",
            createdAt: 4,
          },
          {
            id: 'message-3',
            threadId: 'thread-1',
            authorId: 'employee-1',
            authorKind: 'employee',
            content: 'I drafted the launch plan and need approval.',
            createdAt: 5,
          },
        ]),
      },
      ticketsRepo: {
        getById: vi.fn(() => ({
          id: 'ticket-1',
          companyId: 'company-1',
          title: 'Launch Plan',
          description: 'Finalize the launch plan and publish it.',
          priority: 'high',
          status: 'in_progress',
          assigneeId: 'employee-1',
          createdBy: 'rocky',
          threadId: 'thread-1',
          labelsJson: JSON.stringify(['launch', 'marketing']),
          slaHours: null,
          dueAt: null,
          createdAt: 6,
          updatedAt: 6,
        })),
        getByThreadId: vi.fn(() => null),
      },
      projectsRepo: {
        listByCompany: vi.fn(() => [
          {
            id: 'project-1',
            companyId: 'company-1',
            goalId: 'goal-1',
            title: 'Launch Readiness',
            description: 'Everything required for the public launch.',
            status: 'in_progress',
            priority: 'high',
            leadId: 'employee-2',
            createdAt: 7,
            updatedAt: 7,
          },
        ]),
        listTickets: vi.fn(() => ['ticket-1']),
      },
      goalsRepo: {
        getById: vi.fn(() => ({
          id: 'goal-1',
          companyId: 'company-1',
          title: 'Ship the launch motion',
          description: 'Coordinate launch deliverables.',
          status: 'active',
          progressPct: 72,
          createdAt: 8,
          updatedAt: 8,
        })),
      },
      threadDigestService: {
        getLatest: vi.fn(() => digest),
      },
      runCheckpointService: {
        getLatest: vi.fn(() => checkpoint),
      },
      approvalInboxService: {
        listItems: vi.fn(() => [approval]),
      },
      routineService: {
        listRuns: vi.fn(() => [routineRun]),
      },
      artifactService: {
        list: vi.fn(() => [artifact]),
      },
      retrieveEvidence,
      getRetrievalConfig: () => ({
        topK: 4,
        threshold: 0.7,
        maxTokens: 400,
        maxQueries: 2,
        maxPerSourceType: 2,
      }),
      countTokens: (text) => Math.max(1, Math.ceil(text.length / 5)),
      now: () => 99,
    });

    const result = await service.assembleThreadContext({
      companyId: 'company-1',
      threadId: 'thread-1',
      recentTurnLimit: 5,
    });

    expect(result.generatedAt).toBe(99);
    expect(result.recentTurns.map((turn) => turn.messageId)).toEqual(['message-1', 'message-3']);
    expect(result.blocks.map((block) => block.kind)).toEqual(
      expect.arrayContaining([
        'ticket',
        'checkpoint',
        'digest',
        'project',
        'goal',
        'approval',
        'company',
        'routine',
        'artifact',
        'retrieval',
      ]),
    );
    expect(result.retrievalQueries).toEqual(['launch plan']);
    expect(retrieveEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        recentMessages: [
          {
            id: 'message-1',
            content: 'Please finish the launch plan.',
            sourceId: 'message-1',
          },
        ],
      }),
    );
  });

  it('includes assigned project and goal context for a direct employee chat', async () => {
    const service = createContextAssemblerService({
      companiesRepo: {
        getById: vi.fn(() => ({
          id: 'company-1',
          name: 'Alpha',
          slug: 'alpha',
          settingsJson: JSON.stringify({ mission: 'Reach durable revenue.' }),
          icon: null,
          theme: 'mission-red',
          status: 'running',
          createdAt: 1,
        })),
      },
      threadsRepo: {
        getById: vi.fn(() => ({
          id: 'thread-1',
          companyId: 'company-1',
          kind: 'dm',
          subject: null,
          createdBy: 'rocky',
          createdAt: 2,
          lastMessageAt: 9,
          ticketId: null,
        })),
      },
      messagesRepo: {
        listByThread: vi.fn(() => [
          {
            id: 'message-1',
            threadId: 'thread-1',
            authorId: 'rocky',
            authorKind: 'user',
            content: 'Review the projects area regarding MRR goals.',
            createdAt: 3,
          },
        ]),
      },
      employeesRepo: {
        getById: vi.fn((id: string) =>
          id === 'iris'
            ? {
                id: 'iris',
                companyId: 'company-1',
                rolePackId: 'strategia-official',
                roleId: 'role_ceo',
                roleMdSha: 'sha',
                level: 'officer',
                name: 'Iris Kovač',
                title: 'CEO',
                status: 'idle',
                modelPref: null,
                providerPref: null,
                toolsAllowedJson: '[]',
                toolsDeniedJson: '[]',
                avatar: null,
                isSystem: false,
                createdAt: 1,
              }
            : null,
        ),
        listVisibleByCompany: vi.fn(() => [
          {
            id: 'iris',
            companyId: 'company-1',
            rolePackId: 'strategia-official',
            roleId: 'role_ceo',
            roleMdSha: 'sha',
            level: 'officer',
            name: 'Iris Kovač',
            title: 'CEO',
            status: 'idle',
            modelPref: null,
            providerPref: null,
            toolsAllowedJson: '[]',
            toolsDeniedJson: '[]',
            avatar: null,
            isSystem: false,
            createdAt: 1,
          },
        ]),
      },
      ticketsRepo: {
        getById: vi.fn(() => null),
        getByThreadId: vi.fn(() => null),
      },
      projectsRepo: {
        listByCompany: vi.fn(() => [
          {
            id: 'project-mrr',
            companyId: 'company-1',
            goalId: 'goal-mrr',
            title: 'MRR Expansion Review',
            description:
              'Assess whether the monthly recurring revenue target is aggressive enough.',
            status: 'active',
            priority: 'high',
            leadId: 'iris',
            targetDate: Date.UTC(2026, 5, 30),
            createdAt: 7,
            updatedAt: 8,
          },
          {
            id: 'project-ops',
            companyId: 'company-1',
            goalId: null,
            title: 'Operations Cleanup',
            description: 'Reduce manual process drag.',
            status: 'planning',
            priority: 'medium',
            leadId: 'rySeyONsAP-ZRrwziHMfE',
            targetDate: null,
            createdAt: 6,
            updatedAt: 6,
          },
        ]),
        listTickets: vi.fn(() => []),
      },
      goalsRepo: {
        getById: vi.fn((id: string) =>
          id === 'goal-mrr'
            ? {
                id: 'goal-mrr',
                companyId: 'company-1',
                title: 'Raise MRR to $50K',
                description: 'North Star revenue target for the current growth push.',
                status: 'active',
                progressPct: 35,
                targetDate: Date.UTC(2026, 6, 31),
                createdAt: 4,
                updatedAt: 5,
              }
            : null,
        ),
        listByCompany: vi.fn(() => [
          {
            id: 'goal-mrr',
            companyId: 'company-1',
            title: 'Raise MRR to $50K',
            description: 'North Star revenue target for the current growth push.',
            status: 'active',
            progressPct: 35,
            targetDate: Date.UTC(2026, 6, 31),
            createdAt: 4,
            updatedAt: 5,
          },
        ]),
      },
      threadDigestService: {
        getLatest: vi.fn(() => null),
      },
      runCheckpointService: {
        getLatest: vi.fn(() => null),
      },
      countTokens: (text) => Math.max(1, Math.ceil(text.length / 5)),
      now: () => 99,
    });

    const result = await service.assembleThreadContext({
      companyId: 'company-1',
      threadId: 'thread-1',
      employeeId: 'iris',
    });

    const projectBlock = result.blocks.find((block) => block.id === 'project:project-mrr');
    const staleLeadProjectBlock = result.blocks.find((block) => block.id === 'project:project-ops');
    const goalBlock = result.blocks.find((block) => block.id === 'goal:goal-mrr');
    const rosterBlock = result.blocks.find((block) => block.id === 'roster:company-1');

    expect(projectBlock?.body).toContain('Relationship: assigned to current employee');
    expect(projectBlock?.body).toContain('MRR Expansion Review');
    expect(projectBlock?.body).toContain('Lead: Iris Kovač (CEO)');
    expect(projectBlock?.body).toContain('Target date: 2026-06-30');
    expect(staleLeadProjectBlock?.body).toContain(
      'Lead: unassigned (stored employee id is not in the active roster)',
    );
    expect(staleLeadProjectBlock?.body).not.toContain('rySeyONsAP-ZRrwziHMfE');
    expect(rosterBlock?.body).toContain('Iris Kovač (CEO, officer)');
    expect(rosterBlock?.body).toContain('id: iris');
    expect(goalBlock?.body).toContain('Raise MRR to $50K');
    expect(goalBlock?.body).toContain('Progress: 35%');
  });
});
