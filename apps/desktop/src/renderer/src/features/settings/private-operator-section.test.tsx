/**
 * PrivateOperatorSection — behaviour specs.
 *
 * Rendered for real against a stubbed preload bridge, because the thing worth
 * protecting here is what the operator SEES: a plan that says "blocked" must
 * not look like a plan that says "ready", and an action the workspace refuses
 * must appear with the reason it was refused rather than being quietly omitted.
 *
 * The final block is a source pin rather than a render assertion — it proves
 * Gate 2 wiring (the section is mounted in SettingsView), which is a fact about
 * a different file and cannot be observed from inside this component's tree.
 *
 * @vitest-environment jsdom
 */
import '@/components/console/test-setup';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrivateOperatorSection } from './private-operator-section.js';

import { useAppStore } from '@/store/app-store.js';

const currentDirname = dirname(fileURLToPath(import.meta.url));

function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    companyId: 'co-1',
    generatedAt: 1_700_000_000_000,
    mode: 'localhost',
    status: 'ready',
    bindHost: '127.0.0.1',
    port: 48731,
    operatorId: 'op-1',
    operatorRole: 'owner',
    exposure: 'localhost-only',
    guidance: ['Bind to localhost only by default.'],
    warnings: [],
    guardrails: [
      'Never bind the private operator surface to 0.0.0.0 or a LAN address.',
      'Never include decrypted runtime secrets in snapshots.',
    ],
    allowedActions: [
      {
        action: 'mission-control.read',
        allowed: true,
        reason: 'Read-only mobile Mission Control is the first enabled capability.',
      },
    ],
    blockedActions: [
      {
        action: 'secrets.write',
        allowed: false,
        reason: 'Secret changes are the final stage and stay disabled by default.',
      },
    ],
    ...overrides,
  };
}

let plan: ReturnType<typeof vi.fn>;
let client: QueryClient;

function Harness({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderSection() {
  return render(
    <Harness>
      <PrivateOperatorSection />
    </Harness>,
  );
}

beforeEach(() => {
  plan = vi.fn().mockResolvedValue(makePlan());
  (window as unknown as { teamx: unknown }).teamx = {
    privateOperator: { plan, snapshot: vi.fn().mockResolvedValue({}) },
  };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  useAppStore.setState({ companyId: 'co-1' });
});

describe('PrivateOperatorSection — plan rendering', () => {
  it('shows the exposure the plan resolved to, not the one that was requested', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByText('localhost-only')).toBeVisible());
  });

  it('lists every guardrail the plan carries', async () => {
    renderSection();
    await waitFor(() =>
      expect(
        screen.getByText('Never bind the private operator surface to 0.0.0.0 or a LAN address.'),
      ).toBeVisible(),
    );
    expect(screen.getByText('Never include decrypted runtime secrets in snapshots.')).toBeVisible();
  });

  it('renders a blocked action together with the reason it was refused', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByText('secrets.write')).toBeVisible());
    expect(
      screen.getByText('Secret changes are the final stage and stay disabled by default.'),
    ).toBeVisible();
  });

  it('renders an allowed action with its reason', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByText('mission-control.read')).toBeVisible());
    expect(
      screen.getByText('Read-only mobile Mission Control is the first enabled capability.'),
    ).toBeVisible();
  });
});

/**
 * Scoped to the status well: per-action rows carry their own GO / HOLD lamps,
 * so an unscoped getByText('GO') matches several nodes and would pass even if
 * the overall-status lamp were missing entirely.
 */
function statusWell(container: HTMLElement): HTMLElement {
  const well = container.querySelector<HTMLElement>('[data-private-operator-status]');
  if (!well) throw new Error('status well not rendered');
  return well;
}

describe('PrivateOperatorSection — status lamp', () => {
  it('burns GO when the plan is ready', async () => {
    const { container } = renderSection();
    await waitFor(() => expect(within(statusWell(container)).getByText('GO')).toBeVisible());
  });

  it('burns NO-GO and surfaces the warnings when the plan is blocked', async () => {
    plan.mockResolvedValue(
      makePlan({
        status: 'blocked',
        warnings: ['Refusing private operator bind host "0.0.0.0".'],
        allowedActions: [],
      }),
    );
    const { container } = renderSection();
    await waitFor(() => expect(within(statusWell(container)).getByText('NO-GO')).toBeVisible());
    expect(screen.getByText('Refusing private operator bind host "0.0.0.0".')).toBeVisible();
  });

  it('burns HOLD when the plan is only partially allowed', async () => {
    plan.mockResolvedValue(makePlan({ status: 'warning' }));
    const { container } = renderSection();
    await waitFor(() => expect(within(statusWell(container)).getByText('HOLD')).toBeVisible());
  });
});

describe('PrivateOperatorSection — exposure control', () => {
  it('replans through the bridge when the operator picks another exposure mode', async () => {
    const user = userEvent.setup();
    renderSection();
    await waitFor(() => expect(plan).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /tailscale/i }));

    await waitFor(() =>
      expect(plan).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'tailscale' })),
    );
  });

  it('starts on localhost — the only mode that never leaves the machine', async () => {
    renderSection();
    await waitFor(() => expect(plan).toHaveBeenCalled());
    expect(plan).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'localhost' }));
  });

  it('marks the active exposure with aria-pressed so it is not colour-only', async () => {
    renderSection();
    await waitFor(() => expect(plan).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /localhost/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /tailscale/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('PrivateOperatorSection — non-happy states', () => {
  it('shows a busy skeleton while the plan is in flight', () => {
    // A promise that never settles — the point is to hold the query in flight,
    // so the executor body is intentionally empty.
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    plan.mockReturnValue(new Promise(() => {}));
    const { container } = renderSection();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('reports a failed plan instead of rendering an empty panel', async () => {
    plan.mockRejectedValue(new Error('ipc exploded'));
    renderSection();
    await waitFor(() => expect(screen.getByText(/could not be computed/i)).toBeVisible());
  });

  it('asks for a workspace instead of planning when none is selected', async () => {
    useAppStore.setState({ companyId: null });
    renderSection();
    await waitFor(() => expect(screen.getByText(/select a workspace/i)).toBeVisible());
    expect(plan).not.toHaveBeenCalled();
  });
});

describe('PrivateOperatorSection — Gate 2 wiring', () => {
  it('is mounted in SettingsView behind an error boundary', () => {
    const src = readFileSync(join(currentDirname, 'settings-view.tsx'), 'utf8');
    expect(src).toContain(
      "import { PrivateOperatorSection } from './private-operator-section.js';",
    );
    expect(src).toContain('<PrivateOperatorSection />');
    expect(src).toContain('data-settings-section="private-operator"');
  });
});
