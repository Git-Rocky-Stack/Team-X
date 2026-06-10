import { type VariantProps, cva } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-control border px-2 py-0.5 font-display text-[10px] font-[700] uppercase tracking-[0.08em] [font-variation-settings:"wdth"_110] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-border bg-secondary text-secondary-foreground',
        destructive: 'border-[rgba(255,68,56,0.4)] bg-[var(--warn-soft)] text-led-warn',
        warning: 'border-[rgba(255,176,0,0.35)] bg-[var(--hold-soft)] text-led-hold',
        outline: 'text-foreground',
        go: 'border-[rgba(65,226,94,0.35)] bg-[var(--go-soft)] text-led-go',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
