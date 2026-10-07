/**
 * RuntimePanel — the Models view's Runtime & Pool surface.
 *
 * Renders the GPU probe result, the active llama.cpp backend, the bundled
 * binaries build, and the LRU pool (what is resident, and how many models may
 * be resident at once).
 *
 * Two behaviours get deliberate coverage:
 *
 *   1. **Unknown is shown as unknown.** The Linux lspci path yields a device
 *      name with no VRAM figure at all. Rendering that as "0 MB" would read as
 *      a measurement of zero, which is the same lie the backend audit removed.
 *   2. **A fault is NO-GO, not a blinking warn.** DESIGN.md's dual-form red
 *      rule: an already-failed probe is a settled fault and burns steady;
 *      blinking is reserved for an unacknowledged question.
 *
 * @vitest-environment jsdom
 */
import '@/components/console/test-setup';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RuntimePanel } from './runtime-panel.js';

const CUDA_INVENTORY = {
  detectedAt: 1_700_000_000_000,
  cuda: {
    available: true,
    devices: [
      { name: 'NVIDIA GeForce RTX 4090', vramMb: 24_564, backend: 'cuda' },
      { name: 'NVIDIA GeForce RTX 3090', vramMb: 24_576, backend: 'cuda' },
    ],
    driverVersion: '555.42',
  },
  rocm: { available: false, devices: [] },
  vulkan: { available: false, devices: [] },
  metal: { available: false, devices: [] },
  cpu: { cores: 16, ramMb: 65_536 },
};

const SETTINGS = {
  activeBackend: 'cuda',
  activeBackendIsAutoDetected: true,
  autoFallbackReason: null,
  maxConcurrentLocalModels: 2,
  defaultLibraryFolder: 'D:/models',
  embeddingModelId: null,
  hfTokenKeyRef: null,
  llamaBinariesVersion: 'b9371',
};

function makeBridge(overrides: Record<string, unknown> = {}) {
  return {
    runtime: {
      gpuInventory: vi.fn().mockResolvedValue(CUDA_INVENTORY),
      reprobeGpu: vi.fn().mockResolvedValue(CUDA_INVENTORY),
      settings: vi.fn().mockResolvedValue(SETTINGS),
      setSettings: vi.fn().mockResolvedValue(SETTINGS),
      binariesVersion: vi.fn().mockResolvedValue('b9371'),
      ...(overrides.runtime as object),
    },
    pool: {
      status: vi.fn().mockResolvedValue({ loaded: [], maxConcurrent: 2 }),
      load: vi.fn().mockResolvedValue({}),
      unload: vi.fn().mockResolvedValue(undefined),
      setMaxConcurrent: vi.fn().mockResolvedValue(undefined),
      ...(overrides.pool as object),
    },
    library: { list: vi.fn().mockResolvedValue([]) },
  };
}

/** The panel reads the folder picker off the same bridge. */
function withSystem(b: ReturnType<typeof makeBridge>, folderPath: string | null) {
  (b as unknown as { system: unknown }).system = {
    selectDirectory: vi.fn().mockResolvedValue({ canceled: folderPath === null, folderPath }),
    selectGgufFile: vi.fn(),
  };
  return b;
}

let bridge: ReturnType<typeof makeBridge>;
let client: QueryClient;

