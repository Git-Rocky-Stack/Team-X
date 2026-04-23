import { describe, expect, it, vi } from 'vitest';

import { type IpcHandlerDeps, createIpcHandlers } from './handlers.js';

function makeDeps(overrides: Partial<IpcHandlerDeps> = {}): IpcHandlerDeps {
  const noop = {} as never;
  type FakeMcpRow = {
    id: string;
    companyId: string | null;
    name: string;
    transport: 'stdio' | 'sse';
    configJson: string;
    enabled: boolean;
    lastHealth: string | null;
    installedAt: number;
  };
  const runtimeServer: FakeMcpRow = {
    id: 'server-1',
    companyId: 'company-1',
    name: 'Filesystem MCP',
    transport: 'stdio',
    configJson: JSON.stringify({ command: 'npx', args: ['filesystem-mcp'] }),
    enabled: false,
    lastHealth: null,
    installedAt: 1,
  };
  const templateServer: FakeMcpRow = {
    id: 'template-1',
    companyId: null,
    name: 'Context7',
    transport: 'stdio',
    configJson: JSON.stringify({ command: 'npx', args: ['-y', '@upstash/context7-mcp@latest'] }),
    enabled: false,
    lastHealth: null,
    installedAt: 2,
  };
  const serverRows: Record<string, FakeMcpRow> = {
    [runtimeServer.id]: runtimeServer,
    [templateServer.id]: templateServer,
  };
  const mcpServersRepo = {
    listByCompany: vi.fn(() => [runtimeServer, templateServer]),
    listRuntimeByCompany: vi.fn(() => [runtimeServer]),
    listTemplates: vi.fn(() => [templateServer]),
    getById: vi.fn((id: string) => serverRows[id] ?? null),
    create: vi.fn((input: { companyId: string | null; name: string; transport: 'stdio' | 'sse'; configJson: string }) => {
      const created = {
        id: 'server-2',
        companyId: input.companyId,
        name: input.name,
        transport: input.transport,
        configJson: input.configJson,
        enabled: true,
        lastHealth: null,
        installedAt: 3,
      };
      serverRows[created.id] = created;
      return created.id;
    }),
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

    expect(deps.mcpServersRepo.listRuntimeByCompany).toHaveBeenCalledWith('company-1');
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

  it('lists built-in templates separately from installed runtime rows', async () => {
    const deps = makeDeps({
      extensionsRegistry: {
        syncMcpServer: vi.fn(),
        removeMcpServer: vi.fn(),
        listByCompany: vi.fn(() => [
          {
            id: 'ext-template-1',
            companyId: null,
            kind: 'mcp',
            name: 'Context7',
            slug: 'context7',
            sourceKind: 'template',
            sourceRef: 'npx -y @upstash/context7-mcp@latest',
            version: null,
            updateChannel: null,
            manifestJson: JSON.stringify({ bridgeKind: 'mcp-server' }),
            requestedCapabilitiesJson: JSON.stringify(['mcp.call', 'process.spawn']),
            requestedPathsJson: '[]',
            enabled: false,
            trustState: 'pending-review',
            runtimeRefId: 'template-1',
            installedAt: 1,
            updatedAt: 1,
          },
          {
            id: 'ext-installed-1',
            companyId: 'company-1',
            kind: 'mcp',
            name: 'Context7',
            slug: 'context7-company',
            sourceKind: 'template',
            sourceRef: 'Built-in template · Context7',
            version: null,
            updateChannel: null,
            manifestJson: JSON.stringify({ templateId: 'template-1' }),
            requestedCapabilitiesJson: JSON.stringify(['mcp.call', 'process.spawn']),
            requestedPathsJson: '[]',
            enabled: true,
            trustState: 'trusted',
            runtimeRefId: 'server-1',
            installedAt: 2,
            updatedAt: 2,
          },
        ]),
      } as unknown as IpcHandlerDeps['extensionsRegistry'],
    });
    const handlers = createIpcHandlers(deps);

    const result = await handlers.mcpListTemplates({ companyId: 'company-1' });

    expect(deps.mcpServersRepo.listTemplates).toHaveBeenCalled();
    expect(result).toEqual([
      {
        id: 'template-1',
        name: 'Context7',
        transport: 'stdio',
        sourceRef: 'npx -y @upstash/context7-mcp@latest',
        lastHealth: null,
        requestedCapabilities: ['mcp.call', 'process.spawn'],
        installed: true,
        installedServerId: 'server-1',
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

  it('installs a built-in template into the workspace and preserves template provenance', async () => {
    const deps = makeDeps({
      extensionsRegistry: {
        syncMcpServer: vi.fn(),
        removeMcpServer: vi.fn(),
        listByCompany: vi.fn(() => [
          {
            id: 'ext-template-1',
            companyId: null,
            kind: 'mcp',
            name: 'Context7',
            slug: 'context7',
            sourceKind: 'template',
            sourceRef: 'npx -y @upstash/context7-mcp@latest',
            version: null,
            updateChannel: null,
            manifestJson: JSON.stringify({ bridgeKind: 'mcp-server' }),
            requestedCapabilitiesJson: JSON.stringify(['mcp.call', 'process.spawn']),
            requestedPathsJson: '[]',
            enabled: false,
            trustState: 'pending-review',
            runtimeRefId: 'template-1',
            installedAt: 1,
            updatedAt: 1,
          },
        ]),
      } as unknown as IpcHandlerDeps['extensionsRegistry'],
    });
    const handlers = createIpcHandlers(deps);

    const result = await handlers.mcpInstallTemplate({
      companyId: 'company-1',
      templateId: 'template-1',
    });

    expect(result).toEqual({ serverId: 'server-2' });
    expect(deps.mcpServersRepo.create).toHaveBeenCalledWith({
      companyId: 'company-1',
      name: 'Context7',
      transport: 'stdio',
      configJson: JSON.stringify({ command: 'npx', args: ['-y', '@upstash/context7-mcp@latest'] }),
    });
    expect(deps.mcpHost.connectToServer).toHaveBeenCalledWith({
      id: 'server-2',
      companyId: 'company-1',
      name: 'Context7',
      transport: 'stdio',
      configJson: JSON.stringify({ command: 'npx', args: ['-y', '@upstash/context7-mcp@latest'] }),
      enabled: true,
      lastHealth: null,
    });
    expect(deps.extensionsRegistry?.syncMcpServer).toHaveBeenCalledWith(
      'server-2',
      expect.objectContaining({
        sourceKind: 'template',
        sourceRef: 'Built-in template · Context7',
        manifestPatch: expect.objectContaining({
          templateId: 'template-1',
          templateName: 'Context7',
        }),
      }),
    );
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
