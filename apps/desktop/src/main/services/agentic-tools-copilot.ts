/**
 * Agentic copilot tools for the `system-copilot` pseudo-employee: read-only
 * `query_copilot_insights` (Phase 5 — M33 T6) and `search_company_knowledge`,
 * which grounds `copilot.ask` answers in the Enhanced AI stack — retrieved
 * passages, remembered facts and knowledge-graph entities.
 *
 * Shape contract (locked to match the M31 read-side + M32 write-side
 * patterns so the loop, system prompt, registry, and canned test seam
 * all stay structurally uniform):
 *
 *   - zod-schema-validated args, `strict()` so accidental arg drift
 *     surfaces on the loop's safeParse step rather than at runtime.
 *   - uniform `{ rows, truncated }` envelope. Rows are JSON-safe
 *     projections (`CopilotInsightProjection`) — deliberately distinct
 *     from the Drizzle `CopilotInsightRow` shape in the repo so the
 *     transcript + event bus round-trip cleanly.
 *   - hard 50-row cap per invocation (`MAX_COPILOT_ROWS`). The tool
 *     over-fetches by one to detect truncation without issuing a
 *     separate COUNT query — same optimisation `query_events` uses.
 *   - `includeDismissed` defaults to `false`. The LLM rarely wants
 *     historical dismissals in the prompt window, and `listActive`
 *     already filters `dismissed_at IS NULL` by default. When the flag
 *     is `true` the repo widens to include dismissed rows via the
 *     `includeDismissed` field threaded through `ListActiveFilter`.
 *
 * The composer `buildCopilotToolRegistry(employee, deps)` gates on
 * `employee.roleId === SYSTEM_COPILOT_ROLE_ID` — the exact symbol
 * exported from `@team-x/shared-types/roles` so no string duplication
 * leaks into this module. Gating by `roleId` rather than by `level`
 * is deliberate: both `system-agent` and `system-copilot` share
 * `level: 'system'`, and only the copilot should receive this tool
 * (the agent continues with its M31 read-only set + M32 write-side
 * tools unchanged). Non-copilot employees get `[]`, letting the
 * composition root concatenate the branches uniformly via
 *   `[...readSideTools, ...buildCopilotToolRegistry(employee, deps)]`
 * when the roleId test passes.
 */

import type { Tool, ToolContext } from '@team-x/intelligence';
import { SYSTEM_COPILOT_ROLE_ID } from '@team-x/shared-types';
import type { CopilotCategory, CopilotSeverity } from '@team-x/shared-types';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard cap on rows returned from any single copilot tool invocation. Mirrors
 *  the M31 read-side `MAX_ROWS` value; kept as a local constant rather than
 *  re-exported so the copilot module has a self-contained cap story. */
export const MAX_COPILOT_ROWS = 50;

/** Authoritative category union — duplicated from the repo module so
 *  this file has no dependency on the Drizzle client surface. Kept in
 *  lockstep with `COPILOT_CATEGORIES` in
 *  `apps/desktop/src/main/db/repos/copilot-insights.ts`. */
const COPILOT_CATEGORIES = ['operational', 'cost', 'org', 'workflow', 'anomaly'] as const;

/** Authoritative severity union — same lockstep invariant as
 *  `COPILOT_CATEGORIES` above. */
const COPILOT_SEVERITIES = ['critical', 'warning', 'info'] as const;

// ---------------------------------------------------------------------------
// Wire projection — JSON-safe row the LLM observes
// ---------------------------------------------------------------------------

/**
 * JSON-safe projection of a single copilot insight row. Mirrors the
 * wire-type shape in `@team-x/shared-types/copilot.ts`
 * (`CopilotInsight`) but without `actionEntitiesJson` — that field is
 * opaque JSON meant for the renderer's action dispatcher, never for
 * the LLM's reasoning window.
 */
