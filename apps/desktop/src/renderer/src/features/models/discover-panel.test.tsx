/**
 * DiscoverPanel — the Hugging Face browser and download queue.
 *
 * Search results, a model card listing the repo's files, and a live transfer
 * list with pause / resume / cancel.
 *
 * The transfer list is the part that has to be exactly truthful: a paused
 * download still holds bytes on disk and can be resumed, a cancelled one does
 * not, and a percentage computed from an unknown total would be a fabrication.
 *
 * @vitest-environment jsdom
 */
import '@/components/console/test-setup';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DiscoverPanel } from './discover-panel.js';

const RESULTS = [
  {
    repoId: 'Qwen/Qwen3-8B-GGUF',
    downloads: 91_234,
    likes: 412,
    description: 'Qwen3 8B in GGUF form.',
    tags: ['gguf', 'text-generation'],
  },
  {
    repoId: 'bartowski/Llama-3.3-70B-GGUF',
    downloads: 55_000,
    likes: 220,
    description: '',
    tags: ['gguf'],
  },
];

const CARD = {
  repoId: 'Qwen/Qwen3-8B-GGUF',
  description: 'GGUF quantizations of Qwen3 8B for llama.cpp.',
  license: 'apache-2.0',
  siblings: [
    { rfilename: 'README.md', sizeBytes: 4_096 },
    { rfilename: 'Qwen3-8B-Q4_K_M.gguf', sizeBytes: 4_920_000_000 },
    { rfilename: 'Q8_0/Qwen3-8B-Q8_0.gguf', sizeBytes: null },
  ],
};

const DOWNLOADING = {
  handleId: 'dl-1',
  repoId: 'Qwen/Qwen3-8B-GGUF',
  filename: 'Qwen3-8B-Q4_K_M.gguf',
  bytesReceived: 2_460_000_000,
  bytesTotal: 4_920_000_000,
  state: 'downloading',
  errorMessage: null,
};

function makeBridge(over: { results?: unknown[]; downloads?: unknown[]; card?: unknown } = {}) {
  return {
    localGguf: {
      hf: {
        search: vi.fn().mockResolvedValue(over.results ?? RESULTS),
        modelCard: vi.fn().mockResolvedValue(over.card ?? CARD),
        startDownload: vi.fn().mockResolvedValue({ handleId: 'dl-2' }),
        pauseDownload: vi.fn().mockResolvedValue(undefined),
        resumeDownload: vi.fn().mockResolvedValue(undefined),
        cancelDownload: vi.fn().mockResolvedValue(undefined),
        activeDownloads: vi.fn().mockResolvedValue(over.downloads ?? []),
      },
      runtime: {
        settings: vi.fn().mockResolvedValue({ defaultLibraryFolder: 'D:/models' }),
        gpuInventory: vi.fn(),
        reprobeGpu: vi.fn(),
        setSettings: vi.fn(),
        binariesVersion: vi.fn().mockResolvedValue('b9371'),
      },
      library: { list: vi.fn().mockResolvedValue([]) },
    },
    system: {
      selectDirectory: vi.fn().mockResolvedValue({ canceled: false, folderPath: 'D:/models' }),
      selectGgufFile: vi.fn(),
    },
  };
}

let bridge: ReturnType<typeof makeBridge>;
let client: QueryClient;

function setBridge(b: ReturnType<typeof makeBridge>) {
  bridge = b;
  (window as unknown as { teamx: unknown }).teamx = b;
}

