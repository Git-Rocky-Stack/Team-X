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

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

  it('announces the zone band via aria-valuetext', () => {
    const { getByRole } = render(<VuMeter value={0.72} label="VRAM" />);
    expect(getByRole('meter')).toHaveAttribute('aria-valuetext', '72% — amber zone');
  });

  it('ballistics: the needle converges to a changed target and the loop stops', () => {
    // Drive the rAF loop by hand: queued callbacks + a manual clock.
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    let clock = 0;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => clock);

    try {
      const { container, rerender } = render(<VuMeter value={0} segments={10} label="Load" />);
      // At rest on the goal: the effect early-returns, no frame scheduled.
      expect(frames).toHaveLength(0);
      expect(container.querySelectorAll('[class*="vu-seg-"]')).toHaveLength(0);

      rerender(<VuMeter value={1} segments={10} label="Load" />);
      expect(frames.length).toBeGreaterThan(0);

      // TAU 65ms ⇒ snap-to-target within ~30 16ms steps; 40 is headroom.
      for (let i = 0; i < 40 && frames.length > 0; i++) {
        const tick = frames.shift() as FrameRequestCallback;
        clock += 16;
        act(() => tick(clock));
      }

      // Loop terminated (no re-scheduled frame) and every segment is lit.
      expect(frames).toHaveLength(0);
      expect(container.querySelectorAll('[class*="vu-seg-"]')).toHaveLength(10);
    } finally {
      vi.unstubAllGlobals();
      nowSpy.mockRestore();
    }
  });
});
