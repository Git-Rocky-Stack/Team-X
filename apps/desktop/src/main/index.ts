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
 * This file is orchestration, not implementation (audit 2026-10-07 P1-7):
 * it runs the boot phases in order, and each phase lives in `./boot/`.
 * A phase is a plain function that takes an explicit, typed deps object and
 * returns what later phases need, so the wiring graph still reads top to
 * bottom right here — there is no "where does this come from?" hunt — and
 * the order below IS the boot order. Several phases depend on it (the
 * comments at each call say why), so do not reorder calls casually.
 *
 * Why everything is constructed by these phases rather than via
 * module-level singletons:
 *
 *   The repo factories (`createXRepo`), the orchestrator builder, the
 *   role loader, and the IPC handler factory are all pure. They take
 *   their dependencies as arguments, which means a future test that
 *   wants to boot the main process against an in-memory DB only has to
 *   mock `getDb()`.
 *
 * The handles that must outlive whenReady (the orchestrator, the IPC
 * unregister function, every subscriber and child-process owner) live on
 * the shared `runtime` object (`boot/runtime-state.ts`), read live by the
 * closures that need them and torn down by the will-quit handler
 * (`boot/shutdown.ts`).
 */

import { join } from 'node:path';

import { BrowserWindow, app, dialog, ipcMain, session, shell } from 'electron';

import { configureStableUserDataPath } from './app-user-data.js';
import { bootAgenticLoop } from './boot/agentic-loop.js';
import {
  bootCommandService,
  buildCommandPalette,
  registerCommandIpcHandlers,
} from './boot/command-palette.js';
import { topUpCompaniesAndStartRoutines } from './boot/company-bootstrap.js';
import {
  bootCopilotAnalyzer,
  registerCopilotIpcHandlers,
  startCopilotEventTrigger,
  startCopilotEventWindow,
} from './boot/copilot.js';
import { buildCoreIpcHandlers } from './boot/core-ipc.js';
import { bootEnhancedAi, registerEnhancedAiIpcHandlers } from './boot/enhanced-ai.js';
import { type RoutineTicketCreator, bootGovernanceServices } from './boot/governance-services.js';
import {
  bootLocalGgufNetworkServices,
  bootLocalGgufServices,
  registerLocalGgufIpcHandlers,
  startLocalGgufBackgroundWork,
} from './boot/local-gguf.js';
import { bootOrchestrator, bootRoleLoader } from './boot/orchestrator.js';
import { resolveMigrationsFolder, resolveRolePacksRoot } from './boot/paths.js';
import { bootPlatformServices } from './boot/platform-services.js';
import { bootProactiveTrigger } from './boot/proactive.js';
import { ensureWindowsProcessEnvironment } from './boot/process-env.js';
import { bootProviderRouting } from './boot/provider-routing.js';
import { bootRagAndContext, registerRagIpcHandlers, startRagIndexer } from './boot/rag.js';
import { createRepositories } from './boot/repositories.js';
import { runtime } from './boot/runtime-state.js';
import { registerGracefulShutdown } from './boot/shutdown.js';
import {
  registerNativeDialogIpcHandlers,
  registerPaperclipIpcHandlers,
  registerPrivateOperatorIpcHandlers,
} from './boot/workspace-ipc.js';
import { getDb, initDb } from './db/client.js';
import { initFts5 } from './db/fts5-init.js';
import { runMigrations } from './db/migrate.js';
import { dbPath } from './db/paths.js';
import { seed } from './db/seed.js';
import { registerIpcHandlers } from './ipc/register.js';
import { setupApplicationMenu } from './menu.js';
import {
  createTrustedRenderer,
  hardenWebContents,
  installIpcSenderGuard,
  installPermissionPolicy,
} from './security/renderer-boundary.js';
import { bootstrapEnvKeys } from './services/env-key-bootstrap.js';
import { seedDefaultProviders } from './services/providers.js';
import { attachSpellcheckContextMenu } from './spellcheck-context-menu.js';

