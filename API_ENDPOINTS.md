# Team-X API Endpoints

**Version:** 2.0.3  
**Protocol:** Electron IPC (invoke/handle + event streaming)

## Overview

Team-X uses Electron's IPC (Inter-Process Communication) for all client-server messaging:

- **Request/Response**: `ipcRenderer.invoke(channel, args)` → `ipcMain.handle(channel, handler)`
- **Event Streaming**: One-way push from main → renderer via `webContents.send('events.dashboard', event)`

All channels are typed in `@team-x/shared-types/src/ipc.ts`.

## Request Channels

### System

| Channel | Request | Response |
|---------|---------|----------|
| `system.selectDirectory` | — | `{ canceled: boolean; folderPath: string \| null }` |

### Companies

| Channel | Request | Response |
|---------|---------|----------|
| `companies.list` | — | `Company[]` |
| `companies.create` | `CompaniesCreateRequest` | `{ companyId: string; agentEmployeeId: string; copilotEmployeeId: string }` |
| `companies.update` | `CompaniesUpdateRequest` | `Company` |
| `companies.delete` | `CompaniesDeleteRequest` | — |
| `companies.archive` | `{ companyId: string }` | — |
| `companies.exportPackage` | `ExportCompanyPackageRequest` | `{ exportPath: string; metadata: CompanyExportMetadata }` |
| `companies.previewImportPackage` | `PreviewCompanyPackageImportRequest` | `CompanyImportPreview` |
| `companies.importPackage` | `ImportCompanyPackageRequest` | `{ companyId: string; restoredSystemAgents: RestoredSystemAgents[] }` |
| `companies.listTemplates` | `ListCompanyTemplatesRequest` | `CompanyTemplate[]` |
| `companies.installTemplate` | `InstallCompanyTemplateRequest` | `{ companyId: string }` |

**Types:**
```typescript
interface CompaniesCreateRequest {
  name: string;
  slug?: string;
  icon?: string;
  theme?: 'dark' | 'light';
}

interface CompaniesUpdateRequest {
  companyId: string;
  name?: string;
  icon?: string;
  theme?: 'dark' | 'light';
  status?: 'running' | 'meeting' | 'paused';
}

interface CompaniesDeleteRequest {
  companyId: string;
}
```

### Employees

| Channel | Request | Response |
|---------|---------|----------|
| `employees.list` | `{ companyId: string }` | `Employee[]` |
| `employees.create` | `{ companyId: string; roleId: string; name: string }` | `Employee` |
| `employees.fire` | `{ employeeId: string }` | — |
| `employees.update` | `EmployeesUpdateRequest` | `Employee` |
| `employees.promote` | `EmployeesPromoteRequest` | `Employee` |
| `employees.setManager` | `EmployeesSetManagerRequest` | — |

**Types:**
```typescript
interface EmployeesUpdateRequest {
  employeeId: string;
  modelPref?: string;
  providerPref?: string;
  toolsAllowed?: string[];
  toolsDenied?: string[];
}

interface EmployeesPromoteRequest {
  employeeId: string;
  newRoleId: string;
  newTitle?: string;
  newLevel?: Level;
}

interface EmployeesSetManagerRequest {
  employeeId: string;
  managerId: string | null;  // null = remove manager
}
```

### Operators (Human Supervisors)

| Channel | Request | Response |
|---------|---------|----------|
| `operators.list` | `{ companyId: string }` | `Operator[]` |
| `operators.readiness` | `{ companyId: string }` | `OperatorReadiness` |
| `operators.listInvites` | `ListOperatorInvitesRequest` | `OperatorInvite[]` |
| `operators.createInvite` | `CreateOperatorInviteRequest` | `{ inviteId: string; inviteToken: string }` |
| `operators.revokeInvite` | `RevokeOperatorInviteRequest` | — |
| `operators.acceptInvite` | `AcceptOperatorInviteRequest` | `{ membershipId: string }` |

### Cloud Workspace Linkage

| Channel | Request | Response |
|---------|---------|----------|
| `cloud.getWorkspaceLink` | `GetCloudWorkspaceLinkRequest` | `CloudWorkspaceLink \| null` |
| `cloud.linkWorkspace` | `LinkCloudWorkspaceRequest` | `CloudWorkspaceLink` |
| `cloud.unlinkWorkspace` | `UnlinkCloudWorkspaceRequest` | — |
| `cloud.reconnectWorkspace` | `ReconnectCloudWorkspaceRequest` | `CloudWorkspaceLink` |

