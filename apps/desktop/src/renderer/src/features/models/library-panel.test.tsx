/**
 * LibraryPanel — the Models view's local model library.
 *
 * Lists registered GGUF models, adds them from a file or a watched folder,
 * removes them, rescans folders, and opens the per-model detail drawer.
 *
 * The recurring theme in these specs is that a model row must never overstate
 * what is known about it: a GGUF whose metadata failed to parse has null arch,
 * quant and size, and the row has to read as "unknown" rather than dressing
 * nulls up as zeroes or empty strings.
 *
 * @vitest-environment jsdom
 */
import '@/components/console/test-setup';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryPanel } from './library-panel.js';

const QWEN = {
  id: 'm1',
  displayName: 'Qwen3 8B Q4_K_M',
  sourceType: 'file',
  sourcePath: 'D:/models/qwen3-8b.Q4_K_M.gguf',
  endpointId: null,
  ggufArch: 'qwen2',
  ggufParamsB: 8.03,
  ggufQuant: 'Q4_K_M',
  ggufContextMax: 32_768,
  ggufSizeBytes: 4_920_000_000,
  ggufSha256: null,
  ggufChatTemplate: null,
  isEmbeddingModel: false,
  isToolCapable: true,
  hfRepoId: 'Qwen/Qwen3-8B-GGUF',
  hfFilename: 'qwen3-8b.Q4_K_M.gguf',
  license: 'apache-2.0',
  chatTemplateOverride: null,
  systemPromptOverride: null,
  status: 'cold',
  statusDetail: null,
  lastUsedAt: null,
  createdAt: 1,
  updatedAt: 1,
};

const UNPARSED = {
  ...QWEN,
  id: 'm2',
  displayName: 'mystery.gguf',
  ggufArch: null,
  ggufParamsB: null,
  ggufQuant: null,
  ggufContextMax: null,
  ggufSizeBytes: null,
  isToolCapable: false,
  hfRepoId: null,
  license: null,
  status: 'missing',
  statusDetail: 'Incomplete split set: 2 of 3 shards present',
};

