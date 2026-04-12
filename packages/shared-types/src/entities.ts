/**
 * Who authored a chat message. Narrow by design — messages are authored
 * by one of these three concrete agents. Event emission uses the wider
 * `ActorKind` (below) because the orchestrator and provider adapters
 * emit dashboard events but never author messages.
 */
export type AuthorKind = 'employee' | 'user' | 'system';

/**
 * Who emitted a dashboard event. Superset of `AuthorKind` — adds
 * `orchestrator` (scheduler lifecycle events) and `provider` (LLM
 * provider streaming events). Kept separate from `AuthorKind` so
 * `ChatMessage.authorKind` cannot accidentally be typed as
 * `'orchestrator'` or `'provider'`.
 */
export type ActorKind = AuthorKind | 'orchestrator' | 'provider';

export type EmployeeStatus = 'idle' | 'thinking' | 'blocked' | 'error';

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export type TicketStatus = 'open' | 'in-progress' | 'blocked' | 'done';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Ticket {
  id: string;
  companyId: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  /** Employee FK — null when unassigned. */
  assigneeId: string | null;
  /** Human or employee who filed the ticket. */
  reporterId: string;
  reporterKind: AuthorKind;
  /** JSON-encoded string[] of label tags. */
  labelsJson: string;
  /** JSON-encoded string[] of ticket-id dependencies. */
  dependenciesJson: string;
  /** Target hours to resolution. Null = no SLA. */
  slaHours: number | null;
  dueAt: number | null;
  /** Associated discussion thread (kind: 'ticket'). Created on first assignment. */
  threadId: string | null;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  createdAt: number;
  settings: CompanySettings;
}

export interface CompanySettings {
  mission?: string;
  values?: string[];
  theme?: 'dark' | 'light';
}

export interface Employee {
  id: string;
  companyId: string;
  roleId: string;
  roleMdSha: string;
  level: string;
  name: string;
  title: string;
  status: EmployeeStatus;
  modelPref?: string;
  providerPref?: string;
  avatar?: string;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  authorId: string;
  authorKind: AuthorKind;
  content: string;
  createdAt: number;
  /** True when the message was sent by an agent to another agent. */
  isAgentInitiated?: boolean;
}

export type ThreadKind = 'dm' | 'group' | 'meeting' | 'ticket' | 'broadcast';

export interface ThreadMember {
  memberId: string;
  memberKind: 'user' | 'employee';
  roleInThread?: string | null;
}

export interface Thread {
  id: string;
  companyId: string;
  kind: ThreadKind;
  subject: string | null;
  createdBy: string;
  createdAt: number;
  members: ThreadMember[];
  lastMessageAt: number | null;
}
