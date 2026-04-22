import type { ExtensionRow, ExtensionsRepo } from '../db/repos/extensions.js';
import type { McpServerRow, McpServersRepo } from '../db/repos/mcp-servers.js';

export interface ExtensionsRegistryServiceDeps {
  extensionsRepo: ExtensionsRepo;
  mcpServersRepo: McpServersRepo;
}

export interface ExtensionsRegistryService {
  listByCompany(companyId: string): ExtensionRow[];
  syncMcpServer(serverId: string): ExtensionRow | null;
  removeMcpServer(serverId: string): void;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function summarizeSourceRef(row: McpServerRow): string {
  try {
    const parsed = JSON.parse(row.configJson) as {
      command?: string;
      args?: string[];
      url?: string;
    };
    if (row.transport === 'stdio') {
      const command = typeof parsed.command === 'string' ? parsed.command : 'stdio';
      const args = Array.isArray(parsed.args)
        ? parsed.args.filter((value): value is string => typeof value === 'string')
        : [];
      return [command, ...args].join(' ').trim();
    }
    if (typeof parsed.url === 'string' && parsed.url.length > 0) {
      return parsed.url;
    }
  } catch {
    // Fall through to runtime bridge summary.
  }
  return `runtime://${row.transport}/${row.id}`;
}

function buildRequestedCapabilities(row: McpServerRow): string[] {
  const capabilities = new Set<string>(['mcp.call']);
  if (row.transport === 'stdio') {
    capabilities.add('process.spawn');
  } else {
    capabilities.add('network');
  }
  return Array.from(capabilities).sort();
}

function buildManifestJson(row: McpServerRow): string {
  return JSON.stringify({
    bridgeKind: 'mcp-server',
    transport: row.transport,
    runtimeServerId: row.id,
    lastHealth: row.lastHealth,
  });
}

function inferSourceKind(row: McpServerRow): 'local' | 'template' {
  return row.companyId === null ? 'template' : 'local';
}

function inferTrustState(
  row: McpServerRow,
  existing: ExtensionRow | null,
): 'trusted' | 'pending-review' | 'denied' {
  if (existing?.trustState === 'denied') return 'denied';
  if (existing?.trustState === 'trusted') return 'trusted';
  return row.enabled ? 'trusted' : 'pending-review';
}

export function createExtensionsRegistryService(
  deps: ExtensionsRegistryServiceDeps,
): ExtensionsRegistryService {
  function syncRow(row: McpServerRow): ExtensionRow {
    const existing = deps.extensionsRepo.findByRuntimeRefId(row.id);
    const sourceRef = summarizeSourceRef(row);
    const requestedCapabilitiesJson = JSON.stringify(buildRequestedCapabilities(row));
    const manifestJson = buildManifestJson(row);
    const trustState = inferTrustState(row, existing);

    if (existing) {
      deps.extensionsRepo.update(existing.id, {
        companyId: row.companyId,
        name: row.name,
        sourceRef,
        manifestJson,
        requestedCapabilitiesJson,
        requestedPathsJson: '[]',
        enabled: row.enabled,
        trustState,
        runtimeRefId: row.id,
      });
      return deps.extensionsRepo.getById(existing.id) ?? existing;
    }

    const extensionId = deps.extensionsRepo.create({
      companyId: row.companyId,
      kind: 'mcp',
      name: row.name,
      slug: `mcp-${slugify(row.name)}-${row.id.slice(0, 6)}`,
      sourceKind: inferSourceKind(row),
      sourceRef,
      manifestJson,
      requestedCapabilitiesJson,
      requestedPathsJson: '[]',
      enabled: row.enabled,
      trustState,
      runtimeRefId: row.id,
    });
    return deps.extensionsRepo.getById(extensionId)!;
  }

  return {
    listByCompany(companyId: string): ExtensionRow[] {
      for (const row of deps.mcpServersRepo.listByCompany(companyId)) {
        syncRow(row);
      }
      return deps.extensionsRepo.listByCompany(companyId);
    },

    syncMcpServer(serverId: string): ExtensionRow | null {
      const row = deps.mcpServersRepo.getById(serverId);
      if (!row) return null;
      return syncRow(row);
    },

    removeMcpServer(serverId: string): void {
      const existing = deps.extensionsRepo.findByRuntimeRefId(serverId);
      if (!existing) return;
      deps.extensionsRepo.delete(existing.id);
    },
  };
}

export type ExtensionsRegistryServiceType = ReturnType<typeof createExtensionsRegistryService>;
