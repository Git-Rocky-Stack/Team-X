import type { ExtensionRow, ExtensionsRepo } from '../db/repos/extensions.js';
import type { McpServerRow, McpServersRepo } from '../db/repos/mcp-servers.js';

export interface ExtensionsRegistryServiceDeps {
  extensionsRepo: ExtensionsRepo;
  mcpServersRepo: McpServersRepo;
}

type BridgeSourceKind = 'local' | 'github' | 'marketplace' | 'template';

export interface SyncMcpServerOptions {
  sourceKind?: BridgeSourceKind;
  sourceRef?: string;
  manifestPatch?: Record<string, unknown>;
}

export interface ExtensionsRegistryService {
  listByCompany(companyId: string): ExtensionRow[];
  backfillMcpServers(): number;
  syncMcpServer(serverId: string, options?: SyncMcpServerOptions): ExtensionRow | null;
  removeMcpServer(serverId: string): ExtensionRow | null;
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

function parseManifestJson(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore malformed persisted manifest metadata.
  }
  return {};
}

function buildManifestJson(
  row: McpServerRow,
  existing: ExtensionRow | null,
  options?: SyncMcpServerOptions,
): string {
  return JSON.stringify({
    ...parseManifestJson(existing?.manifestJson ?? null),
    bridgeKind: 'mcp-server',
    transport: row.transport,
    runtimeServerId: row.id,
    lastHealth: row.lastHealth,
    ...options?.manifestPatch,
  });
}

function inferSourceKind(row: McpServerRow): 'local' | 'template' {
  return row.companyId === null ? 'template' : 'local';
}

function normalizeSourceKind(value: string | null | undefined): BridgeSourceKind | null {
  return value === 'local' || value === 'github' || value === 'marketplace' || value === 'template'
    ? value
    : null;
}

function resolveSourceKind(
  row: McpServerRow,
  existing: ExtensionRow | null,
  options?: SyncMcpServerOptions,
): BridgeSourceKind {
  if (options?.sourceKind) return options.sourceKind;
  const inferred = inferSourceKind(row);
  const existingSourceKind = normalizeSourceKind(existing?.sourceKind);
  if (existingSourceKind && existingSourceKind !== inferred) {
    return existingSourceKind;
  }
  return inferred;
}

function resolveSourceRef(
  row: McpServerRow,
  existing: ExtensionRow | null,
  options?: SyncMcpServerOptions,
): string {
  if (options?.sourceRef) return options.sourceRef;
  const inferred = inferSourceKind(row);
  const existingSourceKind = normalizeSourceKind(existing?.sourceKind);
  if (existing && existingSourceKind && existingSourceKind !== inferred) {
    return existing.sourceRef;
  }
  return summarizeSourceRef(row);
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
  function syncRow(row: McpServerRow, options?: SyncMcpServerOptions): ExtensionRow {
    const existing = deps.extensionsRepo.findByRuntimeRefId(row.id);
    const sourceKind = resolveSourceKind(row, existing, options);
    const sourceRef = resolveSourceRef(row, existing, options);
    const requestedCapabilitiesJson = JSON.stringify(buildRequestedCapabilities(row));
    const manifestJson = buildManifestJson(row, existing, options);
    const trustState = inferTrustState(row, existing);

    if (existing) {
      deps.extensionsRepo.update(existing.id, {
        companyId: row.companyId,
        name: row.name,
        sourceKind,
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
      sourceKind,
      sourceRef,
      manifestJson,
      requestedCapabilitiesJson,
      requestedPathsJson: '[]',
      enabled: row.enabled,
      trustState,
      runtimeRefId: row.id,
    });
    const extension = deps.extensionsRepo.getById(extensionId);
    if (!extension) {
      throw new Error(`[extensions-registry] failed to read bridged extension ${extensionId}`);
    }
    return extension;
  }

  return {
    listByCompany(companyId: string): ExtensionRow[] {
      for (const row of deps.mcpServersRepo.listByCompany(companyId)) {
        syncRow(row);
      }
      return deps.extensionsRepo.listByCompany(companyId);
    },

    backfillMcpServers(): number {
      let synced = 0;
      for (const row of deps.mcpServersRepo.list()) {
        syncRow(row);
        synced += 1;
      }
      return synced;
    },

    syncMcpServer(serverId: string, options?: SyncMcpServerOptions): ExtensionRow | null {
      const row = deps.mcpServersRepo.getById(serverId);
      if (!row) return null;
      return syncRow(row, options);
    },

    removeMcpServer(serverId: string): ExtensionRow | null {
      const existing = deps.extensionsRepo.findByRuntimeRefId(serverId);
      if (!existing) return null;
      deps.extensionsRepo.delete(existing.id);
      return existing;
    },
  };
}

export type ExtensionsRegistryServiceType = ReturnType<typeof createExtensionsRegistryService>;
