/**
 * Tag — console category chip render tests (Sweep Phase 4a, Task 3).
 *
 * The `mono` case used to assert only that the label text was in the
 * document, which `<Tag>` and `<Tag mono>` both satisfy — the test could not
 * fail if `mono` were dropped entirely. It now asserts the class the prop
 * actually controls, in both directions.
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
    const tag = screen.getByText('ticket-123');
    expect(tag).toHaveClass('font-mono');
    // Ids and timestamps must not reflow as digits change.
    expect(tag).toHaveClass('tabular-nums');
  });

  it('omits the mono classes by default', () => {
    render(<Tag>operator</Tag>);
    const tag = screen.getByText('operator');
    expect(tag).not.toHaveClass('font-mono');
    expect(tag).not.toHaveClass('tabular-nums');
  });

  it('keeps the neutral chip classes in both variants', () => {
    render(
      <>
        <Tag>plain</Tag>
        <Tag mono>mono</Tag>
      </>,
    );
    for (const label of ['plain', 'mono']) {
      expect(screen.getByText(label)).toHaveClass('rounded-pill', 'text-silver-mute');
    }
  });
});