ensureWindowsProcessEnvironment();

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

/** The only page this app runs: the dev server under `pnpm dev`, else the built file. */
const DEV_SERVER_URL = isDev ? process.env.ELECTRON_RENDERER_URL : undefined;
const RENDERER_INDEX_HTML = join(__dirname, '../renderer/index.html');
const trustedRenderer = createTrustedRenderer({
  indexHtmlPath: RENDERER_INDEX_HTML,
  devServerUrl: DEV_SERVER_URL,
});

// ---------------------------------------------------------------------------
// Test-mode (E2E) noise suppression — scoped strictly to `NODE_ENV=test`.
//
// The Playwright harness launches this entry with `NODE_ENV=test`. The
// "Electron Security Warning (Insecure Content-Security-Policy)" advisory
// carries zero signal for an automated smoke test yet drowns the useful
// `[main]` app logs in the captured stderr. Built renderers (packaged and
// E2E alike) carry the strict production CSP (renderer-csp.ts), so the
// advisory can only come from the dev-server policy, and `pnpm dev`
// (NODE_ENV unset) is untouched, so it still surfaces during real local
// development. `ELECTRON_DISABLE_SECURITY_WARNINGS` is the documented
// off-switch and is read by the (sandboxed) renderer, which inherits this env
// var at spawn time.
//
// GPU hardware acceleration is deliberately NOT disabled here. Doing it in
// main-process JS runs too late: Chromium commits to spawning the GPU process
// during argv bootstrap, before this script loads, so on a GPU-less host the
// spawn still crashes (see the prior-art writeup in e2e/_launch-helpers.ts).
// The GPU-disable switches are passed on the Playwright launch argv instead.
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV === 'test') {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
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

  if (DEV_SERVER_URL) {
    await win.loadURL(DEV_SERVER_URL);
  } else {
    await win.loadFile(RENDERER_INDEX_HTML);
  }
}

configureStableUserDataPath(app, { logger: console });

// ---- Renderer trust boundary (audit 2026-10-07 P0-3) ------------------------
// Installed before anything registers an IPC handler or opens a window, so
// every handler and every webContents is covered without opting in. See
// security/renderer-boundary.ts for the policy.
installIpcSenderGuard(ipcMain, trustedRenderer, (message) => console.warn(`[security] ${message}`));
app.on('web-contents-created', (_event, contents) => {
  hardenWebContents(contents, trustedRenderer, (url) => shell.openExternal(url));
});

