import { stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import type {
  EmployeeRuntimeBinding,
  RuntimeProfile,
  RuntimeProfileExecutionMode,
  RuntimeProfileHealthStatus,
  RuntimeProfileKind,
  RuntimeProfileSummary,
  RuntimeProfileValidation,
} from '@team-x/shared-types';

import type { EmployeeRow } from '../db/repos/employees.js';
import type {
  EmployeeRuntimeBindingRow,
  RuntimeProfilesRepo,
  RuntimeProfileRow,
} from '../db/repos/runtime-profiles.js';
import type { ProvidersService } from './providers.js';

type FetchLike = typeof fetch;
type StatLike = typeof stat;

export interface CreateRuntimeProfileInput {
  companyId: string;
  name: string;
  kind: RuntimeProfileKind;
  enabled?: boolean;
  config?: Record<string, unknown> | null;
}

export interface UpdateRuntimeProfileInput {
  profileId: string;
  name?: string;
  kind?: RuntimeProfileKind;
  enabled?: boolean;
  config?: Record<string, unknown> | null;
}

export interface BindEmployeeRuntimeInput {
  companyId: string;
  employeeId: string;
  runtimeProfileId: string | null;
}

export interface ValidateRuntimeProfileInput {
  companyId: string;
  profileId: string;
}

export interface RuntimeProfilesServiceDeps {
  runtimeProfilesRepo: RuntimeProfilesRepo;
  employeesRepo: {
    getById(id: string): EmployeeRow | null;
  };
  providersService: ProvidersService;
  fetchFn?: FetchLike;
  statFn?: StatLike;
}

export interface RuntimeProfilesService {
  list(companyId: string): RuntimeProfileSummary[];
  create(input: CreateRuntimeProfileInput): string;
  update(input: UpdateRuntimeProfileInput): void;
  delete(profileId: string): void;
  bindEmployee(input: BindEmployeeRuntimeInput): EmployeeRuntimeBinding | null;
  validateProfile(input: ValidateRuntimeProfileInput): Promise<RuntimeProfileValidation>;
  getProfileForEmployee(employeeId: string): RuntimeProfile | null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function ensureNonEmptyString(value: string, label: string): string {
  const next = value.trim();
  if (next.length === 0) {
    throw new Error(`[runtime-profiles] ${label} is required`);
  }
  return next;
}

function parseConfigJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through to null.
  }
  return null;
}

function normalizeConfig(input: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  return { ...input };
}

function getOptionalString(
  config: Record<string, unknown>,
  key: string,
): string | null {
  const value = config[key];
  if (typeof value !== 'string') return null;
  const next = value.trim();
  return next.length > 0 ? next : null;
}

function getExecutionMode(kind: RuntimeProfileKind): RuntimeProfileExecutionMode {
  return kind === 'teamx-internal' ? 'native' : 'planned';
}

