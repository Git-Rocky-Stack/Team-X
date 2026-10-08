/**
 * IPC handlers — Chat threads and messages, and the dashboard event timeline.
 * Split from handlers.ts by bounded context (audit 2026-10-07 P1-7).
 */

import { AUTO_THREAD_ID } from '@team-x/shared-types';
import type { Thread } from '@team-x/shared-types';

import { isWorkFailureReported } from '../../orchestrator/work-failure-reports.js';

import type { HandlerContext } from './context.js';
import type { IpcHandlers } from './contract.js';
import { HUMAN_USER_ID } from './deps.js';
import { isUserCancelledTurnError, rowToChatMessage, rowToEvent } from './mappers.js';

export type ChatHandlers = Pick<
  IpcHandlers,
  'chatSend' | 'chatList' | 'chatStop' | 'chatResolveThread' | 'chatListThreads' | 'eventsList'
>;

export function createChatHandlers(ctx: HandlerContext): ChatHandlers {
  const { employeesRepo, threadsRepo, messagesRepo, eventsRepo, orchestrator, bus } = ctx;
  return {
    async chatSend({ threadId, employeeId, content }) {
      if (typeof employeeId !== 'string' || employeeId.length === 0) {
        throw new Error('[ipc] chat.send: employeeId is required');
      }
      if (typeof content !== 'string' || content.length === 0) {
        throw new Error('[ipc] chat.send: content is required');
      }

      // Look up the target employee FIRST. We need its companyId to
      // resolve `AUTO_THREAD_ID`, AND we want a clear error before any
      // DB writes if the employee is missing.
      const employee = employeesRepo.getById(employeeId);
      if (!employee) {
        throw new Error(`[ipc] chat.send: employee not found: ${employeeId}`);
      }

      // Resolve the thread.
      let resolvedThreadId: string;
      if (threadId === AUTO_THREAD_ID) {
        resolvedThreadId = threadsRepo.getOrCreateDmThread({
          companyId: employee.companyId,
          employeeId,
          userId: HUMAN_USER_ID,
        });
      } else {
        const thread = threadsRepo.getById(threadId);
        if (!thread) {
          throw new Error(`[ipc] chat.send: thread not found: ${threadId}`);
        }
        // Defensive: refuse to send into a thread that doesn't belong
        // to the employee's company. The orchestrator has its own
        // version of this check (see orchestrator/index.ts), but
        // catching it here avoids opening a runs row for a doomed turn.
        if (thread.companyId !== employee.companyId) {
          throw new Error(
            `[ipc] chat.send: thread ${threadId} does not belong to ` +
              `employee ${employeeId}'s company`,
          );
        }
        resolvedThreadId = threadId;
      }

      // Append the user's message — this gives us the id we hand the
      // orchestrator (which uses it for correlation in `work.failed`
      // payloads) and return to the renderer.
      const messageId = messagesRepo.append({
        threadId: resolvedThreadId,
        authorId: HUMAN_USER_ID,
        authorKind: 'user',
        content,
      });
      threadsRepo.updateLastMessageAt(resolvedThreadId, Date.now());

      // Kick off the assistant turn. CRITICAL: do NOT await the
      // returned Promise. `orchestrator.enqueueChat` resolves when the
      // turn has fully completed (assistant message persisted, runs
      // row closed, `work.completed` emitted) — awaiting it here would
      // block the IPC reply for the entire duration of the LLM stream
      // and the renderer would not see the user's message in the
      // drawer until the assistant had finished thinking. The whole
      // point of the dashboard event channel is to deliver the reply
      // live; this handler's job is to persist the user's input,
      // queue the work, and get out of the way.
      //
      // The orchestrator's failure modes (shutdown, provider error,
      // role-loader miss) all surface either as `work.failed`
      // dashboard events (which the renderer renders) or via the
      // logged catch below. We never re-throw, because the user
      // message has already been persisted and the renderer's chat
      // bubble is already on screen — a thrown IPC reply would
      // confuse the UI into thinking the entire send was rejected.
      orchestrator
        .enqueueChat({
          threadId: resolvedThreadId,
          employeeId,
          userMessageId: messageId,
        })
        .catch((err: unknown) => {
          if (isUserCancelledTurnError(err)) {
            return;
          }
          const message = err instanceof Error ? err.message : String(err);
          const rows = messagesRepo.listByThread(resolvedThreadId);
          const userMessage = rows.find((row) => row.id === messageId);
          const alreadyStarted =
            userMessage !== undefined &&
            rows.some(
              (row) =>
                row.createdAt >= userMessage.createdAt &&
                row.authorKind === 'employee' &&
                row.authorId === employeeId,
            );
          // The orchestrator already reported a turn it refused before start.
          if (!alreadyStarted && !isWorkFailureReported(err)) {
            try {
              bus?.emit({
                type: 'work.failed',
                companyId: employee.companyId,
                actorId: 'orchestrator',
                actorKind: 'orchestrator',
                payload: {
                  threadId: resolvedThreadId,
                  employeeId,
                  messageId,
                  error: message,
                },
              });
            } catch (eventErr) {
              console.error(
                `[ipc] chat.send: failed to emit work.failed for thread=${resolvedThreadId} ` +
                  `employee=${employeeId} userMessage=${messageId}:`,
                eventErr,
              );
            }
          }
          console.error(
            `[ipc] chat.send: orchestrator turn failed for thread=${resolvedThreadId} ` +
              `employee=${employeeId} userMessage=${messageId}:`,
            err,
          );
        });

      return { threadId: resolvedThreadId, messageId };
    },

    async chatList({ threadId }) {
      if (typeof threadId !== 'string' || threadId.length === 0) {
        throw new Error('[ipc] chat.list: threadId is required');
      }
      const rows = messagesRepo.listByThread(threadId);
      return rows.map(rowToChatMessage);
    },

    async chatStop({ threadId }) {
      if (typeof threadId !== 'string' || threadId.length === 0) {
        throw new Error('[ipc] chat.stop: threadId is required');
      }
      return { stopped: orchestrator.stopThread(threadId) };
    },

    async chatResolveThread({ employeeId }) {
      if (typeof employeeId !== 'string' || employeeId.length === 0) {
        throw new Error('[ipc] chat.resolveThread: employeeId is required');
      }
      const employee = employeesRepo.getById(employeeId);
      if (!employee) {
        throw new Error(`[ipc] chat.resolveThread: employee not found: ${employeeId}`);
      }
      const threadId = threadsRepo.getOrCreateDmThread({
        companyId: employee.companyId,
        employeeId,
        userId: HUMAN_USER_ID,
      });
      return { threadId };
    },

    async chatListThreads({ companyId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] chat.listThreads: companyId is required');
      }
      const rows = threadsRepo.listByCompanyWithMembers(companyId);
      // Build a Set of system-agent employee ids once per call so each
      // thread's isSystemAgent flag is an O(1) lookup. `listByCompany`
      // (not `listVisibleByCompany`) deliberately includes system
      // pseudo-employees — exactly the set we need to classify threads
      // against. Phase 5 — M31 T5.
      const systemEmployeeIds = new Set<string>(
        employeesRepo
          .listByCompany(companyId)
          .filter((e) => e.isSystem)
          .map((e) => e.id),
      );
      return rows.map(
        (row): Thread => ({
          id: row.id,
          companyId: row.companyId,
          kind: row.kind as Thread['kind'],
          subject: row.subject,
          createdBy: row.createdBy,
          createdAt: row.createdAt,
          lastMessageAt: row.lastMessageAt ?? null,
          members: row.members.map((m) => ({
            memberId: m.memberId,
            memberKind: m.memberKind as 'user' | 'employee',
            roleInThread: m.roleInThread,
          })),
          isSystemAgent: row.members.some(
            (m) => m.memberKind === 'employee' && systemEmployeeIds.has(m.memberId),
          ),
        }),
      );
    },

    // -----------------------------------------------------------------------
    // Events / timeline handler (Phase 3 — M14)
    // -----------------------------------------------------------------------

    async eventsList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] events.list: companyId is required');
      }
      const limit = req.limit ?? 50;
      const rows = eventsRepo.listByCompany(req.companyId, req.cursor, limit + 1);

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const lastEvent = page[page.length - 1];
      const nextCursor = hasMore && lastEvent ? lastEvent.createdAt : null;

      return {
        events: page.map(rowToEvent),
        nextCursor,
      };
    },
  };
}
