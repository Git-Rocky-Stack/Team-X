import { existsSync } from 'node:fs';

import type {
  AutonomyDoctorCheck,
  AutonomyDoctorCheckId,
  AutonomyDoctorFinding,
  AutonomyDoctorFindingSeverity,
  AutonomyDoctorReport,
  AutonomyDoctorStatus,
  BudgetOverview,
  ProviderConfig,
  RuntimeOperationsSnapshot,
  RuntimeProfileSummary,
} from '@team-x/shared-types';

import type { BackupEntry } from './backup.js';
import {
  type RuntimeSecretReader,
  collectRuntimeSecretRefs,
  isRuntimeSecretRef,
} from './runtime-secret-refs.js';

type RuntimeProfileStatus = RuntimeProfileSummary['lastHealthStatus'];

interface DbDiagnostics {
  quickCheck(): string;
  hasTable(tableName: string): boolean;
}

interface McpServerHealthRow {
  id: string;
  name: string;
  enabled: boolean;
  lastHealth: string | null;
}

export interface AutonomyDoctorServiceDeps {
  dbDiagnostics?: DbDiagnostics;
  backupService?: {
    list(): Promise<BackupEntry[]>;
  };
  runtimeProfilesService: {
    list(companyId: string): RuntimeProfileSummary[];
  };
  runtimeOperationsService: {
    snapshot(companyId: string): RuntimeOperationsSnapshot;
  };
  mcpServersRepo?: {
    listByCompany(companyId: string): McpServerHealthRow[];
  };
  providersService?: {
    list(): ProviderConfig[];
    isConfigured(providerId: string): Promise<boolean>;
  };
  budgetGovernanceService?: {
    getOverview(companyId: string): BudgetOverview;
  };
  secretsStore?: RuntimeSecretReader;
  pathExists?: (path: string) => boolean;
  now?: () => number;
}

const REQUIRED_RUNTIME_TABLES = [
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
] as const;

const SENSITIVE_KEY_PATTERN = /(?:api[_-]?key|token|secret|password)$/i;
const BACKUP_WARNING_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const BACKUP_BLOCKED_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function severityToStatus(severity: AutonomyDoctorFindingSeverity): AutonomyDoctorStatus {
  return severity === 'blocked' ? 'blocked' : severity === 'warning' ? 'warning' : 'ok';
}

function worstStatus(a: AutonomyDoctorStatus, b: AutonomyDoctorStatus): AutonomyDoctorStatus {
  if (a === 'blocked' || b === 'blocked') return 'blocked';
  if (a === 'warning' || b === 'warning') return 'warning';
  return 'ok';
}

function statusFromFindings(findings: readonly AutonomyDoctorFinding[]): AutonomyDoctorStatus {
  return findings.reduce(
    (status, finding) => worstStatus(status, severityToStatus(finding.severity)),
    'ok' as AutonomyDoctorStatus,
  );
}

function makeFinding(input: {
  id: string;
  severity: AutonomyDoctorFindingSeverity;
  title: string;
  detail: string;
  action?: string | null;
  refs?: string[];
}): AutonomyDoctorFinding {
  return {
    id: input.id,
    severity: input.severity,
    title: input.title,
    detail: input.detail,
    action: input.action ?? null,
    refs: input.refs ?? [],
  };
}

function makeCheck(input: {
  id: AutonomyDoctorCheckId;
  label: string;
  summary: string;
  checkedAt: number;
  findings?: AutonomyDoctorFinding[];
  status?: AutonomyDoctorStatus;
}): AutonomyDoctorCheck {
  const findings = input.findings ?? [];
  return {
    id: input.id,
    label: input.label,
    status: input.status ?? statusFromFindings(findings),
    summary: input.summary,
    checkedAt: input.checkedAt,
    findings,
  };
}

function errorCheck(
  id: AutonomyDoctorCheckId,
  label: string,
  checkedAt: number,
  error: unknown,
): AutonomyDoctorCheck {
  const detail = error instanceof Error ? error.message : String(error);
  return makeCheck({
    id,
    label,
    checkedAt,
    summary: `${label} could not complete.`,
    findings: [
      makeFinding({
        id: `${id}.exception`,
        severity: 'blocked',
        title: `${label} failed`,
        detail,
        action:
          'Inspect the main-process logs and rerun Autonomy Doctor after the underlying read succeeds.',
      }),
    ],
  });
}

