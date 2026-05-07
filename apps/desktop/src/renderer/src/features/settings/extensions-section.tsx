import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AuthorityGrant,
  type AuthorityPermission,
  EXTENSIONS_AUTONOMY_MODES,
} from '@team-x/shared-types';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Switch } from '@/components/ui/switch.js';
import { useEmployees } from '@/hooks/use-employees.js';
import {
  useAuthorityGrants,
  useAuthorityRequests,
  useDeleteAuthorityGrant,
  useInstalledExtensions,
  useMcpServers,
  useReviewAuthorityRequest,
} from '@/hooks/use-extensions.js';
import { useExtensionsSettings, useSetExtensionsSettings } from '@/hooks/use-settings.js';
import { ipc } from '@/lib/ipc.js';
import { cn } from '@/lib/utils.js';
import { useAppStore } from '@/store/app-store.js';

const AUTONOMY_COPY: Record<(typeof EXTENSIONS_AUTONOMY_MODES)[number], string> = {
  conservative: 'New installs stay inert until explicitly reviewed and approved.',
  balanced: 'Auto-enable low-risk installs, but stop for sensitive capability or path expansion.',
  autonomous: 'Auto-enable and auto-grant unless a request hits a hard platform deny.',
};

function permissionBadgeClass(permission: AuthorityPermission): string {
  if (permission === 'deny') {
    return 'border-red-500/55 bg-red-950/70 text-red-100 shadow-[0_0_0_1px_rgba(248,113,113,0.14)]';
  }
  if (permission === 'prompt') {
    return 'border-amber-500/55 bg-amber-950/70 text-amber-100 shadow-[0_0_0_1px_rgba(251,191,36,0.12)]';
  }
  return 'border-brand-500/65 bg-brand-900/75 text-red-50 shadow-[0_0_0_1px_rgba(170,32,36,0.2)]';
}

const PERMISSION_LABEL: Record<AuthorityPermission, string> = {
  allow: 'Allow',
  deny: 'Deny',
  prompt: 'Prompt',
};

function renderAuthorityScope(
  grant: AuthorityGrant,
  employeeNameById: Map<string, string>,
  extensionNameById: Map<string, string>,
): string {
  if (grant.scopeKind === 'company') return 'Workspace default';
  if (grant.scopeKind === 'employee') {
    return employeeNameById.get(grant.scopeId) ?? `Employee ${grant.scopeId.slice(0, 8)}`;
  }
  return extensionNameById.get(grant.scopeId) ?? `Extension ${grant.scopeId.slice(0, 8)}`;
}

