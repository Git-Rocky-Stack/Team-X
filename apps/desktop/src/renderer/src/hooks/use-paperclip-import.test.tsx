/**
 * `paperclip.*` bridge hooks — behaviour specs.
 *
 * Driven against a stubbed preload bridge. The behaviour worth pinning is the
 * two-step shape: picking a folder and previewing it are separate calls, and a
 * cancelled picker must NOT go on to preview anything — an operator who backs
 * out of the dialog has not asked to read a directory.
 *
 * @vitest-environment jsdom
 */
import '@/components/console/test-setup';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePaperclipImportPreview, useSelectPaperclipFolder } from './use-paperclip-import.js';

const PREVIEW = {
  packageData: { manifest: { mode: 'workspace-export' } },
  importPreview: { manifest: { mode: 'workspace-export' } },
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
};

let preview: ReturnType<typeof vi.fn>;
let selectDirectory: ReturnType<typeof vi.fn>;
let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  preview = vi.fn().mockResolvedValue(PREVIEW);
  selectDirectory = vi
    .fn()
    .mockResolvedValue({ canceled: false, folderPath: 'D:/paperclip-export' });
  (window as unknown as { teamx: unknown }).teamx = {
    paperclip: { preview },
    system: { selectDirectory },
  };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

describe('useSelectPaperclipFolder', () => {
  it('returns the folder the operator picked', async () => {
    const { result } = renderHook(() => useSelectPaperclipFolder(), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe('D:/paperclip-export');
  });

  it('asks the picker for a Paperclip-specific title, not the generic one', async () => {
    const { result } = renderHook(() => useSelectPaperclipFolder(), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(selectDirectory).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/paperclip/i) }),
    );
  });

  it('resolves to null when the operator cancels', async () => {
    selectDirectory.mockResolvedValue({ canceled: true, folderPath: null });
    const { result } = renderHook(() => useSelectPaperclipFolder(), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('resolves to null when the picker returns no path despite not cancelling', async () => {
    selectDirectory.mockResolvedValue({ canceled: false, folderPath: null });
    const { result } = renderHook(() => useSelectPaperclipFolder(), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('usePaperclipImportPreview', () => {
  it('returns the preview the main process computed', async () => {
    const { result } = renderHook(() => usePaperclipImportPreview(), { wrapper });
    result.current.mutate('D:/paperclip-export');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(PREVIEW);
  });

  it('forwards the folder path as { folderPath }', async () => {
    const { result } = renderHook(() => usePaperclipImportPreview(), { wrapper });
    result.current.mutate('D:/paperclip-export');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(preview).toHaveBeenCalledWith({ folderPath: 'D:/paperclip-export' });
  });

  it('surfaces a main-process failure as an error rather than empty data', async () => {
    preview.mockRejectedValue(new Error('could not read "D:/nope"'));
    const { result } = renderHook(() => usePaperclipImportPreview(), { wrapper });
    result.current.mutate('D:/nope');
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
