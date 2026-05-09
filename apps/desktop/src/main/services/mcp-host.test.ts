import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * McpHost unit tests — exercises the singleton MCP connection pool's
 * business logic: tool-call enforcement (tools_allowed / tools_denied),
 * per-company tool filtering, server routing, connection lifecycle, and
 * the C5 security gates (audit 2026-05-07): hash-pinned executable
 * allowlist, env scrubbing, and cwd pinning.
 *
 * The MCP SDK is fully mocked — no real stdio/SSE connections. The
 * focus is on the trust boundary: agents cannot bypass tool restrictions
 * AND a hostile / misconfigured MCP server cannot inherit secrets from
 * the parent process or escape the per-server cwd.
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

// Capture stdio transport constructor args so the C5 gates' end-state
// (scrubbed env, pinned cwd, resolved command path) is observable in
// tests. `vi.hoisted` is required because `vi.mock` is hoisted ABOVE
// non-vi.hoisted top-level code; without it the factory closes over
// uninitialized references.
const { stdioTransportCalls } = vi.hoisted(() => ({
  stdioTransportCalls: [] as Array<{
    command: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
  }>,
}));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn(function (this: object, params: unknown) {
    stdioTransportCalls.push(params as (typeof stdioTransportCalls)[number]);
    Object.assign(this, { params });
  }),
}));

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: vi.fn(),
}));

import { type McpHostDeps, type McpServerConfig, createMcpHost } from './mcp-host.js';
import type { McpExecutableAllowlist } from './mcp-security.js';

// ---------------------------------------------------------------------------
// Test fixtures: a real on-disk fake-binary so the C5 sha256 + file-exists
// gates have something to validate against without mocking node:fs.
// ---------------------------------------------------------------------------

let tmpRoot: string;
let fakeBinaryPath: string;
let userDataDir: string;

beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'mcp-host-test-'));
  fakeBinaryPath = join(tmpRoot, 'fake-mcp.sh');
  writeFileSync(fakeBinaryPath, '#!/bin/sh\necho ok\n', 'utf8');
  userDataDir = join(tmpRoot, 'userData');
});

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

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

/**
 * Build an in-memory allowlist that authorizes the test fixture
 * binary. Tests that exercise the rejection paths inject a different
 * allowlist (or none) explicitly.
 */
function makeAllowlist(entries?: { command: string; sha256?: string }[]): McpExecutableAllowlist {
  const list = entries ?? [{ command: fakeBinaryPath }];
  return { entries: () => list };
}

/** Default deps used by every test that needs a working host. */
function makeBaseDeps(
  overrides: Partial<McpHostDeps> = {},
): McpHostDeps & {
  mcpServersRepo: ReturnType<typeof makeFakeRepos>['mcpServersRepo'];
  toolCallsRepo: ReturnType<typeof makeFakeRepos>['toolCallsRepo'];
} {
  const repos = makeFakeRepos();
  return {
    mcpServersRepo: repos.mcpServersRepo,
    toolCallsRepo: repos.toolCallsRepo,
    bus: makeFakeBus(),
    userDataDir,
    executableAllowlist: makeAllowlist(),
    ...overrides,
  };
}

const SERVER_CONFIG: McpServerConfig = {
  id: 'srv-1',
  companyId: null,
  name: 'test-mcp',
  transport: 'stdio',
  // C5: command MUST be an absolute path on the allowlist. The fixture
  // path is set up in beforeAll above and the allowlist authorizes it.
  configJson: '', // populated below in beforeAll once fakeBinaryPath is known
  enabled: true,
  lastHealth: null,
};

