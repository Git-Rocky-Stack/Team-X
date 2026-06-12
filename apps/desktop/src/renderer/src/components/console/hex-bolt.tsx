import { cn } from '@/lib/utils';

type Corner = 'tl' | 'tr' | 'bl' | 'br';

/** Decorative 3-layer hex socket cap bolt (DESIGN.md §Depth). */
export function HexBolt({ corner, className }: { corner: Corner; className?: string }) {
  return <i aria-hidden="true" className={cn('hex', `hex-${corner}`, className)} tabIndex={-1} />;
}
