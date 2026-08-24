/**
 * ModelsView — the Models tab shell.
 *
 * Four sub-tabs over the local GGUF subsystem. The selected panel lives in the
 * app store rather than in local state, matching `dashboardSubview`, so
 * navigating away to Chat and back does not silently reset the operator to
 * Library.
 *
 * This suite doubles as the integration smoke test for the four panels: they
 * are mounted for real against a stubbed bridge, so a panel that throws on
 * mount fails here rather than in front of a user.
 *
 * @vitest-environment jsdom
 */
import '@/components/console/test-setup';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ModelsView } from './models-view.js';

import { useAppStore } from '@/store/app-store.js';

function makeBridge() {
  return {
    localGguf: {
      library: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue(null),
        addFile: vi.fn(),
        addFolder: vi.fn(),
        removeModel: vi.fn(),
        removeFolder: vi.fn(),
        scanFolder: vi.fn(),
        setSystemPrompt: vi.fn(),
        setChatTemplate: vi.fn(),
        setAdvancedParams: vi.fn(),
        resetAdvanced: vi.fn(),
        listBySourceType: vi.fn().mockResolvedValue([]),
      },
      runtime: {
        gpuInventory: vi.fn().mockResolvedValue({
          detectedAt: 0,
          cuda: { available: false, devices: [] },
          rocm: { available: false, devices: [] },
          vulkan: { available: false, devices: [] },
          metal: { available: false, devices: [] },
          cpu: { cores: 8, ramMb: 32_768 },
        }),
        reprobeGpu: vi.fn(),
        settings: vi.fn().mockResolvedValue({
          activeBackend: 'cpu',
          activeBackendIsAutoDetected: true,
          autoFallbackReason: null,
          maxConcurrentLocalModels: 1,
          defaultLibraryFolder: null,
          embeddingModelId: null,
          hfTokenKeyRef: null,
          llamaBinariesVersion: 'b9371',
        }),
        setSettings: vi.fn(),
        binariesVersion: vi.fn().mockResolvedValue('b9371'),
      },
      pool: {
        status: vi.fn().mockResolvedValue({ loaded: [], maxConcurrent: 1 }),
        load: vi.fn(),
        unload: vi.fn(),
        setMaxConcurrent: vi.fn(),
      },
      endpoint: {
        list: vi.fn().mockResolvedValue([]),
        add: vi.fn(),
        remove: vi.fn(),
        test: vi.fn(),
        update: vi.fn(),
      },
      hf: {
        search: vi.fn().mockResolvedValue([]),
        modelCard: vi.fn(),
        startDownload: vi.fn(),
        pauseDownload: vi.fn(),
        resumeDownload: vi.fn(),
        cancelDownload: vi.fn(),
        activeDownloads: vi.fn().mockResolvedValue([]),
      },
      benchmark: { run: vi.fn(), history: vi.fn().mockResolvedValue([]) },
    },
    system: { selectDirectory: vi.fn(), selectGgufFile: vi.fn() },
  };
}

let client: QueryClient;

function Harness({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mount() {
  return render(
    <Harness>
      <ModelsView />
    </Harness>,
  );
}

beforeEach(() => {
  (window as unknown as { teamx: unknown }).teamx = makeBridge();
  useAppStore.setState({ modelsPanel: 'library' });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

describe('ModelsView — sub-tabs', () => {
  it('offers all four areas of the subsystem', () => {
    mount();
    for (const label of ['Library', 'Discover', 'Endpoints', 'Runtime']) {
      expect(screen.getByRole('button', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
  });

  it('opens on the Library panel', async () => {
    mount();
    expect(await screen.findByText(/local models/i)).toBeInTheDocument();
  });

  it('marks the active tab for assistive technology', () => {
    mount();
    expect(screen.getByRole('button', { name: /library/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: /runtime/i })).not.toHaveAttribute('aria-current');
  });

  it.each([
    ['Discover', /hugging face/i],
    ['Endpoints', /remote lan servers/i],
    ['Runtime', /hardware/i],
  ])('switches to the %s panel', async (tab, heading) => {
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByRole('button', { name: new RegExp(tab, 'i') }));

    expect(await screen.findByText(heading)).toBeInTheDocument();
  });

  it('shows only one panel at a time', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByRole('heading', { name: /local models/i });

    await user.click(screen.getByRole('button', { name: /runtime/i }));

    await screen.findByText(/hardware/i);
    // By heading, not by text: the Runtime panel's no-GPU copy also contains
    // the words "Local models will run on the CPU backend".
    expect(screen.queryByRole('heading', { name: /local models/i })).not.toBeInTheDocument();
  });
});

describe('ModelsView — panel selection survives navigation', () => {
  it('keeps the chosen panel in the app store, not in local state', async () => {
    // Local state would reset to Library every time the operator visited Chat
    // and came back. `dashboardSubview` sets the precedent.
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByRole('button', { name: /endpoints/i }));

    await waitFor(() => expect(useAppStore.getState().modelsPanel).toBe('endpoints'));
  });

  it('restores the panel the store already holds', async () => {
    useAppStore.setState({ modelsPanel: 'runtime' });
    mount();
    expect(await screen.findByText(/hardware/i)).toBeInTheDocument();
  });
});

describe('ModelsView — the four panels mount cleanly', () => {
  it.each(['library', 'discover', 'endpoints', 'runtime'] as const)(
    'renders %s without throwing',
    async (panel) => {
      useAppStore.setState({ modelsPanel: panel });
      expect(() => mount()).not.toThrow();
      // Let every query settle so a rejected promise cannot escape the assertion.
      await waitFor(() => expect(screen.getByRole('navigation')).toBeInTheDocument());
    },
  );
});