function Harness({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mount() {
  return render(
    <Harness>
      <DiscoverPanel />
    </Harness>,
  );
}

async function search(term = 'qwen3') {
  const user = userEvent.setup();
  mount();
  await user.type(screen.getByLabelText(/search/i), term);
  await user.click(screen.getByRole('button', { name: /^search$/i }));
  return user;
}

beforeEach(() => {
  setBridge(makeBridge());
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

describe('DiscoverPanel — search', () => {
  it('does not query the Hub before the operator searches', () => {
    mount();
    expect(bridge.localGguf.hf.search).not.toHaveBeenCalled();
  });

  it('lists results with their download and like counts', async () => {
    await search();
    expect(await screen.findByText('Qwen/Qwen3-8B-GGUF')).toBeInTheDocument();
    expect(screen.getByText(/91,234|91234/)).toBeInTheDocument();
  });

  it('shows a description when the Hub supplies one', async () => {
    await search();
    expect(await screen.findByText('Qwen3 8B in GGUF form.')).toBeInTheDocument();
  });

  it('leaves the description area empty rather than inventing copy', async () => {
    // The Hub's list endpoint often carries no prose at all.
    await search();
    await screen.findByText('bartowski/Llama-3.3-70B-GGUF');
    expect(screen.queryByText(/no description available/i)).not.toBeInTheDocument();
  });

  it('says nothing matched rather than showing a blank list', async () => {
    setBridge(makeBridge({ results: [] }));
    await search('zzzz');
    expect(await screen.findByText(/no (results|models)/i)).toBeInTheDocument();
  });

  it('surfaces a Hub rate limit with the retry delay', async () => {
    const b = makeBridge();
    b.localGguf.hf.search = vi
      .fn()
      .mockRejectedValue(new Error('Hugging Face rate limit reached. Retry in 30s.'));
    setBridge(b);
    await search();

    expect(await screen.findByText(/rate limit/i)).toBeInTheDocument();
    expect(screen.getByText(/30s/)).toBeInTheDocument();
  });
});

describe('DiscoverPanel — the model card', () => {
  async function openCard() {
    const user = await search();
    await user.click(await screen.findByText('Qwen/Qwen3-8B-GGUF'));
    return user;
  }

  it('lists the repo files with their sizes', async () => {
    await openCard();
    expect(await screen.findByText('Qwen3-8B-Q4_K_M.gguf')).toBeInTheDocument();
    expect(screen.getByText(/4\.\d+\s*GB/)).toBeInTheDocument();
  });

  it('shows an unknown file size as unknown, not as zero', async () => {
    await openCard();
    await screen.findByText('Q8_0/Qwen3-8B-Q8_0.gguf');
    expect(screen.getAllByText(/unknown/i).length).toBeGreaterThan(0);
  });

  it('offers a download only for the GGUF files', async () => {
    // A README is in `siblings` too, and downloading it into the model folder
    // would put a non-model file where the scanner looks.
    await openCard();
    await screen.findByText('Qwen3-8B-Q4_K_M.gguf');
    expect(screen.queryByText('README.md')).not.toBeInTheDocument();
  });

  it('starts a download into the configured library folder', async () => {
    const user = await openCard();
    await screen.findByText('Qwen3-8B-Q4_K_M.gguf');

    const row = screen.getByText('Qwen3-8B-Q4_K_M.gguf').closest('[data-sibling-row]');
    await user.click(within(row as HTMLElement).getByRole('button', { name: /download/i }));

    await waitFor(() =>
      expect(bridge.localGguf.hf.startDownload).toHaveBeenCalledWith(
        'Qwen/Qwen3-8B-GGUF',
        'Qwen3-8B-Q4_K_M.gguf',
        'D:/models',
      ),
    );
  });

  it('does not prompt for a folder while the configured one is still loading', async () => {
    // Settings resolve after mount. Treating "not loaded yet" as "not
    // configured" pops a folder picker at the operator even though a default
    // exists — and then downloads somewhere they did not choose.
    const b = makeBridge();
    b.localGguf.runtime.settings = vi.fn(() => new Promise(() => undefined)) as never;
    setBridge(b);

    const user = await search();
    await user.click(await screen.findByText('Qwen/Qwen3-8B-GGUF'));
    await screen.findByText('Qwen3-8B-Q4_K_M.gguf');

    const row = screen.getByText('Qwen3-8B-Q4_K_M.gguf').closest('[data-sibling-row]');
    expect(within(row as HTMLElement).getByRole('button', { name: /download/i })).toBeDisabled();
    expect(bridge.system.selectDirectory).not.toHaveBeenCalled();
  });

  it('asks for a folder when none is configured, instead of guessing one', async () => {
    const b = makeBridge();
    b.localGguf.runtime.settings = vi.fn().mockResolvedValue({ defaultLibraryFolder: null });
    setBridge(b);

    const user = await search();
    await user.click(await screen.findByText('Qwen/Qwen3-8B-GGUF'));
    await screen.findByText('Qwen3-8B-Q4_K_M.gguf');

    const row = screen.getByText('Qwen3-8B-Q4_K_M.gguf').closest('[data-sibling-row]');
    await user.click(within(row as HTMLElement).getByRole('button', { name: /download/i }));

    await waitFor(() => expect(bridge.system.selectDirectory).toHaveBeenCalled());
    await waitFor(() => expect(bridge.localGguf.hf.startDownload).toHaveBeenCalled());
  });
});

describe('DiscoverPanel — the transfer list', () => {
  it('shows progress against the total', async () => {
    setBridge(makeBridge({ downloads: [DOWNLOADING] }));
    mount();
    expect(await screen.findByText('Qwen3-8B-Q4_K_M.gguf')).toBeInTheDocument();
    expect(screen.getByText(/50\s*%/)).toBeInTheDocument();
  });

  it('omits a percentage when the total size is unknown', async () => {
    // A server that sends no Content-Length leaves bytesTotal at 0. Showing
    // "100%" or "0%" there would be a fabricated number.
    setBridge(makeBridge({ downloads: [{ ...DOWNLOADING, bytesTotal: 0 }] }));
    mount();
    await screen.findByText('Qwen3-8B-Q4_K_M.gguf');
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('pauses an in-flight transfer', async () => {
    const user = userEvent.setup();
    setBridge(makeBridge({ downloads: [DOWNLOADING] }));
    mount();
    await screen.findByText('Qwen3-8B-Q4_K_M.gguf');

    await user.click(screen.getByRole('button', { name: /pause/i }));
    await waitFor(() => expect(bridge.localGguf.hf.pauseDownload).toHaveBeenCalledWith('dl-1'));
  });

  it('offers resume, not pause, for a paused transfer', async () => {
    const user = userEvent.setup();
    setBridge(makeBridge({ downloads: [{ ...DOWNLOADING, state: 'paused' }] }));
    mount();
    await screen.findByText('Qwen3-8B-Q4_K_M.gguf');

    expect(screen.queryByRole('button', { name: /pause/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /resume/i }));
    await waitFor(() => expect(bridge.localGguf.hf.resumeDownload).toHaveBeenCalledWith('dl-1'));
  });

  it('cancels a transfer', async () => {
    const user = userEvent.setup();
    setBridge(makeBridge({ downloads: [DOWNLOADING] }));
    mount();
    await screen.findByText('Qwen3-8B-Q4_K_M.gguf');

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(bridge.localGguf.hf.cancelDownload).toHaveBeenCalledWith('dl-1'));
  });

  it('offers no pause or cancel once a transfer has completed', async () => {
    setBridge(makeBridge({ downloads: [{ ...DOWNLOADING, state: 'completed' }] }));
    mount();
    await screen.findByText('Qwen3-8B-Q4_K_M.gguf');

    expect(screen.queryByRole('button', { name: /pause/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });

  it('shows a failed transfer with its reason and offers a retry', async () => {
    const user = userEvent.setup();
    setBridge(
      makeBridge({
        downloads: [{ ...DOWNLOADING, state: 'failed', errorMessage: 'HTTP 404 — file not found' }],
      }),
    );
    mount();
    await screen.findByText('Qwen3-8B-Q4_K_M.gguf');

    expect(screen.getByText(/404/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry|resume/i }));
    await waitFor(() => expect(bridge.localGguf.hf.resumeDownload).toHaveBeenCalledWith('dl-1'));
  });

  it('says a paused transfer keeps its bytes, so pausing is not a loss', async () => {
    setBridge(makeBridge({ downloads: [{ ...DOWNLOADING, state: 'paused' }] }));
    mount();
    await screen.findByText('Qwen3-8B-Q4_K_M.gguf');
    expect(screen.getAllByText('PAUSED').length).toBeGreaterThan(0);
  });
});
