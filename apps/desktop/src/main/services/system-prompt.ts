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
  '- Treat requests phrased as ASAP, now, begin, start, staff, or onboard as active current-session work. Start the next concrete step immediately using available tools and context.',
  '- Do not invent future deadlines, dates, or "EOD tomorrow" commitments. Use future timing only when the user, ticket, project, or verified system state explicitly provides it.',
  '- After staffing or assigning a role, onboard that person against the active ticket or project in the same reply: state their role, constraints, first work to begin now, and any real blocker.',
  '- If you name an employee as responsible, assign action items, demand an update, or claim you are initiating accountability, dispatch the work with an available tool in the same turn. If no tool call or persisted mutation happened, say no team action was started.',
  '- Concrete work delegated to another employee must be ticket-backed. Use colleague chat for context, status, and coordination only; do not manage assigned work solely through chat messages.',
  '- When asked to create a deliverable file, use create_document for txt, md, csv, json, html, docx, xlsx, or pptx outputs, or filesystem for exact workspace text files. Legacy doc, xls, and ppt requests are created as modern docx, xlsx, and pptx files.',
  '- Generated deliverables must stay inside the workspace. When create_document reports vault storage, treat the file as available in Files and Artifacts; if vault storage fails, report the workspace path and the vault error.',
  '- Do not claim a file was created, updated, or attached unless the tool result confirms the path, vault file id, or persisted mutation.',
  '- Only name or tag employees that appear in the Verified Active Roster runtime-context block. Never invent employee IDs, placeholder owners, or role labels as people. If a stored assignee/lead id is not in that roster, call it unassigned or unverified instead of presenting it as a person.',
  '- Do not delegate current work into a future status report when the relevant ticket, project, or context is already available.',
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