export interface CopilotInsightProjection {
  readonly id: string;
  readonly companyId: string;
  readonly category: CopilotCategory;
  readonly severity: CopilotSeverity;
  readonly title: string;
  readonly detail: string;
  readonly actionSuggestion: string | null;
  readonly actionIntent: string | null;
  readonly dismissedAt: number | null;
  readonly createdAt: number;
  readonly expiresAt: number;
}

/**
 * Uniform return envelope. `truncated === true` when the caller's
 * filter matched more rows than `MAX_COPILOT_ROWS` (or the supplied
 * `limit`, whichever is smaller). The LLM uses this signal to either
 * accept the window or tighten filters on the next call.
 */
export interface CopilotToolResult {
  readonly rows: readonly CopilotInsightProjection[];
  readonly truncated: boolean;
}

// ---------------------------------------------------------------------------
// Dependency surface — narrow repo contract, no Drizzle coupling
// ---------------------------------------------------------------------------

/**
 * Single-row shape this module consumes. Matches the Drizzle
 * `CopilotInsightRow` fields the tool uses, but declared locally so
 * this file doesn't depend on the repo module's Drizzle inference
 * surface. Tests pass plain object literals; production wires the
 * real repo via a field-by-field projection.
 */
export interface CopilotToolInsightRow {
  readonly id: string;
  readonly companyId: string;
  readonly category: string;
  readonly severity: string;
  readonly title: string;
  readonly detail: string;
  readonly actionSuggestion: string | null;
  readonly actionIntent: string | null;
  readonly dismissedAt: number | null;
  readonly createdAt: number;
  readonly expiresAt: number;
}

/**
 * Narrow repo surface the tool calls into. Mirrors the M33 T1
 * `CopilotInsightsRepo.listActive` signature but declared locally so
 * this module is decoupled from the Drizzle repo. The optional
 * `includeDismissed` flag is what T6 adds — when `true`, the repo
 * returns dismissed rows as well; when absent/false, preserves the
 * T1 default of active rows only.
 */
export interface CopilotToolInsightsRepo {
  listActive(filter: {
    companyId: string;
    category?: CopilotCategory;
    severity?: CopilotSeverity;
    limit?: number;
    now?: number;
    includeDismissed?: boolean;
  }): readonly CopilotToolInsightRow[];
}

export interface CopilotToolsDeps {
  /** Company the loop is scoped to. Passed through to every repo call. */
  readonly companyId: string;
  readonly copilotInsightsRepo: CopilotToolInsightsRepo;
  /**
   * Enhanced AI grounding. When absent (no embedding provider, so no Enhanced
   * AI service), `search_company_knowledge` is simply not offered rather than
   * offered and failing on every call.
   */
  readonly knowledge?: CopilotKnowledgeSource;
}

/** The grounding `search_company_knowledge` reads — `EnhancedAiService.retrieveContext`. */
export interface CopilotKnowledgeContext {
  passages: Array<{ sourceType: string; sourceId: string; content: string; similarity: number }>;
  facts: Array<{ fact: string; type: string; confidence: number }>;
  related: Array<{ entity: string; relation: string }>;
}

/** Narrow view of the Enhanced AI service so tests pass a plain double. */
export interface CopilotKnowledgeSource {
  retrieveContext(
    query: string,
    options: { companyId: string; topK?: number },
  ): Promise<CopilotKnowledgeContext>;
}

/** Longest excerpt of one passage handed to the model, in characters. */
export const MAX_KNOWLEDGE_EXCERPT_CHARS = 800;

const DEFAULT_KNOWLEDGE_RESULTS = 6;
const MAX_KNOWLEDGE_RESULTS = 10;

export interface SearchCompanyKnowledgeArgs extends Record<string, unknown> {
  query: string;
  companyId?: string;
  limit?: number;
}