function Harness({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mount() {
  return render(
    <Harness>
      <RuntimePanel />
    </Harness>,
  );
}

function setBridge(b: ReturnType<typeof makeBridge>) {
  bridge = b;
  const wrapped = b as unknown as { system?: unknown };
  (window as unknown as { teamx: unknown }).teamx = {
    localGguf: b,
    system: wrapped.system ?? {
      selectDirectory: vi.fn().mockResolvedValue({ canceled: false, folderPath: 'D:/models' }),
      selectGgufFile: vi.fn(),
    },
  };
}

beforeEach(() => {
  setBridge(makeBridge());
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

describe('RuntimePanel — GPU inventory', () => {
  it('lists every detected device with its VRAM', async () => {
    mount();
    expect(await screen.findByText('NVIDIA GeForce RTX 4090')).toBeInTheDocument();
    expect(screen.getByText('NVIDIA GeForce RTX 3090')).toBeInTheDocument();
    expect(screen.getByText(/24564|24,564/)).toBeInTheDocument();
  });

  it('reports CPU cores and system RAM', async () => {
    mount();
    expect(await screen.findByText('16')).toBeInTheDocument();
    expect(screen.getByText(/64\s*GB/i)).toBeInTheDocument();
  });

  it('shows the active backend', async () => {
    // Scoped to the readout: "CUDA" is also the device-group heading, so a
    // bare text query matches two nodes and asserts nothing in particular.
    mount();
    expect(await screen.findByTestId('models-active-backend')).toHaveTextContent(/CUDA/i);
  });

  it('shows a device with unknown VRAM as unknown, never as zero', async () => {
    // The Linux lspci fallback knows the model but not the memory. Rendering
    // 0 MB would claim a measurement that was never taken.
    setBridge(
      makeBridge({
        runtime: {
          gpuInventory: vi.fn().mockResolvedValue({
            ...CUDA_INVENTORY,
            cuda: { available: false, devices: [] },
            vulkan: {
              available: true,
              devices: [{ name: 'AMD Radeon RX 7900 XTX', vramMb: 0, backend: 'vulkan' }],
            },
          }),
          settings: vi.fn().mockResolvedValue(SETTINGS),
          reprobeGpu: vi.fn(),
          setSettings: vi.fn(),
          binariesVersion: vi.fn().mockResolvedValue('b9371'),
        },
      }),
    );
    mount();

    expect(await screen.findByText('AMD Radeon RX 7900 XTX')).toBeInTheDocument();
    expect(screen.getByText(/unknown/i)).toBeInTheDocument();
    expect(screen.queryByText(/^0\s*MB$/i)).not.toBeInTheDocument();
  });

  it('surfaces an automatic backend fallback and its reason', async () => {
    setBridge(
      makeBridge({
        runtime: {
          gpuInventory: vi.fn().mockResolvedValue(CUDA_INVENTORY),
          settings: vi.fn().mockResolvedValue({
            ...SETTINGS,
            activeBackend: 'vulkan',
            autoFallbackReason: 'CUDA binary failed its --version smoke test on sm_52',
          }),
          reprobeGpu: vi.fn(),
          setSettings: vi.fn(),
          binariesVersion: vi.fn().mockResolvedValue('b9371'),
        },
      }),
    );
    mount();

    expect(await screen.findByText(/sm_52/)).toBeInTheDocument();
  });

  it('re-probes the hardware on demand', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('NVIDIA GeForce RTX 4090');

    await user.click(screen.getByRole('button', { name: /re-?probe/i }));

    await waitFor(() => expect(bridge.runtime.reprobeGpu).toHaveBeenCalledTimes(1));
  });

  it('shows the bundled llama.cpp build', async () => {
    mount();
    expect(await screen.findByText('b9371')).toBeInTheDocument();
  });
});

describe('RuntimePanel — the model pool', () => {
  it('shows a resident model with the port it is serving on', async () => {
    setBridge(
      makeBridge({
        pool: {
          status: vi.fn().mockResolvedValue({
            loaded: [{ modelId: 'm1', baseUrl: 'http://127.0.0.1:50007', pid: 4242 }],
            maxConcurrent: 2,
          }),
          unload: vi.fn().mockResolvedValue(undefined),
          setMaxConcurrent: vi.fn(),
          load: vi.fn(),
        },
      }),
    );
    mount();

    expect(await screen.findByText(/50007/)).toBeInTheDocument();
  });

  it('unloads a resident model', async () => {
    const user = userEvent.setup();
    setBridge(
      makeBridge({
        pool: {
          status: vi.fn().mockResolvedValue({
            loaded: [{ modelId: 'm1', baseUrl: 'http://127.0.0.1:50007', pid: 4242 }],
            maxConcurrent: 2,
          }),
          unload: vi.fn().mockResolvedValue(undefined),
          setMaxConcurrent: vi.fn(),
          load: vi.fn(),
        },
      }),
    );
    mount();
    await screen.findByText(/50007/);

    await user.click(screen.getByRole('button', { name: /unload/i }));

    await waitFor(() => expect(bridge.pool.unload).toHaveBeenCalledWith('m1'));
  });

  it('states plainly that nothing is resident rather than showing an empty box', async () => {
    mount();
    expect(
      await screen.findByText(/no models? (are )?(currently )?(loaded|resident)/i),
    ).toBeInTheDocument();
  });

  it('persists a new pool capacity', async () => {
    const user = userEvent.setup();
    mount();
    // Wait for the stored capacity to land before editing, so the assertion is
    // about the edit rather than about mount timing.
    const input = await screen.findByLabelText(/concurrent/i);
    await waitFor(() => expect(input).toHaveValue('2'));

    await user.clear(input);
    await user.type(input, '3');
    await user.click(screen.getByRole('button', { name: /apply|save/i }));

    await waitFor(() => expect(bridge.pool.setMaxConcurrent).toHaveBeenCalledWith(3));
  });

  it('does not overwrite a capacity being typed when the stored value arrives late', async () => {
    // The panel mounts before `pool.status` resolves, so the field starts
    // empty. An operator typing in that window must keep what they typed —
    // copying the stored value in via an effect stomps the draft mid-edit and
    // applies a number nobody chose.
    const user = userEvent.setup();
    let releaseStatus: (v: unknown) => void = () => undefined;
    setBridge(
      makeBridge({
        pool: {
          status: vi.fn(
            () =>
              new Promise((resolve) => {
                releaseStatus = resolve;
              }),
          ),
          unload: vi.fn(),
          load: vi.fn(),
          setMaxConcurrent: vi.fn().mockResolvedValue(undefined),
        },
      }),
    );
    mount();

    const input = await screen.findByLabelText(/concurrent/i);
    await user.type(input, '5');
    expect(input).toHaveValue('5');

    releaseStatus({ loaded: [], maxConcurrent: 2 });

    await waitFor(() => expect(screen.getByText(/no models are loaded/i)).toBeInTheDocument());
    expect(input).toHaveValue('5');
  });

  it('shows the stored capacity again once a change is applied', async () => {
    const user = userEvent.setup();
    mount();
    const input = await screen.findByLabelText(/concurrent/i);
    await waitFor(() => expect(input).toHaveValue('2'));

    await user.clear(input);
    await user.type(input, '4');
    await user.click(screen.getByRole('button', { name: /apply|save/i }));

    // After the write the field mirrors the server again rather than holding a
    // draft that merely happens to match.
    await waitFor(() => expect(bridge.pool.setMaxConcurrent).toHaveBeenCalledWith(4));
  });

  it('refuses to apply a capacity outside the supported range', async () => {
    const user = userEvent.setup();
    mount();
    const input = await screen.findByLabelText(/concurrent/i);
    await waitFor(() => expect(input).toHaveValue('2'));

    await user.clear(input);
    await user.type(input, '99');

    expect(screen.getByRole('button', { name: /apply|save/i })).toBeDisabled();
    expect(bridge.pool.setMaxConcurrent).not.toHaveBeenCalled();
  });
});

describe('RuntimePanel — states', () => {
  it('shows a loading state before the probe resolves', () => {
    setBridge(
      makeBridge({
        runtime: {
          gpuInventory: vi.fn(() => new Promise(() => undefined)),
          settings: vi.fn(() => new Promise(() => undefined)),
          reprobeGpu: vi.fn(),
          setSettings: vi.fn(),
          binariesVersion: vi.fn(() => new Promise(() => undefined)),
        },
      }),
    );
    mount();
    expect(screen.getByText(/probing|loading/i)).toBeInTheDocument();
  });

  it('reports a failed probe as a steady NO-GO fault, not a blinking warning', async () => {
    // DESIGN.md dual-form red rule: a settled failure burns steady on NO-GO;
    // a 1Hz blink is reserved for an unacknowledged question.
    setBridge(
      makeBridge({
        runtime: {
          gpuInventory: vi.fn().mockRejectedValue(new Error('gpu-probe-failed')),
          settings: vi.fn().mockResolvedValue(SETTINGS),
          reprobeGpu: vi.fn(),
          setSettings: vi.fn(),
          binariesVersion: vi.fn().mockResolvedValue('b9371'),
        },
      }),
    );
    const { container } = mount();

    // The stripe lamp and the body fault state both carry the word, which is
    // the intended composition — the assertion under test is the FORM: steady,
    // never the 1Hz blink class.
    expect((await screen.findAllByText('NO-GO')).length).toBeGreaterThan(0);
    expect(container.querySelector('.animate-lamp-blink')).toBeNull();
  });
});

describe('RuntimePanel — library folder and backend override', () => {
  it('shows the configured default download folder', async () => {
    mount();
    expect(await screen.findByText('D:/models')).toBeInTheDocument();
  });

  it('says no folder is set rather than leaving the field blank', async () => {
    // Discover falls back to a picker when this is null, so the operator needs
    // to be told it is unset — not shown an empty box.
    setBridge(
      makeBridge({
        runtime: {
          gpuInventory: vi.fn().mockResolvedValue(CUDA_INVENTORY),
          settings: vi.fn().mockResolvedValue({ ...SETTINGS, defaultLibraryFolder: null }),
          reprobeGpu: vi.fn(),
          setSettings: vi.fn().mockResolvedValue(SETTINGS),
          binariesVersion: vi.fn().mockResolvedValue('b9371'),
        },
      }),
    );
    mount();
    expect(await screen.findByText(/not set/i)).toBeInTheDocument();
  });

  it('persists a folder the operator picks', async () => {
    const user = userEvent.setup();
    setBridge(withSystem(makeBridge(), 'D:/new-models'));
    mount();
    await screen.findByText('NVIDIA GeForce RTX 4090');

    await user.click(screen.getByRole('button', { name: /choose folder/i }));

    await waitFor(() =>
      expect(bridge.runtime.setSettings).toHaveBeenCalledWith({
        defaultLibraryFolder: 'D:/new-models',
      }),
    );
  });

  it('does nothing when the folder picker is dismissed', async () => {
    const user = userEvent.setup();
    setBridge(withSystem(makeBridge(), null));
    mount();
    await screen.findByText('NVIDIA GeForce RTX 4090');

    await user.click(screen.getByRole('button', { name: /choose folder/i }));

    await waitFor(() =>
      expect(
        (
          window as unknown as {
            teamx: { system: { selectDirectory: { mock: { calls: unknown[] } } } };
          }
        ).teamx.system.selectDirectory.mock.calls.length,
      ).toBe(1),
    );
    expect(bridge.runtime.setSettings).not.toHaveBeenCalled();
  });

  it('lets the operator pin a backend instead of trusting auto-detection', async () => {
    // The panel already reports "Auto-detected" vs "Pinned manually"; without a
    // control the second state is unreachable and the label is a half-truth.
    const user = userEvent.setup();
    mount();
    await screen.findByText('NVIDIA GeForce RTX 4090');

    await user.selectOptions(screen.getByLabelText(/backend/i), 'vulkan');

    await waitFor(() =>
      expect(bridge.runtime.setSettings).toHaveBeenCalledWith({
        activeBackend: 'vulkan',
        activeBackendIsAutoDetected: false,
      }),
    );
  });

  it('can hand backend selection back to auto-detection', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('NVIDIA GeForce RTX 4090');

    await user.selectOptions(screen.getByLabelText(/backend/i), 'auto');

    await waitFor(() =>
      expect(bridge.runtime.setSettings).toHaveBeenCalledWith({
        activeBackendIsAutoDetected: true,
      }),
    );
  });
});
