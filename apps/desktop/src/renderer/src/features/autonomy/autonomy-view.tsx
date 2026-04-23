import { useMemo } from 'react';

import type { Company, OperatorAccessEntry } from '@team-x/shared-types';
import {
  BadgeDollarSign,
  Bot,
  CheckSquare2,
  Clock3,
  FolderKanban,
  ShieldCheck,
  Workflow,
} from 'lucide-react';

import { Button } from '@/components/ui/button.js';
import { useOperators } from '@/hooks/use-operators.js';
import { useAppStore } from '@/store/app-store.js';

import {
  MissionControlRow,
  MissionHero,
  MissionInsetSurface,
  MissionMetricTile,
  MissionPageShell,
  MissionPill,
  MissionRailCard,
  MissionSectionCard,
  MissionSegmentedButton,
  MissionStateBlock,
} from '../mission/mission-shell.js';
import { ApprovalsPanel } from './approvals-panel.js';
import { ArtifactsPanel } from './artifacts-panel.js';
import { BudgetsPanel } from './budgets-panel.js';
import { RoutinesPanel } from './routines-panel.js';
import { RuntimeProfilesPanel } from './runtime-profiles-panel.js';

type AutonomySubview = 'runtimes' | 'routines' | 'budgets' | 'approvals' | 'artifacts' | 'access';

const AUTONOMY_SUBVIEWS: Array<{
  value: AutonomySubview;
  label: string;
  icon: typeof Bot;
}> = [
  { value: 'runtimes', label: 'Runtimes', icon: Bot },
  { value: 'routines', label: 'Routines', icon: Clock3 },
  { value: 'budgets', label: 'Budgets', icon: BadgeDollarSign },
  { value: 'approvals', label: 'Approvals', icon: CheckSquare2 },
  { value: 'artifacts', label: 'Artifacts', icon: FolderKanban },
  { value: 'access', label: 'Access', icon: ShieldCheck },
];

const SUBVIEW_COPY: Record<
  AutonomySubview,
  {
    title: string;
    description: string;
    emptyTitle: string;
    emptyDescription: string;
  }
> = {
  runtimes: {
    title: 'Agent Runtimes',
    description:
      'Bind employees to named runtime profiles so Team-X can distinguish internal execution, local launchers, and future hosted workers.',
    emptyTitle: 'Runtime profile control plane is empty',
    emptyDescription:
      'Create the first runtime profile, validate its health, and bind it to employees so the workspace has explicit execution posture.',
  },
  routines: {
    title: 'Recurring Routines',
    description:
      'Define recurring operating loops that become visible work instead of hidden background automation.',
    emptyTitle: 'Routine control plane is empty',
    emptyDescription:
      'Create the first cadence, bind the work template, and watch the resulting ticket runs materialize through the existing workforce path.',
  },
  budgets: {
    title: 'Budget Governance',
    description:
      'Turn spend and usage into explicit control policy with warnings, hard stops, and escalation thresholds.',
    emptyTitle: 'Budget policy follows the runtime and routine model',
    emptyDescription:
      'Monthly burn, pending approvals, and recent ledger entries now resolve from real run spend across company, employee, runtime, and routine scopes.',
  },
  approvals: {
    title: 'Approvals Inbox',
    description:
      'Unify authority, planner, budget, and routine decisions into one operator-facing decision queue.',
    emptyTitle: 'No approvals are pending right now',
    emptyDescription:
      'When budget gates trip or extensions request new authority, the resulting operator work appears here with rationale and recorded decisions.',
  },
  artifacts: {
    title: 'Artifacts And Outcomes',
    description:
      'Make reports, deliverables, generated assets, and execution outcomes first-class instead of scattering them across raw events and files.',
    emptyTitle: 'Artifacts will become the outcome layer',
    emptyDescription:
      'The artifact slice will attach concrete outputs to routines, approvals, reviews, and generated work so operators can supervise results, not only process.',
  },
  access: {
    title: 'Operators And Access',
    description:
      'Operators supervise the workforce. This foundation keeps Team-X local-first while making company-scoped memberships explicit and cloud-ready.',
    emptyTitle: 'No operators resolved for this workspace',
    emptyDescription:
      'A local owner should be bootstrapped automatically. If this list stays empty, the operator-access foundation did not initialize correctly.',
  },
};

interface AutonomyViewProps {
  company: Company | null;
  companyId: string | null;
}

function summarizeAccess(entries: readonly OperatorAccessEntry[]) {
  const owners = entries.filter((entry) => entry.membership.role === 'owner').length;
  const localOperators = entries.filter((entry) => entry.operator.authMode === 'local').length;
  const invitedOperators = entries.filter((entry) => entry.operator.authMode === 'invited').length;
  const cloudOperators = entries.filter((entry) => entry.operator.authMode === 'cloud').length;
  const privilegeCount = entries.filter(
    (entry) =>
      entry.membership.canApproveAuthority ||
      entry.membership.canApproveBudget ||
      entry.membership.canManageRoutines ||
      entry.membership.canManageRuntimes,
  ).length;

  return {
    owners,
    localOperators,
    invitedOperators,
    cloudOperators,
    privilegeCount,
  };
}

