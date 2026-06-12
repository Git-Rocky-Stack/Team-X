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
        // Tag tokens, not raw LEDs: badges ride shift surfaces (cards/plates),
        // so the text day-darkens for WCAG AA on silver. On Night Ops the
        // tokens resolve to the literal LED hexes — pixels unchanged.
        destructive: 'border-[var(--tag-warn-edge)] bg-[var(--warn-soft)] text-[var(--tag-warn)]',
        warning: 'border-[var(--tag-hold-edge)] bg-[var(--hold-soft)] text-[var(--tag-hold)]',
        outline: 'text-foreground',
        go: 'border-[var(--tag-go-edge)] bg-[var(--go-soft)] text-[var(--tag-go)]',
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
