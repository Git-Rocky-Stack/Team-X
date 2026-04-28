import { type FormEvent, useMemo, useState } from 'react';

import type {
  Company,
  CompanyCloudLinkStatus,
  OperatorAccessEntry,
  OperatorInvite,
  OperatorMembershipRole,
  SharedOperatorAuthMode,
} from '@team-x/shared-types';
import {
  BadgeDollarSign,
  Bot,
  BrainCircuit,
  CheckSquare2,
  Clock3,
  FolderKanban,
  Gauge,
  ShieldCheck,
  Stethoscope,
  Workflow,
} from 'lucide-react';

import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import {
  useCloudWorkspaceLink,
  useLinkWorkspace,
  useReconnectWorkspace,
  useUnlinkWorkspace,
} from '@/hooks/use-cloud-link.js';
import {
  useAcceptOperatorInvite,
  useCreateOperatorInvite,
  useOperatorInvites,
  useOperators,
  useRevokeOperatorInvite,
  useSharingReadiness,
} from '@/hooks/use-operators.js';
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
import { AutonomyBenchmarkPanel } from './autonomy-benchmark-panel.js';
import { AutonomyDoctorPanel } from './autonomy-doctor-panel.js';
import { BudgetsPanel } from './budgets-panel.js';
import { MemoryPanel } from './memory-panel.js';
import { RoutinesPanel } from './routines-panel.js';
import { RuntimeOperationsPanel } from './runtime-operations-panel.js';
import { RuntimeProfilesPanel } from './runtime-profiles-panel.js';

type AutonomySubview =
  | 'doctor'
  | 'benchmarks'
  | 'runtimes'
  | 'routines'
  | 'budgets'
  | 'approvals'
  | 'artifacts'
  | 'memory'
  | 'access';

const AUTONOMY_SUBVIEWS: Array<{
  value: AutonomySubview;
  label: string;
  icon: typeof Bot;
}> = [
  { value: 'doctor', label: 'Doctor', icon: Stethoscope },
  { value: 'benchmarks', label: 'Benchmarks', icon: Gauge },
  { value: 'runtimes', label: 'Runtimes', icon: Bot },
  { value: 'routines', label: 'Routines', icon: Clock3 },
  { value: 'budgets', label: 'Budgets', icon: BadgeDollarSign },
  { value: 'approvals', label: 'Approvals', icon: CheckSquare2 },
  { value: 'artifacts', label: 'Artifacts', icon: FolderKanban },
  { value: 'memory', label: 'Memory', icon: BrainCircuit },
  { value: 'access', label: 'Access', icon: ShieldCheck },
];

const ACCESS_FIELD_CLASSNAME =
  'h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-white/20';
const ACCESS_TEXTAREA_CLASSNAME =
  'min-h-[96px] w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-white/20';
const ACCESS_LABEL_CLASSNAME =
  'text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground';
