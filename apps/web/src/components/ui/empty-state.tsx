'use client';

import { Inbox } from 'lucide-react';

export interface EmptyStateProps {
  reason: string;
  hint?: string;
}

export function EmptyState({ reason, hint }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <Inbox className="h-6 w-6 text-gray-300" />
      <p className="text-sm font-medium text-gray-600">{reason}</p>
      {hint && <p className="max-w-sm text-xs text-gray-400">{hint}</p>}
    </div>
  );
}
