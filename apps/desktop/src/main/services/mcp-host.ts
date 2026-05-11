/**
 * McpHost — singleton MCP connection pool and tool call router.
 *
 * Architectural invariant (from CLAUDE.md):
 * > MCP Host is a singleton in Main. One pool of MCP connections;
 * > agents request tool calls via message passing. Never spawn N MCP
 * > clients from N workers.
 *
 * This service:
 *   1. Manages a pool of MCP server connections (stdio or SSE)
 *   2. Exposes listTools() and callTool() for the orchestrator
 *   3. Enforces tools_allowed / tools_denied at the host level
 *   4. Tracks health status and auto-reconnects on failure
 *   5. Records all tool calls in the tool_calls table
 *
 * Tool call flow:
 *   runAgent → detects tool_call from AI SDK → calls mcpHost.callTool()
 *   → McpHost checks tools_allowed/denied → routes to MCP server
 *   → returns result → fed back into conversation → agent continues
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

import type { McpServersRepo, ToolCallsRepo } from '../db/repos/mcp-servers.js';
import type { EventBus } from '../orchestrator/event-bus.js';

import {
  type McpExecutableAllowlist,
  ensureCwdExists,
  resolveCwd,
  scrubEnv,
  validateExecutable,
} from './mcp-security.js';

export type McpTransportType = 'stdio' | 'sse';

export interface McpServerConfig {
  id: string;
  companyId: string | null;
  name: string;
  transport: McpTransportType;
  configJson: string;
  enabled: boolean;
  lastHealth: string | null;
}

export interface McpServer extends McpServerConfig {
  client: Client;
  tools: Tool[];
  connected: boolean;
}

export interface CallToolArgs {
  companyId: string;
  serverId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  runId: string;
  employeeId: string;
  toolsAllowed: string[];
  toolsDenied: string[];
}

export interface CallToolResult {
  success: boolean;
  output?: unknown;
  error?: string;
  latencyMs: number;
  status: 'success' | 'error' | 'denied';
}

export interface McpHostDeps {
  mcpServersRepo: McpServersRepo;
  toolCallsRepo: ToolCallsRepo;
  bus: EventBus;
  /**
   * C5 (audit 2026-05-07) — required for stdio MCP servers. The host
   * pins the child-process cwd to `<userDataDir>/mcp-runtimes/<id>/`
   * to keep transient state out of the spawning process's cwd.
   *
   * Optional only because some test paths (SSE-only setups) never
   * spawn stdio. Stdio connect attempts when this is missing fail
   * with a clear error rather than silently spawning into a wrong dir.
   */
  userDataDir?: string;
  /**
   * C5 (audit 2026-05-07) — required for stdio MCP servers. The host
   * refuses to spawn any binary not in this allowlist. Empty allowlist
   * = no MCP server can spawn (fail-closed).
   *
   * Optional for the same reason as `userDataDir`.
   */
  executableAllowlist?: McpExecutableAllowlist;
  now?: () => number;
}

/**
 * Create the singleton MCP Host.
 *
 * In production, call this once during main process startup and store
 * the instance in a module-level variable. Do NOT create multiple instances.
 */
