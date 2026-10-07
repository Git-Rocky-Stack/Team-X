/**
 * Settings → Privacy can refuse the RAG embedding provider. That is a policy,
 * not a fault: retrieval carries on without semantic search (tickets, goals,
 * projects and vault still match lexically) and indexing pauses. This
 * reporter recognises that refusal so callers can absorb it, and says so once
 * per scope instead of failing every chat turn or logging every message.
 */
import { PrivacyTierViolationError } from './provider-factory.js';

export type EmbeddingRefusalReporter = (scope: string, err: unknown) => boolean;

export function createEmbeddingRefusalReporter(
  deps: { warn?: (message: string) => void } = {},
): EmbeddingRefusalReporter {
  const warn = deps.warn ?? ((message: string) => console.warn(message));
  const reported = new Set<string>();
  return (scope, err) => {
    if (!(err instanceof PrivacyTierViolationError)) return false;
    if (!reported.has(scope)) {
      reported.add(scope);
      warn(
        `[rag] ${scope}: ${err.message} Until then, retrieval runs without semantic search and new content is not indexed (Settings → Retrieval → Rebuild catches up afterwards).`,
      );
    }
    return true;
  };
}
