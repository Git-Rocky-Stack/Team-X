import type { ThreadDigestPinnedFact } from '@team-x/shared-types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';


import { createMessagesRepo } from '../db/repos/messages.js';
import { createThreadDigestsRepo } from '../db/repos/thread-digests.js';
import { companies, threads } from '../db/schema.js';
import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';

import { createThreadDigestService } from './thread-digest-service.js';

let ctx: TestDbHandle;
let messagesRepo: ReturnType<typeof createMessagesRepo>;
let threadDigestsRepo: ReturnType<typeof createThreadDigestsRepo>;

beforeEach(async () => {
  ctx = await makeTestDb();
  messagesRepo = createMessagesRepo(ctx.db);
  threadDigestsRepo = createThreadDigestsRepo(ctx.db);

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
    .values([
      {
        id: 'thread-1',
        companyId: 'company-1',
        kind: 'dm',
        subject: 'Thread One',
        createdBy: 'rocky',
        createdAt: 2,
        lastMessageAt: 2,
        ticketId: null,
      },
      {
        id: 'thread-2',
        companyId: 'company-1',
        kind: 'dm',
        subject: 'Thread Two',
        createdBy: 'rocky',
        createdAt: 3,
        lastMessageAt: 3,
        ticketId: null,
      },
    ])
    .run();
});

afterEach(() => {
  ctx.close();
});

function createService() {
  return createThreadDigestService({
    threadDigestsRepo,
    messagesRepo,
  });
}

function appendMessage(content: string) {
  return messagesRepo.append({
    threadId: 'thread-1',
    authorId: 'rocky',
    authorKind: 'user',
    content,
  });
}

describe('thread digest service', () => {
  it('marks a thread stale when it has messages and no digest yet', () => {
    appendMessage('First message');
    appendMessage('Second message');
    const service = createService();

    const inspection = service.inspectThread({
      companyId: 'company-1',
      threadId: 'thread-1',
    });

    expect(inspection.freshness).toBe('stale');
    expect(inspection.unsummarizedMessageCount).toBe(2);
    expect(inspection.needsRefresh).toBe(true);
  });

  it('marks a digest stale once the unsummarized message threshold is reached', () => {
    const firstId = appendMessage('A');
    const service = createService();
    service.upsertDigest({
      companyId: 'company-1',
      threadId: 'thread-1',
      summary: 'Digest',
      lastSummarizedMessageId: firstId,
    });
    for (let index = 0; index < 12; index += 1) {
      appendMessage(`Follow-up ${index}`);
    }

    const inspection = service.inspectThread({
      companyId: 'company-1',
      threadId: 'thread-1',
    });

    expect(inspection.freshness).toBe('stale');
    expect(inspection.unsummarizedMessageCount).toBe(12);
    expect(inspection.needsRefresh).toBe(true);
  });

  it('marks a digest degraded when its summarized boundary no longer exists', () => {
    appendMessage('Only live message');
    const wrongBoundaryId = messagesRepo.append({
      threadId: 'thread-2',
      authorId: 'rocky',
      authorKind: 'user',
      content: 'Other thread message',
    });
    const service = createService();
    threadDigestsRepo.upsert({
      companyId: 'company-1',
      threadId: 'thread-1',
      summary: 'Digest',
      lastSummarizedMessageId: wrongBoundaryId,
      freshness: 'fresh',
    });

    const inspection = service.inspectThread({
      companyId: 'company-1',
      threadId: 'thread-1',
    });

    expect(inspection.freshness).toBe('degraded');
    expect(inspection.needsRefresh).toBe(true);
  });

  it('stores pinned facts and defaults coverage to the latest message', () => {
    appendMessage('Mission context');
    const facts: ThreadDigestPinnedFact[] = [
      {
        id: 'fact-1',
        fact: 'Iris owns executive approvals',
        sourceMessageId: null,
      },
    ];
    const service = createService();

    const digest = service.upsertDigest({
      companyId: 'company-1',
      threadId: 'thread-1',
      summary: 'Mission digest',
      pinnedFacts: facts,
      estimatedTokens: 140,
    });

    expect(digest.pinnedFacts).toEqual(facts);
    expect(digest.lastSummarizedMessageId).toBeTruthy();
    expect(digest.freshness).toBe('fresh');
  });
});
