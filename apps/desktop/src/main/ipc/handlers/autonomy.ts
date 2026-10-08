/**
 * IPC handlers — Autonomy control plane: runtime profiles and operations,
 * doctor, benchmarks, improvement, routines, budgets, approvals, artifacts,
 * long-run memory.
 * Split from handlers.ts by bounded context (audit 2026-10-07 P1-7).
 */

import {
  AUTONOMY_BENCHMARK_SCENARIO_IDS,
  BUDGET_SCOPE_KINDS,
  ROUTINE_TRIGGER_KINDS,
  RUNTIME_PROFILE_KINDS,
} from '@team-x/shared-types';

import type { HandlerContext } from './context.js';
import type { IpcHandlers } from './contract.js';
import { HUMAN_USER_ID } from './deps.js';

export type AutonomyHandlers = Pick<
  IpcHandlers,
  | 'runtimeProfilesList'
  | 'runtimeProfilesCreate'
  | 'runtimeProfilesUpdate'
  | 'runtimeProfilesDelete'
  | 'runtimeProfilesBindEmployee'
  | 'runtimeProfilesValidate'
  | 'runtimeOperationsSnapshot'
  | 'autonomyDoctorRun'
  | 'autonomyBenchmarkRun'
  | 'agentImprovementList'
  | 'agentImprovementRun'
  | 'routinesList'
  | 'routinesCreate'
  | 'routinesUpdate'
  | 'routinesDelete'
  | 'routinesListRuns'
  | 'routinesRunNow'
  | 'budgetsListPolicies'
  | 'budgetsCreatePolicy'
  | 'budgetsUpdatePolicy'
  | 'budgetsDeletePolicy'
  | 'budgetsListLedger'
  | 'budgetsGetOverview'
  | 'budgetsListApprovals'
  | 'approvalsList'
  | 'approvalsReview'
  | 'artifactsList'
  | 'memoryGetThreadDigest'
  | 'memoryListRunCheckpoints'
  | 'memoryPackThreadContext'
>;

