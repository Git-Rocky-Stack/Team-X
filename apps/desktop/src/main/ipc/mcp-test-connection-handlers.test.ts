import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the `mcp.testConnection` IPC handler.
 *
 * A test connection spawns a stdio MCP server from renderer-supplied JSON,
 * so it must pass the same C5 gates as a pooled connection (audit
 * 2026-05-07): hash-pinned executable allowlist, env scrub, cwd pin. These
 * tests drive the real handler over a real `createMcpHost`, with the real
 * `validateExecutable` / `scrubEnv` / `resolveCwd` checking a real fixture
 * binary on disk.
 *
 * The only thing faked is the MCP SDK, exactly as `mcp-host.test.ts` fakes
 * it: `StdioClientTransport` is the spawn boundary, so its constructor args
 * are what would have been handed to `child_process.spawn`. An empty
 * `stdioTransportCalls` plus an uncalled `connect` means nothing was spawned.
 */

// ---------------------------------------------------------------------------
// Mock the MCP SDK (same seam as services/mcp-host.test.ts)
// ---------------------------------------------------------------------------

const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockListTools = vi.fn().mockResolvedValue({ tools: [] });
const mockClose = vi.fn().mockResolvedValue(undefined);

// A class: the code under test calls `new Client(...)`, and Vitest 4 refuses
// to construct an arrow-function mock.
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn(
    class {
      connect = mockConnect;
      listTools = mockListTools;
      close = mockClose;
    },
  ),
}));

const { stdioTransportCalls, sseTransportCalls } = vi.hoisted(() => ({
  stdioTransportCalls: [] as Array<{
    command: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
  }>,
  sseTransportCalls: [] as URL[],
}));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn(function (this: object, params: unknown) {
    stdioTransportCalls.push(params as (typeof stdioTransportCalls)[number]);
    Object.assign(this, { params });
  }),
}));
vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: vi.fn(function (this: object, url: URL) {
    sseTransportCalls.push(url);
    Object.assign(this, { url });
  }),
}));

import { type McpHostDeps, createMcpHost } from '../services/mcp-host.js';
import { type McpExecutableAllowlist, isInside } from '../services/mcp-security.js';

import { createIpcHandlers } from './handlers.js';

// ---------------------------------------------------------------------------
// Fixtures: a real on-disk binary so the allowlist's file-exists check has
// something to validate without mocking node:fs.
// ---------------------------------------------------------------------------

let tmpRoot: string;
let fakeBinaryPath: string;
let userDataDir: string;

beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'mcp-test-connection-'));
  fakeBinaryPath = join(tmpRoot, 'fake-mcp.sh');
  writeFileSync(fakeBinaryPath, '#!/bin/sh\necho ok\n', 'utf8');
  userDataDir = join(tmpRoot, 'userData');
});

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

function makeAllowlist(entries?: { command: string; sha256?: string }[]): McpExecutableAllowlist {
  const list = entries ?? [{ command: fakeBinaryPath }];
  return { entries: () => list };
}

// biome-ignore lint/suspicious/noExplicitAny: test stand-in for deps this handler never touches
const unused: any = null;

/** The real handler over a real MCP host. `hostDeps` picks which gates are wired. */
function buildHandlers(hostDeps: Pick<McpHostDeps, 'userDataDir' | 'executableAllowlist'>) {
  const mcpHost = createMcpHost({
    mcpServersRepo: { listEnabled: () => [], updateHealth: () => undefined } as never,
    toolCallsRepo: { create: () => 'tc-1' } as never,
    bus: { emit: () => undefined, subscribe: () => undefined } as never,
    ...hostDeps,
  });
  return createIpcHandlers({
    mcpHost,
    companiesRepo: unused,
    employeesRepo: unused,
    threadsRepo: unused,
    messagesRepo: unused,
    ticketsRepo: unused,
    ticketAttachmentsRepo: unused,
    goalsRepo: unused,
    projectsRepo: unused,
    scheduleItemsRepo: unused,
    meetingsRepo: unused,
    orgEdgesRepo: unused,
    runsRepo: unused,
    eventsRepo: unused,
    orchestrator: unused,
    meetingService: unused,
    roleLookup: unused,
    mcpServersRepo: unused,
    providersService: unused,
    secretsStore: unused,
    settingsRepo: unused,
    vaultService: unused,
    backupService: unused,
    auditRepo: unused,
    updaterService: unused,
    getHardwareProfile: () => unused,
  });
}

