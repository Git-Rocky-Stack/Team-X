import type {
  AssembledThreadContext,
  PackedThreadContext,
  RunCheckpoint,
  ThreadDigest,
} from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';


import { type IpcHandlerDeps, createIpcHandlers } from './handlers.js';

function makeDeps(overrides: Partial<IpcHandlerDeps> = {}): IpcHandlerDeps {
  const noop = {} as never;
  return {
    companiesRepo: noop,
    employeesRepo: noop,
    threadsRepo: {
      getById: vi.fn((id: string) =>
        id === 'thread-1'
          ? {
              id: 'thread-1',
              companyId: 'company-1',
              kind: 'dm',
              subject: null,
              createdBy: 'rocky',
              createdAt: 1,
              lastMessageAt: 2,
              ticketId: null,
            }
          : null,
      ),
    } as unknown as IpcHandlerDeps['threadsRepo'],
    messagesRepo: noop,
    ticketsRepo: noop,
    ticketAttachmentsRepo: noop,
    goalsRepo: noop,
    projectsRepo: noop,
    meetingsRepo: noop,
    orgEdgesRepo: noop,
    runsRepo: noop,
    eventsRepo: noop,
    orchestrator: noop,
    meetingService: noop,
    roleLookup: noop,
    mcpHost: noop,
    mcpServersRepo: noop,
    providersService: noop,
    secretsStore: noop,
    settingsRepo: {
      get: vi.fn(),
      set: vi.fn(),
      getAgentic: vi.fn(),
      setAgentic: vi.fn(),
      getPlanner: vi.fn(),
      setPlanner: vi.fn(),
      getExtensions: vi.fn(() => ({ autonomyMode: 'balanced' })),
      setExtensions: vi.fn(),
      getCopilot: vi.fn(),
      setCopilot: vi.fn(),
      getCopilotWeights: vi.fn(),
      setCopilotWeights: vi.fn(),
    } as unknown as IpcHandlerDeps['settingsRepo'],
    vaultService: noop,
    backupService: noop,
    auditRepo: noop,
    updaterService: noop,
    getHardwareProfile: () => ({}) as never,
    ...overrides,
  } as unknown as IpcHandlerDeps;
}

describe('memory IPC handlers', () => {
  it('reads the latest thread digest through memory.getThreadDigest', async () => {
    const digest: ThreadDigest = {
      id: 'digest-1',
      companyId: 'company-1',
      threadId: 'thread-1',
      summary: 'Condensed digest',
      pinnedFacts: [],
      lastSummarizedMessageId: 'message-1',
      estimatedTokens: 180,
      freshness: 'fresh',
      createdAt: 1,
      updatedAt: 2,
    };
    const deps = makeDeps({
      threadDigestService: {
        getLatest: vi.fn(() => digest),
      },
    });
    const handlers = createIpcHandlers(deps);

    const result = await handlers.memoryGetThreadDigest({
      companyId: 'company-1',
      threadId: 'thread-1',
    });

    expect(deps.threadDigestService?.getLatest).toHaveBeenCalledWith({
      companyId: 'company-1',
      threadId: 'thread-1',
    });
    expect(result).toEqual(digest);
  });

  it('lists thread checkpoints through memory.listRunCheckpoints', async () => {
    const checkpoints: RunCheckpoint[] = [
      {
        id: 'checkpoint-1',
        companyId: 'company-1',
        threadId: 'thread-1',
        runId: 'run-1',
        employeeId: 'employee-1',
        checkpointKind: 'completion',
        objective: 'Ship it',
        progressSummary: 'Complete',
        blockers: [],
        nextAction: null,
        activeArtifactRefs: [],
        unresolvedApprovalRefs: [],
        resumeOrigin: null,
        createdAt: 4,
      },
    ];
    const deps = makeDeps({
      runCheckpointService: {
        listByThread: vi.fn(() => checkpoints),
      },
    });
    const handlers = createIpcHandlers(deps);

    const result = await handlers.memoryListRunCheckpoints({
      companyId: 'company-1',
      threadId: 'thread-1',
      limit: 5,
    });

    expect(deps.runCheckpointService?.listByThread).toHaveBeenCalledWith({
      companyId: 'company-1',
      threadId: 'thread-1',
      limit: 5,
    });
    expect(result).toEqual(checkpoints);
  });

  it('assembles and packs one thread context through memory.packThreadContext', async () => {
    const assembled: AssembledThreadContext = {
      companyId: 'company-1',
      threadId: 'thread-1',
      generatedAt: 10,
      retrievalQueries: ['launch plan'],
      recentTurns: [],
      blocks: [],
    };
    const packed: PackedThreadContext = {
      companyId: 'company-1',
      threadId: 'thread-1',
      generatedAt: 10,
      targetTokenBudget: 512,
      usedTokens: 0,
      recentTurnTokens: 0,
      blockTokens: 0,
      retrievalTokens: 0,
      packedTurns: [],
      systemAddendum: '',
      includedBlocks: [],
      droppedBlocks: [],
      retrievalQueries: ['launch plan'],
      resumeOrigin: null,
    };
    const deps = makeDeps({
      contextAssemblerService: {
        assembleThreadContext: vi.fn(async () => assembled),
      },
      contextPackerService: {
        packContext: vi.fn(() => packed),
      },
    });
    const handlers = createIpcHandlers(deps);

    const result = await handlers.memoryPackThreadContext({
      companyId: 'company-1',
      threadId: 'thread-1',
      targetTokenBudget: 512,
      recentTurnLimit: 8,
    });

    expect(deps.contextAssemblerService?.assembleThreadContext).toHaveBeenCalledWith({
      companyId: 'company-1',
      threadId: 'thread-1',
      recentTurnLimit: 8,
    });
    expect(deps.contextPackerService?.packContext).toHaveBeenCalledWith({
      context: assembled,
      targetTokenBudget: 512,
    });
    expect(result).toEqual(packed);
  });

  it('rejects cross-company thread access for memory reads', async () => {
    const handlers = createIpcHandlers(makeDeps());

    await expect(
      handlers.memoryGetThreadDigest({
        companyId: 'company-2',
        threadId: 'thread-1',
      }),
    ).rejects.toThrow(/thread does not belong to company/);
  });
});
