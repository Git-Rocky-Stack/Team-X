import type {
  IntentClassifier,
  IntentResult,
  LoopCompleteRequest,
  LoopProviderCompletion,
  NluContext,
  ResolvedEntity,
} from '@team-x/intelligence';
import { createSlotFiller } from '@team-x/intelligence';
import type { DashboardEvent, RoleSpec } from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';

import type { CommandHistoryRepo, CommandHistoryRow } from '../db/repos/command-history.js';

import { buildChatActionTools } from './chat-action-tools.js';
import {
  type CommandEntityResolver,
  type CommandEventBus,
  type CommandHandlers,
  type CommandService,
  createCommandService,
} from './command-service.js';
import {
  type GoalRetrievalRow,
  type ProjectRetrievalRow,
  type RetrievalConfig,
  type RetrievalOrchestratorDeps,
  type RetrievalRecentMessage,
  type TicketRetrievalRow,
  type VaultRetrievalRow,
  type VaultSearchHit,
  createRetrievalOrchestrator,
} from './retrieval-orchestrator.js';
import { composeSystemPromptWithRag } from './system-prompt.js';
import { createTestAgenticCompleteFn } from './test-agentic-provider.js';
import { createTestClassifier } from './test-classifier.js';

const COMPANY_ID = 'co-1';
const CONTEXT: NluContext = { companyId: COMPANY_ID };
const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  topK: 4,
  threshold: 0.3,
  maxTokens: 240,
  maxQueries: 3,
  maxPerSourceType: 2,
};

function countTokens(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function createSyntheticClock(startMs = 0) {
  let current = startMs;
  return {
    now(): number {
      return current;
    },
    tick(ms: number): number {
      current += ms;
      return current;
    },
  };
}

async function measureSynthetic<T>(
  clock: ReturnType<typeof createSyntheticClock>,
  fn: () => Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const startedAt = clock.now();
  const result = await fn();
  return {
    result,
    durationMs: clock.now() - startedAt,
  };
}

function makeRoleSpec(
  overrides: Partial<RoleSpec['frontmatter']> & { sourcePath?: string } = {},
): RoleSpec {
  const id = overrides.id ?? 'chief-marketing-officer';
  const name = overrides.name ?? 'Chief Marketing Officer';
  const level = overrides.level ?? 'officer';
  return {
    frontmatter: {
      id,
      name,
      level,
      reports_to: [],
      manages: [],
      preferred_model_tier: 'high',
      preferred_providers: [],
      fallback_providers: [],
      preferred_context_window: 200000,
      tools_allowed: [],
      tools_denied: [],
      decision_authority: 'final',
      escalates_to: [],
      kpis: [],
      cadences: [],
      output_format: 'exec_brief',
      capabilities: [],
      temperature: 0.4,
      license: 'MIT',
      author: 'Strategia-X',
      version: '1.0.0',
      ...overrides,
    },
    body: '# Role',
    sourcePath:
      overrides.sourcePath ?? 'C:/repo/role-packs/strategia-official/roles/officer/cmo.md',
    sha256: `sha-${id}`,
  };
}

function makeHistoryRepo(): CommandHistoryRepo {
  const rows: CommandHistoryRow[] = [];
  return {
    append(input) {
      rows.unshift({
        id: input.id,
        companyId: input.companyId,
        actorId: input.actorId,
        text: input.text,
        intent: input.intent,
        entitiesJson: input.entitiesJson,
        executedAt: input.executedAt,
        outcome: input.outcome,
        resultId: input.resultId ?? null,
      });
      return input.id;
    },
    recent(companyId, limit = 20) {
      return rows.filter((row) => row.companyId === companyId).slice(0, Math.max(1, limit));
    },
    trim(companyId, max) {
      const forCompany = rows.filter((row) => row.companyId === companyId);
      if (forCompany.length <= max) return 0;
      const evicted = forCompany.slice(max);
      for (const row of evicted) {
        const index = rows.indexOf(row);
        if (index >= 0) rows.splice(index, 1);
      }
      return evicted.length;
    },
    clearForCompany(companyId) {
      const count = rows.filter((row) => row.companyId === companyId).length;
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        if (rows[i]?.companyId === companyId) rows.splice(i, 1);
      }
      return count;
    },
  };
}