app
  .whenReady()
  .then(async () => {
    // Deny every permission request except the clipboard write the app uses.
    installPermissionPolicy(session.defaultSession, trustedRenderer);

    // ---- 1. Database --------------------------------------------------------
    const dbHandle = initDb(dbPath());
    runMigrations(dbHandle.db, resolveMigrationsFolder());
    console.log('[db] migrations applied');
    const fts5Ready = initFts5(getDb());
    console.log(`[db] FTS5 vault index: ${fts5Ready ? 'ready' : 'unavailable (fallback mode)'}`);

    // ---- 2-4. Seed company/employees, default providers, dev key import ----
    seed(resolveRolePacksRoot());
    seedDefaultProviders();
    // Dev-only: import ANTHROPIC_API_KEY from apps/desktop/.env into the OS
    // keychain if the keychain has no anthropic key yet. No-op in packaged
    // builds and whenever the .env file is absent. See env-key-bootstrap.ts
    // for the full list of security invariants this function enforces.
    await bootstrapEnvKeys();

    // ---- 5. Build services + orchestrator + IPC ----------------------------
    const db = getDb();
    const repos = createRepositories(db);
    const localGguf = bootLocalGgufServices({ db, ...repos });
    const platform = await bootPlatformServices({ db, ...repos });
    // The endpoint, HF and benchmark services need `secretsStore`, which the
    // platform phase creates.
    const localGgufNetwork = bootLocalGgufNetworkServices({ ...localGguf, ...platform });

    // Assigned once the IPC handlers exist (below); routines resolve it at
    // call time.
    let routineTicketCreator: RoutineTicketCreator | null = null;
    const governance = bootGovernanceServices({
      db,
      ...repos,
      ...platform,
      getRoutineTicketCreator: () => routineTicketCreator,
      // Company portability only calls this after boot; the role loader is
      // built further down.
      getRoleLoader: () => roleLoader,
    });

    // Everything the later phases draw on. Each phase picks what it needs
    // through its own typed deps interface.
    const core = { db, ...repos, ...platform, ...governance };
    const providerRouting = bootProviderRouting(core);
    const ragContext = await bootRagAndContext(core);
    const roleLoader = bootRoleLoader({ isDev });
    const orchestrator = bootOrchestrator({
      ...core,
      ...providerRouting,
      ...ragContext,
      roleLoader,
    });
    // After the orchestrator, so `bus` is fully wired.
    startRagIndexer({ ...core, ...ragContext });
    const enhancedAiService = bootEnhancedAi({ ...core, ...providerRouting, ...ragContext });
    // Started before the IPC handlers build: `companies.archive` clears it.
    const copilotEventWindow = startCopilotEventWindow(core);

    const ipcHandlers = buildCoreIpcHandlers({
      ...core,
      ...providerRouting,
      ...ragContext,
      dbHandle,
      isDev,
      orchestrator,
      roleLoader,
      copilotEventWindow,
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
    topUpCompaniesAndStartRoutines({ ...core, roleLoader });

    // The palette is built AFTER `ipcHandlers` (it dispatches onto them) and
    // the CommandService BEFORE `registerIpcHandlers`. The agentic loop sits
    // after the orchestrator (its pause gate reads `isCompanyPaused`) and
    // before the CommandService (which dispatches `complex_request` to it).
    const commandPalette = buildCommandPalette({ ...core, ...providerRouting, roleLoader });
    // Capture the live handle so the CommandHandlers dispatch map and the
    // Copilot service can close over a non-null reference. Reading
    // `runtime.agenticLoopServiceInstance` there would force a `!` assertion
    // inside the closure (TS sees it as nullable); a local const keeps the
    // closure clean and prevents accidental re-binding during later shutdown
    // cleanup.
    const agenticLoopSvc = bootAgenticLoop({
      ...core,
      ...providerRouting,
      roleLoader,
      enhancedAiService,
    });
    bootProactiveTrigger(core);
    const copilotAnalyzer = bootCopilotAnalyzer({
      ...core,
      ...providerRouting,
      copilotEventWindow,
    });
    startCopilotEventTrigger({ ...core, analyzer: copilotAnalyzer });
    const commandService = bootCommandService({
      ...core,
      ...commandPalette,
      ipcHandlers,
      agenticLoopSvc,
    });

    runtime.unregisterIpc = registerIpcHandlers(ipcHandlers, core.bus);

    // Sibling IPC registrations — subsystems kept off the `IpcHandlers` DI
    // surface. Their channels are in `REQUEST_CHANNELS`, so `unregisterIpc()`
    // strips them on shutdown alongside every other handler.
    registerRagIpcHandlers({ ...core, ...ragContext });
    registerPaperclipIpcHandlers();
    registerPrivateOperatorIpcHandlers(core);
    registerEnhancedAiIpcHandlers({ enhancedAiService });
    registerNativeDialogIpcHandlers();
    registerCommandIpcHandlers({ commandService });
    registerCopilotIpcHandlers({ ...core, agenticLoopSvc, enhancedAiService });
    registerLocalGgufIpcHandlers({ ...localGguf, ...localGgufNetwork });
    startLocalGgufBackgroundWork(localGguf);

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

registerGracefulShutdown();
