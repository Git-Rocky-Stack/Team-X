/**
 * Boot phase 5a — the repository layer.
 *
 * Every `createXRepo` factory is pure: it takes the drizzle handle and
 * returns a repo. The two read services built in between (authority
 * resolver, extensions registry) are just as pure — they only close over the
 * repos above them — so this whole phase is construction, no I/O.
 */

import type { PrivacyTier } from '@team-x/shared-types';

import type { TeamXDb } from '../db/client.js';
import { createArtifactsRepo } from '../db/repos/artifacts.js';
import { createAuditRepo } from '../db/repos/audit.js';
import { createBudgetsRepo } from '../db/repos/budgets.js';
import { createCommandHistoryRepo } from '../db/repos/command-history.js';
import { createCompaniesRepo } from '../db/repos/companies.js';
import { createCopilotInsightsRepo } from '../db/repos/copilot-insights.js';
import { createEmbeddingsRepo } from '../db/repos/embeddings.js';
import { createEmployeesRepo } from '../db/repos/employees.js';
import { createEventsRepo } from '../db/repos/events.js';
import {
  createAuthorityRepo,
  createExtensionsRepo,
  createSkillAssignmentsRepo,
} from '../db/repos/extensions.js';
import { createGoalsRepo } from '../db/repos/goals.js';
import { createMcpServersRepo, createToolCallsRepo } from '../db/repos/mcp-servers.js';
import { createMeetingsRepo } from '../db/repos/meetings.js';
import { createMessagesRepo } from '../db/repos/messages.js';
import { createOperatorsRepo } from '../db/repos/operators.js';
import { createOrgEdgesRepo } from '../db/repos/orgchart.js';
import { createProjectsRepo } from '../db/repos/projects.js';
import { createRoutinesRepo } from '../db/repos/routines.js';
import { createRunCheckpointsRepo } from '../db/repos/run-checkpoints.js';
import { createRunsRepo } from '../db/repos/runs.js';
import { createRuntimeProfilesRepo } from '../db/repos/runtime-profiles.js';
import { createRuntimeSessionsRepo } from '../db/repos/runtime-sessions.js';
import { createScheduleItemsRepo } from '../db/repos/schedule-items.js';
import { createSettingsRepo } from '../db/repos/settings.js';
import { createThreadDigestsRepo } from '../db/repos/thread-digests.js';
import { createThreadsRepo } from '../db/repos/threads.js';
import { createTicketAttachmentsRepo } from '../db/repos/ticket-attachments.js';
import { createTicketCheckoutsRepo } from '../db/repos/ticket-checkouts.js';
import { createVaultRepo } from '../db/repos/vault.js';
import { createAuthorityResolverService } from '../services/authority-resolver-service.js';
import { createExtensionsRegistryService } from '../services/extensions-registry-service.js';

export type Repositories = ReturnType<typeof createRepositories>;

export function createRepositories(db: TeamXDb) {
  const companiesRepo = createCompaniesRepo(db);
  const employeesRepo = createEmployeesRepo(db);
  const operatorsRepo = createOperatorsRepo(db);
  const runtimeProfilesRepo = createRuntimeProfilesRepo(db);
  const runtimeSessionsRepo = createRuntimeSessionsRepo(db);
  const ticketCheckoutsRepo = createTicketCheckoutsRepo(db);
  const routinesRepo = createRoutinesRepo(db);
  const budgetsRepo = createBudgetsRepo(db);
  const threadsRepo = createThreadsRepo(db);
  const messagesRepo = createMessagesRepo(db);
  const runsRepo = createRunsRepo(db);
  const eventsRepo = createEventsRepo(db);
  const auditRepo = createAuditRepo(db);
  const artifactsRepo = createArtifactsRepo(db);
  const mcpServersRepo = createMcpServersRepo(db);
  const extensionsRepo = createExtensionsRepo(db);
  const skillAssignmentsRepo = createSkillAssignmentsRepo(db);
  const authorityRepo = createAuthorityRepo(db);
  const authorityResolver = createAuthorityResolverService({
    employeesRepo,
    authorityRepo,
  });
  const extensionsRegistry = createExtensionsRegistryService({
    extensionsRepo,
    mcpServersRepo,
  });
  const toolCallsRepo = createToolCallsRepo(db);
  const goalsRepo = createGoalsRepo(db);
  const projectsRepo = createProjectsRepo(db);
  const scheduleItemsRepo = createScheduleItemsRepo(db);
  const meetingsRepo = createMeetingsRepo(db);
  // Phase 5.6 M-C step c — restores Cluster B (M9 org chart) per audit
  // row 2.21. Backs `orgchart.get` IPC + the forthcoming
  // `employees.promote` / `employees.setManager` IPCs in step d.
  const orgEdgesRepo = createOrgEdgesRepo(db);
  const vaultRepo = createVaultRepo(db);
  const ticketAttachmentsRepo = createTicketAttachmentsRepo(db);
  const settingsRepo = createSettingsRepo(db);
  // Settings → Privacy, read on every provider resolution and embedding
  // call so a change applies to the next call. Every provider factory and
  // embedding adapter built in the later boot phases (provider routing,
  // RAG, Enhanced AI) must receive it — one that does not fails open
  // and can reach a cloud provider under "Local Only"
  // (composition-root-wiring.test.ts pins each site).
  const getMaxPrivacyTier = (): PrivacyTier =>
    settingsRepo.get<PrivacyTier>('max_privacy_tier', 'proprietary-cloud');
  const threadDigestsRepo = createThreadDigestsRepo(db);
  const runCheckpointsRepo = createRunCheckpointsRepo(db);
  const embeddingsRepo = createEmbeddingsRepo(db);
  const commandHistoryRepo = createCommandHistoryRepo(db);
  // M33 T4 — copilot-insights repo consumed by the CopilotAnalyzerService
  // (boot/copilot.ts). Methods: create/getById/listActive/dismiss/expireStale/
  // upsertWithDedup/listStale (the last one is the T4 addition; see
  // copilot-insights.ts §listStale comment block for rationale).
  const copilotInsightsRepo = createCopilotInsightsRepo(db);

  return {
    companiesRepo,
    employeesRepo,
    operatorsRepo,
    runtimeProfilesRepo,
    runtimeSessionsRepo,
    ticketCheckoutsRepo,
    routinesRepo,
    budgetsRepo,
    threadsRepo,
    messagesRepo,
    runsRepo,
    eventsRepo,
    auditRepo,
    artifactsRepo,
    mcpServersRepo,
    extensionsRepo,
    skillAssignmentsRepo,
    authorityRepo,
    authorityResolver,
    extensionsRegistry,
    toolCallsRepo,
    goalsRepo,
    projectsRepo,
    scheduleItemsRepo,
    meetingsRepo,
    orgEdgesRepo,
    vaultRepo,
    ticketAttachmentsRepo,
    settingsRepo,
    getMaxPrivacyTier,
    threadDigestsRepo,
    runCheckpointsRepo,
    embeddingsRepo,
    commandHistoryRepo,
    copilotInsightsRepo,
  };
}
