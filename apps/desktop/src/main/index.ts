/**
 * Electron main process entry point.
 *
 * Boot order — every step happens inside `app.whenReady()` so the
 * Electron app, the userData path, and the keychain are all available
 * before any service touches them:
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

import { join } from 'node:path';
import { BrowserWindow, app, dialog, ipcMain } from 'electron';

import { calcCostUsd } from '@team-x/telemetry-core';

import {
  type RagRepo,
  type RagService,
  createEntityResolver,
  createIntentClassifier,
  createRagService,
  createSlotFiller,
} from '@team-x/intelligence';
import type { LoopCompleteFn, LoopMessage, LoopProviderCompletion } from '@team-x/intelligence';
import { type ToolSpec, buildProviderTools, createEmbedText } from '@team-x/provider-router';
import { streamAgent } from '@team-x/provider-router';
import type { EmbeddingSourceType, Employee, Ticket } from '@team-x/shared-types';
import { eq } from 'drizzle-orm';
import { closeDb, getDb, initDb } from './db/client.js';
import { initFts5 } from './db/fts5-init.js';
import { runMigrations } from './db/migrate.js';
import { dbPath } from './db/paths.js';
import { createAuditRepo } from './db/repos/audit.js';
import { createCommandHistoryRepo } from './db/repos/command-history.js';
import { createCompaniesRepo } from './db/repos/companies.js';
import { createEmbeddingsRepo } from './db/repos/embeddings.js';
import { createEmployeesRepo } from './db/repos/employees.js';
import { createEventsRepo } from './db/repos/events.js';
import { createGoalsRepo } from './db/repos/goals.js';
import {
  createMcpServersRepo,
  createToolCallsRepo,
  seedDefaultMcpServers,
} from './db/repos/mcp-servers.js';
import { createMeetingsRepo } from './db/repos/meetings.js';
import { createMessagesRepo } from './db/repos/messages.js';
import { createProjectsRepo } from './db/repos/projects.js';
import { createRunsRepo } from './db/repos/runs.js';
import { createSettingsRepo } from './db/repos/settings.js';
import { createThreadsRepo } from './db/repos/threads.js';
import { createTicketAttachmentsRepo } from './db/repos/ticket-attachments.js';
import { createTicketsRepo } from './db/repos/tickets.js';
import { createVaultRepo } from './db/repos/vault.js';
import { messages as messagesTable } from './db/schema.js';
import { seed } from './db/seed.js';
import { buildCommandHandlers } from './ipc/command-handlers.js';
import { createIpcHandlers } from './ipc/handlers.js';
import { buildRagHandlers } from './ipc/rag-handlers.js';
import { registerIpcHandlers } from './ipc/register.js';
import { createEventBus } from './orchestrator/event-bus.js';
import {
  type Orchestrator,
  type ResolveProvider,
  type ResolveTools,
  buildOrchestrator,
} from './orchestrator/index.js';
import { createMeetingService } from './orchestrator/meeting-service.js';
import type { CostCalculator } from './orchestrator/run-agent.js';
import {
  type AgenticLoopService,
  createAgenticLoopService,
} from './services/agentic-loop-service.js';
import { createAgenticTools } from './services/agentic-tools.js';
import { createBackupService } from './services/backup.js';
import { type CommandService, createCommandService } from './services/command-service.js';
import { bootstrapEnvKeys } from './services/env-key-bootstrap.js';
import { type McpHost, createMcpHost } from './services/mcp-host.js';
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
import { createRoleLoader } from './services/role-loader.js';
import { SecretsStore } from './services/secrets.js';
import { composeSystemPromptWithRag } from './services/system-prompt.js';
import { createTestAgenticCompleteFn } from './services/test-agentic-provider.js';
import { createTestClassifier } from './services/test-classifier.js';
import { createUpdaterService } from './services/updater.js';
import { createVaultService } from './services/vault.js';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

/**
 * Phase 1 concurrency cap for the orchestrator's work queue. Two slots
 * is the safe default for a local Ollama backend (avoids stampeding
 * the GPU) and is plenty for Phase 1's "one user, one chat at a time"
 * usage. T36 will read this from a settings row so the user can tune
 * it without rebuilding.
 */
