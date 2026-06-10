import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const alertVariants = cva(
  'annunciator-module relative w-full rounded-control p-4 text-[#B3B3B3] [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-[#B3B3B3]',
  {
    variants: {
      variant: {
        default: '[&>svg]:text-led-scope [&_h5]:text-led-scope',
        destructive: 'border-[rgba(255,68,56,0.4)] [&>svg]:text-led-warn [&_h5]:text-led-warn',
        warning: 'border-[rgba(255,176,0,0.35)] [&>svg]:text-led-hold [&_h5]:text-led-hold',
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
    <h5
      ref={ref}
      className={cn(
        'mb-1 font-display text-[11px] font-[750] uppercase tracking-[0.1em] leading-none',
        className,
      )}
      {...props}
    />
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
