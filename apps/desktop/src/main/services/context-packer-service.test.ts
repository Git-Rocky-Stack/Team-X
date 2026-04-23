import { describe, expect, it } from 'vitest';

import type { AssembledThreadContext } from '@team-x/shared-types';

import { createContextPackerService } from './context-packer-service.js';

describe('context packer service', () => {
  it('keeps critical context and drops low-priority retrieval when no room remains', () => {
    const service = createContextPackerService({
      countTokens: (text) => Math.max(1, Math.ceil(text.length / 4)),
    });
    const context: AssembledThreadContext = {
      companyId: 'company-1',
      threadId: 'thread-1',
      generatedAt: 1,
      retrievalQueries: ['launch plan'],
      recentTurns: [],
      blocks: [
        {
          id: 'ticket-1',
          kind: 'ticket',
          priority: 'critical',
          title: 'Ticket Launch Plan',
          body:
            'Status in_progress. Priority high. Description: finalize the launch motion with every milestone and operator note preserved. '.repeat(
              6,
            ),
          estimatedTokens: 12,
          sourceRefId: 'ticket-1',
          sourceLabel: 'in_progress',
          metadata: {},
        },
        {
          id: 'retrieval-1',
          kind: 'retrieval',
          priority: 'low',
          title: 'Retrieved ticket',
          body: 'Historical launch notes and prior deliverable details that are helpful but optional.',
          estimatedTokens: 14,
          sourceRefId: 'ticket-77',
          sourceLabel: 'ticket',
          metadata: {},
        },
      ],
    };

    const result = service.packContext({
      context,
      targetTokenBudget: 128,
    });

    expect(result.includedBlocks.map((block) => block.id)).toContain('ticket-1');
    expect(result.droppedBlocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blockId: 'retrieval-1',
          reason: expect.stringMatching(/budget|category-cap/),
        }),
      ]),
    );
    expect(result.usedTokens).toBeLessThanOrEqual(result.targetTokenBudget);
  });

  it('truncates oversized turns or blocks rather than dropping everything', () => {
    const service = createContextPackerService({
      countTokens: (text) => Math.max(1, Math.ceil(text.length / 6)),
    });
    const context: AssembledThreadContext = {
      companyId: 'company-1',
      threadId: 'thread-1',
      generatedAt: 2,
      retrievalQueries: [],
      recentTurns: [
        {
          messageId: 'message-1',
          role: 'user',
          authorId: 'rocky',
          authorKind: 'user',
          content:
            'This is a deliberately long user turn that should be shortened to fit the recent-turn budget. '.repeat(
              10,
            ),
          createdAt: 2,
          estimatedTokens: 20,
        },
      ],
      blocks: [
        {
          id: 'digest-1',
          kind: 'digest',
          priority: 'high',
          title: 'Thread Digest',
          body:
            'A long digest body that should also be compressed so the pack still returns something useful. '.repeat(
              8,
            ),
          estimatedTokens: 18,
          sourceRefId: 'digest-1',
          sourceLabel: 'thread-1',
          metadata: {},
        },
      ],
    };

    const result = service.packContext({
      context,
      targetTokenBudget: 128,
    });

    expect(result.packedTurns).toHaveLength(1);
    expect(result.packedTurns[0]?.truncated).toBe(true);
    expect(result.includedBlocks).toHaveLength(1);
    expect(result.includedBlocks[0]?.truncated).toBe(true);
    expect(result.usedTokens).toBeLessThanOrEqual(128);
  });
});