const OPERATOR_INVITE_AUTH_MODE_OPTIONS: SharedOperatorAuthMode[] = ['invited', 'cloud'];
const OPERATOR_INVITE_ROLE_OPTIONS: OperatorMembershipRole[] = ['operator', 'reviewer', 'admin'];

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
      'Inspect live runtime heartbeats and ticket checkouts, then bind employees to named execution profiles for internal, local, and external agents.',
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
  memory: {
    title: 'Long-Run Memory',
    description:
      'Inspect condensed thread digests, resumable checkpoints, and packed-context posture before long sessions drift into raw unbounded history.',
    emptyTitle: 'No memory surface is ready yet',
    emptyDescription:
      'Pick a thread with recent work so Team-X can show the current digest, checkpoint trail, and bounded context pack for that conversation.',
  },
  access: {
    title: 'Operators And Access',
    description:
      'Operators supervise the workforce. This foundation keeps Team-X local-first while making company-scoped memberships explicit and cloud-ready.',
    emptyTitle: 'No operators resolved for this workspace',
    emptyDescription:
      'A local owner should be bootstrapped automatically. If this list stays empty, the operator-access foundation did not initialize correctly.',
  },
  doctor: {
    title: 'Autonomy Doctor',
    description:
      'Run the operator health workflow for database integrity, recovery readiness, runtime posture, secrets, provider health, MCP health, and budget blockers.',
    emptyTitle: 'Autonomy Doctor has no report',
    emptyDescription:
      'Run the doctor workflow to produce a deterministic JSON-ready health report for this workspace.',
  },
  benchmarks: {
    title: 'Autonomy Benchmarks',
    description:
      'Replay the Paperclip-grade runtime scenarios against Team-X control-plane mechanics and inspect pass rates, recovery timing, duplicate-work prevention, spend, and artifact evidence.',
    emptyTitle: 'No benchmark report is ready yet',
    emptyDescription:
      'Run the deterministic harness to produce a repeatable autonomy report for this workspace.',
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

function sharingModeLabel(mode: 'local' | 'invited' | 'cloud'): string {
  switch (mode) {
    case 'invited':
      return 'invited';
    case 'cloud':
      return 'cloud';
    default:
      return 'local';
  }
}

function sharingReadinessTone(
  readiness: 'ready' | 'warning' | 'blocked',
): 'default' | 'accent' | 'danger' {
  switch (readiness) {
    case 'ready':
      return 'accent';
    case 'warning':
      return 'default';
    default:
      return 'danger';
  }
}

function inviteStatusTone(
  status: OperatorInvite['status'],
): 'default' | 'accent' | 'warning' | 'danger' {
  switch (status) {
    case 'accepted':
      return 'accent';
    case 'expired':
      return 'danger';
    case 'pending':
      return 'warning';
    default:
      return 'default';
  }
}

function cloudLinkTone(
  state: CompanyCloudLinkStatus['state'],
): 'default' | 'accent' | 'warning' | 'danger' {
  switch (state) {
    case 'linked':
      return 'accent';
    case 'sync-paused':
      return 'warning';
    case 'sync-degraded':
      return 'danger';
    default:
      return 'default';
  }
}

function cloudLinkStateLabel(state: CompanyCloudLinkStatus['state']): string {
  switch (state) {
    case 'sync-paused':
      return 'sync paused';
    case 'sync-degraded':
      return 'sync degraded';
    default:
      return state;
  }
}

function cloudLinkDescription(link: CompanyCloudLinkStatus | null): string {
  if (!link) {
    return 'Resolve the current workspace link posture before changing shared/cloud access.';
  }
  switch (link.state) {
    case 'linked':
      return 'This workspace is locally linked and ready for hosted identity and event mirror follow-through.';
    case 'linking':
      return 'Team-X is reserving local linkage metadata for this workspace.';
    case 'unlinking':
      return 'Team-X is clearing local linkage metadata and returning to a fully local-only posture.';
    case 'sync-paused':
      return 'The workspace stays linked, but sync is intentionally paused until a future cloud session resumes it.';
    case 'sync-degraded':
      return link.lastSyncError?.trim()
        ? link.lastSyncError
        : 'The workspace is still linked, but the latest sync attempt degraded and needs a reconnect.';
    default:
      return 'This workspace is unlinked. Link it when you want explicit shared/cloud posture instead of local-only execution.';
  }
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

function membershipSourceLabel(entry: OperatorAccessEntry): string {
  return entry.membership.sourceKind === 'hosted' ? 'hosted membership' : 'local membership';
}

function membershipSourceDescription(entry: OperatorAccessEntry): string | null {
  if (entry.membership.sourceKind !== 'hosted') return null;
  if (entry.membership.cloudWorkspaceId?.trim()) {
    return `Hosted membership mirrored from ${entry.membership.cloudWorkspaceId}.`;
  }
  return 'Hosted membership mirrored from the linked workspace.';
}

function inviteSourceLabel(invite: OperatorInvite): string {
  return invite.sourceKind === 'hosted' ? 'hosted invite' : 'local invite';
}

function AccessList({ entries }: { entries: readonly OperatorAccessEntry[] }) {
  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const privileges = capabilityBadges(entry);
        const sourceDescription = membershipSourceDescription(entry);

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
                  <MissionPill>{membershipSourceLabel(entry)}</MissionPill>
                  {entry.operator.id === 'rocky' ? <MissionPill>local owner</MissionPill> : null}
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  {entry.operator.email?.trim() ? entry.operator.email : authModeDescription(entry)}
                </p>
                {sourceDescription ? (
                  <p className="text-xs leading-5 text-muted-foreground">{sourceDescription}</p>
                ) : null}
              </div>
              <div className="flex max-w-xl flex-wrap items-center justify-end gap-2">
                {privileges.length > 0 ? (
                  privileges.map((privilege) => (
                    <MissionPill key={privilege}>{privilege}</MissionPill>
                  ))
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
  const openSettingsSection = useAppStore((state) => state.openSettingsSection);
  const operatorsQuery = useOperators(companyId);
  const cloudLinkQuery = useCloudWorkspaceLink(companyId);
  const linkWorkspaceMutation = useLinkWorkspace(companyId);
  const unlinkWorkspaceMutation = useUnlinkWorkspace(companyId);
  const reconnectWorkspaceMutation = useReconnectWorkspace(companyId);
  const sharingReadinessQuery = useSharingReadiness(companyId);
  const invitesQuery = useOperatorInvites(companyId);
  const acceptInviteMutation = useAcceptOperatorInvite(companyId);
  const createInviteMutation = useCreateOperatorInvite(companyId);
  const revokeInviteMutation = useRevokeOperatorInvite(companyId);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteDisplayName, setInviteDisplayName] = useState('');
  const [inviteAuthMode, setInviteAuthMode] = useState<SharedOperatorAuthMode>('invited');
  const [inviteRole, setInviteRole] = useState<OperatorMembershipRole>('operator');
  const [inviteNote, setInviteNote] = useState('');
  const entries = operatorsQuery.data ?? [];
  const invites = invitesQuery.data ?? [];
  const accessSummary = useMemo(() => summarizeAccess(entries), [entries]);
  const pendingInvites = useMemo(
    () => invites.filter((invite) => invite.status === 'pending'),
    [invites],
  );
  const activeCopy = SUBVIEW_COPY[activeSubview];
  const sharingReadiness = sharingReadinessQuery.data ?? null;
  const cloudLink = cloudLinkQuery.data ?? null;
  const cloudLinkBusy =
    linkWorkspaceMutation.isPending ||
    unlinkWorkspaceMutation.isPending ||
    reconnectWorkspaceMutation.isPending;

  async function handleCreateInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyId) return;
    await createInviteMutation.mutateAsync({
      companyId,
      email: inviteEmail,
      displayName: inviteDisplayName || undefined,
      authMode: inviteAuthMode,
      role: inviteRole,
      note: inviteNote || undefined,
    });
    setInviteEmail('');
    setInviteDisplayName('');
    setInviteAuthMode('invited');
    setInviteRole('operator');
    setInviteNote('');
  }

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
            label="Sharing mode"
            value={
              sharingReadinessQuery.isLoading
                ? '...'
                : sharingReadiness
                  ? sharingModeLabel(sharingReadiness.configuredMode)
                  : postureLabel(accessSummary)
            }
            hint="Configured workspace sharing posture"
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
        <MissionSectionCard title={activeCopy.title} description={activeCopy.description}>
          {activeSubview === 'doctor' ? (
            <AutonomyDoctorPanel companyId={companyId} />
          ) : activeSubview === 'benchmarks' ? (
            <AutonomyBenchmarkPanel companyId={companyId} />
          ) : activeSubview === 'access' ? (
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
              <div className="space-y-4">
                <MissionInsetSurface className="space-y-4 p-4" data-cloud-link-card="">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-foreground">Linked Workspace</div>
                    <p className="text-xs leading-5 text-muted-foreground">
                      Explicitly link or unlink this workspace before the hosted identity and sync
                      layers land. This slice is local-only but durable, so the operator posture is
                      honest now instead of placeholder copy.
                    </p>
                  </div>
                  {cloudLinkQuery.isLoading ? (
                    <p className="text-xs leading-5 text-muted-foreground">
                      Resolving linked-workspace posture...
                    </p>
                  ) : cloudLinkQuery.isError || !cloudLink ? (
                    <p className="text-xs leading-5 text-red-200">
                      Linked-workspace posture could not be loaded for this workspace.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <MissionPill tone={cloudLinkTone(cloudLink.state)}>
                          {cloudLinkStateLabel(cloudLink.state)}
                        </MissionPill>
                        <MissionPill>{cloudLink.isLinked ? 'linked' : 'unlinked'}</MissionPill>
                        <MissionPill>{cloudLink.deviceId}</MissionPill>
                      </div>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {cloudLinkDescription(cloudLink)}
                      </p>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-3">
                          <div className={ACCESS_LABEL_CLASSNAME}>Cloud Workspace Id</div>
                          <div className="mt-2 break-all text-xs text-foreground">
                            {cloudLink.cloudWorkspaceId ?? 'Not reserved yet'}
                          </div>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-3">
                          <div className={ACCESS_LABEL_CLASSNAME}>Last Sync</div>
                          <div className="mt-2 text-xs text-foreground">
                            {cloudLink.lastSyncAt
                              ? new Date(cloudLink.lastSyncAt).toLocaleString()
                              : 'No successful sync recorded yet'}
                          </div>
                        </div>
                      </div>
                      {cloudLink.lastSyncError ? (
                        <p className="text-xs leading-5 text-red-200">{cloudLink.lastSyncError}</p>
                      ) : null}
                      {linkWorkspaceMutation.isError ? (
                        <p className="text-xs leading-5 text-red-200">
                          {linkWorkspaceMutation.error instanceof Error
                            ? linkWorkspaceMutation.error.message
                            : 'Workspace link failed.'}
                        </p>
                      ) : null}
                      {unlinkWorkspaceMutation.isError ? (
                        <p className="text-xs leading-5 text-red-200">
                          {unlinkWorkspaceMutation.error instanceof Error
                            ? unlinkWorkspaceMutation.error.message
                            : 'Workspace unlink failed.'}
                        </p>
                      ) : null}
                      {reconnectWorkspaceMutation.isError ? (
                        <p className="text-xs leading-5 text-red-200">
                          {reconnectWorkspaceMutation.error instanceof Error
                            ? reconnectWorkspaceMutation.error.message
                            : 'Workspace reconnect failed.'}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs leading-5 text-muted-foreground">
                          Link reserves stable local cloud ids now. Hosted auth and event sync land
                          in the next shared/cloud slices.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            onClick={() => {
                              void linkWorkspaceMutation.mutateAsync();
                            }}
                            disabled={!cloudLink.canLink || cloudLinkBusy}
                          >
                            {linkWorkspaceMutation.isPending ? 'Linking...' : 'Link Workspace'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-white/10 bg-black/10 hover:bg-black/20"
                            onClick={() => {
                              void reconnectWorkspaceMutation.mutateAsync();
                            }}
                            disabled={!cloudLink.isLinked || cloudLinkBusy}
                          >
                            {reconnectWorkspaceMutation.isPending ? 'Reconnecting...' : 'Reconnect'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-white/10 bg-black/10 hover:bg-black/20"
                            onClick={() => {
                              void unlinkWorkspaceMutation.mutateAsync();
                            }}
                            disabled={!cloudLink.canUnlink || cloudLinkBusy}
                          >
                            {unlinkWorkspaceMutation.isPending
                              ? 'Unlinking...'
                              : 'Unlink Workspace'}
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </MissionInsetSurface>
                <MissionInsetSurface className="space-y-4 p-4" data-operator-invites="">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-foreground">
                      Queue Operator Invite
                    </div>
                    <p className="text-xs leading-5 text-muted-foreground">
                      Linked workspaces queue hosted invites automatically. Unlinked workspaces keep
                      local placeholders until shared/cloud auth is fully active.
                    </p>
                  </div>
                  <form
                    className="space-y-4"
                    data-operator-invite-compose=""
                    onSubmit={(event) => {
                      void handleCreateInvite(event);
                    }}
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-2" htmlFor="operator-invite-email">
                        <div className={ACCESS_LABEL_CLASSNAME}>Operator Email</div>
                        <Input
                          id="operator-invite-email"
                          className={ACCESS_FIELD_CLASSNAME}
                          type="email"
                          value={inviteEmail}
                          onChange={(event) => setInviteEmail(event.target.value)}
                          placeholder="operator@strategia-x.com"
                          required
                        />
                      </label>
                      <label className="space-y-2" htmlFor="operator-invite-display-name">
                        <div className={ACCESS_LABEL_CLASSNAME}>Display Name</div>
                        <Input
                          id="operator-invite-display-name"
                          className={ACCESS_FIELD_CLASSNAME}
                          value={inviteDisplayName}
                          onChange={(event) => setInviteDisplayName(event.target.value)}
                          placeholder="Alex Morgan"
                        />
                      </label>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-2" htmlFor="operator-invite-auth-mode">
                        <div className={ACCESS_LABEL_CLASSNAME}>Auth Mode</div>
                        <select
                          id="operator-invite-auth-mode"
                          className={ACCESS_FIELD_CLASSNAME}
                          value={inviteAuthMode}
                          onChange={(event) =>
                            setInviteAuthMode(event.target.value as SharedOperatorAuthMode)
                          }
                        >
                          {OPERATOR_INVITE_AUTH_MODE_OPTIONS.map((mode) => (
                            <option key={mode} value={mode}>
                              {mode}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-2" htmlFor="operator-invite-role">
                        <div className={ACCESS_LABEL_CLASSNAME}>Workspace Role</div>
                        <select
                          id="operator-invite-role"
                          className={ACCESS_FIELD_CLASSNAME}
                          value={inviteRole}
                          onChange={(event) =>
                            setInviteRole(event.target.value as OperatorMembershipRole)
                          }
                        >
                          {OPERATOR_INVITE_ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="space-y-2" htmlFor="operator-invite-note">
                      <div className={ACCESS_LABEL_CLASSNAME}>Invite Note</div>
                      <textarea
                        id="operator-invite-note"
                        className={ACCESS_TEXTAREA_CLASSNAME}
                        value={inviteNote}
                        onChange={(event) => setInviteNote(event.target.value)}
                        placeholder="Optional context for why this operator is being added to the workspace."
                      />
                    </label>
                    {createInviteMutation.isError ? (
                      <p className="text-xs leading-5 text-red-200">
                        {createInviteMutation.error instanceof Error
                          ? createInviteMutation.error.message
                          : 'The operator invite could not be created.'}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs leading-5 text-muted-foreground">
                        Pending invites do not create membership yet. They make the intended shared
                        operator posture explicit now.
                      </p>
                      <Button type="submit" disabled={createInviteMutation.isPending}>
                        {createInviteMutation.isPending ? 'Creating invite...' : 'Create invite'}
                      </Button>
                    </div>
                  </form>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-foreground">
                        Invite Queue ({invites.length})
                      </div>
                      <MissionPill tone={pendingInvites.length > 0 ? 'warning' : 'accent'}>
                        {pendingInvites.length} pending
                      </MissionPill>
                    </div>
                    {invitesQuery.isLoading ? (
                      <p className="text-xs leading-5 text-muted-foreground">
                        Loading operator invites...
                      </p>
                    ) : invitesQuery.isError ? (
                      <p className="text-xs leading-5 text-red-200">
                        Operator invites could not be loaded for this workspace.
                      </p>
                    ) : invites.length === 0 ? (
                      <p className="text-xs leading-5 text-muted-foreground">
                        No operator invites have been queued for this workspace yet.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {invites.map((invite) => {
                          const isAccepting =
                            acceptInviteMutation.isPending &&
                            acceptInviteMutation.variables?.inviteId === invite.id;
                          const isRevoking =
                            revokeInviteMutation.isPending &&
                            revokeInviteMutation.variables?.inviteId === invite.id;
                          return (
                            <MissionInsetSurface
                              key={invite.id}
                              className="space-y-3 p-4"
                              data-operator-invite={invite.id}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-semibold text-foreground">
                                      {invite.displayName?.trim()
                                        ? invite.displayName
                                        : invite.email}
                                    </span>
                                    <MissionPill>{invite.authMode}</MissionPill>
                                    <MissionPill>{invite.role}</MissionPill>
                                    <MissionPill>{inviteSourceLabel(invite)}</MissionPill>
                                    <MissionPill tone={inviteStatusTone(invite.status)}>
                                      {invite.status}
                                    </MissionPill>
                                  </div>
                                  <p className="text-xs leading-5 text-muted-foreground">
                                    {invite.email}
                                  </p>
                                  {invite.sourceKind === 'hosted' ? (
                                    <p className="text-xs leading-5 text-muted-foreground">
                                      {invite.cloudWorkspaceId?.trim()
                                        ? `Hosted invite tracked for ${invite.cloudWorkspaceId}.`
                                        : 'Hosted invite tracked for the linked workspace.'}
                                    </p>
                                  ) : null}
                                  {invite.note ? (
                                    <p className="text-xs leading-5 text-muted-foreground">
                                      {invite.note}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="space-y-2 text-right">
                                  <p className="text-xs leading-5 text-muted-foreground">
                                    Created {new Date(invite.createdAt).toLocaleString()}
                                  </p>
                                  {invite.status === 'pending' ? (
                                    <div className="flex flex-wrap justify-end gap-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        disabled={isAccepting || isRevoking}
                                        onClick={() => {
                                          void acceptInviteMutation.mutateAsync({
                                            inviteId: invite.id,
                                          });
                                        }}
                                      >
                                        {isAccepting ? 'Accepting...' : 'Accept locally'}
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="border-white/10 bg-black/10 hover:bg-black/20"
                                        disabled={isAccepting || isRevoking}
                                        onClick={() => {
                                          void revokeInviteMutation.mutateAsync({
                                            inviteId: invite.id,
                                          });
                                        }}
                                      >
                                        {isRevoking ? 'Revoking...' : 'Revoke'}
                                      </Button>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </MissionInsetSurface>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </MissionInsetSurface>
                <AccessList entries={entries} />
              </div>
            )
          ) : activeSubview === 'runtimes' ? (
            <div className="space-y-4">
              <RuntimeOperationsPanel companyId={companyId} />
              <RuntimeProfilesPanel companyId={companyId} />
            </div>
          ) : activeSubview === 'routines' ? (
            <RoutinesPanel companyId={companyId} />
          ) : activeSubview === 'budgets' ? (
            <BudgetsPanel companyId={companyId} company={company} />
          ) : activeSubview === 'approvals' ? (
            <ApprovalsPanel companyId={companyId} />
          ) : activeSubview === 'artifacts' ? (
            <ArtifactsPanel companyId={companyId} />
          ) : activeSubview === 'memory' ? (
            <MemoryPanel companyId={companyId} />
          ) : (
            <MissionStateBlock
              title={activeCopy.emptyTitle}
              description={activeCopy.emptyDescription}
              icon={
                AUTONOMY_SUBVIEWS.find((item) => item.value === activeSubview)?.icon ?? Workflow
              }
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
                  <span className="font-semibold text-foreground">
                    {accessSummary.localOperators}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Invited operators</span>
                  <span className="font-semibold text-foreground">
                    {accessSummary.invitedOperators}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Cloud operators</span>
                  <span className="font-semibold text-foreground">
                    {accessSummary.cloudOperators}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Pending invites</span>
                  <span className="font-semibold text-foreground">{pendingInvites.length}</span>
                </div>
              </div>
            </MissionInsetSurface>
            <MissionInsetSurface className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <MissionPill tone={cloudLinkTone(cloudLink?.state ?? 'unlinked')}>
                  {cloudLink ? cloudLinkStateLabel(cloudLink.state) : 'link unknown'}
                </MissionPill>
                <MissionPill>{cloudLink?.cloudWorkspaceId ?? 'no workspace id'}</MissionPill>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {cloudLinkDescription(cloudLink)}
              </p>
            </MissionInsetSurface>
            <p className="text-xs leading-5 text-muted-foreground">
              {postureDescription(accessSummary)}
            </p>
            <MissionInsetSurface className="p-4">
              {sharingReadinessQuery.isLoading ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  Resolving sharing readiness...
                </p>
              ) : sharingReadinessQuery.isError || !sharingReadiness ? (
                <p className="text-xs leading-5 text-red-200">
                  Sharing readiness is unavailable for this workspace.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <MissionPill tone="accent">
                      configured {sharingModeLabel(sharingReadiness.configuredMode)}
                    </MissionPill>
                    <MissionPill>
                      effective {sharingModeLabel(sharingReadiness.effectiveMode)}
                    </MissionPill>
                    <MissionPill tone={sharingReadinessTone(sharingReadiness.readiness)}>
                      {sharingReadiness.readiness}
                    </MissionPill>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {sharingReadiness.lastExportedAt
                      ? `Last export ${new Date(sharingReadiness.lastExportedAt).toLocaleString()}`
                      : 'No workspace export or template has been recorded yet.'}
                  </p>
                  {sharingReadiness.missingRequirements.length > 0 ? (
                    <div className="space-y-1 text-xs leading-5 text-muted-foreground">
                      {sharingReadiness.missingRequirements.map((requirement) => (
                        <p key={requirement}>- {requirement}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs leading-5 text-emerald-300">
                      The configured sharing posture is ready on this workspace.
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-white/10 bg-black/10 hover:bg-black/20"
                    onClick={() => openSettingsSection('portability')}
                  >
                    Open portability
                  </Button>
                </div>
              )}
            </MissionInsetSurface>
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
              <p>
                Runtime profiles, routines, budgets, approvals, and artifacts are now active slices
                of the control plane.
              </p>
              <p>
                Memory inspection now makes digests, checkpoints, and packed context visible. The
                remaining hardening work is about richer operator membership flows, thread-level
                actions, and resume indicators across the rest of the mission shell.
              </p>
              <p>
                Use the User Guide and Mission Control links to keep autonomy visible instead of
                burying governance behind one isolated tab.
              </p>
            </MissionInsetSurface>
          </MissionRailCard>
        </div>
      </div>
    </MissionPageShell>
  );
}
