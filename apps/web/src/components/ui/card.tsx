'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

// `title` is deliberately widened to ReactNode, so the DOM's string-only
// title attribute must be omitted from the base type rather than conflict.
export interface CardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, title, footer, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-xl border border-gray-200 bg-white shadow-sm',
          className
        )}
        {...props}
      >
        {title && (
          <div className="border-b border-gray-200 px-4 py-3 sm:px-6">
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          </div>
        )}
        <div className="p-4 sm:p-6">{children}</div>
        {footer && (
          <div className="border-t border-gray-200 px-4 py-3 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    );
  }
);

Card.displayName = 'Card';

export { Card };
