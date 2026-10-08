/**
 * Service, settings and event-bus shapes the IPC handlers take (narrow
 * structural interfaces). Split from deps.ts (audit 2026-10-07 P1-7).
 */
import type {
  AcceptOperatorInviteResponse,
  ActorKind,
  AgentImprovementRunResult,
  AgentImprovementSnapshot,
  ApprovalItem,
  ArtifactRecord,
  AssembledThreadContext,
  AuditFilter,
  AuditStats,
  AutonomyBenchmarkReport,
  AutonomyDoctorReport,
  BackupEntry,
  BindEmployeeRuntimeProfileRequest,
  BudgetLedgerEntry,
  BudgetOverview,
  BudgetPolicy,
  CompanyCloudLinkStatus,
  CompanySharingReadinessSummary,
  CreateBudgetPolicyRequest,
  CreateOperatorInviteRequest,
  CreateRoutineRequest,
  CreateRuntimeProfileRequest,
  EmployeeRuntimeBinding,
  EventType,
  ExportCompanyPackageRequest,
  ExportCompanyPackageResponse,
  GetThreadDigestRequest,
  ImportCompanyPackageRequest,
  ImportCompanyPackageResponse,
  InstallCompanyTemplateResponse,
  InstallGithubSkillRequest,
  InstallLocalSkillRequest,
  ListAgentImprovementRequest,
  ListApprovalItemsRequest,
  ListArtifactsRequest,
  ListBudgetLedgerEntriesRequest,
  ListCompanyTemplatesResponse,
  ListRoutineRunsRequest,
  ListRunCheckpointsRequest,
  OperatorAccessEntry,
  OperatorInvite,
  PackedThreadContext,
  PreviewCompanyPackageImportRequest,
  PreviewCompanyPackageImportResponse,
  ProviderConfig,
  RemoveSkillRequest,
  ReviewApprovalItemRequest,
  Routine,
  RoutineRun,
  RunAgentImprovementRequest,
  RunAutonomyBenchmarkRequest,
  RunAutonomyDoctorRequest,
  RunCheckpoint,
  RunRoutineNowRequest,
  RuntimeOperationsSnapshot,
  RuntimeProfileSummary,
  RuntimeProfileValidation,
  SettingsGetAgenticResponse,
  SettingsGetCopilotResponse,
  SettingsGetCopilotWeightsResponse,
  SettingsGetExtensionsResponse,
  SettingsGetMemoryResponse,
  SettingsGetPlannerResponse,
  SettingsGetProactiveResponse,
  SettingsSetAgenticRequest,
  SettingsSetCopilotRequest,
  SettingsSetCopilotWeightsRequest,
  SettingsSetCopilotWeightsResponse,
  SettingsSetExtensionsRequest,
  SettingsSetMemoryRequest,
  SettingsSetPlannerRequest,
  SettingsSetProactiveRequest,
  SkillAssignment,
  ThreadDigest,
  UpdateBudgetPolicyRequest,
  UpdateCheckResult,
  UpdateInstallResult,
  UpdateRoutineRequest,
  UpdateRuntimeProfileRequest,
  UpsertSkillAssignmentRequest,
  ValidateRuntimeProfileRequest,
  VaultFile,
  VaultSearchResult,
} from '@team-x/shared-types';

import type { CopilotExportFilter, CopilotExportResult } from '../../db/repos/copilot-insights.js';
import type { EventRow } from '../../db/repos/events.js';
import type { ExtensionRow } from '../../db/repos/extensions.js';

/** Narrow providers-service surface the IPC handlers need. */
export interface IpcProvidersService {
  list(): ProviderConfig[];
  get(id: string): ProviderConfig | null;
  add(provider: {
    name: string;
    kind: import('@team-x/shared-types').ProviderKind;
    privacyTier: import('@team-x/shared-types').PrivacyTier;
    configJson?: string;
    enabled?: boolean;
  }): ProviderConfig;
  update(id: string, fields: { name?: string; enabled?: boolean; configJson?: string }): void;
  remove(id: string): Promise<void>;
  isConfigured(id: string): Promise<boolean>;
}

/** Narrow secrets-store surface the IPC handlers need. */
export interface IpcSecretsStore {
  setApiKey(providerId: string, key: string): Promise<void>;
}

