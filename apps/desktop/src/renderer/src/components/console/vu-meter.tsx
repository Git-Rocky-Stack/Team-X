import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

export type VuZone = 'g' | 'a' | 'r';

export interface VuSegment {
  lit: boolean;
  zone: VuZone;
  tip: boolean;
}

const GREEN_CEIL = 0.6;
const AMBER_CEIL = 0.85;
/** Time constant ≈ 65ms ⇒ ~99% of a step change indicated within 300ms (IEC-style integration). */
const TAU_MS = 65;

// Non-finite signals (NaN/±Infinity from a stalled source) clamp to 0:
// a dark meter, a valid aria-valuenow, AND a terminating ballistics loop
// (NaN !== NaN would otherwise keep the rAF loop alive forever).
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/**
 * Hardware meters top out well below this (DESIGN.md meters run 10–20
 * segments) — the cap exists so a bad `segments` prop (Infinity throws in
 * Array.from; 1e9 allocation-bombs the renderer) degrades to a wide meter
 * instead of freezing the console. Fractional counts floor to whole
 * segments so the tip index stays reachable.
 */
const MAX_SEGMENTS = 64;
const sanitizeCount = (count: number) =>
  Number.isFinite(count) ? Math.min(MAX_SEGMENTS, Math.max(0, Math.floor(count))) : 0;

/** Zone banding shared by the segments and the AT announcement. */
const zoneAt = (position: number): VuZone =>
  position <= GREEN_CEIL ? 'g' : position <= AMBER_CEIL ? 'a' : 'r';

/** Pure segment computation — exported for tests and for static renders. */
export function segmentStates(value: number, count: number): VuSegment[] {
  const n = sanitizeCount(count);
  const litCount = Math.round(clamp01(value) * n);
  // n === 0 is safe by construction: Array.from({ length: 0 }) yields []
  // and the position division is never evaluated.
  return Array.from({ length: n }, (_, i) => ({
    lit: i < litCount,
    zone: zoneAt((i + 1) / n),
    tip: litCount > 0 && i === litCount - 1,
  }));
}

/** One integration step of the meter needle toward `target` over `dtMs`. */
export function ballisticsStep(current: number, target: number, dtMs: number): number {
  if (current === target) return current;
  // rAF can hand a tick a frame-start timestamp that precedes the
  // performance.now() captured at schedule time — a negative dt would flip
  // alpha's sign and integrate AWAY from the target for that frame.
  const alpha = 1 - Math.exp(-Math.max(0, dtMs) / TAU_MS);
  const next = current + (target - current) * alpha;
  return Math.abs(next - target) < 0.001 ? target : next;
}

function useVuBallistics(target: number): number {
  const [displayed, setDisplayed] = useState(() => clamp01(target));
  const displayedRef = useRef(displayed);
  displayedRef.current = displayed;

  useEffect(() => {
    const goal = clamp01(target);
    if (displayedRef.current === goal) return;
    // Reduced motion: the meter stays functional but the needle snaps —
    // the CSS reduced-motion block only kills keyframe animations, so the
    // rAF sweep must opt out here too. Re-read per target change (no
    // listener needed). jsdom's stock matchMedia reports matches:false,
    // so tests stay on the animated path unless they stub it.
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setDisplayed(goal);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const next = ballisticsStep(displayedRef.current, goal, dt);
      setDisplayed(next);
      if (next !== goal) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return displayed;
}

interface VuMeterProps {
  /**
   * The REAL signal, normalized 0–1. VU meters are functional-only
   * (DESIGN.md §VU Discipline) — never mount one without a live data source.
   */
  value: number;
  segments?: number;
  orientation?: 'horizontal' | 'vertical';
  /** Accessible name for the meter, e.g. "Token throughput" */
  label: string;
  className?: string;
}

export function VuMeter({
  value,
  segments = 16,
  orientation = 'horizontal',
  label,
  className,
}: VuMeterProps) {
  const displayed = useVuBallistics(value);
  const segs = segmentStates(displayed, segments);
  // Announce the REAL signal (never the animated needle) + its zone band,
  // so AT users get the green/amber/red semantics sighted users see. The
  // zone derives from the same quantized tip position the segments use —
  // a rounded-pct zone can contradict the rendered tip at band boundaries
  // (value 0.604 → pct 60 reads "green" while the tip at 10/16 lights amber).
  const real = clamp01(value);
  const pct = Math.round(real * 100);
  const segCount = segs.length; // sanitized by segmentStates — never raw `segments`
  const litCount = Math.round(real * segCount);
  const tipZone: VuZone = litCount > 0 ? zoneAt(litCount / segCount) : 'g';
  const zoneWord = { g: 'green', a: 'amber', r: 'red' }[tipZone];
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={`${pct}% — ${zoneWord} zone`}
      className={cn(
        'flex gap-[2px]',
        orientation === 'horizontal'
          ? 'h-[14px] items-stretch'
          : 'h-[72px] w-[14px] flex-col-reverse',
        className,
      )}
    >
      {segs.map((seg, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional by definition
          key={i}
          className={cn(
            'vu-seg min-h-[3px] min-w-[4px] flex-1',
            seg.lit && seg.zone === 'g' && 'vu-seg-g',
            seg.lit && seg.zone === 'a' && 'vu-seg-a',
            seg.lit && seg.zone === 'r' && 'vu-seg-r',
            seg.tip && 'animate-vu-tip',
          )}
        />
      ))}
    </div>
  );
}
