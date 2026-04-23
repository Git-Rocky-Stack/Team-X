import { type FormEvent, useMemo, useState } from 'react';

import type {
  BudgetAlertLevel,
  BudgetPolicy,
  BudgetScopeKind,
  Company,
  Employee,
  Routine,
  RuntimeProfileSummary,
} from '@team-x/shared-types';
import { AlertTriangle, BadgeDollarSign, Ban, Clock3, ShieldAlert, Trash2 } from 'lucide-react';

import { useBudgetApprovals, useBudgetLedger, useBudgetOverview, useCreateBudgetPolicy, useDeleteBudgetPolicy, useUpdateBudgetPolicy } from '@/hooks/use-budgets.js';
import { useEmployees } from '@/hooks/use-employees.js';
import { useRoutines } from '@/hooks/use-routines.js';
import { useRuntimeProfiles } from '@/hooks/use-runtime-profiles.js';

import {
  MissionIconButton,
  MissionInsetSurface,
  MissionMetricTile,
  MissionPill,
  MissionStateBlock,
} from '../mission/mission-shell.js';

const FIELD_CLASSNAME =
  'h-11 w-full rounded-[16px] border border-white/10 bg-black/20 px-3 text-sm text-foreground outline-none transition focus:border-brand/30';
const LABEL_CLASSNAME = 'text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground';

interface BudgetPolicyDraft {
  scopeKind: BudgetScopeKind;
  scopeRefId: string;
  hardCapUsd: string;
  warningThresholdPct: string;
  autoPause: boolean;
  requireApprovalAboveUsd: string;
}

function emptyDraft(companyId: string): BudgetPolicyDraft {
  return {
    scopeKind: 'company',
    scopeRefId: companyId,
    hardCapUsd: '25',
    warningThresholdPct: '80',
    autoPause: false,
    requireApprovalAboveUsd: '',
  };
}

function formatUsd(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : '$0.00';
}

function formatTimestamp(value: number): string {
  return new Date(value).toLocaleString();
}

function alertTone(level: BudgetAlertLevel): 'default' | 'warning' | 'danger' | 'accent' {
  if (level === 'exceeded') return 'danger';
  if (level === 'warning' || level === 'approval-required') return 'warning';
  return 'accent';
}

function buildScopeLabel(
  scopeKind: BudgetScopeKind,
  scopeRefId: string,
  company: Company,
  employees: Employee[],
  runtimeProfiles: RuntimeProfileSummary[],
  routines: Routine[],
): string {
  if (scopeKind === 'company') return company.name;
  if (scopeKind === 'employee') {
    return employees.find((employee) => employee.id === scopeRefId)?.name ?? scopeRefId;
  }
  if (scopeKind === 'runtime-profile') {
    return runtimeProfiles.find((profile) => profile.id === scopeRefId)?.name ?? scopeRefId;
  }
  return routines.find((routine) => routine.id === scopeRefId)?.name ?? scopeRefId;
}

