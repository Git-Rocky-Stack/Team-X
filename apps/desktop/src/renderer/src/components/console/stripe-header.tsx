import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface StripeHeaderProps {
  /** Departure-Mono module kicker, e.g. "MOD · LIBRARY · 03" */
  kicker: string;
  /** Optional serial stripe, e.g. "S/N · TX-2026-0610" */
  serial?: string;
  /** Trailing slot (typically a LampTile) */
  children?: ReactNode;
  className?: string;
}

/** Brushed-aluminum stripe header — top of every faceplate (DESIGN.md §Layout). */
export function StripeHeader({ kicker, serial, children, className }: StripeHeaderProps) {
  return (
    <div className={cn('stripe', className)}>
      <span className="whitespace-nowrap font-data text-[11px] uppercase tracking-[0.08em] text-[var(--silver)]">
        {kicker}
      </span>
      {serial ? (
        <span className="whitespace-nowrap font-data text-[10px] text-[var(--silver-mute)]">
          {serial}
        </span>
      ) : null}
      <span className="flex-1" />
      {children}
    </div>
  );
}
