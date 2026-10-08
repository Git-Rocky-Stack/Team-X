/**
 * Command palette (Phase 5 — M30/M31), in the order the composition root
 * runs it:
 *
 *   1. `buildCommandPalette`        — NLU classifier, entity resolver, slot
 *                                     filler (after the IPC handlers).
 *   2. `bootCommandService`         — the dispatcher over the IPC handlers +
 *                                     the agentic loop.
 *   3. `registerCommandIpcHandlers` — the `command.*` channels.
 */

import { createEntityResolver, createSlotFiller } from '@team-x/intelligence';
import type { Employee, Meeting, Ticket } from '@team-x/shared-types';
import { SYSTEM_AGENT_ROLE_ID } from '@team-x/shared-types';
import { ipcMain } from 'electron';

import { buildCommandHandlers } from '../ipc/command-handlers.js';
import type { createIpcHandlers } from '../ipc/handlers.js';
import type { AgenticLoopService } from '../services/agentic-loop-service.js';
import { type CommandService, createCommandService } from '../services/command-service.js';
import {
  createClassifierCompleteFor,
  createPaletteIntentClassifier,
} from '../services/palette-classifier.js';
import type { RoleLoader } from '../services/role-loader.js';
import { createTestClassifier } from '../services/test-classifier.js';

import { calcCost } from './cost.js';
import type { GovernanceServices } from './governance-services.js';
import type { PlatformServices } from './platform-services.js';
import type { ProviderRouting } from './provider-routing.js';
import type { Repositories } from './repositories.js';
import { runtime } from './runtime-state.js';

export interface CommandPaletteDeps
  extends Pick<Repositories, 'employeesRepo' | 'runsRepo' | 'meetingsRepo'>,
    Pick<PlatformServices, 'testMode' | 'vaultService'>,
    Pick<GovernanceServices, 'ticketsRepo'>,
    Pick<ProviderRouting, 'resolveProvider'> {
  roleLoader: RoleLoader;
}

export type CommandPalette = ReturnType<typeof buildCommandPalette>;

