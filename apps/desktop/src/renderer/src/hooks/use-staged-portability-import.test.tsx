/**
 * useStagedPortabilityImport — the Paperclip → Portability hand-off.
 *
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useStagedPortabilityImport } from './use-staged-portability-import.js';

import { useAppStore } from '@/store/app-store.js';

beforeEach(() => {
  useAppStore.setState({ portabilityImportRef: null, settingsFocusSection: null });
});

// A hook left mounted from a previous case would consume the next case's
// staged path before the hook under test mounts.
afterEach(() => {
  cleanup();
});

describe('useStagedPortabilityImport', () => {
  it('delivers a staged package path once, then clears it', () => {
    const onStaged = vi.fn();
    renderHook(() => useStagedPortabilityImport(onStaged));

    act(() => useAppStore.getState().stagePortabilityImport('D:/out/acme.teamx-package.json'));

    expect(onStaged).toHaveBeenCalledTimes(1);
    expect(onStaged).toHaveBeenCalledWith('D:/out/acme.teamx-package.json');
    expect(useAppStore.getState().portabilityImportRef).toBeNull();
  });

  it('picks up a path staged before the section mounted', () => {
    useAppStore.getState().stagePortabilityImport('D:/out/early.teamx-package.json');
    const onStaged = vi.fn();

    renderHook(() => useStagedPortabilityImport(onStaged));

    expect(onStaged).toHaveBeenCalledWith('D:/out/early.teamx-package.json');
  });

  it('focuses the Portability section when a path is staged', () => {
    useAppStore.getState().stagePortabilityImport('D:/out/acme.teamx-package.json');
    expect(useAppStore.getState().settingsFocusSection).toBe('portability');
  });
});