function makeBridge(
  over: { models?: unknown[]; folders?: unknown[]; system?: Record<string, unknown> } = {},
) {
  return {
    localGguf: {
      library: {
        list: vi.fn().mockResolvedValue(over.models ?? [QWEN]),
        get: vi.fn().mockResolvedValue(QWEN),
        addFile: vi.fn().mockResolvedValue(QWEN),
        addFolder: vi.fn().mockResolvedValue({ id: 'f1', path: 'D:/models' }),
        listFolders: vi.fn().mockResolvedValue(over.folders ?? []),
        removeModel: vi.fn().mockResolvedValue(undefined),
        removeFolder: vi.fn().mockResolvedValue(undefined),
        scanFolder: vi.fn().mockResolvedValue({ addedCount: 2, removedCount: 0 }),
        setSystemPrompt: vi.fn().mockResolvedValue(QWEN),
        setChatTemplate: vi.fn().mockResolvedValue(QWEN),
        setAdvancedParams: vi.fn().mockResolvedValue({ modelId: 'm1' }),
        resetAdvanced: vi.fn().mockResolvedValue({ modelId: 'm1' }),
        listBySourceType: vi.fn().mockResolvedValue([]),
      },
      pool: {
        status: vi.fn().mockResolvedValue({ loaded: [], maxConcurrent: 2 }),
        load: vi.fn().mockResolvedValue({ modelId: 'm1', baseUrl: 'http://127.0.0.1:1', pid: 1 }),
        unload: vi.fn().mockResolvedValue(undefined),
        setMaxConcurrent: vi.fn(),
      },
      benchmark: {
        run: vi.fn().mockResolvedValue({ id: 'b1' }),
        history: vi.fn().mockResolvedValue([]),
      },
      runtime: {
        settings: vi.fn().mockResolvedValue({ defaultLibraryFolder: 'D:/models' }),
        gpuInventory: vi.fn(),
        reprobeGpu: vi.fn(),
        setSettings: vi.fn(),
        binariesVersion: vi.fn().mockResolvedValue('b9371'),
      },
    },
    system: {
      selectGgufFile: vi
        .fn()
        .mockResolvedValue({ canceled: false, filePath: 'D:/models/new.gguf' }),
      selectDirectory: vi.fn().mockResolvedValue({ canceled: false, folderPath: 'D:/models' }),
      ...over.system,
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
      <LibraryPanel />
    </Harness>,
  );
}

beforeEach(() => {
  setBridge(makeBridge());
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

describe('LibraryPanel — the model list', () => {
  it('lists each registered model by name', async () => {
    mount();
    expect(await screen.findByText('Qwen3 8B Q4_K_M')).toBeInTheDocument();
  });

  it('shows the parsed GGUF metadata', async () => {
    mount();
    await screen.findByText('Qwen3 8B Q4_K_M');
    expect(screen.getByText('Q4_K_M')).toBeInTheDocument();
    expect(screen.getByText(/qwen2/i)).toBeInTheDocument();
    // Exact: the display name also contains "8B", so a loose pattern matches
    // two nodes and proves nothing about the parameter-count tag.
    expect(screen.getByText('8.0B')).toBeInTheDocument();
  });

  it('renders a human file size rather than a raw byte count', async () => {
    mount();
    await screen.findByText('Qwen3 8B Q4_K_M');
    expect(screen.getByText(/4\.\d+\s*GB/i)).toBeInTheDocument();
  });

  it('marks a tool-capable model', async () => {
    mount();
    await screen.findByText('Qwen3 8B Q4_K_M');
    expect(screen.getByText(/tools/i)).toBeInTheDocument();
  });

  it('shows unparsed metadata as unknown, never as zero or blank', async () => {
    // A GGUF the parser could not read has null arch / quant / size. Printing
    // "0 B" or an empty cell would assert something the app does not know.
    setBridge(makeBridge({ models: [UNPARSED] }));
    mount();
    await screen.findByText('mystery.gguf');

    expect(screen.getAllByText(/unknown/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^0\s*(B|GB|MB)$/i)).not.toBeInTheDocument();
  });

  it('surfaces a status detail so a broken model explains itself', async () => {
    setBridge(makeBridge({ models: [UNPARSED] }));
    mount();
    expect(await screen.findByText(/incomplete split set/i)).toBeInTheDocument();
  });

  it('says the library is empty rather than rendering a bare frame', async () => {
    setBridge(makeBridge({ models: [] }));
    mount();
    expect(await screen.findByText(/no models/i)).toBeInTheDocument();
  });

  it('reports a failed load as a steady NO-GO fault', async () => {
    const b = makeBridge();
    b.localGguf.library.list = vi.fn().mockRejectedValue(new Error('database is locked'));
    setBridge(b);
    const { container } = mount();

    expect((await screen.findAllByText('NO-GO')).length).toBeGreaterThan(0);
    expect(container.querySelector('.animate-lamp-blink')).toBeNull();
  });
});

describe('LibraryPanel — adding models', () => {
  it('adds a model from a file the operator picks', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Qwen3 8B Q4_K_M');

    await user.click(screen.getByRole('button', { name: /add file/i }));

    await waitFor(() =>
      expect(bridge.localGguf.library.addFile).toHaveBeenCalledWith('D:/models/new.gguf'),
    );
  });

  it('does nothing when the file picker is dismissed', async () => {
    const user = userEvent.setup();
    setBridge(
      makeBridge({
        system: {
          selectGgufFile: vi.fn().mockResolvedValue({ canceled: true, filePath: null }),
        },
      }),
    );
    mount();
    await screen.findByText('Qwen3 8B Q4_K_M');

    await user.click(screen.getByRole('button', { name: /add file/i }));

    await waitFor(() => expect(bridge.system.selectGgufFile).toHaveBeenCalled());
    expect(bridge.localGguf.library.addFile).not.toHaveBeenCalled();
  });

  it('adds a watched folder the operator picks', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Qwen3 8B Q4_K_M');

    await user.click(screen.getByRole('button', { name: /add folder/i }));

    await waitFor(() =>
      expect(bridge.localGguf.library.addFolder).toHaveBeenCalledWith('D:/models', true),
    );
  });

  it('names what is being picked in the folder dialog', async () => {
    // The shared picker used to hardcode "Select skill folder".
    const user = userEvent.setup();
    mount();
    await screen.findByText('Qwen3 8B Q4_K_M');

    await user.click(screen.getByRole('button', { name: /add folder/i }));

    await waitFor(() => expect(bridge.system.selectDirectory).toHaveBeenCalled());
    const arg = (bridge.system.selectDirectory as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[0] as { title?: string } | undefined;
    expect(arg?.title).toMatch(/model/i);
  });

  it('surfaces an add failure instead of failing silently', async () => {
    const user = userEvent.setup();
    const b = makeBridge();
    b.localGguf.library.addFile = vi
      .fn()
      .mockRejectedValue(new Error('gguf-parse-failed: not a GGUF file'));
    setBridge(b);
    mount();
    await screen.findByText('Qwen3 8B Q4_K_M');

    await user.click(screen.getByRole('button', { name: /add file/i }));

    expect(await screen.findByText(/gguf-parse-failed/i)).toBeInTheDocument();
  });
});

describe('LibraryPanel — per-model actions', () => {
  async function openRowMenu(name: RegExp) {
    const user = userEvent.setup();
    mount();
    const row = (await screen.findByText('Qwen3 8B Q4_K_M')).closest('[data-model-row]');
    expect(row).not.toBeNull();
    await user.click(within(row as HTMLElement).getByRole('button', { name }));
    return user;
  }

  it('loads a model into the pool', async () => {
    await openRowMenu(/^load$/i);
    await waitFor(() => expect(bridge.localGguf.pool.load).toHaveBeenCalledWith('m1'));
  });

  it('removes a model only after the operator confirms', async () => {
    // Removing is destructive and irreversible from the UI, so a stray click
    // must not be enough.
    const user = await openRowMenu(/remove/i);
    expect(bridge.localGguf.library.removeModel).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^(confirm|remove model)$/i }));
    await waitFor(() => expect(bridge.localGguf.library.removeModel).toHaveBeenCalledWith('m1'));
  });

  it('opens the detail drawer for a model', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByText('Qwen3 8B Q4_K_M'));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByText(/system prompt/i)).toBeInTheDocument();
  });
});

