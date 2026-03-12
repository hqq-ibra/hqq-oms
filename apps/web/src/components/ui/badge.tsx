'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export const ORDER_STATUS_VARIANTS = {
  NEW: 'bg-blue-100 text-blue-800',
  SAMPLE_RECEIVED: 'bg-purple-100 text-purple-800',
  CAD_DRAWING_READY: 'bg-indigo-100 text-indigo-800',
  SENT_TO_FACTORY: 'bg-orange-100 text-orange-800',
  MOLD_READY: 'bg-yellow-100 text-yellow-800',
  SILICONE_CASTING: 'bg-teal-100 text-teal-800',
  SHIPPED_FROM_FACTORY: 'bg-cyan-100 text-cyan-800',
  RECEIVED_LOCALLY: 'bg-emerald-100 text-emerald-800',
  SHIPPED_TO_CUSTOMER: 'bg-sky-100 text-sky-800',
  COMPLETED: 'bg-green-100 text-green-800',
} as const;

export type OrderStatusKey = keyof typeof ORDER_STATUS_VARIANTS;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: OrderStatusKey;
  children: React.ReactNode;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, children, ...props }, ref) => {
    const variantStyles = variant
      ? ORDER_STATUS_VARIANTS[variant]
      : 'bg-gray-100 text-gray-800';

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
          variantStyles,
          className
        )}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

export { Badge };