function postureLabel(summary: ReturnType<typeof summarizeAccess>): string {
  if (summary.cloudOperators > 0) return 'shared-cloud';
  if (summary.invitedOperators > 0) return 'shared-local';
  return 'local-only';
}

function postureDescription(summary: ReturnType<typeof summarizeAccess>): string {
  if (summary.cloudOperators > 0) {
    return 'Cloud-backed operators are modeled in this workspace. Team-X still runs local-first, but the identity model is ready for hosted supervision.';
  }
  if (summary.invitedOperators > 0) {
    return 'This workspace already has non-owner memberships, so the control plane is operating beyond the single-local-owner assumption.';
  }
  return 'This workspace is still local-only. The access model is explicit now, so invited or cloud operators can land later without rewriting the governance stack.';
}

function capabilityBadges(entry: OperatorAccessEntry): string[] {
  return [
    entry.membership.canApproveBudget ? 'Budget approvals' : null,
    entry.membership.canApproveAuthority ? 'Authority approvals' : null,
    entry.membership.canManageRoutines ? 'Routine management' : null,
    entry.membership.canManageRuntimes ? 'Runtime management' : null,
  ].filter((value): value is string => value !== null);
}

function authModeDescription(entry: OperatorAccessEntry): string {
  if (entry.operator.authMode === 'cloud') {
    return 'Cloud-backed operator identity placeholder for future hosted collaboration.';
  }
  if (entry.operator.authMode === 'invited') {
    return 'Invited operator identity modeled locally so shared access can land without changing the workspace contract.';
  }
  if (entry.operator.id === 'rocky') {
    return 'Bootstrapped local owner identity that keeps historical actions attributable while the app remains zero-login by default.';
  }
  return 'Local operator identity with no external login requirement.';
}

function AccessList({ entries }: { entries: readonly OperatorAccessEntry[] }) {
  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const privileges = capabilityBadges(entry);

        return (
          <MissionInsetSurface key={entry.membership.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {entry.operator.displayName}
                  </span>
                  <MissionPill tone="accent">{entry.membership.role}</MissionPill>
                  <MissionPill>{entry.operator.authMode}</MissionPill>
                  {entry.operator.id === 'rocky' ? <MissionPill>local owner</MissionPill> : null}
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  {entry.operator.email?.trim()
                    ? entry.operator.email
                    : authModeDescription(entry)}
                </p>
              </div>
              <div className="flex max-w-xl flex-wrap items-center justify-end gap-2">
                {privileges.length > 0 ? (
                  privileges.map((privilege) => <MissionPill key={privilege}>{privilege}</MissionPill>)
                ) : (
                  <span className="text-xs leading-5 text-muted-foreground">
                    No elevated governance capabilities are assigned to this membership.
                  </span>
                )}
              </div>
            </div>
          </MissionInsetSurface>
        );
      })}
    </div>
  );
}

