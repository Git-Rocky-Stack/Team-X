/**
 * composeSystemPromptWithRag — wraps the existing role.md render step
 * with an evidence-pack retrieval pass. Returned string is the pre-rendered
 * system prompt `runAgent` expects.
 *
 * Zero regression: when RAG is disabled or retrieval is empty, returns
 * the plain rendered role prompt with no diff.
 *
 * Phase 5 — M29.
 */

import { type RetrievalEvidencePack, formatEvidenceLine } from './retrieval-orchestrator.js';

export interface RecentMessage {
  id: string;
  content: string;
  sourceId: string;
}

export interface ComposeInput {
  employeeId: string;
  companyId: string;
  threadId: string;
}

export interface ComposeDeps {
  renderRoleSystemPrompt(input: ComposeInput): Promise<string>;
  isRagEnabled(): boolean;
  getRecentUserMessages(input: ComposeInput): RecentMessage[];
  retrieveEvidence(input: {
    companyId: string;
    recentMessages: RecentMessage[];
    excludeSourceIds: string[];
  }): Promise<RetrievalEvidencePack>;
}

const EXECUTION_POLICY = [
  '## Execution Policy',
  '- Only say an action is completed when a tool result or current state confirms it.',
  '- If a decision is made but no verified mutation exists yet, describe it as recorded, delegated, pending, or blocked.',
].join('\n');

export function appendExecutionPolicy(prompt: string): string {
  return `${prompt}\n\n${EXECUTION_POLICY}`;
}

export async function composeSystemPromptWithRag(
  deps: ComposeDeps,
  input: ComposeInput,
): Promise<string> {
  const base = await deps.renderRoleSystemPrompt(input);

  if (!deps.isRagEnabled()) return base;

  const recent = deps.getRecentUserMessages(input);
  if (recent.length === 0) return base;

  const excludeSourceIds = recent.map((m) => m.sourceId);
  const evidence = await deps.retrieveEvidence({
    companyId: input.companyId,
    recentMessages: recent,
    excludeSourceIds,
  });
  if (evidence.entries.length === 0) return base;

  const lines = evidence.entries.map((entry) => formatEvidenceLine(entry));
  return `${base}\n\n## Relevant Context\n${lines.join('\n\n')}`;
}
