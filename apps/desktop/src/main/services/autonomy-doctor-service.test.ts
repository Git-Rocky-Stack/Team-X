import { describe, expect, it, vi } from 'vitest';

import type {
  BudgetOverview,
  ProviderConfig,
  RuntimeOperationsSnapshot,
  RuntimeProfileSummary,
} from '@team-x/shared-types';

import { createAutonomyDoctorService } from './autonomy-doctor-service.js';

const NOW = 1_900_000_000_000;

function makeProfile(overrides: Partial<RuntimeProfileSummary> = {}): RuntimeProfileSummary {
  return {
    id: 'runtime-1',
    companyId: 'company-1',
    name: 'Codex Local',
    slug: 'codex-local',
    kind: 'codex',
    enabled: true,
    config: {},
    lastHealthStatus: 'healthy',
    lastHealthMessage: null,
    lastValidatedAt: NOW - 1_000,
    createdAt: NOW - 2_000,
    updatedAt: NOW - 1_000,
    executionMode: 'native',
    boundEmployeeIds: ['employee-1'],
    boundEmployeeCount: 1,
    ...overrides,
  };
}

function makeSnapshot(
  overrides: Partial<RuntimeOperationsSnapshot> = {},
): RuntimeOperationsSnapshot {
  return {
    companyId: 'company-1',
    generatedAt: NOW,
    sessions: [],
    activeCheckouts: [],
    ...overrides,
  };
}

function makeBudgetOverview(overrides: Partial<BudgetOverview> = {}): BudgetOverview {
  return {
    companyId: 'company-1',
    period: 'monthly',
    periodStartAt: NOW - 100_000,
    periodEndAt: NOW + 100_000,
    companySpendUsd: '0.000000',
    activePolicyCount: 1,
    warningCount: 0,
    exceededCount: 0,
    pendingApprovalCount: 0,
    providerMix: [],
    policySummaries: [],
    ...overrides,
  };
}

function makeProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'ollama-local',
    name: 'Ollama',
    kind: 'ollama',
    privacyTier: 'local',
    baseUrl: 'http://localhost:11434/api',
    defaultModel: 'llama3',
    enabled: true,
    ...overrides,
  };
}

describe('autonomy doctor service', () => {
  it('returns an ok report when control-plane checks are healthy', async () => {
    const service = createAutonomyDoctorService({
      now: () => NOW,
      dbDiagnostics: {
        quickCheck: () => 'ok',
        hasTable: () => true,
      },
      backupService: {
        list: async () => [
          {
            filename: 'backup-current',
            path: 'C:\\Team-X\\backups\\backup-current',
            createdAt: new Date(NOW - 1_000).toISOString(),
            sizeBytes: 100,
            manifest: {
              version: '1',
              createdAt: new Date(NOW - 1_000).toISOString(),
              appVersion: '1.2.2',
              companyCount: 1,
              fileCount: 0,
              totalSizeBytes: 100,
              dbSizeBytes: 100,
            },
          },
        ],
      },
      runtimeProfilesService: { list: () => [makeProfile()] },
      runtimeOperationsService: { snapshot: () => makeSnapshot() },
      mcpServersRepo: { listByCompany: () => [] },
      providersService: {
        list: () => [makeProvider()],
        isConfigured: vi.fn(async () => true),
      },
      budgetGovernanceService: { getOverview: () => makeBudgetOverview() },
      secretsStore: { getApiKey: vi.fn(async () => 'secret') },
      pathExists: () => true,
    });

    const report = await service.run({ companyId: 'company-1' });

    expect(report.status).toBe('ok');
    expect(report.totals).toMatchObject({ blocked: 0, warning: 0 });
    expect(report.checks).toHaveLength(11);
  });

  it('blocks when runtime secrets, providers, budgets, and leases need operator action', async () => {
    const service = createAutonomyDoctorService({
      now: () => NOW,
      dbDiagnostics: {
        quickCheck: () => 'ok',
        hasTable: (table) => table !== 'ticket_checkouts',
      },
      backupService: { list: async () => [] },
      runtimeProfilesService: {
        list: () => [
          makeProfile({
            config: {
              env: {
                OPENAI_API_KEY: 'literal-key',
                ANTHROPIC_API_KEY: {
                  type: 'secret_ref',
                  providerId: 'anthropic',
                  key: 'apiKey',
                  version: 'v1',
                },
              },
            },
            lastHealthStatus: 'error',
            lastHealthMessage: 'Codex binary not found.',
          }),
        ],
      },
      runtimeOperationsService: {
        snapshot: () =>
          makeSnapshot({
            sessions: [
              {
                id: 'session-1',
                companyId: 'company-1',
                employeeId: 'employee-1',
                runtimeProfileId: 'runtime-1',
                adapterKind: 'codex',
                status: 'failed',
                currentRunId: 'run-1',
                currentTicketId: 'ticket-1',
                pid: null,
                endpointUrl: null,
                workspacePath: 'C:\\missing\\workspace',
                capabilities: {},
                lastHeartbeatAt: NOW - 60_000,
                leaseExpiresAt: NOW - 1,
                failureReason: 'process exited',
                startedAt: NOW - 120_000,
                endedAt: null,
                createdAt: NOW - 120_000,
                updatedAt: NOW - 60_000,
              },
            ],
            activeCheckouts: [
              {
                id: 'checkout-1',
                companyId: 'company-1',
                ticketId: 'ticket-1',
                employeeId: 'employee-1',
                runtimeSessionId: 'session-1',
                runId: 'run-1',
                status: 'active',
                claimedAt: NOW - 120_000,
                lastHeartbeatAt: NOW - 60_000,
                expiresAt: NOW - 1,
                releasedAt: null,
                releaseReason: null,
                createdAt: NOW - 120_000,
                updatedAt: NOW - 60_000,
              },
            ],
          }),
      },
      mcpServersRepo: {
        listByCompany: () => [
          {
            id: 'mcp-1',
            name: 'Context7',
            enabled: true,
            lastHealth: 'error: command not found',
          },
        ],
      },
      providersService: {
        list: () => [
          makeProvider({
            id: 'anthropic',
            name: 'Anthropic',
            kind: 'anthropic',
            privacyTier: 'proprietary-cloud',
            defaultModel: undefined,
          }),
        ],
        isConfigured: vi.fn(async () => false),
      },
      budgetGovernanceService: {
        getOverview: () =>
          makeBudgetOverview({
            warningCount: 1,
            exceededCount: 1,
            pendingApprovalCount: 1,
          }),
      },
      secretsStore: { getApiKey: vi.fn(async () => null) },
      pathExists: () => false,
    });

    const report = await service.run({ companyId: 'company-1' });
    const findings = report.checks.flatMap((check) => check.findings);

    expect(report.status).toBe('blocked');
    expect(report.totals.blocked).toBeGreaterThan(0);
    expect(findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining([
        'migrations.ticket_checkouts',
        'runtime-secrets.runtime-1.inline.OPENAI_API_KEY',
        'runtime-secrets.runtime-1.missing.anthropic.apiKey',
        'ticket-checkouts.checkout-1.expired',
        'budget-blockers.exceeded',
      ]),
    );
  });
});
