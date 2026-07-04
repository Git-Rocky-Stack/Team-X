import { cn } from '@/lib/utils';

type Corner = 'tl' | 'tr' | 'bl' | 'br';

/**
 * Static corner → class map. Tailwind only emits `@layer components`
 * recipes whose literal class names appear in scanned source; building the
 * corner class from a template literal got .hex-tr/.hex-bl/.hex-br purged
 * from the built CSS, stacking three unpositioned bolts on every
 * faceplate's top-left corner. All four literals must stay spelled out.
 */
const CORNER_CLASS: Record<Corner, string> = {
  tl: 'hex-tl',
  tr: 'hex-tr',
  bl: 'hex-bl',
  br: 'hex-br',
};

/** Decorative 3-layer hex socket cap bolt (DESIGN.md §Depth). */
export function HexBolt({ corner, className }: { corner: Corner; className?: string }) {
  return (
    <i aria-hidden="true" className={cn('hex', CORNER_CLASS[corner], className)} tabIndex={-1} />
  );
}
