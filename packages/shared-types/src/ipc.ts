/**
 * IPC contracts between the Team-X Electron main process and the
 * renderer. Two layers:
 *
 *   1. `IpcContract` — the low-level request/response shapes keyed
 *      by channel name. Used by the typed `ipcMain.handle` registration
 *      in `apps/desktop/src/main/ipc/register.ts` and by the generic
 *      helper types that derive per-channel argument and return types.
 *
 *   2. `TeamXApi` — the high-level bridge surface the preload exposes
 *      to the renderer via `contextBridge.exposeInMainWorld('teamx', ...)`.
 *      This is the shape the renderer consumes as `window.teamx`. It
 *      mirrors `IpcContract` but:
 *        - wraps each channel in an ergonomic method signature
 *          (positional args where it makes sense, single-object args
 *          where it doesn't),
 *        - adds a one-way event subscription (`events.onDashboard`)
 *          for the live dashboard stream,
 *        - returns an unsubscribe function from `onDashboard` so the
 *          renderer can clean up listeners on unmount.
 *
 * Keeping both layers here — in `@team-x/shared-types` — means:
 *   - preload can type-check its implementation against `TeamXApi`
 *     without cross-app imports,
 *   - the renderer's `window.d.ts` can import the same `TeamXApi`
 *     via the workspace package without reaching across rootDir
 *     boundaries into `apps/desktop/src/preload/`,
 *   - any change to a request or response shape lands in exactly one
 *     place and both sides of the bridge catch the diff at typecheck
 *     time.
 */

import type {
  ChatMessage,
  Company,
  Employee,
  Goal,
  Meeting,
  MeetingActionItem,
  MeetingMode,
  Project,
  Thread,
  Ticket,
} from './entities.js';
import type { DashboardEvent } from './events.js';
import type { PrivacyTier, ProviderConfig, ProviderKind } from './providers.js';

// ---------------------------------------------------------------------------
// Low-level request / response shapes
// ---------------------------------------------------------------------------

export interface ListEmployeesRequest {
  companyId: string;
}

export interface SendChatRequest {
  /**
   * Either a real thread id, or the literal sentinel
   * `AUTO_THREAD_ID` (`'auto'`) to look up or create the user↔employee
   * direct-message thread on the fly. The renderer's chat drawer uses
   * `'auto'` on the very first message and switches to the resolved id
   * after that.
   */
  threadId: string;
  employeeId: string;
  content: string;
}

/**
 * Response to a successful `chat.send`. Carries both the resolved
 * thread id (useful when the caller passed `AUTO_THREAD_ID` and needs
 * to know which thread their message landed in) and the row id of the
 * user's just-appended message. The assistant's reply is NOT in this
 * shape — it streams back asynchronously via the `events.dashboard`
 * channel as `work.started` → `token.delta`* → `work.completed` events.
 */
export interface SendChatResponse {
  threadId: string;
  messageId: string;
}

export interface HireEmployeeRequest {
  companyId: string;
  roleId: string;
  name: string;
}

export interface HireEmployeeResponse {
  employeeId: string;
}

export interface ListChatRequest {
  threadId: string;
}

/**
 * Request to resolve (or lazily create) the user↔employee DM thread
 * for a given employee.  The renderer's chat drawer calls this on
 * open so it can render the existing conversation history BEFORE the
 * user has sent a new message — the previous design only resolved the
 * thread id inside `chat.send`, which left a post-reload drawer with
 * no way to know which thread to fetch.
 */
export interface ResolveThreadRequest {
  employeeId: string;
}

/**
 * Response from `chat.resolveThread`.  Always returns a valid
 * `threadId`: the existing DM thread if one already exists for the
 * (user, employee) pair, otherwise a freshly created empty one.
 */
export interface ResolveThreadResponse {
  threadId: string;
}

export interface ListThreadsRequest {
  companyId: string;
}

// ---------------------------------------------------------------------------
// Events / timeline shapes (Phase 3 — M14)
// ---------------------------------------------------------------------------

/**
 * Cursor-based pagination request for the timeline activity feed.
 * `cursor` is the `createdAt` timestamp of the last event in the
 * previous page — pass `undefined` for the first page. Results are
 * returned newest-first.
 */
export interface ListEventsRequest {
  companyId: string;
  /** createdAt of the last event from the previous page, or undefined for the first page. */
  cursor?: number;
  /** Maximum events to return. Defaults to 50 in the handler. */
  limit?: number;
}

/**
 * Paginated event list for the timeline view.
 * `nextCursor` is `null` when there are no more pages.
 */
