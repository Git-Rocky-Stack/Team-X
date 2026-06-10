/**
 * VuMeter — render-layer tests (Sweep Phase 1, Task 10).
 *
 * Verifies the DOM contract on top of the pure math (vu-meter.test.ts):
 * an accessible `role="meter"` with the requested segment count and a
 * percentage `aria-valuenow` derived from the REAL signal, plus the
 * vertical-orientation axis flip. jsdom is opted in per-file via the
 * pragma below; the workspace vitest environment stays `node`.
 *
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { VuMeter } from './vu-meter';

// The workspace vitest config runs with `globals: false`, so Testing
// Library's automatic cleanup (which hooks a global `afterEach`) never
// registers — without this, each render leaks into the next test's DOM.
afterEach(cleanup);

describe('VuMeter render', () => {
  it('renders an accessible meter with the requested segment count', () => {
    const { container, getByRole } = render(
      <VuMeter value={0.5} segments={12} label="Token throughput" />,
    );
    const meter = getByRole('meter', { name: 'Token throughput' });
    expect(meter).toHaveAttribute('aria-valuenow', '50');
    expect(container.querySelectorAll('.vu-seg')).toHaveLength(12);
  });

  it('vertical orientation flips the axis', () => {
    const { getByRole } = render(<VuMeter value={0.2} orientation="vertical" label="VRAM" />);
    expect(getByRole('meter').className).toContain('flex-col-reverse');
  });
});
