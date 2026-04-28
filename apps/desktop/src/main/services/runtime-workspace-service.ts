import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { RuntimeProfileKind } from '@team-x/shared-types';

export interface RuntimeWorkspaceInput {
  userDataDir: string;
  companySlug: string;
  employeeId: string;
  runtimeKind: RuntimeProfileKind;
  runtimeProfileSlug?: string | null;
}

export interface RuntimeWorkspacePaths {
  root: string;
  home: string;
  workspace: string;
  logs: string;
  tmp: string;
}

type MkdirLike = typeof mkdir;

function sanitizePathSegment(value: string, fallback: string): string {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized.length > 0 ? normalized : fallback;
}

export function resolveRuntimeWorkspacePaths(input: RuntimeWorkspaceInput): RuntimeWorkspacePaths {
  const company = sanitizePathSegment(input.companySlug, 'company');
  const employee = sanitizePathSegment(input.employeeId, 'employee');
  const runtime = sanitizePathSegment(input.runtimeKind, 'runtime');
  const profile = sanitizePathSegment(input.runtimeProfileSlug ?? runtime, runtime);
  const root = join(input.userDataDir, 'companies', company, 'runtimes', employee, profile);
  return {
    root,
    home: join(root, 'home'),
    workspace: join(root, 'workspace'),
    logs: join(root, 'logs'),
    tmp: join(root, 'tmp'),
  };
}

export async function ensureRuntimeWorkspacePaths(
  input: RuntimeWorkspaceInput,
  mkdirFn: MkdirLike = mkdir,
): Promise<RuntimeWorkspacePaths> {
  const paths = resolveRuntimeWorkspacePaths(input);
  await Promise.all([
    mkdirFn(paths.home, { recursive: true }),
    mkdirFn(paths.workspace, { recursive: true }),
    mkdirFn(paths.logs, { recursive: true }),
    mkdirFn(paths.tmp, { recursive: true }),
  ]);
  return paths;
}
