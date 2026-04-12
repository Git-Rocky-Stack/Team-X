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

    const transport =
      (config.transport as McpTransportType) === 'stdio'
        ? createStdioTransport(config.configJson)
        : createSseTransport(config.configJson);

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

  function createStdioTransport(configJson: string): StdioClientTransport {
    const config = JSON.parse(configJson) as {
      command: string;
      args?: string[];
      env?: Record<string, string>;
    };
    return new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: config.env,
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