function makeBus(): CommandEventBus {
  return {
    emit: vi.fn(
      <T>(input: {
        type: 'command.executed';
        companyId: string;
        actorId: string;
        actorKind: 'user' | 'employee' | 'system';
        payload: T;
      }): DashboardEvent<T> => ({
        id: 'evt-1',
        type: input.type,
        companyId: input.companyId,
        actorId: input.actorId,
        actorKind: input.actorKind,
        payload: input.payload,
        createdAt: Date.now(),
      }),
    ),
  };
}

function makeHandlers(overrides: Partial<CommandHandlers> = {}): CommandHandlers {
  return {
    employeesList: vi.fn(async () => [
      { id: 'emp-ceo', name: 'Iris CEO', title: 'CEO', status: 'active' },
    ]),
    employeesCreate: vi.fn(async () => ({ employeeId: 'emp-new' })),
    agenticLoopStart: vi.fn(async () => ({ runId: 'run-1', threadId: 'thr-1' })),
    ticketsAssign: vi.fn(async () => undefined),
    ticketsCreate: vi.fn(async () => ({ ticketId: 'tkt-1' })),
    ticketsClose: vi.fn(async () => undefined),
    ticketsReopen: vi.fn(async () => undefined),
    projectsCreate: vi.fn(async () => ({ projectId: 'proj-1' })),
    goalsCreate: vi.fn(async () => ({ goalId: 'goal-1' })),
    meetingsCall: vi.fn(async () => ({ meetingId: 'mtg-1', threadId: 'thr-2' })),
    meetingsEnd: vi.fn(async () => undefined),
    vaultSearch: vi.fn(async () => []),
    ...overrides,
  };
}

function makeResolver(overrides: Partial<CommandEntityResolver> = {}): CommandEntityResolver {
  const notFound: ResolvedEntity<unknown> = { kind: 'not_found' };
  return {
    resolveEmployee: vi.fn(async () => notFound),
    resolveTicket: vi.fn(async () => notFound),
    resolveVaultFile: vi.fn(async () => notFound),
    resolveRole: vi.fn(async () => notFound),
    resolveMeeting: vi.fn(async () => notFound),
    resolveActiveMeeting: vi.fn(async () => notFound),
    ...overrides,
  };
}

function buildCommandService(
  options: {
    classifier?: IntentClassifier;
    resolver?: CommandEntityResolver;
    handlers?: CommandHandlers;
  } = {},
): CommandService {
  let nextId = 0;
  return createCommandService({
    classifier:
      options.classifier ??
      ({
        classify: async (text: string): Promise<IntentResult> => ({
          intent: 'complex_request',
          entities: {},
          confidence: 0,
          missingSlots: [],
          rawText: text,
        }),
      } satisfies IntentClassifier),
    resolver: options.resolver ?? makeResolver(),
    slotFiller: createSlotFiller(),
    handlers: options.handlers ?? makeHandlers(),
    historyRepo: makeHistoryRepo(),
    bus: makeBus(),
    defaultCompanyId: COMPANY_ID,
    now: () => new Date('2026-04-21T19:00:00.000Z'),
    newId: () => `cmd-${++nextId}`,
    logger: {
      error: vi.fn(),
      info: vi.fn(),
    },
  });
}

interface RetrievalEvalScenario {
  name: string;
  recentMessages: readonly RetrievalRecentMessage[];
  vectorHits?: Awaited<ReturnType<RetrievalOrchestratorDeps['vectorRetrieve']>>;
  tickets?: readonly TicketRetrievalRow[];
  goals?: readonly GoalRetrievalRow[];
  projects?: readonly ProjectRetrievalRow[];
  vaultHits?: readonly VaultSearchHit[];
  vaultFiles?: readonly VaultRetrievalRow[];
  expectedSourceKeys: readonly string[];
  expectedFragments: readonly string[];
  config?: Partial<RetrievalConfig>;
}

function makeRetrievalDeps(scenario: RetrievalEvalScenario): RetrievalOrchestratorDeps {
  const vaultFiles = new Map((scenario.vaultFiles ?? []).map((file) => [file.id, file]));
  return {
    vectorRetrieve: async () => scenario.vectorHits ?? [],
    listTickets: () => scenario.tickets ?? [],
    listGoals: () => scenario.goals ?? [],
    listProjects: () => scenario.projects ?? [],
    searchVault: () => scenario.vaultHits ?? [],
    getVaultFile: (id) => vaultFiles.get(id) ?? null,
    now: () => Date.UTC(2026, 3, 21, 12, 0, 0),
  };
}

