import type {
  EntityContext,
  QueryExpansionService,
  RerankerService,
  RetrievalHit,
} from '@team-x/intelligence';
import type { EmbeddingSourceType } from '@team-x/shared-types';

import {
  type RagGoalSource,
  type RagProjectSource,
  type RagTicketSource,
  type RagVaultFileSource,
  formatGoalEmbeddingContent,
  formatProjectEmbeddingContent,
  formatTicketEmbeddingContent,
  formatVaultFileEmbeddingContent,
} from './rag-source-content.js';

export interface RetrievalRecentMessage {
  id: string;
  content: string;
  sourceId: string;
}

export interface RetrievalConfig {
  topK: number;
  threshold: number;
  maxTokens: number;
  maxQueries?: number;
  maxPerSourceType?: number;
}

export interface TicketRetrievalRow extends RagTicketSource {
  updatedAt: number;
}

export interface GoalRetrievalRow extends RagGoalSource {
  updatedAt: number;
}

export interface ProjectRetrievalRow extends RagProjectSource {
  updatedAt: number;
}

export interface VaultRetrievalRow extends RagVaultFileSource {
  updatedAt: number;
}

export interface VaultSearchHit {
  id: string;
  rank: number;
}

export interface RetrievalEvidenceEntry {
  sourceType: EmbeddingSourceType;
  sourceId: string;
  chunkIndex: number;
  contentText: string;
  score: number;
  reasons: string[];
}

export interface RetrievalEvidencePack {
  queries: string[];
  entries: RetrievalEvidenceEntry[];
}

export interface RetrievalOrchestratorDeps {
  vectorRetrieve(input: {
    companyId: string;
    query: string;
    topK: number;
    threshold: number;
    excludeSourceIds: string[];
  }): Promise<RetrievalHit[]>;
  listTickets(companyId: string): readonly TicketRetrievalRow[];
  listGoals(companyId: string): readonly GoalRetrievalRow[];
  listProjects(companyId: string): readonly ProjectRetrievalRow[];
  searchVault(companyId: string, query: string): readonly VaultSearchHit[];
  getVaultFile(id: string): VaultRetrievalRow | null;
  now?: () => number;
  /**
   * Optional query expansion service. When wired together with
   * `entityContextProvider`, the latest user message is run through the
   * intelligence package's `QueryExpansionService` to generate semantic
   * variations + domain-synonym substitutions + entity-aware substitutions
   * BEFORE the per-query retrieval loop runs. Expansions are merged with
   * the base queries from `shapeRetrievalQueries`, deduped, and capped at
   * `MAX_EXPANDED_QUERIES` (8) so total fan-out stays bounded.
   *
   * When absent, `retrieveEvidence` uses only the 3 base queries from
   * `shapeRetrievalQueries` — current behavior preserved exactly.
   *
   * Audit 2026-05-07 H10.
   */
  queryExpansion?: QueryExpansionService;
  /**
   * Builds the per-company `EntityContext` consumed by the query expansion
   * service. Wired in the composition root from the company's employees,
   * projects, goals, and tickets repos. Required if `queryExpansion` is
   * to actually expand (the QE service uses entity context to produce
   * ID-substitution and synonym variants); when undefined, the orchestrator
   * skips expansion entirely. Audit 2026-05-07 H10.
   */
  entityContextProvider?: (companyId: string) => EntityContext;
  /**
   * Optional cross-encoder reranker. After the orchestrator's composite
   * scoring (vector + lexical + recency + authority) runs, the top
   * `rerankerOptions.topN` candidates are sent through the reranker's
   * cross-encoder; their scores are replaced with the reranker's
   * `finalScore` (which itself blends original + cross-encoder scores).
   * The remaining (low-score) candidates pass through unchanged. The
   * combined list is then re-sorted before dedup-by-source + token
   * budget fitting.
   *
   * When absent, the existing single-pass scoring is used — current
   * behavior preserved. Audit 2026-05-07 H10.
   */
  reranker?: RerankerService;
  /** Options for the reranker integration. `topN` defaults to `RERANKER_DEFAULT_TOP_N`. Audit H10. */
  rerankerOptions?: { topN?: number };
}

