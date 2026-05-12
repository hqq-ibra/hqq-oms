'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { PRIORITY_COLOR, PRIORITY_LABEL, type TodoPriority } from '../_types';

export function PriorityPill({
  value,
  onChange,
  disabled,
  compact = false,
}: {
  value: TodoPriority;
  onChange: (next: TodoPriority) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const colors = PRIORITY_COLOR[value];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={cn(
          compact
            ? cn(
                'h-4 w-4 shrink-0 rounded-full shadow-sm ring-2 ring-white',
                colors.bg,
                'disabled:opacity-50',
              )
            : cn(
                'inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide min-w-[64px] h-[28px]',
                colors.bg,
                colors.text,
                'disabled:opacity-50',
              ),
        )}
        aria-label={`Priority: ${PRIORITY_LABEL[value]}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {compact ? null : PRIORITY_LABEL[value]}
      </button>

      {open && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/30 sm:hidden"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            className={cn(
              'sm:absolute sm:top-full sm:start-0 sm:mt-1 sm:w-36 sm:rounded-lg sm:shadow-xl sm:border sm:border-gray-200 sm:bg-white',
              'fixed bottom-0 inset-x-0 z-50 rounded-t-2xl bg-white shadow-2xl sm:bottom-auto sm:inset-x-auto',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 space-y-1">
              {(Object.keys(PRIORITY_LABEL) as TodoPriority[]).map((p) => {
                const c = PRIORITY_COLOR[p];
                const active = p === value;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(false);
                      if (p !== value) onChange(p);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-3 py-3 text-sm',
                      active ? 'bg-gray-100' : 'hover:bg-gray-50',
                    )}
                  >
                    <span className={cn('h-3 w-3 rounded-full', c.bg)} />
                    <span className="font-medium text-gray-800">{PRIORITY_LABEL[p]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
