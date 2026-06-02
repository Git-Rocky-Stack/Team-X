/**
 * Electron main process entry point.
 *
 * Boot order — the userData profile is pinned before `app.whenReady()`;
 * every service boot step then happens inside `app.whenReady()` so the
 * Electron app and keychain are available before any service touches them:
 *
 *   1. Open + migrate the SQLite database.
 *   2. Seed the hardcoded Phase 1 company + employees on first boot.
 *   3. Seed the default providers (`ollama-local`, `anthropic`).
 *   4. Dev-only: import ANTHROPIC_API_KEY from `.env` into keytar.
 *   5. Build all the per-process services + the orchestrator and wire
 *      them into the IPC handler layer.
 *   6. Open the BrowserWindow.
 *
 * Steps 1-4 already existed before T33; the orchestrator + IPC wiring
 * (step 5) is what this task adds. T36 will revisit the wiring to read
 * concurrency caps + provider preferences from a settings table; the
 * Phase 1 wiring here uses sensible hardcoded defaults so the demo
 * loop works end-to-end as soon as the renderer (M5) lands.
 *
 * Why everything is constructed locally rather than via module-level
 * singletons:
 *
 *   The repo factories (`createXRepo`), the orchestrator builder, the
 *   role loader, and the IPC handler factory are all pure. They take
 *   their dependencies as arguments. Constructing them inline here
 *   keeps the wiring graph visible at one glance — there is no
 *   "where does this come from?" hunt across files — and it means a
 *   future test that wants to boot the main process against an
 *   in-memory DB only has to mock `getDb()`.
 *
 * Shutdown path (`will-quit`):
 *
 *   1. Best-effort `orchestrator.shutdown()` (drains in-flight turns).
 *   2. `unregisterIpc()` (removes ipcMain handlers + bus subscription).
 *   3. `closeDb()` (releases the SQLite handle).
 *
 *   We swallow shutdown-time errors with `console.error` rather than
 *   re-throwing so a stuck orchestrator can never block the process
 *   from exiting and stranding the user.
 */

import {
  access as fsAccess,
  open as fsOpen,
  readdir as fsReaddir,
  stat as fsStat,
} from 'node:fs/promises';
import { join } from 'node:path';

import {
  type LoopCompleteFn,
  type LoopMessage,
  type LoopProviderCompletion,
  type LoopProviderToolCall,
  type RagRepo,
  type RagService,
  createEntityResolver,
  createIntentClassifier,
  createMockCrossEncoder,
  createQueryExpansionService,
  createRagService,
  createRerankerService,
  createSlotFiller,
} from '@team-x/intelligence';
import {
  type StreamContentPart,
  type StreamMessage,
  type ToolSpec,
  buildProviderTools,
  createEmbedText,
} from '@team-x/provider-router';
import { streamAgent } from '@team-x/provider-router';
import type {
  AdvancedParams,
  EmbeddingSourceType,
  Employee,
  LocalModel,
  Meeting,
  RuntimeStrategy,
  Ticket,
} from '@team-x/shared-types';
import {
  CONCURRENCY_SETTINGS_CLAMPS,
  DEFAULT_CONCURRENCY_CAPS,
  SYSTEM_AGENT_ROLE_ID,
  SYSTEM_COPILOT_ROLE_ID,
} from '@team-x/shared-types';
import { calcCostUsd } from '@team-x/telemetry-core';
import { eq } from 'drizzle-orm';
import { BrowserWindow, app, dialog, ipcMain } from 'electron';

import { configureStableUserDataPath } from './app-user-data.js';
import { closeDb, getDb, initDb } from './db/client.js';
import { initFts5 } from './db/fts5-init.js';
import { runMigrations } from './db/migrate.js';
import { dbPath, userDataDir } from './db/paths.js';
import { createAgentWakeupRequestsRepo } from './db/repos/agent-wakeup-requests.js';
import { createArtifactsRepo } from './db/repos/artifacts.js';
import { createAuditRepo } from './db/repos/audit.js';
import { createBudgetsRepo } from './db/repos/budgets.js';
import { createCommandHistoryRepo } from './db/repos/command-history.js';
import { createCompaniesRepo } from './db/repos/companies.js';
import { createCopilotInsightsRepo } from './db/repos/copilot-insights.js';
import { createEmbeddingsRepo } from './db/repos/embeddings.js';
import { createEmployeesRepo } from './db/repos/employees.js';
import { createEventsRepo } from './db/repos/events.js';
import {
  createAuthorityRepo,
  createExtensionsRepo,
  createSkillAssignmentsRepo,
} from './db/repos/extensions.js';
import { createGoalsRepo } from './db/repos/goals.js';
import { createLocalModelAdvancedParamsRepo } from './db/repos/local-model-advanced-params.js';
import { createLocalModelWatchFoldersRepo } from './db/repos/local-model-watch-folders.js';
import { createLocalModelsRepo } from './db/repos/local-models.js';
import {
  createMcpServersRepo,
  createToolCallsRepo,
  seedDefaultMcpServers,
} from './db/repos/mcp-servers.js';
import { createMeetingsRepo } from './db/repos/meetings.js';
import { createMessagesRepo } from './db/repos/messages.js';
import { createOperatorsRepo } from './db/repos/operators.js';
import { createOrgEdgesRepo } from './db/repos/orgchart.js';
import { createPendingDelegationsRepo } from './db/repos/pending-delegations.js';
import { createProjectsRepo } from './db/repos/projects.js';
import { createRoutinesRepo } from './db/repos/routines.js';
import { createRunCheckpointsRepo } from './db/repos/run-checkpoints.js';
import { createRunsRepo } from './db/repos/runs.js';
import {
  type RuntimeProfilesRepo,
  createRuntimeProfilesRepo,
} from './db/repos/runtime-profiles.js';
import { createRuntimeSessionsRepo } from './db/repos/runtime-sessions.js';
import { createScheduleItemsRepo } from './db/repos/schedule-items.js';
import { createSettingsRepo } from './db/repos/settings.js';
import { createThreadDigestsRepo } from './db/repos/thread-digests.js';
import { createThreadsRepo } from './db/repos/threads.js';
import { createTicketAttachmentsRepo } from './db/repos/ticket-attachments.js';
import { createTicketCheckoutsRepo } from './db/repos/ticket-checkouts.js';
import { createTicketsRepo } from './db/repos/tickets.js';
import { createVaultRepo } from './db/repos/vault.js';
import { messages as messagesTable } from './db/schema.js';
import { seed } from './db/seed.js';
import { buildCommandHandlers } from './ipc/command-handlers.js';
import { buildCopilotHandlers } from './ipc/copilot-handlers.js';
import { buildEnhancedAiHandlers } from './ipc/enhanced-ai-handlers.js';
import { HUMAN_USER_ID, createIpcHandlers } from './ipc/handlers.js';
import { registerLocalGgufBenchmarkHandlers } from './ipc/local-gguf-benchmark-handlers.js';
import { registerLocalGgufEndpointHandlers } from './ipc/local-gguf-endpoint-handlers.js';
import { registerLocalGgufHfHandlers } from './ipc/local-gguf-hf-handlers.js';
import { registerLocalGgufLibraryHandlers } from './ipc/local-gguf-library-handlers.js';
import { registerLocalGgufRuntimeHandlers } from './ipc/local-gguf-runtime-handlers.js';
import { buildRagHandlers } from './ipc/rag-handlers.js';
import { registerIpcHandlers } from './ipc/register.js';
import { setupApplicationMenu } from './menu.js';
import { createAgentWakeupQueue } from './orchestrator/agent-wakeup-queue.js';
import { createEventBus } from './orchestrator/event-bus.js';
import { createHeartbeatService } from './orchestrator/heartbeat-service.js';
import {
  type Orchestrator,
  type ResolveProvider,
  type ResolveTools,
  buildOrchestrator,
} from './orchestrator/index.js';
import { createMeetingService } from './orchestrator/meeting-service.js';
import type { CostCalculator } from './orchestrator/run-agent.js';
import { createAgentImprovementService } from './services/agent-improvement-service.js';
import {
  type AgenticLoopService,
  createAgenticLoopService,
} from './services/agentic-loop-service.js';
import { buildCopilotToolRegistry } from './services/agentic-tools-copilot.js';
import {
  type WriteSideCompleteFn,
  type WriteSideOrchestrator,
  type WriteSideWorkloadProvider,
  buildWriteSideTools,
} from './services/agentic-tools-write.js';
import { createAgenticTools } from './services/agentic-tools.js';
import { createApprovalInboxService } from './services/approval-inbox-service.js';
import { createArtifactService } from './services/artifact-service.js';
import { createAuthorityResolverService } from './services/authority-resolver-service.js';
import { createInMemoryAutonomyBenchmarkScenarioContext } from './services/autonomy-benchmark-memory-context.js';
import { createAutonomyBenchmarkService } from './services/autonomy-benchmark-service.js';
import { createAutonomyDoctorService } from './services/autonomy-doctor-service.js';
import { createBackupService } from './services/backup.js';
import { createBudgetGovernanceService } from './services/budget-governance-service.js';
import { buildChatActionTools } from './services/chat-action-tools.js';
import { createCloudLinkService } from './services/cloud-link-service.js';
import { type CommandService, createCommandService } from './services/command-service.js';
import { createCompanyPortabilityService } from './services/company-portability-service.js';
import { createContextAssemblerService } from './services/context-assembler-service.js';
import { createContextPackerService } from './services/context-packer-service.js';
import {
  type CopilotAnalyzerCompleteFn,
  type CopilotAnalyzerService,
  createCopilotAnalyzerService,
} from './services/copilot-analyzer-service.js';
import {
  type CopilotEventTrigger,
  createCopilotEventTrigger,
} from './services/copilot-event-trigger.js';
import { createCopilotEventWindow } from './services/copilot-event-window.js';
import type { CopilotEventWindow } from './services/copilot-event-window.js';
import { createCopilotService } from './services/copilot-service.js';
import { type EnhancedAiService, createEnhancedAiService } from './services/enhanced-ai.js';
import { bootstrapEnvKeys } from './services/env-key-bootstrap.js';
import { createExtensionsRegistryService } from './services/extensions-registry-service.js';
import { createExternalRuntimeAdapters } from './services/external-runtime-adapters.js';
import {
  type LibraryFs,
  type LibraryService,
  createLibraryService,
} from './services/local-gguf/library-service.js';
import { type PoolService, createPoolService } from './services/local-gguf/pool-service.js';
import {
  type RuntimeService,
  createRuntimeService,
} from './services/local-gguf/runtime-service.js';
import { type McpHost, createMcpHost } from './services/mcp-host.js';
import {
  createFileAllowlist,
  defaultAllowlistPath as mcpDefaultAllowlistPath,
} from './services/mcp-security.js';
import { createOperatorAccessService } from './services/operator-access-service.js';
import {
  type ProactiveTriggerService,
  createProactiveTriggerService,
} from './services/proactive-trigger-service.js';
import { detectHardware } from './services/profiler.js';
import {
  buildEmbedAdapter,
  createProviderFactory,
  createTestModeResolveProvider,
  isTestMode,
  makeFakeEmbedAdapter,
} from './services/provider-factory.js';
import { getProvidersService, seedDefaultProviders } from './services/providers.js';
import { createRagIndexer } from './services/rag-indexer.js';
import { rebuildCompanyRagSources } from './services/rag-rebuild.js';
import { createRetrievalOrchestrator } from './services/retrieval-orchestrator.js';
import { createRoleLoader } from './services/role-loader.js';
import {
  type RoutineService,
  type RoutineServiceCreateTicketInput,
  createRoutineService,
} from './services/routine-service.js';
import { createRunCheckpointService } from './services/run-checkpoint-service.js';
import { createRuntimeAuditNormalizer } from './services/runtime-audit-normalizer-service.js';
import { createRuntimeOperationsService } from './services/runtime-operations-service.js';
import { createRuntimeProfileProviderService } from './services/runtime-profile-provider-service.js';
import { createRuntimeProfilesService } from './services/runtime-profiles-service.js';
import { createRuntimeSessionService } from './services/runtime-session-service.js';
import {
  type LocalGgufSettingsStore,
  createLocalGgufSettingsAccessor,
} from './services/runtime-settings/local-gguf-settings.js';
import { pickStrategy } from './services/runtime-strategy.js';
import { SecretsStore } from './services/secrets.js';
import { createSkillsService } from './services/skills-service.js';
import { ensureSystemAgent, ensureSystemCopilot } from './services/system-agent-bootstrap.js';
import { appendExecutionPolicy } from './services/system-prompt.js';
import { createTestAgenticCompleteFn } from './services/test-agentic-provider.js';
import { createTestToolsForEmployee } from './services/test-agentic-tools.js';
import { createTestClassifier } from './services/test-classifier.js';
import { createTestCopilotComplete } from './services/test-copilot-provider.js';
import { createThreadDigestService } from './services/thread-digest-service.js';
import { createUpdaterService } from './services/updater.js';
import { createVaultService } from './services/vault.js';
import { attachSpellcheckContextMenu } from './spellcheck-context-menu.js';

function ensureWindowsProcessEnvironment(): void {
  if (process.platform !== 'win32') return;
  const userProfile = process.env.USERPROFILE ?? 'C:\\Users\\User';
  const defaults: Record<string, string> = {
    SystemRoot: 'C:\\WINDOWS',
    windir: 'C:\\WINDOWS',
    ComSpec: 'C:\\WINDOWS\\System32\\cmd.exe',
    APPDATA: join(userProfile, 'AppData', 'Roaming'),
    LOCALAPPDATA: join(userProfile, 'AppData', 'Local'),
    ProgramFiles: 'C:\\Program Files',
    ProgramW6432: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (!process.env[key] || process.env[key]?.trim().length === 0) {
      process.env[key] = value;
    }
  }
}

ensureWindowsProcessEnvironment();

