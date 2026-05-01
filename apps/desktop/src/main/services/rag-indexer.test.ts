import type { DashboardEvent } from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';

import { type RagIndexerDeps, createRagIndexer } from './rag-indexer.js';

function makeFakeBus() {
  const listeners: Array<(e: DashboardEvent) => void> = [];
  return {
    listeners,
    subscribe(fn: (e: DashboardEvent) => void) {
      listeners.push(fn);
      return () => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    emit(e: DashboardEvent) {
      for (const fn of listeners) fn(e);
    },
  };
}

function makeDeps(overrides: Partial<RagIndexerDeps> = {}): RagIndexerDeps & {
  indexed: Array<{ sourceType: string; sourceId: string; content: string }>;
} {
  const indexed: Array<{ sourceType: string; sourceId: string; content: string }> = [];
  const bus = makeFakeBus();
  return {
    bus,
    indexed,
    service: {
      indexSource: vi.fn(async (input) => {
        indexed.push({
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          content: input.content,
        });
        return 1;
      }),
      retrieve: vi.fn(),
      deleteBySource: vi.fn(() => 0),
    },
    getMessage: vi.fn((id: string) => ({
      id,
      threadId: 't1',
      authorId: 'e1',
      authorKind: 'employee' as const,
      content: `fetched:${id}`,
      createdAt: 1,
    })),
    getCompanyIdForThread: vi.fn(() => 'c1'),
    getTicket: vi.fn((id: string) => ({
      id,
      title: `ticket:${id}`,
      description: 'fix the outage',
      status: 'open',
      priority: 'high',
      assigneeId: 'emp-1',
      labelsJson: '["prod"]',
      dueAt: null,
      slaHours: null,
    })),
    getGoal: vi.fn((id: string) => ({
      id,
      title: `goal:${id}`,
      description: 'ship the quarter',
      status: 'active',
      targetDate: null,
    })),
    getProject: vi.fn((id: string) => ({
      id,
      title: `project:${id}`,
      description: 'replace onboarding flow',
      status: 'active',
      priority: 'high',
      goalId: 'goal-1',
      leadId: 'emp-2',
    })),
    getVaultFile: vi.fn((id: string) => ({
      id,
      originalName: 'Playbook.md',
      mimeType: 'text/markdown',
      sizeBytes: 123,
      extractedText: 'onboarding instructions',
      tagsJson: '["ops"]',
    })),
    isEnabled: () => true,
    logger: { error: vi.fn(), info: vi.fn() },
    ...overrides,
  };
}

describe('RagIndexer', () => {
  it('indexes message content on work.completed', async () => {
    const deps = makeDeps();
    const indexer = createRagIndexer(deps);
    indexer.start();

    deps.bus.emit({
      id: 'evt1',
      type: 'work.completed',
      companyId: 'c1',
      actorId: 'e1',
      actorKind: 'employee',
      payload: { threadId: 't1', employeeId: 'e1', messageId: 'm1' },
      createdAt: Date.now(),
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(deps.indexed).toContainEqual({
      sourceType: 'message',
      sourceId: 'm1',
      content: 'fetched:m1',
    });
  });

  it('no-ops when indexer is disabled', async () => {
    const deps = makeDeps({ isEnabled: () => false });
    const indexer = createRagIndexer(deps);
    indexer.start();

    deps.bus.emit({
      id: 'evt1',
      type: 'work.completed',
      companyId: 'c1',
      actorId: 'e1',
      actorKind: 'employee',
      payload: { threadId: 't1', employeeId: 'e1', messageId: 'm1' },
      createdAt: Date.now(),
    });

    await Promise.resolve();
    expect(deps.indexed).toHaveLength(0);
  });

  it('unsubscribe stops further indexing', async () => {
    const deps = makeDeps();
    const indexer = createRagIndexer(deps);
    indexer.start();
    indexer.stop();

    deps.bus.emit({
      id: 'evt1',
      type: 'work.completed',
      companyId: 'c1',
      actorId: 'e1',
      actorKind: 'employee',
      payload: { threadId: 't1', employeeId: 'e1', messageId: 'm1' },
      createdAt: Date.now(),
    });

    await Promise.resolve();
    expect(deps.indexed).toHaveLength(0);
  });

  it('errors in indexSource are caught and logged, not thrown', async () => {
    const deps = makeDeps();
    deps.service.indexSource = vi.fn(async () => {
      throw new Error('boom');
    });
    const indexer = createRagIndexer(deps);
    indexer.start();

    expect(() =>
      deps.bus.emit({
        id: 'evt1',
        type: 'work.completed',
        companyId: 'c1',
        actorId: 'e1',
        actorKind: 'employee',
        payload: { threadId: 't1', employeeId: 'e1', messageId: 'm1' },
        createdAt: Date.now(),
      }),
    ).not.toThrow();

    await Promise.resolve();
    await Promise.resolve();
    expect(deps.logger.error).toHaveBeenCalled();
  });

  it('indexes meeting minutes on meeting.ended', async () => {
    const deps = makeDeps({
      getMeetingMinutes: vi.fn(() => ({ id: 'mtg1', minutesText: 'decisions and actions' })),
    });
    const indexer = createRagIndexer(deps);
    indexer.start();

    deps.bus.emit({
      id: 'evt2',
      type: 'meeting.ended',
      companyId: 'c1',
      actorId: 'orchestrator',
      actorKind: 'orchestrator',
      payload: { meetingId: 'mtg1' },
      createdAt: Date.now(),
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(deps.indexed).toContainEqual({
      sourceType: 'meeting_minutes',
      sourceId: 'mtg1',
      content: 'decisions and actions',
    });
  });

  it('indexes ticket state on ticket events', async () => {
    const deps = makeDeps();
    const indexer = createRagIndexer(deps);
    indexer.start();

    deps.bus.emit({
      id: 'evt3',
      type: 'ticket.updated',
      companyId: 'c1',
      actorId: 'rocky',
      actorKind: 'user',
      payload: { ticketId: 'tkt-1', patchedKeys: ['title'], updatedAt: Date.now() },
      createdAt: Date.now(),
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(deps.indexed).toContainEqual({
      sourceType: 'ticket',
      sourceId: 'tkt-1',
      content: expect.stringContaining('Title: ticket:tkt-1'),
    });
  });

  it('indexes goals, projects, and vault files on create events', async () => {
    const deps = makeDeps();
    const indexer = createRagIndexer(deps);
    indexer.start();

    deps.bus.emit({
      id: 'evt4',
      type: 'goal.created',
      companyId: 'c1',
      actorId: 'rocky',
      actorKind: 'user',
      payload: { goalId: 'goal-1', companyId: 'c1', title: 'Goal', createdAt: Date.now() },
      createdAt: Date.now(),
    });
    deps.bus.emit({
      id: 'evt5',
      type: 'project.created',
      companyId: 'c1',
      actorId: 'rocky',
      actorKind: 'user',
      payload: {
        projectId: 'prj-1',
        companyId: 'c1',
        title: 'Project',
        goalId: 'goal-1',
        createdAt: Date.now(),
      },
      createdAt: Date.now(),
    });
    deps.bus.emit({
      id: 'evt6',
      type: 'vault.file_created',
      companyId: 'c1',
      actorId: 'rocky',
      actorKind: 'user',
      payload: {
        fileId: 'file-1',
        originalName: 'Playbook.md',
        mimeType: 'text/markdown',
        sizeBytes: 123,
        sha256: 'abc',
      },
      createdAt: Date.now(),
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(deps.indexed).toContainEqual({
      sourceType: 'goal',
      sourceId: 'goal-1',
      content: expect.stringContaining('Title: goal:goal-1'),
    });
    expect(deps.indexed).toContainEqual({
      sourceType: 'project',
      sourceId: 'prj-1',
      content: expect.stringContaining('Title: project:prj-1'),
    });
    expect(deps.indexed).toContainEqual({
      sourceType: 'vault_file',
      sourceId: 'file-1',
      content: expect.stringContaining('Name: Playbook.md'),
    });
  });

  it('deletes embeddings when delete events arrive', async () => {
    const deps = makeDeps();
    const indexer = createRagIndexer(deps);
    indexer.start();

    deps.bus.emit({
      id: 'evt7',
      type: 'goal.deleted',
      companyId: 'c1',
      actorId: 'rocky',
      actorKind: 'user',
      payload: { goalId: 'goal-1', companyId: 'c1', title: 'Goal', deletedAt: Date.now() },
      createdAt: Date.now(),
    });
    deps.bus.emit({
      id: 'evt8',
      type: 'project.deleted',
      companyId: 'c1',
      actorId: 'rocky',
      actorKind: 'user',
      payload: { projectId: 'prj-1', companyId: 'c1', title: 'Project', deletedAt: Date.now() },
      createdAt: Date.now(),
    });
    deps.bus.emit({
      id: 'evt9',
      type: 'vault.file_deleted',
      companyId: 'c1',
      actorId: 'rocky',
      actorKind: 'user',
      payload: { fileId: 'file-1' },
      createdAt: Date.now(),
    });

    await Promise.resolve();
    expect(deps.service.deleteBySource).toHaveBeenCalledWith('goal-1');
    expect(deps.service.deleteBySource).toHaveBeenCalledWith('prj-1');
    expect(deps.service.deleteBySource).toHaveBeenCalledWith('file-1');
  });
});
