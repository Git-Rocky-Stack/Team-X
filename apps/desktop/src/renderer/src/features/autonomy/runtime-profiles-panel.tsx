import { useMemo, useState } from 'react';

import type {
  Employee,
  ProviderConfig,
  RuntimeProfile,
  RuntimeProfileKind,
  RuntimeProfileSummary,
} from '@team-x/shared-types';
import { Bot, CheckCircle2, Cpu, GitBranch, Globe, Link2, PlugZap, RefreshCw, Trash2 } from 'lucide-react';

import { useEmployees } from '@/hooks/use-employees.js';
import { useProviders } from '@/hooks/use-providers.js';
import {
  useBindEmployeeRuntimeProfile,
  useCreateRuntimeProfile,
  useDeleteRuntimeProfile,
  useRuntimeProfiles,
  useUpdateRuntimeProfile,
  useValidateRuntimeProfile,
} from '@/hooks/use-runtime-profiles.js';

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

const KIND_OPTIONS: Array<{ value: RuntimeProfileKind; label: string; description: string }> = [
  {
    value: 'teamx-internal',
    label: 'Team-X Internal',
    description: 'Execution-backed today through Team-X providers and models.',
  },
  {
    value: 'bash',
    label: 'Bash Launcher',
    description: 'Execution-backed today through a local launcher command and working directory.',
  },
  {
    value: 'http',
    label: 'HTTP Adapter',
    description: 'Execution-backed today through a remote runtime endpoint and health probe.',
  },
  {
    value: 'codex',
    label: 'Codex Adapter',
    description: 'Execution-backed when a Codex launcher command or endpoint URL is configured.',
  },
  {
    value: 'claude-code',
    label: 'Claude Code Adapter',
    description: 'Execution-backed when a Claude Code launcher command or endpoint URL is configured.',
  },
  {
    value: 'cursor',
    label: 'Cursor Adapter',
    description: 'Execution-backed when a Cursor launcher command or endpoint URL is configured.',
  },
];

interface RuntimeProfileDraft {
  name: string;
  kind: RuntimeProfileKind;
  enabled: boolean;
  providerId: string;
  model: string;
  command: string;
  workingDirectory: string;
  baseUrl: string;
  healthPath: string;
  endpointUrl: string;
}

function emptyDraft(kind: RuntimeProfileKind = 'teamx-internal'): RuntimeProfileDraft {
  return {
    name: '',
    kind,
    enabled: true,
    providerId: '',
    model: '',
    command: '',
    workingDirectory: '',
    baseUrl: '',
    healthPath: '',
    endpointUrl: '',
  };
}

function draftFromProfile(profile: RuntimeProfile): RuntimeProfileDraft {
  const config = (profile.config ?? {}) as Record<string, unknown>;
  return {
    name: profile.name,
    kind: profile.kind,
    enabled: profile.enabled,
    providerId: typeof config.providerId === 'string' ? config.providerId : '',
    model: typeof config.model === 'string' ? config.model : '',
    command: typeof config.command === 'string' ? config.command : '',
    workingDirectory: typeof config.workingDirectory === 'string' ? config.workingDirectory : '',
    baseUrl: typeof config.baseUrl === 'string' ? config.baseUrl : '',
    healthPath: typeof config.healthPath === 'string' ? config.healthPath : '',
    endpointUrl: typeof config.endpointUrl === 'string' ? config.endpointUrl : '',
  };
}