export interface ListEventsResponse {
  events: DashboardEvent[];
  nextCursor: number | null;
}

// ---------------------------------------------------------------------------
// Ticket-related shapes
// ---------------------------------------------------------------------------

export interface CreateTicketRequest {
  companyId: string;
  title: string;
  description?: string;
  /** Defaults to 'medium'. Accepts TicketPriority values. */
  priority?: string;
  /** Optional: assign immediately on creation. */
  assigneeId?: string;
  labelsJson?: string;
  slaHours?: number;
  dueAt?: number;
}

export interface CreateTicketResponse {
  ticketId: string;
}

export interface UpdateTicketRequest {
  ticketId: string;
  title?: string;
  description?: string;
  /** Use TicketPriority union or raw string — the handler validates. */
  priority?: string;
  /** Use TicketStatus union or raw string — the handler validates. */
  status?: string;
  labelsJson?: string;
  slaHours?: number | null;
  dueAt?: number | null;
}

export interface AssignTicketRequest {
  ticketId: string;
  assigneeId: string;
}

export interface CloseTicketRequest {
  ticketId: string;
}

export interface ReopenTicketRequest {
  ticketId: string;
}

export interface AddTicketCommentRequest {
  ticketId: string;
  content: string;
}

export interface AddTicketCommentResponse {
  messageId: string;
}

export interface ListTicketsRequest {
  companyId: string;
}

export interface GetTicketRequest {
  ticketId: string;
}

/** Full ticket with its associated thread messages for the detail panel. */
export interface TicketDetail extends Ticket {
  messages: ChatMessage[];
  assignee: Employee | null;
}

// ---------------------------------------------------------------------------
// Goals & Projects shapes (Phase 3 — M15)
// ---------------------------------------------------------------------------

export interface CreateGoalRequest {
  companyId: string;
  title: string;
  description?: string;
  targetDate?: number | null;
}

export interface CreateGoalResponse {
  goalId: string;
}

export interface UpdateGoalRequest {
  goalId: string;
  title?: string;
  description?: string;
  status?: string;
  progressPct?: number;
  targetDate?: number | null;
}

export interface ListGoalsRequest {
  companyId: string;
}

export interface GetGoalRequest {
  goalId: string;
}

export interface DeleteGoalRequest {
  goalId: string;
}

/** Full goal with its linked projects for the detail view. */
export interface GoalDetail extends Goal {
  projects: Project[];
}

export interface CreateProjectRequest {
  companyId: string;
  goalId?: string | null;
  title: string;
  description?: string;
  leadId?: string | null;
  priority?: string;
}

export interface CreateProjectResponse {
  projectId: string;
}

export interface UpdateProjectRequest {
  projectId: string;
  title?: string;
  description?: string;
  status?: string;
  goalId?: string | null;
  leadId?: string | null;
  priority?: string;
}

export interface ListProjectsRequest {
  companyId: string;
}

export interface GetProjectRequest {
  projectId: string;
}

export interface DeleteProjectRequest {
  projectId: string;
}

export interface LinkTicketToProjectRequest {
  projectId: string;
  ticketId: string;
}

export interface UnlinkTicketFromProjectRequest {
  projectId: string;
  ticketId: string;
}

/** Full project with linked ticket ids and lead employee for the detail view. */
export interface ProjectDetail extends Project {
  ticketIds: string[];
  lead: Employee | null;
  ticketCounts: { total: number; done: number };
}

// ---------------------------------------------------------------------------
// Meeting shapes (Phase 3 — M16)
// ---------------------------------------------------------------------------

export interface CallMeetingRequest {
  companyId: string;
  /** Employee id of the meeting chair. */
  chairId: string;
  /** Employee ids of all attendees (including the chair). */
  attendeeIds: string[];
  agenda: string;
  /** Defaults to 'round-robin'. */
  mode?: MeetingMode;
}

export interface CallMeetingResponse {
  meetingId: string;
  threadId: string;
}

export interface EndMeetingRequest {
  meetingId: string;
}

export interface EndMeetingResponse {
  minutesMd: string | null;
  actionItems: MeetingActionItem[];
  ticketIds: string[];
}

export interface InterjectMeetingRequest {
  meetingId: string;
  content: string;
}

export interface InterjectMeetingResponse {
  messageId: string;
}

export interface ListMeetingsRequest {
  companyId: string;
}

export interface GetMeetingRequest {
  meetingId: string;
}

/** Full meeting detail with its thread messages for the detail panel. */
export interface MeetingDetail extends Meeting {
  messages: ChatMessage[];
  chair: Employee | null;
}

