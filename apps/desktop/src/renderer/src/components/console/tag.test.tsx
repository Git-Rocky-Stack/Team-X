/**
 * Tag — console category chip render tests (Sweep Phase 4a, Task 3).
 *
 * @vitest-environment jsdom
 */
import './test-setup';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Tag } from './index';

describe('Tag (console)', () => {
  it('renders its label', () => {
    render(<Tag>operator</Tag>);
    expect(screen.getByText('operator')).toBeInTheDocument();
  });

  it('renders a mono variant for refs/ids', () => {
    render(<Tag mono>ticket-123</Tag>);
    expect(screen.getByText('ticket-123')).toBeInTheDocument();
  });
});
