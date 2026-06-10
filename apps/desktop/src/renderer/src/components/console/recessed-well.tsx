import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/** Layer-2 recessed well — always dark in both shifts (DESIGN.md). */
export function RecessedWell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('well', className)} {...props} />;
}
