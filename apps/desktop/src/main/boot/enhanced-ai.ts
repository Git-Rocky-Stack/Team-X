/**
 * Enhanced AI (Phase 5 — M32): the service (`bootEnhancedAi`, after the RAG
 * indexer) and its `enhancedAi.*` IPC channels (`registerEnhancedAiIpcHandlers`).
 */

import { createEmbedText } from '@team-x/provider-router';
import type { EmbeddingSourceType } from '@team-x/shared-types';
import { SYSTEM_AGENT_ROLE_ID } from '@team-x/shared-types';
import { ipcMain } from 'electron';

import type { TeamXDb } from '../db/client.js';
import {
  createEnhancedAiKnowledgeRepo,
  createEnhancedAiMemoryRepo,
} from '../db/repos/enhanced-ai-memory.js';
import { buildEnhancedAiHandlers } from '../ipc/enhanced-ai-handlers.js';
import type { ResolveProvider } from '../orchestrator/index.js';
import { type EnhancedAiService, createEnhancedAiService } from '../services/enhanced-ai.js';
import { runGovernedCompletion } from '../services/governed-completion.js';
import { buildEmbedAdapter } from '../services/provider-factory.js';

import { calcCost } from './cost.js';
import type { GovernanceServices } from './governance-services.js';
import type { PlatformServices } from './platform-services.js';
import type { ProviderRouting } from './provider-routing.js';
import type { RagAndContext } from './rag.js';
import type { Repositories } from './repositories.js';
import { runtime } from './runtime-state.js';

export interface EnhancedAiDeps
  extends Pick<
      Repositories,
      | 'settingsRepo'
      | 'getMaxPrivacyTier'
      | 'companiesRepo'
      | 'employeesRepo'
      | 'runsRepo'
      | 'embeddingsRepo'
    >,
    Pick<PlatformServices, 'secretsStore'>,
    Pick<GovernanceServices, 'providersService'>,
    Pick<ProviderRouting, 'resolveProvider' | 'providerFactory'>,
    Pick<RagAndContext, 'ragService'> {
  db: TeamXDb;
}