/** Narrow backup-service surface the IPC handlers need. */
export interface IpcBackupService {
  create(
    destination?: string,
  ): Promise<{ backupPath: string; manifest: import('@team-x/shared-types').BackupManifest }>;
  restore(backupPath: string): Promise<import('@team-x/shared-types').BackupManifest>;
  list(): Promise<BackupEntry[]>;
  /** Delete a backup directory permanently. Path must resolve inside the
   *  app's backups directory; service throws otherwise. */
  delete(backupPath: string): Promise<{ deletedPath: string }>;
  /**
   * Post-restore sweep that re-bootstraps `system-agent` +
   * `system-copilot` for every company in the restored DB. Handler
   * composes `listCompanyIds` + `ensureSystemForCompany` from the
   * live db + roleLookup so the backup service stays free of
   * drizzle + role-loader imports. Phase 5 — M33 follow-up F4.
   */
  ensurePostRestoreSystemEmployees(args: {
    listCompanyIds: () => string[];
    ensureSystemForCompany: (companyId: string) => {
      agentCreated: boolean;
      copilotCreated: boolean;
    };
  }): {
    companiesScanned: number;
    agentsCreated: number;
    copilotsCreated: number;
    perCompany: Array<{
      companyId: string;
      agentCreated: boolean;
      copilotCreated: boolean;
    }>;
    skipped: Array<{ companyId: string; reason: string }>;
  };
}

/** Narrow vault-service surface the IPC handlers need. */
export interface IpcVaultService {
  store(
    companyId: string,
    sourcePath: string,
    uploadedBy: string,
    tags?: string[],
    uploadedByKind?: ActorKind,
  ): Promise<string>;
  retrieve(fileId: string): Promise<{ file: VaultFile; absolutePath: string }>;
  verify(fileId: string): Promise<{ ok: boolean; expected: string; actual: string }>;
  remove(fileId: string): Promise<void>;
  search(companyId: string, query: string): VaultSearchResult[];
  list(companyId: string): VaultFile[];
  get(fileId: string): VaultFile | null;
  stats(companyId: string): { fileCount: number; totalBytes: number };
}

/** Narrow audit-repo surface the IPC handlers need. */
export interface IpcAuditRepo {
  list(filter: AuditFilter): EventRow[];
  stats(companyId: string): AuditStats;
  exportJson(filter: AuditFilter): string;
  exportCsv(filter: AuditFilter): string;
  distinctEventTypes(companyId: string): string[];
}

/** Narrow copilot-insights repo surface the IPC export handler needs. */
export interface IpcCopilotInsightsRepo {
  listActiveForExport(filter: CopilotExportFilter): CopilotExportResult;
}

/** Narrow settings-repo surface the IPC handlers need. */
export interface IpcSettingsRepo {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
  /** Agentic loop budgets — snapshot read. Phase 5 — M31. */
  getAgentic(): SettingsGetAgenticResponse;
  /** Agentic loop budgets — clamped write. Phase 5 — M31. */
  setAgentic(req: SettingsSetAgenticRequest): void;
  /** Task planner guardrails — snapshot read. Phase 5 — M32. */
  getPlanner(): SettingsGetPlannerResponse;
  /** Task planner guardrails — clamped/validated write. Phase 5 — M32. */
  setPlanner(req: SettingsSetPlannerRequest): void;
  /** Extensions & Authority autonomy policy. */
  getExtensions?(): SettingsGetExtensionsResponse;
  /** Extensions & Authority autonomy policy write. */
  setExtensions?(req: SettingsSetExtensionsRequest): void;
  /** Long-run memory defaults — snapshot read. */
  getMemory?(): SettingsGetMemoryResponse;
  /** Long-run memory defaults — clamped write. */
  setMemory?(req: SettingsSetMemoryRequest): void;
  /** Copilot service settings — snapshot read (clamped). Phase 5 — M33. */
  getCopilot(): SettingsGetCopilotResponse;
  /** Copilot service settings — clamped/filtered write. Phase 5 — M33. */
  setCopilot(req: SettingsSetCopilotRequest): void;
  /** Copilot feedback weights — snapshot read. Phase 6 — M38. */
  getCopilotWeights(): SettingsGetCopilotWeightsResponse;
  /** Copilot feedback weights — clamped partial write. Phase 6 — M38. */
  setCopilotWeights(req: SettingsSetCopilotWeightsRequest): SettingsSetCopilotWeightsResponse;
  /** Proactive execution settings — snapshot read. Phase 6 — Proactive Execution System. */
  getProactive(): SettingsGetProactiveResponse;
  /** Proactive execution settings — validated partial write. Phase 6 — Proactive Execution System. */
  setProactive(req: SettingsSetProactiveRequest): void;
}

