import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  Company,
  CompanyImportPreview,
  CompanyPackageImportPlanAction,
  CompanyPackageMissingSecretRef,
  CompanyPackageMode,
  CompanyPackageSecretBinding,
  OperatorAuthMode,
} from '@team-x/shared-types';
import { OPERATOR_AUTH_MODES } from '@team-x/shared-types';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import {
  useCloudWorkspaceLink,
  useLinkWorkspace,
  useReconnectWorkspace,
  useUnlinkWorkspace,
} from '@/hooks/use-cloud-link.js';
import { useCompanies } from '@/hooks/use-companies.js';
import {
  useCompanyPackagePreview,
  useCompanyTemplates,
  useExportCompanyTemplate,
  useExportWorkspacePackage,
  useImportCompanyPackage,
  useInstallCompanyTemplate,
} from '@/hooks/use-company-portability.js';
import { useOperatorInvites, useSharingReadiness } from '@/hooks/use-operators.js';
import { ipc } from '@/lib/ipc.js';
import { useAppStore } from '@/store/app-store.js';

function readinessTone(readiness: 'ready' | 'warning' | 'blocked'): string {
  switch (readiness) {
    case 'ready':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'warning':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    default:
      return 'border-red-500/30 bg-red-500/10 text-red-300';
  }
}

function modeLabel(mode: OperatorAuthMode): string {
  switch (mode) {
    case 'invited':
      return 'Invited';
    case 'cloud':
      return 'Cloud';
    default:
      return 'Local';
  }
}

function modeDescription(mode: OperatorAuthMode): string {
  switch (mode) {
    case 'invited':
      return 'Local-first workspace sharing through invited operator memberships.';
    case 'cloud':
      return 'Hosted/shared supervision seam for future sync and cloud identities.';
    default:
      return 'Zero-login local-first posture with one workstation owning the workspace.';
  }
}

function packageModeLabel(mode: CompanyPackageMode): string {
  return mode === 'template' ? 'Template' : 'Workspace Export';
}

function previewSummary(preview: CompanyImportPreview): string {
  return `${packageModeLabel(preview.manifest.mode)} · ${preview.manifest.sourceAppVersion} · ${modeLabel(preview.manifest.sharingMode)}`;
}

function humanizeCompatibility(entry: string): string {
  return entry.replace(/-/g, ' ');
}

function runtimeKindLabel(kind: string): string {
  switch (kind) {
    case 'teamx-internal':
      return 'Team-X Internal';
    case 'claude-code':
      return 'Claude Code';
    default:
      return kind.charAt(0).toUpperCase() + kind.slice(1);
  }
}

function packageSourceLabel(preview: CompanyImportPreview): string {
  const source = preview.source ?? preview.plan?.source;
  if (!source) return 'local package';
  if (source.kind === 'github') {
    return source.resolvedRef;
  }
  return source.packagePath ?? source.resolvedRef;
}

function actionTone(action: CompanyPackageImportPlanAction): string {
  switch (action) {
    case 'create':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'rename':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    case 'replace':
      return 'border-brand/30 bg-brand/10 text-brand';
    default:
      return 'border-white/10 bg-black/10 text-muted-foreground';
  }
}

function fallbackMissingSecretRefs(missingSecrets: string[]): CompanyPackageMissingSecretRef[] {
  return missingSecrets.map((path) => ({
    id: path,
    path,
    label: path,
    source: 'redacted-field',
    bindable: false,
  }));
}

function secretBindingsFromDrafts(
  refs: CompanyPackageMissingSecretRef[],
  drafts: Record<string, string>,
): CompanyPackageSecretBinding[] {
  return refs.flatMap((ref) => {
    const value = drafts[ref.id]?.trim();
    if (!ref.bindable || ref.key !== 'apiKey' || !ref.providerId || !value) return [];
    return [
      {
        providerId: ref.providerId,
        key: 'apiKey' as const,
        value,
      },
    ];
  });
}

function cloudLinkStateLabel(
  state: 'unlinked' | 'linking' | 'linked' | 'sync-paused' | 'sync-degraded' | 'unlinking',
): string {
  switch (state) {
    case 'sync-paused':
      return 'Sync paused';
    case 'sync-degraded':
      return 'Sync degraded';
    default:
      return state.charAt(0).toUpperCase() + state.slice(1);
  }
}

