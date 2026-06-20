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
import { type FormEvent, useMemo, useState } from 'react';

import { AgentImprovementPanel } from './agent-improvement-panel.js';
import { ApprovalsPanel } from './approvals-panel.js';
import { ArtifactsPanel } from './artifacts-panel.js';
import { AutonomyBenchmarkPanel } from './autonomy-benchmark-panel.js';
import { AutonomyDoctorPanel } from './autonomy-doctor-panel.js';
import { BudgetsPanel } from './budgets-panel.js';
import { MemoryPanel } from './memory-panel.js';
import { RoutinesPanel } from './routines-panel.js';
import { RuntimeOperationsPanel } from './runtime-operations-panel.js';
import { RuntimeProfilesPanel } from './runtime-profiles-panel.js';

import {
  Faceplate,
  LampTile,
  type LampTone,
  MetricTile,
  RecessedWell,
  SubviewState,
  Tag,
} from '@/components/console/index.js';
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
import { cn } from '@/lib/utils.js';
import { useAppStore } from '@/store/app-store.js';

type AutonomySubview =
  | 'doctor'
  | 'benchmarks'
  | 'improvement'
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
  { value: 'improvement', label: 'Improve', icon: BrainCircuit },
  { value: 'runtimes', label: 'Runtimes', icon: Bot },
  { value: 'routines', label: 'Routines', icon: Clock3 },
  { value: 'budgets', label: 'Budgets', icon: BadgeDollarSign },
  { value: 'approvals', label: 'Approvals', icon: CheckSquare2 },
  { value: 'artifacts', label: 'Artifacts', icon: FolderKanban },
  { value: 'memory', label: 'Memory', icon: BrainCircuit },
  { value: 'access', label: 'Access', icon: ShieldCheck },
];

const ACCESS_FIELD_CLASSNAME =
  'well-input flex h-10 w-full rounded-control px-3 text-body text-foreground focus-visible:outline-none placeholder:text-muted-foreground';
const ACCESS_TEXTAREA_CLASSNAME =
  'well-input flex min-h-[96px] w-full rounded-control px-3 py-2 text-body text-foreground focus-visible:outline-none placeholder:text-muted-foreground';