function buildConfig(draft: RuntimeProfileDraft): Record<string, unknown> {
  switch (draft.kind) {
    case 'teamx-internal':
      return {
        ...(draft.providerId.trim() ? { providerId: draft.providerId.trim() } : {}),
        ...(draft.model.trim() ? { model: draft.model.trim() } : {}),
      };
    case 'bash':
      return {
        ...(draft.command.trim() ? { command: draft.command.trim() } : {}),
        ...(draft.workingDirectory.trim()
          ? { workingDirectory: draft.workingDirectory.trim() }
          : {}),
      };
    case 'http':
      return {
        ...(draft.baseUrl.trim() ? { baseUrl: draft.baseUrl.trim() } : {}),
        ...(draft.healthPath.trim() ? { healthPath: draft.healthPath.trim() } : {}),
      };
    case 'codex':
    case 'claude-code':
    case 'cursor':
      return {
        ...(draft.command.trim() ? { command: draft.command.trim() } : {}),
        ...(draft.endpointUrl.trim() ? { endpointUrl: draft.endpointUrl.trim() } : {}),
      };
  }
}

function healthTone(status: RuntimeProfileSummary['lastHealthStatus']): 'default' | 'accent' | 'warning' | 'danger' {
  switch (status) {
    case 'healthy':
      return 'accent';
    case 'warning':
      return 'warning';
    case 'error':
      return 'danger';
    default:
      return 'default';
  }
}

function profileIcon(kind: RuntimeProfileKind) {
  switch (kind) {
    case 'teamx-internal':
      return Cpu;
    case 'bash':
      return PlugZap;
    case 'http':
      return Globe;
    case 'codex':
    case 'claude-code':
    case 'cursor':
      return GitBranch;
  }
}

function RuntimeConfigFields({
  draft,
  providers,
  onChange,
}: {
  draft: RuntimeProfileDraft;
  providers: ProviderConfig[];
  onChange: (patch: Partial<RuntimeProfileDraft>) => void;
}) {
  if (draft.kind === 'teamx-internal') {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-2">
          <div className={LABEL_CLASSNAME}>Provider</div>
          <select
            className={FIELD_CLASSNAME}
            value={draft.providerId}
            onChange={(event) => onChange({ providerId: event.target.value })}
          >
            <option value="">Follow current Team-X provider policy</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <div className={LABEL_CLASSNAME}>Model Override</div>
          <input
            className={FIELD_CLASSNAME}
            value={draft.model}
            onChange={(event) => onChange({ model: event.target.value })}
            placeholder="claude-haiku-4-5"
          />
        </label>
      </div>
    );
  }

  if (draft.kind === 'bash') {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-2">
          <div className={LABEL_CLASSNAME}>Command Path</div>
          <input
            className={FIELD_CLASSNAME}
            value={draft.command}
            onChange={(event) => onChange({ command: event.target.value })}
            placeholder="C:\\Tools\\runner.exe"
          />
        </label>
        <label className="space-y-2">
          <div className={LABEL_CLASSNAME}>Working Directory</div>
          <input
            className={FIELD_CLASSNAME}
            value={draft.workingDirectory}
            onChange={(event) => onChange({ workingDirectory: event.target.value })}
            placeholder="C:\\Projects\\My Workspace"
          />
        </label>
      </div>
    );
  }

  if (draft.kind === 'http') {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-2">
          <div className={LABEL_CLASSNAME}>Base URL</div>
          <input
            className={FIELD_CLASSNAME}
            value={draft.baseUrl}
            onChange={(event) => onChange({ baseUrl: event.target.value })}
            placeholder="http://127.0.0.1:8787"
          />
        </label>
        <label className="space-y-2">
          <div className={LABEL_CLASSNAME}>Health Path</div>
          <input
            className={FIELD_CLASSNAME}
            value={draft.healthPath}
            onChange={(event) => onChange({ healthPath: event.target.value })}
            placeholder="/health"
          />
        </label>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="space-y-2">
        <div className={LABEL_CLASSNAME}>Launcher Command</div>
        <input
          className={FIELD_CLASSNAME}
          value={draft.command}
          onChange={(event) => onChange({ command: event.target.value })}
          placeholder="codex"
        />
      </label>
      <label className="space-y-2">
        <div className={LABEL_CLASSNAME}>Endpoint URL</div>
        <input
          className={FIELD_CLASSNAME}
          value={draft.endpointUrl}
          onChange={(event) => onChange({ endpointUrl: event.target.value })}
          placeholder="http://127.0.0.1:8787"
        />
      </label>
    </div>
  );
}

