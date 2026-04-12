/**
 * Repositories for MCP servers and tool calls.
 */

import { eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import type { getDb } from '../client.js';
import { mcpServers, toolCalls } from '../schema.js';

type DB = ReturnType<typeof getDb>;

export interface McpServerRow {
  id: string;
  companyId: string | null;
  name: string;
  transport: string;
  configJson: string;
  enabled: boolean;
  lastHealth: string | null;
  installedAt: number;
}

export interface CreateMcpServerInput {
  companyId: string | null;
  name: string;
  transport: 'stdio' | 'sse';
  configJson: string;
}

export interface CreateToolCallInput {
  runId: string;
  toolName: string;
  mcpServerId: string | null;
  inputJson: string;
  outputJson: string | null;
  latencyMs: number;
  status: 'success' | 'error' | 'denied';
  error: string | null;
}

export function createMcpServersRepo(db: DB) {
  return {
    create(input: CreateMcpServerInput): string {
      const id = nanoid();
      db.insert(mcpServers)
        .values({
          id,
          companyId: input.companyId,
          name: input.name,
          transport: input.transport,
          configJson: input.configJson,
          enabled: true,
          installedAt: Date.now(),
        })
        .run();
      return id;
    },

    getById(id: string): McpServerRow | null {
      const row = db.select().from(mcpServers).where(eq(mcpServers.id, id)).get();
      return row ?? null;
    },

    list(): McpServerRow[] {
      return db.select().from(mcpServers).all();
    },

    listEnabled(): McpServerRow[] {
      return db.select().from(mcpServers).where(eq(mcpServers.enabled, true)).all();
    },

    listByCompany(companyId: string): McpServerRow[] {
      // Return global servers (companyId=null) + company-specific servers
      return db
        .select()
        .from(mcpServers)
        .where(eq(mcpServers.companyId, companyId))
        .all()
        .concat(db.select().from(mcpServers).where(isNull(mcpServers.companyId)).all());
    },

    updateEnabled(id: string, enabled: boolean): void {
      db.update(mcpServers).set({ enabled }).where(eq(mcpServers.id, id)).run();
    },

    updateHealth(id: string, lastHealth: string): void {
      db.update(mcpServers).set({ lastHealth }).where(eq(mcpServers.id, id)).run();
    },

    delete(id: string): void {
      db.delete(mcpServers).where(eq(mcpServers.id, id)).run();
    },
  };
}

export type McpServersRepo = ReturnType<typeof createMcpServersRepo>;

export function createToolCallsRepo(db: DB) {
  return {
    create(input: CreateToolCallInput): string {
      const id = nanoid();
      db.insert(toolCalls)
        .values({
          id,
          runId: input.runId,
          toolName: input.toolName,
          mcpServerId: input.mcpServerId,
          inputJson: input.inputJson,
          outputJson: input.outputJson,
          latencyMs: input.latencyMs,
          status: input.status,
          error: input.error,
          createdAt: Date.now(),
        })
        .run();
      return id;
    },

    listByRun(runId: string) {
      return db.select().from(toolCalls).where(eq(toolCalls.runId, runId)).all();
    },
  };
}

export type ToolCallsRepo = ReturnType<typeof createToolCallsRepo>;

// ---------------------------------------------------------------------------
// Default MCP server seeds
// ---------------------------------------------------------------------------

interface DefaultMcpServer {
  name: string;
  transport: 'stdio' | 'sse';
  configJson: string;
}

/**
 * Well-known MCP servers from the Strategia stack. Seeded as global
 * servers (companyId=null) with enabled=false so they appear in the
 * settings UI as ready-to-enable templates. Users enable after
 * installing the corresponding MCP server on their machine.
 */
const DEFAULT_MCP_SERVERS: DefaultMcpServer[] = [
  {
    name: 'Context7',
    transport: 'stdio',
    configJson: JSON.stringify({
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp@latest'],
    }),
  },
  {
    name: 'Supabase',
    transport: 'stdio',
    configJson: JSON.stringify({
      command: 'npx',
      args: ['-y', 'supabase-mcp-server@latest'],
    }),
  },
];

/**
 * Seed default MCP servers on first boot. Idempotent — only inserts
 * when the mcp_servers table is empty.
 */
export function seedDefaultMcpServers(db: DB): number {
  const existing = db.select().from(mcpServers).all();
  if (existing.length > 0) return 0;

  const now = Date.now();
  for (const server of DEFAULT_MCP_SERVERS) {
    db.insert(mcpServers)
      .values({
        id: nanoid(),
        companyId: null,
        name: server.name,
        transport: server.transport,
        configJson: server.configJson,
        enabled: false,
        installedAt: now,
      })
      .run();
  }
  return DEFAULT_MCP_SERVERS.length;
}
