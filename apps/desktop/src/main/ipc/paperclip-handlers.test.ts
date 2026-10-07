import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validateCompanyPackage } from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';

import {
  loadPaperclipExportFolder,
  previewPaperclipImportBridge,
} from '../services/paperclip-import-bridge.js';

import { type PaperclipHandlersDeps, buildPaperclipHandlers } from './paperclip-handlers.js';

function makePreview(overrides: Record<string, unknown> = {}) {
  return {
    packageData: { manifest: { mode: 'workspace-export' }, company: { name: 'Acme' } },
    importPreview: { manifest: { mode: 'workspace-export' }, conflicts: [] },
    warnings: [],
    unsupportedAdapters: [],
    missingSecretRefs: [],
    counts: {
      agents: 3,
      runtimeProfiles: 2,
      tickets: 7,
      skills: 1,
      unsupportedAdapters: 0,
      missingSecrets: 0,
    },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<PaperclipHandlersDeps> = {}): PaperclipHandlersDeps {
  return {
    loadExportFolder: vi.fn(async () => ({ sourcePath: 'D:/export', agents: [] })),
    previewBridge: vi.fn(() => makePreview()),
    appVersion: '3.4.0',
    ...overrides,
  } as PaperclipHandlersDeps;
}

describe('paperclip.preview', () => {
  it('loads the folder then previews the bundle it produced', async () => {
    const order: string[] = [];
    const bundle = { sourcePath: 'D:/export', agents: [{ id: 'a1' }] };
    const deps = makeDeps({
      loadExportFolder: vi.fn(async () => {
        order.push('load');
        return bundle;
      }),
      previewBridge: vi.fn((input) => {
        order.push('preview');
        expect(input).toBe(bundle);
        return makePreview();
      }),
    });
    const handlers = buildPaperclipHandlers(deps);
    await handlers.preview({ folderPath: 'D:/export' });
    expect(order).toEqual(['load', 'preview']);
  });

  it('returns the preview the bridge computed', async () => {
    const handlers = buildPaperclipHandlers(makeDeps());
    const result = await handlers.preview({ folderPath: 'D:/export' });
    expect(result.counts).toEqual({
      agents: 3,
      runtimeProfiles: 2,
      tickets: 7,
      skills: 1,
      unsupportedAdapters: 0,
      missingSecrets: 0,
    });
  });

  it('stamps the running app version so the package records what imported it', async () => {
    const deps = makeDeps({ appVersion: '9.9.9' });
    const handlers = buildPaperclipHandlers(deps);
    await handlers.preview({ folderPath: 'D:/export' });
    expect(deps.previewBridge).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sourceAppVersion: '9.9.9' }),
    );
  });

  it('rejects a missing folderPath instead of reading the process cwd', async () => {
    // `resolve('')` is the current working directory. Letting an empty string
    // through would make the bridge quietly scan wherever the app happens to be
    // running from and report whatever it found there as a Paperclip export.
    const deps = makeDeps();
    const handlers = buildPaperclipHandlers(deps);
    await expect(handlers.preview({ folderPath: '' })).rejects.toThrow(/folderPath is required/);
    expect(deps.loadExportFolder).not.toHaveBeenCalled();
  });

  it('rejects a non-string folderPath', async () => {
    const deps = makeDeps();
    const handlers = buildPaperclipHandlers(deps);
    await expect(handlers.preview({ folderPath: 42 as unknown as string })).rejects.toThrow(
      /folderPath is required/,
    );
    expect(deps.loadExportFolder).not.toHaveBeenCalled();
  });

  it('surfaces unsupported adapters rather than dropping them silently', async () => {
    const deps = makeDeps({
      previewBridge: vi.fn(() =>
        makePreview({
          unsupportedAdapters: [
            { id: 'ad-1', name: 'Legacy', type: 'zapier', reason: 'no Team-X equivalent' },
          ],
          counts: {
            agents: 1,
            runtimeProfiles: 0,
            tickets: 0,
            skills: 0,
            unsupportedAdapters: 1,
            missingSecrets: 0,
          },
        }),
      ),
    });
    const handlers = buildPaperclipHandlers(deps);
    const result = await handlers.preview({ folderPath: 'D:/export' });
    expect(result.unsupportedAdapters).toEqual([
      { id: 'ad-1', name: 'Legacy', type: 'zapier', reason: 'no Team-X equivalent' },
    ]);
  });

  it('wraps a filesystem failure with the folder that caused it', async () => {
    const deps = makeDeps({
      loadExportFolder: vi.fn(async () => {
        throw new Error('ENOENT: no such file or directory');
      }),
    });
    const handlers = buildPaperclipHandlers(deps);
    await expect(handlers.preview({ folderPath: 'D:/missing' })).rejects.toThrow(/D:\/missing/);
  });
});

