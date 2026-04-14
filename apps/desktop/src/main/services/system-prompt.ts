/**
 * composeSystemPromptWithRag — wraps the existing role.md render step
 * with a retrieve-and-inject pass. Returned string is the pre-rendered
 * system prompt `runAgent` expects.
 *
 * Zero regression: when RAG is disabled or retrieval is empty, returns
 * the plain rendered role prompt with no diff.
 *
 * Phase 5 — M29.
 */

import type { RetrievalHit } from '@team-x/intelligence';

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
  getRagConfig(): { topK: number; threshold: number; maxTokens: number };
  getRecentUserMessages(input: ComposeInput): RecentMessage[];
  retrieve(input: {
    companyId: string;
    query: string;
    topK: number;
    threshold: number;
    excludeSourceIds: string[];
  }): Promise<RetrievalHit[]>;
  countTokens(text: string): number;
}

const SOURCE_LABELS: Record<string, string> = {
  message: 'message',
  ticket: 'ticket',
  meeting_minutes: 'meeting',
  goal: 'goal',
  project: 'project',
  vault_file: 'vault',
};

export async function composeSystemPromptWithRag(
  deps: ComposeDeps,
  input: ComposeInput,
): Promise<string> {
  const base = await deps.renderRoleSystemPrompt(input);

  if (!deps.isRagEnabled()) return base;

  const recent = deps.getRecentUserMessages(input);
  if (recent.length === 0) return base;

  const query = recent
    .slice(-2)
    .map((m) => m.content)
    .join('\n\n')
    .trim();
  if (!query) return base;

  const { topK, threshold, maxTokens } = deps.getRagConfig();

  const excludeSourceIds = recent.map((m) => m.sourceId);
  const excludeSet = new Set(excludeSourceIds);

  const hits = await deps.retrieve({
    companyId: input.companyId,
    query,
    topK,
    threshold,
    excludeSourceIds,
  });

  // Double-filter: in case the retrieve impl doesn't honor excludeSourceIds,
  // drop any hit whose sourceId is in the exclude set at render time.
  const filtered = hits.filter((h) => !excludeSet.has(h.sourceId));
  if (filtered.length === 0) return base;

  const lines: string[] = [];
  let used = 0;
  for (const hit of filtered) {
    const label = SOURCE_LABELS[hit.sourceType] ?? hit.sourceType;
    const formatted = `[Source: ${label} ${hit.sourceId}] ${hit.contentText}`;
    const cost = deps.countTokens(formatted);
    if (used + cost > maxTokens) break;
    used += cost;
    lines.push(formatted);
  }

  if (lines.length === 0) return base;

  return `${base}\n\n## Relevant Context\n${lines.join('\n\n')}`;
}
