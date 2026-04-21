import { describe, expect, it, vi } from 'vitest';

import { rebuildCompanyRagSources } from './rag-rebuild.js';

describe('rebuildCompanyRagSources', () => {
  it('indexes every supported source class for a company', async () => {
    const indexed: Array<{ sourceType: string; sourceId: string; content: string }> = [];

    const result = await rebuildCompanyRagSources({
      companyId: 'c1',
      service: {
        indexSource: vi.fn(async (input) => {
          indexed.push({
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            content: input.content,
          });
          return 1;
        }),
      },
      threadsRepo: {
        listByCompany: vi.fn(() => [{ id: 'thread-1' }]),
      },
      messagesRepo: {
        listByThread: vi.fn(() => [{ id: 'msg-1', content: 'message body' }]),
      },
      meetingsRepo: {
        listByCompany: vi.fn(() => [{ id: 'mtg-1', minutesMd: 'decision log' }]),
      },
      ticketsRepo: {
        listByCompany: vi.fn(() => [
          {
            id: 'tkt-1',
            title: 'Fix outage',
            description: 'restore service',
            status: 'open',
            priority: 'high',
            assigneeId: 'emp-1',
            labelsJson: '["prod"]',
            dueAt: null,
            slaHours: null,
          },
        ]),
      },
      goalsRepo: {
        listByCompany: vi.fn(() => [
          {
            id: 'goal-1',
            title: 'Ship v2',
            description: 'launch the next release',
            status: 'active',
            targetDate: null,
          },
        ]),
      },
      projectsRepo: {
        listByCompany: vi.fn(() => [
          {
            id: 'prj-1',
            title: 'Onboarding revamp',
            description: 'replace the old flow',
            status: 'active',
            priority: 'medium',
            goalId: 'goal-1',
            leadId: 'emp-2',
          },
        ]),
      },
      vaultRepo: {
        listByCompany: vi.fn(() => [
          {
            id: 'file-1',
            originalName: 'Playbook.md',
            mimeType: 'text/markdown',
            sizeBytes: 321,
            extractedText: 'company operating guide',
            tagsJson: '["ops"]',
          },
        ]),
      },
    });

    expect(result).toEqual({ scheduled: 6, failed: 0 });
    expect(indexed.map((entry) => `${entry.sourceType}:${entry.sourceId}`)).toEqual([
      'message:msg-1',
      'meeting_minutes:mtg-1',
      'ticket:tkt-1',
      'goal:goal-1',
      'project:prj-1',
      'vault_file:file-1',
    ]);
  });

  it('skips blank content and isolates failures', async () => {
    const error = vi.fn();
    const warn = vi.fn();

    const result = await rebuildCompanyRagSources({
      companyId: 'c1',
      service: {
        indexSource: vi.fn(async (input) => {
          if (input.sourceId === 'goal-1') throw new Error('boom');
          return 1;
        }),
      },
      threadsRepo: {
        listByCompany: vi.fn(() => [{ id: 'thread-1' }]),
      },
      messagesRepo: {
        listByThread: vi.fn(() => [
          { id: 'msg-1', content: '   ' },
          { id: 'msg-2', content: 'useful message' },
        ]),
      },
      meetingsRepo: {
        listByCompany: vi.fn(() => [{ id: 'mtg-1', minutesMd: null }]),
      },
      ticketsRepo: {
        listByCompany: vi.fn(() => []),
      },
      goalsRepo: {
        listByCompany: vi.fn(() => [
          {
            id: 'goal-1',
            title: 'Ship v2',
            description: 'launch the next release',
            status: 'active',
            targetDate: null,
          },
        ]),
      },
      projectsRepo: {
        listByCompany: vi.fn(() => []),
      },
      vaultRepo: {
        listByCompany: vi.fn(() => []),
      },
      logger: { error, warn },
    });

    expect(result).toEqual({ scheduled: 1, failed: 1 });
    expect(error).toHaveBeenCalledWith(
      '[rag] rebuild: indexSource failed for goal goal-1:',
      expect.any(Error),
    );
    expect(warn).toHaveBeenCalledWith('[rag] rebuild for company c1: 1 succeeded, 1 failed');
  });
});
