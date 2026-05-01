import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildExecutionTools } from './execution-tools.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'teamx-execution-tools-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function buildFilesystemTool() {
  const tool = buildExecutionTools({
    userDataDir: join(tempDir, 'user-data'),
    companySlug: 'strategia-x',
    employeeId: 'emp-iris',
    workspaceRoot: tempDir,
  }).find((entry) => entry.name === 'filesystem');
  if (!tool) throw new Error('filesystem tool not found');
  return tool;
}

describe('execution tools', () => {
  it('uses a configured workspace root for filesystem reads', async () => {
    await writeFile(join(tempDir, 'README.md'), 'Strategia workspace', 'utf-8');

    const result = await buildFilesystemTool().execute({
      operation: 'read',
      path: 'README.md',
    });

    expect(result).toEqual({
      success: true,
      content: 'Strategia workspace',
    });
  });

  it('keeps configured workspace access bounded to that root', async () => {
    await expect(
      buildFilesystemTool().execute({
        operation: 'read',
        path: '..\\outside.txt',
      }),
    ).rejects.toThrow(/Path traversal blocked/);
  });

  it('skips dependency and build directories during recursive filesystem searches', async () => {
    await mkdir(join(tempDir, 'src'), { recursive: true });
    await mkdir(join(tempDir, 'node_modules', 'slow-package'), { recursive: true });
    await mkdir(join(tempDir, '.git', 'objects'), { recursive: true });
    await mkdir(join(tempDir, 'release'), { recursive: true });
    await writeFile(join(tempDir, 'src', 'target.ts'), 'export {};', 'utf-8');
    await writeFile(join(tempDir, 'node_modules', 'slow-package', 'target.ts'), 'ignored', 'utf-8');
    await writeFile(join(tempDir, '.git', 'objects', 'target.ts'), 'ignored', 'utf-8');
    await writeFile(join(tempDir, 'release', 'target.ts'), 'ignored', 'utf-8');

    const result = (await buildFilesystemTool().execute({
      operation: 'search',
      path: '.',
      pattern: '*.ts',
    })) as { matches: string[]; truncated: boolean; ignoredDirectories: string[] };

    expect(result.truncated).toBe(false);
    expect(result.matches).toEqual([join('src', 'target.ts')]);
    expect(result.ignoredDirectories).toEqual(expect.arrayContaining(['node_modules', '.git']));
  });

  it('caps recursive filesystem search results so broad workspace scans stay bounded', async () => {
    await mkdir(join(tempDir, 'src'), { recursive: true });
    for (let i = 0; i < 205; i += 1) {
      await writeFile(join(tempDir, 'src', `file-${i}.ts`), 'export {};', 'utf-8');
    }

    const result = (await buildFilesystemTool().execute({
      operation: 'search',
      path: '.',
      pattern: '*.ts',
    })) as { matches: string[]; truncated: boolean; maxResults: number };

    expect(result.maxResults).toBe(200);
    expect(result.matches).toHaveLength(200);
    expect(result.truncated).toBe(true);
  });
});
