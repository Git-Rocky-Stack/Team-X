/**
 * AnnunciatorRailMount — chrome wiring tests (Sweep Phase 2).
 * The mount derives tiles from live hooks and hands ack/teleport to the
 * store. Hooks are mocked at module level; the derivation itself is
 * covered by annunciator-signals.test.ts.
 *
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const setActiveView = vi.fn();
const ackAnnunciator = vi.fn();

vi.mock('./annunciator-rail-data', () => ({
  useAnnunciatorData: () => ({
    inputs: {
      queueUnread: 2,
      runtime: { stateTone: 'danger', sessionCount: 1 },
      budget: { configured: true, usedPct: 50, periodKey: 'p1' },
      approvalsPending: 0,
      approvalsNewestId: null,
      meetingsActive: 1,
      acked: {},
    },
    setActiveView,
    ackAnnunciator,
  }),
}));

import { AnnunciatorRailMount } from './annunciator-rail-mount';

afterEach(cleanup);

describe('AnnunciatorRailMount', () => {
  it('renders the rail with derived tiles on the dark strip', () => {
    render(<AnnunciatorRailMount />);
    const rail = screen.getByRole('group', { name: 'Annunciator rail' });
    expect(rail).toBeInTheDocument();
    expect(rail.closest('[data-annunciator-rail]')).not.toBeNull();
    expect(rail.textContent).toContain('QUE');
    expect(rail.textContent).toContain('GGUF');
  });

  it('teleports lit tiles through setActiveView', async () => {
    render(<AnnunciatorRailMount />);
    await userEvent.click(screen.getByRole('button', { name: /MTG/ }));
    expect(setActiveView).toHaveBeenCalledWith('meetings');
  });

  it('blinking tile acks into the store with its fingerprint', async () => {
    render(<AnnunciatorRailMount />);
    await userEvent.click(screen.getByRole('button', { name: /GGUF.*unacknowledged/i }));
    expect(ackAnnunciator).toHaveBeenCalledWith('gguf', expect.stringContaining('gguf:'));
    expect(setActiveView).not.toHaveBeenCalledWith('autonomy');
  });
});