function PolicyCard({
  company,
  policy,
  employees,
  runtimeProfiles,
  routines,
  onToggleEnabled,
  onDelete,
  updating,
  deleting,
}: {
  company: Company;
  policy: NonNullable<ReturnType<typeof useBudgetOverview>['data']>['policySummaries'][number];
  employees: Employee[];
  runtimeProfiles: RuntimeProfileSummary[];
  routines: Routine[];
  onToggleEnabled: (policy: BudgetPolicy) => void;
  onDelete: (policyId: string) => void;
  updating: boolean;
  deleting: boolean;
}) {
  const scopeLabel = buildScopeLabel(
    policy.scopeKind,
    policy.scopeRefId,
    company,
    employees,
    runtimeProfiles,
    routines,
  );

  return (
    <MissionInsetSurface className="space-y-4 p-4" data-budget-policy={policy.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{scopeLabel}</span>
            <MissionPill tone="accent">{policy.scopeKind}</MissionPill>
            <MissionPill tone={alertTone(policy.alertLevel)}>{policy.alertLevel}</MissionPill>
            <MissionPill>{policy.enabled ? 'enabled' : 'disabled'}</MissionPill>
            {policy.autoPause ? <MissionPill tone="warning">auto-pause</MissionPill> : null}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Hard cap {formatUsd(policy.hardCapUsd)}. Current spend {formatUsd(policy.currentSpendUsd)}.
            {policy.approvalSpendUsd ? ` Approval gate ${formatUsd(policy.approvalSpendUsd)}.` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-full border border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-foreground transition hover:border-brand/30 hover:text-brand disabled:opacity-50"
            onClick={() => onToggleEnabled(policy)}
            disabled={updating}
          >
            {policy.enabled ? 'Disable' : 'Enable'}
          </button>
          <MissionIconButton
            tone="danger"
            title="Delete policy"
            disabled={deleting}
            onClick={() => onDelete(policy.id)}
          >
            <Trash2 className="h-4 w-4" />
          </MissionIconButton>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <MissionMetricTile
          label="Current Spend"
          value={formatUsd(policy.currentSpendUsd)}
          hint="Current monthly usage"
          icon={BadgeDollarSign}
        />
        <MissionMetricTile
          label="Remaining"
          value={formatUsd(policy.remainingUsd)}
          hint="Budget left before hard cap"
          icon={Clock3}
        />
        <MissionMetricTile
          label="Warning At"
          value={formatUsd(policy.warningSpendUsd)}
          hint={`${policy.warningThresholdPct}% threshold`}
          icon={AlertTriangle}
        />
        <MissionMetricTile
          label="Approval Gate"
          value={policy.approvalSpendUsd ? formatUsd(policy.approvalSpendUsd) : 'Off'}
          hint="Blocks autonomy until reviewed"
          icon={ShieldAlert}
        />
      </div>
    </MissionInsetSurface>
  );
}

export function BudgetsPanel({
  companyId,
  company,
}: {
  companyId: string;
  company: Company;
}) {
  const [draft, setDraft] = useState<BudgetPolicyDraft>(() => emptyDraft(companyId));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const employeesQuery = useEmployees(companyId);
  const runtimeProfilesQuery = useRuntimeProfiles(companyId);
  const routinesQuery = useRoutines(companyId);
  const overviewQuery = useBudgetOverview(companyId);
  const ledgerQuery = useBudgetLedger(companyId);
  const approvalsQuery = useBudgetApprovals(companyId);
  const createPolicy = useCreateBudgetPolicy(companyId);
  const updatePolicy = useUpdateBudgetPolicy(companyId);
  const deletePolicy = useDeleteBudgetPolicy(companyId);

  const employees = employeesQuery.data ?? [];
  const runtimeProfiles = runtimeProfilesQuery.data ?? [];
  const routines = routinesQuery.data ?? [];
  const overview = overviewQuery.data;
  const ledger = ledgerQuery.data ?? [];
  const approvals = approvalsQuery.data ?? [];

  const scopeOptions = useMemo(() => {
    if (draft.scopeKind === 'company') {
      return [{ id: company.id, label: company.name }];
    }
    if (draft.scopeKind === 'employee') {
      return employees.map((employee) => ({ id: employee.id, label: employee.name }));
    }
    if (draft.scopeKind === 'runtime-profile') {
      return runtimeProfiles.map((profile) => ({ id: profile.id, label: profile.name }));
    }
    return routines.map((routine) => ({ id: routine.id, label: routine.name }));
  }, [company.id, company.name, draft.scopeKind, employees, runtimeProfiles, routines]);

  const policySummaries = overview?.policySummaries ?? [];

  function handleScopeKindChange(scopeKind: BudgetScopeKind) {
    const nextDefault =
      scopeKind === 'company'
        ? company.id
        : scopeKind === 'employee'
          ? employees[0]?.id ?? ''
          : scopeKind === 'runtime-profile'
            ? runtimeProfiles[0]?.id ?? ''
            : routines[0]?.id ?? '';
    setDraft((current) => ({
      ...current,
      scopeKind,
      scopeRefId: nextDefault,
    }));
  }

  async function handleCreatePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    try {
      await createPolicy.mutateAsync({
        companyId,
        scopeKind: draft.scopeKind,
        scopeRefId: draft.scopeKind === 'company' ? company.id : draft.scopeRefId,
        hardCapUsd: draft.hardCapUsd,
        warningThresholdPct: Number.parseInt(draft.warningThresholdPct, 10),
        autoPause: draft.autoPause,
        requireApprovalAboveUsd:
          draft.requireApprovalAboveUsd.trim().length > 0 ? draft.requireApprovalAboveUsd : null,
      });
      setDraft(emptyDraft(companyId));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-4" data-budgets-panel="">
      <MissionInsetSurface className="space-y-4 p-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Create Budget Policy</h3>
          <p className="text-xs leading-5 text-muted-foreground">
            Budget policy uses real run spend from the current workspace. Company, employee,
            runtime, and routine scopes all roll up from the same ledger.
          </p>
        </div>
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" onSubmit={handleCreatePolicy}>
          <label className="space-y-2">
            <div className={LABEL_CLASSNAME}>Scope</div>
            <select
              className={FIELD_CLASSNAME}
              value={draft.scopeKind}
              onChange={(event) => handleScopeKindChange(event.target.value as BudgetScopeKind)}
            >
              <option value="company">Company</option>
              <option value="employee">Employee</option>
              <option value="runtime-profile">Runtime Profile</option>
              <option value="routine">Routine</option>
            </select>
          </label>
          <label className="space-y-2">
            <div className={LABEL_CLASSNAME}>Target</div>
            <select
              className={FIELD_CLASSNAME}
              value={draft.scopeKind === 'company' ? company.id : draft.scopeRefId}
              onChange={(event) => setDraft((current) => ({ ...current, scopeRefId: event.target.value }))}
              disabled={draft.scopeKind === 'company'}
            >
              {scopeOptions.length === 0 ? (
                <option value="">{draft.scopeKind === 'company' ? company.name : 'No target available yet'}</option>
              ) : (
                scopeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="space-y-2">
            <div className={LABEL_CLASSNAME}>Hard Cap USD</div>
            <input
              className={FIELD_CLASSNAME}
              value={draft.hardCapUsd}
              onChange={(event) => setDraft((current) => ({ ...current, hardCapUsd: event.target.value }))}
              placeholder="25"
            />
          </label>
          <label className="space-y-2">
            <div className={LABEL_CLASSNAME}>Warning Threshold %</div>
            <input
              className={FIELD_CLASSNAME}
              type="number"
              min={1}
              max={100}
              value={draft.warningThresholdPct}
              onChange={(event) =>
                setDraft((current) => ({ ...current, warningThresholdPct: event.target.value }))
              }
            />
          </label>
          <label className="space-y-2">
            <div className={LABEL_CLASSNAME}>Approval Above USD</div>
            <input
              className={FIELD_CLASSNAME}
              value={draft.requireApprovalAboveUsd}
              onChange={(event) =>
                setDraft((current) => ({ ...current, requireApprovalAboveUsd: event.target.value }))
              }
              placeholder="18"
            />
          </label>
          <label className="flex items-center gap-3 rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground">
            <input
              type="checkbox"
              checked={draft.autoPause}
              onChange={(event) => setDraft((current) => ({ ...current, autoPause: event.target.checked }))}
            />
            Pause company execution when this policy is exceeded
          </label>
          <div className="md:col-span-2 xl:col-span-3 flex flex-wrap items-center justify-between gap-3">
            {errorMessage ? (
              <MissionPill tone="danger">{errorMessage}</MissionPill>
            ) : (
              <span className="text-xs text-muted-foreground">
                Company scope uses the active workspace id automatically.
              </span>
            )}
            <button
              type="submit"
              className="rounded-full border border-brand/30 bg-brand/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand transition hover:border-brand/60 disabled:opacity-50"
              disabled={createPolicy.isPending}
            >
              {createPolicy.isPending ? 'Saving...' : 'Save Policy'}
            </button>
          </div>
        </form>
      </MissionInsetSurface>

      {overviewQuery.isLoading ? (
        <MissionStateBlock
          title="Loading budget governance"
          description="Team-X is assembling the monthly spend ledger and policy summaries for this workspace."
          icon={BadgeDollarSign}
        />
      ) : overviewQuery.isError ? (
        <MissionStateBlock
          title="Budget governance could not load"
          description="The budget service is wired, but the current workspace overview request failed."
          icon={BadgeDollarSign}
          tone="danger"
        />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MissionMetricTile
              label="Company Burn"
              value={overview ? formatUsd(overview.companySpendUsd) : '$0.00'}
              hint="Current monthly company spend"
              icon={BadgeDollarSign}
            />
            <MissionMetricTile
              label="Active Policies"
              value={overview ? String(overview.activePolicyCount) : '0'}
              hint="Enabled budget governance scopes"
              icon={Clock3}
            />
            <MissionMetricTile
              label="Warnings / Exceeded"
              value={overview ? `${overview.warningCount} / ${overview.exceededCount}` : '0 / 0'}
              hint="Threshold pressure right now"
              icon={AlertTriangle}
            />
            <MissionMetricTile
              label="Pending Approvals"
              value={overview ? String(overview.pendingApprovalCount) : '0'}
              hint="Budget exceptions awaiting operator attention"
              icon={ShieldAlert}
            />
          </div>

          <div className="space-y-3">
            {policySummaries.length === 0 ? (
              <MissionStateBlock
                title="No budget policies configured yet"
                description="Create the first policy above to turn telemetry and run cost into enforceable governance."
                icon={BadgeDollarSign}
              />
            ) : (
              policySummaries.map((policy) => (
                <PolicyCard
                  key={policy.id}
                  company={company}
                  policy={policy}
                  employees={employees}
                  runtimeProfiles={runtimeProfiles}
                  routines={routines}
                  updating={updatePolicy.isPending}
                  deleting={deletePolicy.isPending}
                  onToggleEnabled={(current) =>
                    updatePolicy.mutate({
                      policyId: current.id,
                      enabled: !current.enabled,
                    })
                  }
                  onDelete={(policyId) => deletePolicy.mutate(policyId)}
                />
              ))
            )}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
            <MissionInsetSurface className="space-y-3 p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">Recent Spend Ledger</h3>
                <p className="text-xs leading-5 text-muted-foreground">
                  Every row comes from completed runs and keeps scope attribution for company,
                  employee, runtime, and routine governance.
                </p>
              </div>
              {ledger.length === 0 ? (
                <MissionStateBlock
                  title="No budget ledger entries yet"
                  description="Spend appears here after completed runs land in the monthly ledger."
                  icon={Clock3}
                />
              ) : (
                <div className="space-y-2">
                  {ledger.map((entry) => (
                    <MissionInsetSurface key={entry.id} className="p-3" data-budget-ledger={entry.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">
                              {buildScopeLabel(entry.scopeKind, entry.scopeRefId, company, employees, runtimeProfiles, routines)}
                            </span>
                            <MissionPill>{entry.scopeKind}</MissionPill>
                            <MissionPill>{entry.runKind}</MissionPill>
                          </div>
                          <p className="text-xs leading-5 text-muted-foreground">
                            {entry.provider} / {entry.model} • {formatTimestamp(entry.occurredAt)}
                          </p>
                        </div>
                        <div className="text-sm font-semibold text-foreground">{formatUsd(entry.amountUsd)}</div>
                      </div>
                    </MissionInsetSurface>
                  ))}
                </div>
              )}
            </MissionInsetSurface>

            <div className="space-y-4">
              <MissionInsetSurface className="space-y-3 p-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">Pending Budget Approvals</h3>
                  <p className="text-xs leading-5 text-muted-foreground">
                    These approval items are raised automatically when spend crosses an approval
                    gate and future autonomy should stop until an operator reviews it. The same
                    queue is actionable from Autonomy {'>'} Approvals.
                  </p>
                </div>
                {approvals.length === 0 ? (
                  <MissionStateBlock
                    title="No budget approvals are pending"
                    description="Once a policy crosses its approval threshold, the request lands here."
                    icon={ShieldAlert}
                  />
                ) : (
                  <div className="space-y-2">
                    {approvals.map((approval) => (
                      <MissionInsetSurface key={approval.id} className="p-3" data-budget-approval={approval.id}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">{approval.summary}</span>
                              <MissionPill tone="warning">{approval.priority}</MissionPill>
                            </div>
                            <p className="text-xs leading-5 text-muted-foreground">
                              Created {formatTimestamp(approval.createdAt)}
                            </p>
                          </div>
                          <Ban className="h-4 w-4 text-amber-300" />
                        </div>
                      </MissionInsetSurface>
                    ))}
                  </div>
                )}
              </MissionInsetSurface>

              <MissionInsetSurface className="space-y-3 p-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">Provider Mix</h3>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Company-scope spend is aggregated into a monthly provider mix for fast drift
                    checks.
                  </p>
                </div>
                {overview?.providerMix.length ? (
                  overview.providerMix.map((row) => (
                    <div key={row.provider} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">{row.provider}</span>
                      <span className="font-semibold text-foreground">{formatUsd(row.amountUsd)}</span>
                    </div>
                  ))
                ) : (
                  <MissionStateBlock
                    title="No provider mix yet"
                    description="Provider distribution appears once completed runs have non-zero cost."
                    icon={BadgeDollarSign}
                  />
                )}
              </MissionInsetSurface>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
