/**
 * Boot phase — the core IPC handler surface: the services only the IPC
 * layer consumes (backup, autonomy doctor + benchmark, agent improvement,
 * updater, meetings) and the `createIpcHandlers` factory over every repo
 * and service built so far. Registration on `ipcMain` happens later, via
 * `registerIpcHandlers`, once the command palette is wired on top.
 */

import { join } from 'node:path';

import { app } from 'electron';

import type { DbHandle, TeamXDb } from '../db/client.js';
import { getDb } from '../db/client.js';
import { dbPath } from '../db/paths.js';
import { createIpcHandlers } from '../ipc/handlers.js';
import type { Orchestrator } from '../orchestrator/index.js';
import { createMeetingService } from '../orchestrator/meeting-service.js';
import { createAgentImprovementService } from '../services/agent-improvement-service.js';
import { createInMemoryAutonomyBenchmarkScenarioContext } from '../services/autonomy-benchmark-memory-context.js';
import { createAutonomyBenchmarkService } from '../services/autonomy-benchmark-service.js';
import { createAutonomyDoctorService } from '../services/autonomy-doctor-service.js';
import { createBackupService } from '../services/backup.js';
import type { CopilotEventWindow } from '../services/copilot-event-window.js';
import { detectHardware } from '../services/profiler.js';
import type { RoleLoader } from '../services/role-loader.js';
import { ensureSystemAgent, ensureSystemCopilot } from '../services/system-agent-bootstrap.js';
import { createUpdaterService } from '../services/updater.js';

import { calcCost } from './cost.js';
import type { GovernanceServices } from './governance-services.js';
import type { PlatformServices } from './platform-services.js';
import type { ProviderRouting } from './provider-routing.js';
import type { RagAndContext } from './rag.js';
import type { Repositories } from './repositories.js';
import { runtime } from './runtime-state.js';

export interface CoreIpcDeps
  extends Repositories,
    PlatformServices,
    GovernanceServices,
    Pick<ProviderRouting, 'resolveProvider'>,
    Pick<RagAndContext, 'contextAssemblerService' | 'contextPackerService'> {
  db: TeamXDb;
  dbHandle: DbHandle;
  isDev: boolean;
  orchestrator: Orchestrator;
  roleLoader: RoleLoader;
  copilotEventWindow: CopilotEventWindow;
}

