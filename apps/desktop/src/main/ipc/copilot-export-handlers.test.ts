import { existsSync, readFileSync, rmSync } from 'node:fs';
import { basename } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CopilotExportRequest, CopilotExportResponse } from '@team-x/shared-types';

import { type IpcHandlerDeps, createIpcHandlers } from './handlers.js';

type CopilotExportHandlers = ReturnType<typeof createIpcHandlers> & {
  copilotExport(req: CopilotExportRequest): Promise<CopilotExportResponse>;
};

type CopilotExportRepoHarness = {
  listActiveForExport: ReturnType<typeof vi.fn>;
};

const writtenPaths: string[] = [];

function asCopilotExportHandlers(handlers: ReturnType<typeof createIpcHandlers>) {
  return handlers as CopilotExportHandlers;
}

function getCopilotExportRepo(deps: IpcHandlerDeps): CopilotExportRepoHarness {
  return (deps as unknown as { copilotInsightsRepo: CopilotExportRepoHarness }).copilotInsightsRepo;
}

function makeInsightRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'insight-1',
    companyId: 'company-1',
    category: 'cost',
    severity: 'warning',
    title: 'Budget spike',
    detail: 'Claude spend rose 18% this week.',
    actionSuggestion: 'Review provider routing.',
    actionIntent: 'open_provider_settings',
    actionEntitiesJson: '{"providerId":"anthropic"}',
    dismissedAt: null,
    createdAt: 1_700_000_000_000,
    expiresAt: 1_700_086_400_000,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<IpcHandlerDeps> = {}): IpcHandlerDeps {
  const noop = {} as never;
  const copilotInsightsRepo = {
    listActiveForExport: vi.fn(() => ({
      rows: [makeInsightRow()],
      truncated: false,
    })),
  };
  const bus = { emit: vi.fn() };

  return {
    companiesRepo: noop,
    employeesRepo: noop,
    threadsRepo: noop,
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
    settingsRepo: noop,
    vaultService: noop,
    backupService: noop,
    auditRepo: noop,
    updaterService: noop,
    copilotInsightsRepo,
    bus,
    getHardwareProfile: () => ({}) as never,
    ...overrides,
  } as unknown as IpcHandlerDeps;
}

afterEach(() => {
  for (const filePath of writtenPaths.splice(0)) {
    rmSync(filePath, { force: true });
  }
});

describe('copilot.export IPC handler', () => {
  it('rejects invalid format before repo access', async () => {
    const deps = makeDeps();
    const handlers = asCopilotExportHandlers(createIpcHandlers(deps));
    const repo = getCopilotExportRepo(deps);

    await expect(
      handlers.copilotExport({
        format: 'pdf',
        scope: 'company',
        companyId: 'company-1',
      } as never),
    ).rejects.toThrow(/copilot\.export: format must be "csv" or "json"/);

    expect(repo.listActiveForExport).not.toHaveBeenCalled();
  });

  it('rejects invalid scope before repo access', async () => {
    const deps = makeDeps();
    const handlers = asCopilotExportHandlers(createIpcHandlers(deps));
    const repo = getCopilotExportRepo(deps);

    await expect(
      handlers.copilotExport({
        format: 'json',
        scope: 'team',
      } as never),
    ).rejects.toThrow(/copilot\.export: scope must be "company" or "all"/);

    expect(repo.listActiveForExport).not.toHaveBeenCalled();
  });

  it('rejects company scope without companyId before repo access', async () => {
    const deps = makeDeps();
    const handlers = asCopilotExportHandlers(createIpcHandlers(deps));
    const repo = getCopilotExportRepo(deps);

    await expect(
      handlers.copilotExport({
        format: 'json',
        scope: 'company',
      } as never),
    ).rejects.toThrow(/copilot\.export: companyId is required for company scope/);

    expect(repo.listActiveForExport).not.toHaveBeenCalled();
  });

  it('rejects invalid category and severity before repo access', async () => {
    const deps = makeDeps();
    const handlers = asCopilotExportHandlers(createIpcHandlers(deps));
    const repo = getCopilotExportRepo(deps);

    await expect(
      handlers.copilotExport({
        format: 'json',
        scope: 'all',
        category: 'finance',
      } as never),
    ).rejects.toThrow(/copilot\.export: category must be one of/);

    await expect(
      handlers.copilotExport({
        format: 'json',
        scope: 'all',
        severity: 'urgent',
      } as never),
    ).rejects.toThrow(/copilot\.export: severity must be one of/);

    expect(repo.listActiveForExport).not.toHaveBeenCalled();
  });

  it('writes filtered JSON export under the Team-X temp export directory', async () => {
    const deps = makeDeps();
    const handlers = asCopilotExportHandlers(createIpcHandlers(deps));
    const repo = getCopilotExportRepo(deps);

    const result = await handlers.copilotExport({
      format: 'json',
      scope: 'company',
      companyId: 'company-1',
      category: 'cost',
      severity: 'warning',
    });
    writtenPaths.push(result.filePath);

    expect(result).toMatchObject({
      rowCount: 1,
      truncated: false,
      format: 'json',
      scope: 'company',
    });
    expect(basename(result.filePath)).toMatch(/^copilot-insights-export-.+\.json$/);
    expect(result.filePath).toContain('team-x-exports');
    expect(existsSync(result.filePath)).toBe(true);
    expect(repo.listActiveForExport).toHaveBeenCalledWith({
      scope: 'company',
      companyId: 'company-1',
      category: 'cost',
      severity: 'warning',
    });

    const parsed = JSON.parse(readFileSync(result.filePath, 'utf-8')) as {
      scope: string;
      companyId: string;
      filters: { category: string; severity: string };
      rowCount: number;
      insights: Array<{ id: string; title: string }>;
    };
    expect(parsed.scope).toBe('company');
    expect(parsed.companyId).toBe('company-1');
    expect(parsed.filters).toEqual({ category: 'cost', severity: 'warning' });
    expect(parsed.rowCount).toBe(1);
    expect(parsed.insights[0]).toMatchObject({ id: 'insight-1', title: 'Budget spike' });
  });

  it('writes CSV export and does not emit a bus event', async () => {
    const bus = { emit: vi.fn() };
    const deps = makeDeps({ bus: bus as never });
    const handlers = asCopilotExportHandlers(createIpcHandlers(deps));

    const result = await handlers.copilotExport({
      format: 'csv',
      scope: 'all',
    });
    writtenPaths.push(result.filePath);

    expect(result).toMatchObject({
      rowCount: 1,
      truncated: false,
      format: 'csv',
      scope: 'all',
    });
    expect(basename(result.filePath)).toMatch(/^copilot-insights-export-.+\.csv$/);

    const content = readFileSync(result.filePath, 'utf-8');
    expect(content).toContain(
      'id,companyId,category,severity,title,detail,actionSuggestion,actionIntent,actionEntitiesJson,createdAt,expiresAt',
    );
    expect(content).toContain('insight-1,company-1,cost,warning,Budget spike');
    expect(bus.emit).not.toHaveBeenCalled();
  });
});
