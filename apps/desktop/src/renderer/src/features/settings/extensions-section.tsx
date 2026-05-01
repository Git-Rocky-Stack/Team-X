import { useQuery } from '@tanstack/react-query';
import {
  type AuthorityGrant,
  type AuthorityPermission,
  EXTENSIONS_AUTONOMY_MODES,
} from '@team-x/shared-types';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  FolderLock,
  Loader2,
  Shield,
  Workflow,
  Zap,
} from 'lucide-react';

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

  // Proactive state queries
  const proactiveSettingsQuery = useQuery({
    queryKey: ['settings', 'proactive'],
    queryFn: () => ipc.settings.getProactive(),
  });
  const proactiveStateQuery = useQuery({
    queryKey: ['proactive', 'state', companyId],
    queryFn: () => {
      if (!companyId) throw new Error('companyId is required');
      return ipc.proactive.getState({ companyId });
    },
    enabled: !!companyId && (proactiveSettingsQuery.data?.enabled ?? false),
    refetchInterval: 5000,
  });

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
      <div className="flex items-center gap-2">
        <Shield className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Extensions & Authority
        </h4>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Stable authority controls for autonomy policy, installed extension state, and pending
        approvals. Marketplace installs have been removed from Settings until the replacement flow
        can be engineered without risking the whole page.
      </p>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Autonomy Policy</CardTitle>
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
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                Failed to load autonomy settings.
              </div>
            ) : (
              <>
                <div className="grid gap-2 md:grid-cols-3">
                  {EXTENSIONS_AUTONOMY_MODES.map((mode) => {
                    const selected = extensionsSettings.data.autonomyMode === mode;
                    return (
                      <Button
                        key={mode}
                        type="button"
                        variant={selected ? 'default' : 'outline'}
                        className="h-auto min-h-16 flex-col items-start gap-1 px-3 py-3 text-left"
                        disabled={setExtensionsSettings.isPending}
                        onClick={() => setExtensionsSettings.mutate({ autonomyMode: mode })}
                      >
                        <span className="text-sm font-semibold capitalize">{mode}</span>
                        <span className="whitespace-normal text-[11px] font-normal opacity-80">
                          {AUTONOMY_COPY[mode]}
                        </span>
                      </Button>
                    );
                  })}
                </div>

                {/* Proactive mode toggle */}
                <div className="pt-3 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">Proactive Mode</span>
                        <span className="text-[11px] text-muted-foreground">
                          Agents recognize opportunities and act autonomously
                        </span>
                      </div>
                    </div>
                    <Switch
                      checked={proactiveSettingsQuery.data?.enabled ?? false}
                      disabled={proactiveSettingsQuery.isLoading || !companyId}
                      onCheckedChange={async (checked) => {
                        if (!companyId) return;
                        try {
                          await ipc.proactive.setEnabled({ companyId, enabled: checked });
                          proactiveSettingsQuery.refetch();
                        } catch (err) {
                          console.error('[proactive] Failed to toggle enabled:', err);
                        }
                      }}
                    />
                  </div>

                  {/* Proactive work status - only show when enabled */}
                  {proactiveSettingsQuery.data?.enabled && (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {proactiveStateQuery.isLoading || !proactiveStateQuery.data ? (
                        <Skeleton className="h-12 col-span-3" />
                      ) : proactiveStateQuery.isError ? (
                        <div className="col-span-3 flex items-center gap-2 rounded border border-red-400/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-400">
                          <AlertTriangle className="h-3 w-3" />
                          Failed to load proactive status
                        </div>
                      ) : (
                        <>
                          <div className="rounded bg-muted/30 px-2 py-2 text-center">
                            <p className="text-[10px] uppercase text-muted-foreground">Active</p>
                            <p className="text-base font-semibold">
                              {proactiveStateQuery.data.activeWork}
                            </p>
                          </div>
                          <div className="rounded bg-muted/30 px-2 py-2 text-center">
                            <p className="text-[10px] uppercase text-muted-foreground">Queued</p>
                            <p className="text-base font-semibold">
                              {proactiveStateQuery.data.queuedWork}
                            </p>
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
                            <Zap className="mr-1 h-3 w-3" />
                            Scan
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {setExtensionsSettings.isError && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Failed to save autonomy policy.
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Authority Snapshot</CardTitle>
            <CardDescription>
              Read-only extension inventory plus direct approval and grant controls.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!companyId ? (
              <p className="text-sm text-muted-foreground">
                Select a workspace to inspect extension authority.
              </p>
            ) : extensionsQuery.isLoading || mcpQuery.isLoading || authorityQuery.isLoading ? (
              <Skeleton className="h-28 rounded-lg" />
            ) : extensionsQuery.isError || mcpQuery.isError || authorityQuery.isError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                Failed to load extension authority state.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Skills
                  </p>
                  <p className="mt-1 text-lg font-semibold">{skillCount}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    MCP Extensions
                  </p>
                  <p className="mt-1 text-lg font-semibold">{mcpExtensionCount}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Enabled
                  </p>
                  <p className="mt-1 text-lg font-semibold">{enabledExtensionCount}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    MCP Runtimes
                  </p>
                  <p className="mt-1 text-lg font-semibold">
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
                <CardTitle className="text-base">Pending Authority Reviews</CardTitle>
                <CardDescription>
                  Extension requests stop here before sensitive capabilities or paths are granted.
                </CardDescription>
              </div>
              <Badge variant="outline">{pendingAuthorityRequests.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!companyId ? (
              <p className="text-sm text-muted-foreground">
                Select a workspace to review authority requests.
              </p>
            ) : authorityRequestsQuery.isLoading ? (
              <Skeleton className="h-24 rounded-lg" />
            ) : authorityRequestsQuery.isError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                Failed to load pending authority requests.
              </div>
            ) : pendingAuthorityRequests.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center">
                <CheckCircle2 className="mx-auto h-5 w-5 text-green-500" />
                <p className="mt-2 text-sm text-muted-foreground">
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
                      <div className="truncate text-sm font-medium text-foreground">
                        {extensionNameById.get(request.extensionId) ?? request.extensionId}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        <span>{request.resourceKind}</span>
                        <span>{request.requestedPermission}</span>
                        <span className="truncate">{request.resourceId}</span>
                      </div>
                      {request.reason && (
                        <p className="mt-2 text-[11px] text-muted-foreground">{request.reason}</p>
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
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Failed to review the selected authority request.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Active Authority Grants</CardTitle>
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
              <p className="text-sm text-muted-foreground">
                Select a workspace to inspect active grants.
              </p>
            ) : authorityQuery.isLoading || employeesQuery.isLoading ? (
              <Skeleton className="h-32 rounded-lg" />
            ) : authorityQuery.isError || employeesQuery.isError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                Failed to load active authority grants.
              </div>
            ) : authorityGrants.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center">
                <Workflow className="mx-auto h-5 w-5 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
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
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <FolderLock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="truncate">{grant.resourceId}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>{grant.resourceKind}</span>
                        <span>
                          {renderAuthorityScope(grant, employeeNameById, extensionNameById)}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline" className={permissionBadgeClass(grant.permission)}>
                        {grant.permission}
                      </Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
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
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Failed to remove the selected authority grant.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