export function buildCoreIpcHandlers(deps: CoreIpcDeps) {
  const {
    db,
    dbHandle,
    isDev,
    orchestrator,
    roleLoader,
    copilotEventWindow,
    resolveProvider,
    contextAssemblerService,
    contextPackerService,
    // Repositories
    companiesRepo,
    employeesRepo,
    threadsRepo,
    messagesRepo,
    ticketAttachmentsRepo,
    goalsRepo,
    projectsRepo,
    scheduleItemsRepo,
    meetingsRepo,
    orgEdgesRepo,
    runsRepo,
    eventsRepo,
    mcpServersRepo,
    extensionsRegistry,
    authorityRepo,
    authorityResolver,
    settingsRepo,
    auditRepo,
    copilotInsightsRepo,
    // Platform services
    testMode,
    secretsStore,
    bus,
    mcpHost,
    skillsService,
    operatorAccessService,
    cloudLinkService,
    artifactService,
    threadDigestService,
    runCheckpointService,
    vaultService,
    // Governance services
    providersService,
    runtimeProfilesService,
    runtimeOperationsService,
    agentWakeupRequestsRepo,
    ticketsRepo,
    companyPortabilityService,
    budgetGovernanceService,
    approvalInboxService,
    routineService,
  } = deps;

  const backupService = createBackupService({
    dbPath: dbPath(),
    companiesBasePath: join(app.getPath('userData'), 'companies'),
    backupsDir: join(app.getPath('userData'), 'backups'),
    appVersion: app.getVersion(),
    checkpointWal: () => {
      const rawDb = getDb();
      // Drizzle's run() for raw SQL pragma
      try {
        (rawDb as unknown as { run: (q: unknown) => void }).run({
          toSQL: () => ({ sql: 'PRAGMA wal_checkpoint(TRUNCATE)', params: [] }),
        });
      } catch {
        // Fallback: just proceed without checkpoint
      }
    },
  });
  const autonomyDoctorService = createAutonomyDoctorService({
    dbDiagnostics: {
      quickCheck: () => {
        const rows = dbHandle.raw.pragma('quick_check') as Array<Record<string, unknown>>;
        return rows.map((row) => String(Object.values(row)[0] ?? '')).join('; ');
      },
      hasTable: (tableName) =>
        Boolean(
          dbHandle.raw
            .prepare("select name from sqlite_master where type = 'table' and name = ?")
            .get(tableName),
        ),
    },
    backupService,
    runtimeProfilesService,
    runtimeOperationsService,
    mcpServersRepo,
    providersService,
    budgetGovernanceService,
    secretsStore,
  });
  const autonomyBenchmarkService = createAutonomyBenchmarkService({
    createScenarioContext: createInMemoryAutonomyBenchmarkScenarioContext,
  });
  const agentImprovementService = createAgentImprovementService({
    ticketsRepo,
    eventsRepo,
    bus,
  });

  const updaterService = createUpdaterService({
    isDev,
    isTestMode: testMode,
  });

  const meetingService = createMeetingService({
    orchestrator,
    bus,
    meetingsRepo,
    threadsRepo,
    messagesRepo,
    employeesRepo,
    ticketsRepo,
    // End-of-meeting minutes: the chair's provider (same `resolveProvider`
    // the orchestrator uses) writes a summary + action items, admitted and
    // recorded through the same budget governance as an agent turn. Any
    // failure falls back to transcript-only minutes.
    minutes: {
      resolveProvider,
      runsRepo,
      calcCost,
      budgetGovernance: runtime.budgetGovernanceServiceInstance ?? undefined,
    },
  });

  const ipcHandlers = createIpcHandlers({
    companiesRepo,
    employeesRepo,
    threadsRepo,
    messagesRepo,
    ticketsRepo,
    ticketAttachmentsRepo,
    goalsRepo,
    projectsRepo,
    scheduleItemsRepo,
    agentWakeupRequestsRepo,
    meetingsRepo,
    orgEdgesRepo,
    runsRepo,
    eventsRepo,
    orchestrator,
    meetingService,
    roleLookup: roleLoader,
    mcpHost,
    mcpServersRepo,
    extensionsRegistry,
    skillsService,
    operatorAccessService,
    cloudLinkService,
    runtimeProfilesService,
    runtimeOperationsService,
    autonomyDoctorService,
    autonomyBenchmarkService: {
      run: (input) =>
        autonomyBenchmarkService.run({
          runtimeKinds: input.runtimeKinds,
          scenarioIds: input.scenarioIds,
        }),
    },
    agentImprovementService,
    routineService,
    budgetGovernanceService,
    approvalInboxService,
    artifactService,
    companyPortabilityService,
    threadDigestService,
    runCheckpointService,
    contextAssemblerService,
    contextPackerService,
    authorityRepo,
    authorityResolver,
    providersService,
    secretsStore,
    settingsRepo,
    vaultService,
    backupService,
    auditRepo,
    updaterService,
    copilotInsightsRepo: {
      listActiveForExport: (filter) => copilotInsightsRepo.listActiveForExport(filter),
    },
    // Lazy wrapper — the CopilotAnalyzerService is instantiated in a
    // later boot phase (after RAG indexer, agentic loop, etc.), so we
    // close over the `runtime` handle and resolve it
    // on each `start` / `restart` / `stop` call. No-ops cleanly if a
    // `setCopilot` / `companies.archive` IPC fires before the analyzer
    // is live (defensive only — in practice the renderer cannot
    // reach settings until after app-ready, which is after the
    // analyzer has been wired).
    copilotAnalyzerService: {
      start: (cid: string) => {
        runtime.copilotAnalyzerServiceInstance?.start(cid);
      },
      restart: (cid: string) => {
        runtime.copilotAnalyzerServiceInstance?.restart(cid);
      },
      stop: (cid: string) => {
        runtime.copilotAnalyzerServiceInstance?.stop(cid);
      },
    },
    // Direct handle — already live at this point in the bootstrap
    // (created and started by `startCopilotEventWindow`, before handlers
    // build). Used
    // by `companies.archive` (M33 F3) to drop the per-company rolling
    // buffer + hydrated flag after the analyzer is stopped.
    copilotEventWindow: {
      clear: (cid: string) => {
        copilotEventWindow.clear(cid);
      },
    },
    // Proactive trigger service — same lazy-resolver pattern as
    // copilotAnalyzerService above. The trigger service depends on
    // `agenticLoopService`, which is constructed AFTER `createIpcHandlers`
    // (the ordering reflects an existing wiring constraint: the loop
    // service consumes the build-tools surface composed inline from the
    // handler factory's repos). Closing over the `runtime` handle
    // and resolving on each method call lets us register the IPC
    // surface up-front while the actual instance comes online a few
    // boot phases later. Without this wiring, `proactive.setEnabled`
    // (and the rest of the proactive.* IPC) throws
    // `[ipc] proactive.<method>: proactiveTriggerService dep is required`,
    // which the renderer surfaces as a snap-back on the toggle Switch.
    proactiveTriggerService: {
      decomposeGoal: (args) => {
        if (!runtime.proactiveTriggerServiceInstance) {
          return Promise.reject(new Error('[main] proactiveTriggerService not yet initialized'));
        }
        return runtime.proactiveTriggerServiceInstance.decomposeGoal(args);
      },
      scanForWork: (args) => {
        if (!runtime.proactiveTriggerServiceInstance) {
          return Promise.reject(new Error('[main] proactiveTriggerService not yet initialized'));
        }
        return runtime.proactiveTriggerServiceInstance.scanForWork(args);
      },
      setEnabled: (args) => {
        if (!runtime.proactiveTriggerServiceInstance) {
          throw new Error('[main] proactiveTriggerService not yet initialized');
        }
        runtime.proactiveTriggerServiceInstance.setEnabled(args);
      },
      isEnabled: (companyId) => {
        if (!runtime.proactiveTriggerServiceInstance) return false;
        return runtime.proactiveTriggerServiceInstance.isEnabled(companyId);
      },
      getState: (companyId) => {
        // Before the instance comes online nothing has been scanned and
        // nothing is in flight — that is the true state, not a placeholder.
        if (!runtime.proactiveTriggerServiceInstance) {
          return { activeWork: 0, queuedWork: 0, lastScanAt: null };
        }
        return runtime.proactiveTriggerServiceInstance.getState(companyId);
      },
    },
    // Event bus — used by `companies.archive` to emit `company.archived`
    // so renderer caches invalidate (architectural invariant #11).
    // Narrowed to `{ emit }` at the handler boundary; the richer
    // `EventBus` surface lives inside the orchestrator.
    bus: {
      emit: (input) => bus.emit(input),
    },
    // Post-restore bootstrap (M33 F4). Closes over `db`,
    // `companiesRepo`, and `roleLoader` so the handler stays free
    // of drizzle + role-loader imports. The closure re-reads
    // `companiesRepo.list()` on EACH invocation so it sees the
    // just-restored DB — calling-time resolution is essential since
    // the restore swaps the underlying file while the drizzle handle
    // remains live.
    ensurePostRestoreBootstrap: () =>
      backupService.ensurePostRestoreSystemEmployees({
        listCompanyIds: () => companiesRepo.list().map((c) => c.id),
        ensureSystemForCompany: (companyId) => {
          const agent = ensureSystemAgent({ db, companyId, roleLookup: roleLoader });
          const copilot = ensureSystemCopilot({ db, companyId, roleLookup: roleLoader });
          return {
            agentCreated: agent.created,
            copilotCreated: copilot.created,
          };
        },
      }),
    // Per-company system-employee bootstrap — invoked by `companies.create`
    // (Phase 5.6 M-C step b — restores Cluster A multi-company CRUD per
    // audit row 10.12). Same `db` + `roleLoader` handles the F4
    // post-restore sweep uses; idempotent at the bootstrap layer
    // (findSystemByRoleId short-circuits if the rows already exist).
    // Returns BOTH the employee ids AND the created/found flags so the
    // IPC handler can include the ids in the response without a
    // follow-up `employees.list` call (those rows are filtered out of
    // listVisibleByCompany by the is_system filter sweep).
    ensureSystemForCompany: (companyId) => {
      const agent = ensureSystemAgent({ db, companyId, roleLookup: roleLoader });
      const copilot = ensureSystemCopilot({ db, companyId, roleLookup: roleLoader });
      return {
        agentEmployeeId: agent.employeeId,
        copilotEmployeeId: copilot.employeeId,
        agentCreated: agent.created,
        copilotCreated: copilot.created,
      };
    },
    getHardwareProfile: detectHardware,
  });

  return ipcHandlers;
}