### Runtime Profiles

| Channel | Request | Response |
|---------|---------|----------|
| `runtimeProfiles.list` | `{ companyId: string }` | `RuntimeProfile[]` |
| `runtimeProfiles.create` | `CreateRuntimeProfileRequest` | `RuntimeProfile` |
| `runtimeProfiles.update` | `UpdateRuntimeProfileRequest` | `RuntimeProfile` |
| `runtimeProfiles.delete` | `{ profileId: string }` | — |
| `runtimeProfiles.bindEmployee` | `BindEmployeeRuntimeProfileRequest` | — |
| `runtimeProfiles.validate` | `ValidateRuntimeProfileRequest` | `ValidationResult` |

### Runtime Operations

| Channel | Request | Response |
|---------|---------|----------|
| `runtimeOperations.snapshot` | `{ companyId: string }` | `RuntimeSnapshot` |

### Autonomy Diagnostics

| Channel | Request | Response |
|---------|---------|----------|
| `autonomyDoctor.run` | `{ companyId: string }` | `AutonomyDoctorReport` |
| `autonomyBenchmark.run` | `RunAutonomyBenchmarkRequest` | `AutonomyBenchmarkReport` |
| `agentImprovement.list` | `{ companyId: string }` | `AgentImprovementSuggestion[]` |
| `agentImprovement.run` | `RunAgentImprovementRequest` | — |

### Routines (Recurring Work)

| Channel | Request | Response |
|---------|---------|----------|
| `routines.list` | `{ companyId: string }` | `Routine[]` |
| `routines.create` | `CreateRoutineRequest` | `Routine` |
| `routines.update` | `UpdateRoutineRequest` | `Routine` |
| `routines.delete` | `{ routineId: string }` | — |
| `routines.listRuns` | `ListRoutineRunsRequest` | `RoutineRun[]` |
| `routines.runNow` | `RunRoutineNowRequest` | `{ runId: string }` |

### Budget Governance

| Channel | Request | Response |
|---------|---------|----------|
| `budgets.listPolicies` | `ListBudgetPoliciesRequest` | `BudgetPolicy[]` |
| `budgets.createPolicy` | `CreateBudgetPolicyRequest` | `BudgetPolicy` |
| `budgets.updatePolicy` | `UpdateBudgetPolicyRequest` | `BudgetPolicy` |
| `budgets.deletePolicy` | `DeleteBudgetPolicyRequest` | — |
| `budgets.listLedger` | `ListBudgetLedgerEntriesRequest` | `BudgetLedgerEntry[]` |
| `budgets.getOverview` | `GetBudgetOverviewRequest` | `BudgetOverview` |
| `budgets.listApprovals` | `ListApprovalItemsRequest` | `ApprovalItem[]` |

### Approvals (Unified Inbox)

| Channel | Request | Response |
|---------|---------|----------|
| `approvals.list` | `ListApprovalItemsRequest` | `ApprovalItem[]` |
| `approvals.review` | `ReviewApprovalItemRequest` | — |

### Artifacts (Work Products)

| Channel | Request | Response |
|---------|---------|----------|
| `artifacts.list` | `ListArtifactsRequest` | `Artifact[]` |

### Memory & Context

| Channel | Request | Response |
|---------|---------|----------|
| `memory.getThreadDigest` | `GetThreadDigestRequest` | `ThreadDigest \| null` |
| `memory.listRunCheckpoints` | `ListRunCheckpointsRequest` | `RunCheckpoint[]` |
| `memory.packThreadContext` | `PackThreadContextRequest` | `PackedThreadContext` |

### Schedule (Calendar)

| Channel | Request | Response |
|---------|---------|----------|
| `schedule.list` | `ListScheduleItemsRequest` | `ScheduleItem[]` |
| `schedule.create` | `CreateScheduleItemRequest` | `ScheduleItem` |
| `schedule.update` | `UpdateScheduleItemRequest` | `ScheduleItem` |
| `schedule.complete` | `CompleteScheduleItemRequest` | — |
| `schedule.delete` | `DeleteScheduleItemRequest` | — |

