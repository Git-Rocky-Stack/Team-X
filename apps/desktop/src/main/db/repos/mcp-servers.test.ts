import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { companies } from '../schema.js';
import { type TestDbHandle, makeTestDb } from '../test-helpers.js';
import { createMcpServersRepo, seedDefaultMcpServers } from './mcp-servers.js';

let ctx: TestDbHandle;
let mcpServersRepo: ReturnType<typeof createMcpServersRepo>;

beforeEach(async () => {
  ctx = await makeTestDb();
  mcpServersRepo = createMcpServersRepo(ctx.db);
  ctx.db
    .insert(companies)
    .values({
      id: 'company-1',
      name: 'Alpha',
      slug: 'alpha',
      createdAt: 1,
      settingsJson: '{}',
      icon: null,
      theme: 'dark',
      status: 'running',
    })
    .run();
});

afterEach(() => ctx.close());

describe('mcp servers repo', () => {
  it('lists company runtime rows plus enabled global rows, but excludes disabled templates', () => {
    const workspaceServerId = mcpServersRepo.create({
      companyId: 'company-1',
      name: 'Workspace MCP',
      transport: 'stdio',
      configJson: JSON.stringify({ command: 'workspace-mcp' }),
    });
    const disabledTemplateId = mcpServersRepo.create({
      companyId: null,
      name: 'Disabled Template',
      transport: 'stdio',
      configJson: JSON.stringify({ command: 'disabled-template' }),
    });
    mcpServersRepo.updateEnabled(disabledTemplateId, false);
    const enabledGlobalId = mcpServersRepo.create({
      companyId: null,
      name: 'Enabled Global',
      transport: 'sse',
      configJson: JSON.stringify({ url: 'https://example.com/sse' }),
    });

    const rows = mcpServersRepo.listRuntimeByCompany('company-1');

    expect(rows.map((row) => row.id)).toEqual(
      expect.arrayContaining([workspaceServerId, enabledGlobalId]),
    );
    expect(rows.some((row) => row.id === disabledTemplateId)).toBe(false);
  });

  it('seeds only missing built-in templates instead of requiring an empty table', () => {
    mcpServersRepo.create({
      companyId: 'company-1',
      name: 'Workspace MCP',
      transport: 'stdio',
      configJson: JSON.stringify({ command: 'workspace-mcp' }),
    });
    mcpServersRepo.create({
      companyId: null,
      name: 'Context7',
      transport: 'stdio',
      configJson: JSON.stringify({ command: 'npx', args: ['-y', '@upstash/context7-mcp@latest'] }),
    });

    const inserted = seedDefaultMcpServers(ctx.db);
    const templates = mcpServersRepo.listTemplates();

    expect(inserted).toBe(1);
    expect(templates.map((row) => row.name).sort()).toEqual(['Context7', 'Supabase']);
  });
});
