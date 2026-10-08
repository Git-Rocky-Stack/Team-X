/**
 * ModelDetail — the per-model drawer: prompt overrides, advanced tuning, and
 * benchmark history.
 *
 * The advanced-params form is where the honesty rules bite hardest. Every
 * tuning column is nullable and null means "auto-tune decides", NOT zero. A
 * blank field must therefore round-trip as null, and the placeholder has to
 * say what auto would do rather than leaving the operator guessing whether an
 * empty box means off, zero, or default.
 *
 * @vitest-environment jsdom
 */
import '@/components/console/test-setup';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ModelDetail } from './model-detail.js';

import { axeViolations } from '@/test-utils/axe';

const MODEL = {
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
  ggufSha256: 'abc123',
  ggufChatTemplate: null,
  isEmbeddingModel: false,
  isToolCapable: true,
  hfRepoId: 'Qwen/Qwen3-8B-GGUF',
  hfFilename: 'qwen3-8b.Q4_K_M.gguf',
  license: 'apache-2.0',
  chatTemplateOverride: null,
  systemPromptOverride: 'You are terse.',
  status: 'cold',
  statusDetail: null,
  lastUsedAt: null,
  createdAt: 1,
  updatedAt: 1,
};

const BENCHMARK = {
  id: 'b1',
  modelId: 'm1',
  promptEvalTokS: 810.8,
  genTokS: 47.1,
  ttftMs: 214,
  vramPeakMb: 5312,
  backend: 'cuda',
  nCtxUsed: 4096,
  nGpuLayersUsed: 33,
  ranAt: 1_700_000_000_000,
};

function makeBridge(over: { history?: unknown[]; model?: unknown } = {}) {
  return {
    localGguf: {
      library: {
        get: vi.fn().mockResolvedValue(over.model ?? MODEL),
        setSystemPrompt: vi.fn().mockResolvedValue(MODEL),
        setChatTemplate: vi.fn().mockResolvedValue(MODEL),
        setAdvancedParams: vi.fn().mockResolvedValue({ modelId: 'm1' }),
        resetAdvanced: vi.fn().mockResolvedValue({ modelId: 'm1' }),
        list: vi.fn().mockResolvedValue([MODEL]),
      },
      benchmark: {
        run: vi.fn().mockResolvedValue(BENCHMARK),
        history: vi.fn().mockResolvedValue(over.history ?? [BENCHMARK]),
      },
      pool: {
        status: vi.fn().mockResolvedValue({ loaded: [], maxConcurrent: 2 }),
        load: vi.fn(),
        unload: vi.fn(),
        setMaxConcurrent: vi.fn(),
      },
    },
  };
}

let bridge: ReturnType<typeof makeBridge>;
let client: QueryClient;
const onClose = vi.fn();

function setBridge(b: ReturnType<typeof makeBridge>) {
  bridge = b;
  (window as unknown as { teamx: unknown }).teamx = b;
}

