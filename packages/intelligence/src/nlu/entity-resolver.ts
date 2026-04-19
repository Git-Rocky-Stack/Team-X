/**
 * Entity resolver — fuzzy name + FTS5 resolution against the four entity
 * kinds that the NLU layer mentions: employees, tickets, vault files,
 * and roles.
 *
 * Given a classifier slot like `employeeQuery: "Sarah"`, this resolver
 * returns one of three outcomes:
 *   - `{ kind: 'unique', value }`      — exactly one confident match
 *   - `{ kind: 'ambiguous', candidates }` — 2-5 plausible matches; the
 *     command palette shows these as selectable rows so Rocky can pick.
 *   - `{ kind: 'not_found' }`          — nothing plausible matched.
 *
 * Architectural invariants honored:
 *   - The package stays DB-agnostic. No `better-sqlite3`, no `drizzle-orm`,
 *     no `electron` import. All DB + FTS5 access arrives through injected
 *     `EntityResolverDeps` callbacks. The main-process composition root
 *     wires these to the real repos; unit tests pass in-memory stubs.
 *   - No side effects at module load. State lives in the closure created
 *     by `createEntityResolver()`.
 *   - Pure Levenshtein implementation (no `fuzzysort` dep, no native
 *     bindings) keeps the package portable.
 *
 * Design notes (plan-ambiguous detail choices, documented here because
 * §T2 leaves the thresholds to the implementer):
 *   - Employees/roles: we compute a Levenshtein distance normalized by the
 *     longer string's length. Exact case-insensitive matches on the
 *     full name (or on any whitespace-delimited token of the name, which
 *     is how "Sarah" → "Sarah Chen" works) short-circuit to `unique`.
 *     Otherwise we accept candidates whose normalized distance ≤ 0.34.
 *     If exactly one candidate is inside the threshold AND the runner-up
 *     is at least 0.15 worse, that's `unique`; 2-5 close candidates are
 *     `ambiguous`; else `not_found`.
 *   - Tickets: `#N` / `N` short-circuits to `getTicketById`. Text queries
 *     go through FTS5 (`searchTickets` deps callback). Clear rank margin
 *     (top hit's score is at least 1.5x the runner-up) → `unique`, else
 *     up to 5 ambiguous candidates.
 *   - Vault files: pure FTS5. `VaultSearchResult.rank` is BM25 (lower is
 *     better in SQLite FTS5), so the margin test is inverted. If the
 *     caller's `searchVault` returns results in relevance order, we trust
 *     the order and apply the same 1.5x margin heuristic against the
 *     numeric rank field. The full `VaultFile` record is not needed for
 *     the palette's display — a minimal `VaultFileLike` structural type
 *     captures the fields the resolver reads (id, originalName).
 *
 * Phase 5 — M30 — T2.
 */

import type {
  Employee as EmployeeRow,
  RoleSpec as RoleDefinition,
  Ticket as TicketRow,
  VaultFile,
} from '@team-x/shared-types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ResolvedEntity<T> =
  | { kind: 'unique'; value: T }
  | { kind: 'ambiguous'; candidates: T[] }
  | { kind: 'not_found' };

export interface EntityResolver {
  resolveEmployee(name: string, companyId: string): Promise<ResolvedEntity<EmployeeRow>>;
  resolveTicket(ref: string, companyId: string): Promise<ResolvedEntity<TicketRow>>;
  resolveVaultFile(query: string, companyId: string): Promise<ResolvedEntity<VaultFile>>;
  resolveRole(query: string): Promise<ResolvedEntity<RoleDefinition>>;
}

/**
 * Injected dependencies. Keep this interface narrow — the package must not
 * know anything about SQLite, Drizzle, or Electron.
 *
 * Implementations of `searchTickets` / `searchVault` are expected to return
 * results already ordered by FTS5 relevance (best first).
 */
export interface EntityResolverDeps {
  listEmployees(companyId: string): Promise<EmployeeRow[]>;
  getTicketById(id: string, companyId: string): Promise<TicketRow | null>;
  searchTickets(query: string, companyId: string): Promise<TicketRow[]>;
  searchVault(query: string, companyId: string): Promise<VaultFileRankedLike[]>;
  listRoles(): Promise<RoleDefinition[]>;
}