function cloudLinkTone(
  state: 'unlinked' | 'linking' | 'linked' | 'sync-paused' | 'sync-degraded' | 'unlinking',
): string {
  switch (state) {
    case 'linked':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'sync-paused':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    case 'sync-degraded':
      return 'border-red-500/30 bg-red-500/10 text-red-300';
    default:
      return 'border-white/10 bg-black/10 text-muted-foreground';
  }
}

export function PortabilitySection() {
  const queryClient = useQueryClient();
  const companyId = useAppStore((state) => state.companyId);
  const setCompanyId = useAppStore((state) => state.setCompanyId);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const setAutonomySubview = useAppStore((state) => state.setAutonomySubview);
  const { data: companies = [] } = useCompanies();
  const templatesQuery = useCompanyTemplates();
  const cloudLinkQuery = useCloudWorkspaceLink(companyId);
  const linkWorkspace = useLinkWorkspace(companyId);
  const unlinkWorkspace = useUnlinkWorkspace(companyId);
  const reconnectWorkspace = useReconnectWorkspace(companyId);
  const sharingReadinessQuery = useSharingReadiness(companyId);
  const invitesQuery = useOperatorInvites(companyId);
  const exportWorkspace = useExportWorkspacePackage(companyId);
  const exportTemplate = useExportCompanyTemplate(companyId);
  const importPackage = useImportCompanyPackage();
  const [packageRef, setPackageRef] = useState('');
  const [importName, setImportName] = useState('');
  const [importSlug, setImportSlug] = useState('');
  const [importNameDirty, setImportNameDirty] = useState(false);
  const [importSlugDirty, setImportSlugDirty] = useState(false);
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});

  const activeCompany = companies.find((company) => company.id === companyId) ?? null;
  const cloudLink = cloudLinkQuery.data ?? null;
  const sharingReadiness = sharingReadinessQuery.data ?? null;
  const invites = invitesQuery.data ?? [];
  const pendingInvites = invites.filter((invite) => invite.status === 'pending');
  const cloudLinkBusy =
    linkWorkspace.isPending || unlinkWorkspace.isPending || reconnectWorkspace.isPending;
  const trimmedPackageRef = packageRef.trim();
  const packagePreviewQuery = useCompanyPackagePreview(
    trimmedPackageRef.length > 0 ? trimmedPackageRef : null,
  );
  const installTemplate = useInstallCompanyTemplate(companyId);
  const packagePreview = packagePreviewQuery.data ?? null;
  const runtimeProfileCount = packagePreview?.runtimeProfileCount ?? 0;
  const runtimeProfileKinds = packagePreview?.runtimeProfileKinds ?? [];
  const runtimeTemplateNotes = packagePreview?.runtimeTemplateNotes ?? [];
  const missingSecretRefs =
    packagePreview?.missingSecretRefs ??
    fallbackMissingSecretRefs(packagePreview?.missingSecrets ?? []);
  const secretBindings = secretBindingsFromDrafts(missingSecretRefs, secretDrafts);

  useEffect(() => {
    if (trimmedPackageRef.length > 0) return;
    setImportName('');
    setImportSlug('');
    setImportNameDirty(false);
    setImportSlugDirty(false);
    setSecretDrafts({});
  }, [trimmedPackageRef]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Secret bindings are scoped to the selected package preview.
  useEffect(() => {
    setSecretDrafts({});
  }, [packagePreview?.manifest.packageId]);

  useEffect(() => {
    if (!packagePreview || packagePreview.manifest.mode !== 'workspace-export') return;
    if (!importNameDirty) setImportName(packagePreview.suggestedCompanyName);
    if (!importSlugDirty) setImportSlug(packagePreview.suggestedSlug);
  }, [packagePreview, importNameDirty, importSlugDirty]);

  const updateSharingMode = useMutation({
    mutationFn: async (mode: OperatorAuthMode) => {
      if (!activeCompany) {
        throw new Error('Select an active workspace before changing sharing posture.');
      }
      await ipc.companies.update({
        companyId: activeCompany.id,
        settings: {
          ...activeCompany.settings,
          sharing: {
            ...(activeCompany.settings.sharing ?? {
              readiness: 'ready',
            }),
            mode,
          },
        },
      });
      return mode;
    },
    onSuccess: async (mode) => {
      if (!activeCompany) return;
      queryClient.setQueryData<Company[]>(['companies'], (current = []) =>
        current.map((company) =>
          company.id === activeCompany.id
            ? {
                ...company,
                settings: {
                  ...company.settings,
                  sharing: {
                    ...(company.settings.sharing ?? {
                      readiness: 'ready',
                    }),
                    mode,
                  },
                },
              }
            : company,
        ),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['companies'] }),
        queryClient.invalidateQueries({
          queryKey: ['operators', 'sharing-readiness', activeCompany.id],
        }),
      ]);
    },
  });

  const canInstallTemplate =
    packagePreview?.manifest.mode === 'template' &&
    trimmedPackageRef.length > 0 &&
    !installTemplate.isPending;
  const canImportWorkspace =
    packagePreview?.manifest.mode === 'workspace-export' &&
    trimmedPackageRef.length > 0 &&
    importName.trim().length > 0 &&
    importSlug.trim().length > 0 &&
    !importPackage.isPending;

  async function handleInstallTemplate() {
    if (!canInstallTemplate) return;
    await installTemplate.mutateAsync({
      packageRef: trimmedPackageRef,
      secretBindings,
    });
  }

  async function handleImportPackage() {
    if (!canImportWorkspace) return;
    const result = await importPackage.mutateAsync({
      packageRef: trimmedPackageRef,
      name: importName.trim(),
      slug: importSlug.trim(),
      secretBindings,
    });
    setCompanyId(result.companyId);
  }

  return (
    <section className="space-y-3" data-settings-portability="">
      <div className="flex items-center gap-2">
        <h2 className="text-h2 text-foreground">Portability & Templates</h2>
        {(exportWorkspace.isPending ||
          exportTemplate.isPending ||
          installTemplate.isPending ||
          importPackage.isPending) && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-label="Working" />
        )}
      </div>

      <p className="text-body-sm text-muted-foreground mt-1">
        Export the active workspace, save reusable templates, preview external Team-X packages
        before importing them, and keep sharing posture visible as a real operator concern.
      </p>

      <div className="space-y-4 rounded-lg border border-border bg-surface-50 p-4">
        <div className="rounded-lg border border-white/10 bg-black/10 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-body-strong text-foreground">Sharing posture</div>
              <p className="mt-1 text-caption text-muted-foreground">
                Choose the workspace’s intended sharing mode, then check what is already ready and
                what still blocks invited or cloud operation.
              </p>
            </div>
            {updateSharingMode.isPending || sharingReadinessQuery.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : null}
          </div>

          {!activeCompany ? (
            <p className="mt-3 text-caption text-muted-foreground">
              Select an active workspace before adjusting its sharing posture.
            </p>
          ) : sharingReadinessQuery.isLoading ? (
            <div className="mt-3 space-y-2" aria-busy="true">
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
            </div>
          ) : sharingReadinessQuery.isError || !sharingReadiness ? (
            <p className="mt-3 text-caption text-destructive">
              Failed to resolve sharing readiness for this workspace.
            </p>
          ) : (
            <>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {OPERATOR_AUTH_MODES.map((mode) => {
                  const readiness =
                    sharingReadiness.modeReadiness.find((entry) => entry.mode === mode) ??
                    sharingReadiness.modeReadiness[0];
                  const selected = sharingReadiness.configuredMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => updateSharingMode.mutate(mode)}
                      disabled={updateSharingMode.isPending}
                      className={`rounded-lg border px-3 py-3 text-left ${
                        selected
                          ? 'brand-selected'
                          : 'border-white/10 bg-background/60 hover:border-white/20 transition-colors'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-body-strong text-foreground">{modeLabel(mode)}</div>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-eyebrow-sm ${readinessTone(readiness?.readiness ?? 'blocked')}`}
                        >
                          {readiness?.readiness ?? 'blocked'}
                        </span>
                      </div>
                      <p className="mt-2 text-caption text-muted-foreground">
                        {modeDescription(mode)}
                      </p>
                      <p className="mt-2 text-caption text-muted-foreground">
                        {readiness?.summary ?? 'Readiness unavailable.'}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 rounded-lg border border-white/10 bg-background/70 px-3 py-3">
                <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
                  <span>Configured {modeLabel(sharingReadiness.configuredMode)}</span>
                  <span>Effective {modeLabel(sharingReadiness.effectiveMode)}</span>
                  <span>{sharingReadiness.operatorCount} operators</span>
                  <span>{sharingReadiness.ownerCount} owners</span>
                  <span>{sharingReadiness.invitedOperatorCount} invited</span>
                  <span>{sharingReadiness.cloudOperatorCount} cloud</span>
                  <span>{pendingInvites.length} pending invites</span>
                  <span>
                    {sharingReadiness.lastExportedAt
                      ? `Exported ${new Date(sharingReadiness.lastExportedAt).toLocaleString()}`
                      : 'No export recorded yet'}
                  </span>
                </div>
                {sharingReadiness.missingRequirements.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-caption text-muted-foreground">
                    {sharingReadiness.missingRequirements.map((requirement) => (
                      <li key={requirement}>- {requirement}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-caption text-emerald-600">
                    The currently selected sharing posture is ready on this workspace.
                  </p>
                )}
              </div>

              <div
                className="mt-3 rounded-lg border border-white/10 bg-background/70 px-3 py-3"
                data-cloud-link-shell=""
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-body-strong text-foreground">Linked workspace shell</div>
                    <p className="mt-1 text-caption text-muted-foreground">
                      This local shell reserves durable link metadata now so hosted auth and sync
                      can land without reframing the product later.
                    </p>
                  </div>
                  {cloudLinkQuery.isLoading || cloudLinkBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : null}
                </div>

                {cloudLinkQuery.isLoading ? (
                  <div className="mt-3 space-y-2" aria-busy="true">
                    <Skeleton className="h-12 rounded-lg" />
                    <Skeleton className="h-12 rounded-lg" />
                  </div>
                ) : cloudLinkQuery.isError || !cloudLink ? (
                  <p className="mt-3 text-caption text-destructive">
                    Failed to load linked-workspace posture for this workspace.
                  </p>
                ) : (
                  <>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-caption">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-eyebrow-sm ${cloudLinkTone(cloudLink.state)}`}
                      >
                        {cloudLinkStateLabel(cloudLink.state)}
                      </span>
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-muted-foreground">
                        {cloudLink.cloudWorkspaceId ?? 'No cloud workspace id reserved'}
                      </span>
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-muted-foreground">
                        {cloudLink.deviceId}
                      </span>
                    </div>

                    <p className="mt-3 text-caption text-muted-foreground">
                      {cloudLink.state === 'linked'
                        ? 'Workspace is linked locally and ready for the first hosted auth/sync follow-through.'
                        : cloudLink.state === 'sync-degraded'
                          ? (cloudLink.lastSyncError ??
                            'Workspace is linked but currently degraded.')
                          : cloudLink.state === 'unlinked'
                            ? 'Workspace is still fully local-only. Link it when you want explicit shared/cloud posture.'
                            : 'Workspace link posture is transitioning locally.'}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!cloudLink.canLink || cloudLinkBusy}
                        onClick={() => void linkWorkspace.mutateAsync()}
                      >
                        {linkWorkspace.isPending ? 'Linking...' : 'Link Workspace'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!cloudLink.isLinked || cloudLinkBusy}
                        onClick={() => void reconnectWorkspace.mutateAsync()}
                      >
                        {reconnectWorkspace.isPending ? 'Reconnecting...' : 'Reconnect'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!cloudLink.canUnlink || cloudLinkBusy}
                        onClick={() => void unlinkWorkspace.mutateAsync()}
                      >
                        {unlinkWorkspace.isPending ? 'Unlinking...' : 'Unlink Workspace'}
                      </Button>
                    </div>

                    {linkWorkspace.isError ? (
                      <p className="mt-3 text-caption text-destructive">
                        Failed to link workspace: {String(linkWorkspace.error)}
                      </p>
                    ) : null}
                    {reconnectWorkspace.isError ? (
                      <p className="mt-3 text-caption text-destructive">
                        Failed to reconnect workspace: {String(reconnectWorkspace.error)}
                      </p>
                    ) : null}
                    {unlinkWorkspace.isError ? (
                      <p className="mt-3 text-caption text-destructive">
                        Failed to unlink workspace: {String(unlinkWorkspace.error)}
                      </p>
                    ) : null}
                  </>
                )}
              </div>

              <div
                className="mt-3 rounded-lg border border-white/10 bg-background/70 px-3 py-3"
                data-portability-invite-readiness=""
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-body-strong text-foreground">Shared operator invites</div>
                    <p className="mt-1 text-caption text-muted-foreground">
                      Queue invited or cloud operators in Autonomy &gt; Access before expecting
                      shared posture to become actionable.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setAutonomySubview('access');
                      setActiveView('autonomy');
                    }}
                  >
                    Open Autonomy Access
                  </Button>
                </div>

                {invitesQuery.isLoading ? (
                  <div className="mt-3 space-y-2" aria-busy="true">
                    <Skeleton className="h-12 rounded-lg" />
                    <Skeleton className="h-12 rounded-lg" />
                  </div>
                ) : invitesQuery.isError ? (
                  <p className="mt-3 text-caption text-destructive">
                    Failed to load shared operator invites for this workspace.
                  </p>
                ) : invites.length === 0 ? (
                  <p className="mt-3 text-caption text-muted-foreground">
                    No operator invites are queued yet. This workspace can still export or template
                    cleanly, but invited and cloud posture remain preparatory until shared operators
                    are actually queued.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {invites.slice(0, 3).map((invite) => (
                      <div
                        key={invite.id}
                        className="rounded-lg border border-white/10 bg-black/10 px-3 py-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-caption">
                          <div className="min-w-0 text-foreground">
                            <div className="truncate font-medium">
                              {invite.displayName?.trim() ? invite.displayName : invite.email}
                            </div>
                            <div className="truncate text-muted-foreground">{invite.email}</div>
                          </div>
                          <div className="flex flex-wrap gap-2 text-muted-foreground">
                            <span>{invite.authMode}</span>
                            <span>{invite.role}</span>
                            <span>{invite.status}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {invites.length > 3 ? (
                      <p className="text-caption text-muted-foreground">
                        {invites.length - 3} more invites are visible in Autonomy &gt; Access.
                      </p>
                    ) : null}
                  </div>
                )}
              </div>

              {updateSharingMode.isError ? (
                <p className="mt-3 text-caption text-destructive">
                  Failed to save sharing posture: {String(updateSharingMode.error)}
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-black/10 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-body-strong text-foreground">
                Export active workspace package
              </div>
              <p className="mt-1 text-caption text-muted-foreground">
                {activeCompany
                  ? `${activeCompany.name} will export as a portable workspace package with secrets redacted and live operating state preserved.`
                  : 'Select an active workspace before exporting a portable package.'}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!activeCompany || exportWorkspace.isPending}
              onClick={() => exportWorkspace.mutate()}
            >
              {exportWorkspace.isPending ? 'Exporting...' : 'Export Package'}
            </Button>
          </div>
          {exportWorkspace.isSuccess ? (
            <p className="mt-3 text-caption text-emerald-600">
              Workspace package saved to {exportWorkspace.data.packagePath}
            </p>
          ) : null}
          {exportWorkspace.isError ? (
            <p className="mt-3 text-caption text-destructive">
              Failed to export workspace package: {String(exportWorkspace.error)}
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-white/10 bg-black/10 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-body-strong text-foreground">
                Save active workspace as template
              </div>
              <p className="mt-1 text-caption text-muted-foreground">
                {activeCompany
                  ? `${activeCompany.name} will export into the local template library with live project and ticket state stripped out by default.`
                  : 'Select an active workspace before exporting a reusable template.'}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!activeCompany || exportTemplate.isPending}
              onClick={() => exportTemplate.mutate()}
            >
              {exportTemplate.isPending ? 'Saving...' : 'Save Template'}
            </Button>
          </div>
          {exportTemplate.isSuccess ? (
            <p className="mt-3 text-caption text-emerald-600">
              Template saved to {exportTemplate.data.packagePath}
            </p>
          ) : null}
          {exportTemplate.isSuccess && exportTemplate.data.manifest.compatibility.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2 text-caption text-muted-foreground">
              {exportTemplate.data.manifest.compatibility.map((entry) => (
                <span
                  key={entry}
                  className="rounded-full border border-white/10 bg-background/70 px-2 py-1"
                >
                  {humanizeCompatibility(entry)}
                </span>
              ))}
            </div>
          ) : null}
          {exportTemplate.isError ? (
            <p className="mt-3 text-caption text-destructive">
              Failed to save template: {String(exportTemplate.error)}
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-white/10 bg-black/10 p-3">
          <div className="text-body-strong text-foreground">
            Preview package from path or GitHub
          </div>
          <p className="mt-1 text-caption text-muted-foreground">
            Preview local packages, GitHub URLs, or shorthand refs before importing a workspace
            package or installing a template into the local library.
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              value={packageRef}
              onChange={(event) => setPackageRef(event.target.value)}
              placeholder="C:\\templates\\ops.teamx-package.json or owner/repo/path.teamx-package.json#main"
              className="text-code-sm"
            />
          </div>

          {trimmedPackageRef.length === 0 ? (
            <p className="mt-3 text-caption text-muted-foreground">
              Paste a `.teamx-package.json` path, GitHub blob/raw URL, `gh:owner/repo/path#ref`, or
              `owner/repo@ref:path` shorthand to inspect the manifest before any action runs.
            </p>
          ) : packagePreviewQuery.isLoading ? (
            <div className="mt-3 space-y-2" aria-busy="true">
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
            </div>
          ) : packagePreviewQuery.isError || !packagePreview ? (
            <p className="mt-3 text-caption text-destructive">
              Failed to preview package: {String(packagePreviewQuery.error)}
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              <div
                className="rounded-lg border border-white/10 bg-background/70 px-3 py-3"
                data-portability-manifest-preview=""
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-body-strong text-foreground">Manifest Preview</div>
                    <p className="mt-1 text-caption text-muted-foreground">
                      {previewSummary(packagePreview)}
                    </p>
                    <p className="mt-1 truncate text-code-sm text-muted-foreground/80">
                      <span className="truncate">{packageSourceLabel(packagePreview)}</span>
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-eyebrow-sm text-muted-foreground">
                    {packageModeLabel(packagePreview.manifest.mode)}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-caption text-muted-foreground">
                  <span>{packagePreview.manifest.sections.length} sections</span>
                  <span>{packagePreview.manifest.redactions.length} redactions</span>
                  <span>{runtimeProfileCount} runtime profiles</span>
                  <span>
                    Exported {new Date(packagePreview.manifest.exportedAt).toLocaleString()}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-caption text-muted-foreground">
                  {packagePreview.manifest.sections.map((section) => (
                    <span
                      key={section}
                      className="rounded-full border border-white/10 px-2 py-1 uppercase tracking-[0.14em]"
                    >
                      {section}
                    </span>
                  ))}
                </div>

                {packagePreview.manifest.compatibility.length > 0 ? (
                  <div className="mt-3">
                    <div className="text-eyebrow text-muted-foreground">Compatibility</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-caption text-muted-foreground">
                      {packagePreview.manifest.compatibility.map((entry) => (
                        <span
                          key={entry}
                          className="rounded-full border border-white/10 bg-black/10 px-2 py-1"
                        >
                          {humanizeCompatibility(entry)}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {packagePreview.plan ? (
                  <div
                    className="mt-3 rounded-lg border border-white/10 bg-black/10 px-3 py-3"
                    data-portability-import-plan=""
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-body-strong text-foreground">Dry-run install plan</div>
                      <div className="flex flex-wrap gap-1 text-eyebrow-sm text-muted-foreground">
                        <span>{packagePreview.plan.totals.create} create</span>
                        <span>{packagePreview.plan.totals.rename} rename</span>
                        <span>{packagePreview.plan.totals.replace} replace</span>
                        <span>{packagePreview.plan.totals.skip} skip</span>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {packagePreview.plan.items.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-white/10 bg-background/70 px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-body-strong text-foreground">{item.label}</div>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-eyebrow-sm ${actionTone(item.action)}`}
                            >
                              {item.action}
                            </span>
                          </div>
                          <p className="mt-1 text-caption text-muted-foreground">{item.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {runtimeProfileCount > 0 || runtimeTemplateNotes.length > 0 ? (
                  <div
                    className="mt-3 rounded-lg border border-brand/15 bg-brand/8 px-3 py-3"
                    data-portability-runtime-template-diagnostics=""
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-body-strong text-foreground">
                        Runtime template diagnostics
                      </div>
                      <span className="rounded-full border border-brand/20 bg-brand/10 px-2 py-0.5 text-eyebrow-sm text-brand">
                        {runtimeProfileCount} runtime profile
                        {runtimeProfileCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    {runtimeProfileKinds.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2 text-caption text-muted-foreground">
                        {runtimeProfileKinds.map((kind) => (
                          <span
                            key={kind}
                            className="rounded-full border border-white/10 bg-black/10 px-2 py-1"
                          >
                            {runtimeKindLabel(kind)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {runtimeTemplateNotes.length > 0 ? (
                      <ul className="mt-3 space-y-1 text-caption text-muted-foreground">
                        {runtimeTemplateNotes.map((note) => (
                          <li key={note}>- {note}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                {packagePreview.warnings.length > 0 ? (
                  <div className="mt-3">
                    <div className="text-eyebrow text-muted-foreground">Warnings</div>
                    <ul className="mt-2 space-y-1 text-caption text-muted-foreground">
                      {packagePreview.warnings.map((warning) => (
                        <li key={warning}>- {warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {missingSecretRefs.length > 0 ? (
                  <div
                    className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-3"
                    data-portability-secret-wizard=""
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-body-strong text-foreground">Missing secret wizard</div>
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-eyebrow-sm text-amber-300">
                        {secretBindings.length} bound
                      </span>
                    </div>
                    <p className="mt-1 text-caption text-muted-foreground">
                      Bind runtime provider API keys before install/import, or leave fields empty
                      and reconfigure them later in Settings and Autonomy.
                    </p>
                    <div className="mt-3 space-y-2">
                      {missingSecretRefs.map((secret) => (
                        <div
                          key={secret.id}
                          className="rounded-lg border border-white/10 bg-background/70 px-3 py-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-body-strong text-foreground">
                                {secret.label}
                              </div>
                              <div className="truncate text-code-sm text-muted-foreground">
                                {secret.path}
                              </div>
                            </div>
                            <span className="rounded-full border border-white/10 px-2 py-0.5 text-eyebrow-sm text-muted-foreground">
                              {secret.bindable ? 'bindable' : 'manual'}
                            </span>
                          </div>
                          {secret.bindable ? (
                            <Input
                              type="password"
                              value={secretDrafts[secret.id] ?? ''}
                              onChange={(event) =>
                                setSecretDrafts((current) => ({
                                  ...current,
                                  [secret.id]: event.target.value,
                                }))
                              }
                              placeholder={`Bind ${secret.providerId ?? 'provider'} API key`}
                              className="mt-2 text-body-sm"
                              data-portability-secret-input={secret.id}
                            />
                          ) : (
                            <p className="mt-2 text-caption text-muted-foreground">
                              This redacted field has no provider mapping in the package. Re-enter
                              the value in the owning extension, runtime, or authority surface after
                              import.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {packagePreview.manifest.mode === 'workspace-export' ? (
                <div className="rounded-lg border border-white/10 bg-background/70 px-3 py-3">
                  <div className="text-body-strong text-foreground">Import as new workspace</div>
                  <p className="mt-1 text-caption text-muted-foreground">
                    Import stays non-destructive. Team-X will create a fresh workspace copy with new
                    local ids while preserving origin metadata.
                  </p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <Input
                      value={importName}
                      onChange={(event) => {
                        setImportName(event.target.value);
                        if (!importNameDirty) setImportNameDirty(true);
                      }}
                      placeholder={packagePreview.suggestedCompanyName}
                    />
                    <Input
                      value={importSlug}
                      onChange={(event) => {
                        setImportSlug(event.target.value);
                        if (!importSlugDirty) setImportSlugDirty(true);
                      }}
                      placeholder={packagePreview.suggestedSlug}
                      className="text-code-sm"
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-caption text-muted-foreground">
                      Suggested slug defaults to {packagePreview.suggestedSlug} when the source slug
                      is already taken locally.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!canImportWorkspace}
                      onClick={() => void handleImportPackage()}
                    >
                      {importPackage.isPending
                        ? 'Importing...'
                        : secretBindings.length > 0
                          ? 'Import and Bind'
                          : 'Import Workspace'}
                    </Button>
                  </div>
                  {importPackage.isSuccess ? (
                    <p className="mt-3 text-caption text-emerald-600">
                      Workspace imported and switched to {importName.trim() || importSlug.trim()}.
                    </p>
                  ) : null}
                  {importPackage.isError ? (
                    <p className="mt-3 text-caption text-destructive">
                      Failed to import workspace package: {String(importPackage.error)}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-lg border border-white/10 bg-background/70 px-3 py-3">
                  <div className="text-body-strong text-foreground">Install into local library</div>
                  <p className="mt-1 text-caption text-muted-foreground">
                    Template packages become visible in the workspace switcher after installation,
                    but they stay local-first and never overwrite existing workspaces.
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-caption text-muted-foreground">
                      Installed templates show up in the local template library below and in the
                      workspace switcher create flow.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!canInstallTemplate}
                      onClick={() => void handleInstallTemplate()}
                    >
                      {installTemplate.isPending
                        ? 'Installing...'
                        : secretBindings.length > 0
                          ? 'Install and Bind'
                          : 'Install Template'}
                    </Button>
                  </div>
                  {installTemplate.isSuccess ? (
                    <p className="mt-3 text-caption text-emerald-600">
                      Template installed to {installTemplate.data.template.packagePath}
                    </p>
                  ) : null}
                  {installTemplate.isError ? (
                    <p className="mt-3 text-caption text-destructive">
                      Failed to install template: {String(installTemplate.error)}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-black/10 p-3">
          <div className="text-body-strong text-foreground">Local template library</div>
          <p className="mt-1 text-caption text-muted-foreground">
            Template-backed workspace creation lives in the workspace switcher. This library keeps
            the reusable operating models visible and local-first.
          </p>

          {templatesQuery.isLoading ? (
            <div className="mt-3 space-y-2" aria-busy="true">
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
            </div>
          ) : templatesQuery.isError ? (
            <p className="mt-3 text-caption text-destructive">
              Failed to load the local template library.
            </p>
          ) : (templatesQuery.data?.length ?? 0) === 0 ? (
            <p className="mt-3 text-caption text-muted-foreground">
              No local templates yet. Save the active workspace as a template or install an external
              template package to seed this library.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {templatesQuery.data?.map((template) => (
                <div
                  key={template.packagePath}
                  className="rounded-lg border border-white/10 bg-background/70 px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-body-strong text-foreground">
                        {template.company.name}
                      </div>
                      <div className="truncate text-caption text-muted-foreground">
                        {template.company.slug} · exported{' '}
                        {new Date(template.manifest.exportedAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-eyebrow-sm text-muted-foreground">Template</div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-caption text-muted-foreground">
                    <span>{template.employeeCount} employees</span>
                    <span>{template.runtimeProfileCount} runtimes</span>
                    <span>{template.routineCount} routines</span>
                    <span>{template.extensionCount} extensions</span>
                    <span>{template.starterAssetCount} starter assets</span>
                  </div>

                  {template.manifest.compatibility.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2 text-caption text-muted-foreground">
                      {template.manifest.compatibility.slice(0, 4).map((entry) => (
                        <span
                          key={entry}
                          className="rounded-full border border-white/10 bg-black/10 px-2 py-1"
                        >
                          {humanizeCompatibility(entry)}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <p className="mt-3 truncate text-code-sm text-muted-foreground/75">
                    {template.packagePath}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