export function bootEnhancedAi(deps: EnhancedAiDeps): EnhancedAiService | null {
  const {
    db,
    settingsRepo,
    getMaxPrivacyTier,
    companiesRepo,
    employeesRepo,
    runsRepo,
    embeddingsRepo,
    secretsStore,
    providersService,
    resolveProvider,
    providerFactory,
    ragService,
  } = deps;

  // ---- Enhanced AI service: Phase 2 & 3 features ------------------------
  //
  // Integrates semantic chunking, query expansion, long-term memory,
  // knowledge graph, multi-turn planning, streaming, and tracing with
  // the desktop app. It grounds `copilot.ask` (the `search_company_knowledge`
  // tool) and remembers completed Copilot exchanges. (Phase 5 — M32)
  //
  // It needs retrieval (an embedding provider) and nothing else. It used to
  // be created only when `llm_provider` was not 'auto' — but 'auto' is the
  // default, and the Settings panel describes it as a routing preference,
  // not an on/off switch. So with default settings the whole subsystem was
  // off and every Enhanced AI toggle gated nothing.
  let enhancedAiService: EnhancedAiService | null = null;

  if (ragService !== null) {
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
        getMaxPrivacyTier,
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
    //      pattern in boot/agentic-loop.ts).
    //
    // This replaces the M32 placeholder that returned `(LLM response not
    // configured)` regardless of input — that stub silently degraded all 7
    // `enhancedAi.*` IPC channels.
    const llmComplete = async (
      prompt: string,
      context: { companyId: string | null },
    ): Promise<string> => {
      // The company of the Enhanced AI call that needs the model; only a
      // company-less call (createPlan) falls back to the first live one.
      // Every call used to take the first live company, so company B's
      // Copilot exchanges ran on company A's provider and budget.
      const company =
        (context.companyId ? companiesRepo.getById(context.companyId) : null) ??
        companiesRepo.list().find((c) => c.status !== 'archived');
      if (!company) {
        throw new Error(
          '[enhanced-ai] llmComplete: no live company exists — cannot resolve provider',
        );
      }
      const systemAgentRow = employeesRepo.findSystemByRoleId(company.id, SYSTEM_AGENT_ROLE_ID);
      if (!systemAgentRow) {
        throw new Error(
          `[enhanced-ai] llmComplete: no system-agent for company "${company.id}" — boot top-up should have created one`,
        );
      }
      const actorRow = employeesRepo.getById(systemAgentRow.id);
      if (!actorRow) {
        throw new Error(
          `[enhanced-ai] llmComplete: system-agent row "${systemAgentRow.id}" vanished mid-resolution`,
        );
      }
      // Settings → Enhanced AI → Provider / Model, read per call so a change
      // applies immediately. 'auto' defers to the system agent's own
      // resolution.
      const llmProviderPref = settingsRepo.get<string>('llm_provider', 'auto');
      const llmModelPref = settingsRepo.get<string>('llm_model', 'auto');
      let resolved: Awaited<ReturnType<ResolveProvider>>;
      if (providerFactory === null || (llmProviderPref === 'auto' && llmModelPref === 'auto')) {
        resolved = await resolveProvider(actorRow);
      } else if (llmProviderPref !== 'auto') {
        resolved = await providerFactory.create({
          providerId: llmProviderPref,
          ...(llmModelPref !== 'auto' ? { model: llmModelPref } : {}),
        });
      } else {
        // Model chosen, provider on auto: apply the model to the provider
        // the system agent resolves to — unless that is an external
        // runtime (`runtime:<kind>`), which is not in the provider registry
        // and picks its own model. Passing that name to the factory threw
        // "provider not found" and failed every Enhanced AI call.
        const own = await resolveProvider(actorRow);
        resolved =
          providersService.get(own.providerName) !== null
            ? await providerFactory.create({ providerId: own.providerName, model: llmModelPref })
            : own;
      }
      // Held to the company's budget and recorded as a run, like an agent
      // turn: these calls used to spend tokens no budget or report saw.
      const budget = runtime.budgetGovernanceServiceInstance;
      return runGovernedCompletion(
        {
          accounting: {
            runsRepo,
            calcCost,
            ...(budget ? { recordRunSpend: (runId: string) => budget.recordRunSpend(runId) } : {}),
          },
          isBudgetBlocked: (companyId) => (budget?.getOverview(companyId).exceededCount ?? 0) > 0,
        },
        {
          companyId: company.id,
          employeeId: actorRow.id,
          resolved,
          system: '',
          prompt,
        },
      );
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
        // Long-term memory and the knowledge graph persist (migration 0037);
        // the package defaults would forget both at exit.
        memoryRepo: createEnhancedAiMemoryRepo(db),
        knowledgeRepo: createEnhancedAiKnowledgeRepo(db),
        // Audit F5 — the seven Settings → Enhanced AI switches used to be
        // write-only: `settings.getEnhancedAiConfig` / `setEnhancedAiConfig`
        // were the only readers of these rows, so every toggle persisted a
        // value that nothing consumed. Reading them through a closure means
        // the per-call gates (memory, knowledge graph, streaming, chunking,
        // planning) pick up a change immediately; query expansion and
        // tracing are baked into the pipeline at construction and take
        // effect on the next launch.
        features: () => ({
          queryExpansionEnabled: settingsRepo.get<boolean>('query_expansion_enabled', true),
          semanticChunkingEnabled: settingsRepo.get<boolean>('semantic_chunking_enabled', true),
          longTermMemoryEnabled: settingsRepo.get<boolean>('long_term_memory_enabled', true),
          knowledgeGraphEnabled: settingsRepo.get<boolean>('knowledge_graph_enabled', true),
          tracingEnabled: settingsRepo.get<boolean>('tracing_enabled', false),
          tracingSampleRate: settingsRepo.get<number>('tracing_sample_rate', 0.1),
        }),
      });
      console.log('[enhanced-ai] service ready — Phase 2 & 3 features available');
    } catch (err) {
      console.error('[enhanced-ai] failed to initialize:', err);
      enhancedAiService = null;
    }
  } else {
    console.log('[enhanced-ai] disabled — enable RAG and choose an embedding provider to enable');
  }

  return enhancedAiService;
}

export function registerEnhancedAiIpcHandlers(deps: {
  enhancedAiService: EnhancedAiService | null;
}): void {
  const { enhancedAiService } = deps;

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
}
