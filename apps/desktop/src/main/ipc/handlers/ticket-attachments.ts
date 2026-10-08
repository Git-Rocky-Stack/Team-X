/**
 * IPC handlers — Ticket attachments: attach, list and remove files.
 * Split from tickets.ts (audit 2026-10-07 P1-7).
 */

import type { TicketAttachment } from '@team-x/shared-types';

import type { HandlerContext } from './context.js';
import type { IpcHandlers } from './contract.js';
import { HUMAN_USER_ID } from './deps.js';

export type TicketAttachmentsHandlers = Pick<
  IpcHandlers,
  'ticketsAttachFile' | 'ticketsDetachFile' | 'ticketsListAttachments'
>;

export function createTicketAttachmentsHandlers(ctx: HandlerContext): TicketAttachmentsHandlers {
  const { ticketsRepo, ticketAttachmentsRepo, vaultService, bus } = ctx;
  return {
    // -----------------------------------------------------------------------
    // Ticket attachment handlers (Phase 4 — M22)
    // -----------------------------------------------------------------------

    async ticketsAttachFile(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.attachFile: ticketId is required');
      }
      if (typeof req.fileId !== 'string' || req.fileId.length === 0) {
        throw new Error('[ipc] tickets.attachFile: fileId is required');
      }

      // Fetch the ticket to thread companyId into the bus event + act as a
      // phantom-ticket-id validation guard (aborts before any repo write if
      // the ticketId does not resolve). Mirrors the `projects.linkTicket`
      // pattern from step f.
      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.attachFile: ticket not found: ${req.ticketId}`);
      }

      const attachmentId = ticketAttachmentsRepo.attach(req.ticketId, req.fileId, HUMAN_USER_ID);
      const attachedAt = Date.now();

      // Invariant #11 (Phase 5.6 M-C FOLLOWUP-P1-extended — closes BUG-011).
      // Attachment lifecycle was explicitly deferred from step f's 14-event
      // envelope and scoped into this atomic alongside employees.hire/fire.
      if (bus) {
        try {
          bus.emit({
            type: 'ticket.attachmentAdded',
            companyId: ticket.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              attachmentId,
              ticketId: req.ticketId,
              companyId: ticket.companyId,
              fileId: req.fileId,
              attachedBy: HUMAN_USER_ID,
              attachedAt,
            },
          });
        } catch (err) {
          console.error(
            `[ipc] tickets.attachFile: bus emit failed (row still attached, id=${attachmentId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] tickets.attachFile: bus dep unwired — renderer caches will NOT invalidate',
        );
      }

      return { attachmentId };
    },

    async ticketsDetachFile(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.detachFile: ticketId is required');
      }
      if (typeof req.fileId !== 'string' || req.fileId.length === 0) {
        throw new Error('[ipc] tickets.detachFile: fileId is required');
      }

      // Fetch the ticket to thread companyId into the bus event + phantom-
      // id guard. Mirrors `projects.unlinkTicket` (step f).
      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.detachFile: ticket not found: ${req.ticketId}`);
      }

      // Snapshot the attachmentId BEFORE the drop so the bus event can
      // carry the row identifier for renderer optimistic animations. If
      // no matching (ticketId, fileId) row exists, the detach is a no-op
      // but we still emit (empty-patch-still-emits discipline) with
      // `attachmentId: null` so optimistic-update renderer paths can
      // reconcile. Mirrors `companies.update` empty-patch emit (step e).
      const existing = ticketAttachmentsRepo
        .listByTicket(req.ticketId)
        .find((row) => row.fileId === req.fileId);
      const snapshotAttachmentId = existing?.id ?? null;

      ticketAttachmentsRepo.detachByFile(req.ticketId, req.fileId);

      // Invariant #11 emit.
      if (bus) {
        try {
          bus.emit({
            type: 'ticket.attachmentRemoved',
            companyId: ticket.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              attachmentId: snapshotAttachmentId,
              ticketId: req.ticketId,
              companyId: ticket.companyId,
              fileId: req.fileId,
              removedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] tickets.detachFile: bus emit failed (row still detached, ticketId=${req.ticketId}, fileId=${req.fileId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] tickets.detachFile: bus dep unwired — renderer caches will NOT invalidate',
        );
      }
    },

    async ticketsListAttachments(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.listAttachments: ticketId is required');
      }
      const rows = ticketAttachmentsRepo.listByTicket(req.ticketId);
      // Enrich with vault file metadata
      return rows.map((row): TicketAttachment => {
        const vaultFile = vaultService.get(row.fileId);
        return {
          id: row.id,
          ticketId: row.ticketId,
          fileId: row.fileId,
          attachedBy: row.attachedBy,
          attachedAt: row.attachedAt,
          fileName: vaultFile?.originalName,
          fileMimeType: vaultFile?.mimeType,
          fileSizeBytes: vaultFile?.sizeBytes,
        };
      });
    },
  };
}
