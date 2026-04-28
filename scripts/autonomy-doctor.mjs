#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);

let Database;
let databaseLoadError = null;
try {
  Database = require('../apps/desktop/node_modules/better-sqlite3');
} catch (error) {
  databaseLoadError = error;
}

const REQUIRED_TABLES = [
  'companies',
  'employees',
  'runtime_profiles',
  'employee_runtime_bindings',
  'runtime_sessions',
  'runtime_heartbeats',
  'ticket_checkouts',
  'budget_policies',
  'budget_ledger_entries',
  'approval_items',
  'artifacts',
  'mcp_servers',
  'providers',
];
const SENSITIVE_KEY_PATTERN = /(?:api[_-]?key|token|secret|password)$/i;
const BACKUP_WARNING_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const BACKUP_BLOCKED_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function parseArgs(argv) {
  const parsed = {
    db: process.env.TEAM_X_DB ?? null,
    company: process.env.TEAM_X_COMPANY_ID ?? null,
    backups: process.env.TEAM_X_BACKUPS_DIR ?? null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--db' && next) {
      parsed.db = next;
      index += 1;
    } else if (arg === '--company' && next) {
      parsed.company = next;
      index += 1;
    } else if (arg === '--backups' && next) {
      parsed.backups = next;
      index += 1;
    }
  }
  return parsed;
}

function defaultDbPath() {
  const windowsAppData =
    process.env.APPDATA ??
    (process.platform === 'win32' && process.env.USERPROFILE
      ? join(process.env.USERPROFILE, 'AppData', 'Roaming')
      : null);
  if (windowsAppData) {
    const candidates = [
      join(windowsAppData, 'Team-X', 'team-x', 'team-x.sqlite'),
      join(windowsAppData, '@team-x', 'desktop', 'team-x', 'team-x.sqlite'),
      join(windowsAppData, 'Electron', 'team-x', 'team-x.sqlite'),
    ];
    return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
  }
  return join(process.env.HOME ?? process.cwd(), '.config', 'Team-X', 'team-x', 'team-x.sqlite');
}

function statusFromFindings(findings) {
  if (findings.some((finding) => finding.severity === 'blocked')) return 'blocked';
  if (findings.some((finding) => finding.severity === 'warning')) return 'warning';
  return 'ok';
}

function worstStatus(a, b) {
  if (a === 'blocked' || b === 'blocked') return 'blocked';
  if (a === 'warning' || b === 'warning') return 'warning';
  return 'ok';
}

function finding({ id, severity, title, detail, action = null, refs = [] }) {
  return { id, severity, title, detail, action, refs };
}

function check({ id, label, checkedAt, summary, findings = [] }) {
  return {
    id,
    label,
    status: statusFromFindings(findings),
    summary,
    checkedAt,
    findings,
  };
}

function parseJson(raw, fallback = {}) {
  try {
    const parsed = JSON.parse(raw ?? '');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function isSecretRef(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value.type === 'secret_ref' &&
    typeof value.providerId === 'string' &&
    typeof value.key === 'string'
  );
}

function collectInlineSecrets(value, path = 'config') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const hits = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (SENSITIVE_KEY_PATTERN.test(key) && !isSecretRef(child)) {
      hits.push({ path: childPath, key });
      continue;
    }
    hits.push(...collectInlineSecrets(child, childPath));
  }
  return hits;
}

function collectSecretRefs(value, path = 'config') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const hits = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (isSecretRef(child)) {
      hits.push({ path: childPath, ref: child });
      continue;
    }
    hits.push(...collectSecretRefs(child, childPath));
  }
  return hits;
}

function daysText(ms) {
  return `${Math.floor(ms / (24 * 60 * 60 * 1000))}d`;
}

