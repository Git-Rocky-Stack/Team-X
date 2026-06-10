/**
 * LampTile — stencil word-lamp rendering tests (Sweep Phase 1, Task 9).
 *
 * Verifies DESIGN.md's dual-form red rule as rendered DOM: a steady lamp
 * burns its tone class, an unacknowledged alert blinks at 1Hz AND becomes
 * an actionable <button> (the click-to-acknowledge ritual), and an
 * acknowledged alert burns steady again. Reduced-motion legibility is
 * covered by the UNACK affix, which exposes the unacknowledged state by
 * form rather than animation. jsdom is opted in per-file via the pragma
 * below; the workspace vitest environment stays `node`.
 *
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LampTile } from './lamp-tile';

// The workspace vitest config runs with `globals: false`, so Testing
// Library's automatic cleanup (which hooks a global `afterEach`) never
// registers — without this, each render leaks into the next test's DOM
// and the BUDG/UNACK queries collide across tests.
afterEach(cleanup);

describe('LampTile', () => {
  it('renders the stencil word', () => {
    render(<LampTile label="GO" tone="go" />);
    expect(screen.getByText('GO')).toBeInTheDocument();
  });

  it('applies the tone class', () => {
    const { container } = render(<LampTile label="HOLD" tone="hold" />);
    expect((container.firstElementChild as HTMLElement).className).toContain('lamp-hold');
  });

  it('unlit by default (off tone has no LED class)', () => {
    const { container } = render(<LampTile label="STBY" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('lamp');
    expect(el.className).not.toMatch(/lamp-(go|hold|warn|exec|armed)/);
  });

  it('dual-form rule: unacknowledged alert blinks and is an actionable button', async () => {
    const onAcknowledge = vi.fn();
    render(<LampTile label="BUDG" tone="warn" alert onAcknowledge={onAcknowledge} />);
    const lamp = screen.getByRole('button', { name: /BUDG.*unacknowledged/i });
    expect(lamp.className).toContain('animate-lamp-blink');
    await userEvent.click(lamp);
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
  });

  it('dual-form rule: acknowledged alert burns steady (no blink)', () => {
    render(<LampTile label="BUDG" tone="warn" alert acknowledged />);
    const lamp = screen.getByText('BUDG').closest('[class*="lamp"]') as HTMLElement;
    expect(lamp.className).not.toContain('animate-lamp-blink');
    expect(lamp.className).toContain('lamp-warn');
  });

  it('non-alert lamps are not buttons', () => {
    render(<LampTile label="EXEC" tone="exec" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('reduced-motion fallback: UNACK affix present while unacknowledged', () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- intentional no-op: this test asserts the affix, not the ack
    render(<LampTile label="NET" tone="warn" alert onAcknowledge={() => {}} />);
    expect(screen.getByText('UNACK')).toBeInTheDocument();
  });
});
