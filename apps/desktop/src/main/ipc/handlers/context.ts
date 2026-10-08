import type {
  ActorKind,
  ApprovalItem,
  AuthorKind,
  EventType,
  ScheduleItem,
  TicketPriority,
} from '@team-x/shared-types';

import type { EmployeeRow } from '../../db/repos/employees.js';
import type { TicketRow } from '../../db/repos/tickets.js';

import type { IpcHandlers } from './contract.js';
import { HUMAN_USER_ID, type IpcHandlerDeps } from './deps.js';
import { rowToScheduleItem, schedulePriorityWeight } from './mappers.js';

/**
 * State every handler module shares: the injected dependencies plus the
 * audit, ticket-thread and schedule-wakeup helpers several contexts use.
 * `handlers()` returns the composed handler record, for the rare handler
 * that delegates to another (authority review -> approvals review).
 */
export function createHandlerContext(deps: IpcHandlerDeps, handlers: () => IpcHandlers) {
  const {
    employeesRepo,
    threadsRepo,
    messagesRepo,
    ticketsRepo,
    goalsRepo,
    projectsRepo,
    scheduleItemsRepo,
    agentWakeupRequestsRepo,
    orchestrator,
    bus,
  } = deps;

  function emitUserAuditEvent<T>(
    type: EventType,
    companyId: string,
    payload: T,
    actorId = HUMAN_USER_ID,
    actorKind: ActorKind = 'user',
  ): void {
    if (!bus) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[ipc] ${type}: bus dep unwired — audit log will NOT capture this mutation`);
      }
      return;
    }
    try {
      bus.emit({
        type,
        companyId,
        actorId,
        actorKind,
        payload,
      });
    } catch (err) {
      console.error(`[ipc] ${type}: bus emit failed (mutation already persisted):`, err);
    }
  }

  function emitApprovalReviewAudit(
    companyId: string,
    item: ApprovalItem,
    grantId: string | null,
  ): void {
    const actorId = item.latestDecision?.decidedByOperatorId ?? HUMAN_USER_ID;

    emitUserAuditEvent(
      'approval.reviewed',
      companyId,
      {
        approvalKind: item.kind,
        approvalRefId: item.id,
        decision: item.status,
        subjectRefKind: item.subjectRefKind,
        subjectRefId: item.subjectRefId,
        rationale: item.latestDecision?.rationale ?? null,
      },
      actorId,
    );

    if (item.kind !== 'authority-request') return;

    const payload = item.payload ?? {};
    const resourceKind = typeof payload.resourceKind === 'string' ? payload.resourceKind : 'path';
    const resourceId =
      typeof payload.resourceId === 'string' ? payload.resourceId : item.subjectRefId;
    const requestedPermission =
      typeof payload.requestedPermission === 'string' ? payload.requestedPermission : 'allow';

    if (grantId) {
      emitUserAuditEvent(
        'authority.grant.created',
        companyId,
        {
          grantId,
          scopeKind: 'extension',
          scopeId: item.subjectRefId,
          resourceKind,
          resourceId,
          permission: requestedPermission,
          requestId: item.id,
        },
        actorId,
      );
    }

    emitUserAuditEvent(
      'authority.request.reviewed',
      companyId,
      {
        requestId: item.id,
        extensionId: item.subjectRefId,
        resourceKind,
        resourceId,
        requestedPermission,
        decision: item.status,
        grantId,
      },
      actorId,
    );
  }

  function ensureTicketThread(ticket: TicketRow): string {
    let threadId = ticket.threadId;
    if (!threadId) {
      threadId = threadsRepo.create({
        companyId: ticket.companyId,
        kind: 'ticket',
        subject: ticket.title,
        createdBy: HUMAN_USER_ID,
      });
      ticketsRepo.setThreadId(ticket.id, threadId);
    }

    ensureTicketMember(threadId, HUMAN_USER_ID, 'user');
    if (ticket.assigneeId) {
      ensureTicketMember(threadId, ticket.assigneeId, 'employee');
    }

    return threadId;
  }

  function ensureTicketMember(
    threadId: string,
    memberId: string,
    memberKind: 'user' | 'employee',
  ): boolean {
    const alreadyMember = threadsRepo
      .listMembers(threadId)
      .some((member) => member.memberId === memberId && member.memberKind === memberKind);
    if (alreadyMember) return false;
    threadsRepo.addMember({ threadId, memberId, memberKind });
    return true;
  }

  function validateTicketParticipant(
    ticket: TicketRow,
    employeeId: string,
    channel: string,
  ): EmployeeRow {
    const employee = employeesRepo.getById(employeeId);
    if (!employee) {
      throw new Error(`[ipc] ${channel}: employee not found: ${employeeId}`);
    }
    if (employee.companyId !== ticket.companyId) {
      throw new Error(
        `[ipc] ${channel}: employee ${employeeId} does not belong to company ${ticket.companyId}`,
      );
    }
    if (employee.isSystem) {
      throw new Error(`[ipc] ${channel}: system employees cannot be ticket participants`);
    }
    return employee;
  }

  function listTicketParticipantRows(ticket: TicketRow, threadId: string | null): EmployeeRow[] {
    const employeeIds = new Set<string>();
    if (ticket.assigneeId) employeeIds.add(ticket.assigneeId);

    if (threadId) {
      for (const member of threadsRepo.listMembers(threadId)) {
        if (member.memberKind === 'employee') employeeIds.add(member.memberId);
      }
      for (const message of messagesRepo.listByThread(threadId)) {
        if (message.authorKind === 'employee') employeeIds.add(message.authorId);
      }
    }

    const rows: EmployeeRow[] = [];
    for (const employeeId of employeeIds) {
      const employee = employeesRepo.getById(employeeId);
      if (!employee || employee.companyId !== ticket.companyId || employee.isSystem) {
        continue;
      }
      rows.push(employee);
    }
    return rows;
  }

  function enqueueTicketParticipantWakeups(args: {
    ticket: TicketRow;
    threadId: string;
    messageId: string;
    excludeEmployeeIds?: Set<string>;
    reason: string;
  }): void {
    const excluded = args.excludeEmployeeIds ?? new Set<string>();
    for (const employee of listTicketParticipantRows(args.ticket, args.threadId)) {
      if (excluded.has(employee.id)) continue;
      orchestrator
        .enqueueChat({
          threadId: args.threadId,
          employeeId: employee.id,
          userMessageId: args.messageId,
        })
        .catch((err: unknown) => {
          console.error(
            `[ipc] ${args.reason}: orchestrator turn failed for ticket=${args.ticket.id}, employee=${employee.id}:`,
            err,
          );
        });
    }
  }

  function validateScheduleLinkage(
    companyId: string,
    links: {
      ticketId?: string | null;
      projectId?: string | null;
      goalId?: string | null;
      assigneeId?: string | null;
    },
  ): void {
    if (links.ticketId) {
      const ticket = ticketsRepo.getById(links.ticketId);
      if (!ticket || ticket.companyId !== companyId) {
        throw new Error(`[ipc] schedule: ticket not found in company: ${links.ticketId}`);
      }
    }
    if (links.projectId) {
      const project = projectsRepo.getById(links.projectId);
      if (!project || project.companyId !== companyId) {
        throw new Error(`[ipc] schedule: project not found in company: ${links.projectId}`);
      }
    }
    if (links.goalId) {
      const goal = goalsRepo.getById(links.goalId);
      if (!goal || goal.companyId !== companyId) {
        throw new Error(`[ipc] schedule: goal not found in company: ${links.goalId}`);
      }
    }
    if (links.assigneeId) {
      const employee = employeesRepo.getById(links.assigneeId);
      if (!employee || employee.companyId !== companyId || employee.isSystem) {
        throw new Error(`[ipc] schedule: assignee not found in company: ${links.assigneeId}`);
      }
    }
  }

  function maybeQueueScheduleWakeup(item: ScheduleItem): string | null {
    if (!agentWakeupRequestsRepo || !item.assigneeId || item.status !== 'scheduled') return null;
    return agentWakeupRequestsRepo.create({
      companyId: item.companyId,
      agentId: item.assigneeId,
      triggerType: 'schedule',
      triggerId: item.id,
      priority: schedulePriorityWeight(item.priority),
      scheduledFor: Math.max(item.startsAt, Date.now()),
      context: {
        companyId: item.companyId,
        goalId: item.goalId ?? undefined,
        projectId: item.projectId ?? undefined,
        sourceKind: 'schedule',
        sourceRefId: item.id,
        metadata: {
          scheduleItemId: item.id,
          ticketId: item.ticketId,
          title: item.title,
        },
      },
    });
  }

  function cancelScheduleWakeup(wakeupRequestId: string | null | undefined): void {
    if (!wakeupRequestId || !agentWakeupRequestsRepo) return;
    try {
      agentWakeupRequestsRepo.cancel(wakeupRequestId);
    } catch (err) {
      console.error(`[ipc] schedule: failed to cancel wakeup ${wakeupRequestId}:`, err);
    }
  }

  function attachWakeupIfNeeded(itemId: string): string | null {
    const row = scheduleItemsRepo.getById(itemId);
    if (!row) return null;
    const item = rowToScheduleItem(row);
    const wakeupRequestId = maybeQueueScheduleWakeup(item);
    if (wakeupRequestId) {
      scheduleItemsRepo.update(item.id, { wakeupRequestId });
    }
    return wakeupRequestId;
  }

  function buildDerivedScheduleItems(companyId: string): ScheduleItem[] {
    const now = Date.now();
    const ticketItems = ticketsRepo
      .listByCompany(companyId)
      .filter((ticket) => ticket.dueAt !== null && ticket.dueAt > 0)
      .map(
        (ticket): ScheduleItem => ({
          id: `ticket-due-${ticket.id}`,
          companyId,
          title: `Ticket due: ${ticket.title}`,
          description: ticket.description,
          kind: 'deadline',
          status: ticket.status === 'done' ? 'completed' : 'scheduled',
          priority: ticket.priority as TicketPriority,
          startsAt: ticket.dueAt ?? now,
          endsAt: null,
          reminderAt: null,
          ticketId: ticket.id,
          projectId: null,
          goalId: ticket.goalId,
          assigneeId: ticket.assigneeId,
          wakeupRequestId: null,
          sourceKind: 'ticket_due',
          sourceId: ticket.id,
          createdById: ticket.reporterId,
          createdByKind: ticket.reporterKind as AuthorKind,
          createdAt: ticket.createdAt,
          updatedAt: ticket.updatedAt,
          completedAt: ticket.closedAt,
        }),
      );

    const projectItems = projectsRepo
      .listByCompany(companyId)
      .filter((project) => project.targetDate !== null && project.targetDate > 0)
      .map(
        (project): ScheduleItem => ({
          id: `project-target-${project.id}`,
          companyId,
          title: `Project target: ${project.title}`,
          description: project.description,
          kind: 'milestone',
          status:
            project.status === 'completed' || project.status === 'archived'
              ? 'completed'
              : 'scheduled',
          priority: project.priority as TicketPriority,
          startsAt: project.targetDate ?? now,
          endsAt: null,
          reminderAt: null,
          ticketId: null,
          projectId: project.id,
          goalId: project.goalId,
          assigneeId: project.leadId,
          wakeupRequestId: null,
          sourceKind: 'project_target',
          sourceId: project.id,
          createdById: HUMAN_USER_ID,
          createdByKind: 'user',
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          completedAt: project.status === 'completed' ? project.updatedAt : null,
        }),
      );

    const goalItems = goalsRepo
      .listByCompany(companyId)
      .filter((goal) => goal.targetDate !== null && goal.targetDate > 0)
      .map(
        (goal): ScheduleItem => ({
          id: `goal-target-${goal.id}`,
          companyId,
          title: `Goal target: ${goal.title}`,
          description: goal.description,
          kind: 'milestone',
          status:
            goal.status === 'achieved' || goal.status === 'abandoned' ? 'completed' : 'scheduled',
          priority:
            goal.status === 'active' && goal.targetDate !== null && goal.targetDate < now
              ? 'high'
              : 'medium',
          startsAt: goal.targetDate ?? now,
          endsAt: null,
          reminderAt: null,
          ticketId: null,
          projectId: null,
          goalId: goal.id,
          assigneeId: null,
          wakeupRequestId: null,
          sourceKind: 'goal_target',
          sourceId: goal.id,
          createdById: HUMAN_USER_ID,
          createdByKind: 'user',
          createdAt: goal.createdAt,
          updatedAt: goal.updatedAt,
          completedAt: goal.status === 'achieved' ? goal.updatedAt : null,
        }),
      );

    return [...ticketItems, ...projectItems, ...goalItems];
  }

  return {
    ...deps,
    handlers,
    emitUserAuditEvent,
    emitApprovalReviewAudit,
    ensureTicketThread,
    ensureTicketMember,
    validateTicketParticipant,
    listTicketParticipantRows,
    enqueueTicketParticipantWakeups,
    validateScheduleLinkage,
    maybeQueueScheduleWakeup,
    cancelScheduleWakeup,
    attachWakeupIfNeeded,
    buildDerivedScheduleItems,
  };
}

export type HandlerContext = ReturnType<typeof createHandlerContext>;