function RuntimeProfileCard({
  profile,
  providers,
  onSave,
  onDelete,
  onValidate,
  saving,
  deleting,
  validating,
}: {
  profile: RuntimeProfileSummary;
  providers: ProviderConfig[];
  onSave: (profile: RuntimeProfileSummary, draft: RuntimeProfileDraft) => void;
  onDelete: (profileId: string) => void;
  onValidate: (profileId: string) => void;
  saving: boolean;
  deleting: boolean;
  validating: boolean;
}) {
  const [draft, setDraft] = useState<RuntimeProfileDraft>(() => draftFromProfile(profile));
  const Icon = profileIcon(profile.kind);

  return (
    <MissionInsetSurface className="space-y-4 p-4" data-runtime-profile-card={profile.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/10 bg-black/20 text-brand">
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">{profile.name}</div>
              <div className="text-xs text-muted-foreground">{profile.slug}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <MissionPill tone="accent">{profile.kind}</MissionPill>
            <MissionPill tone={healthTone(profile.lastHealthStatus)}>{profile.lastHealthStatus}</MissionPill>
            <MissionPill>{profile.executionMode}</MissionPill>
            <MissionPill>{profile.enabled ? 'enabled' : 'disabled'}</MissionPill>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MissionIconButton
            title="Validate runtime profile"
            disabled={validating}
            onClick={() => onValidate(profile.id)}
          >
            <RefreshCw className={`h-4 w-4 ${validating ? 'animate-spin' : ''}`} />
          </MissionIconButton>
          <MissionIconButton
            tone="danger"
            title="Delete runtime profile"
            disabled={deleting}
            onClick={() => onDelete(profile.id)}
          >
            <Trash2 className="h-4 w-4" />
          </MissionIconButton>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <MissionMetricTile
          label="Bound Employees"
          value={String(profile.boundEmployeeCount)}
          hint="Current assignment count"
          icon={Bot}
        />
        <MissionMetricTile
          label="Execution"
          value={profile.executionMode}
          hint={
            profile.executionMode === 'native'
              ? 'Execution-backed today'
              : 'Modeled for later runner wiring'
          }
          icon={Link2}
        />
        <MissionMetricTile
          label="Validation"
          value={profile.lastValidatedAt ? new Date(profile.lastValidatedAt).toLocaleTimeString() : 'never'}
          hint="Most recent health probe"
          icon={CheckCircle2}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
        <label className="space-y-2">
          <div className={LABEL_CLASSNAME}>Profile Name</div>
          <input
            className={FIELD_CLASSNAME}
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-2">
            <div className={LABEL_CLASSNAME}>Runtime Kind</div>
            <select
              className={FIELD_CLASSNAME}
              value={draft.kind}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  kind: event.target.value as RuntimeProfileKind,
                }))
              }
            >
              {KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <div className={LABEL_CLASSNAME}>Status</div>
            <select
              className={FIELD_CLASSNAME}
              value={draft.enabled ? 'enabled' : 'disabled'}
              onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.value === 'enabled' }))}
            >
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
          </label>
        </div>
      </div>

      <RuntimeConfigFields
        draft={draft}
        providers={providers}
        onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-muted-foreground">
          {profile.lastHealthMessage?.trim()
            ? profile.lastHealthMessage
            : 'No validation result is stored yet for this runtime profile.'}
        </p>
        <button
          type="button"
          className="rounded-[16px] border border-brand/20 bg-brand/10 px-4 py-2 text-xs font-semibold text-brand transition hover:bg-brand/15 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={saving}
          onClick={() => onSave(profile, draft)}
        >
          Save profile
        </button>
      </div>
    </MissionInsetSurface>
  );
}

