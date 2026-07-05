/**
 * SubviewState — console render tests (Sweep Phase 4a, Task 1).
 *
 * Promoted from features/dashboard into the console library so the autonomy
 * cluster can share the recessed-well empty/error state.
 *
 * @vitest-environment jsdom
 */
import './test-setup';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SubviewState } from './index';

describe('SubviewState (console)', () => {
  it('renders the lamp label, title, and description', () => {
    render(
      <SubviewState lampLabel="STBY" lampTone="off" title="Nothing here" description="Empty." />,
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByText('Empty.')).toBeInTheDocument();
    expect(screen.getByText('STBY')).toBeInTheDocument();
  });

  it('forwards testId to the well', () => {
    render(<SubviewState testId="probe" lampLabel="NO-GO" lampTone="nogo" title="Fault" />);
    expect(screen.getByTestId('probe')).toBeInTheDocument();
  });

  it('merges a compact className override, dropping the default floor', () => {
    render(
      <SubviewState
        testId="probe"
        lampLabel="STBY"
        lampTone="off"
        title="Compact"
        className="min-h-0 p-4"
      />,
    );
    const well = screen.getByTestId('probe');
    expect(well.className).toContain('min-h-0');
    expect(well.className).toContain('p-4');
    // twMerge must retire the defaults, not stack conflicting utilities.
    expect(well.className).not.toContain('min-h-[12rem]');
    expect(well.className).not.toContain('p-8');
  });
});
