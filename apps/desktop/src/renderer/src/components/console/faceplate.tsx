import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { HexBolt } from './hex-bolt';
import { StripeHeader } from './stripe-header';

interface FaceplateProps {
  /** Stripe kicker; stripe renders only when provided */
  kicker?: string;
  serial?: string;
  /** Trailing stripe slot (e.g. a LampTile) */
  stripeSlot?: ReactNode;
  /** Corner hex bolts (default true) */
  bolts?: boolean;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** Layer-1 raised faceplate: bolts → stripe → body (DESIGN.md §Depth). */
export function Faceplate({
  kicker,
  serial,
  stripeSlot,
  bolts = true,
  children,
  className,
  bodyClassName,
}: FaceplateProps) {
  return (
    <section className={cn('faceplate', className)}>
      {bolts ? (
        <>
          <HexBolt corner="tl" />
          <HexBolt corner="tr" />
          <HexBolt corner="bl" />
          <HexBolt corner="br" />
        </>
      ) : null}
      {kicker ? (
        <StripeHeader kicker={kicker} serial={serial}>
          {stripeSlot}
        </StripeHeader>
      ) : null}
      <div className={cn('relative p-[var(--sp-5)]', bodyClassName)}>{children}</div>
    </section>
  );
}
