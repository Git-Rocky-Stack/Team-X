import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

// Alerts are annunciator modules — dark display surfaces in BOTH shifts —
// so body text uses --display-fg (not --silver, which flips on Day) and
// the LED text/edge colors stay literal LED-family tokens.
const alertVariants = cva(
  'annunciator-module relative w-full rounded-control p-4 text-[var(--display-fg)] [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-[var(--display-fg)]',
  {
    variants: {
      variant: {
        default: '[&>svg]:text-led-scope [&_h5]:text-led-scope',
        destructive: 'border-[var(--led-warn-edge)] [&>svg]:text-led-warn [&_h5]:text-led-warn',
        warning: 'border-[var(--led-hold-edge)] [&>svg]:text-led-hold [&_h5]:text-led-hold',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    // eslint-disable-next-line jsx-a11y/heading-has-content -- content is passed via props.children
    <h5 ref={ref} className={cn('stencil mb-1 text-[11px] leading-none', className)} {...props} />
  ),
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-body-sm [&_p]:leading-relaxed', className)} {...props} />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