function getRuntimeConfigString(
  config: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = config?.[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function ensureDefaultRuntimeProfileBindings(args: {
  companiesRepo: ReturnType<typeof createCompaniesRepo>;
  employeesRepo: ReturnType<typeof createEmployeesRepo>;
  runtimeProfilesRepo: RuntimeProfilesRepo;
}): void {
  for (const company of args.companiesRepo.list()) {
    if (company.status === 'archived') continue;
    const profile = args.runtimeProfilesRepo
      .listByCompany(company.id)
      .find((row) => row.enabled && row.kind === 'teamx-internal');
    if (!profile) continue;

    for (const employee of args.employeesRepo.listVisibleByCompany(company.id)) {
      if (employee.status === 'archived' || employee.status === 'fired') continue;
      if (args.runtimeProfilesRepo.getBinding(company.id, employee.id)) continue;
      args.runtimeProfilesRepo.upsertBinding({
        companyId: company.id,
        employeeId: employee.id,
        runtimeProfileId: profile.id,
      });
    }
  }
}

function recoverUnansweredDirectMessages(args: {
  companiesRepo: ReturnType<typeof createCompaniesRepo>;
  threadsRepo: ReturnType<typeof createThreadsRepo>;
  messagesRepo: ReturnType<typeof createMessagesRepo>;
  employeesRepo: ReturnType<typeof createEmployeesRepo>;
  orchestrator: Orchestrator;
  bus: ReturnType<typeof createEventBus>;
}): void {
  for (const company of args.companiesRepo.list()) {
    if (company.status === 'archived') continue;
    for (const thread of args.threadsRepo.listByCompany(company.id)) {
      if (thread.kind !== 'dm') continue;
      const members = args.threadsRepo.listMembers(thread.id);
      const hasHuman = members.some(
        (member) => member.memberKind === 'user' && member.memberId === HUMAN_USER_ID,
      );
      if (!hasHuman) continue;
      const employeeMember = members.find((member) => member.memberKind === 'employee');
      if (!employeeMember) continue;
      const employee = args.employeesRepo.getById(employeeMember.memberId);
      if (
        !employee ||
        employee.companyId !== company.id ||
        employee.status === 'archived' ||
        employee.status === 'fired'
      ) {
        continue;
      }
      const rows = args.messagesRepo
        .listByThread(thread.id)
        .slice()
        .sort((a, b) => a.createdAt - b.createdAt);
      const latest = rows.at(-1);
      if (
        !latest ||
        latest.authorKind !== 'user' ||
        latest.authorId !== HUMAN_USER_ID ||
        latest.content.trim().length === 0
      ) {
        continue;
      }
      void args.orchestrator
        .enqueueChat({
          threadId: thread.id,
          employeeId: employee.id,
          userMessageId: latest.id,
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const refreshed = args.messagesRepo.listByThread(thread.id);
          const trigger = refreshed.find((row) => row.id === latest.id);
          const alreadyStarted =
            trigger !== undefined &&
            refreshed.some(
              (row) =>
                row.createdAt >= trigger.createdAt &&
                row.authorKind === 'employee' &&
                row.authorId === employee.id,
            );
          if (!alreadyStarted) {
            args.bus.emit({
              type: 'work.failed',
              companyId: company.id,
              actorId: 'orchestrator',
              actorKind: 'orchestrator',
              payload: {
                threadId: thread.id,
                employeeId: employee.id,
                messageId: latest.id,
                error: message,
              },
            });
          }
          console.error(
            `[main] recovered chat turn failed for thread=${thread.id} ` +
              `employee=${employee.id} userMessage=${latest.id}:`,
            err,
          );
        });
    }
  }
}

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

/**
 * Resolve the absolute path to the drizzle migrations directory.
 *
 * - In dev, electron-vite runs the compiled main bundle at out/main/index.js
 *   and the migrations source lives at src/main/db/migrations — two levels
 *   up then down.
 * - In packaged production builds, migrations will ship via electron-builder
 *   `extraResources` at `process.resourcesPath/migrations` (wiring lands in
 *   Task 49). The isPackaged branch is in place so dev and prod code paths
 *   are symmetric from day one.
 */
function resolveMigrationsFolder(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'migrations')
    : join(__dirname, '../../src/main/db/migrations');
}

/**
 * Resolve the absolute path to the role-packs roles directory.
 * Mirrors the path logic in `db/seed.ts` — both files need to point
 * at the same place, so we duplicate the helper rather than creating
 * a new shared module for one constant. T49's electron-builder
 * wiring will replace the dev branch with `process.resourcesPath`.
 */
function resolveRolePacksRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'role-packs/strategia-official/roles')
    : join(__dirname, '../../../../role-packs/strategia-official/roles');
}

/**
 * Pinned llama-server build tag. MUST stay in sync with the `fetchedFromTag`
 * field of scripts/llama-binaries-manifest.json (the fetch pipeline's source
 * of truth). Surfaced via localGguf.runtime.binariesVersion + Settings.
 */
const LLAMA_BINARIES_VERSION = 'b9371';

/**
 * Root containing `llama-server/<platform-arch>/<backend>/server[.exe]`.
 *
 * In packaged builds, electron-builder's `extraResources` copies
 * `resources/llama-server` → `llama-server` directly under
 * `process.resourcesPath` (see electron-builder.yml), so that is the root.
 * In dev, the compiled main bundle runs at `apps/desktop/out/main`, so the
 * source tree's `apps/desktop/resources` is four levels up then back down —
 * mirroring the `resolveRolePacksRoot` dev-path idiom. The binary resolver
 * appends `/llama-server/...` to this root.
 */
function resolveLlamaResourcesRoot(): string {
  return app.isPackaged
    ? process.resourcesPath
    : join(__dirname, '../../../../apps/desktop/resources');
}

/**
 * Wrap `telemetry-core`'s `calcCostUsd` into the orchestrator's
 * `CostCalculator` shape. The orchestrator API uses
 * `(provider, model, tokens) -> string` so all storage stays decimal-safe;
 * `calcCostUsd` returns a number, so we format here at the boundary.
 * Six decimal places is enough for sub-cent precision on the smallest
 * Phase 1 model (claude-haiku at $0.001/1k input).
 *
 * C3 (audit 2026-05-07): when the Anthropic adapter has prompt caching
 * enabled, the `usage` chunk carries `cachedInputTokens` (cache read)
 * and `cacheWriteTokens` (cache creation) alongside the fresh input
 * count. We thread both into `calcCostUsd` via its object form so the
 * read tokens get the discounted rate and the write tokens get the
 * premium rate. Non-Anthropic / non-cached calls leave them undefined
 * and the calculator falls back to the legacy fresh-only formula.
 */
const calcCost: CostCalculator = ({
  model,
  promptTokens,
  completionTokens,
  cachedInputTokens,
  cacheWriteTokens,
}) => {
  const result = calcCostUsd(model, {
    promptTokens,
    completionTokens,
    ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
    ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
  });
  return result.usd.toFixed(6);
};

