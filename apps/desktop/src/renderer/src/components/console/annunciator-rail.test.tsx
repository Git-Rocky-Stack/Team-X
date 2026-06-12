/**
 * AnnunciatorRail — persistent lamp-strip behavior tests (Sweep Phase 1,
 * Task 11; hardened in the Stage 2 review pass).
 *
 * Verifies DESIGN.md's annunciator contract as rendered DOM: every tile
 * renders in spec order on the dark strip, lit steady tiles teleport to
 * their source view via onNavigate(id), unlit tiles are inert (no button
 * role), and alert tiles follow the master-caution ritual on ONE stable
 * button — first activation acknowledges, the next teleports, and element
 * identity (keyboard focus) survives the whole ritual. jsdom is opted in
 * per-file via the pragma below; the workspace vitest environment stays
 * `node`.
 *
 * @vitest-environment jsdom
 */
import './test-setup';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AnnunciatorRail, type AnnunciatorTileSpec } from './annunciator-rail';

const tiles: AnnunciatorTileSpec[] = [
  { id: 'sys', label: 'SYS', tone: 'go' },
  { id: 'budg', label: 'BUDG', tone: 'warn', alert: true },
  { id: 'net', label: 'NET', tone: 'off' },
];

describe('AnnunciatorRail', () => {
  it('renders every tile in spec order on the dark strip', () => {
    const { container } = render(<AnnunciatorRail tiles={tiles} />);
    const labels = Array.from(container.querySelectorAll('[class*="lamp"]')).map(
      (n) => n.textContent ?? '',
    );
    const at = (word: string) => labels.findIndex((l) => l.includes(word));
    expect(at('SYS')).toBeGreaterThanOrEqual(0);
    expect(at('SYS')).toBeLessThan(at('BUDG'));
    expect(at('BUDG')).toBeLessThan(at('NET'));
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

  it('master-caution ritual on ONE stable button: ack, focus retained, then navigate', async () => {
    const onNavigate = vi.fn();
    const onAcknowledge = vi.fn();
    const { rerender } = render(
      <AnnunciatorRail tiles={tiles} onNavigate={onNavigate} onAcknowledge={onAcknowledge} />,
    );
    const budg = screen.getByRole('button', { name: /BUDG.*unacknowledged/i });
    await userEvent.click(budg);
    expect(onAcknowledge).toHaveBeenCalledWith('budg');
    expect(onNavigate).not.toHaveBeenCalled();
    // Parent marks it acknowledged (controlled component) — same rail.
    rerender(
      <AnnunciatorRail
        tiles={tiles.map((t) => (t.id === 'budg' ? { ...t, acknowledged: true } : t))}
        onNavigate={onNavigate}
        onAcknowledge={onAcknowledge}
      />,
    );
    const budgAfter = screen.getByRole('button', { name: /BUDG.*open source view/i });
    // Element identity preserved through the ack — keyboard focus survives.
    expect(budgAfter).toBe(budg);
    expect(document.activeElement).toBe(budg);
    await userEvent.click(budgAfter);
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

  it('status region is empty with no unacknowledged warnings and pluralizes for several', () => {
    const { rerender } = render(
      <AnnunciatorRail tiles={[{ id: 'sys', label: 'SYS', tone: 'go' }]} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('');
    rerender(
      <AnnunciatorRail
        tiles={[
          { id: 'a', label: 'AAA', tone: 'warn', alert: true },
          { id: 'b', label: 'BBB', tone: 'hold', alert: true },
        ]}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('2 unacknowledged warnings');
  });

  it('an alert tile with tone off is coerced to a VISIBLE warn blink', () => {
    const onAcknowledge = vi.fn();
    render(
      <AnnunciatorRail
        tiles={[{ id: 'x', label: 'XOFF', tone: 'off', alert: true }]}
        onAcknowledge={onAcknowledge}
      />,
    );
    const host = screen.getByRole('button', { name: /XOFF.*unacknowledged/i });
    const lamp = host.querySelector('[class*="lamp"]') as HTMLElement;
    expect(lamp.className).toContain('lamp-warn');
    expect(lamp.className).toContain('animate-lamp-blink');
  });

  it('a blinking tile with no onAcknowledge handler is aria-disabled, never a silent dead end', async () => {
    const onNavigate = vi.fn();
    render(<AnnunciatorRail tiles={tiles} onNavigate={onNavigate} />);
    const budg = screen.getByRole('button', { name: /BUDG.*unacknowledged/i });
    expect(budg).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(budg);
    // Blinking blocks teleport even when navigation is wired.
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