const RETRIEVAL_EVAL_FIXTURES: readonly RetrievalEvalScenario[] = [
  {
    name: 'retrieves operational blockers from authoritative ticket and project memory',
    recentMessages: [
      {
        id: 'u1',
        sourceId: 'u1',
        content: 'Why is CMO onboarding stuck right now?',
      },
    ],
    vectorHits: [
      {
        sourceType: 'message',
        sourceId: 'msg-ops',
        chunkIndex: 0,
        contentText: 'Conversation noted that onboarding feels stuck and legal is late.',
        similarity: 0.94,
      },
    ],
    tickets: [
      {
        id: 'T-42',
        title: 'CMO onboarding blocked',
        description: 'Offer letter approval is missing, blocking onboarding.',
        status: 'blocked',
        priority: 'high',
        assigneeId: 'emp-coo',
        labelsJson: '["onboarding","cmo"]',
        dueAt: null,
        slaHours: 24,
        updatedAt: Date.UTC(2026, 3, 21, 10, 0, 0),
      },
    ],
    projects: [
      {
        id: 'P-7',
        title: 'Executive onboarding workstream',
        description: 'Coordinate CMO provisioning, legal, and finance approvals.',
        status: 'active',
        priority: 'high',
        goalId: 'G-3',
        leadId: 'emp-coo',
        updatedAt: Date.UTC(2026, 3, 21, 9, 0, 0),
      },
    ],
    expectedSourceKeys: ['ticket:T-42', 'project:P-7'],
    expectedFragments: ['Offer letter approval is missing', 'Executive onboarding workstream'],
  },
  {
    name: 'retrieves board-approved vault knowledge when the user asks for a document-backed answer',
    recentMessages: [
      {
        id: 'u1',
        sourceId: 'u1',
        content: 'Find the board-approved onboarding checklist for the CMO.',
      },
    ],
    vaultHits: [{ id: 'vf-1', rank: 0.98 }],
    vaultFiles: [
      {
        id: 'vf-1',
        originalName: 'board-onboarding-checklist.md',
        mimeType: 'text/markdown',
        sizeBytes: 2048,
        extractedText:
          'Board-approved onboarding checklist. Provision laptop, legal review, and finance sign-off before the start date.',
        tagsJson: '["board","onboarding","cmo"]',
        updatedAt: Date.UTC(2026, 3, 20, 16, 0, 0),
      },
    ],
    expectedSourceKeys: ['vault_file:vf-1'],
    expectedFragments: ['Board-approved onboarding checklist'],
  },
  {
    name: 'retrieves linked goal and project ownership context for launch recovery questions',
    recentMessages: [
      {
        id: 'u1',
        sourceId: 'u1',
        content: 'Who owns the Q3 launch recovery plan?',
      },
    ],
    goals: [
      {
        id: 'G-9',
        title: 'Recover Q3 launch confidence',
        description:
          'Align marketing, product, and support owners around the launch recovery plan.',
        status: 'active',
        targetDate: Date.UTC(2026, 6, 1, 0, 0, 0),
        updatedAt: Date.UTC(2026, 3, 20, 10, 0, 0),
      },
    ],
    projects: [
      {
        id: 'P-9',
        title: 'Q3 launch recovery plan',
        description:
          'Program led by the Chief Operating Officer with marketing and support dependencies.',
        status: 'active',
        priority: 'high',
        goalId: 'G-9',
        leadId: 'emp-coo',
        updatedAt: Date.UTC(2026, 3, 21, 7, 30, 0),
      },
    ],
    expectedSourceKeys: ['goal:G-9', 'project:P-9'],
    expectedFragments: ['Recover Q3 launch confidence', 'Chief Operating Officer'],
  },
];