function isSensitiveInlineValue(key: string, value: unknown): boolean {
  if (!SENSITIVE_KEY_PATTERN.test(key)) return false;
  if (isRuntimeSecretRef(value)) return false;
  if (typeof value !== 'string') return value !== null && value !== undefined;
  return value.trim().length > 0;
}

function collectInlineSensitiveValues(
  value: unknown,
  path = 'config',
): Array<{ path: string; key: string }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const refs: Array<{ path: string; key: string }> = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (isSensitiveInlineValue(key, child)) {
      refs.push({ path: childPath, key });
      continue;
    }
    refs.push(...collectInlineSensitiveValues(child, childPath));
  }
  return refs;
}

function statusWord(status: RuntimeProfileStatus): string {
  return status === 'unknown' ? 'not validated' : status;
}

function profileIsExecutionCapable(profile: RuntimeProfileSummary): boolean {
  return profile.enabled && profile.executionMode === 'native';
}

function backupAgeMs(entry: BackupEntry, now: number): number | null {
  const parsed = Date.parse(entry.createdAt);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, now - parsed);
}

function daysText(ms: number): string {
  return `${Math.floor(ms / (24 * 60 * 60 * 1000))}d`;
}

export function createAutonomyDoctorService(deps: AutonomyDoctorServiceDeps) {
  const now = deps.now ?? Date.now;
  const pathExists = deps.pathExists ?? existsSync;

  async function withCheck(
    id: AutonomyDoctorCheckId,
    label: string,
    fn: (checkedAt: number) => Promise<AutonomyDoctorCheck> | AutonomyDoctorCheck,
  ): Promise<AutonomyDoctorCheck> {
    const checkedAt = now();
    try {
      return await fn(checkedAt);
    } catch (error) {
      return errorCheck(id, label, checkedAt, error);
    }
  }

  function checkDbIntegrity(checkedAt: number): AutonomyDoctorCheck {
    if (!deps.dbDiagnostics) {
      return makeCheck({
        id: 'db-integrity',
        label: 'DB Integrity',
        checkedAt,
        summary: 'Database diagnostics are not wired in this runtime.',
        findings: [
          makeFinding({
            id: 'db-integrity.unwired',
            severity: 'warning',
            title: 'DB quick-check is unavailable',
            detail: 'The doctor service was created without a database diagnostics adapter.',
            action:
              'Wire dbDiagnostics in the main composition root before relying on support reports.',
          }),
        ],
      });
    }

    const result = deps.dbDiagnostics.quickCheck().trim();
    if (result.toLowerCase() === 'ok') {
      return makeCheck({
        id: 'db-integrity',
        label: 'DB Integrity',
        checkedAt,
        summary: 'SQLite quick-check returned ok.',
      });
    }

    return makeCheck({
      id: 'db-integrity',
      label: 'DB Integrity',
      checkedAt,
      summary: 'SQLite quick-check reported an integrity issue.',
      findings: [
        makeFinding({
          id: 'db-integrity.quick-check',
          severity: 'blocked',
          title: 'SQLite quick-check failed',
          detail: result,
          action:
            'Create a backup, stop the app, and inspect the SQLite file before launching more autonomous work.',
        }),
      ],
    });
  }

  function checkMigrations(checkedAt: number): AutonomyDoctorCheck {
    if (!deps.dbDiagnostics) {
      return makeCheck({
        id: 'migrations',
        label: 'Migrations',
        checkedAt,
        summary: 'Migration table checks are not wired in this runtime.',
        findings: [
          makeFinding({
            id: 'migrations.unwired',
            severity: 'warning',
            title: 'Migration diagnostics are unavailable',
            detail: 'The doctor service was created without a database diagnostics adapter.',
            action:
              'Wire dbDiagnostics in the main composition root before relying on support reports.',
          }),
        ],
      });
    }

    const missing = REQUIRED_RUNTIME_TABLES.filter((table) => !deps.dbDiagnostics?.hasTable(table));
    if (missing.length === 0) {
      return makeCheck({
        id: 'migrations',
        label: 'Migrations',
        checkedAt,
        summary: `${REQUIRED_RUNTIME_TABLES.length} required control-plane tables are present.`,
      });
    }

    return makeCheck({
      id: 'migrations',
      label: 'Migrations',
      checkedAt,
      summary: `${missing.length} required control-plane table(s) are missing.`,
      findings: missing.map((table) =>
        makeFinding({
          id: `migrations.${table}`,
          severity: 'blocked',
          title: `Missing table: ${table}`,
          detail: `Autonomous runtime mechanics require the ${table} table.`,
          action: 'Run the migration bootstrap before using external runtimes in this workspace.',
        }),
      ),
    });
  }

  async function checkBackupPosture(checkedAt: number): Promise<AutonomyDoctorCheck> {
    if (!deps.backupService) {
      return makeCheck({
        id: 'backup-posture',
        label: 'Backup Posture',
        checkedAt,
        summary: 'Backup service is not wired into Autonomy Doctor.',
        findings: [
          makeFinding({
            id: 'backup-posture.unwired',
            severity: 'warning',
            title: 'Backup listing is unavailable',
            detail:
              'The doctor cannot verify backup age or manifest health without the backup service.',
            action: 'Wire backupService into the doctor service.',
          }),
        ],
      });
    }

    const backups = await deps.backupService.list();
    if (backups.length === 0) {
      return makeCheck({
        id: 'backup-posture',
        label: 'Backup Posture',
        checkedAt,
        summary: 'No local backups are available.',
        findings: [
          makeFinding({
            id: 'backup-posture.none',
            severity: 'warning',
            title: 'No backup exists',
            detail:
              'Autonomous runtime work should have a current recovery point before long-running agents are allowed to mutate state.',
            action:
              'Create a backup from Settings > Backup before running unattended external agents.',
          }),
        ],
      });
    }

    const [latest] = backups;
    const age = latest ? backupAgeMs(latest, checkedAt) : null;
    const findings: AutonomyDoctorFinding[] = [];
    if (latest && latest.manifest === null) {
      findings.push(
        makeFinding({
          id: 'backup-posture.manifest',
          severity: 'warning',
          title: 'Latest backup has no manifest',
          detail: `${latest.filename} exists but its manifest could not be parsed.`,
          action: 'Create a fresh backup so restore metadata is deterministic.',
          refs: [latest.path],
        }),
      );
    }
    if (age !== null && age >= BACKUP_BLOCKED_AGE_MS) {
      findings.push(
        makeFinding({
          id: 'backup-posture.age.blocked',
          severity: 'blocked',
          title: 'Latest backup is stale',
          detail: `Latest backup is ${daysText(age)} old.`,
          action: 'Create a fresh backup before starting new long-running autonomous work.',
          refs: latest ? [latest.path] : [],
        }),
      );
    } else if (age !== null && age >= BACKUP_WARNING_AGE_MS) {
      findings.push(
        makeFinding({
          id: 'backup-posture.age.warning',
          severity: 'warning',
          title: 'Latest backup is aging',
          detail: `Latest backup is ${daysText(age)} old.`,
          action: 'Create a fresh backup before the next unattended runtime session.',
          refs: latest ? [latest.path] : [],
        }),
      );
    }

    return makeCheck({
      id: 'backup-posture',
      label: 'Backup Posture',
      checkedAt,
      summary:
        age === null
          ? `${backups.length} backup(s) found; latest timestamp could not be parsed.`
          : `${backups.length} backup(s) found; latest is ${daysText(age)} old.`,
      findings,
    });
  }

  function checkRuntimeProfiles(
    checkedAt: number,
    profiles: RuntimeProfileSummary[],
  ): AutonomyDoctorCheck {
    const findings: AutonomyDoctorFinding[] = [];
    const nativeProfiles = profiles.filter(profileIsExecutionCapable);

    if (profiles.length === 0) {
      findings.push(
        makeFinding({
          id: 'runtime-profiles.none',
          severity: 'warning',
          title: 'No runtime profiles exist',
          detail: 'The workspace has no execution profiles for internal or external agents.',
          action:
            'Create at least one runtime profile and bind it to the employees expected to run autonomous work.',
        }),
      );
    } else if (nativeProfiles.length === 0) {
      findings.push(
        makeFinding({
          id: 'runtime-profiles.no-native',
          severity: 'warning',
          title: 'No native external runtime is enabled',
          detail: 'All configured runtime profiles are disabled or planned-only.',
          action:
            'Enable a Bash, HTTP, or Codex runtime profile when this workspace should execute outside Team-X internal providers.',
        }),
      );
    }

    for (const profile of profiles) {
      if (profile.enabled && profile.boundEmployeeCount === 0) {
        findings.push(
          makeFinding({
            id: `runtime-profiles.${profile.id}.unbound`,
            severity: 'warning',
            title: `${profile.name} has no employee binding`,
            detail:
              'Enabled runtime profiles should be bound explicitly so operators know which employees may use them.',
            action: 'Bind this profile to the intended employee seats or disable it.',
            refs: [profile.id],
          }),
        );
      }
      if (profile.enabled && profile.lastHealthStatus === 'error') {
        findings.push(
          makeFinding({
            id: `runtime-profiles.${profile.id}.health-error`,
            severity: 'blocked',
            title: `${profile.name} validation failed`,
            detail: profile.lastHealthMessage ?? 'Runtime profile health is error.',
            action: 'Fix the runtime profile configuration and rerun validation.',
            refs: [profile.id],
          }),
        );
      } else if (
        profile.enabled &&
        (profile.lastHealthStatus === 'warning' || profile.lastHealthStatus === 'unknown')
      ) {
        findings.push(
          makeFinding({
            id: `runtime-profiles.${profile.id}.health-${profile.lastHealthStatus}`,
            severity: 'warning',
            title: `${profile.name} is ${statusWord(profile.lastHealthStatus)}`,
            detail:
              profile.lastHealthMessage ??
              'Runtime profile health should be validated before unattended use.',
            action: 'Validate this runtime profile from Autonomy > Runtimes.',
            refs: [profile.id],
          }),
        );
      }
    }

    return makeCheck({
      id: 'runtime-profiles',
      label: 'Runtime Profiles',
      checkedAt,
      summary: `${profiles.length} profile(s), ${nativeProfiles.length} enabled native runtime profile(s).`,
      findings,
    });
  }

  async function checkRuntimeSecrets(
    checkedAt: number,
    profiles: RuntimeProfileSummary[],
  ): Promise<AutonomyDoctorCheck> {
    const findings: AutonomyDoctorFinding[] = [];

    for (const profile of profiles) {
      const secretRefs = collectRuntimeSecretRefs(
        profile.config,
        `runtimeProfiles.${profile.id}.config`,
      );
      const inlineSecrets = collectInlineSensitiveValues(
        profile.config,
        `runtimeProfiles.${profile.id}.config`,
      );

      for (const inline of inlineSecrets) {
        findings.push(
          makeFinding({
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

      for (const { path, ref } of secretRefs) {
        if (!deps.secretsStore) {
          findings.push(
            makeFinding({
              id: `runtime-secrets.${profile.id}.unverified.${ref.providerId}.${ref.key}`,
              severity: 'warning',
              title: `${profile.name} secret ref is unverified`,
              detail: `${path} references provider "${ref.providerId}" but Autonomy Doctor has no secret reader.`,
              action:
                'Wire secretsStore into the doctor service so missing secrets can be detected before runtime launch.',
              refs: [profile.id, path],
            }),
          );
          continue;
        }
        const value = await deps.secretsStore.getApiKey(ref.providerId);
        if (!value) {
          findings.push(
            makeFinding({
              id: `runtime-secrets.${profile.id}.missing.${ref.providerId}.${ref.key}`,
              severity: 'blocked',
              title: `${profile.name} is missing a runtime secret`,
              detail: `${path} references provider "${ref.providerId}" key "${ref.key}", but the keychain has no value.`,
              action:
                'Add the missing provider secret in Settings > Providers before launching this runtime.',
              refs: [profile.id, path],
            }),
          );
        }
      }
    }

    return makeCheck({
      id: 'runtime-secrets',
      label: 'Runtime Secrets',
      checkedAt,
      summary: 'Runtime configs were scanned for secret refs and inline sensitive values.',
      findings,
    });
  }

  function checkRuntimeSessions(
    checkedAt: number,
    snapshot: RuntimeOperationsSnapshot,
  ): AutonomyDoctorCheck {
    const findings: AutonomyDoctorFinding[] = [];
    for (const session of snapshot.sessions) {
      if (session.status === 'blocked' || session.status === 'stale') {
        findings.push(
          makeFinding({
            id: `runtime-sessions.${session.id}.${session.status}`,
            severity: 'warning',
            title: `Runtime session ${session.status}`,
            detail:
              session.failureReason ??
              `Session ${session.id} is ${session.status} and may require operator review.`,
            action:
              'Review the session in Autonomy > Runtimes and recover or close the underlying work.',
            refs: [session.id],
          }),
        );
      }
      if (session.status === 'failed' || session.status === 'offline') {
        findings.push(
          makeFinding({
            id: `runtime-sessions.${session.id}.${session.status}`,
            severity: 'blocked',
            title: `Runtime session ${session.status}`,
            detail:
              session.failureReason ??
              `Session ${session.id} is ${session.status} and should be reconciled before more work is launched.`,
            action:
              'Inspect the run and runtime logs, then relaunch only after the failure is explained.',
            refs: [session.id],
          }),
        );
      }
      if (
        session.leaseExpiresAt !== null &&
        session.leaseExpiresAt <= checkedAt &&
        (session.status === 'starting' ||
          session.status === 'idle' ||
          session.status === 'working' ||
          session.status === 'blocked')
      ) {
        findings.push(
          makeFinding({
            id: `runtime-sessions.${session.id}.expired-lease`,
            severity: 'warning',
            title: 'Runtime session lease is expired',
            detail: `Session ${session.id} still appears live, but its lease expired before this doctor run.`,
            action:
              'Refresh the runtime operations snapshot so stale leases are expired, then recover the work if needed.',
            refs: [session.id],
          }),
        );
      }
    }

    return makeCheck({
      id: 'runtime-sessions',
      label: 'Runtime Sessions',
      checkedAt,
      summary: `${snapshot.sessions.length} live runtime session(s) in the current operations snapshot.`,
      findings,
    });
  }

  function checkTicketCheckouts(
    checkedAt: number,
    snapshot: RuntimeOperationsSnapshot,
  ): AutonomyDoctorCheck {
    const findings = snapshot.activeCheckouts
      .filter((checkout) => checkout.expiresAt <= checkedAt)
      .map((checkout) =>
        makeFinding({
          id: `ticket-checkouts.${checkout.id}.expired`,
          severity: 'blocked' as const,
          title: 'Active checkout lease is expired',
          detail: `Ticket ${checkout.ticketId} is still marked active even though checkout ${checkout.id} expired.`,
          action:
            'Refresh runtime operations to expire the lease before another runtime claims the ticket.',
          refs: [checkout.id, checkout.ticketId],
        }),
      );

    return makeCheck({
      id: 'ticket-checkouts',
      label: 'Ticket Checkouts',
      checkedAt,
      summary: `${snapshot.activeCheckouts.length} active ticket checkout lease(s).`,
      findings,
    });
  }

  function checkWorkspacePaths(
    checkedAt: number,
    profiles: RuntimeProfileSummary[],
    snapshot: RuntimeOperationsSnapshot,
  ): AutonomyDoctorCheck {
    const findings: AutonomyDoctorFinding[] = [];

    for (const session of snapshot.sessions) {
      if (session.workspacePath && !pathExists(session.workspacePath)) {
        findings.push(
          makeFinding({
            id: `workspace-paths.session.${session.id}`,
            severity: 'blocked',
            title: 'Runtime session workspace is missing',
            detail: `Session ${session.id} references a workspace path that is not available on disk.`,
            action:
              'Recover or close the runtime session before assigning more work to that runtime profile.',
            refs: [session.id, session.workspacePath],
          }),
        );
      }
    }

    for (const profile of profiles) {
      const workingDirectory = profile.config?.workingDirectory;
      if (typeof workingDirectory === 'string' && workingDirectory.trim().length > 0) {
        if (!pathExists(workingDirectory)) {
          findings.push(
            makeFinding({
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
    }

    return makeCheck({
      id: 'workspace-paths',
      label: 'Workspace Paths',
      checkedAt,
      summary: 'Runtime session workspaces and profile working directories were checked on disk.',
      findings,
    });
  }

  function checkMcpHealth(checkedAt: number, companyId: string): AutonomyDoctorCheck {
    if (!deps.mcpServersRepo) {
      return makeCheck({
        id: 'mcp-health',
        label: 'MCP Health',
        checkedAt,
        summary: 'MCP server diagnostics are not wired into Autonomy Doctor.',
        findings: [
          makeFinding({
            id: 'mcp-health.unwired',
            severity: 'warning',
            title: 'MCP health is unavailable',
            detail: 'The doctor cannot inspect enabled MCP servers without mcpServersRepo.',
            action: 'Wire mcpServersRepo into the doctor service.',
          }),
        ],
      });
    }

    const servers = deps.mcpServersRepo.listByCompany(companyId);
    const enabled = servers.filter((server) => server.enabled);
    const findings = enabled
      .filter((server) => {
        const health = server.lastHealth?.toLowerCase() ?? '';
        return (
          health.includes('error') || health.includes('failed') || health.includes('unhealthy')
        );
      })
      .map((server) =>
        makeFinding({
          id: `mcp-health.${server.id}`,
          severity: 'warning' as const,
          title: `${server.name} MCP health is degraded`,
          detail: server.lastHealth ?? 'Enabled MCP server has a degraded health status.',
          action:
            'Test or disable this MCP server before launching runtime work that depends on tools.',
          refs: [server.id],
        }),
      );

    return makeCheck({
      id: 'mcp-health',
      label: 'MCP Health',
      checkedAt,
      summary: `${enabled.length} enabled MCP server(s) visible to this workspace.`,
      findings,
    });
  }

  async function checkProviderHealth(checkedAt: number): Promise<AutonomyDoctorCheck> {
    if (!deps.providersService) {
      return makeCheck({
        id: 'provider-health',
        label: 'Provider Health',
        checkedAt,
        summary: 'Provider diagnostics are not wired into Autonomy Doctor.',
        findings: [
          makeFinding({
            id: 'provider-health.unwired',
            severity: 'warning',
            title: 'Provider health is unavailable',
            detail: 'The doctor cannot inspect model/provider readiness without providersService.',
            action: 'Wire providersService into the doctor service.',
          }),
        ],
      });
    }

    const providers = deps.providersService.list();
    const findings: AutonomyDoctorFinding[] = [];
    for (const provider of providers.filter((candidate) => candidate.enabled)) {
      const configured = await deps.providersService.isConfigured(provider.id);
      if (!configured) {
        findings.push(
          makeFinding({
            id: `provider-health.${provider.id}.unconfigured`,
            severity: provider.privacyTier === 'local' ? 'warning' : 'blocked',
            title: `${provider.name} is enabled but not configured`,
            detail: 'Enabled providers should be usable before autonomous runtime work starts.',
            action:
              provider.privacyTier === 'local'
                ? 'Start the local provider or disable it until it is available.'
                : 'Add the provider API key or disable this provider.',
            refs: [provider.id],
          }),
        );
      }
      if (!provider.defaultModel && provider.kind !== 'ollama') {
        findings.push(
          makeFinding({
            id: `provider-health.${provider.id}.model`,
            severity: 'warning',
            title: `${provider.name} has no default model`,
            detail:
              'Provider routing may still work through explicit employee preferences, but support reports are clearer with a default model.',
            action: 'Set a default model in Settings > Providers.',
            refs: [provider.id],
          }),
        );
      }
    }

    return makeCheck({
      id: 'provider-health',
      label: 'Provider Health',
      checkedAt,
      summary: `${providers.filter((provider) => provider.enabled).length} enabled provider(s) inspected.`,
      findings,
    });
  }

  function checkBudgetBlockers(checkedAt: number, companyId: string): AutonomyDoctorCheck {
    if (!deps.budgetGovernanceService) {
      return makeCheck({
        id: 'budget-blockers',
        label: 'Budget Blockers',
        checkedAt,
        summary: 'Budget governance diagnostics are not wired into Autonomy Doctor.',
        findings: [
          makeFinding({
            id: 'budget-blockers.unwired',
            severity: 'warning',
            title: 'Budget governance is unavailable',
            detail:
              'The doctor cannot inspect budget warnings, exceeded policies, or pending approvals without budgetGovernanceService.',
            action: 'Wire budgetGovernanceService into the doctor service.',
          }),
        ],
      });
    }

    const overview = deps.budgetGovernanceService.getOverview(companyId);
    const findings: AutonomyDoctorFinding[] = [];
    if (overview.exceededCount > 0) {
      findings.push(
        makeFinding({
          id: 'budget-blockers.exceeded',
          severity: 'blocked',
          title: 'Budget policies are exceeded',
          detail: `${overview.exceededCount} active budget policy/policies are over hard cap.`,
          action: 'Review Autonomy > Budgets before launching more runtime work.',
        }),
      );
    }
    if (overview.pendingApprovalCount > 0) {
      findings.push(
        makeFinding({
          id: 'budget-blockers.pending-approvals',
          severity: 'warning',
          title: 'Budget approvals are pending',
          detail: `${overview.pendingApprovalCount} budget approval(s) are waiting for operator review.`,
          action: 'Review Autonomy > Approvals so runtime work does not block unexpectedly.',
        }),
      );
    }
    if (overview.warningCount > 0) {
      findings.push(
        makeFinding({
          id: 'budget-blockers.warnings',
          severity: 'warning',
          title: 'Budget policies are near threshold',
          detail: `${overview.warningCount} active budget policy/policies are above warning threshold.`,
          action: 'Inspect spend before starting long-running external agents.',
        }),
      );
    }

    return makeCheck({
      id: 'budget-blockers',
      label: 'Budget Blockers',
      checkedAt,
      summary: `${overview.activePolicyCount} active budget policy/policies; ${overview.companySpendUsd} spent this period.`,
      findings,
    });
  }

  return {
    async run(input: { companyId: string }): Promise<AutonomyDoctorReport> {
      const generatedAt = now();
      const profiles = deps.runtimeProfilesService.list(input.companyId);
      const snapshot = deps.runtimeOperationsService.snapshot(input.companyId);

      const checks = await Promise.all([
        withCheck('db-integrity', 'DB Integrity', checkDbIntegrity),
        withCheck('migrations', 'Migrations', checkMigrations),
        withCheck('backup-posture', 'Backup Posture', checkBackupPosture),
        withCheck('runtime-profiles', 'Runtime Profiles', (checkedAt) =>
          checkRuntimeProfiles(checkedAt, profiles),
        ),
        withCheck('runtime-secrets', 'Runtime Secrets', (checkedAt) =>
          checkRuntimeSecrets(checkedAt, profiles),
        ),
        withCheck('runtime-sessions', 'Runtime Sessions', (checkedAt) =>
          checkRuntimeSessions(checkedAt, snapshot),
        ),
        withCheck('ticket-checkouts', 'Ticket Checkouts', (checkedAt) =>
          checkTicketCheckouts(checkedAt, snapshot),
        ),
        withCheck('workspace-paths', 'Workspace Paths', (checkedAt) =>
          checkWorkspacePaths(checkedAt, profiles, snapshot),
        ),
        withCheck('mcp-health', 'MCP Health', (checkedAt) =>
          checkMcpHealth(checkedAt, input.companyId),
        ),
        withCheck('provider-health', 'Provider Health', checkProviderHealth),
        withCheck('budget-blockers', 'Budget Blockers', (checkedAt) =>
          checkBudgetBlockers(checkedAt, input.companyId),
        ),
      ]);

      const totals = {
        ok: checks.filter((check) => check.status === 'ok').length,
        warning: checks.filter((check) => check.status === 'warning').length,
        blocked: checks.filter((check) => check.status === 'blocked').length,
        findingCount: checks.reduce((total, check) => total + check.findings.length, 0),
      };
      const status = checks.reduce(
        (current, check) => worstStatus(current, check.status),
        'ok' as AutonomyDoctorStatus,
      );

      return {
        companyId: input.companyId,
        generatedAt,
        status,
        checks,
        totals,
      };
    },
  };
}

export type AutonomyDoctorService = ReturnType<typeof createAutonomyDoctorService>;