function Harness({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mount(modelId: string | null = 'm1') {
  return render(
    <Harness>
      <ModelDetail modelId={modelId} onClose={onClose} />
    </Harness>,
  );
}

/** Mount and wait for the loaded model, not just the dialog shell. */
async function open() {
  const view = mount();
  await screen.findByText('Qwen3 8B Q4_K_M');
  return view;
}

beforeEach(() => {
  onClose.mockClear();
  setBridge(makeBridge());
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

describe('ModelDetail — identity', () => {
  it('renders nothing when no model is selected', () => {
    mount(null);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('names the model and its provenance', async () => {
    await open();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Qwen3 8B Q4_K_M')).toBeInTheDocument();
    expect(within(dialog).getByText(/Qwen\/Qwen3-8B-GGUF/)).toBeInTheDocument();
    expect(within(dialog).getByText(/apache-2\.0/)).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    await open();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe('ModelDetail — accessible in every state (audit P2-1)', () => {
  it('names and describes the dialog while the model is loading', async () => {
    setBridge({
      ...makeBridge(),
      localGguf: {
        ...makeBridge().localGguf,
        library: {
          ...makeBridge().localGguf.library,
          get: vi.fn(() => new Promise(() => undefined)),
        },
      },
    } as ReturnType<typeof makeBridge>);
    mount();
    const dialog = await screen.findByRole('dialog', { name: 'Loading model…' });
    expect(dialog).toHaveAccessibleDescription(/loading this model/i);
    expect(await axeViolations()).toEqual([]);
  });

  it('names and describes the dialog when the model fails to load', async () => {
    setBridge({
      ...makeBridge(),
      localGguf: {
        ...makeBridge().localGguf,
        library: {
          ...makeBridge().localGguf.library,
          get: vi.fn().mockRejectedValue(new Error('disk unplugged')),
        },
      },
    } as ReturnType<typeof makeBridge>);
    mount();
    const dialog = await screen.findByRole('dialog', { name: 'Could not load this model' });
    expect(dialog).toHaveAccessibleDescription(/disk unplugged/);
    expect(await axeViolations()).toEqual([]);
  });

  it('names the loaded dialog after the model, with no axe violations', async () => {
    await open();
    expect(screen.getByRole('dialog', { name: 'Qwen3 8B Q4_K_M' })).toBeInTheDocument();
    expect(await axeViolations()).toEqual([]);
  });
});

describe('ModelDetail — prompt overrides', () => {
  it('shows the stored system prompt', async () => {
    await open();
    expect(screen.getByLabelText(/system prompt/i)).toHaveValue('You are terse.');
  });

  it('saves an edited system prompt', async () => {
    // `delay: null`: userEvent's default still yields a macrotask between
    // every keystroke, which is the dominant cost of typing a long string in
    // jsdom. Same events dispatched, without the artificial event-loop turns.
    const user = userEvent.setup({ delay: null });
    await open();

    const field = screen.getByLabelText(/system prompt/i);
    await user.clear(field);
    await user.type(field, 'Answer in one line.');
    await user.click(screen.getByRole('button', { name: /save prompt/i }));

    await waitFor(() =>
      expect(bridge.localGguf.library.setSystemPrompt).toHaveBeenCalledWith(
        'm1',
        'Answer in one line.',
      ),
    );
  });

  it('clears the override to null when the field is emptied', async () => {
    // Null means "no override, use the model default". An empty string would
    // persist a real, empty system prompt — a different thing entirely.
    const user = userEvent.setup();
    await open();

    await user.clear(screen.getByLabelText(/system prompt/i));
    await user.click(screen.getByRole('button', { name: /save prompt/i }));

    await waitFor(() =>
      expect(bridge.localGguf.library.setSystemPrompt).toHaveBeenCalledWith('m1', null),
    );
  });

  it('saves a chat-template override', async () => {
    const user = userEvent.setup();
    await open();

    // `paste`, not `type`: user-event reads `{{` as an escaped brace, so
    // typing a Jinja template silently produces different text. Pasting is
    // also how a real template gets into this field.
    await user.click(screen.getByLabelText(/chat template/i));
    await user.paste('{{ x }}');
    await user.click(screen.getByRole('button', { name: /save template/i }));

    await waitFor(() =>
      expect(bridge.localGguf.library.setChatTemplate).toHaveBeenCalledWith('m1', '{{ x }}'),
    );
  });
});

describe('ModelDetail — advanced tuning', () => {
  it('leaves every tuning field blank when nothing is overridden', async () => {
    await open();
    expect(screen.getByLabelText(/context length/i)).toHaveValue('');
    expect(screen.getByLabelText(/gpu layers/i)).toHaveValue('');
  });

  it('says what auto-tune will do, so a blank field is not a mystery', async () => {
    await open();
    expect(screen.getByLabelText(/context length/i)).toHaveAttribute(
      'placeholder',
      expect.stringMatching(/auto/i),
    );
  });

  it('persists only the fields the operator filled in', async () => {
    const user = userEvent.setup();
    await open();

    await user.type(screen.getByLabelText(/context length/i), '8192');
    await user.click(screen.getByRole('button', { name: /save tuning/i }));

    await waitFor(() => expect(bridge.localGguf.library.setAdvancedParams).toHaveBeenCalled());
    const [, params] = (
      bridge.localGguf.library.setAdvancedParams as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0] as [string, Record<string, unknown>];
    expect(params.nCtx).toBe(8192);
    // An untouched field is null — "auto" — never 0.
    expect(params.nGpuLayers).toBeNull();
  });

  it('refuses a non-numeric tuning value rather than sending NaN', async () => {
    const user = userEvent.setup();
    await open();

    await user.type(screen.getByLabelText(/context length/i), 'lots');

    expect(screen.getByRole('button', { name: /save tuning/i })).toBeDisabled();
    expect(bridge.localGguf.library.setAdvancedParams).not.toHaveBeenCalled();
  });

  it('resets tuning back to auto', async () => {
    const user = userEvent.setup();
    await open();

    await user.click(screen.getByRole('button', { name: /reset to auto/i }));

    await waitFor(() => expect(bridge.localGguf.library.resetAdvanced).toHaveBeenCalledWith('m1'));
  });
});

describe('ModelDetail — benchmarks', () => {
  it('shows a previous run with its measured throughput', async () => {
    await open();
    expect(await screen.findByText(/47\.1/)).toBeInTheDocument();
    expect(screen.getByText(/810\.8/)).toBeInTheDocument();
    expect(screen.getByText(/214/)).toBeInTheDocument();
  });

  it('shows peak VRAM as not-measured when the backend could not report it', async () => {
    // Null is "not measured" — rendering 0 MB would claim a reading.
    setBridge(makeBridge({ history: [{ ...BENCHMARK, vramPeakMb: null, backend: 'cpu' }] }));
    await open();

    expect(await screen.findByText(/not measured|—/i)).toBeInTheDocument();
    expect(screen.queryByText(/^0\s*MB$/)).not.toBeInTheDocument();
  });

  it('runs a benchmark on demand', async () => {
    const user = userEvent.setup();
    await open();

    await user.click(screen.getByRole('button', { name: /run benchmark/i }));

    await waitFor(() => expect(bridge.localGguf.benchmark.run).toHaveBeenCalledWith('m1'));
  });

  it('warns that a run loads the model before it starts', async () => {
    await open();
    expect(screen.getByText(/loads the model/i)).toBeInTheDocument();
  });

  it('says there is no history rather than showing an empty table', async () => {
    setBridge(makeBridge({ history: [] }));
    await open();
    expect(await screen.findByText(/never been benchmarked|no benchmark/i)).toBeInTheDocument();
  });

  it('surfaces a refused run with the reason', async () => {
    const user = userEvent.setup();
    const b = makeBridge();
    b.localGguf.benchmark.run = vi
      .fn()
      .mockRejectedValue(new Error('llama-server returned no timings for m1'));
    setBridge(b);
    await open();

    await user.click(screen.getByRole('button', { name: /run benchmark/i }));

    expect(await screen.findByText(/no timings/i)).toBeInTheDocument();
  });
});
