/**
 * Request/response shapes: telemetry, MCP, extensions and authority,
 * providers, vault, backup, attachments, audit log, updater, RAG management.
 * Split from ipc.ts by bounded context (audit 2026-10-07 P1-7).
 */
import type { PrivacyTier, ProviderKind } from '../providers.js';

// ---------------------------------------------------------------------------
// Telemetry shapes (Phase 3 — M17)
// ---------------------------------------------------------------------------

export const TELEMETRY_RUN_KINDS = ['work', 'agentic', 'copilot'] as const;
export type TelemetryRunKind = (typeof TELEMETRY_RUN_KINDS)[number];

export const TELEMETRY_KIND_FILTERS = ['all', ...TELEMETRY_RUN_KINDS] as const;
export type TelemetryKindFilter = (typeof TELEMETRY_KIND_FILTERS)[number];

export interface TelemetryCompanyStatsRequest {
  companyId: string;
  kind?: TelemetryRunKind;
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
  kind?: TelemetryRunKind;
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
  kind?: TelemetryRunKind;
}

export interface TelemetryEmployeeStatsRow {
  employeeId: string;
  totalRuns: number;
  totalTokens: number;
  avgLatencyMs: number;
  costUsd: string;
  totalToolCalls: number;
}

export interface TelemetryRecentRunsRequest {
  companyId: string;
  kind?: TelemetryRunKind;
  limit?: number;
}

export interface TelemetryRecentRunRow {
  runId: string;
  threadId: string | null;
  threadSubject: string | null;
  employeeId: string;
  employeeName: string;
  employeeTitle: string;
  provider: string;
  model: string;
  status: 'running' | 'success' | 'error' | 'cancelled';
  error: string | null;
  promptTokens: number;
  completionTokens: number;
  costUsd: string;
  toolCallsCount: number;
  startedAt: number;
  endedAt: number | null;
}

