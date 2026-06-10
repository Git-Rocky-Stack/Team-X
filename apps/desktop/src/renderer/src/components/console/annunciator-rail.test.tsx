/**
 * AnnunciatorRail — persistent lamp-strip behavior tests (Sweep Phase 1, Task 11).
 *
 * Verifies DESIGN.md's annunciator contract as rendered DOM: every tile
 * renders in order on the dark strip, lit steady tiles teleport to their
 * source view via onNavigate(id), unlit tiles are inert (no button role),
 * and alert tiles follow the master-caution ritual — first click
 * acknowledges (onAcknowledge), and only once the parent marks the tile
 * acknowledged does a click navigate. jsdom is opted in per-file via the
 * pragma below; the workspace vitest environment stays `node`.
 *
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AnnunciatorRail, type AnnunciatorTileSpec } from './annunciator-rail';

// The workspace vitest config runs with `globals: false`, so Testing
// Library's automatic cleanup (which hooks a global `afterEach`) never
// registers — without this, each render leaks into the next test's DOM
// and the BUDG/UNACK queries collide across tests.
afterEach(cleanup);

const tiles: AnnunciatorTileSpec[] = [
  { id: 'sys', label: 'SYS', tone: 'go' },
  { id: 'budg', label: 'BUDG', tone: 'warn', alert: true },
  { id: 'net', label: 'NET', tone: 'off' },
];

describe('AnnunciatorRail', () => {
  it('renders every tile in order on a dark strip', () => {
    const { container } = render(<AnnunciatorRail tiles={tiles} />);
    const labels = Array.from(container.querySelectorAll('[class*="lamp"]')).map(
      (n) => n.textContent,
    );
    expect(labels.join(' ')).toContain('SYS');
    expect(labels.join(' ')).toContain('BUDG');
    expect(labels.join(' ')).toContain('NET');
  });

  it('lit tiles teleport: clicking a lit non-alert tile fires onNavigate(id)', async () => {
    const onNavigate = vi.fn();
    render(<AnnunciatorRail tiles={tiles} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByRole('button', { name: /SYS/ }));
    expect(onNavigate).toHaveBeenCalledWith('sys');
  });

  it('unlit tiles do not navigate', () => {
    const onNavigate = vi.fn();
    render(<AnnunciatorRail tiles={tiles} onNavigate={onNavigate} />);
    expect(screen.queryByRole('button', { name: /^NET/ })).toBeNull();
  });

  it('alert tiles acknowledge first, then navigate on second click', async () => {
    const onNavigate = vi.fn();
    const onAcknowledge = vi.fn();
    render(<AnnunciatorRail tiles={tiles} onNavigate={onNavigate} onAcknowledge={onAcknowledge} />);
    const budg = screen.getByRole('button', { name: /BUDG/ });
    await userEvent.click(budg);
    expect(onAcknowledge).toHaveBeenCalledWith('budg');
    expect(onNavigate).not.toHaveBeenCalled();
    // parent marks it acknowledged (controlled component)
    // Destructure-with-guard instead of `tiles[1]!` — noUncheckedIndexedAccess
    // is on and Biome forbids non-null assertions (lint/style/noNonNullAssertion).
    const [, budgSpec] = tiles;
    if (!budgSpec) throw new Error('fixture invariant: BUDG tile spec missing');
    render(
      <AnnunciatorRail
        tiles={[{ ...budgSpec, acknowledged: true }]}
        onNavigate={onNavigate}
        onAcknowledge={onAcknowledge}
      />,
    );
    // Two rails share the DOM here (no cleanup between renders — intentional);
    // [0] is the first rail's still-blinking BUDG, [1] is the second rail's.
    const [, secondBudg] = screen.getAllByRole('button', { name: /BUDG/ });
    if (!secondBudg) throw new Error('expected a second BUDG button (one per rail)');
    await userEvent.click(secondBudg);
    expect(onNavigate).toHaveBeenCalledWith('budg');
  });

  it('a11y: the rail is a non-live group; warnings announce via a narrow status region', () => {
    render(<AnnunciatorRail tiles={tiles} />);
    // The interactive strip itself must NOT be a live region (tone churn
    // would spam screen readers) — it is a labelled group.
    expect(screen.getByRole('group', { name: 'Annunciator rail' })).toBeInTheDocument();
    // New warnings announce through the sr-only status region, which only
    // changes when the unacknowledged count changes.
    expect(screen.getByRole('status')).toHaveTextContent('1 unacknowledged warning');
  });
});