### Chat & Threads

| Channel | Request | Response |
|---------|---------|----------|
| `chat.send` | `{ threadId: string; employeeId: string; content: string }` | `{ messageId: string }` |
| `chat.list` | `{ threadId: string }` | `Message[]` |
| `chat.stop` | `{ threadId: string }` | — |
| `chat.resolveThread` | `{ employeeId: string }` | `Thread` |
| `chat.listThreads` | `{ companyId: string }` | `Thread[]` |

### Events (Timeline)

| Channel | Request | Response |
|---------|---------|----------|
| `events.list` | `{ companyId: string; cursor?: number; limit?: number }` | `Event[]` |

### MCP (Model Context Protocol) Servers

| Channel | Request | Response |
|---------|---------|----------|
| `mcp.list` | `{ companyId: string }` | `McpServer[]` |
| `mcp.listTemplates` | `{ companyId: string }` | `McpTemplate[]` |
| `mcp.toggle` | `{ serverId: string; enabled: boolean }` | — |
| `mcp.addServer` | `{ companyId: string \| null; name: string; transport: 'stdio' \| 'sse'; configJson: string }` | `McpServer` |
| `mcp.installTemplate` | `{ companyId: string; templateId: string }` | — |
| `mcp.removeServer` | `{ serverId: string }` | — |
| `mcp.testConnection` | `{ transport: 'stdio' \| 'sse'; configJson: string }` | `{ success: boolean; error?: string }` |

### Extensions (Skills & MCP Bridge)

| Channel | Request | Response |
|---------|---------|----------|
| `extensions.list` | `{ companyId: string }` | `Extension[]` |
| `extensions.installLocalSkill` | `{ companyId: string; folderPath: string }` | `{ extensionId: string }` |
| `extensions.installGithubSkill` | `{ companyId: string; sourceUrl: string }` | `{ extensionId: string }` |
| `extensions.removeSkill` | `{ companyId: string; extensionId: string }` | — |
| `extensions.listSkillAssignments` | `{ companyId: string }` | `SkillAssignment[]` |
| `extensions.upsertSkillAssignment` | `{ companyId: string; extensionId: string; employeeId?: string \| null; enabled: boolean }` | `SkillAssignment` |
| `extensions.deleteSkillAssignment` | `{ assignmentId: string }` | — |

### Authority (Capability & Path Grants)

| Channel | Request | Response |
|---------|---------|----------|
| `authority.list` | `{ companyId: string; employeeId?: string \| null }` | `AuthorityGrant[]` |
| `authority.listRequests` | `ListAuthorityRequestsRequest` | `AuthorityRequest[]` |
| `authority.create` | `CreateAuthorityGrantRequest` | `AuthorityGrant` |
| `authority.delete` | `{ grantId: string }` | — |
| `authority.reviewRequest` | `ReviewAuthorityRequestRequest` | — |
| `authority.getEffective` | `GetEffectiveAuthorityRequest` | `EffectiveAuthority` |

### Goals

| Channel | Request | Response |
|---------|---------|----------|
| `goals.create` | `{ companyId: string; title: string; description?: string; targetDate?: number \| null }` | `Goal` |
| `goals.update` | `{ goalId: string; title?: string; description?: string; status?: string; progressPct?: number; targetDate?: number \| null }` | `Goal` |
| `goals.list` | `{ companyId: string }` | `Goal[]` |
| `goals.get` | `{ goalId: string }` | `Goal` |
| `goals.delete` | `{ goalId: string }` | — |

### Projects

| Channel | Request | Response |
|---------|---------|----------|
| `projects.create` | `{ companyId: string; goalId?: string \| null; title: string; description?: string; leadId?: string \| null; priority?: string; targetDate?: number \| null }` | `Project` |
| `projects.update` | `{ projectId: string; title?: string; description?: string; status?: string; goalId?: string \| null; leadId?: string \| null; priority?: string; targetDate?: number \| null }` | `Project` |
| `projects.list` | `{ companyId: string }` | `Project[]` |
| `projects.get` | `{ projectId: string }` | `Project` |
| `projects.delete` | `{ projectId: string }` | — |
| `projects.linkTicket` | `{ projectId: string; ticketId: string }` | — |
| `projects.unlinkTicket` | `{ projectId: string; ticketId: string }` | — |