export function buildCommandPalette(deps: CommandPaletteDeps) {
  const {
    employeesRepo,
    runsRepo,
    meetingsRepo,
    testMode,
    vaultService,
    ticketsRepo,
    resolveProvider,
    roleLoader,
  } = deps;

  // ---- Command palette service (Phase 5 — M30 T4) -----------------------
  //
  // Built AFTER `ipcHandlers` so we can wire the dispatcher against the
  // registered handler functions directly (same source of truth, no
  // duplicate business logic). Built BEFORE `registerIpcHandlers` so
  // T5's `command.*` IPC layer can register its handlers on top of
  // this service without a second orchestration pass.
  //
  // The NLU classifier calls the palette company's system-agent model
  // through the same `resolveProvider` closure the orchestrator uses
  // (see `palette-classifier.ts`). When no provider can be resolved the
  // completer answers the canned `complex_request` reply and logs once,
  // so the palette still routes the command to the agentic loop.
  //
  // Test-mode swap: when `NODE_ENV === 'test'` we bypass the LLM
  // completion seam entirely and use `createTestClassifier()` — a
  // deterministic canned table + sentinel override that lets the
  // Playwright command-palette spec exercise the full parse → fill
  // → execute → history loop without a live provider.
  const commandClassifier = testMode
    ? createTestClassifier()
    : createPaletteIntentClassifier({
        completeFor: createClassifierCompleteFor({
          findSystemAgent: (companyId) =>
            employeesRepo.findSystemByRoleId(companyId, SYSTEM_AGENT_ROLE_ID),
          resolveProvider,
          // Read-only: getOverview neither pauses nor files approvals.
          isBudgetBlocked: (companyId) =>
            (runtime.budgetGovernanceServiceInstance?.getOverview(companyId).exceededCount ?? 0) >
            0,
          // Each classification is a model call: record it and its spend.
          accounting: {
            runsRepo,
            calcCost,
            recordRunSpend: async (runId) => {
              await runtime.budgetGovernanceServiceInstance?.recordRunSpend(runId);
            },
          },
        }),
      });
  // DB rows type `status` as `string`; shared-types narrows to the
  // `EmployeeStatus` / `TicketStatus` unions. The casts below are
  // safe — the DB schema's CHECK constraints and repo write paths
  // never insert values outside those unions — and avoid threading
  // a row-mapper into the resolver seam for a purely structural diff.
  const commandResolver = createEntityResolver({
    listEmployees: async (companyId: string) =>
      employeesRepo.listByCompany(companyId) as unknown as Employee[],
    getTicketById: async (id: string, companyId: string) => {
      const t = ticketsRepo.getById(id);
      if (!t || t.companyId !== companyId) return null;
      return t as unknown as Ticket;
    },
    searchTickets: async (query: string, companyId: string) => {
      const q = query.toLowerCase();
      const rows = ticketsRepo
        .listByCompany(companyId)
        .filter(
          (t) =>
            t.title.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q),
        );
      return rows as unknown as Ticket[];
    },
    searchVault: async (query: string, companyId: string) => {
      const hits = vaultService.search(companyId, query);
      // Resolver expects VaultFileRankedLike = { file: VaultFile; rank?: number }.
      // VaultSearchResult is a thin projection of VaultFile — hydrate the
      // full row via `vaultService.get()` so the resolver's stringifier
      // sees the canonical shape.
      return hits
        .map((r) => {
          const file = vaultService.get(r.id);
          if (!file) return null;
          return { file, rank: r.rank };
        })
        .filter(
          (x): x is { file: NonNullable<ReturnType<typeof vaultService.get>>; rank: number } =>
            x !== null,
        );
    },
    listRoles: async () => roleLoader.listRoles(),
    listMeetings: async (companyId: string) =>
      meetingsRepo.listByCompany(companyId) as unknown as Meeting[],
    getActiveMeeting: async (companyId: string) =>
      meetingsRepo.getActive(companyId) as unknown as Meeting | null,
  });
  const commandSlotFiller = createSlotFiller();

  return { commandClassifier, commandResolver, commandSlotFiller };
}

export interface CommandServiceDeps
  extends Pick<Repositories, 'commandHistoryRepo'>,
    Pick<PlatformServices, 'bus'>,
    CommandPalette {
  ipcHandlers: ReturnType<typeof createIpcHandlers>;
  agenticLoopSvc: AgenticLoopService;
}