const ACCESS_LABEL_CLASSNAME = 'text-eyebrow text-muted-foreground';
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
  improvement: {
    title: 'Agent Improvement Loop',
    description:
      'Observe recent execution failures and stalled ticket patterns, then create deduped improvement tickets through the normal queue.',
    emptyTitle: 'No improvement loop data is ready yet',
    emptyDescription:
      'Run the self-improvement loop to inspect recent operational signals and open durable correction tickets when patterns appear.',
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

function sharingReadinessTone(readiness: 'ready' | 'warning' | 'blocked'): LampTone {
  switch (readiness) {
    case 'ready':
      return 'go';
    case 'warning':
      return 'hold';
    default:
      return 'nogo';
  }
}

function inviteStatusTone(status: OperatorInvite['status']): LampTone {
  switch (status) {
    case 'accepted':
      return 'go';
    case 'expired':
      return 'nogo';
    case 'pending':
      return 'hold';
    default:
      return 'off';
  }
}

function cloudLinkTone(state: CompanyCloudLinkStatus['state']): LampTone {
  switch (state) {
    case 'linked':
      return 'go';
    case 'sync-paused':
      return 'hold';
    case 'sync-degraded':
      return 'nogo';
    default:
      return 'off';
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
          <RecessedWell key={entry.membership.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-body-strong text-foreground">
                    {entry.operator.displayName}
                  </span>
                  <Tag>{entry.membership.role}</Tag>
                  <Tag>{entry.operator.authMode}</Tag>
                  <Tag>{membershipSourceLabel(entry)}</Tag>
                  {entry.operator.id === 'rocky' ? <Tag>local owner</Tag> : null}
                </div>
                <p className="text-caption text-muted-foreground">
                  {entry.operator.email?.trim() ? entry.operator.email : authModeDescription(entry)}
                </p>
                {sourceDescription ? (
                  <p className="text-caption text-muted-foreground">{sourceDescription}</p>
                ) : null}
              </div>
              <div className="flex max-w-xl flex-wrap items-center justify-end gap-2">
                {privileges.length > 0 ? (
                  privileges.map((privilege) => <Tag key={privilege}>{privilege}</Tag>)
                ) : (
                  <span className="text-caption text-muted-foreground">
                    No elevated governance capabilities are assigned to this membership.
                  </span>
                )}
              </div>
            </div>
          </RecessedWell>
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
  const entries = useMemo(() => operatorsQuery.data ?? [], [operatorsQuery.data]);
  const invites = useMemo(() => invitesQuery.data ?? [], [invitesQuery.data]);
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
      <div className="flex flex-col gap-6 p-4 lg:p-6" data-autonomy-view="">
        <Faceplate kicker="Operator Control Plane" serial="AUTONOMY" bodyClassName="space-y-6">
          <div className="space-y-2">
            <h1 className="text-display font-display text-foreground">Autonomy</h1>
            <p className="max-w-3xl text-body text-silver-mute">
              Autonomy becomes interactive once a workspace is active. Select or create a workspace
              first so Team-X can resolve operators, policies, and execution posture.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Tag>local-first</Tag>
            <Tag>multi-user ready</Tag>
            <Tag>cloud-ready seams</Tag>
          </div>
        </Faceplate>
        <Faceplate kicker="Autonomy Scope" bodyClassName="space-y-3">
          <SubviewState
            lampLabel="STBY"
            lampTone="off"
            title="Autonomy needs an active workspace"
            description="Pick a workspace from the switcher or create a new one to inspect operator access, future runtime bindings, and governance controls."
          />
        </Faceplate>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6" data-autonomy-view="">
      <Faceplate kicker="Operator Control Plane" serial="AUTONOMY" bodyClassName="space-y-6">
        <div className="space-y-2">
          <h1 className="text-display font-display text-foreground">Autonomy</h1>
          <p className="max-w-3xl text-body text-silver-mute">
            Supervise runtime posture, recurring operations, budgets, approvals, artifacts, and
            access from one mission-language surface.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Tag>{company.name}</Tag>
          <Tag>{company.slug}</Tag>
          <Tag>local-first</Tag>
          <Tag>cloud-ready seams</Tag>
        </div>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          <MetricTile
            label="Operators"
            value={operatorsQuery.isLoading ? '...' : String(entries.length)}
            hint="Company-scoped human supervisors"
            icon={ShieldCheck}
          />
          <MetricTile
            label="Owners"
            value={operatorsQuery.isLoading ? '...' : String(accessSummary.owners)}
            hint="Auto-bootstrapped local control"
            icon={Workflow}
          />
          <MetricTile
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
          <MetricTile
            label="Governance-ready"
            value={operatorsQuery.isLoading ? '...' : String(accessSummary.privilegeCount)}
            hint="Memberships with elevated authority"
            icon={CheckSquare2}
          />
        </div>
      </Faceplate>

      <Faceplate kicker="Autonomy Scope" bodyClassName="space-y-3">
        <p className="text-caption text-silver-mute">
          This first slice ships the operator and access foundation plus the visible control-plane
          shell.
        </p>
        <div className="flex flex-wrap items-center gap-1">
          {AUTONOMY_SUBVIEWS.map((subview) => {
            const Icon = subview.icon;
            const isActive = subview.value === activeSubview;
            return (
              <button
                type="button"
                key={subview.value}
                onClick={() => setActiveSubview(subview.value)}
                aria-current={subview.value === activeSubview ? 'page' : undefined}
                data-autonomy-subview={subview.value}
                className={cn(
                  'nav-tile flex items-center gap-1.5 px-3.5 py-1.5 text-button-sm',
                  isActive && 'nav-tile-active',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {subview.label}
              </button>
            );
          })}
        </div>
      </Faceplate>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_360px]">
        <Faceplate kicker={activeCopy.title} bodyClassName="space-y-4">
          <p className="text-caption text-silver-mute">{activeCopy.description}</p>
          {activeSubview === 'doctor' ? (
            <AutonomyDoctorPanel companyId={companyId} />
          ) : activeSubview === 'benchmarks' ? (
            <AutonomyBenchmarkPanel companyId={companyId} />
          ) : activeSubview === 'access' ? (
            operatorsQuery.isLoading ? (
              <SubviewState
                lampLabel="STBY"
                lampTone="off"
                title="Resolving operator access"
                description="Team-X is loading the operator memberships for this workspace."
              />
            ) : operatorsQuery.isError ? (
              <SubviewState
                lampLabel="NO-GO"
                lampTone="nogo"
                title="Operator access could not load"
                description="The operator foundation exists in the main process, but this workspace access read failed. Retry from the view or inspect the main-process logs."
              />
            ) : entries.length === 0 ? (
              <SubviewState
                lampLabel="NO-GO"
                lampTone="nogo"
                title={activeCopy.emptyTitle}
                description={activeCopy.emptyDescription}
              />
            ) : (
              <div className="space-y-4">
                <RecessedWell className="space-y-4 p-4" data-cloud-link-card="">
                  <div className="space-y-1">
                    <div className="text-body-strong text-foreground">Linked Workspace</div>
                    <p className="text-caption text-muted-foreground">
                      Explicitly link or unlink this workspace before the hosted identity and sync
                      layers land. This slice is local-only but durable, so the operator posture is
                      honest now instead of placeholder copy.
                    </p>
                  </div>
                  {cloudLinkQuery.isLoading ? (
                    <p className="text-caption text-muted-foreground">
                      Resolving linked-workspace posture...
                    </p>
                  ) : cloudLinkQuery.isError || !cloudLink ? (
                    <p className="text-caption text-led-nogo">
                      Linked-workspace posture could not be loaded for this workspace.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <LampTile
                          label={cloudLinkStateLabel(cloudLink.state)}
                          tone={cloudLinkTone(cloudLink.state)}
                          small
                          interactive={false}
                        />
                        <Tag>{cloudLink.isLinked ? 'linked' : 'unlinked'}</Tag>
                        <Tag mono>{cloudLink.deviceId}</Tag>
                      </div>
                      <p className="text-caption text-muted-foreground">
                        {cloudLinkDescription(cloudLink)}
                      </p>
                      <div className="grid gap-3 md:grid-cols-2">
                        <RecessedWell className="px-3 py-3">
                          <div className={ACCESS_LABEL_CLASSNAME}>Cloud Workspace Id</div>
                          <div className="mt-2 break-all text-caption text-foreground">
                            {cloudLink.cloudWorkspaceId ?? 'Not reserved yet'}
                          </div>
                        </RecessedWell>
                        <RecessedWell className="px-3 py-3">
                          <div className={ACCESS_LABEL_CLASSNAME}>Last Sync</div>
                          <div className="mt-2 text-caption text-foreground">
                            {cloudLink.lastSyncAt
                              ? new Date(cloudLink.lastSyncAt).toLocaleString()
                              : 'No successful sync recorded yet'}
                          </div>
                        </RecessedWell>
                      </div>
                      {cloudLink.lastSyncError ? (
                        <p className="text-caption text-led-nogo">{cloudLink.lastSyncError}</p>
                      ) : null}
                      {linkWorkspaceMutation.isError ? (
                        <p className="text-caption text-led-nogo">
                          {linkWorkspaceMutation.error instanceof Error
                            ? linkWorkspaceMutation.error.message
                            : 'Workspace link failed.'}
                        </p>
                      ) : null}
                      {unlinkWorkspaceMutation.isError ? (
                        <p className="text-caption text-led-nogo">
                          {unlinkWorkspaceMutation.error instanceof Error
                            ? unlinkWorkspaceMutation.error.message
                            : 'Workspace unlink failed.'}
                        </p>
                      ) : null}
                      {reconnectWorkspaceMutation.isError ? (
                        <p className="text-caption text-led-nogo">
                          {reconnectWorkspaceMutation.error instanceof Error
                            ? reconnectWorkspaceMutation.error.message
                            : 'Workspace reconnect failed.'}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-caption text-muted-foreground">
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
                </RecessedWell>
                <RecessedWell className="space-y-4 p-4" data-operator-invites="">
                  <div className="space-y-1">
                    <div className="text-body-strong text-foreground">Queue Operator Invite</div>
                    <p className="text-caption text-muted-foreground">
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
                      <p className="text-caption text-led-nogo">
                        {createInviteMutation.error instanceof Error
                          ? createInviteMutation.error.message
                          : 'The operator invite could not be created.'}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-caption text-muted-foreground">
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
                      <div className="text-body-strong text-foreground">
                        Invite Queue ({invites.length})
                      </div>
                      <LampTile
                        label={`${pendingInvites.length} pending`}
                        tone={pendingInvites.length > 0 ? 'hold' : 'go'}
                        small
                        interactive={false}
                      />
                    </div>
                    {invitesQuery.isLoading ? (
                      <p className="text-caption text-muted-foreground">
                        Loading operator invites...
                      </p>
                    ) : invitesQuery.isError ? (
                      <p className="text-caption text-led-nogo">
                        Operator invites could not be loaded for this workspace.
                      </p>
                    ) : invites.length === 0 ? (
                      <p className="text-caption text-muted-foreground">
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
                            <RecessedWell
                              key={invite.id}
                              className="space-y-3 p-4"
                              data-operator-invite={invite.id}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-body-strong text-foreground">
                                      {invite.displayName?.trim()
                                        ? invite.displayName
                                        : invite.email}
                                    </span>
                                    <Tag>{invite.authMode}</Tag>
                                    <Tag>{invite.role}</Tag>
                                    <Tag>{inviteSourceLabel(invite)}</Tag>
                                    <LampTile
                                      label={invite.status}
                                      tone={inviteStatusTone(invite.status)}
                                      small
                                      interactive={false}
                                    />
                                  </div>
                                  <p className="text-caption text-muted-foreground">
                                    {invite.email}
                                  </p>
                                  {invite.sourceKind === 'hosted' ? (
                                    <p className="text-caption text-muted-foreground">
                                      {invite.cloudWorkspaceId?.trim()
                                        ? `Hosted invite tracked for ${invite.cloudWorkspaceId}.`
                                        : 'Hosted invite tracked for the linked workspace.'}
                                    </p>
                                  ) : null}
                                  {invite.note ? (
                                    <p className="text-caption text-muted-foreground">
                                      {invite.note}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="space-y-2 text-right">
                                  <p className="text-caption text-muted-foreground">
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
                            </RecessedWell>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </RecessedWell>
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
          ) : activeSubview === 'improvement' ? (
            <AgentImprovementPanel companyId={companyId} />
          ) : activeSubview === 'budgets' ? (
            <BudgetsPanel companyId={companyId} company={company} />
          ) : activeSubview === 'approvals' ? (
            <ApprovalsPanel companyId={companyId} />
          ) : activeSubview === 'artifacts' ? (
            <ArtifactsPanel companyId={companyId} />
          ) : activeSubview === 'memory' ? (
            <MemoryPanel companyId={companyId} />
          ) : (
            <SubviewState
              lampLabel="STBY"
              lampTone="off"
              title={activeCopy.emptyTitle}
              description={activeCopy.emptyDescription}
            />
          )}
        </Faceplate>

        <div className="space-y-4">
          <Faceplate kicker="Access Posture" bodyClassName="space-y-4">
            <p className="text-caption text-silver-mute">Current workspace supervision footing</p>
            <RecessedWell className="p-4">
              <div className="space-y-3 text-body text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span>Posture</span>
                  <span className="text-eyebrow text-foreground">
                    {postureLabel(accessSummary)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Local operators</span>
                  <span className="text-body-strong tabular-nums text-foreground">
                    {accessSummary.localOperators}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Invited operators</span>
                  <span className="text-body-strong tabular-nums text-foreground">
                    {accessSummary.invitedOperators}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Cloud operators</span>
                  <span className="text-body-strong tabular-nums text-foreground">
                    {accessSummary.cloudOperators}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Pending invites</span>
                  <span className="text-body-strong tabular-nums text-foreground">
                    {pendingInvites.length}
                  </span>
                </div>
              </div>
            </RecessedWell>
            <RecessedWell className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <LampTile
                  label={cloudLink ? cloudLinkStateLabel(cloudLink.state) : 'link unknown'}
                  tone={cloudLinkTone(cloudLink?.state ?? 'unlinked')}
                  small
                  interactive={false}
                />
                <Tag mono>{cloudLink?.cloudWorkspaceId ?? 'no workspace id'}</Tag>
              </div>
              <p className="text-caption text-muted-foreground">
                {cloudLinkDescription(cloudLink)}
              </p>
            </RecessedWell>
            <p className="text-caption text-muted-foreground">
              {postureDescription(accessSummary)}
            </p>
            <RecessedWell className="p-4">
              {sharingReadinessQuery.isLoading ? (
                <p className="text-caption text-muted-foreground">Resolving sharing readiness...</p>
              ) : sharingReadinessQuery.isError || !sharingReadiness ? (
                <p className="text-caption text-led-nogo">
                  Sharing readiness is unavailable for this workspace.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag>configured {sharingModeLabel(sharingReadiness.configuredMode)}</Tag>
                    <Tag>effective {sharingModeLabel(sharingReadiness.effectiveMode)}</Tag>
                    <LampTile
                      label={sharingReadiness.readiness}
                      tone={sharingReadinessTone(sharingReadiness.readiness)}
                      small
                      interactive={false}
                    />
                  </div>
                  <p className="text-caption text-muted-foreground">
                    {sharingReadiness.lastExportedAt
                      ? `Last export ${new Date(sharingReadiness.lastExportedAt).toLocaleString()}`
                      : 'No workspace export or template has been recorded yet.'}
                  </p>
                  {sharingReadiness.missingRequirements.length > 0 ? (
                    <div className="space-y-1 text-caption text-muted-foreground">
                      {sharingReadiness.missingRequirements.map((requirement) => (
                        <p key={requirement}>- {requirement}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-caption text-led-go">
                      The configured sharing posture is ready on this workspace.
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openSettingsSection('portability')}
                  >
                    Open portability
                  </Button>
                </div>
              )}
            </RecessedWell>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveSubview('approvals')}
              >
                Open approvals
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveSubview('budgets')}
              >
                Open budgets
              </Button>
            </div>
          </Faceplate>

          <Faceplate kicker="What Lands Next" bodyClassName="space-y-4">
            <p className="text-caption text-silver-mute">
              The next autonomy slices build on this shell
            </p>
            <RecessedWell className="space-y-3 p-4 text-body text-muted-foreground">
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
            </RecessedWell>
          </Faceplate>
        </div>
      </div>
    </div>
  );
}
