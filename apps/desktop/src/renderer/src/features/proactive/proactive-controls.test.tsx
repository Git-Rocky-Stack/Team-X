/**
 * ProactiveControls — behaviour specs.
 *
 * Pins the two contracts the dashboard proactive panel used to break:
 *   1. The company switch is PER-COMPANY. It drives `proactive.setEnabled`
 *      for this company only and reflects this company's state
 *      (`proactive.getState().enabled`) — never the workspace-wide master
 *      flag, which lives in Settings → Extensions.
 *   2. The proactive autonomy mode is settable here (it used to be a
 *      read-only chip stuck at 'balanced'), through `settings.setProactive`,
 *      with a consequence line drawn from what the trigger service does.
 *
 * @vitest-environment jsdom
 */
import '@/components/console/test-setup';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DashboardEvent } from '@team-x/shared-types';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProactiveControls } from './proactive-controls.js';

import { useAppStore } from '@/store/app-store.js';

type Listener = (event: DashboardEvent) => void;

let settings: { enabled: boolean; autonomyMode: 'conservative' | 'balanced' | 'autonomous' };
let companyEnabled: boolean;
let getProactive: ReturnType<typeof vi.fn>;
let setProactive: ReturnType<typeof vi.fn>;
let setEnabled: ReturnType<typeof vi.fn>;
let listeners: Listener[];
let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderControls() {
  return render(<ProactiveControls companyId="co-a" />, { wrapper });
}

beforeEach(() => {
  settings = { enabled: true, autonomyMode: 'balanced' };
  companyEnabled = true;
  listeners = [];
  getProactive = vi.fn(async () => ({ ...settings }));
  setProactive = vi.fn(async (req: Partial<typeof settings>) => {
    settings = { ...settings, ...req };
  });
  setEnabled = vi.fn(async ({ enabled }: { companyId: string; enabled: boolean }) => {
    companyEnabled = enabled;
  });
  (window as unknown as { teamx: unknown }).teamx = {
    settings: { getProactive, setProactive },
    proactive: {
      setEnabled,
      getState: vi.fn(async () => ({
        enabled: settings.enabled && companyEnabled,
        activeWork: 0,
        queuedWork: 0,
        lastScanAt: null,
      })),
      scanForWork: vi.fn(async () => ({ queuedCount: 0 })),
    },
    events: {
      onDashboard: vi.fn((listener: Listener) => {
        listeners.push(listener);
        return () => undefined;
      }),
    },
  };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  useAppStore.setState({ settingsFocusSection: null });
});

describe('ProactiveControls — per-company switch', () => {
  it('toggles only this company and never writes the master flag', async () => {
    renderControls();
    const toggle = await screen.findByRole('switch', { name: /toggle proactive mode/i });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));

    fireEvent.click(toggle);

    await waitFor(() =>
      expect(setEnabled).toHaveBeenCalledWith({ companyId: 'co-a', enabled: false }),
    );
    expect(setProactive).not.toHaveBeenCalled();
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
  });

  it("reflects this company's own state, not the master flag", async () => {
    companyEnabled = false;
    renderControls();
    const toggle = await screen.findByRole('switch', { name: /toggle proactive mode/i });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
  });

  it("ignores another company's enabled_changed event", async () => {
    renderControls();
    const toggle = await screen.findByRole('switch', { name: /toggle proactive mode/i });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));

    act(() => {
      for (const listener of listeners) {
        listener({
          id: 'evt-1',
          type: 'proactive.enabled_changed',
          companyId: 'co-b',
          actorId: 'system',
          actorKind: 'orchestrator',
          payload: { enabled: false },
          createdAt: 1,
        } as DashboardEvent);
      }
    });

    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('when the master switch is off, points to Settings instead of a dead switch', async () => {
    settings = { enabled: false, autonomyMode: 'balanced' };
    renderControls();

    expect(await screen.findByText(/master switch is off/i)).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /toggle proactive mode/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /open settings/i }));
    expect(useAppStore.getState().settingsFocusSection).toBe('extensions');
  });
});

describe('ProactiveControls — autonomy mode selector', () => {
  it('shows all three modes with the persisted one selected', async () => {
    settings = { enabled: true, autonomyMode: 'conservative' };
    renderControls();
    const group = await screen.findByRole('group', { name: /proactive autonomy/i });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /conservative/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /balanced/i })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /autonomous/i })).not.toBeChecked();
    expect(screen.getByText(/goal decomposition is blocked/i)).toBeInTheDocument();
  });

  // DESIGN.md chooser recipe: `.cap` + `.cap-select` for the selected face,
  // outline focus (a ring loses the box-shadow cascade on caps in Night Ops).
  it('renders the modes as console chooser caps, the selected one armed', async () => {
    settings = { enabled: true, autonomyMode: 'conservative' };
    renderControls();
    const selected = (await screen.findByRole('radio', { name: /conservative/i })).closest('label');
    const other = screen.getByRole('radio', { name: /balanced/i }).closest('label');

    expect(selected).toHaveClass('cap', 'cap-select');
    expect(other).toHaveClass('cap');
    expect(other).not.toHaveClass('cap-select');
    expect(selected?.className).not.toMatch(/armed-soft|ring-/);
  });

  it('persists a new mode through settings.setProactive', async () => {
    renderControls();
    fireEvent.click(await screen.findByRole('radio', { name: /conservative/i }));

    await waitFor(() =>
      expect(setProactive).toHaveBeenCalledWith({ autonomyMode: 'conservative' }),
    );
    expect(setEnabled).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('radio', { name: /conservative/i })).toBeChecked());
  });

  it('states what each mode actually changes', async () => {
    renderControls();
    expect(await screen.findByText(/decomposition and work scans both run/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /autonomous/i }));
    await waitFor(() => expect(screen.getByText(/same gates as balanced/i)).toBeInTheDocument());
  });

  it('surfaces a save failure instead of silently keeping the old mode', async () => {
    setProactive.mockRejectedValueOnce(new Error('disk full'));
    renderControls();
    fireEvent.click(await screen.findByRole('radio', { name: /autonomous/i }));

    expect(await screen.findByText(/failed to save autonomy mode/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /balanced/i })).toBeChecked();
  });
});
