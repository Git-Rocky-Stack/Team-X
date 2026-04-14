/**
 * rag.* IPC handlers — surface RAG state and rebuild control to the
 * renderer's Settings panel.
 *
 * Phase 5 — M29.
 *
 * Kept in a separate module (rather than folded into the monolithic
 * `handlers.ts`) because the RAG subsystem is optional at runtime
 * (invariant #7 — zero phone-home; RAG is off unless the user opts
 * in with a configured embedding provider). This isolation means the
 * `handlers.ts` factory does not take on a dependency on the rag-
 * service types and stays symmetrical with the vault/backup/audit
 * split that M21–M24 established.
 *
 * The factory is pure — it takes its repo + service callbacks as
 * dependencies and returns a record of async functions. Unit-tested
 * against hand-rolled fakes in `rag-handlers.test.ts`. The Electron
 * wiring that maps these functions onto `ipcMain.handle` lives in
 * `main/index.ts` alongside the other `rag.*` constructors so the
 * `ragService`/`embeddingsRepo`/`threadsRepo`/`messagesRepo` handles
 * are visible at a single point in the boot graph.
 */

export interface RagHandlersDeps {
  /**
   * Narrow surface of the embeddings repository — only the two
   * read-side methods the stats handler needs. Kept structural (not
   * nominal) so tests can pass a `vi.fn()` record and the production
   * `createEmbeddingsRepo(db)` return type satisfies it via
   * structural subtyping with no cast.
   */
  embeddingsRepo: {
    countByCompany(companyId: string): number;
    listByCompany(companyId: string): Array<{ createdAt: number }>;
  };
  /**
   * Resolves the current RAG on/off state at call time (not at
   * factory-build time) so the Settings UI sees the live value even
   * when the user toggles RAG mid-session.
   */
  isRagEnabled: () => boolean;
  /**
   * Wipes every embedding row for a company and returns how many
   * rows were deleted. Implemented in `main/index.ts` as a loop over
   * `embeddingsRepo.listByCompany(...)` + `deleteBySource(...)` so the
   * repo surface does not need to grow a dedicated
   * `deleteByCompany` just for this one caller.
   */
  deleteAllForCompany(companyId: string): number;
  /**
   * Walks every message in every thread of the company and re-indexes
   * each one through `ragService.indexSource`. Returns how many
   * sources were scheduled. When RAG is disabled, implementation
   * returns `0` — the caller UI then shows "RAG disabled".
   */
  rebuildSources(companyId: string): Promise<number>;
}

export interface RagHandlers {
  /**
   * `rag.stats` — count + last-indexed timestamp + enabled flag for
   * the Settings panel summary card.
   */
  stats(companyId: string): Promise<{
    embeddingCount: number;
    lastIndexedAt: number | null;
    enabled: boolean;
  }>;
  /**
   * `rag.rebuildAll` — destructive: wipes the company's embeddings
   * then re-indexes all message/meeting sources. Returns how many
   * sources were scheduled for indexing.
   */
  rebuildAll(companyId: string): Promise<{ scheduled: number }>;
  /**
   * `rag.deleteForCompany` — destructive: wipes the company's
   * embeddings without re-indexing. Returns how many rows were
   * deleted.
   */
  deleteForCompany(companyId: string): Promise<{ deleted: number }>;
}

export function buildRagHandlers(deps: RagHandlersDeps): RagHandlers {
  return {
    async stats(companyId: string) {
      const embeddingCount = deps.embeddingsRepo.countByCompany(companyId);
      const rows = deps.embeddingsRepo.listByCompany(companyId);
      const lastIndexedAt =
        rows.length === 0 ? null : rows.reduce((max, r) => Math.max(max, r.createdAt), 0);
      return { embeddingCount, lastIndexedAt, enabled: deps.isRagEnabled() };
    },

    async rebuildAll(companyId: string) {
      deps.deleteAllForCompany(companyId);
      const scheduled = await deps.rebuildSources(companyId);
      return { scheduled };
    },

    async deleteForCompany(companyId: string) {
      return { deleted: deps.deleteAllForCompany(companyId) };
    },
  };
}
