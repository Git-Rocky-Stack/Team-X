/**
 * ShiftToggle — Night Ops / Day Shift switch tests (Sweep Phase 1, Task 11).
 *
 * Verifies the dual-shift contract (DESIGN.md): the cap names the CURRENT
 * shift and the switch TARGET, aria-pressed tracks Day Shift as the
 * "pressed" state, and a click fires onToggle with the opposite shift.
 * Presentation-only — persistence stays in the company theme setting.
 * jsdom is opted in per-file via the pragma below; the workspace vitest
 * environment stays `node`.
 *
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ShiftToggle } from './shift-toggle';

// The workspace vitest config runs with `globals: false`, so Testing
// Library's automatic cleanup (which hooks a global `afterEach`) never
// registers — without this, each render leaks into the next test's DOM
// and the single-button queries collide across tests.
afterEach(cleanup);

describe('ShiftToggle', () => {
  it('shows the current shift and the switch target', () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- intentional no-op: this test asserts rendering, not the toggle
    render(<ShiftToggle shift="night" onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: /day shift/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });

  it('day shift state', () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- intentional no-op: this test asserts rendering, not the toggle
    render(<ShiftToggle shift="day" onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: /night ops/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('fires onToggle with the opposite shift', async () => {
    const onToggle = vi.fn();
    render(<ShiftToggle shift="night" onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledWith('day');
  });
});
