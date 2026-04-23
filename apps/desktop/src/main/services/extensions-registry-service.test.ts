import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import type { TestDbHandle } from '../db/test-helpers.js';
import { makeTestDb } from '../db/test-helpers.js';
import { companies, mcpServers } from '../db/schema.js';
import { createExtensionsRepo } from '../db/repos/extensions.js';
import { createMcpServersRepo } from '../db/repos/mcp-servers.js';

import { createExtensionsRegistryService } from './extensions-registry-service.js';

let ctx: TestDbHandle;

beforeEach(async () => {
  ctx = await makeTestDb();
  ctx.db
    .insert(companies)
    .values([
      {
        id: 'company-1',
        name: 'Alpha',
        slug: 'alpha',
        createdAt: 1,
        settingsJson: '{}',
        icon: null,
        theme: 'dark',
        status: 'running',
      },
      {
        id: 'company-2',
        name: 'Beta',
        slug: 'beta',
        createdAt: 2,
        settingsJson: '{}',
        icon: null,
        theme: 'dark',
        status: 'running',
      },
    ])
    .run();
});

afterEach(() => ctx.close());

describe('extensions registry service', () => {
  it('bridges runtime MCP rows into extension metadata on list', () => {
    const extensionsRepo = createExtensionsRepo(ctx.db);
    const mcpServersRepo = createMcpServersRepo(ctx.db);
    const registry = createExtensionsRegistryService({
      extensionsRepo,
      mcpServersRepo,
    });

    mcpServersRepo.create({
      companyId: 'company-1',
      name: 'Filesystem Bridge',
      transport: 'stdio',
      configJson: JSON.stringify({
        command: 'npx',
        args: ['-y', '@team-x/filesystem-mcp'],
      }),
    });

    const serverId = mcpServersRepo.create({
      companyId: null,
      name: 'Context7',
      transport: 'sse',
      configJson: JSON.stringify({
        url: 'https://mcp.context7.com/sse',
      }),
    });
    mcpServersRepo.updateEnabled(serverId, false);

    const rows = registry.listByCompany('company-1').filter((row) => row.kind === 'mcp');

    expect(rows).toHaveLength(2);
    const localBridge = rows.find((row) => row.companyId === 'company-1');
    const globalBridge = rows.find((row) => row.companyId === null);
    expect(localBridge).toMatchObject({
      kind: 'mcp',
      sourceKind: 'local',
      enabled: true,
      trustState: 'trusted',
    });
    expect(localBridge?.sourceRef).toContain('npx');
    expect(localBridge?.runtimeRefId).toBeTruthy();
    expect(localBridge?.requestedCapabilitiesJson).toContain('mcp.call');
    expect(localBridge?.requestedCapabilitiesJson).toContain('process.spawn');
    expect(globalBridge).toMatchObject({
      kind: 'mcp',
      sourceKind: 'template',
      enabled: false,
      trustState: 'pending-review',
    });
    expect(globalBridge?.sourceRef).toContain('https://mcp.context7.com/sse');
    expect(globalBridge?.requestedCapabilitiesJson).toContain('network');
  });

  it('updates an existing bridge when the runtime server changes', () => {
    const extensionsRepo = createExtensionsRepo(ctx.db);
    const mcpServersRepo = createMcpServersRepo(ctx.db);
    const registry = createExtensionsRegistryService({
      extensionsRepo,
      mcpServersRepo,
    });

    const serverId = mcpServersRepo.create({
      companyId: 'company-1',
      name: 'Legacy Bridge',
      transport: 'stdio',
      configJson: JSON.stringify({ command: 'legacy-mcp' }),
    });

    const first = registry.syncMcpServer(serverId);
    expect(first?.name).toBe('Legacy Bridge');

    ctx.db
      .update(mcpServers)
      .set({
        name: 'Renamed Bridge',
        transport: 'sse',
        configJson: JSON.stringify({ url: 'https://example.com/sse' }),
        enabled: false,
        lastHealth: 'error: unreachable',
      })
      .where(eq(mcpServers.id, serverId))
      .run();

    const updated = registry.syncMcpServer(serverId);

    expect(updated?.id).toBe(first?.id);
    expect(updated).toMatchObject({
      name: 'Renamed Bridge',
      enabled: false,
    });
    expect(updated?.sourceRef).toBe('https://example.com/sse');
    expect(updated?.manifestJson).toContain('error: unreachable');
    expect(updated?.requestedCapabilitiesJson).toContain('network');
  });

  it('preserves template provenance for company-installed template bridges', () => {
    const extensionsRepo = createExtensionsRepo(ctx.db);
    const mcpServersRepo = createMcpServersRepo(ctx.db);
    const registry = createExtensionsRegistryService({
      extensionsRepo,
      mcpServersRepo,
    });

    const serverId = mcpServersRepo.create({
      companyId: 'company-1',
      name: 'Context7',
      transport: 'stdio',
      configJson: JSON.stringify({ command: 'npx', args: ['-y', '@upstash/context7-mcp@latest'] }),
    });

    const installed = registry.syncMcpServer(serverId, {
      sourceKind: 'template',
      sourceRef: 'Built-in template · Context7',
      manifestPatch: {
        templateId: 'template-context7',
        templateName: 'Context7',
      },
    });

    expect(installed).toMatchObject({
      sourceKind: 'template',
      sourceRef: 'Built-in template · Context7',
    });

    ctx.db
      .update(mcpServers)
      .set({
        lastHealth: 'error: missing package',
      })
      .where(eq(mcpServers.id, serverId))
      .run();

    const resynced = registry.syncMcpServer(serverId);

    expect(resynced).toMatchObject({
      sourceKind: 'template',
      sourceRef: 'Built-in template · Context7',
    });
    expect(resynced?.manifestJson).toContain('template-context7');
    expect(resynced?.manifestJson).toContain('missing package');
  });

  it('removes the bridge extension when the runtime server is deleted', () => {
    const extensionsRepo = createExtensionsRepo(ctx.db);
    const mcpServersRepo = createMcpServersRepo(ctx.db);
    const registry = createExtensionsRegistryService({
      extensionsRepo,
      mcpServersRepo,
    });

    const serverId = mcpServersRepo.create({
      companyId: 'company-1',
      name: 'Disposable Bridge',
      transport: 'stdio',
      configJson: JSON.stringify({ command: 'disposable-mcp' }),
    });
    const bridged = registry.syncMcpServer(serverId);

    expect(bridged).not.toBeNull();
    registry.removeMcpServer(serverId);

    expect(extensionsRepo.findByRuntimeRefId(serverId)).toBeNull();
  });

  it('backfills every existing MCP row into extension metadata at startup', () => {
    const extensionsRepo = createExtensionsRepo(ctx.db);
    const mcpServersRepo = createMcpServersRepo(ctx.db);
    const registry = createExtensionsRegistryService({
      extensionsRepo,
      mcpServersRepo,
    });

    mcpServersRepo.create({
      companyId: 'company-1',
      name: 'Workspace Bridge',
      transport: 'stdio',
      configJson: JSON.stringify({ command: 'workspace-mcp' }),
    });
    mcpServersRepo.create({
      companyId: null,
      name: 'Context7',
      transport: 'sse',
      configJson: JSON.stringify({ url: 'https://mcp.context7.com/sse' }),
    });

    expect(registry.backfillMcpServers()).toBe(2);
    expect(extensionsRepo.listByCompany('company-1').filter((row) => row.kind === 'mcp')).toHaveLength(2);
  });
});
