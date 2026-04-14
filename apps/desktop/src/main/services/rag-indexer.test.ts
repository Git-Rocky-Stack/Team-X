import { describe, expect, it, vi } from 'vitest';
import { createRagIndexer, type RagIndexerDeps } from './rag-indexer.js';
import type { DashboardEvent } from '@team-x/shared-types';

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
});
