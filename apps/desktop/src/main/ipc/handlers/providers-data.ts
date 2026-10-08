/**
 * IPC handlers — Providers, the vault, backup and restore, the audit log, and
 * Copilot export.
 * Split from handlers.ts by bounded context (audit 2026-10-07 P1-7).
 */
import type { AuditEvent, BackupRestoreResponse } from '@team-x/shared-types';

import {
  serializeCopilotInsightsCsv,
  serializeCopilotInsightsJson,
} from '../../db/repos/copilot-insights.js';
import { listOllamaModels } from '../../services/ollama-models.js';

import type { HandlerContext } from './context.js';
import type { IpcHandlers } from './contract.js';
import { HUMAN_USER_ID } from './deps.js';
import { assertCopilotExportRequest } from './mappers.js';

export type ProvidersDataHandlers = Pick<
  IpcHandlers,
  | 'providersList'
  | 'providersAdd'
  | 'providersUpdate'
  | 'providersRemove'
  | 'providersTestConnection'
  | 'providersListModels'
  | 'vaultUpload'
  | 'vaultDownload'
  | 'vaultList'
  | 'vaultSearch'
  | 'vaultDelete'
  | 'vaultVerify'
  | 'vaultStats'
  | 'backupCreate'
  | 'backupRestore'
  | 'backupList'
  | 'backupDelete'
  | 'auditList'
  | 'auditStats'
  | 'auditExport'
  | 'copilotExport'
>;

