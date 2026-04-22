import { AlertTriangle, FolderLock, Loader2, Shield, Sparkles } from 'lucide-react';

import { EXTENSIONS_AUTONOMY_MODES, type AuthorityGrant } from '@team-x/shared-types';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useInstalledExtensions, useAuthorityGrants, useMcpServers } from '@/hooks/use-extensions.js';
import { useEmployees } from '@/hooks/use-employees.js';
import { useExtensionsSettings, useSetExtensionsSettings } from '@/hooks/use-settings.js';
import { useAppStore } from '@/store/app-store.js';

const AUTONOMY_COPY: Record<(typeof EXTENSIONS_AUTONOMY_MODES)[number], string> = {
  balanced: 'Auto-enable low-risk installs, but stop for sensitive capability or path expansion.',
  conservative: 'New installs stay inert until explicitly reviewed and approved.',
  autonomous: 'Auto-enable and auto-grant unless a request hits a hard platform deny.',
};

function permissionVariant(permission: AuthorityGrant['permission']): 'default' | 'secondary' | 'destructive' {
  if (permission === 'deny') return 'destructive';
  if (permission === 'prompt') return 'secondary';
  return 'default';
}

export function ExtensionsSection() {
  const companyId = useAppStore((state) => state.companyId);
  const extensionsSettings = useExtensionsSettings();
  const setExtensionsSettings = useSetExtensionsSettings();
  const extensionsQuery = useInstalledExtensions(companyId);
  const mcpQuery = useMcpServers(companyId);
  const authorityQuery = useAuthorityGrants(companyId);
  const employeesQuery = useEmployees(companyId);

  const extensions = extensionsQuery.data ?? [];
  const employees = employeesQuery.data ?? [];
  const employeeNameById = new Map(employees.map((employee) => [employee.id, employee.name]));
  const extensionNameById = new Map(extensions.map((extension) => [extension.id, extension.name]));

  function renderAuthorityScope(grant: AuthorityGrant): string {
    if (grant.scopeKind === 'company') return 'Workspace default';
    if (grant.scopeKind === 'employee') {
      return employeeNameById.get(grant.scopeId) ?? `Employee ${grant.scopeId.slice(0, 8)}`;
    }
    return extensionNameById.get(grant.scopeId) ?? `Extension ${grant.scopeId.slice(0, 8)}`;
  }

  const skillExtensions = extensions.filter((extension) => extension.kind === 'skill');

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Extensions & Authority
        </h4>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Govern installed skills, MCP servers, and workspace authority from one control plane.
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
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Installed Skills</CardTitle>
                <CardDescription>
                  Workspace-visible skills with provenance, trust, and requested access.
                </CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" disabled>
                Install Skill
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!companyId ? (
              <p className="text-sm text-muted-foreground">
                Select a workspace to inspect installed skills.
              </p>
            ) : extensionsQuery.isLoading ? (
              <Skeleton className="h-40 rounded-lg" />
            ) : extensionsQuery.isError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                Failed to load installed skills.
              </div>
            ) : skillExtensions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No skills installed yet. Local, GitHub, and marketplace installs land here next.
              </p>
            ) : (
              <div className="space-y-3">
                {skillExtensions.map((extension) => (
                  <div key={extension.id} className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {extension.name}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {extension.sourceKind} · {extension.sourceRef}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{extension.trustState}</Badge>
                        {!extension.enabled && <Badge variant="secondary">disabled</Badge>}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      <span>{extension.requestedCapabilities.length} capabilities</span>
                      <span>{extension.requestedPaths.length} paths</span>
                      <span>{extension.version ?? 'unversioned'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">MCP Servers</CardTitle>
                <CardDescription>
                  Current runtime servers. Provenance bridging into the extension registry lands next.
                </CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" disabled>
                Import MCP
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!companyId ? (
              <p className="text-sm text-muted-foreground">
                Select a workspace to inspect MCP availability.
              </p>
            ) : mcpQuery.isLoading ? (
              <Skeleton className="h-40 rounded-lg" />
            ) : mcpQuery.isError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                Failed to load MCP servers.
              </div>
            ) : mcpQuery.data && mcpQuery.data.length > 0 ? (
              <div className="space-y-3">
                {mcpQuery.data.map((server) => (
                  <div key={server.id} className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">{server.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {server.transport} · {server.toolCount} tools
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={server.enabled ? 'default' : 'secondary'}>
                          {server.enabled ? 'enabled' : 'disabled'}
                        </Badge>
                        {server.lastHealth && <Badge variant="outline">{server.lastHealth}</Badge>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No MCP servers are registered for this workspace.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Authority Matrix</CardTitle>
                <CardDescription>
                  Effective workspace grants from company defaults, employee overrides, and extension requests.
                </CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" disabled>
                Grant Path
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!companyId ? (
              <p className="text-sm text-muted-foreground">
                Select a workspace to inspect current authority grants.
              </p>
            ) : authorityQuery.isLoading ? (
              <Skeleton className="h-40 rounded-lg" />
            ) : authorityQuery.isError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                Failed to load authority grants.
              </div>
            ) : authorityQuery.data && authorityQuery.data.length > 0 ? (
              <div className="space-y-3">
                {authorityQuery.data.map((grant) => (
                  <div key={grant.id} className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <FolderLock className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="truncate">{grant.resourceId}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>{grant.resourceKind}</span>
                          <span>{renderAuthorityScope(grant)}</span>
                        </div>
                      </div>
                      <Badge variant={permissionVariant(grant.permission)}>{grant.permission}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center">
                <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  No explicit grants recorded yet. Role defaults remain the current baseline.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
