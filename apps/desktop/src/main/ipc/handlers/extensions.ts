/**
 * IPC handlers — MCP servers, installed extensions, and authority grants and
 * requests.
 * Split from handlers.ts by bounded context (audit 2026-10-07 P1-7).
 */
import type { HandlerContext } from './context.js';
import type { IpcHandlers } from './contract.js';
import {
  assertCompanyActive,
  getManifestStringValue,
  rowToAuthorityGrant,
  rowToAuthorityRequest,
  rowToExtensionSummary,
  skillSourceKindFromUrl,
} from './mappers.js';

export type ExtensionsHandlers = Pick<
  IpcHandlers,
  | 'mcpList'
  | 'mcpListTemplates'
  | 'mcpToggle'
  | 'mcpAddServer'
  | 'mcpInstallTemplate'
  | 'mcpRemoveServer'
  | 'mcpTestConnection'
  | 'extensionsList'
  | 'extensionsInstallLocalSkill'
  | 'extensionsInstallGithubSkill'
  | 'extensionsRemoveSkill'
  | 'extensionsListSkillAssignments'
  | 'extensionsUpsertSkillAssignment'
  | 'extensionsDeleteSkillAssignment'
  | 'authorityList'
  | 'authorityListRequests'
  | 'authorityCreate'
  | 'authorityDelete'
  | 'authorityReviewRequest'
  | 'authorityGetEffective'
>;

