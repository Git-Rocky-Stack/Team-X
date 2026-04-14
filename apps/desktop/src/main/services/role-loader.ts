/**
 * Role loader — implements the orchestrator's `ResolveSystemPrompt`
 * contract by reading `role.md` files from disk, parsing their YAML
 * frontmatter via `@team-x/role-schema`, and rendering the body with
 * the company-aware template variable substitution.
 *
 * This is the second of the two resolver factories that
 * `buildOrchestrator` injects (the first is the `provider-factory`
 * from T32). Together they let the orchestrator stay free of any
 * filesystem or LLM-SDK dependencies — every per-turn lookup happens
 * inside one of these injected callbacks, which keeps `runAgent`
 * trivially testable with fake providers + a static system prompt.
 *
 * Why a directory scan rather than a path lookup:
 *
 *   The `employees` table stores `rolePackId` + `roleId`, both of which
 *   come from a role.md's YAML frontmatter (`spec.frontmatter.id`).
 *   The on-disk filename is independent — `chief-executive-officer`
 *   lives in `officer/ceo.md`, not `officer/chief-executive-officer.md`.
 *   So we cannot derive a file path from the DB row alone. The Phase 1
 *   solution is to scan `rolePacksRoot` once on first resolve, parse
 *   every `.md` file, and build an in-memory index keyed by
 *   `frontmatter.id`. Subsequent resolves are an O(1) Map lookup +
 *   one render-pass. The scan is also cheap (Phase 1 has two roles,
 *   Phase 2 will have ~55) so doing it lazily on-demand keeps startup
 *   fast and lets unit tests construct the loader against fixtures
 *   without paying for any I/O until they actually call resolve.
 *
 *   Phase 2's role-pack loader (with override support, signature
 *   verification, multi-pack support) will replace this with a
 *   richer index that doesn't need a directory walk — but the
 *   public surface (`resolveSystemPrompt`) is intentionally narrow
 *   so swapping the implementation is a single-file change.
 *
 * Why parse failures are non-fatal:
 *
 *   A user dropping a notes file or a README into the role-packs tree
 *   should not break the entire app. The walker logs and skips files
 *   that don't pass `parseRoleMarkdown`, then surfaces the missing-id
 *   case as a clear error from `resolveSystemPrompt` itself rather
 *   than at startup time. This keeps the failure mode local to the
 *   employee whose role.md is broken — every other employee's chat
 *   stays functional.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { type RenderContext, parseRoleMarkdown, renderRoleBody } from '@team-x/role-schema';
import type { RoleSpec } from '@team-x/shared-types';

import type { CompanyRow } from '../db/repos/companies.js';
import type { EmployeeRow } from '../db/repos/employees.js';

export interface RoleLoaderDeps {
  /**
   * Absolute path to a roles directory containing one or more role.md
   * files (recursively). For the Phase 1 strategia-official pack this
   * is `<repo>/role-packs/strategia-official/roles`. The factory does
   * NOT validate the path until the first `resolveSystemPrompt` call,
   * so tests can construct the loader against a fixture without paying
   * for a stat() at construction time.
   */
  rolePacksRoot: string;

  /**
   * Optional override for the `today` template variable. Tests inject
   * a fixed string for deterministic snapshots; production omits this
   * and the loader stamps `new Date().toISOString().slice(0, 10)` on
   * each resolve.
   */
  today?: string;

  /**
   * Optional override for the `cwd` template variable. Currently
   * unused by Phase 1 role.md bodies but accepted here so tests can
   * set it explicitly when verifying that the renderer wires every
   * `RenderContext` field.
   */
  cwd?: string;

  /**
   * Optional log sink for parse errors encountered during the lazy
   * directory scan. Defaults to `console.warn`. Injectable so tests
   * can assert on the warning behaviour without polluting stdout.
   */
  onParseError?: (filePath: string, error: Error) => void;
}

export interface RoleLoader {
  /**
   * Resolve a fully-rendered system prompt for the given employee.
   * Walks the role-packs tree on first call, then performs an
   * O(1) lookup + one `renderRoleBody` pass per subsequent call.
   *
   * Throws if the employee's `roleId` does not match any parsed role
   * in the index. The error message includes the employee id so the
   * orchestrator can correlate it with the failing chat turn.
   */
  resolveSystemPrompt(args: {
    employee: EmployeeRow;
    company: CompanyRow;
  }): Promise<string>;

  /**
   * Force the directory scan to run synchronously now rather than
   * lazily on the next `resolveSystemPrompt`. Useful for the main
   * process boot path so the cost is paid once before the first chat,
   * and for tests that want to assert "no errors during indexing"
   * separately from "the right prompt for this employee".
   */
  preload(): void;

  /**
   * Return the number of roles currently in the index. Returns `0`
   * before the first scan. Test affordance + diagnostic surface.
   */
  size(): number;