/**
 * Narrow copilot-analyzer-service surface the IPC handlers need for the
 * `settings.setCopilot` side effect and company lifecycle starts/stops
 * for the per-company timer. The full service surface lives in
 * `main/services/copilot-analyzer-service.ts`; this interface pulls in
 * only the methods the IPC boundary requires.
 *
 * Phase 5 — M33 T7.
 */
export interface IpcCopilotAnalyzerService {
  /** Start the per-company analyzer timer. No-ops if it is already running. */
  start(companyId: string): void;
  /** Restart the per-company analyzer timer after settings change. */
  restart(companyId: string): void;
  /**
   * Hard-stop the per-company analyzer timer and abort any in-flight
   * tick. Used by `companies.archive` to quiesce the analyzer before
   * the row flips (M33 F3). No-op if the timer isn't running.
   */
  stop(companyId: string): void;
}

/**
 * Narrow slice of the `CopilotEventWindow` the IPC handlers need.
 * `companies.archive` calls `clear(companyId)` to drop the in-memory
 * rolling buffer + `hydrated` flag so any future snapshot for the
 * same id starts empty (M33 F3).
 *
 * The full window service lives in
 * `main/services/copilot-event-window.ts`; this interface exposes
 * only the `clear` method the IPC boundary requires.
 */
export interface IpcCopilotEventWindow {
  clear(companyId: string): void;
}

/**
 * Narrow event-bus surface the IPC handlers need (M33 F3). Only
 * `emit` is exposed — replay / subscribe live on the richer
 * `EventBus` interface but are not used from handlers. Optional
 * so existing tests that do not need emit can omit it; handlers
 * that need to emit MUST tolerate `undefined` and fall back to a
 * no-op with a warning so a missing wiring is caught in dev but
 * does not take down the IPC call.
 */
export interface IpcEventBus {
  /**
   * Return type is intentionally `void` at this boundary — the handler
   * discards the emitted event. The production `EventBus.emit` returns
   * `DashboardEvent<T>`; narrowing to `void` keeps the handler-facing
   * surface minimal and side-steps `lint/suspicious/noConfusingVoidType`.
   */
  emit<T = unknown>(input: {
    type: EventType;
    companyId: string;
    actorId: string;
    actorKind: ActorKind;
    payload: T;
  }): void;
}

/** Narrow updater-service surface the IPC handlers need. */
export interface IpcUpdaterService {
  checkForUpdate(): Promise<UpdateCheckResult>;
  downloadAndInstall(): Promise<UpdateInstallResult>;
}

/** Narrow skills-service surface the IPC handlers need. */
export interface IpcSkillsService {
  installLocal(input: InstallLocalSkillRequest): Promise<{ extensionId: string }>;
  installGithub(input: InstallGithubSkillRequest): Promise<{ extensionId: string }>;
  removeSkill(input: RemoveSkillRequest): Promise<ExtensionRow>;
  listAssignments(companyId: string): SkillAssignment[];
  upsertAssignment(input: UpsertSkillAssignmentRequest): string;
  deleteAssignment(assignmentId: string): void;
}

export interface IpcOperatorAccessService {
  ensureLocalOwnerForCompany(companyId: string): { operatorId: string; membershipId: string };
  resolveOperatorIdForCompany(companyId: string, preferredOperatorId?: string | null): string;
  listByCompany(companyId: string): OperatorAccessEntry[];
  listInvitesByCompany(companyId: string): OperatorInvite[];
  createInvite(input: CreateOperatorInviteRequest): OperatorInvite;
  revokeInvite(inviteId: string): OperatorInvite;
  acceptInvite(inviteId: string): AcceptOperatorInviteResponse;
  getSharingReadiness(companyId: string): CompanySharingReadinessSummary;
}

export interface IpcCloudLinkService {
  ensureDeviceIdentity(): string;
  getWorkspaceLink(companyId: string): CompanyCloudLinkStatus;
  startLink(companyId: string): CompanyCloudLinkStatus;
  completeLink(companyId: string): CompanyCloudLinkStatus;
  linkWorkspace(companyId: string): CompanyCloudLinkStatus;
  unlinkWorkspace(companyId: string): CompanyCloudLinkStatus;
  reconnectWorkspace(companyId: string): CompanyCloudLinkStatus;
  failLink(companyId: string, error: string): CompanyCloudLinkStatus;
}