describe('intelligence eval harness - retrieval fixtures', () => {
  for (const scenario of RETRIEVAL_EVAL_FIXTURES) {
    it(scenario.name, async () => {
      const orchestrator = createRetrievalOrchestrator(makeRetrievalDeps(scenario));
      const result = await orchestrator.retrieveEvidence({
        companyId: COMPANY_ID,
        recentMessages: scenario.recentMessages,
        excludeSourceIds: scenario.recentMessages.map((message) => message.sourceId),
        config: {
          ...DEFAULT_RETRIEVAL_CONFIG,
          ...(scenario.config ?? {}),
        },
        countTokens,
      });

      const actualSourceKeys = result.entries.map(
        (entry) => `${entry.sourceType}:${entry.sourceId}`,
      );
      expect(actualSourceKeys).toEqual(expect.arrayContaining([...scenario.expectedSourceKeys]));
      for (const fragment of scenario.expectedFragments) {
        expect(result.entries.some((entry) => entry.contentText.includes(fragment))).toBe(true);
      }
    });
  }
});

describe('intelligence eval harness - NLU fixtures', () => {
  it('routes a canned structured hire request through the structured path', async () => {
    const svc = buildCommandService({
      classifier: createTestClassifier(),
      resolver: makeResolver({
        resolveRole: vi.fn(async () => ({
          kind: 'unique',
          value: makeRoleSpec({ id: 'growth-marketer', name: 'Growth Marketer', level: 'manager' }),
        })),
      }),
    });

    const result = await svc.parse('hire a growth marketer', CONTEXT);
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.intent).toBe('hire_employee');
      expect(result.entities.roleId).toBe('growth-marketer');
    }
  });

  it('routes fire-prefix input to a destructive structured intent with confirmation', async () => {
    const svc = buildCommandService({
      classifier: createTestClassifier(),
      resolver: makeResolver({
        resolveEmployee: vi.fn(async (query: string) => {
          if (query !== 'Jordan Vale') return { kind: 'not_found' };
          return {
            kind: 'unique',
            value: { id: 'emp-jordan', name: 'Jordan Vale' },
          };
        }),
      }),
    });

    const result = await svc.parse('fire Jordan Vale', CONTEXT);
    expect(result.kind).toBe('needs_confirmation');
    if (result.kind === 'needs_confirmation') {
      expect(result.intent).toBe('fire_employee');
      expect(result.entities.employeeId).toBe('emp-jordan');
    }
  });

  it('keeps open-ended requests on the freeform agentic path', async () => {
    const svc = buildCommandService({
      classifier: createTestClassifier(),
    });

    const result = await svc.parse('Explain why onboarding is stuck.', CONTEXT);
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.intent).toBe('complex_request');
      expect(result.summary).toBe('Delegate to the Copilot Agent');
    }
  });
});

