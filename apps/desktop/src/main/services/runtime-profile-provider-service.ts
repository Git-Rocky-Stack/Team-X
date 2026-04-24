import type { ProviderStreamFn } from '@team-x/provider-router';

import type { EmployeeRow } from '../db/repos/employees.js';
import type { ExternalRuntimeAdapters } from './external-runtime-adapters.js';
import type { ProviderFactory } from './provider-factory.js';
import type { RuntimeProfilesService } from './runtime-profiles-service.js';

function getOptionalString(
  config: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = config?.[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface RuntimeProfileProviderServiceDeps {
  runtimeProfilesService: RuntimeProfilesService;
  providerFactory: ProviderFactory;
  externalRuntimeAdapters: ExternalRuntimeAdapters;
}

export interface RuntimeProfileProviderService {
  resolveForEmployee(employee: EmployeeRow): Promise<{
    providerName: string;
    providerKind?: string;
    model: string;
    stream: ProviderStreamFn;
  }>;
}

export function createRuntimeProfileProviderService(
  deps: RuntimeProfileProviderServiceDeps,
): RuntimeProfileProviderService {
  const { runtimeProfilesService, providerFactory, externalRuntimeAdapters } = deps;

  return {
    async resolveForEmployee(employee: EmployeeRow): Promise<{
      providerName: string;
      providerKind?: string;
      model: string;
      stream: ProviderStreamFn;
    }> {
      const profile = runtimeProfilesService.getProfileForEmployee(employee.id);
      if (!profile || !profile.enabled) {
        return providerFactory.resolveForEmployee(employee);
      }

      if (profile.kind === 'teamx-internal') {
        const providerId = getOptionalString(profile.config, 'providerId');
        const model = getOptionalString(profile.config, 'model');
        if (providerId) {
          return providerFactory.create({
            providerId,
            ...(model ? { model } : {}),
          });
        }
        if (model) {
          const fallback = await providerFactory.resolveForEmployee(employee);
          return providerFactory.create({
            providerId: fallback.providerName,
            model,
          });
        }
        return providerFactory.resolveForEmployee(employee);
      }

      const adapted = externalRuntimeAdapters.createResolvedProvider({
        employee,
        profile,
      });
      if (adapted) {
        return adapted;
      }

      return providerFactory.resolveForEmployee(employee);
    },
  };
}
