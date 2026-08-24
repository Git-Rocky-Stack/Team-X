import { describe, expect, it, vi } from 'vitest';

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
