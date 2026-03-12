'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface LoadingProps {
  className?: string;
}

export function Loading({ className }: LoadingProps) {
  return (
    <div
      className={cn(
        'flex min-h-screen flex-col items-center justify-center gap-4',
        className
      )}
    >
      <Loader2
        className="h-10 w-10 animate-spin text-[#DC2626]"
        aria-hidden
      />
      <p className="text-sm font-medium text-gray-600">Loading...</p>
    </div>
  );
}
