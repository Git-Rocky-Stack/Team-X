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

/** Pure segment computation — exported for tests and for static renders. */
export function segmentStates(value: number, count: number): VuSegment[] {
  const litCount = Math.round(clamp01(value) * count);
  // count <= 0 is safe by construction: Array.from({ length: 0 | negative })
  // yields [] and the position division is never evaluated.
  return Array.from({ length: count }, (_, i) => {
    const position = (i + 1) / count;
    const zone: VuZone = position <= GREEN_CEIL ? 'g' : position <= AMBER_CEIL ? 'a' : 'r';
    return { lit: i < litCount, zone, tip: litCount > 0 && i === litCount - 1 };
  });
}

/** One integration step of the meter needle toward `target` over `dtMs`. */
export function ballisticsStep(current: number, target: number, dtMs: number): number {
  if (current === target) return current;
  const alpha = 1 - Math.exp(-dtMs / TAU_MS);
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
  // so AT users get the green/amber/red semantics sighted users see.
  const pct = Math.round(clamp01(value) * 100);
  const zoneWord = pct <= GREEN_CEIL * 100 ? 'green' : pct <= AMBER_CEIL * 100 ? 'amber' : 'red';
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
