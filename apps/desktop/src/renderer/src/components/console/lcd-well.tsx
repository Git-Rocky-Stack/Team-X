import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

type LcdTone = 'go' | 'amber' | 'red';

interface LcdWellProps extends HTMLAttributes<HTMLDivElement> {
  /** Phosphor tone: go (default green), amber (caution), red (hot values) */
  tone?: LcdTone;
}

/** Recessed phosphor LCD window — void-black in both shifts (DESIGN.md). */
export function LcdWell({ tone = 'go', className, ...props }: LcdWellProps) {
  return (
    <div
      className={cn('lcd', tone === 'amber' && 'lcd-amber', tone === 'red' && 'lcd-red', className)}
      {...props}
    />
  );
}
