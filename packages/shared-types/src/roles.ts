export type RoleLevel =
  | 'officer'
  | 'senior_management'
  | 'management'
  | 'supervisor'
  | 'lead'
  | 'ic'
  // `system` is reserved for framework-internal pseudo-employees that are
  // never hired via UI. One `system-agent` per company owns the agentic-loop
  // thread history. Filtered out of `RoleLoader.listRoles()` so it never
  // surfaces in the hire dialog or NLU entity resolver, but reachable via
  // `getSpec()` so `resolveSystemPrompt` and the system-agent bootstrap work.
  | 'system';

export type ModelTier = 'high' | 'mid' | 'low';

export type DecisionAuthority = 'final' | 'delegated' | 'advisory';

export interface RoleCadence {
  type: string;
  every: string;
  time: string;
}

export interface RoleFrontmatter {
  id: string;
  name: string;
  level: RoleLevel;
  reports_to: string[];
  manages: string[];
  preferred_model_tier: ModelTier;
  preferred_providers: string[];
  fallback_providers: string[];
  preferred_context_window?: number;
  tools_allowed: string[];
  tools_denied: string[];
  decision_authority: DecisionAuthority;
  escalates_to: string[];
  kpis: string[];
  cadences?: RoleCadence[];
  output_format?: string;
  temperature: number;
  license: string;
  author: string;
  version: string;
}

export interface RoleSpec {
  frontmatter: RoleFrontmatter;
  body: string;
  sourcePath: string;
  sha256: string;
}

// ---------------------------------------------------------------------------
// System pseudo-employee role ids
// ---------------------------------------------------------------------------

/**
 * Canonical role id for the framework-internal **agentic-loop** copilot —
 * the `complex_request` answerer seeded once per company (M31). Hidden
 * from every human-facing employee surface (hire dialog, org chart,
 * delegation picker, meeting-attendee picker).
 *
 * Duplicated as a local `const` in main-process modules that cannot
 * import this package to avoid cycles (`agentic-loop-service.ts` and
 * `system-agent-bootstrap.ts`). Every such duplicate MUST match this
 * value verbatim — it is the SQL key in the per-company idempotency
 * lookup (`employees.findSystemByRoleId`).
 */
export const SYSTEM_AGENT_ROLE_ID = 'system-agent';

/**
 * Canonical role id for the framework-internal **copilot analyzer** —
 * the periodic-scheduler insights generator seeded once per company
 * alongside `system-agent` (M33). Same visibility rules: hidden from
 * every human-facing employee surface, reachable only via the
 * `is_system = 1` lane.
 */
export const SYSTEM_COPILOT_ROLE_ID = 'system-copilot';

/**
 * Every framework-internal system pseudo-employee role id in one tuple.
 * Exported so consumers that need an exhaustive list (test seams,
 * filter sweeps, role-loader gate) can iterate without reaching for
 * the individual constants. Adding a third system role requires a
 * single touch here plus the corresponding `ensure*` bootstrap — the
 * `isSystemRoleId` predicate below auto-updates.
 */
export const SYSTEM_ROLE_IDS = [SYSTEM_AGENT_ROLE_ID, SYSTEM_COPILOT_ROLE_ID] as const;

/**
 * Predicate — `true` when a given role id names a framework-internal
 * system pseudo-employee (`system-agent`, `system-copilot`, or any
 * future addition to `SYSTEM_ROLE_IDS`). Prefer this over point-checks
 * on the individual constants so the filter sweep extends to new
 * system roles without a code search.
 *
 * Not a replacement for the `is_system` database column — that column
 * is the authoritative filter at query time (`listVisibleByCompany`).
 * This predicate is for the small number of code paths that point-check
 * by role id (role-loader gate, hire IPC reject, future UI label
 * distinguishers) where the DB column is not yet in scope.
 */
export function isSystemRoleId(roleId: string): boolean {
  return (SYSTEM_ROLE_IDS as readonly string[]).includes(roleId);
}
