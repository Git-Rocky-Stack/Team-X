/**
 * IPC channels for workspaces, operators, autonomy, people, chat, extensions
 * and authority.
 * Split from ipc.ts by bounded context (audit 2026-10-07 P1-7).
 */
import type {
  ApprovalItem,
  ArtifactRecord,
  AuthorityGrant,
  AuthorityRequest,
  AutonomyBenchmarkReport,
  AutonomyDoctorReport,
  BudgetLedgerEntry,
  BudgetOverview,
  BudgetPolicy,
  ChatMessage,
  Company,
  CompanyCloudLinkStatus,
  CompanySharingReadinessSummary,
  EffectiveAuthoritySnapshot,
  Employee,
  EmployeeRuntimeBinding,
  ExtensionSummary,
  OperatorAccessEntry,
  OperatorInvite,
  PackedThreadContext,
  Routine,
  RoutineRun,
  RunCheckpoint,
  RuntimeProfileSummary,
  RuntimeProfileValidation,
  ScheduleItem,
  SkillAssignment,
  Thread,
  ThreadDigest,
} from '../entities.js';

import type {
  AddMcpServerRequest,
  CreateAuthorityGrantRequest,
  DeleteAuthorityGrantRequest,
  DeleteSkillAssignmentRequest,
  GetEffectiveAuthorityRequest,
  InstallGithubSkillRequest,
  InstallLocalSkillRequest,
  InstallMcpTemplateRequest,
  ListAuthorityGrantsRequest,
  ListAuthorityRequestsRequest,
  ListExtensionsRequest,
  ListMcpServersRequest,
  ListMcpTemplatesRequest,
  ListSkillAssignmentsRequest,
  McpServerSummary,
  McpTemplateSummary,
  RemoveSkillRequest,
  ReviewAuthorityRequestRequest,
  TestMcpConnectionRequest,
  TestMcpConnectionResponse,
  ToggleMcpServerRequest,
  UpsertSkillAssignmentRequest,
} from './shapes-platform.js';
import type {
  CompleteScheduleItemRequest,
  CreateScheduleItemRequest,
  CreateScheduleItemResponse,
  DeleteScheduleItemRequest,
  ListEventsRequest,
  ListEventsResponse,
  ListScheduleItemsRequest,
  OrgchartGetRequest,
  OrgchartGetResponse,
  UpdateScheduleItemRequest,
} from './shapes-work.js';
import type {
  AcceptOperatorInviteRequest,
  AcceptOperatorInviteResponse,
  AgentImprovementRunResult,
  AgentImprovementSnapshot,
  ArchiveCompanyRequest,
  BindEmployeeRuntimeProfileRequest,
  CompaniesCreateRequest,
  CompaniesCreateResponse,
  CompaniesDeleteRequest,
  CompaniesUpdateRequest,
  CreateBudgetPolicyRequest,
  CreateOperatorInviteRequest,
  CreateOperatorInviteResponse,
  CreateRoutineRequest,
  CreateRuntimeProfileRequest,
  DeleteBudgetPolicyRequest,
  DeleteRoutineRequest,
  DeleteRuntimeProfileRequest,
  EmployeesPromoteRequest,
  EmployeesPromoteResponse,
  EmployeesSetManagerRequest,
  EmployeesUpdateRequest,
  EmployeesUpdateResponse,
  ExportCompanyPackageRequest,
  ExportCompanyPackageResponse,
  FireEmployeeRequest,
  GetBudgetOverviewRequest,
  GetCloudWorkspaceLinkRequest,
  GetOperatorSharingReadinessRequest,
  GetThreadDigestRequest,
  HireEmployeeRequest,
  HireEmployeeResponse,
  ImportCompanyPackageRequest,
  ImportCompanyPackageResponse,
  InstallCompanyTemplateRequest,
  InstallCompanyTemplateResponse,
  LinkCloudWorkspaceRequest,
  ListAgentImprovementRequest,
  ListApprovalItemsRequest,
  ListArtifactsRequest,
  ListBudgetLedgerEntriesRequest,
  ListBudgetPoliciesRequest,
  ListChatRequest,
  ListCompanyTemplatesRequest,
  ListCompanyTemplatesResponse,
  ListEmployeesRequest,
  ListOperatorInvitesRequest,
  ListOperatorsRequest,
  ListRoutineRunsRequest,
  ListRoutinesRequest,
  ListRunCheckpointsRequest,
  ListRuntimeOperationsRequest,
  ListRuntimeProfilesRequest,
  ListThreadsRequest,
  PackThreadContextRequest,
  PreviewCompanyPackageImportRequest,
  PreviewCompanyPackageImportResponse,
  ReconnectCloudWorkspaceRequest,
  ResolveThreadRequest,
  ResolveThreadResponse,
  ReviewApprovalItemRequest,
  RevokeOperatorInviteRequest,
  RunAgentImprovementRequest,
  RunAutonomyBenchmarkRequest,
  RunAutonomyDoctorRequest,
  RunRoutineNowRequest,
  RuntimeOperationsSnapshot,
  SendChatRequest,
  SendChatResponse,
  StopChatRequest,
  StopChatResponse,
  UnlinkCloudWorkspaceRequest,
  UpdateBudgetPolicyRequest,
  UpdateRoutineRequest,
  UpdateRuntimeProfileRequest,
  ValidateRuntimeProfileRequest,
} from './shapes-workspace.js';