describe('paperclip.savePackage', () => {
  function saveDeps(dialog: { canceled: boolean; filePath?: string }) {
    const written: Array<{ path: string; contents: string }> = [];
    const showSaveDialog = vi.fn(async () => dialog);
    const deps = makeDeps({
      previewBridge: vi.fn(() =>
        makePreview({
          importPreview: { suggestedSlug: 'acme-ops', manifest: { mode: 'workspace-export' } },
        }),
      ),
      showSaveDialog,
      writeFile: vi.fn(async (path: string, contents: string) => {
        written.push({ path, contents });
      }),
      defaultSaveDir: 'D:/portability',
    });
    return { deps, written, showSaveDialog };
  }

  it('rebuilds the package from the folder and writes it where the operator chose', async () => {
    const { deps, written, showSaveDialog } = saveDeps({
      canceled: false,
      filePath: 'D:/out/acme.teamx-package.json',
    });

    const result = await buildPaperclipHandlers(deps).savePackage({ folderPath: 'D:/export' });

    expect(deps.loadExportFolder).toHaveBeenCalledWith('D:/export');
    expect(showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: expect.stringMatching(/acme-ops\.teamx-package\.json$/),
      }),
    );
    expect(result).toEqual({ canceled: false, packagePath: 'D:/out/acme.teamx-package.json' });
    expect(JSON.parse(written[0]?.contents ?? '')).toEqual(makePreview().packageData);
  });

  it('writes nothing when the operator cancels the dialog', async () => {
    const { deps, written } = saveDeps({ canceled: true });

    const result = await buildPaperclipHandlers(deps).savePackage({ folderPath: 'D:/export' });

    expect(result).toEqual({ canceled: true, packagePath: null });
    expect(written).toEqual([]);
  });

  it('adds the package extension when the chosen name has none', async () => {
    const { deps, written } = saveDeps({ canceled: false, filePath: 'D:/out/acme' });

    const result = await buildPaperclipHandlers(deps).savePackage({ folderPath: 'D:/export' });

    expect(result.packagePath).toBe('D:/out/acme.teamx-package.json');
    expect(written[0]?.path).toBe('D:/out/acme.teamx-package.json');
  });

  it('refuses an empty folder path before reading anything', async () => {
    const { deps } = saveDeps({ canceled: true });

    await expect(buildPaperclipHandlers(deps).savePackage({ folderPath: '' })).rejects.toThrow(
      /folderPath is required/,
    );
    expect(deps.loadExportFolder).not.toHaveBeenCalled();
  });
});

describe('paperclip.savePackage — round trip into Portability', () => {
  it('writes a file that passes the same validation Portability applies on import', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'teamx-paperclip-save-'));
    try {
      const exportDir = join(dir, 'export');
      await mkdir(exportDir);
      await writeFile(
        join(exportDir, 'company.json'),
        JSON.stringify({ id: 'pc-acme', name: 'Acme Ops' }),
      );
      await writeFile(
        join(exportDir, 'agents.json'),
        JSON.stringify([{ id: 'agent-1', name: 'Researcher' }]),
      );
      const target = join(dir, 'acme.teamx-package.json');

      const handlers = buildPaperclipHandlers({
        loadExportFolder: loadPaperclipExportFolder,
        previewBridge: previewPaperclipImportBridge,
        appVersion: '3.4.0',
        showSaveDialog: async () => ({ canceled: false, filePath: target }),
        writeFile: (path, contents) => writeFile(path, contents, 'utf8'),
        defaultSaveDir: dir,
      });

      const result = await handlers.savePackage({ folderPath: exportDir });
      const validation = validateCompanyPackage(JSON.parse(await readFile(target, 'utf8')));

      expect(result).toEqual({ canceled: false, packagePath: target });
      expect(validation.ok).toBe(true);
      if (validation.ok) expect(validation.value.company.name).toBe('Acme Ops');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