describe('LibraryPanel — the detail drawer is per-model', () => {
  it('does not carry one model’s unsaved prompt into another', async () => {
    // The drawer is rendered unconditionally and returns null when nothing is
    // selected, so its draft state survives a close. Without a remount, typing
    // a prompt for model A, closing, and opening model B shows A's text in B's
    // field — and saving writes A's prompt onto B.
    //
    // `delay: null` because this test types the longest string in the suite.
    // userEvent's default 0ms delay still yields a macrotask between every
    // keystroke, so 24 characters cost 24 event-loop turns on top of the
    // keydown/keypress/input/keyup cycle each one dispatches through act().
    // Unloaded that is ~1.2s; under a full parallel suite it reached 5,280ms
    // and blew the 5,000ms default timeout — a genuine flake, not a slow
    // machine. Dropping the delay removes the artificial turns and dispatches
    // exactly the same events.
    const user = userEvent.setup({ delay: null });
    const SECOND = { ...QWEN, id: 'm2', displayName: 'Phi-4 Q4_K_M' };
    const b = makeBridge({ models: [QWEN, SECOND] });
    b.localGguf.library.get = vi.fn(async (id: string) =>
      id === 'm2' ? SECOND : { ...QWEN, systemPromptOverride: null },
    ) as unknown as typeof b.localGguf.library.get;
    setBridge(b);
    mount();

    await user.click(await screen.findByText('Qwen3 8B Q4_K_M'));
    const field = await screen.findByLabelText(/system prompt/i);
    await user.type(field, 'only for the first model');
    expect(field).toHaveValue('only for the first model');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByText('Phi-4 Q4_K_M'));
    const second = await screen.findByLabelText(/system prompt/i);
    expect(second).toHaveValue('');
  });
});

describe('LibraryPanel — watched folders', () => {
  const FOLDER = {
    id: 'f1',
    path: 'D:/models',
    recursive: true,
    status: 'reachable',
    lastScanAt: 1_700_000_000_000,
    lastScanError: null,
    createdAt: 1,
    updatedAt: 1,
  };

  it('lists each watched folder with its path', async () => {
    setBridge(makeBridge({ folders: [FOLDER] }));
    mount();
    expect(await screen.findByText('D:/models')).toBeInTheDocument();
  });

  it('rescans a watched folder on demand', async () => {
    const user = userEvent.setup();
    setBridge(makeBridge({ folders: [FOLDER] }));
    mount();
    const row = (await screen.findByText('D:/models')).closest('[data-folder-row]');

    await user.click(within(row as HTMLElement).getByRole('button', { name: /rescan/i }));

    await waitFor(() => expect(bridge.localGguf.library.scanFolder).toHaveBeenCalledWith('f1'));
  });

  it('removes a watched folder only after confirmation', async () => {
    // Dropping a folder also drops every model it contributed.
    const user = userEvent.setup();
    setBridge(makeBridge({ folders: [FOLDER] }));
    mount();
    const row = (await screen.findByText('D:/models')).closest('[data-folder-row]');

    await user.click(within(row as HTMLElement).getByRole('button', { name: /^stop watching$/i }));
    expect(bridge.localGguf.library.removeFolder).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /remove folder/i }));
    await waitFor(() => expect(bridge.localGguf.library.removeFolder).toHaveBeenCalledWith('f1'));
  });

  it('shows an unreachable folder as a settled NO-GO with its error', async () => {
    setBridge(
      makeBridge({
        folders: [{ ...FOLDER, status: 'unreachable', lastScanError: 'ENOENT: share offline' }],
      }),
    );
    const { container } = mount();

    expect(await screen.findByText(/share offline/i)).toBeInTheDocument();
    expect(screen.getAllByText('NO-GO').length).toBeGreaterThan(0);
    expect(container.querySelector('.animate-lamp-blink')).toBeNull();
  });

  it('says no folders are watched rather than hiding the section', async () => {
    setBridge(makeBridge({ folders: [] }));
    mount();
    expect(await screen.findByText(/no folders are being watched/i)).toBeInTheDocument();
  });

  it('reports how many models a rescan added', async () => {
    const user = userEvent.setup();
    setBridge(makeBridge({ folders: [FOLDER] }));
    mount();
    const row = (await screen.findByText('D:/models')).closest('[data-folder-row]');

    await user.click(within(row as HTMLElement).getByRole('button', { name: /rescan/i }));

    expect(await screen.findByText(/added 2/i)).toBeInTheDocument();
  });
});
