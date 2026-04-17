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
 *
 * -------------------------------------------------------------------
 * M35 T1 — Performance defaults pass + clamp audit (2026-04-19)
 * -------------------------------------------------------------------
 * Measurement rig: local Ollama (127.0.0.1:11434) + `llama3.1:8b`
 * (Q4_K_M, 4.9 GB) against an analyzer-shaped prompt built from a
 * realistic Strategia-X event window (50 ticket.comment + 10
 * project.updated + 2 goal.progressChanged + 5 vault.fileAdded =
 * 67 bounded events, truncated to the 2000-char
 * `MAX_EVENT_SUMMARY_CHARS` cap in `copilot-analyzer-service.ts`).
 *
 * Wall-clock evidence (Windows 11, Node 24.14.1, single Ollama
 * instance warm loaded):
 *   - cold      : 208563 ms  (one-time model-load penalty)
 *   - warm #1   :  66847 ms
 *   - warm #2   :  65872 ms
 *   - prompt    :  2288 chars → 734 prompt_eval tokens
 *   - response  :  ~200 eval tokens, well-formed JSON array
 *
 * Decision (evidence-based): all 10 Phase 5 settings clamps
 * documented in the M35 plan doc §4.2 held at their current
 * defaults — the measurement JUSTIFIES holding, not moving:
 *
 *   | Clamp                         | Default | Evidence                                         |
 *   |-------------------------------|---------|--------------------------------------------------|
 *   | rag_chunk_size  (chunker)     | 512 tok | Standard M28 baseline, not stressed this tick    |
 *   | rag_chunk_overlap             |  64 tok | Standard 12.5% overlap, retrieval-layer          |
 *   | rag_threshold                 |  0.70   | Retrieval-layer precision, not latency-bound     |
 *   | agentic_max_steps             |     8   | CLAUDE.md documents 12/16 bump for 7-8B models   |
 *   | agentic_max_tokens            |  8000   | ~200 tok/call × 8 steps = 1600 (4× headroom)     |
 *   | agentic_timeout_ms            | 120000  | 66s warm tick well under 120s (0.55× utilisation)|
 *   | planner_max_tickets           |    10   | Governance cap, not latency-bound                |
 *   | planner_max_depth             |     2   | Governance cap, not latency-bound                |
 *   | planner_escalation_threshold  |     3   | Governance cap, not latency-bound                |
 *   | copilot_interval_minutes      |   5 min | 300s cadence vs 66s tick = 4.5× headroom         |
 *
 * Zero silent tuning. The clamp ENVELOPES are also unchanged —
 * `AGENTIC_SETTINGS_CLAMPS`, `PLANNER_SETTINGS_CLAMPS`, and
 * `COPILOT_SETTINGS_CLAMPS` (all in `@team-x/shared-types`) keep
 * their Phase 5 M31/M32/M33 ranges. Any future adjustment must
 * cite a fresh measurement in this block.
 *
 * Regression guard: `settings.test.ts` / `settings-planner.test.ts`
 * / `settings-copilot.test.ts` pin every default listed above;
 * `copilot-analyzer-service.test.ts` pins the
 * `restart(companyId)` side effect that the
 * `copilot_interval_minutes` default rides on.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseRoleMarkdown } from '@team-x/role-schema';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import {
  SYSTEM_AGENT_DISPLAY_NAME,
  SYSTEM_AGENT_ROLE_ID,
  SYSTEM_AGENT_ROLE_PACK_ID,
  SYSTEM_COPILOT_DISPLAY_NAME,
  SYSTEM_COPILOT_ROLE_ID,
  SYSTEM_COPILOT_ROLE_PACK_ID,
} from '../services/system-agent-bootstrap.js';
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
  /**
   * Id of the framework-internal `system-agent` pseudo-employee seeded
   * for this company. Always present on a fresh seed — the agentic loop
   * depends on this row. Hidden from the employees.list IPC and org
   * chart via the `is_system` column (migration 0010).
   */
  systemAgentId: string;
  /**
   * Id of the framework-internal `system-copilot` pseudo-employee seeded
   * for this company (M33). Always present on a fresh seed — the copilot
   * analyzer service depends on this row for its periodic-tick thread
   * membership and insight attribution. Same visibility posture as the
   * system-agent: hidden from every human-facing employee surface via
   * `is_system = 1`.
   */
  systemCopilotId: string;
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

  // Seed the framework-internal `system-agent` pseudo-employee. Every
  // company has exactly one; it owns the agentic-loop thread history
  // and is hidden from the user-facing employee list + org chart via
  // `is_system = 1` (migration 0010, filtered by
  // `listVisibleByCompany`). Path is hardcoded rather than looked up
  // via `roleLookup` so `seedIfEmpty` stays self-contained and
  // unit-testable without a role-loader instance.
  const systemAgentPath = join(options.rolePacksRoot, 'system', 'system-agent.md');
  const systemAgentSrc = readFileSync(systemAgentPath, 'utf8');
  const systemAgentSpec = parseRoleMarkdown(systemAgentSrc, systemAgentPath);
  if (systemAgentSpec.frontmatter.id !== SYSTEM_AGENT_ROLE_ID) {
    throw new Error(
      `[seed] system-agent role.md has id "${systemAgentSpec.frontmatter.id}", ` +
        `expected "${SYSTEM_AGENT_ROLE_ID}"`,
    );
  }
  const systemAgentId = employees.create({
    companyId,
    rolePackId: SYSTEM_AGENT_ROLE_PACK_ID,
    roleId: systemAgentSpec.frontmatter.id,
    roleMdSha: systemAgentSpec.sha256,
    level: systemAgentSpec.frontmatter.level,
    name: SYSTEM_AGENT_DISPLAY_NAME,
    title: systemAgentSpec.frontmatter.name,
    toolsAllowed: systemAgentSpec.frontmatter.tools_allowed ?? [],
    toolsDenied: systemAgentSpec.frontmatter.tools_denied ?? [],
    isSystem: true,
  });

  // Seed the framework-internal `system-copilot` pseudo-employee (M33).
  // Parallel to `system-agent` — same visibility posture (hidden from
  // `listVisibleByCompany` via `is_system = 1`), distinct role id and
  // display name. The copilot analyzer service owns this row; the
  // insights store + periodic-tick thread are attributed to it. Path
  // is hardcoded to the same `system/` subdirectory so `seedIfEmpty`
  // stays self-contained and unit-testable without a role-loader
  // instance — mirrors the system-agent pattern above.
  const systemCopilotPath = join(options.rolePacksRoot, 'system', 'system-copilot.md');
  const systemCopilotSrc = readFileSync(systemCopilotPath, 'utf8');
  const systemCopilotSpec = parseRoleMarkdown(systemCopilotSrc, systemCopilotPath);
  if (systemCopilotSpec.frontmatter.id !== SYSTEM_COPILOT_ROLE_ID) {
    throw new Error(
      `[seed] system-copilot role.md has id "${systemCopilotSpec.frontmatter.id}", ` +
        `expected "${SYSTEM_COPILOT_ROLE_ID}"`,
    );
  }
  const systemCopilotId = employees.create({
    companyId,
    rolePackId: SYSTEM_COPILOT_ROLE_PACK_ID,
    roleId: systemCopilotSpec.frontmatter.id,
    roleMdSha: systemCopilotSpec.sha256,
    level: systemCopilotSpec.frontmatter.level,
    name: SYSTEM_COPILOT_DISPLAY_NAME,
    title: systemCopilotSpec.frontmatter.name,
    toolsAllowed: systemCopilotSpec.frontmatter.tools_allowed ?? [],
    toolsDenied: systemCopilotSpec.frontmatter.tools_denied ?? [],
    isSystem: true,
  });

  return { companyId, employeeIds, systemAgentId, systemCopilotId };
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
      `[seed] created company ${result.companyId} + ${result.employeeIds.length} employees ` +
        `+ system-agent ${result.systemAgentId} + system-copilot ${result.systemCopilotId}`,
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