### Meetings

| Channel | Request | Response |
|---------|---------|----------|
| `meetings.call` | `{ companyId: string; chairId: string; attendeeIds: string[]; agenda: string; mode?: MeetingMode }` | `Meeting` |
| `meetings.end` | `{ meetingId: string }` | — |
| `meetings.interject` | `{ meetingId: string; content: string }` | — |
| `meetings.list` | `{ companyId: string }` | `Meeting[]` |
| `meetings.get` | `{ meetingId: string }` | `Meeting` |

**Types:**
```typescript
type MeetingMode = 'round-robin' | 'chair-directed' | 'freeform';
```

### Telemetry

| Channel | Request | Response |
|---------|---------|----------|
| `telemetry.companyStats` | `{ companyId: string }` | `CompanyStats` |
| `telemetry.dailyUsage` | `{ companyId: string; fromMs: number; toMs: number }` | `DailyUsagePoint[]` |
| `telemetry.employeeStats` | `{ companyId: string }` | `EmployeeStats[]` |
| `telemetry.recentRuns` | `TelemetryRecentRunsRequest` | `Run[]` |
| `telemetry.costBreakdown` | `{ companyId: string; fromMs?: number; toMs?: number }` | `CostBreakdown` |

### Settings

| Channel | Request | Response |
|---------|---------|----------|
| `settings.getRuntime` | — | `RuntimeStrategy` |
| `settings.setRuntime` | `{ strategy: RuntimeStrategy }` | — |
| `settings.getPrivacy` | — | `PrivacyTier` |
| `settings.setPrivacy` | `{ maxTier: PrivacyTier }` | — |
| `settings.getConcurrency` | — | `ConcurrencySettings` |
| `settings.setConcurrency` | `{ orchestratorSlots?: number; providerCaps?: Record<string, number> }` | — |
| `settings.getExtensions` | — | `ExtensionsSettings` |
| `settings.setExtensions` | `ExtensionsSettings` | — |
| `settings.getMemory` | — | `MemorySettings` |
| `settings.setMemory` | `MemorySettings` | — |
| `settings.getRagConfig` | — | `RagConfig` |
| `settings.setRagConfig` | `RagConfig` | — |
| `settings.getAgentic` | — | `AgenticSettings` |
| `settings.setAgentic` | `AgenticSettings` | — |
| `settings.getPlanner` | — | `PlannerSettings` |
| `settings.setPlanner` | `PlannerSettings` | — |
| `settings.getCopilot` | — | `CopilotSettings` |
| `settings.setCopilot` | `CopilotSettings` | — |
| `settings.getCopilotWeights` | `GetCopilotWeightsRequest` | `CopilotWeights` |
| `settings.setCopilotWeights` | `CopilotWeights` | — |
| `settings.getProactive` | — | `ProactiveSettings` |
| `settings.setProactive` | `ProactiveSettings` | — |

### Providers (AI Models)

| Channel | Request | Response |
|---------|---------|----------|
| `providers.list` | — | `Provider[]` |
| `providers.add` | `{ name: string; kind: string; privacyTier: string; configJson?: string; apiKey?: string }` | `Provider` |
| `providers.update` | `{ providerId: string; name?: string; enabled?: boolean; configJson?: string; apiKey?: string }` | `Provider` |
| `providers.remove` | `{ providerId: string }` | — |
| `providers.testConnection` | `{ providerId: string }` | `{ success: boolean; error?: string }` |
| `providers.listModels` | `{ providerId: string }` | `string[]` |

### Vault (File Storage)

| Channel | Request | Response |
|---------|---------|----------|
| `vault.upload` | `{ companyId: string; sourcePath: string; tags?: string[] }` | `FileVault` |
| `vault.download` | `{ fileId: string }` | `{ localPath: string }` |
| `vault.list` | `{ companyId: string }` | `FileVault[]` |
| `vault.search` | `{ companyId: string; query: string }` | `FileVaultRanked[]` |
| `vault.delete` | `{ fileId: string }` | — |
| `vault.verify` | `{ fileId: string }` | `{ valid: boolean; expectedSha256: string; actualSha256?: string }` |
| `vault.stats` | `{ companyId: string }` | `{ count: number; totalBytes: number }` |

