/**
 * Helpers that normalize operational rows into stable, retrievable text
 * payloads for the embeddings index.
 */

function parseStringArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function formatTimestamp(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
}

function compactLines(lines: Array<string | null | undefined>): string {
  return lines
    .map((line) => line?.trim() ?? '')
    .filter((line) => line.length > 0)
    .join('\n');
}

export interface RagTicketSource {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  labelsJson: string;
  dueAt: number | null;
  slaHours: number | null;
}

export interface RagGoalSource {
  id: string;
  title: string;
  description: string;
  status: string;
  targetDate: number | null;
}

export interface RagProjectSource {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  goalId: string | null;
  leadId: string | null;
}

export interface RagVaultFileSource {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  extractedText: string | null;
  tagsJson: string;
}

export function formatTicketEmbeddingContent(ticket: RagTicketSource): string {
  const labels = parseStringArray(ticket.labelsJson);
  const dueAt = formatTimestamp(ticket.dueAt);
  return compactLines([
    'Ticket',
    `Ticket ID: ${ticket.id}`,
    `Title: ${ticket.title}`,
    `Status: ${ticket.status}`,
    `Priority: ${ticket.priority}`,
    ticket.assigneeId ? `Assignee ID: ${ticket.assigneeId}` : 'Assignee ID: unassigned',
    labels.length > 0 ? `Labels: ${labels.join(', ')}` : null,
    typeof ticket.slaHours === 'number' ? `SLA hours: ${ticket.slaHours}` : null,
    dueAt ? `Due at: ${dueAt}` : null,
    ticket.description ? `Description:\n${ticket.description}` : null,
  ]);
}

export function formatGoalEmbeddingContent(goal: RagGoalSource): string {
  const targetDate = formatTimestamp(goal.targetDate);
  return compactLines([
    'Goal',
    `Goal ID: ${goal.id}`,
    `Title: ${goal.title}`,
    `Status: ${goal.status}`,
    targetDate ? `Target date: ${targetDate}` : null,
    goal.description ? `Description:\n${goal.description}` : null,
  ]);
}

export function formatProjectEmbeddingContent(project: RagProjectSource): string {
  return compactLines([
    'Project',
    `Project ID: ${project.id}`,
    `Title: ${project.title}`,
    `Status: ${project.status}`,
    `Priority: ${project.priority}`,
    project.goalId ? `Goal ID: ${project.goalId}` : null,
    project.leadId ? `Lead ID: ${project.leadId}` : null,
    project.description ? `Description:\n${project.description}` : null,
  ]);
}

export function formatVaultFileEmbeddingContent(file: RagVaultFileSource): string {
  const tags = parseStringArray(file.tagsJson);
  return compactLines([
    'Vault file',
    `File ID: ${file.id}`,
    `Name: ${file.originalName}`,
    `MIME type: ${file.mimeType}`,
    `Size bytes: ${file.sizeBytes}`,
    tags.length > 0 ? `Tags: ${tags.join(', ')}` : null,
    file.extractedText ? `Extracted text:\n${file.extractedText}` : null,
  ]);
}
