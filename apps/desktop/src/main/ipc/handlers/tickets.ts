/**
 * IPC handlers — Tickets and ticket attachments.
 * Split from handlers.ts by bounded context (audit 2026-10-07 P1-7).
 */
import type { ChatMessage, Employee } from '@team-x/shared-types';

import type { HandlerContext } from './context.js';
import type { IpcHandlers } from './contract.js';
import { HUMAN_USER_ID } from './deps.js';
import { rowToChatMessage, rowToEmployee, rowToTicket } from './mappers.js';

export type TicketsHandlers = Pick<
  IpcHandlers,
  | 'ticketsCreate'
  | 'ticketsUpdate'
  | 'ticketsAssign'
  | 'ticketsAddParticipant'
  | 'ticketsRemoveParticipant'
  | 'ticketsClose'
  | 'ticketsReopen'
  | 'ticketsAddComment'
  | 'ticketsList'
  | 'ticketsGet'
>;

export function createTicketsHandlers(ctx: HandlerContext): TicketsHandlers {
  const {
    employeesRepo,
    threadsRepo,
    messagesRepo,
    ticketsRepo,
    orchestrator,
    bus,
    ensureTicketThread,
    ensureTicketMember,
    validateTicketParticipant,
    listTicketParticipantRows,
    enqueueTicketParticipantWakeups,
  } = ctx;
  return {
    // -----------------------------------------------------------------------
    // Ticket management handlers (Phase 2 — M12)
    // -----------------------------------------------------------------------

    async ticketsCreate(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] tickets.create: companyId is required');
      }
      if (typeof req.title !== 'string' || req.title.trim().length === 0) {
        throw new Error('[ipc] tickets.create: title is required');
      }

      const title = req.title.trim();
      const assigneeId = req.assigneeId ?? null;
      const ticketId = ticketsRepo.create({
        companyId: req.companyId,
        title,
        description: req.description ?? '',
        priority: req.priority ?? 'medium',
        assigneeId,
        reporterId: HUMAN_USER_ID,
        reporterKind: 'user',
        labelsJson: req.labelsJson ?? '[]',
        slaHours: req.slaHours ?? null,
        dueAt: req.dueAt ?? null,
      });

      // Invariant #11 (Phase 5.6 M-C step f): emit ticket.created FIRST.
      // If the immediate-assign flow below runs successfully, a
      // separate ticket.assigned event fires after the thread is wired.
      const createdAt = Date.now();
      if (bus) {
        try {
          bus.emit({
            type: 'ticket.created',
            companyId: req.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: { ticketId, companyId: req.companyId, title, assigneeId, createdAt },
          });
        } catch (err) {
          console.error(
            `[ipc] tickets.create: bus emit failed (row still created with id ${ticketId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] tickets.create: bus dep unwired — renderer caches will NOT invalidate');
      }

      // If assigneeId was provided, trigger immediate assignment flow
      if (req.assigneeId) {
        const employee = employeesRepo.getById(req.assigneeId);
        if (employee) {
          const ticket = ticketsRepo.getById(ticketId);
          if (ticket) {
            // Create the ticket discussion thread
            const threadId = threadsRepo.create({
              companyId: req.companyId,
              kind: 'ticket',
              subject: title,
              createdBy: HUMAN_USER_ID,
            });
            threadsRepo.addMember({
              threadId,
              memberId: HUMAN_USER_ID,
              memberKind: 'user',
            });
            threadsRepo.addMember({
              threadId,
              memberId: req.assigneeId,
              memberKind: 'employee',
            });
            ticketsRepo.setThreadId(ticketId, threadId);
            ticketsRepo.assign(ticketId, req.assigneeId);

            // Post the ticket description as the first message
            const msgContent = `**Ticket: ${title}**\n\n${req.description ?? '(no description)'}`;
            const messageId = messagesRepo.append({
              threadId,
              authorId: HUMAN_USER_ID,
              authorKind: 'user',
              content: msgContent,
            });

            // Invariant #11 — second emit for the immediate-assign path.
            // previousAssigneeId is always null here because this branch
            // fires as a side-effect of ticket creation.
            if (bus) {
              try {
                bus.emit({
                  type: 'ticket.assigned',
                  companyId: req.companyId,
                  actorId: HUMAN_USER_ID,
                  actorKind: 'user',
                  payload: {
                    ticketId,
                    companyId: req.companyId,
                    assigneeId: req.assigneeId,
                    previousAssigneeId: null,
                    threadId,
                    assignedAt: Date.now(),
                  },
                });
              } catch (err) {
                console.error(
                  `[ipc] tickets.create: ticket.assigned bus emit failed (assignment still persisted, ticket=${ticketId}):`,
                  err,
                );
              }
            }

            // Enqueue agent work (fire-and-forget)
            orchestrator
              .enqueueChat({
                threadId,
                employeeId: req.assigneeId,
                userMessageId: messageId,
              })
              .catch((err: unknown) => {
                console.error(
                  `[ipc] tickets.create: orchestrator turn failed for ticket=${ticketId}:`,
                  err,
                );
              });
          }
        }
      }

      return { ticketId };
    },

    async ticketsUpdate(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.update: ticketId is required');
      }
      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.update: ticket not found: ${req.ticketId}`);
      }

      // Compute patchedKeys BEFORE the write — tracks caller intent.
      // `assigneeId` is intentionally excluded from this handler's
      // patch surface because tickets.update does not call assign();
      // the dedicated tickets.assign channel emits ticket.assigned
      // with its own payload (including previousAssigneeId snapshot).
      const patchedKeys: Array<'title' | 'description' | 'status' | 'priority' | 'assigneeId'> = [];
      if (req.title !== undefined) patchedKeys.push('title');
      if (req.description !== undefined) patchedKeys.push('description');
      if (req.status !== undefined) patchedKeys.push('status');
      if (req.priority !== undefined) patchedKeys.push('priority');

      ticketsRepo.update(req.ticketId, {
        title: req.title,
        description: req.description,
        priority: req.priority,
        status: req.status,
        labelsJson: req.labelsJson,
        slaHours: req.slaHours,
        dueAt: req.dueAt,
      });

      // Invariant #11.
      if (bus) {
        try {
          bus.emit({
            type: 'ticket.updated',
            companyId: ticket.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              ticketId: req.ticketId,
              companyId: ticket.companyId,
              patchedKeys,
              updatedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] tickets.update: bus emit failed (row still updated, id=${req.ticketId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] tickets.update: bus dep unwired — renderer caches will NOT invalidate');
      }
    },

    async ticketsAssign(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.assign: ticketId is required');
      }
      if (typeof req.assigneeId !== 'string' || req.assigneeId.length === 0) {
        throw new Error('[ipc] tickets.assign: assigneeId is required');
      }

      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.assign: ticket not found: ${req.ticketId}`);
      }
      const employee = employeesRepo.getById(req.assigneeId);
      if (!employee) {
        throw new Error(`[ipc] tickets.assign: employee not found: ${req.assigneeId}`);
      }

      // Capture previous assignee BEFORE the repo write — `ticket`
      // holds the pre-assign row (fetched at the top of the handler).
      const previousAssigneeId = ticket.assigneeId;

      ticketsRepo.assign(req.ticketId, req.assigneeId);

      // Create discussion thread if one doesn't exist yet
      let threadId = ticket.threadId;
      if (!threadId) {
        threadId = threadsRepo.create({
          companyId: ticket.companyId,
          kind: 'ticket',
          subject: ticket.title,
          createdBy: HUMAN_USER_ID,
        });
        threadsRepo.addMember({
          threadId,
          memberId: HUMAN_USER_ID,
          memberKind: 'user',
        });
        threadsRepo.addMember({
          threadId,
          memberId: req.assigneeId,
          memberKind: 'employee',
        });
        ticketsRepo.setThreadId(req.ticketId, threadId);

        // Post the ticket description as the first message
        const msgContent = `**Ticket: ${ticket.title}**\n\n${ticket.description || '(no description)'}`;
        const messageId = messagesRepo.append({
          threadId,
          authorId: HUMAN_USER_ID,
          authorKind: 'user',
          content: msgContent,
        });

        // Enqueue agent work
        orchestrator
          .enqueueChat({
            threadId,
            employeeId: req.assigneeId,
            userMessageId: messageId,
          })
          .catch((err: unknown) => {
            console.error(
              `[ipc] tickets.assign: orchestrator turn failed for ticket=${req.ticketId}:`,
              err,
            );
          });
      } else {
        // Thread exists — post a reassignment notice and enqueue
        const msgContent = `Ticket reassigned to ${employee.name} (${employee.title}).`;
        const messageId = messagesRepo.append({
          threadId,
          authorId: HUMAN_USER_ID,
          authorKind: 'system',
          content: msgContent,
        });

        // Ensure new assignee is a thread member
        const members = threadsRepo.listMembers(threadId);
        const alreadyMember = members.some(
          (m) => m.memberId === req.assigneeId && m.memberKind === 'employee',
        );
        if (!alreadyMember) {
          threadsRepo.addMember({
            threadId,
            memberId: req.assigneeId,
            memberKind: 'employee',
          });
        }

        orchestrator
          .enqueueChat({
            threadId,
            employeeId: req.assigneeId,
            userMessageId: messageId,
          })
          .catch((err: unknown) => {
            console.error(
              `[ipc] tickets.assign: orchestrator turn failed for ticket=${req.ticketId}:`,
              err,
            );
          });
      }

      // Invariant #11 (Phase 5.6 M-C step f). `threadId` is non-null
      // by this point — both branches of the if/else above set it.
      if (bus) {
        try {
          bus.emit({
            type: 'ticket.assigned',
            companyId: ticket.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              ticketId: req.ticketId,
              companyId: ticket.companyId,
              assigneeId: req.assigneeId,
              previousAssigneeId,
              threadId,
              assignedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] tickets.assign: bus emit failed (assignment still persisted, ticket=${req.ticketId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] tickets.assign: bus dep unwired — renderer caches will NOT invalidate');
      }
    },

    async ticketsAddParticipant(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.addParticipant: ticketId is required');
      }
      if (typeof req.employeeId !== 'string' || req.employeeId.length === 0) {
        throw new Error('[ipc] tickets.addParticipant: employeeId is required');
      }

      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.addParticipant: ticket not found: ${req.ticketId}`);
      }
      const employee = validateTicketParticipant(ticket, req.employeeId, 'tickets.addParticipant');
      const threadId = ensureTicketThread(ticket);
      const added = ensureTicketMember(threadId, req.employeeId, 'employee');
      const changedAt = Date.now();

      const messageId = messagesRepo.append({
        threadId,
        authorId: HUMAN_USER_ID,
        authorKind: 'system',
        content: added
          ? `${employee.name} was added to this ticket.`
          : `${employee.name} is already on this ticket.`,
      });
      threadsRepo.updateLastMessageAt(threadId, changedAt);

      orchestrator
        .enqueueChat({
          threadId,
          employeeId: req.employeeId,
          userMessageId: messageId,
        })
        .catch((err: unknown) => {
          console.error(
            `[ipc] tickets.addParticipant: orchestrator turn failed for ticket=${req.ticketId}, employee=${req.employeeId}:`,
            err,
          );
        });

      if (bus) {
        try {
          bus.emit({
            type: 'ticket.participantAdded',
            companyId: ticket.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              ticketId: req.ticketId,
              companyId: ticket.companyId,
              employeeId: req.employeeId,
              threadId,
              added,
              addedAt: changedAt,
            },
          });
        } catch (err) {
          console.error(
            `[ipc] tickets.addParticipant: bus emit failed (participant still added, ticket=${req.ticketId}, employee=${req.employeeId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] tickets.addParticipant: bus dep unwired — renderer caches will NOT invalidate',
        );
      }
    },

    async ticketsRemoveParticipant(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.removeParticipant: ticketId is required');
      }
      if (typeof req.employeeId !== 'string' || req.employeeId.length === 0) {
        throw new Error('[ipc] tickets.removeParticipant: employeeId is required');
      }

      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.removeParticipant: ticket not found: ${req.ticketId}`);
      }
      const employee = validateTicketParticipant(
        ticket,
        req.employeeId,
        'tickets.removeParticipant',
      );
      const threadId = ticket.threadId;
      const wasMember = threadId
        ? threadsRepo
            .listMembers(threadId)
            .some(
              (member) => member.memberId === req.employeeId && member.memberKind === 'employee',
            )
        : false;
      if (threadId) {
        threadsRepo.removeMember({ threadId, memberId: req.employeeId, memberKind: 'employee' });
      }

      const clearedAssignee = ticket.assigneeId === req.employeeId;
      if (clearedAssignee) {
        ticketsRepo.update(req.ticketId, {
          assigneeId: null,
          status: ticket.status === 'done' ? ticket.status : 'open',
        });
      }

      const changedAt = Date.now();
      if (threadId) {
        messagesRepo.append({
          threadId,
          authorId: HUMAN_USER_ID,
          authorKind: 'system',
          content: `${employee.name} was removed from this ticket.${
            clearedAssignee ? ' The ticket is now unassigned.' : ''
          }`,
        });
        threadsRepo.updateLastMessageAt(threadId, changedAt);
      }

      if (bus) {
        try {
          bus.emit({
            type: 'ticket.participantRemoved',
            companyId: ticket.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              ticketId: req.ticketId,
              companyId: ticket.companyId,
              employeeId: req.employeeId,
              threadId,
              removed: wasMember,
              clearedAssignee,
              removedAt: changedAt,
            },
          });
        } catch (err) {
          console.error(
            `[ipc] tickets.removeParticipant: bus emit failed (participant still removed, ticket=${req.ticketId}, employee=${req.employeeId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] tickets.removeParticipant: bus dep unwired — renderer caches will NOT invalidate',
        );
      }
    },

    async ticketsClose(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.close: ticketId is required');
      }
      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.close: ticket not found: ${req.ticketId}`);
      }
      ticketsRepo.close(req.ticketId);

      // Invariant #11 (Phase 5.6 M-C step f).
      if (bus) {
        try {
          bus.emit({
            type: 'ticket.closed',
            companyId: ticket.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              ticketId: req.ticketId,
              companyId: ticket.companyId,
              closedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] tickets.close: bus emit failed (ticket still closed, id=${req.ticketId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] tickets.close: bus dep unwired — renderer caches will NOT invalidate');
      }
    },

    async ticketsReopen(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.reopen: ticketId is required');
      }
      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.reopen: ticket not found: ${req.ticketId}`);
      }
      ticketsRepo.reopen(req.ticketId);

      // Invariant #11.
      if (bus) {
        try {
          bus.emit({
            type: 'ticket.reopened',
            companyId: ticket.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              ticketId: req.ticketId,
              companyId: ticket.companyId,
              reopenedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] tickets.reopen: bus emit failed (ticket still reopened, id=${req.ticketId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] tickets.reopen: bus dep unwired — renderer caches will NOT invalidate');
      }
    },

    async ticketsAddComment(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.addComment: ticketId is required');
      }
      if (typeof req.content !== 'string' || req.content.trim().length === 0) {
        throw new Error('[ipc] tickets.addComment: content is required');
      }

      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.addComment: ticket not found: ${req.ticketId}`);
      }

      const threadId = ensureTicketThread(ticket);

      const messageId = messagesRepo.append({
        threadId,
        authorId: HUMAN_USER_ID,
        authorKind: 'user',
        content: req.content.trim(),
      });

      enqueueTicketParticipantWakeups({
        ticket,
        threadId,
        messageId,
        reason: 'tickets.addComment',
      });

      // Invariant #11 (Phase 5.6 M-C step f). authorId is HUMAN_USER_ID
      // because this IPC is the Rocky-facing channel; agent-authored
      // replies arrive through the orchestrator's own emit pipeline.
      if (bus) {
        try {
          bus.emit({
            type: 'ticket.commentAdded',
            companyId: ticket.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              ticketId: req.ticketId,
              companyId: ticket.companyId,
              messageId,
              authorId: HUMAN_USER_ID,
              addedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] tickets.addComment: bus emit failed (message still persisted, id=${messageId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] tickets.addComment: bus dep unwired — renderer caches will NOT invalidate',
        );
      }

      return { messageId };
    },

    async ticketsList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] tickets.list: companyId is required');
      }
      return ticketsRepo.listByCompany(req.companyId).map(rowToTicket);
    },

    async ticketsGet(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.get: ticketId is required');
      }
      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.get: ticket not found: ${req.ticketId}`);
      }

      // Fetch thread messages if the ticket has a discussion thread
      let messages: ChatMessage[] = [];
      if (ticket.threadId) {
        const rows = messagesRepo.listByThread(ticket.threadId);
        messages = rows.map(rowToChatMessage);
      }

      // Fetch assignee
      let assignee: Employee | null = null;
      if (ticket.assigneeId) {
        const empRow = employeesRepo.getById(ticket.assigneeId);
        if (empRow) assignee = rowToEmployee(empRow);
      }
      const participants = listTicketParticipantRows(ticket, ticket.threadId).map(rowToEmployee);

      return {
        ...rowToTicket(ticket),
        messages,
        assignee,
        participants,
      };
    },
  };
}