  /**
   * Look up a parsed `RoleSpec` by its frontmatter `id`. Returns
   * `null` if the role is not in the index. Triggers the lazy
   * directory scan on first call, same as `resolveSystemPrompt`.
   *
   * Used by the IPC hire handler (T43) to fill in `roleMdSha`,
   * `level`, `title`, and `tools_allowed/denied` when creating a
   * new employee — the renderer only sends `roleId` + `name`.
   */
  getSpec(roleId: string): RoleSpec | null;

  /**
   * Return every parsed `RoleSpec` currently in the index. Used by
   * the M30 NLU entity resolver to fuzzy-match role queries ("senior
   * backend engineer") against the full catalog. Snapshot-copies the
   * underlying `Map.values()` so callers can safely mutate or filter
   * without perturbing the loader's own index.
   */
  listRoles(): RoleSpec[];
}

interface CompanySettings {
  mission?: string;
  values?: string[];
}

/**
 * Defensively parse the `companies.settings_json` text column.
 * The repo stores arbitrary JSON; we only need `mission` + `values`
 * here, and a corrupted blob must NOT crash the loader — fall back
 * to an empty object so the renderer fills `company.mission` with
 * an empty string and the body's `{{company.mission}}` substitutions
 * become empty strings rather than throwing.
 */
function parseCompanySettings(json: string): CompanySettings {
  try {
    const parsed = JSON.parse(json) as CompanySettings;
    if (parsed && typeof parsed === 'object') return parsed;
    return {};
  } catch {
    return {};
  }
}

/**
 * Format `today` as a stable ISO date string (`YYYY-MM-DD`). Stripped
 * to ten chars so role.md bodies referencing `{{today}}` get a date
 * with no time component — the time is irrelevant to the prompt and
 * makes snapshot tests flaky.
 */
function isoDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function createRoleLoader(deps: RoleLoaderDeps): RoleLoader {
  const index = new Map<string, RoleSpec>();
  let scanned = false;

  const onParseError =
    deps.onParseError ??
    ((filePath: string, error: Error) => {
      console.warn(`[role-loader] skipped ${filePath}: ${error.message}`);
    });

  /**
   * Recursively walk a directory looking for `.md` files. Each one is
   * read + parsed; valid roles are added to the index keyed by
   * `frontmatter.id`. Parse failures are reported via `onParseError`
   * and skipped — see the file header for the rationale.
   *
   * Walks via the synchronous `readdirSync` / `statSync` pair on
   * purpose: the loader runs once at startup (or on first resolve)
   * and the role tree is small (Phase 1: 2 files, Phase 2: ~55).
   * Async walking would buy us nothing here and would complicate the
   * caller surface (`resolveSystemPrompt` is already async).
   */
  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch (err) {
      // Surface a missing rolePacksRoot loudly — this is a wiring bug,
      // not a content bug, and the orchestrator must not silently
      // serve every employee an empty prompt.
      throw new Error(
        `[role-loader] cannot read role-packs root "${dir}": ${(err as Error).message}`,
      );
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(full);
      } catch {
        // A symlink with a missing target or a file deleted mid-walk —
        // skip rather than crash the entire scan.
        continue;
      }
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      if (!stat.isFile() || !entry.endsWith('.md')) continue;

      let source: string;
      try {
        source = readFileSync(full, 'utf8');
      } catch (err) {
        onParseError(full, err as Error);
        continue;
      }

      try {
        const spec = parseRoleMarkdown(source, full);
        index.set(spec.frontmatter.id, spec);
      } catch (err) {
        onParseError(full, err as Error);
      }
    }
  }

  function ensureScanned(): void {
    if (scanned) return;
    walk(deps.rolePacksRoot);
    scanned = true;
  }

  return {
    preload(): void {
      ensureScanned();
    },

    size(): number {
      return index.size;
    },

    getSpec(roleId: string): RoleSpec | null {
      ensureScanned();
      return index.get(roleId) ?? null;
    },

    listRoles(): RoleSpec[] {
      ensureScanned();
      return Array.from(index.values());
    },

    async resolveSystemPrompt({ employee, company }): Promise<string> {
      ensureScanned();
      const spec = index.get(employee.roleId);
      if (!spec) {
        throw new Error(
          `[role-loader] no role found for id "${employee.roleId}" ` +
            `(employee=${employee.id}, rolePack=${employee.rolePackId})`,
        );
      }

      const settings = parseCompanySettings(company.settingsJson);
      const ctx: RenderContext = {
        company: {
          name: company.name,
          mission: settings.mission ?? '',
          values: settings.values ?? [],
        },
        employee: {
          name: employee.name,
          title: employee.title,
        },
        // Phase 1 has no team-graph wiring yet — every employee renders
        // with empty manager + reports. Phase 2's org-chart editor will
        // populate these from the employees table's `reports_to` /
        // `manages` joins.
        team: {
          manager: '',
          reports: [],
        },
        today: deps.today ?? isoDate(new Date()),
        cwd: deps.cwd ?? '',
      };

      return renderRoleBody(spec.body, ctx);
    },
  };
}
