import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type ExecutionToolDeps, buildExecutionTools } from './execution-tools.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'teamx-execution-tools-'));
});

afterEach(async () => {
  // Windows occasionally returns ENOTEMPTY on rmdir under load — retry once
  // with `maxRetries` (Node fs/promises supports this since 16.x) before
  // surfacing the failure. The recursive cap test creates 200+ files and
  // hits this flake reproducibly.
  await rm(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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

function buildCreateDocumentTool(overrides: Partial<ExecutionToolDeps> = {}) {
  const tool = buildExecutionTools({
    userDataDir: join(tempDir, 'user-data'),
    companySlug: 'strategia-x',
    companyId: 'co-1',
    employeeId: 'emp-iris',
    workspaceRoot: tempDir,
    ...overrides,
  }).find((entry) => entry.name === 'create_document');
  if (!tool) throw new Error('create_document tool not found');
  return tool;
}

function listZipEntries(buffer: Buffer): string[] {
  let endOfCentralDirectory = -1;
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      endOfCentralDirectory = i;
      break;
    }
  }
  if (endOfCentralDirectory < 0) {
    throw new Error('ZIP end of central directory not found');
  }

  const entryCount = buffer.readUInt16LE(endOfCentralDirectory + 10);
  let offset = buffer.readUInt32LE(endOfCentralDirectory + 16);
  const entries: string[] = [];
  for (let i = 0; i < entryCount; i += 1) {
    expect(buffer.readUInt32LE(offset)).toBe(0x02014b50);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    entries.push(buffer.subarray(nameStart, nameStart + nameLength).toString('utf-8'));
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  return entries;
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
    // Parallel writes — sequential awaits hit Windows fs latency hard and
    // overran the default 5 s timeout. 205 fixture files in parallel
    // complete in well under a second on every supported platform.
    await Promise.all(
      Array.from({ length: 205 }, (_, i) =>
        writeFile(join(tempDir, 'src', `file-${i}.ts`), 'export {};', 'utf-8'),
      ),
    );

    const result = (await buildFilesystemTool().execute({
      operation: 'search',
      path: '.',
      pattern: '*.ts',
    })) as { matches: string[]; truncated: boolean; maxResults: number };

    expect(result.maxResults).toBe(200);
    expect(result.matches).toHaveLength(200);
    expect(result.truncated).toBe(true);
  }, // Defensive bump for slow CI sandboxes; healthy paths run in <1 s.
  15_000);

  it('creates markdown deliverables and stores them in the vault when wired', async () => {
    const vault = {
      store: vi.fn(async () => 'file-1'),
    };

    const result = (await buildCreateDocumentTool({ vault }).execute({
      path: 'deliverables/status.md',
      format: 'md',
      title: 'Status',
      content: 'Iris created this update.',
      tags: ['status'],
    })) as {
      success: boolean;
      path: string;
      format: string;
      vaultFileId: string | null;
      storedInVault: boolean;
    };

    expect(await readFile(join(tempDir, 'deliverables', 'status.md'), 'utf-8')).toBe(
      '# Status\n\nIris created this update.',
    );
    expect(vault.store).toHaveBeenCalledWith(
      'co-1',
      join(tempDir, 'deliverables', 'status.md'),
      'emp-iris',
      ['agent-created', 'status'],
      'employee',
    );
    expect(result).toMatchObject({
      success: true,
      path: join('deliverables', 'status.md'),
      format: 'md',
      vaultFileId: 'file-1',
      storedInVault: true,
    });
  });

  it('creates valid Office Open XML containers for docx, xlsx, and pptx deliverables', async () => {
    const tool = buildCreateDocumentTool();

    await tool.execute({
      path: 'brief.docx',
      title: 'Brief',
      content: 'One\nTwo',
    });
    await tool.execute({
      path: 'metrics.xlsx',
      rows: [
        ['Metric', 'Value'],
        ['Tickets', 4],
      ],
    });
    await tool.execute({
      path: 'deck.pptx',
      title: 'Deck',
      slides: [{ title: 'Launch', bullets: ['Plan', 'Risks'] }],
    });

    expect(listZipEntries(await readFile(join(tempDir, 'brief.docx')))).toEqual(
      expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']),
    );
    expect(listZipEntries(await readFile(join(tempDir, 'metrics.xlsx')))).toEqual(
      expect.arrayContaining([
        '[Content_Types].xml',
        'xl/workbook.xml',
        'xl/worksheets/sheet1.xml',
      ]),
    );
    expect(listZipEntries(await readFile(join(tempDir, 'deck.pptx')))).toEqual(
      expect.arrayContaining([
        '[Content_Types].xml',
        'ppt/presentation.xml',
        'ppt/slides/slide1.xml',
      ]),
    );
  });

  it('normalizes legacy Office extension requests to modern Office files', async () => {
    const result = (await buildCreateDocumentTool().execute({
      path: 'proposal.doc',
      format: 'doc',
      title: 'Proposal',
      content: 'Modern document body.',
    })) as { success: boolean; path: string; format: string };

    expect(result).toMatchObject({
      success: true,
      path: 'proposal.docx',
      format: 'docx',
    });
    expect(listZipEntries(await readFile(join(tempDir, 'proposal.docx')))).toContain(
      'word/document.xml',
    );
  });

  it('keeps document creation bounded to the configured workspace root', async () => {
    await expect(
      buildCreateDocumentTool().execute({
        path: '..\\outside.docx',
        content: 'escape',
      }),
    ).rejects.toThrow(/Path traversal blocked/);
  });
});
