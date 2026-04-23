import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * McpHost unit tests — exercises the singleton MCP connection pool's
 * business logic: tool-call enforcement (tools_allowed / tools_denied),
 * per-company tool filtering, server routing, and connection lifecycle.
 *
 * The MCP SDK is fully mocked — no real stdio/SSE connections. The
 * focus is on the trust boundary: agents cannot bypass tool restrictions.
 */

// ---------------------------------------------------------------------------
// Mock the MCP SDK
// ---------------------------------------------------------------------------

const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockListTools = vi.fn().mockResolvedValue({ tools: [] });
const mockCallTool = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    listTools: mockListTools,
    callTool: mockCallTool,
    close: mockClose,
  })),
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: vi.fn(),
}));

import { type McpHostDeps, type McpServerConfig, createMcpHost } from './mcp-host.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFakeRepos() {
  const toolCallsCreated: unknown[] = [];
  return {
    mcpServersRepo: {
      listEnabled: vi.fn().mockReturnValue([]),
      updateHealth: vi.fn(),
    } as unknown as McpHostDeps['mcpServersRepo'],
    toolCallsRepo: {
      create: vi.fn((input: unknown) => {
        toolCallsCreated.push(input);
        return 'tc-1';
      }),
    } as unknown as McpHostDeps['toolCallsRepo'],
    toolCallsCreated,
  };
}

function makeFakeBus(): McpHostDeps['bus'] {
  return { emit: vi.fn(), subscribe: vi.fn() } as unknown as McpHostDeps['bus'];
}