export interface TelemetryCostBreakdownRequest {
  companyId: string;
  /** Optional epoch millis — start of range. */
  fromMs?: number;
  /** Optional epoch millis — end of range. */
  toMs?: number;
  kind?: TelemetryRunKind;
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

export interface McpTemplateSummary {
  id: string;
  name: string;
  transport: 'stdio' | 'sse';
  sourceRef: string;
  lastHealth: string | null;
  requestedCapabilities: string[];
  installed: boolean;
  installedServerId: string | null;
}

export interface ListMcpTemplatesRequest {
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

export interface InstallMcpTemplateRequest {
  companyId: string;
  templateId: string;
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

export interface SelectDirectoryResponse {
  canceled: boolean;
  folderPath: string | null;
}

/** Result of the native single-file picker (`system.selectGgufFile`). */
export interface SelectFileResponse {
  canceled: boolean;
  filePath: string | null;
}

// ---------------------------------------------------------------------------
// Extensions & authority shapes (Phase 6+ foundation)
// ---------------------------------------------------------------------------

export interface ListExtensionsRequest {
  companyId: string;
}

export interface InstallLocalSkillRequest {
  companyId: string;
  folderPath: string;
}

export interface InstallGithubSkillRequest {
  companyId: string;
  sourceUrl: string;
}

export interface RemoveSkillRequest {
  companyId: string;
  extensionId: string;
}

export interface ListSkillAssignmentsRequest {
  companyId: string;
}

export interface UpsertSkillAssignmentRequest {
  companyId: string;
  extensionId: string;
  employeeId?: string | null;
  enabled: boolean;
}

export interface DeleteSkillAssignmentRequest {
  assignmentId: string;
}

export interface ListAuthorityGrantsRequest {
  companyId: string;
  employeeId?: string | null;
}

export interface ListAuthorityRequestsRequest {
  companyId: string;
  status?: 'pending' | 'approved' | 'denied';
}

export interface CreateAuthorityGrantRequest {
  companyId: string;
  scopeKind: 'company' | 'employee';
  scopeId: string;
  resourceKind: 'capability' | 'path';
  resourceId: string;
  permission: 'allow' | 'deny' | 'prompt';
  metadata?: Record<string, unknown> | null;
}

export interface DeleteAuthorityGrantRequest {
  grantId: string;
}

export interface ReviewAuthorityRequestRequest {
  companyId: string;
  requestId: string;
  decision: 'approved' | 'denied';
  reason?: string | null;
  operatorId?: string;
}

export interface GetEffectiveAuthorityRequest {
  companyId: string;
  employeeId: string;
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
  /** Optional detail message (e.g., "5 models available" for Ollama) */
  detail?: string;
}

export interface ListProviderModelsRequest {
  providerId: string;
}

export interface ListProviderModelsResponse {
  models: string[];
  /**
   * Reachability of the model source, so the settings UI can tell a benign
   * "Ollama not running" state apart from a genuine server-side failure:
   * - 'ok'          — the server answered; `models` are real detections.
   * - 'unreachable' — benign connectivity failure (server not started);
   *                   `models` is the configured-default fallback, not a
   *                   detection.
   * - 'error'       — the server was reachable but rejected the request (auth
   *                   401/403, wrong-port, upstream 5xx, TLS, malformed body);
   *                   a real misconfiguration the user must be able to see.
   */
  status: 'ok' | 'unreachable' | 'error';
  /** Human-readable detail for the 'error' status (e.g. "HTTP 401"). */
  detail?: string;
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

export interface BackupDeleteRequest {
  /** Full path to the backup directory to delete. Must resolve inside the
   *  app's backups directory — paths that escape are rejected at the service. */
  backupPath: string;
}

export interface BackupDeleteResponse {
  /** The resolved (canonical) path that was removed. Echoed for audit logging. */
  deletedPath: string;
}

export interface BackupRestoreResponse {
  manifest: BackupManifest;
  /**
   * Post-restore system-employee bootstrap counts (M33 follow-up F4).
   * Either or both `agentsCreated` / `copilotsCreated` are non-zero
   * only when the restored backup pre-dates the migration that
   * introduced the corresponding system row (M31 for agent, M33 for
   * copilot). `skipped` captures per-company ensure failures without
   * aborting the restore — callers surface a user-facing warning
   * when non-empty.
   *
   * Optional for forward-compatibility with older handler
   * implementations that predate F4; renderer consumers should
   * tolerate `undefined`.
   */
  postRestoreSystemEmployees?: {
    companiesScanned: number;
    agentsCreated: number;
    copilotsCreated: number;
    skipped: Array<{ companyId: string; reason: string }>;
  };
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
// Updater shapes (Phase 4 — M25)
// ---------------------------------------------------------------------------

/** Status of the auto-updater lifecycle. */
export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

/** Result of checking for updates. */
export interface UpdateCheckResult {
  status: 'available' | 'not-available' | 'error';
  /** Set when status is 'available'. */
  version?: string;
  /** Set when status is 'available'. Release notes markdown. */
  releaseNotes?: string;
  /** Set when status is 'available'. Release date ISO string. */
  releaseDate?: string;
  /** Set when status is 'error'. */
  error?: string;
}

/** Progress of an update download. */
export interface UpdateDownloadProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

/** Result of installing an update. */
export interface UpdateInstallResult {
  /** Whether the install was initiated (app will restart). */
  initiated: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// RAG management shapes (Phase 5 — M29)
// ---------------------------------------------------------------------------

/** Aggregate statistics for a company's embedding store. */
export interface RagStatsResponse {
  /** Total embedding rows (chunks) stored for the company. */
  embeddingCount: number;
  /** Millisecond timestamp of the newest embedding row, or null if none. */
  lastIndexedAt: number | null;
  /** Whether the RAG subsystem is currently active (provider configured). */
  enabled: boolean;
}

/** Result of wiping + re-indexing every eligible source for a company. */
export interface RagRebuildAllResponse {
  /** Count of sources scheduled for re-embedding. */
  scheduled: number;
}

/** Result of wiping every embedding for a company (no re-index). */
export interface RagDeleteForCompanyResponse {
  /** Count of embedding rows removed. */
  deleted: number;
}