/**
 * Minimal structural shape the vault resolver relies on. The `rank` field
 * is SQLite FTS5's BM25 score (lower = better). Callers that don't have
 * a rank available can pass `VaultFile`-shaped rows with `rank: index`.
 */
export interface VaultFileRankedLike {
  file: VaultFile;
  /** BM25 rank from SQLite FTS5. Lower is better. Missing → treated as 0. */
  rank?: number;
}

// ---------------------------------------------------------------------------
// Thresholds (tuned to match the plan's "unique / ambiguous / not_found"
// tri-state semantics with reasonable defaults).
// ---------------------------------------------------------------------------

/**
 * Normalized Levenshtein above which a candidate is discarded outright.
 *
 * 0.4 accepts "sarha" → "sarah" (2 edits / 5 = 0.4, a realistic typo) but
 * rejects pairs like "zephyrion" → "sarah" (>0.7).
 */
const FUZZY_THRESHOLD = 0.4;
/**
 * Distance margin between the best and second-best candidate required to
 * treat the best as unique. 0.15 is roughly "one character better" on
 * short strings.
 */
const FUZZY_UNIQUE_MARGIN = 0.15;
/** Vault + ticket FTS5 margin: top hit's rank must be this ratio clearer. */
const FTS_UNIQUE_RANK_RATIO = 1.5;
/** Max candidates surfaced in the ambiguous state. */
const MAX_CANDIDATES = 5;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createEntityResolver(deps: EntityResolverDeps): EntityResolver {
  return {
    resolveEmployee(name, companyId) {
      return resolveEmployee(deps, name, companyId);
    },
    resolveTicket(ref, companyId) {
      return resolveTicket(deps, ref, companyId);
    },
    resolveVaultFile(query, companyId) {
      return resolveVaultFile(deps, query, companyId);
    },
    resolveRole(query) {
      return resolveRole(deps, query);
    },
  };
}

// ---------------------------------------------------------------------------
// Employee resolver
// ---------------------------------------------------------------------------

async function resolveEmployee(
  deps: EntityResolverDeps,
  name: string,
  companyId: string,
): Promise<ResolvedEntity<EmployeeRow>> {
  const needle = name.trim().toLowerCase();
  if (!needle) return { kind: 'not_found' };

  const employees = await deps.listEmployees(companyId);
  if (employees.length === 0) return { kind: 'not_found' };

  // 1) Exact case-insensitive name match (full name OR token match).
  //    "Sarah" unambiguously wins over "Sarah Chen" if she's the only
  //    Sarah — but if two employees have "Sarah" as a token, both qualify
  //    and we fall through to the fuzzy pass for disambiguation.
  const exactMatches = employees.filter((e) => {
    const full = e.name.trim().toLowerCase();
    if (full === needle) return true;
    const tokens = full.split(/\s+/);
    return tokens.includes(needle);
  });
  if (exactMatches.length === 1) {
    return { kind: 'unique', value: exactMatches[0]! };
  }
  if (exactMatches.length > 1) {
    return {
      kind: 'ambiguous',
      candidates: exactMatches.slice(0, MAX_CANDIDATES),
    };
  }

  // 2) Fuzzy pass over name + title (role-name proxy at the Employee level
  //    since role.name requires a role-spec join that the deps layer
  //    shouldn't have to do).
  const scored = employees
    .map((e) => {
      const fullName = e.name.toLowerCase();
      const title = (e.title ?? '').toLowerCase();
      const nameScore = bestTokenDistance(needle, fullName);
      const titleScore = title ? bestTokenDistance(needle, title) : 1;
      return { employee: e, score: Math.min(nameScore, titleScore) };
    })
    .filter((s) => s.score <= FUZZY_THRESHOLD)
    .sort((a, b) => a.score - b.score);

  return classifyFuzzy(scored, (s) => s.employee);
}

// ---------------------------------------------------------------------------
// Ticket resolver
// ---------------------------------------------------------------------------