export function AutonomyView({ company, companyId }: AutonomyViewProps) {
  const activeSubview = useAppStore((state) => state.autonomySubview);
  const setActiveSubview = useAppStore((state) => state.setAutonomySubview);
  const operatorsQuery = useOperators(companyId);
  const entries = operatorsQuery.data ?? [];
  const accessSummary = useMemo(() => summarizeAccess(entries), [entries]);
  const activeCopy = SUBVIEW_COPY[activeSubview];

  if (!companyId || !company) {
    return (
      <MissionPageShell data-autonomy-view="">
        <MissionHero
          title="Autonomy"
          eyebrow="Operator Control Plane"
          description="Autonomy becomes interactive once a workspace is active. Select or create a workspace first so Team-X can resolve operators, policies, and execution posture."
          icon={Workflow}
          meta={
            <>
              <MissionPill tone="accent">local-first</MissionPill>
              <MissionPill>multi-user ready</MissionPill>
              <MissionPill>cloud-ready seams</MissionPill>
            </>
          }
        />
        <MissionSectionCard>
          <MissionStateBlock
            title="Autonomy needs an active workspace"
            description="Pick a workspace from the switcher or create a new one to inspect operator access, future runtime bindings, and governance controls."
            icon={ShieldCheck}
          />
        </MissionSectionCard>
      </MissionPageShell>
    );
  }

  return (
    <MissionPageShell data-autonomy-view="">
      <MissionHero
        title="Autonomy"
        eyebrow="Operator Control Plane"
        description="Supervise runtime posture, recurring operations, budgets, approvals, artifacts, and access from one mission-language surface."
        icon={Workflow}
        meta={
          <>
            <MissionPill tone="accent">{company.name}</MissionPill>
            <MissionPill>{company.slug}</MissionPill>
            <MissionPill>local-first</MissionPill>
            <MissionPill>cloud-ready seams</MissionPill>
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          <MissionMetricTile
            label="Operators"
            value={operatorsQuery.isLoading ? '...' : String(entries.length)}
            hint="Company-scoped human supervisors"
            icon={ShieldCheck}
          />
          <MissionMetricTile
            label="Owners"
            value={operatorsQuery.isLoading ? '...' : String(accessSummary.owners)}
            hint="Auto-bootstrapped local control"
            icon={Workflow}
          />
          <MissionMetricTile
            label="Auth posture"
            value={
              operatorsQuery.isLoading
                ? '...'
                : postureLabel(accessSummary)
            }
            hint="Explicit operator identity model"
            icon={Bot}
          />
          <MissionMetricTile
            label="Governance-ready"
            value={operatorsQuery.isLoading ? '...' : String(accessSummary.privilegeCount)}
            hint="Memberships with elevated authority"
            icon={CheckSquare2}
          />
        </div>
      </MissionHero>

      <MissionSectionCard
        title="Autonomy Scope"
        description="This first slice ships the operator and access foundation plus the visible control-plane shell."
      >
        <MissionControlRow className="gap-2">
          {AUTONOMY_SUBVIEWS.map((subview) => {
            const Icon = subview.icon;
            return (
              <MissionSegmentedButton
                key={subview.value}
                active={subview.value === activeSubview}
                onClick={() => setActiveSubview(subview.value)}
                className="flex items-center gap-2"
                data-autonomy-subview={subview.value}
              >
                <Icon className="h-3.5 w-3.5" />
                {subview.label}
              </MissionSegmentedButton>
            );
          })}
        </MissionControlRow>
      </MissionSectionCard>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_360px]">
        <MissionSectionCard
          title={activeCopy.title}
          description={activeCopy.description}
        >
          {activeSubview === 'access' ? (
            operatorsQuery.isLoading ? (
              <MissionStateBlock
                title="Resolving operator access"
                description="Team-X is loading the operator memberships for this workspace."
                icon={ShieldCheck}
              />
            ) : operatorsQuery.isError ? (
              <MissionStateBlock
                title="Operator access could not load"
                description="The operator foundation exists in the main process, but this workspace access read failed. Retry from the view or inspect the main-process logs."
                icon={ShieldCheck}
                tone="danger"
              />
            ) : entries.length === 0 ? (
              <MissionStateBlock
                title={activeCopy.emptyTitle}
                description={activeCopy.emptyDescription}
                icon={ShieldCheck}
                tone="danger"
              />
            ) : (
              <AccessList entries={entries} />
            )
          ) : activeSubview === 'runtimes' ? (
            <RuntimeProfilesPanel companyId={companyId} />
          ) : activeSubview === 'routines' ? (
            <RoutinesPanel companyId={companyId} />
          ) : activeSubview === 'budgets' ? (
            <BudgetsPanel companyId={companyId} company={company} />
          ) : activeSubview === 'approvals' ? (
            <ApprovalsPanel companyId={companyId} />
          ) : activeSubview === 'artifacts' ? (
            <ArtifactsPanel companyId={companyId} />
          ) : (
            <MissionStateBlock
              title={activeCopy.emptyTitle}
              description={activeCopy.emptyDescription}
              icon={AUTONOMY_SUBVIEWS.find((item) => item.value === activeSubview)?.icon ?? Workflow}
            />
          )}
        </MissionSectionCard>

        <div className="space-y-4">
          <MissionRailCard
            title="Access Posture"
            description="Current workspace supervision footing"
          >
            <MissionInsetSurface className="p-4">
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span>Posture</span>
                  <span className="font-semibold uppercase tracking-[0.16em] text-foreground">
                    {postureLabel(accessSummary)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Local operators</span>
                  <span className="font-semibold text-foreground">{accessSummary.localOperators}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Invited operators</span>
                  <span className="font-semibold text-foreground">{accessSummary.invitedOperators}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Cloud operators</span>
                  <span className="font-semibold text-foreground">{accessSummary.cloudOperators}</span>
                </div>
              </div>
            </MissionInsetSurface>
            <p className="text-xs leading-5 text-muted-foreground">
              {postureDescription(accessSummary)}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/10 bg-black/10 hover:bg-black/20"
                onClick={() => setActiveSubview('approvals')}
              >
                Open approvals
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/10 bg-black/10 hover:bg-black/20"
                onClick={() => setActiveSubview('budgets')}
              >
                Open budgets
              </Button>
            </div>
          </MissionRailCard>

          <MissionRailCard
            title="What Lands Next"
            description="The next autonomy slices build on this shell"
          >
            <MissionInsetSurface className="space-y-3 p-4 text-sm leading-6 text-muted-foreground">
              <p>Runtime profiles, routines, budgets, approvals, and artifacts are now active slices of the control plane.</p>
              <p>The remaining hardening work is about shared transport seams, richer operator membership flows, and propagating autonomy signals into the rest of the mission shell.</p>
              <p>Use the User Guide and Mission Control links to keep autonomy visible instead of burying governance behind one isolated tab.</p>
            </MissionInsetSurface>
          </MissionRailCard>
        </div>
      </div>
    </MissionPageShell>
  );
}