// ---------------------------------------------------------------------------
// Telemetry shapes (Phase 3 — M17)
// ---------------------------------------------------------------------------

export interface TelemetryCompanyStatsRequest {
  companyId: string;
}

/** Aggregate company-level telemetry summary. */
export interface TelemetryCompanyStatsResponse {
  totalRuns: number;
  totalTokens: number;
  totalCostUsd: string;
  avgLatencyMs: number;
  totalToolCalls: number;
}

export interface TelemetryDailyUsageRequest {
  companyId: string;
  /** Epoch millis — start of the date range (inclusive). */
  fromMs: number;
  /** Epoch millis — end of the date range (inclusive). */
  toMs: number;
}

export interface TelemetryDailyUsageRow {
  day: string;
  totalRuns: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: string;
}

export interface TelemetryEmployeeStatsRequest {
  companyId: string;
}

export interface TelemetryEmployeeStatsRow {
  employeeId: string;
  totalRuns: number;
  totalTokens: number;
  avgLatencyMs: number;
  costUsd: string;
  totalToolCalls: number;
}

export interface TelemetryCostBreakdownRequest {
  companyId: string;
  /** Optional epoch millis — start of range. */
  fromMs?: number;
  /** Optional epoch millis — end of range. */
  toMs?: number;
}

export interface TelemetryCostBreakdownRow {
  provider: string;
  model: string;
  totalRuns: number;
  totalTokens: number;
  costUsd: string;
}

// ---------------------------------------------------------------------------
// MCP-related shapes
// ---------------------------------------------------------------------------

export interface McpServerSummary {
  id: string;
  companyId: string | null;
  name: string;
  transport: 'stdio' | 'sse';
  enabled: boolean;
  lastHealth: string | null;
  toolCount: number;
}

export interface ListMcpServersRequest {
  companyId: string;
}

export interface ToggleMcpServerRequest {
  serverId: string;
  enabled: boolean;
}

export interface AddMcpServerRequest {
  companyId: string | null;
  name: string;
  transport: 'stdio' | 'sse';
  configJson: string;
}

export interface TestMcpConnectionRequest {
  transport: 'stdio' | 'sse';
  configJson: string;
}

export interface TestMcpConnectionResponse {
  ok: boolean;
  error?: string;
  toolCount?: number;
}

// ---------------------------------------------------------------------------
// Provider management request/response shapes (Phase 3 — M18)
// ---------------------------------------------------------------------------

export interface AddProviderRequest {
  name: string;
  kind: ProviderKind;
  privacyTier: PrivacyTier;
  configJson?: string;
  /** If supplied, saved to OS keychain — never stored in DB. */
  apiKey?: string;
}

export interface AddProviderResponse {
  providerId: string;
}

export interface UpdateProviderRequest {
  providerId: string;
  name?: string;
  enabled?: boolean;
  configJson?: string;
  /** If supplied, saved to OS keychain — never stored in DB. */
  apiKey?: string;
}

export interface RemoveProviderRequest {
  providerId: string;
}

export interface TestProviderConnectionRequest {
  providerId: string;
}

