import type { RuntimeProfileSecretRef } from '@team-x/shared-types';

export interface RuntimeSecretReader {
  getApiKey(providerId: string): Promise<string | null>;
}

export function isRuntimeSecretRef(value: unknown): value is RuntimeProfileSecretRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.type === 'secret_ref' &&
    typeof record.providerId === 'string' &&
    record.providerId.trim().length > 0 &&
    typeof record.key === 'string' &&
    record.key.trim().length > 0 &&
    typeof record.version === 'string' &&
    record.version.trim().length > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function collectRuntimeSecretRefs(
  value: unknown,
  path = 'config',
): Array<{ path: string; ref: RuntimeProfileSecretRef }> {
  if (!isRecord(value)) return [];
  const refs: Array<{ path: string; ref: RuntimeProfileSecretRef }> = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (isRuntimeSecretRef(child)) {
      refs.push({ path: childPath, ref: child });
      continue;
    }
    refs.push(...collectRuntimeSecretRefs(child, childPath));
  }
  return refs;
}

async function resolveSecretValue(
  ref: RuntimeProfileSecretRef,
  secrets: RuntimeSecretReader,
): Promise<string> {
  if (ref.key !== 'apiKey') {
    throw new Error(`[runtime-secrets] unsupported secret key "${ref.key}"`);
  }
  const value = await secrets.getApiKey(ref.providerId);
  if (!value) {
    throw new Error(
      `[runtime-secrets] missing secret ref provider="${ref.providerId}" key="${ref.key}"`,
    );
  }
  return value;
}

export async function resolveRuntimeEnvironment(input: {
  config: Record<string, unknown> | null | undefined;
  secrets?: RuntimeSecretReader;
}): Promise<Record<string, string>> {
  const env = input.config?.env;
  if (!isRecord(env)) return {};

  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      resolved[key] = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      resolved[key] = String(value);
    } else if (isRuntimeSecretRef(value)) {
      if (!input.secrets) {
        throw new Error('[runtime-secrets] secret reader is required to resolve runtime env refs');
      }
      resolved[key] = await resolveSecretValue(value, input.secrets);
    }
  }
  return resolved;
}
