/**
 * System pseudo-employee bootstrap — ensures every company has exactly
 * one `system-agent` pseudo-employee (M31) and exactly one
 * `system-copilot` pseudo-employee (M33). Called from two kinds of
 * places:
 *
 *   1. First-run seed (`seed.ts::seedIfEmpty`) immediately after a
 *      company row is inserted — seeds both system roles inline.
 *   2. The `companies.create` IPC handler (once implemented), so every
 *      new company the user spins up gets its own system pair.
 *
 * Both functions are **idempotent** — they always query first via
 * `findSystemByRoleId(companyId, <role-id>)` and only insert if no row
 * matches. This lets callers invoke them on every boot without risk of
 * duplicates, which means the same functions can be re-run in a
 * "top-up" loop during migrations if we ever introduce a new system
 * role to companies that predate it.
 *
 * The role spec is read from the role-loader's index rather than
 * parsed directly off disk. That lets the spec benefit from the
 * same validation + caching the loader already provides, and keeps
 * the bootstrap decoupled from the role-packs filesystem layout.
 * Both role cards live under `role-packs/strategia-official/roles/system/`
 * with `level: system`, which the loader's `listRoles()` filters out but
 * `getSpec('system-agent')` / `getSpec('system-copilot')` still return.
 *
 * Why separate from seed.ts:
 *
 *   `seedIfEmpty` is pure over the DB + a role-packs root. The system
 *   bootstrap needs access to the *shared* role-loader instance (for
 *   spec lookup + `roleMdSha` consistency across boots) and is called
 *   in multiple places with different owners (seed flow at boot, IPC
 *   handler on user action). Keeping it as a standalone service module
 *   mirrors the existing factory pattern (`ensure*` / `create*`
 *   functions) and matches the repo-level layering.
 *
 * Why both ensure functions share a module:
 *
 *   They are structurally identical — only the role id and display
 *   name differ. Co-locating them keeps the guard-rail checks
 *   (missing spec, wrong level) in one place so a future third system
 *   role inherits the same contract without a copy-paste. Consumers
 *   that need the full predicate-level abstraction use
 *   `isSystemRoleId` in `@team-x/shared-types` — this module is the
 *   low-level *writer*, that predicate is the *reader*.
 */

import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type { Schema } from '../db/client.js';
import { createEmployeesRepo } from '../db/repos/employees.js';

/**
 * The canonical role id for the system-agent across every company. Any
 * company's `employees` table will have at most one row with
 * `is_system = 1 AND role_id = 'system-agent'`. Centralized here so the
 * agentic-loop-service, the bootstrap, and future tools share one symbol.
 *
 * Mirrored as a local constant in `agentic-loop-service.ts` and as a
 * package-level export in `@team-x/shared-types/roles.ts` (`SYSTEM_AGENT_ROLE_ID`)
 * to avoid import cycles. All three values MUST match verbatim.
 */
export const SYSTEM_AGENT_ROLE_ID = 'system-agent';

/**
 * The canonical role id for the system-copilot across every company (M33).
 * Parallel to `SYSTEM_AGENT_ROLE_ID` — any company's `employees` table
 * has at most one row with `is_system = 1 AND role_id = 'system-copilot'`.
 * The copilot is the *proactive* analyzer half; the agent is the
 * *reactive* answerer half.
 *
 * Mirrored in `@team-x/shared-types/roles.ts` (`SYSTEM_COPILOT_ROLE_ID`).
 * Both values MUST match verbatim.
 */
export const SYSTEM_COPILOT_ROLE_ID = 'system-copilot';

/**
 * The role-pack id every system pseudo-employee ships under.
 * Strategia-official is currently the only pack; future multi-pack
 * installs will still own a single pair per company (invariant: one
 * `system-agent` + one `system-copilot` per company, independent of
 * user-facing pack choice).
 */
export const SYSTEM_AGENT_ROLE_PACK_ID = 'strategia-official';

/** Alias — the copilot ships under the same pack as the agent. */
export const SYSTEM_COPILOT_ROLE_PACK_ID = SYSTEM_AGENT_ROLE_PACK_ID;

/**
 * The visible display name of the system-agent. Appears as the "sender"
 * of every agentic-loop thread and is the `employees.name` column
 * value for the pseudo-employee row. Kept short, Strategia-branded, and
 * not localizable — this is a framework identity, not a user-facing
 * customization point.
 */
export const SYSTEM_AGENT_DISPLAY_NAME = 'Team-X Copilot';

/**
 * The visible display name of the system-copilot. Distinct from the
 * system-agent's display name so the sidenav's Copilot Conversations
 * section can show TWO labeled threads (reactive answerer vs proactive
 * analyzer) without ambiguity. The "(analyzer)" suffix keeps the
 * Strategia brand but signals the distinct role to a curious user
 * who expands the thread.
 */
export const SYSTEM_COPILOT_DISPLAY_NAME = 'Team-X Copilot (analyzer)';

/**
 * Narrow surface the bootstrap needs from the role-loader. Typed here
 * rather than importing the full `RoleLoader` interface so tests can
 * pass a hand-rolled double without wiring up a filesystem.
 */