beforeAll(() => {
  SERVER_CONFIG.configJson = JSON.stringify({
    command: fakeBinaryPath,
    args: ['hello'],
  });
});

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
        userDataDir,
        executableAllowlist: makeAllowlist(),
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
        userDataDir,
        executableAllowlist: makeAllowlist(),
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
        userDataDir,
        executableAllowlist: makeAllowlist(),
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
        userDataDir,
        executableAllowlist: makeAllowlist(),
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
        userDataDir,
        executableAllowlist: makeAllowlist(),
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
        userDataDir,
        executableAllowlist: makeAllowlist(),
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
        userDataDir,
        executableAllowlist: makeAllowlist(),
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
        userDataDir,
        executableAllowlist: makeAllowlist(),
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
        userDataDir,
        executableAllowlist: makeAllowlist(),
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
        userDataDir,
        executableAllowlist: makeAllowlist(),
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
        userDataDir,
        executableAllowlist: makeAllowlist(),
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
        userDataDir,
        executableAllowlist: makeAllowlist(),
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
          configJson: JSON.stringify({ command: fakeBinaryPath }),
          enabled: true,
          lastHealth: null,
        },
        {
          id: 's2',
          companyId: null,
          name: 'mcp-b',
          transport: 'stdio',
          configJson: JSON.stringify({ command: fakeBinaryPath }),
          enabled: true,
          lastHealth: null,
        },
      ]);
      mockListTools.mockResolvedValue({ tools: [] });

      const host = createMcpHost({
        mcpServersRepo,
        toolCallsRepo,
        bus: makeFakeBus(),
        userDataDir,
        executableAllowlist: makeAllowlist(),
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
          configJson: JSON.stringify({ command: fakeBinaryPath }),
          enabled: true,
          lastHealth: null,
        },
        {
          id: 's2',
          companyId: null,
          name: 'mcp-fail',
          transport: 'stdio',
          configJson: JSON.stringify({ command: fakeBinaryPath }),
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
        userDataDir,
        executableAllowlist: makeAllowlist(),
      });
      await host.initialize();

      // Only the first server should be connected
      expect(host.listServers()).toHaveLength(1);
      expect(host.listServers()[0]?.name).toBe('mcp-ok');
    });
  });

  // -----------------------------------------------------------------
  // C5 — child-process security gates (audit 2026-05-07).
  //
  // Pre-C5 the SDK spawned MCP servers with the parent's full env and
  // an inherited cwd. These tests pin the post-C5 invariants:
  //   - executable allowlist enforced (hash-pinned)
  //   - bare names refused
  //   - empty allowlist = fail-closed
  //   - process.env never inherited wholesale; PATH + tiny survival set only
  //   - cwd pinned under <userData>/mcp-runtimes/<serverId>
  //   - sha256 mismatch = refusal
  //   - rejections emit `authority.violation` with the structured reason
  // -----------------------------------------------------------------

  describe('C5 — stdio spawn security gates', () => {
    beforeEach(() => {
      stdioTransportCalls.length = 0;
    });

    it('refuses to spawn when the executableAllowlist is empty (fail-closed)', async () => {
      const repos = makeFakeRepos();
      const bus = makeFakeBus();
      const host = createMcpHost({
        mcpServersRepo: repos.mcpServersRepo,
        toolCallsRepo: repos.toolCallsRepo,
        bus,
        userDataDir,
        executableAllowlist: makeAllowlist([]), // empty
      });

      await expect(host.connectToServer(SERVER_CONFIG)).rejects.toThrow(/allowlist is empty/);
      expect(stdioTransportCalls).toHaveLength(0);
      expect(bus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'authority.violation',
          actorKind: 'system',
          payload: expect.objectContaining({
            resourceKind: 'mcp-spawn',
            reason: 'allowlist-empty',
          }),
        }),
      );
    });

    it('refuses bare-name commands like "node" — PATH lookup is attacker-controlled', async () => {
      const repos = makeFakeRepos();
      const host = createMcpHost({
        mcpServersRepo: repos.mcpServersRepo,
        toolCallsRepo: repos.toolCallsRepo,
        bus: makeFakeBus(),
        userDataDir,
        executableAllowlist: makeAllowlist([{ command: fakeBinaryPath }]),
      });

      const bareConfig: McpServerConfig = {
        ...SERVER_CONFIG,
        id: 'srv-bare',
        configJson: JSON.stringify({ command: 'node' }),
      };
      await expect(host.connectToServer(bareConfig)).rejects.toThrow(/absolute path/);
      expect(stdioTransportCalls).toHaveLength(0);
    });

    it('refuses absolute paths that are not in the allowlist', async () => {
      const repos = makeFakeRepos();
      const bus = makeFakeBus();
      const host = createMcpHost({
        mcpServersRepo: repos.mcpServersRepo,
        toolCallsRepo: repos.toolCallsRepo,
        bus,
        userDataDir,
        executableAllowlist: makeAllowlist([{ command: fakeBinaryPath }]),
      });

      const evilPath = process.platform === 'win32' ? 'C:\\evil\\malware.exe' : '/tmp/evil';
      const evilConfig: McpServerConfig = {
        ...SERVER_CONFIG,
        id: 'srv-evil',
        configJson: JSON.stringify({ command: evilPath }),
      };
      await expect(host.connectToServer(evilConfig)).rejects.toThrow(/not in the allowlist/);
      expect(bus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ reason: 'not-in-allowlist' }),
        }),
      );
    });

    it('refuses on sha256 mismatch when an entry pins a hash', async () => {
      const repos = makeFakeRepos();
      const bus = makeFakeBus();
      const host = createMcpHost({
        mcpServersRepo: repos.mcpServersRepo,
        toolCallsRepo: repos.toolCallsRepo,
        bus,
        userDataDir,
        // Pin a hash that won't match the fixture content.
        executableAllowlist: makeAllowlist([
          { command: fakeBinaryPath, sha256: 'deadbeef'.repeat(8) },
        ]),
      });

      await expect(host.connectToServer({ ...SERVER_CONFIG, id: 'srv-pin' })).rejects.toThrow(
        /sha256/,
      );
      expect(bus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ reason: 'sha256-mismatch' }),
        }),
      );
    });

    it('passes a SCRUBBED env to the stdio transport — no process.env secrets', async () => {
      // Plant an obvious secret in process.env to prove it does not leak.
      const sentinelKey = 'C5_TEST_OPENAI_API_KEY';
      const sentinelValue = 'sk-leak-' + Date.now();
      process.env[sentinelKey] = sentinelValue;

      try {
        const host = createMcpHost({
          mcpServersRepo: makeFakeRepos().mcpServersRepo,
          toolCallsRepo: makeFakeRepos().toolCallsRepo,
          bus: makeFakeBus(),
          userDataDir,
          executableAllowlist: makeAllowlist(),
        });
        mockListTools.mockResolvedValueOnce({ tools: [] });
        await host.connectToServer(SERVER_CONFIG);

        expect(stdioTransportCalls).toHaveLength(1);
        const env = stdioTransportCalls[0]?.env ?? {};
        // The parent's secret never reaches the child's env.
        expect(env).not.toHaveProperty(sentinelKey);
        // PATH (or Path on Windows) DOES land — without it the child
        // can't find its language runtime.
        expect(env.PATH || env.Path).toBeTruthy();
      } finally {
        delete process.env[sentinelKey];
      }
    });

    it('merges user-supplied env on top of the scrubbed defaults', async () => {
      const host = createMcpHost({
        mcpServersRepo: makeFakeRepos().mcpServersRepo,
        toolCallsRepo: makeFakeRepos().toolCallsRepo,
        bus: makeFakeBus(),
        userDataDir,
        executableAllowlist: makeAllowlist(),
      });
      mockListTools.mockResolvedValueOnce({ tools: [] });

      const config: McpServerConfig = {
        ...SERVER_CONFIG,
        id: 'srv-userenv',
        configJson: JSON.stringify({
          command: fakeBinaryPath,
          env: { CUSTOM_FLAG: '1', NODE_ENV: 'production' },
        }),
      };
      await host.connectToServer(config);
      expect(stdioTransportCalls).toHaveLength(1);
      const env = stdioTransportCalls[0]?.env ?? {};
      expect(env.CUSTOM_FLAG).toBe('1');
      expect(env.NODE_ENV).toBe('production');
    });

    it('pins the child cwd to <userData>/mcp-runtimes/<serverId> and creates it on demand', async () => {
      const host = createMcpHost({
        mcpServersRepo: makeFakeRepos().mcpServersRepo,
        toolCallsRepo: makeFakeRepos().toolCallsRepo,
        bus: makeFakeBus(),
        userDataDir,
        executableAllowlist: makeAllowlist(),
      });
      mockListTools.mockResolvedValueOnce({ tools: [] });
      await host.connectToServer({ ...SERVER_CONFIG, id: 'srv-cwd' });

      expect(stdioTransportCalls).toHaveLength(1);
      const cwd = stdioTransportCalls[0]?.cwd;
      expect(cwd).toBe(join(userDataDir, 'mcp-runtimes', 'srv-cwd'));
      // The directory was actually created.
      expect(existsSync(cwd!)).toBe(true);
    });

    it('refuses to spawn when userDataDir dep is unwired', async () => {
      const host = createMcpHost({
        mcpServersRepo: makeFakeRepos().mcpServersRepo,
        toolCallsRepo: makeFakeRepos().toolCallsRepo,
        bus: makeFakeBus(),
        // userDataDir intentionally omitted
        executableAllowlist: makeAllowlist(),
      });
      await expect(host.connectToServer(SERVER_CONFIG)).rejects.toThrow(/userDataDir/);
    });

    it('refuses to spawn when executableAllowlist dep is unwired', async () => {
      const host = createMcpHost({
        mcpServersRepo: makeFakeRepos().mcpServersRepo,
        toolCallsRepo: makeFakeRepos().toolCallsRepo,
        bus: makeFakeBus(),
        userDataDir,
        // executableAllowlist intentionally omitted
      });
      await expect(host.connectToServer(SERVER_CONFIG)).rejects.toThrow(/executableAllowlist/);
    });

    it('records the failed health state so the operator can see WHY', async () => {
      const repos = makeFakeRepos();
      const host = createMcpHost({
        mcpServersRepo: repos.mcpServersRepo,
        toolCallsRepo: repos.toolCallsRepo,
        bus: makeFakeBus(),
        userDataDir,
        executableAllowlist: makeAllowlist([]), // empty → reject
      });
      await expect(host.connectToServer(SERVER_CONFIG)).rejects.toThrow();
      expect(repos.mcpServersRepo.updateHealth).toHaveBeenCalledWith(
        SERVER_CONFIG.id,
        expect.stringMatching(/error: .*allowlist is empty/),
      );
    });
  });
});
