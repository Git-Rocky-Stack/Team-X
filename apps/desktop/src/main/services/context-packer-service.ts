import type {
  AssembledContextBlock,
  AssembledThreadContext,
  ContextBlockPriority,
  ContextDrop,
  PackedContextBlock,
  PackedContextTurn,
  PackedThreadContext,
  RunCheckpointResumeOrigin,
  RunCheckpointResumableKind,
} from '@team-x/shared-types';
import { RUN_CHECKPOINT_RESUMABLE_KINDS } from '@team-x/shared-types';

export const DEFAULT_CONTEXT_TOKEN_BUDGET = 2200;

const DEFAULT_RECENT_TURN_BUDGET_RATIO = 0.42;
const DEFAULT_RETRIEVAL_BUDGET_RATIO = 0.18;
const MIN_TRUNCATABLE_BUDGET = 16;

function defaultCountTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function priorityRank(priority: ContextBlockPriority): number {
  switch (priority) {
    case 'critical':
      return 0;
    case 'high':
      return 1;
    case 'medium':
      return 2;
    case 'low':
      return 3;
  }
}

const KIND_ORDER: Record<AssembledContextBlock['kind'], number> = {
  ticket: 0,
  digest: 1,
  checkpoint: 2,
  project: 3,
  goal: 4,
  approval: 5,
  company: 6,
  routine: 7,
  artifact: 8,
  retrieval: 9,
};

export interface PackThreadContextInput {
  context: AssembledThreadContext;
  targetTokenBudget?: number;
}

export interface ContextPackDecision {
  scope: 'turn' | 'block';
  itemId: string;
  action: 'include' | 'truncate' | 'drop';
  reason?: 'budget' | 'category-cap';
}

export interface ContextPackerServiceDeps {
  countTokens?: (text: string) => number;
  onDecision?: (decision: ContextPackDecision) => void;
}

function clampTokenBudget(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) {
    return DEFAULT_CONTEXT_TOKEN_BUDGET;
  }
  return Math.max(128, Math.round(value));
}

function renderBlockText(block: Pick<AssembledContextBlock, 'title' | 'body' | 'sourceLabel'>): string {
  const header = `## ${block.title}`;
  const sourceLine = block.sourceLabel ? `Source: ${block.sourceLabel}\n` : '';
  return `${header}\n${sourceLine}${block.body}`.trim();
}

function fitTextToBudget(
  text: string,
  remainingTokens: number,
  countTokens: (text: string) => number,
): { text: string; truncated: boolean } | null {
  if (countTokens(text) <= remainingTokens) {
    return { text, truncated: false };
  }
  if (remainingTokens < MIN_TRUNCATABLE_BUDGET) {
    return null;
  }

  let next = text.slice(0, Math.max(24, remainingTokens * 4 - 3)).trim();
  while (next.length >= 24) {
    const candidate = `${next}...`;
    if (countTokens(candidate) <= remainingTokens) {
      return { text: candidate, truncated: true };
    }
    next = next.slice(0, Math.max(24, next.length - 20)).trim();
  }
  return null;
}

function fitBlockToBudget(
  block: AssembledContextBlock,
  remainingTokens: number,
  countTokens: (text: string) => number,
): PackedContextBlock | null {
  const fullText = renderBlockText(block);
  const fit = fitTextToBudget(fullText, remainingTokens, countTokens);
  if (!fit) return null;
  return {
    ...block,
    renderedText: fit.text,
    tokenCount: countTokens(fit.text),
    truncated: fit.truncated,
  };
}

function fitTurnToBudget(
  turn: AssembledThreadContext['recentTurns'][number],
  remainingTokens: number,
  countTokens: (text: string) => number,
): PackedContextTurn | null {
  const fit = fitTextToBudget(turn.content, remainingTokens, countTokens);
  if (!fit) return null;
  return {
    ...turn,
    content: fit.text,
    estimatedTokens: countTokens(fit.text),
    truncated: fit.truncated,
  };
}

function deriveResumeOrigin(blocks: PackedContextBlock[]): RunCheckpointResumeOrigin | null {
  for (const block of blocks) {
    if (block.kind !== 'checkpoint' || !block.sourceRefId) continue;
    const checkpointKind = block.metadata.checkpointKind;
    if (
      typeof checkpointKind !== 'string' ||
      !RUN_CHECKPOINT_RESUMABLE_KINDS.includes(checkpointKind as RunCheckpointResumableKind)
    ) {
      continue;
    }
    return {
      checkpointId: block.sourceRefId,
      checkpointKind: checkpointKind as RunCheckpointResumableKind,
      createdAt: typeof block.metadata.createdAt === 'number' ? block.metadata.createdAt : null,
    };
  }
  return null;
}

