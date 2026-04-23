import { AlertTriangle, FolderLock, Loader2, Shield, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import { EXTENSIONS_AUTONOMY_MODES, type AuthorityGrant } from '@team-x/shared-types';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import {
  useAuthorityGrants,
  useDeleteSkillAssignment,
  useDeleteAuthorityGrant,
  useEffectiveAuthority,
  useInstalledExtensions,
  useSkillAssignments,
  useMcpTemplates,
  useMcpServers,
  useRemoveMcpServer,
  useToggleMcpServer,
  useUpsertSkillAssignment,
} from '@/hooks/use-extensions.js';
import { useEmployees } from '@/hooks/use-employees.js';
import { useExtensionsSettings, useSetExtensionsSettings } from '@/hooks/use-settings.js';
import { useAppStore } from '@/store/app-store.js';

import { GrantAuthorityDialog } from './grant-authority-dialog.js';
import { ImportMcpDialog } from './import-mcp-dialog.js';
import { InstallSkillDialog } from './install-skill-dialog.js';

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
  const skillAssignmentsQuery = useSkillAssignments(companyId);
  const mcpQuery = useMcpServers(companyId);
  const mcpTemplatesQuery = useMcpTemplates(companyId);
  const authorityQuery = useAuthorityGrants(companyId);
  const employeesQuery = useEmployees(companyId);
  const deleteGrant = useDeleteAuthorityGrant(companyId);
  const upsertSkillAssignment = useUpsertSkillAssignment(companyId);
  const deleteSkillAssignment = useDeleteSkillAssignment(companyId);
  const toggleMcpServer = useToggleMcpServer(companyId);
  const removeMcpServer = useRemoveMcpServer(companyId);
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [mcpDialogOpen, setMcpDialogOpen] = useState(false);
  const [skillDialogOpen, setSkillDialogOpen] = useState(false);
  const [previewEmployeeId, setPreviewEmployeeId] = useState<string | null>(null);

  const extensions = extensionsQuery.data ?? [];
  const skillAssignments = skillAssignmentsQuery.data ?? [];
  const employees = employeesQuery.data ?? [];
  const mcpExtensionsByRuntimeRefId = new Map(
    extensions
      .filter((extension) => extension.kind === 'mcp' && extension.runtimeRefId)
      .map((extension) => [extension.runtimeRefId!, extension]),
  );
  const effectiveAuthorityQuery = useEffectiveAuthority(companyId, previewEmployeeId);
  const employeeNameById = new Map(employees.map((employee) => [employee.id, employee.name]));
  const extensionNameById = new Map(extensions.map((extension) => [extension.id, extension.name]));
  const workspaceSkillAssignments = new Map(
    skillAssignments
      .filter((assignment) => assignment.employeeId === null)
      .map((assignment) => [assignment.extensionId, assignment]),
  );
  const employeeSkillAssignments = new Map(
    skillAssignments
      .filter((assignment) => assignment.employeeId !== null)
      .map((assignment) => [`${assignment.extensionId}:${assignment.employeeId}`, assignment]),
  );

  useEffect(() => {
    if (employees.length === 0) {
      setPreviewEmployeeId(null);
      return;
    }
    if (!previewEmployeeId || !employees.some((employee) => employee.id === previewEmployeeId)) {
      setPreviewEmployeeId(employees[0]?.id ?? null);
    }
  }, [employees, previewEmployeeId]);

  function renderAuthorityScope(grant: AuthorityGrant): string {
    if (grant.scopeKind === 'company') return 'Workspace default';
    if (grant.scopeKind === 'employee') {
      return employeeNameById.get(grant.scopeId) ?? `Employee ${grant.scopeId.slice(0, 8)}`;
    }
    return extensionNameById.get(grant.scopeId) ?? `Extension ${grant.scopeId.slice(0, 8)}`;
  }

  async function handleWorkspaceSkillToggle(extensionId: string, enabled: boolean) {
    if (!companyId) return;
    await upsertSkillAssignment.mutateAsync({
      companyId,
      extensionId,
      enabled,
    });
  }

  async function handleEmployeeSkillAssignment(
    extensionId: string,
    employeeId: string,
    nextValue: 'inherit' | 'enabled' | 'disabled',
  ) {
    if (!companyId) return;
    const existing = employeeSkillAssignments.get(`${extensionId}:${employeeId}`);
    if (nextValue === 'inherit') {
      if (existing) {
        await deleteSkillAssignment.mutateAsync(existing.id);
      }
      return;
    }
    await upsertSkillAssignment.mutateAsync({
      companyId,
      extensionId,
      employeeId,
      enabled: nextValue === 'enabled',
    });
  }

  const skillExtensions = extensions.filter((extension) => extension.kind === 'skill');
  const selectClass =
    'flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
  const showAuthorityPreview = companyId !== null && employees.length > 0;

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
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!companyId}
                onClick={() => setSkillDialogOpen(true)}
              >
                Install Skill
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!companyId ? (
              <p className="text-sm text-muted-foreground">
                Select a workspace to inspect installed skills.
              </p>
            ) : extensionsQuery.isLoading || skillAssignmentsQuery.isLoading ? (
              <Skeleton className="h-40 rounded-lg" />
            ) : extensionsQuery.isError || skillAssignmentsQuery.isError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                Failed to load installed skills.
              </div>
            ) : skillExtensions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No skills installed yet. Local folders and public GitHub installs land here first.
              </p>
            ) : (
              <div className="space-y-3">
                {skillExtensions.map((extension) => {
                  const workspaceAssignment = workspaceSkillAssignments.get(extension.id);
                  const workspaceEnabled = workspaceAssignment?.enabled ?? false;
                  const healthStatus =
                    typeof extension.manifest?.healthStatus === 'string'
                      ? extension.manifest.healthStatus
                      : 'healthy';
                  return (
                    <div key={extension.id} className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
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
                          <Badge variant="outline">{healthStatus}</Badge>
                          {!extension.enabled && <Badge variant="secondary">extension disabled</Badge>}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        <span>{extension.requestedCapabilities.length} capabilities</span>
                        <span>{extension.requestedPaths.length} paths</span>
                        <span>{extension.version ?? 'unversioned'}</span>
                        <span>{workspaceEnabled ? 'workspace enabled' : 'workspace disabled'}</span>
                      </div>

                      <div className="mt-4 rounded-lg border border-border/70 bg-background/70 px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium text-foreground">Workspace assignment</p>
                            <p className="text-[11px] text-muted-foreground">
                              Default state applied to every employee unless an override exists.
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant={workspaceEnabled ? 'outline' : 'default'}
                            size="sm"
                            className="h-8"
                            disabled={
                              upsertSkillAssignment.isPending ||
                              deleteSkillAssignment.isPending ||
                              !extension.enabled
                            }
                            onClick={() => handleWorkspaceSkillToggle(extension.id, !workspaceEnabled)}
                          >
                            {workspaceEnabled ? 'Disable Workspace Default' : 'Enable Workspace Default'}
                          </Button>
                        </div>
                      </div>

                      <div className="mt-4 space-y-2">
                        <div>
                          <p className="text-xs font-medium text-foreground">Employee overrides</p>
                          <p className="text-[11px] text-muted-foreground">
                            Override the workspace default per employee. Inherit removes the override.
                          </p>
                        </div>
                        {employees.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No employees available for per-person overrides yet.
                          </p>
                        ) : (
                          <div className="grid gap-2">
                            {employees.map((employee) => {
                              const employeeAssignment = employeeSkillAssignments.get(
                                `${extension.id}:${employee.id}`,
                              );
                              const value = employeeAssignment
                                ? employeeAssignment.enabled
                                  ? 'enabled'
                                  : 'disabled'
                                : 'inherit';
                              return (
                                <div
                                  key={`${extension.id}:${employee.id}`}
                                  className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/50 px-3 py-2"
                                >
                                  <div className="min-w-0">
                                    <div className="truncate text-sm text-foreground">{employee.name}</div>
                                    <div className="truncate text-[11px] text-muted-foreground">
                                      {employee.title}
                                    </div>
                                  </div>
                                  <select
                                    aria-label={`${extension.name} override for ${employee.name}`}
                                    value={value}
                                    onChange={(event) =>
                                      void handleEmployeeSkillAssignment(
                                        extension.id,
                                        employee.id,
                                        event.target.value as 'inherit' | 'enabled' | 'disabled',
                                      )
                                    }
                                    className={selectClass}
                                    disabled={upsertSkillAssignment.isPending || deleteSkillAssignment.isPending}
                                  >
                                    <option value="inherit">Inherit</option>
                                    <option value="enabled">Enabled</option>
                                    <option value="disabled">Disabled</option>
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
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
                  Runtime servers with provenance, trust state, and requested access from the extension
                  registry. Built-in templates install through the import flow.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!companyId}
                onClick={() => setMcpDialogOpen(true)}
              >
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
                {mcpQuery.data.map((server) => {
                  const extension = mcpExtensionsByRuntimeRefId.get(server.id);
                  return (
                    <div key={server.id} className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">{server.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {extension
                            ? `${extension.sourceKind} · ${extension.sourceRef}`
                            : `${server.transport} runtime`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={server.enabled ? 'default' : 'secondary'}>
                          {server.enabled ? 'enabled' : 'disabled'}
                        </Badge>
                        {extension && <Badge variant="outline">{extension.trustState}</Badge>}
                        {server.lastHealth && <Badge variant="outline">{server.lastHealth}</Badge>}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      <span>{server.transport}</span>
                      <span>{server.toolCount} tools</span>
                      {extension && <span>{extension.requestedCapabilities.length} capabilities</span>}
                      {extension && <span>{extension.requestedPaths.length} paths</span>}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          toggleMcpServer.mutate({
                            serverId: server.id,
                            enabled: !server.enabled,
                          })
                        }
                        disabled={toggleMcpServer.isPending || removeMcpServer.isPending}
                      >
                        {server.enabled ? 'Disable' : 'Enable'}
                      </Button>
                      {server.companyId !== null && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeMcpServer.mutate(server.id)}
                          disabled={toggleMcpServer.isPending || removeMcpServer.isPending}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No MCP servers are registered for this workspace.
                {mcpTemplatesQuery.data && mcpTemplatesQuery.data.length > 0
                  ? ` ${mcpTemplatesQuery.data.length} built-in template(s) are ready in Import MCP.`
                  : ''}
              </p>
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!companyId}
                onClick={() => setGrantDialogOpen(true)}
              >
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
            ) : (
              <div className="space-y-3">
                {showAuthorityPreview && (
                  <div className="rounded-lg border border-border/70 bg-muted/10 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-foreground">Effective preview</p>
                        <p className="text-[11px] text-muted-foreground">
                          Resolver-backed preview using role defaults plus company, extension, and employee layers.
                        </p>
                      </div>
                      <div className="w-56">
                        <select
                          aria-label="Authority preview employee"
                          value={previewEmployeeId ?? ''}
                          onChange={(event) => setPreviewEmployeeId(event.target.value || null)}
                          className={selectClass}
                        >
                          {employees.map((employee) => (
                            <option key={employee.id} value={employee.id}>
                              {employee.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="mt-3">
                      {effectiveAuthorityQuery.isLoading ? (
                        <Skeleton className="h-16 rounded-lg" />
                      ) : effectiveAuthorityQuery.isError || !effectiveAuthorityQuery.data ? (
                        <p className="text-xs text-destructive">Failed to resolve effective authority.</p>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            {effectiveAuthorityQuery.data.toolsAllowed.length > 0 ? (
                              effectiveAuthorityQuery.data.toolsAllowed.map((tool) => (
                                <Badge key={`allow:${tool}`} variant="default">
                                  allow {tool}
                                </Badge>
                              ))
                            ) : (
                              <Badge variant="outline">no explicit allowlist</Badge>
                            )}
                            {effectiveAuthorityQuery.data.toolsDenied.map((tool) => (
                              <Badge key={`deny:${tool}`} variant="destructive">
                                deny {tool}
                              </Badge>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {effectiveAuthorityQuery.data.entries
                              .filter((entry) => entry.resourceKind === 'path')
                              .map((entry) => (
                                <Badge
                                  key={`${entry.resourceKind}:${entry.resourceId}`}
                                  variant={permissionVariant(entry.permission)}
                                >
                                  {entry.permission} {entry.resourceId}
                                </Badge>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {authorityQuery.data && authorityQuery.data.length > 0 ? (
                  authorityQuery.data.map((grant) => (
                    <div
                      key={grant.id}
                      className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3"
                    >
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
                        <div className="flex items-center gap-2">
                          <Badge variant={permissionVariant(grant.permission)}>{grant.permission}</Badge>
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
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <GrantAuthorityDialog
        open={grantDialogOpen}
        onOpenChange={setGrantDialogOpen}
        companyId={companyId}
        employees={employees}
      />
      <InstallSkillDialog
        open={skillDialogOpen}
        onOpenChange={setSkillDialogOpen}
        companyId={companyId}
      />
      <ImportMcpDialog
        open={mcpDialogOpen}
        onOpenChange={setMcpDialogOpen}
        companyId={companyId}
      />
    </section>
  );
}