export interface RetrieveEvidenceInput {
  companyId: string;
  recentMessages: readonly RetrievalRecentMessage[];
  excludeSourceIds: string[];
  config: RetrievalConfig;
  countTokens(text: string): number;
}

interface RankedCandidate {
  sourceType: EmbeddingSourceType;
  sourceId: string;
  chunkIndex: number;
  contentText: string;
  vectorScore: number;
  lexicalScore: number;
  updatedAt: number | null;
  matchedQuery: string;
}

/**
 * XML-style tag names per source type. The system prompt's
 * `TRUST_BOUNDARIES` rule (in `@team-x/intelligence` `loop/prompt.ts`)
 * names exactly these tags. Keep the two lists in sync — adding a new
 * source type here REQUIRES updating both `TRUST_BOUNDARIES` and the
 * close-tag escape regex in `loop.ts`'s `escapeFencedCloseTags`.
 */
const EVIDENCE_TAGS: Record<EmbeddingSourceType, string> = {
  message: 'message',
  ticket: 'ticket',
  meeting_minutes: 'meeting',
  goal: 'goal',
  project: 'project',
  vault_file: 'vault_file',
};

/**
 * Defense against fence-breakout. Retrieved content can include any
 * literal text — including a `</vault_file>` close tag that would
 * prematurely terminate the fenced block, letting the rest of the
 * content be interpreted as instructions. We rewrite any literal close
 * tag for our trust-boundary fences with an inert `<\/tag>` form that
 * the model still reads correctly but the parser-eye won't close on.
 *
 * Mirror of `escapeFencedCloseTags` in `@team-x/intelligence`
 * `loop/loop.ts` — kept in sync by hand because cross-package import
 * cycles aren't worth the coupling for one regex.
 */
function escapeEvidenceCloseTags(text: string): string {
  return text.replace(
    /<\/(observation|context|message|vault_file|ticket|meeting|goal|project)>/gi,
    '<\\/$1>',
  );
}

const SOURCE_AUTHORITY: Record<EmbeddingSourceType, number> = {
  message: 0.05,
  meeting_minutes: 0.35,
  ticket: 0.85,
  goal: 0.95,
  project: 0.9,
  vault_file: 0.75,
};

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'our',
  'the',
  'to',
  'we',
  'what',
  'who',
  'why',
  'with',
]);

const DEFAULT_MAX_QUERIES = 3;
const DEFAULT_MAX_PER_SOURCE_TYPE = 2;
const DEFAULT_LEXICAL_LIMIT = 4;

/**
 * Maximum total queries that flow through `vectorRetrieve` per
 * `retrieveEvidence` call after H10 query expansion. Bounds fan-out:
 * 3 base queries (`shapeRetrievalQueries`) + up to 5 expansion variants
 * = 8. Above this we'd start paying meaningful cost on the vector
 * search + structured candidate searches without much marginal recall.
 * Audit 2026-05-07 H10.
 */
const MAX_EXPANDED_QUERIES = 8;

/**
 * Default top-N for the reranker. With `rag_top_k` defaulting to 5 in
 * Settings, reranking 12 candidates and returning the top 5 hits the
 * recommended "retrieve 20-50, rerank top 20, return top 10" sweet
 * spot at our smaller retrieval scale. The composition root can override
 * via `rerankerOptions.topN`. Audit 2026-05-07 H10.
 */
const RERANKER_DEFAULT_TOP_N = 12;

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTerms(value: string): string[] {
  const normalized = normalizeText(value);
  if (!normalized) return [];
  const terms = normalized.split(' ').filter((term) => term.length > 1 && !STOPWORDS.has(term));
  return [...new Set(terms)];
}

function dedupeStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = normalizeText(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function isNonNull<T>(value: T | null): value is T {
  return value !== null;
}

export function shapeRetrievalQueries(
  recentMessages: readonly RetrievalRecentMessage[],
  maxQueries = DEFAULT_MAX_QUERIES,
): string[] {
  const ordered = recentMessages.map((message) => message.content.trim()).filter(Boolean);
  if (ordered.length === 0) return [];

  const latest = ordered[ordered.length - 1] ?? '';
  const combined = ordered.slice(-2).join(' ').trim();
  const keywordQuery = extractTerms(latest).slice(0, 8).join(' ');

  return dedupeStrings([latest, combined, keywordQuery]).slice(0, Math.max(1, maxQueries));
}

function computeLexicalScore(query: string, content: string, sourceId: string): number {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 0;

  const haystack = normalizeText(`${sourceId} ${content}`);
  if (!haystack) return 0;
  if (haystack.includes(normalizedQuery)) return 1;

  const queryTerms = extractTerms(query);
  if (queryTerms.length === 0) return 0;

  let hits = 0;
  for (const term of queryTerms) {
    if (haystack.includes(term)) hits += 1;
  }

  const ratio = hits / queryTerms.length;
  return ratio >= 0.4 ? ratio : 0;
}

function computeRecencyWeight(updatedAt: number | null, now: number): number {
  if (updatedAt === null || !Number.isFinite(updatedAt) || updatedAt <= 0) return 0;
  const ageMs = Math.max(0, now - updatedAt);
  const dayMs = 24 * 60 * 60 * 1000;
  if (ageMs <= dayMs) return 1;
  if (ageMs <= 7 * dayMs) return 0.75;
  if (ageMs <= 30 * dayMs) return 0.4;
  return 0.1;
}

function exactMatch(query: string, sourceId: string, contentText: string): boolean {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return false;
  return (
    normalizeText(sourceId).includes(normalizedQuery) ||
    normalizeText(contentText).includes(normalizedQuery)
  );
}

function computeOverlap(query: string, contentText: string, sourceId: string): number {
  const queryTerms = extractTerms(query);
  if (queryTerms.length === 0) return 0;

  const haystack = new Set(extractTerms(`${sourceId} ${contentText}`));
  let matches = 0;
  for (const term of queryTerms) {
    if (haystack.has(term)) matches += 1;
  }
  return matches / queryTerms.length;
}

function scoreCandidate(candidate: RankedCandidate, now: number): RetrievalEvidenceEntry {
  const overlap = computeOverlap(candidate.matchedQuery, candidate.contentText, candidate.sourceId);
  const exact = exactMatch(candidate.matchedQuery, candidate.sourceId, candidate.contentText);
  const recency = computeRecencyWeight(candidate.updatedAt, now);
  const authority = SOURCE_AUTHORITY[candidate.sourceType] ?? 0.3;

  const score =
    candidate.vectorScore * 0.45 +
    candidate.lexicalScore * 0.34 +
    (exact ? 0.16 : 0) +
    overlap * 0.12 +
    authority * 0.14 +
    recency * 0.08;

  const reasons = new Set<string>();
  if (candidate.vectorScore >= 0.7) reasons.add('semantic');
  if (candidate.lexicalScore >= 0.85) reasons.add('exact');
  else if (candidate.lexicalScore >= 0.4) reasons.add('lexical');
  if (authority >= 0.8) reasons.add('authoritative');
  if (recency >= 0.75) reasons.add('recent');
  if (overlap >= 0.75) reasons.add('aligned');

  return {
    sourceType: candidate.sourceType,
    sourceId: candidate.sourceId,
    chunkIndex: candidate.chunkIndex,
    contentText: candidate.contentText,
    score,
    reasons: [...reasons],
  };
}

function compareEvidence(a: RetrievalEvidenceEntry, b: RetrievalEvidenceEntry): number {
  const scoreDelta = b.score - a.score;
  if (scoreDelta !== 0) return scoreDelta;

  const authorityDelta =
    (SOURCE_AUTHORITY[b.sourceType] ?? 0) - (SOURCE_AUTHORITY[a.sourceType] ?? 0);
  if (authorityDelta !== 0) return authorityDelta;

  return a.sourceId.localeCompare(b.sourceId);
}

function fitEntryToBudget(
  entry: RetrievalEvidenceEntry,
  remainingTokens: number,
  countTokens: (text: string) => number,
): RetrievalEvidenceEntry | null {
  const fullLine = formatEvidenceLine(entry);
  if (countTokens(fullLine) <= remainingTokens) return entry;
  if (remainingTokens < 8) return null;

  // Compute the actual wrapper overhead (open tag + newlines + close tag)
  // for THIS entry's source type so truncation math doesn't over-reserve.
  const wrapperLength = formatEvidenceLine({ ...entry, contentText: '' }).length;
  const maxChars = Math.max(0, remainingTokens * 4 - wrapperLength - 3);
  if (maxChars < 24) return null;

  let nextContent = entry.contentText.slice(0, maxChars).trim();
  while (nextContent.length >= 16) {
    const candidate = { ...entry, contentText: `${nextContent}...` };
    if (countTokens(formatEvidenceLine(candidate)) <= remainingTokens) return candidate;
    nextContent = nextContent.slice(0, Math.max(16, nextContent.length - 20)).trim();
  }

  return null;
}

/**
 * Render a retrieved evidence entry into the trust-fenced XML form the
 * agent's system prompt is told to treat as DATA, not instructions.
 *
 * Format: `<{tag} id="{sourceId}" trust="untrusted">{content}</{tag}>`
 *
 * The tag is per-source-type so the model can quickly reason about
 * provenance ("this is a vault file the user uploaded" vs "this is a
 * meeting transcript"). The `trust="untrusted"` attribute is redundant
 * with the tag name but is the keyword the system prompt's trust rule
 * matches on, so it stays even when the tag is self-explanatory.
 *
 * Content is run through `escapeEvidenceCloseTags` to neutralize a
 * fence-breakout attack where retrieved text contains a literal
 * `</vault_file>` close tag.
 */
export function formatEvidenceLine(
  entry: Pick<RetrievalEvidenceEntry, 'sourceType' | 'sourceId' | 'contentText'>,
): string {
  const tag = EVIDENCE_TAGS[entry.sourceType] ?? 'context';
  const safeId = String(entry.sourceId).replace(/"/g, '&quot;');
  const safeContent = escapeEvidenceCloseTags(entry.contentText);
  return `<${tag} id="${safeId}" trust="untrusted">\n${safeContent}\n</${tag}>`;
}

function buildStructuredCandidates(
  query: string,
  rows: readonly TicketRetrievalRow[],
): RankedCandidate[] {
  return rows
    .map((row) => {
      const contentText = formatTicketEmbeddingContent(row);
      const lexicalScore = computeLexicalScore(query, contentText, row.id);
      if (lexicalScore <= 0) return null;
      return {
        sourceType: 'ticket' as const,
        sourceId: row.id,
        chunkIndex: 0,
        contentText,
        vectorScore: 0,
        lexicalScore,
        updatedAt: row.updatedAt,
        matchedQuery: query,
      };
    })
    .filter(isNonNull)
    .sort((a, b) => b.lexicalScore - a.lexicalScore || (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, DEFAULT_LEXICAL_LIMIT);
}

function buildGoalCandidates(query: string, rows: readonly GoalRetrievalRow[]): RankedCandidate[] {
  return rows
    .map((row) => {
      const contentText = formatGoalEmbeddingContent(row);
      const lexicalScore = computeLexicalScore(query, contentText, row.id);
      if (lexicalScore <= 0) return null;
      return {
        sourceType: 'goal' as const,
        sourceId: row.id,
        chunkIndex: 0,
        contentText,
        vectorScore: 0,
        lexicalScore,
        updatedAt: row.updatedAt,
        matchedQuery: query,
      };
    })
    .filter(isNonNull)
    .sort((a, b) => b.lexicalScore - a.lexicalScore || (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, DEFAULT_LEXICAL_LIMIT);
}

function buildProjectCandidates(
  query: string,
  rows: readonly ProjectRetrievalRow[],
): RankedCandidate[] {
  return rows
    .map((row) => {
      const contentText = formatProjectEmbeddingContent(row);
      const lexicalScore = computeLexicalScore(query, contentText, row.id);
      if (lexicalScore <= 0) return null;
      return {
        sourceType: 'project' as const,
        sourceId: row.id,
        chunkIndex: 0,
        contentText,
        vectorScore: 0,
        lexicalScore,
        updatedAt: row.updatedAt,
        matchedQuery: query,
      };
    })
    .filter(isNonNull)
    .sort((a, b) => b.lexicalScore - a.lexicalScore || (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, DEFAULT_LEXICAL_LIMIT);
}

function buildVaultCandidates(
  query: string,
  hits: readonly VaultSearchHit[],
  getVaultFile: (id: string) => VaultRetrievalRow | null,
): RankedCandidate[] {
  return hits
    .map((hit) => {
      const file = getVaultFile(hit.id);
      if (!file) return null;
      const contentText = formatVaultFileEmbeddingContent(file);
      const lexicalScore = Math.max(computeLexicalScore(query, contentText, file.id), 0.7);
      return {
        sourceType: 'vault_file' as const,
        sourceId: file.id,
        chunkIndex: 0,
        contentText,
        vectorScore: 0,
        lexicalScore,
        updatedAt: file.updatedAt,
        matchedQuery: query,
      };
    })
    .filter(isNonNull)
    .slice(0, DEFAULT_LEXICAL_LIMIT);
}

export function createRetrievalOrchestrator(deps: RetrievalOrchestratorDeps) {
  const now = deps.now ?? Date.now;

  /**
   * Compose the final query list for one `retrieveEvidence` call.
   *
   * Always starts with the 3 base queries from `shapeRetrievalQueries`
   * (latest message / latest-2 combined / keyword condense). When
   * `queryExpansion` AND `entityContextProvider` are both wired, the
   * latest user message is also run through the intelligence package's
   * `QueryExpansionService` to produce semantic + synonym + entity
   * substitution variants. The final list is the union — deduped by
   * normalized text and capped at `MAX_EXPANDED_QUERIES` so total
   * vector-retrieval fan-out stays bounded.
   *
   * Failures in expansion (LLM unavailable, network error, malformed
   * EntityContext) fall through silently — the base queries are still
   * usable, and the orchestrator's job is retrieval, not expansion
   * health. The caller's countTokens / topK budgets still bind.
   *
   * Audit 2026-05-07 H10.
   */
  async function composeQueryList(
    input: RetrieveEvidenceInput,
    baseQueries: readonly string[],
  ): Promise<string[]> {
    if (!deps.queryExpansion || !deps.entityContextProvider) {
      return baseQueries.slice();
    }
    const latest = input.recentMessages[input.recentMessages.length - 1]?.content?.trim();
    if (!latest) return baseQueries.slice();

    let expansions: readonly string[] = [];
    try {
      const context = deps.entityContextProvider(input.companyId);
      const expanded = await deps.queryExpansion.expand(latest, context);
      expansions = expanded.expansions;
    } catch {
      // Expansion failure must not break retrieval. Fall back to base queries.
      return baseQueries.slice();
    }

    return dedupeStrings([...baseQueries, ...expansions]).slice(0, MAX_EXPANDED_QUERIES);
  }

  /**
   * After the composite scorer has run, optionally rerank the top-N
   * candidates with a cross-encoder. The reranker re-scores the top
   * slice and returns a list whose `finalScore` blends original +
   * cross-encoder scores; we splice those re-scored entries back into
   * the full list at their old positions, then re-sort. The tail
   * (positions >= topN) keeps its original score so a low-confidence
   * tail entry never gets a free promotion just because it dropped
   * out of the rerank slice.
   *
   * Reranker failures (cross-encoder API down, mock throws) fall back
   * to the original ordering — retrieval keeps working. Logged at
   * console.warn so the composition root's logger picks it up; the
   * orchestrator itself stays free of injected loggers (no dep growth).
   *
   * Audit 2026-05-07 H10.
   */
  async function applyReranker(
    query: string,
    scored: RetrievalEvidenceEntry[],
  ): Promise<RetrievalEvidenceEntry[]> {
    if (!deps.reranker || scored.length < 2) return scored;
    const topN = Math.max(2, deps.rerankerOptions?.topN ?? RERANKER_DEFAULT_TOP_N);
    const head = scored.slice(0, Math.min(topN, scored.length));
    const tail = scored.slice(head.length);

    let reranked: Awaited<ReturnType<RerankerService['rerank']>>;
    try {
      reranked = await deps.reranker.rerank(
        query,
        head.map((entry) => ({
          // Synthetic id keyed by sourceType + sourceId + chunkIndex so the
          // reranker's input has a stable handle that matches the source list.
          id: `${entry.sourceType}:${entry.sourceId}:${entry.chunkIndex}`,
          sourceId: entry.sourceId,
          sourceType: entry.sourceType,
          chunkIndex: entry.chunkIndex,
          content: entry.contentText,
          score: entry.score,
        })),
      );
    } catch {
      return scored;
    }

    // Map reranked finalScore back onto the head entries by synthetic id.
    const finalScoreById = new Map<string, number>();
    for (const r of reranked) {
      finalScoreById.set(r.id, r.finalScore);
    }
    const headRescored = head.map((entry): RetrievalEvidenceEntry => {
      const id = `${entry.sourceType}:${entry.sourceId}:${entry.chunkIndex}`;
      const finalScore = finalScoreById.get(id);
      if (finalScore === undefined) return entry;
      const reasons = entry.reasons.includes('reranked')
        ? entry.reasons
        : [...entry.reasons, 'reranked'];
      return { ...entry, score: finalScore, reasons };
    });

    return [...headRescored, ...tail].sort(compareEvidence);
  }

  return {
    async retrieveEvidence(input: RetrieveEvidenceInput): Promise<RetrievalEvidencePack> {
      const baseQueries = shapeRetrievalQueries(
        input.recentMessages,
        input.config.maxQueries ?? DEFAULT_MAX_QUERIES,
      );
      if (baseQueries.length === 0) {
        return { queries: [], entries: [] };
      }

      // H10 — augment base queries with query expansion when wired.
      // Falls back to base queries on expansion failure or when deps are
      // absent. Audit 2026-05-07 H10.
      const queries = await composeQueryList(input, baseQueries);

      const candidateList: RankedCandidate[] = [];
      const seenVectorHits = new Set<string>();

      for (const query of queries) {
        const vectorHits = await deps.vectorRetrieve({
          companyId: input.companyId,
          query,
          topK: Math.max(input.config.topK, 4),
          threshold: input.config.threshold,
          excludeSourceIds: input.excludeSourceIds,
        });

        for (const hit of vectorHits) {
          const key = `${hit.sourceType}:${hit.sourceId}:${hit.chunkIndex}`;
          if (seenVectorHits.has(key)) continue;
          seenVectorHits.add(key);
          candidateList.push({
            sourceType: hit.sourceType,
            sourceId: hit.sourceId,
            chunkIndex: hit.chunkIndex,
            contentText: hit.contentText,
            vectorScore: hit.similarity,
            lexicalScore: 0,
            updatedAt: null,
            matchedQuery: query,
          });
        }

        candidateList.push(...buildStructuredCandidates(query, deps.listTickets(input.companyId)));
        candidateList.push(...buildGoalCandidates(query, deps.listGoals(input.companyId)));
        candidateList.push(...buildProjectCandidates(query, deps.listProjects(input.companyId)));
        candidateList.push(
          ...buildVaultCandidates(query, deps.searchVault(input.companyId, query), (id) =>
            deps.getVaultFile(id),
          ),
        );
      }

      const scored = candidateList.map((candidate) => scoreCandidate(candidate, now()));
      scored.sort(compareEvidence);

      // H10 — cross-encoder rerank pass over the top-N composite-scored
      // candidates. Reorders by reranker finalScore; tail keeps original
      // scores. Failures fall back to composite ordering. Audit 2026-05-07 H10.
      const rerankQuery = queries[0] ?? '';
      const finalScored = await applyReranker(rerankQuery, scored);

      const uniqueBySource = new Map<string, RetrievalEvidenceEntry>();
      for (const entry of finalScored) {
        const key = `${entry.sourceType}:${entry.sourceId}`;
        if (!uniqueBySource.has(key)) uniqueBySource.set(key, entry);
      }

      const packed: RetrievalEvidenceEntry[] = [];
      const maxPerSourceType = Math.max(
        1,
        input.config.maxPerSourceType ?? DEFAULT_MAX_PER_SOURCE_TYPE,
      );
      const perType = new Map<EmbeddingSourceType, number>();
      let usedTokens = 0;

      for (const entry of uniqueBySource.values()) {
        if (packed.length >= input.config.topK) break;
        const count = perType.get(entry.sourceType) ?? 0;
        if (count >= maxPerSourceType) continue;

        const remaining = input.config.maxTokens - usedTokens;
        if (remaining <= 0) break;

        const fitted = fitEntryToBudget(entry, remaining, input.countTokens);
        if (!fitted) continue;

        usedTokens += input.countTokens(formatEvidenceLine(fitted));
        perType.set(entry.sourceType, count + 1);
        packed.push(fitted);
      }

      return { queries, entries: packed };
    },
  };
}