function expectNothingSpawned(): void {
  expect(stdioTransportCalls).toEqual([]);
  expect(mockConnect).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  stdioTransportCalls.length = 0;
  sseTransportCalls.length = 0;
});

describe('IPC: mcp.testConnection — stdio spawn security gates', () => {
  it('refuses a command that is not on the allowlist and spawns nothing', async () => {
    const handlers = buildHandlers({ userDataDir, executableAllowlist: makeAllowlist() });
    const evilPath = process.platform === 'win32' ? 'C:\\evil\\malware.exe' : '/tmp/evil';

    const result = await handlers.mcpTestConnection({
      transport: 'stdio',
      configJson: JSON.stringify({ command: evilPath }),
    });

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/not in the allowlist/) });
    expectNothingSpawned();
  });

  it('refuses a bare command name, which would resolve through PATH, and spawns nothing', async () => {
    const handlers = buildHandlers({ userDataDir, executableAllowlist: makeAllowlist() });

    const result = await handlers.mcpTestConnection({
      transport: 'stdio',
      configJson: JSON.stringify({ command: 'node', args: ['-e', 'process.exit(0)'] }),
    });

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/absolute path/) });
    expectNothingSpawned();
  });

  it('fails closed when the allowlist is empty', async () => {
    const handlers = buildHandlers({ userDataDir, executableAllowlist: makeAllowlist([]) });

    const result = await handlers.mcpTestConnection({
      transport: 'stdio',
      configJson: JSON.stringify({ command: fakeBinaryPath }),
    });

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/allowlist is empty/) });
    expectNothingSpawned();
  });

  it('fails closed when the executable allowlist is unwired', async () => {
    const handlers = buildHandlers({ userDataDir });

    const result = await handlers.mcpTestConnection({
      transport: 'stdio',
      configJson: JSON.stringify({ command: fakeBinaryPath }),
    });

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/executableAllowlist/) });
    expectNothingSpawned();
  });

  it('fails closed when userDataDir is unwired, because the cwd cannot be pinned', async () => {
    const handlers = buildHandlers({ executableAllowlist: makeAllowlist() });

    const result = await handlers.mcpTestConnection({
      transport: 'stdio',
      configJson: JSON.stringify({ command: fakeBinaryPath }),
    });

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/userDataDir/) });
    expectNothingSpawned();
  });

  it('hands an allowlisted command to the transport with a scrubbed env and a pinned cwd', async () => {
    const sentinelKey = 'MCP_TEST_CONNECTION_OPENAI_API_KEY';
    process.env[sentinelKey] = `sk-leak-${Date.now()}`;
    try {
      const handlers = buildHandlers({ userDataDir, executableAllowlist: makeAllowlist() });
      mockListTools.mockResolvedValueOnce({
        tools: [
          { name: 'read_file', inputSchema: {} },
          { name: 'write_file', inputSchema: {} },
        ],
      });

      const result = await handlers.mcpTestConnection({
        transport: 'stdio',
        configJson: JSON.stringify({
          command: fakeBinaryPath,
          args: ['hello'],
          env: { CUSTOM_FLAG: '1' },
        }),
      });

      expect(result).toEqual({ ok: true, toolCount: 2 });
      expect(stdioTransportCalls).toHaveLength(1);
      const spawned = stdioTransportCalls[0];
      expect(spawned?.command).toBe(fakeBinaryPath);
      expect(spawned?.args).toEqual(['hello']);

      // Env: the app's passthrough set plus the operator's own keys, nothing else.
      const env = spawned?.env ?? {};
      expect(env.PATH || env.Path).toBeTruthy();
      expect(env.CUSTOM_FLAG).toBe('1');
      expect(env).not.toHaveProperty(sentinelKey);

      // Cwd: pinned under <userData>/mcp-runtimes/, and created on demand.
      const cwd = spawned?.cwd ?? '';
      expect(isInside(join(userDataDir, 'mcp-runtimes'), cwd)).toBe(true);
      expect(existsSync(cwd)).toBe(true);
    } finally {
      delete process.env[sentinelKey];
    }
  });

  it('ignores a renderer-supplied cwd and still pins the child under userData', async () => {
    const handlers = buildHandlers({ userDataDir, executableAllowlist: makeAllowlist() });

    await handlers.mcpTestConnection({
      transport: 'stdio',
      configJson: JSON.stringify({ command: fakeBinaryPath, cwd: tmpRoot }),
    });

    expect(stdioTransportCalls).toHaveLength(1);
    const cwd = stdioTransportCalls[0]?.cwd ?? '';
    expect(cwd).not.toBe(tmpRoot);
    expect(isInside(join(userDataDir, 'mcp-runtimes'), cwd)).toBe(true);
  });
});

