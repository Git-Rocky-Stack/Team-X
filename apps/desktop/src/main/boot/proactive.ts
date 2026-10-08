/**
 * Boot phase — the proactive trigger service (Phase 6 — Slice 1-3) and its
 * governed dispatcher.
 */

import { createProactiveDispatcher } from '../orchestrator/index.js';
import { createProactiveTriggerService } from '../services/proactive-trigger-service.js';

import type { GovernanceServices } from './governance-services.js';
import type { PlatformServices } from './platform-services.js';
import type { Repositories } from './repositories.js';
import { runtime } from './runtime-state.js';

export interface ProactiveTriggerDeps
  extends Pick<
      Repositories,
      | 'authorityResolver'
      | 'employeesRepo'
      | 'goalsRepo'
      | 'projectsRepo'
      | 'settingsRepo'
      | 'companiesRepo'
      | 'threadsRepo'
      | 'messagesRepo'
    >,
    Pick<PlatformServices, 'bus'>,
    Pick<GovernanceServices, 'ticketsRepo' | 'budgetGovernanceService'> {}

export function bootProactiveTrigger(deps: ProactiveTriggerDeps): void {
  const {
    authorityResolver,
    employeesRepo,
    goalsRepo,
    projectsRepo,
    settingsRepo,
    companiesRepo,
    threadsRepo,
    messagesRepo,
    bus,
    ticketsRepo,
    budgetGovernanceService,
  } = deps;

  // ---- Proactive trigger service (Phase 6 — Slice 1-3) ----------------
  //
  // Goal decomposition + background work scanning + setEnabled toggle.
  // Constructed HERE because the trigger consumes `agenticLoopService`
  // (created by the previous boot phase) and `orchestrator.isCompanyPaused`. The IPC
  // surface registered earlier closes over `proactiveTriggerServiceInstance`
  // via a lazy resolver — see the `proactiveTriggerService` block in the
  // `createIpcHandlers({...})` deps. Without this assignment, the
  // proactive.* IPC channels throw and the autonomy-policy Switch in
  // Settings snaps back to OFF after every flip.
  runtime.proactiveTriggerServiceInstance = createProactiveTriggerService({
    orchestrator: {
      enqueueChat: async (args) => {
        if (!runtime.orchestrator) {
          throw new Error('[proactive] orchestrator not available for enqueueChat');
        }
        await runtime.orchestrator.enqueueChat(args);
      },
      isCompanyPaused: (cid) => runtime.orchestrator?.isCompanyPaused(cid) ?? false,
    },
    agenticLoopService: {
      /*
       * Composition order guarantees `agenticLoopServiceInstance` is
       * initialized before any IPC consumer of this dep struct can fire;
       * the optional-chaining alternative would silently return undefined
       * instead of throwing, which violates the ResolveProvider contract
       * on `start`.
       */
      start: (args) => {
        if (!runtime.agenticLoopServiceInstance) {
          throw new Error(
            'agenticLoopService.start called before agenticLoopServiceInstance was initialized — composition-order invariant violated',
          );
        }
        return runtime.agenticLoopServiceInstance.start(args);
      },
    },
    authorityResolver: {
      resolveEmployee: (cid, eid) => authorityResolver.resolveEmployee(cid, eid),
    },
    employeesRepo: {
      getById: (id) => {
        const row = employeesRepo.getById(id);
        if (!row) return null;
        return {
          id: row.id,
          companyId: row.companyId,
          level: row.level,
          isSystem: row.isSystem ?? false,
        };
      },
      listByCompany: (cid) =>
        employeesRepo.listByCompany(cid).map((e) => ({
          id: e.id,
          companyId: e.companyId,
          level: e.level,
          isSystem: e.isSystem ?? false,
        })),
    },
    goalsRepo: {
      listByCompany: (cid) =>
        goalsRepo.listByCompany(cid).map((g) => ({
          id: g.id,
          companyId: g.companyId,
          title: g.title,
          description: g.description ?? '',
          status: g.status,
        })),
    },
    ticketsRepo: {
      listByCompany: (cid) =>
        ticketsRepo.listByCompany(cid).map((t) => ({
          id: t.id,
          companyId: t.companyId,
          title: t.title,
          description: t.description ?? '',
          status: t.status,
          assigneeId: t.assigneeId ?? null,
          reporterId: t.reporterId,
          reporterKind: t.reporterKind,
          priority: t.priority,
        })),
    },
    projectsRepo: {
      listByCompany: (cid) =>
        projectsRepo.listByCompany(cid).map((p) => ({
          id: p.id,
          companyId: p.companyId,
          goalId: p.goalId ?? null,
          title: p.title,
          description: p.description ?? '',
          status: p.status,
        })),
    },
    bus: {
      // The proactive trigger service narrows `actorKind` to `string`
      // in its structural deps (so its tests can hand-roll fakes
      // without depending on the shared-types `ActorKind` union). At
      // runtime it only emits canonical values (`'orchestrator'`,
      // `'employee'`, `'system'`), so widening at this boundary via
      // a cast is sound and keeps the trigger service decoupled
      // from the wire enum.
      emit: (input) =>
        bus.emit({
          ...input,
          actorKind: input.actorKind as Parameters<typeof bus.emit>[0]['actorKind'],
        }),
    },
    settingsRepo: {
      getProactive: () => settingsRepo.getProactive(),
    },
    // Per-company proactive opt-out lives in companies.settings JSON.
    companiesRepo: {
      getById: (id) => companiesRepo.getById(id),
      update: (id, patch) => companiesRepo.update(id, patch),
    },
    // ---- Governed proactive dispatch (audit F3) ----------------------
    //
    // `scanForWork` used to synthesize `proactive-thread-*` /
    // `proactive-msg-*` ids for rows that were never inserted and call
    // `orchestrator.enqueueChat` directly, which meant proactive work
    // bypassed budget admission entirely. `createProactiveDispatcher`
    // already implemented the correct path (thread + trigger-message
    // creation, `budgetGovernance.assertExecutionAllowed`, pause
    // re-check, `proactive.*` lifecycle events) and was fully tested,
    // but had never been instantiated. It is now the only dispatch
    // route — the dep is required, so there is no ungoverned fallback.
    dispatcher: createProactiveDispatcher({
      orchestrator: {
        enqueueChat: async (args) => {
          if (!runtime.orchestrator) {
            throw new Error('[proactive] orchestrator not available for enqueueChat');
          }
          await runtime.orchestrator.enqueueChat(args);
        },
        isCompanyPaused: (cid) => runtime.orchestrator?.isCompanyPaused(cid) ?? false,
      },
      threadsRepo: {
        create: (input) =>
          threadsRepo.create({
            companyId: input.companyId,
            kind: input.kind as Parameters<typeof threadsRepo.create>[0]['kind'],
            createdBy: input.createdBy,
          }),
        getById: (id) => {
          const row = threadsRepo.getById(id);
          return row ? { companyId: row.companyId, kind: row.kind } : null;
        },
      },
      messagesRepo: {
        append: (input) =>
          messagesRepo.append({
            threadId: input.threadId,
            authorId: input.authorId,
            authorKind: input.authorKind as Parameters<typeof messagesRepo.append>[0]['authorKind'],
            content: input.content,
          }),
      },
      employeesRepo: {
        getById: (id) => {
          const row = employeesRepo.getById(id);
          if (!row) return null;
          return { id: row.id, companyId: row.companyId, isSystem: row.isSystem ?? false };
        },
      },
      companiesRepo: {
        getById: (id) => {
          const row = companiesRepo.getById(id);
          return row ? { id: row.id } : null;
        },
      },
      bus: {
        emit: (input) =>
          bus.emit({
            ...input,
            actorKind: input.actorKind as Parameters<typeof bus.emit>[0]['actorKind'],
          }),
      },
      budgetGovernance: budgetGovernanceService,
      // Audit F6 — the blocked-event payload must carry the operator's
      // real autonomy posture, not a hardcoded 'balanced'.
      settingsRepo: {
        getProactive: () => settingsRepo.getProactive(),
      },
    }),
  });
}