export interface BootstrapRoleLookup {
  getSpec(roleId: string): {
    frontmatter: {
      id: string;
      name: string;
      level: string;
      tools_allowed?: string[];
      tools_denied?: string[];
    };
    sha256: string;
  } | null;
}

export interface EnsureSystemEmployeeArgs<TRunResult> {
  db: BaseSQLiteDatabase<'sync', TRunResult, Schema>;
  companyId: string;
  roleLookup: BootstrapRoleLookup;
}

/** @deprecated — legacy alias kept for M31 callers. Use `EnsureSystemEmployeeArgs`. */
export type EnsureSystemAgentArgs<TRunResult> = EnsureSystemEmployeeArgs<TRunResult>;

export interface EnsureSystemEmployeeResult {
  /** The employee id of the ensured system pseudo-employee. Stable across boots. */
  employeeId: string;
  /** `true` if a new row was inserted, `false` if the existing row was found. */
  created: boolean;
}

/** @deprecated — legacy alias kept for M31 callers. Use `EnsureSystemEmployeeResult`. */
export type EnsureSystemAgentResult = EnsureSystemEmployeeResult;

/**
 * Shared internal — idempotent upsert of a single `is_system = 1` row
 * for the given role id and display name. Both `ensureSystemAgent` and
 * `ensureSystemCopilot` delegate here. Keeping the guard-rail checks
 * (missing spec, wrong level) in one place means a future third system
 * role inherits the same contract without a copy-paste.
 *
 * The `logTag` argument scopes error messages so a packaging or
 * loader-root wiring bug points at the right role in operator logs.
 */
function ensureSystemEmployee<TRunResult>(
  args: EnsureSystemEmployeeArgs<TRunResult> & {
    roleId: string;
    displayName: string;
    logTag: string;
  },
): EnsureSystemEmployeeResult {
  const { db, companyId, roleLookup, roleId, displayName, logTag } = args;
  const employees = createEmployeesRepo(db);

  const existing = employees.findSystemByRoleId(companyId, roleId);
  if (existing) {
    return { employeeId: existing.id, created: false };
  }

  const spec = roleLookup.getSpec(roleId);
  if (!spec) {
    throw new Error(
      `[${logTag}] role-loader returned no spec for id "${roleId}". Check that role-packs/strategia-official/roles/system/${roleId}.md exists and that the role-packs root is configured correctly for this process.`,
    );
  }

  if (spec.frontmatter.level !== 'system') {
    throw new Error(
      `[${logTag}] spec "${roleId}" has level "${spec.frontmatter.level}", expected "system". Refusing to seed a non-system role as a ${logTag}.`,
    );
  }

  const employeeId = employees.create({
    companyId,
    rolePackId: SYSTEM_AGENT_ROLE_PACK_ID,
    roleId: spec.frontmatter.id,
    roleMdSha: spec.sha256,
    level: spec.frontmatter.level,
    name: displayName,
    title: spec.frontmatter.name,
    toolsAllowed: spec.frontmatter.tools_allowed ?? [],
    toolsDenied: spec.frontmatter.tools_denied ?? [],
    isSystem: true,
  });

  return { employeeId, created: true };
}

/**
 * Ensure a single `system-agent` pseudo-employee exists for the given
 * company (M31). Returns the row's id either way.
 *
 * Throws if the role-loader does not have a `system-agent` spec in its
 * index — that indicates a packaging or loader-root wiring bug, not
 * a content bug, and the app must not silently run without a copilot.
 */
export function ensureSystemAgent<TRunResult>(
  args: EnsureSystemEmployeeArgs<TRunResult>,
): EnsureSystemEmployeeResult {
  return ensureSystemEmployee({
    ...args,
    roleId: SYSTEM_AGENT_ROLE_ID,
    displayName: SYSTEM_AGENT_DISPLAY_NAME,
    logTag: 'system-agent',
  });
}

/**
 * Ensure a single `system-copilot` pseudo-employee exists for the given
 * company (M33). Parallel to `ensureSystemAgent` — same idempotency,
 * same guard rails, different role id + display name.
 *
 * The system-copilot owns the periodic analyzer's step-log thread and
 * the insights store. Seeded on first boot by `seed.ts::seedIfEmpty`
 * alongside the system-agent. A `companies.create` IPC handler, once
 * implemented, must call BOTH ensure functions.
 *
 * Throws if the role-loader does not have a `system-copilot` spec in
 * its index — same rationale as the agent path. Copilot analysis is
 * advisory but the surface (thread, insights store) is load-bearing;
 * silently skipping is worse than throwing.
 */
export function ensureSystemCopilot<TRunResult>(
  args: EnsureSystemEmployeeArgs<TRunResult>,
): EnsureSystemEmployeeResult {
  return ensureSystemEmployee({
    ...args,
    roleId: SYSTEM_COPILOT_ROLE_ID,
    displayName: SYSTEM_COPILOT_DISPLAY_NAME,
    logTag: 'system-copilot',
  });
}