export function ExtensionsSection() {
  const companyId = useAppStore((state) => state.companyId);
  const extensionsSettings = useExtensionsSettings();
  const setExtensionsSettings = useSetExtensionsSettings();
  const extensionsQuery = useInstalledExtensions(companyId);
  const mcpQuery = useMcpServers(companyId);
  const authorityQuery = useAuthorityGrants(companyId);
  const authorityRequestsQuery = useAuthorityRequests(companyId, 'pending');
  const employeesQuery = useEmployees(companyId);
  const reviewAuthorityRequest = useReviewAuthorityRequest(companyId);
  const deleteGrant = useDeleteAuthorityGrant(companyId);
  const queryClient = useQueryClient();

  // Proactive state queries
  const proactiveSettingsQuery = useQuery({
    queryKey: ['settings', 'proactive'],
    queryFn: () => ipc.settings.getProactive(),
  });
  // Optimistic local mirror of proactive_enabled. Bound to the Switch so the
  // user sees the thumb move immediately, before the IPC round-trip + cache
  // invalidation lands. Mirrors the working pattern in proactive-controls.tsx.
  const [proactiveEnabledOptimistic, setProactiveEnabledOptimistic] = useState<boolean | null>(
    null,
  );
  const [proactiveToggling, setProactiveToggling] = useState(false);
  useEffect(() => {
    if (proactiveSettingsQuery.data) {
      setProactiveEnabledOptimistic(proactiveSettingsQuery.data.enabled);
    }
  }, [proactiveSettingsQuery.data]);

  const proactiveEnabled = proactiveEnabledOptimistic ?? false;
  const proactiveStateQuery = useQuery({
    queryKey: ['proactive', 'state', companyId],
    queryFn: () => {
      if (!companyId) throw new Error('companyId is required');
      return ipc.proactive.getState({ companyId });
    },
    enabled: !!companyId && proactiveEnabled,
    refetchInterval: 5000,
  });

  async function handleProactiveToggle(checked: boolean) {
    if (!companyId) return;
    const previous = proactiveEnabledOptimistic;
    setProactiveEnabledOptimistic(checked);
    setProactiveToggling(true);
    try {
      await ipc.proactive.setEnabled({ companyId, enabled: checked });
      await queryClient.invalidateQueries({ queryKey: ['settings', 'proactive'] });
    } catch (err) {
      // Revert optimistic state on failure so the Switch reflects reality.
      setProactiveEnabledOptimistic(previous);
      console.error('[proactive] Failed to toggle enabled:', err);
    } finally {
      setProactiveToggling(false);
    }
  }

  const extensions = extensionsQuery.data ?? [];
  const mcpServers = (mcpQuery.data ?? []).filter((server) => server.companyId !== null);
  const authorityGrants = authorityQuery.data ?? [];
  const pendingAuthorityRequests = authorityRequestsQuery.data ?? [];
  const employees = employeesQuery.data ?? [];
  const skillCount = extensions.filter((extension) => extension.kind === 'skill').length;
  const mcpExtensionCount = extensions.filter((extension) => extension.kind === 'mcp').length;
  const enabledExtensionCount = extensions.filter((extension) => extension.enabled).length;
  const enabledMcpCount = mcpServers.filter((server) => server.enabled).length;
  const employeeNameById = new Map(employees.map((employee) => [employee.id, employee.name]));
  const extensionNameById = new Map(extensions.map((extension) => [extension.id, extension.name]));

  async function reviewRequest(requestId: string, decision: 'approved' | 'denied') {
    if (!companyId) return;
    await reviewAuthorityRequest.mutateAsync({
      companyId,
      requestId,
      decision,
      reason: 'Reviewed from Settings authority control.',
    });
  }

  return (
    <section className="space-y-4" data-extensions-authority-stable="">
      <h2 className="text-h2 text-foreground">Extensions & Authority</h2>
      <p className="text-body-sm text-muted-foreground mt-1">
        Stable authority controls for autonomy policy, installed extension state, and pending
        approvals. Marketplace installs have been removed from Settings until the replacement flow
        can be engineered without risking the whole page.
      </p>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-h3">Autonomy Policy</CardTitle>
                <CardDescription>
                  Choose how aggressively Team-X auto-enables extensions and grants authority.
                </CardDescription>
              </div>
              {setExtensionsSettings.isPending && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {extensionsSettings.isLoading ? (
              <Skeleton className="h-28 rounded-lg" />
            ) : extensionsSettings.isError || !extensionsSettings.data ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-body text-destructive">
                Failed to load autonomy settings.
              </div>
            ) : (
              <>
                <div className="grid gap-2 md:grid-cols-3">
                  {EXTENSIONS_AUTONOMY_MODES.map((mode) => {
                    const selected = extensionsSettings.data.autonomyMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        disabled={setExtensionsSettings.isPending}
                        onClick={() => setExtensionsSettings.mutate({ autonomyMode: mode })}
                        className={cn(
                          'flex flex-col items-start rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                          selected
                            ? 'brand-selected'
                            : 'border-border bg-surface-50 text-muted-foreground hover:border-foreground/20 hover:text-foreground',
                        )}
                      >
                        <span className="text-body-strong capitalize">{mode}</span>
                        <span className="mt-0.5 whitespace-normal text-caption font-normal opacity-80">
                          {AUTONOMY_COPY[mode]}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Proactive mode toggle */}
                <div className="pt-3 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-body-strong">Proactive Mode</span>
                      <span className="text-caption text-muted-foreground">
                        Agents recognize opportunities and act autonomously
                      </span>
                    </div>
                    <Switch
                      checked={proactiveEnabled}
                      disabled={
                        proactiveSettingsQuery.isLoading ||
                        proactiveToggling ||
                        !companyId ||
                        proactiveEnabledOptimistic === null
                      }
                      onCheckedChange={(checked) => void handleProactiveToggle(checked)}
                    />
                  </div>

                  {/* Proactive work status - only show when enabled */}
                  {proactiveEnabled && (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {proactiveStateQuery.isLoading || !proactiveStateQuery.data ? (
                        <Skeleton className="h-12 col-span-3" />
                      ) : proactiveStateQuery.isError ? (
                        <div className="col-span-3 rounded border border-red-400/30 bg-red-500/10 px-2 py-1.5 text-body text-red-400">
                          Failed to load proactive status
                        </div>
                      ) : (
                        <>
                          <div className="rounded bg-muted/30 px-2 py-2 text-center">
                            <p className="text-eyebrow-sm text-muted-foreground">Active</p>
                            <p className="text-h4">{proactiveStateQuery.data.activeWork}</p>
                          </div>
                          <div className="rounded bg-muted/30 px-2 py-2 text-center">
                            <p className="text-eyebrow-sm text-muted-foreground">Queued</p>
                            <p className="text-h4">{proactiveStateQuery.data.queuedWork}</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-auto py-2"
                            onClick={async () => {
                              if (!companyId) return;
                              try {
                                await ipc.proactive.scanForWork({ companyId });
                                proactiveStateQuery.refetch();
                              } catch (err) {
                                console.error('[proactive] Failed to scan:', err);
                              }
                            }}
                          >
                            Scan
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {setExtensionsSettings.isError && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-body text-destructive">
                    Failed to save autonomy policy.
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-h3">Authority Snapshot</CardTitle>
            <CardDescription>
              Read-only extension inventory plus direct approval and grant controls.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!companyId ? (
              <p className="text-body text-muted-foreground">
                Select a workspace to inspect extension authority.
              </p>
            ) : extensionsQuery.isLoading || mcpQuery.isLoading || authorityQuery.isLoading ? (
              <Skeleton className="h-28 rounded-lg" />
            ) : extensionsQuery.isError || mcpQuery.isError || authorityQuery.isError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-body text-destructive">
                Failed to load extension authority state.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
                  <p className="text-eyebrow text-muted-foreground">Skills</p>
                  <p className="mt-1 text-numeric">{skillCount}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
                  <p className="text-eyebrow text-muted-foreground">MCP Extensions</p>
                  <p className="mt-1 text-numeric">{mcpExtensionCount}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
                  <p className="text-eyebrow text-muted-foreground">Enabled</p>
                  <p className="mt-1 text-numeric">{enabledExtensionCount}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
                  <p className="text-eyebrow text-muted-foreground">MCP Runtimes</p>
                  <p className="mt-1 text-numeric">
                    {enabledMcpCount}/{mcpServers.length}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-h3">Pending Authority Reviews</CardTitle>
                <CardDescription>
                  Extension requests stop here before sensitive capabilities or paths are granted.
                </CardDescription>
              </div>
              <Badge variant="outline">{pendingAuthorityRequests.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!companyId ? (
              <p className="text-body text-muted-foreground">
                Select a workspace to review authority requests.
              </p>
            ) : authorityRequestsQuery.isLoading ? (
              <Skeleton className="h-24 rounded-lg" />
            ) : authorityRequestsQuery.isError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-body text-destructive">
                Failed to load pending authority requests.
              </div>
            ) : pendingAuthorityRequests.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center">
                <p className="text-body text-muted-foreground">
                  No pending extension authority requests.
                </p>
              </div>
            ) : (
              pendingAuthorityRequests.map((request) => (
                <div
                  key={request.id}
                  className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-body-strong text-foreground">
                        {extensionNameById.get(request.extensionId) ?? request.extensionId}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-caption text-muted-foreground">
                        <span>{request.resourceKind}</span>
                        <span>{request.requestedPermission}</span>
                        <span className="truncate">{request.resourceId}</span>
                      </div>
                      {request.reason && (
                        <p className="mt-2 text-caption text-muted-foreground">{request.reason}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => void reviewRequest(request.id, 'denied')}
                        disabled={reviewAuthorityRequest.isPending}
                      >
                        Deny
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-8"
                        onClick={() => void reviewRequest(request.id, 'approved')}
                        disabled={reviewAuthorityRequest.isPending}
                      >
                        Approve
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
            {reviewAuthorityRequest.isError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-body text-destructive">
                Failed to review the selected authority request.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-h3">Active Authority Grants</CardTitle>
                <CardDescription>
                  Existing workspace, employee, and extension grants. New grant creation will move
                  into the redesigned authority workflow.
                </CardDescription>
              </div>
              <Badge variant="outline">{authorityGrants.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!companyId ? (
              <p className="text-body text-muted-foreground">
                Select a workspace to inspect active grants.
              </p>
            ) : authorityQuery.isLoading || employeesQuery.isLoading ? (
              <Skeleton className="h-32 rounded-lg" />
            ) : authorityQuery.isError || employeesQuery.isError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-body text-destructive">
                Failed to load active authority grants.
              </div>
            ) : authorityGrants.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center">
                <p className="text-body text-muted-foreground">
                  No explicit grants recorded yet. Role defaults remain the current baseline.
                </p>
              </div>
            ) : (
              authorityGrants.map((grant) => (
                <div
                  key={grant.id}
                  className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-body-strong text-foreground">
                        <span className="truncate">{grant.resourceId}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-body-sm text-muted-foreground">
                        <span>{grant.resourceKind}</span>
                        <span>
                          {renderAuthorityScope(grant, employeeNameById, extensionNameById)}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline" className={permissionBadgeClass(grant.permission)}>
                        {PERMISSION_LABEL[grant.permission]}
                      </Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-button-sm"
                        onClick={() => deleteGrant.mutate(grant.id)}
                        disabled={deleteGrant.isPending}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
            {deleteGrant.isError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-body text-destructive">
                Failed to remove the selected authority grant.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
