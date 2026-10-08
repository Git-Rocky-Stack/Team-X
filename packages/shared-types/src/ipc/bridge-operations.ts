/**
 * `window.teamx` namespaces for planning, telemetry, settings, providers,
 * data, intelligence, tickets, proactive work and Local GGUF.
 * Split from ipc.ts by bounded context (audit 2026-10-07 P1-7).
 */

import type {
  CommandHistoryRequest,
  CommandParseRequest,
  CommandStopRequest,
  CommandStopResult,
  CommandSuggestRequest,
  IpcCommandHistoryEntry,
  IpcExecuteRequest,
  IpcExecuteResult,
  IpcParseResult,
  IpcSuggestItem,
} from '../command.js';
import type {
  CopilotAskArgs,
  CopilotAskResult,
  CopilotConfigureArgs,
  CopilotConfigureResult,
  CopilotDismissArgs,
  CopilotDismissResult,
  CopilotExportRequest,
  CopilotExportResponse,
  CopilotInsightListArgs,
  CopilotInsightListResult,
} from '../copilot.js';
import type { Goal, Meeting, Project, Ticket } from '../entities.js';
import type { AgenticRunSnapshot } from '../events.js';
import type { LocalGgufApi } from '../local-gguf.js';
import type {
  PaperclipImportBridgePreview,
  PaperclipPreviewRequest,
  PaperclipSavePackageResponse,
} from '../paperclip.js';
import type {
  PrivateOperatorAccessPlan,
  PrivateOperatorAccessRequest,
  PrivateOperatorMissionControlSnapshot,
} from '../private-operator.js';
import type { ProviderConfig } from '../providers.js';
import type {
  AddProviderRequest,
  AddProviderResponse,
  AttachFileRequest,
  AttachFileResponse,
  AuditEvent,
  AuditExportRequest,
  AuditExportResponse,
  AuditFilter,
  AuditStats,
  BackupCreateRequest,
  BackupCreateResponse,
  BackupDeleteRequest,
  BackupDeleteResponse,
  BackupEntry,
  BackupRestoreRequest,
  BackupRestoreResponse,
  DetachFileRequest,
  ListProviderModelsResponse,
  RagDeleteForCompanyResponse,
  RagRebuildAllResponse,
  RagStatsResponse,
  TelemetryCompanyStatsRequest,
  TelemetryCompanyStatsResponse,
  TelemetryCostBreakdownRequest,
  TelemetryCostBreakdownRow,
  TelemetryDailyUsageRequest,
  TelemetryDailyUsageRow,
  TelemetryEmployeeStatsRequest,
  TelemetryEmployeeStatsRow,
  TelemetryRecentRunRow,
  TelemetryRecentRunsRequest,
  TestProviderConnectionResponse,
  TicketAttachment,
  UpdateCheckResult,
  UpdateInstallResult,
  UpdateProviderRequest,
  VaultDownloadResponse,
  VaultFile,
  VaultSearchResult,
  VaultStatsResponse,
  VaultUploadRequest,
  VaultUploadResponse,
  VaultVerifyResponse,
} from './shapes-platform.js';
import type {
  SettingsGetAgenticResponse,
  SettingsGetConcurrencyResponse,
  SettingsGetCopilotResponse,
  SettingsGetCopilotWeightsRequest,
  SettingsGetCopilotWeightsResponse,
  SettingsGetEnhancedAiConfigResponse,
  SettingsGetExtensionsResponse,
  SettingsGetMemoryResponse,
  SettingsGetPlannerResponse,
  SettingsGetPrivacyResponse,
  SettingsGetProactiveResponse,
  SettingsGetRagConfigResponse,
  SettingsGetRuntimeResponse,
  SettingsSetAgenticRequest,
  SettingsSetConcurrencyRequest,
  SettingsSetCopilotRequest,
  SettingsSetCopilotWeightsRequest,
  SettingsSetCopilotWeightsResponse,
  SettingsSetEnhancedAiConfigRequest,
  SettingsSetExtensionsRequest,
  SettingsSetMemoryRequest,
  SettingsSetPlannerRequest,
  SettingsSetPrivacyRequest,
  SettingsSetProactiveRequest,
  SettingsSetRagConfigRequest,
  SettingsSetRuntimeRequest,
} from './shapes-settings.js';
import type {
  AddTicketCommentRequest,
  AddTicketCommentResponse,
  AddTicketParticipantRequest,
  AssignTicketRequest,
  CallMeetingRequest,
  CallMeetingResponse,
  CreateGoalRequest,
  CreateGoalResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  CreateTicketRequest,
  CreateTicketResponse,
  EndMeetingResponse,
  GoalDetail,
  InterjectMeetingRequest,
  InterjectMeetingResponse,
  MeetingDetail,
  ProactiveDecomposeGoalRequest,
  ProactiveDecomposeGoalResponse,
  ProactiveGetStateRequest,
  ProactiveGetStateResponse,
  ProactiveScanForWorkRequest,
  ProactiveScanForWorkResponse,
  ProactiveSetEnabledRequest,
  ProjectDetail,
  RemoveTicketParticipantRequest,
  TicketDetail,
  UpdateGoalRequest,
  UpdateProjectRequest,
  UpdateTicketRequest,
} from './shapes-work.js';

