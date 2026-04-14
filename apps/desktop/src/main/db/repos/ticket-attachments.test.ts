import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';
import { createCompaniesRepo } from './companies.js';
import { createTicketAttachmentsRepo } from './ticket-attachments.js';
import { createTicketsRepo } from './tickets.js';
import { createVaultRepo } from './vault.js';

describe('ticket attachments repo', () => {
  let ctx: TestDbHandle;
  let attachmentsRepo: ReturnType<typeof createTicketAttachmentsRepo>;
  let ticketsRepo: ReturnType<typeof createTicketsRepo>;
  let vaultRepo: ReturnType<typeof createVaultRepo>;
  let companyId: string;
  let ticketId: string;
  let fileId: string;

  beforeEach(async () => {
    ctx = await makeTestDb();
    const companies = createCompaniesRepo(ctx.db);
    ticketsRepo = createTicketsRepo(ctx.db);
    vaultRepo = createVaultRepo(ctx.db);
    attachmentsRepo = createTicketAttachmentsRepo(ctx.db);

    companyId = companies.create({ name: 'Test Co', slug: 'test-co' });
    ticketId = ticketsRepo.create({
      companyId,
      title: 'Bug report',
      description: 'Something is broken',
      priority: 'high',
      assigneeId: null,
      reporterId: 'rocky',
      reporterKind: 'user',
      labelsJson: '[]',
      slaHours: null,
      dueAt: null,
    });
    fileId = vaultRepo.create({
      companyId,
      filename: 'screenshot.png',
      originalName: 'screenshot.png',
      mimeType: 'image/png',
      sizeBytes: 5000,
      sha256: 'abc123',
      vaultPath: 'ab/screenshot.png',
      uploadedBy: 'rocky',
    });
  });

  afterEach(() => {
    ctx.close();
  });

  describe('attach', () => {
    it('returns a non-empty id and persists the attachment', () => {
      const id = attachmentsRepo.attach(ticketId, fileId, 'rocky');
      expect(id).toBeTruthy();

      const row = attachmentsRepo.getById(id);
      expect(row).not.toBeNull();
      expect(row?.ticketId).toBe(ticketId);
      expect(row?.fileId).toBe(fileId);
      expect(row?.attachedBy).toBe('rocky');
      expect(row?.attachedAt).toBeGreaterThan(0);
    });

    it('allows the same file to be attached to multiple tickets', () => {
      const ticketId2 = ticketsRepo.create({
        companyId,
        title: 'Another bug',
        description: '',
        priority: 'low',
        assigneeId: null,
        reporterId: 'rocky',
        reporterKind: 'user',
        labelsJson: '[]',
        slaHours: null,
        dueAt: null,
      });

      const id1 = attachmentsRepo.attach(ticketId, fileId, 'rocky');
      const id2 = attachmentsRepo.attach(ticketId2, fileId, 'rocky');
      expect(id1).not.toBe(id2);
    });
  });

  describe('detach', () => {
    it('removes the attachment by id', () => {
      const id = attachmentsRepo.attach(ticketId, fileId, 'rocky');
      expect(attachmentsRepo.getById(id)).not.toBeNull();

      attachmentsRepo.detach(id);
      expect(attachmentsRepo.getById(id)).toBeNull();
    });
  });

  describe('detachByFile', () => {
    it('removes the attachment by ticket + file pair', () => {
      attachmentsRepo.attach(ticketId, fileId, 'rocky');
      expect(attachmentsRepo.listByTicket(ticketId)).toHaveLength(1);

      attachmentsRepo.detachByFile(ticketId, fileId);
      expect(attachmentsRepo.listByTicket(ticketId)).toHaveLength(0);
    });
  });

  describe('listByTicket', () => {
    it('returns all attachments for a ticket, newest first', () => {
      const fileId2 = vaultRepo.create({
        companyId,
        filename: 'log.txt',
        originalName: 'log.txt',
        mimeType: 'text/plain',
        sizeBytes: 100,
        sha256: 'def456',
        vaultPath: 'de/log.txt',
        uploadedBy: 'rocky',
      });

      attachmentsRepo.attach(ticketId, fileId, 'rocky');
      attachmentsRepo.attach(ticketId, fileId2, 'rocky');

      const list = attachmentsRepo.listByTicket(ticketId);
      expect(list).toHaveLength(2);
      // Newest first
      expect(list[0]?.attachedAt).toBeGreaterThanOrEqual(list[1]?.attachedAt);
    });

    it('returns empty array for ticket with no attachments', () => {
      expect(attachmentsRepo.listByTicket(ticketId)).toEqual([]);
    });
  });

  describe('listByFile', () => {
    it('returns all tickets a file is attached to', () => {
      attachmentsRepo.attach(ticketId, fileId, 'rocky');
      const list = attachmentsRepo.listByFile(fileId);
      expect(list).toHaveLength(1);
      expect(list[0]?.ticketId).toBe(ticketId);
    });
  });

  describe('getById', () => {
    it('returns null for non-existent id', () => {
      expect(attachmentsRepo.getById('nonexistent')).toBeNull();
    });
  });
});