function clampConcurrencySlots(value: number): number {
  const { min, max, default: fallback } = CONCURRENCY_SETTINGS_CLAMPS.orchestratorSlots;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeConcurrencyCaps(
  caps: Record<string, number> | undefined,
): Record<string, number> {
  const { min, max } = CONCURRENCY_SETTINGS_CLAMPS.providerCap;
  const normalized: Record<string, number> = {};
  for (const [kind, value] of Object.entries(caps ?? {})) {
    if (!Number.isFinite(value)) continue;
    normalized[kind] = Math.max(min, Math.min(max, Math.round(value)));
  }
  return normalized;
}

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: '#0a0a0a',
    ...(isDev ? { icon: join(__dirname, '../../build/icon.png') } : {}),
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // Chromium OS-level sandbox is ON. The preload uses only contextBridge
      // and does not require Node APIs, so sandbox=true is safe. If a future
      // task ever needs native modules inside the preload itself, re-evaluate
      // this flag with an explicit security trade-off note.
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
    },
  });
  attachSpellcheckContextMenu(win);

  win.once('ready-to-show', () => {
    win.show();
    // Auto-open DevTools in dev so renderer errors surface immediately.
    // Gated on isDev so packaged builds never ship with DevTools primed.
    // Also gated off in test mode: DevTools attaches to the Chrome
    // DevTools Protocol, which Playwright's `_electron` driver also
    // uses — the two compete on the same channel and Playwright
    // actions hang until the 90s test timeout. The Playwright E2E
    // smoke test runs with NODE_ENV=test, so this check keeps the
    // real dev workflow (pnpm dev) fully instrumented while giving
    // the E2E harness an uncontended CDP channel.
    if (isDev && process.env.NODE_ENV !== 'test') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// ---------------------------------------------------------------------------
// Process-wide state owned by app.whenReady() — exposed at module
// scope so the will-quit handler can tear them down. Both default to
// null until the app has booted; the shutdown path is null-safe so an
// early crash before whenReady completes still cleans up gracefully.
// ---------------------------------------------------------------------------
let orchestrator: Orchestrator | null = null;
let unregisterIpc: (() => void) | null = null;
let mcpHostInstance: McpHost | null = null;
let ragIndexerInstance: { stop: () => void } | null = null;
/**
 * CopilotEventWindow — M33 T3. In-memory bounded rolling buffer of
 * dashboard events keyed per company. Started after the event bus is
 * wired; consumed by the T4 CopilotAnalyzerService. Held as a module
 * handle for graceful shutdown alongside the other subscribers.
 */
let copilotEventWindowInstance: CopilotEventWindow | null = null;
let commandServiceInstance: CommandService | null = null;
/**
 * Agentic-loop front-door for the command palette's `complex_request`
 * intent (M31 T4). Lives alongside the orchestrator because its
 * pause-gate observer reads `orchestrator.isCompanyPaused` on every
 * provider completion. Nullable at boot for symmetry with the other
 * tear-down handles and to stay safe during early-crash cleanup.
 */
let agenticLoopServiceInstance: AgenticLoopService | null = null;
/**
 * Copilot analyzer (M33 T4) — periodic + event-triggered scheduler
 * producing proactive insights for each company. Observes the
 * orchestrator pause gate on every provider call (same discipline as
 * the agentic loop); writes runs with kind='copilot' via migration
 * 0012; fans out `copilot.insight`/`copilot.analyzed`/`copilot.expired`
 * on the bus.
 */
let copilotAnalyzerServiceInstance: CopilotAnalyzerService | null = null;
let proactiveTriggerServiceInstance: ProactiveTriggerService | null = null;
let routineServiceInstance: RoutineService | null = null;
let budgetGovernanceServiceInstance: ReturnType<typeof createBudgetGovernanceService> | null = null;
let approvalInboxServiceInstance: ReturnType<typeof createApprovalInboxService> | null = null;
/**
 * Copilot event trigger (M33 T4) — bus subscriber that debounces
 * meeting.ended / ticket.closed / goal.progressChanged /
 * agentic.failed-budget_exhausted into supplementary analyzer ticks
 * per Phase 5 §8.5. Separated from the window (T3) for test isolation.
 */
let copilotEventTriggerInstance: CopilotEventTrigger | null = null;
/**
 * Local GGUF model pool (v3.3.0 Phase 2). Held at module scope so the
 * will-quit handler can `shutdownAll()` its child llama-server processes
 * before the SQLite handle closes.
 */
let poolServiceInstance: PoolService | null = null;
/**
 * Local GGUF library service (v3.3.0 Phase 3). Held at module scope so the
 * will-quit handler can `dispose()` its live chokidar folder watchers and
 * network-share resilience monitors before the SQLite handle closes.
 */
let libraryServiceInstance: LibraryService | null = null;

configureStableUserDataPath(app, { logger: console });

app
  .whenReady()
  .then(async () => {
    // ---- 1. Database --------------------------------------------------------
    const dbHandle = initDb(dbPath());
    runMigrations(dbHandle.db, resolveMigrationsFolder());
    console.log('[db] migrations applied');
    const fts5Ready = initFts5(getDb());
    console.log(`[db] FTS5 vault index: ${fts5Ready ? 'ready' : 'unavailable (fallback mode)'}`);

    // ---- 2-4. Seed company/employees, default providers, dev key import ----
    seed();
    seedDefaultProviders();
    // Dev-only: import ANTHROPIC_API_KEY from apps/desktop/.env into the OS
    // keychain if the keychain has no anthropic key yet. No-op in packaged
    // builds and whenever the .env file is absent. See env-key-bootstrap.ts
    // for the full list of security invariants this function enforces.
    await bootstrapEnvKeys();

    // ---- 5. Build services + orchestrator + IPC ----------------------------
    const db = getDb();
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
    const threadDigestsRepo = createThreadDigestsRepo(db);
    const runCheckpointsRepo = createRunCheckpointsRepo(db);
    const embeddingsRepo = createEmbeddingsRepo(db);
    const commandHistoryRepo = createCommandHistoryRepo(db);
    // M33 T4 — copilot-insights repo consumed by the CopilotAnalyzerService
    // below. Methods: create/getById/listActive/dismiss/expireStale/
    // upsertWithDedup/listStale (the last one is the T4 addition; see
    // copilot-insights.ts §listStale comment block for rationale).
    const copilotInsightsRepo = createCopilotInsightsRepo(db);

    // ── Local & Networked GGUF runtime (v3.3.0 Phase 2) ───────────────────
    const localModelsRepo = createLocalModelsRepo(db);
    const localModelAdvancedParamsRepo = createLocalModelAdvancedParamsRepo(db);
    // Phase 3 (library + scanning): folder sources scanned for GGUF files; the
    // LibraryService owns the watcher/monitor lifecycle for each registered row.
    const localModelWatchFoldersRepo = createLocalModelWatchFoldersRepo(db);

    // Adapter: the app settings repo (getRaw → string | null / set → JSON) →
    // the get<T>() | undefined / set<T>() shape the local-gguf accessor expects.
    const localGgufSettingsStore: LocalGgufSettingsStore = {
      get<T>(key: string): T | undefined {
        const raw = settingsRepo.getRaw(key);
        if (raw === null) return undefined;
        try {
          return JSON.parse(raw) as T;
        } catch {
          return undefined;
        }
      },
      set<T>(key: string, value: T): void {
        settingsRepo.set(key, value);
      },
    };
    const localGgufSettings = createLocalGgufSettingsAccessor(localGgufSettingsStore);

    const runtimeService: RuntimeService = createRuntimeService({
      settings: localGgufSettings,
      resourcesRoot: resolveLlamaResourcesRoot(),
      binariesVersion: LLAMA_BINARIES_VERSION,
    });
    const poolService: PoolService = createPoolService({
      runtime: runtimeService,
      models: localModelsRepo,
      advancedParams: localModelAdvancedParamsRepo,
      settings: localGgufSettings,
      initialMaxConcurrent: localGgufSettings.get().maxConcurrentLocalModels,
    });
    poolServiceInstance = poolService;

    // ── Local & Networked GGUF library service (v3.3.0 Phase 3) ───────────
    // Production filesystem adapter. readFile MUST honour `{ length }`: the
    // service reads only the GGUF head (1 MiB) to parse metadata, and a plain
    // fs.readFile ignores `length` - it would load a multi-GB model fully into
    // memory. A bounded `length` is satisfied via a file handle partial read
    // (a small head file simply returns fewer bytes, which is fine). Node `fs`
    // accepts the scanner's forward-slash paths on Windows, incl. //host/share.
    const libraryFs: LibraryFs = {
      async readFile(path, opts) {
        const fh = await fsOpen(path, 'r');
        try {
          if (opts?.length == null) {
            return await fh.readFile();
          }
          const buf = Buffer.allocUnsafe(opts.length);
          const { bytesRead } = await fh.read(buf, 0, opts.length, 0);
          return buf.subarray(0, bytesRead);
        } finally {
          await fh.close();
        }
      },
      stat: (p) => fsStat(p).then((s) => ({ size: s.size })),
      access: (p) => fsAccess(p),
      // The scanner always passes `{ withFileTypes: true }`; force that overload
      // (Dirent[]) so the structural `{ name, isDirectory, isFile }` return holds.
      readdir: (p) => fsReaddir(p, { withFileTypes: true }) as ReturnType<LibraryFs['readdir']>,
    };

    // resetAdvanced = "reset to auto": clear the stored override, then return
    // an all-null AdvancedParams meaning "no overrides; auto-tune on next load".
    // Real auto-tuning (GPU probe + autoTune) already runs at model-load time in
    // pool-service.ts, so a settings-reset click must NOT trigger a GPU probe -
    // returning the null/auto row is the correct, side-effect-free behaviour.
    const computeAutoParams = async (model: LocalModel): Promise<AdvancedParams> => ({
      modelId: model.id,
      nCtx: null,
      nGpuLayers: null,
      nBatch: null,
      nThreads: null,
      temperature: null,
      topP: null,
      topK: null,
      repeatPenalty: null,
      mmap: null,
      mlock: null,
      flashAttention: null,
      updatedAt: Date.now(),
    });

    const libraryService: LibraryService = createLibraryService({
      models: localModelsRepo,
      watchFolders: localModelWatchFoldersRepo,
      advancedParams: localModelAdvancedParamsRepo,
      fs: libraryFs,
      computeAutoParams,
    });
    libraryServiceInstance = libraryService;

    const cloudLinkService = createCloudLinkService({
      companiesRepo,
      settingsRepo,
    });
    const operatorAccessService = createOperatorAccessService({
      companiesRepo,
      cloudLinkService,
      operatorsRepo,
    });
    const artifactService = createArtifactService({
      artifactsRepo,
    });
    const threadDigestService = createThreadDigestService({
      threadDigestsRepo,
      messagesRepo,
    });
    const runCheckpointService = createRunCheckpointService({
      runCheckpointsRepo,
    });
    const recoveredInterruptedRuns = runsRepo.recoverInterruptedWorkRuns();
    if (recoveredInterruptedRuns > 0) {
      console.warn(`[runs] recovered ${recoveredInterruptedRuns} interrupted work run(s)`);
    }

    // Seed default settings on first boot (runtime_strategy, privacy tier, caps).
    const settingsSeeded = settingsRepo.seedDefaults();
    if (settingsSeeded > 0) {
      console.log(`[settings] seeded ${settingsSeeded} default setting(s)`);
    }
    const deviceId = cloudLinkService.ensureDeviceIdentity();
    if (deviceId.length > 0) {
      console.log('[cloud-link] local device identity ready');
    }

    // Seed well-known MCP servers on first boot (disabled by default).
    const mcpSeeded = seedDefaultMcpServers(db);
    if (mcpSeeded > 0) {
      console.log(`[mcp] seeded ${mcpSeeded} default MCP server(s)`);
    }
    const mcpBridgeBackfill = extensionsRegistry.backfillMcpServers();
    if (mcpBridgeBackfill > 0) {
      console.log(`[extensions] synced ${mcpBridgeBackfill} MCP bridge row(s)`);
    }
    const skillsService = createSkillsService({
      extensionsRepo,
      skillAssignmentsRepo,
      authorityRepo,
      settingsRepo,
      skillsRoot: join(app.getPath('userData'), 'extensions', 'skills'),
    });
    operatorAccessService.ensureLocalOwner();
    operatorAccessService.ensureLocalOwnerForCompanies(
      companiesRepo.list().map((company) => company.id),
    );

    const bus = createEventBus({ repo: eventsRepo });
    const vaultService = createVaultService({
      vaultRepo,
      artifactService,
      companiesBasePath: join(app.getPath('userData'), 'companies'),
      getCompanySlug: (companyId: string) => {
        const company = companiesRepo.list().find((c) => c.id === companyId);
        return company?.slug ?? null;
      },
      // M30 T0 — wire the event bus so vault mutations fan out to the
      // renderer subscriber. Closes the vault-backup E2E staleness
      // regression (see docs/plans/2026-04-13-vault-backup-regression-findings.md).
      bus,
    });

    // ---- MCP Host initialization --------------------------------------------
    // C5 (audit 2026-05-07) — wire the security gates:
    //   - `userDataDir`         pins child-process cwd per server.
    //   - `executableAllowlist` is a hash-pinned operator-managed list
    //     at `<userDataDir>/mcp-allowlist.json`. The file is auto-created
    //     EMPTY on first run, which is the explicit fail-closed state:
    //     no MCP servers spawn until an operator adds an entry.
    const mcpAllowlistPath = mcpDefaultAllowlistPath(userDataDir());
    const mcpHost = createMcpHost({
      mcpServersRepo,
      toolCallsRepo,
      bus,
      userDataDir: userDataDir(),
      executableAllowlist: createFileAllowlist(mcpAllowlistPath),
    });
    mcpHostInstance = mcpHost;
    // Initialize MCP connections (best-effort, failures logged per-server)
    await mcpHost.initialize().catch((err) => {
      console.error('[main] MCP host initialization failed:', err);
    });
    console.log('[main] MCP host initialized');

    // Provider routing — two modes:
    //
    //   - Normal: providers service + secrets store + adapter factory.
    //     The factory's `resolveForEmployee` IS the orchestrator's
    //     `resolveProvider` slot — same shape, no adapter needed.
    //
    //   - Test mode (NODE_ENV=test): a canned instant-reply stream
    //     that needs no LLM server, no keytar, and no network. Used by
    //     the Playwright E2E smoke test (T49) which boots a real Electron
    //     instance but must not depend on external infrastructure.
    //
    // Both secretsStore and providersService are constructed eagerly so
    // the IPC handler layer (which exposes providers.* channels) can
    // always reach them — the constructors are cheap (no keytar or DB
    // call until a method is actually invoked).
    const testMode = isTestMode();
    const secretsStore = new SecretsStore();
    const providersService = getProvidersService();
    const runtimeProfilesService = createRuntimeProfilesService({
      runtimeProfilesRepo,
      employeesRepo,
      providersService,
    });
    ensureDefaultRuntimeProfileBindings({
      companiesRepo,
      employeesRepo,
      runtimeProfilesRepo,
    });
    const runtimeAuditNormalizer = createRuntimeAuditNormalizer({
      bus,
      toolCallsRepo,
      artifactService,
    });
    const runtimeSessionService = createRuntimeSessionService({
      runtimeSessionsRepo,
      runtimeAuditNormalizer,
    });
    const runtimeOperationsService = createRuntimeOperationsService({
      runtimeSessionService,
      ticketCheckoutsRepo,
    });

    // Proactive execution bridge: wake agents when routines complete or
    // tickets are assigned, then let the heartbeat loop process due work.
    const agentWakeupRequestsRepo = createAgentWakeupRequestsRepo(db);
    const heartbeatServiceInstance = createHeartbeatService({
      agentWakeupRequestsRepo,
      employeesRepo,
      bus,
    });
    const agentWakeupQueueInstance = createAgentWakeupQueue({
      heartbeatService: heartbeatServiceInstance,
    });
    heartbeatServiceInstance.start(60 * 1000);
    const ticketsRepo = createTicketsRepo(db, agentWakeupQueueInstance);
    // C4 (audit 2026-05-07) — write-side amber gate holding table.
    const pendingDelegationsRepo = createPendingDelegationsRepo(db);

    budgetGovernanceServiceInstance = createBudgetGovernanceService({
      budgetsRepo,
      employeesRepo,
      runsRepo,
      ticketsRepo,
      routinesRepo,
      runtimeProfilesService,
      bus,
      operatorId: operatorAccessService.getLocalOwnerId(),
      orchestrator: {
        pauseCompany: async (companyId) => {
          if (!orchestrator) return;
          await orchestrator.pauseCompany(companyId);
        },
      },
    });
    const externalRuntimeAdapters = createExternalRuntimeAdapters({
      secretsStore,
      userDataDir: userDataDir(),
      runtimeSessionService,
      ticketCheckoutsRepo,
      runtimeAuditNormalizer,
      budgetAdmissionGate: budgetGovernanceServiceInstance,
    });
    /**
     * C4 (audit 2026-05-07) — shared "materialize delegated ticket"
     * helper. Both the approval-inbox-service (on operator approve) and
     * the agentic-loop write-side orchestrator seam use this to
     * provision a thread for the assigned ticket, emit the kickoff
     * message, and enqueue the assignee's first reply turn. Lazily
     * reads the mutable `orchestrator` so it's safe to declare here
     * (before `orchestrator = buildOrchestrator(...)` runs further
     * below).
     */
    const materializeDelegatedTicket = async (args: {
      ticketId: string;
      employeeId: string;
      companyId: string;
      actorId: string;
      actorKind: string;
    }): Promise<{ threadId: string; triggerMessageId: string }> => {
      if (!orchestrator) {
        throw new Error('[delegation] orchestrator is unavailable for delegated ticket pickup');
      }
      const ticket = ticketsRepo.getById(args.ticketId);
      if (!ticket || ticket.companyId !== args.companyId) {
        throw new Error(
          `[delegation] delegated ticket "${args.ticketId}" is not available in company "${args.companyId}"`,
        );
      }
      const assignee = employeesRepo.getById(args.employeeId);
      if (!assignee || assignee.companyId !== args.companyId) {
        throw new Error(
          `[delegation] delegated assignee "${args.employeeId}" is not available in company "${args.companyId}"`,
        );
      }

      let threadId = ticket.threadId;
      if (!threadId) {
        threadId = threadsRepo.create({
          companyId: args.companyId,
          kind: 'ticket',
          subject: ticket.title,
          createdBy: args.actorId,
        });
        ticketsRepo.setThreadId(args.ticketId, threadId);
      }

      const ensureMember = (memberId: string, memberKind: 'user' | 'employee'): void => {
        const members = threadsRepo.listMembers(threadId);
        const alreadyMember = members.some(
          (member) => member.memberId === memberId && member.memberKind === memberKind,
        );
        if (!alreadyMember) {
          threadsRepo.addMember({ threadId, memberId, memberKind });
        }
      };

      ensureMember(HUMAN_USER_ID, 'user');
      ensureMember(args.employeeId, 'employee');
      if (args.actorKind === 'employee' && args.actorId !== args.employeeId) {
        ensureMember(args.actorId, 'employee');
      }

      const actorRow = args.actorKind === 'employee' ? employeesRepo.getById(args.actorId) : null;
      const actorLabel = actorRow?.name ?? args.actorId;
      const description = ticket.description.trim();
      const triggerMessageId = messagesRepo.append({
        threadId,
        authorId: args.actorId,
        authorKind: args.actorKind === 'user' ? 'user' : 'employee',
        isAgentInitiated: args.actorKind !== 'user',
        content: `Delegated by ${actorLabel}: **${ticket.title}**\n\n${description.length > 0 ? description : '(no description)'}\n\nBegin work now. Reply with your assessment, concrete next action, blockers, and expected handoff.`,
      });

      orchestrator
        .enqueueAgentReply({
          threadId,
          employeeId: args.employeeId,
          triggerMessageId,
        })
        .catch((err: unknown) => {
          console.error(
            `[delegation] delegated ticket pickup failed for ticket=${args.ticketId}:`,
            err,
          );
        });

      return { threadId, triggerMessageId };
    };

    approvalInboxServiceInstance = createApprovalInboxService({
      budgetsRepo,
      authorityRepo,
      artifactService,
      // C4 (audit 2026-05-07) — surface and materialize delegation
      // requests in the operator inbox.
      pendingDelegationsRepo,
      ticketsRepo,
      projectsRepo,
      bus,
      orchestrator: {
        queueDelegatedTicket: materializeDelegatedTicket,
      },
    });

    let routineTicketCreator:
      | ((input: RoutineServiceCreateTicketInput) => Promise<{ ticketId: string }>)
      | null = null;
    routineServiceInstance = createRoutineService({
      routinesRepo,
      companiesRepo,
      employeesRepo,
      bus,
      budgetGovernance: budgetGovernanceServiceInstance,
      artifactService,
      agentWakeupQueue: agentWakeupQueueInstance, // ✅ PROACTIVE EXECUTION BRIDGE
      createTicket: async (input) => {
        if (!routineTicketCreator) {
          throw new Error('[main] routine ticket creator is not wired yet');
        }
        return routineTicketCreator(input);
      },
    });

    const companyPortabilityService = createCompanyPortabilityService({
      companiesRepo,
      employeesRepo,
      orgEdgesRepo,
      goalsRepo,
      projectsRepo,
      ticketsRepo,
      runtimeProfilesService,
      runtimeProfilesRepo,
      routineService: routineServiceInstance,
      routinesRepo,
      budgetGovernanceService: budgetGovernanceServiceInstance,
      budgetsRepo,
      extensionsRegistry,
      extensionsRepo,
      skillsService,
      skillAssignmentsRepo,
      authorityRepo,
      operatorAccessService,
      ensureSystemForCompany: (companyId) => {
        const agent = ensureSystemAgent({ db, companyId, roleLookup: roleLoader });
        const copilot = ensureSystemCopilot({ db, companyId, roleLookup: roleLoader });
        return {
          agentEmployeeId: agent.employeeId,
          copilotEmployeeId: copilot.employeeId,
          agentCreated: agent.created,
          copilotCreated: copilot.created,
        };
      },
      exportRootDir: join(userDataDir(), 'portability'),
      appVersion: app.getVersion(),
    });
    let resolveProvider: ResolveProvider;

    if (testMode) {
      resolveProvider = createTestModeResolveProvider();
      console.log('[main] test-mode provider active — canned responses, no LLM calls');
    } else {
      const providerFactory = createProviderFactory({
        providersService,
        secretsStore,
        companiesRepo,
      });
      const runtimeProfileProviderService = createRuntimeProfileProviderService({
        runtimeProfilesService,
        providerFactory,
        externalRuntimeAdapters,
      });
      resolveProvider = (employee) => runtimeProfileProviderService.resolveForEmployee(employee);
    }

    const runtimeStrategy = settingsRepo.get<RuntimeStrategy>('runtime_strategy', 'auto');
    const bootProfile = detectHardware();
    const bootStrategy = pickStrategy({
      profile: bootProfile,
      providers: providersService.list(),
      override: runtimeStrategy,
    });
    const initialSlots = clampConcurrencySlots(
      settingsRepo.get<number>('orchestrator_slots', bootStrategy.slots),
    );
    const initialProviderCaps = normalizeConcurrencyCaps(
      settingsRepo.get<Record<string, number>>('concurrency_caps', DEFAULT_CONCURRENCY_CAPS),
    );

    // ---- RAG: optional, off-by-default, zero-regression when disabled ------
    //
    // Invariant #7 (zero phone-home) is preserved: if the user has not
    // configured a local embedding provider (Ollama) AND there is no key
    // in the keychain for a cloud one, ragService resolves to `null` and
    // every RAG-dependent code path falls back to its pre-M29 behaviour.
    // Test mode always skips RAG — the Playwright smoke, ticket-flow, and
    // meeting-flow specs boot against a canned provider with no network,
    // and we must not alter their semantics.
    async function buildRagService(): Promise<RagService | null> {
      // Test-mode RAG (Playwright E2E — M29 T9): when the spec sets
      // `TEAM_X_RAG_TEST=1` alongside `NODE_ENV=test`, wire the
      // deterministic fake embed adapter so the rag-flow spec can
      // drive a full round-trip without Ollama / OpenAI / network.
      // Every other E2E spec (smoke / ticket-flow / meeting-flow /
      // vault-backup) omits the flag, so the original `testMode →
      // return null` short-circuit still applies and their semantics
      // are preserved exactly.
      const testRagMode = testMode && process.env.TEAM_X_RAG_TEST === '1';
      if (testMode && !testRagMode) return null;

      if (testRagMode) {
        const dimension = 64; // small, deterministic, fast to hash
        const adapter = makeFakeEmbedAdapter(dimension);
        const embedText = createEmbedText(adapter);
        const ragRepo: RagRepo = {
          upsert: (input) => embeddingsRepo.upsert(input),
          deleteBySource: (id) => embeddingsRepo.deleteBySource(id),
          listByCompany: (cid) =>
            embeddingsRepo
              .listByCompany(cid)
              .map((r) => ({ ...r, sourceType: r.sourceType as EmbeddingSourceType })),
        };
        console.log('[rag] test-mode fake embed adapter active (TEAM_X_RAG_TEST=1)');
        return createRagService({ embedText, dimension, repo: ragRepo });
      }

      const enabled = settingsRepo.get<boolean>('rag_enabled', false);
      if (!enabled) return null;

      const provider = settingsRepo.get<string>('embedding_provider', 'ollama-local');
      const model = settingsRepo.get<string>('embedding_model', 'nomic-embed-text');
      const dimension = settingsRepo.get<number>('embedding_dimension', 768);

      // 'auto' is the seeded sentinel — the Settings UI (M29-T8) will
      // replace it with a concrete value when the user opts in. Until
      // then, RAG stays off so no boot-time embed call fires against a
      // provider the user has not explicitly chosen.
      if (provider === 'auto' || model === 'auto') return null;

      const adapter = await buildEmbedAdapter({
        provider,
        model,
        dimension,
        providersService,
        secretsStore,
      });
      if (!adapter) return null;

      const embedText = createEmbedText(adapter);
      // The drizzle row type surfaces `sourceType: string` because it
      // is a raw text column, but every write into `embeddings` goes
      // through `RagService.indexSource` which already constrains the
      // input to `EmbeddingSourceType`. The narrowing is therefore
      // correct at runtime — wrap the repo in a thin adapter that
      // asserts the narrower type rather than widening the public
      // `RagRepo` contract or relaxing the embeddings schema.
      const ragRepo: RagRepo = {
        upsert: (input) => embeddingsRepo.upsert(input),
        deleteBySource: (id) => embeddingsRepo.deleteBySource(id),
        listByCompany: (cid) =>
          embeddingsRepo
            .listByCompany(cid)
            .map((r) => ({ ...r, sourceType: r.sourceType as EmbeddingSourceType })),
      };
      return createRagService({ embedText, dimension, repo: ragRepo });
    }

    const ragService: RagService | null = await buildRagService();
    if (ragService !== null) {
      console.log('[rag] service ready — RAG-enhanced prompts active');
    } else {
      console.log('[rag] disabled or unconfigured — running without RAG');
    }
    // H10 (audit 2026-05-07) — wire query expansion + cross-encoder
    // reranker into the retrieval orchestrator. Both were built but
    // unwired; the orchestrator now augments the 3-query baseline with
    // entity-aware semantic/synonym expansions and reranks the top
    // composite-scored candidates with a cross-encoder before the
    // dedupe-by-source + token-budget pass.
    //
    // The mock cross-encoder uses lexical overlap as its score (no
    // network, no LLM cost). When a real Cohere/OpenAI rerank API is
    // configured later, swap in `createApiCrossEncoder({ baseURL,
    // apiKey, model })` here without touching the orchestrator. Same
    // story for HyDE: the QE service is created without an LLM today
    // (HyDE off); plug an LLM in to enable HyDE without diff churn.
    const queryExpansionService = createQueryExpansionService({ hydeEnabled: false });
    const rerankerService = createRerankerService(createMockCrossEncoder());

    const retrievalOrchestrator =
      ragService === null
        ? null
        : createRetrievalOrchestrator({
            vectorRetrieve: (input) => ragService.retrieve(input),
            listTickets: (companyId) => ticketsRepo.listByCompany(companyId),
            listGoals: (companyId) => goalsRepo.listByCompany(companyId),
            listProjects: (companyId) => projectsRepo.listByCompany(companyId),
            searchVault: (companyId, query) =>
              vaultRepo.search(companyId, query).map((hit) => ({ id: hit.id, rank: hit.rank })),
            getVaultFile: (id) => vaultRepo.getById(id),
            queryExpansion: queryExpansionService,
            // H10 — synthesize per-company entity context from the same
            // repos the orchestrator already reads. The QE service uses
            // employee/project/goal names + IDs to substitute names with
            // IDs in the query text and vice-versa, lifting recall on
            // queries that mention people/projects by name without
            // exact-token overlap with the indexed content.
            entityContextProvider: (companyId) => ({
              companyId,
              employees: employeesRepo.listByCompany(companyId).map((e) => ({
                id: e.id,
                name: e.name,
                aliases: [],
              })),
              projects: projectsRepo.listByCompany(companyId).map((p) => ({
                id: p.id,
                // Schema uses `title` for projects (and goals); `EntityContext.projects[i].name`
                // is the QE service's field — we map title → name at the seam.
                name: p.title,
                aliases: [],
              })),
              goals: goalsRepo.listByCompany(companyId).map((g) => ({
                id: g.id,
                name: g.title,
                aliases: [],
              })),
              tickets: ticketsRepo.listByCompany(companyId).map((t) => ({
                id: t.id,
                title: t.title,
                tags: [],
              })),
            }),
            reranker: rerankerService,
          });

    const contextAssemblerService = createContextAssemblerService({
      companiesRepo,
      threadsRepo,
      messagesRepo,
      employeesRepo,
      ticketsRepo,
      projectsRepo,
      goalsRepo,
      threadDigestService,
      runCheckpointService,
      approvalInboxService: approvalInboxServiceInstance ?? undefined,
      routineService: routineServiceInstance ?? undefined,
      artifactService,
      retrieveEvidence:
        retrievalOrchestrator === null
          ? undefined
          : (input) => retrievalOrchestrator.retrieveEvidence(input),
      getRetrievalConfig: () => ({
        topK: settingsRepo.get<number>('rag_top_k', 5),
        threshold: settingsRepo.get<number>('rag_threshold', 0.7),
        maxTokens: settingsRepo.get<number>('rag_max_tokens', 2000),
        maxQueries: 3,
        maxPerSourceType: 2,
      }),
      countTokens: (text) => Math.ceil(text.length / 4),
    });
    const contextPackerService = createContextPackerService({
      countTokens: (text) => Math.ceil(text.length / 4),
    });

    // Role loader: turns (employee, company) into a rendered system prompt.
    // Preloaded eagerly so the cost of the role-pack scan is paid during
    // boot rather than on the first user message.
    //
    // Pack-signature verification mode is platform-aware:
    //   - production (packaged) builds → 'strict' refuses to load on tamper
    //   - dev builds                   → 'warn' logs but loads (so Rocky can
    //                                    edit role.md without re-signing on
    //                                    every save; sign before commit)
    //   - test mode                    → 'off' (E2E + unit tests build
    //                                    synthetic packs without sigs)
    const verifyMode: 'strict' | 'warn' | 'off' =
      process.env.NODE_ENV === 'test' ? 'off' : isDev ? 'warn' : 'strict';
    const roleLoader = createRoleLoader({
      rolePacksRoot: resolveRolePacksRoot(),
      verifyMode,
    });
    try {
      roleLoader.preload();
      console.log(`[role-loader] indexed ${roleLoader.size()} role(s)`);
    } catch (err) {
      // A missing role-packs directory is a wiring bug — surface it
      // loudly but do not crash the app. Chats will fail with a clear
      // error from the role loader on first send, which is the right
      // place for the user to learn about it.
      console.error('[role-loader] preload failed:', err);
    }

    // Tool resolver: converts MCP tools into AI SDK tool objects with
    // execute callbacks routed through McpHost. Skipped in test mode
    // (no MCP servers, no tool calls).
    const resolveTools: ResolveTools | undefined = testMode
      ? undefined
      : async ({ employee, company, getRunId }) => {
          const mcpTools = mcpHost.listTools(company.id);
          let toolsAllowed: string[] = JSON.parse(employee.toolsAllowedJson ?? '[]');
          let toolsDenied: string[] = JSON.parse(employee.toolsDeniedJson ?? '[]');
          try {
            const effectiveAuthority = authorityResolver.resolveEmployee(company.id, employee.id);
            toolsAllowed = effectiveAuthority.toolsAllowed;
            toolsDenied = effectiveAuthority.toolsDenied;
          } catch (err) {
            console.error(
              `[main] failed to resolve effective authority for ${employee.id}; falling back to role defaults:`,
              err,
            );
          }
          const specs: ToolSpec[] = [
            ...buildChatActionTools({
              companyId: company.id,
              actorId: employee.id,
              actorLevel: employee.level,
              employeesRepo,
              roleLookup: {
                listRoles: () => roleLoader.listRoles(),
              },
              bus,
            }),
          ];

          // Pre-filter at definition time so the model never sees denied tools.
          const allowedTools = mcpTools.filter((t) => {
            if (toolsDenied.includes(t.name)) return false;
            if (toolsAllowed.length > 0 && !toolsAllowed.includes(t.name)) return false;
            return true;
          });
          specs.push(
            ...allowedTools.map((t) => ({
              name: t.name,
              description: t.description ?? '',
              inputSchema: (t.inputSchema ?? { type: 'object' }) as Record<string, unknown>,
              execute: async (args: Record<string, unknown>) => {
                const serverId = mcpHost.findServerForTool(t.name, company.id);
                if (!serverId) throw new Error(`No MCP server found for tool: ${t.name}`);

                const result = await mcpHost.callTool({
                  companyId: company.id,
                  serverId,
                  toolName: t.name,
                  toolArgs: args,
                  runId: getRunId(),
                  employeeId: employee.id,
                  toolsAllowed,
                  toolsDenied,
                });
                if (!result.success) {
                  throw new Error(result.error ?? `Tool '${t.name}' failed`);
                }
                return result.output;
              },
            })),
          );
          if (specs.length === 0) return null;

          return {
            tools: buildProviderTools(specs),
            maxSteps: 5,
          };
        };

    orchestrator = buildOrchestrator({
      bus,
      messagesRepo,
      runsRepo,
      budgetGovernance: budgetGovernanceServiceInstance ?? undefined,
      employeesRepo,
      companiesRepo,
      threadsRepo,
      ticketsRepo,
      calcCost,
      resolveSystemPrompt: async ({ employee, company }) => {
        const rolePrompt = await roleLoader.resolveSystemPrompt({ employee, company });
        const skillBundle = await skillsService.materializePromptBundle({
          companyId: company.id,
          employeeId: employee.id,
        });
        const prompt =
          skillBundle.trim().length > 0
            ? `${rolePrompt}\n\n## Installed Skills\n\n${skillBundle}`
            : rolePrompt;
        return appendExecutionPolicy(prompt);
      },
      resolveProvider,
      resolveTools,
      resolveExecutionWorkspace: ({ employee }) => {
        const profile = runtimeProfilesService.getProfileForEmployee(employee.id);
        if (!profile?.enabled) return null;
        return getRuntimeConfigString(profile.config, 'workingDirectory');
      },
      vaultService,
      contextAssemblerService,
      contextPackerService,
      threadDigestService,
      runCheckpointService,
      slots: initialSlots,
      providerCaps: initialProviderCaps,
      userDataDir: userDataDir(),
    });
    recoverUnansweredDirectMessages({
      companiesRepo,
      threadsRepo,
      messagesRepo,
      employeesRepo,
      orchestrator,
      bus,
    });

    // ---- RAG indexer: subscribes to the event bus, indexes on write --------
    //
    // Constructed after the orchestrator so `bus` is fully wired. When
    // ragService is null the indexer's service callbacks are no-ops,
    // so the subscription itself is cheap — `isEnabled()` short-circuits
    // every event dispatch and nothing hits the embeddings table.
    const ragIndexer = createRagIndexer({
      bus,
      service: {
        indexSource: async (input) => (ragService !== null ? ragService.indexSource(input) : 0),
        retrieve: async (input) => (ragService !== null ? ragService.retrieve(input) : []),
        deleteBySource: (id) => (ragService !== null ? ragService.deleteBySource(id) : 0),
      },
      // messagesRepo has no `getById` — pull the single row directly via
      // the shared drizzle handle. Scoped inline so there is no need to
      // widen the repo surface for a one-shot read.
      getMessage: (id) => {
        const row = db.select().from(messagesTable).where(eq(messagesTable.id, id)).get();
        if (!row) return null;
        return { id: row.id, content: row.content, threadId: row.threadId };
      },
      getCompanyIdForThread: (threadId) => threadsRepo.getById(threadId)?.companyId ?? null,
      // Meeting minutes live in the `minutes_md` column (markdown-
      // rendered summary). The indexer's structural shape asks for a
      // `minutesText` key, so we rename here at the boundary rather
      // than widening the repo row type. Returns null when minutes
      // have not been generated yet (meeting still active).
      getMeetingMinutes: (id) => {
        const m = meetingsRepo.getById(id);
        return m?.minutesMd ? { id: m.id, minutesText: m.minutesMd } : null;
      },
      getTicket: (id) => ticketsRepo.getById(id),
      getGoal: (id) => goalsRepo.getById(id),
      getProject: (id) => projectsRepo.getById(id),
      getVaultFile: (id) => vaultRepo.getById(id),
      isEnabled: () => ragService !== null,
    });
    ragIndexer.start();
    ragIndexerInstance = ragIndexer;

    // ---- Enhanced AI service: Phase 2 & 3 features ------------------------
    //
    // Integrates semantic chunking, query expansion, long-term memory,
    // knowledge graph, multi-turn planning, streaming, and tracing with
    // the desktop app. Requires an LLM provider to function fully.
    // (Phase 5 — M32)
    const llmProvider = settingsRepo.get<string>('llm_provider', 'auto');
    const llmEnabled = llmProvider !== 'auto' && llmProvider !== null;
    let enhancedAiService: EnhancedAiService | null = null;

    if (llmEnabled && ragService !== null) {
      // Create an LLM complete function based on the provider
      // This will be wired up once the LLM settings are fully configured
      const embedText = async (texts: string[]) => {
        // Re-use the embed adapter from RAG
        const adapter = await buildEmbedAdapter({
          provider: settingsRepo.get<string>('embedding_provider', 'ollama-local'),
          model: settingsRepo.get<string>('embedding_model', 'nomic-embed-text'),
          dimension: settingsRepo.get<number>('embedding_dimension', 768),
          providersService,
          secretsStore,
        });
        if (!adapter) throw new Error('Embedding adapter not available');
        const embedFn = createEmbedText(adapter);
        return embedFn(texts);
      };

      // LLM completion adapter — wires Enhanced AI's `(prompt) => Promise<string>`
      // shape to the same `streamAgent` provider-router path the agentic loop
      // and copilot analyzer already use. Resolution strategy:
      //
      //   1. Find the first non-archived company at call time. Enhanced AI is
      //      a framework-level capability not bound to any single actor, but
      //      `resolveProvider` requires an `EmployeeRow` to look up the
      //      runtime profile binding. We use the system-agent of the first
      //      live company as a representative actor — in single-user mode all
      //      companies share the user's chosen provider config, so the choice
      //      is functionally equivalent.
      //   2. Resolve the provider through the same `resolveProvider` closure
      //      the orchestrator uses (test-mode → canned; production → runtime
      //      profile + secrets). This guarantees the user's configured model,
      //      provider, and capabilities are honored.
      //   3. Stream the response, accumulate deltas into a single text blob,
      //      and return. Usage telemetry is discarded here — Enhanced AI does
      //      not yet surface per-call cost; the orchestrator-level telemetry
      //      covers run-level accounting (matches the `WriteSideCompleteFn`
      //      pattern at line ~1862).
      //
      // This replaces the M32 placeholder that returned `(LLM response not
      // configured)` regardless of input — that stub silently degraded all 7
      // `enhancedAi.*` IPC channels.
      const llmComplete = async (prompt: string): Promise<string> => {
        const liveCompany = companiesRepo.list().find((c) => c.status !== 'archived');
        if (!liveCompany) {
          throw new Error(
            '[enhanced-ai] llmComplete: no live company exists — cannot resolve provider',
          );
        }
        const systemAgentRow = employeesRepo.findSystemByRoleId(
          liveCompany.id,
          SYSTEM_AGENT_ROLE_ID,
        );
        if (!systemAgentRow) {
          throw new Error(
            `[enhanced-ai] llmComplete: no system-agent for company "${liveCompany.id}" — boot top-up should have created one`,
          );
        }
        const actorRow = employeesRepo.getById(systemAgentRow.id);
        if (!actorRow) {
          throw new Error(
            `[enhanced-ai] llmComplete: system-agent row "${systemAgentRow.id}" vanished mid-resolution`,
          );
        }
        const resolved = await resolveProvider(actorRow);
        let text = '';
        for await (const chunk of streamAgent({
          providerFactory: resolved.stream,
          system: '',
          messages: [{ role: 'user', content: prompt }],
        })) {
          if (chunk.kind === 'delta') {
            text += chunk.delta;
          }
        }
        return text;
      };

      try {
        enhancedAiService = createEnhancedAiService({
          ragService,
          embedText,
          dimension: settingsRepo.get<number>('embedding_dimension', 768),
          ragRepo: {
            upsert: (input) => embeddingsRepo.upsert(input),
            deleteBySource: (id) => embeddingsRepo.deleteBySource(id),
            listByCompany: (cid) =>
              embeddingsRepo
                .listByCompany(cid)
                .map((r) => ({ ...r, sourceType: r.sourceType as EmbeddingSourceType })),
          },
          llmComplete,
        });
        console.log('[enhanced-ai] service ready — Phase 2 & 3 features available');
      } catch (err) {
        console.error('[enhanced-ai] failed to initialize:', err);
        enhancedAiService = null;
      }
    } else {
      console.log('[enhanced-ai] disabled — configure LLM provider to enable');
    }

    // ---- Copilot event window: bounded per-company rolling buffer ---------
    //
    // M33 T3. Subscribes to the same event bus the RAG indexer uses;
    // feeds the T4 CopilotAnalyzerService. Bounded at 100 events per
    // company, FIFO eviction, warm-start hydration from the events
    // table on first snapshot per company. `clear(companyId)` is
    // shipped as a public method but not yet wired — the
    // `companies.archive` IPC referenced in the M33 plan does not
    // exist today, so the archive-clear hookup is deferred to the
    // milestone that adds it (tracked as an M33 T3 follow-up).
    const copilotEventWindow = createCopilotEventWindow({
      bus,
      eventsRepo,
    });
    copilotEventWindow.start();
    copilotEventWindowInstance = copilotEventWindow;

    const backupService = createBackupService({
      dbPath: dbPath(),
      companiesBasePath: join(app.getPath('userData'), 'companies'),
      backupsDir: join(app.getPath('userData'), 'backups'),
      appVersion: app.getVersion(),
      checkpointWal: () => {
        const rawDb = getDb();
        // Drizzle's run() for raw SQL pragma
        try {
          (rawDb as unknown as { run: (q: unknown) => void }).run({
            toSQL: () => ({ sql: 'PRAGMA wal_checkpoint(TRUNCATE)', params: [] }),
          });
        } catch {
          // Fallback: just proceed without checkpoint
        }
      },
    });
    const autonomyDoctorService = createAutonomyDoctorService({
      dbDiagnostics: {
        quickCheck: () => {
          const rows = dbHandle.raw.pragma('quick_check') as Array<Record<string, unknown>>;
          return rows.map((row) => String(Object.values(row)[0] ?? '')).join('; ');
        },
        hasTable: (tableName) =>
          Boolean(
            dbHandle.raw
              .prepare("select name from sqlite_master where type = 'table' and name = ?")
              .get(tableName),
          ),
      },
      backupService,
      runtimeProfilesService,
      runtimeOperationsService,
      mcpServersRepo,
      providersService,
      budgetGovernanceService: budgetGovernanceServiceInstance,
      secretsStore,
    });
    const autonomyBenchmarkService = createAutonomyBenchmarkService({
      createScenarioContext: createInMemoryAutonomyBenchmarkScenarioContext,
    });
    const agentImprovementService = createAgentImprovementService({
      ticketsRepo,
      eventsRepo,
      bus,
    });

    const updaterService = createUpdaterService({
      isDev,
      isTestMode: testMode,
    });

    const meetingService = createMeetingService({
      orchestrator,
      bus,
      meetingsRepo,
      threadsRepo,
      messagesRepo,
      employeesRepo,
      ticketsRepo,
    });

    const ipcHandlers = createIpcHandlers({
      companiesRepo,
      employeesRepo,
      threadsRepo,
      messagesRepo,
      ticketsRepo,
      ticketAttachmentsRepo,
      goalsRepo,
      projectsRepo,
      scheduleItemsRepo,
      agentWakeupRequestsRepo,
      meetingsRepo,
      orgEdgesRepo,
      runsRepo,
      eventsRepo,
      orchestrator,
      meetingService,
      roleLookup: roleLoader,
      mcpHost,
      mcpServersRepo,
      extensionsRegistry,
      skillsService,
      operatorAccessService,
      cloudLinkService,
      runtimeProfilesService,
      runtimeOperationsService,
      autonomyDoctorService,
      autonomyBenchmarkService: {
        run: (input) =>
          autonomyBenchmarkService.run({
            runtimeKinds: input.runtimeKinds,
            scenarioIds: input.scenarioIds,
          }),
      },
      agentImprovementService,
      routineService: routineServiceInstance,
      budgetGovernanceService: budgetGovernanceServiceInstance,
      approvalInboxService: approvalInboxServiceInstance,
      artifactService,
      companyPortabilityService,
      threadDigestService,
      runCheckpointService,
      contextAssemblerService,
      contextPackerService,
      authorityRepo,
      authorityResolver,
      providersService,
      secretsStore,
      settingsRepo,
      vaultService,
      backupService,
      auditRepo,
      updaterService,
      copilotInsightsRepo: {
        listActiveForExport: (filter) => copilotInsightsRepo.listActiveForExport(filter),
      },
      // Lazy wrapper — the CopilotAnalyzerService is instantiated later
      // in this same bootstrap block (after RAG indexer, agentic loop,
      // etc.), so we close over the module-level handle and resolve it
      // on each `start` / `restart` / `stop` call. No-ops cleanly if a
      // `setCopilot` / `companies.archive` IPC fires before the analyzer
      // is live (defensive only — in practice the renderer cannot
      // reach settings until after app-ready, which is after the
      // analyzer has been wired).
      copilotAnalyzerService: {
        start: (cid: string) => {
          copilotAnalyzerServiceInstance?.start(cid);
        },
        restart: (cid: string) => {
          copilotAnalyzerServiceInstance?.restart(cid);
        },
        stop: (cid: string) => {
          copilotAnalyzerServiceInstance?.stop(cid);
        },
      },
      // Direct handle — already live at this point in the bootstrap
      // (created on line ~638 and started before handlers build). Used
      // by `companies.archive` (M33 F3) to drop the per-company rolling
      // buffer + hydrated flag after the analyzer is stopped.
      copilotEventWindow: {
        clear: (cid: string) => {
          copilotEventWindow.clear(cid);
        },
      },
      // Proactive trigger service — same lazy-resolver pattern as
      // copilotAnalyzerService above. The trigger service depends on
      // `agenticLoopService`, which is constructed AFTER `createIpcHandlers`
      // (the ordering reflects an existing wiring constraint: the loop
      // service consumes the build-tools surface composed inline from the
      // handler factory's repos). Closing over the module-level handle
      // and resolving on each method call lets us register the IPC
      // surface up-front while the actual instance comes online a few
      // hundred lines later. Without this wiring, `proactive.setEnabled`
      // (and the rest of the proactive.* IPC) throws
      // `[ipc] proactive.<method>: proactiveTriggerService dep is required`,
      // which the renderer surfaces as a snap-back on the toggle Switch.
      proactiveTriggerService: {
        decomposeGoal: (args) => {
          if (!proactiveTriggerServiceInstance) {
            return Promise.reject(new Error('[main] proactiveTriggerService not yet initialized'));
          }
          return proactiveTriggerServiceInstance.decomposeGoal(args);
        },
        scanForWork: (args) => {
          if (!proactiveTriggerServiceInstance) {
            return Promise.reject(new Error('[main] proactiveTriggerService not yet initialized'));
          }
          return proactiveTriggerServiceInstance.scanForWork(args);
        },
        setEnabled: (args) => {
          if (!proactiveTriggerServiceInstance) {
            throw new Error('[main] proactiveTriggerService not yet initialized');
          }
          proactiveTriggerServiceInstance.setEnabled(args);
        },
        isEnabled: (companyId) => {
          if (!proactiveTriggerServiceInstance) return false;
          return proactiveTriggerServiceInstance.isEnabled(companyId);
        },
      },
      // Event bus — used by `companies.archive` to emit `company.archived`
      // so renderer caches invalidate (architectural invariant #11).
      // Narrowed to `{ emit }` at the handler boundary; the richer
      // `EventBus` surface lives inside the orchestrator.
      bus: {
        emit: (input) => bus.emit(input),
      },
      // Post-restore bootstrap (M33 F4). Closes over `db`,
      // `companiesRepo`, and `roleLoader` so the handler stays free
      // of drizzle + role-loader imports. The closure re-reads
      // `companiesRepo.list()` on EACH invocation so it sees the
      // just-restored DB — calling-time resolution is essential since
      // the restore swaps the underlying file while the drizzle handle
      // remains live.
      ensurePostRestoreBootstrap: () =>
        backupService.ensurePostRestoreSystemEmployees({
          listCompanyIds: () => companiesRepo.list().map((c) => c.id),
          ensureSystemForCompany: (companyId) => {
            const agent = ensureSystemAgent({ db, companyId, roleLookup: roleLoader });
            const copilot = ensureSystemCopilot({ db, companyId, roleLookup: roleLoader });
            return {
              agentCreated: agent.created,
              copilotCreated: copilot.created,
            };
          },
        }),
      // Per-company system-employee bootstrap — invoked by `companies.create`
      // (Phase 5.6 M-C step b — restores Cluster A multi-company CRUD per
      // audit row 10.12). Same `db` + `roleLoader` handles the F4
      // post-restore sweep uses; idempotent at the bootstrap layer
      // (findSystemByRoleId short-circuits if the rows already exist).
      // Returns BOTH the employee ids AND the created/found flags so the
      // IPC handler can include the ids in the response without a
      // follow-up `employees.list` call (those rows are filtered out of
      // listVisibleByCompany by the is_system filter sweep).
      ensureSystemForCompany: (companyId) => {
        const agent = ensureSystemAgent({ db, companyId, roleLookup: roleLoader });
        const copilot = ensureSystemCopilot({ db, companyId, roleLookup: roleLoader });
        return {
          agentEmployeeId: agent.employeeId,
          copilotEmployeeId: copilot.employeeId,
          agentCreated: agent.created,
          copilotCreated: copilot.created,
        };
      },
      getHardwareProfile: detectHardware,
    });
    routineTicketCreator = async (input) => {
      const result = await ipcHandlers.ticketsCreate({
        companyId: input.companyId,
        title: input.title,
        description: input.description,
        priority: input.priority,
        assigneeId: input.assigneeId ?? undefined,
        labelsJson: input.labelsJson,
      });
      return { ticketId: result.ticketId };
    };
    for (const company of companiesRepo.list()) {
      if (company.status === 'archived') continue;
      // System-employee top-up — idempotent. Companies created before
      // M33 T2 (e.g., via M31 paths) lack the `system-copilot` row;
      // companies created before M31's `is_system` migration lack the
      // `system-agent` row. Both ensure functions short-circuit when
      // the row already exists, so this is a zero-cost no-op for
      // current-schema companies. Without this top-up, `copilot.ask`
      // throws `[copilot-service] No system-copilot employee for
      // company "..."` for any pre-M33 company. Errors are logged
      // and swallowed so a single broken company can't block boot
      // for the rest.
      try {
        ensureSystemAgent({ db, companyId: company.id, roleLookup: roleLoader });
        ensureSystemCopilot({ db, companyId: company.id, roleLookup: roleLoader });
      } catch (err) {
        console.error(`[main] system-employee top-up failed for company ${company.id}:`, err);
      }
      routineServiceInstance?.start(company.id);
    }
    // ---- Command palette service (Phase 5 — M30 T4) -----------------------
    //
    // Built AFTER `ipcHandlers` so we can wire the dispatcher against the
    // registered handler functions directly (same source of truth, no
    // duplicate business logic). Built BEFORE `registerIpcHandlers` so
    // T5's `command.*` IPC layer can register its handlers on top of
    // this service without a second orchestration pass.
    //
    // The NLU classifier uses the provider router through the provider
    // factory — in test mode it runs against a stub complete() closure
    // that echoes a canned complex_request back, which keeps all three
    // existing E2E specs semantics-identical. The real completion path
    // (M30 T1) is wired via `resolveProvider`.
    const classifierComplete = async ({
      system,
      user,
    }: {
      system: string;
      user: string;
    }): Promise<string> => {
      // Hook: wire into provider-router.streamCompletion once M30 T1 is
      // fully integrated with the main-process provider factory. For now
      // return a deterministic complex_request JSON so the classifier
      // never crashes a palette invocation when no provider is configured.
      void system;
      void user;
      return JSON.stringify({
        intent: 'complex_request',
        entities: {},
        confidence: 0,
        missingSlots: [],
      });
    };
    // Test-mode swap: when `NODE_ENV === 'test'` we bypass the LLM
    // completion seam entirely and use `createTestClassifier()` — a
    // deterministic canned table + sentinel override that lets the
    // Playwright command-palette spec exercise the full parse → fill
    // → execute → history loop without a live provider. Production
    // and dev still use the real `createIntentClassifier`.
    const commandClassifier = testMode
      ? createTestClassifier()
      : createIntentClassifier({ complete: classifierComplete });
    // DB rows type `status` as `string`; shared-types narrows to the
    // `EmployeeStatus` / `TicketStatus` unions. The casts below are
    // safe — the DB schema's CHECK constraints and repo write paths
    // never insert values outside those unions — and avoid threading
    // a row-mapper into the resolver seam for a purely structural diff.
    const commandResolver = createEntityResolver({
      listEmployees: async (companyId: string) =>
        employeesRepo.listByCompany(companyId) as unknown as Employee[],
      getTicketById: async (id: string, companyId: string) => {
        const t = ticketsRepo.getById(id);
        if (!t || t.companyId !== companyId) return null;
        return t as unknown as Ticket;
      },
      searchTickets: async (query: string, companyId: string) => {
        const q = query.toLowerCase();
        const rows = ticketsRepo
          .listByCompany(companyId)
          .filter(
            (t) =>
              t.title.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q),
          );
        return rows as unknown as Ticket[];
      },
      searchVault: async (query: string, companyId: string) => {
        const hits = vaultService.search(companyId, query);
        // Resolver expects VaultFileRankedLike = { file: VaultFile; rank?: number }.
        // VaultSearchResult is a thin projection of VaultFile — hydrate the
        // full row via `vaultService.get()` so the resolver's stringifier
        // sees the canonical shape.
        return hits
          .map((r) => {
            const file = vaultService.get(r.id);
            if (!file) return null;
            return { file, rank: r.rank };
          })
          .filter(
            (x): x is { file: NonNullable<ReturnType<typeof vaultService.get>>; rank: number } =>
              x !== null,
          );
      },
      listRoles: async () => roleLoader.listRoles(),
      listMeetings: async (companyId: string) =>
        meetingsRepo.listByCompany(companyId) as unknown as Meeting[],
      getActiveMeeting: async (companyId: string) =>
        meetingsRepo.getActive(companyId) as unknown as Meeting | null,
    });
    const commandSlotFiller = createSlotFiller();

    // ---- Agentic loop service (Phase 5 — M31 T4) --------------------------
    //
    // Front-door for the command-palette `complex_request` intent. Built
    // AFTER the orchestrator (so the pause-gate observer can consult
    // `isCompanyPaused` on every provider completion) and BEFORE the
    // CommandService (so the handlers dispatch map can inject
    // `agenticLoopStart`). `buildTools` runs per invocation — every
    // loop run gets a fresh, company-scoped tool set so stale company
    // bindings never bleed across concurrent runs.
    //
    // In test mode (`NODE_ENV === 'test'`), `resolveComplete` returns
    // `createTestAgenticCompleteFn()` — a deterministic canned
    // `LoopCompleteFn` mirroring the M30 `createTestClassifier` seam.
    // The production branch wraps `streamAgent` from the provider
    // router into the loop's non-streaming request/response shape by
    // accumulating delta chunks + end-of-stream usage. T6 will thread
    // live step deltas to the palette; T7 will plug the settings-
    // driven budget overrides; T8 is the full E2E round-trip.
    //
    // `humanUserId: 'user'` matches CommandService's default actorId —
    // keeps audit events and thread memberships consistent with the
    // Phase 1 single-user posture.
    agenticLoopServiceInstance = createAgenticLoopService({
      employeesRepo: {
        findSystemByRoleId: (cid, rid) => {
          const row = employeesRepo.findSystemByRoleId(cid, rid);
          return row ? { id: row.id } : null;
        },
        // M32 T3 — explicit-employeeId path on AgenticLoopService.start().
        // Maps the production EmployeeRow shape onto AgenticLoopEmployeeLookup
        // so the loop can level-gate the write-side tool registry. Older
        // rows without an explicit `isSystem` flag default to false (M31
        // schema migration backfilled, but defending against legacy reads).
        getById: (id) => {
          const row = employeesRepo.getById(id);
          if (!row) return null;
          return {
            id: row.id,
            level: row.level,
            isSystem: row.isSystem ?? false,
            companyId: row.companyId,
          };
        },
      },
      threadsRepo: {
        // The agentic-loop service widens `kind` to `string` and
        // `memberKind` to `'user' | 'employee' | string` in its
        // structural contract so tests can hand-roll fakes without
        // pulling the full drizzle row types. At runtime the service
        // only ever passes the canonical Phase-1 values (`'dm'`,
        // `'user'`, `'employee'`), so narrowing at the boundary is
        // sound. The same pattern covers `messagesRepo.append` below.
        create: (input) =>
          threadsRepo.create({
            companyId: input.companyId,
            kind: input.kind as Parameters<typeof threadsRepo.create>[0]['kind'],
            subject: input.subject,
            createdBy: input.createdBy,
          }),
        addMember: (input) =>
          threadsRepo.addMember({
            threadId: input.threadId,
            memberId: input.memberId,
            memberKind: input.memberKind as Parameters<
              typeof threadsRepo.addMember
            >[0]['memberKind'],
            ...(input.roleInThread !== undefined ? { roleInThread: input.roleInThread } : {}),
          }),
      },
      messagesRepo: {
        append: (input) => messagesRepo.append(input),
      },
      runsRepo: {
        start: (input) => runsRepo.start(input),
        finish: (id, input) => runsRepo.finish(id, input),
      },
      budgetGovernance: budgetGovernanceServiceInstance,
      bus,
      orchestrator: {
        // Module-level `orchestrator` handle is nullable during the
        // brief window between early-crash + will-quit cleanup. Treat
        // "no orchestrator" as "not paused" so a mid-teardown run can
        // still settle cleanly rather than deadlocking on the gate.
        isCompanyPaused: (cid) => orchestrator?.isCompanyPaused(cid) ?? false,
      },
      buildTools: ({ companyId, employee }) => {
        // M33 T6 — resolve the actor's roleId once per run. The
        // `AgenticLoopEmployeeContext` surface is intentionally narrow
        // (id/level/isSystem) for M31/M32 compat; the roleId lookup
        // lives at the composition root where the repo is in scope.
        // Zero-cost for the common M31 case (system-agent) — one row
        // lookup per agentic-loop start, never per-tool-call.
        const actorRow = employeesRepo.getById(employee.id);
        const roleId = actorRow?.roleId ?? '';
        const employeeWithRole = { ...employee, roleId };

        if (testMode) {
          // Canned tool set — no repo access, deterministic envelopes
          // per tool. Level-gated mirror of the production composition,
          // so E2E specs that pass an explicit employeeId (M32 T3) get
          // the same write-side subset they'd get in production. T6
          // threads `roleId` through so the test composer's copilot
          // branch (`createTestToolsForEmployee` in
          // `test-agentic-tools.ts`) picks up `query_copilot_insights`
          // when the actor is the system-copilot pseudo-employee.
          return createTestToolsForEmployee({ companyId, employee: employeeWithRole });
        }

        // ─── Production composition (M32 T3 + M33 T6) ───────────────
        // Read-side tools are always exposed (every actor can query).
        const readSide = createAgenticTools({
          companyId,
          employeesRepo,
          ticketsRepo,
          projectsRepo,
          meetingsRepo,
          vaultRepo,
          auditRepo,
        });

        // M33 T6 — copilot branch. When the actor is the company's
        // `system-copilot` pseudo-employee, the registry is
        // `[...readSide, ...copilotTools]` — the M32 write-side set is
        // specifically carved out so the copilot never decomposes,
        // delegates, or reviews. The system-agent branch below stays
        // unchanged with its original M31 read-only + M32 write-side
        // tool set.
        if (roleId === SYSTEM_COPILOT_ROLE_ID) {
          const copilotTools = buildCopilotToolRegistry(
            { roleId },
            {
              companyId,
              copilotInsightsRepo: {
                listActive: (filter) => copilotInsightsRepo.listActive(filter),
              },
            },
          );
          return [...readSide, ...copilotTools];
        }

        // ─── Write-side composition (M32 T3) — every non-copilot actor
        // Write-side tools are level-gated by `buildWriteSideTools` per
        // Phase 5 §7.1: decompose for Officer/Senior-Mgmt/Management/
        // system-agent, delegate+review for Management/Supervisor/Lead/
        // system-agent. ICs receive an empty write-side array.

        // Conservative workload provider — open-ticket count is a real
        // repo lookup; in-meeting + completion-history are stubbed for
        // T3 and tightened in M33 (per agentic-tools-write.ts §T3 notes
        // and Phase 5 follow-ups). Conservative defaults still produce
        // a deterministic workload score; emptier inboxes still rank
        // higher, which is the load-balancing intent.
        const workload: WriteSideWorkloadProvider = {
          openTicketCount: (eid) => {
            try {
              return ticketsRepo
                .listByCompany(companyId)
                .filter((t) => t.assigneeId === eid && t.status !== 'done').length;
            } catch {
              return 0;
            }
          },
          // Track 2 — wired workload signals (replaces M32 stubs that
          // returned `false` and `null` unconditionally and degraded the
          // delegation scoring function in `agentic-tools-write.ts`).
          //
          // `inMeeting`: a candidate is in-meeting iff the company has an
          // active meeting AND the candidate's id is in the meeting's
          // serialized attendees list. Active meetings pause turn dispatch
          // for those attendees, so delegating a ticket to them creates
          // ghost work; the planner should de-prioritize.
          //
          // `avgCompletionMs`: averaged ticket cycle time
          // (`closedAt - createdAt`) across all CLOSED tickets the
          // candidate was the assignee on. The planner clamps against
          // `pastPerformanceCeilingMs` (default 48h), so this signal
          // differentiates fast vs. slow closers within that window.
          // `subtaskType` is accepted for forward compatibility but
          // ignored in V1 — ticket labels do not yet carry a subtask-type
          // taxonomy that maps cleanly onto the planner's bucket. Future
          // refinement: filter by labels matching `subtaskType` when the
          // taxonomy stabilizes.
          //
          // Both implementations are wrapped in try/catch and degrade to
          // the conservative defaults (`false` / `null`) on repo errors —
          // the agentic loop must not abort over a workload signal hiccup.
          inMeeting: (employeeId) => {
            try {
              const active = meetingsRepo.getActive(companyId);
              if (!active) return false;
              const attendees = JSON.parse(active.attendeesJson) as unknown;
              if (!Array.isArray(attendees)) return false;
              return attendees.some((a) => a === employeeId);
            } catch {
              return false;
            }
          },
          avgCompletionMs: (employeeId, _subtaskType) => {
            try {
              const closedAssigned = ticketsRepo
                .listByAssignee(employeeId)
                .filter((t) => t.closedAt !== null && t.closedAt > t.createdAt);
              if (closedAssigned.length === 0) return null;
              const total = closedAssigned.reduce(
                (sum, t) => sum + ((t.closedAt ?? 0) - t.createdAt),
                0,
              );
              return total / closedAssigned.length;
            } catch {
              return null;
            }
          },
        };

        // Write-side orchestrator seam. Delegation is not complete when a
        // ticket row is merely assigned: the assignee needs a ticket thread
        // message and an actual queued reply turn. Keep that bridge here,
        // where threads/messages/orchestrator are all in scope.
        const writeOrchestrator: WriteSideOrchestrator = {
          queueDelegatedTicket: async (args) => {
            if (!orchestrator) {
              throw new Error(
                '[agentic-loop] orchestrator is unavailable for delegated ticket pickup',
              );
            }

            const ticket = ticketsRepo.getById(args.ticketId);
            if (!ticket || ticket.companyId !== args.companyId) {
              throw new Error(
                `[agentic-loop] delegated ticket "${args.ticketId}" is not available in company "${args.companyId}"`,
              );
            }

            const assignee = employeesRepo.getById(args.employeeId);
            if (!assignee || assignee.companyId !== args.companyId) {
              throw new Error(
                `[agentic-loop] delegated assignee "${args.employeeId}" is not available in company "${args.companyId}"`,
              );
            }

            let threadId = ticket.threadId;
            if (!threadId) {
              threadId = threadsRepo.create({
                companyId: args.companyId,
                kind: 'ticket',
                subject: ticket.title,
                createdBy: args.actorId,
              });
              ticketsRepo.setThreadId(args.ticketId, threadId);
            }

            const ensureMember = (memberId: string, memberKind: 'user' | 'employee'): void => {
              const members = threadsRepo.listMembers(threadId);
              const alreadyMember = members.some(
                (member) => member.memberId === memberId && member.memberKind === memberKind,
              );
              if (!alreadyMember) {
                threadsRepo.addMember({ threadId, memberId, memberKind });
              }
            };

            ensureMember(HUMAN_USER_ID, 'user');
            ensureMember(args.employeeId, 'employee');
            if (args.actorKind === 'employee' && args.actorId !== args.employeeId) {
              ensureMember(args.actorId, 'employee');
            }

            const actorRow =
              args.actorKind === 'employee' ? employeesRepo.getById(args.actorId) : null;
            const actorLabel = actorRow?.name ?? args.actorId;
            const description = ticket.description.trim();
            const triggerMessageId = messagesRepo.append({
              threadId,
              authorId: args.actorId,
              authorKind: args.actorKind === 'user' ? 'user' : 'employee',
              isAgentInitiated: args.actorKind !== 'user',
              content: `Delegated by ${actorLabel}: **${ticket.title}**\n\n${description.length > 0 ? description : '(no description)'}\n\nBegin work now. Reply with your assessment, concrete next action, blockers, and expected handoff.`,
            });

            orchestrator
              .enqueueAgentReply({
                threadId,
                employeeId: args.employeeId,
                triggerMessageId,
              })
              .catch((err: unknown) => {
                console.error(
                  `[agentic-loop] delegated ticket pickup failed for ticket=${args.ticketId}:`,
                  err,
                );
              });

            return { threadId, triggerMessageId };
          },
          isCompanyPaused: (cid) => orchestrator?.isCompanyPaused(cid) ?? false,
          canResolveProvider: async (employeeId) => {
            const emp = employeesRepo.getById(employeeId);
            if (!emp) return false;
            try {
              await resolveProvider(emp);
              return true;
            } catch {
              return false;
            }
          },
        };

        // Provider seam for the write-side tools' inner LLM calls
        // (`decompose_project` for plan generation, `review_deliverable`
        // for the review summary). Resolves the actor's configured
        // provider+model on each invocation — the write-side tools fire
        // infrequently enough that re-resolving per call is cheaper
        // than caching across runs and dealing with stale provider
        // settings. Wraps `streamAgent` into the non-streaming
        // request/response shape `WriteSideCompleteFn` expects.
        const writeProviderComplete: WriteSideCompleteFn = async (req) => {
          const actorRow = employeesRepo.getById(employee.id);
          if (!actorRow) {
            throw new Error(
              `[agentic-loop] Write-side actor "${employee.id}" not found in employees repo.`,
            );
          }
          const factory = createProviderFactory({ providersService, secretsStore, companiesRepo });
          const resolved = await factory.resolveForEmployee(actorRow);
          let text = '';
          for await (const chunk of streamAgent({
            providerFactory: resolved.stream,
            system: req.system,
            messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
          })) {
            if (req.signal.aborted) {
              throw new DOMException('Aborted', 'AbortError');
            }
            if (chunk.kind === 'delta') {
              text += chunk.delta;
            }
            // 'done' carries usage tallies — write-side `WriteSideCompleteFn`
            // doesn't surface usage upstream, so we discard them here. The
            // outer agentic loop's read-side telemetry covers the run-level
            // accounting; per-tool inner-call accounting lands in M33.
          }
          return { text };
        };

        const writeSide = buildWriteSideTools(employee, {
          companyId,
          actorId: employee.id,
          actorKind: 'employee',
          employeesRepo,
          ticketsRepo,
          projectsRepo,
          // C4 (audit 2026-05-07) — `delegate_subtask` writes here
          // instead of inserting tickets directly.
          pendingDelegationsRepo,
          bus,
          orchestrator: writeOrchestrator,
          providerComplete: writeProviderComplete,
          workload,
          roleLookup: roleLoader,
          // T7 — settings-repo-backed planner guardrails replace the
          // static PLANNER_DEFAULTS fallback. Every write-side tool call
          // now reads the user's current planner settings live.
          // `loadDenominator` and `pastPerformanceCeilingMs` are internal
          // scoring constants (not user-facing settings), so they stay at
          // their PLANNER_DEFAULTS values.
          getPlanner: () => {
            const p = settingsRepo.getPlanner();
            return {
              ...p,
              loadDenominator: 5,
              pastPerformanceCeilingMs: 172_800_000,
            };
          },
        });

        return [...readSide, ...writeSide];
      },
      resolveComplete: async ({ systemAgentId }) => {
        if (testMode) {
          // Canned path — no LLM, no keychain, no network. Matches
          // the `createTestClassifier` seam exactly so every E2E spec
          // can round-trip the agentic loop without external infra.
          return {
            complete: createTestAgenticCompleteFn(),
            provider: 'test-mode',
            model: 'test-mode-agent',
          };
        }
        // Production — resolve the system-agent's configured provider
        // + model via the standard factory, then wrap `streamAgent`
        // into a native-tool-use `LoopCompleteFn` (post-C2 migration,
        // audit 2026-05-07). For each `complete()` call:
        //
        //   1. Translate the loop's structured `LoopMessage[]` (which
        //      carries assistant tool-call parts and tool-result parts
        //      for the round-trip) into provider-router `StreamMessage[]`
        //      with structured content. The provider router casts
        //      these to Vercel AI SDK `CoreMessage` shape internally.
        //
        //   2. Convert the loop's tool descriptors (JSON Schema) into
        //      Vercel AI SDK CoreTool records via `buildProviderTools`,
        //      using a NO-OP execute callback (see comment below). The
        //      SDK emits `tool-call` events without auto-running them
        //      — the loop dispatches via its zod-validated registry so
        //      typed failure modes (invalid_args / timeout / threw) and
        //      the <observation> trust-fence stay in one place.
        //
        //   3. Drain the stream, accumulating text deltas, tool-call
        //      events, and the terminal usage record. Return both the
        //      text and the structured `toolCalls` to the loop.
        const emp = employeesRepo.getById(systemAgentId);
        if (!emp) {
          throw new Error(`[agentic-loop] system-agent employee ${systemAgentId} not found`);
        }
        const factory = createProviderFactory({ providersService, secretsStore, companiesRepo });
        const resolved = await factory.resolveForEmployee(emp);
        const { providerName, model, stream } = resolved;
        const complete: LoopCompleteFn = async ({ system, messages, tools, signal }) => {
          let text = '';
          let promptTokens = 0;
          let completionTokens = 0;
          let cachedInputTokens: number | undefined;
          let cacheWriteTokens: number | undefined;
          const collectedToolCalls: LoopProviderToolCall[] = [];

          // Translate structured LoopMessage[] → StreamMessage[].
          const streamMessages: StreamMessage[] = messages.map((m: LoopMessage) => {
            if (typeof m.content === 'string') {
              return { role: m.role, content: m.content } as StreamMessage;
            }
            // Structured assistant or tool message — pass parts through
            // verbatim. The Anthropic adapter casts to CoreMessage[]
            // and the structured content matches CoreMessage's shape.
            return {
              role: m.role,
              content: m.content as StreamContentPart[],
            } as StreamMessage;
          });

          // Build the provider's tool surface. We use a NO-OP execute
          // callback that throws — the SDK emits the tool-call event on
          // `fullStream` BEFORE it would invoke execute, and we abort
          // the stream after the model's first turn anyway via
          // maxSteps:1 (the adapter's default). The throw in execute
          // is belt-and-suspenders: if the SDK ever did invoke it,
          // the error is captured and surfaced as a tool-call to the
          // loop's registry instead of leaking provider state.
          const toolSpecs: ToolSpec[] = tools.map((td) => ({
            name: td.name,
            description: td.description,
            inputSchema: td.jsonSchema,
            execute: (async (_args: unknown) => {
              // Loop dispatches tools via its registry; SDK execute is
              // never reached when maxSteps === 1.
              throw new Error(
                '[agentic-loop] provider attempted to execute tool — loop should dispatch instead.',
              );
            }) as ToolSpec['execute'],
          }));
          const providerTools = toolSpecs.length > 0 ? buildProviderTools(toolSpecs) : undefined;

          for await (const chunk of streamAgent({
            providerFactory: stream,
            system,
            messages: streamMessages,
            tools: providerTools,
            // maxSteps:1 — the loop owns multi-turn iteration. The SDK
            // emits the model's first turn (text + tool-calls) and
            // stops; the loop dispatches and re-enters complete().
            maxSteps: 1,
            signal,
          })) {
            if (signal.aborted) {
              throw new DOMException('Aborted', 'AbortError');
            }
            if (chunk.kind === 'delta') {
              text += chunk.delta;
            } else if (chunk.kind === 'tool-call') {
              collectedToolCalls.push({
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
                args: chunk.args,
              });
            } else if (chunk.kind === 'done') {
              promptTokens = chunk.usage.promptTokens;
              completionTokens = chunk.usage.completionTokens;
              // C3 — Anthropic prompt-caching token counts surface here
              // when caching is enabled at the adapter. Both fields are
              // optional; a non-Anthropic provider (or Anthropic with
              // cache disabled) leaves them undefined.
              cachedInputTokens = chunk.usage.cachedInputTokens;
              cacheWriteTokens = chunk.usage.cacheWriteTokens;
            }
            // tool-result events are not produced (no execute) — ignore.
          }

          // C3 — compute real cost per iteration so the loop's
          // `LoopBudgetUsed.costUsd` accumulator and the agentic-loop
          // service's run row reflect cache-aware spend. The wrapper
          // returns a decimal string for storage; we parse to a number
          // here because the LoopProviderCompletion.costUsd field is
          // a numeric per-iteration accumulator.
          const costUsdString = calcCost({
            provider: providerName,
            model,
            promptTokens,
            completionTokens,
            ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
            ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
          });

          const completion: LoopProviderCompletion = {
            text,
            toolCalls: collectedToolCalls,
            usage: { promptTokens, completionTokens },
            provider: providerName,
            model,
            costUsd: Number(costUsdString),
          };
          return completion;
        };
        return { complete, provider: providerName, model };
      },
      humanUserId: 'user',
    });

    // ---- Proactive trigger service (Phase 6 — Slice 1-3) ----------------
    //
    // Goal decomposition + background work scanning + setEnabled toggle.
    // Constructed HERE because the trigger consumes `agenticLoopService`
    // (just created above) and `orchestrator.isCompanyPaused`. The IPC
    // surface registered earlier closes over `proactiveTriggerServiceInstance`
    // via a lazy resolver — see the `proactiveTriggerService` block in the
    // `createIpcHandlers({...})` deps. Without this assignment, the
    // proactive.* IPC channels throw and the autonomy-policy Switch in
    // Settings snaps back to OFF after every flip.
    proactiveTriggerServiceInstance = createProactiveTriggerService({
      orchestrator: {
        enqueueChat: async (args) => {
          if (!orchestrator) {
            throw new Error('[proactive] orchestrator not available for enqueueChat');
          }
          await orchestrator.enqueueChat(args);
        },
        isCompanyPaused: (cid) => orchestrator?.isCompanyPaused(cid) ?? false,
      },
      agenticLoopService: {
        /*
         * Composition order guarantees `agenticLoopServiceInstance` is
         * initialized before any IPC consumer of this dep struct can fire;
         * the optional-chaining alternative would silently return undefined
         * instead of throwing, which violates the ResolveProvider contract
         * on `start`.
         */
        // biome-ignore lint/style/noNonNullAssertion: see comment above — non-null is a composition-order invariant
        start: (args) => agenticLoopServiceInstance!.start(args),
      },
      authorityResolver: {
        resolveEmployee: (cid, eid) => authorityResolver.resolveEmployee(cid, eid),
      },
      employeesRepo: {
        getById: (id) => {
          const row = employeesRepo.getById(id);
          if (!row) return null;
          return {
            id: row.id,
            companyId: row.companyId,
            level: row.level,
            isSystem: row.isSystem ?? false,
          };
        },
        listByCompany: (cid) =>
          employeesRepo.listByCompany(cid).map((e) => ({
            id: e.id,
            companyId: e.companyId,
            level: e.level,
            isSystem: e.isSystem ?? false,
          })),
      },
      goalsRepo: {
        listByCompany: (cid) =>
          goalsRepo.listByCompany(cid).map((g) => ({
            id: g.id,
            companyId: g.companyId,
            title: g.title,
            description: g.description ?? '',
            status: g.status,
          })),
      },
      ticketsRepo: {
        listByCompany: (cid) =>
          ticketsRepo.listByCompany(cid).map((t) => ({
            id: t.id,
            companyId: t.companyId,
            title: t.title,
            description: t.description ?? '',
            status: t.status,
            assigneeId: t.assigneeId ?? null,
            reporterId: t.reporterId,
            reporterKind: t.reporterKind,
            priority: t.priority,
          })),
      },
      projectsRepo: {
        listByCompany: (cid) =>
          projectsRepo.listByCompany(cid).map((p) => ({
            id: p.id,
            companyId: p.companyId,
            goalId: p.goalId ?? null,
            title: p.title,
            description: p.description ?? '',
            status: p.status,
          })),
      },
      bus: {
        // The proactive trigger service narrows `actorKind` to `string`
        // in its structural deps (so its tests can hand-roll fakes
        // without depending on the shared-types `ActorKind` union). At
        // runtime it only emits canonical values (`'orchestrator'`,
        // `'employee'`, `'system'`), so widening at this boundary via
        // a cast is sound and keeps the trigger service decoupled
        // from the wire enum.
        emit: (input) =>
          bus.emit({
            ...input,
            actorKind: input.actorKind as Parameters<typeof bus.emit>[0]['actorKind'],
          }),
      },
      settingsRepo: {
        getProactive: () => settingsRepo.getProactive(),
      },
    });

    // ---- Copilot analyzer (M33 T4) --------------------------------------
    //
    // Periodic + event-triggered insight producer. Stands alongside the
    // agentic loop: both consume the pause gate, both are pure
    // subscribers of the composition-root-wired repos + bus. The
    // analyzer resolves the system-copilot employee on every tick via
    // `findSystemByRoleId`; the per-tick runs row carries kind='copilot'
    // so Telemetry → Cost discriminates copilot spend without any
    // renderer changes (M33 T7 surfaces a label in settings).
    //
    // Test-mode (`NODE_ENV === 'test'`) wires a canned complete fn that
    // echoes a fixed JSON array — keeps Phase 5 E2E specs semantics-
    // identical without a real provider. The production branch wraps
    // `streamAgent` into a non-streaming text+usage shape.
    copilotAnalyzerServiceInstance = createCopilotAnalyzerService({
      companiesRepo: { list: () => companiesRepo.list() },
      employeesRepo: {
        findSystemByRoleId: (cid, rid) => {
          const row = employeesRepo.findSystemByRoleId(cid, rid);
          return row ? { id: row.id } : null;
        },
      },
      runsRepo: {
        start: (input) => runsRepo.start(input),
        finish: (id, input) => runsRepo.finish(id, input),
      },
      budgetGovernance: budgetGovernanceServiceInstance,
      copilotInsightsRepo: {
        listActive: (filter) => copilotInsightsRepo.listActive(filter),
        upsertWithDedup: (draft, ctx) => copilotInsightsRepo.upsertWithDedup(draft, ctx),
        expireStale: (now) => copilotInsightsRepo.expireStale(now),
        listStale: (now) => copilotInsightsRepo.listStale(now),
      },
      copilotEventWindow: {
        snapshot: (cid) => copilotEventWindow.snapshot(cid),
      },
      bus,
      orchestrator: {
        isCompanyPaused: (cid) => orchestrator?.isCompanyPaused(cid) ?? false,
      },
      // Per-tick snapshot of copilot settings. T7 wires the real settings
      // repo read — copilot settings are global today so `companyId` is
      // intentionally ignored. Returning a fresh snapshot every call
      // guarantees the analyzer picks up mutations on its next tick
      // without needing explicit invalidation plumbing.
      getSettings: (_companyId: string) => {
        const snap = settingsRepo.getCopilot();
        return {
          enabled: snap.enabled,
          intervalMinutes: snap.intervalMinutes,
          categories: snap.categories,
          categoryWeights: settingsRepo.getCopilotWeights().weights,
        };
      },
      resolveComplete: async ({ companyId, systemCopilotId }) => {
        if (testMode) {
          // M33 T8 — three-tier canned copilot provider seam.
          // Sentinel `__ECHO_COPILOT__:<json>` → runtime / canned table
          // substring match → `FIXTURE_COPILOT_EMPTY` fallback (shape-
          // identical to the T4 inline placeholder for drifted
          // prompts). T9 registers per-spec fixtures via
          // `addCopilotFixture` without touching this wire.
          const complete: CopilotAnalyzerCompleteFn = createTestCopilotComplete();
          return { complete, provider: 'test-mode', model: 'test-copilot' };
        }
        // Production — resolve the system-copilot's configured
        // provider + model via the factory, then adapt `streamAgent`
        // into the analyzer's non-streaming request/response shape.
        const emp = employeesRepo.getById(systemCopilotId);
        if (!emp) {
          throw new Error(
            `[copilot-analyzer] system-copilot employee ${systemCopilotId} not found for company ${companyId}`,
          );
        }
        const factory = createProviderFactory({ providersService, secretsStore, companiesRepo });
        const resolved = await factory.resolveForEmployee(emp);
        const { providerName, model, stream } = resolved;
        const complete: CopilotAnalyzerCompleteFn = async ({ system, user, signal }) => {
          let text = '';
          let promptTokens = 0;
          let completionTokens = 0;
          let cachedInputTokens: number | undefined;
          let cacheWriteTokens: number | undefined;
          for await (const chunk of streamAgent({
            providerFactory: stream,
            system,
            messages: [{ role: 'user', content: user }],
          })) {
            if (signal.aborted) {
              throw new DOMException('Aborted', 'AbortError');
            }
            if (chunk.kind === 'delta') {
              text += chunk.delta;
            } else if (chunk.kind === 'done') {
              promptTokens = chunk.usage.promptTokens;
              completionTokens = chunk.usage.completionTokens;
              // C3 — Anthropic prompt-caching surfaces these when the
              // adapter has cache control on. Copilot ticks share their
              // system prompt across iterations so caching pays off
              // quickly here.
              cachedInputTokens = chunk.usage.cachedInputTokens;
              cacheWriteTokens = chunk.usage.cacheWriteTokens;
            }
          }
          // C3 — real cost-per-call so the copilot run row attributes
          // spend correctly.
          const costUsdString = calcCost({
            provider: providerName,
            model,
            promptTokens,
            completionTokens,
            ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
            ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
          });
          return {
            text,
            promptTokens,
            completionTokens,
            costUsd: Number(costUsdString),
            provider: providerName,
            model,
          };
        };
        return { complete, provider: providerName, model };
      },
    });
    for (const company of companiesRepo.list()) {
      if (company.status === 'archived') continue;
      copilotAnalyzerServiceInstance.start(company.id);
    }

    // ---- Copilot event trigger (M33 T4) ---------------------------------
    //
    // Supplementary-tick dispatcher. Subscribes to the shared event bus
    // and debounces 4 signal types into a single analyzer tick per
    // company (30s debounce — Phase 5 §8.5 locked). Split from the
    // window (T3) to preserve pure-accumulator test isolation.
    copilotEventTriggerInstance = createCopilotEventTrigger({
      bus,
      analyzer: copilotAnalyzerServiceInstance,
    });
    copilotEventTriggerInstance.start();

    // Capture the live handle so the CommandHandlers dispatch map can
    // close over a non-null reference. Using the module-level
    // `agenticLoopServiceInstance` directly would force a `!` assertion
    // inside the closure (TS sees it as nullable); a local const keeps
    // the closure clean and prevents accidental re-binding during
    // later shutdown cleanup.
    const agenticLoopSvc = agenticLoopServiceInstance;

    commandServiceInstance = createCommandService({
      classifier: commandClassifier,
      resolver: commandResolver,
      slotFiller: commandSlotFiller,
      handlers: {
        employeesList: (req) => ipcHandlers.employeesList(req),
        employeesCreate: (req) => ipcHandlers.employeesCreate(req),
        employeesFire: (req) => ipcHandlers.employeesFire(req),
        // Track 3 — wire the natural-language `promote` command. The
        // IPC handler has shipped (`employees.promote`, register.ts:687)
        // and is exercised by `employees-promote-handlers.test.ts`, but
        // the CommandService dispatcher slot was never connected, so
        // typing "promote Alice to CTO" in the palette emitted
        // `handler_error`. The IPC handler takes `{ employeeId, newRoleId }`
        // and returns the full promotion record; the dispatcher wants
        // `{ employeeId, roleId, newLevel }` → `Promise<void>`. We adapt
        // at the boundary: forward `roleId` as `newRoleId`, ignore the
        // classifier-supplied `newLevel` (the IPC handler derives the
        // level from the role spec — passing it here would be redundant
        // and create a divergence risk between classifier output and the
        // role-loader's source of truth), and discard the response.
        employeesPromote: async (req) => {
          await ipcHandlers.employeesPromote({
            employeeId: req.employeeId,
            newRoleId: req.roleId,
          });
        },
        ticketsAssign: (req) =>
          ipcHandlers.ticketsAssign({ ticketId: req.ticketId, assigneeId: req.assigneeId }),
        ticketsCreate: (req) => ipcHandlers.ticketsCreate(req),
        ticketsClose: (req) => ipcHandlers.ticketsClose(req),
        ticketsReopen: (req) => ipcHandlers.ticketsReopen(req),
        projectsCreate: (req) =>
          ipcHandlers.projectsCreate({
            companyId: req.companyId,
            title: req.title,
            description: req.description,
          }),
        goalsCreate: (req) => ipcHandlers.goalsCreate(req),
        meetingsCall: (req) =>
          ipcHandlers.meetingsCall({
            companyId: req.companyId,
            chairId: req.chairId,
            attendeeIds: req.attendeeIds,
            agenda: req.agenda,
          }),
        meetingsEnd: (req) => ipcHandlers.meetingsEnd({ meetingId: req.meetingId }),
        vaultSearch: async (req) => {
          const hits = await ipcHandlers.vaultSearch(req);
          return hits.map((r) => ({
            id: r.id,
            originalName: r.originalName,
            rank: r.rank,
          }));
        },
        // M31 T4 — agentic loop entry point for `complex_request`.
        // CommandService's dispatcher calls this with the original
        // user text; the service resolves the per-company system-
        // agent, opens a Copilot thread, and fires the ReAct loop in
        // the background. `runId`/`threadId` flow back to the palette
        // via the `ExecuteResult`.
        agenticLoopStart: (req) =>
          agenticLoopSvc.start({
            companyId: req.companyId,
            userText: req.text,
          }),
      },
      historyRepo: commandHistoryRepo,
      bus,
    });

    unregisterIpc = registerIpcHandlers(ipcHandlers, bus);

    // ---- RAG IPC handlers (Phase 5 — M29 T7) -------------------------------
    //
    // Kept as a sibling registration block rather than folded into
    // `createIpcHandlers` because the rag subsystem is optional at runtime
    // (invariant #7): the `ragService` handle may be null for the whole
    // session, and the rebuild closure has to close over `threadsRepo` +
    // `messagesRepo` + `ragService` directly — none of which belong on the
    // `IpcHandlers` DI surface just for this one callsite. The three
    // channel strings are in `REQUEST_CHANNELS` so `unregisterIpc()` will
    // strip them on shutdown alongside every other channel.
    const ragHandlers = buildRagHandlers({
      embeddingsRepo,
      isRagEnabled: () => ragService !== null,
      deleteAllForCompany: (companyId: string) => {
        // The embeddings repo exposes `deleteBySource(sourceId)` but no
        // bulk-by-company helper. Iterate the distinct source-ids for
        // this company and sum the per-source delete counts — one write
        // per source keeps the surface area tiny and avoids growing the
        // repo just for this caller.
        const rows = embeddingsRepo.listByCompany(companyId);
        const uniqueSourceIds = new Set(rows.map((r) => r.sourceId));
        let deleted = 0;
        for (const sourceId of uniqueSourceIds) {
          deleted += embeddingsRepo.deleteBySource(sourceId);
        }
        return deleted;
      },
      rebuildSources: async (companyId: string) => {
        if (ragService === null) return 0;
        const result = await rebuildCompanyRagSources({
          companyId,
          service: { indexSource: (input) => ragService.indexSource(input) },
          threadsRepo: {
            listByCompany: (cid) => threadsRepo.listByCompany(cid),
          },
          messagesRepo: {
            listByThread: (threadId) => messagesRepo.listByThread(threadId),
          },
          meetingsRepo: {
            listByCompany: (cid) => meetingsRepo.listByCompany(cid),
          },
          ticketsRepo: {
            listByCompany: (cid) => ticketsRepo.listByCompany(cid),
          },
          goalsRepo: {
            listByCompany: (cid) => goalsRepo.listByCompany(cid),
          },
          projectsRepo: {
            listByCompany: (cid) => projectsRepo.listByCompany(cid),
          },
          vaultRepo: {
            listByCompany: (cid) => vaultRepo.listByCompany(cid),
          },
          logger: {
            error: (msg, err) => console.error(msg, err),
            warn: (msg) => console.warn(msg),
          },
        });
        return result.scheduled;
      },
    });
    ipcMain.handle('rag.stats', (_evt, companyId: string) => ragHandlers.stats(companyId));
    ipcMain.handle('rag.rebuildAll', (_evt, companyId: string) =>
      ragHandlers.rebuildAll(companyId),
    );
    ipcMain.handle('rag.deleteForCompany', (_evt, companyId: string) =>
      ragHandlers.deleteForCompany(companyId),
    );

    // ---- Enhanced AI IPC handlers (Phase 5 — M32) ------------------------
    //
    // Exposes semantic chunking, query expansion, long-term memory,
    // knowledge graph, multi-turn planning, and streaming responses to
    // the renderer process. All handlers gracefully degrade when the
    // enhanced AI service is not available (LLM not configured).
    const enhancedAiHandlers = buildEnhancedAiHandlers({
      enhancedAiService,
    });
    ipcMain.handle('enhancedAi.stats', () => enhancedAiHandlers.stats());
    ipcMain.handle('enhancedAi.query', async (_evt, input) => enhancedAiHandlers.query(input));
    ipcMain.handle('enhancedAi.indexWithSemanticChunking', async (_evt, input) =>
      enhancedAiHandlers.indexWithSemanticChunking(input),
    );
    ipcMain.handle('enhancedAi.extractAndStoreFacts', async (_evt, input) =>
      enhancedAiHandlers.extractAndStoreFacts(input),
    );
    ipcMain.handle('enhancedAi.queryKnowledge', async (_evt, input) =>
      enhancedAiHandlers.queryKnowledge(input),
    );
    ipcMain.handle('enhancedAi.createPlan', async (_evt, input) =>
      enhancedAiHandlers.createPlan(input),
    );
    ipcMain.handle('enhancedAi.getStats', async () => enhancedAiHandlers.getStats());

    ipcMain.handle('system.selectDirectory', async (event) => {
      const owner =
        BrowserWindow.fromWebContents(event.sender) ??
        BrowserWindow.getFocusedWindow() ??
        undefined;
      const options: Electron.OpenDialogOptions = {
        title: 'Select skill folder',
        properties: ['openDirectory', 'createDirectory'],
      };
      const result = owner
        ? await dialog.showOpenDialog(owner, options)
        : await dialog.showOpenDialog(options);
      return {
        canceled: result.canceled,
        folderPath: result.filePaths[0] ?? null,
      };
    });

    // ---- Command palette IPC handlers (Phase 5 — M30 T5, M31 T6) -----------
    //
    // Mounted as a sibling block rather than folded into `createIpcHandlers`
    // because CommandService sits above the handler factory — it consumes
    // other IPC handlers (tickets, projects, meetings, vault, employees)
    // as its dispatch target. The five channel strings are already listed
    // in `REQUEST_CHANNELS` so `unregisterIpc()` strips them on shutdown
    // alongside every other handler. M31 T6 adds `command.stop` for
    // agentic-loop cancellation; it needs the `AgenticLoopService` handle
    // directly (not through CommandService) because cancellation is
    // run-id-keyed rather than intent-keyed.
    if (agenticLoopServiceInstance === null) {
      throw new Error('agenticLoopServiceInstance must be initialized before command handlers');
    }
    const commandHandlers = buildCommandHandlers({
      commandService: commandServiceInstance,
      agenticLoopService: agenticLoopServiceInstance,
    });
    ipcMain.handle(
      'command.parse',
      (_evt, req: import('@team-x/shared-types').CommandParseRequest) =>
        commandHandlers['command.parse'](req),
    );
    ipcMain.handle(
      'command.execute',
      (_evt, req: import('@team-x/shared-types').IpcExecuteRequest) =>
        commandHandlers['command.execute'](req),
    );
    ipcMain.handle(
      'command.history',
      (_evt, req: import('@team-x/shared-types').CommandHistoryRequest) =>
        commandHandlers['command.history'](req),
    );
    ipcMain.handle(
      'command.suggest',
      (_evt, req: import('@team-x/shared-types').CommandSuggestRequest) =>
        commandHandlers['command.suggest'](req),
    );
    ipcMain.handle('command.stop', (_evt, req: import('@team-x/shared-types').CommandStopRequest) =>
      commandHandlers['command.stop'](req),
    );
    // Phase 5 — M32 T0 / F1. Palette step-log backfill on mount.
    ipcMain.handle('command.getRunSnapshot', (_evt, req: { runId: string }) =>
      commandHandlers['command.getRunSnapshot'](req),
    );

    // ---- Copilot IPC handlers (Phase 5 — M33 T5) ---------------------------
    //
    // Sibling registration block on the same pattern RAG and Command
    // use — the Copilot subsystem has its own runtime deps (analyzer
    // singleton + insights repo + bus emit for dismissals) and the
    // handlers module lives in `ipc/copilot-handlers.ts` alongside
    // `rag-handlers.ts`. The four channel strings are listed in
    // `REQUEST_CHANNELS` so `unregisterIpc()` strips them on shutdown.
    //
    // M33 T6 — `agenticLoopStart` is now wired via the copilot-service
    // front-door. The service resolves the per-company system-copilot
    // pseudo-employee via `findSystemByRoleId` and passes the id
    // through to `AgenticLoopService.start` as the explicit
    // `employeeId`, which selects the copilot branch in `buildTools`
    // above (readSide + query_copilot_insights, no write-side tools).
    // Wire contract (M31 parity): returns `{ runId, threadId }` — same
    // shape as `command.execute` complex_request so the M34 sidebar
    // can attach `useAgentStepStream` with zero wire-format branching.
    if (copilotAnalyzerServiceInstance === null) {
      throw new Error('copilotAnalyzerServiceInstance must be initialized before copilot handlers');
    }
    const copilotServiceInstance = createCopilotService({
      agenticLoopService: agenticLoopSvc,
      employeesRepo: {
        findSystemByRoleId: (cid, rid) => employeesRepo.findSystemByRoleId(cid, rid),
      },
    });
    const copilotHandlers = buildCopilotHandlers({
      copilotInsightsRepo,
      copilotAnalyzerService: copilotAnalyzerServiceInstance,
      bus,
      auditRepo,
      settingsRepo,
      isTestMode,
      agenticLoopStart: (req) =>
        copilotServiceInstance.ask({ companyId: req.companyId, text: req.text }),
    });
    ipcMain.handle(
      'copilot.insights',
      (_evt, req: import('@team-x/shared-types').CopilotInsightListArgs) =>
        copilotHandlers.insights(req),
    );
    ipcMain.handle(
      'copilot.dismiss',
      (_evt, req: import('@team-x/shared-types').CopilotDismissArgs) =>
        copilotHandlers.dismiss(req),
    );
    ipcMain.handle('copilot.ask', (_evt, req: import('@team-x/shared-types').CopilotAskArgs) =>
      copilotHandlers.ask(req),
    );
    ipcMain.handle(
      'copilot.configure',
      (_evt, req: import('@team-x/shared-types').CopilotConfigureArgs) =>
        copilotHandlers.configure(req),
    );

    // Local & Networked GGUF Support (v3.3.0). The remaining handlers register
    // the `localGguf.*` channel surface so the preload bridge has live handlers
    // to invoke; each still-stubbed handler throws a not-implemented error until
    // its owning phase lands the real service (endpoint -> P5, hf -> P7,
    // benchmark -> P10). Phase 2 (runtime/pool) and Phase 3 (library) are now
    // LIVE: their handlers delegate to the services constructed above.
    registerLocalGgufLibraryHandlers(ipcMain, { library: libraryService });
    registerLocalGgufRuntimeHandlers(ipcMain, { runtime: runtimeService, pool: poolService });
    registerLocalGgufHfHandlers(ipcMain);
    registerLocalGgufBenchmarkHandlers(ipcMain);
    registerLocalGgufEndpointHandlers(ipcMain);

    // Pre-warm the GPU probe + persist the active backend / binaries version in
    // the background. Fire-and-forget by design: the probe must never delay
    // handler registration or window creation, and the services lazy-probe on
    // first use anyway, so a slow or failed probe degrades gracefully (CPU
    // backend) rather than blocking boot. Non-fatal — log and continue.
    void runtimeService.init().catch((err: unknown) => {
      console.error('[main] local-gguf runtimeService.init failed (GPU probe):', err);
    });

    // Re-hydrate watch folders persisted from a prior session: bring each
    // folder's chokidar watcher + resilience monitor back online and reconcile
    // it against the current disk state. Fire-and-forget for the same reason as
    // the GPU probe above — `start()` registers every watcher synchronously
    // before it yields, so coverage is live immediately, while the per-folder
    // reconciles run in the background and a slow/unreachable NAS never blocks
    // window creation. Non-fatal — failures are logged inside the service.
    void libraryService.start().catch((err: unknown) => {
      console.error('[main] local-gguf libraryService.start failed (watch re-hydration):', err);
    });

    console.log('[main] orchestrator + IPC ready');

    // ---- Application menu ---------------------------------------------------
    setupApplicationMenu();

    // ---- 6. Window ---------------------------------------------------------
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  })
  .catch((err) => {
    console.error('[main] fatal: app initialization failed:', err);
    dialog.showErrorBox(
      'Team-X failed to start',
      `Initialization error:\n\n${err instanceof Error ? err.message : String(err)}\n\nThe application will now exit.`,
    );
    app.exit(1);
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/**
 * Graceful shutdown — runs once on app teardown. Order matters:
 *
 *   1. Stop the orchestrator first so no new turns fire and any
 *      in-flight runs get a chance to complete (or surface their
 *      `work.failed` events to subscribers that are still alive).
 *   2. Tear down the IPC layer so the renderer cannot fire late
 *      invokes that would land on a half-disposed handler.
 *   3. Close the SQLite handle last — anything above this line might
 *      still want to write a final row.
 *
 * Errors at every step are caught and logged. The will-quit hook
 * MUST return promptly even if a step rejects, otherwise Electron
 * sits waiting for the event loop to drain.
 */
app.on('will-quit', (event) => {
  if (
    orchestrator === null &&
    unregisterIpc === null &&
    ragIndexerInstance === null &&
    copilotEventWindowInstance === null &&
    copilotEventTriggerInstance === null &&
    copilotAnalyzerServiceInstance === null &&
    commandServiceInstance === null &&
    agenticLoopServiceInstance === null &&
    poolServiceInstance === null &&
    libraryServiceInstance === null
  ) {
    closeDb();
    return;
  }
  // Defer the actual quit until shutdown completes. The original
  // implementation called `app.quit()` after the async chain, which
  // re-fires `will-quit` recursively — the second pass took the
  // null-state branch above and let Electron continue, but the cycle
  // turned out to be racy under Playwright's `app.close()` driver
  // and the process never exited. Switching to `app.exit(0)` short-
  // circuits the event loop entirely after our shutdown chain is
  // complete, which is exactly what we want here: shutdown is done,
  // there is nothing left to clean up, just terminate. Production
  // users see the same behaviour — the renderer windows are already
  // closed by the time will-quit fires, so there is no UI to lose.
  event.preventDefault();
  void (async () => {
    // Stop the RAG indexer BEFORE draining the orchestrator: the indexer
    // subscribes to the event bus, and the orchestrator writes events
    // during its drain. Stopping the subscriber first means any final
    // drain events simply have no listener — no in-flight embed call
    // can land while the process is tearing down.
    try {
      if (ragIndexerInstance !== null) {
        ragIndexerInstance.stop();
        ragIndexerInstance = null;
      }
    } catch (err) {
      console.error('[main] rag indexer stop failed:', err);
    }
    // Stop the CopilotEventWindow alongside the RAG indexer — both are
    // pure bus subscribers with no I/O of their own, so ordering
    // relative to each other is irrelevant. Stopping here prevents
    // the subscriber from observing drain-phase events.
    try {
      if (copilotEventWindowInstance !== null) {
        copilotEventWindowInstance.stop();
        copilotEventWindowInstance = null;
      }
    } catch (err) {
      console.error('[main] copilot event window stop failed:', err);
    }
    // Stop the CopilotEventTrigger — also a pure bus subscriber; its
    // debounce timers are cleared on stop() so no delayed tick fires
    // after teardown.
    try {
      if (copilotEventTriggerInstance !== null) {
        copilotEventTriggerInstance.stop();
        copilotEventTriggerInstance = null;
      }
    } catch (err) {
      console.error('[main] copilot event trigger stop failed:', err);
    }
    // Stop the CopilotAnalyzerService — clears every per-company
    // schedule (setInterval timers) and aborts any in-flight tick via
    // its stopAll() method. Nulling the handle releases the closure
    // refs so the orchestrator drain can proceed without the analyzer
    // re-binding to a stale reference.
    try {
      if (copilotAnalyzerServiceInstance !== null) {
        copilotAnalyzerServiceInstance.stopAll();
        copilotAnalyzerServiceInstance = null;
      }
    } catch (err) {
      console.error('[main] copilot analyzer stop failed:', err);
    }
    try {
      if (routineServiceInstance !== null) {
        routineServiceInstance.stopAll();
        routineServiceInstance = null;
      }
    } catch (err) {
      console.error('[main] routine service stop failed:', err);
    }
    // Stop the CommandService BEFORE the orchestrator drain (M29 T6
    // learning): any in-flight `command.execute` that is mid-dispatch
    // would otherwise enqueue a fresh orchestrator turn after the
    // drain has started. Stopping first closes its accept-loop; the
    // existing handler promises complete against the still-live
    // orchestrator since JS's microtask queue drains ahead of the
    // next `await`.
    try {
      if (commandServiceInstance !== null) {
        commandServiceInstance.stop();
        commandServiceInstance = null;
      }
    } catch (err) {
      console.error('[main] command service stop failed:', err);
    }
    // Null the agentic-loop service handle — in-flight runs hold
    // their own AbortController + background IIFE, so they naturally
    // settle when the process terminates. Nulling prevents shutdown
    // re-entry from observing a stale handle and re-triggering the
    // full cleanup chain. A future milestone can add a drain-all
    // helper if we ever see ghost runs; for now the orchestrator
    // drain upstream covers the common case.
    try {
      if (agenticLoopServiceInstance !== null) {
        agenticLoopServiceInstance = null;
      }
    } catch (err) {
      console.error('[main] agentic loop service teardown failed:', err);
    }
    // Kill the pool's child llama-server processes BEFORE the orchestrator
    // drain + DB close: they are spawned native subprocesses holding ports and
    // model files, so they must not outlive the app. shutdownAll() awaits each
    // SIGTERM→SIGKILL teardown; nulling the handle prevents shutdown re-entry
    // from re-triggering it.
    try {
      if (poolServiceInstance !== null) {
        await poolServiceInstance.shutdownAll();
        poolServiceInstance = null;
      }
    } catch (err) {
      console.error('[main] local-gguf pool shutdown failed:', err);
    }
    // Tear down the library service's live chokidar folder watchers and
    // network-share resilience monitors BEFORE the DB close: they hold FS
    // handles + polling timers that must not outlive the app. dispose() is
    // idempotent; nulling the handle prevents shutdown re-entry re-triggering it.
    try {
      if (libraryServiceInstance !== null) {
        await libraryServiceInstance.dispose();
        libraryServiceInstance = null;
      }
    } catch (err) {
      console.error('[main] local-gguf library dispose failed:', err);
    }
    try {
      if (orchestrator !== null) {
        await orchestrator.shutdown();
        orchestrator = null;
      }
    } catch (err) {
      console.error('[main] orchestrator shutdown failed:', err);
    }
    try {
      if (unregisterIpc !== null) {
        unregisterIpc();
        unregisterIpc = null;
      }
    } catch (err) {
      console.error('[main] ipc unregister failed:', err);
    }
    try {
      if (mcpHostInstance !== null) {
        await mcpHostInstance.shutdown();
        mcpHostInstance = null;
      }
    } catch (err) {
      console.error('[main] MCP host shutdown failed:', err);
    }
    try {
      closeDb();
    } catch (err) {
      console.error('[main] closeDb failed:', err);
    }
    console.log('[main] shutdown complete, exiting');
    app.exit(0);
  })();
});