export function createAutonomyHandlers(ctx: HandlerContext): AutonomyHandlers {
  const {
    threadsRepo,
    operatorAccessService,
    runtimeProfilesService,
    runtimeOperationsService,
    autonomyDoctorService,
    autonomyBenchmarkService,
    agentImprovementService,
    routineService,
    budgetGovernanceService,
    approvalInboxService,
    artifactService,
    threadDigestService,
    runCheckpointService,
    contextAssemblerService,
    contextPackerService,
    emitApprovalReviewAudit,
  } = ctx;
  return {
    async runtimeProfilesList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] runtimeProfiles.list: companyId is required');
      }
      if (!runtimeProfilesService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] runtimeProfiles.list: runtimeProfilesService dep unwired — returning an empty runtime profile set',
          );
        }
        return [];
      }
      return runtimeProfilesService.list(req.companyId);
    },

    async runtimeProfilesCreate(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] runtimeProfiles.create: companyId is required');
      }
      if (typeof req.name !== 'string' || req.name.trim().length === 0) {
        throw new Error('[ipc] runtimeProfiles.create: name is required');
      }
      if (!RUNTIME_PROFILE_KINDS.includes(req.kind)) {
        throw new Error(`[ipc] runtimeProfiles.create: invalid runtime kind "${String(req.kind)}"`);
      }
      if (!runtimeProfilesService) {
        throw new Error('[ipc] runtimeProfiles.create: runtimeProfilesService dep is required');
      }
      return { profileId: runtimeProfilesService.create(req) };
    },

    async runtimeProfilesUpdate(req) {
      if (typeof req.profileId !== 'string' || req.profileId.length === 0) {
        throw new Error('[ipc] runtimeProfiles.update: profileId is required');
      }
      if (
        req.name !== undefined &&
        (typeof req.name !== 'string' || req.name.trim().length === 0)
      ) {
        throw new Error('[ipc] runtimeProfiles.update: name must be non-empty when provided');
      }
      if (req.kind !== undefined && !RUNTIME_PROFILE_KINDS.includes(req.kind)) {
        throw new Error(`[ipc] runtimeProfiles.update: invalid runtime kind "${String(req.kind)}"`);
      }
      if (!runtimeProfilesService) {
        throw new Error('[ipc] runtimeProfiles.update: runtimeProfilesService dep is required');
      }
      runtimeProfilesService.update(req);
    },

    async runtimeProfilesDelete(req) {
      if (typeof req.profileId !== 'string' || req.profileId.length === 0) {
        throw new Error('[ipc] runtimeProfiles.delete: profileId is required');
      }
      if (!runtimeProfilesService) {
        throw new Error('[ipc] runtimeProfiles.delete: runtimeProfilesService dep is required');
      }
      runtimeProfilesService.delete(req.profileId);
    },

    async runtimeProfilesBindEmployee(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] runtimeProfiles.bindEmployee: companyId is required');
      }
      if (typeof req.employeeId !== 'string' || req.employeeId.length === 0) {
        throw new Error('[ipc] runtimeProfiles.bindEmployee: employeeId is required');
      }
      if (req.runtimeProfileId !== null && typeof req.runtimeProfileId !== 'string') {
        throw new Error(
          '[ipc] runtimeProfiles.bindEmployee: runtimeProfileId must be a string or null',
        );
      }
      if (!runtimeProfilesService) {
        throw new Error(
          '[ipc] runtimeProfiles.bindEmployee: runtimeProfilesService dep is required',
        );
      }
      return {
        binding: runtimeProfilesService.bindEmployee(req),
      };
    },

    async runtimeProfilesValidate(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] runtimeProfiles.validate: companyId is required');
      }
      if (typeof req.profileId !== 'string' || req.profileId.length === 0) {
        throw new Error('[ipc] runtimeProfiles.validate: profileId is required');
      }
      if (!runtimeProfilesService) {
        throw new Error('[ipc] runtimeProfiles.validate: runtimeProfilesService dep is required');
      }
      return runtimeProfilesService.validateProfile(req);
    },

    async runtimeOperationsSnapshot(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] runtimeOperations.snapshot: companyId is required');
      }
      if (!runtimeOperationsService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] runtimeOperations.snapshot: runtimeOperationsService dep unwired — returning an empty runtime operations snapshot',
          );
        }
        return {
          companyId: req.companyId,
          generatedAt: Date.now(),
          sessions: [],
          activeCheckouts: [],
        };
      }
      return runtimeOperationsService.snapshot(req.companyId);
    },

    async autonomyDoctorRun(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] autonomyDoctor.run: companyId is required');
      }
      if (!autonomyDoctorService) {
        throw new Error('[ipc] autonomyDoctor.run: autonomyDoctorService dep is required');
      }
      return autonomyDoctorService.run(req);
    },

    async autonomyBenchmarkRun(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] autonomyBenchmark.run: companyId is required');
      }
      if (req.runtimeKinds !== undefined) {
        if (!Array.isArray(req.runtimeKinds)) {
          throw new Error('[ipc] autonomyBenchmark.run: runtimeKinds must be an array');
        }
        for (const runtimeKind of req.runtimeKinds) {
          if (!RUNTIME_PROFILE_KINDS.includes(runtimeKind)) {
            throw new Error(`[ipc] autonomyBenchmark.run: unknown runtime kind ${runtimeKind}`);
          }
        }
      }
      if (req.scenarioIds !== undefined) {
        if (!Array.isArray(req.scenarioIds)) {
          throw new Error('[ipc] autonomyBenchmark.run: scenarioIds must be an array');
        }
        for (const scenarioId of req.scenarioIds) {
          if (!AUTONOMY_BENCHMARK_SCENARIO_IDS.includes(scenarioId)) {
            throw new Error(`[ipc] autonomyBenchmark.run: unknown scenario ${scenarioId}`);
          }
        }
      }
      if (!autonomyBenchmarkService) {
        throw new Error('[ipc] autonomyBenchmark.run: autonomyBenchmarkService dep is required');
      }
      return autonomyBenchmarkService.run(req);
    },

    async agentImprovementList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] agentImprovement.list: companyId is required');
      }
      if (req.limit !== undefined && (!Number.isFinite(req.limit) || req.limit <= 0)) {
        throw new Error('[ipc] agentImprovement.list: limit must be a positive number');
      }
      if (!agentImprovementService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] agentImprovement.list: agentImprovementService dep unwired — returning an empty self-improvement snapshot',
          );
        }
        return {
          companyId: req.companyId,
          generatedAt: Date.now(),
          openTicketCount: 0,
          openTickets: [],
          recentRuns: [],
        };
      }
      return agentImprovementService.list(req);
    },

    async agentImprovementRun(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] agentImprovement.run: companyId is required');
      }
      if (
        req.eventLimit !== undefined &&
        (!Number.isFinite(req.eventLimit) || req.eventLimit <= 0)
      ) {
        throw new Error('[ipc] agentImprovement.run: eventLimit must be a positive number');
      }
      if (req.dryRun !== undefined && typeof req.dryRun !== 'boolean') {
        throw new Error('[ipc] agentImprovement.run: dryRun must be a boolean when provided');
      }
      if (!agentImprovementService) {
        throw new Error('[ipc] agentImprovement.run: agentImprovementService dep is required');
      }
      return agentImprovementService.run(req);
    },

    async routinesList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] routines.list: companyId is required');
      }
      if (!routineService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] routines.list: routineService dep unwired — returning an empty routine set',
          );
        }
        return [];
      }
      return routineService.list(req.companyId);
    },

    async routinesCreate(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] routines.create: companyId is required');
      }
      if (typeof req.name !== 'string' || req.name.trim().length === 0) {
        throw new Error('[ipc] routines.create: name is required');
      }
      if (
        !req.schedule ||
        typeof req.schedule !== 'object' ||
        !ROUTINE_TRIGGER_KINDS.includes(req.schedule.triggerKind)
      ) {
        throw new Error('[ipc] routines.create: schedule.triggerKind is invalid');
      }
      if (!req.workConfig || typeof req.workConfig !== 'object') {
        throw new Error('[ipc] routines.create: workConfig is required');
      }
      if (!routineService) {
        throw new Error('[ipc] routines.create: routineService dep is required');
      }
      return { routineId: routineService.create(req) };
    },

    async routinesUpdate(req) {
      if (typeof req.routineId !== 'string' || req.routineId.length === 0) {
        throw new Error('[ipc] routines.update: routineId is required');
      }
      if (
        req.name !== undefined &&
        (typeof req.name !== 'string' || req.name.trim().length === 0)
      ) {
        throw new Error('[ipc] routines.update: name must be non-empty when provided');
      }
      if (
        req.schedule !== undefined &&
        (!req.schedule ||
          typeof req.schedule !== 'object' ||
          !ROUTINE_TRIGGER_KINDS.includes(req.schedule.triggerKind))
      ) {
        throw new Error('[ipc] routines.update: schedule.triggerKind is invalid');
      }
      if (req.workConfig !== undefined && (!req.workConfig || typeof req.workConfig !== 'object')) {
        throw new Error('[ipc] routines.update: workConfig must be an object when provided');
      }
      if (!routineService) {
        throw new Error('[ipc] routines.update: routineService dep is required');
      }
      routineService.update(req);
    },

    async routinesDelete(req) {
      if (typeof req.routineId !== 'string' || req.routineId.length === 0) {
        throw new Error('[ipc] routines.delete: routineId is required');
      }
      if (!routineService) {
        throw new Error('[ipc] routines.delete: routineService dep is required');
      }
      routineService.delete(req.routineId);
    },

    async routinesListRuns(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] routines.listRuns: companyId is required');
      }
      if (req.routineId !== undefined && typeof req.routineId !== 'string') {
        throw new Error('[ipc] routines.listRuns: routineId must be a string when provided');
      }
      if (!routineService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] routines.listRuns: routineService dep unwired — returning an empty run set',
          );
        }
        return [];
      }
      return routineService.listRuns(req);
    },

    async routinesRunNow(req) {
      if (typeof req.routineId !== 'string' || req.routineId.length === 0) {
        throw new Error('[ipc] routines.runNow: routineId is required');
      }
      if (!routineService) {
        throw new Error('[ipc] routines.runNow: routineService dep is required');
      }
      return routineService.runNow(req);
    },

    async budgetsListPolicies(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] budgets.listPolicies: companyId is required');
      }
      if (!budgetGovernanceService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] budgets.listPolicies: budgetGovernanceService dep unwired — returning empty policy set',
          );
        }
        return [];
      }
      return budgetGovernanceService.listPolicies(req.companyId);
    },

    async budgetsCreatePolicy(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] budgets.createPolicy: companyId is required');
      }
      if (!BUDGET_SCOPE_KINDS.includes(req.scopeKind)) {
        throw new Error(`[ipc] budgets.createPolicy: invalid scopeKind "${String(req.scopeKind)}"`);
      }
      if (
        req.scopeKind !== 'company' &&
        (typeof req.scopeRefId !== 'string' || req.scopeRefId.trim().length === 0)
      ) {
        throw new Error(
          '[ipc] budgets.createPolicy: scopeRefId is required for non-company scopes',
        );
      }
      if (typeof req.hardCapUsd !== 'string' || req.hardCapUsd.trim().length === 0) {
        throw new Error('[ipc] budgets.createPolicy: hardCapUsd is required');
      }
      if (!budgetGovernanceService) {
        throw new Error('[ipc] budgets.createPolicy: budgetGovernanceService dep is required');
      }
      return { policyId: budgetGovernanceService.createPolicy(req) };
    },

    async budgetsUpdatePolicy(req) {
      if (typeof req.policyId !== 'string' || req.policyId.length === 0) {
        throw new Error('[ipc] budgets.updatePolicy: policyId is required');
      }
      if (!budgetGovernanceService) {
        throw new Error('[ipc] budgets.updatePolicy: budgetGovernanceService dep is required');
      }
      budgetGovernanceService.updatePolicy(req);
    },

    async budgetsDeletePolicy(req) {
      if (typeof req.policyId !== 'string' || req.policyId.length === 0) {
        throw new Error('[ipc] budgets.deletePolicy: policyId is required');
      }
      if (!budgetGovernanceService) {
        throw new Error('[ipc] budgets.deletePolicy: budgetGovernanceService dep is required');
      }
      budgetGovernanceService.deletePolicy(req.policyId);
    },

    async budgetsListLedger(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] budgets.listLedger: companyId is required');
      }
      if (req.scopeKind !== undefined && !BUDGET_SCOPE_KINDS.includes(req.scopeKind)) {
        throw new Error(`[ipc] budgets.listLedger: invalid scopeKind "${String(req.scopeKind)}"`);
      }
      if (!budgetGovernanceService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] budgets.listLedger: budgetGovernanceService dep unwired — returning empty ledger',
          );
        }
        return [];
      }
      return budgetGovernanceService.listLedgerEntries(req);
    },

    async budgetsGetOverview(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] budgets.getOverview: companyId is required');
      }
      if (!budgetGovernanceService) {
        throw new Error('[ipc] budgets.getOverview: budgetGovernanceService dep is required');
      }
      return budgetGovernanceService.getOverview(req.companyId);
    },

    async budgetsListApprovals(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] budgets.listApprovals: companyId is required');
      }
      if (approvalInboxService) {
        return approvalInboxService.listItems({
          companyId: req.companyId,
          kind: 'budget-exception',
          status: req.status,
        });
      }
      if (!budgetGovernanceService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] budgets.listApprovals: budgetGovernanceService dep unwired — returning empty approval set',
          );
        }
        return [];
      }
      return budgetGovernanceService.listApprovalItems({
        companyId: req.companyId,
        status: req.status,
      });
    },

    async approvalsList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] approvals.list: companyId is required');
      }
      if (!approvalInboxService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] approvals.list: approvalInboxService dep unwired — returning empty approval set',
          );
        }
        return [];
      }
      return approvalInboxService.listItems(req);
    },

    async approvalsReview(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] approvals.review: companyId is required');
      }
      if (typeof req.itemId !== 'string' || req.itemId.length === 0) {
        throw new Error('[ipc] approvals.review: itemId is required');
      }
      if (!approvalInboxService) {
        throw new Error('[ipc] approvals.review: approvalInboxService dep unwired');
      }
      const operatorId = operatorAccessService
        ? operatorAccessService.resolveOperatorIdForCompany(req.companyId, req.operatorId)
        : HUMAN_USER_ID;
      const result = await approvalInboxService.reviewItem({
        companyId: req.companyId,
        itemId: req.itemId,
        kind: req.kind,
        decision: req.decision,
        rationale: req.rationale?.trim() || undefined,
        operatorId,
      });
      emitApprovalReviewAudit(req.companyId, result.item, result.grantId);
      return { grantId: result.grantId };
    },

    async artifactsList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] artifacts.list: companyId is required');
      }
      if (
        req.limit !== undefined &&
        (!Number.isInteger(req.limit) || req.limit < 1 || req.limit > 200)
      ) {
        throw new Error('[ipc] artifacts.list: limit must be an integer between 1 and 200');
      }
      if (!artifactService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] artifacts.list: artifactService dep unwired — returning empty artifact set',
          );
        }
        return [];
      }
      return artifactService.list({
        companyId: req.companyId,
        limit: req.limit,
      });
    },

    async memoryGetThreadDigest(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] memory.getThreadDigest: companyId is required');
      }
      if (typeof req.threadId !== 'string' || req.threadId.length === 0) {
        throw new Error('[ipc] memory.getThreadDigest: threadId is required');
      }
      const thread = threadsRepo.getById(req.threadId);
      if (!thread || thread.companyId !== req.companyId) {
        throw new Error('[ipc] memory.getThreadDigest: thread does not belong to company');
      }
      if (!threadDigestService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] memory.getThreadDigest: threadDigestService dep unwired — returning null',
          );
        }
        return null;
      }
      return threadDigestService.getLatest(req);
    },

    async memoryListRunCheckpoints(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] memory.listRunCheckpoints: companyId is required');
      }
      if (typeof req.threadId !== 'string' || req.threadId.length === 0) {
        throw new Error('[ipc] memory.listRunCheckpoints: threadId is required');
      }
      const thread = threadsRepo.getById(req.threadId);
      if (!thread || thread.companyId !== req.companyId) {
        throw new Error('[ipc] memory.listRunCheckpoints: thread does not belong to company');
      }
      if (
        req.limit !== undefined &&
        (!Number.isInteger(req.limit) || req.limit < 1 || req.limit > 100)
      ) {
        throw new Error(
          '[ipc] memory.listRunCheckpoints: limit must be an integer between 1 and 100',
        );
      }
      if (!runCheckpointService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] memory.listRunCheckpoints: runCheckpointService dep unwired — returning empty set',
          );
        }
        return [];
      }
      return runCheckpointService.listByThread(req);
    },

    async memoryPackThreadContext(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] memory.packThreadContext: companyId is required');
      }
      if (typeof req.threadId !== 'string' || req.threadId.length === 0) {
        throw new Error('[ipc] memory.packThreadContext: threadId is required');
      }
      const thread = threadsRepo.getById(req.threadId);
      if (!thread || thread.companyId !== req.companyId) {
        throw new Error('[ipc] memory.packThreadContext: thread does not belong to company');
      }
      if (
        req.targetTokenBudget !== undefined &&
        (!Number.isInteger(req.targetTokenBudget) ||
          req.targetTokenBudget < 128 ||
          req.targetTokenBudget > 64000)
      ) {
        throw new Error(
          '[ipc] memory.packThreadContext: targetTokenBudget must be an integer between 128 and 64000',
        );
      }
      if (
        req.recentTurnLimit !== undefined &&
        (!Number.isInteger(req.recentTurnLimit) ||
          req.recentTurnLimit < 1 ||
          req.recentTurnLimit > 100)
      ) {
        throw new Error(
          '[ipc] memory.packThreadContext: recentTurnLimit must be an integer between 1 and 100',
        );
      }
      if (!contextAssemblerService || !contextPackerService) {
        throw new Error('[ipc] memory.packThreadContext: context services are required');
      }
      const context = await contextAssemblerService.assembleThreadContext({
        companyId: req.companyId,
        threadId: req.threadId,
        recentTurnLimit: req.recentTurnLimit,
      });
      return contextPackerService.packContext({
        context,
        targetTokenBudget: req.targetTokenBudget,
      });
    },
  };
}