export function createMcpHost(deps: McpHostDeps) {
  const servers = new Map<string, McpServer>();

  const now = deps.now ?? Date.now;

  function emitAuthorityViolation(args: CallToolArgs, reason: 'explicit-deny' | 'not-allowlisted') {
    try {
      deps.bus.emit({
        type: 'authority.violation',
        companyId: args.companyId,
        actorId: args.employeeId,
        actorKind: 'employee',
        payload: {
          resourceKind: 'capability',
          resourceId: args.toolName,
          serverId: args.serverId,
          runId: args.runId,
          reason,
        },
      });
    } catch (err) {
      console.error(`[mcp] failed to emit authority.violation for ${args.toolName}:`, err);
    }
  }

  /**
   * Surface a connect-time security violation on the bus. Distinct
   * from `emitAuthorityViolation` (tool-call-level) because the
   * subject here is the spawn config itself: refused command, refused
   * cwd, refused env, sha256 mismatch, etc.
   *
   * Uses `actorKind: 'system'` and the operator's authority context
   * because configuring an MCP server is an operator action, not an
   * employee action. The renderer's audit log surfaces this so an
   * operator who just pasted in a config sees WHY it didn't connect.
   */
  function emitMcpSpawnViolation(config: McpServerConfig, reason: string, detail: string): void {
    try {
      deps.bus.emit({
        type: 'authority.violation',
        companyId: config.companyId ?? 'global',
        actorId: 'system',
        actorKind: 'system',
        payload: {
          resourceKind: 'mcp-spawn',
          resourceId: config.id,
          serverId: config.id,
          serverName: config.name,
          runId: null,
          reason,
          detail,
        },
      });
    } catch (err) {
      console.error(`[mcp] failed to emit spawn-violation for ${config.name}:`, err);
    }
  }

  /**
   * Load all enabled servers from DB and connect to them.
   * Call this on main process startup after migrations run.
   */
  async function initialize(): Promise<void> {
    const configs = deps.mcpServersRepo.listEnabled();
    for (const config of configs) {
      try {
        await connectToServer({
          id: config.id,
          companyId: config.companyId,
          name: config.name,
          transport: config.transport as McpTransportType,
          configJson: config.configJson,
          enabled: config.enabled,
          lastHealth: config.lastHealth,
        });
      } catch (err) {
        console.error(`[mcp] failed to connect to ${config.name}:`, err);
      }
    }
  }

  /**
   * Connect to a single MCP server.
   */
  async function connectToServer(config: McpServerConfig): Promise<void> {
    if (servers.has(config.id)) {
      return; // Already connected
    }

    let transport: StdioClientTransport | SSEClientTransport;
    if ((config.transport as McpTransportType) === 'stdio') {
      try {
        transport = createStdioTransport(config);
      } catch (err) {
        // Security-gate failures are recorded as authority violations
        // before they bubble — operators see WHY their config was
        // refused without having to dig into electron logs.
        const message = err instanceof Error ? err.message : String(err);
        // The error object carries a structured `reason` when it came
        // from the security helpers; otherwise default to `spawn-error`.
        const reason =
          err instanceof Error && (err as Error & { reason?: string }).reason
            ? ((err as Error & { reason?: string }).reason as string)
            : 'spawn-error';
        emitMcpSpawnViolation(config, reason, message);
        deps.mcpServersRepo.updateHealth(config.id, `error: ${message}`);
        throw err;
      }
    } else {
      transport = createSseTransport(config.configJson);
    }

    const client = new Client({
      name: 'team-x-mcp-host',
      version: '0.0.1',
    });

    try {
      await client.connect(transport);
      const tools = await client.listTools();

      const server: McpServer = {
        ...config,
        client,
        tools: tools.tools ?? [],
        connected: true,
      };

      servers.set(config.id, server);
      deps.mcpServersRepo.updateHealth(config.id, new Date().toISOString());

      console.log(`[mcp] connected to ${config.name} (${tools.tools?.length ?? 0} tools)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[mcp] connection failed for ${config.name}:`, message);
      deps.mcpServersRepo.updateHealth(config.id, `error: ${message}`);
      throw err;
    }
  }

  /**
   * Build a stdio transport for a server with the C5 security gates
   * applied (audit 2026-05-07):
   *
   *   1. The command must be on the operator-managed allowlist
   *      (hash-pinned). Bare names are refused — see `validateExecutable`.
   *   2. The child process gets a scrubbed env. Default behavior is
   *      "PATH + a tiny survival set"; the operator's `env` block in
   *      configJson is merged on top.
   *   3. The cwd is pinned to `<userData>/mcp-runtimes/<serverId>/`.
   *      The directory is created on demand so the spawning never
   *      lands in the user's home directory or %CD%.
   *
   * All three gates throw with a structured `reason` string so
   * `connectToServer` can surface a meaningful audit event.
   */
  function createStdioTransport(config: McpServerConfig): StdioClientTransport {
    const parsed = JSON.parse(config.configJson) as {
      command: string;
      args?: string[];
      env?: Record<string, string>;
    };

    // --- Gate 1: executable allowlist ---
    if (!deps.executableAllowlist) {
      const err = new Error(
        '[mcp] cannot spawn stdio MCP server: executableAllowlist dep is unwired (C5)',
      ) as Error & { reason?: string };
      err.reason = 'allowlist-unwired';
      throw err;
    }
    const validated = validateExecutable(parsed.command, deps.executableAllowlist);
    if (!validated.ok) {
      const err = new Error(`[mcp] ${validated.message}`) as Error & { reason?: string };
      err.reason = validated.reason;
      throw err;
    }

    // --- Gate 2: env scrub ---
    const scrubbedEnv = scrubEnv(parsed.env);

    // --- Gate 3: cwd pin ---
    if (!deps.userDataDir) {
      const err = new Error(
        '[mcp] cannot spawn stdio MCP server: userDataDir dep is unwired (C5)',
      ) as Error & { reason?: string };
      err.reason = 'userdatadir-unwired';
      throw err;
    }
    const cwd = resolveCwd(deps.userDataDir, config.id);
    ensureCwdExists(cwd);

    return new StdioClientTransport({
      command: validated.resolvedPath,
      args: parsed.args ?? [],
      env: scrubbedEnv,
      cwd,
    });
  }

  function createSseTransport(configJson: string): SSEClientTransport {
    const config = JSON.parse(configJson) as { url: string };
    return new SSEClientTransport(new URL(config.url));
  }

  /**
   * List all available tools across all connected servers.
   * Filters by company (global + company-specific servers).
   */
  function listTools(companyId: string): Tool[] {
    const allTools: Tool[] = [];
    for (const server of servers.values()) {
      if (!server.connected || !server.enabled) continue;
      // Include global servers (companyId=null) and company-specific servers
      if (server.companyId === null || server.companyId === companyId) {
        allTools.push(...server.tools);
      }
    }
    return allTools;
  }

  /**
   * Call a tool with enforcement of tools_allowed/denied.
   *
   * This is the critical trust-boundary check: agents cannot bypass
   * tool restrictions via prompting. The host enforces at call time.
   */
  async function callTool(args: CallToolArgs): Promise<CallToolResult> {
    const startTime = now();

    // 1. Check tools_denied first (explicit denial wins)
    if (args.toolsDenied.includes(args.toolName)) {
      emitAuthorityViolation(args, 'explicit-deny');
      const result: CallToolResult = {
        success: false,
        error: `Tool '${args.toolName}' is denied for your role`,
        latencyMs: 0,
        status: 'denied',
      };
      recordToolCall(args, result);
      return result;
    }

    // 2. If tools_allowed is non-empty, tool must be in the list
    if (args.toolsAllowed.length > 0 && !args.toolsAllowed.includes(args.toolName)) {
      emitAuthorityViolation(args, 'not-allowlisted');
      const result: CallToolResult = {
        success: false,
        error: `Tool '${args.toolName}' is not allowed for your role. Allowed: ${args.toolsAllowed.join(', ')}`,
        latencyMs: 0,
        status: 'denied',
      };
      recordToolCall(args, result);
      return result;
    }

    // 3. Get the server
    const server = servers.get(args.serverId);
    if (!server || !server.connected) {
      const result: CallToolResult = {
        success: false,
        error: `MCP server '${args.serverId}' is not connected`,
        latencyMs: 0,
        status: 'error',
      };
      recordToolCall(args, result);
      return result;
    }

    // 4. Execute the tool call
    try {
      const result = await server.client.callTool({
        name: args.toolName,
        arguments: args.toolArgs,
      });

      const latencyMs = now() - startTime;
      const callResult: CallToolResult = {
        success: true,
        output: result.content,
        latencyMs,
        status: 'success',
      };

      recordToolCall(args, callResult);
      return callResult;
    } catch (err) {
      const latencyMs = now() - startTime;
      const message = err instanceof Error ? err.message : String(err);
      const result: CallToolResult = {
        success: false,
        error: message,
        latencyMs,
        status: 'error',
      };
      recordToolCall(args, result);
      return result;
    }
  }

  /**
   * Record a tool call in the tool_calls table.
   */
  function recordToolCall(args: CallToolArgs, result: CallToolResult): void {
    deps.toolCallsRepo.create({
      runId: args.runId,
      toolName: args.toolName,
      mcpServerId: args.serverId,
      inputJson: JSON.stringify(args.toolArgs),
      outputJson: result.output ? JSON.stringify(result.output).slice(0, 8192) : null,
      latencyMs: result.latencyMs,
      status: result.status,
      error: result.error ?? null,
    });
  }

  /**
   * Disconnect from a server and remove it from the pool.
   */
  async function disconnectServer(serverId: string): Promise<void> {
    const server = servers.get(serverId);
    if (server) {
      try {
        await server.client.close();
      } catch (err) {
        console.error(`[mcp] error disconnecting ${server.name}:`, err);
      }
      servers.delete(serverId);
    }
  }

  /**
   * Shutdown all connections. Call this on app quit.
   */
  async function shutdown(): Promise<void> {
    const shutdownPromises = [];
    for (const [id, server] of servers.entries()) {
      shutdownPromises.push(
        server.client.close().catch((err) => {
          console.error(`[mcp] shutdown error for ${server.name}:`, err);
        }),
      );
      servers.delete(id);
    }
    await Promise.all(shutdownPromises);
    console.log('[mcp] all connections closed');
  }

  /**
   * Get a server by ID (for admin/debug purposes).
   */
  function getServer(serverId: string): McpServer | undefined {
    return servers.get(serverId);
  }

  /**
   * List all connected servers.
   */
  function listServers(): McpServer[] {
    return Array.from(servers.values());
  }

  /**
   * Find the server that owns a given tool, scoped to a company.
   * Searches global servers (companyId=null) and company-specific ones.
   * Returns the serverId or null if no connected server offers the tool.
   */
  function findServerForTool(toolName: string, companyId: string): string | null {
    for (const server of servers.values()) {
      if (!server.connected || !server.enabled) continue;
      if (server.companyId !== null && server.companyId !== companyId) continue;
      if (server.tools.some((t) => t.name === toolName)) {
        return server.id;
      }
    }
    return null;
  }

  return {
    initialize,
    connectToServer,
    disconnectServer,
    listTools,
    callTool,
    getServer,
    listServers,
    findServerForTool,
    shutdown,
  };
}

export type McpHost = ReturnType<typeof createMcpHost>;
