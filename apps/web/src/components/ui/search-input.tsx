'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Search, X } from 'lucide-react';

const DEBOUNCE_MS = 300;

export interface SearchInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'value' | 'onChange'
  > {
  value: string;
  onChange: (value: string) => void;
  debounceMs?: number;
}

export function SearchInput({
  value,
  onChange,
  debounceMs = DEBOUNCE_MS,
  placeholder = 'Search...',
  className,
  ...props
}: SearchInputProps) {
  const [localValue, setLocalValue] = React.useState(value);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange(newValue);
      debounceRef.current = null;
    }, debounceMs);
  };

  const handleClear = () => {
    setLocalValue('');
    onChange('');
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  };

  return (
    <div className={cn('relative', className)}>
      <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
        <Search className="h-4 w-4" />
      </div>
      <input
        type="search"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        className={cn(
          'flex h-10 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-10 py-2 text-sm text-gray-900 placeholder:text-gray-500',
          'transition-colors focus:outline-none focus:ring-2 focus:ring-[#DC2626] focus:ring-offset-1 hover:border-gray-400',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
        aria-label="Search"
        {...props}
      />
      {localValue && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