export interface TestProviderConnectionResponse {
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Vault management shapes (Phase 4 — M21)
// ---------------------------------------------------------------------------

export interface VaultFile {
  id: string;
  companyId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  tags: string[];
  uploadedBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface VaultSearchResult {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  rank: number;
}

export interface VaultUploadRequest {
  companyId: string;
  /** Absolute path to the file on disk (selected via Electron file dialog). */
  sourcePath: string;
  tags?: string[];
}

export interface VaultUploadResponse {
  fileId: string;
}

export interface VaultDownloadResponse {
  file: VaultFile;
  absolutePath: string;
}

export interface VaultVerifyResponse {
  ok: boolean;
  expected: string;
  actual: string;
}

export interface VaultStatsResponse {
  fileCount: number;
  totalBytes: number;
}

// ---------------------------------------------------------------------------
// Backup/restore shapes (Phase 4 — M23)
// ---------------------------------------------------------------------------

export interface BackupManifest {
  version: string;
  createdAt: string;
  appVersion: string;
  companyCount: number;
  fileCount: number;
  totalSizeBytes: number;
  dbSizeBytes: number;
}

export interface BackupEntry {
  filename: string;
  path: string;
  createdAt: string;
  sizeBytes: number;
  manifest: BackupManifest | null;
}

export interface BackupCreateRequest {
  /** Optional custom destination path. Uses default backups dir if omitted. */
  destination?: string;
}

export interface BackupCreateResponse {
  backupPath: string;
  manifest: BackupManifest;
}

export interface BackupRestoreRequest {
  backupPath: string;
}

export interface BackupRestoreResponse {
  manifest: BackupManifest;
}

// ---------------------------------------------------------------------------
// Ticket attachment shapes (Phase 4 — M22)
// ---------------------------------------------------------------------------

export interface TicketAttachment {
  id: string;
  ticketId: string;
  fileId: string;
  attachedBy: string;
  attachedAt: number;
  /** Populated from vault join — original filename for display. */
  fileName?: string;
  /** Populated from vault join — mime type for icon rendering. */
  fileMimeType?: string;
  /** Populated from vault join — byte size for display. */
  fileSizeBytes?: number;
}

export interface AttachFileRequest {
  ticketId: string;
  fileId: string;
}

export interface AttachFileResponse {
  attachmentId: string;
}

export interface DetachFileRequest {
  ticketId: string;
  fileId: string;
}

export interface ListAttachmentsRequest {
  ticketId: string;
}

// ---------------------------------------------------------------------------
// Audit log shapes (Phase 4 — M24)
// ---------------------------------------------------------------------------

/** A single event row surfaced in the audit log UI. */
export interface AuditEvent {
  id: string;
  companyId: string;
  actorId: string;
  actorKind: string;
  eventType: string;
  payloadJson: string;
  createdAt: number;
}

export interface AuditFilter {
  companyId: string;
  eventTypes?: string[];
  actorId?: string;
  fromMs?: number;
  toMs?: number;
  limit?: number;
  offset?: number;
}

export interface AuditStats {
  totalEvents: number;
  eventsToday: number;
  topEventTypes: Array<{ eventType: string; count: number }>;
}

export interface AuditExportRequest {
  filter: AuditFilter;
  format: 'csv' | 'json';
}

export interface AuditExportResponse {
  /** Absolute path to the exported file on disk. */
  filePath: string;
}

// ---------------------------------------------------------------------------
// Settings management shapes (Phase 3 — M19)
// ---------------------------------------------------------------------------

export interface SettingsGetRuntimeResponse {
  strategy: import('./providers.js').RuntimeStrategy;
  hardwareProfile: import('./providers.js').HardwareProfile;
  effectiveSlots: number;
  reason: string;
}

export interface SettingsSetRuntimeRequest {
  strategy: import('./providers.js').RuntimeStrategy;
}

export interface SettingsGetPrivacyResponse {
  maxTier: PrivacyTier;
  availableProviders: Array<{
    id: string;
    name: string;
    kind: ProviderKind;
    privacyTier: PrivacyTier;
    allowed: boolean;
  }>;
}

export interface SettingsSetPrivacyRequest {
  maxTier: PrivacyTier;
}

export interface SettingsGetConcurrencyResponse {
  orchestratorSlots: number;
  providerCaps: Record<string, number>;
}

export interface SettingsSetConcurrencyRequest {
  orchestratorSlots?: number;
  providerCaps?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Low-level channel map (used by ipcMain.handle and its generic helpers)
// ---------------------------------------------------------------------------

export interface IpcContract {
  'companies.list': {
    request: Record<string, never>;
    response: Company[];
  };
  'employees.list': {
    request: ListEmployeesRequest;
    response: Employee[];
  };
  'employees.create': {
    request: HireEmployeeRequest;
    response: HireEmployeeResponse;
  };
  'chat.send': {
    request: SendChatRequest;
    response: SendChatResponse;
  };
  'chat.list': {
    request: ListChatRequest;
    response: ChatMessage[];
  };
  'chat.resolveThread': {
    request: ResolveThreadRequest;
    response: ResolveThreadResponse;
  };
  'chat.listThreads': {
    request: ListThreadsRequest;
    response: Thread[];
  };
  // Events / timeline (Phase 3 — M14)
  'events.list': {
    request: ListEventsRequest;
    response: ListEventsResponse;
  };
  // MCP management channels
  'mcp.list': {
    request: ListMcpServersRequest;
    response: McpServerSummary[];
  };
  'mcp.toggle': {
    request: ToggleMcpServerRequest;
    response: undefined;
  };
  'mcp.addServer': {
    request: AddMcpServerRequest;
    response: { serverId: string };
  };
  'mcp.removeServer': {
    request: { serverId: string };
    response: undefined;
  };
  'mcp.testConnection': {
    request: TestMcpConnectionRequest;
    response: TestMcpConnectionResponse;
  };
  // Goals management channels (Phase 3 — M15)
  'goals.create': {
    request: CreateGoalRequest;
    response: CreateGoalResponse;
  };
  'goals.update': {
    request: UpdateGoalRequest;
    response: undefined;
  };
  'goals.list': {
    request: ListGoalsRequest;
    response: Goal[];
  };
  'goals.get': {
    request: GetGoalRequest;
    response: GoalDetail;
  };
  'goals.delete': {
    request: DeleteGoalRequest;
    response: undefined;
  };
  // Projects management channels (Phase 3 — M15)
  'projects.create': {
    request: CreateProjectRequest;
    response: CreateProjectResponse;
  };
  'projects.update': {
    request: UpdateProjectRequest;
    response: undefined;
  };
  'projects.list': {
    request: ListProjectsRequest;
    response: Project[];
  };
  'projects.get': {
    request: GetProjectRequest;
    response: ProjectDetail;
  };
  'projects.delete': {
    request: DeleteProjectRequest;
    response: undefined;
  };
  'projects.linkTicket': {
    request: LinkTicketToProjectRequest;
    response: undefined;
  };
  'projects.unlinkTicket': {
    request: UnlinkTicketFromProjectRequest;
    response: undefined;
  };
  // Meeting management channels (Phase 3 — M16)
  'meetings.call': {
    request: CallMeetingRequest;
    response: CallMeetingResponse;
  };
  'meetings.end': {
    request: EndMeetingRequest;
    response: EndMeetingResponse;
  };
  'meetings.interject': {
    request: InterjectMeetingRequest;
    response: InterjectMeetingResponse;
  };
  'meetings.list': {
    request: ListMeetingsRequest;
    response: Meeting[];
  };
  'meetings.get': {
    request: GetMeetingRequest;
    response: MeetingDetail;
  };
  // Telemetry channels (Phase 3 — M17)
  'telemetry.companyStats': {
    request: TelemetryCompanyStatsRequest;
    response: TelemetryCompanyStatsResponse;
  };
  'telemetry.dailyUsage': {
    request: TelemetryDailyUsageRequest;
    response: TelemetryDailyUsageRow[];
  };
  'telemetry.employeeStats': {
    request: TelemetryEmployeeStatsRequest;
    response: TelemetryEmployeeStatsRow[];
  };
  'telemetry.costBreakdown': {
    request: TelemetryCostBreakdownRequest;
    response: TelemetryCostBreakdownRow[];
  };
  // Settings channels (Phase 3 — M19)
  'settings.getRuntime': {
    request: Record<string, never>;
    response: SettingsGetRuntimeResponse;
  };
  'settings.setRuntime': {
    request: SettingsSetRuntimeRequest;
    response: undefined;
  };
  'settings.getPrivacy': {
    request: Record<string, never>;
    response: SettingsGetPrivacyResponse;
  };
  'settings.setPrivacy': {
    request: SettingsSetPrivacyRequest;
    response: undefined;
  };
  'settings.getConcurrency': {
    request: Record<string, never>;
    response: SettingsGetConcurrencyResponse;
  };
  'settings.setConcurrency': {
    request: SettingsSetConcurrencyRequest;
    response: undefined;
  };
  // Provider management channels (Phase 3 — M18)
  'providers.list': {
    request: Record<string, never>;
    response: ProviderConfig[];
  };
  'providers.add': {
    request: AddProviderRequest;
    response: AddProviderResponse;
  };
  'providers.update': {
    request: UpdateProviderRequest;
    response: undefined;
  };
  'providers.remove': {
    request: RemoveProviderRequest;
    response: undefined;
  };
  'providers.testConnection': {
    request: TestProviderConnectionRequest;
    response: TestProviderConnectionResponse;
  };
  // Vault management channels (Phase 4 — M21)
  'vault.upload': {
    request: VaultUploadRequest;
    response: VaultUploadResponse;
  };
  'vault.download': {
    request: { fileId: string };
    response: VaultDownloadResponse;
  };
  'vault.list': {
    request: { companyId: string };
    response: VaultFile[];
  };
  'vault.search': {
    request: { companyId: string; query: string };
    response: VaultSearchResult[];
  };
  'vault.delete': {
    request: { fileId: string };
    response: undefined;
  };
  'vault.verify': {
    request: { fileId: string };
    response: VaultVerifyResponse;
  };
  'vault.stats': {
    request: { companyId: string };
    response: VaultStatsResponse;
  };
  // Backup/restore channels (Phase 4 — M23)
  'backup.create': {
    request: BackupCreateRequest;
    response: BackupCreateResponse;
  };
  'backup.restore': {
    request: BackupRestoreRequest;
    response: BackupRestoreResponse;
  };
  'backup.list': {
    request: Record<string, never>;
    response: BackupEntry[];
  };
  // Audit log channels (Phase 4 — M24)
  'audit.list': {
    request: AuditFilter;
    response: AuditEvent[];
  };
  'audit.stats': {
    request: { companyId: string };
    response: AuditStats;
  };
  'audit.export': {
    request: AuditExportRequest;
    response: AuditExportResponse;
  };
  // Ticket attachment channels (Phase 4 — M22)
  'tickets.attachFile': {
    request: AttachFileRequest;
    response: AttachFileResponse;
  };
  'tickets.detachFile': {
    request: DetachFileRequest;
    response: undefined;
  };
  'tickets.listAttachments': {
    request: ListAttachmentsRequest;
    response: TicketAttachment[];
  };
  // Ticket management channels
  'tickets.create': {
    request: CreateTicketRequest;
    response: CreateTicketResponse;
  };
  'tickets.update': {
    request: UpdateTicketRequest;
    response: undefined;
  };
  'tickets.assign': {
    request: AssignTicketRequest;
    response: undefined;
  };
  'tickets.close': {
    request: CloseTicketRequest;
    response: undefined;
  };
  'tickets.reopen': {
    request: ReopenTicketRequest;
    response: undefined;
  };
  'tickets.addComment': {
    request: AddTicketCommentRequest;
    response: AddTicketCommentResponse;
  };
  'tickets.list': {
    request: ListTicketsRequest;
    response: Ticket[];
  };
  'tickets.get': {
    request: GetTicketRequest;
    response: TicketDetail;
  };
}

export type IpcChannel = keyof IpcContract;
export type EventChannel = 'events.dashboard';

// ---------------------------------------------------------------------------
// High-level bridge surface — what the renderer sees as `window.teamx`
// ---------------------------------------------------------------------------

/**
 * Type of the callback a renderer passes to `events.onDashboard`. The
 * renderer typically narrows on `event.type` (e.g. `token.delta`) and
 * casts `event.payload` to the matching payload type (see
 * `TokenDeltaPayload`, `WorkStartedPayload`, `WorkCompletedPayload`).
 */
export type DashboardEventListener = (event: DashboardEvent) => void;

/**
 * Returned from `events.onDashboard` — call it to stop receiving
 * events. The renderer hooks this up to its `useEffect` cleanup
 * returns so subscriptions don't outlive the component that made them.
 */
export type UnsubscribeFn = () => void;

/**
 * The full `window.teamx` surface exposed by the preload bridge.
 *
 * Signature philosophy: prefer positional args where there is exactly
 * ONE obvious parameter (`employees.list(companyId)`,
 * `chat.list(threadId)`) and an object literal where more than one
 * field is in play (`chat.send(req)`). This mirrors how the renderer's
 * React hooks consume each method and keeps call sites self-documenting
 * without forcing the caller to remember positional order.
 */
export interface TeamXApi {
  companies: {
    /** Return every company. Phase 1 always returns exactly one. */
    list(): Promise<Company[]>;
  };
  employees: {
    /** Return every employee in the given company, mapped to the public Employee shape. */
    list(companyId: string): Promise<Employee[]>;

    /**
     * Create a new employee for the given company from a role-pack role.
     * The main process resolves the role spec from the role-loader,
     * fills in level/title/sha/tools, and inserts the row.
     */
    create(req: HireEmployeeRequest): Promise<HireEmployeeResponse>;
  };
  chat: {
    /**
     * Append the user's message to a thread and enqueue an assistant
     * turn. Returns as soon as the user message is persisted — the
     * reply streams in via `events.onDashboard` token-delta events.
     *
     * Pass `threadId: 'auto'` to resolve the user↔employee DM thread
     * (creating it on first send). The response echoes the actually-
     * resolved thread id so the renderer can cache it for subsequent
     * sends in the same drawer session.
     */
    send(req: SendChatRequest): Promise<SendChatResponse>;

    /** Return every message in a thread, oldest-first, mapped to ChatMessage shape. */
    list(threadId: string): Promise<ChatMessage[]>;

    /**
     * Resolve (or lazily create) the user↔employee DM thread for the
     * given employee.  The drawer calls this on open so it can fetch
     * the existing chat history before the user sends anything — a
     * post-reload drawer has no cached thread id, and without this
     * call the only way to rehydrate was to send a new message.
     */
    resolveThread(req: ResolveThreadRequest): Promise<ResolveThreadResponse>;

    /** Return all threads for the given company with members and last-message timestamp. */
    listThreads(companyId: string): Promise<Thread[]>;
  };
  events: {
    /**
     * Subscribe to the live dashboard event stream. The callback runs
     * for every event emitted by the orchestrator's event bus in the
     * main process — token deltas, work lifecycle, employee status
     * changes. Returns an unsubscribe function that MUST be called
     * when the subscriber is no longer interested (e.g. React
     * `useEffect` cleanup) so dead listeners don't accumulate.
     */
    onDashboard(listener: DashboardEventListener): UnsubscribeFn;

    /**
     * Fetch a paginated page of persisted events for the timeline view.
     * Returns newest-first. Pass the `nextCursor` from the previous
     * response to fetch the next page; `null` means no more pages.
     */
    list(req: ListEventsRequest): Promise<ListEventsResponse>;
  };
  mcp: {
    /** List all MCP servers available to a company (global + company-specific). */
    list(companyId: string): Promise<McpServerSummary[]>;
    /** Enable or disable an MCP server. Connects/disconnects as needed. */
    toggle(serverId: string, enabled: boolean): Promise<void>;
    /** Register a new MCP server and attempt immediate connection. */
    addServer(req: AddMcpServerRequest): Promise<{ serverId: string }>;
    /** Disconnect and remove an MCP server. */
    removeServer(serverId: string): Promise<void>;
    /** Test an MCP connection without persisting. */
    testConnection(req: TestMcpConnectionRequest): Promise<TestMcpConnectionResponse>;
  };
  goals: {
    /** Create a new goal. */
    create(req: CreateGoalRequest): Promise<CreateGoalResponse>;
    /** Update goal fields (title, description, status, progressPct, targetDate). */
    update(req: UpdateGoalRequest): Promise<void>;
    /** List all goals for a company. */
    list(companyId: string): Promise<Goal[]>;
    /** Get full goal detail with linked projects. */
    get(goalId: string): Promise<GoalDetail>;
    /** Delete a goal. */
    delete(goalId: string): Promise<void>;
  };
  projects: {
    /** Create a new project. */
    create(req: CreateProjectRequest): Promise<CreateProjectResponse>;
    /** Update project fields. */
    update(req: UpdateProjectRequest): Promise<void>;
    /** List all projects for a company. */
    list(companyId: string): Promise<Project[]>;
    /** Get full project detail with linked ticket ids and lead. */
    get(projectId: string): Promise<ProjectDetail>;
    /** Delete a project and its ticket links. */
    delete(projectId: string): Promise<void>;
    /** Link a ticket to a project. */
    linkTicket(projectId: string, ticketId: string): Promise<void>;
    /** Unlink a ticket from a project. */
    unlinkTicket(projectId: string, ticketId: string): Promise<void>;
  };
  meetings: {
    /** Start a meeting — pauses orchestrator, creates meeting thread, chair speaks first. */
    call(req: CallMeetingRequest): Promise<CallMeetingResponse>;
    /** End a meeting — generate minutes, extract action items, resume orchestrator. */
    end(meetingId: string): Promise<EndMeetingResponse>;
    /** Rocky interjects mid-meeting. */
    interject(req: InterjectMeetingRequest): Promise<InterjectMeetingResponse>;
    /** List all meetings for a company. */
    list(companyId: string): Promise<Meeting[]>;
    /** Get full meeting detail with thread messages and chair. */
    get(meetingId: string): Promise<MeetingDetail>;
  };
  telemetry: {
    /** Company-level aggregate stats (total runs, tokens, cost, latency). */
    companyStats(companyId: string): Promise<TelemetryCompanyStatsResponse>;
    /** Daily time-series of token usage and cost within a date range. */
    dailyUsage(req: TelemetryDailyUsageRequest): Promise<TelemetryDailyUsageRow[]>;
    /** Per-employee breakdown of runs, tokens, latency, and cost. */
    employeeStats(companyId: string): Promise<TelemetryEmployeeStatsRow[]>;
    /** Cost breakdown by provider and model, with optional date range filter. */
    costBreakdown(req: TelemetryCostBreakdownRequest): Promise<TelemetryCostBreakdownRow[]>;
  };
  settings: {
    /** Get runtime strategy, hardware profile, and effective orchestrator slots. */
    getRuntime(): Promise<SettingsGetRuntimeResponse>;
    /** Set runtime strategy (auto/hybrid/always-on/lean). */
    setRuntime(req: SettingsSetRuntimeRequest): Promise<void>;
    /** Get privacy tier setting and per-provider allowed/blocked status. */
    getPrivacy(): Promise<SettingsGetPrivacyResponse>;
    /** Set maximum privacy tier. */
    setPrivacy(req: SettingsSetPrivacyRequest): Promise<void>;
    /** Get concurrency settings (orchestrator slots + per-provider caps). */
    getConcurrency(): Promise<SettingsGetConcurrencyResponse>;
    /** Set concurrency settings. */
    setConcurrency(req: SettingsSetConcurrencyRequest): Promise<void>;
  };
  providers: {
    /** List all configured providers with status. */
    list(): Promise<ProviderConfig[]>;
    /** Register a new provider. API key saved to OS keychain if supplied. */
    add(req: AddProviderRequest): Promise<AddProviderResponse>;
    /** Update provider config. API key saved to OS keychain if supplied. */
    update(req: UpdateProviderRequest): Promise<void>;
    /** Remove a provider and its keychain entry. */
    remove(providerId: string): Promise<void>;
    /** Test a provider's API key + connectivity. */
    testConnection(providerId: string): Promise<TestProviderConnectionResponse>;
  };
  vault: {
    /** Upload a file to the vault. sourcePath is an absolute path on disk. */
    upload(req: VaultUploadRequest): Promise<VaultUploadResponse>;
    /** Get file metadata and absolute path for download/preview. */
    download(fileId: string): Promise<VaultDownloadResponse>;
    /** List all files in a company vault, newest first. */
    list(companyId: string): Promise<VaultFile[]>;
    /** Full-text search across vault files. */
    search(companyId: string, query: string): Promise<VaultSearchResult[]>;
    /** Delete a file from vault (disk + database). */
    delete(fileId: string): Promise<void>;
    /** Verify SHA256 integrity of a vault file. */
    verify(fileId: string): Promise<VaultVerifyResponse>;
    /** Get vault statistics for a company. */
    stats(companyId: string): Promise<VaultStatsResponse>;
  };
  backup: {
    /** Create a full backup (SQLite + vault files). */
    create(req?: BackupCreateRequest): Promise<BackupCreateResponse>;
    /** Restore from a backup directory. DESTRUCTIVE. */
    restore(req: BackupRestoreRequest): Promise<BackupRestoreResponse>;
    /** List all existing backup archives. */
    list(): Promise<BackupEntry[]>;
  };
  audit: {
    /** Filtered, paginated list of audit events. */
    list(filter: AuditFilter): Promise<AuditEvent[]>;
    /** Aggregate statistics for the audit summary cards. */
    stats(companyId: string): Promise<AuditStats>;
    /** Export filtered audit events to a file (CSV or JSON). Returns the saved file path. */
    export(req: AuditExportRequest): Promise<AuditExportResponse>;
  };
  tickets: {
    /** Create a new ticket. If assigneeId is provided, triggers agent assignment. */
    create(req: CreateTicketRequest): Promise<CreateTicketResponse>;
    /** Update ticket fields (title, description, priority, status, labels, SLA, due). */
    update(req: UpdateTicketRequest): Promise<void>;
    /** Assign a ticket to an employee. Creates ticket thread and enqueues WorkItem. */
    assign(req: AssignTicketRequest): Promise<void>;
    /** Close a ticket (sets status to 'done' and records closedAt). */
    close(ticketId: string): Promise<void>;
    /** Reopen a previously closed ticket. */
    reopen(ticketId: string): Promise<void>;
    /** Add a comment to a ticket's discussion thread. */
    addComment(req: AddTicketCommentRequest): Promise<AddTicketCommentResponse>;
    /** List all tickets for a company. */
    list(companyId: string): Promise<Ticket[]>;
    /** Get full ticket detail with thread messages and assignee. */
    get(ticketId: string): Promise<TicketDetail>;
    /** Attach a vault file to a ticket. */
    attachFile(req: AttachFileRequest): Promise<AttachFileResponse>;
    /** Detach a file from a ticket. */
    detachFile(req: DetachFileRequest): Promise<void>;
    /** List all file attachments for a ticket. */
    listAttachments(ticketId: string): Promise<TicketAttachment[]>;
  };
}

/**
 * Sentinel value the renderer passes as `threadId` to
 * `chat.send` to request the user↔employee DM thread be looked up or
 * created on the fly. Exported from shared-types so both the preload
 * and the renderer reference the same string constant.
 */
export const AUTO_THREAD_ID = 'auto';