### Proactive Execution

| Channel | Request | Response |
|---------|---------|----------|
| `proactive.setEnabled` | `{ companyId: string; enabled: boolean }` | — |
| `proactive.decomposeGoal` | `{ companyId: string; goalId: string }` | — |
| `proactive.scanForWork` | `{ companyId: string }` | — |
| `proactive.getState` | `{ companyId: string }` | `ProactiveState` |

### Tickets

| Channel | Request | Response |
|---------|---------|----------|
| `tickets.create` | `{ companyId: string; title: string; description?: string; priority?: string; assigneeId?: string; labelsJson?: string; slaHours?: number; dueAt?: number }` | `Ticket` |
| `tickets.update` | `{ ticketId: string; title?: string; description?: string; priority?: string; status?: string; labelsJson?: string; slaHours?: number \| null; dueAt?: number \| null }` | `Ticket` |
| `tickets.assign` | `{ ticketId: string; assigneeId: string }` | — |
| `tickets.addParticipant` | `{ ticketId: string; employeeId: string }` | — |
| `tickets.removeParticipant` | `{ ticketId: string; employeeId: string }` | — |
| `tickets.close` | `{ ticketId: string }` | — |
| `tickets.reopen` | `{ ticketId: string }` | — |
| `tickets.addComment` | `{ ticketId: string; content: string }` | `Message` |
| `tickets.list` | `{ companyId: string }` | `Ticket[]` |
| `tickets.get` | `{ ticketId: string }` | `Ticket` |
| `tickets.attachFile` | `{ ticketId: string; fileId: string }` | — |
| `tickets.detachFile` | `{ ticketId: string; fileId: string }` | — |
| `tickets.listAttachments` | `{ ticketId: string }` | `TicketAttachment[]` |

### Backup & Restore

| Channel | Request | Response |
|---------|---------|----------|
| `backup.create` | `{ destination?: string }` | `{ backupPath: string }` |
| `backup.restore` | `{ backupPath: string }` | — |
| `backup.list` | — | `BackupInfo[]` |

### Audit Log

| Channel | Request | Response |
|---------|---------|----------|
| `audit.list` | `{ companyId: string; eventTypes?: string[]; actorId?: string; fromMs?: number; toMs?: number; limit?: number; offset?: number }` | `AuditEvent[]` |
| `audit.stats` | `{ companyId: string }` | `AuditStats` |
| `audit.export` | `{ filter: { companyId: string; eventTypes?: string[]; actorId?: string; fromMs?: number; toMs?: number }; format: 'csv' \| 'json' }` | `{ exportPath: string }` |

### Copilot (Proactive Insights)

| Channel | Request | Response |
|---------|---------|----------|
| `copilot.insights` | `CopilotInsightListArgs` | `CopilotInsight[]` |
| `copilot.dismiss` | `CopilotDismissArgs` | — |
| `copilot.ask` | `CopilotAskArgs` | `{ runId: string; threadId: string }` |
| `copilot.configure` | `CopilotConfigureArgs` | — |
| `copilot.export` | `CopilotExportRequest` | `{ exportPath: string; count: number }` |

### RAG (Retrieval-Augmented Generation)

| Channel | Request | Response |
|---------|---------|----------|
| `rag.stats` | `companyId: string` | `{ totalEmbeddings: number; indexedSources: RAGIndexedSource[] }` |
| `rag.rebuildAll` | `companyId: string` | `{ scheduled: number }` |
| `rag.deleteForCompany` | `companyId: string` | `{ deleted: number }` |

### Command Palette (Cmd+K)

| Channel | Request | Response |
|---------|---------|----------|
| `command.parse` | `CommandParseRequest` | `CommandParseResult` |
| `command.execute` | `IpcExecuteRequest` | `ExecuteResult` |
| `command.history` | `CommandHistoryRequest` | `CommandHistoryEntry[]` |
| `command.suggest` | `CommandSuggestRequest` | `string[]` |
| `command.stop` | `CommandStopRequest` | — |
| `command.getRunSnapshot` | `{ runId: string }` | `AgenticLoopSnapshot \| null` |