/**
 * Behaviour the gate fix must leave alone. These two cases pin the existing
 * contract rather than a defect, so they pass before and after the fix.
 */
describe('IPC: mcp.testConnection — unchanged contract', () => {
  it('opens an SSE test connection to the configured url and reports the tool count', async () => {
    const handlers = buildHandlers({ userDataDir, executableAllowlist: makeAllowlist() });
    mockListTools.mockResolvedValueOnce({ tools: [{ name: 'search', inputSchema: {} }] });

    const result = await handlers.mcpTestConnection({
      transport: 'sse',
      configJson: JSON.stringify({ url: 'https://mcp.example.test/sse' }),
    });

    expect(result).toEqual({ ok: true, toolCount: 1 });
    expect(sseTransportCalls.map((url) => url.href)).toEqual(['https://mcp.example.test/sse']);
    expect(stdioTransportCalls).toEqual([]);
  });

  it('reports a failed connection as { ok: false, error } instead of throwing', async () => {
    const handlers = buildHandlers({ userDataDir, executableAllowlist: makeAllowlist() });
    mockConnect.mockRejectedValueOnce(new Error('spawn ENOENT'));

    const result = await handlers.mcpTestConnection({
      transport: 'stdio',
      configJson: JSON.stringify({ command: fakeBinaryPath }),
    });

    expect(result).toEqual({ ok: false, error: 'spawn ENOENT' });
  });
});

/**
 * A test connection owns the client it opens. For stdio the transport has
 * spawned a child by the time `connect` resolves, and `close` is what
 * terminates it, so every exit from the test has to close, not just the
 * successful one.
 */
describe('IPC: mcp.testConnection — closes the client it opened', () => {
  const STDIO_REQUEST = () => ({
    transport: 'stdio' as const,
    configJson: JSON.stringify({ command: fakeBinaryPath }),
  });

  it('closes the client when listTools fails after a successful connect, and reports that failure', async () => {
    const handlers = buildHandlers({ userDataDir, executableAllowlist: makeAllowlist() });
    mockListTools.mockRejectedValueOnce(new Error('tools/list timed out'));

    const result = await handlers.mcpTestConnection(STDIO_REQUEST());

    expect(result).toEqual({ ok: false, error: 'tools/list timed out' });
    // The child was started (transport built, connect resolved), so it must be closed.
    expect(stdioTransportCalls).toHaveLength(1);
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('closes the client when connect itself fails, and reports that failure', async () => {
    // The SDK stores the transport before starting it and does not await a
    // close on any connect failure, so the host closes here too.
    const handlers = buildHandlers({ userDataDir, executableAllowlist: makeAllowlist() });
    mockConnect.mockRejectedValueOnce(new Error('initialize timed out'));

    const result = await handlers.mcpTestConnection(STDIO_REQUEST());

    expect(result).toEqual({ ok: false, error: 'initialize timed out' });
    expect(mockListTools).not.toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('reports the earlier failure, not the close failure, when close fails too', async () => {
    const handlers = buildHandlers({ userDataDir, executableAllowlist: makeAllowlist() });
    const closeFailure = new Error('close failed');
    mockListTools.mockRejectedValueOnce(new Error('tools/list timed out'));
    mockClose.mockRejectedValue(closeFailure);
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {
      /* captured; asserted below */
    });
    try {
      const result = await handlers.mcpTestConnection(STDIO_REQUEST());

      expect(result).toEqual({ ok: false, error: 'tools/list timed out' });
      expect(mockClose).toHaveBeenCalledTimes(1);
      // The close failure is not lost: it is logged, just never returned.
      expect(errorLog).toHaveBeenCalledWith(
        expect.stringContaining('[mcp] test connection'),
        closeFailure,
      );
    } finally {
      errorLog.mockRestore();
      mockClose.mockResolvedValue(undefined);
    }
  });

  it('still reports a close failure when everything before it succeeded', async () => {
    // Unchanged behaviour, pinned because the fix makes close failures
    // conditional: only a failure with nothing in flight may surface.
    const handlers = buildHandlers({ userDataDir, executableAllowlist: makeAllowlist() });
    mockClose.mockRejectedValue(new Error('close failed'));
    try {
      const result = await handlers.mcpTestConnection(STDIO_REQUEST());

      expect(result).toEqual({ ok: false, error: 'close failed' });
      expect(mockClose).toHaveBeenCalledTimes(1);
    } finally {
      mockClose.mockResolvedValue(undefined);
    }
  });
});
