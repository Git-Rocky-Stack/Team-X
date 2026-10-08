/**
 * IPC handlers — Goals, projects and meetings.
 * Split from handlers.ts by bounded context (audit 2026-10-07 P1-7).
 */
import type { ChatMessage, Employee } from '@team-x/shared-types';

import type { HandlerContext } from './context.js';
import type { IpcHandlers } from './contract.js';
import { HUMAN_USER_ID } from './deps.js';
import {
  rowToChatMessage,
  rowToEmployee,
  rowToGoal,
  rowToMeeting,
  rowToProject,
} from './mappers.js';

export type PlanningHandlers = Pick<
  IpcHandlers,
  | 'goalsCreate'
  | 'goalsUpdate'
  | 'goalsList'
  | 'goalsGet'
  | 'goalsDelete'
  | 'projectsCreate'
  | 'projectsUpdate'
  | 'projectsList'
  | 'projectsGet'
  | 'projectsDelete'
  | 'projectsLinkTicket'
  | 'projectsUnlinkTicket'
  | 'meetingsCall'
  | 'meetingsEnd'
  | 'meetingsInterject'
  | 'meetingsList'
  | 'meetingsGet'
>;

export function createPlanningHandlers(ctx: HandlerContext): PlanningHandlers {
  const {
    employeesRepo,
    messagesRepo,
    goalsRepo,
    projectsRepo,
    meetingsRepo,
    meetingService,
    bus,
  } = ctx;
  return {
    // -----------------------------------------------------------------------
    // Goals management handlers (Phase 3 — M15)
    // -----------------------------------------------------------------------

    async goalsCreate(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] goals.create: companyId is required');
      }
      if (typeof req.title !== 'string' || req.title.trim().length === 0) {
        throw new Error('[ipc] goals.create: title is required');
      }
      const title = req.title.trim();
      const goalId = goalsRepo.create({
        companyId: req.companyId,
        title,
        description: req.description ?? '',
        targetDate: req.targetDate ?? null,
      });

      // Invariant #11 (Phase 5.6 M-C step f): IPC channels that mutate
      // state must emit a bus event so renderer caches invalidate.
      // Inline try/catch mirrors companies.create — a bus failure never
      // cascades into an IPC throw (the row is already durable).
      const createdAt = Date.now();
      if (bus) {
        try {
          bus.emit({
            type: 'goal.created',
            companyId: req.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: { goalId, companyId: req.companyId, title, createdAt },
          });
        } catch (err) {
          console.error(
            `[ipc] goals.create: bus emit failed (row still created with id ${goalId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] goals.create: bus dep unwired — renderer caches will NOT invalidate');
      }

      return { goalId };
    },

    async goalsUpdate(req) {
      if (typeof req.goalId !== 'string' || req.goalId.length === 0) {
        throw new Error('[ipc] goals.update: goalId is required');
      }
      const goal = goalsRepo.getById(req.goalId);
      if (!goal) {
        throw new Error(`[ipc] goals.update: goal not found: ${req.goalId}`);
      }

      // Compute patchedKeys from the request BEFORE the write — tracks
      // caller intent, not post-write row state. The 'progress' slot
      // fires only when `progressPct` was explicitly patched; linked-
      // project status changes emit via projects.update / projects.delete
      // (each calls goalsRepo.recalcProgress internally but does not
      // emit a goal.updated bus event — the project event is the delta).
      const patchedKeys: Array<'title' | 'description' | 'targetDate' | 'status' | 'progress'> = [];
      if (req.title !== undefined) patchedKeys.push('title');
      if (req.description !== undefined) patchedKeys.push('description');
      if (req.targetDate !== undefined) patchedKeys.push('targetDate');
      if (req.status !== undefined) patchedKeys.push('status');
      if (req.progressPct !== undefined) patchedKeys.push('progress');

      goalsRepo.update(req.goalId, {
        title: req.title,
        description: req.description,
        status: req.status,
        progressPct: req.progressPct,
        targetDate: req.targetDate,
      });

      // Re-read to capture post-write progressPct. DB column is 0..100
      // (integer). Payload normalizes to 0..1 so renderer progress bars
      // consume a ratio consistently across goal/project/ticket events.
      const updated = goalsRepo.getById(req.goalId);
      const progress = updated ? (updated.progressPct ?? 0) / 100 : 0;

      // Invariant #11.
      if (bus) {
        try {
          bus.emit({
            type: 'goal.updated',
            companyId: goal.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              goalId: req.goalId,
              companyId: goal.companyId,
              patchedKeys,
              progress,
              updatedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] goals.update: bus emit failed (row still updated, id=${req.goalId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] goals.update: bus dep unwired — renderer caches will NOT invalidate');
      }
    },

    async goalsList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] goals.list: companyId is required');
      }
      return goalsRepo.listByCompany(req.companyId).map(rowToGoal);
    },

    async goalsGet(req) {
      if (typeof req.goalId !== 'string' || req.goalId.length === 0) {
        throw new Error('[ipc] goals.get: goalId is required');
      }
      const goal = goalsRepo.getById(req.goalId);
      if (!goal) {
        throw new Error(`[ipc] goals.get: goal not found: ${req.goalId}`);
      }
      const linkedProjects = projectsRepo.listByGoal(req.goalId).map(rowToProject);
      return { ...rowToGoal(goal), projects: linkedProjects };
    },

    async goalsDelete(req) {
      if (typeof req.goalId !== 'string' || req.goalId.length === 0) {
        throw new Error('[ipc] goals.delete: goalId is required');
      }
      const goal = goalsRepo.getById(req.goalId);
      if (!goal) {
        throw new Error(`[ipc] goals.delete: goal not found: ${req.goalId}`);
      }

      // Capture snapshot BEFORE drop so the bus payload can carry title
      // (row is gone by the time the emit fires). Same capture-before-
      // drop rationale as company.deleted + project.deleted.
      const snapshotTitle = goal.title;
      const snapshotCompanyId = goal.companyId;

      goalsRepo.delete(req.goalId);

      // Invariant #11.
      if (bus) {
        try {
          bus.emit({
            type: 'goal.deleted',
            companyId: snapshotCompanyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              goalId: req.goalId,
              companyId: snapshotCompanyId,
              title: snapshotTitle,
              deletedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] goals.delete: bus emit failed (row still deleted, id=${req.goalId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] goals.delete: bus dep unwired — renderer caches will NOT invalidate');
      }
    },

    // -----------------------------------------------------------------------
    // Projects management handlers (Phase 3 — M15)
    // -----------------------------------------------------------------------

    async projectsCreate(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] projects.create: companyId is required');
      }
      if (typeof req.title !== 'string' || req.title.trim().length === 0) {
        throw new Error('[ipc] projects.create: title is required');
      }
      const title = req.title.trim();
      const goalId = req.goalId ?? null;
      const projectId = projectsRepo.create({
        companyId: req.companyId,
        goalId,
        title,
        description: req.description ?? '',
        leadId: req.leadId ?? null,
        priority: req.priority ?? 'medium',
        targetDate: req.targetDate ?? null,
      });

      // Invariant #11 (Phase 5.6 M-C step f).
      const createdAt = Date.now();
      if (bus) {
        try {
          bus.emit({
            type: 'project.created',
            companyId: req.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: { projectId, companyId: req.companyId, title, goalId, createdAt },
          });
        } catch (err) {
          console.error(
            `[ipc] projects.create: bus emit failed (row still created with id ${projectId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] projects.create: bus dep unwired — renderer caches will NOT invalidate',
        );
      }

      return { projectId };
    },

    async projectsUpdate(req) {
      if (typeof req.projectId !== 'string' || req.projectId.length === 0) {
        throw new Error('[ipc] projects.update: projectId is required');
      }
      const project = projectsRepo.getById(req.projectId);
      if (!project) {
        throw new Error(`[ipc] projects.update: project not found: ${req.projectId}`);
      }

      // Compute patchedKeys BEFORE the write to track caller intent.
      // Mirrors the `companies.update` patchedKeys convention.
      const patchedKeys: Array<
        'title' | 'description' | 'status' | 'goalId' | 'leadId' | 'priority' | 'targetDate'
      > = [];
      if (req.title !== undefined) patchedKeys.push('title');
      if (req.description !== undefined) patchedKeys.push('description');
      if (req.status !== undefined) patchedKeys.push('status');
      if (req.goalId !== undefined) patchedKeys.push('goalId');
      if (req.leadId !== undefined) patchedKeys.push('leadId');
      if (req.priority !== undefined) patchedKeys.push('priority');
      if (req.targetDate !== undefined) patchedKeys.push('targetDate');

      const previousGoalId = project.goalId;
      const nextGoalId = req.goalId !== undefined ? req.goalId : previousGoalId;
      const goalBindingChanged = req.goalId !== undefined && req.goalId !== previousGoalId;

      projectsRepo.update(req.projectId, {
        title: req.title,
        description: req.description,
        status: req.status,
        goalId: req.goalId,
        leadId: req.leadId,
        priority: req.priority,
        targetDate: req.targetDate,
      });

      if ((req.status !== undefined || goalBindingChanged) && previousGoalId) {
        goalsRepo.recalcProgress(previousGoalId);
      }
      if (goalBindingChanged && nextGoalId && nextGoalId !== previousGoalId) {
        goalsRepo.recalcProgress(nextGoalId);
      }

      // Invariant #11.
      if (bus) {
        try {
          bus.emit({
            type: 'project.updated',
            companyId: project.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              projectId: req.projectId,
              companyId: project.companyId,
              patchedKeys,
              updatedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] projects.update: bus emit failed (row still updated, id=${req.projectId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] projects.update: bus dep unwired — renderer caches will NOT invalidate',
        );
      }
    },

    async projectsList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] projects.list: companyId is required');
      }
      return projectsRepo.listByCompany(req.companyId).map(rowToProject);
    },

    async projectsGet(req) {
      if (typeof req.projectId !== 'string' || req.projectId.length === 0) {
        throw new Error('[ipc] projects.get: projectId is required');
      }
      const project = projectsRepo.getById(req.projectId);
      if (!project) {
        throw new Error(`[ipc] projects.get: project not found: ${req.projectId}`);
      }
      const ticketIds = projectsRepo.listTickets(req.projectId);
      const ticketCounts = projectsRepo.countTicketsByStatus(req.projectId);
      let lead: Employee | null = null;
      if (project.leadId) {
        const empRow = employeesRepo.getById(project.leadId);
        if (empRow) lead = rowToEmployee(empRow);
      }
      return {
        ...rowToProject(project),
        ticketIds,
        lead,
        ticketCounts,
      };
    },

    async projectsDelete(req) {
      if (typeof req.projectId !== 'string' || req.projectId.length === 0) {
        throw new Error('[ipc] projects.delete: projectId is required');
      }
      const project = projectsRepo.getById(req.projectId);
      if (!project) {
        throw new Error(`[ipc] projects.delete: project not found: ${req.projectId}`);
      }
      const goalId = project.goalId;
      // Capture snapshot BEFORE drop — see company.deleted / goal.deleted rationale.
      const snapshotTitle = project.title;
      const snapshotCompanyId = project.companyId;

      projectsRepo.delete(req.projectId);
      // Recalc parent goal progress after deleting
      if (goalId) {
        goalsRepo.recalcProgress(goalId);
      }

      // Invariant #11.
      if (bus) {
        try {
          bus.emit({
            type: 'project.deleted',
            companyId: snapshotCompanyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              projectId: req.projectId,
              companyId: snapshotCompanyId,
              title: snapshotTitle,
              deletedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] projects.delete: bus emit failed (row still deleted, id=${req.projectId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] projects.delete: bus dep unwired — renderer caches will NOT invalidate',
        );
      }
    },

    async projectsLinkTicket(req) {
      if (typeof req.projectId !== 'string' || req.projectId.length === 0) {
        throw new Error('[ipc] projects.linkTicket: projectId is required');
      }
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] projects.linkTicket: ticketId is required');
      }
      // Fetch project to thread companyId through to the bus event
      // (Phase 5.6 M-C step f — required by invariant #11 payload shape;
      // doubles as a validation guard for phantom projectIds).
      const project = projectsRepo.getById(req.projectId);
      if (!project) {
        throw new Error(`[ipc] projects.linkTicket: project not found: ${req.projectId}`);
      }
      projectsRepo.linkTicket(req.projectId, req.ticketId);

      // Invariant #11.
      if (bus) {
        try {
          bus.emit({
            type: 'project.ticketLinked',
            companyId: project.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              projectId: req.projectId,
              companyId: project.companyId,
              ticketId: req.ticketId,
              linkedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] projects.linkTicket: bus emit failed (link still persisted, project=${req.projectId}, ticket=${req.ticketId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] projects.linkTicket: bus dep unwired — renderer caches will NOT invalidate',
        );
      }
    },

    async projectsUnlinkTicket(req) {
      if (typeof req.projectId !== 'string' || req.projectId.length === 0) {
        throw new Error('[ipc] projects.unlinkTicket: projectId is required');
      }
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] projects.unlinkTicket: ticketId is required');
      }
      const project = projectsRepo.getById(req.projectId);
      if (!project) {
        throw new Error(`[ipc] projects.unlinkTicket: project not found: ${req.projectId}`);
      }
      projectsRepo.unlinkTicket(req.projectId, req.ticketId);

      // Invariant #11.
      if (bus) {
        try {
          bus.emit({
            type: 'project.ticketUnlinked',
            companyId: project.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              projectId: req.projectId,
              companyId: project.companyId,
              ticketId: req.ticketId,
              unlinkedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] projects.unlinkTicket: bus emit failed (unlink still persisted, project=${req.projectId}, ticket=${req.ticketId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] projects.unlinkTicket: bus dep unwired — renderer caches will NOT invalidate',
        );
      }
    },

    // -----------------------------------------------------------------------
    // Meeting management handlers (Phase 3 — M16)
    // -----------------------------------------------------------------------

    async meetingsCall(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] meetings.call: companyId is required');
      }
      if (typeof req.chairId !== 'string' || req.chairId.length === 0) {
        throw new Error('[ipc] meetings.call: chairId is required');
      }
      if (!Array.isArray(req.attendeeIds) || req.attendeeIds.length === 0) {
        throw new Error('[ipc] meetings.call: attendeeIds must be a non-empty array');
      }
      return meetingService.callMeeting({
        companyId: req.companyId,
        chairId: req.chairId,
        attendeeIds: req.attendeeIds,
        agenda: req.agenda ?? '',
        mode: req.mode,
      });
    },

    async meetingsEnd(req) {
      if (typeof req.meetingId !== 'string' || req.meetingId.length === 0) {
        throw new Error('[ipc] meetings.end: meetingId is required');
      }
      return meetingService.endMeeting(req.meetingId);
    },

    async meetingsInterject(req) {
      if (typeof req.meetingId !== 'string' || req.meetingId.length === 0) {
        throw new Error('[ipc] meetings.interject: meetingId is required');
      }
      if (typeof req.content !== 'string' || req.content.trim().length === 0) {
        throw new Error('[ipc] meetings.interject: content is required');
      }
      return meetingService.interject(req.meetingId, req.content);
    },

    async meetingsList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] meetings.list: companyId is required');
      }
      return meetingsRepo.listByCompany(req.companyId).map(rowToMeeting);
    },

    async meetingsGet(req) {
      if (typeof req.meetingId !== 'string' || req.meetingId.length === 0) {
        throw new Error('[ipc] meetings.get: meetingId is required');
      }
      const meeting = meetingsRepo.getById(req.meetingId);
      if (!meeting) {
        throw new Error(`[ipc] meetings.get: meeting not found: ${req.meetingId}`);
      }

      // Fetch thread messages
      let messages: ChatMessage[] = [];
      if (meeting.threadId) {
        const rows = messagesRepo.listByThread(meeting.threadId);
        messages = rows.map(rowToChatMessage);
      }

      // Fetch chair employee
      let chair: Employee | null = null;
      const chairRow = employeesRepo.getById(meeting.chairId);
      if (chairRow) chair = rowToEmployee(chairRow);

      return {
        ...rowToMeeting(meeting),
        messages,
        chair,
      };
    },
  };
}