export interface SearchCompanyKnowledgeResult {
  passages: Array<{ sourceType: string; sourceId: string; excerpt: string; similarity: number }>;
  facts: Array<{ fact: string; type: string; confidence: number }>;
  related: Array<{ entity: string; relation: string }>;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const queryCopilotInsightsSchema = z
  .object({
    /**
     * Optional override for the scoped `companyId`. Kept on the schema
     * surface so the LLM can reference it by name in a thought, but the
     * handler ALWAYS uses `deps.companyId` — companies are scoped at
     * registry construction, not by the LLM's per-call claim. Ignored
     * values here are a design invariant, not a bug.
     */
    companyId: z.string().min(1).optional(),
    category: z.enum(COPILOT_CATEGORIES).optional(),
    severity: z.enum(COPILOT_SEVERITIES).optional(),
    includeDismissed: z.boolean().optional(),
    limit: z.number().int().positive().max(MAX_COPILOT_ROWS).optional(),
  })
  .strict();

export type QueryCopilotInsightsArgs = z.infer<typeof queryCopilotInsightsSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function effectiveLimit(limit: number | undefined): number {
  if (limit === undefined) return MAX_COPILOT_ROWS;
  if (limit <= 0) return 1;
  if (limit > MAX_COPILOT_ROWS) return MAX_COPILOT_ROWS;
  return Math.floor(limit);
}

function toProjection(row: CopilotToolInsightRow): CopilotInsightProjection {
  return {
    id: row.id,
    companyId: row.companyId,
    category: row.category as CopilotCategory,
    severity: row.severity as CopilotSeverity,
    title: row.title,
    detail: row.detail,
    actionSuggestion: row.actionSuggestion,
    actionIntent: row.actionIntent,
    dismissedAt: row.dismissedAt,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

function checkAborted(ctx: ToolContext): void {
  if (ctx.signal.aborted) {
    throw new Error('canceled');
  }
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

/**
 * Build the `query_copilot_insights` tool closure for the given
 * company + repo. Exposed as a named export so test seams can compose
 * it independently without paying for the full
 * `buildCopilotToolRegistry` roleId gate.
 */
export function buildQueryCopilotInsightsTool(
  deps: CopilotToolsDeps,
): Tool<QueryCopilotInsightsArgs, CopilotToolResult> {
  return {
    name: 'query_copilot_insights',
    description:
      'List copilot insights for the current company, newest-first. ' +
      'Optional filters: `category` (operational|cost|org|workflow|anomaly), ' +
      '`severity` (critical|warning|info), `includeDismissed` (bool; default false — ' +
      'set true to include dismissed rows), `limit` (1-50). Returns id, companyId, ' +
      'category, severity, title, detail, actionSuggestion, actionIntent, ' +
      'dismissedAt, createdAt, expiresAt.',
    schema: queryCopilotInsightsSchema,
    async execute(args, ctx) {
      checkAborted(ctx);
      const limit = effectiveLimit(args.limit);
      // Over-fetch limit+1 to detect truncation without a COUNT query.
      const fetched = deps.copilotInsightsRepo.listActive({
        companyId: deps.companyId,
        category: args.category,
        severity: args.severity,
        includeDismissed: args.includeDismissed === true,
        limit: limit + 1,
      });
      const truncated = fetched.length > limit;
      const displayed = fetched.slice(0, limit);
      const rows: CopilotInsightProjection[] = displayed.map(toProjection);
      return { rows, truncated };
    },
  };
}

const searchCompanyKnowledgeSchema = z
  .object({
    query: z.string().trim().min(1).max(500),
    /** Accepted for symmetry with the other tools; the registry scope wins. */
    companyId: z.string().min(1).optional(),
    limit: z.number().int().optional(),
  })
  .strict();

function excerpt(content: string): string {
  return content.length > MAX_KNOWLEDGE_EXCERPT_CHARS
    ? `${content.slice(0, MAX_KNOWLEDGE_EXCERPT_CHARS)}…`
    : content;
}

/**
 * Build `search_company_knowledge`: semantic search over the company's indexed
 * messages, tickets, meeting minutes and vault files, plus the facts long-term
 * memory has kept and the knowledge-graph entities the question mentions.
 *
 * Returns grounding only — the Copilot's own model writes the answer, so no
 * second model call is spent. Whether facts and entities are included follows
 * Settings → Enhanced AI (Long-Term Memory, Knowledge Graph).
 */
export function buildSearchCompanyKnowledgeTool(deps: {
  readonly companyId: string;
  readonly knowledge: CopilotKnowledgeSource;
}): Tool<SearchCompanyKnowledgeArgs, SearchCompanyKnowledgeResult> {
  return {
    name: 'search_company_knowledge',
    description:
      'Semantic search over this company’s indexed messages, tickets, meeting minutes and ' +
      'vault files, plus facts remembered from earlier conversations and related entities ' +
      'from the knowledge graph. Use it to ground answers about what was said, decided or ' +
      'written — cite `sourceType` + `sourceId` for passages. Args: `query` (required), ' +
      '`limit` (1-10, default 6). Returns passages (excerpt, similarity), facts and related.',
    schema: searchCompanyKnowledgeSchema,
    async execute(args, ctx) {
      checkAborted(ctx);
      const requested = typeof args.limit === 'number' ? args.limit : DEFAULT_KNOWLEDGE_RESULTS;
      const topK = Math.min(MAX_KNOWLEDGE_RESULTS, Math.max(1, Math.floor(requested)));
      const context = await deps.knowledge.retrieveContext(args.query, {
        companyId: deps.companyId,
        topK,
      });
      checkAborted(ctx);
      return {
        passages: context.passages.map((p) => ({
          sourceType: p.sourceType,
          sourceId: p.sourceId,
          excerpt: excerpt(p.content),
          similarity: p.similarity,
        })),
        facts: context.facts,
        related: context.related,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Level-gated composer — analog of `buildWriteSideTools`
// ---------------------------------------------------------------------------

/**
 * Narrow employee descriptor the composer gates on. Only `roleId` is
 * load-bearing; `level` / `id` callers may want for observability can
 * be threaded via the production context separately. Kept minimal so
 * test fixtures pass a one-field object.
 */
export interface CopilotRegistryEmployee {
  readonly roleId: string;
}

/**
 * Level-gated tool-registry composer. Returns
 * `[query_copilot_insights]` when the employee is the company's
 * `system-copilot` pseudo-employee; returns `[]` otherwise.
 *
 * The composition root concatenates this with the read-side registry
 * for the copilot branch:
 *   `[...readSideTools, ...buildCopilotToolRegistry(employee, deps)]`
 * mirroring the M32 T3 write-side injection shape. The system-agent's
 * existing M31 read-only + M32 write-side tool set is unchanged —
 * system-copilot is specifically carved out at the composition root so
 * it never sees the write-side tools.
 */
export function buildCopilotToolRegistry(
  employee: CopilotRegistryEmployee,
  deps: CopilotToolsDeps,
): readonly Tool[] {
  if (employee.roleId !== SYSTEM_COPILOT_ROLE_ID) {
    return [];
  }
  const queryInsights = buildQueryCopilotInsightsTool(deps);
  if (!deps.knowledge) return [queryInsights];
  return [
    queryInsights,
    buildSearchCompanyKnowledgeTool({ companyId: deps.companyId, knowledge: deps.knowledge }),
  ];
}

/** Canonical tool name exported by this module. Parallel to
 *  `AGENTIC_TOOL_NAMES` + `WRITE_SIDE_TOOL_NAMES` in the sibling
 *  modules so the full workspace tool-name registry is three arrays
 *  unioned without cross-module imports. */
export const COPILOT_TOOL_NAMES = ['query_copilot_insights', 'search_company_knowledge'] as const;

export type CopilotToolName = (typeof COPILOT_TOOL_NAMES)[number];