export function createContextPackerService(deps: ContextPackerServiceDeps = {}) {
  const { countTokens = defaultCountTokens, onDecision } = deps;

  return {
    packContext(input: PackThreadContextInput): PackedThreadContext {
      const targetTokenBudget = clampTokenBudget(input.targetTokenBudget);
      const recentTurnBudget = Math.min(
        targetTokenBudget,
        Math.max(64, Math.round(targetTokenBudget * DEFAULT_RECENT_TURN_BUDGET_RATIO)),
      );
      const retrievalBudget = Math.min(
        targetTokenBudget,
        Math.max(48, Math.round(targetTokenBudget * DEFAULT_RETRIEVAL_BUDGET_RATIO)),
      );

      let recentTurnTokens = 0;
      const packedTurns: PackedContextTurn[] = [];
      for (let index = input.context.recentTurns.length - 1; index >= 0; index -= 1) {
        const turn = input.context.recentTurns[index]!;
        const remaining = recentTurnBudget - recentTurnTokens;
        if (remaining <= 0) break;
        const fitted = fitTurnToBudget(turn, remaining, countTokens);
        if (!fitted) {
          onDecision?.({
            scope: 'turn',
            itemId: turn.messageId ?? `turn-${index}`,
            action: 'drop',
            reason: 'budget',
          });
          continue;
        }
        recentTurnTokens += fitted.estimatedTokens;
        packedTurns.unshift(fitted);
        onDecision?.({
          scope: 'turn',
          itemId: turn.messageId ?? `turn-${index}`,
          action: fitted.truncated ? 'truncate' : 'include',
          ...(fitted.truncated ? { reason: 'budget' } : {}),
        });
      }

      const sortedBlocks = [...input.context.blocks].sort(
        (a, b) =>
          priorityRank(a.priority) - priorityRank(b.priority) ||
          KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
          a.title.localeCompare(b.title),
      );

      const includedBlocks: PackedContextBlock[] = [];
      const droppedBlocks: ContextDrop[] = [];
      let blockTokens = 0;
      let retrievalTokens = 0;

      for (const block of sortedBlocks) {
        const usedTokens = recentTurnTokens + blockTokens;
        const remainingTotal = targetTokenBudget - usedTokens;
        if (remainingTotal <= 0) {
          droppedBlocks.push({
            blockId: block.id,
            kind: block.kind,
            priority: block.priority,
            estimatedTokens: block.estimatedTokens,
            reason: 'budget',
          });
          onDecision?.({
            scope: 'block',
            itemId: block.id,
            action: 'drop',
            reason: 'budget',
          });
          continue;
        }

        let availableBudget = remainingTotal;
        if (block.kind === 'retrieval') {
          const remainingRetrieval = retrievalBudget - retrievalTokens;
          if (remainingRetrieval <= 0) {
            droppedBlocks.push({
              blockId: block.id,
              kind: block.kind,
              priority: block.priority,
              estimatedTokens: block.estimatedTokens,
              reason: 'category-cap',
            });
            onDecision?.({
              scope: 'block',
              itemId: block.id,
              action: 'drop',
              reason: 'category-cap',
            });
            continue;
          }
          availableBudget = Math.min(availableBudget, remainingRetrieval);
        }

        const fitted = fitBlockToBudget(block, availableBudget, countTokens);
        if (!fitted) {
          droppedBlocks.push({
            blockId: block.id,
            kind: block.kind,
            priority: block.priority,
            estimatedTokens: block.estimatedTokens,
            reason: block.kind === 'retrieval' ? 'category-cap' : 'budget',
          });
          onDecision?.({
            scope: 'block',
            itemId: block.id,
            action: 'drop',
            reason: block.kind === 'retrieval' ? 'category-cap' : 'budget',
          });
          continue;
        }

        includedBlocks.push(fitted);
        blockTokens += fitted.tokenCount;
        if (block.kind === 'retrieval') {
          retrievalTokens += fitted.tokenCount;
        }
        onDecision?.({
          scope: 'block',
          itemId: block.id,
          action: fitted.truncated ? 'truncate' : 'include',
          ...(fitted.truncated
            ? { reason: block.kind === 'retrieval' ? 'category-cap' : 'budget' }
            : {}),
        });
      }

      const systemAddendum = includedBlocks.map((block) => block.renderedText).join('\n\n').trim();
      return {
        companyId: input.context.companyId,
        threadId: input.context.threadId,
        generatedAt: input.context.generatedAt,
        targetTokenBudget,
        usedTokens: recentTurnTokens + blockTokens,
        recentTurnTokens,
        blockTokens,
        retrievalTokens,
        packedTurns,
        systemAddendum,
        includedBlocks,
        droppedBlocks,
        retrievalQueries: input.context.retrievalQueries,
        resumeOrigin: deriveResumeOrigin(includedBlocks),
      };
    },
  };
}

export type ContextPackerService = ReturnType<typeof createContextPackerService>;