/** Builds the CommandService, publishes it on `runtime`, and returns it. */
export function bootCommandService(deps: CommandServiceDeps): CommandService {
  const {
    commandHistoryRepo,
    bus,
    commandClassifier,
    commandResolver,
    commandSlotFiller,
    ipcHandlers,
    agenticLoopSvc,
  } = deps;

  runtime.commandServiceInstance = createCommandService({
    classifier: commandClassifier,
    resolver: commandResolver,
    slotFiller: commandSlotFiller,
    handlers: {
      employeesList: (req) => ipcHandlers.employeesList(req),
      employeesCreate: (req) => ipcHandlers.employeesCreate(req),
      employeesFire: (req) => ipcHandlers.employeesFire(req),
      // Track 3 — wire the natural-language `promote` command. The
      // IPC handler has shipped (`employees.promote`, register.ts:687)
      // and is exercised by `employees-promote-handlers.test.ts`, but
      // the CommandService dispatcher slot was never connected, so
      // typing "promote Alice to CTO" in the palette emitted
      // `handler_error`. The IPC handler takes `{ employeeId, newRoleId }`
      // and returns the full promotion record; the dispatcher wants
      // `{ employeeId, roleId, newLevel }` → `Promise<void>`. We adapt
      // at the boundary: forward `roleId` as `newRoleId`, ignore the
      // classifier-supplied `newLevel` (the IPC handler derives the
      // level from the role spec — passing it here would be redundant
      // and create a divergence risk between classifier output and the
      // role-loader's source of truth), and discard the response.
      employeesPromote: async (req) => {
        await ipcHandlers.employeesPromote({
          employeeId: req.employeeId,
          newRoleId: req.roleId,
        });
      },
      ticketsAssign: (req) =>
        ipcHandlers.ticketsAssign({ ticketId: req.ticketId, assigneeId: req.assigneeId }),
      ticketsCreate: (req) => ipcHandlers.ticketsCreate(req),
      ticketsClose: (req) => ipcHandlers.ticketsClose(req),
      ticketsReopen: (req) => ipcHandlers.ticketsReopen(req),
      projectsCreate: (req) =>
        ipcHandlers.projectsCreate({
          companyId: req.companyId,
          title: req.title,
          description: req.description,
        }),
      goalsCreate: (req) => ipcHandlers.goalsCreate(req),
      meetingsCall: (req) =>
        ipcHandlers.meetingsCall({
          companyId: req.companyId,
          chairId: req.chairId,
          attendeeIds: req.attendeeIds,
          agenda: req.agenda,
        }),
      meetingsEnd: (req) => ipcHandlers.meetingsEnd({ meetingId: req.meetingId }),
      vaultSearch: async (req) => {
        const hits = await ipcHandlers.vaultSearch(req);
        return hits.map((r) => ({
          id: r.id,
          originalName: r.originalName,
          rank: r.rank,
        }));
      },
      // M31 T4 — agentic loop entry point for `complex_request`.
      // CommandService's dispatcher calls this with the original
      // user text; the service resolves the per-company system-
      // agent, opens a Copilot thread, and fires the ReAct loop in
      // the background. `runId`/`threadId` flow back to the palette
      // via the `ExecuteResult`.
      agenticLoopStart: (req) =>
        agenticLoopSvc.start({
          companyId: req.companyId,
          userText: req.text,
        }),
    },
    historyRepo: commandHistoryRepo,
    bus,
  });
  return runtime.commandServiceInstance;
}

export function registerCommandIpcHandlers(deps: { commandService: CommandService }): void {
  const { commandService } = deps;

  // ---- Command palette IPC handlers (Phase 5 — M30 T5, M31 T6) -----------
  //
  // Mounted as a sibling block rather than folded into `createIpcHandlers`
  // because CommandService sits above the handler factory — it consumes
  // other IPC handlers (tickets, projects, meetings, vault, employees)
  // as its dispatch target. The five channel strings are already listed
  // in `REQUEST_CHANNELS` so `unregisterIpc()` strips them on shutdown
  // alongside every other handler. M31 T6 adds `command.stop` for
  // agentic-loop cancellation; it needs the `AgenticLoopService` handle
  // directly (not through CommandService) because cancellation is
  // run-id-keyed rather than intent-keyed.
  if (runtime.agenticLoopServiceInstance === null) {
    throw new Error('agenticLoopServiceInstance must be initialized before command handlers');
  }
  const commandHandlers = buildCommandHandlers({
    commandService,
    agenticLoopService: runtime.agenticLoopServiceInstance,
  });
  ipcMain.handle('command.parse', (_evt, req: import('@team-x/shared-types').CommandParseRequest) =>
    commandHandlers['command.parse'](req),
  );
  ipcMain.handle('command.execute', (_evt, req: import('@team-x/shared-types').IpcExecuteRequest) =>
    commandHandlers['command.execute'](req),
  );
  ipcMain.handle(
    'command.history',
    (_evt, req: import('@team-x/shared-types').CommandHistoryRequest) =>
      commandHandlers['command.history'](req),
  );
  ipcMain.handle(
    'command.suggest',
    (_evt, req: import('@team-x/shared-types').CommandSuggestRequest) =>
      commandHandlers['command.suggest'](req),
  );
  ipcMain.handle('command.stop', (_evt, req: import('@team-x/shared-types').CommandStopRequest) =>
    commandHandlers['command.stop'](req),
  );
  // Phase 5 — M32 T0 / F1. Palette step-log backfill on mount.
  ipcMain.handle('command.getRunSnapshot', (_evt, req: { runId: string }) =>
    commandHandlers['command.getRunSnapshot'](req),
  );
}
