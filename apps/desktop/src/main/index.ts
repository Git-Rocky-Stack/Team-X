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
import { BrowserWindow, app } from 'electron';

import { calcCostUsd } from '@team-x/telemetry-core';

import { closeDb, getDb, initDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { dbPath } from './db/paths.js';
import { createCompaniesRepo } from './db/repos/companies.js';
import { createEmployeesRepo } from './db/repos/employees.js';
import { createEventsRepo } from './db/repos/events.js';
import { createMessagesRepo } from './db/repos/messages.js';
import { createRunsRepo } from './db/repos/runs.js';
import { createThreadsRepo } from './db/repos/threads.js';
import { seed } from './db/seed.js';
import { createIpcHandlers } from './ipc/handlers.js';
import { registerIpcHandlers } from './ipc/register.js';
import { createEventBus } from './orchestrator/event-bus.js';
import {
  type Orchestrator,
  type ResolveProvider,
  buildOrchestrator,
} from './orchestrator/index.js';
import type { CostCalculator } from './orchestrator/run-agent.js';
import { bootstrapEnvKeys } from './services/env-key-bootstrap.js';
import {
  createProviderFactory,
  createTestModeResolveProvider,
  isTestMode,
} from './services/provider-factory.js';
import { getProvidersService, seedDefaultProviders } from './services/providers.js';
import { createRoleLoader } from './services/role-loader.js';
import { SecretsStore } from './services/secrets.js';

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
    if (isDev) {
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

app.whenReady().then(async () => {
  // ---- 1. Database --------------------------------------------------------
  initDb(dbPath());
  runMigrations(getDb(), resolveMigrationsFolder());
  console.log('[db] migrations applied');

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

  const bus = createEventBus({ repo: eventsRepo });

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
  const testMode = isTestMode();
  let resolveProvider: ResolveProvider;

  if (testMode) {
    resolveProvider = createTestModeResolveProvider();
    console.log('[main] test-mode provider active — canned responses, no LLM calls');
  } else {
    const secretsStore = new SecretsStore();
    const providersService = getProvidersService();
    const providerFactory = createProviderFactory({ providersService, secretsStore });
    resolveProvider = (employee) => providerFactory.resolveForEmployee(employee);
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

  orchestrator = buildOrchestrator({
    bus,
    messagesRepo,
    runsRepo,
    employeesRepo,
    companiesRepo,
    threadsRepo,
    calcCost,
    resolveSystemPrompt: (args) => roleLoader.resolveSystemPrompt(args),
    resolveProvider,
    slots: PHASE_1_ORCHESTRATOR_SLOTS,
  });

  const ipcHandlers = createIpcHandlers({
    companiesRepo,
    employeesRepo,
    threadsRepo,
    messagesRepo,
    orchestrator,
    roleLookup: roleLoader,
  });
  unregisterIpc = registerIpcHandlers(ipcHandlers, bus);

  console.log('[main] orchestrator + IPC ready');

  // ---- 6. Window ---------------------------------------------------------
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
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
  if (orchestrator === null && unregisterIpc === null) {
    closeDb();
    return;
  }
  // Defer the actual quit until shutdown completes. We do NOT
  // call event.preventDefault() forever — we let the original
  // will-quit complete after our async chain finishes by allowing
  // it to fall through. The pattern below mirrors Electron's docs
  // for "wait for async work, then quit again".
  event.preventDefault();
  void (async () => {
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
      closeDb();
    } catch (err) {
      console.error('[main] closeDb failed:', err);
    }
    app.quit();
  })();
});