const PHASE_1_ORCHESTRATOR_SLOTS = 2;

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
 * Wrap `telemetry-core`'s `calcCostUsd` into the orchestrator's
 * `CostCalculator` shape. The orchestrator API uses
 * `(provider, model, in, out) -> string` so all storage stays
 * decimal-safe; `calcCostUsd` returns a number, so we format here at
 * the boundary. Six decimal places is enough for sub-cent precision
 * on the smallest Phase 1 model (claude-haiku at $0.0008/1k input).
 */
const calcCost: CostCalculator = ({ model, promptTokens, completionTokens }) => {
  const result = calcCostUsd(model, promptTokens, completionTokens);
  return result.usd.toFixed(6);
};

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: '#0a0a0a',
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
    },
  });

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
let commandServiceInstance: CommandService | null = null;
/**
 * Agentic-loop front-door for the command palette's `complex_request`
 * intent (M31 T4). Lives alongside the orchestrator because its
 * pause-gate observer reads `orchestrator.isCompanyPaused` on every
 * provider completion. Nullable at boot for symmetry with the other
 * tear-down handles and to stay safe during early-crash cleanup.
 */
let agenticLoopServiceInstance: AgenticLoopService | null = null;

app
  .whenReady()
  .then(async () => {
    // ---- 1. Database --------------------------------------------------------
    initDb(dbPath());
    runMigrations(getDb(), resolveMigrationsFolder());
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
    const threadsRepo = createThreadsRepo(db);
    const messagesRepo = createMessagesRepo(db);
    const runsRepo = createRunsRepo(db);
    const eventsRepo = createEventsRepo(db);
    const auditRepo = createAuditRepo(db);
    const mcpServersRepo = createMcpServersRepo(db);
    const toolCallsRepo = createToolCallsRepo(db);
    const ticketsRepo = createTicketsRepo(db);
    const goalsRepo = createGoalsRepo(db);
    const projectsRepo = createProjectsRepo(db);
    const meetingsRepo = createMeetingsRepo(db);
    const vaultRepo = createVaultRepo(db);
    const ticketAttachmentsRepo = createTicketAttachmentsRepo(db);
    const settingsRepo = createSettingsRepo(db);
    const embeddingsRepo = createEmbeddingsRepo(db);
    const commandHistoryRepo = createCommandHistoryRepo(db);

    // Seed default settings on first boot (runtime_strategy, privacy tier, caps).
    const settingsSeeded = settingsRepo.seedDefaults();
    if (settingsSeeded > 0) {
      console.log(`[settings] seeded ${settingsSeeded} default setting(s)`);
    }

    // Seed well-known MCP servers on first boot (disabled by default).
    const mcpSeeded = seedDefaultMcpServers(db);
    if (mcpSeeded > 0) {
      console.log(`[mcp] seeded ${mcpSeeded} default MCP server(s)`);
    }

    const bus = createEventBus({ repo: eventsRepo });

    // ---- MCP Host initialization --------------------------------------------
    const mcpHost = createMcpHost({
      mcpServersRepo,
      toolCallsRepo,
      bus,
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
    let resolveProvider: ResolveProvider;

    if (testMode) {
      resolveProvider = createTestModeResolveProvider();
      console.log('[main] test-mode provider active — canned responses, no LLM calls');
    } else {
      const providerFactory = createProviderFactory({ providersService, secretsStore });
      resolveProvider = (employee) => providerFactory.resolveForEmployee(employee);
    }

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

    // Role loader: turns (employee, company) into a rendered system prompt.
    // Preloaded eagerly so the cost of the role-pack scan is paid during
    // boot rather than on the first user message.
    const roleLoader = createRoleLoader({ rolePacksRoot: resolveRolePacksRoot() });
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
          if (mcpTools.length === 0) return null;

          const toolsAllowed: string[] = JSON.parse(employee.toolsAllowedJson ?? '[]');
          const toolsDenied: string[] = JSON.parse(employee.toolsDeniedJson ?? '[]');

          // Pre-filter at definition time so the model never sees denied tools.
          const allowedTools = mcpTools.filter((t) => {
            if (toolsDenied.includes(t.name)) return false;
            if (toolsAllowed.length > 0 && !toolsAllowed.includes(t.name)) return false;
            return true;
          });
          if (allowedTools.length === 0) return null;

          const specs: ToolSpec[] = allowedTools.map((t) => ({
            name: t.name,
            description: t.description ?? '',
            inputSchema: (t.inputSchema ?? { type: 'object' }) as Record<string, unknown>,
            execute: async (args: Record<string, unknown>) => {
              const serverId = mcpHost.findServerForTool(t.name, company.id);
              if (!serverId) throw new Error(`No MCP server found for tool: ${t.name}`);

              const result = await mcpHost.callTool({
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
          }));

          return {
            tools: buildProviderTools(specs),
            maxSteps: 5,
          };
        };

    orchestrator = buildOrchestrator({
      bus,
      messagesRepo,
      runsRepo,
      employeesRepo,
      companiesRepo,
      threadsRepo,
      calcCost,
      resolveSystemPrompt: async ({ employee, company, threadId }) => {
        // Base path — pure role.md render, no RAG. Called by the RAG
        // wrapper as its `renderRoleSystemPrompt` dep, AND used as the
        // direct return when RAG is off so the non-RAG code path is
        // literally byte-identical to the pre-M29 behaviour.
        const renderPlain = (): Promise<string> =>
          roleLoader.resolveSystemPrompt({ employee, company });

        if (ragService === null) return renderPlain();

        const topK = settingsRepo.get<number>('rag_top_k', 5);
        const threshold = settingsRepo.get<number>('rag_threshold', 0.7);
        const maxTokens = settingsRepo.get<number>('rag_max_tokens', 2000);

        return composeSystemPromptWithRag(
          {
            renderRoleSystemPrompt: renderPlain,
            // Already gated above — ragService !== null means enabled.
            isRagEnabled: () => true,
            getRagConfig: () => ({ topK, threshold, maxTokens }),
            getRecentUserMessages: ({ threadId: tid }) =>
              messagesRepo
                .listByThread(tid)
                .filter((m) => m.authorKind === 'user')
                .slice(-2)
                .map((m) => ({ id: m.id, content: m.content, sourceId: m.id })),
            retrieve: (q) => ragService.retrieve(q),
            // ~4 chars per token is the canonical OpenAI rule of thumb;
            // good enough for a maxTokens guard that is advisory, not a
            // hard limit the provider enforces.
            countTokens: (text) => Math.ceil(text.length / 4),
          },
          { employeeId: employee.id, companyId: company.id, threadId },
        );
      },
      resolveProvider,
      resolveTools,
      slots: PHASE_1_ORCHESTRATOR_SLOTS,
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
      isEnabled: () => ragService !== null,
    });
    ragIndexer.start();
    ragIndexerInstance = ragIndexer;

    const vaultService = createVaultService({
      vaultRepo,
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
      meetingsRepo,
      runsRepo,
      eventsRepo,
      orchestrator,
      meetingService,
      roleLookup: roleLoader,
      mcpHost,
      mcpServersRepo,
      providersService,
      secretsStore,
      settingsRepo,
      vaultService,
      backupService,
      auditRepo,
      updaterService,
      getHardwareProfile: detectHardware,
    });
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
      bus,
      orchestrator: {
        // Module-level `orchestrator` handle is nullable during the
        // brief window between early-crash + will-quit cleanup. Treat
        // "no orchestrator" as "not paused" so a mid-teardown run can
        // still settle cleanly rather than deadlocking on the gate.
        isCompanyPaused: (cid) => orchestrator?.isCompanyPaused(cid) ?? false,
      },
      buildTools: ({ companyId }) =>
        createAgenticTools({
          companyId,
          employeesRepo,
          ticketsRepo,
          projectsRepo,
          meetingsRepo,
          vaultRepo,
          auditRepo,
        }),
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
        // into a `LoopCompleteFn`. The wrapper accumulates delta
        // chunks into a single text + records the final usage tallies.
        const emp = employeesRepo.getById(systemAgentId);
        if (!emp) {
          throw new Error(`[agentic-loop] system-agent employee ${systemAgentId} not found`);
        }
        const factory = createProviderFactory({ providersService, secretsStore });
        const resolved = await factory.resolveForEmployee(emp);
        const { providerName, model, stream } = resolved;
        const complete: LoopCompleteFn = async ({ system, messages, signal }) => {
          let text = '';
          let promptTokens = 0;
          let completionTokens = 0;
          const streamMessages = messages.map((m: LoopMessage) => ({
            role: m.role,
            content: m.content,
          }));
          for await (const chunk of streamAgent({
            providerFactory: stream,
            system,
            messages: streamMessages,
          })) {
            if (signal.aborted) {
              throw new DOMException('Aborted', 'AbortError');
            }
            if (chunk.kind === 'delta') {
              text += chunk.delta;
            } else if (chunk.kind === 'done') {
              promptTokens = chunk.usage.promptTokens;
              completionTokens = chunk.usage.completionTokens;
            }
          }
          const completion: LoopProviderCompletion = {
            text,
            usage: { promptTokens, completionTokens },
            provider: providerName,
            model,
            // Real cost attribution lands in T7 alongside the settings
            // budget controls. Zero here keeps the runs row well-
            // formed and the telemetry charts stable until we plumb
            // the `calcCostUsd` helper through this boundary.
            costUsd: 0,
          };
          return completion;
        };
        return { complete, provider: providerName, model };
      },
      humanUserId: 'user',
    });

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
        // employeesPromote — not yet wired; CommandService dispatcher
        // guards for absence and emits `handler_error`.
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
        // Walks every message in every thread of this company and re-
        // embeds each non-empty one. If `ragService` is null (user has
        // not configured a provider), return 0 — the Settings UI then
        // surfaces "RAG disabled" to the user without raising.
        //
        // Per-source errors are isolated: a single embed-provider failure
        // (network blip, rate limit) must not abort the entire rebuild
        // mid-company after we've already wiped embeddings in the caller
        // — that would leave the user with an empty index and no signal
        // why. We log each failure, continue, and the returned count
        // reflects successful indexes only. Settings UI can surface
        // partial-success to the user when count < expected.
        //
        // TOCTOU note: while this rebuild runs, the RagIndexer is still
        // subscribed and may fire indexSource for fresh agent replies.
        // This is safe — RagService.indexSource is delete-then-upsert on
        // (sourceId), so overlapping calls for different sourceIds never
        // collide, and two calls for the same sourceId leave the latest
        // content wins. No duplicates, no corruption.
        if (ragService === null) return 0;
        const threads = threadsRepo.listByCompany(companyId);
        let count = 0;
        let failed = 0;
        for (const t of threads) {
          const msgs = messagesRepo.listByThread(t.id);
          for (const m of msgs) {
            if (!m.content.trim()) continue;
            try {
              await ragService.indexSource({
                companyId,
                sourceType: 'message',
                sourceId: m.id,
                content: m.content,
              });
              count++;
            } catch (err) {
              failed++;
              console.error(`[rag] rebuild: indexSource failed for message ${m.id}:`, err);
            }
          }
        }
        if (failed > 0) {
          console.warn(
            `[rag] rebuild for company ${companyId}: ${count} succeeded, ${failed} failed`,
          );
        }
        return count;
      },
    });
    ipcMain.handle('rag.stats', (_evt, companyId: string) => ragHandlers.stats(companyId));
    ipcMain.handle('rag.rebuildAll', (_evt, companyId: string) =>
      ragHandlers.rebuildAll(companyId),
    );
    ipcMain.handle('rag.deleteForCompany', (_evt, companyId: string) =>
      ragHandlers.deleteForCompany(companyId),
    );

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

    console.log('[main] orchestrator + IPC ready');

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
    commandServiceInstance === null &&
    agenticLoopServiceInstance === null
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
