/**
 * RAG (Phase 5 — M29) and the per-turn context services built on it, in the
 * order the composition root runs them:
 *
 *   1. `bootRagAndContext`      — the optional RAG service, retrieval
 *                                 orchestrator, context assembler + packer.
 *   2. `startRagIndexer`        — bus subscriber that indexes on write
 *                                 (after the orchestrator).
 *   3. `registerRagIpcHandlers` — the `rag.*` channels.
 */

import {
  type RagRepo,
  type RagService,
  chunkTextV1,
  createLexicalCrossEncoder,
  createQueryExpansionService,
  createRagService,
  createRerankerService,
  chunkText as semanticChunkText,
} from '@team-x/intelligence';
import { createEmbedText } from '@team-x/provider-router';
import type { EmbeddingSourceType } from '@team-x/shared-types';
import { eq } from 'drizzle-orm';
import { ipcMain } from 'electron';

import type { TeamXDb } from '../db/client.js';
import { messages as messagesTable } from '../db/schema.js';
import { buildRagHandlers } from '../ipc/rag-handlers.js';
import { createContextAssemblerService } from '../services/context-assembler-service.js';
import { createContextPackerService } from '../services/context-packer-service.js';
import { createEmbeddingRefusalReporter } from '../services/embedding-refusal-reporter.js';
import { buildEmbedAdapter, makeFakeEmbedAdapter } from '../services/provider-factory.js';
import { createRagIndexer } from '../services/rag-indexer.js';
import { rebuildCompanyRagSources } from '../services/rag-rebuild.js';
import { createRetrievalOrchestrator } from '../services/retrieval-orchestrator.js';

import type { GovernanceServices } from './governance-services.js';
import type { PlatformServices } from './platform-services.js';
import type { Repositories } from './repositories.js';
import { runtime } from './runtime-state.js';

export interface RagAndContextDeps
  extends Pick<
      Repositories,
      | 'embeddingsRepo'
      | 'settingsRepo'
      | 'getMaxPrivacyTier'
      | 'companiesRepo'
      | 'threadsRepo'
      | 'messagesRepo'
      | 'employeesRepo'
      | 'projectsRepo'
      | 'goalsRepo'
      | 'vaultRepo'
    >,
    Pick<
      PlatformServices,
      | 'testMode'
      | 'secretsStore'
      | 'threadDigestService'
      | 'runCheckpointService'
      | 'artifactService'
    >,
    Pick<GovernanceServices, 'providersService' | 'ticketsRepo'> {}

export type RagAndContext = Awaited<ReturnType<typeof bootRagAndContext>>;

export async function bootRagAndContext(deps: RagAndContextDeps) {
  const {
    embeddingsRepo,
    settingsRepo,
    getMaxPrivacyTier,
    companiesRepo,
    threadsRepo,
    messagesRepo,
    employeesRepo,
    projectsRepo,
    goalsRepo,
    vaultRepo,
    testMode,
    secretsStore,
    threadDigestService,
    runCheckpointService,
    artifactService,
    providersService,
    ticketsRepo,
  } = deps;

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
      getMaxPrivacyTier,
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
    return createRagService({
      embedText,
      dimension,
      repo: ragRepo,
      // Settings → Enhanced AI → Semantic Chunking, read per indexing call:
      // on, documents split on headings, paragraphs and code fences; off,
      // the built-in fixed window. It applies to content indexed from then
      // on (Rebuild re-chunks the rest). This switch used to reach only
      // Enhanced AI's own indexer, which nothing in the app calls.
      chunk: (content) =>
        settingsRepo.get<boolean>('semantic_chunking_enabled', true)
          ? semanticChunkText(content)
          : chunkTextV1(content, { maxTokens: 512, overlapTokens: 64 }),
    });
  }

  const ragService: RagService | null = await buildRagService();
  // A Settings → Privacy refusal of the embedding provider degrades RAG
  // (no semantic search, indexing paused) instead of failing chat turns.
  const reportEmbeddingRefusal = createEmbeddingRefusalReporter();
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
  // The reranker scores by lexical overlap (no network, no model cost),
  // not a learned cross-encoder; it is labelled preview in
  // FEATURE_MATURITY.retrievalReranker. A real Cohere/OpenAI rerank API
  // drops in as `createApiCrossEncoder({ baseURL, apiKey, model })` here
  // without touching the orchestrator. Same story for HyDE: the QE
  // service is created without an LLM today (HyDE off).
  const queryExpansionService = createQueryExpansionService({ hydeEnabled: false });
  const rerankerService = createRerankerService(createLexicalCrossEncoder());

  const retrievalOrchestrator =
    ragService === null
      ? null
      : createRetrievalOrchestrator({
          vectorRetrieve: (input) => ragService.retrieve(input),
          onVectorRetrievalError: (companyId, err) =>
            reportEmbeddingRefusal(`retrieval for company ${companyId}`, err),
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
    approvalInboxService: runtime.approvalInboxServiceInstance ?? undefined,
    routineService: runtime.routineServiceInstance ?? undefined,
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

  return { ragService, reportEmbeddingRefusal, contextAssemblerService, contextPackerService };
}

export interface RagIndexerDeps
  extends Pick<
      Repositories,
      'threadsRepo' | 'meetingsRepo' | 'goalsRepo' | 'projectsRepo' | 'vaultRepo'
    >,
    Pick<PlatformServices, 'bus'>,
    Pick<GovernanceServices, 'ticketsRepo'>,
    Pick<RagAndContext, 'ragService' | 'reportEmbeddingRefusal'> {
  db: TeamXDb;
}

export function startRagIndexer(deps: RagIndexerDeps): void {
  const {
    db,
    bus,
    ragService,
    reportEmbeddingRefusal,
    threadsRepo,
    meetingsRepo,
    ticketsRepo,
    goalsRepo,
    projectsRepo,
    vaultRepo,
  } = deps;

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
    logger: {
      error: (msg, err) => {
        if (reportEmbeddingRefusal('indexing', err)) return;
        console.error('[rag-indexer]', msg, err);
      },
    },
  });
  ragIndexer.start();
  runtime.ragIndexerInstance = ragIndexer;
}

export interface RagIpcDeps
  extends Pick<
      Repositories,
      | 'embeddingsRepo'
      | 'threadsRepo'
      | 'messagesRepo'
      | 'meetingsRepo'
      | 'goalsRepo'
      | 'projectsRepo'
      | 'vaultRepo'
    >,
    Pick<GovernanceServices, 'ticketsRepo'>,
    Pick<RagAndContext, 'ragService'> {}

export function registerRagIpcHandlers(deps: RagIpcDeps): void {
  const {
    embeddingsRepo,
    ragService,
    threadsRepo,
    messagesRepo,
    meetingsRepo,
    ticketsRepo,
    goalsRepo,
    projectsRepo,
    vaultRepo,
  } = deps;

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
  ipcMain.handle('rag.rebuildAll', (_evt, companyId: string) => ragHandlers.rebuildAll(companyId));
  ipcMain.handle('rag.deleteForCompany', (_evt, companyId: string) =>
    ragHandlers.deleteForCompany(companyId),
  );
}