export function createExtensionsHandlers(ctx: HandlerContext): ExtensionsHandlers {
  const {
    companiesRepo,
    employeesRepo,
    mcpHost,
    mcpServersRepo,
    extensionsRegistry,
    skillsService,
    authorityRepo,
    authorityResolver,
    emitUserAuditEvent,
    handlers,
  } = ctx;
  return {
    // -----------------------------------------------------------------------
    // MCP management handlers
    // -----------------------------------------------------------------------

    async mcpList({ companyId: _companyId }) {
      const companyId = _companyId;
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] mcp.list: companyId is required');
      }
      const servers = mcpServersRepo.listRuntimeByCompany(companyId);
      return servers.map((server) => {
        const connected = mcpHost.getServer(server.id);
        return {
          id: server.id,
          companyId: server.companyId,
          name: server.name,
          transport: server.transport as 'stdio' | 'sse',
          enabled: server.enabled,
          lastHealth: server.lastHealth,
          toolCount: connected?.tools.length ?? 0,
        };
      });
    },

    async mcpListTemplates({ companyId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] mcp.listTemplates: companyId is required');
      }

      const extensions = extensionsRegistry
        ? extensionsRegistry.listByCompany(companyId).map(rowToExtensionSummary)
        : [];
      const templateExtensionsByRuntimeRefId = new Map(
        extensions
          .filter((extension) => extension.kind === 'mcp' && extension.companyId === null)
          .flatMap((extension) =>
            extension.runtimeRefId ? [[extension.runtimeRefId, extension] as const] : [],
          ),
      );
      const installedServerIdByTemplateId = new Map(
        extensions
          .filter((extension) => extension.kind === 'mcp' && extension.companyId === companyId)
          .flatMap((extension) => {
            const templateId = getManifestStringValue(extension.manifest, 'templateId');
            const runtimeRefId = extension.runtimeRefId;
            if (!templateId || !runtimeRefId) return [];
            return [[templateId, runtimeRefId] as const];
          }),
      );

      return mcpServersRepo.listTemplates().map((template) => {
        const extension = templateExtensionsByRuntimeRefId.get(template.id);
        return {
          id: template.id,
          name: template.name,
          transport: template.transport as 'stdio' | 'sse',
          sourceRef: extension?.sourceRef ?? template.name,
          lastHealth: template.lastHealth,
          requestedCapabilities: extension?.requestedCapabilities ?? [],
          installed: installedServerIdByTemplateId.has(template.id),
          installedServerId: installedServerIdByTemplateId.get(template.id) ?? null,
        };
      });
    },

    async mcpToggle({ serverId, enabled }) {
      const config = mcpServersRepo.getById(serverId);
      if (!config) {
        throw new Error(`[ipc] mcp.toggle: server config not found: ${serverId}`);
      }
      const server = mcpHost.getServer(serverId);

      if (enabled && !server?.connected) {
        // Reconnect
        await mcpHost.connectToServer({
          id: config.id,
          companyId: config.companyId,
          name: config.name,
          transport: config.transport as 'stdio' | 'sse',
          configJson: config.configJson,
          // The row still says disabled — it is updated below. The host skips
          // disabled servers in `listTools`, so passing the stale value would
          // start the process while hiding its tools until the next launch.
          enabled: true,
          lastHealth: config.lastHealth,
        });
      } else if (!enabled && server?.connected) {
        // Disconnect
        await mcpHost.disconnectServer(serverId);
      }

      mcpServersRepo.updateEnabled(serverId, enabled);
      extensionsRegistry?.syncMcpServer(serverId);
      if (config.companyId) {
        emitUserAuditEvent('mcp.toggled', config.companyId, {
          serverId: config.id,
          name: config.name,
          enabled,
          transport: config.transport,
        });
      }
    },

    async mcpAddServer({ companyId, name, transport, configJson }) {
      const serverId = mcpServersRepo.create({
        companyId,
        name,
        transport,
        configJson,
      });

      // Try to connect immediately
      const config = mcpServersRepo.getById(serverId);
      if (config) {
        await mcpHost
          .connectToServer({
            id: config.id,
            companyId: config.companyId,
            name: config.name,
            transport: config.transport as 'stdio' | 'sse',
            configJson: config.configJson,
            enabled: config.enabled,
            lastHealth: config.lastHealth,
          })
          .catch((err) => {
            console.error(`[ipc] mcp.addServer: failed to connect to ${name}:`, err);
          });
      }

      extensionsRegistry?.syncMcpServer(serverId);
      if (companyId) {
        emitUserAuditEvent('mcp.added', companyId, {
          serverId,
          name,
          transport,
          sourceKind: 'manual',
        });
      }

      return { serverId };
    },

    async mcpInstallTemplate({ companyId, templateId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] mcp.installTemplate: companyId is required');
      }
      if (typeof templateId !== 'string' || templateId.length === 0) {
        throw new Error('[ipc] mcp.installTemplate: templateId is required');
      }

      const template = mcpServersRepo.getById(templateId);
      if (!template || template.companyId !== null) {
        throw new Error(`[ipc] mcp.installTemplate: template not found: ${templateId}`);
      }

      const existingInstall = extensionsRegistry
        ?.listByCompany(companyId)
        .map(rowToExtensionSummary)
        .find(
          (extension) =>
            extension.kind === 'mcp' &&
            extension.companyId === companyId &&
            getManifestStringValue(extension.manifest, 'templateId') === templateId &&
            extension.runtimeRefId,
        );
      if (existingInstall?.runtimeRefId) {
        return { serverId: existingInstall.runtimeRefId };
      }

      const serverId = mcpServersRepo.create({
        companyId,
        name: template.name,
        transport: template.transport as 'stdio' | 'sse',
        configJson: template.configJson,
      });

      const config = mcpServersRepo.getById(serverId);
      if (config) {
        await mcpHost
          .connectToServer({
            id: config.id,
            companyId: config.companyId,
            name: config.name,
            transport: config.transport as 'stdio' | 'sse',
            configJson: config.configJson,
            enabled: config.enabled,
            lastHealth: config.lastHealth,
          })
          .catch((err) => {
            console.error(
              `[ipc] mcp.installTemplate: failed to connect template ${template.name}:`,
              err,
            );
          });
      }

      const templateExtension = extensionsRegistry
        ?.listByCompany(companyId)
        .map(rowToExtensionSummary)
        .find((extension) => extension.kind === 'mcp' && extension.runtimeRefId === template.id);

      extensionsRegistry?.syncMcpServer(serverId, {
        sourceKind: 'template',
        sourceRef: `Built-in template · ${template.name}`,
        manifestPatch: {
          templateId: template.id,
          templateName: template.name,
          templateSourceRef: templateExtension?.sourceRef ?? template.name,
          templateTransport: template.transport,
        },
      });
      emitUserAuditEvent('mcp.added', companyId, {
        serverId,
        name: template.name,
        transport: template.transport,
        sourceKind: 'template',
        templateId,
      });

      return { serverId };
    },

    async mcpRemoveServer({ serverId }) {
      const existing = mcpServersRepo.getById(serverId);
      await mcpHost.disconnectServer(serverId);
      mcpServersRepo.delete(serverId);
      const removedExtension = extensionsRegistry?.removeMcpServer(serverId) ?? null;
      if (removedExtension) {
        authorityRepo?.deleteGrantsByScope('extension', removedExtension.id);
      }
      if (existing?.companyId) {
        emitUserAuditEvent('mcp.removed', existing.companyId, {
          serverId: existing.id,
          name: existing.name,
          transport: existing.transport,
        });
      }
    },

    async mcpTestConnection({ transport, configJson }) {
      try {
        const client = new (await import('@modelcontextprotocol/sdk/client/index.js')).Client({
          name: 'team-x-test-connection',
          version: '0.0.1',
        });

        const clientTransport =
          transport === 'stdio'
            ? new (await import('@modelcontextprotocol/sdk/client/stdio.js')).StdioClientTransport(
                JSON.parse(configJson),
              )
            : new (await import('@modelcontextprotocol/sdk/client/sse.js')).SSEClientTransport(
                new URL(JSON.parse(configJson).url),
              );

        await client.connect(clientTransport);
        const tools = await client.listTools();
        await client.close();

        return {
          ok: true,
          toolCount: tools.tools?.length ?? 0,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          error: message,
        };
      }
    },

    async extensionsList({ companyId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] extensions.list: companyId is required');
      }
      if (!extensionsRegistry) {
        throw new Error('[ipc] extensions.list: extensionsRegistry dep unwired');
      }
      return extensionsRegistry.listByCompany(companyId).map(rowToExtensionSummary);
    },

    async extensionsInstallLocalSkill({ companyId, folderPath }) {
      if (!skillsService) {
        throw new Error('[ipc] extensions.installLocalSkill: skillsService dep unwired');
      }
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] extensions.installLocalSkill: companyId is required');
      }
      if (typeof folderPath !== 'string' || folderPath.trim().length === 0) {
        throw new Error('[ipc] extensions.installLocalSkill: folderPath is required');
      }
      assertCompanyActive(companiesRepo, companyId, 'extensions.installLocalSkill');
      const result = await skillsService.installLocal({
        companyId,
        folderPath: folderPath.trim(),
      });
      emitUserAuditEvent('extension.installed', companyId, {
        extensionId: result.extensionId,
        sourceKind: 'local',
        sourceRef: folderPath.trim(),
      });
      return result;
    },

    async extensionsInstallGithubSkill({ companyId, sourceUrl }) {
      if (!skillsService) {
        throw new Error('[ipc] extensions.installGithubSkill: skillsService dep unwired');
      }
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] extensions.installGithubSkill: companyId is required');
      }
      if (typeof sourceUrl !== 'string' || sourceUrl.trim().length === 0) {
        throw new Error('[ipc] extensions.installGithubSkill: sourceUrl is required');
      }
      assertCompanyActive(companiesRepo, companyId, 'extensions.installGithubSkill');
      const result = await skillsService.installGithub({
        companyId,
        sourceUrl: sourceUrl.trim(),
      });
      emitUserAuditEvent('extension.installed', companyId, {
        extensionId: result.extensionId,
        sourceKind: skillSourceKindFromUrl(sourceUrl.trim()),
        sourceRef: sourceUrl.trim(),
      });
      return result;
    },

    async extensionsRemoveSkill({ companyId, extensionId }) {
      if (!skillsService) {
        throw new Error('[ipc] extensions.removeSkill: skillsService dep unwired');
      }
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] extensions.removeSkill: companyId is required');
      }
      if (typeof extensionId !== 'string' || extensionId.length === 0) {
        throw new Error('[ipc] extensions.removeSkill: extensionId is required');
      }
      assertCompanyActive(companiesRepo, companyId, 'extensions.removeSkill');
      const removed = await skillsService.removeSkill({ companyId, extensionId });
      emitUserAuditEvent('extension.removed', companyId, {
        extensionId: removed.id,
        kind: removed.kind,
        name: removed.name,
        sourceKind: removed.sourceKind,
        sourceRef: removed.sourceRef,
      });
    },

    async extensionsListSkillAssignments({ companyId }) {
      if (!skillsService) {
        throw new Error('[ipc] extensions.listSkillAssignments: skillsService dep unwired');
      }
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] extensions.listSkillAssignments: companyId is required');
      }
      if (!extensionsRegistry) {
        throw new Error('[ipc] extensions.listSkillAssignments: extensionsRegistry dep unwired');
      }
      assertCompanyActive(companiesRepo, companyId, 'extensions.listSkillAssignments');
      return skillsService
        .listAssignments(companyId)
        .filter((assignment) =>
          extensionsRegistry
            .listByCompany(companyId)
            .some((extension) => extension.id === assignment.extensionId),
        );
    },

    async extensionsUpsertSkillAssignment({ companyId, extensionId, employeeId, enabled }) {
      if (!skillsService) {
        throw new Error('[ipc] extensions.upsertSkillAssignment: skillsService dep unwired');
      }
      if (!extensionsRegistry) {
        throw new Error('[ipc] extensions.upsertSkillAssignment: extensionsRegistry dep unwired');
      }
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] extensions.upsertSkillAssignment: companyId is required');
      }
      if (typeof extensionId !== 'string' || extensionId.length === 0) {
        throw new Error('[ipc] extensions.upsertSkillAssignment: extensionId is required');
      }
      if (typeof enabled !== 'boolean') {
        throw new Error('[ipc] extensions.upsertSkillAssignment: enabled must be boolean');
      }
      assertCompanyActive(companiesRepo, companyId, 'extensions.upsertSkillAssignment');

      const extension = extensionsRegistry
        .listByCompany(companyId)
        .find((row) => row.id === extensionId);
      if (!extension) {
        throw new Error(
          `[ipc] extensions.upsertSkillAssignment: extension not found in company ${companyId}: ${extensionId}`,
        );
      }
      if (extension.kind !== 'skill') {
        throw new Error('[ipc] extensions.upsertSkillAssignment: extension must be a skill');
      }

      let normalizedEmployeeId: string | null = null;
      if (typeof employeeId === 'string' && employeeId.length > 0) {
        const employee = employeesRepo.getById(employeeId);
        if (!employee) {
          throw new Error(
            `[ipc] extensions.upsertSkillAssignment: employee not found: ${employeeId}`,
          );
        }
        if (employee.companyId !== companyId) {
          throw new Error(
            `[ipc] extensions.upsertSkillAssignment: employee ${employeeId} does not belong to company ${companyId}`,
          );
        }
        normalizedEmployeeId = employeeId;
      }

      const assignmentId = skillsService.upsertAssignment({
        companyId,
        extensionId,
        employeeId: normalizedEmployeeId,
        enabled,
      });
      emitUserAuditEvent('skill.assignmentUpdated', companyId, {
        assignmentId,
        extensionId,
        employeeId: normalizedEmployeeId,
        enabled,
      });
      return { assignmentId };
    },

    async extensionsDeleteSkillAssignment({ assignmentId }) {
      if (!skillsService) {
        throw new Error('[ipc] extensions.deleteSkillAssignment: skillsService dep unwired');
      }
      if (typeof assignmentId !== 'string' || assignmentId.length === 0) {
        throw new Error('[ipc] extensions.deleteSkillAssignment: assignmentId is required');
      }
      skillsService.deleteAssignment(assignmentId);
    },

    async authorityList({ companyId, employeeId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] authority.list: companyId is required');
      }
      if (!authorityRepo) {
        throw new Error('[ipc] authority.list: authorityRepo dep unwired');
      }
      const rows =
        typeof employeeId === 'string' && employeeId.length > 0
          ? authorityRepo.listForEmployee(companyId, employeeId)
          : authorityRepo.listByCompany(companyId);
      return rows.map(rowToAuthorityGrant);
    },

    async authorityListRequests({ companyId, status }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] authority.listRequests: companyId is required');
      }
      if (!authorityRepo) {
        throw new Error('[ipc] authority.listRequests: authorityRepo dep unwired');
      }
      const normalizedStatus =
        status === 'pending' || status === 'approved' || status === 'denied' ? status : undefined;
      return authorityRepo
        .listRequestsByCompany(companyId, normalizedStatus)
        .map(rowToAuthorityRequest);
    },

    async authorityCreate(req) {
      if (!authorityRepo) {
        throw new Error('[ipc] authority.create: authorityRepo dep unwired');
      }
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] authority.create: companyId is required');
      }
      if (!req || (req.scopeKind !== 'company' && req.scopeKind !== 'employee')) {
        throw new Error('[ipc] authority.create: scopeKind must be company or employee');
      }
      if (typeof req.scopeId !== 'string' || req.scopeId.length === 0) {
        throw new Error('[ipc] authority.create: scopeId is required');
      }
      if (req.resourceKind !== 'capability' && req.resourceKind !== 'path') {
        throw new Error('[ipc] authority.create: resourceKind must be capability or path');
      }
      if (typeof req.resourceId !== 'string' || req.resourceId.trim().length === 0) {
        throw new Error('[ipc] authority.create: resourceId is required');
      }
      if (!['allow', 'deny', 'prompt'].includes(req.permission)) {
        throw new Error('[ipc] authority.create: permission must be allow, deny, or prompt');
      }
      if (req.scopeKind === 'company' && req.scopeId !== req.companyId) {
        throw new Error('[ipc] authority.create: company scopeId must match companyId');
      }
      if (req.scopeKind === 'employee') {
        const employee = employeesRepo.getById(req.scopeId);
        if (!employee) {
          throw new Error(`[ipc] authority.create: employee not found: ${req.scopeId}`);
        }
        if (employee.companyId !== req.companyId) {
          throw new Error(
            `[ipc] authority.create: employee ${req.scopeId} does not belong to company ${req.companyId}`,
          );
        }
      }
      const metadataJson =
        req.metadata && typeof req.metadata === 'object' ? JSON.stringify(req.metadata) : null;
      const grantId = authorityRepo.createGrant({
        scopeKind: req.scopeKind,
        scopeId: req.scopeId,
        resourceKind: req.resourceKind,
        resourceId: req.resourceId.trim(),
        permission: req.permission,
        metadataJson,
      });
      emitUserAuditEvent('authority.grant.created', req.companyId, {
        grantId,
        scopeKind: req.scopeKind,
        scopeId: req.scopeId,
        resourceKind: req.resourceKind,
        resourceId: req.resourceId.trim(),
        permission: req.permission,
      });
      return { grantId };
    },

    async authorityDelete({ grantId }) {
      if (!authorityRepo) {
        throw new Error('[ipc] authority.delete: authorityRepo dep unwired');
      }
      if (typeof grantId !== 'string' || grantId.length === 0) {
        throw new Error('[ipc] authority.delete: grantId is required');
      }
      const existing = authorityRepo.getGrantById(grantId);
      if (!existing) {
        throw new Error(`[ipc] authority.delete: grant not found: ${grantId}`);
      }
      authorityRepo.deleteGrant(grantId);
      if (existing.scopeKind === 'company') {
        emitUserAuditEvent('authority.grant.deleted', existing.scopeId, {
          grantId,
          scopeKind: existing.scopeKind,
          scopeId: existing.scopeId,
          resourceKind: existing.resourceKind,
          resourceId: existing.resourceId,
          permission: existing.permission,
        });
      } else if (existing.scopeKind === 'employee') {
        const employee = employeesRepo.getById(existing.scopeId);
        if (employee) {
          emitUserAuditEvent('authority.grant.deleted', employee.companyId, {
            grantId,
            scopeKind: existing.scopeKind,
            scopeId: existing.scopeId,
            resourceKind: existing.resourceKind,
            resourceId: existing.resourceId,
            permission: existing.permission,
          });
        }
      } else if (existing.scopeKind === 'extension' && extensionsRegistry) {
        for (const company of companiesRepo.list()) {
          const extension = extensionsRegistry
            .listByCompany(company.id)
            .find((row) => row.id === existing.scopeId);
          if (!extension) continue;
          emitUserAuditEvent('authority.grant.deleted', company.id, {
            grantId,
            scopeKind: existing.scopeKind,
            scopeId: existing.scopeId,
            resourceKind: existing.resourceKind,
            resourceId: existing.resourceId,
            permission: existing.permission,
          });
          break;
        }
      }
    },

    async authorityReviewRequest({ companyId, requestId, decision, reason, operatorId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] authority.reviewRequest: companyId is required');
      }
      if (typeof requestId !== 'string' || requestId.length === 0) {
        throw new Error('[ipc] authority.reviewRequest: requestId is required');
      }
      if (decision !== 'approved' && decision !== 'denied') {
        throw new Error('[ipc] authority.reviewRequest: decision must be approved or denied');
      }
      return handlers().approvalsReview({
        companyId,
        itemId: requestId,
        kind: 'authority-request',
        decision,
        rationale: reason ?? undefined,
        operatorId,
      });
    },

    async authorityGetEffective({ companyId, employeeId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] authority.getEffective: companyId is required');
      }
      if (typeof employeeId !== 'string' || employeeId.length === 0) {
        throw new Error('[ipc] authority.getEffective: employeeId is required');
      }
      if (!authorityResolver) {
        throw new Error('[ipc] authority.getEffective: authorityResolver dep unwired');
      }
      return authorityResolver.resolveEmployee(companyId, employeeId);
    },
  };
}
