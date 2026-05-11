import type { AutonomyDoctorFindingSeverity, AutonomyDoctorStatus } from '@team-x/shared-types';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  Stethoscope,
} from 'lucide-react';

import {
  MissionControlRow,
  MissionIconButton,
  MissionInsetSurface,
  MissionMetricTile,
  MissionPill,
  MissionStateBlock,
} from '../mission/mission-shell.js';

import { useAutonomyDoctor } from '@/hooks/use-autonomy-doctor.js';

function statusTone(status: AutonomyDoctorStatus): 'accent' | 'warning' | 'danger' {
  if (status === 'blocked') return 'danger';
  if (status === 'warning') return 'warning';
  return 'accent';
}

function severityTone(severity: AutonomyDoctorFindingSeverity): 'default' | 'warning' | 'danger' {
  if (severity === 'blocked') return 'danger';
  if (severity === 'warning') return 'warning';
  return 'default';
}

function statusIcon(status: AutonomyDoctorStatus) {
  if (status === 'blocked') return ShieldAlert;
  if (status === 'warning') return AlertTriangle;
  return CheckCircle2;
}

function formatTimestamp(value: number): string {
  return new Date(value).toLocaleString();
}

export function AutonomyDoctorPanel({ companyId }: { companyId: string }) {
  const doctorQuery = useAutonomyDoctor(companyId);
  const report = doctorQuery.data;

  if (doctorQuery.isLoading) {
    return (
      <MissionStateBlock
        title="Running Autonomy Doctor"
        description="Team-X is checking database integrity, runtime posture, secrets, providers, budgets, MCP health, and recovery readiness."
        icon={Stethoscope}
      />
    );
  }

  if (doctorQuery.isError || !report) {
    return (
      <MissionStateBlock
        title="Autonomy Doctor could not run"
        description="The doctor workflow is wired, but the report could not be generated for this workspace. Inspect the main-process logs before launching new unattended runtime work."
        icon={ShieldAlert}
        tone="danger"
      />
    );
  }

  const StatusIcon = statusIcon(report.status);

  return (
    <div className="space-y-4" data-autonomy-doctor-panel="">
      <MissionControlRow className="justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusIcon className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-h2 text-foreground">Autonomy Doctor</h2>
            <MissionPill tone={statusTone(report.status)}>{report.status}</MissionPill>
          </div>
          <p className="text-caption text-muted-foreground">
            Last checked {formatTimestamp(report.generatedAt)}.
          </p>
        </div>
        <MissionIconButton
          title="Rerun Autonomy Doctor"
          onClick={() => {
            void doctorQuery.refetch();
          }}
          disabled={doctorQuery.isFetching}
        >
          <RefreshCw className="h-4 w-4" />
        </MissionIconButton>
      </MissionControlRow>

      <div className="grid gap-3 md:grid-cols-4">
        <MissionMetricTile
          label="Checks"
          value={String(report.checks.length)}
          hint="Operator health gates"
          icon={Activity}
        />
        <MissionMetricTile
          label="Clear"
          value={String(report.totals.ok)}
          hint="No action required"
          icon={CheckCircle2}
        />
        <MissionMetricTile
          label="Warnings"
          value={String(report.totals.warning)}
          hint="Review before long runs"
          icon={AlertTriangle}
        />
        <MissionMetricTile
          label="Blocked"
          value={String(report.totals.blocked)}
          hint="Resolve before launch"
          icon={ShieldAlert}
        />
      </div>

      <div className="grid gap-3">
        {report.checks.map((check) => {
          const CheckIcon = statusIcon(check.status);
          return (
            <MissionInsetSurface
              key={check.id}
              className="space-y-3 p-4"
              data-autonomy-doctor-check={check.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CheckIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-body-strong text-foreground">{check.label}</span>
                    <MissionPill tone={statusTone(check.status)}>{check.status}</MissionPill>
                  </div>
                  <p className="text-caption text-muted-foreground">{check.summary}</p>
                </div>
                <MissionPill mono>{formatTimestamp(check.checkedAt)}</MissionPill>
              </div>

              {check.findings.length === 0 ? (
                <div className="rounded-md border border-white/10 bg-black/10 px-3 py-2 text-caption text-muted-foreground">
                  No findings for this check.
                </div>
              ) : (
                <div className="space-y-2">
                  {check.findings.map((finding) => (
                    <div
                      key={finding.id}
                      className="rounded-md border border-white/10 bg-black/10 px-3 py-3"
                      data-autonomy-doctor-finding={finding.id}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-body-strong text-foreground">
                              {finding.title}
                            </span>
                            <MissionPill tone={severityTone(finding.severity)}>
                              {finding.severity}
                            </MissionPill>
                          </div>
                          <p className="text-caption text-muted-foreground">{finding.detail}</p>
                        </div>
                      </div>
                      {finding.action ? (
                        <p className="mt-2 text-caption text-foreground">{finding.action}</p>
                      ) : null}
                      {finding.refs.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {finding.refs.map((ref) => (
                            <MissionPill key={ref} mono>
                              {ref}
                            </MissionPill>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </MissionInsetSurface>
          );
        })}
      </div>
    </div>
  );
}
