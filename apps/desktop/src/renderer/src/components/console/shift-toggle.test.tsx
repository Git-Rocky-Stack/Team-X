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
import './test-setup';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ShiftToggle } from './shift-toggle';

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

  it('fires onToggle(night) when on day shift — both directions of `next`', async () => {
    const onToggle = vi.fn();
    render(<ShiftToggle shift="day" onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledWith('night');
  });

  it('the LED is functional: lit amber on Day Shift, dark socket on Night Ops', () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- intentional no-op: this test asserts the LED, not the toggle
    const { container, rerender } = render(<ShiftToggle shift="day" onToggle={() => {}} />);
    const led = () => container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(led().className).toContain('bg-led-hold');
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- intentional no-op: this test asserts the LED, not the toggle
    rerender(<ShiftToggle shift="night" onToggle={() => {}} />);
    expect(led().className).not.toContain('bg-led-hold');
  });
});
