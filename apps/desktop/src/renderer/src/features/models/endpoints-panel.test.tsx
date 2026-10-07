/**
 * EndpointsPanel — remote LAN inference servers (LM Studio, Ollama,
 * llama-server, KoboldCPP, vLLM).
 *
 * The panel's job beyond CRUD is to make the privacy contract visible. These
 * endpoints are `Local` tier by definition, the service refuses a non-local
 * host, and the operator has to be able to see *why* an address was rejected
 * rather than watching a form fail silently.
 *
 * @vitest-environment jsdom
 */
import '@/components/console/test-setup';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EndpointsPanel } from './endpoints-panel.js';

const BENCH = {
  id: 'ep-1',
  name: 'LM Studio on bench',
  baseUrl: 'http://192.168.1.50:1234',
  authHeaderKeyRef: null,
  privacyTier: 'Local',
  status: 'reachable',
  lastCheckedAt: 1_700_000_000_000,
  lastError: null,
  createdAt: 1,
  updatedAt: 1,
};

function makeBridge(over: { endpoints?: unknown[] } = {}) {
  return {
    localGguf: {
      endpoint: {
        list: vi.fn().mockResolvedValue(over.endpoints ?? [BENCH]),
        add: vi.fn().mockResolvedValue(BENCH),
        remove: vi.fn().mockResolvedValue(undefined),
        test: vi.fn().mockResolvedValue({ reachable: true, latencyMs: 12 }),
        update: vi.fn().mockResolvedValue(BENCH),
      },
      library: { list: vi.fn().mockResolvedValue([]) },
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
      <EndpointsPanel />
    </Harness>,
  );
}

beforeEach(() => {
  setBridge(makeBridge());
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

describe('EndpointsPanel — the list', () => {
  it('lists each endpoint with its address', async () => {
    mount();
    expect(await screen.findByText('LM Studio on bench')).toBeInTheDocument();
    expect(screen.getByText('http://192.168.1.50:1234')).toBeInTheDocument();
  });

  it.each([
    ['reachable', 'GO'],
    ['unknown', 'STBY'],
    ['unreachable', 'NO-GO'],
    ['auth-failed', 'NO-GO'],
  ])('renders %s as the %s stencil word', async (status, word) => {
    setBridge(makeBridge({ endpoints: [{ ...BENCH, status }] }));
    mount();
    await screen.findByText('LM Studio on bench');
    expect(screen.getAllByText(word).length).toBeGreaterThan(0);
  });

  it('never blinks for a settled endpoint fault', async () => {
    // DESIGN.md dual-form red: an unreachable endpoint is a settled NO-GO.
    setBridge(makeBridge({ endpoints: [{ ...BENCH, status: 'unreachable' }] }));
    const { container } = mount();
    await screen.findByText('LM Studio on bench');
    expect(container.querySelector('.animate-lamp-blink')).toBeNull();
  });

  it('shows the last recorded error so a red lamp is explainable', async () => {
    setBridge(
      makeBridge({
        endpoints: [{ ...BENCH, status: 'unreachable', lastError: 'HTTP 502 — Bad Gateway.' }],
      }),
    );
    mount();
    expect(await screen.findByText(/502/)).toBeInTheDocument();
  });

  it('says there are no endpoints rather than rendering an empty frame', async () => {
    setBridge(makeBridge({ endpoints: [] }));
    mount();
    expect(await screen.findByText(/no endpoints/i)).toBeInTheDocument();
  });
});

describe('EndpointsPanel — adding', () => {
  async function fillAndSubmit(name: string, url: string) {
    const user = userEvent.setup();
    mount();
    await screen.findByText('LM Studio on bench');
    await user.click(screen.getByRole('button', { name: /add endpoint/i }));

    await user.type(screen.getByLabelText(/^name$/i), name);
    await user.type(screen.getByLabelText(/address|base url/i), url);
    await user.click(screen.getByRole('button', { name: /^(save|add)$/i }));
    return user;
  }

  it('adds an endpoint from the form', async () => {
    await fillAndSubmit('Bench rig', 'http://10.0.0.5:1234');
    await waitFor(() =>
      expect(bridge.localGguf.endpoint.add).toHaveBeenCalledWith({
        name: 'Bench rig',
        baseUrl: 'http://10.0.0.5:1234',
        authHeaderKeyRef: null,
      }),
    );
  });

  it('surfaces the service’s local-network refusal verbatim', async () => {
    // The privacy tier is enforced in the main process; the panel's duty is to
    // show the operator exactly why the address was refused.
    const b = makeBridge();
    b.localGguf.endpoint.add = vi
      .fn()
      .mockRejectedValue(
        new Error('"api.openai.com" is not on the local network. Endpoints are Local privacy tier'),
      );
    setBridge(b);

    // `delay: null`: userEvent's default still yields a macrotask between
    // every keystroke, which is the dominant cost of typing a long string in
    // jsdom. Same events dispatched, without the artificial event-loop turns.
    const user = userEvent.setup({ delay: null });
    mount();
    await screen.findByText('LM Studio on bench');
    await user.click(screen.getByRole('button', { name: /add endpoint/i }));
    await user.type(screen.getByLabelText(/^name$/i), 'Cloud');
    await user.type(screen.getByLabelText(/address|base url/i), 'https://api.openai.com');
    await user.click(screen.getByRole('button', { name: /^(save|add)$/i }));

    expect(await screen.findByText(/not on the local network/i)).toBeInTheDocument();
  });

  it('will not submit without a name and an address', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('LM Studio on bench');
    await user.click(screen.getByRole('button', { name: /add endpoint/i }));

    expect(screen.getByRole('button', { name: /^(save|add)$/i })).toBeDisabled();
    expect(bridge.localGguf.endpoint.add).not.toHaveBeenCalled();
  });

  it('tells the operator which addresses are allowed before they guess', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('LM Studio on bench');
    await user.click(screen.getByRole('button', { name: /add endpoint/i }));

    // Precise: the placeholder also contains a 192.168 address, so a loose
    // pattern matches two nodes and does not prove the guidance is present.
    expect(screen.getByText(/must be on your own network/i)).toBeInTheDocument();
  });
});

describe('EndpointsPanel — probing', () => {
  it('probes an endpoint and reports the measured latency', async () => {
    const user = userEvent.setup();
    mount();
    const row = (await screen.findByText('LM Studio on bench')).closest('[data-endpoint-row]');
    await user.click(within(row as HTMLElement).getByRole('button', { name: /test/i }));

    await waitFor(() => expect(bridge.localGguf.endpoint.test).toHaveBeenCalledWith('ep-1'));
    expect(await screen.findByText(/12\s*ms/i)).toBeInTheDocument();
  });

  it('reports an unreachable probe without throwing the panel away', async () => {
    const b = makeBridge();
    b.localGguf.endpoint.test = vi.fn().mockResolvedValue({
      reachable: false,
      error: { kind: 'endpoint-unreachable', url: 'http://192.168.1.50:1234', httpStatus: 502 },
    });
    setBridge(b);

    const user = userEvent.setup();
    mount();
    const row = (await screen.findByText('LM Studio on bench')).closest('[data-endpoint-row]');
    await user.click(within(row as HTMLElement).getByRole('button', { name: /test/i }));

    expect(await screen.findByText(/unreachable/i)).toBeInTheDocument();
    expect(screen.getByText('LM Studio on bench')).toBeInTheDocument();
  });

  it('names an auth failure as an auth failure, not a generic outage', async () => {
    const b = makeBridge();
    b.localGguf.endpoint.test = vi.fn().mockResolvedValue({
      reachable: false,
      error: { kind: 'endpoint-auth-failed', url: 'http://192.168.1.50:1234' },
    });
    setBridge(b);

    const user = userEvent.setup();
    mount();
    const row = (await screen.findByText('LM Studio on bench')).closest('[data-endpoint-row]');
    await user.click(within(row as HTMLElement).getByRole('button', { name: /test/i }));

    expect(await screen.findByText(/auth/i)).toBeInTheDocument();
  });
});

describe('EndpointsPanel — editing and removal', () => {
  it('renames an endpoint', async () => {
    const user = userEvent.setup();
    mount();
    const row = (await screen.findByText('LM Studio on bench')).closest('[data-endpoint-row]');
    await user.click(within(row as HTMLElement).getByRole('button', { name: /edit/i }));

    const field = screen.getByLabelText(/^name$/i);
    await user.clear(field);
    await user.type(field, 'Bench rig');
    await user.click(screen.getByRole('button', { name: /^(save|update)$/i }));

    await waitFor(() =>
      expect(bridge.localGguf.endpoint.update).toHaveBeenCalledWith(
        'ep-1',
        expect.objectContaining({ name: 'Bench rig' }),
      ),
    );
  });

  it('removes an endpoint only after confirmation', async () => {
    // Removing cascades to every model served by that endpoint.
    const user = userEvent.setup();
    mount();
    const row = (await screen.findByText('LM Studio on bench')).closest('[data-endpoint-row]');
    await user.click(within(row as HTMLElement).getByRole('button', { name: /^remove$/i }));

    expect(bridge.localGguf.endpoint.remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /remove endpoint/i }));
    await waitFor(() => expect(bridge.localGguf.endpoint.remove).toHaveBeenCalledWith('ep-1'));
  });

  it('warns that removal takes the endpoint’s models with it', async () => {
    const user = userEvent.setup();
    mount();
    const row = (await screen.findByText('LM Studio on bench')).closest('[data-endpoint-row]');
    await user.click(within(row as HTMLElement).getByRole('button', { name: /^remove$/i }));

    expect(screen.getByText(/every model served by it/i)).toBeInTheDocument();
  });
});