describe('intelligence eval harness - execution fixtures', () => {
  it('only claims a hire completed after the new employee is visible in roster state', async () => {
    const employees: Array<{
      id: string;
      companyId: string;
      rolePackId: string;
      roleId: string;
      roleMdSha: string;
      level: string;
      name: string;
      title: string;
      status: string;
      modelPref: null;
      providerPref: null;
      toolsAllowedJson: string;
      toolsDeniedJson: string;
      avatar: null;
      isSystem: boolean;
      createdAt: number;
    }> = [];
    const hireTool = buildChatActionTools({
      companyId: COMPANY_ID,
      actorId: 'emp-ceo',
      actorLevel: 'officer',
      employeesRepo: {
        create: vi.fn((input) => {
          employees.push({
            id: 'emp-cmo',
            companyId: input.companyId,
            rolePackId: input.rolePackId,
            roleId: input.roleId,
            roleMdSha: input.roleMdSha,
            level: input.level,
            name: input.name,
            title: input.title,
            status: 'idle',
            modelPref: null,
            providerPref: null,
            toolsAllowedJson: '[]',
            toolsDeniedJson: '[]',
            avatar: null,
            isSystem: false,
            createdAt: 123,
          });
          return 'emp-cmo';
        }),
        listVisibleByCompany: () => employees,
      },
      roleLookup: {
        listRoles: () => [makeRoleSpec()],
      },
      bus: { emit: vi.fn() },
      now: () => 123,
    }).find((tool) => tool.name === 'hire_employee');

    const result = await hireTool?.execute?.({ roleQuery: 'CMO' });
    expect(result).toMatchObject({
      success: true,
      state: 'completed',
      employeeId: 'emp-cmo',
      roleId: 'chief-marketing-officer',
    });
    expect(result).toHaveProperty(
      'message',
      'Chief Marketing Officer hired and verified in the company roster. Onboard them against the active ticket or project now; do not defer to a future report unless the user supplied that deadline.',
    );
    expect(result).toHaveProperty(
      'nextAction',
      'Onboard this hire against the active ticket or project now, then start the first concrete work item in this thread.',
    );
  });

  it('hard-fails unverified action claims when roster verification does not confirm the mutation', async () => {
    const hireTool = buildChatActionTools({
      companyId: COMPANY_ID,
      actorId: 'emp-ceo',
      actorLevel: 'officer',
      employeesRepo: {
        create: vi.fn(() => 'emp-missing'),
        listVisibleByCompany: () => [],
      },
      roleLookup: {
        listRoles: () => [makeRoleSpec()],
      },
      bus: { emit: vi.fn() },
    }).find((tool) => tool.name === 'hire_employee');

    const result = await hireTool?.execute?.({ roleQuery: 'CMO' });
    expect(result).toEqual({
      success: false,
      state: 'blocked',
      error: 'Chief Marketing Officer could not be verified after creation.',
      employeeId: 'emp-missing',
    });
  });

  it('marks freeform execution as delegated rather than completed when only a background run is started', async () => {
    const svc = buildCommandService({
      handlers: makeHandlers({
        agenticLoopStart: vi.fn(async () => ({ runId: 'run-eval', threadId: 'thr-eval' })),
      }),
    });

    const result = await svc.execute({
      intent: 'complex_request',
      entities: {},
      companyId: COMPANY_ID,
      confirmed: true,
      rawText: 'Review the onboarding plan and tell me what to do next.',
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.summary).toMatch(/^Delegated:/);
      expect(result.runId).toBe('run-eval');
      expect(result.threadId).toBe('thr-eval');
    }
  });

  it('keeps write-side complex requests pending until the user confirms them', async () => {
    const handlers = makeHandlers();
    const svc = buildCommandService({ handlers });

    const result = await svc.execute({
      intent: 'complex_request',
      entities: {},
      companyId: COMPANY_ID,
      rawText: 'Decompose the frontend redesign into tickets.',
    });
    expect(result).toEqual({
      kind: 'needs_confirmation',
      gateKind: 'write-side',
      summary:
        'This request may create tickets, delegate tasks, or modify project state. The agentic loop will run write-side tools to fulfill: "Decompose the frontend redesign into tickets."',
    });
    expect(handlers.agenticLoopStart).not.toHaveBeenCalled();
  });
});