function listBackups(backupsDir) {
  if (!existsSync(backupsDir)) return [];
  return readdirSync(backupsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('backup-'))
    .map((entry) => {
      const backupPath = join(backupsDir, entry.name);
      let manifest = null;
      try {
        manifest = JSON.parse(readFileSync(join(backupPath, 'manifest.json'), 'utf8'));
      } catch {
        manifest = null;
      }
      return {
        filename: entry.name,
        path: backupPath,
        createdAt: manifest?.createdAt ?? statSync(backupPath).mtime.toISOString(),
        manifest,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function rowCount(db, sql, params = []) {
  return db.prepare(sql).all(params);
}

function createSqlJsAdapter(sqlJsDb) {
  return {
    close() {
      sqlJsDb.close();
    },
    pragma(statement) {
      const rows = sqlJsDb.exec(`pragma ${statement}`);
      if (rows.length === 0) return [];
      const [result] = rows;
      return result.values.map((values) =>
        Object.fromEntries(result.columns.map((column, index) => [column, values[index]])),
      );
    },
    prepare(sql) {
      return {
        all(params = []) {
          const statement = sqlJsDb.prepare(sql);
          try {
            statement.bind(params);
            const rows = [];
            while (statement.step()) {
              rows.push(statement.getAsObject());
            }
            return rows;
          } finally {
            statement.free();
          }
        },
        get(...params) {
          const statement = sqlJsDb.prepare(sql);
          const boundParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          try {
            statement.bind(boundParams);
            return statement.step() ? statement.getAsObject() : undefined;
          } finally {
            statement.free();
          }
        },
      };
    },
  };
}

async function openDatabase(dbPath) {
  if (Database) {
    try {
      return {
        db: new Database(dbPath, { readonly: true, fileMustExist: true }),
        engine: 'better-sqlite3',
      };
    } catch (error) {
      databaseLoadError = error;
    }
  }

  try {
    const sqlJsFactory = require('../apps/desktop/node_modules/sql.js');
    const initSqlJs = sqlJsFactory.default ?? sqlJsFactory;
    const wasmPath = require.resolve('../apps/desktop/node_modules/sql.js/dist/sql-wasm.wasm');
    const SQL = await initSqlJs({ locateFile: () => wasmPath });
    const sqlJsDb = new SQL.Database(readFileSync(dbPath));
    return { db: createSqlJsAdapter(sqlJsDb), engine: 'sql.js' };
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          status: 'blocked',
          error:
            'No compatible SQLite reader is available. Rebuild better-sqlite3 for this Node version or install sql.js.',
          betterSqliteDetail:
            databaseLoadError instanceof Error
              ? databaseLoadError.message
              : String(databaseLoadError),
          sqlJsDetail: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = resolve(args.db ?? defaultDbPath());
  const backupsDir = resolve(args.backups ?? join(dirname(dirname(dbPath)), 'backups'));
  const generatedAt = Date.now();

  if (!existsSync(dbPath)) {
    console.error(
      JSON.stringify(
        {
          status: 'blocked',
          error: 'Team-X database file was not found.',
          dbPath,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const { db, engine } = await openDatabase(dbPath);
  try {
    db.pragma('foreign_keys = ON');
    const hasTable = (table) =>
      Boolean(
        db.prepare("select name from sqlite_master where type = 'table' and name = ?").get(table),
      );
    const companyId =
      args.company ??
      (hasTable('companies')
        ? (db
            .prepare(
              "select id from companies where status != 'archived' order by created_at limit 1",
            )
            .get()?.id ??
          db.prepare('select id from companies order by created_at limit 1').get()?.id)
        : null) ??
      'unknown';

    const checks = [];
    const quickCheckRows = db.pragma('quick_check');
    const quickCheck = quickCheckRows.map((row) => String(Object.values(row)[0] ?? '')).join('; ');
    checks.push(
      check({
        id: 'db-integrity',
        label: 'DB Integrity',
        checkedAt: generatedAt,
        summary:
          quickCheck.toLowerCase() === 'ok'
            ? 'SQLite quick-check returned ok.'
            : 'SQLite quick-check reported an issue.',
        findings:
          quickCheck.toLowerCase() === 'ok'
            ? []
            : [
                finding({
                  id: 'db-integrity.quick-check',
                  severity: 'blocked',
                  title: 'SQLite quick-check failed',
                  detail: quickCheck,
                  action:
                    'Create a backup, stop the app, and inspect the SQLite file before launching more autonomous work.',
                }),
              ],
      }),
    );

    const missingTables = REQUIRED_TABLES.filter((table) => !hasTable(table));
    checks.push(
      check({
        id: 'migrations',
        label: 'Migrations',
        checkedAt: generatedAt,
        summary:
          missingTables.length === 0
            ? `${REQUIRED_TABLES.length} required control-plane tables are present.`
            : `${missingTables.length} required control-plane table(s) are missing.`,
        findings: missingTables.map((table) =>
          finding({
            id: `migrations.${table}`,
            severity: 'blocked',
            title: `Missing table: ${table}`,
            detail: `Autonomous runtime mechanics require the ${table} table.`,
            action: 'Run the migration bootstrap before using external runtimes in this workspace.',
          }),
        ),
      }),
    );

    const backups = listBackups(backupsDir);
    const latest = backups[0] ?? null;
    const age = latest ? Math.max(0, generatedAt - Date.parse(latest.createdAt)) : null;
    const backupFindings = [];
    if (!latest) {
      backupFindings.push(
        finding({
          id: 'backup-posture.none',
          severity: 'warning',
          title: 'No backup exists',
          detail: 'No local Team-X backup directories were found.',
          action: 'Create a backup before running unattended external agents.',
          refs: [backupsDir],
        }),
      );
    } else {
      if (!latest.manifest) {
        backupFindings.push(
          finding({
            id: 'backup-posture.manifest',
            severity: 'warning',
            title: 'Latest backup has no manifest',
            detail: `${latest.filename} exists but its manifest could not be parsed.`,
            action: 'Create a fresh backup so restore metadata is deterministic.',
            refs: [latest.path],
          }),
        );
      }
      if (age >= BACKUP_BLOCKED_AGE_MS) {
        backupFindings.push(
          finding({
            id: 'backup-posture.age.blocked',
            severity: 'blocked',
            title: 'Latest backup is stale',
            detail: `Latest backup is ${daysText(age)} old.`,
            action: 'Create a fresh backup before starting new long-running autonomous work.',
            refs: [latest.path],
          }),
        );
      } else if (age >= BACKUP_WARNING_AGE_MS) {
        backupFindings.push(
          finding({
            id: 'backup-posture.age.warning',
            severity: 'warning',
            title: 'Latest backup is aging',
            detail: `Latest backup is ${daysText(age)} old.`,
            action: 'Create a fresh backup before the next unattended runtime session.',
            refs: [latest.path],
          }),
        );
      }
    }
    checks.push(
      check({
        id: 'backup-posture',
        label: 'Backup Posture',
        checkedAt: generatedAt,
        summary: latest
          ? `${backups.length} backup(s) found; latest is ${daysText(age ?? 0)} old.`
          : 'No local backups are available.',
        findings: backupFindings,
      }),
    );

    const profiles =
      hasTable('runtime_profiles') && hasTable('employee_runtime_bindings')
        ? rowCount(
            db,
            'select p.*, (select count(*) from employee_runtime_bindings b where b.runtime_profile_id = p.id) as bound_count from runtime_profiles p where p.company_id = ?',
            [companyId],
          )
        : [];
    const profileFindings = [];
    for (const profile of profiles) {
      if (profile.enabled && Number(profile.bound_count ?? 0) === 0) {
        profileFindings.push(
          finding({
            id: `runtime-profiles.${profile.id}.unbound`,
            severity: 'warning',
            title: `${profile.name} has no employee binding`,
            detail: 'Enabled runtime profiles should be bound explicitly.',
            action: 'Bind this profile to the intended employee seats or disable it.',
            refs: [profile.id],
          }),
        );
      }
      if (profile.enabled && profile.last_health_status === 'error') {
        profileFindings.push(
          finding({
            id: `runtime-profiles.${profile.id}.health-error`,
            severity: 'blocked',
            title: `${profile.name} validation failed`,
            detail: profile.last_health_message ?? 'Runtime profile health is error.',
            action: 'Fix the runtime profile configuration and rerun validation.',
            refs: [profile.id],
          }),
        );
      }
    }
    if (profiles.length === 0) {
      profileFindings.push(
        finding({
          id: 'runtime-profiles.none',
          severity: 'warning',
          title: 'No runtime profiles exist',
          detail: 'The workspace has no execution profiles for internal or external agents.',
          action: 'Create at least one runtime profile and bind it to employees.',
        }),
      );
    }
    checks.push(
      check({
        id: 'runtime-profiles',
        label: 'Runtime Profiles',
        checkedAt: generatedAt,
        summary: `${profiles.length} runtime profile(s) inspected.`,
        findings: profileFindings,
      }),
    );

    const secretFindings = [];
    for (const profile of profiles) {
      const config = parseJson(profile.config_json);
      for (const inline of collectInlineSecrets(config, `runtimeProfiles.${profile.id}.config`)) {
        secretFindings.push(
          finding({
            id: `runtime-secrets.${profile.id}.inline.${inline.key}`,
            severity: 'blocked',
            title: `${profile.name} stores inline sensitive config`,
            detail: `${inline.path} should use a secret_ref instead of a literal value.`,
            action:
              'Move the value into the OS keychain and replace the config value with a runtime secret reference.',
            refs: [profile.id, inline.path],
          }),
        );
      }
      for (const { path, ref } of collectSecretRefs(
        config,
        `runtimeProfiles.${profile.id}.config`,
      )) {
        secretFindings.push(
          finding({
            id: `runtime-secrets.${profile.id}.ref.${ref.providerId}.${ref.key}`,
            severity: 'warning',
            title: `${profile.name} has a secret ref that the CLI cannot verify`,
            detail: `${path} references provider "${ref.providerId}" key "${ref.key}".`,
            action: 'Use the in-app doctor to verify the OS keychain value.',
            refs: [profile.id, path],
          }),
        );
      }
    }
    checks.push(
      check({
        id: 'runtime-secrets',
        label: 'Runtime Secrets',
        checkedAt: generatedAt,
        summary: 'Runtime configs were scanned for secret refs and inline sensitive values.',
        findings: secretFindings,
      }),
    );

    const sessions = hasTable('runtime_sessions')
      ? rowCount(
          db,
          "select * from runtime_sessions where company_id = ? and ended_at is null and status in ('starting','idle','working','blocked','stale','offline','failed')",
          [companyId],
        )
      : [];
    const sessionFindings = sessions
      .filter((session) => ['blocked', 'stale', 'offline', 'failed'].includes(session.status))
      .map((session) =>
        finding({
          id: `runtime-sessions.${session.id}.${session.status}`,
          severity:
            session.status === 'blocked' || session.status === 'stale' ? 'warning' : 'blocked',
          title: `Runtime session ${session.status}`,
          detail: session.failure_reason ?? `Session ${session.id} requires operator review.`,
          action:
            'Review the session in Autonomy > Runtimes and recover or close the underlying work.',
          refs: [session.id],
        }),
      );
    checks.push(
      check({
        id: 'runtime-sessions',
        label: 'Runtime Sessions',
        checkedAt: generatedAt,
        summary: `${sessions.length} live runtime session(s).`,
        findings: sessionFindings,
      }),
    );

    const checkouts = hasTable('ticket_checkouts')
      ? rowCount(db, "select * from ticket_checkouts where company_id = ? and status = 'active'", [
          companyId,
        ])
      : [];
    checks.push(
      check({
        id: 'ticket-checkouts',
        label: 'Ticket Checkouts',
        checkedAt: generatedAt,
        summary: `${checkouts.length} active ticket checkout lease(s).`,
        findings: checkouts
          .filter((checkout) => checkout.expires_at <= generatedAt)
          .map((checkout) =>
            finding({
              id: `ticket-checkouts.${checkout.id}.expired`,
              severity: 'blocked',
              title: 'Active checkout lease is expired',
              detail: `Ticket ${checkout.ticket_id} is still marked active even though checkout ${checkout.id} expired.`,
              action:
                'Open Team-X so runtime operations can expire the lease before another runtime claims the ticket.',
              refs: [checkout.id, checkout.ticket_id],
            }),
          ),
      }),
    );

    const workspaceFindings = [];
    for (const session of sessions) {
      if (session.workspace_path && !existsSync(session.workspace_path)) {
        workspaceFindings.push(
          finding({
            id: `workspace-paths.session.${session.id}`,
            severity: 'blocked',
            title: 'Runtime session workspace is missing',
            detail: `Session ${session.id} references a workspace path that is not available on disk.`,
            action:
              'Recover or close the runtime session before assigning more work to that runtime profile.',
            refs: [session.id, session.workspace_path],
          }),
        );
      }
    }
    for (const profile of profiles) {
      const config = parseJson(profile.config_json);
      const workingDirectory = config.workingDirectory;
      if (
        typeof workingDirectory === 'string' &&
        workingDirectory.trim().length > 0 &&
        !existsSync(workingDirectory)
      ) {
        workspaceFindings.push(
          finding({
            id: `workspace-paths.profile.${profile.id}`,
            severity: 'warning',
            title: `${profile.name} working directory is unavailable`,
            detail: 'The configured workingDirectory path does not exist on this machine.',
            action:
              'Use a managed runtime workspace or update the workingDirectory before validating this profile.',
            refs: [profile.id, workingDirectory],
          }),
        );
      }
    }
    checks.push(
      check({
        id: 'workspace-paths',
        label: 'Workspace Paths',
        checkedAt: generatedAt,
        summary: 'Runtime session workspaces and profile working directories were checked on disk.',
        findings: workspaceFindings,
      }),
    );

    const mcpServers = hasTable('mcp_servers')
      ? rowCount(db, 'select * from mcp_servers where company_id = ? or company_id is null', [
          companyId,
        ])
      : [];
    checks.push(
      check({
        id: 'mcp-health',
        label: 'MCP Health',
        checkedAt: generatedAt,
        summary: `${mcpServers.filter((server) => server.enabled).length} enabled MCP server(s).`,
        findings: mcpServers
          .filter((server) => server.enabled)
          .filter((server) => /error|failed|unhealthy/i.test(server.last_health ?? ''))
          .map((server) =>
            finding({
              id: `mcp-health.${server.id}`,
              severity: 'warning',
              title: `${server.name} MCP health is degraded`,
              detail: server.last_health ?? 'Enabled MCP server has a degraded health status.',
              action:
                'Test or disable this MCP server before launching runtime work that depends on tools.',
              refs: [server.id],
            }),
          ),
      }),
    );

    const providers = hasTable('providers')
      ? rowCount(db, 'select * from providers where enabled = 1')
      : [];
    checks.push(
      check({
        id: 'provider-health',
        label: 'Provider Health',
        checkedAt: generatedAt,
        summary: `${providers.length} enabled provider(s) found. OS keychain readiness is only verifiable from the in-app doctor.`,
        findings: providers
          .filter((provider) => provider.privacy_tier !== 'local')
          .map((provider) =>
            finding({
              id: `provider-health.${provider.id}.keychain-unverified`,
              severity: 'warning',
              title: `${provider.name} keychain status is unverified`,
              detail: 'The CLI can read SQLite but does not decrypt OS keychain credentials.',
              action:
                'Use the in-app doctor or provider test action to verify this provider before autonomous work.',
              refs: [provider.id],
            }),
          ),
      }),
    );

    const budgetPolicies = hasTable('budget_policies')
      ? rowCount(db, 'select * from budget_policies where company_id = ? and enabled = 1', [
          companyId,
        ])
      : [];
    const pendingApprovals = hasTable('approval_items')
      ? db
          .prepare(
            "select count(*) as count from approval_items where company_id = ? and kind = 'budget-exception' and status = 'pending'",
          )
          .get(companyId)?.count
      : 0;
    checks.push(
      check({
        id: 'budget-blockers',
        label: 'Budget Blockers',
        checkedAt: generatedAt,
        summary: `${budgetPolicies.length} active budget policy/policies; ${pendingApprovals ?? 0} pending budget approval(s).`,
        findings:
          Number(pendingApprovals ?? 0) > 0
            ? [
                finding({
                  id: 'budget-blockers.pending-approvals',
                  severity: 'warning',
                  title: 'Budget approvals are pending',
                  detail: `${pendingApprovals} budget approval(s) are waiting for operator review.`,
                  action:
                    'Review Autonomy > Approvals so runtime work does not block unexpectedly.',
                }),
              ]
            : [],
      }),
    );

    const totals = {
      ok: checks.filter((item) => item.status === 'ok').length,
      warning: checks.filter((item) => item.status === 'warning').length,
      blocked: checks.filter((item) => item.status === 'blocked').length,
      findingCount: checks.reduce((total, item) => total + item.findings.length, 0),
    };
    const status = checks.reduce((current, item) => worstStatus(current, item.status), 'ok');
    console.log(
      JSON.stringify(
        {
          companyId,
          dbPath,
          backupsDir,
          engine,
          generatedAt,
          status,
          checks,
          totals,
        },
        null,
        2,
      ),
    );
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        status: 'blocked',
        error: 'Autonomy Doctor CLI failed before producing a report.',
        detail: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