export function createProvidersDataHandlers(ctx: HandlerContext): ProvidersDataHandlers {
  const {
    providersService,
    secretsStore,
    vaultService,
    backupService,
    auditRepo,
    copilotInsightsRepo,
    ensurePostRestoreBootstrap,
  } = ctx;
  return {
    // -----------------------------------------------------------------------
    // Provider management handlers (Phase 3 — M18)
    // -----------------------------------------------------------------------

    async providersList() {
      return providersService.list();
    },

    async providersAdd(req) {
      if (typeof req.name !== 'string' || req.name.trim().length === 0) {
        throw new Error('[ipc] providers.add: name is required');
      }
      if (typeof req.kind !== 'string' || req.kind.trim().length === 0) {
        throw new Error('[ipc] providers.add: kind is required');
      }
      const config = providersService.add({
        name: req.name,
        kind: req.kind,
        privacyTier: req.privacyTier,
        configJson: req.configJson,
      });
      if (typeof req.apiKey === 'string' && req.apiKey.trim().length > 0) {
        await secretsStore.setApiKey(config.id, req.apiKey.trim());
      }
      return { providerId: config.id };
    },

    async providersUpdate(req) {
      if (typeof req.providerId !== 'string' || req.providerId.length === 0) {
        throw new Error('[ipc] providers.update: providerId is required');
      }
      providersService.update(req.providerId, {
        name: req.name,
        enabled: req.enabled,
        configJson: req.configJson,
      });
      if (typeof req.apiKey === 'string' && req.apiKey.trim().length > 0) {
        await secretsStore.setApiKey(req.providerId, req.apiKey.trim());
      }
    },

    async providersRemove(req) {
      if (typeof req.providerId !== 'string' || req.providerId.length === 0) {
        throw new Error('[ipc] providers.remove: providerId is required');
      }
      await providersService.remove(req.providerId);
    },

    async providersTestConnection(req) {
      if (typeof req.providerId !== 'string' || req.providerId.length === 0) {
        throw new Error('[ipc] providers.testConnection: providerId is required');
      }
      const isReady = await providersService.isConfigured(req.providerId);
      if (!isReady) {
        return { ok: false, error: 'Provider is not configured (missing API key or disabled)' };
      }

      // For Ollama, perform a real health check to verify connectivity
      const config = providersService.get(req.providerId);
      if (config?.kind === 'ollama') {
        try {
          // Extract host from baseURL (remove /api suffix if present)
          const baseUrl = config.baseUrl ?? 'http://localhost:11434/api';
          const healthUrl = `${baseUrl.replace(/\/api$/, '')}/api/tags`;
          const response = await fetch(healthUrl, { method: 'GET' });
          if (!response.ok) {
            return { ok: false, error: `Ollama returned HTTP ${response.status}` };
          }
          const data = (await response.json()) as { models?: Array<{ name: string }> };
          const modelCount = data.models?.length ?? 0;
          return { ok: true, detail: `${modelCount} model(s) available` };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { ok: false, error: `Cannot reach Ollama: ${msg}` };
        }
      }

      return { ok: true };
    },

    async providersListModels(req) {
      // providers.listModels auto-fires from the renderer when a provider card
      // mounts and re-fires on cache invalidation. A malformed request, a
      // provider removed between the invalidation and its refetch (a benign
      // race), or an unexpected lookup failure must NOT reject — a rejection
      // resurfaces the `Error occurred in handler for 'providers.listModels'`
      // main-process stderr spam this contract exists to kill. listOllamaModels
      // already never rejects; this guard extends the same never-reject posture
      // to the handler boundary, so EVERY path returns a typed
      // { models, status, detail } response instead of throwing.
      // `req` itself can be null/undefined at runtime (IPC delivers arbitrary
      // payloads), so extract via optional chaining on a widened type — reading
      // `req.providerId` directly would throw HERE, before the try, and reject.
      const providerId = (req as { providerId?: unknown } | null | undefined)?.providerId;
      if (typeof providerId !== 'string' || providerId.length === 0) {
        return { models: [], status: 'error', detail: 'providerId is required' };
      }

      try {
        const config = providersService.get(providerId);
        if (!config) {
          // Removed before this refetch resolved — a benign race, not a reason
          // to reject the IPC call (and not worth a log line).
          return {
            models: [],
            status: 'error',
            detail: `provider not found: ${providerId}`,
          };
        }

        if (config.kind !== 'ollama') {
          return { models: [], status: 'ok' };
        }

        // Unreachable Ollama (server not running) is an expected, benign state —
        // `listOllamaModels` degrades to the configured default instead of
        // throwing, so the auto-fired renderer query never spams the main log
        // with ECONNREFUSED. It returns a `status` ('ok' | 'unreachable' |
        // 'error') so the settings UI can surface a genuine server-side failure
        // (auth/5xx) instead of silently presenting the default as detected.
        // Mirrors testConnection.
        const baseUrl = config.baseUrl ?? 'http://localhost:11434/api';
        return await listOllamaModels(baseUrl, config.defaultModel);
      } catch (err) {
        // An unexpected lookup/runtime failure (e.g. a config-store read error)
        // still honors the never-reject contract at the IPC boundary.
        console.warn('[ipc] providers.listModels: unexpected failure; returning typed error', err);
        return {
          models: [],
          status: 'error',
          detail: err instanceof Error ? err.message : String(err),
        };
      }
    },

    // -----------------------------------------------------------------------
    // Vault management handlers (Phase 4 — M21)
    // -----------------------------------------------------------------------

    async vaultUpload(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] vault.upload: companyId is required');
      }
      if (typeof req.sourcePath !== 'string' || req.sourcePath.length === 0) {
        throw new Error('[ipc] vault.upload: sourcePath is required');
      }
      const fileId = await vaultService.store(
        req.companyId,
        req.sourcePath,
        HUMAN_USER_ID,
        req.tags,
      );
      return { fileId };
    },

    async vaultDownload(req) {
      if (typeof req.fileId !== 'string' || req.fileId.length === 0) {
        throw new Error('[ipc] vault.download: fileId is required');
      }
      return vaultService.retrieve(req.fileId);
    },

    async vaultList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] vault.list: companyId is required');
      }
      return vaultService.list(req.companyId);
    },

    async vaultSearch(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] vault.search: companyId is required');
      }
      if (typeof req.query !== 'string' || req.query.trim().length === 0) {
        throw new Error('[ipc] vault.search: query is required');
      }
      return vaultService.search(req.companyId, req.query.trim());
    },

    async vaultDelete(req) {
      if (typeof req.fileId !== 'string' || req.fileId.length === 0) {
        throw new Error('[ipc] vault.delete: fileId is required');
      }
      await vaultService.remove(req.fileId);
    },

    async vaultVerify(req) {
      if (typeof req.fileId !== 'string' || req.fileId.length === 0) {
        throw new Error('[ipc] vault.verify: fileId is required');
      }
      return vaultService.verify(req.fileId);
    },

    async vaultStats(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] vault.stats: companyId is required');
      }
      return vaultService.stats(req.companyId);
    },

    // -----------------------------------------------------------------------
    // Backup/restore handlers (Phase 4 — M23)
    // -----------------------------------------------------------------------

    async backupCreate(req) {
      const result = await backupService.create(req.destination);
      return result;
    },

    async backupRestore(req) {
      if (typeof req.backupPath !== 'string' || req.backupPath.length === 0) {
        throw new Error('[ipc] backup.restore: backupPath is required');
      }
      const manifest = await backupService.restore(req.backupPath);

      // Post-restore sweep (M33 F4). Rebuilds the `system-agent` +
      // `system-copilot` pseudo-employee rows for every company in the
      // just-restored DB. The sweep is a no-op for current-schema
      // backups — both flags return `false` across the board — but
      // it is load-bearing for backups that pre-date M31 (agent) or
      // M33 (copilot). We surface the counts in the response so the
      // renderer can show a one-time "restored N agents, M copilots"
      // toast when non-zero and silently skip otherwise.
      //
      // A missing `ensurePostRestoreBootstrap` dep (legacy test harness,
      // or intentionally-unwired handler build) leaves the field
      // undefined on the response. The renderer must tolerate that —
      // see `BackupRestoreResponse.postRestoreSystemEmployees` JSDoc.
      let postRestoreSystemEmployees: BackupRestoreResponse['postRestoreSystemEmployees'];
      if (ensurePostRestoreBootstrap) {
        try {
          const result = ensurePostRestoreBootstrap();
          postRestoreSystemEmployees = {
            companiesScanned: result.companiesScanned,
            agentsCreated: result.agentsCreated,
            copilotsCreated: result.copilotsCreated,
            skipped: result.skipped,
          };
        } catch (err) {
          // A catastrophic failure in the bootstrap itself (not
          // per-company — those are already swallowed + logged via
          // `skipped[]`) must NOT fail the whole restore. The DB +
          // vault are already swapped; the user would be left with
          // an unusable app if we threw here. Log and continue with
          // undefined counts — the renderer surfaces a restore-OK
          // state and the user can retry the bootstrap via a future
          // repair action.
          console.error(
            '[ipc] backup.restore: post-restore system-employee bootstrap failed — restore itself succeeded:',
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] backup.restore: ensurePostRestoreBootstrap dep unwired — pre-M33 backups will be missing system-copilot',
        );
      }

      return { manifest, postRestoreSystemEmployees };
    },

    async backupList() {
      return backupService.list();
    },

    async backupDelete(req) {
      if (typeof req.backupPath !== 'string' || req.backupPath.length === 0) {
        throw new Error('[ipc] backup.delete: backupPath is required');
      }
      const result = await backupService.delete(req.backupPath);
      return { deletedPath: result.deletedPath };
    },

    // -----------------------------------------------------------------------
    // Audit log handlers (Phase 4 — M24)
    // -----------------------------------------------------------------------

    async auditList(filter) {
      if (typeof filter.companyId !== 'string' || filter.companyId.length === 0) {
        throw new Error('[ipc] audit.list: companyId is required');
      }
      const rows = auditRepo.list(filter);
      return rows as AuditEvent[];
    },

    async auditStats(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] audit.stats: companyId is required');
      }
      return auditRepo.stats(req.companyId);
    },

    async auditExport(req) {
      if (
        !req.filter ||
        typeof req.filter.companyId !== 'string' ||
        req.filter.companyId.length === 0
      ) {
        throw new Error('[ipc] audit.export: filter.companyId is required');
      }
      if (req.format !== 'csv' && req.format !== 'json') {
        throw new Error('[ipc] audit.export: format must be "csv" or "json"');
      }
      const content =
        req.format === 'csv' ? auditRepo.exportCsv(req.filter) : auditRepo.exportJson(req.filter);
      const { writeFileSync, mkdirSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');
      const exportDir = join(tmpdir(), 'team-x-exports');
      mkdirSync(exportDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `audit-export-${timestamp}.${req.format}`;
      const filePath = join(exportDir, filename);
      writeFileSync(filePath, content, 'utf-8');
      return { filePath };
    },

    async copilotExport(req) {
      const filter = assertCopilotExportRequest(req);
      if (!copilotInsightsRepo) {
        throw new Error('[ipc] copilot.export: copilotInsightsRepo dep unwired');
      }

      const result = copilotInsightsRepo.listActiveForExport(filter);
      const exportedAtIso = new Date().toISOString();
      const content =
        req.format === 'csv'
          ? serializeCopilotInsightsCsv(result.rows)
          : serializeCopilotInsightsJson({
              rows: result.rows,
              filter,
              exportedAtIso,
              truncated: result.truncated,
            });
      const { writeFileSync, mkdirSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');
      const exportDir = join(tmpdir(), 'team-x-exports');
      mkdirSync(exportDir, { recursive: true });
      const timestamp = exportedAtIso.replace(/[:.]/g, '-');
      const filename = `copilot-insights-export-${timestamp}.${req.format}`;
      const filePath = join(exportDir, filename);
      writeFileSync(filePath, content, 'utf-8');
      return {
        filePath,
        rowCount: result.rows.length,
        truncated: result.truncated,
        format: req.format,
        scope: req.scope,
      };
    },
  };
}