export function RuntimeProfilesPanel({ companyId }: { companyId: string }) {
  const runtimeProfilesQuery = useRuntimeProfiles(companyId);
  const employeesQuery = useEmployees(companyId);
  const providersQuery = useProviders();
  const createMutation = useCreateRuntimeProfile(companyId);
  const updateMutation = useUpdateRuntimeProfile(companyId);
  const deleteMutation = useDeleteRuntimeProfile(companyId);
  const bindMutation = useBindEmployeeRuntimeProfile(companyId);
  const validateMutation = useValidateRuntimeProfile(companyId);

  const [draft, setDraft] = useState<RuntimeProfileDraft>(() => emptyDraft());

  const profiles = runtimeProfilesQuery.data ?? [];
  const employees = employeesQuery.data ?? [];
  const providers = providersQuery.data ?? [];
  const currentProfileByEmployee = useMemo(() => {
    const mapping = new Map<string, string>();
    for (const profile of profiles) {
      for (const employeeId of profile.boundEmployeeIds) {
        mapping.set(employeeId, profile.id);
      }
    }
    return mapping;
  }, [profiles]);

  const nativeCount = profiles.filter((profile) => profile.executionMode === 'native').length;
  const plannedCount = profiles.filter((profile) => profile.executionMode === 'planned').length;
  const boundEmployeeCount = currentProfileByEmployee.size;

  const createError =
    createMutation.error instanceof Error ? createMutation.error.message : null;
  const updateError =
    updateMutation.error instanceof Error ? updateMutation.error.message : null;
  const deleteError =
    deleteMutation.error instanceof Error ? deleteMutation.error.message : null;
  const bindError = bindMutation.error instanceof Error ? bindMutation.error.message : null;
  const validateError =
    validateMutation.error instanceof Error ? validateMutation.error.message : null;

  if (runtimeProfilesQuery.isLoading || employeesQuery.isLoading) {
    return (
      <MissionStateBlock
        title="Resolving runtime posture"
        description="Team-X is loading runtime profiles, provider posture, and employee bindings for this workspace."
        icon={Cpu}
      />
    );
  }

  if (runtimeProfilesQuery.isError || employeesQuery.isError) {
    return (
      <MissionStateBlock
        title="Runtime posture could not load"
        description="The runtime profile foundation is present, but this workspace read failed. Retry the view or inspect the main-process logs."
        icon={Cpu}
        tone="danger"
      />
    );
  }

  return (
    <div className="space-y-4" data-runtime-profiles-panel="">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MissionMetricTile
          label="Profiles"
          value={String(profiles.length)}
          hint="Named runtime postures in this workspace"
          icon={Cpu}
        />
        <MissionMetricTile
          label="Native"
          value={String(nativeCount)}
          hint="Execution-backed today"
          icon={CheckCircle2}
        />
        <MissionMetricTile
          label="Planned"
          value={String(plannedCount)}
          hint="Still missing a launcher or endpoint"
          icon={GitBranch}
        />
        <MissionMetricTile
          label="Bound Employees"
          value={String(boundEmployeeCount)}
          hint="Employees with explicit runtime posture"
          icon={Bot}
        />
      </div>

      <MissionInsetSurface className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-foreground">Create Runtime Profile</div>
            <p className="text-xs leading-5 text-muted-foreground">
              Team-X Internal, Bash Launcher, and HTTP Adapter are execution-backed now. Codex, Claude Code, and Cursor become execution-backed too as soon as you add a launcher command or endpoint URL.
            </p>
          </div>
          <MissionPill tone="accent">BYO agent posture</MissionPill>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_180px]">
          <label className="space-y-2">
            <div className={LABEL_CLASSNAME}>Profile Name</div>
            <input
              className={FIELD_CLASSNAME}
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Mission Control Internal"
            />
          </label>
          <label className="space-y-2">
            <div className={LABEL_CLASSNAME}>Runtime Kind</div>
            <select
              className={FIELD_CLASSNAME}
              value={draft.kind}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  kind: event.target.value as RuntimeProfileKind,
                }))
              }
            >
              {KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <div className={LABEL_CLASSNAME}>Status</div>
            <select
              className={FIELD_CLASSNAME}
              value={draft.enabled ? 'enabled' : 'disabled'}
              onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.value === 'enabled' }))}
            >
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
          </label>
        </div>

        <RuntimeConfigFields
          draft={draft}
          providers={providers}
          onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs leading-5 text-muted-foreground">
            {(KIND_OPTIONS.find((option) => option.value === draft.kind)?.description ??
              'Define the runtime posture this profile should capture.')}
          </div>
          <button
            type="button"
            className="rounded-[16px] border border-brand/20 bg-brand/10 px-4 py-2 text-xs font-semibold text-brand transition hover:bg-brand/15 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={createMutation.isPending}
            onClick={() => {
              createMutation.mutate(
                {
                  companyId,
                  name: draft.name,
                  kind: draft.kind,
                  enabled: draft.enabled,
                  config: buildConfig(draft),
                },
                {
                  onSuccess: () => setDraft(emptyDraft()),
                },
              );
            }}
          >
            Create profile
          </button>
        </div>

        {createError ? (
          <div className="text-xs text-red-200">{createError}</div>
        ) : null}
      </MissionInsetSurface>

      {profiles.length === 0 ? (
        <MissionStateBlock
          title="No runtime profiles are stored yet"
          description="Create a runtime profile above, then bind employees to it from the assignment board below."
          icon={Cpu}
        />
      ) : (
        <div className="space-y-4">
          {profiles.map((profile) => (
            <RuntimeProfileCard
              key={profile.id}
              profile={profile}
              providers={providers}
              onSave={(currentProfile, nextDraft) =>
                updateMutation.mutate({
                  profileId: currentProfile.id,
                  name: nextDraft.name,
                  kind: nextDraft.kind,
                  enabled: nextDraft.enabled,
                  config: buildConfig(nextDraft),
                })
              }
              onDelete={(profileId) => deleteMutation.mutate(profileId)}
              onValidate={(profileId) =>
                validateMutation.mutate({
                  companyId,
                  profileId,
                })
              }
              saving={updateMutation.isPending}
              deleting={deleteMutation.isPending}
              validating={
                validateMutation.isPending &&
                validateMutation.variables?.profileId === profile.id
              }
            />
          ))}
        </div>
      )}

      <MissionInsetSurface className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-foreground">Employee Bindings</div>
            <p className="text-xs leading-5 text-muted-foreground">
              Use the explicit runtime profile picker for each employee. The selector is workspace-scoped and intentionally obvious.
            </p>
          </div>
          <MissionPill>{employees.length} employees</MissionPill>
        </div>

        {employees.length === 0 ? (
          <MissionStateBlock
            title="No employees are available to bind"
            description="Hire at least one employee in this workspace to start assigning runtime posture."
            icon={Bot}
          />
        ) : (
          <div className="space-y-3">
            {employees.map((employee: Employee) => (
              <div
                key={employee.id}
                className="grid gap-3 rounded-[18px] border border-white/10 bg-black/10 p-3 md:grid-cols-[minmax(0,1fr)_280px]"
                data-runtime-employee-binding={employee.id}
              >
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-foreground">{employee.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {employee.title} • {employee.level}
                  </div>
                </div>
                <select
                  className={FIELD_CLASSNAME}
                  value={currentProfileByEmployee.get(employee.id) ?? ''}
                  onChange={(event) =>
                    bindMutation.mutate({
                      companyId,
                      employeeId: employee.id,
                      runtimeProfileId: event.target.value || null,
                    })
                  }
                >
                  <option value="">No explicit runtime profile</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name} ({profile.kind})
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {bindError ? <div className="text-xs text-red-200">{bindError}</div> : null}
        {updateError ? <div className="text-xs text-red-200">{updateError}</div> : null}
        {deleteError ? <div className="text-xs text-red-200">{deleteError}</div> : null}
        {validateError ? <div className="text-xs text-red-200">{validateError}</div> : null}
      </MissionInsetSurface>
    </div>
  );
}