export interface IpcContractWorkspace {
  'companies.list': {
    request: Record<string, never>;
    response: Company[];
  };
  'companies.exportPackage': {
    request: ExportCompanyPackageRequest;
    response: ExportCompanyPackageResponse;
  };
  'companies.previewImportPackage': {
    request: PreviewCompanyPackageImportRequest;
    response: PreviewCompanyPackageImportResponse;
  };
  'companies.importPackage': {
    request: ImportCompanyPackageRequest;
    response: ImportCompanyPackageResponse;
  };
  'companies.listTemplates': {
    request: ListCompanyTemplatesRequest;
    response: ListCompanyTemplatesResponse;
  };
  'companies.installTemplate': {
    request: InstallCompanyTemplateRequest;
    response: InstallCompanyTemplateResponse;
  };
  'companies.archive': {
    request: ArchiveCompanyRequest;
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  'companies.create': {
    request: CompaniesCreateRequest;
    response: CompaniesCreateResponse;
  };
  // Cluster A multi-company CRUD write-side (Phase 5.6 M-C step e;
  // restores audit rows 10.13 + 10.15). Both emit bus events per
  // architectural invariant #11 (`company.updated` / `company.deleted`).
  'companies.update': {
    request: CompaniesUpdateRequest;
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  'companies.delete': {
    request: CompaniesDeleteRequest;
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  'employees.list': {
    request: ListEmployeesRequest;
    response: Employee[];
  };
  'operators.list': {
    request: ListOperatorsRequest;
    response: OperatorAccessEntry[];
  };
  'operators.readiness': {
    request: GetOperatorSharingReadinessRequest;
    response: CompanySharingReadinessSummary;
  };
  'cloud.getWorkspaceLink': {
    request: GetCloudWorkspaceLinkRequest;
    response: CompanyCloudLinkStatus;
  };
  'cloud.linkWorkspace': {
    request: LinkCloudWorkspaceRequest;
    response: CompanyCloudLinkStatus;
  };
  'cloud.unlinkWorkspace': {
    request: UnlinkCloudWorkspaceRequest;
    response: CompanyCloudLinkStatus;
  };
  'cloud.reconnectWorkspace': {
    request: ReconnectCloudWorkspaceRequest;
    response: CompanyCloudLinkStatus;
  };
  'operators.listInvites': {
    request: ListOperatorInvitesRequest;
    response: OperatorInvite[];
  };
  'operators.createInvite': {
    request: CreateOperatorInviteRequest;
    response: CreateOperatorInviteResponse;
  };
  'operators.revokeInvite': {
    request: RevokeOperatorInviteRequest;
    response: OperatorInvite;
  };
  'operators.acceptInvite': {
    request: AcceptOperatorInviteRequest;
    response: AcceptOperatorInviteResponse;
  };
  'runtimeProfiles.list': {
    request: ListRuntimeProfilesRequest;
    response: RuntimeProfileSummary[];
  };
  'runtimeProfiles.create': {
    request: CreateRuntimeProfileRequest;
    response: { profileId: string };
  };
  'runtimeProfiles.update': {
    request: UpdateRuntimeProfileRequest;
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  'runtimeProfiles.delete': {
    request: DeleteRuntimeProfileRequest;
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  'runtimeProfiles.bindEmployee': {
    request: BindEmployeeRuntimeProfileRequest;
    response: { binding: EmployeeRuntimeBinding | null };
  };
  'runtimeProfiles.validate': {
    request: ValidateRuntimeProfileRequest;
    response: RuntimeProfileValidation;
  };
  'runtimeOperations.snapshot': {
    request: ListRuntimeOperationsRequest;
    response: RuntimeOperationsSnapshot;
  };
  'autonomyDoctor.run': {
    request: RunAutonomyDoctorRequest;
    response: AutonomyDoctorReport;
  };
  'autonomyBenchmark.run': {
    request: RunAutonomyBenchmarkRequest;
    response: AutonomyBenchmarkReport;
  };
  'agentImprovement.list': {
    request: ListAgentImprovementRequest;
    response: AgentImprovementSnapshot;
  };
  'agentImprovement.run': {
    request: RunAgentImprovementRequest;
    response: AgentImprovementRunResult;
  };
  'routines.list': {
    request: ListRoutinesRequest;
    response: Routine[];
  };
  'routines.create': {
    request: CreateRoutineRequest;
    response: { routineId: string };
  };
  'routines.update': {
    request: UpdateRoutineRequest;
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  'routines.delete': {
    request: DeleteRoutineRequest;
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  'routines.listRuns': {
    request: ListRoutineRunsRequest;
    response: RoutineRun[];
  };
  'routines.runNow': {
    request: RunRoutineNowRequest;
    response: RoutineRun;
  };
  'budgets.listPolicies': {
    request: ListBudgetPoliciesRequest;
    response: BudgetPolicy[];
  };
  'budgets.createPolicy': {
    request: CreateBudgetPolicyRequest;
    response: { policyId: string };
  };
  'budgets.updatePolicy': {
    request: UpdateBudgetPolicyRequest;
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  'budgets.deletePolicy': {
    request: DeleteBudgetPolicyRequest;
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  'budgets.listLedger': {
    request: ListBudgetLedgerEntriesRequest;
    response: BudgetLedgerEntry[];
  };
  'budgets.getOverview': {
    request: GetBudgetOverviewRequest;
    response: BudgetOverview;
  };
  'budgets.listApprovals': {
    request: ListApprovalItemsRequest;
    response: ApprovalItem[];
  };
  'approvals.list': {
    request: ListApprovalItemsRequest;
    response: ApprovalItem[];
  };
  'approvals.review': {
    request: ReviewApprovalItemRequest;
    response: { grantId: string | null };
  };
  'artifacts.list': {
    request: ListArtifactsRequest;
    response: ArtifactRecord[];
  };
  'memory.getThreadDigest': {
    request: GetThreadDigestRequest;
    response: ThreadDigest | null;
  };
  'memory.listRunCheckpoints': {
    request: ListRunCheckpointsRequest;
    response: RunCheckpoint[];
  };
  'memory.packThreadContext': {
    request: PackThreadContextRequest;
    response: PackedThreadContext;
  };
  'schedule.list': {
    request: ListScheduleItemsRequest;
    response: ScheduleItem[];
  };
  'schedule.create': {
    request: CreateScheduleItemRequest;
    response: CreateScheduleItemResponse;
  };
  'schedule.update': {
    request: UpdateScheduleItemRequest;
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  'schedule.complete': {
    request: CompleteScheduleItemRequest;
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  'schedule.delete': {
    request: DeleteScheduleItemRequest;
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  'employees.create': {
    request: HireEmployeeRequest;
    response: HireEmployeeResponse;
  };
  'employees.fire': {
    request: FireEmployeeRequest;
    // IpcContract-level response is intentionally `void` — the fire
    // handler returns nothing, matching every other write-path entry
    // in this contract (e.g. `mcp.toggle`, `tickets.close`).
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  'employees.update': {
    request: EmployeesUpdateRequest;
    response: EmployeesUpdateResponse;
  };
  // Org chart write-side channels (Phase 2 — M9; restored Phase 5.6 M-C step d
  // per audit rows 2.19 + 2.20). `promote` swaps the employee's role-pack
  // role; `setManager` upserts (or clears) the org-edge whose report side
  // is the employee. Both emit bus events per architectural invariant #11.
  'employees.promote': {
    request: EmployeesPromoteRequest;
    response: EmployeesPromoteResponse;
  };
  'employees.setManager': {
    request: EmployeesSetManagerRequest;
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  // Org chart channel (Phase 2 — M9; restored Phase 5.6 M-C step c per audit row 2.21)
  'orgchart.get': {
    request: OrgchartGetRequest;
    response: OrgchartGetResponse;
  };
  'chat.send': {
    request: SendChatRequest;
    response: SendChatResponse;
  };
  'chat.list': {
    request: ListChatRequest;
    response: ChatMessage[];
  };
  'chat.stop': {
    request: StopChatRequest;
    response: StopChatResponse;
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
  'mcp.listTemplates': {
    request: ListMcpTemplatesRequest;
    response: McpTemplateSummary[];
  };
  'mcp.toggle': {
    request: ToggleMcpServerRequest;
    response: undefined;
  };
  'mcp.addServer': {
    request: AddMcpServerRequest;
    response: { serverId: string };
  };
  'mcp.installTemplate': {
    request: InstallMcpTemplateRequest;
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
  'extensions.list': {
    request: ListExtensionsRequest;
    response: ExtensionSummary[];
  };
  'extensions.installLocalSkill': {
    request: InstallLocalSkillRequest;
    response: { extensionId: string };
  };
  'extensions.installGithubSkill': {
    request: InstallGithubSkillRequest;
    response: { extensionId: string };
  };
  'extensions.removeSkill': {
    request: RemoveSkillRequest;
    response: undefined;
  };
  'extensions.listSkillAssignments': {
    request: ListSkillAssignmentsRequest;
    response: SkillAssignment[];
  };
  'extensions.upsertSkillAssignment': {
    request: UpsertSkillAssignmentRequest;
    response: { assignmentId: string };
  };
  'extensions.deleteSkillAssignment': {
    request: DeleteSkillAssignmentRequest;
    response: undefined;
  };
  'authority.list': {
    request: ListAuthorityGrantsRequest;
    response: AuthorityGrant[];
  };
  'authority.listRequests': {
    request: ListAuthorityRequestsRequest;
    response: AuthorityRequest[];
  };
  'authority.create': {
    request: CreateAuthorityGrantRequest;
    response: { grantId: string };
  };
  'authority.delete': {
    request: DeleteAuthorityGrantRequest;
    response: undefined;
  };
  'authority.reviewRequest': {
    request: ReviewAuthorityRequestRequest;
    response: { grantId: string | null };
  };
  'authority.getEffective': {
    request: GetEffectiveAuthorityRequest;
    response: EffectiveAuthoritySnapshot;
  };
}