describe('intelligence eval harness - latency gates', () => {
  it('keeps classifier latency inside the deterministic budget', async () => {
    const clock = createSyntheticClock();
    const baseClassifier = createTestClassifier();
    const classifier: IntentClassifier = {
      classify: async (text, context) => {
        clock.tick(4);
        return baseClassifier.classify(text, context);
      },
    };

    const measured = await measureSynthetic(clock, () =>
      classifier.classify('hire a growth marketer', CONTEXT),
    );

    expect(measured.result.intent).toBe('hire_employee');
    expect(measured.durationMs).toBeLessThanOrEqual(4);
  });

  it('keeps retrieval latency inside the deterministic budget', async () => {
    const clock = createSyntheticClock();
    const scenario = RETRIEVAL_EVAL_FIXTURES[0];
    if (!scenario) throw new Error('missing retrieval eval fixture');
    const vaultFiles = new Map((scenario.vaultFiles ?? []).map((file) => [file.id, file]));
    const orchestrator = createRetrievalOrchestrator({
      vectorRetrieve: async () => {
        clock.tick(8);
        return scenario.vectorHits ?? [];
      },
      listTickets: () => scenario.tickets ?? [],
      listGoals: () => scenario.goals ?? [],
      listProjects: () => scenario.projects ?? [],
      searchVault: () => {
        clock.tick(2);
        return scenario.vaultHits ?? [];
      },
      getVaultFile: (id) => vaultFiles.get(id) ?? null,
      now: () => Date.UTC(2026, 3, 21, 12, 0, 0),
    });

    const measured = await measureSynthetic(clock, () =>
      orchestrator.retrieveEvidence({
        companyId: COMPANY_ID,
        recentMessages: scenario.recentMessages,
        excludeSourceIds: scenario.recentMessages.map((message) => message.sourceId),
        config: {
          ...DEFAULT_RETRIEVAL_CONFIG,
          maxQueries: 1,
        },
        countTokens,
      }),
    );

    expect(
      measured.result.entries.some(
        (entry) => entry.sourceType === 'ticket' && entry.sourceId === 'T-42',
      ),
    ).toBe(true);
    expect(measured.durationMs).toBeLessThanOrEqual(10);
  });

  it('keeps prompt-build latency inside the deterministic budget', async () => {
    const clock = createSyntheticClock();
    const measured = await measureSynthetic(clock, () =>
      composeSystemPromptWithRag(
        {
          renderRoleSystemPrompt: async () => {
            clock.tick(3);
            return 'You are Iris.';
          },
          isRagEnabled: () => true,
          getRecentUserMessages: () => [
            { id: 'u1', sourceId: 'u1', content: 'What is blocking onboarding?' },
          ],
          retrieveEvidence: async () => {
            clock.tick(7);
            return {
              queries: ['What is blocking onboarding?'],
              entries: [
                {
                  sourceType: 'ticket',
                  sourceId: 'T-42',
                  chunkIndex: 0,
                  contentText: 'Ticket ID: T-42\nDescription:\nOffer letter approval is missing.',
                  score: 0.99,
                  reasons: ['exact-match'],
                },
              ],
            };
          },
        },
        {
          employeeId: 'emp-ceo',
          companyId: COMPANY_ID,
          threadId: 'thr-1',
        },
      ),
    );

    expect(measured.result).toContain('## Retrieved Evidence');
    expect(measured.durationMs).toBeLessThanOrEqual(10);
  });

  it('keeps non-streaming completion latency inside the deterministic budget', async () => {
    const clock = createSyntheticClock();
    const baseComplete = createTestAgenticCompleteFn();
    const complete = async (req: LoopCompleteRequest): Promise<LoopProviderCompletion> => {
      clock.tick(14);
      return baseComplete(req);
    };

    const measured = await measureSynthetic(clock, () =>
      complete({
        system: 'You are the system agent.',
        messages: [{ role: 'user', content: 'what is my team doing right now' }],
        tools: [],
        signal: new AbortController().signal,
      }),
    );

    const firstTokenMs = measured.durationMs;
    // Native tool-use surfaces the tool invocation as a structured
    // toolCalls entry rather than embedded JSON in `text`.
    expect(measured.result.toolCalls.map((t) => t.toolName)).toContain('query_employees');
    expect(firstTokenMs).toBeLessThanOrEqual(14);
    expect(measured.durationMs).toBeLessThanOrEqual(14);
  });

  it('keeps tool round-trip latency inside the deterministic budget', async () => {
    const clock = createSyntheticClock();
    const employees: Array<{
      id: string;
      companyId: string;
      rolePackId: string;
      roleId: string;
      roleMdSha: string;
      level: string;
      name: string;
      title: string;
      status: string;
      modelPref: null;
      providerPref: null;
      toolsAllowedJson: string;
      toolsDeniedJson: string;
      avatar: null;
      isSystem: boolean;
      createdAt: number;
    }> = [];
    const hireTool = buildChatActionTools({
      companyId: COMPANY_ID,
      actorId: 'emp-ceo',
      actorLevel: 'officer',
      employeesRepo: {
        create: vi.fn((input) => {
          clock.tick(4);
          employees.push({
            id: 'emp-cmo',
            companyId: input.companyId,
            rolePackId: input.rolePackId,
            roleId: input.roleId,
            roleMdSha: input.roleMdSha,
            level: input.level,
            name: input.name,
            title: input.title,
            status: 'idle',
            modelPref: null,
            providerPref: null,
            toolsAllowedJson: '[]',
            toolsDeniedJson: '[]',
            avatar: null,
            isSystem: false,
            createdAt: 123,
          });
          return 'emp-cmo';
        }),
        listVisibleByCompany: () => {
          clock.tick(2);
          return employees;
        },
      },
      roleLookup: {
        listRoles: () => [makeRoleSpec()],
      },
      bus: { emit: vi.fn() },
      now: () => 123,
    }).find((tool) => tool.name === 'hire_employee');

    const measured = await measureSynthetic(clock, () => hireTool?.execute?.({ roleQuery: 'CMO' }));

    expect(measured.result).toMatchObject({
      success: true,
      state: 'completed',
      employeeId: 'emp-cmo',
    });
    expect(measured.durationMs).toBeLessThanOrEqual(8);
  });
});
