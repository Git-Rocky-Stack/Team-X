import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AuthorityGrant,
  type AuthorityPermission,
  EXTENSIONS_AUTONOMY_MODES,
  type McpServerSummary,
} from '@team-x/shared-types';
import { Loader2, Plug, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ImportMcpDialog } from './import-mcp-dialog.js';
import { InstallSkillDialog } from './install-skill-dialog.js';

import {
  Faceplate,
  LampTile,
  type LampTone,
  MetricTile,
  SubviewState,
  Tag,
} from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
import { Switch } from '@/components/ui/switch.js';
import { useEmployees } from '@/hooks/use-employees.js';
import {
  useAuthorityGrants,
  useAuthorityRequests,
  useDeleteAuthorityGrant,
  useInstalledExtensions,
  useMcpServers,
  useRemoveMcpServer,
  useRemoveSkill,
  useReviewAuthorityRequest,
  useToggleMcpServer,
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

const PERMISSION_LABEL: Record<AuthorityPermission, string> = {
  allow: 'Allow',
  deny: 'Deny',
  prompt: 'Prompt',
};

// Permission is a tri-state STATUS, so it rides the console annunciator LEDs
// (Tag/Badge are neutral — status must be a LampTile). Three maximally
// distinct lamps preserve the original's at-a-glance coding: allow = GO
// (granted), deny = NO-GO (blocked, steady fault), prompt = HOLD (ask-first
// amber — the original amber, which a red `warn` would have erased).
const PERMISSION_TONE: Record<AuthorityPermission, LampTone> = {
  allow: 'go',
  deny: 'nogo',
  prompt: 'hold',
};

/**
 * Runtime lamp for an MCP server row — data-bound to the persisted enabled
 * flag and the last health probe the host recorded (`error: …` on a failed
 * connect). Disabled = STBY (process stopped), enabled + failed = NO-GO.
 */
function mcpServerLamp(server: McpServerSummary): { label: string; tone: LampTone } {
  if (!server.enabled) return { label: 'STBY', tone: 'off' };
  if (server.lastHealth?.startsWith('error')) return { label: 'NO-GO', tone: 'nogo' };
  return { label: 'GO', tone: 'go' };
}

/** Inline confirm row for a destructive removal (backup-section pattern). */
function ConfirmRemove({
  prompt,
  pending,
  onConfirm,
  onCancel,
}: {
  prompt: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-caption text-[var(--led-nogo)]">{prompt}</span>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        className="h-7 px-2 text-button-sm"
        onClick={onConfirm}
        disabled={pending}
      >
        Confirm
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-button-sm"
        onClick={onCancel}
      >
        Cancel
      </Button>
    </div>
  );
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
  const toggleMcp = useToggleMcpServer(companyId);
  const removeMcp = useRemoveMcpServer(companyId);
  const removeSkill = useRemoveSkill(companyId);
  // Which row is asking "remove this?" — `mcp:<id>` or `skill:<id>`.
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
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

  // Install dialog open/close — Authority Snapshot card hosts the entry points.
  // Two separate flags so each dialog manages its own state without coupling.
  const [skillDialogOpen, setSkillDialogOpen] = useState(false);
  const [mcpDialogOpen, setMcpDialogOpen] = useState(false);

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

  // MASTER switch — the workspace-wide `proactive_enabled` flag. Each
  // workspace opts in/out separately from its dashboard Proactive panel
  // (`proactive.setEnabled`), so this switch must never go through the
  // per-company channel.
  async function handleProactiveToggle(checked: boolean) {
    const previous = proactiveEnabledOptimistic;
    setProactiveEnabledOptimistic(checked);
    setProactiveToggling(true);
    try {
      await ipc.settings.setProactive({ enabled: checked });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['settings', 'proactive'] }),
        queryClient.invalidateQueries({ queryKey: ['proactive', 'state'] }),
      ]);
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
  const companySkills = extensions.filter(
    (extension) => extension.kind === 'skill' && extension.companyId === companyId,
  );
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
      <h2 className="text-h2 text-foreground">Extensions &amp; Authority</h2>
      <p className="text-body-sm text-muted-foreground mt-1">
        Stable authority controls for autonomy policy, installed extension state, and pending
        approvals. Marketplace installs have been removed from Settings until the replacement flow
        can be engineered without risking the whole page.
      </p>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Faceplate kicker="Autonomy" serial="POLICY" bodyClassName="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-h3 text-foreground">Autonomy Policy</h3>
              <p className="text-body-sm text-muted-foreground">
                Choose how aggressively Team-X auto-enables extensions and grants authority.
              </p>
            </div>
            {setExtensionsSettings.isPending && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Saving" />
            )}
          </div>

          {extensionsSettings.isLoading ? (
            <SubviewState
              lampLabel="SYNC"
              lampTone="hold"
              title="Loading autonomy settings…"
              className="min-h-0 p-6"
            />
          ) : extensionsSettings.isError || !extensionsSettings.data ? (
            <SubviewState
              lampLabel="NO-GO"
              lampTone="nogo"
              title="Failed to load autonomy settings."
              className="min-h-0 p-6"
            />
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
                          ? 'border-[var(--armed-edge)] bg-[var(--armed-soft)] text-foreground'
                          : 'border-[var(--hairline)] bg-transparent text-muted-foreground hover:border-[var(--hairline-strong)] hover:text-foreground',
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
              <div className="border-t border-[var(--hairline)] pt-3">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-body-strong">Proactive Mode</span>
                    <span className="text-caption text-muted-foreground">
                      Master switch for every workspace. Each workspace opts in or out from its
                      dashboard Proactive panel.
                    </span>
                  </div>
                  <Switch
                    checked={proactiveEnabled}
                    aria-label="Proactive master switch"
                    disabled={
                      proactiveSettingsQuery.isLoading ||
                      proactiveToggling ||
                      proactiveEnabledOptimistic === null
                    }
                    onCheckedChange={(checked) => void handleProactiveToggle(checked)}
                  />
                </div>

                {/* Proactive work status - only show when enabled */}
                {proactiveEnabled && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {proactiveStateQuery.isLoading || !proactiveStateQuery.data ? (
                      <SubviewState
                        lampLabel="SYNC"
                        lampTone="hold"
                        title="Loading proactive status…"
                        className="col-span-3 min-h-0 p-4"
                      />
                    ) : proactiveStateQuery.isError ? (
                      <div className="col-span-3 rounded-inset border border-[var(--led-nogo-edge)] bg-[var(--warn-soft)] px-2 py-1.5 text-body text-[var(--led-nogo)]">
                        Failed to load proactive status
                      </div>
                    ) : !proactiveStateQuery.data.enabled ? (
                      <SubviewState
                        lampLabel="STBY"
                        lampTone="off"
                        title="This workspace has opted out of proactive work."
                        description="Opt it back in from the dashboard Proactive panel."
                        className="col-span-3 min-h-0 p-4"
                      />
                    ) : (
                      <>
                        <MetricTile
                          label="Active"
                          value={String(proactiveStateQuery.data.activeWork)}
                        />
                        <MetricTile
                          label="Queued"
                          value={String(proactiveStateQuery.data.queuedWork)}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-full py-2"
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
                <div className="rounded-inset border border-[var(--led-nogo-edge)] bg-[var(--warn-soft)] px-3 py-2 text-body text-[var(--led-nogo)]">
                  Failed to save autonomy policy.
                </div>
              )}
            </>
          )}
        </Faceplate>

        <Faceplate kicker="Inventory" serial="SNAPSHOT" bodyClassName="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-h3 text-foreground">Authority Snapshot</h3>
              <p className="text-body-sm text-muted-foreground">
                Extension inventory plus direct install entry points for Skills and MCP servers.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                onClick={() => setSkillDialogOpen(true)}
                disabled={!companyId}
                data-extension-add-skill=""
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Add Skill
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                onClick={() => setMcpDialogOpen(true)}
                disabled={!companyId}
                data-extension-add-mcp=""
              >
                <Plug className="h-3.5 w-3.5" aria-hidden="true" />
                Add MCP
              </Button>
            </div>
          </div>

          {!companyId ? (
            <SubviewState
              lampLabel="STBY"
              lampTone="off"
              title="Select a workspace to inspect extension authority."
              className="min-h-0 p-6"
            />
          ) : extensionsQuery.isLoading || mcpQuery.isLoading || authorityQuery.isLoading ? (
            <SubviewState
              lampLabel="SYNC"
              lampTone="hold"
              title="Loading extension authority…"
              className="min-h-0 p-6"
            />
          ) : extensionsQuery.isError || mcpQuery.isError || authorityQuery.isError ? (
            <SubviewState
              lampLabel="NO-GO"
              lampTone="nogo"
              title="Failed to load extension authority state."
              className="min-h-0 p-6"
            />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <MetricTile label="Skills" value={String(skillCount)} />
              <MetricTile label="MCP Extensions" value={String(mcpExtensionCount)} />
              <MetricTile label="Enabled" value={String(enabledExtensionCount)} />
              <MetricTile label="MCP Runtimes" value={`${enabledMcpCount}/${mcpServers.length}`} />
            </div>
          )}
        </Faceplate>

        <Faceplate
          className="xl:col-span-2"
          kicker="Runtime"
          serial="INSTALLED"
          bodyClassName="space-y-4"
        >
          <div>
            <h3 className="text-h3 text-foreground">Installed Extensions</h3>
            <p className="text-body-sm text-muted-foreground">
              Stop, restart, or remove the MCP servers and skills this workspace has added.
              Disabling an MCP server stops its process.
            </p>
          </div>

          {!companyId ? (
            <SubviewState
              lampLabel="STBY"
              lampTone="off"
              title="Select a workspace to manage installed extensions."
              className="min-h-0 p-6"
            />
          ) : extensionsQuery.isLoading || mcpQuery.isLoading ? (
            <SubviewState
              lampLabel="SYNC"
              lampTone="hold"
              title="Loading installed extensions…"
              className="min-h-0 p-6"
            />
          ) : extensionsQuery.isError || mcpQuery.isError ? (
            <SubviewState
              lampLabel="NO-GO"
              lampTone="nogo"
              title="Failed to load installed extensions."
              className="min-h-0 p-6"
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="space-y-2" data-installed-mcp-servers="">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-label text-silver-mute">MCP Servers</span>
                  <Tag mono>{mcpServers.length}</Tag>
                </div>
                {mcpServers.length === 0 ? (
                  <SubviewState
                    lampLabel="STBY"
                    lampTone="off"
                    title="No MCP servers added."
                    description="Use Add MCP above to connect one."
                    className="min-h-0 p-4"
                  />
                ) : (
                  mcpServers.map((server) => {
                    const lamp = mcpServerLamp(server);
                    const pendingToggle =
                      toggleMcp.isPending && toggleMcp.variables?.serverId === server.id;
                    const checked = pendingToggle
                      ? (toggleMcp.variables?.enabled ?? server.enabled)
                      : server.enabled;
                    const confirmKey = `mcp:${server.id}`;
                    return (
                      <div
                        key={server.id}
                        className="rounded-inset border border-[var(--hairline)] px-3 py-3"
                        data-mcp-server-row={server.id}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div
                              className="truncate text-body-strong text-foreground"
                              data-mcp-server-name=""
                            >
                              {server.name}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <Tag>{server.transport}</Tag>
                              <Tag mono>{`${server.toolCount} tools`}</Tag>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <LampTile small label={lamp.label} tone={lamp.tone} />
                            <Switch
                              checked={checked}
                              aria-label={`Enable ${server.name}`}
                              disabled={pendingToggle || removeMcp.isPending}
                              onCheckedChange={(enabled) =>
                                toggleMcp.mutate({ serverId: server.id, enabled })
                              }
                            />
                            {confirmRemove !== confirmKey && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-button-sm"
                                aria-label={`Remove ${server.name}`}
                                onClick={() => setConfirmRemove(confirmKey)}
                                disabled={removeMcp.isPending}
                              >
                                Remove
                              </Button>
                            )}
                          </div>
                        </div>
                        {confirmRemove === confirmKey && (
                          <div className="mt-2">
                            <ConfirmRemove
                              prompt="Remove this server? Its process stops and its grants are deleted."
                              pending={removeMcp.isPending}
                              onConfirm={() => {
                                removeMcp.mutate(server.id);
                                setConfirmRemove(null);
                              }}
                              onCancel={() => setConfirmRemove(null)}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                {toggleMcp.isError && (
                  <div className="rounded-inset border border-[var(--led-nogo-edge)] bg-[var(--warn-soft)] px-3 py-2 text-body text-[var(--led-nogo)]">
                    Failed to update the MCP server.
                  </div>
                )}
                {removeMcp.isError && (
                  <div className="rounded-inset border border-[var(--led-nogo-edge)] bg-[var(--warn-soft)] px-3 py-2 text-body text-[var(--led-nogo)]">
                    Failed to remove the MCP server.
                  </div>
                )}
              </div>

              <div className="space-y-2" data-installed-skills="">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-label text-silver-mute">Skills</span>
                  <Tag mono>{companySkills.length}</Tag>
                </div>
                {companySkills.length === 0 ? (
                  <SubviewState
                    lampLabel="STBY"
                    lampTone="off"
                    title="No skills installed."
                    description="Use Add Skill above to install one."
                    className="min-h-0 p-4"
                  />
                ) : (
                  companySkills.map((extension) => {
                    const confirmKey = `skill:${extension.id}`;
                    return (
                      <div
                        key={extension.id}
                        className="rounded-inset border border-[var(--hairline)] px-3 py-3"
                        data-skill-row={extension.id}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div
                              className="truncate text-body-strong text-foreground"
                              data-skill-name=""
                            >
                              {extension.name}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <Tag>{extension.sourceKind}</Tag>
                              {extension.version && <Tag mono>{`v${extension.version}`}</Tag>}
                            </div>
                          </div>
                          {confirmRemove !== confirmKey && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 shrink-0 px-2 text-button-sm"
                              aria-label={`Remove ${extension.name}`}
                              onClick={() => setConfirmRemove(confirmKey)}
                              disabled={removeSkill.isPending}
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                        {confirmRemove === confirmKey && (
                          <div className="mt-2">
                            <ConfirmRemove
                              prompt="Remove this skill? Its grants and installed files are deleted."
                              pending={removeSkill.isPending}
                              onConfirm={() => {
                                removeSkill.mutate(extension.id);
                                setConfirmRemove(null);
                              }}
                              onCancel={() => setConfirmRemove(null)}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                {removeSkill.isError && (
                  <div className="rounded-inset border border-[var(--led-nogo-edge)] bg-[var(--warn-soft)] px-3 py-2 text-body text-[var(--led-nogo)]">
                    Failed to remove the skill.
                  </div>
                )}
              </div>
            </div>
          )}
        </Faceplate>

        <Faceplate
          className="xl:col-span-2"
          kicker="Reviews"
          serial="PENDING"
          bodyClassName="space-y-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-h3 text-foreground">Pending Authority Reviews</h3>
              <p className="text-body-sm text-muted-foreground">
                Extension requests stop here before sensitive capabilities or paths are granted.
              </p>
            </div>
            <Tag mono>{pendingAuthorityRequests.length}</Tag>
          </div>

          {!companyId ? (
            <SubviewState
              lampLabel="STBY"
              lampTone="off"
              title="Select a workspace to review authority requests."
              className="min-h-0 p-6"
            />
          ) : authorityRequestsQuery.isLoading ? (
            <SubviewState
              lampLabel="SYNC"
              lampTone="hold"
              title="Loading pending authority requests…"
              className="min-h-0 p-6"
            />
          ) : authorityRequestsQuery.isError ? (
            <SubviewState
              lampLabel="NO-GO"
              lampTone="nogo"
              title="Failed to load pending authority requests."
              className="min-h-0 p-6"
            />
          ) : pendingAuthorityRequests.length === 0 ? (
            <SubviewState
              lampLabel="STBY"
              lampTone="off"
              title="No pending extension authority requests."
              className="min-h-0 p-6"
            />
          ) : (
            pendingAuthorityRequests.map((request) => (
              <div
                key={request.id}
                className="rounded-inset border border-[var(--hairline)] px-3 py-3"
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
            <div className="rounded-inset border border-[var(--led-nogo-edge)] bg-[var(--warn-soft)] px-3 py-2 text-body text-[var(--led-nogo)]">
              Failed to review the selected authority request.
            </div>
          )}
        </Faceplate>

        <Faceplate
          className="xl:col-span-2"
          kicker="Grants"
          serial="ACTIVE"
          bodyClassName="space-y-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-h3 text-foreground">Active Authority Grants</h3>
              <p className="text-body-sm text-muted-foreground">
                Existing workspace, employee, and extension grants. New grant creation will move
                into the redesigned authority workflow.
              </p>
            </div>
            <Tag mono>{authorityGrants.length}</Tag>
          </div>

          {!companyId ? (
            <SubviewState
              lampLabel="STBY"
              lampTone="off"
              title="Select a workspace to inspect active grants."
              className="min-h-0 p-6"
            />
          ) : authorityQuery.isLoading || employeesQuery.isLoading ? (
            <SubviewState
              lampLabel="SYNC"
              lampTone="hold"
              title="Loading active authority grants…"
              className="min-h-0 p-6"
            />
          ) : authorityQuery.isError || employeesQuery.isError ? (
            <SubviewState
              lampLabel="NO-GO"
              lampTone="nogo"
              title="Failed to load active authority grants."
              className="min-h-0 p-6"
            />
          ) : authorityGrants.length === 0 ? (
            <SubviewState
              lampLabel="STBY"
              lampTone="off"
              title="No explicit grants recorded yet."
              description="Role defaults remain the current baseline."
              className="min-h-0 p-6"
            />
          ) : (
            authorityGrants.map((grant) => (
              <div
                key={grant.id}
                className="rounded-inset border border-[var(--hairline)] px-3 py-3"
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
                    <LampTile
                      small
                      label={PERMISSION_LABEL[grant.permission]}
                      tone={PERMISSION_TONE[grant.permission]}
                    />
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
            <div className="rounded-inset border border-[var(--led-nogo-edge)] bg-[var(--warn-soft)] px-3 py-2 text-body text-[var(--led-nogo)]">
              Failed to remove the selected authority grant.
            </div>
          )}
        </Faceplate>
      </div>

      <InstallSkillDialog
        open={skillDialogOpen}
        onOpenChange={setSkillDialogOpen}
        companyId={companyId}
      />
      <ImportMcpDialog open={mcpDialogOpen} onOpenChange={setMcpDialogOpen} companyId={companyId} />
    </section>
  );
}