### Updater

| Channel | Request | Response |
|---------|---------|----------|
| `updater.check` | — | `{ updateAvailable: boolean; version?: string; releaseNotes?: string }` |
| `updater.install` | — | — |

### Org Chart

| Channel | Request | Response |
|---------|---------|----------|
| `orgchart.get` | `{ companyId: string }` | `OrgChartProjection` |

## Event Channel

### `events.dashboard`

One-way push from main process to all renderer windows. Subscribed via `preload` bridge.

**Event Types:**
```typescript
type DashboardEvent =
  | { type: 'work.started'; companyId: string; actorId: string; payload: { threadId: string; employeeId: string } }
  | { type: 'work.progress'; companyId: string; actorId: string; payload: { threadId: string; delta: string } }
  | { type: 'work.completed'; companyId: string; actorId: string; payload: { threadId: string; employeeId: string; runId: string } }
  | { type: 'work.failed'; companyId: string; actorId: string; payload: { threadId: string; employeeId: string; error: string } }
  | { type: 'employee.created'; companyId: string; actorId: string; payload: Employee }
  | { type: 'employee.fired'; companyId: string; actorId: string; payload: { employeeId: string } }
  | { type: 'employee.promoted'; companyId: string; actorId: string; payload: Employee }
  | { type: 'ticket.created'; companyId: string; actorId: string; payload: Ticket }
  | { type: 'ticket.assigned'; companyId: string; actorId: string; payload: { ticketId: string; assigneeId: string } }
  | { type: 'ticket.closed'; companyId: string; actorId: string; payload: { ticketId: string } }
  | { type: 'company.created'; companyId: string; actorId: string; payload: Company }
  | { type: 'company.updated'; companyId: string; actorId: string; payload: Company }
  | { type: 'company.deleted'; companyId: string; actorId: string; payload: { companyId: string } }
  | { type: 'meeting.started'; companyId: string; actorId: string; payload: { meetingId: string } }
  | { type: 'meeting.ended'; companyId: string; actorId: string; payload: { meetingId: string; minutesMd: string } }
  | { type: 'copilot.insight'; companyId: string; actorId: string; payload: CopilotInsight }
  | { type: 'copilot.analyzed'; companyId: string; actorId: string; payload: { runId: string } }
  | { type: 'copilot.expired'; companyId: string; actorId: string; payload: { count: number } }
  | { type: 'agentic.failed-budget_exhausted'; companyId: string; actorId: string; payload: { runId: string; budgetPolicyId: string } }
  // ... many more event types
```

## Usage Examples

### Renderer (React)

```typescript
import { invoke } from '@/lib/ipc';

// Request/response
const companies = await invoke('companies.list');

// Event subscription
useEffect(() => {
  const unsubscribe = window.events.onDashboard((event) => {
    if (event.type === 'work.started') {
      console.log('Agent started working:', event.payload.employeeId);
    }
  });
  return unsubscribe;
}, []);
```

### Preload (ContextBridge)

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('events', {
  onDashboard: (callback) => {
    const listener = (_event, args) => callback(args);
    ipcRenderer.on('events.dashboard', listener);
    return () => ipcRenderer.removeListener('events.dashboard', listener);
  },
});

contextBridge.exposeInMainWorld('invoke', (channel, args) => {
  return ipcRenderer.invoke(channel, args);
});
```

### Main (Handler)

```typescript
import { ipcMain } from 'electron';

ipcMain.handle('companies.list', async () => {
  return companiesRepo.list();
});

const bus = createEventBus({ repo: eventsRepo });
bus.subscribe((event) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('events.dashboard', event);
    }
  }
});
```

## Error Handling

All IPC handlers can throw errors. The renderer should catch and display:

```typescript
try {
  const result = await invoke('companies.create', { name: 'Acme Corp' });
} catch (error) {
  // error.message is propagated from main process
  showToast({ type: 'error', message: error.message });
}
```

Common error types:
- `ValidationError` — Invalid request data
- `NotFoundError` — Resource not found
- `ConflictError` — Resource already exists
- `AuthorizationError` — Insufficient permissions
- `ProviderError` — AI provider failure

---

*This documentation is auto-generated by the project-docs skill. Last updated: 2026-05-03*