function rowToRuntimeProfile(row: RuntimeProfileRow): RuntimeProfile {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    slug: row.slug,
    kind: row.kind as RuntimeProfileKind,
    enabled: row.enabled,
    config: parseConfigJson(row.configJson),
    lastHealthStatus: row.lastHealthStatus as RuntimeProfileHealthStatus,
    lastHealthMessage: row.lastHealthMessage,
    lastValidatedAt: row.lastValidatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function bindingRowToBinding(row: EmployeeRuntimeBindingRow): EmployeeRuntimeBinding {
  return {
    id: row.id,
    companyId: row.companyId,
    employeeId: row.employeeId,
    runtimeProfileId: row.runtimeProfileId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function nextSlug(
  companyId: string,
  name: string,
  profiles: RuntimeProfile[],
  exceptId?: string,
): string {
  const base = slugify(name) || slugify(companyId) || 'runtime-profile';
  const taken = new Set(
    profiles.filter((profile) => profile.id !== exceptId).map((profile) => profile.slug),
  );
  if (!taken.has(base)) return base;
  let index = 2;
  while (taken.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function makeValidation(
  input: Omit<RuntimeProfileValidation, 'checkedAt'>,
  checkedAt: number,
): RuntimeProfileValidation {
  return {
    ...input,
    checkedAt,
  };
}

export function createRuntimeProfilesService(
  deps: RuntimeProfilesServiceDeps,
): RuntimeProfilesService {
  const {
    runtimeProfilesRepo,
    employeesRepo,
    providersService,
    fetchFn = fetch,
    statFn = stat,
  } = deps;

  async function validateInternalProfile(
    profile: RuntimeProfile,
    checkedAt: number,
  ): Promise<RuntimeProfileValidation> {
    const config = normalizeConfig(profile.config);
    const providerId = getOptionalString(config, 'providerId');
    const model = getOptionalString(config, 'model');

    if (providerId) {
      const provider = providersService.get(providerId);
      if (!provider) {
        return makeValidation(
          {
            profileId: profile.id,
            status: 'error',
            message: `Provider "${providerId}" is not registered in Team-X.`,
            supportsExecution: true,
            details: { providerId, model },
          },
          checkedAt,
        );
      }
      if (!provider.enabled) {
        return makeValidation(
          {
            profileId: profile.id,
            status: 'warning',
            message: `Provider "${provider.name}" is registered but currently disabled.`,
            supportsExecution: true,
            details: { providerId, model },
          },
          checkedAt,
        );
      }
      const configured = await providersService.isConfigured(providerId);
      return makeValidation(
        {
          profileId: profile.id,
          status: configured ? 'healthy' : 'warning',
          message: configured
            ? `Internal runtime is ready via ${provider.name}${model ? ` using ${model}` : ''}.`
            : `Provider "${provider.name}" exists but is not configured yet.`,
          supportsExecution: true,
          details: { providerId, model },
        },
        checkedAt,
      );
    }

    const providers = providersService.list().filter((provider) => provider.enabled);
    for (const provider of providers) {
      if (await providersService.isConfigured(provider.id)) {
        return makeValidation(
          {
            profileId: profile.id,
            status: 'healthy',
            message: `Internal runtime can execute through the configured provider "${provider.name}".`,
            supportsExecution: true,
            details: { providerId: provider.id, model },
          },
          checkedAt,
        );
      }
    }

    return makeValidation(
      {
        profileId: profile.id,
        status: 'warning',
        message: 'No configured Team-X provider is currently available for this internal runtime.',
        supportsExecution: true,
        details: { providerId: null, model },
      },
      checkedAt,
    );
  }

  async function validateBashProfile(
    profile: RuntimeProfile,
    checkedAt: number,
  ): Promise<RuntimeProfileValidation> {
    const config = normalizeConfig(profile.config);
    const command = getOptionalString(config, 'command');
    const workingDirectory = getOptionalString(config, 'workingDirectory');

    if (!command) {
      return makeValidation(
        {
          profileId: profile.id,
          status: 'error',
          message: 'Bash runtime profiles require a command path or launcher command.',
          supportsExecution: false,
          details: null,
        },
        checkedAt,
      );
    }

    if (!isAbsolute(command)) {
      return makeValidation(
        {
          profileId: profile.id,
          status: 'warning',
          message:
            'A local launcher command is recorded, but deterministic validation in this slice expects an absolute command path.',
          supportsExecution: false,
          details: { command, workingDirectory },
        },
        checkedAt,
      );
    }

    try {
      const commandStats = await statFn(command);
      if (!commandStats.isFile()) {
        return makeValidation(
          {
            profileId: profile.id,
            status: 'error',
            message: `Command path exists but is not a file: ${command}`,
            supportsExecution: false,
            details: { command, workingDirectory },
          },
          checkedAt,
        );
      }
      if (workingDirectory) {
        const cwdStats = await statFn(workingDirectory);
        if (!cwdStats.isDirectory()) {
          return makeValidation(
            {
              profileId: profile.id,
              status: 'error',
              message: `Working directory exists but is not a directory: ${workingDirectory}`,
              supportsExecution: false,
              details: { command, workingDirectory },
            },
            checkedAt,
          );
        }
      }
      return makeValidation(
        {
          profileId: profile.id,
          status: 'healthy',
          message: 'Local launcher path and working directory resolved successfully.',
          supportsExecution: false,
          details: { command, workingDirectory },
        },
        checkedAt,
      );
    } catch (err) {
      return makeValidation(
        {
          profileId: profile.id,
          status: 'error',
          message:
            err instanceof Error ? err.message : `Unable to validate local command path: ${command}`,
          supportsExecution: false,
          details: { command, workingDirectory },
        },
        checkedAt,
      );
    }
  }

  async function validateHttpProfile(
    profile: RuntimeProfile,
    checkedAt: number,
  ): Promise<RuntimeProfileValidation> {
    const config = normalizeConfig(profile.config);
    const baseUrl = getOptionalString(config, 'baseUrl');
    const healthPath = getOptionalString(config, 'healthPath');

    if (!baseUrl) {
      return makeValidation(
        {
          profileId: profile.id,
          status: 'error',
          message: 'HTTP runtime profiles require a base URL.',
          supportsExecution: false,
          details: null,
        },
        checkedAt,
      );
    }

    let targetUrl: string;
    try {
      targetUrl = new URL(healthPath ?? '/', baseUrl).toString();
    } catch {
      return makeValidation(
        {
          profileId: profile.id,
          status: 'error',
          message: `Base URL is not valid: ${baseUrl}`,
          supportsExecution: false,
          details: { baseUrl, healthPath },
        },
        checkedAt,
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetchFn(targetUrl, {
        method: 'GET',
        signal: controller.signal,
      });
      return makeValidation(
        {
          profileId: profile.id,
          status: response.ok ? 'healthy' : 'error',
          message: response.ok
            ? `HTTP runtime responded successfully from ${targetUrl}.`
            : `HTTP runtime returned ${response.status} from ${targetUrl}.`,
          supportsExecution: false,
          details: { baseUrl, healthPath, targetUrl, status: response.status },
        },
        checkedAt,
      );
    } catch (err) {
      return makeValidation(
        {
          profileId: profile.id,
          status: 'error',
          message:
            err instanceof Error
              ? err.message
              : `HTTP runtime could not be reached at ${targetUrl}.`,
          supportsExecution: false,
          details: { baseUrl, healthPath, targetUrl },
        },
        checkedAt,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function validatePlaceholderProfile(
    profile: RuntimeProfile,
    checkedAt: number,
  ): Promise<RuntimeProfileValidation> {
    const config = normalizeConfig(profile.config);
    const command = getOptionalString(config, 'command');
    const endpointUrl = getOptionalString(config, 'endpointUrl');
    if (!command && !endpointUrl) {
      return makeValidation(
        {
          profileId: profile.id,
          status: 'error',
          message: 'Adapter placeholders need either a command or an endpoint URL.',
          supportsExecution: false,
          details: null,
        },
        checkedAt,
      );
    }

    return makeValidation(
      {
        profileId: profile.id,
        status: 'warning',
        message:
          'Adapter posture is recorded and assignable, but direct execution wiring lands in a later slice.',
        supportsExecution: false,
        details: {
          command,
          endpointUrl,
          kind: profile.kind,
        },
      },
      checkedAt,
    );
  }

  async function validateByKind(
    profile: RuntimeProfile,
    checkedAt: number,
  ): Promise<RuntimeProfileValidation> {
    switch (profile.kind) {
      case 'teamx-internal':
        return validateInternalProfile(profile, checkedAt);
      case 'bash':
        return validateBashProfile(profile, checkedAt);
      case 'http':
        return validateHttpProfile(profile, checkedAt);
      case 'codex':
      case 'claude-code':
      case 'cursor':
        return validatePlaceholderProfile(profile, checkedAt);
    }
  }

  function listProfiles(companyId: string): RuntimeProfileSummary[] {
    const profiles = runtimeProfilesRepo.listByCompany(companyId).map(rowToRuntimeProfile);
    const bindings = runtimeProfilesRepo.listBindingsByCompany(companyId);
    const employeesByProfile = new Map<string, string[]>();
    for (const binding of bindings) {
      const current = employeesByProfile.get(binding.runtimeProfileId) ?? [];
      current.push(binding.employeeId);
      employeesByProfile.set(binding.runtimeProfileId, current);
    }
    return profiles.map((profile) => {
      const boundEmployeeIds = employeesByProfile.get(profile.id) ?? [];
      return {
        ...profile,
        executionMode: getExecutionMode(profile.kind),
        boundEmployeeIds,
        boundEmployeeCount: boundEmployeeIds.length,
      };
    });
  }

  return {
    list(companyId: string): RuntimeProfileSummary[] {
      return listProfiles(companyId);
    },

    create(input: CreateRuntimeProfileInput): string {
      const name = ensureNonEmptyString(input.name, 'name');
      const profiles = listProfiles(input.companyId);
      return runtimeProfilesRepo.create({
        companyId: input.companyId,
        name,
        slug: nextSlug(input.companyId, name, profiles),
        kind: input.kind,
        enabled: input.enabled ?? true,
        configJson: JSON.stringify(normalizeConfig(input.config)),
      });
    },

    update(input: UpdateRuntimeProfileInput): void {
      const existingRow = runtimeProfilesRepo.getById(input.profileId);
      if (!existingRow) {
        throw new Error(`[runtime-profiles] profile not found: ${input.profileId}`);
      }
      const existing = rowToRuntimeProfile(existingRow);
      const nextName = input.name !== undefined ? ensureNonEmptyString(input.name, 'name') : undefined;
      const profiles = listProfiles(existing.companyId);
      const shouldResetHealth =
        input.kind !== undefined || input.config !== undefined || input.enabled !== undefined;
      runtimeProfilesRepo.update(input.profileId, {
        name: nextName,
        slug:
          nextName !== undefined
            ? nextSlug(existing.companyId, nextName, profiles, input.profileId)
            : undefined,
        kind: input.kind,
        enabled: input.enabled,
        configJson:
          input.config !== undefined ? JSON.stringify(normalizeConfig(input.config)) : undefined,
        lastHealthStatus: shouldResetHealth ? 'unknown' : undefined,
        lastHealthMessage: shouldResetHealth ? null : undefined,
        lastValidatedAt: shouldResetHealth ? null : undefined,
      });
    },

    delete(profileId: string): void {
      runtimeProfilesRepo.delete(profileId);
    },

    bindEmployee(input: BindEmployeeRuntimeInput): EmployeeRuntimeBinding | null {
      const employee = employeesRepo.getById(input.employeeId);
      if (!employee) {
        throw new Error(`[runtime-profiles] employee not found: ${input.employeeId}`);
      }
      if (employee.companyId !== input.companyId) {
        throw new Error(
          `[runtime-profiles] employee ${input.employeeId} does not belong to company ${input.companyId}`,
        );
      }

      if (input.runtimeProfileId === null) {
        runtimeProfilesRepo.deleteBindingByEmployeeId(input.employeeId);
        return null;
      }

      const profile = runtimeProfilesRepo.getById(input.runtimeProfileId);
      if (!profile) {
        throw new Error(`[runtime-profiles] profile not found: ${input.runtimeProfileId}`);
      }
      if (profile.companyId !== input.companyId) {
        throw new Error(
          `[runtime-profiles] profile ${input.runtimeProfileId} does not belong to company ${input.companyId}`,
        );
      }

      return bindingRowToBinding(
        runtimeProfilesRepo.upsertBinding({
          companyId: input.companyId,
          employeeId: input.employeeId,
          runtimeProfileId: input.runtimeProfileId,
        }),
      );
    },

    async validateProfile(input: ValidateRuntimeProfileInput): Promise<RuntimeProfileValidation> {
      const row = runtimeProfilesRepo.getById(input.profileId);
      if (!row) {
        throw new Error(`[runtime-profiles] profile not found: ${input.profileId}`);
      }
      if (row.companyId !== input.companyId) {
        throw new Error(
          `[runtime-profiles] profile ${input.profileId} does not belong to company ${input.companyId}`,
        );
      }

      const profile = rowToRuntimeProfile(row);
      const checkedAt = Date.now();
      const result = await validateByKind(profile, checkedAt);
      runtimeProfilesRepo.update(profile.id, {
        lastHealthStatus: result.status,
        lastHealthMessage: result.message,
        lastValidatedAt: checkedAt,
      });
      return result;
    },

    getProfileForEmployee(employeeId: string): RuntimeProfile | null {
      const binding = runtimeProfilesRepo.getBindingByEmployeeId(employeeId);
      if (!binding) return null;
      const profile = runtimeProfilesRepo.getById(binding.runtimeProfileId);
      return profile ? rowToRuntimeProfile(profile) : null;
    },
  };
}
