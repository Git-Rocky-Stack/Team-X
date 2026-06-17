import type { AutonomyDoctorFindingSeverity, AutonomyDoctorStatus } from '@team-x/shared-types';
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert } from 'lucide-react';

import {
  LampTile,
  type LampTone,
  MetricTile,
  RecessedWell,
  SubviewState,
  Tag,
  VuMeter,
} from '@/components/console/index.js';
import { useAutonomyDoctor } from '@/hooks/use-autonomy-doctor.js';

function statusTone(status: AutonomyDoctorStatus): LampTone {
  if (status === 'blocked') return 'nogo';
  if (status === 'warning') return 'hold';
  return 'go';
}

function severityTone(severity: AutonomyDoctorFindingSeverity): LampTone {
  if (severity === 'blocked') return 'nogo';
  if (severity === 'warning') return 'hold';
  return 'off';
}

function formatTimestamp(value: number): string {
  return new Date(value).toLocaleString();
}

export function AutonomyDoctorPanel({ companyId }: { companyId: string }) {
  const doctorQuery = useAutonomyDoctor(companyId);
  const report = doctorQuery.data;

  if (doctorQuery.isLoading) {
    return (
      <SubviewState
        lampLabel="STBY"
        lampTone="off"
        title="Running Autonomy Doctor"
        description="Team-X is checking database integrity, runtime posture, secrets, providers, budgets, MCP health, and recovery readiness."
      />
    );
  }

  if (doctorQuery.isError || !report) {
    return (
      <SubviewState
        lampLabel="NO-GO"
        lampTone="nogo"
        title="Autonomy Doctor could not run"
        description="The doctor workflow is wired, but the report could not be generated for this workspace. Inspect the main-process logs before launching new unattended runtime work."
      />
    );
  }

  return (
    <div className="space-y-4" data-autonomy-doctor-panel="">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-h2 text-foreground">Autonomy Doctor</h2>
            <LampTile
              label={report.status}
              tone={statusTone(report.status)}
              small
              interactive={false}
            />
          </div>
          <p className="text-caption text-muted-foreground">
            Last checked {formatTimestamp(report.generatedAt)}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <VuMeter
            className="w-40"
            value={report.checks.length > 0 ? report.totals.ok / report.checks.length : 0}
            label="Doctor checks passing"
          />
          <button
            type="button"
            title="Rerun Autonomy Doctor"
            onClick={() => {
              void doctorQuery.refetch();
            }}
            disabled={doctorQuery.isFetching}
            className="cap flex h-10 w-10 items-center justify-center disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <MetricTile
          label="Checks"
          value={String(report.checks.length)}
          hint="Operator health gates"
          icon={Activity}
        />
        <MetricTile
          label="Clear"
          value={String(report.totals.ok)}
          hint="No action required"
          icon={CheckCircle2}
        />
        <MetricTile
          label="Warnings"
          value={String(report.totals.warning)}
          hint="Review before long runs"
          icon={AlertTriangle}
          tone={report.totals.warning > 0 ? 'amber' : undefined}
        />
        <MetricTile
          label="Blocked"
          value={String(report.totals.blocked)}
          hint="Resolve before launch"
          icon={ShieldAlert}
          tone={report.totals.blocked > 0 ? 'red' : undefined}
        />
      </div>

      <div className="grid gap-3">
        {report.checks.map((check) => {
          return (
            <RecessedWell
              key={check.id}
              className="space-y-3 p-4"
              data-autonomy-doctor-check={check.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-body-strong text-foreground">{check.label}</span>
                    <LampTile
                      label={check.status}
                      tone={statusTone(check.status)}
                      small
                      interactive={false}
                    />
                  </div>
                  <p className="text-caption text-muted-foreground">{check.summary}</p>
                </div>
                <Tag mono>{formatTimestamp(check.checkedAt)}</Tag>
              </div>

              {check.findings.length === 0 ? (
                <RecessedWell className="px-3 py-2 text-caption text-muted-foreground">
                  No findings for this check.
                </RecessedWell>
              ) : (
                <div className="space-y-2">
                  {check.findings.map((finding) => (
                    <RecessedWell
                      key={finding.id}
                      className="px-3 py-3"
                      data-autonomy-doctor-finding={finding.id}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-body-strong text-foreground">
                              {finding.title}
                            </span>
                            <LampTile
                              label={finding.severity}
                              tone={severityTone(finding.severity)}
                              small
                              interactive={false}
                            />
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
                            <Tag key={ref} mono>
                              {ref}
                            </Tag>
                          ))}
                        </div>
                      ) : null}
                    </RecessedWell>
                  ))}
                </div>
              )}
            </RecessedWell>
          );
        })}
      </div>
    </div>
  );
}