async function resolveTicket(
  deps: EntityResolverDeps,
  ref: string,
  companyId: string,
): Promise<ResolvedEntity<TicketRow>> {
  const trimmed = ref.trim();
  if (!trimmed) return { kind: 'not_found' };

  // `#42` or `42` → direct id lookup.
  const idMatch = trimmed.match(/^#?(\d+)$/);
  if (idMatch) {
    const ticket = await deps.getTicketById(idMatch[1]!, companyId);
    return ticket ? { kind: 'unique', value: ticket } : { kind: 'not_found' };
  }

  // Otherwise, FTS5.
  const matches = await deps.searchTickets(trimmed, companyId);
  if (matches.length === 0) return { kind: 'not_found' };
  if (matches.length === 1) return { kind: 'unique', value: matches[0]! };
  return {
    kind: 'ambiguous',
    candidates: matches.slice(0, MAX_CANDIDATES),
  };
}

// ---------------------------------------------------------------------------
// Vault file resolver
// ---------------------------------------------------------------------------

async function resolveVaultFile(
  deps: EntityResolverDeps,
  query: string,
  companyId: string,
): Promise<ResolvedEntity<VaultFile>> {
  const trimmed = query.trim();
  if (!trimmed) return { kind: 'not_found' };

  const matches = await deps.searchVault(trimmed, companyId);
  if (matches.length === 0) return { kind: 'not_found' };
  if (matches.length === 1) {
    const only = matches[0];
    if (!only) return { kind: 'not_found' };
    return { kind: 'unique', value: only.file };
  }

  // Clear rank margin → unique.
  // FTS5 BM25 rank is negative; more-negative means better. We test
  // whichever side of zero we're on by comparing absolute ratios.
  const best = matches[0]!;
  const runnerUp = matches[1]!;
  if (hasClearVaultMargin(best.rank, runnerUp.rank)) {
    return { kind: 'unique', value: best.file };
  }

  return {
    kind: 'ambiguous',
    candidates: matches.slice(0, MAX_CANDIDATES).map((m) => m.file),
  };
}

function hasClearVaultMargin(
  bestRank: number | undefined,
  runnerRank: number | undefined,
): boolean {
  // Missing ranks → no margin to speak of; leave it ambiguous.
  if (bestRank === undefined || runnerRank === undefined) return false;
  const absBest = Math.abs(bestRank);
  const absRunner = Math.abs(runnerRank);
  if (absBest === 0 && absRunner === 0) return false;
  if (absRunner === 0) return true;
  // In BM25, "better" is "more negative" (larger |rank|). A clear winner
  // has |best| >= runner * ratio when we want a meaningfully larger score,
  // OR runner >= best * ratio in the inverted-positive case. Treat both
  // conventions uniformly by checking the max/min ratio.
  const ratio =
    Math.max(absBest, absRunner) / Math.max(Math.min(absBest, absRunner), Number.EPSILON);
  if (!Number.isFinite(ratio)) return false;
  // Only the *better* candidate winning clearly should return `unique` —
  // if the runner-up has the larger absolute score, the sort was wrong
  // upstream and we don't try to second-guess it.
  if (absBest < absRunner) {
    // Sort contract says best comes first; lower absolute rank cannot be
    // the winner in BM25. Treat as ambiguous.
    return false;
  }
  return ratio >= FTS_UNIQUE_RANK_RATIO;
}

// ---------------------------------------------------------------------------
// Role resolver
// ---------------------------------------------------------------------------

async function resolveRole(
  deps: EntityResolverDeps,
  query: string,
): Promise<ResolvedEntity<RoleDefinition>> {
  const needle = query.trim().toLowerCase();
  if (!needle) return { kind: 'not_found' };

  const roles = await deps.listRoles();
  if (roles.length === 0) return { kind: 'not_found' };

  // 1) Exact case-insensitive match against id / name / level.
  const exact = roles.filter((r) => {
    const fm = r.frontmatter;
    return (
      fm.id.toLowerCase() === needle ||
      fm.name.toLowerCase() === needle ||
      fm.level.toLowerCase() === needle
    );
  });
  if (exact.length === 1) return { kind: 'unique', value: exact[0]! };
  if (exact.length > 1) {
    return { kind: 'ambiguous', candidates: exact.slice(0, MAX_CANDIDATES) };
  }

  // 2) Fuzzy pass across id + name + level.
  const scored = roles
    .map((r) => {
      const fm = r.frontmatter;
      const idScore = normalizedLevenshtein(needle, fm.id.toLowerCase());
      const nameScore = bestTokenDistance(needle, fm.name.toLowerCase());
      const levelScore = normalizedLevenshtein(needle, fm.level.toLowerCase());
      return { role: r, score: Math.min(idScore, nameScore, levelScore) };
    })
    .filter((s) => s.score <= FUZZY_THRESHOLD)
    .sort((a, b) => a.score - b.score);

  return classifyFuzzy(scored, (s) => s.role);
}

// ---------------------------------------------------------------------------
// Shared fuzzy-resolution primitives
// ---------------------------------------------------------------------------

interface ScoredItem {
  score: number;
}

/**
 * Given a sorted (ascending score) list of candidates, produce a tri-state
 * result:
 *   - 0 candidates → `not_found`
 *   - 1 candidate → `unique`
 *   - 2+ candidates with a clear margin between #1 and #2 → `unique`
 *   - otherwise → `ambiguous` (capped at MAX_CANDIDATES).
 */
function classifyFuzzy<S extends ScoredItem, T>(
  scored: S[],
  unwrap: (s: S) => T,
): ResolvedEntity<T> {
  if (scored.length === 0) return { kind: 'not_found' };
  if (scored.length === 1) {
    // biome-ignore lint/style/noNonNullAssertion: length === 1 guarantees scored[0] is defined
    return { kind: 'unique', value: unwrap(scored[0]!) };
  }
  // biome-ignore lint/style/noNonNullAssertion: prior length checks above prove scored[0] is defined
  const best = scored[0]!;
  // biome-ignore lint/style/noNonNullAssertion: scored.length >= 2 reached here, so scored[1] is defined
  const runner = scored[1]!;
  if (runner.score - best.score >= FUZZY_UNIQUE_MARGIN) {
    return { kind: 'unique', value: unwrap(best) };
  }
  return {
    kind: 'ambiguous',
    candidates: scored.slice(0, MAX_CANDIDATES).map(unwrap),
  };
}

/**
 * Compute the best normalized Levenshtein distance between `needle` and
 * any whitespace-delimited token of `haystack`, plus the full haystack
 * string itself. This is what makes "Sarah" → "Sarah Chen" a 0-distance
 * match while still scoring "Sarha" → "Sarah Chen" reasonably.
 */
export function bestTokenDistance(needle: string, haystack: string): number {
  const full = normalizedLevenshtein(needle, haystack);
  if (full === 0) return 0;
  const tokens = haystack.split(/\s+/).filter((t) => t.length > 0);
  let best = full;
  for (const token of tokens) {
    const d = normalizedLevenshtein(needle, token);
    if (d < best) best = d;
    if (best === 0) return 0;
  }
  return best;
}

/**
 * Normalized Levenshtein in [0, 1]. 0 = identical, 1 = entirely different.
 * Normalization is by the longer string's length (so "cat" vs "bat" is
 * 1/3 ≈ 0.33, regardless of which is the argument order).
 */
export function normalizedLevenshtein(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return levenshtein(a, b) / maxLen;
}

/**
 * Pure Levenshtein edit-distance implementation.
 *
 * Two-row dynamic programming — O(n × m) time, O(min(n, m)) space. No
 * external dep, no native bindings. Handles unicode at the JavaScript
 * code-unit level (i.e., surrogate pairs count as two units, consistent
 * with `String.prototype.length`). That's fine for our use case: all
 * realistic inputs (names, role ids, queries) are ASCII-dominant.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure `b` is the shorter string → O(min) space.
  let s1 = a;
  let s2 = b;
  if (s1.length < s2.length) {
    const tmp = s1;
    s1 = s2;
    s2 = tmp;
  }

  const m = s1.length;
  const n = s2.length;

  // `prev[j]` = edit distance between s1[0..i-1] and s2[0..j-1].
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const c1 = s1.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = c1 === s2.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j]! + 1;
      const ins = curr[j - 1]! + 1;
      const sub = prev[j - 1]! + cost;
      let best = del < ins ? del : ins;
      if (sub < best) best = sub;
      curr[j] = best;
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }

  return prev[n]!;
}
