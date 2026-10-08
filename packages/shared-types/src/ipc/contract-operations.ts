/**
 * IPC channels for planning, telemetry, settings, providers, data, tickets,
 * intelligence and proactive work.
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
  ListAttachmentsRequest,
  ListProviderModelsRequest,
  ListProviderModelsResponse,
  RagDeleteForCompanyResponse,
  RagRebuildAllResponse,
  RagStatsResponse,
  RemoveProviderRequest,
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
  TestProviderConnectionRequest,
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
  CloseTicketRequest,
  CreateGoalRequest,
  CreateGoalResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  CreateTicketRequest,
  CreateTicketResponse,
  DeleteGoalRequest,
  DeleteProjectRequest,
  EndMeetingRequest,
  EndMeetingResponse,
  GetGoalRequest,
  GetMeetingRequest,
  GetProjectRequest,
  GetTicketRequest,
  GoalDetail,
  InterjectMeetingRequest,
  InterjectMeetingResponse,
  LinkTicketToProjectRequest,
  ListGoalsRequest,
  ListMeetingsRequest,
  ListProjectsRequest,
  ListTicketsRequest,
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
  ReopenTicketRequest,
  TicketDetail,
  UnlinkTicketFromProjectRequest,
  UpdateGoalRequest,
  UpdateProjectRequest,
  UpdateTicketRequest,
} from './shapes-work.js';

export interface IpcContractOperations {
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
  'telemetry.recentRuns': {
    request: TelemetryRecentRunsRequest;
    response: TelemetryRecentRunRow[];
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
  'settings.getExtensions': {
    request: Record<string, never>;
    response: SettingsGetExtensionsResponse;
  };
  'settings.setExtensions': {
    request: SettingsSetExtensionsRequest;
    response: undefined;
  };
  'settings.getMemory': {
    request: Record<string, never>;
    response: SettingsGetMemoryResponse;
  };
  'settings.setMemory': {
    request: SettingsSetMemoryRequest;
    response: undefined;
  };
  'settings.getRagConfig': {
    request: Record<string, never>;
    response: SettingsGetRagConfigResponse;
  };
  'settings.setRagConfig': {
    request: SettingsSetRagConfigRequest;
    response: undefined;
  };
  // Enhanced AI channels (Phase 5 — M32)
  'settings.getEnhancedAiConfig': {
    request: Record<string, never>;
    response: SettingsGetEnhancedAiConfigResponse;
  };
  'settings.setEnhancedAiConfig': {
    request: SettingsSetEnhancedAiConfigRequest;
    response: undefined;
  };
  // Agentic loop channels (Phase 5 — M31)
  'settings.getAgentic': {
    request: Record<string, never>;
    response: SettingsGetAgenticResponse;
  };
  'settings.setAgentic': {
    request: SettingsSetAgenticRequest;
    response: undefined;
  };
  // Task planner channels (Phase 5 — M32)
  'settings.getPlanner': {
    request: Record<string, never>;
    response: SettingsGetPlannerResponse;
  };
  'settings.setPlanner': {
    request: SettingsSetPlannerRequest;
    response: undefined;
  };
  // Copilot service channels (Phase 5 — M33)
  'settings.getCopilot': {
    request: Record<string, never>;
    response: SettingsGetCopilotResponse;
  };
  'settings.setCopilot': {
    request: SettingsSetCopilotRequest;
    response: undefined;
  };
  'settings.getCopilotWeights': {
    request: SettingsGetCopilotWeightsRequest;
    response: SettingsGetCopilotWeightsResponse;
  };
  'settings.setCopilotWeights': {
    request: SettingsSetCopilotWeightsRequest;
    response: SettingsSetCopilotWeightsResponse;
  };
  // Proactive settings channels (Phase 6 — Proactive Execution System)
  'settings.getProactive': {
    request: Record<string, never>;
    response: SettingsGetProactiveResponse;
  };
  'settings.setProactive': {
    request: SettingsSetProactiveRequest;
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
  'providers.listModels': {
    request: ListProviderModelsRequest;
    response: ListProviderModelsResponse;
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
  'backup.delete': {
    request: BackupDeleteRequest;
    response: BackupDeleteResponse;
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
  // Updater channels (Phase 4 — M25)
  'updater.check': {
    request: Record<string, never>;
    response: UpdateCheckResult;
  };
  'updater.install': {
    request: Record<string, never>;
    response: UpdateInstallResult;
  };
  // RAG channels (Phase 5 — M29)
  'rag.stats': {
    request: string;
    response: RagStatsResponse;
  };
  'rag.rebuildAll': {
    request: string;
    response: RagRebuildAllResponse;
  };
  'rag.deleteForCompany': {
    request: string;
    response: RagDeleteForCompanyResponse;
  };
  // Paperclip import bridge (preview + save the converted package — the
  // commit path is companyPortability.importPackage)
  'paperclip.preview': {
    request: PaperclipPreviewRequest;
    response: PaperclipImportBridgePreview;
  };
  'paperclip.savePackage': {
    request: PaperclipPreviewRequest;
    response: PaperclipSavePackageResponse;
  };
  // Private operator access (read-only supervision planning)
  'privateOperator.plan': {
    request: PrivateOperatorAccessRequest;
    response: PrivateOperatorAccessPlan;
  };
  'privateOperator.snapshot': {
    request: PrivateOperatorAccessRequest;
    response: PrivateOperatorMissionControlSnapshot;
  };
  // Command palette channels (Phase 5 — M30)
  'command.parse': {
    request: CommandParseRequest;
    response: IpcParseResult;
  };
  'command.execute': {
    request: IpcExecuteRequest;
    response: IpcExecuteResult;
  };
  'command.history': {
    request: CommandHistoryRequest;
    response: IpcCommandHistoryEntry[];
  };
  'command.suggest': {
    request: CommandSuggestRequest;
    response: IpcSuggestItem[];
  };
  // Agentic-loop cancellation (Phase 5 — M31 T6)
  'command.stop': {
    request: CommandStopRequest;
    response: CommandStopResult;
  };
  // Agentic-loop run snapshot for palette backfill-on-mount (Phase 5 — M32 T0 / F1)
  'command.getRunSnapshot': {
    request: { runId: string };
    response: AgenticRunSnapshot | null;
  };
  // Copilot service channels (Phase 5 — M33 T5)
  'copilot.insights': {
    request: CopilotInsightListArgs;
    response: CopilotInsightListResult;
  };
  'copilot.dismiss': {
    request: CopilotDismissArgs;
    response: CopilotDismissResult;
  };
  'copilot.ask': {
    request: CopilotAskArgs;
    response: CopilotAskResult;
  };
  'copilot.configure': {
    request: CopilotConfigureArgs;
    response: CopilotConfigureResult;
  };
  'copilot.export': {
    request: CopilotExportRequest;
    response: CopilotExportResponse;
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
  'tickets.addParticipant': {
    request: AddTicketParticipantRequest;
    response: undefined;
  };
  'tickets.removeParticipant': {
    request: RemoveTicketParticipantRequest;
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
  'proactive.setEnabled': {
    request: ProactiveSetEnabledRequest;
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  'proactive.decomposeGoal': {
    request: ProactiveDecomposeGoalRequest;
    response: ProactiveDecomposeGoalResponse;
  };
  'proactive.scanForWork': {
    request: ProactiveScanForWorkRequest;
    response: ProactiveScanForWorkResponse;
  };
  'proactive.getState': {
    request: ProactiveGetStateRequest;
    response: ProactiveGetStateResponse;
  };
}