export interface IpcProactiveTriggerService {
  decomposeGoal(args: { companyId: string; goalId: string }): Promise<void>;
  scanForWork(args: { companyId: string }): Promise<{ queuedCount: number }>;
  setEnabled(args: { companyId: string; enabled: boolean }): void;
  isEnabled(companyId: string): boolean;
  /** Observed runtime counters backing `proactive.getState` (audit F2). */
  getState(companyId: string): {
    activeWork: number;
    queuedWork: number;
    lastScanAt: number | null;
  };
}

export interface IpcRuntimeProfilesService {
  list(companyId: string): RuntimeProfileSummary[];
  create(input: CreateRuntimeProfileRequest): string;
  update(input: UpdateRuntimeProfileRequest): void;
  delete(profileId: string): void;
  bindEmployee(input: BindEmployeeRuntimeProfileRequest): EmployeeRuntimeBinding | null;
  validateProfile(input: ValidateRuntimeProfileRequest): Promise<RuntimeProfileValidation>;
}

export interface IpcRuntimeOperationsService {
  snapshot(companyId: string): RuntimeOperationsSnapshot;
}

export interface IpcAutonomyDoctorService {
  run(input: RunAutonomyDoctorRequest): Promise<AutonomyDoctorReport>;
}

export interface IpcAutonomyBenchmarkService {
  run(input: RunAutonomyBenchmarkRequest): Promise<AutonomyBenchmarkReport>;
}

export interface IpcAgentImprovementService {
  list(input: ListAgentImprovementRequest): AgentImprovementSnapshot;
  run(input: RunAgentImprovementRequest): AgentImprovementRunResult;
}

export interface IpcRoutineService {
  start(companyId: string): void;
  stop(companyId: string): void;
  list(companyId: string): Routine[];
  listRuns(input: ListRoutineRunsRequest): RoutineRun[];
  create(input: CreateRoutineRequest): string;
  update(input: UpdateRoutineRequest): void;
  delete(routineId: string): void;
  runNow(input: RunRoutineNowRequest): Promise<RoutineRun>;
}

export interface IpcBudgetGovernanceService {
  listPolicies(companyId: string): BudgetPolicy[];
  createPolicy(input: CreateBudgetPolicyRequest): string;
  updatePolicy(input: UpdateBudgetPolicyRequest): void;
  deletePolicy(policyId: string): void;
  listLedgerEntries(input: ListBudgetLedgerEntriesRequest): BudgetLedgerEntry[];
  getOverview(companyId: string): BudgetOverview;
  listApprovalItems(input: ListApprovalItemsRequest): ApprovalItem[];
}

export interface IpcApprovalInboxService {
  listItems(input: ListApprovalItemsRequest): ApprovalItem[];
  reviewItem(input: ReviewApprovalItemRequest & { operatorId: string }): Promise<{
    item: ApprovalItem;
    grantId: string | null;
    ticketId?: string | null;
  }>;
}

export interface IpcArtifactService {
  list(input: ListArtifactsRequest): ArtifactRecord[];
}

export interface IpcCompanyPortabilityService {
  exportCompany(input: ExportCompanyPackageRequest): Promise<ExportCompanyPackageResponse>;
  previewImport(
    input: PreviewCompanyPackageImportRequest,
  ): Promise<PreviewCompanyPackageImportResponse>;
  importAsNewCompany(input: ImportCompanyPackageRequest): Promise<ImportCompanyPackageResponse>;
  listTemplates(): Promise<ListCompanyTemplatesResponse['templates']>;
  installTemplate(input: {
    packagePath?: string;
    packageRef?: string;
  }): Promise<InstallCompanyTemplateResponse['template']>;
}

export interface IpcThreadDigestService {
  getLatest(input: GetThreadDigestRequest): ThreadDigest | null;
}

export interface IpcRunCheckpointService {
  listByThread(input: ListRunCheckpointsRequest): RunCheckpoint[];
}

export interface IpcContextAssemblerService {
  assembleThreadContext(input: {
    companyId: string;
    threadId: string;
    recentTurnLimit?: number;
  }): Promise<AssembledThreadContext>;
}

export interface IpcContextPackerService {
  packContext(input: {
    context: AssembledThreadContext;
    targetTokenBudget?: number;
  }): PackedThreadContext;
}
