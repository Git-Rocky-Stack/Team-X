/**
 * Copilot (Phase 5 — M33), in the order the composition root runs it:
 *
 *   1. `startCopilotEventWindow`     — rolling per-company event buffer (T3).
 *   2. `bootCopilotAnalyzer`         — periodic insight producer (T4), started
 *                                      for every live company.
 *   3. `startCopilotEventTrigger`    — debounced supplementary ticks (T4).
 *   4. `registerCopilotIpcHandlers`  — the `copilot.*` channels (T5/T6).
 */

import { streamAgent } from '@team-x/provider-router';
import { ipcMain } from 'electron';

import { buildCopilotHandlers } from '../ipc/copilot-handlers.js';
import type { AgenticLoopService } from '../services/agentic-loop-service.js';
import {
  type CopilotAnalyzerCompleteFn,
  type CopilotAnalyzerService,
  createCopilotAnalyzerService,
} from '../services/copilot-analyzer-service.js';
import { createCopilotEventTrigger } from '../services/copilot-event-trigger.js';
import {
  type CopilotEventWindow,
  createCopilotEventWindow,
} from '../services/copilot-event-window.js';
import { createCopilotService } from '../services/copilot-service.js';
import type { EnhancedAiService } from '../services/enhanced-ai.js';
import { isTestMode } from '../services/provider-factory.js';
import { createTestCopilotComplete } from '../services/test-copilot-provider.js';

import { calcCost } from './cost.js';
import type { GovernanceServices } from './governance-services.js';
import type { PlatformServices } from './platform-services.js';
import type { ProviderRouting } from './provider-routing.js';
import type { Repositories } from './repositories.js';
import { runtime } from './runtime-state.js';

export function startCopilotEventWindow(
  deps: Pick<Repositories, 'eventsRepo'> & Pick<PlatformServices, 'bus'>,
): CopilotEventWindow {
  const { bus, eventsRepo } = deps;

  // ---- Copilot event window: bounded per-company rolling buffer ---------
  //
  // M33 T3. Subscribes to the same event bus the RAG indexer uses;
  // feeds the T4 CopilotAnalyzerService. Bounded at 100 events per
  // company, FIFO eviction, warm-start hydration from the events
  // table on first snapshot per company. `clear(companyId)` is wired
  // into the IPC handlers (`copilotEventWindow.clear`), so
  // `companies.archive` drops the archived company's buffer and
  // hydrated flag after its analyzer is stopped (M33 F3).
  const copilotEventWindow = createCopilotEventWindow({
    bus,
    eventsRepo,
  });
  copilotEventWindow.start();
  runtime.copilotEventWindowInstance = copilotEventWindow;
  return copilotEventWindow;
}

export interface CopilotAnalyzerDeps
  extends Pick<
      Repositories,
      'companiesRepo' | 'employeesRepo' | 'runsRepo' | 'copilotInsightsRepo' | 'settingsRepo'
    >,
    Pick<PlatformServices, 'testMode' | 'bus'>,
    Pick<GovernanceServices, 'budgetGovernanceService'>,
    Pick<ProviderRouting, 'resolveProvider'> {
  copilotEventWindow: CopilotEventWindow;
}

/**
 * Builds the Copilot analyzer, publishes it on `runtime`, starts its
 * schedule for every live company, and returns it.
 */
