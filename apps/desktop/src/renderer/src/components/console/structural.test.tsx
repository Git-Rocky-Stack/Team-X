/**
 * Console structural primitives — rendering tests (Sweep Phase 1, Task 8).
 *
 * First jsdom + Testing Library suite in the repo: unlike the legacy
 * source-string audits (see `app/top-bar.test.tsx`), these primitives
 * are pure presentational composition — the behavior under test IS the
 * rendered DOM (a11y hiding, slot wiring, conditional bolts/stripe,
 * tone classes), so real rendering is the honest assertion surface.
 * jsdom is opted in per-file via the pragma below; the workspace
 * vitest environment stays `node`.
 *
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Faceplate } from './faceplate';
import { HexBolt } from './hex-bolt';
import { LcdWell } from './lcd-well';
import { RecessedWell } from './recessed-well';
import { StripeHeader } from './stripe-header';

describe('HexBolt', () => {
  it('renders a decorative bolt hidden from the a11y tree', () => {
    const { container } = render(<HexBolt corner="tl" />);
    const bolt = container.firstElementChild as HTMLElement;
    expect(bolt).toHaveAttribute('aria-hidden', 'true');
    expect(bolt.className).toContain('hex');
    expect(bolt.className).toContain('hex-tl');
  });
});

describe('StripeHeader', () => {
  it('renders kicker, serial, and trailing slot', () => {
    render(
      <StripeHeader kicker="MOD · LIBRARY · 03" serial="S/N · TX-2026-0610">
        <span data-testid="trail">lamp</span>
      </StripeHeader>,
    );
    expect(screen.getByText('MOD · LIBRARY · 03')).toBeInTheDocument();
    expect(screen.getByText('S/N · TX-2026-0610')).toBeInTheDocument();
    expect(screen.getByTestId('trail')).toBeInTheDocument();
  });
});

describe('Faceplate', () => {
  it('renders four corner bolts, a stripe when kicker given, and children', () => {
    const { container } = render(
      <Faceplate kicker="MOD · TEST · 01">
        <p>body content</p>
      </Faceplate>,
    );
    expect(container.querySelectorAll('.hex')).toHaveLength(4);
    expect(screen.getByText('MOD · TEST · 01')).toBeInTheDocument();
    expect(screen.getByText('body content')).toBeInTheDocument();
  });

  it('omits bolts and stripe when disabled', () => {
    const { container } = render(
      <Faceplate bolts={false}>
        <p>plain</p>
      </Faceplate>,
    );
    expect(container.querySelectorAll('.hex')).toHaveLength(0);
    expect(container.querySelector('.stripe')).toBeNull();
  });
});

describe('RecessedWell', () => {
  it('applies the well recipe and forwards className', () => {
    const { container } = render(<RecessedWell className="p-4">w</RecessedWell>);
    const well = container.firstElementChild as HTMLElement;
    expect(well.className).toContain('well');
    expect(well.className).toContain('p-4');
  });
});

describe('LcdWell', () => {
  it('renders phosphor-green by default and tones via prop', () => {
    const { container, rerender } = render(<LcdWell>42 TOK/MIN</LcdWell>);
    expect((container.firstElementChild as HTMLElement).className).toContain('lcd');
    rerender(<LcdWell tone="amber">HOT</LcdWell>);
    expect((container.firstElementChild as HTMLElement).className).toContain('lcd-amber');
    rerender(<LcdWell tone="red">$9.99/HR</LcdWell>);
    expect((container.firstElementChild as HTMLElement).className).toContain('lcd-red');
  });
});
