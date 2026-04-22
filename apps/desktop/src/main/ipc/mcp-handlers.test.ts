import { describe, expect, it, vi } from 'vitest';

import { type IpcHandlerDeps, createIpcHandlers } from './handlers.js';

function makeDeps(overrides: Partial<IpcHandlerDeps> = {}): IpcHandlerDeps {
  const noop = {} as never;
  const mcpServersRepo = {
    listByCompany: vi.fn(() => [
      {
        id: 'server-1',
        companyId: 'company-1',
        name: 'Filesystem MCP',
        transport: 'stdio',
        configJson: JSON.stringify({ command: 'npx', args: ['filesystem-mcp'] }),
        enabled: false,
        lastHealth: null,
        installedAt: 1,
      },
    ]),
    getById: vi.fn(() => ({
      id: 'server-1',
      companyId: 'company-1',
      name: 'Filesystem MCP',
      transport: 'stdio',
      configJson: JSON.stringify({ command: 'npx', args: ['filesystem-mcp'] }),
      enabled: false,
      lastHealth: null,
      installedAt: 1,
    })),
    create: vi.fn(() => 'server-2'),
    updateEnabled: vi.fn(),
    delete: vi.fn(),
  } as unknown as IpcHandlerDeps['mcpServersRepo'];

  const mcpHost = {
    listServers: vi.fn(() => []),
    getServer: vi.fn(() => undefined),
    connectToServer: vi.fn(() => Promise.resolve()),
    disconnectServer: vi.fn(() => Promise.resolve()),
  } as unknown as IpcHandlerDeps['mcpHost'];

  const extensionsRegistry = {
    syncMcpServer: vi.fn(),
    removeMcpServer: vi.fn(),
    listByCompany: vi.fn(() => []),
  } as unknown as IpcHandlerDeps['extensionsRegistry'];

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
    mcpHost,
    mcpServersRepo,
    extensionsRegistry,
    authorityRepo: noop,
    authorityResolver: noop,
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

describe('MCP IPC handlers', () => {
  it('lists company servers from the repo even when they are disconnected', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    const result = await handlers.mcpList({ companyId: 'company-1' });

    expect(deps.mcpServersRepo.listByCompany).toHaveBeenCalledWith('company-1');
    expect(result).toEqual([
      {
        id: 'server-1',
        companyId: 'company-1',
        name: 'Filesystem MCP',
        transport: 'stdio',
        enabled: false,
        lastHealth: null,
        toolCount: 0,
      },
    ]);
  });

  it('enables a disconnected server from repo config and syncs the extension bridge', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    await handlers.mcpToggle({ serverId: 'server-1', enabled: true });

    expect(deps.mcpHost.connectToServer).toHaveBeenCalledWith({
      id: 'server-1',
      companyId: 'company-1',
      name: 'Filesystem MCP',
      transport: 'stdio',
      configJson: JSON.stringify({ command: 'npx', args: ['filesystem-mcp'] }),
      enabled: false,
      lastHealth: null,
    });
    expect(deps.mcpServersRepo.updateEnabled).toHaveBeenCalledWith('server-1', true);
    expect(deps.extensionsRegistry?.syncMcpServer).toHaveBeenCalledWith('server-1');
  });

  it('removes the runtime server and its bridge row together', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    await handlers.mcpRemoveServer({ serverId: 'server-1' });

    expect(deps.mcpHost.disconnectServer).toHaveBeenCalledWith('server-1');
    expect(deps.mcpServersRepo.delete).toHaveBeenCalledWith('server-1');
    expect(deps.extensionsRegistry?.removeMcpServer).toHaveBeenCalledWith('server-1');
  });
});