export interface TeamXApiOperations {
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
    companyStats(
      req: string | TelemetryCompanyStatsRequest,
    ): Promise<TelemetryCompanyStatsResponse>;
    /** Daily time-series of token usage and cost within a date range. */
    dailyUsage(req: TelemetryDailyUsageRequest): Promise<TelemetryDailyUsageRow[]>;
    /** Per-employee breakdown of runs, tokens, latency, and cost. */
    employeeStats(
      req: string | TelemetryEmployeeStatsRequest,
    ): Promise<TelemetryEmployeeStatsRow[]>;
    /** Newest-first persisted run summaries for dashboard backfill. */
    recentRuns(req: TelemetryRecentRunsRequest): Promise<TelemetryRecentRunRow[]>;
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
    /** Get Extensions & Authority settings. */
    getExtensions(): Promise<SettingsGetExtensionsResponse>;
    /** Patch Extensions & Authority settings. */
    setExtensions(req: SettingsSetExtensionsRequest): Promise<void>;
    /** Get long-run memory defaults (pack budget, recent-turn window, checkpoint depth). */
    getMemory(): Promise<SettingsGetMemoryResponse>;
    /** Patch one or more long-run memory defaults. */
    setMemory(req: SettingsSetMemoryRequest): Promise<void>;
    /** Get full RAG configuration snapshot (enabled, top-K, threshold, max-tokens, embedding provider/model/dimension). */
    getRagConfig(): Promise<SettingsGetRagConfigResponse>;
    /** Patch one or more RAG configuration keys. Missing keys retain their current value. */
    setRagConfig(req: SettingsSetRagConfigRequest): Promise<void>;
    /** Get full Enhanced AI configuration snapshot (LLM provider, features toggles). Phase 5 — M32. */
    getEnhancedAiConfig(): Promise<SettingsGetEnhancedAiConfigResponse>;
    /** Patch one or more Enhanced AI configuration keys. Missing keys retain their current value. Phase 5 — M32. */
    setEnhancedAiConfig(req: SettingsSetEnhancedAiConfigRequest): Promise<void>;
    /** Get agentic-loop budget caps (max steps, max tokens, timeout ms). Phase 5 — M31. */
    getAgentic(): Promise<SettingsGetAgenticResponse>;
    /** Patch one or more agentic-loop budget caps. Values are clamped. Phase 5 — M31. */
    setAgentic(req: SettingsSetAgenticRequest): Promise<void>;
    /** Get task-planner guardrail settings (max tickets, max depth, approval level, escalation threshold). Phase 5 — M32. */
    getPlanner(): Promise<SettingsGetPlannerResponse>;
    /** Patch one or more task-planner settings. Numeric values are clamped; approval level is validated. Phase 5 — M32. */
    setPlanner(req: SettingsSetPlannerRequest): Promise<void>;
    /** Get copilot-service settings (enabled, interval in minutes, allowed category subset). Phase 5 — M33. */
    getCopilot(): Promise<SettingsGetCopilotResponse>;
    /**
     * Patch one or more copilot-service settings. `intervalMinutes` is clamped;
     * `categories` is filtered against `COPILOT_CATEGORIES` with empty-array
     * fallback to the full set. Restarts the per-company analyzer timer so
     * new settings take effect without an app restart. Phase 5 — M33.
     */
    setCopilot(req: SettingsSetCopilotRequest): Promise<void>;
    /** Get copilot feedback category weights. Phase 6 — M38. */
    getCopilotWeights(
      req: SettingsGetCopilotWeightsRequest,
    ): Promise<SettingsGetCopilotWeightsResponse>;
    /** Patch copilot feedback category weights. Phase 6 — M38. */
    setCopilotWeights(
      req: SettingsSetCopilotWeightsRequest,
    ): Promise<SettingsSetCopilotWeightsResponse>;
    /** Get proactive mode settings (enabled, autonomy mode). Phase 6 — Proactive Execution System. */
    getProactive(): Promise<SettingsGetProactiveResponse>;
    /** Patch one or more proactive settings. Phase 6 — Proactive Execution System. */
    setProactive(req: SettingsSetProactiveRequest): Promise<void>;
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
    /** List provider models or suggestions for model-capable settings UIs. */
    listModels(providerId: string): Promise<ListProviderModelsResponse>;
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
    /** Delete a backup archive permanently. The path must live inside the
     *  app's backups directory; paths that escape are rejected. */
    delete(req: BackupDeleteRequest): Promise<BackupDeleteResponse>;
  };
  audit: {
    /** Filtered, paginated list of audit events. */
    list(filter: AuditFilter): Promise<AuditEvent[]>;
    /** Aggregate statistics for the audit summary cards. */
    stats(companyId: string): Promise<AuditStats>;
    /** Export filtered audit events to a file (CSV or JSON). Returns the saved file path. */
    export(req: AuditExportRequest): Promise<AuditExportResponse>;
  };
  updater: {
    /** Check GitHub Releases for a newer version. User-triggered only (zero phone-home). */
    check(): Promise<UpdateCheckResult>;
    /** Download and install the available update. App will restart. */
    install(): Promise<UpdateInstallResult>;
  };
  rag: {
    /** Aggregate embedding stats for the Settings panel summary card. */
    stats(companyId: string): Promise<RagStatsResponse>;
    /** Destructive: wipe then re-index every eligible source for the company. */
    rebuildAll(companyId: string): Promise<RagRebuildAllResponse>;
    /** Destructive: wipe every embedding row for the company (no re-index). */
    deleteForCompany(companyId: string): Promise<RagDeleteForCompanyResponse>;
  };
  paperclip: {
    /**
     * Read a Paperclip export folder and report what importing it would
     * produce. Preview only — nothing is written. Feed the returned
     * `packageData` to `companyPortability.importPackage` to commit.
     */
    preview(req: PaperclipPreviewRequest): Promise<PaperclipImportBridgePreview>;
    /**
     * Convert the folder again and write the package to a `.teamx-package.json`
     * chosen in a native save dialog — the file Portability imports.
     */
    savePackage(req: PaperclipPreviewRequest): Promise<PaperclipSavePackageResponse>;
  };
  privateOperator: {
    /**
     * Compute what a non-workstation device would be allowed to do against this
     * workspace, and why. Pure planning — nothing here opens a listener.
     */
    plan(req: PrivateOperatorAccessRequest): Promise<PrivateOperatorAccessPlan>;
    /** The plan plus the workspace state that plan authorises reading. */
    snapshot(req: PrivateOperatorAccessRequest): Promise<PrivateOperatorMissionControlSnapshot>;
  };
  command: {
    /**
     * Classify the user's text, resolve any entity queries, fill slots,
     * and return a discriminated-union `IpcParseResult` the palette UI
     * can drive. No side effects — the result is a plan, not a
     * dispatch. `currentView` + `recentIntents` are optional NLU
     * context the classifier uses to bias prediction.
     */
    parse(req: CommandParseRequest): Promise<IpcParseResult>;
    /**
     * Run a parsed intent against the main process's existing IPC
     * handlers. Destructive intents (`fire_employee`, `close_ticket`,
     * `end_meeting`, `promote_employee`) require `confirmed: true`
     * explicitly — omitting it returns `{ kind: 'needs_confirmation' }`
     * without dispatching.
     */
    execute(req: IpcExecuteRequest): Promise<IpcExecuteResult>;
    /**
     * Newest-first page of the caller's command history. Defaults
     * `limit` to the per-company FIFO cap (20) and `companyId` to the
     * service's defaultCompanyId.
     */
    history(req?: CommandHistoryRequest): Promise<IpcCommandHistoryEntry[]>;
    /**
     * Prefix-matched suggestion rows for the palette's drop-down.
     * M30 ships a static table; M31 may extend with RAG context.
     */
    suggest(req: CommandSuggestRequest): Promise<IpcSuggestItem[]>;
    /**
     * Cancel an in-flight agentic-loop run started by an earlier
     * `command.execute` that returned a `runId` (Phase 5 — M31 T6).
     *
     * Idempotent: unknown or already-terminal run ids resolve to
     * `{ stopped: false }` without throwing. The authoritative
     * end-of-run signal is the `agentic.failed` (status=`canceled`)
     * event on `events.dashboard` — the palette subscribes to that
     * to exit the step-log running state; this call's return value
     * is informational only.
     */
    stop(req: CommandStopRequest): Promise<CommandStopResult>;
    /**
     * Return a point-in-time snapshot of an agentic-loop run keyed by
     * `runId` (Phase 5 — M32 T0 / F1). Projects the in-memory run
     * state onto the wire shapes `agent.step` / `agentic.completed` /
     * `agentic.failed` use, so the palette can backfill its step-log
     * on mount for runs whose bus events fired before the renderer
     * subscription attached. Returns `null` for unknown / evicted
     * runs — callers treat that as "no backfill available" and fall
     * back to the live stream alone.
     */
    getRunSnapshot(runId: string): Promise<AgenticRunSnapshot | null>;
  };
  copilot: {
    /**
     * Paginated list of active (non-dismissed, non-expired) insights
     * for the company, newest-first. Cursor is the `createdAt` of the
     * last row from the previous page; pass `undefined` for the first
     * page. `nextCursor` is `null` when the page was the last one.
     * Optional category + severity filters narrow the result set
     * server-side so the UI does not paginate through dismissed or
     * filtered-out rows. Phase 5 — M33 T5.
     */
    insights(args: CopilotInsightListArgs): Promise<CopilotInsightListResult>;
    /**
     * Mark an insight as dismissed. Idempotent when invoked on an
     * already-dismissed row (the handler returns the prior
     * `dismissedAt`). Emits `copilot.dismissed` on the event bus per
     * invariant #11 so the renderer's React Query cache invalidates.
     * Phase 5 — M33 T5.
     */
    dismiss(args: CopilotDismissArgs): Promise<CopilotDismissResult>;
    /**
     * Ask the `system-copilot` pseudo-employee a question. Routes
     * through the agentic loop in the same shape M31's
     * `complex_request` uses — the response `{ runId, threadId }`
     * mirrors `IpcExecuteResult` so the palette's step-stream hook
     * can subscribe with no wire-format divergence. Phase 5 — M33 T5
     * ships the IPC slot; T6 wires the full loop.
     */
    ask(args: CopilotAskArgs): Promise<CopilotAskResult>;
    /**
     * Test-only: force a manual analyzer tick for the given company
     * and resolve when it completes. Production callers receive an
     * error directing them to `settings.setCopilot` (T7). Sole
     * intended caller is the T9 Playwright spec, which needs to
     * synchronously force a copilot cycle rather than wait on the
     * 5-minute scheduled interval. Phase 5 — M33 T5.
     */
    configure(args: CopilotConfigureArgs): Promise<CopilotConfigureResult>;
    /**
     * Read-only local export of active Copilot insights as CSV or JSON.
     * Company scope requires `companyId`; all-company scope applies the
     * same optional category/severity filters globally. Emits no bus event.
     * Phase 6 — M40.
     */
    export(args: CopilotExportRequest): Promise<CopilotExportResponse>;
  };
  tickets: {
    /** Create a new ticket. If assigneeId is provided, triggers agent assignment. */
    create(req: CreateTicketRequest): Promise<CreateTicketResponse>;
    /** Update ticket fields (title, description, priority, status, labels, SLA, due). */
    update(req: UpdateTicketRequest): Promise<void>;
    /** Assign a ticket to an employee. Creates ticket thread and enqueues WorkItem. */
    assign(req: AssignTicketRequest): Promise<void>;
    /** Add an employee to the ticket discussion and wake them into the thread. */
    addParticipant(req: AddTicketParticipantRequest): Promise<void>;
    /** Remove an employee from the ticket discussion. */
    removeParticipant(req: RemoveTicketParticipantRequest): Promise<void>;
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
  proactive: {
    /** Enable or disable proactive mode for a company. */
    setEnabled(req: ProactiveSetEnabledRequest): Promise<void>;
    /** Trigger immediate goal decomposition. */
    decomposeGoal(req: ProactiveDecomposeGoalRequest): Promise<ProactiveDecomposeGoalResponse>;
    /** Trigger background work scan. */
    scanForWork(req: ProactiveScanForWorkRequest): Promise<ProactiveScanForWorkResponse>;
    /** Query proactive state. */
    getState(req: ProactiveGetStateRequest): Promise<ProactiveGetStateResponse>;
  };

  /**
   * Local & Networked GGUF Support (v3.3.0). Every channel is served by a
   * real main-process handler (runtime/pool, library, endpoint, hf and
   * benchmark); the Phase 1 not-implemented stubs are gone. See
   * `LocalGgufApi` in `local-gguf.ts` for the per-area method contracts.
   */
  localGguf: LocalGgufApi;
}
