/**
 * System-agent bootstrap — ensures every company has exactly one
 * `system-agent` pseudo-employee. Called from two places:
 *
 *   1. First-run seed (`seed.ts::seedIfEmpty`) immediately after the
 *      Strategia-X company row is inserted.
 *   2. The `companies.create` IPC handler, so every new company the
 *      user spins up gets its own system-agent.
 *
 * The function is **idempotent** — it always queries first via
 * `findSystemByRoleId(companyId, 'system-agent')` and only inserts if
 * no row matches. This lets callers invoke it on every boot without
 * risk of duplicates, which means we can also call it in a "top-up"
 * loop during migrations if we ever add M31's primitives to companies
 * that predate this change.
 *
 * The role spec is read from the role-loader's index rather than
 * parsed directly off disk. That lets the spec benefit from the
 * same validation + caching the loader already provides, and keeps
 * the bootstrap decoupled from the role-packs filesystem layout.
 * The `system-agent.md` role card lives at
 * `role-packs/strategia-official/roles/system/system-agent.md` with
 * `level: system`, which the loader's `listRoles()` filters out but
 * `getSpec('system-agent')` still returns.
 *
 * Why separate from seed.ts:
 *
 *   `seedIfEmpty` is pure over the DB + a role-packs root. The system
 *   agent bootstrap needs access to the *shared* role-loader instance
 *   (for spec lookup + `roleMdSha` consistency across boots) and is
 *   called in multiple places with different owners (seed flow at
 *   boot, IPC handler on user action). Keeping it as a standalone
 *   service module mirrors the existing factory pattern
 *   (`ensure*` / `create*` functions) and matches the repo-level
 *   layering.
 */

import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type { Schema } from '../db/client.js';
import { createEmployeesRepo } from '../db/repos/employees.js';

/**
 * The canonical role id for the system-agent across every company. Any
 * company's `employees` table will have at most one row with
 * `is_system = 1 AND role_id = 'system-agent'`. Centralized here so the
 * agentic-loop-service, the bootstrap, and future tools share one symbol.
 */
export const SYSTEM_AGENT_ROLE_ID = 'system-agent';

/**
 * The role-pack id the system-agent ships under. Strategia-official is
 * currently the only pack; future multi-pack installs will still own a
 * single system-agent per company (invariant: one framework-internal
 * pseudo-employee per company, independent of user-facing pack choice).
 */
export const SYSTEM_AGENT_ROLE_PACK_ID = 'strategia-official';

/**
 * The visible display name of the system-agent. Appears as the "sender"
 * of every agentic-loop thread and is the `employees.name` column
 * value for the pseudo-employee row. Kept short, Strategia-branded, and
 * not localizable — this is a framework identity, not a user-facing
 * customization point.
 */
export const SYSTEM_AGENT_DISPLAY_NAME = 'Team-X Copilot';

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

export interface EnsureSystemAgentArgs<TRunResult> {
  db: BaseSQLiteDatabase<'sync', TRunResult, Schema>;
  companyId: string;
  roleLookup: BootstrapRoleLookup;
}

export interface EnsureSystemAgentResult {
  /** The employee id of the ensured system-agent. Stable across boots. */
  employeeId: string;
  /** `true` if a new row was inserted, `false` if the existing row was found. */
  created: boolean;
}

/**
 * Ensure a single `system-agent` pseudo-employee exists for the given
 * company. Returns the row's id either way.
 *
 * Throws if the role-loader does not have a `system-agent` spec in its
 * index — that indicates a packaging or loader-root wiring bug, not
 * a content bug, and the app must not silently run without a copilot.
 */
export function ensureSystemAgent<TRunResult>(
  args: EnsureSystemAgentArgs<TRunResult>,
): EnsureSystemAgentResult {
  const { db, companyId, roleLookup } = args;
  const employees = createEmployeesRepo(db);

  const existing = employees.findSystemByRoleId(companyId, SYSTEM_AGENT_ROLE_ID);
  if (existing) {
    return { employeeId: existing.id, created: false };
  }

  const spec = roleLookup.getSpec(SYSTEM_AGENT_ROLE_ID);
  if (!spec) {
    throw new Error(
      `[system-agent] role-loader returned no spec for id "${SYSTEM_AGENT_ROLE_ID}". Check that role-packs/strategia-official/roles/system/system-agent.md exists and that the role-packs root is configured correctly for this process.`,
    );
  }

  if (spec.frontmatter.level !== 'system') {
    throw new Error(
      `[system-agent] spec "${SYSTEM_AGENT_ROLE_ID}" has level "${spec.frontmatter.level}", expected "system". Refusing to seed a non-system role as a system-agent.`,
    );
  }

  const employeeId = employees.create({
    companyId,
    rolePackId: SYSTEM_AGENT_ROLE_PACK_ID,
    roleId: spec.frontmatter.id,
    roleMdSha: spec.sha256,
    level: spec.frontmatter.level,
    name: SYSTEM_AGENT_DISPLAY_NAME,
    title: spec.frontmatter.name,
    toolsAllowed: spec.frontmatter.tools_allowed ?? [],
    toolsDenied: spec.frontmatter.tools_denied ?? [],
    isSystem: true,
  });

  return { employeeId, created: true };
}
