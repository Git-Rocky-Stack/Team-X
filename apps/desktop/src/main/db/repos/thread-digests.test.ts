import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { companies, messages, threads } from '../schema.js';
import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { createThreadDigestsRepo } from './thread-digests.js';

let ctx: TestDbHandle;
let repo: ReturnType<typeof createThreadDigestsRepo>;

beforeEach(async () => {
  ctx = await makeTestDb();
  repo = createThreadDigestsRepo(ctx.db);

  ctx.db
    .insert(companies)
    .values({
      id: 'company-1',
      name: 'Alpha',
      slug: 'alpha',
      createdAt: 1,
      settingsJson: '{}',
      icon: null,
      theme: 'dark',
      status: 'running',
    })
    .run();

  ctx.db
    .insert(threads)
    .values({
      id: 'thread-1',
      companyId: 'company-1',
      kind: 'dm',
      subject: 'Thread One',
      createdBy: 'rocky',
      createdAt: 2,
      lastMessageAt: 4,
      ticketId: null,
    })
    .run();

  ctx.db
    .insert(messages)
    .values({
      id: 'message-1',
      threadId: 'thread-1',
      authorId: 'rocky',
      authorKind: 'user',
      content: 'Hello',
      toolCallsJson: null,
      parentId: null,
      isAgentInitiated: false,
      createdAt: 4,
    })
    .run();
});

afterEach(() => {
  ctx.close();
});

describe('thread digests repo', () => {
  it('creates and returns one digest for a company thread', () => {
    const row = repo.upsert({
      companyId: 'company-1',
      threadId: 'thread-1',
      summary: 'Condensed summary',
      pinnedFactsJson: JSON.stringify([{ id: 'fact-1', fact: 'User prefers concise output' }]),
      lastSummarizedMessageId: 'message-1',
      estimatedTokens: 180,
      freshness: 'fresh',
    });

    expect(row.threadId).toBe('thread-1');
    expect(repo.getByCompanyThread('company-1', 'thread-1')).toEqual(
      expect.objectContaining({
        id: row.id,
        summary: 'Condensed summary',
        lastSummarizedMessageId: 'message-1',
        freshness: 'fresh',
      }),
    );
  });

  it('upserts the existing digest row instead of creating a duplicate', () => {
    const first = repo.upsert({
      companyId: 'company-1',
      threadId: 'thread-1',
      summary: 'Initial summary',
      freshness: 'stale',
    });

    const second = repo.upsert({
      companyId: 'company-1',
      threadId: 'thread-1',
      summary: 'Refreshed summary',
      freshness: 'fresh',
      estimatedTokens: 220,
    });

    expect(second.id).toBe(first.id);
    expect(repo.getByCompanyThread('company-1', 'thread-1')).toEqual(
      expect.objectContaining({
        id: first.id,
        summary: 'Refreshed summary',
        freshness: 'fresh',
        estimatedTokens: 220,
      }),
    );
  });
});
