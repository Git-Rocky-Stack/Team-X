/**
 * Ticket attachments repository — links vault files to tickets.
 */

import { and, desc, eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { ticketAttachments } from '../schema.js';

export type TicketAttachmentRow = typeof ticketAttachments.$inferSelect;

type AttachmentsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createTicketAttachmentsRepo<TRunResult>(db: AttachmentsDb<TRunResult>) {
  return {
    /** Attach a vault file to a ticket. Returns the attachment id. */
    attach(ticketId: string, fileId: string, attachedBy: string): string {
      const id = nanoid();
      db.insert(ticketAttachments)
        .values({
          id,
          ticketId,
          fileId,
          attachedBy,
          attachedAt: Date.now(),
        })
        .run();
      return id;
    },

    /** Detach a file from a ticket by attachment id. */
    detach(attachmentId: string): void {
      db.delete(ticketAttachments).where(eq(ticketAttachments.id, attachmentId)).run();
    },

    /** Detach by ticket + file pair (alternative to detach-by-id). */
    detachByFile(ticketId: string, fileId: string): void {
      db.delete(ticketAttachments)
        .where(and(eq(ticketAttachments.ticketId, ticketId), eq(ticketAttachments.fileId, fileId)))
        .run();
    },

    /** List all attachments for a ticket, newest first. */
    listByTicket(ticketId: string): TicketAttachmentRow[] {
      return db
        .select()
        .from(ticketAttachments)
        .where(eq(ticketAttachments.ticketId, ticketId))
        .orderBy(desc(ticketAttachments.attachedAt))
        .all();
    },

    /** List all tickets a file is attached to. */
    listByFile(fileId: string): TicketAttachmentRow[] {
      return db.select().from(ticketAttachments).where(eq(ticketAttachments.fileId, fileId)).all();
    },

    /** Get a single attachment by id. */
    getById(id: string): TicketAttachmentRow | null {
      return db.select().from(ticketAttachments).where(eq(ticketAttachments.id, id)).get() ?? null;
    },
  };
}
