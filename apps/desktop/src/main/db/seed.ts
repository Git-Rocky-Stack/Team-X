/**
 * First-boot seed — creates the hardcoded Phase 1 company + two
 * employees (CEO and Senior Fullstack Engineer) so the skeleton demo
 * has something to show when it opens for the first time.
 *
 * Split into two layers:
 *
 * 1. `seedIfEmpty(db, options)` — PURE. Accepts any database satisfying
 *    `BaseSQLiteDatabase<'sync', TRunResult, Schema>`, reads role.md
 *    files from an injected `rolePacksRoot` path, creates the company
 *    and employees via the repo factories. Idempotent: returns `null`
 *    if the database already has at least one company. Unit-testable
 *    under Vitest with sql.js + the real role packs directory resolved
 *    via `import.meta.url`.
 *
 * 2. `seed()` — THIN RUNTIME WIRING. Calls `getDb()`, computes the
 *    default rolePacksRoot from `__dirname`, delegates to `seedIfEmpty`
 *    with the Phase 1 company metadata + role assignments hardcoded.
 *    Not directly unit-tested — integration-verified via `pnpm dev`.
 *
 * The runtime path assumes the compiled main process runs from
 * `apps/desktop/out/main/index.js` — four parents to the repo root,
 * then `role-packs/strategia-official/roles`. Production packaging
 * (Task 49+) will ship role packs via electron-builder extraResources;
 * the `isPackaged` branch in `seed()` is a placeholder so dev and prod
 * code paths stay symmetric.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseRoleMarkdown } from '@team-x/role-schema';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type { Schema } from './client.js';
import { getDb } from './client.js';
import { createCompaniesRepo } from './repos/companies.js';
import { createEmployeesRepo } from './repos/employees.js';

export interface SeedAssignment {
  /** Path relative to `rolePacksRoot`, e.g. `officer/ceo.md`. */
  roleFile: string;
  displayName: string;
  displayTitle: string;
}

export interface SeedOptions {
  rolePacksRoot: string;
  company: {
    name: string;
    slug: string;
    settings?: Record<string, unknown>;
  };
  assignments: SeedAssignment[];
}

export interface SeedResult {
  companyId: string;
  employeeIds: string[];
}

type SeedDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

/**
 * Create the seeded company + employees if the database has none yet.
 * Returns the new ids on a fresh seed, or `null` if a company already
 * exists (idempotent — safe to call on every boot).
 */
export function seedIfEmpty<TRunResult>(
  db: SeedDb<TRunResult>,
  options: SeedOptions,
): SeedResult | null {
  const companies = createCompaniesRepo(db);
  if (companies.list().length > 0) {
    return null;
  }

  const companyId = companies.create({
    name: options.company.name,
    slug: options.company.slug,
    settings: options.company.settings,
  });

  const employees = createEmployeesRepo(db);
  const employeeIds: string[] = [];

  for (const assignment of options.assignments) {
    const absPath = join(options.rolePacksRoot, assignment.roleFile);
    const src = readFileSync(absPath, 'utf8');
    const spec = parseRoleMarkdown(src, absPath);

    const employeeId = employees.create({
      companyId,
      rolePackId: 'strategia-official',
      roleId: spec.frontmatter.id,
      roleMdSha: spec.sha256,
      level: spec.frontmatter.level,
      name: assignment.displayName,
      title: assignment.displayTitle,
      toolsAllowed: spec.frontmatter.tools_allowed ?? [],
      toolsDenied: spec.frontmatter.tools_denied ?? [],
    });
    employeeIds.push(employeeId);
  }

  return { companyId, employeeIds };
}

/**
 * Runtime wrapper — calls seedIfEmpty with the Phase 1 defaults.
 * Wired into main/index.ts just after runMigrations.
 */
export function seed(rolePacksRoot?: string): SeedResult | null {
  const db = getDb();
  const root = rolePacksRoot ?? defaultRolePacksRoot();
  const result = seedIfEmpty(db, {
    rolePacksRoot: root,
    company: {
      name: 'Strategia-X',
      slug: 'strategia-x',
      settings: {
        mission: 'Arm every builder with an AI company that runs itself.',
        values: ['Quality', 'Privacy', 'Speed', 'Ownership'],
      },
    },
    assignments: [
      {
        roleFile: 'officer/ceo.md',
        displayName: 'Iris Kovač',
        displayTitle: 'Chief Executive Officer',
      },
      {
        roleFile: 'ic/senior-fullstack-engineer.md',
        displayName: 'Mateo Reyes',
        displayTitle: 'Senior Fullstack Engineer',
      },
    ],
  });

  if (result) {
    console.log(
      `[seed] created company ${result.companyId} + ${result.employeeIds.length} employees`,
    );
  }
  return result;
}

/**
 * Resolve the role packs directory relative to the compiled main bundle.
 * In dev, the compiled main lives at `apps/desktop/out/main/index.js`;
 * four parents up is the repo root, then `role-packs/strategia-official/roles`.
 * Production wiring via electron-builder extraResources lands in Task 49.
 */
function defaultRolePacksRoot(): string {
  return join(__dirname, '../../../../role-packs/strategia-official/roles');
}