const SERVER_CONFIG: McpServerConfig = {
  id: 'srv-1',
  companyId: null,
  name: 'test-mcp',
  transport: 'stdio',
  configJson: JSON.stringify({ command: 'echo', args: ['hello'] }),
  enabled: true,
  lastHealth: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('McpHost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('connect + disconnect lifecycle', () => {
    it('connects to a server and records it', async () => {
      const { mcpServersRepo, toolCallsRepo } = makeFakeRepos();
      mockListTools.mockResolvedValueOnce({
        tools: [{ name: 'read_file', description: 'Read a file', inputSchema: {} }],
      });

      const host = createMcpHost({
        mcpServersRepo,
        toolCallsRepo,
        bus: makeFakeBus(),
      });
      await host.connectToServer(SERVER_CONFIG);

      expect(host.listServers()).toHaveLength(1);
      expect(host.listServers()[0]?.name).toBe('test-mcp');
      expect(host.listServers()[0]?.connected).toBe(true);
      expect(mcpServersRepo.updateHealth).toHaveBeenCalledWith('srv-1', expect.any(String));
    });

    it('skips connection if server is already connected', async () => {
      const { mcpServersRepo, toolCallsRepo } = makeFakeRepos();
      mockListTools.mockResolvedValue({ tools: [] });

      const host = createMcpHost({
        mcpServersRepo,
        toolCallsRepo,
        bus: makeFakeBus(),
      });
      await host.connectToServer(SERVER_CONFIG);
      await host.connectToServer(SERVER_CONFIG);

      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('disconnects and removes server from pool', async () => {
      const { mcpServersRepo, toolCallsRepo } = makeFakeRepos();
      mockListTools.mockResolvedValue({ tools: [] });

      const host = createMcpHost({
        mcpServersRepo,
        toolCallsRepo,
        bus: makeFakeBus(),
      });
      await host.connectToServer(SERVER_CONFIG);
      expect(host.listServers()).toHaveLength(1);

      await host.disconnectServer('srv-1');
      expect(host.listServers()).toHaveLength(0);
      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('shutdown closes all connections', async () => {
      const { mcpServersRepo, toolCallsRepo } = makeFakeRepos();
      mockListTools.mockResolvedValue({ tools: [] });

      const host = createMcpHost({
        mcpServersRepo,
        toolCallsRepo,
        bus: makeFakeBus(),
      });
      await host.connectToServer({ ...SERVER_CONFIG, id: 's1' });
      await host.connectToServer({ ...SERVER_CONFIG, id: 's2', name: 'second' });
      expect(host.listServers()).toHaveLength(2);

      await host.shutdown();
      expect(host.listServers()).toHaveLength(0);
      expect(mockClose).toHaveBeenCalledTimes(2);
    });
  });

  describe('listTools — per-company filtering', () => {
    it('returns tools from global servers (companyId=null)', async () => {
      const { mcpServersRepo, toolCallsRepo } = makeFakeRepos();
      mockListTools.mockResolvedValueOnce({
        tools: [{ name: 'global_tool', description: 'Global', inputSchema: {} }],
      });

      const host = createMcpHost({
        mcpServersRepo,
        toolCallsRepo,
        bus: makeFakeBus(),
      });
      await host.connectToServer({ ...SERVER_CONFIG, companyId: null });

      const tools = host.listTools('company-123');
      expect(tools).toHaveLength(1);
      expect(tools[0]?.name).toBe('global_tool');
    });

    it('returns tools from company-specific servers', async () => {
      const { mcpServersRepo, toolCallsRepo } = makeFakeRepos();
      mockListTools.mockResolvedValueOnce({
        tools: [{ name: 'company_tool', description: 'Specific', inputSchema: {} }],
      });

      const host = createMcpHost({
        mcpServersRepo,
        toolCallsRepo,
        bus: makeFakeBus(),
      });
      await host.connectToServer({ ...SERVER_CONFIG, companyId: 'company-123' });

      const tools = host.listTools('company-123');
      expect(tools).toHaveLength(1);
      expect(tools[0]?.name).toBe('company_tool');
    });

    it('excludes tools from other companies', async () => {
      const { mcpServersRepo, toolCallsRepo } = makeFakeRepos();
      mockListTools.mockResolvedValueOnce({
        tools: [{ name: 'other_tool', description: 'Other', inputSchema: {} }],
      });

      const host = createMcpHost({
        mcpServersRepo,
        toolCallsRepo,
        bus: makeFakeBus(),
      });
      await host.connectToServer({ ...SERVER_CONFIG, companyId: 'company-other' });

      const tools = host.listTools('company-123');
      expect(tools).toHaveLength(0);
    });
  });

  describe('findServerForTool — routing', () => {
    it('returns the serverId that owns the tool', async () => {
      const { mcpServersRepo, toolCallsRepo } = makeFakeRepos();
      mockListTools.mockResolvedValueOnce({
        tools: [{ name: 'read_file', description: 'Read', inputSchema: {} }],
      });

      const host = createMcpHost({
        mcpServersRepo,
        toolCallsRepo,
        bus: makeFakeBus(),
      });
      await host.connectToServer(SERVER_CONFIG);

      expect(host.findServerForTool('read_file', 'any-company')).toBe('srv-1');
    });

    it('returns null when no server has the tool', async () => {
      const { mcpServersRepo, toolCallsRepo } = makeFakeRepos();
      mockListTools.mockResolvedValueOnce({ tools: [] });

      const host = createMcpHost({
        mcpServersRepo,
        toolCallsRepo,
        bus: makeFakeBus(),
      });
      await host.connectToServer(SERVER_CONFIG);

      expect(host.findServerForTool('nonexistent', 'any-company')).toBeNull();
    });
  });

  describe('callTool — tools_allowed / tools_denied enforcement', () => {
    async function setupHostWithTool() {
      const repos = makeFakeRepos();
      mockListTools.mockResolvedValueOnce({
        tools: [{ name: 'read_file', description: 'Read', inputSchema: {} }],
      });
      const host = createMcpHost({
        mcpServersRepo: repos.mcpServersRepo,
        toolCallsRepo: repos.toolCallsRepo,
        bus: makeFakeBus(),
        now: () => 1000,
      });
      await host.connectToServer(SERVER_CONFIG);
      return { host, repos };
    }

    it('denies a tool that is in tools_denied', async () => {
      const { host, repos } = await setupHostWithTool();

      const result = await host.callTool({
        companyId: 'company-1',
        serverId: 'srv-1',
        toolName: 'read_file',
        toolArgs: { path: '/etc/passwd' },
        runId: 'run-1',
        employeeId: 'emp-1',
        toolsAllowed: [],
        toolsDenied: ['read_file'],
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('denied');
      expect(result.error).toMatch(/denied/i);
      // Tool call should still be recorded for audit
      expect(repos.toolCallsRepo.create).toHaveBeenCalledTimes(1);
    });

    it('emits authority.violation when a tool call is denied by authority', async () => {
      const repos = makeFakeRepos();
      const bus = makeFakeBus();
      mockListTools.mockResolvedValueOnce({
        tools: [{ name: 'read_file', description: 'Read', inputSchema: {} }],
      });

      const host = createMcpHost({
        mcpServersRepo: repos.mcpServersRepo,
        toolCallsRepo: repos.toolCallsRepo,
        bus,
        now: () => 1000,
      });
      await host.connectToServer(SERVER_CONFIG);

      await host.callTool({
        companyId: 'company-1',
        serverId: 'srv-1',
        toolName: 'read_file',
        toolArgs: {},
        runId: 'run-1',
        employeeId: 'emp-1',
        toolsAllowed: [],
        toolsDenied: ['read_file'],
      });

      expect(bus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'authority.violation',
          companyId: 'company-1',
          actorId: 'emp-1',
        }),
      );
    });

    it('denies a tool not in tools_allowed when the list is non-empty', async () => {
      const { host } = await setupHostWithTool();

      const result = await host.callTool({
        companyId: 'company-1',
        serverId: 'srv-1',
        toolName: 'read_file',
        toolArgs: {},
        runId: 'run-1',
        employeeId: 'emp-1',
        toolsAllowed: ['write_file', 'list_dir'],
        toolsDenied: [],
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('denied');
      expect(result.error).toMatch(/not allowed/i);
    });

    it('allows a tool when tools_allowed is empty (no allowlist)', async () => {
      const { host } = await setupHostWithTool();
      mockCallTool.mockResolvedValueOnce({ content: [{ type: 'text', text: 'file contents' }] });

      const result = await host.callTool({
        companyId: 'company-1',
        serverId: 'srv-1',
        toolName: 'read_file',
        toolArgs: { path: '/readme.md' },
        runId: 'run-1',
        employeeId: 'emp-1',
        toolsAllowed: [],
        toolsDenied: [],
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('success');
    });

    it('allows a tool that is in tools_allowed', async () => {
      const { host } = await setupHostWithTool();
      mockCallTool.mockResolvedValueOnce({ content: [{ type: 'text', text: 'ok' }] });

      const result = await host.callTool({
        companyId: 'company-1',
        serverId: 'srv-1',
        toolName: 'read_file',
        toolArgs: {},
        runId: 'run-1',
        employeeId: 'emp-1',
        toolsAllowed: ['read_file', 'write_file'],
        toolsDenied: [],
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('success');
    });

    it('tools_denied takes precedence over tools_allowed', async () => {
      const { host } = await setupHostWithTool();

      const result = await host.callTool({
        companyId: 'company-1',
        serverId: 'srv-1',
        toolName: 'read_file',
        toolArgs: {},
        runId: 'run-1',
        employeeId: 'emp-1',
        toolsAllowed: ['read_file'],
        toolsDenied: ['read_file'],
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('denied');
    });

    it('returns error when server is not connected', async () => {
      const { host } = await setupHostWithTool();

      const result = await host.callTool({
        companyId: 'company-1',
        serverId: 'srv-nonexistent',
        toolName: 'read_file',
        toolArgs: {},
        runId: 'run-1',
        employeeId: 'emp-1',
        toolsAllowed: [],
        toolsDenied: [],
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
      expect(result.error).toMatch(/not connected/i);
    });

    it('records every tool call in the tool_calls table', async () => {
      const { host, repos } = await setupHostWithTool();
      mockCallTool.mockResolvedValueOnce({ content: [{ type: 'text', text: 'data' }] });

      await host.callTool({
        companyId: 'company-1',
        serverId: 'srv-1',
        toolName: 'read_file',
        toolArgs: { path: '/test' },
        runId: 'run-42',
        employeeId: 'emp-7',
        toolsAllowed: [],
        toolsDenied: [],
      });

      expect(repos.toolCallsRepo.create).toHaveBeenCalledTimes(1);
      const recorded = repos.toolCallsRepo.create.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(recorded.runId).toBe('run-42');
      expect(recorded.toolName).toBe('read_file');
      expect(recorded.mcpServerId).toBe('srv-1');
      expect(recorded.status).toBe('success');
    });

    it('measures latency for successful tool calls', async () => {
      const repos = makeFakeRepos();
      let clock = 1000;
      mockListTools.mockResolvedValueOnce({
        tools: [{ name: 'slow_tool', description: 'Slow', inputSchema: {} }],
      });
      mockCallTool.mockImplementationOnce(async () => {
        clock += 250; // Simulate 250ms latency
        return { content: [{ type: 'text', text: 'done' }] };
      });

      const host = createMcpHost({
        mcpServersRepo: repos.mcpServersRepo,
        toolCallsRepo: repos.toolCallsRepo,
        bus: makeFakeBus(),
        now: () => clock,
      });
      await host.connectToServer({ ...SERVER_CONFIG, id: 'srv-slow' });

      const result = await host.callTool({
        companyId: 'company-1',
        serverId: 'srv-slow',
        toolName: 'slow_tool',
        toolArgs: {},
        runId: 'run-1',
        employeeId: 'emp-1',
        toolsAllowed: [],
        toolsDenied: [],
      });

      expect(result.latencyMs).toBe(250);
    });
  });

  describe('initialize', () => {
    it('connects to all enabled servers from the database', async () => {
      const { mcpServersRepo, toolCallsRepo } = makeFakeRepos();
      mcpServersRepo.listEnabled.mockReturnValue([
        {
          id: 's1',
          companyId: null,
          name: 'mcp-a',
          transport: 'stdio',
          configJson: '{"command":"echo"}',
          enabled: true,
          lastHealth: null,
        },
        {
          id: 's2',
          companyId: null,
          name: 'mcp-b',
          transport: 'stdio',
          configJson: '{"command":"echo"}',
          enabled: true,
          lastHealth: null,
        },
      ]);
      mockListTools.mockResolvedValue({ tools: [] });

      const host = createMcpHost({
        mcpServersRepo,
        toolCallsRepo,
        bus: makeFakeBus(),
      });
      await host.initialize();

      expect(host.listServers()).toHaveLength(2);
    });

    it('continues on connection failure — best-effort initialization', async () => {
      const { mcpServersRepo, toolCallsRepo } = makeFakeRepos();
      mcpServersRepo.listEnabled.mockReturnValue([
        {
          id: 's1',
          companyId: null,
          name: 'mcp-ok',
          transport: 'stdio',
          configJson: '{"command":"echo"}',
          enabled: true,
          lastHealth: null,
        },
        {
          id: 's2',
          companyId: null,
          name: 'mcp-fail',
          transport: 'stdio',
          configJson: '{"command":"echo"}',
          enabled: true,
          lastHealth: null,
        },
      ]);

      // First call succeeds, second fails
      mockConnect
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('connection refused'));
      mockListTools.mockResolvedValue({ tools: [] });

      const host = createMcpHost({
        mcpServersRepo,
        toolCallsRepo,
        bus: makeFakeBus(),
      });
      await host.initialize();

      // Only the first server should be connected
      expect(host.listServers()).toHaveLength(1);
      expect(host.listServers()[0]?.name).toBe('mcp-ok');
    });
  });
});
