import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ensureRuntimeWorkspacePaths,
  resolveRuntimeWorkspacePaths,
} from './runtime-workspace-service.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'teamx-runtime-workspace-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('runtime workspace service', () => {
  it('builds deterministic per-company per-employee runtime paths', () => {
    const paths = resolveRuntimeWorkspacePaths({
      userDataDir: tempDir,
      companySlug: 'Alpha Co',
      employeeId: 'employee-1',
      runtimeKind: 'codex',
      runtimeProfileSlug: 'Codex Prod',
    });

    expect(paths.root).toBe(
      join(tempDir, 'companies', 'alpha-co', 'runtimes', 'employee-1', 'codex-prod'),
    );
    expect(paths.home).toBe(join(paths.root, 'home'));
    expect(paths.workspace).toBe(join(paths.root, 'workspace'));
    expect(paths.logs).toBe(join(paths.root, 'logs'));
    expect(paths.tmp).toBe(join(paths.root, 'tmp'));
  });

  it('falls back to runtime kind when the profile slug is absent', () => {
    const paths = resolveRuntimeWorkspacePaths({
      userDataDir: tempDir,
      companySlug: 'Alpha Co',
      employeeId: 'employee-1',
      runtimeKind: 'claude-code',
      runtimeProfileSlug: null,
    });

    expect(paths.root).toBe(
      join(tempDir, 'companies', 'alpha-co', 'runtimes', 'employee-1', 'claude-code'),
    );
  });

  it('creates the managed runtime directories before execution', async () => {
    const paths = await ensureRuntimeWorkspacePaths({
      userDataDir: tempDir,
      companySlug: 'Alpha Co',
      employeeId: 'employee-1',
      runtimeKind: 'codex',
      runtimeProfileSlug: 'Codex Prod',
    });

    expect((await stat(paths.home)).isDirectory()).toBe(true);
    expect((await stat(paths.workspace)).isDirectory()).toBe(true);
    expect((await stat(paths.logs)).isDirectory()).toBe(true);
    expect((await stat(paths.tmp)).isDirectory()).toBe(true);
  });
});