export function bootCopilotAnalyzer(deps: CopilotAnalyzerDeps): CopilotAnalyzerService {
  const {
    companiesRepo,
    employeesRepo,
    runsRepo,
    copilotInsightsRepo,
    settingsRepo,
    testMode,
    bus,
    budgetGovernanceService,
    resolveProvider,
    copilotEventWindow,
  } = deps;

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
  const copilotAnalyzerServiceInstance = createCopilotAnalyzerService({
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
    budgetGovernance: budgetGovernanceService,
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
      isCompanyPaused: (cid) => runtime.orchestrator?.isCompanyPaused(cid) ?? false,
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
      // The same runtime-profile-aware resolution every other model call uses
      // (one execution policy, audit P1-8): a runtime profile bound to this
      // employee applies here too, and Settings → Privacy is enforced once.
      const resolved = await resolveProvider(emp);
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
  runtime.copilotAnalyzerServiceInstance = copilotAnalyzerServiceInstance;
  for (const company of companiesRepo.list()) {
    if (company.status === 'archived') continue;
    copilotAnalyzerServiceInstance.start(company.id);
  }
  return copilotAnalyzerServiceInstance;
}

export function startCopilotEventTrigger(
  deps: Pick<PlatformServices, 'bus'> & { analyzer: CopilotAnalyzerService },
): void {
  const { bus, analyzer } = deps;

  // ---- Copilot event trigger (M33 T4) ---------------------------------
  //
  // Supplementary-tick dispatcher. Subscribes to the shared event bus
  // and debounces 4 signal types into a single analyzer tick per
  // company (30s debounce — Phase 5 §8.5 locked). Split from the
  // window (T3) to preserve pure-accumulator test isolation.
  runtime.copilotEventTriggerInstance = createCopilotEventTrigger({
    bus,
    analyzer,
  });
  runtime.copilotEventTriggerInstance.start();
}

export interface CopilotIpcDeps
  extends Pick<
      Repositories,
      'employeesRepo' | 'copilotInsightsRepo' | 'auditRepo' | 'settingsRepo'
    >,
    Pick<PlatformServices, 'bus'> {
  agenticLoopSvc: AgenticLoopService;
  enhancedAiService: EnhancedAiService | null;
}

export function registerCopilotIpcHandlers(deps: CopilotIpcDeps): void {
  const {
    employeesRepo,
    copilotInsightsRepo,
    auditRepo,
    settingsRepo,
    bus,
    agenticLoopSvc,
    enhancedAiService,
  } = deps;

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
  // (boot/agentic-loop.ts: readSide + query_copilot_insights, no
  // write-side tools).
  // Wire contract (M31 parity): returns `{ runId, threadId }` — same
  // shape as `command.execute` complex_request so the M34 sidebar
  // can attach `useAgentStepStream` with zero wire-format branching.
  if (runtime.copilotAnalyzerServiceInstance === null) {
    throw new Error('copilotAnalyzerServiceInstance must be initialized before copilot handlers');
  }
  // Narrowed once into a const so the closure below can use it without a
  // cast.
  const copilotEnhancedAi = enhancedAiService;
  const copilotServiceInstance = createCopilotService({
    agenticLoopService: agenticLoopSvc,
    employeesRepo: {
      findSystemByRoleId: (cid, rid) => employeesRepo.findSystemByRoleId(cid, rid),
    },
    // Completed Copilot exchanges feed long-term memory (gated inside the
    // service by Settings → Enhanced AI → Long-Term Memory).
    ...(copilotEnhancedAi
      ? {
          bus,
          memory: {
            remember: (companyId: string, sourceId: string, conversation: string) =>
              copilotEnhancedAi.extractAndStoreFacts(conversation, { sourceId, companyId }),
          },
        }
      : {}),
  });
  const copilotHandlers = buildCopilotHandlers({
    copilotInsightsRepo,
    copilotAnalyzerService: runtime.copilotAnalyzerServiceInstance,
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
    (_evt, req: import('@team-x/shared-types').CopilotDismissArgs) => copilotHandlers.dismiss(req),
  );
  ipcMain.handle('copilot.ask', (_evt, req: import('@team-x/shared-types').CopilotAskArgs) =>
    copilotHandlers.ask(req),
  );
  ipcMain.handle(
    'copilot.configure',
    (_evt, req: import('@team-x/shared-types').CopilotConfigureArgs) =>
      copilotHandlers.configure(req),
  );
}
