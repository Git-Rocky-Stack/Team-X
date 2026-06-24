/**
 * MetricTile — console readout render tests (Sweep Phase 4a, Task 2).
 *
 * @vitest-environment jsdom
 */
import './test-setup';

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MetricTile } from './index';

describe('MetricTile (console)', () => {
  it('renders label, value, and hint', () => {
    render(<MetricTile label="Operators" value="4" hint="human supervisors" />);
    expect(screen.getByText('Operators')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('human supervisors')).toBeInTheDocument();
  });

  it('renders as a button and fires onClick when interactive', () => {
    const onClick = vi.fn();
    render(<MetricTile label="Open" value="2" onClick={onClick} />);
    screen.getByRole('button').click();
    expect(onClick).toHaveBeenCalledOnce();
  });
});
