import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
});
