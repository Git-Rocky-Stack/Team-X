import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  /** Iosevka mono variant for refs / ids / timestamps. */
  mono?: boolean;
}

/**
 * Non-status category chip — the console replacement for a toneless or `mono`
 * MissionPill. Status (positive / caution / fault) must use LampTile instead;
 * a Tag is a neutral label only.
 */
export function Tag({ mono = false, className, children, ...props }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border border-[hsl(var(--hairline))] px-2.5 py-0.5 text-eyebrow-sm text-silver-mute',
        mono && 'font-mono tabular-nums',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
